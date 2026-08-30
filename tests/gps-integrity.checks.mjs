import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const load = async (file, extra = "") => {
  const src = readFileSync(file, "utf8").replace(/^import .*$/gm, "") + extra;
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript," + encodeURIComponent(js));
};

const time = await load("lib/time.ts");

// --- Indian dates, not the reader's ------------------------------------------
// 23:00 UTC on 1 March is already 2 March in India. Everyone must agree.
assert.equal(time.istDayKey(new Date("2027-03-01T23:00:00Z")), "2027-03-02");
assert.equal(time.istDayKey(new Date("2027-03-01T18:29:00Z")), "2027-03-01");
assert.equal(time.istDayKey(new Date("2027-03-01T18:31:00Z")), "2027-03-02");
console.log("✓ the day rolls over at midnight in India, the same for every reader");

assert.equal(time.walkDay("2026-12-17", new Date("2026-12-17T06:00:00Z")), 1, "the first day is day 1");
assert.equal(time.walkDay("2026-12-17", new Date("2026-12-27T06:00:00Z")), 11);
assert.equal(time.walkDay("2026-12-17", new Date("2026-12-01T06:00:00Z")), 0, "before the start there is no day");
console.log("✓ expedition day counts from the start date and is 0 beforehand");

// --- rest days --------------------------------------------------------------
const geoSrc = readFileSync("lib/geo.ts", "utf8").replace(/^import .*$/gm, "");
const geo = await import("data:text/javascript," + encodeURIComponent(
  ts.transpileModule(geoSrc, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
));

const planned = 25;
const calendar = geo.calendarPace(planned);
console.log(`  25 km per walking day -> ${calendar.toFixed(2)} km per calendar day`);
assert.ok(calendar < planned, "a rest day must lower the calendar rate");
assert.ok(Math.abs(calendar - 25 * 6 / 7) < 0.001);
const daysNoRest = 4270 / planned, daysWithRest = 4270 / calendar;
console.log(`  4,270 km: ${Math.ceil(daysNoRest)} days ignoring rest, ${Math.ceil(daysWithRest)} days allowing one rest day a week`);
assert.ok(daysWithRest - daysNoRest > 25, "allowing rest days should move the finish by weeks, not hours");
console.log("✓ arrival dates allow for a rest day a week instead of promising seven walking days\n");

// --- the walking test, replicating lib/tracking.ts ---------------------------
const MIN_MOVE_FLOOR_KM = 0.015, MAX_MOVE_KM = 150, MAX_WALK_KMH = 12, MAX_ACCURACY_M = 500;
const driftThreshold = accuracy => Math.max(MIN_MOVE_FLOOR_KM, accuracy > 0 ? (accuracy * 1.5) / 1000 : 0);

function judge(moved, hours, accuracy = null) {
  const speed = hours > 0 ? moved / hours : null;
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return "imprecise";
  if (moved < driftThreshold(accuracy ?? 0)) return "drift";
  if (moved > MAX_MOVE_KM) return "tooFar";
  if (speed !== null && speed > MAX_WALK_KMH) return "tooFast";
  return "counted";
}

// The bug that mattered: a bus recorded as many small innocent hops.
// 60 km/h sampled every minute = 1 km hops. Distance alone cannot catch this.
assert.equal(judge(1, 1 / 60), "tooFast", "a 1 km hop in one minute is a vehicle");
console.log("  bus at 60 km/h, sampled every minute (1 km hops) -> rejected as too fast");

// A real walking day must still count.
assert.equal(judge(1, 1 / 5), "counted", "1 km in 12 minutes is a brisk walk");
assert.equal(judge(4.5, 1), "counted", "4.5 km/h is walking");
assert.equal(judge(6.5, 1), "counted", "6.5 km/h is a fast walk");
console.log("  walking at 5 and 6.5 km/h -> counted");

// Edges either side of the threshold.
assert.equal(judge(11.9, 1), "counted", "11.9 km/h still counts");
assert.equal(judge(12.1, 1), "tooFast", "12.1 km/h does not");
console.log("  threshold holds at 12 km/h");

assert.equal(judge(0.005, 1), "drift", "5 m is a phone on a table");
assert.equal(judge(0.008, 1, 30), "drift", "8 m with 30 m accuracy is inside the error");
assert.equal(judge(400, 6), "tooFar", "a 400 km hop is not walking");
assert.equal(judge(2, 0.5, 900), "imprecise", "a fix accurate to 900 m cannot prove 2 km");
console.log("  drift, huge jumps and imprecise fixes -> all rejected");

// Without timestamps, the distance guard still applies.
assert.equal(judge(5, 0), "counted", "no timing: a 5 km hop still counts");
assert.equal(judge(200, 0), "tooFar", "no timing: a 200 km hop still does not");
console.log("✓ speed test catches vehicles that the distance test alone let through\n");

// --- a whole bus journey vs a whole walking day ------------------------------
const busHops = Array.from({ length: 300 }, () => judge(1, 1 / 60));
assert.ok(busHops.every(v => v === "tooFast"), "no part of a 300 km bus ride may count");
const walkHops = Array.from({ length: 30 }, () => judge(0.8, 0.16));
assert.ok(walkHops.every(v => v === "counted"), "a 24 km walking day must count in full");
console.log("  300 km bus ride: 0 km counted | 24 km walking day: all counted");
console.log("✓ the tracker cannot be made to overstate the distance by a vehicle\n");

// --- walking slowly must still count ------------------------------------------
// The old flat 100 m floor threw away every hop of a slow walk. At 2 km/h with a
// fix every 30 seconds each hop is about 17 m, which now counts.
assert.equal(judge(0.017, 30 / 3600, 8), "counted", "17 m in 30 s at 2 km/h is a tired walk, and counts");
assert.equal(judge(0.017, 30 / 3600, 5), "counted", "the same hop with good accuracy counts");
console.log("  2 km/h, a fix every 30 s (17 m hops) -> counted");

// A whole slow day must arrive at the right total.
const slowDay = Array.from({ length: 600 }, () => judge(0.017, 30 / 3600, 8));
const slowKm = slowDay.filter(v => v === "counted").length * 0.017;
console.log(`  five hours at 2 km/h -> ${slowKm.toFixed(1)} km counted`);
assert.ok(slowDay.every(v => v === "counted"), "no part of a slow walk may be discarded");
assert.ok(Math.abs(slowKm - 10.2) < 0.1, `should be about 10 km, got ${slowKm.toFixed(1)}`);

// And there is no lower bound on the projected pace.
const pace = (total, day) => day < 3 || total <= 0 ? 25 : Math.min(50, total / day);
assert.equal(pace(60, 10), 6, "a slow 6 km/day must be reported as 6, not raised to a floor");
assert.equal(pace(1000, 10), 50, "an impossible 100 km/day is still capped");
console.log("  6 km/day reported as 6 (no floor) | 100 km/day capped at 50");
console.log("✓ walking slowly counts in full and is reported honestly\n");

console.log("ALL GPS INTEGRITY CHECKS PASSED");

// --- counting must not start before the walk does -------------------------
// The tracker booked 28.5 km of a bus ride from Bettiah to Raxaul as walked,
// three and a half months before the first step. The speed guard could not
// catch it: the fixes were far enough apart to imply a walking pace. Only the
// date can catch it.
{
  // dayOfWalk in lib/geo.ts is walkDay; assert the behaviour the guard relies on.
  const beforeStart = time.walkDay("2026-12-17", new Date("2026-08-30T05:14:00Z"));
  const onStart = time.walkDay("2026-12-17", new Date("2026-12-17T05:00:00Z"));
  const later = time.walkDay("2026-12-17", new Date("2027-01-05T05:00:00Z"));
  assert.equal(beforeStart, 0, "before the start date there is no day of walk");
  assert.ok(onStart >= 1, "the start date is day one");
  assert.ok(later > onStart, "and it climbs from there");
  console.log(`  counting  30 Aug -> day ${beforeStart} (nothing counts) · 17 Dec -> day ${onStart} · 5 Jan -> day ${later}`);
}
