-- Internship Portal schema — CREATE IF NOT EXISTS only.
-- Prefix: ip_*  (do NOT touch ism_* or Placement Hub tables)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_users') THEN
    CREATE TABLE ip_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('candidate', 'employer', 'superadmin')),
      name TEXT NOT NULL DEFAULT '',
      points INT NOT NULL DEFAULT 50,
      application_allowance INT NOT NULL DEFAULT 10,
      free_post_credits INT NOT NULL DEFAULT 1,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      profile_complete BOOLEAN NOT NULL DEFAULT false,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    );
    CREATE INDEX ip_users_role_idx ON ip_users(role);
    CREATE INDEX ip_users_referral_code_idx ON ip_users(referral_code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_candidates') THEN
    CREATE TABLE ip_candidates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES ip_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      phone TEXT,
      profile_picture_url TEXT,
      college TEXT,
      degree TEXT,
      specialization TEXT,
      study_status TEXT,
      graduation_year INT,
      cgpa NUMERIC(4,2),
      city TEXT,
      state TEXT,
      skills TEXT[] DEFAULT '{}',
      resume_url TEXT,
      linkedin_url TEXT,
      github_url TEXT,
      portfolio_url TEXT,
      preferred_work_mode TEXT,
      preferred_locations TEXT[] DEFAULT '{}',
      availability_date DATE,
      searchable BOOLEAN NOT NULL DEFAULT false,
      show_completed_internships BOOLEAN NOT NULL DEFAULT false,
      whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
      telegram_opt_in BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_employers') THEN
    CREATE TABLE ip_employers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES ip_users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL DEFAULT '',
      legal_name TEXT,
      brand_name TEXT,
      website TEXT,
      work_email TEXT,
      industry TEXT,
      company_size TEXT,
      hq_city TEXT,
      hq_state TEXT,
      hq_country TEXT DEFAULT 'India',
      about TEXT,
      logo_url TEXT,
      linkedin_url TEXT,
      contact_name TEXT,
      contact_designation TEXT,
      contact_phone TEXT,
      approval_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
      show_identity_on_posting BOOLEAN NOT NULL DEFAULT true,
      show_hiring_numbers BOOLEAN NOT NULL DEFAULT false,
      whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
      telegram_opt_in BOOLEAN NOT NULL DEFAULT false,
      historical_hires INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_employer_requests') THEN
    CREATE TABLE ip_employer_requests (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      website TEXT,
      contact_email TEXT NOT NULL,
      contact_name TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      created_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_at TIMESTAMPTZ,
      reviewer_id TEXT
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_employer_documents') THEN
    CREATE TABLE ip_employer_documents (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_name TEXT,
      url TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_internships') THEN
    CREATE TABLE ip_internships (
      id TEXT PRIMARY KEY,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      work_mode TEXT,
      stipend_inr INT,
      duration_months INT,
      start_date DATE,
      end_date DATE,
      eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
      questions JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'paused', 'closed')),
      show_employer_identity BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX ip_internships_status_idx ON ip_internships(status);
    CREATE INDEX ip_internships_employer_idx ON ip_internships(employer_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_applications') THEN
    CREATE TABLE ip_applications (
      id TEXT PRIMARY KEY,
      internship_id TEXT NOT NULL REFERENCES ip_internships(id) ON DELETE CASCADE,
      candidate_id TEXT NOT NULL REFERENCES ip_candidates(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'applied',
      match_score NUMERIC(5,2),
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (internship_id, candidate_id)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_message_threads') THEN
    CREATE TABLE ip_message_threads (
      id TEXT PRIMARY KEY,
      internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
      candidate_user_id TEXT REFERENCES ip_users(id) ON DELETE CASCADE,
      employer_user_id TEXT REFERENCES ip_users(id) ON DELETE CASCADE,
      subject TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_messages') THEN
    CREATE TABLE ip_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES ip_message_threads(id) ON DELETE CASCADE,
      sender_user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX ip_messages_thread_idx ON ip_messages(thread_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_offers') THEN
    CREATE TABLE ip_offers (
      id TEXT PRIMARY KEY,
      internship_id TEXT NOT NULL REFERENCES ip_internships(id) ON DELETE CASCADE,
      candidate_id TEXT NOT NULL REFERENCES ip_candidates(id) ON DELETE CASCADE,
      employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
      role_title TEXT,
      stipend_inr INT,
      start_date DATE,
      valid_until DATE,
      letter_url TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      responded_at TIMESTAMPTZ
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_notifications') THEN
    CREATE TABLE ip_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_login_events') THEN
    CREATE TABLE ip_login_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
      email TEXT,
      role TEXT,
      success BOOLEAN NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX ip_login_events_created_idx ON ip_login_events(created_at DESC);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_points_ledger') THEN
    CREATE TABLE ip_points_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      delta INT NOT NULL,
      reason TEXT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_referrals') THEN
    CREATE TABLE ip_referrals (
      id TEXT PRIMARY KEY,
      referrer_user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      referred_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
      referral_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      points_awarded INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_ratings') THEN
    CREATE TABLE ip_ratings (
      id TEXT PRIMARY KEY,
      internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
      from_user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_endorsements') THEN
    CREATE TABLE ip_endorsements (
      id TEXT PRIMARY KEY,
      internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
      employer_id TEXT REFERENCES ip_employers(id) ON DELETE SET NULL,
      candidate_id TEXT REFERENCES ip_candidates(id) ON DELETE SET NULL,
      role_title TEXT,
      period_label TEXT,
      skills_endorsed TEXT[] DEFAULT '{}',
      rating_excerpt TEXT,
      share_url TEXT,
      certificate_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_feature_ideas') THEN
    CREATE TABLE ip_feature_ideas (
      id TEXT PRIMARY KEY,
      author_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      topics TEXT[] DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'Pending approval',
      vote_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_feature_idea_votes') THEN
    CREATE TABLE ip_feature_idea_votes (
      idea_id TEXT NOT NULL REFERENCES ip_feature_ideas(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (idea_id, user_id)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ip_password_resets') THEN
    CREATE TABLE ip_password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- Seed SuperAdmin if missing (password set by app bootstrap: Admin@123)
-- Actual hash inserted by seed script / first bootstrap.
