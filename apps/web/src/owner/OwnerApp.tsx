import {
  ChevronRight,
  MessageSquare,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Home,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  PawPrint,
  Phone,
  Plus,
  ShieldCheck,
  Siren,
  Stethoscope,
  Syringe,
  Tractor,
  Trash2,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  BARANGAYS,
  FARM_TYPES,
  NAGA_CENTER,
  POP_REASONS,
  POP_REASON_LABELS,
  POP_REASON_SIGN,
  POP_REQUEST_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
  SPECIES,
  farmRegistrationSchema,
  fmtDate,
  formatDistance,
  populationRequestSchema,
  type PopReason,
  type PopRequestStatus,
  type RegistrationStatus,
} from '@livestock/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAddressLookup, useApi } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { LogoGlyph } from '@/components/Logo';
import { AddressLookupHint, err, useZodForm } from '@/components/forms';
import { ErrorBox, Loading } from '@/components/page';
import { Badge, Button, Field, Input, RequiredMark, Select, Textarea } from '@/components/ui';
import { DiseaseMapLegend } from '@/components/DiseaseMapLegend';
import type { MapCase, MapFarm, MapZone } from '@/components/DiseaseMap';
import { LocateButton, Panel, RowLink, Screen, SectionTitle, big, useSubmit, when } from './kit';
import {
  AnnouncementsSection,
  MessagesScreen,
  MoreRoutes,
  ReportRoutes,
  VaccinationScreen,
} from './OwnerPages';

const MapView = lazy(() => import('@/components/MapView').then((m) => ({ default: m.MapView })));
const DiseaseMap = lazy(() => import('@/components/DiseaseMap'));

export interface OwnerHome {
  owner: {
    id: number;
    code: string;
    fullName: string;
    barangay: string;
    zone: string | null;
    street: string | null;
    contact: string | null;
    email: string | null;
    rsbsa: string | null;
    status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    returnReason: string | null;
    registeredAt: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    idType: string | null;
    idNumber: string | null;
    idPhotos: { key: string; url: string }[];
  };
  office: { name: string; address: string; contact: string };
  farms: {
    id: number;
    code: string;
    name: string;
    type: string;
    barangay: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    status: 'VERIFIED' | 'INACTIVE';
    livestock: { species: string; count: number }[];
    total: number;
  }[];
  registrations: {
    id: number;
    code: string;
    name: string;
    type: string;
    barangay: string;
    zone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    livestock: { species: string; count: number }[];
    status: RegistrationStatus;
    returnReason: string | null;
    submittedAt: string;
  }[];
  unread: number;
  alerts: OwnerAlert[];
  openReports: number;
  pendingPopulation: number;
}
export interface OwnerAlert {
  zoneId: number;
  code: string;
  disease: string;
  barangay: string;
  radiusM: number;
  guidance: string | null;
  since: string;
  farmId: number;
  farmName: string;
  distance: number;
}

/** The home data, refreshed every minute so new notifications show without reloading. */
export const useHome = () => useApi<OwnerHome>('/api/my/home', { refetchInterval: 60_000 });

const livestockText = (l: { species: string; count: number }[]) =>
  l.length ? l.map((x) => `${x.count} ${x.species}`).join(' · ') : 'No livestock recorded';

/* ---------------- layout ---------------- */

const TABS = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/farms', label: 'My Farms', icon: Tractor },
  { to: '/app/reports', label: 'Report', icon: Stethoscope },
  { to: '/app/vaccination', label: 'Services', icon: Syringe },
  { to: '/app/messages', label: 'Messages', icon: MessageSquare },
  { to: '/app/more', label: 'More', icon: Menu },
];
/** On a tablet or computer the side menu has room for the longer names and two more links. */
const SIDE = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/farms', label: 'My Farms', icon: Tractor },
  { to: '/app/reports', label: 'Disease Reports', icon: Stethoscope },
  { to: '/app/messages', label: 'Messages', icon: MessageSquare },
  { to: '/app/map', label: 'Disease Map', icon: MapIcon },
  { to: '/app/vaccination', label: 'Vaccination and Services', icon: Syringe },
  { to: '/app/more', label: 'Account and Settings', icon: Menu, end: true },
];

/** Pages that need a verified owner and farm. */
const VERIFIED_ONLY = ['/app/reports', '/app/vaccination'];

