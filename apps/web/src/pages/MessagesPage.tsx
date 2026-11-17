import { ExternalLink, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { fmtDate } from '@livestock/shared';
import { api, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { MessageThread, type ThreadItem } from '@/components/MessageThread';
import { ErrorBox, Loading, PageHeader } from '@/components/page';
import { Badge, Card, EmptyState, Input } from '@/components/ui';

/**
 * Messages with livestock owners. Each owner has one conversation that also shows their
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

export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const ownerId = Number(params.get('owner')) || null;
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useApi<Conversation[]>('/api/messages', { refetchInterval: 30_000 });
  const select = (id: number | null) => setParams(id ? { owner: String(id) } : {}, { replace: true });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const term = q.trim().toLowerCase();
  const rows = term
    ? data.filter((c) => `${c.fullName} ${c.code} ${c.barangay}`.toLowerCase().includes(term))
    : data;
  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Conversations with livestock owners who use the owner app. Each conversation also shows what the owner sent and what the office decided. Replies are signed as the City Veterinary Office."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start">
        <Card className={cn('overflow-hidden', ownerId && 'hidden lg:block')}>
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
          </div>
          <div className="max-h-[calc(100dvh-280px)] overflow-y-auto">
            {rows.length === 0 && <EmptyState>No owner uses the owner app yet.</EmptyState>}
            {rows.map((c) => (
              <button
                key={c.ownerId}
                type="button"
                onClick={() => select(c.ownerId)}
                aria-current={ownerId === c.ownerId ? 'true' : undefined}
                className={cn(
                  'block w-full border-b border-l-4 border-b-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50',
                  ownerId === c.ownerId ? 'border-l-brand-strong bg-brand-light/60' : 'border-l-transparent',
                )}
              >
                <div className="flex items-start justify-between gap-2">
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
                </div>
                <p
                  className={cn(
                    'mt-0.5 truncate text-[14px]',
                    c.unread ? 'font-medium text-slate-800' : 'text-slate-600',
                  )}
                >
                  {c.last
                    ? `${c.last.fromOwner ? '' : 'Office: '}${c.last.text}`
                    : `${c.barangay} · no messages yet`}
                </p>
              </button>
            ))}
          </div>
        </Card>
        {ownerId ? (
          <ThreadPanel ownerId={ownerId} onBack={() => select(null)} />
        ) : (
          <Card className="hidden lg:block">
            <EmptyState>Select an owner to open the conversation.</EmptyState>
          </Card>
        )}
      </div>
    </div>
  );
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
  if (isLoading)
    return (
      <Card>
        <Loading />
      </Card>
    );
  if (error || !data) return <ErrorBox error={error} />;
  const o = data.owner;
  return (
    <Card className="flex h-[calc(100dvh-220px)] min-h-[480px] flex-col overflow-hidden">
      <div className="flex items-start gap-2 border-b border-slate-100 px-3 py-3">
        <BackButton onClick={onBack} label="Back to the conversations" className="-ml-1" />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold leading-tight">{o.fullName}</h2>
            {o.status === 'PENDING' && <Badge tone="amber">Not Verified Yet</Badge>}
          </div>
          <p className="text-[14px] text-slate-600">
            {o.code} · {o.barangay}
            {o.contact ? ` · ${o.contact}` : ''}
          </p>
        </div>
        <Link
          to={`/owners/${o.id}`}
          className="mt-1 inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-brand-dark underline"
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
    </Card>
  );
}
