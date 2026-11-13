import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BARANGAYS, SPECIES } from '@livestock/shared';
import { FilterSelect, PageHeader } from '@/components/page';
import { Badge, Card, EmptyState, Spinner, type Tone } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface Hit {
  type: string;
  label: string;
  sub: string;
  href: string;
  barangay?: string;
  species?: string;
}

const TYPES: { value: string; label: string; hit: string; tone: Tone }[] = [
  { value: 'owner', label: 'Owners', hit: 'Owner', tone: 'green' },
  { value: 'farm', label: 'Farms', hit: 'Farm', tone: 'green' },
  { value: 'animal', label: 'Animals / ear tags', hit: 'Animal', tone: 'blue' },
  { value: 'case', label: 'Disease cases', hit: 'Case', tone: 'red' },
  { value: 'sample', label: 'Lab samples', hit: 'Sample', tone: 'violet' },
  { value: 'submission', label: 'Lab batches', hit: 'Lab batch', tone: 'violet' },
  { value: 'stray', label: 'Strays', hit: 'Stray', tone: 'orange' },
];
const toneOf = (t: string) => TYPES.find((x) => x.hit === t)?.tone ?? 'slate';

/**
 * One place to find any record: owners (name, RSBSA no.), farms, animals (ear tag, certificate),
 * disease cases, lab samples and batches, and strays — narrowed by type, barangay and species.
 */
export default function SearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const type = params.get('type') ?? '';
  const barangay = params.get('barangay') ?? '';
  const species = params.get('species') ?? '';
  const [debounced, setDebounced] = useState(q.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = debounced.length >= 2 || !!barangay || !!species;
  const query = new URLSearchParams({
    q: debounced,
    limit: '50',
    ...(type ? { type } : {}),
    ...(barangay ? { barangay } : {}),
    ...(species ? { species } : {}),
  });
  const { data, isFetching } = useApi<Hit[]>(ready ? `/api/search?${query}` : null);
  const hits = data ?? [];
  const counts = TYPES.map((t) => ({ ...t, n: hits.filter((h) => h.type === t.hit).length }));
  return (
    <div>
      <PageHeader
        title="Search"
        subtitle="Find any record: owner, RSBSA no., farm, ear tag, ownership certificate, case, lab sample or batch, stray."
      />
      <Card className="p-4 sm:p-5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a name, code, ear tag, RSBSA no., sample ID…"
            aria-label="Search everything"
            className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-11 pr-3 text-[16px] placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <FilterSelect
            label="Record type"
            value={type}
            onChange={(v) => set('type', v)}
            all="All record types"
            options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
          <FilterSelect
            label="Barangay"
            value={barangay}
            onChange={(v) => set('barangay', v)}
            all="All barangays"
            options={BARANGAYS}
          />
          <FilterSelect
            label="Species"
            value={species}
            onChange={(v) => set('species', v)}
            all="All species"
            options={SPECIES}
          />
        </div>
      </Card>
      <div className="mt-4">
        {!ready ? (
          <EmptyState>
            Type at least 2 letters, or choose a barangay or species to list its records.
          </EmptyState>
        ) : isFetching && !data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !hits.length ? (
          <EmptyState>No records match. Check the spelling or clear a filter.</EmptyState>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-[14px] text-slate-600 sm:px-5">
              <span className="font-medium text-slate-900">{hits.length} result(s)</span>
              {counts
                .filter((c) => c.n)
                .map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set('type', type === c.value ? '' : c.value)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 transition-colors',
                      type === c.value
                        ? 'border-brand bg-brand-light text-brand-dark'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {c.label} {c.n}
                  </button>
                ))}
            </div>
            <ul className="divide-y divide-slate-100">
              {hits.map((h, i) => (
                <li key={`${h.href}-${i}`}>
                  <button
                    type="button"
                    onClick={() => navigate(h.href)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
                  >
                    <Badge tone={toneOf(h.type)} className="w-[86px] justify-center">
                      {h.type}
                    </Badge>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-slate-900">{h.label}</span>
                      <span className="block truncate text-[13px] text-slate-500">{h.sub}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {hits.length >= 50 && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-[13px] text-slate-500 sm:px-5">
                Showing the first matches of each type. Narrow the search to see more.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
