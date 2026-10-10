import { redirect } from 'next/navigation';

/** Referral link with no code (/r/ is normalised to /r): open the registration chooser. */
export default function ReferralNoCodeRedirect() {
  redirect('/register');
}
