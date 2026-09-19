import { query } from '@/lib/db';
import { IP_REF_CITIES, IP_REF_DEGREES } from '@/lib/ipRefCitiesDegrees';
import { IP_COUNTRY_OPTIONS } from '@/lib/ipRegions';

let ready = false;
let readyPromise = null;

/**
 * Ensure ref catalog tables exist and are seeded.
 * Fast path: if row counts already match the in-code catalogs, skip per-row upserts
 * (those were making /api/ip/ref/cities slow on cold starts).
 */
export async function ensureIpRefCatalog() {
  if (ready) return;
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
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
    await query(`
      CREATE TABLE IF NOT EXISTS ip_ref_countries (
        country TEXT PRIMARY KEY,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);

    const cityCount = await query(`SELECT count(*)::int AS n FROM ip_ref_cities`);
    const degreeCount = await query(`SELECT count(*)::int AS n FROM ip_ref_degrees`);
    const countryCount = await query(`SELECT count(*)::int AS n FROM ip_ref_countries`);
    const citiesOk = Number(cityCount.rows[0]?.n || 0) >= IP_REF_CITIES.length;
    const degreesOk = Number(degreeCount.rows[0]?.n || 0) >= IP_REF_DEGREES.length;
    const countriesOk = Number(countryCount.rows[0]?.n || 0) >= IP_COUNTRY_OPTIONS.length;

    if (!citiesOk) {
      const chunkSize = 40;
      for (let i = 0; i < IP_REF_CITIES.length; i += chunkSize) {
        const chunk = IP_REF_CITIES.slice(i, i + chunkSize);
        const values = [];
        const params = [];
        chunk.forEach(([city, state], idx) => {
          const base = idx * 3;
          values.push(`($${base + 1},$${base + 2},$${base + 3})`);
          params.push(city, state, i + idx + 1);
        });
        await query(
          `INSERT INTO ip_ref_cities (city, state_ut, sort_order)
           VALUES ${values.join(',')}
           ON CONFLICT (city) DO UPDATE SET
             state_ut = EXCLUDED.state_ut,
             sort_order = EXCLUDED.sort_order`,
          params,
        );
      }
    }

    if (!degreesOk) {
      const values = [];
      const params = [];
      IP_REF_DEGREES.forEach(([id, shortForm, fullName], idx) => {
        const base = idx * 3;
        values.push(`($${base + 1},$${base + 2},$${base + 3})`);
        params.push(id, shortForm, fullName);
      });
      await query(
        `INSERT INTO ip_ref_degrees (id, short_form, full_name)
         VALUES ${values.join(',')}
         ON CONFLICT (id) DO UPDATE SET
           short_form = EXCLUDED.short_form,
           full_name = EXCLUDED.full_name`,
        params,
      );
    }

    if (!countriesOk) {
      const values = [];
      const params = [];
      IP_COUNTRY_OPTIONS.forEach((country, idx) => {
        const base = idx * 2;
        values.push(`($${base + 1},$${base + 2})`);
        params.push(country, idx + 1);
      });
      await query(
        `INSERT INTO ip_ref_countries (country, sort_order)
         VALUES ${values.join(',')}
         ON CONFLICT (country) DO UPDATE SET
           sort_order = EXCLUDED.sort_order`,
        params,
      );
    }

    ready = true;
  })().finally(() => {
    if (!ready) readyPromise = null;
  });
  return readyPromise;
}
