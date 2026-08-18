import { Pool } from 'pg';
import { getPgSslOption } from '@/lib/pgSsl';

/**
 * Internship Portal DB pool — application code must ONLY query ip_* tables.
 * URL-decode password; pool max 1 on Vercel.
 */
function buildPoolConfig() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL environment variable is not set.');

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const poolMax = isServerless ? 1 : 20;
  const idleTimeoutMillis = isServerless ? 5000 : 30000;

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
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: isServerless,
      ssl: getPgSslOption(url.hostname),
    };
  } catch {
    const m = String(rawUrl).match(/@([^/?:]+)/);
    const hostHint = m ? m[1] : '';
    return {
      connectionString: rawUrl,
      max: poolMax,
      idleTimeoutMillis,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: isServerless,
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
