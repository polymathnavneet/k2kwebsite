"use client";

import { useMemo } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { calendarPace, dayOfWalk, distanceKm, livePace } from "@/lib/geo";
import { predictNext } from "@/lib/position";
import { formatWalkDate } from "@/lib/time";
import { LiveMap } from "./live-map";

const date = formatWalkDate;
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const VISIT_RADIUS_KM = 12;

export function RouteView() {
  const { journey, route, trail } = useLiveJourney({ trail: true });

  const estimate = useMemo(() => {
    const started = dayOfWalk(route.startDate) >= 1;
    const live = journey.mode === "live" && started;
    const day = live ? Math.max(journey.day, dayOfWalk(route.startDate)) : 0;
    const pace = live
      ? livePace(journey.distanceTotal, day, route.paceKmPerDay)
      : calendarPace(route.paceKmPerDay);

    // Forecasts are allowed to look ahead, but they never become the public
    // route. That privilege belongs to the GPS points below.
    const ahead = live ? predictNext(route.stops, journey) : null;
    const remaining = Math.max(0, route.totalDistance - journey.distanceTotal);
    const finish = live ? new Date(Date.now() + remaining / Math.max(1, pace) * 86400000) : null;

    // A named place counts as visited only if the GPS trail physically passed
    // close to its coordinates. Its planned kilometre number is irrelevant.
    const visited = live ? route.stops.flatMap(stop => {
      const hit = trail.find(point => distanceKm(point.lat, point.lon, stop.lat, stop.lon) <= VISIT_RADIUS_KM);
      return hit ? [{ stop, recordedAt: hit.recordedAt }] : [];
    }).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)) : [];

    return { live, day, pace, ahead, finish, visited };
  }, [route, journey, trail]);

  const currentAlreadyNamed = estimate.visited.some(item =>
    journey.currentPlace.toLowerCase().includes(item.stop.name.toLowerCase())
  );

  return <>
    <section className="route-live-grid shell">
      <LiveMap stops={route.stops} journey={journey} trail={trail} active={estimate.live} />
      <div className="route-summary">
        <article><small>GPS-COUNTED WALK</small><strong>{estimate.live ? `${number.format(journey.distanceTotal)} km` : "Starts on day one"}</strong></article>
        <article><small>RECORDED TRAIL</small><strong>{estimate.live ? `${trail.length.toLocaleString("en-IN")} map points` : "No walk line yet"}</strong></article>
        <article><small>CURRENT PLACE</small><strong>{journey.currentPlace}</strong></article>
        <article><small>FORECAST ONLY</small><strong>{estimate.ahead?.next?.name ?? (estimate.live ? "Learning the road" : route.stops[0]?.name)}</strong></article>
      </div>
    </section>

    <section className="dynamic-route shell">
      <div className="route-note">
        <div className="section-tag">ACTUAL ROAD ONLY</div>
        <p>The red line is assembled from GPS fixes that passed the walking checks. A planned city, a shortcut, or a road in a spreadsheet cannot add itself. If Navneet changes direction, the next GPS fixes change this route with him.</p>
      </div>

      {estimate.live && estimate.ahead && <div className="route-forecast">
        <small>FORECAST, NOT ROUTE</small>
        <b>{estimate.ahead.next.name}</b>
        <span>about {number.format(estimate.ahead.toNextKm)} km away · finish estimate {estimate.finish ? date(estimate.finish) : "calculating"}</span>
      </div>}

      <div className="section-tag route-recorded-tag">PLACES THE GPS HAS ACTUALLY REACHED</div>
      <div className="stop-list actual-stop-list">
        {estimate.visited.map((item, index) => <article className="reached" key={`${item.stop.name}-${item.recordedAt}`}>
          <div><b>{String(index + 1).padStart(2, "0")}</b><span>{date(new Date(item.recordedAt))}</span></div>
          <div><h2>{item.stop.name}</h2><p>{item.stop.state}</p><small>Recorded on the walked GPS trail.</small></div>
        </article>)}

        {estimate.live && !currentAlreadyNamed && <article className="reached current-road-place">
          <div><b>{String(estimate.visited.length + 1).padStart(2, "0")}</b><span>NOW</span></div>
          <div><h2>{journey.currentPlace}</h2><p>{journey.precisePlace || "Latest GPS position"}</p><small>This is the newest recorded place. It stays here unless the GPS moves.</small></div>
        </article>}

        {!estimate.live && <div className="route-empty"><b>The route is intentionally empty.</b><p>Before the first walking fix there is no honest walked line to draw.</p></div>}
        {estimate.live && !estimate.visited.length && currentAlreadyNamed && <div className="route-empty"><b>GPS trail recorded.</b><p>Named places will appear here as the trail reaches them.</p></div>}
      </div>
    </section>
  </>;
}
