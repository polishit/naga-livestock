import { ExternalLink, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { fmtDate } from '@livestock/shared';
import { api, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { MessageThread, type ThreadItem } from '@/components/MessageThread';
import { closeMessages, openMessages } from '@/components/MessagesFab';
import { ErrorBox, Loading } from '@/components/page';
import { Badge, EmptyState, Input } from '@/components/ui';

/**
 * Messages with livestock owners (floating window, opened from the button at the bottom-right). Each owner has one conversation that also shows their
 * transactions with the office (what they sent and what was decided). Every staff member can
 * reply; the owner sees the reply as coming from the City Veterinary Office.
 */

interface Conversation {
  ownerId: number;
  code: string;
  fullName: string;
  barangay: string;
  status: string;
  lastAt: string | null;
  last: { fromOwner: boolean; text: string; at: string } | null;
  unread: number;
}
interface Thread {
  owner: {
    id: number;
    code: string;
    fullName: string;
    barangay: string;
    contact: string | null;
    status: string;
    account: { id: number; lastLoginAt: string | null } | null;
  };
  items: ThreadItem[];
}

/**
 * The conversations with owners, shown in the floating Messages window (bottom-right of every
 * page). The list and the open conversation take the whole window, one at a time.
 */
export function MessagesPanel({
  ownerId,
  onSelect,
}: {
  ownerId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useApi<Conversation[]>('/api/messages', { refetchInterval: 30_000 });
  if (ownerId) return <ThreadPanel ownerId={ownerId} onBack={() => onSelect(null)} />;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const term = q.trim().toLowerCase();
  const rows = term
    ? data.filter((c) => `${c.fullName} ${c.code} ${c.barangay}`.toLowerCase().includes(term))
    : data;
  const unread = data.filter((c) => c.unread > 0).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="Search owners"
            placeholder="Search owner or barangay…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <p className="mt-2 text-[12px] text-slate-500">
          {data.length} conversation{data.length === 1 ? '' : 's'}
          {unread ? ` · ${unread} with new messages` : ''} · replies are signed as the City Veterinary Office
        </p>
      </div>
      <div className="nav-scroll min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <EmptyState>No owner uses the owner app yet.</EmptyState>}
        {rows.map((c) => (
          <button
            key={c.ownerId}
            type="button"
            onClick={() => onSelect(c.ownerId)}
            className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                c.unread ? 'bg-sidebar-ink text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {initials(c.fullName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                <b
                  className={cn(
                    'min-w-0 truncate text-[15px]',
                    c.unread ? 'text-slate-900' : 'text-slate-800',
                  )}
                >
                  {c.fullName}
                </b>
                <span className="flex shrink-0 items-center gap-1.5">
                  {c.lastAt && <span className="text-[12px] text-slate-500">{fmtDate(c.lastAt)}</span>}
                  {c.unread > 0 && (
                    <span className="min-w-[20px] rounded-full bg-red-600 px-1.5 text-center text-[12px] font-semibold leading-5 text-white">
                      {c.unread}
                    </span>
                  )}
                </span>
              </span>
              <span
                className={cn(
                  'mt-0.5 block truncate text-[14px]',
                  c.unread ? 'font-medium text-slate-800' : 'text-slate-600',
                )}
              >
                {c.last
                  ? `${c.last.fromOwner ? '' : 'Office: '}${c.last.text}`
                  : `${c.barangay} · no messages yet`}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Old links (/messages?owner=…) open the floating Messages window over the page you came from. */
export function MessagesPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ownerId = Number(params.get('owner')) || null;
  useEffect(() => {
    openMessages(ownerId);
    navigate(ownerId ? `/owners/${ownerId}` : '/', { replace: true });
  }, [ownerId, navigate]);
  return null;
}

function ThreadPanel({ ownerId, onBack }: { ownerId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useApi<Thread>(`/api/messages/${ownerId}`, {
    refetchInterval: 20_000,
  });
  // Opening the conversation marks it read: refresh the list and the menu badge.
  useEffect(() => {
    if (data) {
      void qc.invalidateQueries({ queryKey: ['/api/messages'] });
      void qc.invalidateQueries({ queryKey: ['/api/messages/summary'] });
    }
  }, [data, qc]);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const o = data.owner;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-start gap-2 border-b border-slate-100 px-3 py-3">
        <BackButton onClick={onBack} label="Back to the conversations" className="-ml-1" />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold leading-tight">{o.fullName}</h2>
            {o.status === 'PENDING' && <Badge tone="amber">Not Verified Yet</Badge>}
          </div>
          <p className="text-[13px] text-slate-600">
            {o.code} · {o.barangay}
            {o.contact ? ` · ${o.contact}` : ''}
          </p>
        </div>
        <Link
          to={`/owners/${o.id}`}
          onClick={() => closeMessages()}
          className="mt-1 inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-brand-dark underline"
        >
          Owner Record <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-slate-50/60 px-2">
        <MessageThread
          me="office"
          items={data.items}
          disabled={
            o.account ? undefined : 'This owner has no owner-app login, so they cannot read messages.'
          }
          onSend={async (text, files) => {
            try {
              const photoKeys = await Promise.all(files.map((f) => uploadFile(f, f.name, 'messages')));
              await api.post(`/api/messages/${ownerId}`, { text, photoKeys });
              await refetch();
              return true;
            } catch (x) {
              toast.error(x instanceof Error ? x.message : 'Could not send. Try again.');
              return false;
            }
          }}
        />
      </div>
    </div>
  );
}
