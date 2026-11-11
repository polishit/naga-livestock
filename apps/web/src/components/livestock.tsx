import { useEffect, useState, type ReactNode } from 'react';
import {
  CLASSIFICATIONS,
  MONITORED_DISEASES,
  RECORD_SOURCE_LABELS,
  SPECIES_COLORS,
  VISIT_PURPOSE_LABELS,
  fmtDate,
  summarizeBreakdown,
  type Breakdown,
  type RecordSource,
  type Species,
  type VisitPurpose,
} from '@livestock/shared';
import { cn } from '@/lib/utils';
import { Badge, Input, Select, type Tone } from './ui';

const RAISED_TONE: Record<string, Tone> = {
  Piggery: 'redSoft',
  'Cattle Only': 'amber',
  'Carabao Only': 'slate',
  'Goat Only': 'green',
  'Sheep Only': 'green',
  Poultry: 'orange',
  Mixed: 'blue',
  'No Livestock Yet': 'slate',
};

/** Type of livestock raised: Piggery, Cattle Only, Goat Only, Mixed… */
export function RaisedBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <Badge tone={RAISED_TONE[value] ?? 'slate'}>{value}</Badge>;
}

export const sourceLabel = (s: string | null | undefined) =>
  s ? (RECORD_SOURCE_LABELS[s as RecordSource] ?? s) : null;

export const purposeLabel = (p: string | null | undefined) =>
  p ? (VISIT_PURPOSE_LABELS[p as VisitPurpose] ?? p) : null;

/** "Visited 12 Oct 2026 · Deworming" or "Not visited yet" (amber). */
export function LastVisit({ at, purpose }: { at: string | null; purpose?: string | null }) {
  if (!at) return <span className="text-amber-700">Not visited yet</span>;
  return (
    <span className="whitespace-nowrap">
      {fmtDate(at)}
      {purpose ? <span className="text-slate-500"> · {purposeLabel(purpose)}</span> : null}
    </span>
  );
}

/** Horizontal bars of head per classification (age, sex, production stage) for one species. */
export function BreakdownBars({
  species,
  total,
  breakdown,
  compact,
}: {
  species: string;
  total: number;
  breakdown: Breakdown | null | undefined;
  compact?: boolean;
}) {
  const list = CLASSIFICATIONS[species as Species] ?? CLASSIFICATIONS.Other;
  const s = summarizeBreakdown(species, breakdown);
  const color = SPECIES_COLORS[species as Species] ?? '#64748b';
  if (!s.total) return <p className="text-[13px] text-slate-500">Not classified yet (age, sex and stage).</p>;
  const max = Math.max(...s.byStage.map((x) => x.count), 1);
  return (
    <div>
      <ul className={cn('space-y-1.5', compact && 'space-y-1')}>
        {list.map((c) => {
          const n = breakdown?.[c.code] ?? 0;
          if (compact && !n) return null;
          return (
            <li key={c.code} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-[13px]">
              <span className="truncate text-slate-600" title={`${c.sex} · ${c.age}`}>
                {c.label}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(n / max) * 100}%`, background: color }}
                />
              </span>
              <span className="text-right font-medium text-slate-800">{n}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
        {Object.entries(s.bySex).map(([k, n]) => (
          <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
            {k} {n}
          </span>
        ))}
        {Object.entries(s.byAge).map(([k, n]) => (
          <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
            {k} {n}
          </span>
        ))}
        {s.total !== total && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
            {total > s.total ? `${total - s.total} not classified` : 'Classification needs updating'}
          </span>
        )}
      </div>
    </div>
  );
}

/** A card for one species on a farm: head count, classification bars and actions. */
export function SpeciesCard({
  species,
  count,
  breed,
  breakdown,
  meta,
  actions,
}: {
  species: string;
  count: number;
  breed?: string | null;
  breakdown?: Breakdown | null;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const color = SPECIES_COLORS[species as Species] ?? '#64748b';
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="text-[15.5px] font-semibold text-slate-900">{species}</span>
          </div>
          {breed && <div className="mt-0.5 text-[13px] text-slate-500">{breed}</div>}
        </div>
        <div className="text-right">
          <div className="text-[24px] font-semibold leading-none text-slate-900">{count}</div>
          <div className="text-[12px] text-slate-500">head</div>
        </div>
      </div>
      <div className="mt-3 flex-1">
        <BreakdownBars species={species} total={count} breakdown={breakdown} />
      </div>
      {meta && <div className="mt-3 text-[12.5px] text-slate-500">{meta}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">{actions}</div>}
    </div>
  );
}

/** Vertical timeline used for farm visits, services and case progress. */
export function ActivityTimeline({
  items,
  empty,
}: {
  items: {
    key: string | number;
    date: string;
    title: ReactNode;
    tag?: ReactNode;
    body?: ReactNode;
    tone?: 'green' | 'red' | 'blue' | 'amber' | 'slate';
    actions?: ReactNode;
  }[];
  empty?: ReactNode;
}) {
  if (!items.length) return <p className="px-4 py-8 text-center text-[14.5px] text-slate-500">{empty}</p>;
  const dot = {
    green: 'bg-emerald-500',
    red: 'bg-red-500',
    blue: 'bg-sky-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-400',
  };
  return (
    <ol className="relative px-4 py-3">
      {items.map((it, i) => (
        <li key={it.key} className="relative pb-5 pl-7 last:pb-1">
          {i < items.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />}
          <span
            className={cn(
              'absolute left-0 top-[6px] h-[11px] w-[11px] rounded-full ring-4 ring-white',
              dot[it.tone ?? 'slate'],
            )}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] text-slate-500">{fmtDate(it.date)}</div>
              <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-slate-900">
                {it.title}
                {it.tag}
              </div>
              {it.body && <div className="mt-0.5 text-[14px] text-slate-600">{it.body}</div>}
            </div>
            {it.actions && <div className="flex shrink-0 gap-1">{it.actions}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Disease pick-list: the diseases the office monitors (ASF first), plus "Other" with a text box.
 * Works with react-hook-form through `value` / `onChange` (e.g. form.watch + form.setValue).
 */
export function DiseasePicker({
  value,
  onChange,
  invalid,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  id?: string;
}) {
  const listed = (MONITORED_DISEASES as readonly string[]).includes(value);
  const [other, setOther] = useState(!!value && !listed);
  useEffect(() => {
    if (value && !(MONITORED_DISEASES as readonly string[]).includes(value)) setOther(true);
  }, [value]);
  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        aria-invalid={invalid}
        aria-label="Suspected disease"
        value={other ? '__other' : value}
        onChange={(e) => {
          if (e.target.value === '__other') {
            setOther(true);
            onChange('');
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Select disease...</option>
        {MONITORED_DISEASES.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
        <option value="__other">Other disease (type it)</option>
      </Select>
      {other && (
        <Input
          aria-label="Other disease"
          placeholder="Type the suspected disease"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      )}
    </div>
  );
}
