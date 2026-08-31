"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReplyPromise } from "@/components/road-form";
import type { PublicMessage } from "@/lib/types";

const filters = [["all", "All"], ["question", "Questions"], ["walk", "Walking with him"], ["place", "Places"], ["story", "Stories"], ["support", "Support"]];

export function MessageWall() {
  const [rows, setRows] = useState<PublicMessage[]>([]);
  const [filter, setFilter] = useState("all");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => fetch("/api/messages", { cache: "no-store" }).then(response => response.json()).then(data => { setRows(data.rows || []); setLoaded(true); }).catch(() => setLoaded(true));
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const visible = filter === "all" ? rows : rows.filter(row => row.type === filter);
  return <>
    {/* Said here as well as on the forms, because this is the page where
        somebody waiting on an answer comes to check whether they have been
        forgotten. They have not; he is walking. */}
    <div className="shell"><ReplyPromise className="wall-promise" /></div>
    <nav className="wall-filters" aria-label="Filter messages">{filters.map(([value, label]) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{label}</button>)}</nav>
    <section className="message-list shell" aria-live="polite">
      {!loaded ? <p className="empty-state">Loading the public road…</p> : visible.length ? visible.map(row => <article className="message-card" key={row.id}>
        <div><b>{row.type}</b><span>{new Date(row.createdAt).toLocaleDateString("en-IN")}</span><span>{row.place || "Somewhere in India"}</span></div>
        <div><h2>{row.name}</h2><p>{row.message}</p>{row.reply && <aside><small>NAVNEET REPLIED</small><p>{row.reply}</p></aside>}</div>
      </article>) : <div className="empty-state"><h2>No public messages here yet.</h2><Link href="/ahead">Leave the first one →</Link></div>}
    </section>
  </>;
}
