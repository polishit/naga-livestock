import { FileText, Info, Plus, Radar, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BARANGAYS,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  FARM_TYPES,
  RADIUS_PRESETS,
  SPECIES,
  caseMarkerKind,
  fmtNumber,
  formatRadius,
  titleCase,
  type ReportResult,
} from '@livestock/shared';
import { ApiError, isQueued, mutate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { cn, qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { ExportButtons } from '@/components/ExportButtons';
import { MapView, type LatLng } from '@/components/MapView';
import { ErrorBox, FilterSelect, PageHeader, StatCard } from '@/components/page';
import { CaseLegend, CaseStatusBadge, SpeciesChip } from '@/components/status';
import { Badge, Button, Card, CardHeader, Checkbox, Input, Tabs } from '@/components/ui';
import { CaseLocationDialog } from '@/dialogs/surveillance';
import type { CaseRow, FarmSummary, RadiusResult } from './types';

/* ---------------- Farm geotagging ---------------- */

export function GeotaggingPage() {
  const [params] = useSearchParams();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(Number(params.get('farm')) || null);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: farms } = useApi<FarmSummary[]>('/api/farms');
  const selected = farms?.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    setPoint(
      selected && selected.lat != null && selected.lng != null
        ? { lat: selected.lat, lng: selected.lng }
        : null,
    );
  }, [selected?.id, selected?.lat, selected?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (farms ?? []).filter(
    (f) =>
      (!filter || (filter === 'mapped' ? f.mapped : !f.mapped)) &&
      (!q || `${f.name} ${f.code} ${f.ownerName} ${f.barangay}`.toLowerCase().includes(q.toLowerCase())),
  );
  const dirty = selected && point && (point.lat !== selected.lat || point.lng !== selected.lng);

  const save = async (value: LatLng | null) => {
    if (!selected) return;
    setSaving(true);
    try {
      const r = await mutate(
        'PATCH',
        `/api/farms/${selected.id}/location`,
        value ?? { lat: null, lng: null },
        { label: `Geotag ${selected.name}` },
      );
      toast[isQueued(r) ? 'info' : 'success'](
        isQueued(r)
          ? 'Saved offline — will sync when online.'
          : value
            ? `${selected.name} location saved.`
            : 'Location cleared.',
      );
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save location');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Farm Geotagging"
        subtitle="Select a record, then click the map or drag the pin to set its location."
      />
      <Tabs value="farms" onChange={() => undefined} tabs={[{ id: 'farms', label: 'Farms' }]} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="overflow-hidden">
          <div className="flex gap-2 border-b-2 border-slate-700/80 p-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search farm / owner / barangay"
              aria-label="Search farms"
            />
            <FilterSelect
              label="Mapped filter"
              value={filter}
              onChange={setFilter}
              all="All"
              options={[
                { value: 'mapped', label: 'Mapped' },
                { value: 'unmapped', label: 'Unmapped' },
              ]}
              className="w-32 shrink-0"
            />
          </div>
          <ul className="max-h-[300px] overflow-y-auto lg:max-h-[560px]">
            {list.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50',
                    selectedId === f.id && 'bg-brand-light',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] text-slate-900">{f.name}</span>
                    <span className="block truncate text-[12.5px] text-slate-500">
                      {f.code} · {f.barangay} · {f.ownerName}
                    </span>
                  </span>
                  {f.mapped ? <Badge tone="green">Mapped</Badge> : <Badge tone="red">Unmapped</Badge>}
                </button>
              </li>
            ))}
            {!list.length && <li className="p-4 text-sm text-slate-500">No farms match.</li>}
          </ul>
        </Card>
        <div>
          <MapView
            className="h-[380px] lg:h-[480px]"
            farms={(farms ?? []).filter((f) => f.id !== selectedId)}
            pick={selected && canEdit ? { value: point, onChange: setPoint } : undefined}
            fitKey={selectedId ?? 'none'}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {selected ? (
              <div className="text-[15px] text-slate-700">
                <b className="font-medium text-slate-900">{selected.name}</b> ·{' '}
                {point
                  ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
                  : 'No coordinates yet — click the map to place the pin.'}
              </div>
            ) : (
              <div className="text-[15px] text-slate-600">Select a farm from the list to begin.</div>
            )}
            {selected && canEdit && (
              <div className="flex gap-2">
                {selected.mapped && (
                  <Button variant="outline" onClick={() => save(null)} loading={saving}>
                    Clear
                  </Button>
                )}
                <Button disabled={!dirty} loading={saving} onClick={() => save(point)}>
                  <Save /> Save location
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Livestock GIS map ---------------- */

export function GisMapPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [barangay, setBarangay] = useState('');
  const [species, setSpecies] = useState('');
  const [type, setType] = useState('');
  const [layers, setLayers] = useState({ farms: true, cases: true, strays: false });
  const { data: farms } = useApi<FarmSummary[]>(`/api/farms${qs({ barangay, type })}`);
  const { data: cases } = useApi<CaseRow[]>(`/api/cases${qs({ barangay, species })}`);
  const { data: strays } = useApi<
    { id: number; code: string; species: string; lat: number | null; lng: number | null; barangay: string }[]
  >(layers.strays ? `/api/strays${qs({ barangay })}` : null);
  const shownFarms = useMemo(
    () =>
      (farms ?? [])
        .filter((f) => f.mapped)
        .filter((f) => !species || f.species.some((s) => s.species === species))
        .filter((f) => !q || `${f.name} ${f.ownerName}`.toLowerCase().includes(q.toLowerCase())),
    [farms, species, q],
  );
  const mappedCases = (cases ?? []).filter((c) => c.mapped);
  const head = shownFarms.reduce(
    (a, f) => a + (species ? (f.species.find((s) => s.species === species)?.count ?? 0) : f.total),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Livestock GIS Map"
        subtitle={`${shownFarms.length} farms · ${fmtNumber(head)} head · ${mappedCases.length} mapped cases (current filters)`}
      />
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search farm or owner"
            className="w-full sm:w-56"
            aria-label="Search farm or owner"
          />
          <FilterSelect
            label="Barangay"
            value={barangay}
            onChange={setBarangay}
            options={BARANGAYS}
            all="All barangays"
            className="w-[calc(50%-4px)] sm:w-48"
          />
          <FilterSelect
            label="Species"
            value={species}
            onChange={setSpecies}
            options={SPECIES}
            all="All species"
            className="w-[calc(50%-4px)] sm:w-36"
          />
          <FilterSelect
            label="Farm type"
            value={type}
            onChange={setType}
            options={FARM_TYPES.map((t) => ({ value: t, label: titleCase(t) }))}
            all="All farm types"
            className="w-full sm:w-36"
          />
          <div className="flex flex-wrap gap-4 sm:ml-auto">
            <Checkbox
              label="Farms"
              checked={layers.farms}
              onChange={(v) => setLayers((l) => ({ ...l, farms: v }))}
            />
            <Checkbox
              label="Disease cases"
              checked={layers.cases}
              onChange={(v) => setLayers((l) => ({ ...l, cases: v }))}
            />
            <Checkbox
              label="Stray incidents"
              checked={layers.strays}
              onChange={(v) => setLayers((l) => ({ ...l, strays: v }))}
            />
          </div>
        </div>
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <MapView
            className="h-[420px] lg:h-[600px]"
            farms={layers.farms ? shownFarms : []}
            cases={layers.cases ? mappedCases : []}
            strays={layers.strays ? (strays ?? []) : []}
            circles={
              layers.cases
                ? mappedCases
                    .filter((c) => c.status === 'POSITIVE')
                    .map((c) => ({ lat: c.lat!, lng: c.lng!, radius: 1000 }))
                : []
            }
            fitKey={`${barangay}${species}${type}`}
          />
          <CaseLegend includeSpecies />
        </div>
        <Card className="flex max-h-[480px] flex-col overflow-hidden lg:max-h-[488px]">
          <CardHeader title={`Farms (${shownFarms.length})`} />
          <ul className="flex-1 overflow-y-auto">
            {shownFarms.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/farms/${f.id}`)}
                  className="w-full border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="block text-[15px] text-slate-900">{f.name}</span>
                  <span className="block text-[12.5px] text-slate-500">
                    {f.barangay} · {f.total} head
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Disease outbreak map ---------------- */

export function OutbreakMapPage() {
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
        title="Disease Outbreak Map"
        subtitle={`${mapped.length} mapped cases · ${unmapped.length} awaiting geotagging`}
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
          <CaseLegend />
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

/* ---------------- Radius analysis ---------------- */

export function RadiusPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const { data: cases } = useApi<CaseRow[]>('/api/cases');
  const geocoded = (cases ?? []).filter((c) => c.mapped).sort((a, b) => a.id - b.id);
  const caseId =
    params.get('case') ??
    (geocoded.find((c) => c.status === 'POSITIVE') ?? geocoded[0])?.id?.toString() ??
    '';
  const [radius, setRadius] = useState(Number(params.get('radius')) || 1000);
  const [custom, setCustom] = useState(String(radius));
  const [bq, setBq] = useState('');
  const [bBarangay, setBBarangay] = useState('');
  const [bSpecies, setBSpecies] = useState('');
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
      (!bSpecies || f.species.some((s) => s.species === bSpecies)),
  );

  return (
    <div>
      <PageHeader
        title="Radius Analysis"
        subtitle="Identify farms within an assessment radius of a confirmed case."
        actions={
          <>
            <ExportButtons report={report} size="default" print={false} />
            <Button
              disabled={!caseId}
              onClick={() => navigate(`/reports?tab=outbreak&case=${caseId}&radius=${radius}`)}
            >
              <FileText /> Generate Outbreak-Area Report
            </Button>
          </>
        }
      />
      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="w-full lg:w-80">
            <div className="mb-1.5 text-[13.5px] font-medium text-slate-700">Ground-zero case</div>
            <FilterSelect
              label="Ground-zero case"
              value={caseId}
              onChange={setCase}
              options={geocoded.map((c) => ({
                value: String(c.id),
                label: `${c.code} · ${c.disease} (${CASE_STATUS_LABELS[c.status]})`,
              }))}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[15px] text-slate-800">Radius</div>
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
                    'h-9 rounded-md border px-3 text-[13.5px]',
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
        </div>
      </Card>
      {error && <ErrorBox error={error} />}
      {data && data.totals && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Farms within radius"
              value={data.totals.farms}
              sub={`Ground-zero farm + ${data.totals.nearby} nearby`}
            />
            <StatCard label="Livestock (current recorded)" value={fmtNumber(data.totals.livestock)} />
            <StatCard label="Owners affected" value={data.totals.owners} />
            <div className="card p-4">
              <div className="text-[13px] text-slate-600">Species</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {data.totals.species.map((s) => (
                  <SpeciesChip key={s.species} species={s.species} count={s.count} />
                ))}
              </div>
            </div>
          </div>
          {data.excluded > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[14.5px] text-slate-700">
              <Info className="h-4 w-4 text-sky-600" /> {data.excluded} active farm(s) excluded — no
              coordinates.{' '}
              <Link to="/geotagging?filter=unmapped" className="underline">
                Geotag
              </Link>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
            <MapView
              className="h-[380px] xl:h-[520px]"
              farms={data.farms
                .filter((f) => f.role !== 'Ground-zero farm')
                .map((f) => ({ ...f, inRadius: true }))}
              groundZero={data.center}
              circles={data.center ? [{ ...data.center, radius: data.radius }] : []}
              focusCircle={data.center ? { ...data.center, radius: data.radius } : undefined}
              fitKey={`${caseId}-${radius}`}
            />
            <Card>
              <CardHeader title={`Farms within ${formatRadius(data.radius)}`} />
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/farms/${r.id}`)}
                pageSize={0}
                minWidth={canEdit ? 680 : 560}
                defaultSort={{ key: 'distance', dir: 'asc' }}
                toolbar={
                  <>
                    <Input
                      value={bq}
                      onChange={(e) => setBq(e.target.value)}
                      placeholder="Search..."
                      className="w-full sm:w-56"
                      aria-label="Search farms within radius"
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
                        <div className="text-[12.5px] text-slate-500">
                          {r.ownerName} · {r.ownerContact ?? '—'}
                        </div>
                      </div>
                    ),
                  },
                  { key: 'barangay', header: 'Barangay' },
                  { key: 'total', header: 'Head' },
                  {
                    key: 'distance',
                    header: 'Distance',
                    cell: (r) => (
                      <div>
                        <div>{r.distance} m</div>
                        {r.role === 'Ground-zero farm' ? (
                          <Badge tone="violet">Ground-zero farm</Badge>
                        ) : (
                          <Badge tone="red">Within Assessment Radius</Badge>
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
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  navigate(`/cases/new?farm=${r.id}&from=${caseId}`);
                                }}
                              >
                                <Plus /> Report incident
                              </Button>
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
        <p className="mt-4 text-sm text-slate-500">No geocoded cases yet.</p>
      )}
    </div>
  );
}

export { caseMarkerKind };
