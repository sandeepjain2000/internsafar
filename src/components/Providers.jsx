'use client';

import { SessionProvider } from 'next-auth/react';
import HelpChatbot from '@/components/ip/HelpChatbot';
import ClientOpsErrorGuard from '@/components/ip/ClientOpsErrorGuard';

export function Providers({ children }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <ClientOpsErrorGuard />
      {children}
      <HelpChatbot />
    </SessionProvider>
  );
}
