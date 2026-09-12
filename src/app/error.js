'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportClientOpsError } from '@/components/ip/ClientOpsErrorGuard';

export default function Error({ error, reset }) {
  useEffect(() => {
    reportClientOpsError(error?.message || 'Application error', {
      source: 'next.error',
      stack: error?.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. You can retry or return home. Ops has been notified when email is
        configured.
      </p>
      <div className="flex gap-3">
        <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="rounded-md border px-3 py-2 text-sm">
          Home
        </Link>
      </div>
    </div>
  );
}
