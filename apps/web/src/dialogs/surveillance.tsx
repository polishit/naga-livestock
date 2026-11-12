import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CASE_OUTCOME_LABELS,
  CASE_STATUS_LABELS,
  DISPOSAL_METHODS,
  INVESTIGATION_VISIT_LABELS,
  INVESTIGATION_VISIT_TYPES,
  LAB_RESULTS,
  LAB_TEST_METHODS,
  MIN_DATE,
  RESPONSE_STATUSES,
  RESPONSE_STATUS_LABELS,
  RESPONSE_TYPES,
  RESPONSE_TYPES_WITH_END,
  RESPONSE_TYPES_WITH_LOCATION,
  RESPONSE_TYPE_LABELS,
  fmtDateTime,
  ROLES,
  ROLE_LABELS,
  caseCloseSchema,
  caseOutcomesFor,
  caseUpdateSchema,
  investigationCreateSchema,
  isoDate,
  labCreateSchema,
  responseCreateSchema,
  titleCase,
  userCreateSchema,
  userUpdateSchema,
  voidSchema,
  type CaseStatus,
  type ResponseType,
} from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { speciesOnFarm, useLookups, useResetOnOpen, useSave } from '@/lib/hooks';
import { MapView, type LatLng } from '@/components/MapView';
import { DiseasePicker } from '@/components/livestock';
import { err, useZodForm } from '@/components/forms';
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea } from '@/components/ui';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export interface LabLite {
  result: string;
  sentAt?: string | null;
  voided?: boolean;
}

export interface CaseEditRecord {
  id: number;
  code: string;
  disease: string;
  zone: string | null;
  affected: number;
  deaths: number;
  symptomsDate: string | null;
  symptoms: string | null;
  reportedBy: string | null;
  assignedToId: number | null;
  sampleInfo: string | null;
  remarks: string | null;
  reportedAt: string;
  farmId: number;
  species: string;
}

