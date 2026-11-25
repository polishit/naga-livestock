import {
  Bell,
  Building2,
  Phone,
  CalendarDays,
  FileText,
  KeyRound,
  LogOut,
  Megaphone,
  Plus,
  Printer,
  Send,
  Settings,
  Stethoscope,
  Syringe,
  User,
  Map as MapIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useWatch } from 'react-hook-form';
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  BARANGAYS,
  ID_TYPES,
  ID_TYPE_LABELS,
  type IdType,
  CASE_STAGE_HELP,
  CASE_STAGE_LABELS,
  CLINICAL_SIGNS,
  CLINICAL_SIGN_LABELS,
  OPTIONAL_NOTIFICATION_TYPES,
  OWNER_VACC_STATUS_LABELS,
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  SPECIES,
  diseaseReportSchema,
  fmtDate,
  isoDate,
  ownerProfileSchema,
  ownerVaccinationSchema,
  reportReplySchema,
  serviceRequestSchema,
  signupSchema,
  type CaseStage,
  type ClinicalSign,
  type OwnerVaccStatus,
  type ServiceRequestStatus,
  type SignupStatus,
} from '@livestock/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { PhotoPicker, err, useZodForm } from '@/components/forms';
import { ErrorBox, Loading } from '@/components/page';
import { Badge, Button, Checkbox, Field, Input, Select, Tabs, Textarea } from '@/components/ui';
import { ChangePasswordDialog } from '@/pages/AccountPages';
import { IdPhotoInput } from '@/components/IdPhotoInput';
import { MessageThread, type ThreadItem } from '@/components/MessageThread';
import { OfficeContact, VerificationSteps, useHome } from './OwnerApp';
import {
  LocateButton,
  Panel,
  RowLink,
  STAGE_TONE,
  Screen,
  SectionTitle,
  big,
  uploadAll,
  useSubmit,
  when,
  type Fix,
} from './kit';

/* =====================================================================================
 * Disease reports
 * ===================================================================================== */

interface ReportRow {
  key: string;
  code: string;
  farmName: string;
  species: string;
  affected: number;
  date: string;
  stage: CaseStage;
  stageLabel: string;
  caseCode: string | null;
}
interface Photo {
  key: string;
  url: string;
}
interface ReportDetail {
  stage: CaseStage;
  stageLabel: string;
  report: null | {
    id: number;
    code: string;
    farmName: string;
    species: string;
    symptoms: string;
    signs: ClinicalSign[];
    affected: number;
    deaths: number;
    observedAt: string;
    createdAt: string;
    photos: Photo[];
    status: string;
    rejectReason: string | null;
    messages: { id: number; fromOwner: boolean; by: string; text: string; photos: Photo[]; at: string }[];
  };
  case: null | {
    code: string;
    disease: string;
    species: string;
    farmName: string;
    reportedAt: string;
    assignedTo: string | null;
    closureOutcome: string | null;
    labResults: {
      sampleId: string;
      sampleType: string | null;
      test: string | null;
      collectedAt: string | null;
      result: string;
      resultDate: string | null;
    }[];
    actions: { type: string; status: string; date: string; endDate: string | null; heads: number | null }[];
  };
}

export function ReportRoutes() {
  return (
    <Routes>
      <Route index element={<ReportList />} />
      <Route path="new" element={<ReportForm />} />
      <Route path=":key" element={<ReportScreen />} />
    </Routes>
  );
}

function ReportList() {
  const { data, isLoading, error } = useApi<ReportRow[]>('/api/my/reports');
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return (
    <Screen title="Disease Reports">
      <Button asChild className={cn(big, 'w-full bg-red-700 hover:bg-red-800')}>
        <NavLink to="/app/reports/new">
          <Stethoscope /> Report Sick or Dead Animals
        </NavLink>
      </Button>
      {data.length === 0 && (
        <Panel>
          <p className="text-[15px] text-slate-600">
            You have not sent any report. If an animal is sick or dies suddenly, report it here right away.
            The City Veterinary Office will reply in this app.
          </p>
        </Panel>
      )}
      <div className="space-y-2">
        {data.map((r) => (
          <RowLink
            key={r.key}
            to={`/app/reports/${r.key}`}
            icon={<Stethoscope className="h-5 w-5" />}
            title={`${r.affected} ${r.species} · ${r.farmName}`}
            sub={`${r.code} · ${fmtDate(r.date)}`}
            right={<Badge tone={STAGE_TONE[r.stage]}>{r.stageLabel}</Badge>}
          />
        ))}
      </div>
    </Screen>
  );
}

