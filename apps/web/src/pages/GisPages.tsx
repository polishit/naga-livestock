import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Info,
  Pause,
  Play,
  Plus,
  Radar,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BARANGAYS,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  LIVESTOCK_RAISED,
  MONITORED_DISEASES,
  RADIUS_PRESETS,
  SPECIES,
  addMonths,
  caseMarkerKind,
  distanceMeters,
  fmtDate,
  fmtMonth,
  fmtNumber,
  isoMonth,
  formatRadius,
  type ReportResult,
} from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi, useBarangayShapes } from '@/lib/hooks';
import { cn, qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { ExportButtons } from '@/components/ExportButtons';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, PageHeader, StatCard } from '@/components/page';
import { CaseLegend, CaseStatusBadge, MapLegend, SpeciesChip } from '@/components/status';
import { Badge, Button, Card, CardHeader, Checkbox, Input, Tabs } from '@/components/ui';
import { CaseLocationDialog } from '@/dialogs/surveillance';
import { FarmVisitLauncher } from '@/dialogs/services';
import { LastVisit, RaisedBadge } from '@/components/livestock';
import type { CaseRow, FarmSummary, RadiusResult } from './types';

/* ---------------- Livestock & disease map ---------------- */

/** The map and the barangay summary are one menu item with two tabs. */
function MapTabs({ value }: { value: 'farms' | 'barangays' }) {
  const navigate = useNavigate();
  return (
    <Tabs
      className="mb-4"
      value={value}
      onChange={(t) => navigate(t === 'farms' ? '/gis-map' : '/barangay-map')}
      tabs={[
        { id: 'farms', label: 'Map' },
        { id: 'barangays', label: 'Barangay Summary' },
      ]}
    />
  );
}

/** Monitoring colours used on the map and in the "farms to monitor" list. */
const MONITOR_RING = { NOT_VISITED: '#f59e0b', NO_SIGNS: '#16a34a', SICK_ANIMALS: '#dc2626' } as const;
const MONITOR_LABEL = {
  NOT_VISITED: 'Not yet visited',
  NO_SIGNS: 'Visited — no signs',
  SICK_ANIMALS: 'Sick animals found',
} as const;

