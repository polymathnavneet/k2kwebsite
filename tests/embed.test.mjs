import test from "node:test";

// Guards the "paste a link" feature: every shape Instagram and YouTube hand out
// from their share sheets must be recognised and turned into an embed, and
// anything that would render as a broken frame must be refused instead.
test("recognising pasted picture and video links", async () => {
  await import("./embed.checks.mjs");
});
