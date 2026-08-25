import { query } from '@/lib/db';
import { ensureIpIntegrityConstraints } from '@/lib/ensureIpIntegrityConstraints';

let schemaReady = false;

/** Idempotent workbench columns + recruiter tables (safe on every boot/request). */
export async function ensureIpWorkbenchSchema() {
  if (schemaReady) return;

  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS apply_ends_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS closed_reason TEXT`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb`);

  await query(`ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS questions_snapshot JSONB`);
  await query(`ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS screening_disabled BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS screening_disable_reason JSONB`);
  await query(`ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS rejection_template_id TEXT`);
  await query(`ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS rejection_template_version INT`);

  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS generated_run_id TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_generated_runs (
      run_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_employer_lists (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (employer_id, name)
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_employer_list_members (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES ip_employer_lists(id) ON DELETE CASCADE,
      application_id TEXT NOT NULL REFERENCES ip_applications(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (list_id, application_id)
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_rejection_templates (
      id TEXT PRIMARY KEY,
      employer_id TEXT REFERENCES ip_employers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      is_system BOOLEAN NOT NULL DEFAULT false,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    INSERT INTO ip_rejection_templates (id, employer_id, name, body, is_system, version)
    SELECT 'ip_rej_tpl_system_default', NULL,
      'Default rejection',
      'Hi {{candidate_first_name}}, thank you for applying to {{internship_title}}. We will not be moving forward at this time. We wish you the best.',
      true, 1
    WHERE NOT EXISTS (SELECT 1 FROM ip_rejection_templates WHERE id = 'ip_rej_tpl_system_default')
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_saved_applicant_views (
      id TEXT PRIMARY KEY,
      employer_id TEXT REFERENCES ip_employers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`ALTER TABLE ip_saved_applicant_views ALTER COLUMN employer_id DROP NOT NULL`);
  await query(`ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES ip_users(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS table_key TEXT`);
  await query(`ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS sort TEXT`);
  await query(`ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE ip_saved_applicant_views DROP CONSTRAINT IF EXISTS ip_saved_applicant_views_employer_id_name_key`);
  await query(`
    UPDATE ip_saved_applicant_views sav
    SET user_id = e.user_id,
        table_key = COALESCE(NULLIF(sav.table_key, ''), 'employer.applicants')
    FROM ip_employers e
    WHERE e.id = sav.employer_id
      AND sav.user_id IS NULL
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ip_saved_views_user_table_name_uidx
      ON ip_saved_applicant_views (user_id, table_key, name)
      WHERE user_id IS NOT NULL AND table_key IS NOT NULL
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS ip_saved_views_user_table_idx
      ON ip_saved_applicant_views (user_id, table_key)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_application_notes (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES ip_applications(id) ON DELETE CASCADE,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      author_user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_application_events (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES ip_applications(id) ON DELETE CASCADE,
      actor_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_follow_up_reminders (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      application_id TEXT REFERENCES ip_applications(id) ON DELETE CASCADE,
      internship_id TEXT REFERENCES ip_internships(id) ON DELETE CASCADE,
      remind_at TIMESTAMPTZ NOT NULL,
      note TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_bulk_message_jobs (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
      body_template TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_bulk_message_recipients (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES ip_bulk_message_jobs(id) ON DELETE CASCADE,
      application_id TEXT NOT NULL REFERENCES ip_applications(id) ON DELETE CASCADE,
      candidate_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
      personalized_body TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_table_filter_prefs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      table_key TEXT NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, table_key)
    )`);
  await query(`ALTER TABLE ip_table_filter_prefs ADD COLUMN IF NOT EXISTS sort TEXT`);

  const presetsTable = await query(`SELECT to_regclass('public.ip_list_presets') AS t`);
  if (presetsTable.rows[0]?.t) {
    await query(`
      INSERT INTO ip_saved_applicant_views (id, employer_id, name, filters, created_at, updated_at, user_id, table_key, sort, is_default)
      SELECT p.id, NULL, p.name, p.filters, p.created_at, p.updated_at, p.user_id, p.table_key, p.sort, p.is_default
      FROM ip_list_presets p
      WHERE NOT EXISTS (SELECT 1 FROM ip_saved_applicant_views sav WHERE sav.id = p.id)
        AND NOT EXISTS (
          SELECT 1 FROM ip_saved_applicant_views sav
          WHERE sav.user_id = p.user_id AND sav.table_key = p.table_key AND sav.name = p.name
        )
    `);
  }
  await query(`
    INSERT INTO ip_saved_applicant_views (id, employer_id, name, filters, created_at, updated_at, user_id, table_key, sort, is_default)
    SELECT sav.id || '-' || i.id, sav.employer_id, sav.name, sav.filters, sav.created_at, sav.updated_at,
           sav.user_id, 'employer.applicants.' || i.id, sav.sort, sav.is_default
    FROM ip_saved_applicant_views sav
    JOIN ip_internships i ON i.employer_id = sav.employer_id
    WHERE sav.table_key = 'employer.applicants'
      AND sav.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ip_saved_applicant_views x
        WHERE x.user_id = sav.user_id AND x.table_key = 'employer.applicants.' || i.id AND x.name = sav.name
      )
      AND (
        SELECT count(*) FROM ip_saved_applicant_views x
        WHERE x.user_id = sav.user_id AND x.table_key = 'employer.applicants.' || i.id
      ) < 5
  `);
  await query(`DELETE FROM ip_saved_applicant_views WHERE table_key = 'employer.applicants'`);
  await query(`DROP TABLE IF EXISTS ip_list_presets`);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_export_jobs (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
      created_by_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      include_resumes BOOLEAN NOT NULL DEFAULT false,
      application_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      progress INT NOT NULL DEFAULT 0,
      total INT NOT NULL DEFAULT 0,
      error TEXT,
      result_csv TEXT,
      result_zip_base64 TEXT,
      result_filename TEXT,
      resume_count INT NOT NULL DEFAULT 0,
      skipped_resumes INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )`);

  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS remind_before_start BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS remind_before_end BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS remind_start_hours INT NOT NULL DEFAULT 24`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS remind_end_hours INT NOT NULL DEFAULT 24`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS remind_start_sent_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_internships ADD COLUMN IF NOT EXISTS remind_end_sent_at TIMESTAMPTZ`);

  await query(`ALTER TABLE ip_message_threads ADD COLUMN IF NOT EXISTS application_id TEXT`);
  await query(`
    UPDATE ip_message_threads t
    SET application_id = a.id
    FROM ip_candidates c
    JOIN ip_applications a ON a.candidate_id = c.id
    WHERE t.application_id IS NULL
      AND t.internship_id IS NOT NULL
      AND c.user_id = t.candidate_user_id
      AND a.internship_id = t.internship_id
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_message_threads_application_id_fkey') THEN
        ALTER TABLE ip_message_threads
          ADD CONSTRAINT ip_message_threads_application_id_fkey
          FOREIGN KEY (application_id) REFERENCES ip_applications(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_applications_rejection_template_id_fkey') THEN
        ALTER TABLE ip_applications
          ADD CONSTRAINT ip_applications_rejection_template_id_fkey
          FOREIGN KEY (rejection_template_id) REFERENCES ip_rejection_templates(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_generated_run_id_fkey') THEN
        ALTER TABLE ip_users
          ADD CONSTRAINT ip_users_generated_run_id_fkey
          FOREIGN KEY (generated_run_id) REFERENCES ip_generated_runs(run_id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_linkedin_promotions_reviewed_by_fkey') THEN
        ALTER TABLE ip_linkedin_promotions
          ADD CONSTRAINT ip_linkedin_promotions_reviewed_by_fkey
          FOREIGN KEY (reviewed_by) REFERENCES ip_users(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_viral_shares_reviewed_by_fkey') THEN
        ALTER TABLE ip_viral_shares
          ADD CONSTRAINT ip_viral_shares_reviewed_by_fkey
          FOREIGN KEY (reviewed_by) REFERENCES ip_users(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_requests_created_user_id_fkey') THEN
        ALTER TABLE ip_employer_requests
          ADD CONSTRAINT ip_employer_requests_created_user_id_fkey
          FOREIGN KEY (created_user_id) REFERENCES ip_users(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_requests_reviewer_id_fkey') THEN
        ALTER TABLE ip_employer_requests
          ADD CONSTRAINT ip_employer_requests_reviewer_id_fkey
          FOREIGN KEY (reviewer_id) REFERENCES ip_users(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_recipients_message_id_fkey') THEN
        ALTER TABLE ip_bulk_message_recipients
          ADD CONSTRAINT ip_bulk_message_recipients_message_id_fkey
          FOREIGN KEY (message_id) REFERENCES ip_messages(id) ON DELETE SET NULL;
      END IF;
    END $$
  `);

  await query(
    `ALTER TABLE ip_export_jobs ADD COLUMN IF NOT EXISTS skipped_application_ids JSONB NOT NULL DEFAULT '[]'::jsonb`,
  );
  await query(`ALTER TABLE ip_endorsements ALTER COLUMN candidate_id SET NOT NULL`);
  await ensureIpIntegrityConstraints();

  schemaReady = true;
}
