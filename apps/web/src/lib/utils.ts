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
    const lower = w.toLowerCase();
    const prev = src.slice(0, offset).trimEnd();
    const isLast = !/[A-Za-z]/.test(src.slice(offset + w.length));
    const startsPart = offset === 0 || isLast || /[:—(–-]$/.test(prev);
    if (!startsPart && SMALL_WORDS.has(lower)) return lower;
    if (/[-/]$/.test(src.slice(0, offset)) && !/\s$/.test(src.slice(0, offset))) return w; // "Check-up", "and/or"
    return w[0].toUpperCase() + w.slice(1);
  });
}
