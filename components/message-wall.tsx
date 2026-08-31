"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReplyPromise } from "@/components/road-form";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/embed";
import type { PublicMessage } from "@/lib/types";

const filters = [
  ["all", "All"],
  ["question", "Questions"],
  ["walk", "Walking together"],
  ["road", "Road tips & help"],
];

const roadTypes = new Set(["road", "place", "story", "support"]);
const typeLabel = (type: string) => type === "question" ? "Question"
  : type === "walk" ? "Walk together"
  : roadTypes.has(type) ? "Road tip / help"
  : type;

function FollowUp({ row, onPublished }: { row: PublicMessage; onPublished: (patch: Partial<PublicMessage>) => void }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setSending(true);
    setStatus("Publishing…");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "follow-up", id: row.id, contact: values.contact, followUp: values.followUp }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not publish that follow-up.");
      onPublished({ followUp: result.followUp, followUpAt: result.followUpAt });
      setStatus("Published. Navneet will answer it here.");
      setOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not publish that follow-up.");
    } finally {
      setSending(false);
    }
  }

  if (row.followUp) return <div className="follow-up-thread">
    <small>ONE FOLLOW-UP</small>
    <p>{row.followUp}</p>
    {row.followUpReply
      ? <aside><small>NAVNEET REPLIED</small><p>{row.followUpReply}</p></aside>
      : <span>Navneet has this follow-up. His answer will appear here.</span>}
    <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Want to keep talking? DM @{INSTAGRAM_HANDLE} ↗</a>
  </div>;

  if (!row.reply || !row.canFollowUp) return null;

  return <div className="follow-up-action">
    {!open
      ? <button type="button" onClick={() => setOpen(true)}>Ask one follow-up →</button>
      : <form onSubmit={submit}>
          <b>One follow-up only</b>
          <p>Use the same private email or phone from your first question. It is checked, never published.</p>
          <label>PRIVATE CONTACT<Input required name="contact" placeholder="Same email or phone" /></label>
          <label>YOUR FOLLOW-UP<Textarea required name="followUp" minLength={8} /></label>
          <div><button type="submit" disabled={sending}>{sending ? "Publishing…" : "Publish follow-up"}</button><button type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>}
    {status && <p className="follow-up-status" role="status">{status}</p>}
  </div>;
}

export function MessageWall({ questionsOnly = false }: { questionsOnly?: boolean }) {
  const [rows, setRows] = useState<PublicMessage[]>([]);
  const [filter, setFilter] = useState(questionsOnly ? "question" : "all");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => fetch("/api/messages", { cache: "no-store" })
      .then(response => response.json())
      .then(data => { setRows(data.rows || []); setLoaded(true); })
      .catch(() => setLoaded(true));
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const available = questionsOnly ? rows.filter(row => row.type === "question") : rows;
  const visible = filter === "all" ? available
    : filter === "road" ? available.filter(row => roadTypes.has(row.type))
    : available.filter(row => row.type === filter);

  const updateRow = (id: string, patch: Partial<PublicMessage>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  return <>
    {!questionsOnly && <div className="shell"><ReplyPromise className="wall-promise" /></div>}
    {!questionsOnly && <nav className="wall-filters" aria-label="Filter messages">{filters.map(([value, label]) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{label}</button>)}</nav>}
    <section className="message-list shell" aria-live="polite">
      {!loaded ? <p className="empty-state">Loading the public road…</p> : visible.length ? visible.map(row => <article className="message-card" key={row.id}>
        <div><b>{typeLabel(row.type)}</b><span>{new Date(row.createdAt).toLocaleDateString("en-IN")}</span><span>{row.place || "Somewhere in India"}</span></div>
        <div>
          <h2>{row.name}</h2>
          <p>{row.message}</p>
          {row.reply && <aside><small>NAVNEET REPLIED</small><p>{row.reply}</p></aside>}
          {row.type === "question" && <FollowUp row={row} onPublished={patch => updateRow(row.id, patch)} />}
        </div>
      </article>) : <div className="empty-state"><h2>{questionsOnly ? "No public questions yet." : "No public messages here yet."}</h2><Link href={questionsOnly ? "/journal#ask" : "/ahead"}>{questionsOnly ? "Ask the first one" : "Leave the first one"} →</Link></div>}
    </section>
    {questionsOnly && <section className="ig-conversation shell"><b>Want a longer conversation?</b><p>The public page allows one follow-up so it stays readable. For a real back-and-forth, message Navneet on Instagram.</p><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">DM @{INSTAGRAM_HANDLE} ↗</a></section>}
  </>;
}
