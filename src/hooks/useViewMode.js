'use client';

import { useEffect, useState } from 'react';

const MOBILE_MQ = '(max-width: 767px)';

/** Viewport ≤767px — shared with mobile CSS breakpoint. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobile(Boolean(mq.matches));
    sync();
    if (mq.addEventListener) {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  return isMobile;
}

/**
 * Persists list/cards preference. On mobile, coerces stored `list` → `cards`.
 * @returns {[effectiveMode, setMode, { isMobile, stored }]}
 */
export function useViewMode(storageKey, fallback = 'cards') {
  const [stored, setStored] = useState(fallback);
  const isMobile = useIsMobile();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'cards' || saved === 'list') setStored(saved);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function setMode(next) {
    setStored(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* ignore */
    }
  }

  const effectiveMode = isMobile && stored === 'list' ? 'cards' : stored;
  return [effectiveMode, setMode, { isMobile, stored }];
}
