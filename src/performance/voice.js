import { wordCount } from '../parse/lexicon.js';

/** Milliseconds a line should occupy when speechSynthesis is missing or muted. */
export function estimateSpeechMs(text, rate = 1) {
  const raw = String(text || '').trim();
  const cjk = (raw.match(/[\u3400-\u9fff]/g) || []).length;
  const words = wordCount(raw.replace(/[\u3400-\u9fff]/g, ' '));
  const ms = (Math.max(1, words) / 170) * 60000 + (cjk / 4.2) * 1000;
  return Math.max(700, ms / Math.max(0.45, rate));
}

export class Voice {
  constructor() {
    this.muted = false;
    this.voices = [];
    this.current = null;
    this._finish = null;
    this.available = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
    this.warm();
  }

  warm() {
    if (!this.available) return;
    try {
      const pull = () => {
        this.voices = window.speechSynthesis.getVoices() || [];
      };
      pull();
      window.speechSynthesis.addEventListener?.('voiceschanged', pull);
    } catch {
      this.available = false;
    }
  }

  pick(profile = {}) {
    const voices = this.voices || [];
    if (!voices.length) return null;
    const lang = String(profile.lang || 'en-GB').toLowerCase();
    const primary = lang.slice(0, 2);
    let pool = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(lang));
    if (!pool.length) pool = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(primary));
    if (!pool.length) pool = voices.filter((v) => /en/i.test(v.lang || ''));
    if (!pool.length) pool = voices;
    const pitch = profile.pitch ?? 1;
    const scored = [...pool].sort((a, b) => scoreVoice(a, pitch) - scoreVoice(b, pitch));
    const span = Math.max(1, Math.min(4, scored.length));
    const bucket = pitch < 0.8 ? 0 : pitch > 1.15 ? span - 1 : 1;
    return scored[Math.min(scored.length - 1, bucket)];
  }

  /**
   * Resolves true when the line has been given its time, false if aborted.
   * Never hangs: a timer always finishes the beat if the engine does not.
   */
  speak(text, profile = {}, hooks = {}) {
    this.cancel();
    const speed = Math.max(0.25, hooks.speed?.() || 1);
    const rate = Math.min(1.7, Math.max(0.55, (profile.rate || 1) * speed));
    const est = estimateSpeechMs(text, rate);
    let acc = 0;
    let utterDone = false;
    let ignoreEnd = false;
    let settled = false;
    return new Promise((resolve) => {
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        this._finish = null;
        this.current = null;
        resolve(ok);
      };
      this._finish = (ok) => {
        ignoreEnd = true;
        finish(ok);
      };
      const timer = setInterval(() => {
        if (hooks.abort?.()) {
          finish(false);
          return;
        }
        if (hooks.paused?.()) return;
        const spd = Math.max(0.25, hooks.speed?.() || speed);
        acc += 50 * spd;
        const cap = hooks.muted?.() || this.muted || !started ? est : est * 1.4 + 700;
        if (utterDone || acc >= cap) finish(true);
      }, 50);

      let started = false;
      if (this.muted || hooks.muted?.() || !this.available || !String(text || '').trim()) return;
      try {
        const utter = new SpeechSynthesisUtterance(String(text));
        utter.pitch = Math.min(2, Math.max(0.3, profile.pitch ?? 1));
        utter.rate = rate;
        utter.lang = profile.lang || 'en-GB';
        const voice = this.pick(profile);
        if (voice) utter.voice = voice;
        utter.onend = () => {
          if (!ignoreEnd) utterDone = true;
        };
        // 'canceled' / 'interrupted' / missing-voice failures are normal here.
        // The timer still advances the beat; do not rethrow.
        utter.onerror = (event) => {
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          if (!ignoreEnd) utterDone = true;
        };
        utter.onboundary = () => hooks.onBoundary?.();
        this.current = utter;
        // Chrome drops an utterance that is spoken in the same turn as cancel().
        setTimeout(() => {
          if (settled || ignoreEnd || hooks.abort?.()) return;
          try {
            window.speechSynthesis.speak(utter);
            started = true;
          } catch {
            started = false;
          }
        }, 40);
      } catch {
        started = false;
      }
    });
  }

  pause() {
    try {
      window.speechSynthesis?.pause?.();
    } catch {
      /* ignore */
    }
  }

  resume() {
    try {
      window.speechSynthesis?.resume?.();
    } catch {
      /* ignore */
    }
  }

  cancel() {
    // Only touch the engine when this Voice started an utterance.
    // A bare cancel() on an empty queue, or when the browser has no voices,
    // can surface as a console error in headless Chrome.
    if (this.current && this.available) {
      try {
        window.speechSynthesis?.cancel?.();
      } catch {
        /* ignore */
      }
    }
    if (this._finish) this._finish(false);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted && this.current) this.cancel();
  }
}

function scoreVoice(voice, pitch) {
  const name = `${voice.name || ''} ${voice.lang || ''}`.toLowerCase();
  let score = 0;
  if (/child|boy|girl/.test(name)) score += 5;
  if (pitch < 0.85 && /female|woman|samantha|victoria|moira|fiona/.test(name)) score += 3;
  if (pitch < 0.85 && /male|daniel|rishi|google uk english male|david/.test(name)) score -= 2;
  if (pitch > 1.15 && /male|daniel|david|rishi/.test(name)) score += 3;
  if (pitch > 1.15 && /female|woman|samantha|victoria/.test(name)) score -= 2;
  return score;
}
