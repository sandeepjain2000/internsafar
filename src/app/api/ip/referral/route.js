import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import {
  ensureIpReferralExtraSchema,
  maybeAwardProfileCompleteBonus,
  maybeBackfillFirstApplicationBonus,
  presentReferralForCandidate,
  syncReferralHistoryForReferrer,
} from '@/lib/ipReferralCredit';

export async function GET(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  await ensureIpFormRegistrationSchema();
  await ensureIpReferralExtraSchema();
  if (session.user.role === 'candidate') {
    await maybeAwardProfileCompleteBonus(session.user.id).catch(() => {});
    await maybeBackfillFirstApplicationBonus(session.user.id).catch(() => {});
  }
  await syncReferralHistoryForReferrer(session.user.id).catch(() => {});

  const user = await query(
    `SELECT referral_code, points, free_post_credits, application_allowance, profile_complete
     FROM ip_users WHERE id = $1`,
    [session.user.id],
  );
  const referrals = await query(
    `SELECT r.*, u.name as referred_name, u.email as referred_email, u.role as referred_role,
            u.registration_source,
            e.company_name as referred_company,
            NULLIF(split_part(COALESCE(u.email, ''), '@', 2), '') as referred_domain
     FROM ip_referrals r
     LEFT JOIN ip_users u ON u.id = r.referred_user_id
     LEFT JOIN ip_employers e ON e.user_id = u.id
     WHERE r.referrer_user_id = $1
     ORDER BY r.created_at DESC`,
    [session.user.id],
  );
  const earnedReasons = await query(
    `SELECT reason FROM ip_points_ledger
     WHERE user_id = $1 AND reason IN ('profile_complete', 'first_application_bonus')`,
    [session.user.id],
  );
  const earnedSet = new Set(earnedReasons.rows.map((r) => r.reason));
  const origin = process.env.NEXTAUTH_URL || new URL(request.url).origin;
  const code = user.rows[0]?.referral_code;
  const path = session.user.role === 'employer' ? '/register/employer' : '/register/candidate';

  const isCandidate = session.user.role === 'candidate';
  const presented = isCandidate
    ? referrals.rows.map(presentReferralForCandidate)
    : referrals.rows;

  let postingShareRewards = [];
  if (!isCandidate) {
    const shareRows = await query(
      `SELECT l.id, l.delta AS points_awarded, l.created_at, l.meta,
              coalesce(i.title, 'Posting share') AS posting_title
       FROM ip_points_ledger l
       LEFT JOIN ip_linkedin_promotions p ON p.id = (l.meta->>'promoId')
       LEFT JOIN ip_internships i ON i.id = p.internship_id
       WHERE l.user_id = $1 AND l.reason = 'linkedin_promotion_verified'
       ORDER BY l.created_at DESC
       LIMIT 100`,
      [session.user.id],
    );
    postingShareRewards = shareRows.rows.map((r) => ({
      id: r.id,
      kind: 'posting_share',
      posting_title: r.posting_title,
      points_awarded: r.points_awarded,
      status: 'completed',
      created_at: r.created_at,
    }));
  }

  return jsonOk({
    ...user.rows[0],
    referralLink: code ? `${origin}${path}?ref=${code}` : null,
    viralLink: code ? `${origin}/r/${code}` : null,
    referrals: presented,
    postingShareRewards,
    waysEarned: {
      profileComplete: earnedSet.has('profile_complete'),
      firstApplication: earnedSet.has('first_application_bonus'),
    },
  });
}
