import { query } from '@/lib/db';
import { ensureIpMessageArchiveSchema } from '@/lib/ensureIpMessageArchiveSchema';
import { ensureIpMessageAttachmentSchema } from '@/lib/ensureIpMessageAttachmentSchema';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';

export async function ensureIpMessageInboxSchema() {
  await ensureIpMessageArchiveSchema();
  await ensureIpMessageAttachmentSchema();
  await ensureIpApplicationInterviewSchema();
}

export const THREAD_LAST_MESSAGE_SQL = `(SELECT CASE
  WHEN NULLIF(TRIM(m.body), '') IS NOT NULL THEN m.body
  WHEN NULLIF(TRIM(COALESCE(m.attachment_name, '')), '') IS NOT NULL THEN m.attachment_name
  ELSE ''
END FROM ip_messages m WHERE m.thread_id = t.id ORDER BY m.sent_at DESC LIMIT 1)`;

export const THREAD_SELECT_CORE = `
            t.*,
            i.title as internship_title,
            i.stipend_inr as internship_stipend_inr,
            i.work_mode as internship_work_mode,
            i.location as internship_location,
            i.duration_months as internship_duration_months,
            cu.name as candidate_name,
            eu.name as employer_name,
            e.company_name,
            e.approval_status as employer_approval_status,
            c.college as candidate_college,
            c.cgpa as candidate_cgpa,
            c.degree as candidate_degree,
            c.specialization as candidate_specialization,
            c.resume_url as candidate_resume_url,
            app.id as application_id,
            app.status as application_status,
            app.interview_at,
            app.interview_meet_url,
            off.id as offer_id,
            off.status as offer_status,
            off.stipend_inr as offer_stipend_inr,
            off.start_date as offer_start_date,
            off.role_title as offer_role_title`;

export const THREAD_JOINS = `
     LEFT JOIN ip_internships i ON i.id = t.internship_id
     LEFT JOIN ip_users cu ON cu.id = t.candidate_user_id
     LEFT JOIN ip_users eu ON eu.id = t.employer_user_id
     LEFT JOIN ip_employers e ON e.user_id = t.employer_user_id
     LEFT JOIN ip_candidates c ON c.user_id = t.candidate_user_id
     LEFT JOIN ip_applications app ON app.internship_id = t.internship_id AND app.candidate_id = c.id
     LEFT JOIN LATERAL (
       SELECT o.id, o.status, o.stipend_inr, o.start_date, o.role_title
       FROM ip_offers o
       WHERE o.candidate_id = c.id AND o.internship_id = t.internship_id
       ORDER BY o.created_at DESC
       LIMIT 1
     ) off ON true`;

export async function loadMessageThread(id, uid) {
  await ensureIpMessageInboxSchema();
  const result = await query(
    `SELECT ${THREAD_SELECT_CORE},
            ${THREAD_LAST_MESSAGE_SQL} as last_message
     FROM ip_message_threads t
     ${THREAD_JOINS}
     WHERE t.id = $1 AND (t.candidate_user_id = $2 OR t.employer_user_id = $2)`,
    [id, uid],
  );
  return result.rows[0] || null;
}
