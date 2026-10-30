import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStructuredRepairEdits, getSupportedRepairTargets } from '../src/services/structuredRepair.js';
import { assertSafeProposal } from '../src/services/applyProposal.js';
import { validateProposal } from '../src/services/validateProposal.js';

const source = "const styles = { helper: { color: '#aaaaaa', fontSize: 11 }, other: { color: '#aaaaaa' } }; export default function Demo() { return <p style={styles.helper}>Actual helper</p>; }";
const scan = { violations: [{ id: 'color-contrast', nodes: [{ target: ['p'], html: '<p style="color: rgb(170, 170, 170);">Actual helper</p>', checks: { any: [{ id: 'color-contrast', data: { fgColor: '#aaaaaa', bgColor: '#ffffff', expectedContrastRatio: '4.5:1' } }] } }] }] };
const edit = { operation: 'set-static-color', target: 'styles.helper.color', value: '#123456', ruleId: 'color-contrast', reason: 'Actual helper needs darker text on the scanned white background.' };
const plan = (edits = [edit]) => JSON.stringify({ edits });
const reject = (text, report = scan, code = source) => assert.throws(() => applyStructuredRepairEdits(code, text, report), (error) => error.code === 'INVALID_AI_EDIT_PLAN');

test('typed repair changes only the scanned allowlisted AST literal, preserving identical colors elsewhere', () => {
  const result = applyStructuredRepairEdits(source, plan(), scan);
  assert.equal(result, source.replace("helper: { color: '#aaaaaa'", 'helper: { color: "#123456"'));
  assert.equal(validateProposal(result), result);
  assertSafeProposal(source, result);
  assert.equal(getSupportedRepairTargets(source, scan)[0].node.target[0], 'p');
});

test('typed repair rejects arbitrary operations, paths, code injection, unknown fields and missing justification', () => {
  for (const changed of [
    { operation: 'replace-source' }, { target: 'styles.other.color' }, { ruleId: 'label' },
    { value: '#fff' }, { value: '#123456;fetch()' }, { value: '#aaaaaa' },
    { value: '#007bff' },
    { reason: '' }, { reason: ' ' }, { reason: 'x'.repeat(1001) }, { find: 'anything' },
  ]) reject(plan([{ ...edit, ...changed }]));
  for (const text of ['bad JSON', 'null', '[]', plan([]), plan([edit, edit]), JSON.stringify({ edits: [edit], extra: true }), '{"edits":[{"find":"a","replace":"b"}]}']) reject(text);
});

test('typed repair requires an actual matching finding, unique AST slot and unique affected element', () => {
  for (const report of [null, { violations: [] }, { violations: [{ ...scan.violations[0], id: 'label' }] },
    { violations: [{ ...scan.violations[0], nodes: [{ html: '<p>Unrelated helper</p>' }] }] },
    { violations: [{ ...scan.violations[0], nodes: [...scan.violations[0].nodes, ...scan.violations[0].nodes] }] },
  ]) reject(plan(), report);
  for (const code of [source.replace('styles.helper}', 'styles.other}'), source.replace("'#aaaaaa'", 'dynamicColor'), source.replace("helper: {", "helper: {}, helper: {"), source.replace('Actual helper', 'Actual &amp; helper'), 'invalid source']) reject(plan(), scan, code);
});

test('numeric contrast uses actual scan background and threshold without rounding up', () => {
  reject(plan([{ ...edit, value: '#777777' }])); // 4.478:1 on white is below 4.5.
  assert.doesNotThrow(() => applyStructuredRepairEdits(source, plan([{ ...edit, value: '#767676' }]), scan));
  const darkScan = structuredClone(scan);
  darkScan.violations[0].nodes[0].checks.any[0].data.bgColor = '#000000';
  reject(plan([{ ...edit, value: '#000000' }]), darkScan);
  assert.doesNotThrow(() => applyStructuredRepairEdits(source, plan([{ ...edit, value: '#ffffff' }]), darkScan));
  for (const overrides of [{ fgColor: '#123456' }, { bgColor: 'unknown' }, { expectedContrastRatio: 'unknown' }]) {
    const unsupported = structuredClone(scan);
    Object.assign(unsupported.violations[0].nodes[0].checks.any[0].data, overrides);
    reject(plan(), unsupported);
  }
});
