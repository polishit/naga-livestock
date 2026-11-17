import { Building2, ImagePlus, Send, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MAX_PHOTO_MB, fmtDate, fmtDateTime } from '@livestock/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

/**
 * The Messages thread between a livestock owner and the City Veterinary Office, used by both sides:
 * chat bubbles for messages, and small cards for the owner's transactions (what the owner sent and
 * what the office decided), in date order.
 */
export type ThreadItem =
  | {
      kind: 'message';
      id: number;
      at: string;
      fromOwner: boolean;
      by: string;
      text: string;
      photos: { key: string; url: string }[];
      read: boolean;
    }
  | {
      kind: 'event';
      key: string;
      at: string;
      side: 'owner' | 'office';
      title: string;
      body?: string | null;
      link?: string | null;
    };

export function MessageThread({
  items,
  /** Whose screen this is: their own messages are on the right */
  me,
  onSend,
  disabled,
  big,
}: {
  items: ThreadItem[];
  me: 'owner' | 'office';
  onSend: (text: string, files: File[]) => Promise<boolean>;
  disabled?: string;
  /** Larger text and buttons (owner app) */
  big?: boolean;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useObjectUrls(files);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [items.length]);
  let lastDay = '';
  const send = async () => {
    if (!text.trim() && !files.length) return;
    setBusy(true);
    const ok = await onSend(text.trim(), files);
    setBusy(false);
    if (ok) {
      setText('');
      setFiles([]);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-2" aria-live="polite">
        {items.length === 0 && (
          <p className="py-8 text-center text-[15px] text-slate-500">
            No messages yet. Write below to start the conversation.
          </p>
        )}
        {items.map((it) => {
          const day = fmtDate(it.at);
          const header =
            day !== lastDay ? (
              <div className="py-1 text-center text-[12px] font-medium text-slate-500">{(lastDay = day)}</div>
            ) : null;
          if (it.kind === 'event')
            return (
              <div key={it.key}>
                {header}
                <EventCard e={it} big={big} />
              </div>
            );
          const mine = it.fromOwner === (me === 'owner');
          return (
            <div key={`m${it.id}`}>
              {header}
              <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[70%]',
                    mine
                      ? 'rounded-br-md bg-brand-strong text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white',
                  )}
                >
                  {!mine && <div className="mb-0.5 text-[12px] font-semibold text-brand-dark">{it.by}</div>}
                  {it.text && (
                    <p className={cn('whitespace-pre-line break-words', big ? 'text-[16px]' : 'text-[15px]')}>
                      {it.text}
                    </p>
                  )}
                  {it.photos.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {it.photos.map((p) => (
                        <a key={p.key} href={p.url} target="_blank" rel="noreferrer">
                          <img
                            src={p.url}
                            alt="Attached photo"
                            className="h-28 w-28 rounded-lg object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <div
                    className={cn('mt-0.5 text-right text-[11px]', mine ? 'text-white/75' : 'text-slate-400')}
                  >
                    {fmtDateTime(it.at).replace(/^.*?(\d{1,2}:\d{2}\s?[AP]M)$/i, '$1')}
                    {mine && me === 'office' ? ` · ${it.by}` : ''}
                    {mine && it.read ? ' · Seen' : ''}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {disabled ? (
        <p className="border-t border-slate-200 bg-slate-50 px-3 py-3 text-[14px] text-slate-600">
          {disabled}
        </p>
      ) : (
        <div className="border-t border-slate-200 bg-white px-2 pb-2 pt-2">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              {previews.map((u, i) => (
                <span key={u} className="relative">
                  <img src={u} alt={`Photo ${i + 1} to send`} className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-0.5 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label="Attach photos"
              title="Attach photos"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100',
                big ? 'h-12 w-12' : 'h-10 w-10',
              )}
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = '';
                const ok = picked.filter((f) => f.size <= MAX_PHOTO_MB * 1024 * 1024);
                if (ok.length < picked.length)
                  toast.error(`Each photo must be ${MAX_PHOTO_MB} MB or smaller.`);
                setFiles([...files, ...ok].slice(0, 5));
              }}
            />
            <textarea
              aria-label="Message"
              rows={1}
              value={text}
              placeholder="Write a message…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !big) {
                  e.preventDefault();
                  void send();
                }
              }}
              className={cn(
                'max-h-40 min-h-0 flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand-strong/30',
                big ? 'text-[16px]' : 'text-[15px]',
              )}
            />
            <Button
              aria-label="Send"
              className={cn('shrink-0 rounded-full', big ? 'h-12 w-12' : 'h-10 w-10')}
              size="icon"
              loading={busy}
              disabled={!text.trim() && !files.length}
              onClick={() => void send()}
            >
              <Send />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ e, big }: { e: Extract<ThreadItem, { kind: 'event' }>; big?: boolean }) {
  const office = e.side === 'office';
  const inner = (
    <div
      className={cn(
        'mx-auto flex max-w-[92%] items-start gap-2.5 rounded-xl border px-3 py-2 text-left sm:max-w-[80%]',
        office ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50',
        e.link && 'hover:shadow-sm',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          office ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700',
        )}
      >
        {office ? <Building2 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className={cn('block font-semibold text-slate-900', big ? 'text-[15px]' : 'text-[14px]')}>
          {e.title}
        </span>
        {e.body && (
          <span
            className={cn(
              'line-clamp-3 block whitespace-pre-line text-slate-600',
              big ? 'text-[14px]' : 'text-[13px]',
            )}
          >
            {e.body}
          </span>
        )}
        <span className="block text-[11px] text-slate-400">
          {office ? 'City Veterinary Office' : 'Sent by the owner'} ·{' '}
          {fmtDateTime(e.at).replace(/^.*?(\d{1,2}:\d{2}\s?[AP]M)$/i, '$1')}
        </span>
      </span>
    </div>
  );
  return e.link ? (
    <Link to={e.link} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function useObjectUrls(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);
  return urls;
}
