/**
 * IS-088 setup. Picks an alias1–alias5 posting that is already open, and a stable
 * candidate mailbox. Does not delete the employer or the posting, and does not change
 * the alias password. Sign-in uses IP_QA_ALIAS_PASSWORD from .env.local.
 * Cleanup removes only this candidate's applications, offers, and messages.
 * Local and *.vercel.app only. Refuses an RDS host.
 */
const path = require('path');
const { URL } = require('url');
const dotenv = require('dotenv');
const pg = require('pg');
const bcrypt = require('bcryptjs');

const appRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: path.join(appRoot, '.env'), quiet: true });

const { getCorePasswordForRole } = require('../../scripts/lib/ipCoreSampleConfig.js');

const CANDIDATE_EMAIL = 'lawsonlclintern+qa-offerflow@gmail.com';
const CANDIDATE_NAME = 'Neha Kulkarni';
/** alias2 is last: unknown-login removes that account for the length of its own check. */
const ALIAS_ORDER = [
  'alias1@placementhub.online',
  'alias3@placementhub.online',
  'alias4@placementhub.online',
  'alias5@placementhub.online',
  'alias2@placementhub.online',
];

function isOfferPipelineHost(base) {
  let host = '';
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app');
}

function dbHost(url) {
  const normalized = String(url).replace(/^postgres(ql)?:/i, 'http:');
  return new URL(normalized).hostname.toLowerCase();
}

function assertNotRds(url) {
  const host = dbHost(url);
  if (host.endsWith('.rds.amazonaws.com') || host.endsWith('.rds.amazonaws.com.cn')) {
    throw new Error('Offer pipeline fixture refuses an RDS host');
  }
}

function questionsEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') {
    const text = value.trim();
    return text === '' || text === '[]' || text === 'null';
  }
  return false;
}

async function connect() {
  const url = process.env.IP_DATABASE_URL || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';
  if (!url) throw new Error('DATABASE_URL missing (.env.local)');
  assertNotRds(url);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function ensureCandidate(client, password) {
  const hash = await bcrypt.hash(password, 10);
  const existing = await client.query(`SELECT id FROM ip_users WHERE lower(email) = lower($1)`, [CANDIDATE_EMAIL]);
  let userId = existing.rows[0]?.id;
  if (!userId) {
    userId = 'ip_user_qa_offerflow';
    await client.query(
      `INSERT INTO ip_users (id, email, password_hash, role, name, points, free_post_credits, application_allowance, profile_complete, active)
       VALUES ($1, $2, $3, 'candidate', $4, 500, 0, 0, true, true)`,
      [userId, CANDIDATE_EMAIL, hash, CANDIDATE_NAME],
    );
  }
  await client.query(
    `UPDATE ip_users
        SET role='candidate', name=$2, active=true, profile_complete=true, two_factor_enabled=false,
            points=GREATEST(points, 500), password_hash=$3,
            email_verified_at=COALESCE(email_verified_at, now()),
            referral_code=COALESCE(referral_code, 'QAOFFERFLOW'), updated_at=now()
      WHERE id=$1`,
    [userId, CANDIDATE_NAME, hash],
  );

  const profile = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [userId]);
  let candidateId = profile.rows[0]?.id;
  const skills = ['React', 'TypeScript', 'Node.js'];
  if (!candidateId) {
    candidateId = 'ip_cand_qa_offerflow';
    await client.query(
      `INSERT INTO ip_candidates (
         id, user_id, name, email, first_name, last_name, phone, phone_country_code,
         college, degree, specialization, study_status, graduation_year, cgpa, city, state, country,
         skills, preferred_work_mode, preferred_locations, searchable, show_profile_picture
       ) VALUES (
         $1, $2, $3, $4, 'Neha', 'Kulkarni', '9845012340', '+91',
         'Vishwakarma Institute of Technology', 'B.E.', 'Information Technology', 'Studying', 2027, 8.4,
         'Pune', 'Maharashtra', 'India',
         $5::text[], 'Remote', ARRAY['Pune','Remote']::text[], true, true
       )`,
      [candidateId, userId, CANDIDATE_NAME, CANDIDATE_EMAIL, skills],
    );
  } else {
    await client.query(
      `UPDATE ip_candidates
          SET name=$2, email=$3, first_name='Neha', last_name='Kulkarni', phone='9845012340', phone_country_code='+91',
              college='Vishwakarma Institute of Technology', degree='B.E.', specialization='Information Technology',
              study_status='Studying', graduation_year=2027, cgpa=8.4, city='Pune', state='Maharashtra', country='India',
              skills=$4::text[], preferred_work_mode='Remote', searchable=true, updated_at=now()
        WHERE id=$1`,
      [candidateId, CANDIDATE_NAME, CANDIDATE_EMAIL, skills],
    );
  }
  return { userId, candidateId };
}

async function pickPosting(client) {
  const found = await client.query(
    `SELECT i.id, i.title, i.questions, u.email, e.company_name
       FROM ip_internships i
       JOIN ip_employers e ON e.id = i.employer_id
       JOIN ip_users u ON u.id = e.user_id
      WHERE lower(u.email) = ANY($1::text[])
        AND i.status = 'published'
        AND (i.starts_at IS NULL OR i.starts_at <= now())
        AND (i.apply_ends_at IS NULL OR i.apply_ends_at > now())
      ORDER BY array_position($1::text[], lower(u.email)), i.created_at`,
    [ALIAS_ORDER],
  );
  const row = found.rows.find((r) => questionsEmpty(r.questions));
  if (!row) {
    throw new Error('No alias1–alias5 posting is open without screening questions');
  }
  return row;
}

async function deleteCandidateRows(client, candidateId, candidateUserId) {
  const apps = await client.query(`SELECT id FROM ip_applications WHERE candidate_id = $1`, [candidateId]);
  const appIds = apps.rows.map((r) => r.id);
  if (appIds.length) {
    await client.query(`DELETE FROM ip_offers WHERE application_id = ANY($1::text[]) OR candidate_id = $2`, [
      appIds,
      candidateId,
    ]);
  } else {
    await client.query(`DELETE FROM ip_offers WHERE candidate_id = $1`, [candidateId]);
  }
  await client.query(
    `DELETE FROM ip_messages
      WHERE thread_id IN (
        SELECT id FROM ip_message_threads WHERE candidate_user_id = $1
      )`,
    [candidateUserId],
  );
  await client.query(`DELETE FROM ip_message_threads WHERE candidate_user_id = $1`, [candidateUserId]);
  if (appIds.length) {
    await client.query(`DELETE FROM ip_applications WHERE id = ANY($1::text[])`, [appIds]);
  }
}

async function prepareOfferPipeline(base) {
  if (!isOfferPipelineHost(base)) {
    throw new Error('Offer pipeline runs on localhost or a vercel.app host only');
  }
  const password = getCorePasswordForRole('candidate');
  const client = await connect();

  try {
    const candidate = await ensureCandidate(client, password);
    await deleteCandidateRows(client, candidate.candidateId, candidate.userId);
    const posting = await pickPosting(client);

    return {
      candidateEmail: CANDIDATE_EMAIL,
      candidateName: CANDIDATE_NAME,
      employerEmail: posting.email,
      companyName: posting.company_name,
      internshipId: posting.id,
      internshipTitle: posting.title,
      cleanup: async () => {
        try {
          await deleteCandidateRows(client, candidate.candidateId, candidate.userId);
        } finally {
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.end();
    throw error;
  }
}

module.exports = {
  CANDIDATE_EMAIL,
  CANDIDATE_NAME,
  isOfferPipelineHost,
  prepareOfferPipeline,
};
