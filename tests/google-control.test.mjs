import test from "node:test";

// Guards the two files Navneet will actually run the site from: a spreadsheet
// he types prose into, and a document he writes page text in.
test("reading the sheet and document that run the site", async () => {
  await import("./google-control.checks.mjs");
});
