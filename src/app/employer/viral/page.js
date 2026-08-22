import { redirect } from 'next/navigation';

/** Viral board is combined into Refer & earn. */
export default function EmployerViralRedirect() {
  redirect('/employer/referral');
}
