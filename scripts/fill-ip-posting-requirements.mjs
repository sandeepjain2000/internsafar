/**
 * One-shot / re-runnable: fill eligibility.requirements_text (+ ideal_profile_text)
 * on published internships that are missing requirements. Data-only — no schema change.
 *
 * Preserves existing eligibility.skills when present (match “because …” blurbs use skills).
 * After fill, leaves 2 real-looking published rows blank at list positions 3–4
 * unless --no-showcase-blanks is passed.
 *
 *   node scripts/fill-ip-posting-requirements.mjs
 *   node scripts/fill-ip-posting-requirements.mjs --dry-run
 *   node scripts/fill-ip-posting-requirements.mjs --no-showcase-blanks
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const DRY = process.argv.includes('--dry-run');
const NO_SHOWCASE = process.argv.includes('--no-showcase-blanks');

function looksLikeQaJunk(title) {
  const t = String(title || '');
  return (
    /^QA\b/i.test(t)
    || /\bmtb[a-z0-9]+/i.test(t)
    || /\btest\b/i.test(t)
    || /\bfixture\b/i.test(t)
  );
}

/** Blank requirements (+ skills) on two non-QA titles parked at positions 3–4. */
async function applyShowcaseBlanks(pool) {
  const ranked = await pool.query(`
    SELECT id, title, created_at, eligibility
    FROM ip_internships
    WHERE status = 'published'
    ORDER BY created_at DESC
  `);
  if (ranked.rows.length < 4) {
    console.warn('Showcase blanks skipped — need at least 4 published postings');
    return;
  }
  const top2 = ranked.rows.slice(0, 2);
  const anchorAfter = ranked.rows[1];
  const top2Ids = new Set(top2.map((r) => r.id));
  const candidates = ranked.rows.filter(
    (r) => !top2Ids.has(r.id) && !looksLikeQaJunk(r.title),
  );
  if (candidates.length < 2) {
    console.warn('Showcase blanks skipped — no non-QA titles available');
    return;
  }
  const [a, b] = candidates.slice(0, 2);
  const t2 = new Date(anchorAfter.created_at).getTime();
  const tA = new Date(t2 - 1000);
  const tB = new Date(t2 - 2000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [row, when] of [
      [a, tA],
      [b, tB],
    ]) {
      const base =
        row.eligibility && typeof row.eligibility === 'object' && !Array.isArray(row.eligibility)
          ? { ...row.eligibility }
          : {};
      const next = { ...base, skills: [], requirements_text: '' };
      await client.query(
        `UPDATE ip_internships
         SET eligibility = $2::jsonb,
             created_at = $3::timestamptz,
             updated_at = now()
         WHERE id = $1`,
        [row.id, JSON.stringify(next), when.toISOString()],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log('Showcase blanks at positions 3–4:', a.title, '|', b.title);
}

function hash(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, seed) {
  if (!arr?.length) return '';
  return arr[hash(seed) % arr.length];
}

/** Role-family keyword → skill / requirement / ideal banks */
const ROLE_BANKS = [
  {
    match: /frontend|react|ui engineering|ui\b/i,
    skills: ['React', 'JavaScript', 'CSS', 'HTML'],
    req: [
      'Comfortable building UI components in React or a similar component library',
      'Can read Figma or design specs and turn them into responsive layouts',
      'Basic Git workflows: branch, pull request, and resolve simple merge conflicts',
    ],
    ideal: [
      'Has shipped a small personal or campus project with a public GitHub repo',
      'Cares about accessibility basics (labels, keyboard focus, contrast)',
      'Writes clear PR descriptions and asks for feedback early',
    ],
  },
  {
    match: /backend|api|payments systems|platform engineering/i,
    skills: ['Node.js', 'SQL', 'REST APIs', 'PostgreSQL'],
    req: [
      'Familiar with REST APIs and JSON request/response shapes',
      'Can write and explain basic SQL joins and filters',
      'Understands authentication concepts (sessions or tokens) at a beginner level',
    ],
    ideal: [
      'Has built a small API (Express, FastAPI, or similar) end-to-end',
      'Comfortable reading server logs when something fails',
      'Interested in data modeling and idempotent writes',
    ],
  },
  {
    match: /full-?stack|full stack/i,
    skills: ['JavaScript', 'React', 'Node.js', 'SQL'],
    req: [
      'Can work across a simple frontend and API in the same week',
      'Comfortable with HTML/CSS/JS and at least one backend language',
      'Able to debug issues that span browser network tab and server logs',
    ],
    ideal: [
      'Has completed a full-stack campus or freelance project',
      'Documents setup steps so the next intern can run the app locally',
      'Balances UI polish with reliable API contracts',
    ],
  },
  {
    match: /mobile|react native|android|ios|kotlin|swift/i,
    skills: ['Mobile UI', 'Git', 'REST APIs'],
    req: [
      'Familiar with mobile app structure (screens, navigation, API calls)',
      'Can follow platform guidelines for layout and touch targets',
      'Comfortable testing on an emulator/simulator or a physical device',
    ],
    ideal: [
      'Has published or demoed a small mobile prototype',
      'Understands offline vs online states in apps',
      'Writes release notes that non-engineers can follow',
    ],
  },
  {
    match: /data analyst|business analyst|analytics|supply chain/i,
    skills: ['Excel', 'SQL', 'Dashboards'],
    req: [
      'Comfortable cleaning messy spreadsheet data and explaining assumptions',
      'Can write basic SQL SELECT queries with WHERE and GROUP BY',
      'Presents findings in a short written summary (not only charts)',
    ],
    ideal: [
      'Has completed a coursework or internship dashboard project',
      'Asks clarifying questions before jumping into analysis',
      'Curious about funnel metrics and experiment design',
    ],
  },
  {
    match: /data engineer|machine learning|nlp|computer vision|ml\b/i,
    skills: ['Python', 'SQL', 'Data pipelines'],
    req: [
      'Solid Python basics (functions, packages, reading CSVs or JSON)',
      'Understands train/eval splits or simple ETL steps at a conceptual level',
      'Can explain a small model or pipeline you have run yourself',
    ],
    ideal: [
      'Has a notebook or repo showing a dataset exploration',
      'Comfortable with virtual environments and dependency files',
      'Documents metrics and failure cases honestly',
    ],
  },
  {
    match: /devops|cloud|sre|observability|release engineering|security operations|cyber/i,
    skills: ['Linux', 'CI/CD', 'Cloud basics'],
    req: [
      'Comfortable with the Linux command line for day-to-day tasks',
      'Understands what CI does (build, test, deploy) even if you have not owned a pipeline yet',
      'Can follow a runbook and escalate clearly when stuck',
    ],
    ideal: [
      'Has configured GitHub Actions, GitLab CI, or similar once',
      'Curious about monitoring, alerts, and incident notes',
      'Values reproducibility over one-off “it works on my machine” fixes',
    ],
  },
  {
    match: /qa|test|automation/i,
    skills: ['Test cases', 'Manual QA', 'Bug reports'],
    req: [
      'Writes clear reproduction steps for bugs (expected vs actual)',
      'Comfortable exploring edge cases in forms and workflows',
      'Familiar with at least one browser DevTools panel (Network or Console)',
    ],
    ideal: [
      'Has used Playwright, Cypress, or Selenium in a course or side project',
      'Thinks about accessibility and mobile breakpoints while testing',
      'Partners with developers without treating QA as a blame game',
    ],
  },
  {
    match: /design|brand|product design|figma/i,
    skills: ['Figma', 'Wireframes', 'User flows'],
    req: [
      'Can produce clean wireframes and a short rationale for layout choices',
      'Comfortable taking feedback in design critique without shutting down',
      'Understands spacing, typography hierarchy, and basic contrast',
    ],
    ideal: [
      'Has a small portfolio case study (even campus projects count)',
      'Collaborates with engineers on component constraints early',
      'Writes alt text and empty-state copy thoughtfully',
    ],
  },
  {
    match: /marketing|growth|content|technical writing|quill/i,
    skills: ['Writing', 'SEO basics', 'Analytics'],
    req: [
      'Strong written English suitable for product or campaign copy',
      'Can turn a brief into a draft outline within a day',
      'Comfortable editing for clarity, tone, and factual accuracy',
    ],
    ideal: [
      'Has published blogs, campus newsletters, or campaign drafts',
      'Uses simple analytics (UTMs, page views) to judge what worked',
      'Works well with designers and product managers on messaging',
    ],
  },
  {
    match: /customer success|partner success|people ops|support engineering|crm|salesforce/i,
    skills: ['CRM', 'Communication', 'Process docs'],
    req: [
      'Clear written and spoken communication with internal stakeholders',
      'Comfortable documenting processes so others can follow them',
      'Organized with follow-ups, SLAs, and ticket or spreadsheet tracking',
    ],
    ideal: [
      'Has handled campus club ops, support inbox, or CRM homework data',
      'Empathetic with users while still protecting product constraints',
      'Suggests process improvements after seeing repeated issues',
    ],
  },
  {
    match: /finance|logistics|marketplace/i,
    skills: ['Excel', 'Process mapping', 'Attention to detail'],
    req: [
      'Strong attention to detail with numbers and status fields',
      'Comfortable with Excel or Google Sheets formulas for reconciliations',
      'Can summarize exceptions for a manager in plain language',
    ],
    ideal: [
      'Has interned or volunteered in ops, finance, or logistics contexts',
      'Builds simple trackers others actually use',
      'Flags risks early instead of waiting for month-end surprises',
    ],
  },
];

const FALLBACK = {
  skills: ['Communication', 'Problem solving', 'Git'],
  req: [
    'Currently enrolled or recently graduated in a relevant field',
    'Able to learn quickly from documentation and mentor feedback',
    'Comfortable collaborating asynchronously with weekly check-ins',
  ],
  ideal: [
    'Shows initiative on small ownership areas without constant prompting',
    'Writes clear status updates and asks focused questions',
    'Curious about shipping work that real users will see',
  ],
};

function bankForTitle(title) {
  for (const b of ROLE_BANKS) {
    if (b.match.test(title || '')) return b;
  }
  return FALLBACK;
}

function workModeLine(workMode, location, seed) {
  const mode = String(workMode || '').trim() || 'Hybrid';
  const loc = String(location || '').trim();
  const variants = {
    Remote: [
      'Able to work remotely with reliable internet during core collaboration hours',
      'Comfortable with remote stand-ups and async updates in chat/email',
      'Available for video check-ins across the stated internship window',
    ],
    Hybrid: [
      `Able to join hybrid days${loc ? ` in or near ${loc}` : ''} as agreed with the team`,
      'Can split time between remote delivery and occasional onsite collaboration',
      'Flexible for hybrid rituals (office days + remote deep-work blocks)',
    ],
    Onsite: [
      `Able to work onsite${loc ? ` in ${loc}` : ''} for the internship duration`,
      `Available for in-office collaboration${loc ? ` (${loc})` : ''} during team hours`,
      'Comfortable with onsite mentorship and desk-based collaboration',
    ],
  };
  const list = variants[mode] || [
    `Able to commit to the stated work mode (${mode})${loc ? ` — ${loc}` : ''} for the internship`,
    'Can honour the posting’s work-mode and schedule expectations',
  ];
  return pick(list, `${seed}:mode`);
}

function buildSections(row) {
  const title = row.title || 'Internship';
  const seed = `${row.id}|${title}|${row.work_mode}|${row.location}`;
  const bank = bankForTitle(title);
  const existingSkills = Array.isArray(row.eligibility?.skills)
    ? row.eligibility.skills.filter(Boolean).map(String)
    : [];
  const skills = existingSkills.length ? existingSkills.slice(0, 6) : bank.skills;

  const skillLine = pick(
    [
      `Hands-on familiarity with ${skills.slice(0, 2).join(' and ') || 'the tools listed for this role'}`,
      `Comfortable using ${skills.slice(0, 2).join(' / ') || 'core tools for this role'} in coursework or projects`,
      `Prior exposure to ${skills[0] || 'the primary stack'}; willingness to ramp on ${skills[1] || 'adjacent tools'}`,
    ],
    `${seed}:skill`,
  );

  const reqExtra = pick(bank.req, `${seed}:req0`);
  const reqExtra2 = pick(
    bank.req.filter((x) => x !== reqExtra).concat(FALLBACK.req),
    `${seed}:req1`,
  );

  const requirements = [
    reqExtra,
    skillLine,
    workModeLine(row.work_mode, row.location, seed),
    reqExtra2,
  ]
    // de-dupe while preserving order
    .filter((line, i, arr) => line && arr.indexOf(line) === i)
    .slice(0, 4)
    .join('\n');

  const ideal = [
    pick(bank.ideal, `${seed}:ideal0`),
    pick(
      bank.ideal.filter((x) => x !== pick(bank.ideal, `${seed}:ideal0`)).concat(FALLBACK.ideal),
      `${seed}:ideal1`,
    ),
    pick(
      [
        `Excited about the ${title.replace(/\s+[—-].*$/, '').trim()} problem space`,
        'Shares work-in-progress early rather than waiting for perfect demos',
        'Treats mentors and teammates with professional respect under deadlines',
      ],
      `${seed}:ideal2`,
    ),
  ]
    .filter((line, i, arr) => line && arr.indexOf(line) === i)
    .slice(0, 3)
    .join('\n');

  return { skills, requirements_text: requirements, ideal_profile_text: ideal };
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL missing');
    process.exit(2);
  }
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  try {
    const { rows } = await pool.query(`
      SELECT id, title, work_mode, location, eligibility
      FROM ip_internships
      WHERE status = 'published'
        AND (eligibility IS NULL OR coalesce(eligibility->>'requirements_text', '') = '')
      ORDER BY id
    `);
    console.log(`Found ${rows.length} published postings missing requirements_text`);

    if (rows.length) {
    // uniqueness sanity: sample first 20 requirement strings must not all be identical
    const preview = rows.slice(0, 20).map((r) => buildSections(r).requirements_text);
    const uniquePreview = new Set(preview).size;
    console.log(`Preview uniqueness among first 20: ${uniquePreview}/20 distinct texts`);
    if (DRY) {
      console.log('DRY RUN sample:\n', JSON.stringify(
        rows.slice(0, 3).map((r) => ({ id: r.id, title: r.title, ...buildSections(r) })),
        null,
        2,
      ));
      return;
    }

    let updated = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const sections = buildSections(row);
        const base =
          row.eligibility && typeof row.eligibility === 'object' && !Array.isArray(row.eligibility)
            ? { ...row.eligibility }
            : {};
        const next = {
          ...base,
          skills: sections.skills,
          requirements_text: sections.requirements_text,
          ideal_profile_text: sections.ideal_profile_text,
        };
        await client.query(
          `UPDATE ip_internships
           SET eligibility = $2::jsonb, updated_at = now()
           WHERE id = $1`,
          [row.id, JSON.stringify(next)],
        );
        updated += 1;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const check = await pool.query(`
      SELECT
        count(1)::int AS published,
        count(1) FILTER (
          WHERE eligibility IS NULL OR coalesce(eligibility->>'requirements_text','') = ''
        )::int AS still_missing,
        count(1) FILTER (
          WHERE coalesce(eligibility->>'requirements_text','') <> ''
        )::int AS has_req
      FROM ip_internships WHERE status = 'published'
    `);
    const distinct = await pool.query(`
      SELECT count(DISTINCT eligibility->>'requirements_text')::int AS distinct_req
      FROM ip_internships
      WHERE status = 'published'
        AND coalesce(eligibility->>'requirements_text','') <> ''
    `);
    console.log(JSON.stringify({
      updated,
      ...check.rows[0],
      distinct_requirements_text: distinct.rows[0].distinct_req,
      dryRun: false,
    }, null, 2));
    } else if (DRY) {
      console.log('Nothing to fill (dry-run)');
      return;
    }

    if (!DRY && !NO_SHOWCASE) {
      await applyShowcaseBlanks(pool);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
