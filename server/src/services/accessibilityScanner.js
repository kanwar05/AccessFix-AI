import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { demoPaths } from '../config.js';
import { ScanError } from '../errors.js';
import { normalizeScan } from './normalizeScan.js';

export const SCAN_POLICY = Object.freeze({
  id: 'accessfix-axe-v1',
  browser: 'chromium',
  viewport: Object.freeze({ width: 1280, height: 800 }),
  colorScheme: 'light',
  reducedMotion: 'reduce',
  rules: 'all-default-enabled',
});

const readySelector = '[data-testid="active-demo"][data-demo-ready="true"]';
const hashSource = (source) => createHash('sha256').update(source).digest('hex');

function timeoutError() {
  return new ScanError(504, 'SCAN_TIMEOUT', 'The accessibility scan timed out. Check the local preview and try again.');
}

function classifyError(error, stage) {
  if (error instanceof ScanError) return error;
  if (error?.name === 'TimeoutError') return timeoutError();
  if (stage === 'launch') {
    if (/executable doesn't exist|browser.*not.*installed|playwright install/i.test(error?.message ?? '')) {
      return new ScanError(503, 'BROWSER_NOT_INSTALLED', 'Chromium is not installed. Run npm run setup:browser from the project root, then retry.', { cause: error });
    }
    return new ScanError(503, 'BROWSER_LAUNCH_FAILED', 'Chromium could not start. Check the Playwright installation and available system resources.', { cause: error });
  }
  if (stage === 'navigate') {
    return new ScanError(503, 'PREVIEW_UNAVAILABLE', 'The local preview could not be reached. Start the client with npm run dev:client and try again.', { cause: error });
  }
  if (stage === 'render') {
    return new ScanError(422, 'PREVIEW_RENDER_FAILED', 'The demo did not render successfully. Check the Vite terminal and the /preview page.', { cause: error });
  }
  return new ScanError(500, 'SCAN_FAILED', 'The accessibility scan failed. Check the local preview and try again.', { cause: error });
}

