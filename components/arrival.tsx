"use client";

import { useEffect, useState } from "react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { forecast, plannedCalendarRate, type WalkedDay } from "@/lib/forecast";
import { predictNext } from "@/lib/position";
import { formatWalkDate, istNoon, walkDay } from "@/lib/time";

const km = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/**
 * When he gets there, according to how he has actually been walking.
 *
 * The homepage carried a finishing date worked out from the pace he set
 * himself, months before he had walked any of it. That is the best answer
 * available until there is walking to measure, and no answer at all once there
 * is. From the first step these dates come from what he actually does.
 *
 * It does not grade him. He chose the pace and he chose the road, so the site
 * reports where that gets him and when, and leaves the verdict alone.
 *
 * It recalculates itself. Nothing here is set by hand, and nothing here is
 * stored: the rate comes from the recorded days every time the page loads, so a
 * good week moves both dates forward and a bad one moves them back without
 * anybody touching the site.
 *
 * Before there is enough walking to divide by, it says so rather than
 * extrapolating a date from three days and a following wind.
 */
export function Arrival() {
  const { journey, route } = useLiveJourney();
  const [days, setDays] = useState<WalkedDay[] | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/days?days=400", { cache: "no-store" })
      .then(response => response.json())
      .then(data => setDays((data.days ?? []).map((row: WalkedDay) => ({ day: row.day, km: row.km }))))
      .catch(() => setDays([]));
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 120000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  const live = journey.mode === "live" && walkDay(route.startDate) >= 1;
  const ahead = predictNext(route.stops, journey);
  const finishKm = Math.max(0, route.totalDistance - (ahead?.alongKm ?? 0));

  const result = forecast({
    days: days ?? [],
    toNextKm: ahead ? ahead.toNextKm : null,
    toFinishKm: finishKm,
    plannedKmPerDay: route.paceKmPerDay,
    startDate: route.startDate,
  });

  // Before there is a position to project from - and on the server's first
  // render, where the journey is still the stock row - the next town he reaches
  // is the *first* stop, not the last. Falling back to the end of the route put
  // "Srinagar" under a heading reading NEXT TOWN, directly above its own
  // subtitle saying the route begins at Kanyakumari.
  const nextName = ahead?.next.name ?? route.stops[0]?.name ?? "Kanyakumari";
  const pretty = (dayKey: string) => formatWalkDate(istNoon(dayKey));

  // Before the first step there is no performance to read, and saying "not
  // enough data" on a page nobody has walked a metre for would be daft. The
  // plan's own dates stand until the walk gives it something better.
  const planning = !live;

  return (
    <section className="arrival shell" aria-live="polite">
      <div className="arrival-head">
        <div>
          <div className="section-tag warm">WHEN HE GETS THERE</div>
          <h2>{planning ? <>His own pace,<br />his own dates.</> : <>Working it out<br />as he walks.</>}</h2>
          <p>
            {planning
              ? `Until there are real days to measure, these come from the pace he set himself: ${km.format(route.paceKmPerDay)} km on each walking day with a rest day a week. From the first step they are worked out from what he actually does.`
              : result.enough
                ? `Measured from the last ${result.basisDays} days of walking. Every rest day, every short day and every long one is in this figure, because the road does not care why he was still.`
                : `Not enough walking behind him yet to predict from. The dates below come from his own planned pace, and they give way to measured ones once there are a few days to read.`}
          </p>
        </div>

        <dl className="arrival-rate">
          <div>
            <dt>{result.enough ? "His actual pace" : "Planned pace"}</dt>
            <dd>{km.format(result.enough ? result.kmPerDay : plannedCalendarRate(route.paceKmPerDay))}<em> km/day</em></dd>
            <span>{result.enough ? `measured over ${result.basisDays} days, rest days included` : "counting a rest day a week"}</span>
          </div>
        </dl>
      </div>

      <div className="arrival-cards">
        <article className="arrival-card">
          <small>NEXT TOWN</small>
          <strong>{nextName}</strong>
          {result.enough && result.toNext
            ? <>
                <b>{pretty(result.toNext.date)}</b>
                <span>{result.toNext.days === 0 ? "today, at this pace" : `in ${result.toNext.days} day${result.toNext.days === 1 ? "" : "s"} at this pace`}</span>
              </>
            : <>
                <b>{ahead ? `${km.format(ahead.toNextKm)} km away` : "—"}</b>
                <span>{planning ? "the route begins at Kanyakumari" : "a date once there is a pace to read"}</span>
              </>}
        </article>

        <article className="arrival-card is-finish">
          <small>SRINAGAR · THE LAST STEP</small>
          <strong>{km.format(finishKm)} km to go</strong>
          {result.enough && result.toFinish
            ? <>
                <b>{pretty(result.toFinish.date)}</b>
                <span>in {result.toFinish.days} days at this pace</span>
              </>
            : <>
                <b>{pretty(result.plannedFinish)}</b>
                <span>from his planned pace, not yet measured</span>
              </>}
        </article>
      </div>
    </section>
  );
}
