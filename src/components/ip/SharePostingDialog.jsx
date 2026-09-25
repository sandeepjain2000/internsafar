'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function BrandIcon({ src, alt }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={20} height={20} className="size-5 shrink-0" />
  );
}

/**
 * Single Share entry for employer postings:
 *  - WhatsApp (plain share)
 *  - LinkedIn (tracked share link + post URL for SuperAdmin verify)
 */
export default function SharePostingDialog({
  open,
  onOpenChange,
  postingTitle = '',
  busy = false,
  error = '',
  onWhatsApp,
  onStartLinkedInPromo,
  onSubmitClaim,
}) {
  const [step, setStep] = useState('channels'); // channels | claim
  const [token, setToken] = useState('');
  const [claimUrl, setClaimUrl] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) {
      setStep('channels');
      setToken('');
      setClaimUrl('');
      setLocalError('');
    }
  }, [open]);

  async function handleLinkedIn() {
    setLocalError('');
    try {
      const data = await onStartLinkedInPromo?.();
      if (!data?.token) return;
      setToken(data.token);
      setStep('claim');
    } catch (e) {
      setLocalError(e?.message || 'Could Not Open LinkedIn Share');
    }
  }

  function handleClaim() {
    const v = claimUrl.trim();
    if (!v) return;
    onSubmitClaim?.(v);
  }

  const claimTitle = postingTitle
    ? `Share On LinkedIn — “${postingTitle}”`
    : 'Share On LinkedIn';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'channels' ? (
          <>
            <DialogHeader>
              <DialogTitle>Share Posting</DialogTitle>
              <DialogDescription>
                Choose a channel. LinkedIn opens a tracked share link so SuperAdmin can verify your post for rewards.
              </DialogDescription>
            </DialogHeader>

            {(error || localError) ? (
              <Alert variant="destructive">
                <AlertTitle>Share Failed</AlertTitle>
                <AlertDescription>{localError || error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3 text-left"
                disabled={busy}
                onClick={() => onWhatsApp?.()}
              >
                <BrandIcon src="/brand/whatsapp.svg" alt="" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">WhatsApp</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    Open a message with the candidate internship link.
                  </span>
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3 text-left"
                disabled={busy}
                onClick={handleLinkedIn}
              >
                <BrandIcon src="/brand/linkedin.svg" alt="" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">LinkedIn</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    Share the tracked link, then paste your post URL for verification.
                  </span>
                </span>
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange?.(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{claimTitle}</DialogTitle>
              <DialogDescription>
                LinkedIn should be open with your share link. Include the share code in the post, then paste the live post URL below so SuperAdmin can verify it.
              </DialogDescription>
            </DialogHeader>

            {token ? (
              <Alert>
                <AlertTitle>Share Code</AlertTitle>
                <AlertDescription>
                  <code className="text-xs break-all">{token}</code>
                </AlertDescription>
              </Alert>
            ) : null}

            {(error || localError) ? (
              <Alert variant="destructive">
                <AlertTitle>Submit Failed</AlertTitle>
                <AlertDescription>{localError || error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor="share-claim-url">LinkedIn Post URL</FieldLabel>
              <Input
                id="share-claim-url"
                type="url"
                placeholder="https://www.linkedin.com/…"
                value={claimUrl}
                disabled={busy}
                onChange={(e) => setClaimUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleClaim();
                  }
                }}
              />
              <FieldDescription>Paste the URL of the LinkedIn post you just created.</FieldDescription>
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setStep('channels')}
              >
                Back
              </Button>
              <Button type="button" disabled={busy || !claimUrl.trim()} onClick={handleClaim}>
                Submit For Verification
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
