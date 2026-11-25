import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  History,
  IdCard,
  KeyRound,
  MapPin,
  MessageSquare,
  Plus,
  Undo2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CLINICAL_SIGN_LABELS,
  FARM_CHECKS,
  FARM_CHECK_LABELS,
  MONITORED_DISEASES,
  OWNER_CHECKS,
  OWNER_CHECK_LABELS,
  POP_REQUEST_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
  REPORT_CHECKS,
  REPORT_CHECK_LABELS,
  SERVICE_REQUEST_STATUS_LABELS,
  fmtDate,
  fmtDateTime,
  formatDistance,
  isoDate,
  type ClinicalSign,
  type PopRequestStatus,
  type RegistrationStatus,
  type ServiceRequestStatus,
} from '@livestock/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useLookups } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { ErrorBox, Loading } from '@/components/page';
import { Badge, Button, Card, Dialog, Field, Input, Select, Textarea, type Tone } from '@/components/ui';

const MapView = lazy(() => import('@/components/MapView').then((m) => ({ default: m.MapView })));

/**
 * The review queue: what livestock owners sent from the owner app and is waiting for the office.
 * Every tab is a list on the left and the full application on the right (one or the other on a
 * phone). A decision is never one click: the reviewer confirms a checklist, writes what the owner
 * is told, sees exactly what will happen, and only then confirms. All staff can look; the decisions
 * are for reviewers (System Administrator, Veterinarian).
 */

export interface ReviewCounts {
  owners: number;
  farms: number;
  population: number;
  reports: number;
  vaccinations: number;
  services: number;
  total: number;
}
export const useReviewCounts = () => useApi<ReviewCounts>('/api/review/summary', { refetchInterval: 60_000 });

/* =====================================================================================
 * Shared pieces: list + detail layout, sections, the step-by-step decision dialog
 * ===================================================================================== */

/** The selected item of a tab, kept in the address so it survives a reload and can be shared. */
function useSelected(param = 'item') {
  const [params, setParams] = useSearchParams();
  const selected = params.get(param);
  const select = (v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(param, v);
    else p.delete(param);
    setParams(p, { replace: true });
  };
  return [selected, select] as const;
}

/** One row of a queue: opens the item on the right. */
function ListItem({
  active,
  onClick,
  title,
  sub,
  meta,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: ReactNode;
  sub?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'block w-full border-b border-l-4 border-b-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50',
        active ? 'border-l-brand-strong bg-brand-light/60' : 'border-l-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 text-[15px] text-slate-900">{title}</b>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      {sub && <p className="mt-0.5 truncate text-[14px] text-slate-600">{sub}</p>}
      {meta && <p className="mt-0.5 text-[13px] text-slate-500">{meta}</p>}
    </button>
  );
}

/** The full view of one item: back arrow, title, sections, and the decision buttons at the bottom. */
function DetailCard({
  title,
  sub,
  badge,
  onBack,
  children,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  onBack: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
        <BackButton onClick={onBack} label="Back to the list" className="-ml-1" />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold leading-tight text-slate-900">{title}</h2>
            {badge}
          </div>
          {sub && <p className="mt-0.5 text-[14px] text-slate-600">{sub}</p>}
        </div>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
      {actions && (
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          {actions}
        </div>
      )}
    </Card>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 py-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </h3>
      <div className="text-[15px] text-slate-800">{children}</div>
    </section>
  );
}

/** Label and value pairs in two columns on wider screens. */
function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[13px] text-slate-500">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Warning({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-900">
      <b className="flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 shrink-0" /> {title}
      </b>
      {children}
    </div>
  );
}

function Photos({
  photos,
  alt,
  big,
}: {
  photos: { key: string; url: string }[];
  alt: string;
  big?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {photos.map((p, i) => (
        <a key={p.key} href={p.url} target="_blank" rel="noreferrer" className="group relative">
          <img
            src={p.url}
            alt={`${alt} ${i + 1}`}
            className={cn(
              'rounded-lg border border-slate-200 bg-slate-50 object-contain',
              big ? 'h-44 w-72 max-w-full' : 'h-24 w-24 object-cover',
            )}
          />
          <span className="absolute right-1.5 top-1.5 hidden rounded bg-black/60 p-1 text-white group-hover:block">
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </a>
      ))}
    </div>
  );
}

