import {
  Archive,
  ClipboardCheck,
  ClipboardList,
  MapPin,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Stethoscope,
  Tag,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  BARANGAYS,
  FARM_TYPES,
  FARM_TYPE_LABELS,
  LIVESTOCK_RAISED,
  breakdownText,
  fmtDate,
  fmtMonth,
  titleCase,
  type Breakdown,
  type FarmType,
} from '@livestock/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { printFarmProfile } from '@/lib/print';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { MapView } from '@/components/MapView';
import { MoreMenu } from '@/components/MoreMenu';
import { ErrorBox, FilterSelect, KV, Loading, MiniStat, PageHeader } from '@/components/page';
import { ActiveBadge, CaseStatusBadge, RecordStatusBadge, SpeciesChip } from '@/components/status';
import { ActivityTimeline, LastVisit, RaisedBadge, SpeciesCard, sourceLabel } from '@/components/livestock';
import { Badge, Button, Card, CardHeader, Checkbox, Tabs } from '@/components/ui';
import { AnimalDialog } from '@/dialogs/animals';
import {
  FarmDialog,
  GroupDialog,
  GroupEditDialog,
  PopulationUpdateDialog,
  farmHasPasture,
} from '@/dialogs/registry';
import { FarmVisitDialog, ServiceDialog, ServiceEditDialog, type VisitRecord } from '@/dialogs/services';
import { DeleteDialog } from '@/dialogs/corrections';
import type { CaseRow, FarmSummary, VaccinationRow } from './types';

const scaleLabel = (t: string) => FARM_TYPE_LABELS[t as FarmType] ?? titleCase(t);
/** Days since a farm was last visited; farms not visited in this many days are flagged. */
const VISIT_DUE_DAYS = 90;
const daysSince = (d: string | null) =>
  d ? Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400_000) : Infinity;

