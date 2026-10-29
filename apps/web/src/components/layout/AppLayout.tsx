import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Download,
  LayoutGrid,
  LogOut,
  PanelLeft,
  RefreshCw,
  Search,
  Settings,
  Share,
  Smartphone,
  SquarePlus,
  UserCog,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ROLE_LABELS, initials } from '@livestock/shared';
import { runSync } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useOnline, usePendingCount } from '@/lib/hooks';
import { dismissInstall, installDismissed, useInstall } from '@/lib/install';
import { cn } from '@/lib/utils';
import { Logo } from '../Logo';
import { PageHelp } from '../PageHelp';
import { QuickNew } from '../QuickNew';
import { Button, Dialog } from '../ui';
import { NAV, crumbsFor, sectionFor, type NavSection } from './nav';

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const current = sectionFor(location.pathname)?.id;
  // Only the module you are working in is open; the others fold away to keep the menu short.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (current ? { [current]: true } : {}));
  useEffect(() => {
    if (current) setOpen((o) => (o[current] ? o : { ...o, [current]: true }));
  }, [current]);

  const link = (item: NavSection['items'][number], nested: boolean) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : item.hint}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg py-2 text-[14.5px] transition-colors',
          collapsed ? 'justify-center px-0' : nested ? 'pl-9 pr-2.5' : 'px-2.5',
          isActive
            ? 'bg-white font-semibold text-sidebar-active shadow-sm'
            : 'text-white/85 hover:bg-white/10 hover:text-white',
        )
      }
    >
      <item.icon className={cn('shrink-0', nested ? 'h-4 w-4' : 'h-[18px] w-[18px]')} strokeWidth={1.9} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-white">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-white/10',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <Link to="/" onClick={onNavigate}>
          <Logo compact={collapsed} />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
        {NAV.map((section) => {
          const items = section.items.filter((i) => !i.adminOnly || isAdmin);
          if (!items.length) return null;
          if (!section.label) return <div key={section.id}>{items.map((i) => link(i, false))}</div>;
          if (collapsed)
            return (
              <div key={section.id}>
                <div className="mx-3 my-2 border-t border-white/10" />
                {items.map((i) => link(i, false))}
              </div>
            );
          const isOpen = !!open[section.id];
          const Icon = section.icon;
          const active = current === section.id;
          return (
            <div key={section.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [section.id]: !o[section.id] }))}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] font-semibold transition-colors hover:bg-white/10',
                  active ? 'text-white' : 'text-white/80',
                )}
              >
                {Icon && <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />}
                <span className="flex-1 truncate">{section.label}</span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 opacity-70 transition-transform', !isOpen && '-rotate-90')}
                />
              </button>
              {isOpen && <div className="mt-0.5 space-y-0.5 pb-1">{items.map((i) => link(i, true))}</div>}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-2.5">
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[14.5px] text-white/85 hover:bg-white/10 hover:text-white',
            collapsed && 'justify-center',
          )}
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.9} />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </div>
  );
}

/** Phone navigation: Home plus the four modules. Tapping a module lists its pages. */
function BottomNav() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const current = sectionFor(location.pathname)?.id;
  const [sheet, setSheet] = useState<NavSection | null>(null);
  const modules = NAV.filter((s) => s.short);
  useEffect(() => setSheet(null), [location.pathname]);
  const tab =
    'flex flex-col items-center justify-center gap-1 py-2 text-[11.5px] font-medium transition-colors';
  return (
    <>
      <nav
        aria-label="Modules"
        className="fixed inset-x-0 bottom-0 z-[950] border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <NavLink
            to="/"
            end
            className={({ isActive }) => cn(tab, isActive ? 'text-brand-strong' : 'text-slate-500')}
          >
            <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={1.9} />
            Home
          </NavLink>
          {modules.map((m) => {
            const Icon = m.icon!;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSheet(m)}
                className={cn(tab, current === m.id ? 'text-brand-strong' : 'text-slate-500')}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
                {m.short}
              </button>
            );
          })}
        </div>
      </nav>
      <Dialog open={!!sheet} onOpenChange={(o) => !o && setSheet(null)} title={sheet?.label ?? ''} size="sm">
        <div className="-mx-2 space-y-1">
          {sheet?.items
            .filter((i) => !i.adminOnly || isAdmin)
            .map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3',
                    isActive ? 'bg-brand-light' : 'hover:bg-slate-50 active:bg-slate-100',
                  )
                }
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-strong">
                  <i.icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15.5px] font-medium text-slate-900">{i.label}</span>
                  <span className="block text-[13px] text-slate-500">{i.hint}</span>
                </span>
              </NavLink>
            ))}
        </div>
      </Dialog>
    </>
  );
}

