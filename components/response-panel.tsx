"use client";

import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Small, working ways to join the expedition without burying the conversation. */
export function ResponsePanel() {
  const [notice, setNotice] = useState("");
  const [cheers, setCheers] = useState<{ cheer: number; follow: number } | null>(null);

  useEffect(() => {
    fetch("/api/reactions")
      .then(response => response.json())
      .then(data => setCheers(data.today ?? null))
      .catch(() => {});
  }, []);

  async function react(type: "cheer" | "follow") {
    const key = `alw-${type}-${type === "cheer" ? new Date().toISOString().slice(0, 10) : "saved"}`;
    if (localStorage.getItem(key)) {
      setNotice(type === "cheer" ? "You already cheered today. Thank you!" : "A Long Walk is already saved on this phone.");
      return;
    }
    localStorage.setItem(key, "1");
    setNotice(type === "cheer" ? "Your cheer reached Navneet 👏" : "A Long Walk is saved on this phone.");
    fetch("/api/reactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type }),
    }).then(response => response.json())
      .then(data => { if (data?.today) setCheers(data.today); })
      .catch(() => {});
  }

  async function share() {
    const data = { title: "A Long Walk", text: "Follow Navneet walking from Kanyakumari to Kashmir.", url: location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(location.href);
      setNotice("Journey link ready to share.");
    } catch {}
  }

  return <section className="response-panel shell compact-response">
    <div><div className="section-tag">SMALL WAYS TO JOIN</div><h2>Send a signal.</h2><p>Cheer today, save the walk, share it, or play while you follow along.</p></div>
    <div className="response-buttons">
      <button onClick={() => react("cheer")}><Check size={18} /> Cheer today{cheers && cheers.cheer > 0 ? <b className="tally">{number.format(cheers.cheer)}</b> : null}</button>
      <button onClick={() => react("follow")}>＋ Follow A Long Walk</button>
      <button onClick={share}><Share2 size={18} /> Share journey</button>
      <a href="/games">◆ Play road games</a>
    </div>
    {notice && <p className="action-notice" role="status">{notice}</p>}
  </section>;
}
