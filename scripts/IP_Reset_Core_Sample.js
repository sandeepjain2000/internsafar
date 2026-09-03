#!/usr/bin/env node
/**
 * Internship Portal core-sample reset (single executable).
 *
 * Preserves the 3 demo login accounts (candidate / employer / superadmin),
 * deletes everyone else (+ cascade), clears core transactional data, then
 * re-seeds â‰ˆ2 pages of meaningful rows for those cores (+ support cast) and
 * finally runs scripts/fill-core-coverage.mjs for the employer + SuperAdmin
 * tabs, queues, and workbench tables the baseline does not reach.
 *
 * Cores (password Admin@123):
 *   Candidate   lawsonlclintern+1@gmail.com
 *   Employer    placementhubsupport@gmail.com
 *   SuperAdmin  support@placementhub.online
 *
 * Edit scripts/lib/ipCoreSampleConfig.js + ipCoreBaselinePostings.js for baseline.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');
const { assertDbMigrateAllowed } = require('./assert-db-migrate-allowed');
assertDbMigrateAllowed(process.argv);

const coreCfg = require('./lib/ipCoreSampleConfig.js');
const { CORE_BASELINE_POSTINGS } = require('./lib/ipCoreBaselinePostings.js');
const { seedCoreBaseline } = require('./lib/ipSeedCoreBaseline.js');

const CONFIG = {
  superadminEmail: coreCfg.SUPERADMIN_EMAIL,
  legacySuperadminEmail: coreCfg.LEGACY_SUPERADMIN_EMAIL,
  demoPassword: coreCfg.DEMO_PASSWORD,
  candidateBase: { email: coreCfg.CAND_BASE, name: coreCfg.CAND_BASE_NAME },
  employerBase: { email: coreCfg.EMP_BASE, company: coreCfg.EMP_BASE_NAME, status: 'approved' },
  castCandidates: coreCfg.CAST_CANDIDATES,
  castEmployers: coreCfg.CAST_EMPLOYERS,
  /** Emails whose ip_users rows are never deleted */
  preserveEmails: coreCfg.PRESERVE_USER_EMAILS,
};

