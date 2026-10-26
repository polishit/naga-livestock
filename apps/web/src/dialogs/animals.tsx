import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ANIMAL_STATUSES,
  BARANGAYS,
  MAX_PHOTOS,
  MAX_PHOTO_MB,
  MIN_DATE,
  MIN_DOB,
  SPECIES,
  STRAY_STATUSES,
  animalCreateSchema,
  animalMoveSchema,
  animalUpdateSchema,
  fmtDate,
  isoDate,
  strayCreateSchema,
  strayUpdateSchema,
  titleCase,
  transferCreateSchema,
} from '@livestock/shared';
import { api, isQueued } from '@/lib/api';
import { useAddressLookup, useApi, useLookups, useResetOnOpen, useSave } from '@/lib/hooks';
import { MapView } from '@/components/MapView';
import { AddressLookupHint, PhotoGallery, PhotoPicker, err, useZodForm } from '@/components/forms';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';

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
  useEffect(() => {
    if (open) {
      setPhotos([]);
      setKept(animal?.photoKeys ?? []);
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
          <Button form="animal-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="animal-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate({ ...v, photoKeys: kept }))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {!editing && (
          <Field
            label="Population group *"
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
        <Field label="Ear tag (optional, unique)" error={err(e, 'earTag')}>
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
        <Field label="Date of birth" error={err(e, 'dob')}>
          <Input type="date" min={MIN_DOB} max={isoDate()} {...form.register('dob')} />
        </Field>
        <Field label="Estimated age" error={err(e, 'estimatedAge')}>
          <Input {...form.register('estimatedAge')} placeholder="e.g. 3 yrs" />
        </Field>
        <Field label="Life stage" error={err(e, 'lifeStage')}>
          <Input {...form.register('lifeStage')} />
        </Field>
        <Field label="Color & markings" error={err(e, 'markings')} className="sm:col-span-2">
          <Input {...form.register('markings')} />
        </Field>
        <Field label="Health status" error={err(e, 'health')}>
          <Input {...form.register('health')} />
        </Field>
        <Field label="Cowlick / distinguishing marks" error={err(e, 'cowlick')} className="sm:col-span-2">
          <Input {...form.register('cowlick')} />
        </Field>
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
  const label = (g: { code: string; lifeStage: string; sex: string; breed: string | null; count: number }) =>
    `${g.code} · ${titleCase(g.lifeStage)}${g.sex !== 'Mixed' ? ` · ${g.sex}` : ''}${g.breed ? ` · ${g.breed}` : ''} · ${g.count} head`;
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
            Move animal
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
          <Field label="New group *" error={err(e, 'groupId')}>
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
          <p className="rounded-md bg-slate-50 px-3 py-2.5 text-[14px] text-slate-600">
            {animal.farmName} has no other {animal.species.toLowerCase()} group. Add one on the farm page
            first (e.g. an &ldquo;adult&rdquo; group).
          </p>
        )}
        <Field label="Reason" error={err(e, 'reason')}>
          <Input {...form.register('reason')} placeholder="e.g. Weaned — now adult" />
        </Field>
        <p className="text-[12.5px] text-slate-400">
          One head moves from the old group to the new one; both changes are written to the farm&apos;s
          population history. To move the animal to another farm, use Transfer instead.
        </p>
      </form>
    </Dialog>
  );
}

