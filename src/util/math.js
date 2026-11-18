/** Small math helpers. No allocations in the hot damp paths. */

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function damp(current, target, dt, lambda) {
  const t = 1 - Math.exp(-lambda * Math.max(0, dt));
  return current + (target - current) * t;
}

export function dampAngle(current, target, dt, lambda) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const t = 1 - Math.exp(-lambda * Math.max(0, dt));
  return current + delta * t;
}

export function hashString(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
