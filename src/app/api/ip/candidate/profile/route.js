import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';
import { maybeAwardProfileCompleteBonus } from '@/lib/ipReferralCredit';
import { PROFILE_COMPLETE_POINTS } from '@/lib/pointsEconomy';
import { validateOptionalPhone } from '@/lib/ipPhoneValidation';
import { buildCandidateProfileUpdate } from '@/lib/ipCandidateProfileUpdate';

/** Phone is optional for save / completeness; blank is allowed. */
const REQUIRED_FOR_COMPLETE = ['name', 'college', 'degree', 'city', 'country', 'resume_url'];

/** Field labels as the candidate sees them on the profile form. */
const FIELD_LABELS = {
  first_name: 'First Name',
  middle_name: 'Middle Name',
  last_name: 'Last Name',
  phone: 'Mobile phone',
  phone_country_code: 'Country code',
  whatsapp_number: 'WhatsApp number',
  telegram_handle: 'Telegram handle',
  college: 'College',
  degree: 'Degree',
  specialization: 'Specialization',
  study_status: 'Study status',
  graduation_year: 'Graduation year',
  cgpa: 'CGPA',
  country: 'Country',
  city: 'Current City',
  state: 'State / Union Territory',
  skills: 'Skills',
  resume_url: 'Resume / CV',
  resume_links: 'Extra CV-related links',
  linkedin_url: 'LinkedIn Profile URL',
  github_url: 'GitHub / Portfolio URL',
  portfolio_url: 'Portfolio URL',
  personal_website: 'Personal website',
  preferred_work_mode: 'Preferred Work Mode',
  preferred_locations: 'Preferred Locations',
  availability_date: 'Earliest Availability / Start Date',
  preferred_hours_start: 'Preferred hours (from)',
  preferred_hours_end: 'Preferred hours (to)',
  ongoing_commitment_note: 'Ongoing commitment note',
  prior_experience: 'Work experience',
};

/**
 * Turn a Postgres error into something a candidate can act on.
 * Technical wording (types, casts, constraints) never reaches the form.
 */
function friendlySaveError(err) {
  const raw = `${err?.column || ''} ${err?.message || ''}`;
  const key = Object.keys(FIELD_LABELS).find((f) => new RegExp(`\\b${f}\\b`).test(raw));
  const label = key ? FIELD_LABELS[key] : '';

  if (err?.code === '22P02' || err?.code === '22007' || err?.code === '22008') {
    return label
      ? `${label} isn't in a format we can save. Please check what you entered and try again.`
      : 'One of the values isn\'t in a format we can save. Please check your entries and try again.';
  }
  if (err?.code === '22001') {
    return label ? `${label} is too long. Please shorten it.` : 'One of your entries is too long. Please shorten it.';
  }
  if (err?.code === '23502') {
    return label ? `${label} can't be left blank.` : 'A required field was left blank.';
  }
  if (err?.code === '23505') {
    return label ? `${label} is already used by another account.` : 'That value is already used by another account.';
  }
  return label
    ? `We couldn't save ${label}. Please try again, or contact support if it keeps happening.`
    : 'We couldn\'t save your profile just now. Please try again, or contact support if it keeps happening.';
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
    console.error('[ip/candidate/profile] PUT failed', err);
    return jsonError(friendlySaveError(err), 500);
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

  const phoneChanged = Boolean(
    phonePrev
      && nextPhone !== null
      && (nextPhone !== String(phonePrev.phone || '').trim()
        || nextCode !== String(phonePrev.phone_country_code || '').trim()),
  );

  const { sql, params } = buildCandidateProfileUpdate(body, session.user.id, { phoneChanged });
  if (sql) {
    try {
      await query(sql, params);
    } catch (err) {
      // Log the real cause for us; show the candidate plain language.
      console.error('[ip/candidate/profile] update failed', err);
      return jsonError(friendlySaveError(err), 400);
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
