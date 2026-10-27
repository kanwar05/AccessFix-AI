import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createConfig } from '../src/config.js';
import { createAccessibilityScanner, SCAN_POLICY } from '../src/services/accessibilityScanner.js';

function fixture(overrides = {}) {
  const calls = { browserClose: 0, contextClose: 0, readSource: 0 };
  const mainFrame = {};
  const page = {
    setDefaultTimeout: (value) => { calls.timeout = value; },
    setDefaultNavigationTimeout: (value) => { calls.navigationTimeout = value; },
    on: (event, listener) => { calls[event] = listener; },
    route: async (_pattern, handler) => { calls.route = handler; },
    mainFrame: () => mainFrame,
    goto: async (url, options) => {
      calls.url = url;
      calls.gotoOptions = options;
      if (overrides.navigationError) throw overrides.navigationError;
      await calls.route({
        request: () => ({ isNavigationRequest: () => true, frame: () => mainFrame, url: () => url }),
        fetch: async (fetchOptions) => {
          calls.fetchOptions = fetchOptions;
          return { status: () => overrides.redirect ? 302 : 200 };
        },
        fulfill: async () => { calls.fulfilled = true; },
        abort: async () => { calls.aborted = true; },
      });
      if (calls.aborted) throw new Error('Navigation blocked');
      return { ok: () => overrides.navigationOk !== false };
    },
    url: () => overrides.finalUrl ?? 'http://127.0.0.1:5173/preview',
    locator: (selector) => ({
      waitFor: async () => {
        calls.readySelector = selector;
        if (overrides.renderError) throw overrides.renderError;
        if (overrides.runtimeError) calls.pageerror(new Error('Demo crashed'));
      },
      count: async () => overrides.overlay ? 1 : 0,
    }),
    evaluate: async () => {},
  };
  const context = {
    newPage: async () => page,
    close: async () => {
      calls.contextClose += 1;
      if (overrides.contextCloseError) throw new Error('Context already closed');
    },
  };
  let connected = true;
  const browser = {
    newContext: async (options) => { calls.contextOptions = options; return context; },
    isConnected: () => overrides.alreadyDisconnected ? false : connected,
    close: async () => {
      calls.browserClose += 1;
      if (overrides.browserCloseError && calls.browserClose <= (overrides.browserCloseFailures ?? Infinity)) {
        throw overrides.browserCloseError;
      }
      connected = false;
    },
  };
  class Builder {
    constructor({ page: targetPage }) { assert.equal(targetPage, page); }
    async analyze() {
      calls.analyze = (calls.analyze ?? 0) + 1;
      if (overrides.analyze) return overrides.analyze();
      if (overrides.axeError) throw overrides.axeError;
      return { violations: [], incomplete: [], testEngine: { name: 'axe-core', version: 'fixture' } };
    }
  }
  const dependencies = {
    chromium: {
      launch: async (options) => {
        calls.launchOptions = options;
        if (overrides.launchError) throw overrides.launchError;
        if (overrides.launch) return overrides.launch(browser);
        return browser;
      },
    },
    AxeBuilder: Builder,
    readSource: async () => {
      calls.readSource += 1;
      if (overrides.readSource) return overrides.readSource(calls.readSource);
      return 'fixed controlled source';
    },
  };
  const config = createConfig({ SCAN_TIMEOUT_MS: String(overrides.timeout ?? 300) });
  return { scan: createAccessibilityScanner(config, dependencies), calls, browser, context, page };
}

