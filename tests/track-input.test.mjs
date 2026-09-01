import test from "node:test";

// Guards the reader that publishes a position: a request with no coordinates
// must be refused, not silently published as 0,0.
test("reading a coordinate out of a request", async () => {
  await import("./track-input.checks.mjs");
});
