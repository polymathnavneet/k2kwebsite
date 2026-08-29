"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and shows a single honest line when the phone
 * has no signal - including how many things are still waiting to send, so a
 * message written in a village does not feel lost.
 */
export function Offline() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const countQueued = () => {
      let total = 0;
      for (const key of ["alw-message-queue", "alw-book-queue"]) {
        try { total += (JSON.parse(localStorage.getItem(key) || "[]") as unknown[]).length; }
        catch { /* a corrupt queue should not break the banner */ }
      }
      setWaiting(total);
    };

    const update = () => { setOnline(navigator.onLine); countQueued(); };
    update();

    addEventListener("online", update);
    addEventListener("offline", update);
    const timer = setInterval(countQueued, 5000);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
      clearInterval(timer);
    };
  }, []);

  if (online && !waiting) return null;

  return (
    <div className="offline-bar" role="status">
      {online
        ? `${waiting} ${waiting === 1 ? "message is" : "messages are"} waiting to send…`
        : "No signal. You can still read the site, and anything you write is saved on this phone and sent when the signal returns."}
    </div>
  );
}
