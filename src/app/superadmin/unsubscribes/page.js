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
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { SA_PAGE_SIZE } from '@/lib/ipSuperadminList';
import { formatIstDateTime } from '@/lib/ipIstTime';

const STATUSES = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSED', label: 'Processed' },
];

export default function UnsubscribeRequestsPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('PENDING');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(items, SA_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [status, setPage]);

  const beginLoad = useLatestRequest();

  async function load(nextStatus = status) {
    const isCurrent = beginLoad();
    setLoading(true);
    try {
      const res = await fetch(`/api/ip/superadmin/unsubscribe-requests?status=${encodeURIComponent(nextStatus)}`);
      const data = await res.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(data.error || 'Could not load requests');
        setItems([]);
        return;
      }
      setItems(data.items || []);
    } catch {
      if (isCurrent()) setItems([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function markProcessed(ids) {
    setMessage('');
    setError('');
    setBusyId(ids.length === 1 ? ids[0] : 'all');
    try {
      const res = await fetch('/api/ip/superadmin/unsubscribe-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      await load();
      if (!res.ok) {
        setError(data.error || 'Update failed');
        return;
      }
      setMessage(`Marked ${data.processed ?? ids.length} request(s) processed`);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Email unsubscribes</h1>
          <p className="text-sm text-muted-foreground">
            People who clicked “unsubscribe” in an email. Once processed, they stop getting notification emails.
            Sign-in, password and verification emails still send.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/superadmin">Back to hub</Link>
        </Button>
      </div>

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s.value}
            size="sm"
            variant={status === s.value ? 'default' : 'outline'}
            onClick={() => {
              if (s.value !== status) setLoading(true);
              setStatus(s.value);
            }}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Queue</CardTitle>
            <CardDescription>{loading ? 'Loading…' : `${items.length} request(s)`}</CardDescription>
          </div>
          {status === 'PENDING' && !loading && pageItems.length > 1 ? (
            <Button
              size="sm"
              disabled={Boolean(busyId)}
              onClick={() => markProcessed(pageItems.map((r) => r.id))}
            >
              Mark this page processed
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {!loading && !items.length ? (
            <p className="text-sm text-muted-foreground">No requests in this view.</p>
          ) : null}
          {(loading ? [] : pageItems).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div className="space-y-1">
                <p className="font-medium">{r.email}</p>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">{r.status === 'PROCESSED' ? 'Processed' : 'Pending'}</Badge>
                  <span>Requested {formatIstDateTime(r.requestedAt)}</span>
                  {r.processedAt ? <span>· Processed {formatIstDateTime(r.processedAt)}</span> : null}
                </div>
              </div>
              {r.status === 'PENDING' ? (
                <Button size="sm" disabled={Boolean(busyId)} onClick={() => markProcessed([r.id])}>
                  {busyId === r.id ? 'Saving…' : 'Mark processed'}
                </Button>
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
