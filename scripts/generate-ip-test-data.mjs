#!/usr/bin/env node
/**
 * InternSafar test-data generator — two modes:
 *
 *   --mode=gen-accounts   Create new +gen… users/postings/apps (default)
 *   --mode=core-fill      Fill the three CORE accounts so main tabs have visible data
 *                         (never changes core email / password / role)
 *
 * Volumes default to TARGET_LIST_ROWS (22) so major lists cover ≥2 pages (PAGE_SIZE 10).
 *
 * Name / realism rules:
 * - Never reuse the same candidate name across many offer rows.
 * - Distribute offers across different candidates and employers.
 * - Unique role titles / company names / idea titles (no “QA Intern” spam).
 * - Browse visibility: published rows must have starts_at in the past (or null) and
 *   apply_ends_at in the future (or null). Do NOT push starts_at into the future to
 *   fake “Starting soon” — use start_date for that chip instead (see core-fill).
 *
 * See scripts/IP_TEST_DATA_GUIDE.md
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createRequire } from 'module';
import { qaRunLabel, qaDbId } from './lib/ipQaNaming.mjs';

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
const content = require('./lib/ipTestDataContent.js');
const {
  TARGET_LIST_ROWS,
  CITIES,
  COLLEGES,
  WORK_MODES,
  APP_STATUSES,
  IDEA_STATUSES,
  FEATURE_IDEAS,
  OFFER_MESSAGES,
  pick,
  personName,
  companyName,
  roleTitle,
  assertUniqueLabels,
  internshipDescription,
  internshipEligibilityAt,
  experienceEntriesJsonAt,
  ideaAt,
  msgSnippets,
  notificationAt,
  skillsAt,
} = content;

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function loadDbUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';
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
  return qaDbId(prefix);
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

/** Cycle offer statuses so filters/tabs have realistic variety. */
function offerStatusAt(i) {
  return ['pending', 'accepted', 'declined', 'expired', 'pending'][i % 5];
}

function offerDatePair(i, status) {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() + 10 + (i % 50));
  const until = new Date();
  until.setHours(12, 0, 0, 0);
  if (status === 'expired') {
    until.setDate(until.getDate() - (2 + (i % 12)));
  } else {
    until.setDate(until.getDate() + 4 + (i % 18));
  }
  return {
    startDate: start.toISOString().slice(0, 10),
    validUntil: until.toISOString().slice(0, 10),
  };
}

function applicationStatusForOffer(status) {
  if (status === 'accepted') return 'hired';
  if (status === 'declined') return 'declined_offer';
  return 'offered';
}

/**
 * Insert an offer only when missing for this application.
 * Always uses distinct candidate×internship pairs; never reuses the same names intentionally.
 */
async function ensureApplicationForOffer(pool, { internshipId, candidateId, index = 0 }) {
  if (!internshipId || !candidateId) return null;
  const ex = await pool.query(
    `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
    [internshipId, candidateId],
  );
  if (ex.rows[0]) return ex.rows[0].id;
  const id = newId('ip_app');
  try {
    await pool.query(
      `INSERT INTO ip_applications (
         id, internship_id, candidate_id, status, match_score, answers, questions_snapshot
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
      [
        id,
        internshipId,
        candidateId,
        pick(APP_STATUSES, index),
        70 + (index % 25),
        JSON.stringify({ q1: 'q1_a' }),
        JSON.stringify(MCQ),
      ],
    );
    return id;
  } catch {
    const again = await pool.query(
      `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
      [internshipId, candidateId],
    );
    return again.rows[0]?.id || null;
  }
}

async function insertVariedOffer(pool, {
  internshipId,
  employerId,
  candidateId,
  applicationId,
  title,
  stipend,
  message,
  index = 0,
}) {
  if (!internshipId || !employerId || !candidateId) return false;
  let appId = applicationId;
  if (!appId) {
    appId = await ensureApplicationForOffer(pool, { internshipId, candidateId, index });
  }
  if (!appId) return false;
  const exists = await pool.query(`SELECT id FROM ip_offers WHERE application_id = $1 LIMIT 1`, [appId]);
  if (exists.rows[0]) return false;
  const status = offerStatusAt(index);
  const { startDate, validUntil } = offerDatePair(index, status);
  try {
    await pool.query(
      `INSERT INTO ip_offers (
         id, internship_id, employer_id, candidate_id, application_id,
         status, stipend_inr, role_title, message, start_date, valid_until
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        newId('ip_off'),
        internshipId,
        employerId,
        candidateId,
        appId,
        status,
        stipend,
        title,
        message,
        startDate,
        validUntil,
      ],
    );
    await pool.query(`UPDATE ip_applications SET status = $2, updated_at = now() WHERE id = $1`, [
      appId,
      applicationStatusForOffer(status),
    ]);
    return true;
  } catch {
    return false;
  }
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

async function insertNotification(pool, userId, spec) {
  const id = newId('ip_notif');
  const meta = spec.meta && typeof spec.meta === 'object' ? JSON.stringify(spec.meta) : '{}';
  try {
    await pool.query(
      `INSERT INTO ip_notifications (id, user_id, title, body, link, category, meta, created_at, read_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,COALESCE($8::timestamptz, now()),$9)`,
      [
        id,
        userId,
        spec.title,
        spec.body,
        spec.link || '#',
        spec.category || 'system',
        meta,
        spec.created_at || null,
        spec.read_at === undefined ? null : spec.read_at,
      ],
    );
  } catch {
    try {
      await pool.query(
        `INSERT INTO ip_notifications (id, user_id, title, body, link, category)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, userId, spec.title, spec.body, spec.link || '#', spec.category || 'system'],
      );
    } catch {
      await pool.query(
        `INSERT INTO ip_notifications (id, user_id, title, body, link)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, userId, spec.title, spec.body, spec.link || '#'],
      );
    }
  }
}

async function ensureFeatureIdeas(pool, authorUserIds, count, created) {
  const existing = await pool.query(`SELECT count(*)::int AS n FROM ip_feature_ideas`);
  let have = Number(existing.rows[0]?.n || 0);
  const target = Math.max(count, FEATURE_IDEAS.length, TARGET_LIST_ROWS);

  let catId = null;
  try {
    const cats = await pool.query(`SELECT id FROM ip_idea_categories ORDER BY sort_order NULLS LAST LIMIT 1`);
    catId = cats.rows[0]?.id || null;
  } catch {
    /* optional */
  }

  const titles = await pool.query(`SELECT title, status FROM ip_feature_ideas`);
  const used = new Set(titles.rows.map((r) => String(r.title)));

  // Ensure every roadmap bucket appears (incl. Declined) by cycling IDEA_STATUSES
  for (let i = 0; i < FEATURE_IDEAS.length && have < target; i += 1) {
    const idea = FEATURE_IDEAS[i];
    if (used.has(idea.title)) continue;
    const authorId = pick(authorUserIds, i);
    const status = IDEA_STATUSES[i % IDEA_STATUSES.length];
    const id = newId('ip_idea');
    try {
      await pool.query(
        `INSERT INTO ip_feature_ideas (
           id, author_user_id, title, description, problem, solution, status, category_id, priority, vote_count
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          authorId,
          idea.title,
          idea.description,
          idea.problem || null,
          idea.solution || null,
          status,
          catId,
          3 + (i % 5),
          1 + (i % 12),
        ],
      );
    } catch {
      await pool.query(
        `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, status, vote_count)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, authorId, idea.title, idea.description, status, 1 + (i % 12)],
      );
    }
    used.add(idea.title);
    have += 1;
    created.featureIdeas = (created.featureIdeas || 0) + 1;
  }

  // Guarantee Declined (+ other buckets) so Ideas tabs are never empty after seed
  await ensureIdeaStatusCoverage(pool);
}

