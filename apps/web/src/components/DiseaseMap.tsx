import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { NAGA_CENTER, fmtDate, formatDistance } from '@livestock/shared';
import { cn } from '@/lib/utils';

/**
 * Where confirmed disease cases and monitoring zones are, for the public page and the owner app.
 * Cases are shown at their recorded point with the disease and barangay only: never the owner or
 * the farm. The owner app also shows the owner's own farms, so they can see how close they are.
 */
export interface MapCase {
  code: string;
  disease: string;
  species: string;
  barangay: string;
  lat: number | null;
  lng: number | null;
  reportedAt: string;
  mine?: boolean;
}
export interface MapZone {
  code: string;
  disease: string;
  barangay: string;
  lat: number;
  lng: number;
  radiusM: number;
  guidance?: string | null;
  since: string;
  affectsMe?: boolean;
}
export interface MapFarm {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
}

const caseIcon = L.divIcon({
  html: `<div style="width:26px;height:26px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 13px/1 Inter,sans-serif">!</div>`,
  className: 'leaflet-div-icon-clear',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
const farmIcon = L.divIcon({
  html: `<svg width="28" height="36" viewBox="0 0 30 40"><path d="M15 0C7 0 1 6 1 14c0 10 14 26 14 26s14-16 14-26C29 6 23 0 15 0z" fill="#166534" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>`,
  className: 'leaflet-div-icon-clear',
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

function Fit({ pts, fitKey }: { pts: L.LatLngBounds | null; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (pts && pts.isValid()) map.fitBounds(pts, { padding: [28, 28], maxZoom: 15, animate: false });
    else map.setView(NAGA_CENTER, 12, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function DiseaseMap({
  cases,
  zones,
  farms = [],
  className,
}: {
  cases: MapCase[];
  zones: MapZone[];
  farms?: MapFarm[];
  className?: string;
}) {
  const bounds = useMemo(() => {
    const b = L.latLngBounds([]);
    for (const z of zones) b.extend(L.latLng(z.lat, z.lng).toBounds(z.radiusM * 2));
    for (const c of cases) if (c.lat != null && c.lng != null) b.extend([c.lat, c.lng]);
    for (const f of farms) if (f.lat != null && f.lng != null) b.extend([f.lat, f.lng]);
    return b.isValid() ? b : null;
  }, [cases, zones, farms]);
  const fitKey = `${cases.length}-${zones.length}-${farms.length}`;
  return (
    <div className={cn('isolate overflow-hidden rounded-xl border border-slate-200', className)}>
      <MapContainer center={NAGA_CENTER} zoom={12} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Fit pts={bounds} fitKey={fitKey} />
        {zones.map((z) => (
          <Circle
            key={z.code}
            center={[z.lat, z.lng]}
            radius={z.radiusM}
            pathOptions={{
              color: '#b91c1c',
              weight: 2,
              fillColor: '#ef4444',
              fillOpacity: z.affectsMe ? 0.22 : 0.12,
              dashArray: '6 4',
            }}
          >
            <Popup>
              <div className="text-[13px]">
                <b>Monitoring Area: {z.disease}</b>
                <div>
                  Barangay {z.barangay} · {formatDistance(z.radiusM)} radius
                </div>
                <div>Since {fmtDate(z.since)}</div>
                {z.guidance && <p className="mt-1 whitespace-pre-line">{z.guidance}</p>}
              </div>
            </Popup>
          </Circle>
        ))}
        {cases
          .filter((c) => c.lat != null && c.lng != null)
          .map((c) => (
            <Marker key={c.code} position={[c.lat!, c.lng!]} icon={caseIcon}>
              <Popup>
                <div className="text-[13px]">
                  <b>{c.disease}</b>
                  <div>
                    Confirmed in {c.species} · Barangay {c.barangay}
                  </div>
                  <div>Reported {fmtDate(c.reportedAt)}</div>
                  {c.mine && <div className="mt-1 font-semibold">This is your farm's case.</div>}
                </div>
              </Popup>
            </Marker>
          ))}
        {farms
          .filter((f) => f.lat != null && f.lng != null)
          .map((f) => (
            <Marker key={`f${f.id}`} position={[f.lat!, f.lng!]} icon={farmIcon}>
              <Popup>
                <b className="text-[13px]">Your farm: {f.name}</b>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}

export default DiseaseMap;
