import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createConfig, demoPaths } from '../src/config.js';
import { ScanError } from '../src/errors.js';
import { createFixGenerator } from '../src/services/fixGenerator.js';

const code = 'export default function Login() { return <main><label htmlFor="email">Email</label><input id="email" /></main>; }';
const hash = (source) => createHash('sha256').update(source).digest('hex');
const config = createConfig({ OLLAMA_TIMEOUT_MS: '1000' });
const source = 'export default function Login() { return <main><p>Email</p><input id="email" /></main>; }';
function scanFor(text = source) {
  return {
    status: 'completed', scanId: 'generator-test-scan', sourceHash: hash(text),
    violations: [{
      id: 'label', impact: 'critical', help: 'Form elements must have labels',
      description: 'Ensure every form element has a label', recommendedAction: 'Add an associated label', wcagTags: ['wcag412'],
      nodes: [{ target: ['#email'], html: '<input id="email">', failureSummary: 'Form element has no label.' }],
    }],
  };
}

test('fix generation reads the controlled file, returns a validated proposal and leaves both demo files unchanged', async () => {
  const before = await Promise.all([readFile(demoPaths.original), readFile(demoPaths.active)]);
  const generate = createFixGenerator(config, { chat: async (messages) => {
    assert.ok(messages[1].content.includes(source));
    assert.ok(messages[1].content.includes('label'));
    return { model: 'test-model', content: `\n\`\`\`jsx\n${code}\n\`\`\`\n` };
  }, readSource: async () => source });
  const report = await generate(scanFor(source));
  assert.equal(report.status, 'proposed');
  assert.match(report.proposalId, /^[a-f\d-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(report.generatedAt)));
  assert.equal(report.model, 'test-model');
  assert.equal(report.originalCode, source);
  assert.equal(report.proposedCode, code);
  assert.equal(report.sourceHash, hash(source));
  assert.equal(report.scanId, 'generator-test-scan');
  assert.equal(report.applied, false);
  assert.equal(report.verified, false);
  assert.deepEqual(await Promise.all([readFile(demoPaths.original), readFile(demoPaths.active)]), before);
});

test('generation requires a completed fingerprinted scan containing violations', async () => {
  let called = false;
  const generate = createFixGenerator(config, { chat: async () => { called = true; } });
  for (const scan of [null, {}, { ...scanFor(), status: 'failed' }, { ...scanFor(), sourceHash: 'invalid' }]) {
    await assert.rejects(generate(scan), (error) => error.status === 409 && error.code === 'SCAN_REQUIRED');
  }
  await assert.rejects(generate({ ...scanFor(), violations: [] }), (error) => error.status === 422 && error.code === 'NO_VIOLATIONS');
  assert.equal(called, false);
});

test('source mismatch before or after inference rejects stale proposals without modifying source', async () => {
  let calls = 0;
  const generate = createFixGenerator(config, {
    readSource: async () => source,
    chat: async () => { calls++; return { content: code, model: 'test-model' }; },
  });
  await assert.rejects(generate(scanFor('different source')), (error) => error.code === 'STALE_SCAN');
  assert.equal(calls, 0);
  let reads = 0;
  const changed = createFixGenerator(config, {
    readSource: async () => ++reads === 1 ? source : `${source}\n// changed`,
    chat: async () => ({ content: code, model: 'test-model' }),
  });
  await assert.rejects(changed(scanFor()), (error) => error.status === 409 && error.code === 'STALE_SCAN');
});

test('malformed JSX gets one real-client correction request with feedback, then stops', async () => {
  const lengths = [];
  const generate = createFixGenerator(config, {
    readSource: async () => source,
    chat: async (messages) => {
      lengths.push(messages.length);
      if (lengths.length === 1) return { content: 'export default function Broken(', model: 'test-model' };
      assert.match(messages.at(-1).content, /previous module was rejected/);
      return { content: code, model: 'test-model' };
    },
  });
  assert.equal((await generate(scanFor())).proposedCode, code);
  assert.deepEqual(lengths, [2, 4]);
  let calls = 0;
  const alwaysInvalid = createFixGenerator(config, {
    readSource: async () => source,
    chat: async () => { calls++; return { content: 'export default function Broken(', model: 'test-model' }; },
  });
  await assert.rejects(alwaysInvalid(scanFor()), (error) => error.code === 'INVALID_AI_CODE');
  assert.equal(calls, 2);
});

test('unsupported model code is rejected without execution or a fallback patch', async () => {
  let calls = 0;
  const generate = createFixGenerator(config, {
    readSource: async () => source,
    chat: async () => { calls++; return { model: 'test-model', content: 'export default function Login(){ fetch("https://example.com"); return <main />; }' }; },
  });
  await assert.rejects(generate(scanFor()), (error) => error.code === 'UNSUPPORTED_AI_CODE');
  assert.equal(calls, 2);
});

test('a model edit plan is applied to the original source and safety-checked', async () => {
  const generate = createFixGenerator(config, {
    readSource: async () => source,
    chat: async () => ({
      model: 'test-model',
      content: JSON.stringify({
        edits: [{ find: '<p>Email</p>', replace: '<label htmlFor="email">Email</label>' }],
      }),
    }),
  });
  const report = await generate(scanFor());
  assert.equal(report.proposedCode, code);
  assert.equal(report.originalCode, source);
});

test('service errors are not retried and the total generation deadline bounds all model work', async () => {
  let calls = 0;
  const missingModel = new ScanError(503, 'OLLAMA_MODEL_NOT_FOUND', 'Install the configured model.');
  const unavailable = createFixGenerator(config, {
    readSource: async () => source,
    chat: async () => { calls++; throw missingModel; },
  });
  await assert.rejects(unavailable(scanFor()), (error) => error === missingModel);
  assert.equal(calls, 1);
  const slow = createFixGenerator({ ...config, ollamaTimeoutMs: 25 }, {
    readSource: async () => source,
    chat: (_messages, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  });
  await assert.rejects(slow(scanFor()), (error) => error.status === 504 && error.code === 'OLLAMA_TIMEOUT');
});

test('source size and cancellation are enforced before a proposal can be returned', async () => {
  let called = false;
  const tooLarge = createFixGenerator({ ...config, aiMaxCodeBytes: 5 }, {
    readSource: async () => source,
    chat: async () => { called = true; },
  });
  await assert.rejects(tooLarge(scanFor()), (error) => error.status === 413 && error.code === 'DEMO_SOURCE_TOO_LARGE');
  assert.equal(called, false);
  const controller = new AbortController();
  const reason = new ScanError(409, 'STALE_SCAN', 'A new scan started.');
  controller.abort(reason);
  const cancelled = createFixGenerator(config, {
    readSource: async () => source,
    chat: async () => { called = true; },
  });
  await assert.rejects(cancelled(scanFor(), { signal: controller.signal }), (error) => error === reason);
  assert.equal(called, false);
});
