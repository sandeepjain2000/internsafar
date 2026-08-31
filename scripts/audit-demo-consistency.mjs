#!/usr/bin/env node
/**
 * Cross-field consistency gate for seeded / QA-created data.
 *
 * `audit-demo-text` asks "does this value look machine-generated". This asks the
 * harder question: "do these values still agree with each other". Renaming a
 * posting title or a company leaves denormalised copy (offer role_title, thread
 * subject, description text) quoting something that no longer exists, and a
 * running dev server can silently change roles underneath a data migration.
 *
 *   npm run audit:demo-consistency
 *
 * Exits non-zero on any failure so it can gate a seeding or QA run.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import pg from 'pg';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });
const cfg = require('./lib/ipCoreSampleConfig.js');

const JSON_OUT = process.argv.includes('--json');
const DOC_TYPES = ['Shop Act', 'LLP registration', 'Business PAN', 'Other'];

const u = new URL(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL);
const pool = new pg.Pool({
  host: u.hostname, port: parseInt(u.port, 10) || 5432,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''), ssl: { rejectUnauthorized: false }, max: 1,
});
const rows = async (sql, p = []) => (await pool.query(sql, p)).rows;

/** Route paths that exist as page files, so notification links can be verified. */
function collectRoutes(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (/^page\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(base || '/');
      continue;
    }
    if (entry.name.startsWith('(') || entry.name === 'api') continue;
    out.push(...collectRoutes(path.join(dir, entry.name), `${base}/${entry.name}`));
  }
  return out;
}

/** Notification links must land on a route that exists on disk. */
async function deadNotificationLinks() {
  const routes = collectRoutes(path.join(appRoot, 'src', 'app'));
  const exact = new Set(routes);
  const dynamic = routes
    .filter((r) => r.includes('['))
    .map((r) => new RegExp(`^${r.replace(/\[[^\]]+\]/g, '[^/]+')}$`));
  const links = await rows(
    `SELECT DISTINCT split_part(split_part(link, '?', 1), '#', 1) AS link
     FROM ip_notifications WHERE link IS NOT NULL AND link <> ''`);
  return links
    .map((r) => r.link.replace(/\/$/, '') || '/')
    .filter((l) => l.startsWith('/'))
    .filter((l) => !exact.has(l) && !dynamic.some((re) => re.test(l)));
}