test('scanner uses the fixed preview and shared browser settings, and closes every resource', async () => {
  const { scan, calls, page } = fixture();
  const report = await scan();
  assert.equal(report.status, 'completed');
  assert.equal(report.previewUrl, 'http://127.0.0.1:5173/preview');
  assert.match(report.scanId, /^[a-f\d-]{36}$/);
  assert.equal(Number.isNaN(Date.parse(report.scannedAt)), false);
  assert.match(report.sourceHash, /^[a-f\d]{64}$/);
  assert.equal(report.configuration.id, SCAN_POLICY.id);
  assert.equal(report.configuration.engineVersion, 'fixture');
  assert.equal(calls.launchOptions.headless, true);
  assert.equal(calls.launchOptions.channel, undefined);
  assert.deepEqual(calls.contextOptions.viewport, { width: 1280, height: 800 });
  assert.equal(calls.contextOptions.colorScheme, 'light');
  assert.equal(calls.contextOptions.reducedMotion, 'reduce');
  assert.equal(calls.url, report.previewUrl);
  assert.equal(calls.fetchOptions.maxRedirects, 0);
  assert.equal(calls.fulfilled, true);
  assert.ok(calls.navigationTimeout > 0 && calls.navigationTimeout <= 300);
  assert.match(calls.readySelector, /data-demo-ready="true"/);
  assert.equal(calls.readSource, 2);
  assert.equal(calls.analyze, 1);
  assert.equal(calls.contextClose, 1);
  assert.equal(calls.browserClose, 1);

  const blocked = [];
  await calls.route({
    request: () => ({ isNavigationRequest: () => true, frame: () => page.mainFrame(), url: () => 'https://example.com/' }),
    continue: async () => blocked.push('unexpected redirect'),
    abort: async () => blocked.push('blocked'),
  });
  await calls.route({
    request: () => ({ isNavigationRequest: () => true, frame: () => ({}), url: () => 'https://example.com/' }),
    continue: async () => blocked.push('child-frame allowed'),
    abort: async () => blocked.push('blocked'),
  });
  assert.deepEqual(blocked, ['blocked', 'child-frame allowed']);
});

test('missing Chromium and launch failures have useful service errors', async () => {
  for (const [error, code] of [
    [new Error("Executable doesn't exist. Please run playwright install"), 'BROWSER_NOT_INSTALLED'],
    [new Error('Process could not be started'), 'BROWSER_LAUNCH_FAILED'],
  ]) {
    const { scan, calls } = fixture({ launchError: error });
    await assert.rejects(scan(), (failure) => failure.status === 503 && failure.code === code);
    assert.equal(calls.contextClose, 0);
    assert.equal(calls.browserClose, 0);
  }
});

test('unavailable or redirected previews fail and release the browser', async () => {
  for (const overrides of [
    { navigationError: new Error('net::ERR_CONNECTION_REFUSED') },
    { navigationOk: false },
    { redirect: true },
    { finalUrl: 'http://127.0.0.1:5173/other' },
  ]) {
    const { scan, calls } = fixture(overrides);
    await assert.rejects(scan(), (failure) => failure.status === 503 && failure.code === 'PREVIEW_UNAVAILABLE');
    assert.equal(calls.contextClose, 1);
    assert.equal(calls.browserClose, 1);
    assert.equal(calls.analyze, undefined);
  }
});

test('runtime failures and Vite compilation overlays never become successful scans', async () => {
  for (const overrides of [{ runtimeError: true }, { overlay: true }]) {
    const { scan, calls } = fixture(overrides);
    await assert.rejects(scan(), (failure) => failure.status === 422 && failure.code === 'PREVIEW_RENDER_FAILED');
    assert.equal(calls.contextClose, 1);
    assert.equal(calls.browserClose, 1);
    assert.equal(calls.analyze, undefined);
  }
});

test('Playwright timeout and engine failures are typed and clean up resources', async () => {
  for (const [overrides, code, status] of [
    [{ navigationError: Object.assign(new Error('navigation timed out'), { name: 'TimeoutError' }) }, 'SCAN_TIMEOUT', 504],
    [{ axeError: new Error('axe injection failed') }, 'SCAN_FAILED', 500],
    [{ analyze: async () => ({}) }, 'SCAN_FAILED', 500],
  ]) {
    const { scan, calls } = fixture(overrides);
    await assert.rejects(scan(), (failure) => failure.code === code && failure.status === status);
    assert.equal(calls.contextClose, 1);
    assert.equal(calls.browserClose, 1);
  }
});

