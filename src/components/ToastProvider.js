'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/lib/utils';
import { IpToastItem } from '@/components/ip/IpToast';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const info = useCallback((message) => addToast(message, 'info'), [addToast]);
  const warn = useCallback((message) => addToast(message, 'warning'), [addToast]);
  const success = useCallback((message) => addToast(message, 'success'), [addToast]);
  const error = useCallback((message) => addToast(message, 'error'), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, info, warn, success, error }}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-[10000] flex w-full max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <IpToastItem
            key={t.id}
            message={t.message}
            onDismiss={() => removeToast(t.id)}
            className={cn(
              'pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-lg',
              t.type === 'error' && 'border-destructive/40 bg-destructive/10 text-destructive',
              t.type === 'warning' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
              t.type === 'success' && 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300',
              t.type === 'info' && 'border-border bg-card text-foreground',
            )}
          >
            <span>{t.message}</span>
          </IpToastItem>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
