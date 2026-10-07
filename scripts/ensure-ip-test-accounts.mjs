#!/usr/bin/env node
/**
 * Create or repair the disposable QA test accounts (scripts/lib/ipTestAccountsConfig.js):
 * a ready-to-apply candidate, an approved ready-to-post employer with open postings, and a
 * pending employer for approval screens.
 *
 *   npm run qa:ensure-test-accounts
 *   npm run qa:ensure-test-accounts -- --quiet
 *
 * Idempotent: existing test accounts are repaired in place, missing ones (e.g. after
 * IP_Reset_Core_Sample.js) are re-created. Playwright global setup runs this before every suite.
 * Writes only to the test accounts — never to core accounts or the SuperAdmin.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: path.join(appRoot, '.env'), quiet: true });

const require = createRequire(import.meta.url);
const {
  TEST_CANDIDATE,
  TEST_CANDIDATE_OTHER,
  TEST_EMPLOYER,
  TEST_EMPLOYER_PENDING,
  TEST_POSTINGS,
  getTestPassword,
  assertTestConfigValid,
} = require('./lib/ipTestAccountsConfig.js');
const { ensureUser, seedAcademics, nidFactory } = require('./lib/ipSeedCoreBaseline.js');
const { EMPLOYER_ETHICS_ITEMS, EMPLOYER_ETHICS_VERSION } = await import(
  pathToFileURL(path.join(appRoot, 'src', 'lib', 'employerEthics.js')).href
);

const quiet = process.argv.includes('--quiet');
const log = (...a) => {
  if (!quiet) console.log(...a);
};

const CANDIDATE_POINTS = 500;
const EMPLOYER_POINTS = 1000;
const WEBSITE = 'https://placementhub.online';

function referralCodeFor(email) {
  return `QA${String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').toUpperCase()}`.slice(0, 24);
}

async function ensureTestUser(client, nid, { email, role, name, points }) {
  const password = getTestPassword();
  const userId = await ensureUser(client, bcrypt, nid, { email, role, name, points, password });
  const row = (await client.query(`SELECT password_hash FROM ip_users WHERE id=$1`, [userId])).rows[0];
  if (!(await bcrypt.compare(password, row?.password_hash || ''))) {
    await client.query(`UPDATE ip_users SET password_hash=$2 WHERE id=$1`, [userId, await bcrypt.hash(password, 10)]);
  }
  await client.query(
    `UPDATE ip_users
        SET active=true, profile_complete=true, two_factor_enabled=false,
            email_verified_at=COALESCE(email_verified_at, now()),
            referral_code=COALESCE(referral_code, $2), updated_at=now()
      WHERE id=$1`,
    [userId, referralCodeFor(email)],
  );
  return userId;
}

async function ensureCandidate(client, nid, c) {
  const name = `${c.firstName} ${c.lastName}`;
  const userId = await ensureTestUser(client, nid, {
    email: c.email,
    role: 'candidate',
    name,
    points: CANDIDATE_POINTS,
  });
  const edu = c.education;
  const values = [
    userId,
    name,
    c.email.toLowerCase(),
    c.firstName,
    c.lastName,
    c.phone,
    edu.college,
    edu.degree,
    edu.specialization,
    edu.studyStatus,
    edu.graduationYear,
    edu.cgpa,
    edu.city,
    edu.state,
    c.skills,
  ];
  const ex = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [userId]);
  let candidateId = ex.rows[0]?.id;
  if (candidateId) {
    await client.query(
      `UPDATE ip_candidates
          SET name=$2, email=$3, first_name=$4, last_name=$5, phone=$6, phone_country_code='+91',
              college=$7, degree=$8, specialization=$9, study_status=$10, graduation_year=$11, cgpa=$12,
              city=$13, state=$14, country='India', skills=$15::text[],
              resume_url=COALESCE(resume_url, 'https://example.com/resume.pdf'),
              searchable=true, updated_at=now()
        WHERE user_id=$1`,
      values,
    );
  } else {
    candidateId = nid('ip_cand');
    await client.query(
      `INSERT INTO ip_candidates (
         id, user_id, name, email, first_name, last_name, phone, phone_country_code,
         college, degree, specialization, study_status, graduation_year, cgpa, city, state, country,
         skills, preferred_work_mode, preferred_locations, resume_url, searchable, show_profile_picture
       ) VALUES (
         $16, $1, $2, $3, $4, $5, $6, '+91',
         $7, $8, $9, $10, $11, $12, $13, $14, 'India',
         $15::text[], 'Remote', ARRAY['Remote','Pune']::text[], 'https://example.com/resume.pdf', true, true
       )`,
      [...values, candidateId],
    );
  }
  await seedAcademics(client, nid, candidateId, edu);
  return { userId, candidateId };
}

async function ensureEmployer(client, nid, e) {
  const userId = await ensureTestUser(client, nid, {
    email: e.email,
    role: 'employer',
    name: e.company,
    points: EMPLOYER_POINTS,
  });
  const acks = Object.fromEntries(EMPLOYER_ETHICS_ITEMS.map((item) => [item.id, true]));
  const approved = e.status === 'approved';
  const values = [
    userId,
    e.company,
    e.company.split(' ')[0],
    WEBSITE,
    e.email.toLowerCase(),
    `${e.company} hires interns across analytics and engineering teams.`,
    e.contactName,
    e.designation,
    e.phone,
    e.status,
    JSON.stringify(acks),
    EMPLOYER_ETHICS_VERSION,
    approved,
  ];
  const ex = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [userId]);
  let employerId = ex.rows[0]?.id;
  if (employerId) {
    await client.query(
      `UPDATE ip_employers
          SET company_name=$2, brand_name=$3, website=$4, work_email=$5, about=$6,
              contact_name=$7, contact_designation=$8, contact_phone=$9, contact_phone_country_code='+91',
              industry='Technology', company_size='11-50', business_entity_type='Private Limited',
              hq_city='Pune', hq_state='Maharashtra', hq_country='India',
              approval_status=$10, rejection_reason=NULL, show_identity_on_posting=true,
              ethics_acks=$11::jsonb, ethics_version=$12,
              ethics_accepted_at=COALESCE(ethics_accepted_at, now()),
              approval_reviewed_at=CASE WHEN $13 THEN COALESCE(approval_reviewed_at, now()) ELSE NULL END,
              updated_at=now()
        WHERE user_id=$1`,
      values,
    );
  } else {
    employerId = nid('ip_emp');
    await client.query(
      `INSERT INTO ip_employers (
         id, user_id, company_name, brand_name, website, work_email, about,
         contact_name, contact_designation, contact_phone, contact_phone_country_code,
         industry, company_size, business_entity_type, hq_city, hq_state, hq_country,
         approval_status, show_identity_on_posting, ethics_acks, ethics_version, ethics_accepted_at,
         approval_reviewed_at
       ) VALUES (
         $14, $1, $2, $3, $4, $5, $6,
         $7, $8, $9, '+91',
         'Technology', '11-50', 'Private Limited', 'Pune', 'Maharashtra', 'India',
         $10, true, $11::jsonb, $12, now(),
         CASE WHEN $13 THEN now() ELSE NULL END
       )`,
      [...values, employerId],
    );
  }
  return { userId, employerId };
}

/** Keeps every test posting published and inside its apply window, so it never expires between runs. */
async function ensurePostings(client, nid, employerId) {
  const ids = [];
  for (const p of TEST_POSTINGS) {
    const description = `${TEST_EMPLOYER.company} is hiring a ${p.title} to work with the team on real projects.`;
    const ex = await client.query(
      `SELECT id FROM ip_internships WHERE employer_id=$1 AND title=$2 ORDER BY created_at LIMIT 1`,
      [employerId, p.title],
    );
    let id = ex.rows[0]?.id;
    if (id) {
      await client.query(
        `UPDATE ip_internships
            SET status='published', closed_reason=NULL, questions='[]'::jsonb,
                starts_at=LEAST(COALESCE(starts_at, now()), now() - interval '1 hour'),
                apply_ends_at=GREATEST(COALESCE(apply_ends_at, now()), now() + interval '30 days'),
                updated_at=now()
          WHERE id=$1`,
        [id],
      );
    } else {
      id = nid('ip_int');
      await client.query(
        `INSERT INTO ip_internships (
           id, employer_id, title, description, location, locations, work_mode, stipend_inr, stipend_type,
           duration_months, engagement_type, eligibility, questions, status, show_employer_identity,
           starts_at, apply_ends_at, start_date
         ) VALUES (
           $1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'fixed',
           3, 'full_time', '{}'::jsonb, '[]'::jsonb, 'published', true,
           now() - interval '1 hour', now() + interval '60 days', CURRENT_DATE + 14
         )`,
        [id, employerId, p.title, description, p.city, JSON.stringify([p.city]), p.workMode, p.stipend],
      );
    }
    ids.push(id);
  }
  return ids;
}

