import { ArrowRightLeft, MoveRight, Pencil, Plus, Printer, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ANIMAL_STATUSES,
  SPECIES_COLORS,
  fmtDate,
  fmtDateTime,
  titleCase,
  type ReportResult,
  type Species,
} from '@livestock/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { printReport } from '@/lib/export';
import { fileUrl, qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { PhotoGallery } from '@/components/forms';
import { ErrorBox, FilterSelect, KV, Loading, PageHeader, Timeline } from '@/components/page';
import { ActiveBadge, CaseStatusBadge } from '@/components/status';
import { Badge, Button, Card, CardHeader, Input, Tabs } from '@/components/ui';
import { AnimalDialog, MoveGroupDialog, TransferDialog, type AnimalRecord } from '@/dialogs/animals';
import type { CaseRow, TransferRow, VaccinationRow } from './types';

type AnimalRow = AnimalRecord & { groupCode: string; barangay: string };

export function AnimalsPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [status, setStatus] = useState('ACTIVE');
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useApi<AnimalRow[]>(`/api/animals${qs({ status })}`);
  return (
    <div>
      <PageHeader
        title="Animal ID / Ear Tag Registry"
        subtitle="Individually identified animals — counted within their population group."
        actions={
          canEdit && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Register animal
            </Button>
          )
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <div className="border-b-2 border-slate-700/80 px-3 py-3">
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={ANIMAL_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
              all="All statuses"
              className="w-full sm:w-48"
            />
          </div>
          <DataTable
            rows={data}
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/animals/${r.id}`)}
            searchText={(r) => `${r.code} ${r.earTag ?? ''} ${r.species} ${r.ownerName} ${r.farmName}`}
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
          />
        </Card>
      )}
      <AnimalDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** Generic quadruped illustration tinted by species (used when no photo exists). */
function AnimalArt({ species, label }: { species: string; label: string }) {
  const c = SPECIES_COLORS[species as Species] ?? '#92400e';
  return (
    <div className="relative flex h-[150px] items-center justify-center rounded-md border-2 border-slate-800 bg-emerald-50">
      <span className="absolute left-0 right-0 top-2 text-center text-[14px] text-slate-700">{label}</span>
      <svg viewBox="0 0 200 120" className="mt-5 h-[110px]">
        <ellipse cx="110" cy="62" rx="62" ry="30" fill={c} />
        <circle cx="52" cy="40" r="18" fill={c} />
        <rect x="70" y="82" width="10" height="34" fill={c} />
        <rect x="140" y="82" width="10" height="34" fill={c} />
        <circle cx="122" cy="58" r="10" fill="#e7d3c0" />
      </svg>
    </div>
  );
}

interface AnimalDetail {
  animal: AnimalRow;
  vaccinations: VaccinationRow[];
  transfers: TransferRow[];
  cases: CaseRow[];
  history: { id: number; action: string; summary: string; byName: string | null; at: string }[];
}

export function AnimalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const lh = useLetterhead();
  const [tab, setTab] = useState<'vax' | 'own' | 'cases' | 'history'>('vax');
  const [dlg, setDlg] = useState<null | 'edit' | 'transfer' | 'move'>(null);
  const { data, isLoading, error } = useApi<AnimalDetail>(`/api/animals/${id}`);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const a = data.animal;

  const printSummary = () => {
    const r: ReportResult = {
      id: 'ownership-summary',
      title: `Ownership Summary — ${a.code}`,
      subtitle: `Ear tag ${a.earTag ?? '—'} · ${a.species} · ${a.sex} · current owner ${a.ownerName} (${a.farmName}, ${a.barangay})`,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'code', label: 'Record' },
        { key: 'from', label: 'From' },
        { key: 'to', label: 'To' },
        { key: 'type', label: 'Type' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: data.transfers.map((t) => ({
        date: fmtDate(t.date),
        code: t.code,
        from: `${t.fromOwnerName} · ${t.fromFarmName}`,
        to: `${t.toOwnerName} · ${t.toFarmName}`,
        type: titleCase(t.type),
        remarks: t.remarks ?? '—',
      })),
      summary: [
        { label: 'Breed', value: a.breed ?? '—' },
        { label: 'Markings', value: a.markings ?? '—' },
        { label: 'Status', value: titleCase(a.status) },
        { label: 'Transfers', value: data.transfers.length },
      ],
    };
    printReport(r, lh);
  };

  return (
    <div>
      <PageHeader
        title={a.code}
        subtitle={
          <span className="inline-flex items-center gap-2">
            Ear tag {a.earTag ?? '—'} · {a.species} <ActiveBadge status={a.status} />
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={printSummary}>
              <Printer /> Ownership summary
            </Button>
            {canEdit && a.status === 'ACTIVE' && (
              <Button variant="outline" onClick={() => setDlg('move')}>
                <MoveRight /> Move group
              </Button>
            )}
            {canEdit && a.status === 'ACTIVE' && (
              <Button variant="outline" onClick={() => setDlg('transfer')}>
                <ArrowRightLeft /> Transfer
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setDlg('edit')}>
                <Pencil /> Edit
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
        <Card className="p-4">
                    {a.photoKeys.length ? (
            <>
              <img
                src={fileUrl(a.photoKeys[0])!}
                alt={a.code}
                className="h-[150px] w-full rounded-md border-2 border-slate-800 object-cover"
              />
              {a.photoKeys.length > 1 && <PhotoGallery keys={a.photoKeys.slice(1)} className="mt-2" />}
            </>
          ) : (
            <AnimalArt species={a.species} label={a.code.replace(/-0+/, '-').replace(/^NC-[A-Z]-?/, 'NC-')} />
          )}
        </Card>
        <Card>
          <CardHeader title="Identification" />
          <div className="px-4 py-4">
            <KV
              rows={[
                ['Animal ID', a.code],
                ['Ear tag', a.earTag],
                [
                  'Current owner',
                  <Link className="link" to={`/owners/${a.ownerId}`}>
                    {a.ownerName}
                  </Link>,
                ],
                [
                  'Farm',
                  <Link className="link" to={`/farms/${a.farmId}`}>
                    {a.farmName}
                  </Link>,
                ],
                [
                  'Group',
                  <Link className="link" to={`/population?farm=${a.farmId}`}>
                    {a.groupCode}
                  </Link>,
                ],
                ['Breed', a.breed],
                ['Sex', a.sex],
                ['Age', a.estimatedAge ?? (a.dob ? `Born ${fmtDate(a.dob)}` : null)],
                ['Markings', a.markings],
                ['Cowlick', a.cowlick],
                ['Health', a.health],
                ['Remarks', a.remarks],
              ]}
            />
          </div>
        </Card>
      </div>
      <Tabs
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'vax', label: 'Vaccinations' },
          { id: 'own', label: `Ownership history (${data.transfers.length})` },
          { id: 'cases', label: 'Disease cases' },
          { id: 'history', label: 'Record history' },
        ]}
      />
      <div className="mt-4">
        {tab === 'vax' && (
          <Card>
            <DataTable
              rows={data.vaccinations}
              rowKey={(r) => r.id}
              pageSize={0}
              hideFooter
              defaultSort={{ key: 'date', dir: 'desc' }}
              columns={[
                { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
                { key: 'vaccine', header: 'Vaccine' },
                { key: 'species', header: 'Species' },
                { key: 'targetLabel', header: 'Target' },
                { key: 'doseNumber', header: 'Dose' },
                { key: 'nextDate', header: 'Next', cell: (r) => (r.nextDate ? fmtDate(r.nextDate) : '—') },
                { key: 'administeredBy', header: 'By' },
              ]}
              empty="No vaccinations recorded."
            />
            <p className="border-t border-slate-100 px-3 py-2.5 text-[13px] text-slate-500">
              Group-level events are shown for context; they don't identify this individual animal.
            </p>
          </Card>
        )}
        {tab === 'own' && (
          <Card>
            <DataTable
              rows={data.transfers}
              rowKey={(r) => r.id}
              pageSize={0}
              columns={[
                { key: 'code', header: 'Record' },
                { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
                {
                  key: 'from',
                  header: 'From',
                  sort: false,
                  cell: (r) => `${r.fromOwnerName} · ${r.fromFarmName}`,
                },
                { key: 'to', header: 'To', sort: false, cell: (r) => `${r.toOwnerName} · ${r.toFarmName}` },
                {
                  key: 'type',
                  header: 'Type',
                  cell: (r) => (
                    <Badge tone={r.type === 'REVERSAL' ? 'red' : 'green'}>{titleCase(r.type)}</Badge>
                  ),
                },
                { key: 'remarks', header: 'Remarks' },
              ]}
              empty="No ownership changes."
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
                { key: 'farmName', header: 'Farm' },
                { key: 'status', header: 'Status', cell: (r) => <CaseStatusBadge status={r.status} /> },
              ]}
              empty="No disease cases for this animal's species on its farm."
            />
          </Card>
        )}
        {tab === 'history' && (
          <Card>
            {data.history.length ? (
              <Timeline
                items={data.history.map((h) => ({
                  key: h.id,
                  meta: `${fmtDateTime(h.at)} · ${h.byName ?? 'System'}`,
                  title: titleCase(h.action),
                  body: h.summary,
                }))}
              />
            ) : (
              <p className="p-4 text-sm text-slate-500">No history yet.</p>
            )}
          </Card>
        )}
      </div>
      <AnimalDialog open={dlg === 'edit'} onOpenChange={(o) => setDlg(o ? 'edit' : null)} animal={a} />
      <MoveGroupDialog open={dlg === 'move'} onOpenChange={(o) => setDlg(o ? 'move' : null)} animal={a} />
      <TransferDialog
        open={dlg === 'transfer'}
        onOpenChange={(o) => setDlg(o ? 'transfer' : null)}
        animal={a}
      />
    </div>
  );
}

export function OwnershipPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<AnimalRow | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const { data, isLoading } = useApi<TransferRow[]>('/api/transfers');

  const lookup = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setLookupError(null);
    try {
      setFound(await api.get<AnimalRow>(`/api/animals/lookup?q=${encodeURIComponent(q.trim())}`));
    } catch (e) {
      setFound(null);
      setLookupError(e instanceof ApiError ? e.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Ownership Records"
        subtitle="Look up an animal by tag, record transfers and print ownership summaries."
      />
      <Card className="p-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Enter Animal ID or ear tag (e.g. NC-C-0001 or ET-2401)"
              className="pl-9"
              aria-label="Animal ID or ear tag"
            />
          </div>
          <Button type="submit" loading={busy}>
            Look up
          </Button>
        </form>
        {lookupError && <p className="mt-3 text-sm text-red-600">{lookupError}</p>}
        {found && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
                {found.code} <ActiveBadge status={found.status} />
              </div>
              <div className="text-[14px] text-slate-600">
                Ear tag {found.earTag ?? '—'} · {found.species} · {found.sex}
              </div>
              <div className="text-[14px] text-slate-600">
                Current owner: <b className="font-medium text-slate-900">{found.ownerName}</b> ·{' '}
                {found.farmName} ({found.barangay})
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/animals/${found.id}`)}>
                Open record
              </Button>
              {canEdit && found.status === 'ACTIVE' && (
                <Button onClick={() => setTransfer(true)}>
                  <ArrowRightLeft /> Record transfer
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
      <Card className="mt-4">
        <CardHeader title="All ownership transfers" className="border-b-0" />
        <DataTable
          rows={data}
          loading={isLoading}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/animals/${r.animalId}`)}
          pageSize={15}
          hideFooter={(data?.length ?? 0) <= 15}
          minWidth={980}
          defaultSort={{ key: 'date', dir: 'desc' }}
          columns={[
            { key: 'code', header: 'Record' },
            { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
            { key: 'animalCode', header: 'Animal' },
            {
              key: 'from',
              header: 'From',
              sort: (r) => r.fromOwnerName,
              cell: (r) => `${r.fromOwnerName} · ${r.fromFarmName}`,
            },
            {
              key: 'to',
              header: 'To',
              sort: (r) => r.toOwnerName,
              cell: (r) => `${r.toOwnerName} · ${r.toFarmName}`,
            },
            {
              key: 'type',
              header: 'Type',
              cell: (r) => <Badge tone={r.type === 'REVERSAL' ? 'red' : 'green'}>{titleCase(r.type)}</Badge>,
            },
            { key: 'remarks', header: 'Remarks' },
          ]}
          empty="No transfers recorded."
        />
      </Card>
      {found && (
        <TransferDialog
          open={transfer}
          onOpenChange={(o) => {
            setTransfer(o);
            if (!o) lookup();
          }}
          animal={found}
        />
      )}
    </div>
  );
}
