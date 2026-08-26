#!/usr/bin/env node
/** One-off audit: core accounts list/tab volumes vs PAGE_SIZE 10 (≥11 for Next). */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

const MIN = 11;
const CAND = 'lawsonlclintern+1@gmail.com';
const EMP = 'shreekar.nyayapathi23+2@vit.edu';
const SA = 'placementhubsupport@gmail.com';

function parseUrl(rawUrl) {
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
  };
}

function appTabs(rows) {
  const m = { applied: 0, review: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 };
  for (const r of rows) {
    const s = String(r.status || '');
    const n = Number(r.n || 0);
    if (s === 'applied' || s === 'pending') m.applied += n;
    else if (s === 'shortlisted') m.review += n;
    else if (s === 'interviewing') m.interview += n;
    else if (s === 'offered' || s === 'hired' || s === 'completed') m.offer += n;
    else if (s === 'rejected' || s === 'declined_offer') m.rejected += n;
    else if (s === 'withdrawn') m.withdrawn += n;
  }
  return m;
}

const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
if (!rawUrl) throw new Error('DATABASE_URL missing');
const pool = new pg.Pool(parseUrl(rawUrl));

try {
  const users = await pool.query(
    `SELECT id, email, role FROM ip_users WHERE lower(email) = ANY($1::text[])`,
    [[CAND, EMP, SA].map((e) => e.toLowerCase())],
  );
  const by = Object.fromEntries(users.rows.map((r) => [String(r.email).toLowerCase(), r]));
  const cand = by[CAND.toLowerCase()];
  const emp = by[EMP.toLowerCase()];
  const sa = by[SA.toLowerCase()];
  if (!cand || !emp || !sa) throw new Error('Core users missing');

  const candRow = (await pool.query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [cand.id])).rows[0];
  const empRow = (await pool.query(`SELECT id FROM ip_employers WHERE user_id = $1`, [emp.id])).rows[0];

  const appByStatus = (
    await pool.query(
      `SELECT status, count(*)::int AS n FROM ip_applications WHERE candidate_id = $1 GROUP BY status`,
      [candRow.id],
    )
  ).rows;
  const offerByStatus = Object.fromEntries(
    (
      await pool.query(
        `SELECT status, count(*)::int AS n FROM ip_offers WHERE candidate_id = $1 GROUP BY status`,
        [candRow.id],
      )
    ).rows.map((r) => [r.status, r.n]),
  );
  const threads = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_message_threads WHERE candidate_user_id = $1`, [cand.id]))
      .rows[0].n,
  );
  const saved = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_saved_internships WHERE candidate_id = $1`, [candRow.id]))
      .rows[0].n,
  );
  const refs = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_referrals WHERE referrer_user_id = $1`, [cand.id])).rows[0]
      .n,
  );
  const unread = Number(
    (
      await pool.query(
        `SELECT count(*)::int AS n FROM ip_notifications WHERE user_id = $1 AND read_at IS NULL`,
        [cand.id],
      )
    ).rows[0].n,
  );
  const notifCat = Object.fromEntries(
    (
      await pool.query(
        `SELECT coalesce(category,'system') AS category, count(*)::int AS n
         FROM ip_notifications WHERE user_id = $1 GROUP BY 1`,
        [cand.id],
      )
    ).rows.map((r) => [r.category, r.n]),
  );
  const ideas = Number((await pool.query(`SELECT count(*)::int AS n FROM ip_feature_ideas`)).rows[0].n);
  const published = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_internships WHERE status = 'published'`)).rows[0].n,
  );
  // Candidate Browse uses CANDIDATE_VISIBLE (live window), not merely status=published.
  const visibleNow = Number(
    (
      await pool.query(
        `SELECT count(*)::int AS n FROM ip_internships i
         WHERE i.status = 'published'
           AND (i.starts_at IS NULL OR i.starts_at <= now())
           AND (i.apply_ends_at IS NULL OR i.apply_ends_at > now())`,
      )
    ).rows[0].n,
  );
  const empApps = Number(
    (
      await pool.query(
        `SELECT count(*)::int AS n FROM ip_applications a
         JOIN ip_internships i ON i.id = a.internship_id WHERE i.employer_id = $1`,
        [empRow.id],
      )
    ).rows[0].n,
  );
  const empOffers = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_offers WHERE employer_id = $1`, [empRow.id])).rows[0].n,
  );
  const empThreads = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_message_threads WHERE employer_user_id = $1`, [emp.id]))
      .rows[0].n,
  );
  const empNotifs = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_notifications WHERE user_id = $1`, [emp.id])).rows[0].n,
  );
  const saNotifs = Number(
    (await pool.query(`SELECT count(*)::int AS n FROM ip_notifications WHERE user_id = $1`, [sa.id])).rows[0].n,
  );

  const tabs = appTabs(appByStatus);
  const fails = [];
  for (const [k, v] of Object.entries(tabs)) {
    if (v < MIN) fails.push(`cand.app.${k}=${v}`);
  }
  for (const s of ['pending', 'accepted', 'declined', 'expired']) {
    if ((offerByStatus[s] || 0) < MIN) fails.push(`cand.offer.${s}=${offerByStatus[s] || 0}`);
  }
  if (threads < MIN) fails.push(`cand.threads=${threads}`);
  if (saved < MIN) fails.push(`cand.saved=${saved}`);
  if (refs < MIN) fails.push(`cand.refs=${refs}`);
  if (ideas < MIN) fails.push(`ideas=${ideas}`);
  if (published < MIN) fails.push(`published=${published}`);
  if (visibleNow < MIN) fails.push(`published_visible_now=${visibleNow}`);
  if (unread < MIN) fails.push(`cand.unread=${unread}`);
  for (const c of ['application', 'offer', 'interview', 'message', 'referral']) {
    if ((notifCat[c] || 0) < MIN) fails.push(`cand.notif.${c}=${notifCat[c] || 0}`);
  }
  if (empApps < MIN) fails.push(`emp.apps=${empApps}`);
  if (empOffers < MIN) fails.push(`emp.offers=${empOffers}`);
  if (empThreads < MIN) fails.push(`emp.threads=${empThreads}`);
  if (empNotifs < MIN) fails.push(`emp.notifs=${empNotifs}`);
  if (saNotifs < MIN) fails.push(`sa.notifs=${saNotifs}`);

  console.log(
    JSON.stringify(
      {
        ok: fails.length === 0,
        fails,
        candidate: { tabs, offers: offerByStatus, threads, saved, refs, unread, notifs: notifCat, appRaw: appByStatus },
        employer: { apps: empApps, offers: empOffers, threads: empThreads, notifs: empNotifs },
        superadmin: { notifs: saNotifs, ideas },
        published,
        published_visible_now: visibleNow,
      },
      null,
      2,
    ),
  );
  process.exit(fails.length ? 1 : 0);
} finally {
  await pool.end();
}
