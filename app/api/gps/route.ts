import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { routeConfig } from "@/db/schema";
import { defaultRoute } from "@/lib/defaults";
import { isAdmin, isTracker } from "@/lib/server";
import { processPoints, walkOpensAt } from "@/lib/tracking";
import type { GpsTrailPoint } from "@/lib/types";

const MAX_PUBLIC_TRAIL_POINTS = 1800;

/**
 * GET /api/gps -> the public evidence trail.
 *
 * This is deliberately not the planned route. It contains only GPS fixes that
 * counted as walked after the expedition start. The database may eventually
 * hold tens of thousands of fixes, so the query samples them evenly while
 * always keeping the first and latest point. The shape of the road survives;
 * the browser does not need to download a phone's entire location history.
 */
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
  const result = await runtime.DB.prepare(query).bind(from).all<GpsTrailPoint>();
  return Response.json(
    { points: result.results ?? [] },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}

/**
 * POST /api/gps -> sync one GPS fix.
 *
 * Everything that follows from a position is worked out server-side: the
 * distance walked, where that sits along the route, which stops have been
 * passed, and whether the route now looks wrong. See lib/tracking.ts.
 */
export async function POST(request: Request) {
  if (!isTracker(request) && !isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

  // GPS deliberately does not mirror to GitHub. Continuous tracking would
  // mean a commit every fix - thousands a week, and straight into GitHub's
  // rate limits. The journey is mirrored when it is published from the
  // admin panel instead, which is when it is worth recording.
  const db = getDb();
  const result = await processPoints(db, [{ lat, lon }]);

  return Response.json({ ok: true, ...result });
}
