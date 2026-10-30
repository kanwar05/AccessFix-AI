import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { hashSource } from '../src/services/applyProposal.js';

const source = 'export default function Demo() { return <main>demo</main>; }\n';
const proposalSource = 'export default function Demo() { return <main aria-label="demo">demo</main>; }\n';

function report(scanId, sourceHash, ids) {
  return {
    status: 'completed', scanId, sourceHash, violatedRuleCount: ids.length,
    affectedElementCount: ids.length, violations: ids.map((id) => ({ id })),
  };
}

async function setup({ verificationFails = false, verificationReadFails = false, applyService = null, onApply = () => {} } = {}) {
  let active = source;
  let activeReads = 0;
  let scanNumber = 0;
  const before = report('scan-before', hashSource(source), ['label', 'button-name']);
  const after = report('scan-after', hashSource(proposalSource), verificationFails ? ['label', 'new-rule'] : []);
  const scan = async () => {
    scanNumber++;
    if (scanNumber === 1) return before;
    if (verificationFails) throw new Error('preview failed');
    return after;
  };
  const app = createApp({
    scan,
    generateFix: async (current) => ({
      status: 'proposed', proposalId: 'proposal-1', scanId: current.scanId,
      model: 'test-model', generatedAt: new Date().toISOString(),
      sourceHash: current.sourceHash, originalCode: source, proposedCode: proposalSource,
      applied: false, verified: false,
    }),
    applyService: applyService ?? {
      async apply(original, proposed) {
        assert.equal(original, active);
        active = proposed;
        onApply();
        return { sourceHash: hashSource(proposed) };
      },
      async restore(original) {
        active = original;
        return { sourceHash: hashSource(original) };
      },
    },
    readActiveSource: async () => {
      if (++activeReads === 2 && verificationReadFails) throw new Error('post-scan source read failed');
      return active;
    },
    readOriginalSource: async () => source,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options, signal: AbortSignal.timeout(5000),
  });
  return {
    request, get active() { return active; }, before, after,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function scanAndGenerate(fixture) {
  const scan = await fixture.request('/api/scan', { method: 'POST' });
  const scanBody = await scan.json();
  const generated = await fixture.request('/api/generate-fix', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanId: scanBody.scanId }),
  });
  return { scanBody, proposal: await generated.json() };
}

test('apply-and-verify applies an approved proposal and reset restores the original', async (t) => {
  const fixture = await setup();
  t.after(fixture.close);
  const { scanBody, proposal } = await scanAndGenerate(fixture);

  const applied = await fixture.request('/api/apply-and-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: proposal.proposalId, scanId: scanBody.scanId, approved: true }),
  });
  const result = await applied.json();
  assert.equal(applied.status, 200);
  assert.equal(result.verified, true);
  assert.deepEqual(result.verification.resolvedRuleIds, ['label', 'button-name']);
  assert.deepEqual(result.verification.introducedRuleIds, []);
  assert.equal(fixture.active, proposalSource);

  const reset = await fixture.request('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(reset.status, 200);
  assert.equal(fixture.active, source);
  assert.equal((await fixture.request('/api/generate-fix', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanId: scanBody.scanId }),
  })).status, 409);
});

test('missing, false and non-boolean approvals cannot modify the active source', async (t) => {
  let applyCount = 0;
  const fixture = await setup({ onApply: () => { applyCount++; } });
  t.after(fixture.close);
  const { scanBody, proposal } = await scanAndGenerate(fixture);
  const identifiers = { proposalId: proposal.proposalId, scanId: scanBody.scanId };

  for (const payload of [
    identifiers,
    { ...identifiers, approved: false },
    { ...identifiers, approved: 'true' },
    { ...identifiers, approved: true, proposedCode: proposalSource },
  ]) {
    const response = await fixture.request('/api/apply-and-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_APPROVAL_INPUT');
    assert.equal(fixture.active, source);
  }
  assert.equal(applyCount, 0);
});

test('verification failure rolls back the active source and leaves the original immutable', async (t) => {
  const fixture = await setup({ verificationFails: true });
  t.after(fixture.close);
  const { scanBody, proposal } = await scanAndGenerate(fixture);
  const response = await fixture.request('/api/apply-and-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: proposal.proposalId, scanId: scanBody.scanId, approved: true }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'APPLY_ROLLED_BACK');
  assert.equal(fixture.active, source);
});

test('post-scan source read failure rolls back even after a successful scan', async (t) => {
  const fixture = await setup({ verificationReadFails: true });
  t.after(fixture.close);
  const { scanBody, proposal } = await scanAndGenerate(fixture);
  const response = await fixture.request('/api/apply-and-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: proposal.proposalId, scanId: scanBody.scanId, approved: true }),
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'APPLY_ROLLED_BACK');
  assert.equal(fixture.active, source);
});

test('stale and duplicate approvals are rejected without a second verification', async (t) => {
  let applyCount = 0;
  const fixture = await setup({ onApply: () => { applyCount++; } });
  t.after(fixture.close);
  const { scanBody, proposal } = await scanAndGenerate(fixture);
  const payload = { proposalId: proposal.proposalId, scanId: scanBody.scanId, approved: true };
  const first = await fixture.request('/api/apply-and-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(first.status, 200);
  const second = await fixture.request('/api/apply-and-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error.code, 'STALE_PROPOSAL');
  assert.equal(applyCount, 1);
});
