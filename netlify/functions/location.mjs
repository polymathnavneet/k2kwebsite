import { getStore } from '@netlify/blobs';

const FALLBACK = {
  lat: 26.8467,
  lon: 80.9462,
  accuracy: null,
  speed: null,
  heading: null,
  updatedAt: null,
  source: 'preparation-marker',
  place: 'Lucknow, Uttar Pradesh'
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tracker-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const store = getStore('k2k-tracker');

  if (request.method === 'GET') {
    const current = await store.get('current', { type: 'json' });
    return json(current || FALLBACK);
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expectedToken = process.env.K2K_TRACKER_TOKEN;
  const suppliedToken = request.headers.get('x-tracker-token') ||
    (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

  if (!expectedToken) {
    return json({ error: 'Tracker backend is not configured yet. Add K2K_TRACKER_TOKEN in Netlify.' }, 503);
  }

  if (!suppliedToken || suppliedToken !== expectedToken) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const accuracy = body.accuracy == null ? null : Number(body.accuracy);
  const speed = body.speed == null ? null : Number(body.speed);
  const heading = body.heading == null ? null : Number(body.heading);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return json({ error: 'Invalid coordinates' }, 400);
  }

  const payload = {
    lat,
    lon,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    speed: Number.isFinite(speed) ? speed : null,
    heading: Number.isFinite(heading) ? heading : null,
    updatedAt: new Date().toISOString(),
    source: 'live-gps'
  };

  await store.setJSON('current', payload);
  return json({ ok: true, location: payload });
};

export const config = {
  path: '/api/location',
  method: ['GET', 'POST', 'OPTIONS'],
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: 'ip',
    windowSize: 60,
    windowLimit: 120
  }
};
