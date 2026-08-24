import { query } from '@/lib/db';

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
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (employer_id, name)
    )`);

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

  await query(`
    CREATE TABLE IF NOT EXISTS ip_list_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      table_key TEXT NOT NULL,
      name TEXT NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort TEXT,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, table_key, name)
    )`);
  await query(`
    CREATE INDEX IF NOT EXISTS ip_list_presets_user_table_idx
      ON ip_list_presets (user_id, table_key)
  `);
  await query(`
    INSERT INTO ip_list_presets (id, user_id, table_key, name, filters, sort, is_default, created_at, updated_at)
    SELECT sav.id, e.user_id, 'employer.applicants', sav.name, sav.filters, NULL, false, sav.created_at, sav.updated_at
    FROM ip_saved_applicant_views sav
    JOIN ip_employers e ON e.id = sav.employer_id
    WHERE NOT EXISTS (SELECT 1 FROM ip_list_presets p WHERE p.id = sav.id)
      AND NOT EXISTS (
        SELECT 1 FROM ip_list_presets p
        WHERE p.user_id = e.user_id AND p.table_key = 'employer.applicants' AND p.name = sav.name
      )
  `);

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

  schemaReady = true;
}
