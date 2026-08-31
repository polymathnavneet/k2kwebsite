"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { JournalEntry, PublicMessage } from "@/lib/types";

const snippet = (value: string, limit = 165) => value.length > limit ? `${value.slice(0, limit).trimEnd()}…` : value;

/** A live taste of both halves of the combined journal and question page. */
export function HomeConversationPreview() {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [question, setQuestion] = useState<PublicMessage | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/journal", { cache: "no-store" }).then(response => response.json()),
      fetch("/api/messages", { cache: "no-store" }).then(response => response.json()),
    ]).then(([journal, messages]) => {
      setEntry(journal.rows?.[0] ?? null);
      setQuestion(messages.rows?.find((row: PublicMessage) => row.type === "question") ?? null);
    }).catch(() => {});
  }, []);

  return <section className="conversation-preview shell">
    <header><div><div className="section-tag">JOURNAL + PUBLIC QUESTIONS</div><h2>The road is talking.</h2></div><Link href="/journal">Read and ask →</Link></header>
    <div className="conversation-preview-grid">
      <Link href="/journal#field-notes" className="conversation-preview-card">
        <small>LATEST FIELD NOTE</small>
        <h3>{entry?.question || "Before the first step"}</h3>
        <p>{snippet(entry?.body || "Training, saving, choosing equipment and preparing to cross India at walking speed.")}</p>
        <b>Read the journal →</b>
      </Link>
      <Link href={question ? `/journal#questions` : "/journal#ask"} className="conversation-preview-card accent">
        <small>{question ? `${question.name.toUpperCase()} ASKED` : "ASK NAVNEET"}</small>
        <h3>{question ? snippet(question.message, 90) : "What do you want to know?"}</h3>
        <p>{question?.reply ? `Navneet: ${snippet(question.reply)}` : "Ask about the walk, the route, the fear, the cost, or anything else. Navneet answers himself."}</p>
        <b>{question ? "See public answers" : "Ask a question"} →</b>
      </Link>
    </div>
  </section>;
}
