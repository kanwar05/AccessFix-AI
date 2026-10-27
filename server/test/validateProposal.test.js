import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { demoPaths } from '../src/config.js';
import { PROPOSAL_POLICY, validateProposal } from '../src/services/validateProposal.js';

const component = "import { useState } from 'react';\nexport default function Login() { const [shown, setShown] = useState(false); return <form onSubmit={(event) => event.preventDefault()}><label htmlFor='email'>Email</label><input id='email' type='email' /><button type='button' onClick={() => setShown(!shown)} aria-label='Show password'>Show</button></form>; }";
const rejects = (source, code = 'UNSUPPORTED_AI_CODE', options) => assert.throws(
  () => validateProposal(source, options),
  (error) => error.status === 422 && error.code === code,
);

test('the actual controlled demo and a complete proposal validate without changing their text', async () => {
  const original = await readFile(demoPaths.active, 'utf8');
  assert.equal(validateProposal(original), original.trim());
  assert.equal(validateProposal(component), component);
});

test('extraction trims whitespace and removes only a single complete surrounding code fence', () => {
  assert.equal(validateProposal(` \n ${component} \n `), component);
  for (const language of ['', 'jsx', 'js', 'javascript', 'tsx']) {
    assert.equal(validateProposal(`\n\x60\x60\x60${language}\n${component}\n\x60\x60\x60\n`), component);
  }
  for (const invalid of [
    `Here is the fix:\n${component}`,
    `\x60\x60\x60jsx\n${component}`,
    `\x60\x60\x60jsx\n${component}\n\x60\x60\x60\nThe issues are fixed.`,
    `\x60\x60\x60jsx\n${component}\n\x60\x60\x60\n\x60\x60\x60jsx\n${component}\n\x60\x60\x60`,
  ]) rejects(invalid, 'INVALID_AI_CODE');
});

test('empty, partial, invalid, TypeScript and oversized output produces actionable validation errors', () => {
  for (const source of [undefined, null, '', '   ', '\x60\x60\x60jsx\n\n\x60\x60\x60', 'export default function Login() { return <form>', 'export default () => <div>', 'export default function Login(): JSX.Element { return <div />; }']) {
    rejects(source, 'INVALID_AI_CODE');
  }
  assert.throws(() => validateProposal('export default () => <div>;'), (error) => /line 1, column/.test(error.message));
  rejects(component, 'INVALID_AI_CODE', { maxCodeBytes: 20 });
  rejects(`export default () => <div>${'é'.repeat(30)}</div>`, 'INVALID_AI_CODE', { maxCodeBytes: 70 });
});

test('default functions, named function exports, arrow bindings and JSX return values are supported', () => {
  for (const source of [
    'export default function () { return <div />; }',
    'function Login() { return <main />; } export default Login;',
    'const Login = () => <form />; export default Login;',
    'const Login = function () { return <div />; }; export default Login;',
    'export default () => <>Hello</>;',
    'export default function Login() { const view = <form />; return view; }',
    'export default function Login() { return true ? <form /> : null; }',
    "import React from 'react'; const colors = { ink: '#202530' }; const styles = { ...colors }; export default function Login() { return <React.Fragment><p style={styles}>Hello</p></React.Fragment>; }",
  ]) assert.equal(validateProposal(source), source);
});

test('the default export must be a real synchronous function component with its own JSX return', () => {
  for (const source of [
    'function Login() { return <div />; }',
    'export default 1;',
    'export default { render: () => <div /> };',
    'export default function Login() { return null; }',
    'export default function Login() {}',
    'export default function Login() { function Unused() { return <div />; } return null; }',
    'export default function Login() { return () => <div />; }',
    'export default async function Login() { return <div />; }',
    'export default function* Login() { return <div />; }',
    'const Login = null; export default Login;',
    'export default function One() { return <div />; } export default function Two() { return <div />; }',
  ]) rejects(source, 'INVALID_AI_CODE');
});

test('unsupported imports, dynamic execution, browser/network/storage capabilities and prototype tricks are rejected', () => {
  for (const source of [
    "import './side-effect.css'; export default () => <div />;",
    "import axios from 'axios'; export default () => <div />;",
    "import fs from 'node:fs'; export default () => <div />;",
    "import 'react'; export default () => <div />;",
    'export default function Login() { fetch("/api/login"); return <div />; }',
    'export default function Login() { window.alert("hello"); return <div />; }',
    'export default function Login() { localStorage.setItem("key", "value"); return <div />; }',
    'export default function Login() { return <div>{process.env.KEY}</div>; }',
    'export default function Login() { eval("code"); return <div />; }',
    'export default function Login() { Function("code")(); return <div />; }',
    'export default function Login() { require("node:fs"); return <div />; }',
    'export default function Login() { import("anything"); return <div />; }',
    'export default function Login() { const object = {}; object.constructor("code")(); return <div />; }',
    'export default function Login() { const object = {}; object["constructor"]("code")(); return <div />; }',
    'export default function Login() { const socket = new WebSocket("ws://example.com"); return <div />; }',
    'export default class Login { render() { return <div />; } }',
  ]) rejects(source, source.startsWith('export default class') ? 'INVALID_AI_CODE' : 'UNSUPPORTED_AI_CODE');
  assert.ok(PROPOSAL_POLICY.forbiddenGlobals.includes('fetch'));
  assert.ok(PROPOSAL_POLICY.forbiddenSyntax.includes('ImportExpression'));
});

test('module-scope side effects are rejected while pure style constants and helpers are supported', () => {
  for (const source of [
    'sideEffect(); export default () => <div />;',
    'const styles = createStyles(); export default () => <div />;',
    'let styles = {}; export default () => <div />;',
    'const styles = unknownValue; export default () => <div />;',
    'const styles = { get color() { return sideEffect(); } }; export default () => <div />;',
    'export const value = 1; export default () => <div />;',
    'while (true) {} export default () => <div />;',
    'const styles = await makeStyles(); export default () => <div />;',
  ]) rejects(source);
  const source = "const base = { color: '#202530', padding: 12 }; const styles = { ...base, marginTop: true ? 8 : 0 }; function prevent(event) { event.preventDefault(); } export default function Login() { return <form style={styles} onSubmit={prevent} />; }";
  assert.equal(validateProposal(source), source);
});

test('unsupported JSX capabilities cannot be smuggled into a displayable proposal', () => {
  for (const body of [
    '<script>script</script>', '<iframe />', '<object />', '<embed />', '<style>{"body { color:red; }"}</style>',
    '<div dangerouslySetInnerHTML={{ __html: "unsafe" }} />', '<iframe srcDoc="unsafe" />',
    '<img src="https://example.com/image.png" />', '<form action="/login" />',
    '<button formAction="/login">Sign in</button>', '<a href="javascript:alert(1)">Link</a>',
    '<a href={destination}>Link</a>', '<button onClick="alert(1)">Click</button>',
  ]) rejects(`export default () => ${body};`);
  assert.equal(validateProposal('export default () => <a href="#content">Skip</a>;'), 'export default () => <a href="#content">Skip</a>;');
});

test('words in harmless strings, object keys and comments do not trigger capability checks', () => {
  const source = "// Do not use window, eval, fetch or localStorage.\nconst text = 'fetch and window are only text'; const labels = { window: 'Email', fetch: 'Password' }; export default function Login() { return <div title={text}><label>{labels.window}</label><p>{labels.fetch}</p></div>; }";
  assert.equal(validateProposal(source), source);
});
