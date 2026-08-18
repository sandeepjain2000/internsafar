'use client';

import {
  Eye,
  Pencil,
  Trash2,
  Archive,
  Plus,
  CheckCircle,
  XCircle,
  Download,
  Mail,
  Users,
  FileText,
  Settings,
  ScrollText,
  ListPlus,
  BadgeCheck,
  Undo2,
  Send,
  GitBranch,
  Handshake,
  Loader2,
  X,
  RefreshCw,
  ClipboardCheck,
  CreditCard,
  RotateCcw,
  Pause,
  Rocket,
  TrendingUp,
  MessageSquare,
  FileSignature,
  CheckCheck,
  Flag,
  ShieldCheck,
  XOctagon,
  Bookmark,
  Share2,
  MessageCircle,
  Search,
  UserPlus,
} from 'lucide-react';
import { shouldShowFilterCount } from '@/lib/filterBadgeLabel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const META = {
  view: { label: 'View', Icon: Eye },
  edit: { label: 'Edit', Icon: Pencil },
  delete: { label: 'Delete', Icon: Trash2 },
  archive: { label: 'Archive', Icon: Archive },
  add: { label: 'Add', Icon: Plus },
  approve: { label: 'Approve', Icon: CheckCircle },
  reject: { label: 'Reject', Icon: XCircle },
  download: { label: 'Download', Icon: Download },
  email: { label: 'Email', Icon: Mail },
  sync: { label: 'Sync', Icon: Users },
  details: { label: 'Details', Icon: FileText },
  manage: { label: 'Manage', Icon: Settings },
  cv: { label: 'Open CV', Icon: ScrollText },
  shortlist: { label: 'Shortlist', Icon: ListPlus },
  select: { label: 'Select', Icon: BadgeCheck },
  withdraw: { label: 'Withdraw', Icon: Undo2 },
  apply: { label: 'Apply', Icon: Send },
  pipeline: { label: 'View pipeline', Icon: GitBranch },
  request: { label: 'Request tie-up', Icon: Handshake },
  resend: { label: 'Resend verification', Icon: RefreshCw },
  close: { label: 'Close', Icon: X },
  review: { label: 'Review', Icon: ClipboardCheck },
  sponsor: { label: 'Record sponsorship payment', Icon: CreditCard },
  confirm: { label: 'Send confirmation email', Icon: Send },
  restore: { label: 'Restore tie-up', Icon: RotateCcw },
  pocs: { label: 'Manage points of contact', Icon: Users },
  pause: { label: 'Pause', Icon: Pause },
  publish: { label: 'Publish', Icon: Rocket },
  promote: { label: 'Promote + verify', Icon: TrendingUp },
  message: { label: 'Message', Icon: MessageSquare },
  offer: { label: 'Offer', Icon: FileSignature },
  complete: { label: 'Mark complete', Icon: CheckCheck },
  flag: { label: 'Flag', Icon: Flag },
  verify: { label: 'Verify', Icon: ShieldCheck },
  fail: { label: 'Fail', Icon: XOctagon },
  save: { label: 'Save', Icon: Bookmark },
  linkedin: { label: 'Share on LinkedIn', Icon: Share2 },
  whatsapp: { label: 'Share on WhatsApp', Icon: MessageCircle },
  search: { label: 'Search', Icon: Search },
  invite: { label: 'Invite to apply', Icon: UserPlus },
};

function mapVariant(variant) {
  if (variant === 'danger') return 'outline';
  if (variant === 'primary') return 'default';
  if (variant === 'ghost') return 'ghost';
  if (variant === 'success') return 'secondary';
  return 'outline';
}

/**
 * Icon (or icon+label) table action — AdminCN Button, same verbs as before.
 */
export function StandardTableIconAction({
  action,
  onClick,
  disabled,
  variant = 'secondary',
  showLabel = false,
  className = '',
  style,
  tooltip,
  badge,
  loading = false,
}) {
  const def = META[action];
  if (!def) return null;
  const { label, Icon } = def;
  const tip = tooltip ?? label;
  const aria = tooltip ? `${label} — ${tooltip}` : label;
  const showBadge = shouldShowFilterCount(badge);
  const iconOnly = !showLabel;

  return (
    <Button
      type="button"
      size={iconOnly ? 'icon-sm' : 'sm'}
      variant={mapVariant(variant)}
      className={cn(
        variant === 'danger' && 'border-destructive/30 text-destructive hover:bg-destructive/10',
        showBadge && iconOnly && 'relative',
        className
      )}
      style={style}
      onClick={onClick ?? (() => {})}
      disabled={disabled || loading}
      title={tip}
      aria-label={showBadge && iconOnly ? `${aria} (${Math.trunc(Number(badge))} documents)` : aria}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
      {showLabel ? <span>{label}</span> : null}
      {showBadge && iconOnly ? (
        <span
          className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[0.6rem] font-bold"
          aria-hidden
        >
          {Math.trunc(Number(badge))}
        </span>
      ) : null}
      {showBadge && !iconOnly ? (
        <span className="bg-muted text-muted-foreground ml-1 rounded px-1 text-[0.65rem] leading-tight">
          {Math.trunc(Number(badge))}
        </span>
      ) : null}
    </Button>
  );
}
