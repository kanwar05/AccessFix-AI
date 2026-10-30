import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { demoPaths } from '../config.js';
import { ScanError } from '../errors.js';
import { buildRepairPrompt } from './buildRepairPrompt.js';
import { createOllamaClient } from './ollamaClient.js';
import { validateProposal } from './validateProposal.js';
import { assertSafeProposal } from './applyProposal.js';
import { applyStructuredRepairEdits } from './structuredRepair.js';

const sourceHash = (source) => createHash('sha256').update(source).digest('hex');
const looksLikeStructuredEdits = (content) => /^\s*(?:\{\s*"edits"|\s*```json)/i.test(content);

export function assertRepairScan(scan) {
  if (
    !scan || scan.status !== 'completed' || typeof scan.scanId !== 'string' ||
    !/^[a-f\d]{64}$/.test(scan.sourceHash ?? '') || !Array.isArray(scan.violations)
  ) {
    throw new ScanError(409, 'SCAN_REQUIRED', 'Run a successful accessibility scan for the current demo before generating a proposal.');
  }
  if (scan.violations.length === 0) {
    throw new ScanError(422, 'NO_VIOLATIONS', 'The completed scan has no detected violations to send to the model.');
  }
}

export function createFixGenerator(config, dependencies = {}) {
  const readSource = dependencies.readSource ?? (() => readFile(demoPaths.active, 'utf8'));
  const chat = dependencies.chat ?? createOllamaClient(config);
  const validate = dependencies.validate ?? validateProposal;
  const validateSafety = dependencies.validateSafety ?? assertSafeProposal;

  return async function generateFix(scan, { signal } = {}) {
    assertRepairScan(scan);
    const originalCode = await readSource();
    if (Buffer.byteLength(originalCode, 'utf8') > config.aiMaxCodeBytes) {
      throw new ScanError(413, 'DEMO_SOURCE_TOO_LARGE', 'The controlled component exceeds AI_MAX_CODE_BYTES. Use a smaller demo before generating.');
    }
    if (sourceHash(originalCode) !== scan.sourceHash) {
      throw new ScanError(409, 'STALE_SCAN', 'The active component has changed since this scan. Scan again before generating a proposal.');
    }

    const controller = new AbortController();
    const stop = () => controller.abort(signal.reason);
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
    const timeout = setTimeout(() => controller.abort(new ScanError(
      504, 'OLLAMA_TIMEOUT', 'AI generation timed out. Try again or increase OLLAMA_TIMEOUT_MS for your hardware.',
    )), config.ollamaTimeoutMs);

    try {
      const messages = buildRepairPrompt(originalCode, scan);
      let proposedCode;
      let model;
      for (let attempt = 0; attempt < 2; attempt++) {
        controller.signal.throwIfAborted();
        const response = await chat(messages, { signal: controller.signal });
        controller.signal.throwIfAborted();
        model = response.model;
        try {
          proposedCode = looksLikeStructuredEdits(response.content)
            ? applyStructuredRepairEdits(originalCode, response.content)
            : validate(response.content, { maxCodeBytes: config.aiMaxCodeBytes });
          validateSafety(originalCode, proposedCode);
          break;
        } catch (error) {
          if (attempt === 1 || !['INVALID_AI_CODE', 'UNSUPPORTED_AI_CODE', 'INVALID_AI_EDIT_PLAN'].includes(error.code)) throw error;
          // One correction request to the real model; never substitute a prepared patch.
          messages.push(
            { role: 'assistant', content: response.content },
            { role: 'user', content: `Your previous module was rejected by the syntax or apply safety validator: ${error.message}
Return a JSON object only in this exact shape: {"edits":[{"find":"exact source fragment","replace":"replacement fragment"}]}.
Use one to eight exact, unique string replacements against the supplied source. Make only these allowlisted edits: add a static aria-label, add a static htmlFor, add a static id, convert the visible form-label <p> to <label>, or change styles.helper.color to a static six-digit hex value. Preserve every other character and all wrapper elements. Do not change visible text, add elements, restructure JSX, change handlers, change unrelated styles, add imports, or add executable logic.` },
          );
        }
      }
      controller.signal.throwIfAborted();
      if (sourceHash(await readSource()) !== scan.sourceHash) {
        throw new ScanError(409, 'STALE_SCAN', 'The active component changed during generation. Scan again to request a current proposal.');
      }
      return {
        status: 'proposed', proposalId: randomUUID(), scanId: scan.scanId,
        model, generatedAt: new Date().toISOString(), sourceHash: scan.sourceHash,
        originalCode, proposedCode, applied: false, verified: false,
      };
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason instanceof ScanError) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', stop);
    }
  };
}
