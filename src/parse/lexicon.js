/**
 * Emotion and gesture vocabularies for Performance JSON.
 * The rule parser only emits these ids. Unknown values fall back
 * (emotion → neutral, gesture → talk if the beat has a line, else idle).
 */

export const EMOTIONS = [
  'neutral',
  'contemplative',
  'curious',
  'uncertain',
  'emphatic',
  'angry',
  'sad',
  'tender',
  'fearful',
  'proud',
  'haunted',
  'joyful',
];

export const GESTURES = [
  'idle',
  'talk',
  'point',
  'handsOnChest',
  'raiseArm',
  'kneel',
  'turnAway',
  'pace',
  'bow',
  'weep',
  'give',
  'take',
  'drawSword',
  'shrug',
  'nod',
  'shakeHead',
  'listen',
];

const EMOTION_SET = new Set(EMOTIONS);
const GESTURE_SET = new Set(GESTURES);

export function isEmotion(id) {
  return EMOTION_SET.has(id);
}

export function isGesture(id) {
  return GESTURE_SET.has(id);
}

/** Keyword rules, first match wins. Direction text and spoken lines both use these. */
const EMOTION_RULES = [
  { re: /\b(alas|weep\w*|tears|woe|o'erthrown|overthrown)\b/i, emotion: 'sad' },
  { re: /\b(villain|nunnery|calumny|mad|monster|paintings)\b/i, emotion: 'angry' },
  { re: /\b(fear\w*|dread\w*|afraid|horror|harrow\w*|cowards?)\b/i, emotion: 'fearful' },
  { re: /\b(murder\w*|revenge|ghost|spirits?|sulphur\w*|sulfur\w*|porpentine|haunt\w*)\b/i, emotion: 'haunted' },
  { re: /\b(nymph|orisons?|i did love|love you|loved you|my love|father love)\b/i, emotion: 'tender' },
  { re: /\b(pray\w*|heaven\w*|amen)\b/i, emotion: 'tender' },
  { re: /\b(i am proud|majesty|my crown)\b/i, emotion: 'proud' },
  { re: /\b(laughs|laugh|joy|merry|glad)\b/i, emotion: 'joyful' },
  { re: /\b(deaths?|die|dying|dead|grave|bodkin)\b/i, emotion: 'sad' },
];

/** Stage directions can be imperative and short, so the net is wider. */
const DIRECTION_GESTURES = [
  { re: /\b(kneel\w*)\b/i, gesture: 'kneel' },
  { re: /\b(draws?|unsheath\w*|sword|dagger)\b/i, gesture: 'drawSword' },
  { re: /\b(weep\w*|tears)\b/i, gesture: 'weep' },
  { re: /\b(turn(?:s|ing)? away|aside|turns (?:his|her|their) back)\b/i, gesture: 'turnAway' },
  { re: /\b(pace\w*|walks up and down)\b/i, gesture: 'pace' },
  { re: /\b(bow\w*)\b/i, gesture: 'bow' },
  { re: /\b(shrug\w*)\b/i, gesture: 'shrug' },
  { re: /\bnods?\b/i, gesture: 'nod' },
  { re: /\bshakes? (?:his |her |their )?head\b/i, gesture: 'shakeHead' },
  { re: /\b(swear\w*|oath|raises? (?:his |her )?hand|remember me)\b/i, gesture: 'raiseArm' },
  { re: /\bpoints?\b/i, gesture: 'point' },
  { re: /\b(hands? (?:on |to )?(?:his |her |my )?(?:chest|bosom)|on (?:his|her|my) heart)\b/i, gesture: 'handsOnChest' },
  { re: /\b(take these|gives?|offers?)\b/i, gesture: 'give' },
  { re: /\b(takes?|receive\w*)\b/i, gesture: 'take' },
];

/** Spoken lines only get a gesture when the cue is hard to mistake. */
const SPEECH_GESTURES = [
  { re: /\b(kneel\w*)\b/i, gesture: 'kneel' },
  { re: /\b(weep\w*|tears)\b/i, gesture: 'weep' },
  { re: /\b(turn(?:s|ing)? away|aside)\b/i, gesture: 'turnAway' },
  { re: /\b(bow\w*)\b/i, gesture: 'bow' },
  { re: /\b(shrug\w*)\b/i, gesture: 'shrug' },
  { re: /\bremember me\b/i, gesture: 'raiseArm' },
  { re: /\bi swear\b/i, gesture: 'raiseArm' },
  { re: /\btake these\b/i, gesture: 'give' },
  { re: /\breceive them\b/i, gesture: 'take' },
  { re: /\bdraws? (?:his|her|a) (?:sword|dagger)\b/i, gesture: 'drawSword' },
];

const GESTURE_FOR_EMOTION = {
  contemplative: 'handsOnChest',
  angry: 'point',
  sad: 'handsOnChest',
  tender: 'handsOnChest',
  fearful: 'turnAway',
  proud: 'idle',
  haunted: 'talk',
  uncertain: 'shrug',
  curious: 'shrug',
  emphatic: 'raiseArm',
  joyful: 'talk',
  neutral: 'talk',
};

export function emotionFromText(text, { solo = false } = {}) {
  const line = String(text || '');
  if (/^ha[,!]?\s*ha\b/i.test(line.trim())) return 'joyful';
  if (/\bloved?\b/i.test(line) && /\bnot\b/i.test(line)) return 'sad';
  for (const rule of EMOTION_RULES) {
    if (rule.re.test(line)) return rule.emotion;
  }
  const words = wordCount(line);
  if (/\?\s*$/.test(line)) return words > 16 ? 'uncertain' : 'curious';
  if (/!\s*$/.test(line)) return 'emphatic';
  if (/\bquestion\b/i.test(line) || (solo && words > 16)) return 'contemplative';
  if (solo && words > 10) return 'contemplative';
  return 'neutral';
}

/**
 * @param {string} text
 * @param {{ speech?: boolean }} [options]
 * speech:true ignores figurative verbs ("give us pause", "bodkin") that are not actions.
 */
export function gestureFromText(text, options = {}) {
  const line = String(text || '');
  const rules = options.speech ? SPEECH_GESTURES : DIRECTION_GESTURES;
  for (const rule of rules) {
    if (rule.re.test(line)) return rule.gesture;
  }
  const words = wordCount(line);
  if (options.speech && words <= 10 && /^(no|never|nay)\b/i.test(line.trim())) return 'shakeHead';
  if (!options.speech && /\b(never|shake)\b/i.test(line)) return 'shakeHead';
  if (words <= 8 && /^(ay|yes|i will|i do)\b/i.test(line.trim())) return 'nod';
  return null;
}

export function gestureForEmotion(emotion, hasLine) {
  if (!hasLine) return 'idle';
  return GESTURE_FOR_EMOTION[emotion] || 'talk';
}

export function wordCount(text) {
  const s = String(text || '').trim();
  if (!s) return 0;
  const cjk = (s.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = s
    .replace(/[\u3400-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return latin + Math.round(cjk / 2);
}

/**
 * Break a speech into subtitle-sized beats.
 * Semicolons and sentence ends are preferred cut points; short fragments merge.
 */
export function splitSpeech(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (wordCount(clean) <= 22) return [clean];
  const matches = clean.match(/[^.!?;]+[.!?;]+|[^.!?;]+$/g) || [clean];
  const parts = [];
  let buf = '';
  let words = 0;
  const flush = () => {
    if (buf.trim()) parts.push(buf.trim());
    buf = '';
    words = 0;
  };
  for (const raw of matches) {
    const piece = raw.trim();
    if (!piece) continue;
    const w = wordCount(piece);
    if (!buf) {
      buf = piece;
      words = w;
      continue;
    }
    if (words < 16 || words + w <= 34) {
      buf += ' ' + piece;
      words += w;
    } else {
      flush();
      buf = piece;
      words = w;
    }
  }
  flush();
  return parts.length ? parts : [clean];
}
