"use client";

import { FormEvent, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { send as outboxSend } from "@/lib/outbox";

export function BookForm() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/book").then(response => response.json()).then(data => setCount(data.count || 0)).catch(() => {});

  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setStatus("Saving your place…");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    try {
      const outcome = await outboxSend("/api/book", payload, "your book pre-registration");
      form.reset();
      const result = outcome.result as { count?: number; duplicate?: boolean } | undefined;
      if (result?.count) setCount(result.count);
      setStatus(!outcome.sent
        ? "No signal — saved on this phone. You will be registered when you are back online."
        : result?.duplicate ? "You are already on the early-reader list." : "You are pre-registered. No payment was taken.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not register");
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
