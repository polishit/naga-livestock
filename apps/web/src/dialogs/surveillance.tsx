import { useState } from 'react';
import {
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  LAB_RESULTS,
  RESPONSE_TYPES,
  RESPONSE_TYPE_LABELS,
  ROLES,
  ROLE_LABELS,
  caseCloseSchema,
  caseStatusSchema,
  caseUpdateSchema,
  checkCaseStatus,
  investigationCreateSchema,
  isoDate,
  labCreateSchema,
  responseCreateSchema,
  titleCase,
  userCreateSchema,
  userUpdateSchema,
  vaccinationCreateSchema,
  voidSchema,
  type CaseStatus,
} from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useLookups, useResetOnOpen, useSave } from '@/lib/hooks';
import { MapView, type LatLng } from '@/components/MapView';
import { err, useZodForm } from '@/components/forms';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export interface LabLite {
  result: string;
  sentAt?: string | null;
  voided?: boolean;
}

/**
 * Status options follow the workflow: next stage only, Positive/Negative only with a matching lab
 * result, and corrections (going back) for administrators with a reason.
 */
export function CaseStatusDialog({
  open,
  onOpenChange,
  caseId,
  code,
  status,
  labs,
  suggest,
}: DialogProps & {
  caseId: number;
  code: string;
  status: CaseStatus;
  labs: LabLite[];
  suggest?: CaseStatus;
}) {
  const { isAdmin } = useAuth();
  const live = labs.filter((l) => !l.voided);
  const options = CASE_STATUSES.filter((s) => s !== status)
    .map((s) => ({ s, ...checkCaseStatus(status, s, live) }))
    .filter((o) => o.allowed && (!o.correction || isAdmin));
  const firstNormal = options.find((o) => !o.correction)?.s;
  const initial = suggest && options.some((o) => o.s === suggest) ? suggest : (firstNormal ?? '');
  const finalBlocked =
    status !== 'POSITIVE' &&
    status !== 'NEGATIVE' &&
    !options.some((o) => o.s === 'POSITIVE' || o.s === 'NEGATIVE');
  const form = useZodForm(caseStatusSchema, {});
  useResetOnOpen(open, form, { status: initial, note: '' } as any);
  const save = useSave<any>('POST', `/api/cases/${caseId}/status`, {
    success: 'Case status updated.',
    label: (b) => `${code} → ${CASE_STATUS_LABELS[b.status as CaseStatus]}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const selected = form.watch('status');
  const isCorrection = options.find((o) => o.s === selected)?.correction;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Update status — ${code}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="status-form" type="submit" loading={save.isPending} disabled={!options.length}>
            Confirm
          </Button>
        </>
      }
    >
      <form
        id="status-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-4"
      >
        {options.length ? (
          <Field label="New status" error={err(e, 'status')}>
            <Select {...form.register('status')}>
              {options.map((o) => (
                <option key={o.s} value={o.s}>
                  {CASE_STATUS_LABELS[o.s]}
                  {o.correction ? ' (correction)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="rounded-md bg-slate-50 px-3 py-2.5 text-[14.5px] text-slate-600">
            No status change is available for this case.
          </p>
        )}
        {finalBlocked && (
          <p className="text-[13px] text-slate-500">
            To mark this case Positive or Negative, add a laboratory record with that result first (Laboratory
            tab).
          </p>
        )}
        <Field label={isCorrection ? 'Reason for correction *' : 'Note'} error={err(e, 'note')}>
          <Textarea rows={3} {...form.register('note')} />
        </Field>
        <p className="text-[12.5px] text-slate-400">
          A case moves forward one stage at a time; laboratory results decide Positive or Negative. Going back
          is a correction that only an administrator can make.
        </p>
      </form>
    </Dialog>
  );
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
}

/** Update a case while the outbreak develops (more animals affected, more deaths, new inspector…). */
export function CaseEditDialog({ open, onOpenChange, c }: DialogProps & { c: CaseEditRecord }) {
  const { data: lookups } = useLookups();
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
          <Input {...form.register('disease')} aria-invalid={!!e.disease} />
        </Field>
        <Field label="Animals affected *" error={err(e, 'affected')}>
          <Input type="number" min={1} {...form.register('affected')} />
        </Field>
        <Field label="Deaths" error={err(e, 'deaths')}>
          <Input type="number" min={0} {...form.register('deaths')} />
        </Field>
        <Field label="Zone / Purok" error={err(e, 'zone')}>
          <Input {...form.register('zone')} />
        </Field>
        <Field label="Date symptoms observed" error={err(e, 'symptomsDate')}>
          <Input type="date" max={c.reportedAt} {...form.register('symptomsDate')} />
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
        <Field label="Sample information" error={err(e, 'sampleInfo')}>
          <Input {...form.register('sampleInfo')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')}>
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
export function VoidDialog({ open, onOpenChange, url, what }: DialogProps & { url: string; what: string }) {
  const form = useZodForm(voidSchema, {});
  useResetOnOpen(open, form, { reason: '' } as any);
  const save = useSave<any>('POST', url, {
    success: `${what} voided.`,
    label: () => `Void ${what}`,
    form,
    offline: false,
    onDone: () => onOpenChange(false),
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
}: DialogProps & { caseId: number; code: string }) {
  const form = useZodForm(caseCloseSchema, {});
  useResetOnOpen(open, form, { note: '' } as any);
  const save = useSave<any>('POST', `/api/cases/${caseId}/close`, {
    success: `${code} closed.`,
    label: () => `Close ${code}`,
    form,
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
          <Button form="close-form" type="submit" loading={save.isPending}>
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
        <Field label="Closing remarks / outcome *" error={err(e, 'note')}>
          <Textarea
            rows={4}
            placeholder="e.g. Quarantine lifted after 30 days; no new cases; farm disinfected."
            {...form.register('note')}
          />
        </Field>
        <p className="text-[12.5px] text-slate-400">
          A closed case is kept in the records, history and reports, but it no longer counts as an active case
          and can no longer be changed. An administrator can reopen it if needed.
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

export function InvestigationDialog({
  open,
  onOpenChange,
  caseId,
  code,
}: DialogProps & { caseId: number; code: string }) {
  const { user } = useAuth();
  const form = useZodForm(investigationCreateSchema, {});
  useResetOnOpen(open, form, { date: isoDate(), investigator: user?.name ?? '', notes: '' } as any);
  const save = useSave<any>('POST', `/api/cases/${caseId}/investigations`, {
    success: 'Investigation recorded.',
    label: () => `Investigation for ${code}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const notes = form.watch('notes');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add investigation"
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
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" error={err(e, 'date')}>
            <Input type="date" max={isoDate()} {...form.register('date')} />
          </Field>
          <Field label="Investigator" error={err(e, 'investigator')}>
            <Input {...form.register('investigator')} />
          </Field>
        </div>
        <Field label="Findings / notes *" error={err(e, 'notes')}>
          <Textarea rows={4} {...form.register('notes')} aria-invalid={!!e.notes} />
        </Field>
      </form>
    </Dialog>
  );
}

export interface LabEditRecord {
  id: number;
  sampleId: string;
  sampleType: string | null;
  collectedAt: string | null;
  laboratory: string | null;
  sentAt: string | null;
  result: string;
  resultDate: string | null;
  remarks?: string | null;
}

export function LabDialog({
  open,
  onOpenChange,
  caseId,
  code,
  lab,
  onSaved,
}: DialogProps & {
  caseId: number;
  code: string;
  /** Edit this record (e.g. enter the result when it comes back) instead of adding a new one. */
  lab?: LabEditRecord | null;
  onSaved?: (values: { result: string; sentAt?: string }) => void;
}) {
  const form = useZodForm(labCreateSchema, {});
  useResetOnOpen(open, form, {
    sampleId: lab?.sampleId ?? '',
    sampleType: lab ? (lab.sampleType ?? '') : 'Whole blood',
    collectedAt: lab ? (lab.collectedAt ?? '') : isoDate(),
    laboratory: lab ? (lab.laboratory ?? '') : 'RADDL Region V, Pili',
    sentAt: lab?.sentAt ?? '',
    result: lab?.result ?? 'PENDING',
    resultDate: lab?.resultDate ?? '',
    remarks: lab?.remarks ?? '',
  } as any);
  const save = useSave<any>(
    lab ? 'PATCH' : 'POST',
    lab ? `/api/labs/${lab.id}` : `/api/cases/${caseId}/labs`,
    {
      success: lab ? 'Laboratory record updated.' : 'Laboratory record added.',
      label: (b) => `Lab record ${b.sampleId} (${code})`,
      form,
      onDone: () => {
        onOpenChange(false);
        onSaved?.({ result: form.getValues('result'), sentAt: form.getValues('sentAt') || undefined });
      },
    },
  );
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={lab ? `Update lab record ${lab.sampleId}` : 'Add lab record'}
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
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Sample ID number *" error={err(e, 'sampleId')}>
          <Input {...form.register('sampleId')} aria-invalid={!!e.sampleId} placeholder={`RADDL-${code}`} />
        </Field>
        <Field label="Sample type" error={err(e, 'sampleType')}>
          <Input {...form.register('sampleType')} />
        </Field>
        <Field label="Collection date" error={err(e, 'collectedAt')}>
          <Input type="date" max={isoDate()} {...form.register('collectedAt')} />
        </Field>
        <Field label="Laboratory" error={err(e, 'laboratory')}>
          <Input {...form.register('laboratory')} />
        </Field>
        <Field label="Date sent" error={err(e, 'sentAt')}>
          <Input type="date" max={isoDate()} {...form.register('sentAt')} />
        </Field>
        <Field label="Result" error={err(e, 'result')}>
          <Select {...form.register('result')}>
            {LAB_RESULTS.map((r) => (
              <option key={r} value={r}>
                {titleCase(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Result date" error={err(e, 'resultDate')}>
          <Input type="date" max={isoDate()} {...form.register('resultDate')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')}>
          <Input {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

export function ResponseDialog({
  open,
  onOpenChange,
  caseId,
  code,
  onSaved,
}: DialogProps & {
  caseId: number;
  code: string;
  onSaved?: (values: { type: string; heads?: string }) => void;
}) {
  const form = useZodForm(responseCreateSchema, {});
  useResetOnOpen(open, form, {
    type: 'OWNER_NOTIFICATION',
    date: isoDate(),
    personnel: '',
    remarks: '',
    heads: '',
  } as any);
  const save = useSave<any>('POST', `/api/cases/${caseId}/responses`, {
    success: 'Response activity logged.',
    label: () => `Response activity (${code})`,
    form,
    onDone: () => {
      onOpenChange(false);
      onSaved?.({ type: form.getValues('type'), heads: form.getValues('heads') as any });
    },
  });
  const e = form.formState.errors;
  const type = form.watch('type');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log response activity"
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
        <Field label="Date" error={err(e, 'date')}>
          <Input type="date" max={isoDate()} {...form.register('date')} />
        </Field>
        {type === 'CULLING_DEPOPULATION' && (
          <Field
            label="Number of animals culled *"
            error={err(e, 'heads')}
            hint="Used to remind you to update the farm's population."
            className="sm:col-span-2"
          >
            <Input type="number" min={1} {...form.register('heads')} aria-invalid={!!e.heads} />
          </Field>
        )}
        <Field label="Personnel involved" error={err(e, 'personnel')} className="sm:col-span-2">
          <Input {...form.register('personnel')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Textarea rows={4} {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

export function VaccinationDialog({ open, onOpenChange, farmId }: DialogProps & { farmId?: number }) {
  const { data: lookups } = useLookups();
  const { user } = useAuth();
  const form = useZodForm(vaccinationCreateSchema, {});
  useResetOnOpen(open, form, {
    farmId: farmId ? String(farmId) : '',
    target: 'GROUP',
    groupId: '',
    animalId: '',
    count: '1',
    vaccine: '',
    date: isoDate(),
    nextDate: '',
    doseNumber: '1',
    batch: '',
    administeredBy: user?.name ?? '',
    remarks: '',
  } as any);
  const save = useSave<any>('POST', '/api/vaccinations', {
    success: 'Vaccination recorded.',
    label: (b) => `Vaccination: ${b.vaccine}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const fId = Number(form.watch('farmId'));
  const target = form.watch('target');
  const groups = (lookups?.groups ?? []).filter((g) => g.farmId === fId);
  const animals = (lookups?.animals ?? []).filter((a) => a.farmId === fId);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record vaccination"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="vax-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="vax-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Farm *" error={err(e, 'farmId')} className="sm:col-span-2">
          <Select
            {...form.register('farmId', {
              onChange: () => {
                form.setValue('groupId', '' as any);
                form.setValue('animalId', '' as any);
              },
            })}
            aria-invalid={!!e.farmId}
          >
            <option value="">Select...</option>
            {lookups?.farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.name} ({f.barangay})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target" error={err(e, 'target')}>
          <Select {...form.register('target')}>
            <option value="GROUP">Population group</option>
            <option value="ANIMAL">Tagged animal</option>
          </Select>
        </Field>
        {target === 'ANIMAL' ? (
          <Field label="Animal *" error={err(e, 'groupId') ?? err(e, 'animalId')}>
            <Select {...form.register('animalId')} disabled={!fId}>
              <option value="">{fId ? 'Select...' : 'Select farm first'}</option>
              {animals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.earTag ?? 'no tag'} · {a.species}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Group *" error={err(e, 'groupId')}>
            <Select {...form.register('groupId')} disabled={!fId}>
              <option value="">{fId ? 'Select...' : 'Select farm first'}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.species} · {g.count} head
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Number vaccinated" error={err(e, 'count')}>
          <Input type="number" min={1} {...form.register('count')} disabled={target === 'ANIMAL'} />
        </Field>
        <Field label="Vaccine name *" error={err(e, 'vaccine')}>
          <Input {...form.register('vaccine')} list="vaccine-names" aria-invalid={!!e.vaccine} />
        </Field>
        <datalist id="vaccine-names">
          <option value="Hog Cholera Vaccine" />
          <option value="NCD Vaccine" />
          <option value="Hemosep Vaccine" />
          <option value="FMD Vaccine" />
          <option value="Anti-Rabies Vaccine" />
        </datalist>
        <Field label="Date" error={err(e, 'date')}>
          <Input type="date" max={isoDate()} {...form.register('date')} />
        </Field>
        <Field label="Next schedule" error={err(e, 'nextDate')}>
          <Input type="date" {...form.register('nextDate')} />
        </Field>
        <Field label="Dose number" error={err(e, 'doseNumber')}>
          <Input type="number" min={1} {...form.register('doseNumber')} />
        </Field>
        <Field label="Batch / lot" error={err(e, 'batch')}>
          <Input {...form.register('batch')} />
        </Field>
        <Field label="Administered by" error={err(e, 'administeredBy')}>
          <Input {...form.register('administeredBy')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')}>
          <Input {...form.register('remarks')} />
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