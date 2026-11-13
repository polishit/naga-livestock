import { Plus, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { useApi } from '@/lib/hooks';
import { printReport } from '@/lib/export';
import { qs } from '@/lib/utils';
import { ChartCard, ServiceTrendBars, SpeciesHeadBars } from '@/components/charts';
import { DataTable, type Column } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { ActivityTimeline } from '@/components/livestock';
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { ErrorBox, FilterSelect, Loading, PageHeader, StatCard } from '@/components/page';
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

type Tab = 'overview' | 'records' | 'visits' | 'upcoming' | 'coverage';

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

export default function ServicesPage() {
  const { canEdit, isAdmin } = useAuth();
  const navigate = useNavigate();
  const lh = useLetterhead();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const [month, setMonth] = useState(isoMonth());
  const [barangay, setBarangay] = useState('');
  const [type, setType] = useState<string>(params.get('type') ?? '');
  const [species, setSpecies] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [purpose, setPurpose] = useState('');
  // ?new=1 (from the "+ New" menu) opens the service form straight away.
  const [open, setOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [editing, setEditing] = useState<VaccinationRow | null>(null);
  const [voiding, setVoiding] = useState<VaccinationRow | null>(null);
  const [editVisit, setEditVisit] = useState<VisitRecord | null>(null);
  // "+ New" links (?new=1 / ?visit=1) open the form even when this page is already open.
  useEffect(() => {
    const n = params.get('new') === '1';
    const v = params.get('visit') === '1';
    if (!n && !v) return;
    if (n) setOpen(true);
    if (v) setVisitOpen(true);
    const p = new URLSearchParams(params);
    p.delete('new');
    p.delete('visit');
    setParams(p, { replace: true });
  }, [params, setParams]);

  const summary = useApi<MonthlySummary>(
    tab === 'overview' ? `/api/monthly-summary${qs({ month, barangay })}` : null,
  );
  const records = useApi<VaccinationRow[]>(
    tab === 'records' ? `/api/vaccinations${qs({ barangay, type })}` : null,
  );
  const visits = useApi<VisitRecord[]>(
    tab === 'visits' ? `/api/farm-visits${qs({ barangay, purpose, from, to })}` : null,
  );
  const upcoming = useApi<{
    days: number;
    overdueDays: number;
    rows: (VaccinationRow & { overdue?: boolean })[];
  }>(
    tab === 'upcoming' || tab === 'overview'
      ? // The calendar shows the next 6 months.
        `/api/vaccinations/upcoming${qs({ barangay, days: tab === 'upcoming' ? '183' : '' })}`
      : null,
  );
  const coverage = useApi<{ from: string; to: string; rows: CoverageRow[] }>(
    tab === 'coverage' ? `/api/vaccinations/coverage${qs({ barangay, from, to })}` : null,
  );

  const rows = (records.data ?? []).filter(
    (r) =>
      !r.voided && (!species || r.species === species) && (!from || r.date >= from) && (!to || r.date <= to),
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
                {isAdmin && (
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
        ? `${SERVICE_TYPE_LABELS[type as ServiceType]} Records`
        : 'Deworming & Veterinary Service Records',
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
        { label: 'Heads served', value: rows.reduce((a, x) => a + x.count, 0) },
      ],
    };
    printReport(r, lh);
  };

  const s = summary.data;
  const svc = (t: ServiceType) => s?.services.find((x) => x.type === t);
  const deworm = svc('DEWORMING');
  const overdue = upcoming.data?.rows.filter((r) => r.overdue).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Deworming & Veterinary Services"
        subtitle="Deworming (goats and cattle first), check-ups, vaccinations and other field services, with the farm visits they were given on."
        actions={
          canEdit && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Record Service
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'records', label: 'Service Records' },
          { id: 'visits', label: 'Farm Visits' },
          {
            id: 'upcoming',
            label: `Upcoming Schedule${overdue ? ` (${overdue} overdue)` : ''}`,
          },
          { id: 'coverage', label: 'Vaccination Coverage' },
        ]}
      />

      {/* Filters: only the ones that apply to the open tab. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tab === 'overview' && (
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
        {tab === 'records' && (
          <FilterSelect
            label="Service"
            value={type}
            onChange={setType}
            options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABELS[t] }))}
            all="All services"
            className="w-[calc(50%-4px)] sm:w-48"
          />
        )}
        {tab === 'records' && (
          <FilterSelect
            label="Species"
            value={species}
            onChange={setSpecies}
            options={[...SERVICE_SPECIES_ORDER]}
            all="All species"
            className="w-[calc(50%-4px)] sm:w-36"
          />
        )}
        {tab === 'visits' && (
          <FilterSelect
            label="Purpose"
            value={purpose}
            onChange={setPurpose}
            options={VISIT_PURPOSES.map((p) => ({ value: p, label: VISIT_PURPOSE_LABELS[p] }))}
            all="Any purpose"
            className="w-[calc(50%-4px)] sm:w-56"
          />
        )}
        {(tab === 'records' || tab === 'visits' || tab === 'coverage') && (
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
        )}
        {tab === 'records' && (
          <Button variant="outline" size="sm" className="sm:ml-auto" onClick={printRecords}>
            <Printer /> Print List
          </Button>
        )}
      </div>
      <div className="mt-4">
        {tab === 'overview' &&
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
                  label="Heads checked (check-ups)"
                  value={svc('CHECKUP')?.head ?? 0}
                  sub={`${svc('CHECKUP')?.farms ?? 0} farm(s)`}
                  tone="green"
                />
                <StatCard
                  label="Heads vaccinated"
                  value={svc('VACCINATION')?.head ?? 0}
                  sub={`${svc('VACCINATION')?.farms ?? 0} farm(s)`}
                  tone="orange"
                />
                <StatCard
                  label="Farm visits"
                  value={s.visits.total}
                  sub={`${s.visits.farms} farm(s)${s.visits.sickFound ? ` · ${s.visits.sickFound} with sick animals` : ''}`}
                  tone={s.visits.sickFound ? 'red' : 'green'}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                <ChartCard title="Field Work, Last 6 Months">
                  <ServiceTrendBars data={s.trend} />
                </ChartCard>
                <ChartCard
                  title={`Deworming by Species · ${s.label}`}
                  note={deworm?.head ? undefined : 'No deworming recorded for this month.'}
                >
                  <SpeciesHeadBars
                    name="Heads dewormed"
                    data={[...(deworm?.bySpecies ?? [])].sort(
                      (a, b) => speciesRank(a.species) - speciesRank(b.species),
                    )}
                  />
                </ChartCard>
              </div>
              <Card>
                <CardHeader
                  title="Due Soon"
                  actions={
                    <Button size="xs" variant="outline" onClick={() => setTab('upcoming')}>
                      View schedule
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

        {tab === 'records' &&
          (records.error ? (
            <ErrorBox error={records.error} />
          ) : (
            <Card>
              <DataTable
                rows={rows}
                empty="No records for this selection. Select “Record Service” after each deworming or field service."
                loading={records.isLoading}
                rowKey={(r) => r.id}
                searchText={(r) =>
                  `${r.farmName} ${r.barangay} ${r.species} ${r.vaccine ?? ''} ${r.administeredBy ?? ''}`
                }
                searchPlaceholder="Search farm, barangay or product..."
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

        {tab === 'visits' &&
          (visits.error ? (
            <ErrorBox error={visits.error} />
          ) : !visits.data ? (
            <Loading />
          ) : (
            <Card>
              <CardHeader title={`Farm Visits (${visits.data.length})`} />
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
                    <Button size="xs" variant="ghost" onClick={() => setEditVisit(v)}>
                      Edit
                    </Button>
                  ) : undefined,
                }))}
                empty="No farm visits for this selection."
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
                        Open farm
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
      <FarmVisitLauncher open={visitOpen} onOpenChange={setVisitOpen} />
      <ServiceEditDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} record={editing} />
      {editVisit && (
        <FarmVisitDialog
          open
          onOpenChange={(o) => !o && setEditVisit(null)}
          farm={{ id: editVisit.farmId, name: editVisit.farmName ?? '' }}
          visit={editVisit}
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
