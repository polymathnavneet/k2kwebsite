"use client";

import type { Journey, RouteStop } from "@/lib/types";

const project = (lat: number, lon: number) => ({
  x: 38 + ((lon - 68) / 30) * 344,
  y: 676 - ((lat - 6) / 31) * 620,
});

function points(stops: RouteStop[]) {
  return stops.map(stop => {
    const point = project(stop.lat, stop.lon);
    return `${point.x},${point.y}`;
  }).join(" ");
}

function walkedPoints(stops: RouteStop[], distance: number) {
  if (!stops.length || distance <= 0) return "";
  const output: { x: number; y: number }[] = [];
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index];
    if (stop.km <= distance) {
      output.push(project(stop.lat, stop.lon));
      continue;
    }
    const previous = stops[index - 1];
    if (previous) {
      const fraction = Math.max(0, Math.min(1, (distance - previous.km) / Math.max(1, stop.km - previous.km)));
      output.push(project(previous.lat + (stop.lat - previous.lat) * fraction, previous.lon + (stop.lon - previous.lon) * fraction));
    }
    break;
  }
  return output.map(point => `${point.x},${point.y}`).join(" ");
}

export function RouteMap({ stops, journey, compact = false }: { stops: RouteStop[]; journey: Journey; compact?: boolean }) {
  const current = project(journey.lat, journey.lon);
  return (
    <div className={compact ? "route-map compact" : "route-map"}>
      <svg viewBox="0 0 420 720" role="img" aria-label="Live route from Kanyakumari to Srinagar">
        <path className="map-grid-lines" d="M35 100H390M35 200H390M35 300H390M35 400H390M35 500H390M35 600H390M90 45V675M180 45V675M270 45V675M360 45V675" />
        <polyline className="planned-line" points={points(stops)} />
        <polyline className="walked-line" points={walkedPoints(stops, journey.distanceTotal)} />
        {stops.map((stop, index) => {
          const point = project(stop.lat, stop.lon);
          const showLabel = index === 0 || index === stops.length - 1 || [3, 4, 5, 7, 9, 10, 11].includes(index);
          return <g key={`${stop.name}-${index}`}>
            <circle className={stop.km <= journey.distanceTotal ? "route-dot reached" : "route-dot"} cx={point.x} cy={point.y} r={index === 0 || index === stops.length - 1 ? 6 : 3.5} />
            {showLabel && <text className="route-label" x={point.x + 9} y={point.y + 4}>{stop.name.toUpperCase()}</text>}
          </g>;
        })}
        <circle className="current-halo" cx={current.x} cy={current.y} r="14" />
        <circle className="current-dot" cx={current.x} cy={current.y} r="7" />
      </svg>
      <div className="map-legend"><span><i className="walked" />Walked</span><span><i className="planned" />Planned</span><span><i className="current" />Current</span></div>
    </div>
  );
}
