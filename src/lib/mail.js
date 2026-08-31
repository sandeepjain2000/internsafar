/**
 * ZeptoMail primary with SMTP backup (Placement Hub pattern, simplified).
 *
 * Recipient resolution (mirrors campus-placement-multiuser mailer):
 * 1. OUTBOUND_EMAIL_OVERRIDE — used ONLY while the test-environment gate
 *    (ISM_TEST_ENVIRONMENT, alias OUTBOUND_EMAIL_OVERRIDE_ENABLED) is explicitly true.
 *    When active it ADDS the support/QA inbox to the recipients; the real
 *    recipient still receives the mail.
 * 2. Else send to the intended address; on failure, optional IP_MAIL_TEST_FALLBACK
 *    (its built-in support-inbox default also requires the gate below)
 *
 * Gate behaviour (see scripts/test-ip-mail-override.mjs):
 *   ISM_TEST_ENVIRONMENT=true  → every mail goes to the real recipient AND the
 *   support/QA inbox.
 *   flag unset / false / 0 / off → mail goes to the real user address only, even
 *   though OUTBOUND_EMAIL_OVERRIDE still holds the support address.
 */
import nodemailer from 'nodemailer';
import { getZeptoFrom, isZeptoConfigured, sendViaZeptoMail } from '@/lib/zeptomail';

export { isZeptoConfigured };

/** Default QA inbox when override/fallback env is unset (Zoho Placement Hub support). */
const DEFAULT_QA_MAIL_FALLBACK = 'support.placementhub@placementhub.online';

function smtpTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function smtpFrom() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || null;
}

/**
 * Gate for the outbound override. The address alone must never redirect mail;
 * the flag has to be explicitly enabled (QA / test environment only).
 */
