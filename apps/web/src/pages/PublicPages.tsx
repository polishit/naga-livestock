import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  IdCard,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Syringe,
  UserRound,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  BARANGAYS,
  ID_TYPES,
  ID_TYPE_LABELS,
  PASSWORD_RULE,
  fmtDate,
  fmtDateTime,
  formatDistance,
  ownerRegisterSchema,
  type OwnerRegisterInput,
} from '@livestock/shared';
import { ApiError, api, shrinkImage } from '@/lib/api';
import { useAuth, type User } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import type { MapCase, MapZone } from '@/components/DiseaseMap';
import { DiseaseMapLegend } from '@/components/DiseaseMapLegend';
import { IdPhotoInput } from '@/components/IdPhotoInput';
import { LogoGlyph } from '@/components/Logo';
import { ErrorBox, Loading } from '@/components/page';
import { Button, Field, Input, Select } from '@/components/ui';

const DiseaseMap = lazy(() => import('@/components/DiseaseMap'));
const big = 'h-12 text-[16px]';

/** The page frame of the public pages: a header with the back arrow, then the content. */
function Shell({
  children,
  title,
  sub,
  back,
  width = 'max-w-6xl',
}: {
  children: React.ReactNode;
  title: string;
  sub?: string;
  back: string;
  width?: string;
}) {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="border-b-[3px] border-sidebar-accent bg-sidebar-ink text-white">
        <div className={cn('mx-auto flex items-center gap-3 px-4 py-3 md:px-6 md:py-4', width)}>
          <BackButton to={back} tone="light" className="-ml-2 h-11 w-11" />
          <LogoGlyph tile className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-white/20" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[17px] font-semibold md:text-[19px]">{title}</div>
            {sub && <div className="truncate text-[13px] text-white/80 md:text-[14px]">{sub}</div>}
          </div>
        </div>
      </header>
      <main className={cn('mx-auto px-4 py-5 md:px-6 md:py-8', width)}>{children}</main>
    </div>
  );
}

/* ---------------- owner registration ---------------- */

const STEPS = [
  { title: 'About You', icon: UserRound, fields: ['fullName', 'phone', 'email'] },
  { title: 'Address', icon: MapPin, fields: ['barangay', 'zone', 'street', 'rsbsa'] },
  { title: 'Valid ID', icon: IdCard, fields: ['idType', 'idNumber'] },
  { title: 'Password', icon: ShieldCheck, fields: ['password', 'confirm', 'consent'] },
] as const;

