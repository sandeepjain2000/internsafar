import { redirect } from 'next/navigation';

/** Viral shares queue removed from product UI — orphaned create path. */
export default function SuperAdminViralRemoved() {
  redirect('/superadmin');
}
