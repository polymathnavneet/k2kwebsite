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

const MAX_PUBLIC_TRAIL_POINTS = 1800;

/** Public evidence only: the line walked, plus named places the GPS reached. */
export async function GET() {
  const db = getDb();
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const from = walkOpensAt(config?.startDate ?? defaultRoute.startDate);
  const runtime = env as unknown as { DB: D1Database };
  const query = `
    WITH walked AS (
      SELECT recorded_at AS recordedAt, lat, lon, counted_km AS countedKm
      FROM gps_points
      WHERE counted = 1 AND recorded_at >= ?
    ), numbered AS (
      SELECT recordedAt, lat, lon, countedKm,
             ROW_NUMBER() OVER (ORDER BY recordedAt) AS rn,
             COUNT(*) OVER () AS total
      FROM walked
    )
    SELECT recordedAt, lat, lon, countedKm
    FROM numbered
    WHERE total <= ${MAX_PUBLIC_TRAIL_POINTS}
       OR rn = 1
       OR rn = total
       OR rn % CASE
            WHEN total > ${MAX_PUBLIC_TRAIL_POINTS}
              THEN CAST((total + ${MAX_PUBLIC_TRAIL_POINTS - 1}) / ${MAX_PUBLIC_TRAIL_POINTS} AS INTEGER)
            ELSE 1
          END = 0
    ORDER BY recordedAt
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
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return Response.json({ error: "That does not look like a valid position." }, { status: 400 });
  }

  const db = getDb();
  const result = await processPoints(db, [{ lat, lon }]);
  await recordGpsPlace({
    place: result.place,
    lat,
    lon,
    distanceKm: Number(result.journey.distanceTotal ?? 0),
    recordedAt: String(result.journey.updatedAt ?? ""),
    live: result.journey.mode === "live",
  });

  return Response.json({ ok: true, ...result });
}
