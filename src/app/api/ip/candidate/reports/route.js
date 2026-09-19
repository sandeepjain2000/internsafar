import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpStudentDiscoveryFeatures } from '@/lib/ensureIpStudentDiscoveryFeatures';
import { newId } from '@/lib/ids';

const REASONS = new Set([
  'spam',
  'misleading',
  'scam',
  'offensive',
  'duplicate',
  'other',
]);

/** Candidate reports a listing or employer. Never blocks apply. */
export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpStudentDiscoveryFeatures();

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const reason = String(body.reason || '').trim().toLowerCase();
  if (!REASONS.has(reason)) {
    return jsonError('Pick a valid report reason', 400);
  }
  const details = String(body.details || '').trim().slice(0, 2000);
  const internshipId = body.internshipId ? String(body.internshipId).trim() : null;
  let employerId = body.employerId ? String(body.employerId).trim() : null;

  if (!internshipId && !employerId) {
    return jsonError('Provide an internship or employer to report', 400);
  }

  if (internshipId) {
    const row = await query(
      `SELECT id, employer_id FROM ip_internships WHERE id = $1`,
      [internshipId],
    );
    if (!row.rows[0]) return jsonError('Listing not found', 404);
    employerId = employerId || row.rows[0].employer_id;
  }

  // Soft rate-limit: max 5 reports / 24h per user
  const recent = await query(
    `SELECT count(*)::int AS n FROM ip_listing_reports
     WHERE reporter_user_id = $1 AND created_at >= now() - interval '24 hours'`,
    [session.user.id],
  );
  if ((recent.rows[0]?.n || 0) >= 5) {
    return jsonError('You have reached the report limit for today. Try again tomorrow.', 429);
  }

  const id = newId('ip_rep');
  await query(
    `INSERT INTO ip_listing_reports (id, reporter_user_id, internship_id, employer_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, session.user.id, internshipId, employerId, reason, details || null],
  );

  return jsonOk({ ok: true, id }, 201);
}
