import { MapPinOff } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CASE_CLASS_LABELS,
  CASE_MARKER_COLORS,
  CASE_STATUS_LABELS,
  SPECIES_COLORS,
  caseMarkerKind,
  titleCase,
  type CaseClass,
  type CaseStatus,
  type Species,
} from '@livestock/shared';
import { cn } from '@/lib/utils';
import { Badge, type Tone } from './ui';

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const tone: Record<CaseStatus, Tone> = {
    SUSPECTED: 'orange',
    SAMPLE_COLLECTED: 'orange',
    SENT_TO_LAB: 'amber',
    POSITIVE: 'red',
    NEGATIVE: 'slate',
  };
  return <Badge tone={tone[status]}>{CASE_STATUS_LABELS[status]}</Badge>;
}

export function ClosedBadge() {
  return <Badge tone="slate">Closed</Badge>;
}

export function GeotagBadge() {
  return (
    <Badge tone="red">
      <MapPinOff className="h-3.5 w-3.5" /> Awaiting geotagging
    </Badge>
  );
}

export function RecordStatusBadge({ status, label }: { status: string; label?: string }) {
  const tone: Tone =
    status === 'verified'
      ? 'green'
      : status === 'overdue'
        ? 'orange'
        : status === 'outdated'
          ? 'red'
          : 'slate';
  return <Badge tone={tone}>{label ?? titleCase(status)}</Badge>;
}

export function ActiveBadge({ status }: { status: string }) {
  const tone: Tone = status === 'ACTIVE' ? 'green' : status === 'ARCHIVED' ? 'slate' : 'amber';
  return <Badge tone={tone}>{titleCase(status)}</Badge>;
}

/** The office's classification of a case: Reported → Suspected → Active → Negative / Closed. */
export function CaseClassBadge({ value }: { value: CaseClass }) {
  const tone: Tone =
    value === 'ACTIVE' ? 'red' : value === 'SUSPECTED' ? 'amber' : value === 'REPORTED' ? 'blue' : 'slate';
  return <Badge tone={tone}>{CASE_CLASS_LABELS[value]}</Badge>;
}

export function LabResultBadge({ result }: { result: string }) {
  const tone: Tone =
    result === 'POSITIVE'
      ? 'red'
      : result === 'NEGATIVE'
        ? 'slate'
        : result === 'PENDING'
          ? 'amber'
          : 'violet';
  return <Badge tone={tone}>{titleCase(result)}</Badge>;
}

export function StrayStatusBadge({ status }: { status: string }) {
  const tone: Tone = status === 'CLOSED' ? 'slate' : 'orange';
  return <Badge tone={tone}>{titleCase(status)}</Badge>;
}

export function SpeciesChip({ species, count }: { species: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700/70 px-1.5 py-[1px] text-[12px] text-slate-700">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: SPECIES_COLORS[species as Species] ?? '#9ca3af' }}
      />
      {species}
      {count !== undefined && <span>{count}</span>}
    </span>
  );
}

/** The key to the map colours, shown in a box at the top of the map. */
export function MapLegend({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="group"
      aria-label="Map legend"
      className={cn(
        'mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600',
        className,
      )}
    >
      <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Legend</span>
      {children}
    </div>
  );
}

export function CaseLegend({
  includeSpecies = false,
  children,
}: {
  includeSpecies?: boolean;
  /** More keys shown in the same box (e.g. the population shading). */
  children?: ReactNode;
}) {
  const kinds: [string, keyof typeof CASE_MARKER_COLORS, boolean][] = [
    ['Suspected', 'suspected', true],
    ['In laboratory', 'lab', false],
    ['Positive', 'positive', false],
    ['Negative', 'negative', false],
  ];
  return (
    <MapLegend>
      {includeSpecies && <span className="font-medium">Farms:</span>}
      {includeSpecies &&
        Object.entries(SPECIES_COLORS).map(([s, c]) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            {s}
          </span>
        ))}
      <span className={cn('font-medium', includeSpecies && 'ml-1')}>Disease reports:</span>
      {kinds.map(([label, k, hollow]) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rotate-45"
            style={
              hollow
                ? { border: `1.5px solid ${CASE_MARKER_COLORS[k]}`, background: '#fff' }
                : { background: CASE_MARKER_COLORS[k] }
            }
          />
          {label}
        </span>
      ))}
      {children}
    </MapLegend>
  );
}

export const markerKind = (s: CaseStatus) => caseMarkerKind(s);
