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

/**
 * How closely to ask.
 *
 * Twelve is too coarse for India. Standing in Lucknow it answered with no
 * settlement at all - no city, no town, no village - leaving only the
 * administrative blocks around it. Fourteen resolves the actual settlement:
 * the same query that returned nothing usable in Lucknow returns "Kanyakumari"
 * at the southern tip, where twelve returned only the taluk it sits in.
 */
const ZOOM = 14;

/**
 * Which of Nominatim's fields is the place a person would name.
 *
 * `county` is deliberately absent, and this is the whole point of the list.
 * In India Nominatim puts the *tehsil* in `county` - an administrative block
 * tens of kilometres across, named after one town inside it. Standing in
 * Lucknow, `county` reads "Sarojani Nagar", and Sarojini Nagar proper is a
 * thirty-kilometre drive from where the phone actually was. The site published
 * that name and was, quite fairly, accused of broadcasting the wrong location.
 *
 * The same trap is set the entire length of the route: "Agastheeswaram" at
 * Kanyakumari, "Huzur Tahsil" at Rewa, "Nampally mandal" in Hyderabad,
 * "Bangalore North" in Bengaluru, "Nagpur Urban Taluka", "Madurai South",
 * "Srinagar (South)". Not one of them is where a reader would understand him
 * to be. `city_district` is left out for the same reason - it is the taluk
 * again at Kanyakumari.
 *
 * So: the settlement if there is one, and failing that the district, which is
 * at least genuinely the place he is standing in rather than a label borrowed
 * from a town down the road.
 */
const NAME_FIELDS = ["city", "town", "village", "municipality", "state_district"] as const;

/** "Jammu district" is how a person says "Jammu". */
const tidy = (value: string) => value.trim().replace(/\s+district$/i, "").slice(0, 80);

export async function reverseGeocode(lat: number, lon: number): Promise<Place | null> {
  try {
    // Ask for English names. Without this Nominatim answers in the local
    // script, and the site reported "वीरगञ्ज, मधेश प्रदेश" on an English page
    // the moment the walk touched the Nepal border. The same would have
    // happened in Tamil, Kannada and Telugu the whole way up the route.
    const url = `${ENDPOINT}?format=jsonv2&zoom=${ZOOM}&accept-language=en&lat=${lat}&lon=${lon}`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "a-long-walk (walk tracker; https://github.com/polymathnavneet/k2kwebsite)",
        "accept-language": "en",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;

    const result = await response.json() as { address?: Record<string, string> };
    const address = result.address ?? {};

    const name = pickName(address);
    if (!name) return null;
    return { name, state: tidy(address.state ?? "") };
  } catch {
    return null;
  }
}

/** Exported so the choice can be tested without calling Nominatim. */
export function pickName(address: Record<string, string>): string {
  for (const field of NAME_FIELDS) {
    const value = address[field];
    if (value && value.trim()) return tidy(value);
  }
  return "";
}
