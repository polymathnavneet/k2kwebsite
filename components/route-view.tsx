"use client";

import { useMemo } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { calendarPace, dayOfWalk, livePace } from "@/lib/geo";
import { predictNext } from "@/lib/position";
import { formatWalkDate } from "@/lib/time";
import { LiveMap } from "./live-map";

const date = formatWalkDate;

export function RouteView() {
  const { journey, route } = useLiveJourney();

  const estimate = useMemo(() => {
    // Which town is next follows the position, not a flag somebody has to
    // remember to set in the admin panel, and not the stored progress figure
    // either. See predictNext in lib/position.ts.
    const ahead = predictNext(route.stops, journey);
    const live = Boolean(ahead);
    // Count the day from the calendar rather than a typed-in number, so the
    // pace is right even when a field update gets missed.
    const day = live ? Math.max(journey.day, dayOfWalk(route.startDate)) : 0;
    // Two different measures, deliberately. Pace comes from the distance the
    // legs actually covered; which town is next comes from how far along the
    // route that position sits. A detour makes them differ.
    // The planned figure is per walking day; projecting a finish needs the
    // calendar rate, which allows for rest days.
    const pace = live ? livePace(journey.distanceTotal, day, route.paceKmPerDay) : calendarPace(route.paceKmPerDay);
    const along = ahead?.alongKm ?? 0;
    const base = live ? new Date() : new Date(`${route.startDate}T12:00:00`);
    const stops = route.stops.map(stop => ({
      ...stop,
      reached: live && stop.km <= along,
      eta: new Date(base.getTime() + Math.max(0, stop.km - along) / pace * 86400000),
    }));
    return {
      live,
      day,
      pace,
      stops,
      walked: live ? journey.distanceTotal : 0,
      along,
      offRoute: ahead?.offRouteKm ?? 0,
      // Before the first step nothing is "next": the walk starts at the start.
      next: live ? (stops.find(stop => !stop.reached) ?? stops.at(-1)) : null,
      finish: stops.at(-1)?.eta,
    };
  }, [route, journey]);

  return <>
    <section className="route-live-grid shell">
      <LiveMap stops={route.stops} journey={journey} />
      <div className="route-summary">
        <article><small>{estimate.live ? "WALKED" : "WORKING DISTANCE"}</small><strong>{estimate.live ? `${estimate.walked.toLocaleString("en-IN")} / ${route.totalDistance.toLocaleString("en-IN")} km` : `${route.totalDistance.toLocaleString("en-IN")} km`}</strong></article>
        <article><small>{estimate.live ? "LIVE PACE" : "PLANNED PACE"}</small><strong>{estimate.pace.toFixed(1)} km/day</strong></article>
        <article><small>{estimate.live ? "NEXT STOP" : "STARTS AT"}</small><strong>{estimate.live ? estimate.next?.name : route.stops[0]?.name}</strong></article>
        <article><small>ESTIMATED FINISH</small><strong>{estimate.finish ? date(estimate.finish) : "Calculating"}</strong></article>
      </div>
    </section>
    <section className="dynamic-route shell">
      {estimate.live && estimate.offRoute > 12 && <p className="off-route-note">Navneet is currently about {Math.round(estimate.offRoute)} km off the drawn line. The route below is being corrected as he walks.</p>}
      <div className="route-note"><div className="section-tag">HOW DATES WORK</div><p>Before departure, dates count forward from the start date at the planned pace. Once the walk is live they come from the distance the GPS has actually recorded and the pace actually being walked, so walking faster pulls every date earlier and resting pushes them back. Change the route once in the admin sheet and every estimate recalculates.</p></div>
      <div className="stop-list">{estimate.stops.map((stop, index) => <article className={stop.reached ? "reached" : ""} key={`${stop.name}-${index}`}>
        <div><b>{String(index + 1).padStart(2, "0")}</b><span>{stop.reached ? "REACHED" : date(stop.eta)}</span></div>
        <div><h2>{stop.name}</h2><p>{stop.state} · {stop.km.toLocaleString("en-IN")} km</p><small>{stop.note}</small></div>
      </article>)}</div>
    </section>
  </>;
}