/** Update a case while the outbreak develops (more animals affected, more deaths, new inspector…). */
export function CaseEditDialog({ open, onOpenChange, c }: DialogProps & { c: CaseEditRecord }) {
  const { data: lookups } = useLookups();
  const head = speciesOnFarm(lookups, c.farmId).find((s) => s.species === c.species)?.head;
  const form = useZodForm(caseUpdateSchema, {});
  useResetOnOpen(open, form, {
    disease: c.disease,
    zone: c.zone ?? '',
    affected: String(c.affected),
    deaths: String(c.deaths),
    symptomsDate: c.symptomsDate ?? '',
    symptoms: c.symptoms ?? '',
    reportedBy: c.reportedBy ?? '',
    assignedToId: c.assignedToId ? String(c.assignedToId) : '',
    sampleInfo: c.sampleInfo ?? '',
    remarks: c.remarks ?? '',
  } as any);
  const save = useSave<any>('PATCH', `/api/cases/${c.id}`, {
    success: `${c.code} updated.`,
    label: () => `Update ${c.code}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit case details — ${c.code}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="case-edit-form" type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="case-edit-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Suspected disease *" error={err(e, 'disease')} className="sm:col-span-2">
          <DiseasePicker
            value={form.watch('disease') ?? ''}
            onChange={(v) => form.setValue('disease', v as any, { shouldDirty: true })}
            invalid={!!e.disease}
          />
        </Field>
        <Field
          label="Animals affected *"
          error={err(e, 'affected')}
          hint={head != null ? `${head} ${c.species.toLowerCase()} on this farm` : undefined}
        >
          <Input type="number" min={1} max={head} {...form.register('affected')} />
        </Field>
        <Field label="Deaths" error={err(e, 'deaths')}>
          <Input
            type="number"
            min={0}
            max={Number(form.watch('affected')) || undefined}
            {...form.register('deaths')}
          />
        </Field>
        <Field label="Zone / Purok" error={err(e, 'zone')}>
          <Input {...form.register('zone')} />
        </Field>
        <Field label="Date symptoms observed" error={err(e, 'symptomsDate')}>
          <Input type="date" min={MIN_DATE} max={c.reportedAt} {...form.register('symptomsDate')} />
        </Field>
        <Field label="Assigned inspector" error={err(e, 'assignedToId')}>
          <Select {...form.register('assignedToId')}>
            <option value="">Unassigned</option>
            {lookups?.inspectors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reported by" error={err(e, 'reportedBy')}>
          <Input {...form.register('reportedBy')} />
        </Field>
        <Field label="Observed symptoms" error={err(e, 'symptoms')} className="sm:col-span-2">
          <Textarea rows={3} {...form.register('symptoms')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Input {...form.register('remarks')} />
        </Field>
        <p className="text-[12.5px] text-slate-400 sm:col-span-2">
          Every change is written to the case History. Species, farm and report date cannot be changed —
          report a new incident instead.
        </p>
      </form>
    </Dialog>
  );
}

/** Void a wrong record (admin): it stays visible, struck through with the reason, and leaves all figures. */
export function VoidDialog({
  open,
  onOpenChange,
  url,
  what,
  onVoided,
}: DialogProps & { url: string; what: string; onVoided?: () => void }) {
  const form = useZodForm(voidSchema, {});
  useResetOnOpen(open, form, { reason: '' } as any);
  const save = useSave<any>('POST', url, {
    success: `${what} voided.`,
    label: () => `Void ${what}`,
    form,
    offline: false,
    onDone: () => {
      onOpenChange(false);
      onVoided?.();
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Void ${what}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" form="void-form" type="submit" loading={save.isPending}>
            Void record
          </Button>
        </>
      }
    >
      <form
        id="void-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-3"
      >
        <Field label="Reason *" error={err(e, 'reason')}>
          <Textarea rows={3} placeholder="e.g. Entered on the wrong farm" {...form.register('reason')} />
        </Field>
        <p className="text-[12.5px] text-slate-500">
          The record is kept (struck through) for the audit trail, but no longer counts in any figure,
          reminder or report.
        </p>
      </form>
    </Dialog>
  );
}

export function CaseCloseDialog({
  open,
  onOpenChange,
  caseId,
  code,
  status,
  tested,
  blockers = [],
}: DialogProps & {
  caseId: number;
  code: string;
  status: CaseStatus;
  /** Whether any laboratory result came back (decides the wording of the reasons). */
  tested: boolean;
  /** What still stops the case from closing (from caseCloseBlockers). */
  blockers?: string[];
}) {
  const outcomes = caseOutcomesFor(status);
  const form = useZodForm(caseCloseSchema, {});
  useResetOnOpen(open, form, { outcome: '', note: '' } as any);
  const save = useSave<any>('POST', `/api/cases/${caseId}/close`, {
    success: `${code} closed.`,
    label: () => `Close ${code}`,
    form,
    offline: false,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Close case — ${code}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="close-form" type="submit" loading={save.isPending} disabled={blockers.length > 0}>
            Close case
          </Button>
        </>
      }
    >
      <form
        id="close-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-4"
      >
        {blockers.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] text-slate-700">
            <div className="font-medium">Finish these first:</div>
            <ul className="mt-1 list-disc pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="rounded-md bg-slate-50 px-3 py-2 text-[14px] text-slate-600">
          Result: <b className="font-medium text-slate-800">{CASE_STATUS_LABELS[status]}</b>
          {status === 'POSITIVE'
            ? ' — choose how the outbreak ended.'
            : tested
              ? ' — the disease was not confirmed.'
              : ' — no laboratory test was done (for example a false alarm, or the animals recovered).'}
        </p>
        <Field label="Outcome *" error={err(e, 'outcome')}>
          <Select {...form.register('outcome')} aria-invalid={!!e.outcome}>
            <option value="">Select...</option>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {CASE_OUTCOME_LABELS[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Closing remarks *" error={err(e, 'note')}>
          <Textarea
            rows={4}
            placeholder="e.g. Quarantine lifted after 30 days; no new cases; farm disinfected."
            {...form.register('note')}
          />
        </Field>
        <p className="text-[12.5px] text-slate-400">
          A closed case keeps its visits, samples, responses and history (they still appear in reports), but
          nothing can be added or changed. An administrator can reopen it to make a correction; the reopening
          is recorded in the history.
        </p>
      </form>
    </Dialog>
  );
}

export function CaseLocationDialog({
  open,
  onOpenChange,
  caseId,
  code,
  initial,
  hint,
}: DialogProps & { caseId: number; code: string; initial?: LatLng | null; hint?: LatLng | null }) {
  const [point, setPoint] = useState<LatLng | null>(initial ?? null);
  const save = useSave<LatLng>('PATCH', `/api/cases/${caseId}/location`, {
    success: `${code} location saved.`,
    label: () => `Set location for ${code}`,
    onDone: () => onOpenChange(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setPoint(initial ?? null);
        onOpenChange(o);
      }}
      title={`Add location — ${code}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!point} loading={save.isPending} onClick={() => point && save.mutate(point)}>
            Save location
          </Button>
        </>
      }
    >
      <p className="mb-2 text-[13px] text-slate-500">
        Click the map where the case was observed; drag the pin to adjust.
      </p>
      <MapView
        className="h-[360px]"
        pick={{ value: point, onChange: setPoint }}
        groundZero={hint}
        fitKey={open ? 1 : 0}
      />
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <Input
            inputMode="decimal"
            value={point?.lat ?? ''}
            onChange={(e) => setPoint((p) => ({ lat: Number(e.target.value), lng: p?.lng ?? 123.24 }))}
          />
        </Field>
        <Field label="Longitude">
          <Input
            inputMode="decimal"
            value={point?.lng ?? ''}
            onChange={(e) => setPoint((p) => ({ lat: p?.lat ?? 13.63, lng: Number(e.target.value) }))}
          />
        </Field>
      </div>
    </Dialog>
  );
}

