import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function worker() {
  const handlers = {}, stores = new Map();
  const key = request => typeof request === "string" ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response) { store.set(key(request), response.clone()); },
        async match(request) { return store.get(key(request))?.clone(); },
        async add() {},
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const context = vm.createContext({
    self: { location: { origin: "https://walk.example" }, addEventListener(name, handler) { handlers[name] = handler; }, clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches, URL, Response, AbortSignal,
    fetch: async request => Response.json({ path: request.url }),
  });
  vm.runInContext(readFileSync("public/sw.js", "utf8"), context);
  return {
    context, stores,
    async get(path, headers = {}) {
      let response;
      const waits = [];
      handlers.fetch({ request: new Request(`https://walk.example${path}`, { headers }), respondWith(value) { response = value; }, waitUntil(value) { waits.push(value); } });
      const result = response && await response;
      await Promise.all(waits);
      return result;
    },
    async activate() { let done; handlers.activate({ waitUntil(value) { done = value; } }); await done; },
  };
}

test("the offline worker never caches private responses or tracker writes", async () => {
  const sw = worker();
  for (const path of ["/api/tracker", "/api/sheet", "/api/track?lat=26&lon=80", "/api/messages?admin=1", "/api/track?key=private"]) {
    assert.equal(await sw.get(path), undefined, path);
  }
  assert.equal(await sw.get("/api/messages", { "x-admin-token": "test" }), undefined);
  assert.equal(sw.stores.size, 0);
});

test("offline copies keep query parameters separate and include the GPS trail", async () => {
  const sw = worker();
  await sw.get("/api/days?days=30");
  await sw.get("/api/days?days=400");
  await sw.get("/api/gps");
  sw.context.fetch = async () => { throw new Error("offline"); };
  assert.match((await (await sw.get("/api/days?days=30")).json()).path, /days=30$/);
  assert.match((await (await sw.get("/api/days?days=400")).json()).path, /days=400$/);
  assert.equal((await sw.get("/api/gps")).status, 200);
});

test("activation preserves unrelated caches and RSC responses cannot replace HTML", async () => {
  const sw = worker();
  sw.stores.set("unrelated-app", new Map());
  sw.stores.set("alw-data-v2", new Map());
  await sw.activate();
  assert.ok(sw.stores.has("unrelated-app"));
  assert.ok(!sw.stores.has("alw-data-v2"));
  assert.equal(await sw.get("/route?_rsc=test", { rsc: "1" }), undefined);
});

function outbox() {
  const records = new Map();
  let abortNextWrite = false;
  const db = {
    transaction(_name, mode) {
      const transaction = { error: null };
      const store = {};
      for (const action of ["getAll", "put", "delete"]) store[action] = value => {
        const request = {};
        queueMicrotask(() => {
          request.result = action === "getAll" ? structuredClone([...records.values()]) : value?.id;
          request.onsuccess?.();
          queueMicrotask(() => {
            if (mode === "readwrite" && abortNextWrite) {
              abortNextWrite = false;
              transaction.error = new Error("Storage transaction aborted");
              transaction.onabort?.();
              return;
            }
            if (action === "put") records.set(value.id, structuredClone(value));
            if (action === "delete") records.delete(value);
            transaction.oncomplete?.();
          });
        });
        return request;
      };
      transaction.objectStore = () => store;
      return transaction;
    },
    close() {},
  };
  const context = vm.createContext({
    exports: {}, crypto, AbortSignal, navigator: { onLine: true },
    document: { dispatchEvent() {} }, CustomEvent: class {},
    indexedDB: { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request; } },
    fetch: async () => Response.json({ ok: true }),
  });
  const js = ts.transpileModule(readFileSync("lib/outbox.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(js, context);
  return { api: context.exports, context, records, abortWrite() { abortNextWrite = true; } };
}

test("an unaccepted submission stays recoverable and does not count as sent", async () => {
  const box = outbox();
  await box.api.queue("/api/messages", { message: "A saved message" }, "message");
  box.context.fetch = async () => Response.json({ error: "Please fix the contact" }, { status: 400 });
  assert.equal(await box.api.flush(), 0);
  assert.equal(box.records.size, 1);
  assert.equal([...box.records.values()][0].state, "needs-attention");
});

test("rate limiting queues a retry with the original submission ID", async () => {
  const box = outbox();
  box.context.fetch = async () => Response.json({ error: "Try later" }, { status: 429 });
  const result = await box.api.send("/api/messages", { clientId: "stable-client-id", message: "Saved once" }, "message");
  assert.equal(result.queued, true);
  assert.equal([...box.records.values()][0].payload.clientId, "stable-client-id");
  box.context.fetch = async () => Response.json({ ok: true });
  assert.equal(await box.api.flush(), 1);
  assert.equal(box.records.size, 0);
});

test("private queued work waits for credentials without storing the credential", async () => {
  const box = outbox();
  await box.api.queue("/api/journal", { body: "Private saved draft" }, "diary", { "x-admin-token": "secret-test" });
  assert.equal(await box.api.flush(), 0);
  assert.equal(box.records.size, 1);
  assert.ok(!JSON.stringify([...box.records.values()]).includes("secret-test"));
});

test("a storage abort cannot be reported as a successfully saved submission", async () => {
  const box = outbox();
  box.abortWrite();
  await assert.rejects(box.api.queue("/api/messages", { message: "Do not lose this" }, "message"), /aborted/);
  assert.equal(box.records.size, 0);
});
