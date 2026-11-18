import { defaultMarks, flattenBeats } from './schema.js';
import { appendBeat } from './stream.js';
import { Voice } from './voice.js';
import { WINGS, standPoint } from '../stage/layout.js';
import { live } from '../runtime/live.js';
import { PALETTE } from '../parse/presets.js';
import { hashString } from '../util/math.js';

const HOLD_MS = 20000;

function nameFromId(id) {
  const raw = String(id || 'courtier').replace(/[-_]+/g, ' ').trim();
  if (!raw) return 'Courtier';
  return raw.replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

export class Director {
  constructor({ cast, theater, cameras, onSubtitle, onChange }) {
    this.cast = cast;
    this.theater = theater;
    this.cameras = cameras;
    this.onSubtitle = onSubtitle || (() => {});
    this.onChange = onChange || (() => {});
    this.voice = new Voice();
    this.performance = null;
    this.playlist = [];
    this.index = 0;
    this.current = null;
    this.playing = false;
    this.paused = false;
    this.generation = 0;
    this.loopRunning = false;
    this.speed = 1;
    this.muted = false;
    this.streaming = false;
    this.streamEnded = false;
    this.streamStartedAt = null;
    this.timeToFirstBeatMs = null;
    this.holding = false;
    this.ignoreBeats = false;
    this.angerBeats = 0;
    this.angerScene = null;
    this.lastIntervention = null;
    this.lastSceneId = null;
    this._cueWait = null;
    this._firstWait = null;
  }

  load(performance) {
    this.generation += 1;
    this.playing = false;
    this.paused = false;
    this.voice.cancel();
    this.performance = performance;
    this.playlist = flattenBeats(performance);
    this.index = 0;
    this.current = null;
    this.streaming = false;
    this.streamEnded = false;
    this.streamStartedAt = null;
    this.timeToFirstBeatMs = null;
    this.holding = false;
    this.ignoreBeats = false;
    this.angerBeats = 0;
    this.angerScene = null;
    this.lastIntervention = null;
    this.lastSceneId = null;
    this._wake(false);
    this.cast.sync(performance.characters || []);
    this.theater.setTitle(performance.title || '');
    this.theater.setCurtain(false);
    live.playing = false;
    live.streaming = false;
    live.holding = false;
    live.speakerId = null;
    live.soliloquy = false;
    live.clapping = false;
    this.onSubtitle(null);
    this.emit();
  }

  /** Open a show that will receive beats while it plays. */
  loadPartial(meta = {}) {
    this.generation += 1;
    this.playing = false;
    this.paused = false;
    this.voice.cancel();
    this.streaming = true;
    this.streamEnded = false;
    this.streamStartedAt = now();
    this.timeToFirstBeatMs = null;
    this.holding = false;
    this.ignoreBeats = false;
    this.angerBeats = 0;
    this.angerScene = null;
    this.lastIntervention = null;
    this.lastSceneId = null;
    this.index = 0;
    this.current = null;
    this.playlist = [];
    this._wake(false);
    const locale = meta.locale === 'zh' ? 'zh' : 'en';
    this.performance = {
      version: 1,
      title: String(meta.title || 'Untitled'),
      source: String(meta.source || ''),
      note: typeof meta.note === 'string' ? meta.note : '',
      locale,
      characters: [],
      marks: meta.marks || defaultMarks(),
      scenes: [],
      warnings: [],
    };
    this.cast.sync([]);
    if (Array.isArray(meta.characters)) {
      for (const character of meta.characters) this.addCharacter(character);
    }
    this.theater.setTitle(this.performance.title || '');
    this.theater.setCurtain(true);
    live.playing = false;
    live.streaming = true;
    live.holding = false;
    live.speakerId = null;
    live.soliloquy = false;
    live.clapping = false;
    this.emit();
  }

  play() {
    if (!this.playlist.length && !this.streaming) return;
    if (this.playing && this.paused) {
      this.paused = false;
      live.playing = true;
      this.voice.resume();
      this.theater.setCurtain(true);
      this.emit();
      if (!this.loopRunning) this.loop(this.generation);
      return;
    }
    if (this.playing && this.loopRunning) return;
    const alreadyLooping = this.loopRunning;
    this.playing = true;
    this.paused = false;
    live.playing = true;
    if (!this.streaming && this.playlist.length && this.index >= this.playlist.length) this.index = 0;
    this.theater.setCurtain(true);
    this.emit();
    if (alreadyLooping) return;
    this.loop(this.generation);
  }

  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    this.voice.pause();
    this.emit();
  }

  stop() {
    this.generation += 1;
    this.playing = false;
    this.paused = false;
    live.playing = false;
    this.voice.cancel();
    this.index = 0;
    this.current = null;
    this.holding = false;
    live.holding = false;
    this._wake(false);
    this.cast.reset();
    this.theater.setCurtain(false);
    live.clapping = false;
    this.onSubtitle(null);
    this.emit();
  }

  restart() {
    if (!this.playlist.length) return;
    this.playing = true;
    this.paused = false;
    live.playing = true;
    this.theater.setCurtain(true);
    this.interruptTo(0);
  }

  nextBeat() {
    if (!this.playlist.length) return;
    this.interruptTo(Math.min(this.playlist.length - 1, this.index + 1));
  }

  prevBeat() {
    if (!this.playlist.length) return;
    this.interruptTo(Math.max(0, this.index - 1));
  }

  seek(index) {
    if (!this.playlist.length) return;
    const max = this.playlist.length - 1;
    const n = Math.max(0, Math.min(max, index | 0));
    this.interruptTo(n);
  }

  setSpeed(n) {
    const speed = Number(n);
    if (!Number.isFinite(speed)) return;
    this.speed = Math.max(0.25, Math.min(2, speed));
    live.speed = this.speed;
    this.emit();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    live.muted = this.muted;
    this.voice.setMuted(this.muted);
    this.emit();
  }

  /**
   * Live directing. Working now: replay, angrier, faster, hold.
   * `ending` is a local placeholder (no model) plus a hook for a future stream.
   * @param {{ type: string, scope?: 'now'|'scene', note?: string }} action
   */
  intervene(action = {}) {
    const type = String(action.type || '');
    this.lastIntervention = { ...action, type, at: Date.now() };
    if (type === 'replay') this.replay();
    else if (type === 'angrier') this.makeAngrier(action.scope === 'scene' ? 'scene' : 'now');
    else if (type === 'faster') this.setSpeed(Math.min(2, Math.round((this.speed + 0.25) * 100) / 100));
    else if (type === 'hold' || type === 'pause') this.pause();
    else if (type === 'ending') this.placeholderEnding(action.note);
    else this.warn(`unknown-intervention:${type || 'empty'}`);
    this.emit();
    return this.lastIntervention;
  }

  replay() {
    if (!this.playlist.length) return;
    let i = this.index;
    if (i >= this.playlist.length) i = this.playlist.length - 1;
    this.playing = true;
    this.paused = false;
    live.playing = true;
    this.theater.setCurtain(true);
    this.interruptTo(i);
  }

  makeAngrier(scope) {
    if (scope === 'scene') {
      this.angerScene = this.current?.sceneId || this.playlist[this.index]?.sceneId || null;
      this.angerBeats = 1000;
    } else {
      this.angerScene = null;
      this.angerBeats = 3;
    }
    const actor = this.current?.speaker ? this.cast.get(this.current.speaker) : null;
    if (actor) {
      actor.setEmotion('angry');
      if (this.current?.line) actor.setGesture('point');
    }
    if (this.current) this.current.emotion = 'angry';
    this.voice.emphasize();
    if (this.current?.line) this.showLine(this.current, actor);
  }

  placeholderEnding(note) {
    this.ignoreBeats = true;
    this.warn('ending-placeholder');
    if (note) this.warn(`ending-note:${String(note).slice(0, 80)}`);
    this.cutUnplayed();
    for (const actor of this.cast.visibleList()) actor.holdingCue = true;
    const zh = live.lang === 'zh' || this.performance?.locale === 'zh';
    const speaker = this.current?.speaker
      || this.playlist[this.index]?.speaker
      || this.performance?.characters?.[0]?.id
      || null;
    if (speaker) this.ensureSpeaker(speaker);
    const sceneId = this.current?.sceneId || this.playlist.at(-1)?.sceneId || 'scene-1';
    const sceneName = this.current?.sceneName || this.playlist.at(-1)?.sceneName || 'Scene';
    this.onSubtitle({
      name: '',
      color: '#e2b15a',
      text: zh ? '新的结尾稍候' : 'A new ending will be written here',
      emotion: 'uncertain',
      zh,
    });
    const who = speaker;
    if (who) {
      this.pushBeat({
        sceneId,
        sceneName,
        speaker: who,
        kind: 'speech',
        line: 'A new ending will be written here.',
        lineZh: '新的结尾稍候。',
        emotion: 'uncertain',
        gesture: 'turnAway',
        lookAt: 'aside',
        pauseMs: 520,
      }, { force: true });
      this.pushBeat({
        sceneId,
        sceneName,
        speaker: who,
        kind: 'speech',
        line: 'Until then, we bow and leave the last page blank.',
        lineZh: '在那之前，我们先鞠躬，把最后一页空着。',
        emotion: 'tender',
        gesture: 'bow',
        lookAt: 'audience',
        pauseMs: 640,
      }, { force: true });
    }
    this.markStreamEnd();
  }

  pushEvent(event) {
    const ev = event || {};
    if (!this.performance && ev.type !== 'end') this.loadPartial({});
    switch (ev.type) {
      case 'meta':
        this.applyMeta(ev);
        break;
      case 'character':
        this.addCharacter(ev);
        break;
      case 'beat':
        this.pushBeat(ev);
        break;
      case 'scene-end':
        break;
      case 'end':
        this.markStreamEnd();
        break;
      case 'warning':
        this.warn(ev.message || ev.msg || '');
        break;
      default:
        if (ev.type) this.warn(`unknown-event:${ev.type}`);
        break;
    }
    this.emit();
  }

  pushBeat(raw, opts = {}) {
    if (this.ignoreBeats && !opts.force) return null;
    if (!this.performance) this.loadPartial({});
    const beat = appendBeat(this.performance, raw || {});
    if (!beat) return null;
    if (beat.speaker) this.ensureSpeaker(beat.speaker);
    const scene = (this.performance.scenes || []).find((s) => s.beats.includes(beat));
    beat.sceneId = scene?.id || raw?.sceneId || 'scene-1';
    beat.sceneName = scene?.name || raw?.sceneName || 'Scene';
    beat.sceneIndex = Math.max(0, (this.performance.scenes || []).indexOf(scene));
    beat.beatInScene = scene ? scene.beats.indexOf(beat) : 0;
    this.playlist.push(beat);
    if (this._cueWait) this._cueWait();
    else if (this.playing && !this.paused && !this.loopRunning) this.loop(this.generation);
    this.emit();
    return beat;
  }

  applyMeta(event) {
    if (!this.performance || !this.streaming) {
      this.loadPartial(event || {});
      return;
    }
    if (event.title) {
      this.performance.title = String(event.title);
      this.theater.setTitle(this.performance.title);
    }
    if (typeof event.source === 'string') this.performance.source = event.source;
    if (typeof event.note === 'string') this.performance.note = event.note;
    if (event.locale === 'zh' || event.locale === 'en') this.performance.locale = event.locale;
    if (Array.isArray(event.characters)) {
      for (const character of event.characters) this.addCharacter(character);
    }
  }

  addCharacter(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!this.performance) this.loadPartial({});
    const id = String(raw.id || raw.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `actor-${this.performance.characters.length + 1}`;
    const character = {
      id,
      name: String(raw.name || nameFromId(id)),
      aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : [],
      color: typeof raw.color === 'string' ? raw.color : PALETTE[Math.abs(hashString(id)) % PALETTE.length],
      costume: raw.costume || 'courtier',
      skin: raw.skin || '#e0b394',
      hair: raw.hair || '#2c241c',
      voice: {
        lang: raw.voice?.lang || 'en-US',
        pitch: Number.isFinite(Number(raw.voice?.pitch)) ? Number(raw.voice.pitch) : 1,
        rate: Number.isFinite(Number(raw.voice?.rate)) ? Number(raw.voice.rate) : 1,
      },
    };
    const existing = this.performance.characters.find((c) => c.id === id);
    if (!existing) {
      this.performance.characters.push(character);
      this.cast.add(character);
      return character;
    }
    const actor = this.cast.get(id);
    const richer = character.costume && character.costume !== 'courtier' && existing.costume === 'courtier';
    if (actor && !actor.visible && richer) {
      Object.assign(existing, character, { id });
      this.cast.replace(existing);
    }
    return existing;
  }

  ensureSpeaker(id) {
    if (!id) return null;
    if (this.cast.get(id)) return this.cast.get(id);
    this.warn(`unknown-speaker:${id}`);
    this.addCharacter({
      id,
      name: nameFromId(id),
      costume: 'courtier',
      color: PALETTE[Math.abs(hashString(id)) % PALETTE.length],
    });
    return this.cast.get(id);
  }

  markStreamEnd() {
    if (this.streamEnded && !this.streaming) {
      this._resolveFirst(null);
      return;
    }
    this.streamEnded = true;
    this.streaming = false;
    live.streaming = false;
    if (this._cueWait) this._cueWait();
    this._resolveFirst(null);
  }

  waitForFirstBeat() {
    if (this.timeToFirstBeatMs != null) return Promise.resolve(this.timeToFirstBeatMs);
    return new Promise((resolve) => {
      this._firstWait = resolve;
    });
  }

  pendingCount() {
    const rest = this.playlist.length - this.index;
    if (this.current && this.index < this.playlist.length && (this.playing || this.paused)) {
      return Math.max(0, rest - 1);
    }
    return Math.max(0, rest);
  }

  interruptTo(index) {
    this.voice.cancel();
    this.index = index;
    this.current = this.playlist[index] || null;
    const prev = this.playlist[index - 1];
    this.lastSceneId = prev?.sceneId || null;
    this.generation += 1;
    if (this.playing && !this.paused) {
      if (!this.loopRunning) this.loop(this.generation);
    } else {
      this.emit();
    }
  }

  async loop(gen) {
    if (this.loopRunning && gen !== this.generation) return;
    this.loopRunning = true;
    this.generation = gen;
    try {
      while (this.playing && gen === this.generation) {
        if (this.index >= this.playlist.length) {
          if (!this.streaming || this.streamEnded) break;
          const arrived = await this.holdForCue(gen);
          if (gen !== this.generation || !this.playing) return;
          if (!arrived && (this.streamEnded || !this.streaming) && this.index >= this.playlist.length) break;
          continue;
        }
        const beat = this.playlist[this.index];
        if (this.lastSceneId && beat.sceneId !== this.lastSceneId) {
          const held = await this.sceneBreak(false, gen);
          if (!held || gen !== this.generation || !this.playing) return;
        }
        this.ensureSpeaker(beat.speaker);
        const shaped = this.applyAnger(beat);
        const ok = await this.perform(shaped, gen);
        if (gen !== this.generation || !this.playing) return;
        if (!ok) return;
        this.lastSceneId = beat.sceneId;
        this.index += 1;
        this.emit();
      }
      if (gen === this.generation && this.playing && this.index >= this.playlist.length && (!this.streaming || this.streamEnded)) {
        if (this.lastSceneId) {
          const held = await this.sceneBreak(true, gen);
          if (!held || gen !== this.generation || !this.playing) return;
        }
        this.playing = false;
        this.paused = false;
        live.playing = false;
        live.speakerId = null;
        live.soliloquy = false;
        this.current = null;
        this.theater.setCurtain(false);
        this.onSubtitle(null);
        this.emit();
      }
    } catch {
      if (gen === this.generation) {
        this.playing = false;
        live.playing = false;
        live.clapping = false;
        this.emit();
      }
    } finally {
      this.loopRunning = false;
      if (this.playing && !this.paused && this.generation !== gen) {
        this.loop(this.generation);
      }
    }
  }

  applyAnger(beat) {
    if (this.angerBeats <= 0) return beat;
    if (this.angerScene && beat.sceneId !== this.angerScene) {
      this.angerBeats = 0;
      this.angerScene = null;
      return beat;
    }
    if (!this.angerScene) this.angerBeats -= 1;
    return {
      ...beat,
      emotion: 'angry',
      gesture: beat.line ? 'point' : 'raiseArm',
      emphasis: true,
    };
  }

  async perform(beat, gen) {
    this.noteFirstBeat();
    for (const actor of this.cast.actors.values()) actor.holdingCue = false;
    const actor = beat.speaker ? this.cast.get(beat.speaker) : null;
    this.current = beat;
    live.speakerId = beat.speaker || null;
    this.cameras.onBeat(this.index, actor ? { x: actor.x, z: actor.z } : null);
    this.emit();

    if (actor) {
      actor.setEmotion(beat.emotion || 'neutral');
      actor.setGesture(beat.gesture || (beat.line ? 'talk' : 'idle'));
      let enteredFrom = null;
      if (!actor.visible) {
        enteredFrom = beat.enterFrom || (hashString(actor.id) % 2 === 0 ? 'left' : 'right');
        const wing = WINGS[enteredFrom] || WINGS.left;
        actor.snap(wing.x, wing.z);
        actor.yaw = enteredFrom === 'right' ? -0.6 : 0.6;
        actor.prevYaw = actor.yaw;
        actor.setVisible(true);
      }
      const others = this.cast.visibleList().filter((a) => a !== actor);
      for (const other of others) other.lookRef = actor.id;
      actor.lookRef = beat.lookAt || (others.length ? others[others.length - 1].id : 'audience');
      live.soliloquy = (actor.lookRef === 'audience' || !others.length) && others.length === 0;
      // A line with no mark must not be spoken from the wings. Fresh entrances
      // walk to the near downstage mark before the cue.
      const move = beat.moveTo || (enteredFrom ? (enteredFrom === 'right' ? 'dr' : 'dl') : null);
      if (move) {
        const point = standPoint(move);
        const arrived = await actor.walkTo(point.x, point.z, () => gen !== this.generation || !this.playing);
        if (!arrived || gen !== this.generation || !this.playing) return false;
      }
      this.cameras.onBeat(this.index, { x: actor.x, z: actor.z });
    } else {
      live.soliloquy = false;
    }

    if (beat.line) {
      this.showLine(beat, actor);
      actor?.setTalking(true);
      const profile = { ...(actor?.voice || {}) };
      if (beat.emphasis) {
        profile.pitch = Math.min(2, (profile.pitch || 1) + 0.12);
        profile.rate = Math.min(1.6, (profile.rate || 1) + 0.1);
      }
      const spoken = await this.voice.speak(beat.line, profile, {
        speed: () => this.speed,
        muted: () => this.muted,
        paused: () => this.paused,
        abort: () => gen !== this.generation || !this.playing,
        onBoundary: () => actor?.pulseLip(),
      });
      actor?.setTalking(false);
      if (!spoken || gen !== this.generation || !this.playing) return false;
    }

    if (beat.pauseMs) {
      const held = await this.wait(beat.pauseMs, gen);
      if (!held) return false;
    }

    if (actor && beat.exitTo) {
      actor.setGesture('idle');
      const wing = WINGS[beat.exitTo] || WINGS.left;
      const left = await actor.walkTo(wing.x, wing.z, () => gen !== this.generation || !this.playing);
      if (!left || gen !== this.generation || !this.playing) return false;
      actor.setVisible(false);
      if (live.speakerId === actor.id) live.speakerId = null;
    }
    return gen === this.generation && this.playing;
  }

  async sceneBreak(isLast, gen) {
    if (live.experiments.audience) live.clapping = true;
    const held = await this.wait(isLast ? 1700 : 1100, gen);
    live.clapping = false;
    return held;
  }

  holdForCue(gen) {
    if (gen !== this.generation || !this.playing) return Promise.resolve(false);
    if (this.index < this.playlist.length) return Promise.resolve(true);
    if (!this.streaming || this.streamEnded) return Promise.resolve(false);
    this.setHolding(true);
    return new Promise((resolve) => {
      let settled = false;
      let acc = 0;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        this._cueWait = null;
        this.setHolding(false);
        resolve(ok);
      };
      const timer = setInterval(() => {
        if (gen !== this.generation || !this.playing) {
          finish(false);
          return;
        }
        if (this.index < this.playlist.length) {
          finish(true);
          return;
        }
        if (this.streamEnded || !this.streaming) {
          finish(false);
          return;
        }
        if (this.paused) return;
        acc += 40 * Math.max(0.25, this.speed || 1);
        if (acc >= HOLD_MS) {
          this.warn('stream-timeout');
          this.streamEnded = true;
          this.streaming = false;
          live.streaming = false;
          finish(false);
        }
      }, 40);
      this._cueWait = () => finish(this.index < this.playlist.length || !this.streamEnded);
    });
  }

  setHolding(on) {
    this.holding = Boolean(on);
    live.holding = this.holding;
    for (const actor of this.cast.actors.values()) {
      if (!actor.visible) continue;
      actor.holdingCue = this.holding;
      if (this.holding) actor.setGesture('idle');
    }
  }

  wait(ms, gen) {
    let acc = 0;
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (gen !== this.generation || !this.playing) {
          clearInterval(timer);
          resolve(false);
          return;
        }
        if (this.paused) return;
        acc += 40 * this.speed;
        if (acc >= ms) {
          clearInterval(timer);
          resolve(true);
        }
      }, 40);
    });
  }

  showLine(beat, actor) {
    const useZh = live.subs === 'zh' && beat.lineZh;
    this.onSubtitle({
      name: actor?.name || beat.speaker || '',
      color: actor?.color || '#f0d48a',
      text: useZh ? beat.lineZh : beat.line,
      emotion: beat.emotion || '',
      zh: Boolean(useZh),
    });
  }

  warn(message) {
    if (!message || !this.performance) return;
    if (!Array.isArray(this.performance.warnings)) this.performance.warnings = [];
    if (!this.performance.warnings.includes(message)) this.performance.warnings.push(message);
  }

  noteFirstBeat() {
    if (this.timeToFirstBeatMs != null || this.streamStartedAt == null) return;
    this.timeToFirstBeatMs = Math.max(0, Math.round(now() - this.streamStartedAt));
    this._resolveFirst(this.timeToFirstBeatMs);
  }

  _resolveFirst(value) {
    if (this.timeToFirstBeatMs != null && value == null) return;
    const fn = this._firstWait;
    this._firstWait = null;
    if (fn) fn(this.timeToFirstBeatMs != null ? this.timeToFirstBeatMs : value);
  }

  _wake(ok) {
    const fn = this._cueWait;
    this._cueWait = null;
    if (fn) fn(ok);
  }

  cutUnplayed() {
    const keep = this.index < this.playlist.length ? this.index + 1 : this.playlist.length;
    const kept = new Set(this.playlist.slice(0, keep).map((b) => b.id));
    this.playlist.length = keep;
    for (const scene of this.performance?.scenes || []) {
      scene.beats = (scene.beats || []).filter((b) => kept.has(b.id));
    }
  }

  emit() {
    live.streaming = this.streaming;
    live.holding = this.holding;
    this.onChange();
  }
}

function now() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now());
}
