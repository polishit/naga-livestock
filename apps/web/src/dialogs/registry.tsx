import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
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
  FARM_TYPE_LABELS,
  RECORD_SOURCES,
  RECORD_SOURCE_LABELS,
  type Breakdown,
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
import { BreakdownEditor, breakdownOk, cleanBreakdown } from '@/dialogs/services';
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
  source?: string | null;
}

/** Where the office got the record: the CVO builds the masterlist from DA lists and farm visits. */
// forwardRef so the form can show the saved value (react-hook-form passes a ref through register).
const SourceSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SourceSelect(props, ref) {
    return (
      <Select ref={ref} {...props}>
        <option value="">Not specified</option>
        {RECORD_SOURCES.map((s) => (
          <option key={s} value={s}>
            {RECORD_SOURCE_LABELS[s]}
          </option>
        ))}
      </Select>
    );
  },
);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b border-slate-200 pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
      {children}
    </h4>
  );
}

/** Used by the Add Owner guide to chain the owner → farm → livestock forms. */
interface WizardProps {
  /** e.g. "Step 1 of 3", shown in the title. In a guide step the form saves quietly and shows Next. */
  step?: string;
  /** Called with the record's id (new or edited) instead of opening its page. */
  onCreated?: (id: number) => void;
  /** Shows a Back button that returns to the previous step. */
  onBack?: () => void;
}

/** Footer for the guide steps: Back, Cancel and Next (or Save on the last step). */
function StepFooter({
  formId,
  loading,
  onBack,
  onCancel,
  next,
}: {
  formId: string;
  loading: boolean;
  onBack?: () => void;
  onCancel: () => void;
  next: string;
}) {
  return (
    <>
      {onBack && (
        <Button variant="outline" onClick={onBack} className="mr-auto">
          <ChevronLeft /> Back
        </Button>
      )}
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button form={formId} type="submit" loading={loading}>
        {next}
        {next === 'Next' && <ChevronRight />}
      </Button>
    </>
  );
}

