import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { personalizeMessageBody } from '@/lib/ipMessageResponseState';
import { notifyUser } from '@/lib/ipNotify';

async function ownedApps(employerId, internshipId, applicationIds) {
  const result = await query(
    `SELECT a.id, a.candidate_id, a.status, a.match_score, a.screening_disabled, a.created_at, a.answers,
            c.name, c.email, c.college, c.degree, c.city, c.skills, c.user_id as candidate_user_id,
            i.title, i.employer_id
     FROM ip_applications a
     JOIN ip_candidates c ON c.id = a.candidate_id
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.internship_id = $2 AND a.id = ANY($3::text[])`,
    [employerId, internshipId, applicationIds],
  );
  return result.rows;
}

export async function POST(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id: internshipId } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const action = String(body.action || '');
  const applicationIds = Array.isArray(body.applicationIds)
    ? body.applicationIds.map(String).filter(Boolean)
    : [];
  if (!applicationIds.length) return jsonError('Select at least one application');
  if (applicationIds.length > 100) return jsonError('Too many applications selected', 400);

  const rows = await ownedApps(emp.rows[0].id, internshipId, applicationIds);
  if (!rows.length) return jsonError('No matching applications', 404);

  if (action === 'shortlist' || action === 'reject') {
    const nextStatus = action === 'shortlist' ? 'shortlisted' : 'rejected';
    let template = null;
    if (action === 'reject' && body.sendMessage && body.templateId) {
      const tpl = await query(
        `SELECT * FROM ip_rejection_templates
         WHERE id = $1 AND (is_system = true OR employer_id = $2)`,
        [body.templateId, emp.rows[0].id],
      );
      template = tpl.rows[0] || null;
    }
    let updated = 0;
    for (const row of rows) {
      await query(
        `UPDATE ip_applications SET status = $2,
           rejection_template_id = $3, rejection_template_version = $4, updated_at = now()
         WHERE id = $1`,
        [
          row.id,
          nextStatus,
          action === 'reject' && template ? template.id : null,
          action === 'reject' && template ? template.version : null,
        ],
      );
      await query(
        `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [
          newId('ip_aev'),
          row.id,
          session.user.id,
          nextStatus,
          JSON.stringify({ bulk: true, templateId: template?.id || null }),
        ],
      );
      if (action === 'reject' && body.sendMessage && template) {
        const personalized = personalizeMessageBody(template.body, {
          candidateName: row.name,
          internshipTitle: row.title,
        });
        await sendEmployerMessage({
          session,
          employerId: emp.rows[0].id,
          internshipId,
          candidateUserId: row.candidate_user_id,
          body: personalized,
          applicationId: row.id,
        });
      }
      updated += 1;
    }
    return jsonOk({ ok: true, updated, action: nextStatus });
  }

  if (action === 'add_to_list' || action === 'remove_from_list') {
    const listId = String(body.listId || '');
    const list = await query(
      `SELECT id FROM ip_employer_lists WHERE id = $1 AND employer_id = $2`,
      [listId, emp.rows[0].id],
    );
    if (!list.rows[0]) return jsonError('List not found', 404);
    let n = 0;
    for (const row of rows) {
      if (action === 'add_to_list') {
        await query(
          `INSERT INTO ip_employer_list_members (id, list_id, application_id)
           VALUES ($1,$2,$3) ON CONFLICT (list_id, application_id) DO NOTHING`,
          [newId('ip_lm'), listId, row.id],
        );
      } else {
        await query(
          `DELETE FROM ip_employer_list_members WHERE list_id = $1 AND application_id = $2`,
          [listId, row.id],
        );
      }
      n += 1;
    }
    return jsonOk({ ok: true, updated: n, action });
  }

  if (action === 'message') {
    const bodyText = String(body.body || '').trim();
    if (!bodyText) return jsonError('Message body is required');
    const jobId = newId('ip_bmj');
    await query(
      `INSERT INTO ip_bulk_message_jobs (id, employer_id, internship_id, body_template, status)
       VALUES ($1,$2,$3,$4,'running')`,
      [jobId, emp.rows[0].id, internshipId, bodyText],
    );
    let success = 0;
    let failed = 0;
    const failures = [];
    // Simple rate limit: process sequentially with small batches
    for (const row of rows) {
      const personalized = personalizeMessageBody(bodyText, {
        candidateName: row.name,
        internshipTitle: row.title,
      });
      const recipId = newId('ip_bmr');
      try {
        const msgId = await sendEmployerMessage({
          session,
          employerId: emp.rows[0].id,
          internshipId,
          candidateUserId: row.candidate_user_id,
          body: personalized,
          applicationId: row.id,
        });
        await query(
          `INSERT INTO ip_bulk_message_recipients
             (id, job_id, application_id, candidate_user_id, personalized_body, status, message_id)
           VALUES ($1,$2,$3,$4,$5,'sent',$6)`,
          [recipId, jobId, row.id, row.candidate_user_id, personalized, msgId],
        );
        success += 1;
      } catch (e) {
        failed += 1;
        failures.push({ applicationId: row.id, error: e.message });
        await query(
          `INSERT INTO ip_bulk_message_recipients
             (id, job_id, application_id, candidate_user_id, personalized_body, status, error)
           VALUES ($1,$2,$3,$4,$5,'failed',$6)`,
          [recipId, jobId, row.id, row.candidate_user_id, personalized, e.message],
        );
      }
    }
    await query(
      `UPDATE ip_bulk_message_jobs SET status = 'done', updated_at = now() WHERE id = $1`,
      [jobId],
    );
    return jsonOk({ ok: true, jobId, success, failed, failures });
  }

  if (action === 'retry_failed_messages') {
    const jobId = String(body.jobId || '');
    const failed = await query(
      `SELECT r.*, a.candidate_id, c.name, c.user_id as candidate_user_id, i.title
       FROM ip_bulk_message_recipients r
       JOIN ip_applications a ON a.id = r.application_id
       JOIN ip_candidates c ON c.id = a.candidate_id
       JOIN ip_internships i ON i.id = a.internship_id
       WHERE r.job_id = $1 AND r.status = 'failed' AND i.employer_id = $2`,
      [jobId, emp.rows[0].id],
    );
    let success = 0;
    let stillFailed = 0;
    for (const row of failed.rows) {
      try {
        const msgId = await sendEmployerMessage({
          session,
          employerId: emp.rows[0].id,
          internshipId,
          candidateUserId: row.candidate_user_id,
          body: row.personalized_body,
          applicationId: row.application_id,
        });
        await query(
          `UPDATE ip_bulk_message_recipients SET status = 'sent', message_id = $2, error = NULL, updated_at = now() WHERE id = $1`,
          [row.id, msgId],
        );
        success += 1;
      } catch (e) {
        stillFailed += 1;
        await query(
          `UPDATE ip_bulk_message_recipients SET error = $2, updated_at = now() WHERE id = $1`,
          [row.id, e.message],
        );
      }
    }
    return jsonOk({ ok: true, success, failed: stillFailed });
  }

  if (action === 'export') {
    const includeResumes = Boolean(body.includeResumes);
    const {
      createExportJob,
      processExportJob,
      shouldUseBackgroundJob,
      loadAppsForExport,
      buildApplicantExportPackage,
    } = await import('@/lib/ipApplicantExport');

    if (shouldUseBackgroundJob(applicationIds, includeResumes) || body.async) {
      const jobId = await createExportJob({
        employerId: emp.rows[0].id,
        internshipId,
        userId: session.user.id,
        applicationIds,
        includeResumes,
      });
      // Fire-and-forget on long-lived Node; client polls job status
      void processExportJob(jobId).catch((e) => console.error('[export job]', e.message));
      return jsonOk({
        ok: true,
        async: true,
        jobId,
        message: 'Export started. Poll job status for progress and download.',
      });
    }

    const fullRows = await loadAppsForExport(emp.rows[0].id, internshipId, applicationIds);
    const pack = await buildApplicantExportPackage(fullRows, { includeResumes });
    await query(
      `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
       VALUES ($1,$2,$3,'export',$4::jsonb)`,
      [
        newId('ip_aev'),
        applicationIds[0],
        session.user.id,
        JSON.stringify({
          count: applicationIds.length,
          format: includeResumes ? 'zip' : 'csv',
          resumeCount: pack.resumeCount,
        }),
      ],
    );
    return jsonOk({
      ok: true,
      async: false,
      format: includeResumes ? 'zip' : 'csv',
      filename: pack.filename,
      csv: pack.csv,
      zipBase64: pack.zipBase64,
      resumeCount: pack.resumeCount,
      skippedResumes: pack.skipped,
    });
  }

  if (action === 'schedule_interview') {
    const interviewAt = body.interviewAt;
    if (!interviewAt) return jsonError('interviewAt is required');
    let n = 0;
    for (const row of rows) {
      await query(
        `UPDATE ip_applications SET status = 'interviewing', interview_at = $2, interview_meet_url = $3, updated_at = now()
         WHERE id = $1`,
        [row.id, interviewAt, body.interviewMeetUrl || null],
      );
      n += 1;
    }
    return jsonOk({ ok: true, updated: n });
  }

  return jsonError(`Unknown action: ${action}`);
}

async function sendEmployerMessage({ session, internshipId, candidateUserId, body, applicationId }) {
  let thread = await query(
    `SELECT id FROM ip_message_threads
     WHERE internship_id = $1 AND candidate_user_id = $2 AND employer_user_id = $3
     LIMIT 1`,
    [internshipId, candidateUserId, session.user.id],
  );
  let threadId = thread.rows[0]?.id;
  if (!threadId) {
    threadId = newId('ip_th');
    await query(
      `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
       VALUES ($1,$2,$3,$4,$5)`,
      [threadId, internshipId, candidateUserId, session.user.id, 'Application message'],
    );
  }
  const msgId = newId('ip_msg');
  await query(
    `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
    [msgId, threadId, session.user.id, body],
  );
  await query(`UPDATE ip_message_threads SET updated_at = now() WHERE id = $1`, [threadId]);
  if (applicationId) {
    await query(
      `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
       VALUES ($1,$2,$3,'message',$4::jsonb)`,
      [newId('ip_aev'), applicationId, session.user.id, JSON.stringify({ messageId: msgId })],
    );
  }
  await notifyUser({
    userId: candidateUserId,
    title: 'New message',
    body: 'You have a new message from an employer',
    link: '/candidate/messages',
    category: 'message',
  });
  return msgId;
}
