import test from 'node:test';
import assert from 'node:assert/strict';
import { getGhostStatus } from '../src/lib/ghostMode.js';

test('Ghost Mode uses verification rule IDs for resolved, remaining and introduced findings', () => {
  const verification = {
    resolvedRuleIds: ['label'],
    remainingRuleIds: ['button-name'],
    introducedRuleIds: ['color-contrast'],
  };
  assert.equal(getGhostStatus('label', { verification }).label, 'Ghost Removed');
  assert.equal(getGhostStatus('button-name', { verification }).label, 'Still Haunting');
  assert.equal(getGhostStatus('color-contrast', { verification }).label, 'New Apparition');
});

test('Ghost Mode does not call an unapproved proposal resolved', () => {
  const status = getGhostStatus('label', { proposal: { applied: false } });
  assert.equal(status.label, 'Awaiting Permission');
  assert.equal(getGhostStatus('button-name').label, 'Ghost Detected');
});
