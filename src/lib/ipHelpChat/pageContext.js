/**
 * Safe page labels derived from real InternSafar routes only.
 * pathname only — never trust client-supplied labels blindly; remap here.
 */
const ROUTE_LABELS = [
  { match: /^\/$/, label: 'Sign in', topic: 'authentication' },
  { match: /^\/register\/?$/, label: 'Register hub', topic: 'authentication' },
  { match: /^\/register\/candidate/, label: 'Candidate registration', topic: 'authentication' },
  { match: /^\/register\/employer/, label: 'Employer registration', topic: 'authentication' },
  { match: /^\/forgot-password/, label: 'Forgot password', topic: 'authentication' },
  { match: /^\/help/, label: 'Help Center', topic: 'troubleshooting' },
  { match: /^\/how-it-works/, label: 'How it works', topic: 'troubleshooting' },
  { match: /^\/guidelines/, label: 'Guidelines', topic: 'internships' },
  { match: /^\/candidate\/internships/, label: 'Browse internships', topic: 'internships' },
  { match: /^\/candidate\/applications/, label: 'My applications', topic: 'candidate' },
  { match: /^\/candidate\/offers/, label: 'My offers', topic: 'candidate' },
  { match: /^\/candidate\/messages/, label: 'Candidate messages', topic: 'messaging' },
  { match: /^\/candidate\/profile/, label: 'Candidate profile', topic: 'candidate' },
  { match: /^\/candidate\/?$/, label: 'Candidate home', topic: 'candidate' },
  { match: /^\/employer\/internships\/new/, label: 'Post internship', topic: 'employer' },
  { match: /^\/employer\/internships/, label: 'Employer internships', topic: 'employer' },
  { match: /^\/employer\/candidates/, label: 'Search candidates', topic: 'employer' },
  { match: /^\/employer\/messages/, label: 'Employer messages', topic: 'messaging' },
  { match: /^\/employer\/profile/, label: 'Employer profile', topic: 'employer' },
  { match: /^\/employer\/?$/, label: 'Employer home', topic: 'employer' },
  { match: /^\/superadmin\/login/, label: 'SuperAdmin login', topic: 'superadmin' },
  { match: /^\/superadmin\/approvals/, label: 'SuperAdmin approvals', topic: 'superadmin' },
  { match: /^\/superadmin\/form-registrations/, label: 'Form registrations', topic: 'superadmin' },
  { match: /^\/superadmin/, label: 'SuperAdmin dashboard', topic: 'superadmin' },
];

/**
 * Normalize client page context to a safe server object.
 * @param {unknown} raw
 */
export function normalizePageContext(raw) {
  const pathname = String(raw?.pathname || raw?.path || '')
    .split('?')[0]
    .split('#')[0]
    .trim();
  if (!pathname.startsWith('/')) {
    return { pathname: null, label: null, topic: null };
  }
  // Reject obviously unsafe / huge paths
  if (pathname.length > 200 || pathname.includes('..')) {
    return { pathname: null, label: null, topic: null };
  }

  for (const row of ROUTE_LABELS) {
    if (row.match.test(pathname)) {
      return { pathname, label: row.label, topic: row.topic };
    }
  }
  return { pathname, label: 'InternSafar page', topic: null };
}
