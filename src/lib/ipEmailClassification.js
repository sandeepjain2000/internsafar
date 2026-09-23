/**
 * Soft email classification for employer domain registration.
 * Uses mr-email-checker (maintained free/disposable lists + MX) — not our hardcoded sets.
 * Never hard-rejects: callers treat free/weak results as SuperAdmin-triage signals.
 */
import { verifyEmail } from 'mr-email-checker';

/**
 * @param {string} email
 * @returns {Promise<{
 *   ok: boolean,
 *   softFail: boolean,
 *   isFreeProvider: boolean,
 *   isDisposable: boolean,
 *   valid: boolean,
 *   reasons: string[],
 *   summary: string,
 *   raw?: object,
 * }>}
 */
export async function classifyEmployerEmail(email) {
  const input = String(email || '').trim().toLowerCase();
  if (!input.includes('@')) {
    return {
      ok: false,
      softFail: true,
      isFreeProvider: false,
      isDisposable: false,
      valid: false,
      reasons: ['invalid_syntax'],
      summary: 'Email address looks invalid',
    };
  }

  try {
    const report = await verifyEmail(input, {
      smtp: { enabled: false },
      suggestTypos: false,
      dnsTimeoutMs: 4000,
    });
    const isFreeProvider = Boolean(report?.domain?.isFreeProvider);
    const isDisposable = Boolean(report?.domain?.isDisposable);
    const valid = Boolean(report?.valid) && Boolean(report?.syntax?.valid);
    const mxBad = report?.mx && report.mx.valid === false;
    const softFail = isFreeProvider || isDisposable || !valid || Boolean(mxBad);
    const reasons = Array.isArray(report?.reasons) ? report.reasons.map(String) : [];
    if (isFreeProvider && !reasons.includes('free_provider')) reasons.push('free_provider');
    if (isDisposable && !reasons.includes('disposable')) reasons.push('disposable');
    if (mxBad && !reasons.includes('mx_failed')) reasons.push('mx_failed');

    let summary = 'Looks like a company mailbox';
    if (isDisposable) summary = 'Looks like a disposable / temporary email';
    else if (isFreeProvider) summary = 'Looks like a free / consumer email provider';
    else if (!valid || mxBad) summary = 'Email or mail-domain check was inconclusive';

    return {
      ok: true,
      softFail,
      isFreeProvider,
      isDisposable,
      valid,
      reasons,
      summary,
      raw: {
        status: report?.status,
        domainKind: report?.domain?.kind,
        mailProvider: report?.domain?.mailProvider,
      },
    };
  } catch (e) {
    return {
      ok: false,
      softFail: true,
      isFreeProvider: false,
      isDisposable: false,
      valid: false,
      reasons: ['classification_error'],
      summary: 'Email classification unavailable — queued for SuperAdmin review',
      raw: { error: e?.message || String(e) },
    };
  }
}
