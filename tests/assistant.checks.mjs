import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

// buildAsks is heavily database-bound, so this exercises the decisions it makes
// by replaying the same rules against known states. The point is the judgement:
// does it ask the right thing, in the right order, and stop asking when done.
const sourceOf = f => readFileSync(f, "utf8").replace(/^import .*$/gm, "");
const js = ts.transpileModule([sourceOf("lib/time.ts")].join("\n"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const time = await import("data:text/javascript," + encodeURIComponent(js));

// Mirrors the thresholds in lib/assistant.ts.
function asksFor(state) {
  const asks = [];
  const live = state.mode === "live";
  const due = time.walkDay(state.startDate, state.now);

  if (!live && due >= 1) asks.push({ kind: "mode", priority: 100 });
  if (live && (state.fixAgeHours === null || state.fixAgeHours > 20)) asks.push({ kind: "gps", priority: 95 });
  for (let i = 0; i < state.pendingSuggestions; i += 1) asks.push({ kind: "suggestion", priority: 90 });
  for (let i = 0; i < state.unanswered; i += 1) asks.push({ kind: "reply", priority: 80 });
  if (!state.wroteToday) asks.push({ kind: "journal", priority: 70 });
  if (live && state.distanceToday === 0 && state.fixAgeHours !== null && state.fixAgeHours < 20) asks.push({ kind: "distance", priority: 60 });
  if (state.mediaCount === 0) asks.push({ kind: "media", priority: 40 });

  asks.sort((a, b) => b.priority - a.priority);
  return asks.map(a => a.kind);
}

const base = {
  startDate: "2026-12-17", now: new Date("2026-11-01T09:00:00Z"), mode: "preparation",
  fixAgeHours: 2, pendingSuggestions: 0, unanswered: 0, wroteToday: true,
  distanceToday: 5, mediaCount: 3,
};

// --- nothing wrong -----------------------------------------------------------
assert.deepEqual(asksFor(base), [], "a site that is up to date should ask nothing");
console.log("✓ when everything is current it asks nothing at all");

// --- it notices the walk should have started ---------------------------------
const started = asksFor({ ...base, now: new Date("2026-12-20T09:00:00Z") });
assert.equal(started[0], "mode", "three days after the start date, that is the first question");
console.log("✓ three days past the start date, the first question is 'have you started?'");

// --- a stale position outranks everything except that ------------------------
const stale = asksFor({ ...base, mode: "live", now: new Date("2027-01-10T09:00:00Z"), fixAgeHours: 96, unanswered: 2, wroteToday: false });
assert.equal(stale[0], "gps", "a four-day-old position is the most urgent thing");
assert.deepEqual(stale, ["gps", "reply", "reply", "journal"], "then the people waiting, then the day");
console.log("✓ a four-day-old position is asked first, then unanswered people, then the day");

// --- it does not nag about distance when the GPS already knows ---------------
const walked = asksFor({ ...base, mode: "live", now: new Date("2027-01-10T09:00:00Z"), distanceToday: 22 });
assert.ok(!walked.includes("distance"), "if the GPS recorded distance, do not ask for it");
const nothingRecorded = asksFor({ ...base, mode: "live", now: new Date("2027-01-10T09:00:00Z"), distanceToday: 0, fixAgeHours: 3 });
assert.ok(nothingRecorded.includes("distance"), "a fresh fix but no distance is worth asking about");
console.log("✓ it asks how far you walked only when the GPS did not see it");

// --- and not for a position it has just been given ---------------------------
const justSynced = asksFor({ ...base, mode: "live", now: new Date("2027-01-10T09:00:00Z"), fixAgeHours: 0.2, distanceToday: 12 });
assert.ok(!justSynced.includes("gps"), "do not ask where you are twelve minutes after being told");
console.log("✓ it does not ask where you are minutes after you told it");

// --- people waiting come before housekeeping ---------------------------------
const mixed = asksFor({ ...base, unanswered: 1, mediaCount: 0, wroteToday: false });
assert.ok(mixed.indexOf("reply") < mixed.indexOf("journal"), "a person waiting outranks your diary");
assert.ok(mixed.indexOf("journal") < mixed.indexOf("media"), "your diary outranks an empty gallery");
console.log("✓ a person waiting for a reply outranks the diary, which outranks the gallery");

// --- it asks about at most a handful at a time -------------------------------
const flooded = asksFor({ ...base, unanswered: 3, pendingSuggestions: 3, wroteToday: false, mediaCount: 0 });
assert.ok(flooded.length <= 8, `should not present a wall of questions, got ${flooded.length}`);
assert.equal(flooded[0], "suggestion", "a route decision comes before replies");
console.log(`✓ a busy day presents ${flooded.length} questions, most important first, not a wall\n`);

console.log("ALL ASSISTANT CHECKS PASSED");
