'use client';

import PortalShell from '@/components/ip/PortalShell';
import { EMPLOYER_NAV } from '@/lib/ipNav';

export default function EmployerLayout({ children }) {
  return (
    <PortalShell role="employer" nav={EMPLOYER_NAV} title="Internship Portal · Employer" accent="text-emerald-700">
      {children}
    </PortalShell>
  );
}
