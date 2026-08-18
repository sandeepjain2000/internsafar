import { Suspense } from 'react';
import CandidateRegisterPage from './CandidateRegisterClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <CandidateRegisterPage />
    </Suspense>
  );
}
