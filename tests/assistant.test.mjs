import test from "node:test";

// Guards the assistant's judgement: that it asks about the most broken thing
// first, does not nag about what it already knows, puts people waiting for a
// reply above housekeeping, and goes quiet when the site is up to date.
test("what the assistant decides to ask", async () => {
  await import("./assistant.checks.mjs");
});
