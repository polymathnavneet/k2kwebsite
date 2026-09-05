import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { runtime } from "./support/runtime.mjs";

let app, tracking, dbModule, messages, gps, track, journey, route, timeline, places, book;
before(async () => {
  app = await runtime(["lib/tracking.ts", "db/index.ts", "app/api/messages/route.ts", "app/api/gps/route.ts", "app/api/track/route.ts", "app/api/journey/route.ts", "app/api/route/route.ts", "app/api/timeline/route.ts", "lib/gps-places.ts", "app/api/book/route.ts"]);
  [tracking, dbModule, messages, gps, track, journey, route, timeline, places, book] = app.modules;
});
after(async () => { await app?.close(); });
beforeEach(() => {
  for (const table of ["gps_points", "gps_places", "journey", "route_config", "route_stops", "timeline_steps", "messages", "site_settings", "book_registrations"]) app.sqlite.exec(`DELETE FROM ${table}`);
  app.sqlite.exec("INSERT INTO route_config(id,start_date,total_distance) VALUES(1,'2020-01-01',4270)");
});
const request = (url, body, admin = true) => new Request(`https://walk.example${url}`, {
  method: "POST", headers: { "content-type": "application/json", ...(admin ? { "x-admin-token": "test-admin" } : {}) }, body: JSON.stringify(body),
});
const point = (minute, lat = 26 + minute / 6000, accuracy = 5) => ({ lat, lon: 80, at: `2026-08-01T06:${String(minute).padStart(2, "0")}:00Z`, accuracy });

test("the first uploaded walking batch counts without a prior mode switch", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const result = await tracking.processPoints(dbModule.getDb(), [point(0), point(10)]);
  assert.ok(result.journey.distanceTotal > 0, "real movement on the first upload must count");
});

test("replaying an older fix never rewinds the current position", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  await tracking.processPoints(dbModule.getDb(), [point(0), point(10), point(20)]);
  const result = await tracking.processPoints(dbModule.getDb(), [point(0)]);
  assert.equal(result.journey.lat, point(20).lat);
  assert.equal(result.journey.updatedAt, new Date(point(20).at).toISOString());
});

test("GPS endpoint rejects null coordinates and retains the accuracy supplied by the phone", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  assert.equal((await gps.POST(request("/api/gps", { lat: null, lon: null }))).status, 400);
  const response = await gps.POST(request("/api/gps", point(10, 26, 900)));
  assert.equal(response.status, 200);
  assert.equal(app.sqlite.prepare("SELECT accuracy FROM gps_points").get().accuracy, 900);
});

test("generic recorded tracks retain timestamps and accuracy", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const response = await track.POST(request("/api/track", { points: [point(10, 26, 900)] }));
  assert.equal(response.status, 200);
  assert.equal(app.sqlite.prepare("SELECT accuracy FROM gps_points").get().accuracy, 900);
});

test("retrying a held sponsorship enquiry still reports it as private", async () => {
  const body = { clientId: "sponsor-retry-123", type: "sponsor", name: "Test Brand", contact: "test@example.com", message: "Please discuss our sponsorship proposal." };
  await messages.POST(request("/api/messages", body, false));
  const result = await (await messages.POST(request("/api/messages", body, false))).json();
  assert.equal(result.public, false);
});

test("an ordinary admin status edit cannot reset GPS position or freshness", async () => {
  app.sqlite.exec("INSERT INTO journey(id,lat,lon,distance_total,updated_at) VALUES(1,28,77,42,'2026-08-01T06:00:00.000Z')");
  const response = await journey.POST(request("/api/journey", { status: "Resting" }));
  assert.equal(response.status, 200);
  const row = app.sqlite.prepare("SELECT status,lat,lon,distance_total,updated_at FROM journey").get();
  assert.deepEqual({ ...row }, { status: "Resting", lat: 28, lon: 77, distance_total: 42, updated_at: "2026-08-01T06:00:00.000Z" });
});

test("malformed JSON shapes return a useful client error", async () => {
  assert.equal((await messages.POST(request("/api/messages", null, false))).status, 400);
  assert.equal((await track.POST(request("/api/track", { points: [null, false] }))).status, 400);
});

