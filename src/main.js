import * as THREE from 'three';
import { createTheater } from './stage/theater.js';
import { Cast } from './actors/cast.js';
import { createAudience } from './actors/audience.js';
import { CameraRig } from './camera/cameras.js';
import { Director } from './performance/director.js';
import { ParserProvider } from './parse/provider.js';
import { parseScript } from './parse/ruleParser.js';
import { normalizePerformance, performanceToJson } from './performance/schema.js';
import { applyTranslations, samples } from './data/samples.js';
import { curatedHamlet } from './data/curated.js';
import { EXPERIMENT_IDS, live, persistExperiments } from './runtime/live.js';
import { bindCast, getActorStyle, listActorStyles, loadSavedStyle, setActorStyle } from './actors/styles/api.js';
import { mountUI } from './ui/panel.js';

if (location.hash === '#compare') location.replace('./compare.html');

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'default',
  failIfMajorPerformanceCaveat: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color('#100c12');
scene.fog = new THREE.Fog('#100c12', 16, 34);

const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 80);
const cameras = new CameraRig(camera, canvas);
const theater = createTheater(scene);
const cast = new Cast(scene);
bindCast(cast);
loadSavedStyle();
const audience = createAudience(scene);
const provider = new ParserProvider();

let ready = false;
let readyResolve = () => {};
const readyPromise = new Promise((resolve) => {
  readyResolve = resolve;
});
let lastWarnings = [];
let lastPerf = null;
let loadedText = null;
let liveToken = 0;
let subsTouched = false;

function readLang() {
  try {
    const stored = localStorage.getItem('ai-theater-lang');
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    /* ignore */
  }
  return 'zh';
}

live.lang = readLang();
live.subs = live.lang;

let ui;
const director = new Director({
  cast,
  theater,
  cameras,
  onSubtitle: (payload) => ui?.setSubtitle(payload),
  onChange: () => {
    if (director.performance?.warnings) {
      lastWarnings = director.performance.warnings;
      ui?.setWarnings(lastWarnings);
    }
    if (director.streaming || director.streamEnded) ui?.setJson(director.performance);
    ui?.sync();
  },
});

ui = mountUI({
  getState,
  setLang,
  setParser,
  loadAndPlay,
  parseIntoShow,
  liveStart,
  intervene: (action) => director.intervene(action),
  playFromPanel,
  togglePlay,
  setSpeed: (n) => director.setSpeed(n),
  setMuted: (m) => director.setMuted(m),
  setSubs,
  setCamera,
  setExperiment,
  setActorStyle: (id) => setActorStyle(id),
  downloadJson,
  prevBeat: () => director.prevBeat(),
  nextBeat: () => director.nextBeat(),
  stop: () => halt(),
  restart: () => director.restart(),
  dismissHelp,
});

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

function buildPerformance(input) {
  if (input && typeof input === 'object') {
    return applyTranslations(normalizePerformance(input));
  }
  return null;
}

async function materialize(idOrPerf) {
  if (typeof idOrPerf === 'string') {
    if (idOrPerf === 'hamlet-a3s1-curated') {
      return applyTranslations(normalizePerformance(curatedHamlet));
    }
    const sample = samples[idOrPerf];
    if (!sample) return null;
    const perf = parseScript(sample.script, {
      title: sample.title,
      source: sample.source,
      locale: sample.locale,
    });
    return applyTranslations(perf);
  }
  if (idOrPerf && typeof idOrPerf === 'object') return buildPerformance(idOrPerf);
  return null;
}

  async function load(idOrPerf) {
  liveToken += 1;
  const perf = await materialize(idOrPerf);
  if (!perf) return null;
  lastPerf = perf;
  lastWarnings = perf.warnings || [];
  loadedText = null;
  director.load(perf);
  ui.setJson(perf);
  ui.setWarnings(lastWarnings);
  ui.sync();
  return perf;
}

async function parse(text) {
  const perf = await provider.parse(text || '');
  applyTranslations(perf);
  lastWarnings = perf.warnings || [];
  return perf;
}

async function parseIntoShow(text) {
  const perf = await parse(text);
  lastPerf = perf;
  director.load(perf);
  ui.setJson(perf);
  ui.setWarnings(lastWarnings);
  ui.sync();
  return perf;
}

