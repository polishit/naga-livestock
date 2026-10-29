import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BARANGAYS,
  MIN_DATE,
  REPORT_CATEGORIES,
  REPORT_TYPES,
  SPECIES,
  type ReportCategory,
  type ReportResult,
} from '@livestock/shared';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import {
  BarangayBars,
  CasesLine,
  ChartCard,
  CoverageBars,
  DiseaseBars,
  FarmTypeDonut,
  LargestFarmsBars,
  SpeciesDonut,
  StatusPie,
  TrendBars,
  VaccinationLine,
} from '@/components/charts';
import { DataTable } from '@/components/DataTable';
import { ExportButtons } from '@/components/ExportButtons';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, Loading, PageHeader, SummaryChips } from '@/components/page';
import { Card, Field, Input, Tabs } from '@/components/ui';
import type { CaseRow, FarmSummary, Overview } from './types';

/* ---------------- Analytics ---------------- */

export function AnalyticsPage() {
  const [barangay, setBarangay] = useState('');
  const [species, setSpecies] = useState('');
  const [months, setMonths] = useState('6');
  const { data, isLoading, error } = useApi<Overview>(`/api/analytics${qs({ barangay, species, months })}`);
  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Interactive charts — all derived from the authoritative metrics module."
        actions={
          <>
            <FilterSelect
              label="Barangay"
              value={barangay}
              onChange={setBarangay}
              options={BARANGAYS}
              all="All barangays"
              className="w-full sm:w-48"
            />
            <FilterSelect
              label="Species"
              value={species}
              onChange={setSpecies}
              options={SPECIES}
              all="All species"
              className="w-[calc(50%-4px)] sm:w-36"
            />
            <FilterSelect
              label="Period"
              value={months}
              onChange={setMonths}
              options={[
                { value: '3', label: 'Last 3 months' },
                { value: '6', label: 'Last 6 months' },
                { value: '12', label: 'Last 12 months' },
              ]}
              className="w-[calc(50%-4px)] sm:w-40"
            />
          </>
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading || !data ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Monthly population trend"
            note="Carried-forward values are not field-verified for that month."
          >
            <TrendBars data={data.trend} />
          </ChartCard>
          <ChartCard title="Livestock by species">
            <SpeciesDonut data={data.bySpecies} />
          </ChartCard>
          <ChartCard title="Population by barangay">
            <BarangayBars data={data.byBarangay} />
          </ChartCard>
          <ChartCard title="Disease cases per month">
            <CasesLine data={data.casesPerMonth} />
          </ChartCard>
          <ChartCard title="Cases by status">
            <StatusPie data={data.casesByStatus} />
          </ChartCard>
          <ChartCard title="Cases by suspected disease">
            <DiseaseBars data={data.casesByDisease} />
          </ChartCard>
          <ChartCard
            title="Vaccination coverage by species"
            note="Estimated coverage is based on aggregate events; exact applies to tagged animals only."
          >
            <CoverageBars data={data.coverage} />
          </ChartCard>
          <ChartCard
            title="Vaccination activity"
            note="Events and doses are raw totals, not distinct animals."
          >
            <VaccinationLine data={data.vaccinationActivity} />
          </ChartCard>
          <ChartCard title="Farms by type">
            <FarmTypeDonut data={data.farmsByType} />
          </ChartCard>
          <ChartCard title="Largest farms (current population)">
            <LargestFarmsBars data={data.largestFarms} />
          </ChartCard>
        </div>
      )}
    </div>
  );
}

/* ---------------- Shared report viewer ---------------- */

function ReportTable({ report, loading }: { report?: ReportResult; loading?: boolean }) {
  if (loading || !report) return <Loading />;
  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="card-title">{report.title}</h3>
        <ExportButtons report={report} />
      </div>
      <div className="px-4 pt-2 text-[13px] text-slate-700">{report.subtitle}</div>
      <DataTable
        rows={report.rows}
        rowKey={(r) => JSON.stringify(r)}
        pageSize={25}
        hideFooter={report.rows.length <= 25}
        minWidth={Math.max(640, report.columns.length * 120)}
        columns={report.columns.map((c) => ({
          key: c.key,
          header: c.label,
          cell: (r: Record<string, unknown>) =>
            r[c.key] === null || r[c.key] === undefined ? '—' : String(r[c.key]),
        }))}
        empty="No records for the selected filters."
      />
      <SummaryChips items={report.summary} />
      {report.note && <p className="px-4 pb-4 text-[12.5px] text-slate-500">{report.note}</p>}
    </Card>
  );
}

