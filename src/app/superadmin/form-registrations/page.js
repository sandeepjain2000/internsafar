import { redirect } from 'next/navigation';

/** Live employer self-serve register lands on Approvals only — this queue is retired. */
export default function RetiredFormRegistrationsPage() {
  redirect('/superadmin/approvals');
}
