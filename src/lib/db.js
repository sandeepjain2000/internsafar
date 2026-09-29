import { Pool } from 'pg';
import { getPgSslOption } from '@/lib/pgSsl';

/**
 * Internship Portal DB pool — application code must ONLY query ip_* tables.
 * URL-decode password; keep pool tiny on Vercel and on Neon session poolers
 * (EMAXCONNSESSION / pool_size ~15) so local QA + Next do not exhaust clients.
 */
function resolvePoolMax(rawUrl) {
  const envMax = Number(process.env.PG_POOL_MAX || process.env.DATABASE_POOL_MAX || '');
  if (Number.isFinite(envMax) && envMax > 0) return Math.floor(envMax);

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) return 1;

  // Neon / pooler session mode rejects above pool_size (often 15). Local Next can
  // otherwise open max:20 and starve QA / hot-reload workers with EMAXCONNSESSION.
  const host = (() => {
    try {
      return new URL(rawUrl).hostname || '';
    } catch {
      const m = String(rawUrl).match(/@([^/?:]+)/);
      return m ? m[1] : '';
    }
  })();
  if (/neon\.tech|pooler\.|supabase\.co/i.test(host) || /-pooler\./i.test(host)) {
    return 3;
  }
  return 10;
}

function buildPoolConfig() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL environment variable is not set.');

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const poolMax = resolvePoolMax(rawUrl);
  const idleTimeoutMillis = isServerless || poolMax <= 5 ? 5000 : 30000;

  try {
    const url = new URL(rawUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      max: poolMax,
      idleTimeoutMillis,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: isServerless || poolMax <= 5,
      ssl: getPgSslOption(url.hostname),
    };
  } catch {
    const m = String(rawUrl).match(/@([^/?:]+)/);
    const hostHint = m ? m[1] : '';
    return {
      connectionString: rawUrl,
      max: poolMax,
      idleTimeoutMillis,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: isServerless || poolMax <= 5,
      ssl: getPgSslOption(hostHint),
    };
  }
}

// Next dev bundles each route separately; one process-wide pool keeps the
// session pooler under its client cap instead of one pool per route bundle.
const POOL_KEY = Symbol.for('internship-portal.pgPool');

function getPool() {
  if (!globalThis[POOL_KEY]) {
    const pool = new Pool(buildPoolConfig());
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
    globalThis[POOL_KEY] = pool;
  }
  return globalThis[POOL_KEY];
}

// The shared session pooler caps clients across every process (local dev, QA, Vercel).
// Hitting the cap fails while opening a connection, before any SQL runs, so only the
// connect step is retried — queries are never re-executed.
const CONN_LIMIT_RE = /EMAXCONNSESSION|max clients reached|too many clients|remaining connection slots/i;
const CONNECT_RETRY_DELAYS_MS = [250, 750, 1500, 3000];

function isConnectionLimitError(err) {
  return err?.code === '53300' || CONN_LIMIT_RE.test(String(err?.message || ''));
}

async function connectWithRetry() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getPool().connect();
    } catch (err) {
      if (!isConnectionLimitError(err) || attempt >= CONNECT_RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function runQuery(text, params) {
  const client = await connectWithRetry();
  try {
    const res = await client.query(text, params);
    client.release();
    return res;
  } catch (err) {
    client.release(err);
    throw err;
  }
}

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await runQuery(text, params);
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', {
        text: text.substring(0, 80),
        duration: Date.now() - start,
        rows: res.rowCount,
      });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
}

export async function withClient(fn) {
  const client = await connectWithRetry();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export default { query, withClient };
