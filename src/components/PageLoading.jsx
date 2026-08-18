'use client';

import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function PageLoading({
  message = 'Loading screen…',
  variant = 'default',
  className = '',
}) {
  if (variant === 'skeleton-list') {
    return (
      <div className={cn('flex flex-col gap-3 p-1', className)}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <p className="text-sm">{message}</p>
    </div>
  );
}
