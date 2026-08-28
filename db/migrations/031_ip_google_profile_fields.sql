-- 031: keep the profile data Google already returns under the 'profile' scope.
--
-- Previously only the Google subject id and email were stored, so the candidate had to
-- retype a full name Google had just supplied, and the profile picture was discarded.

BEGIN;

ALTER TABLE ip_google_identities ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE ip_google_identities ADD COLUMN IF NOT EXISTS picture_url text;

ALTER TABLE ip_google_verifications ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE ip_google_verifications ADD COLUMN IF NOT EXISTS picture_url text;

COMMENT ON COLUMN ip_google_identities.name IS 'Display name as returned by Google at verification time';
COMMENT ON COLUMN ip_google_identities.picture_url IS 'Google profile picture URL captured at verification time';

COMMIT;
