import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { getNotifyChannels } from '@/lib/ipNotificationPreferences';
import { ensureIpOfferRemindSchema } from '@/lib/ensureIpOfferRemindSchema';
import { ensureIpOfferOnboardingSchema } from '@/lib/ensureIpOfferOnboardingSchema';
import { decorateCandidateOffer } from '@/lib/ipOfferPresentation';
import { maskEmployerName } from '@/lib/ipEmployerIdentity';

function trimOrNull(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

function optionalDate(value) {
  const s = trimOrNull(value);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return { error: 'must be a valid date' };
  return { value: s.slice(0, 10) };
}

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  await ensureIpOfferOnboardingSchema();

  if (session.user.role === 'candidate') {
    const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
    const result = await query(
      `SELECT o.*,
              i.title, i.work_mode, i.location, i.duration_months, i.stipend_inr as internship_stipend_inr,
              i.end_date as internship_end_date, i.show_employer_identity,
              e.company_name, e.user_id as employer_user_id, e.logo_url, e.approval_status,
              e.contact_name, e.contact_designation, e.work_email, e.contact_phone,
              (SELECT t.id FROM ip_message_threads t
                WHERE t.candidate_user_id = $2 AND t.employer_user_id = e.user_id
                  AND (t.internship_id = o.internship_id OR t.internship_id IS NULL)
                ORDER BY t.updated_at DESC LIMIT 1) as thread_id
       FROM ip_offers o
       JOIN ip_internships i ON i.id = o.internship_id
       JOIN ip_employers e ON e.id = o.employer_id
       WHERE o.candidate_id = $1
       ORDER BY o.created_at DESC`,
      [cand.rows[0]?.id || '', session.user.id],
    );
    return jsonOk({
      items: result.rows.map((row) =>
        decorateCandidateOffer({
          ...row,
          company_name: maskEmployerName(row.company_name, row.show_employer_identity !== false),
        }),
      ),
    });
  }

  await ensureIpOfferRemindSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const result = await query(
    `SELECT o.*, i.title, c.name as candidate_name, c.college as candidate_college,
            c.user_id as candidate_user_id
     FROM ip_offers o
     JOIN ip_internships i ON i.id = o.internship_id
     JOIN ip_candidates c ON c.id = o.candidate_id
     WHERE o.employer_id = $1 ORDER BY o.created_at DESC`,
    [emp.rows[0]?.id || ''],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpOfferOnboardingSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const {
    applicationId, candidateId, internshipId, roleTitle, stipendInr, startDate, validUntil, letterUrl, message,
    endDate, onboardingInstructions, mentorName, hrContactEmail, hrContactPhone,
  } = body;
  if (!applicationId && !(candidateId && internshipId)) {
    return jsonError('applicationId, or candidateId + internshipId, is required');
  }

  const startParsed = optionalDate(startDate);
  if (startParsed?.error) return jsonError('startDate must be a valid date');
  const untilParsed = optionalDate(validUntil);
  if (untilParsed?.error) return jsonError('validUntil must be a valid date');
  const endParsed = optionalDate(endDate);
  if (endParsed?.error) return jsonError('endDate must be a valid date');

  const emp = await query(`SELECT id, company_name FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);

  let row;
  if (applicationId) {
    const app = await query(
      `SELECT a.candidate_id, a.internship_id, i.employer_id, i.title, c.user_id as candidate_user_id, c.name as candidate_name
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       JOIN ip_candidates c ON c.id = a.candidate_id
       WHERE a.id = $1`,
      [applicationId],
    );
    row = app.rows[0];
    if (!row || row.employer_id !== emp.rows[0].id) return jsonError('Application not found', 404);
  } else {
    const existingApp = await query(
      `SELECT a.id, a.candidate_id, a.internship_id, i.employer_id, i.title,
              c.user_id as candidate_user_id, c.name as candidate_name
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       JOIN ip_candidates c ON c.id = a.candidate_id
       WHERE a.internship_id = $1 AND a.candidate_id = $2 AND i.employer_id = $3`,
      [internshipId, candidateId, emp.rows[0].id],
    );
    if (!existingApp.rows[0]) {
      return jsonError('Offer requires an existing application. The candidate must apply first.', 400);
    }
    row = { ...existingApp.rows[0], application_id: existingApp.rows[0].id };
  }

  const resolvedApplicationId = applicationId || row.application_id;
  const id = newId('ip_offer');
  await query(
    `INSERT INTO ip_offers (
       id, internship_id, candidate_id, employer_id, application_id, role_title, stipend_inr, start_date, valid_until, letter_url, message,
       end_date, onboarding_instructions, mentor_name, hr_contact_email, hr_contact_phone
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id,
      row.internship_id,
      row.candidate_id,
      row.employer_id,
      resolvedApplicationId,
      roleTitle || row.title,
      stipendInr || null,
      startParsed?.value || null,
      untilParsed?.value || null,
      trimOrNull(letterUrl),
      trimOrNull(message),
      endParsed?.value || null,
      trimOrNull(onboardingInstructions),
      trimOrNull(mentorName),
      trimOrNull(hrContactEmail),
      trimOrNull(hrContactPhone),
    ],
  );
  await query(`UPDATE ip_applications SET status = 'offered', updated_at = now() WHERE id = $1`, [applicationId || row.application_id]);

  await notifyUser({
    userId: row.candidate_user_id,
    title: 'You received an offer!',
    body: `${roleTitle || row.title}${emp.rows[0].company_name ? ` at ${emp.rows[0].company_name}` : ''}`,
    link: '/candidate/offers',
    category: 'offer',
    skipEmail: true,
    meta: {
      offerId: id,
      company: emp.rows[0].company_name || null,
      validUntil: untilParsed?.value || null,
      roleTitle: roleTitle || row.title,
    },
  });
  try {
    const channels = await getNotifyChannels(row.candidate_user_id, 'offer');
    if (channels.email) {
      await sendMail({
        to: (await query(`SELECT email FROM ip_users WHERE id = $1`, [row.candidate_user_id])).rows[0]?.email,
        subject: `Offer letter — ${roleTitle || row.title}`,
        html: `<p>Hi ${row.candidate_name},</p><p>You have received an offer for <strong>${roleTitle || row.title}</strong>. Sign in to review and respond.</p>`,
        text: `You have received an offer for ${roleTitle || row.title}. Sign in to review.`,
      });
    }
  } catch (e) {
    console.error('[offers] email failed', e.message);
  }

  return jsonOk({ ok: true, id }, 201);
}
