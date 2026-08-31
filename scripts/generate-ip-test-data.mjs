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
const { ensureIpPipelineSchema } = require('./lib/ensureIpPipelineSchema.js');
const demoText = require('./lib/ipDemoText.js');

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

/** Strip any existing +tag so a core address can be used as a base mailbox. */
function mailboxOf(coreEmail) {
  const [local, domain] = String(coreEmail).split('@');
  const base = local.includes('+') ? local.slice(0, local.indexOf('+')) : local;
  return `${base}@${domain}`;
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
  const {
    employersN, candidatesN, postingsN, baseMailbox, employerMailbox, password, runId,
  } = opts;
  const hash = await bcrypt.hash(password, 10);
  const employerIds = [];
  const candidateIds = [];
  const internshipIds = [];

  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO ip_generated_runs (run_id, meta) VALUES ($1, $2::jsonb)`,
      [runId, JSON.stringify({
        mode: 'gen-accounts', employersN, candidatesN, postingsN, baseMailbox, employerMailbox,
      })],
    );

    for (let i = 0; i < employersN; i += 1) {
      // Employer fillers hang off the employer mailbox, candidates off the
      // candidate one, matching the reset cast and fill-core-coverage.
      const email = plusAddress(employerMailbox, `genemp${i}_${runId.slice(-8)}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing to create protected email ${email}`);
      const userId = newId('ip_u');
      const empId = newId('ip_e');
      const companyName = demoText.companyName(i);
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'employer',$4,true,500,$5)`,
        [userId, email, hash, companyName, runId],
      );
      await pool.query(
        `INSERT INTO ip_employers (id, user_id, company_name, approval_status, work_email)
         VALUES ($1,$2,$3,'approved',$4)`,
        [empId, userId, companyName, email],
      );
      employerIds.push({ empId, userId, email });
    }

    for (let i = 0; i < candidatesN; i += 1) {
      const email = plusAddress(baseMailbox, `gencand${i}_${runId.slice(-8)}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing to create protected email ${email}`);
      const userId = newId('ip_u');
      const candId = newId('ip_c');
      const candName = demoText.personName(i);
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'candidate',$4,true,200,$5)`,
        [userId, email, hash, candName, runId],
      );
      await pool.query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, city, skills, searchable)
         VALUES ($1,$2,$3,$4,$5,$6,$7::text[],true)`,
        [candId, userId, candName, email, demoText.college(i), demoText.city(i), ['React', 'SQL']],
      );
      candidateIds.push({ candId, userId, email, name: candName });
    }

    for (let i = 0; i < postingsN; i += 1) {
      const emp = employerIds[i % employerIds.length];
      const intId = newId('ip_int');
      await pool.query(
        `INSERT INTO ip_internships (
           id, employer_id, title, description, location, work_mode, stipend_inr, status,
           questions, locations, starts_at, show_employer_identity
         ) VALUES ($1,$2,$3,$4,'Bengaluru','Hybrid',15000,'published',$5::jsonb,'["Bengaluru"]'::jsonb, now() - interval '1 hour', true)`,
        [intId, emp.empId, demoText.internshipTitle(i), demoText.internshipDescription(i), JSON.stringify(MCQ)],
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
    endorsements: 0,
    ratings: 0,
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
         college = COALESCE(NULLIF(college,''), $3),
         searchable = true,
         updated_at = now()
       WHERE id = $1`,
      [candRow.id, CAND_BASE_NAME, demoText.college(0)],
    );

    // Support candidates (apply to core employer postings)
    const supportCands = [];
    for (let i = 0; i < supportCandidatesN; i += 1) {
      const email = plusAddress(mailboxOf(CAND_BASE), `corefill${i}_${runId.slice(-8)}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing protected email ${email}`);
      const userId = newId('ip_u');
      const candId = newId('ip_c');
      const candName = demoText.personName(i + 50);
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'candidate',$4,true,150,$5)`,
        [userId, email, hash, candName, runId],
      );
      await pool.query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, city, skills, searchable)
         VALUES ($1,$2,$3,$4,$5,$6,ARRAY['Python','SQL'],true)`,
        [candId, userId, candName, email, demoText.college(i + 7), demoText.city(i + 1)],
      );
      supportCands.push({ candId, userId, email, name: candName });
      created.supportCandidates += 1;
    }

    // Pending employer for SuperAdmin Approvals tab
    {
      const email = plusAddress(mailboxOf(EMP_BASE), `corefillpend_${runId.slice(-8)}`);
      const userId = newId('ip_u');
      const empId = newId('ip_e');
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'employer',$4,false,0,$5)`,
        [userId, email, hash, demoText.companyName(50), runId],
      );
      await pool.query(
        `INSERT INTO ip_employers (id, user_id, company_name, approval_status, work_email)
         VALUES ($1,$2,$3,'pending',$4)`,
        [empId, userId, demoText.companyName(50), email],
      );
      created.supportEmployersPending += 1;
    }

    // Core employer: ensure live postings with MCQ + volume
    // Titles double as the idempotency key for this mode, so keep them stable.
    const postingSpecs = [
      { title: 'Frontend Developer Intern', status: 'published', location: 'Pune' },
      { title: 'Data Analyst Intern', status: 'published', location: 'Bengaluru' },
      { title: 'Product Management Intern', status: 'draft', location: 'Remote' },
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
            demoText.internshipDescription(created.postings),
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
        `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, application_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [threadId, livePostings[0]?.id || null, candUser.id, empUser.id, null],
      );
      tid = threadId;
    }
    if (livePostings[0]) {
      const appForThread = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [livePostings[0].id, candRow.id],
      );
      if (appForThread.rows[0]) {
        await pool.query(
          `UPDATE ip_message_threads SET application_id = COALESCE(application_id, $2) WHERE id = $1`,
          [tid, appForThread.rows[0].id],
        );
      }
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

    // Offer for core candidate — only after an application exists for that posting
    if (livePostings[0]) {
      const appForOffer = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [livePostings[0].id, candRow.id],
      );
      const applicationId = appForOffer.rows[0]?.id;
      if (applicationId) {
        const off = await pool.query(
          `SELECT id FROM ip_offers WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
          [livePostings[0].id, candRow.id],
        );
        if (!off.rows[0]) {
          await pool.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`).catch(() => {});
          await pool.query(
            `INSERT INTO ip_offers (id, internship_id, employer_id, candidate_id, application_id, status, stipend_inr, message)
             VALUES ($1,$2,$3,$4,$5,'pending',20000,$6)`,
            [
              newId('ip_off'),
              livePostings[0].id,
              empRow.id,
              candRow.id,
              applicationId,
              demoText.offerMessage(created.offers),
            ],
          );
          created.offers += 1;
        } else {
          await pool.query(
            `UPDATE ip_offers SET application_id = COALESCE(application_id, $2) WHERE id = $1`,
            [off.rows[0].id, applicationId],
          );
        }
        await pool.query(
          `UPDATE ip_applications SET status = 'offered', updated_at = now() WHERE id = $1`,
          [applicationId],
        );
      }
    }

    // Second live posting: hired + completed so rate/endorse APIs have a valid engagement
    const hiredPosting = livePostings[1];
    if (hiredPosting) {
      const hiredApp = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [hiredPosting.id, candRow.id],
      );
      const hiredAppId = hiredApp.rows[0]?.id;
      if (hiredAppId) {
        await pool.query(
          `UPDATE ip_applications SET status = 'hired', updated_at = now() WHERE id = $1`,
          [hiredAppId],
        );
        const endEx = await pool.query(
          `SELECT id FROM ip_endorsements WHERE employer_id = $1 AND candidate_id = $2 AND internship_id = $3 LIMIT 1`,
          [empRow.id, candRow.id, hiredPosting.id],
        );
        if (!endEx.rows[0]) {
          await pool.query(
            `INSERT INTO ip_endorsements (id, internship_id, employer_id, candidate_id, role_title, certificate_text)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              newId('ip_end'),
              hiredPosting.id,
              empRow.id,
              candRow.id,
              'Core Showcase Data Intern',
              `This certifies that the candidate completed an internship (Core Showcase Data Intern) with ${empRow.company_name}.`,
            ],
          );
          created.endorsements += 1;
        }
        const rateEx = await pool.query(
          `SELECT id FROM ip_ratings WHERE from_user_id = $1 AND to_user_id = $2 AND internship_id = $3 LIMIT 1`,
          [empUser.id, candUser.id, hiredPosting.id],
        );
        if (!rateEx.rows[0]) {
          await pool.query(
            `INSERT INTO ip_ratings (id, internship_id, from_user_id, to_user_id, stars, comment)
             VALUES ($1,$2,$3,$4,5,$5)`,
            [newId('ip_rate'), hiredPosting.id, empUser.id, candUser.id, demoText.ratingComment(created.ratings)],
          );
          created.ratings += 1;
        }
      }
    }

    // Employer list + rejection template
    const coreListName = demoText.listName(0);
    const listEx = await pool.query(
      `SELECT id FROM ip_employer_lists WHERE employer_id = $1 AND name = $2 LIMIT 1`,
      [empRow.id, coreListName],
    );
    let listId = listEx.rows[0]?.id;
    if (!listId) {
      listId = newId('ip_lst');
      await pool.query(
        `INSERT INTO ip_employer_lists (id, employer_id, name) VALUES ($1,$2,$3)`,
        [listId, empRow.id, coreListName],
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
          demoText.rejectionTemplate(created.templates).name,
          demoText.rejectionTemplate(created.templates).body,
        ],
      );
      created.templates += 1;
    }

    // Notifications for candidate + employer + superadmin. Wording and links must
    // read like the live product: the demo-text gate rejects harness phrasing, and
    // the consistency gate rejects links that resolve to no route.
    for (const [userId, title, role, link] of [
      [candUser.id, 'Application update', 'candidate', '/candidate/applications'],
      [empUser.id, 'New applicants on your posting', 'employer', '/employer/candidates'],
      [saUser.id, 'Employer awaiting approval', 'superadmin', '/superadmin/approvals'],
    ]) {
      try {
        await pool.query(
          `INSERT INTO ip_notifications (id, user_id, title, body, link, category)
           VALUES ($1,$2,$3,$4,$5,'system')`,
          [newId('ip_notif'), userId, title, demoText.notificationBody('system', created.notifications || 0, role), link],
        );
      } catch {
        await pool.query(
          `INSERT INTO ip_notifications (id, user_id, title, body, link)
           VALUES ($1,$2,$3,$4,$5)`,
          [newId('ip_notif'), userId, title, demoText.notificationBody('system', created.notifications || 0, role), link],
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
    await ensureIpPipelineSchema(pool);
    await ensureRunTables(pool);
    let result;
    if (mode === 'core-fill') {
      result = await modeCoreFill(pool, {
        password,
        runId,
        supportCandidatesN: Number(arg('support-candidates', 5)),
      });
    } else if (mode === 'gen-accounts') {
      const baseMailbox = arg('base-mailbox', mailboxOf(CAND_BASE));
      const employerMailbox = arg('employer-base-mailbox', mailboxOf(EMP_BASE));
      for (const mb of [baseMailbox, employerMailbox]) {
        if (isProtectedEmail(mb)) {
          console.warn('Note: base mailbox is a core email; plus-tags must not collide with cores.');
        }
      }
      result = await modeGenAccounts(pool, {
        employersN: Number(arg('employers', 5)),
        candidatesN: Number(arg('candidates', 10)),
        postingsN: Number(arg('postings', 5)),
        baseMailbox,
        employerMailbox,
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
