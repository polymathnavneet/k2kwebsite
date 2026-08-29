import { asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { routeConfig, routeStops } from "@/db/schema";
import { defaultRoute } from "@/lib/defaults";
import { mirrorRoute } from "@/lib/mirror";
import { clamp, clean, isAdmin } from "@/lib/server";

export async function GET() {
  const db = getDb();
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  if (!config) return Response.json(defaultRoute);
  const stops = await db
    .select({ name: routeStops.name, state: routeStops.state, lat: routeStops.lat, lon: routeStops.lon, km: routeStops.km, note: routeStops.note })
    .from(routeStops)
    .orderBy(asc(routeStops.sortOrder));
  return Response.json({ ...config, stops });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!Array.isArray(body.stops) || body.stops.length < 2 || body.stops.length > 120) {
    return Response.json({ error: "The route needs between 2 and 120 stops." }, { status: 400 });
  }
  let previous = -1;
  try {
    const stops = body.stops.map((item, index) => {
      const stop = item as Record<string, unknown>;
      const km = Math.round(clamp(stop.km, 0, 10000));
      if (km < previous) throw new Error("Route kilometres must increase.");
      previous = km;
      const name = clean(stop.name, 80);
      if (!name) throw new Error("Every stop needs a city name.");
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
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate)) ? String(body.startDate) : defaultRoute.startDate;
    const pace = clamp(body.paceKmPerDay, 5, 60, 25);
    const now = new Date().toISOString();
    const runtime = env as unknown as { DB: D1Database };
    const statements = [
      runtime.DB.prepare("DELETE FROM route_stops"),
      runtime.DB.prepare("INSERT INTO route_config (id, title, start_date, pace_km_per_day, total_distance, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, start_date=excluded.start_date, pace_km_per_day=excluded.pace_km_per_day, total_distance=excluded.total_distance, updated_at=excluded.updated_at")
        .bind("A Long Walk", startDate, pace, stops.at(-1)!.km, now),
      ...stops.map(stop => runtime.DB.prepare("INSERT INTO route_stops (sort_order, name, state, lat, lon, km, note) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(stop.sortOrder, stop.name, stop.state, stop.lat, stop.lon, stop.km, stop.note)),
    ];
    await runtime.DB.batch(statements);
    await mirrorRoute(getDb());
    return Response.json({ ok: true, route: { title: "A Long Walk", startDate, paceKmPerDay: pace, totalDistance: stops.at(-1)!.km, updatedAt: now, stops } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save route" }, { status: 400 });
  }
}