function Timeline({ items }: { items: { at: string; text: string; by?: string | null }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((h, i) => (
        <li key={i} className="flex gap-3 text-[14px]">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
          <span>
            <span className="text-slate-800">{h.text}</span>
            <span className="block text-[13px] text-slate-500">
              {fmtDateTime(h.at)}
              {h.by ? ` · ${h.by}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const Waiting = ({ days, overdue }: { days: number; overdue?: boolean }) => (
  <Badge tone={overdue ? 'red' : 'slate'}>
    {days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}
    {overdue ? ' · Overdue' : ''}
  </Badge>
);
const ReviewerOnly = () => (
  <p className="text-[14px] text-slate-500">A veterinarian or the administrator decides.</p>
);

/**
 * A decision in two steps. Step 1 "Review": tick every checklist item and fill what is needed.
 * Step 2 "Confirm": what will happen and the exact message the owner will receive.
 */
interface Decision {
  title: string;
  /** Every item must be ticked before going on */
  checks?: { code: string; label: string }[];
  /** Extra fields shown in step 1 (controlled by the caller) */
  fields?: ReactNode;
  /** Checked when going to step 2; return an error to stay */
  validate?: () => string | null;
  reasonLabel?: string;
  reasonRequired?: boolean;
  reasonHint?: string;
  /** What will happen, in plain words */
  effects: string[];
  /** The notification the owner will get */
  preview?: (reason: string) => { title: string; body: string };
  confirm: string;
  danger?: boolean;
  done: string;
  run: (reason: string, checklist: string[]) => Promise<unknown>;
}

function DecisionDialog({ ask, onClose }: { ask: Decision | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Start fresh for each new decision (the same decision may be refreshed while typing).
  const key = ask?.title;
  useEffect(() => {
    if (key) {
      setStep(0);
      setReason('');
      setTicked([]);
      setError(null);
    }
  }, [key]);
  if (!ask) return null;
  const needsReview = !!(ask.checks?.length || ask.fields || ask.reasonLabel);
  const atConfirm = !needsReview || step === 1;
  const next = () => {
    if (ask.checks && ticked.length < ask.checks.length)
      return setError('Confirm every item in the checklist first.');
    if (ask.reasonRequired && !reason.trim()) return setError('Give the reason');
    const v = ask.validate?.();
    if (v) return setError(v);
    setError(null);
    setStep(1);
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await ask.run(reason.trim(), ticked);
      toast.success(ask.done);
      await qc.invalidateQueries();
      onClose();
    } catch (x) {
      const fe = x instanceof ApiError ? x.fieldErrors : undefined;
      setError(fe ? Object.values(fe)[0][0] : x instanceof Error ? x.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const msg = ask.preview?.(reason.trim());
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={ask.title}
      size="md"
      guardChanges={false}
      footer={
        <>
          {atConfirm && needsReview ? (
            <Button variant="outline" onClick={() => setStep(0)}>
              Previous
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          {atConfirm ? (
            <Button variant={ask.danger ? 'destructive' : 'default'} loading={busy} onClick={submit}>
              {ask.confirm}
            </Button>
          ) : (
            <Button onClick={next}>Next: Review and Confirm</Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[15px] text-slate-700">
        {needsReview && (
          <ol className="flex gap-2 text-[13px]" aria-label="Steps">
            {['Review', 'Confirm'].map((s, i) => (
              <li
                key={s}
                aria-current={(atConfirm ? 1 : 0) === i ? 'step' : undefined}
                className={cn(
                  'flex-1 rounded-full px-3 py-1 text-center font-medium',
                  (atConfirm ? 1 : 0) === i ? 'bg-brand-strong text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        )}
        {!atConfirm && (
          <>
            {ask.checks && (
              <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-[14px] font-semibold text-slate-900">Checklist</legend>
                {ask.checks.map((c) => (
                  <label key={c.code} className="flex items-start gap-2.5 text-[15px]">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-brand-strong"
                      checked={ticked.includes(c.code)}
                      onChange={(e) =>
                        setTicked(e.target.checked ? [...ticked, c.code] : ticked.filter((x) => x !== c.code))
                      }
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {ask.fields}
            {ask.reasonLabel && (
              <Field
                label={`${ask.reasonLabel}${ask.reasonRequired ? ' *' : ''}`}
                hint={ask.reasonHint ?? 'The owner sees this in the app'}
              >
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
          </>
        )}
        {atConfirm && (
          <>
            <div>
              <div className="mb-1 font-semibold text-slate-900">What Will Happen</div>
              <ul className="list-disc space-y-1 pl-5">
                {ask.effects.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
            {msg && (
              <div>
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-900">
                  <Bell className="h-4 w-4" /> The Owner Will Receive
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[15px] font-semibold text-slate-900">{msg.title}</div>
                  <p className="mt-1 whitespace-pre-line text-[14px]">{msg.body}</p>
                </div>
              </div>
            )}
          </>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/* =====================================================================================
 * Registrations: new owners and new farms
 * ===================================================================================== */

interface OwnerApp {
  id: number;
  code: string;
  fullName: string;
  barangay: string;
  zone: string | null;
  street: string | null;
  contact: string | null;
  email: string | null;
  rsbsa: string | null;
  registeredAt: string;
  submittedAt: string;
  waitingDays: number;
  overdue: boolean;
  returnReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  idTypeLabel: string | null;
  idNumber: string | null;
  idPhotos: { key: string; url: string }[];
  account: { phone: string | null; email: string; lastLoginAt: string | null } | null;
  farmRegistrations: { id: number; code: string; name: string; status: string }[];
  history: { action: string; summary: string; byName: string | null; createdAt: string }[];
  duplicates: { id: number; code: string; fullName: string; barangay: string; contact: string | null }[];
}
interface FarmApp {
  id: number;
  code: string;
  name: string;
  type: string;
  barangay: string;
  zone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  livestock: { species: string; count: number }[];
  status: RegistrationStatus;
  returnReason: string | null;
  submittedAt: string;
  waitingDays: number;
  overdue: boolean;
  owner: { id: number; code: string; fullName: string; status: string; contact: string | null };
  nearby: { id: number; code: string; name: string; sameOwner: boolean; distance: number }[];
}
interface RegData {
  reviewDays: number;
  owners: OwnerApp[];
  farms: FarmApp[];
}

function OwnerDetail({
  o,
  onBack,
  onOpenFarm,
}: {
  o: OwnerApp;
  onBack: () => void;
  onOpenFarm: (id: number) => void;
}) {
  const { isReviewer } = useAuth();
  const [ask, setAsk] = useState<Decision | null>(null);
  const name = o.fullName;
  const verify: Decision = {
    title: `Verify ${name}`,
    checks: OWNER_CHECKS.map((c) => ({ code: c, label: OWNER_CHECK_LABELS[c] })),
    effects: [
      `${name} becomes a verified livestock owner (${o.code}).`,
      'They can report sick animals, update head counts and sign up for vaccination once their farm is verified.',
      'Your name, the time and the checklist are kept in the audit trail.',
    ],
    preview: () => ({
      title: 'Your registration is verified',
      body: `The City Veterinary Office verified your registration. Your registration number is ${o.code}.`,
    }),
    confirm: 'Confirm and Verify',
    done: `${name} verified.`,
    run: (_r, checklist) => api.post(`/api/review/owners/${o.id}`, { decision: 'APPROVE', checklist }),
  };
  const back: Decision = {
    title: `Return ${name} for Correction`,
    reasonLabel: 'What should the owner correct?',
    reasonRequired: true,
    reasonHint: 'Be specific, for example: "The ID photo is blurred. Take a new photo in good light."',
    effects: [
      'The application leaves the waiting list until the owner corrects it and sends it again.',
      'Nothing is deleted.',
    ],
    preview: (r) => ({
      title: 'Please correct your registration',
      body: `The City Veterinary Office returned your registration: ${r}\n\nOpen Verification, correct it and send it again.`,
    }),
    confirm: 'Confirm and Return',
    done: 'Returned to the owner.',
    run: (reason) => api.post(`/api/review/owners/${o.id}`, { decision: 'RETURN', reason }),
  };
  const reject: Decision = {
    title: `Do Not Accept ${name}`,
    reasonLabel: 'Reason',
    reasonRequired: true,
    reasonHint: 'For example: a duplicate of an owner already registered, or not a resident of Naga City.',
    effects: [
      'The registration is set inactive and kept on record (not deleted).',
      'The owner app closes for this account. The owner sees the reason and the office contact.',
      'The office can still correct and reactivate the record later.',
    ],
    preview: (r) => ({
      title: 'Your registration was not accepted',
      body: `The City Veterinary Office did not accept your registration: ${r}\n\nVisit or call the office if you think this is a mistake.`,
    }),
    confirm: 'Confirm: Do Not Accept',
    danger: true,
    done: 'Registration not accepted.',
    run: (reason) => api.post(`/api/review/owners/${o.id}`, { decision: 'INACTIVE', reason }),
  };
  return (
    <DetailCard
      onBack={onBack}
      title={name}
      sub={`Owner application · ${o.code}`}
      badge={
        o.returnReason ? (
          <Badge tone="amber">Returned, Waiting for the Owner</Badge>
        ) : (
          <Waiting days={o.waitingDays} overdue={o.overdue} />
        )
      }
      actions={
        isReviewer ? (
          <>
            <Button onClick={() => setAsk(verify)} disabled={!o.idPhotos.length}>
              <ClipboardCheck /> Verify
            </Button>
            <Button variant="outline" onClick={() => setAsk(back)}>
              <Undo2 /> Return for Correction
            </Button>
            <Button variant="outline" className="text-red-700" onClick={() => setAsk(reject)}>
              <X /> Do Not Accept
            </Button>
            {!o.idPhotos.length && (
              <p className="w-full text-[13px] text-amber-800">
                No ID was sent. Return the application and ask for a photo of a valid ID.
              </p>
            )}
          </>
        ) : (
          <ReviewerOnly />
        )
      }
    >
      {o.returnReason && (
        <Section title="Returned">
          <p className="text-amber-800">{o.returnReason}</p>
          {o.reviewedBy && (
            <p className="text-[13px] text-slate-500">
              By {o.reviewedBy}
              {o.reviewedAt ? `, ${fmtDateTime(o.reviewedAt)}` : ''}
            </p>
          )}
        </Section>
      )}
      <Section title="Applicant">
        <Facts
          rows={[
            ['Full Name', o.fullName],
            ['Mobile Number', o.contact ?? 'None'],
            ['Email', o.email],
            ['Address', [o.street, o.zone, o.barangay, 'Naga City'].filter(Boolean).join(', ')],
            ['RSBSA Control No.', o.rsbsa],
            ['Registered', fmtDateTime(o.registeredAt)],
            ['Last Sign-In', o.account?.lastLoginAt ? fmtDateTime(o.account.lastLoginAt) : 'Never'],
          ]}
        />
      </Section>
      <Section title="Valid ID" icon={<IdCard className="h-4 w-4" />}>
        {o.idPhotos.length ? (
          <div className="space-y-3">
            <Facts
              rows={[
                ['Type of ID', o.idTypeLabel],
                ['ID Number', o.idNumber],
              ]}
            />
            <Photos photos={o.idPhotos} alt="ID photo" big />
            <p className="text-[13px] text-slate-500">Open a photo to see it full size.</p>
          </div>
        ) : (
          <p className="text-amber-800">No ID sent yet.</p>
        )}
      </Section>
      {o.duplicates.length > 0 && (
        <Section title="Possible Duplicates">
          <Warning title="Same name in the same barangay, or the same mobile number">
            {o.duplicates.map((x) => (
              <div key={x.id}>
                <Link to={`/owners/${x.id}`} className="underline">
                  {x.code} {x.fullName}
                </Link>{' '}
                · {x.barangay}
                {x.contact ? ` · ${x.contact}` : ''}
              </div>
            ))}
          </Warning>
        </Section>
      )}
      {o.farmRegistrations.length > 0 && (
        <Section title="Farms Sent by This Owner">
          <ul className="space-y-1">
            {o.farmRegistrations.map((f) => (
              <li key={f.id}>
                <button type="button" className="text-brand-dark underline" onClick={() => onOpenFarm(f.id)}>
                  {f.code} {f.name}
                </button>{' '}
                <span className="text-[13px] text-slate-500">
                  · {REGISTRATION_STATUS_LABELS[f.status as RegistrationStatus] ?? f.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[13px] text-slate-500">Verify the owner first, then the farm.</p>
        </Section>
      )}
      {o.history.length > 0 && (
        <Section title="History" icon={<History className="h-4 w-4" />}>
          <Timeline items={o.history.map((h) => ({ at: h.createdAt, text: h.summary, by: h.byName }))} />
        </Section>
      )}
      <DecisionDialog ask={ask} onClose={() => setAsk(null)} />
    </DetailCard>
  );
}

function FarmDetail({
  f,
  onBack,
  onOpenOwner,
}: {
  f: FarmApp;
  onBack: () => void;
  onOpenOwner: (id: number) => void;
}) {
  const { isReviewer } = useAuth();
  const [ask, setAsk] = useState<Decision | null>(null);
  const ownerPending = f.owner.status !== 'ACTIVE';
  const verify: Decision = {
    title: `Verify ${f.name}`,
    checks: FARM_CHECKS.map((c) => ({ code: c, label: FARM_CHECK_LABELS[c] })),
    effects: [
      `${f.name} goes into the farm masterlist, the map and the figures with its livestock (${f.livestock.map((l) => `${l.count} ${l.species}`).join(', ')}).`,
      'The owner can now update its head count and report sick animals.',
      'If the farm is inside an active monitoring area, the owner is alerted.',
    ],
    preview: () => ({
      title: `${f.name} is verified`,
      body: `Your farm ${f.name} is verified. You can now update its head count and report sick animals.`,
    }),
    confirm: 'Confirm and Verify',
    done: `${f.name} verified.`,
    run: (_r, checklist) => api.post(`/api/review/farms/${f.id}`, { decision: 'APPROVE', checklist }),
  };
  const back: Decision = {
    title: `Return ${f.name} for Correction`,
    reasonLabel: 'What should the owner correct?',
    reasonRequired: true,
    reasonHint: 'For example: "The pin is on the road. Move it to the pig pen."',
    effects: ['The owner corrects the farm and sends it again. Nothing is deleted.'],
    preview: (r) => ({
      title: `Please correct ${f.name}`,
      body: `The City Veterinary Office returned the registration of ${f.name}: ${r}\n\nOpen it, correct it and send it again.`,
    }),
    confirm: 'Confirm and Return',
    done: 'Returned to the owner.',
    run: (reason) => api.post(`/api/review/farms/${f.id}`, { decision: 'RETURN', reason }),
  };
  const reject: Decision = {
    title: `Do Not Accept ${f.name}`,
    reasonLabel: 'Reason',
    reasonRequired: true,
    effects: ['The farm registration is set inactive and kept on record (not deleted).'],
    preview: (r) => ({
      title: `${f.name} was not accepted`,
      body: `The City Veterinary Office did not accept the registration of ${f.name}: ${r}`,
    }),
    confirm: 'Confirm: Do Not Accept',
    danger: true,
    done: 'Farm registration not accepted.',
    run: (reason) => api.post(`/api/review/farms/${f.id}`, { decision: 'INACTIVE', reason }),
  };
  return (
    <DetailCard
      onBack={onBack}
      title={f.name}
      sub={`Farm application · ${f.code}`}
      badge={
        f.status === 'RETURNED' ? (
          <Badge tone="amber">Returned, Waiting for the Owner</Badge>
        ) : (
          <Waiting days={f.waitingDays} overdue={f.overdue} />
        )
      }
      actions={
        f.status !== 'PENDING' ? undefined : isReviewer ? (
          <>
            <Button onClick={() => setAsk(verify)} disabled={ownerPending}>
              <ClipboardCheck /> Verify
            </Button>
            <Button variant="outline" onClick={() => setAsk(back)}>
              <Undo2 /> Return for Correction
            </Button>
            <Button variant="outline" className="text-red-700" onClick={() => setAsk(reject)}>
              <X /> Do Not Accept
            </Button>
            {ownerPending && (
              <p className="w-full text-[13px] text-amber-800">
                The owner is not verified yet. Verify the owner first, then the farm.
              </p>
            )}
          </>
        ) : (
          <ReviewerOnly />
        )
      }
    >
      {f.returnReason && (
        <Section title="Returned">
          <p className="text-amber-800">{f.returnReason}</p>
        </Section>
      )}
      <Section title="Farm">
        <Facts
          rows={[
            ['Farm Name', f.name],
            ['Type', f.type === 'backyard' ? 'Backyard' : 'Commercial'],
            ['Address', [f.address, f.zone, f.barangay].filter(Boolean).join(', ')],
            ['Sent', fmtDateTime(f.submittedAt)],
          ]}
        />
      </Section>
      <Section title="Owner">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {f.owner.fullName} ({f.owner.code}){f.owner.contact ? ` · ${f.owner.contact}` : ''}
          </span>
          {ownerPending ? (
            <>
              <Badge tone="amber">Not Verified Yet</Badge>
              <button
                type="button"
                className="text-[14px] text-brand-dark underline"
                onClick={() => onOpenOwner(f.owner.id)}
              >
                Open the owner's application
              </button>
            </>
          ) : (
            <Badge tone="green">Verified</Badge>
          )}
        </div>
      </Section>
      <Section title="Declared Livestock">
        <table className="w-full max-w-sm text-[15px]">
          <tbody>
            {f.livestock.map((l) => (
              <tr key={l.species} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5">{l.species}</td>
                <td className="py-1.5 text-right font-semibold">{l.count} head</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Location" icon={<MapPin className="h-4 w-4" />}>
        {f.lat != null && f.lng != null ? (
          <div className="space-y-2">
            <Suspense fallback={<div className="h-64 rounded-xl bg-slate-100" />}>
              <div className="isolate h-64 overflow-hidden rounded-xl border border-slate-200">
                <MapView
                  className="h-full"
                  pin={{ lat: f.lat, lng: f.lng, accuracy: f.gpsAccuracy, label: f.name }}
                  focusCircle={{ lat: f.lat, lng: f.lng, radius: Math.max(60, f.gpsAccuracy ?? 0) }}
                  fitKey={`${f.id}-${f.lat}-${f.lng}`}
                />
              </div>
            </Suspense>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-slate-600">
              <span>
                {f.lat.toFixed(5)}, {f.lng.toFixed(5)} ·{' '}
                {f.gpsAccuracy != null
                  ? `phone GPS, about ${Math.round(f.gpsAccuracy)} m (blue circle)`
                  : 'pin placed on the map by the owner'}
              </span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-dark underline"
              >
                Open in Google Maps <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
          </div>
        ) : (
          <p className="text-amber-800">No location given.</p>
        )}
        {f.nearby.length > 0 && (
          <div className="mt-3">
            <Warning title="A farm is already recorded at this spot">
              {f.nearby.map((x) => (
                <div key={x.id}>
                  <Link to={`/farms/${x.id}`} className="underline">
                    {x.code} {x.name}
                  </Link>{' '}
                  · {formatDistance(x.distance)} away{x.sameOwner ? ' · same owner' : ' · another owner'}
                </div>
              ))}
            </Warning>
          </div>
        )}
      </Section>
      <DecisionDialog ask={ask} onClose={() => setAsk(null)} />
    </DetailCard>
  );
}

/* =====================================================================================
 * Head count updates
 * ===================================================================================== */

interface PopRow {
  id: number;
  species: string;
  reasonLabel: string;
  quantity: number;
  before: number;
  after: number;
  note: string | null;
  status: PopRequestStatus;
  flagged: boolean;
  flagReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  waitingDays: number;
  farm?: { id: number; code: string; name: string; barangay: string };
  owner?: { id: number; fullName: string; contact: string | null };
}

function PopulationDetail({ r, onBack }: { r: PopRow; onBack: () => void }) {
  const { isReviewer } = useAuth();
  const [ask, setAsk] = useState<Decision | null>(null);
  const farm = r.farm?.name ?? 'the farm';
  const accept: Decision = {
    title: `Accept ${r.species} ${r.before} → ${r.after}`,
    reasonLabel: r.flagged ? 'How did you confirm this change?' : 'Note',
    reasonRequired: r.flagged,
    reasonHint: r.flagged
      ? 'For example: "Called the owner; 12 goats bought from Pili, receipt seen." Kept on the record.'
      : 'Optional. Kept on the record.',
    effects: [
      `The ${r.species} count of ${farm} changes from ${r.before} to ${r.after}.`,
      'The earlier count stays in the history.',
    ],
    preview: () => ({
      title: 'Head count update accepted',
      body: `Your ${r.species} count for ${farm} is now ${r.after} (was ${r.before}).`,
    }),
    confirm: 'Confirm and Accept',
    done: 'Update accepted.',
    run: (reason) => api.post(`/api/review/population/${r.id}`, { decision: 'ACCEPT', reason }),
  };
  const cancel: Decision = {
    title: 'Cancel This Update',
    reasonLabel: 'Reason',
    reasonRequired: true,
    effects: [`The recorded count stays at ${r.before}.`, 'The update is kept on record as cancelled.'],
    preview: (x) => ({
      title: 'Head count update not accepted',
      body: `Your ${r.species} update for ${farm} was not accepted: ${x}\n\nThe recorded count stays at ${r.before}.`,
    }),
    confirm: 'Cancel the Update',
    danger: true,
    done: 'Update cancelled.',
    run: (reason) => api.post(`/api/review/population/${r.id}`, { decision: 'CANCEL', reason }),
  };
  return (
    <DetailCard
      onBack={onBack}
      title={`${r.species}: ${r.before} → ${r.after}`}
      sub={`${r.reasonLabel} · ${farm}`}
      badge={
        r.status === 'PENDING' ? (
          <Waiting days={r.waitingDays} />
        ) : (
          <Badge tone={r.status === 'ACCEPTED' ? 'green' : 'slate'}>
            {POP_REQUEST_STATUS_LABELS[r.status]}
            {r.decidedBy === 'System' ? ' Automatically' : ''}
          </Badge>
        )
      }
      actions={
        r.status !== 'PENDING' ? undefined : isReviewer ? (
          <>
            <Button onClick={() => setAsk(accept)}>
              <Check /> Accept
            </Button>
            <Button variant="outline" className="text-red-700" onClick={() => setAsk(cancel)}>
              <X /> Cancel
            </Button>
            {r.farm && (
              <Button variant="ghost" asChild>
                <Link to={`/farms/${r.farm.id}`}>Open Farm Record</Link>
              </Button>
            )}
          </>
        ) : (
          <ReviewerOnly />
        )
      }
    >
      {r.flagged && r.flagReason && (
        <Section title="Why It Needs Review">
          <Warning title={r.flagReason} />
        </Section>
      )}
      <Section title="Change">
        <Facts
          rows={[
            ['What Happened', r.reasonLabel],
            ['Change', `${r.quantity > 0 ? '+' : ''}${r.quantity} head`],
            ['Count Before', r.before],
            ['Count After', r.after],
            ["Owner's Note", r.note ? `"${r.note}"` : null],
            ['Sent', fmtDateTime(r.createdAt)],
          ]}
        />
      </Section>
      <Section title="Farm and Owner">
        <Facts
          rows={[
            [
              'Farm',
              r.farm ? (
                <Link
                  to={`/farms/${r.farm.id}`}
                  className="underline"
                >{`${r.farm.code} ${r.farm.name}`}</Link>
              ) : null,
            ],
            ['Barangay', r.farm?.barangay],
            ['Owner', r.owner?.fullName],
            ['Mobile Number', r.owner?.contact],
          ]}
        />
      </Section>
      {r.status !== 'PENDING' && r.decidedBy && r.decidedBy !== 'System' && (
        <Section title="Decision">
          <p>
            {POP_REQUEST_STATUS_LABELS[r.status]} by {r.decidedBy}
            {r.decidedAt ? `, ${fmtDateTime(r.decidedAt)}` : ''}
            {r.decisionNote ? `: ${r.decisionNote}` : ''}
          </p>
        </Section>
      )}
      <DecisionDialog ask={ask} onClose={() => setAsk(null)} />
    </DetailCard>
  );
}

/* =====================================================================================
 * Disease reports
 * ===================================================================================== */

interface ReportRow {
  id: number;
  code: string;
  status: string;
  species: string;
  affected: number;
  deaths: number;
  createdAt: string;
  waitingDays: number;
  overdue: boolean;
  owner: { id: number; fullName: string; contact: string | null };
  farm?: { id: number; code: string; name: string; barangay: string };
  caseId: number | null;
}
interface ReportDetail extends ReportRow {
  symptoms: string;
  signs: ClinicalSign[] | null;
  observedAt: string;
  photos: { key: string; url: string }[];
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  locationSource: string;
  distanceFromFarm: number | null;
  rejectReason: string | null;
  assessment: string | null;
  visitDate: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  recordedHead: number;
  flags: string[];
  messages: {
    id: number;
    fromOwner: boolean;
    byName: string;
    text: string;
    createdAt: string;
    photos: { key: string; url: string }[];
  }[];
  openCases: { id: number; code: string; disease: string; species: string; reportedAt: string }[];
  case: { id: number; code: string; disease: string } | null;
}
const REPORT_LABEL: Record<string, string> = {
  REPORTED: 'Waiting for Review',
  INFO_REQUESTED: 'Waiting for the Owner',
  VALIDATED: 'Validated',
  REJECTED: 'Rejected',
};
const REPORT_TONE: Record<string, Tone> = {
  REPORTED: 'blue',
  INFO_REQUESTED: 'amber',
  VALIDATED: 'green',
  REJECTED: 'slate',
};

function ReportPanel({ id, onBack }: { id: number; onBack: () => void }) {
  const { isReviewer } = useAuth();
  const { data: r, isLoading, error } = useApi<ReportDetail>(`/api/review/reports/${id}`);
  const [ask, setAsk] = useState<Decision | null>(null);
  const [validating, setValidating] = useState(false);
  if (isLoading)
    return (
      <Card>
        <Loading />
      </Card>
    );
  if (error || !r) return <ErrorBox error={error} />;
  const open = ['REPORTED', 'INFO_REQUESTED'].includes(r.status);
  const farm = r.farm?.name ?? 'your farm';
  const askOwner: Decision = {
    title: `Ask the Owner About ${r.code}`,
    reasonLabel: 'Question for the owner',
    reasonRequired: true,
    reasonHint: 'For example: "When did the first pig get sick? Send a photo of the skin."',
    effects: ['The report waits for the owner. It comes back to this list when the owner replies.'],
    preview: (m) => ({
      title: `Question about report ${r.code}`,
      body: `The City Veterinary Office asks: ${m}\n\nOpen the report and reply.`,
    }),
    confirm: 'Send Question',
    done: 'Question sent to the owner.',
    run: (message) => api.post(`/api/review/reports/${r.id}`, { decision: 'REQUEST_INFO', message }),
  };
  const reject: Decision = {
    title: `Reject ${r.code}`,
    reasonLabel: 'Reason for rejecting',
    reasonRequired: true,
    reasonHint: 'For example: "Sent by mistake, the same incident as CASE-0004."',
    effects: ['The report is closed as rejected and kept on record. No case is opened.'],
    preview: (m) => ({
      title: `Report ${r.code} was not accepted`,
      body: `The City Veterinary Office did not accept your report for ${farm}: ${m}\n\nIf your animals get worse, send a new report or call the office.`,
    }),
    confirm: 'Confirm and Reject',
    danger: true,
    done: 'Report rejected. The owner was told.',
    run: (message) => api.post(`/api/review/reports/${r.id}`, { decision: 'REJECT', message }),
  };
  return (
    <DetailCard
      onBack={onBack}
      title={`${r.code}: ${r.affected} ${r.species} Sick${r.deaths ? `, ${r.deaths} Dead` : ''}`}
      sub={`${r.farm?.name ?? ''} · ${r.farm?.barangay ?? ''} · ${r.owner.fullName}`}
      badge={<Badge tone={REPORT_TONE[r.status]}>{REPORT_LABEL[r.status]}</Badge>}
      actions={
        !open ? undefined : isReviewer ? (
          <>
            <Button onClick={() => setValidating(true)}>
              <ClipboardCheck /> Validate
            </Button>
            <Button variant="outline" onClick={() => setAsk(askOwner)}>
              <MessageSquare /> Ask the Owner
            </Button>
            <Button variant="outline" className="text-red-700" onClick={() => setAsk(reject)}>
              <X /> Reject
            </Button>
          </>
        ) : (
          <ReviewerOnly />
        )
      }
    >
      {r.flags.length > 0 && (
        <Section title="Check Before Deciding">
          <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-900">
            {r.flags.map((f) => (
              <li key={f} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {f}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="What the Owner Reported">
        <div className="space-y-3">
          {r.signs && r.signs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.signs.map((s) => (
                <Badge key={s} tone="orange">
                  {CLINICAL_SIGN_LABELS[s] ?? s}
                </Badge>
              ))}
            </div>
          )}
          <p className="whitespace-pre-line">{r.symptoms}</p>
          {r.photos.length > 0 && <Photos photos={r.photos} alt="Report photo" />}
          <Facts
            rows={[
              ['Sick', `${r.affected} ${r.species}`],
              ['Dead', r.deaths],
              ['First Seen', fmtDate(r.observedAt)],
              ['Sent', fmtDateTime(r.createdAt)],
              ['On Record at the Farm', `${r.recordedHead} ${r.species}`],
            ]}
          />
        </div>
      </Section>
      <Section title="Farm and Owner">
        <Facts
          rows={[
            [
              'Farm',
              r.farm ? (
                <Link
                  to={`/farms/${r.farm.id}`}
                  className="underline"
                >{`${r.farm.code} ${r.farm.name}`}</Link>
              ) : null,
            ],
            ['Barangay', r.farm?.barangay],
            ['Owner', r.owner.fullName],
            ['Mobile Number', r.owner.contact],
            [
              'Location',
              r.lat != null && r.lng != null ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-dark underline"
                >
                  <MapPin className="h-4 w-4" />
                  {r.locationSource === 'PHONE_GPS'
                    ? `Phone GPS${r.gpsAccuracy != null ? ` (about ${Math.round(r.gpsAccuracy)} m)` : ''}${r.distanceFromFarm != null ? `, ${formatDistance(r.distanceFromFarm)} from the farm pin` : ''}`
                    : "Farm's registered location"}
                </a>
              ) : null,
            ],
          ]}
        />
      </Section>
      {r.messages.length > 0 && (
        <Section title="Messages" icon={<MessageSquare className="h-4 w-4" />}>
          <div className="space-y-2">
            {r.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2',
                  m.fromOwner ? 'bg-slate-100' : 'ml-auto bg-brand-light',
                )}
              >
                <div className="text-[12px] text-slate-500">
                  {m.fromOwner ? `${m.byName} (owner)` : m.byName} · {fmtDateTime(m.createdAt)}
                </div>
                <p className="whitespace-pre-line text-[14px]">{m.text}</p>
                {m.photos.length > 0 && <Photos photos={m.photos} alt="Photo" />}
              </div>
            ))}
          </div>
        </Section>
      )}
      {(r.assessment || r.status === 'REJECTED' || r.case) && (
        <Section title="Decision">
          <div className="space-y-2">
            {r.assessment && (
              <p>
                <span className="text-slate-500">Assessment: </span>
                {r.assessment}
              </p>
            )}
            {r.visitDate && (
              <p>
                <span className="text-slate-500">Field visit: </span>
                {fmtDate(r.visitDate)}
              </p>
            )}
            {r.status === 'REJECTED' && (
              <p className="rounded-lg bg-slate-100 px-3 py-2">Rejected: {r.rejectReason}</p>
            )}
            {r.case && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                Validated. Follow it in{' '}
                <Link to={`/cases/${r.case.id}`} className="font-semibold underline">
                  {r.case.code} ({r.case.disease})
                </Link>
                .
              </p>
            )}
            {r.reviewedBy && (
              <p className="text-[13px] text-slate-500">
                By {r.reviewedBy}
                {r.reviewedAt ? `, ${fmtDateTime(r.reviewedAt)}` : ''}
              </p>
            )}
          </div>
        </Section>
      )}
      <DecisionDialog ask={ask} onClose={() => setAsk(null)} />
      {validating && <ValidateReportDialog r={r} onClose={() => setValidating(false)} />}
    </DetailCard>
  );
}

/** Validating a report: checklist and assessment, then the case and visit, then the message and confirm. */
function ValidateReportDialog({ r, onClose }: { r: ReportDetail; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lookups = useLookups();
  const [step, setStep] = useState(0);
  const [ticked, setTicked] = useState<string[]>([]);
  const [assessment, setAssessment] = useState('');
  const [caseId, setCaseId] = useState('');
  const [disease, setDisease] = useState('');
  const [assignedToId, setAssignedToId] = useState(String(user?.id ?? ''));
  const [visitDate, setVisitDate] = useState(isoDate(new Date(Date.now() + 86_400_000)));
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inspectors: { id: number; name: string }[] = lookups.data?.inspectors ?? [];
  const assignee = inspectors.find((u) => String(u.id) === assignedToId)?.name;
  const attachTo = r.openCases.find((c) => String(c.id) === caseId);
  const farm = r.farm?.name ?? 'your farm';
  const STEPS = ['Assess', 'Case and Visit', 'Confirm'];
  const next = () => {
    setError(null);
    if (step === 0) {
      if (ticked.length < REPORT_CHECKS.length) return setError('Confirm every item in the checklist first.');
      if (!assessment.trim()) return setError('Write your assessment.');
    }
    if (step === 1 && !caseId) {
      if (!disease.trim()) return setError('Select the suspected disease');
      if (!visitDate) return setError('Set the date of the field visit');
      if (visitDate < isoDate()) return setError('The visit date cannot be in the past');
    }
    setStep(step + 1);
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await api.post<{ caseCode?: string }>(`/api/review/reports/${r.id}`, {
        decision: 'VALIDATE',
        assessment,
        checklist: ticked,
        caseId: caseId || undefined,
        disease: caseId ? undefined : disease,
        assignedToId: caseId ? undefined : assignedToId || undefined,
        visitDate: caseId ? undefined : visitDate,
        message,
      });
      toast.success(`Report validated. Case ${out.caseCode} is under investigation.`);
      await qc.invalidateQueries();
      onClose();
    } catch (x) {
      const fe = x instanceof ApiError ? x.fieldErrors : undefined;
      setError(fe ? Object.values(fe)[0][0] : x instanceof Error ? x.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const ownerBody = `The City Veterinary Office accepted your report for ${farm}${attachTo ? ` (case ${attachTo.code})` : ''}. ${!caseId && visitDate ? `Staff will visit your farm on ${fmtDate(visitDate)}.` : 'Staff will visit or contact you.'} Keep the sick animals apart and do not move, sell or slaughter them.${message.trim() ? `\n\n${message.trim()}` : ''}`;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Validate ${r.code}`}
      size="md"
      guardChanges={false}
      footer={
        <>
          {step > 0 ? (
            <Button variant="outline" onClick={() => (setStep(step - 1), setError(null))}>
              Previous
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={next}>Next</Button>
          ) : (
            <Button loading={busy} onClick={submit}>
              {caseId ? 'Confirm and Attach to Case' : 'Confirm and Open the Case'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[15px] text-slate-700">
        <ol className="flex gap-2 text-[13px]" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={step === i ? 'step' : undefined}
              className={cn(
                'flex-1 rounded-full px-2 py-1 text-center font-medium',
                step === i
                  ? 'bg-brand-strong text-white'
                  : i < step
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500',
              )}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <>
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-[14px] font-semibold text-slate-900">Checklist</legend>
              {REPORT_CHECKS.map((c) => (
                <label key={c} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-brand-strong"
                    checked={ticked.includes(c)}
                    onChange={(e) =>
                      setTicked(e.target.checked ? [...ticked, c] : ticked.filter((x) => x !== c))
                    }
                  />
                  <span>{REPORT_CHECK_LABELS[c]}</span>
                </label>
              ))}
            </fieldset>
            <Field label="Your Assessment *" hint="Kept on the case record. The owner does not see this.">
              <Textarea
                aria-label="Your assessment"
                rows={3}
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                placeholder="For example: Fever, red skin and one death in 4 pigs; ASF cannot be ruled out."
              />
            </Field>
          </>
        )}
        {step === 1 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {r.openCases.length > 0 && (
              <Field label="Same Incident as an Open Case on This Farm?" className="sm:col-span-2">
                <Select
                  aria-label="Attach to an open case"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                >
                  <option value="">No, open a new case</option>
                  {r.openCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      Yes, attach to {c.code} ({c.disease}, {fmtDate(c.reportedAt)})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {!caseId && (
              <>
                <Field label="Suspected Disease *" className="sm:col-span-2">
                  <Input
                    aria-label="Suspected disease"
                    list="review-diseases"
                    value={disease}
                    onChange={(e) => setDisease(e.target.value)}
                  />
                  <datalist id="review-diseases">
                    {MONITORED_DISEASES.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Assign To *">
                  <Select
                    aria-label="Assign to"
                    value={assignedToId}
                    onChange={(e) => setAssignedToId(e.target.value)}
                  >
                    {inspectors.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Field Visit Date *">
                  <Input
                    aria-label="Field visit date"
                    type="date"
                    min={isoDate()}
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field
              label="Instructions for the Owner"
              className="sm:col-span-2"
              hint="Optional. Added to the message below."
            >
              <Textarea
                aria-label="Message to the owner"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
          </div>
        )}
        {step === 2 && (
          <>
            <div>
              <div className="mb-1 font-semibold text-slate-900">What Will Happen</div>
              <ul className="list-disc space-y-1 pl-5">
                {attachTo ? (
                  <li>
                    The report is attached to <b>{attachTo.code}</b> ({attachTo.disease}).
                  </li>
                ) : (
                  <>
                    <li>
                      A new disease case is opened: <b>{disease}</b> in {r.affected} {r.species} at {farm}.
                    </li>
                    <li>
                      Assigned to <b>{assignee ?? 'you'}</b>; field visit on <b>{fmtDate(visitDate)}</b>.
                    </li>
                  </>
                )}
                <li>Your assessment and checklist are kept on the record.</li>
              </ul>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-900">
                <Bell className="h-4 w-4" /> The Owner Will Receive
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-900">
                  Report {r.code} accepted: under investigation
                </div>
                <p className="mt-1 whitespace-pre-line text-[14px]">{ownerBody}</p>
              </div>
            </div>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/* =====================================================================================
 * Service requests
 * ===================================================================================== */

interface ServiceRow {
  id: number;
  code: string;
  serviceLabel: string;
  species: string | null;
  note: string | null;
  preferredDate: string | null;
  status: ServiceRequestStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  response: string | null;
  handledBy: string | null;
  createdAt: string;
  farm?: { id: number; code: string; name: string; barangay: string };
  owner?: { id: number; fullName: string; contact: string | null };
}
const SERVICE_TONE: Record<ServiceRequestStatus, Tone> = {
  REQUESTED: 'amber',
  SCHEDULED: 'blue',
  DONE: 'green',
  DECLINED: 'slate',
} as Record<ServiceRequestStatus, Tone>;

function ServiceDetail({ r, onBack }: { r: ServiceRow; onBack: () => void }) {
  const { canEdit } = useAuth();
  const [ask, setAsk] = useState<Decision | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const farm = r.farm?.name ?? 'your farm';
  const label = r.serviceLabel;
  // The values typed in step 1 are read when the dialog moves on, so keep the dialog in sync.
  const schedule = (): Decision => ({
    title: `Schedule ${r.code}`,
    fields: (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Visit Date *">
          <Input
            aria-label="Visit date"
            type="date"
            min={isoDate()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Time" hint="For example: 9:00 AM to 11:00 AM">
          <Input aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
    ),
    validate: () =>
      !date ? 'Enter the visit date' : date < isoDate() ? 'The date cannot be in the past' : null,
    reasonLabel: 'Note for the owner',
    reasonHint: 'Optional. For example: "Keep the goats penned in the morning."',
    effects: [`The request is scheduled. Staff mark it done after the visit.`],
    preview: (note) => ({
      title: `${label} scheduled`,
      body: `Your request (${r.code}) for ${farm} is scheduled on ${date ? fmtDate(date) : '…'}${time ? `, ${time}` : ''}.${note ? ` ${note}` : ''}`,
    }),
    confirm: 'Confirm and Notify Owner',
    done: 'Scheduled. The owner was told.',
    run: (response) =>
      api.post(`/api/review/service-requests/${r.id}`, {
        status: 'SCHEDULED',
        scheduledDate: date,
        scheduledTime: time,
        response,
      }),
  });
  const done: Decision = {
    title: `Mark ${r.code} Done`,
    reasonLabel: 'What was done',
    reasonHint: 'Optional. For example: "Dewormed 6 goats with albendazole."',
    effects: ['The request is closed as done.'],
    preview: (note) => ({
      title: `${label} done`,
      body: `Your request (${r.code}) for ${farm} is marked done.${note ? ` ${note}` : ''}`,
    }),
    confirm: 'Confirm: Done',
    done: 'Marked done.',
    run: (response) => api.post(`/api/review/service-requests/${r.id}`, { status: 'DONE', response }),
  };
  const decline: Decision = {
    title: `Decline ${r.code}`,
    reasonLabel: 'Reason',
    reasonRequired: true,
    effects: ['The request is closed as declined and kept on record.'],
    preview: (x) => ({
      title: `${label} request declined`,
      body: `Your request (${r.code}) for ${farm} was declined: ${x}`,
    }),
    confirm: 'Confirm: Decline',
    danger: true,
    done: 'Request declined.',
    run: (response) => api.post(`/api/review/service-requests/${r.id}`, { status: 'DECLINED', response }),
  };
  useEffect(() => {
    // Keep the open schedule dialog showing what is typed.
    setAsk((a) => (a && a.title === `Schedule ${r.code}` ? schedule() : a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, time]);
  const open = ['REQUESTED', 'SCHEDULED'].includes(r.status);
  return (
    <DetailCard
      onBack={onBack}
      title={`${r.code}: ${label}`}
      sub={`${farm} · ${r.owner?.fullName ?? ''}`}
      badge={
        <Badge tone={SERVICE_TONE[r.status] ?? 'slate'}>{SERVICE_REQUEST_STATUS_LABELS[r.status]}</Badge>
      }
      actions={
        open && canEdit ? (
          <>
            {r.status === 'REQUESTED' && (
              <Button
                onClick={() => {
                  setDate(r.preferredDate && r.preferredDate >= isoDate() ? r.preferredDate : '');
                  setTime('');
                  setAsk(schedule());
                }}
              >
                Schedule Visit
              </Button>
            )}
            {r.status === 'SCHEDULED' && <Button onClick={() => setAsk(done)}>Mark Done</Button>}
            <Button variant="outline" className="text-red-700" onClick={() => setAsk(decline)}>
              Decline
            </Button>
          </>
        ) : undefined
      }
    >
      <Section title="Request">
        <Facts
          rows={[
            ['Service', label],
            ['Livestock', r.species],
            ["Owner's Note", r.note ? `"${r.note}"` : null],
            ['Preferred Date', r.preferredDate ? fmtDate(r.preferredDate) : 'Any day'],
            ['Asked', fmtDateTime(r.createdAt)],
          ]}
        />
      </Section>
      <Section title="Farm and Owner">
        <Facts
          rows={[
            [
              'Farm',
              r.farm ? (
                <Link
                  to={`/farms/${r.farm.id}`}
                  className="underline"
                >{`${r.farm.code} ${r.farm.name}`}</Link>
              ) : null,
            ],
            ['Barangay', r.farm?.barangay],
            ['Owner', r.owner?.fullName],
            ['Mobile Number', r.owner?.contact],
          ]}
        />
      </Section>
      {(r.scheduledDate || r.response) && (
        <Section title="Schedule and Reply">
          <Facts
            rows={[
              [
                'Visit',
                r.scheduledDate
                  ? `${fmtDate(r.scheduledDate)}${r.scheduledTime ? `, ${r.scheduledTime}` : ''}`
                  : null,
              ],
              ['Reply to the Owner', r.response],
              ['Handled By', r.handledBy],
            ]}
          />
        </Section>
      )}
      <DecisionDialog ask={ask} onClose={() => setAsk(null)} />
    </DetailCard>
  );
}

/* =====================================================================================
 * Pending sections: what owners sent from the owner app, shown at the top of each page
 * (Livestock Owners, Farms, Population Monitoring, Disease Reports, Vaccination Schedule).
 * Opening an item slides the full review in from the right with the same step-by-step decision.
 * ===================================================================================== */

/** Right-side panel that holds one pending item. Closes with Esc, the back arrow, or outside. */
function SidePanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[900] bg-slate-900/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="app-scroll fixed inset-y-0 right-0 z-[901] w-full overflow-y-auto bg-slate-50 p-2 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right sm:max-w-[760px] sm:p-3"
        >
          <DialogPrimitive.Title className="sr-only">Pending item</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The "Pending" card at the top of a page. Hidden when nothing is waiting. Shows the first few
 * items; "Show all" lists the rest.
 */
function PendingCard({
  title,
  hint,
  count,
  children,
  action,
}: {
  title: string;
  hint: string;
  count: number;
  children: ReactNode[];
  action?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (children.length === 0) return null;
  const shown = all ? children : children.slice(0, 4);
  return (
    <Card className="mb-5 overflow-hidden border-l-4 border-l-amber-400">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600">
          <Bell className="h-4 w-4" aria-hidden />
        </span>
        <h2 className="text-[15px] font-semibold text-slate-900">
          {title}
          {count > 0 && (
            <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800">
              {count}
            </span>
          )}
        </h2>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-slate-600 md:block">{hint}</p>
        <div className="ml-auto flex items-center gap-2">
          {action}
          <Button size="xs" variant="ghost" onClick={() => setHidden(!hidden)}>
            {hidden ? 'Show' : 'Hide'}
          </Button>
        </div>
      </div>
      {!hidden && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 md:[&>*:nth-child(odd)]:border-r md:[&>*:nth-child(odd)]:border-r-slate-100">
            {shown}
          </div>
          {children.length > 4 && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="w-full border-t border-slate-100 py-2 text-[14px] font-medium text-brand-strong hover:bg-slate-50"
            >
              {all ? 'Show fewer' : `Show all ${children.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/** Owner registrations sent from the owner app (top of Livestock Owners). */
export function PendingOwners() {
  const { data } = useApi<RegData>('/api/review/registrations');
  const [sel, select] = useSelected('pending');
  const navigate = useNavigate();
  const owners = data?.owners ?? [];
  const o = owners.find((x) => String(x.id) === sel);
  return (
    <>
      <PendingCard
        title="Pending Owner Registrations"
        hint="Sent by owners from the owner app. Open one to check the ID and approve it."
        count={owners.filter((x) => !x.returnReason).length}
      >
        {owners.map((x) => (
          <ListItem
            key={x.id}
            active={o?.id === x.id}
            onClick={() => select(String(x.id))}
            title={x.fullName}
            sub={`${x.barangay} · ${x.contact ?? 'No mobile number'}`}
            meta={`${x.code} · sent ${fmtDate(x.submittedAt)}${x.idPhotos.length ? '' : ' · no ID'}`}
            badge={
              x.returnReason ? (
                <Badge tone="amber">With the Owner</Badge>
              ) : (
                <Waiting days={x.waitingDays} overdue={x.overdue} />
              )
            }
          />
        ))}
      </PendingCard>
      <SidePanel open={!!o} onClose={() => select(null)}>
        {o && (
          <OwnerDetail
            o={o}
            onBack={() => select(null)}
            onOpenFarm={(fid) => navigate(`/farms?pending=${fid}`)}
          />
        )}
      </SidePanel>
    </>
  );
}

/** Farm registrations sent from the owner app (top of Farms). */
export function PendingFarms() {
  const { data } = useApi<RegData>('/api/review/registrations');
  const [sel, select] = useSelected('pending');
  const navigate = useNavigate();
  const farms = data?.farms ?? [];
  const f = farms.find((x) => String(x.id) === sel);
  return (
    <>
      <PendingCard
        title="Pending Farm Registrations"
        hint="New farms added by owners. Open one to check the location and approve it."
        count={farms.filter((x) => x.status === 'PENDING').length}
      >
        {farms.map((x) => (
          <ListItem
            key={x.id}
            active={f?.id === x.id}
            onClick={() => select(String(x.id))}
            title={x.name}
            sub={`${x.barangay} · ${x.owner.fullName}`}
            meta={`${x.code} · ${x.livestock.map((l) => `${l.count} ${l.species}`).join(', ')}`}
            badge={
              x.status === 'RETURNED' ? (
                <Badge tone="amber">With the Owner</Badge>
              ) : (
                <Waiting days={x.waitingDays} overdue={x.overdue} />
              )
            }
          />
        ))}
      </PendingCard>
      <SidePanel open={!!f} onClose={() => select(null)}>
        {f && (
          <FarmDetail
            f={f}
            onBack={() => select(null)}
            onOpenOwner={(oid) => navigate(`/owners?pending=${oid}`)}
          />
        )}
      </SidePanel>
    </>
  );
}

/** Head count updates from owners that need a look (top of Population Monitoring). */
export function PendingPopulation() {
  const [all, setAll] = useState(false);
  const { data } = useApi<PopRow[]>(`/api/review/population${all ? '?all=1' : ''}`);
  const [sel, select] = useSelected('pending');
  const rows = data ?? [];
  const r = rows.find((x) => String(x.id) === sel);
  if (!all && rows.length === 0) return null;
  return (
    <>
      <PendingCard
        title={all ? 'Head Count Updates from Owners' : 'Pending Head Count Updates'}
        hint="Normal updates are accepted automatically. Only big or unusual changes wait here."
        count={rows.filter((x) => x.status === 'PENDING').length}
        action={
          <Button size="xs" variant="outline" onClick={() => setAll(!all)}>
            {all ? 'Only Waiting' : 'Show History'}
          </Button>
        }
      >
        {rows.map((x) => (
          <ListItem
            key={x.id}
            active={r?.id === x.id}
            onClick={() => select(String(x.id))}
            title={
              <>
                {x.farm?.name}: {x.species} {x.before} → {x.after}{' '}
                <span className={x.quantity < 0 ? 'text-red-700' : 'text-emerald-700'}>
                  ({x.quantity > 0 ? '+' : ''}
                  {x.quantity})
                </span>
              </>
            }
            sub={`${x.reasonLabel} · ${x.owner?.fullName ?? ''}`}
            meta={`Sent ${fmtDateTime(x.createdAt)}`}
            badge={
              x.status === 'PENDING' ? (
                <Waiting days={x.waitingDays} />
              ) : (
                <Badge tone={x.status === 'ACCEPTED' ? 'green' : 'slate'}>
                  {POP_REQUEST_STATUS_LABELS[x.status]}
                </Badge>
              )
            }
          />
        ))}
      </PendingCard>
      <SidePanel open={!!r} onClose={() => select(null)}>
        {r && <PopulationDetail r={r} onBack={() => select(null)} />}
      </SidePanel>
    </>
  );
}

/** Disease reports sent by owners, waiting for the office (top of Disease Reports). */
export function PendingReports() {
  const { data } = useApi<ReportRow[]>('/api/review/reports');
  const [sel, select] = useSelected('pending');
  const rows = data ?? [];
  const open = Number(sel) || null;
  return (
    <>
      <PendingCard
        title="Pending Reports from Owners"
        hint="Sick or dead animals reported in the owner app. Open one to validate it and open a case."
        count={rows.filter((x) => x.status === 'REPORTED').length}
      >
        {rows.map((r) => (
          <ListItem
            key={r.id}
            active={open === r.id}
            onClick={() => select(String(r.id))}
            title={`${r.code} · ${r.affected} ${r.species}${r.deaths ? `, ${r.deaths} dead` : ''}`}
            sub={`${r.farm?.name} · ${r.farm?.barangay} · ${r.owner.fullName}`}
            meta={`Sent ${fmtDateTime(r.createdAt)}`}
            badge={
              r.status === 'REPORTED' ? (
                <Waiting days={r.waitingDays} overdue={r.overdue} />
              ) : (
                <Badge tone={REPORT_TONE[r.status]}>{REPORT_LABEL[r.status]}</Badge>
              )
            }
          />
        ))}
      </PendingCard>
      {/* Opened by link too (a case's "owner report" link), so the panel does not need the list. */}
      <SidePanel open={!!open} onClose={() => select(null)}>
        {open && <ReportPanel id={open} onBack={() => select(null)} />}
      </SidePanel>
    </>
  );
}

/** Services owners asked for in the owner app (top of Vaccination Schedule). */
export function PendingServices() {
  const { data } = useApi<ServiceRow[]>('/api/review/service-requests');
  const [sel, select] = useSelected('pending');
  const rows = data ?? [];
  const r = rows.find((x) => String(x.id) === sel);
  return (
    <>
      <PendingCard
        title="Pending Requests from Owners"
        hint="Vaccination, deworming and other services owners asked for. Open one to schedule or answer it."
        count={rows.filter((x) => x.status === 'REQUESTED').length}
      >
        {rows.map((x) => (
          <ListItem
            key={x.id}
            active={r?.id === x.id}
            onClick={() => select(String(x.id))}
            title={`${x.serviceLabel}${x.species ? ` (${x.species})` : ''}`}
            sub={`${x.farm?.name} · ${x.owner?.fullName}`}
            meta={`${x.code} · asked ${fmtDate(x.createdAt)}${x.preferredDate ? ` · prefers ${fmtDate(x.preferredDate)}` : ''}`}
            badge={
              <Badge tone={SERVICE_TONE[x.status] ?? 'slate'}>
                {SERVICE_REQUEST_STATUS_LABELS[x.status]}
                {x.scheduledDate && x.status === 'SCHEDULED' ? `: ${fmtDate(x.scheduledDate)}` : ''}
              </Badge>
            }
          />
        ))}
      </PendingCard>
      <SidePanel open={!!r} onClose={() => select(null)}>
        {r && <ServiceDetail r={r} onBack={() => select(null)} />}
      </SidePanel>
    </>
  );
}

/* =====================================================================================
 * Owner app login, shown on the owner's record (replaces the old "Owner Logins" tab)
 * ===================================================================================== */

interface AccountRow {
  id: number;
  phone: string | null;
  email: string | null;
  status: string;
  locked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  owner: { id: number; code: string; fullName: string; barangay: string; status: string } | null;
}

/** The owner's login for the owner app: give one, or reset a forgotten password. */
export function OwnerLoginCard({
  ownerId,
  ownerName,
  ownerStatus,
  contact,
}: {
  ownerId: number;
  ownerName: string;
  ownerStatus: string;
  contact?: string | null;
}) {
  const { isReviewer } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useApi<AccountRow[]>('/api/review/accounts');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<null | { phone: string; password: string }>(null);
  const a = data?.find((x) => x.owner?.id === ownerId);
  const status = !a
    ? 'No login yet'
    : a.locked
      ? 'Locked after failed sign-ins'
      : a.mustChangePassword
        ? 'Temporary password (not changed yet)'
        : 'Active';
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
          <KeyRound className="h-4 w-4 text-slate-500" aria-hidden /> Owner App Login
        </h3>
        {a?.locked && <Badge tone="red">Locked</Badge>}
      </div>
      {isLoading ? (
        <p className="mt-2 text-[14px] text-slate-500">Loading…</p>
      ) : (
        <div className="mt-2 space-y-1 text-[14px] text-slate-700">
          {a ? (
            <>
              <p>
                Signs in with <b>{a.phone ?? a.email}</b>
              </p>
              <p>{status}</p>
              <p className="text-slate-500">
                Last sign-in: {a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'never'}
              </p>
            </>
          ) : (
            <p className="text-slate-500">This owner does not use the owner app yet.</p>
          )}
        </div>
      )}
      {isReviewer && !isLoading && (
        <div className="mt-3">
          {a ? (
            <Button size="sm" variant="outline" onClick={() => setResetting(true)}>
              <KeyRound /> Reset Password
            </Button>
          ) : ownerStatus === 'ACTIVE' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => (setAdding(true), setPhone(contact ?? ''), setErr(null))}
            >
              <Plus /> Give a Login
            </Button>
          ) : null}
        </div>
      )}
      <Dialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset Password"
        size="sm"
        guardChanges={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!a) return;
                setBusy(true);
                try {
                  const r = await api.post<{ temporaryPassword: string }>(
                    `/api/review/accounts/${a.id}/reset-password`,
                  );
                  setTemp({ phone: a.phone ?? a.email ?? '', password: r.temporaryPassword });
                  setResetting(false);
                  await qc.invalidateQueries();
                } catch (x) {
                  toast.error(x instanceof Error ? x.message : 'Could not reset.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm and Reset
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-[15px] text-slate-700">
          <p>
            A temporary password is made for <b>{ownerName}</b>. Their current password stops working and they
            are signed out on every phone.
          </p>
          <p>
            Only do this after confirming who is asking (for example, in person with an ID, or by calling the
            registered number).
          </p>
        </div>
      </Dialog>
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Give a Login"
        size="sm"
        guardChanges={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  const r = await api.post<{ phone: string; temporaryPassword: string }>(
                    `/api/review/accounts/${ownerId}`,
                    { phone },
                  );
                  setAdding(false);
                  setTemp({ phone: r.phone, password: r.temporaryPassword });
                  await qc.invalidateQueries();
                } catch (x) {
                  const fe = x instanceof ApiError ? x.fieldErrors : undefined;
                  setErr(fe ? Object.values(fe)[0][0] : x instanceof Error ? x.message : 'Could not save.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create Login
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[14px] text-slate-600">
            {ownerName} will sign in to the owner app with this mobile number and a temporary password.
          </p>
          <Field label="Mobile Number *" error={err ?? undefined} hint="The owner signs in with this number">
            <Input
              inputMode="tel"
              placeholder="09171234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
      </Dialog>
      <Dialog
        open={!!temp}
        onOpenChange={(o) => !o && setTemp(null)}
        title="Temporary Password"
        size="sm"
        guardChanges={false}
        footer={<Button onClick={() => setTemp(null)}>Done</Button>}
      >
        {temp && (
          <div className="space-y-3 text-[15px] text-slate-700">
            <p>
              Give this to <b>{ownerName}</b>. They sign in with <b>{temp.phone}</b> and this password, then
              choose their own.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <code className="select-all text-[18px] font-semibold tracking-wide">{temp.password}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.clipboard?.writeText(temp.password).then(() => toast.success('Copied.'))
                }
              >
                <Copy /> Copy
              </Button>
            </div>
            <p className="text-[13px] text-slate-500">Shown only once.</p>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
