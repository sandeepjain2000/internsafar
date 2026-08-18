import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Shared marketing/auth backdrop matching CPMU login atmosphere. */
export default function AuthShell({
  children,
  brand = 'Internship Portal',
  subtitle,
  mark = 'IP',
  markClassName,
  className,
}) {
  return (
    <div className={cn('relative flex min-h-svh items-center justify-center overflow-hidden bg-background p-4', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-100)_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_var(--primary-50)_0%,_transparent_45%)]"
      />
      <div className="relative z-10 w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm',
              markClassName,
            )}
          >
            {mark}
          </div>
          <div>
            <p className="font-display text-3xl font-semibold tracking-tight">{brand}</p>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {children}
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="underline underline-offset-4">
            Back to sign in
          </Link>
          {' · '}
          <Link href="/how-it-works" className="underline underline-offset-4">
            How it works
          </Link>
          {' · '}
          <Link href="/help" className="underline underline-offset-4">
            Help
          </Link>
        </p>
      </div>
    </div>
  );
}
