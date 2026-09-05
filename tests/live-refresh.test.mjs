import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(fetch) {
  let now = 0, id = 0;
  const timers = new Map();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const window = new EventTarget();
  const add = (fn, ms, repeat) => { timers.set(++id, { fn, at: now + ms, repeat }); return id; };
  const context = vm.createContext({ exports: {}, fetch, AbortController, document, window,
    setTimeout: (fn, ms) => add(fn, ms, 0), setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
  });
  vm.runInContext(ts.transpileModule(readFileSync('lib/live-poll.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...context.exports, document, window, timers,
    async tick(ms) {
      const end = now + ms;
      while (true) {
        const entry = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [key, timer] = entry; now = timer.at;
        if (timer.repeat) timer.at += timer.repeat; else timers.delete(key);
        timer.fn(); await settle();
      }
      now = end; await settle();
    },
  };
}

test('GPS refreshes automatically without a reload or button', async () => {
  let report = 0;
  const received = [];
  const app = fixture(async () => Response.json({ report: ++report }));
  const feed = app.startLivePoll('/api/journey', value => received.push(value.report));
  await app.tick(0); await app.tick(30000);
  assert.deepEqual(received, [1, 2]);
  feed.stop(); assert.equal(app.timers.size, 0);
});

test('a failed route request does not prevent a new GPS reading', async () => {
  const received = [];
  const app = fixture(async url => { if (url === '/api/route') throw Error('offline'); return Response.json({ lat: 26.8 }); });
  const route = app.startLivePoll('/api/route', () => assert.fail('failed route was accepted'));
  const gps = app.startLivePoll('/api/journey', value => received.push(value.lat));
  await app.tick(0);
  assert.deepEqual(received, [26.8]);
  route.stop(); gps.stop();
});

test('a stalled request is aborted and the next automatic refresh recovers', async () => {
  let calls = 0, aborted = false;
  const received = [];
  const app = fixture((_url, { signal }) => {
    if (++calls > 1) return Promise.resolve(Response.json({ recovered: true }));
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(Error('timeout')); }));
  });
  const feed = app.startLivePoll('/api/journey', value => received.push(value));
  await app.tick(10000); assert.equal(aborted, true);
  await app.tick(20000); assert.equal(received[0].recovered, true);
  feed.stop();
});

test('returning to the page or reconnecting refreshes immediately', async () => {
  let calls = 0;
  const app = fixture(async () => { calls++; return Response.json({}); });
  const feed = app.startLivePoll('/api/journey', () => {});
  await app.tick(0);
  app.document.visibilityState = 'hidden'; await app.tick(30000); assert.equal(calls, 1);
  app.document.visibilityState = 'visible'; app.document.dispatchEvent(new Event('visibilitychange')); await settle();
  app.window.dispatchEvent(new Event('online')); await settle();
  app.window.dispatchEvent(new Event('focus')); await settle();
  assert.equal(calls, 4);
  feed.stop(); app.window.dispatchEvent(new Event('online')); await settle(); assert.equal(calls, 4);
});

test('unmounting discards an in-flight response and HTTP failures are not accepted', async () => {
  let resolve;
  const app = fixture(() => new Promise(done => { resolve = done; }));
  const feed = app.startLivePoll('/api/journey', () => assert.fail('stopped feed updated state'));
  await app.tick(0); feed.stop(); resolve(Response.json({ lat: 1 })); await settle();
  const failed = fixture(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  const other = failed.startLivePoll('/api/journey', () => assert.fail('error replaced good state'));
  await failed.tick(0); other.stop();
});

test('admin auto-refresh updates GPS while preserving unsaved notes and newer fixes', () => {
  const context = vm.createContext({ exports: {} });
  vm.runInContext(ts.transpileModule(readFileSync('lib/live-telemetry.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const current = { lat: 25, updatedAt: '2026-09-05T10:00:00Z', latestText: 'My unfinished note', status: 'Resting' };
  const fresh = { lat: 26, updatedAt: '2026-09-05T10:01:00Z', latestText: 'Old published note', status: 'Walking' };
  const result = context.exports.mergeLiveTelemetry(current, fresh);
  assert.equal(result.lat, 26); assert.equal(result.latestText, current.latestText); assert.equal(result.status, current.status);
  assert.equal(context.exports.mergeLiveTelemetry(result, current), result);
});
