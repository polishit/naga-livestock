import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Circle,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { Link } from 'react-router-dom';
import {
  CASE_MARKER_COLORS,
  CASE_STATUS_LABELS,
  NAGA_CENTER,
  SPECIES_COLORS,
  caseMarkerKind,
  type CaseStatus,
  type Species,
} from '@livestock/shared';
import { cn } from '@/lib/utils';

export interface FarmMarker {
  id: number;
  lat: number | null;
  lng: number | null;
  name: string;
  code?: string;
  barangay?: string;
  ownerName?: string;
  total?: number;
  species?: { species: string; count: number }[];
  /** Draw in the red "within radius" style. */
  inRadius?: boolean;
}
export interface CaseMarker {
  id: number;
  lat: number | null;
  lng: number | null;
  code: string;
  disease: string;
  status: CaseStatus;
  farmName?: string | null;
}
export interface StrayMarker {
  id: number;
  lat: number | null;
  lng: number | null;
  code: string;
  species: string;
}
export interface LatLng {
  lat: number;
  lng: number;
}
/** A farm's pasture / grazing area away from the farm itself. */
export interface PastureMarker {
  id: number;
  lat: number | null;
  lng: number | null;
  name: string;
}

/** Shaded areas (barangays) drawn from GeoJSON, each coloured by a value. */
export interface AreaLayer {
  data: GeoJSON.FeatureCollection;
  /** Fill colour for an area, by its `name` property. */
  fill: (name: string) => string;
  /** Tooltip text for an area. */
  label: (name: string) => string;
  onClick?: (name: string) => void;
  selected?: string | null;
  /** Draw boundaries only (no fill), e.g. as context under other layers. */
  outlineOnly?: boolean;
  /** Change to redraw the colours (e.g. when the metric changes). */
  version: string;
}

function farmIcon(f: FarmMarker) {
  const dominant = [...(f.species ?? [])].sort((a, b) => b.count - a.count)[0]?.species as
    | Species
    | undefined;
  const ring = f.inRadius ? '#dc2626' : dominant ? SPECIES_COLORS[dominant] : '#94a3b8';
  const n = f.species?.length ?? 0;
  const html = `<div style="position:relative;width:22px;height:22px">
    <div style="width:22px;height:22px;border-radius:50%;background:${f.inRadius ? '#fff5f5' : '#fff'};border:3px solid ${ring};box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>
    ${n ? `<span style="position:absolute;top:-7px;right:-8px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:#111827;color:#fff;font:600 9px/15px Inter,sans-serif;text-align:center;border:1px solid #fff">${n}</span>` : ''}
  </div>`;
  return L.divIcon({ html, className: 'leaflet-div-icon-clear', iconSize: [22, 22], iconAnchor: [11, 11] });
}

function caseIcon(status: CaseStatus, highlight = false) {
  const kind = caseMarkerKind(status);
  const color = CASE_MARKER_COLORS[kind];
  const hollow = kind === 'suspected';
  const diamond = `<div style="width:16px;height:16px;transform:rotate(45deg);border-radius:2px;background:${hollow ? '#fff' : color};border:${hollow ? `3px solid ${color}` : '1.5px solid #fff'};box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>`;
  // A newly reported case (timeline) gets a pulsing ring.
  const html = highlight
    ? `<div style="position:relative;width:16px;height:16px"><span class="case-pulse" style="border-color:${color}"></span>${diamond}</div>`
    : diamond;
  return L.divIcon({ html, className: 'leaflet-div-icon-clear', iconSize: [16, 16], iconAnchor: [8, 8] });
}

