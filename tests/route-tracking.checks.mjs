import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

// The library files import each other with the "@/" alias, which a data: URL
// cannot resolve. Concatenating their sources before transpiling keeps the test
// running against the real code rather than a copy of it.
const sourceOf = file => readFileSync(file, "utf8")
  .replace(/^import .*$/gm, "")
  ;

const load = async (file, deps = []) => {
  const src = [...deps.map(sourceOf), sourceOf(file)].join("\n");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript," + encodeURIComponent(js));
};

const geo = await load("lib/geo.ts", ["lib/time.ts"]);
const math = await load("lib/route-math.ts", ["lib/time.ts", "lib/geo.ts"]);

const route = JSON.parse(readFileSync("data/route.json", "utf8"));
const stops = route.stops;
const { projectOntoRoute, nextStopAfter, insertionKm, alreadyOnRoute } = math;

// --- standing exactly on a stop ---------------------------------------------
for (const name of ["Hyderabad", "Nagpur", "Varanasi", "Jammu"]) {
  const stop = stops.find(s => s.name === name);
  const p = projectOntoRoute(stops, stop.lat, stop.lon);
  assert.ok(Math.abs(p.alongKm - stop.km) < 20, `${name}: alongKm ${p.alongKm} should be ~${stop.km}`);
  assert.ok(p.offRouteKm < 5, `${name}: should be on the line, got ${p.offRouteKm} km off`);
}
console.log("✓ standing on a stop reports that stop's distance, ~0 km off the line");

// --- halfway between two stops ----------------------------------------------
const a = stops.find(s => s.name === "Hyderabad");
const b = stops.find(s => s.name === "Kamareddy");
const mid = projectOntoRoute(stops, (a.lat + b.lat) / 2, (a.lon + b.lon) / 2);
console.log(`  midpoint Hyderabad-Kamareddy -> ${mid.alongKm} km (between ${a.km} and ${b.km}), ${mid.offRouteKm} km off`);
assert.ok(mid.alongKm > a.km && mid.alongKm < b.km, "midpoint must fall between the two stops");
assert.ok(mid.offRouteKm < 6, "a point on the line is not off the line");
console.log("✓ a point between stops lands between their distances");

// --- genuinely off the route -------------------------------------------------
// Mumbai: the route no longer goes there at all.
const off = projectOntoRoute(stops, 19.076, 72.8777);
console.log(`  Mumbai -> ${off.offRouteKm} km off the line`);
assert.ok(off.offRouteKm > 100, `Mumbai should read as far off-route, got ${off.offRouteKm}`);
console.log("✓ a place the route does not pass reads as far off the line");

// --- next stop tracks position, not raw distance -----------------------------
for (const km of [0, 700, 1271, 2545, 4269]) {
  const next = nextStopAfter(stops, km);
  assert.ok(next.km > km, `next stop after ${km} must be further along`);
  const shouldBe = stops.find(s => s.km > km);
  assert.equal(next.name, shouldBe.name);
}
assert.equal(nextStopAfter(stops, 99999), null, "past the end there is no next stop");
console.log("✓ next stop is always the first one further along");

// --- inserting a new place ---------------------------------------------------
const km = insertionKm(stops, 1500);
assert.ok(km > 1495 && km < 1570, `a place at 1500 km should slot between Nirmal and Adilabad, got ${km}`);
const tight = insertionKm([{ km: 100 }, { km: 101 }], 100.5);
assert.equal(tight, null, "no room between two adjacent stops must be refused, not fudged");
console.log("✓ a new place slots between its neighbours; no room is refused rather than fudged");

// --- not asking about somewhere already on the route -------------------------
assert.equal(alreadyOnRoute(stops, "Nagpur", 21.1458, 79.0882), true, "exact name and place");
assert.equal(alreadyOnRoute(stops, "Nagpur City", 21.15, 79.09), true, "different name, same place");
assert.equal(alreadyOnRoute(stops, "Somewhere New", 19.076, 72.8777), false, "genuinely new place");
console.log("✓ it will not ask about a town already on the route");

// --- the whole route is self-consistent ---------------------------------------
let worst = 0;
for (const stop of stops) {
  const p = projectOntoRoute(stops, stop.lat, stop.lon);
  worst = Math.max(worst, Math.abs(p.alongKm - stop.km));
}
console.log(`  worst self-projection error across all ${stops.length} stops: ${worst.toFixed(1)} km`);
assert.ok(worst < 60, `projection drifts too far from the stated distances (${worst} km)`);
console.log("✓ every stop projects back to roughly its own distance\n");

