"use client";

import { useMemo, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useLiveJourney } from "@/hooks/use-live-journey";
import { calendarPace, livePace } from "@/lib/geo";
import { positioned, predictNext } from "@/lib/position";
import { formatWalkDate, istNoon, walkDay } from "@/lib/time";
import { LiveMap } from "./live-map";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const formatIso = (date: Date) => new Date(date.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

export function Dashboard() {
  const { journey, route } = useLiveJourney();
  const [notice, setNotice] = useState("");

  // Three separate questions, and conflating them is what made the tracker lie.
  //
  //   live     - has the walk been announced as begun? Wording only.
  //   fix      - is there a real position from the phone, or the placeholder?
  //   tracking - is that position near enough the route for "next stop" to mean
  //              anything? Standing 200 km away in Bihar, it does not, and the
  //              old code answered "Nagercoil, 22 km" rather than admitting it.
  //
  // Progress follows the position along the route, not the raw distance walked.
  // On a detour those differ, and the raw figure would claim towns had been
  // passed that are still ahead.
  const live = journey.mode === "live";
  const fix = positioned(journey);
  // Worked out from the position every time, not from the stored progress
  // figure, which is only written when GPS is processed and goes stale between.
  const ahead = useMemo(() => predictNext(route.stops, journey), [route, journey]);
  const along = ahead?.alongKm ?? 0;
  const next = ahead?.next ?? null;

  /**
   * Days left, which is the number that actually means something day to day.
   * Before the start it counts down to the first step; once walking it is the
   * distance still to go at the pace being walked. Both move on their own,
   * because both come from today's date.
   */
  const daysLeft = useMemo(() => {
    if (!live) {
      const start = istNoon(route.startDate).getTime();
      const today = istNoon(formatIso(new Date())).getTime();
      return Math.max(0, Math.round((start - today) / 86400000));
    }
    const day = Math.max(journey.day, walkDay(route.startDate));
    const pace = livePace(journey.distanceTotal, day, calendarPace(route.paceKmPerDay));
    return Math.max(0, Math.ceil((route.totalDistance - along) / Math.max(1, pace)));
  }, [live, route, journey, along]);

  async function react(type: "cheer" | "follow") {
    const key = `alw-${type}-${type === "cheer" ? new Date().toISOString().slice(0, 10) : "saved"}`;
    if (localStorage.getItem(key)) {
      setNotice(type === "cheer" ? "You already cheered today. Thank you!" : "A Long Walk is already saved on this phone.");
      return;
    }
    localStorage.setItem(key, "1");
    setNotice(type === "cheer" ? "Your cheer reached the road 👏" : "A Long Walk is saved on this phone.");
    fetch("/api/reactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }) }).catch(() => {});
  }

  async function share() {
    const data = { title: "A Long Walk", text: "Follow Navneet walking from Kanyakumari to Kashmir.", url: location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(location.href);
      setNotice("Journey link ready to share.");
    } catch {}
  }

  return (
    <>
      <section className="dashboard-hero">
        <div className="map-copy">
          <div className="status-line"><span><i />{journey.mode === "live" ? "LIVE WALK" : "PREPARATION MODE"}</span><small>{journey.updatedAt ? `Updated ${new Date(journey.updatedAt).toLocaleString("en-IN")}` : "GPS begins on day one"}</small></div>
          <div><p>KANYAKUMARI → KASHMIR</p><h1>{journey.currentPlace}</h1><span>{journey.mode === "live" ? `Day ${journey.day} · ${number.format(journey.distanceToday)} km today` : "Preparing to walk India from south to north."}</span></div>
        </div>
        <LiveMap stops={route.stops} journey={journey} compact />
      </section>

      <section className="metric-grid" aria-label="Walk metrics">
        <article><small>DAY</small><strong>{journey.mode === "live" ? journey.day : "—"}</strong><span>{journey.mode === "live" ? "Expedition day" : "Before start"}</span></article>
        <article><small>TOTAL DISTANCE</small><strong>{number.format(journey.distanceTotal)}<em> km</em></strong><span>of {number.format(route.totalDistance)} km</span></article>
        <article>
          <small>{live ? "DAYS REMAINING" : "DAYS TO THE FIRST STEP"}</small>
          <strong>{daysLeft}</strong>
          <span>{live ? `to Srinagar at ${livePace(journey.distanceTotal, Math.max(journey.day, walkDay(route.startDate)), calendarPace(route.paceKmPerDay)).toFixed(1)} km/day` : `Kanyakumari · ${formatWalkDate(istNoon(route.startDate))}`}</span>
        </article>
        <article>
          <small>{ahead ? "NEXT STOP" : "ROUTE STARTS AT"}</small>
          <strong className="place-metric">{ahead ? next?.name : route.stops[0]?.name}</strong>
          <span>{ahead
            ? `${number.format(ahead.toNextKm)} km up the route${ahead.strayed ? ` · ${number.format(ahead.offRouteKm)} km off the line` : ""}`
            : "Waiting for the first position"}</span>
        </article>
      </section>

      {/* Steps, weather and altitude have gone: nothing fed them, so they read
          "Awaiting data" and "—" beside figures that were real. */}
      <section className="signal-grid">
        <article><small>WHERE</small><strong>{fix ? `Navneet is in ${journey.currentPlace}` : "Position not sent yet"}</strong></article>
        <article><small>STATUS</small><strong>{journey.status}</strong></article>
        <article><small>SIGNAL</small><strong>{journey.connectivity}</strong></article>
        <article><small>LAST SLEPT</small><strong>{journey.lastSleep}</strong></article>
      </section>

      <section className="field-grid shell">
        <article className="dispatch-card"><div className="section-tag">01 · LATEST FIELD SIGNAL</div><div><small>{journey.currentPlace.toUpperCase()}</small><h2>{journey.latestTitle}</h2><p>{journey.latestText}</p><a href={journey.latestUrl}>Read the dispatch →</a></div></article>
        <aside className="field-card"><div className="section-tag">02 · TODAY IN THE FIELD</div><dl><div><dt>Walking</dt><dd>{journey.walkingMinutes} min</dd></div><div><dt>Phone</dt><dd>{journey.battery == null ? "—" : `${journey.battery}%`}</dd></div><div><dt>Partner</dt><dd>{journey.sponsorName}</dd></div></dl></aside>
      </section>

      <section className="response-panel shell">
        <div><div className="section-tag">03 · SEND A SIGNAL</div><h2>Respond to the road.</h2><p>Every button works, and weak-signal actions stay acknowledged on your phone.</p></div>
        <div className="response-buttons">
          <button onClick={() => react("cheer")}><Check size={18} /> Cheer today</button>
          <button onClick={() => react("follow")}>＋ Follow A Long Walk</button>
          <button onClick={share}><Share2 size={18} /> Share journey</button>
          <a href="/games">◆ Play road games</a>
        </div>
        {notice && <p className="action-notice" role="status">{notice}</p>}
      </section>
    </>
  );
}
