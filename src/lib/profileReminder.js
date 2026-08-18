/** Incomplete-profile reminder rules (DOCX §26.1). */
export const PROFILE_REMINDER_MILESTONES = [1, 3, 7, 14, 30];
export const PROFILE_REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const PROFILE_REMINDER_MILESTONE_MIN_GAP_MS = 24 * 60 * 60 * 1000; // avoid same-day spam

/**
 * @param {{ profileComplete: boolean, loginCount: number, lastShownAt: Date|string|null, lastShownLoginCount: number }} input
 */
export function shouldShowProfileReminder(input) {
  if (input.profileComplete) return { show: false, reason: 'complete' };
  const loginCount = Number(input.loginCount || 0);
  if (loginCount < 1) return { show: false, reason: 'no_logins' };

  const lastShownCount = Number(input.lastShownLoginCount || 0);
  if (loginCount <= lastShownCount) return { show: false, reason: 'already_shown_for_this_login_count' };

  const lastShownAt = input.lastShownAt ? new Date(input.lastShownAt).getTime() : null;
  const now = Date.now();
  const since = lastShownAt == null ? Number.POSITIVE_INFINITY : now - lastShownAt;

  const isMilestone = PROFILE_REMINDER_MILESTONES.includes(loginCount);
  if (isMilestone && since >= PROFILE_REMINDER_MILESTONE_MIN_GAP_MS) {
    return { show: true, reason: `milestone_${loginCount}` };
  }
  if (since >= PROFILE_REMINDER_COOLDOWN_MS) {
    return { show: true, reason: 'cooldown_elapsed' };
  }
  return { show: false, reason: 'throttled' };
}