function ReportFilters({
  types,
  type,
  setType,
  f,
  setF,
}: {
  types: { id: string; title: string }[];
  type: string;
  setType: (v: string) => void;
  f: { barangay: string; species: string; from: string; to: string };
  setF: (v: { barangay: string; species: string; from: string; to: string }) => void;
}) {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(240px,320px)_190px_140px_150px_150px]">
        <Field label="Report type" className="col-span-2 md:col-span-1">
          <FilterSelect
            label="Report type"
            value={type}
            onChange={setType}
            options={types.map((t) => ({ value: t.id, label: t.title }))}
          />
        </Field>
        <Field label="Barangay">
          <FilterSelect
            label="Barangay"
            value={f.barangay}
            onChange={(v) => setF({ ...f, barangay: v })}
            options={BARANGAYS}
            all="All barangays"
          />
        </Field>
        <Field label="Species">
          <FilterSelect
            label="Species"
            value={f.species}
            onChange={(v) => setF({ ...f, species: v })}
            options={SPECIES}
            all="All species"
          />
        </Field>
        <Field label="From">
          <Input
            type="date"
            min={MIN_DATE}
            max={f.to || undefined}
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            min={f.from || MIN_DATE}
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
          />
        </Field>
      </div>
    </Card>
  );
}

function OutbreakReport({ initialCase, initialRadius }: { initialCase?: string; initialRadius?: string }) {
  const { data: cases } = useApi<CaseRow[]>('/api/cases?location=mapped');
  const sorted = [...(cases ?? [])].sort((a, b) => a.id - b.id);
  const [caseId, setCaseId] = useState(initialCase ?? '');
  const [radius, setRadius] = useState(initialRadius ?? '1000');
  const effective =
    caseId || (sorted.find((c) => c.status === 'POSITIVE') ?? sorted[0])?.id?.toString() || '';
  const { data, isLoading, error } = useApi<
    ReportResult & {
      map: {
        center: { lat: number; lng: number };
        radius: number;
        farms: (FarmSummary & { role: string })[];
      };
    }
  >(effective ? `/api/reports/outbreak-area?caseId=${effective}&radius=${radius}` : null);
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Field label="Case (geocoded only)" className="sm:w-80">
              <FilterSelect
                label="Case"
                value={effective}
                onChange={setCaseId}
                options={sorted.map((c) => ({ value: String(c.id), label: `${c.code} · ${c.disease}` }))}
              />
            </Field>
            <Field label="Radius" className="sm:w-32">
              <FilterSelect
                label="Radius"
                value={radius}
                onChange={setRadius}
                options={[
                  { value: '500', label: '500 m' },
                  { value: '1000', label: '1.00 km' },
                  { value: '3000', label: '3.00 km' },
                  { value: '5000', label: '5.00 km' },
                ]}
              />
            </Field>
          </div>
          <ExportButtons report={data} />
        </div>
      </Card>
      {error && <ErrorBox error={error} />}
      {data?.map && (
        <MapView
          className="mt-4 h-[320px]"
          farms={data.map.farms
            .filter((f) => f.role !== 'Ground-zero farm')
            .map((f) => ({ ...f, inRadius: true }))}
          groundZero={data.map.center}
          circles={[{ ...data.map.center, radius: data.map.radius }]}
          focusCircle={{ ...data.map.center, radius: data.map.radius }}
          fitKey={`${effective}-${radius}`}
        />
      )}
      <ReportTable report={data} loading={isLoading} />
    </>
  );
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as ReportCategory) ?? 'population';
  const types = REPORT_TYPES.filter((t) => t.category === tab && t.id !== 'outbreak-area');
  const [type, setType] = useState(types[0]?.id ?? '');
  const [f, setF] = useState({ barangay: '', species: '', from: '', to: '' });
  useEffect(() => {
    setType(REPORT_TYPES.filter((t) => t.category === tab && t.id !== 'outbreak-area')[0]?.id ?? '');
  }, [tab]);
  const { data, isLoading, error } = useApi<ReportResult>(
    tab !== 'outbreak' && type ? `/api/reports/${type}${qs(f)}` : null,
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`${REPORT_TYPES.length} ready-made reports — view, print or download as Excel, CSV or PDF (with letterhead).`}
      />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={REPORT_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
      />
      <div className="mt-4">
        {tab === 'outbreak' ? (
          <OutbreakReport
            initialCase={params.get('case') ?? undefined}
            initialRadius={params.get('radius') ?? undefined}
          />
        ) : (
          <>
            <ReportFilters types={types} type={type} setType={setType} f={f} setF={setF} />
            {error ? <ErrorBox error={error} /> : <ReportTable report={data} loading={isLoading} />}
          </>
        )}
      </div>
    </div>
  );
}
