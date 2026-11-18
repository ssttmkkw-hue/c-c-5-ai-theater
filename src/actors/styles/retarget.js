/**
 * Mixamo-style name remap. Our clips already use the theater bone names.
 * If a clip was authored with Mixamo names, rewrite the track before the mixer plays it.
 * Missing bones are left alone; the mixer skips tracks it cannot bind.
 */

const MIXAMO = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'chest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftArm: 'upperArmL',
  mixamorigLeftForeArm: 'lowerArmL',
  mixamorigLeftHand: 'handL',
  mixamorigRightArm: 'upperArmR',
  mixamorigRightForeArm: 'lowerArmR',
  mixamorigRightHand: 'handR',
  mixamorigLeftUpLeg: 'upperLegL',
  mixamorigLeftLeg: 'lowerLegL',
  mixamorigLeftFoot: 'footL',
  mixamorigRightUpLeg: 'upperLegR',
  mixamorigRightLeg: 'lowerLegR',
  mixamorigRightFoot: 'footR',
};

function bare(name) {
  return String(name || '').replace(/^mixamorig:/, 'mixamorig');
}

export function retargetClip(clip, root) {
  if (!clip || !root) return clip;
  const bones = new Set();
  root.traverse((obj) => {
    if (obj.name) bones.add(obj.name);
  });
  for (const track of clip.tracks || []) {
    const dot = track.name.indexOf('.');
    if (dot < 0) continue;
    const bone = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    const key = bare(bone);
    const mapped = MIXAMO[key] || MIXAMO[bone] || null;
    if (mapped && bones.has(mapped)) track.name = `${mapped}.${prop}`;
  }
  return clip;
}
