/**
 * WhatsApp / LinkedIn share actions run only on phones and tablets; laptops get a message instead.
 * Decided by device type, not screen width, so a narrow laptop window still counts as a laptop.
 */
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i;

export function isPhoneShareDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData?.mobile) return true;
  const ua = navigator.userAgent || '';
  if (MOBILE_UA.test(ua)) return true;
  // iPadOS reports a desktop Mac user agent; touch support tells it apart.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function phoneOnlyShareMessage(channel, { canCopy = true } = {}) {
  const tail = canCopy ? ' to share, or copy the link instead.' : ' to share.';
  return `Sharing on ${channel} works only from a phone or tablet. Open InternSafar on your mobile device${tail}`;
}