/** A visit record being edited (to fix a typo). */
export interface InvestigationEditRecord {
  id: number;
  date: string;
  visitType: string;
  investigator: string | null;
  animalsExamined: number | null;
  sickCount: number | null;
  deadCount: number | null;
  clinicalSigns: string | null;
  biosecurity: string | null;
  actionsTaken: string | null;
  samplesCollected: boolean;
  nextVisit: string | null;
  notes: string;
}

export function InvestigationDialog({
  open,
  onOpenChange,
  caseId,
  code,
  investigation: inv,
  minDate,
}: DialogProps & {
  caseId: number;
  code: string;
  /** Edit this visit instead of adding one. */
  investigation?: InvestigationEditRecord | null;
  /** First day of the case (symptoms or report date); a visit cannot be earlier. */
  minDate?: string;
}) {
  const { user } = useAuth();
  const form = useZodForm(investigationCreateSchema, {});
  useResetOnOpen(open, form, {
    date: inv?.date ?? isoDate(),
    visitType: inv?.visitType ?? 'INITIAL',
    investigator: inv ? (inv.investigator ?? '') : (user?.name ?? ''),
    animalsExamined: inv?.animalsExamined ?? '',
    sickCount: inv?.sickCount ?? '',
    deadCount: inv?.deadCount ?? '',
    clinicalSigns: inv?.clinicalSigns ?? '',
    biosecurity: inv?.biosecurity ?? '',
    actionsTaken: inv?.actionsTaken ?? '',
    samplesCollected: inv?.samplesCollected ?? false,
    nextVisit: inv?.nextVisit ?? '',
    notes: inv?.notes ?? '',
  } as any);
  const save = useSave<any>(
    inv ? 'PATCH' : 'POST',
    inv ? `/api/investigations/${inv.id}` : `/api/cases/${caseId}/investigations`,
    {
      success: '',
      label: () => `Site visit for ${code}`,
      form,
      onDone: (res: any) => {
        onOpenChange(false);
        if (res.queued) return;
        // Dead animals found at the visit update the case's deaths (the server keeps the highest number).
        const d = res.deathsUpdated as { from: number; to: number } | null;
        toast.success(
          `${inv ? 'Site visit updated.' : 'Site visit recorded.'}${d ? ` Case deaths updated: ${d.from} → ${d.to}.` : ''}`,
        );
      },
    },
  );
  const e = form.formState.errors;
  const notes = form.watch('notes');
  const date = form.watch('date');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={inv ? `Edit site visit — ${code}` : `Record site visit — ${code}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            form="inv-form"
            type="submit"
            loading={save.isPending}
            disabled={!String(notes ?? '').trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="inv-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <Field label="Visit date *" error={err(e, 'date')}>
          <Input type="date" min={minDate ?? MIN_DATE} max={isoDate()} {...form.register('date')} />
        </Field>
        <Field label="Type of visit" error={err(e, 'visitType')}>
          <Select {...form.register('visitType')}>
            {INVESTIGATION_VISIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {INVESTIGATION_VISIT_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Investigator" error={err(e, 'investigator')}>
          <Input {...form.register('investigator')} />
        </Field>
        <Field label="Animals examined" error={err(e, 'animalsExamined')}>
          <Input type="number" min={0} {...form.register('animalsExamined')} />
        </Field>
        <Field label="Sick at the visit" error={err(e, 'sickCount')}>
          <Input type="number" min={0} {...form.register('sickCount')} />
        </Field>
        <Field
          label="Dead at the visit"
          error={err(e, 'deadCount')}
          hint="The case's deaths are raised to this number if it is higher"
        >
          <Input type="number" min={0} {...form.register('deadCount')} />
        </Field>
        <Field label="Clinical signs observed" error={err(e, 'clinicalSigns')} className="sm:col-span-3">
          <Textarea
            rows={2}
            placeholder="e.g. high fever, skin hemorrhages, loss of appetite"
            {...form.register('clinicalSigns')}
          />
        </Field>
        <Field label="Biosecurity observations" error={err(e, 'biosecurity')} className="sm:col-span-3">
          <Textarea
            rows={2}
            placeholder="e.g. no footbath, shared feed source, swill feeding"
            {...form.register('biosecurity')}
          />
        </Field>
        <Field label="Findings / summary *" error={err(e, 'notes')} className="sm:col-span-3">
          <Textarea rows={3} {...form.register('notes')} aria-invalid={!!e.notes} />
        </Field>
        <Field label="Actions taken / advice given" error={err(e, 'actionsTaken')} className="sm:col-span-2">
          <Textarea rows={2} {...form.register('actionsTaken')} />
        </Field>
        <Field label="Next visit" error={err(e, 'nextVisit')} hint="Adds a reminder to Notifications">
          <Input type="date" min={date || isoDate()} {...form.register('nextVisit')} />
        </Field>
        <div className="sm:col-span-3">
          <Checkbox
            label="Samples were collected during this visit (add them in step 3, Samples)"
            checked={!!form.watch('samplesCollected')}
            onChange={(v) => form.setValue('samplesCollected', v as any)}
          />
        </div>
      </form>
    </Dialog>
  );
}

export interface LabEditRecord {
  id: number;
  sampleId: string;
  sampleType: string | null;
  sampleCount?: number | null;
  testMethod?: string | null;
  collectedAt: string | null;
  laboratory: string | null;
  labReference?: string | null;
  submittedBy?: string | null;
  sentAt: string | null;
  result: string;
  resultDate: string | null;
  remarks?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export function LabDialog({
  open,
  onOpenChange,
  caseId,
  code,
  lab,
  minDate,
  onSaved,
}: DialogProps & {
  caseId: number;
  code: string;
  /** Edit this record (e.g. enter the result when it comes back) instead of adding a new one. */
  lab?: LabEditRecord | null;
  /** First day of the case; sample dates cannot be earlier. */
  minDate?: string;
  onSaved?: (values: { result: string; sentAt?: string }) => void;
}) {
  const { user } = useAuth();
  const form = useZodForm(labCreateSchema, {});
  useResetOnOpen(open, form, {
    sampleId: lab?.sampleId ?? '',
    sampleType: lab ? (lab.sampleType ?? '') : 'Whole blood',
    sampleCount: lab?.sampleCount != null ? String(lab.sampleCount) : '1',
    testMethod: lab?.testMethod ?? '',
    collectedAt: lab ? (lab.collectedAt ?? '') : isoDate(),
    laboratory: lab ? (lab.laboratory ?? '') : 'RADDL Region V, Pili',
    labReference: lab?.labReference ?? '',
    submittedBy: lab ? (lab.submittedBy ?? '') : (user?.name ?? ''),
    sentAt: lab?.sentAt ?? '',
    result: lab?.result ?? 'PENDING',
    resultDate: lab?.resultDate ?? '',
    remarks: lab?.remarks ?? '',
  } as any);
  const save = useSave<any>(
    lab ? 'PATCH' : 'POST',
    lab ? `/api/labs/${lab.id}` : `/api/cases/${caseId}/labs`,
    {
      success: '',
      label: (b) => `Sample ${b.sampleId} (${code})`,
      form,
      onDone: (res: any) => {
        onOpenChange(false);
        // The case status follows the samples: say when it changed.
        const status = res.queued ? null : (res.caseStatus as CaseStatus | null);
        toast.success(
          `${lab ? 'Sample updated.' : 'Sample added.'}${status ? ` The case is now: ${CASE_STATUS_LABELS[status]}.` : ''}`,
        );
        onSaved?.({ result: form.getValues('result'), sentAt: form.getValues('sentAt') || undefined });
      },
    },
  );
  const e = form.formState.errors;
  const collected = form.watch('collectedAt');
  const sent = form.watch('sentAt');
  const result = form.watch('result');
  const start = minDate ?? MIN_DATE;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={lab ? `Update sample ${lab.sampleId}` : `Add sample — ${code}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="lab-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="lab-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <p className="text-[12.5px] font-medium uppercase tracking-wide text-slate-500 sm:col-span-3">
          Sample
        </p>
        <Field label="Sample ID number *" error={err(e, 'sampleId')}>
          <Input {...form.register('sampleId')} aria-invalid={!!e.sampleId} placeholder={`RADDL-${code}`} />
        </Field>
        <Field label="Sample type" error={err(e, 'sampleType')}>
          <Input {...form.register('sampleType')} list="sample-types" />
        </Field>
        <datalist id="sample-types">
          {[
            'Whole blood',
            'Serum',
            'Tissue (spleen, lymph node)',
            'Nasal swab',
            'Oral swab',
            'Feces',
            'Carcass',
          ].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Field label="Number of samples" error={err(e, 'sampleCount')}>
          <Input type="number" min={1} {...form.register('sampleCount')} />
        </Field>
        <Field label="Collection date" error={err(e, 'collectedAt')}>
          <Input type="date" min={start} max={isoDate()} {...form.register('collectedAt')} />
        </Field>
        <Field label="Collected / submitted by" error={err(e, 'submittedBy')} className="sm:col-span-2">
          <Input {...form.register('submittedBy')} />
        </Field>
        <p className="text-[12.5px] font-medium uppercase tracking-wide text-slate-500 sm:col-span-3">
          Laboratory
        </p>
        <Field label="Laboratory" error={err(e, 'laboratory')}>
          <Input {...form.register('laboratory')} />
        </Field>
        <Field label="Date sent" error={err(e, 'sentAt')}>
          <Input type="date" min={collected || start} max={isoDate()} {...form.register('sentAt')} />
        </Field>
        <Field label="Laboratory reference no." error={err(e, 'labReference')}>
          <Input {...form.register('labReference')} placeholder="From the lab's receipt" />
        </Field>
        <Field label="Test requested" error={err(e, 'testMethod')}>
          <Input {...form.register('testMethod')} list="lab-tests" placeholder="e.g. PCR" />
        </Field>
        <datalist id="lab-tests">
          {LAB_TEST_METHODS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Field label="Result" error={err(e, 'result')}>
          <Select {...form.register('result')}>
            {LAB_RESULTS.map((r) => (
              <option key={r} value={r}>
                {titleCase(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={result === 'PENDING' ? 'Result date' : 'Result date *'} error={err(e, 'resultDate')}>
          <Input
            type="date"
            min={sent || collected || start}
            max={isoDate()}
            {...form.register('resultDate')}
          />
        </Field>
        <Field label="Remarks / result details" error={err(e, 'remarks')} className="sm:col-span-3">
          <Textarea rows={2} {...form.register('remarks')} />
        </Field>
        {lab?.updatedAt && (
          <p className="text-[12.5px] text-slate-400 sm:col-span-3">
            Last changed {fmtDateTime(lab.updatedAt)}
            {lab.updatedBy ? ` by ${lab.updatedBy}` : ''}. Every change is written to the case History.
          </p>
        )}
      </form>
    </Dialog>
  );
}

export interface ResponseEditRecord {
  id: number;
  type: string;
  status: string;
  date: string;
  endDate: string | null;
  location: string | null;
  personnel: string | null;
  remarks: string | null;
  heads: number | null;
  disposalMethod: string | null;
}

export function ResponseDialog({
  open,
  onOpenChange,
  caseId,
  code,
  response,
  minDate,
  maxHeads,
  onSaved,
  presetType,
}: DialogProps & {
  caseId: number;
  code: string;
  /** Edit this activity (e.g. mark a planned quarantine as started or completed). */
  response?: ResponseEditRecord | null;
  /** Activity type chosen in advance for a new record (e.g. from the ASF response steps). */
  presetType?: ResponseType;
  /** First day of the case; an activity cannot start earlier. */
  minDate?: string;
  /** Head of the affected species on the farm (limit for culling). */
  maxHeads?: number;
  onSaved?: (values: { type: string; heads?: string; status: string; added: number }) => void;
}) {
  const form = useZodForm(responseCreateSchema, {});
  useResetOnOpen(open, form, {
    type: response?.type ?? presetType ?? 'OWNER_NOTIFICATION',
    // A quarantine, restriction or checkpoint starts out in force; most other activities are done on the day.
    status:
      response?.status ??
      (presetType && RESPONSE_TYPES_WITH_END.includes(presetType) ? 'ONGOING' : 'COMPLETED'),
    date: response?.date ?? isoDate(),
    endDate: response?.endDate ?? '',
    location: response?.location ?? '',
    personnel: response?.personnel ?? '',
    remarks: response?.remarks ?? '',
    heads: response?.heads != null ? String(response.heads) : '',
    disposalMethod: response?.disposalMethod ?? '',
  } as any);
  const save = useSave<any>(
    response ? 'PATCH' : 'POST',
    response ? `/api/responses/${response.id}` : `/api/cases/${caseId}/responses`,
    {
      success: response ? 'Response activity updated.' : 'Response activity logged.',
      label: () => `Response activity (${code})`,
      form,
      onDone: () => {
        onOpenChange(false);
        const heads = Number(form.getValues('heads') ?? 0) || 0;
        onSaved?.({
          type: form.getValues('type'),
          heads: form.getValues('heads') as any,
          status: form.getValues('status'),
          // A planned cull removed no animals yet, so completing it adds all its heads.
          added: heads - (response && response.status !== 'PLANNED' ? (response.heads ?? 0) : 0),
        });
      },
    },
  );
  const e = form.formState.errors;
  const type = form.watch('type') as ResponseType;
  const status = form.watch('status');
  const date = form.watch('date');
  const culling = type === 'CULLING_DEPOPULATION';
  const withEnd = RESPONSE_TYPES_WITH_END.includes(type);
  const withPlace = RESPONSE_TYPES_WITH_LOCATION.includes(type);
  // New activity: a quarantine, restriction or checkpoint starts as "Ongoing" (in force).
  useEffect(() => {
    if (!open || response || !type || form.getFieldState('status').isDirty) return;
    form.setValue('status', withEnd ? 'ONGOING' : 'COMPLETED');
  }, [open, response, type, withEnd, form]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={response ? 'Update response activity' : 'Log response activity'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="resp-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="resp-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Activity type" error={err(e, 'type')}>
          <Select {...form.register('type')}>
            {RESPONSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RESPONSE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" error={err(e, 'status')}>
          <Select {...form.register('status')}>
            {RESPONSE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESPONSE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={status === 'PLANNED' ? 'Planned start' : 'Date started'}
          error={err(e, 'date')}
          hint={status === 'PLANNED' ? 'A planned activity may have a future date.' : undefined}
        >
          <Input
            type="date"
            min={minDate ?? MIN_DATE}
            max={status === 'PLANNED' ? undefined : isoDate()}
            {...form.register('date')}
          />
        </Field>
        {withEnd ? (
          <Field
            label={
              status === 'COMPLETED'
                ? 'Date lifted *'
                : type === 'QUARANTINE'
                  ? 'Quarantine until'
                  : 'Until (lifted / ends)'
            }
            error={err(e, 'endDate')}
            hint={
              status === 'COMPLETED'
                ? 'It stays in force until this date.'
                : "It stays in force until this date; you'll be reminded when it is due to end."
            }
          >
            <Input type="date" min={date || minDate || MIN_DATE} {...form.register('endDate')} />
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        {culling && (
          <>
            <Field
              label={status === 'PLANNED' ? 'Animals to be culled' : 'Number of animals culled *'}
              error={err(e, 'heads')}
              hint={maxHeads != null ? `${maxHeads} head of this species on the farm` : undefined}
            >
              <Input
                type="number"
                min={1}
                max={maxHeads}
                {...form.register('heads')}
                aria-invalid={!!e.heads}
              />
            </Field>
            <Field label="Disposal method" error={err(e, 'disposalMethod')}>
              <Select {...form.register('disposalMethod')}>
                <option value="">Select...</option>
                {DISPOSAL_METHODS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {withPlace && (
          <Field
            label={type === 'ASF_CHECKPOINT' ? 'Checkpoint location' : 'Location / area'}
            error={err(e, 'location')}
            className="sm:col-span-2"
          >
            <Input {...form.register('location')} placeholder="e.g. Brgy. Pacol boundary, national road" />
          </Field>
        )}
        <Field label="Personnel involved" error={err(e, 'personnel')} className="sm:col-span-2">
          <Input {...form.register('personnel')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Textarea rows={3} {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  title: string | null;
  role: string;
  active: boolean;
}

export function UserDialog({ open, onOpenChange, user }: DialogProps & { user?: UserRecord }) {
  const editing = !!user;
  const form = useZodForm(editing ? userUpdateSchema : userCreateSchema, {});
  useResetOnOpen(open, form, {
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'STAFF',
    title: user?.title ?? '',
    password: '',
    ...(editing ? { active: user!.active } : {}),
  } as any);
  const save = useSave<any>(editing ? 'PATCH' : 'POST', editing ? `/api/users/${user!.id}` : '/api/users', {
    success: editing ? 'User updated.' : 'User created.',
    form,
    offline: false,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${user!.name}` : 'Add user'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="user-form" type="submit" loading={save.isPending}>
            {editing ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Full name *" error={err(e, 'name')}>
          <Input {...form.register('name')} />
        </Field>
        <Field label="Email *" error={err(e, 'email')}>
          <Input type="email" {...form.register('email')} disabled={editing} />
        </Field>
        <Field label="Role" error={err(e, 'role')}>
          <Select {...form.register('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" error={err(e, 'title')}>
          <Input {...form.register('title')} placeholder="Veterinary Inspector" />
        </Field>
        <Field label={editing ? 'New password (optional)' : 'Password *'} error={err(e, 'password')}>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        {editing && (
          <Field label="Status">
            <Select
              value={form.watch('active') ? 'true' : 'false'}
              onChange={(ev) => form.setValue('active', (ev.target.value === 'true') as any)}
            >
              <option value="true">Active</option>
              <option value="false">Deactivated</option>
            </Select>
          </Field>
        )}
      </form>
    </Dialog>
  );
}
