'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
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
import { PhoneOnlyTag } from '@/components/ip/PhoneOnlyShare';
import { isPhoneShareDevice, phoneOnlyShareMessage } from '@/lib/ipShareDevice';
import { usePhoneShareDevice } from '@/hooks/usePhoneShareDevice';

function BrandIcon({ src, alt }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={20} height={20} className="size-5 shrink-0" />
  );
}

/**
 * Share entry for employer postings:
 *  - WhatsApp: plain share (no reward claim)
 *  - LinkedIn: unique share link + post URL for SuperAdmin verification / reward points
 *  - Copy link: plain posting link (works on laptop too, no reward claim)
 */
export default function SharePostingDialog({
  open,
  onOpenChange,
  postingTitle = '',
  busy = false,
  error = '',
  onWhatsApp,
  onStartLinkedInPromo,
  onOpenLinkedIn,
  onCopyLink,
  onSubmitClaim,
}) {
  const [step, setStep] = useState('channels'); // channels | claim
  const [token, setToken] = useState('');
  const [postText, setPostText] = useState('');
  const [shareBlocked, setShareBlocked] = useState(false);
  const [claimUrl, setClaimUrl] = useState('');
  const [localError, setLocalError] = useState('');
  const [phoneNote, setPhoneNote] = useState('');
  const [copied, setCopied] = useState(false);
  const onPhone = usePhoneShareDevice();

  useEffect(() => {
    if (!open) {
      setStep('channels');
      setToken('');
      setPostText('');
      setShareBlocked(false);
      setClaimUrl('');
      setLocalError('');
      setPhoneNote('');
      setCopied(false);
    }
  }, [open]);

  async function handleCopy() {
    setLocalError('');
    try {
      await onCopyLink?.();
      setCopied(true);
    } catch {
      setLocalError('Could Not Copy Link. Long-press the link in your browser and copy it instead.');
    }
  }

  function blockedOnLaptop(channel) {
    if (isPhoneShareDevice()) {
      setPhoneNote('');
      return false;
    }
    setPhoneNote(phoneOnlyShareMessage(channel, { canCopy: false }));
    return true;
  }

  function handleWhatsApp() {
    if (blockedOnLaptop('WhatsApp')) return;
    onWhatsApp?.();
  }

  async function handleLinkedIn() {
    setLocalError('');
    if (blockedOnLaptop('LinkedIn')) return;
    try {
      const data = await onStartLinkedInPromo?.();
      if (!data?.token) return;
      setToken(data.token);
      setPostText(data.postText || '');
      setShareBlocked(data.shareResult === 'blocked');
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
    ? `Share On LinkedIn — Earn Reward Points — “${postingTitle}”`
    : 'Share On LinkedIn — Earn Reward Points';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-md">
        {step === 'channels' ? (
          <>
            <DialogHeader>
              <DialogTitle>Share Posting</DialogTitle>
              <DialogDescription>
                Choose a channel. LinkedIn uses a unique posting share link so SuperAdmin can verify your post for reward points.
                {onPhone === false ? ' WhatsApp and LinkedIn sharing works from your phone or tablet; Copy Link works anywhere.' : null}
              </DialogDescription>
            </DialogHeader>

            {(error || localError) ? (
              <Alert variant="destructive">
                <AlertTitle>Share Failed</AlertTitle>
                <AlertDescription>{localError || error}</AlertDescription>
              </Alert>
            ) : null}

            {phoneNote ? (
              <Alert data-testid="phone-only-share-note">
                <AlertTitle>Use Your Phone To Share</AlertTitle>
                <AlertDescription>{phoneNote}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className={`h-auto justify-start gap-3 px-3 py-3 text-left whitespace-normal${onPhone === false ? ' ip-phone-only-off' : ''}`}
                aria-disabled={onPhone === false || undefined}
                disabled={busy}
                onClick={handleWhatsApp}
              >
                <BrandIcon src="/brand/whatsapp.svg" alt="" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">WhatsApp{onPhone === false ? <PhoneOnlyTag /> : null}</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    Share the internship directly. No verification or reward claim.
                  </span>
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className={`h-auto justify-start gap-3 px-3 py-3 text-left whitespace-normal${onPhone === false ? ' ip-phone-only-off' : ''}`}
                aria-disabled={onPhone === false || undefined}
                disabled={busy}
                onClick={handleLinkedIn}
              >
                <BrandIcon src="/brand/linkedin.svg" alt="" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">LinkedIn — Earn Reward Points{onPhone === false ? <PhoneOnlyTag /> : null}</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    Share the unique posting link, then submit your live LinkedIn post URL for SuperAdmin verification.
                  </span>
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3 text-left whitespace-normal"
                disabled={busy}
                onClick={handleCopy}
                data-testid="share-posting-copy-link"
              >
                {copied ? (
                  <Check className="size-5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Copy className="size-5 shrink-0" aria-hidden />
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">{copied ? 'Link Copied' : 'Copy Link'}</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    Copy the posting link to paste anywhere — email, SMS or other apps. No reward claim.
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
                Choose LinkedIn in your phone&apos;s share menu. The post text and your unique share link are filled in for you. After posting, paste the live post URL below so SuperAdmin can verify it for reward points.
              </DialogDescription>
            </DialogHeader>

            {shareBlocked ? (
              <Alert>
                <AlertTitle>Tap Open LinkedIn</AlertTitle>
                <AlertDescription>Your phone needs one more tap to open the share menu.</AlertDescription>
              </Alert>
            ) : null}

            {postText ? (
              <Field>
                <FieldLabel>Post Text</FieldLabel>
                <p className="text-muted-foreground text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{postText}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start gap-2"
                  disabled={busy}
                  onClick={() => {
                    setShareBlocked(false);
                    onOpenLinkedIn?.();
                  }}
                >
                  <BrandIcon src="/brand/linkedin.svg" alt="" />
                  Open LinkedIn
                </Button>
              </Field>
            ) : null}

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