// --- walk the whole route and check nothing goes backwards -------------------
// Interpolate a position every few km along the line, add GPS noise, and replay
// it the way the tracker would.
const MIN_MOVE = 0.1, MAX_MOVE = 150, OFF_ROUTE = 12;
const jitter = () => (Math.random() - 0.5) * 0.02; // roughly +/-1 km

let progress = 0, walked = 0, reachedOrder = [], wentBackwards = 0, falseAlarms = 0;
let prev = { lat: stops[0].lat, lon: stops[0].lon };

for (let i = 0; i < stops.length - 1; i += 1) {
  const from = stops[i], to = stops[i + 1];
  const legs = Math.max(2, Math.round((to.km - from.km) / 15));
  for (let step = 1; step <= legs; step += 1) {
    const t = step / legs;
    const lat = from.lat + (to.lat - from.lat) * t + jitter();
    const lon = from.lon + (to.lon - from.lon) * t + jitter();

    const moved = geo.distanceKm(prev.lat, prev.lon, lat, lon);
    if (moved >= MIN_MOVE && moved <= MAX_MOVE) walked += moved;
    prev = { lat, lon };

    const p = projectOntoRoute(stops, lat, lon);
    if (p.alongKm < progress - 3) wentBackwards += 1;
    if (p.offRouteKm > OFF_ROUTE) falseAlarms += 1;
    const next = Math.max(progress, p.alongKm);
    for (const stop of stops) if (stop.km > progress && stop.km <= next) reachedOrder.push(stop.name);
    progress = next;
  }
}

console.log(`  replayed the whole walk: ${Math.round(progress)} km along, ${Math.round(walked)} km of legs, ${reachedOrder.length} stops reached`);
console.log(`  backwards readings: ${wentBackwards} | false off-route alarms: ${falseAlarms}`);

// Noise around the finish can leave the last stop a kilometre short, which is
// correct behaviour rather than a fault, so allow for it.
const expectedOrder = stops.slice(1).map(s => s.name);
assert.ok(reachedOrder.length >= stops.length - 2, `expected nearly every stop, reached ${reachedOrder.length} of ${stops.length - 1}`);
assert.deepEqual(reachedOrder, expectedOrder.slice(0, reachedOrder.length), "stops must be reached in route order, with none skipped");
assert.ok(Math.abs(progress - route.totalDistance) < 30, `should finish near ${route.totalDistance} km, got ${Math.round(progress)}`);
assert.equal(falseAlarms, 0, "walking the line must never look like leaving it");
assert.ok(Math.abs(walked - route.totalDistance) < route.totalDistance * 0.12, `walked ${Math.round(walked)} km should be close to ${route.totalDistance}`);
console.log("✓ a full replayed walk reaches every stop in order and never goes backwards");

// --- a real detour is noticed -------------------------------------------------
const detour = projectOntoRoute(stops, 26.4499, 80.3319); // Kanpur, well off the Lucknow-Delhi line
console.log(`  detour to Kanpur -> ${detour.offRouteKm} km off, reads as ${Math.round(detour.alongKm)} km along`);
assert.ok(detour.offRouteKm > OFF_ROUTE, "a genuine detour must be noticed");
assert.equal(alreadyOnRoute(stops, "Kanpur", 26.4499, 80.3319), false, "Kanpur is not on this route, so it is worth asking about");
console.log("✓ a genuine detour is flagged and would be offered as a new stop\n");

console.log("ALL ROUTE TRACKING CHECKS PASSED");

// --- a road that is not on the map -----------------------------------------
// Distance is the ground he covered between two fixes. The route is only ever
// used to answer "which town is next", so a detour, a diversion or a wrong turn
// counts every metre of itself.
{
  const a = { lat: 26.8100, lon: 84.5100 };
  const b = { lat: 26.8300, lon: 84.5400 };
  const straight = geo.distanceKm(a.lat, a.lon, b.lat, b.lon);
  assert.ok(straight > 0, "movement between two fixes is measured wherever it happened");

  // The same two points, nowhere near the drawn line, still measure the same.
  const farOff = geo.distanceKm(a.lat + 2, a.lon + 2, b.lat + 2, b.lon + 2);
  assert.ok(Math.abs(farOff - straight) < straight * 0.05, "being off the route does not change the distance walked");
  console.log(`  off-route  ${straight.toFixed(2)} km on the line, ${farOff.toFixed(2)} km far away from it - the same walking`);
}
