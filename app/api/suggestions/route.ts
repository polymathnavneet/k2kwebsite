import { readObject } from "@/lib/http";
import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { routeSuggestions } from "@/db/schema";
import { mirrorRoute } from "@/lib/mirror";
import { insertionKm } from "@/lib/route-math";
import { clamp, clean, isAdmin } from "@/lib/server";
import { loadStops } from "@/lib/tracking";

/**
 * GET  /api/suggestions -> places the site has spotted and wants confirmed
 * POST /api/suggestions -> accept one (adding it to the route) or dismiss it
 *
 * The site never edits the route on its own. It notices, it asks, and it waits.
 * A detour round a closed bridge should not quietly rewrite the plan, and a bad
 * GPS fix in a tunnel should not invent a town.
 */

export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const rows = await db
    .select()
    .from(routeSuggestions)
    .where(eq(routeSuggestions.status, "pending"))
    .orderBy(desc(routeSuggestions.createdAt))
    .limit(50);
  return Response.json({ rows });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await readObject(request);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const id = clean(body.id, 80);
  const action = clean(body.action, 20);
  const db = getDb();

  const [suggestion] = await db.select().from(routeSuggestions).where(eq(routeSuggestions.id, id)).limit(1);
  if (!suggestion) return Response.json({ error: "That suggestion is no longer there." }, { status: 404 });
  if (suggestion.status !== "pending") return Response.json({ error: "That one has already been decided." }, { status: 409 });

  const now = new Date().toISOString();

  if (action === "dismiss") {
    await db.update(routeSuggestions).set({ status: "dismissed", decidedAt: now }).where(eq(routeSuggestions.id, id));
    return Response.json({ ok: true, dismissed: true });
  }

  if (action !== "accept") return Response.json({ error: "Unknown action" }, { status: 400 });

  // Navneet can correct the name or the distance before saying yes.
  const name = clean(body.name, 80) || suggestion.name;
  const state = clean(body.state, 80) || suggestion.state;
  const note = clean(body.note, 260) || "Added from the road.";
  const stops = await loadStops(db);

  const requestedKm = body.km == null || body.km === "" ? suggestion.km : Math.round(clamp(body.km, 0, 10000));
  const km = insertionKm(stops, requestedKm);
  if (km === null) {
    return Response.json({
      error: "There is no room at that distance - two stops either side are already next to each other. Change the distance and try again.",
    }, { status: 400 });
  }

  if (stops.length >= 120) {
    return Response.json({ error: "The route is already at its 120-stop limit." }, { status: 400 });
  }

  const next = [...stops, { name, state, lat: suggestion.lat, lon: suggestion.lon, km, note }]
    .sort((a, b) => a.km - b.km);

  const runtime = env as unknown as { DB: D1Database };
  await runtime.DB.batch([
    runtime.DB.prepare("DELETE FROM route_stops"),
    ...next.map((stop, index) => runtime.DB.prepare(
      "INSERT INTO route_stops (sort_order, name, state, lat, lon, km, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(index, stop.name, stop.state, stop.lat, stop.lon, stop.km, stop.note)),
    runtime.DB.prepare("UPDATE route_config SET total_distance = ?, updated_at = ? WHERE id = 1")
      .bind(next[next.length - 1].km, now),
    runtime.DB.prepare("UPDATE route_suggestions SET status = 'accepted', decided_at = ? WHERE id = ?").bind(now, id),
  ]);

  await mirrorRoute(db);

  const position = next.findIndex(stop => stop.km === km) + 1;
  return Response.json({
    ok: true,
    added: { name, state, km, position },
    stops: next.length,
    totalDistance: next[next.length - 1].km,
  });
}
