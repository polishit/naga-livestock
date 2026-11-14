import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SPECIES_COLORS, titleCase, type Species } from '@livestock/shared';
import { Card, CardHeader } from './ui';

const AXIS = { fontSize: 11, fill: '#475569' };
const GRID = <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />;
const LEGEND = <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />;

/** Click handler for a bar or slice: passes the clicked row to `onSelect`. */
type OnSelect<T> = ((row: T) => void) | undefined;
const pick = <T,>(onSelect: OnSelect<T>) =>
  onSelect
    ? {
        cursor: 'pointer',
        onClick: (e: unknown) => {
          const row = (e as { payload?: T } | undefined)?.payload;
          if (row) onSelect(row);
        },
      }
    : {};

/**
 * Click anywhere in a bar's column (or on a month of a line chart) to open its records: easier than
 * hitting a thin bar or a small dot.
 */
const chartPick = <T,>(onSelect: OnSelect<T>) =>
  onSelect
    ? {
        style: { cursor: 'pointer' },
        onClick: (state: unknown) => {
          const row = (state as { activePayload?: { payload?: T }[] } | null)?.activePayload?.[0]?.payload;
          if (row) onSelect(row);
        },
      }
    : {};

/** A pie's legend items open the same records as its slices. */
const legendPick = <T,>(data: T[], key: keyof T, onSelect: OnSelect<T>) =>
  onSelect
    ? {
        wrapperStyle: { fontSize: 12, cursor: 'pointer' },
        onClick: (e: unknown) => {
          const value = (e as { value?: unknown })?.value;
          const row = data.find((d) => d[key] === value);
          if (row) onSelect(row);
        },
      }
    : { wrapperStyle: { fontSize: 12 } };

export function ChartCard({
  title,
  children,
  note,
  className,
  clickable,
}: {
  title: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  className?: string;
  /** Show that clicking the chart opens the matching records. */
  clickable?: boolean;
}) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        actions={
          clickable ? <span className="text-[12px] text-slate-400">Click to see the records</span> : undefined
        }
      />
      <div className="px-3 pb-3 pt-4">
        <div className="h-[260px]">{children}</div>
        {note && <p className="mt-2 px-1 text-[12px] text-slate-500">{note}</p>}
      </div>
    </Card>
  );
}