test('the total deadline includes a stalled axe analysis', async () => {
  const { scan, calls } = fixture({ timeout: 25, analyze: () => new Promise(() => {}) });
  await assert.rejects(scan(), (failure) => failure.code === 'SCAN_TIMEOUT' && failure.status === 504);
  assert.equal(calls.contextClose, 1);
  assert.equal(calls.browserClose, 1);
});

test('a browser arriving after a deadline is closed without starting a context', async () => {
  let releaseLaunch;
  const { scan, calls } = fixture({ timeout: 25, launch: (browser) => new Promise((resolve) => {
    releaseLaunch = () => resolve(browser);
  }) });
  await assert.rejects(scan(), (failure) => failure.code === 'SCAN_TIMEOUT');
  releaseLaunch();
  await delay(10);
  assert.equal(calls.browserClose, 1);
  assert.equal(calls.contextOptions, undefined);
});

test('a context close failure cannot prevent browser closure', async () => {
  const { scan, calls } = fixture({ contextCloseError: true, axeError: new Error('engine failure') });
  await assert.rejects(scan(), (failure) => failure.code === 'SCAN_FAILED');
  assert.equal(calls.contextClose, 1);
  assert.equal(calls.browserClose, 1);
});

test('failed browser cleanup cannot silently return a completed report', async () => {
  const closeFailure = new Error('Browser connection could not be closed');
  const { scan, calls } = fixture({ browserCloseError: closeFailure });
  await assert.rejects(scan(), (failure) => (
    failure.status === 500 && failure.code === 'SCAN_FAILED' &&
    /could not be closed/.test(failure.message) && failure.cause === closeFailure
  ));
  assert.equal(calls.contextClose, 1);
  assert.equal(calls.browserClose, 2);
});

test('secondary cleanup failure is logged while preserving the primary scan error', async (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  const engineFailure = new Error('axe injection failed');
  const { scan, calls } = fixture({
    axeError: engineFailure, browserCloseError: new Error('Browser close failed'),
  });
  await assert.rejects(scan(), (failure) => (
    failure.code === 'SCAN_FAILED' && failure.cause === engineFailure &&
    !/could not be closed/.test(failure.message)
  ));
  assert.equal(calls.browserClose, 2);
  assert.equal(logged.length, 1);
  assert.match(logged[0][0], /browser cleanup also failed/);
  assert.match(logged[0][1].message, /could not be closed/);
});

test('transient close failure gets one retry and an already-disconnected browser is accepted', async () => {
  const transient = fixture({ browserCloseError: new Error('Transient close failure'), browserCloseFailures: 1 });
  assert.equal((await transient.scan()).status, 'completed');
  assert.equal(transient.calls.browserClose, 2);

  const disconnected = fixture({ browserCloseError: new Error('Connection already closed'), alreadyDisconnected: true });
  assert.equal((await disconnected.scan()).status, 'completed');
  assert.equal(disconnected.calls.browserClose, 1);
});

test('cleanup failure for a browser arriving after timeout is still logged', async (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  let releaseLaunch;
  const { scan, calls } = fixture({
    timeout: 25,
    browserCloseError: new Error('Late browser close failed'),
    launch: (browser) => new Promise((resolve) => { releaseLaunch = () => resolve(browser); }),
  });
  await assert.rejects(scan(), (failure) => failure.code === 'SCAN_TIMEOUT');
  releaseLaunch();
  await delay(10);
  assert.equal(calls.browserClose, 2);
  assert.equal(logged.length, 1);
  assert.match(logged[0][0], /late resource cleanup failed/);
});

test('source changes invalidate results without writing either source file', async () => {
  const { scan, calls } = fixture({ readSource: (attempt) => attempt === 1 ? 'before' : 'after' });
  await assert.rejects(scan(), (failure) => failure.status === 409 && failure.code === 'SOURCE_CHANGED');
  assert.equal(calls.readSource, 2);
  assert.equal(calls.contextClose, 1);
  assert.equal(calls.browserClose, 1);
});
