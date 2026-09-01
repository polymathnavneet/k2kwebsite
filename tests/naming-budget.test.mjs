import test from "node:test";

// Guards the site's Nominatim budget: a queue of thousands of undelivered
// positions must not spend thousands of lookups when it finally flushes.
test("how often the site asks what a place is called", async () => {
  await import("./naming-budget.checks.mjs");
});
