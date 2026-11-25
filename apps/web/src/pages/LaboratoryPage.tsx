import { useQueryClient } from '@tanstack/react-query';
import { FilePlus2, FlaskConical, Hourglass, PackageOpen, Siren } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BARANGAYS,
  CASE_STATUS_LABELS,
  LAB_RESULTS,
  RESULT_RECEIVED_LABELS,
  RESULT_RECEIVED_VIA,
  fmtDate,
  isoDate,
  titleCase,
  type CaseStatus,
} from '@livestock/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorBox, FilterSelect, MoreFilters, PageHeader, StatCard } from '@/components/page';
import { LabResultBadge } from '@/components/status';
import { Button, Card, Dialog, Field, Input, Select, Tabs, Textarea } from '@/components/ui';
import { LabDialog, type LabEditRecord } from '@/dialogs/surveillance';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { SubmissionsTab } from './LabSubmissionsPages';

/** One sample as the Laboratory page lists it (GET /api/labs). */
interface SampleRow extends LabEditRecord {
  caseId: number | null;
  caseCode?: string | null;
  caseClosed?: boolean;
  submissionId: number | null;
  submissionCode: string | null;
  farmId: number | null;
  species: string | null;
  disease: string | null;
  farmName: string | null;
  barangay: string | null;
  examination: string | null;
  waitingDays: number | null;
  voided?: boolean;
}

type Show = 'waiting' | 'notsent' | 'all' | 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'waiting', label: 'Waiting for Result' },
  { value: 'notsent', label: 'Not Sent Yet' },
  { value: 'POSITIVE', label: 'Positive' },
  { value: 'NEGATIVE', label: 'Negative' },
  { value: 'INCONCLUSIVE', label: 'Inconclusive' },
  { value: 'all', label: 'All Samples' },
];

/**
 * Laboratory (Disease Surveillance): one page for every sample sent for testing.
 * - A sample added on a disease case shows here at once.
 * - Its result is entered here; the case updates by itself (status, history, what the owner sees).
 * - Batches of surveillance samples (Analysis Request + Sample Collection forms) are the second tab.
 */
