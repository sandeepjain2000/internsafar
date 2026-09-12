import { ROLE_HOME } from '@/lib/roleHome';

/**
 * Approved in-app actions only. LLM may suggest ids from this list; server resolves href.
 */
export const HELP_ACTIONS = [
  { id: 'open_home', label: 'Open sign in', href: '/', roles: ['guest'] },
  { id: 'open_register', label: 'Open registration', href: '/register', roles: ['guest'] },
  { id: 'register_candidate', label: 'Register as candidate', href: '/register/candidate', roles: ['guest'] },
  { id: 'register_employer', label: 'Register as employer', href: '/register/employer', roles: ['guest'] },
  { id: 'forgot_password', label: 'Forgot password', href: '/forgot-password', roles: ['guest'] },
  { id: 'help_center', label: 'Help Center', href: '/help', roles: ['guest', 'candidate', 'employer', 'superadmin'] },
  { id: 'how_it_works', label: 'How it works', href: '/how-it-works', roles: ['guest', 'candidate', 'employer', 'superadmin'] },
  { id: 'candidate_home', label: 'Candidate home', href: ROLE_HOME.candidate, roles: ['candidate'] },
  { id: 'browse_internships', label: 'Browse internships', href: '/candidate/internships', roles: ['candidate'] },
  { id: 'my_applications', label: 'My applications', href: '/candidate/applications', roles: ['candidate'] },
  { id: 'candidate_profile', label: 'My profile', href: '/candidate/profile', roles: ['candidate'] },
  { id: 'candidate_messages', label: 'Messages', href: '/candidate/messages', roles: ['candidate'] },
  { id: 'employer_home', label: 'Employer home', href: ROLE_HOME.employer, roles: ['employer'] },
  { id: 'post_internship', label: 'Post internship', href: '/employer/internships/new', roles: ['employer'] },
  { id: 'employer_internships', label: 'My internships', href: '/employer/internships', roles: ['employer'] },
  { id: 'employer_profile', label: 'Employer profile', href: '/employer/profile', roles: ['employer'] },
  { id: 'employer_messages', label: 'Messages', href: '/employer/messages', roles: ['employer'] },
  { id: 'superadmin_home', label: 'SuperAdmin home', href: ROLE_HOME.superadmin, roles: ['superadmin'] },
  { id: 'superadmin_approvals', label: 'Approvals', href: '/superadmin/approvals', roles: ['superadmin'] },
];

const TOPIC_ACTION_IDS = {
  authentication: ['open_home', 'register_candidate', 'register_employer', 'forgot_password', 'help_center'],
  candidate: ['browse_internships', 'my_applications', 'candidate_profile', 'candidate_home'],
  employer: ['post_internship', 'employer_internships', 'employer_profile', 'employer_home'],
  superadmin: ['superadmin_home', 'superadmin_approvals'],
  internships: ['browse_internships', 'post_internship', 'how_it_works'],
  messaging: ['candidate_messages', 'employer_messages'],
  troubleshooting: ['help_center', 'how_it_works'],
  unknown: ['help_center', 'how_it_works'],
};

function roleKey(role) {
  const k = String(role || '').toLowerCase();
  if (k === 'candidate' || k === 'employer' || k === 'superadmin') return k;
  return 'guest';
}

export function resolveHelpActions({ topic, role, suggestedIds = [] } = {}) {
  const rk = roleKey(role);
  const preferred = [
    ...suggestedIds,
    ...(TOPIC_ACTION_IDS[topic] || TOPIC_ACTION_IDS.unknown),
  ];
  const seen = new Set();
  const out = [];
  for (const id of preferred) {
    if (seen.has(id)) continue;
    const action = HELP_ACTIONS.find((a) => a.id === id);
    if (!action) continue;
    if (!action.roles.includes(rk)) continue;
    seen.add(id);
    out.push({ id: action.id, label: action.label, href: action.href });
    if (out.length >= 3) break;
  }
  return out;
}

/** Ids the model may legally mention (role-filtered). */
export function allowedActionIdsForPrompt(role) {
  const rk = roleKey(role);
  return HELP_ACTIONS.filter((a) => a.roles.includes(rk)).map((a) => a.id);
}
