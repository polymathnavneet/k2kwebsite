"use client";

import type { GpsTrailPoint, Journey, RouteStop } from "@/lib/types";

const project = (lat: number, lon: number) => ({
  x: 38 + ((lon - 68) / 30) * 344,
  y: 676 - ((lat - 6) / 31) * 620,
});

const trailPoints = (trail: GpsTrailPoint[]) => trail
  .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
  .map(point => {
    const projected = project(point.lat, point.lon);
    return `${projected.x},${projected.y}`;
  })
  .join(" ");

/**
 * Offline/static fallback for the live map.
 *
 * It intentionally ignores the planned stop list. The public route is evidence:
 * only GPS fixes that actually counted as walked are allowed to make a line.
 */
export function RouteMap({ stops: _stops, journey, trail = [], compact = false, active = false }: { stops: RouteStop[]; journey: Journey; trail?: GpsTrailPoint[]; compact?: boolean; active?: boolean }) {
  const current = project(journey.lat, journey.lon);
  const actual = active ? trailPoints(trail) : "";
  const first = active && trail.length ? project(trail[0].lat, trail[0].lon) : null;

  return (
    <div className={compact ? "route-map compact" : "route-map"}>
      <svg viewBox="0 0 420 720" role="img" aria-label="GPS trail actually walked by Navneet">
        <path className="map-grid-lines" d="M35 100H390M35 200H390M35 300H390M35 400H390M35 500H390M35 600H390M90 45V675M180 45V675M270 45V675M360 45V675" />
        {actual && <polyline className="walked-line" points={actual} />}
        {first && <circle className="route-dot reached" cx={first.x} cy={first.y} r="5" />}
        <circle className="current-halo" cx={current.x} cy={current.y} r="14" />
        <circle className="current-dot" cx={current.x} cy={current.y} r="7" />
      </svg>
      <div className="map-legend"><span><i className="walked" />GPS trail</span><span><i className="current" />Current</span></div>
    </div>
  );
}
