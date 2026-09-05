import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { routeConfig } from "@/db/schema";
import { defaultRoute } from "@/lib/defaults";
import { recordGpsPlace } from "@/lib/gps-places";
import { isAdmin, isTracker } from "@/lib/server";
import { processPoints, walkOpensAt } from "@/lib/tracking";
import { describeKey, noteAttempt } from "@/lib/tracker-log";
import type { GpsTrailPlace, GpsTrailPoint } from "@/lib/types";
import { readObject } from "@/lib/http";
import { readPoint } from "@/lib/track-input";

const MAX_PUBLIC_TRAIL_POINTS = 1800;

/** Public evidence only: the line walked, plus named places the GPS reached. */
export async function GET() {
  const db = getDb();
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const from = walkOpensAt(config?.startDate ?? defaultRoute.startDate);
  const runtime = env as unknown as { DB: D1Database };
  const query = `
    WITH ordered AS (
      SELECT recorded_at AS recordedAt, lat, lon, counted_km AS countedKm, counted,
             LAG(recorded_at) OVER w AS previousAt,
             LAG(lat) OVER w AS previousLat,
             LAG(lon) OVER w AS previousLon,
             LAG(counted) OVER w AS previousCounted,
             SUM(CASE WHEN counted = 0 THEN 1 ELSE 0 END) OVER w AS segment
      FROM gps_points
      WHERE recorded_at >= ?
      WINDOW w AS (ORDER BY recorded_at, id)
    ), endpoints AS (
      SELECT recordedAt, lat, lon, countedKm, segment
      FROM ordered WHERE counted = 1
      UNION ALL
      SELECT previousAt, previousLat, previousLon, 0, segment
      FROM ordered WHERE counted = 1 AND previousAt IS NOT NULL
        AND coalesce(previousCounted, 0) = 0
    ), numbered AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY segment ORDER BY recordedAt) AS rn,
             COUNT(*) OVER (PARTITION BY segment) AS segmentTotal,
             COUNT(*) OVER () AS total
      FROM endpoints
    )
    SELECT recordedAt, lat, lon, countedKm, segment
    FROM numbered
    WHERE total <= ${MAX_PUBLIC_TRAIL_POINTS}
       OR rn = 1 OR rn = segmentTotal
       OR rn % MAX(1, CAST((total + ${MAX_PUBLIC_TRAIL_POINTS - 1}) / ${MAX_PUBLIC_TRAIL_POINTS} AS INTEGER)) = 0
    ORDER BY recordedAt, segment
  `;

  const [trailResult, placesResult] = await Promise.all([
    runtime.DB.prepare(query).bind(from).all<GpsTrailPoint>(),
    runtime.DB.prepare(`
      SELECT name, state, lat, lon,
             first_seen AS firstSeen,
             last_seen AS lastSeen,
             sightings,
             distance_km AS distanceKm
      FROM gps_places
      WHERE first_seen >= ?
      ORDER BY first_seen ASC
      LIMIT 1000
    `).bind(from).all<GpsTrailPlace>(),
  ]);

  return Response.json(
    { points: trailResult.results ?? [], places: placesResult.results ?? [] },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  if (!isTracker(request) && !isAdmin(request)) {
    const why = describeKey(request, "x-track-key");
    await noteAttempt(getDb(), { route: "/api/gps", method: "POST", ...why, agent: request.headers.get("user-agent") });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readObject(request);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const point = readPoint(body);
  if (!point) {
    return Response.json({ error: "That does not look like a valid position." }, { status: 400 });
  }

  const db = getDb();
  const result = await processPoints(db, [point], "browser");
  // Same rule as /api/track: a position that was not freshly named is carrying
  // the previous name forward, and must not be filed as a new sighting of it.
  if (result.named && result.positionCounted) await recordGpsPlace({
    place: result.place,
    lat: Number(result.journey.lat),
    lon: Number(result.journey.lon),
    distanceKm: Number(result.journey.distanceTotal ?? 0),
    recordedAt: String(result.journey.updatedAt ?? ""),
    live: result.journey.mode === "live",
  });

  return Response.json({ ok: true, ...result });
}
