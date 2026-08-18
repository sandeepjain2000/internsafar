/**
 * ZeptoMail primary with SMTP backup (Placement Hub pattern, simplified).
 *
 * Recipient resolution (mirrors campus-placement-multiuser mailer):
 * 1. OUTBOUND_EMAIL_OVERRIDE — when set, ALL outbound mail goes there (QA inbox / Zoho)
 * 2. Else send to the intended address; on failure, optional IP_MAIL_TEST_FALLBACK
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

/** Failure-only fallback when primary intended send fails (and override is unset). */
export function getMailTestFallback() {
  const raw = process.env.IP_MAIL_TEST_FALLBACK;
  if (raw === '0' || raw === 'off' || raw === 'false') return null;
  const value = String(raw || DEFAULT_QA_MAIL_FALLBACK).trim().toLowerCase();
  return value.includes('@') ? value : null;
}

/**
 * Force-all-outbound override (same idea as CPMU OUTBOUND_EMAIL_OVERRIDE).
 * When set, every sendMail goes to this address regardless of intended To.
 */
export function getOutboundEmailOverride() {
  const raw = process.env.OUTBOUND_EMAIL_OVERRIDE?.trim();
  if (!raw || raw === '0' || raw === 'off' || raw === 'false') return null;
  const value = raw.toLowerCase();
  return value.includes('@') ? value : null;
}

async function sendMailOnce(opts) {
  const to = opts.to;
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
 * Prefer OUTBOUND_EMAIL_OVERRIDE (all mail → QA inbox).
 * Else send to user’s address; only if that fails, retry IP_MAIL_TEST_FALLBACK.
 *
 * @param {{ to: string, subject: string, html?: string, text?: string }} opts
 */
export async function sendMail(opts) {
  const intended = String(opts.to || '')
    .trim()
    .toLowerCase();
  if (!intended) throw new Error('sendMail: to is required');

  const override = getOutboundEmailOverride();
  if (override) {
    const payload =
      override === intended
        ? { ...opts, to: override }
        : withRedirectNote(opts, intended, override, 'OUTBOUND_EMAIL_OVERRIDE');
    const result = await sendMailOnce(payload);
    return {
      ...result,
      ok: true,
      usedOverride: true,
      intendedTo: intended,
      sentTo: override,
    };
  }

  try {
    return await sendMailOnce({ ...opts, to: intended });
  } catch (primaryErr) {
    const fallback = getMailTestFallback();
    if (!fallback || fallback === intended) {
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
