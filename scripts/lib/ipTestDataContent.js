/**
 * Realistic demo content for InternSafar test-data generators.
 * Used by generate-ip-test-data.mjs and IP_Reset_Core_Sample.js.
 * No "Test User N" / identical "QA Intern" placeholders.
 */

const TARGET_LIST_ROWS = 22; // ≥2 UI pages when PAGE_SIZE is 10

const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Rohan', 'Ishita', 'Kabir', 'Diya', 'Vikram', 'Sneha',
  'Aditya', 'Kavya', 'Rahul', 'Nisha', 'Siddharth', 'Pooja', 'Arjun', 'Meera',
  'Dev', 'Tanvi', 'Nikhil', 'Shruti', 'Harsh', 'Anika', 'Yash', 'Riya',
  'Kunal', 'Sanya', 'Aman', 'Isha', 'Varun', 'Neha', 'Ritika', 'Pranav',
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Khan', 'Das',
  'Singh', 'Joshi', 'Mehta', 'Banerjee', 'Chopra', 'Malhotra', 'Pillai', 'Rao',
  'Desai', 'Kapoor', 'Verma', 'Menon', 'Agarwal', 'Bose', 'Saxena', 'Kulkarni',
];

const CITIES = [
  'Bengaluru', 'Pune', 'Hyderabad', 'Mumbai', 'Chennai', 'Delhi NCR',
  'Ahmedabad', 'Jaipur', 'Kochi', 'Chandigarh', 'Indore', 'Kolkata',
];

const COLLEGES = [
  'VIT Vellore', 'BITS Pilani', 'NIT Trichy', 'IIIT Hyderabad', 'SRM Chennai',
  'Manipal Institute of Technology', 'PES University', 'DTU Delhi',
  'COEP Pune', 'Amrita School of Engineering', 'RV College of Engineering',
  'IIT Madras',
];

const COMPANIES = [
  'Nova Labs', 'Pulse Media', 'BrightPath Analytics', 'Cedar Softworks',
  'Orbit Fintech', 'Lotus Health Tech', 'Indigo Retail Labs', 'Summit Cloud',
  'Aether Mobility', 'Canvas EdTech', 'Forge Robotics', 'BluePeak Consulting',
  'Saffron Foods Tech', 'Nimbus Logistics', 'PixelCraft Studio', 'Harbor Bank Digital',
  'GreenLeaf AgriTech', 'Stratos Telecom', 'Quill Content', 'Vertex Pharma IT',
  'Maple HR Solutions', 'Tidewave Commerce', 'Astra Design Co', 'Helix Biotech Soft',
];

const ROLE_TITLES = [
  'Frontend Developer Intern',
  'React Native Mobile Intern',
  'Data Analyst Intern',
  'Backend API Intern',
  'Product Design Intern',
  'QA Automation Intern',
  'DevOps & Cloud Intern',
  'Machine Learning Intern',
  'Full-Stack Web Intern',
  'Growth Marketing Intern',
  'Business Analyst Intern',
  'Cybersecurity Intern',
  'UI Engineering Intern',
  'Content Strategy Intern',
  'Salesforce Admin Intern',
  'Data Engineering Intern',
  'Customer Success Intern',
  'Android Kotlin Intern',
  'iOS Swift Intern',
  'Technical Writing Intern',
  'Supply Chain Analytics Intern',
  'People Ops Intern',
  'Finance Operations Intern',
  'SRE Observability Intern',
  'Platform Engineering Intern',
  'Analytics Engineering Intern',
  'Brand Design Intern',
  'Partner Success Intern',
  'Payments Systems Intern',
  'NLP Research Intern',
  'Computer Vision Intern',
  'Security Operations Intern',
  'Release Engineering Intern',
  'Support Engineering Intern',
  'CRM Implementation Intern',
  'Marketplace Ops Intern',
  'Logistics Optimization Intern',
  'Risk Analytics Intern',
  'Clinical Data Intern',
  'EdTech Curriculum Intern',
  'Hardware Prototyping Intern',
  'Embedded Systems Intern',
  'API Integrations Intern',
  'Accessibility Engineering Intern',
  'Performance Marketing Intern',
  'RevOps Analyst Intern',
  'Trust & Safety Intern',
  'Site Reliability Intern',
];

