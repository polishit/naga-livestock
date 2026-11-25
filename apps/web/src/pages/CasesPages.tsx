import {
  Ban,
  Check,
  Printer,
  FlaskConical,
  Link2,
  Lock,
  Map as MapIcon,
  MapPin,
  Radar,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_LABORATORY,
  DEFAULT_LAB_TEST,
  RESULT_RECEIVED_LABELS,
  CASE_CLASSES,
  CASE_CLASS_LABELS,
  CLINICAL_SIGN_LABELS,
  type ClinicalSign,
  CASE_OUTCOME_LABELS,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  fmtMonth,
  caseCloseBlockers,
  onlyInconclusive,
  MAX_PHOTOS,
  MAX_PHOTO_MB,
  MIN_DATE,
  caseCreateSchema,
  titleCase,
  fmtDate,
  fmtDateTime,
  isoDate,
  type CaseClass,
  type CaseOutcome,
  type CaseStatus,
  type ResponseType,
  type CaseStage,
} from '@livestock/shared';
import { isQueued } from '@/lib/api';
import { printAnalysisRequest, printSampleCollection } from '@/lib/print';
import { useLetterhead } from '@/components/ExportButtons';
import { useAuth } from '@/lib/auth';
import { UNSAVED_MESSAGE, speciesOnFarm, useApi, useLookups, useSave, useUnsavedGuard } from '@/lib/hooks';
import { cn, qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { PhotoGallery, PhotoPicker, err, useZodForm } from '@/components/forms';
import { MapView } from '@/components/MapView';
import { MoreMenu } from '@/components/MoreMenu';
import { ActivityTimeline, DiseasePicker } from '@/components/livestock';
import type { VisitRecord } from '@/dialogs/services';
import { ErrorBox, FilterSelect, KV, Loading, PageHeader, Timeline } from '@/components/page';
import {
  CaseClassBadge,
  CaseStatusBadge,
  ClosedBadge,
  GeotagBadge,
  LabResultBadge,
} from '@/components/status';
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
  ClinicalSignsPicker,
  CaseLocationDialog,
  InvestigationDialog,
  LabDialog,
  VoidDialog,
  type InvestigationEditRecord,
  type LabEditRecord,
  type ResponseEditRecord,
} from '@/dialogs/surveillance';
import type { CaseRow, RadiusResult } from './types';
import { PendingReports } from './ReviewPages';
import type { loadSampleForCase } from './LabSubmissionsPages';

/* ---------------- Incident list ---------------- */

