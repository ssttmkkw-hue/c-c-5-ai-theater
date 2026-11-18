import * as THREE from 'three';
import { createRig } from './rig.js';
import { STAGE_Y } from '../stage/layout.js';
import { GESTURES } from '../parse/lexicon.js';
import { live } from '../runtime/live.js';
import { clamp, damp, dampAngle, hashString } from '../util/math.js';

const KNOWN = new Set(GESTURES);
const NAMES = [
  'pelvis', 'spine', 'chest', 'neck', 'head', 'jaw',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR',
];

const _head = new THREE.Vector3();

export class Actor {
  constructor(character) {
    this.id = character.id;
    this.name = character.name;
    this.color = character.color;
    this.voice = character.voice;
    this.costume = character.costume;
    this.emotion = 'neutral';
    this.gesture = 'idle';
    this.gestureBlend = 1;
    this.gestureAge = 0;
    this.talking = false;
    this.visible = false;
    this.lookRef = 'audience';
    this.look = { x: 0, y: 1.4, z: -5 };
    this.x = 0;
    this.z = 0;
    this.baseY = STAGE_Y;
    this.yaw = 0;
    this.prevYaw = 0;
    this.headLag = 0;
    this.glance = 0;
    this.glanceV = 0;
    this.glancing = false;
    this.holdingCue = false;
    this.gTime = 1 + (hashString(character.id) % 20) / 10;
    this.drop = 0;
    this.paceX = 0;
    this.pacePhase = 0;
    this.walkPhase = 0;
    this.walkAmp = 0;
    this.walking = false;
    this.goal = null;
    this._abort = null;
    this._arrive = null;
    this.lipPulse = 0;
    this.syllable = 0;
    this.blinkAcc = (hashString(character.id) % 10) / 5;
    this.blinkWave = 0;
    this.nextBlink = 2;
    this.seed = hashString(character.id);
    this.t = this.seed % 10;
    this.acc = {};
    for (const n of NAMES) this.acc[n] = { x: 0, y: 0, z: 0 };

    const rig = createRig(character);
    this.root = rig.root;
    this.joints = rig.joints;
    this.sword = rig.sword;
    this.lidL = rig.lidL;
    this.lidR = rig.lidR;
    this.mouth = rig.mouth;
    this.root.visible = false;
  }

  dispose() {
    if (this._arrive) this._finishWalk(false);
    this.root.parent?.remove(this.root);
    const seen = new Set();
    this.root.traverse((obj) => {
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      for (const m of mats) {
        if (m && !seen.has(m)) {
          seen.add(m);
          m.dispose?.();
        }
      }
    });
  }

  setVisible(v) {
    this.visible = v;
    this.root.visible = v;
  }

  snap(x, z) {
    this.x = x;
    this.z = z;
    this.walking = false;
    this.goal = null;
    this.root.position.x = x;
    this.root.position.z = z;
    this.root.position.y = this.baseY;
    if (this._arrive) this._finishWalk(false);
  }

  walkTo(x, z, abort) {
    this._abort = abort || (() => false);
    const dist = Math.hypot(x - this.x, z - this.z);
    if (dist < 0.06) {
      this.x = x;
      this.z = z;
      this.walking = false;
      return Promise.resolve(!this._abort());
    }
    this.goal = { x, z };
    this.walking = true;
    if (this._arrive) this._arrive(false);
    return new Promise((resolve) => {
      this._arrive = resolve;
    });
  }

  _finishWalk(ok) {
    this.walking = false;
    this.goal = null;
    const fn = this._arrive;
    this._arrive = null;
    if (fn) fn(ok);
  }

  setEmotion(name) {
    this.emotion = name || 'neutral';
  }

  setGesture(name) {
    const next = KNOWN.has(name) ? name : 'talk';
    if (next === this.gesture) return;
    this.gesture = next;
    this.gestureBlend = 0;
    this.gestureAge = 0;
  }

  setTalking(v) {
    this.talking = Boolean(v);
  }

  pulseLip() {
    this.lipPulse = 1;
  }

  setLook(point) {
    if (!point) return;
    this.look.x = point.x;
    this.look.y = point.y;
    this.look.z = point.z;
  }

