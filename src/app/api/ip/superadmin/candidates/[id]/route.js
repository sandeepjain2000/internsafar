import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { getSuperadminCandidateDetail } from '@/lib/ipSuperadminCandidates';

/**
 * SuperAdmin candidate detail. `id` is the candidate's ip_users.id.
 * GET → { candidate, applications, offers, contacts, companies }
 */
export async function GET(_request, { params }) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  const { id } = await params;
  try {
    const detail = await getSuperadminCandidateDetail(String(id || ''));
    if (!detail) return jsonError('Candidate not found', 404);
    return jsonOk(detail);
  } catch (e) {
    console.error('[superadmin candidates] detail failed', e?.message);
    return jsonError('Could not load candidate', 500);
  }
}