/** Ensure Ideas status tabs each have rows (esp. Declined). */
async function ensureIdeaStatusCoverage(pool) {
  const want = {
    Declined: 4,
    Planned: 3,
    'In progress': 3,
    Shipped: 3,
    'Under review': 3,
  };
  for (const [status, min] of Object.entries(want)) {
    const cur = await pool.query(
      `SELECT count(*)::int AS n FROM ip_feature_ideas WHERE lower(status) = lower($1)`,
      [status],
    );
    let n = Number(cur.rows[0]?.n || 0);
    if (n >= min) continue;
    const need = min - n;
    const donors = await pool.query(
      `SELECT id FROM ip_feature_ideas
       WHERE lower(status) NOT IN ('declined','planned','in progress','shipped')
          OR lower(status) = 'pending approval'
       ORDER BY created_at NULLS LAST
       LIMIT $1`,
      [need + 2],
    );
    for (const row of donors.rows.slice(0, need)) {
      await pool.query(`UPDATE ip_feature_ideas SET status = $2 WHERE id = $1`, [row.id, status]);
    }
  }
}

async function modeGenAccounts(pool, opts) {
  const { employersN, candidatesN, postingsN, baseMailbox, password, runId } = opts;
  const hash = await bcrypt.hash(password, 10);
  const employerIds = [];
  const candidateIds = [];
  const internshipIds = [];
  let threadN = 0;
  let offerN = 0;
  let notifN = 0;
  let ideaN = 0;
  let referralN = 0;
  const created = { featureIdeas: 0 };

  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO ip_generated_runs (run_id, meta) VALUES ($1, $2::jsonb)`,
      [
        runId,
        JSON.stringify({
          mode: 'gen-accounts',
          employersN,
          candidatesN,
          postingsN,
          baseMailbox,
          targetListRows: TARGET_LIST_ROWS,
        }),
      ],
    );

    for (let i = 0; i < employersN; i += 1) {
      const email = plusAddress(baseMailbox, `gen-employer-${i + 1}-${runId}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing to create protected email ${email}`);
      const userId = newId('ip_u');
      const empId = newId('ip_e');
      const company = companyName(i);
      const contact = personName(i + 40);
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'employer',$4,true,500,$5)`,
        [userId, email, hash, contact, runId],
      );
      await pool.query(
        `INSERT INTO ip_employers (id, user_id, company_name, approval_status, work_email, hq_city, about)
         VALUES ($1,$2,$3,'approved',$4,$5,$6)`,
        [
          empId,
          userId,
          company,
          email,
          pick(CITIES, i),
          `${company} hires interns across product and engineering in ${pick(CITIES, i)}.`,
        ],
      );
      employerIds.push({ empId, userId, email, company });
    }

    for (let i = 0; i < candidatesN; i += 1) {
      const email = plusAddress(baseMailbox, `gen-candidate-${i + 1}-${runId}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing to create protected email ${email}`);
      const userId = newId('ip_u');
      const candId = newId('ip_c');
      const name = personName(i);
      const city = pick(CITIES, i + 2);
      const college = pick(COLLEGES, i);
      const skills = skillsAt(i);
      const priorExp = experienceEntriesJsonAt(i);
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'candidate',$4,true,200,$5)`,
        [userId, email, hash, name, runId],
      );
      await pool.query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, city, skills, prior_experience, searchable)
         VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,true)`,
        [candId, userId, name, email, college, city, skills, priorExp],
      );
      candidateIds.push({ candId, userId, email, name });
    }
    assertUniqueLabels(
      candidateIds.map((c) => c.name),
      'gen-accounts candidate names',
    );
    assertUniqueLabels(
      employerIds.map((e) => e.company),
      'gen-accounts company names',
    );

    for (let i = 0; i < postingsN; i += 1) {
      const emp = employerIds[i % employerIds.length];
      const intId = newId('ip_int');
      const title = roleTitle(i);
      const city = pick(CITIES, i);
      const mode = pick(WORK_MODES, i);
      const stipend = 10000 + (i % 8) * 2500;
      const startOffsetDays = 3 + (i % 14);
      const updatedHoursAgo = i % 3 === 0 ? 12 : 24 * (2 + (i % 5));
      const desc = internshipDescription(title, emp.company, city, i);
      const eligibility = internshipEligibilityAt(i);
      await pool.query(
        `INSERT INTO ip_internships (
           id, employer_id, title, description, location, work_mode, stipend_inr, status,
           eligibility, questions, locations, starts_at, apply_ends_at, start_date, show_employer_identity, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,'published',$8::jsonb,$9::jsonb,$10::jsonb,
           now() - interval '1 hour',
           now() + interval '28 days',
           CURRENT_DATE + $11::int,
           true,
           now() - ($12::int * interval '1 hour')
         )`,
        [
          intId,
          emp.empId,
          title,
          desc,
          city,
          mode,
          stipend,
          JSON.stringify(eligibility),
          JSON.stringify(MCQ),
          JSON.stringify([city]),
          startOffsetDays,
          updatedHoursAgo,
        ],
      );
      internshipIds.push({ id: intId, title, emp });

      const appsPerPosting = Math.min(4, candidateIds.length);
      for (let j = 0; j < appsPerPosting; j += 1) {
        const cand = candidateIds[(i + j) % candidateIds.length];
        const opt = j % 2 === 0 ? 'q1_a' : 'q1_b';
        const status = pick(APP_STATUSES, i + j);
        await pool.query(
          `INSERT INTO ip_applications (
             id, internship_id, candidate_id, status, match_score, answers,
             questions_snapshot, screening_disabled, screening_disable_reason
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb)`,
          [
            newId('ip_app'),
            intId,
            cand.candId,
            status,
            65 + ((i + j) % 30),
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

    // Message threads (≥ TARGET_LIST_ROWS)
    const threadTarget = Math.max(TARGET_LIST_ROWS, 12);
    for (let i = 0; i < internshipIds.length && threadN < threadTarget; i += 1) {
      const posting = internshipIds[i];
      const emp = posting.emp;
      for (let j = 0; j < Math.min(3, candidateIds.length) && threadN < threadTarget; j += 1) {
        const cand = candidateIds[(i + j) % candidateIds.length];
        const thrId = newId('ip_th');
        const subject = `${posting.title} — ${cand.name}`;
        await pool.query(
          `INSERT INTO ip_message_threads (
             id, internship_id, candidate_user_id, employer_user_id, subject
           ) VALUES ($1,$2,$3,$4,$5)`,
          [thrId, posting.id, cand.userId, emp.userId, subject],
        );
        const snippets = msgSnippets(threadN);
        for (let m = 0; m < snippets.length; m += 1) {
          const fromEmp = m % 2 === 0;
          await pool.query(
            `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
            [newId('ip_msg'), thrId, fromEmp ? emp.userId : cand.userId, snippets[m]],
          );
        }
        threadN += 1;
      }
    }

    // Offers: unique candidate×employer×role pairs, varied statuses/dates/stipends (no repeated same-name spam)
    await pool.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS start_date DATE`).catch(() => {});
    await pool.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS valid_until DATE`).catch(() => {});
    for (let i = 0; i < internshipIds.length && offerN < TARGET_LIST_ROWS * 2; i += 1) {
      const posting = internshipIds[i];
      // Prefer a different candidate per posting so employer/candidate lists look realistic
      const cand = candidateIds[i % candidateIds.length];
      const app = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [posting.id, cand.candId],
      );
      const applicationId = app.rows[0]?.id;
      if (!applicationId) continue;
      const ok = await insertVariedOffer(pool, {
        internshipId: posting.id,
        employerId: posting.emp.empId,
        candidateId: cand.candId,
        applicationId,
        title: posting.title,
        stipend: 12000 + (i % 8) * 1500,
        message: pick(OFFER_MESSAGES, i),
        index: i,
      });
      if (ok) offerN += 1;
    }
    // Extra cross-links: second pass with offset candidates so one employer does not only hire one person
    for (let i = 0; i < internshipIds.length && offerN < TARGET_LIST_ROWS * 2; i += 1) {
      const posting = internshipIds[i];
      const cand = candidateIds[(i + Math.floor(candidateIds.length / 2)) % candidateIds.length];
      if (!cand) break;
      const app = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [posting.id, cand.candId],
      );
      const applicationId = app.rows[0]?.id;
      if (!applicationId) continue;
      const ok = await insertVariedOffer(pool, {
        internshipId: posting.id,
        employerId: posting.emp.empId,
        candidateId: cand.candId,
        applicationId,
        title: posting.title,
        stipend: 13000 + (i % 7) * 1200,
        message: pick(OFFER_MESSAGES, i + 3),
        index: i + 17,
      });
      if (ok) offerN += 1;
    }

    // Notifications per generated user (sample)
    for (let i = 0; i < Math.min(TARGET_LIST_ROWS, candidateIds.length); i += 1) {
      const spec = notificationAt(i);
      await insertNotification(pool, candidateIds[i].userId, {
        ...spec,
        title: `${spec.title} · ${candidateIds[i].name.split(' ')[0]}`,
      });
      notifN += 1;
    }
    for (let i = 0; i < Math.min(TARGET_LIST_ROWS, employerIds.length); i += 1) {
      const spec = notificationAt(i + 8);
      await insertNotification(pool, employerIds[i].userId, {
        ...spec,
        title: `${spec.title} · ${employerIds[i].company}`,
      });
      notifN += 1;
    }

    // Referrals: first employer as referrer for support candidates
    if (employerIds[0] && candidateIds.length) {
      const refUser = await pool.query(`SELECT referral_code FROM ip_users WHERE id = $1`, [
        employerIds[0].userId,
      ]);
      let code = refUser.rows[0]?.referral_code;
      if (!code) {
        code = `REF-GEN-${runId}`;
        await pool.query(`UPDATE ip_users SET referral_code = $2 WHERE id = $1`, [
          employerIds[0].userId,
          code,
        ]);
      }
      for (let i = 0; i < Math.min(TARGET_LIST_ROWS, candidateIds.length); i += 1) {
        const status = i % 5 === 0 ? 'pending' : i % 7 === 0 ? 'invalid' : 'completed';
        const points = status === 'completed' ? 25 + (i % 4) * 5 : 0;
        try {
          await pool.query(
            `INSERT INTO ip_referrals (id, referrer_user_id, referred_user_id, referral_code, status, points_awarded)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [newId('ip_ref'), employerIds[0].userId, candidateIds[i].userId, code, status, points],
          );
          referralN += 1;
        } catch {
          /* unique / schema */
        }
      }
    }

    await ensureFeatureIdeas(
      pool,
      candidateIds.map((c) => c.userId).concat(employerIds.map((e) => e.userId)),
      TARGET_LIST_ROWS,
      created,
    );
    ideaN = created.featureIdeas;

    await pool.query(`
      WITH refs AS (
        SELECT internship_id AS id FROM ip_applications WHERE internship_id IS NOT NULL
        UNION SELECT internship_id FROM ip_saved_internships WHERE internship_id IS NOT NULL
        UNION SELECT internship_id FROM ip_offers WHERE internship_id IS NOT NULL
        UNION SELECT internship_id FROM ip_message_threads WHERE internship_id IS NOT NULL
      )
      UPDATE ip_internships i
      SET
        status = CASE WHEN i.status IN ('draft','paused','closed') THEN 'published' ELSE i.status END,
        starts_at = CASE
          WHEN i.starts_at IS NULL OR i.starts_at > now() THEN now() - interval '2 hours'
          ELSE i.starts_at
        END,
        apply_ends_at = CASE
          WHEN i.apply_ends_at IS NULL OR i.apply_ends_at <= now() THEN now() + interval '28 days'
          ELSE i.apply_ends_at
        END,
        closed_reason = NULL,
        updated_at = now()
      FROM refs r
      WHERE i.id = r.id
        AND (
          i.status <> 'published'
          OR (i.starts_at IS NOT NULL AND i.starts_at > now())
          OR (i.apply_ends_at IS NOT NULL AND i.apply_ends_at <= now())
        )
    `);

    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }

  return {
    mode: 'gen-accounts',
    runId,
    targetListRows: TARGET_LIST_ROWS,
    employers: employerIds.length,
    candidates: candidateIds.length,
    postings: internshipIds.length,
    messageThreads: threadN,
    offers: offerN,
    notifications: notifN,
    featureIdeas: ideaN,
    referrals: referralN,
    sampleTitles: internshipIds.slice(0, 5).map((p) => p.title),
    sampleIdeaTitles: FEATURE_IDEAS.slice(0, 5).map((x) => x.title),
    deleteHint: `npm run delete:ip-generated-run -- --confirm-generated-run ${runId}`,
  };
}

async function modeCoreFill(pool, opts) {
  const { password, runId, supportCandidatesN, supportEmployersN } = opts;
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

  const companyLabel = empRow.company_name || EMP_BASE_NAME;

  const created = {
    supportCandidates: 0,
    supportEmployers: 0,
    supportEmployersPending: 0,
    postings: 0,
    supportPostings: 0,
    applications: 0,
    saved: 0,
    messages: 0,
    threads: 0,
    offers: 0,
    lists: 0,
    templates: 0,
    notifications: 0,
    endorsements: 0,
    ratings: 0,
    featureIdeas: 0,
    referrals: 0,
  };
  const postingIds = [];

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
          targetListRows: TARGET_LIST_ROWS,
          note: 'Support +gen users tagged with this run; cores identity untouched',
        }),
      ],
    );

    await pool.query(
      `UPDATE ip_employers SET approval_status = 'approved', updated_at = now()
       WHERE id = $1 AND (approval_status IS NULL OR approval_status <> 'approved')`,
      [empRow.id],
    );

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
         college = COALESCE(NULLIF(college,''), 'VIT Vellore'),
         prior_experience = CASE
           WHEN prior_experience IS NULL OR btrim(prior_experience) = '' THEN $3
           ELSE prior_experience
         END,
         searchable = true,
         updated_at = now()
       WHERE id = $1`,
      [candRow.id, CAND_BASE_NAME, experienceEntriesJsonAt(1)],
    );

    // Support candidates (≥ TARGET for employer candidates list)
    const supportCands = [];
    for (let i = 0; i < supportCandidatesN; i += 1) {
      const email = plusAddress('lawsonlclintern@gmail.com', `corefill-candidate-${i + 1}-${runId}`);
      if (isProtectedEmail(email)) throw new Error(`Refusing protected email ${email}`);
      const userId = newId('ip_u');
      const candId = newId('ip_c');
      const name = personName(i + 7);
      const city = pick(CITIES, i);
      const college = pick(COLLEGES, i);
      const skills = skillsAt(i);
      const priorExp = experienceEntriesJsonAt(i + 40);
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'candidate',$4,true,150,$5)`,
        [userId, email, hash, name, runId],
      );
      await pool.query(
        `INSERT INTO ip_candidates (id, user_id, name, email, college, city, skills, prior_experience, searchable)
         VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,true)`,
        [candId, userId, name, email, college, city, skills, priorExp],
      );
      supportCands.push({ candId, userId, email, name });
      created.supportCandidates += 1;
    }
    assertUniqueLabels(
      supportCands.map((c) => c.name),
      'support candidate names',
    );

    // Pending employer for SuperAdmin Approvals
    {
      const email = plusAddress('lawsonlclintern@gmail.com', `corefill-pending-employer-${runId}`);
      const userId = newId('ip_u');
      const empId = newId('ip_e');
      const company = `${companyName(18)} (Pending)`;
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'employer',$4,false,0,$5)`,
        [userId, email, hash, personName(90), runId],
      );
      await pool.query(
        `INSERT INTO ip_employers (id, user_id, company_name, approval_status, work_email, hq_city, about)
         VALUES ($1,$2,$3,'pending',$4,$5,$6)`,
        [
          empId,
          userId,
          company,
          email,
          pick(CITIES, 3),
          `${company} requested access to post internships on PlacementHub.`,
        ],
      );
      created.supportEmployersPending += 1;
    }

    // Core employer postings — unique titles, ≥ TARGET published + a few drafts
    const postingSpecs = [];
    for (let i = 0; i < TARGET_LIST_ROWS; i += 1) {
      const title = roleTitle(i);
      const status = i === TARGET_LIST_ROWS - 1 ? 'draft' : i === TARGET_LIST_ROWS - 2 ? 'paused' : 'published';
      postingSpecs.push({
        title,
        status,
        location: pick(CITIES, i),
        startDays: 5 + (i % 16),
        updatedHours: 4 + (i % 40),
        workMode: pick(WORK_MODES, i),
        stipend: 12000 + (i % 7) * 2000,
      });
    }

    assertUniqueLabels(
      postingSpecs.map((p) => p.title),
      'core employer role titles',
    );

    for (let si = 0; si < postingSpecs.length; si += 1) {
      const spec = postingSpecs[si];
      const existing = await pool.query(
        `SELECT id FROM ip_internships WHERE employer_id = $1 AND title = $2 LIMIT 1`,
        [empRow.id, spec.title],
      );
      let intId = existing.rows[0]?.id;
      const desc = internshipDescription(spec.title, companyLabel, spec.location, si);
      const eligibility = internshipEligibilityAt(si);
      if (!intId) {
        intId = newId('ip_int');
        await pool.query(
          `INSERT INTO ip_internships (
             id, employer_id, title, description, location, work_mode, stipend_inr, status,
             eligibility, questions, locations, starts_at, apply_ends_at, start_date, show_employer_identity, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,
             now() - interval '2 hours', now() + interval '14 days',
             CURRENT_DATE + $12::int,
             true,
             now() - ($13::int * interval '1 hour')
           )`,
          [
            intId,
            empRow.id,
            spec.title,
            desc,
            spec.location,
            spec.workMode,
            spec.stipend,
            spec.status,
            JSON.stringify(eligibility),
            JSON.stringify(MCQ),
            JSON.stringify([spec.location]),
            spec.startDays,
            spec.updatedHours,
          ],
        );
        created.postings += 1;
      } else {
        await pool.query(
          `UPDATE ip_internships SET
             description = $2,
             eligibility = $3::jsonb,
             questions = $4::jsonb,
             status = $5,
             location = $6,
             work_mode = $7,
             stipend_inr = $8,
             starts_at = COALESCE(starts_at, now() - interval '2 hours'),
             apply_ends_at = COALESCE(apply_ends_at, now() + interval '14 days'),
             start_date = COALESCE(start_date, CURRENT_DATE + $9::int),
             updated_at = now() - ($10::int * interval '1 hour')
           WHERE id = $1`,
          [
            intId,
            desc,
            JSON.stringify(eligibility),
            JSON.stringify(MCQ),
            spec.status,
            spec.location,
            spec.workMode,
            spec.stipend,
            spec.startDays,
            spec.updatedHours,
          ],
        );
      }
      postingIds.push({ id: intId, status: spec.status, title: spec.title });
    }

    const livePostings = postingIds.filter((p) => p.status === 'published');

    // Support employers + postings so core candidate can reach ≥ TARGET applications
    const supportEmps = [];
    for (let i = 0; i < supportEmployersN; i += 1) {
      const email = plusAddress('lawsonlclintern@gmail.com', `corefill-employer-${i + 1}-${runId}`);
      if (isProtectedEmail(email)) continue;
      const userId = newId('ip_u');
      const empId = newId('ip_e');
      const company = companyName(i + 2);
      const contact = personName(i + 50);
      await pool.query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, profile_complete, points, generated_run_id)
         VALUES ($1,$2,$3,'employer',$4,true,400,$5)`,
        [userId, email, hash, contact, runId],
      );
      await pool.query(
        `INSERT INTO ip_employers (id, user_id, company_name, approval_status, work_email, hq_city, about)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          empId,
          userId,
          company,
          i % 4 === 0 ? 'pending' : 'approved',
          email,
          pick(CITIES, i + 4),
          `${company} partners with PlacementHub for campus hiring.`,
        ],
      );
      const posts = [];
      for (let p = 0; p < 3; p += 1) {
        const idx = i * 3 + p + TARGET_LIST_ROWS;
        const title = roleTitle(idx);
        const city = pick(CITIES, idx);
        const intId = newId('ip_int');
        await pool.query(
          `INSERT INTO ip_internships (
             id, employer_id, title, description, location, work_mode, stipend_inr, status,
             eligibility, questions, locations, starts_at, apply_ends_at, start_date, show_employer_identity, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,'published',$8::jsonb,$9::jsonb,$10::jsonb,
             now() - interval '1 day', now() + interval '28 days',
             CURRENT_DATE + $11::int, true, now() - make_interval(days => $12)
           )`,
          [
            intId,
            empId,
            title,
            internshipDescription(title, company, city, idx),
            city,
            pick(WORK_MODES, idx),
            11000 + (idx % 5) * 1500,
            JSON.stringify(internshipEligibilityAt(idx)),
            JSON.stringify(MCQ),
            JSON.stringify([city]),
            // start_date can be soon (for Starting soon chip); posting is live now
            idx % 5 === 0 ? 7 + (idx % 10) : 14 + (idx % 20),
            idx % 3 === 0 ? 10 + (idx % 8) : idx % 4,
          ],
        );
        posts.push({ id: intId, title, empId, userId, company });
        created.supportPostings += 1;
      }
      supportEmps.push({ empId, userId, email, company, posts });
      created.supportEmployers += 1;
    }
    assertUniqueLabels(
      supportEmps.map((e) => e.company),
      'support employer company names',
    );
    assertUniqueLabels(
      supportEmps.flatMap((e) => e.posts.map((p) => p.title)),
      'support employer role titles (must be unique globally — never same title twice)',
    );
    assertUniqueLabels(
      [...postingIds.map((p) => p.title), ...supportEmps.flatMap((e) => e.posts.map((p) => p.title))],
      'all seeded role titles this run',
    );

    // Applications onto core employer live postings
    for (const posting of livePostings) {
      for (let j = 0; j < supportCands.length; j += 1) {
        const cand = supportCands[j];
        const exists = await pool.query(
          `SELECT 1 FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2`,
          [posting.id, cand.candId],
        );
        if (exists.rows[0]) continue;
        const opt = j % 2 === 0 ? 'q1_a' : 'q1_b';
        const status = pick(APP_STATUSES, j);
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
            70 + (j % 25),
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

    // Core candidate applies to support employer postings (fills candidate applications list)
    for (const se of supportEmps) {
      for (const post of se.posts) {
        const coreApp = await pool.query(
          `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2`,
          [post.id, candRow.id],
        );
        if (coreApp.rows[0]) continue;
        await pool.query(
          `INSERT INTO ip_applications (
             id, internship_id, candidate_id, status, match_score, answers, questions_snapshot
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
          [
            newId('ip_app'),
            post.id,
            candRow.id,
            pick(APP_STATUSES, created.applications),
            80 + (created.applications % 15),
            JSON.stringify({ q1: 'q1_a' }),
            JSON.stringify(MCQ),
          ],
        );
        created.applications += 1;
      }
    }

    const MIN_PER_TAB = Math.floor(TARGET_LIST_ROWS / 2) + 1; // 11 → ≥2 UI pages
    const sparePostsAll = supportEmps.flatMap((se) => se.posts);

    /** Keep each Applications status tab pageable. Prefer apps without offers when mutating. */
    async function ensureCandAppTabs({ avoidOfferLinked = false } = {}) {
      const TAB_STATUSES = [
        'applied',
        'shortlisted',
        'interviewing',
        'offered',
        'rejected',
        'withdrawn',
        'hired',
        'declined_offer',
        'completed',
      ];
      let spareIdx = 0;
      for (const status of TAB_STATUSES) {
        const countRes = await pool.query(
          `SELECT count(*)::int AS n FROM ip_applications WHERE candidate_id = $1 AND status = $2`,
          [candRow.id, status],
        );
        let n = Number(countRes.rows[0]?.n || 0);
        while (n < MIN_PER_TAB && spareIdx < sparePostsAll.length * 4) {
          const post = sparePostsAll[spareIdx % Math.max(1, sparePostsAll.length)];
          spareIdx += 1;
          if (!post) break;

          const surplus = await pool.query(
            `SELECT a.id FROM ip_applications a
             LEFT JOIN ip_offers o ON o.application_id = a.id
             WHERE a.candidate_id = $1 AND a.status = 'applied'
               AND ($3::boolean = false OR o.id IS NULL)
             ORDER BY a.created_at DESC
             OFFSET $2 LIMIT 1`,
            [candRow.id, MIN_PER_TAB, avoidOfferLinked],
          );
          if (surplus.rows[0] && status !== 'applied') {
            if (status === 'interviewing') {
              await pool.query(
                `UPDATE ip_applications SET status = $2, interview_at = now() + make_interval(days => $3), updated_at = now() WHERE id = $1`,
                [surplus.rows[0].id, status, (n % 10) + 2],
              );
            } else {
              await pool.query(
                `UPDATE ip_applications SET status = $2, updated_at = now() WHERE id = $1`,
                [surplus.rows[0].id, status],
              );
            }
            n += 1;
            continue;
          }

          const exists = await pool.query(
            `SELECT a.id, o.id AS offer_id FROM ip_applications a
             LEFT JOIN ip_offers o ON o.application_id = a.id
             WHERE a.internship_id = $1 AND a.candidate_id = $2`,
            [post.id, candRow.id],
          );
          if (exists.rows[0]) {
            if (avoidOfferLinked && exists.rows[0].offer_id) {
              continue;
            }
            if (status === 'interviewing') {
              await pool.query(
                `UPDATE ip_applications SET status = $2, interview_at = now() + make_interval(days => $3), updated_at = now() WHERE id = $1`,
                [exists.rows[0].id, status, (n % 10) + 2],
              );
            } else {
              await pool.query(
                `UPDATE ip_applications SET status = $2, updated_at = now() WHERE id = $1`,
                [exists.rows[0].id, status],
              );
            }
            n += 1;
            continue;
          }

          await pool.query(
            `INSERT INTO ip_applications (
               id, internship_id, candidate_id, status, match_score, answers, questions_snapshot, interview_at
             ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
            [
              newId('ip_app'),
              post.id,
              candRow.id,
              status,
              75 + (n % 20),
              JSON.stringify({ q1: 'q1_a' }),
              JSON.stringify(MCQ),
              status === 'interviewing' ? new Date(Date.now() + ((n % 10) + 2) * 86400000) : null,
            ],
          );
          created.applications += 1;
          n += 1;
        }
      }
    }

    await ensureCandAppTabs();

    // Saved internships — ≥ MIN_PER_TAB so Browse → Saved can paginate
    {
      const saveTargets = [
        ...livePostings.map((p) => p.id),
        ...sparePostsAll.map((p) => p.id),
      ];
      let savedN = Number(
        (
          await pool.query(`SELECT count(*)::int AS n FROM ip_saved_internships WHERE candidate_id = $1`, [
            candRow.id,
          ])
        ).rows[0]?.n || 0,
      );
      for (let i = 0; i < saveTargets.length && savedN < MIN_PER_TAB; i += 1) {
        const internshipId = saveTargets[i];
        if (!internshipId) continue;
        const savEx = await pool.query(
          `SELECT 1 FROM ip_saved_internships WHERE candidate_id = $1 AND internship_id = $2`,
          [candRow.id, internshipId],
        );
        if (savEx.rows[0]) continue;
        await pool.query(
          `INSERT INTO ip_saved_internships (id, candidate_id, internship_id)
           VALUES ($1,$2,$3)`,
          [newId('ip_sav'), candRow.id, internshipId],
        );
        created.saved += 1;
        savedN += 1;
      }
    }

    async function ensureThreadWithMessages({
      candidateUserId,
      employerUserId,
      internshipId,
      applicationId,
      subject,
      snippetIndex,
    }) {
      const existing = await pool.query(
        `SELECT id FROM ip_message_threads
         WHERE candidate_user_id = $1 AND employer_user_id = $2
           AND (($3::text IS NULL AND internship_id IS NULL) OR internship_id = $3)
         LIMIT 1`,
        [candidateUserId, employerUserId, internshipId || null],
      );
      let tid = existing.rows[0]?.id;
      if (!tid) {
        tid = newId('ip_th');
        await pool.query(
          `INSERT INTO ip_message_threads (
             id, internship_id, candidate_user_id, employer_user_id, application_id, subject
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            tid,
            internshipId || null,
            candidateUserId,
            employerUserId,
            applicationId || null,
            subject || 'Internship conversation',
          ],
        );
        created.threads += 1;
      } else if (applicationId) {
        await pool.query(
          `UPDATE ip_message_threads SET application_id = COALESCE(application_id, $2) WHERE id = $1`,
          [tid, applicationId],
        );
      }

      const msgCount = await pool.query(
        `SELECT count(*)::int AS n FROM ip_messages WHERE thread_id = $1`,
        [tid],
      );
      const snippets = msgSnippets(snippetIndex);
      const n = Number(msgCount.rows[0].n);
      // Always refresh short / incomplete threads so long bodies show scroll in the UI
      if (n !== snippets.length) {
        await pool.query(`DELETE FROM ip_messages WHERE thread_id = $1`, [tid]);
        for (let i = 0; i < snippets.length; i += 1) {
          const fromEmployer = i % 2 === 0;
          await pool.query(
            `INSERT INTO ip_messages (id, thread_id, sender_user_id, body)
             VALUES ($1,$2,$3,$4)`,
            [
              newId('ip_msg'),
              tid,
              fromEmployer ? employerUserId : candidateUserId,
              snippets[i],
            ],
          );
          created.messages += 1;
        }
        await pool.query(`UPDATE ip_message_threads SET updated_at = now() WHERE id = $1`, [tid]);
      } else {
        // Upgrade legacy short bodies in place
        for (let i = 0; i < snippets.length; i += 1) {
          await pool.query(
            `UPDATE ip_messages SET body = $2
             WHERE id = (
               SELECT id FROM ip_messages WHERE thread_id = $1 ORDER BY sent_at ASC OFFSET $3 LIMIT 1
             )`,
            [tid, snippets[i], i],
          );
        }
      }
      return { tid };
    }

    const threadPartners = [];
    const threadTarget = Math.max(TARGET_LIST_ROWS, 22);
    for (let i = 0; i < livePostings.length && threadPartners.length < threadTarget; i += 1) {
      const posting = livePostings[i];
      const app = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [posting.id, candRow.id],
      );
      threadPartners.push({
        candidateUserId: candUser.id,
        employerUserId: empUser.id,
        internshipId: posting.id,
        applicationId: app.rows[0]?.id || null,
        subject: `${posting.title} — ${CAND_BASE_NAME}`,
        snippetIndex: i,
      });
    }
    const primaryPosting = livePostings[0];
    for (let j = 0; j < supportCands.length && threadPartners.length < threadTarget; j += 1) {
      const cand = supportCands[j];
      let applicationId = null;
      if (primaryPosting) {
        const app = await pool.query(
          `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
          [primaryPosting.id, cand.candId],
        );
        applicationId = app.rows[0]?.id || null;
      }
      threadPartners.push({
        candidateUserId: cand.userId,
        employerUserId: empUser.id,
        internshipId: primaryPosting?.id || null,
        applicationId,
        subject: `${primaryPosting?.title || 'Role'} — ${cand.name}`,
        snippetIndex: j + 2,
      });
    }
    for (const se of supportEmps) {
      if (threadPartners.length >= threadTarget) break;
      for (const post of se.posts) {
        if (threadPartners.length >= threadTarget) break;
        const app = await pool.query(
          `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
          [post.id, candRow.id],
        );
        threadPartners.push({
          candidateUserId: candUser.id,
          employerUserId: se.userId,
          internshipId: post.id,
          applicationId: app.rows[0]?.id || null,
          subject: `${post.title} — ${se.company}`,
          snippetIndex: threadPartners.length,
        });
      }
    }

    for (const partner of threadPartners) {
      await ensureThreadWithMessages(partner);
    }

    // Archive only 1–2 threads (majority stay in inbox)
    {
      await pool.query(
        `UPDATE ip_message_threads
         SET candidate_archived_at = NULL, updated_at = now()
         WHERE candidate_user_id = $1 AND candidate_archived_at IS NOT NULL`,
        [candUser.id],
      );
      const arch = await pool.query(
        `SELECT id FROM ip_message_threads
         WHERE candidate_user_id = $1 AND candidate_archived_at IS NULL
         ORDER BY updated_at ASC
         LIMIT 2`,
        [candUser.id],
      );
      for (const row of arch.rows) {
        await pool.query(
          `UPDATE ip_message_threads SET candidate_archived_at = now(), updated_at = now() WHERE id = $1`,
          [row.id],
        );
      }
    }

    // Make Applications quick chips visibly different (starting soon / recent / verified).
    // Keep starts_at in the past so Browse (CANDIDATE_VISIBLE) still shows these listings.
    {
      await pool.query(
        `UPDATE ip_internships i
         SET starts_at = LEAST(COALESCE(i.starts_at, now() - interval '2 hours'), now() - interval '1 hour'),
             start_date = CURRENT_DATE + GREATEST(2, (abs(hashtext(i.id)) % 16)),
             updated_at = CASE
               WHEN abs(hashtext(i.id)) % 3 = 0 THEN now() - interval '12 days'
               ELSE now() - interval '2 days'
             END
         FROM ip_applications a
         WHERE a.internship_id = i.id AND a.candidate_id = $1`,
        [candRow.id],
      );
      await pool.query(
        `UPDATE ip_applications a
         SET updated_at = CASE
           WHEN abs(hashtext(a.id)) % 3 = 0 THEN now() - interval '14 days'
           WHEN abs(hashtext(a.id)) % 3 = 1 THEN now() - interval '3 days'
           ELSE now() - interval '1 day'
         END
         WHERE a.candidate_id = $1`,
        [candRow.id],
      );
      await pool.query(
        `UPDATE ip_employers e
         SET approval_status = 'pending'
         WHERE e.id IN (
           SELECT i.employer_id
           FROM ip_applications a
           JOIN ip_internships i ON i.id = a.internship_id
           WHERE a.candidate_id = $1 AND i.employer_id <> $2
           ORDER BY a.created_at ASC
           OFFSET 20 LIMIT 25
         )`,
        [candRow.id, empRow.id],
      );
    }

    // Offers — distribute across many candidates & employers (never same name spam / one pair only)
    await pool.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS start_date DATE`).catch(() => {});
    await pool.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS valid_until DATE`).catch(() => {});

    let offerIdx = 0;

    // A) Core employer → many different support candidates (≥ TARGET for employer Offers page)
    for (let j = 0; j < supportCands.length && created.offers < TARGET_LIST_ROWS * 3; j += 1) {
      const posting = livePostings[j % Math.max(1, livePostings.length)];
      if (!posting) break;
      const cand = supportCands[j];
      const app = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [posting.id, cand.candId],
      );
      const ok = await insertVariedOffer(pool, {
        internshipId: posting.id,
        employerId: empRow.id,
        candidateId: cand.candId,
        applicationId: app.rows[0]?.id,
        title: posting.title,
        stipend: 14000 + (j % 9) * 1000,
        message: `Hi ${cand.name.split(' ')[0]}, we would like to extend an offer for ${posting.title}. ${pick(OFFER_MESSAGES, j)}`,
        index: offerIdx,
      });
      if (ok) {
        created.offers += 1;
        offerIdx += 1;
      }
    }

    // B) Different support employers → core candidate (≥ TARGET for candidate Offers page)
    for (let i = 0; i < supportEmps.length && created.offers < TARGET_LIST_ROWS * 3; i += 1) {
      const se = supportEmps[i];
      const post = se.posts[i % Math.max(1, se.posts.length)] || se.posts[0];
      if (!post) continue;
      const app = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [post.id, candRow.id],
      );
      const ok = await insertVariedOffer(pool, {
        internshipId: post.id,
        employerId: se.empId,
        candidateId: candRow.id,
        applicationId: app.rows[0]?.id,
        title: post.title,
        stipend: 15000 + (i % 6) * 1500,
        message: pick(OFFER_MESSAGES, i + 2),
        index: offerIdx,
      });
      if (ok) {
        created.offers += 1;
        offerIdx += 1;
      }
    }

    // C) Cross-mix: support employer → support candidate (avoids “always same employer→same candidate”)
    for (let k = 0; k < Math.min(supportEmps.length, supportCands.length) && created.offers < TARGET_LIST_ROWS * 3; k += 1) {
      const se = supportEmps[k];
      const cand = supportCands[(k + 3) % supportCands.length];
      const post = se.posts[0];
      if (!post || !cand) continue;
      const app = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [post.id, cand.candId],
      );
      const ok = await insertVariedOffer(pool, {
        internshipId: post.id,
        employerId: se.empId,
        candidateId: cand.candId,
        applicationId: app.rows[0]?.id,
        title: post.title,
        stipend: 12500 + (k % 5) * 1750,
        message: pick(OFFER_MESSAGES, k + 5),
        index: offerIdx,
      });
      if (ok) {
        created.offers += 1;
        offerIdx += 1;
      }
    }

    // Ensure core candidate also has at least one offer from core employer (different from hired path)
    if (livePostings[0]) {
      const appForOffer = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [livePostings[0].id, candRow.id],
      );
      const ok = await insertVariedOffer(pool, {
        internshipId: livePostings[0].id,
        employerId: empRow.id,
        candidateId: candRow.id,
        applicationId: appForOffer.rows[0]?.id,
        title: livePostings[0].title,
        stipend: 20000,
        message: pick(OFFER_MESSAGES, 0),
        index: offerIdx,
      });
      if (ok) {
        created.offers += 1;
        offerIdx += 1;
      }
    }

    // Hired + endorsement on second live posting
    const hiredPosting = livePostings[1];
    if (hiredPosting) {
      const hiredApp = await pool.query(
        `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
        [hiredPosting.id, candRow.id],
      );
      const hiredAppId = hiredApp.rows[0]?.id;
      if (hiredAppId) {
        await pool.query(`UPDATE ip_applications SET status = 'hired', updated_at = now() WHERE id = $1`, [
          hiredAppId,
        ]);
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
              hiredPosting.title,
              `This certifies that ${CAND_BASE_NAME} completed the ${hiredPosting.title} internship with ${companyLabel}, demonstrating strong delivery and collaboration.`,
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
            [
              newId('ip_rate'),
              hiredPosting.id,
              empUser.id,
              candUser.id,
              `${CAND_BASE_NAME} delivered reliable work on ${hiredPosting.title} and communicated clearly with the team.`,
            ],
          );
          created.ratings += 1;
        }
      }
    }

    // Guarantee ≥ MIN_PER_TAB offers per candidate Offers tab (pending/accepted/declined/expired)
    {
      const OFFER_TAB_STATUSES = ['pending', 'accepted', 'declined', 'expired'];
      let offerSpare = 0;
      for (const status of OFFER_TAB_STATUSES) {
        const countRes = await pool.query(
          `SELECT count(*)::int AS n FROM ip_offers WHERE candidate_id = $1 AND status = $2`,
          [candRow.id, status],
        );
        let n = Number(countRes.rows[0]?.n || 0);
        while (n < MIN_PER_TAB && offerSpare < sparePostsAll.length * 3) {
          const post = sparePostsAll[offerSpare % Math.max(1, sparePostsAll.length)];
          offerSpare += 1;
          if (!post) break;
          const se = supportEmps.find((e) => e.posts.some((p) => p.id === post.id));
          if (!se) continue;
          let appId = (
            await pool.query(
              `SELECT a.id FROM ip_applications a
               LEFT JOIN ip_offers o ON o.application_id = a.id
               WHERE a.internship_id = $1 AND a.candidate_id = $2 AND o.id IS NULL
               LIMIT 1`,
              [post.id, candRow.id],
            )
          ).rows[0]?.id;
          if (!appId) {
            const anyApp = await pool.query(
              `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2 LIMIT 1`,
              [post.id, candRow.id],
            );
            if (anyApp.rows[0]) continue;
            appId = newId('ip_app');
            await pool.query(
              `INSERT INTO ip_applications (
                 id, internship_id, candidate_id, status, match_score, answers, questions_snapshot
               ) VALUES ($1,$2,$3,'offered',$4,$5::jsonb,$6::jsonb)`,
              [
                appId,
                post.id,
                candRow.id,
                80 + (n % 15),
                JSON.stringify({ q1: 'q1_a' }),
                JSON.stringify(MCQ),
              ],
            );
            created.applications += 1;
          }
          const ok = await insertVariedOffer(pool, {
            internshipId: post.id,
            employerId: se.empId,
            candidateId: candRow.id,
            applicationId: appId,
            title: post.title,
            stipend: 16000 + (n % 8) * 1000,
            message: `${pick(OFFER_MESSAGES, n + offerSpare)} — ${se.company}`,
            index: status === 'pending' ? 0 : status === 'accepted' ? 1 : status === 'declined' ? 2 : 3,
          });
          if (ok) {
            // Force exact status (insertVariedOffer cycles by index)
            await pool.query(`UPDATE ip_offers SET status = $2, valid_until = $3 WHERE application_id = $1`, [
              appId,
              status,
              offerDatePair(n, status).validUntil,
            ]);
            await pool.query(`UPDATE ip_applications SET status = $2, updated_at = now() WHERE id = $1`, [
              appId,
              applicationStatusForOffer(status),
            ]);
            created.offers += 1;
            n += 1;
          }
        }
      }
    }

    // Rebalance application tabs after offers may have overwritten statuses
    await ensureCandAppTabs({ avoidOfferLinked: true });

    // Employer list + rejection templates (varied names)
    const listEx = await pool.query(
      `SELECT id FROM ip_employer_lists WHERE employer_id = $1 AND name = $2 LIMIT 1`,
      [empRow.id, 'Campus shortlist — Pune'],
    );
    let listId = listEx.rows[0]?.id;
    if (!listId) {
      listId = newId('ip_lst');
      await pool.query(`INSERT INTO ip_employer_lists (id, employer_id, name) VALUES ($1,$2,$3)`, [
        listId,
        empRow.id,
        'Campus shortlist — Pune',
      ]);
      created.lists += 1;
    }
    const appForList = await pool.query(
      `SELECT id FROM ip_applications WHERE internship_id = ANY($1::text[]) LIMIT 12`,
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
      [empRow.id, 'Polite decline — role filled'],
    );
    if (!tmplEx.rows[0]) {
      await pool.query(
        `INSERT INTO ip_rejection_templates (id, employer_id, name, body, is_system, version)
         VALUES ($1,$2,$3,$4,false,1)`,
        [
          newId('ip_rt'),
          empRow.id,
          'Polite decline — role filled',
          'Hi {{candidate_first_name}}, thank you for applying to {{internship_title}}. We filled the cohort this round and hope you apply again next season.',
        ],
      );
      created.templates += 1;
    }

    // Notifications — ≥ MIN_PER_TAB per candidate filter bucket (+ unread / timed)
    {
      const CAND_NOTIF_BUCKETS = [
        {
          category: 'application',
          title: 'Application update',
          body: 'An employer updated the status of your application.',
          link: '/candidate/applications',
          company: true,
        },
        {
          category: 'offer',
          title: 'Offer needs your response',
          body: 'Review stipend, start date, and respond before the deadline.',
          link: '/candidate/offers',
          company: true,
          deadline: true,
        },
        {
          category: 'interview',
          title: 'Interview scheduled',
          body: 'Confirm your interview slot and prepare questions for the hiring team.',
          link: '/candidate/messages',
          company: true,
          deadline: true,
        },
        {
          category: 'message',
          title: 'New recruiter message',
          body: 'You have an unread conversation about an active internship.',
          link: '/candidate/messages',
          company: true,
        },
        {
          category: 'referral',
          title: 'Referral points credited',
          body: 'A verified referral added points to your InternSafar balance.',
          link: '/candidate/referral',
        },
      ];
      for (const bucket of CAND_NOTIF_BUCKETS) {
        for (let i = 0; i < MIN_PER_TAB; i += 1) {
          const hoursAgo = 2 + i * 3 + (bucket.category === 'offer' ? 0 : i);
          const createdAt = new Date(Date.now() - hoursAgo * 3600000).toISOString();
          const company = companyName(40 + i + bucket.category.length);
          const meta = {};
          if (bucket.company) meta.company = company;
          if (bucket.deadline) {
            meta.deadlineText = `Respond by ${new Date(Date.now() + (i + 2) * 86400000).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
            })}`;
          }
          await insertNotification(pool, candUser.id, {
            category: bucket.category,
            title: `${bucket.title} — ${personName(90 + i)} @ ${company}`,
            body: `${bucket.body} (${CAND_BASE_NAME} · ${i + 1})`,
            link: bucket.link,
            meta,
            created_at: createdAt,
            read_at: i % 3 === 0 ? new Date(Date.now() - 3600000).toISOString() : null,
          });
          created.notifications += 1;
        }
      }
      // Extra timed/urgent-style rows for Time-limited filter
      for (let i = 0; i < MIN_PER_TAB; i += 1) {
        const company = companyName(70 + i);
        await insertNotification(pool, candUser.id, {
          category: 'offer',
          title: `Deadline soon — ${roleTitle(80 + i)} at ${company}`,
          body: `Action required within ${i + 1} day(s) for ${CAND_BASE_NAME}.`,
          link: '/candidate/offers',
          meta: {
            company,
            deadlineText: `Expires in ${i + 1} day${i === 0 ? '' : 's'}`,
          },
          created_at: new Date(Date.now() - i * 3600000).toISOString(),
          read_at: null,
        });
        created.notifications += 1;
      }
    }

    for (const userId of [empUser.id, saUser.id]) {
      for (let i = 0; i < TARGET_LIST_ROWS; i += 1) {
        const base = notificationAt(i + (userId === saUser.id ? 5 : 2));
        const suffix = userId === empUser.id ? companyLabel : 'Ops';
        await insertNotification(pool, userId, {
          ...base,
          title: `${base.title} (${suffix} · ${i + 1})`,
          body: `${base.body} Reference ${runId}.`,
          created_at: new Date(Date.now() - (i + 1) * 7200000).toISOString(),
          read_at: i % 4 === 0 ? new Date().toISOString() : null,
        });
        created.notifications += 1;
      }
    }

    // Referrals ledger for core employer + candidate
    async function seedReferrals(referrerUserId, referredList) {
      const refUser = await pool.query(`SELECT referral_code FROM ip_users WHERE id = $1`, [
        referrerUserId,
      ]);
      let code = refUser.rows[0]?.referral_code;
      if (!code) {
        code = `REF-CORE-${runId}`;
        await pool.query(`UPDATE ip_users SET referral_code = $2 WHERE id = $1`, [referrerUserId, code]);
      }
      for (let i = 0; i < referredList.length; i += 1) {
        const referred = referredList[i];
        const status = i % 6 === 0 ? 'pending' : i % 9 === 0 ? 'invalid' : 'completed';
        const points = status === 'completed' ? 20 + (i % 5) * 5 : 0;
        const exists = await pool.query(
          `SELECT 1 FROM ip_referrals WHERE referrer_user_id = $1 AND referred_user_id = $2 LIMIT 1`,
          [referrerUserId, referred.userId],
        );
        if (exists.rows[0]) continue;
        try {
          await pool.query(
            `INSERT INTO ip_referrals (id, referrer_user_id, referred_user_id, referral_code, status, points_awarded)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [newId('ip_ref'), referrerUserId, referred.userId, code, status, points],
          );
          created.referrals += 1;
        } catch {
          /* unique */
        }
      }
    }

    await seedReferrals(empUser.id, supportCands.slice(0, TARGET_LIST_ROWS));
    await seedReferrals(
      candUser.id,
      supportEmps.slice(0, TARGET_LIST_ROWS).map((e) => ({ userId: e.userId })),
    );
    // If not enough support employers for candidate referrals, use support candidates
    if (created.referrals < TARGET_LIST_ROWS) {
      await seedReferrals(candUser.id, supportCands.slice(0, TARGET_LIST_ROWS));
    }

    // Feature ideas (≥ TARGET unique titles)
    await ensureFeatureIdeas(
      pool,
      [candUser.id, empUser.id, ...supportCands.slice(0, 5).map((c) => c.userId)],
      TARGET_LIST_ROWS,
      created,
    );

    // Never leave apps/saves/offers/threads pointing at non-live postings
    // (Browse + "Open internship" from My Applications must resolve).
    await pool.query(`
      WITH refs AS (
        SELECT internship_id AS id FROM ip_applications WHERE internship_id IS NOT NULL
        UNION SELECT internship_id FROM ip_saved_internships WHERE internship_id IS NOT NULL
        UNION SELECT internship_id FROM ip_offers WHERE internship_id IS NOT NULL
        UNION SELECT internship_id FROM ip_message_threads WHERE internship_id IS NOT NULL
      )
      UPDATE ip_internships i
      SET
        status = CASE WHEN i.status IN ('draft','paused','closed') THEN 'published' ELSE i.status END,
        starts_at = CASE
          WHEN i.starts_at IS NULL OR i.starts_at > now() THEN now() - interval '2 hours'
          ELSE i.starts_at
        END,
        apply_ends_at = CASE
          WHEN i.apply_ends_at IS NULL OR i.apply_ends_at <= now() THEN now() + interval '28 days'
          ELSE i.apply_ends_at
        END,
        closed_reason = NULL,
        updated_at = now()
      FROM refs r
      WHERE i.id = r.id
        AND (
          i.status <> 'published'
          OR (i.starts_at IS NOT NULL AND i.starts_at > now())
          OR (i.apply_ends_at IS NOT NULL AND i.apply_ends_at <= now())
        )
    `);

    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }

  return {
    mode: 'core-fill',
    runId,
    targetListRows: TARGET_LIST_ROWS,
    cores: {
      candidate: CAND_BASE,
      employer: EMP_BASE,
      superadmin: SUPERADMIN_EMAIL,
    },
    created,
    samplePostingTitles: postingIds.slice(0, 6).map((p) => p.title),
    sampleIdeaTitles: FEATURE_IDEAS.slice(0, 6).map((x) => x.title),
    identityNote: 'Core email/password/role were not changed',
    deleteSupportHint: `npm run delete:ip-generated-run -- --confirm-generated-run ${runId}`,
    wipeNonCoresHint: 'npm run delete:ip-except-cores -- --confirm-except-cores YES',
  };
}

