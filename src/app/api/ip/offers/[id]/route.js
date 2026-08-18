import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { offerIsExpired } from '@/lib/ipOfferPresentation';

export async function PATCH(request, { params }) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const status = body.status === 'accepted' ? 'accepted' : body.status === 'declined' ? 'declined' : null;
  if (!status) return jsonError('status must be accepted or declined');

  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  const offer = await query(
    `SELECT o.*, i.title, e.user_id as employer_user_id, e.company_name FROM ip_offers o
     JOIN ip_internships i ON i.id = o.internship_id
     JOIN ip_employers e ON e.id = o.employer_id
     WHERE o.id = $1 AND o.candidate_id = $2`,
    [id, cand.rows[0]?.id],
  );
  const row = offer.rows[0];
  if (!row) return jsonError('Offer not found', 404);
  if (offerIsExpired(row)) return jsonError('This offer has expired');
  if (String(row.status || '').toLowerCase() !== 'pending') {
    return jsonError('This offer can no longer be accepted or declined');
  }

  await query(`UPDATE ip_offers SET status = $2, responded_at = now() WHERE id = $1`, [id, status]);
  await query(
    `UPDATE ip_applications SET status = $2, updated_at = now() WHERE internship_id = $1 AND candidate_id = $3`,
    [row.internship_id, status === 'accepted' ? 'hired' : 'declined_offer', row.candidate_id],
  );

  await notifyUser({
    userId: row.employer_user_id,
    title: `Offer ${status}`,
    body: `${row.title}`,
    link: '/employer/offers',
    category: 'application',
  });

  try {
    const emails = await Promise.all([
      query(`SELECT email FROM ip_users WHERE id = $1`, [session.user.id]),
      query(`SELECT email FROM ip_users WHERE id = $1`, [row.employer_user_id]),
    ]);
    const [candEmail, empEmail] = emails.map((r) => r.rows[0]?.email);
    await sendMail({
      to: [candEmail, empEmail].filter(Boolean).join(','),
      subject: `Offer ${status} — ${row.title}`,
      html: `<p>The offer for <strong>${row.title}</strong> at ${row.company_name} was <strong>${status}</strong> by the candidate.</p>`,
      text: `Offer ${status} for ${row.title}`,
    });
  } catch (e) {
    console.error('[offer respond] email failed', e.message);
  }

  return jsonOk({ ok: true });
}
