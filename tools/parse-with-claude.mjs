#!/usr/bin/env node
/**
 * Optional helper: ask the Claude CLI to turn a script file into
 * Performance JSON for AI Theater / 演戏.
 *
 * This file does not run as part of the app. The browser build has no API
 * key, does not import this script, and does not call a paid API.
 * v1's on-stage parser is the offline rule parser in src/parse/ruleParser.js.
 *
 * The default command prints the prompt and stops. It does not spawn
 * `claude`, does not read ANTHROPIC_API_KEY, and does not open a network
 * connection. A person who already has the Claude CLI installed may pass
 * --invoke on their own machine; that path is documented below and is not
 * used by the theater.
 *
 * Usage:
 *   node tools/parse-with-claude.mjs script.txt
 *   node tools/parse-with-claude.mjs script.txt --out performance.json
 *   node tools/parse-with-claude.mjs script.txt --invoke --out performance.json
 *
 * --invoke (opt-in, not run by this repo's tests):
 *   claude -p --output-format text
 *   stdin is the filled prompt from tools/prompt-performance.md
 *   stdout is expected to be a single JSON object
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const promptPath = resolve(here, 'prompt-performance.md');

function usage() {
  return [
    'AI Theater — fill tools/prompt-performance.md with a script.',
    'By default this does not call claude.',
    '',
    '  node tools/parse-with-claude.mjs <script.txt> [--out file.json] [--invoke]',
    '',
    'Without --invoke, the prompt is written to stdout (or --out) and the',
    'process exits 0. --invoke is a local opt-in for a person who has the',
    'Claude CLI on PATH. The theater app never passes that flag.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { invoke: false, out: '', script: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--invoke') args.invoke = true;
    else if (token === '--out') args.out = argv[++i] || '';
    else rest.push(token);
  }
  args.script = rest[0] || '';
  return args;
}

function buildPrompt(scriptText) {
  const template = readFileSync(promptPath, 'utf8');
  if (!template.includes('{{SCRIPT}}')) {
    throw new Error('prompt-performance.md is missing the {{SCRIPT}} marker');
  }
  return template.replace('{{SCRIPT}}', scriptText.replace(/\s+$/, ''));
}

/**
 * Opt-in only. Not called unless the operator passes --invoke.
 * Kept here so the command line is explicit and reviewable.
 */
function invokeClaude(prompt) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `claude exited ${code}`));
        return;
      }
      resolvePromise(stdout.trim());
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Claude output did not contain a JSON object');
  }
  return JSON.parse(body.slice(start, end + 1));
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.script) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

const scriptText = readFileSync(resolve(args.script), 'utf8');
const prompt = buildPrompt(scriptText);

if (!args.invoke) {
  const note = [
    '----- prompt (claude was not called) -----',
    prompt,
    '',
  ].join('\n');
  if (args.out) writeFileSync(resolve(args.out), note);
  else process.stdout.write(note);
  process.exit(0);
}

// --invoke is intentionally unreachable from the app and from the v1 tests.
try {
  const raw = await invokeClaude(prompt);
  const json = extractJson(raw);
  const pretty = `${JSON.stringify(json, null, 2)}\n`;
  if (args.out) writeFileSync(resolve(args.out), pretty);
  else process.stdout.write(pretty);
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