test("inserting late history gives the same distance as chronological delivery", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const middle = { ...point(10), lon: 80.002 };
  await tracking.processPoints(dbModule.getDb(), [point(0), middle, point(20)]);
  const expected = app.sqlite.prepare("SELECT sum(counted_km) AS km FROM gps_points").get().km;
  app.sqlite.exec("DELETE FROM gps_points; DELETE FROM journey");
  await tracking.processPoints(dbModule.getDb(), [point(0), point(20)]);
  await tracking.processPoints(dbModule.getDb(), [middle]);
  const actual = app.sqlite.prepare("SELECT sum(counted_km) AS km FROM gps_points").get().km;
  assert.ok(Math.abs(actual - expected) < 1e-8);
  assert.equal(app.sqlite.prepare("SELECT lat FROM journey").get().lat, point(20).lat);
});

test("a vehicle jump leaves two separate walked segments on the map", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  await tracking.processPoints(dbModule.getDb(), [point(0), point(10), point(20, 27), point(30, 27.002)]);
  const data = await (await gps.GET()).json();
  assert.equal(new Set(data.points.map(point => point.segment)).size, 2);
  assert.equal(data.points.length, 4, "include each measured segment's starting point");
  for (let index = 1; index < data.points.length; index++) {
    const a = data.points[index - 1], b = data.points[index];
    if (Math.abs(a.lat - b.lat) > 0.5) assert.notEqual(a.segment, b.segment);
  }
});

test("an inaccurate spike contributes neither the outgoing nor returning edge", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  await tracking.processPoints(dbModule.getDb(), [point(0), point(10, 26.01, 900), point(20), point(30)]);
  const rows = app.sqlite.prepare("SELECT counted FROM gps_points ORDER BY recorded_at").all();
  assert.deepEqual(rows.map(row => row.counted), [0, 0, 0, 1]);
});

test("daily distance resets without waiting for another phone report", async () => {
  app.sqlite.exec("INSERT INTO journey(id,distance_today,distance_total) VALUES(1,12,12)");
  app.sqlite.exec("INSERT INTO gps_points(id,recorded_at,lat,lon,counted_km,counted) VALUES('old','2026-08-01T06:00:00Z',26,80,12,1)");
  const data = await (await journey.GET()).json();
  assert.equal(data.distanceToday, 0);
  assert.equal(data.distanceTotal, 12);
});

test("removing the last message cannot resurrect messages from an old backup", async () => {
  await messages.GET(new Request("https://walk.example/api/messages"));
  const rows = app.sqlite.prepare("SELECT id FROM messages").all();
  for (const row of rows) await messages.POST(request("/api/messages", { action: "delete", id: row.id }));
  const data = await (await messages.GET(new Request("https://walk.example/api/messages"))).json();
  assert.equal(data.rows.length, 0);
});

test("revisiting a town preserves where its first visit occurred in the walk", async () => {
  await places.recordGpsPlace({ place: "Test Town, Test State", lat: 26, lon: 80, live: true, recordedAt: "2026-08-01T06:00:00Z", distanceKm: 10 });
  await places.recordGpsPlace({ place: "Test Town, Test State", lat: 26, lon: 80, live: true, recordedAt: "2026-08-03T06:00:00Z", distanceKm: 80 });
  assert.equal(app.sqlite.prepare("SELECT distance_km FROM gps_places").get().distance_km, 10);
});

test("route and timeline reject impossible dates before changing saved data", async () => {
  assert.equal((await route.POST(request("/api/route", { startDate: "2026-02-30", stops: [{ name: "Start", lat: 8, lon: 77, km: 0 }, { name: "Finish", lat: 34, lon: 74, km: 4270 }] }))).status, 400);
  assert.equal((await timeline.POST(request("/api/timeline", { steps: [{ title: "Start", date: "2026-02-30" }] }))).status, 400);
  assert.equal(app.sqlite.prepare("SELECT start_date FROM route_config").get().start_date, "2020-01-01");
});

test("saving the first timeline also sets the route's departure date", async () => {
  app.sqlite.exec("DELETE FROM route_config");
  const response = await timeline.POST(request("/api/timeline", { steps: [{ title: "First step", date: "2026-12-18" }] }));
  assert.equal(response.status, 200);
  const data = await (await route.GET()).json();
  assert.equal(data.startDate, "2026-12-18");
  assert.ok(data.stops.length >= 2);
});

test("simultaneous registration retries create one book registration", async () => {
  const body = { name: "Test Reader", contact: "reader@example.com" };
  const responses = await Promise.all([book.POST(request("/api/book", body, false)), book.POST(request("/api/book", body, false))]);
  assert.ok(responses.every(response => response.ok));
  assert.equal(app.sqlite.prepare("SELECT count(*) AS count FROM book_registrations").get().count, 1);
});
