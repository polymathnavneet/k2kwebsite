"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { Journey, WalkRoute } from "@/lib/types";
import { RouteMap } from "./route-map";

const date = (value: Date) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(value);

export function RouteView() {
  const [route, setRoute] = useState<WalkRoute>(defaultRoute);
  const [journey, setJourney] = useState<Journey>(defaultJourney);

  useEffect(() => {
    Promise.all([fetch("/api/route"), fetch("/api/journey")]).then(async ([routeResponse, journeyResponse]) => {
      if (routeResponse.ok) setRoute(await routeResponse.json());
      if (journeyResponse.ok) setJourney(await journeyResponse.json());
    }).catch(() => {});
  }, []);

  const estimate = useMemo(() => {
    const actualPace = journey.mode === "live" && journey.day > 2 ? journey.distanceTotal / journey.day : route.paceKmPerDay;
    const pace = Math.max(8, Math.min(50, actualPace || route.paceKmPerDay));
    const base = journey.mode === "live" ? new Date() : new Date(`${route.startDate}T12:00:00`);
    const stops = route.stops.map(stop => ({
      ...stop,
      reached: stop.km <= journey.distanceTotal,
      eta: new Date(base.getTime() + Math.max(0, stop.km - journey.distanceTotal) / pace * 86400000),
    }));
    return { pace, stops, next: stops.find(stop => !stop.reached) ?? stops.at(-1), finish: stops.at(-1)?.eta };
  }, [route, journey]);

  return <>
    <section className="route-live-grid shell">
      <RouteMap stops={route.stops} journey={journey} />
      <div className="route-summary">
        <article><small>WORKING DISTANCE</small><strong>{route.totalDistance.toLocaleString("en-IN")} km</strong></article>
        <article><small>LIVE PACE</small><strong>{estimate.pace.toFixed(1)} km/day</strong></article>
        <article><small>NEXT STOP</small><strong>{estimate.next?.name}</strong></article>
        <article><small>ESTIMATED FINISH</small><strong>{estimate.finish ? date(estimate.finish) : "Calculating"}</strong></article>
      </div>
    </section>
    <section className="dynamic-route shell">
      <div className="route-note"><div className="section-tag">HOW DATES WORK</div><p>Before departure, dates count from the current start date. During the walk, they count from the latest distance and actual average pace. Change the route once in the admin sheet and every estimate recalculates.</p></div>
      <div className="stop-list">{estimate.stops.map((stop, index) => <article className={stop.reached ? "reached" : ""} key={`${stop.name}-${index}`}>
        <div><b>{String(index + 1).padStart(2, "0")}</b><span>{stop.reached ? "REACHED" : date(stop.eta)}</span></div>
        <div><h2>{stop.name}</h2><p>{stop.state} · {stop.km.toLocaleString("en-IN")} km</p><small>{stop.note}</small></div>
      </article>)}</div>
    </section>
  </>;
}
