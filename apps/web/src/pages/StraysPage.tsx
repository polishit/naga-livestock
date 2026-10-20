import { Plus } from 'lucide-react';
import { useState } from 'react';
import { BARANGAYS, STRAY_STATUSES, fmtDateTime, titleCase } from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { ErrorBox, FilterSelect, PageHeader } from '@/components/page';
import { StrayStatusBadge } from '@/components/status';
import { Badge, Button, Card } from '@/components/ui';
import { StrayDialog, StrayUpdateDialog, type StrayRecord } from '@/dialogs/animals';

export default function StraysPage() {
  const { canEdit } = useAuth();
  const [barangay, setBarangay] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StrayRecord | null>(null);
  const { data, isLoading, error } = useApi<(StrayRecord & { mapped: boolean })[]>(
    `/api/strays${qs({ barangay, status })}`,
  );
  return (
    <div>
      <PageHeader
        title="Stray Livestock & Violations"
        actions={
          canEdit && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Report incident
            </Button>
          )
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={data}
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => setSelected(r)}
            pageSize={0}
            searchText={(r) =>
              `${r.code} ${r.species} ${r.ownerName ?? ''} ${r.barangay} ${r.earTag ?? ''} ${r.location}`
            }
            defaultSort={{ key: 'discoveredAt', dir: 'desc' }}
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
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={STRAY_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
                  all="All statuses"
                  className="w-[calc(50%-4px)] sm:w-32"
                />
              </>
            }
            columns={[
              { key: 'code', header: 'Incident' },
              { key: 'discoveredAt', header: 'Discovered', cell: (r) => fmtDateTime(r.discoveredAt) },
              { key: 'species', header: 'Species' },
              { key: 'earTag', header: 'Tag', cell: (r) => r.earTag ?? '—' },
              { key: 'ownerName', header: 'Owner', cell: (r) => r.ownerName ?? 'Unknown' },
              { key: 'barangay', header: 'Barangay' },
              {
                key: 'mapped',
                header: 'Map',
                sort: (r) => (r.mapped ? 1 : 0),
                cell: (r) =>
                  r.mapped ? <Badge tone="green">Pinned</Badge> : <Badge tone="red">No location</Badge>,
              },
              { key: 'status', header: 'Status', cell: (r) => <StrayStatusBadge status={r.status} /> },
              { key: 'violations', header: 'Violations' },
            ]}
          />
        </Card>
      )}
      <StrayDialog open={open} onOpenChange={setOpen} />
      <StrayUpdateDialog
        open={!!selected && canEdit}
        onOpenChange={(o) => !o && setSelected(null)}
        stray={selected}
      />
    </div>
  );
}
