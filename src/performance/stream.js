/**
 * Stream form of a Performance.
 *
 * The full Performance JSON (version 1) stays the save/load/export document.
 * A live parse speaks a smaller event protocol, one JSON object per line (NDJSON)
 * or as a list of the same objects. Playback can start on the first beat.
 *
 * Events
 *   { "type": "meta", "title", "source?", "locale?", "note?", "characters"? }
 *   { "type": "character", "id", "name", "costume?", "color?", "voice?", ... }
 *   { "type": "beat", "sceneId", "sceneName?", ...beat fields }
 *   { "type": "scene-end", "sceneId" }
 *   { "type": "end" }
 *   { "type": "warning", "message" }
 *
 * Beat fields use the same names as Performance JSON (`speaker`, `line`,
 * `emotion`, `gesture`, `moveTo`, `lookAt`, `enterFrom`, `exitTo`, `pauseMs`,
 * `kind`, `lineZh`). Short aliases are accepted on the way in:
 *   sid sceneId, sp speaker, ln line, zh lineZh, em emotion, g gesture,
 *   mv moveTo, lk lookAt, en enterFrom, ex exitTo, p pauseMs, k kind
 *
 * A later `meta` updates the title. A later `character` may arrive before
 * that actor's first entrance. `end` means no further beats are expected.
 */

import { defaultMarks, normalizePerformance } from './schema.js';

const BEAT_ALIASES = {
  sid: 'sceneId',
  sp: 'speaker',
  ln: 'line',
  zh: 'lineZh',
  em: 'emotion',
  g: 'gesture',
  mv: 'moveTo',
  lk: 'lookAt',
  en: 'enterFrom',
  ex: 'exitTo',
  p: 'pauseMs',
  k: 'kind',
};

function slugId(value, fallback) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || fallback;
}

export function expandEvent(event) {
  if (!event || typeof event !== 'object') return { type: 'warning', message: 'bad-event' };
  if (event.type !== 'beat') return event;
  const beat = { ...event };
  for (const [short, long] of Object.entries(BEAT_ALIASES)) {
    if ((beat[long] == null || beat[long] === '') && beat[short] != null && beat[short] !== '') {
      beat[long] = beat[short];
    }
  }
  return beat;
}

function addWarning(performance, message) {
  if (!message) return;
  if (!Array.isArray(performance.warnings)) performance.warnings = [];
  if (!performance.warnings.includes(message)) performance.warnings.push(message);
}

function coerceCharacter(raw, index) {
  const perf = normalizePerformance({
    title: 't',
    characters: [raw || {}],
    scenes: [{
      id: 's',
      name: 's',
      beats: [{ speaker: (raw && (raw.id || raw.name)) || `actor-${index + 1}`, line: 'x' }],
    }],
  });
  return perf.characters[0] || null;
}

/**
 * Append one beat to a performance that may still be growing.
 * `raw.sceneId` (or `sid`) chooses the scene; a new id starts a scene.
 * Returns the normalized beat stored on the performance.
 */
export function appendBeat(performance, raw) {
  if (!performance || typeof performance !== 'object') {
    throw new TypeError('appendBeat expects a performance object');
  }
  const expanded = expandEvent({ type: 'beat', ...(raw || {}) });
  const sceneId = slugId(expanded.sceneId, performance.scenes?.at?.(-1)?.id || 'scene-1');
  if (!Array.isArray(performance.scenes)) performance.scenes = [];
  let scene = performance.scenes.find((s) => s.id === sceneId);
  if (!scene) {
    scene = {
      id: sceneId,
      name: String(expanded.sceneName || expanded.scene || 'Scene'),
      beats: [],
    };
    performance.scenes.push(scene);
  } else if (expanded.sceneName && (!scene.name || scene.name === scene.id)) {
    scene.name = String(expanded.sceneName);
  }
  const draft = normalizePerformance({
    title: performance.title || 'Untitled',
    characters: performance.characters || [],
    scenes: [{ id: scene.id, name: scene.name, beats: [...scene.beats, expanded] }],
  });
  const beat = draft.scenes[0]?.beats?.at(-1);
  if (!beat) return null;
  scene.beats.push(beat);
  for (const w of draft.warnings || []) {
    if (w !== 'empty-performance') addWarning(performance, w);
  }
  return beat;
}

export function createAssembler() {
  const perf = {
    version: 1,
    title: 'Untitled',
    source: '',
    note: '',
    locale: 'en',
    characters: [],
    marks: defaultMarks(),
    scenes: [],
    warnings: [],
  };
  let ended = false;

  function addCharacter(raw) {
    const index = perf.characters.length;
    const character = coerceCharacter(raw, index);
    if (!character) return null;
    const existing = perf.characters.find((c) => c.id === character.id);
    if (existing) return existing;
    perf.characters.push(character);
    return character;
  }

  return {
    get ended() {
      return ended;
    },
    push(event) {
      const ev = expandEvent(event);
      switch (ev.type) {
        case 'meta':
          if (ev.title) perf.title = String(ev.title);
          if (typeof ev.source === 'string') perf.source = ev.source;
          if (typeof ev.note === 'string') perf.note = ev.note;
          if (ev.locale === 'zh' || ev.locale === 'en') perf.locale = ev.locale;
          if (Array.isArray(ev.characters)) {
            for (const c of ev.characters) addCharacter(c);
          }
          break;
        case 'character':
          addCharacter(ev);
          break;
        case 'beat':
          appendBeat(perf, ev);
          break;
        case 'scene-end':
          break;
        case 'end':
          ended = true;
          break;
        case 'warning':
          addWarning(perf, String(ev.message || ev.msg || ''));
          break;
        default:
          if (ev && ev.type) addWarning(perf, `unknown-event:${ev.type}`);
          break;
      }
    },
    performance() {
      return normalizePerformance(perf);
    },
  };
}

export function eventsToPerformance(events) {
  const asm = createAssembler();
  for (const ev of events || []) asm.push(ev);
  return asm.performance();
}

export function performanceToEvents(performance) {
  const perf = performance || {};
  const events = [{
    type: 'meta',
    title: perf.title || 'Untitled',
    source: perf.source || '',
    locale: perf.locale === 'zh' ? 'zh' : 'en',
    note: perf.note || '',
    characters: Array.isArray(perf.characters) ? perf.characters.map((c) => ({ ...c })) : [],
  }];
  for (const scene of perf.scenes || []) {
    for (const beat of scene.beats || []) {
      events.push({
        type: 'beat',
        sceneId: scene.id,
        sceneName: scene.name,
        ...beat,
      });
    }
    events.push({ type: 'scene-end', sceneId: scene.id });
  }
  for (const message of perf.warnings || []) {
    events.push({ type: 'warning', message: String(message) });
  }
  events.push({ type: 'end' });
  return events;
}

export function eventsToNdjson(events) {
  return (events || []).map((ev) => JSON.stringify(ev)).join('\n') + '\n';
}

export function ndjsonToEvents(text) {
  const events = [];
  for (const line of String(text || '').split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(JSON.parse(trimmed));
  }
  return events;
}
