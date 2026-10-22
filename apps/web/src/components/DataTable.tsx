import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { titleCase } from '@livestock/shared';
import { cn } from '@/lib/utils';
import { EmptyState, Input, Spinner } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
  /** Value used for sorting; defaults to row[key]. Set to false to disable sorting. */
  sort?: ((row: T) => string | number | null | undefined) | false;
  className?: string;
  headerClassName?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** Text used by the built-in search box; omit to hide it. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Extra filter controls rendered next to search. */
  toolbar?: ReactNode;
  /** Rows per page; 0 disables pagination and shows "N records". */
  pageSize?: number;
  empty?: ReactNode;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  footerNote?: ReactNode;
  hideFooter?: boolean;
  minWidth?: number;
  dense?: boolean;
  /** Separate the toolbar from the header with a heavier line (matches some screens). */
  toolbarDivider?: boolean;
  /** Column key used as the card title on phones (defaults to the second column). */
  mobileTitle?: string;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  rowKey,
  onRowClick,
  searchText,
  searchPlaceholder = 'Search...',
  toolbar,
  pageSize = 15,
  empty = 'No records found.',
  defaultSort,
  footerNote,
  hideFooter,
  minWidth = 760,
  dense,
  toolbarDivider,
  mobileTitle,
}: Props<T>) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let r = rows ?? [];
    if (searchText && q.trim()) {
      const needle = q.trim().toLowerCase();
      r = r.filter((x) => searchText(x).toLowerCase().includes(needle));
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      const get = c && typeof c.sort === 'function' ? c.sort : (x: T) => (x as any)[sort.key];
      r = [...r].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), undefined, { numeric: true });
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, q, sort, columns, searchText]);

  const pages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const visible = pageSize ? filtered.slice(current * pageSize, current * pageSize + pageSize) : filtered;

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) =>
      !s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null,
    );
  };

  const showToolbar = !!searchText || !!toolbar;

  return (
    <div>
      {showToolbar && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-3',
            toolbarDivider ? 'border-b-2 border-slate-700/80' : 'border-b border-slate-100',
          )}
        >
          {searchText && (
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="pl-9"
                aria-label="Search table"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}
      {/* Phones: each row becomes a compact card */}
      <div className="sm:hidden">
        {loading ? (
          <div className="py-10 text-center">
            <Spinner className="mx-auto" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((row) => {
              const titleCol = mobileTitle ? columns.find((c) => c.key === mobileTitle) : undefined;
              const ordered = titleCol
                ? [
                    columns[0] === titleCol ? columns[1] : columns[0],
                    titleCol,
                    ...columns.filter(
                      (c) => c !== titleCol && c !== (columns[0] === titleCol ? columns[1] : columns[0]),
                    ),
                  ]
                : columns;
              const [first, second, ...rest] = ordered;
              const render = (c: Column<T>) => (c.cell ? c.cell(row) : ((row as any)[c.key] ?? '—'));
              return (
                <li
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('px-4 py-3.5', onRowClick && 'cursor-pointer active:bg-slate-50')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-[15px] font-medium text-slate-900">
                      {second ? render(second) : render(first)}
                    </div>
                    {second && <div className="shrink-0 text-[12.5px] text-slate-500">{render(first)}</div>}
                  </div>
                  {rest.length > 0 && (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
                      {rest.map((c) => (
                        <div key={c.key} className="contents">
                          <dt className="text-slate-500">
                            {typeof c.header === 'string' &&
                            c.header === c.header.toUpperCase() &&
                            c.header.length > 3
                              ? titleCase(c.header)
                              : c.header}
                          </dt>
                          <dd className="min-w-0 text-slate-800">{render(c)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'whitespace-nowrap px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 first:pl-4 last:pr-4',
                    c.headerClassName,
                  )}
                >
                  {c.sort === false ? (
                    c.header
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === 'asc' ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-60" />
                      )}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center">
                  <Spinner className="mx-auto" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState>{empty}</EmptyState>
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-slate-100 last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-slate-50',
                  )}
                >
                  {columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 text-[14.5px] text-slate-800 first:pl-4 last:pr-4',
                        dense ? 'py-2' : 'py-3',
                        ci === 0 && 'whitespace-nowrap',
                        c.className,
                      )}
                    >
                      {c.cell ? c.cell(row) : ((row as any)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!hideFooter && !loading && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 text-[13px] text-slate-500">
          <span>
            {pageSize && filtered.length > pageSize
              ? `${current * pageSize + 1}–${Math.min(filtered.length, (current + 1) * pageSize)} of ${filtered.length}`
              : `${filtered.length} record${filtered.length === 1 ? '' : 's'}`}
            {footerNote && <span className="ml-2">{footerNote}</span>}
          </span>
          {pageSize > 0 && filtered.length > pageSize && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                className="rounded p-1 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                className="rounded p-1 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
