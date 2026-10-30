import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertSafeProposal, compareVerification } from '../src/services/applyProposal.js';

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
  assert.throws(
    () => assertSafeProposal(source, accessibleProposal().replace('setMessage(', 'fetch(')),
    (error) => error.code === 'UNSUPPORTED_PROPOSED_CHANGE',
  );
  assert.throws(
    () => assertSafeProposal(source, accessibleProposal().replace('<main ', '<iframe ').replace('</main>', '</iframe>')),
    (error) => error.code === 'UNSUPPORTED_PROPOSED_CHANGE',
  );
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
