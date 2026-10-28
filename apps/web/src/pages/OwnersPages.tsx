import { Archive, IdCard, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { BARANGAYS, OWNER_STATUSES, fmtDate, fmtDateTime, titleCase } from '@livestock/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { printOwnerCard } from '@/lib/print';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, KV, Loading, MiniStat, PageHeader } from '@/components/page';
import { ActiveBadge, CaseStatusBadge, StrayStatusBadge } from '@/components/status';
import { Badge, Button, Card, CardHeader, Checkbox, Tabs } from '@/components/ui';
import {
  ArchiveOwnerDialog,
  FarmDialog,
  OwnerDialog,
  PcicDialog,
  type OwnerRecord,
  type PcicRecord,
} from '@/dialogs/registry';
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
}

export function OwnersPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [barangay, setBarangay] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState(false);
  const [rsbsa, setRsbsa] = useState('');
  const [open, setOpen] = useState(false);
  const {
    data: all,
    isLoading,
    error,
  } = useApi<OwnerRow[]>(`/api/owners${qs({ barangay, status, archived })}`);
  const data = all?.filter((o) => !rsbsa || (rsbsa === 'yes' ? !!o.rsbsa : !o.rsbsa));
  const activeCount = all?.filter((o) => o.status !== 'ARCHIVED').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Livestock Owners"
        subtitle={`${activeCount} registered owners`}
        actions={
          canEdit && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Register owner
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
            onRowClick={(r) => navigate(`/owners/${r.id}`)}
            searchText={(r) => `${r.code} ${r.fullName} ${r.barangay} ${r.contact ?? ''} ${r.rsbsa ?? ''}`}
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
                <Checkbox label="Show archived" checked={archived} onChange={setArchived} />
              </>
            }
            columns={[
              { key: 'code', header: 'Owner ID' },
              { key: 'fullName', header: 'Name', className: 'font-medium text-slate-900' },
              { key: 'barangay', header: 'Barangay' },
              { key: 'contact', header: 'Contact', sort: false },
              {
                key: 'rsbsa',
                header: 'RSBSA No.',
                cell: (r) => r.rsbsa ?? <span className="text-slate-400">—</span>,
              },
              { key: 'farms', header: 'Farms' },
              { key: 'livestock', header: 'Livestock' },
              { key: 'status', header: 'Status', cell: (r) => <ActiveBadge status={r.status} /> },
            ]}
          />
        </Card>
      )}
      <OwnerDialog open={open} onOpenChange={setOpen} />
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

type OwnerTab = 'info' | 'farms' | 'animals' | 'ownership' | 'vaccinations' | 'incidents' | 'pcic';