/** Earlier stray incidents of an owner, so repeat offenders are noticed when deciding penalties. */
export function OwnerStrayHistory({
  ownerId,
  exceptId,
}: {
  ownerId?: number | string | null;
  exceptId?: number;
}) {
  const id = Number(ownerId) || 0;
  const { data } = useApi<{
    incidents: number;
    violations: number;
    open: number;
    last: { code: string; discoveredAt: string } | null;
  }>(id ? `/api/strays/owner/${id}/summary${exceptId ? `?except=${exceptId}` : ''}` : null);
  if (!id || !data) return null;
  if (!data.incidents)
    return <p className="text-[13px] text-slate-500">No earlier stray incidents for this owner.</p>;
  const repeat = data.incidents >= 2;
  return (
    <div
      role="status"
      className={
        repeat
          ? 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] text-red-800'
          : 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13.5px] text-amber-800'
      }
    >
      <b className="font-semibold">{repeat ? 'Repeat offender: ' : 'Earlier incident: '}</b>
      {data.incidents} earlier stray incident{data.incidents === 1 ? '' : 's'}
      {data.violations ? `, ${data.violations} violation(s) recorded` : ''}
      {data.last
        ? ` — last ${data.last.code} on ${fmtDate(data.last.discoveredAt)}`
        : ''}.{data.open ? ` ${data.open} still open.` : ''}
    </div>
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
            Record transfer
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
        <div className="rounded-md bg-slate-50 px-3 py-2 text-[14px] text-slate-600 sm:col-span-2">
          Current: <b className="font-medium text-slate-900">{animal.ownerName}</b> · {animal.farmName}
        </div>
        <Field label="Receiving farm (new owner) *" error={err(e, 'toFarmId')} className="sm:col-span-2">
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
        <Field label="Transfer date *" error={err(e, 'date')}>
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
        <p className="text-[12.5px] text-slate-400 sm:col-span-2">
          The animal moves to the receiving farm's {animal.species.toLowerCase()} group; one head is moved
          between the group counts.
        </p>
      </form>
    </Dialog>
  );
}

