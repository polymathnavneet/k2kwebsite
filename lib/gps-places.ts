import { env } from "cloudflare:workers";

/**
 * Keep a separate list of named places proved by the tracker.
 *
 * Route stops are useful for forecasts, but they are still plans. This table is
 * evidence only: a place is inserted after a real GPS update has been processed
 * and the reverse geocoder has named that position.
 */
export async function recordGpsPlace(input: {
  place: string;
  lat: number;
  lon: number;
  distanceKm?: number;
  recordedAt?: string;
  live: boolean;
}) {
  if (!input.live || !input.place || !Number.isFinite(input.lat) || !Number.isFinite(input.lon)) return;

  const parts = input.place.split(",").map(part => part.trim()).filter(Boolean);
  const name = parts[0]?.slice(0, 100) ?? "";
  const state = parts.slice(1).join(", ").slice(0, 120);
  if (!name) return;

  const at = input.recordedAt && Number.isFinite(new Date(input.recordedAt).getTime())
    ? new Date(input.recordedAt).toISOString()
    : new Date().toISOString();
  const distance = Number.isFinite(input.distanceKm) ? Math.max(0, Number(input.distanceKm)) : 0;
  const db = (env as unknown as { DB: D1Database }).DB;

  await db.prepare(`
    INSERT INTO gps_places (name, state, lat, lon, first_seen, last_seen, sightings, distance_km)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(name, state) DO UPDATE SET
      lat = excluded.lat,
      lon = excluded.lon,
      last_seen = excluded.last_seen,
      sightings = gps_places.sightings + 1,
      distance_km = excluded.distance_km
  `).bind(name, state, input.lat, input.lon, at, at, distance).run();
}
