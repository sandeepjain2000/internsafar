import { query } from '@/lib/db';
import { jsonOk } from '@/lib/apiAuth';
import { ensureIpRefCatalog } from '@/lib/ensureIpRefCatalog';

export async function GET() {
  await ensureIpRefCatalog();
  const result = await query(
    `SELECT city, state_ut FROM ip_ref_cities ORDER BY sort_order ASC, city ASC`,
  );
  return jsonOk({
    items: result.rows.map((r) => ({
      value: r.city,
      label: r.state_ut && r.state_ut !== 'Work mode' ? `${r.city} (${r.state_ut})` : r.city,
      city: r.city,
      state: r.state_ut,
    })),
  });
}
