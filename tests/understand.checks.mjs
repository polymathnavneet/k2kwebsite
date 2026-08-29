import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const sourceOf = f => readFileSync(f, "utf8").replace(/^import .*$/gm, "");
const js = ts.transpileModule([sourceOf("lib/embed.ts"), sourceOf("lib/understand.ts")].join("\n"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { understand } = await import("data:text/javascript," + encodeURIComponent(js));

const is = (input, action, extra) => {
  const got = understand(input);
  assert.equal(got.action, action, `"${input}" should be ${action}, got ${got.action}`);
  if (extra) for (const [key, value] of Object.entries(extra)) {
    assert.equal(got[key], value, `"${input}" -> ${key} should be ${value}, got ${got[key]}`);
  }
  return got;
};

// --- the things you actually type one-handed ---------------------------------
is("walked 18 km", "distance", { km: 18 });
is("18km", "distance", { km: 18 });
is("did 24.5 kms today", "distance", { km: 24.5 });
console.log("✓ a distance typed any of the usual ways is understood");

is("in Nagpur", "place", { place: "Nagpur" });
is("I'm in Kurnool now", "place", { place: "Kurnool" });
is("reached Maihar", "place", { place: "Maihar" });
console.log("✓ a place is understood, however it is phrased");

is("https://www.instagram.com/reel/C8xYzAbCdEf/", "media");
is("here's today https://youtu.be/dQw4w9WgXcQ", "media");
console.log("✓ a pasted link becomes a gallery item wherever it sits in the line");

is("reply to priya: thank you, that meant a lot", "reply", { who: "priya", text: "thank you, that meant a lot" });
is("remember: my sponsor contact is at the Lucknow office", "remember");
is("started", "mode", { live: true });
is("I have started the walk", "mode", { live: true });
is("walking", "status", { status: "Walking" });
console.log("✓ replies, facts, starting the walk and status are all understood");

// --- and, crucially, the things that must NOT be misread ---------------------
// This is the part that matters. Guessing wrong here silently changes the site.
is("walking today was hard, 30 degrees and no shade", "journal");
is("the road to Kurnool was awful", "journal");
is("met a man who walked 40 km a day in the 70s", "journal");
is("feet hurt but the sunrise was worth it", "journal");
is("resting because my ankle is not right", "journal");
console.log("✓ a sentence that merely mentions walking, a place or a number stays a diary entry");

// A sentence containing a distance is a diary entry, not a distance command.
const long = understand("met a man who walked 40 km a day in the 70s");
assert.equal(long.action, "journal", "a story about 40 km is not a claim of 40 km");
console.log("✓ a story about a distance does not add that distance to your total");

// Nothing at all.
is("", "journal");
is("   ", "journal");
console.log("✓ an empty line does nothing harmful");

// --- an unrecognised link is not silently swallowed --------------------------
is("https://example.com/some/page", "journal");
console.log("✓ a link the gallery cannot show becomes text, not a broken tile\n");

console.log("ALL UNDERSTANDING CHECKS PASSED");
