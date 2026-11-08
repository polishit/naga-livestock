import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { MAX_HEAD, isoDate, vaccinationUpdateSchema } from '@livestock/shared';
import { ApiError, api } from '@/lib/api';
import { useResetOnOpen, useSave } from '@/lib/hooks';
import { err, useZodForm } from '@/components/forms';
import { Button, Dialog, Field, Input } from '@/components/ui';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/**
 * Delete a record entered by mistake. The server refuses when other records depend on it and says what
 * to do instead (archive or void); that message is shown here so the user knows the next step.
 */
export function DeleteDialog({
  open,
  onOpenChange,
  url,
  what,
  onDeleted,
}: DialogProps & { url: string; what: string; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const [refused, setRefused] = useState('');
  const del = useMutation({
    mutationFn: () => api.delete(url),
    onSuccess: () => {
      toast.success(`${what} deleted.`);
      onOpenChange(false);
      onDeleted?.();
      qc.invalidateQueries();
    },
    onError: (e: unknown) => setRefused(e instanceof ApiError ? e.message : 'Could not delete. Try again.'),
  });
  const close = (o: boolean) => {
    if (!o) setRefused('');
    onOpenChange(o);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={`Delete ${what}?`}
      size="sm"
      guardChanges={false}
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)}>
            {refused ? 'Close' : 'Cancel'}
          </Button>
          {!refused && (
            <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate()}>
              Delete permanently
            </Button>
          )}
        </>
      }
    >
      {refused ? (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] text-amber-900"
        >
          {refused}
        </p>
      ) : (
        <div className="space-y-2 text-[14.5px] text-slate-700">
          <p>
            Use this only for a record <b>entered by mistake</b>. It is removed for good and cannot be brought
            back.
          </p>
          <p className="text-[13px] text-slate-500">
            If other records depend on it (cases, vaccinations, transfers…), the system will not delete it and
            will tell you to archive or void it instead, so no history is lost.
          </p>
        </div>
      )}
    </Dialog>
  );
}

export interface VaccinationEditRecord {
  id: number;
  code: string;
  target: string;
  targetLabel: string;
  vaccine: string;
  date: string;
  nextDate: string | null;
  count: number;
  doseNumber: number;
  batch: string | null;
  administeredBy: string | null;
  remarks: string | null;
}

/** Fix the details of a vaccination. Who was vaccinated stays the same (void and re-enter for that). */
export function VaccinationEditDialog({
  open,
  onOpenChange,
  vaccination: v,
}: DialogProps & { vaccination: VaccinationEditRecord | null }) {
  const form = useZodForm(vaccinationUpdateSchema, {});
  useResetOnOpen(open, form, {
    vaccine: v?.vaccine ?? '',
    date: v?.date ?? isoDate(),
    nextDate: v?.nextDate ?? '',
    count: String(v?.count ?? 1),
    doseNumber: String(v?.doseNumber ?? 1),
    batch: v?.batch ?? '',
    administeredBy: v?.administeredBy ?? '',
    remarks: v?.remarks ?? '',
  } as any);
  const save = useSave<any>('PATCH', `/api/vaccinations/${v?.id}`, {
    success: 'Vaccination updated.',
    label: () => `Edit vaccination ${v?.code}`,
    form,
    offline: false,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  if (!v) return null;
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
          <Button form="vax-edit" type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13.5px] text-slate-600">
        Vaccinated: <b className="font-medium text-slate-800">{v.targetLabel}</b>. To change who was
        vaccinated, void this record and record it again.
      </p>
      <form
        id="vax-edit"
        noValidate
        onSubmit={form.handleSubmit((x) => save.mutate(x))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Vaccine *" error={err(e, 'vaccine')} className="sm:col-span-2">
          <Input {...form.register('vaccine')} />
        </Field>
        <Field label="Date given *" error={err(e, 'date')}>
          <Input type="date" max={isoDate()} {...form.register('date')} />
        </Field>
        <Field label="Next dose" error={err(e, 'nextDate')}>
          <Input type="date" {...form.register('nextDate')} />
        </Field>
        <Field label="Number vaccinated *" error={err(e, 'count')}>
          <Input
            type="number"
            min={1}
            max={MAX_HEAD}
            readOnly={v.target === 'ANIMAL'}
            {...form.register('count')}
          />
        </Field>
        <Field label="Dose number *" error={err(e, 'doseNumber')}>
          <Input type="number" min={1} max={20} {...form.register('doseNumber')} />
        </Field>
        <Field label="Batch / lot no." error={err(e, 'batch')}>
          <Input {...form.register('batch')} />
        </Field>
        <Field label="Administered by" error={err(e, 'administeredBy')}>
          <Input {...form.register('administeredBy')} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Input {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}