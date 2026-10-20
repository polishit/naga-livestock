import { isoDate } from '@livestock/shared';

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