export function OwnerApp() {
  const { user, logout } = useAuth();
  const home = useHome();
  const { pathname } = useLocation();
  if (!user) return null;
  const owner = home.data?.owner;
  if (owner && (owner.status === 'INACTIVE' || owner.status === 'ARCHIVED'))
    return <ClosedScreen data={home.data!} onSignOut={() => void logout()} />;
  const unread = home.data?.unread ?? 0;
  const alertCount = home.data?.alerts.length ?? 0;
  const locked = owner?.status === 'PENDING' && VERIFIED_ONLY.some((p) => pathname.startsWith(p));
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b-[3px] border-sidebar-accent bg-sidebar-ink text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:px-6">
          <LogoGlyph tile className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-white/20" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[16px] font-semibold md:text-[17px]">Naga City Livestock</div>
            <div className="truncate text-[12px] text-white/80 md:text-[13px]">
              Owner Portal · City Veterinary Office
            </div>
          </div>
          <NavLink
            to="/app/more/profile"
            title="My Profile"
            className="hidden max-w-[240px] items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-white/10 md:flex"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-[13px] font-semibold">
              {initials(user.name)}
            </span>
            <span className="truncate text-[14px] text-white/95">{user.name}</span>
          </NavLink>
          <NavLink
            to="/app/messages"
            title="Messages"
            aria-label={unread ? `${unread} new in Messages` : 'Messages'}
            className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/15"
          >
            <Bell className="h-6 w-6" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 min-w-[20px] rounded-full bg-red-600 px-1 text-center text-[12px] font-semibold leading-5">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl md:gap-8 md:px-6">
        <aside className="hidden w-60 shrink-0 md:block">
          <nav aria-label="Owner menu" className="sticky top-20 space-y-1 py-6">
            {SIDE.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    // Same colours as the office's menu (one design for both sides).
                    'relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px]',
                    isActive
                      ? 'bg-sidebar-activeBg font-semibold text-sidebar-active before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-sidebar-accent'
                      : 'text-slate-700 hover:bg-sidebar-hover hover:text-sidebar-ink',
                  )
                }
              >
                <t.icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{t.label}</span>
                {t.to === '/app/messages' && unread > 0 && (
                  <span className="min-w-[20px] rounded-full bg-red-600 px-1 text-center text-[12px] font-semibold leading-5 text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
                {t.to === '/app/map' && alertCount > 0 && (
                  <span
                    className="h-2.5 w-2.5 rounded-full bg-red-600"
                    aria-label="Disease alert near your farm"
                  />
                )}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-4 flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-red-700 hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" /> Sign Out
            </button>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-0 md:pb-12 md:pt-6">
          <Suspense fallback={<Loading />}>
            {locked && home.data ? (
              <LockedScreen data={home.data} />
            ) : (
              <Routes>
                <Route index element={<HomeScreen />} />
                <Route path="farms" element={<FarmsScreen />} />
                <Route path="farms/new" element={<FarmForm />} />
                <Route path="farms/registration/:id" element={<FarmForm />} />
                <Route path="farms/:id" element={<FarmScreen />} />
                <Route path="farms/:id/update" element={<HeadCountForm />} />
                <Route path="reports/*" element={<ReportRoutes />} />
                <Route path="messages" element={<MessagesScreen />} />
                <Route path="alerts" element={<Navigate to="/app/map" replace />} />
                <Route path="map" element={<OwnerMapScreen />} />
                <Route path="vaccination" element={<VaccinationScreen />} />
                <Route path="more/*" element={<MoreRoutes />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            )}
          </Suspense>
        </main>
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-6">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11.5px] leading-tight',
                  isActive
                    ? 'font-semibold text-sidebar-ink after:absolute after:inset-x-[30%] after:top-0 after:h-[3px] after:rounded-b after:bg-sidebar-accent'
                    : 'text-slate-500',
                )
              }
            >
              <t.icon className="h-6 w-6" />
              {t.label}
              {t.label === 'Messages' && unread > 0 && (
                <span className="absolute right-[14%] top-1.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** The office's contact, shown wherever an owner cannot go further in the app. */
export function OfficeContact({ office }: { office: OwnerHome['office'] }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 text-[15px]">
      <div className="font-semibold">{office.name}</div>
      {office.address && <div className="text-slate-600">{office.address}</div>}
      {office.contact && (
        <a
          href={`tel:${office.contact.replace(/[^\d+]/g, '')}`}
          className="mt-1 inline-flex items-center gap-1.5 font-medium text-brand-dark underline"
        >
          <Phone className="h-4 w-4" /> {office.contact}
        </a>
      )}
    </div>
  );
}

/** A pending owner opened a page that needs verification. */
function LockedScreen({ data }: { data: OwnerHome }) {
  return (
    <Screen title="Available After Verification">
      <Panel tone="blue">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-sky-800" />
          <div className="space-y-2 text-[15px]">
            <p>
              Disease reports, head count updates, vaccination sign-ups and service requests are linked to a{' '}
              <b>verified farm</b>. You can use them once the City Veterinary Office verifies your
              registration and your farm.
            </p>
            <p>
              <b>If an animal is sick or dies suddenly now, call the office right away:</b>
            </p>
            <OfficeContact office={data.office} />
          </div>
        </div>
      </Panel>
      <Button asChild className={cn(big, 'w-full')}>
        <NavLink to="/app/more/profile">See My Profile and ID</NavLink>
      </Button>
    </Screen>
  );
}

/** A registration that was not accepted, or an owner set inactive: the reason and who to contact. */
function ClosedScreen({ data, onSignOut }: { data: OwnerHome; onSignOut: () => void }) {
  const o = data.owner;
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <LogoGlyph tile className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-white/20" />
          <div className="text-[16px] font-semibold">Naga City Livestock</div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <h1 className="text-[24px] font-semibold leading-tight">
          {o.status === 'ARCHIVED' ? 'Your Record Is Archived' : 'Registration Not Accepted'}
        </h1>
        <Panel tone="amber">
          <div className="space-y-3 text-[15px]">
            <p>
              {o.status === 'ARCHIVED'
                ? 'Your owner record is archived by the City Veterinary Office, so the owner app is closed for this account.'
                : 'The City Veterinary Office could not accept your registration, so the owner app is closed for this account.'}
            </p>
            {o.returnReason && (
              <p>
                <b>Reason:</b> {o.returnReason}
              </p>
            )}
            {o.reviewedAt && <p className="text-[14px] text-slate-600">Decided {fmtDate(o.reviewedAt)}</p>}
          </div>
        </Panel>
        <Panel>
          <SectionTitle>What You Can Do</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-[15px] text-slate-700">
            <li>Visit the office with a valid government ID if you think this is a mistake.</li>
            <li>The office can correct your record and open the app for you again.</li>
            <li>Disease advisories stay open to everyone on the public information page.</li>
          </ul>
          <div className="mt-3">
            <OfficeContact office={data.office} />
          </div>
        </Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild variant="outline" className={big}>
            <NavLink to="/public">Public Livestock Information</NavLink>
          </Button>
          <Button variant="outline" className={cn(big, 'text-red-700')} onClick={onSignOut}>
            <LogOut /> Sign Out
          </Button>
        </div>
      </main>
    </div>
  );
}

/* ---------------- home ---------------- */

/** The disease alert shown at the top of the home screen and on the Alerts tab. */
export function AlertCard({ a }: { a: OwnerAlert }) {
  return (
    <Panel tone="red">
      <div className="flex items-start gap-3">
        <Siren className="mt-0.5 h-6 w-6 shrink-0 text-red-700" />
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-red-900">{a.disease} Confirmed Near Your Farm</h2>
          <p className="mt-1 text-[15px] text-red-900">
            About <b>{formatDistance(a.distance)}</b> from <b>{a.farmName}</b>, in Barangay {a.barangay}. Your
            farm is inside the monitoring area ({formatDistance(a.radiusM)}).
          </p>
          {a.guidance && <p className="mt-2 whitespace-pre-line text-[15px] text-red-900">{a.guidance}</p>}
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[15px] text-red-900">
            <li>Check your animals every day.</li>
            <li>Do not move, sell or slaughter sick animals.</li>
            <li>Report any sick animal in this app right away.</li>
          </ul>
          <p className="mt-2 text-[13px] text-red-800">Since {fmtDate(a.since)}</p>
        </div>
      </div>
    </Panel>
  );
}

/** Where a pending owner is in the review, as steps. */
export function VerificationSteps({ owner }: { owner: OwnerHome['owner'] }) {
  const idSent = owner.idPhotos.length > 0;
  const steps = [
    { label: 'Account Created', done: true, note: fmtDate(owner.registeredAt) },
    {
      label: 'ID Sent for Verification',
      done: idSent && !owner.returnReason,
      warn: !idSent || !!owner.returnReason,
      note: owner.returnReason ? 'Returned: please correct' : idSent ? 'Received' : 'Not sent yet',
    },
    {
      label: 'Office Review',
      done: owner.status === 'ACTIVE',
      current: owner.status === 'PENDING' && idSent && !owner.returnReason,
      note: owner.status === 'ACTIVE' ? 'Done' : 'Usually within 3 working days',
    },
    { label: 'Verified', done: owner.status === 'ACTIVE', note: owner.status === 'ACTIVE' ? owner.code : '' },
  ];
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && (
            <span
              className={cn(
                'absolute left-[11px] top-6 h-full w-0.5',
                s.done ? 'bg-emerald-500' : 'bg-slate-200',
              )}
            />
          )}
          <span
            className={cn(
              'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-bold',
              s.done
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : s.warn
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : s.current
                    ? 'border-sky-600 bg-white text-sky-700'
                    : 'border-slate-300 bg-white text-slate-400',
            )}
          >
            {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="text-[15px] font-medium text-slate-900">{s.label}</div>
            {s.note && <div className="text-[13px] text-slate-500">{s.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function HomeScreen() {
  const { data, isLoading, error } = useHome();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const { owner, farms, registrations } = data;
  const first = owner.fullName.split(' ')[0];
  const verified = owner.status === 'ACTIVE';
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-semibold leading-tight md:text-[26px]">Hello, {first}</h1>
        <p className="text-[15px] text-slate-500">
          {verified ? (
            <>
              Registration No. <b className="font-medium text-slate-700">{owner.code}</b>
            </>
          ) : (
            'Your registration is waiting for verification'
          )}
        </p>
      </div>

      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          {data.alerts.length > 0 && (
            <NavLink
              to="/app/map"
              className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 hover:shadow-sm"
            >
              <Siren className="h-6 w-6 shrink-0 text-red-700" />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">
                  {[...new Set(data.alerts.map((a) => a.disease))].join(', ')} Confirmed Near Your Farm
                </span>
                <span className="block text-[14px]">
                  Open the Disease Map to see where it is and what to do.
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </NavLink>
          )}

          {owner.status === 'PENDING' && (
            <Panel tone={owner.returnReason ? 'amber' : 'blue'}>
              <div className="flex items-start gap-3">
                {owner.returnReason ? (
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
                ) : (
                  <Clock className="mt-0.5 h-6 w-6 shrink-0 text-sky-800" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-semibold">
                    {owner.returnReason ? 'Please Correct Your Registration' : 'Verification in Progress'}
                  </h2>
                  <p className="mt-1 text-[15px]">
                    {owner.returnReason
                      ? `The office says: ${owner.returnReason}`
                      : 'The City Veterinary Office is checking your details and ID. Register your farm now so both are verified together.'}
                  </p>
                  <div className="mt-3 rounded-xl bg-white/70 p-3">
                    <VerificationSteps owner={owner} />
                  </div>
                  <Button asChild className={cn(big, 'mt-3 w-full sm:w-auto')}>
                    <NavLink to="/app/more/profile">
                      {owner.returnReason ? 'Correct and Send Again' : 'View My Profile and ID'}
                    </NavLink>
                  </Button>
                </div>
              </div>
            </Panel>
          )}
          {verified && farms.length === 0 && registrations.length === 0 && (
            <Panel tone="green">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
                <div>
                  <h2 className="text-[17px] font-semibold">Your Registration Is Verified</h2>
                  <p className="mt-1 text-[15px]">
                    Next, register your farm so you can update your head count.
                  </p>
                </div>
              </div>
            </Panel>
          )}

          <div>
            <SectionTitle>My Farms</SectionTitle>
            <div className="space-y-2">
              {farms.map((f) => (
                <RowLink
                  key={f.id}
                  to={`/app/farms/${f.id}`}
                  icon={<Tractor className="h-5 w-5" />}
                  title={f.name}
                  sub={`${f.barangay} · ${livestockText(f.livestock)}`}
                  right={f.status === 'INACTIVE' ? <Badge tone="slate">Inactive</Badge> : undefined}
                />
              ))}
              {registrations.map((r) => (
                <RowLink
                  key={`r${r.id}`}
                  to={r.status === 'INACTIVE' ? '/app/farms' : `/app/farms/registration/${r.id}`}
                  icon={<Clock className="h-5 w-5" />}
                  title={r.name}
                  sub={
                    r.status === 'RETURNED'
                      ? `Returned: ${r.returnReason}`
                      : `${r.barangay} · ${livestockText(r.livestock)}`
                  }
                  right={
                    <Badge
                      tone={r.status === 'RETURNED' ? 'amber' : r.status === 'INACTIVE' ? 'slate' : 'blue'}
                    >
                      {REGISTRATION_STATUS_LABELS[r.status]}
                    </Badge>
                  }
                />
              ))}
              {farms.length === 0 && registrations.length === 0 && (
                <Panel>
                  <p className="text-[15px] text-slate-600">You have no farm yet.</p>
                  <Button asChild className={cn(big, 'mt-3 w-full sm:w-auto')}>
                    <NavLink to="/app/farms/new">
                      <Plus /> Register a Farm
                    </NavLink>
                  </Button>
                </Panel>
              )}
            </div>
          </div>

          {(data.openReports > 0 || data.pendingPopulation > 0) && (
            <Panel>
              <SectionTitle className="mb-1">Waiting for the Office</SectionTitle>
              <ul className="space-y-1 text-[15px] text-slate-700">
                {data.openReports > 0 && <li>{data.openReports} disease report(s) being reviewed</li>}
                {data.pendingPopulation > 0 && (
                  <li>{data.pendingPopulation} head count update(s) being reviewed</li>
                )}
              </ul>
            </Panel>
          )}
          <AnnouncementsSection />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {verified ? (
              <>
                <QuickTile to="/app/reports/new" icon={Stethoscope} label="Report Sick Animals" tone="red" />
                <QuickTile to="/app/farms" icon={PawPrint} label="Update Head Count" />
                <QuickTile to="/app/vaccination" icon={Syringe} label="Vaccination" />
                <QuickTile to="/app/farms/new" icon={Plus} label="Register a Farm" />
              </>
            ) : (
              <>
                <QuickTile
                  href={data.office.contact ? `tel:${data.office.contact.replace(/[^\d+]/g, '')}` : undefined}
                  to="/app/more/profile"
                  icon={Phone}
                  label="Sick Animal? Call the Office"
                  tone="red"
                />
                <QuickTile to="/app/vaccination" icon={Syringe} label="Vaccination and Services" />
                <QuickTile to="/app/farms/new" icon={Plus} label="Register a Farm" />
                <QuickTile to="/app/map" icon={MapIcon} label="Disease Map" />
              </>
            )}
          </div>
          {/* Phones: the map sits with the shortcuts. */}
          <div className="lg:hidden">
            <HomeMapCard />
          </div>
        </div>
      </div>
      {/* Tablets and computers: the map across the full width, large enough to read (panel revision). */}
      <div className="mt-6 hidden lg:block">
        <HomeMapCard large />
      </div>
    </div>
  );
}

function QuickTile({
  to,
  href,
  icon: Icon,
  label,
  tone,
}: {
  to: string;
  /** An outside link (e.g. a phone call) instead of a page */
  href?: string;
  icon: typeof Home;
  label: string;
  tone?: 'red';
}) {
  const cls = cn(
    'flex min-h-[92px] flex-col justify-between rounded-2xl border p-3.5 text-[16px] font-medium leading-snug hover:shadow-sm active:opacity-80',
    tone === 'red' ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-200 bg-white text-slate-900',
  );
  const icon = <Icon className={cn('h-7 w-7', tone === 'red' ? 'text-red-700' : 'text-brand-dark')} />;
  if (href)
    return (
      <a href={href} className={cls}>
        {icon}
        {label}
      </a>
    );
  return (
    <NavLink to={to} className={cls}>
      {icon}
      {label}
    </NavLink>
  );
}

/* ---------------- disease map ---------------- */

interface OwnerMapData {
  zones: (MapZone & { id: number })[];
  cases: MapCase[];
  farms: MapFarm[];
}
const useOwnerMap = () => useApi<OwnerMapData>('/api/my/map', { refetchInterval: 120_000 });

function HomeMapCard({ large }: { large?: boolean }) {
  const { data } = useOwnerMap();
  if (!data) return null;
  const n = data.cases.length;
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle className="mb-0">Disease Map</SectionTitle>
        <NavLink to="/app/map" className="text-[14px] font-medium text-brand-dark underline">
          Open
        </NavLink>
      </div>
      <p className="text-[14px] text-slate-600">
        {n === 0
          ? 'No confirmed disease case is open in the city right now.'
          : `${n} confirmed case${n === 1 ? '' : 's'} open in the city.`}
      </p>
      <Suspense fallback={<div className={cn('rounded-xl bg-slate-100', large ? 'h-[520px]' : 'h-72')} />}>
        <DiseaseMap
          cases={data.cases}
          zones={data.zones}
          farms={data.farms}
          className={large ? 'h-[min(560px,65vh)] min-h-[420px]' : 'h-72'}
        />
      </Suspense>
      <DiseaseMapLegend farms={data.farms.length > 0} />
    </Panel>
  );
}

function OwnerMapScreen() {
  const { data, isLoading, error } = useOwnerMap();
  const home = useHome();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return (
    <Screen title="Disease Map" wide sub="Confirmed cases and monitoring areas in Naga City, and your farms">
      {(home.data?.alerts ?? []).map((a) => (
        <AlertCard key={`${a.zoneId}-${a.farmId}`} a={a} />
      ))}
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0">
        <div className="space-y-2">
          <Suspense fallback={<div className="h-[60vh] rounded-xl bg-slate-100" />}>
            <DiseaseMap
              cases={data.cases}
              zones={data.zones}
              farms={data.farms}
              className="h-[60vh] min-h-[320px]"
            />
          </Suspense>
          <DiseaseMapLegend farms={data.farms.length > 0} />
        </div>
        <div className="space-y-3">
          <SectionTitle className="mb-0">Active Monitoring Areas</SectionTitle>
          {data.zones.length === 0 && (
            <Panel tone="green">
              <p className="text-[15px]">There is no active monitoring area right now.</p>
            </Panel>
          )}
          {data.zones.map((z) => (
            <Panel key={z.id} tone={z.affectsMe ? 'red' : undefined}>
              <div className="flex items-start justify-between gap-2">
                <b className="text-[16px]">{z.disease}</b>
                {z.affectsMe && <Badge tone="red">Your Farm Is Inside</Badge>}
              </div>
              <p className="text-[14px] text-slate-600">
                Barangay {z.barangay} · {formatDistance(z.radiusM)} radius · since {fmtDate(z.since)}
              </p>
              {z.guidance && <p className="mt-1 whitespace-pre-line text-[14px]">{z.guidance}</p>}
            </Panel>
          ))}
          <p className="text-[13px] text-slate-500">
            The map shows where cases were confirmed. The owners and farms involved are never named.
          </p>
        </div>
      </div>
    </Screen>
  );
}

/* ---------------- farms ---------------- */

function FarmsScreen() {
  const { data, isLoading, error } = useHome();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return (
    <Screen title="My Farms">
      <div className="space-y-2">
        {data.farms.map((f) => (
          <RowLink
            key={f.id}
            to={`/app/farms/${f.id}`}
            icon={<Tractor className="h-5 w-5" />}
            title={f.name}
            sub={`${f.code} · ${f.barangay} · ${f.total} head`}
            right={
              <Badge tone={f.status === 'VERIFIED' ? 'green' : 'slate'}>
                {f.status === 'VERIFIED' ? 'Verified' : 'Inactive'}
              </Badge>
            }
          />
        ))}
        {data.registrations.map((r) =>
          r.status === 'INACTIVE' ? (
            <Panel key={r.id}>
              <div className="flex items-center justify-between gap-2">
                <b className="text-[16px]">{r.name}</b>
                <Badge tone="slate">Not Accepted</Badge>
              </div>
              <p className="mt-1 text-[14px] text-slate-600">The office says: {r.returnReason}</p>
            </Panel>
          ) : (
            <RowLink
              key={`r${r.id}`}
              to={`/app/farms/registration/${r.id}`}
              icon={<Clock className="h-5 w-5" />}
              title={r.name}
              sub={
                r.status === 'RETURNED'
                  ? `Returned: ${r.returnReason}`
                  : `${r.code} · sent ${fmtDate(r.submittedAt)}`
              }
              right={
                <Badge tone={r.status === 'RETURNED' ? 'amber' : 'blue'}>
                  {REGISTRATION_STATUS_LABELS[r.status]}
                </Badge>
              }
            />
          ),
        )}
      </div>
      <Button asChild className={cn(big, 'w-full')}>
        <NavLink to="/app/farms/new">
          <Plus /> Register a Farm
        </NavLink>
      </Button>
      <p className="text-[14px] text-slate-500">
        A new farm is checked by the City Veterinary Office first. You will get a notification when it is
        verified.
      </p>
    </Screen>
  );
}

/** Register a farm, or correct a registration that is pending or was returned. */
function FarmForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const home = useHome();
  const reg = id ? home.data?.registrations.find((r) => r.id === Number(id)) : undefined;
  const form = useZodForm(farmRegistrationSchema, {
    name: '',
    type: 'backyard',
    barangay: home.data?.owner.barangay ?? '',
    zone: '',
    address: '',
    livestock: [{ species: '', count: '' }],
  });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lines, setLines] = useState<{ species: string; count: string }[]>([{ species: '', count: '' }]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded || !home.data) return;
    if (reg) {
      form.reset({
        name: reg.name,
        type: reg.type,
        barangay: reg.barangay,
        zone: reg.zone ?? '',
        address: reg.address ?? '',
      });
      if (reg.lat != null && reg.lng != null) setPin({ lat: reg.lat, lng: reg.lng });
      setLines(reg.livestock.map((l) => ({ species: l.species, count: String(l.count) })));
    } else form.setValue('barangay', home.data.owner.barangay);
    setLoaded(true);
  }, [home.data, reg, loaded, form]);
  const { busy, run } = useSubmit();
  // GPS or a tap on the map fills in the barangay and the address (the owner can still edit them).
  const addr = useAddressLookup(
    form,
    { address: 'address', barangay: 'barangay' },
    '/api/my/geocode/reverse',
  );
  const e = form.formState.errors;
  const [lineError, setLineError] = useState<string | null>(null);

  if (id && home.data && !reg) return <Navigate to="/app/farms" replace />;

  const save = form.handleSubmit(
    async (v) => {
      const ok = await run(
        form,
        () => (reg ? api.patch(`/api/my/registrations/${reg.id}`, v) : api.post('/api/my/farms', v)),
        reg ? 'Sent again for review.' : 'Farm sent for review.',
      );
      if (ok) navigate('/app/farms');
    },
    (errs) => {
      setLineError(
        (errs.livestock as { message?: string; root?: { message?: string } } | undefined)?.message ??
          (errs.livestock ? 'Choose the livestock and enter how many head.' : null),
      );
      if (errs.lat || errs.lng) setLineError((x) => x);
    },
  );
  const submit = (ev: React.FormEvent) => {
    form.setValue('lat', pin?.lat ?? '');
    form.setValue('lng', pin?.lng ?? '');
    form.setValue('gpsAccuracy', accuracy ?? '');
    form.setValue(
      'livestock',
      lines.filter((l) => l.species || l.count),
    );
    setLineError(null);
    void save(ev);
  };
  const used = new Set(lines.map((l) => l.species));

  return (
    <Screen title={reg ? 'Correct farm registration' : 'Register a farm'} back="/app/farms">
      {reg?.status === 'RETURNED' && (
        <Panel tone="amber">
          <b>The office returned this registration:</b> {reg.returnReason}
        </Panel>
      )}
      <form noValidate onSubmit={submit} className="space-y-4">
        <Panel className="space-y-3">
          <h2 className="text-[17px] font-semibold">
            Where Is the Farm? <RequiredMark />
          </h2>
          <p className="text-[14px] text-slate-600">
            Stand at the farm and tap the button. The barangay and address are filled in for you. You can also
            tap the map to move the pin.
          </p>
          <LocateButton
            onFix={(f) => {
              setPin({ lat: f.lat, lng: f.lng });
              setAccuracy(f.accuracy);
              form.clearErrors(['lat', 'lng']);
              void addr.lookup(f.lat, f.lng);
            }}
          />
          <div className="isolate h-64 overflow-hidden rounded-xl border border-slate-200">
            <Suspense fallback={<Loading />}>
              <MapView
                className="h-full w-full"
                pick={{
                  value: pin,
                  onChange: (p) => (
                    setPin(p),
                    setAccuracy(null),
                    form.clearErrors(['lat', 'lng']),
                    void addr.lookup(p.lat, p.lng)
                  ),
                }}
                fitKey={pin ? `${pin.lat},${pin.lng}` : 'none'}
                focusCircle={
                  pin ? { ...pin, radius: 150 } : { lat: NAGA_CENTER[0], lng: NAGA_CENTER[1], radius: 6000 }
                }
              />
            </Suspense>
          </div>
          {pin ? (
            <p className="flex items-center gap-1.5 text-[14px] text-slate-700">
              <MapPin className="h-4 w-4 text-brand-dark" />
              Pin set
              {accuracy != null && (
                <span className={accuracy > 50 ? 'text-amber-700' : 'text-slate-500'}>
                  · GPS accurate to about {accuracy} m
                  {accuracy > 50 ? ' (weak signal: check the pin on the map)' : ''}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[14px] text-slate-500">No pin yet.</p>
          )}
          {(err(e, 'lat') || err(e, 'lng')) && (
            <p role="alert" className="text-[14px] text-red-600">
              {err(e, 'lat') && err(e, 'lat') !== 'Required' && !/number/i.test(err(e, 'lat')!)
                ? err(e, 'lat')
                : 'Set the farm location first.'}
            </p>
          )}
        </Panel>

        <Panel className="space-y-4">
          <Field label="Farm Name *" error={err(e, 'name')} hint="For example: Reyes Piggery">
            <Input className={big} {...form.register('name')} />
          </Field>
          <Field label="Farm Type *" error={err(e, 'type')}>
            <Select className={big} {...form.register('type')}>
              {FARM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'backyard' ? 'Backyard (small, at home)' : 'Commercial'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Barangay *" error={err(e, 'barangay')}>
            <Select className={big} {...form.register('barangay')}>
              <option value="">Select…</option>
              {BARANGAYS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Zone / Purok" error={err(e, 'zone')}>
            <Input className={big} {...form.register('zone')} />
          </Field>
          <Field label="Street or Landmark" error={err(e, 'address')}>
            <Input className={big} {...form.register('address')} />
            <AddressLookupHint state={addr.state} onApplySuggestion={addr.applySuggestion} />
          </Field>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="text-[17px] font-semibold">
            Livestock on the Farm <RequiredMark />
          </h2>
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={i === 0 ? 'Species *' : undefined} className="min-w-0 flex-1">
                <Select
                  className={big}
                  aria-label={`Species ${i + 1}`}
                  value={l.species}
                  onChange={(ev) => (
                    setLines(lines.map((x, j) => (j === i ? { ...x, species: ev.target.value } : x))),
                    setLineError(null)
                  )}
                >
                  <option value="">Select…</option>
                  {SPECIES.filter((s) => s === l.species || !used.has(s)).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label={i === 0 ? 'Head *' : undefined} className="w-24">
                <Input
                  className={big}
                  aria-label={`Head count ${i + 1}`}
                  inputMode="numeric"
                  value={l.count}
                  onChange={(ev) => (
                    setLines(
                      lines.map((x, j) =>
                        j === i ? { ...x, count: ev.target.value.replace(/\D/g, '') } : x,
                      ),
                    ),
                    setLineError(null)
                  )}
                />
              </Field>
              {lines.length > 1 && (
                <button
                  type="button"
                  aria-label="Remove this livestock"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  className="flex h-12 w-11 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
          {lineError && (
            <p role="alert" className="text-[14px] text-red-600">
              {lineError}
            </p>
          )}
          {lines.length < SPECIES.length && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setLines([...lines, { species: '', count: '' }])}
            >
              <Plus /> Add Another Species
            </Button>
          )}
        </Panel>

        <Button type="submit" loading={busy} className={cn(big, 'w-full')}>
          {reg ? 'Send Again for Review' : 'Send for Review'}
        </Button>
      </form>
    </Screen>
  );
}

interface FarmDetail {
  id: number;
  code: string;
  name: string;
  type: string;
  barangay: string;
  address: string | null;
  status: 'VERIFIED' | 'INACTIVE';
  livestock: { species: string; count: number; lastVerified: string | null }[];
  requests: {
    id: number;
    species: string;
    reason: PopReason;
    quantity: number;
    before: number;
    after: number;
    note: string | null;
    status: PopRequestStatus;
    flagged: boolean;
    decidedBy: string | null;
    decisionNote: string | null;
    createdAt: string;
  }[];
  services: {
    id: number;
    date: string;
    service: string;
    product: string | null;
    species: string;
    heads: number;
    nextDate: string | null;
  }[];
}

function FarmScreen() {
  const { id } = useParams();
  const { data, isLoading, error } = useApi<FarmDetail>(`/api/my/farms/${id}`);
  const { busy, run } = useSubmit();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const total = data.livestock.reduce((a, l) => a + l.count, 0);
  return (
    <Screen title={data.name} back="/app/farms">
      <Panel>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] text-slate-500">
            {data.code} · {data.barangay}
          </span>
          <Badge tone={data.status === 'VERIFIED' ? 'green' : 'slate'}>
            {data.status === 'VERIFIED' ? 'Verified' : 'Inactive'}
          </Badge>
        </div>
        <div className="mt-3 text-[15px] text-slate-500">Livestock on record</div>
        <div className="text-[32px] font-semibold leading-tight">{total} head</div>
        <ul className="mt-2 divide-y divide-slate-100">
          {data.livestock
            .filter((l) => l.count > 0)
            .map((l) => (
              <li key={l.species} className="flex items-center justify-between py-2 text-[16px]">
                <span>{l.species}</span>
                <b>{l.count}</b>
              </li>
            ))}
        </ul>
        {data.status === 'VERIFIED' && (
          <Button asChild className={cn(big, 'mt-3 w-full')}>
            <NavLink to={`/app/farms/${data.id}/update`}>
              <PawPrint /> Update Head Count
            </NavLink>
          </Button>
        )}
      </Panel>

      <div>
        <h2 className="mb-2 text-[17px] font-semibold">My Updates</h2>
        {data.requests.length === 0 && <p className="text-[15px] text-slate-500">No updates yet.</p>}
        <div className="space-y-2">
          {data.requests.map((r) => (
            <Panel key={r.id} tone={r.status === 'PENDING' ? 'amber' : undefined}>
              <div className="flex items-center justify-between gap-2">
                <b className="text-[16px]">
                  {r.species}: {r.before} → {r.after}
                </b>
                <Badge tone={r.status === 'ACCEPTED' ? 'green' : r.status === 'PENDING' ? 'amber' : 'slate'}>
                  {POP_REQUEST_STATUS_LABELS[r.status]}
                </Badge>
              </div>
              <p className="text-[14px] text-slate-600">
                {POP_REASON_LABELS[r.reason]} · {when(r.createdAt)}
                {r.note ? ` · ${r.note}` : ''}
              </p>
              {r.status === 'PENDING' && (
                <>
                  <p className="mt-1 text-[14px] text-amber-900">
                    This is a large change, so the office checks it first. The record stays at {r.before}{' '}
                    until then.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2 h-11"
                    loading={busy}
                    onClick={() =>
                      run(null, () => api.post(`/api/my/population/${r.id}/cancel`), 'Update cancelled.')
                    }
                  >
                    Cancel This Update
                  </Button>
                </>
              )}
              {r.status === 'CANCELLED' && r.decisionNote && (
                <p className="mt-1 text-[14px] text-slate-600">Reason: {r.decisionNote}</p>
              )}
            </Panel>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-[17px] font-semibold">Services by the Office</h2>
        {data.services.length === 0 && <p className="text-[15px] text-slate-500">None recorded yet.</p>}
        <div className="space-y-2">
          {data.services.map((s) => (
            <Panel key={s.id}>
              <b className="text-[16px]">
                {s.service}
                {s.product ? `: ${s.product}` : ''}
              </b>
              <p className="text-[14px] text-slate-600">
                {fmtDate(s.date)} · {s.heads} {s.species}
                {s.nextDate ? ` · next on ${fmtDate(s.nextDate)}` : ''}
              </p>
            </Panel>
          ))}
        </div>
      </div>
    </Screen>
  );
}

function HeadCountForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useApi<FarmDetail>(`/api/my/farms/${id}`);
  const form = useZodForm(populationRequestSchema, {
    farmId: Number(id),
    species: '',
    reason: '',
    quantity: '',
    note: '',
  });
  const { busy, run } = useSubmit();
  const e = form.formState.errors;
  const species = form.watch('species') as string;
  const reason = form.watch('reason') as PopReason | '';
  const qty = Number(form.watch('quantity')) || 0;
  const current = data?.livestock.find((l) => l.species === species)?.count ?? 0;
  const sign = reason ? POP_REASON_SIGN[reason] : 0;
  const next = !reason ? current : reason === 'CORRECTION' ? qty : current + sign * qty;
  // Only reasons that make sense: nothing can be removed from a kind of livestock the farm does not have.
  const reasons = POP_REASONS.filter((r) => current > 0 || POP_REASON_SIGN[r] >= 0);
  if (!data) return <Loading />;
  return (
    <Screen title="Update Head Count" back={`/app/farms/${id}`}>
      <p className="text-[15px] text-slate-600">{data.name}</p>
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async (v) => {
          let result: { status: string } | undefined;
          const ok = await run(form, async () => {
            result = await api.post<{ status: string }>('/api/my/population', v);
          });
          if (!ok) return;
          const { toast } = await import('sonner');
          if (result?.status === 'PENDING')
            toast.info('Sent. This is a large change, so the office will check it first.');
          else toast.success('Head count updated.');
          navigate(`/app/farms/${id}`);
        })}
      >
        <Panel className="space-y-4">
          <Field label="Which livestock? *" error={err(e, 'species')}>
            <Select className={big} {...form.register('species')}>
              <option value="">Select…</option>
              {SPECIES.map((s) => {
                const c = data.livestock.find((l) => l.species === s)?.count ?? 0;
                return (
                  <option key={s} value={s}>
                    {s} {c ? `(${c} now)` : '(none yet)'}
                  </option>
                );
              })}
            </Select>
          </Field>
          <Field label="What happened? *" error={err(e, 'reason')}>
            <Select className={big} {...form.register('reason')} disabled={!species}>
              <option value="">Select…</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {POP_REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={reason === 'CORRECTION' ? 'Correct total number of head *' : 'How many head? *'}
            error={err(e, 'quantity')}
          >
            <Input className={big} inputMode="numeric" {...form.register('quantity')} />
          </Field>
          <Field label="Note" error={err(e, 'note')} hint="Optional. For example: sold to a neighbour">
            <Textarea rows={2} {...form.register('note')} />
          </Field>
        </Panel>
        {species && reason && qty > 0 && (
          <Panel tone={next < 0 ? 'red' : 'blue'}>
            <div className="text-[15px]">
              {species} on record: <b>{current}</b>
            </div>
            <div className="text-[20px] font-semibold">
              After this update: {Math.max(next, 0)}{' '}
              {next < 0 && <AlertTriangle className="inline h-5 w-5" />}
            </div>
            {next < 0 && <p className="text-[14px]">You cannot remove more than the {current} on record.</p>}
          </Panel>
        )}
        <Button type="submit" loading={busy} className={cn(big, 'w-full')}>
          Save Update
        </Button>
        <p className="text-[14px] text-slate-500">
          Small changes are saved right away. A very large change is checked by the office first.
        </p>
      </form>
    </Screen>
  );
}
