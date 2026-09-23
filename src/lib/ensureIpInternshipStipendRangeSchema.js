import { query } from '@/lib/db';

let ensured = false;

/** Additive column — blank on old rows means fixed/single stipend via stipend_inr only. */
export async function ensureIpInternshipStipendRangeSchema() {
  if (ensured) return;
  await query(`
    ALTER TABLE ip_internships
      ADD COLUMN IF NOT EXISTS stipend_inr_max INT
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ip_internships_stipend_range_check'
      ) THEN
        ALTER TABLE ip_internships
          ADD CONSTRAINT ip_internships_stipend_range_check
          CHECK (
            stipend_inr_max IS NULL
            OR stipend_inr IS NULL
            OR stipend_inr_max >= stipend_inr
          );
      END IF;
    END $$;
  `);
  ensured = true;
}
