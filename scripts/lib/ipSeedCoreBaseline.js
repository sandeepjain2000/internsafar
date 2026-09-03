/**
 * Core baseline seed used by IP_Reset_Core_Sample.js.
 * Rebuilds the 3 demo cores (+ cast/support) so major tables have ≈2 pages
 * and every key situation/status appears — posting blueprint from
 * ipCoreBaselinePostings.js (current Nova catalog after QA cleanup).
 */
const content = require('./ipTestDataContent.js');
const cfg = require('./ipCoreSampleConfig.js');
const { CORE_BASELINE_POSTINGS } = require('./ipCoreBaselinePostings.js');
const { claimCompanyName } = require('./ipCompanyCatalog.js');

const TARGET = content.TARGET_LIST_ROWS; // 22 → ≥2 UI pages at PAGE_SIZE 10
const MIN_TAB = Math.floor(TARGET / 2) + 1; // 11

const APP_STATUSES_ALL = [
  'applied',
  'shortlisted',
  'interviewing',
  'offered',
  'rejected',
  'withdrawn',
  'hired',
  'declined_offer',
  'completed',
];

const OFFER_STATUSES_ALL = ['pending', 'accepted', 'declined', 'expired'];

function loadBlueprint() {
  return {
    postings: CORE_BASELINE_POSTINGS.map((p) => ({
      title: p.title,
      status: p.status || 'published',
      has_requirements: !p.blankRequirements,
      blankRequirements: Boolean(p.blankRequirements),
    })),
    blankRequirementTitles: CORE_BASELINE_POSTINGS.filter((p) => p.blankRequirements).map((p) => p.title),
  };
}

function nidFactory() {
  let seq = 0;
  const label = (() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  })();
  return (prefix) => {
    seq += 1;
    return `${prefix}_${label}-${String(seq).padStart(3, '0')}`;
  };
}

function refCode(email) {
  const local = String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
  return `REF-${local}`;
}

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return Boolean(r.rows[0]);
}

async function ensureUser(client, bcrypt, nid, { email, role, name, points = 80, password }) {
  const ex = await client.query(`SELECT id FROM ip_users WHERE lower(email)=lower($1)`, [email]);
  if (ex.rows[0]) {
    await client.query(
      `UPDATE ip_users SET role=$2,name=$3,active=true,points=GREATEST(points,$4),updated_at=now() WHERE id=$1`,
      [ex.rows[0].id, role, name, points],
    );
    return ex.rows[0].id;
  }
  const id = nid('ip_user');
  const hash = await bcrypt.hash(password, 10);
  await client.query(
    `INSERT INTO ip_users (id,email,password_hash,role,name,points,free_post_credits,application_allowance,profile_complete,active)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,true,true)`,
    [id, email.toLowerCase(), hash, role, name, points],
  );
  return id;
}

/**
 * Education for a freshly inserted candidate.
 *
 * Cast candidates carry their own `education` block in ipCoreSampleConfig, matching migration
 * 035. The +coreNN filler accounts have none, so they get spread across the college/city pools
 * by index instead of all landing on one hardcoded school.
 */
// Cities used by the filler accounts, mapped to their real state. Left blank, these would be
// reported by the blank-visible-text audit.
const CITY_STATES = {
  Bengaluru: 'Karnataka',
  Pune: 'Maharashtra',
  Hyderabad: 'Telangana',
  Mumbai: 'Maharashtra',
  Chennai: 'Tamil Nadu',
  'Delhi NCR': 'Delhi',
  Ahmedabad: 'Gujarat',
  Jaipur: 'Rajasthan',
  Kochi: 'Kerala',
  Chandigarh: 'Punjab',
  Indore: 'Madhya Pradesh',
  Kolkata: 'West Bengal',
};

