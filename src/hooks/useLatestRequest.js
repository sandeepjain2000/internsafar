'use client';

import { useCallback, useRef } from 'react';

/**
 * Guards list loads against out-of-order responses (tab switches, session refresh, typing).
 * Call `begin()` at the start of a load; apply results only while `isCurrent()` is true.
 * @returns {() => () => boolean}
 */
export function useLatestRequest() {
  const seqRef = useRef(0);
  return useCallback(() => {
    seqRef.current += 1;
    const seq = seqRef.current;
    return () => seq === seqRef.current;
  }, []);
}
