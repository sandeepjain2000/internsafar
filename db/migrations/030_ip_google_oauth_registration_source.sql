-- 030: real Google OAuth support + honest registration_source values.
--
-- Background: register-candidate previously stored registration_source='google' for
-- every Gmail-restricted email/password signup, even though no Google OAuth existed.
-- 'google' is now reserved for accounts that actually completed Google OAuth (proved
-- by a row in ip_google_identities); the Gmail-address-only path uses 'gmail_domain'.

BEGIN;

-- Proof of real OAuth. This table, not the registration_source string, is the
-- source of truth for "this account completed Google sign-in".
CREATE TABLE IF NOT EXISTS ip_google_identities (
  user_id text PRIMARY KEY REFERENCES ip_users(id) ON DELETE CASCADE,
  google_sub text NOT NULL,
  email text NOT NULL,
  first_verified_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ip_google_identities_sub_uidx
  ON ip_google_identities (google_sub);

-- Single-use, short-lived tokens for verifying a Google account mid-registration
-- without creating a portal session.
CREATE TABLE IF NOT EXISTS ip_google_verifications (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  email text NOT NULL,
  google_sub text,
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

-- Allow the new honest value.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ip_users_registration_source_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%gmail_domain%'
  ) THEN
    ALTER TABLE ip_users DROP CONSTRAINT ip_users_registration_source_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_registration_source_check') THEN
    ALTER TABLE ip_users ADD CONSTRAINT ip_users_registration_source_check
      CHECK (registration_source IN ('legacy','form','google','domain','gmail_domain'));
  END IF;
END $$;

COMMENT ON COLUMN ip_users.registration_source IS
  'legacy | form | domain | gmail_domain (Gmail-address signup, no OAuth) | google (real Google OAuth only)';

-- Relabel historical rows. Safe and re-runnable: any account that genuinely completed
-- OAuth has an ip_google_identities row and is excluded.
UPDATE ip_users u
   SET registration_source = 'gmail_domain'
 WHERE u.registration_source = 'google'
   AND NOT EXISTS (SELECT 1 FROM ip_google_identities g WHERE g.user_id = u.id);

COMMIT;
