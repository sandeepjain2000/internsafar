'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageLoading from '@/components/PageLoading';

/** Legacy /login → home sign-in (preserve query: email, next). */
function LoginRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/?${qs}` : '/');
  }, [router, searchParams]);

  return <PageLoading message="Opening sign-in…" />;
}

export default function LoginRedirectPage() {
  return (
    <Suspense fallback={<PageLoading message="Opening sign-in…" />}>
      <LoginRedirectInner />
    </Suspense>
  );
}
