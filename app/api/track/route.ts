import { getDb } from "@/db";
import { isAdmin } from "@/lib/server";
import { processPoints, type TrackPoint } from "@/lib/tracking";

/**
 * POST /api/track -> feed the walk from a real recording, not a single tap.
 *
 * One button press on a phone is a single point, and a single point is the
 * least trustworthy thing a tracker can run on: miss a day and the distance is
 * simply wrong. This endpoint takes a whole track instead, so the distance is
 * the sum of a recorded path.
 *
 * It accepts three shapes, because the useful sources each speak their own:
 *
 *   1. Plain    { "points": [{ "lat": 21.1, "lon": 79.0, "at": "..." }, ...] }
 *   2. OwnTracks { "_type": "location", "lat": 21.1, "lon": 79.0, "tst": 1766... }
 *      A free phone app that posts its position on its own, all day, and
 *      queues when there is no signal.
 *   3. Google Takeout location history, as exported from takeout.google.com.
 *      Google Maps Timeline has no live API, so this is the way its data gets
 *      in: export it, upload the file.
 *
 * Points are sorted by time and fed through the same processing as a manual
 * sync, so a batch and a tap cannot disagree about the distance.
 */

const MAX_POINTS = 5000;

type Loose = Record<string, unknown>;

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const valid = (point: TrackPoint) =>
  point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;

/** Google Takeout stores coordinates as degrees times 1e7. */
const e7 = (value: unknown) => {
  const parsed = num(value);
  return parsed === null ? null : parsed / 1e7;
};

function extractPoints(body: Loose): TrackPoint[] {
  const points: TrackPoint[] = [];

  // 1. Plain list.
  if (Array.isArray(body.points)) {
    for (const item of body.points as Loose[]) {
      const lat = num(item.lat), lon = num(item.lon ?? item.lng);
      if (lat === null || lon === null) continue;
      points.push({ lat, lon, at: typeof item.at === "string" ? item.at : undefined });
    }
  }

  // 2. A single OwnTracks report.
  if (!points.length && body._type === "location") {
    const lat = num(body.lat), lon = num(body.lon);
    const at = num(body.tst);
    if (lat !== null && lon !== null) {
      points.push({ lat, lon, at: at ? new Date(at * 1000).toISOString() : undefined });
    }
  }

  // 3. Google Takeout location history.
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
  // Oldest first, so the walk is replayed in the order it happened.
  usable.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
  return usable.slice(-MAX_POINTS);
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

  // GPS deliberately does not mirror to GitHub. Continuous tracking would
  // mean a commit every fix - thousands a week, and straight into GitHub's
  // rate limits. The journey is mirrored when it is published from the
  // admin panel instead, which is when it is worth recording.
  const db = getDb();
  const result = await processPoints(db, points);

  return Response.json({ ok: true, accepted: points.length, ...result });
}
