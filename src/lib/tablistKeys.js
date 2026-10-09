/**
 * Arrow-key navigation for custom `role="tablist"` rows (WAI-ARIA tabs, automatic activation).
 * Attach as `onKeyDown={onTablistKeyDown}` on the tablist element; tabs must carry `role="tab"`.
 */
export function onTablistKeyDown(e) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')].filter(
    (t) => !t.disabled && t.getAttribute('aria-disabled') !== 'true' && t.closest('[role="tablist"]') === e.currentTarget,
  );
  const i = tabs.indexOf(document.activeElement);
  if (i < 0 || tabs.length < 2) return;
  let next = i;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = tabs.length - 1;
  else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
  else next = (i + 1) % tabs.length;
  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}
