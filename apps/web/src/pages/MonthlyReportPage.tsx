import { Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BARANGAYS, MIN_DATE, fmtDate, fmtNumber, isoMonth, type ReportResult } from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { printMonthlyReport, type MonthlyReportData } from '@/lib/print';
import { qs } from '@/lib/utils';
import {
  ChartCard,
  DiseaseBars,
  ReportTrendLine,
  ServiceTrendBars,
  SpeciesHeadBars,
} from '@/components/charts';
import { ExportButtons, useLetterhead } from '@/components/ExportButtons';
import { ErrorBox, FilterSelect, Loading, PageHeader, StatCard } from '@/components/page';
import { CaseStatusBadge } from '@/components/status';
import { Button, Card, CardHeader, Input } from '@/components/ui';
import type { CaseStatus } from '@livestock/shared';

/** Monthly summary for the office, with graphs that refresh on their own and a printable report. */
export default function MonthlyReportPage() {
  const { user } = useAuth();
  const lh = useLetterhead();
  const [month, setMonth] = useState(isoMonth());
  const [barangay, setBarangay] = useState('');
  const {
    data: m,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useApi<MonthlyReportData>(`/api/monthly-summary${qs({ month, barangay })}`, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  // The same report as a table, for Excel / CSV / PDF downloads.
  const { data: table } = useApi<ReportResult>(
    `/api/reports/monthly-report${qs({ from: `${month}-01`, barangay })}`,
  );

  const deworm = m?.services.find((s) => s.type === 'DEWORMING');
  const checkup = m?.services.find((s) => s.type === 'CHECKUP');

  return (
    <div>
      <PageHeader
        title="Monthly Report"
        subtitle="Livestock population, disease reports, deworming, check-ups and farm visits for one month."
        actions={
          <>
            <Button disabled={!m} onClick={() => m && printMonthlyReport(m, lh, user?.name)}>
              <Printer /> Print Monthly Report
            </Button>
            <ExportButtons report={table} print={false} />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="month"
          min={MIN_DATE.slice(0, 7)}
          max={isoMonth()}
          value={month}
          onChange={(e) => setMonth(e.target.value || isoMonth())}
          className="w-[calc(50%-4px)] sm:w-44"
          aria-label="Month"
        />
        <FilterSelect
          label="Barangay"
          value={barangay}
          onChange={setBarangay}
          options={BARANGAYS}
          all="All barangays"
          className="w-[calc(50%-4px)] sm:w-48"
        />
        <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 sm:ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Updates automatically
          {dataUpdatedAt
            ? ` · last ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : ''}
          <button type="button" className="link ml-1" onClick={() => refetch()}>
            Refresh now
          </button>
        </span>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : !m ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total livestock"
              value={fmtNumber(m.population.total)}
              sub={`${m.population.farms} farms · ${m.population.owners} owners`}
            />
            <StatCard
              label={`Disease reports · ${m.label}`}
              value={m.diseases.reported}
              sub={`${m.diseases.positive} confirmed positive · ${m.diseases.openCases} open in total`}
              tone={m.diseases.positive ? 'red' : 'orange'}
            />
            <StatCard
              label="Heads dewormed"
              value={fmtNumber(deworm?.head ?? 0)}
              sub={`${deworm?.farms ?? 0} farms · check-ups: ${checkup?.head ?? 0} heads`}
              tone="blue"
            />
            <StatCard
              label="Farm visits"
              value={m.visits.total}
              sub={`${m.visits.farms} farms${m.visits.sickFound ? ` · ${m.visits.sickFound} with sick animals` : ''}`}
              tone={m.visits.sickFound ? 'red' : 'green'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Disease Reports, Last 6 Months">
              <ReportTrendLine data={m.trend.map((t) => ({ label: t.label, reports: t.diseaseReports }))} />
            </ChartCard>
            <ChartCard title="Deworming, Check-ups and Farm Visits">
              <ServiceTrendBars data={m.trend} />
            </ChartCard>
            <ChartCard title="Livestock Population by Species">
              <SpeciesHeadBars
                name="Heads"
                data={m.population.bySpecies
                  .filter((s) => s.population > 0)
                  .sort((a, b) => b.population - a.population)
                  .map((s) => ({ species: s.species, head: s.population }))}
              />
            </ChartCard>
            <ChartCard
              title={`Disease Reports by Disease · ${m.label}`}
              note={m.diseases.reported ? undefined : 'No disease reports this month.'}
            >
              <DiseaseBars data={m.diseases.byDisease.map((d) => ({ disease: d.name, count: d.count }))} />
            </ChartCard>
          </div>

          <Card>
            <CardHeader title={`Deworming, Pregnancy Diagnosis, Insemination and Check-up · ${m.label}`} />
            {m.perSpecies.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[15px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[13px] font-semibold text-slate-500">
                      <th className="px-4 py-2.5">Species</th>
                      <th className="px-4 py-2.5 text-right">Dewormed</th>
                      <th className="px-4 py-2.5 text-right">Pregnancy Diagnosis</th>
                      <th className="px-4 py-2.5 text-right">Pregnant</th>
                      <th className="px-4 py-2.5 text-right">Insemination</th>
                      <th className="px-4 py-2.5 text-right">Check-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {m.perSpecies.map((x) => (
                      <tr key={x.species}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{x.species}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNumber(x.dewormed)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNumber(x.pregnancyDiagnosis)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNumber(x.pregnant)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNumber(x.inseminated)}</td>
                        <td className="px-4 py-2.5 text-right">{fmtNumber(x.checkups)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-[14px] text-slate-500">
                No deworming, pregnancy diagnosis, insemination or check-up this month.
              </p>
            )}
            <p className="border-t border-slate-100 px-4 py-2.5 text-[13px] text-slate-500">
              Heads served per species. Laboratory samples collected this month: {m.lab.collected} (
              {m.lab.surveillance} routine surveillance) — {m.lab.pending} pending, {m.lab.positive} positive,{' '}
              {m.lab.negative} negative.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={`Disease Reports · ${m.label}`} />
              {m.diseases.cases.length ? (
                <ul className="divide-y divide-slate-100">
                  {m.diseases.cases.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/cases/${c.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50"
                      >
                        <span>
                          <span className="text-[15px] font-medium text-slate-900">{c.disease}</span>
                          <span className="text-[13px] text-slate-500">
                            {' '}
                            · {c.species} · {c.barangay}
                            {c.farmName ? ` · ${c.farmName}` : ''}
                          </span>
                          <div className="text-[13px] text-slate-500">
                            {c.code} · {c.reportedAt ? fmtDate(c.reportedAt) : '—'} · {c.affected} affected,{' '}
                            {c.deaths} deaths
                          </div>
                        </span>
                        <CaseStatusBadge status={c.status as CaseStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-[14px] text-slate-500">
                  No disease reports this month.
                </p>
              )}
            </Card>
            <Card>
              <CardHeader title="Services and Visits" />
              <div className="divide-y divide-slate-100">
                {m.services.map((s) => (
                  <div key={s.type} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <div className="text-[15px] font-medium text-slate-900">{s.label}</div>
                      <div className="text-[13px] text-slate-500">
                        {s.records} record(s) · {s.farms} farm(s)
                        {s.bySpecies.length
                          ? ` · ${s.bySpecies.map((x) => `${x.species} ${x.head}`).join(', ')}`
                          : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[18px] font-semibold text-slate-900">{fmtNumber(s.head)}</div>
                      <div className="text-[12px] text-slate-500">heads</div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div>
                    <div className="text-[15px] font-medium text-slate-900">Farm visits</div>
                    <div className="text-[13px] text-slate-500">
                      {m.visits.byPurpose
                        .filter((p) => p.count)
                        .map((p) => `${p.label} ${p.count}`)
                        .join(' · ') || 'None'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] font-semibold text-slate-900">{m.visits.total}</div>
                    <div className="text-[12px] text-slate-500">visits</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
          <p className="text-[13px] text-slate-500">
            Population is the current masterlist count; disease reports, services and visits cover {m.label}.
            The printed report follows the standard sections: I. Livestock Population, II. Disease
            Surveillance, III. Deworming, Pregnancy Diagnosis, Insemination and Check-up per species, IV.
            Other Services, V. Farm Visits, VI. Laboratory Samples, VII. Six-Month Summary.
          </p>
        </div>
      )}
    </div>
  );
}
