import { AlertTriangle, Check, Link2, Lock, MapPin, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BARANGAYS,
  CASE_STAGE,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  checkCaseStatus,
  MAX_PHOTOS,
  MAX_PHOTO_MB,
  SPECIES,
  caseCreateSchema,
  fmtDate,
  fmtDateTime,
  isoDate,
  type CaseStatus,
} from '@livestock/shared';
import { isQueued } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useLookups, useSave } from '@/lib/hooks';
import { cn, qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { PhotoGallery, PhotoPicker, err, useZodForm } from '@/components/forms';
import { MapView } from '@/components/MapView';
import { ErrorBox, FilterSelect, KV, Loading, PageHeader, Timeline } from '@/components/page';
import { CaseStatusBadge, ClosedBadge, GeotagBadge, LabResultBadge } from '@/components/status';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Tabs, Textarea } from '@/components/ui';
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
} from '@/dialogs/surveillance';
import type { CaseRow } from './types';

/* ---------------- Incident list ---------------- */

export function CasesPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [barangay, setBarangay] = useState('');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('open');
  const { data, isLoading, error } = useApi<CaseRow[]>(`/api/cases${qs({ barangay, location, state })}`);
  return (
    <div>
      <PageHeader
        title="Disease Incident Reports"
        actions={
          canEdit && (
            <Button onClick={() => navigate('/cases/new')}>
              <Plus /> Report incident
            </Button>
          )
        }
      />
      {error ? (
        <ErrorBox error={error} />
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
            toolbar={
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
            }
            columns={[
              { key: 'code', header: 'Case' },
              { key: 'reportedAt', header: 'Reported', cell: (r) => fmtDate(r.reportedAt) },
              { key: 'disease', header: 'Disease' },
              { key: 'farmName', header: 'Farm' },
              { key: 'species', header: 'Species' },
              {
                key: 'status',
                header: 'Status',
                sort: (r) => CASE_STATUSES.indexOf(r.status),
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

  // Pre-select the farm passed in the link: first its owner, then (once that owner's farms are listed) the farm.
  const presetFarm = presetFarmId ? lookups?.farms.find((x) => String(x.id) === presetFarmId) : undefined;
  useEffect(() => {
    if (presetFarm) form.setValue('ownerId', String(presetFarm.ownerId) as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFarm?.id]);
  useEffect(() => {
    if (presetFarm && farms.some((f) => f.id === presetFarm.id) && !form.getValues('farmId')) {
      form.setValue('farmId', String(presetFarm.id) as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFarm?.id, farms.length]);

  // Copy the disease and species from the original case.
  useEffect(() => {
    if (!parent) return;
    if (!form.getValues('disease')) form.setValue('disease', parent.case.disease as any);
    if (!form.getValues('species')) form.setValue('species', parent.case.species as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.case.id]);

  const save = useSave<any, { id: number }>('POST', '/api/cases', {
    success: 'Disease incident reported.',
    label: (b) => `Report ${b.disease}`,
    form,
    files: () => photos,
    photoField: 'photoKeys',
    onDone: (res) =>
      navigate(isQueued(res) ? '/cases' : `/cases/${(res as { id: number }).id}`, { replace: true }),
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
                {...form.register('ownerId', { onChange: () => form.setValue('farmId', '' as any) })}
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
              <Select {...form.register('farmId')} disabled={!ownerId} aria-invalid={!!e.farmId}>
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
            <Field label="Species affected *" error={err(e, 'species')}>
              <Select {...form.register('species')} aria-invalid={!!e.species}>
                <option value="">Select...</option>
                {SPECIES.map((s) => (
                  <option key={s}>{s}</option>
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
            <Field label="Animals affected *" error={err(e, 'affected')}>
              <Input type="number" min={1} {...form.register('affected')} />
            </Field>
            <Field label="Deaths" error={err(e, 'deaths')}>
              <Input type="number" min={0} {...form.register('deaths')} />
            </Field>
            <Field label="Date symptoms observed" error={err(e, 'symptomsDate')}>
              <Input type="date" max={isoDate()} {...form.register('symptomsDate')} />
            </Field>
            <Field label="Date reported" error={err(e, 'reportedAt')}>
              <Input type="date" max={isoDate()} {...form.register('reportedAt')} />
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
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
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
  investigations: ({ id: number; date: string; investigator: string | null; notes: string } & VoidInfo)[];
  labs: (LabEditRecord & VoidInfo)[];
  responses: ({
    id: number;
    type: string;
    typeLabel: string;
    date: string;
    personnel: string | null;
    remarks: string | null;
    heads: number | null;
  } & VoidInfo)[];
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

type CaseTab = 'overview' | 'investigation' | 'laboratory' | 'response' | 'map' | 'history';

export function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit: canWrite, isAdmin } = useAuth();
  const [tab, setTab] = useState<CaseTab>('overview');
  const [dlg, setDlg] = useState<
    null | 'status' | 'location' | 'inv' | 'lab' | 'resp' | 'close' | 'edit' | 'pop' | 'void'
  >(null);
  const [labEdit, setLabEdit] = useState<LabEditRecord | null>(null);
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
            {c.closureNote && <div className="mt-0.5 text-slate-600">{c.closureNote}</div>}
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
          <Card>
            <CardHeader
              title="Investigation records"
              actions={
                canEdit && (
                  <Button variant="outline" size="xs" onClick={() => setDlg('inv')}>
                    <Plus /> Add investigation
                  </Button>
                )
              }
            />
            <DataTable
              rows={data.investigations}
              rowKey={(r) => r.id}
              pageSize={0}
              hideFooter
              columns={[
                { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
                { key: 'investigator', header: 'Investigator' },
                {
                  key: 'notes',
                  header: 'Notes',
                  className: 'whitespace-pre-wrap',
                  cell: (r) => <VoidAware r={r}>{r.notes}</VoidAware>,
                },
                ...(isAdmin
                  ? [
                      {
                        key: 'actions',
                        header: '',
                        sort: false as const,
                        cell: (r: CaseDetail['investigations'][number]) =>
                          !r.voided && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setVoidTarget({
                                  url: `/api/investigations/${r.id}/void`,
                                  what: `investigation of ${fmtDate(r.date)}`,
                                });
                                setDlg('void');
                              }}
                            >
                              Void
                            </Button>
                          ),
                      },
                    ]
                  : []),
              ]}
              empty="No investigations recorded yet."
            />
          </Card>
        )}
        {tab === 'laboratory' && (
          <LabTable
            labs={data.labs}
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
              isAdmin
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
            onLog={canEdit ? () => setDlg('resp') : undefined}
            onVoid={
              isAdmin
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
        onOpenChange={(o) => setDlg(o ? 'inv' : null)}
        caseId={c.id}
        code={c.code}
      />
      <LabDialog
        open={dlg === 'lab'}
        onOpenChange={(o) => setDlg((d) => (o ? 'lab' : d === 'lab' ? null : d))}
        caseId={c.id}
        code={c.code}
        lab={labEdit}
        onSaved={afterLabSaved}
      />
      <ResponseDialog
        open={dlg === 'resp'}
        onOpenChange={(o) => setDlg((d) => (o ? 'resp' : d === 'resp' ? null : d))}
        caseId={c.id}
        code={c.code}
        onSaved={(v) => {
          // Culling removes animals: offer the population update straight away.
          if (v.type === 'CULLING_DEPOPULATION' && Number(v.heads) > 0) {
            setPopExtra(Number(v.heads));
            setDlg('pop');
          }
        }}
      />
      <CaseCloseDialog
        open={dlg === 'close'}
        onOpenChange={(o) => setDlg(o ? 'close' : null)}
        caseId={c.id}
        code={c.code}
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

export function LabTable({
  labs,
  onAdd,
  onEdit,
  onVoid,
}: {
  labs: CaseDetail['labs'];
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
        columns={[
          { key: 'sampleId', header: 'Sample ID', cell: (r) => <VoidAware r={r}>{r.sampleId}</VoidAware> },
          { key: 'sampleType', header: 'Type' },
          { key: 'collectedAt', header: 'Collected', cell: (r) => fmtDate(r.collectedAt) },
          { key: 'laboratory', header: 'Laboratory' },
          { key: 'sentAt', header: 'Sent', cell: (r) => fmtDate(r.sentAt) },
          { key: 'result', header: 'Result', cell: (r) => <LabResultBadge result={r.result} /> },
          { key: 'resultDate', header: 'Result date', cell: (r) => fmtDate(r.resultDate) },
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
    </Card>
  );
}

export function ResponsePanel({
  detail,
  onLog,
  onVoid,
}: {
  detail: CaseDetail;
  onLog?: () => void;
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
      <Card>
        <CardHeader
          title="Response activity log"
          actions={
            onLog && (
              <Button variant="outline" size="xs" onClick={onLog}>
                <Plus /> Log activity
              </Button>
            )
          }
        />
        {detail.responses.length ? (
          <Timeline
            items={detail.responses.map((r) => ({
              key: r.id,
              meta: fmtDate(r.date),
              title: r.voided ? (
                <VoidAware r={r}>{r.typeLabel}</VoidAware>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {r.typeLabel}
                  {r.heads ? <Badge tone="red">{r.heads} culled</Badge> : null}
                  {onVoid && (
                    <Button size="xs" variant="ghost" onClick={() => onVoid(r)}>
                      Void
                    </Button>
                  )}
                </span>
              ),
              tag: r.personnel,
              body: r.remarks,
            }))}
          />
        ) : (
          <p className="p-4 text-sm text-slate-500">No response activities logged yet.</p>
        )}
      </Card>
    </div>
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
  const { canEdit } = useAuth();
  const [caseId, setCaseId] = useState('');
  const [dlg, setDlg] = useState<null | 'inv' | 'lab'>(null);
  const { data: cases } = useApi<CaseRow[]>('/api/cases');
  const { data: labs, isLoading } =
    useApi<(CaseDetail['labs'][number] & { caseId: number; caseCode: string })[]>('/api/labs');
  const { data: detail } = useApi<CaseDetail>(caseId ? `/api/cases/${caseId}` : null);
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
              .map((c) => ({ value: String(c.id), label: `${c.code} · ${c.disease}` }))}
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
            columns={[
              { key: 'sampleId', header: 'Sample ID' },
              { key: 'caseCode', header: 'Case' },
              { key: 'sampleType', header: 'Type' },
              { key: 'laboratory', header: 'Laboratory' },
              { key: 'sentAt', header: 'Sent', cell: (r) => fmtDate(r.sentAt) },
              { key: 'result', header: 'Result', cell: (r) => <LabResultBadge result={r.result} /> },
            ]}
            empty="No laboratory records yet."
          />
        </Card>
      ) : !detail ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[17px] font-semibold text-slate-900">{detail.case.code}</span>
              <CaseStatusBadge status={detail.case.status} />
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
          <Card>
            <CardHeader
              title="Investigation records"
              actions={
                canEdit && (
                  <Button variant="outline" size="xs" onClick={() => setDlg('inv')}>
                    <Plus /> Add investigation
                  </Button>
                )
              }
            />
            <DataTable
              rows={detail.investigations}
              rowKey={(r) => r.id}
              pageSize={0}
              hideFooter
              columns={[
                { key: 'date', header: 'Date', cell: (r) => fmtDate(r.date) },
                { key: 'investigator', header: 'Investigator' },
                { key: 'notes', header: 'Notes' },
              ]}
              empty="No investigations recorded yet."
            />
          </Card>
          <LabTable labs={detail.labs} onAdd={canEdit ? () => setDlg('lab') : undefined} />
          <InvestigationDialog
            open={dlg === 'inv'}
            onOpenChange={(o) => setDlg(o ? 'inv' : null)}
            caseId={detail.case.id}
            code={detail.case.code}
          />
          <LabDialog
            open={dlg === 'lab'}
            onOpenChange={(o) => setDlg(o ? 'lab' : null)}
            caseId={detail.case.id}
            code={detail.case.code}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------- Response activities ---------------- */

export function ResponseActivitiesPage() {
  const { canEdit } = useAuth();
  const { data: cases, isLoading: casesLoading, error: casesError } = useApi<CaseRow[]>('/api/cases');
  const sorted = [...(cases ?? [])].sort(
    (a, b) => (a.status === 'POSITIVE' ? -1 : 0) - (b.status === 'POSITIVE' ? -1 : 0) || a.id - b.id,
  );
  const [caseId, setCaseId] = useState('');
  const effective = caseId || (sorted[0] ? String(sorted[0].id) : '');
  const [open, setOpen] = useState(false);
  const { data: detail, error: detailError } = useApi<CaseDetail>(
    effective ? `/api/cases/${effective}` : null,
  );
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
              label: `${c.code} · ${c.disease} (${CASE_STATUS_LABELS[c.status]})`,
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
            onLog={canEdit && !detail.case.closed ? () => setOpen(true) : undefined}
          />
          <ResponseDialog
            open={open}
            onOpenChange={setOpen}
            caseId={detail.case.id}
            code={detail.case.code}
          />
        </>
      )}
    </div>
  );
}