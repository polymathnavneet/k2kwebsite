import test from "node:test";

// Guards the promises this site makes about the walk: the start date and total
// distance, that Hyderabad comes before Nagpur, that GPS drift and bus rides do
// not inflate the distance, and that walking faster really does pull every
// arrival date earlier.
test("route facts, GPS distance and recalculated dates", async () => {
  await import("./walk-logic.checks.mjs");
});
