/**
 * Seed full demo data for Nova Labs employer (shreekar.nyayapathi23+2@vit.edu)
 * and Priya Sharma candidate (lawsonlclintern+1@gmail.com) so every tab has content.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(root, '.env.local') });

const EMP_EMAIL = 'shreekar.nyayapathi23+2@vit.edu';
const CAND_EMAIL = 'lawsonlclintern+1@gmail.com';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

function nid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── look up both accounts ───────────────────────────────────────────────────
const empUserRow = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [EMP_EMAIL]);
const candUserRow = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [CAND_EMAIL]);
if (!empUserRow.rows[0]) throw new Error(`Employer not found: ${EMP_EMAIL}`);
if (!candUserRow.rows[0]) throw new Error(`Candidate not found: ${CAND_EMAIL}`);

const empUserId = empUserRow.rows[0].id;
const candUserId = candUserRow.rows[0].id;

const empRow = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [empUserId]);
const candRow = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [candUserId]);
if (!empRow.rows[0]) throw new Error(`ip_employers row missing for ${EMP_EMAIL}`);
if (!candRow.rows[0]) throw new Error(`ip_candidates row missing for ${CAND_EMAIL}`);

const empId = empRow.rows[0].id;
const candId = candRow.rows[0].id;
console.log('employer id:', empId, '| candidate id:', candId);

// ── ensure employer profile is complete ────────────────────────────────────
await client.query(`
  UPDATE ip_employers SET
    company_name = 'Nova Labs',
    website = 'https://novalabs.dev',
    work_email = $2,
    industry = 'Technology',
    company_size = '51-200',
    hq_city = 'Hyderabad',
    hq_state = 'Telangana',
    about = 'Nova Labs builds developer tools and cloud platforms for modern startups.',
    contact_name = 'Nova Labs HR',
    contact_designation = 'HR Lead',
    contact_phone = '9000000088',
    approval_status = 'approved',
    show_identity_on_posting = true,
    ethics_acks = '{"no_fees":true,"accurate_info":true,"data_privacy":true}'::jsonb,
    ethics_accepted_at = now(),
    updated_at = now()
  WHERE id = $1
`, [empId, EMP_EMAIL]);
await client.query(`UPDATE ip_users SET profile_complete=true, points=GREATEST(points,200) WHERE id=$1`, [empUserId]);
console.log('employer profile updated');

// ── internships (3 published + 1 draft) ───────────────────────────────────
async function ensureInternship(title, status = 'published') {
  const ex = await client.query(`SELECT id FROM ip_internships WHERE employer_id=$1 AND title=$2 LIMIT 1`, [empId, title]);
  if (ex.rows[0]) return ex.rows[0].id;
  const id = nid('ip_int');
  await client.query(`
    INSERT INTO ip_internships
      (id, employer_id, title, description, location, work_mode, stipend_inr, duration_months,
       eligibility, questions, status, show_employer_identity, engagement_type, stipend_type)
    VALUES ($1,$2,$3,$4,'Remote / Hybrid','Remote',15000,3,
      '{"skills":["JavaScript","React","TypeScript","Node"]}'::jsonb,
      '[{"id":"q1","prompt":"Why this internship?","type":"textarea"}]'::jsonb,
      $5,true,'full_time','fixed')`,
    [id, empId, title,
     `${title}\n\nJoin Nova Labs for hands-on experience with real products. Weekly mentorship, demo day, and a certificate.`,
     status]);
  return id;
}

const int1 = await ensureInternship('Frontend Developer Intern');
const int2 = await ensureInternship('Backend API Intern');
const int3 = await ensureInternship('Data Analyst Intern');
const int4 = await ensureInternship('Design Intern (Draft)', 'draft');
console.log('internships ready:', int1, int2, int3);

// ── application from Priya Sharma → int1, status=offered ──────────────────
async function ensureApplication(internshipId, status, matchScore) {
  const ex = await client.query(`SELECT id FROM ip_applications WHERE internship_id=$1 AND candidate_id=$2`, [internshipId, candId]);
  if (ex.rows[0]) {
    await client.query(`UPDATE ip_applications SET status=$2, match_score=$3 WHERE id=$1`, [ex.rows[0].id, status, matchScore]);
    return ex.rows[0].id;
  }
  const id = nid('ip_app');
  await client.query(`
    INSERT INTO ip_applications (id, internship_id, candidate_id, status, match_score, answers)
    VALUES ($1,$2,$3,$4,$5,'{"q1":"I am passionate about developer tooling and would love to contribute."}'::jsonb)`,
    [id, internshipId, candId, status, matchScore]);
  return id;
}

const app1 = await ensureApplication(int1, 'offered', 88);
const app2 = await ensureApplication(int2, 'shortlisted', 74);
console.log('applications ready:', app1, app2);

// ── offer for app1 ─────────────────────────────────────────────────────────
const offerEx = await client.query(`SELECT id FROM ip_offers WHERE internship_id=$1 AND candidate_id=$2 LIMIT 1`, [int1, candId]);
let offerId = offerEx.rows[0]?.id;
if (!offerId) {
  offerId = nid('ip_off');
  await client.query(`
    INSERT INTO ip_offers (id, internship_id, candidate_id, employer_id, role_title, stipend_inr, status, message)
    VALUES ($1,$2,$3,$4,'Frontend Developer Intern',15000,'pending',
      'Congratulations — Nova Labs would like to offer you this internship role.')`,
    [offerId, int1, candId, empId]);
}
console.log('offer ready:', offerId);

// ── message thread ─────────────────────────────────────────────────────────
const thrEx = await client.query(
  `SELECT id FROM ip_message_threads WHERE internship_id=$1 AND candidate_user_id=$2 AND employer_user_id=$3 LIMIT 1`,
  [int1, candUserId, empUserId]
);
let threadId = thrEx.rows[0]?.id;
if (!threadId) {
  threadId = nid('ip_thr');
  await client.query(`
    INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
    VALUES ($1,$2,$3,$4,'Frontend Developer Intern — Conversation')`,
    [threadId, int1, candUserId, empUserId]);
}
const msgCount = await client.query(`SELECT count(*)::int AS n FROM ip_messages WHERE thread_id=$1`, [threadId]);
if (Number(msgCount.rows[0]?.n) === 0) {
  await client.query(`INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
    [nid('ip_msg'), threadId, empUserId, 'Hi Priya — thanks for applying! We reviewed your profile and would love to chat.']);
  await client.query(`INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
    [nid('ip_msg'), threadId, candUserId, 'Thank you! I am really excited about Nova Labs. Happy to schedule a call anytime.']);
}
console.log('thread ready:', threadId);

// ── notifications for employer ─────────────────────────────────────────────
const notifCount = await client.query(`SELECT count(*)::int AS n FROM ip_notifications WHERE user_id=$1`, [empUserId]);
if (Number(notifCount.rows[0]?.n) === 0) {
  await client.query(`INSERT INTO ip_notifications (id, user_id, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
    [nid('ip_ntf'), empUserId, 'New applicant', 'Priya Sharma applied to Frontend Developer Intern.', '/employer/internships']);
  await client.query(`INSERT INTO ip_notifications (id, user_id, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
    [nid('ip_ntf'), empUserId, 'Offer accepted', 'Your offer to Priya Sharma is awaiting response.', '/employer/offers']);
}
console.log('notifications ready');

// ── also add a notification for the candidate ──────────────────────────────
const candNotifCount = await client.query(`SELECT count(*)::int AS n FROM ip_notifications WHERE user_id=$1`, [candUserId]);
if (Number(candNotifCount.rows[0]?.n) === 0) {
  await client.query(`INSERT INTO ip_notifications (id, user_id, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
    [nid('ip_ntf'), candUserId, 'You have an offer!', 'Nova Labs has sent you an internship offer.', '/candidate/offers']);
  await client.query(`INSERT INTO ip_notifications (id, user_id, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
    [nid('ip_ntf'), candUserId, 'Application shortlisted', 'You have been shortlisted for Backend API Intern.', '/candidate/applications']);
}

// ── docs for employer (ensure) ─────────────────────────────────────────────
async function ensureDoc(docType, status) {
  const ex = await client.query(`SELECT id FROM ip_employer_documents WHERE employer_id=$1 AND doc_type=$2 LIMIT 1`, [empId, docType]);
  if (ex.rows[0]) return;
  await client.query(`
    INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url, review_status, reviewed_at)
    VALUES ($1,$2,$3,$4,$5,$6,now())`,
    [nid('ip_edoc'), empId, docType, `${docType.replace(/\s/g,'_')}.pdf`, '/sample-docs/sample-shop-act.pdf', status]);
}
await ensureDoc('Shop Act', 'approved');
await ensureDoc('Business PAN', 'approved');
await ensureDoc('Other', 'pending');
console.log('docs ready');

await client.end();

console.log('\n✓ Done. Both accounts fully seeded:');
console.log('  Employer  :', EMP_EMAIL, '/ Admin@123');
console.log('  Candidate :', CAND_EMAIL, '/ Admin@123');
console.log('  → Postings: 3 published + 1 draft');
console.log('  → Applications: offered + shortlisted');
console.log('  → Offer: pending');
console.log('  → Messages: 1 thread with 2 messages');
console.log('  → Notifications: seeded for both');
console.log('  → Docs: Shop Act, Business PAN (approved), Other (pending)');