const gzIcon = L.divIcon({
  html: `<div style="width:34px;height:34px;border-radius:50%;background:rgba(220,38,38,.25);display:flex;align-items:center;justify-content:center">
    <div style="width:26px;height:26px;border-radius:50%;background:#dc2626;border:2px solid #fff;color:#fff;font:700 10px/22px Inter,sans-serif;text-align:center">GZ</div></div>`,
  className: 'leaflet-div-icon-clear',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const strayIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;border-radius:4px;background:#7c3aed;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>`,
  className: 'leaflet-div-icon-clear',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const pastureIcon = L.divIcon({
  html: `<div style="width:22px;height:22px;border-radius:5px;background:#ecfdf5;border:2px dashed #15803d;color:#15803d;font:700 11px/18px Inter,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.25)">P</div>`,
  className: 'leaflet-div-icon-clear',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const pinIcon = L.divIcon({
  html: `<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C7 0 1 6 1 14c0 10 14 26 14 26s14-16 14-26C29 6 23 0 15 0z" fill="#166534" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>`,
  className: 'leaflet-div-icon-clear',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

function FitTo({
  points,
  circle,
  bounds,
  version,
}: {
  points: [number, number][];
  circle?: { lat: number; lng: number; radius: number };
  bounds?: L.LatLngBounds | null;
  version: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (circle) {
      map.fitBounds(L.latLng(circle.lat, circle.lng).toBounds(circle.radius * 2.4), { animate: false });
    } else if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [16, 16], animate: false });
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15, animate: false });
    } else if (points.length === 1) {
      map.setView(points[0], 15, { animate: false });
    } else {
      map.setView(NAGA_CENTER, 12, { animate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, map]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    },
  });
  return null;
}

/** Re-measure when the container becomes visible (dialogs, tabs). */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export interface MapViewProps {
  farms?: FarmMarker[];
  cases?: CaseMarker[];
  strays?: StrayMarker[];
  /** Pasture areas (drawn as a dashed green "P"). */
  pastures?: PastureMarker[];
  /** Radius circles drawn around these points (metres). */
  circles?: { lat: number; lng: number; radius: number }[];
  groundZero?: LatLng | null;
  /** Fit to this circle instead of all points. */
  focusCircle?: { lat: number; lng: number; radius: number };
  pick?: { value: LatLng | null; onChange: (p: LatLng) => void };
  onFarmClick?: (f: FarmMarker) => void;
  onCaseClick?: (c: CaseMarker) => void;
  selectedCaseId?: number | null;
  className?: string;
  showZoom?: boolean;
  overlay?: ReactNode;
  /** Change to re-fit bounds (e.g. when the selection changes). */
  fitKey?: string | number;
  /** Shaded barangays (the map then fits to them). */
  areas?: AreaLayer;
  /** Cases drawn with a pulsing ring (e.g. newly reported this month on the timeline). */
  highlightCaseIds?: number[];
}

export function MapView({
  farms = [],
  cases = [],
  strays = [],
  pastures = [],
  circles = [],
  groundZero,
  focusCircle,
  pick,
  onFarmClick,
  onCaseClick,
  className,
  showZoom = true,
  overlay,
  fitKey,
  areas,
  highlightCaseIds,
}: MapViewProps) {
  const [version, setVersion] = useState(0);
  const areaBounds = useMemo(() => (areas ? L.geoJSON(areas.data).getBounds() : null), [areas?.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlighted = useMemo(() => new Set(highlightCaseIds ?? []), [highlightCaseIds]);
  const points = useMemo(() => {
    const p: [number, number][] = [];
    for (const f of farms) if (f.lat != null && f.lng != null) p.push([f.lat, f.lng]);
    for (const c of cases) if (c.lat != null && c.lng != null) p.push([c.lat, c.lng]);
    for (const s of strays) if (s.lat != null && s.lng != null) p.push([s.lat, s.lng]);
    for (const s of pastures) if (s.lat != null && s.lng != null) p.push([s.lat, s.lng]);
    if (pick?.value) p.push([pick.value.lat, pick.value.lng]);
    if (groundZero) p.push([groundZero.lat, groundZero.lng]);
    return p;
  }, [farms, cases, strays, pastures, pick?.value, groundZero]);

  useEffect(() => {
    setVersion((v) => v + 1);
  }, [fitKey]);

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-lg border border-slate-200 bg-[#f6f3ee]',
        className,
      )}
    >
      <MapContainer
        center={NAGA_CENTER}
        zoom={12}
        zoomSnap={0.25}
        zoomControl={showZoom}
        scrollWheelZoom
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />
        <InvalidateOnResize />
        <FitTo points={points} circle={focusCircle} bounds={areaBounds} version={version} />
        {areas && (
          <GeoJSON
            key={`${areas.version}|${areas.selected ?? ''}`}
            data={areas.data}
            interactive={!areas.outlineOnly}
            style={(feature) => {
              const name = String(feature?.properties?.name ?? '');
              const sel = areas.selected === name;
              if (areas.outlineOnly)
                return { color: '#166534', weight: 1, opacity: 0.55, dashArray: '4 3', fillOpacity: 0 };
              return {
                color: sel ? '#0f172a' : '#ffffff',
                weight: sel ? 3 : 1.2,
                fillColor: areas.fill(name),
                fillOpacity: 0.72,
              };
            }}
            onEachFeature={(feature, layer) => {
              const name = String(feature.properties?.name ?? '');
              if (!areas.outlineOnly) layer.bindTooltip(areas.label(name), { sticky: true });
              if (areas.onClick) layer.on('click', () => areas.onClick!(name));
            }}
          />
        )}
        {circles.map((c, i) => (
          <Circle
            key={i}
            center={[c.lat, c.lng]}
            radius={c.radius}
            pathOptions={{ color: '#dc2626', weight: 2, fillColor: '#dc2626', fillOpacity: 0.14 }}
          />
        ))}
        {farms
          .filter((f) => f.lat != null && f.lng != null)
          .map((f) => (
            <Marker
              key={`f${f.id}`}
              position={[f.lat!, f.lng!]}
              icon={farmIcon(f)}
              eventHandlers={onFarmClick ? { click: () => onFarmClick(f) } : undefined}
            >
              {!onFarmClick && (
                <Popup>
                  <div className="min-w-[180px] text-[13px]">
                    <Link to={`/farms/${f.id}`} className="font-semibold text-brand-dark">
                      {f.name}
                    </Link>
                    <div className="text-slate-500">
                      {f.code} · {f.barangay}
                    </div>
                    {f.ownerName && <div>Owner: {f.ownerName}</div>}
                    {f.total !== undefined && <div>{f.total} head</div>}
                    {f.species && (
                      <div className="text-slate-500">
                        {f.species.map((s) => `${s.species} ${s.count}`).join(' · ')}
                      </div>
                    )}
                  </div>
                </Popup>
              )}
              <Tooltip direction="top" offset={[0, -10]}>
                {f.name}
              </Tooltip>
            </Marker>
          ))}
        {cases
          .filter((c) => c.lat != null && c.lng != null)
          .map((c) => (
            <Marker
              key={`c${c.id}`}
              position={[c.lat!, c.lng!]}
              icon={caseIcon(c.status, highlighted.has(c.id))}
              zIndexOffset={highlighted.has(c.id) ? 700 : 500}
              eventHandlers={onCaseClick ? { click: () => onCaseClick(c) } : undefined}
            >
              {!onCaseClick && (
                <Popup>
                  <div className="min-w-[180px] text-[13px]">
                    <Link to={`/cases/${c.id}`} className="font-semibold text-brand-dark">
                      {c.code}
                    </Link>
                    <div>{c.disease}</div>
                    <div className="text-slate-500">{CASE_STATUS_LABELS[c.status]}</div>
                    {c.farmName && <div className="text-slate-500">{c.farmName}</div>}
                  </div>
                </Popup>
              )}
              <Tooltip direction="top" offset={[0, -8]}>
                {c.code} · {c.disease}
              </Tooltip>
            </Marker>
          ))}
        {strays
          .filter((s) => s.lat != null && s.lng != null)
          .map((s) => (
            <Marker key={`s${s.id}`} position={[s.lat!, s.lng!]} icon={strayIcon}>
              <Tooltip direction="top" offset={[0, -8]}>
                {s.code} · stray {s.species.toLowerCase()}
              </Tooltip>
            </Marker>
          ))}
        {pastures
          .filter((s) => s.lat != null && s.lng != null)
          .map((s) => (
            <Marker key={`p${s.id}`} position={[s.lat!, s.lng!]} icon={pastureIcon}>
              <Tooltip direction="top" offset={[0, -10]}>
                Pasture · {s.name}
              </Tooltip>
            </Marker>
          ))}
        {groundZero && (
          <Marker position={[groundZero.lat, groundZero.lng]} icon={gzIcon} zIndexOffset={800} />
        )}
        {pick && <ClickPicker onPick={pick.onChange} />}
        {pick?.value && (
          <Marker
            position={[pick.value.lat, pick.value.lng]}
            icon={pinIcon}
            draggable
            zIndexOffset={1000}
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                pick.onChange({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) });
              },
            }}
          />
        )}
      </MapContainer>
      <button
        type="button"
        onClick={() => setVersion((v) => v + 1)}
        className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[13px] text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <LocateFixed className="h-3.5 w-3.5" /> Reset
      </button>
      {overlay}
    </div>
  );
}
