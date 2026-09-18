'use client';

/**
 * Shared list footer for InternSafar candidate/employer tables & card grids.
 * Matches applications / employer postings pager rhythm (quiet bar, not a floating control).
 */
export default function IpListPager({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className = '',
  buttonClassName = 'ip-list-pager__btn',
}) {
  if (!total || total <= 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className={`ip-list-pager ${className}`.trim()} role="navigation" aria-label="Pagination">
      <span className="ip-list-pager__meta">
        Showing {from}–{to} of {total}
      </span>
      <div className="ip-list-pager__btns">
        <button
          type="button"
          className={buttonClassName}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <span className="ip-list-pager__page">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          className={buttonClassName}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
