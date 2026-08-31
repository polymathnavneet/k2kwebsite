"use client";

import { useEffect, useState } from "react";

type WalkDay = {
  day: string;
  km: number;
  fixes: number;
  dayOfWalk: number;
  firstAt: string;
  lastAt: string;
  today: boolean;
};

type Summary = {
  daysWalked: number;
  totalKm: number;
  averageKm: number;
  best: { day: string; km: number } | null;
};

const km = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const SHOW_DAYS = 14;

/**
 * The walk, day by day.
 *
 * The site could say how far he had walked today and how far in total, and
 * nothing in between. A hundred and eighty days would have collapsed into two
 * numbers, and the days that are the actual story - the thirty-one kilometre
 * day, the eighteen kilometre day when something went wrong - would have been
 * invisible on the page they happened on.
 *
 * Every bar is added up from the recorded fixes rather than typed in, so a day
 * cannot disagree with the total it belongs to.
 */
export function DayByDay() {
  const [days, setDays] = useState<WalkDay[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const load = () => fetch(`/api/days?days=${SHOW_DAYS}`, { cache: "no-store" })
      .then(response => response.json())
      .then(data => { setDays(data.days ?? []); setSummary(data.summary ?? null); })
      .catch(() => setDays([]));
    const first = setTimeout(load, 0);
    // Today's bar grows while he walks, on the same beat as the rest of the page.
    const timer = setInterval(load, 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  // Nothing walked yet is not a broken section, it is a walk that has not
  // started. Saying so is better than an empty frame or a row of zeroes.
  if (days !== null && days.length === 0) {
    return (
      <section className="day-by-day shell">
        <div className="section-tag warm">THE WALK, DAY BY DAY</div>
        <h2>Nothing walked yet.</h2>
        <p className="day-empty">Every day of the walk will appear here as it happens, measured from the tracker on his phone rather than typed in afterwards.</p>
      </section>
    );
  }

  const tallest = days?.reduce((top, entry) => Math.max(top, entry.km), 0) || 1;

  return (
    <section className="day-by-day shell">
      <div className="day-head">
        <div>
          <div className="section-tag warm">THE WALK, DAY BY DAY</div>
          <h2>Every day,<br />as it happened.</h2>
        </div>
        {summary && <dl className="day-summary">
          <div><dt>Days walked</dt><dd>{summary.daysWalked}</dd></div>
          <div><dt>Average day</dt><dd>{km.format(summary.averageKm)}<em> km</em></dd></div>
          {summary.best && <div><dt>Longest day</dt><dd>{km.format(summary.best.km)}<em> km</em></dd></div>}
        </dl>}
      </div>

      <ol className="day-bars" aria-label="Distance walked each day">
        {days === null
          ? Array.from({ length: SHOW_DAYS }, (_, index) => <li className="day-bar loading" key={index}><span className="track"><span className="bar" /></span></li>)
          : days.map(entry => (
            <li className={`day-bar${entry.today ? " is-today" : ""}`} key={entry.day}>
              <b>{km.format(entry.km)}</b>
              <span className="track"><span className="bar" style={{ height: `${Math.max(3, (entry.km / tallest) * 100)}%` }} /></span>
              <small>{new Date(`${entry.day}T06:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small>
              <em>{entry.today ? "today" : `day ${entry.dayOfWalk}`}</em>
            </li>
          ))}
      </ol>
      <p className="day-note">
        Measured from his phone, not typed in. A rest day simply has no bar — the average above counts only the days he walked.
      </p>
    </section>
  );
}
