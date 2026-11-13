import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { addMonths, fmtDate, fmtMonth, isoDate, isoMonth } from '@livestock/shared';
import { cn } from '@/lib/utils';
import { Button } from './ui';

export interface CalendarItem {
  id: string | number;
  /** YYYY-MM-DD */
  date: string;
  /** Short text on the calendar (e.g. "Deworming · Goat"). */
  label: string;
  /** Details shown in the list for the chosen day. */
  detail?: ReactNode;
  /** Chip colour. */
  tone: 'blue' | 'amber' | 'green' | 'violet' | 'slate' | 'red';
  /** Button in the day list (e.g. open the farm). */
  action?: ReactNode;
}

const CHIP: Record<CalendarItem['tone'], string> = {
  blue: 'bg-sky-100 text-sky-800',
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-emerald-100 text-brand-dark',
  violet: 'bg-violet-100 text-violet-800',
  slate: 'bg-slate-100 text-slate-700',
  red: 'bg-red-100 text-red-800',
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Chips shown in a day box before "+ n more". */
const PER_DAY = 3;

/** A month calendar with the schedule on each date; select a day to see its full list below. */
export function ScheduleCalendar({ items, empty }: { items: CalendarItem[]; empty?: ReactNode }) {
  const [month, setMonth] = useState(isoMonth());
  const [day, setDay] = useState<string | null>(null);
  const today = isoDate();
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    return m;
  }, [items]);

  // Weeks of the month, Sunday first, padded with the days of the months around it.
  const first = new Date(`${month}-01T00:00:00`);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return isoDate(d);
  });
  const weeks = cells[35].slice(0, 7) === month ? 6 : 5;
  const inMonth = items.filter((it) => it.date.startsWith(month)).length;
  const list = day ? (byDate.get(day) ?? []) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous month"
            onClick={() => {
              setMonth(addMonths(month, -1));
              setDay(null);
            }}
          >
            <ChevronLeft />
          </Button>
          <div
            className="min-w-[150px] text-center text-[16px] font-semibold text-slate-900"
            aria-live="polite"
          >
            {fmtMonth(month)}
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next month"
            onClick={() => {
              setMonth(addMonths(month, 1));
              setDay(null);
            }}
          >
            <ChevronRight />
          </Button>
          {month !== isoMonth() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMonth(isoMonth());
                setDay(null);
              }}
            >
              Today
            </Button>
          )}
        </div>
        <span className="text-[13px] text-slate-500">
          {inMonth} scheduled in {fmtMonth(month)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[12px] font-semibold text-slate-500">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.slice(0, weeks * 7).map((d) => {
              const its = byDate.get(d) ?? [];
              const other = !d.startsWith(month);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(day === d ? null : d)}
                  aria-label={`${fmtDate(d)}: ${its.length} scheduled`}
                  aria-pressed={day === d}
                  className={cn(
                    'flex min-h-[96px] flex-col items-stretch justify-start border-b border-r border-slate-100 p-1.5 text-left hover:bg-slate-50',
                    other && 'bg-slate-50/60 text-slate-400',
                    day === d && 'bg-brand-light ring-2 ring-inset ring-brand',
                  )}
                >
                  <div
                    className={cn(
                      'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[13px]',
                      d === today ? 'bg-brand font-semibold text-white' : 'text-slate-600',
                    )}
                  >
                    {Number(d.slice(8))}
                  </div>
                  <div className="space-y-0.5">
                    {its.slice(0, PER_DAY).map((it) => (
                      <div
                        key={it.id}
                        className={cn(
                          'truncate rounded px-1.5 py-0.5 text-[12px] font-medium',
                          CHIP[it.tone],
                        )}
                        title={it.label}
                      >
                        {it.label}
                      </div>
                    ))}
                    {its.length > PER_DAY && (
                      <div className="px-1.5 text-[12px] font-medium text-slate-500">
                        + {its.length - PER_DAY} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="px-4 py-3">
        {day ? (
          <>
            <div className="mb-2 text-[14px] font-semibold text-slate-900">{fmtDate(day)}</div>
            {list.length ? (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {list.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', CHIP[it.tone])}>
                        {it.label}
                      </span>
                      {it.detail && <div className="mt-1 text-[14px] text-slate-600">{it.detail}</div>}
                    </div>
                    {it.action}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-slate-500">Nothing scheduled on this day.</p>
            )}
          </>
        ) : (
          <p className="text-[14px] text-slate-500">
            {items.length ? 'Select a day to see what is scheduled.' : empty}
          </p>
        )}
      </div>
    </div>
  );
}
