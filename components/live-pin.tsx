"use client";

import Link from "next/link";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { positioned, predictNext } from "@/lib/position";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Where Navneet is, on every page.
 *
 * The position lived on the homepage and the route page only, so anybody
 * reading the journal, the wall or the sponsorship pages had no idea where the
 * man they were reading about actually was. It sits under the header on every
 * page instead, and follows him: the next town is projected from the live
 * position rather than read from a stored figure.
 */
export function LivePin() {
  const { journey, route } = useLiveJourney();
  const fix = positioned(journey);
  const ahead = predictNext(route.stops, journey);

  return (
    <Link className="live-pin" href="/route" aria-label="Where Navneet is now">
      <span className="live-pin-dot" aria-hidden="true" />
      <span className="live-pin-where">
        {fix ? `Navneet is in ${journey.currentPlace}` : "Waiting for the first position"}
      </span>
      {ahead && (
        <span className="live-pin-next">
          Next: {ahead.next.name} · {number.format(ahead.toNextKm)} km
        </span>
      )}
    </Link>
  );
}
