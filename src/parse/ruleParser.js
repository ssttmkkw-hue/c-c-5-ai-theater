/**
 * Offline rule parser. Script text in, Performance JSON out.
 * No network. Unknown roles are invented; unknown directions are warned about.
 */

import { normalizePerformance } from '../performance/schema.js';
import { defaultMarks } from '../performance/schema.js';
import {
  emotionFromText,
  gestureForEmotion,
  gestureFromText,
  splitSpeech,
  wordCount,
} from './lexicon.js';
import { PALETTE, PRESETS, costumeForIndex } from './presets.js';
import { hashString } from '../util/math.js';

/** Words that often start a sentence ("Alas.", "Speak.") and must not become roles. */
const CUE_STOP = new Set([
  'speak', 'mark', 'list', 'alas', 'remember', 'soft', 'get', 'go', 'come', 'look', 'hear',
  'hark', 'see', 'pity', 'haste', 'murder', 'revenge', 'farewell', 'adieu', 'ay', 'ha', 'let',
  'stay', 'hold', 'peace', 'well', 'now', 'then', 'there', 'here', 'sir', 'madam', 'good',
  'indeed', 'never', 'nay', 'o', 'oh', 'ah', 'what', 'where', 'why', 'who', 'when', 'if',
  'or', 'to', 'my', 'no', 'yes', 'but', 'and', 'the',
]);

const NOT_NAMES = new Set([
  'no', 'yes', 'oh', 'ah', 'o', 'ha', 'ay', 'lo', 'go', 'if', 'it', 'we', 'he', 'my', 'me',
  'do', 'am', 'an', 'as', 'at', 'be', 'or', 'so', 'to', 'up', 'in', 'on', 'of', 'act', 'scene',
  'enter', 'exit', 'exeunt', 'aside', 're', 'the', 'and', 'but', 'for', 'nor', 'yet',
]);

function normalizeSource(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '—');
}

export function slugId(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'actor';
}

function titleCaseName(name) {
  const clean = name.replace(/\s+/g, ' ').trim();
  const letters = clean.replace(/[^A-Za-z]/g, '');
  if (letters && letters === letters.toUpperCase()) {
    return clean.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  }
  return clean;
}