function educationFor(candidate, index) {
  if (candidate.education) {
    return {
      studyStatus: 'Studying',
      ...candidate.education,
      cgpa: String(candidate.education.cgpa),
    };
  }
  const college = content.pick(content.COLLEGES, index);
  const city = content.pick(content.CITIES, index + 1);
  const degrees = ['B.Tech', 'B.E.', 'B.Sc', 'BCA'];
  const specializations = [
    'CSE', 'Information Technology', 'Electronics and Communication',
    'Mechanical', 'Data Science', 'Electrical',
  ];
  return {
    college,
    degree: degrees[index % degrees.length],
    specialization: specializations[index % specializations.length],
    studyStatus: 'Studying',
    // 2026-2028, so the browse-page graduation filters have a spread to work with.
    graduationYear: 2026 + (index % 3),
    cgpa: (7.4 + ((index * 7) % 22) / 10).toFixed(2),
    city,
    state: CITY_STATES[city] || 'Karnataka',
  };
}

async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column],
  );
  return Boolean(r.rows[0]);
}

/**
 * Two academics rows per candidate: the current qualification (sort_order 0, mirroring the flat
 * ip_candidates columns) and the one before it. Same shape as migration 035, so a fresh seed and
 * a migrated database agree. Skips a candidate who already has rows, so re-running never
 * clobbers a curated history.
 *
 * row_label is added at runtime by src/lib/ensureIpCandidateProfileSchema.js rather than by a
 * migration, so it is written only when present.
 */
async function seedAcademics(client, nid, candidateId, edu) {
  if (!candidateId) return;
  if (!(await tableExists(client, 'ip_candidate_academics'))) return;

  const existing = await client.query(
    `SELECT 1 FROM ip_candidate_academics WHERE candidate_id=$1 LIMIT 1`,
    [candidateId],
  );
  if (existing.rows[0]) return;

  const hasRowLabel = await columnExists(client, 'ip_candidate_academics', 'row_label');

  // Row 0 must mirror the candidate's own flat columns, not the computed education. For a
  // candidate seeded earlier those columns already hold different values, and the
  // "primary academic row disagrees with the profile summary" consistency check compares the
  // two. Fall back to the computed values only where the profile column is blank.
  const profile = await client.query(
    `SELECT college, degree, specialization, study_status, graduation_year, cgpa
       FROM ip_candidates WHERE id=$1`,
    [candidateId],
  );
  const p = profile.rows[0] || {};
  const current = {
    college: p.college || edu.college,
    degree: p.degree || edu.degree,
    specialization: p.specialization || edu.specialization,
    studyStatus: p.study_status || edu.studyStatus,
    graduationYear: p.graduation_year || edu.graduationYear,
    cgpa: p.cgpa === null || p.cgpa === undefined ? String(edu.cgpa) : String(p.cgpa),
  };

  const prev = edu.previous;
  const rows = [
    {
      ...current,
      label: 'Undergraduate',
      sortOrder: 0,
    },
    {
      college: prev ? prev.college : 'Kendriya Vidyalaya',
      degree: prev ? prev.degree : 'Class XII',
      specialization: prev ? prev.specialization : 'Science (PCM)',
      studyStatus: 'Completed',
      // Four years before the degree finishes, the normal gap for a B.E./B.Tech. Derived from
      // row 0 so the "earlier qualification finishes later than the current one" check holds.
      graduationYear: Number(current.graduationYear) - 4,
      cgpa: prev ? prev.score : '88%',
      label: 'Senior Secondary',
      sortOrder: 1,
    },
  ];

  for (const row of rows) {
    const cols = ['id', 'candidate_id', 'college', 'degree', 'specialization', 'study_status', 'graduation_year', 'cgpa', 'sort_order'];
    const vals = [
      nid('ip_acad'),
      candidateId,
      row.college,
      row.degree,
      row.specialization,
      row.studyStatus,
      row.graduationYear,
      row.cgpa,
      row.sortOrder,
    ];
    if (hasRowLabel) {
      cols.push('row_label');
      vals.push(row.label);
    }
    const placeholders = vals.map((_, k) => `$${k + 1}`).join(',');
    await client.query(
      `INSERT INTO ip_candidate_academics (${cols.join(',')}) VALUES (${placeholders})
       ON CONFLICT (id) DO NOTHING`,
      vals,
    );
  }
}

