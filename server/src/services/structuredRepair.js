import { parse } from '@babel/parser';
import { ScanError } from '../errors.js';

export const REPAIR_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['edits'],
  properties: {
    edits: {
      type: 'array', minItems: 1, maxItems: 1,
      items: {
        type: 'object', additionalProperties: false,
        required: ['operation', 'target', 'value', 'ruleId', 'reason'],
        properties: {
          operation: { type: 'string', enum: ['set-static-color'] },
          target: { type: 'string', enum: ['styles.helper.color'] },
          value: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          ruleId: { type: 'string', enum: ['color-contrast'] },
          reason: { type: 'string', minLength: 1, maxLength: 1000 },
        },
      },
    },
  },
};

function invalid(message) {
  throw new ScanError(422, 'INVALID_AI_EDIT_PLAN', message);
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (!['loc', 'extra', 'comments', 'tokens'].includes(key)) walk(value, visit);
  }
}

function property(object, name) {
  const matches = object?.type === 'ObjectExpression' ? object.properties.filter((entry) => (
    entry.type === 'ObjectProperty' && !entry.computed && (entry.key.name ?? entry.key.value) === name
  )) : [];
  return matches.length === 1 ? matches[0].value : null;
}

// WCAG sRGB relative luminance, using the unrounded ratio for the threshold.
function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

// Discover only the existing AST-policy-allowlisted slot, bound to an actual
// affected helper paragraph. Never accept model-supplied source, offsets or paths.
export function getSupportedRepairTargets(source, scan) {
  const finding = scan?.violations?.find((entry) => entry.id === 'color-contrast');
  if (!finding) return [];
  let ast;
  try { ast = parse(source, { sourceType: 'module', plugins: ['jsx'] }); }
  catch { return []; }
  const colors = [];
  const paragraphs = [];
  walk(ast.program, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.name === 'styles') {
      const color = property(property(node.init, 'helper'), 'color');
      if (color?.type === 'StringLiteral' && /^#[\da-f]{6}$/i.test(color.value)) colors.push(color);
    }
    if (node.type !== 'JSXElement' || node.openingElement.name?.name !== 'p') return;
    const style = node.openingElement.attributes.find((entry) => entry.name?.name === 'style')?.value?.expression;
    if (style?.type !== 'MemberExpression' || style.computed || style.object?.name !== 'styles' || style.property?.name !== 'helper') return;
    if (!node.children.every((child) => child.type === 'JSXText')) return;
    const text = node.children.map((child) => child.value).join('').trim();
    if (text) paragraphs.push(text);
  });
  if (colors.length !== 1 || paragraphs.length !== 1) return [];
  const text = paragraphs[0];
  // Refuse entities/markup instead of guessing the HTML-to-JSX mapping.
  if (/[<>&]/.test(text)) return [];
  const nodes = (finding.nodes ?? []).filter((node) => {
    const match = /^<p(?:\s[^>]*)?>([^<>]*)<\/p>$/.exec(node.html ?? '');
    return match?.[1] === text;
  });
  if (nodes.length !== 1) return [];
  const checks = ['any', 'all', 'none'].flatMap((kind) => nodes[0].checks?.[kind] ?? []);
  const contrast = checks.find((check) => check.id === 'color-contrast')?.data;
  if (!contrast || typeof contrast.fgColor !== 'string' ||
    contrast.fgColor.toLowerCase() !== colors[0].value.toLowerCase() ||
    !/^#[\da-f]{6}$/i.test(contrast.bgColor ?? '') || !/^(3|4\.5|7):1$/.test(contrast.expectedContrastRatio ?? '')) return [];
  return [{
    operation: 'set-static-color', target: 'styles.helper.color', ruleId: finding.id,
    currentValue: colors[0].value, text, node: nodes[0],
    background: contrast.bgColor, minimumContrast: Number(contrast.expectedContrastRatio.split(':')[0]),
    start: colors[0].start, end: colors[0].end,
  }];
}

export function applyStructuredRepairEdits(source, content, scan) {
  let plan;
  try { plan = JSON.parse(content); }
  catch { invalid('The model must return a JSON edit plan without code fences.'); }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) ||
    Object.keys(plan).length !== 1 || !Array.isArray(plan.edits) || plan.edits.length !== 1) {
    invalid('The model edit plan must contain exactly one supported edit.');
  }
  const edit = plan.edits[0];
  if (!edit || Object.keys(edit).sort().join(',') !== 'operation,reason,ruleId,target,value' ||
    edit.operation !== 'set-static-color' || edit.target !== 'styles.helper.color' ||
    edit.ruleId !== 'color-contrast' || typeof edit.value !== 'string' || !/^#[\da-f]{6}$/i.test(edit.value) ||
    typeof edit.reason !== 'string' || !edit.reason.trim() || edit.reason.length > 1000) {
    invalid('Only set-static-color for styles.helper.color with a six-digit hex value, color-contrast rule and justification is supported.');
  }
  const [target] = getSupportedRepairTargets(source, scan);
  if (!target) invalid('The edit does not match an existing allowlisted color and genuine affected scan element.');
  if (target.currentValue.toLowerCase() === edit.value.toLowerCase()) invalid('The model proposed no color change.');
  const ratio = contrastRatio(edit.value, target.background);
  if (ratio < target.minimumContrast) {
    invalid(`The chosen color ${edit.value} has contrast ${ratio.toFixed(2)}:1 against ${target.background}, below the actual scan threshold ${target.minimumContrast}:1. Choose a darker text color for this light background or a lighter one for a dark background.`);
  }
  return `${source.slice(0, target.start)}${JSON.stringify(edit.value)}${source.slice(target.end)}`;
}
