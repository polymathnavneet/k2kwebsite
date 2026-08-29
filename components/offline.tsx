"use client";

import { useEffect, useState } from "react";
import { pending, watchOutbox, type Outgoing } from "@/lib/outbox";

/**
 * Registers the service worker and shows a single honest line when the phone
 * has no signal - including how many things are still waiting to send, so a
 * message written in a village does not feel lost.
 */
export function Offline() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [rows, setRows] = useState<Outgoing[]>([]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const countQueued = () => {
      pending().then(rows => { setWaiting(rows.length); setRows(rows); });
    };
    const stop = watchOutbox();
    const onOutbox = (event: Event) => {
      const detail = (event as CustomEvent<{ count: number; rows: Outgoing[] }>).detail;
      setWaiting(detail.count);
      setRows(detail.rows);
    };
    document.addEventListener("alw:outbox", onOutbox);

    const update = () => { setOnline(navigator.onLine); countQueued(); };
    update();

    addEventListener("online", update);
    addEventListener("offline", update);
    const timer = setInterval(countQueued, 5000);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
      document.removeEventListener("alw:outbox", onOutbox);
      stop();
      clearInterval(timer);
    };
  }, []);

  if (online && !waiting) return null;

  // Name what is waiting rather than counting it, so nothing feels lost.
  const what = rows.slice(0, 3).map(row => row.label).join(", ");
  return (
    <div className="offline-bar" role="status">
      {online
        ? `Sending ${waiting === 1 ? "" : `${waiting} things: `}${what}${rows.length > 3 ? "…" : ""}`
        : waiting
          ? `No signal. ${waiting === 1 ? "One thing is" : `${waiting} things are`} saved on this phone and will send by themselves: ${what}${rows.length > 3 ? "…" : ""}`
          : "No signal. You can still read the site, and anything you write is saved on this phone and sent when the signal returns."}
    </div>
  );
}
