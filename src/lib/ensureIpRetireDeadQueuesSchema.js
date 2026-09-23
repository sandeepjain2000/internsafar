import { query } from '@/lib/db';

let ready = false;

/**
 * Drop retired Form Registrations / Manual Request schema.
 * Safe on shared local+Vercel DB: tables/columns are unused by live Domain/Free-email /
 * Google candidate flows. Idempotent; does not touch live employer/candidate rows.
 */
export async function ensureIpRetireDeadQueuesSchema() {
  if (ready) return;
  await query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_form_approval_status_check'
      ) THEN
        ALTER TABLE ip_users DROP CONSTRAINT ip_users_form_approval_status_check;
      END IF;
    END $$
  `);
  await query(`ALTER TABLE ip_users DROP COLUMN IF EXISTS form_approval_status`);
  await query(`DROP TABLE IF EXISTS ip_employer_requests CASCADE`);
  ready = true;
}
