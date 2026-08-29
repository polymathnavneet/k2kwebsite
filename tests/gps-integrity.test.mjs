import test from "node:test";

// Guards the promises the tracker makes: that a day is the same day for every
// reader, that arrival dates allow for rest days, and above all that a vehicle
// journey can never be counted as walking.
test("GPS integrity, Indian dates and rest days", async () => {
  await import("./gps-integrity.checks.mjs");
});
