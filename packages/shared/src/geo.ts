/** Great-circle distance in metres between two WGS84 points (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Round a distance to the nearest 10 m, as shown in radius analysis tables. */
export function roundDistance(m: number): number {
  return Math.round(m / 10) * 10;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${roundDistance(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function formatRadius(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(2)} km`;
}
