import type { GpsTrailPoint } from "@/lib/types";

/** Draw only connected, verified edges, keeping gaps in the evidence visible. */
export function trailSegments(points: GpsTrailPoint[]): GpsTrailPoint[][] {
  const segments: GpsTrailPoint[][] = [];
  let current: GpsTrailPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) { current = []; continue; }
    if (!current.length || current.at(-1)!.segment !== point.segment) {
      current = [];
      segments.push(current);
    }
    current.push(point);
  }
  return segments;
}