export function RegisterPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [frontError, setFrontError] = useState<string | undefined>();
  const form = useForm<OwnerRegisterInput>({
    resolver: zodResolver(ownerRegisterSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      zone: '',
      street: '',
      rsbsa: '',
      idNumber: '',
      password: '',
      confirm: '',
    } as never,
  });
  const e = form.formState.errors;
  if (user) return <Navigate to={user.role === 'OWNER' ? '/app' : '/'} replace />;

  const next = async () => {
    const ok = await form.trigger(STEPS[step].fields as never);
    if (step === 2) {
      setFrontError(front ? undefined : 'Add a photo of the front of your ID');
      if (!front) return;
    }
    if (ok) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
    }
  };

  const onSubmit = form.handleSubmit(
    async (v) => {
      setError(null);
      if (!front) {
        setFrontError('Add a photo of the front of your ID');
        setStep(2);
        return;
      }
      try {
        const fd = new FormData();
        fd.append('data', JSON.stringify(v));
        fd.append('idFront', await shrinkImage(front), 'id-front.jpg');
        if (back) fd.append('idBack', await shrinkImage(back), 'id-back.jpg');
        const r = await api.post<{ user: User }>('/api/auth/register', fd);
        setUser(r.user);
        navigate('/app', { replace: true });
      } catch (x) {
        if (x instanceof ApiError && x.fieldErrors) {
          for (const [f, m] of Object.entries(x.fieldErrors)) {
            if (f === 'idFront') setFrontError(m[0]);
            else form.setError(f as keyof OwnerRegisterInput, { type: 'server', message: m[0] });
          }
          const first = Object.keys(x.fieldErrors)[0];
          const at =
            first === 'idFront' ? 2 : STEPS.findIndex((s) => (s.fields as readonly string[]).includes(first));
          if (at >= 0) setStep(at);
        } else setError(x instanceof Error ? x.message : 'Could not create the account. Try again.');
      }
    },
    (errs) => {
      const first = Object.keys(errs)[0];
      const at = STEPS.findIndex((s) => (s.fields as readonly string[]).includes(first));
      if (at >= 0 && at !== step) setStep(at);
    },
  );

  const v = form.watch();
  return (
    <Shell title="Create an Owner Account" sub="Naga City Livestock · City Veterinary Office" back="/login">
      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="mb-5 space-y-4 lg:sticky lg:top-6 lg:mb-0">
          <ol className="grid grid-cols-4 gap-2 lg:grid-cols-1" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => i < step && setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[12px] lg:flex-row lg:gap-3 lg:px-3 lg:py-3 lg:text-[15px]',
                    i === step
                      ? 'border-brand-strong bg-white font-semibold text-brand-dark shadow-sm'
                      : i < step
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-500',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                      i < step
                        ? 'bg-emerald-600 text-white'
                        : i === step
                          ? 'bg-brand-strong text-white'
                          : 'bg-slate-100',
                    )}
                  >
                    {i < step ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className="text-center lg:text-left">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 text-[14px] text-slate-600 lg:block">
            <div className="mb-2 font-semibold text-slate-900">What You Need</div>
            <ul className="space-y-2">
              <li className="flex gap-2">
                <Smartphone className="h-4 w-4 shrink-0 text-brand-dark" /> Your own mobile number
              </li>
              <li className="flex gap-2">
                <IdCard className="h-4 w-4 shrink-0 text-brand-dark" /> One valid government ID with your
                photo
              </li>
            </ul>
            <p className="mt-3">
              The City Veterinary Office checks every registration, usually within 3 working days. You can
              register your farm while you wait.
            </p>
          </div>
        </aside>

        <form noValidate onSubmit={onSubmit} className="max-w-2xl space-y-4">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-wide text-slate-500">
                Step {step + 1} of {STEPS.length}
              </p>
              <h1 className="text-[22px] font-semibold leading-tight">{STEPS[step].title}</h1>
            </div>

            {step === 0 && (
              <>
                <Field label="Full Name *" error={e.fullName?.message} hint="As written on your ID">
                  <Input className={big} autoComplete="name" {...form.register('fullName')} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Mobile Number *"
                    error={e.phone?.message}
                    hint="You will sign in with this number"
                  >
                    <Input
                      className={big}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="09171234567"
                      {...form.register('phone')}
                    />
                  </Field>
                  <Field label="Email" error={e.email?.message} hint="Optional">
                    <Input className={big} type="email" autoComplete="email" {...form.register('email')} />
                  </Field>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Barangay *" error={e.barangay?.message}>
                    <Select className={big} {...form.register('barangay')}>
                      <option value="">Select…</option>
                      {BARANGAYS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Zone / Purok" error={e.zone?.message}>
                    <Input className={big} {...form.register('zone')} />
                  </Field>
                </div>
                <Field label="Street or Landmark" error={e.street?.message}>
                  <Input className={big} {...form.register('street')} />
                </Field>
                <Field
                  label="RSBSA Control No."
                  error={e.rsbsa?.message}
                  hint="Optional. If you are registered with the Department of Agriculture"
                >
                  <Input className={big} {...form.register('rsbsa')} />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-[15px] text-slate-600">
                  The office uses your ID only to confirm who you are. Other owners and the public never see
                  it.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Type of ID *" error={e.idType?.message}>
                    <Select className={big} {...form.register('idType')}>
                      <option value="">Select…</option>
                      {ID_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {ID_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="ID Number *" error={e.idNumber?.message}>
                    <Input className={big} {...form.register('idNumber')} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <IdPhotoInput
                    label="Front of ID"
                    file={front}
                    onChange={(f) => {
                      setFront(f);
                      if (f) setFrontError(undefined);
                    }}
                    error={frontError}
                  />
                  <IdPhotoInput label="Back of ID" optional file={back} onChange={setBack} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="rounded-xl bg-slate-50 p-3 text-[14px]">
                  <div className="mb-1 font-semibold text-slate-900">Please Check Your Details</div>
                  <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <div>
                      <dt className="inline text-slate-500">Name: </dt>
                      <dd className="inline">{v.fullName}</dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-500">Mobile: </dt>
                      <dd className="inline">{v.phone}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="inline text-slate-500">Address: </dt>
                      <dd className="inline">
                        {[v.street, v.zone, v.barangay, 'Naga City'].filter(Boolean).join(', ')}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="inline text-slate-500">ID: </dt>
                      <dd className="inline">
                        {v.idType ? ID_TYPE_LABELS[v.idType] : ''} · {v.idNumber} ·{' '}
                        {back ? 'front and back photos' : 'front photo'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Password *" error={e.password?.message} hint={PASSWORD_RULE}>
                    <Input
                      className={big}
                      type="password"
                      autoComplete="new-password"
                      {...form.register('password')}
                    />
                  </Field>
                  <Field label="Type the Password Again *" error={e.confirm?.message}>
                    <Input
                      className={big}
                      type="password"
                      autoComplete="new-password"
                      {...form.register('confirm')}
                    />
                  </Field>
                </div>
                <label className="flex items-start gap-3 text-[15px] text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 accent-brand-strong"
                    {...form.register('consent')}
                  />
                  <span>
                    I agree that the City Veterinary Office of Naga may keep and use my name, contact number,
                    address, ID and farm location to monitor livestock and animal diseases, under the Data
                    Privacy Act of 2012. Other owners and the public cannot see my details.
                  </span>
                </label>
                {e.consent && (
                  <p role="alert" className="-mt-2 text-[13px] text-red-600">
                    {e.consent.message}
                  </p>
                )}
              </>
            )}
          </section>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[15px] text-red-800"
            >
              {error}
            </p>
          )}
          <div className="flex gap-3">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                className={cn(big, 'flex-1 sm:flex-none sm:px-8')}
                onClick={() => setStep(step - 1)}
              >
                Previous
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                className={cn(big, 'flex-1 sm:flex-none sm:px-10')}
                onClick={() => void next()}
              >
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                loading={form.formState.isSubmitting}
                className={cn(big, 'flex-1 sm:flex-none sm:px-10')}
              >
                Create My Account
              </Button>
            )}
          </div>
          <p className="pb-6 text-[14px] text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="font-medium text-brand-dark underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </Shell>
  );
}

