import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
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
  // Counting starts on the day the walk starts, not on the day somebody
  // remembers to flip a switch.
  //
  // The tracker went live in preparation and immediately booked 28.5 km of a
  // bus ride from Bettiah to Raxaul as walked. The fixes were spaced far enough
  // apart that the speed guard saw a plausible walking pace between them, so
  // nothing caught it - and a site whose whole claim is that the distance is
  // real cannot be counting travel months before the first step.
  //
  // Before the start date the position is still recorded, so the map and the
  // pin follow him around; it just does not add up to anything. On the morning
  // of the start date it begins counting by itself, with nothing to remember.
  const started = dayOfWalk(startDate) >= 1;
  const live = previous.mode === "live" && started;
  // And the walk announces itself. On the morning of the start date the mode
  // flips on the first position of the day, so nobody has to remember to.
  const becomesLive = started && previous.mode !== "live";
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

  const day = started ? dayOfWalk(startDate) : previous.day;
  // Both figures are added up from the recorded points rather than carried
  // forward, so they cannot drift. See totals() below.
  const { distanceTotal, distanceToday } = await totals(db);

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

  const phoneTime = last.at ? new Date(last.at) : null;
  const phoneUpdatedAt = phoneTime && Number.isFinite(phoneTime.getTime()) && phoneTime.getTime() <= Date.now() + 5 * 60000
    ? phoneTime.toISOString()
    : new Date().toISOString();

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
    // The walk announces itself on the morning of the start date rather than
    // waiting for somebody to remember a dropdown.
    ...(becomesLive ? { mode: "live" as const } : {}),
    // This is the time of the GPS fix, not the time a delayed batch happened
    // to reach the server. The age shown on the site therefore describes the
    // evidence itself.
    updatedAt: phoneUpdatedAt,
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
  if (!state.live) return "Position saved. Distance starts counting on the first day of the walk.";

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
 */
export async function totals(db: Db) {
  const [summed] = await db
    .select({ km: sql<number>`coalesce(sum(${gpsPoints.countedKm}), 0)` })
    .from(gpsPoints)
    .where(eq(gpsPoints.counted, 1));

  // Only the last couple of days can belong to today, whichever side of
  // midnight the recording clock was on.
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const recent = await db
    .select({ recordedAt: gpsPoints.recordedAt, countedKm: gpsPoints.countedKm })
    .from(gpsPoints)
    .where(and(eq(gpsPoints.counted, 1), gte(gpsPoints.recordedAt, since)));

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
  const { distanceTotal, distanceToday } = await totals(db);
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
  const placePatch: { currentPlace?: string } = {};
  if (Number.isFinite(previous.lat) && Number.isFinite(previous.lon)) {
    const place = await reverseGeocode(previous.lat, previous.lon);
    const named = place ? [place.name, place.state].filter(Boolean).join(", ") : "";
    if (named && named !== previous.currentPlace) placePatch.currentPlace = named;
  }

  const figuresMatch = distanceTotal === previous.distanceTotal
    && distanceToday === previous.distanceToday
    && day === previous.day;
  if (figuresMatch && !placePatch.currentPlace && !(started && previous.mode !== "live")) return null;

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
