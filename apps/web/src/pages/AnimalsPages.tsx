import { ArrowRightLeft, MoveRight, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ANIMAL_STATUSES,
  SPECIES_COLORS,
  fmtDate,
  fmtDateTime,
  isLargeRuminant,
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
import { DocumentLinks, PhotoGallery } from '@/components/forms';
import { MoreMenu } from '@/components/MoreMenu';
import { ErrorBox, FilterSelect, KV, Loading, PageHeader, Timeline } from '@/components/page';
import { ActiveBadge, CaseStatusBadge } from '@/components/status';
import { Badge, Button, Card, CardHeader, Input, Tabs } from '@/components/ui';
import {
  AnimalDialog,
  hasCowlick,
  MoveGroupDialog,
  TransferDialog,
  type AnimalRecord,
} from '@/dialogs/animals';
import { DeleteDialog } from '@/dialogs/corrections';
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
            empty="No tagged animals found. Select “Register animal” to give an animal its ID / ear tag."
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
    <div className="relative flex h-[150px] items-center justify-center rounded-lg border-2 border-slate-800 bg-brand-light">
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
  insurance: {
    id: number;
    policyNo: string | null;
    ownerId: number;
    ownerName: string;
    applicationDate: string | null;
    applicationType: string;
    subsidized: boolean;
    fileKeys: string[];
    status: string;
  }[];
}

/** Everything that happened to one animal, newest first: services, transfers, cases, insurance, edits. */
function animalActivity(d: AnimalDetail) {
  const items = [
    ...d.vaccinations.map((v) => ({
      key: `v${v.id}`,
      at: `${v.date}T12:00:00`,
      meta: fmtDate(v.date),
      title: `${v.serviceLabel}${v.target === 'GROUP' ? ' (whole group)' : ''}`,
      tag: 'Service',
      body: [v.resultLabel, v.vaccine, v.administeredBy && `by ${v.administeredBy}`]
        .filter(Boolean)
        .join(' · '),
    })),
    ...d.transfers.map((t) => ({
      key: `t${t.id}`,
      at: `${t.date}T12:00:00`,
      meta: fmtDate(t.date),
      title: `${titleCase(t.type)}: ${t.fromOwnerName} → ${t.toOwnerName}`,
      tag: 'Ownership',
      body: t.remarks ?? '',
    })),
    ...d.cases.map((c) => ({
      key: `c${c.id}`,
      at: `${c.reportedAt}T12:00:00`,
      meta: fmtDate(c.reportedAt),
      title: `${c.code} · ${c.disease} on the farm`,
      tag: 'Disease',
      body: c.classLabel ?? c.statusLabel,
    })),
    ...d.insurance.map((p) => ({
      key: `p${p.id}`,
      at: `${p.applicationDate ?? ''}T12:00:00`,
      meta: fmtDate(p.applicationDate),
      title: `PCIC insurance application (${p.applicationType === 'RENEWAL' ? 'renewal' : 'new'})`,
      tag: 'Insurance',
      body: titleCase(p.status),
    })),
    ...d.history
      .filter((h) => h.action !== 'vaccination')
      .map((h) => ({
        key: `h${h.id}`,
        at: h.at,
        meta: `${fmtDateTime(h.at)} · ${h.byName ?? 'System'}`,
        title: titleCase(h.action),
        tag: 'Record',
        body: h.summary,
      })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export function AnimalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, isAdmin } = useAuth();
  const lh = useLetterhead();
  const [tab, setTab] = useState<'activity' | 'vax' | 'own' | 'cases'>('activity');
  const [dlg, setDlg] = useState<null | 'edit' | 'transfer' | 'move' | 'delete'>(null);
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
            {/* Sold or died is a status (Edit); Delete is only for an animal registered by mistake. */}
            <MoreMenu
              items={[
                isAdmin && {
                  label: 'Delete (entered by mistake)',
                  icon: Trash2,
                  danger: true,
                  hint: 'Only if it has no vaccinations, transfers or insurance',
                  onSelect: () => setDlg('delete'),
                },
              ]}
            />
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
                className="h-[150px] w-full rounded-lg border-2 border-slate-800 object-cover"
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
                ...(hasCowlick(a.species) || a.cowlick
                  ? [['Cowlick', a.cowlick] as [string, string | null]]
                  : []),
                ...(isLargeRuminant(a.species)
                  ? ([
                      ['Purpose', a.purposeLabel],
                      [
                        'Ownership certificate',
                        a.colcNo ? (
                          <span className="inline-flex flex-wrap items-center gap-x-2">
                            {a.colcNo}
                            {a.colcDate && (
                              <span className="text-slate-500">issued {fmtDate(a.colcDate)}</span>
                            )}
                            <DocumentLinks keys={a.colcFileKeys ?? []} empty="" />
                          </span>
                        ) : (
                          <span className="text-slate-400">Not recorded</span>
                        ),
                      ],
                    ] as [string, ReactNode][])
                  : []),
                ['Health', a.health ? a.health.charAt(0).toUpperCase() + a.health.slice(1) : '—'],
                [
                  'PCIC insurance',
                  data.insurance.length ? (
                    <div className="space-y-0.5">
                      {data.insurance.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-x-2">
                          <Link className="link" to={`/owners/${p.ownerId}`}>
                            Application {fmtDate(p.applicationDate)}
                          </Link>
                          <span className="text-slate-500">
                            {titleCase(p.status)}
                            {p.subsidized ? ' · RSBSA subsidized' : ''}
                          </span>
                          <DocumentLinks keys={p.fileKeys} empty="" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    'Not insured'
                  ),
                ],
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
          { id: 'activity', label: 'Activity log' },
          { id: 'vax', label: 'Deworming & services' },
          { id: 'own', label: `Ownership history (${data.transfers.length})` },
          { id: 'cases', label: 'Disease cases' },
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
                { key: 'serviceLabel', header: 'Service' },
                {
                  key: 'vaccine',
                  header: 'Product / result',
                  cell: (r) => [r.resultLabel, r.vaccine].filter(Boolean).join(' · ') || '—',
                },
                { key: 'targetLabel', header: 'Target' },
                { key: 'nextDate', header: 'Next', cell: (r) => (r.nextDate ? fmtDate(r.nextDate) : '—') },
                { key: 'administeredBy', header: 'By' },
              ]}
              empty="No deworming or other services recorded."
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
        {tab === 'activity' && (
          <Card>
            <CardHeader title="Activity Log" />
            {(() => {
              const items = animalActivity(data);
              return items.length ? (
                <Timeline items={items} />
              ) : (
                <p className="p-4 text-sm text-slate-500">Nothing recorded yet.</p>
              );
            })()}
          </Card>
        )}
      </div>
      <AnimalDialog open={dlg === 'edit'} onOpenChange={(o) => setDlg(o ? 'edit' : null)} animal={a} />
      {dlg === 'delete' && (
        <DeleteDialog
          open
          onOpenChange={(o) => !o && setDlg(null)}
          url={`/api/animals/${a.id}`}
          what={a.code}
          onDeleted={() => navigate('/animals')}
        />
      )}
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
