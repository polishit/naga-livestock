import { AlertTriangle, Check, Link2, Lock, MapPin, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BARANGAYS,
  CASE_OUTCOME_LABELS,
  CASE_STAGE,
  CASE_STATUSES,
  ASF_RESPONSE_STEPS,
  CASE_STATUS_LABELS,
  RESPONSE_TYPES_WITH_END,
  checkCaseStatus,
  isAsfDisease,
  MAX_PHOTOS,
  MAX_PHOTO_MB,
  MIN_DATE,
  caseCreateSchema,
  fmtDate,
  fmtDateTime,
  isoDate,
  type CaseOutcome,
  type CaseStatus,
  type ResponseType,
} from '@livestock/shared';
import { isQueued } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { UNSAVED_MESSAGE, speciesOnFarm, useApi, useLookups, useSave, useUnsavedGuard } from '@/lib/hooks';
import { cn, qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { PhotoGallery, PhotoPicker, err, useZodForm } from '@/components/forms';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, KV, Loading, PageHeader, Timeline } from '@/components/page';
import { CaseStatusBadge, ClosedBadge, GeotagBadge, LabResultBadge } from '@/components/status';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Tabs,
  Textarea,
  type Tone,
} from '@/components/ui';
import { PopulationUpdateDialog, type GroupRow } from '@/dialogs/registry';
import {
  CaseCloseDialog,
  CaseEditDialog,
  CaseLocationDialog,
  CaseStatusDialog,
  InvestigationDialog,
  LabDialog,
  ResponseDialog,
  VoidDialog,
  type LabEditRecord,
  type LabLite,
  type ResponseEditRecord,
} from '@/dialogs/surveillance';
import type { CaseRow } from './types';

/* ---------------- Incident list ---------------- */

