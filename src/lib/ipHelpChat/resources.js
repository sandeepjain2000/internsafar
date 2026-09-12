/** Official resources that exist in this app only. */
export const HELP_RESOURCES = [
  { id: 'help_center', title: 'Help Center', href: '/help', topics: ['troubleshooting', 'authentication', 'unknown'] },
  { id: 'how_it_works', title: 'How it works', href: '/how-it-works', topics: ['troubleshooting', 'internships', 'unknown'] },
  { id: 'guidelines', title: 'Guidelines', href: '/guidelines', topics: ['internships', 'employer'] },
  { id: 'register', title: 'Register', href: '/register', topics: ['authentication'] },
];

export function resolveHelpResources({ topic, limit = 2 } = {}) {
  const t = String(topic || 'unknown');
  const matched = HELP_RESOURCES.filter((r) => r.topics.includes(t) || r.topics.includes('unknown'));
  const list = (matched.length ? matched : HELP_RESOURCES.filter((r) => r.id === 'help_center' || r.id === 'how_it_works')).slice(
    0,
    limit,
  );
  return list.map((r) => ({ id: r.id, title: r.title, href: r.href }));
}
