-- Shared demo logins (core candidate / employer): password is set from the backend only.
-- UI change-password / reset links leave the stored password untouched when true.
-- Existing users default to false (normal behaviour); flag accounts with scripts/ip-core-account.mjs.
ALTER TABLE ip_users
  ADD COLUMN IF NOT EXISTS is_core_account BOOLEAN NOT NULL DEFAULT false;
