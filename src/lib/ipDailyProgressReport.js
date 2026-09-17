/**
 * Daily progress report (IST calendar day) — Zepto via sendMail.
 * Internal-only compact summary.
 * To: IP_DAILY_PROGRESS_REPORT_TO or placementhubsupport@gmail.com
 *
 * Metrics (only):
 *   Primary: candidates, employers
 *   Secondary: postings, applications
 *   Each for Today (IST) + Cumulative
 *   Pending review: employers registered but not yet approved (approval_status=pending)
 *
 * Standing schedule (UTC on EC2 — do NOT rely on CRON_TZ):
 *   TEST: 12:50 IST = 07:20 UTC → "20 7 * * *"
 *   Prod target 21:00 IST = 15:30 UTC → "30 15 * * *"
 *   Vercel TESTING: EC2 curls the Vercel URL (Hobby vercel.json cron disabled for this job).
 *
 * Subject: [InternSafar][AWS|Vercel|Local][DAILY][PRODUCTION|TESTING|LOCAL] YYYY-MM-DD HH:MM (IST)
 */
import { query } from '@/lib/db';
import { sendMail } from '@/lib/mail';

export const DAILY_PROGRESS_REPORT_TO =
  String(process.env.IP_DAILY_PROGRESS_REPORT_TO || 'placementhubsupport@gmail.com')
    .trim()
    .toLowerCase() || 'placementhubsupport@gmail.com';

const IST = 'Asia/Kolkata';

function hostLabel() {
  if (process.env.VERCEL) return 'vercel';
  const url = String(process.env.NEXTAUTH_URL || '').toLowerCase();
  if (url.includes('internsafar.com')) return 'aws';
  if (url.includes('localhost')) return 'local';
  return process.env.NODE_ENV || 'unknown';
}

/** @returns {'PRODUCTION' | 'TESTING' | 'LOCAL'} */
export function environmentKind(host = hostLabel()) {
  if (host === 'aws') return 'PRODUCTION';
  if (host === 'vercel') return 'TESTING';
  return 'LOCAL';
}

/**
 * Enabled by default on AWS, Vercel, and local (both schedules send mail).
 * Set IP_DAILY_PROGRESS_REPORT_ENABLED=false/off/0/no to disable.
 * Explicit true/on/1/yes also enables. force=true bypasses for one-off tests.
 */
export function isDailyProgressReportEnabled(force = false) {
  if (force) return true;
  const raw = String(process.env.IP_DAILY_PROGRESS_REPORT_ENABLED ?? '')
    .trim()
    .toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
  return true;
}

