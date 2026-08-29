import { distanceKm } from "@/lib/geo";
import type { RouteStop } from "@/lib/types";

/**
 * Working out where a GPS point sits *on the route*, rather than just where it
 * sits on the earth.
 *
 * Adding up the gaps between GPS fixes answers "how far has he walked", but it
 * cannot answer "which town is next" or "has he left the planned line". For
 * that the point has to be projected onto the route itself: the nearest place
 * along the drawn line, how far along that is, and how far off it he strayed.
 */

export type Projection = {
  /** Distance from Kanyakumari along the planned route, in km. */
  alongKm: number;
  /** How far the point is from the route line itself, in km. */
  offRouteKm: number;
  /** Index of the stop the matched segment starts at. */
  segmentIndex: number;
};

/**
 * Closest point on the segment A-B to point P, as a fraction 0..1 along A-B.
 *
 * Latitude and longitude are treated as a flat grid with longitude squashed by
 * cos(latitude). Over a segment of a few hundred kilometres that is accurate to
 * well within the error of the GPS fix itself, and it avoids great-circle
 * trigonometry in a hot path.
 */
function fractionAlongSegment(
  aLat: number, aLon: number,
  bLat: number, bLon: number,
  pLat: number, pLon: number
) {
  const scale = Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  const abLat = bLat - aLat;
  const abLon = (bLon - aLon) * scale;
  const apLat = pLat - aLat;
  const apLon = (pLon - aLon) * scale;

  const lengthSquared = abLat * abLat + abLon * abLon;
  if (lengthSquared === 0) return 0; // two stops at the same coordinates
  const t = (apLat * abLat + apLon * abLon) / lengthSquared;
  return Math.max(0, Math.min(1, t));
}

/** Project a GPS point onto the route. Returns null for a route too short to have a line. */
export function projectOntoRoute(stops: RouteStop[], lat: number, lon: number): Projection | null {
  if (!Array.isArray(stops) || stops.length < 2) return null;

  let best: Projection | null = null;

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    const t = fractionAlongSegment(a.lat, a.lon, b.lat, b.lon, lat, lon);

    // The actual point on the segment, then the real distance to it.
    const nearLat = a.lat + (b.lat - a.lat) * t;
    const nearLon = a.lon + (b.lon - a.lon) * t;
    const offRouteKm = distanceKm(lat, lon, nearLat, nearLon);

    if (!best || offRouteKm < best.offRouteKm) {
      best = {
        alongKm: Math.round((a.km + (b.km - a.km) * t) * 10) / 10,
        offRouteKm: Math.round(offRouteKm * 10) / 10,
        segmentIndex: i,
      };
    }
  }

  return best;
}

/** The first stop still ahead of a given position along the route. */
export function nextStopAfter(stops: RouteStop[], alongKm: number) {
  return stops.find(stop => stop.km > alongKm) ?? null;
}

/** Stops that have been passed but are not yet marked as reached. */
export function newlyReached(stops: RouteStop[], previousAlongKm: number, alongKm: number) {
  if (alongKm <= previousAlongKm) return [];
  return stops.filter(stop => stop.km > previousAlongKm && stop.km <= alongKm);
}

/**
 * Where a newly discovered place should sit in the route.
 *
 * Its distance is where it actually falls along the line, nudged to stay
 * strictly between its neighbours so the route never ends up with two stops
 * claiming the same kilometre.
 */
export function insertionKm(stops: RouteStop[], alongKm: number) {
  const before = [...stops].reverse().find(stop => stop.km < alongKm);
  const after = stops.find(stop => stop.km > alongKm);
  const low = before ? before.km + 1 : 0;
  const high = after ? after.km - 1 : alongKm;
  if (high < low) return null; // no room between two adjacent stops
  return Math.round(Math.max(low, Math.min(high, alongKm)));
}

/** True when a place is effectively one of the stops already on the route. */
export function alreadyOnRoute(stops: RouteStop[], name: string, lat: number, lon: number) {
  const cleanName = name.trim().toLowerCase();
  return stops.some(stop =>
    stop.name.trim().toLowerCase() === cleanName || distanceKm(stop.lat, stop.lon, lat, lon) < 8
  );
}
