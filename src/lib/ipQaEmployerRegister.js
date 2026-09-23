/**
 * QA-only exposure for employer register scripts (verify URL + outbound mail metadata).
 *
 * Default OFF. Never active on Vercel production even if the env var is set.
 * Downloading scripts from GitHub alone cannot bypass — the *server* must run with
 * IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE enabled, and not on VERCEL_ENV=production.
 */

function envFlagOn(name) {
  const v = String(process.env[name] || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Whether register-employer may include qaVerifyUrl / qaOutboundMails in the JSON body.
 */
export function isEmployerRegisterQaExposureEnabled() {
  if (!envFlagOn('IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE')) return false;
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production') return false;
  if (envFlagOn('IP_DISABLE_QA_EXPOSURE')) return false;
  return true;
}
