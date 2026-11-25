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
  CASE_STATUS_LABELS,
  LIVESTOCK_RAISED,
  MONITORED_DISEASES,
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
import { RadiusSelect } from '@/components/RadiusSelect';
import { ErrorBox, FilterField, FilterSelect, MoreFilters, PageHeader, StatCard } from '@/components/page';
import { ZonesPage } from './OutreachPages';
import { CaseLegend, CaseStatusBadge, MapLegend, SpeciesChip } from '@/components/status';
import { Badge, Button, Card, CardHeader, Checkbox, Input, Tabs } from '@/components/ui';
import {} from '@/dialogs/surveillance';
import { FarmVisitLauncher } from '@/dialogs/services';
import { LastVisit, RaisedBadge } from '@/components/livestock';
import type { CaseRow, FarmSummary, RadiusResult } from './types';

/* ---------------- Livestock Map ---------------- */

/** Monitoring colours used on the map and in the "farms to monitor" list. */
const MONITOR_RING = { NOT_VISITED: '#f59e0b', NO_SIGNS: '#16a34a', SICK_ANIMALS: '#dc2626' } as const;
const MONITOR_LABEL = {
  NOT_VISITED: 'Not yet visited',
  NO_SIGNS: 'Visited — no signs',
  SICK_ANIMALS: 'Sick animals found',
} as const;

/**
 * Livestock Map: every farm on the map, the barangays shaded by livestock population, and a side
 * panel with the barangay summary (tap a barangay to see its farms and head count).
 */
