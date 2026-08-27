#!/usr/bin/env node
/**
 * Internship Portal core-sample reset (single executable).
 *
 * Preserves the 3 demo login accounts (candidate / employer / superadmin),
 * deletes everyone else (+ cascade), clears core transactional data, then
 * re-seeds ≈2 pages of meaningful rows for those cores (+ support cast).
 *
 * Cores (password Admin@123):
 *   Candidate   lawsonlclintern+1@gmail.com
 *   Employer    shreekar.nyayapathi23+2@vit.edu
 *   SuperAdmin  placementhubsupport@gmail.com
 *
 * Edit scripts/lib/ipCoreSampleConfig.js + ipCoreBaselinePostings.js for baseline.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');

const content = require('./lib/ipTestDataContent.js');
const coreCfg = require('./lib/ipCoreSampleConfig.js');
const { CORE_BASELINE_POSTINGS } = require('./lib/ipCoreBaselinePostings.js');
const { seedCoreBaseline } = require('./lib/ipSeedCoreBaseline.js');

const CONFIG = {
  superadminEmail: coreCfg.SUPERADMIN_EMAIL,
  legacySuperadminEmail: coreCfg.LEGACY_SUPERADMIN_EMAIL,
  demoPassword: coreCfg.DEMO_PASSWORD,
  candidateBase: { email: coreCfg.CAND_BASE, name: coreCfg.CAND_BASE_NAME },
  employerBase: { email: coreCfg.EMP_BASE, company: coreCfg.EMP_BASE_NAME, status: 'approved' },
  castCandidates: coreCfg.CAST_CANDIDATES,
  castEmployers: coreCfg.CAST_EMPLOYERS,
  /** Emails whose ip_users rows are never deleted */
  preserveEmails: coreCfg.PRESERVE_USER_EMAILS,
};

function parseArgs(argv) {
  return { yes: argv.includes('--yes') || argv.includes('-y'), dryRun: argv.includes('--dry-run') };
}

function resolveIpRoot(scriptDir) {
  const candidates = [
    path.resolve(scriptDir, '..'),
    scriptDir,
    path.join(scriptDir, 'internship-portal'),
    path.join(scriptDir, 'campus-placement-multiuser', 'internship-portal'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'package.json')) && fs.existsSync(path.join(p, 'scripts'))) return p;
  }
  throw new Error('Could not locate internship-portal root.');
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(String(a || '').trim()))));
}

let _qaSeq = 0;
function qaRunLabel(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
function nid(prefix) {
  _qaSeq += 1;
  return `${prefix}_${qaRunLabel()}-${String(_qaSeq).padStart(3, '0')}`;
}

function refCode(email) {
  const local = String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
  return `REF-${local}`;
}

async function tableExists(client, name) {
  const r = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [name]);
  return Boolean(r.rows[0]);
}

async function runDelete(client, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    return r.rowCount || 0;
  } catch (e) {
    if (e.code === '42P01') return 0;
    throw e;
  }
}

