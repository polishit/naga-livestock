import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn, toTitle } from '@/lib/utils';
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
            className="mb-1.5 inline-flex items-center gap-1 rounded-lg py-0.5 pr-1.5 text-[14px] font-medium text-slate-600 hover:text-brand-dark"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end [&>button]:grow sm:[&>button]:grow-0">
          {actions}
        </div>
      )}
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
  to,
  onClick,
  active,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: 'green' | 'red' | 'blue' | 'orange';
  className?: string;
  /** Opens this page when the box is clicked (the records behind the number). */
  to?: string;
  /** Runs when the box is clicked (e.g. filter the list below). */
  onClick?: () => void;
  /** Highlights the box (its filter is on). */
  active?: boolean;
}) {
  const toneCls = {
    green: 'bg-brand-light text-brand-dark',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-sky-50 text-sky-600',
    orange: 'bg-orange-50 text-orange-600',
  }[tone];
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneCls)}>
            <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0 pt-1.5 text-[13px] font-medium leading-snug text-slate-600">
          {typeof label === 'string' ? toTitle(label) : label}
        </div>
      </div>
      <div className="mt-2.5 text-[26px] font-semibold leading-none tracking-tight text-slate-900">
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[13px] leading-snug text-slate-500">{sub}</div>}
    </>
  );
  const cls = cn(
    'card flex h-full w-full flex-col justify-start p-4 text-left',
    (to || onClick) &&
      'transition hover:ring-2 hover:ring-brand/40 focus-visible:ring-2 focus-visible:ring-brand',
    active && 'ring-2 ring-brand',
    className,
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

export function MiniStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="card px-3 py-2.5">
      <div className="text-[13px] text-slate-600">{typeof label === 'string' ? toTitle(label) : label}</div>
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
        <span key={i} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[15px] text-slate-600">
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
          <div className="text-[13px] text-slate-400">{it.meta}</div>
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
        className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-[15px] text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
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
