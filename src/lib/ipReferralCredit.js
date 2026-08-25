import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { awardPoints, notifyUser } from '@/lib/ipNotify';
import {
  FIRST_APPLICATION_BONUS,
  PROFILE_COMPLETE_POINTS,
  REFERRAL_POINTS,
  referrerRewardsForRole,
} from '@/lib/pointsEconomy';

let ensured = false;

export async function ensureIpReferralExtraSchema() {
  if (ensured) return;
  await query(`ALTER TABLE ip_referrals ADD COLUMN IF NOT EXISTS status_reason TEXT`);
  ensured = true;
}

export function maskCandidateLabel({ userId, name, invalidKind } = {}) {
  const raw = String(userId || '');
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, '');
  const short = (alnum.slice(-4) || '0000').toUpperCase();
  if (invalidKind === 'duplicate_email') return `Candidate #${short} (Duplicate)`;
  if (invalidKind === 'self_referral') return `Candidate #${short} (Self-referral)`;
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || 'Candidate';
  const lastInit = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `Candidate #${short} (${first}${lastInit})`;
}

export function presentReferralForCandidate(row) {
  const status = String(row.status || 'pending').toLowerCase();
  const reason = String(row.status_reason || '');
  const invalidKind = status === 'invalid' ? reason || 'duplicate_email' : null;
  const display_label = maskCandidateLabel({
    userId: row.referred_user_id || row.id,
    name: row.referred_name,
    invalidKind,
  });
  const points = Number(row.points_awarded) || 0;

  if (status === 'completed') {
    const viaForm = String(row.registration_source || '') === 'form';
    return {
      id: row.id,
      created_at: row.created_at,
      status: 'completed',
      filter_key: 'credited',
      status_label: 'Reward Credited',
      status_detail: viaForm
        ? `Form registration approved. +${REFERRAL_POINTS} points credited.`
        : `Registered with Gmail. +${REFERRAL_POINTS} points credited.`,
      points_awarded: points,
      display_label,
    };
  }

  if (status === 'invalid') {
    let status_detail = 'This Gmail is already registered. Duplicate attempts do not earn points.';
    let status_label = 'Invalid / Duplicate';
    if (reason === 'self_referral') {
      status_label = 'Invalid / Self-referral';
      status_detail = 'Own referral code used on an existing account. Ineligible for reward points.';
    } else if (reason === 'registration_rejected') {
      status_detail = 'Form registration was rejected. Ineligible for reward points.';
    }
    return {
      id: row.id,
      created_at: row.created_at,
      status: 'invalid',
      filter_key: 'invalid',
      status_label,
      status_detail,
      points_awarded: 0,
      display_label,
    };
  }

  return {
    id: row.id,
    created_at: row.created_at,
    status: 'pending',
    filter_key: 'awaiting',
    status_label: 'Awaiting Verification',
    status_detail:
      'Account registered. Pending SuperAdmin approval of the form registration before points are credited.',
    points_awarded: points,
    display_label,
  };
}

export function presentLedgerEntry(row, balanceAfter) {
  const reason = String(row.reason || '');
  let meta = row.meta;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  if (!meta || typeof meta !== 'object') meta = {};
  let title = reason.replace(/_/g, ' ');
  let subtitle = '';
  let category = 'Other';
  let categoryKey = 'other';

  if (reason === 'referral_bonus') {
    title = `Referral Reward — ${maskCandidateLabel({ userId: meta.referredUserId })}`;
    subtitle = 'Referred candidate completed registration and verification';
    category = 'Referral Earn';
    categoryKey = 'referral';
  } else if (reason === 'application_spend') {
    const intern = [row.internship_title, row.company_name].filter(Boolean).join(' @ ');
    title = intern ? `Application submitted — ${intern}` : 'Application submitted';
    subtitle = intern ? 'Used standard application credit cost' : 'Used standard application credit cost';
    category = 'Application Spend';
    categoryKey = 'spend';
  } else if (reason === 'default_signup') {
    title = 'Account signup bonus';
    subtitle = 'Welcome bonus credited on registration';
    category = 'Welcome Bonus';
    categoryKey = 'welcome';
  } else if (reason === 'profile_complete') {
    title = 'Complete candidate profile';
    subtitle = 'One-time bonus for adding required profile details';
    category = 'Profile Bonus';
    categoryKey = 'profile';
  } else if (reason === 'first_application_bonus') {
    title = 'First application bonus';
    subtitle = 'One-time bonus for submitting your first application';
    category = 'First Application';
    categoryKey = 'first';
  } else if (reason === 'viral_share_verified' || reason === 'linkedin_promotion_verified') {
    title = 'Share reward';
    subtitle = 'Verified share bonus';
    category = 'Share Bonus';
    categoryKey = 'share';
  }

  subtitle = applyGoneEntityNote(row, meta, subtitle);

  return {
    id: row.id,
    created_at: row.created_at,
    delta: Number(row.delta) || 0,
    reason,
    title,
    subtitle,
    category,
    categoryKey,
    balance_after: balanceAfter,
  };
}

