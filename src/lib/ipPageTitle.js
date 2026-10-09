import { CANDIDATE_NAV, EMPLOYER_NAV, SUPERADMIN_NAV } from '@/lib/ipNav';

const SITE = 'InternSafar';

/** Routes outside the sidebar, or detail routes that need their own name. Checked before nav prefixes. */
const EXTRA = [
  [/^\/$/, 'Sign in'],
  [/^\/login$/, 'Sign in'],
  [/^\/superadmin\/login$/, 'SuperAdmin sign in'],
  [/^\/register$/, 'Create account'],
  [/^\/register\/candidate$/, 'Candidate registration'],
  [/^\/register\/employer\/verify$/, 'Verify employer email'],
  [/^\/register\/employer$/, 'Employer registration'],
  [/^\/forgot-password$/, 'Forgot password'],
  [/^\/help$/, 'Help'],
  [/^\/how-it-works$/, 'How it works'],
  [/^\/guidelines$/, 'Guidelines'],
  [/^\/unsubscribe$/, 'Email preferences'],
  [/^\/r\/[^/]+$/, 'Referral'],
  [/^\/candidate\/internships\/[^/]+$/, 'Internship details'],
  [/^\/candidate\/employers\/[^/]+$/, 'Employer'],
  [/^\/candidate\/messages\/[^/]+$/, 'Conversation'],
  [/^\/employer\/internships\/new$/, 'Post an internship'],
  [/^\/employer\/internships\/[^/]+\/edit$/, 'Edit posting'],
  [/^\/employer\/internships\/[^/]+$/, 'Posting applicants'],
  [/^\/employer\/candidates\/[^/]+$/, 'Candidate profile'],
  [/^\/employer\/messages\/[^/]+$/, 'Conversation'],
  [/^\/employer\/viral$/, 'Share postings'],
  [/^\/superadmin\/candidates\/[^/]+$/, 'Candidate details'],
  [/^\/superadmin\/viral$/, 'Share postings'],
  [/^\/superadmin\/requests$/, 'Requests'],
  [/^\/superadmin\/form-registrations$/, 'Form registrations'],
];

const NAV = [...CANDIDATE_NAV, ...EMPLOYER_NAV, ...SUPERADMIN_NAV];

function labelFor(pathname) {
  for (const [re, label] of EXTRA) if (re.test(pathname)) return label;
  const exact = NAV.find((n) => n.href === pathname);
  if (exact) return exact.label;
  const prefix = NAV.filter((n) => pathname.startsWith(`${n.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  return prefix?.label || '';
}

/** Browser tab title for a route, e.g. "My applications · InternSafar". */
export function pageTitleFor(pathname) {
  const label = labelFor(String(pathname || '/').replace(/\/+$/, '') || '/');
  if (!label) return SITE;
  const role = /^\/(candidate|employer|superadmin)\b/.exec(pathname)?.[1];
  const roleName = { candidate: 'Candidate', employer: 'Employer', superadmin: 'SuperAdmin' }[role];
  const text = label === 'Dashboard' && roleName ? `${roleName} dashboard` : label;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} · ${SITE}`;
}
