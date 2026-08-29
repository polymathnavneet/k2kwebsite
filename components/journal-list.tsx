"use client";

import { useEffect, useState } from "react";
import type { JournalEntry } from "@/lib/types";

const shown = (day: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${day}T12:00:00`));

/** The field notes, newest first, written a tap at a time from the admin panel. */
export function JournalList() {
  const [rows, setRows] = useState<JournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/journal")
      .then(response => response.json())
      .then(data => { setRows(data.rows || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <section className="shell journal-list"><p className="empty-state">Loading…</p></section>;

  if (!rows.length) return <section className="shell journal-list">
    <article><b>PREPARATION · 2026</b><div>
      <h2>Before the first step</h2>
      <p>Training, saving, choosing equipment, and learning what it means to prepare for several months on foot. The daily notes begin here.</p>
    </div></article>
  </section>;

  return <section className="shell journal-list">
    {rows.map(entry => <article key={entry.id}>
      <b>{(entry.phase === "road" ? "ON THE ROAD" : "PREPARATION")} · {shown(entry.day)}</b>
      <div>
        <h2>{entry.question || "From the road"}</h2>
        <p>{entry.body}</p>
        {entry.place && <small style={{ opacity: .6 }}>{entry.place}</small>}
      </div>
    </article>)}
  </section>;
}
