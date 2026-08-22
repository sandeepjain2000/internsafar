import { query } from '@/lib/db';
import { IP_REF_CITIES, IP_REF_DEGREES } from '@/lib/ipRefCitiesDegrees';

let ready = false;

export async function ensureIpRefCatalog() {
  if (ready) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ip_ref_cities (
      city TEXT PRIMARY KEY,
      state_ut TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ip_ref_degrees (
      id INT PRIMARY KEY,
      short_form TEXT NOT NULL,
      full_name TEXT NOT NULL
    )
  `);
  for (let i = 0; i < IP_REF_CITIES.length; i += 1) {
    const [city, state] = IP_REF_CITIES[i];
    await query(
      `INSERT INTO ip_ref_cities (city, state_ut, sort_order)
       VALUES ($1,$2,$3)
       ON CONFLICT (city) DO UPDATE SET state_ut = EXCLUDED.state_ut, sort_order = EXCLUDED.sort_order`,
      [city, state, i + 1],
    );
  }
  for (const [id, shortForm, fullName] of IP_REF_DEGREES) {
    await query(
      `INSERT INTO ip_ref_degrees (id, short_form, full_name)
       VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET short_form = EXCLUDED.short_form, full_name = EXCLUDED.full_name`,
      [id, shortForm, fullName],
    );
  }
  ready = true;
}
