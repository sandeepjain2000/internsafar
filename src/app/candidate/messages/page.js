'use client';

import { Suspense } from 'react';
import MessagesSplitPane from '@/components/ip/MessagesSplitPane';

export default function CandidateMessagesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <MessagesSplitPane role="candidate" />
    </Suspense>
  );
}