interface SearchHit {
  type: string;
  label: string;
  sub: string;
  href: string;
}

function GlobalSearch({
  className,
  autoFocus,
  onDone,
}: {
  className?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useApi<SearchHit[]>(
    debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null,
  );
  const go = (h: SearchHit) => {
    navigate(h.href);
    setQ('');
    setOpen(false);
    onDone?.();
  };
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && data?.[0]) go(data[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search owners, farms, tags, cases..."
        aria-label="Global search"
        className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-[15px] placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-80 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {!data?.length ? (
            <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
          ) : (
            data.map((h, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={() => go(h)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="mt-0.5 w-14 shrink-0 text-[11px] font-medium uppercase text-slate-400">
                  {h.type}
                </span>
                <span>
                  <span className="block text-sm text-slate-900">{h.label}</span>
                  <span className="block text-xs text-slate-500">{h.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { data } = useApi<{
    count: number;
    items: { kind: string; title: string; sub: string; href: string }[];
  }>('/api/notifications', {
    refetchInterval: 120_000,
  });
  const navigate = useNavigate();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {!!data?.count && (
            <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-[#e7000b] px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white">
              {data.count > 99 ? '99+' : data.count}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[1100] max-h-[70vh] w-[min(92vw,380px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          <div className="px-3 py-2 text-sm font-semibold text-slate-900">Notifications</div>
          {data?.items.length ? (
            data.items.map((n, i) => (
              <DropdownMenu.Item
                key={i}
                onSelect={() => navigate(n.href)}
                className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-slate-50"
              >
                <div className="text-[13.5px] text-slate-900">{n.title}</div>
                <div className="text-xs text-slate-500">{n.sub}</div>
              </DropdownMenu.Item>
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-slate-500">You're all caught up.</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SyncStatus() {
  const online = useOnline();
  const pending = usePendingCount();
  const qc = useQueryClient();
  const sync = async () => {
    const r = await runSync();
    if (r.synced) {
      toast.success(`Synced ${r.synced} offline change${r.synced === 1 ? '' : 's'}.`);
      qc.invalidateQueries();
    }
    if (r.failed)
      toast.error(`${r.failed} offline change(s) were rejected by the server. Open the queue to review.`);
  };
  useEffect(() => {
    window.addEventListener('online', sync);
    const t = setInterval(() => navigator.onLine && sync(), 30_000);
    sync();
    return () => {
      window.removeEventListener('online', sync);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (online && !pending) return null;
  return (
    <button
      type="button"
      onClick={sync}
      title={online ? 'Sync now' : 'Offline — changes are saved on this device'}
      className={cn(
        'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex',
        online ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600',
      )}
    >
      {online ? <RefreshCw className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
      {online ? `${pending} pending sync` : pending ? `Offline · ${pending} queued` : 'Offline'}
    </button>
  );
}

/** iPhone / iPad: there is no install button, so show the three taps instead. */
function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Install on iPhone or iPad" size="sm">
      <ol className="space-y-3 text-[15px] text-slate-700">
        <li className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-strong">
            <Share className="h-4 w-4" />
          </span>
          <span>
            In <b className="font-medium">Safari</b>, tap the <b className="font-medium">Share</b> button (the
            square with an arrow).
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-strong">
            <SquarePlus className="h-4 w-4" />
          </span>
          <span>
            Scroll down and choose <b className="font-medium">Add to Home Screen</b>.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-strong">
            <Smartphone className="h-4 w-4" />
          </span>
          <span>
            Tap <b className="font-medium">Add</b>. Open Naga City Vet from its home-screen icon from now on.
          </span>
        </li>
      </ol>
    </Dialog>
  );
}

/** Ask the browser to install the app, or explain how on iPhone. */
function useInstallAction() {
  const inst = useInstall();
  const [iosHelp, setIosHelp] = useState(false);
  const available = inst.canPrompt || inst.ios;
  const run = async () => {
    if (inst.canPrompt) {
      if (await inst.install()) toast.success('Naga City Vet was installed on this device.');
    } else setIosHelp(true);
  };
  const dialog = <IosInstallDialog open={iosHelp} onOpenChange={setIosHelp} />;
  return { available, run, dialog };
}

/** Phones: a one-time suggestion to install the app (hidden for two weeks after "Not now"). */
function InstallBanner() {
  const { available, run, dialog } = useInstallAction();
  const [hidden, setHidden] = useState(installDismissed);
  if (!available || hidden) return dialog;
  return (
    <>
      <div
        role="region"
        aria-label="Install the app"
        className="fixed inset-x-3 z-[940] flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:hidden"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 text-[13.5px] leading-snug text-slate-700">
          <b className="block text-[14.5px] font-semibold text-slate-900">Install on this phone</b>
          Opens like an app and keeps working offline.
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button size="xs" onClick={run}>
            Install
          </Button>
          <button
            type="button"
            className="text-[12.5px] text-slate-500 hover:underline"
            onClick={() => {
              dismissInstall();
              setHidden(true);
            }}
          >
            Not now
          </button>
        </div>
      </div>
      {dialog}
    </>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const install = useInstallAction();
  if (!user) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-1 hover:bg-slate-50 sm:pr-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-dark text-[13px] font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-[15px] font-medium text-slate-900">{user.name}</span>
            <span className="block text-xs text-slate-500">{user.title ?? ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[1100] w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-slate-900">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
            <div className="mt-1 text-xs text-slate-500">Role: {ROLE_LABELS[user.role]}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          {user.role === 'ADMIN' && (
            <DropdownMenu.Item
              onSelect={() => navigate('/users')}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-50"
            >
              <UserCog className="h-4 w-4" /> User management
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onSelect={() => navigate('/settings')}
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-50"
          >
            <Settings className="h-4 w-4" /> System settings
          </DropdownMenu.Item>
          {install.available && (
            <DropdownMenu.Item
              onSelect={install.run}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Install app on this device
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item
            onSelect={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-50"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
      {install.dialog}
    </DropdownMenu.Root>
  );
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nlm-sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const { trail, title } = crumbsFor(location.pathname);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const toggle = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((c) => {
        try {
          localStorage.setItem('nlm-sidebar', c ? 'open' : 'collapsed');
        } catch {
          /* ignore */
        }
        return !c;
      });
    } else setMobileOpen(true);
  };

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'hidden shrink-0 transition-[width] duration-200 lg:block',
          collapsed ? 'w-16' : 'w-[280px]',
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-[1200] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              aria-label="Close menu"
              className="absolute right-2 top-4 rounded p-1 text-white/90 hover:bg-white/10"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[900] flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
          <button
            type="button"
            onClick={toggle}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <nav className="hidden items-center gap-1 text-xs text-slate-500 sm:flex" aria-label="Breadcrumb">
              {trail.map((t, i) => (
                <Fragment key={i}>
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  {t.to ? (
                    <Link to={t.to} className="hover:text-slate-800">
                      {t.label}
                    </Link>
                  ) : (
                    <span>{t.label}</span>
                  )}
                </Fragment>
              ))}
            </nav>
            <div className="truncate text-[15px] font-semibold text-slate-900">{title}</div>
          </div>
          <SyncStatus />
          <GlobalSearch className="hidden w-72 md:block" />
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-5 w-5" />
          </button>
          <Notifications />
          <UserMenu />
        </header>
        {searchOpen && (
          <div className="fixed inset-x-0 top-0 z-[1150] flex items-center gap-2 border-b border-slate-200 bg-white p-3 md:hidden">
            <GlobalSearch className="flex-1" autoFocus onDone={() => setSearchOpen(false)} />
            <button
              type="button"
              className="rounded p-2 text-slate-500"
              onClick={() => setSearchOpen(false)}
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <InstallBanner />
    </div>
  );
}