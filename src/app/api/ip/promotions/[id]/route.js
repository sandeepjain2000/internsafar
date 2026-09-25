import { query } from '@/lib/db';
import { transaction } from '@/lib/transaction';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { LINKEDIN_PROMO_POINTS } from '@/lib/pointsEconomy';
import { notifyUser } from '@/lib/ipNotify';
import { isLinkedInPostUrl } from '@/lib/ipLinkedInShareUrl';

async function loadPromo(id) {
  const result = await query(
    `SELECT p.*, e.user_id as employer_user_id, i.title
     FROM ip_linkedin_promotions p
     JOIN ip_employers e ON e.id = p.employer_id
     JOIN ip_internships i ON i.id = p.internship_id
     WHERE p.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/** Atomically claim + credit once; no-op if already rewarded. */
async function rewardPromo(promo) {
  const awarded = await transaction(async (client) => {
    const claim = await client.query(
      `UPDATE ip_linkedin_promotions
       SET status = 'rewarded',
           points_awarded = $2,
           credits_awarded = 0,
           updated_at = now()
       WHERE id = $1
         AND status IS DISTINCT FROM 'rewarded'
         AND coalesce(points_awarded, 0) = 0
       RETURNING id`,
      [promo.id, LINKEDIN_PROMO_POINTS],
    );
    if (!claim.rows[0]) return false;
    await client.query(
      `UPDATE ip_users SET points = points + $2, updated_at = now()
       WHERE id = $1`,
      [promo.employer_user_id, LINKEDIN_PROMO_POINTS],
    );
    await client.query(
      `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
       VALUES ($1,$2,$3,'linkedin_promotion_verified',$4::jsonb)`,
      [
        newId('ip_pts'),
        promo.employer_user_id,
        LINKEDIN_PROMO_POINTS,
        JSON.stringify({ promoId: promo.id }),
      ],
    );
    return true;
  });
  if (!awarded) return false;
  await notifyUser({
    userId: promo.employer_user_id,
    title: 'Posting Share Verified — Reward Added',
    body: `Rewards Added For ${promo.title}: +${LINKEDIN_PROMO_POINTS} Points.`,
    link: '/employer/internships',
    category: 'system',
    forceEmail: true,
  });
  return true;
}

/** Employer: submit LinkedIn post URL. SuperAdmin: verify/fail. */
export async function PATCH(request, { params }) {
  const { session, error } = await requireSession(['employer', 'superadmin']);
  if (error) return error;
  const { id } = await params;
  const promo = await loadPromo(id);
  if (!promo) return jsonError('Not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  if (session.user.role === 'employer') {
    if (promo.employer_user_id !== session.user.id) return jsonError('Forbidden', 403);
    const postUrl = String(body.claimedPostUrl || body.claimed_post_url || '').trim();
    if (!postUrl) return jsonError('LinkedIn post URL is required for verification');
    if (!isLinkedInPostUrl(postUrl)) {
      return jsonError('Submit a valid LinkedIn post URL (linkedin.com)');
    }
    await query(
      `UPDATE ip_linkedin_promotions
       SET claimed_post_url = $2, status = 'fast_track_pending', updated_at = now()
       WHERE id = $1`,
      [id, postUrl],
    );
    return jsonOk({ ok: true, status: 'fast_track_pending' });
  }

  const action = String(body.action || '').toLowerCase();
  const notes = body.notes || null;
  if (!['verify', 'fail'].includes(action)) return jsonError('action must be verify or fail');

  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [String(id)].filter(Boolean);
  let processed = 0;
  let skippedNoUrl = 0;
  for (const promoId of ids) {
    const row = await loadPromo(promoId);
    if (!row) continue;
    if (action === 'fail') {
      await query(
        `UPDATE ip_linkedin_promotions
         SET status = 'failed', review_notes = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
         WHERE id = $1 AND status IS DISTINCT FROM 'rewarded'`,
        [promoId, notes, session.user.id],
      );
      await notifyUser({
        userId: row.employer_user_id,
        title: 'Posting Share Not Verified',
        body: notes || `Could Not Verify Posting Share For ${row.title}.`,
        link: '/employer/internships',
        category: 'system',
        forceEmail: true,
      });
      processed += 1;
    } else {
      const claimed = String(row.claimed_post_url || '').trim();
      if (!claimed || !isLinkedInPostUrl(claimed)) {
        skippedNoUrl += 1;
        continue;
      }
      await query(
        `UPDATE ip_linkedin_promotions
         SET status = 'verified', review_notes = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
         WHERE id = $1 AND status IS DISTINCT FROM 'rewarded'`,
        [promoId, notes, session.user.id],
      );
      await rewardPromo(await loadPromo(promoId));
      processed += 1;
    }
  }
  if (!processed) {
    if (skippedNoUrl) {
      return jsonError('Cannot verify without a valid LinkedIn post URL on the claim', 400);
    }
    return jsonError('Not found', 404);
  }
  return jsonOk({
    ok: true,
    processed,
    skippedNoUrl,
    status: action === 'fail' ? 'failed' : 'rewarded',
  });
}
