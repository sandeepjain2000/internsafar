/**
 * Realistic, varied personas for InternSafar QA register / seed scripts.
 * Do NOT route applications or messages at core showcase accounts unless the
 * case explicitly tests cores. Prefer a fresh persona each run.
 *
 * Naming rules: human first/last, real-looking company + internship titles,
 * no `user12345` / random digit dumps as the primary identity.
 */

const PERSONAS = [
  {
    contactName: 'Meera Iyer',
    designation: 'Talent Acquisition Lead',
    companyName: 'Harborline Analytics',
    companySlug: 'harborline-analytics',
    website: 'https://harborline-analytics.example',
    industry: 'Analytics',
    internshipTitle: 'Data Analyst Intern',
  },
  {
    contactName: 'Rohan Deshmukh',
    designation: 'University Relations Manager',
    companyName: 'Nimbus Retail Tech',
    companySlug: 'nimbus-retail-tech',
    website: 'https://nimbus-retail-tech.example',
    industry: 'Retail Technology',
    internshipTitle: 'Frontend Developer Intern',
  },
  {
    contactName: 'Ananya Reddy',
    designation: 'HR Business Partner',
    companyName: 'Cedarcrest Health Systems',
    companySlug: 'cedarcrest-health',
    website: 'https://cedarcrest-health.example',
    industry: 'Healthcare',
    internshipTitle: 'Operations Intern',
  },
  {
    contactName: 'Kabir Menon',
    designation: 'Campus Hiring Lead',
    companyName: 'Brightspan Logistics',
    companySlug: 'brightspan-logistics',
    website: 'https://brightspan-logistics.example',
    industry: 'Logistics',
    internshipTitle: 'Supply Chain Intern',
  },
  {
    contactName: 'Sneha Kulkarni',
    designation: 'Recruiting Manager',
    companyName: 'Folio Creative Studio',
    companySlug: 'folio-creative',
    website: 'https://folio-creative.example',
    industry: 'Design',
    internshipTitle: 'UI/UX Design Intern',
  },
  {
    contactName: 'Arjun Nair',
    designation: 'People Operations Lead',
    companyName: 'Northwind Payments',
    companySlug: 'northwind-payments',
    website: 'https://northwind-payments.example',
    industry: 'Fintech',
    internshipTitle: 'Backend Developer Intern',
  },
];

const CORE_EMAIL_NEEDLES = [
  'lawsonlclintern',
  'placementhubsupport@gmail.com',
  'support@placementhub.online',
];

/** Short alphabetic run tag (not a raw integer dump). Includes seconds for uniqueness. */
export function runTag(date = new Date()) {
  const day = date.toISOString().slice(2, 10).replace(/-/g, '');
  const tod = date.getUTCHours().toString(36) + date.getUTCMinutes().toString(36) + date.getUTCSeconds().toString(36);
  const salt = Math.random().toString(36).slice(2, 5);
  return `${day}${tod}${salt}`;
}

export function pickPersona(index = Date.now()) {
  return PERSONAS[((Number(index) % PERSONAS.length) + PERSONAS.length) % PERSONAS.length];
}

/**
 * Build a unique employer register payload that still reads like a real company.
 * @param {'domain'|'free_email'} path
 */
export function buildEmployerRegisterPersona(path = 'domain', opts = {}) {
  const tag = String(opts.runTag || runTag());
  const persona = opts.persona || pickPersona(opts.index ?? Date.now());
  const local = persona.contactName.toLowerCase().replace(/\s+/g, '.');
  const email =
    path === 'free_email'
      ? `${local}.${tag}@outlook.com`
      : `${local}@${persona.companySlug}.${tag}.example`;

  return {
    path,
    contactName: persona.contactName,
    designation: persona.designation,
    companyName: persona.companyName,
    website: path === 'domain' ? persona.website : undefined,
    email,
    password: opts.password || 'Harborline#Ready92',
    businessEntityType: 'Private Limited',
    internshipTitle: persona.internshipTitle,
    industry: persona.industry,
    runTag: tag,
  };
}

/** True if an email belongs to a protected core / showcase mailbox. */
export function isCoreShowcaseEmail(email) {
  const e = String(email || '').toLowerCase();
  return CORE_EMAIL_NEEDLES.some((n) => e.includes(n.toLowerCase()));
}

export { PERSONAS, CORE_EMAIL_NEEDLES };
