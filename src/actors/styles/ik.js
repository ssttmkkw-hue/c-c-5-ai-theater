import * as THREE from 'three';
import { live } from '../../runtime/live.js';

const LU = 0.24;
const LF = 0.22;
const _world = new THREE.Vector3();
const _local = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _side = new THREE.Vector3();
const _from = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

function raw(gesture, amp) {
  const lift = 0.12 + (amp || 0) * 0.28;
  switch (gesture) {
    case 'point':
      return { R: [0.18, 1.5, -0.62] };
    case 'give':
    case 'take':
      return { R: [0.04, 1.16, -0.55] };
    case 'handsOnChest':
      return { L: [-0.1, 1.34, -0.2], R: [0.1, 1.34, -0.2] };
    case 'raiseArm':
      return { R: [0.2, 1.95, -0.1] };
    case 'weep':
      return { L: [-0.07, 1.55, -0.16], R: [0.07, 1.55, -0.16] };
    case 'kneel':
      return { L: [-0.16, 0.7, -0.18], R: [0.16, 0.7, -0.18] };
    case 'bow':
      return { L: [-0.18, 0.92, -0.32], R: [0.18, 0.92, -0.32] };
    case 'talk':
      return { R: [0.26, 1.12 + lift, -0.34] };
    case 'shrug':
      return { L: [-0.34, 1.38, 0.02], R: [0.34, 1.38, 0.02] };
    default:
      return null;
  }
}

function blendTargets(actor) {
  const cur = raw(actor.gesture, actor.talkAmp) || {};
  const prev = raw(actor.prevGesture, actor.prevTalkAmp) || {};
  const w = actor.gestureBlend;
  const names = new Set([...Object.keys(cur), ...Object.keys(prev)]);
  const out = {};
  for (const side of names) {
    const a = cur[side];
    const p = prev[side];
    if (a && p) out[side] = a.map((v, i) => p[i] * (1 - w) + v * w);
    else if (a) out[side] = a.slice();
    else if (p) {
      const rest = side === 'L' ? [-0.24, 0.78, 0.04] : [0.24, 0.78, 0.04];
      out[side] = p.map((v, i) => rest[i] * w + v * (1 - w));
    }
  }
  if (actor.talking && !out.R && actor.gesture !== 'weep' && actor.gesture !== 'kneel' && actor.gesture !== 'bow') {
    out.R = raw('talk', actor.talkAmp).R;
  }
  return out;
}

function reach(actor, side, xyz) {
  const shoulder = actor.joints[`shoulder${side}`];
  const elbow = actor.joints[`elbow${side}`];
  const wrist = actor.joints[`wrist${side}`];
  if (!shoulder || !elbow || !shoulder.parent) return;
  const parent = shoulder.parent;
  parent.updateWorldMatrix(true, false);
  _inv.copy(parent.matrixWorld).invert();
  _world.set(xyz[0], xyz[1], xyz[2]);
  actor.root.localToWorld(_world);
  _local.copy(_world).applyMatrix4(_inv);
  _local.x -= shoulder.position.x;
  _local.y -= shoulder.position.y;
  _local.z -= shoulder.position.z;
  let dist = _local.length();
  const max = LU + LF - 0.02;
  const min = Math.abs(LU - LF) + 0.02;
  if (dist < 1e-4) return;
  dist = Math.max(min, Math.min(max, dist));
  _aim.copy(_local).normalize();
  const cosG = (LU * LU + dist * dist - LF * LF) / (2 * LU * dist);
  const gamma = Math.acos(Math.max(-1, Math.min(1, cosG)));
  const cosB = (LU * LU + LF * LF - dist * dist) / (2 * LU * LF);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosB)));
  _pole.set(side === 'L' ? -0.35 : 0.35, -0.2, -1).normalize();
  _bend.crossVectors(_aim, _pole);
  if (_bend.lengthSq() < 1e-8) _bend.set(1, 0, 0);
  _bend.normalize();
  _side.crossVectors(_bend, _aim).normalize();
  let best = null;
  for (const sign of [1, -1]) {
    const dir = _aim.clone().multiplyScalar(Math.cos(gamma)).addScaledVector(_side, Math.sin(gamma) * sign).normalize();
    _q.setFromUnitVectors(_from, dir);
    const score = -_side.z * sign;
    if (!best || score > best.score) best = { q: _q.clone(), score };
  }
  shoulder.quaternion.copy(best.q);
  elbow.rotation.set(beta, 0, 0);
  if (wrist) wrist.rotation.set(0, 0, 0);
}

function plant(actor) {
  const phase = actor.walkPhase;
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    const swing = Math.max(0, sign * Math.sin(phase));
    const ankle = actor.joints[`ankle${side}`];
    const knee = actor.joints[`knee${side}`];
    if (!ankle || !knee) continue;
    ankle.rotation.x += -knee.rotation.x * (1 - swing) * 0.75;
  }
}

function debug(actor, targets) {
  if (!actor._ikDebug) {
    const group = new THREE.Group();
    group.name = 'ik-debug';
    const geo = new THREE.SphereGeometry(0.045, 8, 8);
    geo.userData.owned = true;
    const mat = new THREE.MeshBasicMaterial({ color: '#ff4fa3' });
    group.userData.geo = geo;
    group.userData.mat = mat;
    actor.root.add(group);
    actor._ikDebug = group;
  }
  const show = live.experiments.ikTargets;
  actor._ikDebug.visible = show;
  if (!show) return;
  const list = Object.values(targets);
  while (actor._ikDebug.children.length < list.length) {
    actor._ikDebug.add(new THREE.Mesh(actor._ikDebug.userData.geo, actor._ikDebug.userData.mat));
  }
  actor._ikDebug.children.forEach((mesh, i) => {
    mesh.visible = i < list.length;
    if (!mesh.visible) return;
    mesh.position.set(list[i][0], list[i][1], list[i][2]);
  });
}

/** Two-bone arms, a planted ankle, and a little spine follow. Safe if a joint is missing. */
export function solveIk(actor) {
  const rel = actor.lookRel || 0;
  if (actor.joints.chest) actor.joints.chest.rotation.y += Math.max(-0.45, Math.min(0.45, rel * 0.38));
  if (actor.joints.spine) actor.joints.spine.rotation.y += Math.max(-0.28, Math.min(0.28, rel * 0.18));
  const targets = blendTargets(actor);
  for (const side of ['L', 'R']) {
    if (targets[side]) reach(actor, side, targets[side]);
  }
  if (actor.walkAmp > 0.15) plant(actor);
  debug(actor, targets);
}
