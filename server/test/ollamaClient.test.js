import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfig } from '../src/config.js';
import { createOllamaClient } from '../src/services/ollamaClient.js';
import { REPAIR_PLAN_SCHEMA } from '../src/services/structuredRepair.js';

const messages = [
  { role: 'system', content: 'Return a complete JSX component.' },
  { role: 'user', content: 'The controlled component and actual scan findings.' },
];
const component = 'export default function Demo() { return <main>Proposal</main>; }';
const validPayload = { model: 'qwen2.5-coder:1.5b', message: { role: 'assistant', content: component }, done: true };
const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json' },
});

function client(fetch, overrides = {}) {
  return createOllamaClient({ ...createConfig({}), ...overrides }, { fetch });
}

test('Ollama client sends the real chat contract and returns only actual message content/model', async () => {
  let request;
  const chat = client(async (url, options) => {
    request = { url, options };
    return jsonResponse(validPayload);
  });
  assert.deepEqual(await chat(messages), { content: component, model: validPayload.model });
  assert.equal(String(request.url), 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(request.options.body), {
    model: 'qwen2.5-coder:1.5b', messages, stream: false,
    format: REPAIR_PLAN_SCHEMA,
    options: { temperature: 0.1, num_predict: 4096, num_ctx: 8192 },
  });
});

test('configured local model and origin are used without substituting another coding model', async () => {
  let body;
  let endpoint;
  const chat = client(async (url, options) => {
    endpoint = String(url);
    body = JSON.parse(options.body);
    return jsonResponse({ message: { content: component }, done: true });
  }, { ollamaBaseUrl: 'http://localhost:11435', ollamaModel: 'my-local-coder:custom' });
  assert.deepEqual(await chat(messages), { content: component, model: 'my-local-coder:custom' });
  assert.equal(endpoint, 'http://localhost:11435/api/chat');
  assert.equal(body.model, 'my-local-coder:custom');
});

test('an unavailable Ollama service produces an actionable service error without a fallback', async () => {
  const connectionFailure = new TypeError('fetch failed');
  const chat = client(async () => { throw connectionFailure; });
  await assert.rejects(chat(messages), (error) => (
    error.status === 503 && error.code === 'OLLAMA_UNAVAILABLE' &&
    /ollama serve/.test(error.message) && error.cause === connectionFailure
  ));
});

test('missing-model responses identify the exact requested installation command', async () => {
  for (const [payload, status] of [
    [{ error: 'model qwen2.5-coder:1.5b not found' }, 404],
    [{ error: 'model does not exist' }, 200],
  ]) {
    const chat = client(async () => jsonResponse(payload, status));
    await assert.rejects(chat(messages), (error) => (
      error.status === 503 && error.code === 'OLLAMA_MODEL_NOT_FOUND' &&
      error.message.includes('ollama pull qwen2.5-coder:1.5b')
    ));
  }
});

test('model and HTTP errors are returned as failures with bounded useful details', async () => {
  for (const response of [
    jsonResponse({ error: 'model runner stopped unexpectedly' }, 500),
    jsonResponse({ error: 'input exceeds available context' }),
    new Response('Service unavailable', { status: 503 }),
  ]) {
    const chat = client(async () => response);
    await assert.rejects(chat(messages), (error) => error.status === 502 && error.code === 'OLLAMA_ERROR');
  }
});

test('missing/empty content, malformed JSON and incomplete model responses are rejected', async () => {
  for (const payload of [
    null, [], {}, { message: {} }, { message: { content: '' } },
    { message: { content: '   \n' } }, { message: { content: 42 } },
    { ...validPayload, done: false }, { ...validPayload, done_reason: 'length' },
    { ...validPayload, model: '' },
  ]) {
    await assert.rejects(client(async () => jsonResponse(payload))(messages), (error) => (
      error.status === 502 && error.code === 'OLLAMA_INVALID_RESPONSE'
    ));
  }
  await assert.rejects(client(async () => new Response('{not json'))(messages), (error) => error.code === 'OLLAMA_INVALID_RESPONSE');
});

test('the request deadline bounds an unresponsive service and aborts its request', async () => {
  let requestSignal;
  const chat = client((_url, options) => {
    requestSignal = options.signal;
    return new Promise(() => {});
  }, { ollamaTimeoutMs: 20 });
  await assert.rejects(chat(messages), (error) => error.status === 504 && error.code === 'OLLAMA_TIMEOUT');
  assert.equal(requestSignal.aborted, true);
});

test('the same deadline covers response body reading and cancels a stalled body', async () => {
  let cancelled = false;
  const chat = client(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"message":')); },
    cancel() { cancelled = true; },
  })), { ollamaTimeoutMs: 20 });
  await assert.rejects(chat(messages), (error) => error.status === 504 && error.code === 'OLLAMA_TIMEOUT');
  assert.equal(cancelled, true);
});

test('external cancellation is distinct from a model timeout and pre-abort sends no request', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const chat = client(async () => { calls++; return jsonResponse(validPayload); });
  await assert.rejects(chat(messages, { signal: controller.signal }), (error) => (
    error.status === 409 && error.code === 'GENERATION_CANCELLED'
  ));
  assert.equal(calls, 0);
});

test('response limits reject a declared oversized body before parsing it', async () => {
  const chat = client(async () => new Response('Too large', { headers: { 'Content-Length': '101' } }), {
    ollamaMaxResponseBytes: 100,
  });
  await assert.rejects(chat(messages), (error) => error.status === 502 && error.code === 'MODEL_RESPONSE_TOO_LARGE');
});

test('streamed response limits count bytes across chunks without trusting Content-Length', async () => {
  let cancelled = false;
  const chat = client(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(60));
      controller.enqueue(new Uint8Array(60));
    },
    cancel() { cancelled = true; },
  })), { ollamaMaxResponseBytes: 100 });
  await assert.rejects(chat(messages), (error) => error.code === 'MODEL_RESPONSE_TOO_LARGE');
  assert.equal(cancelled, true);
});

test('code size limits count UTF-8 bytes rather than JavaScript character count', async () => {
  const chat = client(async () => jsonResponse({ ...validPayload, message: { content: '😀'.repeat(30) } }), {
    aiMaxCodeBytes: 100,
  });
  await assert.rejects(chat(messages), (error) => error.code === 'MODEL_RESPONSE_TOO_LARGE');
});

test('interrupted bodies produce service errors and invalid UTF-8 remains an invalid response', async () => {
  const interrupted = client(async () => new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError('Connection interrupted')); },
  })));
  await assert.rejects(interrupted(messages), (error) => error.status === 502 && error.code === 'OLLAMA_ERROR');
  const invalidUtf8 = client(async () => new Response(new Uint8Array([0xff, 0xff])));
  await assert.rejects(invalidUtf8(messages), (error) => error.code === 'OLLAMA_INVALID_RESPONSE');
});
