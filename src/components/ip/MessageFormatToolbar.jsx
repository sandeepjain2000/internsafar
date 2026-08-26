'use client';

import { Bold, Italic, Underline } from 'lucide-react';
import { wrapSelection } from '@/lib/ipRichText';

/**
 * Optional B/I/U toolbar for a textarea/input. Plain text still works without it.
 */
export default function MessageFormatToolbar({
  inputRef,
  value,
  onChange,
  className = '',
  disabled = false,
}) {
  function apply(tag) {
    if (disabled) return;
    const el = inputRef?.current;
    const start = el && typeof el.selectionStart === 'number' ? el.selectionStart : String(value || '').length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    const next = wrapSelection(value, start, end, tag);
    onChange(next.value);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(next.selectionStart, next.selectionEnd);
      } catch {
        /* input type=file etc. */
      }
    });
  }

  return (
    <div className={className} role="toolbar" aria-label="Text formatting">
      <button type="button" disabled={disabled} title="Bold" aria-label="Bold" onClick={() => apply('b')}>
        <Bold className="size-3.5" aria-hidden />
      </button>
      <button type="button" disabled={disabled} title="Italic" aria-label="Italic" onClick={() => apply('i')}>
        <Italic className="size-3.5" aria-hidden />
      </button>
      <button type="button" disabled={disabled} title="Underline" aria-label="Underline" onClick={() => apply('u')}>
        <Underline className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
