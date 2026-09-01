import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The reader used by /api/track, lifted straight out of the route so the test
// cannot drift away from the code it is guarding.
const src = readFileSync("app/api/track/route.ts", "utf8");
const match = src.match(/const num = \(value: unknown\) => \{[\s\S]*?\n\};/);
assert.ok(match, "could not find num() in app/api/track/route.ts");
const num = new Function("return " + match[0].replace("const num = ", "").replace(/: unknown/, "").replace(/;$/, ""))();

// The bug this exists to prevent. `URLSearchParams.get` answers null for a
// parameter that is not there, and Number(null) is 0 - so a request with no
// coordinates published latitude 0, longitude 0: the Atlantic, off Ghana.
assert.equal(num(null), null, "a missing parameter must be nothing, not zero");
assert.equal(num(""), null, "an empty parameter must be nothing, not zero");
assert.equal(num(undefined), null);
assert.equal(num("  "), null, "whitespace is not a position");
console.log("# ✓ a missing coordinate reads as nothing, not as 0,0 in the Atlantic");

// A real zero must still survive: the equator and the Greenwich meridian are
// legitimate, and so is a battery that has actually reached nothing.
assert.equal(num(0), 0);
assert.equal(num("0"), 0);
console.log("# ✓ a genuine zero is still a zero");

assert.equal(num("26.7760852"), 26.7760852);
assert.equal(num(80.9951978), 80.9951978);
assert.equal(num("not a number"), null);
assert.equal(num(Infinity), null, "infinity is not a coordinate");
console.log("# ✓ real numbers pass, nonsense does not");