export function GisMapPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [barangay, setBarangay] = useState(params.get('barangay') ?? '');
  const [species, setSpecies] = useState('');
  const [raised, setRaised] = useState('');
  const [disease, setDisease] = useState('');
  const [caseState, setCaseState] = useState<'open' | 'all'>('open');
  const [radius, setRadius] = useState(1000);
  const [layers, setLayers] = useState({
    farms: true,
    cases: true,
    population: false,
    radius: true,
    strays: false,
  });
  const [selected, setSelected] = useState<{ kind: 'farm' | 'case'; id: number } | null>(
    params.get('case') ? { kind: 'case', id: Number(params.get('case')) } : null,
  );
  const [visitFarm, setVisitFarm] = useState<{ id: number; caseId?: number } | null>(null);
  const { data: farms } = useApi<FarmSummary[]>(`/api/farms${qs({ barangay })}`);
  const { data: cases } = useApi<CaseRow[]>(`/api/cases${qs({ barangay, species, state: caseState })}`);
  const { data: strays } = useApi<
    { id: number; code: string; species: string; lat: number | null; lng: number | null; barangay: string }[]
  >(layers.strays ? `/api/strays${qs({ barangay })}` : null);
  const { data: shapes } = useBarangayShapes();

  const shownFarms = useMemo(
    () =>
      (farms ?? [])
        .filter((f) => f.mapped)
        .filter((f) => !species || f.species.some((s) => s.species === species && s.count > 0))
        .filter((f) => !raised || f.livestockRaised === raised)
        .filter((f) => !q || `${f.name} ${f.ownerName} ${f.code}`.toLowerCase().includes(q.toLowerCase())),
    [farms, species, raised, q],
  );
  const shownCases = (cases ?? []).filter((c) => !disease || c.disease === disease);
  const mappedCases = shownCases.filter((c) => c.mapped);
  const diseases = [...new Set([...MONITORED_DISEASES, ...(cases ?? []).map((c) => c.disease)])];
  const head = shownFarms.reduce(
    (a, f) => a + (species ? (f.species.find((s) => s.species === species)?.count ?? 0) : f.total),
    0,
  );

  // Livestock per barangay for the population layer (same filters as the farms).
  const popByBarangay = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of farms ?? []) {
      if (raised && f.livestockRaised !== raised) continue;
      const n = species ? (f.species.find((s) => s.species === species)?.count ?? 0) : f.total;
      m.set(f.barangay, (m.get(f.barangay) ?? 0) + n);
    }
    return m;
  }, [farms, species, raised]);
  const popMax = Math.max(0, ...popByBarangay.values());
  const popBreaks = classBreaks(popMax);
  const popFill = (b: string) => {
    const v = popByBarangay.get(b) ?? 0;
    if (!v) return ZERO_FILL;
    const k = Math.max(
      0,
      popBreaks.findIndex(([lo, hi]) => v >= lo && v <= hi),
    );
    const pal = GREENS();
    return pal[
      popBreaks.length === 1 ? 3 : Math.round((k * (pal.length - 1)) / Math.max(1, popBreaks.length - 1))
    ];
  };

  const selCase = selected?.kind === 'case' ? (cases ?? []).find((c) => c.id === selected.id) : undefined;
  const selFarm = selected?.kind === 'farm' ? (farms ?? []).find((f) => f.id === selected.id) : undefined;
  // Farms within the radius of the selected case (straight-line distance), nearest first.
  const nearSel = useMemo(() => {
    if (!selCase?.mapped) return [];
    return (farms ?? [])
      .filter((f) => f.mapped)
      .map((f) => ({ f, d: Math.round(distanceMeters(selCase.lat!, selCase.lng!, f.lat!, f.lng!)) }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => a.d - b.d);
  }, [selCase, farms, radius]);

  const ringCases = layers.radius ? (selCase?.mapped ? [selCase] : mappedCases.filter((c) => !c.closed)) : [];

  // The side lists show only what is being filtered: a disease filter shows the disease reports,
  // a farm search or "livestock raised" filter shows the farms. Barangay and livestock apply to both.
  const farmFilter = !!q || !!raised;
  const caseFilter = !!disease || caseState === 'all';
  const showCaseList = layers.cases && (!farmFilter || caseFilter);
  const showFarmList = layers.farms && (!caseFilter || farmFilter);
  const anyFilter = farmFilter || caseFilter || !!barangay || !!species;
  const clearFilters = () => {
    setQ('');
    setBarangay('');
    setDisease('');
    setSpecies('');
    setRaised('');
    setCaseState('open');
  };

  return (
    <div>
      <PageHeader
        title="Livestock & Disease Map"
        subtitle={`${shownFarms.length} farms · ${fmtNumber(head)} head · ${mappedCases.length} disease reports on the map`}
      />
      <MapTabs value="farms" />
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search farm or owner"
            className="w-full sm:w-52"
            aria-label="Search farm or owner"
          />
          <FilterSelect
            label="Barangay"
            value={barangay}
            onChange={setBarangay}
            options={BARANGAYS}
            all="All barangays"
            className="w-[calc(50%-4px)] sm:w-44"
          />
          <FilterSelect
            label="Disease"
            value={disease}
            onChange={setDisease}
            options={diseases}
            all="All diseases"
            className="w-[calc(50%-4px)] sm:w-56"
          />
          <FilterSelect
            label="Livestock"
            value={species}
            onChange={setSpecies}
            options={SPECIES}
            all="All livestock"
            className="w-[calc(50%-4px)] sm:w-36"
          />
          <FilterSelect
            label="Farm (livestock raised)"
            value={raised}
            onChange={setRaised}
            options={LIVESTOCK_RAISED}
            all="All farms"
            className="w-[calc(50%-4px)] sm:w-40"
          />
          <FilterSelect
            label="Reports"
            value={caseState}
            onChange={(v) => setCaseState((v || 'open') as 'open' | 'all')}
            options={[
              { value: 'open', label: 'Open reports' },
              { value: 'all', label: 'All reports (incl. closed)' },
            ]}
            className="w-full sm:w-52"
          />
          {anyFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X /> Clear filters
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Layers</span>
          <Checkbox
            label="Farms"
            checked={layers.farms}
            onChange={(v) => setLayers((l) => ({ ...l, farms: v }))}
          />
          <Checkbox
            label="Disease reports"
            checked={layers.cases}
            onChange={(v) => setLayers((l) => ({ ...l, cases: v }))}
          />
          <Checkbox
            label="Livestock population (by barangay)"
            checked={layers.population}
            onChange={(v) => setLayers((l) => ({ ...l, population: v }))}
          />
          <Checkbox
            label="Radius rings"
            checked={layers.radius}
            onChange={(v) => setLayers((l) => ({ ...l, radius: v }))}
          />
          {layers.radius && (
            <span className="inline-flex flex-wrap gap-1" role="group" aria-label="Radius">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={radius === r}
                  onClick={() => setRadius(r)}
                  className={cn(
                    'h-8 rounded-lg border px-2.5 text-[13px]',
                    radius === r
                      ? 'border-brand-strong bg-brand-strong text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {formatRadius(r)}
                </button>
              ))}
            </span>
          )}
          <Checkbox
            label="Stray incidents"
            checked={layers.strays}
            onChange={(v) => setLayers((l) => ({ ...l, strays: v }))}
          />
        </div>
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <CaseLegend includeSpecies>
            {layers.strays && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: '#7c3aed' }} />
                Stray incident
              </span>
            )}
            {layers.radius && (
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-3 rounded-full border-2 border-red-500 bg-red-100" />
                {formatRadius(
                  radius,
                )} radius
              </span>
            )}
            {layers.population && (
              <span className="inline-flex basis-full flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">Livestock (head):</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-4 rounded-sm" style={{ background: ZERO_FILL }} /> 0
                </span>
                {popBreaks.map(([lo, hi], k) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <span
                      className="h-3 w-4 rounded-sm"
                      style={{
                        background:
                          GREENS()[
                            popBreaks.length === 1
                              ? 3
                              : Math.round((k * 4) / Math.max(1, popBreaks.length - 1))
                          ],
                      }}
                    />
                    {lo === hi ? fmtNumber(lo) : `${fmtNumber(lo)}–${fmtNumber(hi)}`}
                  </span>
                ))}
              </span>
            )}
          </CaseLegend>
          <MapView
            className="h-[440px] lg:h-[620px]"
            farms={
              layers.farms
                ? shownFarms.map((f) => ({ ...f, selected: selFarm?.id === f.id }))
                : selFarm
                  ? [{ ...selFarm, selected: true }]
                  : []
            }
            cases={layers.cases ? mappedCases : selCase?.mapped ? [selCase] : []}
            strays={layers.strays ? (strays ?? []) : []}
            circles={ringCases.map((c) => ({ lat: c.lat!, lng: c.lng!, radius }))}
            areas={
              layers.population && shapes
                ? {
                    data: shapes,
                    fill: popFill,
                    label: (b) => `${b}: ${fmtNumber(popByBarangay.get(b) ?? 0)} head`,
                    version: `pop|${species}|${raised}|${popMax}`,
                  }
                : undefined
            }
            onFarmClick={(f) => setSelected({ kind: 'farm', id: f.id })}
            onCaseClick={(c) => setSelected({ kind: 'case', id: c.id })}
            focusCircle={selCase?.mapped ? { lat: selCase.lat!, lng: selCase.lng!, radius } : undefined}
            fitKey={`${barangay}${species}${raised}${disease}|${selCase?.id ?? ''}|${layers.population}`}
          />
        </div>
        <div className="space-y-4">
          {selCase && (
            <Card>
              <CardHeader
                title={`${selCase.code} · ${selCase.disease}`}
                actions={
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    aria-label="Close"
                    onClick={() => setSelected(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                }
              />
              <div className="space-y-1.5 px-4 py-3 text-[15px] text-slate-700">
                <CaseStatusBadge status={selCase.status} />
                <div>
                  {selCase.farmName} · {selCase.barangay}
                </div>
                <div>
                  {selCase.species} · {selCase.affected} affected · {selCase.deaths} deaths · reported{' '}
                  {fmtDate(selCase.reportedAt)}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="xs" onClick={() => navigate(`/cases/${selCase.id}`)}>
                    Open report
                  </Button>
                  <Button size="xs" onClick={() => navigate(`/radius?case=${selCase.id}&radius=${radius}`)}>
                    <Radar /> Farms to monitor
                  </Button>
                </div>
              </div>
              {selCase.mapped && (
                <div className="border-t border-slate-100">
                  <div className="px-4 pt-3 text-[13px] font-medium text-slate-600">
                    {nearSel.length} farm(s) within {formatRadius(radius)}
                  </div>
                  <ul className="max-h-[260px] overflow-y-auto py-1">
                    {nearSel.map(({ f, d }) => (
                      <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-1.5">
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() => setSelected({ kind: 'farm', id: f.id })}
                        >
                          <span className="block truncate text-[14px] text-slate-900">{f.name}</span>
                          <span className="block text-[12px] text-slate-500">
                            {d} m · {f.total} head ·{' '}
                            {f.lastVisitAt ? `visited ${fmtDate(f.lastVisitAt)}` : 'not visited'}
                          </span>
                        </button>
                        {canEdit && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setVisitFarm({ id: f.id, caseId: selCase.id })}
                          >
                            Visit
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
          {selFarm && (
            <Card>
              <CardHeader
                title={selFarm.name}
                actions={
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    aria-label="Close"
                    onClick={() => setSelected(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                }
              />
              <div className="space-y-1.5 px-4 py-3 text-[15px] text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <RaisedBadge value={selFarm.livestockRaised} />
                  <span className="text-[13px] text-slate-500">
                    {selFarm.code} · {selFarm.barangay}
                  </span>
                </div>
                <div>Owner: {selFarm.ownerName}</div>
                <div className="flex flex-wrap gap-1">
                  {selFarm.species
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <SpeciesChip key={s.species} species={s.species} count={s.count} />
                    ))}
                </div>
                <div className="text-[14px]">
                  Last visit: <LastVisit at={selFarm.lastVisitAt} purpose={selFarm.lastVisitPurpose} />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="xs" onClick={() => navigate(`/farms/${selFarm.id}`)}>
                    Open farm
                  </Button>
                  {canEdit && (
                    <>
                      <Button size="xs" onClick={() => setVisitFarm({ id: selFarm.id })}>
                        <ClipboardCheck /> Record visit
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => navigate(`/cases/new?farm=${selFarm.id}`)}
                      >
                        <Plus /> Report disease
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )}
          {showCaseList && (
            <Card className="flex max-h-[300px] flex-col overflow-hidden">
              <CardHeader title={`Disease Reports (${shownCases.length})`} />
              <ul className="flex-1 overflow-y-auto">
                {shownCases.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() =>
                        c.mapped ? setSelected({ kind: 'case', id: c.id }) : navigate(`/cases/${c.id}`)
                      }
                      className={cn(
                        'flex w-full items-start justify-between gap-2 border-b border-slate-100 px-4 py-2 text-left hover:bg-slate-50',
                        selCase?.id === c.id && 'bg-brand-light',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] text-slate-900">{c.disease}</span>
                        <span className="block text-[12px] text-slate-500">
                          {c.code} · {c.barangay}
                          {!c.mapped && ' · no map location'}
                        </span>
                      </span>
                      <span className="shrink-0">
                        <CaseStatusBadge status={c.status} />
                      </span>
                    </button>
                  </li>
                ))}
                {!shownCases.length && (
                  <li className="p-4 text-sm text-slate-500">No disease reports for these filters.</li>
                )}
              </ul>
            </Card>
          )}
          {showFarmList && (
            <Card className="flex max-h-[320px] flex-col overflow-hidden">
              <CardHeader title={`Farms (${shownFarms.length})`} />
              <ul className="flex-1 overflow-y-auto">
                {shownFarms.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelected({ kind: 'farm', id: f.id })}
                      className={cn(
                        'w-full border-b border-slate-100 px-4 py-2 text-left hover:bg-slate-50',
                        selFarm?.id === f.id && 'bg-brand-light',
                      )}
                    >
                      <span className="block text-[15px] text-slate-900">{f.name}</span>
                      <span className="block text-[12px] text-slate-500">
                        {f.barangay} · {f.livestockRaised} · {f.total} head
                      </span>
                    </button>
                  </li>
                ))}
                {!shownFarms.length && (
                  <li className="p-4 text-sm text-slate-500">No farms for these filters.</li>
                )}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {visitFarm && (
        <FarmVisitLauncher
          open
          onOpenChange={(o) => !o && setVisitFarm(null)}
          farmId={visitFarm.id}
          defaultPurpose={visitFarm.caseId ? 'MONITORING' : 'ROUTINE'}
          defaultCaseId={visitFarm.caseId}
        />
      )}
    </div>
  );
}

/* ---------------- Disease outbreak map ---------------- */

export function OutbreakMapPage() {
  const [view, setView] = useState<'current' | 'timeline'>('timeline');
  return (
    <div>
      <Tabs
        className="mb-4"
        value={view}
        onChange={setView}
        tabs={[
          { id: 'timeline', label: 'Outbreak Timeline' },
          { id: 'current', label: 'Open Reports' },
        ]}
      />
      {view === 'current' ? <CurrentOutbreakMap /> : <OutbreakTimeline />}
    </div>
  );
}

function CurrentOutbreakMap() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [locate, setLocate] = useState<CaseRow | null>(null);
  const { data, error } = useApi<CaseRow[]>(`/api/cases${qs({ status, state: 'open' })}`);
  const mapped = (data ?? []).filter((c) => c.mapped).sort((a, b) => a.id - b.id);
  const unmapped = (data ?? []).filter((c) => !c.mapped);
  const positives = mapped.filter((c) => c.status === 'POSITIVE');

  return (
    <div>
      <PageHeader
        title="Open Disease Reports"
        subtitle={`${mapped.length} on the map · ${unmapped.length} without a map location`}
        actions={
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] }))}
            all="All statuses"
            className="w-full sm:w-48"
          />
        }
      />
      {error && <ErrorBox error={error} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <CaseLegend />
          <MapView
            className="h-[420px] lg:h-[600px]"
            cases={mapped}
            circles={(selected?.status === 'POSITIVE' ? [selected] : positives).map((c) => ({
              lat: c.lat!,
              lng: c.lng!,
              radius: 1000,
            }))}
            onCaseClick={(c) => setSelected(mapped.find((m) => m.id === c.id) ?? null)}
            focusCircle={
              selected && selected.lat != null
                ? { lat: selected.lat, lng: selected.lng!, radius: 1000 }
                : undefined
            }
            fitKey={`${status}-${selected?.id ?? ''}`}
          />
        </div>
        <div className="space-y-4">
          {selected && (
            <Card>
              <CardHeader title={`${selected.code} · ${selected.disease}`} />
              <div className="space-y-1.5 px-4 py-3 text-[15px] text-slate-700">
                <CaseStatusBadge status={selected.status} />
                <div>
                  {selected.farmName} · {selected.barangay}
                </div>
                <div>
                  {selected.species} · {selected.affected} affected · {selected.deaths} deaths
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="xs" onClick={() => navigate(`/cases/${selected.id}`)}>
                    Open case
                  </Button>
                  <Button size="xs" onClick={() => navigate(`/radius?case=${selected.id}`)}>
                    <Radar /> Analyze radius
                  </Button>
                </div>
              </div>
            </Card>
          )}
          <Card className="flex max-h-[300px] flex-col overflow-hidden">
            <CardHeader title="Cases" />
            <ul className="flex-1 overflow-y-auto">
              {mapped.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c)}
                    className={cn(
                      'flex w-full items-start justify-between gap-2 border-b border-slate-100 px-4 py-2 text-left hover:bg-slate-50',
                      selected?.id === c.id && 'bg-brand-light',
                    )}
                  >
                    <span className="text-[15px] text-slate-900">
                      {c.code} <span className="text-slate-500">{c.disease}</span>
                    </span>
                    <span className="shrink-0">
                      <CaseStatusBadge status={c.status} />
                    </span>
                  </button>
                </li>
              ))}
              {!mapped.length && <li className="p-4 text-sm text-slate-500">No mapped cases.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Unmapped cases (awaiting geotagging)" />
            <ul>
              {unmapped.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 last:border-0"
                >
                  <Link to={`/cases/${c.id}`} className="text-[15px] text-slate-900 hover:underline">
                    {c.code} · {c.barangay}
                  </Link>
                  {canEdit && (
                    <Button variant="outline" size="xs" onClick={() => setLocate(c)}>
                      Add location
                    </Button>
                  )}
                </li>
              ))}
              {!unmapped.length && (
                <li className="px-4 py-3 text-sm text-slate-500">All cases are geotagged.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>
      {locate && (
        <CaseLocationDialog
          open={!!locate}
          onOpenChange={(o) => !o && setLocate(null)}
          caseId={locate.id}
          code={locate.code}
        />
      )}
    </div>
  );
}

