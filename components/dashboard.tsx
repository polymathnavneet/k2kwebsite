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
  const { journey, route } = useLiveJourney();

  // Two separate questions, and conflating them is what made the tracker lie.
  //
  //   live   - has the walk been announced as begun? Wording and figures both.
  //   ahead  - is there a real position, and is it near enough the route for
  //            "next stop" to mean anything? Standing 200 km away in Bihar it
  //            does not, and the old code answered "Nagercoil, 22 km" rather
  //            than admitting it.
  //
  // Progress follows the position along the route, not the raw distance walked.
  // On a detour those differ, and the raw figure would claim towns had been
  // passed that are still ahead.
  // Whether the walk has begun is a question about the calendar, not about a
  // switch in the admin panel. Before the start date the figures read zero
  // however much the tracker banked getting ready - it recorded a bus ride to
  // Raxaul as 28.5 km walked, and no reader should ever see that on a page
  // that promises the distance is real.
  const started = walkDay(route.startDate) >= 1;
  const live = journey.mode === "live" && started;
  const walked = started ? journey.distanceTotal : 0;
  const walkedToday = started ? journey.distanceToday : 0;
  // Worked out from the position every time, not from the stored progress
  // figure, which is only written when GPS is processed and goes stale between.
  // A preparation location is not progress on the expedition. Projecting a
  // phone in Lucknow onto December's route was why the page claimed Lucknow
  // was the next stop. Until day one, the only honest route destination is the
  // starting point: Kanyakumari.
  const ahead = useMemo(() => live ? predictNext(route.stops, journey) : null, [live, route, journey]);
  const along = ahead?.alongKm ?? 0;
  const next = ahead?.next ?? null;

  /**
   * Days left, which is the number that actually means something day to day.
   * Before the start it counts down to the first step; once walking it is the
   * distance still to go at the pace being walked. Both move on their own,
   * because both come from today's date.
   */
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
        <LiveMap stops={route.stops} journey={journey} compact active={live} />
      </section>

      <section className="metric-grid" aria-label="Walk metrics">
        <article><small>WALKED TODAY</small><strong>{number.format(walkedToday)}<em> km</em></strong><span>{live ? `Day ${journey.day} · counted from the tracker` : "Counting starts on the first step"}</span></article>
        <article><small>WALKED IN ALL</small><strong>{number.format(walked)}<em> km</em></strong><span>of {number.format(route.totalDistance)} km to Srinagar</span></article>
        <article>
          <small>{live ? "DAYS REMAINING" : "DAYS TO THE FIRST STEP"}</small>
          <strong>{daysLeft}</strong>
          <span>{live ? `to Srinagar at ${livePace(walked, Math.max(journey.day, walkDay(route.startDate)), calendarPace(route.paceKmPerDay)).toFixed(1)} km/day` : `Kanyakumari · ${formatWalkDate(istNoon(route.startDate))}`}</span>
        </article>
        <article>
          <small>{ahead ? "NEXT STOP" : "ROUTE STARTS AT"}</small>
          <strong className="place-metric">{ahead ? next?.name : route.stops[0]?.name}</strong>
          <span>{ahead
            ? `${number.format(ahead.toNextKm)} km up the route${ahead.strayed ? ` · ${number.format(ahead.offRouteKm)} km off the line` : ""}`
            : live
              ? "Waiting for a reliable GPS position"
              : started
                ? "GPS sets the next stop when the walk is live"
                : `First step · ${formatWalkDate(istNoon(route.startDate))}`}</span>
        </article>
      </section>

    </>
  );
}
