"use client";

import { FormEvent, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { send as outboxSend } from "@/lib/outbox";

export function BookForm() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/book").then(response => response.json()).then(data => setCount(data.count || 0)).catch(() => {});
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("Saving…");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    try {
      const outcome = await outboxSend("/api/book", payload, "your book update request");
      form.reset();
      const result = outcome.result as { count?: number; duplicate?: boolean } | undefined;
      if (result?.count) setCount(result.count);
      setStatus(!outcome.sent
        ? "No signal — saved on this phone and it will send when you are online."
        : result?.duplicate ? "You are already on the book update list." : "Done. You will hear when the book is ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save this");
    }
    setSending(false);
  }

  return <form className="book-form book-form-minimal" onSubmit={submit}>
    <label>NAME<Input required name="name" autoComplete="name" /></label>
    <label>EMAIL OR PHONE<Input required name="contact" autoComplete="email" /></label>
    <button className="primary-button wide" disabled={sending}>{sending ? "Saving…" : "Tell me when the book is ready"}</button>
    <p className="wide form-status" role="status">{status || (count ? `${count.toLocaleString("en-IN")} people want book updates.` : "Two fields. Nothing else.")}</p>
  </form>;
}