export function createAccessibilityScanner(config, dependencies = {}) {
  const browserType = dependencies.chromium ?? chromium;
  const Builder = dependencies.AxeBuilder ?? AxeBuilder;
  const readSource = dependencies.readSource ?? (() => readFile(demoPaths.active, 'utf8'));

  // No URL, source text, or filesystem path is accepted by the returned function.
  return async function scan() {
    let browser;
    let context;
    let stage = 'source';
    let finished = false;
    let primaryFailure;
    let report;
    let timer;
    const deadline = Date.now() + config.scanTimeoutMs;
    const closing = new WeakMap();

    function closeOnce(resource) {
      if (!resource) return Promise.resolve();
      if (!closing.has(resource)) {
        closing.set(resource, (async () => {
          const isBrowser = resource === browser;
          const attempts = isBrowser ? 2 : 1;
          let closeError;
          for (let attempt = 0; attempt < attempts; attempt++) {
            try {
              await resource.close();
              return;
            } catch (error) {
              closeError = error;
              // Playwright can reject close after the connection has already ended.
              if (isBrowser && resource.isConnected?.() === false) return;
            }
          }
          if (isBrowser) {
            throw new ScanError(500, 'SCAN_FAILED', 'Chromium could not be closed after the scan. Restart the local API before scanning again.', { cause: closeError });
          }
          throw closeError;
        })());
      }
      return closing.get(resource);
    }

    async function closeLateResource(resource) {
      try {
        await closeOnce(resource);
      } catch (error) {
        console.error('Accessibility scan late resource cleanup failed:', error);
      }
    }

    function ensureTime() {
      if (finished || Date.now() >= deadline) throw timeoutError();
    }

    function remainingTime() {
      ensureTime();
      return Math.max(1, deadline - Date.now());
    }

    async function run() {
      const sourceHash = hashSource(await readSource());
      ensureTime();
      stage = 'launch';
      browser = await browserType.launch({ headless: true, timeout: remainingTime() });
      if (finished) {
        await closeLateResource(browser);
        throw timeoutError();
      }

      stage = 'context';
      context = await browser.newContext({
        viewport: { ...SCAN_POLICY.viewport },
        colorScheme: SCAN_POLICY.colorScheme,
        reducedMotion: SCAN_POLICY.reducedMotion,
        serviceWorkers: 'block',
      });
      if (finished) {
        await closeLateResource(context);
        throw timeoutError();
      }
      const page = await context.newPage();
      ensureTime();
      page.setDefaultTimeout(remainingTime());
      page.setDefaultNavigationTimeout(remainingTime());
      let runtimeFailure = false;
      page.on('pageerror', () => { runtimeFailure = true; });
      let navigationFailure;

      // Fetch navigation without following redirects: routing alone does not intercept every redirect hop.
      await page.route('**/*', async (route) => {
        try {
          const request = route.request();
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            if (request.url() !== config.previewUrl) {
              throw new ScanError(503, 'PREVIEW_UNAVAILABLE', 'The preview tried to navigate outside its fixed /preview route.');
            }
            const response = await route.fetch({ maxRedirects: 0, timeout: remainingTime() });
            if (response.status() >= 300 && response.status() < 400) {
              throw new ScanError(503, 'PREVIEW_UNAVAILABLE', 'The local preview must render directly without redirecting to another page.');
            }
            await route.fulfill({ response });
            return;
          }
          await route.continue();
        } catch (error) {
          navigationFailure = classifyError(error, 'navigate');
          await route.abort('blockedbyclient').catch(() => {});
        }
      });

      stage = 'navigate';
      let response;
      try {
        response = await page.goto(config.previewUrl, { waitUntil: 'domcontentloaded', timeout: remainingTime() });
      } catch (error) {
        throw navigationFailure ?? error;
      }
      if (navigationFailure) throw navigationFailure;
      if (!response || !response.ok() || page.url() !== config.previewUrl) {
        throw new ScanError(503, 'PREVIEW_UNAVAILABLE', 'The configured local preview did not return a successful page. Check the client URL and /preview route.');
      }

      stage = 'render';
      await page.locator(readySelector).waitFor({ state: 'visible', timeout: remainingTime() });
      await page.evaluate(() => globalThis.document.fonts.ready);
      ensureTime();
      if (runtimeFailure || await page.locator('vite-error-overlay').count()) {
        throw new ScanError(422, 'PREVIEW_RENDER_FAILED', 'The preview has a compilation or runtime error. Fix the component before scanning.');
      }

      stage = 'analyze';
      const results = await new Builder({ page }).analyze();
      ensureTime();
      if (runtimeFailure || await page.locator('vite-error-overlay').count()) {
        throw new ScanError(422, 'PREVIEW_RENDER_FAILED', 'The preview failed while the accessibility scan was running. Try again after fixing the component.');
      }
      if (hashSource(await readSource()) !== sourceHash) {
        throw new ScanError(409, 'SOURCE_CHANGED', 'The active component changed during the scan. Run a new scan for the current source.');
      }
      ensureTime();

      return {
        status: 'completed',
        scanId: randomUUID(),
        scannedAt: new Date().toISOString(),
        previewUrl: config.previewUrl,
        sourceHash,
        configuration: {
          ...SCAN_POLICY,
          viewport: { ...SCAN_POLICY.viewport },
          engine: results.testEngine?.name ?? 'axe-core',
          engineVersion: results.testEngine?.version ?? null,
        },
        ...normalizeScan(results),
      };
    }

    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => { finished = true; reject(timeoutError()); }, config.scanTimeoutMs);
    });

    try {
      report = await Promise.race([run(), timedOut]);
    } catch (error) {
      primaryFailure = classifyError(error, stage);
    } finally {
      finished = true;
      clearTimeout(timer);
      // A context close failure is harmless if closing its browser succeeds.
      const [, browserCleanup] = await Promise.allSettled([closeOnce(context), closeOnce(browser)]);
      if (browserCleanup.status === 'rejected') {
        if (primaryFailure) {
          console.error('Accessibility scan browser cleanup also failed:', browserCleanup.reason);
        } else {
          primaryFailure = browserCleanup.reason;
        }
      }
    }
    if (primaryFailure) throw primaryFailure;
    return report;
  };
}
