import { randomBytes } from 'crypto';
import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { LINKEDIN_PROMO_POINTS } from '@/lib/pointsEconomy';

const CHECK_DELAY_MS = 24 * 60 * 60 * 1000;

function token() {
  return `ip_viral_${randomBytes(8).toString('hex')}`;
}

export async function GET() {
  const { session, error } = await requireSession(['employer', 'superadmin']);
  if (error) return error;

  if (session.user.role === 'superadmin') {
    const result = await query(
      `SELECT v.*, u.name as user_name, u.email, u.referral_code, u.role as user_role,
              e.company_name, e.website
       FROM ip_viral_shares v
       JOIN ip_users u ON u.id = v.user_id
       LEFT JOIN ip_employers e ON e.user_id = u.id
       ORDER BY v.created_at DESC LIMIT 200`,
    );
    return jsonOk({ items: result.rows, rewardPreview: { points: LINKEDIN_PROMO_POINTS } });
  }

  const result = await query(
    `SELECT * FROM ip_viral_shares WHERE user_id = $1 ORDER BY created_at DESC`,
    [session.user.id],
  );
  const user = await query(
    `SELECT points, referral_code FROM ip_users WHERE id = $1`,
    [session.user.id],
  );
  return jsonOk({
    items: result.rows,
    ...user.rows[0],
    rewardPreview: { points: LINKEDIN_PROMO_POINTS },
  });
}

/** Start a viral share (LinkedIn scheduled verify, or other social). */
export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const channel = String(body.channel || 'linkedin').toLowerCase();
  if (!['linkedin', 'whatsapp', 'twitter', 'other'].includes(channel)) {
    return jsonError('Invalid channel');
  }

  const user = await query(`SELECT referral_code, name FROM ip_users WHERE id = $1`, [session.user.id]);
  const code = user.rows[0]?.referral_code;
  if (!code) return jsonError('Referral code missing', 400);

  const origin = process.env.NEXTAUTH_URL || 'https://internship-portal-sigma-mauve.vercel.app';
  const t = token();
  const shareUrl = `${origin}/r/${code}?viral=${t}`;
  const id = newId('ip_viral');
  const isLinkedIn = channel === 'linkedin';
  const checkAfter = isLinkedIn ? new Date(Date.now() + CHECK_DELAY_MS) : null;
  const status = isLinkedIn ? 'scheduled' : 'pending';

  await query(
    `INSERT INTO ip_viral_shares
       (id, user_id, channel, token, share_url, status, check_after, claimed_post_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, session.user.id, channel, t, shareUrl, status, checkAfter, body.claimedPostUrl || null],
  );

  return jsonOk({
    ok: true,
    id,
    token: t,
    shareUrl,
    status,
    checkAfter,
    suggestedPostText: `Looking for interns? Join Internship Portal — ${shareUrl}`,
    note: isLinkedIn
      ? 'LinkedIn share scheduled for Google-search verification in ~24 hours (stub until search API is configured). Paste post URL when ready for fast-track.'
      : 'Share this link on socials. Signups via your link earn referral rewards; LinkedIn posts use the scheduled verifier.',
  }, 201);
}
