/**
 * LinkedIn share with ready post text. LinkedIn's share-offsite link takes only a URL and opens in
 * the browser, so phones use the system share sheet (LinkedIn app gets the full text). Without a
 * share sheet, LinkedIn web compose opens with the text prefilled.
 */
export function linkedInComposeUrl(text) {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}

function isAppleMobile() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// The LinkedIn iOS app drops shared text, but a bare URL arrives as a link card.
function sharePayload(text) {
  if (!isAppleMobile()) return { text };
  const url = String(text).match(/https?:\/\/\S+/)?.[0];
  return url ? { url } : { text };
}

/** @returns {Promise<'shared' | 'cancelled' | 'blocked' | 'web'>} */
export async function shareOnLinkedIn(text) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(sharePayload(text));
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // Share sheet needs a fresh tap; callers offer a retry button.
      if (e?.name === 'NotAllowedError') return 'blocked';
    }
  }
  window.open(linkedInComposeUrl(text), '_blank', 'noopener,noreferrer');
  return 'web';
}
