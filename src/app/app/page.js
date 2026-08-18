'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ROLE_HOME } from '@/lib/roleHome';
import PageLoading from '@/components/PageLoading';

export default function AppEntryPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;
    const role = session?.user?.role;
    if (role) router.replace(ROLE_HOME[role] || '/');
    else router.replace('/');
  }, [status, session, router]);

  return <PageLoading message="Opening Internship Portal…" />;
}
