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

export function ChartCard({
  title,
  children,
  note,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} />
      <div className="px-3 pb-3 pt-4">
        <div className="h-[260px]">{children}</div>
        {note && <p className="mt-2 px-1 text-[12px] text-slate-500">{note}</p>}
      </div>
    </Card>
  );
}

export function SpeciesDonut({ data }: { data: { species: string; count: number }[] }) {
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
        >
          {sorted.map((d) => (
            <Cell key={d.species} fill={SPECIES_COLORS[d.species as Species] ?? '#9ca3af'} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => v.toLocaleString()} />
        <Legend
          iconType="square"
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
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

export function CasesLine({ data }: { data: { label: string; reported: number; positive: number }[] }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ left: -16, right: 12, top: 6 }}>
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

export function BarangayBars({ data }: { data: { barangay: string; count: number }[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 6, bottom: 26 }}>
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

export function CoverageBars({
  data,
}: {
  data: { species: string; estimatedPct: number; exactPct: number | null }[];
}) {
  return (
    <ResponsiveContainer>
      <BarChart
        data={data.map((d) => ({ ...d, exactPct: d.exactPct ?? 0 }))}
        margin={{ left: -8, right: 8, top: 6 }}
      >
        {GRID}
        <XAxis
          dataKey="species"
          tick={{ ...AXIS, fontSize: 9.5 }}
          tickLine={false}
          interval={0}
          tickFormatter={(v: string) => (v === 'Other Poultry' ? 'Oth. Poultry' : v)}
        />
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
export function StatusPie({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" outerRadius="80%" stroke="#fff">
          {data.map((d, i) => (
            <Cell key={d.label} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DiseaseBars({ data }: { data: { disease: string; count: number }[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
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
  mixed: '#f59e0b',
  pasture: '#0ea5e9',
  poultry: '#dc2626',
};
export function FarmTypeDonut({ data }: { data: { type: string; count: number }[] }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="type" innerRadius="45%" outerRadius="80%" stroke="#fff">
          {data.map((d) => (
            <Cell key={d.type} fill={TYPE_COLORS[d.type] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number, n: string) => [v, titleCase(n)]} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LargestFarmsBars({ data }: { data: { name: string; total: number }[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 6, bottom: 30 }}>
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
