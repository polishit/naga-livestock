import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function qs(params: Record<string, string | number | undefined | null | boolean>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === 'all' || v === false) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

/** First and last day of a month (YYYY-MM) as YYYY-MM-DD. */
export function monthDays(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

type LinkParams = Record<string, string | undefined | null>;
const linkQuery = (p: LinkParams) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};
/** Link to the disease reports (keeps state=all, which qs() leaves out). */
export const casesLink = (p: LinkParams) => `/cases${linkQuery(p)}`;
/** Link to the farms raising livestock in Population Monitoring (By Farm). */
export const populationLink = (p: LinkParams) => `/population${linkQuery({ tab: 'farms', ...p })}`;
/** Link to the service records, optionally for one month. */
export const servicesLink = (p: LinkParams & { month?: string | null }) => {
  const { month, ...rest } = p;
  return `/services${linkQuery({ ...rest, ...(month ? monthDays(month) : {}) })}`;
};
/** Link to the field visits, optionally for one month. */
export const visitsLink = (p: LinkParams & { month?: string | null }) => {
  const { month, ...rest } = p;
  return `/services${linkQuery({ type: 'VISIT', ...rest, ...(month ? monthDays(month) : {}) })}`;
};

export function fileUrl(key: string | null | undefined) {
  return key ? `/api/files/${key}` : null;
}

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'vs',
  'via',
  'with',
]);

/**
 * Title Case for headings and table headers ("livestock owner" → "Livestock Owner").
 * Acronyms and codes (GIS, PCIC, ID, FRM-0001) are kept; small words stay lower case mid-heading.
 */
export function toTitle(s: string) {
  const src = s.length > 5 && s === s.toUpperCase() ? s.toLowerCase() : s;
  return src.replace(/[A-Za-z][\w'’.]*/g, (w, offset: number) => {
    if (/[A-Z].*[A-Z]/.test(w) || /\d/.test(w)) return w;
    // Units stay lower case ("1.00 km", "2 ha").
    if (/^(km|m|ha|kg|g)$/.test(w)) return w;
    const lower = w.toLowerCase();
    const prev = src.slice(0, offset).trimEnd();
    const isLast = !/[A-Za-z]/.test(src.slice(offset + w.length));
    const startsPart = offset === 0 || isLast || /[:—(–-]$/.test(prev);
    if (!startsPart && SMALL_WORDS.has(lower)) return lower;
    if (/[-/]$/.test(src.slice(0, offset)) && !/\s$/.test(src.slice(0, offset))) return w; // "Check-up", "and/or"
    return w[0].toUpperCase() + w.slice(1);
  });
}

/**
 * Title Case for a heading that may end with a record's name or code ("Update status — CASE-0001"):
 * only the part before " — " is changed, so people's and farms' names stay as typed.
 */
export function headTitle(s: string) {
  const i = s.indexOf(' — ');
  return i < 0 ? toTitle(s) : `${toTitle(s.slice(0, i))}${s.slice(i)}`;
}
