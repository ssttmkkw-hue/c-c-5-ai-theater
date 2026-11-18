/** Shared show state. The director writes it; the stage, cast, and audience read it. */

export const EXPERIMENT_IDS = [
  'idle',
  'lookAt',
  'lips',
  'spotlight',
  'marks',
  'posture',
  'audience',
  'curtains',
];

function loadExperiments() {
  const base = {
    idle: true,
    lookAt: true,
    lips: true,
    spotlight: true,
    marks: true,
    posture: true,
    audience: true,
    curtains: true,
  };
  try {
    const raw = localStorage.getItem('ai-theater-experiments');
    if (!raw) return base;
    const saved = JSON.parse(raw);
    for (const id of EXPERIMENT_IDS) {
      if (typeof saved[id] === 'boolean') base[id] = saved[id];
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

export const live = {
  experiments: loadExperiments(),
  speed: 1,
  muted: false,
  /** Subtitle language for bundled lines that have a translation. */
  subs: 'zh',
  lang: 'zh',
  playing: false,
  /** True while a live parse may still push beats. */
  streaming: false,
  /** Actors are on stage with no cue yet. */
  holding: false,
  speakerId: null,
  speakerHead: { x: 0, y: 1.7, z: 0.4 },
  soliloquy: false,
  clapping: false,
};

export function persistExperiments() {
  try {
    localStorage.setItem('ai-theater-experiments', JSON.stringify(live.experiments));
  } catch {
    /* ignore quota / private mode */
  }
}
