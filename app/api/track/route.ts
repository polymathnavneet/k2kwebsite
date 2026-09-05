import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { journey } from "@/db/schema";
import { recordGpsPlace } from "@/lib/gps-places";
import { isAdmin, isTracker } from "@/lib/server";
import { describeKey, noteAttempt } from "@/lib/tracker-log";
import { processPoints, type TrackPoint } from "@/lib/tracking";
import { readObject } from "@/lib/http";
import { readNumber, readPoint, readTimestamp } from "@/lib/track-input";

/**
 * POST /api/track -> feed the walk from a real recording, not a single tap.
 *
 * Accepts a plain point list, OwnTracks, or Google Takeout location history.
 */
const MAX_POINTS = 5000;
type Loose = Record<string, unknown>;

/**
 * A number, or null when there was nothing to read.
 *
 * This used to be `Number.isFinite(Number(value)) ? Number(value) : null`,
 * which looks right and is not: `Number(null)` is 0, and so is `Number("")`.
 * `URLSearchParams.get` returns null for a parameter that is not there, so a
 * request carrying no coordinates at all came through as latitude 0, longitude
 * 0 - a real place in the Atlantic, six hundred kilometres off Ghana - and was
 * published as Navneet's position. It is what happened when I called the
 * endpoint with a key and no coordinates to test the key.
 *
 * The same slip quietly set accuracy, battery and altitude to zero whenever the
 * phone left them out, so "±0 m" meant "not told" rather than "perfect".
 */
const num = (value: unknown) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value === null || value === undefined) return null;
  // Trimmed first, because Number("   ") is 0 as well: "?lat= " would have
  // landed in the Atlantic just as surely as leaving lat out altogether.
  if (typeof value === "string" && value.trim() === "") return null;
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
    for (const item of body.points) {
      const point = readPoint(item);
      if (point) points.push(point);
    }
  }

  if (!points.length && body._type === "location") {
    const at = readTimestamp(body.tst, "seconds");
    const point = readPoint({ lat: body.lat, lon: body.lon, at: body.tst == null ? undefined : at ?? "invalid", accuracy: body.acc });
    if (point) points.push(point);
  }

  const locations = (body.locations ?? body.rawSignals) as Loose[] | undefined;
  if (!points.length && Array.isArray(locations)) {
    for (const item of locations) {
      if (!item || typeof item !== "object") continue;
      const source = (item.position ?? item) as Loose;
      if (!source || typeof source !== "object") continue;
      const lat = e7(source.latitudeE7) ?? num(source.latitude);
      const lon = e7(source.longitudeE7) ?? num(source.longitude);
      if (lat === null || lon === null) continue;
      const rawTime = source.timestamp ?? source.timestampMs;
      const at = readTimestamp(rawTime, source.timestamp == null ? "milliseconds" : "auto");
      const point = readPoint({ lat, lon, at: rawTime == null ? undefined : at ?? "invalid", accuracy: source.accuracy });
      if (point) points.push(point);
    }
  }

  const usable = points.filter(valid);
  usable.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
  return usable;
}

async function rememberPlace(result: Awaited<ReturnType<typeof processPoints>>) {
  // Only when the position was actually named. A queued backlog carries the
  // previous name forward, and writing that down again would credit a town
  // with three thousand sightings it never had.
  if (!result.named || !result.positionCounted) return;
  await recordGpsPlace({
    place: result.place,
    lat: Number(result.journey.lat),
    lon: Number(result.journey.lon),
    distanceKm: Number(result.journey.distanceTotal ?? 0),
    recordedAt: String(result.journey.updatedAt ?? ""),
    live: result.journey.mode === "live",
  });
}

/** GET form for tracker apps that can only call a URL. */
export async function GET(request: Request) {
  // A refused knock is recorded too, and this is the point of the whole thing:
  // a phone turned away used to leave nothing behind, so "never set up" and
  // "trying all day with the wrong key" were the same empty table.
  if (!isTracker(request) && !isAdmin(request)) {
    const why = describeKey(request, "x-track-key");
    await noteAttempt(getDb(), { route: "/api/track", method: "GET", ...why, agent: request.headers.get("user-agent") });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams;
  const lat = num(query.get("lat") ?? query.get("latitude"));
  const lon = num(query.get("lon") ?? query.get("lng") ?? query.get("longitude"));
  if (lat === null || lon === null || !valid({ lat, lon })) {
    return Response.json({ error: "Send lat and lon." }, { status: 400 });
  }

  const at = query.get("at") ?? query.get("time") ?? query.get("timestamp");
  const accuracy = num(query.get("acc") ?? query.get("accuracy"));
  const point = readPoint({ lat, lon, at: at ?? undefined, accuracy: accuracy ?? undefined });
  if (!point) return Response.json({ error: "Send a valid recording time and accuracy." }, { status: 400 });
  const db = getDb();
  const result = await processPoints(db, [point]);
  await rememberPlace(result);
  await noteAttempt(db, { route: "/api/track", method: "GET", outcome: "accepted", detail: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, agent: request.headers.get("user-agent") });
  return Response.json({ ok: true, accepted: 1, ...result });
}

export async function POST(request: Request) {
  if (!isTracker(request) && !isAdmin(request)) {
    const why = describeKey(request, "x-track-key");
    await noteAttempt(getDb(), { route: "/api/track", method: "POST", ...why, agent: request.headers.get("user-agent") });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Loose;
  try {
    body = await readObject(request);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const points = extractPoints(body);
  if (points.length > MAX_POINTS) return Response.json({ error: `Send at most ${MAX_POINTS} positions per upload. Split the recording into smaller batches.` }, { status: 413 });
  if (!points.length) {
    await noteAttempt(getDb(), {
      route: "/api/track", method: "POST", outcome: "bad-position",
      detail: "The key was accepted, but the message carried no usable position.",
      agent: request.headers.get("user-agent"),
    });
    return Response.json({
      error: "No usable positions found. Send { points: [{ lat, lon, at }] }, an OwnTracks report, or a Google Takeout location file.",
    }, { status: 400 });
  }

  const db = getDb();
  const result = await processPoints(db, points, body._type === "location" ? "owntracks" : "track");
  await rememberPlace(result);
  await noteAttempt(db, {
    route: "/api/track", method: "POST", outcome: "accepted",
    detail: `${points.length} position${points.length === 1 ? "" : "s"} accepted`,
    agent: request.headers.get("user-agent"),
  });

  // OwnTracks also tells us battery, altitude and connectivity.
  if (body._type === "location") {
    const patch: Record<string, number | string> = {};
    const battery = readNumber(body.batt);
    if (battery !== null && battery >= 0 && battery <= 100) patch.battery = Math.round(battery);
    const altitude = num(body.alt);
    if (altitude !== null && altitude > -500 && altitude < 9000) patch.altitude = Math.round(altitude);
    const connection = { w: "Wi-Fi", m: "Mobile data", o: "No signal" }[String(body.conn ?? "")];
    if (connection) patch.connectivity = connection;
    const reportTime = points.at(-1)?.at;
    if (Object.keys(patch).length && result.acceptedPoints > 0 && (!reportTime || reportTime === result.journey.updatedAt)) {
      await db.update(journey).set(patch).where(eq(journey.updatedAt, String(result.journey.updatedAt)));
    }

    // OwnTracks interprets a JSON response as phone commands. There are none.
    return Response.json([]);
  }

  return Response.json({ ok: true, accepted: points.length, ...result });
}
