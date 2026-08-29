import test from "node:test";

// Guards what the assistant does with a typed line. The important half is the
// refusals: a sentence that merely mentions walking, a place or a number must
// stay a diary entry, because guessing wrong changes the site silently.
test("understanding what you type at it", async () => {
  await import("./understand.checks.mjs");
});