/**
 * Always-unique role title for seed data (never reuse the same display name).
 * Index 0..N-1 maps to ROLE_TITLES; beyond that adds city + track suffixes.
 */
function roleTitle(i) {
  const n = Number(i) || 0;
  if (n < ROLE_TITLES.length) return ROLE_TITLES[n];
  const base = ROLE_TITLES[n % ROLE_TITLES.length];
  const city = CITIES[n % CITIES.length];
  const track = n % 5 === 0 ? 'Summer' : n % 5 === 1 ? 'Winter' : n % 5 === 2 ? 'Spring' : n % 5 === 3 ? 'Fall' : 'Flex';
  const wave = Math.floor(n / ROLE_TITLES.length);
  return `${base} (${city} ${track}${wave > 1 ? ` ${wave}` : ''})`;
}
const SKILL_SETS = [
  ['React', 'TypeScript', 'CSS'],
  ['Python', 'SQL', 'Pandas'],
  ['Java', 'Spring', 'PostgreSQL'],
  ['Node.js', 'Express', 'MongoDB'],
  ['Figma', 'UX Research', 'Prototyping'],
  ['Selenium', 'Cypress', 'Jest'],
  ['AWS', 'Docker', 'Kubernetes'],
  ['TensorFlow', 'Python', 'NLP'],
  ['Next.js', 'Prisma', 'Tailwind'],
  ['Excel', 'Power BI', 'SQL'],
];

const WORK_MODES = ['Hybrid', 'Remote', 'Onsite'];