export function OwnerDialog({
  open,
  onOpenChange,
  owner,
  step,
  onCreated,
  onBack,
}: DialogProps & WizardProps & { owner?: OwnerRecord }) {
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
    source: owner?.source ?? (editing ? '' : 'FARM_VISIT'),
    confirmDuplicate: false,
    ...(editing ? { status: owner!.status } : {}),
  };
  useResetOnOpen(open, form, values as any);
  const save = useSave<any, { id: number }>(
    editing ? 'PATCH' : 'POST',
    editing ? `/api/owners/${owner!.id}` : '/api/owners',
    {
      success: step ? '' : editing ? 'Livestock owner updated.' : 'Livestock owner added to the masterlist.',
      label: (b) => `${editing ? 'Update' : 'Add'} owner ${b.fullName}`,
      form,
      onDone: (res) => {
        if (step && !isQueued(res) && onCreated)
          return onCreated(editing ? owner!.id : (res as { id: number }).id);
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
      title={
        step
          ? `${step}: Livestock Owner`
          : editing
            ? `Edit Livestock Owner ${owner!.code}`
            : 'Add Livestock Owner'
      }
      footer={
        step ? (
          <StepFooter
            formId="owner-form"
            loading={save.isPending}
            onBack={onBack}
            onCancel={() => onOpenChange(false)}
            next="Next"
          />
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="owner-form" type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add owner'}
            </Button>
          </>
        )
      }
    >
      <form
        id="owner-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <SectionTitle>Personal Information</SectionTitle>
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
        <Field
          label="RSBSA number"
          error={err(e, 'rsbsa')}
          hint="Registry System for Basic Sectors in Agriculture, if registered"
        >
          <Input {...form.register('rsbsa')} />
        </Field>
        <SectionTitle>Record</SectionTitle>
        <Field label="Source of record" error={err(e, 'source')} hint="Where the office got this information">
          <SourceSelect {...form.register('source')} />
        </Field>
        {editing && !step && (
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
  /** Tagged animals insured by this policy. */
  animals?: { id: number; code: string; earTag: string | null }[];
}

/** One of the owner's tagged animals, offered for linking to a policy. */
export interface InsurableAnimal {
  id: number;
  code: string;
  earTag: string | null;
  species: string;
  status: string;
  farmName: string;
}

/** Record a PCIC policy, or update one (e.g. mark it claimed or cancelled). */
export function PcicDialog({
  open,
  onOpenChange,
  ownerId,
  policy,
  animals = [],
}: DialogProps & { ownerId: number; policy?: PcicRecord | null; animals?: InsurableAnimal[] }) {
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
    animalIds: (policy?.animals ?? []).map((a) => String(a.id)),
  } as any);
  // The owner's active animals of the policy's species (plus any already on the policy).
  const species = form.watch('species');
  const linked = new Set((policy?.animals ?? []).map((a) => a.id));
  const choices = animals.filter((a) => a.species === species && (a.status === 'ACTIVE' || linked.has(a.id)));
  const chosen = (form.watch('animalIds') || []) as string[];
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
        onSubmit={form.handleSubmit((v) =>
          save.mutate({
            ...v,
            // Animals of another species (ticked before the species changed) are not sent.
            animalIds: ((v.animalIds ?? []) as number[]).filter((id) => choices.some((a) => a.id === id)),
          }),
        )}
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
        <Field
          label={`Insured animals (ear tags) · ${chosen.filter((id) => choices.some((a) => String(a.id) === String(id))).length} selected`}
          hint="Tick the tagged animals this policy covers. Untagged heads can stay unlinked."
          error={err(e, 'animalIds')}
          className="sm:col-span-2"
        >
          {choices.length ? (
            <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2 sm:grid-cols-2">
              {choices.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-[14px] text-slate-700">
                  <input
                    type="checkbox"
                    value={String(a.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#1d6fd8]"
                    {...form.register('animalIds')}
                  />
                  <span>
                    {a.earTag ?? 'No tag'}{' '}
                    <span className="text-slate-500">
                      · {a.code} · {a.farmName}
                    </span>
                    {a.status !== 'ACTIVE' && (
                      <span className="text-slate-500"> ({titleCase(a.status)})</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-[13.5px] text-slate-500">
              This owner has no active tagged {String(species).toLowerCase()}.
            </p>
          )}
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
  pastureLocation: string | null;
  pastureLat: number | null;
  pastureLng: number | null;
  lat: number | null;
  lng: number | null;
  remarks: string | null;
  ownerName: string;
  source?: string | null;
}

/** A lat/lng pair from form values, or null when either is blank or not a number. */
function pointOf(lat: unknown, lng: unknown) {
  return lat !== '' && lng !== '' && lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))
    ? { lat: Number(lat), lng: Number(lng) }
    : null;
}

export function FarmDialog({
  open,
  onOpenChange,
  ownerId,
  farm,
  step,
  onCreated,
  onBack,
}: DialogProps & WizardProps & { ownerId?: number; farm?: FarmEditRecord }) {
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
    address: farm?.address ?? '',
    lat: farm?.lat ?? '',
    lng: farm?.lng ?? '',
    remarks: farm?.remarks ?? '',
    source: farm?.source ?? (editing ? '' : 'FARM_VISIT'),
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
      success: step ? '' : editing ? 'Farm updated.' : 'Farm added to the masterlist.',
      label: (b) => `${editing ? 'Update' : 'Add'} farm ${b.name}`,
      form,
      onDone: (res) => {
        if (step && !isQueued(res) && onCreated)
          return onCreated(editing ? farm!.id : (res as { id: number }).id);
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
  const point = pointOf(form.watch('lat'), form.watch('lng'));
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

  const submit = form.handleSubmit((v) => save.mutate(v));
  // The owner is already known when the farm is added from the guide or from the owner's page.
  const ownerKnown = !!step || (!editing && !!ownerId);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={step ? `${step}: Farm` : editing ? `Edit Farm ${farm!.code}` : 'Add Farm'}
      size="lg"
      footer={
        step ? (
          <StepFooter
            formId="farm-form"
            loading={save.isPending}
            onBack={onBack}
            onCancel={() => onOpenChange(false)}
            next="Next"
          />
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="farm-form" type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add farm'}
            </Button>
          </>
        )
      }
    >
      <form id="farm-form" noValidate onSubmit={submit} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ownerKnown ? null : editing ? (
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
          <Field
            label="Farm scale"
            error={err(e, 'type')}
            hint="Livestock raised (piggery, goat only…) follows the species you add."
          >
            <Select {...form.register('type')}>
              {FARM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FARM_TYPE_LABELS[t]}
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
          <Field label="Zone / Purok" error={err(e, 'zone')} className="sm:col-span-2">
            <Input {...form.register('zone')} />
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
          <Field label="Source of record" error={err(e, 'source')}>
            <SourceSelect {...form.register('source')} />
          </Field>
          <Field label="Remarks" error={err(e, 'remarks')}>
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

export function GroupDialog({
  open,
  onOpenChange,
  farmId,
  step,
  onCreated,
  onBack,
}: DialogProps & WizardProps & { farmId: number }) {
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
  const [classify, setClassify] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  useEffect(() => {
    if (open) {
      setClassify(false);
      setBreakdown(null);
    }
  }, [open]);
  const save = useSave<any>('POST', '/api/population/groups', {
    success: step ? '' : 'Livestock added to the farm.',
    label: (b) => `Add ${b.species} group`,
    form,
    onDone: (res) => {
      if (onCreated) return onCreated(isQueued(res) ? 0 : (res as { id: number }).id);
      onOpenChange(false);
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${step ? `${step}: ` : ''}Add Livestock (Species and Head Count)`}
      footer={
        step ? (
          <StepFooter
            formId="group-form"
            loading={save.isPending}
            onBack={onBack}
            onCancel={() => onOpenChange(false)}
            next="Save"
          />
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="group-form" type="submit" loading={save.isPending}>
              Add livestock
            </Button>
          </>
        )
      }
    >
      <form
        id="group-form"
        noValidate
        onSubmit={form.handleSubmit((v) => {
          const b = classify ? cleanBreakdown(breakdown) : null;
          if (!breakdownOk(Number(v.count), b)) {
            form.setError('count', {
              type: 'manual',
              message: 'The classification must add up to the head count',
            });
            return;
          }
          save.mutate({ ...v, breakdown: b });
        })}
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
          label="Month counted"
          error={err(e, 'reportingMonth')}
          hint="Month the head count was taken (farm visit or DA list)."
        >
          <Input
            type="month"
            min={MIN_DATE.slice(0, 7)}
            max={isoMonth()}
            {...form.register('reportingMonth')}
          />
        </Field>
        <Field label="Head count *" error={err(e, 'count')}>
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
        <div className="sm:col-span-2">
          <Checkbox label="Classify by age, sex and stage" checked={classify} onChange={setClassify} />
          {classify && (
            <div className="mt-2">
              <BreakdownEditor
                species={form.watch('species')}
                total={Number(form.watch('count')) || 0}
                value={breakdown}
                onChange={setBreakdown}
                idPrefix="new-group"
              />
            </div>
          )}
        </div>
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
  breakdown?: Breakdown | null;
}

export function PopulationUpdateDialog({
  open,
  onOpenChange,
  farm,
  groups,
  prefill,
  note,
  onSaved,
  classifyGroupId,
}: DialogProps & {
  farm: { id: number; name: string };
  groups: GroupRow[];
  /** Open with this species' classification boxes showing (from "Classify" on a species card). */
  classifyGroupId?: number | null;
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
  // Classification (age, sex, stage) per species: optional, shown when ticked.
  const [classify, setClassify] = useState<Record<number, boolean>>({});
  const [breakdowns, setBreakdowns] = useState<Record<number, Breakdown | null>>({});
  useEffect(() => {
    if (!open) return;
    setClassify(
      Object.fromEntries(
        groups.map((g) => [g.id, g.id === classifyGroupId || !!cleanBreakdown(g.breakdown)]),
      ),
    );
    setBreakdowns(Object.fromEntries(groups.map((g) => [g.id, g.breakdown ?? null])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
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
      title={`Update Head Count — ${farm.name}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="pop-form" type="submit" loading={save.isPending} disabled={!groups.length}>
            Save head count
          </Button>
        </>
      }
    >
      <form
        id="pop-form"
        noValidate
        onSubmit={form.handleSubmit((v) => {
          const entries = (v.entries as { groupId: number; count: number; reason?: string }[]).map((x) => ({
            ...x,
            breakdown: classify[x.groupId] ? cleanBreakdown(breakdowns[x.groupId]) : null,
          }));
          const bad = entries.findIndex((x) => !breakdownOk(x.count, x.breakdown));
          if (bad >= 0) {
            form.setError(`entries.${bad}.count` as any, {
              type: 'manual',
              message: 'The classification must add up to this count',
            });
            return;
          }
          save.mutate({ ...v, entries });
        })}
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
          <p className="text-sm text-slate-500">
            This farm has no livestock recorded yet. Add a species first.
          </p>
        )}
        {groups.map((g, i) => {
          const val = Number(entries[i]?.count ?? g.count);
          const diff = isNaN(val) ? 0 : val - g.count;
          return (
            <div key={g.id} className="rounded-lg border border-slate-800/80 p-3 sm:px-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[15px] font-medium text-slate-900">
                    {g.species}
                    {g.breed ? ` · ${g.breed}` : ''}
                  </div>
                  <div className="text-[13px] text-slate-500">
                    {g.code} · last recorded {g.count} head
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
                  <Field label="Head count" error={e.entries?.[i]?.count?.message} className="w-28">
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
              <div className="mt-2">
                <Checkbox
                  label="Classify by age, sex and stage"
                  checked={!!classify[g.id]}
                  onChange={(c) => setClassify((x) => ({ ...x, [g.id]: c }))}
                />
              </div>
              {classify[g.id] && (
                <div className="mt-2">
                  <BreakdownEditor
                    species={g.species}
                    total={isNaN(val) ? 0 : val}
                    value={breakdowns[g.id]}
                    onChange={(b) => setBreakdowns((x) => ({ ...x, [g.id]: b }))}
                    idPrefix={`pop-${g.id}`}
                  />
                </div>
              )}
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
