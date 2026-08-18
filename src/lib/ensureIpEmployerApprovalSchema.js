import { query } from '@/lib/db';

let ready = false;

/** Idempotent columns for employer approval triage (reason + review timestamp). */
export async function ensureIpEmployerApprovalSchema() {
  if (ready) return;
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS approval_reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  ready = true;
}
