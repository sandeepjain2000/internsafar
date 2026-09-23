import { redirect } from 'next/navigation';

/**
 * Manual Requests is legacy (manualRequest=true API only).
 * Live Domain / Free-email register creates pending ip_employers → Approvals.
 */
export default function RetiredManualRequestsPage() {
  redirect('/superadmin/approvals');
}
