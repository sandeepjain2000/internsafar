import { query } from '@/lib/db';

let ready = false;

/** Idempotent columns for employer approval triage (reason + review timestamp). */
export async function ensureIpEmployerApprovalSchema() {
  if (ready) return;
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS work_email TEXT`);
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS approval_reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS business_entity_type TEXT`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS contact_designation TEXT`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS business_entity_type TEXT`);
  try {
    await query(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending'`);
  } catch {
    /* table may not exist on a partial DB */
  }
  ready = true;
}
