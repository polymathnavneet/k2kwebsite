"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { lastHeard, positioned } from "@/lib/position";


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
 * It says two things and no more: the place, and how long ago the phone said
 * so. It used to say "GPS watching for movement", which told a reader nothing
 * they could act on and hid the one fact they wanted - whether this was minutes
 * old or days.
 *
 * Reporting a position all day is what empties a phone battery, so the tracker
 * speaks rarely and the last position can honestly be hours old. Saying exactly
 * how old - down to the second when it is seconds - is the difference between
 * tracking a man and guessing on his behalf.
 */
export function LivePin() {
  const { journey } = useLiveJourney();
  const fix = positioned(journey);

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
          {!fix || !heard ? "no GPS yet" : `Updated ${heard.phrase}`}
        </span>
      </span>
    </Link>
  );
}
