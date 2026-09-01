/**
 * Runs the exact UPDATE the candidate profile API builds against the real schema,
 * for the payload each wizard step posts. Read-only: every statement is guarded
 * with `AND false`, so Postgres plans and type-checks it without writing a row.
 *
 *   node --env-file=.env.local scripts/check-ip-candidate-profile-save.mjs
 */
import pg from 'pg';
import { buildCandidateProfileUpdate } from '../src/lib/ipCandidateProfileUpdate.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

/** What the profile page sends: the whole loaded profile plus per-step edits. */
function basePayload() {
  return {
    name: 'Priya Sharma',
    first_name: 'Priya',
    middle_name: '',
    last_name: 'Sharma',
    phone: '9000000001',
    phone_country_code: '+91',
    whatsapp_number: '',
    telegram_handle: '',
    profile_picture_url: '',
    show_profile_picture: true,
    college: 'Pune Institute of Computer Technology',
    degree: 'B.Tech',
    specialization: 'CSE',
    study_status: 'ongoing',
    graduation_year: '',
    cgpa: '',
    country: 'India',
    city: 'Pune',
    state: 'Tamil Nadu',
    skills: ['react', 'sql'],
    resume_url: 'https://example.com/cv.pdf',
    resume_links: [{ id: 'rl_1', url: 'https://x.dev', title: 'Portfolio' }],
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
    personal_website: '',
    preferred_work_mode: 'Remote',
    preferred_locations: ['Remote', 'Bengaluru'],
    availability_date: '',
    searchable: true,
    show_completed_internships: true,
    whatsapp_opt_in: false,
    telegram_opt_in: false,
    has_wired_broadband: '',
    has_dedicated_laptop: '',
    preferred_hours_start: '',
    preferred_hours_end: '',
    ongoing_commitment_note: '',
    ongoing_commitment_choice: 'none',
    prior_experience: JSON.stringify([{ title: 'Intern', org: 'Acme' }]),
    immediate_start: false,
    willing_to_relocate: false,
    hide_phone_until_shortlist: true,
  };
}

const cases = [
  { name: 'step 1 — basics & contact', body: basePayload() },
  {
    name: 'step 2 — academic & skills (academic columns owned by academics API)',
    body: (() => {
      const b = basePayload();
      for (const f of ['college', 'degree', 'specialization', 'study_status', 'graduation_year', 'cgpa']) {
        delete b[f];
      }
      return b;
    })(),
  },
  { name: 'step 3 — work readiness', body: { ...basePayload(), prior_experience: '[]' } },
  { name: 'step 4 — privacy & photo', body: { ...basePayload(), show_profile_picture: false, searchable: false } },
  { name: 'phone changed (clears verification)', body: basePayload(), options: { phoneChanged: true } },
  { name: 'dates and numbers filled', body: { ...basePayload(), availability_date: '2026-09-01', graduation_year: '2027', cgpa: '8.75' } },
  { name: 'everything blank', body: { ...basePayload(), skills: [], preferred_locations: [], resume_links: [], first_name: '', last_name: '', middle_name: '' } },
];

const target = (await pool.query(`SELECT user_id FROM ip_candidates LIMIT 1`)).rows[0];
if (!target) {
  console.log('no candidate rows — nothing to check');
  await pool.end();
  process.exit(0);
}

const failures = [];
for (const testCase of cases) {
  const { sql, params, sets } = buildCandidateProfileUpdate(testCase.body, target.user_id, testCase.options || {});
  if (!sql) {
    failures.push(`${testCase.name}: built no UPDATE`);
    continue;
  }
  const columns = sets.map((s) => s.split(' = ')[0]);
  const duplicated = columns.filter((c, i) => columns.indexOf(c) !== i);
  if (duplicated.length) {
    failures.push(`${testCase.name}: column assigned twice — ${[...new Set(duplicated)].join(', ')}`);
    continue;
  }
  try {
    await pool.query(`${sql} AND false`, params);
    console.log(`ok   ${testCase.name} (${sets.length} columns)`);
  } catch (err) {
    failures.push(`${testCase.name}: ${err.message}`);
  }
}

await pool.end();

if (failures.length) {
  console.error(`\nFAIL\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nPASS — candidate profile saves cleanly on every step');
