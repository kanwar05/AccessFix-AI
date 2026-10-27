import { ScanError } from '../errors.js';

function invalidResponse(message, cause) {
  return new ScanError(502, 'OLLAMA_INVALID_RESPONSE', message, cause ? { cause } : undefined);
}

async function readLimitedBody(response, maximumBytes, signal) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    void response.body?.cancel().catch(() => {});
    throw new ScanError(502, 'MODEL_RESPONSE_TOO_LARGE', 'Ollama returned more data than this prototype permits. Try generating a more focused proposal.');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const cancelReading = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancelReading, { once: true });
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        void reader.cancel().catch(() => {});
        throw new ScanError(502, 'MODEL_RESPONSE_TOO_LARGE', 'Ollama returned more data than this prototype permits. Try generating a more focused proposal.');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancelReading);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw invalidResponse('Ollama returned an unreadable response. Try generating again.', error);
  }
}

export function createOllamaClient(config, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const endpoint = new URL('/api/chat', config.ollamaBaseUrl);
  const maximumResponseBytes = config.ollamaMaxResponseBytes ?? 262144;
  const maximumCodeBytes = config.aiMaxCodeBytes ?? 65536;

  return async function chat(messages, { signal } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    let receivedResponse = false;
    let rejectOnAbort;
    const forwardAbort = () => controller.abort(signal?.reason);
    const abortError = () => timedOut
      ? new ScanError(504, 'OLLAMA_TIMEOUT', 'The local model took too long to respond. Retry or increase OLLAMA_TIMEOUT_MS for this machine.')
      : new ScanError(409, 'GENERATION_CANCELLED', 'The generation request was cancelled. Run a new scan before requesting another proposal.');
    const aborted = new Promise((_, reject) => {
      rejectOnAbort = () => reject(abortError());
      controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.ollamaTimeoutMs);
    signal?.addEventListener('abort', forwardAbort, { once: true });
    if (signal?.aborted) forwardAbort();

    async function request() {
      if (controller.signal.aborted) throw abortError();
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
        body: JSON.stringify({
          model: config.ollamaModel,
          messages,
          stream: false,
          options: { temperature: 0.1, num_predict: 4096, num_ctx: 8192 },
        }),
      });
      receivedResponse = true;
      const text = await readLimitedBody(response, maximumResponseBytes, controller.signal);
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (error) {
        if (response.ok) throw invalidResponse('Ollama did not return valid JSON. Check the local service and retry.', error);
      }

      const detail = typeof payload?.error === 'string' ? payload.error.trim().slice(0, 400) : '';
      if (response.status === 404 || /model.*(?:not found|does not exist)/i.test(detail)) {
        throw new ScanError(503, 'OLLAMA_MODEL_NOT_FOUND', `The configured model ${config.ollamaModel} is not installed. Run ollama pull ${config.ollamaModel}, then retry.`);
      }
      if (!response.ok || detail) {
        throw new ScanError(502, 'OLLAMA_ERROR', `Ollama could not generate a proposal: ${detail || `HTTP ${response.status}`}.`);
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw invalidResponse('Ollama returned an unexpected response. Try generating again.');
      }
      if (payload.done === false || payload.done_reason === 'length') {
        throw invalidResponse('The model response was incomplete or reached its output limit. Try generating again.');
      }
      const content = payload.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw invalidResponse('Ollama returned no component code. Try generating again.');
      }
      if (Buffer.byteLength(content, 'utf8') > maximumCodeBytes) {
        throw new ScanError(502, 'MODEL_RESPONSE_TOO_LARGE', 'The generated component exceeds the permitted code size. Try a more focused proposal.');
      }
      if (payload.model !== undefined && (typeof payload.model !== 'string' || !payload.model.trim())) {
        throw invalidResponse('Ollama returned an invalid model identifier. Check the local service and retry.');
      }
      return { content, model: payload.model || config.ollamaModel };
    }

    try {
      return await Promise.race([request(), aborted]);
    } catch (error) {
      if (error instanceof ScanError) throw error;
      if (controller.signal.aborted) throw abortError();
      throw new ScanError(
        receivedResponse ? 502 : 503,
        receivedResponse ? 'OLLAMA_ERROR' : 'OLLAMA_UNAVAILABLE',
        receivedResponse
          ? 'The connection to Ollama was interrupted while reading its response. Check the service and retry.'
          : 'Could not reach local Ollama. Start the Ollama application or run ollama serve, then retry.',
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
      controller.signal.removeEventListener('abort', rejectOnAbort);
      controller.abort();
    }
  };
}