  headWorld(target = _head) {
    this.joints.head.getWorldPosition(target);
    return target;
  }

  update(dt) {
    if (!this.visible) return;
    const speed = Math.max(0.25, live.speed || 1);
    this.t += dt;

    if (this.walking && this.goal) {
      if (this._abort && this._abort()) {
        this._finishWalk(false);
      } else {
        const dx = this.goal.x - this.x;
        const dz = this.goal.z - this.z;
        const dist = Math.hypot(dx, dz);
        const step = 2.55 * speed * dt;
        if (dist <= step || dist < 0.05) {
          this.x = this.goal.x;
          this.z = this.goal.z;
          this.walkPhase += dist * 6.2;
          this._finishWalk(true);
        } else {
          this.x += (dx / dist) * step;
          this.z += (dz / dist) * step;
          this.walkPhase += step * 6.2;
          this._faceX = dx;
          this._faceZ = dz;
        }
      }
    }

    const pacing = this.gesture === 'pace' && !this.walking;
    if (pacing) {
      this.pacePhase += dt * 2.5 * speed;
      this.walkPhase += dt * 6.5 * speed;
      this.paceX = Math.sin(this.pacePhase) * 0.42 * Math.max(this.gestureBlend, 0.2);
    } else {
      this.paceX = damp(this.paceX, 0, dt, 6);
    }
    const stepping = this.walking || pacing;
    this.walkAmp = damp(this.walkAmp, stepping ? 1 : 0, dt, stepping ? 7 : 8);

    this.gestureBlend = damp(this.gestureBlend, 1, dt, 5.5);
    this.gestureAge += dt;
    const kneeling = this.gesture === 'kneel' && !this.walking;
    this.drop = damp(this.drop, kneeling ? -0.46 : 0, dt, 5);
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.035 * this.walkAmp;

    let targetYaw = this.yaw;
    if (this.walking && this._faceX != null) {
      targetYaw = Math.atan2(this._faceX, -this._faceZ);
    } else {
      const dx = this.look.x - this.x;
      const dz = this.look.z - this.z;
      if (Math.hypot(dx, dz) > 0.12) targetYaw = Math.atan2(dx, -dz);
    }
    if (this.gesture === 'turnAway') targetYaw += Math.PI * 0.82;
    this.yaw = dampAngle(this.yaw, targetYaw, dt, this.walking ? 7 : 3.2);
    const turned = wrap(this.yaw - this.prevYaw);
    this.prevYaw = this.yaw;
    if (live.experiments.lookAt) {
      this.headLag -= turned;
      this.headLag = damp(this.headLag, 0, dt, 2.3);
      this.gTime -= dt;
      if (this.gTime <= 0) {
        if (this.glancing) {
          this.glance = 0;
          this.glancing = false;
          this.gTime = 2.4 + (this.seed % 13) / 5;
        } else {
          this.glance = ((this.seed + Math.floor(this.t * 10)) % 2 === 0 ? -1 : 1) * 0.38;
          this.glancing = true;
          this.gTime = 0.45;
        }
      }
      if (this.holdingCue) {
        this.glance = this.x >= 0 ? 0.72 : -0.72;
        this.glancing = true;
      }
      this.glanceV = damp(this.glanceV, this.glance, dt, 4);
    } else {
      this.headLag = damp(this.headLag, 0, dt, 8);
      if (this.holdingCue) this.glance = this.x >= 0 ? 0.72 : -0.72;
      this.glanceV = damp(this.glanceV, this.holdingCue ? this.glance : 0, dt, 8);
    }

    for (const n of NAMES) {
      const a = this.acc[n];
      a.x = 0;
      a.y = 0;
      a.z = 0;
    }
    this.applyWalk();
    this.applyGesture();
    if (live.experiments.posture) this.applyPosture();
    if (live.experiments.idle && !this.walking) this.applyIdle();

    const head = this.acc.head;
    head.y += clamp(this.headLag + this.glanceV, -0.85, 0.85);

    for (const n of NAMES) {
      const j = this.joints[n];
      if (!j) continue;
      const a = this.acc[n];
      j.rotation.set(a.x, a.y, a.z);
    }

    if (this.talking && live.experiments.lips) {
      this.syllable += dt * (9 + this.lipPulse * 8) * speed;
      this.lipPulse = Math.max(0, this.lipPulse - dt * 2.5);
      const open = Math.abs(Math.sin(this.syllable));
      this.joints.jaw.rotation.x += open * 0.45;
      this.mouth.scale.y = 0.7 + open * 2.1;
      this.joints.head.rotation.x += open * 0.035;
    } else {
      this.mouth.scale.y = damp(this.mouth.scale.y, 1, dt, 8);
    }

    if (live.experiments.idle) {
      this.blinkAcc += dt;
      if (this.blinkAcc > this.nextBlink) {
        this.blinkWave += dt * 13;
        if (this.blinkWave >= Math.PI) {
          this.blinkWave = 0;
          this.blinkAcc = 0;
          this.nextBlink = 1.8 + (this.seed % 9) / 3;
        }
      }
      const shut = this.blinkWave > 0 ? Math.sin(this.blinkWave) : 0;
      const y = 0.12 + shut * 1.05;
      this.lidL.scale.y = y;
      this.lidR.scale.y = y;
    } else {
      this.lidL.scale.y = 0.12;
      this.lidR.scale.y = 0.12;
    }

    this.sword.visible = this.gesture === 'drawSword' && this.gestureBlend > 0.35;

    const idleSway = live.experiments.idle && !this.walking ? Math.sin(this.t * 0.8 + this.seed) * 0.02 : 0;
    this.root.position.set(this.x + this.paceX, this.baseY + this.drop + bob, this.z);
    this.root.rotation.y = this.yaw;
    this.root.rotation.z = idleSway;
  }

