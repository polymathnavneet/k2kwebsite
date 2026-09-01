import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guards the rule that decides when the site asks OpenStreetMap what a
 * position is called.
 *
 * The failure this prevents is not hypothetical. OwnTracks queues every
 * position it cannot deliver; Navneet's phone sat behind a DNS failure with
 * 3,834 of them waiting. Each one arrives as its own request, and each one used
 * to ask Nominatim - a free service that asks for one request a second and bans
 * clients that ignore it - for a name. Losing Nominatim costs the site every
 * place name for the remaining six months of the walk.
 *
 * shouldName() is lifted out of lib/tracking.ts rather than reimplemented, so
 * the test cannot drift away from the code it is guarding.
 */
const src = readFileSync("lib/tracking.ts", "utf8");

const consts = {};
for (const key of ["NAME_MIN_MOVE_KM", "NAME_MAX_AGE_MIN", "NAME_FAR_KM"]) {
  const found = src.match(new RegExp(`export const ${key} = ([\\d.]+);`));
  assert.ok(found, `${key} is missing from lib/tracking.ts`);
  consts[key] = Number(found[1]);
}

const body = src.match(/export function shouldName\(input: \{[\s\S]*?\n\}\n/);
assert.ok(body, "could not find shouldName() in lib/tracking.ts");

const js = body[0]
  .replace(/export function/, "function")
  .replace(/input: \{[\s\S]*?\}\): boolean/, "input)");

// The real distance function, so the thresholds are measured in real kilometres.
const geo = readFileSync("lib/geo.ts", "utf8");
const distance = geo.match(/export function distanceKm\([\s\S]*?\n\}\n/);
assert.ok(distance, "could not find distanceKm() in lib/geo.ts");

const shouldName = new Function(
  `const NAME_MIN_MOVE_KM = ${consts.NAME_MIN_MOVE_KM};
   const NAME_MAX_AGE_MIN = ${consts.NAME_MAX_AGE_MIN};
   const NAME_FAR_KM = ${consts.NAME_FAR_KM};
   ${distance[0].replace(/export function/, "function").replace(/: number/g, "")}
   ${js}
   return shouldName;`
)();

const LUCKNOW = { lat: 26.7760852, lon: 80.9951978 };
const named = { namedLat: LUCKNOW.lat, namedLon: LUCKNOW.lon, named: "Lucknow, Uttar Pradesh" };
const NOW = Date.parse("2026-09-01T08:20:00+05:30");
const minutesAgo = m => new Date(NOW - m * 60000).toISOString();

/* -------------------------------------------------- the queue flush itself */

// A phone that has not moved. GPS jitter is tens of metres; none of it is
// travel, and none of it deserves a lookup.
let lookups = 0;
for (let i = 0; i < 3834; i += 1) {
  const jitterKm = 0.02;
  const point = {
    ...named,
    lat: LUCKNOW.lat + (Math.sin(i) * jitterKm) / 111,
    lon: LUCKNOW.lon + (Math.cos(i) * jitterKm) / 111,
    recordedAt: minutesAgo(540 - i * 0.14),
    now: NOW,
  };
  if (shouldName(point)) lookups += 1;
}
assert.equal(lookups, 0, "a stationary phone must not ask for a single name");
console.log("# ✓ 3,834 queued fixes from a phone standing still cost 0 lookups");

/* --------------------------------------- a backlog that crossed the country */

// Ghaziabad to Lucknow by train, a fix every eight seconds, all of it hours
// old by the time it is delivered. It must cost tens of lookups, not thousands.
const GHAZIABAD = { lat: 28.6692, lon: 77.4538 };
let namedAt = { lat: GHAZIABAD.lat, lon: GHAZIABAD.lon };
lookups = 0;
const steps = 2500;
for (let i = 1; i <= steps; i += 1) {
  const fraction = i / steps;
  const point = {
    namedLat: namedAt.lat,
    namedLon: namedAt.lon,
    named: "Ghaziabad, Uttar Pradesh",
    lat: GHAZIABAD.lat + (LUCKNOW.lat - GHAZIABAD.lat) * fraction,
    lon: GHAZIABAD.lon + (LUCKNOW.lon - GHAZIABAD.lon) * fraction,
    recordedAt: minutesAgo(300 - fraction * 240),
    now: NOW,
  };
  if (shouldName(point)) {
    lookups += 1;
    namedAt = { lat: point.lat, lon: point.lon };
  }
}
assert.ok(lookups > 0, "a 480 km backlog must still be named somewhere");
assert.ok(lookups < 40, `a 480 km backlog cost ${lookups} lookups, which is too many`);
console.log(`# ✓ a 480 km backlog of 2,500 fixes costs ${lookups} lookups, not 2,500`);

