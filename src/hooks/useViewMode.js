'use client';

import { useEffect, useState } from 'react';

export function useViewMode(storageKey, fallback = 'cards') {
  const [mode, setMode] = useState(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'cards' || saved === 'list') setMode(saved);
    } catch { /* ignore */ }
  }, [storageKey]);
  function set(next) {
    setMode(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch { /* ignore */ }
  }
  return [mode, set];
}
