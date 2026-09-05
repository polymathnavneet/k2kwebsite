import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { gpsPoints, journey, routeConfig, routeStops, routeSuggestions } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import { dayOfWalk, distanceKm } from "@/lib/geo";
import { reverseGeocode } from "@/lib/places";
import { insertionKm } from "@/lib/route-math";
import { readPoint } from "@/lib/track-input";
import { istDayKey } from "@/lib/time";
import type { RouteStop } from "@/lib/types";

type Db = DrizzleD1Database<typeof schema>;

/**
 * The smallest hop that counts.
 *
 * A flat 100 m floor quietly punished slow walking: at 2 km/h with a fix every
 * thirty seconds each hop is about 17 m, and every one of them was thrown away.
 * A hop only fails to mean anything when it is smaller than the fix's own
 * margin of error, so the threshold follows the accuracy instead, with a small
 * floor for when the phone does not report one.
 */
export const MIN_MOVE_FLOOR_KM = 0.015;

export function driftThresholdKm(accuracy?: number | null) {
  const fromAccuracy = accuracy != null && accuracy > 0 ? (accuracy * 1.5) / 1000 : 0;
  return Math.max(MIN_MOVE_FLOOR_KM, fromAccuracy);
}
/**
 * When to ask what a position is called.
 *
 * Every fix used to be handed to Nominatim. That is fine at walking pace and
 * catastrophic behind a queue: OwnTracks holds on to every position it cannot
 * deliver, and Navneet's phone sat behind a DNS failure with 3,834 of them
 * waiting. The moment that clears they arrive as 3,834 requests in a few
 * minutes, and Nominatim - free, one request a second, and entitled to ban
 * anyone who abuses it - would rightly have cut the site off for the rest of
 * the walk.
 *
 * Three rules, each of which is also simply the truthful answer:
 *
 *  - Below NAME_MIN_MOVE_KM he has not gone anywhere, so the name has not
 *    changed. A phone lying on a table asks nothing at all.
 *  - Past NAME_MAX_AGE_MIN the fix is history rather than a location. The site
 *    says where he *is*; a position from nine hours ago does not answer that,
 *    and the current one is right behind it in the queue.
 *  - Unless that history has crossed NAME_FAR_KM, at which point it is a
 *    different part of India and worth a name even late. A five-hundred
 *    kilometre backlog therefore costs about twenty lookups, not two thousand.
 *
 * Distance is measured from where the name was last asked for, never from the
 * last stored position: that moves with every fix, so nothing would ever
 * accumulate past two hundred metres.
 */
export const NAME_MIN_MOVE_KM = 0.2;
export const NAME_MAX_AGE_MIN = 30;
export const NAME_FAR_KM = 25;

export function shouldName(input: {
  namedLat: number | null | undefined;
  namedLon: number | null | undefined;
  named: string;
  lat: number;
  lon: number;
  recordedAt: string;
  now?: number;
}): boolean {
  // Nothing to carry forward: the site would have no name to show.
  if (!input.named.trim()) return true;
  if (input.namedLat == null || input.namedLon == null) return true;
  if (!Number.isFinite(input.namedLat) || !Number.isFinite(input.namedLon)) return true;

  const moved = distanceKm(input.namedLat, input.namedLon, input.lat, input.lon);
  if (!Number.isFinite(moved) || moved < NAME_MIN_MOVE_KM) return false;

  const at = new Date(input.recordedAt).getTime();
  const ageMinutes = Number.isFinite(at) ? ((input.now ?? Date.now()) - at) / 60000 : 0;
  if (ageMinutes <= NAME_MAX_AGE_MIN) return true;

  return moved >= NAME_FAR_KM;
}

/** Above this in a single hop with no timing, it was a vehicle. */
export const MAX_MOVE_KM = 150;
/**
 * Above this average speed, it was not walked.
 *
 * A brisk walk is about 6 km/h and a run about 15. Twelve leaves room for a
 * genuinely fast hour and still rejects the thing that used to slip through:
 * a bus recorded as hundreds of small, innocent-looking hops.
 */
export const MAX_WALK_KMH = 12;
/** A fix this imprecise says nothing useful about distance. */
export const MAX_ACCURACY_M = 500;

export type TrackPoint = { lat: number; lon: number; at?: string; accuracy?: number | null };

