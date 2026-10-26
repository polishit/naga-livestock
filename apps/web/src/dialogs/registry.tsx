import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BARANGAYS,
  FARM_TYPES,
  HEALTH_STATUSES,
  LIFE_STAGES,
  MIN_DATE,
  OWNER_STATUSES,
  PCIC_STATUSES,
  SEXES,
  SPECIES,
  fmtMonth,
  isoMonth,
  farmCreateSchema,
  farmUpdateSchema,
  groupCreateSchema,
  groupUpdateSchema,
  ownerCreateSchema,
  ownerUpdateSchema,
  pcicCreateSchema,
  populationUpdateSchema,
  titleCase,
} from '@livestock/shared';
import { ApiError, api, isQueued } from '@/lib/api';
import {
  offerFarmLocationForCases,
  useAddressLookup,
  useApi,
  useLookups,
  useResetOnOpen,
  useSave,
} from '@/lib/hooks';
import { MapView } from '@/components/MapView';
import { AddressLookupHint, err, useZodForm } from '@/components/forms';
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { useQueryClient } from '@tanstack/react-query';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/* ---------------- owners ---------------- */

export interface OwnerRecord {
  id: number;
  code: string;
  fullName: string;
  barangay: string;
  zone: string | null;
  street: string | null;
  contact: string | null;
  rsbsa: string | null;
  remarks: string | null;
  status: string;
}