async function deleteUserCascade(client, userId, email) {
  const cand = await client.query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [userId]);
  const emp = await client.query(`SELECT id FROM ip_employers WHERE user_id = $1`, [userId]);
  const candidateId = cand.rows[0]?.id || null;
  const employerId = emp.rows[0]?.id || null;

  await client.query('BEGIN');
  try {
    await runDelete(client, `DELETE FROM ip_messages WHERE thread_id IN (SELECT id FROM ip_message_threads WHERE candidate_user_id=$1 OR employer_user_id=$1)`, [userId]);
    await runDelete(client, `DELETE FROM ip_messages WHERE sender_user_id=$1`, [userId]);
    await runDelete(client, `DELETE FROM ip_message_threads WHERE candidate_user_id=$1 OR employer_user_id=$1`, [userId]);
    await runDelete(client, `DELETE FROM ip_ratings WHERE from_user_id=$1 OR to_user_id=$1`, [userId]);
    await runDelete(client, `DELETE FROM ip_endorsements WHERE ($1::text IS NOT NULL AND candidate_id=$1) OR ($2::text IS NOT NULL AND employer_id=$2)`, [candidateId, employerId]);
    const { deleteIpWorkbenchForActor } = require(path.join(__dirname, 'lib', 'ensureIpPipelineSchema.js'));
    await deleteIpWorkbenchForActor(client, async (_label, sql, params) => runDelete(client, sql, params), {
      userId,
      employerId,
      candidateId,
    });

    if (employerId) {
      await runDelete(client, `DELETE FROM ip_linkedin_promotions WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_employer_documents WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_offers WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_internships WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_employers WHERE id=$1`, [employerId]);
    }
    if (candidateId) {
      await runDelete(client, `DELETE FROM ip_saved_internships WHERE candidate_id=$1`, [candidateId]);
      await runDelete(client, `DELETE FROM ip_offers WHERE candidate_id=$1`, [candidateId]);
      await runDelete(client, `DELETE FROM ip_applications WHERE candidate_id=$1`, [candidateId]);
      await runDelete(client, `DELETE FROM ip_candidates WHERE id=$1`, [candidateId]);
    }

    for (const [sql, params] of [
    [`DELETE FROM ip_viral_shares WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_notifications WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_points_ledger WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_password_resets WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_login_events WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_auth_sessions WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_feature_idea_votes WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_feature_idea_comments WHERE author_user_id=$1`, [userId]],
    [`UPDATE ip_feature_ideas SET author_user_id=NULL WHERE author_user_id=$1`, [userId]],
    [`DELETE FROM ip_referrals WHERE referrer_user_id=$1`, [userId]],
    [`UPDATE ip_referrals SET referred_user_id=NULL WHERE referred_user_id=$1`, [userId]],
    [`DELETE FROM ip_employer_requests WHERE lower(contact_email)=lower($1) OR created_user_id=$2`, [email, userId]],
    [`DELETE FROM ip_users WHERE id=$1`, [userId]],
  ]) {
    await runDelete(client, sql, params);
  }
  await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function ensureUser(client, bcrypt, { email, role, name, points = 80, password }) {
  const ex = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [email]);
  if (ex.rows[0]) {
    await client.query(`UPDATE ip_users SET role=$2,name=$3,active=true,points=GREATEST(points,$4),updated_at=now() WHERE id=$1`, [ex.rows[0].id, role, name, points]);
    return ex.rows[0].id;
  }
  const id = nid('ip_user');
  const hash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO ip_users (id,email,password_hash,role,name,points,free_post_credits,application_allowance,referral_code,profile_complete,active)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,true,true)`,
    [id, email.toLowerCase(), hash, role, name, points, refCode(email)],
  );
  return id;
}

async function ensureSuperadmin(client, bcrypt) {
  const hash = await bcrypt.hash(CONFIG.demoPassword, 10);
  const target = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [CONFIG.superadminEmail]);
  const legacy = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [CONFIG.legacySuperadminEmail]);
  if (target.rows[0]) {
    await client.query(`UPDATE ip_users SET role='superadmin',password_hash=$2,name=COALESCE(NULLIF(name,''),'Portal SuperAdmin'),active=true,updated_at=now() WHERE id=$1`, [target.rows[0].id, hash]);
    if (legacy.rows[0] && legacy.rows[0].id !== target.rows[0].id) await client.query(`UPDATE ip_users SET active=false,updated_at=now() WHERE id=$1`, [legacy.rows[0].id]);
    return target.rows[0].id;
  }
  if (legacy.rows[0]) {
    await client.query(`UPDATE ip_users SET email=$2,role='superadmin',password_hash=$3,name='Portal SuperAdmin',active=true,updated_at=now() WHERE id=$1`, [legacy.rows[0].id, CONFIG.superadminEmail, hash]);
    return legacy.rows[0].id;
  }
  return ensureUser(client, bcrypt, { email: CONFIG.superadminEmail, role: 'superadmin', name: 'Portal SuperAdmin', points: 0, password: CONFIG.demoPassword });
}

async function seedCoreData(client, bcrypt) {
  const baseCandUser = await ensureUser(client, bcrypt, { email: CONFIG.candidateBase.email, role: 'candidate', name: CONFIG.candidateBase.name, points: 80, password: CONFIG.demoPassword });
  const baseEmpUser = await ensureUser(client, bcrypt, { email: CONFIG.employerBase.email, role: 'employer', name: CONFIG.employerBase.company, points: 200, password: CONFIG.demoPassword });

  const candidateEntries = [];
  const seenCand = new Set();
  for (const c of [{ ...CONFIG.candidateBase, skills: ['JavaScript', 'React', 'SQL'] }, ...CONFIG.castCandidates]) {
    const key = String(c.email || '').toLowerCase();
    if (seenCand.has(key)) continue;
    seenCand.add(key);
    candidateEntries.push(c);
  }
  const employerEntries = [];
  const seenEmp = new Set();
  for (const e of [CONFIG.employerBase, ...CONFIG.castEmployers]) {
    const key = String(e.email || '').toLowerCase();
    if (seenEmp.has(key)) continue;
    seenEmp.add(key);
    employerEntries.push(e);
  }

  const candidateIds = {};
  const candidateUserIds = {};
  for (const c of candidateEntries) {
    const userId = c.email === CONFIG.candidateBase.email ? baseCandUser : await ensureUser(client, bcrypt, { email: c.email, role: 'candidate', name: c.name, points: 60, password: CONFIG.demoPassword });
    candidateUserIds[c.email] = userId;
    const ex = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [userId]);
    if (ex.rows[0]) candidateIds[c.email] = ex.rows[0].id;
    else {
      const id = nid('ip_cand');
      await client.query(
        `INSERT INTO ip_candidates (id,user_id,name,email,phone,college,degree,specialization,study_status,graduation_year,cgpa,city,state,skills,preferred_work_mode,preferred_locations,resume_url,prior_experience,searchable,show_profile_picture)
         VALUES ($1,$2,$3,$4,'9000000001','VIT','B.Tech','CSE','Studying',2027,'8.4','Vellore','Tamil Nadu',$5::jsonb,'Remote',$6::jsonb,'https://example.com/resume.pdf',$7,true,true)`,
        [
          id,
          userId,
          c.name,
          c.email.toLowerCase(),
          JSON.stringify(c.skills || ['JavaScript']),
          JSON.stringify(['Remote', 'Bengaluru']),
          content.experienceEntriesJsonAt(Object.keys(candidateIds).length),
        ],
      );
      candidateIds[c.email] = id;
    }
  }

  const employerIds = {};
  const employerUserIds = {};
  for (const e of employerEntries) {
    const userId = e.email === CONFIG.employerBase.email ? baseEmpUser : await ensureUser(client, bcrypt, { email: e.email, role: 'employer', name: e.company, points: 200, password: CONFIG.demoPassword });
    employerUserIds[e.email] = userId;
    const ex = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [userId]);
    if (ex.rows[0]) {
      employerIds[e.email] = ex.rows[0].id;
      await client.query(`UPDATE ip_employers SET company_name=$2,contact_name=$2,approval_status=$3,updated_at=now() WHERE id=$1`, [ex.rows[0].id, e.company, e.status || 'approved']);
    } else {
      const id = nid('ip_emp');
      const domain = e.email.split('@')[1] || 'example.com';
      await client.query(
        `INSERT INTO ip_employers (id,user_id,company_name,brand_name,website,work_email,industry,company_size,hq_city,hq_state,about,contact_name,contact_designation,contact_phone,approval_status,show_identity_on_posting,ethics_acks,ethics_accepted_at)
         VALUES ($1,$2,$3,$4,$5,$6,'Technology','51-200','Hyderabad','Telangana',$7,$3,'HR Lead','9000000099',$8,true,$9::jsonb,now())`,
        [id, userId, e.company, e.company.split(' ')[0], `https://${domain}`, e.email.toLowerCase(), `${e.company} is a hiring partner on PlacementHub.`, e.status || 'approved', JSON.stringify({ no_fees: true, accurate_info: true, data_privacy: true })],
      );
      employerIds[e.email] = id;
    }
  }

  const approvedEmployers = employerEntries.filter((e) => (e.status || 'approved') === 'approved');
  const postEmpEmail = approvedEmployers[0]?.email || CONFIG.employerBase.email;
  const postEmpId = employerIds[postEmpEmail];
  const postCompany = employerEntries.find((e) => e.email === postEmpEmail)?.company || 'Nova Labs';

  /** Baseline Nova roles (from live core snapshot) — ≥2 UI pages + draft/paused + 2 blank-req. */
  const roleSpecs = CORE_BASELINE_POSTINGS.map((row) => ({
    title: row.title,
    status: row.status || 'published',
    blankRequirements: Boolean(row.blankRequirements),
  }));

  /** @type {{ id: string, employerId: string, title: string, company: string, status: string }[]} */
  const postingRows = [];

  async function ensurePosting(employerId, company, title, status, ti, blankRequirements = false) {
    const city = content.pick(content.CITIES, ti);
    const ex = await client.query(`SELECT id FROM ip_internships WHERE employer_id=$1 AND title=$2 LIMIT 1`, [employerId, title]);
    if (ex.rows[0]) {
      postingRows.push({ id: ex.rows[0].id, employerId, title, company, status });
      return ex.rows[0].id;
    }
    const id = nid('ip_int');
    const desc = content.internshipDescription(title, company, city, ti);
    let eligibility = content.internshipEligibilityAt(ti);
    if (blankRequirements) {
      eligibility = {
        ...eligibility,
        skills: [],
        requirements_text: '',
        ideal_profile_text: eligibility.ideal_profile_text || '',
      };
    }
    // Live schedule for Browse (CANDIDATE_VISIBLE): starts_at past, apply_ends_at future.
    await client.query(
      `INSERT INTO ip_internships (
         id,employer_id,title,description,location,work_mode,stipend_inr,duration_months,
         eligibility,questions,status,show_employer_identity,engagement_type,stipend_type,
         locations,starts_at,apply_ends_at,start_date
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,3,$8::jsonb,$9::jsonb,$10,true,'full_time','fixed',
         $11::jsonb, now() - interval '2 hours', now() + interval '28 days',
         CURRENT_DATE + $12::int
       )`,
      [
        id,
        employerId,
        title,
        desc,
        city,
        content.pick(content.WORK_MODES, ti),
        12000 + (ti % 5) * 2000,
        JSON.stringify(eligibility),
        JSON.stringify([{ id: 'q1', prompt: 'Why this role?', type: 'textarea' }]),
        status,
        JSON.stringify([city]),
        5 + (ti % 16),
      ],
    );
    postingRows.push({ id, employerId, title, company, status });
    return id;
  }

  // Primary employer (Nova) gets the baseline catalog
  for (let ti = 0; ti < roleSpecs.length; ti += 1) {
    const { title: t, status, blankRequirements } = roleSpecs[ti];
    await ensurePosting(postEmpId, postCompany, t, status, ti, blankRequirements);
  }

  // Each additional approved employer gets 2–3 distinct roles so offers are not all from one company
  let extraTi = roleSpecs.length;
  for (let ei = 1; ei < approvedEmployers.length; ei += 1) {
    const emp = approvedEmployers[ei];
    const eid = employerIds[emp.email];
    if (!eid) continue;
    const count = 3;
    for (let j = 0; j < count; j += 1) {
      const title = content.roleTitle(extraTi + j);
      await ensurePosting(eid, emp.company, title, 'published', extraTi + j, false);
    }
    extraTi += count;
  }

  const publishedPostings = postingRows.filter((p) => p.status === 'published');
  const internshipIds = postingRows.map((p) => p.id);
  const publishedInternIds = publishedPostings.map((p) => p.id);

  const candEmails = [...new Set(Object.keys(candidateIds))];
  const offerStatuses = ['pending', 'accepted', 'declined', 'pending', 'expired', 'pending', 'accepted', 'pending'];
  const appStatusCycle = [
    'applied', 'shortlisted', 'interviewing', 'offered', 'rejected', 'withdrawn',
    'hired', 'declined_offer', 'applied', 'shortlisted', 'interviewing', 'offered',
  ];

  // Dense applications so employer applicants + candidate My Applications cover ≥2 pages / statuses
  const appTarget = Math.max(content.TARGET_LIST_ROWS * 2, publishedPostings.length * 2);
  let appN = 0;
  for (let i = 0; i < appTarget; i += 1) {
    const cEmail = candEmails[i % candEmails.length];
    const posting = publishedPostings[i % Math.max(1, publishedPostings.length)];
    if (!posting || !candidateIds[cEmail]) continue;
    const appStatus = appStatusCycle[i % appStatusCycle.length];
    const ex = await client.query(
      `SELECT id FROM ip_applications WHERE internship_id=$1 AND candidate_id=$2`,
      [posting.id, candidateIds[cEmail]],
    );
    let appId = ex.rows[0]?.id;
    if (!appId) {
      appId = nid('ip_app');
      await client.query(
        `INSERT INTO ip_applications (id,internship_id,candidate_id,status,match_score,answers) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          appId,
          posting.id,
          candidateIds[cEmail],
          appStatus,
          70 + (i % 8) * 3,
          JSON.stringify({ q1: 'Excited to contribute to this internship and learn from the team.' }),
        ],
      );
      appN += 1;
    } else if (i < candEmails.length) {
      await client.query(`UPDATE ip_applications SET status=$2,match_score=$3 WHERE id=$1`, [
        appId,
        appStatus,
        70 + (i % 8) * 3,
      ]);
    }
  }
  console.log(`Seeded/ensured applications (new inserts this pass ≈${appN}, target loop ${appTarget})`);

  // Offers: distinct candidate × posting pairs; employer follows the posting (never same name spam)
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`).catch(() => {});
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS start_date DATE`).catch(() => {});
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS valid_until DATE`).catch(() => {});

  const offerCount = Math.min(
    Math.max(candEmails.length, publishedPostings.length),
    content.TARGET_LIST_ROWS,
  );
  for (let i = 0; i < offerCount; i += 1) {
    const cEmail = candEmails[i % candEmails.length];
    const candidateId = candidateIds[cEmail];
    const posting = publishedPostings[i % Math.max(1, publishedPostings.length)];
    if (!posting || !candidateId) continue;
    const status = offerStatuses[i % offerStatuses.length];
    const stipend = 12000 + (i % 9) * 1500;
    const start = new Date();
    start.setDate(start.getDate() + 7 + (i % 10) * 3);
    const valid = new Date();
    if (status === 'expired') valid.setDate(valid.getDate() - 3 - (i % 5));
    else valid.setDate(valid.getDate() + 5 + (i % 12));

    let appRow = await client.query(
      `SELECT id FROM ip_applications WHERE internship_id=$1 AND candidate_id=$2 LIMIT 1`,
      [posting.id, candidateId],
    );
    let appId = appRow.rows[0]?.id;
    if (!appId) {
      appId = nid('ip_app');
      const appStatus = status === 'accepted' ? 'hired' : status === 'declined' ? 'declined_offer' : 'offered';
      await client.query(
        `INSERT INTO ip_applications (id,internship_id,candidate_id,status,match_score,answers) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [appId, posting.id, candidateId, appStatus, 75 + (i % 10), JSON.stringify({ q1: 'Looking forward to the opportunity.' })],
      );
    }

    const offerEx = await client.query(`SELECT id FROM ip_offers WHERE application_id=$1 LIMIT 1`, [appId]);
    if (offerEx.rows[0]) continue;

    const offerId = nid('ip_off');
    const firstName = String(
      candidateEntries.find((c) => c.email === cEmail)?.name || 'there',
    ).split(' ')[0];
    try {
      await client.query(
        `INSERT INTO ip_offers (
           id, internship_id, employer_id, candidate_id, application_id,
           status, stipend_inr, role_title, message, start_date, valid_until
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          offerId,
          posting.id,
          posting.employerId,
          candidateId,
          appId,
          status === 'expired' ? 'pending' : status,
          stipend,
          posting.title,
          `Hi ${firstName}, ${posting.company} would like to extend an offer for ${posting.title}.`,
          start.toISOString().slice(0, 10),
          valid.toISOString().slice(0, 10),
        ],
      );
    } catch {
      /* unique / FK — skip duplicate */
    }
  }

  // Message threads (≥10, both sides) so Messages inbox is non-empty after reset
  const threadTarget = Math.max(12, content.TARGET_LIST_ROWS);
  let threadN = 0;
  const empEmailById = Object.fromEntries(
    Object.entries(employerIds).map(([email, id]) => [id, email]),
  );
  for (let i = 0; i < publishedPostings.length && threadN < threadTarget; i += 1) {
    const posting = publishedPostings[i];
    const cEmail = candEmails[i % candEmails.length];
    const candUserId = candidateUserIds[cEmail];
    const empEmail = empEmailById[posting.employerId];
    const empUserId = employerUserIds[empEmail];
    if (!candUserId || !empUserId) continue;
    const thrEx = await client.query(
      `SELECT id FROM ip_message_threads
       WHERE internship_id=$1 AND candidate_user_id=$2 AND employer_user_id=$3 LIMIT 1`,
      [posting.id, candUserId, empUserId],
    );
    let threadId = thrEx.rows[0]?.id;
    if (!threadId) {
      threadId = nid('ip_thr');
      await client.query(
        `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
         VALUES ($1,$2,$3,$4,$5)`,
        [threadId, posting.id, candUserId, empUserId, `${posting.title} — conversation`],
      );
    }
    const msgCount = await client.query(`SELECT count(*)::int AS n FROM ip_messages WHERE thread_id=$1`, [threadId]);
    if (Number(msgCount.rows[0]?.n || 0) === 0) {
      const first = String(
        candidateEntries.find((c) => c.email === cEmail)?.name || 'there',
      ).split(' ')[0];
      await client.query(
        `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
        [nid('ip_msg'), threadId, empUserId, `Hi ${first} — thanks for your interest in ${posting.title}.`],
      );
      await client.query(
        `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
        [nid('ip_msg'), threadId, candUserId, `Thank you! Happy to share more about my background.`],
      );
    }
    threadN += 1;
  }
  // Extra pairs if still under target
  for (let j = 0; j < candEmails.length && threadN < threadTarget; j += 1) {
    for (let k = 0; k < publishedPostings.length && threadN < threadTarget; k += 1) {
      if (k === j) continue;
      const posting = publishedPostings[k];
      const cEmail = candEmails[j];
      const candUserId = candidateUserIds[cEmail];
      const empEmail = empEmailById[posting.employerId];
      const empUserId = employerUserIds[empEmail];
      if (!candUserId || !empUserId) continue;
      const thrEx = await client.query(
        `SELECT id FROM ip_message_threads
         WHERE internship_id=$1 AND candidate_user_id=$2 AND employer_user_id=$3 LIMIT 1`,
        [posting.id, candUserId, empUserId],
      );
      if (thrEx.rows[0]) continue;
      const threadId = nid('ip_thr');
      await client.query(
        `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
         VALUES ($1,$2,$3,$4,$5)`,
        [threadId, posting.id, candUserId, empUserId, `${posting.title} — follow-up`],
      );
      await client.query(
        `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
        [nid('ip_msg'), threadId, empUserId, `Quick note about ${posting.title} — are you available for a screen?`],
      );
      await client.query(
        `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
        [nid('ip_msg'), threadId, candUserId, `Yes — mid-week works best for me.`],
      );
      threadN += 1;
    }
  }

  // Feature ideas with unique titles (never all "QA Intern")
  const ideaAuthorEmail = CONFIG.castCandidates[0]?.email || CONFIG.candidateBase.email;
  const ideaAuthorUser = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1) LIMIT 1`, [ideaAuthorEmail]);
  const authorId = ideaAuthorUser.rows[0]?.id;
  if (authorId && (await tableExists(client, 'ip_feature_ideas'))) {
    let catId = null;
    try {
      const cats = await client.query(`SELECT id FROM ip_idea_categories ORDER BY sort_order NULLS LAST LIMIT 1`);
      catId = cats.rows[0]?.id || null;
    } catch {
      /* optional */
    }
    const ideaCount = Math.min(content.FEATURE_IDEAS.length, Math.max(content.TARGET_LIST_ROWS, content.FEATURE_IDEAS.length));
    for (let i = 0; i < ideaCount; i += 1) {
      const idea = content.FEATURE_IDEAS[i];
      const ex = await client.query(`SELECT id FROM ip_feature_ideas WHERE title=$1 LIMIT 1`, [idea.title]);
      if (ex.rows[0]) continue;
      const id = nid('ip_idea');
      const status = content.IDEA_STATUSES[i % content.IDEA_STATUSES.length];
      try {
        await client.query(
          `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, problem, solution, status, category_id, vote_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, authorId, idea.title, idea.description, idea.problem || null, idea.solution || null, status, catId, 1 + (i % 8)],
        );
      } catch {
        await client.query(
          `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, status, vote_count)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, authorId, idea.title, idea.description, status, 1 + (i % 8)],
        );
      }
    }
  }
}

async function clearCoreOwnedData(client, { candidateUserId, employerUserId, candidateId, employerId, superadminId }) {
  // Wipe transactional rows owned by the preserved cores so seed starts clean.
  const { deleteIpWorkbenchForActor } = require(path.join(__dirname, 'lib', 'ensureIpPipelineSchema.js'));
  const actors = [
    { userId: candidateUserId, employerId: null, candidateId },
    { userId: employerUserId, employerId, candidateId: null },
    { userId: superadminId, employerId: null, candidateId: null },
  ];
  for (const actor of actors) {
    if (!actor.userId) continue;
    await deleteIpWorkbenchForActor(client, async (_label, sql, params) => runDelete(client, sql, params), actor);
  }

  if (employerId) {
    const posts = await client.query(`SELECT id FROM ip_internships WHERE employer_id=$1`, [employerId]);
    const ids = posts.rows.map((r) => r.id);
    if (ids.length) {
      await runDelete(client, `DELETE FROM ip_ratings WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_endorsements WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_messages WHERE thread_id IN (SELECT id FROM ip_message_threads WHERE internship_id = ANY($1::text[]))`, [ids]);
      await runDelete(client, `DELETE FROM ip_message_threads WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_saved_internships WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_offers WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_applications WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_internships WHERE id = ANY($1::text[])`, [ids]);
    }
    await runDelete(client, `DELETE FROM ip_linkedin_promotions WHERE employer_id=$1`, [employerId]);
    await runDelete(client, `DELETE FROM ip_offers WHERE employer_id=$1`, [employerId]);
  }
  if (candidateId) {
    await runDelete(client, `DELETE FROM ip_saved_internships WHERE candidate_id=$1`, [candidateId]);
    await runDelete(client, `DELETE FROM ip_offers WHERE candidate_id=$1`, [candidateId]);
    await runDelete(client, `DELETE FROM ip_applications WHERE candidate_id=$1`, [candidateId]);
    await runDelete(client, `DELETE FROM ip_endorsements WHERE candidate_id=$1`, [candidateId]);
  }
  const coreUserIds = [candidateUserId, employerUserId, superadminId].filter(Boolean);
  if (coreUserIds.length) {
    await runDelete(client, `DELETE FROM ip_messages WHERE thread_id IN (
      SELECT id FROM ip_message_threads WHERE candidate_user_id = ANY($1::text[]) OR employer_user_id = ANY($1::text[])
    )`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_message_threads WHERE candidate_user_id = ANY($1::text[]) OR employer_user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_ratings WHERE from_user_id = ANY($1::text[]) OR to_user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_notifications WHERE user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_auth_sessions WHERE user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_login_events WHERE user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_password_resets WHERE user_id = ANY($1::text[])`, [coreUserIds]);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = __dirname;
  const ipRoot = resolveIpRoot(scriptDir);
  const ipRequire = createRequire(path.join(ipRoot, 'package.json'));
  const pg = ipRequire('pg');
  const bcrypt = ipRequire('bcryptjs');

  const env = {
    ...readEnvFile(path.join(ipRoot, '.env')),
    ...readEnvFile(path.join(ipRoot, '.env.local')),
    ...process.env,
  };
  const connectionString = env.DATABASE_URL || env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error(`DATABASE_URL missing in ${ipRoot}`);

  coreCfg.assertProtectedConfigValid();

  const preserve = new Set(
    (CONFIG.preserveEmails || []).map((e) => String(e).toLowerCase()),
  );
  // Always include the three demo logins
  preserve.add(CONFIG.superadminEmail.toLowerCase());
  preserve.add(CONFIG.candidateBase.email.toLowerCase());
  preserve.add(CONFIG.employerBase.email.toLowerCase());

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { ensureIpPipelineSchema } = require(path.join(ipRoot, 'scripts', 'lib', 'ensureIpPipelineSchema.js'));
    await ensureIpPipelineSchema(client);
    const users = await client.query(`SELECT id,email,role FROM ip_users ORDER BY role,email`);
    const toDelete = users.rows.filter((u) => !preserve.has(String(u.email || '').toLowerCase()));
    console.log(`IP root: ${ipRoot}`);
    console.log(`Preserve cores: ${[...preserve].join(', ')}`);
    console.log(`Users in DB: ${users.rows.length}; will remove: ${toDelete.length}`);
    console.log(`Baseline Nova postings to seed: ${CORE_BASELINE_POSTINGS.length}`);
    if (args.dryRun) {
      console.log('Dry run only. Sample delete emails:');
      for (const u of toDelete.slice(0, 15)) console.log(`  - ${u.email}`);
      if (toDelete.length > 15) console.log(`  … +${toDelete.length - 15} more`);
      return;
    }
    if (!args.yes) {
      const c = await ask('Type RESET to continue: ');
      if (c !== 'RESET') return console.log('Cancelled.');
    }

    for (const u of toDelete) await deleteUserCascade(client, u.id, u.email);

    const superadminId = await ensureSuperadmin(client, bcrypt);
    // Ensure core login rows exist / password restored (do not delete them)
    const candUserId = await ensureUser(client, bcrypt, {
      email: CONFIG.candidateBase.email,
      role: 'candidate',
      name: CONFIG.candidateBase.name,
      points: 80,
      password: CONFIG.demoPassword,
    });
    await client.query(
      `UPDATE ip_users SET password_hash=$2, name=$3, active=true, role='candidate', updated_at=now() WHERE id=$1`,
      [candUserId, await bcrypt.hash(CONFIG.demoPassword, 10), CONFIG.candidateBase.name],
    );
    const empUserId = await ensureUser(client, bcrypt, {
      email: CONFIG.employerBase.email,
      role: 'employer',
      name: CONFIG.employerBase.company,
      points: 200,
      password: CONFIG.demoPassword,
    });
    await client.query(
      `UPDATE ip_users SET password_hash=$2, name=$3, active=true, role='employer', updated_at=now() WHERE id=$1`,
      [empUserId, await bcrypt.hash(CONFIG.demoPassword, 10), CONFIG.employerBase.company],
    );

    const candRow = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [candUserId]);
    const empRow = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [empUserId]);

    console.log('Clearing transactional data on preserved cores…');
    await clearCoreOwnedData(client, {
      candidateUserId: candUserId,
      employerUserId: empUserId,
      candidateId: candRow.rows[0]?.id || null,
      employerId: empRow.rows[0]?.id || null,
      superadminId,
    });

    for (const table of ['ip_feature_idea_votes', 'ip_feature_idea_comments', 'ip_feature_ideas', 'ip_employer_requests']) {
      if (await tableExists(client, table)) await client.query(`DELETE FROM ${table}`);
    }

    await seedCoreBaseline(client, bcrypt);
    console.log('Reset complete. Three cores preserved; baseline catalog + cast/support transactions restored.');
    console.log(`  Candidate  ${CONFIG.candidateBase.email} / ${CONFIG.demoPassword}`);
    console.log(`  Employer   ${CONFIG.employerBase.email} / ${CONFIG.demoPassword}`);
    console.log(`  SuperAdmin ${CONFIG.superadminEmail} / ${CONFIG.demoPassword}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
