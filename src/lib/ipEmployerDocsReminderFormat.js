import { escapeHtml } from '@/lib/escapeHtml';

/** Automated reminders per employer; after this many the job stops for good. */
export const DOCS_REMINDER_MAX_SENDS = 2;
/** Minimum gap since the last reminder or manual email (a weekly run can drift a little). */
export const DOCS_REMINDER_MIN_GAP_DAYS = 6;

export const DOCS_REMINDER_SUBJECT = 'One step left to start posting internships on InternSafar';

/** Off unless IP_EMPLOYER_DOCS_REMINDER_ENABLED is true (production only). */
export function isDocsReminderEnabled(env = process.env) {
  const raw = String(env.IP_EMPLOYER_DOCS_REMINDER_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {{ contactName?: string, accountName?: string, companyName?: string, origin: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildEmployerDocsReminderEmail({ contactName, accountName, companyName, origin }) {
  const company = clean(companyName);
  const person = clean(contactName) || clean(accountName);
  const greeting = person ? `Dear ${person},` : company ? `Dear ${company} team,` : 'Hello,';
  const thanks = company
    ? `Thank you for registering ${company} on InternSafar.`
    : 'Thank you for registering your company on InternSafar.';
  const signInUrl = `${String(origin || '').replace(/\/$/, '')}/`;
  const host = signInUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const ask =
    'Before we can approve your account, our team needs to verify your company. ' +
    `Please sign in at ${host} and upload one official business document, such as a Shop Act licence, ` +
    'incorporation certificate or Business PAN, under Profile → Documents.';
  const askHtml =
    'Before we can approve your account, our team needs to verify your company. ' +
    `Please sign in at <a href="${escapeHtml(signInUrl)}">${escapeHtml(host)}</a> and upload one official business document, ` +
    'such as a Shop Act licence, incorporation certificate or Business PAN, under <strong>Profile → Documents</strong>.';
  const closing = 'Once your account is approved, you can start posting internships straight away.';

  const text = [greeting, '', `${thanks} ${ask}`, '', closing, '', 'Kind regards,', 'Team InternSafar'].join('\n');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(thanks)} ${askHtml}</p>
  <p>${escapeHtml(closing)}</p>
  <p>Kind regards,<br>Team InternSafar</p>
  </body></html>`;

  return { subject: DOCS_REMINDER_SUBJECT, html, text };
}
