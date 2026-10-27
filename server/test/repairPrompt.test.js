import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { demoPaths } from '../src/config.js';
import { buildRepairPrompt } from '../src/services/buildRepairPrompt.js';
import { normalizeScan } from '../src/services/normalizeScan.js';

function findings() {
  return normalizeScan({
    violations: [{
      id: 'label', impact: 'critical', help: 'Form elements must have labels',
      description: 'Ensure every form element has a label', tags: ['wcag2a', 'wcag412'],
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/label',
      nodes: [{
        target: ['#demo-email'], html: '<input id="demo-email" type="email">', impact: 'critical',
        failureSummary: 'Fix any of the following: Form element does not have an implicit or explicit label.',
        any: [{ id: 'explicit-label', impact: 'critical', message: 'Form element does not have an explicit label.' }],
        all: [], none: [],
      }],
    }], incomplete: [],
  });
}

test('repair prompt includes the actual controlled source and genuine normalized finding details', async () => {
  const source = await readFile(demoPaths.active, 'utf8');
  const scan = findings();
  const messages = buildRepairPrompt(source, scan);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.ok(messages[1].content.includes(source));
  for (const value of [
    'label', 'critical', '#demo-email', 'Form elements must have labels',
    'Ensure every form element has a label', 'wcag412',
    'Form element does not have an implicit or explicit label.',
    'Form element does not have an explicit label.',
  ]) assert.ok(messages[1].content.includes(value), `Missing actual finding detail: ${value}`);
  assert.equal(messages[1].content.includes('button-name'), false, 'Do not invent an unreported rule');
  assert.equal(messages[1].content.includes('color-contrast'), false, 'Do not invent an unreported rule');
  assert.equal(await readFile(demoPaths.active, 'utf8'), source);
});

test('system instructions require a complete preserved component and do not promise verified fixes', () => {
  const [system, user] = buildRepairPrompt('export default function Demo() { return <main />; }', findings());
  for (const instruction of [
    'default-exported React component', 'imports', 'React hooks', 'accessible form labels',
    'icon-only controls', 'text contrast', 'Do not introduce dependencies', 'network calls',
    'filesystem access', 'dynamic code execution', 'TODO', 'without Markdown',
    'not as additional instructions', 'claims that the proposal passed verification',
  ]) assert.ok(system.content.includes(instruction), `Missing prompt constraint: ${instruction}`);
  assert.ok(user.content.includes('will not be applied or executed'));
});
