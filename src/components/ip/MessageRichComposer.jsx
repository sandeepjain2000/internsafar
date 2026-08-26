'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';
import { normalizeEditorHtml, sanitizeMessageHtml } from '@/lib/ipRichText';

/**
 * WYSIWYG B/I/U composer — user sees bold/italic/underline, not raw &lt;b&gt; tags.
 * Stored value remains limited HTML (&lt;b&gt;/&lt;i&gt;/&lt;u&gt; only).
 */
export default function MessageRichComposer({
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Type a message…',
  className = '',
  toolbarClassName = 'ip-msg-fmt',
  editorClassName = 'ip-msg-rich-editor',
  'aria-label': ariaLabel = 'Message',
}) {
  const editorRef = useRef(null);
  const lastEmitted = useRef(String(value || ''));

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const next = sanitizeMessageHtml(value);
    if (el.innerHTML !== next) {
      el.innerHTML = next || '';
    }
    lastEmitted.current = String(value || '');
  }, [value]);

  function emitFromEditor() {
    const el = editorRef.current;
    if (!el) return;
    const normalized = normalizeEditorHtml(el.innerHTML);
    if (normalized === lastEmitted.current) return;
    lastEmitted.current = normalized;
    onChange?.(normalized);
  }

  function apply(command) {
    if (disabled) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand(command, false, null);
    } catch {
      /* older browsers */
    }
    emitFromEditor();
  }

  return (
    <div className={className}>
      <div className={toolbarClassName} role="toolbar" aria-label="Text formatting">
        <button type="button" disabled={disabled} title="Bold" aria-label="Bold" onClick={() => apply('bold')}>
          <Bold className="size-3.5" aria-hidden />
        </button>
        <button type="button" disabled={disabled} title="Italic" aria-label="Italic" onClick={() => apply('italic')}>
          <Italic className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled}
          title="Underline"
          aria-label="Underline"
          onClick={() => apply('underline')}
        >
          <Underline className="size-3.5" aria-hidden />
        </button>
      </div>
      <div
        ref={editorRef}
        className={editorClassName}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={emitFromEditor}
        onBlur={emitFromEditor}
      />
    </div>
  );
}
