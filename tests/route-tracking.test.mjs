import test from "node:test";

// Guards the part that decides where Navneet is on the route: standing on a
// stop, walking between two, straying off the line entirely, and slotting a
// newly found town into the right place without disturbing its neighbours.
test("snapping a position onto the route", async () => {
  await import("./route-tracking.checks.mjs");
});
