import { and, asc, desc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { gpsPoints, journey, routeConfig, routeStops, routeSuggestions } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import { dayOfWalk, distanceKm } from "@/lib/geo";
import { reverseGeocode } from "@/lib/places";
import { alreadyOnRoute, insertionKm, nextStopAfter, projectOntoRoute } from "@/lib/route-math";
import { OFF_ROUTE_KM } from "@/lib/position";
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
/** Beyond this from the planned line, the route is treated as having changed. */

export type TrackPoint = { lat: number; lon: number; at?: string; accuracy?: number | null };

export type TrackResult = {
  counted: boolean;
  movedKm: number;
  acceptedPoints: number;
  duplicatePoints: number;
  rejected: { tooFast: number; tooFar: number; drift: number; imprecise: number };
  alongKm: number;
  offRouteKm: number;
  onRoute: boolean;
  reached: string[];
  place: string;
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
 * Distance walked and position along the route stay separate numbers: the first
 * is how far the legs went, the second is where that sits on the planned line.
 */
export async function processPoints(db: Db, points: TrackPoint[], source = "manual"): Promise<TrackResult> {
  const stops = await loadStops(db);
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const [existing] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);

  const previous = existing ?? { id: 1, ...defaultJourney };
  const startDate = config?.startDate ?? defaultRoute.startDate;
  const live = previous.mode === "live";
  const previousAlong = Number(previous.routeProgressKm) || 0;

  // Oldest first, so the walk is replayed in the order it happened.
  const ordered = [...points].sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));

  const rejected = { tooFast: 0, tooFar: 0, drift: 0, imprecise: 0 };
  let duplicatePoints = 0;
  let acceptedPoints = 0;
  let walked = 0;

  // Start measuring from the last fix actually recorded, not from the journey
  // row, so a batch uploaded after a manual tap does not double back.
  const [lastStored] = await db.select().from(gpsPoints).orderBy(desc(gpsPoints.recordedAt)).limit(1);
  let cursor = lastStored
    ? { lat: lastStored.lat, lon: lastStored.lon, at: lastStored.recordedAt }
    : { lat: previous.lat, lon: previous.lon, at: null as string | null };

  for (const point of ordered) {
    const recordedAt = point.at ?? new Date().toISOString();
    const moved = distanceKm(cursor.lat, cursor.lon, point.lat, point.lon);

    // Average speed over the hop, when both ends carry a time.
    let speedKmh: number | null = null;
    if (cursor.at) {
      const hours = (new Date(recordedAt).getTime() - new Date(cursor.at).getTime()) / 3600000;
      if (hours > 0) speedKmh = moved / hours;
    }

    let counts = live;
    if (counts && point.accuracy != null && point.accuracy > MAX_ACCURACY_M) { rejected.imprecise += 1; counts = false; }
    if (counts && moved < driftThresholdKm(point.accuracy)) { rejected.drift += 1; counts = false; }
    if (counts && moved > MAX_MOVE_KM) { rejected.tooFar += 1; counts = false; }
    if (counts && speedKmh !== null && speedKmh > MAX_WALK_KMH) { rejected.tooFast += 1; counts = false; }

    // The unique index does the deduplication: a fix already recorded at this
    // time and place conflicts, and a conflicted row must not add distance.
    const inserted = await db
      .insert(gpsPoints)
      .values({
        id: crypto.randomUUID(),
        recordedAt,
        lat: point.lat,
        lon: point.lon,
        accuracy: point.accuracy ?? null,
        source,
        countedKm: counts ? moved : 0,
        speedKmh,
        counted: counts ? 1 : 0,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .returning({ id: gpsPoints.id });

    if (!inserted.length) { duplicatePoints += 1; continue; }

    acceptedPoints += 1;
    if (counts) walked += moved;
    cursor = { lat: point.lat, lon: point.lon, at: recordedAt };
  }

  const last = ordered[ordered.length - 1];
  const counted = walked > 0;
  const projection = projectOntoRoute(stops, last.lat, last.lon);
  const alongKm = projection ? projection.alongKm : previousAlong;
  const offRouteKm = projection ? projection.offRouteKm : 0;
  const onRoute = offRouteKm <= OFF_ROUTE_KM;

  // Only ever move forward along the route.
  const progressKm = live ? Math.max(previousAlong, alongKm) : previousAlong;
  const reached = live
    ? stops.filter(stop => stop.km > previousAlong && stop.km <= progressKm).map(stop => stop.name)
    : [];

  const day = live ? dayOfWalk(startDate) : previous.day;
  const sameDay = day === previous.day;
  const distanceTotal = Math.round((previous.distanceTotal + walked) * 10) / 10;
  const distanceToday = Math.round(((sameDay ? previous.distanceToday : 0) + walked) * 10) / 10;

  const place = await reverseGeocode(last.lat, last.lon);
  let suggestion: TrackResult["suggestion"] = null;

  if (live && place && !onRoute && !alreadyOnRoute(stops, place.name, last.lat, last.lon)) {
    suggestion = await proposeStop(db, {
      name: place.name, state: place.state, lat: last.lat, lon: last.lon, alongKm,
      reason: `You are about ${Math.round(offRouteKm)} km off the planned line, near ${place.name}.`,
      stops,
    });
  }

  const next = nextStopAfter(stops, progressKm);
  const currentPlace = place ? [place.name, place.state].filter(Boolean).join(", ") : previous.currentPlace;

  const nextJourney = {
    ...previous,
    id: 1,
    lat: last.lat,
    lon: last.lon,
    day,
    distanceTotal: Math.min(10000, Math.max(0, distanceTotal)),
    distanceToday: Math.min(100, Math.max(0, distanceToday)),
    routeProgressKm: Math.min(10000, Math.max(0, progressKm)),
    offRouteKm: Math.min(2000, Math.max(0, offRouteKm)),
    currentPlace,
    updatedAt: new Date().toISOString(),
  };

  await db.insert(journey).values(nextJourney).onConflictDoUpdate({ target: journey.id, set: nextJourney });

  return {
    counted, movedKm: Math.round(walked * 100) / 100,
    acceptedPoints, duplicatePoints, rejected,
    alongKm: progressKm, offRouteKm, onRoute, reached,
    place: currentPlace, suggestion,
    reason: explain({ live, walked, acceptedPoints, duplicatePoints, rejected, onRoute, offRouteKm, reached, next: next?.name, suggestion }),
    journey: nextJourney,
  };
}

function explain(state: {
  live: boolean; walked: number; acceptedPoints: number; duplicatePoints: number;
  rejected: TrackResult["rejected"]; onRoute: boolean; offRouteKm: number;
  reached: string[]; next?: string; suggestion: TrackResult["suggestion"];
}) {
  if (!state.live) return "Position saved. Switch the journey to Live and the distance starts counting.";

  const parts: string[] = [];
  if (state.duplicatePoints && !state.acceptedPoints) {
    return `Already recorded — all ${state.duplicatePoints} point${state.duplicatePoints === 1 ? "" : "s"} were uploaded before, so nothing was counted twice.`;
  }
  if (state.walked > 0) parts.push(`Added ${(Math.round(state.walked * 10) / 10).toLocaleString("en-IN")} km.`);
  if (state.duplicatePoints) parts.push(`Skipped ${state.duplicatePoints} already recorded.`);
  if (state.rejected.tooFast) parts.push(`${state.rejected.tooFast} point${state.rejected.tooFast === 1 ? "" : "s"} moved too fast to have been walked — not counted.`);
  if (state.rejected.tooFar) parts.push("A jump too far to have been walked was not counted.");
  if (state.rejected.imprecise) parts.push(`${state.rejected.imprecise} fix${state.rejected.imprecise === 1 ? " was" : "es were"} too imprecise to count.`);
  if (!parts.length && state.rejected.drift) parts.push("You have barely moved, so nothing was added.");

  if (state.reached.length) parts.push(`Reached ${state.reached.join(", ")}.`);
  if (state.suggestion) parts.push(`New place found: ${state.suggestion.name}. Confirm it below to add it to the route.`);
  else if (!state.onRoute) parts.push(`About ${Math.round(state.offRouteKm)} km off the planned line.`);
  if (state.next) parts.push(`Next: ${state.next}.`);

  return parts.join(" ") || "Position updated.";
}

/** Today's totals, used to reset the day's distance at Indian midnight. */
export const trackingDayKey = istDayKey;

async function proposeStop(db: Db, input: {
  name: string; state: string; lat: number; lon: number; alongKm: number; reason: string; stops: RouteStop[];
}) {
  const km = insertionKm(input.stops, input.alongKm);
  if (km === null) return null;

  const [pending] = await db
    .select({ id: routeSuggestions.id })
    .from(routeSuggestions)
    .where(and(eq(routeSuggestions.name, input.name), eq(routeSuggestions.status, "pending")))
    .limit(1);
  if (pending) return null;

  const id = crypto.randomUUID();
  await db.insert(routeSuggestions).values({
    id, kind: "add_stop", name: input.name, state: input.state,
    lat: input.lat, lon: input.lon, km, reason: input.reason,
    status: "pending", createdAt: new Date().toISOString(),
  });

  return { id, name: input.name, state: input.state, km, reason: input.reason };
}
