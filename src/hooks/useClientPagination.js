'use client';

import { useMemo, useState, useEffect } from 'react';

/** Client-side page slice for IP tables (Placement Hub feedback-style footer). */
export function useClientPagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages, total]);

  const pageItems = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const serialOffset = (page - 1) * pageSize;

  return { page, setPage, pageSize, total, totalPages, pageItems, serialOffset };
}
