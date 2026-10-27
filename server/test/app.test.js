import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('API foundation returns real health and bounded JSON errors over HTTP', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(5000),
  });

  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-powered-by'), null);
  assert.deepEqual(await health.json(), {
    status: 'ok', service: 'AccessFix AI API', phase: 0,
  });

  // AI is a later phase; a missing endpoint must never look successful.
  const missing = await request('/api/generate-fix', { method: 'POST' });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');

  const invalidJson = await request('/api/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, 'INVALID_JSON');

  const oversized = await request('/api/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'x'.repeat(65536) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'PAYLOAD_TOO_LARGE');
});
