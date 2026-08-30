"use client";

import { useEffect, useState } from "react";
import { formatWalkDate, istDayKey, istNoon } from "@/lib/time";
import timeline from "@/data/timeline.json";

type Step = { date: string; title: string; detail: string; final?: boolean };

/**
 * The run-up to the first step, counting itself down.
 *
 * Every date lives in data/timeline.json and nothing here is written by hand:
 * the component works out from today which steps are behind us, which one is
 * next, and how many days are left. Left alone it stays correct, and on the
 * morning of the 29th of November it will say so by itself.
 *
 * Days are counted from midday in India rather than from the reader's clock. A
 * phone in London would otherwise show a different number of days to the first
 * step than a phone in Bettiah, and only one of them can be right.
 */
export function Countdown() {
  // Rendered on the server too, so the first paint has to match: both start
  // from the same Indian date, and the clock only matters when it ticks over.
  const [today, setToday] = useState(() => istDayKey());
  // The bundled file is the first paint and the fallback with no signal; the
  // live copy replaces it, so an edit in the admin panel shows here without a
  // deploy.
  const [steps, setSteps] = useState<Step[]>(timeline.steps as Step[]);

  useEffect(() => {
    const tick = () => setToday(istDayKey());
    const timer = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);

    const load = () => fetch("/api/timeline", { cache: "no-store" })
      .then(response => response.json())
      .then(data => { if (Array.isArray(data.steps) && data.steps.length) setSteps(data.steps); })
      .catch(() => {});
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 120000);

    return () => {
      clearInterval(timer);
      clearTimeout(first);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const now = istNoon(today).getTime();
  const shown = steps.map(step => {
    const days = Math.round((istNoon(step.date).getTime() - now) / 86400000);
    return { ...step, days, done: days < 0, isToday: days === 0 };
  });
  const next = shown.find(step => !step.done);
  const walking = !next;

  return (
    <section className="countdown-strip">
      <div className="shell">
        <div className="section-tag warm">02 · BEFORE THE FIRST STEP</div>
        <h2>{walking
          ? <>The plan is<br />behind him now.</>
          : next?.days === 0
            ? <>Today: {next.title.toLowerCase()}</>
            : <>{next?.days} {next?.days === 1 ? "day" : "days"}<br />to {next?.title.toLowerCase()}.</>}</h2>
        <p>The proposal said 1 December. This is why it moved: a birthday, a resignation, a hometown, a three-day train and a promise to his grandmother all sit between the plan and the first step.</p>

        <ol className="countdown-list">
          {shown.map(step => (
            <li key={step.date} className={`${step.done ? "done" : ""} ${step === next ? "next" : ""} ${step.final ? "final" : ""}`.trim()}>
              <div className="countdown-when">
                <b>{formatWalkDate(istNoon(step.date))}</b>
                <span>{step.done
                  ? "Done"
                  : step.isToday
                    ? "Today"
                    : `in ${step.days} ${step.days === 1 ? "day" : "days"}`}</span>
              </div>
              <div className="countdown-what">
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
