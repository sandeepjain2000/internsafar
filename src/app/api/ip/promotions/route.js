import { randomBytes } from 'crypto';
import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { LINKEDIN_PROMO_CREDITS, LINKEDIN_PROMO_POINTS } from '@/lib/pointsEconomy';
import { notifyUser } from '@/lib/ipNotify';

function promoToken() {
  return `ip_li_${randomBytes(8).toString('hex')}`;
}

export async function GET(request) {
  const { session, error } = await requireSession(['employer', 'superadmin']);
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';

  if (session.user.role === 'superadmin') {
    const params = [];
    const where = ['1=1'];
    if (status) {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    const result = await query(
      `SELECT p.*, i.title, e.company_name, e.work_email, e.website
       FROM ip_linkedin_promotions p
       JOIN ip_internships i ON i.id = p.internship_id
       JOIN ip_employers e ON e.id = p.employer_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC LIMIT 200`,
      params,
    );
    return jsonOk({ items: result.rows, economy: { LINKEDIN_PROMO_POINTS, LINKEDIN_PROMO_CREDITS } });
  }

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonOk({ items: [] });
  const result = await query(
    `SELECT p.*, i.title FROM ip_linkedin_promotions p
     JOIN ip_internships i ON i.id = p.internship_id
     WHERE p.employer_id = $1 ORDER BY p.created_at DESC`,
    [emp.rows[0].id],
  );
  return jsonOk({ items: result.rows, economy: { LINKEDIN_PROMO_POINTS, LINKEDIN_PROMO_CREDITS } });
}

/** Create a LinkedIn promotion with unique token for an internship. */
export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const internshipId = String(body.internshipId || '');
  if (!internshipId) return jsonError('internshipId is required');

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);
  const owns = await query(`SELECT id, title FROM ip_internships WHERE id = $1 AND employer_id = $2`, [internshipId, emp.rows[0].id]);
  if (!owns.rows[0]) return jsonError('Internship not found', 404);

  const open = await query(
    `SELECT id FROM ip_linkedin_promotions WHERE internship_id = $1 AND status IN ('pending','fast_track_pending') LIMIT 1`,
    [internshipId],
  );
  if (open.rows[0]) return jsonError('A promotion is already pending for this posting', 409);

  const id = newId('ip_promo');
  const token = promoToken();
  const origin = process.env.NEXTAUTH_URL || 'https://internship-portal-sigma-mauve.vercel.app';
  const shareUrl = `${origin}/candidate/internships/${internshipId}?promo=${token}`;

  await query(
    `INSERT INTO ip_linkedin_promotions (id, employer_id, internship_id, token, status, share_url)
     VALUES ($1,$2,$3,$4,'pending',$5)`,
    [id, emp.rows[0].id, internshipId, token, shareUrl],
  );

  return jsonOk({
    ok: true,
    id,
    token,
    shareUrl,
    suggestedPostText: `We're hiring for ${owns.rows[0].title}. Apply here: ${shareUrl} (token ${token})`,
  }, 201);
}
