import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';

/**
 * Public employer profile for candidates (approved employers only).
 * GET /api/ip/candidate/employers/[id]
 */
export async function GET(_request, { params }) {
  const { error } = await requireSession(['candidate']);
  if (error) return error;

  const { id } = await params;
  const employerId = String(id || '').trim();
  if (!employerId) return jsonError('Not found', 404);

  const result = await query(
    `SELECT id, company_name, legal_name, brand_name, industry, company_size, website,
            hq_city, hq_state, hq_country, about, logo_url, linkedin_url,
            contact_name, contact_designation, approval_status
     FROM ip_employers
     WHERE id = $1`,
    [employerId],
  );
  const row = result.rows[0];
  if (!row) return jsonError('Not found', 404);

  const status = String(row.approval_status || '').toLowerCase();
  if (status !== 'approved') {
    return jsonError('This employer profile is not available', 404);
  }

  return jsonOk({
    employer: {
      id: row.id,
      company_name: row.company_name || '',
      legal_name: row.legal_name || '',
      brand_name: row.brand_name || '',
      industry: row.industry || '',
      company_size: row.company_size || '',
      website: row.website || '',
      hq_city: row.hq_city || '',
      hq_state: row.hq_state || '',
      hq_country: row.hq_country || '',
      about: row.about || '',
      logo_url: row.logo_url || '',
      linkedin_url: row.linkedin_url || '',
      contact_name: row.contact_name || '',
      contact_designation: row.contact_designation || '',
    },
  });
}
