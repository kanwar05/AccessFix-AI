import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { ScanError } from '../src/errors.js';

const completedScan = {
  status: 'completed', scanId: 'http-test-scan', scannedAt: '2026-10-27T00:00:00.000Z',
  violatedRuleCount: 0, affectedElementCount: 0,
  severityBreakdown: { critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 },
  incompleteRuleCount: 0, violations: [],
};

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function serve(t, scan) {
  const server = createApp({ scan }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return (path = '/api/scan', options = {}) => fetch(`${origin}${path}`, {
    method: 'POST', ...options, signal: options.signal ?? AbortSignal.timeout(5000),
  });
}

test('scan endpoint runs the scanner with no arguments and returns its actual response', async (t) => {
  let calls = 0;
  const request = await serve(t, async (...args) => {
    assert.deepEqual(args, []);
    calls++;
    return completedScan;
  });

  for (const options of [{}, {
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' }, body: '{}',
  }]) {
    const response = await request('/api/scan', options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), completedScan);
  }
  assert.equal(calls, 2);
  assert.equal((await request('/api/scan', { method: 'GET' })).status, 404);
});

test('scan endpoint rejects URL, source, path, query, unsupported body and browser origin input', async (t) => {
  let calls = 0;
  const request = await serve(t, async () => { calls++; return completedScan; });
  for (const body of [
    { url: 'https://example.com' }, { previewUrl: 'http://127.0.0.1:5173/preview' },
    { path: '../secret.jsx' }, { source: 'export default function Uploaded() {}' }, [],
  ]) {
    const response = await request('/api/scan', {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'UNSUPPORTED_SCAN_INPUT');
  }
  const query = await request('/api/scan?url=https://example.com');
  assert.equal(query.status, 400);
  assert.equal((await query.json()).error.code, 'UNSUPPORTED_SCAN_INPUT');
  const text = await request('/api/scan', {
    headers: { 'Content-Type': 'text/plain' }, body: 'arbitrary code or URL',
  });
  assert.equal(text.status, 415);
  assert.equal((await text.json()).error.code, 'UNSUPPORTED_MEDIA_TYPE');
  for (const headers of [
    { Origin: 'https://example.com' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const response = await request('/api/scan', { headers });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'ORIGIN_NOT_ALLOWED');
  }
  assert.equal(calls, 0);
});

test('scan errors keep useful HTTP codes without leaking internal details and release the lock', async (t) => {
  const diagnostics = [];
  t.mock.method(console, 'error', (...args) => diagnostics.push(args));
  let failure;
  const request = await serve(t, async () => {
    if (failure) throw failure;
    return completedScan;
  });
  for (const [status, code] of [
    [503, 'BROWSER_NOT_INSTALLED'], [503, 'BROWSER_LAUNCH_FAILED'], [503, 'PREVIEW_UNAVAILABLE'],
    [504, 'SCAN_TIMEOUT'], [422, 'PREVIEW_RENDER_FAILED'], [500, 'SCAN_FAILED'], [409, 'SOURCE_CHANGED'],
  ]) {
    failure = new ScanError(status, code, 'A helpful scanner failure.');
    const response = await request();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code, message: 'A helpful scanner failure.' } });
    failure = undefined;
    assert.equal((await request()).status, 200, `Scan lock leaked after ${code}`);
  }
  failure = new Error('Internal filesystem path or browser stack must stay private');
  const unexpected = await request();
  assert.equal(unexpected.status, 500);
  const payload = await unexpected.json();
  assert.equal(payload.error.code, 'SCAN_FAILED');
  assert.equal(JSON.stringify(payload).includes('filesystem'), false);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0][1], failure);
});

test('overlapping clients get 409 while health remains available and a later scan can run', async (t) => {
  const started = deferred();
  const finish = deferred();
  t.after(() => finish.resolve(completedScan));
  let calls = 0;
  const request = await serve(t, async () => {
    calls++;
    if (calls === 1) {
      started.resolve();
      return finish.promise;
    }
    return completedScan;
  });
  const pending = request();
  await started.promise;
  const overlapping = await request();
  assert.equal(overlapping.status, 409);
  assert.equal(overlapping.headers.get('retry-after'), '2');
  assert.equal((await overlapping.json()).error.code, 'SCAN_IN_PROGRESS');
  assert.equal(calls, 1);
  const health = await request('/api/health', { method: 'GET' });
  assert.equal(health.status, 200);
  finish.resolve(completedScan);
  assert.equal((await pending).status, 200);
  assert.equal((await request()).status, 200);
  assert.equal(calls, 2);
});

test('disconnecting a client does not release the lock before scanner cleanup finishes', async (t) => {
  const started = deferred();
  const finish = deferred();
  t.after(() => finish.resolve(completedScan));
  let calls = 0;
  const request = await serve(t, async () => {
    calls++;
    if (calls === 1) { started.resolve(); return finish.promise; }
    return completedScan;
  });
  const controller = new AbortController();
  const pending = request('/api/scan', { signal: controller.signal }).catch(() => null);
  await started.promise;
  controller.abort();
  await pending;
  assert.equal((await request()).status, 409);
  finish.resolve(completedScan);
  // A fresh request is handled after the original scan's promise has settled.
  const next = await request();
  assert.equal(next.status, 200);
  assert.equal(calls, 2);
});
