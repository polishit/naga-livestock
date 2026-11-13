import {
  ClipboardList,
  FilePlus2,
  FlaskConical,
  Hourglass,
  Pencil,
  Plus,
  Printer,
  Siren,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ANIMAL_CONDITIONS,
  ANIMAL_CONDITION_LABELS,
  DEFAULT_LABORATORY,
  DEFAULT_LAB_TEST,
  LAB_PURPOSES,
  LAB_PURPOSE_LABELS,
  LAB_RESULTS,
  LAB_TEST_METHODS,
  RESULT_RECEIVED_LABELS,
  RESULT_RECEIVED_VIA,
  SAMPLE_ORGANS,
  SPECIMEN_TYPES,
  fmtDate,
  isoDate,
  labSubmissionSchema,
  specimenFor,
  titleCase,
} from '@livestock/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { useLetterhead } from '@/components/ExportButtons';
import { err, useZodForm } from '@/components/forms';
import { ErrorBox, Loading, PageHeader, StatCard } from '@/components/page';
import { LabResultBadge } from '@/components/status';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { VoidDialog } from '@/dialogs/surveillance';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { speciesOnFarm, useApi, useLookups, useSave, useUnsavedGuard } from '@/lib/hooks';
import { printAnalysisRequest, printSampleCollection } from '@/lib/print';
import { cn } from '@/lib/utils';

export interface LabSampleRow {
  id: number;
  sampleId: string;
  farmId: number | null;
  farmName: string | null;
  ownerId: number | null;
  ownerName: string | null;
  barangay: string | null;
  lat: number | null;
  lng: number | null;
  species: string | null;
  animalAge: string | null;
  animalSex: string | null;
  condition: string | null;
  hoursSinceDeath: number | null;
  sampleType: string | null;
  organs: string | null;
  collectedAt: string | null;
  sentAt: string | null;
  result: string;
  resultDate: string | null;
  receivedVia: string | null;
  caseId: number | null;
  caseCode: string | null;
  voided: boolean;
  voidReason: string | null;
}
export interface LabSubmission {
  id: number;
  code: string;
  purpose: string;
  purposeLabel: string;
  examination: string;
  laboratory: string;
  submittedAt: string | null;
  submittedBy: string | null;
  notedBy: string | null;
  requestId: string | null;
  accessionNo: string | null;
  remarks: string | null;
  createdBy: string | null;
  collectedFrom: string | null;
  collectedTo: string | null;
  barangays: string[];
  species: string[];
  total: number;
  pending: number;
  positive: number;
  negative: number;
  inconclusive: number;
  positiveNoCase: number;
  samples: LabSampleRow[];
}

/** Pending / negative / positive counts as small badges. */
function ResultCounts({
  s,
}: {
  s: Pick<LabSubmission, 'pending' | 'negative' | 'positive' | 'inconclusive'>;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {s.pending > 0 && <Badge tone="amber">{s.pending} pending</Badge>}
      {s.negative > 0 && <Badge tone="slate">{s.negative} negative</Badge>}
      {s.positive > 0 && <Badge tone="red">{s.positive} positive</Badge>}
      {s.inconclusive > 0 && <Badge tone="violet">{s.inconclusive} inconclusive</Badge>}
    </span>
  );
}

const dateRange = (a: string | null, b: string | null) =>
  !a ? '—' : a === b || !b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;

/* ---------------- List ---------------- */