/* ------------------------------------------------------- and the live walk */

// The point of all of it: where he is now is always named.
assert.equal(
  shouldName({ ...named, lat: LUCKNOW.lat + 0.01, lon: LUCKNOW.lon, recordedAt: minutesAgo(0), now: NOW }),
  true,
  "a fresh fix a kilometre away must be named",
);
assert.equal(
  shouldName({ ...named, lat: LUCKNOW.lat + 0.0025, lon: LUCKNOW.lon, recordedAt: minutesAgo(0), now: NOW }),
  true,
  "277 m is past the threshold and must be named",
);
assert.equal(
  shouldName({ ...named, lat: LUCKNOW.lat + 0.001, lon: LUCKNOW.lon, recordedAt: minutesAgo(0), now: NOW }),
  false,
  "111 m is not going anywhere",
);
console.log("# ✓ a fix from now is named as soon as he has moved 200 m");

// Walking pace: one lookup every couple of minutes, well inside Nominatim's
// one-a-second policy.
let walkNamed = { lat: LUCKNOW.lat, lon: LUCKNOW.lon };
lookups = 0;
for (let minute = 1; minute <= 480; minute += 1) {
  const km = (4 * minute) / 60; // 4 km/h, eight hours of walking
  const point = {
    namedLat: walkNamed.lat,
    namedLon: walkNamed.lon,
    named: "Lucknow, Uttar Pradesh",
    lat: LUCKNOW.lat + km / 111,
    lon: LUCKNOW.lon,
    recordedAt: minutesAgo(0),
    now: NOW,
  };
  if (shouldName(point)) {
    lookups += 1;
    walkNamed = { lat: point.lat, lon: point.lon };
  }
}
assert.ok(lookups >= 100 && lookups <= 180, `eight hours of walking cost ${lookups} lookups`);
console.log(`# ✓ eight hours of real walking costs ${lookups} lookups — one every few minutes`);

/* ------------------------------------------------------------ never silent */

// If there is no name to carry forward, the rules do not apply: an unnamed
// position must always be named, or the site shows nothing at all.
assert.equal(shouldName({ ...named, named: "", lat: LUCKNOW.lat, lon: LUCKNOW.lon, recordedAt: minutesAgo(0), now: NOW }), true);
assert.equal(shouldName({ namedLat: null, namedLon: null, named: "Lucknow", lat: LUCKNOW.lat, lon: LUCKNOW.lon, recordedAt: minutesAgo(0), now: NOW }), true,
  "the first fix after this shipped has nowhere to measure from and must be named");
console.log("# ✓ a position with no name to fall back on is always named");

// A clock that has run backwards must not suppress the name.
assert.equal(
  shouldName({ ...named, lat: LUCKNOW.lat + 0.01, lon: LUCKNOW.lon, recordedAt: new Date(NOW + 600000).toISOString(), now: NOW }),
  true,
  "a fix timestamped in the future is not a backlog",
);
assert.equal(
  shouldName({ ...named, lat: LUCKNOW.lat + 0.01, lon: LUCKNOW.lon, recordedAt: "not a time", now: NOW }),
  true,
  "an unreadable timestamp must not be treated as history",
);
console.log("# ✓ a bad or future timestamp never costs him his place name");

assert.equal(consts.NAME_MIN_MOVE_KM, 0.2);
assert.equal(consts.NAME_MAX_AGE_MIN, 30);
assert.equal(consts.NAME_FAR_KM, 25);
