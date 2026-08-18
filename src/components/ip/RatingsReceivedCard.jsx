'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

/** Shows ratings received (Upwork-style mutual ratings). */
export default function RatingsReceivedCard() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch('/api/ip/ratings').then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => {});
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ratings received</CardTitle>
        <CardDescription>Mutual ratings from the other party after engagement.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead className="min-w-[6.5rem]">Stars</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.from_name || 'User'}</TableCell>
                  <TableCell className="min-w-[6.5rem]">
                    <Badge variant="outline">{r.stars}/5</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.comment || '—'}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Alert>
            <AlertDescription>No ratings yet. Rate each other from Offers after accept.</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
