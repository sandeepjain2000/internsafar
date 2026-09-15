'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * SuperAdmin uses the same home sign-in as candidate/employer (`/`).
 * Keep this route as a redirect so old bookmarks and QA URLs do not 404.
 */
export default function SuperAdminLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return (
    <main className="grid min-h-[40vh] place-items-center p-8 text-sm text-slate-500">
      Redirecting to sign in…
    </main>
  );
}
