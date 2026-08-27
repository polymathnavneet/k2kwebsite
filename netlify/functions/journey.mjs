import { getStore } from '@netlify/blobs';

const fallback = {
  mode: 'preparation', status: 'Preparing', day: 0, distanceToday: 0, distanceTotal: 0,
  targetDistance: 4000, stepsToday: 0, walkingMinutes: 0,
  currentPlace: 'Lucknow, Uttar Pradesh', nextPlace: 'Kanyakumari', nextPlaceEta: 'December 2026',
  connectivity: 'Preparation mode', lastSleep: 'Lucknow', sponsorName: 'Partnership open',
  sponsorUrl: 'sponsorship.html', latestTitle: 'The walk before the walk',
  latestText: 'Training, saving, finding partners and preparing to cross India at walking speed.',
  latestUrl: 'journal.html', stories: []
};

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const clampNumber = (value, min, max, fallbackValue = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallbackValue;
};
const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);

export default async (request) => {
  const store = getStore('k2k-journey');
  if (request.method === 'GET') {
    const saved = await store.get('public', { type: 'json' });
    return response({ ...fallback, ...(saved || {}) });
  }
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  if (!String(request.headers.get('content-type') || '').includes('application/json')) return response({ error: 'JSON required' }, 415);
  const expected = process.env.K2K_TRACKER_TOKEN;
  const supplied = request.headers.get('x-tracker-token') || '';
  if (!expected || supplied !== expected) return response({ error: 'Unauthorized' }, 401);
  const body = await request.json();
  const previous = (await store.get('public', { type: 'json' })) || fallback;
  const stories = Array.isArray(body.stories) ? body.stories.slice(-100).map((item) => ({
    place: clean(item.place, 80), type: clean(item.type, 30), title: clean(item.title, 120),
    text: clean(item.text, 500), url: clean(item.url, 240),
    lat: clampNumber(item.lat, -90, 90, null), lon: clampNumber(item.lon, -180, 180, null)
  })) : previous.stories;
  const next = {
    mode: body.mode === 'live' ? 'live' : 'preparation', status: clean(body.status, 40),
    day: clampNumber(body.day, 0, 365), distanceToday: clampNumber(body.distanceToday, 0, 100),
    distanceTotal: clampNumber(body.distanceTotal, 0, 6000), targetDistance: clampNumber(body.targetDistance, 1, 6000, 4000),
    stepsToday: clampNumber(body.stepsToday, 0, 200000), walkingMinutes: clampNumber(body.walkingMinutes, 0, 1440),
    currentPlace: clean(body.currentPlace, 100), nextPlace: clean(body.nextPlace, 100), nextPlaceEta: clean(body.nextPlaceEta, 80),
    temperature: body.temperature === '' ? null : clampNumber(body.temperature, -50, 60, null),
    altitude: body.altitude === '' ? null : clampNumber(body.altitude, -500, 9000, null),
    battery: body.battery === '' ? null : clampNumber(body.battery, 0, 100, null),
    connectivity: clean(body.connectivity, 50), lastSleep: clean(body.lastSleep, 100),
    latestTitle: clean(body.latestTitle, 140), latestText: clean(body.latestText, 500), latestUrl: clean(body.latestUrl, 240),
    sponsorName: clean(body.sponsorName, 100), sponsorUrl: clean(body.sponsorUrl, 240), stories,
    updatedAt: new Date().toISOString()
  };
  await store.setJSON('public', next);
  return response({ ok: true, journey: next });
};

export const config = { path: '/api/journey', method: ['GET', 'POST'], rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 120 } };
