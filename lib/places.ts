/**
 * Turning coordinates into a place name.
 *
 * Uses OpenStreetMap's Nominatim, which is free and needs no key. Its usage
 * policy asks for an identifying User-Agent and light traffic; a walk produces
 * a handful of lookups a day, well inside that.
 *
 * Every failure path returns null rather than throwing. Not knowing the name of
 * a town must never cost Navneet a GPS sync.
 */

export type Place = { name: string; state: string };

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

export async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  try {
    const url = `${ENDPOINT}?format=jsonv2&zoom=12&lat=${lat}&lon=${lon}`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "a-long-walk (walk tracker; https://github.com/polymathnavneet/k2kwebsite)",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;

    const result = await response.json() as { address?: Record<string, string> };
    const address = result.address ?? {};

    // Prefer the smallest named settlement, then fall back outward.
    const name =
      address.city || address.town || address.village || address.municipality ||
      address.suburb || address.county || address.state_district || "";
    const state = address.state || "";

    if (!name) return null;
    return { name: name.trim().slice(0, 80), state: state.trim().slice(0, 80) };
  } catch {
    return null;
  }
}
