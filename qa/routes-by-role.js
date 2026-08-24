/**
 * InternSafar static routes (src/lib/ipNav.js + public pages).
 * Dynamic /internships/[id] and /messages/[id] are not listed here.
 */
const PUBLIC = [
  { label: 'Home', href: '/' },
  { label: 'Register', href: '/register' },
  { label: 'Register candidate', href: '/register/candidate' },
  { label: 'Register employer', href: '/register/employer' },
  { label: 'Forgot password', href: '/forgot-password' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Guidelines', href: '/guidelines' },
  { label: 'Help', href: '/help' },
];

const CANDIDATE = [
  { label: 'Dashboard', href: '/candidate' },
  { label: 'Profile', href: '/candidate/profile' },
  { label: 'Browse internships', href: '/candidate/internships' },
  { label: 'My applications', href: '/candidate/applications' },
  { label: 'Messages', href: '/candidate/messages' },
  { label: 'Offers', href: '/candidate/offers' },
  { label: 'Refer & earn', href: '/candidate/referral' },
  { label: 'Notifications', href: '/candidate/notifications' },
  { label: 'Feature ideas', href: '/ideas' },
  { label: 'Account', href: '/account' },
];

const EMPLOYER = [
  { label: 'Dashboard', href: '/employer' },
  { label: 'Profile & docs', href: '/employer/profile' },
  { label: 'Postings', href: '/employer/internships' },
  { label: 'New posting', href: '/employer/internships/new' },
  { label: 'Search candidates', href: '/employer/candidates' },
  { label: 'Messages', href: '/employer/messages' },
  { label: 'Offers', href: '/employer/offers' },
  { label: 'Analytics', href: '/employer/analytics' },
  { label: 'Rejection templates', href: '/employer/rejection-templates' },
  { label: 'Refer & earn', href: '/employer/referral' },
  { label: 'Notifications', href: '/employer/notifications' },
  { label: 'Viral', href: '/employer/viral' },
  { label: 'Feature ideas', href: '/ideas' },
  { label: 'Account', href: '/account' },
];

const SUPERADMIN = [
  { label: 'Dashboard', href: '/superadmin' },
  { label: 'Form registrations', href: '/superadmin/form-registrations' },
  { label: 'Employer approvals', href: '/superadmin/approvals' },
  { label: 'Manual requests', href: '/superadmin/requests' },
  { label: 'Documents', href: '/superadmin/documents' },
  { label: 'Postings', href: '/superadmin/postings' },
  { label: 'LinkedIn promos', href: '/superadmin/promotions' },
  { label: 'Viral shares', href: '/superadmin/viral' },
  { label: 'Login report', href: '/superadmin/login-report' },
  { label: 'Messages', href: '/superadmin/messages' },
  { label: 'Feature ideas', href: '/superadmin/feature-ideas' },
  { label: 'Account', href: '/account' },
];

module.exports = { PUBLIC, CANDIDATE, EMPLOYER, SUPERADMIN };
