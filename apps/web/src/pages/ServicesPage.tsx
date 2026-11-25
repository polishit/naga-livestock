import { CloudOff, MapPin, Plus, Printer, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BARANGAYS,
  MIN_DATE,
  SERVICE_SPECIES_ORDER,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  fmtDate,
  fmtMonth,
  isoMonth,
  type ReportResult,
  type ServiceType,
} from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { runSync } from '@/lib/api';
import { useApi, useOnline, useOutbox } from '@/lib/hooks';
import { db } from '@/lib/offline';
import { printReport } from '@/lib/export';
import { monthDays, qs } from '@/lib/utils';
import { ChartCard, ServiceTrendBars, SpeciesHeadBars } from '@/components/charts';
import { DataTable, type Column } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { ActivityTimeline } from '@/components/livestock';
import {} from '@/components/ScheduleCalendar';
import {
  ErrorBox,
  FilterBar,
  FilterField,
  FilterSelect,
  Loading,
  MoreFilters,
  PageHeader,
  StatCard,
} from '@/components/page';
import { Badge, Button, Card, CardHeader, Input, Tabs } from '@/components/ui';
import { VoidDialog } from '@/dialogs/surveillance';
import {
  FarmVisitDialog,
  FarmVisitLauncher,
  ServiceDialog,
  ServiceEditDialog,
  type VisitRecord,
} from '@/dialogs/services';
import type { CoverageRow, VaccinationRow } from './types';

interface MonthlySummary {
  month: string;
  label: string;
  services: {
    type: ServiceType;
    label: string;
    records: number;
    head: number;
    farms: number;
    bySpecies: { species: string; head: number; farms: number }[];
  }[];
  visits: { total: number; farms: number; sickFound: number };
  trend: { month: string; label: string; dewormed: number; checkups: number; visits: number }[];
}

/**
 * Activity Log tabs. Field visits are part of the log (type "Farm Visit"); the upcoming schedule is on
 * the Vaccination Schedule page.
 */
type Tab = 'log' | 'coverage' | 'summary';
const OLD_TABS: Record<string, Tab> = { records: 'log', overview: 'summary', visits: 'log' };
/** The "Farm Visit" choice of the Service filter. */
const VISIT = 'VISIT';

/** One line of the Activity Log: a service given, or a visit to a farm. */
interface LogRow {
  key: string;
  date: string;
  label: string;
  tone: 'blue' | 'amber' | 'green' | 'violet' | 'slate' | 'red';
  farmId: number;
  farmName: string | null;
  barangay: string | null;
  species: string | null;
  count: number | null;
  product: string;
  by: string | null;
  remarks: string | null;
  service?: VaccinationRow;
  visit?: VisitRecord;
}

const SERVICE_TONE: Record<string, 'blue' | 'amber' | 'green' | 'violet' | 'slate'> = {
  DEWORMING: 'blue',
  VACCINATION: 'amber',
  CHECKUP: 'green',
  PREGNANCY_DIAGNOSIS: 'violet',
  INSEMINATION: 'violet',
  TREATMENT: 'violet',
  OTHER: 'slate',
};
const speciesRank = (s: string) => {
  const i = (SERVICE_SPECIES_ORDER as readonly string[]).indexOf(s);
  return i < 0 ? 99 : i;
};

/**
 * Activity Log (Veterinary Field Services): every deworming, check-up, vaccination and other service
 * given in the field. It works without internet: entries recorded offline are kept on this device,
 * listed at the top as "Waiting to Sync", and sent automatically once the connection returns.
 */
export default function ServicesPage() {
  const [params] = useSearchParams();
  // Old links to the Field Visits tab list the farm visits in the log.
  if (params.get('tab') === 'visits') {
    const p = new URLSearchParams(params);
    p.delete('tab');
    p.set('type', VISIT);
    return <Navigate to={`/services?${p.toString()}`} replace />;
  }
  return <ActivityLog />;
}

