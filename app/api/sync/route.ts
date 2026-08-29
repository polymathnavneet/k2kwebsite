import { eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { journey, messages, routeConfig, routeStops } from "@/db/schema";
import { githubEnabled, readData } from "@/lib/github";
import { mirrorBook, mirrorJourney, mirrorMessages, mirrorRoute } from "@/lib/mirror";
import { clamp, clean, isAdmin, publicText } from "@/lib/server";
import type { Journey, WalkRoute } from "@/lib/types";

/**
 * GET  /api/sync -> is the GitHub bridge switched on?
 * POST /api/sync -> pull `data/*.json` out of the repository and into the site.
 *
 * This is the half that makes the repository editable. Anyone with access -
 * Navneet, Claude, ChatGPT - can change a route stop or write a reply directly
 * in `data/route.json` or `data/messages.json`, then press "Pull edits from
 * GitHub" in the admin panel to make it live.
 *
 * Messages are matched by id and only their reply and status are taken. New
 * messages are never invented from a file, so an edit cannot fabricate someone.
 */

export async function GET() {
  return Response.json({ enabled: githubEnabled() });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!githubEnabled()) {
    return Response.json({ error: "Set GITHUB_TOKEN in the hosting environment to sync with GitHub." }, { status: 503 });
  }

  const db = getDb();
  const applied: string[] = [];
  const problems: string[] = [];

  /* ------------------------------------------------------------------ route */
  try {
    const { data } = await readData<WalkRoute>("route");
    if (data && Array.isArray(data.stops) && data.stops.length >= 2) {
      let previous = -1;
      const stops = data.stops.map((stop, index) => {
        const km = Math.round(clamp(stop.km, 0, 10000));
        if (km < previous) throw new Error("route.json: kilometres must increase down the list");
        previous = km;
        const name = clean(stop.name, 80);
        if (!name) throw new Error("route.json: every stop needs a name");
        return {
          sortOrder: index,
          name,
          state: clean(stop.state, 80),
          lat: clamp(stop.lat, -90, 90),
          lon: clamp(stop.lon, -180, 180),
          km,
          note: clean(stop.note, 260),
        };
      });

      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.startDate)) ? String(data.startDate) : null;
      if (!startDate) throw new Error("route.json: startDate must look like 2026-12-17");
      const pace = clamp(data.paceKmPerDay, 5, 60, 25);
      const now = new Date().toISOString();
      const runtime = env as unknown as { DB: D1Database };

      await runtime.DB.batch([
        runtime.DB.prepare("DELETE FROM route_stops"),
        runtime.DB.prepare("INSERT INTO route_config (id, title, start_date, pace_km_per_day, total_distance, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, start_date=excluded.start_date, pace_km_per_day=excluded.pace_km_per_day, total_distance=excluded.total_distance, updated_at=excluded.updated_at")
          .bind(clean(data.title, 80) || "A Long Walk", startDate, pace, stops.at(-1)!.km, now),
        ...stops.map(stop => runtime.DB.prepare("INSERT INTO route_stops (sort_order, name, state, lat, lon, km, note) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(stop.sortOrder, stop.name, stop.state, stop.lat, stop.lon, stop.km, stop.note)),
      ]);
      applied.push(`route (${stops.length} stops, ${stops.at(-1)!.km.toLocaleString("en-IN")} km)`);
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "route.json could not be read");
  }

  /* --------------------------------------------------------------- messages */
  try {
    const { data } = await readData<{ messages?: { id?: string; reply?: string; status?: string }[] }>("messages");
    const rows = Array.isArray(data?.messages) ? data.messages : [];
    if (rows.length) {
      const ids = rows.map(row => clean(row.id, 80)).filter(Boolean);
      const existing = ids.length
        ? await db.select({ id: messages.id, reply: messages.reply, status: messages.status }).from(messages).where(inArray(messages.id, ids))
        : [];
      const byId = new Map(existing.map(row => [row.id, row]));

      let changed = 0;
      for (const row of rows) {
        const id = clean(row.id, 80);
        const current = byId.get(id);
        if (!current) continue;

        const reply = publicText(row.reply ?? "");
        const status = ["public", "held", "hidden"].includes(String(row.status)) ? String(row.status) : current.status;
        if (reply === current.reply && status === current.status) continue;

        await db.update(messages)
          .set({ reply, status, ...(reply && reply !== current.reply ? { repliedAt: new Date().toISOString() } : {}) })
          .where(eq(messages.id, id));
        changed += 1;
      }
      if (changed) applied.push(`${changed} message${changed === 1 ? "" : "s"} updated`);
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "messages.json could not be read");
  }

  /* ---------------------------------------------------------------- journey */
  try {
    const { data } = await readData<Journey>("journey");
    if (data && typeof data === "object") {
      const patch = {
        id: 1,
        mode: data.mode === "live" ? "live" : "preparation",
        status: clean(data.status, 40) || "Walking",
        day: Math.round(clamp(data.day, 0, 365)),
        distanceToday: clamp(data.distanceToday, 0, 100),
        distanceTotal: clamp(data.distanceTotal, 0, 10000),
        stepsToday: Math.round(clamp(data.stepsToday, 0, 200000)),
        walkingMinutes: Math.round(clamp(data.walkingMinutes, 0, 1440)),
        currentPlace: clean(data.currentPlace, 100),
        lat: clamp(data.lat, -90, 90),
        lon: clamp(data.lon, -180, 180),
        temperature: data.temperature == null ? null : clamp(data.temperature, -50, 60),
        altitude: data.altitude == null ? null : clamp(data.altitude, -500, 9000),
        battery: data.battery == null ? null : Math.round(clamp(data.battery, 0, 100)),
        connectivity: clean(data.connectivity, 50),
        lastSleep: clean(data.lastSleep, 100),
        latestTitle: clean(data.latestTitle, 140),
        latestText: clean(data.latestText, 500),
        latestUrl: clean(data.latestUrl, 240) || "/journal",
        sponsorName: clean(data.sponsorName, 100),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(journey).values(patch).onConflictDoUpdate({ target: journey.id, set: patch });
      applied.push("journey status");
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "journey.json could not be read");
  }

  // Write everything back, so the files reflect exactly what the site now holds.
  await Promise.all([mirrorRoute(db), mirrorMessages(db), mirrorJourney(db), mirrorBook(db)]);

  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const stopCount = (await db.select({ id: routeStops.id }).from(routeStops)).length;

  return Response.json({
    ok: problems.length === 0,
    applied,
    problems,
    route: config ? { startDate: config.startDate, totalDistance: config.totalDistance, stops: stopCount } : null,
  });
}
