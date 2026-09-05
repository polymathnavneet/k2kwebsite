"use client";

import { useEffect, useRef, useState } from "react";
import { CloudDownload, Crosshair, Download, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { JournalEntry, Journey, MediaItem, PublicMessage, RouteSuggestion, WalkRoute } from "@/lib/types";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/embed";
import { lastHeard, predictNext } from "@/lib/position";
import { walkDay } from "@/lib/time";
import { Assistant } from "./assistant";

type AdminMessage = PublicMessage & { contact: string };
type BookRow = { id: string; name: string; contact: string; city: string; format: string; note: string; createdAt: string };

type PlanStep = { date: string; title: string; detail: string; final?: boolean };

export function AdminConsole() {
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("alw-admin-token") ?? ""; } catch { return ""; }
  });
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Enter your private admin passcode once on this phone.");
  const [journey, setJourney] = useState<Journey>(defaultJourney);
  const [route, setRoute] = useState<WalkRoute>(defaultRoute);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [followUpReplies, setFollowUpReplies] = useState<Record<string, string>>({});
  const [mirrorsBack, setMirrorsBack] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [flash, setFlash] = useState("");
  // Ticked once a minute rather than read during render, so "20 min ago" ages
  // while the panel is open instead of freezing at whatever it said on load.
  const [now, setNow] = useState(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Say something the person can actually see.
   *
   * Every button here reported what it had done, into a status line at the top
   * of the admin bar. On a phone, pressing "Publish route" at the bottom of a
   * long page means that line is several screens away - so every press looked
   * like nothing had happened. The same words now also appear next to the
   * thumb that pressed the button, and the bar keeps the last one.
   */
  function say(text: string) {
    setStatus(text);
    setFlash(text);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 6000);
  }
  const [rowNote, setRowNote] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [edits, setEdits] = useState<Record<string, { name: string; km: string }>>({});
  const [gallery, setGallery] = useState<MediaItem[]>([]);
  const [newMedia, setNewMedia] = useState({ url: "", caption: "", place: "" });
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [mind, setMind] = useState("");
  const [askMind, setAskMind] = useState<{ place: string; reason: string } | null>(null);
  // Cheers. They have been counted since the site launched and shown to nobody,
  // least of all to the man they were for.
  const [cheers, setCheers] = useState<{ today: { cheer: number; follow: number }; counts: { cheer: number; follow: number } } | null>(null);
  // Why the phone is or is not reporting, and the address to paste into it.
  const [tracker, setTracker] = useState<{
    everAccepted: boolean;
    lastAttemptAt: string | null;
    total: number;
    recent: { outcome: string; count: number; last: string; detail: string; agent: string }[];
    ownTracksUrl: string;
    plainUrl: string;
    configured: boolean;
  } | null>(null);

  async function request<T>(url: string, options: RequestInit = {}) {
    const cleanToken = token.trim();
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), "x-admin-token": cleanToken } });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  }

  /**
   * Put this phone's position on the site, now.
   *
   * The tracker app is meant to do this by itself, and when it is working this
   * button is never needed. It exists because the app can be silent - not
   * installed, wrong key, permission refused, battery saver holding it down -
   * and until somebody notices, the site quietly shows a position from days
   * ago as though it were current. There is nothing a server can do about a
   * phone that is not talking: no amount of code here can reach out and ask.
   *
   * This browser can ask, though. It is the same GPS, read from the page he is
   * already looking at, and it costs one tap.
   */
  const [locating, setLocating] = useState(false);
  async function sendMyPosition() {
    if (!("geolocation" in navigator)) { say("This browser cannot read a position."); return; }
    setLocating(true);
    say("Asking this phone where it is…");
    try {
      const spot = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 20000, maximumAge: 0,
        }));
      const { latitude, longitude, accuracy } = spot.coords;
      await request("/api/gps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: latitude, lon: longitude, accuracy, at: new Date(spot.timestamp).toISOString(), source: "browser" }),
      });
      say(`Sent: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)} m).`);
      await loadAll();
    } catch (error) {
      const locationError = error && typeof error === "object" && "code" in error;
      const message = locationError
        ? (error.code === 1 ? "Location permission was refused for this site." : "This phone could not get a fix.")
        : error instanceof Error ? error.message : "Could not send the position.";
      say(message);
    } finally { setLocating(false); }
  }

  async function loadAll() {
    say("Syncing…");
    try {
      const [journeyData, routeData, messageData, bookData] = await Promise.all([
        fetch("/api/journey").then(response => response.json()),
        fetch("/api/route").then(response => response.json()),
        request<{ rows: AdminMessage[] }>("/api/messages?admin=1"),
        request<{ rows: BookRow[] }>("/api/book?admin=1"),
      ]);
      const pending = await request<{ rows: RouteSuggestion[] }>("/api/suggestions").catch(() => ({ rows: [] }));
      setSuggestions(pending.rows || []);
      const runUp = await fetch("/api/timeline").then(response => response.json()).catch(() => ({ steps: [] }));
      setPlan(runUp.steps || []);
      const shots = await fetch("/api/media").then(response => response.json()).catch(() => ({ rows: [] }));
      setGallery(shots.rows || []);
      const applause = await fetch("/api/reactions").then(response => response.json()).catch(() => null);
      if (applause?.today) setCheers(applause);
      const trackerHealth = await request<typeof tracker>("/api/tracker").catch(() => null);
      if (trackerHealth) setTracker(trackerHealth);
      const diary = await request<{ rows: JournalEntry[] }>("/api/journal?admin=1").catch(() => null);
      if (diary) setEntries(diary.rows || []);
      setJourney(journeyData); setRoute(routeData); setMessages(messageData.rows); setBooks(bookData.rows);

      // The phone moved him somewhere new since he last looked. That, rather
      // than a button he no longer presses, is the moment worth asking about.
      const here = String(journeyData.currentPlace || "").trim();
      const seen = localStorage.getItem("alw-last-place") ?? "";
      if (here && seen && here !== seen) setAskMind({ place: here, reason: `Your phone says you are in ${here}.` });
      if (here) localStorage.setItem("alw-last-place", here);
      // Keep whatever is already typed; only fill in boxes that are untouched,
      // so a reload never throws away a half-written reply.
      setReplies(current => Object.fromEntries(messageData.rows.map(row =>
        [row.id, current[row.id] !== undefined ? current[row.id] : (row.reply || "")])));
      setFollowUpReplies(current => Object.fromEntries(messageData.rows.map(row =>
        [row.id, current[row.id] !== undefined ? current[row.id] : (row.followUpReply || "")])));
      setToken(token.trim()); setConnected(true); localStorage.setItem("alw-admin-token", token.trim());
      say(`Synced · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setConnected(false);
      const message = error instanceof Error ? error.message : "Could not connect";
      // Only a rejected passcode is a passcode problem.
      say(/unauthor/i.test(message) ? "That passcode was not accepted." : `${message}. Check your connection.`);
    }
  }

  useEffect(() => {
    fetch("/api/sync").then(response => response.json()).then(data => setMirrorsBack(Boolean(data.canWrite))).catch(() => {});
  }, []);

  // Ticked once a minute rather than read during render, so "20 min ago" ages
  // while the panel is open instead of freezing at whatever it said on load.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, []);

  // Sponsorship enquiries are held rather than published, so they would
  // otherwise sit in the wall marked "held" between a stranger's note and a
  // spam message. They get their own tab.
  const sponsorEnquiries = messages.filter(row => row.type === "sponsor");
  const wallMessages = messages.filter(row => row.type !== "sponsor");

  const heard = now ? lastHeard(journey, now) : null;
  const walkStarted = walkDay(route.startDate) >= 1 && journey.mode === "live";
  const adminAhead = walkStarted ? predictNext(route.stops, journey) : null;


  // Pull hand-edited data/*.json out of the repository and make it live.
  async function pullFromGithub() {
    say("Pulling edits from GitHub…");
    try {
      const result = await request<{ applied: string[]; problems: string[] }>("/api/sync", { method: "POST" });
      await loadAll();
      say(result.problems.length
        ? `Problems: ${result.problems.join(" · ")}`
        : result.applied.length
          ? `Pulled from GitHub: ${result.applied.join(" · ")}.${mirrorsBack ? "" : " (Changes made here are not written back to the files - that part needs a GitHub token.)"}`
          : "GitHub had nothing new.");
    } catch (error) { say(error instanceof Error ? error.message : "Could not pull from GitHub"); }
  }

  async function decideSuggestion(suggestion: RouteSuggestion, action: "accept" | "dismiss") {
    setBusyRow(suggestion.id);
    try {
      const edit = edits[suggestion.id];
      const result = await request<{ added?: { name: string; km: number; position: number }; stops?: number }>("/api/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: suggestion.id,
          action,
          ...(action === "accept" ? { name: edit?.name || suggestion.name, km: edit?.km || suggestion.km } : {}),
        }),
      });
      setSuggestions(current => current.filter(row => row.id !== suggestion.id));
      say(action === "accept" && result.added
        ? `${result.added.name} added to the route at ${result.added.km.toLocaleString("en-IN")} km. Every date after it has recalculated.`
        : "Dismissed. The route is unchanged.");
      if (action === "accept") {
        const fresh = await fetch("/api/route").then(response => response.json());
        setRoute(fresh);
      }
    } catch (error) { say(error instanceof Error ? error.message : "Could not save that"); }
    finally { setBusyRow(""); }
  }


  // A one-line thought, published where you stood when you thought it.
  async function saveMind() {
    if (mind.trim().length < 2) return say("Write a word or two first.");
    say("Publishing…");
    try {
      await request("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "answer", body: mind, question: "What was on your mind here?", place: askMind?.place }),
      });
      setAskMind(null);
      setMind("");
      say("Published to the journal.");
    } catch (error) { say(error instanceof Error ? error.message : "Could not publish"); }
  }

  async function addMedia() {
    if (!newMedia.url.trim()) return say("Paste a link first.");
    say("Adding…");
    try {
      await request("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", ...newMedia }),
      });
      setNewMedia({ url: "", caption: "", place: "" });
      const shots = await fetch("/api/media").then(response => response.json());
      setGallery(shots.rows || []);
      say("Added. It is on the Pictures page now.");
    } catch (error) { say(error instanceof Error ? error.message : "Could not add that link"); }
  }

  async function removeMedia(id: string) {
    setBusyRow(id);
    try {
      await request("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });
      setGallery(current => current.filter(row => row.id !== id));
      say("Removed.");
    } catch (error) { say(error instanceof Error ? error.message : "Could not remove that"); }
    finally { setBusyRow(""); }
  }

  async function removeEntry(id: string) {
    setBusyRow(id);
    try {
      await request("/api/journal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "remove", id }) });
      setEntries(current => current.filter(entry => entry.id !== id));
      say("Note deleted.");
    } catch (error) { say(error instanceof Error ? error.message : "Could not delete that note"); }
    finally { setBusyRow(""); }
  }




  /**
   * The run-up to the first step.
   *
   * Saving sorts the steps by date and treats the last one as the first step of
   * the walk, writing it to the route as the start date - so moving that date
   * moves every arrival date on the route with it. One edit, everything follows.
   */
  async function savePlan() {
    say("Publishing the plan…");
    try {
      const result = await request<{ steps: PlanStep[]; startDate: string; movedRoute: boolean }>("/api/timeline", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ steps: plan }),
      });
      setPlan(result.steps);
      if (result.movedRoute) {
        setRoute(current => ({ ...current, startDate: result.startDate }));
        say(`Plan is live. The walk now starts ${result.startDate}, and every arrival date has moved with it.`);
      } else {
        say("Plan is live on the homepage.");
      }
    } catch (error) { say(error instanceof Error ? error.message : "Could not publish the plan"); }
  }

  function editPlan(index: number, key: keyof PlanStep, value: string) {
    setPlan(current => current.map((step, stepIndex) => stepIndex === index ? { ...step, [key]: value } : step));
  }


  async function messageAction(id: string, action: "reply" | "follow-up-reply" | "publish" | "hide" | "delete") {
    const reply = ((action === "follow-up-reply" ? followUpReplies[id] : replies[id]) || "").trim();

    // Catch the empty-reply case here rather than making the person wait for a
    // round trip to be told the same thing in a status line they cannot see.
    if ((action === "reply" || action === "follow-up-reply") && !reply) {
      setRowNote(current => ({ ...current, [id]: "Write a reply in the box above first." }));
      return;
    }

    setBusyRow(id);
    setRowNote(current => ({ ...current, [id]: "" }));
    try {
      await request("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, reply }),
      });

      if (action === "delete") {
        setMessages(current => current.filter(row => row.id !== id));
        say("Deleted. The message and the contact detail are gone.");
        return;
      }
      // Update just this row. Reloading everything used to be the only feedback,
      // and on a phone it looked like nothing had happened at all.
      const now = new Date().toISOString();
      setMessages(current => current.map(row => row.id !== id ? row : {
        ...row,
        ...(action === "reply" ? { reply, status: "public", repliedAt: now } : {}),
        ...(action === "follow-up-reply" ? { followUpReply: reply, status: "public", followUpRepliedAt: now } : {}),
        ...(action === "publish" ? { status: "public" } : {}),
        ...(action === "hide" ? { status: "hidden" } : {}),
      }));

      const said = action === "reply" ? "Reply published. It is on the public wall now."
        : action === "follow-up-reply" ? "Follow-up reply published. That two-answer conversation is complete."
        : action === "publish" ? "Published. It is on the public wall now."
        : "Hidden. It is off the public wall.";
      setRowNote(current => ({ ...current, [id]: said }));
      say(said);
    } catch (error) {
      const said = error instanceof Error ? error.message : "Could not save that";
      setRowNote(current => ({ ...current, [id]: said }));
      say(said);
    } finally {
      setBusyRow("");
    }
  }

  function exportCsv(kind: "messages" | "book") {
    const rows = kind === "messages" ? messages : books;
    if (!rows.length) return;
    const keys = kind === "messages" ? ["createdAt", "type", "name", "place", "message", "contact", "status", "reply", "followUp", "followUpReply"] : ["createdAt", "name", "contact", "city", "format", "note"];
    // A cell starting = + - or @ is executed as a formula by Excel and Sheets,
    // so a message could run code on the machine that opens the export. A
    // leading apostrophe makes the spreadsheet treat it as text.
    const safe = (value: unknown) => {
      const text = String(value ?? "");
      const escaped = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${escaped.replace(/"/g, '""')}"`;
    };
    const csv = [keys.join(","), ...rows.map(row => keys.map(key => safe((row as unknown as Record<string, unknown>)[key])).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `a-long-walk-${kind}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  if (!connected) return <section className="admin-login"><h1>Your walk.<br />One control room.</h1><p>Use the private passcode once. It stays only on this phone. Extra spaces are ignored.</p><form onSubmit={event => { event.preventDefault(); loadAll(); }}><Input type="password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} placeholder="Private passcode" /><Button type="submit" disabled={token.trim().length < 8}>Open control room</Button></form><p role="status">{status}</p></section>;

  return <section className="admin-app">
    {flash && <div className="admin-flash" role="status" onClick={() => setFlash("")}>{flash}</div>}
    <div className="admin-bar"><div><b>A LONG WALK</b><span>{status}</span></div><Button variant="outline" onClick={loadAll}><RefreshCw /> Refresh</Button><Button variant="outline" onClick={pullFromGithub}><CloudDownload /> Pull edits from GitHub</Button><Button variant="outline" onClick={() => { localStorage.removeItem("alw-admin-token"); setConnected(false); setToken(""); }}>Change passcode</Button></div>
    <Assistant token={token.trim()} />
{askMind && <section className="mind-card">
      <div className="mind-head"><b>You are in {askMind.place}</b><button type="button" aria-label="Not now" onClick={() => setAskMind(null)}>✕</button></div>
      <p className="mind-q">What&apos;s on your mind?</p>
      <Textarea value={mind} onChange={event => setMind(event.target.value)} placeholder="One line is plenty. It publishes with this place attached." />
      <div className="mind-actions">
        <Button onClick={saveMind} disabled={mind.trim().length < 2}>Publish it</Button>
        <Button variant="outline" onClick={() => setAskMind(null)}>Not now</Button>
      </div>
    </section>}
    <Tabs defaultValue="journey">
      <TabsList className="admin-tabs"><TabsTrigger value="journey">Journey</TabsTrigger><TabsTrigger value="plan">Before the walk</TabsTrigger><TabsTrigger value="sponsors" className={sponsorEnquiries.length ? "has-new" : ""}>Sponsors {sponsorEnquiries.length ? `(${sponsorEnquiries.length})` : ""}</TabsTrigger><TabsTrigger value="messages">Messages {wallMessages.length ? `(${wallMessages.length})` : ""}</TabsTrigger><TabsTrigger value="journal">Journal {entries.length ? `(${entries.length})` : ""}</TabsTrigger><TabsTrigger value="media">Pictures {gallery.length ? `(${gallery.length})` : ""}</TabsTrigger><TabsTrigger value="book">Book {books.length ? `(${books.length})` : ""}</TabsTrigger></TabsList>
      {suggestions.length > 0 && <section className="suggestions" aria-label="Places to confirm">
      <div className="suggestions-head"><b>{suggestions.length === 1 ? "A new place on your route" : `${suggestions.length} new places on your route`}</b><span>Nothing changes until you say yes.</span></div>
      {suggestions.map(suggestion => <article key={suggestion.id}>
        <p className="why">{suggestion.reason}</p>
        <div className="fields">
          <label>PLACE<Input value={edits[suggestion.id]?.name ?? suggestion.name} onChange={event => setEdits(current => ({ ...current, [suggestion.id]: { name: event.target.value, km: current[suggestion.id]?.km ?? String(suggestion.km) } }))} /></label>
          <label>KM FROM START<Input type="number" inputMode="numeric" value={edits[suggestion.id]?.km ?? String(suggestion.km)} onChange={event => setEdits(current => ({ ...current, [suggestion.id]: { name: current[suggestion.id]?.name ?? suggestion.name, km: event.target.value } }))} /></label>
        </div>
        <div className="decide">
          <Button disabled={busyRow === suggestion.id} onClick={() => decideSuggestion(suggestion, "accept")}>{busyRow === suggestion.id ? "Adding…" : "Yes, add it to my route"}</Button>
          <Button variant="outline" disabled={busyRow === suggestion.id} onClick={() => decideSuggestion(suggestion, "dismiss")}>No, I was just passing</Button>
        </div>
      </article>)}
    </section>}
    <TabsContent value="journey" className="admin-panel">
        <div className="admin-heading"><div><h2>The walk right now</h2><p>Read this to check the tracking is alive. Nothing here needs setting — it is all your phone talking.</p></div></div>

        {/* The one thing on this page that is not a machine reading: people
            pressed a button because of him. It goes first because a hundred
            and eleven strangers cheering is worth more at the end of a hard
            day than any of the numbers under it. */}
        {cheers && (cheers.counts.cheer > 0 || cheers.counts.follow > 0) && <div className="cheer-note">
          <b>{cheers.today.cheer > 0
            ? `${cheers.today.cheer.toLocaleString("en-IN")} ${cheers.today.cheer === 1 ? "person" : "people"} cheered you today`
            : "Nobody has cheered yet today"}</b>
          <span>{cheers.counts.cheer.toLocaleString("en-IN")} cheers in all · {cheers.counts.follow.toLocaleString("en-IN")} following the walk</span>
        </div>}

        {/* When the tracker has gone quiet the site is showing an old position
            as though it were current, and that is the one thing this project
            cannot afford. Said loudly, with the fix attached. */}
        {/* What is actually wrong, named. Every knock on the tracking door is
            recorded now, refused ones included, so this can say "your phone
            tried and was turned away" rather than leaving the two possible
            faults looking identical. */}
        {tracker && (!heard || !heard.fresh) && <div className="tracker-doctor">
          <b>{tracker.everAccepted
            ? "Your phone has reached the site before, and has gone quiet."
            : tracker.total > 0
              ? "Your phone is reaching the site and being turned away."
              : "Nothing has ever knocked on the tracking door."}</b>

          {tracker.recent.length > 0 && <ul className="tracker-log">
            {tracker.recent.map(row => <li key={row.outcome} className={row.outcome}>
              <b>{row.count}×</b>
              <span>{
                row.outcome === "accepted" ? "accepted"
                : row.outcome === "no-key" ? "refused — no key in the address"
                : row.outcome === "wrong-key" ? "refused — the key did not match"
                : row.outcome === "bad-position" ? "key fine, but no position in the message"
                : "error"
              }</span>
              <small>{row.detail}{row.agent ? ` · ${row.agent.split("/")[0]}` : ""}</small>
            </li>)}
          </ul>}

          <p className="tracker-verdict">{
            tracker.total === 0
              ? "That means the app is not sending at all: it is in Quiet or Manual mode, has no location permission, or the address was never saved. Nothing has been refused, because nothing has arrived."
              : tracker.recent.some(row => row.outcome === "wrong-key")
                ? "The address in your app has the wrong key. Copy the one below over it exactly."
                : tracker.recent.some(row => row.outcome === "no-key")
                  ? "The address in your app is missing its ?key= part. Copy the one below over it exactly."
                  : "The key is right and positions are arriving. If the site still looks old, the app is reporting too rarely — set Significant mode, interval 300, displacement 50."
          }</p>

          {tracker.configured && <div className="tracker-url">
            <small>PASTE THIS INTO OWNTRACKS AS THE URL</small>
            <code>{tracker.ownTracksUrl}</code>
            <Button variant="outline" onClick={() => {
              navigator.clipboard?.writeText(tracker.ownTracksUrl)
                .then(() => say("Address copied. Paste it into OwnTracks → Preferences → Connection → URL."))
                .catch(() => say("Could not copy — select the address and copy it by hand."));
            }}>Copy the address</Button>
          </div>}
        </div>}

        {(!heard || !heard.fresh) && <div className="gps-alarm">
          <b>{!heard
            ? "Your tracker has never sent a position."
            : `Your tracker has been silent for ${heard.phrase.replace(" ago", "")}.`}</b>
          <p>
            {!heard
              ? "Nothing has ever arrived from the app, so the position on the site is a starting value, not a reading."
              : "The site is showing where you were then. It cannot fetch your phone — the phone has to send."}
            {" "}Tap below to put this phone&apos;s position on the site now, then check the app&apos;s settings.
          </p>
          <Button disabled={locating} onClick={sendMyPosition}>
            <Crosshair /> {locating ? "Reading this phone…" : "Send my position now"}
          </Button>
        </div>}

        {/* Four facts, all from his phone. This is the "is it working?" glance,
            and the last-heard time is the one that matters: everything else on
            the site is downstream of a phone that is still reporting. */}
        <div className="progress-strip">
          <div><small>WHERE</small><strong>{journey.currentPlace || "Nothing yet"}</strong></div>
          <div><small>GPS WALKED TOTAL</small><strong>{Math.round(journey.distanceTotal).toLocaleString("en-IN")} km</strong></div>
          <div><small>{walkStarted ? "NEXT STOP" : "WALK STARTS AT"}</small><strong>{walkStarted ? (adminAhead?.next.name ?? "Calculating") : (route.stops[0]?.name ?? "Kanyakumari")}</strong></div>
          <div><small>LAST UPDATE</small><strong className={heard && !heard.fresh ? "off" : ""}>{heard ? `Updated ${heard.phrase}` : "Never updated"}</strong>{heard && <span className="gps-age">{heard.fresh ? "the tracker is reporting" : "the tracker has gone quiet"}</span>}</div>
        </div>

        <p className="from-phone">Your town, distance, day, pace and next stop all come from GPS. Significant Changes mode stays quiet while you are still, so a gap between updates is normal. The site never asks you to type kilometres, and totals are recounted from recorded points every quarter of an hour. The walk switches itself to live on {route.startDate}.</p>
      </TabsContent>

      <TabsContent value="plan" className="admin-panel"><div className="admin-heading"><div><h2>Before the first step</h2><p>The run-up on the homepage, counting itself down. The last date is the day the walk starts — change it and every arrival date on the route moves with it.</p></div><Button onClick={savePlan}>Publish the plan</Button></div><div className="route-controls"><Button variant="outline" onClick={() => setPlan(current => [...current, { date: current.at(-1)?.date ?? route.startDate, title: "New step", detail: "" }])}><Plus /> Add a step</Button></div><div className="route-editor">{plan.map((step, index) => <article key={index}><header><b>{String(index + 1).padStart(2, "0")}{index === plan.length - 1 ? " · THE FIRST STEP" : ""}</b><div><Button size="icon" variant="ghost" disabled={plan.length <= 1} onClick={() => setPlan(current => current.filter((_, stepIndex) => stepIndex !== index))}><Trash2 /></Button></div></header><div><label>DATE<Input type="date" value={step.date} onChange={event => editPlan(index, "date", event.target.value)} /></label><label>TITLE<Input value={step.title} onChange={event => editPlan(index, "title", event.target.value)} /></label><label className="wide">WHAT HAPPENS<Input value={step.detail} onChange={event => editPlan(index, "detail", event.target.value)} /></label></div></article>)}</div><Button className="admin-save-mobile" onClick={savePlan}>Publish the plan</Button>
      </TabsContent>

      <TabsContent value="sponsors" className="admin-panel">
        <div className="admin-heading"><div><h2>Sponsorship enquiries</h2><p>Sent from the sponsorship page, and held here only. A brand&apos;s interest never appears on the public wall. Tap the address to write back.</p></div></div>
        {sponsorEnquiries.length === 0
          ? <p className="empty-note">Nothing yet. When a brand writes from the sponsorship page it lands here, and nowhere else.</p>
          : <div className="sponsor-list">{sponsorEnquiries.map(row => <article className="sponsor-row" key={row.id}>
              <header><b>{row.name}</b><span>{new Date(row.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></header>
              {row.place && <p className="sponsor-brand">{row.place}</p>}
              {row.contact
                ? <a className="sponsor-contact" href={row.contact.includes("@") ? `mailto:${row.contact}` : `tel:${row.contact.replace(/[^+\d]/g, "")}`}>{row.contact}</a>
                : <p className="sponsor-contact none">No contact given</p>}
              <p className="sponsor-message">{row.message}</p>
              <div className="sponsor-actions"><Button variant="ghost" disabled={busyRow === row.id} onClick={() => { if (confirm(`Delete this enquiry from ${row.name}? It cannot be got back.`)) messageAction(row.id, "delete"); }}><Trash2 /> Delete</Button></div>
              {rowNote[row.id] && <p className="row-note" role="status">{rowNote[row.id]}</p>}
            </article>)}</div>}
      </TabsContent>

      <TabsContent value="messages" className="admin-panel">
        <div className="admin-heading"><div><h2>Public reply sheet</h2><p>Reply once to the original message and, if the writer uses it, once to their follow-up. Each press publishes immediately. Yellow cells stay private.</p></div><Button variant="outline" onClick={() => exportCsv("messages")}><Download /> Export CSV</Button></div>
        <div className="admin-table"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Message</TableHead><TableHead>Private contact</TableHead><TableHead>Status</TableHead><TableHead>Public replies</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{wallMessages.map(row => <TableRow key={row.id}>
            <TableCell data-label="Date">{new Date(row.createdAt).toLocaleDateString("en-IN")}</TableCell>
            <TableCell data-label="Type">{row.type}</TableCell>
            <TableCell data-label="Name">{row.name}<small>{row.place}</small></TableCell>
            <TableCell data-label="Message" className="wrap-cell"><p>{row.message}</p>{row.followUp && <div className="admin-follow-up"><b>ONE FOLLOW-UP</b><p>{row.followUp}</p></div>}</TableCell>
            <TableCell data-label="Private contact" className="private-cell">{row.contact || <em>not carried over</em>}</TableCell>
            <TableCell data-label="Status"><span className={`status-chip ${row.status}`}>{row.status === "public" ? "On the wall" : row.status === "hidden" ? "Hidden" : "Held"}</span></TableCell>
            <TableCell data-label="Public replies" className="reply-cell">
              <label>FIRST REPLY<Textarea value={replies[row.id] || ""} onChange={event => setReplies(value => ({ ...value, [row.id]: event.target.value }))} /></label>
              {row.followUp && <label>FOLLOW-UP REPLY<Textarea value={followUpReplies[row.id] || ""} onChange={event => setFollowUpReplies(value => ({ ...value, [row.id]: event.target.value }))} /></label>}
            </TableCell>
            <TableCell data-label="Actions"><div className="table-actions">
              <Button disabled={busyRow === row.id} onClick={() => messageAction(row.id, "reply")}>{busyRow === row.id ? "Saving…" : row.reply ? "Update first reply" : "Reply"}</Button>
              {row.followUp && <Button disabled={busyRow === row.id} onClick={() => messageAction(row.id, "follow-up-reply")}>{row.followUpReply ? "Update follow-up reply" : "Reply to follow-up"}</Button>}
              {row.status !== "public" && <Button variant="outline" disabled={busyRow === row.id} onClick={() => messageAction(row.id, "publish")}>Put on the wall</Button>}
              {row.status !== "hidden" && <Button variant="destructive" disabled={busyRow === row.id} onClick={() => messageAction(row.id, "hide")}>Hide</Button>}
              <Button variant="ghost" disabled={busyRow === row.id} onClick={() => { if (confirm(`Delete ${row.name}'s message for good? Hiding keeps it; this does not.`)) messageAction(row.id, "delete"); }}><Trash2 /> Delete</Button>
            </div>{rowNote[row.id] && <p className="row-note" role="status">{rowNote[row.id]}</p>}</TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
      </TabsContent>
      <TabsContent value="journal" className="admin-panel">
        <div className="admin-heading"><div><h2>Field notes</h2><p>Answering the daily question above publishes here straight away. Answering twice in one day replaces that day&apos;s entry rather than adding a second.</p></div></div>
        <div className="media-admin">
          {entries.map(entry => <div className="row" key={entry.id}>
            <div className="top"><b>{entry.day}</b>{entry.place && <span>{entry.place}</span>}</div>
            <div style={{ fontSize: 12, opacity: .65 }}>{entry.question}</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{entry.body}</div>
            <div className="stop-actions"><Button variant="ghost" disabled={busyRow === entry.id} onClick={() => { if (confirm(`Delete the note from ${entry.day}?`)) removeEntry(entry.id); }}><Trash2 /> Delete</Button></div>
          </div>)}
          {!entries.length && <p style={{ fontSize: 13, opacity: .7 }}>Nothing written yet. Answer the question at the top.</p>}
        </div>
      </TabsContent>
      <TabsContent value="media" className="admin-panel">
        <div className="admin-heading"><div><h2>Pictures and film</h2><p>Paste a link. Nothing is uploaded, so there is no size limit and nothing to fill up.</p></div><a className="ig-link" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Open @{INSTAGRAM_HANDLE} ↗</a></div>
        <div className="admin-form-grid">
          <label className="wide">LINK<Input value={newMedia.url} onChange={event => setNewMedia(v => ({ ...v, url: event.target.value }))} placeholder="instagram.com/p/… · instagram.com/reel/… · youtube.com/watch?v=… · a .jpg link" /></label>
          <label className="wide">CAPTION<Input value={newMedia.caption} onChange={event => setNewMedia(v => ({ ...v, caption: event.target.value }))} placeholder="What is happening here?" /></label>
          <label>PLACE<Input value={newMedia.place} onChange={event => setNewMedia(v => ({ ...v, place: event.target.value }))} placeholder="Where was it taken?" /></label>
          <Button className="wide" onClick={addMedia}><Plus /> Add to the gallery</Button>
        </div>
        <p className="hint" style={{ fontSize: 12, opacity: .7 }}>Copy a link from Instagram with <b>Share → Copy link</b>. Reels and posts both work. The post has to be public.</p>
        <div className="media-admin">
          {gallery.map(item => <div className="row" key={item.id}>
            <div className="top"><b>{item.kind}</b>{item.place && <span>{item.place}</span>}<a href={item.url} target="_blank" rel="noopener noreferrer">{item.url.slice(0, 46)}…</a></div>
            {item.caption && <div style={{ fontSize: 13 }}>{item.caption}</div>}
            <Button variant="destructive" disabled={busyRow === item.id} onClick={() => removeMedia(item.id)}><Trash2 /> {busyRow === item.id ? "Removing…" : "Remove"}</Button>
          </div>)}
          {!gallery.length && <p style={{ fontSize: 13, opacity: .7 }}>Nothing in the gallery yet.</p>}
        </div>
      </TabsContent>
      <TabsContent value="book" className="admin-panel"><div className="admin-heading"><div><h2>Book pre-registration sheet</h2><p>Private contact details are visible only here.</p></div><Button variant="outline" onClick={() => exportCsv("book")}><Download /> Export CSV</Button></div><div className="admin-table"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Private contact</TableHead><TableHead>City</TableHead><TableHead>Format</TableHead><TableHead>Note</TableHead></TableRow></TableHeader><TableBody>{books.map(row => <TableRow key={row.id}><TableCell data-label="Date">{new Date(row.createdAt).toLocaleDateString("en-IN")}</TableCell><TableCell data-label="Name">{row.name}</TableCell><TableCell data-label="Private contact" className="private-cell">{row.contact || <em>not carried over</em>}</TableCell><TableCell data-label="City">{row.city}</TableCell><TableCell data-label="Format">{row.format}</TableCell><TableCell data-label="Note" className="wrap-cell">{row.note}</TableCell></TableRow>)}</TableBody></Table></div>
      </TabsContent>
    </Tabs>
  </section>;
}
