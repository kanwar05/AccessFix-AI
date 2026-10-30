import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertSafeProposal, compareVerification, createApplyService } from '../src/services/applyProposal.js';
import { demoPaths } from '../src/config.js';

const source = await readFile(new URL('../../client/src/demo/ActiveDemo.jsx', import.meta.url), 'utf8');

function accessibleProposal() {
  return source
    .replace('<p style={styles.fieldText}>Email address</p>', '<label htmlFor="demo-email" style={styles.fieldText}>Email address</label>')
    .replace('<p style={styles.fieldText}>Password</p>', '<label htmlFor="demo-password" style={styles.fieldText}>Password</label>')
    .replace('<button type="button" onClick=', '<button aria-label="Show password" type="button" onClick=')
    .replace("color: '#a3a8b5'", "color: '#596273'");
}

test('allowlisted accessibility-only changes pass the apply safety gate', () => {
  assert.doesNotThrow(() => assertSafeProposal(source, accessibleProposal()));
});

test('logic, imports and arbitrary JSX changes are rejected', () => {
  for (const unsafeSource of [
    accessibleProposal().replace('setMessage(', 'fetch('),
    accessibleProposal().replace('<main ', '<iframe ').replace('</main>', '</iframe>'),
    `import extra from 'untrusted-package';\n${accessibleProposal()}`,
    accessibleProposal().replace('onClick={() => setShowPassword(!showPassword)}', 'onClick={() => setMessage("changed")}'),
    accessibleProposal().replace('style={styles.fieldText}', ''),
    accessibleProposal().replace('Email address</label>', 'New visible text</label>'),
    accessibleProposal().replace("background: '#f3f4f7'", "background: '#000000'"),
  ]) {
    assert.throws(
      () => assertSafeProposal(source, unsafeSource),
      (error) => error.code === 'UNSUPPORTED_PROPOSED_CHANGE',
    );
  }
});

test('failed atomic replacement preserves active and original source', async () => {
  const files = new Map([
    [demoPaths.active, source],
    [demoPaths.original, source],
  ]);
  const writes = [];
  const service = createApplyService({
    read: async (path) => files.get(path),
    write: async (path, content) => {
      writes.push(path);
      files.set(path, content);
    },
    move: async () => { throw new Error('simulated rename failure'); },
  });

  await assert.rejects(
    service.apply(source, accessibleProposal()),
    (error) => error.code === 'SOURCE_WRITE_FAILED',
  );
  assert.equal(files.get(demoPaths.active), source);
  assert.equal(files.get(demoPaths.original), source);
  assert.ok(writes.every((path) => path !== demoPaths.active && path !== demoPaths.original));
});

test('verification comparison reports resolved, remaining and introduced rules', () => {
  const report = (scanId, ids, affectedElementCount = ids.length) => ({
    scanId, violatedRuleCount: ids.length, affectedElementCount,
    violations: ids.map((id) => ({ id })),
  });
  assert.deepEqual(compareVerification(report('before', ['label', 'button-name']), report('after', ['color-contrast', 'label'], 3)), {
    before: { scanId: 'before', violatedRuleCount: 2, affectedElementCount: 2 },
    after: { scanId: 'after', violatedRuleCount: 2, affectedElementCount: 3 },
    resolvedRuleIds: ['button-name'],
    remainingRuleIds: ['label'],
    introducedRuleIds: ['color-contrast'],
    reductionPercentage: 0,
    status: 'verified-with-remaining-issues',
  });
});