export function FarmsPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [params] = useSearchParams();
  // Filters can come from a link (e.g. a chart on Analytics): ?barangay=…&type=…&location=unmapped
  const [barangay, setBarangay] = useState(params.get('barangay') ?? '');
  const [raised, setRaised] = useState(params.get('raised') ?? '');
  const [type, setType] = useState(params.get('type') ?? '');
  const [visit, setVisit] = useState(params.get('visit') ?? '');
  // ?location=unmapped lists the farms that still need a map pin.
  const [location, setLocation] = useState(params.get('location') ?? '');
  // Archived farms are listed on their own, to open and restore one.
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useApi<FarmSummary[]>(
    `/api/farms${qs({ barangay, type, location, archived: archived ? '1' : '' })}`,
  );
  // Counts per type of livestock raised (cards above the list double as quick filters).
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of data ?? []) m.set(f.livestockRaised, (m.get(f.livestockRaised) ?? 0) + 1);
    return m;
  }, [data]);
  const rows = (data ?? []).filter(
    (f) =>
      (!raised || f.livestockRaised === raised) &&
      (!visit ||
        (visit === 'due'
          ? daysSince(f.lastVisitAt) > VISIT_DUE_DAYS
          : daysSince(f.lastVisitAt) <= VISIT_DUE_DAYS)),
  );
  return (
    <div>
      <PageHeader
        title="Farms"
        subtitle={`Farm masterlist · ${rows.length} ${archived ? 'archived' : 'active'} farm${rows.length === 1 ? '' : 's'}`}
        actions={
          canEdit && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Add Farm
            </Button>
          )
        }
      />
      {!archived && (
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Livestock raised">
          {LIVESTOCK_RAISED.filter((r) => counts.get(r)).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRaised(raised === r ? '' : r)}
              aria-pressed={raised === r}
              className={`card flex items-center gap-2 px-3 py-2 text-left text-[14px] ${
                raised === r ? 'ring-2 ring-brand' : 'hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold text-slate-900">{counts.get(r)}</span>
              <span className="text-slate-600">{r}</span>
            </button>
          ))}
        </div>
      )}
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={rows}
            empty="No farms found. Clear the filters, or select “Add Farm”."
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/farms/${r.id}`)}
            searchText={(r) => `${r.code} ${r.name} ${r.ownerName} ${r.barangay} ${r.livestockRaised}`}
            searchPlaceholder="Search farm, owner or barangay..."
            minWidth={1100}
            toolbar={
              <>
                <FilterSelect
                  label="Barangay"
                  value={barangay}
                  onChange={setBarangay}
                  options={BARANGAYS}
                  all="All barangays"
                  className="w-[calc(50%-4px)] sm:w-44"
                />
                <FilterSelect
                  label="Livestock raised"
                  value={raised}
                  onChange={setRaised}
                  options={LIVESTOCK_RAISED}
                  all="All livestock"
                  className="w-[calc(50%-4px)] sm:w-40"
                />
                <FilterSelect
                  label="Farm scale"
                  value={type}
                  onChange={setType}
                  options={FARM_TYPES.map((t) => ({ value: t, label: FARM_TYPE_LABELS[t] }))}
                  all="Any scale"
                  className="w-[calc(50%-4px)] sm:w-36"
                />
                <FilterSelect
                  label="Farm visit"
                  value={visit}
                  onChange={setVisit}
                  options={[
                    { value: 'due', label: `Not visited in ${VISIT_DUE_DAYS} days` },
                    { value: 'recent', label: 'Visited recently' },
                  ]}
                  all="Any visit"
                  className="w-[calc(50%-4px)] sm:w-52"
                />
                <FilterSelect
                  label="Map location"
                  value={location}
                  onChange={setLocation}
                  options={[
                    { value: 'mapped', label: 'On the map' },
                    { value: 'unmapped', label: 'No map location' },
                  ]}
                  all="Any location"
                  className="w-full sm:w-40"
                />
                <Checkbox label="Show archived" checked={archived} onChange={setArchived} />
              </>
            }
            columns={[
              { key: 'code', header: 'Farm No.' },
              { key: 'name', header: 'Farm Name', className: 'font-medium text-slate-900' },
              { key: 'ownerName', header: 'Livestock Owner' },
              { key: 'barangay', header: 'Barangay' },
              {
                key: 'livestockRaised',
                header: 'Livestock Raised',
                cell: (r) => <RaisedBadge value={r.livestockRaised} />,
              },
              {
                key: 'species',
                header: 'Species',
                sort: false,
                cell: (r) => (
                  <div className="flex flex-wrap gap-1">
                    {r.species.filter((s) => s.count > 0).length ? (
                      r.species
                        .filter((s) => s.count > 0)
                        .map((s) => <SpeciesChip key={s.species} species={s.species} count={s.count} />)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                ),
              },
              { key: 'total', header: 'No. of Heads', className: 'font-semibold' },
              {
                key: 'lastVisitAt',
                header: 'Last Visit',
                cell: (r) => <LastVisit at={r.lastVisitAt} />,
              },
              {
                key: 'recordStatus',
                header: 'Head Count',
                sort: (r) => r.recordStatus,
                cell: (r) => <RecordStatusBadge status={r.recordStatus} label={r.recordStatusLabel} />,
              },
              {
                key: 'mapped',
                header: 'Map',
                sort: (r) => (r.mapped ? 1 : 0),
                cell: (r) =>
                  r.mapped ? <Badge tone="green">On map</Badge> : <Badge tone="red">No location</Badge>,
              },
            ]}
          />
        </Card>
      )}
      <FarmDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

interface FarmDetail {
  farm: FarmSummary & {
    pastureArea: number | null;
    pastureLocation: string | null;
    remarks: string | null;
    archived: boolean;
    createdAt: string;
    owner: { id: number; code: string; fullName: string; contact: string | null; barangay?: string };
  };
  groups: {
    id: number;
    code: string;
    species: string;
    breed: string | null;
    sex: string;
    lifeStage: string;
    count: number;
    tagged: number;
    healthStatus: string;
    lastVerified: string | null;
    breakdown: Breakdown | null;
  }[];
  animals: {
    id: number;
    code: string;
    earTag: string | null;
    species: string;
    sex: string;
    status: string;
    groupCode: string;
  }[];
  archivedGroups: { id: number; code: string; species: string; breed: string | null }[];
  cases: CaseRow[];
  vaccinations: VaccinationRow[];
  visits: VisitRecord[];
  updates: {
    id: number;
    month: string;
    groupCode: string;
    species: string;
    count: number;
    previous: number | null;
    change: number;
    reason: string | null;
    kind: 'VERIFIED' | 'ADJUSTMENT';
    superseded: boolean;
    createdBy: string | null;
  }[];
}

type FarmTab = 'overview' | 'livestock' | 'visits' | 'cases' | 'history' | 'animals';
type Dlg = null | 'edit' | 'group' | 'update' | 'animal' | 'service' | 'group-edit' | 'visit';

export function FarmDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const lh = useLetterhead();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as FarmTab) || 'overview';
  const setTab = (t: FarmTab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const [deleting, setDeleting] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [editGroup, setEditGroup] = useState<FarmDetail['groups'][number] | null>(null);
  const [classifyId, setClassifyId] = useState<number | null>(null);
  const [editVisit, setEditVisit] = useState<VisitRecord | null>(null);
  const [editService, setEditService] = useState<VaccinationRow | null>(null);
  const { data, isLoading, error } = useApi<FarmDetail>(`/api/farms/${id}`);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const f = data.farm;
  const openCases = data.cases.filter((c) => !c.closed);
  const live = data.groups.filter((g) => g.count > 0 || g.tagged > 0);
  const editable = canEdit && !f.archived;
  const dlgProps = (name: Exclude<Dlg, null>) => ({
    open: dlg === name,
    onOpenChange: (o: boolean) => setDlg(o ? name : null),
  });

  const archiveGroup = async (g: FarmDetail['groups'][number]) => {
    if (!confirm(`Remove ${g.species} (${g.code}) from this farm? It has 0 head. History is kept.`)) return;
    try {
      await api.post(`/api/population/groups/${g.id}/archive`);
      toast.success(`${g.species} removed from the farm.`);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not remove');
    }
  };

  const restore = async (url: string, done: string) => {
    try {
      await api.post(url);
      toast.success(done);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not restore');
    }
  };

  const archive = async () => {
    if (!confirm(`Archive ${f.name}? The farm must have no animals and no open disease cases.`)) return;
    try {
      await api.post(`/api/farms/${f.id}/archive`);
      toast.success('Farm archived.');
      qc.invalidateQueries();
      navigate('/farms');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not archive farm');
    }
  };

  // Farm visits and services on one timeline, newest first.
  const activity = [
    ...data.visits.map((v) => ({
      key: `v${v.id}`,
      date: v.date,
      sort: `${v.date}-1-${String(v.id).padStart(8, '0')}`,
      tone: (v.findings === 'SICK_ANIMALS' ? 'red' : 'green') as 'red' | 'green',
      title: <>Farm Visit · {v.purposeLabel}</>,
      tag: <Badge tone={v.findings === 'SICK_ANIMALS' ? 'red' : 'green'}>{v.findingsLabel}</Badge>,
      body: (
        <>
          {[v.visitedBy && `By ${v.visitedBy}`, v.caseCode && `Related case ${v.caseCode} (${v.caseDisease})`]
            .filter(Boolean)
            .join(' · ')}
          {v.remarks && <div className="text-slate-500">{v.remarks}</div>}
        </>
      ),
      actions: editable ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setEditVisit(v);
            setDlg('visit');
          }}
        >
          Edit
        </Button>
      ) : undefined,
    })),
    ...data.vaccinations
      .filter((s) => !s.voided)
      .map((s) => ({
        key: `s${s.id}`,
        date: s.date,
        sort: `${s.date}-0-${String(s.id).padStart(8, '0')}`,
        tone: (s.serviceType === 'DEWORMING'
          ? 'blue'
          : s.serviceType === 'VACCINATION'
            ? 'amber'
            : 'slate') as 'blue' | 'amber' | 'slate',
        title: (
          <>
            {s.serviceLabel} · {s.targetLabel}
          </>
        ),
        tag: undefined,
        body: [
          s.vaccine,
          s.administeredBy && `By ${s.administeredBy}`,
          s.nextDate && `Next: ${fmtDate(s.nextDate)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        actions: editable ? (
          <Button size="xs" variant="ghost" onClick={() => setEditService(s)}>
            Edit
          </Button>
        ) : undefined,
      })),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  return (
    <div>
      <PageHeader
        title={f.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {f.code} · {f.barangay} · {scaleLabel(f.type)} <RaisedBadge value={f.livestockRaised} />
            {f.archived && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          <>
            {editable && (
              <>
                <Button
                  onClick={() => {
                    setEditVisit(null);
                    setDlg('visit');
                  }}
                >
                  <ClipboardCheck /> Record Farm Visit
                </Button>
                <Button variant="outline" onClick={() => setDlg('service')}>
                  <Stethoscope /> Record Service
                </Button>
                <Button variant="outline" onClick={() => setDlg('edit')}>
                  <Pencil /> Edit Farm
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => printFarmProfile(data, lh, user?.name)}>
              <Printer /> Print
            </Button>
            {canEdit && (
              <MoreMenu
                items={[
                  f.archived
                    ? {
                        label: 'Restore farm',
                        icon: RotateCcw,
                        onSelect: () => restore(`/api/farms/${f.id}/restore`, 'Farm restored.'),
                      }
                    : {
                        label: 'Archive farm',
                        icon: Archive,
                        hint: 'Closed down; needs no animals and no open cases',
                        onSelect: archive,
                      },
                  isAdmin && {
                    label: 'Delete (entered by mistake)',
                    icon: Trash2,
                    danger: true,
                    hint: 'Only if the farm has no records yet',
                    onSelect: () => setDeleting(true),
                  },
                ]}
              />
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Total livestock" value={`${f.total} head`} />
        <MiniStat label="Livestock raised" value={<span className="text-[17px]">{f.livestockRaised}</span>} />
        <MiniStat
          label="Last farm visit"
          value={
            <span className="text-[17px]">{f.lastVisitAt ? fmtDate(f.lastVisitAt) : 'Not visited yet'}</span>
          }
        />
        <MiniStat label="Open disease cases" value={openCases.length} />
      </div>
      <Tabs
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'livestock', label: `Livestock (${live.length})` },
          { id: 'visits', label: `Visits & Services (${activity.length})` },
          { id: 'cases', label: `Disease Cases (${data.cases.length})` },
          { id: 'history', label: 'Head Count History' },
          { id: 'animals', label: `Ear Tags (${data.animals.length})` },
        ]}
      />
      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Farm Information" />
              <div className="px-4 py-4">
                <KV
                  rows={[
                    ['Farm No.', f.code],
                    ['Farm name', f.name],
                    ['Farm scale', scaleLabel(f.type)],
                    ['Livestock raised', <RaisedBadge value={f.livestockRaised} />],
                    ['Barangay / Zone', `${f.barangay}${f.zone ? ` · ${f.zone}` : ''}`],
                    ['Address', f.address],
                    // Pasture details appear only for farms whose animals graze on a pasture.
                    ...(farmHasPasture(f)
                      ? ([
                          ['Pasture area', f.pastureArea != null ? `${f.pastureArea} ha` : null],
                          [
                            'Pasture location',
                            [
                              f.pastureLocation,
                              f.pastureLat != null ? `${f.pastureLat}, ${f.pastureLng}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          ],
                        ] as [string, string | null][])
                      : []),
                    [
                      'Map location',
                      f.mapped ? `${f.lat}, ${f.lng}` : <Badge tone="red">No map location</Badge>,
                    ],
                    ['Source of record', sourceLabel(f.source)],
                    ['Added to masterlist', fmtDate(f.createdAt)],
                    ['Remarks', f.remarks],
                  ]}
                />
              </div>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader
                  title="Livestock Owner"
                  actions={
                    <Link className="link text-[14px]" to={`/owners/${f.owner.id}`}>
                      Open owner record
                    </Link>
                  }
                />
                <div className="px-4 py-4">
                  <KV
                    rows={[
                      ['Name', f.owner.fullName],
                      ['Owner No.', f.owner.code],
                      ['Contact', f.owner.contact],
                      ['Barangay', f.owner.barangay],
                    ]}
                  />
                </div>
              </Card>
              <Card>
                <CardHeader title="Location" />
                <div className="p-4">
                  {f.mapped || f.pastureLat != null ? (
                    <MapView
                      className="h-[260px]"
                      farms={f.mapped ? [f] : []}
                      pastures={
                        f.pastureLat != null
                          ? [{ id: f.id, name: f.name, lat: f.pastureLat, lng: f.pastureLng }]
                          : []
                      }
                    />
                  ) : (
                    <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-slate-500">
                      This farm has no map location yet.
                      {editable && (
                        <Button variant="outline" size="sm" onClick={() => setDlg('edit')}>
                          <MapPin /> Set location
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </div>
            <Card className="lg:col-span-2">
              <CardHeader
                title="Livestock Population"
                actions={
                  <Button size="xs" variant="outline" onClick={() => setTab('livestock')}>
                    View details
                  </Button>
                }
              />
              <div className="flex flex-wrap gap-2 px-4 py-4">
                {live.length ? (
                  live.map((g) => (
                    <span
                      key={g.id}
                      className="rounded-md bg-slate-100 px-3 py-1.5 text-[14px] text-slate-700"
                    >
                      <b className="font-semibold text-slate-900">{g.count}</b> {g.species}
                      {g.breakdown && breakdownText(g.species, g.breakdown) ? (
                        <span className="text-slate-500"> — {breakdownText(g.species, g.breakdown)}</span>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="text-[14px] text-slate-500">No livestock recorded yet.</span>
                )}
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent Visits & Services"
                actions={
                  <Button size="xs" variant="outline" onClick={() => setTab('visits')}>
                    View all
                  </Button>
                }
              />
              <ActivityTimeline
                items={activity.slice(0, 4)}
                empty="No farm visits or services recorded yet. Select “Record Farm Visit” after each visit."
              />
            </Card>
          </div>
        )}
        {tab === 'livestock' && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] text-slate-600">
                Head count per species with the classification by age, sex and production stage.
              </p>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDlg('group')}>
                    <Plus /> Add Species
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setClassifyId(null);
                      setDlg('update');
                    }}
                    disabled={!data.groups.length}
                  >
                    <ClipboardList /> Update Head Count
                  </Button>
                </div>
              )}
            </div>
            {data.groups.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.groups.map((g) => (
                  <SpeciesCard
                    key={g.id}
                    species={g.species}
                    count={g.count}
                    breed={g.breed}
                    breakdown={g.breakdown}
                    meta={
                      <>
                        {g.code} · {g.healthStatus}
                        {g.tagged ? ` · ${g.tagged} tagged` : ''} · counted {fmtMonth(g.lastVerified)}
                      </>
                    }
                    actions={
                      editable && (
                        <>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setClassifyId(g.id);
                              setDlg('update');
                            }}
                          >
                            Update count / classify
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              setEditGroup(g);
                              setDlg('group-edit');
                            }}
                          >
                            Edit details
                          </Button>
                          {g.count === 0 && g.tagged === 0 && (
                            <Button size="xs" variant="ghost" onClick={() => archiveGroup(g)}>
                              Remove
                            </Button>
                          )}
                        </>
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <Card>
                <p className="px-4 py-8 text-center text-[14.5px] text-slate-500">
                  No livestock recorded yet. Select “Add Species” for each kind of animal kept on this farm.
                </p>
              </Card>
            )}
            {data.archivedGroups.length > 0 && (
              <Card className="mt-4">
                <CardHeader title="Removed Species" />
                <ul className="space-y-1.5 px-4 py-3">
                  {data.archivedGroups.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-3 text-[14px] text-slate-600"
                    >
                      <span>
                        {g.species}
                        {g.breed ? ` (${g.breed})` : ''} · {g.code}
                      </span>
                      {editable && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            restore(`/api/population/groups/${g.id}/restore`, `${g.species} restored.`)
                          }
                        >
                          <RotateCcw /> Restore
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
        {tab === 'visits' && (
          <Card>
            <CardHeader
              title="Farm Visits & Veterinary Services"
              actions={
                editable && (
                  <>
                    <Button size="xs" variant="outline" onClick={() => setDlg('service')}>
                      <Stethoscope /> Record Service
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => {
                        setEditVisit(null);
                        setDlg('visit');
                      }}
                    >
                      <ClipboardCheck /> Record Farm Visit
                    </Button>
                  </>
                )
              }
            />
            <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-2 text-[12.5px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Visit, no signs of disease
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Visit, sick animals found
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-500" /> Deworming
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Vaccination
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" /> Check-up / other service
              </span>
            </div>
            <ActivityTimeline items={activity} empty="No farm visits or services recorded yet." />
          </Card>
        )}
        {tab === 'cases' && (
          <Card>
            <DataTable
              rows={data.cases}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/cases/${r.id}`)}
              pageSize={0}
              columns={[
                { key: 'code', header: 'Case No.' },
                { key: 'reportedAt', header: 'Date Reported', cell: (r) => fmtDate(r.reportedAt) },
                { key: 'disease', header: 'Disease' },
                { key: 'species', header: 'Species' },
                { key: 'status', header: 'Status', cell: (r) => <CaseStatusBadge status={r.status} /> },
              ]}
              empty="No disease cases for this farm."
            />
          </Card>
        )}
        {tab === 'history' && (
          <Card>
            <DataTable
              rows={data.updates}
              rowKey={(r) => r.id}
              columns={[
                { key: 'month', header: 'Month', cell: (r) => fmtMonth(r.month) },
                { key: 'species', header: 'Species' },
                { key: 'previous', header: 'Previous', cell: (r) => r.previous ?? '—' },
                { key: 'count', header: 'No. of Heads' },
                {
                  key: 'change',
                  header: 'Change',
                  cell: (r) => (
                    <span className={r.change > 0 ? 'text-emerald-600' : r.change < 0 ? 'text-red-600' : ''}>
                      {r.change > 0 ? `+${r.change}` : r.change}
                    </span>
                  ),
                },
                { key: 'reason', header: 'Reason' },
                {
                  key: 'superseded',
                  header: 'Entry',
                  cell: (r) =>
                    r.superseded ? (
                      <Badge>Replaced</Badge>
                    ) : r.kind === 'ADJUSTMENT' ? (
                      <Badge tone="blue">Automatic</Badge>
                    ) : (
                      <Badge tone="green">Counted</Badge>
                    ),
                },
                { key: 'createdBy', header: 'Recorded By' },
              ]}
            />
          </Card>
        )}
        {tab === 'animals' && (
          <Card>
            <CardHeader
              title="Ear-Tagged Animals"
              actions={
                editable && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setDlg('animal')}
                    disabled={!data.groups.length}
                  >
                    <Tag /> Tag an Animal
                  </Button>
                )
              }
            />
            <DataTable
              rows={data.animals}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/animals/${r.id}`)}
              pageSize={0}
              columns={[
                { key: 'earTag', header: 'Ear Tag' },
                { key: 'code', header: 'Animal ID' },
                { key: 'species', header: 'Species' },
                { key: 'sex', header: 'Sex' },
                { key: 'status', header: 'Status', cell: (r) => <ActiveBadge status={r.status} /> },
              ]}
              empty="No tagged animals. Tag cattle, carabao and breeders; other animals are counted by species."
            />
          </Card>
        )}
      </div>
      {deleting && (
        <DeleteDialog
          open
          onOpenChange={setDeleting}
          url={`/api/farms/${f.id}`}
          what={f.name}
          onDeleted={() => navigate('/farms')}
        />
      )}
      <FarmDialog {...dlgProps('edit')} farm={f} />
      <GroupDialog {...dlgProps('group')} farmId={f.id} />
      <GroupEditDialog {...dlgProps('group-edit')} group={editGroup} />
      <PopulationUpdateDialog
        {...dlgProps('update')}
        farm={f}
        groups={data.groups}
        classifyGroupId={classifyId}
      />
      <AnimalDialog {...dlgProps('animal')} />
      <ServiceDialog {...dlgProps('service')} farmId={f.id} />
      <FarmVisitDialog
        {...dlgProps('visit')}
        farm={f}
        groups={data.groups}
        cases={openCases.map((c) => ({ id: c.id, code: c.code, disease: c.disease }))}
        visit={editVisit}
      />
      <ServiceEditDialog
        open={!!editService}
        onOpenChange={(o) => !o && setEditService(null)}
        record={editService}
      />
    </div>
  );
}
