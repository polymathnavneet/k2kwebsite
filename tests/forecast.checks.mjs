import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const load = async (file, extra = "") => {
  const src = readFileSync(file, "utf8").replace(/^import .*$/gm, "") + extra;
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript," + encodeURIComponent(js));
};

const timeSrc = readFileSync("lib/time.ts", "utf8").replace(/^import .*$/gm, "");
const { forecast, paceFrom, addDays, plannedCalendarRate, MIN_BASIS_DAYS } =
  await load("lib/forecast.ts", "\n" + timeSrc);

// --- the rate counts the days he rested -------------------------------------
//
// This is the whole point. Twenty-five kilometres on five days is not
// twenty-five a day if he rested for two, and an arrival date that pretends
// otherwise runs weeks early.
const fiveOnSeven = [
  { day: "2026-12-17", km: 25 },
  { day: "2026-12-18", km: 25 },
  // rested the 19th and 20th
  { day: "2026-12-21", km: 25 },
  { day: "2026-12-22", km: 25 },
  { day: "2026-12-23", km: 25 },
];
const rested = paceFrom(fiveOnSeven, "2026-12-23");
assert.equal(rested.basisDays, 7, "the span is seven calendar days, not five walked ones");
assert.ok(Math.abs(rested.kmPerDay - 125 / 7) < 0.001, `expected ${125 / 7}, got ${rested.kmPerDay}`);
console.log(`# ✓ 125 km over 7 calendar days reads as ${rested.kmPerDay.toFixed(1)} km/day, not 25`);

// A single day is a one-day span, not a divide by zero.
assert.equal(paceFrom([{ day: "2026-12-17", km: 20 }], "2026-12-17").basisDays, 1);
assert.equal(paceFrom([{ day: "2026-12-17", km: 20 }], "2026-12-17").kmPerDay, 20);
console.log("# ✓ one walked day is a one-day span");

// Silence since his last walked day drags the rate down, as it should: those
// are days he did not arrive either.
const stalled = paceFrom([{ day: "2026-12-17", km: 30 }], "2026-12-26");
assert.equal(stalled.basisDays, 10);
assert.equal(stalled.kmPerDay, 3);
console.log("# ✓ ten days after one 30 km day reads as 3 km/day, not 30");

assert.equal(paceFrom([], "2026-12-20").kmPerDay, 0);
console.log("# ✓ no walking at all is no rate");

// --- dates ------------------------------------------------------------------
assert.equal(addDays("2026-12-17", 0), "2026-12-17");
assert.equal(addDays("2026-12-17", 15), "2027-01-01", "must cross the year end");
assert.equal(addDays("2027-02-27", 2), "2027-03-01", "must cross a month end");
console.log("# ✓ dates roll across months and years");

// --- it refuses to predict from nothing -------------------------------------
const tooSoon = forecast({
  days: [{ day: "2026-12-17", km: 24 }],
  toNextKm: 40, toFinishKm: 4270, plannedKmPerDay: 25,
  startDate: "2026-12-17", today: "2026-12-17",
});
assert.equal(tooSoon.enough, false, `one day is not a pace (basis ${tooSoon.basisDays} < ${MIN_BASIS_DAYS})`);
assert.equal(tooSoon.toFinish, null);
assert.ok(tooSoon.plannedFinish > "2027-01-01", "the plan's own date still stands in");
console.log("# ✓ one day of walking predicts nothing, and says so");

// A man averaging half a kilometre a day is not a walk in progress; dividing
// by that rate would put Srinagar in the next century.
const crawling = forecast({
  days: [{ day: "2026-12-17", km: 4 }],
  toNextKm: 40, toFinishKm: 4270, plannedKmPerDay: 25,
  startDate: "2026-12-17", today: "2026-12-30",
});
assert.equal(crawling.enough, false, "4 km over 14 days is noise, not a pace");
console.log("# ✓ a rate below a kilometre a day is refused rather than extrapolated");

// --- the real thing ---------------------------------------------------------
//
// Fourteen days, two of them rest, 280 km walked -> 20 km per calendar day.
const fortnight = [];
for (let i = 0; i < 14; i++) {
  const day = addDays("2026-12-17", i);
  // Rest on the 7th and 14th day.
  fortnight.push({ day, km: (i + 1) % 7 === 0 ? 0 : 280 / 12 });
}
const real = forecast({
  days: fortnight,
  toNextKm: 60, toFinishKm: 3990, plannedKmPerDay: 25,
  startDate: "2026-12-17", today: "2026-12-30",
});
assert.equal(real.basisDays, 14);
assert.ok(Math.abs(real.kmPerDay - 20) < 0.001, `expected 20 km/day, got ${real.kmPerDay}`);
assert.equal(real.toNext.days, 3, "60 km at 20 a day is 3 days");
assert.equal(real.toNext.date, addDays("2026-12-30", 3));
assert.equal(real.toFinish.days, Math.ceil(3990 / 20));
console.log(`# ✓ 20 km/day -> next town in ${real.toNext.days} days (${real.toNext.date}), Srinagar in ${real.toFinish.days}`);

// --- the planned rate, used only until there is walking to measure ---------
//
// The plan is 25 km per *walking* day with a rest day a week, which is 21.43
// per calendar day. The conversion matters because that figure stands in as the
// arrival date before the first step.
assert.ok(Math.abs(plannedCalendarRate(25) - 25 * 6 / 7) < 0.001);
console.log(`# \u2713 the plan's 25 km a walking day is ${plannedCalendarRate(25).toFixed(2)} a calendar day`);

// The site does not grade him against that figure - he chose the pace, and he
// is free to change it by walking - so nothing compares the two.
assert.ok(!("daysVsPlan" in real), "the forecast must not carry a verdict");
console.log("# \u2713 no verdict is computed: the pace is his, not a target");
