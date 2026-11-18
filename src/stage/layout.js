/** Stage geometry shared by the set, the parser's mark table, and the director. */

export const STAGE_Y = 0.85;

/** Stage-space marks. y is height above the stage floor (usually 0). */
export const MARKS = {
  cs: [0, 0, 0.45],
  dl: [-2.35, 0, -1.15],
  dr: [2.35, 0, -1.15],
  ul: [-2.35, 0, 2.05],
  ur: [2.35, 0, 2.05],
  sl: [-3.55, 0, 0.35],
  sr: [3.55, 0, 0.35],
};

export const MARK_IDS = Object.keys(MARKS);

export function markWorld(id) {
  const m = MARKS[id] || MARKS.cs;
  return { x: m[0], y: STAGE_Y + (m[1] || 0), z: m[2] };
}

export function standPoint(ref) {
  if (ref === 'left' || ref === 'wingL') return { x: WINGS.left.x, z: WINGS.left.z };
  if (ref === 'right' || ref === 'wingR') return { x: WINGS.right.x, z: WINGS.right.z };
  const m = MARKS[ref] || MARKS.cs;
  return { x: m[0], z: m[2] };
}

export const WINGS = {
  left: { x: -6.15, z: -1.55 },
  right: { x: 6.15, z: -1.55 },
};

/** Where a soliloquy looks: roughly the user's seat. */
export const AUDIENCE_LOOK = { x: 0.2, y: 1.25, z: -5.15 };

export const AUDIENCE_CAM = {
  pos: [0.78, 1.36, -6.2],
  look: [0.05, 1.72, 0.35],
};

/** Front-row seat for the visitor. y is the house floor. */
export const USER_SEAT = { x: 0.16, z: -5.12 };

export function lookPointForMark(id) {
  const m = markWorld(id);
  return { x: m.x, y: STAGE_Y + 1.45, z: m.z };
}
