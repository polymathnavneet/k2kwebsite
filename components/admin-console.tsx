"use client";

import { useEffect, useState } from "react";
import { ArrowUp, CloudDownload, Download, LocateFixed, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import type { Journey, PublicMessage, RouteStop, RouteSuggestion, WalkRoute } from "@/lib/types";

type AdminMessage = PublicMessage & { contact: string };
type BookRow = { id: string; name: string; contact: string; city: string; format: string; note: string; createdAt: string };

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
  const [githubReady, setGithubReady] = useState(false);
  const [busyRow, setBusyRow] = useState("");
  const [rowNote, setRowNote] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const [edits, setEdits] = useState<Record<string, { name: string; km: string }>>({});

  async function request<T>(url: string, options: RequestInit = {}) {
    const cleanToken = token.trim();
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), "x-admin-token": cleanToken } });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  }

  async function loadAll() {
    setStatus("Syncing…");
    try {
      const [journeyData, routeData, messageData, bookData] = await Promise.all([
        fetch("/api/journey").then(response => response.json()),
        fetch("/api/route").then(response => response.json()),
        request<{ rows: AdminMessage[] }>("/api/messages?admin=1"),
        request<{ rows: BookRow[] }>("/api/book?admin=1"),
      ]);
      const pending = await request<{ rows: RouteSuggestion[] }>("/api/suggestions").catch(() => ({ rows: [] }));
      setSuggestions(pending.rows || []);
      setJourney(journeyData); setRoute(routeData); setMessages(messageData.rows); setBooks(bookData.rows);
      // Keep whatever is already typed; only fill in boxes that are untouched,
      // so a reload never throws away a half-written reply.
      setReplies(current => Object.fromEntries(messageData.rows.map(row =>
        [row.id, current[row.id] !== undefined ? current[row.id] : (row.reply || "")])));
      setToken(token.trim()); setConnected(true); localStorage.setItem("alw-admin-token", token.trim());
      setStatus(`Synced · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) { setConnected(false); setStatus(error instanceof Error ? `${error.message}. Check the passcode.` : "Could not connect"); }
  }

  useEffect(() => {
    fetch("/api/sync").then(response => response.json()).then(data => setGithubReady(Boolean(data.enabled))).catch(() => {});
  }, []);

  // Sync a GPS fix. The server measures it against the last one and moves the
  // distance walked by itself, so every arrival date recalculates.
  function syncGps() {
    if (!navigator.geolocation) return setStatus("GPS is unavailable on this device.");
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const result = await request<{ reason: string; journey: Journey; suggestion: RouteSuggestion | null }>("/api/gps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: position.coords.latitude, lon: position.coords.longitude }),
        });
        setJourney(result.journey);
        setStatus(result.reason);
        // A new place found on the road becomes a question, not a silent edit.
        if (result.suggestion) setSuggestions(current => [result.suggestion as RouteSuggestion, ...current]);
      } catch (error) { setStatus(error instanceof Error ? error.message : "Could not sync GPS"); }
    }, error => setStatus(error.message), { enableHighAccuracy: true, timeout: 15000 });
  }

  // Pull hand-edited data/*.json out of the repository and make it live.
  async function pullFromGithub() {
    setStatus("Pulling edits from GitHub…");
    try {
      const result = await request<{ applied: string[]; problems: string[] }>("/api/sync", { method: "POST" });
      await loadAll();
      setStatus(result.problems.length
        ? `Problems: ${result.problems.join(" · ")}`
        : result.applied.length ? `Pulled from GitHub: ${result.applied.join(" · ")}` : "GitHub had nothing new.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not pull from GitHub"); }
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
      setStatus(action === "accept" && result.added
        ? `${result.added.name} added to the route at ${result.added.km.toLocaleString("en-IN")} km. Every date after it has recalculated.`
        : "Dismissed. The route is unchanged.");
      if (action === "accept") {
        const fresh = await fetch("/api/route").then(response => response.json());
        setRoute(fresh);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save that"); }
    finally { setBusyRow(""); }
  }

  async function saveJourney() {
    setStatus("Publishing journey update…");
    try { await request("/api/journey", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(journey) }); setStatus("Journey update is live."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not publish"); }
  }

  function editStop(index: number, key: keyof RouteStop, value: string) {
    setRoute(current => ({ ...current, stops: current.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, [key]: ["lat", "lon", "km"].includes(key) ? Number(value) : value } : stop) }));
  }

  async function saveRoute() {
    setStatus("Publishing route…");
    try { const result = await request<{ route: WalkRoute }>("/api/route", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(route) }); setRoute(result.route); setStatus("Route is live. Every arrival date recalculated."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not publish route"); }
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
      setStatus(said);
    } catch (error) {
      const said = error instanceof Error ? error.message : "Could not save that";
      setRowNote(current => ({ ...current, [id]: said }));
      setStatus(said);
    } finally {
      setBusyRow("");
    }
  }

  function exportCsv(kind: "messages" | "book") {
    const rows = kind === "messages" ? messages : books;
    if (!rows.length) return;
    const keys = kind === "messages" ? ["createdAt", "type", "name", "place", "message", "contact", "status", "reply"] : ["createdAt", "name", "contact", "city", "format", "note"];
    const csv = [keys.join(","), ...rows.map(row => keys.map(key => `"${String((row as unknown as Record<string, unknown>)[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `a-long-walk-${kind}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  if (!connected) return <section className="admin-login"><h1>Your walk.<br />One control room.</h1><p>Use the private passcode once. It stays only on this phone. Extra spaces are ignored.</p><Input type="password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} placeholder="Private passcode" /><Button onClick={loadAll} disabled={token.trim().length < 8}>Open control room</Button><p role="status">{status}</p></section>;

  return <section className="admin-app">
    <div className="admin-bar"><div><b>A LONG WALK</b><span>{status}</span></div><Button variant="outline" onClick={loadAll}><RefreshCw /> Refresh</Button>{githubReady && <Button variant="outline" onClick={pullFromGithub}><CloudDownload /> Pull edits from GitHub</Button>}<Button variant="outline" onClick={() => { localStorage.removeItem("alw-admin-token"); setConnected(false); setToken(""); }}>Change passcode</Button></div>
    <Tabs defaultValue="journey">
      <TabsList className="admin-tabs"><TabsTrigger value="journey">Journey</TabsTrigger><TabsTrigger value="route">Route</TabsTrigger><TabsTrigger value="messages">Messages {messages.length ? `(${messages.length})` : ""}</TabsTrigger><TabsTrigger value="book">Book {books.length ? `(${books.length})` : ""}</TabsTrigger></TabsList>
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
      <TabsContent value="route" className="admin-panel"><div className="admin-heading"><div><h2>Dynamic route sheet</h2><p>Edit once; the map and every city date update.</p></div><Button onClick={saveRoute}>Publish route</Button></div><div className="route-controls"><label>START DATE<Input type="date" value={route.startDate} onChange={event => setRoute(value => ({ ...value, startDate: event.target.value }))} /></label><label>PACE KM/DAY<Input type="number" value={route.paceKmPerDay} onChange={event => setRoute(value => ({ ...value, paceKmPerDay: Number(event.target.value) }))} /></label><Button variant="outline" onClick={() => setRoute(value => ({ ...value, stops: [...value.stops, { name: "New stop", state: "", lat: value.stops.at(-1)?.lat || 0, lon: value.stops.at(-1)?.lon || 0, km: (value.stops.at(-1)?.km || 0) + 100, note: "" }] }))}><Plus /> Add stop</Button></div><div className="route-editor">{route.stops.map((stop, index) => <article key={`${stop.name}-${index}`}><header><b>{String(index + 1).padStart(2, "0")}</b><div><Button size="icon" variant="ghost" disabled={index === 0} onClick={() => setRoute(value => { const stops = [...value.stops]; [stops[index - 1], stops[index]] = [stops[index], stops[index - 1]]; return { ...value, stops }; })}><ArrowUp /></Button><Button size="icon" variant="ghost" disabled={route.stops.length <= 2} onClick={() => setRoute(value => ({ ...value, stops: value.stops.filter((_, stopIndex) => stopIndex !== index) }))}><Trash2 /></Button></div></header><div><label>CITY<Input value={stop.name} onChange={event => editStop(index, "name", event.target.value)} /></label><label>STATE<Input value={stop.state} onChange={event => editStop(index, "state", event.target.value)} /></label><label>LATITUDE<Input type="number" step=".0001" value={stop.lat} onChange={event => editStop(index, "lat", event.target.value)} /></label><label>LONGITUDE<Input type="number" step=".0001" value={stop.lon} onChange={event => editStop(index, "lon", event.target.value)} /></label><label>ROUTE KM<Input type="number" value={stop.km} onChange={event => editStop(index, "km", event.target.value)} /></label><label className="wide">PUBLIC NOTE<Input value={stop.note} onChange={event => editStop(index, "note", event.target.value)} /></label></div></article>)}</div><Button className="admin-save-mobile" onClick={saveRoute}>Publish route</Button>
      </TabsContent>
      <TabsContent value="messages" className="admin-panel"><div className="admin-heading"><div><h2>Public reply sheet</h2><p>Type a reply and press Reply — it appears under the message on the public wall straight away. Yellow cells are private and never published.</p></div><Button variant="outline" onClick={() => exportCsv("messages")}><Download /> Export CSV</Button></div><div className="admin-table"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Message</TableHead><TableHead>Private contact</TableHead><TableHead>Status</TableHead><TableHead>Public reply</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{messages.map(row => <TableRow key={row.id}><TableCell data-label="Date">{new Date(row.createdAt).toLocaleDateString("en-IN")}</TableCell><TableCell data-label="Type">{row.type}</TableCell><TableCell data-label="Name">{row.name}<small>{row.place}</small></TableCell><TableCell data-label="Message" className="wrap-cell">{row.message}</TableCell><TableCell data-label="Private contact" className="private-cell">{row.contact}</TableCell><TableCell data-label="Status"><span className={`status-chip ${row.status}`}>{row.status === "public" ? "On the wall" : row.status === "hidden" ? "Hidden" : "Held"}</span></TableCell><TableCell data-label="Public reply"><Textarea value={replies[row.id] || ""} onChange={event => setReplies(value => ({ ...value, [row.id]: event.target.value }))} /></TableCell><TableCell data-label="Actions"><div className="table-actions"><Button disabled={busyRow === row.id} onClick={() => messageAction(row.id, "reply")}>{busyRow === row.id ? "Saving…" : row.reply ? "Update reply" : "Reply"}</Button>{row.status !== "public" && <Button variant="outline" disabled={busyRow === row.id} onClick={() => messageAction(row.id, "publish")}>Put on the wall</Button>}{row.status !== "hidden" && <Button variant="destructive" disabled={busyRow === row.id} onClick={() => messageAction(row.id, "hide")}>Hide</Button>}</div>{rowNote[row.id] && <p className="row-note" role="status">{rowNote[row.id]}</p>}</TableCell></TableRow>)}</TableBody></Table></div>
      </TabsContent>
      <TabsContent value="book" className="admin-panel"><div className="admin-heading"><div><h2>Book pre-registration sheet</h2><p>Private contact details are visible only here.</p></div><Button variant="outline" onClick={() => exportCsv("book")}><Download /> Export CSV</Button></div><div className="admin-table"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Private contact</TableHead><TableHead>City</TableHead><TableHead>Format</TableHead><TableHead>Note</TableHead></TableRow></TableHeader><TableBody>{books.map(row => <TableRow key={row.id}><TableCell data-label="Date">{new Date(row.createdAt).toLocaleDateString("en-IN")}</TableCell><TableCell data-label="Name">{row.name}</TableCell><TableCell data-label="Private contact" className="private-cell">{row.contact}</TableCell><TableCell data-label="City">{row.city}</TableCell><TableCell data-label="Format">{row.format}</TableCell><TableCell data-label="Note" className="wrap-cell">{row.note}</TableCell></TableRow>)}</TableBody></Table></div>
      </TabsContent>
    </Tabs>
  </section>;
}
