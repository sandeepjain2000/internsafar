/**
 * Multi-word search for list pages.
 * - Words split on spaces/commas; "quoted phrases" stay together.
 * - `*` = any run of characters, `?` = one character; otherwise a plain "contains" match.
 * - mode 'all' = every word must match (AND); 'any' = at least one word (OR).
 */
export function compileSearch(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return [];
  const terms = [];
  const re = /"([^"]+)"|([^\s,]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const term = (m[1] ?? m[2] ?? '').trim();
    if (!term || /^[*?]+$/.test(term)) continue;
    if (/[*?]/.test(term)) {
      const pattern = term
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const rx = new RegExp(pattern);
      terms.push({ test: (hay) => rx.test(hay) });
    } else {
      terms.push({ test: (hay) => hay.includes(term) });
    }
  }
  return terms;
}

export function matchesCompiledSearch(haystack, terms, mode = 'all') {
  if (!terms.length) return true;
  const hay = String(haystack || '').toLowerCase();
  return mode === 'any' ? terms.some((t) => t.test(hay)) : terms.every((t) => t.test(hay));
}
