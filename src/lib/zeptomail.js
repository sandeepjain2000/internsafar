/**
 * ZeptoMail REST client (primary transactional email provider).
 * Copied/adapted from campus-placement-multiuser `src/lib/zeptomail.js`
 * (fetch instead of axios — ISM does not depend on axios).
 * Docs: https://www.zoho.com/zeptomail/help/api/email-sending.html
 */

const DEFAULT_API_URL = 'https://api.zeptomail.in/v1.1/email';

/**
 * @returns {boolean}
 */
export function isZeptoConfigured() {
  return Boolean(
    String(process.env.ZEPTOMAIL_API_KEY || '').trim()
      && String(process.env.ZEPTOMAIL_FROM_EMAIL || '').trim(),
  );
}

/**
 * @returns {{ address: string, name: string } | null}
 */
export function getZeptoFrom(platform) {
  const address = String(process.env.ZEPTOMAIL_FROM_EMAIL || '').trim();
  if (!address) return null;
  const name = String(
    process.env.ZEPTOMAIL_FROM_NAME
      || platform?.systemNotificationSenderName
      || platform?.platformName
      || 'Internship Portal',
  )
    .trim()
    .replace(/["\r\n]/g, '') || 'Internship Portal';
  return { address, name };
}

function authorizationHeader(apiKey) {
  const key = String(apiKey || '').trim();
  if (/^Zoho-enczapikey\s+/i.test(key)) return key;
  return `Zoho-enczapikey ${key}`;
}

function toZeptoRecipients(to) {
  const list = Array.isArray(to)
    ? to
    : String(to || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  return list.map((raw) => {
    const s = String(raw || '').trim();
    const m = s.match(/^(?:"?([^"<]*)"?\s*)?<([^<>]+@[^<>]+)>$/);
    if (m) {
      const name = String(m[1] || '').trim();
      const address = m[2].trim();
      return { email_address: name ? { address, name } : { address } };
    }
    return { email_address: { address: s } };
  });
}

/**
 * Send one transactional email via ZeptoMail HTTP API.
 */
export async function sendViaZeptoMail(opts) {
  const apiKey = String(process.env.ZEPTOMAIL_API_KEY || '').trim();
  if (!apiKey) throw new Error('ZEPTOMAIL_API_KEY is not set');

  const from = opts.from || getZeptoFrom(opts.platform);
  if (!from?.address) throw new Error('ZEPTOMAIL_FROM_EMAIL is not set');

  const html =
    opts.html
    || (opts.text ? String(opts.text).replace(/\n/g, '<br/>') : '');
  const text = opts.text ? String(opts.text) : undefined;
  if (!html && !text) throw new Error('Email body is empty (html/text)');

  const body = {
    from: {
      address: from.address,
      ...(from.name ? { name: from.name } : {}),
    },
    to: toZeptoRecipients(opts.to),
    subject: String(opts.subject || ''),
    ...(html ? { htmlbody: html } : {}),
    ...(text && !html ? { textbody: text } : {}),
    ...(text && html ? { textbody: text } : {}),
  };

  if (opts.replyTo) {
    const reply = String(opts.replyTo).trim();
    if (reply) {
      body.reply_to = [{
        address: reply.includes('<') ? (reply.match(/<([^>]+)>/)?.[1] || reply) : reply,
      }];
    }
  }

  const apiUrl = String(process.env.ZEPTOMAIL_API_URL || DEFAULT_API_URL).trim() || DEFAULT_API_URL;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authorizationHeader(apiKey),
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errPayload = data?.error || data;
    const msg =
      errPayload?.message
      || (typeof errPayload === 'string' ? errPayload : null)
      || `ZeptoMail HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = errPayload?.code || `HTTP_${res.status}`;
    err.response = typeof errPayload === 'string' ? errPayload : JSON.stringify(errPayload || {}).slice(0, 500);
    err.responseCode = res.status;
    throw err;
  }

  const requestId = data?.request_id || data?.requestId || null;
  return {
    messageId: requestId ? String(requestId) : null,
    requestId: requestId ? String(requestId) : null,
    response: `zeptomail:${res.status}`,
    data,
  };
}
