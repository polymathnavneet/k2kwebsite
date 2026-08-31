"use client";

import Link from "next/link";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { positioned, predictNext } from "@/lib/position";
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
 */
export function LivePin() {
  const { journey, route } = useLiveJourney();
  const fix = positioned(journey);
  const ahead = predictNext(route.stops, journey);
  const live = journey.mode === "live" && walkDay(route.startDate) >= 1;

  return (
    <Link className="live-pin" href="/route" aria-label="Where Navneet is now">
      <span className="live-pin-dot" aria-hidden="true" />
      <span className="live-pin-where">
        {fix ? `Navneet is in ${journey.currentPlace}` : "Waiting for the first position"}
      </span>
      <span className="live-pin-next">
        {live && <b>{exact.format(journey.distanceToday)} km today</b>}
        {ahead && `Next: ${ahead.next.name} · ${number.format(ahead.toNextKm)} km`}
      </span>
    </Link>
  );
}