function looksLikeName(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  if (name.length > 36) return false;
  if (NOT_NAMES.has(words[0].toLowerCase().replace(/[^a-z]/g, ''))) return false;
  const allCaps = words.every((w) => /[A-Z]/.test(w) && w === w.toUpperCase());
  const title = words.every((w) => /^[A-Z][a-z'’.\-]*$/.test(w));
  if (!(allCaps || title)) return false;
  const key = words[0].toLowerCase().replace(/[^a-z]/g, '');
  if (allCaps && key.length < 2) return false;
  if (title && key.length < 3) return false;
  return true;
}

function isJunk(line) {
  if (!line) return true;
  if (/^\d{1,4}$/.test(line)) return true;
  if (/^[ivxlcdm]+$/i.test(line) && line.length <= 6) return true;
  if (/^page\s+\d+/i.test(line)) return true;
  if (/^[-–—_=*~.]{3,}$/.test(line)) return true;
  if (/project gutenberg/i.test(line)) return true;
  if (/^\*\*\*\s*(start|end) of/i.test(line)) return true;
  if (/^produced by /i.test(line)) return true;
  return false;
}

function isSceneHeading(line) {
  if (/^(act|scene|prologue|epilogue)\b/i.test(line)) return true;
  if (/\bact\b/i.test(line) && /\bscene\b/i.test(line)) return true;
  return false;
}

function isBanner(line) {
  if (!/^[A-Z][A-Z0-9 ,.'’:\-—]{2,60}$/.test(line)) return false;
  if (line.split(/\s+/).length > 8) return false;
  if (/[.!?]$/.test(line)) return false;
  if (/^(ENTER|EXIT|EXEUNT|ASIDE)\b/.test(line)) return false;
  return true;
}

function matchSpeaker(line) {
  const m = line.match(/^([A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*){0,3})\s*[.:]\s*(.*)$/);
  if (!m) return null;
  const name = m[1].trim().replace(/\.$/, '');
  if (!looksLikeName(name)) return null;
  if (/^(enter|exit|exeunt|act|scene|prologue)$/i.test(name.split(/\s+/)[0])) return null;
  return { name, rest: m[2] || '' };
}

function isEnterExit(line) {
  return /^\s*\[?\s*(enter|exit|exeunt|re-enter|reenter)\b/i.test(line);
}

function unwrapDirection(line) {
  const patterns = [
    /^\s*\((.*)\)\s*$/,
    /^\s*\[(.*)\]\s*$/,
    /^\s*_(.+?)_\s*$/,
    /^\s*\*(.+?)\*\s*$/,
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function extractInline(text) {
  const dirs = [];
  const clean = String(text || '').replace(
    /\(([^)]*)\)|\[([^\]]+)\]|_([^_]{2,80})_|\*([^*]{2,80})\*/g,
    (full, a, b, c, d) => {
      const inner = (a || b || c || d || '').trim();
      if (!inner) return ' ';
      const gesture = gestureFromText(inner);
      const enterish = /\b(enter|exit|exeunt|aside|kneel|bow|weep|pace|sword|draw)\b/i.test(inner);
      // Keep short emphasis ("*love*") in the spoken line.
      if (!gesture && !enterish && wordCount(inner) < 3 && !a && !b) return inner;
      dirs.push(inner);
      return ' ';
    },
  );
  return { clean: clean.replace(/\s+/g, ' ').trim(), dirs };
}

function stripMidCue(line, knownIds) {
  return line.replace(/\b([A-Z][A-Z'’.\-]{1,24})\s*[.:]\s+/g, (full, name) => {
    const id = slugId(name);
    if (knownIds.has(id) || PRESETS[id]) return ' ';
    return full;
  });
}

function namesFromCue(line) {
  let rest = line.replace(/^\s*\[?\s*(enter|exit|exeunt|re-enter|reenter)\b/i, ' ');
  rest = rest.replace(/[.\]]+\s*$/g, ' ');
  rest = rest.replace(/\bfrom\b.*$/i, ' ');
  rest = rest.replace(/\b(above|below|within|hastily|slowly|quickly|suddenly)\b.*$/i, ' ');
  const parts = rest.split(/\band\b|,|&/i);
  const names = [];
  for (let part of parts) {
    part = part.replace(/^(the|a|an)\s+/i, '').trim();
    part = part.replace(/[^A-Za-z'’ \-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!part) continue;
    const key = part.toLowerCase();
    if (['left', 'right', 'center', 'centre', 'aside', 'them', 'all', 'omnes'].includes(key)) continue;
    if (!/[A-Za-z]/.test(part)) continue;
    if (part.split(/\s+/).length > 4) continue;
    names.push(titleCaseName(part));
  }
  return names;
}

function interpretDirection(text) {
  const t = String(text || '');
  const out = {};
  if (/\b(enter|enters|entrance|re-enter|reenter)\b/i.test(t)) {
    out.enter = true;
    out.enterFrom = /\bright\b/i.test(t) ? 'right' : 'left';
  }
  if (/\b(exit|exits|exeunt|leaves|retires)\b/i.test(t)) {
    out.exit = true;
    out.exitTo = /\bright\b/i.test(t) ? 'right' : 'left';
  }
  const g = gestureFromText(t);
  if (g) out.gesture = g;
  if (/\b(audience|soliloquy|soliloquies)\b/i.test(t)) out.lookAt = 'audience';
  if (/\baside\b/i.test(t)) {
    out.lookAt = 'aside';
    out.gesture = out.gesture || 'turnAway';
  }
  const emotion = emotionFromText(t, { solo: false });
  if (emotion !== 'neutral') out.emotion = emotion;
  out.known = Boolean(out.enter || out.exit || out.gesture || out.lookAt || out.emotion);
  return out;
}

function pauseFor(line, emotion) {
  if (!line) return 200;
  if (emotion === 'contemplative') return 480;
  if (emotion === 'haunted' || emotion === 'sad') return 440;
  if (/\?\s*$/.test(line)) return 400;
  if (/!\s*$/.test(line)) return 280;
  return 340;
}

/**
 * @param {string} scriptText
 * @param {{ title?: string, source?: string, locale?: string }} [options]
 */
export function parseScript(scriptText, options = {}) {
  const warnings = [];
  const text = normalizeSource(scriptText);
  const lines = text.split('\n');

  /** @type {Map<string, object>} */
  const characters = new Map();
  let autoIndex = 0;

  const ensureCharacter = (rawName) => {
    const display = titleCaseName(String(rawName || 'Actor'));
    const id = slugId(display);
    if (characters.has(id)) return id;
    const preset = PRESETS[id];
    const color = preset?.color || PALETTE[(autoIndex + hashString(id)) % PALETTE.length];
    const costume = preset?.costume || costumeForIndex(autoIndex);
    autoIndex += 1;
    const pitchJitter = ((hashString(id) % 7) - 3) * 0.03;
    characters.set(id, {
      id,
      name: preset?.name || display,
      aliases: preset?.aliases ? [...preset.aliases] : [],
      color,
      costume,
      skin: preset?.skin || '#e0b394',
      hair: preset?.hair || '#2c241c',
      voice: preset?.voice
        ? { ...preset.voice }
        : {
            lang: options.locale === 'zh' ? 'en-US' : 'en-US',
            pitch: Math.min(1.5, Math.max(0.7, 0.92 + pitchJitter)),
            rate: 1,
          },
    });
    if (!preset) warnings.push(`new-character:${characters.get(id).name}`);
    return id;
  };

  const scenes = [];
  let scene = null;
  let beatCount = 0;
  const onStage = new Set();
  let openSpeaker = null;
  let buffer = [];
  let inlineDirs = [];
  let pacedSolo = false;

  const ensureScene = () => {
    if (scene) return scene;
    scene = { id: 'scene-1', name: options.title || 'Scene', beats: [] };
    scenes.push(scene);
    return scene;
  };

  const startScene = (heading) => {
    const name = heading.replace(/\s+/g, ' ').trim();
    if (scene && scene.beats.length === 0 && openSpeaker == null && buffer.length === 0) {
      scene.name = scene.name && scene.name !== (options.title || 'Scene') ? `${scene.name} — ${name}` : name;
      scene.id = slugId(scene.name).slice(0, 48) || scene.id;
      return;
    }
    flushSpeech();
    const idBase = slugId(name).slice(0, 42) || 'scene';
    scene = { id: `${idBase}-${scenes.length + 1}`, name, beats: [] };
    scenes.push(scene);
    onStage.clear();
    pacedSolo = false;
  };

  const chooseMark = (id) => {
    const ids = [...onStage];
    if (ids.length <= 1) return 'cs';
    if (ids.length === 2) {
      const sorted = [...ids].sort();
      return id === sorted[0] ? 'dl' : 'dr';
    }
    const slots = ['sl', 'cs', 'sr', 'ul', 'ur', 'dl', 'dr'];
    return slots[Math.max(0, ids.indexOf(id)) % slots.length];
  };

  const chooseLook = (id, line) => {
    if (onStage.size <= 1) return 'audience';
    if (/\baside\b/i.test(line)) return 'aside';
    for (const other of onStage) {
      if (other === id) continue;
      const ch = characters.get(other);
      const names = [ch?.name, ...(ch?.aliases || [])].filter(Boolean);
      if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(line))) {
        return other;
      }
    }
    const others = [...onStage].filter((x) => x !== id);
    return others[others.length - 1] || 'audience';
  };

  const pushBeat = (partial) => {
    ensureScene();
    beatCount += 1;
    scene.beats.push({
      id: `b${beatCount}`,
      kind: partial.kind || (partial.line ? 'speech' : 'action'),
      speaker: partial.speaker || null,
      line: partial.line || '',
      emotion: partial.emotion || 'neutral',
      gesture: partial.gesture || (partial.line ? 'talk' : 'idle'),
      moveTo: partial.moveTo ?? null,
      lookAt: partial.lookAt ?? null,
      enterFrom: partial.enterFrom ?? null,
      exitTo: partial.exitTo ?? null,
      pauseMs: partial.pauseMs ?? (partial.line ? 360 : 200),
    });
  };

  const applyDirToBeat = (beat, dir) => {
    const info = interpretDirection(dir);
    if (!info.known) {
      warnings.push(`unknown-direction:${dir.slice(0, 80)}`);
      return;
    }
    if (info.gesture) beat.gesture = info.gesture;
    if (info.emotion) beat.emotion = info.emotion;
    if (info.lookAt) beat.lookAt = info.lookAt;
    if (info.exit) beat.exitTo = info.exitTo || 'left';
  };

  const flushSpeech = () => {
    if (!openSpeaker) {
      buffer = [];
      inlineDirs = [];
      return;
    }
    const id = openSpeaker;
    const joined = buffer.join(' ').replace(/\s+/g, ' ').trim();
    const { clean, dirs } = extractInline(joined);
    const allDirs = [...inlineDirs, ...dirs];
    inlineDirs = [];
    buffer = [];
    openSpeaker = null;
    if (!clean) {
      // Direction-only cue under a name still needs to land somewhere.
      if (allDirs.length) {
        const wasOn = onStage.has(id);
        onStage.add(id);
        const beat = {
          speaker: id,
          line: '',
          emotion: 'neutral',
          gesture: 'idle',
          moveTo: chooseMark(id),
          lookAt: chooseLook(id, allDirs.join(' ')),
          enterFrom: wasOn ? null : 'left',
          exitTo: null,
          pauseMs: 240,
          kind: 'action',
        };
        for (const d of allDirs) applyDirToBeat(beat, d);
        pushBeat(beat);
      }
      return;
    }
    const known = new Set(characters.keys());
    const spoken = stripMidCue(clean, known);
    const chunks = splitSpeech(spoken);
    chunks.forEach((chunk, index) => {
      const wasOn = onStage.has(id);
      onStage.add(id);
      const solo = onStage.size <= 1;
      let emotion = emotionFromText(chunk, { solo });
      let gesture = gestureFromText(chunk, { speech: true }) || gestureForEmotion(emotion, true);
      if (solo && emotion === 'contemplative' && !pacedSolo && index === 0) {
        gesture = 'pace';
        pacedSolo = true;
      }
      const beat = {
        speaker: id,
        line: chunk,
        emotion,
        gesture,
        moveTo: chooseMark(id),
        lookAt: chooseLook(id, chunk),
        enterFrom: !wasOn && index === 0 ? (hashString(id) % 2 === 0 ? 'left' : 'right') : null,
        exitTo: null,
        pauseMs: pauseFor(chunk, emotion),
        kind: 'speech',
      };
      if (index === 0) {
        for (const d of allDirs) applyDirToBeat(beat, d);
      }
      // A parenthetical exit should not also invent an entrance.
      if (beat.exitTo) beat.enterFrom = null;
      pushBeat(beat);
    });
  };

  const pushEntrance = (rawLine) => {
    const exiting = /^\s*\[?\s*(exit|exeunt)\b/i.test(rawLine);
    const speakerNow = openSpeaker;
    flushSpeech();
    let names = namesFromCue(rawLine);
    if (!names.length) {
      if (speakerNow && characters.has(speakerNow)) names = [characters.get(speakerNow).name];
      else names = [...onStage].map((id) => characters.get(id)?.name).filter(Boolean);
    }
    if (!names.length) {
      warnings.push(`unknown-direction:${rawLine.slice(0, 80)}`);
      return;
    }
    const fromRight = /\bright\b/i.test(rawLine);
    if (exiting) {
      names.forEach((name, i) => {
        const id = ensureCharacter(name);
        onStage.delete(id);
        pushBeat({
          speaker: id,
          kind: 'action',
          line: '',
          emotion: 'neutral',
          gesture: 'idle',
          moveTo: null,
          lookAt: 'audience',
          enterFrom: null,
          exitTo: fromRight || i % 2 === 1 ? 'right' : 'left',
          pauseMs: 160,
        });
      });
      return;
    }
    names.forEach((name) => ensureCharacter(name));
    const ids = names.map((n) => slugId(titleCaseName(n)));
    ids.forEach((id) => onStage.add(id));
    ids.forEach((id, i) => {
      pushBeat({
        speaker: id,
        kind: 'action',
        line: '',
        emotion: 'neutral',
        gesture: 'idle',
        moveTo: chooseMark(id),
        lookAt: ids.length === 1 ? 'audience' : ids.find((other) => other !== id) || 'audience',
        enterFrom: fromRight ? 'right' : i % 2 === 0 ? 'left' : 'right',
        exitTo: null,
        pauseMs: 120,
      });
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (isJunk(line)) continue;
    if (isSceneHeading(line)) {
      startScene(line.replace(/\.\s*$/, ''));
      continue;
    }
    if (isEnterExit(line)) {
      pushEntrance(line);
      continue;
    }
    const bareDir = unwrapDirection(line);
    if (bareDir != null) {
      if (/\b(enter|exit|exeunt|re-enter|reenter)\b/i.test(bareDir)) {
        pushEntrance(bareDir);
        continue;
      }
      if (openSpeaker) inlineDirs.push(bareDir);
      else if (scene && scene.beats.length) applyDirToBeat(scene.beats[scene.beats.length - 1], bareDir);
      else {
        const info = interpretDirection(bareDir);
        if (!info.known) warnings.push(`unknown-direction:${bareDir.slice(0, 80)}`);
        else {
          ensureScene();
          pushBeat({
            kind: 'action',
            speaker: null,
            line: '',
            emotion: info.emotion || 'neutral',
            gesture: info.gesture || 'idle',
            lookAt: info.lookAt || null,
            pauseMs: 280,
          });
        }
      }
      continue;
    }
    if (!openSpeaker && isBanner(line)) {
      if (!options.title && scenes.length === 0 && !scene) {
        options = { ...options, title: titleCaseName(line) };
      }
      startScene(titleCaseName(line));
      continue;
    }
    const speaker = matchSpeaker(line);
    if (speaker) {
      const cueId = slugId(speaker.name);
      const letters = speaker.name.replace(/[^A-Za-z]/g, '');
      const allCaps = letters.length > 0 && letters === letters.toUpperCase();
      const known = characters.has(cueId) || Boolean(PRESETS[cueId]);
      // "Speak. I'll go" and "Alas. Even..." are dialogue, not new roles.
      // A fresh cue is ALL CAPS, a known name, or a title-case name when nobody is mid-speech.
      const cueStop = CUE_STOP.has(cueId);
      if (!cueStop && (allCaps || known || !openSpeaker)) {
        flushSpeech();
        openSpeaker = ensureCharacter(speaker.name);
        if (speaker.rest.trim()) buffer.push(speaker.rest.trim());
        continue;
      }
    }
    if (openSpeaker) {
      buffer.push(line);
      continue;
    }
    if (line) warnings.push(`skipped:${line.slice(0, 80)}`);
  }
  flushSpeech();

  if (!scenes.length) {
    scenes.push({ id: 'scene-1', name: options.title || 'Scene', beats: [] });
  }
  if (!beatCount) {
    const prose = lines.map((l) => l.trim()).filter((l) => l && !isJunk(l)).join(' ');
    warnings.push('no-cues');
    if (prose) {
      const id = ensureCharacter('Narrator');
      onStage.add(id);
      const chunks = splitSpeech(prose).slice(0, 8);
      chunks.forEach((chunk) => {
        beatCount += 1;
        scenes[0].beats.push({
          id: `b${beatCount}`,
          kind: 'speech',
          speaker: id,
          line: chunk,
          emotion: emotionFromText(chunk, { solo: true }),
          gesture: 'talk',
          moveTo: 'cs',
          lookAt: 'audience',
          enterFrom: beatCount === 1 ? 'left' : null,
          exitTo: null,
          pauseMs: 360,
        });
      });
    }
  }

  return normalizePerformance(
    {
      version: 1,
      title: options.title || scenes[0]?.name || 'Untitled',
      source: options.source || '',
      locale: options.locale === 'zh' ? 'zh' : 'en',
      characters: [...characters.values()],
      marks: defaultMarks(),
      scenes,
      warnings,
    },
    warnings,
  );
}

export class RuleParser {
  parse(scriptText, options) {
    return parseScript(scriptText, options);
  }
}