export type TrackResult = {
  counted: boolean;
  positionCounted: boolean;
  movedKm: number;
  acceptedPoints: number;
  duplicatePoints: number;
  rejected: { tooFast: number; tooFar: number; drift: number; imprecise: number };
  alongKm: number;
  offRouteKm: number;
  onRoute: boolean;
  reached: string[];
  place: string;
  /** True when this position was freshly named rather than carried forward. */
  named: boolean;
  suggestion: { id: string; name: string; state: string; km: number; reason: string } | null;
  reason: string;
  journey: Record<string, unknown>;
};

export async function loadStops(db: Db): Promise<RouteStop[]> {
  const stops = await db
    .select({ name: routeStops.name, state: routeStops.state, lat: routeStops.lat, lon: routeStops.lon, km: routeStops.km, note: routeStops.note })
    .from(routeStops)
    .orderBy(asc(routeStops.sortOrder));
  return stops.length ? stops : defaultRoute.stops;
}

/**
 * Take GPS fixes and work out everything that follows from them.
 *
 * Three separate protections, because a tracker that overstates the distance is
 * worse than no tracker at all:
 *
 *  1. **Duplicates.** Every fix is stored with a unique index on time and
 *     position. Re-uploading the same recorded track conflicts instead of
 *     inserting, and only newly stored fixes can add distance. Uploading a
 *     Takeout export twice therefore changes nothing.
 *  2. **Speed.** When fixes carry timestamps, each hop's average speed is
 *     checked. Anything over MAX_WALK_KMH was a vehicle, however small the
 *     individual steps were, and does not count.
 *  3. **Precision.** A fix accurate to worse than half a kilometre is stored
 *     but never counted.
 *
 * Distance comes only from measured edges. The public trail follows recorded
 * walking segments, without projecting positions onto a planned route.
 */
type StoredPoint = typeof gpsPoints.$inferSelect;

/** Classify the measured edge between two real, chronological fixes. */
export function measuredEdge(before: StoredPoint | null, point: StoredPoint, opensAt: string) {
  const empty = { counted: 0, countedKm: 0, speedKmh: null as number | null, rejection: "" };
  if (!before || before.recordedAt < opensAt || point.recordedAt < opensAt) return empty;
  if ((before.accuracy ?? 0) > MAX_ACCURACY_M || (point.accuracy ?? 0) > MAX_ACCURACY_M) return { ...empty, rejection: "imprecise" };
  const hours = (Date.parse(point.recordedAt) - Date.parse(before.recordedAt)) / 3600000;
  // Equal or reversed times cannot establish a walking speed.
  if (!Number.isFinite(hours) || hours <= 0) return empty;
  const moved = distanceKm(before.lat, before.lon, point.lat, point.lon);
  const speedKmh = moved / hours;
  if (moved > MAX_MOVE_KM) return { ...empty, speedKmh, rejection: "tooFar" };
  if (speedKmh > MAX_WALK_KMH) return { ...empty, speedKmh, rejection: "tooFast" };
  if (moved < driftThresholdKm(Math.max(before.accuracy ?? 0, point.accuracy ?? 0))) return { ...empty, speedKmh, rejection: "drift" };
  return { counted: 1, countedKm: moved, speedKmh, rejection: "" };
}