function ActivityLog() {
  const { canEdit, isReviewer } = useAuth();
  const navigate = useNavigate();
  const lh = useLetterhead();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab: Tab =
    OLD_TABS[raw] ?? ((['log', 'coverage', 'summary'] as string[]).includes(raw) ? (raw as Tab) : 'log');
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (t === 'log') n.delete('tab');
        else n.set('tab', t);
        return n;
      },
      { replace: true },
    );
  const [month, setMonth] = useState(isoMonth());
  // Links from charts can open the records already filtered (?type, species, from, to, barangay).
  const [barangay, setBarangay] = useState(params.get('barangay') ?? '');
  const [type, setType] = useState<string>(params.get('type') ?? '');
  const [species, setSpecies] = useState(params.get('species') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  // ?vaccine= (from a vaccination target) lists the records of that vaccine.
  const [vaccine, setVaccine] = useState(params.get('vaccine') ?? '');
  // ?new=1 (from the "+ New" menu) opens the service form straight away.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VaccinationRow | null>(null);
  const [voiding, setVoiding] = useState<VaccinationRow | null>(null);
  const [visitOpen, setVisitOpen] = useState(false);
  const [editVisit, setEditVisit] = useState<VisitRecord | null>(null);
  const [voidVisit, setVoidVisit] = useState<VisitRecord | null>(null);
  // ?visit=1 (from the "+ New" menu) opens the farm visit form.
  useEffect(() => {
    if (params.get('visit') !== '1') return;
    setVisitOpen(true);
    const p = new URLSearchParams(params);
    p.delete('visit');
    setParams(p, { replace: true });
  }, [params, setParams]);
  // "+ New" links (?new=1) open the form even when this page is already open.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setOpen(true);
    const p = new URLSearchParams(params);
    p.delete('new');
    setParams(p, { replace: true });
  }, [params, setParams]);

  const summary = useApi<MonthlySummary>(
    tab === 'summary' ? `/api/monthly-summary${qs({ month, barangay })}` : null,
  );
  const records = useApi<VaccinationRow[]>(
    tab === 'log' && type !== VISIT ? `/api/vaccinations${qs({ barangay, type })}` : null,
  );
  const visits = useApi<VisitRecord[]>(
    tab === 'log' && (!type || type === VISIT) ? `/api/farm-visits${qs({ barangay, from, to })}` : null,
  );
  const upcoming = useApi<{
    days: number;
    overdueDays: number;
    rows: (VaccinationRow & { overdue?: boolean })[];
  }>(tab === 'summary' ? `/api/vaccinations/upcoming${qs({ barangay })}` : null);
  const coverage = useApi<{ from: string; to: string; rows: CoverageRow[] }>(
    tab === 'coverage' ? `/api/vaccinations/coverage${qs({ barangay, from, to })}` : null,
  );

  const services = type === VISIT ? [] : (records.data ?? []);
  const serviceRows: LogRow[] = services
    .filter(
      (r) =>
        !r.voided &&
        (!species || r.species === species) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to) &&
        (!vaccine || (r.vaccine ?? '').trim().toLowerCase() === vaccine.trim().toLowerCase()),
    )
    .map((r) => ({
      key: `s${r.id}`,
      date: r.date,
      label: r.serviceLabel,
      tone: SERVICE_TONE[r.serviceType] ?? 'slate',
      farmId: r.farmId,
      farmName: r.farmName,
      barangay: r.barangay,
      species: r.species,
      count: r.count,
      product: [r.resultLabel, r.vaccine].filter(Boolean).join(' · ') || '—',
      by: r.administeredBy ?? null,
      remarks: r.remarks ?? null,
      service: r,
    }));
  // Farm visits have no species or head count, so a species or vaccine filter leaves them out.
  const visitRows: LogRow[] =
    type && type !== VISIT
      ? []
      : (species || vaccine ? [] : (visits.data ?? [])).map((v) => ({
          key: `v${v.id}`,
          date: v.date,
          label: 'Farm Visit',
          tone: v.findings === 'SICK_ANIMALS' ? 'red' : 'slate',
          farmId: v.farmId,
          farmName: v.farmName,
          barangay: v.barangay,
          species: null,
          count: null,
          product: [v.purposeLabel, v.findingsLabel, v.caseCode && `Case ${v.caseCode}`]
            .filter(Boolean)
            .join(' · '),
          by: v.visitedBy,
          remarks: v.remarks,
          visit: v,
        }));
  const rows = [...serviceRows, ...visitRows].sort((a, b) => b.date.localeCompare(a.date));
  const heads = rows.reduce((a, x) => a + (x.count ?? 0), 0);

  const columns: Column<LogRow>[] = [
    { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
    {
      key: 'label',
      header: 'Activity',
      cell: (r) => <Badge tone={r.tone}>{r.label}</Badge>,
    },
    {
      key: 'farmName',
      header: 'Farm',
      cell: (r) => (
        <Link to={`/farms/${r.farmId}?tab=visits`} className="link" onClick={(e) => e.stopPropagation()}>
          {r.farmName}
        </Link>
      ),
    },
    { key: 'barangay', header: 'Barangay' },
    { key: 'species', header: 'Species', cell: (r) => r.species ?? '—' },
    { key: 'count', header: 'No. of Heads', className: 'font-semibold', cell: (r) => r.count ?? '—' },
    { key: 'product', header: 'Product / Purpose / Result' },
    { key: 'by', header: 'Done By', cell: (r) => r.by ?? '—' },
    { key: 'remarks', header: 'Remarks', cell: (r) => r.remarks ?? '—' },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            sort: false as const,
            cell: (r: LogRow) => (
              <span className="inline-flex gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => (r.service ? setEditing(r.service) : setEditVisit(r.visit!))}
                >
                  Edit
                </Button>
                {isReviewer && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => (r.service ? setVoiding(r.service) : setVoidVisit(r.visit!))}
                  >
                    Remove
                  </Button>
                )}
              </span>
            ),
          },
        ]
      : []),
  ];

  const printRecords = () => {
    const r: ReportResult = {
      id: 'service-records',
      title:
        type === VISIT
          ? 'Farm Visits — Activity Log'
          : type
            ? `${SERVICE_TYPE_LABELS[type as ServiceType]} — Activity Log`
            : 'Veterinary Field Services — Activity Log',
      subtitle: [
        barangay || 'All barangays',
        species,
        from && `from ${fmtDate(from)}`,
        to && `to ${fmtDate(to)}`,
      ]
        .filter(Boolean)
        .join(' · '),
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'service', label: 'Activity' },
        { key: 'farm', label: 'Farm' },
        { key: 'barangay', label: 'Barangay' },
        { key: 'species', label: 'Species' },
        { key: 'head', label: 'No. of Heads', align: 'right' },
        { key: 'product', label: 'Product / Purpose / Result' },
        { key: 'by', label: 'Done By' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: rows.map((v) => ({
        date: fmtDate(v.date),
        service: v.label,
        farm: v.farmName ?? '—',
        barangay: v.barangay ?? '—',
        species: v.species ?? '—',
        head: v.count ?? '—',
        product: v.product,
        by: v.by ?? '—',
        remarks: v.remarks ?? '—',
      })),
      summary: [
        { label: 'Records', value: rows.length },
        { label: 'Heads Served', value: heads },
      ],
    };
    printReport(r, lh);
  };

  const s = summary.data;
  const svc = (t: ServiceType) => s?.services.find((x) => x.type === t);
  const deworm = svc('DEWORMING');

  const filtered = !!(barangay || type || species || from || to || vaccine);
  const clearFilters = () => {
    setBarangay('');
    setType('');
    setSpecies('');
    setFrom('');
    setTo('');
    setVaccine('');
  };
  const filterControls = (
    <>
      {tab === 'summary' && (
        <Input
          type="month"
          min={MIN_DATE.slice(0, 7)}
          max={isoMonth()}
          value={month}
          onChange={(e) => setMonth(e.target.value || isoMonth())}
          className="w-[calc(50%-4px)] sm:w-44"
          aria-label="Month"
        />
      )}
      {tab === 'log' ? (
        <FilterSelect
          label="Activity"
          value={type}
          onChange={setType}
          options={[
            ...SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABELS[t] })),
            { value: VISIT, label: 'Farm Visit' },
          ]}
          all="All activities"
          className="w-[calc(50%-4px)] sm:w-48"
        />
      ) : (
        <FilterSelect
          label="Barangay"
          value={barangay}
          onChange={setBarangay}
          options={BARANGAYS}
          all="All barangays"
          className="w-[calc(50%-4px)] sm:w-44"
        />
      )}
      {tab === 'log' && vaccine && (
        <span className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-light/50 pl-3 pr-1.5 text-[14px] text-slate-800">
          Vaccine: {vaccine}
          <button
            type="button"
            aria-label={`Remove filter Vaccine: ${vaccine}`}
            onClick={() => setVaccine('')}
            className="rounded px-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
          >
            ×
          </button>
        </span>
      )}
      {tab === 'log' && (
        <MoreFilters
          active={[barangay, species, from || to].filter(Boolean).length}
          onClear={() => (setBarangay(''), setSpecies(''), setFrom(''), setTo(''))}
        >
          <FilterSelect
            label="Barangay"
            value={barangay}
            onChange={setBarangay}
            options={BARANGAYS}
            all="All barangays"
          />
          <FilterSelect
            label="Species"
            value={species}
            onChange={setSpecies}
            options={[...SERVICE_SPECIES_ORDER]}
            all="All species"
          />
          <FilterField label="Date">
            <div className="flex gap-2">
              <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
            </div>
          </FilterField>
        </MoreFilters>
      )}
      {tab === 'coverage' && <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      {tab === 'log' && (
        <Button variant="outline" className="sm:ml-auto" onClick={printRecords}>
          <Printer /> Print List
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title="Activity Log"
        subtitle="Every deworming, check-up, vaccination, other service and farm visit. Works offline and syncs automatically."
        actions={
          canEdit && (
            <>
              <Button variant="outline" onClick={() => setVisitOpen(true)}>
                <MapPin /> Record Farm Visit
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Plus /> Record Service
              </Button>
            </>
          )
        }
      />
      <OfflineSyncPanel match={LOG_URLS} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'log', label: 'Activity Log' },
          { id: 'coverage', label: 'Vaccination Coverage' },
          { id: 'summary', label: 'Monthly Summary' },
        ]}
      />

      {/* One filtering section per tab: on the Activity Log it is the table's own filter row. */}
      {tab !== 'log' && (
        <FilterBar className="mt-4" active={filtered} onClear={clearFilters}>
          {filterControls}
        </FilterBar>
      )}
      {tab === 'log' && <div className="mt-4" />}
      <div>
        {tab === 'summary' &&
          (summary.error ? (
            <ErrorBox error={summary.error} />
          ) : !s ? (
            <Loading />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label={`Heads dewormed · ${fmtMonth(month)}`}
                  value={deworm?.head ?? 0}
                  sub={`${deworm?.farms ?? 0} farm(s) · ${deworm?.records ?? 0} record(s)`}
                  tone="blue"
                />
                <StatCard
                  label="Heads Checked (Check-Ups)"
                  value={svc('CHECKUP')?.head ?? 0}
                  sub={`${svc('CHECKUP')?.farms ?? 0} farm(s)`}
                  tone="green"
                />
                <StatCard
                  label="Heads Vaccinated"
                  value={svc('VACCINATION')?.head ?? 0}
                  sub={`${svc('VACCINATION')?.farms ?? 0} farm(s)`}
                  tone="orange"
                />
                <StatCard
                  label="Field Visits"
                  value={s.visits.total}
                  sub={`${s.visits.farms} farm(s)${s.visits.sickFound ? ` · ${s.visits.sickFound} with sick animals` : ''}`}
                  tone={s.visits.sickFound ? 'red' : 'green'}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                <ChartCard title="Field Work, Last 6 Months" clickable>
                  <ServiceTrendBars
                    data={s.trend}
                    onSelect={(r) => {
                      const d = monthDays(r.month);
                      setFrom(d.from);
                      setTo(d.to);
                      setSpecies('');
                      setType('');
                      setTab('log');
                    }}
                  />
                </ChartCard>
                <ChartCard
                  title={`Deworming by Species · ${s.label}`}
                  note={deworm?.head ? undefined : 'No deworming recorded for this month.'}
                  clickable
                >
                  <SpeciesHeadBars
                    name="Heads dewormed"
                    data={[...(deworm?.bySpecies ?? [])].sort(
                      (a, b) => speciesRank(a.species) - speciesRank(b.species),
                    )}
                    onSelect={(r) => {
                      const d = monthDays(month);
                      setFrom(d.from);
                      setTo(d.to);
                      setSpecies(r.species);
                      setType('DEWORMING');
                      setTab('log');
                    }}
                  />
                </ChartCard>
              </div>
              <Card>
                <CardHeader
                  title="Due Soon"
                  actions={
                    <Button size="xs" variant="outline" onClick={() => navigate('/vaccination-schedule')}>
                      View Schedule
                    </Button>
                  }
                />
                <ActivityTimeline
                  items={(upcoming.data?.rows ?? []).slice(0, 5).map((r) => ({
                    key: r.id,
                    date: r.nextDate!,
                    tone: r.overdue ? 'red' : 'blue',
                    title: (
                      <>
                        {r.serviceLabel} · {r.farmName}
                      </>
                    ),
                    tag: r.overdue ? <Badge tone="red">Overdue</Badge> : undefined,
                    body: `${r.targetLabel}${r.vaccine ? ` · ${r.vaccine}` : ''}`,
                  }))}
                  empty="Nothing scheduled. Enter a next schedule date when recording a service to get a reminder."
                />
              </Card>
            </div>
          ))}

        {tab === 'log' &&
          (records.error ? (
            <ErrorBox error={records.error} />
          ) : (
            <Card>
              <DataTable
                rows={rows}
                empty="Nothing logged for this selection. Select “Record Service” after each deworming or field service, or “Record Farm Visit” — it works without internet too."
                loading={records.isLoading || visits.isLoading}
                rowKey={(r) => r.key}
                searchText={(r) =>
                  `${r.label} ${r.farmName ?? ''} ${r.barangay ?? ''} ${r.species ?? ''} ${r.product} ${r.by ?? ''}`
                }
                searchPlaceholder="Search farm, barangay or product..."
                toolbar={filterControls}
                columns={columns}
                minWidth={1100}
                defaultSort={{ key: 'date', dir: 'desc' }}
                sortable={false}
                footerNote={
                  rows.length ? `${heads.toLocaleString()} heads served in the records shown` : undefined
                }
              />
            </Card>
          ))}

        {tab === 'coverage' &&
          (!coverage.data ? (
            <Loading />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {coverage.data.rows.map((c) => (
                  <Card key={c.species}>
                    <CardHeader title={c.species} />
                    <div className="grid grid-cols-2 gap-3 p-4">
                      <div className="rounded-lg bg-brand-light p-3">
                        <div className="text-[12px] text-brand-dark">Exact — tagged animals</div>
                        <div className="mt-1 text-[24px] font-semibold text-slate-900">
                          {c.exactPct == null ? '—' : `${c.exactPct}%`}
                        </div>
                        <div className="text-[13px] text-slate-500">
                          {c.exactVaccinated} of {c.tagged} tagged
                        </div>
                      </div>
                      <div className="rounded-lg bg-amber-50 p-3">
                        <div className="text-[12px] text-amber-700">Estimated — all heads</div>
                        <div className="mt-1 text-[24px] font-semibold text-slate-900">
                          ≈ {c.estimatedPct}%
                        </div>
                        <div className="text-[13px] text-slate-500">
                          ≈ {c.estimatedHeads} of {c.population} head
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <p className="mt-3 text-[13px] text-slate-500">
                Vaccinations only. Estimated coverage is based on recorded vaccination events; individual
                animals are not identified. Period: {fmtDate(coverage.data.from)} –{' '}
                {fmtDate(coverage.data.to)}.
              </p>
            </>
          ))}
      </div>

      <ServiceDialog open={open} onOpenChange={setOpen} defaultType={(type as ServiceType) || 'DEWORMING'} />
      <ServiceEditDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} record={editing} />
      <FarmVisitLauncher open={visitOpen} onOpenChange={setVisitOpen} />
      {editVisit && (
        <FarmVisitDialog
          open
          onOpenChange={(o) => !o && setEditVisit(null)}
          farm={{ id: editVisit.farmId, name: editVisit.farmName ?? '' }}
          visit={editVisit}
        />
      )}
      {voidVisit && (
        <VoidDialog
          open
          onOpenChange={(o) => !o && setVoidVisit(null)}
          url={`/api/farm-visits/${voidVisit.id}/void`}
          what={`farm visit ${voidVisit.code}`}
        />
      )}
      {voiding && (
        <VoidDialog
          open
          onOpenChange={(o) => !o && setVoiding(null)}
          url={`/api/vaccinations/${voiding.id}/void`}
          what={`${voiding.serviceLabel.toLowerCase()} record ${voiding.code}`}
        />
      )}
    </div>
  );
}

