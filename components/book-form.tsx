"use client";

import { FormEvent, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export function BookForm() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const queueKey = "alw-book-queue";

  async function send(payload: Record<string, unknown>) {
    const response = await fetch("/api/book", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string; duplicate?: boolean; count?: number };
    if (!response.ok) throw new Error(result.error || "Could not register");
    return result;
  }

  useEffect(() => {
    fetch("/api/book").then(response => response.json()).then(data => setCount(data.count || 0)).catch(() => {});

    // Anything registered without signal is sent as soon as it returns.
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
    event.preventDefault(); setSending(true); setStatus("Saving your place…");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    try {
      const result = await send(payload);
      form.reset();
      setCount(result.count || count);
      setStatus(result.duplicate ? "You are already on the early-reader list." : "You are pre-registered. No payment was taken.");
    } catch (error) {
      if (!navigator.onLine) {
        const queue = JSON.parse(localStorage.getItem(queueKey) || "[]") as unknown[];
        queue.push(payload);
        localStorage.setItem(queueKey, JSON.stringify(queue.slice(-20)));
        setStatus("Saved on this phone. You will be registered when your signal returns.");
      } else setStatus(error instanceof Error ? error.message : "Could not register");
    }
    setSending(false);
  }
  return <form className="book-form" onSubmit={submit}>
    <label>NAME<Input required name="name" /></label><label>EMAIL OR PHONE<Input required name="contact" /></label>
    <label>CITY<Input name="city" /></label><label>FORMAT<NativeSelect name="format" defaultValue="either"><NativeSelectOption value="either">Either</NativeSelectOption><NativeSelectOption value="paperback">Paperback</NativeSelectOption><NativeSelectOption value="ebook">E-book</NativeSelectOption></NativeSelect></label>
    <label className="wide">A NOTE FOR THE AUTHOR<Textarea name="note" /></label><button className="primary-button wide" disabled={sending}>{sending ? "Saving…" : "Pre-register for A Long Walk"}</button>
    <p className="wide form-status" role="status">{status || (count ? `${count.toLocaleString("en-IN")} people have pre-registered.` : "Be among the first readers.")}</p>
  </form>;
}
