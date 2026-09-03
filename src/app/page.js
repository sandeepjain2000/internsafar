import { Suspense } from 'react';
import IpSignInLanding from '@/components/ip/IpSignInLanding';

function LoginFallback() {
  return (
    <div className="ip-gemini-login flex min-h-svh items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <IpSignInLanding />
    </Suspense>
  );
}
