import { fileURLToPath } from 'node:url';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

function integerSetting(value, name, fallback, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function localHttpUrl(value, name, originOnly = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid local HTTP URL.`);
  }

  if (
    url.protocol !== 'http:' || !loopbackHosts.has(url.hostname) ||
    url.username || url.password || url.search || url.hash ||
    (originOnly && url.pathname !== '/')
  ) {
    throw new Error(`${name} must be a local HTTP ${originOnly ? 'origin' : 'URL'} without credentials, query, or fragment.`);
  }
  return url;
}

export const demoPaths = Object.freeze({
  original: fileURLToPath(new URL('../../client/src/demo/OriginalDemo.jsx', import.meta.url)),
  active: fileURLToPath(new URL('../../client/src/demo/ActiveDemo.jsx', import.meta.url)),
});

export function createConfig(env = process.env) {
  const clientOrigin = localHttpUrl(
    env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173', 'CLIENT_ORIGIN', true,
  ).origin;
  const previewUrl = localHttpUrl(
    env.PREVIEW_URL ?? `${clientOrigin}/preview`, 'PREVIEW_URL',
  ).href;

  if (previewUrl !== `${clientOrigin}/preview`) {
    throw new Error('PREVIEW_URL must point to /preview on CLIENT_ORIGIN.');
  }

  const ollamaModel = (env.OLLAMA_MODEL ?? 'qwen2.5-coder:1.5b').trim();
  if (!ollamaModel) {
    throw new Error('OLLAMA_MODEL must not be empty.');
  }

  return Object.freeze({
    host: '127.0.0.1',
    port: integerSetting(env.PORT, 'PORT', 3001, 65535),
    clientOrigin,
    previewUrl,
    ollamaBaseUrl: localHttpUrl(
      env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', 'OLLAMA_BASE_URL', true,
    ).origin,
    ollamaModel,
    ollamaTimeoutMs: integerSetting(env.OLLAMA_TIMEOUT_MS, 'OLLAMA_TIMEOUT_MS', 120000, 600000),
    ollamaMaxResponseBytes: integerSetting(env.OLLAMA_MAX_RESPONSE_BYTES, 'OLLAMA_MAX_RESPONSE_BYTES', 262144, 1048576),
    aiMaxCodeBytes: integerSetting(env.AI_MAX_CODE_BYTES, 'AI_MAX_CODE_BYTES', 65536, 131072),
    scanTimeoutMs: integerSetting(env.SCAN_TIMEOUT_MS, 'SCAN_TIMEOUT_MS', 30000, 120000),
  });
}
