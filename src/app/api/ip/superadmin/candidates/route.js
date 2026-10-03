import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { listSuperadminCandidates } from '@/lib/ipSuperadminCandidates';

/**
 * SuperAdmin Candidates list — every candidate account with application/offer/contact summaries.
 * GET → { candidates, companies, truncated, cap }
 */
export async function GET() {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  try {
    return jsonOk(await listSuperadminCandidates());
  } catch (e) {
    console.error('[superadmin candidates] list failed', e?.message);
    return jsonError('Could not load candidates', 500);
  }
}
