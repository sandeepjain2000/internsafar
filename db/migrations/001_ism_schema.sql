-- ISM schema — CREATE IF NOT EXISTS only. Never ALTER/DROP PH tables.
-- Prefix: ism_ / is_

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_users'
  ) THEN
    CREATE TABLE ism_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'employer', 'admin')),
      name TEXT NOT NULL,
      profile_id TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_students'
  ) THEN
    CREATE TABLE ism_students (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES ism_users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      college TEXT,
      degree TEXT,
      branch TEXT,
      year INT,
      batch_year INT,
      graduation_year INT,
      cgpa NUMERIC(4,2),
      pct10 NUMERIC(5,2),
      pct12 NUMERIC(5,2),
      backlogs INT DEFAULT 0,
      resume_url TEXT,
      resume_file_name TEXT,
      portfolio_url TEXT,
      linkedin_url TEXT,
      github_url TEXT,
      skills TEXT[] DEFAULT '{}',
      preferred_locations TEXT[] DEFAULT '{}',
      willing_to_relocate BOOLEAN DEFAULT false,
      address TEXT,
      city TEXT,
      about TEXT,
      registration_status TEXT NOT NULL DEFAULT 'approved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_employers'
  ) THEN
    CREATE TABLE ism_employers (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES ism_users(id),
      name TEXT NOT NULL,
      legal_name TEXT,
      website TEXT,
      industry TEXT,
      size_band TEXT,
      hq TEXT,
      about TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      registration_status TEXT NOT NULL DEFAULT 'pending',
      verification_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_employer_documents'
  ) THEN
    CREATE TABLE ism_employer_documents (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ism_employers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      doc_type TEXT,
      url TEXT,
      s3_key TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending_review',
      uploaded_at DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_employer_verifications'
  ) THEN
    CREATE TABLE ism_employer_verifications (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ism_employers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft',
      submitted_at DATE,
      reviewed_at DATE,
      reviewer TEXT,
      notes TEXT,
      employer_message TEXT,
      attestation_ids TEXT[] DEFAULT '{}',
      document_ids TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_employer_users'
  ) THEN
    CREATE TABLE ism_employer_users (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ism_employers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role_title TEXT DEFAULT 'Recruiter',
      status TEXT NOT NULL DEFAULT 'invited',
      invited_at DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_internships'
  ) THEN
    CREATE TABLE ism_internships (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ism_employers(id) ON DELETE CASCADE,
      opportunity_type TEXT NOT NULL DEFAULT 'internship',
      title TEXT NOT NULL,
      location TEXT,
      mode TEXT,
      commitment TEXT,
      experience_years TEXT,
      stipend NUMERIC,
      fixed_pay_min NUMERIC,
      fixed_pay_max NUMERIC,
      variable_pay_min NUMERIC DEFAULT 0,
      variable_pay_max NUMERIC DEFAULT 0,
      duration_weeks INT,
      openings INT DEFAULT 1,
      start_date DATE,
      end_date DATE,
      apply_deadline DATE,
      expires_at DATE,
      description TEXT,
      responsibilities TEXT[] DEFAULT '{}',
      skills TEXT[] DEFAULT '{}',
      candidate_preferences TEXT,
      alternate_mobile TEXT,
      screening_questions JSONB DEFAULT '[]',
      perks TEXT[] DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      views INT NOT NULL DEFAULT 0,
      premium BOOLEAN NOT NULL DEFAULT false,
      posted_at DATE,
      removal_notes TEXT,
      removed_at DATE,
      eligibility JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_internship_compliance'
  ) THEN
    CREATE TABLE ism_internship_compliance (
      id TEXT PRIMARY KEY,
      internship_id TEXT NOT NULL REFERENCES ism_internships(id) ON DELETE CASCADE,
      guideline_id TEXT NOT NULL,
      accepted BOOLEAN NOT NULL DEFAULT false,
      accepted_at TIMESTAMPTZ,
      UNIQUE (internship_id, guideline_id)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_applications'
  ) THEN
    CREATE TABLE ism_applications (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ism_students(id) ON DELETE CASCADE,
      internship_id TEXT NOT NULL REFERENCES ism_internships(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Applied',
      applied_at DATE DEFAULT CURRENT_DATE,
      history JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ism_applications_student_idx ON ism_applications(student_id);
    CREATE INDEX IF NOT EXISTS ism_applications_internship_idx ON ism_applications(internship_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_participations'
  ) THEN
    CREATE TABLE ism_participations (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ism_students(id) ON DELETE CASCADE,
      internship_id TEXT NOT NULL REFERENCES ism_internships(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'not_started',
      history JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_completions'
  ) THEN
    CREATE TABLE ism_completions (
      id TEXT PRIMARY KEY,
      participation_id TEXT REFERENCES ism_participations(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      internship_id TEXT NOT NULL,
      completed_at DATE,
      marked_by TEXT,
      certificate_url TEXT,
      rating INT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_message_threads'
  ) THEN
    CREATE TABLE ism_message_threads (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ism_employers(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES ism_students(id) ON DELETE CASCADE,
      internship_id TEXT REFERENCES ism_internships(id) ON DELETE SET NULL,
      application_id TEXT,
      decision_status TEXT,
      unread INT NOT NULL DEFAULT 0,
      messaging_locked BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_messages'
  ) THEN
    CREATE TABLE ism_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES ism_message_threads(id) ON DELETE CASCADE,
      from_role TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_cases'
  ) THEN
    CREATE TABLE ism_cases (
      id TEXT PRIMARY KEY,
      type TEXT,
      subject TEXT NOT NULL,
      description TEXT,
      raised_by TEXT,
      raised_by_role TEXT,
      against TEXT,
      internship_id TEXT,
      application_id TEXT,
      status TEXT NOT NULL DEFAULT 'Open',
      opened_at DATE DEFAULT CURRENT_DATE,
      history JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_notifications'
  ) THEN
    CREATE TABLE ism_notifications (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      user_id TEXT,
      type TEXT,
      title TEXT NOT NULL,
      body TEXT,
      href TEXT,
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_audit_logs'
  ) THEN
    CREATE TABLE ism_audit_logs (
      id TEXT PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor TEXT,
      action TEXT NOT NULL,
      domain TEXT,
      object_type TEXT,
      object_id TEXT,
      outcome TEXT,
      context JSONB DEFAULT '{}'::jsonb
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_notification_prefs'
  ) THEN
    CREATE TABLE ism_notification_prefs (
      user_id TEXT PRIMARY KEY REFERENCES ism_users(id) ON DELETE CASCADE,
      notify_on_register BOOLEAN DEFAULT true,
      notify_on_approve BOOLEAN DEFAULT true,
      notify_on_post BOOLEAN DEFAULT true,
      notify_on_apply BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_plans'
  ) THEN
    CREATE TABLE ism_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price_inr NUMERIC NOT NULL,
      listing_credits INT,
      duration_days INT,
      features TEXT[] DEFAULT '{}',
      popular BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_employer_plan_purchases'
  ) THEN
    CREATE TABLE ism_employer_plan_purchases (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ism_employers(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES ism_plans(id),
      status TEXT NOT NULL DEFAULT 'active',
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ,
      amount_inr NUMERIC,
      meta JSONB DEFAULT '{}'::jsonb
    );
  END IF;
END $$;
