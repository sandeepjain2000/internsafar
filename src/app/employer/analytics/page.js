'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LogIn, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/ip/PageHeader';
import { formatStatus } from '@/lib/utils';
import { fetchErrorMessage, fetchJsonWithRetry } from '@/lib/fetchJsonWithRetry';
import { signOutAndEndSession } from '@/lib/ipClientSignOut';

const PAGE_DESCRIPTION = 'Advisory insights — never blocks candidates or hiring decisions.';

export default function EmployerAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const req = ++reqRef.current;
    setLoading(true);
    setLoadError(null);
    const result = await fetchJsonWithRetry('/api/ip/employer/analytics');
    if (req !== reqRef.current) return;
    if (result.ok) setData(result.data);
    else setLoadError({ kind: result.kind, message: result.data?.error || '' });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    return () => {
      reqRef.current += 1;
    };
  }, [load]);

  if (!data && loading) {
    return (
      <div className="space-y-6" aria-busy="true" data-testid="analytics-loading">
        <PageHeader title="Analytics" description={PAGE_DESCRIPTION} />
        <span className="sr-only">Loading analytics…</span>
        <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((k) => (
            <Card key={k}>
              <CardHeader className="gap-2 pb-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
        {[0, 1].map((k) => (
          <Card key={k} aria-hidden>
            <CardHeader><Skeleton className="h-4 w-40" /></CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data && loadError) {
    const auth = loadError.kind === 'auth';
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description={PAGE_DESCRIPTION} />
        <Card role="alert" data-testid={auth ? 'analytics-session-expired' : 'analytics-load-error'}>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              {auth ? <LogIn className="size-6" aria-hidden /> : <AlertTriangle className="size-6" aria-hidden />}
            </div>
            <h2 className="text-base font-semibold">
              {auth ? 'Your session has expired' : 'We couldn\u2019t load analytics'}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {auth
                ? 'Sign in again to see your analytics.'
                : loadError.kind === 'http'
                  ? loadError.message || 'Analytics are not available for this account.'
                  : `${fetchErrorMessage(loadError.kind)} Your data is safe \u2014 please try again.`}
            </p>
            {auth ? (
              <Button type="button" onClick={() => signOutAndEndSession({ callbackUrl: '/' })}>
                Sign in again
              </Button>
            ) : (
              <Button type="button" onClick={load} data-testid="analytics-retry">
                <RotateCcw data-icon="inline-start" aria-hidden />
                Try again
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const competitive = data.stipend?.avg_stipend && data.marketAvgStipend
    ? Math.round(((data.stipend.avg_stipend - data.marketAvgStipend) / data.marketAvgStipend) * 100)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description={PAGE_DESCRIPTION} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Live postings</CardDescription><CardTitle className="text-2xl">{data.postings?.live ?? 0}/{data.postings?.total ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Avg. stipend offered</CardDescription><CardTitle className="text-2xl">{data.stipend?.avg_stipend ? `₹${data.stipend.avg_stipend}` : '—'}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Market avg. stipend</CardDescription><CardTitle className="text-2xl">{data.marketAvgStipend ? `₹${data.marketAvgStipend}` : '—'}</CardTitle></CardHeader></Card>
      </div>

      {competitive !== null ? (
        <Card>
          <CardHeader><CardTitle className="text-base">AI insight: stipend competitiveness</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">
              Your average stipend is <strong>{competitive >= 0 ? `${competitive}% above` : `${Math.abs(competitive)}% below`}</strong> the platform market average.
              {competitive < -10 ? ' Consider raising the stipend to attract more applicants.' : ' This is a competitive range for candidate supply.'}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Application funnel</CardTitle></CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          {Object.entries(data.funnel || {}).map(([status, count]) => (
            <Badge key={status} variant="outline">{formatStatus(status)}: {count}</Badge>
          ))}
          {!Object.keys(data.funnel || {}).length ? <p className="text-sm text-muted-foreground">No applications yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">College / degree mix</CardTitle><CardDescription>Top applicant sources</CardDescription></CardHeader>
        <CardContent className="space-y-1">
          {(data.education || []).map((e, idx) => (
            <div key={idx} className="flex justify-between text-sm border-b py-1">
              <span>{e.college || 'Unknown'} — {e.degree || 'Unknown'}</span>
              <span className="text-muted-foreground">{e.candidates} candidate(s)</span>
            </div>
          ))}
          {!data.education?.length ? <p className="text-sm text-muted-foreground">No applicant data yet.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Geography</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(data.geography || []).map((g, idx) => (
              <div key={idx} className="flex justify-between text-sm border-b py-1">
                <span>{g.city}, {g.state}</span>
                <span className="text-muted-foreground">{g.candidates}</span>
              </div>
            ))}
            {!data.geography?.length ? <p className="text-sm text-muted-foreground">No data yet.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Specialization</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(data.specialization || []).map((s, idx) => (
              <div key={idx} className="flex justify-between text-sm border-b py-1">
                <span>{s.specialization}</span>
                <span className="text-muted-foreground">{s.candidates}</span>
              </div>
            ))}
            {!data.specialization?.length ? <p className="text-sm text-muted-foreground">No data yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Eligibility fit</CardTitle></CardHeader>
        <CardContent className="text-sm">
          Avg match {data.matchFit?.avg_match ?? '—'}% · Strong fit (≥70%): {data.matchFit?.strong_fit ?? 0}/{data.matchFit?.total ?? 0}
        </CardContent>
      </Card>

      <Button render={<a href="/api/ip/employer/export" />} variant="outline">
        Download overview Excel (postings + applications)
      </Button>
    </div>
  );
}
