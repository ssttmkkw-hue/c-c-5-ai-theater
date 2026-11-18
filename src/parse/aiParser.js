/**
 * Placeholder for a later server-side model parser.
 *
 * The browser build must not contain an API key and must not call a paid API.
 * A backend (see tools/parse-with-claude.mjs) would accept:
 *
 *   POST {endpoint}
 *   { "script": "<play text>", "format": "ai-theater-performance-v1" }
 *
 * and return the same Performance JSON the rule parser produces
 * (version, title, characters, marks, scenes[].beats[]).
 *
 * A streaming backend would accept the same POST with
 * `"format": "ai-theater-stream-v1"` and answer with NDJSON or SSE
 * (`application/x-ndjson` or `text/event-stream`), one event per line:
 * meta, character, beat, scene-end, warning, end.
 * The key stays on that server. This class only forwards to an explicitly
 * configured same-origin or user-supplied endpoint, and otherwise refuses.
 */
export class AIParser {
  /**
   * @param {{ endpoint?: string|null }} [options]
   * endpoint is a URL with no credentials. Leave unset in v1.
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint || null;
  }

  async parse(scriptText) {
    if (!this.endpoint) {
      const error = new Error('AI parser has no backend configured');
      error.code = 'NO_BACKEND';
      throw error;
    }
    let response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: String(scriptText || ''),
          format: 'ai-theater-performance-v1',
        }),
      });
    } catch (cause) {
      const error = new Error('AI parser endpoint unreachable');
      error.code = 'AI_UNREACHABLE';
      error.cause = cause;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`AI parser HTTP ${response.status}`);
      error.code = 'AI_HTTP';
      throw error;
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || !Array.isArray(data.scenes)) {
      const error = new Error('AI parser returned an unexpected payload');
      error.code = 'AI_BAD_PAYLOAD';
      throw error;
    }
    return data;
  }

  /**
   * Streaming counterpart. With no endpoint this rejects immediately
   * (code NO_BACKEND) so the caller can fall back without hanging.
   * A configured endpoint may return NDJSON, SSE, `{ events: [] }`, or
   * one Performance JSON document, which is expanded into events.
   * @param {string} scriptText
   * @param {(event: object) => void} onEvent
   */
  async parseStream(scriptText, onEvent) {
    if (!this.endpoint) {
      const error = new Error('AI parser has no backend configured');
      error.code = 'NO_BACKEND';
      throw error;
    }
    const emit = typeof onEvent === 'function' ? onEvent : () => {};
    let response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson, text/event-stream, application/json',
        },
        body: JSON.stringify({
          script: String(scriptText || ''),
          format: 'ai-theater-stream-v1',
        }),
      });
    } catch (cause) {
      const error = new Error('AI parser endpoint unreachable');
      error.code = 'AI_UNREACHABLE';
      error.cause = cause;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`AI parser HTTP ${response.status}`);
      error.code = 'AI_HTTP';
      throw error;
    }
    const ctype = (response.headers.get('content-type') || '').toLowerCase();
    if (/ndjson|jsonl|event-stream|x-ndjson/.test(ctype) && response.body?.getReader) {
      await readEventStream(response.body, emit);
      return;
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      for (const ev of data) emit(ev);
      return;
    }
    if (data && Array.isArray(data.events)) {
      for (const ev of data.events) emit(ev);
      return;
    }
    const { performanceToEvents } = await import('../performance/stream.js');
    for (const ev of performanceToEvents(data)) emit(ev);
  }
}

async function readEventStream(body, emit) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf('\n');
      if (!line || line.startsWith(':')) continue;
      const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
      if (!payload || payload === '[DONE]') continue;
      try {
        emit(JSON.parse(payload));
      } catch {
        emit({ type: 'warning', message: 'bad-event' });
      }
    }
  }
}
