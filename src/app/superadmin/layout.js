'use client';

import { usePathname } from 'next/navigation';
import PortalShell from '@/components/ip/PortalShell';
import { SUPERADMIN_NAV } from '@/lib/ipNav';

export default function SuperAdminLayout({ children }) {
  const pathname = usePathname();
  if (pathname === '/superadmin/login') return children;
  return (
    <PortalShell
      role="superadmin"
      nav={SUPERADMIN_NAV}
      title="Internship Portal · SuperAdmin"
      accent="text-red-800"
      loginHref="/superadmin/login"
    >
      {children}
    </PortalShell>
  );
}
