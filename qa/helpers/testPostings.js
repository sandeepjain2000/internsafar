const { apiLogin } = require('./login');
const { employer } = require('./accounts');

/**
 * Ids of the approved test employer's published postings. Tests that open, apply to, or moderate
 * a posting pick from this set so they never act on a core employer's postings.
 */
async function testEmployerPublishedPostingIds() {
  const base = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const logged = await apiLogin(base, employer.email);
  if (!logged.ok) return new Set();
  const cookie = logged.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(`${base}/api/ip/employer/internships`, { headers: { Cookie: cookie } });
  const body = await res.json().catch(() => ({}));
  return new Set(
    (body.items || []).filter((i) => i?.id && String(i.status || '') === 'published').map((i) => i.id),
  );
}

module.exports = { testEmployerPublishedPostingIds };
