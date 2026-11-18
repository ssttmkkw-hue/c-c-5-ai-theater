import { live } from '../../runtime/live.js';

export const ACTOR_STYLES = ['procedural', 'gltf', 'vrm', 'paper', 'toon', 'ik'];

let cast = null;

export function bindCast(next) {
  cast = next;
}

export function listActorStyles() {
  return ACTOR_STYLES.slice();
}

export function getActorStyle() {
  return live.actorStyle || 'procedural';
}

export function loadSavedStyle() {
  try {
    const saved = localStorage.getItem('ai-theater-actor-style');
    if (ACTOR_STYLES.includes(saved)) live.actorStyle = saved;
  } catch {
    /* ignore */
  }
  return live.actorStyle;
}

export async function setActorStyle(id) {
  const next = ACTOR_STYLES.includes(id) ? id : 'procedural';
  live.actorStyle = next;
  try {
    localStorage.setItem('ai-theater-actor-style', next);
  } catch {
    /* ignore */
  }
  if (cast) await cast.applyStyle(next);
  return next;
}
