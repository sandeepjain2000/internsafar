import { withClient } from '@/lib/db';
import { isActiveApplicationStatus } from '@/lib/ipApplicationVolume';

export const MAX_ACTIVE_APPLICATIONS_PER_POSTING = 100;

export async function countActiveApplications(clientOrQuery, internshipId) {
  const run = typeof clientOrQuery.query === 'function'
    ? (text, params) => clientOrQuery.query(text, params)
    : clientOrQuery;
  const result = await run(
    `SELECT count(*)::int AS n FROM ip_applications
     WHERE internship_id = $1 AND status NOT IN ('rejected', 'withdrawn')`,
    [internshipId],
  );
  return Number(result.rows[0]?.n || 0);
}

/**
 * Insert application under advisory lock so concurrent applies cannot exceed 100 active.
 * fn(client) should perform the INSERT and related work; returns fn result.
 * Throws Error with code 'CAPACITY' if full.
 */
export async function withApplicationCapacityLock(internshipId, fn) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      // Session-level advisory lock keyed by internship id hash
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [String(internshipId)]);
      const countRes = await client.query(
        `SELECT count(*)::int AS n FROM ip_applications
         WHERE internship_id = $1 AND status NOT IN ('rejected', 'withdrawn')`,
        [internshipId],
      );
      const active = Number(countRes.rows[0]?.n || 0);
      if (active >= MAX_ACTIVE_APPLICATIONS_PER_POSTING) {
        const err = new Error(
          `This posting has reached the maximum of ${MAX_ACTIVE_APPLICATIONS_PER_POSTING} active applications`,
        );
        err.code = 'CAPACITY';
        throw err;
      }
      const result = await fn(client, active);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    }
  });
}

export { isActiveApplicationStatus, MAX_ACTIVE_APPLICATIONS_PER_POSTING as APPLICATION_CAP };
