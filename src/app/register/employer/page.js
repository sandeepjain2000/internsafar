import { Suspense } from 'react';
import EmployerRegisterPage from './EmployerRegisterClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <EmployerRegisterPage />
    </Suspense>
  );
}
