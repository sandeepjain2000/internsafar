import { query, withClient } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';

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
          const graduation_year = row.graduation_year ? Number(row.graduation_year) : null;
          const cgpa = row.cgpa != null && row.cgpa !== '' ? String(row.cgpa) : null;
          const rowLabel = String(row.row_label || '').trim() || null;
          if (!college && !degree && !specialization && !study_status && !graduation_year && !cgpa) continue;
          const id = row.id && String(row.id).startsWith('ip_acad_') ? row.id : newId('ip_acad');
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
    return jsonError(e.message || 'Failed to save academics', 500);
  }
}
