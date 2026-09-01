"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { calendarPace, dayOfWalk, livePace } from "@/lib/geo";
import { predictNext } from "@/lib/position";
import { formatWalkDate } from "@/lib/time";
import { LiveMap } from "./live-map";

const date = formatWalkDate;
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function RouteView() {
  const { journey, route, trail, places } = useLiveJourney({ trail: true });

  // The finishing date is worked out from the clock, and a render has to give
  // the same answer twice. Reading Date.now() inside the memo below made the
  // date change on any re-render that happened to recompute it; the reading is
  // taken in an effect instead and refreshed on its own beat.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  const estimate = useMemo(() => {
    const started = dayOfWalk(route.startDate) >= 1;
    const live = journey.mode === "live" && started;
    const day = live ? Math.max(journey.day, dayOfWalk(route.startDate)) : 0;
    const pace = live
      ? livePace(journey.distanceTotal, day, route.paceKmPerDay)
      : calendarPace(route.paceKmPerDay);

    // Future stops are prediction input only. They never draw the route and
    // never enter the list of places below until GPS has actually named them.
    const ahead = live ? predictNext(route.stops, journey) : null;
    const remaining = Math.max(0, route.totalDistance - journey.distanceTotal);
    const finish = live && now !== null ? new Date(now + remaining / Math.max(1, pace) * 86400000) : null;

    return { live, pace, ahead, finish };
  }, [route, journey, now]);

  const currentAlreadyNamed = places.some(place =>
    journey.currentPlace.toLowerCase().startsWith(place.name.toLowerCase())
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
        <p>The red line is assembled from GPS fixes that passed the walking checks. The place list is built from towns the tracker actually reported. A planned city, shortcut or spreadsheet cannot add itself.</p>
      </div>

      {estimate.live && estimate.ahead && <div className="route-forecast">
        <small>FORECAST, NOT ROUTE</small>
        <b>{estimate.ahead.next.name}</b>
        <span>about {number.format(estimate.ahead.toNextKm)} km away · finish estimate {estimate.finish ? date(estimate.finish) : "calculating"}</span>
      </div>}

      <div className="section-tag route-recorded-tag">PLACES THE GPS HAS ACTUALLY REACHED</div>
      <div className="stop-list actual-stop-list">
        {places.map((place, index) => <article className="reached" key={`${place.name}-${place.state}-${place.firstSeen}`}>
          <div><b>{String(index + 1).padStart(2, "0")}</b><span>{date(new Date(place.firstSeen))}</span></div>
          <div><h2>{place.name}</h2><p>{place.state}</p><small>First recorded at about {number.format(place.distanceKm)} km of GPS-counted walking.</small></div>
        </article>)}

        {estimate.live && !currentAlreadyNamed && <article className="reached current-road-place">
          <div><b>{String(places.length + 1).padStart(2, "0")}</b><span>NOW</span></div>
          <div><h2>{journey.currentPlace}</h2><p>{journey.precisePlace || "Latest GPS position"}</p><small>This is the newest recorded place. It stays here unless the GPS moves.</small></div>
        </article>}

        {!estimate.live && <div className="route-empty"><b>The route is intentionally empty.</b><p>Before the first walking fix there is no honest walked line to draw.</p></div>}
        {estimate.live && !places.length && currentAlreadyNamed && <div className="route-empty"><b>GPS trail recorded.</b><p>Named places will appear here as the tracker reaches them.</p></div>}
      </div>
    </section>
  </>;
}
