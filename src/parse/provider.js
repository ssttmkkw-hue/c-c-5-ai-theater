import { AIParser } from './aiParser.js';
import { looksLikePremise, streamPremise } from './premise.js';
import { RuleParser, parseScript, streamScript } from './ruleParser.js';
import { eventsToPerformance, ndjsonToEvents, performanceToEvents } from '../performance/stream.js';
import { normalizePerformance } from '../performance/schema.js';

/**
 * Pluggable parser. `mode` is "rule" or "ai".
 * If AI is selected and no backend is configured, we keep a friendly warning
 * and fall back to the rule parser so the rehearsal can still start.
 *
 * parse() returns a full Performance.
 * parseStream() emits NDJSON-style events and resolves to the same shape.
 * onEvent may be a function, or `{ onEvent, ...options }`.
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
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return normalizePerformance(input);
    }
    const text = String(input || '');
    const direct = this.parseDocument(text);
    if (direct) return direct.performance;
    return this.parseText(text, options);
  }

  /**
   * @param {string|object} input
   * @param {Function|{ onEvent?: Function }} [onEventOrOpts]
   * @param {object} [maybeOpts]
   */
  async parseStream(input, onEventOrOpts, maybeOpts) {
    const { onEvent, options } = splitStreamArgs(onEventOrOpts, maybeOpts);
    this.lastNotice = null;
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return this.emitPerformance(normalizePerformance(input), onEvent);
    }
    const text = String(input || '');
    const direct = this.parseDocument(text);
    if (direct?.kind === 'ndjson') {
      let yielded = false;
      for (const ev of direct.events) {
        onEvent(ev);
        if (!yielded && ev.type === 'beat') {
          yielded = true;
          await Promise.resolve();
        }
      }
      return eventsToPerformance(direct.events);
    }
    if (direct?.kind === 'performance') {
      return this.emitPerformance(direct.performance, onEvent);
    }
    const trimmed = text.trim();
    if (!trimmed) {
      onEvent({ type: 'warning', message: 'empty-performance' });
      onEvent({ type: 'end' });
      return normalizePerformance({ title: 'Untitled', scenes: [] });
    }
    if (options.allowPremise !== false && looksLikePremise(trimmed)) {
      return streamPremise(trimmed, onEvent, options);
    }
    if (this.mode === 'ai') {
      if (!this.ai.endpoint) {
        this.lastNotice = 'ai-fallback-no-backend';
        onEvent({ type: 'warning', message: 'ai-fallback-no-backend' });
      } else {
        const collected = [];
        const wrapped = (ev) => {
          collected.push(ev);
          onEvent(ev);
        };
        try {
          await this.ai.parseStream(trimmed, wrapped);
          return eventsToPerformance(collected);
        } catch {
          this.lastNotice = 'ai-fallback-error';
          onEvent({ type: 'warning', message: 'ai-fallback-error' });
        }
      }
    }
    const perf = await streamScript(trimmed, onEvent, options);
    if (this.lastNotice && !(perf.warnings || []).includes(this.lastNotice)) {
      perf.warnings = [this.lastNotice, ...(perf.warnings || [])];
    }
    return perf;
  }

  async emitPerformance(perf, onEvent) {
    let yielded = false;
    for (const ev of performanceToEvents(perf)) {
      onEvent(ev);
      if (!yielded && ev.type === 'beat') {
        yielded = true;
        await Promise.resolve();
      }
    }
    return perf;
  }

  /**
   * Performance JSON, or an NDJSON event stream. Null if it should be read as a script.
   */
  parseDocument(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed.startsWith('{')) return null;
    const firstLine = trimmed.split('\n')[0].trim();
    if (firstLine.endsWith('}') && /"type"\s*:/.test(firstLine)) {
      try {
        return { kind: 'ndjson', events: ndjsonToEvents(trimmed) };
      } catch {
        const perf = parseScript(text);
        perf.warnings = ['json-invalid', ...(perf.warnings || [])];
        this.lastNotice = 'json-invalid';
        return { kind: 'performance', performance: perf };
      }
    }
    try {
      const json = JSON.parse(trimmed);
      if (json && Array.isArray(json.events)) return { kind: 'ndjson', events: json.events };
      if (json && (Array.isArray(json.scenes) || Array.isArray(json.beats))) {
        const asPerf = Array.isArray(json.beats)
          ? { ...json, scenes: [{ id: 'scene-1', name: json.title || 'Scene', beats: json.beats }] }
          : json;
        return { kind: 'performance', performance: normalizePerformance(asPerf) };
      }
    } catch {
      const perf = parseScript(text);
      perf.warnings = ['json-invalid', ...(perf.warnings || [])];
      this.lastNotice = 'json-invalid';
      return { kind: 'performance', performance: perf };
    }
    return null;
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

function splitStreamArgs(onEventOrOpts, maybeOpts) {
  if (typeof onEventOrOpts === 'function') {
    return { onEvent: onEventOrOpts, options: maybeOpts || {} };
  }
  const opts = onEventOrOpts && typeof onEventOrOpts === 'object' ? onEventOrOpts : {};
  const options = { ...opts, ...(maybeOpts || {}) };
  delete options.onEvent;
  return { onEvent: typeof opts.onEvent === 'function' ? opts.onEvent : () => {}, options };
}

export function createParserProvider() {
  return new ParserProvider();
}