export function CasesPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  // Filters can also come from a link (a chart on Analytics, a hotspot, Record completeness). They live
  // in the address bar, so Back returns to the list as it was, and show as chips that can be removed.
  const barangay = params.get('barangay') ?? '';
  const location = params.get('location') ?? '';
  const state = params.get('state') === 'all' ? '' : (params.get('state') ?? 'open');
  const status = params.get('status') ?? '';
  const disease = params.get('disease') ?? '';
  const klass = params.get('class') ?? '';
  // ?month=YYYY-MM (from a "per month" chart) lists the reports of that month.
  const month = params.get('month') ?? '';
  const inMonth = (r: CaseRow) => !month || r.reportedAt.startsWith(month);
  const {
    data: listed,
    isLoading,
    error,
  } = useApi<CaseRow[]>(`/api/cases${qs({ barangay, location, state, status, disease })}`);
  const data = listed?.filter(inMonth);
  const rows = klass ? data?.filter((r) => r.classification === klass) : data;

  // The one Status filter (panel revision): open cases by default, a lab stage, closed, voided or all.
  const statusValue = status || (state === 'open' ? '' : state || 'all');
  const statusOptions = [
    ...CASE_STATUSES.map((st) => ({ value: st, label: CASE_STATUS_LABELS[st] })),
    { value: 'closed', label: 'Closed' },
    { value: 'voided', label: 'Voided (Reported in Error)' },
    { value: 'all', label: 'All Cases' },
  ];
  const setStatus = (v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('status');
        n.delete('state');
        if ((CASE_STATUSES as readonly string[]).includes(v)) n.set('status', v);
        else if (v) n.set('state', v);
        return n;
      },
      { replace: true },
    );
  const statusLabel = statusOptions.find((o) => o.value === statusValue)?.label ?? 'Open Cases';

  // Remember the list order so the case page can step to the previous / next case.
  useEffect(() => {
    if (!rows) return;
    const ids = [...rows].sort((x, y) => y.reportedAt.localeCompare(x.reportedAt)).map((r) => r.id);
    try {
      sessionStorage.setItem(
        'caseNav',
        JSON.stringify({ ids, label: statusLabel, search: params.toString() }),
      );
    } catch {
      /* storage unavailable: the case page simply shows no previous / next */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statusLabel]);

  const filters = (
    <>
      <FilterSelect
        label="Status"
        value={statusValue}
        onChange={setStatus}
        options={statusOptions}
        all="Open Cases"
        className="w-full sm:w-60"
      />
      {month && <LinkFilter label={`Reported in ${fmtMonth(month)}`} onClear={() => setParam('month', '')} />}
      {disease && <LinkFilter label={`Disease: ${disease}`} onClear={() => setParam('disease', '')} />}
      {barangay && <LinkFilter label={`Barangay: ${barangay}`} onClear={() => setParam('barangay', '')} />}
      {klass && (
        <LinkFilter
          label={`Classification: ${CASE_CLASS_LABELS[klass as CaseClass] ?? klass}`}
          onClear={() => setParam('class', '')}
        />
      )}
      {location && (
        <LinkFilter
          label={location === 'unmapped' ? 'Awaiting Geotagging' : 'Mapped'}
          onClear={() => setParam('location', '')}
        />
      )}
    </>
  );
  return (
    <div>
      <PageHeader
        title="Disease Reports"
        subtitle="Incident reports for ASF and the other diseases the office monitors, from report to laboratory result."
        actions={
          canEdit && (
            <Button onClick={() => navigate('/cases/new')}>
              <Plus /> Report Incident
            </Button>
          )
        }
      />
      {canEdit && <PendingReports />}
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={rows}
            empty="No cases found. Change the Status filter, or select “Report incident” when sick or dead animals are reported."
            loading={isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/cases/${r.id}`)}
            pageSize={0}
            hideFooter
            mobileTitle="disease"
            minWidth={980}
            defaultSort={{ key: 'reportedAt', dir: 'desc' }}
            toolbar={filters}
            searchText={(r) =>
              `${r.code} ${r.disease} ${r.farmName ?? ''} ${r.ownerName ?? ''} ${r.barangay}`
            }
            searchPlaceholder="Search case, disease, farm or barangay..."
            columns={[
              { key: 'code', header: 'Case No.' },
              { key: 'reportedAt', header: 'Date Reported', cell: (r) => fmtDate(r.reportedAt) },
              { key: 'disease', header: 'Disease' },
              { key: 'farmName', header: 'Farm' },
              { key: 'barangay', header: 'Barangay' },
              { key: 'species', header: 'Species' },
              { key: 'assignedToName', header: 'Assigned To', cell: (r) => r.assignedToName ?? '—' },
              {
                key: 'classification',
                header: 'Classification',
                sort: (r) => CASE_CLASSES.indexOf(r.classification),
                cell: (r) => <CaseClassBadge value={r.classification} />,
              },
              {
                key: 'status',
                header: 'Status',
                sort: (r) => (r.closed ? 99 : CASE_STATUSES.indexOf(r.status)),
                cell: (r) => (
                  <div className="flex flex-wrap gap-1.5">
                    <CaseStatusBadge status={r.status} />
                    {r.voided ? <Badge tone="red">Voided</Badge> : r.closed && <ClosedBadge />}
                    {!r.mapped && !r.closed && <GeotagBadge />}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}
      <p className="mt-3 text-[14px] text-slate-500">
        Trends and graphs of disease reports are in{' '}
        <Link to="/analytics" className="link font-medium">
          Dashboard &amp; Reports → Analytics
        </Link>
        .
      </p>
    </div>
  );
}

/** A filter that came from a link, shown as a chip the user can remove. */
function LinkFilter({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-light/50 pl-3 pr-1.5 text-[14px] text-slate-800">
      {label}
      <button
        type="button"
        aria-label={`Remove filter ${label}`}
        onClick={onClear}
        className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
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
  const fromSample = params.get('fromSample');
  const { data: sampleInfo } = useApi<Awaited<ReturnType<typeof loadSampleForCase>>>(
    fromSample ? `/api/lab-submissions/samples/${fromSample}` : null,
  );
  const presetFarmId =
    params.get('farm') ?? (sampleInfo?.sample.farmId ? String(sampleInfo.sample.farmId) : null);
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
    clinicalSigns: [],
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

  // Opened from a positive surveillance sample: the disease follows the test, the animal is counted.
  useEffect(() => {
    if (!sampleInfo || !farm) return;
    const { sample, submission } = sampleInfo;
    if (!form.getValues('disease'))
      form.setValue(
        'disease',
        (/asf|african swine/i.test(submission.examination) ? 'African Swine Fever (ASF)' : '') as any,
      );
    if (sample.species && farmSpecies.some((x) => x.species === sample.species)) {
      form.setValue('species', sample.species as any);
      form.setValue('affected', '1' as any);
      form.setValue('deaths', (sample.condition === 'DEAD' ? '1' : '0') as any);
    }
    if (!form.getValues('reportedBy'))
      form.setValue('reportedBy', `Laboratory result (${submission.code}, sample ${sample.sampleId})` as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleInfo?.sample.id, farm?.id, farmSpecies.length]);

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
      {sampleInfo && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[15px] text-slate-700">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>
            Opened from sample <b className="font-medium">{sampleInfo.sample.sampleId}</b> (
            {sampleInfo.submission.code}, {sampleInfo.submission.examination}) — result{' '}
            <b className="font-medium">{titleCase(sampleInfo.sample.result)}</b>. The sample is attached to
            this case, so it opens as Active.
          </span>
        </div>
      )}
      {parent && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[15px] text-slate-700">
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
        onSubmit={form.handleSubmit((v) =>
          save.mutate({
            ...v,
            ...(fromId ? { relatedCaseId: Number(fromId) } : {}),
            ...(sampleInfo ? { fromSampleId: sampleInfo.sample.id } : {}),
          }),
        )}
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
              label="Species Affected *"
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
            <Field label="Suspected Disease *" error={err(e, 'disease')}>
              <DiseasePicker
                value={form.watch('disease') ?? ''}
                onChange={(v) =>
                  form.setValue('disease', v as any, { shouldValidate: !!e.disease, shouldDirty: true })
                }
                invalid={!!e.disease}
              />
            </Field>
            <Field
              label="Animals Affected *"
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
            <Field label="Date Symptoms Observed" error={err(e, 'symptomsDate')}>
              <Input
                type="date"
                min={MIN_DATE}
                max={form.watch('reportedAt') || isoDate()}
                {...form.register('symptomsDate')}
              />
            </Field>
            <Field label="Date Reported" error={err(e, 'reportedAt')}>
              <Input type="date" min={MIN_DATE} max={isoDate()} {...form.register('reportedAt')} />
            </Field>
            <Field
              label="Clinical Signs Seen"
              className="sm:col-span-2"
              hint="Tick all that the owner or the visit found."
            >
              <ClinicalSignsPicker
                value={form.watch('clinicalSigns') ?? []}
                onChange={(v) => form.setValue('clinicalSigns', v as any, { shouldDirty: true })}
              />
            </Field>
            <Field
              label="Other Signs / History of the Sick Animals"
              error={err(e, 'symptoms')}
              className="sm:col-span-2"
            >
              <Textarea
                rows={3}
                {...form.register('symptoms')}
                placeholder="When it started, feed or animals brought in recently, nearby farms with sick animals…"
              />
            </Field>
            <Field label="Reported By" error={err(e, 'reportedBy')}>
              <Input {...form.register('reportedBy')} placeholder={user?.name} />
            </Field>
            <Field label="Assigned Inspector" error={err(e, 'assignedToId')}>
              <Select {...form.register('assignedToId')}>
                <option value="">Unassigned</option>
                {lookups?.inspectors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2">
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
            <CardHeader title="Case Location" />
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
              Submit Report
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
  /** The stage the owner sees in the owner app */
  stage: CaseStage;
  stageLabel: string;
  /** The owner's report this case was opened from */
  ownerReport: { id: number; code: string } | null;
  zone: { id: number; code: string; status: 'ACTIVE' | 'LIFTED'; radiusM: number } | null;
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

/* ---------------- The case page: one checklist ---------------- */

type StepState = 'done' | 'current' | 'todo' | 'skipped';

const STEP_BADGE: Record<StepState, { label: string; tone: Tone }> = {
  done: { label: 'Done', tone: 'green' },
  current: { label: 'Do This Now', tone: 'blue' },
  todo: { label: 'Not Yet', tone: 'slate' },
  skipped: { label: 'Not Needed', tone: 'slate' },
};

/** One numbered step of the case checklist. */
function CaseStep({
  id,
  n,
  title,
  state,
  summary,
  last,
  children,
}: {
  id: string;
  n: number;
  title: string;
  state: StepState;
  summary: React.ReactNode;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li id={id} aria-label={`Step ${n}: ${title}`} className="relative flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[14px] font-semibold',
            state === 'done' && 'border-brand-dark bg-brand-dark text-white',
            state === 'current' && 'border-brand-dark bg-white text-brand-dark ring-4 ring-brand/20',
            (state === 'todo' || state === 'skipped') && 'border-slate-300 bg-white text-slate-400',
          )}
        >
          {state === 'done' ? <Check className="h-4 w-4" /> : n}
        </span>
        {!last && <span className="w-0.5 flex-1 bg-slate-200" />}
      </div>
      <div
        className={cn(
          'mb-4 min-w-0 flex-1 rounded-lg border bg-white px-4 py-3',
          state === 'current' ? 'border-brand/60 shadow-sm' : 'border-slate-200',
          (state === 'todo' || state === 'skipped') && 'bg-slate-50/60',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={cn(
              'text-[16px] font-semibold',
              state === 'todo' || state === 'skipped' ? 'text-slate-500' : 'text-slate-900',
            )}
          >
            {title}
          </h3>
          <Badge tone={STEP_BADGE[state].tone}>{STEP_BADGE[state].label}</Badge>
        </div>
        <div className="mt-0.5 text-[14px] text-slate-600">{summary}</div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

/** Small row of buttons under a step. */
function StepActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}

const CASE_TABS = ['steps', 'details', 'map', 'history'] as const;
type CaseTab = (typeof CASE_TABS)[number];
/** Links from the work lists and older pages still open the right step. */
const OLD_TAB_STEP: Record<string, string> = {
  investigation: 'step-visit',
  laboratory: 'step-samples',
  // Response Activities was removed (panel revision): old links open the head count step.
  response: 'step-head',
};

/** The case page, started fresh for each case (so stepping to the next case resets its forms). */
export function CaseDetailPage() {
  const { id } = useParams();
  return <CaseDetail key={id} />;
}

/** Previous / next case in the list the user came from, and the way back to it. */
function readCaseNav(id: number) {
  try {
    const nav = JSON.parse(sessionStorage.getItem('caseNav') ?? 'null') as {
      ids: number[];
      label: string;
      search: string;
    } | null;
    return nav && nav.ids.includes(id) ? nav : null;
  } catch {
    return null;
  }
}
function CaseNav({ id }: { id: number }) {
  const navigate = useNavigate();
  const nav = readCaseNav(id);
  if (!nav) return null;
  const i = nav.ids.indexOf(id);
  const prev = nav.ids[i - 1];
  const next = nav.ids[i + 1];
  return (
    <nav
      aria-label="Case navigation"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px]"
    >
      <Link to={`/cases${nav.search ? `?${nav.search}` : ''}`} className="link">
        ← Back to {nav.label.toLowerCase()}
      </Link>
      <span className="text-slate-500">
        Case {i + 1} of {nav.ids.length}
      </span>
      <span className="flex gap-2">
        <Button size="xs" variant="outline" disabled={!prev} onClick={() => navigate(`/cases/${prev}`)}>
          ‹ Previous case
        </Button>
        <Button size="xs" variant="outline" disabled={!next} onClick={() => navigate(`/cases/${next}`)}>
          Next Case ›
        </Button>
      </span>
    </nav>
  );
}

function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit: canWrite, isReviewer, user } = useAuth();
  const lh = useLetterhead();
  const [params] = useSearchParams();
  const tabParam = params.get('tab') ?? '';
  const [tab, setTab] = useState<CaseTab>(() =>
    CASE_TABS.includes(tabParam as CaseTab) ? (tabParam as CaseTab) : 'steps',
  );
  const [dlg, setDlg] = useState<
    null | 'location' | 'inv' | 'lab' | 'resp' | 'close' | 'edit' | 'pop' | 'void'
  >(null);
  const [labEdit, setLabEdit] = useState<LabEditRecord | null>(null);
  const [invEdit, setInvEdit] = useState<InvestigationEditRecord | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ url: string; what: string } | null>(null);
  const [popExtra, setPopExtra] = useState(0);
  const { data, isLoading, error } = useApi<CaseDetail>(`/api/cases/${id}`);
  const { data: caseVisits } = useApi<VisitRecord[]>(`/api/farm-visits?caseId=${id}`);
  // Links from My tasks can open a form straight away: ?do=visit or ?do=location.
  const doParam = params.get('do');
  const [didDo, setDidDo] = useState(false);
  useEffect(() => {
    if (!data || didDo || !doParam) return;
    setDidDo(true);
    if (!canWrite || data.case.closed) return;
    if (doParam === 'visit') setDlg('inv');
    if (doParam === 'location') setDlg('location');
  }, [data, didDo, doParam, canWrite]);
  // ?tab=laboratory (and the other old tab names) scroll to that step.
  useEffect(() => {
    const target = OLD_TAB_STEP[tabParam];
    if (data && target) document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [data, tabParam]);
  const { data: lookups } = useLookups();
  const { data: farmDetail } = useApi<{ groups: GroupRow[] }>(
    dlg === 'pop' && data ? `/api/farms/${data.case.farmId}` : null,
  );
  const reopen = useSave<Record<string, never>>('POST', `/api/cases/${id}/reopen`, {
    success: 'Case reopened.',
  });
  const reconcile = useSave<Record<string, never>>('POST', `/api/cases/${id}/population-reconciled`, {
    success: 'Head count marked as up to date.',
    offline: false,
  });
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Loading />;
  const c = data.case;
  const farm = lookups?.farms.find((f) => f.id === c.farmId);
  // A closed case is read-only.
  const canEdit = canWrite && !c.closed;
  const pending = c.pendingPopulation + popExtra;
  // Follow-up records cannot be dated before the case began.
  const caseStart = c.symptomsDate ?? c.reportedAt;
  const today = isoDate();

  // What has been done so far, worked out from the records.
  const invs = data.investigations.filter((v) => !v.voided);
  // A Field Visit to this farm linked to the case counts as a site visit too.
  const farmVisits = (caseVisits ?? []).filter((v) => v.farmId === c.farmId);
  const visitCount = invs.length + farmVisits.length;
  const lastVisit = [...invs.map((v) => v.date), ...farmVisits.map((v) => v.date)].sort().pop();
  const followUp = invs.find((v) => v.nextVisit && (!lastVisit || v.nextVisit > lastVisit))?.nextVisit;
  const labs = data.labs.filter((l) => !l.voided);
  const waiting = labs.filter((l) => l.result === 'PENDING');
  const notSent = waiting.find((l) => !l.sentAt);
  const sent = waiting.find((l) => l.sentAt);
  const decisive = labs.find((l) => l.result === c.status);
  const final = c.status === 'POSITIVE' || c.status === 'NEGATIVE';
  const inconclusive = onlyInconclusive(labs);
  const positive = c.status === 'POSITIVE';
  const removed = c.deaths + c.culled;
  const blockers = caseCloseBlockers({ labs, responses: [], pendingPopulation: pending }, today);

  const done = {
    visit: visitCount > 0,
    samples: final,
    head: pending === 0,
    close: c.closed,
  };
  const order = ['visit', 'samples', 'head', 'close'] as const;
  const current = c.closed ? null : order.find((k) => !done[k]);
  const stateOf = (k: (typeof order)[number]): StepState =>
    done[k] ? 'done' : current === k ? 'current' : 'todo';

  // The laboratory forms for this case's samples (the ones still waiting, or all of them).
  const labForms = () => {
    const xs = waiting.length ? waiting : labs;
    return {
      code: c.code,
      purposeLabel: 'Disease Investigation',
      examination: xs.find((l) => l.testMethod)?.testMethod ?? DEFAULT_LAB_TEST,
      laboratory: xs.find((l) => l.laboratory)?.laboratory ?? DEFAULT_LABORATORY,
      submittedAt: xs.find((l) => l.sentAt)?.sentAt ?? null,
      submittedBy: xs.find((l) => l.submittedBy)?.submittedBy ?? user?.name ?? null,
      notedBy: null,
      requestId: null,
      accessionNo: xs.find((l) => l.labReference)?.labReference ?? null,
      remarks: `${c.code}: ${c.disease} suspected — ${c.affected} affected, ${c.deaths} dead.`,
      samples: xs.map((l) => ({
        sampleId: l.sampleId,
        ownerName: c.ownerName,
        barangay: c.barangay,
        species: c.species,
        animalAge: l.animalAge ?? null,
        animalSex: l.animalSex ?? null,
        condition: l.condition ?? null,
        hoursSinceDeath: l.hoursSinceDeath ?? null,
        sampleType: l.sampleType,
        organs: l.organs ?? null,
        collectedAt: l.collectedAt,
        lat: c.lat,
        lng: c.lng,
      })),
    };
  };
  const openVisit = (v: InvestigationEditRecord | null = null) => {
    setInvEdit(v);
    setDlg('inv');
  };
  const openLab = (l: LabEditRecord | null = null) => {
    setLabEdit(l);
    setDlg('lab');
  };
  const voidIt = (url: string, what: string) => {
    setVoidTarget({ url, what });
    setDlg('void');
  };

  return (
    <div>
      <CaseNav id={c.id} />
      <PageHeader
        back={readCaseNav(c.id) ? false : undefined}
        title={`${c.code} · ${c.disease}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.farmName} · {c.barangay} <CaseClassBadge value={c.classification} />
            {!c.closed && <CaseStatusBadge status={c.status} />}
            {c.voided ? <Badge tone="red">Voided</Badge> : c.closed && <ClosedBadge />}
            {!c.mapped && !c.closed && <GeotagBadge />}
            {!c.voided && <Badge tone="slate">Owner sees: {data.stageLabel}</Badge>}
            {data.ownerReport && (
              <Link to={`/cases?pending=${data.ownerReport.id}`} className="text-[14px] underline">
                From owner report {data.ownerReport.code}
              </Link>
            )}
            {data.zone ? (
              <Link
                to={`/disease-monitoring?view=zones&zone=${data.zone.id}`}
                className="text-[14px] underline"
              >
                Monitoring zone {data.zone.code} ({data.zone.status === 'ACTIVE' ? 'active' : 'lifted'})
              </Link>
            ) : (
              isReviewer &&
              c.status === 'POSITIVE' &&
              !c.closed &&
              !c.voided && (
                <Link
                  to={`/disease-monitoring?view=zones&case=${c.id}`}
                  className="text-[14px] font-medium text-red-700 underline"
                >
                  Set a monitoring zone and alert nearby owners
                </Link>
              )
            )}
          </span>
        }
        actions={
          <>
            {c.mapped && (
              <Button variant="outline" onClick={() => navigate(`/gis-map?case=${c.id}`)}>
                <MapIcon /> View on Map
              </Button>
            )}
            {c.closed && isReviewer && (
              <Button variant="outline" loading={reopen.isPending} onClick={() => reopen.mutate({})}>
                <RotateCcw /> {c.voided ? 'Undo Void' : 'Reopen Case'}
              </Button>
            )}
            <MoreMenu
              items={[
                canEdit && { label: 'Edit Case Details', icon: Pencil, onSelect: () => setDlg('edit') },
                canEdit && {
                  label: c.mapped ? 'Edit location' : 'Add location',
                  icon: MapPin,
                  onSelect: () => setDlg('location'),
                },
                canEdit && {
                  label: 'Report Incident on Another Farm',
                  icon: Link2,
                  hint: 'The disease spread to another farm',
                  onSelect: () => navigate(`/cases/new?from=${c.id}`),
                },
                isReviewer &&
                  !c.voided && {
                    label: 'Void Case (Reported in Error)',
                    icon: Ban,
                    danger: true,
                    hint: 'A duplicate or wrong report; kept, but no longer counted',
                    onSelect: () => voidIt(`/api/cases/${c.id}/void`, `case ${c.code}`),
                  },
              ]}
            />
          </>
        }
      />
      {c.voided && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[15px] text-red-800"
        >
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b className="font-medium">Voided</b>
            {c.voidedBy ? ` by ${c.voidedBy}` : ''}: {c.voidReason}. This report does not count in any figure,
            map or report.
            {isReviewer && (
              <div className="mt-0.5 text-[13px]">If it was voided by mistake, select “Undo void”.</div>
            )}
          </div>
        </div>
      )}
      {c.closed && !c.voided && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-[15px] text-slate-700">
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
            {isReviewer && (
              <div className="mt-0.5 text-[13px] text-slate-500">
                To correct a record, reopen the case; the reopening and every change are kept in the Timeline.
              </div>
            )}
          </div>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'steps', label: 'Steps' },
          { id: 'details', label: 'Details' },
          { id: 'map', label: 'Map' },
          { id: 'history', label: 'Timeline' },
        ]}
      />
      <div className="mt-4">
        {tab === 'steps' && (
          <ol aria-label="Case steps" className="max-w-4xl">
            <CaseStep
              id="step-report"
              n={1}
              title="Report"
              state="done"
              summary={
                <>
                  {c.species} at {c.farmName} ({c.ownerName}) · {c.affected} affected · {c.deaths} dead ·
                  reported {fmtDate(c.reportedAt)}
                  {c.assignedToName ? ` · assigned to ${c.assignedToName}` : ''}
                </>
              }
            >
              {!c.mapped && !c.closed && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-800">
                  <MapPin className="h-4 w-4" /> No map location yet, so this case is not on the maps or in
                  Farms to Monitor.
                  {canEdit && (
                    <Button size="xs" variant="outline" onClick={() => setDlg('location')}>
                      Add Location
                    </Button>
                  )}
                </div>
              )}
              {canEdit && (
                <Button size="xs" variant="ghost" onClick={() => setDlg('edit')}>
                  <Pencil /> Edit Details
                </Button>
              )}
            </CaseStep>

            <CaseStep
              id="step-visit"
              n={2}
              title="Site Visit"
              state={stateOf('visit')}
              summary={
                visitCount
                  ? `${visitCount} visit${visitCount === 1 ? '' : 's'} · last on ${fmtDate(lastVisit)}${followUp ? ` · follow-up due ${fmtDate(followUp)}` : ''}`
                  : 'Go to the farm, examine the animals, then record what you found (sick, dead, biosecurity).'
              }
            >
              {(invs.length > 0 || farmVisits.length > 0) && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {data.investigations.map((v) => (
                    <li
                      key={`i${v.id}`}
                      className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0 text-[14px]">
                        <VoidAware r={v}>
                          <span className="font-medium text-slate-900">
                            {fmtDate(v.date)} · {v.visitLabel}
                          </span>
                          <span className="text-slate-500">
                            {[
                              v.investigator,
                              v.animalsExamined != null && `${v.animalsExamined} examined`,
                              v.sickCount != null && `${v.sickCount} sick`,
                              v.deadCount != null && `${v.deadCount} dead`,
                            ]
                              .filter(Boolean)
                              .map((x) => ` · ${x}`)
                              .join('')}
                          </span>
                          <div className="text-slate-600">{v.notes}</div>
                        </VoidAware>
                      </div>
                      {!v.voided && (canEdit || (isReviewer && !c.closed)) && (
                        <span className="flex gap-1">
                          {canEdit && (
                            <Button size="xs" variant="ghost" onClick={() => openVisit(v)}>
                              Edit
                            </Button>
                          )}
                          {isReviewer && !c.closed && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                voidIt(`/api/investigations/${v.id}/void`, `site visit of ${fmtDate(v.date)}`)
                              }
                            >
                              Void
                            </Button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                  {farmVisits.map((v) => (
                    <li key={`f${v.id}`} className="px-3 py-2 text-[14px]">
                      <span className="font-medium text-slate-900">
                        {fmtDate(v.date)} · Field visit ({v.purposeLabel})
                      </span>{' '}
                      <Badge tone={v.findings === 'SICK_ANIMALS' ? 'red' : 'green'}>{v.findingsLabel}</Badge>
                      {v.visitedBy && <span className="text-slate-500"> · {v.visitedBy}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <StepActions>
                  <Button
                    size="sm"
                    variant={current === 'visit' ? 'default' : 'outline'}
                    onClick={() => openVisit()}
                  >
                    <Plus /> {visitCount ? 'Record Follow-Up Visit' : 'Record Site Visit'}
                  </Button>
                </StepActions>
              )}
            </CaseStep>

            <CaseStep
              id="step-samples"
              n={3}
              title="Samples & Laboratory Result"
              state={stateOf('samples')}
              summary={
                final ? (
                  <>
                    Result: <b className="font-medium">{CASE_STATUS_LABELS[c.status]}</b>
                    {decisive
                      ? ` (sample ${decisive.sampleId}, ${fmtDate(decisive.resultDate)})`
                      : ''}. The case status was set from this result.
                  </>
                ) : sent ? (
                  `Waiting for the result of ${sent.sampleId} (sent ${fmtDate(sent.sentAt)}${sent.laboratory ? ` to ${sent.laboratory}` : ''}). Enter it on the Laboratory page as soon as it arrives.`
                ) : notSent ? (
                  `Sample ${notSent.sampleId} is collected. Enter the date it was sent on the Laboratory page.`
                ) : inconclusive ? (
                  'The result was inconclusive. Collect a new sample and send it for testing.'
                ) : (
                  'Collect samples and add them here. Each sample goes to the Laboratory page, where its result is entered; the case status updates by itself.'
                )
              }
            >
              {data.labs.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {data.labs.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 text-[14px]">
                        <VoidAware r={l}>
                          <span className="font-medium text-slate-900">{l.sampleId}</span>
                          <span className="text-slate-500">
                            {[
                              l.organs ? `${l.sampleType} (${l.organs})` : l.sampleType,
                              l.condition === 'DEAD' ? 'dead animal' : null,
                              l.testMethod,
                              l.laboratory,
                            ]
                              .filter(Boolean)
                              .map((x) => ` · ${x}`)
                              .join('')}
                          </span>
                          <div className="text-[13px] text-slate-500">
                            Collected {fmtDate(l.collectedAt)} · Sent{' '}
                            {l.sentAt ? fmtDate(l.sentAt) : 'not yet'}
                            {l.resultDate ? ` · Result ${fmtDate(l.resultDate)}` : ''}
                            {l.receivedVia
                              ? ` (${RESULT_RECEIVED_LABELS[l.receivedVia as keyof typeof RESULT_RECEIVED_LABELS]})`
                              : ''}
                            {l.submissionCode ? ` · sent in ${l.submissionCode}` : ''}
                          </div>
                        </VoidAware>
                      </div>
                      <span className="flex items-center gap-1.5">
                        <LabResultBadge result={l.result} />
                        {!l.voided && (
                          <Link
                            to={`/laboratory?sample=${l.id}`}
                            className="inline-flex h-8 items-center rounded-md px-2 text-[13px] font-medium text-brand-strong underline hover:bg-slate-50"
                          >
                            {l.result === 'PENDING' && canEdit
                              ? l.sentAt
                                ? 'Enter Result in Laboratory'
                                : 'Enter Date Sent in Laboratory'
                              : 'Open in Laboratory'}
                          </Link>
                        )}
                        {!l.voided && isReviewer && !c.closed && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => voidIt(`/api/labs/${l.id}/void`, `sample ${l.sampleId}`)}
                          >
                            Void
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <StepActions>
                  <Button
                    size="sm"
                    variant={current === 'samples' && !waiting.length ? 'default' : 'outline'}
                    onClick={() => openLab()}
                  >
                    <Plus /> {labs.length ? 'Add Another Sample' : 'Add Sample'}
                  </Button>
                  {labs.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printAnalysisRequest(labForms(), lh, user?.name)}
                      >
                        <Printer /> Analysis Request Form
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printSampleCollection(labForms(), lh, user?.name)}
                      >
                        <Printer /> Sample Collection Form
                      </Button>
                    </>
                  )}
                </StepActions>
              )}
              {!labs.length && !c.closed && (
                <p className="mt-2 text-[13px] text-slate-500">
                  No test will be done (false alarm, animals recovered)? Skip to step 5 and close the case as
                  “Disease not confirmed”.
                </p>
              )}
            </CaseStep>

            <CaseStep
              id="step-head"
              n={4}
              title="Update the Head Count"
              state={stateOf('head')}
              summary={
                pending > 0
                  ? `${pending} animal(s) died or were culled${c.culled ? ` (${c.deaths} dead, ${c.culled} culled)` : ''} and are still counted in ${c.farmName}'s head count.`
                  : removed
                    ? `The farm's head count already reflects the ${removed} animal(s) that died or were culled.`
                    : 'No deaths or culling so far — nothing to take off the head count.'
              }
            >
              {canEdit && pending > 0 && (
                <StepActions>
                  <Button
                    size="sm"
                    variant={current === 'head' ? 'default' : 'outline'}
                    onClick={() => setDlg('pop')}
                  >
                    Update Head Count
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={reconcile.isPending}
                    onClick={() => reconcile.mutate({})}
                  >
                    Already Counted
                  </Button>
                </StepActions>
              )}
            </CaseStep>

            <CaseStep
              id="step-close"
              n={5}
              title="Close the Case"
              state={stateOf('close')}
              last
              summary={
                c.closed
                  ? `Closed ${fmtDate(c.closedAt!.slice(0, 10))}${c.closureOutcome ? ` — ${CASE_OUTCOME_LABELS[c.closureOutcome as CaseOutcome] ?? c.closureOutcome}` : ''}.`
                  : blockers.length
                    ? 'Finish these first:'
                    : positive
                      ? 'Everything is recorded. Close the case once the outbreak is contained.'
                      : c.status === 'NEGATIVE'
                        ? 'The result is negative. Close the case as “Disease not confirmed”.'
                        : 'No sample is waiting. If no test will be done, you can close the case now.'
              }
            >
              {!c.closed && blockers.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-[14px] text-slate-700">
                  {blockers.map((b: string) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {canEdit && !isReviewer && (
                <p className="text-[13px] text-slate-500">
                  A veterinarian or the administrator closes the case.
                </p>
              )}
              {canEdit && isReviewer && (
                <StepActions>
                  <Button
                    size="sm"
                    variant={current === 'close' ? 'default' : 'outline'}
                    disabled={blockers.length > 0}
                    onClick={() => setDlg('close')}
                  >
                    <Lock /> Close Case
                  </Button>
                </StepActions>
              )}
            </CaseStep>
          </ol>
        )}
        {tab === 'details' && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Case Details" />
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
                    [
                      'Clinical signs',
                      c.clinicalSigns.length
                        ? c.clinicalSigns.map((x) => CLINICAL_SIGN_LABELS[x as ClinicalSign] ?? x).join(', ')
                        : null,
                    ],
                    ['Other signs / history', c.symptoms],
                    ['Remarks', c.remarks],
                  ]}
                />
                <PhotoGallery keys={c.photoKeys} className="content-start md:max-w-[264px]" />
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Linked Incidents" />
                <div className="px-4 py-3 text-[15px]">
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
                            <div className="text-[13px] text-slate-500">
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
                        No other farms linked. If the disease spread to another farm, use More → “Report
                        incident on another farm”.
                      </p>
                    )
                  )}
                </div>
              </Card>
              <MonitoringCard c={c} />
            </div>
          </div>
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
                    <MapPin /> Add Location
                  </Button>
                </div>
              )}
            </Card>
          ))}
        {tab === 'history' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader title="Incident Timeline" />
              <IncidentTimeline d={data} visits={caseVisits ?? []} />
            </Card>
            <Card className="self-start">
              <CardHeader title="Status History" />
              <Timeline
                items={data.history.map((h) => ({
                  key: h.id,
                  meta: `${fmtDateTime(h.at)} · ${h.byName ?? 'System'}`,
                  title: h.label,
                  body: h.note,
                }))}
              />
            </Card>
          </div>
        )}
      </div>
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
          prefill={popPrefill(farmDetail.groups, c.species, c.code, pending)}
          note={`Suggested counts take ${pending} head of ${c.species.toLowerCase()} off for ${c.code}. Check the numbers before saving.`}
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
        investigation={invEdit}
        minDate={caseStart}
      />
      <LabDialog
        open={dlg === 'lab'}
        onOpenChange={(o) => setDlg((d) => (o ? 'lab' : d === 'lab' ? null : d))}
        caseId={c.id}
        code={c.code}
        lab={labEdit}
        hideResult={!labEdit}
        minDate={caseStart}
      />
      <CaseCloseDialog
        open={dlg === 'close'}
        onOpenChange={(o) => setDlg(o ? 'close' : null)}
        caseId={c.id}
        code={c.code}
        status={c.status}
        tested={labs.some((l) => l.result !== 'PENDING')}
        blockers={blockers}
      />
    </div>
  );
}

