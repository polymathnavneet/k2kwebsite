"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, CloudDownload, Download, LocateFixed, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { JournalEntry, Journey, MediaItem, PublicMessage, RouteStop, RouteSuggestion, WalkRoute } from "@/lib/types";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/embed";
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
  const [mirrorsBack, setMirrorsBack] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [flash, setFlash] = useState("");
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

  async function request<T>(url: string, options: RequestInit = {}) {
    const cleanToken = token.trim();
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), "x-admin-token": cleanToken } });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
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
      const diary = await request<{ rows: JournalEntry[] }>("/api/journal?admin=1").catch(() => null);
      if (diary) setEntries(diary.rows || []);
      setJourney(journeyData); setRoute(routeData); setMessages(messageData.rows); setBooks(bookData.rows);
      // Keep whatever is already typed; only fill in boxes that are untouched,
      // so a reload never throws away a half-written reply.
      setReplies(current => Object.fromEntries(messageData.rows.map(row =>
        [row.id, current[row.id] !== undefined ? current[row.id] : (row.reply || "")])));
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

  // Sync a GPS fix. The server measures it against the last one and moves the
  // distance walked by itself, so every arrival date recalculates.
  function syncGps() {
    if (!navigator.geolocation) return say("GPS is unavailable on this device.");
    say("Finding your location…");
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const result = await request<{ reason: string; journey: Journey; suggestion: RouteSuggestion | null }>("/api/gps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: position.coords.latitude, lon: position.coords.longitude }),
        });
        setJourney(result.journey);
        say(result.reason);
        // The phone is already in your hand and you have just looked at it.
        // That is the moment a question actually gets answered.
        setAskMind({ place: result.journey.currentPlace || "here", reason: result.reason });
        setMind("");
        // A new place found on the road becomes a question, not a silent edit.
        if (result.suggestion) setSuggestions(current => [result.suggestion as RouteSuggestion, ...current]);
      } catch (error) { say(error instanceof Error ? error.message : "Could not sync GPS"); }
    }, error => say(error.message), { enableHighAccuracy: true, timeout: 15000 });
  }

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

  async function saveJourney() {
    say("Publishing journey update…");
    try { await request("/api/journey", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(journey) }); say("Journey update is live."); }
    catch (error) { say(error instanceof Error ? error.message : "Could not publish"); }
  }

  function editStop(index: number, key: keyof RouteStop, value: string) {
    setRoute(current => ({ ...current, stops: current.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, [key]: ["lat", "lon", "km"].includes(key) ? Number(value) : value } : stop) }));
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

  async function saveRoute() {
    say("Publishing route…");
    try { const result = await request<{ route: WalkRoute }>("/api/route", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(route) }); setRoute(result.route); say("Route is live. Every arrival date recalculated."); }
    catch (error) { say(error instanceof Error ? error.message : "Could not publish route"); }
  }

  async function messageAction(id: string, action: "reply" | "publish" | "hide") {
    const reply = (replies[id] || "").trim();

    // Catch the empty-reply case here rather than making the person wait for a
    // round trip to be told the same thing in a status line they cannot see.
    if (action === "reply" && !reply) {
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

      // Update just this row. Reloading everything used to be the only feedback,
      // and on a phone it looked like nothing had happened at all.
      const now = new Date().toISOString();
      setMessages(current => current.map(row => row.id !== id ? row : {
        ...row,
        ...(action === "reply" ? { reply, status: "public", repliedAt: now } : {}),
        ...(action === "publish" ? { status: "public" } : {}),
        ...(action === "hide" ? { status: "hidden" } : {}),
      }));

      const said = action === "reply" ? "Reply published. It is on the public wall now."
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
    const keys = kind === "messages" ? ["createdAt", "type", "name", "place", "message", "contact", "status", "reply"] : ["createdAt", "name", "contact", "city", "format", "note"];
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
      <TabsList className="admin-tabs"><TabsTrigger value="journey">Journey</TabsTrigger><TabsTrigger value="route">Route</TabsTrigger><TabsTrigger value="plan">Before the walk</TabsTrigger><TabsTrigger value="messages">Messages {messages.length ? `(${messages.length})` : ""}</TabsTrigger><TabsTrigger value="journal">Journal {entries.length ? `(${entries.length})` : ""}</TabsTrigger><TabsTrigger value="media">Pictures {gallery.length ? `(${gallery.length})` : ""}</TabsTrigger><TabsTrigger value="book">Book {books.length ? `(${books.length})` : ""}</TabsTrigger></TabsList>
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
    <TabsContent value="journey" className="admin-panel"><div className="admin-heading"><div><h2>Quick journey update</h2><p>Only the essentials are above the fold on your phone.</p></div><Button onClick={saveJourney}>Publish update</Button></div>
        <div className="progress-strip"><div><small>ALONG THE ROUTE</small><strong>{Math.round(journey.routeProgressKm ?? 0).toLocaleString("en-IN")} km</strong></div><div><small>WALKED</small><strong>{Math.round(journey.distanceTotal).toLocaleString("en-IN")} km</strong></div><div><small>OFF THE LINE</small><strong className={(journey.offRouteKm ?? 0) > 12 ? "off" : ""}>{Math.round(journey.offRouteKm ?? 0)} km</strong></div><div><small>NEXT STOP</small><strong>{route.stops.find(stop => stop.km > (journey.routeProgressKm ?? 0))?.name ?? "Finished"}</strong></div></div><div className="status-presets">{["Walking", "Resting", "Eating", "Sleeping", "Filming", "Need help"].map(value => <button className={journey.status === value ? "active" : ""} key={value} onClick={() => setJourney(current => ({ ...current, status: value }))}>{value}</button>)}</div>
        <div className="admin-form-grid"><label>MODE<NativeSelect value={journey.mode} onChange={event => setJourney(value => ({ ...value, mode: event.target.value as Journey["mode"] }))}><NativeSelectOption value="preparation">Preparation</NativeSelectOption><NativeSelectOption value="live">Live walk</NativeSelectOption></NativeSelect></label><label>DAY<Input type="number" value={journey.day} onChange={event => setJourney(value => ({ ...value, day: Number(event.target.value) }))} /></label><label>DISTANCE TODAY (KM)<Input type="number" step=".1" value={journey.distanceToday} onChange={event => setJourney(value => ({ ...value, distanceToday: Number(event.target.value) }))} /></label><label>TOTAL DISTANCE (KM)<Input type="number" step=".1" value={journey.distanceTotal} onChange={event => setJourney(value => ({ ...value, distanceTotal: Number(event.target.value) }))} /></label><label className="wide">CURRENT PLACE<Input value={journey.currentPlace} onChange={event => setJourney(value => ({ ...value, currentPlace: event.target.value }))} /></label><Button className="wide" variant="outline" onClick={syncGps}><LocateFixed /> Sync GPS &amp; add distance</Button><label>STEPS<Input type="number" value={journey.stepsToday} onChange={event => setJourney(value => ({ ...value, stepsToday: Number(event.target.value) }))} /></label><label>WALKING MINUTES<Input type="number" value={journey.walkingMinutes} onChange={event => setJourney(value => ({ ...value, walkingMinutes: Number(event.target.value) }))} /></label><label>WEATHER °C<Input type="number" value={journey.temperature ?? ""} onChange={event => setJourney(value => ({ ...value, temperature: event.target.value ? Number(event.target.value) : null }))} /></label><label>BATTERY %<Input type="number" value={journey.battery ?? ""} onChange={event => setJourney(value => ({ ...value, battery: event.target.value ? Number(event.target.value) : null }))} /></label><label>CONNECTION<Input value={journey.connectivity} onChange={event => setJourney(value => ({ ...value, connectivity: event.target.value }))} /></label><label>LAST SLEPT<Input value={journey.lastSleep} onChange={event => setJourney(value => ({ ...value, lastSleep: event.target.value }))} /></label><label className="wide">LATEST STORY TITLE<Input value={journey.latestTitle} onChange={event => setJourney(value => ({ ...value, latestTitle: event.target.value }))} /></label><label className="wide">LATEST STORY SUMMARY<Textarea value={journey.latestText} onChange={event => setJourney(value => ({ ...value, latestText: event.target.value }))} /></label></div><Button className="admin-save-mobile" onClick={saveJourney}>Publish journey update</Button>
      </TabsContent>
      <TabsContent value="plan" className="admin-panel"><div className="admin-heading"><div><h2>Before the first step</h2><p>The run-up on the homepage, counting itself down. The last date is the day the walk starts — change it and every arrival date on the route moves with it.</p></div><Button onClick={savePlan}>Publish the plan</Button></div><div className="route-controls"><Button variant="outline" onClick={() => setPlan(current => [...current, { date: current.at(-1)?.date ?? route.startDate, title: "New step", detail: "" }])}><Plus /> Add a step</Button></div><div className="route-editor">{plan.map((step, index) => <article key={index}><header><b>{String(index + 1).padStart(2, "0")}{index === plan.length - 1 ? " · THE FIRST STEP" : ""}</b><div><Button size="icon" variant="ghost" disabled={plan.length <= 1} onClick={() => setPlan(current => current.filter((_, stepIndex) => stepIndex !== index))}><Trash2 /></Button></div></header><div><label>DATE<Input type="date" value={step.date} onChange={event => editPlan(index, "date", event.target.value)} /></label><label>TITLE<Input value={step.title} onChange={event => editPlan(index, "title", event.target.value)} /></label><label className="wide">WHAT HAPPENS<Input value={step.detail} onChange={event => editPlan(index, "detail", event.target.value)} /></label></div></article>)}</div><Button className="admin-save-mobile" onClick={savePlan}>Publish the plan</Button>
      </TabsContent>

      <TabsContent value="route" className="admin-panel"><div className="admin-heading"><div><h2>Dynamic route sheet</h2><p>Edit once; the map and every city date update.</p></div><Button onClick={saveRoute}>Publish route</Button></div><div className="route-controls"><label>START DATE<Input type="date" value={route.startDate} onChange={event => setRoute(value => ({ ...value, startDate: event.target.value }))} /></label><label>PACE KM/DAY<Input type="number" value={route.paceKmPerDay} onChange={event => setRoute(value => ({ ...value, paceKmPerDay: Number(event.target.value) }))} /></label><Button variant="outline" onClick={() => setRoute(value => ({ ...value, stops: [...value.stops, { name: "New stop", state: "", lat: value.stops.at(-1)?.lat || 0, lon: value.stops.at(-1)?.lon || 0, km: (value.stops.at(-1)?.km || 0) + 100, note: "" }] }))}><Plus /> Add stop</Button></div><div className="route-editor">{route.stops.map((stop, index) => <article key={`${stop.name}-${index}`}><header><b>{String(index + 1).padStart(2, "0")}</b><div><Button size="icon" variant="ghost" disabled={index === 0} onClick={() => setRoute(value => { const stops = [...value.stops]; [stops[index - 1], stops[index]] = [stops[index], stops[index - 1]]; return { ...value, stops }; })}><ArrowUp /></Button><Button size="icon" variant="ghost" disabled={route.stops.length <= 2} onClick={() => setRoute(value => ({ ...value, stops: value.stops.filter((_, stopIndex) => stopIndex !== index) }))}><Trash2 /></Button></div></header><div><label>CITY<Input value={stop.name} onChange={event => editStop(index, "name", event.target.value)} /></label><label>STATE<Input value={stop.state} onChange={event => editStop(index, "state", event.target.value)} /></label><label>LATITUDE<Input type="number" step=".0001" value={stop.lat} onChange={event => editStop(index, "lat", event.target.value)} /></label><label>LONGITUDE<Input type="number" step=".0001" value={stop.lon} onChange={event => editStop(index, "lon", event.target.value)} /></label><label>ROUTE KM<Input type="number" value={stop.km} onChange={event => editStop(index, "km", event.target.value)} /></label><label className="wide">PUBLIC NOTE<Input value={stop.note} onChange={event => editStop(index, "note", event.target.value)} /></label></div></article>)}</div><Button className="admin-save-mobile" onClick={saveRoute}>Publish route</Button>
      </TabsContent>
      <TabsContent value="messages" className="admin-panel"><div className="admin-heading"><div><h2>Public reply sheet</h2><p>Type a reply and press Reply — it appears under the message on the public wall straight away. Yellow cells are private and never published.</p></div><Button variant="outline" onClick={() => exportCsv("messages")}><Download /> Export CSV</Button></div><div className="admin-table"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Message</TableHead><TableHead>Private contact</TableHead><TableHead>Status</TableHead><TableHead>Public reply</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{messages.map(row => <TableRow key={row.id}><TableCell data-label="Date">{new Date(row.createdAt).toLocaleDateString("en-IN")}</TableCell><TableCell data-label="Type">{row.type}</TableCell><TableCell data-label="Name">{row.name}<small>{row.place}</small></TableCell><TableCell data-label="Message" className="wrap-cell">{row.message}</TableCell><TableCell data-label="Private contact" className="private-cell">{row.contact}</TableCell><TableCell data-label="Status"><span className={`status-chip ${row.status}`}>{row.status === "public" ? "On the wall" : row.status === "hidden" ? "Hidden" : "Held"}</span></TableCell><TableCell data-label="Public reply"><Textarea value={replies[row.id] || ""} onChange={event => setReplies(value => ({ ...value, [row.id]: event.target.value }))} /></TableCell><TableCell data-label="Actions"><div className="table-actions"><Button disabled={busyRow === row.id} onClick={() => messageAction(row.id, "reply")}>{busyRow === row.id ? "Saving…" : row.reply ? "Update reply" : "Reply"}</Button>{row.status !== "public" && <Button variant="outline" disabled={busyRow === row.id} onClick={() => messageAction(row.id, "publish")}>Put on the wall</Button>}{row.status !== "hidden" && <Button variant="destructive" disabled={busyRow === row.id} onClick={() => messageAction(row.id, "hide")}>Hide</Button>}</div>{rowNote[row.id] && <p className="row-note" role="status">{rowNote[row.id]}</p>}</TableCell></TableRow>)}</TableBody></Table></div>
      </TabsContent>
      <TabsContent value="journal" className="admin-panel">
        <div className="admin-heading"><div><h2>Field notes</h2><p>Answering the daily question above publishes here straight away. Answering twice in one day replaces that day&apos;s entry rather than adding a second.</p></div></div>
        <div className="media-admin">
          {entries.map(entry => <div className="row" key={entry.id}>
            <div className="top"><b>{entry.day}</b>{entry.place && <span>{entry.place}</span>}</div>
            <div style={{ fontSize: 12, opacity: .65 }}>{entry.question}</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{entry.body}</div>
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
      <TabsContent value="book" className="admin-panel"><div className="admin-heading"><div><h2>Book pre-registration sheet</h2><p>Private contact details are visible only here.</p></div><Button variant="outline" onClick={() => exportCsv("book")}><Download /> Export CSV</Button></div><div className="admin-table"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Private contact</TableHead><TableHead>City</TableHead><TableHead>Format</TableHead><TableHead>Note</TableHead></TableRow></TableHeader><TableBody>{books.map(row => <TableRow key={row.id}><TableCell data-label="Date">{new Date(row.createdAt).toLocaleDateString("en-IN")}</TableCell><TableCell data-label="Name">{row.name}</TableCell><TableCell data-label="Private contact" className="private-cell">{row.contact}</TableCell><TableCell data-label="City">{row.city}</TableCell><TableCell data-label="Format">{row.format}</TableCell><TableCell data-label="Note" className="wrap-cell">{row.note}</TableCell></TableRow>)}</TableBody></Table></div>
      </TabsContent>
    </Tabs>
  </section>;
}
