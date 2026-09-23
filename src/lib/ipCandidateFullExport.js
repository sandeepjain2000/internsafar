import { query } from '@/lib/db';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import {
  experienceEntries,
  experienceExportText,
  experienceIsFreeText,
  experienceRangeLabel,
  experienceEntryLabel,
} from '@/lib/ipCandidateExperience';

const PROFILE_HEADERS = {
  name: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  country: '',
  college: '',
  degree: '',
  specialization: '',
  study_status: '',
  graduation_year: '',
  cgpa: '',
  preferred_hours: '',
  preferred_work_mode: '',
  has_wired_broadband: '',
  has_dedicated_laptop: '',
  prior_experience: '',
  immediate_start: '',
  willing_to_relocate: '',
  hide_phone_until_shortlist: '',
  linkedin_url: '',
  github_url: '',
  portfolio_url: '',
};

const ACADEMICS_HEADERS = {
  row_label: '',
  college: '',
  degree: '',
  specialization: '',
  study_status: '',
  graduation_year: '',
  cgpa: '',
};

const SKILLS_HEADERS = { skill: '' };

const EXPERIENCE_HEADERS = {
  title: '',
  organization: '',
  start: '',
  end: '',
  description: '',
};

const APPLICATIONS_HEADERS = {
  title: '',
  company_name: '',
  status: '',
  match_score: '',
  created_at: '',
};

const OFFERS_HEADERS = {
  role_title: '',
  status: '',
  stipend_inr: '',
  start_date: '',
  title: '',
  company_name: '',
};

const ENDORSEMENTS_HEADERS = {
  company_name: '',
  role_title: '',
  period_label: '',
  skills_endorsed: '',
  rating_excerpt: '',
  created_at: '',
};

function withHeaderFallback(headers, rows) {
  if (rows.length) return rows;
  return [{ ...headers }];
}

async function academicsTableExists() {
  try {
    const r = await query(`SELECT to_regclass('public.ip_candidate_academics') AS t`);
    return Boolean(r.rows[0]?.t);
  } catch {
    return false;
  }
}

async function resolveCandidate(candidateUserIdOrId) {
  const key = String(candidateUserIdOrId || '').trim();
  if (!key) return null;
  const byUser = await query(`SELECT * FROM ip_candidates WHERE user_id = $1 LIMIT 1`, [key]);
  if (byUser.rows[0]) return byUser.rows[0];
  const byId = await query(`SELECT * FROM ip_candidates WHERE id = $1 LIMIT 1`, [key]);
  return byId.rows[0] || null;
}

function profileSheetRow(c, { includePhone = true } = {}) {
  return {
    name: c.name || '',
    email: c.email || '',
    phone: includePhone ? (c.phone || '') : '',
    city: c.city || '',
    state: c.state || '',
    country: c.country || '',
    college: c.college || '',
    degree: c.degree || '',
    specialization: c.specialization || '',
    study_status: c.study_status || '',
    graduation_year: c.graduation_year ?? '',
    cgpa: c.cgpa ?? '',
    preferred_hours: `${c.preferred_hours_start || ''}–${c.preferred_hours_end || ''}`,
    preferred_work_mode: c.preferred_work_mode || '',
    has_wired_broadband: c.has_wired_broadband,
    has_dedicated_laptop: c.has_dedicated_laptop,
    prior_experience: experienceExportText(c.prior_experience),
    immediate_start: c.immediate_start,
    willing_to_relocate: c.willing_to_relocate,
    hide_phone_until_shortlist: c.hide_phone_until_shortlist,
    linkedin_url: c.linkedin_url || '',
    github_url: c.github_url || '',
    portfolio_url: c.portfolio_url || '',
  };
}

function skillsSheetRows(c) {
  const list = Array.isArray(c.skills)
    ? c.skills.map((s) => String(s || '').trim()).filter(Boolean)
    : String(c.skills || '')
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
  return list.map((skill) => ({ skill }));
}

function experienceSheetRows(c) {
  const entries = experienceEntries(c.prior_experience);
  if (!entries.length) return [];
  if (experienceIsFreeText(c.prior_experience)) {
    return [{
      title: '',
      organization: '',
      start: '',
      end: '',
      description: String(c.prior_experience || '').trim(),
    }];
  }
  return entries.map((e) => ({
    title: e.title || '',
    organization: e.organization || '',
    start: e.start || '',
    end: e.end || '',
    description: e.description || '',
    // keep range in description helper fields unused; Excel uses columns above
    _range: experienceRangeLabel(e) || experienceEntryLabel(e) || '',
  })).map(({ title, organization, start, end, description }) => ({
    title, organization, start, end, description,
  }));
}

