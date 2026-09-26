'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import PortalShell from '@/components/ip/PortalShell';
import { EMPLOYER_NAV } from '@/lib/ipNav';
import { readResponseJson } from '@/lib/readResponseJson';

const POSTING_HREF = '/employer/internships';

export default function EmployerLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [approvalStatus, setApprovalStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/ip/employer/dashboard')
      .then((r) => readResponseJson(r, {}))
      .then((d) => {
        if (!alive) return;
        setApprovalStatus(String(d?.employer?.approvalStatus || '').toLowerCase() || 'pending');
      })
      .catch(() => {
        if (alive) setApprovalStatus('pending');
      });
    return () => {
      alive = false;
    };
  }, []);

  const nav = useMemo(() => {
    if (approvalStatus === 'approved') return EMPLOYER_NAV;
    return EMPLOYER_NAV.filter((item) => item.href !== POSTING_HREF);
  }, [approvalStatus]);

  useEffect(() => {
    if (approvalStatus == null) return;
    if (approvalStatus === 'approved') return;
    if (pathname === POSTING_HREF || pathname.startsWith(`${POSTING_HREF}/`)) {
      router.replace('/employer/profile');
    }
  }, [approvalStatus, pathname, router]);

  return (
    <PortalShell role="employer" nav={nav} title="Internship Portal · Employer" accent="text-emerald-700">
      {children}
    </PortalShell>
  );
}
