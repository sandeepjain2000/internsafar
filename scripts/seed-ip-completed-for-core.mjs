/**
 * Ensure core candidate has completed internship apps (dashboard "Internships Completed").
 * Data-only; respects unique (internship_id, candidate_id). Does not invent orphan FKs.
 *
 *   node scripts/seed-ip-completed-for-core.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const CAND_EMAIL = 'lawsonlclintern+1@gmail.com';
const NEED = 3;

function nid(prefix) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const label = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${prefix}_${label}-${Math.floor(Math.random() * 900 + 100)}`;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const cand = await client.query(
      `SELECT c.id FROM ip_candidates c JOIN ip_users u ON u.id=c.user_id WHERE lower(u.email)=lower($1)`,
      [CAND_EMAIL],
    );
    const candidateId = cand.rows[0]?.id;
    if (!candidateId) throw new Error(`Core candidate not found: ${CAND_EMAIL}`);

    const existing = await client.query(
      `SELECT count(*)::int AS n FROM ip_applications WHERE candidate_id=$1 AND status='completed'`,
      [candidateId],
    );
    let have = Number(existing.rows[0].n || 0);
    console.log(`Completed apps for ${CAND_EMAIL}: ${have}`);

    if (have >= NEED) {
      console.log('Already enough completed — nothing to do');
      return;
    }

    // Prefer updating existing Priya apps that aren't offer-linked in a conflicting way,
    // else insert on published Nova (or any) posts she hasn't applied to.
    const updatable = await client.query(
      `SELECT a.id FROM ip_applications a
       LEFT JOIN ip_offers o ON o.application_id = a.id
       WHERE a.candidate_id=$1
         AND a.status NOT IN ('completed', 'hired')
         AND (o.id IS NULL OR o.status IN ('accepted', 'declined', 'expired'))
       ORDER BY a.created_at ASC
       LIMIT $2`,
      [candidateId, NEED - have],
    );

    for (const row of updatable.rows) {
      await client.query(
        `UPDATE ip_applications SET status='completed', updated_at=now() WHERE id=$1`,
        [row.id],
      );
      have += 1;
    }

    if (have < NEED) {
      const posts = await client.query(
        `SELECT i.id FROM ip_internships i
         WHERE i.status='published'
           AND NOT EXISTS (
             SELECT 1 FROM ip_applications a
             WHERE a.internship_id=i.id AND a.candidate_id=$1
           )
         ORDER BY i.created_at DESC
         LIMIT $2`,
        [candidateId, NEED - have],
      );
      for (const p of posts.rows) {
        await client.query(
          `INSERT INTO ip_applications (id, internship_id, candidate_id, status, match_score, answers)
           VALUES ($1,$2,$3,'completed',$4,$5::jsonb)`,
          [
            nid('ip_app'),
            p.id,
            candidateId,
            90,
            JSON.stringify({ q1: 'Completed internship successfully.' }),
          ],
        );
        have += 1;
      }
    }

    const final = await client.query(
      `SELECT count(*)::int AS n FROM ip_applications WHERE candidate_id=$1 AND status='completed'`,
      [candidateId],
    );
    console.log(JSON.stringify({ ok: true, completed: final.rows[0].n }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