function applyGoneEntityNote(row, meta, subtitle) {
  if (meta.internshipId && !row.internship_title) {
    return 'This internship is no longer available';
  }
  if (meta.applicationId && !row.application_row_id) {
    return 'This application is no longer available';
  }
  return subtitle;
}

export async function recordInvalidReferralAttempt({
  referrerUserId,
  referredUserId,
  referralCode,
  reason,
}) {
  if (!referrerUserId || !referredUserId || !referralCode) return;
  await ensureIpReferralExtraSchema();
  const kind = reason || 'duplicate_email';
  const existing = await query(
    `SELECT id FROM ip_referrals
     WHERE referrer_user_id = $1 AND referred_user_id = $2 AND status = 'invalid'
       AND coalesce(status_reason, '') = $3
     LIMIT 1`,
    [referrerUserId, referredUserId, kind],
  );
  if (existing.rows[0]) return;
  await query(
    `INSERT INTO ip_referrals (
       id, referrer_user_id, referred_user_id, referral_code, status, points_awarded, status_reason
     ) VALUES ($1,$2,$3,$4,'invalid',0,$5)`,
    [newId('ip_ref'), referrerUserId, referredUserId, referralCode, kind],
  );
}

export async function insertPendingReferral({ referrerUserId, referredUserId, referralCode }) {
  await ensureIpReferralExtraSchema();
  const existing = await query(
    `SELECT id FROM ip_referrals
     WHERE referrer_user_id = $1 AND referred_user_id = $2 AND status = 'pending'
     LIMIT 1`,
    [referrerUserId, referredUserId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  await query(
    `INSERT INTO ip_referrals (id, referrer_user_id, referred_user_id, referral_code, status, points_awarded)
     VALUES ($1,$2,$3,$4,'pending',0)`,
    [newId('ip_ref'), referrerUserId, referredUserId, referralCode],
  );
}

export async function creditReferralForReferredUser(referredUserId) {
  if (!referredUserId) return { credited: false };
  await ensureIpReferralExtraSchema();
  const u = await query(`SELECT id, name, referred_by FROM ip_users WHERE id = $1`, [referredUserId]);
  const user = u.rows[0];
  if (!user?.referred_by || user.referred_by === user.id) return { credited: false };

  const existing = await query(
    `SELECT * FROM ip_referrals WHERE referred_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [referredUserId],
  );
  const row = existing.rows[0];
  if (row?.status === 'completed' || row?.status === 'invalid') return { credited: false };

  const referrer = await query(
    `SELECT id, role, referral_code, name FROM ip_users WHERE id = $1`,
    [user.referred_by],
  );
  const ref = referrer.rows[0];
  if (!ref) return { credited: false };

  const rewards = referrerRewardsForRole(ref.role);
  await query(
    `UPDATE ip_users
     SET points = points + $2,
         free_post_credits = free_post_credits + $3,
         application_allowance = application_allowance + $4,
         updated_at = now()
     WHERE id = $1`,
    [ref.id, rewards.points, rewards.freePostCredits, rewards.applicationAllowance],
  );
  await query(
    `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
     VALUES ($1,$2,$3,'referral_bonus',$4::jsonb)`,
    [newId('ip_pts'), ref.id, rewards.points, JSON.stringify({ referredUserId })],
  );
  if (row) {
    await query(
      `UPDATE ip_referrals
       SET status = 'completed', points_awarded = $2, status_reason = NULL
       WHERE id = $1`,
      [row.id, rewards.points],
    );
  } else {
    await query(
      `INSERT INTO ip_referrals (id, referrer_user_id, referred_user_id, referral_code, status, points_awarded)
       VALUES ($1,$2,$3,$4,'completed',$5)`,
      [newId('ip_ref'), ref.id, referredUserId, ref.referral_code, rewards.points],
    );
  }
  await notifyUser({
    userId: ref.id,
    title: 'Referral bonus earned',
    body: `A referred candidate was approved. You earned +${rewards.points} points.`,
    link: ref.role === 'employer' ? '/employer/referral' : '/candidate/referral',
    category: 'referral',
  }).catch(() => {});
  return { credited: true };
}

export async function invalidateReferralForReferredUser(
  referredUserId,
  reason = 'registration_rejected',
) {
  await ensureIpReferralExtraSchema();
  await query(
    `UPDATE ip_referrals
     SET status = 'invalid', points_awarded = 0, status_reason = $2
     WHERE referred_user_id = $1 AND status = 'pending'`,
    [referredUserId, reason],
  );
}

export async function awardPointsOnce({ userId, delta, reason, meta = {} }) {
  const existing = await query(
    `SELECT id FROM ip_points_ledger WHERE user_id = $1 AND reason = $2 LIMIT 1`,
    [userId, reason],
  );
  if (existing.rows[0]) return { awarded: false };
  await awardPoints({ userId, delta, reason, meta });
  await query(`UPDATE ip_users SET updated_at = now() WHERE id = $1`, [userId]);
  return { awarded: true };
}

export async function maybeAwardProfileCompleteBonus(userId) {
  const row = await query(`SELECT profile_complete FROM ip_users WHERE id = $1`, [userId]);
  if (!row.rows[0]?.profile_complete) return { awarded: false };
  return awardPointsOnce({
    userId,
    delta: PROFILE_COMPLETE_POINTS,
    reason: 'profile_complete',
    meta: { source: 'candidate_profile' },
  });
}

export async function maybeAwardFirstApplicationBonus(userId, applicationId) {
  return awardPointsOnce({
    userId,
    delta: FIRST_APPLICATION_BONUS,
    reason: 'first_application_bonus',
    meta: { applicationId },
  });
}

export async function maybeBackfillFirstApplicationBonus(userId) {
  const existing = await query(
    `SELECT id FROM ip_points_ledger WHERE user_id = $1 AND reason = 'first_application_bonus' LIMIT 1`,
    [userId],
  );
  if (existing.rows[0]) return { awarded: false };
  const apps = await query(
    `SELECT a.id
     FROM ip_applications a
     JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE c.user_id = $1
     ORDER BY a.created_at ASC
     LIMIT 1`,
    [userId],
  );
  if (!apps.rows[0]) return { awarded: false };
  return maybeAwardFirstApplicationBonus(userId, apps.rows[0].id);
}

/** Catch form-path referrals created before pending rows were stored. */
export async function syncReferralHistoryForReferrer(referrerId) {
  if (!referrerId) return;
  await ensureIpReferralExtraSchema();
  const referrer = await query(`SELECT referral_code FROM ip_users WHERE id = $1`, [referrerId]);
  const code = referrer.rows[0]?.referral_code;
  if (!code) return;

  const pending = await query(
    `SELECT u.id
     FROM ip_users u
     WHERE u.referred_by = $1
       AND u.registration_source = 'form'
       AND u.form_approval_status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM ip_referrals r WHERE r.referred_user_id = u.id)`,
    [referrerId],
  );
  for (const row of pending.rows) {
    await insertPendingReferral({
      referrerUserId: referrerId,
      referredUserId: row.id,
      referralCode: code,
    });
  }

  const approved = await query(
    `SELECT u.id
     FROM ip_users u
     WHERE u.referred_by = $1
       AND coalesce(u.form_approval_status, '') = 'approved'
       AND NOT EXISTS (SELECT 1 FROM ip_referrals r WHERE r.referred_user_id = u.id)`,
    [referrerId],
  );
  for (const row of approved.rows) {
    await creditReferralForReferredUser(row.id).catch(() => {});
  }
}