/** Each check must return 0 rows. */
const CHECKS = [
  // Identity — a stale runtime constant can promote the wrong account.
  ['more than one SuperAdmin account',
   `SELECT count(*)::int n FROM ip_users WHERE role = 'superadmin'`, [], 1],
  ['SuperAdmin is not the configured address',
   `SELECT count(*)::int n FROM ip_users WHERE role = 'superadmin' AND lower(email) <> lower($1)`,
   [cfg.SUPERADMIN_EMAIL]],
  ['an account owns an employer profile but has the superadmin role',
   `SELECT count(*)::int n FROM ip_users u WHERE u.role = 'superadmin'
      AND EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id)`],
  ['core employer is not role employer',
   `SELECT count(*)::int n FROM ip_users WHERE lower(email) = lower($1) AND role <> 'employer'`,
   [cfg.EMP_BASE]],
  ['login event identity differs from the account it points at',
   `SELECT count(*)::int n FROM ip_login_events l JOIN ip_users x ON x.id = l.user_id
    WHERE l.role IS DISTINCT FROM x.role OR lower(l.email) <> lower(x.email)`],
  // Denormalised snapshots vs the live posting.
  ['offer role_title differs from its posting title',
   `SELECT count(*)::int n FROM ip_offers o JOIN ip_internships i ON i.id = o.internship_id
    WHERE o.role_title IS DISTINCT FROM i.title`],
  ['offer copy quotes a role other than its own',
   `SELECT count(*)::int n FROM ip_offers
    WHERE message ~ 'offer for ' AND role_title IS NOT NULL AND position(role_title in message) = 0`],
  ['thread subject does not match its posting',
   `SELECT count(*)::int n FROM ip_message_threads t JOIN ip_internships i ON i.id = t.internship_id
    WHERE t.subject IS NULL OR position(i.title in t.subject) = 0`],
  ['posting description names a city other than its location',
   `SELECT count(*)::int n FROM ip_internships
    WHERE description ~ ' in [A-Z][a-zA-Z ]+ on live ' AND location IS NOT NULL AND location <> ''
      AND position(location in description) = 0`],
  ['posting description names a different company',
   `SELECT count(*)::int n FROM ip_internships i JOIN ip_employers e ON e.id = i.employer_id
    WHERE i.description ~ ' at [A-Z]' AND position(e.company_name in i.description) = 0`],
  ['internship title does not read as an internship',
   `SELECT count(*)::int n FROM ip_internships WHERE title NOT ILIKE '%intern%'`],
  // Academic history (migration 035). The academics PUT handler mirrors the first row
  // into the flat ip_candidates columns, so the two must always agree — otherwise the
  // profile summary contradicts the education list right below it.
  ['primary academic row disagrees with the profile summary',
   `SELECT count(*)::int n FROM ip_candidate_academics a
    JOIN ip_candidates c ON c.id = a.candidate_id
    WHERE a.sort_order = 0
      AND (coalesce(a.college, '') <> coalesce(c.college, '')
        OR coalesce(a.degree, '') <> coalesce(c.degree, ''))`],
  ['earlier qualification finishes later than the current one',
   `SELECT count(*)::int n FROM ip_candidate_academics a0
    JOIN ip_candidate_academics a1
      ON a1.candidate_id = a0.candidate_id AND a1.sort_order > a0.sort_order
    WHERE a1.graduation_year > a0.graduation_year`],
  // Two accounts under one company name make distinct postings read as the same
  // internship listed twice — see migrations 032–034.
  ['employer accounts sharing a company name',
   `SELECT coalesce(sum(c - 1), 0)::int n FROM (
      SELECT count(*) AS c FROM ip_employers GROUP BY lower(btrim(company_name))) q`],
  ['company name differs from another only by a branch suffix',
   `SELECT count(*)::int n FROM ip_employers e
    WHERE e.company_name ~ '( · | — )'
      AND EXISTS (SELECT 1 FROM ip_employers o
                  WHERE o.id <> e.id
                    AND lower(btrim(o.company_name))
                        = lower(btrim(split_part(regexp_replace(e.company_name, ' — ', ' · '), ' · ', 1))))`],
  ['approval request names a company that already has an account',
   `SELECT count(*)::int n FROM ip_employer_requests r
    WHERE EXISTS (SELECT 1 FROM ip_employers e
                  WHERE lower(btrim(e.company_name)) = lower(btrim(r.company_name)))`],
  ['posting title names a different live company',
   `SELECT count(*)::int n FROM ip_internships i
    JOIN ip_employers own ON own.id = i.employer_id
    WHERE EXISTS (
      SELECT 1 FROM ip_employers other
       WHERE other.id <> own.id AND length(btrim(other.company_name)) > 3
         AND position(btrim(other.company_name) in i.title) > 0
         AND position(btrim(other.company_name) in btrim(own.company_name)) = 0)`],
  ['notification company label names no existing employer',
   `SELECT count(*)::int n FROM ip_notifications x
    WHERE x.meta ? 'company'
      AND NOT EXISTS (SELECT 1 FROM ip_employers e
                      WHERE btrim(e.company_name) = btrim(x.meta->>'company'))`],
  // Timelines that the product cannot produce.
  ['offer valid_until precedes created_at',
   `SELECT count(*)::int n FROM ip_offers WHERE valid_until IS NOT NULL AND valid_until < created_at::date`],
  ['offer responded_at precedes created_at',
   `SELECT count(*)::int n FROM ip_offers WHERE responded_at IS NOT NULL AND responded_at < created_at`],
  ['offer created before the application it answers',
   `SELECT count(*)::int n FROM ip_offers o JOIN ip_applications a ON a.id = o.application_id
    WHERE o.created_at < a.created_at`],
  ['offer created before its posting existed',
   `SELECT count(*)::int n FROM ip_offers o JOIN ip_internships i ON i.id = o.internship_id
    WHERE o.created_at < i.created_at`],
  ['offer answered after it had already expired',
   `SELECT count(*)::int n FROM ip_offers
    WHERE responded_at IS NOT NULL AND valid_until IS NOT NULL AND responded_at::date > valid_until`],
  ['expired offer whose validity window has not closed',
   `SELECT count(*)::int n FROM ip_offers
    WHERE status = 'expired' AND (valid_until IS NULL OR valid_until >= current_date)`],
  ['application created before its posting existed',
   `SELECT count(*)::int n FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
    WHERE a.created_at < i.created_at`],
  ['application completed before it was created',
   `SELECT count(*)::int n FROM ip_applications
    WHERE completed_at IS NOT NULL AND completed_at < created_at`],
  ['login event recorded before its account existed',
   `SELECT count(*)::int n FROM ip_login_events l JOIN ip_users x ON x.id = l.user_id
    WHERE l.created_at < x.created_at`],
  // Authority — review actions belong to staff only.
  ['employer request reviewed by a non-SuperAdmin',
   `SELECT count(*)::int n FROM ip_employer_requests r JOIN ip_users x ON x.id = r.reviewer_id
    WHERE x.role <> 'superadmin'`],
  ['viral share reviewed by a non-SuperAdmin',
   `SELECT count(*)::int n FROM ip_viral_shares v JOIN ip_users x ON x.id = v.reviewed_by
    WHERE x.role <> 'superadmin'`],
  ['linkedin promotion reviewed by a non-SuperAdmin',
   `SELECT count(*)::int n FROM ip_linkedin_promotions p JOIN ip_users x ON x.id = p.reviewed_by
    WHERE x.role <> 'superadmin'`],
  // Ownership — a row must belong to the same parties as its parent.
  ['offer employer differs from the posting employer',
   `SELECT count(*)::int n FROM ip_offers o JOIN ip_internships i ON i.id = o.internship_id
    WHERE o.employer_id IS NOT NULL AND i.employer_id IS NOT NULL AND o.employer_id <> i.employer_id`],
  ['offer attached to a different posting than its application',
   `SELECT count(*)::int n FROM ip_offers o JOIN ip_applications a ON a.id = o.application_id
    WHERE o.internship_id IS DISTINCT FROM a.internship_id`],
  ['thread candidate slot holding a non-candidate',
   `SELECT count(*)::int n FROM ip_message_threads t JOIN ip_users x ON x.id = t.candidate_user_id
    WHERE x.role <> 'candidate'`],
  ['thread employer slot holding a non-employer',
   `SELECT count(*)::int n FROM ip_message_threads t JOIN ip_users x ON x.id = t.employer_user_id
    WHERE x.role <> 'employer'`],
  ['same posting title twice under one employer',
   `SELECT count(*)::int n FROM (
      SELECT employer_id, title FROM ip_internships GROUP BY 1,2 HAVING count(*) > 1) d`],
  ['description placing a role "in Remote" as if it were a city',
   `SELECT count(*)::int n FROM ip_internships WHERE description LIKE '% in Remote on live %'`],
  ['completed application missing completed_at or note',
   `SELECT count(*)::int n FROM ip_applications WHERE status = 'completed'
      AND (completed_at IS NULL OR completion_notes IS NULL OR completion_notes = '')`],
  // Routing and approval states.
  ['candidate notification links into a staff area',
   `SELECT count(*)::int n FROM ip_notifications n JOIN ip_users x ON x.id = n.user_id
    WHERE x.role = 'candidate' AND (n.link LIKE '/employer%' OR n.link LIKE '/superadmin%')`],
  ['document type outside the four the profile offers',
   `SELECT count(*)::int n FROM ip_employer_documents WHERE doc_type <> ALL($1::text[])`, [DOC_TYPES]],
  ['rejected employer without a reason',
   `SELECT count(*)::int n FROM ip_employers
    WHERE approval_status = 'rejected' AND (rejection_reason IS NULL OR rejection_reason = '')`],
  ['approved employer still carrying a rejection reason',
   `SELECT count(*)::int n FROM ip_employers WHERE approval_status = 'approved' AND rejection_reason IS NOT NULL`],
  ['suspended employer whose login was deactivated',
   `SELECT count(*)::int n FROM ip_users u JOIN ip_employers e ON e.user_id = u.id
    WHERE e.approval_status = 'suspended' AND u.active = false`],
  ['approved employer request without a linked account',
   `SELECT count(*)::int n FROM ip_employer_requests r
    LEFT JOIN ip_users x ON x.id = r.created_user_id
    WHERE r.status = 'approved' AND (x.id IS NULL OR x.role <> 'employer')`],
  ['employer account without an employer profile',
   `SELECT count(*)::int n FROM ip_users u WHERE u.role = 'employer'
      AND NOT EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id)`],
  ['candidate account without a candidate profile',
   `SELECT count(*)::int n FROM ip_users u WHERE u.role = 'candidate'
      AND NOT EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id)`],
  ['legacy fanned-out applicant preset key',
   `SELECT count(*)::int n FROM ip_saved_applicant_views WHERE table_key = 'employer.applicants'`],
];

try {
  const report = {};
  const failing = [];
  for (const [label, sql, params, expected = 0] of CHECKS) {
    try {
      const [r] = await rows(sql, params || []);
      const value = Number(r.n);
      report[label] = value;
      if (value !== expected) failing.push({ check: label, got: value, expected });
    } catch (e) {
      report[label] = `ERROR: ${e.message}`;
      failing.push({ check: label, error: e.message });
    }
  }
  const label = 'notification link with no matching route';
  try {
    const dead = await deadNotificationLinks();
    report[label] = dead.length;
    if (dead.length) failing.push({ check: label, got: dead.length, expected: 0, links: dead });
  } catch (e) {
    report[label] = `ERROR: ${e.message}`;
    failing.push({ check: label, error: e.message });
  }

  const total = CHECKS.length + 1;
  const out = { ok: failing.length === 0, checks: total, failing, report };
  if (JSON_OUT || !out.ok) console.log(JSON.stringify(out, null, 2));
  else console.log(`OK: all ${total} demo-consistency checks passed.`);
  if (!out.ok) process.exitCode = 1;
} finally {
  await pool.end();
}
