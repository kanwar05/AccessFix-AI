import express from 'express';
import { createConfig } from './config.js';
import { ScanError } from './errors.js';
import { createAccessibilityScanner } from './services/accessibilityScanner.js';
import { assertRepairScan, createFixGenerator } from './services/fixGenerator.js';
import { compareVerification, createApplyService, hashSource } from './services/applyProposal.js';
import { readFile } from 'node:fs/promises';
import { demoPaths } from './config.js';

export function createApp({
  config = createConfig(), scan = createAccessibilityScanner(config),
  generateFix = createFixGenerator(config),
  applyService = createApplyService(),
  readActiveSource = () => readFile(demoPaths.active, 'utf8'),
  readOriginalSource = () => readFile(demoPaths.original, 'utf8'),
} = {}) {
  const app = express();
  let scanInProgress = false;
  let generationJob = null;
  let operationInProgress = null;
  // One controlled component: retain only its current scan, first baseline and current proposal.
  const session = { revision: 0, scan: null, baseline: null, proposal: null };
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
    if (operationInProgress) {
      res.set('Retry-After', '2');
      return next(new ScanError(409, 'OPERATION_IN_PROGRESS', 'Another demo operation is already running. Wait for it to finish, then try again.'));
    }

    scanInProgress = true;
    session.revision++;
    session.scan = null;
    session.proposal = null;
    generationJob?.controller.abort(new ScanError(409, 'STALE_SCAN', 'A new scan started. Generate a new proposal after that scan completes.'));
    try {
      const result = await scan();
      session.scan = result;
      session.baseline ??= result;
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

  app.post('/api/generate-fix', async (req, res, next) => {
    if ((req.get('Origin') && req.get('Origin') !== config.clientOrigin) || req.get('Sec-Fetch-Site') === 'cross-site') {
      return next(new ScanError(403, 'ORIGIN_NOT_ALLOWED', 'Generate proposals from the configured local dashboard.'));
    }
    if (!req.is('application/json') && req.body === undefined && Number(req.get('Content-Length') || 0) > 0) {
      return next(new ScanError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send application/json containing only the completed scanId.'));
    }
    if (
      Object.keys(req.query).length > 0 || !req.body || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || typeof req.body.scanId !== 'string' ||
      !req.body.scanId.trim() || req.body.scanId.length > 128
    ) {
      return next(new ScanError(400, 'INVALID_GENERATION_INPUT', 'Send only { "scanId": "the latest completed scan identifier" }. Source, findings, URLs and paths are not accepted.'));
    }
    if (scanInProgress || operationInProgress) {
      return next(new ScanError(409, 'SCAN_IN_PROGRESS', 'Wait for the current scan to complete before generating a proposal.'));
    }
    if (generationJob) {
      res.set('Retry-After', '2');
      return next(new ScanError(409, 'GENERATION_IN_PROGRESS', 'A proposal is already being generated. Wait for it to finish, then retry.'));
    }
    if (!session.scan) {
      return next(new ScanError(409, 'SCAN_REQUIRED', 'Run a successful accessibility scan before generating a proposal.'));
    }
    if (req.body.scanId !== session.scan.scanId) {
      return next(new ScanError(409, 'STALE_SCAN', 'This scan is no longer current. Use the latest completed scan to generate a proposal.'));
    }

    const job = { controller: new AbortController(), revision: session.revision, scan: session.scan };
    const cancelDisconnected = () => {
      if (!res.writableEnded) job.controller.abort(new ScanError(409, 'GENERATION_CANCELLED', 'The generation request was cancelled.'));
    };
    try {
      assertRepairScan(job.scan);
      generationJob = job;
      session.proposal = null;
      res.once('close', cancelDisconnected);
      const proposal = await generateFix(job.scan, { signal: job.controller.signal });
      if (session.revision !== job.revision || session.scan !== job.scan) {
        throw new ScanError(409, 'STALE_SCAN', 'The scan changed while the model was generating. Request a proposal for the latest scan.');
      }
      if (!res.destroyed && !job.controller.signal.aborted) {
        session.proposal = proposal;
        res.set('Cache-Control', 'no-store').json(proposal);
      }
    } catch (error) {
      if (!res.destroyed) {
        next(session.revision !== job.revision
          ? new ScanError(409, 'STALE_SCAN', 'The scan changed while the model was generating. Request a proposal for the latest scan.')
          : error instanceof ScanError ? error : new ScanError(
            500, 'GENERATION_FAILED', 'The AI proposal could not be generated. Check the server terminal and retry.', { cause: error },
          ));
      }
    } finally {
      res.removeListener('close', cancelDisconnected);
      if (generationJob === job) generationJob = null;
    }
  });

  app.post('/api/apply-and-verify', async (req, res, next) => {
    if ((req.get('Origin') && req.get('Origin') !== config.clientOrigin) || req.get('Sec-Fetch-Site') === 'cross-site') {
      return next(new ScanError(403, 'ORIGIN_NOT_ALLOWED', 'Apply proposals from the configured local dashboard.'));
    }
    if (!req.is('application/json') || !req.body || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 3 || typeof req.body.proposalId !== 'string' ||
      typeof req.body.scanId !== 'string' || req.body.approved !== true) {
      return next(new ScanError(400, 'INVALID_APPROVAL_INPUT', 'Send proposalId, scanId and approved: true for an explicit approval.'));
    }
    if (scanInProgress || generationJob || operationInProgress) {
      return next(new ScanError(409, 'OPERATION_IN_PROGRESS', 'Another demo operation is already running. Wait for it to finish, then try again.'));
    }
    if (!session.proposal || !session.scan) {
      return next(new ScanError(409, 'PROPOSAL_REQUIRED', 'Generate a current AI proposal before applying a fix.'));
    }
    if (req.body.proposalId !== session.proposal.proposalId || req.body.scanId !== session.scan.scanId) {
      return next(new ScanError(409, 'STALE_PROPOSAL', 'This proposal is no longer current. Scan and generate a new proposal.'));
    }

    operationInProgress = 'apply';
    const proposal = session.proposal;
    const before = session.scan;
    try {
      const originalCode = await readActiveSource();
      if (hashSource(originalCode) !== proposal.sourceHash || hashSource(originalCode) !== before.sourceHash) {
        throw new ScanError(409, 'STALE_SOURCE', 'The active component changed since this proposal was generated. Scan and generate again.');
      }
      const applied = await applyService.apply(originalCode, proposal.proposedCode);
      let after;
      try {
        after = await scan();
      } catch (error) {
        await applyService.restore(originalCode);
        throw new ScanError(422, 'APPLY_ROLLED_BACK', 'The proposal was rolled back because the updated preview failed to compile, render, or scan.', { cause: error });
      }
      if (hashSource(await readActiveSource()) !== applied.sourceHash) {
        await applyService.restore(originalCode);
        throw new ScanError(422, 'APPLY_ROLLED_BACK', 'The proposal was rolled back because the active source changed during verification.');
      }
      const verification = compareVerification(before, after);
      session.revision++;
      session.scan = after;
      session.proposal = { ...proposal, applied: true, verified: true };
      res.set('Cache-Control', 'no-store').json({
        status: verification.status, model: proposal.model, proposalId: proposal.proposalId,
        appliedAt: new Date().toISOString(), applied: true, verified: true,
        beforeScan: before, afterScan: after, verification,
      });
    } catch (error) {
      next(error instanceof ScanError ? error : new ScanError(
        500, 'APPLY_FAILED', 'The approved proposal could not be applied. No successful verification was recorded.', { cause: error },
      ));
    } finally {
      operationInProgress = null;
    }
  });

  app.post('/api/reset', async (req, res, next) => {
    if ((req.get('Origin') && req.get('Origin') !== config.clientOrigin) || req.get('Sec-Fetch-Site') === 'cross-site') {
      return next(new ScanError(403, 'ORIGIN_NOT_ALLOWED', 'Reset the demo from the configured local dashboard.'));
    }
    if (!req.is('application/json') && Number(req.get('Content-Length') || 0) > 0) {
      return next(new ScanError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Reset accepts an empty request body.'));
    }
    if (req.body && (Array.isArray(req.body) || Object.keys(req.body).length > 0) || Object.keys(req.query).length > 0) {
      return next(new ScanError(400, 'INVALID_RESET_INPUT', 'Reset accepts no parameters.'));
    }
    if (scanInProgress || generationJob || operationInProgress) {
      return next(new ScanError(409, 'OPERATION_IN_PROGRESS', 'Another demo operation is already running. Wait for it to finish, then try again.'));
    }
    operationInProgress = 'reset';
    try {
      const originalCode = await readOriginalSource();
      await applyService.restore(originalCode);
      try {
        const resetScan = await scan();
        session.revision++;
        session.scan = null;
        session.baseline = null;
        session.proposal = null;
        res.set('Cache-Control', 'no-store').json({
          status: 'reset', resetAt: new Date().toISOString(), sourceHash: resetScan.sourceHash,
          verification: { status: 'preview-rendered', scan: resetScan },
        });
      } catch (error) {
        throw new ScanError(422, 'RESET_FAILED', 'The demo was restored but the original preview could not be verified.', { cause: error });
      }
    } catch (error) {
      next(error instanceof ScanError ? error : new ScanError(
        500, 'RESET_FAILED', 'The controlled demo could not be reset.', { cause: error },
      ));
    } finally {
      operationInProgress = null;
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
      if (error.cause) console.error(`AccessFix API operation failed [${error.code}]:`, error.cause);
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
