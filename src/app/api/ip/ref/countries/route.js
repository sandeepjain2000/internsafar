import { query } from '@/lib/db';
import { jsonOk } from '@/lib/apiAuth';
import { ensureIpRefCatalog } from '@/lib/ensureIpRefCatalog';
import { IP_COUNTRY_SELECT_OPTIONS } from '@/lib/ipRegions';

export const dynamic = 'force-dynamic';

function mapRows(rows) {
  return rows.map((r) => ({
    value: r.country,
    label: r.country,
  }));
}

function withCache(res) {
  res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res;
}

export async function GET() {
  try {
    const existing = await query(
      `SELECT country FROM ip_ref_countries ORDER BY sort_order ASC, country ASC`,
    );
    if (existing.rows.length) {
      return withCache(jsonOk({ items: mapRows(existing.rows) }));
    }
  } catch {
    /* table may not exist yet — fall through to ensure + seed */
  }

  await ensureIpRefCatalog();
  const result = await query(
    `SELECT country FROM ip_ref_countries ORDER BY sort_order ASC, country ASC`,
  );
  const items = result.rows.length ? mapRows(result.rows) : IP_COUNTRY_SELECT_OPTIONS;
  return withCache(jsonOk({ items }));
}
