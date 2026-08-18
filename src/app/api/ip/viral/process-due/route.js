import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { LINKEDIN_PROMO_POINTS } from '@/lib/pointsEconomy';
import { notifyUser } from '@/lib/ipNotify';

/**
 * Process LinkedIn viral shares whose check_after has passed.
 * Callable by SuperAdmin or CRON_SECRET header.
 * Uses Google CSE when configured; otherwise records stub notes and leaves for SA / VIRAL_SEARCH_STUB.
 */
export async function POST(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const { error } = await requireSession(['superadmin']);
    if (error) return error;
  }

  const due = await query(
    `SELECT * FROM ip_viral_shares
     WHERE channel = 'linkedin'
       AND status IN ('scheduled', 'pending')
       AND check_after IS NOT NULL AND check_after <= now()
     ORDER BY check_after ASC LIMIT 50`,
  );

  const results = [];
  for (const share of due.rows) {
    await query(`UPDATE ip_viral_shares SET status = 'searching', last_checked_at = now(), updated_at = now() WHERE id = $1`, [share.id]);

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;
    let hit = false;
    let notes = '';

    if (apiKey && cx) {
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(`"${share.share_url}"`)}`;
        const res = await fetch(url);
        const data = await res.json();
        hit = Array.isArray(data.items) && data.items.length > 0;
        notes = hit ? `CSE hits ${data.items.length}` : 'CSE no results';
      } catch (e) {
        notes = `CSE error: ${e.message}`;
      }
    } else if (process.env.VIRAL_SEARCH_STUB === 'hit') {
      hit = true;
      notes = 'VIRAL_SEARCH_STUB=hit';
    } else {
      notes = 'Stub: Google API not configured. Needs SuperAdmin verify or API keys.';
    }

    if (hit) {
      await query(
        `UPDATE ip_users SET points = points + $2, updated_at = now() WHERE id = $1`,
        [share.user_id, LINKEDIN_PROMO_POINTS],
      );
      await query(
        `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta) VALUES ($1,$2,$3,'viral_share_verified',$4::jsonb)`,
        [newId('ip_pts'), share.user_id, LINKEDIN_PROMO_POINTS, JSON.stringify({ shareId: share.id, via: 'process-due' })],
      );
      await query(
        `UPDATE ip_viral_shares SET status = 'rewarded', search_hit = true, search_notes = $2, points_awarded = $3, credits_awarded = 0, updated_at = now() WHERE id = $1`,
        [share.id, notes, LINKEDIN_PROMO_POINTS],
      );
      await notifyUser({
        userId: share.user_id,
        title: 'Viral LinkedIn share verified',
        body: `+${LINKEDIN_PROMO_POINTS} points.`,
        link: '/employer/viral',
        category: 'system',
      });
      results.push({ id: share.id, status: 'rewarded' });
    } else {
      await query(
        `UPDATE ip_viral_shares SET status = 'scheduled', search_hit = false, search_notes = $2, updated_at = now() WHERE id = $1`,
        [share.id, notes],
      );
      results.push({ id: share.id, status: 'needs_review', notes });
    }
  }

  return jsonOk({ ok: true, processed: results.length, results });
}
