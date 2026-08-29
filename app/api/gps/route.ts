import { getDb } from "@/db";
import { mirrorJourney } from "@/lib/mirror";
import { isAdmin } from "@/lib/server";
import { processPoints } from "@/lib/tracking";

/**
 * POST /api/gps -> sync one GPS fix.
 *
 * Everything that follows from a position is worked out server-side: the
 * distance walked, where that sits along the route, which stops have been
 * passed, and whether the route now looks wrong. See lib/tracking.ts.
 */
export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

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
  await mirrorJourney(db);

  return Response.json({ ok: true, ...result });
}
