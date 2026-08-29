import test from "node:test";

// Guards the rule that stopped the tracker lying: distance along the route and
// the next town come from the position itself, and go quiet when the position
// is missing or too far off the line to support them.
test("deciding when the position can be trusted", async () => {
  await import("./position.checks.mjs");
});
