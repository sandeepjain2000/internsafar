#!/usr/bin/env node
/**
 * Fill EMPLOYER + SUPERADMIN coverage on the core accounts, to the same depth the
 * core candidate already has: every status tab / queue / workbench table has rows.
 *
 *   npm run fill:core-coverage              # apply (idempotent)
 *   npm run fill:core-coverage -- --dry-run # report the deficit only
 *   npm run fill:core-coverage -- --target=15
 *
 * Idempotent: it inserts only the deficit against --target (default 11, i.e. more
 * than one page of 10). Re-running when already covered writes nothing.
 *
 * Never touches core identity (email / password / role) and never deletes.
 * Helper accounts it creates are tagged with generated_run_id so
 * `delete:ip-generated-run` can remove them.
 *
 * Filler employer accounts use +aliases of the core employer address; filler
 * candidates use +aliases of the core candidate address.
 *
 * Integrity rules respected (see check-ip-db-integrity.mjs):
 *  - applications must point at a published, live-window internship, so the
 *    draft / paused / closed / scheduled / expired postings created here are
 *    deliberately application-free
 *  - an accepted offer requires its application to be hired or completed
 *  - a declined offer requires its application NOT to be hired/completed
 *  - bulk_message_recipients.message_id stays NULL (no dangling message ids)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { qaDbId, qaRunLabel } from './lib/ipQaNaming.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

const cfg = require('./lib/ipCoreSampleConfig.js');
const text = require('./lib/ipDemoText.js');
const { claimCompanyName } = require('./lib/ipCompanyCatalog.js');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const TARGET = Number((args.find((a) => a.startsWith('--target=')) || '').split('=')[1] || 11);
const RUN_ID = (args.find((a) => a.startsWith('--run-id=')) || '').split('=')[1]
  || `corecov_${qaRunLabel()}`;

/** Employer-side filler logins are +aliases of the core employer address. */
function employerAlias(slug) {
  const [local, domain] = cfg.EMP_BASE.split('@');
  return `${local}+${slug}@${domain}`.toLowerCase();
}
/** Candidate-side filler logins are +aliases of the core candidate address. */
function candidateAlias(slug) {
  const [local, domain] = cfg.CAND_BASE.split('@');
  const base = local.includes('+') ? local.slice(0, local.indexOf('+')) : local;
  return `${base}+${slug}@${domain}`.toLowerCase();
}

const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
if (!rawUrl) {
  console.error('DATABASE_URL (or SUPABASE_DATABASE_URL) is required.');
  process.exit(1);
}
const url = new URL(rawUrl);
const pool = new pg.Pool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 5432,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const plan = [];
const done = [];
let client;

const rows = async (sql, params = []) => (await client.query(sql, params)).rows;
const count = async (sql, params = []) => Number((await rows(sql, params))[0]?.n || 0);

/** Record a deficit and, unless dry-run, let the caller fill it. */
function deficit(label, current, target = TARGET) {
  const missing = Math.max(0, target - current);
  plan.push({ item: label, current, target, missing });
  return missing;
}

async function write(sql, params = []) {
  if (DRY) return { rowCount: 0 };
  return client.query(sql, params);
}

function noted(label, n) {
  if (n > 0) done.push(`${label}: +${n}`);
}

/**
 * Company names for accounts this script creates.
 *
 * Index-based naming is not safe here: each bucket below starts its own counter, so
 * fixed offsets eventually collide and two accounts end up showing the same company —
 * which makes their distinct postings read as one internship listed twice. Names are
 * claimed against what the database already holds instead.
 */
let takenCompanies = null;
async function nextCompany() {
  if (!takenCompanies) {
    takenCompanies = new Set(
      (await rows(
        `SELECT company_name FROM ip_employers
         UNION SELECT company_name FROM ip_employer_requests`,
      )).map((r) => String(r.company_name || '').trim()).filter(Boolean),
    );
  }
  return claimCompanyName(takenCompanies);
}

