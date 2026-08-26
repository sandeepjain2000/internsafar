#!/usr/bin/env node
/**
 * InternSafar database integrity checker (read-only).
 *
 *   npm run db:check-integrity
 *
 * Covers offer→application, pipeline FKs (023–026), uniques/CHECKs (027–028),
 * offer-accept application status (029),
 * hired/completed engagement for ratings and endorsements,
 * the Browse empty trap (many published but almost none candidate-visible),
 * and applications pointing at inaccessible / missing internships.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`InternSafar DB integrity (read-only)

  npm run db:check-integrity
  node scripts/check-ip-db-integrity.mjs

Needs DATABASE_URL or SUPABASE_DATABASE_URL in .env.local.
Does not print the connection string.
`);
  process.exit(0);
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
    max: 1,
  };
}

async function main() {
  const dbUrl = loadDbUrl();
  if (!dbUrl) {
    console.error('DATABASE_URL (or SUPABASE_DATABASE_URL) is required.');
    process.exit(1);
  }

  const pool = new pg.Pool(parseUrl(dbUrl));
  const one = async (sql) => {
    try {
      const r = await pool.query(sql);
      return Number(r.rows[0]?.n || 0);
    } catch (e) {
      if (e.code === '42P01' || e.code === '42703') return -1;
      throw e;
    }
  };
  const hasConstraint = async (name) => {
    const r = await pool.query(`SELECT 1 FROM pg_constraint WHERE conname = $1 LIMIT 1`, [name]);
    return r.rowCount > 0;
  };

  try {
    const report = {
      ok: true,
      offer_fk_present: await hasConstraint('ip_offers_application_id_fkey'),
      thread_application_fk_present: await hasConstraint('ip_message_threads_application_id_fkey'),
      endorsement_candidate_not_null: false,
      offers_missing_application_id: 0,
      offers_orphan_application: 0,
      offers_candidate_or_internship_mismatch: 0,
      applications_missing_candidate: 0,
      applications_missing_internship: 0,
      messages_missing_thread: 0,
      endorsements_null_candidate: 0,
      threads_orphan_application_id: 0,
      generated_run_dangling: 0,
      rejection_template_dangling: 0,
      promo_reviewed_by_dangling: 0,
      viral_reviewed_by_dangling: 0,
      request_created_user_dangling: 0,
      request_reviewer_dangling: 0,
      bulk_message_id_dangling: 0,
      ratings_without_hired_or_completed: 0,
      endorsements_without_hired_or_completed: 0,
      offer_application_unique_present: false,
      ratings_from_to_internship_unique_present: false,
      applications_status_check_present: false,
      duplicate_offers_per_application: 0,
      duplicate_ratings_from_to_internship: 0,
      applications_unknown_status: 0,
      endorsement_unique_present: false,
      referred_by_fk_present: false,
      pref_category_check_present: false,
      pending_referral_unique_index: false,
      duplicate_endorsements: 0,
      referred_by_orphans: 0,
      accepted_offer_app_not_hired: 0,
      declined_offer_app_mismatch: 0,
    };

    const endNull = await pool.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'ip_endorsements' AND column_name = 'candidate_id'`,
    );
    report.endorsement_candidate_not_null = String(endNull.rows[0]?.is_nullable || '').toUpperCase() === 'NO';
    const endEmp = await pool.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'ip_endorsements' AND column_name = 'employer_id'`,
    );
    report.endorsement_employer_not_null = String(endEmp.rows[0]?.is_nullable || '').toUpperCase() === 'NO';
    const rateIntern = await pool.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'ip_ratings' AND column_name = 'internship_id'`,
    );
    report.rating_internship_not_null = String(rateIntern.rows[0]?.is_nullable || '').toUpperCase() === 'NO';

    report.offers_missing_application_id = await one(
      `SELECT count(*)::int AS n FROM ip_offers WHERE application_id IS NULL`,
    );
    report.offers_orphan_application = await one(`
      SELECT count(*)::int AS n FROM ip_offers o
      LEFT JOIN ip_applications a ON a.id = o.application_id
      WHERE a.id IS NULL`);
    report.offers_candidate_or_internship_mismatch = await one(`
      SELECT count(*)::int AS n FROM ip_offers o
      JOIN ip_applications a ON a.id = o.application_id
      WHERE o.candidate_id IS DISTINCT FROM a.candidate_id
         OR o.internship_id IS DISTINCT FROM a.internship_id`);
    report.applications_missing_candidate = await one(`
      SELECT count(*)::int AS n FROM ip_applications a
      LEFT JOIN ip_candidates c ON c.id = a.candidate_id WHERE c.id IS NULL`);
    report.applications_missing_internship = await one(`
      SELECT count(*)::int AS n FROM ip_applications a
      LEFT JOIN ip_internships i ON i.id = a.internship_id WHERE i.id IS NULL`);
    report.messages_missing_thread = await one(`
      SELECT count(*)::int AS n FROM ip_messages m
      LEFT JOIN ip_message_threads t ON t.id = m.thread_id WHERE t.id IS NULL`);
    report.endorsements_null_candidate = await one(
      `SELECT count(*)::int AS n FROM ip_endorsements WHERE candidate_id IS NULL`,
    );
    report.ratings_null_internship = await one(
      `SELECT count(*)::int AS n FROM ip_ratings WHERE internship_id IS NULL`,
    );
    report.threads_orphan_application_id = await one(`
      SELECT count(*)::int AS n FROM ip_message_threads t
      WHERE t.application_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_applications a WHERE a.id = t.application_id)`);
    report.generated_run_dangling = await one(`
      SELECT count(*)::int AS n FROM ip_users u
      WHERE u.generated_run_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_generated_runs g WHERE g.run_id = u.generated_run_id)`);
    report.rejection_template_dangling = await one(`
      SELECT count(*)::int AS n FROM ip_applications a
      WHERE a.rejection_template_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_rejection_templates t WHERE t.id = a.rejection_template_id)`);
    report.promo_reviewed_by_dangling = await one(`
      SELECT count(*)::int AS n FROM ip_linkedin_promotions p
      WHERE p.reviewed_by IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = p.reviewed_by)`);
    report.viral_reviewed_by_dangling = await one(`
      SELECT count(*)::int AS n FROM ip_viral_shares v
      WHERE v.reviewed_by IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = v.reviewed_by)`);
    report.request_created_user_dangling = await one(`
      SELECT count(*)::int AS n FROM ip_employer_requests r
      WHERE r.created_user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = r.created_user_id)`);
    report.request_reviewer_dangling = await one(`
      SELECT count(*)::int AS n FROM ip_employer_requests r
      WHERE r.reviewer_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = r.reviewer_id)`);
    report.bulk_message_id_dangling = await one(`
      SELECT count(*)::int AS n FROM ip_bulk_message_recipients r
      WHERE r.message_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_messages m WHERE m.id = r.message_id)`);

    report.ratings_without_hired_or_completed = await one(`
      SELECT count(*)::int AS n FROM ip_ratings r
      WHERE r.internship_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ip_applications a
          JOIN ip_internships i ON i.id = a.internship_id
          JOIN ip_candidates c ON c.id = a.candidate_id
          JOIN ip_employers e ON e.id = i.employer_id
          WHERE a.internship_id = r.internship_id
            AND a.status IN ('hired', 'completed')
            AND (
              (c.user_id = r.from_user_id AND e.user_id = r.to_user_id)
              OR (e.user_id = r.from_user_id AND c.user_id = r.to_user_id)
            )
        )`);
    report.offer_application_unique_present = await hasConstraint('ip_offers_application_id_key');
    report.ratings_from_to_internship_unique_present = await hasConstraint(
      'ip_ratings_from_to_internship_key',
    );
    report.applications_status_check_present = await hasConstraint('ip_applications_status_check');
    report.duplicate_offers_per_application = await one(`
      SELECT coalesce(sum(n),0)::int AS n FROM (
        SELECT count(*)::int AS n FROM ip_offers GROUP BY application_id HAVING count(*) > 1
      ) t`);
    report.duplicate_ratings_from_to_internship = await one(`
      SELECT coalesce(sum(n),0)::int AS n FROM (
        SELECT count(*)::int AS n FROM ip_ratings
        GROUP BY from_user_id, to_user_id, internship_id HAVING count(*) > 1
      ) t`);
    report.applications_unknown_status = await one(`
      SELECT count(*)::int AS n FROM ip_applications
      WHERE status NOT IN (
        'applied','shortlisted','interviewing','rejected','hired','offered','completed','declined_offer','withdrawn'
      )`);
    report.endorsement_unique_present = await hasConstraint(
      'ip_endorsements_employer_candidate_internship_key',
    );
    report.referred_by_fk_present = await hasConstraint('ip_users_referred_by_fkey');
    report.pref_category_check_present = await hasConstraint('ip_notification_preferences_category_check');
    const idx = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'ip_referrals_pending_pair_uidx' LIMIT 1`,
    );
    report.pending_referral_unique_index = idx.rowCount > 0;
    report.duplicate_endorsements = await one(`
      SELECT coalesce(sum(n),0)::int AS n FROM (
        SELECT count(*)::int AS n FROM ip_endorsements
        GROUP BY employer_id, candidate_id, internship_id HAVING count(*) > 1
      ) t`);
    report.referred_by_orphans = await one(`
      SELECT count(*)::int AS n FROM ip_users u
      WHERE u.referred_by IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ip_users r WHERE r.id = u.referred_by)`);
    report.accepted_offer_app_not_hired = await one(`
      SELECT count(*)::int AS n FROM ip_offers o
      JOIN ip_applications a ON a.id = o.application_id
      WHERE o.status = 'accepted' AND a.status NOT IN ('hired', 'completed')`);
    report.declined_offer_app_mismatch = await one(`
      SELECT count(*)::int AS n FROM ip_offers o
      JOIN ip_applications a ON a.id = o.application_id
      WHERE o.status = 'declined' AND a.status NOT IN ('declined_offer', 'rejected', 'applied', 'shortlisted', 'interviewing')`);
    report.endorsements_without_hired_or_completed = await one(`
      SELECT count(*)::int AS n FROM ip_endorsements en
      WHERE en.internship_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ip_applications a
          JOIN ip_internships i ON i.id = a.internship_id
          WHERE a.internship_id = en.internship_id
            AND a.candidate_id = en.candidate_id
            AND i.employer_id = en.employer_id
            AND a.status IN ('hired', 'completed')
        )`);
    // Browse trap: published but outside live window (scheduled / expired apply window).
    report.published_total = await one(`SELECT count(*)::int AS n FROM ip_internships WHERE status = 'published'`);
    report.published_candidate_visible = await one(`
      SELECT count(*)::int AS n FROM ip_internships i
      WHERE i.status = 'published'
        AND (i.starts_at IS NULL OR i.starts_at <= now())
        AND (i.apply_ends_at IS NULL OR i.apply_ends_at > now())`);
    report.published_not_candidate_visible = Math.max(
      0,
      report.published_total - report.published_candidate_visible,
    );
    // Fail only when Browse would look empty despite many published rows.
    report.browse_empty_despite_published =
      report.published_total >= 10 && report.published_candidate_visible < 2 ? 1 : 0;

    // Applications must not point at non-live / missing postings (My Applications → Open internship).
    report.apps_pointing_to_inaccessible_internship = await one(`
      SELECT count(*)::int AS n
      FROM ip_applications a
      LEFT JOIN ip_internships i ON i.id = a.internship_id
      WHERE i.id IS NULL
         OR i.status <> 'published'
         OR (i.starts_at IS NOT NULL AND i.starts_at > now())
         OR (i.apply_ends_at IS NOT NULL AND i.apply_ends_at <= now())`);

    // Informational: structured JD sections (About bullets + requirements/ideal in eligibility).
    report.postings_missing_requirements_text = await one(`
      SELECT count(*)::int AS n FROM ip_internships i
      WHERE i.status = 'published'
        AND (
          i.eligibility IS NULL
          OR COALESCE(i.eligibility->>'requirements_text','') = ''
        )`);
    report.candidates_with_structured_experience = await one(`
      SELECT count(*)::int AS n FROM ip_candidates
      WHERE prior_experience IS NOT NULL
        AND btrim(prior_experience) LIKE '[%'`);

    const numericFails = Object.entries(report)
      .filter(([k, v]) => {
        if (k === 'ok') return false;
        if (
          k === 'published_total'
          || k === 'published_candidate_visible'
          || k === 'published_not_candidate_visible'
          || k === 'postings_missing_requirements_text'
          || k === 'candidates_with_structured_experience'
        ) {
          return false; // informational
        }
        return typeof v === 'number' && v > 0;
      })
      .map(([k]) => k);

    const bad =
      !report.offer_fk_present ||
      !report.thread_application_fk_present ||
      !report.endorsement_candidate_not_null ||
      !report.endorsement_employer_not_null ||
      !report.rating_internship_not_null ||
      !report.offer_application_unique_present ||
      !report.ratings_from_to_internship_unique_present ||
      !report.applications_status_check_present ||
      !report.endorsement_unique_present ||
      !report.referred_by_fk_present ||
      !report.pref_category_check_present ||
      !report.pending_referral_unique_index ||
      numericFails.length > 0;

    report.ok = !bad;
    if (numericFails.length) report.failing_counts = numericFails;
    console.log(JSON.stringify(report, null, 2));
    if (bad) process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
