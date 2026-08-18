'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Deep links → split-pane inbox with thread selected. */
export default function CandidateMessageThreadRedirect() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/candidate/messages?thread=${encodeURIComponent(id)}`);
    } else {
      router.replace('/candidate/messages');
    }
  }, [id, router]);

  return <div className="p-8 text-muted-foreground">Opening conversation…</div>;
}