export function OwnerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const lh = useLetterhead();
  const [tab, setTab] = useState<OwnerTab>('info');
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
                  <Pencil /> Edit
                </Button>
                {archived ? (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await api.post(`/api/owners/${o.id}/restore`);
                      toast.success('Owner restored.');
                      qc.invalidateQueries();
                    }}
                  >
                    <RotateCcw /> Restore
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setArchive(true)}>
                    <Archive /> Archive
                  </Button>
                )}
                {!archived && (
                  <Button onClick={() => setAddFarm(true)}>
                    <Plus /> Add farm
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Farms" value={data.stats.farms} />
        <MiniStat label="Current livestock" value={data.stats.livestock} />
        <MiniStat label="Tagged animals" value={data.stats.tagged} />
        <MiniStat label="Disease cases" value={data.stats.cases} />
      </div>
      <Tabs
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'info', label: 'Personal Info' },
          { id: 'farms', label: `Registered Farms (${data.farms.length})` },
          { id: 'animals', label: 'Livestock Records' },
          { id: 'ownership', label: 'Ownership History' },
          { id: 'vaccinations', label: 'Vaccination Records' },
          { id: 'incidents', label: 'Disease & Incident History' },
          { id: 'pcic', label: 'PCIC Insurance' },
        ]}
      />
      <div className="mt-4">
        {tab === 'info' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.05fr]">
            <Card>
              <CardHeader title="Personal information" />
              <div className="px-4 py-4">
                <KV
                  rows={[
                    ['Owner ID', o.code],
                    ['Full name', o.fullName],
                    ['Barangay', o.barangay],
                    ['Zone / Purok', o.zone],
                    ['Street address', o.street],
                    ['Contact number', o.contact],
                    ['RSBSA number', o.rsbsa],
                    ['Registered', fmtDate(o.registeredAt)],
                    ['Remarks', o.remarks],
                  ]}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Farm locations" />
              <div className="p-4">
                <MapView className="h-[290px]" farms={data.farms} />
              </div>
            </Card>
          </div>
        )}
        {tab === 'farms' && (
          <Card>
            <DataTable
              rows={data.farms}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/farms/${r.id}`)}
              pageSize={0}
              hideFooter
              columns={[
                { key: 'code', header: 'Farm ID' },
                { key: 'name', header: 'Name' },
                { key: 'barangay', header: 'Barangay' },
                { key: 'type', header: 'Type' },
                { key: 'total', header: 'Livestock' },
                {
                  key: 'mapped',
                  header: 'Location',
                  cell: (r) =>
                    r.mapped ? <Badge tone="green">Geotagged</Badge> : <Badge tone="red">No coords</Badge>,
                },
                { key: 'tagged', header: 'Tagged' },
              ]}
              empty="No farms registered for this owner."
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
                { key: 'code', header: 'Animal ID' },
                { key: 'earTag', header: 'Ear tag' },
                { key: 'species', header: 'Species' },
                { key: 'sex', header: 'Sex' },
                { key: 'ownerName', header: 'Owner' },
                { key: 'farmName', header: 'Farm' },
                { key: 'status', header: 'Status', cell: (r) => <ActiveBadge status={r.status} /> },
              ]}
              empty="No individually tagged animals."
            />
          </Card>
        )}
        {tab === 'ownership' && (
          <Card>
            <DataTable
              rows={data.transfers}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/animals/${r.animalId}`)}
              pageSize={0}
              columns={[
                { key: 'code', header: 'Record' },
                { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
                { key: 'animalCode', header: 'Animal' },
                {
                  key: 'from',
                  header: 'From',
                  cell: (r) => `${r.fromOwnerName} · ${r.fromFarmName}`,
                  sort: false,
                },
                { key: 'to', header: 'To', cell: (r) => `${r.toOwnerName} · ${r.toFarmName}`, sort: false },
                {
                  key: 'type',
                  header: 'Type',
                  cell: (r) => (
                    <Badge tone={r.type === 'REVERSAL' ? 'red' : 'green'}>{titleCase(r.type)}</Badge>
                  ),
                },
              ]}
              empty="No ownership transfers."
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
                { key: 'vaccine', header: 'Vaccine' },
                { key: 'species', header: 'Species' },
                { key: 'targetLabel', header: 'Target' },
                { key: 'farmName', header: 'Farm' },
                { key: 'doseNumber', header: 'Dose' },
                { key: 'nextDate', header: 'Next', cell: (r) => (r.nextDate ? fmtDate(r.nextDate) : '—') },
              ]}
              empty="No vaccination records."
            />
          </Card>
        )}
        {tab === 'incidents' && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Disease cases" />
              <DataTable
                rows={data.cases}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/cases/${r.id}`)}
                pageSize={0}
                columns={[
                  { key: 'code', header: 'Case' },
                  { key: 'reportedAt', header: 'Reported', cell: (r) => fmtDate(r.reportedAt) },
                  { key: 'disease', header: 'Disease' },
                  { key: 'farmName', header: 'Farm' },
                  { key: 'status', header: 'Status', cell: (r) => <CaseStatusBadge status={r.status} /> },
                ]}
                empty="No disease cases."
              />
            </Card>
            <Card>
              <CardHeader title="Stray & violation incidents" />
              <DataTable
                rows={data.strays}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/strays?open=${r.id}`)}
                pageSize={0}
                columns={[
                  { key: 'code', header: 'Incident' },
                  { key: 'discoveredAt', header: 'Discovered', cell: (r) => fmtDateTime(r.discoveredAt) },
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
        {tab === 'pcic' && (
          <Card>
            <CardHeader
              title="PCIC livestock insurance"
              actions={
                canEdit && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setPcicEdit(null);
                      setAddPcic(true);
                    }}
                  >
                    <Plus /> Add policy
                  </Button>
                )
              }
            />
            <DataTable
              rows={data.pcic}
              rowKey={(r) => r.id}
              pageSize={0}
              columns={[
                { key: 'policyNo', header: 'Policy No.' },
                { key: 'species', header: 'Species' },
                { key: 'heads', header: 'Heads' },
                {
                  key: 'animals',
                  header: 'Insured animals',
                  sort: false,
                  cell: (r) =>
                    r.animals?.length ? (
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {r.animals.map((a) => (
                          <Link key={a.id} to={`/animals/${a.id}`} className="link text-[13px]">
                            {a.earTag ?? a.code}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">Not linked</span>
                    ),
                },
                {
                  key: 'amountCovered',
                  header: 'Amount covered',
                  cell: (r) => (r.amountCovered ? `₱${r.amountCovered.toLocaleString()}` : '—'),
                },
                {
                  key: 'startDate',
                  header: 'Coverage',
                  cell: (r) => `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`,
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r) => (
                    <div>
                      <Badge
                        tone={
                          r.status === 'ACTIVE'
                            ? 'green'
                            : r.status === 'CLAIMED'
                              ? 'blue'
                              : r.status === 'EXPIRED'
                                ? 'amber'
                                : 'slate'
                        }
                      >
                        {titleCase(r.status)}
                      </Badge>
                      {r.remarks && <div className="mt-0.5 text-[12.5px] text-slate-500">{r.remarks}</div>}
                    </div>
                  ),
                },
                ...(canEdit
                  ? [
                      {
                        key: 'actions',
                        header: '',
                        sort: false as const,
                        cell: (r: PcicRecord) => (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setPcicEdit(r);
                              setAddPcic(true);
                            }}
                          >
                            Update
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
              empty="No insurance policies on record."
            />
          </Card>
        )}
      </div>
      <OwnerDialog open={edit} onOpenChange={setEdit} owner={o} />
      {archive && <ArchiveOwnerDialog open={archive} onOpenChange={setArchive} owner={o} />}
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
