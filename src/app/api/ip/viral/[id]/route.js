import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { LINKEDIN_PROMO_POINTS } from '@/lib/pointsEconomy';
import { notifyUser } from '@/lib/ipNotify';

async function loadShare(id) {
  const result = await query(
    `SELECT v.*, u.name as user_name FROM ip_viral_shares v JOIN ip_users u ON u.id = v.user_id WHERE v.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function reward(share) {
  await query(
    `UPDATE ip_users SET points = points + $2, updated_at = now() WHERE id = $1`,
    [share.user_id, LINKEDIN_PROMO_POINTS],
  );
  await query(
    `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
     VALUES ($1,$2,$3,'viral_share_verified',$4::jsonb)`,
    [newId('ip_pts'), share.user_id, LINKEDIN_PROMO_POINTS, JSON.stringify({ shareId: share.id, channel: share.channel })],
  );
  await query(
    `UPDATE ip_viral_shares
     SET status = 'rewarded', points_awarded = $2, credits_awarded = 0, search_hit = true, updated_at = now()
     WHERE id = $1`,
    [share.id, LINKEDIN_PROMO_POINTS],
  );
  await notifyUser({
    userId: share.user_id,
    title: 'Viral share verified',
    body: `+${LINKEDIN_PROMO_POINTS} points added.`,
    link: '/employer/viral',
    category: 'system',
  });
}

/**
 * Stub Google search for a share URL/token.
 * Real Serp/Google CSE plugs in when GOOGLE_SEARCH_API_KEY (+ CX) are set.
 * Default: no live hit — status moves to searching/failed notes for SA unless stub_hit=1.
 */
async function stubGoogleSearch(share) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
  const queryText = share.share_url || share.token;

  if (apiKey && cx) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(`"${queryText}"`)}`;
      const res = await fetch(url);
      const data = await res.json();
      const hit = Array.isArray(data.items) && data.items.length > 0;
      return { hit, notes: hit ? `Google CSE hits: ${data.items.length}` : 'Google CSE: no results' };
    } catch (e) {
      return { hit: false, notes: `Google CSE error: ${e.message}` };
    }
  }

  // Explicit test stub
  if (process.env.VIRAL_SEARCH_STUB === 'hit') {
    return { hit: true, notes: 'VIRAL_SEARCH_STUB=hit (test mode)' };
  }

  return {
    hit: false,
    notes: 'Google search stub: no API key. Left for SuperAdmin review or set VIRAL_SEARCH_STUB=hit / GOOGLE_SEARCH_API_KEY.',
  };
}

/** Employer: paste LinkedIn URL. SuperAdmin: verify/fail. */
export async function PATCH(request, { params }) {
  const { session, error } = await requireSession(['employer', 'superadmin']);
  if (error) return error;
  const { id } = await params;
  const share = await loadShare(id);
  if (!share) return jsonError('Not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  if (session.user.role === 'employer') {
    if (share.user_id !== session.user.id) return jsonError('Forbidden', 403);
    const postUrl = String(body.claimedPostUrl || '').trim();
    if (!postUrl) return jsonError('claimedPostUrl required');
    await query(
      `UPDATE ip_viral_shares SET claimed_post_url = $2, status = 'fast_track_pending', updated_at = now() WHERE id = $1`,
      [id, postUrl],
    );
    return jsonOk({ ok: true, status: 'fast_track_pending' });
  }

  const action = String(body.action || '').toLowerCase();
  if (action === 'run_search') {
    const result = await stubGoogleSearch(share);
    await query(
      `UPDATE ip_viral_shares
       SET last_checked_at = now(), search_hit = $2, search_notes = $3,
           status = CASE WHEN $2 THEN 'verified' ELSE status END, updated_at = now()
       WHERE id = $1`,
      [id, result.hit, result.notes],
    );
    if (result.hit) {
      await reward(await loadShare(id));
      return jsonOk({ ok: true, status: 'rewarded', ...result });
    }
    return jsonOk({ ok: true, status: share.status, ...result });
  }

  if (action === 'verify') {
    await query(
      `UPDATE ip_viral_shares SET status = 'verified', reviewed_by = $2, reviewed_at = now(), search_notes = $3, updated_at = now() WHERE id = $1`,
      [id, session.user.id, body.notes || 'SuperAdmin verified'],
    );
    await reward(await loadShare(id));
    return jsonOk({ ok: true, status: 'rewarded' });
  }

  if (action === 'fail') {
    await query(
      `UPDATE ip_viral_shares SET status = 'failed', reviewed_by = $2, reviewed_at = now(), search_notes = $3, updated_at = now() WHERE id = $1`,
      [id, session.user.id, body.notes || 'Not found / rejected'],
    );
    return jsonOk({ ok: true, status: 'failed' });
  }

  return jsonError('action must be run_search|verify|fail');
}
