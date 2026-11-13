import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CLASSIFICATIONS,
  MAX_HEAD,
  MIN_DATE,
  SERVICE_SPECIES_ORDER,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  LARGE_RUMINANT_SERVICES,
  PD_RESULTS,
  PD_RESULT_LABELS,
  isLargeRuminant,
  VISIT_FINDINGS,
  VISIT_FINDING_LABELS,
  VISIT_PURPOSES,
  VISIT_PURPOSE_LABELS,
  farmVisitCreateSchema,
  farmVisitUpdateSchema,
  isoDate,
  vaccinationCreateSchema,
  vaccinationUpdateSchema,
  type Breakdown,
  type ServiceType,
  type Species,
  type VisitPurpose,
} from '@livestock/shared';
import { ApiError, isQueued, mutate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useLookups, useResetOnOpen, useSave } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { err, useZodForm } from '@/components/forms';
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea } from '@/components/ui';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/* ---------------- classification breakdown ---------------- */

const sumOf = (b: Breakdown | null | undefined) => Object.values(b ?? {}).reduce((a, n) => a + (n || 0), 0);

/** Drops zero entries; an empty breakdown is sent as null (not classified). */
export function cleanBreakdown(b: Breakdown | null | undefined): Breakdown | null {
  const out: Breakdown = {};
  for (const [k, n] of Object.entries(b ?? {})) if (n > 0) out[k] = n;
  return Object.keys(out).length ? out : null;
}

/** True when a breakdown is empty (not classified) or adds up to the head count. */
export const breakdownOk = (count: number, b: Breakdown | null | undefined) =>
  !cleanBreakdown(b) || sumOf(b) === count;

/**
 * Head count per classification (age, sex and production stage) for one species.
 * Optional: leaving every box empty means the heads are not classified yet.
 */
export function BreakdownEditor({
  species,
  total,
  value,
  onChange,
  idPrefix = 'bd',
}: {
  species: string;
  total: number;
  value: Breakdown | null | undefined;
  onChange: (b: Breakdown) => void;
  idPrefix?: string;
}) {
  const list = CLASSIFICATIONS[species as Species] ?? CLASSIFICATIONS.Other;
  const classified = sumOf(value);
  const ok = classified === 0 || classified === total;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((c) => (
          <label key={c.code} htmlFor={`${idPrefix}-${c.code}`} className="block">
            <span className="block text-[13px] font-medium text-slate-700">{c.label}</span>
            <span className="block text-[12px] text-slate-400">
              {c.sex} · {c.age}
            </span>
            <Input
              id={`${idPrefix}-${c.code}`}
              type="number"
              min={0}
              max={MAX_HEAD}
              inputMode="numeric"
              className="mt-1 h-9"
              value={value?.[c.code] ? String(value[c.code]) : ''}
              placeholder="0"
              onChange={(e) => {
                const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                onChange({ ...(value ?? {}), [c.code]: n });
              }}
            />
          </label>
        ))}
      </div>
      <div
        className={cn('mt-2 text-[13px]', ok ? 'text-slate-500' : 'text-red-600')}
        role={ok ? undefined : 'alert'}
      >
        {classified === 0
          ? `Not classified yet — optional. Total: ${total} head.`
          : ok
            ? `All ${total} head classified.`
            : `Classified ${classified} of ${total} head — the numbers must add up to ${total}.`}
      </div>
    </div>
  );
}

/* ---------------- deworming & veterinary services ---------------- */

const PRODUCT_LABEL: Record<ServiceType, string> = {
  DEWORMING: 'Dewormer used',
  VACCINATION: 'Vaccine used *',
  CHECKUP: 'Medicine / vitamins given',
  PREGNANCY_DIAGNOSIS: 'Method (e.g. rectal palpation)',
  INSEMINATION: 'Semen / bull used',
  TREATMENT: 'Medicine given',
  OTHER: 'Product / material used',
};
const COUNT_LABEL: Record<ServiceType, string> = {
  DEWORMING: 'No. of heads dewormed *',
  VACCINATION: 'No. of heads vaccinated *',
  CHECKUP: 'No. of heads checked *',
  PREGNANCY_DIAGNOSIS: 'No. of heads examined *',
  INSEMINATION: 'No. of heads inseminated *',
  TREATMENT: 'No. of heads treated *',
  OTHER: 'No. of heads served *',
};
const speciesRank = (s: string) => {
  const i = (SERVICE_SPECIES_ORDER as readonly string[]).indexOf(s);
  return i < 0 ? 99 : i;
};

