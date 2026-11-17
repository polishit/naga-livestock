import { ClipboardList, Plus, Printer, Search } from 'lucide-react';
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
  fmtMonth,
  fmtNumber,
  isoMonth,
  type AnimalPurpose,
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
import { ErrorBox, FilterSelect, Loading, PageHeader } from '@/components/page';
import { Button, Card, CardHeader, Input, Tabs } from '@/components/ui';
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
  }[];
}

type PopTab = 'summary' | 'farms' | 'barangays';

export default function PopulationPage() {
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const farmParam = params.get('farm') ?? '';
  // The filters live in the address bar, so Back undoes them and a link can open a filtered view.
  const setParam = (patch: Record<string, string>, push = false) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: !push });
  };
  const tab = (params.get('tab') as PopTab) || 'summary';
  const setTab = (v: PopTab) => setParam({ tab: v === 'summary' ? '' : v }, true);
  const barangay = params.get('barangay') ?? '';
  const setBarangay = (v: string) => setParam({ barangay: v });
  const species = params.get('species') ?? '';
  const setSpecies = (v: string) => setParam({ species: v });
  // Search the population records: farm, owner, barangay, species, breed or group code.
  const q = params.get('q') ?? '';
  // The search lists matching farms, so it opens the "By Farm" tab.
  const onSearch = (v: string) =>
    setParam({ q: v, ...(v.trim() && tab !== 'farms' ? { tab: 'farms' } : {}) });
  // More filters for the farm list: farm type, purpose, health and when it was last counted.
  const farmType = params.get('type') ?? '';
  const setFarmType = (v: string) => setParam({ type: v });
  const purpose = params.get('purpose') ?? '';
  const setPurpose = (v: string) => setParam({ purpose: v });
  const health = params.get('health') ?? '';
  const setHealth = (v: string) => setParam({ health: v });
  const counted = params.get('counted') ?? '';
  const setCounted = (v: string) => setParam({ counted: v });
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
  const needle = q.trim().toLowerCase();
  const rows = groups.data?.filter(
    (r) =>
      // A species the farm no longer has (0 head) is not "raised" there.
      r.count > 0 &&
      (!needle ||
        `${r.code} ${r.farmCode} ${r.farmName} ${r.ownerName} ${r.barangay} ${r.species} ${r.breed ?? ''}`
          .toLowerCase()
          .includes(needle)) &&
      (!farmType || r.farmType === farmType) &&
      (!purpose || r.purpose === purpose) &&
      (!health || r.healthStatus === health) &&
      (!counted ||
        (counted === 'month' ? r.lastVerified === month : !r.lastVerified || r.lastVerified < month)),
  );
  const scope = [
    barangay ? `Barangay ${barangay}` : 'All barangays',
    needle && `matching “${q.trim()}”`,
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
            { key: 'counted', label: 'Last Counted' },
          ],
          rows: (rows ?? []).map((r) => ({
            farm: r.farmName,
            owner: r.ownerName,
            barangay: r.barangay,
            type: FARM_TYPE_LABELS[r.farmType as FarmType] ?? r.farmType,
            species: `${r.species}${r.purpose ? ` (${ANIMAL_PURPOSE_LABELS[r.purpose as AnimalPurpose]})` : ''}`,
            head: r.count,
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
          summary: [{ label: 'Total Heads', value: t.total }],
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
        ],
        rows: t.bySpecies
          .filter((x) => x.population > 0)
          .sort((a, b) => b.population - a.population)
          .map((x) => ({
            species: x.species,
            farms: x.farms,
            head: x.population,
            tagged: x.tagged,
          })),
        summary: [{ label: 'Total Heads', value: t.total }],
      } as ReportResult,
      lh,
    );
  };

  return (
    <div>
      <PageHeader
        title="Population Monitoring"
        subtitle="Current head count from the masterlist, by species, farm and barangay."
        actions={
          canEdit && (
            <>
              <FilterSelect
                label="Farm to Update"
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
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search farm, owner, barangay, species..."
            aria-label="Search population"
            className="pl-9"
          />
        </div>
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
              label="Farm Type"
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
              label="Last Counted"
              value={counted}
              onChange={setCounted}
              options={[
                { value: 'month', label: 'Counted This Month' },
                { value: 'due', label: 'Not Counted This Month' },
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
                      <button
                        type="button"
                        className="link mt-3 text-[14px]"
                        onClick={() => setParam({ species: s.species, tab: 'farms' }, true)}
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
                toolbar={
                  farmParam && (
                    <button
                      type="button"
                      className="px-2 text-[13px] text-slate-700 hover:underline"
                      onClick={() => setFarm('')}
                    >
                      Clear Farm Filter
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
