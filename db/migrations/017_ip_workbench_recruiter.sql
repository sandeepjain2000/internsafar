-- InternSafar workbench: recruiter lists, templates, notes, timeline, reminders, saved views, bulk jobs

CREATE TABLE IF NOT EXISTS ip_employer_lists (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employer_id, name)
);

CREATE INDEX IF NOT EXISTS ip_employer_lists_employer_idx
  ON ip_employer_lists (employer_id);

CREATE TABLE IF NOT EXISTS ip_employer_list_members (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES ip_employer_lists(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES ip_applications(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, application_id)
);

CREATE INDEX IF NOT EXISTS ip_employer_list_members_app_idx
  ON ip_employer_list_members (application_id);

CREATE TABLE IF NOT EXISTS ip_rejection_templates (
  id TEXT PRIMARY KEY,
  employer_id TEXT REFERENCES ip_employers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_rejection_templates_employer_idx
  ON ip_rejection_templates (employer_id);

-- Seed default system template if missing
INSERT INTO ip_rejection_templates (id, employer_id, name, body, is_system, version)
SELECT 'ip_rej_tpl_system_default', NULL,
  'Default rejection',
  'Hi {{candidate_first_name}}, thank you for applying to {{internship_title}}. We will not be moving forward at this time. We wish you the best.',
  true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM ip_rejection_templates WHERE id = 'ip_rej_tpl_system_default'
);

CREATE TABLE IF NOT EXISTS ip_saved_applicant_views (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employer_id, name)
);

CREATE TABLE IF NOT EXISTS ip_application_notes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES ip_applications(id) ON DELETE CASCADE,
  employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_application_notes_app_idx
  ON ip_application_notes (application_id);

CREATE TABLE IF NOT EXISTS ip_application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES ip_applications(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_application_events_app_idx
  ON ip_application_events (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ip_follow_up_reminders (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES ip_applications(id) ON DELETE CASCADE,
  internship_id TEXT REFERENCES ip_internships(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_follow_up_reminders_employer_idx
  ON ip_follow_up_reminders (employer_id, remind_at)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS ip_bulk_message_jobs (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
  internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
  body_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
);

CREATE INDEX IF NOT EXISTS ip_bulk_message_recipients_job_idx
  ON ip_bulk_message_recipients (job_id, status);

-- Filter preference persistence (role tables)
CREATE TABLE IF NOT EXISTS ip_table_filter_prefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
  table_key TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, table_key)
);