function parseArgs(argv) {
  return { yes: argv.includes('--yes') || argv.includes('-y'), dryRun: argv.includes('--dry-run') };
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

async function deleteUserCascade(client, userId, email) {
  const cand = await client.query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [userId]);
  const emp = await client.query(`SELECT id FROM ip_employers WHERE user_id = $1`, [userId]);
  const candidateId = cand.rows[0]?.id || null;
  const employerId = emp.rows[0]?.id || null;

  await client.query('BEGIN');
  try {
    await runDelete(client, `DELETE FROM ip_messages WHERE thread_id IN (SELECT id FROM ip_message_threads WHERE candidate_user_id=$1 OR employer_user_id=$1)`, [userId]);
    await runDelete(client, `DELETE FROM ip_messages WHERE sender_user_id=$1`, [userId]);
    await runDelete(client, `DELETE FROM ip_message_threads WHERE candidate_user_id=$1 OR employer_user_id=$1`, [userId]);
    await runDelete(client, `DELETE FROM ip_ratings WHERE from_user_id=$1 OR to_user_id=$1`, [userId]);
    await runDelete(client, `DELETE FROM ip_endorsements WHERE ($1::text IS NOT NULL AND candidate_id=$1) OR ($2::text IS NOT NULL AND employer_id=$2)`, [candidateId, employerId]);
    const { deleteIpWorkbenchForActor } = require(path.join(__dirname, 'lib', 'ensureIpPipelineSchema.js'));
    await deleteIpWorkbenchForActor(client, async (_label, sql, params) => runDelete(client, sql, params), {
      userId,
      employerId,
      candidateId,
    });

    if (employerId) {
      await runDelete(client, `DELETE FROM ip_linkedin_promotions WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_employer_documents WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_offers WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_internships WHERE employer_id=$1`, [employerId]);
      await runDelete(client, `DELETE FROM ip_employers WHERE id=$1`, [employerId]);
    }
    if (candidateId) {
      await runDelete(client, `DELETE FROM ip_saved_internships WHERE candidate_id=$1`, [candidateId]);
      await runDelete(client, `DELETE FROM ip_offers WHERE candidate_id=$1`, [candidateId]);
      await runDelete(client, `DELETE FROM ip_applications WHERE candidate_id=$1`, [candidateId]);
      await runDelete(client, `DELETE FROM ip_candidates WHERE id=$1`, [candidateId]);
    }

    for (const [sql, params] of [
    [`DELETE FROM ip_viral_shares WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_notifications WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_points_ledger WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_password_resets WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_login_events WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_auth_sessions WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_feature_idea_votes WHERE user_id=$1`, [userId]],
    [`DELETE FROM ip_feature_idea_comments WHERE author_user_id=$1`, [userId]],
    [`UPDATE ip_feature_ideas SET author_user_id=NULL WHERE author_user_id=$1`, [userId]],
    [`DELETE FROM ip_referrals WHERE referrer_user_id=$1`, [userId]],
    [`UPDATE ip_referrals SET referred_user_id=NULL WHERE referred_user_id=$1`, [userId]],
    [`DELETE FROM ip_employer_requests WHERE lower(contact_email)=lower($1) OR created_user_id=$2`, [email, userId]],
    [`DELETE FROM ip_users WHERE id=$1`, [userId]],
  ]) {
    await runDelete(client, sql, params);
  }
  await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
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
  const hash = await bcrypt.hash(CONFIG.demoPassword, 10);
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
  return ensureUser(client, bcrypt, { email: CONFIG.superadminEmail, role: 'superadmin', name: 'Portal SuperAdmin', points: 0, password: CONFIG.demoPassword });
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
    await runDelete(client, `DELETE FROM ip_login_events WHERE user_id = ANY($1::text[])`, [coreUserIds]);
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

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { ensureIpPipelineSchema } = require(path.join(ipRoot, 'scripts', 'lib', 'ensureIpPipelineSchema.js'));
    await ensureIpPipelineSchema(client);
    const users = await client.query(`SELECT id,email,role FROM ip_users ORDER BY role,email`);
    const toDelete = users.rows.filter((u) => !preserve.has(String(u.email || '').toLowerCase()));
    console.log(`IP root: ${ipRoot}`);
    console.log(`Preserve cores: ${[...preserve].join(', ')}`);
    console.log(`Users in DB: ${users.rows.length}; will remove: ${toDelete.length}`);
    console.log(`Baseline Nova postings to seed: ${CORE_BASELINE_POSTINGS.length}`);
    if (args.dryRun) {
      console.log('Dry run only. Sample delete emails:');
      for (const u of toDelete.slice(0, 15)) console.log(`  - ${u.email}`);
      if (toDelete.length > 15) console.log(`  â€¦ +${toDelete.length - 15} more`);
      return;
    }
    if (!args.yes) {
      const c = await ask('Type RESET to continue: ');
      if (c !== 'RESET') return console.log('Cancelled.');
    }

    for (const u of toDelete) await deleteUserCascade(client, u.id, u.email);

    const superadminId = await ensureSuperadmin(client, bcrypt);
    // Ensure core login rows exist / password restored (do not delete them)
    const candUserId = await ensureUser(client, bcrypt, {
      email: CONFIG.candidateBase.email,
      role: 'candidate',
      name: CONFIG.candidateBase.name,
      points: 80,
      password: CONFIG.demoPassword,
    });
    await client.query(
      `UPDATE ip_users SET password_hash=$2, name=$3, active=true, role='candidate', updated_at=now() WHERE id=$1`,
      [candUserId, await bcrypt.hash(CONFIG.demoPassword, 10), CONFIG.candidateBase.name],
    );
    const empUserId = await ensureUser(client, bcrypt, {
      email: CONFIG.employerBase.email,
      role: 'employer',
      name: CONFIG.employerBase.company,
      points: 200,
      password: CONFIG.demoPassword,
    });
    await client.query(
      `UPDATE ip_users SET password_hash=$2, name=$3, active=true, role='employer', updated_at=now() WHERE id=$1`,
      [empUserId, await bcrypt.hash(CONFIG.demoPassword, 10), CONFIG.employerBase.company],
    );

    const candRow = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [candUserId]);
    const empRow = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [empUserId]);

    console.log('Clearing transactional data on preserved coresâ€¦');
    await clearCoreOwnedData(client, {
      candidateUserId: candUserId,
      employerUserId: empUserId,
      candidateId: candRow.rows[0]?.id || null,
      employerId: empRow.rows[0]?.id || null,
      superadminId,
    });

    for (const table of ['ip_feature_idea_votes', 'ip_feature_idea_comments', 'ip_feature_ideas', 'ip_employer_requests']) {
      if (await tableExists(client, table)) await client.query(`DELETE FROM ${table}`);
    }

    await seedCoreBaseline(client, bcrypt);
    // Last word on roles, after every seeder has written its accounts.
    await demoteStraySuperadmins(client);
    await runCoverageFill(ipRoot);
    console.log('Reset complete. Three cores preserved; baseline catalog + cast/support transactions restored.');
    console.log(`  Candidate  ${CONFIG.candidateBase.email} / ${CONFIG.demoPassword}`);
    console.log(`  Employer   ${CONFIG.employerBase.email} / ${CONFIG.demoPassword}`);
    console.log(`  SuperAdmin ${CONFIG.superadminEmail} / ${CONFIG.demoPassword}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
