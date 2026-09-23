'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function hqLabel(e) {
  return [e.hq_city, e.hq_state, e.hq_country].filter(Boolean).join(', ') || '—';
}

export default function CandidateEmployerPublicPage() {
  const { id } = useParams();
  const [employer, setEmployer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/ip/candidate/employers/${encodeURIComponent(id)}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setEmployer(null);
          setError(data.error || 'Employer not found');
          return;
        }
        setEmployer(data.employer || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-12">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" render={<Link href="/candidate/internships" />} nativeButton={false}>
          ← Back to internships
        </Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading employer…</p> : null}

      {!loading && error ? (
        <Alert variant="destructive">
          <AlertTitle>Unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!loading && employer ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start gap-4">
              {employer.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={employer.logo_url}
                  alt=""
                  className="h-14 w-14 rounded-md border border-slate-200 object-contain bg-white"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xl">{employer.company_name || 'Employer'}</CardTitle>
                <CardDescription>
                  {[employer.industry, employer.company_size].filter(Boolean).join(' · ') || 'Approved employer on InternSafar'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Headquarters</dt>
                <dd className="mt-0.5">{hqLabel(employer)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Industry</dt>
                <dd className="mt-0.5">{employer.industry || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company size</dt>
                <dd className="mt-0.5">{employer.company_size || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website</dt>
                <dd className="mt-0.5 break-all">
                  {employer.website ? (
                    <a href={employer.website} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                      {employer.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              {employer.linkedin_url ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">LinkedIn</dt>
                  <dd className="mt-0.5 break-all">
                    <a href={employer.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                      {employer.linkedin_url}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            {employer.about ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</h2>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{employer.about}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
