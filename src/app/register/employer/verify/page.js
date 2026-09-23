import Link from 'next/link';
import { consumeEmployerEmailVerification } from '@/lib/ipEmployerEmailVerify';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IpGeminiBrand } from '@/components/ip/IpGeminiBrand';
import '@/components/ip/ip-register-gemini.css';

export const dynamic = 'force-dynamic';

export default async function EmployerVerifyPage({ searchParams }) {
  const sp = await searchParams;
  const token = String(sp?.token || '').trim();
  let result = { ok: false, error: 'Missing verification token' };
  if (token) {
    try {
      result = await consumeEmployerEmailVerification(token);
    } catch (e) {
      result = { ok: false, error: e.message || 'Verification failed' };
    }
  }

  return (
    <div className="ip-gemini-register">
      <div className="ip-reg-page">
        <div className="mb-6">
          <IpGeminiBrand />
        </div>
        <div className="ip-reg-shell">
          <div className="ip-reg-shell__head ip-reg-shell__head--employer">
            <div>
              <h2>Email verification</h2>
              <p>Confirm ownership of your employer inbox</p>
            </div>
          </div>
          <div className="ip-reg-shell__body">
            {result.ok ? (
              <Alert>
                <AlertTitle>Email verified</AlertTitle>
                <AlertDescription>
                  Your email is confirmed. You can sign in now to complete your profile and upload verification
                  documents. Postings unlock after SuperAdmin Final Employer Approval.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Could not verify</AlertTitle>
                <AlertDescription>{result.error}</AlertDescription>
              </Alert>
            )}
            <Link href="/" className="ip-reg-submit ip-reg-submit--accent" style={{ textDecoration: 'none' }}>
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
