/**
 * Performance JSON, version 1.
 *
 * {
 *   "version": 1,
 *   "title": "Hamlet — Act 3, Scene 1",
 *   "source": "William Shakespeare (public domain)",
 *   "locale": "en",
 *   "characters": [{
 *     "id": "hamlet",
 *     "name": "Hamlet",
 *     "aliases": ["Prince"],
 *     "color": "#3b5b8c",
 *     "costume": "prince",
 *     "voice": { "lang": "en-GB", "pitch": 0.84, "rate": 0.9 }
 *   }],
 *   "marks": { "cs": [0,0,0.45], "dl": [-2.35,0,-1.15], "...": [], "audience": "audience" },
 *   "scenes": [{
 *     "id": "act-3-scene-1",
 *     "name": "Act 3, Scene 1",
 *     "beats": [{
 *       "id": "b1",
 *       "kind": "speech",          // "speech" | "action" | "pause"
 *       "speaker": "hamlet",       // character id, or null for a pure pause
 *       "line": "To be, or not to be, that is the question:",
 *       "lineZh": "……",            // optional; bundled samples only
 *       "emotion": "contemplative",
 *       "gesture": "handsOnChest",
 *       "moveTo": "cs",            // mark id, or null to stay
 *       "lookAt": "audience",      // "audience" | "aside" | character id | mark id
 *       "enterFrom": null,         // "left" | "right" | null
 *       "exitTo": null,            // "left" | "right" | null
 *       "pauseMs": 400             // hold after the line (or the whole beat, if silent)
 *     }]
 *   }],
 *   "warnings": []
 * }
 *
 * Mark coordinates are in stage space: x right, y up from the stage floor, z upstage.
 * The runtime lifts actors onto the raised stage. "audience" is not a point;
 * the director resolves it to a seat in the house.
 */

import { MARKS } from '../stage/layout.js';
import { EMOTIONS, GESTURES, isEmotion, isGesture } from '../parse/lexicon.js';

export { EMOTIONS, GESTURES };

const COSTUMES = new Set(['prince', 'maiden', 'king', 'queen', 'ghost', 'courtier', 'traveler', 'visitor']);

export function defaultMarks() {
  const marks = {};
  for (const [k, v] of Object.entries(MARKS)) marks[k] = [v[0], v[1], v[2]];
  marks.audience = 'audience';
  return marks;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function slugId(value, fallback) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || fallback;
}

/**
 * Fill defaults, coerce enums, and collect warnings.
 * Never throws on messy input — a partial object still becomes a playable performance.
 */
