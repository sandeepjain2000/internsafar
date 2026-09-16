import { query } from '@/lib/db';
import { jsonOk } from '@/lib/apiAuth';
import { ensureIpRefCatalog } from '@/lib/ensureIpRefCatalog';
import { IP_REF_CITIES } from '@/lib/ipRefCitiesDegrees';

export const dynamic = 'force-dynamic';

function mapRows(rows) {
  return rows.map((r) => ({
    value: r.city,
    label: r.state_ut && r.state_ut !== 'Work mode' ? `${r.city} (${r.state_ut})` : r.city,
    city: r.city,
    state: r.state_ut,
  }));
}

function staticItems() {
  return IP_REF_CITIES.map(([city, state]) => ({
    value: city,
    label: state && state !== 'Work mode' ? `${city} (${state})` : city,
    city,
    state,
  }));
}

function withCache(res) {
  res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res;
}

export async function GET() {
  // Fast path: read if the table already has rows (skip CREATE/seed on warm DBs).
  try {
    const existing = await query(
      `SELECT city, state_ut FROM ip_ref_cities ORDER BY sort_order ASC, city ASC`,
    );
    if (existing.rows.length) {
      return withCache(jsonOk({ items: mapRows(existing.rows) }));
    }
  } catch {
    // Table may not exist yet — fall through to ensure + seed.
  }

  await ensureIpRefCatalog();
  const result = await query(
    `SELECT city, state_ut FROM ip_ref_cities ORDER BY sort_order ASC, city ASC`,
  );
  const items = result.rows.length ? mapRows(result.rows) : staticItems();
  return withCache(jsonOk({ items }));
}
