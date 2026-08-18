'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** PlacementHub wordmark for Gemini register chrome (logo-icon badge, not white-plate PNG). */
export function IpGeminiBrand({ className, href = '/', subtitle = null }) {
  const inner = (
    <span className={cn('ip-reg-brand', className)}>
      <span className="ip-reg-brand__mark">
        <Image src="/logo-icon.png" alt="" width={80} height={80} className="size-full object-cover" priority />
      </span>
      <span className="ip-reg-brand__lockup">
        <span className="ip-reg-brand__text">
          Placement<span className="hub">Hub</span>
        </span>
        {subtitle ? <span className="ip-reg-brand__sub">{subtitle}</span> : null}
      </span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex no-underline">
      {inner}
    </Link>
  );
}