export function OwnerDialog({ open, onOpenChange, owner }: DialogProps & { owner?: OwnerRecord }) {
  const navigate = useNavigate();
  const editing = !!owner;
  const form = useZodForm(editing ? ownerUpdateSchema : ownerCreateSchema, {});
  const values = {
    fullName: owner?.fullName ?? '',
    barangay: owner?.barangay ?? '',
    zone: owner?.zone ?? '',
    street: owner?.street ?? '',
    contact: owner?.contact ?? '',
    rsbsa: owner?.rsbsa ?? '',
    remarks: owner?.remarks ?? '',
    confirmDuplicate: false,
    ...(editing ? { status: owner!.status } : {}),
  };
  useResetOnOpen(open, form, values as any);
  const save = useSave<any, { id: number }>(
    editing ? 'PATCH' : 'POST',
    editing ? `/api/owners/${owner!.id}` : '/api/owners',
    {
      success: editing ? 'Owner updated.' : 'Owner registered.',
      label: (b) => `${editing ? 'Update' : 'Register'} owner ${b.fullName}`,
      form,
      onDone: (res) => {
        onOpenChange(false);
        if (!editing && !isQueued(res)) navigate(`/owners/${(res as { id: number }).id}`);
      },
    },
  );
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${owner!.code}` : 'Register livestock owner'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="owner-form" type="submit" loading={save.isPending}>
            {editing ? 'Save changes' : 'Register owner'}
          </Button>
        </>
      }
    >
      <form
        id="owner-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Full name *" error={err(e, 'fullName')} className="sm:col-span-2">
          <Input {...form.register('fullName')} aria-invalid={!!e.fullName} autoFocus />
        </Field>
        {(String(err(e, 'fullName') ?? '').startsWith('Possible duplicate') ||
          form.watch('confirmDuplicate')) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 sm:col-span-2">
            <Checkbox
              label="This is a different person — save anyway"
              checked={!!form.watch('confirmDuplicate')}
              onChange={(v) => {
                form.setValue('confirmDuplicate', v as any);
                if (v) form.clearErrors('fullName');
              }}
            />
          </div>
        )}
        <Field label="Barangay *" error={err(e, 'barangay')}>
          <Select {...form.register('barangay')} aria-invalid={!!e.barangay} wrapperClassName="sm:w-[195px]">
            <option value="">Select...</option>
            {BARANGAYS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="Zone / Purok" error={err(e, 'zone')}>
          <Input {...form.register('zone')} />
        </Field>
        <Field label="Street address" error={err(e, 'street')} className="sm:col-span-2">
          <Input {...form.register('street')} />
        </Field>
        <Field label="Contact number" error={err(e, 'contact')}>
          <Input {...form.register('contact')} inputMode="tel" placeholder="09XX-XXX-XXXX" />
        </Field>
        <Field label="Certification number" error={err(e, 'rsbsa')} hint="RSBSA number, if registered">
          <Input {...form.register('rsbsa')} />
        </Field>
        {editing && (
          <Field label="Status" error={err(e, 'status')}>
            <Select {...form.register('status')}>
              {OWNER_STATUSES.filter((s) => s !== 'ARCHIVED').map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Textarea {...form.register('remarks')} rows={3} />
        </Field>
      </form>
    </Dialog>
  );
}

interface ArchiveCheck {
  farms: {
    id: number;
    code: string;
    name: string;
    barangay: string;
    head: number;
    tagged: number;
    blockers: string[];
  }[];
}

export function ArchiveOwnerDialog({
  open,
  onOpenChange,
  owner,
}: DialogProps & { owner: { id: number; code: string } }) {
  const { data, refetch } = useApi<ArchiveCheck>(open ? `/api/owners/${owner.id}/archive-check` : null);
  const { data: lookups } = useLookups();
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const farms = data?.farms ?? [];

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await refetch();
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Archive ${owner.code}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="bg-red-400 hover:bg-red-500"
            disabled={farms.length > 0 || !data}
            loading={busy === 'owner'}
            onClick={() =>
              act('owner', () => api.post(`/api/owners/${owner.id}/archive`), 'Owner archived.').then(() => {
                onOpenChange(false);
                navigate('/owners');
              })
            }
          >
            Archive owner
          </Button>
        </>
      }
    >
      {farms.length > 0 ? (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[14.5px] text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This owner still has {farms.length} active farm(s). Reassign or archive each farm before archiving
            the owner.
          </div>
          <div className="space-y-3">
            {farms.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-800/80 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[15px] font-medium text-slate-900">
                      {f.code} · {f.name}
                    </div>
                    <div className="text-[13px] text-slate-500">
                      {f.barangay} · {f.head} head · {f.tagged} tagged
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label={`Reassign ${f.name}`}
                      value={targets[f.id] ?? ''}
                      onChange={(e) => setTargets((t) => ({ ...t, [f.id]: e.target.value }))}
                      wrapperClassName="w-full sm:w-56"
                    >
                      <option value="">Reassign to owner...</option>
                      {lookups?.owners
                        .filter((o) => o.id !== owner.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.fullName} ({o.code})
                          </option>
                        ))}
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!targets[f.id]}
                      loading={busy === `r${f.id}`}
                      onClick={() =>
                        act(
                          `r${f.id}`,
                          () => api.post(`/api/farms/${f.id}/reassign`, { ownerId: Number(targets[f.id]) }),
                          `${f.name} reassigned.`,
                        )
                      }
                    >
                      Reassign
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={f.blockers.length > 0}
                      loading={busy === `a${f.id}`}
                      onClick={() =>
                        act(`a${f.id}`, () => api.post(`/api/farms/${f.id}/archive`), `${f.name} archived.`)
                      }
                    >
                      Archive farm
                    </Button>
                  </div>
                </div>
                {f.blockers.length > 0 && (
                  <div className="mt-2 text-[13px] text-slate-500">
                    Cannot archive farm: {f.blockers.join('; ')}.
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[15px] text-slate-700">
          {data
            ? 'This owner has no active farms. Archiving hides the owner from registries; records and history are kept.'
            : 'Checking farms…'}
        </p>
      )}
    </Dialog>
  );
}

export interface PcicRecord {
  id: number;
  policyNo: string;
  species: string;
  heads: number;
  amountCovered: number | null;
  startDate: string;
  endDate: string;
  status: string;
  remarks: string | null;
}

/** Record a PCIC policy, or update one (e.g. mark it claimed or cancelled). */
export function PcicDialog({
  open,
  onOpenChange,
  ownerId,
  policy,
}: DialogProps & { ownerId: number; policy?: PcicRecord | null }) {
  const form = useZodForm(pcicCreateSchema, {});
  useResetOnOpen(open, form, {
    policyNo: policy?.policyNo ?? '',
    species: policy?.species ?? 'Swine',
    heads: String(policy?.heads ?? 1),
    amountCovered: policy?.amountCovered ?? '',
    startDate: policy?.startDate ?? '',
    endDate: policy?.endDate ?? '',
    status: policy?.status ?? 'ACTIVE',
    remarks: policy?.remarks ?? '',
  } as any);
  const save = useSave<any>(
    policy ? 'PATCH' : 'POST',
    policy ? `/api/owners/pcic/${policy.id}` : `/api/owners/${ownerId}/pcic`,
    {
      success: policy ? 'Insurance policy updated.' : 'Insurance policy recorded.',
      form,
      onDone: () => onOpenChange(false),
    },
  );
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={policy ? `Update policy ${policy.policyNo}` : 'Add PCIC insurance policy'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="pcic-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="pcic-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Policy number *" error={err(e, 'policyNo')}>
          <Input {...form.register('policyNo')} />
        </Field>
        <Field label="Species" error={err(e, 'species')}>
          <Select {...form.register('species')}>
            {SPECIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Insured heads *" error={err(e, 'heads')}>
          <Input type="number" min={1} {...form.register('heads')} />
        </Field>
        <Field label="Amount covered (₱)" error={err(e, 'amountCovered')}>
          <Input type="number" min={0} step="0.01" {...form.register('amountCovered')} />
        </Field>
        <Field label="Coverage start *" error={err(e, 'startDate')}>
          <Input type="date" min={MIN_DATE} {...form.register('startDate')} />
        </Field>
        <Field label="Coverage end *" error={err(e, 'endDate')}>
          <Input type="date" min={form.watch('startDate') || MIN_DATE} {...form.register('endDate')} />
        </Field>
        <Field label="Status" error={err(e, 'status')}>
          <Select {...form.register('status')}>
            {PCIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')}>
          <Input {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

/* ---------------- farms ---------------- */

export interface FarmEditRecord {
  id: number;
  code: string;
  name: string;
  type: string;
  barangay: string;
  zone: string | null;
  address: string | null;
  pastureArea: number | null;
  lat: number | null;
  lng: number | null;
  remarks: string | null;
  ownerName: string;
}

export function FarmDialog({
  open,
  onOpenChange,
  ownerId,
  farm,
}: DialogProps & { ownerId?: number; farm?: FarmEditRecord }) {
  const navigate = useNavigate();
  const { data: lookups } = useLookups();
  const [ownerQ, setOwnerQ] = useState('');
  const editing = !!farm;
  const qc = useQueryClient();
  const form = useZodForm(editing ? farmUpdateSchema : farmCreateSchema, {});
  useResetOnOpen(open, form, {
    ...(editing ? {} : { ownerId: ownerId ? String(ownerId) : '' }),
    name: farm?.name ?? '',
    type: farm?.type ?? 'backyard',
    barangay: farm?.barangay ?? '',
    zone: farm?.zone ?? '',
    pastureArea: farm?.pastureArea ?? '',
    address: farm?.address ?? '',
    lat: farm?.lat ?? '',
    lng: farm?.lng ?? '',
    remarks: farm?.remarks ?? '',
  } as any);
  const geo = useAddressLookup(form, { address: 'address', barangay: 'barangay' });
  useEffect(() => {
    if (open) geo.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = useSave<any, { id: number }>(
    editing ? 'PATCH' : 'POST',
    editing ? `/api/farms/${farm!.id}` : '/api/farms',
    {
      success: editing ? 'Farm updated.' : 'Farm registered.',
      label: (b) => `${editing ? 'Update' : 'Register'} farm ${b.name}`,
      form,
      onDone: (res) => {
        onOpenChange(false);
        if (!editing && !isQueued(res)) navigate(`/farms/${(res as { id: number }).id}`);
        if (editing && !isQueued(res))
          offerFarmLocationForCases(farm!.id, (res as { unmappedCases?: number }).unmappedCases, () =>
            qc.invalidateQueries(),
          );
      },
    },
  );
  const e = form.formState.errors;
  const lat = form.watch('lat');
  const lng = form.watch('lng');
  const point =
    lat !== '' && lng !== '' && lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : null;
  const owners = (lookups?.owners ?? []).filter(
    (o) => !ownerQ || `${o.fullName} ${o.code} ${o.barangay}`.toLowerCase().includes(ownerQ.toLowerCase()),
  );

  const onOwner = (id: string) => {
    form.setValue('ownerId', id);
    const o = lookups?.owners.find((x) => String(x.id) === id);
    if (o) {
      if (!form.getValues('barangay')) form.setValue('barangay', o.barangay);
      if (!form.getValues('zone') && o.zone) form.setValue('zone', o.zone);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${farm!.code}` : 'Register farm'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="farm-form" type="submit" loading={save.isPending}>
            {editing ? 'Save changes' : 'Register farm'}
          </Button>
        </>
      }
    >
      <form
        id="farm-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-5 lg:grid-cols-2"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {editing ? (
            <Field
              label="Owner"
              hint="To move this farm to another owner, use Archive on the owner's page → Reassign."
              className="sm:col-span-2"
            >
              <Input value={farm!.ownerName} disabled />
            </Field>
          ) : (
            <Field label="Owner *" error={err(e, 'ownerId')} className="sm:col-span-2">
              <Input
                value={ownerQ}
                onChange={(ev) => setOwnerQ(ev.target.value)}
                placeholder="Search owner..."
                className="mb-1.5"
                aria-label="Search owner"
              />
              <Controller
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onChange={(ev) => onOwner(ev.target.value)}
                    aria-invalid={!!e.ownerId}
                    aria-label="Owner"
                  >
                    <option value="">Select owner...</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.fullName} · {o.code} · {o.barangay}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </Field>
          )}
          <Field label="Farm name *" error={err(e, 'name')} className="sm:col-span-2">
            <Input {...form.register('name')} aria-invalid={!!e.name} />
          </Field>
          <Field label="Farm type" error={err(e, 'type')}>
            <Select {...form.register('type')}>
              {FARM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Barangay *" error={err(e, 'barangay')}>
            <Select {...form.register('barangay')} aria-invalid={!!e.barangay}>
              <option value="">Select...</option>
              {BARANGAYS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Zone / Purok" error={err(e, 'zone')}>
            <Input {...form.register('zone')} />
          </Field>
          <Field label="Pasture area (ha)" error={err(e, 'pastureArea')}>
            <Input type="number" step="0.01" min={0} {...form.register('pastureArea')} />
          </Field>
          <Field label="Farm address" error={err(e, 'address')} className="sm:col-span-2">
            <Input {...form.register('address')} />
          </Field>
          <Field label="Latitude" error={err(e, 'lat')}>
            <Input inputMode="decimal" {...form.register('lat')} />
          </Field>
          <Field label="Longitude" error={err(e, 'lng')}>
            <Input inputMode="decimal" {...form.register('lng')} />
          </Field>
          <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
            <Input {...form.register('remarks')} />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] text-slate-500">
            Click the map to set the farm location; drag the pin to adjust. The address and barangay are
            filled in automatically. Coordinates are optional.
          </p>
          <MapView
            className="h-64 sm:h-80"
            pick={{
              value: point,
              onChange: (p) => {
                form.setValue('lat', String(p.lat) as any);
                form.setValue('lng', String(p.lng) as any);
                geo.lookup(p.lat, p.lng);
              },
            }}
            fitKey={open ? 'open' : 'closed'}
          />
          <AddressLookupHint state={geo.state} onApplySuggestion={geo.applySuggestion} />
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------- population ---------------- */

export function GroupDialog({ open, onOpenChange, farmId }: DialogProps & { farmId: number }) {
  const form = useZodForm(groupCreateSchema, {});
  useResetOnOpen(open, form, {
    farmId: String(farmId),
    species: 'Swine',
    breed: '',
    sex: 'Mixed',
    lifeStage: 'Mixed',
    reportingMonth: isoMonth(),
    count: '0',
    healthStatus: 'Healthy',
    remarks: '',
  } as any);
  const save = useSave<any>('POST', '/api/population/groups', {
    success: 'Population group added.',
    label: (b) => `Add ${b.species} group`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add population group"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="group-form" type="submit" loading={save.isPending}>
            Add group
          </Button>
        </>
      }
    >
      <form
        id="group-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Species" error={err(e, 'species')}>
          <Select {...form.register('species')}>
            {SPECIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Breed" error={err(e, 'breed')}>
          <Input {...form.register('breed')} />
        </Field>
        <Field label="Sex" error={err(e, 'sex')}>
          <Select {...form.register('sex')}>
            {SEXES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Life stage" error={err(e, 'lifeStage')}>
          <Select {...form.register('lifeStage')}>
            {LIFE_STAGES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Reporting month"
          error={err(e, 'reportingMonth')}
          hint="Month the initial count was verified."
        >
          <Input
            type="month"
            min={MIN_DATE.slice(0, 7)}
            max={isoMonth()}
            {...form.register('reportingMonth')}
          />
        </Field>
        <Field label="Initial head count" error={err(e, 'count')}>
          <Input type="number" min={0} {...form.register('count')} />
        </Field>
        <Field label="Health status" error={err(e, 'healthStatus')}>
          <Select {...form.register('healthStatus')}>
            {HEALTH_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')}>
          <Input {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

export interface GroupRow {
  id: number;
  code: string;
  species: string;
  breed: string | null;
  sex: string;
  count: number;
  tagged: number;
}

export function PopulationUpdateDialog({
  open,
  onOpenChange,
  farm,
  groups,
  prefill,
  note,
  onSaved,
}: DialogProps & {
  farm: { id: number; name: string };
  groups: GroupRow[];
  /** Suggested new counts (e.g. after deaths in a disease case); staff review before saving. */
  prefill?: Record<number, { count: number; reason: string }>;
  note?: string;
  onSaved?: () => void;
}) {
  const form = useZodForm(populationUpdateSchema, {});
  useResetOnOpen(open, form, {
    farmId: String(farm.id),
    month: isoMonth(),
    entries: groups.map((g) => ({
      groupId: String(g.id),
      count: String(prefill?.[g.id]?.count ?? g.count),
      reason: prefill?.[g.id]?.reason ?? '',
    })),
  } as any);
  const save = useSave<any>('POST', '/api/population/updates', {
    success: `Population for ${farm.name} saved.`,
    label: () => `Population update — ${farm.name}`,
    form,
    onDone: () => {
      onOpenChange(false);
      onSaved?.();
    },
  });
  const e = form.formState.errors as any;
  const entries = form.watch('entries') ?? [];
  const month = form.watch('month');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Update population — ${farm.name}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="pop-form" type="submit" loading={save.isPending} disabled={!groups.length}>
            Save update
          </Button>
        </>
      }
    >
      <form
        id="pop-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-3"
      >
        {note && (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[14px] text-slate-700">
            {note}
          </p>
        )}
        <Field label="Reporting month" error={e.month?.message} className="w-full sm:w-48">
          <Input type="month" min={MIN_DATE.slice(0, 7)} max={isoMonth()} {...form.register('month')} />
        </Field>
        {!groups.length && (
          <p className="text-sm text-slate-500">This farm has no population groups yet. Add a group first.</p>
        )}
        {groups.map((g, i) => {
          const val = Number(entries[i]?.count ?? g.count);
          const diff = isNaN(val) ? 0 : val - g.count;
          return (
            <div key={g.id} className="rounded-lg border border-slate-800/80 p-3 sm:px-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[15px] font-medium text-slate-900">
                    {g.species} · {g.breed ?? '—'}
                  </div>
                  <div className="text-[13px] text-slate-500">
                    {g.code} · {g.sex} · previous {g.count}
                    {g.tagged ? ` · ${g.tagged} tagged` : ''}
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <Field label="Reason (optional)" className="w-44">
                    <Input
                      placeholder="births +3, deaths −1"
                      {...form.register(`entries.${i}.reason` as const)}
                    />
                  </Field>
                  <Field label="Count" error={e.entries?.[i]?.count?.message} className="w-24">
                    <Input
                      type="number"
                      min={g.tagged}
                      {...form.register(`entries.${i}.count` as const)}
                      aria-label={`${g.code} count`}
                    />
                  </Field>
                  <span
                    className={`w-10 pb-2.5 text-right text-[14px] ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}
                  >
                    {diff > 0 ? `+${diff}` : diff}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[12.5px] leading-relaxed text-slate-400">
          Change is measured against the previous month's value. Re-saving a month that already has an update
          amends it (the earlier entry is kept as "superseded" and never added again). Reasons use signed
          quantities (e.g. births +3, deaths −1). Animals registered with ID tags are counted within their
          group.{month ? ` Reporting for ${fmtMonth(month)}.` : ''}
        </p>
      </form>
    </Dialog>
  );
}

/** Fix a group's details. Species and head count are not edited here (counts change through monthly updates). */
export function GroupEditDialog({
  open,
  onOpenChange,
  group,
}: DialogProps & {
  group: {
    id: number;
    code: string;
    species: string;
    breed: string | null;
    sex: string;
    lifeStage: string;
    healthStatus: string;
  } | null;
}) {
  const form = useZodForm(groupUpdateSchema, {});
  useResetOnOpen(open, form, {
    breed: group?.breed ?? '',
    sex: group?.sex ?? 'Mixed',
    lifeStage: group?.lifeStage ?? 'Mixed',
    healthStatus: group?.healthStatus ?? 'Healthy',
    remarks: '',
  } as any);
  const save = useSave<any>('PATCH', `/api/population/groups/${group?.id}`, {
    success: 'Group updated.',
    label: () => `Update group ${group?.code}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  if (!group) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${group.code} · ${group.species}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="group-edit-form" type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="group-edit-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Breed" error={err(e, 'breed')}>
          <Input {...form.register('breed')} />
        </Field>
        <Field label="Sex" error={err(e, 'sex')}>
          <Select {...form.register('sex')}>
            {SEXES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Life stage" error={err(e, 'lifeStage')}>
          <Select {...form.register('lifeStage')}>
            {LIFE_STAGES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Health status" error={err(e, 'healthStatus')}>
          <Select {...form.register('healthStatus')}>
            {HEALTH_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Input {...form.register('remarks')} />
        </Field>
        <p className="text-[12.5px] text-slate-400 sm:col-span-2">
          To change the head count, use Update population. A group can be archived once its count is 0.
        </p>
      </form>
    </Dialog>
  );
}