export function StrayDialog({ open, onOpenChange }: DialogProps) {
  const { data: lookups } = useLookups();
  const [photos, setPhotos] = useState<File[]>([]);
  const form = useZodForm(strayCreateSchema, {});
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  useResetOnOpen(open, form, {
    earTag: '',
    ownerId: '',
    species: 'Cattle',
    discoveredAt: local,
    barangay: '',
    location: '',
    description: '',
    lat: '',
    lng: '',
  } as any);
  const geo = useAddressLookup(form, { address: 'location', barangay: 'barangay' });
  const [tagHint, setTagHint] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      geo.reset();
      setTagHint(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  /** A registered ear tag tells us the species and the owner. */
  const lookupTag = async (tag: string) => {
    const q = tag.trim();
    if (!q) return setTagHint(null);
    try {
      const a = await api.get<{
        code: string;
        species: string;
        ownerId: number;
        ownerName: string;
        farmName: string;
      }>(`/api/animals/lookup?q=${encodeURIComponent(q)}`);
      // A registered tag decides the species and owner (the server checks they match).
      form.setValue('species', a.species as any, { shouldValidate: true });
      form.setValue('ownerId', String(a.ownerId) as any, { shouldValidate: true });
      setTagHint(`Registered animal ${a.code} (${a.species}) of ${a.ownerName}, ${a.farmName}.`);
    } catch {
      setTagHint('No registered animal has this tag — fill in the species and owner yourself.');
    }
  };
  const save = useSave<any>('POST', '/api/strays', {
    success: 'Stray livestock report saved.',
    label: (b) => `Stray report (${b.species}, ${b.barangay})`,
    form,
    files: () => photos,
    photoField: 'photoKeys',
    onDone: () => {
      setPhotos([]);
      onOpenChange(false);
    },
  });
  const e = form.formState.errors;
  const lat = form.watch('lat');
  const lng = form.watch('lng');
  const point = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Report stray livestock"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="stray-form" type="submit" loading={save.isPending}>
            Save report
          </Button>
        </>
      }
    >
      <form
        id="stray-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-5 lg:grid-cols-2"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Ear tag / Animal ID (if any)"
            error={err(e, 'earTag')}
            hint={tagHint ?? 'If the animal is registered, its species and owner are filled in.'}
            className="sm:col-span-2"
          >
            <Input {...form.register('earTag', { onBlur: (ev) => lookupTag(ev.target.value) })} />
          </Field>
          <Field
            label="Owner (if known)"
            error={err(e, 'ownerId')}
            hint="Leave blank if the owner is unknown."
            className="sm:col-span-2"
          >
            <Select {...form.register('ownerId')}>
              <option value="">Unknown owner</option>
              {lookups?.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName} · {o.barangay}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 empty:hidden">
            <OwnerStrayHistory ownerId={form.watch('ownerId')} />
          </div>
          <Field label="Species" error={err(e, 'species')}>
            <Select {...form.register('species')}>
              {SPECIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date & time discovered" error={err(e, 'discoveredAt')}>
            <Input
              type="datetime-local"
              min={`${MIN_DATE}T00:00`}
              max={local}
              {...form.register('discoveredAt')}
            />
          </Field>
          <Field label="Barangay *" error={err(e, 'barangay')}>
            <Select {...form.register('barangay')} aria-invalid={!!e.barangay}>
              <option value="">Select...</option>
              {BARANGAYS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Location *" error={err(e, 'location')}>
            <Input
              {...form.register('location')}
              aria-invalid={!!e.location}
              placeholder="Landmark or street"
            />
          </Field>
          <Field label="Description" error={err(e, 'description')} className="sm:col-span-2">
            <Textarea rows={3} {...form.register('description')} />
          </Field>
          <Field
            label={`Photos (up to ${MAX_PHOTOS}, max ${MAX_PHOTO_MB} MB each)`}
            className="sm:col-span-2"
          >
            <PhotoPicker files={photos} onFilesChange={setPhotos} />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] text-slate-500">
            Pin location (optional) — clicking the map also fills in the location and barangay.
          </p>
          <MapView
            className="h-64 sm:h-[300px]"
            pick={{
              value: point,
              onChange: (p) => {
                form.setValue('lat', String(p.lat) as any);
                form.setValue('lng', String(p.lng) as any);
                geo.lookup(p.lat, p.lng);
              },
            }}
            fitKey={open ? 1 : 0}
          />
          {point && (
            <p className="mt-1 text-[12.5px] text-slate-500">
              {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
            </p>
          )}
          <AddressLookupHint state={geo.state} onApplySuggestion={geo.applySuggestion} />
        </div>
      </form>
    </Dialog>
  );
}

export interface StrayRecord {
  id: number;
  code: string;
  status: string;
  violations: number;
  ownerId: number | null;
  remarks: string | null;
  species: string;
  barangay: string;
  location: string;
  description: string | null;
  discoveredAt: string;
  earTag: string | null;
  ownerName: string | null;
  photoKeys: string[];
  lat: number | null;
  lng: number | null;
}

export function StrayUpdateDialog({
  open,
  onOpenChange,
  stray,
}: DialogProps & { stray: StrayRecord | null }) {
  const { data: lookups } = useLookups();
  const form = useZodForm(strayUpdateSchema, {});
  useResetOnOpen(open, form, {
    status: stray?.status ?? 'REPORTED',
    violations: String(stray?.violations ?? 0),
    ownerId: stray?.ownerId ? String(stray.ownerId) : '',
    remarks: stray?.remarks ?? '',
  } as any);
  const save = useSave<any>('PATCH', `/api/strays/${stray?.id}`, {
    success: 'Incident updated.',
    form,
    onDone: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  if (!stray) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${stray.code} · Stray ${stray.species.toLowerCase()}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button form="stray-update" type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1 text-[14.5px] text-slate-700">
          <div>
            <span className="text-slate-500">Location:</span> {stray.location}, {stray.barangay}
          </div>
          <div>
            <span className="text-slate-500">Discovered:</span>{' '}
            {new Date(stray.discoveredAt).toLocaleString()}
          </div>
          {stray.earTag && (
            <div>
              <span className="text-slate-500">Tag:</span> {stray.earTag}
            </div>
          )}
          {stray.description && <div className="text-slate-600">{stray.description}</div>}
        </div>
        <PhotoGallery keys={stray.photoKeys} className="sm:max-w-[264px]" />
      </div>
      <form
        id="stray-update"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Status" error={err(e, 'status')}>
          <Select {...form.register('status')}>
            {STRAY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Violations" error={err(e, 'violations')}>
          <Input type="number" min={0} {...form.register('violations')} />
        </Field>
        <Field label="Owner" error={err(e, 'ownerId')} className="sm:col-span-2">
          <Select {...form.register('ownerId')}>
            <option value="">Unknown owner</option>
            {lookups?.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName} · {o.barangay}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2 empty:hidden">
          <OwnerStrayHistory ownerId={form.watch('ownerId')} exceptId={stray.id} />
        </div>
        <Field label="Remarks / actions taken" error={err(e, 'remarks')} className="sm:col-span-2">
          <Textarea rows={3} {...form.register('remarks')} />
        </Field>
      </form>
    </Dialog>
  );
}