'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Pretty referral route: /r/{code} → registration chooser with ?ref=
 * (DOCX §27.4 — internshipportal.com/name-style share links)
 */
export default function ReferralPrettyPage() {
  const { code } = useParams();
  const router = useRouter();

  useEffect(() => {
    const c = encodeURIComponent(String(code || '').trim());
    if (!c) {
      router.replace('/register');
      return;
    }
    router.replace(`/register?ref=${c}`);
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Opening referral link…
    </div>
  );
}
