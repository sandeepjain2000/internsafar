/** Shared per-role sidebar nav — single source so /account stays in sync across shells. */
export const CANDIDATE_NAV = [
  { href: '/candidate', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/candidate/profile', label: 'Profile', icon: 'user' },
  { href: '/candidate/internships', label: 'Browse internships', icon: 'search' },
  { href: '/candidate/applications', label: 'My applications', icon: 'file-text' },
  { href: '/candidate/messages', label: 'Messages', icon: 'mail' },
  { href: '/candidate/offers', label: 'Offers', icon: 'briefcase' },
  { href: '/candidate/referral', label: 'Refer & earn', icon: 'award' },
  { href: '/candidate/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/ideas', label: 'Feature ideas', icon: 'lightbulb' },
  { href: '/account', label: 'Account', icon: 'settings' },
];

export const EMPLOYER_NAV = [
  { href: '/employer', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/employer/profile', label: 'Profile & docs', icon: 'user' },
  { href: '/employer/internships', label: 'Postings', icon: 'briefcase' },
  { href: '/employer/candidates', label: 'Search candidates', icon: 'search' },
  { href: '/employer/messages', label: 'Messages', icon: 'mail' },
  { href: '/employer/offers', label: 'Offers', icon: 'file-text' },
  { href: '/employer/analytics', label: 'Analytics', icon: 'activity' },
  { href: '/employer/referral', label: 'Refer & earn', icon: 'award' },
  { href: '/employer/viral', label: 'Viral board', icon: 'share-2' },
  { href: '/employer/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/ideas', label: 'Feature ideas', icon: 'lightbulb' },
  { href: '/account', label: 'Account', icon: 'settings' },
];

export const SUPERADMIN_NAV = [
  { href: '/superadmin', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/superadmin/form-registrations', label: 'Form registrations', icon: 'file-text' },
  { href: '/superadmin/approvals', label: 'Employer approvals', icon: 'shield-check' },
  { href: '/superadmin/requests', label: 'Manual requests', icon: 'user-plus' },
  { href: '/superadmin/documents', label: 'Documents', icon: 'folder-check' },
  { href: '/superadmin/postings', label: 'Postings', icon: 'briefcase' },
  { href: '/superadmin/promotions', label: 'LinkedIn promos', icon: 'share-2' },
  { href: '/superadmin/viral', label: 'Viral shares', icon: 'activity' },
  { href: '/superadmin/login-report', label: 'Login report', icon: 'clipboard-list' },
  { href: '/superadmin/messages', label: 'Messages', icon: 'mail' },
  { href: '/superadmin/feature-ideas', label: 'Feature ideas', icon: 'lightbulb' },
  { href: '/account', label: 'Account', icon: 'settings' },
];

export const NAV_BY_ROLE = {
  candidate: CANDIDATE_NAV,
  employer: EMPLOYER_NAV,
  superadmin: SUPERADMIN_NAV,
};

export const ROLE_HOME = {
  candidate: '/candidate',
  employer: '/employer',
  superadmin: '/superadmin',
};

export const ROLE_TITLE = {
  candidate: 'Internship Portal · Candidate',
  employer: 'Internship Portal · Employer',
  superadmin: 'Internship Portal · SuperAdmin',
};

export const ROLE_LOGIN_HREF = {
  candidate: '/',
  employer: '/',
  superadmin: '/superadmin/login',
};
