import { Archive, ClipboardList, MapPin, Pencil, Plus, Printer, Syringe } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { BARANGAYS, FARM_TYPES, fmtDate, fmtMonth, titleCase } from '@livestock/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { printFarmProfile } from '@/lib/print';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, KV, Loading, MiniStat, PageHeader } from '@/components/page';
import { ActiveBadge, CaseStatusBadge, RecordStatusBadge, SpeciesChip } from '@/components/status';
import { Badge, Button, Card, CardHeader, Tabs } from '@/components/ui';
import { AnimalDialog } from '@/dialogs/animals';
import { FarmDialog, GroupDialog, GroupEditDialog, PopulationUpdateDialog } from '@/dialogs/registry';
import { VaccinationDialog } from '@/dialogs/surveillance';
import type { CaseRow, FarmSummary, VaccinationRow } from './types';

export function FarmsPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [barangay, setBarangay] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useApi<FarmSummary[]>(`/api/farms${qs({ barangay, type, location })}`);
  return (
    <div>
      <PageHeader
        title="Farms"
        subtitle={`${data?.length ?? 0} active farms`}
        actions={
          canEdit && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Register farm
            </Button>
          )
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={data}
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/farms/${r.id}`)}
            searchText={(r) => `${r.code} ${r.name} ${r.ownerName} ${r.barangay}`}
            minWidth={1100}
            toolbar={
              <>
                <FilterSelect
                  label="Barangay"
                  value={barangay}
                  onChange={setBarangay}
                  options={BARANGAYS}
                  all="All barangays"
                  className="w-[calc(50%-4px)] sm:w-48"
                />
                <FilterSelect
                  label="Type"
                  value={type}
                  onChange={setType}
                  options={FARM_TYPES.map((t) => ({ value: t, label: titleCase(t) }))}
                  all="All types"
                  className="w-[calc(50%-4px)] sm:w-32"
                />
                <FilterSelect
                  label="Location"
                  value={location}
                  onChange={setLocation}
                  options={[
                    { value: 'mapped', label: 'Mapped' },
                    { value: 'unmapped', label: 'No coordinates' },
                  ]}
                  all="Any location"
                  className="w-full sm:w-44"
                />
              </>
            }
            columns={[
              { key: 'code', header: 'Farm ID' },
              { key: 'name', header: 'Farm', className: 'font-medium text-slate-900' },
              { key: 'ownerName', header: 'Owner' },
              { key: 'barangay', header: 'Barangay' },
              { key: 'type', header: 'Type', cell: (r) => titleCase(r.type) },
              {
                key: 'species',
                header: 'SPECIES',
                sort: false,
                cell: (r) => (
                  <div className="flex flex-wrap gap-1">
                    {r.species.length ? (
                      r.species.map((s) => (
                        <SpeciesChip key={s.species} species={s.species} count={s.count} />
                      ))
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                ),
              },
              { key: 'total', header: 'Total', className: 'font-semibold' },
              {
                key: 'recordStatus',
                header: 'POPULATION RECORD',
                sort: (r) => r.recordStatus,
                cell: (r) => <RecordStatusBadge status={r.recordStatus} label={r.recordStatusLabel} />,
              },
              {
                key: 'mapped',
                header: 'GIS',
                sort: (r) => (r.mapped ? 1 : 0),
                cell: (r) =>
                  r.mapped ? <Badge tone="green">Mapped</Badge> : <Badge tone="red">No coords</Badge>,
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
    remarks: string | null;
    archived: boolean;
    createdAt: string;
    owner: { id: number; code: string; fullName: string; contact: string | null };
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
  cases: CaseRow[];
  vaccinations: VaccinationRow[];
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

type FarmTab = 'overview' | 'groups' | 'animals' | 'history' | 'vaccinations' | 'cases';

export function FarmDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, user } = useAuth();
  const qc = useQueryClient();
  const lh = useLetterhead();
  const [tab, setTab] = useState<FarmTab>('overview');
  const [dlg, setDlg] = useState<null | 'edit' | 'group' | 'update' | 'animal' | 'vax' | 'group-edit'>(null);
  const [editGroup, setEditGroup] = useState<FarmDetail['groups'][number] | null>(null);
  const { data, isLoading, error } = useApi<FarmDetail>(`/api/farms/${id}`);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const f = data.farm;

  const archiveGroup = async (g: FarmDetail['groups'][number]) => {
    if (!confirm(`Archive group ${g.code} (${g.species})? It has 0 head.`)) return;
    try {
      await api.post(`/api/population/groups/${g.id}/archive`);
      toast.success(`Group ${g.code} archived.`);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not archive group');
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

  return (
    <div>
      <PageHeader
        title={f.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {f.code} · {f.barangay} · {titleCase(f.type)}{' '}
            <RecordStatusBadge status={f.recordStatus} label={f.recordStatusLabel} />
            {f.archived && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => printFarmProfile(data, lh, user?.name)}>
              <Printer /> Print profile
            </Button>
            {canEdit && !f.archived && (
              <>
                <Button variant="outline" asChild>
                  <Link to={`/geotagging?farm=${f.id}`}>
                    <MapPin /> {f.mapped ? 'Edit location' : 'Geotag'}
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setDlg('vax')}>
                  <Syringe /> Vaccination
                </Button>
                <Button variant="outline" onClick={() => setDlg('edit')}>
                  <Pencil /> Edit
                </Button>
                <Button variant="outline" onClick={archive}>
                  <Archive /> Archive
                </Button>
                <Button onClick={() => setDlg('update')} disabled={!data.groups.length}>
                  <ClipboardList /> Update population
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Current livestock" value={f.total} />
        <MiniStat label="Population groups" value={data.groups.length} />
        <MiniStat label="Tagged animals" value={f.tagged} />
        <MiniStat label="Disease cases" value={data.cases.length} />
      </div>
      <Tabs
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'groups', label: `Population Groups (${data.groups.length})` },
          { id: 'animals', label: 'Tagged Animals' },
          { id: 'history', label: 'Update History' },
          { id: 'vaccinations', label: 'Vaccinations' },
          { id: 'cases', label: 'Disease Cases' },
        ]}
      />
      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Farm information" />
              <div className="px-4 py-4">
                <KV
                  rows={[
                    ['Farm ID', f.code],
                    [
                      'Owner',
                      <Link className="link" to={`/owners/${f.owner.id}`}>
                        {f.owner.fullName}
                      </Link>,
                    ],
                    ['Contact', f.owner.contact],
                    ['Type', titleCase(f.type)],
                    ['Barangay / Zone', `${f.barangay}${f.zone ? ` · ${f.zone}` : ''}`],
                    ['Address', f.address],
                    ['Pasture area', f.pastureArea != null ? `${f.pastureArea} ha` : null],
                    [
                      'Coordinates',
                      f.mapped ? `${f.lat}, ${f.lng}` : <Badge tone="red">No coordinates</Badge>,
                    ],
                    [
                      'Species',
                      <div className="flex flex-wrap gap-1">
                        {f.species.map((s) => (
                          <SpeciesChip key={s.species} species={s.species} count={s.count} />
                        ))}
                      </div>,
                    ],
                    ['Registered', fmtDate(f.createdAt)],
                    ['Remarks', f.remarks],
                  ]}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Location" />
              <div className="p-4">
                {f.mapped ? (
                  <MapView className="h-[340px]" farms={[f]} />
                ) : (
                  <div className="flex h-[340px] items-center justify-center rounded-lg border border-dashed text-sm text-slate-500">
                    This farm has no coordinates yet.
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
        {tab === 'groups' && (
          <Card>
            <CardHeader
              title="Population groups"
              actions={
                canEdit && (
                  <>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setDlg('animal')}
                      disabled={!data.groups.length}
                    >
                      <Plus /> Register animal
                    </Button>
                    <Button variant="outline" size="xs" onClick={() => setDlg('group')}>
                      <Plus /> Add group
                    </Button>
                  </>
                )
              }
            />
            <DataTable
              rows={data.groups}
              rowKey={(r) => r.id}
              pageSize={0}
              columns={[
                { key: 'code', header: 'Group' },
                { key: 'species', header: 'Species' },
                { key: 'breed', header: 'Breed' },
                { key: 'sex', header: 'Sex' },
                { key: 'count', header: 'Count', className: 'font-semibold' },
                { key: 'tagged', header: 'Tagged' },
                { key: 'healthStatus', header: 'Health' },
                { key: 'lastVerified', header: 'Last verified', cell: (r) => fmtMonth(r.lastVerified) },
                ...(canEdit && !f.archived
                  ? [
                      {
                        key: 'actions',
                        header: '',
                        sort: false as const,
                        cell: (r: FarmDetail['groups'][number]) => (
                          <div className="flex gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setEditGroup(r);
                                setDlg('group-edit');
                              }}
                            >
                              Edit
                            </Button>
                            {r.count === 0 && r.tagged === 0 && (
                              <Button size="xs" variant="ghost" onClick={() => archiveGroup(r)}>
                                Archive
                              </Button>
                            )}
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
              empty="No population groups yet."
            />
          </Card>
        )}
        {tab === 'animals' && (
          <Card>
            <DataTable
              rows={data.animals}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/animals/${r.id}`)}
              pageSize={0}
              columns={[
                { key: 'code', header: 'Animal ID' },
                { key: 'earTag', header: 'Ear tag' },
                { key: 'species', header: 'Species' },
                { key: 'sex', header: 'Sex' },
                { key: 'groupCode', header: 'Group' },
                { key: 'status', header: 'Status', cell: (r) => <ActiveBadge status={r.status} /> },
              ]}
              empty="No tagged animals on this farm."
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
                { key: 'groupCode', header: 'Group' },
                { key: 'species', header: 'Species' },
                { key: 'previous', header: 'Previous', cell: (r) => r.previous ?? '—' },
                { key: 'count', header: 'Count' },
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
                      <Badge>Superseded</Badge>
                    ) : r.kind === 'ADJUSTMENT' ? (
                      <Badge tone="blue">System adjustment</Badge>
                    ) : (
                      <Badge tone="green">Verified count</Badge>
                    ),
                },
                { key: 'createdBy', header: 'By' },
              ]}
            />
          </Card>
        )}
        {tab === 'vaccinations' && (
          <Card>
            <DataTable
              rows={data.vaccinations}
              rowKey={(r) => r.id}
              columns={[
                { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
                {
                  key: 'vaccine',
                  header: 'Vaccine',
                  cell: (r) =>
                    r.voided ? (
                      <span>
                        <span className="text-slate-400 line-through">{r.vaccine}</span> <Badge>Voided</Badge>
                      </span>
                    ) : (
                      r.vaccine
                    ),
                },
                { key: 'species', header: 'Species' },
                { key: 'targetLabel', header: 'Target' },
                { key: 'doseNumber', header: 'Dose' },
                {
                  key: 'nextDate',
                  header: 'Next',
                  cell: (r) =>
                    r.nextDate ? (
                      <span>
                        {fmtDate(r.nextDate)} {r.reminderDone && <Badge tone="green">Given</Badge>}
                      </span>
                    ) : (
                      '—'
                    ),
                },
                { key: 'administeredBy', header: 'By' },
              ]}
              empty="No vaccinations recorded."
            />
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
                { key: 'code', header: 'Case' },
                { key: 'reportedAt', header: 'Reported', cell: (r) => fmtDate(r.reportedAt) },
                { key: 'disease', header: 'Disease' },
                { key: 'species', header: 'Species' },
                { key: 'status', header: 'Status', cell: (r) => <CaseStatusBadge status={r.status} /> },
              ]}
              empty="No disease cases for this farm."
            />
          </Card>
        )}
      </div>
      <FarmDialog open={dlg === 'edit'} onOpenChange={(o) => setDlg(o ? 'edit' : null)} farm={f} />
      <GroupDialog open={dlg === 'group'} onOpenChange={(o) => setDlg(o ? 'group' : null)} farmId={f.id} />
      <GroupEditDialog
        open={dlg === 'group-edit'}
        onOpenChange={(o) => setDlg(o ? 'group-edit' : null)}
        group={editGroup}
      />
      <PopulationUpdateDialog
        open={dlg === 'update'}
        onOpenChange={(o) => setDlg(o ? 'update' : null)}
        farm={f}
        groups={data.groups}
      />
      <AnimalDialog open={dlg === 'animal'} onOpenChange={(o) => setDlg(o ? 'animal' : null)} />
      <VaccinationDialog open={dlg === 'vax'} onOpenChange={(o) => setDlg(o ? 'vax' : null)} farmId={f.id} />
    </div>
  );
}