import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const src = readFileSync("lib/position.ts", "utf8").replace(/^import .*$/gm, "");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { positioned, onCourse, OFF_ROUTE_KM } = await import("data:text/javascript," + encodeURIComponent(js));

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
