'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** InternSafar wordmark for Gemini register chrome (icon badge + text; not full white-plate PNG). */
export function IpGeminiBrand({ className, href = '/', subtitle = null }) {
  const inner = (
    <span className={cn('ip-reg-brand', className)}>
      <span className="ip-reg-brand__mark">
        <Image
          src="/internsafar-icon.png"
          alt="InternSafar"
          width={80}
          height={80}
          className="size-full object-contain"
          priority
        />
      </span>
      <span className="ip-reg-brand__lockup">
        <span className="ip-reg-brand__text">
          Intern<span className="hub">Safar</span>
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