function guessTitle(text) {
  const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  if (!line || line.length > 42) return live.lang === 'zh' ? '即兴' : 'Live';
  return line.replace(/[.。!！?？]$/, '').slice(0, 42);
}

async function liveStart(text, options = {}) {
  const raw = text == null ? ui.script.value : String(text);
  ui.setScript(raw);
  loadedText = raw;
  const token = ++liveToken;
  director.loadPartial({
    title: options.title || guessTitle(raw),
    source: options.source || '',
    locale: options.locale || (live.lang === 'zh' ? 'zh' : 'en'),
    note: options.note || '',
  });
  ui.setSubtitle({
    name: '',
    color: '#e2b15a',
    text: live.lang === 'zh' ? '解析中…大幕已开' : 'Parsing… the curtain is open',
  });
  ui.setWarnings([]);
  ui.sync();
  const first = director.waitForFirstBeat();
  director.play();
  const parsed = provider.parseStream(raw, (event) => {
    if (token !== liveToken) return;
    director.pushEvent(event);
    if (director.performance) applyTranslations(director.performance);
  }, {
    title: options.title,
    source: options.source,
    locale: options.locale || (live.lang === 'zh' ? 'zh' : 'en'),
    note: options.note,
    allowPremise: options.allowPremise,
  }).then(() => {
    if (token !== liveToken) return director.performance;
    if (director.performance) {
      applyTranslations(director.performance);
      lastPerf = director.performance;
      lastWarnings = [...(director.performance.warnings || [])];
    }
    ui.setJson(lastPerf);
    ui.setWarnings(lastWarnings);
    ui.sync();
    return lastPerf;
  }).catch(() => {
    if (token !== liveToken) return null;
    director.pushEvent({ type: 'warning', message: 'ai-fallback-error' });
    director.pushEvent({ type: 'end' });
    return null;
  });
  await first;
  void parsed;
  return getState();
}

async function playFromPanel(text) {
  if (director.playing && director.paused) {
    director.play();
    return;
  }
  if (!director.streaming && loadedText === text && director.playlist.length) {
    director.play();
    return;
  }
  await liveStart(text);
}

async function togglePlay(text) {
  if (director.playing && !director.paused) {
    director.pause();
    return;
  }
  if (director.paused || (!director.streaming && loadedText === text && director.playlist.length)) {
    director.play();
    return;
  }
  await liveStart(text);
}

async function loadAndPlay(id) {
  if (id === 'hamlet-a3s1-curated') {
    await load(id);
    director.play();
    return;
  }
  const sample = samples[id];
  if (!sample) return;
  ui.setScript(sample.script);
  await liveStart(sample.script, {
    title: sample.title,
    source: sample.source,
    locale: sample.locale,
    allowPremise: false,
  });
}

function halt() {
  liveToken += 1;
  director.stop();
}

function setParser(mode) {
  provider.setMode(mode);
}

function setLang(next) {
  live.lang = next === 'en' ? 'en' : 'zh';
  try {
    localStorage.setItem('ai-theater-lang', live.lang);
  } catch {
    /* ignore */
  }
  if (!subsTouched) {
    live.subs = live.lang;
    const box = document.getElementById('subs-zh');
    if (box) box.checked = live.subs === 'zh';
  }
  ui.applyLang();
  refreshSubtitle();
}

function setSubs(mode) {
  subsTouched = true;
  live.subs = mode === 'zh' ? 'zh' : 'en';
  refreshSubtitle();
  ui.sync();
}

function refreshSubtitle() {
  const beat = director.current;
  if (!beat?.line) return;
  const actor = beat.speaker ? cast.get(beat.speaker) : null;
  director.showLine(beat, actor);
}

function setCamera(mode) {
  cameras.setMode(mode);
  ui.sync();
}

function setExperiment(name, on) {
  if (!EXPERIMENT_IDS.includes(name)) return;
  live.experiments[name] = Boolean(on);
  persistExperiments();
  ui.sync();
}

