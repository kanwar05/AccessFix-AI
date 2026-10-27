import express from 'express';
import { createConfig } from './config.js';
import { ScanError } from './errors.js';
import { createAccessibilityScanner } from './services/accessibilityScanner.js';

export function createApp({ config = createConfig(), scan = createAccessibilityScanner(config) } = {}) {
  const app = express();
  let scanInProgress = false;
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      status: 'ok',
      service: 'AccessFix AI API',
      phase: 0,
    });
  });

  app.post('/api/scan', async (req, res, next) => {
    // A local CLI may omit Origin; a browser must come from the configured client.
    if ((req.get('Origin') && req.get('Origin') !== config.clientOrigin) || req.get('Sec-Fetch-Site') === 'cross-site') {
      return next(new ScanError(403, 'ORIGIN_NOT_ALLOWED', 'Start scans from the configured local dashboard.'));
    }

    const hasPayload = Number(req.get('Content-Length') || 0) > 0 || Boolean(req.get('Transfer-Encoding'));
    if (hasPayload && !req.is('application/json')) {
      return next(new ScanError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an empty request or an empty JSON object.'));
    }
    if (
      Object.keys(req.query).length > 0 ||
      (req.body !== undefined && (req.body === null || Array.isArray(req.body) ||
        typeof req.body !== 'object' || Object.keys(req.body).length > 0))
    ) {
      return next(new ScanError(400, 'UNSUPPORTED_SCAN_INPUT', 'This endpoint accepts no scan parameters. Only the configured local preview can be scanned.'));
    }

    if (scanInProgress) {
      res.set('Retry-After', '2');
      return next(new ScanError(409, 'SCAN_IN_PROGRESS', 'A scan is already running. Wait for it to finish, then try again.'));
    }

    scanInProgress = true;
    try {
      const result = await scan();
      if (!res.destroyed) res.set('Cache-Control', 'no-store').json(result);
    } catch (error) {
      next(error instanceof ScanError ? error : new ScanError(
        500, 'SCAN_FAILED', 'The accessibility scan could not be completed. Check the server terminal and try again.',
        { cause: error },
      ));
    } finally {
      // Keep the lock until scanner cleanup completes, even if the client disconnects.
      scanInProgress = false;
    }
  });

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' },
    });
  });

  // Express identifies error middleware by its four parameters.
  app.use((error, _req, res, _next) => {
    if (error instanceof ScanError) {
      if (error.cause) console.error(`Accessibility scan failed [${error.code}]:`, error.cause);
      return res.status(error.status).set('Cache-Control', 'no-store').json({
        error: { code: error.code, message: error.message },
      });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' },
      });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 64 KB limit.' },
      });
    }

    console.error('Unexpected API error:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
    });
  });

  return app;
}
