import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { journey, routeConfig } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import { distanceKm, dayOfWalk } from "@/lib/geo";
import { mirrorJourney } from "@/lib/mirror";
import { clamp, clean, isAdmin } from "@/lib/server";

/**
 * POST /api/gps -> sync a GPS fix and let it move the distance on its own.
 *
 * Each fix is measured against the last one and the gap is added to the total
 * walked, so the distance climbs by itself and every arrival date recalculates
 * from it. Two guards keep it honest:
 *
 *  - A move under 100 m is ignored. A phone sitting on a table drifts, and
 *    without this the distance would creep upward while Navneet slept.
 *  - A jump over 150 km is ignored. That is a bus, a train, or a bad fix -
 *    not walking - so it moves the map pin without counting as distance.
 *
 * Both are reported back, so the admin panel can say what it decided and why.
 */

const MIN_MOVE_KM = 0.1;
const MAX_MOVE_KM = 150;

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
  const [current] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);

  const startDate = config?.startDate ?? defaultRoute.startDate;
  const previous = current ?? { id: 1, ...defaultJourney };
  const live = previous.mode === "live";

  const moved = distanceKm(previous.lat, previous.lon, lat, lon);
  const counted = live && moved >= MIN_MOVE_KM && moved <= MAX_MOVE_KM;

  let reason = "";
  if (!live) reason = "Saved your position. Switch the journey to Live and the distance starts counting.";
  else if (moved < MIN_MOVE_KM) reason = "You have barely moved, so nothing was added to the distance.";
  else if (moved > MAX_MOVE_KM) reason = `That is a ${Math.round(moved)} km jump, too far to have been walked, so only the map pin moved.`;

  const day = live ? dayOfWalk(startDate) : previous.day;
  const distanceTotal = counted ? Math.round((previous.distanceTotal + moved) * 10) / 10 : previous.distanceTotal;
  // A new day resets today's distance rather than piling onto yesterday's.
  const sameDay = day === previous.day;
  const distanceToday = counted
    ? Math.round(((sameDay ? previous.distanceToday : 0) + moved) * 10) / 10
    : sameDay ? previous.distanceToday : 0;

  const next = {
    ...previous,
    id: 1,
    lat,
    lon,
    day,
    distanceTotal: clamp(distanceTotal, 0, 10000),
    distanceToday: clamp(distanceToday, 0, 100),
    currentPlace: clean(body.currentPlace, 100) || previous.currentPlace,
    battery: body.battery == null || body.battery === "" ? previous.battery : Math.round(clamp(body.battery, 0, 100)),
    updatedAt: new Date().toISOString(),
  };

  await db.insert(journey).values(next).onConflictDoUpdate({ target: journey.id, set: next });
  await mirrorJourney(db);

  return Response.json({
    ok: true,
    counted,
    movedKm: Math.round(moved * 100) / 100,
    reason: reason || `Added ${(Math.round(moved * 10) / 10).toLocaleString("en-IN")} km. Every arrival date has recalculated.`,
    journey: next,
  });
}