export function SpeciesDonut({
  data,
  onSelect,
}: {
  data: { species: string; count: number }[];
  onSelect?: (row: { species: string; count: number }) => void;
}) {
  const sorted = [...data].sort((a, b) => a.species.localeCompare(b.species));
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={sorted}
          dataKey="count"
          nameKey="species"
          innerRadius="52%"
          outerRadius="80%"
          paddingAngle={1}
          stroke="#fff"
          strokeWidth={2}
          {...pick(onSelect)}
        >
          {sorted.map((d) => (
            <Cell key={d.species} fill={SPECIES_COLORS[d.species as Species] ?? '#9ca3af'} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Legend
          iconType="square"
          iconSize={10}
          {...legendPick(sorted, 'species', onSelect)}
          formatter={(v) => <span style={{ color: SPECIES_COLORS[v as Species] ?? '#475569' }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendBars({
  data,
}: {
  data: { label: string; verified: number; carried: number; adjusted: number }[];
}) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 6 }}>
        {GRID}
        <XAxis dataKey="label" tick={{ ...AXIS, fontSize: 10.5 }} tickLine={false} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} />
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="verified" name="Verified" stackId="a" fill="#166534" />
        <Bar dataKey="adjusted" name="Adjusted" stackId="a" fill="#0ea5e9" />
        <Bar dataKey="carried" name="Carried forward" stackId="a" fill="#cbd5e1" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CasesLine<T extends { label: string; reported: number; positive: number }>({
  data,
  onSelect,
}: {
  data: T[];
  onSelect?: (row: T) => void;
}) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ left: -16, right: 12, top: 6 }} {...chartPick(onSelect)}>
        {GRID}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} />
        <Tooltip />
        {LEGEND}
        <Line
          type="linear"
          dataKey="positive"
          name="Positive"
          stroke="#dc2626"
          strokeWidth={1.8}
          dot={{ r: 3, fill: '#fff' }}
        />
        <Line
          type="linear"
          dataKey="reported"
          name="Reported"
          stroke="#f59e0b"
          strokeWidth={1.8}
          dot={{ r: 3, fill: '#fff' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarangayBars({
  data,
  onSelect,
}: {
  data: { barangay: string; count: number }[];
  onSelect?: (row: { barangay: string; count: number }) => void;
}) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 6, bottom: 26 }} {...chartPick(onSelect)}>
        {GRID}
        <XAxis
          dataKey="barangay"
          tick={{ ...AXIS, fontSize: 10 }}
          angle={-25}
          textAnchor="end"
          interval={0}
          tickLine={false}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} />
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Bar dataKey="count" name="Head" fill="#16a34a" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CoverageBars<T extends { species: string; estimatedPct: number; exactPct: number | null }>({
  data,
  onSelect,
}: {
  data: T[];
  onSelect?: (row: T) => void;
}) {
  return (
    <ResponsiveContainer>
      <BarChart
        data={data.map((d) => ({ ...d, exactPct: d.exactPct ?? 0 }))}
        margin={{ left: -8, right: 8, top: 6 }}
        {...chartPick(onSelect)}
      >
        {GRID}
        <XAxis dataKey="species" tick={{ ...AXIS, fontSize: 9.5 }} tickLine={false} interval={0} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: '#334155' }}
        />
        <Tooltip formatter={(v: number) => `${v}%`} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="estimatedPct" name="Estimated %" fill="#f59e0b" />
        <Bar dataKey="exactPct" name="Exact % (tagged)" fill="#166534" />
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS_COLORS = ['#166534', '#7c3aed', '#dc2626', '#16a34a', '#0ea5e9', '#f59e0b'];
export function StatusPie<T extends { label: string; count: number }>({
  data,
  onSelect,
}: {
  data: T[];
  onSelect?: (row: T) => void;
}) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" outerRadius="80%" stroke="#fff" {...pick(onSelect)}>
          {data.map((d, i) => (
            <Cell key={d.label} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend iconType="square" iconSize={10} {...legendPick(data, 'label', onSelect)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DiseaseBars({
  data,
  onSelect,
}: {
  data: { disease: string; count: number }[];
  onSelect?: (row: { disease: string; count: number }) => void;
}) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }} {...chartPick(onSelect)}>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} />
        <YAxis
          type="category"
          dataKey="disease"
          width={130}
          tick={{ ...AXIS, fontSize: 10 }}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip />
        <Bar dataKey="count" name="Cases" fill="#dc2626" barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VaccinationLine({ data }: { data: { label: string; doses: number; events: number }[] }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ left: -8, right: 12, top: 6 }}>
        {GRID}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} />
        <Tooltip />
        {LEGEND}
        <Line
          type="linear"
          dataKey="doses"
          name="Doses"
          stroke="#166534"
          strokeWidth={1.8}
          dot={{ r: 3, fill: '#fff' }}
        />
        <Line
          type="linear"
          dataKey="events"
          name="Events"
          stroke="#0ea5e9"
          strokeWidth={1.8}
          dot={{ r: 3, fill: '#fff' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

const TYPE_COLORS: Record<string, string> = {
  backyard: '#166534',
  commercial: '#16a34a',
  Piggery: '#e11d48',
  'Cattle Only': '#b45309',
  'Carabao Only': '#475569',
  'Goat Only': '#16a34a',
  'Sheep Only': '#65a30d',
  Poultry: '#f59e0b',
  Mixed: '#0ea5e9',
  'No Livestock Yet': '#cbd5e1',
};
export function FarmTypeDonut({
  data,
  onSelect,
}: {
  data: { type: string; count: number }[];
  onSelect?: (row: { type: string; count: number }) => void;
}) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="type"
          innerRadius="45%"
          outerRadius="80%"
          stroke="#fff"
          {...pick(onSelect)}
        >
          {data.map((d) => (
            <Cell key={d.type} fill={TYPE_COLORS[d.type] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number, n: string) => [v, titleCase(n)]} />
        <Legend iconType="square" iconSize={10} {...legendPick(data, 'type', onSelect)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LargestFarmsBars<T extends { name: string; total: number }>({
  data,
  onSelect,
}: {
  data: T[];
  onSelect?: (row: T) => void;
}) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 6, bottom: 30 }} {...chartPick(onSelect)}>
        {GRID}
        <XAxis
          dataKey="name"
          tick={{ ...AXIS, fontSize: 10 }}
          angle={-20}
          textAnchor="end"
          interval={0}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} />
        <Tooltip />
        <Bar dataKey="total" name="Head" fill="#166534" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Monthly totals of field work: heads dewormed, heads checked, heads vaccinated and farm visits. */
const FIELD_BARS = {
  dewormed: { name: 'Heads dewormed', fill: '#0ea5e9' },
  checkups: { name: 'Heads checked', fill: '#16a34a' },
  vaccinated: { name: 'Heads vaccinated', fill: '#a855f7' },
  visits: { name: 'Farm visits', fill: '#f59e0b' },
} as const;
export function ServiceTrendBars<
  T extends { label: string } & Partial<Record<keyof typeof FIELD_BARS, number>>,
>({
  data,
  bars = ['dewormed', 'checkups', 'visits'],
  onSelect,
}: {
  data: T[];
  bars?: (keyof typeof FIELD_BARS)[];
  onSelect?: (row: T) => void;
}) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ left: -8, right: 12, top: 6 }} {...chartPick(onSelect)}>
        {GRID}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} />
        <Tooltip />
        {LEGEND}
        {bars.map((b) => (
          <Bar
            key={b}
            dataKey={b}
            name={FIELD_BARS[b].name}
            fill={FIELD_BARS[b].fill}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Disease reports per month (with confirmed positives when given). */
export function ReportTrendLine<T extends { label: string; reports: number; positive?: number }>({
  data,
  onSelect,
}: {
  data: T[];
  onSelect?: (row: T) => void;
}) {
  const hasPositive = data.some((d) => d.positive != null);
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ left: -8, right: 12, top: 6 }} {...chartPick(onSelect)}>
        {GRID}
        <XAxis dataKey="label" tick={AXIS} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={{ stroke: '#334155' }} />
        <Tooltip />
        {LEGEND}
        <Line
          type="linear"
          dataKey="reports"
          name="Disease reports"
          stroke="#dc2626"
          strokeWidth={2}
          dot={{ r: 3, fill: '#fff' }}
        />
        {hasPositive && (
          <Line
            type="linear"
            dataKey="positive"
            name="Confirmed positive"
            stroke="#7f1d1d"
            strokeWidth={1.8}
            strokeDasharray="4 3"
            dot={{ r: 3, fill: '#fff' }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Heads per species (e.g. dewormed this month), coloured by species. */
export function SpeciesHeadBars<T extends { species: string; head: number }>({
  data,
  name = 'Heads',
  onSelect,
}: {
  data: T[];
  name?: string;
  onSelect?: (row: T) => void;
}) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16 }} {...chartPick(onSelect)}>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} />
        <YAxis type="category" dataKey="species" width={90} tick={AXIS} />
        <Tooltip />
        <Bar dataKey="head" name={name} barSize={18}>
          {data.map((d) => (
            <Cell key={d.species} fill={SPECIES_COLORS[d.species as Species] ?? '#64748b'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
