/**
 * Single currency: reward points.
 * Apply and publish debit points directly — no posting credits / application allowance convert.
 */
export const POINTS_PER_APPLICATION = 5;
/** Points charged when an employer publishes (or re-publishes) an internship. */
export const POINTS_PER_POST = 50;
export const REFERRAL_POINTS = 25;
/** One-time credit when a candidate profile first becomes complete. */
export const PROFILE_COMPLETE_POINTS = 15;
/** One-time credit on a candidate's first successful application. */
export const FIRST_APPLICATION_BONUS = 10;
export const LINKEDIN_PROMO_POINTS = 30;

/** @deprecated kept for older imports; product no longer uses convert-credits */
export const POINTS_PER_FREE_POST_CREDIT = POINTS_PER_POST;
export const POINTS_PER_APPLICATION_BUCKET = 25;
export const APPLICATION_BUCKET_SIZE = 5;
export const REFERRAL_EMPLOYER_CREDITS = 0;
export const REFERRAL_CANDIDATE_ALLOWANCE = 0;
export const LINKEDIN_PROMO_CREDITS = 0;

export function referrerRewardsForRole(_role) {
  return { points: REFERRAL_POINTS, freePostCredits: 0, applicationAllowance: 0 };
}
