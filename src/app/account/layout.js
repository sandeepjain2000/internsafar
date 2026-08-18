'use client';

import { useSession } from 'next-auth/react';
import PortalShell from '@/components/ip/PortalShell';
import { NAV_BY_ROLE, ROLE_TITLE, ROLE_LOGIN_HREF } from '@/lib/ipNav';

/** Role-agnostic shell for /account — resolves the right sidebar/nav from the session role. */
export default function AccountLayout({ children }) {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  const nav = NAV_BY_ROLE[role] || NAV_BY_ROLE.candidate;
  const title = ROLE_TITLE[role] || 'Internship Portal · Account';
  const loginHref = ROLE_LOGIN_HREF[role] || '/';

  return (
    <PortalShell role={role || 'candidate'} nav={nav} title={title} loginHref={loginHref}>
      {children}
    </PortalShell>
  );
}