export function normalizePerformance(raw, extraWarnings = []) {
  const warnings = [];
  const pushWarn = (w) => {
    if (w && !warnings.includes(w)) warnings.push(w);
  };
  for (const w of extraWarnings) pushWarn(w);
  if (raw && Array.isArray(raw.warnings)) {
    for (const w of raw.warnings) pushWarn(String(w));
  }

  const src = raw && typeof raw === 'object' ? raw : {};
  const characters = [];
  const seen = new Set();
  const list = Array.isArray(src.characters) ? src.characters : [];
  list.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const id = slugId(c.id || c.name, `actor-${i + 1}`);
    if (seen.has(id)) return;
    seen.add(id);
    const voiceIn = c.voice || {};
    const costume = COSTUMES.has(c.costume) ? c.costume : 'courtier';
    if (c.costume && !COSTUMES.has(c.costume)) pushWarn(`unknown-costume:${c.costume}`);
    characters.push({
      id,
      name: String(c.name || id),
      aliases: Array.isArray(c.aliases) ? c.aliases.map(String) : [],
      color: typeof c.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.color) ? c.color : '#7a5a3a',
      costume,
      skin: typeof c.skin === 'string' ? c.skin : '#e0b394',
      hair: typeof c.hair === 'string' ? c.hair : '#2c241c',
      voice: {
        lang: typeof voiceIn.lang === 'string' ? voiceIn.lang : 'en-GB',
        pitch: Math.min(2, Math.max(0.3, num(voiceIn.pitch, 1))),
        rate: Math.min(1.6, Math.max(0.6, num(voiceIn.rate, 1))),
      },
    });
  });

  const scenesIn = Array.isArray(src.scenes) ? src.scenes : [];
  const scenes = [];
  let beatCounter = 0;
  scenesIn.forEach((scene, sIndex) => {
    if (!scene || typeof scene !== 'object') return;
    const beatsIn = Array.isArray(scene.beats) ? scene.beats : [];
    const beats = [];
    beatsIn.forEach((b) => {
      if (!b || typeof b !== 'object') return;
      beatCounter += 1;
      const line = b.line == null ? '' : String(b.line);
      let emotion = b.emotion == null || b.emotion === '' ? 'neutral' : String(b.emotion);
      if (!isEmotion(emotion)) {
        pushWarn(`unknown-emotion:${emotion}`);
        emotion = 'neutral';
      }
      let gesture = b.gesture == null || b.gesture === '' ? (line ? 'talk' : 'idle') : String(gestureName(b.gesture));
      if (!isGesture(gesture)) {
        pushWarn(`unknown-gesture:${b.gesture}`);
        gesture = line ? 'talk' : 'idle';
      }
      let moveTo = b.moveTo == null || b.moveTo === '' ? null : String(b.moveTo);
      if (moveTo && !MARKS[moveTo]) {
        pushWarn(`unknown-mark:${moveTo}`);
        moveTo = null;
      }
      const enterFrom = normalizeWing(b.enterFrom);
      const exitTo = normalizeWing(b.exitTo);
      const lookAt = b.lookAt == null || b.lookAt === '' ? null : String(b.lookAt);
      const speaker = b.speaker == null || b.speaker === '' ? null : slugId(b.speaker, null);
      let kind = b.kind;
      if (kind !== 'speech' && kind !== 'action' && kind !== 'pause') {
        kind = line ? 'speech' : speaker ? 'action' : 'pause';
      }
      const beat = {
        id: b.id ? String(b.id) : `b${beatCounter}`,
        kind,
        speaker,
        line,
        emotion,
        gesture,
        moveTo,
        lookAt,
        enterFrom,
        exitTo,
        pauseMs: Math.max(0, Math.min(8000, num(b.pauseMs, line ? 380 : 220))),
      };
      if (typeof b.lineZh === 'string' && b.lineZh.trim()) beat.lineZh = b.lineZh.trim();
      beats.push(beat);
    });
    scenes.push({
      id: slugId(scene.id || scene.name, `scene-${sIndex + 1}`),
      name: String(scene.name || `Scene ${sIndex + 1}`),
      beats,
    });
  });

  if (!scenes.length) {
    scenes.push({ id: 'scene-1', name: 'Scene', beats: [] });
    pushWarn('empty-performance');
  }

  const marks = defaultMarks();
  if (src.marks && typeof src.marks === 'object') {
    for (const key of Object.keys(MARKS)) {
      const v = src.marks[key];
      if (Array.isArray(v) && v.length >= 3 && v.every((n) => Number.isFinite(Number(n)))) {
        marks[key] = [Number(v[0]), Number(v[1]), Number(v[2])];
      }
    }
    if (src.marks.audience) marks.audience = 'audience';
  }

  return {
    version: 1,
    title: String(src.title || 'Untitled'),
    source: String(src.source || ''),
    note: typeof src.note === 'string' ? src.note : '',
    locale: src.locale === 'zh' ? 'zh' : 'en',
    characters,
    marks,
    scenes,
    warnings,
  };
}

function gestureName(value) {
  const aliases = {
    handsonchest: 'handsOnChest',
    hands_on_chest: 'handsOnChest',
    raisearm: 'raiseArm',
    raise_arm: 'raiseArm',
    turnaway: 'turnAway',
    turn_away: 'turnAway',
    drawsord: 'drawSword',
    drawsword: 'drawSword',
    draw_sword: 'drawSword',
    shakehead: 'shakeHead',
    shake_head: 'shakeHead',
  };
  const raw = String(value || '').trim();
  const compact = raw.replace(/[\s_-]+/g, '').toLowerCase();
  return aliases[compact] || aliases[raw.toLowerCase()] || raw;
}

function normalizeWing(value) {
  if (value == null || value === '' || value === 'null') return null;
  const s = String(value).toLowerCase();
  if (s === 'left' || s === 'l' || s === 'sl' || s === 'wingl') return 'left';
  if (s === 'right' || s === 'r' || s === 'sr' || s === 'wingr') return 'right';
  return null;
}

export function flattenBeats(performance) {
  const list = [];
  (performance.scenes || []).forEach((scene, sceneIndex) => {
    (scene.beats || []).forEach((beat, beatInScene) => {
      list.push({
        ...beat,
        sceneId: scene.id,
        sceneName: scene.name,
        sceneIndex,
        beatInScene,
      });
    });
  });
  return list;
}

export function performanceToJson(performance) {
  return JSON.stringify(performance, null, 2);
}
