import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { processExportJob } from '@/lib/ipApplicantExport';

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const job = await query(
    `SELECT id, status, progress, total, error, result_filename, resume_count, skipped_resumes,
            include_resumes, created_at, completed_at,
            CASE WHEN status = 'done' THEN result_csv ELSE NULL END AS result_csv,
            CASE WHEN status = 'done' THEN result_zip_base64 ELSE NULL END AS result_zip_base64
     FROM ip_export_jobs WHERE id = $1 AND employer_id = $2`,
    [id, emp.rows[0]?.id],
  );
  if (!job.rows[0]) return jsonError('Not found', 404);

  // If still pending/processing, try to advance (helps serverless)
  if (job.rows[0].status === 'pending' || job.rows[0].status === 'processing') {
    try {
      await processExportJob(id);
    } catch (e) {
      console.warn('[export-jobs GET]', e.message);
    }
    const refreshed = await query(
      `SELECT id, status, progress, total, error, result_filename, resume_count, skipped_resumes,
              include_resumes, created_at, completed_at,
              CASE WHEN status = 'done' THEN result_csv ELSE NULL END AS result_csv,
              CASE WHEN status = 'done' THEN result_zip_base64 ELSE NULL END AS result_zip_base64
       FROM ip_export_jobs WHERE id = $1 AND employer_id = $2`,
      [id, emp.rows[0]?.id],
    );
    return jsonOk({ job: refreshed.rows[0] });
  }

  return jsonOk({ job: job.rows[0] });
}
