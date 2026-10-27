import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfig } from '../src/config.js';

test('configuration restricts the preview to the configured local client', () => {
  for (const previewUrl of [
    'https://example.com/preview',
    'http://127.0.0.1:5173/other',
    'http://127.0.0.1:9999/preview',
    'http://127.0.0.1:5173/preview?url=https://example.com',
    'http://user:password@127.0.0.1:5173/preview',
  ]) {
    assert.throws(() => createConfig({ PREVIEW_URL: previewUrl }), /PREVIEW_URL/);
  }

  const config = createConfig({ CLIENT_ORIGIN: 'http://localhost:5180' });
  assert.equal(config.previewUrl, 'http://localhost:5180/preview');
});

test('configuration rejects remote services and invalid numeric settings', () => {
  for (const env of [
    { CLIENT_ORIGIN: 'http://example.com' },
    { OLLAMA_BASE_URL: 'http://example.com:11434' },
    { OLLAMA_BASE_URL: 'http://127.0.0.1:11434/api/generate' },
    { PORT: '0' },
    { PORT: '65536' },
    { PORT: '3001.5' },
    { SCAN_TIMEOUT_MS: '-1' },
    { OLLAMA_TIMEOUT_MS: 'forever' },
    { OLLAMA_MAX_RESPONSE_BYTES: '0' },
    { OLLAMA_MAX_RESPONSE_BYTES: '1048577' },
    { AI_MAX_CODE_BYTES: '-1' },
    { AI_MAX_CODE_BYTES: '131073' },
    { OLLAMA_MODEL: ' ' },
  ]) {
    assert.throws(() => createConfig(env));
  }
});

test('AI settings default to the requested local model with bounded response limits', () => {
  const config = createConfig({});
  assert.equal(config.ollamaBaseUrl, 'http://127.0.0.1:11434');
  assert.equal(config.ollamaModel, 'qwen2.5-coder:1.5b');
  assert.equal(config.ollamaMaxResponseBytes, 262144);
  assert.equal(config.aiMaxCodeBytes, 65536);
  assert.equal(createConfig({ OLLAMA_TIMEOUT_MS: '600000' }).ollamaTimeoutMs, 600000);
});
