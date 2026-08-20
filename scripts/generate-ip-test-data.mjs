#!/usr/bin/env node
/**
 * InternSafar test-data generator — two modes:
 *
 *   --mode=gen-accounts   Create new +gen… users/postings/apps (default)
 *   --mode=core-fill      Fill the three CORE accounts so main tabs have visible data
 *                         (never changes core email / password / role)
 *
 * See scripts/IP_TEST_DATA_GUIDE.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createRequire } from 'module';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

const require = createRequire(import.meta.url);
const {
  DEMO_PASSWORD,
  PROTECTED_ACCOUNT_EMAILS,
  CAND_BASE,
  EMP_BASE,
  SUPERADMIN_EMAIL,
  CAND_BASE_NAME,
  EMP_BASE_NAME,
  assertProtectedConfigValid,
  isProtectedEmail,
} = require('./lib/ipCoreSampleConfig.js');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function loadDbUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    ''
  );
}

function parseUrl(rawUrl) {
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
  };
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function plusAddress(base, tag) {
  const [local, domain] = String(base).split('@');
  if (!domain) throw new Error('Invalid base mailbox');
  return `${local}+${tag}@${domain}`;
}

const MCQ = [
  {
    id: 'q1',
    prompt: 'Preferred work city?',
    type: 'mcq',
    required: true,
    order: 0,
    options: [
      { id: 'q1_a', label: 'Bengaluru', disablesApplication: false },
      { id: 'q1_b', label: 'Mumbai', disablesApplication: true },
    ],
    disableApplicationOnAnswers: true,
    disableTriggerOptionIds: ['q1_b'],
  },
];

async function ensureRunTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_generated_runs (
      run_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )`);
  await pool.query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS generated_run_id TEXT`);
}

async function requireCoreUsers(pool) {
  const r = await pool.query(
    `SELECT id, email, role FROM ip_users WHERE lower(email) = ANY($1::text[])`,
    [PROTECTED_ACCOUNT_EMAILS],
  );
  const byEmail = Object.fromEntries(r.rows.map((row) => [String(row.email).toLowerCase(), row]));
  for (const email of PROTECTED_ACCOUNT_EMAILS) {
    if (!byEmail[email]) {
      throw new Error(
        `Core account missing: ${email}. Create/login once or run core-sample seed before --mode=core-fill.`,
      );
    }
  }
  return byEmail;
}

async function modeGenAccounts(pool, opts) {
  const { employersN, candidatesN, postingsN, baseMailbox, password, runId } = opts;
  const hash = await bcrypt.hash(password, 10);
  const employerIds = [];
  const candidateIds = [];
  const internshipIds = [];

  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO ip_generated_runs (run_id, meta) VALUES ($1, $2::jsonb)`,
      [runId, JSON.stringify({ mode: 'gen-accounts', employersN, candidatesN, postingsN, baseMailbox })],
    );

    for (let i = 0; i < employersN; i += 1) {
      const email = plusAddress(baseMailbox, `genemp${i}_${runId.slice(-8)}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing to create protected email ${email}`);
      const userId = newId('ip_u');
      const empId = newId('ip_e');
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'employer',$4,true,500,$5)`,
        [userId, email, hash, `Gen Employer ${i}`, runId],
      );
      await pool.query(
        `INSERT INTO ip_employers (id, user_id, company_name, approval_status, work_email)
         VALUES ($1,$2,$3,'approved',$4)`,
        [empId, userId, `Gen Co ${i}`, email],
      );
      employerIds.push({ empId, userId, email });
    }

    for (let i = 0; i < candidatesN; i += 1) {
      const email = plusAddress(baseMailbox, `gencand${i}_${runId.slice(-8)}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing to create protected email ${email}`);
      const userId = newId('ip_u');
      const candId = newId('ip_c');
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'candidate',$4,true,200,$5)`,
        [userId, email, hash, `Gen Candidate ${i}`, runId],
      );
      await pool.query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, city, skills, searchable)
         VALUES ($1,$2,$3,$4,'Gen College','Bengaluru',$5::text[],true)`,
        [candId, userId, `Gen Candidate ${i}`, email, ['React', 'SQL']],
      );
      candidateIds.push({ candId, userId, email, name: `Gen Candidate ${i}` });
    }

    for (let i = 0; i < postingsN; i += 1) {
      const emp = employerIds[i % employerIds.length];
      const intId = newId('ip_int');
      await pool.query(
        `INSERT INTO ip_internships (
           id, employer_id, title, description, location, work_mode, stipend_inr, status,
           questions, locations, starts_at, show_employer_identity
         ) VALUES ($1,$2,$3,$4,'Bengaluru','Hybrid',15000,'published',$5::jsonb,'["Bengaluru"]'::jsonb, now() - interval '1 hour', true)`,
        [intId, emp.empId, `Gen Internship ${i}`, `Generated posting ${runId}`, JSON.stringify(MCQ)],
      );
      internshipIds.push(intId);

      for (let j = 0; j < Math.min(3, candidateIds.length); j += 1) {
        const cand = candidateIds[(i + j) % candidateIds.length];
        const opt = j % 2 === 0 ? 'q1_a' : 'q1_b';
        await pool.query(
          `INSERT INTO ip_applications (
             id, internship_id, candidate_id, status, match_score, answers,
             questions_snapshot, screening_disabled, screening_disable_reason
           ) VALUES ($1,$2,$3,'applied',80,$4::jsonb,$5::jsonb,$6,$7::jsonb)`,
          [
            newId('ip_app'),
            intId,
            cand.candId,
            JSON.stringify({ q1: opt }),
            JSON.stringify(MCQ),
            opt === 'q1_b',
            opt === 'q1_b'
              ? JSON.stringify({
                  questionId: 'q1',
                  prompt: 'Preferred work city?',
                  optionId: 'q1_b',
                  optionLabel: 'Mumbai',
                })
              : null,
          ],
        );
      }
    }

    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }

  return {
    mode: 'gen-accounts',
    runId,
    employers: employerIds.length,
    candidates: candidateIds.length,
    postings: internshipIds.length,
    deleteHint: `npm run delete:ip-generated-run -- --confirm-generated-run ${runId}`,
  };
}

async function modeCoreFill(pool, opts) {
  const { password, runId, supportCandidatesN } = opts;
  const hash = await bcrypt.hash(password, 10);
  const cores = await requireCoreUsers(pool);

  const candUser = cores[String(CAND_BASE).toLowerCase()];
  const empUser = cores[String(EMP_BASE).toLowerCase()];
  const saUser = cores[String(SUPERADMIN_EMAIL).toLowerCase()];

  if (candUser.role !== 'candidate') throw new Error(`Core ${CAND_BASE} must be role=candidate`);
  if (empUser.role !== 'employer') throw new Error(`Core ${EMP_BASE} must be role=employer`);
  if (saUser.role !== 'superadmin') throw new Error(`Core ${SUPERADMIN_EMAIL} must be role=superadmin`);

  const empRow = (
    await pool.query(`SELECT id, company_name FROM ip_employers WHERE user_id = $1`, [empUser.id])
  ).rows[0];
  const candRow = (
    await pool.query(`SELECT id, name FROM ip_candidates WHERE user_id = $1`, [candUser.id])
  ).rows[0];
  if (!empRow) throw new Error('Core employer profile missing');
  if (!candRow) throw new Error('Core candidate profile missing');

  const created = {
    supportCandidates: 0,
    supportEmployersPending: 0,
    postings: 0,
    applications: 0,
    saved: 0,
    messages: 0,
    offers: 0,
    lists: 0,
    templates: 0,
    notifications: 0,
  };

  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO ip_generated_runs (run_id, meta) VALUES ($1, $2::jsonb)
       ON CONFLICT (run_id) DO UPDATE SET meta = excluded.meta`,
      [
        runId,
        JSON.stringify({
          mode: 'core-fill',
          cores: PROTECTED_ACCOUNT_EMAILS,
          note: 'Support +gen users tagged with this run; cores identity untouched',
        }),
      ],
    );

    // Ensure core users have points / profile flags (identity untouched)
    await pool.query(
      `UPDATE ip_users SET profile_complete = true, points = GREATEST(COALESCE(points,0), 200), updated_at = now()
       WHERE id = $1`,
      [candUser.id],
    );
    await pool.query(
      `UPDATE ip_users SET profile_complete = true, points = GREATEST(COALESCE(points,0), 500), updated_at = now()
       WHERE id = $1`,
      [empUser.id],
    );
    await pool.query(
      `UPDATE ip_candidates SET
         name = COALESCE(NULLIF(name,''), $2),
         skills = CASE WHEN skills IS NULL OR cardinality(skills)=0 THEN ARRAY['React','TypeScript','Node'] ELSE skills END,
         city = COALESCE(NULLIF(city,''), 'Pune'),
         college = COALESCE(NULLIF(college,''), 'Demo College'),
         searchable = true,
         updated_at = now()
       WHERE id = $1`,
      [candRow.id, CAND_BASE_NAME],
    );

    // Support candidates (apply to core employer postings)
    const supportCands = [];
    for (let i = 0; i < supportCandidatesN; i += 1) {
      const email = plusAddress('lawsonlclintern@gmail.com', `corefill${i}_${runId.slice(-8)}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing protected email ${email}`);
      const userId = newId('ip_u');
      const candId = newId('ip_c');
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'candidate',$4,true,150,$5)`,
        [userId, email, hash, `CoreFill Candidate ${i}`, runId],
      );
      await pool.query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, city, skills, searchable)
         VALUES ($1,$2,$3,$4,'CoreFill College','Bengaluru',ARRAY['Python','SQL'],true)`,
        [candId, userId, `CoreFill Candidate ${i}`, email],
      );
      supportCands.push({ candId, userId, email, name: `CoreFill Candidate ${i}` });
      created.supportCandidates += 1;
    }

    // Pending employer for SuperAdmin Approvals tab
    {
      const email = plusAddress('lawsonlclintern@gmail.com', `corefillpend_${runId.slice(-8)}`);
      const userId = newId('ip_u');
      const empId = newId('ip_e');
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'employer',$4,false,0,$5)`,
        [userId, email, hash, 'CoreFill Pending Co', runId],
      );
      await pool.query(
        `INSERT INTO ip_employers (id, user_id, company_name, approval_status, work_email)
         VALUES ($1,$2,$3,'pending',$4)`,
        [empId, userId, `Pending Co ${runId.slice(-6)}`, email],
      );
      created.supportEmployersPending += 1;
    }

    // Core employer: ensure live postings with MCQ + volume
    const postingSpecs = [
      { title: 'Core Showcase Frontend Intern', status: 'published', location: 'Pune' },
      { title: 'Core Showcase Data Intern', status: 'published', location: 'Bengaluru' },
      { title: 'Core Showcase Draft Intern', status: 'draft', location: 'Remote' },
    ];
    const postingIds = [];
    for (const spec of postingSpecs) {
      const existing = await pool.query(
        `SELECT id FROM ip_internships WHERE employer_id = $1 AND title = $2 LIMIT 1`,
        [empRow.id, spec.title],
      );
      let intId = existing.rows[0]?.id;
      if (!intId) {
        intId = newId('ip_int');
        await pool.query(
          `INSERT INTO ip_internships (
             id, employer_id, title, description, location, work_mode, stipend_inr, status,
             questions, locations, starts_at, apply_ends_at, show_employer_identity
           ) VALUES (
             $1,$2,$3,$4,$5,'Hybrid',18000,$6,$7::jsonb,$8::jsonb,
             now() - interval '2 hours', now() + interval '14 days', true
           )`,
          [
            intId,
            empRow.id,
            spec.title,
            'Core-fill posting for tab visibility demos.',
            spec.location,
            spec.status,
            JSON.stringify(MCQ),
            JSON.stringify([spec.location]),
          ],
        );
        created.postings += 1;
      } else {
        await pool.query(
          `UPDATE ip_internships SET
             questions = $2::jsonb,
             status = $3,
             starts_at = COALESCE(starts_at, now() - interval '2 hours'),
             apply_ends_at = COALESCE(apply_ends_at, now() + interval '14 days'),
             updated_at = now()
           WHERE id = $1`,
          [intId, JSON.stringify(MCQ), spec.status],
        );
      }
      postingIds.push({ id: intId, status: spec.status });
    }

    const livePostings = postingIds.filter((p) => p.status === 'published');

    // Applications onto core employer live postings (support + core candidate)
    const statuses = ['applied', 'shortlisted', 'rejected', 'applied', 'applied'];
    for (const posting of livePostings) {
      for (let j = 0; j < supportCands.length; j += 1) {
        const cand = supportCands[j];
        const exists = await pool.query(
          `SELECT 1 FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2`,
          [posting.id, cand.candId],
        );
        if (exists.rows[0]) continue;
        const opt = j % 2 === 0 ? 'q1_a' : 'q1_b';
        const status = statuses[j % statuses.length];
        await pool.query(
          `INSERT INTO ip_applications (
             id, internship_id, candidate_id, status, match_score, answers,
             questions_snapshot, screening_disabled, screening_disable_reason
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb)`,
          [
            newId('ip_app'),
            posting.id,
            cand.candId,
            status,
            70 + j * 5,
            JSON.stringify({ q1: opt }),
            JSON.stringify(MCQ),
            opt === 'q1_b',
            opt === 'q1_b'
              ? JSON.stringify({
                  questionId: 'q1',
                  prompt: 'Preferred work city?',
                  optionId: 'q1_b',
                  optionLabel: 'Mumbai',
                })
              : null,
          ],
        );
        created.applications += 1;
      }

      // Core candidate applies to each live posting (idempotent)
      const coreApp = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2`,
        [posting.id, candRow.id],
      );
      if (!coreApp.rows[0]) {
        await pool.query(
          `INSERT INTO ip_applications (
             id, internship_id, candidate_id, status, match_score, answers, questions_snapshot
           ) VALUES ($1,$2,$3,'applied',92,$4::jsonb,$5::jsonb)`,
          [
            newId('ip_app'),
            posting.id,
            candRow.id,
            JSON.stringify({ q1: 'q1_a' }),
            JSON.stringify(MCQ),
          ],
        );
        created.applications += 1;
      }
    }

    // Candidate: saved internships
    if (livePostings[0]) {
      const savEx = await pool.query(
        `SELECT 1 FROM ip_saved_internships WHERE candidate_id = $1 AND internship_id = $2`,
        [candRow.id, livePostings[0].id],
      );
      if (!savEx.rows[0]) {
        await pool.query(
          `INSERT INTO ip_saved_internships (id, candidate_id, internship_id)
           VALUES ($1,$2,$3)`,
          [newId('ip_sav'), candRow.id, livePostings[0].id],
        );
        created.saved += 1;
      }
    }

    // Message thread core candidate ↔ core employer
    const threadId = newId('ip_th');
    const existingThread = await pool.query(
      `SELECT id FROM ip_message_threads
       WHERE candidate_user_id = $1 AND employer_user_id = $2
       LIMIT 1`,
      [candUser.id, empUser.id],
    );
    let tid = existingThread.rows[0]?.id;
    if (!tid) {
      await pool.query(
        `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id)
         VALUES ($1,$2,$3,$4)`,
        [threadId, livePostings[0]?.id || null, candUser.id, empUser.id],
      );
      tid = threadId;
    }
    const msgCount = await pool.query(
      `SELECT count(*)::int AS n FROM ip_messages WHERE thread_id = $1`,
      [tid],
    );
    if (Number(msgCount.rows[0].n) < 2) {
      await pool.query(
        `INSERT INTO ip_messages (id, thread_id, sender_user_id, body)
         VALUES ($1,$2,$3,$4)`,
        [newId('ip_msg'), tid, empUser.id, 'Thanks for applying — please share your preferred start week.'],
      );
      await pool.query(
        `INSERT INTO ip_messages (id, thread_id, sender_user_id, body)
         VALUES ($1,$2,$3,$4)`,
        [newId('ip_msg'), tid, candUser.id, 'I can start from next Monday. Looking forward to it!'],
      );
      created.messages += 2;
    }

    // Offer for core candidate (Offers tab)
    if (livePostings[0]) {
      const off = await pool.query(
        `SELECT id FROM ip_offers WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [livePostings[0].id, candRow.id],
      );
      if (!off.rows[0]) {
        await pool.query(
          `INSERT INTO ip_offers (id, internship_id, employer_id, candidate_id, status, stipend_inr, message)
           VALUES ($1,$2,$3,$4,'pending',20000,$5)`,
          [
            newId('ip_off'),
            livePostings[0].id,
            empRow.id,
            candRow.id,
            'Core-fill demo offer — please review.',
          ],
        ).catch(async (e) => {
          // Column set may differ — try minimal
          console.warn('[core-fill] offer insert soft-fail:', e.message);
        });
        created.offers += 1;
      }
    }

    // Employer list + rejection template
    const listEx = await pool.query(
      `SELECT id FROM ip_employer_lists WHERE employer_id = $1 AND name = $2 LIMIT 1`,
      [empRow.id, 'Core Fill Shortlist'],
    );
    let listId = listEx.rows[0]?.id;
    if (!listId) {
      listId = newId('ip_lst');
      await pool.query(
        `INSERT INTO ip_employer_lists (id, employer_id, name) VALUES ($1,$2,$3)`,
        [listId, empRow.id, 'Core Fill Shortlist'],
      );
      created.lists += 1;
    }
    const appForList = await pool.query(
      `SELECT id FROM ip_applications WHERE internship_id = ANY($1::text[]) LIMIT 3`,
      [livePostings.map((p) => p.id)],
    );
    for (const row of appForList.rows) {
      const memEx = await pool.query(
        `SELECT 1 FROM ip_employer_list_members WHERE list_id = $1 AND application_id = $2`,
        [listId, row.id],
      );
      if (!memEx.rows[0]) {
        await pool.query(
          `INSERT INTO ip_employer_list_members (id, list_id, application_id) VALUES ($1,$2,$3)`,
          [newId('ip_llm'), listId, row.id],
        );
      }
    }

    const tmplEx = await pool.query(
      `SELECT id FROM ip_rejection_templates WHERE employer_id = $1 AND name = $2 LIMIT 1`,
      [empRow.id, 'Core Fill Polite Decline'],
    );
    if (!tmplEx.rows[0]) {
      await pool.query(
        `INSERT INTO ip_rejection_templates (id, employer_id, name, body, is_system, version)
         VALUES ($1,$2,$3,$4,false,1)`,
        [
          newId('ip_rt'),
          empRow.id,
          'Core Fill Polite Decline',
          'Hi {{candidate_first_name}}, thank you for applying to {{internship_title}}. We will not be moving forward at this time.',
        ],
      );
      created.templates += 1;
    }

    // Notifications for candidate + employer + superadmin
    for (const [userId, title] of [
      [candUser.id, 'Core-fill: you have new application activity'],
      [empUser.id, 'Core-fill: new applicants on your showcase posting'],
      [saUser.id, 'Core-fill: pending employer awaiting approval'],
    ]) {
      try {
        await pool.query(
          `INSERT INTO ip_notifications (id, user_id, title, body, link, category)
           VALUES ($1,$2,$3,$4,$5,'system')`,
          [newId('ip_notif'), userId, title, 'Demo notification so the Notifications tab is not empty.', '#'],
        );
      } catch {
        await pool.query(
          `INSERT INTO ip_notifications (id, user_id, title, body, link)
           VALUES ($1,$2,$3,$4,$5)`,
          [newId('ip_notif'), userId, title, 'Demo notification so the Notifications tab is not empty.', '#'],
        );
      }
      created.notifications += 1;
    }

    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }

  return {
    mode: 'core-fill',
    runId,
    cores: {
      candidate: CAND_BASE,
      employer: EMP_BASE,
      superadmin: SUPERADMIN_EMAIL,
    },
    created,
    identityNote: 'Core email/password/role were not changed',
    deleteSupportHint: `npm run delete:ip-generated-run -- --confirm-generated-run ${runId}`,
    wipeNonCoresHint: 'npm run delete:ip-except-cores -- --confirm-except-cores YES',
  };
}

async function main() {
  assertProtectedConfigValid();
  const mode = arg('mode', 'gen-accounts');
  const runId = arg('run-id', `${mode === 'core-fill' ? 'corefill' : 'gen'}_${Date.now()}_${randomBytes(3).toString('hex')}`);
  const password = arg('password', DEMO_PASSWORD);
  const dbUrl = loadDbUrl();
  if (!dbUrl) throw new Error('DATABASE_URL (or SUPABASE_DATABASE_URL) required in env');

  if (hasFlag('help') || mode === 'help') {
    console.log(`Usage:
  node scripts/generate-ip-test-data.mjs --mode=gen-accounts [--employers=5] [--candidates=10] [--postings=5]
  node scripts/generate-ip-test-data.mjs --mode=core-fill [--support-candidates=5]
See scripts/IP_TEST_DATA_GUIDE.md`);
    return;
  }

  const pool = new pg.Pool(parseUrl(dbUrl));
  try {
    await ensureRunTables(pool);
    let result;
    if (mode === 'core-fill') {
      result = await modeCoreFill(pool, {
        password,
        runId,
        supportCandidatesN: Number(arg('support-candidates', 5)),
      });
    } else if (mode === 'gen-accounts') {
      const baseMailbox = arg('base-mailbox', 'lawsonlclintern@gmail.com');
      if (isProtectedEmail(baseMailbox)) {
        console.warn('Note: base mailbox is a core email; plus-tags must not collide with cores.');
      }
      result = await modeGenAccounts(pool, {
        employersN: Number(arg('employers', 5)),
        candidatesN: Number(arg('candidates', 10)),
        postingsN: Number(arg('postings', 5)),
        baseMailbox,
        password,
        runId,
      });
    } else {
      throw new Error(`Unknown --mode=${mode}. Use gen-accounts or core-fill.`);
    }

    console.log(JSON.stringify({ ok: true, protectedEmails: PROTECTED_ACCOUNT_EMAILS, ...result }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
