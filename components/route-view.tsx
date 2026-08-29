"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import { dayOfWalk, livePace } from "@/lib/geo";
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
    const live = journey.mode === "live";
    // Count the day from the calendar rather than a typed-in number, so the
    // pace is right even when a field update gets missed.
    const day = live ? Math.max(journey.day, dayOfWalk(route.startDate)) : 0;
    const pace = live ? livePace(journey.distanceTotal, day, route.paceKmPerDay) : route.paceKmPerDay;
    const base = live ? new Date() : new Date(`${route.startDate}T12:00:00`);
    const stops = route.stops.map(stop => ({
      ...stop,
      reached: live && stop.km <= journey.distanceTotal,
      eta: new Date(base.getTime() + Math.max(0, stop.km - (live ? journey.distanceTotal : 0)) / pace * 86400000),
    }));
    return {
      live,
      day,
      pace,
      stops,
      walked: live ? journey.distanceTotal : 0,
      next: stops.find(stop => !stop.reached) ?? stops.at(-1),
      finish: stops.at(-1)?.eta,
    };
  }, [route, journey]);

  return <>
    <section className="route-live-grid shell">
      <RouteMap stops={route.stops} journey={journey} />
      <div className="route-summary">
        <article><small>{estimate.live ? "WALKED" : "WORKING DISTANCE"}</small><strong>{estimate.live ? `${estimate.walked.toLocaleString("en-IN")} / ${route.totalDistance.toLocaleString("en-IN")} km` : `${route.totalDistance.toLocaleString("en-IN")} km`}</strong></article>
        <article><small>{estimate.live ? "LIVE PACE" : "PLANNED PACE"}</small><strong>{estimate.pace.toFixed(1)} km/day</strong></article>
        <article><small>NEXT STOP</small><strong>{estimate.next?.name}</strong></article>
        <article><small>ESTIMATED FINISH</small><strong>{estimate.finish ? date(estimate.finish) : "Calculating"}</strong></article>
      </div>
    </section>
    <section className="dynamic-route shell">
      <div className="route-note"><div className="section-tag">HOW DATES WORK</div><p>Before departure, dates count forward from the start date at the planned pace. Once the walk is live they come from the distance the GPS has actually recorded and the pace actually being walked, so walking faster pulls every date earlier and resting pushes them back. Change the route once in the admin sheet and every estimate recalculates.</p></div>
      <div className="stop-list">{estimate.stops.map((stop, index) => <article className={stop.reached ? "reached" : ""} key={`${stop.name}-${index}`}>
        <div><b>{String(index + 1).padStart(2, "0")}</b><span>{stop.reached ? "REACHED" : date(stop.eta)}</span></div>
        <div><h2>{stop.name}</h2><p>{stop.state} · {stop.km.toLocaleString("en-IN")} km</p><small>{stop.note}</small></div>
      </article>)}</div>
    </section>
  </>;
}
