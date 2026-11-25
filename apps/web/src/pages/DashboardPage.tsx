import {
  AlertTriangle,
  FlaskConical,
  House,
  MapPinOff,
  PawPrint,
  ShieldAlert,
  Syringe,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BARANGAYS,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  SPECIES,
  fmtDateTime,
  fmtNumber,
  type CaseStatus,
} from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { casesLink, populationLink, qs, servicesLink } from '@/lib/utils';
import {
  BarangayBars,
  CasesLine,
  ChartCard,
  ServiceTrendBars,
  SpeciesDonut,
  TrendBars,
} from '@/components/charts';
import type { MonthlyReportData } from '@/lib/print';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, Loading, PageHeader, StatCard } from '@/components/page';
import { HotspotBanner, MyTasksCard, WelcomeCard } from '@/components/insights';
import { CaseLegend } from '@/components/status';
import { Button, Card, CardHeader } from '@/components/ui';
import type { Overview } from './types';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [barangay, setBarangay] = useState('');
  const [species, setSpecies] = useState('');
  const [caseStatus, setCaseStatus] = useState('');
  const { data, isLoading, error } = useApi<Overview>(
    `/api/dashboard${qs({ barangay, species, caseStatus })}`,
  );
  // This month's field work (deworming, check-ups, visits) for the cards and the trend graph.
  const { data: month } = useApi<MonthlyReportData>(`/api/monthly-summary${qs({ barangay })}`);
  const dewormed = month?.services.find((s) => s.type === 'DEWORMING');

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good day' : 'Good evening';
  const firstName =
    user?.name
      .replace(/^Dr\.\s*/, 'Dr. ')
      .split(' ')
      .slice(0, 2)
      .join(' ') ?? '';

  return (
    <div>
      <PageHeader
        title={`${greet}, ${firstName}`}
        subtitle="Livestock registry, disease surveillance, deworming and field visits across Naga City."
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
              label="Case Status"
              value={caseStatus}
              onChange={setCaseStatus}
              options={CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] }))}
              all="All case statuses"
              className="w-[calc(50%-4px)] sm:w-44"
            />
          </>
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading || !data ? (
        <Loading />
      ) : (
        <>
          <WelcomeCard />
          <HotspotBanner />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {/* Each box opens the records behind its number (with the barangay chosen above). */}
            <StatCard
              label="Livestock Owners"
              value={fmtNumber(data.stats.owners)}
              icon={Users}
              to={`/owners${qs({ barangay })}`}
            />
            <StatCard
              label="Farms in the Masterlist"
              value={fmtNumber(data.stats.farms)}
              sub={`${data.stats.outdatedFarms} head counts out of date`}
              icon={House}
              to={`/farms${qs({ barangay })}`}
            />
            <StatCard
              label="Total Livestock"
              value={fmtNumber(data.stats.livestock)}
              sub={`${data.stats.verifiedPct}% of farms counted this month`}
              icon={PawPrint}
              to={`/population${qs({ barangay, species })}`}
            />
            <StatCard
              label="Suspected (Open Reports)"
              value={data.stats.suspected}
              icon={AlertTriangle}
              tone="orange"
              to={`/cases${qs({ barangay, status: 'SUSPECTED' })}`}
            />
            <StatCard
              label="Awaiting Lab Result"
              value={data.stats.inLab}
              icon={FlaskConical}
              tone="blue"
              to="/investigation"
            />
            <StatCard
              label="Confirmed Positive"
              value={data.stats.positive}
              icon={ShieldAlert}
              tone="red"
              to={`/cases${qs({ barangay, status: 'POSITIVE' })}`}
            />
            <StatCard
              label="Heads Dewormed This Month"
              value={fmtNumber(dewormed?.head ?? 0)}
              sub={`${dewormed?.farms ?? 0} farm(s)`}
              icon={Syringe}
              tone="blue"
              to="/services?type=DEWORMING"
            />
            <StatCard
              label="Field Visits This Month"
              to="/field-visits"
              value={month?.visits.total ?? 0}
              sub={
                data.stats.awaitingGeotag
                  ? `${data.stats.awaitingGeotag} disease report(s) without a map location`
                  : `${month?.visits.farms ?? 0} farm(s) visited`
              }
              icon={MapPinOff}
            />
          </div>

          <div className="mt-4">
            <MyTasksCard />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title="Livestock & Disease Map"
                actions={
                  <Button variant="outline" size="xs" asChild>
                    <Link to="/gis-map">View Full Map</Link>
                  </Button>
                }
              />
              <div className="p-4">
                <CaseLegend includeSpecies />
                <MapView
                  className="h-[300px] sm:h-[380px]"
                  farms={data.map.farms}
                  cases={data.map.cases}
                  circles={data.map.cases
                    .filter((c) => c.status === 'POSITIVE')
                    .map((c) => ({ lat: c.lat, lng: c.lng, radius: 1000 }))}
                  fitKey={`${barangay}${species}${caseStatus}`}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Recent Activity" />
              <ul className="space-y-3.5 px-4 py-4">
                {data.recent.length === 0 && <li className="text-sm text-slate-500">No recent activity.</li>}
                {data.recent.map((r) => (
                  <li key={r.id} className="flex gap-3">
                    <span
                      className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${/POSITIVE/.test(r.summary) ? 'bg-red-600' : 'bg-orange-500'}`}
                    />
                    <div>
                      <Link
                        to={`/cases/${r.entityId}`}
                        className="text-[15px] text-slate-900 hover:underline"
                      >
                        {r.summary}
                      </Link>
                      <div className="text-[13px] text-slate-400">
                        {fmtDateTime(r.at)} · {r.byName ?? 'System'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Livestock by Species" clickable>
              <SpeciesDonut
                data={data.bySpecies}
                onSelect={(r) => navigate(populationLink({ species: r.species, barangay }))}
              />
            </ChartCard>
            <ChartCard
              title="Monthly Population Trend"
              note="Carried-forward values are not field-verified for that month."
            >
              <TrendBars data={data.trend} />
            </ChartCard>
            <ChartCard title="Disease Reports per Month" clickable>
              <CasesLine
                data={data.casesPerMonth}
                onSelect={(r) => navigate(casesLink({ month: r.month, barangay, state: 'all' }))}
              />
            </ChartCard>
            <ChartCard title="Population by Barangay" clickable>
              <BarangayBars
                data={data.byBarangay}
                onSelect={(r) => navigate(populationLink({ barangay: r.barangay, species }))}
              />
            </ChartCard>
            <ChartCard title="Deworming, Check-Ups and Field Visits" clickable>
              {month ? (
                <ServiceTrendBars
                  data={month.trend}
                  onSelect={(r) => navigate(servicesLink({ month: r.month, barangay }))}
                />
              ) : (
                <Loading />
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

export type { CaseStatus };
