import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { EMPLOYER_ETHICS_ITEMS, EMPLOYER_ETHICS_VERSION, allEthicsChecked } from '@/lib/employerEthics';

const EDITABLE_FIELDS = [
  'company_name', 'legal_name', 'brand_name', 'website', 'work_email', 'industry', 'company_size',
  'hq_city', 'hq_state', 'hq_country', 'about', 'logo_url', 'linkedin_url', 'contact_name',
  'contact_designation', 'contact_phone', 'show_identity_on_posting', 'show_hiring_numbers',
  'whatsapp_opt_in', 'telegram_opt_in',
];

const REQUIRED_FOR_COMPLETE = ['company_name', 'website', 'work_email', 'industry', 'hq_city', 'contact_name', 'contact_phone'];

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const result = await query(
    `SELECT e.*, u.email as account_email, u.points, u.free_post_credits, u.referral_code, u.profile_complete
     FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
     WHERE e.user_id = $1`,
    [session.user.id],
  );
  if (!result.rows[0]) return jsonError('Profile not found', 404);
  const docs = await query(`SELECT * FROM ip_employer_documents WHERE employer_id = $1 ORDER BY created_at DESC`, [result.rows[0].id]);
  return jsonOk({
    profile: result.rows[0],
    documents: docs.rows,
    ethicsItems: EMPLOYER_ETHICS_ITEMS,
    ethicsVersion: EMPLOYER_ETHICS_VERSION,
  });
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

  const sets = [];
  const params = [session.user.id];
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    params.push(body[field]);
    sets.push(`${field} = $${params.length}`);
  }

  let ethicsAcks = null;
  if (body.ethics_acks !== undefined) {
    const incoming = body.ethics_acks && typeof body.ethics_acks === 'object' ? body.ethics_acks : {};
    ethicsAcks = {};
    for (const item of EMPLOYER_ETHICS_ITEMS) {
      ethicsAcks[item.id] = incoming[item.id] === true;
    }
    params.push(JSON.stringify(ethicsAcks));
    sets.push(`ethics_acks = $${params.length}::jsonb`);
    params.push(EMPLOYER_ETHICS_VERSION);
    sets.push(`ethics_version = $${params.length}`);
    if (allEthicsChecked(ethicsAcks)) {
      sets.push('ethics_accepted_at = now()');
    } else {
      sets.push('ethics_accepted_at = null');
    }
  }

  if (sets.length) {
    await query(`UPDATE ip_employers SET ${sets.join(', ')}, updated_at = now() WHERE user_id = $1`, params);
  }

  const merged = await query(`SELECT * FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const row = merged.rows[0] || {};
  const fieldsOk = REQUIRED_FOR_COMPLETE.every((f) => row[f] !== null && row[f] !== undefined && String(row[f]).trim() !== '');
  const ethicsOk = allEthicsChecked(row.ethics_acks);
  const complete = fieldsOk && ethicsOk;
  await query(`UPDATE ip_users SET profile_complete = $2, updated_at = now() WHERE id = $1`, [session.user.id, complete]);

  return jsonOk({
    ok: true,
    profileComplete: complete,
    ethicsComplete: ethicsOk,
    missingEthics: ethicsOk ? [] : EMPLOYER_ETHICS_ITEMS.filter((i) => !row.ethics_acks?.[i.id]).map((i) => i.id),
  });
}