/**
 * Suggested new counts for the affected species: take the deaths/culled heads off its groups,
 * never below the group's tagged animals. Staff review the numbers before saving.
 */
function popPrefill(groups: GroupRow[], species: string, code: string, pending: number) {
  const out: Record<number, { count: number; reason: string }> = {};
  let remaining = pending;
  for (const g of [...groups].filter((x) => x.species === species).sort((a, b) => b.count - a.count)) {
    const take = Math.min(remaining, Math.max(0, g.count - g.tagged));
    if (!take) continue;
    out[g.id] = { count: g.count - take, reason: `${code}: −${take} (deaths/culling)` };
    remaining -= take;
  }
  return out;
}

/* ---------------- Incident timeline, lab tracking and monitoring ---------------- */

/** Every event on a case in date order: report, visits, samples, results, responses, closure. */
function IncidentTimeline({ d, visits }: { d: CaseDetail; visits: VisitRecord[] }) {
  const c = d.case;
  type Ev = {
    key: string;
    date: string;
    sort: string;
    title: React.ReactNode;
    tag?: React.ReactNode;
    body?: React.ReactNode;
    tone: 'green' | 'red' | 'blue' | 'amber' | 'slate';
  };
  const ev: Ev[] = [];
  // Same-day events follow the report itself (report = " 1", other events = " 5").
  const add = (e: Omit<Ev, 'sort'> & { sort?: string }) => ev.push({ ...e, sort: e.sort ?? `${e.date} 5` });
  if (c.symptomsDate)
    add({
      key: 'sym',
      date: c.symptomsDate,
      sort: `${c.symptomsDate} 0`,
      title: 'Symptoms First Observed',
      tone: 'amber',
    });
  add({
    key: 'rep',
    date: c.reportedAt,
    sort: `${c.reportedAt} 1`,
    title: 'Incident Reported',
    body: `${c.species} · ${c.affected} affected, ${c.deaths} dead${c.reportedBy ? ` · reported by ${c.reportedBy}` : ''}`,
    tone: 'red',
  });
  // Status changes after the first one (the first is the report itself).
  for (const h of [...d.history].sort((x, y) => x.at.localeCompare(y.at)).slice(1))
    add({
      key: `h${h.id}`,
      date: h.at.slice(0, 10),
      sort: `${h.at.slice(0, 10)} 5${h.at}`,
      title: `Status: ${h.label}`,
      body: [h.note, h.byName].filter(Boolean).join(' · '),
      tone: h.status === 'POSITIVE' ? 'red' : h.status === 'NEGATIVE' ? 'green' : 'slate',
    });
  for (const v of d.investigations.filter((x) => !x.voided))
    add({
      key: `i${v.id}`,
      date: v.date,
      title: `Site visit · ${v.visitLabel}`,
      body: [
        v.investigator,
        v.animalsExamined != null && `${v.animalsExamined} examined`,
        v.sickCount != null && `${v.sickCount} sick`,
        v.deadCount != null && `${v.deadCount} dead`,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'blue',
    });
  for (const l of d.labs.filter((x) => !x.voided)) {
    if (l.collectedAt)
      add({
        key: `lc${l.id}`,
        date: l.collectedAt,
        title: `Sample collected · ${l.sampleId}`,
        body: l.sampleType,
        tone: 'blue',
      });
    if (l.sentAt)
      add({
        key: `ls${l.id}`,
        date: l.sentAt,
        title: `Sample sent for testing · ${l.sampleId}`,
        body: [l.laboratory, l.testMethod].filter(Boolean).join(' · '),
        tone: 'blue',
      });
    if (l.resultDate && l.result !== 'PENDING')
      add({
        key: `lr${l.id}`,
        date: l.resultDate,
        title: `Laboratory result · ${l.sampleId}`,
        tag: <LabResultBadge result={l.result} />,
        tone: l.result === 'POSITIVE' ? 'red' : l.result === 'NEGATIVE' ? 'green' : 'amber',
      });
  }
  for (const r of d.responses.filter((x) => !x.voided))
    add({
      key: `r${r.id}`,
      date: r.date,
      title: r.typeLabel,
      tag: (
        <Badge tone={r.status === 'COMPLETED' ? 'green' : r.status === 'ONGOING' ? 'amber' : 'slate'}>
          {r.statusLabel}
        </Badge>
      ),
      body: [r.location, r.heads ? `${r.heads} head` : null, r.endDate && `until ${fmtDate(r.endDate)}`]
        .filter(Boolean)
        .join(' · '),
      tone: 'amber',
    });
  for (const v of visits)
    add({
      key: `v${v.id}`,
      date: v.date,
      title: `Monitoring visit · ${v.farmName}`,
      tag: <Badge tone={v.findings === 'SICK_ANIMALS' ? 'red' : 'green'}>{v.findingsLabel}</Badge>,
      body: [v.barangay, v.visitedBy].filter(Boolean).join(' · '),
      tone: v.findings === 'SICK_ANIMALS' ? 'red' : 'green',
    });
  if (c.closedAt)
    add({
      key: 'close',
      date: c.closedAt.slice(0, 10),
      sort: `${c.closedAt.slice(0, 10)} 9`,
      title: 'Case Closed',
      body: [
        c.closureOutcome && (CASE_OUTCOME_LABELS[c.closureOutcome as CaseOutcome] ?? c.closureOutcome),
        c.closedBy,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'slate',
    });
  ev.sort((a, b) => a.sort.localeCompare(b.sort));
  return <ActivityTimeline items={ev} empty="No events yet." />;
}

/** Farms near the case and whether each was visited since the report. */
function MonitoringCard({ c }: { c: CaseRow }) {
  const navigate = useNavigate();
  const { data } = useApi<RadiusResult>(c.mapped ? `/api/radius?caseId=${c.id}&radius=1000` : null);
  return (
    <Card>
      <CardHeader
        title="Farms to Monitor (1 km)"
        actions={
          c.mapped && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => navigate(`/disease-monitoring?view=radius&case=${c.id}&radius=1000`)}
            >
              <Radar /> Open List
            </Button>
          )
        }
      />
      {!c.mapped ? (
        <p className="px-4 py-4 text-[14px] text-slate-500">
          Add the case location to see the farms around it.
        </p>
      ) : !data?.totals ? (
        <p className="px-4 py-4 text-[14px] text-slate-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 p-4 text-center">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="text-[20px] font-semibold text-slate-900">{data.totals.nearby}</div>
            <div className="text-[12px] text-slate-500">nearby farms</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <div className="text-[20px] font-semibold text-amber-800">{data.totals.notVisited}</div>
            <div className="text-[12px] text-amber-800">not yet visited</div>
          </div>
          <div className="rounded-lg bg-red-50 p-2">
            <div className="text-[20px] font-semibold text-red-700">{data.totals.sick}</div>
            <div className="text-[12px] text-red-700">sick animals found</div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Shows a voided record struck through with who voided it and why. */
function VoidAware({ r, children }: { r: VoidInfo; children: React.ReactNode }) {
  if (!r.voided) return <>{children}</>;
  return (
    <div>
      <span className="text-slate-400 line-through">{children}</span> <Badge tone="slate">Voided</Badge>
      <div className="text-[13px] text-slate-500">
        {r.voidReason}
        {r.voidedBy ? ` — ${r.voidedBy}` : ''}
      </div>
    </div>
  );
}

type WorkCase = { caseId: number; caseCode: string; disease: string; barangay: string; farmName: string };
export type CaseWorklist = {
  labs: (WorkCase & {
    id: number;
    sampleId: string;
    sampleType: string;
    testMethod: string | null;
    laboratory: string;
    collectedAt: string | null;
    sentAt: string | null;
    waitingDays: number | null;
    sent: boolean;
  })[];
  visits: (WorkCase & {
    kind: 'INITIAL' | 'FOLLOW_UP';
    due: string;
    lastVisit: string | null;
    overdue: boolean;
  })[];
  measures: (WorkCase & {
    id: number;
    type: ResponseType;
    typeLabel: string;
    state: 'PLANNED' | 'IN_FORCE' | 'ONGOING';
    status: string;
    date: string;
    endDate: string | null;
    location: string | null;
    personnel: string | null;
    late: boolean;
  })[];
};
