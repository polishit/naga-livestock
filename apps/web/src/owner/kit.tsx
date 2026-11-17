import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LocateFixed } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { BackButton } from '@/components/BackButton';
import { toast } from 'sonner';
import { fmtDateTime, type CaseStage } from '@livestock/shared';
import { ApiError, uploadFile } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, type Tone } from '@/components/ui';

/**
 * Building blocks of the owner app. Designed for a phone first (large text, tap targets at least
 * 48 px high) and widening to two columns on tablets and computers.
 */

export const big = 'h-12 text-[16px]';

/** A page inside the owner app: a title bar with a back arrow, then the content. */
export function Screen({
  title,
  back = '/app',
  children,
  action,
  wide,
  sub,
}: {
  title: string;
  /** The parent page the back arrow opens (default: Home) */
  back?: string;
  children: ReactNode;
  action?: ReactNode;
  /** Use the full width on large screens (lists with a map, two-column forms) */
  wide?: boolean;
  sub?: ReactNode;
}) {
  return (
    <div className={cn(!wide && 'mx-auto max-w-2xl')}>
      <div className="mb-4 flex items-center gap-2">
        <BackButton to={back} className="-ml-2 h-11 w-11" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight text-slate-900 md:text-[24px]">{title}</h1>
          {sub && <p className="text-[14px] text-slate-500">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** A section heading inside a screen (Title Case, one size everywhere). */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('mb-2 text-[17px] font-semibold text-slate-900', className)}>{children}</h2>;
}

export function Panel({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'red' | 'amber' | 'green' | 'blue';
}) {
  const tones = {
    red: 'border-red-200 bg-red-50',
    amber: 'border-amber-200 bg-amber-50',
    green: 'border-emerald-200 bg-emerald-50',
    blue: 'border-sky-200 bg-sky-50',
  };
  return (
    <section
      className={cn('rounded-2xl border p-4', tone ? tones[tone] : 'border-slate-200 bg-white', className)}
    >
      {children}
    </section>
  );
}

/** A full-width row that opens another screen. */
export function RowLink({
  to,
  icon,
  title,
  sub,
  right,
}: {
  to: string;
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50"
    >
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium text-slate-900">{title}</span>
        {sub && <span className="block text-[14px] text-slate-500">{sub}</span>}
      </span>
      {right}
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
    </Link>
  );
}

export const STAGE_TONE: Record<CaseStage, Tone> = {
  REPORTED: 'blue',
  INFO_REQUESTED: 'amber',
  UNDER_INVESTIGATION: 'violet',
  CONFIRMED: 'red',
  RESOLVED: 'green',
  CLOSED: 'slate',
  REJECTED: 'slate',
};

export const when = (d: string | Date) => fmtDateTime(d);

/** Run a save: field errors go under their fields, anything else in a toast. Returns true on success. */
export function useSubmit() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (form: UseFormReturn<any> | null, fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.success(done);
      await qc.invalidateQueries();
      return true;
    } catch (x) {
      if (x instanceof ApiError && x.fieldErrors && form) {
        for (const [f, m] of Object.entries(x.fieldErrors))
          form.setError(f, { type: 'server', message: m[0] });
        toast.error('Please check the marked fields.');
      } else toast.error(x instanceof Error ? x.message : 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Upload photos chosen in the owner app and return their storage keys. */
export const uploadAll = (files: File[], folder: string) =>
  Promise.all(files.map((f) => uploadFile(f, f.name, folder, '/api/my/uploads')));

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}

/** "Use my location": reads the phone's GPS once and reports the accuracy. */
export function LocateButton({
  onFix,
  label = 'Use my current location',
}: {
  onFix: (f: Fix) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(big, 'w-full')}
      loading={busy}
      onClick={() => {
        if (!navigator.geolocation) {
          toast.error('This phone cannot give its location. Move the pin on the map instead.');
          return;
        }
        setBusy(true);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setBusy(false);
            onFix({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracy: Math.round(p.coords.accuracy),
            });
          },
          (e) => {
            setBusy(false);
            toast.error(
              e.code === e.PERMISSION_DENIED
                ? 'Location is turned off for this app. Allow it in the phone settings, or move the pin on the map.'
                : 'Could not get your location. Go outside or move the pin on the map.',
            );
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      }}
    >
      <LocateFixed /> {label}
    </Button>
  );
}

/** Go back after a save. */
export function useBack(to: string) {
  const navigate = useNavigate();
  return () => navigate(to);
}
