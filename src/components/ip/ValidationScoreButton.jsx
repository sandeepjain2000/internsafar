'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STATUS_DOT = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  pending: 'text-amber-700',
  missing: 'text-muted-foreground',
  unavailable: 'text-muted-foreground',
  fail: 'text-destructive',
};

/**
 * Clickable Employer validation chip + evidence dialog.
 */
export default function ValidationScoreButton({ score, label, breakdown, className = '' }) {
  const [open, setOpen] = useState(false);
  const total = score ?? null;
  if (total == null) return <span className="text-muted-foreground">—</span>;

  const buckets = breakdown?.buckets || {};
  const factors = breakdown?.factors || [];
  const chipLabel = label || 'Employer validation';

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`h-auto min-w-fit overflow-visible px-2 py-0.5 font-medium ${className}`}
        title="View employer validation evidence"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {total}/100
        <span className="text-muted-foreground ml-1 hidden text-[0.65rem] font-normal lg:inline">
          {chipLabel}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Employer validation — {total}/100</DialogTitle>
            <DialogDescription>
              Evidence factors for this employer
              {breakdown?.cap_reason ? ` · ${breakdown.cap_reason}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {['A', 'B', 'C', 'D'].map((key) => {
              const bucket = buckets[key];
              if (!bucket) return null;
              const rows = factors.filter((f) => f.category === key);
              return (
                <div key={key} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-medium">{bucket.label}</p>
                    <Badge variant="outline">
                      {bucket.score}/{bucket.max}
                    </Badge>
                  </div>
                  <ul className="space-y-1.5">
                    {rows.map((f) => (
                      <li key={f.key} className="flex gap-2">
                        <span className={`shrink-0 tabular-nums ${STATUS_DOT[f.status] || ''}`}>
                          {f.points}/{f.max}
                        </span>
                        <span>
                          <span className="font-medium">{f.label}</span>
                          {f.detail ? (
                            <span className="text-muted-foreground block text-xs">{f.detail}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <p className="text-muted-foreground text-xs leading-relaxed">
              {breakdown?.disclaimer ||
                'Validation is not Match %. It does not guarantee internship quality or safety.'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
