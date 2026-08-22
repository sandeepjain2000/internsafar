import { query } from '@/lib/db';
import { jsonOk } from '@/lib/apiAuth';
import { ensureIpRefCatalog } from '@/lib/ensureIpRefCatalog';

export async function GET() {
  await ensureIpRefCatalog();
  const result = await query(
    `SELECT id, short_form, full_name FROM ip_ref_degrees ORDER BY id ASC`,
  );
  return jsonOk({
    items: result.rows.map((r) => ({
      value: r.short_form,
      label: `${r.short_form} — ${r.full_name}`,
      id: r.id,
      shortForm: r.short_form,
      fullName: r.full_name,
    })),
  });
}