export async function processPoints(db: Db, points: TrackPoint[], source = "manual"): Promise<TrackResult> {
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const [existing] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  const previous = existing ?? { id: 1, ...defaultJourney };
  const startDate = config?.startDate ?? defaultRoute.startDate;
  const opensAt = walkOpensAt(startDate);
  const receivedAt = new Date().toISOString();
  const ordered = points.map(readPoint).filter((point): point is TrackPoint => point !== null)
    .map(point => ({ ...point, at: point.at ?? receivedAt }))
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!ordered.length) throw new Error("No valid GPS positions were supplied.");

  const rejected = { tooFast: 0, tooFar: 0, drift: 0, imprecise: 0 };
  const insertedIds = new Set<string>();
  // Small inserts respect D1's bound-parameter limit. The unique index owns
  // deduplication, including simultaneous retries from two requests.
  for (let offset = 0; offset < ordered.length; offset += 10) {
    const inserted = await db.insert(gpsPoints).values(ordered.slice(offset, offset + 10).map(point => ({
      id: crypto.randomUUID(), recordedAt: point.at, lat: point.lat, lon: point.lon,
      accuracy: point.accuracy ?? null, source, createdAt: receivedAt,
    }))).onConflictDoNothing().returning({ id: gpsPoints.id });
    for (const row of inserted) insertedIds.add(row.id);
  }

  let walked = 0;
  if (insertedIds.size) {
    // An old upload changes the edge into the new point AND the edge into its
    // successor. Recalculate that interval, instead of joining history to the
    // latest position or counting the same section twice.
    const firstAt = ordered[0].at, lastAt = ordered.at(-1)!.at;
    const [before] = await db.select().from(gpsPoints).where(lt(gpsPoints.recordedAt, firstAt))
      .orderBy(desc(gpsPoints.recordedAt), desc(gpsPoints.id)).limit(1);
    const middle = await db.select().from(gpsPoints)
      .where(and(gte(gpsPoints.recordedAt, firstAt), lte(gpsPoints.recordedAt, lastAt)))
      .orderBy(asc(gpsPoints.recordedAt), asc(gpsPoints.id));
    const [after] = await db.select().from(gpsPoints).where(gt(gpsPoints.recordedAt, lastAt))
      .orderBy(asc(gpsPoints.recordedAt), asc(gpsPoints.id)).limit(1);
    let cursor: StoredPoint | null = before ?? null;
    const updates = [];
    for (const point of [...middle, ...(after ? [after] : [])]) {
      const edge = measuredEdge(cursor, point, opensAt);
      if (insertedIds.has(point.id)) {
        walked += edge.countedKm;
        if (edge.rejection in rejected) rejected[edge.rejection as keyof typeof rejected] += 1;
      }
      // A concurrent insert can change the predecessor after this read. Do
      // not overwrite the newer edge with a calculation from an older view.
      const predecessor = sql`coalesce((select id from gps_points as p
        where p.recorded_at < ${point.recordedAt}
           or (p.recorded_at = ${point.recordedAt} and p.id < ${point.id})
        order by p.recorded_at desc, p.id desc limit 1), '') = ${cursor?.id ?? ""}`;
      updates.push(db.update(gpsPoints).set({ counted: edge.counted, countedKm: edge.countedKm, speedKmh: edge.speedKmh })
        .where(and(eq(gpsPoints.id, point.id), predecessor)));
      cursor = point;
    }
    for (let offset = 0; offset < updates.length; offset += 50) {
      const batch = updates.slice(offset, offset + 50);
      if (batch.length) await db.batch(batch as [typeof batch[number], ...typeof batch[number][]]);
    }
  }

  const distances = await totals(db, startDate);
  const [latest] = await db.select().from(gpsPoints)
    .where(or(isNull(gpsPoints.accuracy), lte(gpsPoints.accuracy, MAX_ACCURACY_M)))
    .orderBy(desc(gpsPoints.recordedAt), desc(gpsPoints.id)).limit(1);
  const day = dayOfWalk(startDate);
  const live = day >= 1;
  const movesPosition = Boolean(latest && insertedIds.has(latest.id)
    && (!previous.updatedAt || Date.parse(latest.recordedAt) >= Date.parse(previous.updatedAt)));
  const wantsName = movesPosition && latest && shouldName({
    namedLat: previous.namedLat, namedLon: previous.namedLon,
    named: String(previous.currentPlace ?? ""), lat: latest.lat, lon: latest.lon,
    recordedAt: latest.recordedAt,
  });
  const place = wantsName && latest ? await reverseGeocode(latest.lat, latest.lon) : null;
  const currentPlace = place ? [place.name, place.state].filter(Boolean).join(", ")
    : wantsName ? "GPS position — place name unavailable" : previous.currentPlace;
  const patch = {
    day, mode: live ? "live" : "preparation",
    ...distances,
    // Kept for old clients. Neither figure projects the walk onto a plan.
    routeProgressKm: distances.distanceTotal, offRouteKm: 0,
    ...(movesPosition && latest ? {
      lat: latest.lat, lon: latest.lon, accuracyM: latest.accuracy,
      updatedAt: latest.recordedAt, currentPlace,
      precisePlace: place?.precise ?? (wantsName ? "" : previous.precisePlace),
      ...(place ? { namedLat: latest.lat, namedLon: latest.lon } : {}),
    } : {}),
  };
  await db.insert(journey).values({ ...previous, updatedAt: previous.updatedAt ?? "", ...patch }).onConflictDoUpdate({
    target: journey.id, set: patch,
    ...(movesPosition && latest ? { setWhere: sql`${journey.updatedAt} <= ${latest.recordedAt}` } : {}),
  });
  const [saved] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  const duplicatePoints = ordered.length - insertedIds.size;
  const reason = !live ? "Position saved. Distance starts counting on the first day of the walk."
    : !insertedIds.size ? `Already recorded — skipped ${duplicatePoints} duplicate positions.`
    : walked > 0 ? `Recorded ${Math.round(walked * 100) / 100} km of GPS-checked walking.`
    : "Position saved. These fixes did not establish additional walking distance.";
  return {
    counted: walked > 0, positionCounted: Boolean(movesPosition && latest?.counted),
    movedKm: Math.round(walked * 100) / 100,
    acceptedPoints: insertedIds.size, duplicatePoints, rejected,
    alongKm: distances.distanceTotal, offRouteKm: 0, onRoute: true, reached: [],
    place: saved.currentPlace, named: Boolean(place), suggestion: null, reason, journey: saved,
  };
}

