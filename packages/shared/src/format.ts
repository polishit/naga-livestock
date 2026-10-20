const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Pad a numeric id into a display code, e.g. code('OWN', 1) → OWN-0001. */
export function code(prefix: string, id: number, width = 4): string {
  return `${prefix}-${String(id).padStart(width, '0')}`;
}

function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  // Date-only strings are treated as local calendar dates.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
}

/** "Aug 31, 2026" */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = toDate(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

/** "Sep 16, 2026 2:33 AM" */
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = toDate(d);
  if (Number.isNaN(dt.getTime())) return '—';
  let h = dt.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${fmtDate(dt)} ${h}:${String(dt.getMinutes()).padStart(2, '0')} ${ampm}`;
}

/** "2026-09" → "Sep 2026" */
export function fmtMonth(m: string | null | undefined): string {
  if (!m) return '—';
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return '—';
  return `${MONTHS[mo - 1]} ${y}`;
}

/** Local YYYY-MM-DD for a Date. */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local YYYY-MM for a Date. */
export function isoMonth(d: Date = new Date()): string {
  return isoDate(d).slice(0, 7);
}

/** Shift a YYYY-MM month by n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  return isoMonth(dt);
}

/** List of the last n months ending with `end` (inclusive), oldest first. */
export function lastMonths(n: number, end: string = isoMonth()): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(end, i - (n - 1)));
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

export function initials(name: string): string {
  const parts = name
    .replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return (parts[0]?.[0] ?? '').concat(parts[1]?.[0] ?? '').toUpperCase();
}

export function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
