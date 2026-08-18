'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Replaces browser prompt() for LinkedIn / share URL fast-track.
 */
export default function UrlClaimDialog({
  open,
  onOpenChange,
  title = 'Paste post URL',
  description = 'Optional fast-track for SuperAdmin verification.',
  confirmLabel = 'Submit',
  onConfirm,
}) {
  const [url, setUrl] = useState('');

  function submit() {
    const v = url.trim();
    if (!v) return;
    onConfirm?.(v);
    setUrl('');
    onOpenChange?.(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setUrl('');
        onOpenChange?.(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="claim-url">URL</FieldLabel>
          <Input
            id="claim-url"
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!url.trim()} onClick={submit}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
