import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { computeValidationScore } from '@/lib/internshipValidationScore';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { isCandidateAccessible } from '@/lib/ipInternshipVisibility';
import { publicApplicationVolumeLabel } from '@/lib/ipApplicationVolume';
import { maskEmployerName } from '@/lib/ipEmployerIdentity';

export async function GET(request, { params }) {
  const { error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const preview = searchParams.get('preview') === '1';

  const result = await query(
    `SELECT i.*,
            e.company_name, e.logo_url, e.about, e.website, e.linkedin_url, e.show_hiring_numbers, e.historical_hires,
            e.approval_status, e.work_email, e.ethics_acks, e.ethics_accepted_at,
            e.updated_at as employer_updated_at,
            (SELECT count(*)::int FROM ip_applications a WHERE a.internship_id = i.id) AS historical_application_count
     FROM ip_internships i JOIN ip_employers e ON e.id = i.employer_id
     WHERE i.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return jsonError('Not found', 404);

  if (!preview && !isCandidateAccessible(row)) {
    return jsonError('This internship is not available', 404);
  }

  row.company_name = maskEmployerName(row.company_name, row.show_employer_identity !== false);

  const docs = await query(
    `SELECT id, employer_id, doc_type, review_status, reviewed_at, created_at
     FROM ip_employer_documents WHERE employer_id = $1`,
    [row.employer_id],
  );
  const validation = computeValidationScore({
    employer: {
      approval_status: row.approval_status,
      work_email: row.work_email,
      website: row.website,
      linkedin_url: row.linkedin_url,
      ethics_acks: row.ethics_acks,
      ethics_accepted_at: row.ethics_accepted_at,
      updated_at: row.employer_updated_at,
    },
    documents: docs.rows,
    internship: row,
  });

  const volumeLabel = row.show_hiring_numbers
    ? publicApplicationVolumeLabel(row.historical_application_count)
    : null;

  return jsonOk({
    internship: {
      ...row,
      historical_application_count: undefined,
      application_volume_label: volumeLabel,
      validation_score: validation.validation_score,
      validation_label: validation.validation_label,
      validation_breakdown: validation.validation_breakdown,
      preview_mode: preview || false,
    },
  });
}
