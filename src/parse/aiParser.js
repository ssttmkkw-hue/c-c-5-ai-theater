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
}
