/**
 * Candidate profile draft — browser localStorage only (survives logout on the same device).
 * Key is scoped per user so accounts do not share drafts.
 */

export const PROFILE_DRAFT_LEGACY_KEY = 'ip_candidate_profile_draft_v1';

const COMPARE_IGNORE = new Set([
  'id',
  'user_id',
  'account_email',
  'email',
  'points',
  'application_allowance',
  'referral_code',
  'profile_complete',
  'created_at',
  'updated_at',
  'phone_verified_at',
  'profile_picture_url',
  'searchable',
  'show_completed_internships',
  'show_profile_picture',
  'whatsapp_opt_in',
  'telegram_opt_in',
]);

export function profileDraftStorageKey(userId) {
  return `${PROFILE_DRAFT_LEGACY_KEY}:${String(userId || '').trim()}`;
}

function safeParse(raw) {
  try {
    const v = JSON.parse(raw || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function draftBelongsToUser(draft, userId, accountEmail) {
  if (!draft || !userId) return false;
  if (String(draft.userId || '') === String(userId)) return true;
  if (String(draft.form?.user_id || '') === String(userId)) return true;
  const email = String(accountEmail || draft.form?.account_email || '').trim().toLowerCase();
  const draftEmail = String(draft.form?.account_email || draft.form?.email || '').trim().toLowerCase();
  return Boolean(email && draftEmail && email === draftEmail);
}

/** Stable snapshot used to detect "draft not yet saved to account". */
export function profileDraftFingerprint(form, academics, experiences) {
  const slim = {};
  if (form && typeof form === 'object') {
    Object.keys(form)
      .filter((k) => !COMPARE_IGNORE.has(k))
      .sort()
      .forEach((k) => {
        const v = form[k];
        slim[k] = v === undefined ? null : v;
      });
  }
  let acad = Array.isArray(academics) ? academics : [];
  if (!acad.length) {
    acad = [{ row_label: '', college: '', degree: '', specialization: '', study_status: '', graduation_year: '', cgpa: '' }];
  }
  let exp = Array.isArray(experiences) ? experiences : [];
  if (!exp.length) {
    exp = [{ title: '', organization: '', start: '', end: '', description: '' }];
  }
  // Drop row ids for compare (server vs local empty rows)
  acad = acad.map(({ id, ...rest }) => rest);
  exp = exp.map(({ id, ...rest }) => rest);
  return JSON.stringify({
    form: slim,
    academics: acad,
    experiences: exp,
  });
}

export function profileDraftDiffersFromServer(draft, serverForm, serverAcademics, serverExperiences) {
  if (!draft?.form || typeof draft.form !== 'object') return false;
  return (
    profileDraftFingerprint(draft.form, draft.academics, draft.experiences)
    !== profileDraftFingerprint(serverForm, serverAcademics, serverExperiences)
  );
}

export function readProfileDraft(userId, accountEmail) {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const scoped = safeParse(localStorage.getItem(profileDraftStorageKey(userId)));
    if (scoped?.form && typeof scoped.form === 'object') return scoped;

    const legacy = safeParse(localStorage.getItem(PROFILE_DRAFT_LEGACY_KEY));
    if (legacy?.form && draftBelongsToUser(legacy, userId, accountEmail)) {
      const migrated = { ...legacy, userId: String(userId) };
      writeProfileDraft(userId, migrated);
      try {
        localStorage.removeItem(PROFILE_DRAFT_LEGACY_KEY);
      } catch {
        /* ignore */
      }
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeProfileDraft(userId, payload) {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    localStorage.setItem(
      profileDraftStorageKey(userId),
      JSON.stringify({
        ...payload,
        userId: String(userId),
        savedAt: Date.now(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearProfileDraft(userId) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(profileDraftStorageKey(userId));
  } catch {
    /* ignore */
  }
}

/** Banner copy when a device draft exists that is not on the account yet. */
export const PROFILE_DRAFT_RESTORE_MESSAGE =
  'Unsaved draft on this device (not saved to your account). Logging out keeps it here only — use Save on Profile to store it permanently.';

export const PROFILE_DRAFT_DASH_MESSAGE =
  'You have an unsaved profile draft on this device that is not on your account yet. Continue on Profile, then use Save to store it.';
