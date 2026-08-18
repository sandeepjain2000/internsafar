/**
 * One-off: list ip_* text that contains seed/seeded (no secrets printed).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const client = new pg.Client({ connectionString: rawUrl, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'ip_%'
    ORDER BY 1
  `);
  console.log('ip_tables', tables.rows.map((r) => r.table_name).join(', '));

  const cols = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'ip_%'
      AND (
        column_name ILIKE '%seed%'
        OR data_type IN ('text', 'character varying', 'jsonb', 'json', 'character')
      )
    ORDER BY table_name, ordinal_position
  `);

  const seedNamedCols = cols.rows.filter((c) => /seed/i.test(c.column_name));
  console.log('columns_named_seed', seedNamedCols);

  const byTable = new Map();
  for (const c of cols.rows) {
    if (!/text|character|json/i.test(c.data_type)) continue;
    if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
    byTable.get(c.table_name).push(c);
  }

  for (const [table, list] of byTable) {
    const textCols = list.filter((c) => c.data_type !== 'jsonb' && c.data_type !== 'json');
    if (!textCols.length) continue;
    const wheres = textCols.map((c) => `"${c.column_name}"::text ILIKE '%seed%'`).join(' OR ');
    const selectCols = ['id', ...textCols.map((c) => c.column_name)].filter((v, i, a) => a.indexOf(v) === i);
    const hasId = list.some((c) => c.column_name === 'id') || true;
    try {
      const q = `SELECT ${selectCols.map((c) => `"${c}"`).join(', ')} FROM "${table}" WHERE ${wheres} LIMIT 40`;
      const res = await client.query(q);
      if (res.rows.length) {
        console.log(`\n== ${table} (${res.rows.length}+) ==`);
        for (const row of res.rows) {
          const hits = {};
          for (const [k, v] of Object.entries(row)) {
            if (v != null && /seed/i.test(String(v))) hits[k] = String(v).slice(0, 180);
          }
          console.log(JSON.stringify(hits));
        }
      }
    } catch (e) {
      console.log(`skip ${table}: ${e.message}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
    .finally(() => client.end());