const LOG_URLS = ['/api/vaccinations', '/api/farm-visits', '/api/population/updates'];

function DateRange({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <>
      <Input
        type="date"
        min={MIN_DATE}
        max={to || undefined}
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="w-[calc(50%-4px)] sm:w-40"
        aria-label="From date"
      />
      <Input
        type="date"
        min={from || MIN_DATE}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="w-[calc(50%-4px)] sm:w-40"
        aria-label="To date"
      />
    </>
  );
}

/**
 * Connection status and the entries saved on this device while offline. They are sent on their own
 * when the internet returns (and every 30 seconds while online); "Sync Now" sends them at once.
 */
export function OfflineSyncPanel({ match }: { match: string[] }) {
  const online = useOnline();
  const pending = useOutbox(match);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const r = await runSync();
      if (r.synced) {
        toast.success(`Sent ${r.synced} entr${r.synced === 1 ? 'y' : 'ies'} saved offline.`);
        void qc.invalidateQueries();
      }
      if (r.failed)
        toast.error(
          `${r.failed} entr${r.failed === 1 ? 'y was' : 'ies were'} not accepted. See the reason below.`,
        );
      if (!r.synced && !r.failed && navigator.onLine) toast.info('Nothing to send.');
    } finally {
      setBusy(false);
    }
  };
  if (online && !pending.length) return null;
  return (
    <Card className={online ? 'mb-4 border-amber-200' : 'mb-4 border-slate-300'}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span
          className={
            online
              ? 'flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-700'
              : 'flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600'
          }
        >
          {online ? <Wifi className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1 text-[14px]">
          <b className="block text-[15px] font-semibold text-slate-900">
            {online ? 'Back Online' : 'Working Offline'}
          </b>
          {online
            ? `${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} saved on this device ${pending.length === 1 ? 'is' : 'are'} being sent.`
            : 'Keep recording. Entries are saved on this device and sent automatically when the internet returns.'}
        </div>
        {online && pending.length > 0 && (
          <Button size="sm" variant="outline" loading={busy} onClick={() => void sync()}>
            <RefreshCw /> Sync Now
          </Button>
        )}
      </div>
      {pending.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {pending.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[14px]">
              <Badge tone={p.lastError ? 'red' : 'amber'}>
                {p.lastError ? 'Not Accepted' : 'Waiting to Sync'}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-slate-800">{p.label}</span>
              <span className="text-[13px] text-slate-500">
                saved{' '}
                {new Date(p.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
              {p.lastError && (
                <>
                  <span className="basis-full text-[13px] text-red-700">Reason: {p.lastError}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      await db.outbox.delete(p.id!);
                      window.dispatchEvent(new Event('outbox-changed'));
                    }}
                  >
                    <Trash2 /> Discard
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
