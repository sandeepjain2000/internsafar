-- 036_ip_single_superadmin.sql
--
-- Restore the product rule that there is exactly ONE SuperAdmin, and it is
-- support@placementhub.online.
--
-- How it broke: when the SuperAdmin and core-employer addresses were swapped, the deployed
-- build still carried the old constant SUPERADMIN_EMAIL = 'placementhubsupport@gmail.com'.
-- Every hit on a sign-in page calls POST /api/ip/bootstrap, which promotes whatever that
-- constant names. Local and production share one database, so production kept re-promoting
-- the core EMPLOYER account (Nova Labs) to superadmin after it was repaired locally. The
-- result: two superadmin rows, and the employer able to sign in at /superadmin.
--
-- bootstrap only ever promotes its target; it never demoted anyone else, so a stray role
-- persisted forever. This migration repairs the data; ensureIpBootstrap.js and
-- IP_Reset_Core_Sample.js are hardened alongside it so it cannot re-accumulate.
--
-- The address is hardcoded on purpose: SQL cannot read scripts/lib/ipCoreSampleConfig.js, and
-- this identity is the one value that must never drift. It matches SUPERADMIN_EMAIL in
-- src/lib/ensureIpBootstrap.js and ipCoreSampleConfig.js.
--
-- Safe to re-run: it only touches rows that currently hold 'superadmin' while not being the
-- configured address, so a correct database is a no-op.
-- The runner (scripts/db_exec_sql_file.js) supplies BEGIN/COMMIT.

-- --------------------------------------------------- 1. demote strays to their real role
-- The owned profile row is the source of truth: an account with an ip_employers row is an
-- employer, one with an ip_candidates row is a candidate. Nothing is deleted, and no
-- transactions move — only ip_users.role changes back.
UPDATE ip_users u
   SET role = CASE
                WHEN EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id) THEN 'employer'
                WHEN EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id) THEN 'candidate'
                ELSE u.role
              END,
       updated_at = now()
 WHERE u.role = 'superadmin'
   AND lower(u.email) <> lower('support@placementhub.online')
   AND (EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id)
     OR EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id));

-- --------------------------------------------------- 2. the real SuperAdmin must hold the role
UPDATE ip_users
   SET role = 'superadmin',
       active = true,
       updated_at = now()
 WHERE lower(email) = lower('support@placementhub.online')
   AND (role <> 'superadmin' OR active = false);

-- --------------------------------------------------- 3. self-verify, or abort the transaction
DO $$
DECLARE
  n_super   INT;
  n_wrong   INT;
  n_conflict INT;
  stray     TEXT;
BEGIN
  SELECT count(*) INTO n_super FROM ip_users WHERE role = 'superadmin';

  SELECT count(*) INTO n_wrong FROM ip_users
   WHERE role = 'superadmin' AND lower(email) <> lower('support@placementhub.online');

  SELECT count(*) INTO n_conflict FROM ip_users u
   WHERE u.role = 'superadmin'
     AND (EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id)
       OR EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id));

  IF n_wrong > 0 THEN
    SELECT string_agg(email, ', ') INTO stray FROM ip_users
     WHERE role = 'superadmin' AND lower(email) <> lower('support@placementhub.online');
    RAISE EXCEPTION
      'still % superadmin row(s) that are not the configured address (%). These own no candidate or employer profile, so their real role could not be inferred — set it by hand.',
      n_wrong, stray;
  END IF;

  IF n_conflict > 0 THEN
    RAISE EXCEPTION 'a superadmin row still owns a candidate or employer profile (% row(s))', n_conflict;
  END IF;

  IF n_super <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 superadmin, found %', n_super;
  END IF;
END $$;
