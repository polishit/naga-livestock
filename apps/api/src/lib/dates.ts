import { isoDate } from '@livestock/shared';
import { badRequest } from './http';

/** 'YYYY-MM-DD' → Date at UTC midnight (how Prisma stores @db.Date). */
export function dateOnly(s: string | undefined | null): Date | undefined {
  if (!s) return undefined;
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

export function today(): string {
  return isoDate(new Date());
}

/** Date column → 'YYYY-MM-DD' (or null). */
export function ymd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Date column → 'YYYY-MM'. */
export function ym(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 7) : null;
}

/** Datetime-local / ISO input → Date (local time when no zone given). */
export function dateTime(s: string | undefined | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Reject dates later than today. Forms already limit this, but writes queued offline
 * (or sent straight to the API) skip the form, so the server checks too.
 */
export function assertNotFuture(fields: Record<string, string | undefined | null>) {
  const t = today();
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v && v.slice(0, 10) > t) fieldErrors[k] = ['Date cannot be in the future'];
  }
  if (Object.keys(fieldErrors).length) throw badRequest('Validation failed', { fieldErrors });
}