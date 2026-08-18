'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ip/PageHeader';

export default function EmployerAnalyticsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/ip/employer/analytics').then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const competitive = data.stipend?.avg_stipend && data.marketAvgStipend
    ? Math.round(((data.stipend.avg_stipend - data.marketAvgStipend) / data.marketAvgStipend) * 100)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Advisory insights — never blocks candidates or hiring decisions."
      />

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
            <Badge key={status} variant="outline">{status}: {count}</Badge>
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

      <Button render={<a href="/api/ip/employer/export" />} variant="outline">Download Excel export (.csv)</Button>
    </div>
  );
}
