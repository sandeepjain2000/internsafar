#!/usr/bin/env node
/**
 * Internship Portal core-sample reset (single executable).
 *
 * Edit ONLY this CONFIG section to change baseline accounts/transactions.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');

const CONFIG = {
  superadminEmail: 'placementhubsupport@gmail.com',
  legacySuperadminEmail: 'superadmin@internship.local',
  demoPassword: 'Admin@123',
  // Newest “primary” demo accounts (match the latest accounts doc)
  candidateBase: { email: 'lawsonlclintern+1@gmail.com', name: 'Priya Sharma' },
  employerBase: { email: 'shreekar.nyayapathi23+2@vit.edu', company: 'Nova Labs', status: 'approved' },
  castCandidates: [
    { email: 'lawsonlclintern+1@gmail.com', name: 'Priya Sharma', skills: ['React', 'TypeScript', 'Node'] },
    { email: 'lawsonlclintern+2@gmail.com', name: 'Arjun Mehta', skills: ['Python', 'SQL', 'ML'] },
    { email: 'lawsonlclintern+3@gmail.com', name: 'Meera Iyer', skills: ['Java', 'Spring', 'SQL'] },
  ],
  castEmployers: [
    { email: 'shreekar.nyayapathi23+2@vit.edu', company: 'Nova Labs', status: 'approved' },
    { email: 'shreekar.nyayapathi23+3@vit.edu', company: 'Pulse Media', status: 'pending' },
  ],
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

function nid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function refCode(email) {
  const local = String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
  return `R${local}${String(Date.now()).slice(-4)}`;
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

    for (const sql of [
      `DELETE FROM ip_viral_shares WHERE user_id=$1`,
      `DELETE FROM ip_notifications WHERE user_id=$1`,
      `DELETE FROM ip_points_ledger WHERE user_id=$1`,
      `DELETE FROM ip_password_resets WHERE user_id=$1`,
      `DELETE FROM ip_login_events WHERE user_id=$1`,
      `DELETE FROM ip_auth_sessions WHERE user_id=$1`,
      `DELETE FROM ip_feature_idea_votes WHERE user_id=$1`,
      `DELETE FROM ip_feature_idea_comments WHERE author_user_id=$1`,
      `UPDATE ip_feature_ideas SET author_user_id=NULL WHERE author_user_id=$1`,
      `DELETE FROM ip_referrals WHERE referrer_user_id=$1`,
      `UPDATE ip_referrals SET referred_user_id=NULL WHERE referred_user_id=$1`,
      `DELETE FROM ip_employer_requests WHERE lower(contact_email)=lower($2) OR created_user_id=$1`,
      `DELETE FROM ip_users WHERE id=$1`,
    ]) {
      await runDelete(client, sql, [userId, email]);
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

async function seedCoreData(client, bcrypt) {
  const baseCandUser = await ensureUser(client, bcrypt, { email: CONFIG.candidateBase.email, role: 'candidate', name: CONFIG.candidateBase.name, points: 80, password: CONFIG.demoPassword });
  const baseEmpUser = await ensureUser(client, bcrypt, { email: CONFIG.employerBase.email, role: 'employer', name: CONFIG.employerBase.company, points: 200, password: CONFIG.demoPassword });

  const candidateEntries = [{ ...CONFIG.candidateBase, skills: ['JavaScript', 'React', 'SQL'] }, ...CONFIG.castCandidates];
  const employerEntries = [CONFIG.employerBase, ...CONFIG.castEmployers];

  const candidateIds = {};
  for (const c of candidateEntries) {
    const userId = c.email === CONFIG.candidateBase.email ? baseCandUser : await ensureUser(client, bcrypt, { email: c.email, role: 'candidate', name: c.name, points: 60, password: CONFIG.demoPassword });
    const ex = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [userId]);
    if (ex.rows[0]) candidateIds[c.email] = ex.rows[0].id;
    else {
      const id = nid('ip_cand');
      await client.query(
        `INSERT INTO ip_candidates (id,user_id,name,email,phone,college,degree,specialization,study_status,graduation_year,cgpa,city,state,skills,preferred_work_mode,preferred_locations,resume_url,searchable,show_profile_picture)
         VALUES ($1,$2,$3,$4,'9000000001','VIT','B.Tech','CSE','Studying',2027,'8.4','Vellore','Tamil Nadu',$5::jsonb,'Remote',$6::jsonb,'https://example.com/resume.pdf',true,true)`,
        [id, userId, c.name, c.email.toLowerCase(), JSON.stringify(c.skills || ['JavaScript']), JSON.stringify(['Remote', 'Bengaluru'])],
      );
      candidateIds[c.email] = id;
    }
  }

  const employerIds = {};
  for (const e of employerEntries) {
    const userId = e.email === CONFIG.employerBase.email ? baseEmpUser : await ensureUser(client, bcrypt, { email: e.email, role: 'employer', name: e.company, points: 200, password: CONFIG.demoPassword });
    const ex = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [userId]);
    if (ex.rows[0]) {
      employerIds[e.email] = ex.rows[0].id;
      await client.query(`UPDATE ip_employers SET company_name=$2,contact_name=$2,approval_status=$3,updated_at=now() WHERE id=$1`, [ex.rows[0].id, e.company, e.status || 'approved']);
    } else {
      const id = nid('ip_emp');
      const domain = e.email.split('@')[1] || 'example.com';
      await client.query(
        `INSERT INTO ip_employers (id,user_id,company_name,brand_name,website,work_email,industry,company_size,hq_city,hq_state,about,contact_name,contact_designation,contact_phone,approval_status,show_identity_on_posting,ethics_acks,ethics_accepted_at)
         VALUES ($1,$2,$3,$4,$5,$6,'Technology','51-200','Hyderabad','Telangana',$7,$3,'HR Lead','9000000099',$8,true,$9::jsonb,now())`,
        [id, userId, e.company, e.company.split(' ')[0], `https://${domain}`, e.email.toLowerCase(), `${e.company} is a hiring partner on PlacementHub.`, e.status || 'approved', JSON.stringify({ no_fees: true, accurate_info: true, data_privacy: true })],
      );
      employerIds[e.email] = id;
    }
  }

  const postEmpEmail = employerEntries.find((e) => (e.status || 'approved') === 'approved')?.email || CONFIG.employerBase.email;
  const postEmpId = employerIds[postEmpEmail];
  const titles = ['Frontend Developer Intern', 'Data Analyst Intern', 'Backend API Intern', 'Paused Design Intern'];
  const internshipIds = [];
  for (const t of titles) {
    const status = t === 'Paused Design Intern' ? 'paused' : 'published';
    const ex = await client.query(`SELECT id FROM ip_internships WHERE employer_id=$1 AND title=$2 LIMIT 1`, [postEmpId, t]);
    if (ex.rows[0]) internshipIds.push(ex.rows[0].id);
    else {
      const id = nid('ip_int');
      await client.query(
        `INSERT INTO ip_internships (id,employer_id,title,description,location,work_mode,stipend_inr,duration_months,eligibility,questions,status,show_employer_identity,engagement_type,stipend_type)
         VALUES ($1,$2,$3,$4,'Remote / Hybrid','Remote',15000,3,$5::jsonb,$6::jsonb,$7,true,'full_time','fixed')`,
        [id, postEmpId, t, `${t}\n\nResponsibilities include project work, weekly check-ins, and a final demo.`, JSON.stringify({ skills: ['JavaScript', 'React', 'SQL', 'Python'] }), JSON.stringify([{ id: 'q1', prompt: 'Why this role?', type: 'textarea' }]), status],
      );
      internshipIds.push(id);
    }
  }

  const candEmails = Object.keys(candidateIds);
  for (let i = 0; i < candEmails.length; i += 1) {
    const cEmail = candEmails[i];
    const appStatus = i === 1 ? 'shortlisted' : i === 0 ? 'offered' : 'applied';
    const internId = internshipIds[i % 3];
    const ex = await client.query(`SELECT id FROM ip_applications WHERE internship_id=$1 AND candidate_id=$2`, [internId, candidateIds[cEmail]]);
    let appId = ex.rows[0]?.id;
    if (!appId) {
      appId = nid('ip_app');
      await client.query(`INSERT INTO ip_applications (id,internship_id,candidate_id,status,match_score,answers) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [appId, internId, candidateIds[cEmail], appStatus, 70 + i * 5, JSON.stringify({ q1: 'Excited to contribute.' })]);
    } else {
      await client.query(`UPDATE ip_applications SET status=$2,match_score=$3 WHERE id=$1`, [appId, appStatus, 70 + i * 5]);
    }
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

  const coreEmails = new Set([
    CONFIG.superadminEmail.toLowerCase(),
    CONFIG.candidateBase.email.toLowerCase(),
    CONFIG.employerBase.email.toLowerCase(),
    ...CONFIG.castCandidates.map((c) => c.email.toLowerCase()),
    ...CONFIG.castEmployers.map((e) => e.email.toLowerCase()),
  ]);

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const users = await client.query(`SELECT id,email,role FROM ip_users ORDER BY role,email`);
    const toDelete = users.rows.filter((u) => String(u.email || '').toLowerCase() !== CONFIG.superadminEmail.toLowerCase());
    console.log(`IP root: ${ipRoot}`);
    console.log(`Users in DB: ${users.rows.length}; will remove: ${toDelete.length}`);
    if (args.dryRun) {
      console.log('Dry run only. Core emails to restore:');
      for (const e of coreEmails) console.log(`  - ${e}`);
      return;
    }
    if (!args.yes) {
      const c = await ask('Type RESET to continue: ');
      if (c !== 'RESET') return console.log('Cancelled.');
    }
    for (const u of toDelete) await deleteUserCascade(client, u.id, u.email);
    const superadminId = await ensureSuperadmin(client, bcrypt);
    for (const table of ['ip_feature_idea_votes', 'ip_feature_idea_comments', 'ip_feature_ideas', 'ip_employer_requests']) {
      if (await tableExists(client, table)) await client.query(`DELETE FROM ${table}`);
    }
    for (const table of ['ip_notifications', 'ip_points_ledger', 'ip_login_events', 'ip_auth_sessions', 'ip_password_resets']) {
      if (await tableExists(client, table)) await client.query(`DELETE FROM ${table} WHERE user_id=$1`, [superadminId]);
    }
    await seedCoreData(client, bcrypt);
    console.log('Reset complete. Baseline accounts and transactions restored.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
