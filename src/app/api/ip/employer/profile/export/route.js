import { query } from '@/lib/db';
import { requireSession, jsonError } from '@/lib/apiAuth';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';
import { ensureIpEmployerDocumentSlotsSchema } from '@/lib/ipEmployerDocuments';
import { workbookToBuffer } from '@/lib/ipXlsxWorkbook';

function safeFilePart(name) {
  return String(name || 'profile')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'profile';
}

function withHeaders(headers, rows) {
  if (rows.length) return rows;
  return [{ ...headers }];
}

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;

  await ensureIpEmployerApprovalSchema();
  await ensureIpEmployerDocumentSlotsSchema();

  const emp = await query(
    `SELECT e.*, u.email as account_email, u.points, u.referral_code, u.profile_complete
     FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
     WHERE e.user_id = $1`,
    [session.user.id],
  );
  if (!emp.rows[0]) return jsonError('Profile not found', 404);
  const p = emp.rows[0];

  const docs = await query(
    `SELECT id, doc_type, doc_label, review_status, reviewed_at, created_at, file_name
     FROM ip_employer_documents
     WHERE employer_id = $1 AND superseded_at IS NULL
     ORDER BY created_at DESC`,
    [p.id],
  );

  const companyRows = [
    {
      company_name: p.company_name,
      legal_name: p.legal_name,
      brand_name: p.brand_name,
      business_entity_type: p.business_entity_type,
      website: p.website,
      work_email: p.work_email,
      account_email: p.account_email,
      industry: p.industry,
      company_size: p.company_size,
      hq_city: p.hq_city,
      hq_state: p.hq_state,
      hq_country: p.hq_country || 'India',
      about: p.about,
      linkedin_url: p.linkedin_url,
      contact_name: p.contact_name,
      contact_designation: p.contact_designation,
      contact_phone: p.contact_phone,
      contact_phone_country_code: p.contact_phone_country_code,
      show_identity_on_posting: p.show_identity_on_posting,
      show_hiring_numbers: p.show_hiring_numbers,
      approval_status: p.approval_status,
      email_verified_at: p.email_verified_at,
      profile_complete: p.profile_complete,
      ethics_accepted_at: p.ethics_accepted_at,
      points: p.points,
      referral_code: p.referral_code,
    },
  ];

  const documentHeaders = {
    id: '',
    doc_type: '',
    doc_label: '',
    review_status: '',
    file_name: '',
    created_at: '',
    reviewed_at: '',
  };
  const documentRows = docs.rows.map((d) => ({
    id: d.id,
    doc_type: d.doc_type,
    doc_label: d.doc_label,
    review_status: d.review_status,
    file_name: d.file_name,
    created_at: d.created_at,
    reviewed_at: d.reviewed_at,
  }));

  const buffer = await workbookToBuffer([
    { name: 'Company', rows: companyRows },
    { name: 'Documents', rows: withHeaders(documentHeaders, documentRows) },
  ]);

  const filename = `employer-profile-${safeFilePart(p.company_name)}.xlsx`;
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
