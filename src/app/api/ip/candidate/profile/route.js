import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';
import { maybeAwardProfileCompleteBonus } from '@/lib/ipReferralCredit';
import { PROFILE_COMPLETE_POINTS } from '@/lib/pointsEconomy';
import { validateOptionalPhone } from '@/lib/ipPhoneValidation';

const EDITABLE_FIELDS = [
  'name', 'first_name', 'middle_name', 'last_name', 'phone', 'phone_country_code',
  'whatsapp_number', 'telegram_handle', 'profile_picture_url', 'show_profile_picture', 'college', 'degree', 'specialization',
  'study_status', 'graduation_year', 'cgpa', 'country', 'city', 'state', 'skills', 'resume_url', 'resume_links', 'linkedin_url',
  'github_url', 'portfolio_url', 'personal_website', 'preferred_work_mode', 'preferred_locations', 'availability_date',
  'searchable', 'show_completed_internships', 'whatsapp_opt_in', 'telegram_opt_in',
  'has_wired_broadband', 'has_dedicated_laptop', 'preferred_hours_start', 'preferred_hours_end',
  'ongoing_commitment', 'ongoing_commitment_note', 'ongoing_commitment_choice',
  'prior_experience', 'immediate_start', 'willing_to_relocate', 'hide_phone_until_shortlist',
];

const COMMITMENT_CHOICES = new Set(['', 'none', 'other_internship', 'offline_classes', 'part_time_work', 'other']);

/** Phone is optional for save / completeness; blank is allowed. */
const REQUIRED_FOR_COMPLETE = ['name', 'college', 'degree', 'city', 'country', 'resume_url'];

function normalizeOptionalBool(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value === true || value === 'true' || value === 'yes') return true;
  if (value === false || value === 'false' || value === 'no') return false;
  return null;
}

function normalizeResumeLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, i) => {
    const id = String(item?.id || '').trim() || `rl_${Date.now()}_${i}`;
    return {
      id,
      url: String(item?.url || '').trim(),
      title: String(item?.title || '').trim(),
    };
  });
}

export async function GET() {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  const result = await query(
    `SELECT c.*, u.email as account_email, u.points, u.application_allowance, u.referral_code, u.profile_complete
     FROM ip_candidates c JOIN ip_users u ON u.id = c.user_id
     WHERE c.user_id = $1`,
    [session.user.id],
  );
  if (!result.rows[0]) return jsonError('Profile not found', 404);
  const profile = result.rows[0];
  if (!profile.first_name && profile.name) {
    const parts = String(profile.name).trim().split(/\s+/);
    profile.first_name = parts.shift() || '';
    profile.last_name = parts.pop() || '';
    profile.middle_name = parts.join(' ');
  }
  profile.phone_country_code ||= '+91';
  profile.country ||= 'India';
  if (profile.hide_phone_until_shortlist == null) profile.hide_phone_until_shortlist = true;
  profile.immediate_start = Boolean(profile.immediate_start);
  profile.willing_to_relocate = Boolean(profile.willing_to_relocate);
  if (!Array.isArray(profile.resume_links)) profile.resume_links = [];
  const bonus = await maybeAwardProfileCompleteBonus(session.user.id);
  if (bonus.awarded) {
    profile.points = Number(profile.points || 0) + PROFILE_COMPLETE_POINTS;
  }
  if (!profile.ongoing_commitment_choice) {
    if (profile.ongoing_commitment === true) profile.ongoing_commitment_choice = 'other_internship';
    else if (profile.ongoing_commitment === false) profile.ongoing_commitment_choice = 'none';
  }
  return jsonOk({ profile });
}

export async function PUT(request) {
  try {
    return await putProfile(request);
  } catch (err) {
    return jsonError(`Could not save profile: ${err?.message || 'unexpected server error'}`, 500);
  }
}

