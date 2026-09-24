/**
 * Map infra/DB errors to a user-safe message. Never expose pool/SQL internals.
 */

export const FRIENDLY_TEMP_UNAVAILABLE =
  'Something went wrong on our side. Please try again in a moment.';

const INFRA_RE =
  /EMAXCONNSESSION|max clients|pool_size|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection terminated|Connection terminated|too many clients|remaining connection slots|TimeoutError|connect ECONN|sorry, too many clients/i;

export function isInfraDbError(err) {
  if (!err) return false;
  const code = String(err.code || err.errno || '');
  if (/^(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|57P03|53300|08006|08001)$/i.test(code)) {
    return true;
  }
  const msg = String(err.message || err || '');
  return INFRA_RE.test(msg);
}

/** Safe string for JSON `error` / UI alerts. Pass-through for ordinary validation messages. */
export function toSafeClientError(err, fallback = FRIENDLY_TEMP_UNAVAILABLE) {
  if (err == null || err === '') return fallback;
  if (typeof err === 'string') {
    return isInfraDbError({ message: err }) ? fallback : err;
  }
  if (isInfraDbError(err)) return fallback;
  const msg = String(err.message || '').trim();
  if (!msg) return fallback;
  if (isInfraDbError({ message: msg })) return fallback;
  return msg;
}