export default function LaboratoryPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'batches' ? 'batches' : 'samples';
  const setTab = (t: 'samples' | 'batches') =>
    setParams(t === 'samples' ? {} : { tab: t }, { replace: true });
  const { data, isLoading, error } = useApi<SampleRow[]>('/api/labs');
  const [show, setShow] = useState<Show>('waiting');
  const [source, setSource] = useState('');
  const [barangay, setBarangay] = useState('');
  const [result, setResult] = useState<SampleRow | null>(null);
  const [details, setDetails] = useState<SampleRow | null>(null);

  const all = (data ?? []).filter((r) => !r.voided);
  // ?sample=<id> (from a case): open that sample straight away.
  const wanted = Number(params.get('sample')) || null;
  useEffect(() => {
    if (!wanted || !data) return;
    const r = data.find((x) => x.id === wanted);
    const p = new URLSearchParams(params);
    p.delete('sample');
    setParams(p, { replace: true });
    if (!r) return;
    setShow('all');
    if (!canEdit || r.result !== 'PENDING') return;
    if (!r.sentAt && r.caseId) setDetails(r);
    else setResult(r);
  }, [wanted, data, canEdit, params, setParams]);

  const rows = all.filter(
    (r) =>
      (show === 'all' ||
        (show === 'waiting'
          ? r.result === 'PENDING'
          : show === 'notsent'
            ? r.result === 'PENDING' && !r.sentAt
            : r.result === show)) &&
      (!source || (source === 'case' ? !!r.caseId : !r.caseId)) &&
      (!barangay || r.barangay === barangay),
  );
  const waiting = all.filter((r) => r.result === 'PENDING');
  const notSent = waiting.filter((r) => !r.sentAt);
  const positiveNoCase = all.filter((r) => r.result === 'POSITIVE' && !r.caseId);

  const action = (r: SampleRow) => {
    if (!canEdit || r.caseClosed) return null;
    if (r.result === 'PENDING' && !r.sentAt)
      return r.caseId ? (
        <Button size="xs" variant="outline" onClick={() => setDetails(r)}>
          Enter Date Sent
        </Button>
      ) : (
        <Button size="xs" variant="outline" onClick={() => navigate(`/lab-submissions/${r.submissionId}`)}>
          Open Batch
        </Button>
      );
    return (
      <Button size="xs" variant={r.result === 'PENDING' ? 'default' : 'ghost'} onClick={() => setResult(r)}>
        {r.result === 'PENDING' ? 'Enter Result' : 'Change Result'}
      </Button>
    );
  };

  const columns: Column<SampleRow>[] = [
    { key: 'sampleId', header: 'Sample ID', className: 'font-medium text-slate-900' },
    {
      key: 'from',
      header: 'From',
      sort: (r) => r.caseCode ?? r.submissionCode ?? '',
      cell: (r) =>
        r.caseId ? (
          <Link to={`/cases/${r.caseId}`} className="link" onClick={(e) => e.stopPropagation()}>
            Case {r.caseCode}
            {r.disease ? ` · ${r.disease}` : ''}
          </Link>
        ) : r.submissionId ? (
          <Link
            to={`/lab-submissions/${r.submissionId}`}
            className="link"
            onClick={(e) => e.stopPropagation()}
          >
            Batch {r.submissionCode}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'farmName',
      header: 'Farm',
      cell: (r) => (r.farmName ? `${r.farmName}${r.barangay ? ` · ${r.barangay}` : ''}` : '—'),
    },
    {
      key: 'sampleType',
      header: 'Sample / Test',
      cell: (r) =>
        [r.species, r.sampleType, r.testMethod ?? r.examination].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'sentAt',
      header: 'Sent',
      cell: (r) => (r.sentAt ? fmtDate(r.sentAt) : <span className="text-amber-700">Not yet</span>),
    },
    {
      key: 'result',
      header: 'Result',
      sort: (r) => LAB_RESULTS.indexOf(r.result as (typeof LAB_RESULTS)[number]),
      cell: (r) => (
        <span className="inline-flex flex-col">
          <LabResultBadge result={r.result} />
          {r.resultDate && <span className="text-[12px] text-slate-500">{fmtDate(r.resultDate)}</span>}
        </span>
      ),
    },
    {
      key: 'waitingDays',
      header: 'Waiting',
      sort: (r) => r.waitingDays ?? -1,
      cell: (r) => (r.waitingDays == null ? '—' : `${r.waitingDays} day${r.waitingDays === 1 ? '' : 's'}`),
    },
    { key: 'actions', header: '', sort: false, cell: (r) => action(r) },
  ];

  return (
    <div>
      <PageHeader
        title="Laboratory"
        subtitle="Every sample sent for testing, from disease cases and surveillance batches. Enter results here; the case updates by itself."
        actions={
          canEdit && (
            <Button variant="outline" onClick={() => navigate('/lab-submissions/new')}>
              <FilePlus2 /> New Batch Submission
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Waiting for Result"
          value={waiting.length}
          icon={Hourglass}
          tone="orange"
          onClick={() => (setTab('samples'), setShow('waiting'))}
        />
        <StatCard
          label="Not Sent Yet"
          value={notSent.length}
          icon={PackageOpen}
          tone="blue"
          onClick={() => (setTab('samples'), setShow('notsent'))}
        />
        <StatCard
          label="Positive"
          value={all.filter((r) => r.result === 'POSITIVE').length}
          icon={FlaskConical}
          tone="red"
          onClick={() => (setTab('samples'), setShow('POSITIVE'))}
        />
        <StatCard
          label="Positive, No Case Yet"
          value={positiveNoCase.length}
          icon={Siren}
          tone="red"
          onClick={() => (setTab('samples'), setShow('POSITIVE'), setSource('batch'))}
        />
      </div>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'samples', label: `Samples (${waiting.length} waiting)` },
          { id: 'batches', label: 'Batch Submissions' },
        ]}
      />
      {tab === 'batches' ? (
        <SubmissionsTab />
      ) : error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={rows}
            loading={isLoading}
            rowKey={(r) => r.id}
            columns={columns}
            minWidth={1000}
            mobileTitle="sampleId"
            defaultSort={{ key: 'waitingDays', dir: 'desc' }}
            searchText={(r) =>
              `${r.sampleId} ${r.caseCode ?? ''} ${r.submissionCode ?? ''} ${r.farmName ?? ''} ${r.barangay ?? ''} ${r.disease ?? ''} ${r.laboratory ?? ''}`
            }
            searchPlaceholder="Search sample, case, batch or farm..."
            toolbar={
              <>
                <FilterSelect
                  label="Show"
                  value={show}
                  onChange={(v) => setShow((v || 'all') as Show)}
                  options={SHOW_OPTIONS}
                  className="w-full sm:w-52"
                />
                <MoreFilters
                  active={[source, barangay].filter(Boolean).length}
                  onClear={() => (setSource(''), setBarangay(''))}
                >
                  <FilterSelect
                    label="From"
                    value={source}
                    onChange={setSource}
                    options={[
                      { value: 'case', label: 'Disease Cases' },
                      { value: 'batch', label: 'Surveillance Batches' },
                    ]}
                    all="Cases and batches"
                  />
                  <FilterSelect
                    label="Barangay"
                    value={barangay}
                    onChange={setBarangay}
                    options={BARANGAYS}
                    all="All barangays"
                  />
                </MoreFilters>
              </>
            }
            empty={
              show === 'waiting'
                ? 'No sample is waiting for a result. Samples added on a disease case show here.'
                : 'No samples for this selection.'
            }
          />
        </Card>
      )}
      <ResultDialog sample={result} onClose={() => setResult(null)} />
      {details?.caseId && (
        <LabDialog
          open
          onOpenChange={(o) => !o && setDetails(null)}
          caseId={details.caseId}
          code={details.caseCode ?? ''}
          lab={details}
        />
      )}
    </div>
  );
}

