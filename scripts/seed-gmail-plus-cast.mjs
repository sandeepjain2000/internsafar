/**
 * Populate Internship Portal core sample data (accounts + transactions).
 * Called by reset-ip-core-sample.mjs after test clutter is removed.
 *
 * Core emails/names: scripts/lib/ipCoreSampleConfig.js (edit that file only).
 *
 * Usage:
 *   node scripts/seed-gmail-plus-cast.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const {
  SUPERADMIN_EMAIL,
  DEMO_PASSWORD,
  CAND_BASE,
  CAND_BASE_NAME,
  EMP_BASE,
  EMP_BASE_NAME,
  CAST_CANDIDATES,
  CAST_EMPLOYERS,
  pendingCastEmployer,
} = require('./lib/ipCoreSampleConfig.js');
const content = require('./lib/ipTestDataContent.js');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const PASSWORD = DEMO_PASSWORD;
const SA_EMAIL = SUPERADMIN_EMAIL;

function nid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function refCode(email) {
  const local = String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
  return `R${local}${String(Date.now()).slice(-4)}`;
}

async function ensureUser(client, { email, role, name, points = 80 }) {
  const existing = await client.query(`SELECT id FROM ip_users WHERE lower(email) = lower($1)`, [email]);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE ip_users SET name = $2, active = true, points = GREATEST(points, $3), updated_at = now() WHERE id = $1`,
      [existing.rows[0].id, name, points],
    );
    return { id: existing.rows[0].id, created: false };
  }
  const hash = await bcrypt.hash(PASSWORD, 10);
  const id = nid('ip_user');
  await client.query(
    `INSERT INTO ip_users (id, email, password_hash, role, name, points, free_post_credits,
      application_allowance, referral_code, profile_complete, active)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,true,true)`,
    [id, email.toLowerCase(), hash, role, name, points, refCode(email)],
  );
  return { id, created: true };
}

async function ensureCandidate(client, userId, email, name, extras = {}) {
  const ex = await client.query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [userId]);
  if (ex.rows[0]) return ex.rows[0].id;
  const id = nid('ip_cand');
  await client.query(
    `INSERT INTO ip_candidates (
       id, user_id, name, email, phone, college, degree, specialization, study_status,
       graduation_year, cgpa, city, state, skills, preferred_work_mode, preferred_locations,
       resume_url, linkedin_url, github_url, personal_website, prior_experience, searchable, show_profile_picture
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,true,true)`,
    [
      id,
      userId,
      name,
      email.toLowerCase(),
      extras.phone || '9000000001',
      extras.college || 'VIT',
      extras.degree || 'B.Tech',
      extras.specialization || 'CSE',
      extras.study_status || 'Studying',
      extras.graduation_year || 2027,
      extras.cgpa || '8.4',
      extras.city || 'Vellore',
      extras.state || 'Tamil Nadu',
      extras.skills || ['JavaScript', 'React', 'SQL'],
      extras.preferred_work_mode || 'Remote',
      extras.preferred_locations || ['Remote', 'Bengaluru'],
      extras.resume_url || 'https://example.com/resume.pdf',
      extras.linkedin_url || null,
      extras.github_url || null,
      extras.personal_website || null,
      extras.prior_experience || content.experienceEntriesJsonAt(Date.now() % 50),
    ],
  );
  return id;
}

async function ensureEmployer(client, userId, email, company, status = 'approved') {
  const ex = await client.query(`SELECT id FROM ip_employers WHERE user_id = $1`, [userId]);
  if (ex.rows[0]) {
    await client.query(
      `UPDATE ip_employers SET approval_status = $2, company_name = $3, contact_name = $3, about = $4, updated_at = now() WHERE id = $1`,
      [ex.rows[0].id, status, company, `${company} is a hiring partner on PlacementHub.`],
    );
    return ex.rows[0].id;
  }
  const id = nid('ip_emp');
  const domain = String(email).split('@')[1] || 'example.com';
  await client.query(
    `INSERT INTO ip_employers (
       id, user_id, company_name, brand_name, website, work_email, industry, company_size,
       hq_city, hq_state, about, contact_name, contact_designation, contact_phone,
       approval_status, show_identity_on_posting, ethics_acks, ethics_accepted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16::jsonb,now())`,
    [
      id,
      userId,
      company,
      company.split(' ')[0],
      `https://${domain}`,
      email.toLowerCase(),
      'Technology',
      '51-200',
      'Hyderabad',
      'Telangana',
      `${company} is a hiring partner on PlacementHub.`,
      company,
      'HR Lead',
      '9000000099',
      status,
      JSON.stringify({ no_fees: true, accurate_info: true, data_privacy: true }),
    ],
  );
  return id;
}

async function ensureDoc(client, employerId, docType, status = 'approved') {
  const ex = await client.query(
    `SELECT id FROM ip_employer_documents WHERE employer_id = $1 AND doc_type = $2 LIMIT 1`,
    [employerId, docType],
  );
  if (ex.rows[0]) {
    await client.query(
      `UPDATE ip_employer_documents SET review_status = $2, reviewed_at = now() WHERE id = $1`,
      [ex.rows[0].id, status],
    );
    return;
  }
  await client.query(
    `INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url, review_status, reviewed_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())`,
    [
      nid('ip_edoc'),
      employerId,
      docType,
      `${docType.replace(/\s+/g, '_')}.pdf`,
      '/sample-docs/sample-shop-act.pdf',
      status,
    ],
  );
}

async function ensureInternship(client, employerId, title, status = 'published', index = 0) {
  const ex = await client.query(
    `SELECT id FROM ip_internships WHERE employer_id = $1 AND title = $2 LIMIT 1`,
    [employerId, title],
  );
  if (ex.rows[0]) return ex.rows[0].id;
  const id = nid('ip_int');
  const city = content.pick(content.CITIES, index);
  // Live schedule so candidate Browse (CANDIDATE_VISIBLE) shows the row immediately.
  await client.query(
    `INSERT INTO ip_internships (
       id, employer_id, title, description, location, work_mode, stipend_inr, duration_months,
       eligibility, questions, status, show_employer_identity, engagement_type, stipend_type,
       locations, starts_at, apply_ends_at, start_date
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,true,'full_time','fixed',
       $12::jsonb, now() - interval '2 hours', now() + interval '28 days',
       CURRENT_DATE + $13::int
     )`,
    [
      id,
      employerId,
      title,
      content.internshipDescription(title, EMP_BASE_NAME, city, index),
      city,
      content.pick(content.WORK_MODES, index),
      12000 + (index % 5) * 2000,
      3,
      JSON.stringify(content.internshipEligibilityAt(index)),
      JSON.stringify([{ id: 'q1', prompt: 'Why this role?', type: 'textarea' }]),
      status,
      JSON.stringify([city]),
      5 + (index % 16),
    ],
  );
  return id;
}

async function ensureApplication(client, internshipId, candidateId, status = 'applied', match = 80) {
  const ex = await client.query(
    `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2`,
    [internshipId, candidateId],
  );
  if (ex.rows[0]) {
    await client.query(`UPDATE ip_applications SET status = $2, match_score = $3 WHERE id = $1`, [
      ex.rows[0].id,
      status,
      match,
    ]);
    return ex.rows[0].id;
  }
  const id = nid('ip_app');
  await client.query(
    `INSERT INTO ip_applications (id, internship_id, candidate_id, status, match_score, answers)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [id, internshipId, candidateId, status, match, JSON.stringify({ q1: 'Excited to contribute.' })],
  );
  return id;
}

async function ensureThread(client, internshipId, candidateUserId, employerUserId, texts) {
  let thr = await client.query(
    `SELECT id FROM ip_message_threads
     WHERE internship_id = $1 AND candidate_user_id = $2 AND employer_user_id = $3 LIMIT 1`,
    [internshipId, candidateUserId, employerUserId],
  );
  let threadId = thr.rows[0]?.id;
  if (!threadId) {
    threadId = nid('ip_thr');
    await client.query(
      `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
       VALUES ($1,$2,$3,$4,$5)`,
      [threadId, internshipId, candidateUserId, employerUserId, 'Internship conversation'],
    );
  }
  const count = await client.query(`SELECT count(*)::int AS n FROM ip_messages WHERE thread_id = $1`, [threadId]);
  if (Number(count.rows[0]?.n || 0) === 0) {
    for (const t of texts) {
      await client.query(
        `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
        [nid('ip_msg'), threadId, t.from, t.body],
      );
    }
  }
  return threadId;
}

async function ensureOffer(client, {
  internshipId,
  candidateId,
  employerId,
  roleTitle,
  stipend = 15000,
  status = 'pending',
  message,
  startDate,
  validUntil,
  applicationId,
}) {
  if (applicationId) {
    const byApp = await client.query(`SELECT id FROM ip_offers WHERE application_id = $1 LIMIT 1`, [applicationId]);
    if (byApp.rows[0]) return byApp.rows[0].id;
  }
  const ex = await client.query(
    `SELECT id FROM ip_offers WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
    [internshipId, candidateId],
  );
  if (ex.rows[0]) return ex.rows[0].id;
  const id = nid('ip_off');
  const start = startDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();
  const valid = validUntil || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().slice(0, 10);
  })();
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`).catch(() => {});
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS start_date DATE`).catch(() => {});
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS valid_until DATE`).catch(() => {});
  await client.query(
    `INSERT INTO ip_offers (
       id, internship_id, candidate_id, employer_id, application_id,
       role_title, stipend_inr, status, message, start_date, valid_until
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      internshipId,
      candidateId,
      employerId,
      applicationId || null,
      roleTitle,
      stipend,
      status,
      message || 'Congratulations — we would like to offer you this internship.',
      start,
      valid,
    ],
  );
  return id;
}

async function ensureIdea(client, authorId, title, categoryId, status = 'Pending approval') {
  const ex = await client.query(`SELECT id FROM ip_feature_ideas WHERE title = $1 LIMIT 1`, [title]);
  if (ex.rows[0]) {
    await client.query(`UPDATE ip_feature_ideas SET status = $2 WHERE id = $1`, [ex.rows[0].id, status]).catch(() => {});
    return ex.rows[0].id;
  }
  const id = nid('ip_idea');
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'ip_feature_ideas'`,
  );
  const names = new Set(cols.rows.map((r) => r.column_name));
  const catalog = content.FEATURE_IDEAS.find((x) => x.title === title);
  const description = catalog?.description || `${title} — product improvement for InternSafar.`;
  if (names.has('category_id') && names.has('priority')) {
    await client.query(
      `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, status, category_id, priority, vote_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,2)`,
      [id, authorId, title, description, status, categoryId || null, 5],
    );
  } else {
    await client.query(
      `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, status, vote_count)
       VALUES ($1,$2,$3,$4,$5,2)`,
      [id, authorId, title, description, status],
    );
  }
  return id;
}

async function notify(client, userId, title, body, link) {
  await client.query(
    `INSERT INTO ip_notifications (id, user_id, title, body, link)
     VALUES ($1,$2,$3,$4,$5)`,
    [nid('ip_ntf'), userId, title, body, link || null],
  );
}

async function main() {
  const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL missing');
  const client = new pg.Client({ connectionString: rawUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log(`Loading core sample accounts (password ${PASSWORD} for new accounts)…`);

  const castCands = CAST_CANDIDATES;
  const castEmps = CAST_EMPLOYERS;

  const candIds = {};
  const candUserIds = {};
  for (const c of castCands) {
    const u = await ensureUser(client, { email: c.email, role: 'candidate', name: c.name, points: 60 });
    candUserIds[c.email] = u.id;
    candIds[c.email] = await ensureCandidate(client, u.id, c.email, c.name, { skills: c.skills });
    console.log(u.created ? 'created' : 'exists', c.email);
  }

  // Base showcase candidate (primary demo login)
  const baseCand = await ensureUser(client, {
    email: CAND_BASE,
    role: 'candidate',
    name: CAND_BASE_NAME,
    points: 80,
  });
  candIds[CAND_BASE] = await ensureCandidate(client, baseCand.id, CAND_BASE, CAND_BASE_NAME);
  candUserIds[CAND_BASE] = baseCand.id;
  console.log(baseCand.created ? 'created' : 'exists', 'base candidate', CAND_BASE);

  const empIds = {};
  const empUserIds = {};
  for (const e of castEmps) {
    const u = await ensureUser(client, { email: e.email, role: 'employer', name: e.company, points: 200 });
    empUserIds[e.email] = u.id;
    empIds[e.email] = await ensureEmployer(client, u.id, e.email, e.company, e.status);
    console.log(u.created ? 'created' : 'exists', e.email, e.status);
  }

  const baseEmp = await ensureUser(client, {
    email: EMP_BASE,
    role: 'employer',
    name: EMP_BASE_NAME,
    points: 200,
  });
  empUserIds[EMP_BASE] = baseEmp.id;
  empIds[EMP_BASE] = await ensureEmployer(
    client,
    baseEmp.id,
    EMP_BASE,
    EMP_BASE_NAME,
    'approved',
  );
  console.log(baseEmp.created ? 'created' : 'exists', 'base employer', EMP_BASE);

  // Docs for approved employers
  for (const [email, eid] of Object.entries(empIds)) {
    const st = await client.query(`SELECT approval_status FROM ip_employers WHERE id = $1`, [eid]);
    if (st.rows[0]?.approval_status === 'approved') {
      await ensureDoc(client, eid, 'Shop Act', 'approved');
      await ensureDoc(client, eid, 'Business PAN', 'approved');
      await ensureDoc(client, eid, 'Other', 'pending');
    } else {
      await ensureDoc(client, eid, 'Shop Act', 'pending');
    }
  }

  // Postings under base employer (or first approved cast)
  const fallbackEmpEmail = CAST_EMPLOYERS.find((e) => e.status === 'approved')?.email || CAST_EMPLOYERS[0]?.email;
  const postEmpEmail = empIds[EMP_BASE] ? EMP_BASE : fallbackEmpEmail;
  const postEmpId = empIds[postEmpEmail];
  const postEmpUserId = empUserIds[postEmpEmail];

  const titles = [
    'Frontend Developer Intern',
    'Data Analyst Intern',
    'Backend API Intern',
    'Product Design Intern',
    'QA Automation Intern',
    'Machine Learning Intern',
  ];
  const internshipIds = [];
  for (let ti = 0; ti < titles.length; ti += 1) {
    internshipIds.push(await ensureInternship(client, postEmpId, titles[ti], 'published', ti));
  }
  // One draft / paused for SA postings queue variety
  internshipIds.push(await ensureInternship(client, postEmpId, 'Paused Design Intern', 'paused', titles.length));

  // Applications + offers: each candidate gets a different role/status (no repeated same-name spam)
  const applicantEmails = Object.keys(candIds);
  const offerStatuses = ['pending', 'accepted', 'declined', 'pending', 'accepted', 'pending'];
  let appIdx = 0;
  for (const cEmail of applicantEmails) {
    const internId = internshipIds[appIdx % Math.max(1, titles.length)];
    const roleTitle = titles[appIdx % titles.length];
    const status = appIdx === 1 ? 'shortlisted' : appIdx % 3 === 0 ? 'offered' : 'applied';
    const appId = await ensureApplication(client, internId, candIds[cEmail], status, 70 + appIdx * 5);
    const candName = castCands.find((c) => c.email === cEmail)?.name || cEmail;
    const first = String(candName).split(' ')[0];
    await ensureThread(client, internId, candUserIds[cEmail], postEmpUserId, [
      { from: postEmpUserId, body: `Hi ${first} — thanks for applying to ${roleTitle}.` },
      { from: candUserIds[cEmail], body: `Thank you! Happy to share more about my projects.` },
    ]);
    // Offer for most candidates on distinct roles — varied stipend/status/dates
    if (appIdx < titles.length) {
      const oStatus = offerStatuses[appIdx % offerStatuses.length];
      const start = new Date();
      start.setDate(start.getDate() + 10 + appIdx * 2);
      const valid = new Date();
      if (oStatus === 'pending') valid.setDate(valid.getDate() + 7 + appIdx);
      else if (oStatus === 'accepted' || oStatus === 'declined') valid.setDate(valid.getDate() + 3);
      else valid.setDate(valid.getDate() - 2);
      await ensureOffer(client, {
        internshipId: internId,
        candidateId: candIds[cEmail],
        employerId: postEmpId,
        roleTitle,
        stipend: 12000 + appIdx * 1500,
        status: oStatus,
        message: `Hi ${first}, we would like to extend an offer for ${roleTitle}.`,
        startDate: start.toISOString().slice(0, 10),
        validUntil: valid.toISOString().slice(0, 10),
        applicationId: appId,
      });
      const appStatus = oStatus === 'accepted' ? 'hired' : oStatus === 'declined' ? 'declined_offer' : 'offered';
      await client.query(`UPDATE ip_applications SET status = $2 WHERE id = $1`, [appId, appStatus]);
    }
    await notify(client, candUserIds[cEmail], 'Application received', `Your application for ${roleTitle} is in review.`, '/candidate/applications');
    appIdx += 1;
  }

  // Extra message threads so inbox has ≥10 conversations (both sides)
  const threadTarget = Math.max(12, content.TARGET_LIST_ROWS);
  let threadN = await client.query(
    `SELECT count(*)::int AS n FROM ip_message_threads
     WHERE candidate_user_id = ANY($1::text[]) OR employer_user_id = $2`,
    [Object.values(candUserIds), postEmpUserId],
  ).then((r) => Number(r.rows[0]?.n || 0));
  const approvedEmpEmails = CAST_EMPLOYERS.filter((e) => e.status === 'approved').map((e) => e.email);
  for (let t = 0; t < internshipIds.length && threadN < threadTarget; t += 1) {
    for (let c = 0; c < applicantEmails.length && threadN < threadTarget; c += 1) {
      const internId = internshipIds[t];
      const cEmail = applicantEmails[c];
      const empEmail = approvedEmpEmails[(t + c) % Math.max(1, approvedEmpEmails.length)] || postEmpEmail;
      const empUid = empUserIds[empEmail] || postEmpUserId;
      const candUid = candUserIds[cEmail];
      if (!candUid || !empUid || !internId) continue;
      const before = await client.query(
        `SELECT id FROM ip_message_threads
         WHERE internship_id=$1 AND candidate_user_id=$2 AND employer_user_id=$3 LIMIT 1`,
        [internId, candUid, empUid],
      );
      if (before.rows[0]) continue;
      await ensureThread(client, internId, candUid, empUid, [
        { from: empUid, body: `Following up on your application — any questions about the role?` },
        { from: candUid, body: `Thanks for checking in. I am available this week.` },
      ]);
      threadN += 1;
    }
  }

  await notify(client, postEmpUserId, 'New applicants', 'New applicants are waiting on your postings.', '/employer/internships');

  // Feature ideas
  let catId = null;
  try {
    const cats = await client.query(`SELECT id FROM ip_idea_categories ORDER BY sort_order LIMIT 1`);
    catId = cats.rows[0]?.id || null;
  } catch {
    /* migration 007 may be missing on some envs */
  }
  const ideaAuthor = candUserIds[castCands[0].email] || Object.values(candUserIds)[0];
  if (ideaAuthor) {
    const ideaCount = Math.min(content.FEATURE_IDEAS.length, Math.max(content.TARGET_LIST_ROWS, content.FEATURE_IDEAS.length));
    for (let i = 0; i < ideaCount; i += 1) {
      const idea = content.FEATURE_IDEAS[i];
      const status = content.IDEA_STATUSES[i % content.IDEA_STATUSES.length];
      await ensureIdea(client, ideaAuthor, idea.title, catId, status);
    }
  }

  // Manual employer request row for SA Requests tab
  const pendingEmp = pendingCastEmployer();
  if (pendingEmp) {
    const reqEx = await client.query(
      `SELECT id FROM ip_employer_requests WHERE lower(contact_email) = lower($1) LIMIT 1`,
      [pendingEmp.email],
    );
    if (!reqEx.rows[0]) {
      const domain = pendingEmp.email.split('@')[1] || 'example.com';
      await client.query(
        `INSERT INTO ip_employer_requests (id, company_name, website, contact_email, contact_name, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          nid('ip_ereq'),
          pendingEmp.company,
          `https://${domain}`,
          pendingEmp.email,
          `${pendingEmp.company} Contact`,
          'Manual verification request for employer onboarding.',
        ],
      );
    }
  }

  // SA notification
  const sa = await client.query(`SELECT id FROM ip_users WHERE lower(email) = lower($1)`, [SA_EMAIL]);
  if (sa.rows[0]) {
    await notify(client, sa.rows[0].id, 'Accounts ready', 'Demo accounts are ready for review.', '/superadmin');
  }

  console.log(`\nDone. Cast logins (password ${PASSWORD}):`);
  for (const c of castCands) console.log('  candidate', c.email);
  for (const e of castEmps) console.log('  employer ', e.email, e.status);
  console.log('Real SA unchanged:', SA_EMAIL);
  console.log('Base candidate/employer linked if they already existed.');

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
