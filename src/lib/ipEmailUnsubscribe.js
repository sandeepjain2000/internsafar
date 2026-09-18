import { newId } from '@/lib/ids';
import { resolveAppOrigin } from '@/lib/ipAppOrigin';
import {
  UNSUBSCRIBE_STATUS,
  createUnsubscribeToken,
  decideUnsubscribeRecord,
  isValidUnsubscribeToken,
  normalizeUnsubscribeEmail,
  buildUnsubscribeUrl,
} from '@/lib/ipEmailUnsubscribeFormat';

export {
  UNSUBSCRIBE_STATUS,
  UNSUBSCRIBE_LINK_TEXT,
  createUnsubscribeToken,
  isValidUnsubscribeToken,
  normalizeUnsubscribeEmail,
  buildUnsubscribeUrl,
  appendUnsubscribeHtml,
  appendUnsubscribeText,
  applyUnsubscribeFooter,
  decideUnsubscribeRecord,
} from '@/lib/ipEmailUnsubscribeFormat';

let schemaReady = false;

async function liveQuery(text, params) {
  const { query } = await import('@/lib/db');
  return query(text, params);
}

function resolveDb(db) {
  return db && typeof db.query === 'function' ? db : { query: liveQuery };
}

export async function ensureIpEmailUnsubscribeSchema(db) {
  const resolved = resolveDb(db);
  const isLive = resolved.query === liveQuery;
  if (schemaReady && isLive) return;

  await resolved.query(`
    CREATE TABLE IF NOT EXISTS ip_email_unsubscribe_tokens (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await resolved.query(`
    CREATE TABLE IF NOT EXISTS ip_email_unsubscribe_requests (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await resolved.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ip_email_unsubscribe_requests_status_check'
      ) THEN
        ALTER TABLE ip_email_unsubscribe_requests
          ADD CONSTRAINT ip_email_unsubscribe_requests_status_check
          CHECK (status IN ('PENDING', 'PROCESSED'));
      END IF;
    END $$;
  `);

  await resolved.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ip_email_unsubscribe_requests_email_pending_uidx
      ON ip_email_unsubscribe_requests (email)
      WHERE status = 'PENDING'
  `);

  await resolved.query(`
    CREATE INDEX IF NOT EXISTS ip_email_unsubscribe_requests_status_requested_idx
      ON ip_email_unsubscribe_requests (status, requested_at)
  `);

  if (isLive) schemaReady = true;
}

function mapRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    token: row.token,
    status: row.status,
    requestedAt: row.requested_at,
  };
}

export async function getOrCreateUnsubscribeToken(email, preferredToken, db) {
  db = resolveDb(db);
  await ensureIpEmailUnsubscribeSchema(db);
  const normalized = normalizeUnsubscribeEmail(email);
  if (!normalized) throw new Error('unsubscribe: a valid email is required');

  const existing = await db.query(
    `SELECT token FROM ip_email_unsubscribe_tokens WHERE email = $1 LIMIT 1`,
    [normalized],
  );
  if (existing.rows[0]?.token) return existing.rows[0].token;

  const token = isValidUnsubscribeToken(preferredToken) ? preferredToken : createUnsubscribeToken();
  try {
    await db.query(
      `INSERT INTO ip_email_unsubscribe_tokens (id, email, token) VALUES ($1,$2,$3)`,
      [newId('ip_unsubtok'), normalized, token],
    );
    return token;
  } catch (err) {
    if (err.code !== '23505') throw err;
    const again = await db.query(
      `SELECT token FROM ip_email_unsubscribe_tokens WHERE email = $1 LIMIT 1`,
      [normalized],
    );
    if (again.rows[0]?.token) return again.rows[0].token;
    throw err;
  }
}

export async function getUnsubscribeUrlForEmail(email, preferredToken, db) {
  const token = await getOrCreateUnsubscribeToken(email, preferredToken, db);
  return buildUnsubscribeUrl(resolveAppOrigin(), token);
}

export async function recordUnsubscribeRequest(rawToken, db) {
  db = resolveDb(db);
  const token = String(rawToken || '').trim();
  if (!isValidUnsubscribeToken(token)) {
    return { ok: false, reason: 'invalid_token' };
  }

  await ensureIpEmailUnsubscribeSchema(db);

  const tokenLookup = await db.query(
    `SELECT email, token FROM ip_email_unsubscribe_tokens WHERE token = $1 LIMIT 1`,
    [token],
  );
  const tokenRow = tokenLookup.rows[0] || null;

  const pendingLookup = tokenRow
    ? await db.query(
        `SELECT id, email, token, status, requested_at
           FROM ip_email_unsubscribe_requests
          WHERE status = $1
            AND (token = $2 OR email = $3)
          ORDER BY requested_at ASC
          LIMIT 1`,
        [UNSUBSCRIBE_STATUS.PENDING, token, tokenRow.email],
      )
    : { rows: [] };

  const decision = decideUnsubscribeRecord({
    tokenRow,
    existingPending: pendingLookup.rows[0] || null,
  });

  if (decision.action === 'reject') {
    return { ok: false, reason: decision.reason };
  }
  if (decision.action === 'reuse') {
    return { ok: true, duplicate: true, ...mapRequestRow(decision.request) };
  }

  const id = newId('ip_unsub');
  try {
    const inserted = await db.query(
      `INSERT INTO ip_email_unsubscribe_requests (id, email, token, status)
       VALUES ($1,$2,$3,$4)
       RETURNING id, email, token, status, requested_at`,
      [id, tokenRow.email, token, UNSUBSCRIBE_STATUS.PENDING],
    );
    return { ok: true, duplicate: false, ...mapRequestRow(inserted.rows[0]) };
  } catch (err) {
    if (err.code !== '23505') throw err;
    const again = await db.query(
      `SELECT id, email, token, status, requested_at
         FROM ip_email_unsubscribe_requests
        WHERE token = $1 OR (email = $2 AND status = $3)
        ORDER BY requested_at ASC
        LIMIT 1`,
      [token, tokenRow.email, UNSUBSCRIBE_STATUS.PENDING],
    );
    if (!again.rows[0]) throw err;
    return { ok: true, duplicate: true, ...mapRequestRow(again.rows[0]) };
  }
}

export async function listUnsubscribeRequests({ status = UNSUBSCRIBE_STATUS.PENDING, limit = 200 } = {}, db) {
  db = resolveDb(db);
  await ensureIpEmailUnsubscribeSchema(db);
  const normalizedStatus = String(status || UNSUBSCRIBE_STATUS.PENDING).trim().toUpperCase();
  if (!Object.values(UNSUBSCRIBE_STATUS).includes(normalizedStatus)) {
    throw new Error('unsubscribe: invalid status filter');
  }
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const result = await db.query(
    `SELECT id, email, token, status, requested_at
       FROM ip_email_unsubscribe_requests
      WHERE status = $1
      ORDER BY requested_at ASC
      LIMIT $2`,
    [normalizedStatus, cap],
  );
  return result.rows.map(mapRequestRow);
}

export function listPendingUnsubscribeRequests(options, db) {
  return listUnsubscribeRequests({ ...options, status: UNSUBSCRIBE_STATUS.PENDING }, db);
}