/**
 * Outbreak timeline: replays the cases month by month. A case is shown from the month it was reported
 * until the month it was closed; cases reported in the selected month pulse.
 */
function OutbreakTimeline() {
  const { data, error } = useApi<CaseRow[]>('/api/cases');
  const { data: shapes } = useBarangayShapes();
  const cases = useMemo(() => data ?? [], [data]);
  const months = useMemo(() => {
    if (!cases.length) return [isoMonth()];
    const first = cases.map((c) => c.reportedAt.slice(0, 7)).sort()[0];
    const out: string[] = [];
    for (let m = first; m <= isoMonth(); m = addMonths(m, 1)) out.push(m);
    return out;
  }, [cases]);
  const [idx, setIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const i = idx ?? months.length - 1;
  const month = months[Math.min(i, months.length - 1)];
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setIdx((cur) => {
        const n = (cur ?? months.length - 1) + 1;
        if (n >= months.length) {
          setPlaying(false);
          return months.length - 1;
        }
        return n;
      });
    }, 1300);
    return () => clearInterval(timer.current);
  }, [playing, months.length]);

  const play = () => {
    // Pressing play at the last month starts again from the first month.
    if (i >= months.length - 1) setIdx(0);
    setPlaying((p) => !p);
  };

  const reportedIn = (c: CaseRow) => c.reportedAt.slice(0, 7);
  const closedIn = (c: CaseRow) => (c.closedAt ? c.closedAt.slice(0, 7) : null);
  const active = cases.filter((c) => reportedIn(c) <= month && (!closedIn(c) || closedIn(c)! >= month));
  const fresh = active.filter((c) => reportedIn(c) === month);
  const closedNow = cases.filter((c) => closedIn(c) === month);
  const mapped = active.filter((c) => c.mapped);
  const perMonth = months.map((m) => cases.filter((c) => reportedIn(c) === m).length);
  const peak = Math.max(1, ...perMonth);

  return (
    <div>
      <PageHeader
        title="Outbreak Timeline"
        subtitle="Replay the disease cases month by month to see where an outbreak started and how it spread."
      />
      {error && <ErrorBox error={error} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <CaseLegend>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded-full border-2 border-red-500 bg-red-100" />1 km around positive
              cases
            </span>
          </CaseLegend>
          <MapView
            className="h-[420px] lg:h-[560px]"
            cases={mapped}
            highlightCaseIds={fresh.map((c) => c.id)}
            circles={mapped
              .filter((c) => c.status === 'POSITIVE')
              .map((c) => ({ lat: c.lat!, lng: c.lng!, radius: 1000 }))}
            areas={
              shapes
                ? {
                    data: shapes,
                    fill: () => 'transparent',
                    label: (n) => n,
                    outlineOnly: true,
                    version: 'outline',
                  }
                : undefined
            }
            fitKey={shapes ? 'city' : 'loading'}
          />
          <Card className="mt-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={play} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause /> : <Play />} {playing ? 'Pause' : 'Play'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label="Previous month"
                disabled={i <= 0}
                onClick={() => {
                  setPlaying(false);
                  setIdx(Math.max(0, i - 1));
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label="Next month"
                disabled={i >= months.length - 1}
                onClick={() => {
                  setPlaying(false);
                  setIdx(Math.min(months.length - 1, i + 1));
                }}
              >
                <ChevronRight />
              </Button>
              <span className="ml-1 text-[16px] font-semibold text-slate-900" aria-live="polite">
                {fmtMonth(month)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={months.length - 1}
              value={i}
              onChange={(e) => {
                setPlaying(false);
                setIdx(Number(e.target.value));
              }}
              aria-label="Month"
              className="mt-3 w-full accent-brand-strong"
            />
            {/* New cases per month; the selected month is dark. */}
            <div className="mt-2 flex h-14 items-end gap-[3px]" aria-hidden>
              {perMonth.map((n, k) => (
                <button
                  key={months[k]}
                  type="button"
                  tabIndex={-1}
                  title={`${fmtMonth(months[k])}: ${n} new case(s)`}
                  onClick={() => {
                    setPlaying(false);
                    setIdx(k);
                  }}
                  className={cn(
                    'flex-1 rounded-t-sm',
                    k === i ? 'bg-brand-dark' : k < i ? 'bg-brand/60' : 'bg-slate-200',
                  )}
                  style={{ height: `${Math.max(6, (n / peak) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[12px] text-slate-500">
              <span>{fmtMonth(months[0])}</span>
              <span>New cases per month</span>
              <span>{fmtMonth(months[months.length - 1])}</span>
            </div>
          </Card>
          <p className="mt-1 text-[12px] text-slate-400">
            Colours show each case&apos;s current status. A pulsing ring marks cases reported that month.
          </p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="New this month" value={fresh.length} />
            <StatCard label="Active cases" value={active.length} />
            <StatCard
              label="Positive (active)"
              value={active.filter((c) => c.status === 'POSITIVE').length}
            />
            <StatCard label="Closed this month" value={closedNow.length} />
          </div>
          <Card className="flex max-h-[360px] flex-col overflow-hidden">
            <CardHeader title={`Reported in ${fmtMonth(month)}`} />
            <ul className="flex-1 overflow-y-auto">
              {fresh.map((c) => (
                <li key={c.id} className="border-b border-slate-100 px-4 py-2.5 last:border-0">
                  <Link to={`/cases/${c.id}`} className="text-[15px] text-slate-900 hover:underline">
                    {c.code} · {c.disease}
                  </Link>
                  <div className="text-[13px] text-slate-500">
                    {c.farmName} · {c.barangay}
                    {!c.mapped && ' · not mapped'}
                  </div>
                </li>
              ))}
              {!fresh.length && <li className="p-4 text-sm text-slate-500">No new cases this month.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Barangay map (shaded) ---------------- */

type BarangayMetric = 'livestock' | 'farms' | 'openCases' | 'allCases' | 'positive' | 'strays';

const METRICS: { value: BarangayMetric; label: string; unit: string; palette: string[] }[] = [
  { value: 'livestock', label: 'Livestock (head)', unit: 'head', palette: GREENS() },
  { value: 'farms', label: 'Registered farms', unit: 'farms', palette: GREENS() },
  { value: 'openCases', label: 'Open disease cases', unit: 'cases', palette: REDS() },
  { value: 'allCases', label: 'All disease cases (incl. closed)', unit: 'cases', palette: REDS() },
  { value: 'positive', label: 'Positive cases', unit: 'cases', palette: REDS() },
  {
    value: 'strays',
    label: 'Stray incidents',
    unit: 'incidents',
    palette: ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'],
  },
];
function GREENS() {
  return ['#e5f5e0', '#c7e9c0', '#74c476', '#31a354', '#006d2c'];
}
function REDS() {
  return ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'];
}
const ZERO_FILL = '#e2e8f0';

/** Five equal classes from 1 to the highest value (0 is shown separately, in grey). */
function classBreaks(max: number) {
  if (max <= 0) return [];
  const step = Math.max(1, Math.ceil(max / 5));
  const out: [number, number][] = [];
  for (let lo = 1; lo <= max && out.length < 5; lo += step) out.push([lo, Math.min(max, lo + step - 1)]);
  return out;
}

export function BarangayMapPage() {
  const { data: shapes, error: shapeError } = useBarangayShapes();
  const [metric, setMetric] = useState<BarangayMetric>('livestock');
  const [species, setSpecies] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { data: farms } = useApi<FarmSummary[]>('/api/farms');
  const { data: cases } = useApi<CaseRow[]>('/api/cases');
  const { data: strays } = useApi<{ id: number; barangay: string; species: string }[]>('/api/strays');
  const m = METRICS.find((x) => x.value === metric)!;

  // Every figure per barangay, for the chosen species (if any).
  const stats = useMemo(() => {
    const out = new Map<
      string,
      {
        livestock: number;
        farms: number;
        openCases: number;
        allCases: number;
        positive: number;
        strays: number;
      }
    >();
    for (const b of BARANGAYS)
      out.set(b, { livestock: 0, farms: 0, openCases: 0, allCases: 0, positive: 0, strays: 0 });
    for (const f of farms ?? []) {
      const r = out.get(f.barangay);
      if (!r) continue;
      const head = species ? (f.species.find((x) => x.species === species)?.count ?? 0) : f.total;
      if (species && !head) continue;
      r.farms += 1;
      r.livestock += head;
    }
    for (const c of cases ?? []) {
      const r = out.get(c.barangay);
      if (!r || (species && c.species !== species)) continue;
      r.allCases += 1;
      if (!c.closed) r.openCases += 1;
      if (c.status === 'POSITIVE' && !c.closed) r.positive += 1;
    }
    for (const st of strays ?? []) {
      const r = out.get(st.barangay);
      if (!r || (species && st.species !== species)) continue;
      r.strays += 1;
    }
    return out;
  }, [farms, cases, strays, species]);

  const value = (b: string) => stats.get(b)?.[metric] ?? 0;
  const max = Math.max(0, ...BARANGAYS.map(value));
  const breaks = classBreaks(max);
  // With fewer than five classes (small numbers), spread them over the palette so the highest is darkest.
  const shade = (k: number) =>
    m.palette[breaks.length === 1 ? 3 : Math.round((k * (m.palette.length - 1)) / (breaks.length - 1))];
  const fill = (b: string) => {
    const v = value(b);
    if (!v) return ZERO_FILL;
    return shade(
      Math.max(
        0,
        breaks.findIndex(([lo, hi]) => v >= lo && v <= hi),
      ),
    );
  };
  const ranked = [...BARANGAYS].sort((a, b) => value(b) - value(a) || a.localeCompare(b));
  const total = BARANGAYS.reduce((a, b) => a + value(b), 0);
  const sel = selected ? stats.get(selected) : null;

  return (
    <div>
      <PageHeader
        title="Barangay Summary"
        subtitle="Barangays shaded by the figure you choose — darker means more."
        actions={
          <>
            <FilterSelect
              label="Show"
              value={metric}
              onChange={(v) => setMetric((v || 'livestock') as BarangayMetric)}
              options={METRICS.map((x) => ({ value: x.value, label: x.label }))}
              className="w-[calc(50%-4px)] sm:w-60"
            />
            <FilterSelect
              label="Species"
              value={species}
              onChange={setSpecies}
              options={SPECIES}
              all="All species"
              className="w-[calc(50%-4px)] sm:w-40"
            />
          </>
        }
      />
      <MapTabs value="barangays" />
      {shapeError && <ErrorBox error={shapeError} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <MapLegend>
            <span className="font-medium">{m.label}:</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-4 rounded-sm" style={{ background: ZERO_FILL }} /> 0
            </span>
            {breaks.map(([lo, hi], k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="h-3 w-4 rounded-sm" style={{ background: shade(k) }} />
                {lo === hi ? fmtNumber(lo) : `${fmtNumber(lo)}–${fmtNumber(hi)}`}
              </span>
            ))}
          </MapLegend>
          {shapes ? (
            <MapView
              className="h-[420px] lg:h-[600px]"
              areas={{
                data: shapes,
                fill,
                label: (b) => `${b}: ${fmtNumber(value(b))} ${m.unit}`,
                onClick: (b) => setSelected((cur) => (cur === b ? null : b)),
                selected,
                version: `${metric}|${species}|${max}|${farms?.length ?? 0}|${cases?.length ?? 0}|${strays?.length ?? 0}`,
              }}
              fitKey="barangays"
            />
          ) : (
            <Card className="flex h-[420px] items-center justify-center text-sm text-slate-500">
              Loading barangay boundaries…
            </Card>
          )}
          <p className="mt-1 text-[12px] text-slate-400">
            Barangay boundaries: PSA / NAMRIA, via philippines-json-maps (MIT licence). Tap a barangay for its
            figures.
          </p>
        </div>
        <div className="space-y-4">
          {selected && sel && (
            <Card>
              <CardHeader title={selected} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-[14px]">
                <div className="text-slate-500">Farms</div>
                <div className="text-right font-medium">{fmtNumber(sel.farms)}</div>
                <div className="text-slate-500">Livestock</div>
                <div className="text-right font-medium">{fmtNumber(sel.livestock)} head</div>
                <div className="text-slate-500">Open cases</div>
                <div className="text-right font-medium">{sel.openCases}</div>
                <div className="text-slate-500">Positive (open)</div>
                <div className="text-right font-medium">{sel.positive}</div>
                <div className="text-slate-500">All cases</div>
                <div className="text-right font-medium">{sel.allCases}</div>
                <div className="text-slate-500">Stray incidents</div>
                <div className="text-right font-medium">{sel.strays}</div>
              </div>
            </Card>
          )}
          <Card className="flex max-h-[520px] flex-col overflow-hidden">
            <CardHeader title={`Ranking · ${fmtNumber(total)} ${m.unit} in total`} />
            <ul className="flex-1 overflow-y-auto">
              {ranked.map((b) => {
                const v = value(b);
                return (
                  <li key={b}>
                    <button
                      type="button"
                      onClick={() => setSelected((cur) => (cur === b ? null : b))}
                      className={cn(
                        'w-full border-b border-slate-100 px-4 py-2 text-left hover:bg-slate-50',
                        selected === b && 'bg-brand-light',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 text-[15px]">
                        <span className="text-slate-900">{b}</span>
                        <span className="font-medium text-slate-700">{fmtNumber(v)}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-full bg-slate-100">
                        <span
                          className="block h-1.5 rounded-full"
                          style={{ width: `${max ? (v / max) * 100 : 0}%`, background: fill(b) }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Farms to monitor (radius analysis) ---------------- */

export function RadiusPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const { data: cases } = useApi<CaseRow[]>('/api/cases');
  const geocoded = (cases ?? []).filter((c) => c.mapped).sort((a, b) => a.id - b.id);
  const caseId =
    params.get('case') ??
    (geocoded.find((c) => c.status === 'POSITIVE' && !c.closed) ?? geocoded[0])?.id?.toString() ??
    '';
  const [radius, setRadius] = useState(Number(params.get('radius')) || 1000);
  const [custom, setCustom] = useState(String(radius));
  const [bq, setBq] = useState('');
  const [bBarangay, setBBarangay] = useState('');
  const [bSpecies, setBSpecies] = useState('');
  const [monitor, setMonitor] = useState('');
  const [visitFarm, setVisitFarm] = useState<number | null>(null);
  const { data, error, isLoading } = useApi<RadiusResult>(
    caseId ? `/api/radius?caseId=${caseId}&radius=${radius}` : null,
  );
  const { data: report } = useApi<ReportResult>(
    caseId ? `/api/reports/outbreak-area?caseId=${caseId}&radius=${radius}` : null,
  );

  const setCase = (v: string) => {
    const p = new URLSearchParams(params);
    p.set('case', v);
    setParams(p, { replace: true });
  };
  const rows = (data?.farms ?? []).filter(
    (f) =>
      (!bq || `${f.name} ${f.ownerName} ${f.ownerContact ?? ''}`.toLowerCase().includes(bq.toLowerCase())) &&
      (!bBarangay || f.barangay === bBarangay) &&
      (!bSpecies || f.species.some((s) => s.species === bSpecies)) &&
      (!monitor || (f.role !== 'Ground-zero farm' && f.monitoring === monitor)),
  );

  return (
    <div>
      <PageHeader
        title="Farms to Monitor"
        subtitle="Farms within the radius of a disease report, and whether each one has been visited since the report."
        actions={
          <>
            <ExportButtons report={report} size="default" print={false} />
            <Button
              disabled={!caseId}
              onClick={() => navigate(`/reports?tab=outbreak&case=${caseId}&radius=${radius}`)}
            >
              <FileText /> Outbreak-Area Report
            </Button>
          </>
        }
      />
      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="w-full lg:w-96">
            <div className="mb-1.5 text-[14px] font-medium text-slate-700">Disease report (ground zero)</div>
            <FilterSelect
              label="Ground-zero case"
              value={caseId}
              onChange={setCase}
              options={geocoded.map((c) => ({
                value: String(c.id),
                label: `${c.code} · ${c.disease} · ${c.barangay} (${c.closed ? 'closed' : CASE_STATUS_LABELS[c.status]})`,
              }))}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[14px] font-medium text-slate-700">Radius</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRadius(r);
                    setCustom(String(r));
                  }}
                  className={cn(
                    'h-9 rounded-lg border px-3 text-[14px]',
                    radius === r
                      ? 'border-brand-strong bg-brand-strong text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {formatRadius(r)}
                </button>
              ))}
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
                className="h-9 w-24"
                inputMode="numeric"
                aria-label="Custom radius in metres"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => Number(custom) >= 50 && setRadius(Math.min(50000, Number(custom)))}
              >
                Apply (m)
              </Button>
            </div>
          </div>
          {data?.case && (
            <Link to={`/cases/${data.case.id}`} className="link text-[14px] lg:ml-auto lg:pb-2">
              Open {data.case.code}
            </Link>
          )}
        </div>
      </Card>
      {error && <ErrorBox error={error} />}
      {data && data.totals && (
        <>
          {/* Four boxes of the same size; each one filters the list below (click again to show all). */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Farms within radius"
              value={data.totals.farms}
              sub={`Ground-zero farm + ${data.totals.nearby} nearby · ${fmtNumber(data.totals.livestock)} head`}
              onClick={() => setMonitor('')}
              active={!monitor}
            />
            <StatCard
              label="Not yet visited"
              value={data.totals.notVisited}
              sub="Nearby farms with no visit since the report"
              tone="orange"
              onClick={() => setMonitor(monitor === 'NOT_VISITED' ? '' : 'NOT_VISITED')}
              active={monitor === 'NOT_VISITED'}
            />
            <StatCard
              label="Visited — no signs"
              value={Math.max(0, data.totals.nearby - data.totals.notVisited - data.totals.sick)}
              sub="Nearby farms checked with no signs of disease"
              onClick={() => setMonitor(monitor === 'NO_SIGNS' ? '' : 'NO_SIGNS')}
              active={monitor === 'NO_SIGNS'}
            />
            <StatCard
              label="Sick animals found"
              value={data.totals.sick}
              sub="Visited farms that need a report"
              tone="red"
              onClick={() => setMonitor(monitor === 'SICK_ANIMALS' ? '' : 'SICK_ANIMALS')}
              active={monitor === 'SICK_ANIMALS'}
            />
          </div>
          {data.totals.species.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600">
              <span className="mr-1 font-medium">Species within radius:</span>
              {data.totals.species.map((s) => (
                <SpeciesChip key={s.species} species={s.species} count={s.count} />
              ))}
            </div>
          )}
          {data.excluded > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[15px] text-slate-700">
              <Info className="h-4 w-4 text-sky-600" /> {data.excluded} active farm(s) left out — no map
              location.{' '}
              <Link to="/farms?location=unmapped" className="underline">
                Set their locations
              </Link>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
            <div>
              <MapLegend>
                {(Object.keys(MONITOR_RING) as (keyof typeof MONITOR_RING)[]).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-full border-[3px] bg-white"
                      style={{ borderColor: MONITOR_RING[k] }}
                    />
                    {MONITOR_LABEL[k]}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-600" /> Ground zero
                </span>
              </MapLegend>
              <MapView
                className="h-[380px] xl:h-[560px]"
                farms={data.farms
                  .filter((f) => f.role !== 'Ground-zero farm')
                  .map((f) => ({ ...f, inRadius: true, ring: MONITOR_RING[f.monitoring] }))}
                groundZero={data.center}
                circles={data.center ? [{ ...data.center, radius: data.radius }] : []}
                focusCircle={data.center ? { ...data.center, radius: data.radius } : undefined}
                fitKey={`${caseId}-${radius}`}
              />
            </div>
            <Card>
              <CardHeader title={`Farms within ${formatRadius(data.radius)}`} />
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/farms/${r.id}`)}
                pageSize={0}
                minWidth={canEdit ? 760 : 620}
                defaultSort={{ key: 'distance', dir: 'asc' }}
                toolbar={
                  <>
                    <Input
                      value={bq}
                      onChange={(e) => setBq(e.target.value)}
                      placeholder="Search farm or owner..."
                      className="w-full sm:w-48"
                      aria-label="Search farms within radius"
                    />
                    <FilterSelect
                      label="Monitoring"
                      value={monitor}
                      onChange={setMonitor}
                      all="Any status"
                      options={(Object.keys(MONITOR_LABEL) as (keyof typeof MONITOR_LABEL)[]).map((k) => ({
                        value: k,
                        label: MONITOR_LABEL[k],
                      }))}
                      className="w-[calc(50%-4px)] sm:w-44"
                    />
                    <FilterSelect
                      label="Barangay"
                      value={bBarangay}
                      onChange={setBBarangay}
                      all="Barangay"
                      options={[...new Set(data.farms.map((f) => f.barangay))]}
                      className="w-[calc(50%-4px)] sm:w-32"
                    />
                    <FilterSelect
                      label="Species"
                      value={bSpecies}
                      onChange={setBSpecies}
                      all="Species"
                      options={SPECIES}
                      className="w-[calc(50%-4px)] sm:w-32"
                    />
                  </>
                }
                columns={[
                  {
                    key: 'name',
                    header: 'Farm / Owner',
                    cell: (r) => (
                      <div>
                        <div className="text-brand-dark">{r.name}</div>
                        <div className="text-[13px] text-slate-500">
                          {r.ownerName} · {r.ownerContact ?? '—'}
                        </div>
                      </div>
                    ),
                  },
                  { key: 'barangay', header: 'Barangay' },
                  { key: 'total', header: 'No. of Heads' },
                  {
                    key: 'distance',
                    header: 'Distance',
                    cell: (r) =>
                      r.role === 'Ground-zero farm' ? (
                        <Badge tone="violet">Ground zero</Badge>
                      ) : (
                        `${r.distance} m`
                      ),
                  },
                  {
                    key: 'monitoring',
                    header: 'Monitoring',
                    sort: (r) => (r.role === 'Ground-zero farm' ? 'z' : r.monitoring),
                    cell: (r) =>
                      r.role === 'Ground-zero farm' ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div>
                          <Badge
                            tone={
                              r.monitoring === 'SICK_ANIMALS'
                                ? 'red'
                                : r.monitoring === 'NO_SIGNS'
                                  ? 'green'
                                  : 'amber'
                            }
                          >
                            {MONITOR_LABEL[r.monitoring]}
                          </Badge>
                          {r.monitoredAt && (
                            <div className="mt-0.5 text-[12px] text-slate-500">{fmtDate(r.monitoredAt)}</div>
                          )}
                        </div>
                      ),
                  },
                  ...(canEdit
                    ? [
                        {
                          key: 'action',
                          header: '',
                          sort: false as const,
                          cell: (r: (typeof rows)[number]) =>
                            r.role === 'Ground-zero farm' ? null : (
                              <span className="inline-flex flex-wrap gap-1">
                                <Button
                                  size="xs"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setVisitFarm(r.id);
                                  }}
                                >
                                  <ClipboardCheck /> Record visit
                                </Button>
                                {r.monitoring === 'SICK_ANIMALS' && (
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      navigate(`/cases/new?farm=${r.id}&from=${caseId}`);
                                    }}
                                  >
                                    <Plus /> Report
                                  </Button>
                                )}
                              </span>
                            ),
                        },
                      ]
                    : []),
                ]}
              />
            </Card>
          </div>
        </>
      )}
      {!isLoading && !geocoded.length && (
        <p className="mt-4 text-sm text-slate-500">No disease reports with a map location yet.</p>
      )}
      {visitFarm && (
        <FarmVisitLauncher
          open
          onOpenChange={(o) => !o && setVisitFarm(null)}
          farmId={visitFarm}
          defaultPurpose="MONITORING"
          defaultCaseId={Number(caseId)}
        />
      )}
    </div>
  );
}

export { caseMarkerKind };
