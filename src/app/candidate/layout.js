'use client';

import PortalShell from '@/components/ip/PortalShell';
import { CANDIDATE_NAV } from '@/lib/ipNav';

export default function CandidateLayout({ children }) {
  return (
    <PortalShell role="candidate" nav={CANDIDATE_NAV} title="Internship Portal · Candidate">
      {children}
    </PortalShell>
  );
}
