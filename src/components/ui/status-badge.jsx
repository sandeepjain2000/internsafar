import { badgeVariants } from '@/components/ui/badge';
import { cn, getStatusColor } from '@/lib/utils';

/** Soft status styles matching AdminCN billing-tab Badge pattern. */
const TONE_CLASS = {
  gray: 'bg-muted text-muted-foreground border-border/60',
  blue: 'bg-blue-600/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400',
  indigo: 'bg-indigo-600/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400',
  green: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  amber: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  red: 'bg-destructive/10 text-destructive',
  // Legacy / toast synonyms → same palette (avoids gray fallback for all semantic tones)
  success: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  warning: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-blue-600/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400',
  neutral: 'bg-muted text-muted-foreground border-border/60',
};

/**
 * Soft colored status pill — AdminCN Badge tones (plain span so label never drops / clips empty).
 */
export function StatusBadge({ status, tone, children, className, showDot = false, ...props }) {
  const resolved = tone || getStatusColor(status);
  const label = children == null || children === '' ? null : children;

  return (
    <span
      data-slot="badge"
      className={cn(
        badgeVariants({ variant: 'secondary' }),
        'h-auto min-h-5 min-w-fit max-w-none overflow-visible rounded-full border px-2.5 py-0.5 font-semibold',
        TONE_CLASS[resolved] || TONE_CLASS.gray,
        showDot &&
          'before:mr-1.5 before:inline-block before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-[""]',
        className
      )}
      {...props}
    >
      {label}
    </span>
  );
}
