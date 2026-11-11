import { Archive, IdCard, Pencil, Plus, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  BARANGAYS,
  OWNER_STATUSES,
  RECORD_SOURCES,
  RECORD_SOURCE_LABELS,
  fmtDate,
  fmtDateTime,
  titleCase,
} from '@livestock/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { printOwnerCard } from '@/lib/print';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { MapView } from '@/components/MapView';
import { MoreMenu } from '@/components/MoreMenu';
import { ErrorBox, FilterSelect, KV, Loading, MiniStat, PageHeader } from '@/components/page';
import { ActiveBadge, CaseStatusBadge, SpeciesChip, StrayStatusBadge } from '@/components/status';
import { ActivityTimeline, LastVisit, RaisedBadge, sourceLabel } from '@/components/livestock';
import { Badge, Button, Card, CardHeader, Checkbox, Tabs } from '@/components/ui';
import {
  ArchiveOwnerDialog,
  FarmDialog,
  OwnerDialog,
  PcicDialog,
  type OwnerRecord,
  type PcicRecord,
} from '@/dialogs/registry';
import { RegisterRaiser } from '@/dialogs/RegisterRaiser';
import { DeleteDialog } from '@/dialogs/corrections';
import type { CaseRow, FarmSummary, TransferRow, VaccinationRow } from './types';

interface OwnerRow {
  id: number;
  code: string;
  fullName: string;
  barangay: string;
  contact: string | null;
  rsbsa: string | null;
  farms: number;
  livestock: number;
  status: string;
  source: string | null;
}

