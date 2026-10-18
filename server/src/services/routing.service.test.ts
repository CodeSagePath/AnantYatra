import assert from 'node:assert/strict';
import test from 'node:test';
import polyline from '@mapbox/polyline';
import { fetchValhallaRoute, toPlannerMode } from './routing.service.js';

test('maps supported Valhalla profiles to planner modes', () => {
  assert.equal(toPlannerMode('auto'), 'car');
  assert.equal(toPlannerMode('motorcycle'), 'motorcycle');
  assert.equal(toPlannerMode('bicycle'), 'bicycle');
  assert.equal(toPlannerMode('pedestrian'), undefined);
});

test('adds mode, routing provenance, and OSM attribution to planner route input', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  const shape = polyline.encode([[12.9, 74.8], [12.95, 74.9]], 6);

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      trip: {
        summary: { length: 10, time: 900 },
        legs: [{ shape, summary: { length: 10, time: 900 } }],
      },
    }), { status: 200 });
  };

  try {
    const route = await fetchValhallaRoute(
      [{ lat: 12.9, lon: 74.8, name: 'Start' }, { lat: 12.95, lon: 74.9, name: 'End' }],
      'bicycle',
    );

    assert.equal(requestBody?.costing, 'bicycle');
    assert.equal(route.mode, 'bicycle');
    assert.deepEqual(route.engine, { name: 'Valhalla', version: 'unreported' });
    assert.equal(route.snapshotId, 'unconfigured');
    assert.match(route.attribution.text, /OpenStreetMap contributors/);
    assert.equal(route.attribution.url, 'https://www.openstreetmap.org/copyright');
    assert.equal(route.distance, 10);
    assert.equal(route.duration, 15);
    assert.equal(route.legDistances.length, 1);
    assert.equal(route.plannerRoute?.mode, 'bicycle');
    assert.equal(route.plannerRoute?.legs[0].from, 'Start');
    assert.equal(route.plannerRoute?.legs[0].to, 'End');
    assert.equal(route.plannerRoute?.distanceMeters, 10_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
