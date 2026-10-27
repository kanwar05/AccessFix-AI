import { parse } from '@babel/parser';
import { ScanError } from '../errors.js';

// This is a deliberately narrow component policy, not a JavaScript sandbox.
// Phase 3 only displays this text; it never imports, compiles, or executes it.
export const PROPOSAL_POLICY = Object.freeze({
  allowedImportSources: Object.freeze(['react']),
  forbiddenGlobals: Object.freeze([
    'window', 'document', 'globalThis', 'global', 'self', 'parent', 'top',
    'navigator', 'location', 'process', 'module', 'exports', 'Buffer',
    'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker',
    'localStorage', 'sessionStorage', 'indexedDB', 'caches',
    'eval', 'Function', 'require', 'Deno', 'Bun',
    'alert', 'confirm', 'prompt', 'console', 'setTimeout', 'setInterval',
    'requestAnimationFrame', 'queueMicrotask',
  ]),
  forbiddenSyntax: Object.freeze([
    'ImportExpression', 'MetaProperty', 'NewExpression', 'ClassDeclaration',
    'ClassExpression', 'WithStatement', 'DebuggerStatement', 'AwaitExpression', 'YieldExpression',
  ]),
  forbiddenJsxElements: Object.freeze(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'style']),
  forbiddenJsxAttributes: Object.freeze(['dangerouslySetInnerHTML', 'srcDoc', 'src', 'srcSet', 'poster', 'action', 'formAction']),
  forbiddenMemberProperties: Object.freeze(['constructor', 'prototype', '__proto__']),
});

const forbiddenGlobals = new Set(PROPOSAL_POLICY.forbiddenGlobals);
const forbiddenSyntax = new Set(PROPOSAL_POLICY.forbiddenSyntax);
const forbiddenElements = new Set(PROPOSAL_POLICY.forbiddenJsxElements);
const forbiddenAttributes = new Set(PROPOSAL_POLICY.forbiddenJsxAttributes);
const forbiddenProperties = new Set(PROPOSAL_POLICY.forbiddenMemberProperties);
const isFunction = (node) => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node?.type);

function invalid(message, cause) {
  return new ScanError(422, 'INVALID_AI_CODE', message, cause ? { cause } : undefined);
}

function unsupported(message) {
  return new ScanError(422, 'UNSUPPORTED_AI_CODE', `${message} This prototype supports a local React component without new dependencies or external capabilities.`);
}

function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent, key);
  for (const [childKey, value] of Object.entries(node)) {
    if (childKey === 'loc' || childKey === 'extra' || childKey.endsWith('Comments')) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, node, childKey);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit, node, childKey);
    }
  }
}

function isReference(node, parent, key) {
  if (!parent) return true;
  if (['MemberExpression', 'OptionalMemberExpression'].includes(parent.type) && key === 'property' && !parent.computed) return false;
  if (['ObjectProperty', 'ObjectMethod'].includes(parent.type) && key === 'key' && !parent.computed) return false;
  if (isFunction(parent) && (key === 'id' || key === 'params')) return false;
  if (parent.type === 'VariableDeclarator' && key === 'id') return false;
  if (parent.type.startsWith('Import')) return false;
  if (['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent.type) && key === 'label') return false;
  // Destructuring binding keys are still harmless property names; any use as a value is visited separately.
  if (parent.type === 'ObjectPattern' || parent.type === 'ArrayPattern') return false;
  return node.type === 'Identifier';
}

function assertCapabilities(program) {
  walk(program, (node, parent, key) => {
    if (forbiddenSyntax.has(node.type)) throw unsupported(`${node.type} is not supported in an AI proposal.`);
    if (node.type === 'Identifier' && forbiddenGlobals.has(node.name) && isReference(node, parent, key)) {
      throw unsupported(`The proposal references the unsupported capability "${node.name}".`);
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Import') {
      throw unsupported('Dynamic imports are not supported.');
    }
    if (['MemberExpression', 'OptionalMemberExpression'].includes(node.type)) {
      const property = node.computed ? node.property.value : node.property.name;
      if (forbiddenProperties.has(property)) throw unsupported(`Access to "${property}" is not supported.`);
    }
    if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && forbiddenElements.has(node.name.name.toLowerCase())) {
      throw unsupported(`The <${node.name.name}> element is not supported.`);
    }
    if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier') {
      const name = node.name.name;
      if (forbiddenAttributes.has(name)) throw unsupported(`The JSX attribute "${name}" is not supported.`);
      if (/^on[A-Z]/.test(name) && node.value?.type === 'StringLiteral') {
        throw unsupported('Event handlers must be React functions, not executable strings.');
      }
      if (['href', 'xlinkHref'].includes(name)) {
        const value = node.value?.type === 'StringLiteral' ? node.value.value : null;
        if (typeof value !== 'string' || !value.startsWith('#')) {
          throw unsupported('Only fragment links are supported in the controlled component.');
        }
      }
    }
  });
}

