/**
 * One-time: ensure doc slots schema + supersede duplicate active docs (one per type).
 * Usage: node scripts/dedupe-employer-documents.mjs
 * Soft-supersedes extras (keeps history); does not hard-delete S3 objects.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });
config({ path: resolve(__dirname, '../.env') });

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('No DATABASE_URL / POSTGRES_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

async function run(sql, params) {
  return client.query(sql, params);
}

await run(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS file_size BIGINT`);
await run(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS doc_label TEXT`);
await run(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ`);

const before = await run(`
  SELECT count(*)::int AS active,
         count(*) FILTER (WHERE superseded_at IS NOT NULL)::int AS already_superseded
  FROM ip_employer_documents
`);
console.log('Before:', before.rows[0]);

const dupes = await run(`
  SELECT employer_id, lower(doc_type) AS t, count(*)::int AS n
  FROM ip_employer_documents
  WHERE superseded_at IS NULL
  GROUP BY 1, 2
  HAVING count(*) > 1
  ORDER BY n DESC
  LIMIT 20
`);
console.log('Duplicate active groups (sample):', dupes.rows);

const upd = await run(`
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY employer_id, lower(doc_type)
             ORDER BY
               CASE lower(coalesce(review_status, 'pending'))
                 WHEN 'approved' THEN 0
                 WHEN 'pending' THEN 1
                 ELSE 2
               END,
               created_at DESC NULLS LAST,
               id DESC
           ) AS rn
    FROM ip_employer_documents
    WHERE superseded_at IS NULL
  )
  UPDATE ip_employer_documents d
  SET superseded_at = now()
  FROM ranked r
  WHERE d.id = r.id AND r.rn > 1
  RETURNING d.id
`);
console.log('Superseded rows:', upd.rowCount);

await run(`
  CREATE UNIQUE INDEX IF NOT EXISTS ip_employer_documents_active_type_uidx
  ON ip_employer_documents (employer_id, lower(doc_type))
  WHERE superseded_at IS NULL
`);

const after = await run(`
  SELECT count(*)::int AS active,
         count(*) FILTER (WHERE superseded_at IS NOT NULL)::int AS superseded
  FROM ip_employer_documents
`);
console.log('After:', after.rows[0]);

const nova = await run(`
  SELECT e.company_name, d.doc_type, d.review_status, d.superseded_at IS NOT NULL AS superseded
  FROM ip_employer_documents d
  JOIN ip_employers e ON e.id = d.employer_id
  WHERE e.company_name ILIKE '%nova%'
  ORDER BY d.doc_type, d.superseded_at NULLS FIRST, d.created_at DESC
`);
console.log('Nova Labs docs:', nova.rows.length);
const byType = {};
for (const r of nova.rows) {
  const k = `${r.doc_type}|${r.superseded ? 'old' : 'active'}`;
  byType[k] = (byType[k] || 0) + 1;
}
console.log(byType);

await client.end();
