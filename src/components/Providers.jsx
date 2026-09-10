'use client';

import { SessionProvider } from 'next-auth/react';
import HelpChatbot from '@/components/ip/HelpChatbot';

export function Providers({ children }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
      <HelpChatbot />
    </SessionProvider>
  );
}