async function loadAcademics(candidateId) {
  if (!(await academicsTableExists())) return [];
  try {
    await ensureIpCandidateProfileSchema();
    const r = await query(
      `SELECT row_label, college, degree, specialization, study_status, graduation_year, cgpa
       FROM ip_candidate_academics
       WHERE candidate_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [candidateId],
    );
    return r.rows.map((row) => ({
      row_label: row.row_label || '',
      college: row.college || '',
      degree: row.degree || '',
      specialization: row.specialization || '',
      study_status: row.study_status || '',
      graduation_year: row.graduation_year ?? '',
      cgpa: row.cgpa ?? '',
    }));
  } catch {
    return [];
  }
}

async function loadApplications(candidateId, { employerId = null } = {}) {
  const params = [candidateId];
  let employerClause = '';
  if (employerId) {
    params.push(employerId);
    employerClause = ` AND i.employer_id = $${params.length}`;
  }
  const r = await query(
    `SELECT i.title, e.company_name, a.status, a.match_score, a.created_at
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE a.candidate_id = $1${employerClause}
     ORDER BY a.created_at DESC`,
    params,
  );
  return r.rows.map((row) => ({
    title: row.title || '',
    company_name: row.company_name || '',
    status: row.status || '',
    match_score: row.match_score ?? '',
    created_at: row.created_at || '',
  }));
}

async function loadOffers(candidateId, { employerId = null } = {}) {
  const params = [candidateId];
  let employerClause = '';
  if (employerId) {
    params.push(employerId);
    employerClause = ` AND o.employer_id = $${params.length}`;
  }
  const r = await query(
    `SELECT o.role_title, o.status, o.stipend_inr, o.start_date, i.title, e.company_name
     FROM ip_offers o
     JOIN ip_internships i ON i.id = o.internship_id
     JOIN ip_employers e ON e.id = o.employer_id
     WHERE o.candidate_id = $1${employerClause}
     ORDER BY o.created_at DESC`,
    params,
  );
  return r.rows.map((row) => ({
    role_title: row.role_title || '',
    status: row.status || '',
    stipend_inr: row.stipend_inr ?? '',
    start_date: row.start_date || '',
    title: row.title || '',
    company_name: row.company_name || '',
  }));
}

async function loadEndorsements(candidateId) {
  const r = await query(
    `SELECT en.role_title, en.period_label, en.skills_endorsed, en.rating_excerpt, en.created_at,
            e.company_name
     FROM ip_endorsements en
     LEFT JOIN ip_employers e ON e.id = en.employer_id
     WHERE en.candidate_id = $1
     ORDER BY en.created_at DESC`,
    [candidateId],
  );
  return r.rows.map((row) => ({
    company_name: row.company_name || '',
    role_title: row.role_title || '',
    period_label: row.period_label || '',
    skills_endorsed: Array.isArray(row.skills_endorsed)
      ? row.skills_endorsed.join('; ')
      : row.skills_endorsed || '',
    rating_excerpt: row.rating_excerpt || '',
    created_at: row.created_at || '',
  }));
}

function assembleSheets({
  profileRows,
  academicsRows,
  skillsRows,
  experienceRows,
  applicationsRows,
  offersRows,
  endorsementsRows,
}) {
  return [
    { name: 'Profile', rows: withHeaderFallback(PROFILE_HEADERS, profileRows) },
    { name: 'Academics', rows: withHeaderFallback(ACADEMICS_HEADERS, academicsRows) },
    { name: 'Skills', rows: withHeaderFallback(SKILLS_HEADERS, skillsRows) },
    { name: 'Experience', rows: withHeaderFallback(EXPERIENCE_HEADERS, experienceRows) },
    { name: 'Applications', rows: withHeaderFallback(APPLICATIONS_HEADERS, applicationsRows) },
    { name: 'Offers', rows: withHeaderFallback(OFFERS_HEADERS, offersRows) },
    { name: 'Endorsements', rows: withHeaderFallback(ENDORSEMENTS_HEADERS, endorsementsRows) },
  ];
}

/**
 * Full candidate self-export sheets (all employers / all applications).
 * @param {string} candidateUserIdOrId - ip_users.id or ip_candidates.id
 */
export async function buildCandidateExportSheets(candidateUserIdOrId) {
  await ensureIpCandidateProfileSchema();
  const c = await resolveCandidate(candidateUserIdOrId);
  if (!c) return assembleSheets({
    profileRows: [],
    academicsRows: [],
    skillsRows: [],
    experienceRows: [],
    applicationsRows: [],
    offersRows: [],
    endorsementsRows: [],
  });

  const [academicsRows, applicationsRows, offersRows, endorsementsRows] = await Promise.all([
    loadAcademics(c.id),
    loadApplications(c.id),
    loadOffers(c.id),
    loadEndorsements(c.id),
  ]);

  return assembleSheets({
    profileRows: [profileSheetRow(c, { includePhone: true })],
    academicsRows,
    skillsRows: skillsSheetRows(c),
    experienceRows: experienceSheetRows(c),
    applicationsRows,
    offersRows,
    endorsementsRows,
  });
}

/**
 * Employer download of one candidate — applications/offers scoped to employer;
 * endorsements include all for that candidate.
 */
export async function buildEmployerCandidateExportSheets(candidateId, employerId, { includePhone = false } = {}) {
  await ensureIpCandidateProfileSchema();
  const c = await resolveCandidate(candidateId);
  if (!c || !employerId) {
    return assembleSheets({
      profileRows: [],
      academicsRows: [],
      skillsRows: [],
      experienceRows: [],
      applicationsRows: [],
      offersRows: [],
      endorsementsRows: [],
    });
  }

  const [academicsRows, applicationsRows, offersRows, endorsementsRows] = await Promise.all([
    loadAcademics(c.id),
    loadApplications(c.id, { employerId }),
    loadOffers(c.id, { employerId }),
    loadEndorsements(c.id),
  ]);

  return assembleSheets({
    profileRows: [profileSheetRow(c, { includePhone: Boolean(includePhone) })],
    academicsRows,
    skillsRows: skillsSheetRows(c),
    experienceRows: experienceSheetRows(c),
    applicationsRows,
    offersRows,
    endorsementsRows,
  });
}
