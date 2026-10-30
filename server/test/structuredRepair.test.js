import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStructuredRepairEdits } from '../src/services/structuredRepair.js';

test('structured repair applies unique model-supplied source edits', () => {
  const source = '<p>Email</p><input id="email" />';
  const plan = JSON.stringify({
    edits: [
      { find: '<p>Email</p>', replace: '<label htmlFor="email">Email</label>' },
      { find: '<input id="email"', replace: '<input aria-label="Email" id="email"' },
    ],
  });
  assert.equal(
    applyStructuredRepairEdits(source, plan),
    '<label htmlFor="email">Email</label><input aria-label="Email" id="email" />',
  );
});

test('structured repair rejects ambiguous or malformed edits', () => {
  assert.throws(
    () => applyStructuredRepairEdits('<p>x</p><p>x</p>', '{"edits":[{"find":"<p>x</p>","replace":"<label>x</label>"}]}'),
    (error) => error.code === 'INVALID_AI_EDIT_PLAN',
  );
  assert.throws(
    () => applyStructuredRepairEdits('<p>x</p>', '{"edits":[]}'),
    (error) => error.code === 'INVALID_AI_EDIT_PLAN',
  );
});