export function CasesPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  // Table (list) or Board (one column per surveillance stage); ?view=board opens the board.
  const view = params.get('view') === 'board' ? 'board' : 'table';
  const setView = (v: 'table' | 'board') => setParams(v === 'board' ? { view: v } : {}, { replace: true });
  const [barangay, setBarangay] = useState('');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('open');
  const { data, isLoading, error } = useApi<CaseRow[]>(`/api/cases${qs({ barangay, location, state })}`);
  const filters = (
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
        label="Location status"
        value={location}
        onChange={setLocation}
        options={[
          { value: 'mapped', label: 'Mapped' },
          { value: 'unmapped', label: 'Awaiting geotagging' },
        ]}
        all="Any location status"
        className="w-[calc(50%-4px)] sm:w-56"
      />
      <FilterSelect
        label="Case state"
        value={state}
        onChange={setState}
        options={[
          { value: 'open', label: 'Open cases' },
          { value: 'closed', label: 'Closed cases' },
        ]}
        all="All cases"
        className="w-full sm:w-44"
      />
    </>
  );
  return (
    <div>
      <PageHeader
        title="Disease Incident Reports"
        actions={
          <>
            <div
              className="inline-flex rounded-md border border-slate-300 p-0.5"
              role="group"
              aria-label="View"
            >
              {(['table', 'board'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={
                    view === v
                      ? 'rounded bg-brand-strong px-3 py-1.5 text-[13.5px] font-medium text-white'
                      : 'rounded px-3 py-1.5 text-[13.5px] text-slate-600 hover:bg-slate-50'
                  }
                >
                  {v === 'table' ? 'Table' : 'Board'}
                </button>
              ))}
            </div>
            {canEdit && (
              <Button onClick={() => navigate('/cases/new')}>
                <Plus /> Report incident
              </Button>
            )}
          </>
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : view === 'board' ? (
        <>
          <Card className="mb-3 flex flex-wrap gap-2 p-3">{filters}</Card>
          {isLoading ? <Loading /> : <CaseBoard cases={data ?? []} showClosed={state !== 'open'} />}
        </>
      ) : (
        <Card>
          <DataTable
            rows={data}
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/cases/${r.id}`)}
            pageSize={0}
            hideFooter
            toolbarDivider
            mobileTitle="disease"
            minWidth={980}
            defaultSort={{ key: 'reportedAt', dir: 'desc' }}
            toolbar={filters}
            columns={[
              { key: 'code', header: 'Case' },
              { key: 'reportedAt', header: 'Reported', cell: (r) => fmtDate(r.reportedAt) },
              { key: 'disease', header: 'Disease' },
              { key: 'farmName', header: 'Farm' },
              { key: 'species', header: 'Species' },
              { key: 'assignedToName', header: 'Assigned to', cell: (r) => r.assignedToName ?? '—' },
              {
                key: 'status',
                header: 'Status',
                sort: (r) => (r.closed ? 99 : CASE_STATUSES.indexOf(r.status)),
                cell: (r) => (
                  <div className="flex flex-wrap gap-1.5">
                    <CaseStatusBadge status={r.status} />
                    {r.closed && <ClosedBadge />}
                    {!r.mapped && !r.closed && <GeotagBadge />}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

/** Cases as cards, one column per surveillance stage (plus Closed), oldest report first. */
function CaseBoard({ cases, showClosed }: { cases: CaseRow[]; showClosed: boolean }) {
  const navigate = useNavigate();
  const columns = [
    ...CASE_STATUSES.map((s) => ({
      key: s as string,
      label: CASE_STATUS_LABELS[s],
      items: cases.filter((c) => c.status === s && !c.closed),
    })),
    ...(showClosed ? [{ key: 'CLOSED', label: 'Closed', items: cases.filter((c) => c.closed) }] : []),
  ].map((col) => ({
    ...col,
    items: [...col.items].sort((a, b) => a.reportedAt.localeCompare(b.reportedAt)),
  }));
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div
        className="grid min-w-[1150px] gap-3"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map(({ key, label, items }) => (
          <div
            key={key}
            className={cn(
              'min-h-[320px] rounded-lg p-2',
              key === 'CLOSED' ? 'bg-slate-200/60' : 'bg-slate-100/80',
            )}
          >
            <div className="flex items-center justify-between px-1.5 pb-2 pt-1 text-[13.5px] font-medium text-slate-700">
              {label} <span className="text-slate-500">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-left shadow-sm hover:border-brand"
                >
                  <div className="text-[13.5px] font-semibold text-slate-900">{c.code}</div>
                  <div className="text-[13px] text-slate-700">{c.disease}</div>
                  <div className="mt-1 text-[12px] text-slate-400">
                    {c.barangay} · {fmtDate(c.reportedAt)}
                  </div>
                  {key === 'CLOSED' && (
                    <div className="mt-1.5">
                      <CaseStatusBadge status={c.status} />
                    </div>
                  )}
                  {!c.mapped && !c.closed && (
                    <div className="mt-1.5">
                      <GeotagBadge />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Report new incident ---------------- */

export function CaseNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const [photos, setPhotos] = useState<File[]>([]);
  // Opened from another case ("Report incident on another farm") or from radius analysis:
  // /cases/new?from=<case id>&farm=<farm id>
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const presetFarmId = params.get('farm');
  const { data: parent } = useApi<CaseDetail>(fromId ? `/api/cases/${fromId}` : null);
  const form = useZodForm(caseCreateSchema, {
    ownerId: '',
    farmId: '',
    zone: '',
    species: '',
    disease: '',
    affected: '1',
    deaths: '0',
    symptomsDate: '',
    reportedAt: isoDate(),
    symptoms: '',
    reportedBy: '',
    assignedToId: '',
    sampleInfo: '',
    remarks: '',
    lat: '',
    lng: '',
  } as any);
  const e = form.formState.errors;
  const ownerId = form.watch('ownerId');
  const farmId = form.watch('farmId');
  const lat = form.watch('lat');
  const lng = form.watch('lng');
  const farms = (lookups?.farms ?? []).filter((f) => String(f.ownerId) === String(ownerId));
  const farm = lookups?.farms.find((f) => String(f.id) === String(farmId));
  // Only the species this farm keeps can be affected; the affected count starts at its head count.
  const farmSpecies = speciesOnFarm(lookups, farmId);
  const species = form.watch('species');
  const affected = Number(form.watch('affected')) || 0;
  const head = farmSpecies.find((s) => s.species === species)?.head;
  const pickSpecies = (s: string) => {
    const found = farmSpecies.find((x) => x.species === s);
    form.setValue('species', s as any, { shouldValidate: !!s });
    if (found) form.setValue('affected', String(found.head) as any, { shouldValidate: true });
  };
  useEffect(() => {
    if (!farm) return;
    const current = form.getValues('species');
    if (farmSpecies.length === 1) pickSpecies(farmSpecies[0].species);
    else if (current && !farmSpecies.some((s) => s.species === current)) form.setValue('species', '' as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm?.id, farmSpecies.length]);
  const point =
    lat !== '' && lng !== '' && lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null;

  // Prefill zone & location from the selected farm.
  useEffect(() => {
    if (!farm) return;
    form.setValue('zone', (farm.zone ?? '') as any);
    form.setValue('lat', (farm.lat ?? '') as any);
    form.setValue('lng', (farm.lng ?? '') as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm?.id]);

  // Pre-select the farm passed in the link, together with its owner, in one step (the owner and farm
  // lists below follow the form's values, so both show the selection as soon as it is set).
  const presetFarm = presetFarmId ? lookups?.farms.find((x) => String(x.id) === presetFarmId) : undefined;
  useEffect(() => {
    if (!presetFarm || form.getValues('farmId')) return;
    form.setValue('ownerId', String(presetFarm.ownerId) as any);
    form.setValue('farmId', String(presetFarm.id) as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFarm?.id]);
  /** Owner / farm picked by the user (validated again after a failed submit). */
  const pick = (name: 'ownerId' | 'farmId', value: string) =>
    form.setValue(name, value as any, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });

  // Copy the disease (and the species, if this farm keeps it) from the original case.
  useEffect(() => {
    if (!parent) return;
    if (!form.getValues('disease')) form.setValue('disease', parent.case.disease as any);
    if (!form.getValues('species') && farmSpecies.some((s) => s.species === parent.case.species))
      pickSpecies(parent.case.species);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.case.id, farm?.id, farmSpecies.length]);

  // Warn before leaving a report that has been started but not submitted.
  const [submitted, setSubmitted] = useState(false);
  const started = !submitted && (form.formState.isDirty || photos.length > 0);
  useUnsavedGuard(started);

  const save = useSave<any, { id: number }>('POST', '/api/cases', {
    success: 'Disease incident reported.',
    label: (b) => `Report ${b.disease}`,
    form,
    files: () => photos,
    photoField: 'photoKeys',
    onDone: (res) => {
      setSubmitted(true);
      navigate(isQueued(res) ? '/cases' : `/cases/${(res as { id: number }).id}`, { replace: true });
    },
  });

  return (
    <div>
      <PageHeader
        title="Report Disease Incident"
        subtitle="Record a suspected case. No automated diagnosis is performed."
      />
      {parent && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-[14.5px] text-slate-700">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <span>
            This incident will be linked to <b className="font-medium">{parent.case.code}</b> (
            {parent.case.disease} at {parent.case.farmName}). Disease and species were copied from it — change
            them if needed.
          </span>
        </div>
      )}
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(fromId ? { ...v, relatedCaseId: Number(fromId) } : v))}
        className="grid grid-cols-1 gap-4 lg:grid-cols-[1.27fr_1fr]"
      >
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Owner *" error={err(e, 'ownerId')}>
              <Select
                value={ownerId ?? ''}
                onChange={(ev) => {
                  pick('ownerId', ev.target.value);
                  form.setValue('farmId', '' as any);
                }}
                aria-invalid={!!e.ownerId}
              >
                <option value="">Select owner...</option>
                {lookups?.owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fullName} · {o.barangay}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Farm *" error={err(e, 'farmId')}>
              <Select
                value={farmId ?? ''}
                onChange={(ev) => pick('farmId', ev.target.value)}
                disabled={!ownerId}
                aria-invalid={!!e.farmId}
              >
                <option value="">{ownerId ? 'Select farm...' : 'Select owner first'}</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Barangay">
              <Input value={farm?.barangay ?? ''} readOnly disabled className="bg-slate-50" />
            </Field>
            <Field label="Zone / Purok" error={err(e, 'zone')}>
              <Input {...form.register('zone')} />
            </Field>
            <Field
              label="Species affected *"
              error={err(e, 'species')}
              hint={
                farm && !farmSpecies.length
                  ? 'This farm has no population groups. Add one on the farm page first.'
                  : 'Only the species kept on this farm are listed.'
              }
            >
              <Select
                value={species ?? ''}
                onChange={(ev) => pickSpecies(ev.target.value)}
                disabled={!farm || !farmSpecies.length}
                aria-invalid={!!e.species}
                aria-label="Species affected"
              >
                <option value="">{farm ? 'Select...' : 'Select farm first'}</option>
                {farmSpecies.map((s) => (
                  <option key={s.species} value={s.species}>
                    {s.species} — {s.head} head{s.groups > 1 ? ` (${s.groups} groups)` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Suspected disease *" error={err(e, 'disease')}>
              <Input {...form.register('disease')} list="disease-list" aria-invalid={!!e.disease} />
            </Field>
            <datalist id="disease-list">
              {[
                'African Swine Fever (ASF)',
                'Hog Cholera',
                'Foot and Mouth Disease (suspected)',
                'Hemorrhagic Septicemia (suspected)',
                'Newcastle Disease',
                'Avian Influenza (suspected)',
                'Porcine Reproductive & Respiratory Syndrome',
                'Peste des Petits Ruminants',
                'Swine Erysipelas',
                'Anthrax (suspected)',
              ].map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <Field
              label="Animals affected *"
              error={err(e, 'affected')}
              hint={
                head != null
                  ? `${head} ${species.toLowerCase()} on this farm — lower it if only some are affected.`
                  : undefined
              }
            >
              <Input type="number" min={1} max={head} {...form.register('affected')} />
            </Field>
            <Field
              label="Deaths"
              error={err(e, 'deaths')}
              hint={affected ? `Up to ${affected} (animals affected)` : undefined}
            >
              <Input type="number" min={0} max={affected || undefined} {...form.register('deaths')} />
            </Field>
            <Field label="Date symptoms observed" error={err(e, 'symptomsDate')}>
              <Input
                type="date"
                min={MIN_DATE}
                max={form.watch('reportedAt') || isoDate()}
                {...form.register('symptomsDate')}
              />
            </Field>
            <Field label="Date reported" error={err(e, 'reportedAt')}>
              <Input type="date" min={MIN_DATE} max={isoDate()} {...form.register('reportedAt')} />
            </Field>
            <Field label="Observed symptoms" error={err(e, 'symptoms')} className="sm:col-span-2">
              <Textarea rows={3} {...form.register('symptoms')} />
            </Field>
            <Field label="Reported by" error={err(e, 'reportedBy')}>
              <Input {...form.register('reportedBy')} placeholder={user?.name} />
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
            <Field label="Sample information" error={err(e, 'sampleInfo')}>
              <Input {...form.register('sampleInfo')} />
            </Field>
            <Field label="Remarks" error={err(e, 'remarks')}>
              <Input {...form.register('remarks')} />
            </Field>
            <Field
              label={`Photos / attachments (up to ${MAX_PHOTOS}, max ${MAX_PHOTO_MB} MB each)`}
              className="sm:col-span-2"
            >
              <PhotoPicker files={photos} onFilesChange={setPhotos} />
            </Field>
          </div>
        </Card>
        <div className="space-y-3">
          <Card>
            <CardHeader title="Case location" />
            <div className="p-4">
              <MapView
                className="h-[290px]"
                farms={
                  farm && farm.lat != null
                    ? [{ id: farm.id, lat: farm.lat, lng: farm.lng, name: farm.name }]
                    : []
                }
                pick={{
                  value: point,
                  onChange: (p) => {
                    form.setValue('lat', p.lat as any);
                    form.setValue('lng', p.lng as any);
                  },
                }}
                fitKey={farm?.id ?? 'none'}
              />
              <p className="mt-2 text-[13px] text-slate-500">
                {point
                  ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} · `
                  : farm && farm.lat == null
                    ? 'This farm has no coordinates — the case will await geotagging. '
                    : ''}
                Click the map to set or adjust.
              </p>
            </div>
          </Card>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => (!started || window.confirm(UNSAVED_MESSAGE)) && navigate(-1)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Submit report
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Case profile ---------------- */
interface VoidInfo {
  voided?: boolean;
  voidedBy?: string | null;
  voidReason?: string | null;
}

interface InvestigationRow {
  id: number;
  date: string;
  visitType: string;
  visitLabel: string;
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

interface CaseDetail {
  case: CaseRow & { culled: number; pendingPopulation: number };
  history: {
    id: number;
    status: CaseStatus;
    label: string;
    note: string | null;
    byName: string | null;
    at: string;
  }[];
  investigations: (InvestigationRow & VoidInfo)[];
  labs: (LabEditRecord & VoidInfo)[];
  responses: (ResponseEditRecord & { typeLabel: string; statusLabel: string } & VoidInfo)[];
  linkedCases: {
    id: number;
    code: string;
    disease: string;
    status: CaseStatus;
    closed: boolean;
    farmName: string;
    barangay: string;
    reportedAt: string;
  }[];
  context: { radius: number; farms: number; livestock: number; owners: number } | null;
}

const STEPS: CaseStatus[] = ['SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'AWAITING_RESULT'];

export function CaseStepper({ status }: { status: CaseStatus }) {
  const final = status === 'POSITIVE' || status === 'NEGATIVE';
  const idx = final ? 4 : STEPS.indexOf(status);
  const labels = [
    ...STEPS.map((s) => CASE_STATUS_LABELS[s]),
    final ? CASE_STATUS_LABELS[status] : 'Positive / Negative',
  ];
  return (
    <Card className="overflow-x-auto px-4 py-5">
      <ol className="flex min-w-[640px] items-start">
        {labels.map((label, i) => {
          const done = i < idx || (final && i === 4);
          const current = i === idx && !final;
          const last = i === labels.length - 1;
          const red = last && status === 'POSITIVE';
          return (
            <li key={i} className={cn('flex items-start', !last && 'flex-1')}>
              <div className="flex w-28 flex-col items-center text-center">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-[12px] font-medium',
                    done &&
                      (red
                        ? 'border-red-600 bg-red-600 text-white'
                        : last && status === 'NEGATIVE'
                          ? 'border-slate-500 bg-slate-500 text-white'
                          : 'border-brand-dark bg-brand-dark text-white'),
                    current && 'border-brand-dark bg-white text-brand-dark',
                    !done && !current && 'border-slate-300 bg-white text-slate-400',
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'mt-1.5 text-[12px] leading-tight',
                    done || current ? 'text-slate-800' : 'text-slate-400',
                  )}
                >
                  {label}
                </span>
              </div>
              {!last && (
                <span className={cn('mt-4 h-0.5 flex-1', i < idx ? 'bg-brand-dark' : 'bg-slate-200')} />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

const CASE_TABS = ['overview', 'investigation', 'laboratory', 'response', 'map', 'history'] as const;
type CaseTab = (typeof CASE_TABS)[number];

export function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit: canWrite, isAdmin } = useAuth();
  const [params] = useSearchParams();
  // Work lists link straight to a tab, e.g. /cases/12?tab=laboratory.
  const [tab, setTab] = useState<CaseTab>(() => {
    const t = params.get('tab');
    return CASE_TABS.includes(t as CaseTab) ? (t as CaseTab) : 'overview';
  });
  const [dlg, setDlg] = useState<
    null | 'status' | 'location' | 'inv' | 'lab' | 'resp' | 'close' | 'edit' | 'pop' | 'void'
  >(null);
  const [labEdit, setLabEdit] = useState<LabEditRecord | null>(null);
  const [respEdit, setRespEdit] = useState<ResponseEditRecord | null>(null);
  const [respType, setRespType] = useState<ResponseType | undefined>();
  const [suggest, setSuggest] = useState<{ status: CaseStatus; lab: LabLite } | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ url: string; what: string } | null>(null);
  const [popExtra, setPopExtra] = useState(0);
  const { data, isLoading, error } = useApi<CaseDetail>(`/api/cases/${id}`);
  const { data: lookups } = useLookups();
  const { data: farmDetail } = useApi<{ groups: GroupRow[] }>(
    dlg === 'pop' && data ? `/api/farms/${data.case.farmId}` : null,
  );
  const reopen = useSave<Record<string, never>>('POST', `/api/cases/${id}/reopen`, {
    success: 'Case reopened.',
  });
  const reconcile = useSave<Record<string, never>>('POST', `/api/cases/${id}/population-reconciled`, {
    success: 'Marked as reflected in the population.',
    offline: false,
  });
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const c = data.case;
  const farm = lookups?.farms.find((f) => f.id === c.farmId);
  // A closed case is read-only.
  const canEdit = canWrite && !c.closed;
  const final = c.status === 'POSITIVE' || c.status === 'NEGATIVE';
  const pending = c.pendingPopulation + popExtra;
  // Follow-up records cannot be dated before the case began.
  const caseStart = c.symptomsDate ?? c.reportedAt;
  const speciesHead = speciesOnFarm(lookups, c.farmId).find((s) => s.species === c.species)?.head;
  const askMoreDeaths = (dead: number) =>
    toast(`This visit found ${dead} dead, but the case records ${c.deaths}.`, {
      duration: 15000,
      action: { label: 'Update case details', onClick: () => setDlg('edit') },
    });

  // Suggested new counts for the affected species: take the deaths/culled heads off its groups,
  // never below the group's tagged animals. Staff review the numbers before saving.
  const popPrefill: Record<number, { count: number; reason: string }> = {};
  let remaining = pending;
  for (const g of [...(farmDetail?.groups ?? [])]
    .filter((x) => x.species === c.species)
    .sort((a, b) => b.count - a.count)) {
    const take = Math.min(remaining, Math.max(0, g.count - g.tagged));
    if (!take) continue;
    popPrefill[g.id] = { count: g.count - take, reason: `${c.code}: −${take} (deaths/culling)` };
    remaining -= take;
  }

  /** After a lab record is saved, offer the status that matches it. */
  const afterLabSaved = (v: { result: string; sentAt?: string }) => {
    const lab = { result: v.result, sentAt: v.sentAt ?? null };
    const target: CaseStatus | null =
      v.result === 'POSITIVE' || v.result === 'NEGATIVE'
        ? (v.result as CaseStatus)
        : v.sentAt && CASE_STAGE[c.status] < 2
          ? 'SENT_TO_LAB'
          : CASE_STAGE[c.status] < 1
            ? 'SAMPLE_COLLECTED'
            : null;
    const labsAfter = [...data.labs.filter((l) => !l.voided && l.id !== labEdit?.id), lab] as LabLite[];
    if (target && target !== c.status) {
      const check = checkCaseStatus(c.status, target, labsAfter);
      if (check.allowed && !check.correction) {
        setSuggest({ status: target, lab });
        setDlg('status');
      }
    }
  };

  return (
    <div>
      <PageHeader
        title={`${c.code} · ${c.disease}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.farmName} · {c.barangay} <CaseStatusBadge status={c.status} />
            {c.closed && <ClosedBadge />}
            {!c.mapped && !c.closed && <GeotagBadge />}
          </span>
        }
        actions={
          <>
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => setDlg('edit')}>
                  <Pencil /> Edit details
                </Button>
                <Button variant="outline" onClick={() => setDlg('location')}>
                  <MapPin /> {c.mapped ? 'Edit location' : 'Add location'}
                </Button>
                <Button variant={final ? 'outline' : 'default'} onClick={() => setDlg('status')}>
                  Update Status
                </Button>
                {final && (
                  <Button onClick={() => setDlg('close')}>
                    <Lock /> Close case
                  </Button>
                )}
              </>
            )}
            {c.closed && isAdmin && (
              <Button variant="outline" loading={reopen.isPending} onClick={() => reopen.mutate({})}>
                <RotateCcw /> Reopen case
              </Button>
            )}
          </>
        }
      />
      {c.closed && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2.5 text-[14.5px] text-slate-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <div>
              <b className="font-medium">Closed</b> on {fmtDateTime(c.closedAt!)}
              {c.closedBy ? ` by ${c.closedBy}` : ''}. This case is read-only.
            </div>
            {c.closureOutcome && (
              <div className="mt-0.5">
                Outcome:{' '}
                <b className="font-medium">
                  {CASE_OUTCOME_LABELS[c.closureOutcome as CaseOutcome] ?? c.closureOutcome}
                </b>
              </div>
            )}
            {c.closureNote && <div className="mt-0.5 text-slate-600">{c.closureNote}</div>}
            {isAdmin && (
              <div className="mt-0.5 text-[13px] text-slate-500">
                To correct a record, reopen the case; the reopening and every change are kept in History.
              </div>
            )}
          </div>
        </div>
      )}
      {canEdit && pending > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14.5px] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <b className="font-medium">{pending}</b> animal(s) died or were culled in this case
              {c.culled ? ` (${c.deaths} death(s), ${c.culled} culled)` : ''}, but {c.farmName}'s population
              has not been updated yet.
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => setDlg('pop')}>
              Update population
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={reconcile.isPending}
              onClick={() => reconcile.mutate({})}
            >
              Already counted
            </Button>
          </div>
        </div>
      )}
      <CaseStepper status={c.status} />
      <Tabs
        className="mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'investigation', label: 'Investigation' },
          { id: 'laboratory', label: 'Laboratory' },
          { id: 'response', label: 'Response' },
          { id: 'map', label: 'Map' },
          { id: 'history', label: 'History' },
        ]}
      />
      <div className="mt-4">
        {tab === 'overview' && (
          <Card>
            <CardHeader title="Case details" />
            <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[1fr_auto]">
              <KV
                rows={[
                  [
                    'Owner',
                    <Link className="link" to={`/owners/${c.ownerId}`}>
                      {c.ownerName}
                    </Link>,
                  ],
                  [
                    'Farm',
                    <Link className="link" to={`/farms/${c.farmId}`}>
                      {c.farmName}
                    </Link>,
                  ],
                  ['Barangay / Zone', `${c.barangay}${c.zone ? ` · ${c.zone}` : ''}`],
                  ['Species', c.species],
                  ['Affected / deaths', `${c.affected} / ${c.deaths}`],
                  ['Symptoms observed', c.symptomsDate ? fmtDate(c.symptomsDate) : null],
                  ['Reported', fmtDate(c.reportedAt)],
                  ['Reported by', c.reportedBy],
                  ['Assigned to', c.assignedToName],
                  [
                    'Location',
                    c.mapped ? (
                      `${c.lat!.toFixed(5)}, ${c.lng!.toFixed(5)} (${c.locationSource ?? 'Pinned'})`
                    ) : (
                      <GeotagBadge />
                    ),
                  ],
                  ['Symptoms', c.symptoms],
                  ['Sample info', c.sampleInfo],
                  ['Remarks', c.remarks],
                ]}
              />
              <PhotoGallery keys={c.photoKeys} className="content-start md:max-w-[264px]" />
            </div>
          </Card>
        )}
        {tab === 'overview' && (
          <Card className="mt-4">
            <CardHeader
              title="Linked incidents"
              actions={
                canEdit && (
                  <Button variant="outline" size="xs" onClick={() => navigate(`/cases/new?from=${c.id}`)}>
                    <Plus /> Report incident on another farm
                  </Button>
                )
              }
            />
            <div className="px-4 py-3 text-[14.5px]">
              {c.relatedCaseId && (
                <p className="mb-2 text-slate-700">
                  Reported as a linked incident of{' '}
                  <Link className="link" to={`/cases/${c.relatedCaseId}`}>
                    {c.relatedCaseCode}
                  </Link>
                  .
                </p>
              )}
              {data.linkedCases.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.linkedCases.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <Link className="link font-medium" to={`/cases/${l.id}`}>
                          {l.code}
                        </Link>{' '}
                        · {l.farmName} · {l.barangay}
                        <div className="text-[12.5px] text-slate-500">
                          {l.disease} · reported {fmtDate(l.reportedAt)}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <CaseStatusBadge status={l.status} />
                        {l.closed && <ClosedBadge />}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                !c.relatedCaseId && (
                  <p className="text-slate-500">
                    No other farms linked to this case. If the disease spread to another farm, use “Report
                    incident on another farm” (or the Report incident button in Radius Analysis).
                  </p>
                )
              )}
            </div>
          </Card>
        )}
        {tab === 'investigation' && (
          <InvestigationTable
            rows={data.investigations}
            closed={c.closed}
            onAdd={canEdit ? () => setDlg('inv') : undefined}
            onVoid={
              isAdmin && !c.closed
                ? (r) => {
                    setVoidTarget({
                      url: `/api/investigations/${r.id}/void`,
                      what: `investigation of ${fmtDate(r.date)}`,
                    });
                    setDlg('void');
                  }
                : undefined
            }
          />
        )}
        {tab === 'laboratory' && (
          <LabTable
            labs={data.labs}
            closed={c.closed}
            onAdd={
              canEdit
                ? () => {
                    setLabEdit(null);
                    setDlg('lab');
                  }
                : undefined
            }
            onEdit={
              canEdit
                ? (l) => {
                    setLabEdit(l);
                    setDlg('lab');
                  }
                : undefined
            }
            onVoid={
              isAdmin && !c.closed
                ? (l) => {
                    setVoidTarget({ url: `/api/labs/${l.id}/void`, what: `lab record ${l.sampleId}` });
                    setDlg('void');
                  }
                : undefined
            }
          />
        )}
        {tab === 'response' && (
          <ResponsePanel
            detail={data}
            onLog={
              canEdit
                ? (type) => {
                    setRespEdit(null);
                    setRespType(type);
                    setDlg('resp');
                  }
                : undefined
            }
            onEdit={
              canEdit
                ? (r) => {
                    setRespEdit(r);
                    setDlg('resp');
                  }
                : undefined
            }
            onVoid={
              isAdmin && !c.closed
                ? (r) => {
                    setVoidTarget({ url: `/api/responses/${r.id}/void`, what: `${r.typeLabel} record` });
                    setDlg('void');
                  }
                : undefined
            }
          />
        )}
        {tab === 'map' &&
          (c.mapped ? (
            <MapView
              className="h-[460px]"
              cases={[c]}
              circles={
                c.status === 'POSITIVE'
                  ? [{ lat: c.lat!, lng: c.lng!, radius: data.context?.radius ?? 1000 }]
                  : []
              }
            />
          ) : (
            <Card className="p-8 text-center text-sm text-slate-500">
              This case has no location yet.
              {canEdit && (
                <div className="mt-3">
                  <Button onClick={() => setDlg('location')}>
                    <MapPin /> Add location
                  </Button>
                </div>
              )}
            </Card>
          ))}
        {tab === 'history' && (
          <Card>
            <CardHeader title="Status history" />
            <Timeline
              items={data.history.map((h) => ({
                key: h.id,
                meta: `${fmtDateTime(h.at)} · ${h.byName ?? 'System'}`,
                title: h.label,
                body: h.note,
              }))}
            />
          </Card>
        )}
      </div>
      <CaseStatusDialog
        open={dlg === 'status'}
        onOpenChange={(o) => {
          setDlg(o ? 'status' : null);
          if (!o) setSuggest(null);
        }}
        caseId={c.id}
        code={c.code}
        status={c.status}
        labs={[...data.labs, ...(suggest ? [suggest.lab] : [])]}
        suggest={suggest?.status}
      />
      <CaseEditDialog open={dlg === 'edit'} onOpenChange={(o) => setDlg(o ? 'edit' : null)} c={c} />
      {farmDetail && dlg === 'pop' && (
        <PopulationUpdateDialog
          open
          onOpenChange={(o) => {
            setDlg(o ? 'pop' : null);
            if (!o) setPopExtra(0);
          }}
          farm={{ id: c.farmId, name: c.farmName ?? '' }}
          groups={farmDetail.groups}
          prefill={popPrefill}
          note={`Suggested counts take ${pending} ${c.species.toLowerCase()} off for ${c.code}. Check the numbers before saving.`}
          onSaved={() => {
            setPopExtra(0);
            reconcile.mutate({});
          }}
        />
      )}
      {voidTarget && (
        <VoidDialog
          open={dlg === 'void'}
          onOpenChange={(o) => setDlg(o ? 'void' : null)}
          url={voidTarget.url}
          what={voidTarget.what}
        />
      )}
      {dlg === 'location' && (
        <CaseLocationDialog
          open
          onOpenChange={(o) => setDlg(o ? 'location' : null)}
          caseId={c.id}
          code={c.code}
          initial={
            c.mapped
              ? { lat: c.lat!, lng: c.lng! }
              : farm?.lat != null
                ? { lat: farm.lat, lng: farm.lng! }
                : null
          }
        />
      )}
      <InvestigationDialog
        open={dlg === 'inv'}
        onOpenChange={(o) => setDlg((d) => (o ? 'inv' : d === 'inv' ? null : d))}
        caseId={c.id}
        code={c.code}
        minDate={caseStart}
        caseDeaths={c.deaths}
        onMoreDeaths={askMoreDeaths}
      />
      <LabDialog
        open={dlg === 'lab'}
        onOpenChange={(o) => setDlg((d) => (o ? 'lab' : d === 'lab' ? null : d))}
        caseId={c.id}
        code={c.code}
        lab={labEdit}
        minDate={caseStart}
        onSaved={afterLabSaved}
      />
      <ResponseDialog
        open={dlg === 'resp'}
        onOpenChange={(o) => setDlg((d) => (o ? 'resp' : d === 'resp' ? null : d))}
        caseId={c.id}
        code={c.code}
        response={respEdit}
        presetType={respType}
        minDate={caseStart}
        maxHeads={speciesHead}
        onSaved={(v) => {
          // Culling removes animals: offer the population update straight away.
          if (v.type === 'CULLING_DEPOPULATION' && v.status !== 'PLANNED' && v.added > 0) {
            setPopExtra(v.added);
            setDlg('pop');
          }
        }}
      />
      <CaseCloseDialog
        open={dlg === 'close'}
        onOpenChange={(o) => setDlg(o ? 'close' : null)}
        caseId={c.id}
        code={c.code}
        pending={pending}
      />
    </div>
  );
}

/** Shows a voided record struck through with who voided it and why. */
function VoidAware({ r, children }: { r: VoidInfo; children: React.ReactNode }) {
  if (!r.voided) return <>{children}</>;
  return (
    <div>
      <span className="text-slate-400 line-through">{children}</span> <Badge tone="slate">Voided</Badge>
      <div className="text-[12.5px] text-slate-500">
        {r.voidReason}
        {r.voidedBy ? ` — ${r.voidedBy}` : ''}
      </div>
    </div>
  );
}

/** Shown on a closed case's record tabs. */
function ClosedNote() {
  return (
    <p className="border-t border-slate-100 px-4 py-2.5 text-[13px] text-slate-500">
      <Lock className="mr-1 inline h-3.5 w-3.5" /> This case is closed: these records are kept for the audit
      trail and reports, but cannot be changed unless an administrator reopens the case.
    </p>
  );
}

const show = (v: number | null | undefined) => (v == null ? '—' : v);

export function InvestigationTable({
  rows,
  closed,
  onAdd,
  onVoid,
}: {
  rows: (InvestigationRow & VoidInfo)[];
  closed?: boolean;
  onAdd?: () => void;
  onVoid?: (r: InvestigationRow & VoidInfo) => void;
}) {
  return (
    <Card>
      <CardHeader
        title="Investigation records"
        actions={
          onAdd && (
            <Button variant="outline" size="xs" onClick={onAdd}>
              <Plus /> Add investigation
            </Button>
          )
        }
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        pageSize={0}
        hideFooter
        minWidth={820}
        columns={[
          {
            key: 'date',
            header: 'Visit',
            cell: (r) => (
              <div className="whitespace-nowrap">
                <div>{fmtDate(r.date)}</div>
                <div className="text-[12.5px] text-slate-500">{r.visitLabel}</div>
              </div>
            ),
          },
          { key: 'investigator', header: 'Investigator' },
          {
            key: 'animalsExamined',
            header: 'Examined / sick / dead',
            sort: false,
            cell: (r) => `${show(r.animalsExamined)} / ${show(r.sickCount)} / ${show(r.deadCount)}`,
          },
          {
            key: 'notes',
            header: 'Findings',
            className: 'whitespace-pre-wrap',
            cell: (r) => (
              <VoidAware r={r}>
                <div>{r.notes}</div>
                <div className="mt-1 space-y-0.5 text-[13px] text-slate-500">
                  {r.clinicalSigns && <div>Signs: {r.clinicalSigns}</div>}
                  {r.biosecurity && <div>Biosecurity: {r.biosecurity}</div>}
                  {r.actionsTaken && <div>Actions: {r.actionsTaken}</div>}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {r.samplesCollected && <Badge tone="blue">Samples collected</Badge>}
                    {r.nextVisit && <Badge tone="amber">Next visit {fmtDate(r.nextVisit)}</Badge>}
                  </div>
                </div>
              </VoidAware>
            ),
          },
          ...(onVoid
            ? [
                {
                  key: 'actions',
                  header: '',
                  sort: false as const,
                  cell: (r: InvestigationRow & VoidInfo) =>
                    !r.voided && (
                      <Button size="xs" variant="ghost" onClick={() => onVoid(r)}>
                        Void
                      </Button>
                    ),
                },
              ]
            : []),
        ]}
        empty="No investigations recorded yet."
      />
      {closed && <ClosedNote />}
    </Card>
  );
}

export function LabTable({
  labs,
  closed,
  onAdd,
  onEdit,
  onVoid,
}: {
  labs: CaseDetail['labs'];
  closed?: boolean;
  onAdd?: () => void;
  onEdit?: (l: CaseDetail['labs'][number]) => void;
  onVoid?: (l: CaseDetail['labs'][number]) => void;
}) {
  return (
    <Card>
      <CardHeader
        title="Laboratory records"
        actions={
          onAdd && (
            <Button variant="outline" size="xs" onClick={onAdd}>
              <Plus /> Add lab record
            </Button>
          )
        }
      />
      <DataTable
        rows={labs}
        rowKey={(r) => r.id}
        pageSize={0}
        hideFooter
        minWidth={900}
        columns={[
          {
            key: 'sampleId',
            header: 'Sample',
            cell: (r) => (
              <VoidAware r={r}>
                <div>{r.sampleId}</div>
                <div className="text-[12.5px] text-slate-500">
                  {[r.sampleType, r.sampleCount ? `${r.sampleCount} sample(s)` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </VoidAware>
            ),
          },
          { key: 'testMethod', header: 'Test', cell: (r) => r.testMethod ?? '—' },
          { key: 'collectedAt', header: 'Collected', cell: (r) => fmtDate(r.collectedAt) },
          {
            key: 'laboratory',
            header: 'Laboratory',
            cell: (r) => (
              <div>
                <div>{r.laboratory ?? '—'}</div>
                {r.labReference && <div className="text-[12.5px] text-slate-500">Ref. {r.labReference}</div>}
              </div>
            ),
          },
          { key: 'sentAt', header: 'Sent', cell: (r) => fmtDate(r.sentAt) },
          {
            key: 'result',
            header: 'Result',
            cell: (r) => (
              <div>
                <LabResultBadge result={r.result} />
                {r.resultDate && (
                  <div className="mt-0.5 text-[12.5px] text-slate-500">{fmtDate(r.resultDate)}</div>
                )}
              </div>
            ),
          },
          ...(onEdit || onVoid
            ? [
                {
                  key: 'actions',
                  header: '',
                  sort: false as const,
                  cell: (r: CaseDetail['labs'][number]) =>
                    !r.voided && (
                      <div className="flex gap-1">
                        {onEdit && (
                          <Button size="xs" variant="outline" onClick={() => onEdit(r)}>
                            {r.result === 'PENDING' ? 'Enter result' : 'Edit'}
                          </Button>
                        )}
                        {onVoid && (
                          <Button size="xs" variant="ghost" onClick={() => onVoid(r)}>
                            Void
                          </Button>
                        )}
                      </div>
                    ),
                },
              ]
            : []),
        ]}
        empty="No laboratory records yet."
      />
      {closed && <ClosedNote />}
    </Card>
  );
}

export function ResponsePanel({
  detail,
  onLog,
  onEdit,
  onVoid,
}: {
  detail: CaseDetail;
  /** Log a new activity (optionally of a given type). */
  onLog?: (type?: ResponseType) => void;
  onEdit?: (r: CaseDetail['responses'][number]) => void;
  onVoid?: (r: CaseDetail['responses'][number]) => void;
}) {
  const c = detail.case;
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Ground zero" />
          <div className="p-4">
            {c.mapped ? (
              <MapView
                className="h-[220px]"
                groundZero={{ lat: c.lat!, lng: c.lng! }}
                circles={[{ lat: c.lat!, lng: c.lng!, radius: detail.context?.radius ?? 1000 }]}
                focusCircle={{ lat: c.lat!, lng: c.lng!, radius: detail.context?.radius ?? 1000 }}
                showZoom={false}
              />
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-slate-500">
                Awaiting geotagging
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Response context" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4">
            <div>
              <div className="text-[13px] text-slate-500">Owner</div>
              <div className="text-[15px] text-slate-900">{c.ownerName}</div>
            </div>
            <div>
              <div className="text-[13px] text-slate-500">Affected / deaths</div>
              <div className="text-[15px] text-slate-900">
                {c.affected} / {c.deaths}
              </div>
            </div>
            <div>
              <div className="text-[13px] text-slate-500">
                Farms within {((detail.context?.radius ?? 1000) / 1000).toFixed(2)} km
              </div>
              <div className="text-[15px] font-semibold text-slate-900">{detail.context?.farms ?? '—'}</div>
            </div>
            <div>
              <div className="text-[13px] text-slate-500">Livestock within radius</div>
              <div className="text-[15px] font-semibold text-slate-900">
                {detail.context?.livestock ?? '—'}
              </div>
            </div>
            <div className="col-span-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!c.mapped}
                onClick={() => navigate(`/radius?case=${c.id}`)}
              >
                Open radius analysis
              </Button>
              <p className="mt-3 text-[13px] text-slate-400">
                Documentation only — not automated recommendations.
              </p>
            </div>
          </div>
        </Card>
      </div>
      {isAsfDisease(c.disease) && <AsfSteps detail={detail} onLog={onLog} />}
      <Card>
        <CardHeader
          title="Response activity log"
          actions={
            onLog && (
              <Button variant="outline" size="xs" onClick={() => onLog()}>
                <Plus /> Log activity
              </Button>
            )
          }
        />
        {detail.responses.length ? (
          <Timeline
            items={detail.responses.map((r) => ({
              key: r.id,
              meta: `${fmtDate(r.date)}${r.endDate ? ` – ${fmtDate(r.endDate)}` : ''}`,
              title: r.voided ? (
                <VoidAware r={r}>{r.typeLabel}</VoidAware>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {r.typeLabel}
                  <Badge
                    tone={r.status === 'COMPLETED' ? 'green' : r.status === 'ONGOING' ? 'amber' : 'blue'}
                  >
                    {r.statusLabel}
                  </Badge>
                  {r.heads ? <Badge tone="red">{r.heads} culled</Badge> : null}
                  {onEdit && (
                    <Button size="xs" variant="outline" onClick={() => onEdit(r)}>
                      {r.status === 'COMPLETED' ? 'Edit' : 'Update'}
                    </Button>
                  )}
                  {onVoid && (
                    <Button size="xs" variant="ghost" onClick={() => onVoid(r)}>
                      Void
                    </Button>
                  )}
                </span>
              ),
              tag: r.personnel,
              body:
                r.location || r.disposalMethod || r.remarks ? (
                  <div>
                    {(r.location || r.disposalMethod) && (
                      <div className="text-[13.5px] text-slate-500">
                        {[r.location, r.disposalMethod ? `Disposal: ${r.disposalMethod}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                    {r.remarks && <div>{r.remarks}</div>}
                  </div>
                ) : null,
            }))}
          />
        ) : (
          <p className="p-4 text-sm text-slate-500">No response activities logged yet.</p>
        )}
        {c.closed && <ClosedNote />}
      </Card>
    </div>
  );
}

/** The office's ASF response steps, ticked off from the activities logged on the case. */
function AsfSteps({ detail, onLog }: { detail: CaseDetail; onLog?: (type?: ResponseType) => void }) {
  const logged = detail.responses.filter((r) => !r.voided);
  const done = ASF_RESPONSE_STEPS.filter((s) =>
    logged.some((r) => r.type === s.type && r.status === 'COMPLETED'),
  ).length;
  return (
    <Card>
      <CardHeader
        title="ASF response steps"
        actions={
          <span className="text-[13px] text-slate-500">
            {done} of {ASF_RESPONSE_STEPS.length} completed
          </span>
        }
      />
      <ol className="divide-y divide-slate-100">
        {ASF_RESPONSE_STEPS.map((s, i) => {
          const rows = logged.filter((r) => r.type === s.type);
          const state = rows.some((r) => r.status === 'COMPLETED')
            ? 'COMPLETED'
            : rows.some((r) => r.status === 'ONGOING')
              ? 'ONGOING'
              : rows.length
                ? 'PLANNED'
                : null;
          return (
            <li key={s.type} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[14.5px]">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
                  state === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {state === 'COMPLETED' ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 text-slate-800">{s.label}</span>
              {state ? (
                <Badge tone={state === 'COMPLETED' ? 'green' : state === 'ONGOING' ? 'amber' : 'blue'}>
                  {state === 'COMPLETED' ? 'Done' : state === 'ONGOING' ? 'Ongoing' : 'Planned'}
                  {rows[0] ? ` · ${fmtDate(rows[0].date)}` : ''}
                </Badge>
              ) : (
                <span className="text-[13px] text-slate-400">Not yet logged</span>
              )}
              {onLog && !state && (
                <Button size="xs" variant="outline" onClick={() => onLog(s.type)}>
                  <Plus /> Log
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ---------------- Case tracking (board / table) ---------------- */

export function CaseTrackingPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('');
  const [view, setView] = useState<'board' | 'table'>('board');
  const { data, isLoading, error } = useApi<CaseRow[]>('/api/cases');
  // Open cases are shown by stage; finished cases move to the "Closed" column.
  const stages = CASE_STATUSES.filter((s) => !stage || s === stage);
  const showClosed = !stage || stage === 'CLOSED';
  const columns: { key: string; label: string; items: CaseRow[] }[] = [
    ...(stage === 'CLOSED' ? [] : stages).map((s) => ({
      key: s,
      label: CASE_STATUS_LABELS[s],
      items: (data ?? []).filter((c) => c.status === s && !c.closed),
    })),
    ...(showClosed ? [{ key: 'CLOSED', label: 'Closed', items: (data ?? []).filter((c) => c.closed) }] : []),
  ].map((col) => ({ ...col, items: col.items.sort((a, b) => a.reportedAt.localeCompare(b.reportedAt)) }));
  const rows = (data ?? []).filter((c) =>
    !stage ? true : stage === 'CLOSED' ? c.closed : c.status === stage && !c.closed,
  );
  return (
    <div>
      <PageHeader
        title="Case Tracking"
        subtitle="Follow each case through the surveillance stages."
        actions={
          <>
            <FilterSelect
              label="Stage"
              value={stage}
              onChange={setStage}
              options={[
                ...CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] })),
                { value: 'CLOSED', label: 'Closed' },
              ]}
              all="All stages"
              className="w-[calc(100%-120px)] sm:w-48"
            />
            <Button variant="outline" onClick={() => setView(view === 'board' ? 'table' : 'board')}>
              {view === 'board' ? 'Table view' : 'Board view'}
            </Button>
          </>
        }
      />
      {error && <ErrorBox error={error} />}
      {isLoading ? (
        <Loading />
      ) : view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div
            className="grid min-w-[1150px] gap-3"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map(({ key, label, items }) => {
              return (
                <div
                  key={key}
                  className={cn(
                    'min-h-[320px] rounded-lg p-2',
                    key === 'CLOSED' ? 'bg-slate-200/60' : 'bg-slate-100/80',
                  )}
                >
                  <div className="flex items-center justify-between px-1.5 pb-2 pt-1 text-[13.5px] font-medium text-slate-700">
                    {label} <span className="text-slate-500">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate(`/cases/${c.id}`)}
                        className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-left shadow-sm hover:border-brand"
                      >
                        <div className="text-[13.5px] font-semibold text-slate-900">{c.code}</div>
                        <div className="text-[13px] text-slate-700">{c.disease}</div>
                        <div className="mt-1 text-[12px] text-slate-400">
                          {c.barangay} · {fmtDate(c.reportedAt)}
                        </div>
                        {key === 'CLOSED' && (
                          <div className="mt-1.5">
                            <CaseStatusBadge status={c.status} />
                          </div>
                        )}
                        {!c.mapped && !c.closed && (
                          <div className="mt-1.5">
                            <GeotagBadge />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/cases/${r.id}`)}
            pageSize={0}
            columns={[
              { key: 'code', header: 'Case' },
              { key: 'disease', header: 'Disease' },
              { key: 'barangay', header: 'Barangay' },
              { key: 'reportedAt', header: 'Reported', cell: (r) => fmtDate(r.reportedAt) },
              { key: 'assignedToName', header: 'Assigned to' },
              {
                key: 'status',
                header: 'Stage',
                sort: (r) => (r.closed ? 99 : CASE_STATUSES.indexOf(r.status)),
                cell: (r) => (
                  <div className="flex flex-wrap gap-1.5">
                    <CaseStatusBadge status={r.status} />
                    {r.closed && <ClosedBadge />}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

/* ---------------- Investigation & Lab ---------------- */

export function InvestigationPage() {
  const navigate = useNavigate();
  const { canEdit: canWrite, isAdmin } = useAuth();
  const [caseId, setCaseId] = useState('');
  const [dlg, setDlg] = useState<null | 'inv' | 'lab' | 'void'>(null);
  const [labEdit, setLabEdit] = useState<LabEditRecord | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ url: string; what: string } | null>(null);
  const { data: cases } = useApi<CaseRow[]>('/api/cases');
  const { data: labs, isLoading } =
    useApi<(CaseDetail['labs'][number] & { caseId: number; caseCode: string; caseClosed?: boolean })[]>(
      '/api/labs',
    );
  const { data: detail } = useApi<CaseDetail>(caseId ? `/api/cases/${caseId}` : null);
  const closed = !!detail?.case.closed;
  const canEdit = canWrite && !closed;
  const caseStart = detail ? (detail.case.symptomsDate ?? detail.case.reportedAt) : undefined;
  const afterLabSaved = (v: { result: string }) => {
    if (!detail || (v.result !== 'POSITIVE' && v.result !== 'NEGATIVE') || v.result === detail.case.status)
      return;
    toast(
      `Result recorded. Update ${detail.case.code}'s status to ${titleCase(v.result)} on the case page.`,
      {
        duration: 12000,
        action: { label: 'Open case', onClick: () => navigate(`/cases/${detail.case.id}`) },
      },
    );
  };
  return (
    <div>
      <PageHeader
        title="Investigation & Laboratory"
        subtitle="Site investigations and laboratory sample tracking per case."
        actions={
          <FilterSelect
            label="Case"
            value={caseId}
            onChange={setCaseId}
            all="Select case..."
            options={[...(cases ?? [])]
              .sort((a, b) => a.id - b.id)
              .map((c) => ({
                value: String(c.id),
                label: `${c.code} · ${c.disease}${c.closed ? ' (closed)' : ''}`,
              }))}
            className="w-full sm:w-80"
          />
        }
      />
      {!caseId ? (
        <Card>
          <CardHeader title="All laboratory records" className="border-b-0" />
          <DataTable
            rows={labs}
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => setCaseId(String(r.caseId))}
            pageSize={0}
            hideFooter
            minWidth={820}
            columns={[
              {
                key: 'sampleId',
                header: 'Sample ID',
                cell: (r) => <VoidAware r={r}>{r.sampleId}</VoidAware>,
              },
              {
                key: 'caseCode',
                header: 'Case',
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    {r.caseCode}
                    {r.caseClosed && <ClosedBadge />}
                  </span>
                ),
              },
              { key: 'sampleType', header: 'Type' },
              { key: 'testMethod', header: 'Test', cell: (r) => r.testMethod ?? '—' },
              { key: 'laboratory', header: 'Laboratory' },
              { key: 'sentAt', header: 'Sent', cell: (r) => fmtDate(r.sentAt) },
              { key: 'result', header: 'Result', cell: (r) => <LabResultBadge result={r.result} /> },
              { key: 'resultDate', header: 'Result date', cell: (r) => fmtDate(r.resultDate) },
            ]}
            empty="No laboratory records yet."
          />
          <p className="border-t border-slate-100 px-4 py-2.5 text-[13px] text-slate-500">
            Select a record (or a case above) to add investigations, enter results or edit lab records.
          </p>
        </Card>
      ) : !detail ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[17px] font-semibold text-slate-900">{detail.case.code}</span>
              <CaseStatusBadge status={detail.case.status} />
              {closed && <ClosedBadge />}
              <span className="text-[15px] text-slate-600">
                {detail.case.farmName} · {detail.case.barangay}
              </span>
            </div>
            <button
              type="button"
              className="text-[14px] text-slate-700 hover:underline"
              onClick={() => navigate(`/cases/${detail.case.id}`)}
            >
              Open case profile
            </button>
          </Card>
          <InvestigationTable
            rows={detail.investigations}
            closed={closed}
            onAdd={canEdit ? () => setDlg('inv') : undefined}
            onVoid={
              isAdmin && !closed
                ? (r) => {
                    setVoidTarget({
                      url: `/api/investigations/${r.id}/void`,
                      what: `investigation of ${fmtDate(r.date)}`,
                    });
                    setDlg('void');
                  }
                : undefined
            }
          />
          <LabTable
            labs={detail.labs}
            closed={closed}
            onAdd={
              canEdit
                ? () => {
                    setLabEdit(null);
                    setDlg('lab');
                  }
                : undefined
            }
            onEdit={
              canEdit
                ? (l) => {
                    setLabEdit(l);
                    setDlg('lab');
                  }
                : undefined
            }
            onVoid={
              isAdmin && !closed
                ? (l) => {
                    setVoidTarget({ url: `/api/labs/${l.id}/void`, what: `lab record ${l.sampleId}` });
                    setDlg('void');
                  }
                : undefined
            }
          />
          <InvestigationDialog
            open={dlg === 'inv'}
            onOpenChange={(o) => setDlg((d) => (o ? 'inv' : d === 'inv' ? null : d))}
            caseId={detail.case.id}
            code={detail.case.code}
            minDate={caseStart}
            caseDeaths={detail.case.deaths}
            onMoreDeaths={(dead) =>
              toast(`This visit found ${dead} dead, but ${detail.case.code} records ${detail.case.deaths}.`, {
                duration: 15000,
                action: { label: 'Open case', onClick: () => navigate(`/cases/${detail.case.id}`) },
              })
            }
          />
          <LabDialog
            open={dlg === 'lab'}
            onOpenChange={(o) => setDlg((d) => (o ? 'lab' : d === 'lab' ? null : d))}
            caseId={detail.case.id}
            code={detail.case.code}
            lab={labEdit}
            minDate={caseStart}
            onSaved={afterLabSaved}
          />
          {voidTarget && (
            <VoidDialog
              open={dlg === 'void'}
              onOpenChange={(o) => setDlg(o ? 'void' : null)}
              url={voidTarget.url}
              what={voidTarget.what}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Response activities ---------------- */

export function ResponseActivitiesPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const { data: lookups } = useLookups();
  const { data: cases, isLoading: casesLoading, error: casesError } = useApi<CaseRow[]>('/api/cases');
  const sorted = [...(cases ?? [])].sort(
    (a, b) => (a.status === 'POSITIVE' ? -1 : 0) - (b.status === 'POSITIVE' ? -1 : 0) || a.id - b.id,
  );
  const [caseId, setCaseId] = useState('');
  const effective = caseId || (sorted[0] ? String(sorted[0].id) : '');
  const [open, setOpen] = useState(false);
  const [respEdit, setRespEdit] = useState<ResponseEditRecord | null>(null);
  const [respType, setRespType] = useState<ResponseType | undefined>();
  const { data: detail, error: detailError } = useApi<CaseDetail>(
    effective ? `/api/cases/${effective}` : null,
  );
  const writable = canEdit && !!detail && !detail.case.closed;
  return (
    <div>
      <PageHeader
        title="Response Activities"
        subtitle="Documentation of response actions for confirmed cases."
        actions={
          <FilterSelect
            label="Case"
            value={effective}
            onChange={setCaseId}
            options={sorted.map((c) => ({
              value: String(c.id),
              label: `${c.code} · ${c.disease} (${c.closed ? 'closed' : CASE_STATUS_LABELS[c.status]})`,
            }))}
            className="w-full sm:w-96"
          />
        }
      />
      {casesError || detailError ? (
        <ErrorBox error={casesError ?? detailError} />
      ) : casesLoading ? (
        <Loading />
      ) : !sorted.length ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No disease cases yet. Response activities are logged on a case — report an incident first.
        </Card>
      ) : !detail ? (
        <Loading />
      ) : (
        <>
          <ResponsePanel
            detail={detail}
            onLog={
              writable
                ? (type) => {
                    setRespEdit(null);
                    setRespType(type);
                    setOpen(true);
                  }
                : undefined
            }
            onEdit={
              writable
                ? (r) => {
                    setRespEdit(r);
                    setOpen(true);
                  }
                : undefined
            }
          />
          <ResponseDialog
            open={open}
            onOpenChange={setOpen}
            caseId={detail.case.id}
            code={detail.case.code}
            response={respEdit}
            presetType={respType}
            minDate={detail.case.symptomsDate ?? detail.case.reportedAt}
            maxHeads={
              speciesOnFarm(lookups, detail.case.farmId).find((s) => s.species === detail.case.species)?.head
            }
            onSaved={(v) => {
              if (v.type === 'CULLING_DEPOPULATION' && v.status !== 'PLANNED' && v.added > 0)
                toast(`${v.added} culled. Update the farm's population from the case page.`, {
                  duration: 12000,
                  action: { label: 'Open case', onClick: () => navigate(`/cases/${detail.case.id}`) },
                });
            }}
          />
        </>
      )}
    </div>
  );
}