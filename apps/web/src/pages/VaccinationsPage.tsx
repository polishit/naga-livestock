import { Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BARANGAYS, MIN_DATE, fmtDate, type ReportResult } from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { printReport } from '@/lib/export';
import { qs } from '@/lib/utils';
import { DataTable, type Column } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { ErrorBox, FilterSelect, Loading, PageHeader } from '@/components/page';
import { Badge, Button, Card, CardHeader, Input, Tabs } from '@/components/ui';
import { VaccinationDialog, VoidDialog } from '@/dialogs/surveillance';
import type { CoverageRow, VaccinationRow } from './types';

const columns: Column<VaccinationRow>[] = [
  { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
  {
    key: 'vaccine',
    header: 'Vaccine',
    cell: (r) =>
      r.voided ? (
        <div>
          <span className="text-slate-400 line-through">{r.vaccine}</span> <Badge>Voided</Badge>
          <div className="text-[12.5px] text-slate-500">
            {r.voidReason}
            {r.voidedBy ? ` — ${r.voidedBy}` : ''}
          </div>
        </div>
      ) : (
        r.vaccine
      ),
  },
  { key: 'farmName', header: 'Farm' },
  { key: 'targetLabel', header: 'Target' },
  { key: 'doseNumber', header: 'Dose' },
  {
    key: 'nextDate',
    header: 'Next',
    cell: (r) =>
      r.nextDate ? (
        <span className="whitespace-nowrap">
          {fmtDate(r.nextDate)} {r.reminderDone && <Badge tone="green">Given</Badge>}
        </span>
      ) : (
        '—'
      ),
  },
  { key: 'administeredBy', header: 'By' },
];

export default function VaccinationsPage() {
  const { canEdit, isAdmin } = useAuth();
  const [voiding, setVoiding] = useState<VaccinationRow | null>(null);
  const recordColumns: Column<VaccinationRow>[] = isAdmin
    ? [
        ...columns,
        {
          key: 'actions',
          header: '',
          sort: false,
          cell: (r) =>
            !r.voided && (
              <Button size="xs" variant="ghost" onClick={() => setVoiding(r)}>
                Void
              </Button>
            ),
        },
      ]
    : columns;
  const lh = useLetterhead();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'records' | 'upcoming' | 'coverage') ?? 'records';
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  const [barangay, setBarangay] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const records = useApi<VaccinationRow[]>(`/api/vaccinations${qs({ barangay })}`);
  const upcoming = useApi<{ days: number; rows: VaccinationRow[] }>(
    `/api/vaccinations/upcoming${qs({ barangay })}`,
  );
  const coverage = useApi<{ from: string; to: string; rows: CoverageRow[] }>(
    tab === 'coverage' ? `/api/vaccinations/coverage${qs({ barangay, from, to })}` : null,
  );

  const printSummary = () => {
    const r: ReportResult =
      tab === 'coverage' && coverage.data
        ? {
            id: 'vax-coverage',
            title: 'Vaccination Coverage Summary',
            subtitle: `${barangay || 'All barangays'} · ${coverage.data.from} to ${coverage.data.to}`,
            columns: [
              { key: 'species', label: 'Species' },
              { key: 'est', label: 'Estimated (groups)' },
              { key: 'exact', label: 'Exact (tagged)' },
              { key: 'events', label: 'Events' },
              { key: 'doses', label: 'Doses' },
            ],
            rows: coverage.data.rows.map((c) => ({
              species: c.species,
              est: `≈ ${c.estimatedPct}% (${c.estimatedHeads} of ${c.population})`,
              exact: c.exactPct == null ? '—' : `${c.exactPct}% (${c.exactVaccinated} of ${c.tagged})`,
              events: c.events,
              doses: c.doses,
            })),
            summary: [],
            note: 'Estimated coverage is based on aggregate vaccination events; individual animals are not identified.',
          }
        : {
            id: 'vax-records',
            title: tab === 'upcoming' ? 'Upcoming Vaccination Schedule' : 'Vaccination Records',
            subtitle: barangay || 'All barangays',
            columns: [
              { key: 'date', label: 'Date' },
              { key: 'vaccine', label: 'Vaccine' },
              { key: 'species', label: 'Species' },
              { key: 'target', label: 'Target' },
              { key: 'farm', label: 'Farm' },
              { key: 'dose', label: 'Dose' },
              { key: 'next', label: 'Next' },
              { key: 'by', label: 'By' },
            ],
            rows: ((tab === 'upcoming' ? upcoming.data?.rows : records.data) ?? []).map((v) => ({
              date: fmtDate(v.date),
              vaccine: v.vaccine,
              species: v.species,
              target: v.targetLabel,
              farm: v.farmName,
              dose: v.doseNumber,
              next: v.nextDate ? fmtDate(v.nextDate) : '—',
              by: v.administeredBy ?? '—',
            })),
            summary: [
              {
                label: 'Records',
                value: (tab === 'upcoming' ? upcoming.data?.rows.length : records.data?.length) ?? 0,
              },
            ],
          };
    printReport(r, lh);
  };

  return (
    <div>
      <PageHeader
        title="Vaccinations"
        subtitle="Records, upcoming schedules and coverage. No dosage calculation is performed."
        actions={
          <>
            {canEdit && (
              <Button onClick={() => setOpen(true)}>
                <Plus /> Record vaccination
              </Button>
            )}
            <Button variant="outline" onClick={printSummary}>
              <Printer /> Print summary
            </Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'records', label: 'Records' },
          {
            id: 'upcoming',
            label: `Upcoming (${upcoming.data?.rows.length ?? 0} in ${upcoming.data?.days ?? 30} days)`,
          },
          { id: 'coverage', label: 'Coverage' },
        ]}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <FilterSelect
          label="Barangay"
          value={barangay}
          onChange={setBarangay}
          options={BARANGAYS}
          all="All barangays"
          className="w-full sm:w-48"
        />
        {tab === 'coverage' && (
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
      </div>
      <div className="mt-4">
        {tab === 'records' &&
          (records.error ? (
            <ErrorBox error={records.error} />
          ) : (
            <Card>
              <DataTable
                rows={records.data}
                loading={records.isLoading}
                rowKey={(r) => r.id}
                columns={recordColumns}
                defaultSort={{ key: 'date', dir: 'desc' }}
              />
            </Card>
          ))}
        {tab === 'upcoming' && (
          <Card>
            <DataTable
              rows={upcoming.data?.rows}
              loading={upcoming.isLoading}
              rowKey={(r) => r.id}
              columns={columns}
              pageSize={0}
              hideFooter
              defaultSort={{ key: 'date', dir: 'desc' }}
              empty="No vaccinations scheduled in the next 30 days."
            />
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
                      <div className="rounded-md bg-emerald-50 p-3">
                        <div className="text-[12px] text-emerald-700">Exact — tagged animals</div>
                        <div className="mt-1 text-[22px] font-semibold text-slate-900">
                          {c.exactPct == null ? '—' : `${c.exactPct}%`}
                        </div>
                        <div className="text-[13px] text-slate-500">
                          {c.exactVaccinated} of {c.tagged} tagged
                        </div>
                      </div>
                      <div className="rounded-md bg-amber-50 p-3">
                        <div className="text-[12px] text-amber-700">
                          Groups <span className="ml-2">Estimated</span>
                        </div>
                        <div className="mt-1 text-[22px] font-semibold text-slate-900">
                          ≈ {c.estimatedPct}%
                        </div>
                        <div className="text-[13px] text-slate-500">
                          ≈ {c.estimatedHeads} of {c.population} head
                        </div>
                      </div>
                      <div className="col-span-2 flex flex-wrap gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[12px] text-slate-700">
                          {c.events} vaccination events
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[12px] text-slate-700">
                          {c.doses} doses administered
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <p className="mt-3 text-[13px] text-slate-500">
                Estimated coverage is based on aggregate vaccination events; individual animals are not
                identified. Events and doses are raw totals and may include repeat doses to the same animals.
                Period: {fmtDate(coverage.data.from)} – {fmtDate(coverage.data.to)}.
              </p>
            </>
          ))}
      </div>
      <VaccinationDialog open={open} onOpenChange={setOpen} />
      {voiding && (
        <VoidDialog
          open
          onOpenChange={(o) => !o && setVoiding(null)}
          url={`/api/vaccinations/${voiding.id}/void`}
          what={`vaccination ${voiding.code}`}
        />
      )}
    </div>
  );
}