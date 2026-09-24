import { query, withClient } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';

/** ip_candidates.cgpa is NUMERIC(4,2) — first academic row is synced there. */
const MAX_PROFILE_CGPA = 99.99;

function friendlyAcademicsError(err) {
  if (err?.code === '22003') {
    return 'CGPA / percentage on the first education row must be 99.99 or less (use e.g. 8.5 or 85, not 100+).';
  }
  if (err?.code === '22P02') {
    return 'Graduation year or CGPA is not a valid number. Please check those fields and try again.';
  }
  if (err?.code === '23505') {
    return "We couldn't save your education details because of a row conflict. Please try Save again.";
  }
  return "We couldn't save your education details. Please check the year and CGPA values and try again.";
}

/** Multi-row academic history (migration 007: ip_candidate_academics). */
export async function GET() {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  if (!cand.rows[0]) return jsonError('Profile not found', 404);
  const result = await query(
    `SELECT * FROM ip_candidate_academics WHERE candidate_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [cand.rows[0].id],
  );
  return jsonOk({ items: result.rows });
}

export async function PUT(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const items = Array.isArray(body.items) ? body.items : [];

  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  if (!cand.rows[0]) return jsonError('Profile not found', 404);
  const candidateId = cand.rows[0].id;

  // Pre-check primary CGPA so the candidate sees a clear message (not a generic catch-all).
  const firstNonEmpty = items.find((row) => {
    const r = row || {};
    return Boolean(
      String(r.college || '').trim()
      || String(r.degree || '').trim()
      || String(r.specialization || '').trim()
      || String(r.study_status || '').trim()
      || r.graduation_year
      || (r.cgpa != null && r.cgpa !== ''),
    );
  });
  if (firstNonEmpty?.cgpa != null && firstNonEmpty.cgpa !== '') {
    const n = Number(firstNonEmpty.cgpa);
    if (!Number.isFinite(n)) {
      return jsonError('CGPA / percentage must be a number.', 400);
    }
    if (Math.abs(n) > MAX_PROFILE_CGPA) {
      return jsonError(
        'CGPA / percentage on the first education row must be 99.99 or less (use e.g. 8.5 or 85, not 100+).',
        400,
      );
    }
  }

  try {
    const saved = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`DELETE FROM ip_candidate_academics WHERE candidate_id = $1`, [candidateId]);
        const rows = [];
        for (let i = 0; i < items.length; i += 1) {
          const row = items[i] || {};
          const college = String(row.college || '').trim() || null;
          const degree = String(row.degree || '').trim() || null;
          const specialization = String(row.specialization || '').trim() || null;
          const study_status = String(row.study_status || '').trim() || null;
          const yearNum = row.graduation_year ? Number(row.graduation_year) : null;
          const graduation_year = Number.isFinite(yearNum) ? yearNum : null;
          const cgpaNum = row.cgpa != null && row.cgpa !== '' ? Number(row.cgpa) : null;
          const cgpa = Number.isFinite(cgpaNum) ? String(cgpaNum) : null;
          const rowLabel = String(row.row_label || '').trim() || null;
          if (!college && !degree && !specialization && !study_status && !graduation_year && !cgpa) continue;
          // Always mint a new id on full replace. Reusing client/draft ids from another
          // account (e.g. lawsonlclintern+1 → +blank on the same browser) hits PK 23505.
          const id = newId('ip_acad');
          const inserted = await client.query(
            `INSERT INTO ip_candidate_academics
               (id, candidate_id, college, degree, specialization, study_status, graduation_year, cgpa, row_label, sort_order, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
             RETURNING *`,
            [id, candidateId, college, degree, specialization, study_status, graduation_year, cgpa, rowLabel, rows.length],
          );
          rows.push(inserted.rows[0]);
        }

        const primary = rows[0] || {};
        await client.query(
          `UPDATE ip_candidates
           SET college = $2, degree = $3, specialization = $4, study_status = $5,
               graduation_year = $6, cgpa = $7, updated_at = now()
           WHERE id = $1`,
          [
            candidateId,
            primary.college || null,
            primary.degree || null,
            primary.specialization || null,
            primary.study_status || null,
            primary.graduation_year || null,
            primary.cgpa || null,
          ],
        );

        await client.query('COMMIT');
        return rows;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });
    return jsonOk({ ok: true, items: saved });
  } catch (e) {
    console.error('[ip/candidate/academics] save failed', e);
    return jsonError(friendlyAcademicsError(e), 400);
  }
}