function eligibilityFor(posting, ti) {
  const blankTitles = new Set(
    (loadBlueprint().blankRequirementTitles || []).slice(0, 2).map(String),
  );
  if (
    blankTitles.has(posting.title)
    || posting.has_requirements === false
    || posting.blankRequirements
  ) {
    return {
      skills: [],
      requirements_text: '',
      ideal_profile_text: content.internshipEligibilityAt(ti).ideal_profile_text,
    };
  }
  const base = content.internshipEligibilityAt(ti);
  if (Array.isArray(posting.skills) && posting.skills.length) {
    base.skills = posting.skills;
    base.requirements_text = [
      `Currently enrolled or recently graduated in a relevant field`,
      `Comfortable with ${posting.skills.slice(0, 2).join(' and ')}`,
      'Able to commit to the stated work mode for the internship duration',
    ].join('\n');
  }
  return base;
}

/**
 * @param {import('pg').Client} client
 * @param {*} bcrypt
 */
async function seedCoreBaseline(client, bcrypt) {
  const nid = nidFactory();
  const password = cfg.DEMO_PASSWORD;
  const blueprint = loadBlueprint();

  // --- SuperAdmin already ensured by caller; ensure cores + cast ---
  const candidateCast = [];
  const seenC = new Set();
  for (const c of cfg.CAST_CANDIDATES) {
    const key = c.email.toLowerCase();
    if (seenC.has(key)) continue;
    seenC.add(key);
    candidateCast.push(c);
  }
  const employerCast = [];
  const seenE = new Set();
  for (const e of cfg.CAST_EMPLOYERS) {
    const key = e.email.toLowerCase();
    if (seenE.has(key)) continue;
    seenE.add(key);
    employerCast.push(e);
  }

  // Extra support candidates so applicant tables hit ≥2 pages (not demo logins)
  const supportCandidates = [];
  for (let i = 1; i <= TARGET; i += 1) {
    const email = `lawsonlclintern+core${String(i).padStart(2, '0')}@gmail.com`;
    if (seenC.has(email.toLowerCase())) continue;
    supportCandidates.push({
      email,
      name: `${content.FIRST_NAMES[i % content.FIRST_NAMES.length]} ${content.LAST_NAMES[(i * 3) % content.LAST_NAMES.length]}`,
      skills: content.skillsAt ? content.skillsAt(i) : content.SKILL_SETS[i % content.SKILL_SETS.length],
    });
  }

  const candidateIds = {};
  const candidateUserIds = {};
  const allCandidates = [...candidateCast, ...supportCandidates];
  for (let i = 0; i < allCandidates.length; i += 1) {
    const c = allCandidates[i];
    const userId = await ensureUser(client, bcrypt, nid, {
      email: c.email,
      role: 'candidate',
      name: c.name,
      points: c.email === cfg.CAND_BASE ? 80 : 60,
      password,
    });
    candidateUserIds[c.email] = userId;
    const ex = await client.query(`SELECT id FROM ip_candidates WHERE user_id=$1`, [userId]);
    if (ex.rows[0]) {
      candidateIds[c.email] = ex.rows[0].id;
      await client.query(
        `UPDATE ip_candidates SET name=$2, skills=$3::text[], updated_at=now() WHERE id=$1`,
        [ex.rows[0].id, c.name, c.skills || ['JavaScript']],
      );
    } else {
      const id = nid('ip_cand');
      const edu = educationFor(c, i);
      await client.query(
        `INSERT INTO ip_candidates (id,user_id,name,email,phone,college,degree,specialization,study_status,graduation_year,cgpa,city,state,skills,preferred_work_mode,preferred_locations,resume_url,prior_experience,searchable,show_profile_picture)
         VALUES ($1,$2,$3,$4,'9000000001',$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],'Remote',$14::text[],'https://example.com/resume.pdf',$15,true,true)`,
        [
          id,
          userId,
          c.name,
          c.email.toLowerCase(),
          edu.college,
          edu.degree,
          edu.specialization,
          edu.studyStatus,
          edu.graduationYear,
          edu.cgpa,
          edu.city,
          edu.state,
          c.skills || ['JavaScript'],
          ['Remote', 'Bengaluru'],
          content.experienceEntriesJsonAt(i),
        ],
      );
      candidateIds[c.email] = id;
    }
    // The profile's education section reads ip_candidate_academics, not the flat columns, so
    // without this a reset leaves that section empty until migration 035 is run by hand.
    await seedAcademics(client, nid, candidateIds[c.email], educationFor(c, i));
  }

  const employerIds = {};
  const employerUserIds = {};
  for (const e of employerCast) {
    const userId = await ensureUser(client, bcrypt, nid, {
      email: e.email,
      role: 'employer',
      name: e.company,
      points: 200,
      password,
    });
    employerUserIds[e.email] = userId;
    const ex = await client.query(`SELECT id FROM ip_employers WHERE user_id=$1`, [userId]);
    if (ex.rows[0]) {
      employerIds[e.email] = ex.rows[0].id;
      await client.query(
        `UPDATE ip_employers
         SET company_name=$2,contact_name=$2,approval_status=$3,website=$4,work_email=$5,updated_at=now()
         WHERE id=$1`,
        [
          ex.rows[0].id,
          e.company,
          e.status || 'approved',
          e.website || cfg.EMP_BASE_WEBSITE,
          e.email.toLowerCase(),
        ],
      );
    } else {
      const id = nid('ip_emp');
      await client.query(
        `INSERT INTO ip_employers (id,user_id,company_name,brand_name,website,work_email,industry,company_size,hq_city,hq_state,about,contact_name,contact_designation,contact_phone,approval_status,show_identity_on_posting,ethics_acks,ethics_accepted_at)
         VALUES ($1,$2,$3,$4,$5,$6,'Technology','51-200','Hyderabad','Telangana',$7,$3,'HR Lead','9000000099',$8,true,$9::jsonb,now())`,
        [
          id,
          userId,
          e.company,
          e.company.split(' ')[0],
          e.website || cfg.EMP_BASE_WEBSITE,
          e.email.toLowerCase(),
          `${e.company} is a hiring partner on PlacementHub.`,
          e.status || 'approved',
          JSON.stringify({ no_fees: true, accurate_info: true, data_privacy: true }),
        ],
      );
      employerIds[e.email] = id;
    }
  }

  const novaEmail = cfg.EMP_BASE;
  const novaId = employerIds[novaEmail];
  const novaCompany = cfg.EMP_BASE_NAME;

  // --- Nova postings from live blueprint (unique titles / statuses) ---
  let postingSpecs = Array.isArray(blueprint.postings) && blueprint.postings.length
    ? blueprint.postings
    : content.ROLE_TITLES.slice(0, TARGET).map((title, ti) => ({
      title,
      status: ti === TARGET - 1 ? 'draft' : ti === TARGET - 2 ? 'paused' : 'published',
      work_mode: content.WORK_MODES[ti % content.WORK_MODES.length],
      location: content.CITIES[ti % content.CITIES.length],
      stipend_inr: 12000 + (ti % 5) * 2000,
      skills: content.SKILL_SETS[ti % content.SKILL_SETS.length],
      has_requirements: true,
    }));

  // Ensure ≥2 pages worth even if blueprint somehow short
  while (postingSpecs.length < TARGET) {
    const ti = postingSpecs.length;
    postingSpecs.push({
      title: content.roleTitle(ti + 100),
      status: 'published',
      work_mode: content.WORK_MODES[ti % 3],
      location: content.CITIES[ti % content.CITIES.length],
      stipend_inr: 15000,
      skills: content.SKILL_SETS[ti % content.SKILL_SETS.length],
      has_requirements: true,
    });
  }

  const postingRows = [];
  for (let ti = 0; ti < postingSpecs.length; ti += 1) {
    const spec = postingSpecs[ti];
    const city = spec.location || content.CITIES[ti % content.CITIES.length];
    const ex = await client.query(
      `SELECT id FROM ip_internships WHERE employer_id=$1 AND title=$2 LIMIT 1`,
      [novaId, spec.title],
    );
    let id = ex.rows[0]?.id;
    const elig = eligibilityFor(spec, ti);
    if (id) {
      await client.query(
        `UPDATE ip_internships SET status=$2, work_mode=$3, location=$4, stipend_inr=$5,
           eligibility=$6::jsonb, description=$7, updated_at=now(),
           starts_at = now() - interval '2 hours',
           apply_ends_at = now() + interval '28 days'
         WHERE id=$1`,
        [
          id,
          spec.status || 'published',
          spec.work_mode || 'Remote',
          city,
          spec.stipend_inr || 15000,
          JSON.stringify(elig),
          content.internshipDescription(spec.title, novaCompany, city, ti),
        ],
      );
    } else {
      id = nid('ip_int');
      await client.query(
        `INSERT INTO ip_internships (
           id,employer_id,title,description,location,work_mode,stipend_inr,duration_months,
           eligibility,questions,status,show_employer_identity,engagement_type,stipend_type,
           locations,starts_at,apply_ends_at,start_date,created_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,3,$8::jsonb,$9::jsonb,$10,true,'full_time','fixed',
           $11::jsonb, now() - interval '2 hours', now() + interval '28 days',
           CURRENT_DATE + $12::int, now() - ($13::int * interval '1 minute')
         )`,
        [
          id,
          novaId,
          spec.title,
          content.internshipDescription(spec.title, novaCompany, city, ti),
          city,
          spec.work_mode || content.WORK_MODES[ti % 3],
          spec.stipend_inr || 12000 + (ti % 5) * 2000,
          JSON.stringify(elig),
          JSON.stringify([{ id: 'q1', prompt: 'Why this role?', type: 'textarea' }]),
          spec.status || 'published',
          JSON.stringify([city]),
          5 + (ti % 16),
          ti,
        ],
      );
    }
    postingRows.push({
      id,
      employerId: novaId,
      title: spec.title,
      company: novaCompany,
      status: spec.status || 'published',
    });
  }

  // Park two blank-requirement showcase posts at list positions 3–4 (created_at DESC)
  const blankTitles = (blueprint.blankRequirementTitles || []).slice(0, 2);
  if (blankTitles.length === 2 && postingRows.length >= 4) {
    const anchor = await client.query(
      `SELECT created_at FROM ip_internships WHERE employer_id=$1 ORDER BY created_at DESC OFFSET 1 LIMIT 1`,
      [novaId],
    );
    const t2 = anchor.rows[0] ? new Date(anchor.rows[0].created_at).getTime() : Date.now();
    for (let bi = 0; bi < 2; bi += 1) {
      const row = postingRows.find((p) => p.title === blankTitles[bi]);
      if (!row) continue;
      await client.query(
        `UPDATE ip_internships SET created_at=$2::timestamptz, updated_at=now() WHERE id=$1`,
        [row.id, new Date(t2 - (bi + 1) * 1000).toISOString()],
      );
    }
  }

  // Other approved employers: a few published roles so Priya/browse isn’t Nova-only
  const approvedOthers = employerCast.filter(
    (e) => e.email !== novaEmail && (e.status || 'approved') === 'approved',
  );
  let extraTi = 200;
  for (const emp of approvedOthers) {
    const eid = employerIds[emp.email];
    for (let j = 0; j < 4; j += 1) {
      const title = content.roleTitle(extraTi + j);
      const city = content.CITIES[(extraTi + j) % content.CITIES.length];
      const ex = await client.query(
        `SELECT id FROM ip_internships WHERE employer_id=$1 AND title=$2 LIMIT 1`,
        [eid, title],
      );
      let id = ex.rows[0]?.id;
      if (!id) {
        id = nid('ip_int');
        await client.query(
          `INSERT INTO ip_internships (
             id,employer_id,title,description,location,work_mode,stipend_inr,duration_months,
             eligibility,questions,status,show_employer_identity,engagement_type,stipend_type,
             locations,starts_at,apply_ends_at,start_date
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,3,$8::jsonb,$9::jsonb,'published',true,'full_time','fixed',
             $10::jsonb, now() - interval '2 hours', now() + interval '28 days', CURRENT_DATE + 7
           )`,
          [
            id,
            eid,
            title,
            content.internshipDescription(title, emp.company, city, extraTi + j),
            city,
            content.WORK_MODES[j % 3],
            14000 + j * 1000,
            JSON.stringify(content.internshipEligibilityAt(extraTi + j)),
            JSON.stringify([{ id: 'q1', prompt: 'Why this role?', type: 'textarea' }]),
            JSON.stringify([city]),
          ],
        );
      }
      postingRows.push({ id, employerId: eid, title, company: emp.company, status: 'published' });
    }
    extraTi += 4;
  }

  const published = postingRows.filter((p) => p.status === 'published');
  const novaPublished = published.filter((p) => p.employerId === novaId);
  const candEmails = Object.keys(candidateIds);
  const supportEmails = supportCandidates.map((c) => c.email);
  const castEmails = candidateCast.map((c) => c.email);

  async function ensureApp(internshipId, candidateEmail, status, score) {
    const candidateId = candidateIds[candidateEmail];
    if (!candidateId) return null;
    const ex = await client.query(
      `SELECT id FROM ip_applications WHERE internship_id=$1 AND candidate_id=$2`,
      [internshipId, candidateId],
    );
    if (ex.rows[0]) {
      await client.query(`UPDATE ip_applications SET status=$2, match_score=$3 WHERE id=$1`, [
        ex.rows[0].id,
        status,
        score,
      ]);
      return ex.rows[0].id;
    }
    const id = nid('ip_app');
    await client.query(
      `INSERT INTO ip_applications (id,internship_id,candidate_id,status,match_score,answers)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        id,
        internshipId,
        candidateId,
        status,
        score,
        JSON.stringify({ q1: 'Excited to contribute and learn with the team.' }),
      ],
    );
    return id;
  }

  // --- Nova applicants: every status ≥ MIN_TAB, and ≥ TARGET apps on first published role ---
  const statusPool = [];
  for (const st of APP_STATUSES_ALL) {
    for (let k = 0; k < MIN_TAB; k += 1) statusPool.push(st);
  }
  while (statusPool.length < TARGET * 2) statusPool.push(APP_STATUSES_ALL[statusPool.length % APP_STATUSES_ALL.length]);

  let poolIdx = 0;
  const applicantEmails = [...supportEmails, ...castEmails.filter((e) => e !== cfg.CAND_BASE)];
  for (let pi = 0; pi < novaPublished.length; pi += 1) {
    const posting = novaPublished[pi];
    // First posting gets a full 2-page applicant list; others get a lighter mix
    const nApps = pi === 0 ? Math.max(TARGET, applicantEmails.length) : Math.min(8, applicantEmails.length);
    for (let ai = 0; ai < nApps; ai += 1) {
      const email = applicantEmails[(pi * 3 + ai) % applicantEmails.length];
      const status = statusPool[poolIdx % statusPool.length];
      poolIdx += 1;
      await ensureApp(posting.id, email, status, 65 + ((ai + pi) % 30));
    }
  }

  // --- Priya (core candidate): apps across statuses on non-Nova + Nova mix ---
  const priyaTargets = published.filter((p) => true);
  for (let i = 0; i < Math.max(TARGET, APP_STATUSES_ALL.length * MIN_TAB); i += 1) {
    const posting = priyaTargets[i % priyaTargets.length];
    if (!posting) continue;
    // Skip if this slot would collide with support-only uniqueness — Priya can still apply
    await ensureApp(posting.id, cfg.CAND_BASE, APP_STATUSES_ALL[i % APP_STATUSES_ALL.length], 70 + (i % 25));
  }

  // Guarantee Internships Completed dashboard count (≥ MIN_TAB completed apps for core candidate)
  const completedSlots = priyaTargets.slice(0, Math.max(MIN_TAB, 3));
  for (let ci = 0; ci < completedSlots.length; ci += 1) {
    await ensureApp(completedSlots[ci].id, cfg.CAND_BASE, 'completed', 88 + (ci % 10));
  }

  // --- Offers (Nova): every offer status covered, ≥ TARGET rows ---
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`).catch(() => {});
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS start_date DATE`).catch(() => {});
  await client.query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS valid_until DATE`).catch(() => {});

  let offerN = 0;
  for (let i = 0; i < Math.max(TARGET, OFFER_STATUSES_ALL.length * MIN_TAB); i += 1) {
    const posting = novaPublished[i % Math.max(1, novaPublished.length)];
    const email = applicantEmails[i % applicantEmails.length];
    if (!posting || !email) continue;
    const offerStatus = OFFER_STATUSES_ALL[i % OFFER_STATUSES_ALL.length];
    const appStatus =
      offerStatus === 'accepted'
        ? 'hired'
        : offerStatus === 'declined'
          ? 'declined_offer'
          : 'offered';
    const appId = await ensureApp(posting.id, email, appStatus, 80 + (i % 15));
    if (!appId) continue;
    const offerEx = await client.query(`SELECT id FROM ip_offers WHERE application_id=$1 LIMIT 1`, [appId]);
    if (offerEx.rows[0]) continue;

    const start = new Date();
    start.setDate(start.getDate() + 7 + (i % 10));
    const valid = new Date();
    if (offerStatus === 'expired') valid.setDate(valid.getDate() - 2 - (i % 5));
    else valid.setDate(valid.getDate() + 5 + (i % 10));
    const firstName = String(allCandidates.find((c) => c.email === email)?.name || 'there').split(' ')[0];
    try {
      await client.query(
        `INSERT INTO ip_offers (
           id, internship_id, employer_id, candidate_id, application_id,
           status, stipend_inr, role_title, message, start_date, valid_until
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          nid('ip_off'),
          posting.id,
          novaId,
          candidateIds[email],
          appId,
          offerStatus === 'expired' ? 'pending' : offerStatus,
          12000 + (i % 9) * 1500,
          posting.title,
          `Hi ${firstName}, ${novaCompany} would like to extend an offer for ${posting.title}.`,
          start.toISOString().slice(0, 10),
          valid.toISOString().slice(0, 10),
        ],
      );
      // expired: set pending then mark expired if column/status supports it
      if (offerStatus === 'expired') {
        await client.query(`UPDATE ip_offers SET status='expired', valid_until=$2 WHERE application_id=$1`, [
          appId,
          valid.toISOString().slice(0, 10),
        ]).catch(() => {});
      }
      offerN += 1;
    } catch {
      /* unique / FK */
    }
  }

  // --- Message threads ≥ TARGET ---
  const novaUserId = employerUserIds[novaEmail];
  let threadN = 0;
  for (let i = 0; i < Math.max(TARGET, 12) && threadN < TARGET + 5; i += 1) {
    const posting = novaPublished[i % Math.max(1, novaPublished.length)];
    const cEmail = applicantEmails[i % applicantEmails.length];
    const candUserId = candidateUserIds[cEmail];
    if (!posting || !candUserId || !novaUserId) continue;
    const thrEx = await client.query(
      `SELECT id FROM ip_message_threads WHERE internship_id=$1 AND candidate_user_id=$2 AND employer_user_id=$3 LIMIT 1`,
      [posting.id, candUserId, novaUserId],
    );
    let threadId = thrEx.rows[0]?.id;
    if (!threadId) {
      threadId = nid('ip_thr');
      await client.query(
        `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
         VALUES ($1,$2,$3,$4,$5)`,
        [threadId, posting.id, candUserId, novaUserId, `${posting.title} — conversation`],
      );
    }
    const msgCount = await client.query(`SELECT count(*)::int AS n FROM ip_messages WHERE thread_id=$1`, [threadId]);
    if (Number(msgCount.rows[0]?.n || 0) === 0) {
      const first = String(allCandidates.find((c) => c.email === cEmail)?.name || 'there').split(' ')[0];
      await client.query(`INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`, [
        nid('ip_msg'),
        threadId,
        novaUserId,
        `Hi ${first} — thanks for your interest in ${posting.title}.`,
      ]);
      await client.query(`INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`, [
        nid('ip_msg'),
        threadId,
        candUserId,
        `Thank you! Happy to share more about my background.`,
      ]);
    }
    threadN += 1;
  }

  // --- Feature ideas ≥ TARGET ---
  const ideaAuthor = candidateUserIds[cfg.CAST_CANDIDATES[0]?.email || cfg.CAND_BASE];
  if (ideaAuthor && (await tableExists(client, 'ip_feature_ideas'))) {
    let catId = null;
    try {
      const cats = await client.query(`SELECT id FROM ip_idea_categories ORDER BY sort_order NULLS LAST LIMIT 1`);
      catId = cats.rows[0]?.id || null;
    } catch {
      /* optional */
    }
    const ideaCount = Math.max(TARGET, content.FEATURE_IDEAS.length);
    for (let i = 0; i < ideaCount; i += 1) {
      const idea = content.FEATURE_IDEAS[i % content.FEATURE_IDEAS.length];
      const title = i < content.FEATURE_IDEAS.length ? idea.title : `${idea.title} (${i})`;
      const ex = await client.query(`SELECT id FROM ip_feature_ideas WHERE title=$1 LIMIT 1`, [title]);
      if (ex.rows[0]) continue;
      const status = content.IDEA_STATUSES[i % content.IDEA_STATUSES.length];
      try {
        await client.query(
          `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, problem, solution, status, category_id, vote_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            nid('ip_idea'),
            ideaAuthor,
            title,
            idea.description,
            idea.problem || null,
            idea.solution || null,
            status,
            catId,
            1 + (i % 8),
          ],
        );
      } catch {
        await client.query(
          `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, status, vote_count)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [nid('ip_idea'), ideaAuthor, title, idea.description, status, 1 + (i % 8)],
        );
      }
    }
  }

  // --- SA moderation: a few pending employer requests ---
  if (await tableExists(client, 'ip_employer_requests')) {
    // Requests must not reuse a company name already held by an employer account, or the
    // SuperAdmin sees an "approve this company" request for a company that is already on
    // the platform. Claim names against what the database already holds.
    const takenCompanies = new Set(
      (await client.query(
        `SELECT company_name FROM ip_employers
         UNION SELECT company_name FROM ip_employer_requests`,
      )).rows.map((r) => String(r.company_name || '').trim()).filter(Boolean),
    );
    for (let i = 0; i < Math.min(6, TARGET); i += 1) {
      const company = claimCompanyName(takenCompanies);
      const email = `hire${i}@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.example`;
      const ex = await client.query(
        `SELECT id FROM ip_employer_requests WHERE lower(contact_email)=lower($1) LIMIT 1`,
        [email],
      );
      if (ex.rows[0]) continue;
      try {
        await client.query(
          `INSERT INTO ip_employer_requests (id, company_name, contact_name, contact_email, reason, status)
           VALUES ($1,$2,$3,$4,$5,'pending')`,
          [nid('ip_req'), company, `HR ${i + 1}`, email, 'Requesting access to post internships on InternSafar.'],
        );
      } catch {
        /* schema variance */
      }
    }
  }

  return {
    novaPostings: postingRows.filter((p) => p.employerId === novaId).length,
    offersCreated: offerN,
    threads: threadN,
    targetListRows: TARGET,
  };
}

module.exports = {
  seedCoreBaseline,
  TARGET,
  MIN_TAB,
};
