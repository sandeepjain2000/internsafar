'use client';

import { signOut } from 'next-auth/react';

/**
 * Sign out and terminate the tracked ip_auth_sessions row for this browser.
 * NextAuth events.signOut is the server-side backup; this call covers cases where
 * the JWT event payload is missing sid/uid so Active Sessions would stay "Active".
 */
export async function signOutAndEndSession({ callbackUrl } = {}) {
  try {
    await fetch('/api/ip/account/sessions?self=1', {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    /* best-effort — NextAuth signOut event still attempts revoke */
  }
  return signOut({ callbackUrl });
}
