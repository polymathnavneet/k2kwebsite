import { and, asc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { journey, routeConfig, routeStops, routeSuggestions } from "@/db/schema";
import { defaultJourney, defaultRoute } from "@/lib/defaults";
import { dayOfWalk, distanceKm } from "@/lib/geo";
import { reverseGeocode } from "@/lib/places";
import { alreadyOnRoute, insertionKm, nextStopAfter, projectOntoRoute } from "@/lib/route-math";
import type { RouteStop } from "@/lib/types";

type Db = DrizzleD1Database<typeof schema>;

/** A move smaller than this is GPS drift, not walking. */
export const MIN_MOVE_KM = 0.1;
/** A move larger than this was a vehicle, not walking. */
export const MAX_MOVE_KM = 150;
/** Beyond this from the planned line, the route is treated as having changed. */
export const OFF_ROUTE_KM = 12;

export type TrackPoint = { lat: number; lon: number; at?: string };

export type TrackResult = {
  counted: boolean;
  movedKm: number;
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
 * Take one or more GPS fixes and work out everything that follows from them:
 * how far was walked, where that is along the route, which stops have been
 * passed, and whether the route itself now looks wrong.
 *
 * Distance walked and position along the route are deliberately two separate
 * numbers. Adding up the gaps between fixes says how far the legs went;
 * projecting onto the line says which town is next. A detour makes them differ,
 * and pretending they are one number is how a tracker starts lying.
 */
export async function processPoints(db: Db, points: TrackPoint[]): Promise<TrackResult> {
  const stops = await loadStops(db);
  const [config] = await db.select().from(routeConfig).where(eq(routeConfig.id, 1)).limit(1);
  const [existing] = await db.select().from(journey).where(eq(journey.id, 1)).limit(1);

  const previous = existing ?? { id: 1, ...defaultJourney, routeProgressKm: 0, offRouteKm: 0 };
  const startDate = config?.startDate ?? defaultRoute.startDate;
  const live = previous.mode === "live";

  const last = points[points.length - 1];
  const previousAlong = Number(previous.routeProgressKm) || 0;

  // Distance walked: each hop measured and screened on its own, so one bad fix
  // in a batch cannot poison the rest.
  let walked = 0;
  let cursorLat = previous.lat;
  let cursorLon = previous.lon;
  let anyCounted = false;
  let sawJump = false;
  let sawDrift = false;

  for (const point of points) {
    const moved = distanceKm(cursorLat, cursorLon, point.lat, point.lon);
    if (moved > MAX_MOVE_KM) sawJump = true;
    else if (moved < MIN_MOVE_KM) sawDrift = true;
    else { walked += moved; anyCounted = true; }
    cursorLat = point.lat;
    cursorLon = point.lon;
  }

  const counted = live && anyCounted;
  const projection = projectOntoRoute(stops, last.lat, last.lon);
  const alongKm = projection ? projection.alongKm : previousAlong;
  const offRouteKm = projection ? projection.offRouteKm : 0;
  const onRoute = offRouteKm <= OFF_ROUTE_KM;

  // Only ever move forward along the route. Wandering into a market and back
  // out must not un-reach a town that has already been walked through.
  const progressKm = live ? Math.max(previousAlong, alongKm) : previousAlong;
  const reached = live
    ? stops.filter(stop => stop.km > previousAlong && stop.km <= progressKm).map(stop => stop.name)
    : [];

  const day = live ? dayOfWalk(startDate) : previous.day;
  const sameDay = day === previous.day;
  const distanceTotal = counted ? Math.round((previous.distanceTotal + walked) * 10) / 10 : previous.distanceTotal;
  const distanceToday = counted
    ? Math.round(((sameDay ? previous.distanceToday : 0) + walked) * 10) / 10
    : sameDay ? previous.distanceToday : 0;

  // Name the place, and decide whether it is worth asking about.
  const place = await reverseGeocode(last.lat, last.lon);
  let suggestion: TrackResult["suggestion"] = null;

  if (live && place && !onRoute && !alreadyOnRoute(stops, place.name, last.lat, last.lon)) {
    suggestion = await proposeStop(db, {
      name: place.name,
      state: place.state,
      lat: last.lat,
      lon: last.lon,
      alongKm,
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
    counted,
    movedKm: Math.round(walked * 100) / 100,
    alongKm: progressKm,
    offRouteKm,
    onRoute,
    reached,
    place: currentPlace,
    suggestion,
    reason: explain({ live, counted, walked, sawJump, sawDrift, onRoute, offRouteKm, reached, next: next?.name, suggestion }),
    journey: nextJourney,
  };
}

function explain(state: {
  live: boolean; counted: boolean; walked: number; sawJump: boolean; sawDrift: boolean;
  onRoute: boolean; offRouteKm: number; reached: string[]; next?: string;
  suggestion: TrackResult["suggestion"];
}) {
  if (!state.live) return "Position saved. Switch the journey to Live and the distance starts counting.";

  const parts: string[] = [];
  if (state.counted) parts.push(`Added ${(Math.round(state.walked * 10) / 10).toLocaleString("en-IN")} km.`);
  else if (state.sawJump) parts.push("That was too far to have been walked, so only the map pin moved.");
  else if (state.sawDrift) parts.push("You have barely moved, so nothing was added to the distance.");

  if (state.reached.length) parts.push(`Reached ${state.reached.join(", ")}.`);
  if (state.suggestion) parts.push(`New place found: ${state.suggestion.name}. Confirm it below to add it to the route.`);
  else if (!state.onRoute) parts.push(`About ${Math.round(state.offRouteKm)} km off the planned line.`);
  if (state.next) parts.push(`Next: ${state.next}.`);

  return parts.join(" ") || "Position updated.";
}

/**
 * Record a place for Navneet to confirm. Never edits the route itself - a
 * detour round a bad bridge should not silently rewrite the plan.
 */
async function proposeStop(db: Db, input: {
  name: string; state: string; lat: number; lon: number; alongKm: number; reason: string; stops: RouteStop[];
}) {
  const km = insertionKm(input.stops, input.alongKm);
  if (km === null) return null;

  // Do not ask twice about the same place.
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
