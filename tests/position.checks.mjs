import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const geoSrc = readFileSync("lib/geo.ts", "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const mathSrc = readFileSync("lib/route-math.ts", "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const src = geoSrc + mathSrc + readFileSync("lib/position.ts", "utf8").replace(/^import .*$/gm, "");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { positioned, onCourse, OFF_ROUTE_KM, predictNext } = await import("data:text/javascript," + encodeURIComponent(js));

const BETTIAH = { lat: 26.810885, lon: 84.5193666, currentPlace: "Bettiah, Bihar" };

const cases = [
  // The bug this exists to prevent: standing 218 km off the line in Bihar and
  // being told the next stop is Nagercoil, 22 km away.
  ["off the route by 218 km", { ...BETTIAH, updatedAt: "2026-08-29T15:39:41Z", offRouteKm: 218 }, true, false],
  // A fresh database answers with a stock row and no timestamp. That is a
  // starting value, not a place anybody is standing.
  ["never had a fix", { lat: 26.8467, lon: 80.9462, offRouteKm: 0, updatedAt: null }, false, false],
  ["a fix on the line", { lat: 8.08, lon: 77.55, offRouteKm: 0.4, updatedAt: "2026-12-17T04:00:00Z" }, true, true],
  // The road wanders either side of a list of towns; that is not a detour.
  ["just inside the allowance", { lat: 8.08, lon: 77.55, offRouteKm: OFF_ROUTE_KM, updatedAt: "2026-12-17T04:00:00Z" }, true, true],
  ["just outside it", { lat: 8.08, lon: 77.55, offRouteKm: OFF_ROUTE_KM + 0.1, updatedAt: "2026-12-17T04:00:00Z" }, true, false],
  // An older row from before off-route was recorded must not be read as zero.
  ["no off-route figure recorded", { lat: 8.08, lon: 77.55, updatedAt: "2026-12-17T04:00:00Z" }, true, true],
];

for (const [name, journey, expectFix, expectCourse] of cases) {
  assert.equal(positioned(journey), expectFix, `${name}: positioned`);
  assert.equal(onCourse(journey), expectCourse, `${name}: onCourse`);
  console.log(`  ${expectCourse ? "tracking" : "quiet   "}  ${name}`);
}

// onCourse must never be true without a real position, whatever else is set.
assert.equal(onCourse({ lat: 1, lon: 1, offRouteKm: 0, updatedAt: "" }), false, "no timestamp means no tracking");
console.log("  quiet     an empty timestamp is not a position");

// --- the prediction, which is the whole point of the tracker ---------------
const ROUTE = [
  { name: "Kanyakumari", lat: 8.0883, lon: 77.5385, km: 0 },
  { name: "Varanasi", lat: 25.3176, lon: 82.9739, km: 2540 },
  { name: "Sultanpur", lat: 26.2648, lon: 82.0727, km: 2705 },
  { name: "Lucknow", lat: 26.8467, lon: 80.9462, km: 2860 },
  { name: "Hardoi", lat: 27.42, lon: 80.13, km: 2970 },
  { name: "Srinagar", lat: 34.0837, lon: 74.7973, km: 4270 },
];
const BETTIAH_FIX = { ...BETTIAH, updatedAt: "2026-08-29T15:39:41Z", offRouteKm: 218 };

const ahead = predictNext(ROUTE, BETTIAH_FIX);
assert.ok(ahead, "a position 218 km off the line must still predict a next stop");
assert.equal(ahead.next.name, "Sultanpur", "from Bettiah the next town up the route is Sultanpur");
assert.ok(ahead.strayed, "and it must admit how far off the line that was taken from");
assert.ok(ahead.toNextKm > 0, "the distance to it is ahead, not behind");
console.log(`  predict  Bettiah -> ${ahead.next.name}, ${Math.round(ahead.toNextKm)} km up the route, ${Math.round(ahead.offRouteKm)} km off the line`);

// Being just short of a town's centre point must not make that same town the
// next destination when reverse geocoding already says you are inside it.
const lucknow = predictNext(ROUTE, { lat: 26.80, lon: 81.02, currentPlace: "Lucknow, Uttar Pradesh", updatedAt: "2027-04-01T07:00:00Z" });
assert.equal(lucknow?.next.name, "Hardoi", "if the current town is Lucknow, the next stop cannot also be Lucknow");
console.log("  predict  in Lucknow -> Hardoi, never Lucknow again");

// No position at all is the one case that must stay silent.
assert.equal(predictNext(ROUTE, { lat: 26.8467, lon: 80.9462, updatedAt: null }), null, "no fix means no prediction");
console.log("  predict  no fix -> nothing claimed");

// A route too short to have a line cannot be projected onto.
assert.equal(predictNext([ROUTE[0]], BETTIAH_FIX), null, "a one-stop route cannot predict");
console.log("  predict  a one-stop route -> nothing claimed");
