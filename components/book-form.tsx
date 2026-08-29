"use client";

import { FormEvent, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export function BookForm() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => { fetch("/api/book").then(response => response.json()).then(data => setCount(data.count || 0)).catch(() => {}); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setStatus("Saving your place…");
    const form = event.currentTarget;
    const response = await fetch("/api/book", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json() as { error?: string; duplicate?: boolean; count?: number };
    if (response.ok) { form.reset(); setCount(result.count || count); setStatus(result.duplicate ? "You are already on the early-reader list." : "You are pre-registered. No payment was taken."); }
    else setStatus(result.error || "Could not register");
    setSending(false);
  }
  return <form className="book-form" onSubmit={submit}>
    <label>NAME<Input required name="name" /></label><label>EMAIL OR PHONE<Input required name="contact" /></label>
    <label>CITY<Input name="city" /></label><label>FORMAT<NativeSelect name="format" defaultValue="either"><NativeSelectOption value="either">Either</NativeSelectOption><NativeSelectOption value="paperback">Paperback</NativeSelectOption><NativeSelectOption value="ebook">E-book</NativeSelectOption></NativeSelect></label>
    <label className="wide">A NOTE FOR THE AUTHOR<Textarea name="note" /></label><button className="primary-button wide" disabled={sending}>{sending ? "Saving…" : "Pre-register for A Long Walk"}</button>
    <p className="wide form-status" role="status">{status || (count ? `${count.toLocaleString("en-IN")} people have pre-registered.` : "Be among the first readers.")}</p>
  </form>;
}
