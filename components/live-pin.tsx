"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { lastHeard, positioned } from "@/lib/position";
import { walkDay } from "@/lib/time";

// The day's distance is quoted to a tenth in the tile below it, and two
// different figures for the same thing on one screen reads as a broken site.
const exact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/**
 * Where Navneet is, on every page.
 *
 * The position lived on the homepage and the route page only, so anybody
 * reading the journal, the wall or the sponsorship pages had no idea where the
 * man they were reading about actually was. It follows him on every page
 * instead - now as a small badge pinned to the bottom right corner rather than
 * a bar across the top, so it sits out of the way of whatever is being read
 * and stays put while the page scrolls under it.
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
      <span className="live-pin-body">
        <span className="live-pin-where">
          {!fix ? "Waiting for the first position"
            : stale ? journey.currentPlace
            : journey.currentPlace}
        </span>
        <span className="live-pin-sub">
          {!fix ? "no GPS yet"
            : stale && heard ? `last fix ${heard.phrase}`
            : heard?.watching ? "GPS watching for movement"
            : live ? `${exact.format(journey.distanceToday)} km today`
            : journey.precisePlace ? journey.precisePlace.split(" · ")[0] : "position live"}
        </span>
      </span>
    </Link>
  );
}
