/** PostgreSQL SSL options — copied pattern from campus-placement-multiuser (ISM-only). */
import fs from 'fs';

let warnedInsecureTls;

export function getPgSslOption(hostname) {
  const h = String(hostname || '').toLowerCase();
  const local = h === 'localhost' || h === '127.0.0.1' || h === '::1';
  if (local) return false;

  const insecureEnv =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' ||
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false';
  const devLike = ['development', 'test', 'local'].includes(
    (process.env.NODE_ENV || '').toLowerCase(),
  );

  if (insecureEnv) {
    if (!devLike && !warnedInsecureTls) {
      warnedInsecureTls = true;
      console.warn(
        '[pgSsl] TLS verification disabled for PostgreSQL (DATABASE_SSL_REJECT_UNAUTHORIZED=false).',
      );
    }
    return { rejectUnauthorized: false };
  }

  const ssl = { rejectUnauthorized: true };
  const caPath = process.env.DATABASE_SSL_CA?.trim();
  if (caPath) {
    ssl.ca = fs.readFileSync(caPath, 'utf8');
  }
  return ssl;
}
