import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ANIMAL_STATUSES,
  MAX_PHOTOS,
  MAX_PHOTO_MB,
  MIN_DATE,
  MIN_DOB,
  animalCreateSchema,
  animalMoveSchema,
  animalUpdateSchema,
  isoDate,
  titleCase,
  transferCreateSchema,
  ANIMAL_PURPOSES,
  ANIMAL_PURPOSE_LABELS,
  isLargeRuminant,
} from '@livestock/shared';
import { toast } from 'sonner';
import { isQueued, uploadFile } from '@/lib/api';
import {} from '@/lib/auth';
import { useLookups, useResetOnOpen, useSave } from '@/lib/hooks';
import {} from '@/components/MapView';
import { DocumentPicker, PhotoPicker, err, useZodForm } from '@/components/forms';
import { Button, Dialog, Field, Input, Select } from '@/components/ui';
import {} from './surveillance';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export interface AnimalRecord {
  id: number;
  code: string;
  earTag: string | null;
  species: string;
  breed: string | null;
  sex: string;
  dob: string | null;
  estimatedAge: string | null;
  lifeStage: string | null;
  markings: string | null;
  cowlick: string | null;
  purpose?: string | null;
  purposeLabel?: string | null;
  colcNo?: string | null;
  colcDate?: string | null;
  colcFileKeys?: string[];
  health: string | null;
  photoKeys: string[];
  remarks: string | null;
  status: string;
  groupId: number;
  farmId: number;
  farmName: string;
  ownerId: number;
  ownerName: string;
}

/** Species whose cowlicks (hair whorls) are recorded for identification. */
export const hasCowlick = (species?: string | null) => species === 'Cattle' || species === 'Carabao';

