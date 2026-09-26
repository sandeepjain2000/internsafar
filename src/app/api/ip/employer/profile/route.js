import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import {
  EMPLOYER_ETHICS_ITEMS,
  EMPLOYER_ETHICS_VERSION,
  allEthicsChecked,
  ethicsMapsEqual,
  isEthicsLocked,
  normalizeEthicsAcks,
} from '@/lib/employerEthics';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';
import { ensureIpEmployerDocumentSlotsSchema } from '@/lib/ipEmployerDocuments';
import { isValidBusinessEntityType } from '@/lib/employerBusinessEntity';
import { REQUIRED_FOR_COMPLETE } from '@/lib/employerProfileComplete';
import { validateRequiredPhone } from '@/lib/ipPhoneValidation';
import { normalizeCountry } from '@/lib/ipRegions';
import { FRIENDLY_TEMP_UNAVAILABLE, toSafeClientError } from '@/lib/ipSafeClientError';

const EDITABLE_FIELDS = [
  'company_name', 'legal_name', 'brand_name', 'website', 'work_email', 'industry', 'company_size',
  'hq_city', 'hq_state', 'hq_country', 'about', 'logo_url', 'linkedin_url', 'contact_name',
  'contact_designation', 'contact_phone', 'contact_phone_country_code', 'show_identity_on_posting',
  'show_hiring_numbers', 'whatsapp_opt_in', 'telegram_opt_in', 'business_entity_type',
];

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  try {
    await ensureIpEmployerApprovalSchema();
    await ensureIpEmployerDocumentSlotsSchema();
    const result = await query(
      `SELECT e.*, u.email as account_email, u.points, u.free_post_credits, u.referral_code, u.profile_complete
       FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
       WHERE e.user_id = $1`,
      [session.user.id],
    );
    if (!result.rows[0]) return jsonError('Profile not found', 404);
    result.rows[0].hq_country ||= 'India';
    result.rows[0].contact_phone_country_code ||= '+91';
    const docs = await query(
      `SELECT * FROM ip_employer_documents
       WHERE employer_id = $1 AND superseded_at IS NULL
       ORDER BY created_at DESC`,
      [result.rows[0].id],
    );
    return jsonOk({
      profile: result.rows[0],
      documents: docs.rows,
      ethicsItems: EMPLOYER_ETHICS_ITEMS,
      ethicsVersion: EMPLOYER_ETHICS_VERSION,
    });
  } catch (e) {
    console.error('[ip] employer profile GET', e);
    return jsonError(toSafeClientError(e, FRIENDLY_TEMP_UNAVAILABLE), 503);
  }
}

export async function PUT(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  try {
    await ensureIpEmployerApprovalSchema();

    if (body.business_entity_type !== undefined) {
      const v = String(body.business_entity_type || '').trim();
      if (v && !isValidBusinessEntityType(v)) {
        return jsonError('Invalid business entity type');
      }
      body.business_entity_type = v || null;
    }

    if (body.contact_phone !== undefined || body.contact_phone_country_code !== undefined) {
      const dial = String(body.contact_phone_country_code || '+91').trim() || '+91';
      const phoneCheck = validateRequiredPhone(body.contact_phone, dial);
      if (!phoneCheck.ok) return jsonError(phoneCheck.error);
      body.contact_phone_country_code = dial;
    }

    const sets = [];
    const params = [session.user.id];
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      let value = body[field];
      if (field === 'hq_country') {
        value = normalizeCountry(value);
      }
      params.push(value);
      sets.push(`${field} = $${params.length}`);
    }

    if (body.ethics_acks !== undefined) {
      const current = await query(
        `SELECT ethics_acks, ethics_accepted_at FROM ip_employers WHERE user_id = $1 LIMIT 1`,
        [session.user.id],
      );
      const cur = current.rows[0] || {};
      const incoming = normalizeEthicsAcks(body.ethics_acks);
      if (isEthicsLocked(cur)) {
        if (!ethicsMapsEqual(cur.ethics_acks, incoming) || !allEthicsChecked(incoming)) {
          return jsonError(
            'Guidelines & Ethics are locked after save. Contact SuperAdmin to reset acknowledgements.',
            403,
          );
        }
        // Locked + unchanged — ignore ethics fields (keep stamp).
      } else {
        params.push(JSON.stringify(incoming));
        sets.push(`ethics_acks = $${params.length}::jsonb`);
        params.push(EMPLOYER_ETHICS_VERSION);
        sets.push(`ethics_version = $${params.length}`);
        if (allEthicsChecked(incoming)) {
          sets.push('ethics_accepted_at = now()');
        } else {
          sets.push('ethics_accepted_at = null');
        }
      }
    }

    if (sets.length) {
      await query(`UPDATE ip_employers SET ${sets.join(', ')}, updated_at = now() WHERE user_id = $1`, params);
    }

    const merged = await query(`SELECT * FROM ip_employers WHERE user_id = $1`, [session.user.id]);
    const row = merged.rows[0] || {};
    const fieldsOk = REQUIRED_FOR_COMPLETE.every((f) => row[f] !== null && row[f] !== undefined && String(row[f]).trim() !== '');
    const ethicsOk = allEthicsChecked(row.ethics_acks) && Boolean(row.ethics_accepted_at);
    const complete = fieldsOk && ethicsOk;
    await query(`UPDATE ip_users SET profile_complete = $2, updated_at = now() WHERE id = $1`, [session.user.id, complete]);

    return jsonOk({
      ok: true,
      profileComplete: complete,
      ethicsComplete: ethicsOk,
      ethicsLocked: isEthicsLocked(row),
      missingEthics: ethicsOk
        ? []
        : EMPLOYER_ETHICS_ITEMS.filter((i) => row.ethics_acks?.[i.id] !== true).map((i) => i.id),
    });
  } catch (e) {
    console.error('[ip] employer profile PUT', e);
    return jsonError(toSafeClientError(e, FRIENDLY_TEMP_UNAVAILABLE), 503);
  }
}
