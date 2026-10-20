import { MapPinOff } from 'lucide-react';
import {
  CASE_MARKER_COLORS,
  CASE_STATUS_LABELS,
  SPECIES_COLORS,
  caseMarkerKind,
  titleCase,
  type CaseStatus,
  type Species,
} from '@livestock/shared';
import { Badge, type Tone } from './ui';

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const tone: Record<CaseStatus, Tone> = {
    SUSPECTED: 'orange',
    SAMPLE_COLLECTED: 'orange',
    SENT_TO_LAB: 'amber',
    AWAITING_RESULT: 'amber',
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
  const tone: Tone =
    status === 'CLOSED'
      ? 'slate'
      : status === 'RELEASED'
        ? 'blue'
        : status === 'IMPOUNDED'
          ? 'amber'
          : 'orange';
  return <Badge tone={tone}>{titleCase(status)}</Badge>;
}

export function SpeciesChip({ species, count }: { species: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700/70 px-1.5 py-[1px] text-[12px] text-slate-700">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: SPECIES_COLORS[species as Species] ?? '#9ca3af' }}
      />
      {species}
      {count !== undefined && <span>{count}</span>}
    </span>
  );
}

export function CaseLegend({ includeSpecies = false }: { includeSpecies?: boolean }) {
  const kinds: [string, keyof typeof CASE_MARKER_COLORS, boolean][] = [
    ['Suspected', 'suspected', true],
    ['In laboratory', 'lab', false],
    ['Positive', 'positive', false],
    ['Negative', 'negative', false],
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-600">
      {includeSpecies &&
        Object.entries(SPECIES_COLORS).map(([s, c]) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            {s}
          </span>
        ))}
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
    </div>
  );
}

export const markerKind = (s: CaseStatus) => caseMarkerKind(s);