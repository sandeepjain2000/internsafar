-- One offer per application; one rating per rater/ratee/internship;
-- CHECK constraints on closed status/category columns.
-- Live data was verified clean (0 offer dups, 0 rating dups, no unknown statuses)
-- immediately before this file was written. Do not DELETE rows here.

-- 1) Offers: product writes one row per application_id (NOT NULL).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_application_id_key') THEN
    ALTER TABLE ip_offers ADD CONSTRAINT ip_offers_application_id_key UNIQUE (application_id);
  END IF;
END $$;

-- 2) Application status = union of every writer (PATCH, bulk, offer, completion, withdraw).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_applications_status_check') THEN
    ALTER TABLE ip_applications ADD CONSTRAINT ip_applications_status_check
      CHECK (status IN (
        'applied',
        'shortlisted',
        'interviewing',
        'rejected',
        'hired',
        'offered',
        'completed',
        'declined_offer',
        'withdrawn'
      ));
  END IF;
END $$;

-- 3) Ratings: one score per (from, to, internship).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_ratings_from_to_internship_key') THEN
    ALTER TABLE ip_ratings
      ADD CONSTRAINT ip_ratings_from_to_internship_key
      UNIQUE (from_user_id, to_user_id, internship_id);
  END IF;
END $$;

-- 4) Remaining closed columns (points ledger reason is intentionally NOT constrained).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_notifications_category_check') THEN
    ALTER TABLE ip_notifications ADD CONSTRAINT ip_notifications_category_check
      CHECK (category IN ('application', 'referral', 'system', 'offer', 'interview', 'message'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_referrals_status_check') THEN
    ALTER TABLE ip_referrals ADD CONSTRAINT ip_referrals_status_check
      CHECK (status IN ('pending', 'completed', 'invalid'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_feature_ideas_status_check') THEN
    ALTER TABLE ip_feature_ideas ADD CONSTRAINT ip_feature_ideas_status_check
      CHECK (status IN (
        'Pending approval',
        'Under review',
        'In progress',
        'Planned',
        'Shipped',
        'Declined'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_documents_review_status_check') THEN
    ALTER TABLE ip_employer_documents ADD CONSTRAINT ip_employer_documents_review_status_check
      CHECK (review_status IN ('pending', 'approved', 'flagged'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_registration_source_check') THEN
    ALTER TABLE ip_users ADD CONSTRAINT ip_users_registration_source_check
      CHECK (registration_source IN ('legacy', 'form', 'google', 'domain'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_form_approval_status_check') THEN
    ALTER TABLE ip_users ADD CONSTRAINT ip_users_form_approval_status_check
      CHECK (form_approval_status IS NULL OR form_approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_jobs_status_check') THEN
    ALTER TABLE ip_bulk_message_jobs ADD CONSTRAINT ip_bulk_message_jobs_status_check
      CHECK (status IN ('pending', 'running', 'done'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_recipients_status_check') THEN
    ALTER TABLE ip_bulk_message_recipients ADD CONSTRAINT ip_bulk_message_recipients_status_check
      CHECK (status IN ('pending', 'sent', 'failed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_export_jobs_status_check') THEN
    ALTER TABLE ip_export_jobs ADD CONSTRAINT ip_export_jobs_status_check
      CHECK (status IN ('pending', 'processing', 'done', 'failed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_2fa_challenges_purpose_check') THEN
    ALTER TABLE ip_2fa_challenges ADD CONSTRAINT ip_2fa_challenges_purpose_check
      CHECK (purpose IN ('login', 'enable', 'disable'));
  END IF;
END $$;
