'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { pageTitleFor } from '@/lib/ipPageTitle';

/**
 * Pages are client components and cannot export metadata, so the tab title is set per route here.
 * Next streams the root metadata <title> in after hydration, so re-apply whenever <head> changes.
 */
export default function RouteTitle() {
  const pathname = usePathname();
  useEffect(() => {
    const want = pageTitleFor(pathname);
    const apply = () => {
      if (document.title !== want) document.title = want;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