export function GisMapPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [barangay, setBarangay] = useState(params.get('barangay') ?? '');
  const [species, setSpecies] = useState('');
  const [raised, setRaised] = useState('');
  const [shade, setShade] = useState(true);
  const [panel, setPanel] = useState<'barangays' | 'farms'>('barangays');
  const [selFarmId, setSelFarmId] = useState<number | null>(null);
  const [visitFarm, setVisitFarm] = useState<number | null>(null);
  const { data: farms } = useApi<FarmSummary[]>('/api/farms');
  const { data: cases } = useApi<CaseRow[]>('/api/cases');
  const { data: shapes } = useBarangayShapes();

  const headOf = (f: FarmSummary) =>
    species ? (f.species.find((s) => s.species === species)?.count ?? 0) : f.total;
  const matches = (f: FarmSummary) =>
    (!species || headOf(f) > 0) && (!raised || f.livestockRaised === raised);
  const shownFarms = useMemo(
    () =>
      (farms ?? [])
        .filter((f) => f.mapped && matches(f))
        .filter((f) => !barangay || f.barangay === barangay)
        .filter((f) => !q || `${f.name} ${f.ownerName} ${f.code}`.toLowerCase().includes(q.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farms, species, raised, q, barangay],
  );
  const head = shownFarms.reduce((a, f) => a + headOf(f), 0);

  // Figures per barangay (same livestock filters as the farms).
  const stats = useMemo(() => {
    const out = new Map<string, { farms: number; head: number; openCases: number }>();
    for (const b of BARANGAYS) out.set(b, { farms: 0, head: 0, openCases: 0 });
    for (const f of farms ?? []) {
      const r = out.get(f.barangay);
      if (!r || !matches(f)) continue;
      r.farms += 1;
      r.head += headOf(f);
    }
    for (const c of cases ?? []) {
      const r = out.get(c.barangay);
      if (r && !c.closed && (!species || c.species === species)) r.openCases += 1;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms, cases, species, raised]);
  const popMax = Math.max(0, ...[...stats.values()].map((s) => s.head));
  const popBreaks = classBreaks(popMax);
  const popColour = (k: number) =>
    GREENS()[popBreaks.length === 1 ? 3 : Math.round((k * 4) / Math.max(1, popBreaks.length - 1))];
  const popFill = (b: string) => {
    const v = stats.get(b)?.head ?? 0;
    if (!v) return ZERO_FILL;
    return popColour(
      Math.max(
        0,
        popBreaks.findIndex(([lo, hi]) => v >= lo && v <= hi),
      ),
    );
  };
  const ranked = [...BARANGAYS].sort(
    (a, b) => (stats.get(b)?.head ?? 0) - (stats.get(a)?.head ?? 0) || a.localeCompare(b),
  );
  const totalHead = [...stats.values()].reduce((a, s) => a + s.head, 0);
  const selFarm = selFarmId ? (farms ?? []).find((f) => f.id === selFarmId) : undefined;
  const sel = barangay ? stats.get(barangay) : undefined;
  const pickBarangay = (b: string) => {
    setBarangay((cur) => (cur === b ? '' : b));
    setSelFarmId(null);
  };

  return (
    <div>
      <PageHeader
        title="Livestock Map"
        subtitle={`${shownFarms.length} farms on the map · ${fmtNumber(head)} head${barangay ? ` in ${barangay}` : ''}`}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search farm or owner"
          className="w-full sm:w-64"
          aria-label="Search farm or owner"
        />
        <FilterSelect
          label="Barangay"
          value={barangay}
          onChange={(v) => (setBarangay(v), setSelFarmId(null))}
          options={BARANGAYS}
          all="All barangays"
          className="w-[calc(50%-4px)] sm:w-48"
        />
        <MoreFilters
          active={[species, raised].filter(Boolean).length + (shade ? 0 : 1)}
          onClear={() => (setSpecies(''), setRaised(''), setShade(true))}
        >
          <FilterSelect
            label="Livestock"
            value={species}
            onChange={setSpecies}
            options={SPECIES}
            all="All livestock"
          />
          <FilterSelect
            label="Farm (Livestock Raised)"
            value={raised}
            onChange={setRaised}
            options={LIVESTOCK_RAISED}
            all="All farms"
          />
          <Checkbox label="Shade barangays by head count" checked={shade} onChange={setShade} />
        </MoreFilters>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <MapLegend>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-emerald-600" /> Farm
            </span>
            {shade && (
              <>
                <span className="font-medium">Livestock (head):</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-4 rounded-sm" style={{ background: ZERO_FILL }} /> 0
                </span>
                {popBreaks.map(([lo, hi], k) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <span className="h-3 w-4 rounded-sm" style={{ background: popColour(k) }} />
                    {lo === hi ? fmtNumber(lo) : `${fmtNumber(lo)}–${fmtNumber(hi)}`}
                  </span>
                ))}
              </>
            )}
          </MapLegend>
          <MapView
            className="h-[440px] lg:h-[620px]"
            farms={shownFarms.map((f) => ({ ...f, selected: selFarm?.id === f.id }))}
            areas={
              shapes
                ? {
                    data: shapes,
                    fill: shade ? popFill : () => 'transparent',
                    label: (b) => `${b}: ${fmtNumber(stats.get(b)?.head ?? 0)} head`,
                    onClick: pickBarangay,
                    selected: barangay || null,
                    outlineOnly: !shade,
                    version: `pop|${species}|${raised}|${popMax}|${shade}`,
                  }
                : undefined
            }
            onFarmClick={(f) => setSelFarmId(f.id)}
            fitKey={`${barangay}${species}${raised}`}
          />
          <p className="mt-1 text-[12px] text-slate-400">
            Tap a farm for its details, or a barangay to see its summary. Barangay boundaries: PSA / NAMRIA.
          </p>
        </div>
        <div className="space-y-4">
          {selFarm && (
            <Card>
              <CardHeader
                title={selFarm.name}
                actions={
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    aria-label="Close"
                    onClick={() => setSelFarmId(null)}
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
                    Open Farm
                  </Button>
                  {canEdit && (
                    <>
                      <Button size="xs" onClick={() => setVisitFarm(selFarm.id)}>
                        <ClipboardCheck /> Record Visit
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => navigate(`/cases/new?farm=${selFarm.id}`)}
                      >
                        <Plus /> Report Disease
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )}
          {barangay && sel && (
            <Card>
              <CardHeader
                title={`Barangay ${barangay}`}
                actions={
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    aria-label="Show all barangays"
                    onClick={() => setBarangay('')}
                  >
                    <X className="h-5 w-5" />
                  </button>
                }
              />
              <div className="grid grid-cols-3 gap-2 px-4 py-3 text-center">
                <div>
                  <div className="text-[20px] font-semibold text-slate-900">{fmtNumber(sel.farms)}</div>
                  <div className="text-[12px] text-slate-500">Farms</div>
                </div>
                <div>
                  <div className="text-[20px] font-semibold text-slate-900">{fmtNumber(sel.head)}</div>
                  <div className="text-[12px] text-slate-500">Head</div>
                </div>
                <div>
                  <div
                    className={cn(
                      'text-[20px] font-semibold',
                      sel.openCases ? 'text-red-700' : 'text-slate-900',
                    )}
                  >
                    {sel.openCases}
                  </div>
                  <div className="text-[12px] text-slate-500">Open Cases</div>
                </div>
              </div>
            </Card>
          )}
          <Card className="flex max-h-[560px] flex-col overflow-hidden">
            <div className="border-b border-slate-100 px-3 pt-3">
              <Tabs
                value={panel}
                onChange={setPanel}
                tabs={[
                  { id: 'barangays', label: 'Barangay Summary' },
                  { id: 'farms', label: `Farms (${shownFarms.length})` },
                ]}
              />
            </div>
            {panel === 'barangays' ? (
              <ul className="flex-1 overflow-y-auto">
                <li className="px-4 py-2 text-[13px] text-slate-500">
                  {fmtNumber(totalHead)} head in total{species ? ` (${species})` : ''}. Tap one to filter the
                  map.
                </li>
                {ranked.map((b) => {
                  const v = stats.get(b)!;
                  return (
                    <li key={b}>
                      <button
                        type="button"
                        onClick={() => pickBarangay(b)}
                        className={cn(
                          'w-full border-b border-slate-100 px-4 py-2 text-left hover:bg-slate-50',
                          barangay === b && 'bg-brand-light',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2 text-[15px]">
                          <span className="text-slate-900">{b}</span>
                          <span className="font-medium text-slate-700">{fmtNumber(v.head)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 rounded-full bg-slate-100">
                          <span
                            className="block h-1.5 rounded-full"
                            style={{
                              width: `${popMax ? (v.head / popMax) * 100 : 0}%`,
                              background: popFill(b),
                            }}
                          />
                        </span>
                        <span className="mt-0.5 block text-[12px] text-slate-500">
                          {v.farms} farm{v.farms === 1 ? '' : 's'}
                          {v.openCases ? ` · ${v.openCases} open case${v.openCases === 1 ? '' : 's'}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="flex-1 overflow-y-auto">
                {shownFarms.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelFarmId(f.id)}
                      className={cn(
                        'w-full border-b border-slate-100 px-4 py-2 text-left hover:bg-slate-50',
                        selFarm?.id === f.id && 'bg-brand-light',
                      )}
                    >
                      <span className="block text-[15px] text-slate-900">{f.name}</span>
                      <span className="block text-[12px] text-slate-500">
                        {f.barangay} · {f.livestockRaised} · {headOf(f)} head
                      </span>
                    </button>
                  </li>
                ))}
                {!shownFarms.length && (
                  <li className="p-4 text-sm text-slate-500">No farms for these filters.</li>
                )}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {visitFarm && (
        <FarmVisitLauncher
          open
          onOpenChange={(o) => !o && setVisitFarm(null)}
          farmId={visitFarm}
          defaultPurpose="ROUTINE"
        />
      )}
    </div>
  );
}

/* ---------------- Disease Monitoring ---------------- */

type MonitorView = 'map' | 'timeline' | 'radius' | 'zones';

/**
 * Disease Monitoring: one page for following an outbreak. The map shows the disease reports, the
 * monitoring zones and the farms around a case; the timeline replays the cases month by month;
 * "Farms in Radius" lists the farms to visit around one case; "Monitoring Zones" manages the zones.
 */
export function DiseaseMonitoringPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view') as MonitorView | null;
  const view: MonitorView = raw && ['map', 'timeline', 'radius', 'zones'].includes(raw) ? raw : 'map';
  // Each view keeps its own address parameters; switching starts it fresh.
  const setView = (v: MonitorView) => setParams(v === 'map' ? {} : { view: v }, { replace: true });
  const [disease, setDisease] = useState(params.get('disease') ?? '');
  const [barangay, setBarangay] = useState(params.get('barangay') ?? '');
  const [caseState, setCaseState] = useState<'open' | 'all'>('open');
  const [species, setSpecies] = useState('');
  const [radius, setRadius] = useState(Number(params.get('radius')) || 1000);
  const { data: all } = useApi<CaseRow[]>('/api/cases');
  const diseases = [...new Set([...MONITORED_DISEASES, ...(all ?? []).map((c) => c.disease)])];
  const filters = view === 'map' || view === 'timeline';
  return (
    <div>
      <PageHeader
        title="Disease Monitoring"
        subtitle="Disease reports, monitoring zones and the farms around each case, on one map, plus a month-by-month replay."
      />
      <Tabs
        className="mb-4"
        value={view}
        onChange={setView}
        tabs={[
          { id: 'map', label: 'Map' },
          { id: 'timeline', label: 'Outbreak Timeline' },
          { id: 'radius', label: 'Farms in Radius' },
          { id: 'zones', label: 'Monitoring Zones' },
        ]}
      />
      {filters && (
        <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
          <FilterSelect
            label="Disease"
            value={disease}
            onChange={setDisease}
            options={diseases}
            all="All diseases"
            className="w-[calc(50%-4px)] sm:w-60"
          />
          <FilterSelect
            label="Barangay"
            value={barangay}
            onChange={setBarangay}
            options={BARANGAYS}
            all="All barangays"
            className="w-[calc(50%-4px)] sm:w-48"
          />
          {view === 'map' && (
            <MoreFilters
              active={
                [species, caseState === 'all' ? 'x' : '', radius !== 1000 ? 'x' : ''].filter(Boolean).length
              }
              onClear={() => (setSpecies(''), setCaseState('open'), setRadius(1000))}
            >
              <FilterSelect
                label="Reports"
                value={caseState}
                onChange={(v) => setCaseState((v || 'open') as 'open' | 'all')}
                options={[
                  { value: 'open', label: 'Open Reports' },
                  { value: 'all', label: 'All reports (incl. closed)' },
                ]}
              />
              <FilterSelect
                label="Livestock"
                value={species}
                onChange={setSpecies}
                options={SPECIES}
                all="All livestock"
              />
              <FilterField label="Radius around a case">
                <RadiusSelect value={radius} onChange={setRadius} className="w-full" />
              </FilterField>
            </MoreFilters>
          )}
        </Card>
      )}
      {view === 'map' && (
        <CaseMap
          disease={disease}
          barangay={barangay}
          species={species}
          caseState={caseState}
          radius={radius}
          onFarmsInRadius={(id) => setParams({ view: 'radius', case: String(id), radius: String(radius) })}
        />
      )}
      {view === 'timeline' && <OutbreakTimeline disease={disease} barangay={barangay} />}
      {view === 'radius' && <RadiusPage embedded />}
      {view === 'zones' && <ZonesPage embedded />}
    </div>
  );
}

/** The live map of Disease Monitoring: cases, monitoring zones and the farms around a selected case. */
function CaseMap({
  disease,
  barangay,
  species,
  caseState,
  radius,
  onFarmsInRadius,
}: {
  disease: string;
  barangay: string;
  species: string;
  caseState: 'open' | 'all';
  radius: number;
  onFarmsInRadius: (caseId: number) => void;
}) {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [params] = useSearchParams();
  const [selId, setSelId] = useState<number | null>(Number(params.get('case')) || null);
  const [visitFarm, setVisitFarm] = useState<{ id: number; caseId?: number } | null>(null);
  const { data: farms } = useApi<FarmSummary[]>('/api/farms');
  const { data: cases } = useApi<CaseRow[]>(`/api/cases${qs({ barangay, species, state: caseState })}`);
  const { data: zones } =
    useApi<{ id: number; caseId: number | null; radiusM: number; status: string; code: string }[]>(
      '/api/zones',
    );
  const { data: shapes } = useBarangayShapes();
  const shownCases = (cases ?? []).filter((c) => !disease || c.disease === disease);
  const mappedCases = shownCases.filter((c) => c.mapped);
  const selCase = selId ? (cases ?? []).find((c) => c.id === selId) : undefined;
  const nearSel = useMemo(() => {
    if (!selCase?.mapped) return [];
    return (farms ?? [])
      .filter((f) => f.mapped && f.id !== selCase.farmId)
      .map((f) => ({ f, d: Math.round(distanceMeters(selCase.lat!, selCase.lng!, f.lat!, f.lng!)) }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => a.d - b.d);
  }, [selCase, farms, radius]);
  // Active monitoring zones are drawn around their case; the selected case gets the chosen radius.
  const byId = new Map((cases ?? []).map((c) => [c.id, c]));
  const zoneRings = (zones ?? [])
    .filter((z) => z.status === 'ACTIVE' && z.caseId && byId.get(z.caseId)?.mapped)
    .map((z) => {
      const c = byId.get(z.caseId!)!;
      return { lat: c.lat!, lng: c.lng!, radius: z.radiusM };
    });
  const rings = selCase?.mapped
    ? [...zoneRings, { lat: selCase.lat!, lng: selCase.lng!, radius }]
    : zoneRings;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <div>
        <CaseLegend>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded-full border-2 border-red-500 bg-red-100" />
            Monitoring zone / {formatRadius(
              radius,
            )} around the selected case
          </span>
        </CaseLegend>
        <MapView
          className="h-[440px] lg:h-[620px]"
          farms={selCase ? nearSel.map(({ f }) => f) : []}
          cases={mappedCases}
          circles={rings}
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
          onCaseClick={(c) => setSelId(c.id)}
          focusCircle={selCase?.mapped ? { lat: selCase.lat!, lng: selCase.lng!, radius } : undefined}
          fitKey={`${barangay}${species}${disease}|${selCase?.id ?? ''}`}
        />
        <p className="mt-1 text-[12px] text-slate-400">
          Tap a case to see the farms around it. Farms are shown only around the selected case.
        </p>
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
                  onClick={() => setSelId(null)}
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
                  Open Report
                </Button>
                <Button size="xs" onClick={() => onFarmsInRadius(selCase.id)}>
                  <Radar /> Farms in Radius
                </Button>
              </div>
            </div>
            {selCase.mapped ? (
              <div className="border-t border-slate-100">
                <div className="px-4 pt-3 text-[13px] font-medium text-slate-600">
                  {nearSel.length} farm(s) within {formatRadius(radius)} (ground-zero farm not included)
                </div>
                <ul className="max-h-[260px] overflow-y-auto py-1">
                  {nearSel.map(({ f, d }) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-1.5">
                      <Link to={`/farms/${f.id}`} className="min-w-0">
                        <span className="block truncate text-[14px] text-slate-900">{f.name}</span>
                        <span className="block text-[12px] text-slate-500">
                          {d} m · {f.total} head ·{' '}
                          {f.lastVisitAt ? `visited ${fmtDate(f.lastVisitAt)}` : 'not visited'}
                        </span>
                      </Link>
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
            ) : (
              <p className="border-t border-slate-100 px-4 py-3 text-[14px] text-slate-500">
                This case has no map location yet. Open the report to geotag it.
              </p>
            )}
          </Card>
        )}
        <Card className="flex max-h-[420px] flex-col overflow-hidden">
          <CardHeader title={`Disease Reports (${shownCases.length})`} />
          <ul className="flex-1 overflow-y-auto">
            {shownCases.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => (c.mapped ? setSelId(c.id) : navigate(`/cases/${c.id}`))}
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

/** Replay the cases month by month (the outbreak date slider). */
function OutbreakTimeline({ disease, barangay }: { disease: string; barangay: string }) {
  const { data, error } = useApi<CaseRow[]>('/api/cases?state=all');
  const { data: shapes } = useBarangayShapes();
  const cases = useMemo(
    () =>
      (data ?? []).filter(
        (c) => (!disease || c.disease === disease) && (!barangay || c.barangay === barangay),
      ),
    [data, disease, barangay],
  );
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
      <p className="mb-3 text-[14px] text-slate-600">
        Replay the disease cases month by month to see where an outbreak started and how it spread.
      </p>
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
            <StatCard label="New This Month" value={fresh.length} />
            <StatCard label="Active Cases" value={active.length} />
            <StatCard
              label="Positive (Active)"
              value={active.filter((c) => c.status === 'POSITIVE').length}
            />
            <StatCard label="Closed This Month" value={closedNow.length} />
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

/* ---------------- Map colours ---------------- */

function GREENS() {
  return ['#e5f5e0', '#c7e9c0', '#74c476', '#31a354', '#006d2c'];
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

/* ---------------- Farms to monitor (radius analysis) ---------------- */

export function RadiusPage({ embedded }: { embedded?: boolean } = {}) {
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
  // The list is of farms to monitor: the ground-zero farm (where the case is) is left out.
  const groundZeroFarm = data?.farms.find((f) => f.role === 'Ground-zero farm');
  const rows = (data?.farms ?? []).filter(
    (f) =>
      f.role !== 'Ground-zero farm' &&
      (!bq || `${f.name} ${f.ownerName} ${f.ownerContact ?? ''}`.toLowerCase().includes(bq.toLowerCase())) &&
      (!bBarangay || f.barangay === bBarangay) &&
      (!bSpecies || f.species.some((s) => s.species === bSpecies)) &&
      (!monitor || f.monitoring === monitor),
  );

  return (
    <div>
      <PageHeader
        title={embedded ? null : 'Farms to Monitor'}
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
              label="Ground-Zero Case"
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
            <RadiusSelect value={radius} onChange={setRadius} className="h-10" />
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
              label="Farms Within Radius"
              value={data.totals.farms}
              sub={`Ground-zero farm + ${data.totals.nearby} nearby · ${fmtNumber(data.totals.livestock)} head`}
              onClick={() => setMonitor('')}
              active={!monitor}
            />
            <StatCard
              label="Not Yet Visited"
              value={data.totals.notVisited}
              sub="Nearby farms with no visit since the report"
              tone="orange"
              onClick={() => setMonitor(monitor === 'NOT_VISITED' ? '' : 'NOT_VISITED')}
              active={monitor === 'NOT_VISITED'}
            />
            <StatCard
              label="Visited — No Signs"
              value={Math.max(0, data.totals.nearby - data.totals.notVisited - data.totals.sick)}
              sub="Nearby farms checked with no signs of disease"
              onClick={() => setMonitor(monitor === 'NO_SIGNS' ? '' : 'NO_SIGNS')}
              active={monitor === 'NO_SIGNS'}
            />
            <StatCard
              label="Sick Animals Found"
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
              <CardHeader title={`Farms to monitor within ${formatRadius(data.radius)}`} />
              {groundZeroFarm && (
                <p className="border-b border-slate-100 px-4 py-2 text-[13px] text-slate-600">
                  <Badge tone="violet">Ground Zero</Badge> {groundZeroFarm.name} · {groundZeroFarm.ownerName}{' '}
                  — the farm with the case, not in the list to monitor.
                </p>
              )}
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
                    <MoreFilters
                      active={[bBarangay, bSpecies].filter(Boolean).length}
                      onClear={() => (setBBarangay(''), setBSpecies(''))}
                    >
                      <FilterSelect
                        label="Barangay"
                        value={bBarangay}
                        onChange={setBBarangay}
                        all="All barangays"
                        options={[...new Set(data.farms.map((f) => f.barangay))]}
                      />
                      <FilterSelect
                        label="Species"
                        value={bSpecies}
                        onChange={setBSpecies}
                        all="All species"
                        options={SPECIES}
                      />
                    </MoreFilters>
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
                        <Badge tone="violet">Ground Zero</Badge>
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
                                  <ClipboardCheck /> Record Visit
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
