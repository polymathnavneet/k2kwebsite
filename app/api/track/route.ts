import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { journey } from "@/db/schema";
import { recordGpsPlace } from "@/lib/gps-places";
import { isAdmin, isTracker } from "@/lib/server";
import { processPoints, type TrackPoint } from "@/lib/tracking";

/**
 * POST /api/track -> feed the walk from a real recording, not a single tap.
 *
 * Accepts a plain point list, OwnTracks, or Google Takeout location history.
 */
const MAX_POINTS = 5000;
type Loose = Record<string, unknown>;

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const valid = (point: TrackPoint) =>
  point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;

const e7 = (value: unknown) => {
  const parsed = num(value);
  return parsed === null ? null : parsed / 1e7;
};

function extractPoints(body: Loose): TrackPoint[] {
  const points: TrackPoint[] = [];

  if (Array.isArray(body.points)) {
    for (const item of body.points as Loose[]) {
      const lat = num(item.lat), lon = num(item.lon ?? item.lng);
      if (lat === null || lon === null) continue;
      points.push({ lat, lon, at: typeof item.at === "string" ? item.at : undefined });
    }
  }

  if (!points.length && body._type === "location") {
    const lat = num(body.lat), lon = num(body.lon);
    const at = num(body.tst);
    if (lat !== null && lon !== null) {
      points.push({ lat, lon, at: at ? new Date(at * 1000).toISOString() : undefined, accuracy: num(body.acc) });
    }
  }

  const locations = (body.locations ?? body.rawSignals) as Loose[] | undefined;
  if (!points.length && Array.isArray(locations)) {
    for (const item of locations) {
      const source = (item.position ?? item) as Loose;
      const lat = e7(source.latitudeE7) ?? num(source.latitude);
      const lon = e7(source.longitudeE7) ?? num(source.longitude);
      if (lat === null || lon === null) continue;
      const at = source.timestamp ?? source.timestampMs;
      points.push({
        lat,
        lon,
        at: typeof at === "string" ? at : at ? new Date(Number(at)).toISOString() : undefined,
      });
    }
  }

  const usable = points.filter(valid);
  usable.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
  return usable.slice(-MAX_POINTS);
}

async function rememberPlace(result: Awaited<ReturnType<typeof processPoints>>, point: TrackPoint) {
  await recordGpsPlace({
    place: result.place,
    lat: point.lat,
    lon: point.lon,
    distanceKm: Number(result.journey.distanceTotal ?? 0),
    recordedAt: point.at ?? String(result.journey.updatedAt ?? ""),
    live: result.journey.mode === "live",
  });
}

/** GET form for tracker apps that can only call a URL. */
export async function GET(request: Request) {
  if (!isTracker(request) && !isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const query = new URL(request.url).searchParams;
  const lat = num(query.get("lat") ?? query.get("latitude"));
  const lon = num(query.get("lon") ?? query.get("lng") ?? query.get("longitude"));
  if (lat === null || lon === null || !valid({ lat, lon })) {
    return Response.json({ error: "Send lat and lon." }, { status: 400 });
  }

  const at = query.get("at") ?? query.get("time") ?? query.get("timestamp");
  const accuracy = num(query.get("acc") ?? query.get("accuracy"));
  const point = { lat, lon, at: at ?? undefined, accuracy: accuracy ?? undefined };
  const db = getDb();
  const result = await processPoints(db, [point]);
  await rememberPlace(result, point);
  return Response.json({ ok: true, accepted: 1, ...result });
}

export async function POST(request: Request) {
  if (!isTracker(request) && !isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Loose;
  try {
    body = (await request.json()) as Loose;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const points = extractPoints(body);
  if (!points.length) {
    return Response.json({
      error: "No usable positions found. Send { points: [{ lat, lon, at }] }, an OwnTracks report, or a Google Takeout location file.",
    }, { status: 400 });
  }

  const db = getDb();
  const result = await processPoints(db, points);
  await rememberPlace(result, points[points.length - 1]);

  // OwnTracks also tells us battery, altitude and connectivity.
  if (body._type === "location") {
    const patch: Record<string, number | string> = {};
    const battery = num(body.batt);
    if (battery !== null && battery >= 0 && battery <= 100) patch.battery = Math.round(battery);
    const altitude = num(body.alt);
    if (altitude !== null && altitude > -500 && altitude < 9000) patch.altitude = Math.round(altitude);
    const connection = { w: "Wi-Fi", m: "Mobile data", o: "No signal" }[String(body.conn ?? "")];
    if (connection) patch.connectivity = connection;
    if (Object.keys(patch).length) await db.update(journey).set(patch).where(eq(journey.id, 1));

    // OwnTracks interprets a JSON response as phone commands. There are none.
    return Response.json([]);
  }

  return Response.json({ ok: true, accepted: points.length, ...result });
}
