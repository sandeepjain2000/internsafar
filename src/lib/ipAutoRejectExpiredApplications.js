import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { personalizeMessageBody } from '@/lib/ipMessageResponseState';
import { notifyUser } from '@/lib/ipNotify';
import { linkThreadToApplicationIfPresent } from '@/lib/ipLinkThreadApplication';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

const SYSTEM_TEMPLATE_ID = 'ip_rej_tpl_system_default';
const DEFAULT_BODY =
  'Hi {{candidate_first_name}}, thank you for applying to {{internship_title}}. The application window has closed and we will not be moving forward at this time. We wish you the best.';

/**
 * After apply_ends_at passes, reject non-shortlisted applicants (applied/pending only)
 * and send a polite in-app message + notification. Idempotent.
 *
 * Performance: only expired listings (LIMIT), only applied/pending (≤100/listing).
 * Not a full-table scan of all applications. Safe for daily cron on shared Neon.
 *
 * @param {{ employerId?: string, limit?: number }} [opts]
 */
export async function processAutoRejectExpiredApplications(opts = {}) {
  await ensureIpWorkbenchSchema();
  const employerId = opts.employerId ? String(opts.employerId) : null;
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);

  const internships = employerId
    ? await query(
        `SELECT i.id, i.title, i.employer_id, e.user_id AS employer_user_id
           FROM ip_internships i
           JOIN ip_employers e ON e.id = i.employer_id
          WHERE i.apply_ends_at IS NOT NULL
            AND i.apply_ends_at < now()
            AND i.employer_id = $1
          ORDER BY i.apply_ends_at ASC
          LIMIT $2`,
        [employerId, limit],
      )
    : await query(
        `SELECT i.id, i.title, i.employer_id, e.user_id AS employer_user_id
           FROM ip_internships i
           JOIN ip_employers e ON e.id = i.employer_id
          WHERE i.apply_ends_at IS NOT NULL
            AND i.apply_ends_at < now()
          ORDER BY i.apply_ends_at ASC
          LIMIT $1`,
        [limit],
      );

  let rejected = 0;
  let messaged = 0;
  let internshipsTouched = 0;

  const tpl = await query(
    `SELECT id, body, version FROM ip_rejection_templates
      WHERE id = $1 OR is_system = true
      ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [SYSTEM_TEMPLATE_ID],
  );
  const template = tpl.rows[0] || { id: SYSTEM_TEMPLATE_ID, body: DEFAULT_BODY, version: 1 };
  const bodyTemplate = String(template.body || DEFAULT_BODY);

  for (const internship of internships.rows) {
    const apps = await query(
      `SELECT a.id, a.candidate_id, c.name, c.user_id AS candidate_user_id
         FROM ip_applications a
         JOIN ip_candidates c ON c.id = a.candidate_id
        WHERE a.internship_id = $1
          AND lower(a.status) IN ('applied', 'pending')
        ORDER BY a.created_at ASC
        LIMIT 100`,
      [internship.id],
    );
    if (!apps.rows.length) continue;
    internshipsTouched += 1;

    for (const row of apps.rows) {
      await query(
        `UPDATE ip_applications
            SET status = 'rejected',
                rejection_template_id = $2,
                rejection_template_version = $3,
                updated_at = now()
          WHERE id = $1 AND lower(status) IN ('applied', 'pending')`,
        [row.id, template.id || null, template.version || 1],
      );

      await query(
        `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
         VALUES ($1,$2,$3,'rejected',$4::jsonb)`,
        [
          newId('ip_aev'),
          row.id,
          internship.employer_user_id,
          JSON.stringify({ auto: true, reason: 'apply_deadline_passed' }),
        ],
      );
      rejected += 1;

      const personalized = personalizeMessageBody(bodyTemplate, {
        candidateName: row.name,
        internshipTitle: internship.title,
      });

      try {
        await sendSystemEmployerMessage({
          employerUserId: internship.employer_user_id,
          internshipId: internship.id,
          candidateUserId: row.candidate_user_id,
          applicationId: row.id,
          body: personalized,
        });
        messaged += 1;
      } catch (err) {
        console.warn('[auto-reject message]', err.message);
      }

      await notifyUser({
        userId: row.candidate_user_id,
        title: 'Application update',
        body: `Your application for ${internship.title} was not taken forward after the deadline.`,
        link: `/candidate/applications?id=${encodeURIComponent(row.id)}`,
        category: 'application',
        meta: { applicationId: row.id },
        skipEmail: false,
      });
    }
  }

  return { ok: true, internshipsTouched, rejected, messaged };
}

async function sendSystemEmployerMessage({
  employerUserId,
  internshipId,
  candidateUserId,
  applicationId,
  body,
}) {
  let thread = await query(
    `SELECT id FROM ip_message_threads
     WHERE internship_id = $1 AND candidate_user_id = $2 AND employer_user_id = $3
     LIMIT 1`,
    [internshipId, candidateUserId, employerUserId],
  );
  let threadId = thread.rows[0]?.id;
  if (!threadId) {
    threadId = newId('ip_th');
    await query(
      `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject, application_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [threadId, internshipId, candidateUserId, employerUserId, 'Application update', applicationId || null],
    );
  }
  await linkThreadToApplicationIfPresent(query, {
    threadId,
    internshipId,
    candidateUserId,
    applicationId,
  });
  const msgId = newId('ip_msg');
  await query(
    `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
    [msgId, threadId, employerUserId, body],
  );
  await query(`UPDATE ip_message_threads SET updated_at = now() WHERE id = $1`, [threadId]);
  return msgId;
}
