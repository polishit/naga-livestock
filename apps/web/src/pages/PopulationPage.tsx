import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BARANGAYS, SPECIES, breakdownText, fmtMonth, fmtNumber, type Breakdown } from '@livestock/shared';
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
  const [dlg, setDlg] = useState<null | 'group' | 'update'>(null);
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

  return (
    <div>
      <PageHeader
        title="Livestock Population"
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
      <div className="mb-4 flex flex-wrap gap-2">
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
      </div>
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
                        className="link mt-3 text-[13.5px]"
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
                  <p className="px-4 py-8 text-center text-[14.5px] text-slate-500">
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
                rows={groups.data}
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
                  { key: 'species', header: 'Species' },
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
