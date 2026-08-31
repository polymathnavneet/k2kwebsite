"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { lastHeard, positioned, predictNext } from "@/lib/position";
import { walkDay } from "@/lib/time";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
// The day's distance is quoted to a tenth in the tile below it, and two
// different figures for the same thing on one screen reads as a broken site.
const exact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/**
 * Where Navneet is, on every page.
 *
 * The position lived on the homepage and the route page only, so anybody
 * reading the journal, the wall or the sponsorship pages had no idea where the
 * man they were reading about actually was. It sits under the header on every
 * page instead, and follows him: the next town is projected from the live
 * position rather than read from a stored figure.
 *
 * Once the walk is live it also carries the day's distance, because that is the
 * one figure a reader checks more than once a day. Before the first step it
 * would read "0 km today" every day for months, so it stays away until there is
 * a walk to measure.
 *
 * The tense follows the age of the fix. Reporting a position all day is what
 * empties a phone battery, so the tracker speaks rarely and catches up at
 * night, and the last position can honestly be hours old. "Navneet is in
 * Lucknow" over a fix from breakfast is not tracking, it is guessing on his
 * behalf - so past a few hours it says "was", and says when.
 */
export function LivePin() {
  const { journey, route } = useLiveJourney();
  const fix = positioned(journey);
  const live = journey.mode === "live" && walkDay(route.startDate) >= 1;
  const ahead = live ? predictNext(route.stops, journey) : null;

  // Read from the clock in an effect rather than during render: rendering has
  // to give the same answer twice, and Date.now() does not. The first reading
  // is scheduled rather than taken inline, so mounting does not set state
  // during its own effect and start a second render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  const heard = now === null ? null : lastHeard(journey, now);
  const stale = Boolean(heard && !heard.fresh);

  return (
    <Link className={`live-pin${stale ? " is-stale" : ""}`} href="/route" aria-label="Where Navneet is now">
      <span className="live-pin-dot" aria-hidden="true" />
      <span className="live-pin-where">
        {!fix ? "Waiting for the first position"
          : stale ? `Last known: ${journey.currentPlace}`
          : `Navneet is in ${journey.currentPlace}`}
        {heard?.watching && <em> · GPS watching for movement</em>}
        {stale && heard && <em> · last fix {heard.phrase}</em>}
      </span>
      <span className="live-pin-next">
        {live && <b>{exact.format(journey.distanceToday)} km today</b>}
        {live && ahead
          ? `Next: ${ahead.next.name} · ${number.format(ahead.toNextKm)} km`
          : `Walk starts: ${route.stops[0]?.name ?? "Kanyakumari"}`}
      </span>
    </Link>
  );
}
