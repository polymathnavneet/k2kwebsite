"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LocateFixed, Share2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { Journey, WalkRoute } from "@/lib/types";
import { RouteMap } from "./route-map";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function Dashboard() {
  const [journey, setJourney] = useState<Journey>(defaultJourney);
  const [route, setRoute] = useState<WalkRoute>(defaultRoute);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [journeyResponse, routeResponse] = await Promise.all([fetch("/api/journey"), fetch("/api/route")]);
        if (journeyResponse.ok) setJourney(await journeyResponse.json());
        if (routeResponse.ok) setRoute(await routeResponse.json());
      } catch {}
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const progress = Math.min(100, (journey.distanceTotal / route.totalDistance) * 100);
  const next = useMemo(() => route.stops.find(stop => stop.km > journey.distanceTotal) ?? route.stops.at(-1), [route, journey.distanceTotal]);

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
        <RouteMap stops={route.stops} journey={journey} compact />
        <button className="locate-button" type="button" onClick={() => setNotice(`Current published point: ${journey.currentPlace}`)} aria-label="Show published location"><LocateFixed size={20} /></button>
      </section>

      <section className="metric-grid" aria-label="Walk metrics">
        <article><small>DAY</small><strong>{journey.mode === "live" ? journey.day : "—"}</strong><span>{journey.mode === "live" ? "Expedition day" : "Before start"}</span></article>
        <article><small>TOTAL DISTANCE</small><strong>{number.format(journey.distanceTotal)}<em> km</em></strong><span>of {number.format(route.totalDistance)} km</span></article>
        <article><small>PROGRESS</small><strong>{progress.toFixed(1)}%</strong><Progress value={progress} /></article>
        <article><small>NEXT STOP</small><strong className="place-metric">{next?.name ?? "The road"}</strong><span>{next ? `${number.format(next.km - journey.distanceTotal)} km ahead` : "Finish"}</span></article>
      </section>

      <section className="signal-grid">
        <article><small>STATUS</small><strong>{journey.status}</strong></article>
        <article><small>STEPS</small><strong>{number.format(journey.stepsToday)}</strong></article>
        <article><small>WEATHER</small><strong>{journey.temperature == null ? "Awaiting data" : `${journey.temperature}°C`}</strong></article>
        <article><small>ALTITUDE</small><strong>{journey.altitude == null ? "—" : `${number.format(journey.altitude)} m`}</strong></article>
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
