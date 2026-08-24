import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { employerCanSeeCandidatePhone } from '@/lib/ipCandidatePhonePrivacy';
import {
  internshipHistorySelectSql,
  decorateHistoryFields,
} from '@/lib/ipCandidateInternshipHistory';

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

  const cand = await query(
    `SELECT c.id, c.user_id, c.name, c.college, c.degree, c.specialization, c.city, c.state, c.skills,
            c.study_status, c.graduation_year, c.cgpa, c.availability_date, c.show_completed_internships,
            c.preferred_work_mode, c.ongoing_commitment, c.prior_experience, c.immediate_start,
            c.willing_to_relocate, c.linkedin_url, c.searchable, c.updated_at, c.phone,
            c.hide_phone_until_shortlist,
            CASE WHEN c.show_profile_picture THEN c.profile_picture_url ELSE NULL END AS profile_picture_url,
            c.preferred_hours_start, c.preferred_hours_end, c.has_wired_broadband, c.has_dedicated_laptop,
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

  const publicCandidate = {
    id: candidate.id,
    name: candidate.name,
    college: candidate.college,
    degree: candidate.degree,
    specialization: candidate.specialization,
    city: candidate.city,
    state: candidate.state,
    skills: candidate.skills,
    study_status: candidate.study_status,
    graduation_year: candidate.graduation_year,
    cgpa: candidate.cgpa,
    availability_date: candidate.availability_date,
    preferred_work_mode: candidate.preferred_work_mode,
    ongoing_commitment: candidate.ongoing_commitment,
    prior_experience: candidate.prior_experience,
    immediate_start: candidate.immediate_start,
    willing_to_relocate: candidate.willing_to_relocate,
    linkedin_url: candidate.linkedin_url,
    profile_picture_url: candidate.profile_picture_url,
    preferred_hours_start: candidate.preferred_hours_start,
    preferred_hours_end: candidate.preferred_hours_end,
    has_wired_broadband: candidate.has_wired_broadband,
    has_dedicated_laptop: candidate.has_dedicated_laptop,
    updated_at: candidate.updated_at,
    searchable: candidate.searchable,
    phone: reveal ? candidate.phone : null,
    phone_hidden: hide && !reveal,
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
