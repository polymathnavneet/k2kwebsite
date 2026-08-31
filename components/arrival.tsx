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
 * The homepage already carried a finishing date and it was the plan's: 4,270
 * kilometres at the twenty-five a day he wrote down in August, before he had
 * walked a step of it. That is a hope with a date attached. Once there are two
 * weeks of real days behind him there is a truthful answer, and it is the only
 * one worth printing.
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
          <h2>{planning ? <>The plan says<br />these dates.</> : <>Working it out<br />as he walks.</>}</h2>
          <p>
            {planning
              ? `Until there are real days to measure, these are the dates the plan promises: ${km.format(route.paceKmPerDay)} km on each walking day with a rest day a week. From the first step they are recalculated from what he actually does.`
              : result.enough
                ? `Not the plan — the last ${result.basisDays} days of it. Every rest day, every short day and every long one is in this figure, because the road does not care why he was still.`
                : `Not enough walking behind him yet to predict from. The dates below are still the plan's, and they will be replaced by real ones once there are a few days to measure.`}
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
                <span>the plan&apos;s date, not a prediction</span>
              </>}
        </article>
      </div>

      {result.enough && result.daysVsPlan !== null && (
        <p className={`arrival-verdict${result.daysVsPlan > 0 ? " behind" : result.daysVsPlan < 0 ? " ahead" : ""}`}>
          {result.daysVsPlan === 0
            ? <>Exactly on the plan. Srinagar on <b>{pretty(result.toFinish!.date)}</b>, the day he said it would be.</>
            : result.daysVsPlan < 0
              ? <><b>{Math.abs(result.daysVsPlan)} days ahead</b> of the plan he set out with — the plan said {pretty(result.plannedFinish)}.</>
              : <><b>{result.daysVsPlan} days behind</b> the plan he set out with, which said {pretty(result.plannedFinish)}. Nothing is being hidden: this is what the walking says.</>}
        </p>
      )}
    </section>
  );
}
