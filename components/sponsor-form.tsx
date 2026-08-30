"use client";

import { FormEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { send } from "@/lib/outbox";

/**
 * The sponsor's way in.
 *
 * Both buttons on the sponsorship page used to open the road-help form - the
 * one headed "practical road help", asking for water, power, food or a place to
 * stay. A brand arriving from a proposal found itself offering Navneet a bed.
 *
 * This asks a sponsor's questions instead, and unlike every other form on the
 * site it does not publish: an enquiry is held for the admin sheet only, since
 * a brand's interest and its budget are not the public wall's business.
 */
export function SponsorForm() {
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("Sending…");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const message = [
      `Interested in: ${values.tier}`,
      values.brand ? `Brand: ${values.brand}` : "",
      values.message,
    ].filter(Boolean).join("\n");
    try {
      const outcome = await send("/api/messages", { type: "sponsor", name: values.name, contact: values.contact, place: values.brand, message }, "your sponsorship enquiry");
      form.reset();
      setStatus(outcome.sent
        ? "Sent. It goes straight to Navneet, and nowhere public. He will reply on the address you gave."
        : "No signal — saved on this phone. It will send itself when you are back online.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send");
    } finally { setSending(false); }
  }

  return <form className="road-form" onSubmit={submit}>
    <label>YOUR NAME<Input required name="name" /></label>
    <label>BRAND OR COMPANY<Input name="brand" /></label>
    <label>EMAIL OR PHONE<Input required name="contact" placeholder="Never published" /></label>
    <label>INTERESTED IN<NativeSelect name="tier" defaultValue="Not sure yet">
      <NativeSelectOption value="Title Partner · ₹2,00,000">Title Partner · ₹2,00,000</NativeSelectOption>
      <NativeSelectOption value="Journey Partner · ₹50,000">Journey Partner · ₹50,000</NativeSelectOption>
      <NativeSelectOption value="Gear Partner · in kind">Gear Partner · in kind</NativeSelectOption>
      <NativeSelectOption value="Supporter · ₹10,000+">Supporter · ₹10,000+</NativeSelectOption>
      <NativeSelectOption value="Not sure yet">Not sure yet — let us talk</NativeSelectOption>
    </NativeSelect></label>
    <label className="wide">WHAT WOULD YOU LIKE TO ASK?<Textarea name="message" required placeholder="The hard questions are welcome." /></label>
    <button className="primary-button wide" type="submit" disabled={sending}>{sending ? "Sending…" : "Send this to Navneet"}</button>
    <p className="wide form-status" role="status">{status || "This one is private. It never appears on the public wall."}</p>
  </form>;
}
