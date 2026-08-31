import test from "node:test";

// Guards the rule that stopped the site naming a tehsil thirty kilometres wide
// as the place Navneet was standing.
test("naming the place from a set of coordinates", async () => {
  await import("./place-names.checks.mjs");
});