/** Buttons to pick a service type (easier to tap than a dropdown). */
function ServiceTypePicker({
  value,
  onChange,
  allowed = SERVICE_TYPES,
}: {
  value: ServiceType;
  onChange: (t: ServiceType) => void;
  allowed?: readonly ServiceType[];
}) {
  return (
    <div role="radiogroup" aria-label="Service" className="flex flex-wrap gap-2">
      {allowed.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-[14px] font-medium',
            value === t
              ? 'border-brand bg-brand text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
          )}
        >
          {SERVICE_TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}

/** Record a deworming, check-up, vaccination, treatment or other field service. */
export function ServiceDialog({
  open,
  onOpenChange,
  farmId,
  defaultType = 'DEWORMING',
}: DialogProps & { farmId?: number; defaultType?: ServiceType }) {
  const { data: lookups } = useLookups();
  const { user } = useAuth();
  const [farmQ, setFarmQ] = useState('');
  const form = useZodForm(vaccinationCreateSchema, {});
  useResetOnOpen(open, form, {
    serviceType: defaultType,
    farmId: farmId ? String(farmId) : '',
    target: 'GROUP',
    groupId: '',
    animalId: '',
    count: '1',
    vaccine: '',
    result: '',
    date: isoDate(),
    nextDate: '',
    doseNumber: '1',
    batch: '',
    administeredBy: user?.name ?? '',
    remarks: '',
  } as any);
  useEffect(() => {
    if (open) setFarmQ('');
  }, [open]);
  const type = (form.watch('serviceType') ?? 'DEWORMING') as ServiceType;
  const save = useSave<any>('POST', '/api/vaccinations', {
    success: `${SERVICE_TYPE_LABELS[type]} recorded.`,
    label: (b) =>
      `${SERVICE_TYPE_LABELS[b.serviceType as ServiceType] ?? 'Service'}${b.vaccine ? `: ${b.vaccine}` : ''}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const fId = Number(form.watch('farmId'));
  const target = form.watch('target');
  // Pregnancy diagnosis and insemination are given to cattle and carabao only.
  const ruminantOnly = LARGE_RUMINANT_SERVICES.includes(type);
  const groups = (lookups?.groups ?? [])
    .filter((g) => g.farmId === fId && (!ruminantOnly || isLargeRuminant(g.species)))
    .sort((a, b) => speciesRank(a.species) - speciesRank(b.species));
  const animals = (lookups?.animals ?? []).filter(
    (a) => a.farmId === fId && (!ruminantOnly || isLargeRuminant(a.species)),
  );
  const group = groups.find((g) => String(g.id) === String(form.watch('groupId')));
  const date = form.watch('date');
  const farms = (lookups?.farms ?? []).filter(
    (f) =>
      String(f.id) === String(form.watch('farmId')) ||
      !farmQ ||
      `${f.code} ${f.name} ${f.barangay}`.toLowerCase().includes(farmQ.toLowerCase()),
  );
  const isVax = type === 'VACCINATION';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record Deworming / Veterinary Service"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="service-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="service-form"
        noValidate
        onSubmit={form.handleSubmit((v) =>
          save.mutate({
            ...v,
            // Dose number and batch apply to vaccinations only.
            ...(isVax ? {} : { doseNumber: 1, batch: null }),
          }),
        )}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Service *" className="sm:col-span-2">
          <ServiceTypePicker
            value={type}
            onChange={(t) => {
              form.setValue('serviceType', t as any, { shouldDirty: true });
              // A group of another species cannot get pregnancy diagnosis or insemination.
              if (LARGE_RUMINANT_SERVICES.includes(t)) {
                const g = (lookups?.groups ?? []).find(
                  (x) => String(x.id) === String(form.getValues('groupId')),
                );
                if (g && !isLargeRuminant(g.species)) form.setValue('groupId', '' as any);
              }
            }}
          />
          {ruminantOnly && <p className="mt-1.5 text-[13px] text-slate-500">For cattle and carabao only.</p>}
        </Field>
        <Field label="Farm *" error={err(e, 'farmId')} className="sm:col-span-2">
          <Input
            value={farmQ}
            onChange={(ev) => setFarmQ(ev.target.value)}
            placeholder="Search farm, owner or barangay..."
            className="mb-1.5"
            aria-label="Search farm"
          />
          <Select
            {...form.register('farmId', {
              onChange: () => {
                form.setValue('groupId', '' as any);
                form.setValue('animalId', '' as any);
              },
            })}
            aria-invalid={!!e.farmId}
            aria-label="Farm"
          >
            <option value="">Select farm...</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.name} ({f.barangay})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Animals served" error={err(e, 'target')}>
          <Select {...form.register('target')}>
            <option value="GROUP">Livestock on the farm (by species)</option>
            <option value="ANIMAL">One tagged animal</option>
          </Select>
        </Field>
        {target === 'ANIMAL' ? (
          <Field label="Tagged animal *" error={err(e, 'groupId') ?? err(e, 'animalId')}>
            <Select {...form.register('animalId')} disabled={!fId}>
              <option value="">{fId ? 'Select...' : 'Select farm first'}</option>
              {animals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.earTag ?? 'No tag'} · {a.species} · {a.code}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Species / group *" error={err(e, 'groupId')}>
            <Select
              {...form.register('groupId', {
                onChange: (ev) => {
                  // The number served starts at the group's head count.
                  const g = groups.find((x) => String(x.id) === ev.target.value);
                  if (g) form.setValue('count', String(g.count) as any, { shouldValidate: true });
                },
              })}
              disabled={!fId}
            >
              <option value="">
                {!fId
                  ? 'Select farm first'
                  : groups.length
                    ? 'Select...'
                    : 'No cattle or carabao on this farm'}
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.species}
                  {g.breed ? ` (${g.breed})` : ''} · {g.count} head · {g.code}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label={COUNT_LABEL[type]}
          error={err(e, 'count')}
          hint={
            target === 'GROUP' && group ? `${group.species} on this farm: ${group.count} head` : undefined
          }
        >
          <Input
            type="number"
            min={1}
            max={target === 'GROUP' ? group?.count : 1}
            {...form.register('count')}
            disabled={target === 'ANIMAL'}
          />
        </Field>
        <Field label="Date *" error={err(e, 'date')}>
          <Input type="date" min={MIN_DATE} max={isoDate()} {...form.register('date')} />
        </Field>
        {type === 'PREGNANCY_DIAGNOSIS' && (
          <Field label="Result *" error={err(e, 'result')}>
            <Select {...form.register('result')} aria-invalid={!!e.result}>
              <option value="">Select...</option>
              {PD_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {PD_RESULT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={PRODUCT_LABEL[type]} error={err(e, 'vaccine')}>
          <Input {...form.register('vaccine')} list={`products-${type}`} aria-invalid={!!e.vaccine} />
        </Field>
        <datalist id="products-DEWORMING">
          <option value="Albendazole" />
          <option value="Ivermectin" />
          <option value="Levamisole" />
          <option value="Fenbendazole" />
          <option value="Closantel" />
        </datalist>
        <datalist id="products-VACCINATION">
          <option value="Hog Cholera Vaccine" />
          <option value="Hemosep Vaccine" />
          <option value="NCD Vaccine" />
          <option value="FMD Vaccine" />
          <option value="Anti-Rabies Vaccine" />
        </datalist>
        <datalist id="products-PREGNANCY_DIAGNOSIS">
          <option value="Rectal palpation" />
          <option value="Ultrasound" />
        </datalist>
        <datalist id="products-INSEMINATION">
          <option value="Frozen semen — Brahman" />
          <option value="Frozen semen — Murrah buffalo" />
          <option value="Frozen semen — Holstein" />
        </datalist>
        <datalist id="products-CHECKUP">
          <option value="Vitamins (B-complex)" />
          <option value="Iron dextrin" />
          <option value="Multivitamins" />
        </datalist>
        <Field
          label={isVax ? 'Next dose' : `Next ${SERVICE_TYPE_LABELS[type].toLowerCase()}`}
          error={err(e, 'nextDate')}
          hint="Optional — adds a reminder"
        >
          <Input type="date" min={date || isoDate()} {...form.register('nextDate')} />
        </Field>
        {isVax && (
          <>
            <Field label="Dose number" error={err(e, 'doseNumber')}>
              <Input type="number" min={1} {...form.register('doseNumber')} />
            </Field>
            <Field label="Batch / lot no." error={err(e, 'batch')}>
              <Input {...form.register('batch')} />
            </Field>
          </>
        )}
        <Field label="Done by" error={err(e, 'administeredBy')}>
          <Input {...form.register('administeredBy')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Input {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

export interface ServiceEditRecord {
  id: number;
  code: string;
  species: string;
  result?: string | null;
  serviceType: string;
  target: string;
  targetLabel: string;
  vaccine: string | null;
  date: string;
  nextDate: string | null;
  count: number;
  doseNumber: number;
  batch: string | null;
  administeredBy: string | null;
  remarks: string | null;
}

/** Fix the details of a service record. The farm and animals served stay the same. */
export function ServiceEditDialog({
  open,
  onOpenChange,
  record: v,
}: DialogProps & { record: ServiceEditRecord | null }) {
  const form = useZodForm(vaccinationUpdateSchema, {});
  useResetOnOpen(open, form, {
    serviceType: v?.serviceType ?? 'DEWORMING',
    vaccine: v?.vaccine ?? '',
    result: v?.result ?? '',
    date: v?.date ?? isoDate(),
    nextDate: v?.nextDate ?? '',
    count: String(v?.count ?? 1),
    doseNumber: String(v?.doseNumber ?? 1),
    batch: v?.batch ?? '',
    administeredBy: v?.administeredBy ?? '',
    remarks: v?.remarks ?? '',
  } as any);
  const save = useSave<any>('PATCH', `/api/vaccinations/${v?.id}`, {
    success: 'Record updated.',
    label: () => `Edit ${v?.code}`,
    form,
    offline: false,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const type = (form.watch('serviceType') ?? 'DEWORMING') as ServiceType;
  if (!v) return null;
  const isVax = type === 'VACCINATION';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${v.code}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="service-edit" type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[14px] text-slate-600">
        Animals served: <b className="font-medium text-slate-800">{v.targetLabel}</b>. The farm and animals
        cannot be changed here; an administrator can delete a record entered by mistake.
      </p>
      <form
        id="service-edit"
        noValidate
        onSubmit={form.handleSubmit((x) => {
          if (x.serviceType === 'VACCINATION' && !x.vaccine) {
            form.setError('vaccine', { type: 'manual', message: 'Enter the vaccine used' });
            return;
          }
          if (x.serviceType === 'PREGNANCY_DIAGNOSIS' && !x.result) {
            form.setError('result', { type: 'manual', message: 'Select the result' });
            return;
          }
          save.mutate(x);
        })}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Service *" className="sm:col-span-2">
          <ServiceTypePicker
            value={type}
            allowed={SERVICE_TYPES.filter(
              (t) => isLargeRuminant(v.species) || !LARGE_RUMINANT_SERVICES.includes(t),
            )}
            onChange={(t) => form.setValue('serviceType', t as any, { shouldDirty: true })}
          />
        </Field>
        <Field label={COUNT_LABEL[type]} error={err(e, 'count')}>
          <Input
            type="number"
            min={1}
            max={MAX_HEAD}
            readOnly={v.target === 'ANIMAL'}
            {...form.register('count')}
          />
        </Field>
        <Field label="Date *" error={err(e, 'date')}>
          <Input type="date" max={isoDate()} {...form.register('date')} />
        </Field>
        {type === 'PREGNANCY_DIAGNOSIS' && (
          <Field label="Result *" error={err(e, 'result')}>
            <Select {...form.register('result')} aria-invalid={!!e.result}>
              <option value="">Select...</option>
              {PD_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {PD_RESULT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={PRODUCT_LABEL[type]} error={err(e, 'vaccine')}>
          <Input {...form.register('vaccine')} />
        </Field>
        <Field label="Next schedule" error={err(e, 'nextDate')}>
          <Input type="date" {...form.register('nextDate')} />
        </Field>
        {isVax && (
          <>
            <Field label="Dose number *" error={err(e, 'doseNumber')}>
              <Input type="number" min={1} max={20} {...form.register('doseNumber')} />
            </Field>
            <Field label="Batch / lot no." error={err(e, 'batch')}>
              <Input {...form.register('batch')} />
            </Field>
          </>
        )}
        <Field label="Done by" error={err(e, 'administeredBy')}>
          <Input {...form.register('administeredBy')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Input {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

/* ---------------- farm visits ---------------- */

export interface VisitRecord {
  id: number;
  code: string;
  date: string;
  farmId: number;
  farmName: string | null;
  barangay: string | null;
  caseId: number | null;
  caseCode: string | null;
  caseDisease: string | null;
  purpose: string;
  purposeLabel: string;
  findings: string;
  findingsLabel: string;
  visitedBy: string | null;
  remarks: string | null;
}

/** A population group as the visit form needs it. */
export interface VisitGroup {
  id: number;
  code: string;
  species: string;
  breed: string | null;
  count: number;
  tagged: number;
  breakdown?: Breakdown | null;
}

interface CountRow {
  count: string;
  breakdown: Breakdown | null;
  classify: boolean;
}
interface ServiceRow {
  type: '' | ServiceType;
  count: string;
  product: string;
}

/**
 * Record a farm visit: the office's main field activity. In one form the staff note the purpose and
 * findings, update the head count (with the classification breakdown) and record deworming or other
 * services given during the visit. Editing a visit changes the visit details only.
 */
export function FarmVisitDialog({
  open,
  onOpenChange,
  farm,
  groups = [],
  cases = [],
  visit,
  defaultPurpose = 'ROUTINE',
  defaultCaseId,
}: DialogProps & {
  farm: { id: number; name: string };
  groups?: VisitGroup[];
  /** Open disease cases the visit can be linked to (e.g. monitoring around an outbreak). */
  cases?: { id: number; code: string; disease: string }[];
  visit?: VisitRecord | null;
  defaultPurpose?: VisitPurpose;
  defaultCaseId?: number;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const editing = !!visit;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({
    date: isoDate(),
    purpose: defaultPurpose as string,
    findings: 'NO_SIGNS',
    visitedBy: '',
    remarks: '',
    caseId: '',
  });
  const [updateCounts, setUpdateCounts] = useState(false);
  const [counts, setCounts] = useState<Record<number, CountRow>>({});
  const [giveServices, setGiveServices] = useState(false);
  const [services, setServices] = useState<Record<number, ServiceRow>>({});
  const sorted = [...groups].sort((a, b) => speciesRank(a.species) - speciesRank(b.species));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBusy(false);
    setV({
      date: visit?.date ?? isoDate(),
      purpose: visit?.purpose ?? defaultPurpose,
      findings: visit?.findings ?? 'NO_SIGNS',
      visitedBy: visit?.visitedBy ?? user?.name ?? '',
      remarks: visit?.remarks ?? '',
      caseId: visit?.caseId ? String(visit.caseId) : defaultCaseId ? String(defaultCaseId) : '',
    });
    setUpdateCounts(!editing && defaultPurpose === 'ROUTINE' && groups.length > 0);
    setGiveServices(!editing && (defaultPurpose === 'DEWORMING' || defaultPurpose === 'CHECKUP'));
    setCounts(
      Object.fromEntries(
        groups.map((g) => [
          g.id,
          { count: String(g.count), breakdown: g.breakdown ?? null, classify: !!cleanBreakdown(g.breakdown) },
        ]),
      ),
    );
    const svc: ServiceType | '' =
      defaultPurpose === 'DEWORMING' ? 'DEWORMING' : defaultPurpose === 'CHECKUP' ? 'CHECKUP' : '';
    setServices(
      Object.fromEntries(
        groups.map((g) => [
          g.id,
          {
            // Deworming is mainly for goats and cattle (and carabao); other species start unticked.
            type:
              svc === 'DEWORMING' && !['Goat', 'Cattle', 'Carabao', 'Sheep'].includes(g.species) ? '' : svc,
            count: String(g.count),
            product: '',
          },
        ]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When the purpose changes on a new visit, suggest the matching service for the farm's animals.
  const onPurpose = (p: string) => {
    setV((x) => ({ ...x, purpose: p }));
    if (editing) return;
    if (p === 'DEWORMING' || p === 'CHECKUP') {
      setGiveServices(true);
      setServices((s) =>
        Object.fromEntries(
          groups.map((g) => [
            g.id,
            {
              ...(s[g.id] ?? { count: String(g.count), product: '' }),
              type:
                p === 'DEWORMING' && !['Goat', 'Cattle', 'Carabao', 'Sheep'].includes(g.species)
                  ? ''
                  : (p as ServiceType),
            },
          ]),
        ),
      );
    }
    if (p === 'ROUTINE' && groups.length) setUpdateCounts(true);
  };

  const close = () => onOpenChange(false);

  const submit = async () => {
    const errs: Record<string, string> = {};
    const base = {
      date: v.date,
      purpose: v.purpose,
      findings: v.findings,
      visitedBy: v.visitedBy || null,
      remarks: v.remarks || null,
      caseId: v.caseId ? Number(v.caseId) : null,
    };
    const parsed = (editing ? farmVisitUpdateSchema : farmVisitCreateSchema).safeParse(
      editing ? base : { ...base, farmId: farm.id },
    );
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;

    const countEntries = updateCounts
      ? sorted.map((g) => {
          const r = counts[g.id];
          const n = Number(r?.count);
          if (r?.count === '' || isNaN(n) || n < 0) errs[`count-${g.id}`] = 'Enter the head count';
          else if (n < g.tagged) errs[`count-${g.id}`] = `At least ${g.tagged} (tagged animals)`;
          const b = r?.classify ? cleanBreakdown(r.breakdown) : null;
          if (b && !breakdownOk(n, b))
            errs[`count-${g.id}`] = 'The classification must add up to the head count';
          return { groupId: g.id, count: n, breakdown: b, reason: `Farm visit ${v.date}` };
        })
      : [];
    const serviceEntries = giveServices
      ? sorted
          .filter((g) => services[g.id]?.type)
          .map((g) => {
            const r = services[g.id]!;
            const n = Number(r.count);
            if (!n || n < 1) errs[`svc-${g.id}`] = 'Enter how many heads';
            else if (n > Number(updateCounts ? counts[g.id]?.count : g.count))
              errs[`svc-${g.id}`] = 'More than the head count';
            if (r.type === 'VACCINATION' && !r.product.trim()) errs[`svc-${g.id}`] = 'Enter the vaccine used';
            return {
              serviceType: r.type,
              farmId: farm.id,
              target: 'GROUP',
              groupId: g.id,
              count: n,
              vaccine: r.product.trim() || null,
              date: v.date,
              administeredBy: v.visitedBy || null,
              remarks: 'Given during farm visit',
            };
          })
      : [];
    if (giveServices && !serviceEntries.length && !Object.keys(errs).length)
      errs.services = 'Choose a service for at least one species, or untick “Services given”.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please correct the highlighted fields.');
      return;
    }

    setBusy(true);
    try {
      if (editing) {
        await mutate('PATCH', `/api/farm-visits/${visit!.id}`, base, {
          label: `Edit farm visit ${visit!.code}`,
          offline: false,
        });
        toast.success('Farm visit updated.');
      } else {
        const res = await mutate<{ code: string }>(
          'POST',
          '/api/farm-visits',
          { ...base, farmId: farm.id },
          {
            label: `Farm visit — ${farm.name}`,
          },
        );
        const queued = isQueued(res);
        if (countEntries.length)
          await mutate(
            'POST',
            '/api/population/updates',
            { farmId: farm.id, month: v.date.slice(0, 7), entries: countEntries },
            { label: `Head count from farm visit — ${farm.name}` },
          );
        for (const s of serviceEntries)
          await mutate('POST', '/api/vaccinations', s, {
            label: `${SERVICE_TYPE_LABELS[s.serviceType as ServiceType]} — ${farm.name}`,
          });
        const extra = [
          countEntries.length && 'head count updated',
          serviceEntries.length &&
            `${serviceEntries.length} service record${serviceEntries.length > 1 ? 's' : ''} added`,
        ].filter(Boolean);
        if (queued) toast.info('Saved offline — it will sync automatically when you are back online.');
        else
          toast.success(
            `Farm visit ${(res as { code: string }).code} recorded${extra.length ? ` (${extra.join(', ')})` : ''}.`,
          );
      }
      qc.invalidateQueries();
      close();
    } catch (e) {
      // The visit may already be saved; refresh so the farm page shows what was kept.
      qc.invalidateQueries();
      if (e instanceof ApiError && e.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(e.fieldErrors)) fe[k] = msgs[0];
        setErrors(fe);
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save the farm visit.');
    } finally {
      setBusy(false);
    }
  };

  const setCount = (id: number, patch: Partial<CountRow>) =>
    setCounts((c) => ({
      ...c,
      [id]: { ...(c[id] ?? { count: '0', breakdown: null, classify: false }), ...patch },
    }));
  const setService = (id: number, patch: Partial<ServiceRow>) =>
    setServices((s) => ({ ...s, [id]: { ...(s[id] ?? { type: '', count: '0', product: '' }), ...patch } }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${visit!.code}` : `Record Farm Visit — ${farm.name}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {editing ? 'Save changes' : 'Save visit'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section aria-label="Visit details" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date of visit *" error={errors.date}>
            <Input
              type="date"
              min={MIN_DATE}
              max={isoDate()}
              value={v.date}
              onChange={(e) => setV((x) => ({ ...x, date: e.target.value }))}
            />
          </Field>
          <Field label="Purpose *" error={errors.purpose}>
            <Select value={v.purpose} onChange={(e) => onPurpose(e.target.value)}>
              {VISIT_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {VISIT_PURPOSE_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Findings *" error={errors.findings}>
            <Select value={v.findings} onChange={(e) => setV((x) => ({ ...x, findings: e.target.value }))}>
              {VISIT_FINDINGS.map((f) => (
                <option key={f} value={f}>
                  {VISIT_FINDING_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visited by" error={errors.visitedBy}>
            <Input value={v.visitedBy} onChange={(e) => setV((x) => ({ ...x, visitedBy: e.target.value }))} />
          </Field>
          {(cases.length > 0 || v.caseId) && (
            <Field
              label="Related disease case"
              error={errors.caseId}
              hint="Link the visit when it checks a farm near a reported case."
              className="sm:col-span-2"
            >
              <Select value={v.caseId} onChange={(e) => setV((x) => ({ ...x, caseId: e.target.value }))}>
                <option value="">None</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.disease}
                  </option>
                ))}
                {v.caseId && !cases.some((c) => String(c.id) === v.caseId) && (
                  <option value={v.caseId}>{visit?.caseCode ?? `Case ${v.caseId}`}</option>
                )}
              </Select>
            </Field>
          )}
          <Field
            label="Remarks"
            error={errors.remarks}
            className={cases.length || v.caseId ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-4'}
          >
            <Textarea
              rows={2}
              value={v.remarks}
              placeholder="What was seen or done during the visit"
              onChange={(e) => setV((x) => ({ ...x, remarks: e.target.value }))}
            />
          </Field>
          {v.findings === 'SICK_ANIMALS' && !editing && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-800 sm:col-span-2 lg:col-span-4">
              Sick animals found: after saving, file an incident report under Disease Surveillance so the case
              can be monitored.
            </p>
          )}
        </section>

        {!editing && (
          <section aria-label="Head count" className="rounded-lg border border-slate-200 p-4">
            <Checkbox
              label="Update the head count (masterlist) from this visit"
              checked={updateCounts}
              onChange={setUpdateCounts}
            />
            {updateCounts && (
              <div className="mt-3 space-y-3">
                {!sorted.length && (
                  <p className="text-[14px] text-slate-500">
                    This farm has no livestock recorded yet. Add each species on the farm page first.
                  </p>
                )}
                {sorted.map((g) => {
                  const r = counts[g.id];
                  const n = Number(r?.count);
                  return (
                    <div key={g.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <div className="text-[15px] font-medium text-slate-900">
                            {g.species}
                            {g.breed ? ` · ${g.breed}` : ''}
                          </div>
                          <div className="text-[13px] text-slate-500">
                            {g.code} · last recorded {g.count} head{g.tagged ? ` · ${g.tagged} tagged` : ''}
                          </div>
                        </div>
                        <div className="flex items-end gap-3">
                          <Field label="Head count now" error={errors[`count-${g.id}`]} className="w-36">
                            <Input
                              type="number"
                              min={g.tagged}
                              value={r?.count ?? ''}
                              aria-label={`${g.species} head count`}
                              onChange={(e) => setCount(g.id, { count: e.target.value })}
                            />
                          </Field>
                          <div className="pb-2">
                            <Checkbox
                              label="Classify"
                              checked={!!r?.classify}
                              onChange={(c) => setCount(g.id, { classify: c })}
                            />
                          </div>
                        </div>
                      </div>
                      {r?.classify && (
                        <div className="mt-3">
                          <BreakdownEditor
                            species={g.species}
                            total={isNaN(n) ? 0 : n}
                            value={r.breakdown}
                            onChange={(b) => setCount(g.id, { breakdown: b })}
                            idPrefix={`visit-${g.id}`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!editing && (
          <section aria-label="Services given" className="rounded-lg border border-slate-200 p-4">
            <Checkbox
              label="Services given during the visit (deworming, check-up, vaccination…)"
              checked={giveServices}
              onChange={setGiveServices}
            />
            {giveServices && (
              <div className="mt-3 space-y-2">
                {errors.services && (
                  <p className="text-[13px] text-red-600" role="alert">
                    {errors.services}
                  </p>
                )}
                {!sorted.length && (
                  <p className="text-[14px] text-slate-500">This farm has no livestock recorded yet.</p>
                )}
                {sorted.map((g) => {
                  const r = services[g.id];
                  return (
                    <div
                      key={g.id}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_190px_110px_1fr] sm:items-end"
                    >
                      <div className="text-[15px] font-medium text-slate-900 sm:pb-2">
                        {g.species}
                        <span className="ml-1 text-[13px] font-normal text-slate-500">({g.count} head)</span>
                      </div>
                      <Field label="Service">
                        <Select
                          value={r?.type ?? ''}
                          aria-label={`${g.species} service`}
                          onChange={(e) => setService(g.id, { type: e.target.value as ServiceType | '' })}
                        >
                          <option value="">None</option>
                          {SERVICE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {SERVICE_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Heads">
                        <Input
                          type="number"
                          min={1}
                          value={r?.count ?? ''}
                          disabled={!r?.type}
                          aria-label={`${g.species} heads served`}
                          onChange={(e) => setService(g.id, { count: e.target.value })}
                        />
                      </Field>
                      <Field
                        label={r?.type ? PRODUCT_LABEL[r.type].replace(' *', '') : 'Product used'}
                        error={errors[`svc-${g.id}`]}
                      >
                        <Input
                          value={r?.product ?? ''}
                          disabled={!r?.type}
                          list={r?.type ? `visit-products-${r.type}` : undefined}
                          aria-label={`${g.species} product used`}
                          onChange={(e) => setService(g.id, { product: e.target.value })}
                        />
                      </Field>
                    </div>
                  );
                })}
                <datalist id="visit-products-DEWORMING">
                  <option value="Albendazole" />
                  <option value="Ivermectin" />
                  <option value="Levamisole" />
                </datalist>
                <datalist id="visit-products-VACCINATION">
                  <option value="Hog Cholera Vaccine" />
                  <option value="Hemosep Vaccine" />
                  <option value="NCD Vaccine" />
                </datalist>
              </div>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}

interface FarmForVisit {
  farm: { id: number; name: string };
  groups: VisitGroup[];
  cases: { id: number; code: string; disease: string; closed: boolean }[];
}

/**
 * "Record Farm Visit" from a list page: choose the farm first, then the visit form opens with that
 * farm's livestock. `farmId` skips the choice (e.g. a farm picked on the map).
 */
export function FarmVisitLauncher({
  open,
  onOpenChange,
  farmId: presetFarm,
  defaultPurpose,
  defaultCaseId,
}: DialogProps & { farmId?: number; defaultPurpose?: VisitPurpose; defaultCaseId?: number }) {
  const { data: lookups } = useLookups();
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState('');
  const [farmId, setFarmId] = useState<number | null>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setChosen('');
      setFarmId(presetFarm ?? null);
    } else setFarmId(null);
  }, [open, presetFarm]);
  const { data } = useApi<FarmForVisit>(open && farmId ? `/api/farms/${farmId}` : null);
  const farms = (lookups?.farms ?? []).filter(
    (f) => !q || `${f.code} ${f.name} ${f.barangay}`.toLowerCase().includes(q.toLowerCase()),
  );
  if (farmId && data && data.farm.id === farmId)
    return (
      <FarmVisitDialog
        open={open}
        onOpenChange={onOpenChange}
        farm={data.farm}
        groups={data.groups}
        cases={data.cases.filter((c) => !c.closed)}
        defaultPurpose={defaultPurpose}
        defaultCaseId={defaultCaseId}
      />
    );
  return (
    <Dialog
      open={open && !farmId}
      onOpenChange={onOpenChange}
      title="Record Farm Visit"
      size="sm"
      guardChanges={false}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!chosen} onClick={() => setFarmId(Number(chosen))}>
            Next
          </Button>
        </>
      }
    >
      <Field label="Which farm was visited? *">
        <div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search farm, owner or barangay..."
            className="mb-1.5"
            aria-label="Search farm"
            autoFocus
          />
          <Select value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="Farm">
            <option value="">Select farm...</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.barangay} ({f.code})
              </option>
            ))}
          </Select>
        </div>
      </Field>
    </Dialog>
  );
}
