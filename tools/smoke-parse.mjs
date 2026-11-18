#!/usr/bin/env node
/**
 * Offline check for the rule parser. No browser, no network, no model.
 *   node tools/smoke-parse.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScript } from '../src/parse/ruleParser.js';
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

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`smoke-parse ok — hamlet beats ${hamlet.scenes.reduce((n, s) => n + s.beats.length, 0)}, characters ${[...ids].join(', ')}`);
