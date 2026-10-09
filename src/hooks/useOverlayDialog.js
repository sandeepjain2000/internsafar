'use client';

import { useEffect, useRef } from 'react';

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const FIELD =
  '[autofocus], input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly])';

/** Open overlays, innermost last: only the top one reacts to Escape / Tab. */
const openStack = [];

/**
 * Recently focused or clicked controls. A field with autoFocus takes focus before the open effect
 * runs, and Safari does not focus buttons on click, so `document.activeElement` alone misses the opener.
 */
const recent = [];
let tracking = false;
function remember(el) {
  if (!(el instanceof HTMLElement)) return;
  const i = recent.indexOf(el);
  if (i >= 0) recent.splice(i, 1);
  recent.push(el);
  if (recent.length > 10) recent.shift();
}
function startTracking() {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener('focusin', (e) => remember(e.target), true);
  document.addEventListener(
    'click',
    (e) => remember(e.target instanceof Element ? e.target.closest('button, a, [role="button"], [tabindex]') : null),
    true,
  );
}

function tabbables(root) {
  return [...root.querySelectorAll(TABBABLE)].filter((el) => el.getClientRects().length > 0);
}

/**
 * Keyboard behaviour for hand-built `role="dialog"` overlays (Gemini screens that cannot use the
 * shadcn Dialog without losing their scoped CSS): focus moves in on open (first field, else the
 * dialog itself), Tab stays inside, Escape calls `onClose`, focus returns to the opener on close.
 * Pass `onClose = null` while the dialog must not be dismissed (e.g. a request is in flight).
 * `open` may be a string key (e.g. the `modal` name) when one ref is shared by several overlays that
 * replace each other; a new key re-runs the setup for the newly shown overlay.
 *
 * const ref = useOverlayDialog(Boolean(target), busy ? null : () => setTarget(null));
 * <div role="dialog" aria-modal="true" aria-labelledby="…" ref={ref}>
 */
export function useOverlayDialog(open, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(startTracking, []);

  const openKey = typeof open === 'string' || typeof open === 'number' ? open || false : Boolean(open);
  useEffect(() => {
    if (!openKey) return undefined;
    const root = ref.current;
    if (!root) return undefined;

    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && active !== document.body && !root.contains(active)
        ? active
        : [...recent].reverse().find((el) => !root.contains(el)) || null;
    const token = {};
    openStack.push(token);

    if (!root.contains(document.activeElement)) {
      const field = [...root.querySelectorAll(FIELD)].find((el) => el.getClientRects().length > 0);
      if (field) {
        field.focus({ preventScroll: true });
      } else {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
        root.focus({ preventScroll: true });
      }
    }

    const onKey = (e) => {
      if (openStack[openStack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        if (!onCloseRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = tabbables(root);
      if (!items.length) {
        e.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === root || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = openStack.indexOf(token);
      if (i >= 0) openStack.splice(i, 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [openKey]);

  return ref;
}
