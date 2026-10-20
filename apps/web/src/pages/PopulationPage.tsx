import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BARANGAYS, SPECIES, fmtMonth, fmtNumber } from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi, useLookups } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { ErrorBox, FilterSelect, PageHeader } from '@/components/page';
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
}
interface Totals {
  total: number;
  byBarangay: { barangay: string; owners: number; farms: number; population: number }[];
  bySpecies: { species: string; groups: number; tagged: number; population: number }[];
}

export default function PopulationPage() {
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  const farmParam = params.get('farm') ?? '';
  const [tab, setTab] = useState<'groups' | 'totals'>('groups');
  const [barangay, setBarangay] = useState('');
  const [species, setSpecies] = useState('');
  const [dlg, setDlg] = useState<null | 'group' | 'update'>(null);
  const { data: lookups } = useLookups();
  const groups = useApi<GroupRow[]>(`/api/population/groups${qs({ barangay, species, farmId: farmParam })}`);
  const allFarmGroups = useApi<GroupRow[]>(
    farmParam ? `/api/population/groups${qs({ farmId: farmParam })}` : null,
  );
  const totals = useApi<Totals>(
    tab === 'totals' ? `/api/population/totals${qs({ barangay, species })}` : null,
  );
  const farm = lookups?.farms.find((f) => String(f.id) === farmParam);
  const setFarm = (v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set('farm', v);
    else p.delete('farm');
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Population Monitoring"
        subtitle="Current recorded population by group; monthly updates, history and overdue records."
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
                  label: `${f.code} ${f.name}`,
                }))}
                className="w-full sm:w-64"
              />
              <Button variant="outline" disabled={!farm} onClick={() => setDlg('group')}>
                <Plus /> Add group
              </Button>
              <Button disabled={!farm || !allFarmGroups.data?.length} onClick={() => setDlg('update')}>
                <ClipboardList /> Update population
              </Button>
            </>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'groups', label: 'Population groups' },
          { id: 'totals', label: 'Totals by barangay & species' },
        ]}
      />
      <div className="mt-4">
        {tab === 'groups' ? (
          groups.error ? (
            <ErrorBox error={groups.error} />
          ) : (
            <Card>
              <DataTable
                rows={groups.data}
                loading={groups.isLoading}
                rowKey={(r) => r.id}
                searchText={(r) => `${r.code} ${r.farmName} ${r.ownerName} ${r.species} ${r.breed ?? ''}`}
                toolbar={
                  <>
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
                      className="w-[calc(50%-4px)] sm:w-36"
                    />
                    {farmParam && (
                      <button
                        type="button"
                        className="px-2 text-[13px] text-slate-700 hover:underline"
                        onClick={() => setFarm('')}
                      >
                        Clear farm filter
                      </button>
                    )}
                  </>
                }
                columns={[
                  { key: 'code', header: 'Group' },
                  { key: 'farmName', header: 'Farm' },
                  { key: 'ownerName', header: 'Owner' },
                  { key: 'species', header: 'Species' },
                  { key: 'breed', header: 'Breed' },
                  { key: 'count', header: 'Count', className: 'font-semibold' },
                  { key: 'tagged', header: 'Tagged' },
                  { key: 'lastVerified', header: 'Last verified', cell: (r) => fmtMonth(r.lastVerified) },
                ]}
              />
            </Card>
          )
        ) : totals.error ? (
          <ErrorBox error={totals.error} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="By barangay" className="border-b-0" />
              <DataTable
                rows={totals.data?.byBarangay}
                loading={totals.isLoading}
                rowKey={(r) => r.barangay}
                pageSize={0}
                hideFooter
                minWidth={420}
                defaultSort={{ key: 'population', dir: 'desc' }}
                columns={[
                  { key: 'barangay', header: 'Barangay' },
                  { key: 'owners', header: 'Owners' },
                  { key: 'farms', header: 'Farms' },
                  {
                    key: 'population',
                    header: 'Current population',
                    className: 'font-semibold',
                    cell: (r) => fmtNumber(r.population),
                  },
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="By species" className="border-b-0" />
              <DataTable
                rows={totals.data?.bySpecies}
                loading={totals.isLoading}
                rowKey={(r) => r.species}
                pageSize={0}
                hideFooter
                minWidth={420}
                columns={[
                  { key: 'species', header: 'Species' },
                  { key: 'groups', header: 'Groups' },
                  { key: 'tagged', header: 'Tagged (within count)' },
                  {
                    key: 'population',
                    header: 'Current population',
                    className: 'font-semibold',
                    cell: (r) => fmtNumber(r.population),
                  },
                ]}
              />
              <p className="px-4 pb-4 text-[12.5px] text-slate-500">
                City total (your scope): <b className="text-slate-800">{fmtNumber(totals.data?.total)}</b>{' '}
                head. Tagged animals are members of their groups and are not added again. Totals by owner and
                farm are shown on the Owners and Farms lists.
              </p>
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
