import { CloudOff, Plus, Printer, RefreshCw, Trash2, Wifi, X } from 'lucide-react';
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
  VISIT_PURPOSES,
  VISIT_PURPOSE_LABELS,
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
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { ErrorBox, FilterBar, FilterSelect, Loading, PageHeader, StatCard } from '@/components/page';
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

/** Activity Log tabs. The old Service Records list is the Activity Log itself; Field Visits is now Field Visits. */
type Tab = 'log' | 'upcoming' | 'coverage' | 'summary';
const OLD_TABS: Record<string, Tab> = { records: 'log', overview: 'summary' };

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
  // Old links to the Field Visits tab open the Field Visits page.
  if (params.get('tab') === 'visits') {
    const p = new URLSearchParams(params);
    p.delete('tab');
    const q = p.toString();
    return <Navigate to={`/field-visits${q ? `?${q}` : ''}`} replace />;
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
    OLD_TABS[raw] ??
    ((['log', 'upcoming', 'coverage', 'summary'] as string[]).includes(raw) ? (raw as Tab) : 'log');
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
    tab === 'log' ? `/api/vaccinations${qs({ barangay, type })}` : null,
  );
  const upcoming = useApi<{
    days: number;
    overdueDays: number;
    rows: (VaccinationRow & { overdue?: boolean })[];
  }>(
    tab === 'upcoming' || tab === 'summary'
      ? // The calendar shows the next 6 months.
        `/api/vaccinations/upcoming${qs({ barangay, days: tab === 'upcoming' ? '183' : '' })}`
      : null,
  );
  const coverage = useApi<{ from: string; to: string; rows: CoverageRow[] }>(
    tab === 'coverage' ? `/api/vaccinations/coverage${qs({ barangay, from, to })}` : null,
  );

  const rows = (records.data ?? []).filter(
    (r) =>
      !r.voided &&
      (!species || r.species === species) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (!vaccine || (r.vaccine ?? '').trim().toLowerCase() === vaccine.trim().toLowerCase()),
  );

  const columns: Column<VaccinationRow>[] = [
    { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
    {
      key: 'serviceType',
      header: 'Service',
      cell: (r) => <Badge tone={SERVICE_TONE[r.serviceType] ?? 'slate'}>{r.serviceLabel}</Badge>,
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
    { key: 'species', header: 'Species' },
    { key: 'count', header: 'No. of Heads', className: 'font-semibold' },
    {
      key: 'vaccine',
      header: 'Product / Result',
      cell: (r) => [r.resultLabel, r.vaccine].filter(Boolean).join(' · ') || '—',
    },
    { key: 'administeredBy', header: 'Done By' },
    { key: 'remarks', header: 'Remarks', cell: (r) => r.remarks ?? '—' },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            sort: false as const,
            cell: (r: VaccinationRow) => (
              <span className="inline-flex gap-1">
                <Button size="xs" variant="ghost" onClick={() => setEditing(r)}>
                  Edit
                </Button>
                {isReviewer && (
                  <Button size="xs" variant="ghost" onClick={() => setVoiding(r)}>
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
      title: type
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
        { key: 'service', label: 'Service' },
        { key: 'farm', label: 'Farm' },
        { key: 'barangay', label: 'Barangay' },
        { key: 'species', label: 'Species' },
        { key: 'head', label: 'No. of Heads', align: 'right' },
        { key: 'product', label: 'Product Used' },
        { key: 'by', label: 'Done By' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: rows.map((v) => ({
        date: fmtDate(v.date),
        service: v.serviceLabel,
        farm: v.farmName,
        barangay: v.barangay,
        species: v.species,
        head: v.count,
        product: [v.resultLabel, v.vaccine].filter(Boolean).join(' · ') || '—',
        by: v.administeredBy ?? '—',
        remarks: v.remarks ?? '—',
      })),
      summary: [
        { label: 'Records', value: rows.length },
        { label: 'Heads Served', value: rows.reduce((a, x) => a + x.count, 0) },
      ],
    };
    printReport(r, lh);
  };

  const s = summary.data;
  const svc = (t: ServiceType) => s?.services.find((x) => x.type === t);
  const deworm = svc('DEWORMING');
  const overdue = upcoming.data?.rows.filter((r) => r.overdue).length ?? 0;

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
      <FilterSelect
        label="Barangay"
        value={barangay}
        onChange={setBarangay}
        options={BARANGAYS}
        all="All barangays"
        className="w-[calc(50%-4px)] sm:w-44"
      />
      {tab === 'log' && (
        <FilterSelect
          label="Service"
          value={type}
          onChange={setType}
          options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABELS[t] }))}
          all="All services"
          className="w-[calc(50%-4px)] sm:w-48"
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
        <FilterSelect
          label="Species"
          value={species}
          onChange={setSpecies}
          options={[...SERVICE_SPECIES_ORDER]}
          all="All species"
          className="w-[calc(50%-4px)] sm:w-36"
        />
      )}
      {(tab === 'log' || tab === 'coverage') && (
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      )}
      {tab === 'log' && (
        <Button variant="outline" className="sm:ml-auto" onClick={printRecords}>
          <Printer /> Print List
        </Button>
      )}
      {filtered && (
        <Button variant="ghost" onClick={clearFilters}>
          <X /> Clear Filters
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title="Activity Log"
        subtitle="Every deworming, check-up, vaccination and other service given. Works offline and syncs automatically."
        actions={
          canEdit && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Record Service
            </Button>
          )
        }
      />
      <OfflineSyncPanel match={LOG_URLS} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'log', label: 'Activity Log' },
          {
            id: 'upcoming',
            label: `Upcoming Schedule${overdue ? ` (${overdue} overdue)` : ''}`,
          },
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
                    <Button size="xs" variant="outline" onClick={() => setTab('upcoming')}>
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
                empty="Nothing logged for this selection. Select “Record Service” after each deworming or field service — it works without internet too."
                loading={records.isLoading}
                rowKey={(r) => r.id}
                searchText={(r) =>
                  `${r.farmName} ${r.barangay} ${r.species} ${r.vaccine ?? ''} ${r.administeredBy ?? ''}`
                }
                searchPlaceholder="Search farm, barangay or product..."
                toolbar={filterControls}
                columns={columns}
                minWidth={1100}
                defaultSort={{ key: 'date', dir: 'desc' }}
                sortable={false}
                footerNote={
                  rows.length
                    ? `${rows.reduce((a, x) => a + x.count, 0).toLocaleString()} heads served in the records shown`
                    : undefined
                }
              />
            </Card>
          ))}

        {tab === 'upcoming' && (
          <Card>
            {!upcoming.data ? (
              <Loading />
            ) : (
              <ScheduleCalendar
                items={upcoming.data.rows
                  .filter((r) => r.nextDate)
                  .map((r) => ({
                    id: r.id,
                    date: r.nextDate!,
                    label: `${r.serviceLabel} · ${r.species}`,
                    tone: r.overdue ? 'red' : (SERVICE_TONE[r.serviceType] ?? 'slate'),
                    detail: (
                      <>
                        <b className="font-medium text-slate-800">{r.farmName}</b> · {r.barangay} ·{' '}
                        {r.targetLabel}
                        {r.vaccine ? ` · ${r.vaccine}` : ''} · last given {fmtDate(r.date)}
                        {r.overdue && (
                          <span className="ml-1.5">
                            <Badge tone="red">Overdue</Badge>
                          </span>
                        )}
                      </>
                    ),
                    action: (
                      <Button size="xs" variant="outline" onClick={() => navigate(`/farms/${r.farmId}`)}>
                        Open Farm
                      </Button>
                    ),
                  }))}
                empty="Nothing scheduled. Enter a next schedule date when recording a service to get a reminder."
              />
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-[13px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-200" /> Deworming
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-200" /> Vaccination
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200" /> Check-up
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-red-200" /> Overdue (not yet given)
              </span>
            </div>
          </Card>
        )}

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

/* ---------------- Field Visits (formerly Field Visits) ---------------- */

/** Visits of the office to farms, why, what was found, and the services given on them. */
export function FieldVisitsPage() {
  const { canEdit, isReviewer } = useAuth();
  const [params, setParams] = useSearchParams();
  const [barangay, setBarangay] = useState(params.get('barangay') ?? '');
  const [purpose, setPurpose] = useState(params.get('purpose') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [visitOpen, setVisitOpen] = useState(false);
  const [voidVisit, setVoidVisit] = useState<VisitRecord | null>(null);
  const [editVisit, setEditVisit] = useState<VisitRecord | null>(null);
  useEffect(() => {
    if (params.get('visit') !== '1') return;
    setVisitOpen(true);
    const p = new URLSearchParams(params);
    p.delete('visit');
    setParams(p, { replace: true });
  }, [params, setParams]);
  const visits = useApi<VisitRecord[]>(`/api/farm-visits${qs({ barangay, purpose, from, to })}`);
  return (
    <div>
      <PageHeader
        title="Field Visits"
        subtitle="Visits to farms: the purpose, what was found, and the services given. Can be recorded offline."
        actions={
          canEdit && (
            <Button onClick={() => setVisitOpen(true)}>
              <Plus /> Record Field Visit
            </Button>
          )
        }
      />
      <OfflineSyncPanel match={LOG_URLS} />
      <FilterBar
        active={!!(barangay || purpose || from || to)}
        onClear={() => {
          setBarangay('');
          setPurpose('');
          setFrom('');
          setTo('');
        }}
      >
        <FilterSelect
          label="Barangay"
          value={barangay}
          onChange={setBarangay}
          options={BARANGAYS}
          all="All barangays"
          className="w-[calc(50%-4px)] sm:w-44"
        />
        <FilterSelect
          label="Purpose"
          value={purpose}
          onChange={setPurpose}
          options={VISIT_PURPOSES.map((p) => ({ value: p, label: VISIT_PURPOSE_LABELS[p] }))}
          all="Any purpose"
          className="w-[calc(50%-4px)] sm:w-56"
        />
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </FilterBar>
      {visits.error ? (
        <ErrorBox error={visits.error} />
      ) : !visits.data ? (
        <Loading />
      ) : (
        <Card>
          <CardHeader title={`Field Visits (${visits.data.length})`} />
          <ActivityTimeline
            items={visits.data.map((v) => ({
              key: v.id,
              date: v.date,
              tone: v.findings === 'SICK_ANIMALS' ? 'red' : 'green',
              title: (
                <>
                  <Link to={`/farms/${v.farmId}`} className="link">
                    {v.farmName}
                  </Link>
                  <span className="font-normal text-slate-500">· {v.barangay}</span>
                </>
              ),
              tag: (
                <>
                  <Badge tone="blue">{v.purposeLabel}</Badge>
                  <Badge tone={v.findings === 'SICK_ANIMALS' ? 'red' : 'green'}>{v.findingsLabel}</Badge>
                </>
              ),
              body: (
                <>
                  {[v.visitedBy && `By ${v.visitedBy}`, v.caseCode && `Related case ${v.caseCode}`]
                    .filter(Boolean)
                    .join(' · ')}
                  {v.remarks && <div className="text-slate-500">{v.remarks}</div>}
                </>
              ),
              actions: canEdit ? (
                <span className="inline-flex gap-1">
                  <Button size="xs" variant="ghost" onClick={() => setEditVisit(v)}>
                    Edit
                  </Button>
                  {isReviewer && (
                    <Button size="xs" variant="ghost" onClick={() => setVoidVisit(v)}>
                      Void
                    </Button>
                  )}
                </span>
              ) : undefined,
            }))}
            empty="No field visits for this selection."
          />
        </Card>
      )}
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
          what={`field visit ${voidVisit.code}`}
        />
      )}
    </div>
  );
}
