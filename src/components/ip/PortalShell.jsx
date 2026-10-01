'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { signOutAndEndSession } from '@/lib/ipClientSignOut';
import { readResponseJson } from '@/lib/readResponseJson';
import { NAV_BADGES_REFRESH_EVENT } from '@/lib/ipNavBadges';
import { isPostingPath } from '@/lib/ipReturnTo';
import {
  Activity,
  Award,
  Bell,
  Briefcase,
  ClipboardList,
  FileText,
  FolderCheck,
  Home,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  LogOut,
  Mail,
  Menu,
  PanelLeft,
  PanelLeftClose,
  ChevronRight,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Coins,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn, getInitials } from '@/lib/utils';
import ProfileReminderBanner from '@/components/ip/ProfileReminderBanner';

const NAV_ICONS = {
  'layout-dashboard': LayoutDashboard,
  'file-text': FileText,
  'shield-check': ShieldCheck,
  'user-plus': UserPlus,
  'folder-check': FolderCheck,
  briefcase: Briefcase,
  'share-2': Share2,
  coins: Coins,
  activity: Activity,
  'clipboard-list': ClipboardList,
  mail: Mail,
  lightbulb: Lightbulb,
  settings: Settings,
  user: User,
  search: Search,
  award: Award,
  bell: Bell,
};

const ROLE_HOME = {
  candidate: '/candidate',
  employer: '/employer',
  superadmin: '/superadmin',
};

const ROLE_SUBTITLE = {
  candidate: 'Candidate workspace',
  employer: 'Employer workspace',
  superadmin: 'SuperAdmin workspace',
};

/**
 * Shared authenticated app shell — CPMU AdminCN dashboard chrome
 * (bg-sidebar, collapse, mobile drawer, sticky topbar).
 * Keeps PortalShell nav API for role layouts.
 */