async function main() {
  client = await pool.connect();

  const [emp] = await rows(`SELECT id, name FROM ip_users WHERE lower(email) = $1`, [cfg.EMP_BASE.toLowerCase()]);
  const [sa] = await rows(`SELECT id FROM ip_users WHERE lower(email) = $1`, [cfg.SUPERADMIN_EMAIL.toLowerCase()]);
  const [cand] = await rows(`SELECT id FROM ip_users WHERE lower(email) = $1`, [cfg.CAND_BASE.toLowerCase()]);
  if (!emp || !sa || !cand) throw new Error('Core accounts missing — seed/reset the cores first.');
  const [employer] = await rows(`SELECT id FROM ip_employers WHERE user_id = $1`, [emp.id]);
  if (!employer) throw new Error('No ip_employers row for the core employer.');

  const passwordHash = await bcrypt.hash(cfg.DEMO_PASSWORD, 10);

  await write(
    `INSERT INTO ip_generated_runs (run_id, meta) VALUES ($1, $2::jsonb)
     ON CONFLICT (run_id) DO NOTHING`,
    [RUN_ID, JSON.stringify({ mode: 'core-coverage', target: TARGET })],
  );

  // ---------------------------------------------------------------- postings
  // Application-free by design (see integrity note in the header).
  const postingBuckets = [
    ['draft', `status = 'draft'`, { status: 'draft' }],
    ['paused', `status = 'paused'`, { status: 'paused' }],
    ['closed', `status = 'closed'`, { status: 'closed', closed_reason: 'Filled internally' }],
    ['published_scheduled', `status = 'published' AND starts_at > now()`, { status: 'published', starts_at: "now() + interval '20 days'", apply_ends_at: "now() + interval '60 days'" }],
    ['published_closing_soon', `status = 'published' AND apply_ends_at > now() AND apply_ends_at < now() + interval '48 hours'`, { status: 'published', starts_at: "now() - interval '5 days'", apply_ends_at: "now() + interval '30 hours'" }],
    ['published_expired', `status = 'published' AND apply_ends_at <= now()`, { status: 'published', starts_at: "now() - interval '60 days'", apply_ends_at: "now() - interval '2 days'" }],
  ];
  // Stable per-bucket offset into the title pool, so each status bucket draws a
  // different slice of role names.
  const titleSeed = (label) =>
    [...label].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % text.ROLES.length;

  for (const [label, where, shape] of postingBuckets) {
    const current = await count(
      `SELECT count(*)::int n FROM ip_internships WHERE employer_id = $1 AND ${where}`,
      [employer.id],
    );
    const missing = deficit(`postings.${label}`, current);
    for (let i = 0; i < missing; i += 1) {
      // Offset per bucket so 'draft' and 'closed' do not reuse the same titles.
      const t = titleSeed(label) + i;
      await write(
        `INSERT INTO ip_internships (
           id, employer_id, title, description, location, work_mode, stipend_inr, duration_months,
           status, closed_reason, starts_at, apply_ends_at, eligibility
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${shape.starts_at || 'NULL'},${shape.apply_ends_at || 'NULL'},$11::jsonb)`,
        [
          qaDbId('ip_intern'),
          employer.id,
          text.internshipTitle(t),
          text.internshipDescription(t),
          text.city(t),
          ['hybrid', 'remote', 'onsite'][t % 3],
          [12000, 15000, 18000, 22000, 25000, 30000][t % 6],
          [2, 3, 6][t % 3],
          shape.status,
          shape.closed_reason || null,
          JSON.stringify({ requirements_text: text.internshipRequirements(t) }),
        ],
      );
    }
    noted(`postings.${label}`, missing);
  }

  // ------------------------------------------------------ applications: completed
  // Promote from 'hired' only, and never one carrying a declined offer.
  const completed = await count(
    `SELECT count(*)::int n FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.status = 'completed'`,
    [employer.id],
  );
  const needCompleted = deficit('applications.completed', completed);
  if (needCompleted) {
    const promote = await rows(
      `SELECT a.id FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
       WHERE i.employer_id = $1 AND a.status = 'hired'
         AND NOT EXISTS (SELECT 1 FROM ip_offers o WHERE o.application_id = a.id AND o.status = 'declined')
       LIMIT $2`,
      [employer.id, needCompleted],
    );
    for (const [i, r] of promote.entries()) {
      await write(
        `UPDATE ip_applications
         SET status = 'completed', completed_at = now() - interval '9 days',
             completion_notes = $2, updated_at = now()
         WHERE id = $1`,
        [r.id, text.completionNote(i)],
      );
    }
    noted('applications.completed', promote.length);
  }

  // ------------------------------------------------- offers: expired-badge rows
  // Pending offer past valid_until = the "Expired" badge on /employer/offers.
  const expiredBadge = await count(
    `SELECT count(*)::int n FROM ip_offers WHERE employer_id = $1 AND status = 'pending' AND valid_until < now()`,
    [employer.id],
  );
  const needExpiredBadge = deficit('offers.pending_past_valid_until', expiredBadge);
  if (needExpiredBadge) {
    const pend = await rows(
      `SELECT id FROM ip_offers
       WHERE employer_id = $1 AND status = 'pending' AND (valid_until IS NULL OR valid_until >= now())
       LIMIT $2`,
      [employer.id, needExpiredBadge],
    );
    for (const r of pend) {
      await write(`UPDATE ip_offers SET valid_until = (now() - interval '6 days')::date WHERE id = $1`, [r.id]);
    }
    noted('offers.pending_past_valid_until', pend.length);
  }

  // ------------------------------------------------------------- notifications
  const NOTIF = {
    application: { title: 'New applicant on your posting', link: '/employer/internships' },
    interview: { title: 'Interview scheduled with a candidate', link: '/employer/internships' },
    message: { title: 'New message from a candidate', link: '/employer/messages' },
    offer: { title: 'Offer response received', link: '/employer/offers' },
    referral: { title: 'Referral points credited to your account', link: '/employer/referral' },
    system: { title: 'Platform maintenance window announced', link: '/employer' },
  };
  const SA_NOTIF = {
    application: { title: 'Application volume spike flagged for review', link: '/superadmin' },
    interview: { title: 'Interview activity report ready', link: '/superadmin' },
    message: { title: 'Feature idea comment needs moderation', link: '/superadmin/feature-ideas' },
    offer: { title: 'Offer dispute escalated by a candidate', link: '/superadmin' },
    referral: { title: 'Referral abuse pattern flagged', link: '/superadmin/viral' },
    system: { title: 'Employer approval required — domain mismatch', link: '/superadmin/approvals' },
  };
  for (const [userLabel, userId, table] of [['employer', emp.id, NOTIF], ['superadmin', sa.id, SA_NOTIF]]) {
    for (const [category, shape] of Object.entries(table)) {
      const current = await count(
        `SELECT count(*)::int n FROM ip_notifications WHERE user_id = $1 AND category = $2`,
        [userId, category],
      );
      const missing = deficit(`notifications.${userLabel}.${category}`, current);
      for (let i = 0; i < missing; i += 1) {
        await write(
          `INSERT INTO ip_notifications (id, user_id, title, body, link, category, read_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' hours')::interval)`,
          [
            qaDbId('ip_notif'),
            userId,
            shape.title,
            text.notificationBody(category, i),
            shape.link,
            category,
            i % 3 === 0 ? new Date() : null,
            String(i * 5),
          ],
        );
      }
      noted(`notifications.${userLabel}.${category}`, missing);
    }
  }

  // --------------------------------------------------- employer workbench tables
  const appIds = (
    await rows(
      `SELECT a.id, a.candidate_id, a.internship_id, c.user_id AS candidate_user_id
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       JOIN ip_candidates c ON c.id = a.candidate_id
       WHERE i.employer_id = $1
       ORDER BY a.created_at DESC LIMIT 60`,
      [employer.id],
    )
  );
  if (!appIds.length) throw new Error('Core employer has no applications to attach workbench rows to.');
  const pick = (i) => appIds[i % appIds.length];

  const notes = await count(`SELECT count(*)::int n FROM ip_application_notes WHERE employer_id = $1`, [employer.id]);
  let missing = deficit('workbench.application_notes', notes);
  for (let i = 0; i < missing; i += 1) {
    await write(
      `INSERT INTO ip_application_notes (id, application_id, employer_id, author_user_id, body)
       VALUES ($1,$2,$3,$4,$5)`,
      [qaDbId('ip_note'), pick(i).id, employer.id, emp.id, `Screening note ${i + 1}: strong fit on the core stack, follow up after the technical round.`],
    );
  }
  noted('workbench.application_notes', missing);

  const events = await count(
    `SELECT count(*)::int n FROM ip_application_events e
     JOIN ip_applications a ON a.id = e.application_id
     JOIN ip_internships i ON i.id = a.internship_id WHERE i.employer_id = $1`,
    [employer.id],
  );
  missing = deficit('workbench.application_events', events);
  const EVENT_TYPES = ['status_changed', 'note_added', 'message_sent', 'interview_scheduled', 'offer_sent'];
  for (let i = 0; i < missing; i += 1) {
    await write(
      `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb, now() - ($6 || ' hours')::interval)`,
      [qaDbId('ip_evt'), pick(i).id, emp.id, EVENT_TYPES[i % EVENT_TYPES.length], JSON.stringify({ source: 'core-coverage' }), String(i * 7)],
    );
  }
  noted('workbench.application_events', missing);

  const reminders = await count(`SELECT count(*)::int n FROM ip_follow_up_reminders WHERE employer_id = $1`, [employer.id]);
  missing = deficit('workbench.follow_up_reminders', reminders);
  for (let i = 0; i < missing; i += 1) {
    const a = pick(i);
    await write(
      `INSERT INTO ip_follow_up_reminders (id, employer_id, application_id, internship_id, remind_at, note, completed_at)
       VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval, $6, $7)`,
      [qaDbId('ip_rem'), employer.id, a.id, a.internship_id, String((i % 9) + 1), `Follow up with this candidate (${i + 1})`, i % 4 === 0 ? new Date() : null],
    );
  }
  noted('workbench.follow_up_reminders', missing);

  const bulkJobs = await count(`SELECT count(*)::int n FROM ip_bulk_message_jobs WHERE employer_id = $1`, [employer.id]);
  missing = deficit('workbench.bulk_message_jobs', bulkJobs);
  const BULK_STATUS = ['pending', 'running', 'done'];
  for (let i = 0; i < missing; i += 1) {
    const jobId = qaDbId('ip_bmj');
    const a = pick(i);
    await write(
      `INSERT INTO ip_bulk_message_jobs (id, employer_id, internship_id, body_template, status)
       VALUES ($1,$2,$3,$4,$5)`,
      [jobId, employer.id, a.internship_id, 'Hi {{name}}, thanks for applying — next steps below.', BULK_STATUS[i % BULK_STATUS.length]],
    );
    for (let r = 0; r < 3; r += 1) {
      const rec = pick(i + r);
      await write(
        `INSERT INTO ip_bulk_message_recipients (id, job_id, application_id, candidate_user_id, personalized_body, status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [qaDbId('ip_bmr'), jobId, rec.id, rec.candidate_user_id, 'Hi there, thanks for applying — next steps below.', ['pending', 'sent', 'failed'][r % 3]],
      );
    }
  }
  noted('workbench.bulk_message_jobs', missing);

  const exportJobs = await count(`SELECT count(*)::int n FROM ip_export_jobs WHERE employer_id = $1`, [employer.id]);
  missing = deficit('workbench.export_jobs', exportJobs);
  const EXPORT_STATUS = ['pending', 'processing', 'done', 'failed'];
  for (let i = 0; i < missing; i += 1) {
    const status = EXPORT_STATUS[i % EXPORT_STATUS.length];
    const a = pick(i);
    await write(
      `INSERT INTO ip_export_jobs (
         id, employer_id, internship_id, created_by_user_id, status, include_resumes,
         application_ids, progress, total, error, result_filename, completed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
      [
        qaDbId('ip_exp'), employer.id, a.internship_id, emp.id, status, i % 2 === 0,
        JSON.stringify([a.id]), status === 'done' ? 1 : 0, 1,
        status === 'failed' ? 'Resume archive exceeded the size limit' : null,
        status === 'done' ? `applicants-${i + 1}.csv` : null,
        status === 'done' ? new Date() : null,
      ],
    );
  }
  noted('workbench.export_jobs', missing);

  const lists = await count(`SELECT count(*)::int n FROM ip_employer_lists WHERE employer_id = $1`, [employer.id]);
  missing = deficit('workbench.employer_lists', lists);
  for (let i = 0; i < missing; i += 1) {
    const listId = qaDbId('ip_elist');
    await write(`INSERT INTO ip_employer_lists (id, employer_id, name) VALUES ($1,$2,$3)`, [
      listId, employer.id, text.listName(i),
    ]);
    for (let m = 0; m < 3; m += 1) {
      await write(
        `INSERT INTO ip_employer_list_members (id, list_id, application_id) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [qaDbId('ip_elm'), listId, pick(i + m).id],
      );
    }
  }
  noted('workbench.employer_lists', missing);

  const templates = await count(`SELECT count(*)::int n FROM ip_rejection_templates WHERE employer_id = $1`, [employer.id]);
  missing = deficit('workbench.rejection_templates', templates);
  for (let i = 0; i < missing; i += 1) {
    await write(
      `INSERT INTO ip_rejection_templates (id, employer_id, name, body, is_system, version)
       VALUES ($1,$2,$3,$4,false,1)`,
      [qaDbId('ip_rtpl'), employer.id, text.rejectionTemplate(i).name, text.rejectionTemplate(i).body],
    );
  }
  noted('workbench.rejection_templates', missing);

  // Presets are per-internship (`employer.applicants.<id>`) and the product caps
  // them at 5 per key. Never write the bare 'employer.applicants' key:
  // ensureIpWorkbenchSchema treats it as legacy and fans it out to EVERY
  // internship, which would consume the cap on every pipeline page. Seed two on
  // one posting — enough to exercise the preset bar and the default-on-load path
  // while leaving room for the user to add their own.
  const [presetPosting] = await rows(
    `SELECT id FROM ip_internships WHERE employer_id = $1 AND status = 'published' ORDER BY created_at LIMIT 1`,
    [employer.id],
  );
  if (presetPosting) {
    const presetKey = `employer.applicants.${presetPosting.id}`;
    const savedViews = await count(
      `SELECT count(*)::int n FROM ip_saved_applicant_views WHERE user_id = $1 AND table_key = $2`,
      [emp.id, presetKey],
    );
    missing = deficit('workbench.saved_applicant_views', savedViews, 2);
    const PRESETS = [
      { name: 'Shortlisted, best match', filters: { status: 'shortlisted' }, sort: 'match', isDefault: true },
      { name: 'Awaiting my reply', filters: { unread: '1' }, sort: 'recent', isDefault: false },
    ];
    for (let i = 0; i < missing; i += 1) {
      const p = PRESETS[(PRESETS.length - missing + i) % PRESETS.length];
      await write(
        `INSERT INTO ip_saved_applicant_views (id, employer_id, user_id, table_key, name, filters, sort, is_default)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         ON CONFLICT DO NOTHING`,
        [qaDbId('ip_sav'), employer.id, emp.id, presetKey, p.name, JSON.stringify(p.filters), p.sort, p.isDefault],
      );
    }
    noted('workbench.saved_applicant_views', missing);
  }

  // ------------------------------------------------------- superadmin: employers
  for (const status of ['rejected', 'suspended']) {
    const current = await count(`SELECT count(*)::int n FROM ip_employers WHERE approval_status = $1`, [status]);
    const need = deficit(`superadmin.employers.${status}`, current);
    for (let i = 0; i < need; i += 1) {
      const userId = qaDbId('ip_user');
      const email = employerAlias(`${status}${i + 1}`);
      const company = await nextCompany();
      // Reject/suspend only moves ip_employers.approval_status; the SuperAdmin
      // action never deactivates the login, so active stays true.
      const inserted = await write(
        `INSERT INTO ip_users (id, email, password_hash, role, name, generated_run_id, active, registration_source)
         VALUES ($1,$2,$3,'employer',$4,$5,true,'form')
         ON CONFLICT (email) DO NOTHING`,
        [userId, email, passwordHash, company, RUN_ID],
      );
      if (!DRY && !inserted.rowCount) continue;
      const reason = status === 'rejected'
        ? 'Verification documents did not match the registered entity.'
        : 'Suspended pending re-verification.';
      await write(
        `INSERT INTO ip_employers (
           id, user_id, company_name, website, work_email, approval_status, rejection_reason,
           approval_reviewed_at, business_entity_type, hq_city
         ) VALUES ($1,$2,$3,$4,$5,$6,$7, now() - interval '3 days','Private Limited','Pune')`,
        [qaDbId('ip_emp'), userId, company, cfg.EMP_BASE_WEBSITE, email, status, reason],
      );
      // The same action also notifies the employer (see superadmin/employers/[id]).
      await write(
        `INSERT INTO ip_notifications (id, user_id, title, body, link, category)
         VALUES ($1,$2,$3,$4,'/employer','system')`,
        [qaDbId('ip_notif'), userId, `Employer account ${status}`, `${company}: ${reason}`],
      );
    }
    noted(`superadmin.employers.${status}`, need);
  }

  // ----------------------------------------------- superadmin: manual requests
  for (const status of ['pending', 'approved', 'rejected']) {
    const current = await count(`SELECT count(*)::int n FROM ip_employer_requests WHERE status = $1`, [status]);
    const need = deficit(`superadmin.employer_requests.${status}`, current);
    for (let i = 0; i < need; i += 1) {
      const seed = i + 80 + status.length;
      const company = await nextCompany();
      const contactEmail = employerAlias(`req-${status}${i + 1}`);
      const contactName = text.personName(seed);
      // Approving a request always creates the employer account and links it
      // back via created_user_id (see superadmin/requests). Mirror that here so
      // the approved tab never shows a request with no account behind it.
      let createdUserId = null;
      if (status === 'approved') {
        createdUserId = qaDbId('ip_user');
        const inserted = await write(
          `INSERT INTO ip_users (
             id, email, password_hash, role, name, points, free_post_credits,
             registration_source, form_approval_status, active, generated_run_id
           ) VALUES ($1,$2,$3,'employer',$4,50,1,'form','approved',true,$5)
           ON CONFLICT (email) DO NOTHING`,
          [createdUserId, contactEmail, passwordHash, contactName, RUN_ID],
        );
        if (!DRY && !inserted.rowCount) continue;
        await write(
          `INSERT INTO ip_employers (
             id, user_id, company_name, website, work_email, contact_name, contact_designation,
             business_entity_type, approval_status, approval_reviewed_at
           ) VALUES ($1,$2,$3,$4,$5,$6,'Talent Lead','Private Limited','approved', now())`,
          [qaDbId('ip_emp'), createdUserId, company, cfg.EMP_BASE_WEBSITE, contactEmail, contactName],
        );
      }
      await write(
        `INSERT INTO ip_employer_requests (
           id, company_name, website, contact_email, contact_name, contact_designation, reason,
           status, reviewer_id, reviewed_at, rejection_reason, business_entity_type, password_hash,
           created_user_id
         ) VALUES ($1,$2,$3,$4,$5,'Talent Lead',$6,$7,$8,$9,$10,'Private Limited',$11,$12)`,
        [
          qaDbId('ip_ereq'),
          company,
          cfg.EMP_BASE_WEBSITE,
          contactEmail,
          contactName,
          'Manual onboarding requested — company is not on a public domain yet.',
          status,
          status === 'pending' ? null : sa.id,
          status === 'pending' ? null : new Date(),
          status === 'rejected' ? 'Could not verify the company registration.' : null,
          passwordHash,
          createdUserId,
        ],
      );
    }
    noted(`superadmin.employer_requests.${status}`, need);
  }

  // --------------------------------------------------- superadmin: documents
  const docEmployers = await rows(
    `SELECT id FROM ip_employers ORDER BY (user_id = $1) DESC, created_at DESC LIMIT 12`,
    [emp.id],
  );
  // Exactly the list src/app/employer/profile/page.js offers — do not invent types.
  const DOC_TYPES = ['Shop Act', 'LLP registration', 'Business PAN', 'Other'];
  for (const docType of DOC_TYPES) {
    for (const reviewStatus of ['pending', 'approved', 'flagged']) {
      const current = await count(
        `SELECT count(*)::int n FROM ip_employer_documents WHERE doc_type = $1 AND review_status = $2`,
        [docType, reviewStatus],
      );
      // Each doc-type filter and each review tab needs rows; a third of the
      // target per (type,status) cell keeps both dimensions above the bar.
      const cellTarget = Math.ceil(TARGET / 3) + 1;
      const need = deficit(`superadmin.documents.${docType}.${reviewStatus}`, current, cellTarget);
      for (let i = 0; i < need; i += 1) {
        const owner = docEmployers[(i + DOC_TYPES.indexOf(docType)) % docEmployers.length];
        await write(
          `INSERT INTO ip_employer_documents (
             id, employer_id, doc_type, file_name, url, review_status, review_notes, reviewed_at, file_size
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            qaDbId('ip_doc'), owner.id, docType,
            `${docType.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.pdf`,
            'https://placementhub.online/sample-verification-document.pdf',
            reviewStatus,
            reviewStatus === 'flagged' ? 'Document is expired — employer asked to re-upload.' : null,
            reviewStatus === 'pending' ? null : new Date(),
            420000 + i * 1000,
          ],
        );
      }
      noted(`superadmin.documents.${docType}.${reviewStatus}`, need);
    }
  }

  // -------------------------------------------------- superadmin: promotions
  const promoInternships = await rows(
    `SELECT id FROM ip_internships WHERE employer_id = $1 AND status = 'published' LIMIT 20`,
    [employer.id],
  );
  const PROMO_STATUS = ['pending', 'fast_track_pending', 'verified', 'rewarded', 'failed'];
  for (const status of PROMO_STATUS) {
    const current = await count(`SELECT count(*)::int n FROM ip_linkedin_promotions WHERE status = $1`, [status]);
    const need = deficit(`superadmin.promotions.${status}`, current);
    for (let i = 0; i < need; i += 1) {
      const reviewed = status === 'verified' || status === 'rewarded' || status === 'failed';
      await write(
        `INSERT INTO ip_linkedin_promotions (
           id, employer_id, internship_id, token, status, share_url, claimed_post_url,
           points_awarded, credits_awarded, review_notes, reviewed_by, reviewed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          qaDbId('ip_promo'), employer.id,
          promoInternships[i % promoInternships.length].id,
          `promo-${status}-${qaRunLabel()}-${i + 1}`,
          status,
          'https://placementhub.online/share/internship',
          status === 'pending' ? null : 'https://www.linkedin.com/posts/placementhub-coverage',
          status === 'rewarded' ? 25 : 0,
          status === 'rewarded' ? 1 : 0,
          status === 'failed' ? 'Claimed post could not be found on the profile.' : null,
          reviewed ? sa.id : null,
          reviewed ? new Date() : null,
        ],
      );
    }
    noted(`superadmin.promotions.${status}`, need);
  }

  // ------------------------------------------------- superadmin: viral shares
  const shareUsers = [emp.id, cand.id, sa.id];
  const VIRAL_STATUS = ['pending', 'scheduled', 'searching', 'verified', 'failed', 'rewarded', 'fast_track_pending'];
  const VIRAL_CHANNELS = ['linkedin', 'whatsapp', 'twitter', 'other'];
  for (const status of VIRAL_STATUS) {
    const current = await count(`SELECT count(*)::int n FROM ip_viral_shares WHERE status = $1`, [status]);
    const need = deficit(`superadmin.viral.${status}`, current);
    for (let i = 0; i < need; i += 1) {
      const reviewed = ['verified', 'rewarded', 'failed'].includes(status);
      await write(
        `INSERT INTO ip_viral_shares (
           id, user_id, channel, token, share_url, claimed_post_url, status, check_after,
           last_checked_at, search_hit, search_notes, points_awarded, credits_awarded, reviewed_by, reviewed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '1 day', $8,$9,$10,$11,$12,$13,$14)`,
        [
          qaDbId('ip_viral'),
          shareUsers[i % shareUsers.length],
          VIRAL_CHANNELS[i % VIRAL_CHANNELS.length],
          `viral-${status}-${qaRunLabel()}-${i + 1}`,
          'https://placementhub.online/share/referral',
          status === 'pending' ? null : 'https://www.linkedin.com/posts/placementhub-share',
          status,
          reviewed ? new Date() : null,
          status === 'verified' || status === 'rewarded' ? true : (status === 'failed' ? false : null),
          status === 'failed' ? 'No matching public post found in three attempts.' : null,
          status === 'rewarded' ? 15 : 0,
          status === 'rewarded' ? 1 : 0,
          reviewed ? sa.id : null,
          reviewed ? new Date() : null,
        ],
      );
    }
    noted(`superadmin.viral.${status}`, need);
  }
  for (const channel of VIRAL_CHANNELS) {
    const current = await count(`SELECT count(*)::int n FROM ip_viral_shares WHERE channel = $1`, [channel]);
    const need = deficit(`superadmin.viral.channel.${channel}`, current);
    for (let i = 0; i < need; i += 1) {
      await write(
        `INSERT INTO ip_viral_shares (id, user_id, channel, token, share_url, status, check_after)
         VALUES ($1,$2,$3,$4,$5,'scheduled', now() + interval '2 days')`,
        [
          qaDbId('ip_viral'), shareUsers[i % shareUsers.length], channel,
          `viral-ch-${channel}-${qaRunLabel()}-${i + 1}`,
          'https://placementhub.online/share/referral',
        ],
      );
    }
    noted(`superadmin.viral.channel.${channel}`, need);
  }

  // ------------------------------- superadmin: candidate form registrations
  // New users only: form_approval_status='pending' blocks sign-in, so existing
  // cast candidates must never be flipped into that state.
  for (const status of ['pending', 'approved']) {
    const current = await count(
      `SELECT count(*)::int n FROM ip_users
       WHERE role = 'candidate' AND registration_source = 'form' AND form_approval_status = $1`,
      [status],
    );
    const need = deficit(`superadmin.form_registrations.${status}`, current);
    for (let i = 0; i < need; i += 1) {
      const userId = qaDbId('ip_user');
      const email = candidateAlias(`formreg-${status}${i + 1}`);
      const name = `Form Reg ${status} ${i + 1}`;
      const inserted = await write(
        `INSERT INTO ip_users (
           id, email, password_hash, role, name, generated_run_id, active,
           registration_source, form_approval_status
         ) VALUES ($1,$2,$3,'candidate',$4,$5,$6,'form',$7)
         ON CONFLICT (email) DO NOTHING`,
        [userId, email, passwordHash, name, RUN_ID, status === 'approved', status],
      );
      if (!DRY && !inserted.rowCount) continue;
      await write(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, degree, graduation_year, city)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          qaDbId('ip_cand'), userId, name, email,
          text.college(i + status.length),
          ['B.Tech', 'B.E.', 'BCA', 'B.Sc', 'MCA'][i % 5],
          2026 + (i % 3),
          text.city(i + 2),
        ],
      );
    }
    noted(`superadmin.form_registrations.${status}`, need);
  }

  // ----------------------------------------------- superadmin: feature ideas
  const [categoryRow] = await rows(`SELECT id FROM ip_idea_categories ORDER BY sort_order LIMIT 1`);
  const IDEA_STATUS = ['Pending approval', 'Under review', 'In progress', 'Planned', 'Shipped', 'Declined'];
  for (const [statusIndex, status] of IDEA_STATUS.entries()) {
    // A distinct block of the idea pool per roadmap column, so no two columns
    // show the same idea title.
    const ideaSeed = statusIndex * TARGET;
    const current = await count(`SELECT count(*)::int n FROM ip_feature_ideas WHERE status = $1`, [status]);
    const need = deficit(`superadmin.feature_ideas.${status}`, current);
    for (let i = 0; i < need; i += 1) {
      await write(
        `INSERT INTO ip_feature_ideas (
           id, author_user_id, title, description, status, category_id, priority, problem, solution, admin_note
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          qaDbId('ip_idea'), i % 2 === 0 ? cand.id : emp.id,
          text.featureIdea(ideaSeed + i).title,
          text.featureIdea(ideaSeed + i).description,
          status, categoryRow?.id || null, (i % 4) + 1,
          'Recruiters lose context when switching between tabs.',
          'Keep filters and sort persistent across navigation.',
          status === 'Declined' ? 'Out of scope for this quarter.' : null,
        ],
      );
    }
    noted(`superadmin.feature_ideas.${status}`, need);
  }

  const ideaPool = await rows(`SELECT id FROM ip_feature_ideas ORDER BY created_at DESC LIMIT 40`);
  const voters = [cand.id, emp.id, sa.id];
  const votes = await count(`SELECT count(*)::int n FROM ip_feature_idea_votes`);
  missing = deficit('superadmin.feature_idea_votes', votes);
  for (let i = 0; i < missing; i += 1) {
    await write(
      `INSERT INTO ip_feature_idea_votes (idea_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [ideaPool[i % ideaPool.length].id, voters[i % voters.length]],
    );
  }
  noted('superadmin.feature_idea_votes', missing);

  const comments = await count(`SELECT count(*)::int n FROM ip_feature_idea_comments`);
  missing = deficit('superadmin.feature_idea_comments', comments);
  for (let i = 0; i < missing; i += 1) {
    await write(
      `INSERT INTO ip_feature_idea_comments (id, idea_id, author_user_id, body) VALUES ($1,$2,$3,$4)`,
      [qaDbId('ip_icmt'), ideaPool[i % ideaPool.length].id, voters[i % voters.length], text.ideaComment(i)],
    );
  }
  noted('superadmin.feature_idea_comments', missing);

  // ------------------------------------------------ superadmin: login report
  // src/lib/auth.js only ever writes these strings, and a failure that carries a
  // role also carries the user_id (role stays NULL for 'Unknown account').
  const FAILURE_REASONS = ['Bad Pass', 'Inactive account'];
  for (const [role, email, userId] of [
    ['employer', cfg.EMP_BASE, emp.id],
    ['superadmin', cfg.SUPERADMIN_EMAIL, sa.id],
    ['candidate', cfg.CAND_BASE, cand.id],
  ]) {
    const current = await count(
      `SELECT count(*)::int n FROM ip_login_events WHERE role = $1 AND success = false`,
      [role],
    );
    const need = deficit(`superadmin.login_events.${role}.failed`, current);
    for (let i = 0; i < need; i += 1) {
      await write(
        `INSERT INTO ip_login_events (
           id, user_id, email, role, success, ip_address, user_agent, auth_method, failure_reason, location, created_at
         ) VALUES ($1,$2,$3,$4,false,$5,$6,'Password Form',$7,$8, now() - ($9 || ' hours')::interval)`,
        [
          qaDbId('ip_login'), userId, email, role,
          `203.0.113.${(i % 250) + 1}`,
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
          FAILURE_REASONS[i % FAILURE_REASONS.length],
          ['Pune, Maharashtra, IN', 'Mumbai, Maharashtra, IN', 'Bengaluru, Karnataka, IN'][i % 3],
          String(i * 3),
        ],
      );
    }
    noted(`superadmin.login_events.${role}.failed`, need);
  }

  const stillMissing = plan.filter((p) => p.missing > 0);
  console.log(
    JSON.stringify(
      {
        mode: DRY ? 'DRY-RUN (nothing written)' : 'APPLIED',
        runId: RUN_ID,
        target: TARGET,
        deficitsFound: stillMissing.length,
        filled: done,
        deficits: stillMissing,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (err) {
  console.error(`fill-core-coverage failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  if (client) client.release();
  await pool.end();
}