export function LabSubmissionsPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const { data, isLoading, error } = useApi<LabSubmission[]>('/api/lab-submissions');
  if (error) return <ErrorBox error={error} />;
  const rows = data ?? [];
  const columns: Column<LabSubmission>[] = [
    {
      key: 'code',
      header: 'Batch',
      cell: (r) => <span className="font-medium text-slate-900">{r.code}</span>,
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      cell: (r) => (r.submittedAt ? fmtDate(r.submittedAt) : 'Not yet'),
    },
    { key: 'purposeLabel', header: 'Purpose' },
    { key: 'examination', header: 'Examination' },
    { key: 'total', header: 'Samples', className: 'text-right', headerClassName: 'text-right' },
    {
      key: 'barangays',
      header: 'Barangays',
      sort: false,
      cell: (r) =>
        r.barangays.length > 2
          ? `${r.barangays.slice(0, 2).join(', ')} +${r.barangays.length - 2}`
          : r.barangays.join(', '),
    },
    {
      key: 'results',
      header: 'Results',
      sort: (r) => r.pending,
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <ResultCounts s={r} />
          {r.positiveNoCase > 0 && <Badge tone="red">Needs a case</Badge>}
        </span>
      ),
    },
  ];
  return (
    <div>
      <PageHeader
        title="Lab Submissions"
        subtitle="Samples sent to the laboratory in one batch, with the Analysis Request and Sample Collection forms ready to print."
        actions={
          canEdit && (
            <Button onClick={() => navigate('/lab-submissions/new')}>
              <FilePlus2 /> New submission
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Batches" value={rows.length} icon={ClipboardList} tone="blue" />
        <StatCard label="Samples sent" value={rows.reduce((a, r) => a + r.total, 0)} icon={FlaskConical} />
        <StatCard
          label="Waiting for results"
          value={rows.reduce((a, r) => a + r.pending, 0)}
          icon={Hourglass}
          tone="orange"
        />
        <StatCard
          label="Positive, no case yet"
          value={rows.reduce((a, r) => a + r.positiveNoCase, 0)}
          icon={Siren}
          tone="red"
        />
      </div>
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/lab-submissions/${r.id}`)}
          searchText={(r) =>
            `${r.code} ${r.examination} ${r.purposeLabel} ${r.barangays.join(' ')} ${r.accessionNo ?? ''}`
          }
          searchPlaceholder="Search batch, test, barangay or accession no..."
          defaultSort={{ key: 'code', dir: 'desc' }}
          empty="No lab submissions yet. Select “New submission” to send a batch of samples."
        />
      </Card>
    </div>
  );
}

/* ---------------- New / edit ---------------- */

const blankSample = (prev?: Record<string, any>, n = 1) => ({
  id: undefined,
  farmId: prev?.farmId ?? '',
  species: prev?.species ?? 'Swine',
  sampleId: '',
  sampleType: prev?.sampleType ?? 'Blood',
  animalAge: '',
  animalSex: '',
  condition: prev?.condition ?? 'LIVE',
  hoursSinceDeath: '',
  organs: prev?.organs ?? '',
  collectedAt: prev?.collectedAt ?? isoDate(),
  _n: n,
});

export function LabSubmissionFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const { data: existing } = useApi<LabSubmission>(editing ? `/api/lab-submissions/${id}` : null);
  const form = useZodForm(labSubmissionSchema, {});
  const samples = useFieldArray({ control: form.control, name: 'samples' });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded) return;
    if (editing && !existing) return;
    const s = existing;
    form.reset({
      purpose: s?.purpose ?? 'SURVEILLANCE',
      examination: s?.examination ?? DEFAULT_LAB_TEST,
      laboratory: s?.laboratory ?? DEFAULT_LABORATORY,
      submittedAt: s?.submittedAt ?? isoDate(),
      submittedBy: s?.submittedBy ?? user?.name ?? '',
      notedBy: s?.notedBy ?? '',
      requestId: s?.requestId ?? '',
      accessionNo: s?.accessionNo ?? '',
      remarks: s?.remarks ?? '',
      samples: s
        ? s.samples
            .filter((x) => !x.voided)
            .map((x) => ({
              id: x.id,
              farmId: String(x.farmId ?? ''),
              species: x.species ?? '',
              sampleId: x.sampleId,
              sampleType: x.sampleType ?? 'Blood',
              animalAge: x.animalAge ?? '',
              animalSex: x.animalSex ?? '',
              condition: x.condition ?? '',
              hoursSinceDeath: x.hoursSinceDeath != null ? String(x.hoursSinceDeath) : '',
              organs: x.organs ?? '',
              collectedAt: x.collectedAt ?? '',
              locked: x.result !== 'PENDING' || !!x.caseId,
            }))
        : [blankSample()],
    } as any);
    setLoaded(true);
  }, [editing, existing, loaded, form, user]);
  useUnsavedGuard(form.formState.isDirty);
  const save = useSave<any, { id: number; code?: string }>(
    editing ? 'PATCH' : 'POST',
    editing ? `/api/lab-submissions/${id}` : '/api/lab-submissions',
    {
      success: editing
        ? 'Lab submission updated.'
        : 'Lab submission saved. Print the forms to send with the samples.',
      label: () => 'Lab submission',
      form,
      offline: false,
      onDone: (res) => {
        form.reset(form.getValues());
        if (!('queued' in res)) navigate(`/lab-submissions/${res.id}`, { replace: true });
      },
    },
  );
  const e = form.formState.errors as any;
  const rows = form.watch('samples') ?? [];
  const farms = useMemo(
    () =>
      [...(lookups?.farms ?? [])].sort(
        (a, b) => a.barangay.localeCompare(b.barangay) || a.name.localeCompare(b.name),
      ),
    [lookups],
  );
  const ownerName = (ownerId: number) => lookups?.owners.find((o) => o.id === ownerId)?.fullName ?? '';
  const barangays = [...new Set(farms.map((f) => f.barangay))];
  const prefix = `S${isoDate().slice(2).replace(/-/g, '')}`;
  const addRow = () => {
    const prev = rows[rows.length - 1];
    samples.append({
      ...blankSample(prev, rows.length + 1),
      sampleId: `${prefix}-${String(rows.length + 1).padStart(2, '0')}`,
    } as any);
  };
  // The first row gets a suggested sample ID too.
  const firstId = rows[0]?.sampleId;
  useEffect(() => {
    if (loaded && !editing && samples.fields.length === 1 && !firstId)
      form.setValue('samples.0.sampleId' as any, `${prefix}-01` as any);
  }, [loaded, editing, samples.fields.length, firstId, form, prefix]);
  if (editing && !existing) return <Loading />;
  return (
    <div>
      <PageHeader
        title={editing ? `Edit ${existing?.code}` : 'New Lab Submission'}
        subtitle="One batch of samples for the laboratory. Each row is one sample; the owner, barangay and GPS come from the farm's record."
        back="/lab-submissions"
      />
      <form
        noValidate
        onSubmit={form.handleSubmit((v) =>
          save.mutate({
            ...v,
            samples: v.samples.map(({ locked: _l, _n, ...x }: any) => x),
          }),
        )}
        className="space-y-4"
      >
        <Card>
          <CardHeader title="Request details" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
            <Field label="Purpose *" error={err(e, 'purpose')}>
              <Select {...form.register('purpose')}>
                {LAB_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {LAB_PURPOSE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Examination requested *" error={err(e, 'examination')} className="lg:col-span-2">
              <Input {...form.register('examination')} list="lab-exams" aria-invalid={!!e.examination} />
              <datalist id="lab-exams">
                {LAB_TEST_METHODS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Laboratory *" error={err(e, 'laboratory')} className="lg:col-span-2">
              <Input {...form.register('laboratory')} aria-invalid={!!e.laboratory} />
            </Field>
            <Field label="Date submitted" error={err(e, 'submittedAt')} hint="Leave blank if not sent yet">
              <Input type="date" max={isoDate()} {...form.register('submittedAt')} />
            </Field>
            <Field label="Submitted by" error={err(e, 'submittedBy')}>
              <Input {...form.register('submittedBy')} />
            </Field>
            <Field label="Noted by" error={err(e, 'notedBy')}>
              <Input {...form.register('notedBy')} />
            </Field>
            <Field label="Request ID / accession no." hint="Given by the laboratory (optional)">
              <div className="grid grid-cols-2 gap-2">
                <Input {...form.register('requestId')} placeholder="Request ID" aria-label="Request ID" />
                <Input
                  {...form.register('accessionNo')}
                  placeholder="Accession no."
                  aria-label="Accession no."
                />
              </div>
            </Field>
            <Field label="Remarks" error={err(e, 'remarks')} className="sm:col-span-2 lg:col-span-3">
              <Textarea rows={2} {...form.register('remarks')} />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader
            title={`Samples (${rows.length})`}
            actions={
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                <Plus /> Add sample
              </Button>
            }
          />
          {e.samples?.message && (
            <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-[14px] text-red-700">
              {e.samples.message}
            </p>
          )}
          <ol className="divide-y divide-slate-100">
            {samples.fields.map((f, i) => {
              const r = rows[i] ?? {};
              const farm = farms.find((x) => String(x.id) === String(r.farmId));
              const species = speciesOnFarm(lookups, r.farmId);
              const se = e.samples?.[i] ?? {};
              const reg = (k: string, o?: object) => form.register(`samples.${i}.${k}` as any, o);
              const set = (k: string, v: unknown) =>
                form.setValue(`samples.${i}.${k}` as any, v as any, { shouldDirty: true });
              const serverErr = (k: string) => se[k]?.message ?? (e as any)[`samples.${i}.${k}`]?.message;
              const locked = !!r.locked;
              return (
                <li key={f.id} aria-label={`Sample ${i + 1}`} className="p-4 sm:px-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                      Sample {i + 1}
                      {locked && (
                        <span className="ml-2 font-normal normal-case text-slate-400">
                          (has a result — only details can be corrected)
                        </span>
                      )}
                    </span>
                    {!locked && rows.length > 1 && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => samples.remove(i)}
                        aria-label={`Remove sample ${i + 1}`}
                      >
                        <Trash2 /> Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                    <Field label="Sample ID *" error={serverErr('sampleId')}>
                      <Input {...reg('sampleId')} aria-invalid={!!serverErr('sampleId')} />
                    </Field>
                    <Field
                      label="Farm (owner) *"
                      error={serverErr('farmId')}
                      className="col-span-2 md:col-span-3 xl:col-span-2"
                    >
                      <Select
                        {...reg('farmId', {
                          onChange: (ev: any) => {
                            // The species follows the farm when it raises only one kind (or the one chosen).
                            const sp = speciesOnFarm(lookups, ev.target.value);
                            if (sp.length && !sp.some((x) => x.species === r.species))
                              set('species', sp[0].species);
                          },
                        })}
                        disabled={
                          locked &&
                          !!r.farmId &&
                          !!rows[i]?.id &&
                          !!existing?.samples.find((x) => x.id === rows[i].id)?.caseId
                        }
                        aria-invalid={!!serverErr('farmId')}
                      >
                        <option value="">Select farm...</option>
                        {barangays.map((b) => (
                          <optgroup key={b} label={b}>
                            {farms
                              .filter((x) => x.barangay === b)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name} — {ownerName(x.ownerId)}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Species *" error={serverErr('species')}>
                      <Select {...reg('species')} aria-invalid={!!serverErr('species')}>
                        {(species.length ? species.map((x) => x.species) : [r.species || 'Swine']).map(
                          (sp) => (
                            <option key={sp} value={sp}>
                              {sp}
                            </option>
                          ),
                        )}
                      </Select>
                    </Field>
                    <Field label="Age" error={serverErr('animalAge')}>
                      <Input {...reg('animalAge')} placeholder="e.g. 3 m" />
                    </Field>
                    <Field label="Sex" error={serverErr('animalSex')}>
                      <Select {...reg('animalSex')}>
                        <option value="">—</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </Select>
                    </Field>
                    <Field label="Live / dead" error={serverErr('condition')}>
                      <Select
                        {...reg('condition', {
                          onChange: (ev: any) => {
                            // A live animal gives blood; a dead one gives organs (spleen, lymph node, liver).
                            set('sampleType', specimenFor(ev.target.value));
                            if (ev.target.value === 'DEAD' && !r.organs)
                              set('organs', 'Spleen, Lymph node, Liver');
                          },
                        })}
                      >
                        {ANIMAL_CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {ANIMAL_CONDITION_LABELS[c]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Collected *" error={serverErr('collectedAt')}>
                      <Input
                        type="date"
                        max={isoDate()}
                        {...reg('collectedAt')}
                        aria-invalid={!!serverErr('collectedAt')}
                      />
                    </Field>
                    <Field
                      label="Specimen *"
                      error={serverErr('sampleType')}
                      className="col-span-2 md:col-span-2 xl:col-span-2"
                    >
                      <Select {...reg('sampleType')}>
                        {SPECIMEN_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {r.sampleType === 'Tissue / Organs' && (
                      <Field
                        label="Organs taken *"
                        error={serverErr('organs')}
                        className="col-span-2 md:col-span-2 xl:col-span-3"
                      >
                        <Input
                          {...reg('organs')}
                          list="sample-organs"
                          placeholder="Spleen, Lymph node, Liver"
                        />
                      </Field>
                    )}
                    {r.condition === 'DEAD' && (
                      <Field label="Hours since death" error={serverErr('hoursSinceDeath')}>
                        <Input type="number" min={0} {...reg('hoursSinceDeath')} />
                      </Field>
                    )}
                    {farm && (
                      <p className="col-span-2 self-end pb-2 text-[13px] text-slate-500 md:col-span-4 xl:col-span-3">
                        {farm.barangay} ·{' '}
                        {farm.lat != null
                          ? `GPS ${farm.lat.toFixed(4)}, ${farm.lng!.toFixed(4)}`
                          : 'No GPS on the farm record'}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <datalist id="sample-organs">
            {SAMPLE_ORGANS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus /> Add sample
            </Button>
            <span className="text-[13px] text-slate-500">
              New rows copy the farm, specimen and date of the row above.
            </span>
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {editing ? 'Save changes' : 'Save submission'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Detail: forms, results, cases ---------------- */

export function LabSubmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, isAdmin, user } = useAuth();
  const lh = useLetterhead();
  const { data: s, isLoading, error } = useApi<LabSubmission>(`/api/lab-submissions/${id}`);
  const [entering, setEntering] = useState(false);
  const [results, setResults] = useState<Record<number, string>>({});
  const [resultDate, setResultDate] = useState(isoDate());
  const [via, setVia] = useState<string>('EMAIL');
  const [voidRow, setVoidRow] = useState<LabSampleRow | null>(null);
  const saveResults = useSave<any, { changed: number }>('POST', `/api/lab-submissions/${id}/results`, {
    success: '',
    label: () => 'Lab results',
    offline: false,
    onDone: (res) => {
      setEntering(false);
      if ('queued' in res) return;
      const pos = live.filter(
        (x) => results[x.id] === 'POSITIVE' && x.result !== 'POSITIVE' && !x.caseId,
      ).length;
      toast.success(
        `${res.changed} result(s) saved.${pos ? ` ${pos} positive: select “Open case” on the sample.` : ''}`,
      );
    },
  });
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !s) return <Loading />;
  const live = s.samples.filter((x) => !x.voided);
  const formData = { ...s, samples: live };
  const startResults = () => {
    setResults(Object.fromEntries(live.map((x) => [x.id, x.result])));
    setResultDate(isoDate());
    setEntering(true);
  };
  const changedCount = live.filter((x) => results[x.id] && results[x.id] !== x.result).length;
  const columns: Column<LabSampleRow>[] = [
    { key: 'n', header: 'No.', sort: false, cell: (r) => live.indexOf(r) + 1 || '—', className: 'w-12' },
    {
      key: 'sampleId',
      header: 'Sample ID',
      cell: (r) => (
        <span className={cn('font-medium', r.voided ? 'text-slate-400 line-through' : 'text-slate-900')}>
          {r.sampleId}
        </span>
      ),
    },
    {
      key: 'ownerName',
      header: 'Owner / farm',
      cell: (r) => (
        <div>
          {r.ownerId ? (
            <Link className="link" to={`/owners/${r.ownerId}`} onClick={(ev) => ev.stopPropagation()}>
              {r.ownerName}
            </Link>
          ) : (
            '—'
          )}
          <div className="text-[13px] text-slate-500">{r.farmName}</div>
        </div>
      ),
    },
    { key: 'barangay', header: 'Barangay' },
    { key: 'species', header: 'Species' },
    {
      key: 'animal',
      header: 'Age / sex',
      sort: false,
      cell: (r) =>
        [
          r.animalAge,
          r.animalSex === 'M' ? 'Male' : r.animalSex === 'F' ? 'Female' : null,
          r.condition === 'DEAD' ? 'Dead' : null,
        ]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    {
      key: 'sampleType',
      header: 'Specimen',
      cell: (r) => (r.organs ? `${r.sampleType} (${r.organs})` : r.sampleType),
    },
    { key: 'collectedAt', header: 'Collected', cell: (r) => fmtDate(r.collectedAt) },
    {
      key: 'result',
      header: 'Result',
      cell: (r) =>
        entering && !r.voided ? (
          <Select
            aria-label={`Result for ${r.sampleId}`}
            value={results[r.id] ?? r.result}
            onChange={(ev) => setResults((x) => ({ ...x, [r.id]: ev.target.value }))}
            className="h-9 min-w-[130px]"
            onClick={(ev) => ev.stopPropagation()}
          >
            {LAB_RESULTS.map((x) => (
              <option key={x} value={x}>
                {titleCase(x)}
              </option>
            ))}
          </Select>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1">
            <LabResultBadge result={r.result} />
            {r.receivedVia && (
              <span className="text-[12px] text-slate-500">
                {RESULT_RECEIVED_LABELS[r.receivedVia as keyof typeof RESULT_RECEIVED_LABELS]}
              </span>
            )}
          </span>
        ),
    },
    {
      key: 'case',
      header: 'Case / Action',
      sort: false,
      cell: (r) =>
        r.voided ? (
          <span className="text-[13px] text-slate-400">Voided: {r.voidReason}</span>
        ) : r.caseId ? (
          <Link className="link" to={`/cases/${r.caseId}`}>
            {r.caseCode}
          </Link>
        ) : r.result === 'POSITIVE' && canEdit ? (
          <Button size="xs" onClick={() => navigate(`/cases/new?fromSample=${r.id}`)}>
            <Siren /> Open case
          </Button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-slate-400">—</span>
            {isAdmin && !entering && (
              <Button size="xs" variant="ghost" onClick={() => setVoidRow(r)}>
                Void
              </Button>
            )}
          </span>
        ),
    },
  ];
  return (
    <div>
      <PageHeader
        title={`${s.code} · ${s.examination}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="blue">{s.purposeLabel}</Badge>
            {s.total} sample(s) · {s.barangays.join(', ') || '—'} <ResultCounts s={s} />
          </span>
        }
        back="/lab-submissions"
        actions={
          <>
            <Button variant="outline" onClick={() => printAnalysisRequest(formData, lh, user?.name)}>
              <Printer /> Analysis Request Form
            </Button>
            <Button variant="outline" onClick={() => printSampleCollection(formData, lh, user?.name)}>
              <ClipboardList /> Sample Collection Form
            </Button>
            {canEdit && (
              <Button variant="outline" onClick={() => navigate(`/lab-submissions/${s.id}/edit`)}>
                <Pencil /> Edit
              </Button>
            )}
          </>
        }
      />
      {s.positiveNoCase > 0 && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800"
        >
          <Siren className="h-4 w-4" />
          <b className="font-semibold">{s.positiveNoCase} positive sample(s)</b> with no disease case yet.
          Select “Open case” on the sample to start the response (the case opens as Active).
        </div>
      )}
      <Card className="mb-4">
        <CardHeader title="Request details" />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 text-[15px] sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
          {(
            [
              ['Laboratory', s.laboratory],
              ['Date submitted', s.submittedAt ? fmtDate(s.submittedAt) : 'Not submitted yet'],
              ['Date collected', dateRange(s.collectedFrom, s.collectedTo)],
              ['Species', s.species.join(', ') || '—'],
              ['Submitted by', s.submittedBy || '—'],
              ['Noted by', s.notedBy || '—'],
              ['Request ID', s.requestId || '—'],
              ['Accession no.', s.accessionNo || '—'],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[13px] font-medium text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-slate-900">{v}</dd>
            </div>
          ))}
          {s.remarks && (
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-[13px] font-medium text-slate-500">Remarks</dt>
              <dd className="mt-0.5 text-slate-900">{s.remarks}</dd>
            </div>
          )}
        </dl>
      </Card>
      <div>
        <Card>
          <CardHeader
            title="Samples and results"
            actions={
              canEdit &&
              (entering ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setResults((x) =>
                        Object.fromEntries(
                          live.map((r) => [
                            r.id,
                            (x[r.id] ?? r.result) === 'PENDING' ? 'NEGATIVE' : (x[r.id] ?? r.result),
                          ]),
                        ),
                      )
                    }
                  >
                    Set all pending to Negative
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEntering(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                live.length > 0 && (
                  <Button size="sm" onClick={startResults}>
                    Enter results
                  </Button>
                )
              ))
            }
          />
          {entering && (
            <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:px-5">
              <Field label="Result date *">
                <Input
                  type="date"
                  max={isoDate()}
                  value={resultDate}
                  onChange={(ev) => setResultDate(ev.target.value)}
                />
              </Field>
              <Field label="Received by">
                <Select value={via} onChange={(ev) => setVia(ev.target.value)}>
                  {RESULT_RECEIVED_VIA.map((v) => (
                    <option key={v} value={v}>
                      {RESULT_RECEIVED_LABELS[v]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                loading={saveResults.isPending}
                disabled={!changedCount}
                onClick={() =>
                  saveResults.mutate({
                    resultDate,
                    receivedVia: via,
                    results: live.map((r) => ({ id: r.id, result: results[r.id] ?? r.result })),
                  })
                }
              >
                Save {changedCount || ''} result{changedCount === 1 ? '' : 's'}
              </Button>
            </div>
          )}
          <DataTable
            columns={columns}
            rows={s.samples}
            rowKey={(r) => r.id}
            pageSize={0}
            sortable={false}
            minWidth={980}
            mobileTitle="sampleId"
            empty="No samples in this batch."
          />
        </Card>
      </div>
      {voidRow && (
        <VoidDialog
          open
          onOpenChange={(o) => !o && setVoidRow(null)}
          url={`/api/lab-submissions/samples/${voidRow.id}/void`}
          what={`sample ${voidRow.sampleId}`}
        />
      )}
    </div>
  );
}

/** Pre-fill for a disease case opened from a positive surveillance sample. */
export function loadSampleForCase(sampleId: number) {
  return api.get<{ sample: LabSampleRow; submission: Omit<LabSubmission, 'samples'> }>(
    `/api/lab-submissions/samples/${sampleId}`,
  );
}
