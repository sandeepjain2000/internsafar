// TEMP (delete after use): read-only count of posting fields employers fill.
const fs = require('fs');
const { Client } = require('pg');

const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const c = new Client({ connectionString: line.slice(13).trim().replace(/^["']|["']$/g, ''), ssl: { rejectUnauthorized: false } });

(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT count(*)::int AS published,
      count(*) FILTER (WHERE start_date IS NOT NULL)::int AS has_start_date,
      count(*) FILTER (WHERE end_date IS NOT NULL)::int AS has_end_date,
      count(*) FILTER (WHERE apply_ends_at IS NOT NULL)::int AS has_apply_deadline,
      count(*) FILTER (WHERE coalesce(eligibility->>'degree', '') <> '' OR jsonb_array_length(coalesce(eligibility->'degrees', '[]'::jsonb)) > 0)::int AS has_degree,
      count(*) FILTER (WHERE coalesce(eligibility->>'minCgpa', '') <> '')::int AS has_min_cgpa
    FROM ip_internships WHERE status = 'published'`);
  console.log(JSON.stringify(r.rows[0]));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
