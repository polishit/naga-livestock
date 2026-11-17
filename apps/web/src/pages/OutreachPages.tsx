import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Megaphone, Pencil, Plus, Radar, Smartphone, PhoneCall } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ACTIVITY_STATUS_LABELS,
  ANNOUNCEMENT_AUDIENCE_LABELS,
  BARANGAYS,
  SIGNUP_STATUS_LABELS,
  SPECIES,
  VACCINE_PRODUCTS,
  RADIUS_OPTIONS,
  activitySchema,
  announcementSchema,
  fmtDate,
  fmtDateTime,
  formatDistance,
  isoDate,
  zoneCreateSchema,
  type ActivityStatus,
  type AnnouncementAudience,
  type SignupStatus,
} from '@livestock/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useResetOnOpen } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { err, useZodForm } from '@/components/forms';
import { ErrorBox, Loading, PageHeader } from '@/components/page';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  type Tone,
} from '@/components/ui';

/** Save through a form: field errors under their fields, anything else as a toast. */
function useFormSave(form: ReturnType<typeof useZodForm>) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (fn: () => Promise<unknown>, done: string | ((r: any) => string)) => {
    setBusy(true);
    try {
      const r = await fn();
      toast.success(typeof done === 'string' ? done : done(r));
      await qc.invalidateQueries();
      return true;
    } catch (x) {
      if (x instanceof ApiError && x.fieldErrors)
        for (const [f, m] of Object.entries(x.fieldErrors))
          form.setError(f, { type: 'server', message: m[0] });
      else toast.error(x instanceof Error ? x.message : 'Could not save. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

/** A small "type the reason" dialog used for lifting, cancelling and withdrawing. */
function ReasonDialog({
  ask,
  onClose,
}: {
  ask: null | {
    title: string;
    body?: ReactNode;
    label: string;
    confirm: string;
    done: string;
    run: (reason: string) => Promise<unknown>;
  };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = ask?.title;
  useEffect(() => {
    if (key) {
      setReason('');
      setError(null);
    }
  }, [key]);
  return (
    <Dialog
      open={!!ask}
      onOpenChange={(o) => !o && onClose()}
      title={ask?.title ?? ''}
      size="sm"
      guardChanges={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              if (!reason.trim()) return setError('Give the reason');
              setBusy(true);
              try {
                await ask!.run(reason.trim());
                toast.success(ask!.done);
                await qc.invalidateQueries();
                onClose();
              } catch (x) {
                setError(x instanceof Error ? x.message : 'Could not save.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {ask?.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[15px] text-slate-700">
        {ask?.body}
        <Field label={`${ask?.label} *`} error={error ?? undefined}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/* =====================================================================================
 * Monitoring zones
 * ===================================================================================== */

interface Zone {
  id: number;
  code: string;
  caseId: number | null;
  caseCode: string | null;
  disease: string;
  barangay: string;
  radiusM: number;
  status: 'ACTIVE' | 'LIFTED';
  guidance: string | null;
  createdBy: string | null;
  createdAt: string;
  liftedBy: string | null;
  liftedAt: string | null;
  liftReason: string | null;
  farms: number;
  notified: number;
  read: number;
  rows?: {
    farmId: number;
    code: string;
    name: string;
    barangay: string;
    distance: number;
    owner: string;
    contact: string | null;
    hasApp: boolean;
    notifiedAt: string | null;
    readAt: string | null;
  }[];
}
interface CaseOption {
  id: number;
  code: string;
  disease: string;
  farmName: string;
  barangay: string;
  status: string;
  closed: boolean;
  voided?: boolean;
  geotagged?: boolean;
  lat?: number | null;
}

const DEFAULT_GUIDANCE =
  'Check your animals every day. Do not move, sell or slaughter animals from your farm without asking the City Veterinary Office. Do not let visitors near your pens.';

export function ZonesPage() {
  const { isReviewer } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error } = useApi<Zone[]>('/api/zones');
  const cases = useApi<CaseOption[]>('/api/cases');
  const settings = useApi<{ defaultRadiusMeters: number }>('/api/settings');
  const openId = Number(params.get('zone')) || null;
  const detail = useApi<Zone>(openId ? `/api/zones/${openId}` : null);
  const presetCase = params.get('case');
  const [creating, setCreating] = useState(!!presetCase);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [lift, setLift] = useState<Zone | null>(null);
  const form = useZodForm(zoneCreateSchema, {});
  const { busy, save } = useFormSave(form);
  useResetOnOpen(creating || !!editing, form, {
    caseId: editing?.caseId ?? presetCase ?? '',
    radiusM: editing?.radiusM ?? settings.data?.defaultRadiusMeters ?? 1000,
    guidance: editing?.guidance ?? DEFAULT_GUIDANCE,
  });
  const e = form.formState.errors;
  // Opened from a case page: choose that case once the case list has loaded.
  const casesLoaded = !!cases.data;
  useEffect(() => {
    if (creating && presetCase && casesLoaded) form.setValue('caseId', presetCase);
  }, [creating, presetCase, casesLoaded, form]);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const zoned = new Set(data.filter((z) => z.status === 'ACTIVE').map((z) => z.caseId));
  // Only confirmed (positive), open cases can get a zone.
  const confirmed = (cases.data ?? []).filter(
    (c) => c.status === 'POSITIVE' && !c.closed && !c.voided && !zoned.has(c.id),
  );
  const allCases = (cases.data ?? []).filter((c) => !c.closed && !c.voided);
  const waitingLab = allCases.filter((c) => c.status !== 'POSITIVE' && c.status !== 'NEGATIVE').length;
  const noPin = confirmed.filter((c) => c.lat == null).length;
  const setOpen = (id: number | null) => setParams(id ? { zone: String(id) } : {}, { replace: true });
  const z = detail.data;
  return (
    <div>
      <PageHeader
        title="Monitoring Zones"
        subtitle="A radius around a confirmed (positive) case, set automatically when the laboratory result is positive. Owners of the farms inside are alerted in the owner app, with the distance to their own farm. Change the radius or lift a zone here."
        actions={
          isReviewer && (
            <Button onClick={() => (setEditing(null), setCreating(true))}>
              <Plus /> Set a Monitoring Zone
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] lg:items-start">
        <Card className={cn(openId && 'hidden lg:block')}>
          {data.length === 0 && (
            <EmptyState>No monitoring zone yet. Set one when a case is confirmed positive.</EmptyState>
          )}
          {data.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setOpen(x.id)}
              className={`block w-full border-b border-slate-100 p-4 text-left last:border-0 hover:bg-slate-50 ${openId === x.id ? 'bg-brand-light' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[15px]">
                  {x.code} · {x.disease}
                </b>
                <Badge tone={x.status === 'ACTIVE' ? 'red' : 'slate'}>
                  {x.status === 'ACTIVE' ? 'Active' : 'Lifted'}
                </Badge>
              </div>
              <p className="text-[14px] text-slate-600">
                {x.barangay} · {formatDistance(x.radiusM)} · {x.farms} farm{x.farms === 1 ? '' : 's'} inside ·{' '}
                {x.notified} alert{x.notified === 1 ? '' : 's'} sent
              </p>
              <p className="text-[13px] text-slate-500">
                {x.caseCode} · set {fmtDate(x.createdAt)} by {x.createdBy}
              </p>
            </button>
          ))}
        </Card>
        {!openId ? (
          <Card className="hidden lg:block">
            <EmptyState>Select a zone to see the farms inside it.</EmptyState>
          </Card>
        ) : !z ? (
          <Card>
            <Loading />
          </Card>
        ) : (
          <Card>
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-start gap-2">
                <BackButton onClick={() => setOpen(null)} label="Back to the Zones" className="-ml-2 -mt-1" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-[18px] font-semibold">
                    <Radar className="h-5 w-5 text-red-700" /> {z.code}: {z.disease},{' '}
                    {formatDistance(z.radiusM)}
                  </h2>
                  <Badge tone={z.status === 'ACTIVE' ? 'red' : 'slate'}>
                    {z.status === 'ACTIVE' ? 'Active' : 'Lifted'}
                  </Badge>
                </div>
              </div>
              <p className="mt-1 text-[14px] text-slate-600">
                Around{' '}
                {z.caseId ? (
                  <Link className="underline" to={`/cases/${z.caseId}`}>
                    {z.caseCode}
                  </Link>
                ) : (
                  'the epicenter'
                )}{' '}
                in {z.barangay} · set {fmtDateTime(z.createdAt)} by {z.createdBy}
              </p>
              {z.status === 'LIFTED' && (
                <p className="mt-1 text-[14px] text-slate-600">
                  Lifted {fmtDateTime(z.liftedAt!)} by {z.liftedBy}: {z.liftReason}
                </p>
              )}
              {z.guidance && (
                <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-[14px]">
                  {z.guidance}
                </p>
              )}
              <p className="mt-2 text-[14px] text-slate-700">
                <b>{z.farms}</b> farm(s) inside · <b>{z.notified}</b> alert(s) sent · <b>{z.read}</b> read
              </p>
              {isReviewer && z.status === 'ACTIVE' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => (setCreating(false), setEditing(z))}>
                    <Pencil /> Change Radius or Guidance
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLift(z)}>
                    Lift the Zone
                  </Button>
                  {z.caseId && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/radius?case=${z.caseId}&radius=${z.radiusM}`}>Farms to Monitor</Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
            {(z.rows ?? []).length === 0 && <EmptyState>No other farm is inside this radius.</EmptyState>}
            {(z.rows ?? []).map((r) => (
              <div
                key={r.farmId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <Link to={`/farms/${r.farmId}`} className="font-medium underline">
                    {r.code} {r.name}
                  </Link>
                  <div className="text-[14px] text-slate-600">
                    {formatDistance(r.distance)} away · {r.barangay} · {r.owner}
                    {r.contact ? ` (${r.contact})` : ''}
                  </div>
                </div>
                {r.hasApp ? (
                  <Badge tone={r.readAt ? 'green' : r.notifiedAt ? 'blue' : 'slate'}>
                    <Smartphone className="mr-1 inline h-3.5 w-3.5" />
                    {r.readAt ? 'Alert Read' : r.notifiedAt ? 'Alert Sent' : 'Not Alerted'}
                  </Badge>
                ) : (
                  <Badge tone="amber">
                    <PhoneCall className="mr-1 inline h-3.5 w-3.5" />
                    No App: Tell by Phone or Visit
                  </Badge>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>

      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
            if (presetCase) setParams({}, { replace: true });
          }
        }}
        title={editing ? `Change ${editing.code}` : 'Set a Monitoring Zone'}
        footer={
          <>
            <Button variant="outline" onClick={() => (setCreating(false), setEditing(null))}>
              Cancel
            </Button>
            <Button form="zone-form" type="submit" loading={busy}>
              {editing ? 'Save' : 'Set Zone and Alert Owners'}
            </Button>
          </>
        }
      >
        <form
          id="zone-form"
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            const ok = editing
              ? await save(
                  () => api.patch(`/api/zones/${editing.id}`, { radiusM: v.radiusM, guidance: v.guidance }),
                  (r) => `Saved.${r.newlyNotified ? ` ${r.newlyNotified} more owner(s) alerted.` : ''}`,
                )
              : await save(
                  () => api.post<Zone & { sent: number }>('/api/zones', v),
                  (r) => `${r.code} set. ${r.farms} farm(s) inside, ${r.sent} owner(s) alerted.`,
                );
            if (ok) {
              setCreating(false);
              setEditing(null);
            }
          })}
        >
          {!editing && confirmed.length === 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[14px] text-sky-900">
              <b>No confirmed case is waiting for a zone.</b> A zone is set automatically when a case is
              confirmed positive by the laboratory, so most cases already have one.
              {waitingLab > 0 && (
                <>
                  {' '}
                  {waitingLab} open case(s) are still suspected (waiting for the laboratory result): they show
                  on the staff map but get a zone only when the result is positive.
                </>
              )}
            </div>
          )}
          {!editing && noPin > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-900">
              {noPin} confirmed case(s) have no map location yet. Add the location on the case and the zone is
              set automatically.
            </p>
          )}
          {!editing && (
            <Field
              label="Confirmed Case (Epicenter) *"
              error={err(e, 'caseId')}
              hint="Only cases with a positive laboratory result that are still open"
            >
              <Select {...form.register('caseId')}>
                <option value="">Select…</option>
                {confirmed.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.disease} · {c.farmName}, {c.barangay}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label="Radius *"
            error={err(e, 'radiusM')}
            hint={
              editing
                ? 'A wider radius alerts the farms newly inside it. Farms already alerted are not alerted again.'
                : undefined
            }
          >
            <Select {...form.register('radiusM')}>
              {[
                ...new Set([
                  ...RADIUS_OPTIONS,
                  editing?.radiusM ?? 1000,
                  settings.data?.defaultRadiusMeters ?? 1000,
                ]),
              ]
                .sort((a, b) => a - b)
                .map((r) => (
                  <option key={r} value={r}>
                    {formatDistance(r)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field
            label="Guidance for the Owners"
            error={err(e, 'guidance')}
            hint="Shown in the alert. The reporting farm and owner are never named."
          >
            <Textarea rows={4} {...form.register('guidance')} />
          </Field>
        </form>
      </Dialog>
      <ReasonDialog
        ask={
          lift && {
            title: `Lift ${lift.code}?`,
            body: <>The owners inside are told the monitoring area is lifted. The zone stays on record.</>,
            label: 'Reason',
            confirm: 'Lift the Zone',
            done: 'Zone lifted.',
            run: (reason) => api.post(`/api/zones/${lift.id}/lift`, { reason }),
          }
        }
        onClose={() => setLift(null)}
      />
    </div>
  );
}

/* =====================================================================================
 * Vaccination activities
 * ===================================================================================== */

interface Activity {
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
  status: ActivityStatus;
  cancelReason: string | null;
  createdBy: string | null;
  signedUp: number;
  heads: number;
  attended: number;
  signups?: {
    id: number;
    species: string;
    heads: number;
    status: SignupStatus;
    farm?: { id: number; code: string; name: string; barangay: string };
    owner?: { id: number; fullName: string; contact: string | null };
  }[];
}
const ACT_TONE: Record<ActivityStatus, Tone> = {
  SCHEDULED: 'blue',
  ONGOING: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'slate',
};

export function ActivitiesPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error } = useApi<Activity[]>('/api/activities');
  const openId = Number(params.get('activity')) || null;
  const detail = useApi<Activity>(openId ? `/api/activities/${openId}` : null);
  const [dlg, setDlg] = useState<null | 'new' | Activity>(null);
  const [cancel, setCancel] = useState<Activity | null>(null);
  const [completing, setCompleting] = useState<Activity | null>(null);
  /** A new activity is checked on a summary (with who will be told) before it is scheduled. */
  const [review, setReview] = useState<null | Record<string, string>>(null);
  const audience = useApi<{ owners: number; withApp: number }>(
    review
      ? `/api/activities/audience?barangay=${encodeURIComponent(review.barangay)}&species=${encodeURIComponent(review.species)}`
      : null,
  );
  const form = useZodForm(activitySchema, {});
  const { busy, save } = useFormSave(form);
  const editing = dlg && dlg !== 'new' ? dlg : null;
  useResetOnOpen(!!dlg, form, {
    title: editing?.title ?? '',
    vaccine: editing?.vaccine ?? '',
    species: editing?.species ?? '',
    barangay: editing?.barangay ?? '',
    date: editing?.date ?? '',
    time: editing?.time ?? '',
    venue: editing?.venue ?? '',
    notes: editing?.notes ?? '',
  });
  const e = form.formState.errors;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const a = detail.data;
  const setStatus = async (x: Activity, status: ActivityStatus) => {
    try {
      await api.post(`/api/activities/${x.id}/status`, { status });
      toast.success(`${x.code} is now ${ACTIVITY_STATUS_LABELS[status].toLowerCase()}.`);
      await qc.invalidateQueries();
    } catch (y) {
      toast.error(y instanceof Error ? y.message : 'Could not save.');
    }
  };
  const mark = async (id: number, status: SignupStatus) => {
    try {
      await api.post(`/api/activities/signups/${id}/status`, { status });
      toast.success(
        status === 'ATTENDED' ? 'Attendance saved. The vaccination is on the farm record.' : 'Saved.',
      );
      await qc.invalidateQueries();
    } catch (y) {
      toast.error(y instanceof Error ? y.message : 'Could not save.');
    }
  };
  return (
    <div>
      <PageHeader
        title="Vaccination Schedule"
        subtitle="Vaccination activities by barangay. Owners in the barangay are told in the owner app and can sign up their animals."
        actions={
          canEdit && (
            <Button onClick={() => setDlg('new')}>
              <CalendarPlus /> Schedule an Activity
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] lg:items-start">
        <Card className={cn(openId && 'hidden lg:block')}>
          {data.length === 0 && <EmptyState>No vaccination activity has been scheduled.</EmptyState>}
          {data.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setParams({ activity: String(x.id) }, { replace: true })}
              className={`block w-full border-b border-slate-100 p-4 text-left last:border-0 hover:bg-slate-50 ${openId === x.id ? 'bg-brand-light' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[15px]">{x.title}</b>
                <Badge tone={ACT_TONE[x.status]}>{ACTIVITY_STATUS_LABELS[x.status]}</Badge>
              </div>
              <p className="text-[14px] text-slate-600">
                {fmtDate(x.date)}
                {x.time ? ` · ${x.time}` : ''} · {x.barangay === 'ALL' ? 'All barangays' : x.barangay} ·{' '}
                {x.species === 'All' ? 'all livestock' : x.species}
              </p>
              <p className="text-[13px] text-slate-500">
                {x.code} · {x.signedUp} sign-up{x.signedUp === 1 ? '' : 's'} ({x.heads} head) · {x.attended}{' '}
                attended
              </p>
            </button>
          ))}
        </Card>
        {!openId ? (
          <Card className="hidden lg:block">
            <EmptyState>Select an activity to see who signed up.</EmptyState>
          </Card>
        ) : !a ? (
          <Card>
            <Loading />
          </Card>
        ) : (
          <Card>
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-start gap-2">
                <BackButton
                  onClick={() => setParams({}, { replace: true })}
                  label="Back to the Activities"
                  className="-ml-2 -mt-1"
                />
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[18px] font-semibold">
                    {a.code}: {a.title}
                  </h2>
                  <Badge tone={ACT_TONE[a.status]}>{ACTIVITY_STATUS_LABELS[a.status]}</Badge>
                </div>
              </div>
              <p className="mt-1 text-[14px] text-slate-600">
                {fmtDate(a.date)}
                {a.time ? ` · ${a.time}` : ''}
                {a.venue ? ` · ${a.venue}` : ''} · {a.barangay === 'ALL' ? 'All barangays' : a.barangay} ·{' '}
                {a.species === 'All' ? 'all livestock' : a.species}
                {a.vaccine ? ` · ${a.vaccine}` : ''}
              </p>
              {a.notes && <p className="mt-1 whitespace-pre-line text-[14px]">{a.notes}</p>}
              {a.status === 'CANCELLED' && (
                <p className="mt-1 text-[14px] text-slate-600">Cancelled: {a.cancelReason}</p>
              )}
              {canEdit && !['COMPLETED', 'CANCELLED'].includes(a.status) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDlg(a)}>
                    <Pencil /> Edit or Reschedule
                  </Button>
                  {a.status === 'SCHEDULED' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(a, 'ONGOING')}>
                      Start (Ongoing)
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setCompleting(a)}>
                    Mark Completed
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCancel(a)}>
                    Cancel Activity
                  </Button>
                </div>
              )}
            </div>
            {(a.signups ?? []).length === 0 && <EmptyState>No owner has signed up yet.</EmptyState>}
            {(a.signups ?? []).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 last:border-0"
              >
                <div>
                  <b>
                    {s.heads} {s.species}
                  </b>{' '}
                  ·{' '}
                  {s.farm && (
                    <Link className="underline" to={`/farms/${s.farm.id}`}>
                      {s.farm.name}
                    </Link>
                  )}
                  <div className="text-[14px] text-slate-600">
                    {s.owner?.fullName}
                    {s.owner?.contact ? ` (${s.owner.contact})` : ''} · {s.farm?.barangay}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={s.status === 'ATTENDED' ? 'green' : s.status === 'SIGNED_UP' ? 'blue' : 'slate'}
                  >
                    {SIGNUP_STATUS_LABELS[s.status]}
                  </Badge>
                  {canEdit && s.status === 'SIGNED_UP' && a.status !== 'CANCELLED' && a.date <= isoDate() && (
                    <>
                      <Button size="xs" onClick={() => mark(s.id, 'ATTENDED')}>
                        Attended
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => mark(s.id, 'NO_SHOW')}>
                        Did Not Attend
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Dialog
        open={!!dlg}
        onOpenChange={(o) => !o && (setDlg(null), setReview(null))}
        title={
          editing ? `Edit ${editing.code}` : review ? 'Review and Confirm' : 'Schedule a Vaccination Activity'
        }
        footer={
          review ? (
            <>
              <Button variant="outline" onClick={() => setReview(null)}>
                Previous
              </Button>
              <Button
                loading={busy}
                onClick={async () => {
                  const ok = await save(
                    () => api.post('/api/activities', review),
                    (r) => `Scheduled.${r.notified ? ` ${r.notified} owner(s) told.` : ''}`,
                  );
                  if (ok) {
                    setReview(null);
                    setDlg(null);
                  } else setReview(null);
                }}
              >
                Confirm and Notify Owners
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setDlg(null)}>
                Cancel
              </Button>
              <Button form="activity-form" type="submit" loading={busy}>
                {editing ? 'Save Changes' : 'Next: Review'}
              </Button>
            </>
          )
        }
      >
        {review && (
          <div className="space-y-4 text-[15px] text-slate-700">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
              {(
                [
                  ['Activity', review.title],
                  ['Vaccine', review.vaccine],
                  ['Livestock', review.species === 'All' ? 'All livestock' : review.species],
                  ['Barangay', review.barangay === 'ALL' ? 'All barangays' : review.barangay],
                  ['Date', review.date ? fmtDate(review.date) : ''],
                  ['Time', review.time],
                  ['Venue', review.venue],
                ] as [string, string | undefined][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[13px] text-slate-500">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="font-semibold text-sky-900">Who Will Be Told</div>
              {audience.data ? (
                <p className="mt-1">
                  {audience.data.owners} verified owner(s) with{' '}
                  {review.species === 'All' ? 'livestock' : review.species} in{' '}
                  {review.barangay === 'ALL' ? 'the city' : `Barangay ${review.barangay}`}.{' '}
                  <b>{audience.data.withApp}</b> use the owner app and get a notification; tell the others by
                  barangay announcement or phone.
                </p>
              ) : (
                <p className="mt-1">Counting…</p>
              )}
            </div>
            <div>
              <div className="mb-1 font-semibold text-slate-900">The Owners Will Receive</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-900">
                  {review.title}: {review.date ? fmtDate(review.date) : ''}
                </div>
                <p className="mt-1 whitespace-pre-line text-[14px]">
                  The City Veterinary Office scheduled {review.title}
                  {review.vaccine ? ` (${review.vaccine})` : ''} for{' '}
                  {review.species === 'All' ? 'livestock' : review.species} on{' '}
                  {review.date ? fmtDate(review.date) : ''}
                  {review.time ? `, ${review.time}` : ''}
                  {review.venue ? ` at ${review.venue}` : ''}. Open Vaccination to sign up your animals.
                  {review.notes ? `\n\n${review.notes}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}
        <form
          id="activity-form"
          noValidate
          className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', review && 'hidden')}
          onSubmit={form.handleSubmit(async (v) => {
            if (!editing) {
              if ((v.date as string) < isoDate()) {
                form.setError('date', { type: 'server', message: 'Choose today or a later date' });
                return;
              }
              setReview(v as Record<string, string>);
              return;
            }
            const ok = await save(
              () => api.patch(`/api/activities/${editing.id}`, v),
              (r) => `Saved.${r.notified ? ` ${r.notified} owner(s) told.` : ''}`,
            );
            if (ok) setDlg(null);
          })}
        >
          <Field label="Title *" error={err(e, 'title')} className="sm:col-span-2">
            <Input {...form.register('title')} placeholder="Hog cholera vaccination" />
          </Field>
          <Field label="Vaccine" error={err(e, 'vaccine')}>
            <Input list="activity-vaccines" {...form.register('vaccine')} />
            <datalist id="activity-vaccines">
              {VACCINE_PRODUCTS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="For Which Livestock *" error={err(e, 'species')}>
            <Select {...form.register('species')}>
              <option value="">Select…</option>
              <option value="All">All livestock</option>
              {SPECIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Barangay *" error={err(e, 'barangay')}>
            <Select {...form.register('barangay')}>
              <option value="">Select…</option>
              <option value="ALL">All barangays</option>
              {BARANGAYS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date *" error={err(e, 'date')}>
            <Input type="date" min={isoDate()} {...form.register('date')} />
          </Field>
          <Field label="Time" error={err(e, 'time')}>
            <Input {...form.register('time')} placeholder="8:00 AM to 12:00 NN" />
          </Field>
          <Field label="Venue" error={err(e, 'venue')}>
            <Input {...form.register('venue')} placeholder="Barangay covered court" />
          </Field>
          <Field label="Notes for the Owners" error={err(e, 'notes')} className="sm:col-span-2">
            <Textarea rows={3} {...form.register('notes')} />
          </Field>
          {editing && (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 sm:col-span-2">
              If you change the date, time or venue, the owners are told about the new schedule.
            </p>
          )}
        </form>
      </Dialog>
      <ReasonDialog
        ask={
          cancel && {
            title: `Cancel ${cancel.title}?`,
            body: <>The owners are told it is cancelled. The activity stays on record.</>,
            label: 'Reason',
            confirm: 'Cancel the Activity',
            done: 'Activity cancelled. The owners were told.',
            run: (reason) => api.post(`/api/activities/${cancel.id}/status`, { status: 'CANCELLED', reason }),
          }
        }
        onClose={() => setCancel(null)}
      />
      <Dialog
        open={!!completing}
        onOpenChange={(o) => !o && setCompleting(null)}
        title={completing ? `Mark ${completing.code} Completed` : ''}
        size="sm"
        guardChanges={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const x = completing!;
                setCompleting(null);
                await setStatus(x, 'COMPLETED');
              }}
            >
              Confirm: Completed
            </Button>
          </>
        }
      >
        {completing && (
          <div className="space-y-2 text-[15px] text-slate-700">
            <p>
              <b>{completing.attended}</b> of <b>{completing.signedUp}</b> sign-up(s) are marked attended.
            </p>
            {completing.signedUp > completing.attended && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                Mark the remaining sign-ups as attended or not attended first, so the farm records are right.
              </p>
            )}
            <p>A completed activity can no longer be edited.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* =====================================================================================
 * Announcements
 * ===================================================================================== */

interface Announcement {
  id: number;
  code: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  barangay: string | null;
  zoneId: number | null;
  status: 'PUBLISHED' | 'WITHDRAWN';
  recipients: number;
  read: number;
  publishedBy: string | null;
  publishedAt: string;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  withdrawReason: string | null;
}

export function AnnouncementsPage() {
  const { isReviewer } = useAuth();
  const { data, isLoading, error } = useApi<Announcement[]>('/api/announcements');
  const zones = useApi<Zone[]>('/api/zones');
  const [open, setOpen] = useState(false);
  const [withdraw, setWithdraw] = useState<Announcement | null>(null);
  const form = useZodForm(announcementSchema, {});
  const { busy, save } = useFormSave(form);
  useResetOnOpen(open, form, { title: '', body: '', audience: 'ALL', barangay: '', zoneId: '' });
  const e = form.formState.errors;
  const audience = form.watch('audience') as AnnouncementAudience;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const active = (zones.data ?? []).filter((z) => z.status === 'ACTIVE');
  const who = (a: Announcement) =>
    a.audience === 'ALL'
      ? 'All livestock owners'
      : a.audience === 'BARANGAY'
        ? `Barangay ${a.barangay}`
        : `Farms inside ${zones.data?.find((z) => z.id === a.zoneId)?.code ?? 'a monitoring zone'}`;
  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Advisories for livestock owners, sent to their owner app. A wrong announcement is withdrawn (kept on record), never deleted."
        actions={
          isReviewer && (
            <Button onClick={() => setOpen(true)}>
              <Megaphone /> New Announcement
            </Button>
          )
        }
      />
      <Card>
        {data.length === 0 && <EmptyState>No announcement has been published.</EmptyState>}
        {data.map((a) => (
          <div key={a.id} className="border-b border-slate-100 p-4 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className={`text-[16px] ${a.status === 'WITHDRAWN' ? 'text-slate-400 line-through' : ''}`}>
                {a.code} · {a.title}
              </b>
              <Badge tone={a.status === 'PUBLISHED' ? 'green' : 'slate'}>
                {a.status === 'PUBLISHED' ? 'Published' : 'Withdrawn'}
              </Badge>
            </div>
            <p className="text-[14px] text-slate-600">
              To: {who(a)} · {fmtDateTime(a.publishedAt)} by {a.publishedBy} · sent to {a.recipients} owner
              {a.recipients === 1 ? '' : 's'}, read by {a.read}
            </p>
            <p className="mt-2 whitespace-pre-line text-[15px]">{a.body}</p>
            {a.status === 'WITHDRAWN' && (
              <p className="mt-2 text-[14px] text-slate-600">
                Withdrawn {fmtDateTime(a.withdrawnAt!)} by {a.withdrawnBy}: {a.withdrawReason}
              </p>
            )}
            {isReviewer && a.status === 'PUBLISHED' && (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setWithdraw(a)}>
                Withdraw
              </Button>
            )}
          </div>
        ))}
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New Announcement"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="announcement-form" type="submit" loading={busy}>
              Publish
            </Button>
          </>
        }
      >
        <form
          id="announcement-form"
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            if (
              await save(
                () => api.post<Announcement>('/api/announcements', v),
                (r) => `${r.code} published to ${r.recipients} owner(s).`,
              )
            )
              setOpen(false);
          })}
        >
          <Field label="Title *" error={err(e, 'title')}>
            <Input {...form.register('title')} />
          </Field>
          <Field label="Announcement *" error={err(e, 'body')}>
            <Textarea rows={6} {...form.register('body')} />
          </Field>
          <Field label="Send To *" error={err(e, 'audience')}>
            <Select {...form.register('audience')}>
              {(Object.keys(ANNOUNCEMENT_AUDIENCE_LABELS) as AnnouncementAudience[]).map((k) => (
                <option key={k} value={k}>
                  {ANNOUNCEMENT_AUDIENCE_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          {audience === 'BARANGAY' && (
            <Field label="Barangay *" error={err(e, 'barangay')}>
              <Select {...form.register('barangay')}>
                <option value="">Select…</option>
                {BARANGAYS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
          )}
          {audience === 'ZONE' && (
            <Field
              label="Monitoring Zone *"
              error={err(e, 'zoneId')}
              hint={active.length ? undefined : 'There is no active monitoring zone.'}
            >
              <Select {...form.register('zoneId')}>
                <option value="">Select…</option>
                {active.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code} · {z.disease} · {z.barangay} · {formatDistance(z.radiusM)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600">
            A published announcement cannot be edited. To correct one, withdraw it and publish a new one.
          </p>
        </form>
      </Dialog>
      <ReasonDialog
        ask={
          withdraw && {
            title: `Withdraw ${withdraw.code}?`,
            body: <>Owners no longer see it in their app. It stays on record as withdrawn.</>,
            label: 'Reason',
            confirm: 'Withdraw',
            done: 'Announcement withdrawn.',
            run: (reason) => api.post(`/api/announcements/${withdraw.id}/withdraw`, { reason }),
          }
        }
        onClose={() => setWithdraw(null)}
      />
    </div>
  );
}
