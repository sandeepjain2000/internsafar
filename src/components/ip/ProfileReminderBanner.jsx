'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const IP_PROFILE_SAVED_EVENT = 'ip-profile-saved';

/**
 * Throttled incomplete-profile reminder (DOCX §26.1).
 * Shown only on login milestones / 3-day cooldown — not every visit.
 * A completed profile save hides it immediately. A later reminder fetch
 * must not put it back.
 */
export default function ProfileReminderBanner() {
  const [state, setState] = useState(null);
  const [hiding, setHiding] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ip/profile-reminder')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && !completedRef.current) setState(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onSaved(event) {
      if (!event.detail?.profileComplete) return;
      completedRef.current = true;
      setState((current) => ({
        ...(current || {}),
        profileComplete: true,
        shouldShow: false,
      }));
    }
    window.addEventListener(IP_PROFILE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(IP_PROFILE_SAVED_EVENT, onSaved);
  }, []);

  async function dismiss() {
    setHiding(true);
    try {
      await fetch('/api/ip/profile-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      });
      setState((s) => (s ? { ...s, shouldShow: false } : s));
    } finally {
      setHiding(false);
    }
  }

  useEffect(() => {
    if (!state?.shouldShow) return;
    fetch('/api/ip/profile-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'shown' }),
    }).catch(() => {});
  }, [state?.shouldShow]);

  if (!state?.shouldShow || state.profileComplete) return null;

  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50">
      <AlertTitle>Complete your profile</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <span>
          Your profile is still incomplete. Finish it to unlock apply/post actions.
          This reminder appears only on selected logins (not every time).
        </span>
        <span className="flex gap-2 shrink-0">
          <Button size="sm" render={<Link href={state.profileHref || '#'} />}>
            Open profile
          </Button>
          <Button size="sm" variant="outline" disabled={hiding} onClick={dismiss}>
            Not now
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
