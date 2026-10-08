import { query } from '@/lib/db';
import { sendMail } from '@/lib/mail';
import { resolveAppOrigin } from '@/lib/ipAppOrigin';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';
import { ensureIpEmployerDocumentSlotsSchema } from '@/lib/ipEmployerDocuments';
import { ensureIpCoreAccountSchema } from '@/lib/ipCoreAccount';
import {
  DOCS_REMINDER_MAX_SENDS,
  DOCS_REMINDER_MIN_GAP_DAYS,
  buildEmployerDocsReminderEmail,
  isDocsReminderEnabled,
} from '@/lib/ipEmployerDocsReminderFormat';

let schemaReady = false;

/** `ip_employer_docs_reminders` — same shape as db/migrations/050_ip_employer_docs_reminders.sql. */
export async function ensureIpEmployerDocsReminderSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ip_employer_docs_reminders (
      employer_id TEXT PRIMARY KEY REFERENCES ip_employers(id) ON DELETE CASCADE,
      sent_count INT NOT NULL DEFAULT 0,
      first_sent_at TIMESTAMPTZ,
      last_sent_at TIMESTAMPTZ,
      manual_contact_at TIMESTAMPTZ,
      last_error TEXT,
      last_error_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_docs_reminders_sent_count_check'
      ) THEN
        ALTER TABLE ip_employer_docs_reminders
          ADD CONSTRAINT ip_employer_docs_reminders_sent_count_check CHECK (sent_count >= 0);
      END IF;
    END $$;
  `);
  schemaReady = true;
}

async function ensureSchemas() {
  await ensureIpAccountSettingsSchema();
  await ensureIpEmployerApprovalSchema();
  await ensureIpEmployerDocumentSlotsSchema();
  await ensureIpCoreAccountSchema();
  await ensureIpEmployerDocsReminderSchema();
}

/**
 * Pending, email-verified, active employers with no active document, under the send cap,
 * and at least a week since the last reminder or manual email.
 */
export async function listEmployersDueForDocsReminder({ employerId = null, limit = 200 } = {}) {
  await ensureSchemas();
  const params = [DOCS_REMINDER_MAX_SENDS, DOCS_REMINDER_MIN_GAP_DAYS, limit];
  let employerFilter = '';
  if (employerId) {
    params.push(employerId);
    employerFilter = `AND e.id = $${params.length}`;
  }
  const res = await query(
    `SELECT e.id AS employer_id, e.company_name, e.contact_name, e.created_at AS registered_at,
            u.email, u.name AS account_name,
            coalesce(r.sent_count, 0) AS sent_count, r.last_sent_at, r.manual_contact_at
     FROM ip_employers e
     JOIN ip_users u ON u.id = e.user_id
     LEFT JOIN ip_employer_docs_reminders r ON r.employer_id = e.id
     WHERE e.approval_status = 'pending'
       AND u.role = 'employer'
       AND u.active = true
       AND u.email_verified_at IS NOT NULL
       AND u.generated_run_id IS NULL
       AND u.is_core_account = false
       AND NOT EXISTS (
         SELECT 1 FROM ip_employer_documents d
         WHERE d.employer_id = e.id AND d.superseded_at IS NULL
       )
       AND coalesce(r.sent_count, 0) < $1::int
       AND (
         greatest(r.last_sent_at, r.manual_contact_at) IS NULL
         OR greatest(r.last_sent_at, r.manual_contact_at) <= now() - make_interval(days => $2::int)
       )
       ${employerFilter}
     ORDER BY e.created_at ASC
     LIMIT $3::int`,
    params,
  );
  return res.rows;
}

async function recordSent(employerId) {
  const res = await query(
    `INSERT INTO ip_employer_docs_reminders (employer_id, sent_count, first_sent_at, last_sent_at)
     VALUES ($1, 1, now(), now())
     ON CONFLICT (employer_id) DO UPDATE SET
       sent_count = ip_employer_docs_reminders.sent_count + 1,
       first_sent_at = coalesce(ip_employer_docs_reminders.first_sent_at, now()),
       last_sent_at = now(),
       last_error = NULL,
       last_error_at = NULL,
       updated_at = now()
     RETURNING sent_count`,
    [employerId],
  );
  return res.rows[0]?.sent_count ?? null;
}

async function recordFailure(employerId, message) {
  await query(
    `INSERT INTO ip_employer_docs_reminders (employer_id, last_error, last_error_at)
     VALUES ($1, $2, now())
     ON CONFLICT (employer_id) DO UPDATE SET
       last_error = EXCLUDED.last_error,
       last_error_at = now(),
       updated_at = now()`,
    [employerId, String(message || 'send failed').slice(0, 500)],
  );
}

/**
 * Weekly job. Each due employer gets one personalised email; the tracking row is updated only after
 * a successful send. `force` (bypass the env switch) is allowed only together with one `employerId`.
 *
 * @param {{ dryRun?: boolean, force?: boolean, employerId?: string|null, limit?: number }} opts
 */
export async function runEmployerDocsReminders(opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const employerId = opts.employerId ? String(opts.employerId).trim() : null;
  const force = Boolean(opts.force);
  if (force && !employerId) {
    return { ok: false, error: 'force is only allowed with a single employerId' };
  }
  const enabled = isDocsReminderEnabled();
  if (!dryRun && !enabled && !force) {
    return {
      ok: true,
      skipped: true,
      reason: 'Employer documents reminder is off. Set IP_EMPLOYER_DOCS_REMINDER_ENABLED=true (production only).',
    };
  }

  const due = await listEmployersDueForDocsReminder({ employerId, limit: opts.limit || 200 });
  const summary = {
    ok: true,
    dryRun,
    enabled,
    maxSends: DOCS_REMINDER_MAX_SENDS,
    due: due.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };
  if (!due.length) return summary;

  const origin = resolveAppOrigin();
  for (const row of due) {
    const item = {
      employerId: row.employer_id,
      company: row.company_name,
      email: row.email,
      sentBefore: Number(row.sent_count) || 0,
    };
    if (dryRun) {
      summary.items.push({ ...item, status: 'would_send' });
      continue;
    }
    const mail = buildEmployerDocsReminderEmail({
      contactName: row.contact_name,
      accountName: row.account_name,
      companyName: row.company_name,
      origin,
    });
    try {
      const result = await sendMail({ to: row.email, ...mail });
      if (result?.skipped) {
        summary.skipped += 1;
        summary.items.push({ ...item, status: 'skipped', reason: result.reason || 'skipped' });
        continue;
      }
      const sentCount = await recordSent(row.employer_id);
      summary.sent += 1;
      summary.items.push({ ...item, status: 'sent', sentCount });
    } catch (err) {
      summary.failed += 1;
      summary.items.push({ ...item, status: 'failed', error: err?.message || String(err) });
      await recordFailure(row.employer_id, err?.message).catch((e) =>
        console.error('[docs-reminder] could not record failure', e.message),
      );
    }
  }
  return summary;
}
