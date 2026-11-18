#!/usr/bin/env node
/**
 * Offline check for the rule parser. No browser, no network, no model.
 *   node tools/smoke-parse.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScript, streamScript } from '../src/parse/ruleParser.js';
import { looksLikePremise, streamPremise } from '../src/parse/premise.js';
import { appendBeat, eventsToPerformance, ndjsonToEvents, performanceToEvents } from '../src/performance/stream.js';
import { samples } from '../src/data/samples.js';

const here = dirname(fileURLToPath(import.meta.url));
const failures = [];

function expect(cond, message) {
  if (!cond) failures.push(message);
}

const hamlet = parseScript(samples['hamlet-a3s1'].script, {
  title: samples['hamlet-a3s1'].title,
  source: samples['hamlet-a3s1'].source,
});
const ids = new Set(hamlet.characters.map((c) => c.id));
expect(ids.has('hamlet'), 'hamlet-a3s1 should include hamlet');
expect(ids.has('ophelia'), 'hamlet-a3s1 should include ophelia');
expect(hamlet.scenes.some((s) => s.beats.length > 4), 'hamlet-a3s1 should have several beats');
expect(hamlet.scenes.some((s) => s.beats.some((b) => b.speaker === 'hamlet' && b.line)), 'hamlet should have a spoken line');

const ghost = parseScript(samples['hamlet-a1s5'].script, { title: samples['hamlet-a1s5'].title });
expect(ghost.characters.some((c) => c.id === 'ghost'), 'hamlet-a1s5 should include the ghost');

const demo = parseScript(samples.demo.script, { title: samples.demo.title });
expect(demo.characters.length >= 2, 'courtyard demo should have two characters');

const two = parseScript(`Enter ALICE.

ALICE.
The lantern is lit.

Enter BOB.

BOB.
Then we cross the yard.
`);
const twoIds = two.characters.map((c) => c.id).sort();
expect(twoIds.includes('alice') && twoIds.includes('bob'), `two-hander ids were ${twoIds.join(',')}`);
const speakers = new Set(two.scenes.flatMap((s) => s.beats.map((b) => b.speaker)));
expect(speakers.has('alice') && speakers.has('bob'), 'two-hander should give both a beat');

const empty = parseScript('   \n');
expect(empty.warnings.includes('no-cues') || empty.warnings.includes('empty-performance'), 'blank script should warn');

const prompt = readFileSync(resolve(here, 'prompt-performance.md'), 'utf8');
expect(prompt.includes('{{SCRIPT}}'), 'prompt template should have a script marker');
expect(prompt.includes('"version": 1'), 'prompt template should document version 1');

function beatKey(performance) {
  return performance.scenes.flatMap((scene) => scene.beats.map((b) => [b.speaker, b.kind, b.line, b.emotion, b.gesture, b.moveTo, b.enterFrom, b.exitTo].join('|')));
}

const t0 = performance.now();
let firstAt = 0;
const streamed = await streamScript(samples['hamlet-a3s1'].script, (ev) => {
  if (!firstAt && ev.type === 'beat') firstAt = performance.now() - t0;
}, { title: samples['hamlet-a3s1'].title, source: samples['hamlet-a3s1'].source });
expect(firstAt > 0 && firstAt < 800, `hamlet first beat event should be fast, was ${firstAt.toFixed(1)}ms`);
expect(beatKey(hamlet).join('\n') === beatKey(streamed).join('\n'), 'streamed hamlet should match the full parse');

expect(looksLikePremise('两个朋友在雨里吵架'), 'a one-line premise should be recognized');
expect(!looksLikePremise(samples.demo.script), 'a cued script is not a premise');
const sketch = await streamPremise('两个朋友在雨里吵架', () => {});
expect(sketch.warnings.includes('local-sketch'), 'premise sketch should label itself');
expect(sketch.scenes[0].beats.some((b) => b.line.includes('两个朋友在雨里吵架')), 'premise should be woven into a line');

const round = eventsToPerformance(ndjsonToEvents(performanceToEvents(sketch).map((ev) => JSON.stringify(ev)).join('\n')));
expect(round.scenes[0].beats[0].line === sketch.scenes[0].beats[0].line, 'ndjson roundtrip should keep the first line');
const aliased = { version: 1, title: 'T', characters: [{ id: 'ann', name: 'Ann' }], scenes: [{ id: 's', name: 'S', beats: [] }], warnings: [] };
appendBeat(aliased, { sid: 's', sp: 'ann', ln: 'Hello there.', em: 'joyful' });
expect(aliased.scenes[0].beats[0].speaker === 'ann' && aliased.scenes[0].beats[0].line === 'Hello there.', 'short beat aliases should append');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`smoke-parse ok — hamlet beats ${hamlet.scenes.reduce((n, s) => n + s.beats.length, 0)}, characters ${[...ids].join(', ')}, firstBeat ${firstAt.toFixed(1)}ms`);