export default function PortalShell({
  role,
  nav,
  title,
  loginHref = '/',
  children,
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [modKey, setModKey] = useState('Ctrl');
  const [navBadges, setNavBadges] = useState({});
  const homePath = ROLE_HOME[role] || '/';

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem('ip_sidebar_collapsed') === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const loadBadges = () => {
      fetch('/api/ip/nav-badges')
        .then((r) => readResponseJson(r, {}))
        .then((d) => setNavBadges(d.badges || {}))
        .catch(() => {});
    };
    loadBadges();
    window.addEventListener(NAV_BADGES_REFRESH_EVENT, loadBadges);
    return () => window.removeEventListener(NAV_BADGES_REFRESH_EVENT, loadBadges);
  }, [status, pathname]);

  useEffect(() => {
    try {
      localStorage.setItem('ip_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || '')) setModKey('⌘');
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      const el = e.target;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName || '')) return;
      e.preventDefault();
      setSidebarCollapsed((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function loginWithReturn() {
    const here = `${window.location.pathname}${window.location.search}`;
    return here && here !== '/' ? `${loginHref}?next=${encodeURIComponent(here)}` : loginHref;
  }

  async function handleSignOut(returnHere) {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutAndEndSession({ callbackUrl: returnHere === true ? loginWithReturn() : loginHref });
    } catch {
      setSigningOut(false);
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated' && !signingOut) router.replace(loginWithReturn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, signingOut, router, loginHref]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-pulse rounded-lg bg-primary/20" />
          <p className="text-sm">{signingOut ? 'Signing out…' : 'Signing you in…'}</p>
        </div>
      </div>
    );
  }
  if (session?.user?.role !== role) {
    const postingLink = role === 'candidate' && isPostingPath(pathname);
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md space-y-3 text-center">
          <p className="text-sm font-medium">
            {postingLink ? 'Sign in as a candidate to view this internship' : 'Wrong account for this workspace'}
          </p>
          <p className="text-sm text-muted-foreground">
            {postingLink
              ? `You are signed in as ${session?.user?.role || 'unknown'} (${session?.user?.email || 'no email'}). Sign out, then sign in or register as a candidate to view and apply for this internship.`
              : `This area needs role “${role}”, but you are signed in as “${session?.user?.role || 'unknown'}” (${session?.user?.email || 'no email'}). Sign out, then sign in with the correct account.`}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSignOut(role === 'candidate')}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {signingOut ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    );
  }

  const displayName = session.user.name || session.user.email || 'User';
  const notificationsHref = nav.find((n) => /notif/i.test(n.label) || /notifications/.test(n.href))?.href;

  function isActive(href) {
    if (href === homePath) return pathname === href;
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <div className="dashboard-layout flex min-h-svh w-full min-w-0 overflow-x-clip bg-background text-foreground">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm',
          'transition-[width,transform] duration-200 ease-linear',
          sidebarCollapsed ? 'w-12' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'max-md:w-72',
        )}
        data-state={sidebarCollapsed ? 'collapsed' : 'expanded'}
      >
        <div className={cn('flex h-16 shrink-0 items-center gap-2 px-2', sidebarCollapsed && 'md:justify-center')}>
          <Link
            href={homePath}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1.5 outline-none',
              'hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              sidebarCollapsed && 'md:flex-none md:justify-center md:px-0',
            )}
            onClick={() => setMobileOpen(false)}
          >
            <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-xs ring-1 ring-black/5">
              <Image
                src="/internsafar-icon.png"
                alt="InternSafar"
                width={32}
                height={32}
                className="size-full object-contain"
                priority
              />
            </div>
            <div className={cn('min-w-0 flex-1', sidebarCollapsed && 'md:hidden')}>
              <div className="truncate text-sm font-semibold tracking-tight">
                Intern<span className="text-indigo-600">Safar</span>
              </div>
              <div className="truncate text-xs text-sidebar-foreground/60">{ROLE_SUBTITLE[role] || title}</div>
            </div>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            title="Close menu"
            data-testid="mobile-menu-close"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <Separator />

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          <Link
            href={homePath}
            className={cn(
              'flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium outline-none transition-colors',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              pathname === homePath && 'bg-primary/10 text-sidebar-accent-foreground',
              sidebarCollapsed && 'md:justify-center md:px-0',
            )}
            onClick={() => setMobileOpen(false)}
            aria-current={pathname === homePath ? 'page' : undefined}
            title="Home"
          >
            <span className="flex size-5 shrink-0 items-center justify-center">
              <Home aria-hidden="true" className="size-4" />
            </span>
            <span className={cn('min-w-0 flex-1 truncate', sidebarCollapsed && 'md:hidden')}>Home</span>
          </Link>

          <div
            className={cn(
              'px-2 pb-1 pt-4 text-[0.6875rem] font-medium uppercase tracking-wider text-sidebar-foreground/50',
              sidebarCollapsed && 'md:sr-only',
            )}
          >
            Menu
          </div>

          {nav
            .filter((item) => item.href !== homePath)
            .map((item) => {
              const active = isActive(item.href);
              const badge = navBadges[item.href];
              const badgeHot = badge === 'Hot';
              const IconCmp = item.icon ? NAV_ICONS[item.icon] : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground outline-none transition-colors',
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                    active && 'bg-primary/10 font-semibold text-sidebar-accent-foreground',
                    sidebarCollapsed && 'md:justify-center md:px-0',
                  )}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  {IconCmp ? (
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      <IconCmp aria-hidden="true" className="size-4" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        active ? 'bg-primary' : 'bg-sidebar-foreground/30',
                        sidebarCollapsed && 'md:size-2',
                      )}
                    />
                  )}
                  <span className={cn('min-w-0 flex-1 truncate text-left', sidebarCollapsed && 'md:hidden')}>
                    {item.label}
                  </span>
                  {badge && !sidebarCollapsed ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        badgeHot ? 'bg-amber-100 text-amber-800' : 'bg-primary text-primary-foreground',
                      )}
                    >
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
        </nav>

        <Separator />
        <div className="flex shrink-0 flex-col gap-1 p-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={cn(
              'hidden h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-sm font-medium text-sidebar-foreground/70 outline-none transition-colors md:flex',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              sidebarCollapsed && 'md:justify-center md:px-0',
            )}
            title={`${sidebarCollapsed ? 'Expand menu' : 'Collapse menu'} (${modKey}+B)`}
            aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!sidebarCollapsed}
            data-testid="sidebar-collapse-toggle"
          >
            <span className="flex size-5 shrink-0 items-center justify-center">
              {sidebarCollapsed ? (
                <PanelLeft aria-hidden="true" className="size-4" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="size-4" />
              )}
            </span>
            <span className={cn('min-w-0 flex-1 truncate text-left', sidebarCollapsed && 'md:hidden')}>
              Collapse menu
            </span>
            <kbd
              className={cn(
                'shrink-0 rounded border border-sidebar-border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-sidebar-foreground/50',
                sidebarCollapsed && 'md:hidden',
              )}
              aria-hidden="true"
            >
              {modKey}+B
            </kbd>
          </button>
          <Link
            href={
              role === 'employer'
                ? '/employer/profile'
                : role === 'candidate'
                  ? '/candidate/profile'
                  : '/account'
            }
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-md p-2 outline-none transition-colors',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              sidebarCollapsed && 'md:justify-center md:px-0',
            )}
            title="Open profile"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
              {getInitials(displayName)}
            </div>
            <div className={cn('min-w-0 flex-1', sidebarCollapsed && 'md:hidden')}>
              <div className="truncate text-sm font-semibold">{displayName}</div>
              <div className="truncate text-xs text-sidebar-foreground/60">{ROLE_SUBTITLE[role] || title}</div>
            </div>
            <ChevronRight
              aria-hidden="true"
              className={cn('size-4 shrink-0 text-sidebar-foreground/50', sidebarCollapsed && 'md:hidden')}
            />
          </Link>
        </div>
      </aside>

      <div
        className={cn(
          'flex min-h-svh min-w-0 flex-1 flex-col overflow-x-clip bg-background transition-[margin] duration-200 ease-linear',
          sidebarCollapsed ? 'md:ml-12' : 'md:ml-64',
        )}
      >
        <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-2 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Toggle navigation menu"
                aria-expanded={mobileOpen}
              >
                <Menu aria-hidden="true" />
              </Button>
              <Separator orientation="vertical" className="mx-1 hidden h-5! data-vertical:self-center sm:block md:hidden" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold leading-tight sm:text-base">{title}</h2>
                <p className="truncate text-xs text-muted-foreground">{ROLE_SUBTITLE[role]}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {notificationsHref ? (
                <Button variant="outline" size="sm" render={<Link href={notificationsHref} />} nativeButton={false}>
                  Notifications
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                disabled={signingOut}
                aria-busy={signingOut}
                data-testid="portal-sign-out"
              >
                {signingOut ? (
                  <Loader2 data-icon="inline-start" className="size-4 animate-spin" aria-hidden />
                ) : (
                  <LogOut data-icon="inline-start" className="size-4" aria-hidden />
                )}
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
          {(role === 'candidate' || role === 'employer') ? <ProfileReminderBanner /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
