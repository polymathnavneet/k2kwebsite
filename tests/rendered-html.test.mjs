import assert from "node:assert/strict";
import test from "node:test";
import { runtime } from "./support/runtime.mjs";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async (t) => {
  // The production bundle imports cloudflare:workers, which Node cannot load
  // directly. Supply its D1 binding while executing the built renderer.
  const app = await runtime(["dist/server/index.js"]);
  t.after(() => app.close());
  t.mock.method(globalThis, "fetch", async () => new Response("Not found", { status: 404 }));
  const worker = app.modules[0].default;

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ...app.env,
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});
