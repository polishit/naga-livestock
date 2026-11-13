import { ClipboardList, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ANIMAL_PURPOSES,
  ANIMAL_PURPOSE_LABELS,
  BARANGAYS,
  FARM_TYPES,
  FARM_TYPE_LABELS,
  HEALTH_STATUSES,
  SPECIES,
  breakdownText,
  fmtMonth,
  fmtNumber,
  isoMonth,
  type AnimalPurpose,
  type Breakdown,
  type FarmType,
  type ReportResult,
} from '@livestock/shared';
import { useLetterhead } from '@/components/ExportButtons';
import { printReport } from '@/lib/export';
import { useAuth } from '@/lib/auth';
import { useApi, useLookups } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { BarangayBars } from '@/components/charts';
import { BreakdownBars } from '@/components/livestock';
import { ErrorBox, FilterSelect, Loading, PageHeader } from '@/components/page';
import { Button, Card, CardHeader, Tabs } from '@/components/ui';
import { GroupDialog, PopulationUpdateDialog } from '@/dialogs/registry';

interface GroupRow {
  id: number;
  code: string;
  farmId: number;
  farmCode: string;
  farmName: string;
  ownerName: string;
  barangay: string;
  species: string;
  breed: string | null;
  sex: string;
  count: number;
  tagged: number;
  healthStatus: string;
  purpose: string | null;
  farmType: string;
  lastVerified: string | null;
  breakdown: Breakdown | null;
}
interface Totals {
  total: number;
  byBarangay: { barangay: string; owners: number; farms: number; population: number }[];
  bySpecies: {
    species: string;
    groups: number;
    farms: number;
    tagged: number;
    population: number;
    breakdown: Breakdown;
  }[];
}

type PopTab = 'summary' | 'farms' | 'barangays';