export function AnimalDialog({
  open,
  onOpenChange,
  animal,
  groupId,
}: DialogProps & { animal?: AnimalRecord; groupId?: number }) {
  const navigate = useNavigate();
  const editing = !!animal;
  const { data: lookups } = useLookups();
  const [photos, setPhotos] = useState<File[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  // The scanned Certificate of Ownership of Large Cattle.
  const [colcFiles, setColcFiles] = useState<File[]>([]);
  const [colcKept, setColcKept] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (open) {
      setPhotos([]);
      setKept(animal?.photoKeys ?? []);
      setColcFiles([]);
      setColcKept(animal?.colcFileKeys ?? []);
    }
  }, [open, animal]);
  const form = useZodForm(editing ? animalUpdateSchema : animalCreateSchema, {});
  useResetOnOpen(open, form, {
    groupId: groupId ? String(groupId) : '',
    earTag: animal?.earTag ?? '',
    breed: animal?.breed ?? '',
    sex: animal?.sex ?? 'Female',
    dob: animal?.dob ?? '',
    estimatedAge: animal?.estimatedAge ?? '',
    lifeStage: animal?.lifeStage ?? 'adult',
    markings: animal?.markings ?? '',
    cowlick: animal?.cowlick ?? '',
    purpose: animal?.purpose ?? '',
    colcNo: animal?.colcNo ?? '',
    colcDate: animal?.colcDate ?? '',
    health: animal?.health ?? 'healthy',
    remarks: animal?.remarks ?? '',
    ...(editing ? { status: animal!.status } : {}),
  } as any);
  const save = useSave<any, { id: number }>(
    editing ? 'PATCH' : 'POST',
    editing ? `/api/animals/${animal!.id}` : '/api/animals',
    {
      success: editing ? 'Animal record updated.' : 'Animal registered.',
      label: (b) => (editing ? `Update ${animal!.code}` : `Register animal ${b.earTag ?? ''}`),
      form,
      files: () => photos,
      photoField: 'photoKeys',
      onDone: (res) => {
        setPhotos([]);
        onOpenChange(false);
        if (!editing && !isQueued(res)) navigate(`/animals/${(res as { id: number }).id}`);
      },
    },
  );
  const e = form.formState.errors;
  const selectedGroup = lookups?.groups.find((g) => String(g.id) === String(form.watch('groupId')));
  // Cowlicks (hair whorls) identify cattle and carabao on ownership papers; other species skip it.
  const showCowlick = hasCowlick(selectedGroup?.species ?? animal?.species) || !!animal?.cowlick;
  // Purpose and the ownership certificate (COLC) are kept for cattle and carabao.
  const largeRuminant = isLargeRuminant(selectedGroup?.species ?? animal?.species ?? '');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${animal!.code}` : 'Register animal (ID / ear tag)'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="animal-form" type="submit" loading={save.isPending || uploading}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="animal-form"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          // The certificate scans are uploaded first (they need a connection).
          let colcKeys = colcKept;
          if (largeRuminant && colcFiles.length) {
            setUploading(true);
            try {
              colcKeys = [...colcKept];
              for (const f of colcFiles) colcKeys.push(await uploadFile(f, f.name, 'documents'));
            } catch {
              toast.error('Could not upload the certificate scan. Check the connection and try again.');
              return;
            } finally {
              setUploading(false);
            }
          }
          save.mutate({
            ...v,
            ...(showCowlick ? {} : { cowlick: editing ? null : undefined }),
            ...(largeRuminant
              ? { colcFileKeys: colcKeys }
              : { purpose: undefined, colcNo: undefined, colcDate: undefined }),
            photoKeys: kept,
          });
        })}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {!editing && (
          <Field
            label="Population Group *"
            error={err(e, 'groupId')}
            hint={
              selectedGroup
                ? `${selectedGroup.count - selectedGroup.tagged} untagged head left in ${selectedGroup.code}. The animal is counted within its group (the count does not change).`
                : 'Registering an animal does not change the group count; full groups are greyed out.'
            }
            className="sm:col-span-3"
          >
            <Select {...form.register('groupId')} aria-invalid={!!e.groupId}>
              <option value="">Select group...</option>
              {lookups?.groups.map((g) => (
                // A group is full when every head is already tagged: update its count first.
                <option key={g.id} value={g.id} disabled={g.tagged >= g.count}>
                  {g.code} · {g.farmName} · {g.species}
                  {g.breed ? ` (${g.breed})` : ''} · {g.tagged} of {g.count} tagged
                  {g.tagged >= g.count ? ' — full' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Ear Tag (Optional, Unique)" error={err(e, 'earTag')}>
          <Input {...form.register('earTag')} placeholder="ET-0000" />
        </Field>
        <Field label="Breed" error={err(e, 'breed')}>
          <Input {...form.register('breed')} placeholder={selectedGroup?.breed ?? ''} />
        </Field>
        <Field label="Sex" error={err(e, 'sex')}>
          <Select {...form.register('sex')}>
            <option>Female</option>
            <option>Male</option>
          </Select>
        </Field>
        <Field label="Date of Birth" error={err(e, 'dob')}>
          <Input type="date" min={MIN_DOB} max={isoDate()} {...form.register('dob')} />
        </Field>
        <Field label="Estimated Age" error={err(e, 'estimatedAge')}>
          <Input {...form.register('estimatedAge')} placeholder="e.g. 3 yrs" />
        </Field>
        <Field label="Life Stage" error={err(e, 'lifeStage')}>
          <Input {...form.register('lifeStage')} />
        </Field>
        <Field label="Color & Markings" error={err(e, 'markings')} className="sm:col-span-2">
          <Input {...form.register('markings')} />
        </Field>
        <Field label="Health Status" error={err(e, 'health')}>
          <Input {...form.register('health')} />
        </Field>
        {showCowlick && (
          <Field
            label="Cowlick (Hair Whorl) Pattern"
            hint="Number and position of the whorls, as on the ownership certificate"
            error={err(e, 'cowlick')}
            className="sm:col-span-2"
          >
            <Input {...form.register('cowlick')} placeholder="e.g. 2 on forehead, 1 on back" />
          </Field>
        )}
        {largeRuminant && (
          <>
            <Field label="Purpose" error={err(e, 'purpose')}>
              <Select {...form.register('purpose')}>
                <option value="">Not set</option>
                {ANIMAL_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {ANIMAL_PURPOSE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Ownership certificate no."
              hint="Certificate of Ownership of Large Cattle (COLC)"
              error={err(e, 'colcNo')}
            >
              <Input {...form.register('colcNo')} />
            </Field>
            <Field label="Date Issued" error={err(e, 'colcDate')}>
              <Input type="date" min={MIN_DOB} max={isoDate()} {...form.register('colcDate')} />
            </Field>
            <Field label="Scanned Certificate" className="sm:col-span-3">
              <DocumentPicker
                files={colcFiles}
                onFilesChange={setColcFiles}
                existing={colcKept}
                onExistingChange={setColcKept}
                max={2}
                label="Attach Certificate"
              />
            </Field>
          </>
        )}
        {editing && (
          <Field label="Status" error={err(e, 'status')}>
            <Select {...form.register('status')}>
              {ANIMAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={`Photos (up to ${MAX_PHOTOS}, max ${MAX_PHOTO_MB} MB each)`} className="sm:col-span-3">
          <PhotoPicker files={photos} onFilesChange={setPhotos} existing={kept} onExistingChange={setKept} />
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-3">
          <Input {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}

/** Move a tagged animal to another group on the same farm (e.g. young stock to the adult group). */
export function MoveGroupDialog({ open, onOpenChange, animal }: DialogProps & { animal: AnimalRecord }) {
  const { data: lookups } = useLookups();
  const form = useZodForm(animalMoveSchema, {});
  useResetOnOpen(open, form, { groupId: '', reason: '' } as any);
  const save = useSave<any>('POST', `/api/animals/${animal.id}/move`, {
    success: `${animal.code} moved to its new group.`,
    label: () => `Move ${animal.code}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const current = lookups?.groups.find((g) => g.id === animal.groupId);
  // Only groups of the same species on the same farm can take the animal.
  const choices = (lookups?.groups ?? []).filter(
    (g) => g.farmId === animal.farmId && g.species === animal.species && g.id !== animal.groupId,
  );
  const label = (g: { code: string; sex: string; breed: string | null; count: number }) =>
    `${g.code}${g.sex !== 'Mixed' ? ` · ${g.sex}` : ''}${g.breed ? ` · ${g.breed}` : ''} · ${g.count} head`;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${animal.code} to another group`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="move-form" type="submit" loading={save.isPending} disabled={!choices.length}>
            Move Animal
          </Button>
        </>
      }
    >
      <form
        id="move-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="space-y-4"
      >
        <p className="text-[14px] text-slate-600">
          Now in <b className="font-medium text-slate-800">{current ? label(current) : '—'}</b> at{' '}
          {animal.farmName}.
        </p>
        {choices.length ? (
          <Field label="New Group *" error={err(e, 'groupId')}>
            <Select {...form.register('groupId')} aria-invalid={!!e.groupId}>
              <option value="">Select...</option>
              {choices.map((g) => (
                <option key={g.id} value={g.id}>
                  {label(g)}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[14px] text-slate-600">
            {animal.farmName} has no other {animal.species.toLowerCase()} group. Add one on the farm page
            first (e.g. an &ldquo;adult&rdquo; group).
          </p>
        )}
        <Field label="Reason" error={err(e, 'reason')}>
          <Input {...form.register('reason')} placeholder="e.g. Weaned — now adult" />
        </Field>
        <p className="text-[13px] text-slate-400">
          One head moves from the old group to the new one; both changes are written to the farm&apos;s
          population history. To move the animal to another farm, use Transfer instead.
        </p>
      </form>
    </Dialog>
  );
}

export function TransferDialog({ open, onOpenChange, animal }: DialogProps & { animal: AnimalRecord }) {
  const { data: lookups } = useLookups();
  const form = useZodForm(transferCreateSchema, {});
  useResetOnOpen(open, form, {
    animalId: String(animal.id),
    toFarmId: '',
    date: isoDate(),
    type: 'TRANSFER',
    remarks: '',
  } as any);
  const save = useSave<any>('POST', '/api/transfers', {
    success: 'Ownership transfer recorded.',
    label: () => `Transfer ${animal.code}`,
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const owners = new Map((lookups?.owners ?? []).map((o) => [o.id, o.fullName]));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Record transfer — ${animal.code}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="transfer-form" type="submit" loading={save.isPending}>
            Record Transfer
          </Button>
        </>
      }
    >
      <form
        id="transfer-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[14px] text-slate-600 sm:col-span-2">
          Current: <b className="font-medium text-slate-900">{animal.ownerName}</b> · {animal.farmName}
        </div>
        <Field label="Receiving Farm (New Owner) *" error={err(e, 'toFarmId')} className="sm:col-span-2">
          <Select {...form.register('toFarmId')} aria-invalid={!!e.toFarmId}>
            <option value="">Select farm...</option>
            {lookups?.farms
              .filter((f) => f.id !== animal.farmId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {owners.get(f.ownerId)} · {f.name} ({f.barangay})
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Transfer Date *" error={err(e, 'date')}>
          <Input type="date" min={animal.dob ?? MIN_DATE} max={isoDate()} {...form.register('date')} />
        </Field>
        <Field label="Type" error={err(e, 'type')}>
          <Select {...form.register('type')}>
            <option value="TRANSFER">Transfer</option>
            <option value="REVERSAL">Reversal (correct an error)</option>
          </Select>
        </Field>
        <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
          <Input {...form.register('remarks')} placeholder="Sale between registered owners" />
        </Field>
        <p className="text-[13px] text-slate-400 sm:col-span-2">
          The animal moves to the receiving farm's {animal.species.toLowerCase()} group; one head is moved
          between the group counts.
        </p>
      </form>
    </Dialog>
  );
}
