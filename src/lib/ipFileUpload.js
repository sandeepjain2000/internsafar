const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOC_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const IP_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IP_DOC_MAX_BYTES = 8 * 1024 * 1024;

export function normalizeContentType(raw) {
  const base = String(raw || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (base === 'image/jpg' || base === 'image/pjpeg') return 'image/jpeg';
  return base;
}

function sniffImageOrPdf(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (
    buffer[0] === 0x52
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x46
    && buffer[8] === 0x57
    && buffer[9] === 0x45
    && buffer[10] === 0x42
    && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  return null;
}

/**
 * @param {{ name?: string, type?: string, size?: number }} file
 * @param {'image'|'document'} kind
 */
export function validateUploadMeta(file, kind = 'image') {
  if (!file || typeof file !== 'object') return { ok: false, error: 'No file selected.' };
  const contentType = normalizeContentType(file.type);
  const allowed = kind === 'document' ? DOC_TYPES : IMAGE_TYPES;
  const max = kind === 'document' ? IP_DOC_MAX_BYTES : IP_IMAGE_MAX_BYTES;
  if (!allowed.has(contentType)) {
    return {
      ok: false,
      error:
        kind === 'document'
          ? 'Please use a PDF or image (JPEG, PNG, WebP, GIF).'
          : 'Please use a JPEG, PNG, WebP, or GIF image.',
    };
  }
  if (!file.size || file.size <= 0) return { ok: false, error: 'File is empty.' };
  if (file.size > max) {
    return {
      ok: false,
      error: kind === 'document' ? 'File too large (max 8MB).' : 'Image too large (max 2MB).',
    };
  }
  return { ok: true, contentType };
}

export function validateUploadBuffer(buffer, declaredContentType, kind = 'image') {
  const sniffed = sniffImageOrPdf(buffer);
  if (!sniffed) return { ok: false, error: 'Invalid or unsupported file contents.' };
  const allowed = kind === 'document' ? DOC_TYPES : IMAGE_TYPES;
  if (!allowed.has(sniffed)) {
    return { ok: false, error: 'File type does not match an allowed format.' };
  }
  const declared = normalizeContentType(declaredContentType);
  if (declared && declared !== sniffed && !(declared === 'image/jpeg' && sniffed === 'image/jpeg')) {
    // Allow when browser sent octet-stream or mismatched but magic is OK
    if (declared !== 'application/octet-stream' && declared !== sniffed) {
      // soft: prefer sniffed
    }
  }
  return { ok: true, contentType: sniffed };
}

export function imageAcceptAttr() {
  return 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';
}

export function documentAcceptAttr() {
  return 'application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif';
}
