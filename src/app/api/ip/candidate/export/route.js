import { requireSession, jsonError } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { buildCandidateExportSheets } from '@/lib/ipCandidateFullExport';
import { workbookToBuffer } from '@/lib/ipXlsxWorkbook';

export async function GET() {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();

  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  if (!cand.rows[0]) {
    return jsonError('No data', 404);
  }

  const sheets = await buildCandidateExportSheets(session.user.id);
  const buffer = await workbookToBuffer(sheets);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="candidate-portal-export.xlsx"',
    },
  });
}
