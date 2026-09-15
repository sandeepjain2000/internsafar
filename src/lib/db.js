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

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }
  return pool;
}

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await getPool().query(text, params);
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
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export default { query, withClient };
