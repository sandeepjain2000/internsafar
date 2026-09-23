'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import '@/components/ip/ip-list-pager.css';
import IpListPager from '@/components/ip/IpListPager';
import { useClientPagination } from '@/hooks/useClientPagination';
import { SA_PAGE_SIZE } from '@/lib/ipSuperadminList';

export default function ListingReportsPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('open');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(
    items,
    SA_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [status, setPage]);

  async function load(nextStatus = status) {
    setLoading(true);
    const res = await fetch(`/api/ip/superadmin/listing-reports?status=${encodeURIComponent(nextStatus)}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function setReportStatus(id, next) {
    setMessage('');
    const res = await fetch('/api/ip/superadmin/listing-reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Update failed');
      return;
    }
    setMessage(`Report marked ${next}`);
    await load();
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Listing / employer reports</h1>
          <p className="text-sm text-muted-foreground">Student-submitted trust reports (does not block apply).</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/superadmin">Back to hub</Link>
        </Button>
      </div>

      <div className="flex gap-2">
        {['open', 'reviewed', 'dismissed', 'all'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Queue</CardTitle>
          <CardDescription>{loading ? 'Loading…' : `${items.length} report(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!loading && !items.length ? (
            <p className="text-sm text-muted-foreground">No reports in this view.</p>
          ) : null}
          {pageItems.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{r.reason}</Badge>
                <Badge variant="outline">{r.status}</Badge>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p>
                <strong>{r.internship_title || 'Listing'}</strong>
                {r.company_name ? ` · ${r.company_name}` : ''}
              </p>
              <p className="text-muted-foreground">Reporter: {r.reporter_email}</p>
              {r.details ? <p>{r.details}</p> : null}
              {r.status === 'open' ? (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => setReportStatus(r.id, 'reviewed')}>Mark reviewed</Button>
                  <Button size="sm" variant="outline" onClick={() => setReportStatus(r.id, 'dismissed')}>Dismiss</Button>
                </div>
              ) : null}
            </div>
          ))}
          {!loading && items.length ? (
            <div className="ip-saq-pager">
              <IpListPager
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
                buttonClassName="ip-saq-btn ip-saq-btn--sm"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