async function main() {
  assertProtectedConfigValid();
  const mode = arg('mode', 'gen-accounts');
  const runId = arg(
    'run-id',
    `${mode === 'core-fill' ? 'corefill' : 'gen'}-${qaRunLabel()}`,
  );
  const password = arg('password', DEMO_PASSWORD);
  const dbUrl = loadDbUrl();
  if (!dbUrl) throw new Error('DATABASE_URL (or SUPABASE_DATABASE_URL) required in env');

  if (hasFlag('help') || mode === 'help') {
    console.log(`Usage:
  node scripts/generate-ip-test-data.mjs --mode=gen-accounts [--employers=${TARGET_LIST_ROWS}] [--candidates=${TARGET_LIST_ROWS}] [--postings=${TARGET_LIST_ROWS}]
  node scripts/generate-ip-test-data.mjs --mode=core-fill [--support-candidates=${TARGET_LIST_ROWS}] [--support-employers=${TARGET_LIST_ROWS}]
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
        supportCandidatesN: Number(arg('support-candidates', Math.max(TARGET_LIST_ROWS, 40))),
        supportEmployersN: Number(arg('support-employers', Math.max(TARGET_LIST_ROWS, 40))),
      });
    } else if (mode === 'gen-accounts') {
      const baseMailbox = arg('base-mailbox', 'lawsonlclintern@gmail.com');
      if (isProtectedEmail(baseMailbox)) {
        console.warn('Note: base mailbox is a core email; plus-tags must not collide with cores.');
      }
      result = await modeGenAccounts(pool, {
        employersN: Number(arg('employers', TARGET_LIST_ROWS)),
        candidatesN: Number(arg('candidates', TARGET_LIST_ROWS)),
        postingsN: Number(arg('postings', TARGET_LIST_ROWS)),
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
