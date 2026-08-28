/**
 * Builds the ip_candidates UPDATE for a candidate profile save.
 *
 * Kept free of Next/db imports so the exact SQL the API runs can be exercised
 * directly against Postgres by scripts/check-ip-db-integrity.mjs.
 */

export const EDITABLE_FIELDS = [
  'name', 'first_name', 'middle_name', 'last_name', 'phone', 'phone_country_code',
  'whatsapp_number', 'telegram_handle', 'profile_picture_url', 'show_profile_picture', 'college', 'degree', 'specialization',
  'study_status', 'graduation_year', 'cgpa', 'country', 'city', 'state', 'skills', 'resume_url', 'resume_links', 'linkedin_url',
  'github_url', 'portfolio_url', 'personal_website', 'preferred_work_mode', 'preferred_locations', 'availability_date',
  'searchable', 'show_completed_internships', 'whatsapp_opt_in', 'telegram_opt_in',
  'has_wired_broadband', 'has_dedicated_laptop', 'preferred_hours_start', 'preferred_hours_end',
  'ongoing_commitment', 'ongoing_commitment_note', 'ongoing_commitment_choice',
  'prior_experience', 'immediate_start', 'willing_to_relocate', 'hide_phone_until_shortlist',
];

export const COMMITMENT_CHOICES = new Set([
  '', 'none', 'other_internship', 'offline_classes', 'part_time_work', 'other',
]);

const OPTIONAL_BOOLS = new Set(['has_wired_broadband', 'has_dedicated_laptop', 'ongoing_commitment']);

const REQUIRED_BOOLS = new Set([
  'immediate_start', 'willing_to_relocate', 'hide_phone_until_shortlist',
  'searchable', 'show_completed_internships', 'whatsapp_opt_in', 'telegram_opt_in',
]);

/** INT / NUMERIC / DATE columns reject '' — blank means "not set". */
const NULL_WHEN_BLANK = new Set(['availability_date', 'graduation_year', 'cgpa']);

/** Stored as TEXT[]; node-postgres maps a JS array straight onto that. */
const TEXT_ARRAYS = new Set(['skills', 'preferred_locations']);

const COUNTRY_OPTIONS = new Set(['India', 'Bangladesh', 'Sri Lanka', 'Indonesia']);

export function normalizeOptionalBool(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value === true || value === 'true' || value === 'yes') return true;
  if (value === false || value === 'false' || value === 'no') return false;
  return null;
}

export function normalizeResumeLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, i) => ({
    id: String(item?.id || '').trim() || `rl_${Date.now()}_${i}`,
    url: String(item?.url || '').trim(),
    title: String(item?.title || '').trim(),
  }));
}

function toTextArray(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map((s) => String(s ?? '').trim()).filter(Boolean);
}

/**
 * @param {object} body    parsed request body
 * @param {string} userId  ip_users.id — always $1
 * @param {{ phoneChanged?: boolean }} [options]
 * @returns {{ sets: string[], params: any[], sql: string|null }}
 */
export function buildCandidateProfileUpdate(body, userId, options = {}) {
  // The form posts `name` alongside first/middle/last; the composed value wins,
  // so skip the raw field or the UPDATE would assign the same column twice.
  const composesName =
    body.first_name !== undefined || body.middle_name !== undefined || body.last_name !== undefined;

  const sets = [];
  const params = [userId];
  const assign = (column, value, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };

  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === 'name' && composesName) continue;

    let value = body[field];

    if (TEXT_ARRAYS.has(field)) {
      assign(field, toTextArray(value), '::text[]');
      continue;
    }
    if (field === 'resume_links') {
      assign(field, JSON.stringify(normalizeResumeLinks(value)), '::jsonb');
      continue;
    }
    if (field === 'country') {
      const v = value == null ? '' : String(value).trim();
      value = COUNTRY_OPTIONS.has(v) ? v : 'India';
    }
    if (NULL_WHEN_BLANK.has(field)) {
      value = (value == null ? '' : String(value).trim()) || null;
    }
    if (OPTIONAL_BOOLS.has(field)) value = normalizeOptionalBool(value);
    if (REQUIRED_BOOLS.has(field)) value = value === true || value === 'true';
    if (field === 'show_profile_picture') value = value !== false && value !== 'false';
    if (field === 'ongoing_commitment_choice') {
      value = COMMITMENT_CHOICES.has(value) ? value : '';
      value = value === '' ? null : value;
    }
    assign(field, value);
  }

  if (body.ongoing_commitment_choice !== undefined && body.ongoing_commitment === undefined) {
    const choice = body.ongoing_commitment_choice;
    assign('ongoing_commitment', choice === 'none' ? false : choice ? true : null);
  }
  if (composesName) {
    const composed = [body.first_name, body.middle_name, body.last_name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
    assign('name', composed);
  }
  if (options.phoneChanged) sets.push('phone_verified_at = NULL');

  const sql = sets.length
    ? `UPDATE ip_candidates SET ${sets.join(', ')}, updated_at = now() WHERE user_id = $1`
    : null;

  return { sets, params, sql };
}