const APP_STATUSES = [
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

const IDEA_STATUSES = [
  'Pending approval',
  'Under review',
  'In progress',
  'Planned',
  'Shipped',
  'Declined',
];

/** Unique feature-idea titles — never reuse the same string. */
const FEATURE_IDEAS = [
  {
    title: 'Calendar sync for interview slots',
    description:
      'Let employers publish interview windows that candidates can book; sync accepted slots to Google Calendar with reminders.',
    problem: 'Scheduling back-and-forth slows hiring.',
    solution: 'Shared availability + one-click book + calendar invite.',
  },
  {
    title: 'Bulk shortlist with notes',
    description:
      'Select multiple applicants and shortlist them in one action while attaching a private recruiter note.',
    problem: 'Reviewing large applicant pools is click-heavy.',
    solution: 'Multi-select toolbar with optional note field.',
  },
  {
    title: 'Dark mode for candidate browse',
    description:
      'Offer a system-aware dark theme on internship browse and application detail pages for late-night studying.',
    problem: 'Bright UI is hard on eyes during evening applications.',
    solution: 'Theme toggle persisted per account.',
  },
  {
    title: 'CSV export of applications',
    description:
      'Employers should download filtered applicant lists (status, score, city) as CSV for offline review.',
    problem: 'Sharing shortlists with hiring managers needs spreadsheets.',
    solution: 'Export button respecting current filters.',
  },
  {
    title: 'Skill-gap hints on apply',
    description:
      'Show a gentle checklist of missing skills before submit so candidates can update their profile first.',
    problem: 'Incomplete profiles get filtered out silently.',
    solution: 'Pre-submit tips linked to profile sections.',
  },
  {
    title: 'Referral leaderboard (monthly)',
    description:
      'Show anonymized monthly leaderboard of verified referrals to encourage healthy sharing without leaking emails.',
    problem: 'Referral progress feels invisible after first invite.',
    solution: 'Opt-in public display names + points this month.',
  },
  {
    title: 'Offer letter PDF preview',
    description:
      'Preview the offer letter in-browser before accept/decline, with stipend and start date highlighted.',
    problem: 'Candidates hesitate when letter contents are unclear.',
    solution: 'Embedded PDF viewer + summary chips.',
  },
  {
    title: 'Saved search alerts',
    description:
      'Email a digest when new internships match a saved city/role filter.',
    problem: 'Good roles disappear before candidates notice.',
    solution: 'Daily/weekly digest from saved searches.',
  },
  {
    title: 'College verification badge',
    description:
      'Verified college email domains unlock a badge on applications employers can trust.',
    problem: 'Employers doubt unverified student emails.',
    solution: 'Domain check + badge on applicant cards.',
  },
  {
    title: 'Message templates for employers',
    description:
      'Reusable message snippets (interview invite, take-home brief, polite decline) inside the inbox composer.',
    problem: 'Recruiters retype the same outreach daily.',
    solution: 'Personal template library with placeholders.',
  },
  {
    title: 'Application timeline view',
    description:
      'Show candidates a vertical timeline of status changes with timestamps and short explanations.',
    problem: 'Status chips alone feel opaque.',
    solution: 'Timeline drawer on each application.',
  },
  {
    title: 'Stipend range filters',
    description:
      'Add min/max stipend filters on browse so candidates can focus on roles that meet their needs.',
    problem: 'Browsing mixes unpaid and paid roles without clarity.',
    solution: 'Dual-thumb range slider + clear labels.',
  },
  {
    title: 'Keyboard shortcuts in triage',
    description:
      'SuperAdmin feature-idea triage should support j/k navigation and a/r approve/reject hotkeys.',
    problem: 'Mouse-only triage is slow at volume.',
    solution: 'Documented shortcuts with focus management.',
  },
  {
    title: 'Duplicate posting detector',
    description:
      'Warn employers when a new title/location closely matches an existing live posting.',
    problem: 'Accidental duplicate posts confuse applicants.',
    solution: 'Similarity check before publish.',
  },
  {
    title: 'Anonymous company browse mode',
    description:
      'Allow employers to hide brand until shortlist while still showing industry and city.',
    problem: 'Early-stage teams want privacy without empty listings.',
    solution: 'Masked company card until shortlist.',
  },
  {
    title: 'Peer endorsement reminders',
    description:
      'Nudge employers 7 days after hire to leave an endorsement before the internship ends.',
    problem: 'Endorsements are forgotten after onboarding.',
    solution: 'Gentle reminder notification + email.',
  },
  {
    title: 'Multi-location posting chips',
    description:
      'Support multiple office cities on one posting with clear chip filters on browse.',
    problem: 'Roles spanning Bengaluru and Pune need two posts today.',
    solution: 'locations[] already exists — surface chips in UI.',
  },
  {
    title: 'WhatsApp deep-link for offers',
    description:
      'Optional share button that opens WhatsApp with a prefilled offer summary for family discussion.',
    problem: 'Students often decide with parents offline.',
    solution: 'Share sheet with sanitized summary text.',
  },
  {
    title: 'Accessibility audit on apply form',
    description:
      'Ensure screening MCQs announce disable-application consequences to screen readers.',
    problem: 'Disqualifying answers can surprise assistive-tech users.',
    solution: 'Live region + clearer labels.',
  },
  {
    title: 'Employer analytics: time-to-shortlist',
    description:
      'Show median days from apply to shortlist on the employer dashboard.',
    problem: 'Teams cannot see if they are slow to respond.',
    solution: 'Simple KPI card from application timestamps.',
  },
  {
    title: 'Feature idea comment mentions',
    description:
      'Allow @username mentions in idea comments that notify the mentioned user.',
    problem: 'Follow-up discussions miss the right people.',
    solution: 'Mention autocomplete + notification.',
  },
  {
    title: 'Pause posting with reason',
    description:
      'When pausing a role, require a short reason shown to applicants who already applied.',
    problem: 'Paused roles leave applicants guessing.',
    solution: 'Reason field + in-app notice.',
  },
  {
    title: 'Campus ambassador referral codes',
    description:
      'Distinct ambassador codes with monthly caps so colleges can run fair campaigns.',
    problem: 'One personal code does not fit campus drives.',
    solution: 'Ambassador role + capped codes.',
  },
  {
    title: 'Offline PDF of internship brief',
    description:
      'Download a one-page PDF of title, stipend, dates, and screening summary for career-cell printouts.',
    problem: 'Placement cells still circulate paper flyers.',
    solution: 'Print-friendly PDF export.',
  },
];

const MSG_THREADS = [
  [
    'Thanks for applying to this role. We reviewed your profile and would like to understand your preferred start week, any notice period with current commitments, and whether you are comfortable with a short take-home before the live screen. Please reply with two time windows that work over the next five business days so we can lock a slot with the hiring manager.',
    'Thank you for the note. I can start from next Monday if selected. I am free Tuesday and Thursday afternoons this week (2–5pm IST), and I am happy to complete a take-home beforehand. Looking forward to learning more about the team’s stack and the first-month goals for the internship.',
    'Great — we will send a brief take-home focused on a small API + UI polish task (about three hours) and schedule a 25-minute call on Thursday at 3pm IST. Please confirm you received the calendar invite and whether you need any accommodations for the screen.',
    'Sounds good — I will keep an eye on my inbox for the brief and the calendar invite. Thursday 3pm IST works perfectly. I will submit the take-home by Wednesday evening so you have time to review before we speak.',
  ],
  [
    'Hi — we reviewed your application in detail and would like to chat about the role, your recent coursework, and how you approach debugging under time pressure. Could you share a short summary of a project you are proud of and your availability for a 20-minute intro call this week?',
    'Thank you! Happy to discuss. A recent project I led was a campus events dashboard (Next.js + Postgres) used by 200+ students. I am available Wednesday after 4pm IST or Friday morning before 11am IST. Happy to walk through architecture decisions and trade-offs live.',
    'Are you free Thursday afternoon for a 20-minute screen with the tech lead? We will cover React fundamentals, one SQL question, and a brief discussion of your events dashboard. Please join with a quiet environment and a stable connection.',
    'Thursday 3pm works for me. I will prepare a short walkthrough of the dashboard and have my environment ready. Looking forward to meeting the tech lead and learning more about the day-to-day expectations for interns on the team.',
  ],
  [
    'Quick note on logistics: please confirm your preferred work mode (hybrid vs remote), typical commute time if hybrid, and whether you can be onsite for the first two weeks of onboarding. This helps us assign a mentor desk and badge access in advance.',
    'Hybrid three days in office works best for me. My commute is about 35–40 minutes each way, and I can be onsite for the first two weeks of onboarding without issues. Remote days I have a dedicated desk and dual monitors at home.',
    'Noted — that matches our team setup (Tue/Wed/Thu onsite). We will share the office map and dress-code note in the next email. Please also confirm you can attend a short facilities orientation on day one at 10am.',
    'Appreciate the clarity! Day-one 10am orientation works. I will bring a government ID for badge issuance and will review the office map once it arrives. Thanks again for the detailed planning.',
  ],
  [
    'Could you share a GitHub or portfolio link when you have a moment? We are especially interested in readable commits, component structure, and any README that explains how to run the project locally. Optional: a short Loom if that is easier than writing.',
    'Absolutely — here is my portfolio with two recent projects, including a design-system exploration and a data-viz dashboard. Each repo has a README with setup steps. Happy to record a short Loom if you want a guided tour of the component library.',
    'Thanks, the design system work looks strong — especially the token documentation and accessibility notes. For the next step we may ask you to extend one component with a new variant under a 90-minute timed exercise.',
    'Glad it resonated. Happy to walk through it live and I am comfortable with a timed exercise. Please send timing and any constraints (libraries allowed, browser targets) whenever you are ready.',
  ],
  [
    'We liked your SQL case study and the clarity of your write-up. Open to a short take-home that mirrors a real reporting task we use internally? Estimated effort is three hours; deadline would be Friday end of day IST.',
    'Yes — please send the brief and deadline. I can block Thursday evening for focused work and will validate results against edge cases before submitting. If there is a preferred file format for delivery, let me know.',
    'Deadline is Friday EOD IST; expect about three hours of work. Deliver a SQL file plus a one-page note explaining assumptions. Do not optimize prematurely — correctness and readability matter more than cleverness.',
    'Perfect, I will submit by Thursday evening so you have buffer before Friday EOD. I will include assumptions and sample outputs in the note. Thanks for the clear rubric.',
  ],
  [
    'Confirming you are based in Pune for the hybrid days, and whether you need relocation support or temporary housing tips. Also flag any exam windows in the next eight weeks that could conflict with onboarding.',
    'Yes, I am in Baner and can commute easily to Hinjewadi. No relocation needed. My only exam window is a two-day midterm in week six; I can still attend hybrid days around that with advance notice to my mentor.',
    'Excellent — our office is in Hinjewadi Phase 1 near the main metro feeder. We will introduce you to the facilities channel on Slack after offer acceptance. Please keep us posted if exam dates shift.',
    'That commute works for me. I will update you if midterm dates move, and I will join the facilities channel once access is granted. Looking forward to contributing onsite with the team.',
  ],
];

const NOTIFICATION_SPECS = [
  { title: 'Application received', body: 'Your application is in review. We will update you soon.', category: 'application', link: '/candidate/applications' },
  { title: 'Shortlisted for interview', body: 'An employer shortlisted you. Check messages for next steps.', category: 'application', link: '/candidate/messages' },
  { title: 'New message from recruiter', body: 'You have an unread message about an active application.', category: 'message', link: '/candidate/messages' },
  { title: 'Offer awaiting response', body: 'A new internship offer needs your accept or decline.', category: 'offer', link: '/candidate/offers' },
  { title: 'Offer reminder', body: 'Reminder: an offer expires soon. Review stipend and start date.', category: 'offer', link: '/candidate/offers' },
  { title: 'Profile completeness tip', body: 'Add preferred locations to improve match quality on browse.', category: 'system', link: '/candidate/profile' },
  { title: 'Referral points credited', body: 'A verified referral earned you bonus points.', category: 'referral', link: '/candidate/referral' },
  { title: 'Saved role starting soon', body: 'A saved internship begins within two weeks.', category: 'application', link: '/candidate/internships' },
  { title: 'New applicants on your posting', body: 'Several candidates applied overnight — review the shortlist.', category: 'application', link: '/employer/candidates' },
  { title: 'Document pending review', body: 'Shop Act upload is awaiting SuperAdmin review.', category: 'system', link: '/employer/documents' },
  { title: 'Candidate accepted offer', body: 'A candidate accepted your offer. Plan onboarding.', category: 'offer', link: '/employer/offers' },
  { title: 'Interview slot suggested', body: 'A candidate proposed Thursday afternoon for a screen.', category: 'interview', link: '/employer/messages' },
  { title: 'Pending employer approval', body: 'A new employer request is waiting in Approvals.', category: 'system', link: '/superadmin/approvals' },
  { title: 'Feature idea needs triage', body: 'New product ideas are pending approval.', category: 'system', link: '/superadmin/feature-ideas' },
  { title: 'Integrity check passed', body: 'Nightly DB integrity script reported no blocking issues.', category: 'system', link: '/superadmin' },
  { title: 'Login report available', body: 'Weekly login activity is ready to export.', category: 'system', link: '/superadmin/login-report' },
  { title: 'Rejection template saved', body: 'Your polite decline template is ready to use.', category: 'system', link: '/employer/templates' },
  { title: 'Endorsement reminder', body: 'Consider endorsing a hired intern from last month.', category: 'system', link: '/employer/candidates' },
  { title: 'Points balance updated', body: 'Publishing a role deducted points from your wallet.', category: 'system', link: '/employer/referral' },
  { title: 'Message thread unread', body: 'Two candidates replied to your outreach.', category: 'message', link: '/employer/messages' },
  { title: 'Screening question tip', body: 'MCQ disable-application rules help filter city mismatches.', category: 'system', link: '/employer/internships' },
  { title: 'Browse chip: starting soon', body: 'Roles starting within 21 days are highlighted for candidates.', category: 'system', link: '/candidate/internships' },
  { title: 'Offer declined', body: 'A candidate declined — the seat is open again.', category: 'offer', link: '/employer/offers' },
  { title: 'New feature idea comment', body: 'Someone commented on an idea you follow.', category: 'system', link: '/ideas' },
];

const OFFER_MESSAGES = [
  'We were impressed by your projects and would love you on the team. Please review stipend and start date.',
  'Congratulations — this offer reflects your strong screening performance. Reply within seven days.',
  'Excited to extend this internship offer. Hybrid schedule details are in the letter.',
  'Welcome aboard pending acceptance. Reach out if you have questions about the role scope.',
  'Your case study stood out. We hope you will join us for the summer cohort.',
];

function pick(arr, i) {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

/** Unique-enough realistic names (no repeated identical full names across a seed run). */
function personName(i) {
  const n = Math.max(0, Number(i) || 0);
  const first = FIRST_NAMES[n % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(n / FIRST_NAMES.length) % LAST_NAMES.length];
  const wrap = Math.floor(n / (FIRST_NAMES.length * LAST_NAMES.length));
  if (wrap === 0) return `${first} ${last}`;
  const middles = ['R', 'S', 'K', 'M', 'A', 'V', 'P', 'N', 'T', 'D'];
  return `${first} ${middles[wrap % middles.length]}. ${last}`;
}

function companyName(i) {
  // Prefer catalog uniqueness; suffix only if we exceed catalog length
  if (i < COMPANIES.length) return COMPANIES[i];
  const base = pick(COMPANIES, i);
  const city = pick(CITIES, i + 3);
  return `${base} · ${city}`;
}

/**
 * Fail fast if a seed batch reuses the same display label (makes data look fake).
 * @param {string[]} labels
 * @param {string} context e.g. 'candidate names' | 'company names' | 'role titles'
 */
function assertUniqueLabels(labels, context = 'labels') {
  const seen = new Map();
  for (const raw of labels) {
    const label = String(raw || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `[test-data] Duplicate ${context}: "${label}" (also at index ${seen.get(key)}). ` +
          'Use distinct realistic names so offers/applications do not look copied.',
      );
    }
    seen.set(key, label);
  }
  return true;
}

function internshipDescription(title, company, city, i) {
  const focus = pick(
    [
      'ship a production feature with weekly demos',
      'own a dashboard slice end-to-end',
      'partner with mentors on customer interviews',
      'improve reliability of an internal tool',
      'analyze funnel metrics and propose experiments',
    ],
    i,
  );
  // Bullet lines so candidate detail renders About This Role as a list.
  return [
    `${title} at ${company} (${city}).`,
    `- You will ${focus}`,
    '- Join code reviews and a mid-internship check-in',
    '- Present outcomes to the hiring manager at the end',
  ].join('\n');
}

/** Eligibility payload for Match % + Minimum Requirements / Ideal Candidate sections. */
function internshipEligibilityAt(i) {
  const skills = skillsAt(i);
  const requirements = [
    `Currently enrolled or recently graduated in a relevant field`,
    `Comfortable with ${skills.slice(0, 2).join(' and ') || 'core tools'}`,
    'Able to commit to the stated work mode for the internship duration',
  ].join('\n');
  const ideal = [
    `Hands-on project using ${skills[0] || 'your strongest skill'}`,
    'Clear written communication and weekly status updates',
    'Curious about shipping small features with mentors',
  ].join('\n');
  return {
    skills,
    requirements_text: requirements,
    ideal_profile_text: ideal,
  };
}

/** Multi-entry experience JSON for profile Step 2 (stored in prior_experience TEXT). */
function experienceEntriesJsonAt(i) {
  const skills = skillsAt(i);
  const entries = [
    {
      id: `exp_seed_${i}_1`,
      title: pick(['Project intern', 'Campus developer', 'Research assistant', 'Open-source contributor'], i),
      organization: pick(COLLEGES, i),
      start: 'Jun 2025',
      end: 'Aug 2025',
      description: [
        `- Built a small feature using ${skills[0] || 'JavaScript'}`,
        '- Documented setup steps for the next intern',
      ].join('\n'),
    },
  ];
  if (i % 3 === 0) {
    entries.push({
      id: `exp_seed_${i}_2`,
      title: 'Side project',
      organization: 'Personal',
      start: '2024',
      end: 'Present',
      description: `- Side project exploring ${skills[1] || skills[0] || 'web apps'}`,
    });
  }
  return JSON.stringify(entries);
}

function ideaAt(i) {
  return pick(FEATURE_IDEAS, i);
}

function msgSnippets(i) {
  return pick(MSG_THREADS, i);
}

function notificationAt(i) {
  return pick(NOTIFICATION_SPECS, i);
}

function skillsAt(i) {
  return pick(SKILL_SETS, i);
}

module.exports = {
  TARGET_LIST_ROWS,
  FIRST_NAMES,
  LAST_NAMES,
  CITIES,
  COLLEGES,
  COMPANIES,
  ROLE_TITLES,
  SKILL_SETS,
  WORK_MODES,
  APP_STATUSES,
  IDEA_STATUSES,
  FEATURE_IDEAS,
  MSG_THREADS,
  NOTIFICATION_SPECS,
  OFFER_MESSAGES,
  pick,
  personName,
  companyName,
  roleTitle,
  assertUniqueLabels,
  internshipDescription,
  internshipEligibilityAt,
  experienceEntriesJsonAt,
  ideaAt,
  msgSnippets,
  notificationAt,
  skillsAt,
};
