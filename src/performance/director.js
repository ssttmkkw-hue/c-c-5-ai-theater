import { flattenBeats } from './schema.js';
import { Voice } from './voice.js';
import { WINGS, standPoint } from '../stage/layout.js';
import { live } from '../runtime/live.js';
import { hashString } from '../util/math.js';

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
    this.cast.sync(performance.characters || []);
    this.theater.setTitle(performance.title || '');
    this.theater.setCurtain(false);
    live.playing = false;
    live.speakerId = null;
    live.soliloquy = false;
    live.clapping = false;
    this.onSubtitle(null);
    this.emit();
  }

  play() {
    if (!this.playlist.length) return;
    if (this.playing && this.paused) {
      this.paused = false;
      live.playing = true;
      this.voice.resume();
      this.emit();
      if (!this.loopRunning) this.loop(this.generation);
      return;
    }
    if (this.playing && this.loopRunning) return;
    this.playing = true;
    this.paused = false;
    live.playing = true;
    if (this.index >= this.playlist.length) this.index = 0;
    this.theater.setCurtain(true);
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

  interruptTo(index) {
    this.voice.cancel();
    this.index = index;
    this.current = this.playlist[index] || null;
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
      while (this.playing && gen === this.generation && this.index < this.playlist.length) {
        const beat = this.playlist[this.index];
        const ok = await this.perform(beat, gen);
        if (gen !== this.generation || !this.playing) return;
        if (!ok) return;
        const next = this.playlist[this.index + 1];
        if (!next || next.sceneId !== beat.sceneId) {
          const held = await this.sceneBreak(!next, gen);
          if (!held || gen !== this.generation || !this.playing) return;
        }
        this.index += 1;
        this.emit();
      }
      if (gen === this.generation && this.playing) {
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

  async perform(beat, gen) {
    const actor = beat.speaker ? this.cast.get(beat.speaker) : null;
    this.current = beat;
    live.speakerId = beat.speaker || null;
    this.cameras.onBeat(this.index, actor ? { x: actor.x, z: actor.z } : null);
    this.emit();

    if (actor) {
      actor.setEmotion(beat.emotion || 'neutral');
      actor.setGesture(beat.gesture || (beat.line ? 'talk' : 'idle'));
      if (!actor.visible) {
        const side = beat.enterFrom || (hashString(actor.id) % 2 === 0 ? 'left' : 'right');
        const wing = WINGS[side] || WINGS.left;
        actor.snap(wing.x, wing.z);
        actor.yaw = side === 'right' ? -0.6 : 0.6;
        actor.prevYaw = actor.yaw;
        actor.setVisible(true);
      }
      const others = this.cast.visibleList().filter((a) => a !== actor);
      for (const other of others) other.lookRef = actor.id;
      actor.lookRef = beat.lookAt || (others.length ? others[others.length - 1].id : 'audience');
      live.soliloquy = (actor.lookRef === 'audience' || !others.length) && others.length === 0;
      if (beat.moveTo) {
        const point = standPoint(beat.moveTo);
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
      const spoken = await this.voice.speak(beat.line, actor?.voice || {}, {
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

  emit() {
    this.onChange();
  }
}