function isPureConstant(node, knownBindings) {
  if (!node) return false;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'BigIntLiteral'].includes(node.type)) return true;
  if (node.type === 'Identifier') return knownBindings.has(node.name) || node.name === 'undefined';
  if (isFunction(node)) return true;
  if (node.type === 'ObjectExpression') {
    return node.properties.every((property) => property.type === 'SpreadElement'
      ? isPureConstant(property.argument, knownBindings)
      : property.type === 'ObjectProperty' &&
        (!property.computed || isPureConstant(property.key, knownBindings)) &&
        isPureConstant(property.value, knownBindings));
  }
  if (node.type === 'ArrayExpression') return node.elements.every((item) => !item || isPureConstant(item, knownBindings));
  if (node.type === 'SpreadElement') return isPureConstant(node.argument, knownBindings);
  if (node.type === 'UnaryExpression') return node.operator !== 'delete' && isPureConstant(node.argument, knownBindings);
  if (['BinaryExpression', 'LogicalExpression'].includes(node.type)) {
    return isPureConstant(node.left, knownBindings) && isPureConstant(node.right, knownBindings);
  }
  if (node.type === 'ConditionalExpression') {
    return [node.test, node.consequent, node.alternate].every((item) => isPureConstant(item, knownBindings));
  }
  if (node.type === 'TemplateLiteral') return node.expressions.every((item) => isPureConstant(item, knownBindings));
  if (node.type === 'MemberExpression') {
    return isPureConstant(node.object, knownBindings) && (!node.computed || isPureConstant(node.property, knownBindings));
  }
  return false;
}

function inspectModule(program) {
  const bindings = new Map();
  const knownBindings = new Set();
  const defaultExports = program.body.filter((node) => node.type === 'ExportDefaultDeclaration');
  if (defaultExports.length !== 1) {
    throw invalid('Return a complete JSX module with exactly one default-exported React function component.');
  }
  for (const node of program.body) {
    if (node.type === 'FunctionDeclaration' && node.id) {
      knownBindings.add(node.id.name);
      bindings.set(node.id.name, node);
    }
    if (node.type === 'ImportDeclaration') {
      if (node.source.value !== 'react' || node.specifiers.length === 0 || node.assertions?.length || node.attributes?.length) {
        throw unsupported('Only ordinary imports from "react" are supported.');
      }
      for (const specifier of node.specifiers) knownBindings.add(specifier.local.name);
    }
  }
  for (const node of program.body) {
    if (['ImportDeclaration', 'FunctionDeclaration', 'ExportDefaultDeclaration', 'EmptyStatement'].includes(node.type)) continue;
    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') {
      throw unsupported('Module scope may contain only React imports, pure const values, functions and the default export.');
    }
    for (const declaration of node.declarations) {
      if (declaration.id.type !== 'Identifier' || !isPureConstant(declaration.init, knownBindings)) {
        throw unsupported('Module-level constants must have pure values; module-scope calls and effects are unsupported.');
      }
      knownBindings.add(declaration.id.name);
      bindings.set(declaration.id.name, declaration.init);
    }
  }
  const exported = defaultExports[0].declaration;
  const component = exported.type === 'Identifier' ? bindings.get(exported.name) : exported;
  if (!isFunction(component) || component.async || component.generator) {
    throw invalid('The default export must be a synchronous React function component that returns JSX.');
  }
  return component;
}

function componentReturnsJsx(component) {
  const localValues = new Map();
  function expressionHasJsx(node, seen = new Set()) {
    if (!node) return false;
    if (['JSXElement', 'JSXFragment'].includes(node.type)) return true;
    if (node.type === 'Identifier' && localValues.has(node.name) && !seen.has(node.name)) {
      return expressionHasJsx(localValues.get(node.name), new Set([...seen, node.name]));
    }
    if (node.type === 'ConditionalExpression') return expressionHasJsx(node.consequent, seen) || expressionHasJsx(node.alternate, seen);
    if (node.type === 'LogicalExpression') return expressionHasJsx(node.left, seen) || expressionHasJsx(node.right, seen);
    if (node.type === 'ArrayExpression') return node.elements.some((item) => expressionHasJsx(item, seen));
    return false;
  }
  if (component.body.type !== 'BlockStatement') return expressionHasJsx(component.body);
  const returns = [];
  function visitBody(node) {
    if (!node || (node !== component && isFunction(node))) return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') localValues.set(node.id.name, node.init);
    if (node.type === 'ReturnStatement') returns.push(node.argument);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visitBody(child);
      } else if (value && typeof value.type === 'string') visitBody(value);
    }
  }
  visitBody(component.body);
  return returns.some((value) => expressionHasJsx(value));
}

export function validateProposal(content, { maxCodeBytes = 65536 } = {}) {
  if (typeof content !== 'string' || !content.trim()) throw invalid('The model returned no JSX. Generate the proposal again.');
  if (Buffer.byteLength(content, 'utf8') > maxCodeBytes) throw invalid(`The proposed module exceeds the ${maxCodeBytes}-byte limit. Request a smaller complete component.`);
  let code = content.trim();
  if (code.startsWith('```')) {
    const fenced = /^```(?:jsx|js|javascript|tsx)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(code);
    if (!fenced) throw invalid('Return one complete JSX module without surrounding explanations or incomplete Markdown fences.');
    code = fenced[1].trim();
  }
  if (!code) throw invalid('The model returned an empty JSX module. Generate the proposal again.');
  let program;
  try {
    program = parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false }).program;
  } catch (error) {
    throw invalid(`The model returned invalid JSX${error.loc ? ` at line ${error.loc.line}, column ${error.loc.column + 1}` : ''}. Generate a complete valid module again.`, error);
  }
  const component = inspectModule(program);
  assertCapabilities(program);
  if (!componentReturnsJsx(component)) throw invalid('The default-exported function must return JSX, rather than a placeholder, object, or empty implementation.');
  return code;
}