/**
 * The first instant of the walk, as a UTC timestamp comparable with the times
 * fixes are recorded at. Midnight in India on the start date is 18:30 UTC the
 * evening before.
 */
export function walkOpensAt(startDate: string) {
  return new Date(`${startDate}T00:00:00+05:30`).toISOString();
}

/** Today's totals, used to reset the day's distance at Indian midnight. */
export const trackingDayKey = istDayKey;

/**
 * The distance walked, added up from the points rather than carried forward.
 *
 * It used to be kept as a running total: take yesterday's number and add
 * today's movement. That is fine until one number goes wrong, and then it is
 * wrong for the rest of the walk - a fix counted twice, or a batch that arrived
 * during an outage, and the total is quietly overstated with no way back. Over
 * a hundred and eighty days that is not a risk worth carrying on a site whose
 * whole claim is that the distance is real.
 *
 * Every point already stores the kilometres it contributed and whether they
 * counted, so both figures are simply a sum. Nothing accumulates, nothing
 * drifts, and running this a hundred times gives the same answer as running it
 * once. If a bad point is ever removed, the totals correct themselves.
 *
 * "Today" is an Indian calendar day, not the expedition day number. Keying it
 * on the day number was why distance today never reset before the walk began:
 * the day number is 0 every day until the seventeenth of December, so every
 * day looked like the same day.
 *
 * Nothing recorded before the walk starts is counted, and that is enforced here
 * rather than only where the fixes are written. Fixes banked before that rule
 * existed are still in the table flagged as counted - two of them, eight
 * milliseconds apart, between them claiming fifty-seven kilometres - and
 * summing them meant the walk would have opened on day one with fifty-seven
 * kilometres already on the board. Filtering by the start date repairs those
 * rows without a migration, and stays right if the start date ever moves.
 */
export async function totals(db: Db, startDate?: string) {
  const from = startDate ? walkOpensAt(startDate) : null;
  const counted = from
    ? and(eq(gpsPoints.counted, 1), gte(gpsPoints.recordedAt, from))
    : eq(gpsPoints.counted, 1);

  const [summed] = await db
    .select({ km: sql<number>`coalesce(sum(${gpsPoints.countedKm}), 0)` })
    .from(gpsPoints)
    .where(counted);

  // Only the last couple of days can belong to today, whichever side of
  // midnight the recording clock was on.
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const recent = await db
    .select({ recordedAt: gpsPoints.recordedAt, countedKm: gpsPoints.countedKm })
    .from(gpsPoints)
    .where(and(counted, gte(gpsPoints.recordedAt, since)));

  const today = istDayKey();
  const todayKm = recent
    .filter(point => istDayKey(point.recordedAt) === today)
    .reduce((sum, point) => sum + (point.countedKm ?? 0), 0);

  return {
    distanceTotal: Math.round((summed?.km ?? 0) * 10) / 10,
    distanceToday: Math.round(todayKm * 10) / 10,
  };
}

/**
 * Bring the published figures back in line with the points, without needing a
 * new position to do it.
 *
 * Run on a timer, this is what rolls "today" over at Indian midnight even on a
 * day he never sends a fix, and what quietly repairs the total if anything ever
 * went in wrong.
 */