export function OwnersPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [barangay, setBarangay] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState(false);
  const [params] = useSearchParams();
  // ?rsbsa=no lists the owners still without an RSBSA number (linked from Record completeness).
  const [rsbsa, setRsbsa] = useState(params.get('rsbsa') ?? '');
  const [source, setSource] = useState('');
  const [open, setOpen] = useState(false);
  const [raiser, setRaiser] = useState(false);
  const {
    data: all,
    isLoading,
    error,
  } = useApi<OwnerRow[]>(`/api/owners${qs({ barangay, status, archived })}`);
  const data = all?.filter(
    (o) => (!rsbsa || (rsbsa === 'yes' ? !!o.rsbsa : !o.rsbsa)) && (!source || o.source === source),
  );
  const activeCount = all?.filter((o) => o.status !== 'ARCHIVED').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Livestock Owners"
        subtitle={`Owner masterlist · ${activeCount} livestock owner${activeCount === 1 ? '' : 's'} (from DA lists and farm visits)`}
        actions={
          canEdit && (
            <>
              <Button variant="outline" onClick={() => setOpen(true)}>
                <Plus /> Add Owner
              </Button>
              {/* Owner, farm and animals in one guided flow. */}
              <Button onClick={() => setRaiser(true)}>
                <UserPlus /> Add Owner, Farm and Livestock
              </Button>
            </>
          )
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={data}
            empty="No owners found. Clear the filters, or select “Add Owner, Farm and Livestock”."
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/owners/${r.id}`)}
            searchText={(r) => `${r.code} ${r.fullName} ${r.barangay} ${r.contact ?? ''} ${r.rsbsa ?? ''}`}
            searchPlaceholder="Search name, contact or RSBSA number"
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
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={OWNER_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
                  all="All statuses"
                  className="w-[calc(50%-4px)] sm:w-36"
                />
                <FilterSelect
                  label="RSBSA"
                  value={rsbsa}
                  onChange={setRsbsa}
                  options={[
                    { value: 'yes', label: 'With RSBSA No.' },
                    { value: 'no', label: 'No RSBSA No.' },
                  ]}
                  all="RSBSA: all"
                  className="w-[calc(50%-4px)] sm:w-40"
                />
                <FilterSelect
                  label="Source"
                  value={source}
                  onChange={setSource}
                  options={RECORD_SOURCES.map((x) => ({ value: x, label: RECORD_SOURCE_LABELS[x] }))}
                  all="Any source"
                  className="w-[calc(50%-4px)] sm:w-44"
                />
                <Checkbox label="Show archived" checked={archived} onChange={setArchived} />
              </>
            }
            columns={[
              { key: 'code', header: 'Owner No.' },
              { key: 'fullName', header: 'Livestock Owner', className: 'font-medium text-slate-900' },
              { key: 'barangay', header: 'Barangay' },
              { key: 'contact', header: 'Contact', sort: false },
              {
                key: 'rsbsa',
                header: 'RSBSA No.',
                cell: (r) => r.rsbsa ?? <span className="text-slate-400">—</span>,
              },
              { key: 'farms', header: 'Farms' },
              { key: 'livestock', header: 'No. of Heads' },
              {
                key: 'source',
                header: 'Source',
                cell: (r) => sourceLabel(r.source) ?? <span className="text-slate-400">—</span>,
              },
              { key: 'status', header: 'Status', cell: (r) => <ActiveBadge status={r.status} /> },
            ]}
          />
        </Card>
      )}
      <OwnerDialog open={open} onOpenChange={setOpen} />
      <RegisterRaiser open={raiser} onOpenChange={setRaiser} />
    </div>
  );
}

interface OwnerDetail {
  owner: OwnerRecord & { registeredAt: string };
  stats: { farms: number; livestock: number; tagged: number; cases: number };
  farms: FarmSummary[];
  animals: {
    id: number;
    code: string;
    earTag: string | null;
    species: string;
    sex: string;
    status: string;
    ownerName: string;
    farmName: string;
  }[];
  transfers: TransferRow[];
  vaccinations: VaccinationRow[];
  cases: CaseRow[];
  strays: {
    id: number;
    code: string;
    discoveredAt: string;
    species: string;
    status: string;
    violations: number;
    barangay: string;
    fineAmount: number | null;
    finePaid: boolean;
  }[];
  pcic: PcicRecord[];
}

type OwnerTab = 'profile' | 'farms' | 'services' | 'incidents' | 'animals';

const PCIC_TONE: Record<string, 'green' | 'blue' | 'amber' | 'slate'> = {
  ACTIVE: 'green',
  CLAIMED: 'blue',
  EXPIRED: 'amber',
};

export function OwnerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, isAdmin } = useAuth();
  const qc = useQueryClient();
  const lh = useLetterhead();
  const [del, setDel] = useState<null | { url: string; what: string; owner?: boolean }>(null);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as OwnerTab) || 'profile';
  const setTab = (t: OwnerTab) => setParams(t === 'profile' ? {} : { tab: t }, { replace: true });
  const [edit, setEdit] = useState(false);
  const [archive, setArchive] = useState(false);
  const [addFarm, setAddFarm] = useState(false);
  const [addPcic, setAddPcic] = useState(false);
  const [pcicEdit, setPcicEdit] = useState<PcicRecord | null>(null);
  const { data, isLoading, error } = useApi<OwnerDetail>(`/api/owners/${id}`);

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const o = data.owner;
  const archived = o.status === 'ARCHIVED';
  const services = data.vaccinations.filter((v) => !v.voided);

  return (
    <div>
      <PageHeader
        title={o.fullName}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {o.code} · {o.barangay} <ActiveBadge status={o.status} />
          </span>
        }
        actions={
          <>
            {!archived && (
              <Button
                variant="outline"
                onClick={() =>
                  printOwnerCard(
                    { ...o, farms: data.farms.map((f) => ({ code: f.code, name: f.name, total: f.total })) },
                    lh,
                  )
                }
              >
                <IdCard /> Print ID card
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => setEdit(true)}>
                  <Pencil /> Edit Owner
                </Button>
                {!archived && (
                  <Button onClick={() => setAddFarm(true)}>
                    <Plus /> Add Farm
                  </Button>
                )}
                {/* Archive / Restore and Delete are in the same "More" menu on every record. */}
                <MoreMenu
                  items={[
                    archived
                      ? {
                          label: 'Restore owner',
                          icon: RotateCcw,
                          onSelect: async () => {
                            await api.post(`/api/owners/${o.id}/restore`);
                            toast.success('Owner restored.');
                            qc.invalidateQueries();
                          },
                        }
                      : {
                          label: 'Archive owner',
                          icon: Archive,
                          hint: 'No longer raising livestock; kept for history',
                          onSelect: () => setArchive(true),
                        },
                    isAdmin && {
                      label: 'Delete (entered by mistake)',
                      icon: Trash2,
                      danger: true,
                      hint: 'Only if the owner has no records yet',
                      onSelect: () => setDel({ url: `/api/owners/${o.id}`, what: o.fullName, owner: true }),
                    },
                  ]}
                />
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Farms" value={data.stats.farms} />
        <MiniStat label="Total livestock" value={`${data.stats.livestock} head`} />
        <MiniStat label="Insured (PCIC)" value={data.pcic.filter((p) => p.status === 'ACTIVE').length} />
        <MiniStat label="Disease cases" value={data.stats.cases} />
      </div>
      <Tabs
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'profile', label: 'Owner Profile' },
          { id: 'farms', label: `Farms (${data.farms.length})` },
          { id: 'services', label: `Deworming & Services (${services.length})` },
          { id: 'incidents', label: 'Disease & Incidents' },
          { id: 'animals', label: `Ear Tags (${data.animals.length})` },
        ]}
      />
      <div className="mt-4">
        {tab === 'profile' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.05fr]">
            <div className="space-y-4">
              <Card>
                <CardHeader title="Personal Information" />
                <div className="px-4 py-4">
                  <KV
                    rows={[
                      ['Owner No.', o.code],
                      ['Full name', o.fullName],
                      ['Barangay', o.barangay],
                      ['Zone / Purok', o.zone],
                      ['Street address', o.street],
                      ['Contact number', o.contact],
                      ['RSBSA number', o.rsbsa],
                      ['Source of record', sourceLabel(o.source)],
                      ['Added to masterlist', fmtDate(o.registeredAt)],
                      ['Remarks', o.remarks],
                    ]}
                  />
                </div>
              </Card>
              <Card>
                <CardHeader title="Ownership Records" />
                {data.transfers.length ? (
                  <ul className="divide-y divide-slate-100">
                    {data.transfers.map((t) => (
                      <li key={t.id}>
                        <Link
                          to={`/animals/${t.animalId}`}
                          className="flex flex-col gap-0.5 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span>
                            <span className="text-[14.5px] font-medium text-slate-900">
                              {t.earTag ?? t.animalCode}
                            </span>
                            <span className="text-[13.5px] text-slate-600">
                              {' '}
                              · {t.fromOwnerName} → {t.toOwnerName}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 text-[13px] text-slate-500">
                            {fmtDate(t.date)}
                            <Badge tone={t.type === 'REVERSAL' ? 'red' : 'green'}>{titleCase(t.type)}</Badge>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-4 text-[14px] text-slate-500">
                    No sales or transfers of tagged animals recorded.
                  </p>
                )}
              </Card>
              <Card>
                <CardHeader
                  title="Insurance (PCIC)"
                  actions={
                    canEdit &&
                    !archived && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setPcicEdit(null);
                          setAddPcic(true);
                        }}
                      >
                        <Plus /> Add Policy
                      </Button>
                    )
                  }
                />
                {data.pcic.length ? (
                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                    {data.pcic.map((p) => (
                      <div
                        key={p.id}
                        role="group"
                        aria-label={`Policy ${p.policyNo}`}
                        className="rounded-lg border border-slate-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[14.5px] font-semibold text-slate-900">{p.policyNo}</div>
                            <div className="text-[13px] text-slate-600">
                              {p.species} · {p.heads} head
                              {p.amountCovered ? ` · ₱${p.amountCovered.toLocaleString()}` : ''}
                            </div>
                          </div>
                          <Badge tone={PCIC_TONE[p.status] ?? 'slate'}>{titleCase(p.status)}</Badge>
                        </div>
                        <div className="mt-1.5 text-[12.5px] text-slate-500">
                          {fmtDate(p.startDate)} – {fmtDate(p.endDate)}
                        </div>
                        {!!p.animals?.length && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {p.animals.map((a) => (
                              <Link key={a.id} to={`/animals/${a.id}`} className="link text-[12.5px]">
                                {a.earTag ?? a.code}
                              </Link>
                            ))}
                          </div>
                        )}
                        {p.remarks && <div className="mt-1 text-[12.5px] text-slate-500">{p.remarks}</div>}
                        {canEdit && (
                          <div className="mt-2 flex gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setPcicEdit(p);
                                setAddPcic(true);
                              }}
                            >
                              Update
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-4 text-[14px] text-slate-500">No insurance policies on record.</p>
                )}
              </Card>
            </div>
            <Card className="self-start">
              <CardHeader title="Farm Locations" />
              <div className="p-4">
                <MapView className="h-[320px]" farms={data.farms} />
              </div>
            </Card>
          </div>
        )}
        {tab === 'farms' &&
          (data.farms.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.farms.map((f) => (
                <Link
                  key={f.id}
                  to={`/farms/${f.id}`}
                  className="card block p-4 hover:ring-2 hover:ring-brand/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[15.5px] font-semibold text-slate-900">{f.name}</div>
                      <div className="text-[13px] text-slate-500">
                        {f.code} · {f.barangay}
                        {f.zone ? ` · ${f.zone}` : ''}
                      </div>
                    </div>
                    <RaisedBadge value={f.livestockRaised} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {f.species
                      .filter((x) => x.count > 0)
                      .map((x) => (
                        <SpeciesChip key={x.species} species={x.species} count={x.count} />
                      ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                    <div>
                      <div className="text-slate-500">No. of heads</div>
                      <div className="font-semibold text-slate-900">{f.total}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Last visit</div>
                      <LastVisit at={f.lastVisitAt} />
                    </div>
                  </div>
                  {!f.mapped && (
                    <div className="mt-2">
                      <Badge tone="red">No map location</Badge>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <p className="px-4 py-8 text-center text-[14.5px] text-slate-500">
                No farms yet. Select “Add Farm” and pin it on the map.
              </p>
            </Card>
          ))}
        {tab === 'services' && (
          <Card>
            <CardHeader title="Deworming & Veterinary Services" />
            <ActivityTimeline
              items={services.map((v) => ({
                key: v.id,
                date: v.date,
                tone:
                  v.serviceType === 'DEWORMING'
                    ? 'blue'
                    : v.serviceType === 'VACCINATION'
                      ? 'amber'
                      : 'slate',
                title: (
                  <>
                    {v.serviceLabel} · {v.targetLabel}
                  </>
                ),
                body: [v.farmName, v.vaccine, v.nextDate && `Next: ${fmtDate(v.nextDate)}`]
                  .filter(Boolean)
                  .join(' · '),
              }))}
              empty="No deworming or veterinary services recorded."
            />
          </Card>
        )}
        {tab === 'animals' && (
          <Card>
            <DataTable
              rows={data.animals}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/animals/${r.id}`)}
              searchText={(r) => `${r.code} ${r.earTag ?? ''} ${r.species}`}
              pageSize={0}
              columns={[
                { key: 'earTag', header: 'Ear Tag' },
                { key: 'code', header: 'Animal ID' },
                { key: 'species', header: 'Species' },
                { key: 'sex', header: 'Sex' },
                { key: 'farmName', header: 'Farm' },
                { key: 'status', header: 'Status', cell: (r) => <ActiveBadge status={r.status} /> },
              ]}
              empty="No individually tagged animals."
            />
          </Card>
        )}
        {tab === 'incidents' && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Disease Cases" />
              <DataTable
                rows={data.cases}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/cases/${r.id}`)}
                pageSize={0}
                columns={[
                  { key: 'code', header: 'Case No.' },
                  { key: 'reportedAt', header: 'Date Reported', cell: (r) => fmtDate(r.reportedAt) },
                  { key: 'disease', header: 'Disease' },
                  { key: 'farmName', header: 'Farm' },
                  { key: 'status', header: 'Status', cell: (r) => <CaseStatusBadge status={r.status} /> },
                ]}
                empty="No disease cases."
              />
            </Card>
            <Card>
              <CardHeader title="Stray & Violation Incidents" />
              <DataTable
                rows={data.strays}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/strays?open=${r.id}`)}
                pageSize={0}
                columns={[
                  { key: 'code', header: 'Incident No.' },
                  { key: 'discoveredAt', header: 'Date Found', cell: (r) => fmtDateTime(r.discoveredAt) },
                  { key: 'species', header: 'Species' },
                  { key: 'barangay', header: 'Barangay' },
                  { key: 'status', header: 'Status', cell: (r) => <StrayStatusBadge status={r.status} /> },
                  { key: 'violations', header: 'Violations' },
                  {
                    key: 'fineAmount',
                    header: 'Fine',
                    cell: (r) =>
                      r.fineAmount ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          ₱{r.fineAmount.toLocaleString()}
                          {r.finePaid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Unpaid</Badge>}
                        </span>
                      ) : (
                        '—'
                      ),
                  },
                ]}
                empty="No stray incidents."
              />
            </Card>
          </div>
        )}
      </div>
      <OwnerDialog open={edit} onOpenChange={setEdit} owner={o} />
      {archive && <ArchiveOwnerDialog open={archive} onOpenChange={setArchive} owner={o} />}
      {del && (
        <DeleteDialog
          open
          onOpenChange={(x) => !x && setDel(null)}
          url={del.url}
          what={del.what}
          onDeleted={() => del.owner && navigate('/owners')}
        />
      )}
      <FarmDialog open={addFarm} onOpenChange={setAddFarm} ownerId={o.id} />
      <PcicDialog
        open={addPcic}
        onOpenChange={setAddPcic}
        ownerId={o.id}
        policy={pcicEdit}
        animals={data.animals}
      />
    </div>
  );
}
