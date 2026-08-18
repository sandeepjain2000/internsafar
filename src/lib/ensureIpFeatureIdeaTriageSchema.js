import { query } from '@/lib/db';

let ready = false;

/** Admin triage notes on feature ideas. */
export async function ensureIpFeatureIdeaTriageSchema() {
  if (ready) return;
  await query(`ALTER TABLE ip_feature_ideas ADD COLUMN IF NOT EXISTS admin_note TEXT`);
  ready = true;
}
