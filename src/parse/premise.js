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

function sketchKind(text) {
  const s = String(text || '').toLowerCase();
  if (/farewell|goodbye|good-bye|parting|leave me|mystery|secret|ghost|who killed|别|诀|谜|鬼|消失/.test(s)) return 'parting';
  if (/love|heart|marry|kiss|darling|beloved|爱|恋|心上/.test(s)) return 'love';
  if (/fight|war|hate|enemy|betray|revenge|杀|恨|敌|仇|吵/.test(s)) return 'conflict';
  return 'meeting';
}

function sketchLines(kind, premise, zh) {
  if (zh) {
    if (kind === 'conflict') {
      return [
        [`${premise}。这句话我不能让它过去。`, 'angry', 'point'],
        ['那我们就站在两边。我不会先退。', 'emphatic', 'raiseArm'],
        ['你说你的。我还在这儿。', 'angry', 'handsOnChest'],
      ];
    }
    if (kind === 'love') {
      return [
        [`${premise}。留在我看得见的地方。`, 'tender', 'handsOnChest'],
        ['灯还亮着的时候，我不会走。', 'tender', 'talk'],
        ['那就让这间屋子安静下来。', 'joyful', 'idle'],
      ];
    }
    if (kind === 'parting') {
      return [
        [`${premise}。门已经开了。`, 'sad', 'point'],
        ['谁走，谁留在暗处？', 'curious', 'shrug'],
        ['先别跟着。我们只看着门槛。', 'contemplative', 'idle'],
      ];
    }
    return [
      [`${premise}。我把它放在我们中间。`, 'emphatic', 'point'],
      ['我听见了。就从这一句开始，不必更大。', 'curious', 'talk'],
      ['停一会儿。其余的可以在门外等。', 'tender', 'handsOnChest'],
    ];
  }
  if (kind === 'conflict') {
    return [
      [`${premise}. I will not let that pass.`, 'angry', 'point'],
      ['Then we stand on opposite sides, and I will not step back.', 'emphatic', 'raiseArm'],
      ['Say what you must. I am still here.', 'angry', 'handsOnChest'],
    ];
  }
  if (kind === 'love') {
    return [
      [`${premise}. Stay where I can see you.`, 'tender', 'handsOnChest'],
      ['I am not leaving the light. Not while you are in it.', 'tender', 'talk'],
      ['Then this is the room. We can be quiet in it.', 'joyful', 'idle'],
    ];
  }
  if (kind === 'parting') {
    return [
      [`${premise}. The door is already open.`, 'sad', 'point'],
      ['Who goes, and who is left with the dark?', 'curious', 'shrug'],
      ['We do not follow yet. We only watch the threshold.', 'contemplative', 'idle'],
    ];
  }
  return [
    [`${premise}. I set it down between us.`, 'emphatic', 'point'],
    ['I heard you. We begin with that, and nothing larger.', 'curious', 'talk'],
    ['A moment, then. The rest can wait outside.', 'tender', 'handsOnChest'],
  ];
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
  const kind = sketchKind(premise);
  const lines = sketchLines(kind, premise, zh);
  const beats = lines.map((row, index) => {
    const speaker = index === 1 ? b : a;
    const beat = {
      id: `b${index + 1}`,
      kind: 'speech',
      speaker,
      line: row[0],
      emotion: row[1],
      gesture: row[2],
      moveTo: index === 0 ? 'dl' : index === 1 ? 'dr' : null,
      lookAt: index === 0 ? b : index === 1 ? a : b,
      enterFrom: index === 0 ? 'left' : index === 1 ? 'right' : null,
      exitTo: null,
      pauseMs: index === 2 ? 360 : index === 1 ? 320 : 280,
    };
    if (zh) beat.lineZh = row[0];
    return beat;
  });
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
