import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanDomain, routesFor, zoneCandidates } from "../scripts/domain.mjs";

/**
 * Guards the switch from *.workers.dev to a domain of his own.
 *
 * This exists because the workers.dev address is not reachable from Navneet's
 * phone: Indian mobile networks refuse to resolve the whole parent domain, so
 * his tracker queued 4,700 positions it could never deliver and readers on the
 * same network get nothing when they open the site. The domain is the fix, and
 * the deploy has to take it without anybody editing a script on the day.
 */

/* ------------------------------------------------- reading what was typed */

// The obvious form.
assert.equal(cleanDomain("alongwalk.in"), "alongwalk.in");

// And the form a person actually pastes, because that is what the browser
// showed them. Rejecting this for being a URL would be pedantry.
assert.equal(cleanDomain("https://AlongWalk.in/"), "alongwalk.in");
assert.equal(cleanDomain("  http://alongwalk.in/admin  "), "alongwalk.in");
assert.equal(cleanDomain("alongwalk.in:443"), "alongwalk.in");
assert.equal(cleanDomain("walk.alongwalk.co.in"), "walk.alongwalk.co.in");
console.log("# ✓ a pasted address is understood, not rejected");

// And things that are not domains at all must not reach Cloudflare as one.
for (const bad of ["", "   ", "localhost", "not a domain", "alongwalk", ".in", "alongwalk.", "-bad.in", "bad-.in", "https://", null, undefined]) {
  assert.equal(cleanDomain(bad), "", `"${bad}" is not a domain name`);
}
console.log("# ✓ nonsense is refused before it becomes a route");

/* ------------------------------------------ finding the zone he bought */

// A zone is the domain somebody bought. It is not always the last two labels -
// alongwalk.co.in is one zone, and guessing "co.in" would bind the site to a
// public suffix - so every suffix is asked about, most specific first.
assert.deepEqual(zoneCandidates("walk.alongwalk.in"), ["walk.alongwalk.in", "alongwalk.in"]);
assert.deepEqual(zoneCandidates("walk.alongwalk.co.in"), ["walk.alongwalk.co.in", "alongwalk.co.in", "co.in"]);
assert.deepEqual(zoneCandidates("alongwalk.in"), ["alongwalk.in"]);
assert.deepEqual(zoneCandidates("nonsense"), []);
console.log("# ✓ the zone is asked about, not guessed from the last two labels");

/* -------------------------------------------------- what gets bound to what */

// He bought alongwalk.in and wants the site on it: www has to work too, because
// half the people who type it will type www and a site that answers to only one
// of the two reads as broken.
assert.deepEqual(routesFor("alongwalk.in", "alongwalk.in"), [
  { pattern: "alongwalk.in", custom_domain: true },
  { pattern: "www.alongwalk.in", custom_domain: true },
]);

// But he asked for a subdomain, so only that subdomain is bound.
// "www.walk.alongwalk.in" would be nonsense.
assert.deepEqual(routesFor("walk.alongwalk.in", "alongwalk.in"), [
  { pattern: "walk.alongwalk.in", custom_domain: true },
]);
console.log("# ✓ an apex gets www as well; a subdomain does not");

// No domain, no routes - and this is the case that runs every day until he buys
// one. An empty list must leave the deploy exactly as it is today.
assert.deepEqual(routesFor("", ""), []);
assert.deepEqual(routesFor("not a domain", ""), []);
assert.deepEqual(routesFor(undefined, undefined), []);
console.log("# ✓ no domain means no routes, and a deploy that behaves as before");

/* ----------------------------------------------- and the deploy cannot fail */

// The one rule that matters more than any of the above: a domain that is
// missing, misspelt, or not yet on the Cloudflare account must never stop a
// deploy. The site staying up at a bad address beats an error page.
const resolver = readFileSync("scripts/resolve-cloudflare.mjs", "utf8");
const domainSection = resolver.slice(resolver.indexOf("--- a domain of his own"));
assert.ok(domainSection.length > 200, "the domain section is missing from resolve-cloudflare.mjs");
assert.ok(!/\bstop\(/.test(domainSection), "a domain problem must never stop the deploy");
assert.ok(!/process\.exit/.test(domainSection), "a domain problem must never exit the deploy");
console.log("# ✓ a domain that is missing or wrong is stepped over, never fatal");

// And the workers.dev address stays switched on beside it, so every link
// already shared and the bookmarked admin panel keep working.
const deploy = readFileSync("scripts/deploy-cloudflare.mjs", "utf8");
assert.ok(/config\.workers_dev = true;/.test(deploy), "the workers.dev address must stay on");
console.log("# ✓ the old address keeps working after the domain is added");
