#!/usr/bin/env node
/**
 * Internship Portal core-sample reset (single executable).
 *
 * Execute runner — Transactions should be cleaned:
 *   1. Delete ALL non-core accounts (+ cascaded rows)
 *   2. Delete transactional data owned by the three core accounts
 *   3. Keep the three core login rows (and their profile rows) themselves
 *
 * Re-seeding (baseline catalog + fill-core-coverage) is TEMPORARILY COMMENTED OUT.
 * Re-enable later when a reseed path is re-implemented.
 *
 * Cores (passwords from local coreaccountspass.json — gitignored):
 *   Candidate   lawsonlclintern+1@gmail.com
 *   Employer    placementhubsupport@gmail.com
 *   SuperAdmin  support@placementhub.online
 *
 * Edit scripts/lib/ipCoreSampleConfig.js + ipCoreBaselinePostings.js for baseline.
 *
 * Hang note: do NOT call ensureIpPipelineSchema on every reset — it DROP/ADD FKs and
 * will wait forever for locks if the app/pooler still holds connections. Pass
 * --ensure-schema only when you intentionally need schema repair (and stop the app first).
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');
const { assertDbMigrateAllowed } = require('./assert-db-migrate-allowed');
const { assertDbMigrateTargetAllowed } = require('./assert-db-migrate-target');
assertDbMigrateAllowed(process.argv);
assertDbMigrateTargetAllowed(process.argv);

const coreCfg = require('./lib/ipCoreSampleConfig.js');
const { CORE_BASELINE_POSTINGS } = require('./lib/ipCoreBaselinePostings.js');
// Kept for when reseed is re-enabled below:
const { seedCoreBaseline } = require('./lib/ipSeedCoreBaseline.js');
void seedCoreBaseline;

const CONFIG = {
  superadminEmail: coreCfg.SUPERADMIN_EMAIL,
  legacySuperadminEmail: coreCfg.LEGACY_SUPERADMIN_EMAIL,
  candidateBase: { email: coreCfg.CAND_BASE, name: coreCfg.CAND_BASE_NAME },
  employerBase: { email: coreCfg.EMP_BASE, company: coreCfg.EMP_BASE_NAME, status: 'approved' },
  castCandidates: coreCfg.CAST_CANDIDATES,
  castEmployers: coreCfg.CAST_EMPLOYERS,
  /** Emails whose ip_users rows are never deleted */
  preserveEmails: coreCfg.PRESERVE_USER_EMAILS,
  passwordFor(email, role) {
    return coreCfg.getCorePasswordForEmailOrRole(email, role);
  },
};

function parseArgs(argv) {
  return {
    yes: argv.includes('--yes') || argv.includes('-y'),
    dryRun: argv.includes('--dry-run'),
    ensureSchema: argv.includes('--ensure-schema'),
  };
}

function resolveIpRoot(scriptDir) {
  const candidates = [
    path.resolve(scriptDir, '..'),
    scriptDir,
    path.join(scriptDir, 'internship-portal'),
    path.join(scriptDir, 'campus-placement-multiuser', 'internship-portal'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'package.json')) && fs.existsSync(path.join(p, 'scripts'))) return p;
  }
  throw new Error('Could not locate internship-portal root.');
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(String(a || '').trim()))));
}

let _qaSeq = 0;
function qaRunLabel(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
function nid(prefix) {
  _qaSeq += 1;
  return `${prefix}_${qaRunLabel()}-${String(_qaSeq).padStart(3, '0')}`;
}

function refCode(email) {
  const local = String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
  return `REF-${local}`;
}

async function tableExists(client, name) {
  const r = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [name]);
  return Boolean(r.rows[0]);
}

async function runDelete(client, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    return r.rowCount || 0;
  } catch (e) {
    if (e.code === '42P01') return 0;
    throw e;
  }
}

/**
 * Bulk-delete every non-core user in one pass (table-oriented, not per-user loops).
 * Avoids the hang/timeout pattern of N× BEGIN + dozens of DELETEs per victim.
 */