function ReportForm() {
  const navigate = useNavigate();
  const home = useHome();
  const farms = (home.data?.farms ?? []).filter((f) => f.status === 'VERIFIED');
  const form = useZodForm(diseaseReportSchema, {
    farmId: '',
    species: '',
    signs: [],
    symptoms: '',
    affected: '',
    deaths: 0,
    observedAt: isoDate(),
    photoKeys: [],
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gps, setGps] = useState<'asking' | 'on' | 'off'>('asking');
  const { busy, run } = useSubmit();
  const e = form.formState.errors;
  const farmId = Number(form.watch('farmId')) || 0;
  const farm = farms.find((f) => f.id === farmId);
  const signs = (form.watch('signs') as ClinicalSign[]) ?? [];
  // One farm: choose it for the owner.
  useEffect(() => {
    if (farms.length === 1 && !farmId) form.setValue('farmId', farms[0].id);
  }, [farms, farmId, form]);
  // The phone's location is read quietly when the form opens; without it the farm's location is used.
  useEffect(() => {
    if (!navigator.geolocation) return setGps('off');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
        setGps('on');
      },
      () => setGps('off'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  if (home.isLoading) return <Loading />;
  if (!farms.length)
    return (
      <Screen title="Report Sick Animals" back="/app/reports">
        <Panel tone="amber">
          <p className="text-[15px]">
            You need a verified farm before you can send a report in the app. If your animals are sick now,
            call or visit the City Veterinary Office.
          </p>
        </Panel>
      </Screen>
    );

  return (
    <Screen title="Report Sick Animals" back="/app/reports">
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (v) => {
          let id = 0;
          const ok = await run(
            form,
            async () => {
              const photoKeys = await uploadAll(files, 'reports');
              const r = await api.post<{ id: number }>('/api/my/reports', {
                ...v,
                photoKeys,
                ...(fix ? { lat: fix.lat, lng: fix.lng, gpsAccuracy: fix.accuracy } : {}),
              });
              id = r.id;
            },
            'Report sent to the City Veterinary Office.',
          );
          if (ok) navigate(`/app/reports/${id}`, { replace: true });
        })}
      >
        <Panel className="space-y-4">
          <Field label="Which farm? *" error={err(e, 'farmId')}>
            <Select className={big} {...form.register('farmId')}>
              <option value="">Select…</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Which animals? *" error={err(e, 'species')}>
            <Select className={big} {...form.register('species')}>
              <option value="">Select…</option>
              {(farm?.livestock.length ? farm.livestock.map((l) => l.species) : [...SPECIES]).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="How many are sick? *" error={err(e, 'affected')}>
              <Input className={big} inputMode="numeric" {...form.register('affected')} />
            </Field>
            <Field label="How many died?" error={err(e, 'deaths')}>
              <Input className={big} inputMode="numeric" {...form.register('deaths')} />
            </Field>
          </div>
          <Field label="When did you first see it?" error={err(e, 'observedAt')}>
            <Input className={big} type="date" max={isoDate()} {...form.register('observedAt')} />
          </Field>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="text-[17px] font-semibold">What do you see?</h2>
          <div className="grid grid-cols-1 gap-1">
            {CLINICAL_SIGNS.map((s) => (
              <div
                key={s}
                className="flex min-h-[44px] items-center [&_input]:h-5 [&_input]:w-5 [&_label]:text-[16px]"
              >
                <Checkbox
                  label={CLINICAL_SIGN_LABELS[s]}
                  checked={signs.includes(s)}
                  onChange={(c) =>
                    form.setValue('signs', c ? [...signs, s] : signs.filter((x) => x !== s), {
                      shouldDirty: true,
                    })
                  }
                />
              </div>
            ))}
          </div>
          <Field label="Describe It in Your Own Words *" error={err(e, 'symptoms')}>
            <Textarea
              rows={3}
              {...form.register('symptoms')}
              placeholder="For example: three pigs stopped eating two days ago and have red skin"
            />
          </Field>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="text-[17px] font-semibold">Photos</h2>
          <p className="text-[14px] text-slate-600">
            Photos of the sick animals help the office decide faster.
          </p>
          <PhotoPicker files={files} onFilesChange={setFiles} />
        </Panel>

        <Panel className="space-y-2">
          <h2 className="text-[17px] font-semibold">Location</h2>
          {gps === 'on' && fix ? (
            <p className="text-[15px] text-slate-700">
              Your phone's location will be sent with the report (accurate to about {fix.accuracy} m).
            </p>
          ) : (
            <>
              <p className="text-[15px] text-slate-700">
                {gps === 'asking'
                  ? 'Getting your location…'
                  : "Your phone's location is off. The farm's registered location will be used instead."}
              </p>
              {gps === 'off' && (
                <LocateButton label="Try My Location Again" onFix={(f) => (setFix(f), setGps('on'))} />
              )}
            </>
          )}
        </Panel>

        <Button type="submit" loading={busy} className={cn(big, 'w-full bg-red-700 hover:bg-red-800')}>
          <Send /> Send Report
        </Button>
        <p className="text-[14px] text-slate-500">
          After sending, keep the sick animals away from the others. Do not move, sell or slaughter them until
          the office replies.
        </p>
      </form>
    </Screen>
  );
}

/** The seven stages as a simple track; the current one is highlighted. */
function StageTrack({ stage }: { stage: CaseStage }) {
  const path: CaseStage[] =
    stage === 'REJECTED'
      ? ['REPORTED', 'REJECTED']
      : ['REPORTED', 'UNDER_INVESTIGATION', 'CONFIRMED', 'RESOLVED', 'CLOSED'];
  const at = stage === 'INFO_REQUESTED' ? 0 : path.indexOf(stage);
  return (
    <ol className="space-y-2">
      {path.map((s, i) => (
        <li key={s} className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
              i < at
                ? 'bg-brand-dark text-white'
                : i === at
                  ? 'bg-brand-dark text-white ring-4 ring-brand/30'
                  : 'bg-slate-200 text-slate-500',
            )}
          >
            {i + 1}
          </span>
          <span
            className={cn(
              'text-[15px]',
              i === at ? 'font-semibold text-slate-900' : i < at ? 'text-slate-700' : 'text-slate-400',
            )}
          >
            {CASE_STAGE_LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

const RESULT_TONE: Record<string, 'red' | 'green' | 'amber' | 'slate'> = {
  POSITIVE: 'red',
  NEGATIVE: 'green',
  PENDING: 'amber',
};
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

function ReportScreen() {
  const { key } = useParams();
  const { data, isLoading, error } = useApi<ReportDetail>(`/api/my/reports/${key}`, {
    refetchInterval: 60_000,
  });
  const form = useZodForm(reportReplySchema, { text: '', photoKeys: [] });
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useSubmit();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const { report: r, case: c, stage } = data;
  const canReply = !!r && ['REPORTED', 'INFO_REQUESTED'].includes(r.status);
  return (
    <Screen title={r?.code ?? c?.code ?? 'Report'} back="/app/reports">
      <Panel tone={stage === 'INFO_REQUESTED' ? 'amber' : stage === 'CONFIRMED' ? 'red' : undefined}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] text-slate-600">Status</span>
          <Badge tone={STAGE_TONE[stage]}>{CASE_STAGE_LABELS[stage]}</Badge>
        </div>
        <p className="mt-2 text-[15px]">{CASE_STAGE_HELP[stage]}</p>
        {stage === 'REJECTED' && r?.rejectReason && (
          <p className="mt-2 text-[15px]">
            <b>Reason:</b> {r.rejectReason}
          </p>
        )}
        <div className="mt-4">
          <StageTrack stage={stage} />
        </div>
      </Panel>

      {c && (
        <Panel>
          <h2 className="text-[17px] font-semibold">Case {c.code}</h2>
          <dl className="mt-2 space-y-1 text-[15px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Suspected disease</dt>
              <dd className="text-right font-medium">{c.disease}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Farm</dt>
              <dd className="text-right">{c.farmName}</dd>
            </div>
            {c.assignedTo && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Handled by</dt>
                <dd className="text-right">{c.assignedTo}</dd>
              </div>
            )}
          </dl>
          <h3 className="mt-4 text-[15px] font-semibold">Laboratory Results</h3>
          {c.labResults.length === 0 ? (
            <p className="text-[15px] text-slate-500">No sample taken yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100">
              {c.labResults.map((l) => (
                <li key={l.sampleId} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[15px]">
                    {l.sampleType ?? 'Sample'}
                    {l.test ? ` · ${l.test}` : ''}
                    <span className="block text-[13px] text-slate-500">
                      {l.collectedAt ? `Taken ${fmtDate(l.collectedAt)}` : l.sampleId}
                      {l.resultDate ? ` · result ${fmtDate(l.resultDate)}` : ''}
                    </span>
                  </span>
                  <Badge tone={RESULT_TONE[l.result] ?? 'slate'}>
                    {l.result === 'PENDING' ? 'Waiting' : title(l.result)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {c.actions.length > 0 && (
            <>
              <h3 className="mt-4 text-[15px] font-semibold">Actions by the Office</h3>
              <ul className="mt-1 space-y-1 text-[15px]">
                {c.actions.map((a, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{title(a.type)}</span>
                    <span className="text-slate-500">
                      {title(a.status)} · {fmtDate(a.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      {r && (
        <Panel>
          <h2 className="text-[17px] font-semibold">What You Reported</h2>
          <p className="mt-1 text-[14px] text-slate-500">
            {r.farmName} · sent {when(r.createdAt)}
          </p>
          <p className="mt-2 text-[15px]">
            <b>{r.affected}</b> {r.species} sick{r.deaths ? `, ${r.deaths} died` : ''}. First seen{' '}
            {fmtDate(r.observedAt)}.
          </p>
          {r.signs.length > 0 && (
            <p className="mt-1 text-[15px] text-slate-700">
              {r.signs.map((s) => CLINICAL_SIGN_LABELS[s]).join(', ')}
            </p>
          )}
          <p className="mt-2 whitespace-pre-line text-[15px]">{r.symptoms}</p>
          {r.photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.photos.map((p) => (
                <a key={p.key} href={p.url} target="_blank" rel="noreferrer">
                  <img
                    src={p.url}
                    alt="Report photo"
                    className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                  />
                </a>
              ))}
            </div>
          )}
        </Panel>
      )}

      {r && (r.messages.length > 0 || canReply) && (
        <Panel>
          <h2 className="text-[17px] font-semibold">Messages</h2>
          <div className="mt-2 space-y-2">
            {r.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5',
                  m.fromOwner ? 'ml-auto bg-brand-light' : 'bg-slate-100',
                )}
              >
                <div className="text-[12px] text-slate-500">
                  {m.by} · {when(m.at)}
                </div>
                <p className="whitespace-pre-line text-[15px]">{m.text}</p>
                {m.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.photos.map((p) => (
                      <a key={p.key} href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt="Photo" className="h-16 w-16 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {canReply && (
            <form
              noValidate
              className="mt-3 space-y-3"
              onSubmit={form.handleSubmit(async (v) => {
                const ok = await run(
                  form,
                  async () =>
                    api.post(`/api/my/reports/${r.id}/reply`, {
                      ...v,
                      photoKeys: await uploadAll(files, 'reports'),
                    }),
                  'Reply sent.',
                );
                if (ok) {
                  form.reset({ text: '', photoKeys: [] });
                  setFiles([]);
                }
              })}
            >
              <Field
                label={stage === 'INFO_REQUESTED' ? 'Your reply *' : 'Add more information'}
                error={err(form.formState.errors, 'text')}
              >
                <Textarea rows={3} {...form.register('text')} />
              </Field>
              <PhotoPicker files={files} onFilesChange={setFiles} />
              <Button type="submit" loading={busy} className={cn(big, 'w-full')}>
                <Send /> Send
              </Button>
            </form>
          )}
        </Panel>
      )}
    </Screen>
  );
}

/* =====================================================================================
 * Messages and announcements
 * ===================================================================================== */

/** Messages with the City Veterinary Office: the conversation and the owner's transactions. */
/**
 * Messages with the office, organised in two parts (panel revision): the chat itself, and the updates
 * on what the owner sent (registrations, reports, requests) in their own list, beside the chat on a
 * computer and in a second tab on a phone.
 */
export function MessagesScreen() {
  const home = useHome();
  const { data, isLoading, error, refetch } = useApi<{ items: ThreadItem[] }>('/api/my/messages', {
    refetchInterval: 30_000,
  });
  const [view, setView] = useState<'chat' | 'updates'>('chat');
  const qc = useQueryClient();
  // Opening the thread marks it read: refresh the badge.
  useEffect(() => {
    if (data) void qc.invalidateQueries({ queryKey: ['/api/my/home'] });
  }, [data, qc]);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const chat = data.items.filter((i) => i.kind === 'message');
  const updates = data.items
    .filter((i): i is Extract<ThreadItem, { kind: 'event' }> => i.kind === 'event')
    .slice()
    .reverse();
  const office = home.data?.office;
  const updatesList = (
    <div className="space-y-2">
      {updates.length === 0 && (
        <p className="py-6 text-center text-[15px] text-slate-500">
          Nothing yet. What you send the office (registrations, reports, requests) and its answers show here.
        </p>
      )}
      {updates.map((u) => (
        <div
          key={u.key}
          className={cn(
            'rounded-xl border bg-white p-3',
            u.side === 'office' ? 'border-l-4 border-l-brand-strong border-slate-200' : 'border-slate-200',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <b className="text-[15px] leading-snug text-slate-900">{u.title}</b>
            <span className="shrink-0 text-[12px] text-slate-500">{fmtDate(u.at)}</span>
          </div>
          {u.body && <p className="mt-0.5 text-[14px] text-slate-600">{u.body}</p>}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-slate-500">
              {u.side === 'office' ? 'From the office' : 'You sent'}
            </span>
            {u.link && (
              <NavLink to={u.link} className="text-[13px] font-medium text-brand-dark underline">
                Open
              </NavLink>
            )}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <Screen title="Messages" wide sub="Chat with the City Veterinary Office, and updates on what you sent">
      {/* Phones: one part at a time */}
      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 lg:hidden" role="tablist">
        {(['chat', 'updates'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              'h-11 rounded-lg text-[15px] font-medium',
              view === v ? 'bg-white text-brand-dark shadow-sm' : 'text-slate-600',
            )}
          >
            {v === 'chat' ? 'Chat' : `Updates${updates.length ? ` (${updates.length})` : ''}`}
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <section
          aria-label="Chat with the office"
          className={cn(
            'flex h-[calc(100dvh-290px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100dvh-200px)]',
            view !== 'chat' && 'max-lg:hidden',
          )}
        >
          <header className="flex items-center gap-3 border-b border-slate-200 bg-brand-dark px-4 py-3 text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-[16px]">{office?.name ?? 'City Veterinary Office'}</b>
              <span className="block truncate text-[13px] text-white/80">Replies during office hours</span>
            </span>
            {office?.contact && (
              <a
                href={`tel:${office.contact.replace(/[^\d+]/g, '')}`}
                aria-label={`Call the office, ${office.contact}`}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15"
              >
                <Phone className="h-5 w-5" />
              </a>
            )}
          </header>
          <div className="flex min-h-0 flex-1 flex-col bg-slate-50 px-2">
            <MessageThread
              big
              me="owner"
              items={chat}
              onSend={async (text, files) => {
                try {
                  const photoKeys = files.length ? await uploadAll(files, 'messages') : [];
                  await api.post('/api/my/messages', { text, photoKeys });
                  await refetch();
                  return true;
                } catch (x) {
                  toast.error(x instanceof Error ? x.message : 'Could not send. Try again.');
                  return false;
                }
              }}
            />
          </div>
        </section>
        <aside
          aria-label="Updates on what you sent"
          className={cn('space-y-3', view !== 'updates' && 'max-lg:hidden')}
        >
          <SectionTitle className="mb-0 hidden lg:block">Updates on What You Sent</SectionTitle>
          {updatesList}
          {office?.contact && (
            <p className="text-[13px] text-slate-500">
              For an emergency (sick or dying animals), call {office.contact}.
            </p>
          )}
        </aside>
      </div>
    </Screen>
  );
}

/** The office's latest announcements, on the home screen. */
export function AnnouncementsSection() {
  const anns =
    useApi<{ id: number; code: string; title: string; body: string; publishedAt: string }[]>(
      '/api/my/announcements',
    );
  const [all, setAll] = useState(false);
  if (!anns.data?.length) return null;
  const list = all ? anns.data : anns.data.slice(0, 2);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionTitle className="mb-0">Announcements</SectionTitle>
        {anns.data.length > 2 && (
          <button
            type="button"
            className="text-[14px] font-medium text-brand-dark underline"
            onClick={() => setAll(!all)}
          >
            {all ? 'Show Less' : `See All (${anns.data.length})`}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <Panel key={a.id}>
            <div className="flex items-start gap-3">
              <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-brand-dark" />
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold">{a.title}</h3>
                <p className="text-[12px] text-slate-500">
                  City Veterinary Office · {fmtDate(a.publishedAt)}
                </p>
                <p className={cn('mt-1.5 whitespace-pre-line text-[15px]', !all && 'line-clamp-4')}>
                  {a.body}
                </p>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================================
 * Vaccination and services
 * ===================================================================================== */

interface VaccData {
  farms: { id: number; name: string; livestock: { species: string; count: number }[] }[];
  activities: {
    id: number;
    code: string;
    title: string;
    vaccine: string | null;
    species: string;
    barangay: string;
    date: string;
    time: string | null;
    venue: string | null;
    notes: string | null;
    status: string;
    mySignups: { id: number; farmId: number; species: string; heads: number }[];
  }[];
  signups: {
    id: number;
    title: string;
    date: string;
    farmName: string;
    species: string;
    heads: number;
    status: SignupStatus;
    activityStatus: string;
  }[];
  submitted: {
    id: number;
    farmName: string;
    species: string;
    vaccine: string;
    date: string;
    heads: number;
    status: OwnerVaccStatus;
    reason: string | null;
  }[];
  records: {
    id: number;
    date: string;
    service: string;
    product: string | null;
    species: string;
    heads: number;
    farmName: string;
    nextDate: string | null;
  }[];
  requests: {
    id: number;
    code: string;
    farmName: string;
    serviceLabel: string;
    status: ServiceRequestStatus;
    scheduledDate: string | null;
    response: string | null;
    createdAt: string;
  }[];
}

export function VaccinationScreen() {
  const { data, isLoading, error } = useApi<VaccData>('/api/my/vaccination');
  const [tab, setTab] = useState<'schedule' | 'records' | 'requests'>('schedule');
  const [open, setOpen] = useState<
    null | { kind: 'signup'; activityId: number } | { kind: 'submit' } | { kind: 'request' }
  >(null);
  const { busy, run } = useSubmit();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const noFarm = data.farms.length === 0;
  return (
    <Screen title="Vaccination & Services" back="/app">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'schedule', label: 'Schedule' },
          { id: 'records', label: 'My Records' },
          { id: 'requests', label: 'Requests' },
        ]}
      />
      {noFarm && (
        <Panel tone="amber">
          <p className="text-[15px]">You need a verified farm to sign up or send records.</p>
        </Panel>
      )}
      {tab === 'schedule' && (
        <div className="space-y-3">
          {data.activities.length === 0 && (
            <p className="text-[15px] text-slate-500">
              No vaccination activity is scheduled for your barangay.
            </p>
          )}
          {data.activities.map((a) => (
            <Panel key={a.id}>
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-6 w-6 shrink-0 text-brand-dark" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-semibold">{a.title}</h2>
                  <p className="text-[15px]">
                    {fmtDate(a.date)}
                    {a.time ? ` · ${a.time}` : ''}
                  </p>
                  <p className="text-[14px] text-slate-600">
                    {a.venue ? `${a.venue} · ` : ''}
                    {a.barangay === 'ALL' ? 'All barangays' : a.barangay} · for{' '}
                    {a.species === 'All' ? 'all livestock' : a.species}
                    {a.vaccine ? ` · ${a.vaccine}` : ''}
                  </p>
                  {a.notes && (
                    <p className="mt-1 whitespace-pre-line text-[14px] text-slate-600">{a.notes}</p>
                  )}
                  {a.mySignups.map((s) => (
                    <p
                      key={s.id}
                      className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-brand-light px-3 py-2 text-[15px]"
                    >
                      <span>
                        You signed up <b>{s.heads}</b> {s.species}
                      </span>
                      <button
                        type="button"
                        className="text-[14px] font-medium text-red-700 underline"
                        disabled={busy}
                        onClick={() =>
                          run(null, () => api.post(`/api/my/signups/${s.id}/cancel`), 'Sign-up cancelled.')
                        }
                      >
                        Cancel
                      </button>
                    </p>
                  ))}
                  {!noFarm && a.status === 'SCHEDULED' && (
                    <Button
                      className={cn(big, 'mt-3 w-full')}
                      onClick={() => setOpen({ kind: 'signup', activityId: a.id })}
                    >
                      <Syringe /> {a.mySignups.length ? 'Sign Up More Animals' : 'Sign Up My Animals'}
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
          {open?.kind === 'signup' && (
            <SignupForm data={data} activityId={open.activityId} onDone={() => setOpen(null)} />
          )}
        </div>
      )}
      {tab === 'records' && (
        <div className="space-y-3">
          {!noFarm && open?.kind !== 'submit' && (
            <Button
              variant="outline"
              className={cn(big, 'w-full')}
              onClick={() => setOpen({ kind: 'submit' })}
            >
              <Plus /> Add a Vaccination Given by a Private Vet
            </Button>
          )}
          {open?.kind === 'submit' && <OwnerVaccForm data={data} onDone={() => setOpen(null)} />}
          {data.submitted.map((v) => (
            <Panel key={`s${v.id}`} tone={v.status === 'SUBMITTED' ? 'amber' : undefined}>
              <div className="flex items-center justify-between gap-2">
                <b className="text-[16px]">{v.vaccine}</b>
                <Badge
                  tone={v.status === 'VERIFIED' ? 'green' : v.status === 'SUBMITTED' ? 'amber' : 'slate'}
                >
                  {OWNER_VACC_STATUS_LABELS[v.status]}
                </Badge>
              </div>
              <p className="text-[14px] text-slate-600">
                {fmtDate(v.date)} · {v.heads} {v.species} · {v.farmName} · sent by you
              </p>
              {v.status === 'REJECTED' && v.reason && <p className="mt-1 text-[14px]">Reason: {v.reason}</p>}
            </Panel>
          ))}
          <h2 className="pt-1 text-[17px] font-semibold">Official Records</h2>
          {data.records.length === 0 && <p className="text-[15px] text-slate-500">None yet.</p>}
          {data.records.map((v) => (
            <Panel key={v.id}>
              <b className="text-[16px]">
                {v.service}
                {v.product ? `: ${v.product}` : ''}
              </b>
              <p className="text-[14px] text-slate-600">
                {fmtDate(v.date)} · {v.heads} {v.species} · {v.farmName}
                {v.nextDate ? ` · next on ${fmtDate(v.nextDate)}` : ''}
              </p>
            </Panel>
          ))}
        </div>
      )}
      {tab === 'requests' && (
        <div className="space-y-3">
          {!noFarm && open?.kind !== 'request' && (
            <Button className={cn(big, 'w-full')} onClick={() => setOpen({ kind: 'request' })}>
              <Plus /> Request a Service
            </Button>
          )}
          {open?.kind === 'request' && <ServiceRequestForm data={data} onDone={() => setOpen(null)} />}
          {data.requests.length === 0 && (
            <p className="text-[15px] text-slate-500">You have not requested any service.</p>
          )}
          {data.requests.map((r) => (
            <Panel key={r.id}>
              <div className="flex items-center justify-between gap-2">
                <b className="text-[16px]">{r.serviceLabel}</b>
                <Badge
                  tone={
                    r.status === 'DONE'
                      ? 'green'
                      : r.status === 'SCHEDULED'
                        ? 'blue'
                        : r.status === 'DECLINED'
                          ? 'slate'
                          : 'amber'
                  }
                >
                  {SERVICE_REQUEST_STATUS_LABELS[r.status]}
                </Badge>
              </div>
              <p className="text-[14px] text-slate-600">
                {r.code} · {r.farmName} · asked {fmtDate(r.createdAt)}
                {r.scheduledDate ? ` · scheduled ${fmtDate(r.scheduledDate)}` : ''}
              </p>
              {r.response && <p className="mt-1 text-[14px]">Office: {r.response}</p>}
            </Panel>
          ))}
        </div>
      )}
    </Screen>
  );
}

function FarmAndSpecies({ data, form }: { data: VaccData; form: ReturnType<typeof useZodForm> }) {
  const e = form.formState.errors;
  // useWatch re-renders this component itself when the farm changes.
  const farmId = Number(useWatch({ control: form.control, name: 'farmId' })) || 0;
  const farm = data.farms.find((f) => f.id === farmId);
  useEffect(() => {
    if (data.farms.length === 1 && !farmId) form.setValue('farmId', data.farms[0].id);
  }, [data.farms, farmId, form]);
  return (
    <>
      <Field label="Farm *" error={err(e, 'farmId')}>
        <Select className={big} {...form.register('farmId')}>
          <option value="">Select…</option>
          {data.farms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Livestock *" error={err(e, 'species')}>
        <Select className={big} {...form.register('species')}>
          <option value="">Select…</option>
          {(farm?.livestock ?? []).map((l) => (
            <option key={l.species} value={l.species}>
              {l.species} ({l.count})
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

function SignupForm({
  data,
  activityId,
  onDone,
}: {
  data: VaccData;
  activityId: number;
  onDone: () => void;
}) {
  const form = useZodForm(signupSchema, { farmId: '', species: '', heads: '' });
  const { busy, run } = useSubmit();
  const a = data.activities.find((x) => x.id === activityId);
  return (
    <Panel tone="blue">
      <h2 className="text-[17px] font-semibold">Sign up for {a?.title}</h2>
      <form
        noValidate
        className="mt-3 space-y-3"
        onSubmit={form.handleSubmit(async (v) => {
          if (
            await run(
              form,
              () => api.post(`/api/my/activities/${activityId}/signup`, v),
              'You are signed up.',
            )
          )
            onDone();
        })}
      >
        <FarmAndSpecies data={data} form={form} />
        <Field label="How many head? *" error={err(form.formState.errors, 'heads')}>
          <Input className={big} inputMode="numeric" {...form.register('heads')} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={big} onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} className={big}>
            Sign Up
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function OwnerVaccForm({ data, onDone }: { data: VaccData; onDone: () => void }) {
  const form = useZodForm(ownerVaccinationSchema, {
    farmId: '',
    species: '',
    vaccine: '',
    date: isoDate(),
    heads: '',
    givenBy: '',
    proofKeys: [],
  });
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useSubmit();
  const e = form.formState.errors;
  return (
    <Panel tone="blue">
      <h2 className="text-[17px] font-semibold">Vaccination by a Private Vet</h2>
      <p className="text-[14px] text-slate-600">
        The office checks it before it goes on your official record.
      </p>
      <form
        noValidate
        className="mt-3 space-y-3"
        onSubmit={form.handleSubmit(async (v) => {
          const ok = await run(
            form,
            async () =>
              api.post('/api/my/vaccinations', { ...v, proofKeys: await uploadAll(files, 'vaccinations') }),
            'Sent for verification.',
          );
          if (ok) onDone();
        })}
      >
        <FarmAndSpecies data={data} form={form} />
        <Field label="Vaccine *" error={err(e, 'vaccine')}>
          <Input className={big} {...form.register('vaccine')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date Given *" error={err(e, 'date')}>
            <Input className={big} type="date" max={isoDate()} {...form.register('date')} />
          </Field>
          <Field label="Head *" error={err(e, 'heads')}>
            <Input className={big} inputMode="numeric" {...form.register('heads')} />
          </Field>
        </div>
        <Field label="Who gave it? *" error={err(e, 'givenBy')} hint="Name of the veterinarian or technician">
          <Input className={big} {...form.register('givenBy')} />
        </Field>
        <div>
          <div className="mb-1 text-[14px] font-medium text-slate-700">
            Proof (photo of the card, receipt or vial)
          </div>
          <PhotoPicker files={files} onFilesChange={setFiles} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={big} onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} className={big}>
            Send
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function ServiceRequestForm({ data, onDone }: { data: VaccData; onDone: () => void }) {
  const form = useZodForm(serviceRequestSchema, { farmId: '', serviceType: '', note: '', preferredDate: '' });
  const { busy, run } = useSubmit();
  const e = form.formState.errors;
  const farmId = Number(form.watch('farmId')) || 0;
  useEffect(() => {
    if (data.farms.length === 1 && !farmId) form.setValue('farmId', data.farms[0].id);
  }, [data.farms, farmId, form]);
  return (
    <Panel tone="blue">
      <h2 className="text-[17px] font-semibold">Request a Service</h2>
      <form
        noValidate
        className="mt-3 space-y-3"
        onSubmit={form.handleSubmit(async (v) => {
          if (await run(form, () => api.post('/api/my/service-requests', v), 'Request sent.')) onDone();
        })}
      >
        <Field label="Farm *" error={err(e, 'farmId')}>
          <Select className={big} {...form.register('farmId')}>
            <option value="">Select…</option>
            {data.farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service *" error={err(e, 'serviceType')}>
          <Select className={big} {...form.register('serviceType')}>
            <option value="">Select…</option>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {SERVICE_TYPE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preferred Date" error={err(e, 'preferredDate')}>
          <Input className={big} type="date" min={isoDate()} {...form.register('preferredDate')} />
        </Field>
        <Field label="Note" error={err(e, 'note')}>
          <Textarea rows={2} {...form.register('note')} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={big} onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} className={big}>
            Send Request
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/* =====================================================================================
 * More: profile, farm summary, settings, sign out
 * ===================================================================================== */

export function MoreRoutes() {
  return (
    <Routes>
      <Route index element={<MoreMenuScreen />} />
      <Route path="profile" element={<ProfileScreen />} />
      <Route path="summary" element={<SummaryScreen />} />
      <Route path="settings" element={<SettingsScreen />} />
      {/* My Verification was removed (panel revision): the status and the ID are on My Profile. */}
      <Route path="verification" element={<Navigate to="/app/more/profile" replace />} />
    </Routes>
  );
}

function MoreMenuScreen() {
  const { user, logout } = useAuth();
  const [pw, setPw] = useState(false);
  return (
    <Screen title="Account and Settings">
      <RowLink
        to="/app/more/profile"
        icon={<User className="h-5 w-5" />}
        title={user?.name ?? 'My Profile'}
        sub="Livestock Owner · View and edit my profile"
      />
      <div className="space-y-2">
        {/* On a phone there is no side menu, so these pages are reached from here. */}
        <div className="space-y-2 md:hidden">
          <RowLink
            to="/app/vaccination"
            icon={<Syringe className="h-5 w-5" />}
            title="Vaccination and Services"
            sub="Schedule, records, requests"
          />
          <RowLink
            to="/app/map"
            icon={<MapIcon className="h-5 w-5" />}
            title="Disease Map"
            sub="Confirmed cases and monitoring areas"
          />
        </div>
        <RowLink
          to="/app/more/summary"
          icon={<FileText className="h-5 w-5" />}
          title="My Farm Summary"
          sub="Proof of registration to show or print"
        />
        <RowLink
          to="/app/more/settings"
          icon={<Settings className="h-5 w-5" />}
          title="Notification Settings"
        />
        <RowLink
          to="/public"
          icon={<Bell className="h-5 w-5" />}
          title="Public Livestock Information"
          sub="City totals and disease map"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" className={cn(big, 'w-full')} onClick={() => setPw(true)}>
          <KeyRound /> Change Password
        </Button>
        <Button variant="outline" className={cn(big, 'w-full text-red-700')} onClick={() => void logout()}>
          <LogOut /> Sign Out
        </Button>
      </div>
      <ChangePasswordDialog open={pw} onOpenChange={setPw} />
    </Screen>
  );
}

function ProfileScreen() {
  const home = useHome();
  const navigate = useNavigate();
  const form = useZodForm(ownerProfileSchema, {});
  const [loaded, setLoaded] = useState(false);
  const { busy, run } = useSubmit();
  const o = home.data?.owner;
  useEffect(() => {
    if (!o || loaded) return;
    form.reset({
      fullName: o.fullName,
      barangay: o.barangay,
      zone: o.zone ?? '',
      street: o.street ?? '',
      rsbsa: o.rsbsa ?? '',
      email: o.email ?? '',
    });
    setLoaded(true);
  }, [o, loaded, form]);
  if (!o) return <Loading />;
  const e = form.formState.errors;
  return (
    <Screen title="My Profile" back="/app/more">
      {o.status === 'PENDING' && o.returnReason && (
        <Panel tone="amber">
          <b>The office asks you to correct this:</b> {o.returnReason}
          <p className="mt-1 text-[14px]">
            Save your corrections here, then send your registration again in <b>My ID</b> below.
          </p>
        </Panel>
      )}
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (v) => {
          // A pending owner stays here: the ID and "Send for Review" are just below.
          if ((await run(form, () => api.patch('/api/my/profile', v), 'Saved.')) && o.status !== 'PENDING')
            navigate('/app/more');
        })}
      >
        <Panel className="space-y-4">
          <Field label="Full Name *" error={err(e, 'fullName')}>
            <Input className={big} {...form.register('fullName')} />
          </Field>
          <Field label="Mobile Number" hint="This is what you sign in with. Ask the office to change it.">
            <Input className={big} value={o.contact ?? ''} disabled readOnly />
          </Field>
          <Field label="Barangay *" error={err(e, 'barangay')}>
            <Select className={big} {...form.register('barangay')}>
              {BARANGAYS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Zone / Purok" error={err(e, 'zone')}>
            <Input className={big} {...form.register('zone')} />
          </Field>
          <Field label="Street or Landmark" error={err(e, 'street')}>
            <Input className={big} {...form.register('street')} />
          </Field>
          <Field
            label="RSBSA Control No."
            error={err(e, 'rsbsa')}
            hint="If you are registered with the Department of Agriculture"
          >
            <Input className={big} {...form.register('rsbsa')} />
          </Field>
          <Field label="Email" error={err(e, 'email')} hint="Optional">
            <Input className={big} type="email" {...form.register('email')} />
          </Field>
        </Panel>
        <Button type="submit" loading={busy} className={cn(big, 'w-full')}>
          Save
        </Button>
      </form>
      <MyIdSection />
    </Screen>
  );
}

interface Summary {
  office: { name: string; address: string; contact: string };
  owner: {
    code: string;
    fullName: string;
    barangay: string;
    zone: string | null;
    street: string | null;
    contact: string | null;
    rsbsa: string | null;
    status: string;
    registeredAt: string;
  };
  farms: {
    code: string;
    name: string;
    type: string;
    barangay: string;
    address: string | null;
    livestock: { species: string; count: number }[];
    total: number;
    services: { date: string; service: string; product: string | null; species: string; heads: number }[];
  }[];
  generatedAt: string;
}

function SummaryScreen() {
  const { data, isLoading, error } = useApi<Summary>('/api/my/summary');
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const o = data.owner;
  return (
    <Screen
      title="My Farm Summary"
      back="/app/more"
      action={
        <Button
          variant="outline"
          className="h-11 print:hidden"
          onClick={() => {
            // The download is written to the audit log (who and when).
            void api.get('/api/my/summary?log=1').catch(() => undefined);
            window.print();
          }}
        >
          <Printer /> Print / PDF
        </Button>
      }
    >
      <div
        id="owner-summary"
        className="rounded-2xl border border-slate-200 bg-white p-5 print:border-0 print:p-0"
      >
        <div className="text-center">
          <div className="text-[13px] uppercase tracking-wide text-slate-500">{data.office.name}</div>
          <div className="text-[13px] text-slate-500">{data.office.address}</div>
          <h2 className="mt-2 text-[20px] font-semibold">Livestock Owner and Farm Summary</h2>
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
          <dt className="text-slate-500">Registration no.</dt>
          <dd className="font-semibold">{o.code}</dd>
          <dt className="text-slate-500">Owner</dt>
          <dd>{o.fullName}</dd>
          <dt className="text-slate-500">Address</dt>
          <dd>{[o.street, o.zone, `Barangay ${o.barangay}`, 'Naga City'].filter(Boolean).join(', ')}</dd>
          {o.rsbsa && (
            <>
              <dt className="text-slate-500">RSBSA no.</dt>
              <dd>{o.rsbsa}</dd>
            </>
          )}
          <dt className="text-slate-500">Status</dt>
          <dd>
            {o.status === 'ACTIVE'
              ? 'Verified'
              : o.status === 'PENDING'
                ? 'Pending verification'
                : 'Inactive'}
          </dd>
          <dt className="text-slate-500">Registered</dt>
          <dd>{fmtDate(o.registeredAt)}</dd>
        </dl>
        {data.farms.length === 0 && <p className="mt-4 text-[15px] text-slate-500">No verified farm yet.</p>}
        {data.farms.map((f) => (
          <div key={f.code} className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="text-[17px] font-semibold">
              {f.name} <span className="font-normal text-slate-500">({f.code})</span>
            </h3>
            <p className="text-[14px] text-slate-600">
              {f.type === 'backyard' ? 'Backyard' : 'Commercial'} ·{' '}
              {[f.address, `Barangay ${f.barangay}`].filter(Boolean).join(', ')}
            </p>
            <table className="mt-2 w-full text-[15px]">
              <tbody>
                {f.livestock.map((l) => (
                  <tr key={l.species} className="border-b border-slate-100">
                    <td className="py-1.5">{l.species}</td>
                    <td className="py-1.5 text-right font-medium">{l.count}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 font-semibold">Total head</td>
                  <td className="py-1.5 text-right font-semibold">{f.total}</td>
                </tr>
              </tbody>
            </table>
            {f.services.length > 0 && (
              <>
                <h4 className="mt-3 text-[14px] font-semibold">Vaccinations and Services on Record</h4>
                <ul className="text-[14px] text-slate-700">
                  {f.services.map((s, i) => (
                    <li key={i}>
                      {fmtDate(s.date)} · {s.service}
                      {s.product ? ` (${s.product})` : ''} · {s.heads} {s.species}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
        <p className="mt-5 text-[12px] text-slate-500">
          Generated from the Naga City Livestock Monitoring System on {when(data.generatedAt)}. Figures are
          the records of the City Veterinary Office as of this date.
        </p>
      </div>
    </Screen>
  );
}

function SettingsScreen() {
  const { data, isLoading } = useApi<{ muted: string[]; phone: string | null }>('/api/my/settings');
  const { busy, run } = useSubmit();
  if (isLoading || !data) return <Loading />;
  const toggle = (t: string, on: boolean) =>
    run(
      null,
      () =>
        api.put('/api/my/settings', { muted: on ? data.muted.filter((m) => m !== t) : [...data.muted, t] }),
      'Saved.',
    );
  return (
    <Screen title="Notification Settings" back="/app/more">
      <Panel>
        <h2 className="text-[17px] font-semibold">Always On</h2>
        <p className="mt-1 text-[15px] text-slate-600">
          Disease alerts near your farm and updates about your own registration, head count and reports cannot
          be turned off.
        </p>
      </Panel>
      <Panel className="space-y-1">
        <h2 className="text-[17px] font-semibold">You Choose</h2>
        {OPTIONAL_NOTIFICATION_TYPES.map((t) => (
          <div
            key={t}
            className="flex min-h-[52px] items-center [&_input]:h-5 [&_input]:w-5 [&_label]:text-[16px]"
          >
            <Checkbox
              label={
                t === 'VACCINATION' ? 'Vaccination schedules and reminders' : 'Announcements and advisories'
              }
              checked={!data.muted.includes(t)}
              onChange={(c) => !busy && void toggle(t, c)}
            />
          </div>
        ))}
      </Panel>
      <p className="text-[14px] text-slate-500">
        Notifications appear in this app. Open the app regularly, or add it to your phone's home screen, to
        see new ones.
      </p>
    </Screen>
  );
}

/* =====================================================================================
 * Verification: the owner's ID and where the review is
 * ===================================================================================== */

const maskId = (n: string | null) => (n ? `${'•'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : '');

/** Registration status and the owner's ID, shown on My Profile (was the "My Verification" page). */
function MyIdSection() {
  const home = useHome();
  const navigate = useNavigate();
  const { busy, run } = useSubmit();
  const o = home.data?.owner;
  const [idType, setIdType] = useState<string>('');
  const [idNumber, setIdNumber] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!o || loaded) return;
    setIdType(o.idType ?? '');
    setIdNumber(o.idNumber ?? '');
    setLoaded(true);
  }, [o, loaded]);
  if (home.isLoading || !o || !home.data) return <Loading />;
  const verified = o.status === 'ACTIVE';
  const returned = o.status === 'PENDING' && !!o.returnReason;
  const hasId = o.idPhotos.length > 0;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!idType) e.idType = 'Select the type of ID';
    if (!idNumber.trim()) e.idNumber = 'Enter the ID number';
    if (!front && !hasId) e.idPhotoKeys = 'Add a photo of the front of your ID';
    if (!confirm) e.confirm = 'Please confirm before sending';
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await run(
      null,
      async () => {
        const keys = o.idPhotos.map((p) => p.key);
        const frontKey = front ? (await uploadAll([front], 'ids'))[0] : keys[0];
        const backKey = back ? (await uploadAll([back], 'ids'))[0] : front ? undefined : keys[1];
        await api.post('/api/my/verification', {
          idType,
          idNumber: idNumber.trim(),
          idPhotoKeys: [frontKey, ...(backKey ? [backKey] : [])],
        });
      },
      returned ? 'Sent to the office for review again.' : 'Your ID is saved and waiting for review.',
    );
    if (ok) navigate('/app');
  };

  return (
    <div id="my-id" className="space-y-4">
      <Panel tone={verified ? 'green' : returned ? 'amber' : 'blue'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">
              {verified ? 'Verified' : returned ? 'Returned for Correction' : 'Waiting for Review'}
            </h2>
            <p className="mt-1 text-[15px]">
              {verified
                ? `The City Veterinary Office verified your registration${o.reviewedAt ? ` on ${fmtDate(o.reviewedAt)}` : ''}. Your registration number is ${o.code}.`
                : returned
                  ? `The office says: ${o.returnReason}`
                  : 'The office checks your details and your ID, then verifies your registration.'}
            </p>
          </div>
          <Badge tone={verified ? 'green' : returned ? 'amber' : 'blue'}>
            {verified ? 'Verified' : returned ? 'Action Needed' : 'Pending'}
          </Badge>
        </div>
        {!verified && (
          <div className="mt-3 rounded-xl bg-white/70 p-3">
            <VerificationSteps owner={o} />
          </div>
        )}
      </Panel>

      {verified ? (
        <Panel>
          <SectionTitle>My ID</SectionTitle>
          <p className="text-[15px]">
            {o.idType ? (ID_TYPE_LABELS[o.idType as IdType] ?? o.idType) : 'Checked at the office'}
            {o.idNumber ? ` · ${maskId(o.idNumber)}` : ''}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            To change your name or ID after verification, visit the office.
          </p>
        </Panel>
      ) : (
        <Panel className="space-y-4">
          <div>
            <SectionTitle className="mb-1">My ID</SectionTitle>
            <p className="text-[14px] text-slate-600">
              Use one valid government-issued ID with your photo. The office uses it only to confirm who you
              are; other owners and the public never see it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type of ID *" error={errors.idType}>
              <Select className={big} value={idType} onChange={(e) => setIdType(e.target.value)}>
                <option value="">Select…</option>
                {ID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ID_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ID Number *" error={errors.idNumber}>
              <Input className={big} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <IdPhotoInput
              label="Front of ID"
              file={front}
              onChange={setFront}
              current={o.idPhotos[0]?.url}
              error={errors.idPhotoKeys}
            />
            <IdPhotoInput
              label="Back of ID"
              optional
              file={back}
              onChange={setBack}
              current={front ? null : o.idPhotos[1]?.url}
            />
          </div>
          <label className="flex items-start gap-3 text-[15px] text-slate-700">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-brand-strong"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            <span>I confirm that this is my own ID and that my details are true and correct.</span>
          </label>
          {errors.confirm && (
            <p role="alert" className="-mt-2 text-[13px] text-red-600">
              {errors.confirm}
            </p>
          )}
          <Button className={cn(big, 'w-full sm:w-auto')} loading={busy} onClick={() => void submit()}>
            <Send /> {returned ? 'Send for Review Again' : hasId ? 'Save Changes' : 'Send My ID'}
          </Button>
        </Panel>
      )}

      {!verified && (
        <Panel tone="blue">
          <SectionTitle className="mb-1">While You Wait</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-[15px]">
            <li>Register your farm, so the office can verify it together with you.</li>
            <li>Read disease alerts, advisories and the disease map.</li>
            <li>
              Reports, head count updates and vaccination sign-ups open once you and your farm are verified.
            </li>
          </ul>
          <p className="mt-2 text-[15px] font-medium">
            If an animal is sick or dies suddenly, call the office now:
          </p>
          <div className="mt-2">
            <OfficeContact office={home.data.office} />
          </div>
        </Panel>
      )}
    </div>
  );
}
