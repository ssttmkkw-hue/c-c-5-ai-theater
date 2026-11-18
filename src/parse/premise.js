/**
 * Instant local sketch for a one-line premise.
 * No network and no model: two original lines woven around the audience's sentence.
 * Labeled so it is obvious this is not an AI dramaturg.
 */

import { performanceToEvents } from '../performance/stream.js';

const SKETCH_NOTE = 'local instant sketch, not an AI dramaturg (coming later)';

function hasScriptCue(line) {
  if (/^(enter|exit|exeunt|act|scene|prologue|epilogue)\b/i.test(line)) return true;
  if (/^[A-Z][A-Z0-9'’.\-]{1,24}(?:\s+[A-Z][A-Z0-9'’.\-]{1,24}){0,3}\.?\s*$/.test(line)) return true;
  if (/^[A-Z][a-z'’.\-]+(?:\s+[A-Z][a-z'’.\-]+){0,3}\s*[.:]\s*$/.test(line)) return true;
  if (/^[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*){0,3}\s*:\s+\S/.test(line)) return true;
  if (/^\([^)]+\)$/.test(line) || /^\[[^\]]+\]$/.test(line)) return true;
  return false;
}

/** Short text with no speaker cues. A real playscript returns false. */
export function looksLikePremise(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.startsWith('{') || raw.startsWith('[')) return false;
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || lines.length > 6) return false;
  if (raw.length > 320) return false;
  if (lines.some((line) => hasScriptCue(line))) return false;
  return true;
}

function clip(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= 160) return s;
  return `${s.slice(0, 157)}…`;
}

function voice(pitch, rate, lang) {
  return { lang, pitch, rate };
}

/**
 * @returns {object} Performance JSON for a two-hander sketch
 */
export function premisePerformance(text, options = {}) {
  const premise = clip(text);
  const zh = /[\u3400-\u9fff]/.test(premise) || options.locale === 'zh';
  const title = zh ? '即兴草稿' : 'Instant sketch';
  const characters = zh
    ? [
        {
          id: 'jia',
          name: '甲',
          color: '#3b5b8c',
          costume: 'traveler',
          skin: '#e0b394',
          hair: '#241c16',
          voice: voice(0.92, 1.02, 'zh-CN'),
          aliases: [],
        },
        {
          id: 'yi',
          name: '乙',
          color: '#8d2f36',
          costume: 'courtier',
          skin: '#f2cbb8',
          hair: '#3a241c',
          voice: voice(1.16, 1.04, 'zh-CN'),
          aliases: [],
        },
      ]
    : [
        {
          id: 'player',
          name: 'Player',
          color: '#3b5b8c',
          costume: 'traveler',
          skin: '#e0b394',
          hair: '#241c16',
          voice: voice(0.94, 1.02, 'en-US'),
          aliases: [],
        },
        {
          id: 'friend',
          name: 'Friend',
          color: '#8d2f36',
          costume: 'courtier',
          skin: '#f2cbb8',
          hair: '#3a241c',
          voice: voice(1.18, 1.04, 'en-US'),
          aliases: [],
        },
      ];
  const a = characters[0].id;
  const b = characters[1].id;
  const beats = zh
    ? [
        {
          id: 'b1',
          kind: 'speech',
          speaker: a,
          line: `先演起来。你给的是这一句：${premise}`,
          lineZh: `先演起来。你给的是这一句：${premise}`,
          emotion: 'emphatic',
          gesture: 'point',
          moveTo: 'dl',
          lookAt: 'audience',
          enterFrom: 'left',
          exitTo: null,
          pauseMs: 280,
        },
        {
          id: 'b2',
          kind: 'speech',
          speaker: b,
          line: '听见了。这只是本地的即兴草稿，不是编剧模型。我们先把它演开。',
          lineZh: '听见了。这只是本地的即兴草稿，不是编剧模型。我们先把它演开。',
          emotion: 'curious',
          gesture: 'talk',
          moveTo: 'dr',
          lookAt: a,
          enterFrom: 'right',
          exitTo: null,
          pauseMs: 320,
        },
        {
          id: 'b3',
          kind: 'speech',
          speaker: a,
          line: '后头的句子可以慢慢到。这一句已经够我们上台。',
          lineZh: '后头的句子可以慢慢到。这一句已经够我们上台。',
          emotion: 'tender',
          gesture: 'handsOnChest',
          moveTo: null,
          lookAt: b,
          enterFrom: null,
          exitTo: null,
          pauseMs: 360,
        },
      ]
    : [
        {
          id: 'b1',
          kind: 'speech',
          speaker: a,
          line: `We start before the ink dries. The premise is: ${premise}`,
          emotion: 'emphatic',
          gesture: 'point',
          moveTo: 'dl',
          lookAt: 'audience',
          enterFrom: 'left',
          exitTo: null,
          pauseMs: 280,
        },
        {
          id: 'b2',
          kind: 'speech',
          speaker: b,
          line: 'Heard. This is a local instant sketch, not an AI dramaturg. We play it now.',
          emotion: 'curious',
          gesture: 'talk',
          moveTo: 'dr',
          lookAt: a,
          enterFrom: 'right',
          exitTo: null,
          pauseMs: 320,
        },
        {
          id: 'b3',
          kind: 'speech',
          speaker: a,
          line: 'Later lines can still arrive. This one is enough to be on stage.',
          emotion: 'tender',
          gesture: 'handsOnChest',
          moveTo: null,
          lookAt: b,
          enterFrom: null,
          exitTo: null,
          pauseMs: 360,
        },
      ];
  return {
    version: 1,
    title,
    source: '',
    note: SKETCH_NOTE,
    locale: zh ? 'zh' : 'en',
    characters,
    scenes: [{ id: 'sketch', name: title, beats }],
    warnings: ['local-sketch'],
  };
}

export async function streamPremise(text, onEvent, options = {}) {
  const perf = premisePerformance(text, options);
  const events = performanceToEvents(perf);
  let yielded = false;
  for (const ev of events) {
    onEvent?.(ev);
    if (!yielded && ev.type === 'beat') {
      yielded = true;
      await Promise.resolve();
    }
  }
  return perf;
}
