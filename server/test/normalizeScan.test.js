import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeScan } from '../src/services/normalizeScan.js';

function node(target, overrides = {}) {
  return {
    target: [target], html: `<input id="${target.slice(1)}">`, impact: 'critical',
    failureSummary: 'Fix any of the following: the element has no label.',
    any: [{ id: 'label', impact: 'critical', message: 'The element has no label.', data: { observed: true }, relatedNodes: [] }],
    all: [], none: [], ...overrides,
  };
}

function finding(id, impact, nodes) {
  return {
    id, impact, help: `Recommended action for ${id}`, description: `Description for ${id}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`,
    tags: ['cat.forms', 'wcag2a', 'wcag131'], nodes,
  };
}

test('normalization separates rule severity counts from unique affected element counts', () => {
  const report = normalizeScan({
    violations: [
      finding('label', 'critical', [node('#email'), node('#password')]),
      finding('button-name', 'critical', [node('#toggle')]),
      finding('color-contrast', 'serious', [node('#email'), node('#helper')]),
    ],
    incomplete: [{ id: 'manual-review' }],
  });

  assert.equal(report.violatedRuleCount, 3);
  assert.equal(report.affectedElementCount, 4);
  assert.equal(report.violations[0].affectedElementCount, 2);
  assert.equal(report.incompleteRuleCount, 1);
  assert.deepEqual(report.severityBreakdown, {
    critical: 2, serious: 1, moderate: 0, minor: 0, unclassified: 0,
  });
});

test('normalization preserves actual guidance, selectors, HTML, WCAG tags and check details', () => {
  const target = [['#shadow-root', '#field']];
  const report = normalizeScan({
    violations: [finding('label', 'critical', [node('#field', { target })])], incomplete: [],
  });
  const rule = report.violations[0];
  assert.equal(rule.recommendedAction, 'Recommended action for label');
  assert.equal(rule.description, 'Description for label');
  assert.deepEqual(rule.tags, ['cat.forms', 'wcag2a', 'wcag131']);
  assert.deepEqual(rule.wcagTags, ['wcag2a', 'wcag131']);
  assert.deepEqual(rule.nodes[0].target, target);
  assert.equal(rule.nodes[0].html, '<input id="field">');
  assert.match(rule.nodes[0].failureSummary, /no label/);
  assert.deepEqual(rule.nodes[0].checks.any[0].data, { observed: true });
  assert.equal(rule.nodes[0].checks.any[0].message, 'The element has no label.');
});

test('all supported impact levels and missing/unknown impacts are counted explicitly', () => {
  const report = normalizeScan({
    violations: ['critical', 'serious', 'moderate', 'minor', null, 'unknown'].map((impact, index) => (
      finding(`rule-${index}`, impact, [node(`#element-${index}`, { impact })])
    )),
    incomplete: [],
  });
  assert.deepEqual(report.severityBreakdown, {
    critical: 1, serious: 1, moderate: 1, minor: 1, unclassified: 2,
  });
  assert.equal(report.violations[4].impact, 'unclassified');
  assert.equal(report.violations[5].nodes[0].impact, 'unclassified');
});

test('a valid empty axe report remains a completed zero-finding normalization', () => {
  assert.deepEqual(normalizeScan({ violations: [], incomplete: [] }), {
    violatedRuleCount: 0,
    affectedElementCount: 0,
    severityBreakdown: { critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 },
    incompleteRuleCount: 0,
    violations: [],
  });
});

test('repeated selectors are deduplicated within a rule and across rules', () => {
  const report = normalizeScan({
    violations: [
      finding('one', 'minor', [node('#same'), node('#same')]),
      finding('two', 'serious', [node('#same')]),
    ], incomplete: [],
  });
  assert.equal(report.violatedRuleCount, 2);
  assert.equal(report.affectedElementCount, 1);
  assert.equal(report.violations[0].affectedElementCount, 1);
  assert.equal(report.violations[0].nodes.length, 2);
});

test('malformed engine output is rejected instead of becoming a passing report', () => {
  for (const invalid of [
    null,
    {},
    { violations: null, incomplete: [] },
    { violations: [], incomplete: null },
    { violations: [{}], incomplete: [] },
    { violations: [finding('empty', 'minor', [])], incomplete: [] },
    { violations: [finding('bad-target', 'minor', [node('#x', { target: [] })])], incomplete: [] },
    { violations: [finding('bad-node', 'minor', [node('#x', { html: null })])], incomplete: [] },
  ]) {
    assert.throws(() => normalizeScan(invalid), (error) => error.code === 'SCAN_FAILED' && error.status === 500);
  }
});