export function isOutboundEmailOverrideEnabled() {
  const raw = String(
    process.env.ISM_TEST_ENVIRONMENT ?? process.env.OUTBOUND_EMAIL_OVERRIDE_ENABLED ?? '',
  )
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/**
 * Failure-only fallback when the primary send to the real recipient fails.
 * The built-in QA inbox only applies while the test gate is on; in production
 * an unset IP_MAIL_TEST_FALLBACK must not silently reroute mail to support.
 */
export function getMailTestFallback() {
  const raw = process.env.IP_MAIL_TEST_FALLBACK;
  if (raw === '0' || raw === 'off' || raw === 'false') return null;
  const explicit = String(raw || '').trim().toLowerCase();
  if (explicit) return explicit.includes('@') ? explicit : null;
  if (!isOutboundEmailOverrideEnabled()) return null;
  return DEFAULT_QA_MAIL_FALLBACK;
}

/** Configured support/QA address, ignoring whether the override is enabled. */
export function getConfiguredOutboundOverrideAddress() {
  const raw = process.env.OUTBOUND_EMAIL_OVERRIDE?.trim();
  if (!raw || raw === '0' || raw === 'off' || raw === 'false') return null;
  const value = raw.toLowerCase();
  return value.includes('@') ? value : null;
}

/**
 * Support/QA copy address (same idea as CPMU OUTBOUND_EMAIL_OVERRIDE).
 * Returns the override address only when the gate flag is enabled. When it is
 * set, sendMail adds it alongside the real recipient instead of replacing them.
 */
export function getOutboundEmailOverride() {
  if (!isOutboundEmailOverrideEnabled()) return null;
  return getConfiguredOutboundOverrideAddress();
}

/**
 * Accepts a single address, a comma-separated list, or an array (some callers
 * mail candidate + employer in one send) and returns lowercased unique entries.
 */
function normalizeRecipients(to) {
  const raw = Array.isArray(to) ? to : String(to ?? '').split(',');
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const value = String(entry || '').trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

async function sendMailOnce(opts) {
  const to = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
  if (!to) throw new Error('sendMail: to is required');

  if (isZeptoConfigured()) {
    try {
      const from = getZeptoFrom({ platformName: 'Internship Portal' });
      const result = await sendViaZeptoMail({
        to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        from,
      });
      return { ok: true, provider: 'zeptomail', to, ...result };
    } catch (err) {
      console.warn('[mail] ZeptoMail failed, trying SMTP:', err.message);
    }
  }

  const transport = smtpTransport();
  const from = smtpFrom();
  if (!transport || !from) {
    const err = new Error('No mail provider configured (ZEPTOMAIL_* or SMTP_USER/SMTP_PASS)');
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }

  const info = await transport.sendMail({
    from,
    to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return { ok: true, provider: 'smtp', to, messageId: info.messageId };
}

/**
 * Note for the dual-recipient case: the intended recipient DID get this mail,
 * the support/QA inbox simply received a copy in the same send.
 */
function withSupportCopyNote(opts, intended, copyTo, reason) {
  const bannerHtml = `<p style="color:#b45309;background:#fffbeb;border:1px solid #fcd34d;padding:8px">
      <strong>QA mail copy:</strong> Sent to <code>${intended}</code> and also to
      <code>${copyTo}</code> (${reason}).
    </p>`;
  const bannerText = `\n\n[QA MAIL COPY] Sent to: ${intended}. Also sent to: ${copyTo} (${reason}).\n`;
  return {
    ...opts,
    html: `${bannerHtml}${opts.html || ''}`,
    text: `${opts.text || ''}${bannerText}`,
  };
}

function withRedirectNote(opts, intended, deliveredTo, reason) {
  const bannerHtml = `<p style="color:#b45309;background:#fffbeb;border:1px solid #fcd34d;padding:8px">
      <strong>QA mail redirect:</strong> Intended recipient <code>${intended}</code>.
      Delivered to <code>${deliveredTo}</code> (${reason}).
    </p>`;
  const bannerText = `\n\n[QA MAIL REDIRECT] Intended: ${intended}. Delivered to: ${deliveredTo} (${reason}).\n`;
  return {
    ...opts,
    to: deliveredTo,
    subject: `[for ${intended}] ${opts.subject || ''}`.trim(),
    html: `${bannerHtml}${opts.html || ''}`,
    text: `${opts.text || ''}${bannerText}`,
  };
}

/**
 * Send to the intended recipient. When OUTBOUND_EMAIL_OVERRIDE is active, the
 * support/QA inbox is added as an extra recipient of the same send — the real
 * recipient is never dropped.
 * If delivery fails, optionally retry IP_MAIL_TEST_FALLBACK.
 *
 * @param {{ to: string|string[], subject: string, html?: string, text?: string }} opts
 */
export async function sendMail(opts) {
  const intendedList = normalizeRecipients(opts.to);
  const intended = intendedList.join(', ');
  if (!intended) throw new Error('sendMail: to is required');

  const override = getOutboundEmailOverride();
  if (override && !intendedList.includes(override)) {
    const recipients = [...intendedList, override];
    const result = await sendMailOnce({
      ...withSupportCopyNote(opts, intended, override, 'OUTBOUND_EMAIL_OVERRIDE'),
      to: recipients,
    });
    return {
      ...result,
      ok: true,
      usedOverride: true,
      intendedTo: intended,
      sentTo: intended,
      copiedTo: override,
      recipients,
    };
  }

  try {
    return await sendMailOnce({ ...opts, to: intendedList });
  } catch (primaryErr) {
    const fallback = getMailTestFallback();
    if (!fallback || intendedList.includes(fallback)) {
      throw primaryErr;
    }

    console.warn(
      `[mail] Primary send to ${intended} failed (${primaryErr.message}); retrying test fallback ${fallback}`,
    );

    const result = await sendMailOnce(
      withRedirectNote(opts, intended, fallback, `primary failed: ${String(primaryErr.message || '').slice(0, 120)}`),
    );

    return {
      ...result,
      ok: true,
      usedFallback: true,
      intendedTo: intended,
      fallbackTo: fallback,
      primaryError: primaryErr.message,
    };
  }
}

export function tempPasswordEmailHtml({ name, email, password, appName = 'Internship Portal' }) {
  const safeName = name || 'there';
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <p>Hi ${safeName},</p>
  <p>Your ${appName} account was created for <strong>${email}</strong>.</p>
  <p>Temporary password: <code style="font-size:16px">${password}</code></p>
  <p>Please sign in and change your password.</p>
  <p>— ${appName}</p>
  </body></html>`;
}
