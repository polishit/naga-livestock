import {
  AlertTriangle,
  FlaskConical,
  House,
  MapPinOff,
  PawPrint,
  Plus,
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
import { qs } from '@/lib/utils';
import {
  BarangayBars,
  CasesLine,
  ChartCard,
  CoverageBars,
  SpeciesDonut,
  TrendBars,
} from '@/components/charts';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, Loading, PageHeader, StatCard } from '@/components/page';
import { HotspotBanner, MyTasksCard, WelcomeCard } from '@/components/insights';
import { CaseLegend } from '@/components/status';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import type { Overview } from './types';

export default function DashboardPage() {
  const { user, canEdit } = useAuth();
  const navigate = useNavigate();
  const [barangay, setBarangay] = useState('');
  const [species, setSpecies] = useState('');
  const [caseStatus, setCaseStatus] = useState('');
  const { data, isLoading, error } = useApi<Overview>(
    `/api/dashboard${qs({ barangay, species, caseStatus })}`,
  );

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
        subtitle="Overview of livestock, disease surveillance and vaccination across Naga City."
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
              label="Case status"
              value={caseStatus}
              onChange={setCaseStatus}
              options={CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] }))}
              all="All case statuses"
              className="w-[calc(50%-4px)] sm:w-44"
            />
            {canEdit && (
              <Button onClick={() => navigate('/cases/new')}>
                <Plus /> Report case
              </Button>
            )}
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
            <StatCard label="Registered owners" value={fmtNumber(data.stats.owners)} icon={Users} />
            <StatCard
              label="Registered farms"
              value={fmtNumber(data.stats.farms)}
              sub={`${data.stats.outdatedFarms} outdated records`}
              icon={House}
            />
            <StatCard
              label="Current recorded livestock"
              value={fmtNumber(data.stats.livestock)}
              sub={`${data.stats.verifiedPct}% of farms verified this month`}
              icon={PawPrint}
            />
            <StatCard
              label="Suspected cases"
              value={data.stats.suspected}
              icon={AlertTriangle}
              tone="orange"
            />
            <StatCard label="Cases in laboratory" value={data.stats.inLab} icon={FlaskConical} tone="blue" />
            <StatCard label="Confirmed positive" value={data.stats.positive} icon={ShieldAlert} tone="red" />
            <StatCard
              label="Vaccination coverage (6 mo.)"
              value={`≈ ${data.stats.coveragePct}%`}
              sub={<Badge tone="amber">Estimated</Badge>}
              icon={Syringe}
            />
            <StatCard
              label="Cases awaiting geotagging"
              value={data.stats.awaitingGeotag}
              sub="Excluded from radius analysis"
              icon={MapPinOff}
              tone="red"
            />
          </div>

          <div className="mt-4">
            <MyTasksCard />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title="Livestock & disease map"
                actions={
                  <Button variant="outline" size="xs" asChild>
                    <Link to="/gis-map">View Full Map</Link>
                  </Button>
                }
              />
              <div className="p-4">
                <MapView
                  className="h-[300px] sm:h-[380px]"
                  farms={data.map.farms}
                  cases={data.map.cases}
                  circles={data.map.cases
                    .filter((c) => c.status === 'POSITIVE')
                    .map((c) => ({ lat: c.lat, lng: c.lng, radius: 1000 }))}
                  fitKey={`${barangay}${species}${caseStatus}`}
                />
                <CaseLegend includeSpecies />
              </div>
            </Card>
            <Card>
              <CardHeader title="Recent activity" />
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
                      <div className="text-[12.5px] text-slate-400">
                        {fmtDateTime(r.at)} · {r.byName ?? 'System'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Livestock by species">
              <SpeciesDonut data={data.bySpecies} />
            </ChartCard>
            <ChartCard
              title="Monthly population trend"
              note="Carried-forward values are not field-verified for that month."
            >
              <TrendBars data={data.trend} />
            </ChartCard>
            <ChartCard title="Disease cases per month">
              <CasesLine data={data.casesPerMonth} />
            </ChartCard>
            <ChartCard title="Population by barangay">
              <BarangayBars data={data.byBarangay} />
            </ChartCard>
            <ChartCard
              title="Vaccination coverage by species"
              note="Estimated coverage is based on aggregate events; exact applies to tagged animals only."
            >
              <CoverageBars data={data.coverage} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

export type { CaseStatus };
