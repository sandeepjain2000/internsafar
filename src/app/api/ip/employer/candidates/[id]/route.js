import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { employerCanSeeCandidatePhone } from '@/lib/ipCandidatePhonePrivacy';
import {
  internshipHistorySelectSql,
  decorateHistoryFields,
} from '@/lib/ipCandidateInternshipHistory';
import { loadEmployerCandidateSections } from '@/lib/ipCandidateFullExport';
import { commitmentLabel, resumeLinkList, textList } from '@/lib/ipCandidateProfileDisplay';

/**
 * Employer-visible candidate profile. Discovery fields always (if searchable or they applied).
 * Application extras (answers, status, match) only when applicationId is owned by this employer.
 */
export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const employerId = emp.rows[0]?.id;
  if (!employerId) return jsonError('Not found', 404);

  // c.* so a column missing on an older database reads as empty instead of failing the page.
  const cand = await query(
    `SELECT c.*,
            to_char(c.availability_date, 'YYYY-MM-DD') AS availability_day,
            CASE WHEN c.show_profile_picture THEN c.profile_picture_url ELSE NULL END AS visible_profile_picture_url,
            ${internshipHistorySelectSql('c')}
     FROM ip_candidates c WHERE c.id = $1`,
    [id],
  );
  const candidate = cand.rows[0];
  if (!candidate) return jsonError('Not found', 404);

  let application = null;
  if (applicationId) {
    const app = await query(
      `SELECT a.*, i.title AS internship_title, i.id AS internship_id
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       WHERE a.id = $1 AND a.candidate_id = $2 AND i.employer_id = $3`,
      [applicationId, id, employerId],
    );
    application = app.rows[0] || null;
  }
  if (!application) {
    const any = await query(
      `SELECT a.*, i.title AS internship_title, i.id AS internship_id
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       WHERE a.candidate_id = $1 AND i.employer_id = $2
       ORDER BY a.created_at DESC LIMIT 1`,
      [id, employerId],
    );
    application = any.rows[0] || null;
  }

  if (!candidate.searchable && !application) return jsonError('Not found', 404);

  const hide = candidate.hide_phone_until_shortlist !== false;
  const reveal = application ? employerCanSeeCandidatePhone(application.status, hide) : false;
  const hist = decorateHistoryFields(candidate);

  // Email, CV and the per-employer sections follow the "Download Excel + CV" gate: an owned application.
  const linked = Boolean(application);
  let sections = { academics: [], applications: [], offers: [], endorsements: [] };
  try {
    sections = await loadEmployerCandidateSections(candidate.id, employerId, { hasApplication: linked });
  } catch (err) {
    console.error('[employer candidate] sections', err?.message || err);
  }

  const publicCandidate = {
    id: candidate.id,
    /** Needed so employer Message can create/open an ip_message_threads row. */
    user_id: candidate.user_id,
    name: candidate.name,
    college: candidate.college,
    degree: candidate.degree,
    specialization: candidate.specialization,
    city: candidate.city,
    state: candidate.state,
    country: candidate.country || null,
    skills: candidate.skills,
    study_status: candidate.study_status,
    graduation_year: candidate.graduation_year,
    cgpa: candidate.cgpa,
    /** Plain 'YYYY-MM-DD' (DATE column) so the client never shows an ISO timestamp. */
    availability_date: candidate.availability_day || null,
    preferred_work_mode: candidate.preferred_work_mode,
    preferred_locations: textList(candidate.preferred_locations),
    preferred_roles: textList(candidate.preferred_roles),
    ongoing_commitment: candidate.ongoing_commitment ?? null,
    ongoing_commitment_label: commitmentLabel(candidate) || null,
    prior_experience: candidate.prior_experience,
    immediate_start: candidate.immediate_start,
    willing_to_relocate: candidate.willing_to_relocate,
    linkedin_url: candidate.linkedin_url || null,
    github_url: candidate.github_url || null,
    portfolio_url: candidate.portfolio_url || null,
    personal_website: candidate.personal_website || null,
    profile_picture_url: candidate.visible_profile_picture_url || null,
    preferred_hours_start: candidate.preferred_hours_start,
    preferred_hours_end: candidate.preferred_hours_end,
    has_wired_broadband: candidate.has_wired_broadband ?? null,
    has_dedicated_laptop: candidate.has_dedicated_laptop ?? null,
    updated_at: candidate.updated_at,
    searchable: candidate.searchable,
    phone: reveal ? candidate.phone : null,
    phone_hidden: hide && !reveal,
    email: linked ? candidate.email || null : null,
    resume_url: linked ? candidate.resume_url || null : null,
    resume_links: linked ? resumeLinkList(candidate.resume_links) : [],
    contact_gated: !linked,
    academics: sections.academics,
    applications: sections.applications,
    offers: sections.offers,
    endorsements: sections.endorsements,
    ...hist,
  };

  let publicApplication = null;
  if (application) {
    publicApplication = {
      id: application.id,
      internship_id: application.internship_id,
      internship_title: application.internship_title,
      status: application.status,
      match_score: application.match_score,
      answers: application.answers,
      questions_snapshot: application.questions_snapshot,
      screening_disabled: application.screening_disabled,
      created_at: application.created_at,
    };
  }

  return jsonOk({ candidate: publicCandidate, application: publicApplication });
}
