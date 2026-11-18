import { AIParser } from './aiParser.js';
import { RuleParser, parseScript } from './ruleParser.js';
import { normalizePerformance } from '../performance/schema.js';

/**
 * Pluggable parser. `mode` is "rule" or "ai".
 * If AI is selected and no backend is configured, we keep a friendly warning
 * and fall back to the rule parser so the rehearsal can still start.
 */
export class ParserProvider {
  constructor() {
    this.mode = 'rule';
    this.rule = new RuleParser();
    this.ai = new AIParser({ endpoint: null });
    this.lastNotice = null;
  }

  setMode(mode) {
    this.mode = mode === 'ai' ? 'ai' : 'rule';
  }

  /**
   * Accept either raw script text or a Performance JSON string/object.
   * Always resolves to a normalized Performance.
   */
  async parse(input, options = {}) {
    this.lastNotice = null;
    if (input && typeof input === 'object') {
      return normalizePerformance(input);
    }
    const text = String(input || '');
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      try {
        const json = JSON.parse(trimmed);
        if (json && (Array.isArray(json.scenes) || Array.isArray(json.beats))) {
          const asPerf = Array.isArray(json.beats)
            ? { ...json, scenes: [{ id: 'scene-1', name: json.title || 'Scene', beats: json.beats }] }
            : json;
          return normalizePerformance(asPerf);
        }
      } catch {
        const perf = this.parseText(text, options);
        perf.warnings = [`json-invalid`, ...(perf.warnings || [])];
        this.lastNotice = 'json-invalid';
        return perf;
      }
    }
    return this.parseText(text, options);
  }

  async parseText(text, options = {}) {
    if (this.mode === 'ai') {
      try {
        const raw = await this.ai.parse(text);
        const perf = normalizePerformance(raw);
        perf.warnings = perf.warnings || [];
        return perf;
      } catch (error) {
        const code = error?.code === 'NO_BACKEND' ? 'ai-fallback-no-backend' : 'ai-fallback-error';
        this.lastNotice = code;
        const perf = parseScript(text, options);
        perf.warnings = [code, ...(perf.warnings || [])];
        return perf;
      }
    }
    return parseScript(text, options);
  }
}

export function createParserProvider() {
  return new ParserProvider();
}