async function putProfile(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  await ensureIpAccountSettingsSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const optionalBools = new Set([
    'has_wired_broadband', 'has_dedicated_laptop', 'ongoing_commitment',
  ]);
  const requiredBools = new Set([
    'immediate_start', 'willing_to_relocate', 'hide_phone_until_shortlist',
    'searchable', 'show_completed_internships', 'whatsapp_opt_in', 'telegram_opt_in',
  ]);

  const countryOptions = new Set(['India', 'Bangladesh', 'Sri Lanka', 'Indonesia']);

  let phonePrev = null;
  let nextPhone = null;
  let nextCode = null;
  if (body.phone !== undefined || body.phone_country_code !== undefined) {
    const currentPhone = await query(
      `SELECT phone, phone_country_code FROM ip_candidates WHERE user_id = $1`,
      [session.user.id],
    );
    phonePrev = currentPhone.rows[0] || {};
    nextPhone = body.phone !== undefined ? String(body.phone || '').trim() : String(phonePrev.phone || '').trim();
    nextCode =
      body.phone_country_code !== undefined
        ? String(body.phone_country_code || '').trim()
        : String(phonePrev.phone_country_code || '').trim();
    const phoneCheck = validateOptionalPhone(nextPhone, nextCode || '+91');
    if (!phoneCheck.ok) return jsonError(phoneCheck.error, 400);
  }

  const sets = [];
  const params = [session.user.id];
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    let value = body[field];
    if (field === 'country') {
      const v = value == null ? '' : String(value).trim();
      value = countryOptions.has(v) ? v : 'India';
    }
    if (field === 'resume_links') {
      value = JSON.stringify(normalizeResumeLinks(value));
    }
    if (field === 'availability_date' || field === 'graduation_year' || field === 'cgpa') {
      // INT / NUMERIC / DATE columns reject '' — blank means "not set".
      const raw = value == null ? '' : String(value).trim();
      value = raw || null;
    }
    if (field === 'skills' || field === 'preferred_locations') {
      // Both are TEXT[] in the schema — node-postgres maps a JS array onto that directly.
      const list = Array.isArray(value)
        ? value
        : String(value || '').split(',');
      params.push(list.map((s) => String(s ?? '').trim()).filter(Boolean));
      sets.push(`${field} = $${params.length}::text[]`);
      continue;
    }
    if (optionalBools.has(field)) value = normalizeOptionalBool(value);
    if (requiredBools.has(field)) value = value === true || value === 'true';
    if (field === 'show_profile_picture') value = value !== false && value !== 'false';
    if (field === 'ongoing_commitment_choice') {
      value = COMMITMENT_CHOICES.has(value) ? value : '';
      value = value === '' ? null : value;
    }
    params.push(value);
    if (field === 'resume_links') {
      sets.push(`${field} = $${params.length}::jsonb`);
    } else {
      sets.push(`${field} = $${params.length}`);
    }
  }
  if (body.ongoing_commitment_choice !== undefined && body.ongoing_commitment === undefined) {
    const choice = body.ongoing_commitment_choice;
    const legacyBool = choice === 'none' ? false : choice ? true : null;
    params.push(legacyBool);
    sets.push(`ongoing_commitment = $${params.length}`);
  }
  if (body.first_name !== undefined || body.middle_name !== undefined || body.last_name !== undefined) {
    const composed = [body.first_name, body.middle_name, body.last_name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
    params.push(composed);
    sets.push(`name = $${params.length}`);
  }
  if (phonePrev && nextPhone !== null) {
    if (nextPhone !== String(phonePrev.phone || '').trim() || nextCode !== String(phonePrev.phone_country_code || '').trim()) {
      sets.push('phone_verified_at = NULL');
    }
  }
  if (sets.length) {
    try {
      await query(`UPDATE ip_candidates SET ${sets.join(', ')}, updated_at = now() WHERE user_id = $1`, params);
    } catch (err) {
      // A bare 500 hides which column rejected the value; name it so the form can point at the field.
      const column = err?.column || err?.detail || '';
      const reason = [err?.message, column].filter(Boolean).join(' — ');
      return jsonError(`Could not save profile: ${reason || 'database rejected the update'}`, 400);
    }
  }

  const merged = await query(`SELECT * FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  const row = merged.rows[0] || {};
  const complete = REQUIRED_FOR_COMPLETE.every((f) => row[f] !== null && row[f] !== undefined && String(row[f]).trim() !== '');
  await query(`UPDATE ip_users SET profile_complete = $2, updated_at = now() WHERE id = $1`, [session.user.id, complete]);
  let profileBonusAwarded = false;
  if (complete) {
    const bonus = await maybeAwardProfileCompleteBonus(session.user.id);
    profileBonusAwarded = Boolean(bonus.awarded);
  }

  return jsonOk({ ok: true, profileComplete: complete, profileBonusAwarded });
}
