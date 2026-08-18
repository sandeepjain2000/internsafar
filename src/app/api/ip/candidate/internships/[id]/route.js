import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { computeValidationScore } from '@/lib/internshipValidationScore';

export async function GET(request, { params }) {
  const { error } = await requireSession(['candidate']);
  if (error) return error;
  const { id } = await params;
  const result = await query(
    `SELECT i.*,
            e.company_name, e.logo_url, e.about, e.website, e.linkedin_url, e.show_hiring_numbers, e.historical_hires,
            e.approval_status, e.work_email, e.ethics_acks, e.ethics_accepted_at,
            e.updated_at as employer_updated_at
     FROM ip_internships i JOIN ip_employers e ON e.id = i.employer_id
     WHERE i.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return jsonError('Not found', 404);
  if (!row.show_employer_identity) row.company_name = 'Confidential employer';

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

  return jsonOk({
    internship: {
      ...row,
      validation_score: validation.validation_score,
      validation_label: validation.validation_label,
      validation_breakdown: validation.validation_breakdown,
    },
  });
}
