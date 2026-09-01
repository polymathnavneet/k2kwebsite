import test from "node:test";

// Guards the move off *.workers.dev, which Navneet's own mobile network will
// not resolve, onto a domain of his own.
test("binding the site to its own domain", async () => {
  await import("./site-domain.checks.mjs");
});
