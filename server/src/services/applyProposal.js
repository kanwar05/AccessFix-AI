import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import { demoPaths } from '../config.js';
import { ScanError } from '../errors.js';

const allowedAddedAttributes = new Set(['aria-label', 'htmlFor', 'id']);
const ignoredKeys = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'innerComments', 'trailingComments']);
const hashSource = (source) => createHash('sha256').update(source).digest('hex');

function unsupported(message) {
  throw new ScanError(422, 'UNSUPPORTED_PROPOSED_CHANGE', `${message} Only accessibility labels, IDs and safe color styling may change.`);
}

function parseModule(source) {
  try {
    return parse(source, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false }).program;
  } catch (error) {
    throw new ScanError(422, 'INVALID_PROPOSED_SOURCE', `The approved proposal is not valid JSX${error.loc ? ` at line ${error.loc.line}, column ${error.loc.column + 1}` : ''}.`, { cause: error });
  }
}

function comparable(node) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(comparable);
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (!ignoredKeys.has(key)) result[key] = comparable(value);
  }
  return result;
}

function same(a, b) {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

function attributeName(attribute) {
  return attribute?.name?.name ?? attribute?.name?.value;
}

function compareStyle(oldValue, newValue) {
  if (!oldValue || !newValue || oldValue.type !== 'JSXExpressionContainer' || newValue.type !== 'JSXExpressionContainer') return false;
  const oldExpression = oldValue.expression;
  const newExpression = newValue.expression;
  if (oldExpression.type !== 'ObjectExpression' || newExpression.type !== 'ObjectExpression') return false;
  const oldProperties = oldExpression.properties;
  const newProperties = newExpression.properties;
  if (oldProperties.length !== newProperties.length) return false;
  let colorChanged = false;
  for (let index = 0; index < oldProperties.length; index++) {
    const oldProperty = oldProperties[index];
    const newProperty = newProperties[index];
    if (oldProperty.type !== 'ObjectProperty' || newProperty.type !== 'ObjectProperty' ||
      !same(oldProperty.key, newProperty.key)) return false;
    if (oldProperty.key.type === 'Identifier' && oldProperty.key.name === 'color' && !same(oldProperty.value, newProperty.value)) {
      colorChanged = true;
    } else if (!same(oldProperty.value, newProperty.value)) {
      return false;
    }
  }
  return colorChanged;
}

function compareAttributes(oldAttributes, newAttributes) {
  const oldMap = new Map(oldAttributes.map((attribute) => [attributeName(attribute), attribute]));
  const newMap = new Map(newAttributes.map((attribute) => [attributeName(attribute), attribute]));
  for (const [name, oldAttribute] of oldMap) {
    const newAttribute = newMap.get(name);
    if (!newAttribute) unsupported(`The proposal removed the existing "${name}" attribute.`);
    if (name === 'style' ? !same(oldAttribute.value, newAttribute.value) && !compareStyle(oldAttribute.value, newAttribute.value) : !same(oldAttribute, newAttribute)) {
      unsupported(`The proposal changed the existing "${name}" attribute.`);
    }
  }
  for (const name of newMap.keys()) {
    if (!oldMap.has(name) && !allowedAddedAttributes.has(name)) {
      unsupported(`The proposal added the unsupported "${name}" attribute.`);
    }
    if (!oldMap.has(name) && newMap.get(name).value?.type !== 'StringLiteral') {
      unsupported(`The "${name}" accessibility attribute must be a static string.`);
    }
  }
}

function isSafeColor(value) {
  return value?.type === 'StringLiteral' && /^#[\da-f]{6}$/i.test(value.value);
}

function compareStyleConstant(oldNode, newNode, path = []) {
  if (!oldNode || !newNode || oldNode.type !== newNode.type) unsupported('The proposal changed the styles definition.');
  if (oldNode.type === 'ObjectExpression') {
    if (oldNode.properties.length !== newNode.properties.length) unsupported('The proposal changed the styles definition.');
    oldNode.properties.forEach((oldProperty, index) => {
      const newProperty = newNode.properties[index];
      if (oldProperty.type !== 'ObjectProperty' || newProperty.type !== 'ObjectProperty' ||
        !same(oldProperty.key, newProperty.key)) unsupported('The proposal changed the styles definition.');
      const propertyName = oldProperty.key.name ?? oldProperty.key.value;
      if (path.length === 1 && path[0] === 'helper' && propertyName === 'color') {
        if (!isSafeColor(oldProperty.value) || !isSafeColor(newProperty.value)) {
          unsupported('The helper text color must be a static six-digit hexadecimal color.');
        }
        return;
      }
      compareStyleConstant(oldProperty.value, newProperty.value, [...path, propertyName]);
    });
    return;
  }
  if (!same(oldNode, newNode)) unsupported('The proposal changed the styles definition.');
}

function compareNodes(oldNode, newNode) {
  if (oldNode == null || typeof oldNode !== 'object' || newNode == null || typeof newNode !== 'object') {
    if (oldNode !== newNode) unsupported('The proposal changed executable or component structure.');
    return;
  }
  if (!oldNode || !newNode) {
    if (oldNode === newNode) return;
    unsupported('The proposal changed the component structure.');
  }
  if (oldNode.type === 'JSXOpeningElement' && newNode.type === 'JSXOpeningElement') {
    const oldName = oldNode.name?.name;
    const newName = newNode.name?.name;
    if (oldName !== newName && !(oldName === 'p' && newName === 'label')) {
      unsupported('The proposal changed an element to an unsupported tag.');
    }
    compareAttributes(oldNode.attributes, newNode.attributes);
    if (oldNode.selfClosing !== newNode.selfClosing) unsupported('The proposal changed element structure.');
    return;
  }
  if (oldNode.type === 'JSXClosingElement' && newNode.type === 'JSXClosingElement') {
    const oldName = oldNode.name?.name;
    const newName = newNode.name?.name;
    if (oldName !== newName && !(oldName === 'p' && newName === 'label')) unsupported('The proposal changed an element to an unsupported tag.');
    return;
  }
  if (oldNode.type !== newNode.type) unsupported('The proposal changed executable or component structure.');
  if (oldNode.type === 'JSXAttribute') {
    if (!same(oldNode, newNode)) unsupported('The proposal changed an unsupported JSX attribute.');
    return;
  }
  if (oldNode.type === 'JSXElement') {
    compareNodes(oldNode.openingElement, newNode.openingElement);
    if (oldNode.children.length !== newNode.children.length) unsupported('The proposal changed visible component content.');
    oldNode.children.forEach((child, index) => compareNodes(child, newNode.children[index]));
    return;
  }
  if (oldNode.type === 'VariableDeclarator' && oldNode.id.type === 'Identifier' && oldNode.id.name === 'styles') {
    if (newNode.id.type !== 'Identifier' || newNode.id.name !== 'styles') unsupported('The proposal changed the styles definition.');
    compareStyleConstant(oldNode.init, newNode.init);
    return;
  }
  if (Array.isArray(oldNode)) {
    if (oldNode.length !== newNode.length) unsupported('The proposal changed component structure.');
    oldNode.forEach((child, index) => compareNodes(child, newNode[index]));
    return;
  }
  for (const key of Object.keys(oldNode)) {
    if (!ignoredKeys.has(key) && key !== 'openingElement' && key !== 'closingElement' && key !== 'children') {
      compareNodes(oldNode[key], newNode[key]);
    }
  }
}

export function assertSafeProposal(originalCode, proposedCode) {
  const original = parseModule(originalCode);
  const proposed = parseModule(proposedCode);
  if (original.body.length !== proposed.body.length) unsupported('The proposal changed module structure.');
  compareNodes(original, proposed);
  return proposed;
}

async function replaceSource(source, { read = readFile, write = writeFile, move = rename } = {}) {
  const target = demoPaths.active;
  const temporary = `${target}.accessfix-${process.pid}-${Date.now()}.tmp`;
  await write(temporary, source, { encoding: 'utf8', mode: 0o600 });
  try {
    await move(temporary, target);
  } catch (error) {
    await write(target, source, { encoding: 'utf8', mode: 0o600 }).catch(() => {});
    throw new ScanError(500, 'SOURCE_WRITE_FAILED', 'The controlled demo could not be replaced safely.', { cause: error });
  }
  return read(target, 'utf8');
}

export function createApplyService({ read = readFile, write = writeFile, move = rename } = {}) {
  return {
    async apply(originalCode, proposedCode) {
      assertSafeProposal(originalCode, proposedCode);
      const current = await read(demoPaths.active, 'utf8');
      if (hashSource(current) !== hashSource(originalCode)) {
        throw new ScanError(409, 'STALE_SOURCE', 'The active component changed since this proposal was generated. Scan and generate again.');
      }
      await replaceSource(proposedCode, { read, write, move });
      return { sourceHash: hashSource(proposedCode) };
    },
    async restore(source) {
      await replaceSource(source, { read, write, move });
      return { sourceHash: hashSource(source) };
    },
  };
}

export function compareVerification(before, after) {
  const beforeRules = new Set(before.violations.map((issue) => issue.id));
  const afterRules = new Set(after.violations.map((issue) => issue.id));
  const resolved = [...beforeRules].filter((id) => !afterRules.has(id));
  const remaining = [...afterRules].filter((id) => beforeRules.has(id));
  const introduced = [...afterRules].filter((id) => !beforeRules.has(id));
  const reductionPercentage = before.violatedRuleCount > 0
    ? Math.round(((before.violatedRuleCount - after.violatedRuleCount) / before.violatedRuleCount) * 100)
    : null;
  return {
    before: {
      scanId: before.scanId,
      violatedRuleCount: before.violatedRuleCount,
      affectedElementCount: before.affectedElementCount,
    },
    after: {
      scanId: after.scanId,
      violatedRuleCount: after.violatedRuleCount,
      affectedElementCount: after.affectedElementCount,
    },
    resolvedRuleIds: resolved,
    remainingRuleIds: remaining,
    introducedRuleIds: introduced,
    reductionPercentage,
    status: introduced.length === 0 && after.violatedRuleCount < before.violatedRuleCount
      ? 'verified-improvement' : 'verified-with-remaining-issues',
  };
}

export { hashSource };
