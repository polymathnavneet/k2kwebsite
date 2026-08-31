import test from "node:test";

// Guards the arrival dates: they are worked out from how he has actually been
// walking, counting the days he rested, rather than from the pace he wrote
// down before he had walked any of it.
test("predicting when he arrives, from how he has been walking", async () => {
  await import("./forecast.checks.mjs");
});