  add(name, x = 0, y = 0, z = 0) {
    const a = this.acc[name];
    if (!a) return;
    a.x += x;
    a.y += y;
    a.z += z;
  }

  applyWalk() {
    const s = Math.sin(this.walkPhase) * this.walkAmp;
    this.add('hipL', s * 0.72, 0, 0);
    this.add('hipR', -s * 0.72, 0, 0);
    this.add('kneeL', Math.max(0, -s) * 1.05, 0, 0);
    this.add('kneeR', Math.max(0, s) * 1.05, 0, 0);
    this.add('ankleL', Math.max(0, s) * 0.2, 0, 0);
    this.add('ankleR', Math.max(0, -s) * 0.2, 0, 0);
    const arms = this.gesture === 'idle' || this.gesture === 'talk' || this.gesture === 'pace' ? 1 : 0.25;
    this.add('shoulderL', -s * 0.45 * arms, 0, 0);
    this.add('shoulderR', s * 0.45 * arms, 0, 0);
    this.add('elbowL', Math.abs(s) * 0.25 * arms, 0, 0);
    this.add('elbowR', Math.abs(s) * 0.25 * arms, 0, 0);
  }

  applyGesture() {
    const b = this.gestureBlend;
    const g = this.gesture;
    const age = this.gestureAge;
    if (g === 'point') {
      this.add('shoulderR', 1.22 * b, -0.25 * b, -0.15 * b);
      this.add('elbowR', 0.28 * b, 0, 0);
    } else if (g === 'handsOnChest') {
      this.add('shoulderL', 0.95 * b, 0, 0.55 * b);
      this.add('elbowL', 1.25 * b, 0, 0);
      this.add('shoulderR', 0.95 * b, 0, -0.55 * b);
      this.add('elbowR', 1.25 * b, 0, 0);
    } else if (g === 'raiseArm') {
      this.add('shoulderR', 2.35 * b, -0.15 * b, -0.2 * b);
      this.add('elbowR', 0.15 * b, 0, 0);
    } else if (g === 'kneel') {
      this.add('hipL', -0.55 * b, 0, 0);
      this.add('hipR', -0.55 * b, 0, 0);
      this.add('kneeL', 1.55 * b, 0, 0);
      this.add('kneeR', 1.55 * b, 0, 0);
      this.add('chest', 0.2 * b, 0, 0);
      this.add('head', 0.2 * b, 0, 0);
    } else if (g === 'bow') {
      this.add('chest', 0.95 * b, 0, 0);
      this.add('head', 0.4 * b, 0, 0);
      this.add('shoulderL', 0.3 * b, 0, 0);
      this.add('shoulderR', 0.3 * b, 0, 0);
    } else if (g === 'weep') {
      this.add('shoulderL', 1.15 * b, 0, 0.35 * b);
      this.add('elbowL', 1.45 * b, 0, 0);
      this.add('shoulderR', 1.15 * b, 0, -0.35 * b);
      this.add('elbowR', 1.45 * b, 0, 0);
      this.add('head', 0.45 * b, 0, 0);
    } else if (g === 'give' || g === 'take') {
      this.add('shoulderR', 1.05 * b, -0.45 * b, -0.1 * b);
      this.add('elbowR', 0.4 * b, 0, 0);
    } else if (g === 'drawSword') {
      const strike = Math.min(1, age * 1.4);
      this.add('shoulderR', (0.4 + strike * 1.15) * b, -0.35 * b, -0.25 * b);
      this.add('elbowR', 0.45 * b, 0, 0);
    } else if (g === 'shrug') {
      const pop = Math.sin(Math.min(age * 5, Math.PI));
      this.add('shoulderL', 0.15 * b, 0, -0.45 * b * pop);
      this.add('shoulderR', 0.15 * b, 0, 0.45 * b * pop);
      this.add('head', 0, 0, 0.12 * b);
    } else if (g === 'nod') {
      this.add('head', Math.sin(age * 6) * 0.28 * b, 0, 0);
    } else if (g === 'shakeHead') {
      this.add('head', 0, Math.sin(age * 8) * 0.4 * b, 0);
    } else if (g === 'talk' || (this.talking && g === 'idle')) {
      const s = Math.sin(this.t * 7);
      this.add('shoulderR', (0.42 + s * 0.12) * b, -0.1 * b, 0);
      this.add('elbowR', (0.35 + Math.abs(s) * 0.15) * b, 0, 0);
    }
    if (this.talking && g !== 'talk' && g !== 'idle' && g !== 'weep' && g !== 'kneel') {
      this.add('shoulderL', Math.sin(this.t * 6) * 0.06, 0, 0);
    }
  }