export async function reconcile(db: Db) {
  const [previous] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);
  if (!previous) return null;

  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const startDate = config?.startDate ?? defaultRoute.startDate;
  const started = dayOfWalk(startDate) >= 1;
  const { distanceTotal, distanceToday } = await totals(db, startDate);
  const day = started ? dayOfWalk(startDate) : previous.day;

  // Ask again what this position is called.
  //
  // The published name is only ever written when a fix arrives, so a name that
  // was wrong stayed wrong until the phone next reported - and the phone is
  // about to report a great deal less often, to save its battery. The site
  // spent a day telling readers Navneet was in "Sarojani Nagar" while he stood
  // thirty kilometres away, and waiting on his next fix to correct that is not
  // good enough.
  //
  // One lookup per run, so it repairs itself within a quarter of an hour of a
  // fix or a fix of the naming. Ninety-six lookups a day is far inside what
  // Nominatim asks for, and a failure returns null and simply keeps the name
  // it had.
  const placePatch: { currentPlace?: string; precisePlace?: string } = {};
  if (Number.isFinite(previous.lat) && Number.isFinite(previous.lon)) {
    const place = await reverseGeocode(previous.lat, previous.lon);
    const named = place ? [place.name, place.state].filter(Boolean).join(", ") : "";
    if (named && named !== previous.currentPlace) placePatch.currentPlace = named;
    if (place && place.precise !== previous.precisePlace) placePatch.precisePlace = place.precise;
  }

  const figuresMatch = distanceTotal === previous.distanceTotal
    && distanceToday === previous.distanceToday
    && day === previous.day;
  const placeMoved = placePatch.currentPlace !== undefined || placePatch.precisePlace !== undefined;
  if (figuresMatch && !placeMoved && !(started && previous.mode !== "live")) return null;

  await db.update(journey)
    .set({ distanceTotal, distanceToday, day, ...placePatch, ...(started && previous.mode !== "live" ? { mode: "live" } : {}) })
    .where(eq(journey.id, 1));

  return { distanceTotal, distanceToday, day, ...placePatch };
}

/**
 * When a place stops being a guess and becomes part of the route.
 *
 * Three separate sightings, spread over at least half an hour. A man walking
 * through a town is near it for well over that; a single bad fix is one
 * sighting and never reaches three. So a road he actually took joins the route
 * on its own, and a glitch never does.
 */
const ADOPT_SIGHTINGS = 3;
const ADOPT_MINUTES = 30;

/** Put a place the walk keeps passing onto the route, and close the question. */
async function adopt(db: Db, pending: { id: string; name: string; state: string; lat: number; lon: number; km: number }) {
  const stops = await loadStops(db);
  const km = insertionKm(stops, pending.km);
  if (km === null) return null;

  const ordered = [...stops, { name: pending.name, state: pending.state, lat: pending.lat, lon: pending.lon, km, note: "Added from the road - you walked through it." }]
    .sort((a, b) => a.km - b.km);

  await db.delete(routeStops);
  await db.insert(routeStops).values(ordered.map((stop, index) => ({
    sortOrder: index, name: stop.name, state: stop.state, lat: stop.lat, lon: stop.lon, km: stop.km, note: stop.note ?? "",
  })));
  await db.update(routeSuggestions).set({ status: "accepted", decidedAt: new Date().toISOString() }).where(eq(routeSuggestions.id, pending.id));

  return { km };
}

async function proposeStop(db: Db, input: {
  name: string; state: string; lat: number; lon: number; alongKm: number; reason: string; stops: RouteStop[];
}) {
  const km = insertionKm(input.stops, input.alongKm);
  if (km === null) return null;

  const [pending] = await db
    .select()
    .from(routeSuggestions)
    .where(and(eq(routeSuggestions.name, input.name), eq(routeSuggestions.status, "pending")))
    .limit(1);

  // Seen again. One sighting is a guess - a bad fix in a tunnel makes one - so
  // it is counted rather than ignored, and the count is what earns the place a
  // spot on the route.
  if (pending) {
    const sightings = pending.sightings + 1;
    await db.update(routeSuggestions).set({ sightings }).where(eq(routeSuggestions.id, pending.id));

    const minutes = (Date.now() - new Date(pending.createdAt).getTime()) / 60000;
    if (sightings >= ADOPT_SIGHTINGS && minutes >= ADOPT_MINUTES) {
      const added = await adopt(db, pending);
      if (added) return { id: pending.id, name: pending.name, state: pending.state, km: added.km, reason: `${pending.name} has been added to the route by itself - you walked through it.`, adopted: true };
    }
    return null;
  }

  const id = crypto.randomUUID();
  await db.insert(routeSuggestions).values({
    id, kind: "add_stop", name: input.name, state: input.state,
    lat: input.lat, lon: input.lon, km, reason: input.reason,
    status: "pending", createdAt: new Date().toISOString(),
  });

  return { id, name: input.name, state: input.state, km, reason: input.reason };
}
