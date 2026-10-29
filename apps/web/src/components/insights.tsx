import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  Minus,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SPECIES, fmtDate } from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi, useSave } from '@/lib/hooks';
import { cn, qs } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, Dialog, Input, Select } from '@/components/ui';

/* ---------------- shared ---------------- */

function Bar({
  pct,
  tone = 'green',
  marker,
}: {
  pct: number;
  tone?: 'green' | 'amber' | 'red';
  marker?: number;
}) {
  const color = { green: 'bg-emerald-600', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn('h-full rounded-full', color)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
      {marker != null && (
        <div
          className="absolute top-0 h-full w-0.5 bg-slate-500"
          style={{ left: `${Math.min(100, marker)}%` }}
          title="Share of the year gone"
        />
      )}
    </div>
  );
}

/* ---------------- this period vs the one before ---------------- */

interface Compare {
  months: number;
  current: { label: string };
  previous: { label: string };
  kpis: {
    key: string;
    label: string;
    current: number;
    previous: number;
    better: 'up' | 'down' | 'neutral';
  }[];
}

/** Key numbers for the chosen period, each with the change from the period before it. */
export function CompareKpis({
  barangay,
  species,
  months,
}: {
  barangay: string;
  species: string;
  months: string;
}) {
  const { data } = useApi<Compare>(`/api/insights/compare${qs({ barangay, species, months })}`);
  if (!data) return null;
  return (
    <Card className="mb-4">
      <CardHeader
        title="This period compared with the one before"
        actions={
          <span className="text-[12.5px] text-slate-500">
            {data.current.label} vs {data.previous.label}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 lg:grid-cols-7">
        {data.kpis.map((k) => {
          const diff = k.current - k.previous;
          const good = k.better === 'neutral' || diff === 0 ? null : diff > 0 === (k.better === 'up');
          const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
          return (
            <div key={k.key} className="bg-white px-4 py-3">
              <div className="text-[12.5px] leading-snug text-slate-500">{k.label}</div>
              <div className="mt-1 text-[22px] font-semibold text-slate-900">
                {k.current.toLocaleString()}
              </div>
              <div
                className={cn(
                  'mt-0.5 inline-flex items-center gap-0.5 text-[12.5px] font-medium',
                  good === null ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-600',
                )}
                title={`Before: ${k.previous.toLocaleString()}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff.toLocaleString()} vs before`}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- disease hotspots ---------------- */

interface Hotspots {
  windowDays: number;
  rows: {
    barangay: string;
    recent: number;
    baseline: number;
    level: 'hotspot' | 'rising' | 'normal';
    positive: number;
    diseases: string[];
  }[];
}

const LEVEL: Record<Hotspots['rows'][number]['level'], { label: string; tone: 'red' | 'orange' | 'slate' }> =
  {
    hotspot: { label: 'Hotspot', tone: 'red' },
    rising: { label: 'Rising', tone: 'orange' },
    normal: { label: 'Usual', tone: 'slate' },
  };

export function HotspotsCard() {
  const { data } = useApi<Hotspots>('/api/insights/hotspots');
  return (
    <Card>
      <CardHeader title="Disease hotspots (last 30 days)" />
      <div className="px-4 py-3">
        <p className="mb-3 text-[12.5px] text-slate-500">
          A barangay is a <b className="font-medium text-red-600">hotspot</b> when it has 2 or more cases in
          the last 30 days and at least twice its usual number per month (the year before).
        </p>
        {!data ? null : !data.rows.length ? (
          <p className="text-sm text-slate-500">No cases reported in the last 30 days.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <li key={r.barangay} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    to={`/cases?barangay=${encodeURIComponent(r.barangay)}&state=all`}
                    className="text-[14.5px] font-medium text-brand-dark hover:underline"
                  >
                    {r.barangay}
                  </Link>
                  <div className="truncate text-[12.5px] text-slate-500">
                    {r.recent} case{r.recent === 1 ? '' : 's'} (usual {r.baseline}/month) ·{' '}
                    {r.diseases.join(', ')}
                  </div>
                </div>
                <Badge tone={LEVEL[r.level].tone}>{LEVEL[r.level].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** A red strip on the Dashboard while any barangay is a hotspot. */
export function HotspotBanner() {
  const { data } = useApi<Hotspots>('/api/insights/hotspots');
  const hot = data?.rows.filter((r) => r.level === 'hotspot') ?? [];
  if (!hot.length) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2 text-[14.5px]">
        <Flame className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b className="font-semibold">Disease hotspot:</b>{' '}
          {hot.map((h) => `${h.barangay} (${h.recent} cases in 30 days)`).join(', ')}. Check the cases and
          plan a response.
        </span>
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link to="/analytics">See details</Link>
      </Button>
    </div>
  );
}

/* ---------------- data quality ---------------- */

interface Quality {
  score: number;
  items: { key: string; label: string; missing: number; total: number; href: string }[];
}

export function DataQualityCard({ barangay }: { barangay?: string }) {
  const { data } = useApi<Quality>(`/api/insights/data-quality${qs({ barangay })}`);
  return (
    <Card>
      <CardHeader
        title="Record completeness"
        actions={
          data && (
            <Badge tone={data.score >= 85 ? 'green' : data.score >= 65 ? 'amber' : 'red'}>
              {data.score}% complete
            </Badge>
          )
        }
      />
      <div className="px-4 py-3">
        <p className="mb-3 text-[12.5px] text-slate-500">
          Complete records make the maps, radius checks and reports trustworthy. Select <b>Fix</b> to open the
          records that need details.
        </p>
        <ul className="space-y-3">
          {data?.items.map((i) => (
            <li key={i.key}>
              <div className="mb-1 flex items-center justify-between gap-3 text-[13.5px]">
                <span className="text-slate-700">
                  {i.label}: <b className="font-semibold">{i.missing}</b>
                  <span className="text-slate-400"> of {i.total}</span>
                </span>
                {i.missing > 0 ? (
                  <Link
                    to={i.href}
                    className="shrink-0 text-[13px] font-medium text-brand-dark hover:underline"
                  >
                    Fix
                  </Link>
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
              </div>
              <Bar
                pct={i.total ? ((i.total - i.missing) / i.total) * 100 : 100}
                tone={i.missing === 0 ? 'green' : i.missing / Math.max(1, i.total) > 0.3 ? 'red' : 'amber'}
              />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* ---------------- vaccination targets ---------------- */

interface Targets {
  year: number;
  yearElapsedPct: number;
  rows: { vaccine: string; species: string; target: number; given: number; pct: number; onTrack: boolean }[];
}

export function TargetsCard() {
  const { isAdmin } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const { data } = useApi<Targets>(`/api/insights/vaccination-targets?year=${year}`);
  return (
    <Card>
      <CardHeader
        title="Vaccination targets"
        actions={
          <>
            <Select
              aria-label="Target year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-8 w-24 text-[13.5px]"
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y}>{y}</option>
              ))}
            </Select>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <Target /> Set targets
              </Button>
            )}
          </>
        }
      />
      <div className="px-4 py-3">
        {!data ? null : !data.rows.length ? (
          <p className="text-sm text-slate-500">
            No targets for {year} yet.{' '}
            {isAdmin
              ? 'Select "Set targets" to add the doses planned per vaccine.'
              : 'An administrator sets them.'}
          </p>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] text-slate-500">
              Doses given in {data.year} against the yearly target. The grey line marks how much of the year
              has passed ({data.yearElapsedPct}%).
            </p>
            <ul className="space-y-3">
              {data.rows.map((r) => (
                <li key={`${r.vaccine}|${r.species}`}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="text-slate-700">
                      {r.vaccine} <span className="text-slate-400">· {r.species}</span>
                    </span>
                    <span className="shrink-0 text-slate-600">
                      {r.given.toLocaleString()} / {r.target.toLocaleString()} ({r.pct}%)
                    </span>
                  </div>
                  <Bar
                    pct={r.pct}
                    tone={r.pct >= 100 || r.onTrack ? 'green' : 'amber'}
                    marker={data.yearElapsedPct}
                  />
                  {!r.onTrack && r.pct < 100 && (
                    <div className="mt-0.5 text-[12px] text-amber-700">Behind schedule</div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {isAdmin && <TargetsDialog open={open} onOpenChange={setOpen} year={year} current={data?.rows ?? []} />}
    </Card>
  );
}

type TargetRow = { vaccine: string; species: string; target: string };

function TargetsDialog({
  open,
  onOpenChange,
  year,
  current,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  year: number;
  current: Targets['rows'];
}) {
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setRows(
        current.length
          ? current.map((r) => ({ vaccine: r.vaccine, species: r.species, target: String(r.target) }))
          : [{ vaccine: '', species: '', target: '' }],
      );
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = useSave<{ year: number; targets: { vaccine: string; species: string; target: number }[] }>(
    'PUT',
    '/api/insights/vaccination-targets',
    { success: `Vaccination targets for ${year} saved.`, offline: false, onDone: () => onOpenChange(false) },
  );
  const set = (i: number, k: keyof TargetRow, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const submit = () => {
    const filled = rows.filter((r) => r.vaccine.trim() || r.species || r.target);
    if (filled.some((r) => !r.vaccine.trim() || !r.species || !(Number(r.target) > 0)))
      return setError('Each row needs a vaccine, a species and a target above 0 (or remove the row).');
    const keys = filled.map((r) => `${r.vaccine.trim().toLowerCase()}|${r.species}`);
    if (new Set(keys).size !== keys.length)
      return setError('Each vaccine and species can have only one target.');
    setError('');
    save.mutate({
      year,
      targets: filled.map((r) => ({
        vaccine: r.vaccine.trim(),
        species: r.species,
        target: Number(r.target),
      })),
    });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Vaccination targets for ${year}`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save targets
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] text-slate-600">
        Enter the number of doses the office plans to give this year. Use the same vaccine name as in the
        vaccination records (for example &quot;Hog Cholera Vaccine&quot;).
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_150px_120px_auto]">
            <Input
              aria-label={`Vaccine ${i + 1}`}
              placeholder="Vaccine"
              value={r.vaccine}
              onChange={(e) => set(i, 'vaccine', e.target.value)}
              className="col-span-2 sm:col-span-1"
            />
            <Select
              aria-label={`Species ${i + 1}`}
              value={r.species}
              onChange={(e) => set(i, 'species', e.target.value)}
            >
              <option value="">Species...</option>
              {SPECIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Input
              aria-label={`Target doses ${i + 1}`}
              type="number"
              min={1}
              placeholder="Doses"
              value={r.target}
              onChange={(e) => set(i, 'target', e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove row ${i + 1}`}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => setRows((rs) => [...rs, { vaccine: '', species: '', target: '' }])}
      >
        <Plus /> Add target
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-red-600">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/* ---------------- My tasks ---------------- */

interface Tasks {
  count: number;
  overdue: number;
  tasks: {
    group: string;
    title: string;
    sub: string;
    href: string;
    action: string;
    due: string | null;
    overdue: boolean;
  }[];
}

const GROUP_ORDER = [
  'Field visits',
  'Lab results',
  'Response measures',
  'Case locations',
  'Vaccinations due',
  'Head counts',
  'Farm locations',
];

/** Everything waiting to be done, grouped, with a button that opens the right page or form. */
export function MyTasksCard() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const { data } = useApi<Tasks>('/api/insights/tasks');
  const [group, setGroup] = useState<string>('');
  const groups = GROUP_ORDER.map((g) => ({
    g,
    items: data?.tasks.filter((t) => t.group === g) ?? [],
  })).filter((x) => x.items.length);
  const shown = (group ? groups.filter((x) => x.g === group) : groups).flatMap((x) =>
    [...x.items].sort(
      (a, b) => Number(b.overdue) - Number(a.overdue) || (a.due ?? '9').localeCompare(b.due ?? '9'),
    ),
  );
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            My tasks
            {data && <Badge tone={data.overdue ? 'red' : 'green'}>{data.count}</Badge>}
          </span>
        }
        actions={
          data?.overdue ? (
            <span className="text-[12.5px] text-red-600">{data.overdue} overdue</span>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5">
        <Chip active={!group} onClick={() => setGroup('')}>
          All
        </Chip>
        {groups.map((x) => (
          <Chip key={x.g} active={group === x.g} onClick={() => setGroup(x.g)}>
            {x.g} <span className="text-slate-400">{x.items.length}</span>
          </Chip>
        ))}
      </div>
      <ul className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
        {data && !data.count && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            All caught up — nothing to do right now.
          </li>
        )}
        {shown.map((t, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[14px] text-slate-900">
                <span className="truncate">{t.title}</span>
                {t.overdue && <Badge tone="red">Overdue</Badge>}
              </div>
              <div className="truncate text-[12.5px] text-slate-500">
                {t.due ? `Due ${fmtDate(t.due)} · ` : ''}
                {t.sub}
              </div>
            </div>
            <Button size="xs" variant={t.overdue ? 'default' : 'outline'} onClick={() => navigate(t.href)}>
              {canEdit ? t.action : 'View'} <ArrowRight />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[12.5px]',
        active
          ? 'border-brand-strong bg-brand-strong text-white'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- first-time welcome ---------------- */

const WELCOME_KEY = 'welcome-dismissed';

const FLOW: { step: string; text: string; to: string }[] = [
  {
    step: 'Register',
    text: 'Add the raiser, their farm (pin it on the map) and their animals',
    to: '/owners',
  },
  { step: 'Monitor', text: 'Update each farm’s head count every month', to: '/population' },
  { step: 'Report', text: 'Report a sick or dead animal as a disease case', to: '/cases/new' },
  { step: 'Investigate', text: 'Record the site visit and send samples to the lab', to: '/investigation' },
  { step: 'Respond', text: 'Log quarantine, disinfection or culling until it is contained', to: '/response' },
  { step: 'Report up', text: 'Print the monthly accomplishment report', to: '/reports' },
];

/** Shown until dismissed: how the system's work flows, step by step. */
export function WelcomeCard() {
  const { user } = useAuth();
  const key = `${WELCOME_KEY}:${user?.id ?? ''}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* private mode: hide for this visit only */
    }
    setHidden(true);
  };
  return (
    <Card className="mb-4 border-brand/30 bg-brand-light/40">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="text-[16px] font-semibold text-slate-900">How the system works</h2>
          <p className="text-[13.5px] text-slate-600">
            Follow these steps in order. &quot;My tasks&quot; below always shows what to do next, and the{' '}
            <b>?</b> button at the top of every page explains that page.
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Hide this guide" onClick={dismiss}>
          <X />
        </Button>
      </div>
      <ol className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-6">
        {FLOW.map((f, i) => (
          <li key={f.step}>
            <Link
              to={f.to}
              className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3 hover:border-brand"
            >
              <span className="text-[12px] font-semibold uppercase tracking-wide text-brand-dark">
                {i + 1}. {f.step}
              </span>
              <span className="mt-1 text-[13px] leading-snug text-slate-600">{f.text}</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="px-4 pb-4">
        <Button size="sm" variant="outline" onClick={dismiss}>
          Got it, hide this guide
        </Button>
      </div>
    </Card>
  );
}