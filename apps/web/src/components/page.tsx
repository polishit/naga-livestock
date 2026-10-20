import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Spinner } from './ui';

/**
 * Page title row. Inner pages (e.g. /farms/12, /cases/new) automatically get a Back button that returns to
 * the previous screen, or to the list page (/farms) when the page was opened directly.
 * Pass `back={false}` to hide it, or `back="/somewhere"` to choose the fallback page.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  back?: boolean | string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.split('/').filter(Boolean);
  const fallback = typeof back === 'string' ? back : segments.length > 1 ? `/${segments[0]}` : null;
  const showBack = back !== false && (back === true || fallback !== null);
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback ?? '/');
  };
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            className="mb-1.5 inline-flex items-center gap-1 rounded-md py-0.5 pr-1.5 text-[13.5px] font-medium text-slate-600 hover:text-brand-dark"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'green',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: 'green' | 'red' | 'blue' | 'orange';
  className?: string;
}) {
  const toneCls = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-sky-50 text-sky-600',
    orange: 'bg-orange-50 text-orange-600',
  }[tone];
  return (
    <div className={cn('card flex min-h-[96px] items-start justify-between gap-3 p-4', className)}>
      <div className="min-w-0">
        <div className="text-[13px] text-slate-600">{label}</div>
        <div className="mt-1.5 text-[24px] font-semibold leading-tight text-slate-900">{value}</div>
        {sub && <div className="mt-1 text-[12px] text-slate-500">{sub}</div>}
      </div>
      {Icon && (
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', toneCls)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
      )}
    </div>
  );
}

export function MiniStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="card px-3 py-2.5">
      <div className="text-[12.5px] text-slate-600">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt>{k}</dt>
          <dd className="min-w-0 break-words">{v === null || v === undefined || v === '' ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Loading() {
  return (
    <div className="flex h-60 items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {error instanceof Error ? error.message : 'Could not load data.'}
    </div>
  );
}

export function SummaryChips({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-4">
      {items.map((s, i) => (
        <span key={i} className="rounded-md bg-slate-100 px-3 py-1.5 text-[14.5px] text-slate-600">
          {s.label}: <b className="font-semibold text-slate-900">{s.value}</b>
        </span>
      ))}
    </div>
  );
}

export function Timeline({
  items,
}: {
  items: { key: string | number; meta: ReactNode; title: ReactNode; body?: ReactNode; tag?: ReactNode }[];
}) {
  return (
    <ol className="relative px-4 py-3">
      {items.map((it, i) => (
        <li key={it.key} className="relative pb-4 pl-6 last:pb-1">
          {i < items.length - 1 && <span className="absolute left-[4px] top-3 h-full w-px bg-slate-200" />}
          <span className="absolute left-0 top-[7px] h-[9px] w-[9px] rounded-full bg-brand-dark" />
          <div className="text-[12.5px] text-slate-400">{it.meta}</div>
          <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-slate-900">
            {it.title}
            {it.tag && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-normal text-slate-700">
                {it.tag}
              </span>
            )}
          </div>
          {it.body && <div className="text-[15px] text-slate-600">{it.body}</div>}
        </li>
      ))}
    </ol>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  all,
  className,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly (string | { value: string; label: string })[];
  all?: string;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-9 text-[15px] text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        {all && <option value="">{all}</option>}
        {options.map((o) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
