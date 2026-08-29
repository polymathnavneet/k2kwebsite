"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { send } from "@/lib/outbox";

type Kind = "place" | "story" | "support" | "question";

export function RoadForm({ kind, placeLabel, messageLabel, buttonLabel }: { kind: Kind; placeLabel: string; messageLabel: string; buttonLabel: string }) {
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("Sending…");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = { type: kind, name: values.name, contact: values.contact, place: values.place, message: values.message };
    try {
      const outcome = await send("/api/messages", payload, "your message to the wall");
      form.reset();
      setStatus(outcome.sent
        ? ((outcome.result as { public?: boolean })?.public
            ? "Published. It is on the public wall now."
            : "Received. This one needs a quick check before it appears publicly.")
        : "No signal — saved on this phone. It will post itself when you are back online.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send");
    } finally { setSending(false); }
  }

  return <form className="road-form" onSubmit={submit}>
    <label>PUBLIC NAME<Input required name="name" placeholder="First name or nickname" /></label>
    <label>PRIVATE CONTACT<Input required name="contact" placeholder="Email or phone — never public" /></label>
    <label className="wide">{placeLabel}<Input name="place" required={kind !== "question"} /></label>
    <label className="wide">{messageLabel}<Textarea name="message" required /></label>
    <p className="public-choice wide">Your name, place and message go on the public wall straight away. Your contact detail is never published — it is only so Navneet can reach you.</p>
    <button className="primary-button wide" type="submit" disabled={sending}>{sending ? "Sending…" : buttonLabel}</button>
    {status && <p className="form-status wide" role="status">{status} {status.startsWith("Published") && <Link href="/messages">See it →</Link>}</p>}
  </form>;
}