/* ---------------- public information ---------------- */

interface Overview {
  updatedAt: string;
  totals: {
    livestock: number;
    farms: number;
    confirmedOpen: number;
    activeZones: number;
    vaccinatedThisYear: number;
  };
  species: { species: string; count: number }[];
  barangays: {
    barangay: string;
    farms: number;
    livestock: number;
    confirmedOpen: number;
    diseases: string[];
    monitoring: boolean;
  }[];
  activities: {
    title: string;
    barangay: string;
    species: string;
    date: string;
    time: string | null;
    venue: string | null;
  }[];
  cases: MapCase[];
  zones: MapZone[];
}

const card = 'rounded-2xl border border-slate-200 bg-white p-4 md:p-5';
const h2 = 'text-[18px] font-semibold text-slate-900';

/** City-wide figures anyone can open: where confirmed cases are, without naming any owner or farm. */
export function PublicPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useApi<Overview>('/api/public/overview');
  const n = (x: number) => x.toLocaleString();
  const max = Math.max(1, ...(data?.barangays.map((b) => b.livestock) ?? [1]));
  return (
    <Shell
      title="Naga City Livestock Information"
      sub="City Veterinary Office · Public Summary"
      back={user ? (user.role === 'OWNER' ? '/app' : '/') : '/login'}
    >
      {isLoading && <Loading />}
      {error && <ErrorBox error={error} />}
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Livestock (Head)', n(data.totals.livestock)],
              ['Registered Farms', n(data.totals.farms)],
              ['Confirmed Cases, Open', n(data.totals.confirmedOpen)],
              ['Vaccinated This Year', n(data.totals.vaccinatedThisYear)],
            ].map(([label, value]) => (
              <div key={label} className={card}>
                <div className="text-[26px] font-semibold leading-tight md:text-[30px]">{value}</div>
                <div className="text-[14px] text-slate-600">{label}</div>
              </div>
            ))}
          </div>

          <section className={cn(card, 'space-y-3')}>
            <div>
              <h2 className={cn(h2, 'flex items-center gap-2')}>
                <ShieldAlert className="h-5 w-5 text-red-700" /> Animal Disease Map
              </h2>
              <p className="mt-1 text-[14px] text-slate-600">
                Where confirmed cases are open and the monitoring areas around them. Tap a point for details.
                Owners and farms are never named.
              </p>
            </div>
            <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5 lg:space-y-0">
              <div className="space-y-2">
                <Suspense fallback={<div className="h-[420px] rounded-xl bg-slate-100" />}>
                  <DiseaseMap cases={data.cases} zones={data.zones} className="h-[340px] md:h-[440px]" />
                </Suspense>
                <DiseaseMapLegend />
              </div>
              <div>
                {data.totals.confirmedOpen === 0 ? (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-[15px] text-emerald-900">
                    There is no confirmed animal disease case open in the city right now.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {data.barangays
                      .filter((b) => b.confirmedOpen > 0)
                      .map((b) => {
                        const z = data.zones.find((x) => x.barangay === b.barangay);
                        return (
                          <li key={b.barangay} className="px-3 py-2.5 text-[15px]">
                            <div className="flex items-center justify-between gap-3">
                              <b>Barangay {b.barangay}</b>
                              <span className="shrink-0 text-red-700">
                                <b>{b.confirmedOpen}</b> case{b.confirmedOpen === 1 ? '' : 's'}
                              </span>
                            </div>
                            <div className="text-[14px] text-slate-600">{b.diseases.join(', ')}</div>
                            {z && (
                              <div className="text-[13px] text-red-700">
                                Monitoring area: {formatDistance(z.radiusM)} radius since {fmtDate(z.since)}
                              </div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                )}
                <p className="mt-3 text-[13px] text-slate-500">
                  Inside a monitoring area, check animals daily and do not move, sell or slaughter sick
                  animals. Report sick animals to the City Veterinary Office.
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className={card}>
              <h2 className={h2}>Livestock by Kind</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {data.species.map((s) => (
                  <li key={s.species} className="flex justify-between py-2 text-[15px]">
                    <span>{s.species}</span>
                    <b>{n(s.count)}</b>
                  </li>
                ))}
              </ul>
            </section>

            <section className={card}>
              <h2 className={h2}>Livestock by Barangay</h2>
              <ul className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {data.barangays
                  .filter((b) => b.livestock > 0)
                  .sort((a, b) => b.livestock - a.livestock)
                  .map((b) => (
                    <li key={b.barangay} className="text-[15px]">
                      <div className="flex justify-between gap-2">
                        <span>{b.barangay}</span>
                        <span className="text-right">
                          <b>{n(b.livestock)}</b> head · {b.farms} farm{b.farms === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-brand-strong"
                          style={{ width: `${Math.max(2, (b.livestock / max) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            </section>

            <section className={card}>
              <h2 className={cn(h2, 'flex items-center gap-2')}>
                <Syringe className="h-5 w-5 text-brand-dark" /> Upcoming Vaccination Activities
              </h2>
              {data.activities.length === 0 ? (
                <p className="mt-2 text-[15px] text-slate-600">None scheduled.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {data.activities.map((a, i) => (
                    <li key={i} className="py-2.5 text-[15px]">
                      <b>{a.title}</b>
                      <span className="block text-[14px] text-slate-600">
                        {fmtDate(a.date)}
                        {a.time ? ` · ${a.time}` : ''} · {a.barangay === 'ALL' ? 'All barangays' : a.barangay}
                        {a.venue ? ` · ${a.venue}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p className="pb-6 text-center text-[13px] text-slate-500">Updated {fmtDateTime(data.updatedAt)}</p>
        </div>
      )}
    </Shell>
  );
}
