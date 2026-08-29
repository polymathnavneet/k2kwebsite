import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// The library files import each other with the "@/" alias, which a data: URL
// cannot resolve. Concatenating their sources keeps the test running against
// the real code rather than a copy of it.
import ts from "typescript";

const sourceOf = file => readFileSync(file, "utf8")
  .replace(/^import .*$/gm, "")
  ;

const geoSrc = [sourceOf("lib/time.ts"), sourceOf("lib/geo.ts")].join("\n");
const { distanceKm, dayOfWalk, livePace } = await import(
  "data:text/javascript," + encodeURIComponent(
    ts.transpileModule(geoSrc, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  )
);

const route = JSON.parse(readFileSync("data/route.json", "utf8"));
const fmt = d => d.toISOString().slice(0, 10);

console.log("ROUTE:", route.startDate, "|", route.totalDistance, "km |", route.stops.length, "stops");
assert.equal(route.startDate, "2026-12-17", "start date must be 17 Dec 2026");
assert.equal(route.totalDistance, 4270, "total must be 4270 km");
const names = route.stops.map(s => s.name);
assert.ok(names.indexOf("Hyderabad") < names.indexOf("Nagpur"), "Hyderabad must come before Nagpur");
assert.ok(!names.includes("Mumbai"), "Mumbai must be gone");
let previousKm = -1;
for (const stop of route.stops) {
  assert.ok(stop.km > previousKm || stop.km === 0, `stops must increase in km: ${stop.name}`);
  assert.ok(stop.lat >= 6 && stop.lat <= 36 && stop.lon >= 68 && stop.lon <= 98, `${stop.name} is outside India`);
  assert.ok(stop.name && stop.state, `${stop.name} is missing a name or state`);
  previousKm = stop.km;
}
const gaps = route.stops.slice(1).map((s, i) => s.km - route.stops[i].km);
assert.ok(Math.max(...gaps) <= 200, `longest gap is ${Math.max(...gaps)} km - too far between stops`);
assert.equal(route.stops.at(-1).km, route.totalDistance, "the last stop must be the total distance");
console.log(`✓ ${route.stops.length} stops, all in order and inside India, longest gap ${Math.max(...gaps)} km`);
console.log("✓ start date, distance, Hyderabad-before-Nagpur, no Mumbai\n");

// --- GPS accumulation, mirroring app/api/gps/route.ts -----------------------
const MIN = 0.1, MAX = 150;
function gpsSync(state, lat, lon, { live = true } = {}) {
  const moved = distanceKm(state.lat, state.lon, lat, lon);
  const counted = live && moved >= MIN && moved <= MAX;
  return {
    ...state, lat, lon,
    distanceTotal: counted ? Math.round((state.distanceTotal + moved) * 10) / 10 : state.distanceTotal,
    moved: Math.round(moved * 100) / 100, counted,
  };
}

let s = { lat: 8.0883, lon: 77.5385, distanceTotal: 0 };
// A phone drifting 30 m while stationary must not add distance.
s = gpsSync(s, 8.08857, 77.5385);
console.log(`drift ${(s.moved*1000).toFixed(0)} m -> counted: ${s.counted}, total ${s.distanceTotal} km`);
assert.equal(s.counted, false, "GPS drift must not inflate the distance");

// A real 24 km walking day.
s = gpsSync({ ...s }, 8.3043, 77.5385);
console.log(`walked ${s.moved} km -> counted: ${s.counted}, total ${s.distanceTotal} km`);
assert.equal(s.counted, true);
assert.ok(s.distanceTotal > 23 && s.distanceTotal < 25);

// A 700 km bus ride must move the pin but not the distance.
const before = s.distanceTotal;
s = gpsSync({ ...s }, 17.385, 78.4867);
console.log(`jump ${s.moved} km -> counted: ${s.counted}, total still ${s.distanceTotal} km`);
assert.equal(s.counted, false, "a bus ride must not count as walking");
assert.equal(s.distanceTotal, before);
assert.equal(s.lat, 17.385, "but the map pin should still move");

// Before the walk goes live, nothing accumulates.
const prep = gpsSync({ lat: 8.0883, lon: 77.5385, distanceTotal: 0 }, 8.3043, 77.5385, { live: false });
assert.equal(prep.counted, false, "preparation mode must not accumulate");
console.log("✓ drift ignored, walking counted, bus ignored, preparation safe\n");

// --- Dates move with pace, mirroring components/route-view.tsx --------------
function plan(distanceTotal, day, live = true) {
  const pace = live ? livePace(distanceTotal, day, route.paceKmPerDay) : route.paceKmPerDay;
  const base = live ? new Date("2027-02-01T12:00:00Z") : new Date(`${route.startDate}T12:00:00Z`);
  const stops = route.stops.map(s => ({
    name: s.name, km: s.km, reached: live && s.km <= distanceTotal,
    eta: new Date(base.getTime() + Math.max(0, s.km - (live ? distanceTotal : 0)) / pace * 86400000),
  }));
  return { pace, stops, finish: fmt(stops.at(-1).eta), next: stops.find(s => !s.reached), reached: stops.filter(s => s.reached).length };
}

const before2 = plan(0, 0, false);
console.log(`preparation      pace ${before2.pace.toFixed(1)}  finish ${before2.finish}`);
const onPlan = plan(1250, 50);
console.log(`on plan  1250km  pace ${onPlan.pace.toFixed(1)}  finish ${onPlan.finish}  next ${onPlan.next.name}  reached ${onPlan.reached}`);
const fast = plan(1900, 50);
console.log(`fast     1900km  pace ${fast.pace.toFixed(1)}  finish ${fast.finish}  next ${fast.next.name}`);
const slow = plan(700, 50);
console.log(`slow      700km  pace ${slow.pace.toFixed(1)}  finish ${slow.finish}  next ${slow.next.name}`);

assert.ok(new Date(fast.finish) < new Date(onPlan.finish), "walking faster must pull the finish earlier");
assert.ok(new Date(slow.finish) > new Date(onPlan.finish), "walking slower must push the finish later");
// Assert the rule, not a particular city: the next stop is always the first
// one further along than the distance walked. This keeps the test honest when
// stops are added to or removed from the route.
for (const [label, distance, plan_] of [["1250 km", 1250, onPlan], ["1900 km", 1900, fast], ["700 km", 700, slow]]) {
  const expected = route.stops.find(s => s.km > distance);
  assert.equal(plan_.next.name, expected.name, `at ${label} the next stop should be ${expected.name}`);
  assert.ok(plan_.stops.filter(s => s.reached).every(s => s.km <= distance), "nothing beyond the distance walked may be marked reached");
}
console.log("✓ faster pulls dates earlier, slower pushes them later, next stop tracks distance\n");

// A single bad reading must not throw the finish into next decade.
const absurd = plan(9000, 1);
assert.ok(absurd.pace <= 50, `pace clamped, got ${absurd.pace}`);
console.log(`✓ absurd input clamped to ${absurd.pace.toFixed(1)} km/day\n`);

console.log("ALL LOGIC CHECKS PASSED");
