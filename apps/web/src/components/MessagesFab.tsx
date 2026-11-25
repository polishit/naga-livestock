import { MessageSquare, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Loading } from './page';

const MessagesPanel = lazy(() => import('@/pages/MessagesPage').then((m) => ({ default: m.MessagesPanel })));

const OPEN = 'nlm-messages-open';
const CLOSE = 'nlm-messages-close';

/** An open request made before the button was on screen (e.g. an old /messages link on first load). */
let pendingOpen: { ownerId: number | null } | null = null;

/** Opens the floating Messages window, on one owner's conversation if given. */
export function openMessages(ownerId?: number | null) {
  pendingOpen = { ownerId: ownerId ?? null };
  window.dispatchEvent(new CustomEvent(OPEN, { detail: ownerId ?? null }));
}
export function closeMessages() {
  window.dispatchEvent(new Event(CLOSE));
}

/**
 * Messages with livestock owners as a floating button at the bottom-right of every page (panel
 * revision): it shows the number of unread messages and opens the conversations in a window over the
 * page, so staff can reply without leaving what they are doing.
 */
export function MessagesFab() {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const unread =
    useApi<{ unread: number }>('/api/messages/summary', { refetchInterval: 30_000 }).data?.unread ?? 0;
  useEffect(() => {
    const onOpen = (e: Event) => {
      pendingOpen = null;
      setOwnerId((e as CustomEvent<number | null>).detail ?? null);
      setOpen(true);
    };
    if (pendingOpen) {
      setOwnerId(pendingOpen.ownerId);
      setOpen(true);
      pendingOpen = null;
    }
    const onClose = () => setOpen(false);
    window.addEventListener(OPEN, onOpen);
    window.addEventListener(CLOSE, onClose);
    return () => {
      window.removeEventListener(OPEN, onOpen);
      window.removeEventListener(CLOSE, onClose);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Messages with livestock owners"
          className={cn(
            'fixed z-[980] flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl',
            // Phones: the whole screen above the bottom bar. Larger screens: a window at the bottom-right.
            'inset-x-0 top-0 bottom-[calc(64px+env(safe-area-inset-bottom))] lg:inset-auto lg:bottom-24 lg:right-6 lg:h-[min(640px,calc(100dvh-140px))] lg:w-[420px] lg:rounded-2xl',
          )}
        >
          <header className="flex h-14 shrink-0 items-center gap-3 bg-sidebar-ink px-4 text-white">
            <MessageSquare className="h-5 w-5" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[15px] font-semibold">Messages</div>
              <div className="truncate text-[12px] text-white/75">Conversations with livestock owners</div>
            </div>
            <button
              type="button"
              aria-label="Close messages"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <Suspense fallback={<Loading />}>
            <MessagesPanel ownerId={ownerId} onSelect={setOwnerId} />
          </Suspense>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}
        title="Messages with livestock owners"
        className={cn(
          'fixed right-4 z-[985] flex h-14 w-14 items-center justify-center rounded-full bg-sidebar-ink text-white shadow-lg ring-4 ring-white transition hover:scale-105 hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-brand/50 lg:right-6',
          'bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-6',
          open && 'max-lg:hidden',
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[22px] rounded-full bg-red-600 px-1.5 text-center text-[12px] font-bold leading-[22px] text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
