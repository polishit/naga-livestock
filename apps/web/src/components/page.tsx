import { ArrowLeft, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn, toTitle } from '@/lib/utils';
import { Spinner, VALUE_TONES, toneOptions, type Tone } from './ui';

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
    <div className={cn('mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            title="Back"
            className="-ml-2 mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 active:bg-slate-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-sub">{subtitle}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:flex-nowrap md:justify-end [&>button]:grow md:[&>button]:grow-0">
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

/**
 * The one filtering section of a list page: search and every filter in a single labelled row, with
 * "Clear Filters" when any is set. Used on its own or as the toolbar of a DataTable.
 */
export function FilterBar({
  children,
  onClear,
  active,
  className,
  bare,
}: {
  children: ReactNode;
  /** Resets every filter of the page. */
  onClear?: () => void;
  /** Whether any filter is set (shows the Clear button). */
  active?: boolean;
  className?: string;
  /** No card around it (inside a table card). */
  bare?: boolean;
}) {
  return (
    <div
      role="search"
      aria-label="Filters"
      className={cn('flex flex-wrap items-center gap-2', !bare && 'card mb-4 px-3 py-3', className)}
    >
      <span className="inline-flex items-center gap-1.5 pr-1 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
        <SlidersHorizontal className="h-4 w-4" /> Filter
      </span>
      {children}
      {onClear && active && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto inline-flex h-10 items-center gap-1 rounded-lg px-3 text-[14px] font-medium text-slate-600 hover:bg-slate-100"
        >
          <X className="h-4 w-4" /> Clear Filters
        </button>
      )}
    </div>
  );
}

/**
 * The rest of a page's filters, behind one "Filters" button (panel revision: one or two filters on
 * the page, the others in one place). Shows how many are set and clears them all at once.
 */
/** True inside the Filters panel: filters there show their label above the box. */
const InFilterPanel = createContext(false);

export function MoreFilters({
  children,
  active = 0,
  onClear,
  align = 'left',
}: {
  children: ReactNode;
  /** How many of the filters inside are set */
  active?: number;
  onClear?: () => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[15px] font-medium shadow-sm',
          active
            ? 'border-brand/50 bg-brand-light text-brand-dark'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {active > 0 && (
          <span className="min-w-[20px] rounded-full bg-brand-strong px-1.5 text-center text-[12px] font-semibold leading-5 text-white">
            {active}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          className={cn(
            'absolute z-[960] mt-2 w-[min(92vw,320px)] space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-pop [&_select]:w-full [&>*]:w-full',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <InFilterPanel.Provider value={true}>{children}</InFilterPanel.Provider>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {onClear ? (
              <button
                type="button"
                onClick={() => onClear()}
                disabled={!active}
                className="text-[14px] font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
              >
                Clear All
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-lg bg-brand-strong px-4 text-[14px] font-semibold text-white hover:bg-brand-dark"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A labelled control inside the Filters panel. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  all,
  className,
  label,
  tones = VALUE_TONES,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly (string | { value: string; label: string })[];
  all?: string;
  className?: string;
  label: string;
  /** Colour of each status / result value (defaults to the system-wide colour code). */
  tones?: Record<string, Tone>;
}) {
  const tone = value ? tones[value] : undefined;
  const inPanel = useContext(InFilterPanel);
  const box = (
    <div className={cn('relative', !inPanel && className)}>
      {tone && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full',
            FILTER_DOT[tone],
          )}
        />
      )}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-[15px] text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30',
          tone && cn('pl-7 font-medium', FILTER_TONE[tone]),
          // A filter that is set stands out from the ones left at "All".
          !tone && value && all && 'border-brand/50 bg-brand-light/50',
        )}
      >
        {all && <option value="">{all}</option>}
        {toneOptions(
          options.map((o) =>
            typeof o === 'string' ? (
              <option key={o} value={o}>
                {o}
              </option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          ),
          tones,
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
  return inPanel ? <FilterField label={label}>{box}</FilterField> : box;
}

const FILTER_TONE: Record<Tone, string> = {
  red: 'border-red-300 bg-red-50 text-red-800',
  redSoft: 'border-red-300 bg-red-50 text-red-800',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
  orange: 'border-orange-300 bg-orange-50 text-orange-800',
  blue: 'border-sky-300 bg-sky-50 text-sky-800',
  violet: 'border-violet-300 bg-violet-50 text-violet-800',
  slate: 'border-slate-300 bg-slate-100 text-slate-700',
};
const FILTER_DOT: Record<Tone, string> = {
  red: 'bg-red-500',
  redSoft: 'bg-red-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
};
