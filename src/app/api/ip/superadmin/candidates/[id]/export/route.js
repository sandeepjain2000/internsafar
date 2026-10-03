import { requireSession, jsonError } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { buildCandidateExportSheets } from '@/lib/ipCandidateFullExport';
import { workbookToBuffer } from '@/lib/ipXlsxWorkbook';

/**
 * SuperAdmin full Excel export for one candidate (same sheets as the candidate self-export).
 * GET /api/ip/superadmin/candidates/[id]/export — `id` is ip_users.id
 */
export async function GET(_request, { params }) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  const { id } = await params;

  const cand = await query(
    `SELECT c.id FROM ip_candidates c JOIN ip_users u ON u.id = c.user_id
     WHERE u.id = $1 AND u.role = 'candidate' LIMIT 1`,
    [String(id || '')],
  );
  if (!cand.rows[0]) return jsonError('No profile data for this candidate', 404);

  const sheets = await buildCandidateExportSheets(String(id));
  const buffer = await workbookToBuffer(sheets);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="candidate-export.xlsx"',
    },
  });
}