/** Enter (or correct) the result of one sample. A case sample updates its case. */
function ResultDialog({ sample, onClose }: { sample: SampleRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [result, setResult] = useState('POSITIVE');
  const [date, setDate] = useState(isoDate());
  const [via, setVia] = useState<string>('EMAIL');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!sample) return;
    setResult(sample.result === 'PENDING' ? '' : sample.result);
    setDate(sample.resultDate ?? isoDate());
    setVia(sample.receivedVia ?? 'EMAIL');
    setRemarks(sample.remarks ?? '');
    setError(null);
  }, [sample]);
  if (!sample) return null;
  const save = async () => {
    if (!result) return setError('Select the result');
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ caseStatus?: CaseStatus | null }>(`/api/labs/${sample.id}/result`, {
        result,
        resultDate: result === 'PENDING' ? '' : date,
        receivedVia: result === 'PENDING' ? '' : via,
        remarks,
      });
      toast.success(
        `Result saved for ${sample.sampleId}.${
          r.caseStatus ? ` Case ${sample.caseCode} is now: ${CASE_STATUS_LABELS[r.caseStatus]}.` : ''
        }`,
      );
      await qc.invalidateQueries();
      onClose();
      if (result === 'POSITIVE' && !sample.caseId)
        toast('Positive sample with no case yet.', {
          action: { label: 'Report Incident', onClick: () => navigate(`/cases/new?fromSample=${sample.id}`) },
        });
    } catch (x) {
      const fe = x instanceof ApiError ? x.fieldErrors : undefined;
      setError(fe ? Object.values(fe)[0][0] : x instanceof Error ? x.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Result for ${sample.sampleId}`}
      size="sm"
      guardChanges={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save Result
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[14px] text-slate-600">
          {sample.caseId
            ? `Sample of case ${sample.caseCode}${sample.disease ? ` (${sample.disease})` : ''}. The case status and what the owner sees update by themselves.`
            : `Sample sent in batch ${sample.submissionCode}.`}
          {sample.sentAt
            ? ` Sent ${fmtDate(sample.sentAt)}${sample.laboratory ? ` to ${sample.laboratory}` : ''}.`
            : ''}
        </p>
        <Field label="Result *" error={error ?? undefined}>
          <Select value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">Select…</option>
            {LAB_RESULTS.map((r) => (
              <option key={r} value={r}>
                {r === 'PENDING' ? 'Pending (no result yet)' : titleCase(r)}
              </option>
            ))}
          </Select>
        </Field>
        {result && result !== 'PENDING' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Result Date *">
              <Input
                type="date"
                value={date}
                min={sample.sentAt ?? sample.collectedAt ?? undefined}
                max={isoDate()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Result Received By">
              <Select value={via} onChange={(e) => setVia(e.target.value)}>
                {RESULT_RECEIVED_VIA.map((v) => (
                  <option key={v} value={v}>
                    {RESULT_RECEIVED_LABELS[v]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Remarks / Result Details">
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
