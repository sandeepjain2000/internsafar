const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOC_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const RESUME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const RESUME_EXT_TYPES = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

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

function extensionOf(name) {
  const m = String(name || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : '';
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

/** OLE Compound File (legacy .doc) or ZIP (docx / sometimes mislabeled). */
function sniffWordDoc(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (
    buffer[0] === 0xd0
    && buffer[1] === 0xcf
    && buffer[2] === 0x11
    && buffer[3] === 0xe0
    && buffer[4] === 0xa1
    && buffer[5] === 0xb1
    && buffer[6] === 0x1a
    && buffer[7] === 0xe1
  ) {
    return 'application/msword';
  }
  // ZIP local file header — DOCX is a zip package
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

function allowedSet(kind) {
  if (kind === 'resume') return RESUME_TYPES;
  if (kind === 'document') return DOC_TYPES;
  return IMAGE_TYPES;
}

/**
 * @param {{ name?: string, type?: string, size?: number }} file
 * @param {'image'|'document'|'resume'} kind
 */
export function validateUploadMeta(file, kind = 'image') {
  if (!file || typeof file !== 'object') return { ok: false, error: 'No file selected.' };
  let contentType = normalizeContentType(file.type);
  const allowed = allowedSet(kind);
  const max = kind === 'image' ? IP_IMAGE_MAX_BYTES : IP_DOC_MAX_BYTES;

  // Browsers often omit or mislabel Word MIME; fall back to extension for resumes.
  if (kind === 'resume' && !allowed.has(contentType)) {
    const fromExt = RESUME_EXT_TYPES[extensionOf(file.name)];
    if (fromExt) contentType = fromExt;
  }

  if (!allowed.has(contentType)) {
    return {
      ok: false,
      error:
        kind === 'resume'
          ? 'Please use a PDF, DOC, or DOCX resume file.'
          : kind === 'document'
            ? 'Please use a PDF or image (JPEG, PNG, WebP, GIF).'
            : 'Please use a JPEG, PNG, WebP, or GIF image.',
    };
  }
  if (!file.size || file.size <= 0) return { ok: false, error: 'File is empty.' };
  if (file.size > max) {
    return {
      ok: false,
      error: kind === 'image' ? 'Image too large (max 2MB).' : 'File too large (max 8MB).',
    };
  }
  return { ok: true, contentType };
}

/**
 * @param {Buffer} buffer
 * @param {string} declaredContentType
 * @param {'image'|'document'|'resume'} kind
 */
export function validateUploadBuffer(buffer, declaredContentType, kind = 'image') {
  const allowed = allowedSet(kind);
  let sniffed = sniffImageOrPdf(buffer);
  if (!sniffed && kind === 'resume') sniffed = sniffWordDoc(buffer);
  if (!sniffed) return { ok: false, error: 'Invalid or unsupported file contents.' };
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

export function resumeAcceptAttr() {
  return 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.doc,.docx';
}