async function ensureGeneratedRunColumn() {
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS generated_run_id TEXT`);
}

async function countInt(sql, params = []) {
  const r = await query(sql, params);
  return Number(r.rows[0]?.n || 0);
}

/** IST day bounds as timestamptz [start, end). Also returns HH:MM (no seconds). */
export async function getIstDayBounds(now = new Date()) {
  const r = await query(
    `SELECT
       (date_trunc('day', $1::timestamptz AT TIME ZONE '${IST}') AT TIME ZONE '${IST}') AS day_start,
       ((date_trunc('day', $1::timestamptz AT TIME ZONE '${IST}') + interval '1 day') AT TIME ZONE '${IST}') AS day_end,
       to_char(($1::timestamptz AT TIME ZONE '${IST}'), 'YYYY-MM-DD') AS day_label,
       to_char(($1::timestamptz AT TIME ZONE '${IST}'), 'HH24:MI') AS time_label`,
    [now.toISOString()],
  );
  const row = r.rows[0];
  return {
    dayStart: row.day_start,
    dayEnd: row.day_end,
    dayLabel: row.day_label,
    timeLabel: row.time_label,
  };
}

function platformTag(host) {
  if (host === 'aws') return 'AWS';
  if (host === 'vercel') return 'Vercel';
  return 'Local';
}

/**
 * Compact metrics: Today + Cumulative + Pending review (employers awaiting approval).
 * timeLabel is real IST wall-clock at send (do not fake/schedule-stamp).
 */
export async function collectDailyProgressMetrics(now = new Date()) {
  await ensureGeneratedRunColumn();
  const { dayStart, dayEnd, dayLabel, timeLabel } = await getIstDayBounds(now);
  const host = hostLabel();

  const notGen = `u.generated_run_id IS NULL`;
  const inDay = (col) => `${col} >= $1 AND ${col} < $2`;

  const today = {
    candidates: await countInt(
      `SELECT count(*)::int AS n FROM ip_users u
       WHERE u.role = 'candidate' AND ${notGen} AND ${inDay('u.created_at')}`,
      [dayStart, dayEnd],
    ),
    employers: await countInt(
      `SELECT count(*)::int AS n FROM ip_users u
       WHERE u.role = 'employer' AND ${notGen} AND ${inDay('u.created_at')}`,
      [dayStart, dayEnd],
    ),
    postings: await countInt(
      `SELECT count(*)::int AS n FROM ip_internships i
       JOIN ip_employers e ON e.id = i.employer_id
       JOIN ip_users u ON u.id = e.user_id
       WHERE ${notGen} AND ${inDay('i.created_at')}`,
      [dayStart, dayEnd],
    ),
    applications: await countInt(
      `SELECT count(*)::int AS n FROM ip_applications a
       JOIN ip_candidates c ON c.id = a.candidate_id
       JOIN ip_users u ON u.id = c.user_id
       WHERE ${notGen} AND ${inDay('a.created_at')}`,
      [dayStart, dayEnd],
    ),
  };

  const cumulative = {
    candidates: await countInt(
      `SELECT count(*)::int AS n FROM ip_users u WHERE u.role = 'candidate' AND ${notGen}`,
    ),
    employers: await countInt(
      `SELECT count(*)::int AS n FROM ip_users u WHERE u.role = 'employer' AND ${notGen}`,
    ),
    postings: await countInt(
      `SELECT count(*)::int AS n FROM ip_internships i
       JOIN ip_employers e ON e.id = i.employer_id
       JOIN ip_users u ON u.id = e.user_id
       WHERE ${notGen}`,
    ),
    applications: await countInt(
      `SELECT count(*)::int AS n FROM ip_applications a
       JOIN ip_candidates c ON c.id = a.candidate_id
       JOIN ip_users u ON u.id = c.user_id
       WHERE ${notGen}`,
    ),
  };

  // Snapshot backlog: registered employers not yet SuperAdmin-approved
  const pendingReview = {
    employers: await countInt(
      `SELECT count(*)::int AS n FROM ip_employers e
       JOIN ip_users u ON u.id = e.user_id
       WHERE e.approval_status = 'pending' AND ${notGen}`,
    ),
  };

  return { dayLabel, timeLabel, host, dayStart, dayEnd, today, cumulative, pendingReview };
}

export function formatDailyProgressEmail(metrics) {
  const { dayLabel, timeLabel, host, today, cumulative, pendingReview } = metrics;
  const envKind = environmentKind(host);
  const envTag =
    envKind === 'PRODUCTION' ? 'PRODUCTION' : envKind === 'TESTING' ? 'TESTING' : 'LOCAL';
  const plat = platformTag(host);

  // Distinct subjects so Gmail does not conversation-thread AWS + Vercel into one row.
  // Still two separate Zepto sends (EC2 local job + EC2 curl → Vercel).
  const subject =
    plat === 'AWS'
      ? `InternSafar AWS PRODUCTION daily — ${dayLabel} ${timeLabel} IST`
      : plat === 'Vercel'
        ? `InternSafar Vercel TESTING daily — ${dayLabel} ${timeLabel} IST`
        : `InternSafar Local ${envTag} daily — ${dayLabel} ${timeLabel} IST`;

  const text = [
    `InternSafar daily — ${plat} | ${envTag} | ${dayLabel} ${timeLabel} IST | ${host}`,
    'Internal only',
    '',
    'Today',
    `  Number of candidates:    ${today.candidates}`,
    `  Number of employers:     ${today.employers}`,
    `  Number of postings:      ${today.postings}`,
    `  Number of applications:  ${today.applications}`,
    '',
    'Cumulative',
    `  Number of candidates:    ${cumulative.candidates}`,
    `  Number of employers:     ${cumulative.employers}`,
    `  Number of postings:      ${cumulative.postings}`,
    `  Number of applications:  ${cumulative.applications}`,
    '',
    'Pending review',
    `  Number of employers:     ${pendingReview?.employers ?? 0}`,
  ].join('\n');

  const html = `<pre style="font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.4;white-space:pre-wrap">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</pre>`;

  return { subject, text, html, envKind };
}

/**
 * @param {{ force?: boolean, dryRun?: boolean, now?: Date }} opts
 */
export async function runDailyProgressReport(opts = {}) {
  const force = Boolean(opts.force);
  const dryRun = Boolean(opts.dryRun);

  if (!isDailyProgressReportEnabled(force)) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Daily progress report disabled. Unset IP_DAILY_PROGRESS_REPORT_ENABLED or set it true, or pass force=1 for a one-off test.',
      host: hostLabel(),
    };
  }

  const metrics = await collectDailyProgressMetrics(opts.now || new Date());
  const { subject, text, html } = formatDailyProgressEmail(metrics);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      to: DAILY_PROGRESS_REPORT_TO,
      subject,
      metrics,
      preview: text,
    };
  }

  await sendMail({
    to: DAILY_PROGRESS_REPORT_TO,
    subject,
    text,
    html,
  });

  return {
    ok: true,
    sent: true,
    to: DAILY_PROGRESS_REPORT_TO,
    subject,
    host: metrics.host,
    dayLabel: metrics.dayLabel,
    metrics,
  };
}
