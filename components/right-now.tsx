"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { lastHeard, positioned, predictNext } from "@/lib/position";
import { walkDay } from "@/lib/time";

const km = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Where he is, right now, on the homepage.
 *
 * The position was on the page twice already - as the headline over the map and
 * as a line in the bar under the header - and in both places it is a label
 * rather than something you can watch. This is the thing a person actually
 * comes back to the site for: how far today, where that is, how far to the next
 * town, and how long ago any of it was true.
 *
 * It replaces a panel headed "today in the field" which listed walking minutes,
 * battery and the partner's name. Nothing has fed walking minutes since the
 * numbers came off the admin form, so it read "0 min" every day of the walk.
 *
 * Everything here refreshes on the shared beat in useLiveJourney, and the
 * kilometres flash when they change, so it is visibly alive rather than
 * apparently frozen.
 */
export function RightNow() {
  const { journey, route, updatedAt } = useLiveJourney();
  const fix = positioned(journey);
  const ahead = predictNext(route.stops, journey);
  const live = journey.mode === "live" && walkDay(route.startDate) >= 1;
  const today = live ? journey.distanceToday : 0;

  // The clock is read in an effect, never during render: a render has to give
  // the same answer twice and Date.now() does not.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  const heard = now === null ? null : lastHeard(journey, now);

  // Flash the figure when it moves, so a reader watching the page sees the
  // walk happen rather than wondering whether anything is connected.
  //
  // The last value is held in a ref rather than in state: it is a thing to
  // remember between renders, not a thing to draw, and keeping it in state
  // meant it could never be brought up to date without either re-rendering for
  // nothing or leaving the comparison permanently stale.
  const [moved, setMoved] = useState(false);
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = today;
    if (before === null || before === today) return;
    setMoved(true);
    const clear = setTimeout(() => setMoved(false), 2000);
    return () => clearTimeout(clear);
  }, [today]);

  return (
    <aside className="right-now" aria-live="polite">
      <div className="right-now-head">
        <span className={`right-now-dot${heard && !heard.fresh ? " cold" : ""}`} aria-hidden="true" />
        <b>RIGHT NOW</b>
        <small>{heard ? `Heard ${heard.phrase}` : "No position yet"}</small>
      </div>

      <div className="right-now-place">
        <small>{fix ? (heard && !heard.fresh ? "LAST SEEN IN" : "NAVNEET IS IN") : "STARTING FROM"}</small>
        <strong>{fix ? journey.currentPlace : route.stops[0]?.name}</strong>
        {fix && journey.precisePlace && <span className="right-now-fine">{journey.precisePlace}</span>}
      </div>

      {/* A town name cannot answer "where is he" for a city of three million.
          These two lines can: the position itself, and how far out the phone
          says it might be. Tapping opens the exact point on a map. */}
      {fix && <a
        className="right-now-exact"
        href={`https://www.openstreetmap.org/?mlat=${journey.lat}&mlon=${journey.lon}#map=17/${journey.lat}/${journey.lon}`}
        target="_blank"
        rel="noreferrer"
      >
        <b>{journey.lat.toFixed(5)}, {journey.lon.toFixed(5)}</b>
        <span>{journey.accuracyM == null
          ? "Exact point · open the map"
          : `Accurate to about ${Math.round(journey.accuracyM)} m · open the map`}</span>
      </a>}

      <dl className="right-now-figures">
        <div>
          <dt>Walked today</dt>
          <dd className={moved ? "moved" : ""}>{live ? `${km.format(today)} km` : "—"}</dd>
        </div>
        <div>
          <dt>Walked in all</dt>
          <dd>{whole.format(live ? journey.distanceTotal : 0)} km</dd>
        </div>
        <div>
          <dt>Next town</dt>
          <dd>{ahead ? ahead.next.name : route.stops[0]?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Still to walk</dt>
          <dd>{ahead ? `${whole.format(ahead.toNextKm)} km` : "—"}</dd>
        </div>
      </dl>

      <p className="right-now-foot">
        {live
          ? "Straight from the tracker on his phone. This page keeps itself up to date — no need to reload."
          : `Counting starts on ${route.startDate.split("-").reverse().join("/")}. The position is already live.`}
        {updatedAt > 0 && <span className="right-now-beat" aria-hidden="true" />}
      </p>

      <Link className="right-now-link" href="/route">See the whole route →</Link>
    </aside>
  );
}