/** One active application on the first posting (duplicate-apply / withdraw-reapply regressions). */
async function ensureActiveApplication(client, nid, candidateId, internshipId) {
  const ex = await client.query(
    `SELECT id, status FROM ip_applications WHERE internship_id=$1 AND candidate_id=$2 ORDER BY created_at DESC`,
    [internshipId, candidateId],
  );
  if (ex.rows.some((r) => String(r.status || '').toLowerCase() !== 'withdrawn')) return 'kept';
  if (ex.rows[0]) {
    await client.query(`UPDATE ip_applications SET status='applied' WHERE id=$1`, [ex.rows[0].id]);
    return 'restored';
  }
  await client.query(
    `INSERT INTO ip_applications (id, internship_id, candidate_id, status, match_score, answers)
     VALUES ($1, $2, $3, 'applied', 80, '{}'::jsonb)`,
    [nid('ip_app'), internshipId, candidateId],
  );
  return 'created';
}

async function main() {
  assertTestConfigValid();
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing (.env.local)');

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`SET lock_timeout = '15s'`);
    await client.query('BEGIN');
    const nid = nidFactory();
    const cand = await ensureCandidate(client, nid, TEST_CANDIDATE);
    await ensureCandidate(client, nid, TEST_CANDIDATE_OTHER);
    const emp = await ensureEmployer(client, nid, TEST_EMPLOYER);
    await ensureEmployer(client, nid, TEST_EMPLOYER_PENDING);
    const postingIds = await ensurePostings(client, nid, emp.employerId);
    const app = await ensureActiveApplication(client, nid, cand.candidateId, postingIds[0]);
    await client.query('COMMIT');

    log('QA test accounts ready (password = core QA password):');
    log(`  Candidate         ${TEST_CANDIDATE.email}`);
    log(`  Other candidate   ${TEST_CANDIDATE_OTHER.email}`);
    log(`  Employer          ${TEST_EMPLOYER.email}  (approved, ${postingIds.length} open postings)`);
    log(`  Pending employer  ${TEST_EMPLOYER_PENDING.email}`);
    log(`  Active application on "${TEST_POSTINGS[0].title}": ${app}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(`[ensure-ip-test-accounts] ${e.message || e}`);
  process.exit(1);
});
