#!/usr/bin/env node
/**
 * Demo-text quality gate.
 *
 * Sweeps every text column of every ip_* table looking for machine-generated
 * text in fields a human reads. Seeded and QA-created rows are shown to real
 * reviewers, so a name like `Coverage role 3`, `Gen Co 0`, `QA idea 1786356065134`
 * or `mt140t02xc0e` is a bug, not cosmetic.
 *
 * Two classes are reported:
 *   jumble       a random id leaked into prose (`lhljn7g6`, `mt140t02xc0e`) or a
 *                bare number >= 11 digits (an epoch)
 *   scaffolding  wording only a generator writes — a harness word combined with
 *                an entity noun or an index ("QA employer", "Coverage view",
 *                "Gen Co 0", "QA Published Internship")
 *
 * IMPORTANT — this gate must not be greedy. "QA", "Gen", "coverage", "fixture"
 * and "sample" are ordinary product vocabulary: "QA Automation Intern" and
 * "Gen AI Intern" are real job titles, tests really do have coverage, and
 * hardware really has fixtures. None of those words is flagged on its own; only
 * the machine-written *shape* is. See scripts/test-demo-text-classifier.mjs,
 * which asserts both directions and fails if this gate starts over-reaching.
 *
 * Identifier-like columns are skipped, because a random value there is correct.
 *
 *   npm run audit:demo-text
 *
 * Exits non-zero when anything is found, so it can gate a seeding run.
 * Fix by adding wording to scripts/lib/ipDemoText.js — never by hard-coding a
 * placeholder in a creation or generation script.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import pg from 'pg';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

const JSON_OUT = process.argv.includes('--json');

/** Columns whose values are ids, hashes, URLs, codes, or free-form telemetry. */
const SKIP_EXACT = new Set([
  'id', 'password_hash', 'url', 'file_url', 'avatar_url', 'website', 'link',
  'email', 'work_email', 'contact_email', 'hr_contact_email', 'user_agent',
  'ip_address', 'referral_code', 'code', 'token', 'session_token', 'run_id',
  'generated_run_id', 'table_key', 'slug', 'cv_url', 'logo_url', 'doc_url',
  'meta', 'filters', 'sort', 'payload', 'questions', 'answers', 'eligibility',
  'google_sub', 'provider_id', 'external_id', 'otp', 'otp_hash', 'reset_token',
  'new_email', 'old_email', 'phone', 'contact_phone', 'new_phone', 'old_phone',
  // Enum-ish and reference columns: short lowercase words trip the token test.
  'status', 'role', 'category', 'work_mode', 'state', 'state_ut', 'city',
  // Reviewer/actor columns hold a user id despite not ending in _id.
  'reviewed_by', 'created_by', 'updated_by', 'actor', 'approved_by',
]);
const SKIP_SUFFIX = ['_id', '_url', '_token', '_hash', '_json', '_code', '_at', '_ids', '_status', '_by'];

const { classifyDemoText, classifyEntityName } = require('./lib/ipDemoTextQuality.js');

/**
 * Columns that get the stricter classifier, which also rejects a workflow status baked
 * into the name ("Quill Content (Pending)").
 *
 * Listed as table.column rather than by column name, because the strict rule is aimed at
 * company and posting identity that the seeders own. Applied by bare column name it also
 * policed user-typed values — a recruiter naming a shortlist "Shortlist - Pending" or a
 * saved view "Q1 shortlist (draft)" would fail the gate for wording they are entitled to
 * use. Those columns still get the standard classifier.
 */
const STRICT_NAME_COLUMNS = new Set([
  'ip_employers.company_name',
  'ip_employer_requests.company_name',
  'ip_internships.title',
  'ip_offers.role_title',
]);

const u = new URL(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL);
const pool = new pg.Pool({
  host: u.hostname,
  port: parseInt(u.port, 10) || 5432,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
  max: 1,
});
const rows = async (sql, p = []) => (await pool.query(sql, p)).rows;

try {
  const cols = await rows(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name LIKE 'ip\\_%'
       AND data_type IN ('text', 'character varying', 'character')
     ORDER BY table_name, column_name`,
  );

  const findings = [];
  let scanned = 0;
  for (const { table_name: t, column_name: c } of cols) {
    if (SKIP_EXACT.has(c) || SKIP_SUFFIX.some((s) => c.endsWith(s))) continue;
    scanned += 1;
    let vals;
    try {
      vals = await rows(
        `SELECT ${c} AS v, count(*)::int n FROM ${t}
         WHERE ${c} IS NOT NULL AND ${c} <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 4000`,
      );
    } catch (e) {
      findings.push({ table: t, column: c, error: e.message });
      continue;
    }
    const classify = STRICT_NAME_COLUMNS.has(`${t}.${c}`) ? classifyEntityName : classifyDemoText;
    const buckets = { jumble: [], scaffolding: [], 'status-in-name': [] };
    for (const r of vals) {
      const kind = classify(r.v);
      if (kind) buckets[kind].push(r);
    }
    for (const kind of ['jumble', 'scaffolding', 'status-in-name']) {
      if (!buckets[kind].length) continue;
      findings.push({
        table: t,
        column: c,
        kind,
        rows: buckets[kind].reduce((a, r) => a + r.n, 0),
        distinct: buckets[kind].length,
        samples: buckets[kind].slice(0, 4).map((r) => (r.v.length > 80 ? `${r.v.slice(0, 80)}…` : r.v)),
      });
    }
  }
  findings.sort((a, b) => (b.rows || 0) - (a.rows || 0));

  const report = {
    ok: findings.length === 0,
    columnsScanned: scanned,
    problems: findings.length,
    totalRows: findings.reduce((a, f) => a + (f.rows || 0), 0),
    findings,
  };
  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(`OK: demo text clean across ${scanned} human-visible columns.`);
  } else {
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nFAIL: ${report.problems} column(s), ${report.totalRows} row(s) contain machine text.`);
    console.log('Fix by adding wording to scripts/lib/ipDemoText.js and re-seeding those rows.');
  }
  if (!report.ok) process.exitCode = 1;
} finally {
  await pool.end();
}