function downloadJson() {
  if (!lastPerf) return;
  const blob = new Blob([performanceToJson(lastPerf)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(lastPerf.title || 'performance').replace(/[^\w\u3400-\u9fff\-]+/g, '-').slice(0, 48)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function dismissHelp() {
  try {
    localStorage.setItem('ai-theater-help-dismissed', '1');
  } catch {
    /* ignore */
  }
  ui.helpOpen(false);
}

function helpShouldOpen() {
  try {
    return localStorage.getItem('ai-theater-help-dismissed') !== '1';
  } catch {
    return true;
  }
}

function typingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || el.isContentEditable;
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const help = document.getElementById('help');
    if (help && !help.hidden) {
      dismissHelp();
      return;
    }
    if (typingTarget(document.activeElement)) {
      document.activeElement.blur();
      return;
    }
    document.getElementById('panel')?.classList.toggle('collapsed');
    ui.sync();
    return;
  }
  if (typingTarget(event.target) || typingTarget(document.activeElement)) return;
  if (event.key === ' ') {
    event.preventDefault();
    togglePlay(ui.script.value);
    return;
  }
  if (event.key === '1') setCamera('audience');
  else if (event.key === '2') setCamera('cinematic');
  else if (event.key === '3') setCamera('free');
  else if (cameras.mode === 'free') cameras.setKey(event.code, true);
});

window.addEventListener('keyup', (event) => {
  cameras.setKey(event.code, false);
});

function getState() {
  const beat = director.current;
  const shown = beat || null;
  return {
    ready,
    playing: director.playing,
    paused: director.paused,
    muted: director.muted,
    camera: cameras.mode,
    sceneId: shown?.sceneId ?? null,
    sceneIndex: shown?.sceneIndex ?? 0,
    beatIndex: director.index,
    beatCount: director.playlist.length,
    beatId: shown?.id ?? null,
    speaker: shown?.speaker ?? null,
    line: shown?.line ?? null,
    emotion: shown?.emotion ?? null,
    gesture: shown?.gesture ?? null,
    characters: [...cast.actors.values()].map((actor) => ({
      id: actor.id,
      name: actor.name,
      x: actor.root.position.x,
      y: actor.root.position.y,
      z: actor.root.position.z,
      visible: Boolean(actor.visible),
      emotion: actor.emotion,
      gesture: actor.gesture,
      style: actor.styleId,
    })),
    experiments: { ...live.experiments },
    actorStyle: getActorStyle(),
    lang: live.lang,
    title: director.performance?.title || '',
    parseWarnings: [...lastWarnings],
    streaming: Boolean(director.streaming),
    pendingBeats: director.pendingCount(),
    streamEnded: Boolean(director.streamEnded),
    timeToFirstBeatMs: director.timeToFirstBeatMs,
    lastIntervention: director.lastIntervention,
    holding: Boolean(director.holding),
  };
}

const theaterApi = {
  getState,
  parse,
  load,
  play: () => director.play(),
  pause: () => director.pause(),
  stop: () => halt(),
  restart: () => director.restart(),
  nextBeat: () => director.nextBeat(),
  prevBeat: () => director.prevBeat(),
  seek: (index) => director.seek(index),
  setSpeed: (n) => director.setSpeed(n),
  setMuted: (muted) => director.setMuted(muted),
  setCamera,
  setLang,
  setExperiment,
  listExperiments: () => [...EXPERIMENT_IDS],
  setActorStyle,
  getActorStyle,
  listActorStyles,
  pasteAndPlay: async (text) => {
    await liveStart(text);
    return director.performance;
  },
  parseStream: (text, onEventOrOpts, maybeOpts) => provider.parseStream(text, onEventOrOpts, maybeOpts),
  liveStart,
  intervene: (action) => director.intervene(action),
  pushEvent: (event) => director.pushEvent(event),
  pushBeat: (beat) => director.pushBeat(beat),
  waitIdle: () => readyPromise,
};

window.__theater = theaterApi;

ui.helpOpen(helpShouldOpen());
ui.setSubtitle(null);
ui.sync();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  const motion = director.paused ? 0 : raw;
  cast.update(motion);
  audience.update(motion);
  theater.update(raw);
  cameras.update(raw);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    readyResolve();
  }
}
requestAnimationFrame(frame);