export default function PopulationPage() {
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const farmParam = params.get('farm') ?? '';
  const [tab, setTab] = useState<PopTab>((params.get('tab') as PopTab) || 'summary');
  const [barangay, setBarangay] = useState(params.get('barangay') ?? '');
  const [species, setSpecies] = useState(params.get('species') ?? '');
  // More filters for the farm list: farm type, purpose, health and when it was last counted.
  const [farmType, setFarmType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [health, setHealth] = useState('');
  const [counted, setCounted] = useState('');
  const [dlg, setDlg] = useState<null | 'group' | 'update'>(null);
  const lh = useLetterhead();
  const { data: lookups } = useLookups();
  const totals = useApi<Totals>(`/api/population/totals${qs({ barangay, species })}`);
  const groups = useApi<GroupRow[]>(
    tab === 'farms' ? `/api/population/groups${qs({ barangay, species, farmId: farmParam })}` : null,
  );
  const allFarmGroups = useApi<GroupRow[]>(
    farmParam ? `/api/population/groups${qs({ farmId: farmParam })}` : null,
  );
  const farm = lookups?.farms.find((f) => String(f.id) === farmParam);
  const setFarm = (v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set('farm', v);
    else p.delete('farm');
    setParams(p, { replace: true });
  };
  const t = totals.data;
  const month = isoMonth();
  const rows = groups.data?.filter(
    (r) =>
      (!farmType || r.farmType === farmType) &&
      (!purpose || r.purpose === purpose) &&
      (!health || r.healthStatus === health) &&
      (!counted ||
        (counted === 'month' ? r.lastVerified === month : !r.lastVerified || r.lastVerified < month)),
  );
  const scope = [
    barangay ? `Barangay ${barangay}` : 'All barangays',
    species,
    farmType && FARM_TYPE_LABELS[farmType as FarmType],
    purpose && ANIMAL_PURPOSE_LABELS[purpose as AnimalPurpose],
    health,
    counted && (counted === 'month' ? `counted in ${fmtMonth(month)}` : `not counted in ${fmtMonth(month)}`),
  ]
    .filter(Boolean)
    .join(' · ');
  // Print what is on screen: species totals, the farm list, or the barangay table.
  const print = () => {
    if (tab === 'farms')
      return printReport(
        {
          id: 'population-farms',
          title: 'Livestock Population by Farm',
          subtitle: scope,
          columns: [
            { key: 'farm', label: 'Farm' },
            { key: 'owner', label: 'Owner' },
            { key: 'barangay', label: 'Barangay' },
            { key: 'type', label: 'Type' },
            { key: 'species', label: 'Species' },
            { key: 'head', label: 'No. of Heads' },
            { key: 'classes', label: 'Classification' },
            { key: 'counted', label: 'Last Counted' },
          ],
          rows: (rows ?? []).map((r) => ({
            farm: r.farmName,
            owner: r.ownerName,
            barangay: r.barangay,
            type: FARM_TYPE_LABELS[r.farmType as FarmType] ?? r.farmType,
            species: `${r.species}${r.purpose ? ` (${ANIMAL_PURPOSE_LABELS[r.purpose as AnimalPurpose]})` : ''}`,
            head: r.count,
            classes: breakdownText(r.species, r.breakdown) || 'Not classified',
            counted: fmtMonth(r.lastVerified),
          })),
          summary: [
            { label: 'Groups', value: rows?.length ?? 0 },
            { label: 'Heads', value: (rows ?? []).reduce((a, r) => a + r.count, 0) },
          ],
        } as ReportResult,
        lh,
      );
    if (!t) return;
    if (tab === 'barangays')
      return printReport(
        {
          id: 'population-barangays',
          title: 'Livestock Population by Barangay',
          subtitle: scope,
          columns: [
            { key: 'barangay', label: 'Barangay' },
            { key: 'owners', label: 'Owners' },
            { key: 'farms', label: 'Farms' },
            { key: 'head', label: 'No. of Heads' },
          ],
          rows: [...t.byBarangay]
            .sort((a, b) => b.population - a.population)
            .map((b) => ({ barangay: b.barangay, owners: b.owners, farms: b.farms, head: b.population })),
          summary: [{ label: 'Total heads', value: t.total }],
        } as ReportResult,
        lh,
      );
    return printReport(
      {
        id: 'population-species',
        title: 'Livestock Population by Species',
        subtitle: scope,
        columns: [
          { key: 'species', label: 'Species' },
          { key: 'farms', label: 'Farms' },
          { key: 'head', label: 'No. of Heads' },
          { key: 'tagged', label: 'Tagged' },
          { key: 'classes', label: 'Classification (Age / Sex / Stage)' },
        ],
        rows: t.bySpecies
          .filter((x) => x.population > 0)
          .sort((a, b) => b.population - a.population)
          .map((x) => ({
            species: x.species,
            farms: x.farms,
            head: x.population,
            tagged: x.tagged,
            classes: breakdownText(x.species, x.breakdown) || 'Not classified',
          })),
        summary: [{ label: 'Total heads', value: t.total }],
      } as ReportResult,
      lh,
    );
  };

  return (
    <div>
      <PageHeader
        title="Population Monitoring"
        subtitle="Current head count from the masterlist, with the breakdown by age, sex and production stage."
        actions={
          canEdit && (
            <>
              <FilterSelect
                label="Farm to update"
                value={farmParam}
                onChange={setFarm}
                all="Select farm to update..."
                options={(lookups?.farms ?? []).map((f) => ({
                  value: String(f.id),
                  label: `${f.name} · ${f.barangay}`,
                }))}
                className="w-full sm:w-64"
              />
              <Button variant="outline" disabled={!farm} onClick={() => setDlg('group')}>
                <Plus /> Add Species
              </Button>
              <Button disabled={!farm || !allFarmGroups.data?.length} onClick={() => setDlg('update')}>
                <ClipboardList /> Update Head Count
              </Button>
            </>
          )
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <FilterSelect
          label="Barangay"
          value={barangay}
          onChange={setBarangay}
          options={BARANGAYS}
          all="All barangays"
          className="w-[calc(50%-4px)] sm:w-48"
        />
        <FilterSelect
          label="Species"
          value={species}
          onChange={setSpecies}
          options={SPECIES}
          all="All species"
          className="w-[calc(50%-4px)] sm:w-40"
        />
        {tab === 'farms' && (
          <>
            <FilterSelect
              label="Farm type"
              value={farmType}
              onChange={setFarmType}
              options={FARM_TYPES.map((x) => ({ value: x, label: FARM_TYPE_LABELS[x] }))}
              all="Any farm type"
              className="w-[calc(50%-4px)] sm:w-44"
            />
            <FilterSelect
              label="Purpose"
              value={purpose}
              onChange={setPurpose}
              options={ANIMAL_PURPOSES.map((x) => ({ value: x, label: ANIMAL_PURPOSE_LABELS[x] }))}
              all="Any purpose"
              className="w-[calc(50%-4px)] sm:w-40"
            />
            <FilterSelect
              label="Health"
              value={health}
              onChange={setHealth}
              options={HEALTH_STATUSES}
              all="Any health status"
              className="w-[calc(50%-4px)] sm:w-44"
            />
            <FilterSelect
              label="Last counted"
              value={counted}
              onChange={setCounted}
              options={[
                { value: 'month', label: 'Counted this month' },
                { value: 'due', label: 'Not counted this month' },
              ]}
              all="Any count date"
              className="w-[calc(50%-4px)] sm:w-52"
            />
          </>
        )}
        <Button
          variant="outline"
          className="sm:ml-auto"
          onClick={print}
          disabled={tab === 'farms' ? !rows?.length : !t}
        >
          <Printer /> Print
        </Button>
      </Card>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'By Species' },
          { id: 'farms', label: 'By Farm' },
          { id: 'barangays', label: 'By Barangay' },
        ]}
      />
      <div className="mt-4">
        {totals.error ? (
          <ErrorBox error={totals.error} />
        ) : tab === 'summary' ? (
          !t ? (
            <Loading />
          ) : (
            <>
              <div className="card mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3">
                <span className="text-[14px] text-slate-600">
                  Total livestock{barangay ? ` in ${barangay}` : ''}:
                </span>
                <span className="text-[26px] font-semibold text-slate-900">{fmtNumber(t.total)}</span>
                <span className="text-[14px] text-slate-500">head</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {t.bySpecies
                  .filter((s) => s.population > 0)
                  .sort((a, b) => b.population - a.population)
                  .map((s) => (
                    <Card key={s.species} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[16px] font-semibold text-slate-900">{s.species}</div>
                          <div className="text-[13px] text-slate-500">
                            {s.farms} farm{s.farms === 1 ? '' : 's'}
                            {s.tagged ? ` · ${s.tagged} tagged` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[24px] font-semibold leading-none text-slate-900">
                            {fmtNumber(s.population)}
                          </div>
                          <div className="text-[12px] text-slate-500">head</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <BreakdownBars species={s.species} total={s.population} breakdown={s.breakdown} />
                      </div>
                      <button
                        type="button"
                        className="link mt-3 text-[14px]"
                        onClick={() => {
                          setSpecies(s.species);
                          setTab('farms');
                        }}
                      >
                        See farms raising {s.species.toLowerCase()}
                      </button>
                    </Card>
                  ))}
              </div>
              {!t.bySpecies.some((s) => s.population > 0) && (
                <Card>
                  <p className="px-4 py-8 text-center text-[15px] text-slate-500">
                    No livestock recorded for this selection.
                  </p>
                </Card>
              )}
            </>
          )
        ) : tab === 'farms' ? (
          groups.error ? (
            <ErrorBox error={groups.error} />
          ) : (
            <Card>
              <DataTable
                rows={rows}
                empty="No livestock found for this selection."
                loading={groups.isLoading}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/farms/${r.farmId}?tab=livestock`)}
                searchText={(r) => `${r.code} ${r.farmName} ${r.ownerName} ${r.species} ${r.breed ?? ''}`}
                searchPlaceholder="Search farm, owner or species..."
                toolbar={
                  farmParam && (
                    <button
                      type="button"
                      className="px-2 text-[13px] text-slate-700 hover:underline"
                      onClick={() => setFarm('')}
                    >
                      Clear farm filter
                    </button>
                  )
                }
                minWidth={980}
                columns={[
                  { key: 'farmName', header: 'Farm Name', className: 'font-medium text-slate-900' },
                  { key: 'ownerName', header: 'Livestock Owner' },
                  { key: 'barangay', header: 'Barangay' },
                  {
                    key: 'farmType',
                    header: 'Type',
                    cell: (r) => (r.farmType === 'commercial' ? 'CM' : 'BY'),
                  },
                  {
                    key: 'species',
                    header: 'Species',
                    cell: (r) =>
                      r.purpose
                        ? `${r.species} · ${ANIMAL_PURPOSE_LABELS[r.purpose as AnimalPurpose]}`
                        : r.species,
                  },
                  { key: 'count', header: 'No. of Heads', className: 'font-semibold' },
                  {
                    key: 'breakdown',
                    header: 'Classification',
                    sort: false,
                    cell: (r) =>
                      breakdownText(r.species, r.breakdown) || (
                        <span className="text-slate-400">Not classified</span>
                      ),
                  },
                  { key: 'lastVerified', header: 'Last Counted', cell: (r) => fmtMonth(r.lastVerified) },
                ]}
              />
            </Card>
          )
        ) : !t ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Card>
              <CardHeader title="Livestock by Barangay" />
              <div className="h-[320px] p-4">
                <BarangayBars
                  data={[...t.byBarangay]
                    .sort((a, b) => b.population - a.population)
                    .slice(0, 12)
                    .map((b) => ({ barangay: b.barangay, count: b.population }))}
                  onSelect={(r) => navigate(`/farms?barangay=${encodeURIComponent(r.barangay)}`)}
                />
              </div>
            </Card>
            <Card>
              <DataTable
                rows={t.byBarangay}
                rowKey={(r) => r.barangay}
                pageSize={0}
                hideFooter
                minWidth={420}
                onRowClick={(r) => navigate(`/farms?barangay=${encodeURIComponent(r.barangay)}`)}
                defaultSort={{ key: 'population', dir: 'desc' }}
                columns={[
                  { key: 'barangay', header: 'Barangay' },
                  { key: 'owners', header: 'Owners' },
                  { key: 'farms', header: 'Farms' },
                  {
                    key: 'population',
                    header: 'No. of Heads',
                    className: 'font-semibold',
                    cell: (r) => fmtNumber(r.population),
                  },
                ]}
              />
            </Card>
          </div>
        )}
      </div>
      {farm && (
        <>
          <GroupDialog
            open={dlg === 'group'}
            onOpenChange={(o) => setDlg(o ? 'group' : null)}
            farmId={farm.id}
          />
          <PopulationUpdateDialog
            open={dlg === 'update'}
            onOpenChange={(o) => setDlg(o ? 'update' : null)}
            farm={farm}
            groups={allFarmGroups.data ?? []}
          />
        </>
      )}
    </div>
  );
}
