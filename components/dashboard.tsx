"use client";

import { useMemo } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { calendarPace, livePace } from "@/lib/geo";
import { predictNext } from "@/lib/position";
import { formatWalkDate, istNoon, walkDay } from "@/lib/time";
import { LiveMap } from "./live-map";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const formatIso = (date: Date) => new Date(date.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

export function Dashboard() {
  const { journey, route, trail } = useLiveJourney();

  const started = walkDay(route.startDate) >= 1;
  const live = journey.mode === "live" && started;
  const walked = started ? journey.distanceTotal : 0;
  const walkedToday = started ? journey.distanceToday : 0;
  // Future places are only a forecast. The line on the map is never made from
  // these stops; only the recorded GPS trail is allowed to become "the route".
  const ahead = useMemo(() => live ? predictNext(route.stops, journey) : null, [live, route, journey]);
  const along = ahead?.alongKm ?? 0;
  const next = ahead?.next ?? null;

  const daysLeft = useMemo(() => {
    if (!live) {
      const start = istNoon(route.startDate).getTime();
      const today = istNoon(formatIso(new Date())).getTime();
      return Math.max(0, Math.round((start - today) / 86400000));
    }
    const day = Math.max(journey.day, walkDay(route.startDate));
    const pace = livePace(walked, day, calendarPace(route.paceKmPerDay));
    return Math.max(0, Math.ceil((route.totalDistance - along) / Math.max(1, pace)));
  }, [live, route, journey, along, walked]);

  return (
    <>
      <section className="dashboard-hero">
        <div className="map-copy">
          <div className="status-line"><span><i />{live ? "LIVE WALK" : "PREPARATION MODE"}</span><small>{journey.updatedAt ? `Updated ${new Date(journey.updatedAt).toLocaleString("en-IN")}` : "GPS begins on day one"}</small></div>
          <div><p>KANYAKUMARI → KASHMIR</p><h1>{journey.currentPlace}</h1><span>{live ? `Day ${journey.day} · ${number.format(walkedToday)} km today` : "Preparing to walk India from south to north."}</span></div>
        </div>
        <LiveMap stops={route.stops} journey={journey} trail={trail} compact active={live} />
      </section>

      <section className="metric-grid" aria-label="Walk metrics">
        <article><small>WALKED TODAY</small><strong>{number.format(walkedToday)}<em> km</em></strong><span>{live ? `Day ${journey.day} · counted from the tracker` : "Counting starts on the first step"}</span></article>
        <article><small>WALKED IN ALL</small><strong>{number.format(walked)}<em> km</em></strong><span>{live ? "GPS-counted distance" : `working estimate ${number.format(route.totalDistance)} km to Srinagar`}</span></article>
        <article>
          <small>{live ? "DAYS REMAINING" : "DAYS TO THE FIRST STEP"}</small>
          <strong>{daysLeft}</strong>
          <span>{live ? `forecast at ${livePace(walked, Math.max(journey.day, walkDay(route.startDate)), calendarPace(route.paceKmPerDay)).toFixed(1)} km/day` : `Kanyakumari · ${formatWalkDate(istNoon(route.startDate))}`}</span>
        </article>
        <article>
          <small>{ahead ? "FORECAST NEXT" : "ROUTE STARTS AT"}</small>
          <strong className="place-metric">{ahead ? next?.name : route.stops[0]?.name}</strong>
          <span>{ahead
            ? `${number.format(ahead.toNextKm)} km estimate · not part of the route until walked`
            : live
              ? "Waiting for enough GPS evidence to forecast"
              : started
                ? "GPS sets the road when the walk is live"
                : `First step · ${formatWalkDate(istNoon(route.startDate))}`}</span>
        </article>
      </section>

    </>
  );
}
