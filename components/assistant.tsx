"use client";

import { useCallback, useEffect, useState } from "react";
import { LocateFixed, RefreshCw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Ask = {
  id: string;
  kind: string;
  question: string;
  detail?: string;
  input: "taps" | "text" | "number" | "confirm" | "gps" | "link";
  taps?: string[];
  context?: Record<string, unknown>;
};

type Line = { from: "site" | "me"; text: string };

/**
 * The conversation that keeps the site true.
 *
 * It opens with whatever is most wrong - a position four days old, a message
 * nobody answered, a day with nothing written - and asks about that one thing.
 * Answering performs the change; there is no separate save. When the list is
 * empty it says so and gets out of the way.
 */
export function Assistant({ token }: { token: string }) {
  const [asks, setAsks] = useState<Ask[]>([]);
  const [summary, setSummary] = useState("");
  const [thread, setThread] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState("");
  const [opener, setOpener] = useState("");
  const [loaded, setLoaded] = useState(false);

  const current = asks[0];

  const call = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), "x-admin-token": token },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "That did not work");
    return result;
  }, [token]);

  const load = useCallback(async () => {
    try {
      const result = await call("/api/assistant");
      setAsks(result.asks || []);
      setSummary(result.summary || "");
      setOpener(result.opener || "");
    } catch {
      setSummary("Could not reach the site.");
    } finally {
      setLoaded(true);
    }
  }, [call]);

  useEffect(() => {
    // First load is a tick of the subscription rather than a call in the body.
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  function say(from: Line["from"], text: string) {
    setThread(lines => [...lines, { from, text }].slice(-40));
  }

  async function answer(value: unknown, shown: string) {
    if (!current) return;
    setBusy(true);
    say("me", shown);
    try {
      const result = await call("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: current.kind, context: current.context, answer: value }),
      });
      say("site", result.said);
      setAsks(result.asks || []);
      setSummary(result.summary || summary);
      if (result.opener) setOpener(result.opener);
    } catch (error) {
      say("site", error instanceof Error ? error.message : "That did not work");
    } finally {
      setBusy(false);
      setDraft("");
      setPicked([]);
    }
  }

  // Type anything at it: a distance, a place, a link, a reply, or just the day.
  async function sendChat() {
    const text = chat.trim();
    if (text.length < 2) return;
    setBusy(true);
    say("me", text);
    setChat("");
    try {
      const result = await call("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "free", answer: text }),
      });
      if (result.understood) say("site", result.understood);
      say("site", result.said);
      setAsks(result.asks || []);
      setSummary(result.summary || summary);
      if (result.opener) setOpener(result.opener);
    } catch (error) {
      say("site", error instanceof Error ? error.message : "That did not work");
    } finally { setBusy(false); }
  }

  async function skip() {
    if (!current) return;
    setBusy(true);
    say("me", "Not now");
    try {
      const result = await call("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: current.kind, context: current.context, skip: true }),
      });
      // Move past this one for now without changing anything.
      setAsks(list => list.slice(1));
      setSummary(result.summary || summary);
    } catch { /* skipping should never fail loudly */ }
    finally { setBusy(false); }
  }

  function useGps() {
    if (!navigator.geolocation) return say("site", "This device will not share its position.");
    say("me", "Using my GPS…");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setBusy(false);
        answer(
          { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy },
          `Here (accurate to about ${Math.round(position.coords.accuracy)} m)`
        );
      },
      error => { setBusy(false); say("site", error.message); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  if (!loaded) return <section className="assistant"><p className="assistant-summary">Checking the site…</p></section>;

  return <section className="assistant">
    <div className="assistant-head">
      <div><b>{opener || (asks.length ? `${asks.length} thing${asks.length === 1 ? "" : "s"} need you` : "Nothing needs you")}</b><span>{summary}</span></div>
      <Button variant="outline" size="icon" aria-label="Check again" onClick={load}><RefreshCw /></Button>
    </div>

    {thread.length > 0 && <div className="assistant-thread">
      {thread.map((line, index) => <p key={index} className={line.from === "me" ? "line me" : "line site"}>{line.text}</p>)}
    </div>}

    {!current ? (
      <p className="assistant-clear">Everything is up to date. The site knows where you are, nobody is waiting for a reply, and today is written up.</p>
    ) : (
      <div className="assistant-ask">
        <p className="ask-q">{current.question}</p>
        {current.detail && <p className="ask-detail">{current.detail}</p>}

        {current.input === "confirm" && <div className="ask-actions">
          <Button disabled={busy} onClick={() => answer(true, "Yes")}>Yes</Button>
          <Button variant="outline" disabled={busy} onClick={() => answer(false, "No")}>No</Button>
        </div>}

        {current.input === "gps" && <div className="ask-actions">
          <Button disabled={busy} onClick={useGps}><LocateFixed /> Use my GPS</Button>
        </div>}

        {current.input === "taps" && <>
          <div className="ask-taps">
            {(current.taps ?? []).map(option => {
              const on = picked.includes(option);
              return <button
                type="button"
                key={option}
                className={on ? "tap on" : "tap"}
                aria-pressed={on}
                onClick={() => setPicked(list => on ? list.filter(item => item !== option) : [...list, option])}
              >{option}</button>;
            })}
          </div>
          <Textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Add a line of your own (optional)" />
          <div className="ask-actions">
            <Button
              disabled={busy || (!picked.length && draft.trim().length < 2)}
              onClick={() => {
                const text = [picked.join(" · "), draft.trim()].filter(Boolean).join(" — ");
                answer(text, text);
              }}
            >Publish</Button>
          </div>
        </>}

        {(current.input === "text" || current.input === "link") && <>
          {current.input === "link"
            ? <Input value={draft} onChange={event => setDraft(event.target.value)} placeholder="instagram.com/p/… or a YouTube link" />
            : <Textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Your reply appears publicly under their message." />}
          <div className="ask-actions">
            <Button disabled={busy || draft.trim().length < 2} onClick={() => answer(draft.trim(), draft.trim())}>Send</Button>
          </div>
        </>}

        {current.input === "number" && <>
          <Input type="number" inputMode="decimal" step="0.1" min="0" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Kilometres" />
          <div className="ask-actions">
            <Button disabled={busy || !draft} onClick={() => answer(Number(draft), `${draft} km`)}>Save</Button>
          </div>
        </>}

        <button className="assistant-skip" type="button" disabled={busy} onClick={skip}><SkipForward size={13} /> Not now</button>
      </div>
    )}

    <form className="assistant-chat" onSubmit={event => { event.preventDefault(); sendChat(); }}>
      <Input
        value={chat}
        onChange={event => setChat(event.target.value)}
        placeholder="Or just tell me — &ldquo;walked 18 km&rdquo;, &ldquo;in Nagpur&rdquo;, paste a link…"
        aria-label="Tell the assistant anything"
        disabled={busy}
      />
      <Button type="submit" disabled={busy || chat.trim().length < 2}>Send</Button>
    </form>
  </section>;
}
