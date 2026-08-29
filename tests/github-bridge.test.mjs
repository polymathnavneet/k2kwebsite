import test from "node:test";

// Guards the bridge that lets Claude, ChatGPT or a person edit data/*.json in
// the repository: that content survives the round trip intact, that unchanged
// files are not re-committed, and that a GitHub outage never costs a visitor
// their message.
test("the GitHub bridge", async () => {
  await import("./github-bridge.checks.mjs");
});
