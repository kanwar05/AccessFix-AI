import { ScanError } from '../errors.js';

export const IMPACT_LEVELS = Object.freeze(['critical', 'serious', 'moderate', 'minor', 'unclassified']);

function invalidResults() {
  return new ScanError(500, 'SCAN_FAILED', 'The accessibility engine returned an invalid report. Try scanning again.');
}

function normalizeImpact(value) {
  return IMPACT_LEVELS.includes(value) ? value : 'unclassified';
}

function normalizeChecks(checks = []) {
  if (!Array.isArray(checks)) throw invalidResults();
  return checks.map((check) => {
    if (!check || typeof check.id !== 'string' || typeof check.message !== 'string') {
      throw invalidResults();
    }
    return {
      id: check.id,
      impact: normalizeImpact(check.impact),
      message: check.message,
      data: check.data ?? null,
      relatedNodes: check.relatedNodes ?? [],
    };
  });
}

function normalizeFinding(finding) {
  if (
    !finding || typeof finding.id !== 'string' || !finding.id ||
    typeof finding.help !== 'string' || typeof finding.description !== 'string' ||
    typeof finding.helpUrl !== 'string' || !Array.isArray(finding.tags) ||
    !finding.tags.every((tag) => typeof tag === 'string') ||
    !Array.isArray(finding.nodes) || finding.nodes.length === 0
  ) {
    throw invalidResults();
  }

  const nodes = finding.nodes.map((node) => {
    if (!node || !Array.isArray(node.target) || !node.target.length || typeof node.html !== 'string') {
      throw invalidResults();
    }
    return {
      target: node.target,
      html: node.html,
      impact: normalizeImpact(node.impact),
      failureSummary: typeof node.failureSummary === 'string' ? node.failureSummary : '',
      checks: {
        any: normalizeChecks(node.any),
        all: normalizeChecks(node.all),
        none: normalizeChecks(node.none),
      },
    };
  });

  return {
    id: finding.id,
    help: finding.help,
    description: finding.description,
    recommendedAction: finding.help,
    impact: normalizeImpact(finding.impact),
    tags: [...finding.tags],
    wcagTags: finding.tags.filter((tag) => /^wcag/i.test(tag)),
    helpUrl: finding.helpUrl,
    affectedElementCount: new Set(nodes.map((node) => JSON.stringify(node.target))).size,
    nodes,
  };
}

export function normalizeScan(results) {
  if (!results || !Array.isArray(results.violations) || !Array.isArray(results.incomplete)) {
    throw invalidResults();
  }

  const violations = results.violations.map(normalizeFinding);
  const severityBreakdown = Object.fromEntries(IMPACT_LEVELS.map((impact) => [impact, 0]));
  const affectedTargets = new Set();
  for (const finding of violations) {
    severityBreakdown[finding.impact] += 1;
    for (const node of finding.nodes) affectedTargets.add(JSON.stringify(node.target));
  }

  return {
    violatedRuleCount: violations.length,
    affectedElementCount: affectedTargets.size,
    severityBreakdown,
    incompleteRuleCount: results.incomplete.length,
    violations,
  };
}