  applyPosture() {
    const e = this.emotion;
    if (e === 'contemplative') {
      this.add('head', 0.28, 0, 0.05);
      this.add('spine', 0.06, 0, 0);
    } else if (e === 'angry') {
      this.add('chest', 0.22, 0, 0);
      this.add('head', -0.12, 0, 0);
      this.add('shoulderL', 0, 0, 0.18);
      this.add('shoulderR', 0, 0, -0.18);
    } else if (e === 'fearful') {
      this.add('chest', -0.16, 0, 0);
      this.add('head', -0.08, 0, 0.12);
      this.add('shoulderL', 0.15, 0, -0.2);
      this.add('shoulderR', 0.15, 0, 0.2);
    } else if (e === 'sad') {
      this.add('head', 0.32, 0, 0);
      this.add('spine', 0.1, 0, 0);
      this.add('shoulderL', 0.12, 0, 0);
      this.add('shoulderR', 0.12, 0, 0);
    } else if (e === 'tender') {
      this.add('head', 0.08, 0, 0.14);
      this.add('chest', 0.06, 0, 0);
    } else if (e === 'proud') {
      this.add('chest', -0.16, 0, 0);
      this.add('head', -0.12, 0, 0);
    } else if (e === 'haunted') {
      this.add('head', 0.06, 0, Math.sin(this.t * 0.7) * 0.1 + 0.08);
      this.add('chest', 0.08, 0, 0);
    } else if (e === 'uncertain' || e === 'curious') {
      this.add('head', -0.04, 0, 0.2);
    } else if (e === 'emphatic') {
      this.add('chest', 0.12, 0, 0);
    } else if (e === 'joyful') {
      this.add('head', -0.08, 0, 0.06);
    }
  }

  applyIdle() {
    const s = Math.sin(this.t * 1.7 + this.seed);
    this.add('spine', s * 0.025, 0, 0);
    this.add('chest', s * 0.02, 0, 0);
    this.add('head', Math.sin(this.t * 0.6 + this.seed) * 0.03, Math.sin(this.t * 0.37) * 0.04, 0);
    if (this.holdingCue) this.add('chest', Math.sin(this.t * 1.3) * 0.04, 0, 0);
  }
}

function wrap(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}