async function bulkDeleteNonCoreUsers(client, victimUsers) {
  if (!victimUsers.length) {
    console.log('No non-core users to delete.');
    return { deletedUsers: 0 };
  }

  const victimUserIds = victimUsers.map((u) => u.id);
  const victimEmails = victimUsers.map((u) => String(u.email || '').toLowerCase());
  console.log(`Bulk-deleting ${victimUserIds.length} non-core users…`);

  const cand = await client.query(
    `SELECT id FROM ip_candidates WHERE user_id = ANY($1::text[])`,
    [victimUserIds],
  );
  const emp = await client.query(
    `SELECT id FROM ip_employers WHERE user_id = ANY($1::text[])`,
    [victimUserIds],
  );
  const candidateIds = cand.rows.map((r) => r.id);
  const employerIds = emp.rows.map((r) => r.id);

  // Workbench rows block internship/user deletes — clear in bulk for all victims.
  if (employerIds.length) {
    await runDelete(client, `DELETE FROM ip_export_jobs WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(
      client,
      `DELETE FROM ip_bulk_message_recipients
       WHERE job_id IN (SELECT id FROM ip_bulk_message_jobs WHERE employer_id = ANY($1::text[]))`,
      [employerIds],
    );
    await runDelete(client, `DELETE FROM ip_bulk_message_jobs WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(
      client,
      `DELETE FROM ip_employer_list_members
       WHERE list_id IN (SELECT id FROM ip_employer_lists WHERE employer_id = ANY($1::text[]))`,
      [employerIds],
    );
    await runDelete(client, `DELETE FROM ip_employer_lists WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(client, `DELETE FROM ip_follow_up_reminders WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(client, `DELETE FROM ip_application_notes WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(client, `DELETE FROM ip_rejection_templates WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(client, `DELETE FROM ip_saved_applicant_views WHERE employer_id = ANY($1::text[])`, [employerIds]);
  }
  if (candidateIds.length) {
    await runDelete(
      client,
      `DELETE FROM ip_application_events
       WHERE application_id IN (SELECT id FROM ip_applications WHERE candidate_id = ANY($1::text[]))`,
      [candidateIds],
    );
  }
  await runDelete(client, `DELETE FROM ip_table_filter_prefs WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_export_jobs WHERE created_by_user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(
    client,
    `UPDATE ip_linkedin_promotions SET reviewed_by = NULL WHERE reviewed_by = ANY($1::text[])`,
    [victimUserIds],
  );
  await runDelete(
    client,
    `UPDATE ip_viral_shares SET reviewed_by = NULL WHERE reviewed_by = ANY($1::text[])`,
    [victimUserIds],
  );
  if (await tableExists(client, 'ip_employer_requests')) {
    await runDelete(
      client,
      `UPDATE ip_employer_requests SET reviewer_id = NULL WHERE reviewer_id = ANY($1::text[])`,
      [victimUserIds],
    );
  }

  console.log('  clearing messages / ratings / endorsements…');
  await runDelete(
    client,
    `DELETE FROM ip_messages WHERE thread_id IN (
       SELECT id FROM ip_message_threads
       WHERE candidate_user_id = ANY($1::text[]) OR employer_user_id = ANY($1::text[])
     )`,
    [victimUserIds],
  );
  await runDelete(client, `DELETE FROM ip_messages WHERE sender_user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(
    client,
    `DELETE FROM ip_message_threads WHERE candidate_user_id = ANY($1::text[]) OR employer_user_id = ANY($1::text[])`,
    [victimUserIds],
  );
  await runDelete(
    client,
    `DELETE FROM ip_ratings WHERE from_user_id = ANY($1::text[]) OR to_user_id = ANY($1::text[])`,
    [victimUserIds],
  );
  if (candidateIds.length) {
    await runDelete(client, `DELETE FROM ip_endorsements WHERE candidate_id = ANY($1::text[])`, [candidateIds]);
  }
  if (employerIds.length) {
    await runDelete(client, `DELETE FROM ip_endorsements WHERE employer_id = ANY($1::text[])`, [employerIds]);
  }

  if (employerIds.length) {
    console.log(`  clearing ${employerIds.length} non-core employers (docs/offers/postings)…`);
    await runDelete(client, `DELETE FROM ip_linkedin_promotions WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(client, `DELETE FROM ip_employer_documents WHERE employer_id = ANY($1::text[])`, [employerIds]);
    await runDelete(client, `DELETE FROM ip_offers WHERE employer_id = ANY($1::text[])`, [employerIds]);
    // Child rows of internships mostly CASCADE; explicit cleanup for SET NULL / workbench leftovers
    const posts = await client.query(`SELECT id FROM ip_internships WHERE employer_id = ANY($1::text[])`, [employerIds]);
    const postIds = posts.rows.map((r) => r.id);
    if (postIds.length) {
      await runDelete(client, `DELETE FROM ip_ratings WHERE internship_id = ANY($1::text[])`, [postIds]);
      await runDelete(client, `DELETE FROM ip_endorsements WHERE internship_id = ANY($1::text[])`, [postIds]);
      await runDelete(
        client,
        `DELETE FROM ip_messages WHERE thread_id IN (SELECT id FROM ip_message_threads WHERE internship_id = ANY($1::text[]))`,
        [postIds],
      );
      await runDelete(client, `DELETE FROM ip_message_threads WHERE internship_id = ANY($1::text[])`, [postIds]);
      await runDelete(client, `DELETE FROM ip_saved_internships WHERE internship_id = ANY($1::text[])`, [postIds]);
      await runDelete(client, `DELETE FROM ip_offers WHERE internship_id = ANY($1::text[])`, [postIds]);
      await runDelete(client, `DELETE FROM ip_applications WHERE internship_id = ANY($1::text[])`, [postIds]);
      await runDelete(client, `DELETE FROM ip_internships WHERE id = ANY($1::text[])`, [postIds]);
    }
    await runDelete(client, `DELETE FROM ip_employers WHERE id = ANY($1::text[])`, [employerIds]);
  }

  if (candidateIds.length) {
    console.log(`  clearing ${candidateIds.length} non-core candidates…`);
    await runDelete(client, `DELETE FROM ip_saved_internships WHERE candidate_id = ANY($1::text[])`, [candidateIds]);
    await runDelete(client, `DELETE FROM ip_offers WHERE candidate_id = ANY($1::text[])`, [candidateIds]);
    await runDelete(client, `DELETE FROM ip_applications WHERE candidate_id = ANY($1::text[])`, [candidateIds]);
    await runDelete(client, `DELETE FROM ip_candidates WHERE id = ANY($1::text[])`, [candidateIds]);
  }

  console.log('  clearing user-scoped rows + ip_users…');
  await runDelete(client, `DELETE FROM ip_viral_shares WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_notifications WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_points_ledger WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_password_resets WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_login_events WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_auth_sessions WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_feature_idea_votes WHERE user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(client, `DELETE FROM ip_feature_idea_comments WHERE author_user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(
    client,
    `UPDATE ip_feature_ideas SET author_user_id = NULL WHERE author_user_id = ANY($1::text[])`,
    [victimUserIds],
  );
  await runDelete(client, `DELETE FROM ip_referrals WHERE referrer_user_id = ANY($1::text[])`, [victimUserIds]);
  await runDelete(
    client,
    `UPDATE ip_referrals SET referred_user_id = NULL WHERE referred_user_id = ANY($1::text[])`,
    [victimUserIds],
  );
  if (await tableExists(client, 'ip_employer_requests')) {
    await runDelete(
      client,
      `DELETE FROM ip_employer_requests
       WHERE lower(contact_email) = ANY($1::text[]) OR created_user_id = ANY($2::text[])`,
      [victimEmails, victimUserIds],
    );
  }
  // Clear self-referral / referred_by pointing at victims before user delete
  await runDelete(
    client,
    `UPDATE ip_users SET referred_by = NULL WHERE referred_by = ANY($1::text[])`,
    [victimUserIds],
  );
  const deleted = await runDelete(client, `DELETE FROM ip_users WHERE id = ANY($1::text[])`, [victimUserIds]);
  console.log(`  deleted ip_users rows: ${deleted}`);
  return { deletedUsers: deleted };
}

async function ensureUser(client, bcrypt, { email, role, name, points = 80, password }) {
  const ex = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [email]);
  if (ex.rows[0]) {
    await client.query(`UPDATE ip_users SET role=$2,name=$3,active=true,points=GREATEST(points,$4),updated_at=now() WHERE id=$1`, [ex.rows[0].id, role, name, points]);
    return ex.rows[0].id;
  }
  const id = nid('ip_user');
  const hash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO ip_users (id,email,password_hash,role,name,points,free_post_credits,application_allowance,referral_code,profile_complete,active)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,true,true)`,
    [id, email.toLowerCase(), hash, role, name, points, refCode(email)],
  );
  return id;
}

/**
 * Demote any account holding 'superadmin' that is not the configured address, back to the role
 * its owned profile proves it is. Granting the role to the target is not enough: nothing here
 * used to remove it, so the core employer stayed a superadmin after the address swap (an older
 * deployed build promoted it via /api/ip/bootstrap against the shared database).
 * Mirrors ensureIpBootstrap and db/migrations/036_ip_single_superadmin.sql.
 */
async function demoteStraySuperadmins(client) {
  const r = await client.query(
    `UPDATE ip_users u
        SET role = CASE
                     WHEN EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id) THEN 'employer'
                     WHEN EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id) THEN 'candidate'
                     ELSE u.role
                   END,
            updated_at = now()
      WHERE u.role = 'superadmin'
        AND lower(u.email) <> lower($1)
        AND (EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id)
          OR EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id))
      RETURNING email`,
    [CONFIG.superadminEmail],
  );
  for (const row of r.rows) {
    console.log(`Demoted stray superadmin back to its profile role: ${row.email}`);
  }
  return r.rows.length;
}

async function ensureSuperadmin(client, bcrypt) {
  const saPw = CONFIG.passwordFor(CONFIG.superadminEmail, 'superadmin');
  const hash = await bcrypt.hash(saPw, 10);
  const target = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [CONFIG.superadminEmail]);
  const legacy = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [CONFIG.legacySuperadminEmail]);
  if (target.rows[0]) {
    await client.query(`UPDATE ip_users SET role='superadmin',password_hash=$2,name=COALESCE(NULLIF(name,''),'Portal SuperAdmin'),active=true,updated_at=now() WHERE id=$1`, [target.rows[0].id, hash]);
    if (legacy.rows[0] && legacy.rows[0].id !== target.rows[0].id) await client.query(`UPDATE ip_users SET active=false,updated_at=now() WHERE id=$1`, [legacy.rows[0].id]);
    return target.rows[0].id;
  }
  if (legacy.rows[0]) {
    await client.query(`UPDATE ip_users SET email=$2,role='superadmin',password_hash=$3,name='Portal SuperAdmin',active=true,updated_at=now() WHERE id=$1`, [legacy.rows[0].id, CONFIG.superadminEmail, hash]);
    return legacy.rows[0].id;
  }
  return ensureUser(client, bcrypt, { email: CONFIG.superadminEmail, role: 'superadmin', name: 'Portal SuperAdmin', points: 0, password: saPw });
}

// NOTE: a ~380-line `seedCoreData` used to sit here. It was dead code (never called) and a
// stale duplicate of the real seeding path, with its own hardcoded profile values and its own
// company_name update, so anyone editing it changed nothing. The seeding path is
// seedCoreBaseline in scripts/lib/ipSeedCoreBaseline.js — edit that.

async function clearCoreOwnedData(client, { candidateUserId, employerUserId, candidateId, employerId, superadminId }) {
  // Wipe transactional rows owned by the preserved cores so seed starts clean.
  const { deleteIpWorkbenchForActor } = require(path.join(__dirname, 'lib', 'ensureIpPipelineSchema.js'));
  const actors = [
    { userId: candidateUserId, employerId: null, candidateId },
    { userId: employerUserId, employerId, candidateId: null },
    { userId: superadminId, employerId: null, candidateId: null },
  ];
  for (const actor of actors) {
    if (!actor.userId) continue;
    await deleteIpWorkbenchForActor(client, async (_label, sql, params) => runDelete(client, sql, params), actor);
  }

  if (employerId) {
    const posts = await client.query(`SELECT id FROM ip_internships WHERE employer_id=$1`, [employerId]);
    const ids = posts.rows.map((r) => r.id);
    if (ids.length) {
      await runDelete(client, `DELETE FROM ip_ratings WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_endorsements WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_messages WHERE thread_id IN (SELECT id FROM ip_message_threads WHERE internship_id = ANY($1::text[]))`, [ids]);
      await runDelete(client, `DELETE FROM ip_message_threads WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_saved_internships WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_offers WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_applications WHERE internship_id = ANY($1::text[])`, [ids]);
      await runDelete(client, `DELETE FROM ip_internships WHERE id = ANY($1::text[])`, [ids]);
    }
    await runDelete(client, `DELETE FROM ip_linkedin_promotions WHERE employer_id=$1`, [employerId]);
    await runDelete(client, `DELETE FROM ip_offers WHERE employer_id=$1`, [employerId]);
  }
  if (candidateId) {
    await runDelete(client, `DELETE FROM ip_saved_internships WHERE candidate_id=$1`, [candidateId]);
    await runDelete(client, `DELETE FROM ip_offers WHERE candidate_id=$1`, [candidateId]);
    await runDelete(client, `DELETE FROM ip_applications WHERE candidate_id=$1`, [candidateId]);
    await runDelete(client, `DELETE FROM ip_endorsements WHERE candidate_id=$1`, [candidateId]);
  }
  const coreUserIds = [candidateUserId, employerUserId, superadminId].filter(Boolean);
  if (coreUserIds.length) {
    await runDelete(client, `DELETE FROM ip_messages WHERE thread_id IN (
      SELECT id FROM ip_message_threads WHERE candidate_user_id = ANY($1::text[]) OR employer_user_id = ANY($1::text[])
    )`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_message_threads WHERE candidate_user_id = ANY($1::text[]) OR employer_user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_ratings WHERE from_user_id = ANY($1::text[]) OR to_user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_notifications WHERE user_id = ANY($1::text[])`, [coreUserIds]);
    await runDelete(client, `DELETE FROM ip_auth_sessions WHERE user_id = ANY($1::text[])`, [coreUserIds]);
    // Keep ip_login_events — Login Report needs durable auth history across resets.
    await runDelete(client, `DELETE FROM ip_password_resets WHERE user_id = ANY($1::text[])`, [coreUserIds]);
  }
}

/**
 * Baseline seeding fills the candidate-facing lists; this tops up the employer
 * and SuperAdmin tabs/queues that the baseline does not reach.
 * @param {string} ipRoot
 */
async function runCoverageFill(ipRoot) {
  const { spawnSync } = require('child_process');
  console.log('Filling employer + SuperAdmin coverageâ€¦');
  const r = spawnSync(process.execPath, [path.join(ipRoot, 'scripts', 'fill-core-coverage.mjs')], {
    cwd: ipRoot,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.warn('Coverage fill did not complete â€” run `npm run fill:core-coverage` manually.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = __dirname;
  const ipRoot = resolveIpRoot(scriptDir);
  const ipRequire = createRequire(path.join(ipRoot, 'package.json'));
  const pg = ipRequire('pg');
  const bcrypt = ipRequire('bcryptjs');

  const env = {
    ...readEnvFile(path.join(ipRoot, '.env')),
    ...readEnvFile(path.join(ipRoot, '.env.local')),
    ...process.env,
  };
  const connectionString = env.DATABASE_URL || env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error(`DATABASE_URL missing in ${ipRoot}`);

  coreCfg.assertProtectedConfigValid();

  const preserve = new Set(
    (CONFIG.preserveEmails || []).map((e) => String(e).toLowerCase()),
  );
  // Always include the three demo logins
  preserve.add(CONFIG.superadminEmail.toLowerCase());
  preserve.add(CONFIG.candidateBase.email.toLowerCase());
  preserve.add(CONFIG.employerBase.email.toLowerCase());

  // Refuse AWS RDS from laptop/Vercel (assert-db-migrate-target already ran).
  const host = (() => {
    try {
      return new URL(connectionString).hostname;
    } catch {
      return '';
    }
  })();
  console.log(`DB host: ${host || '(unparsed)'}`);

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // Fail fast instead of hanging forever on lock waits (common with pooler + live app).
    await client.query(`SET lock_timeout = '15s'`);
    await client.query(`SET statement_timeout = '180s'`);

    if (args.ensureSchema) {
      console.log('Ensuring pipeline schema (--ensure-schema)…');
      const { ensureIpPipelineSchema } = require(path.join(
        ipRoot,
        'scripts',
        'lib',
        'ensureIpPipelineSchema.js',
      ));
      await ensureIpPipelineSchema(client);
    } else {
      console.log('Skipping ensureIpPipelineSchema (pass --ensure-schema to force; stop the app first).');
    }

    const users = await client.query(`SELECT id,email,role FROM ip_users ORDER BY role,email`);
    const toDelete = users.rows.filter((u) => !preserve.has(String(u.email || '').toLowerCase()));
    console.log(`IP root: ${ipRoot}`);
    console.log(`Preserve cores: ${[...preserve].join(', ')}`);
    console.log(`Users in DB: ${users.rows.length}; will remove: ${toDelete.length}`);
    console.log(`Baseline Nova postings available (reseed commented out): ${CORE_BASELINE_POSTINGS.length}`);
    if (args.dryRun) {
      console.log('Dry run only. Sample delete emails:');
      for (const u of toDelete.slice(0, 15)) console.log(`  - ${u.email}`);
      if (toDelete.length > 15) console.log(`  … +${toDelete.length - 15} more`);
      return;
    }
    if (!args.yes) {
      const c = await ask('Type RESET to continue: ');
      if (c !== 'RESET') return console.log('Cancelled.');
    }

    await bulkDeleteNonCoreUsers(client, toDelete);

    const superadminId = await ensureSuperadmin(client, bcrypt);
    const candPw = CONFIG.passwordFor(CONFIG.candidateBase.email, 'candidate');
    const empPw = CONFIG.passwordFor(CONFIG.employerBase.email, 'employer');
    // Ensure core login rows exist / password restored (do not delete them)
    const candUserId = await ensureUser(client, bcrypt, {
      email: CONFIG.candidateBase.email,
      role: 'candidate',
      name: CONFIG.candidateBase.name,
      points: 80,
      password: candPw,
    });
    await client.query(
      `UPDATE ip_users SET password_hash=$2, name=$3, active=true, role='candidate', updated_at=now() WHERE id=$1`,
      [candUserId, await bcrypt.hash(candPw, 10), CONFIG.candidateBase.name],
    );
    const empUserId = await ensureUser(client, bcrypt, {
      email: CONFIG.employerBase.email,
      role: 'employer',
      name: CONFIG.employerBase.company,
      points: 200,
      password: empPw,
    });
    await client.query(
      `UPDATE ip_users SET password_hash=$2, name=$3, active=true, role='employer', updated_at=now() WHERE id=$1`,
      [empUserId, await bcrypt.hash(empPw, 10), CONFIG.employerBase.company],
    );

    const candRow = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [candUserId]);
    const empRow = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [empUserId]);

    console.log('Clearing transactional data on preserved cores…');
    await clearCoreOwnedData(client, {
      candidateUserId: candUserId,
      employerUserId: empUserId,
      candidateId: candRow.rows[0]?.id || null,
      employerId: empRow.rows[0]?.id || null,
      superadminId,
    });

    for (const table of [
      'ip_feature_idea_votes',
      'ip_feature_idea_comments',
      'ip_feature_ideas',
      'ip_employer_requests',
    ]) {
      if (await tableExists(client, table)) {
        const r = await client.query(`DELETE FROM ${table}`);
        console.log(`  cleared ${table}: ${r.rowCount || 0}`);
      }
    }

    // --- Re-seed temporarily disabled (revisit later) ---
    // await seedCoreBaseline(client, bcrypt);
    // await runCoverageFill(ipRoot);
    console.log('Re-seed skipped (seedCoreBaseline + fill-core-coverage commented out).');

    await demoteStraySuperadmins(client);
    console.log('Reset complete. Three cores preserved; non-cores deleted; core transactions cleaned; no reseed.');
    console.log(`  Candidate  ${CONFIG.candidateBase.email}  (password from coreaccountspass.json)`);
    console.log(`  Employer   ${CONFIG.employerBase.email}  (password from coreaccountspass.json)`);
    console.log(`  SuperAdmin ${CONFIG.superadminEmail}  (password from coreaccountspass.json)`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
