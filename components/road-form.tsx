"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Kind = "place" | "story" | "support" | "question";

export function RoadForm({ kind, placeLabel, messageLabel, buttonLabel }: { kind: Kind; placeLabel: string; messageLabel: string; buttonLabel: string }) {
  const [publicConsent, setPublicConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const queueKey = "alw-message-queue";

  async function send(payload: Record<string, unknown>) {
    const response = await fetch("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string; public?: boolean };
    if (!response.ok) throw new Error(result.error || "Could not send");
    return result;
  }

  useEffect(() => {
    const flush = async () => {
      if (!navigator.onLine) return;
      const queue = JSON.parse(localStorage.getItem(queueKey) || "[]") as Record<string, unknown>[];
      while (queue.length) {
        try { await send(queue[0]); queue.shift(); localStorage.setItem(queueKey, JSON.stringify(queue)); }
        catch { return; }
      }
      localStorage.removeItem(queueKey);
    };
    flush();
    addEventListener("online", flush);
    return () => removeEventListener("online", flush);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("Sending…");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = { type: kind, name: values.name, contact: values.contact, place: values.place, message: values.message, publicConsent };
    try {
      const result = await send(payload);
      form.reset();
      setPublicConsent(false);
      setStatus(result.public ? "Published on the public wall." : "Received privately. Navneet can see it in his inbox.");
    } catch (error) {
      if (!navigator.onLine) {
        const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
        queue.push(payload);
        localStorage.setItem(queueKey, JSON.stringify(queue.slice(-20)));
        setStatus("Saved on this phone. It will send when your signal returns.");
      } else setStatus(error instanceof Error ? error.message : "Could not send");
    } finally { setSending(false); }
  }

  return <form className="road-form" onSubmit={submit}>
    <label>PUBLIC NAME<Input required name="name" placeholder="First name or nickname" /></label>
    <label>PRIVATE CONTACT<Input required name="contact" placeholder="Email or phone — never public" /></label>
    <label className="wide">{placeLabel}<Input name="place" required={kind !== "question"} /></label>
    <label className="wide">{messageLabel}<Textarea name="message" required /></label>
    <label className="public-choice wide"><Checkbox checked={publicConsent} onCheckedChange={value => setPublicConsent(value === true)} /><span>Publish my public name, place and message automatically. My contact stays private.</span></label>
    <button className="primary-button wide" type="submit" disabled={sending}>{sending ? "Sending…" : buttonLabel}</button>
    {status && <p className="form-status wide" role="status">{status} {status.startsWith("Published") && <Link href="/messages">See it →</Link>}</p>}
  </form>;
}
