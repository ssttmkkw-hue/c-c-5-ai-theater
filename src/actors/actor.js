import * as THREE from 'three';
import { createRig } from './rig.js';
import { createPaperRig } from './styles/paper.js';
import { solveIk } from './styles/ik.js';
import { STAGE_Y } from '../stage/layout.js';
import { GESTURES } from '../parse/lexicon.js';
import { live } from '../runtime/live.js';
import { clamp, damp, dampAngle, hashString } from '../util/math.js';

const KNOWN = new Set(GESTURES);
const NAMES = [
  'pelvis', 'spine', 'chest', 'neck', 'head', 'jaw', 'browL', 'browR',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR',
];

const _head = new THREE.Vector3();

const SYNC_STYLES = new Set(['procedural', 'paper', 'toon', 'ik']);

function syncBody(style, character) {
  if (style === 'paper') return createPaperRig(character);
  if (style === 'toon') return { ...createRig(character, { toon: true }), styleId: 'toon', ik: false, clip: null };
  if (style === 'ik') return { ...createRig(character), styleId: 'ik', ik: true, clip: null };
  return { ...createRig(character), styleId: 'procedural', ik: false, clip: null };
}

function disposeTree(root) {
  if (!root) return;
  const seen = new Set();
  const geos = new Set();
  root.traverse((obj) => {
    if (obj.geometry?.userData?.owned && !geos.has(obj.geometry)) {
      geos.add(obj.geometry);
      obj.geometry.dispose();
    }
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const m of mats) {
      if (!m || seen.has(m) || m.userData?.shared) continue;
      seen.add(m);
      if (m.map?.userData?.owned) m.map.dispose();
      m.dispose?.();
    }
  });
}

export class Actor {
  constructor(character, options = {}) {
    this.id = character.id;
    this.name = character.name;
    this.color = character.color;
    this.voice = character.voice;
    this.costume = character.costume;
    this.emotion = 'neutral';
    this.gesture = 'idle';
    this.gestureBlend = 1;
    this.gestureAge = 0;
    this.prevGesture = 'idle';
    this.prevBlend = 0;
    this.prevAge = 0;
    this.prevTalkAmp = 0;
    this.talkAmp = 0;
    this.talkTarget = 0;
    this.talkClock = 0.4 + (hashString(character.id) % 7) / 10;
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
    this.lookRel = 0;
    this.lookPitch = 0;
    this.eyeX = 0;
    this.eyeY = 0;
    this.saccX = 0;
    this.saccY = 0;
    this.saccT = 0.4;
    this.browLift = 0;
    this.browTilt = 0;
    this._walkEase = 1;
    this.blinkAcc = (hashString(character.id) % 10) / 5;
    this.blinkWave = 0;
    this.nextBlink = 2;
    this._neutralAt = 0;
    this._holdBody = false;
    this.seed = hashString(character.id);
    this.t = this.seed % 10;
    this.acc = {};
    for (const n of NAMES) this.acc[n] = { x: 0, y: 0, z: 0 };

    this._character = character;
    this._styleGen = 0;
    this.styleId = 'procedural';
    this.clipDriver = null;
    this.ik = false;
    this.joints = {};
    const initial = options.style && SYNC_STYLES.has(options.style) ? options.style : 'procedural';
    this._adopt(syncBody(initial, character));
    this.root.visible = false;
    if (!options.defer && live.actorStyle && live.actorStyle !== initial) {
      void this.applyStyle(live.actorStyle);
    }
  }

  _adopt(built) {
    const parent = this.root?.parent || null;
    const visible = this.visible;
    if (this.root) {
      parent?.remove(this.root);
      this.clipDriver?.dispose?.();
      disposeTree(this.root);
    }
    this.root = built.root;
    this.joints = built.joints || {};
    this.sword = built.sword || null;
    this.lidL = built.lidL || null;
    this.lidR = built.lidR || null;
    this.mouth = built.mouth || null;
    this.pupilL = built.pupilL || null;
    this.pupilR = built.pupilR || null;
    this.clipDriver = built.clip || null;
    this.ik = Boolean(built.ik);
    this.styleId = built.styleId || 'procedural';
    if (this._holdBody && (this.styleId !== 'procedural' || this._styleFailed)) this._holdBody = false;
    this._styleFailed = false;
    this.root.visible = Boolean(visible) && !this._holdBody;
    this.root.position.set(this.x, this.baseY + this.drop, this.z);
    this.root.rotation.y = this.yaw;
    if (parent) parent.add(this.root);
  }

  async applyStyle(style) {
    const next = SYNC_STYLES.has(style) || style === 'gltf' || style === 'vrm' ? style : 'procedural';
    const gen = ++this._styleGen;
    if ((next === 'gltf' || next === 'vrm') && this.styleId === 'procedural') {
      this._holdBody = true;
      this.root.visible = false;
    }
    try {
      if (next === 'gltf') {
        const { createGltfBody } = await import('./styles/gltf.js');
        const built = await createGltfBody(this._character);
        if (gen !== this._styleGen) {
          disposeTree(built.root);
          return;
        }
        this._adopt(built);
        return;
      }
      if (next === 'vrm') {
        const { createVrmBody } = await import('./styles/vrm.js');
        const built = await createVrmBody(this._character);
        if (gen !== this._styleGen) {
          disposeTree(built.root);
          return;
        }
        this._adopt(built);
        return;
      }
      if (gen !== this._styleGen) return;
      this._adopt(syncBody(next, this._character));
    } catch (error) {
      console.warn(`actor style ${next} failed`, error);
      if (gen === this._styleGen && next !== 'procedural') {
        this._styleFailed = true;
        this._adopt(syncBody('procedural', this._character));
      }
    }
  }

  dispose() {
    if (this._arrive) this._finishWalk(false);
    this._styleGen += 1;
    this.clipDriver?.dispose?.();
    this.clipDriver = null;
    this.root.parent?.remove(this.root);
    disposeTree(this.root);
  }

  setVisible(v) {
    this.visible = v;
    this.root.visible = Boolean(v) && !this._holdBody;
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
    this._walkEase = 0;
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
    this._neutralAt = 0;
  }

  setGesture(name) {
    const next = KNOWN.has(name) ? name : 'talk';
    if (next === this.gesture) return;
    this.prevGesture = this.gesture;
    this.prevBlend = this.gestureBlend;
    this.prevAge = this.gestureAge;
    this.prevTalkAmp = this.talkAmp;
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
    const head = this.clipDriver?.head || this.joints?.head;
    if (head?.getWorldPosition) {
      head.getWorldPosition(target);
      return target;
    }
    target.set(this.x, this.baseY + 1.55, this.z);
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
        this._walkEase = Math.min(1, this._walkEase + dt / 0.2);
        const arrive = dist < 0.55 ? Math.max(0.32, dist / 0.55) : 1;
        const step = 2.55 * speed * this._walkEase * arrive * dt;
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
    if (this._neutralAt && this.t >= this._neutralAt && this.gesture === 'listen') {
      this.emotion = 'neutral';
      this._neutralAt = 0;
    }
    this.tickBlink(dt);
    const kneeling = this.gesture === 'kneel' && !this.walking;
    this.drop = damp(this.drop, kneeling ? -0.46 : 0, dt, 5);
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.035 * this.walkAmp;

    let targetYaw = this.yaw;
    const lookDx = this.look.x - this.x;
    const lookDz = this.look.z - this.z;
    const lookDist = Math.hypot(lookDx, lookDz);
    if (this.walking && this._faceX != null) {
      targetYaw = Math.atan2(this._faceX, -this._faceZ);
    } else if (lookDist > 0.12) {
      targetYaw = Math.atan2(lookDx, -lookDz);
    }
    if (this.gesture === 'turnAway') targetYaw += Math.PI * 0.82;
    const yawGap = Math.abs(wrap(targetYaw - this.yaw));
    const yawRate = this.walking ? 7 : (yawGap > 0.65 ? 2.4 : 0.75);
    this.yaw = dampAngle(this.yaw, targetYaw, dt, yawRate);
    this.lookRel = wrap(targetYaw - this.yaw);
    this.lookPitch = Math.atan2(this.look.y - (this.baseY + 1.55), Math.max(0.25, lookDist));
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

    if (this.clipDriver) {
      if (this.talking && live.experiments.lips) {
        this.syllable += dt * (9 + this.lipPulse * 8) * speed;
        this.lipPulse = Math.max(0, this.lipPulse - dt * 2.5);
      }
      const idleSway = live.experiments.idle && !this.walking ? Math.sin(this.t * 0.8 + this.seed) * 0.02 : 0;
      this.root.position.set(this.x + this.paceX, this.baseY + this.drop + bob, this.z);
      this.root.rotation.y = this.yaw;
      this.root.rotation.z = idleSway;
      this.applyLids();
      if (this.mouth) {
        if (this.talking && live.experiments.lips) {
          const open = Math.abs(Math.sin(this.syllable));
          this.mouth.scale.y = 0.7 + open * 2.1;
        } else {
          this.mouth.scale.y = damp(this.mouth.scale.y, 1, dt, 8);
        }
      }
      this.clipDriver.update(this, dt);
      return;
    }

    for (const n of NAMES) {
      const a = this.acc[n];
      a.x = 0;
      a.y = 0;
      a.z = 0;
    }
    this.updateTalk(dt, speed);
    this.applyWalk();
    this.applyGesture();
    if (live.experiments.posture) this.applyPosture();
    if (live.experiments.idle && !this.walking) this.applyIdle();
    this.applyBrows(dt);

    const head = this.acc.head;
    head.y += clamp(this.headLag + this.glanceV + this.lookRel * 0.85, -0.9, 0.9);
    head.x += clamp(-this.lookPitch * 0.45, -0.35, 0.35);

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
      if (this.joints.jaw) this.joints.jaw.rotation.x += open * 0.45;
      if (this.mouth) this.mouth.scale.y = 0.7 + open * 2.1;
      if (this.joints.head) this.joints.head.rotation.x += open * 0.035;
    } else if (this.mouth) {
      this.mouth.scale.y = damp(this.mouth.scale.y, 1, dt, 8);
    }

    this.applyLids();

    this.applyPupils(dt);

    if (this.sword) this.sword.visible = this.gesture === 'drawSword' && this.gestureBlend > 0.35;

    const idleSway = live.experiments.idle && !this.walking ? Math.sin(this.t * 0.8 + this.seed) * 0.02 : 0;
    this.root.position.set(this.x + this.paceX, this.baseY + this.drop + bob, this.z);
    this.root.rotation.y = this.yaw;
    this.root.rotation.z = idleSway;
    if (this.ik) solveIk(this);
  }

  tickBlink(dt) {
    if (!live.experiments.idle) {
      this.blinkWave = 0;
      return;
    }
    this.blinkAcc += dt;
    if (this.blinkAcc <= this.nextBlink) return;
    this.blinkWave += dt * 13;
    if (this.blinkWave >= Math.PI) {
      this.blinkWave = 0;
      this.blinkAcc = 0;
      this.nextBlink = 1.8 + (this.seed % 9) / 3;
    }
  }

  applyLids() {
    if (!this.lidL || !this.lidR) return;
    const shut = this.blinkWave > 0 ? Math.sin(this.blinkWave) : 0;
    this.lidL.scale.y = 0.12 + shut * 1.05;
    this.lidR.scale.y = 0.12 + shut * 1.05;
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

  updateTalk(dt) {
    const beating = this.talking && (this.gesture === 'talk' || this.gesture === 'idle');
    if (beating) {
      this.talkClock -= dt;
      if (this.talkClock <= 0) {
        this.talkTarget = 0.4 + ((this.seed + Math.floor(this.t * 17)) % 10) / 12;
        this.talkClock = 0.28 + ((this.seed + Math.floor(this.t * 9)) % 8) / 9;
      }
    } else {
      this.talkTarget = 0;
    }
    this.talkAmp = damp(this.talkAmp, this.talkTarget, dt, beating ? 8 : 6);
  }

  applyPose(pose, w) {
    if (!pose || w < 0.001) return;
    for (const name of Object.keys(pose)) {
      const e = pose[name];
      this.add(name, e[0] * w, e[1] * w, e[2] * w);
    }
  }

  applyGesture() {
    const b = this.gestureBlend;
    this.applyPose(poseOf(this.prevGesture, this.prevAge, this.prevTalkAmp), (1 - b) * this.prevBlend);
    const talkAmp = this.gesture === 'talk' || this.gesture === 'idle' ? this.talkAmp : 0;
    this.applyPose(poseOf(this.gesture, this.gestureAge, talkAmp), b);
    if (this.talking && this.gesture === 'idle') {
      this.applyPose(poseOf('talk', this.gestureAge, this.talkAmp), 0.85);
    }
  }

  applyBrows(dt) {
    const spec = BROWS[this.emotion] || BROWS.neutral;
    this.browLift = damp(this.browLift, spec.lift, dt, 5);
    this.browTilt = damp(this.browTilt, spec.tilt, dt, 5);
    if (!this.joints.browL || !this.joints.browR) return;
    this.joints.browL.position.y = 0.31 + this.browLift;
    this.joints.browR.position.y = 0.31 + this.browLift;
    this.add('browL', 0, 0, this.browTilt);
    this.add('browR', 0, 0, -this.browTilt);
  }

  applyPupils(dt) {
    if (!this.pupilL || !this.pupilR) return;
    this.saccT -= dt;
    if (this.saccT <= 0) {
      const h = hashString(`${this.id}:${Math.floor(this.t * 4)}`);
      this.saccX = ((h % 100) / 100 - 0.5) * 0.018;
      this.saccY = (((h >> 4) % 100) / 100 - 0.5) * 0.012;
      this.saccT = 0.22 + (h % 8) * 0.11;
    }
    const x = clamp(this.lookRel * 0.04 + this.saccX, -0.022, 0.022);
    const y = clamp(this.lookPitch * 0.035 + this.saccY, -0.016, 0.016);
    this.eyeX = damp(this.eyeX, x, dt, 16);
    this.eyeY = damp(this.eyeY, y, dt, 16);
    this.pupilL.position.x = this.eyeX;
    this.pupilL.position.y = this.eyeY;
    this.pupilR.position.x = this.eyeX * 0.92;
    this.pupilR.position.y = this.eyeY;
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
    this.add('spine', s * 0.05, 0, 0);
    this.add('chest', s * 0.04, 0, 0);
    this.add('head', Math.sin(this.t * 0.6 + this.seed) * 0.06, Math.sin(this.t * 0.37) * 0.08, 0);
    if (this.holdingCue) this.add('chest', Math.sin(this.t * 1.3) * 0.04, 0, 0);
  }
}

const POSES = {
  idle: {},
  point: { shoulderR: [1.22, -0.25, -0.15], elbowR: [0.28, 0, 0] },
  handsOnChest: {
    shoulderL: [0.95, 0, 0.55], elbowL: [1.25, 0, 0],
    shoulderR: [0.95, 0, -0.55], elbowR: [1.25, 0, 0],
  },
  raiseArm: { shoulderR: [2.35, -0.15, -0.2], elbowR: [0.15, 0, 0] },
  kneel: {
    hipL: [-0.55, 0, 0], hipR: [-0.55, 0, 0],
    kneeL: [1.55, 0, 0], kneeR: [1.55, 0, 0],
    chest: [0.2, 0, 0], head: [0.2, 0, 0],
  },
  bow: { chest: [0.95, 0, 0], head: [0.4, 0, 0], shoulderL: [0.3, 0, 0], shoulderR: [0.3, 0, 0] },
  weep: {
    shoulderL: [1.15, 0, 0.35], elbowL: [1.45, 0, 0],
    shoulderR: [1.15, 0, -0.35], elbowR: [1.45, 0, 0],
    head: [0.45, 0, 0],
  },
  give: { shoulderR: [1.05, -0.45, -0.1], elbowR: [0.4, 0, 0] },
  take: { shoulderR: [1.05, -0.45, -0.1], elbowR: [0.4, 0, 0] },
  turnAway: {},
  pace: {},
};

const BROWS = {
  neutral: { lift: 0, tilt: 0 },
  angry: { lift: -0.014, tilt: 0.5 },
  sad: { lift: 0.012, tilt: -0.38 },
  fearful: { lift: 0.022, tilt: -0.52 },
  joyful: { lift: 0.014, tilt: -0.24 },
  tender: { lift: 0.008, tilt: -0.12 },
  proud: { lift: 0.006, tilt: 0.2 },
  contemplative: { lift: 0.004, tilt: 0.26 },
  haunted: { lift: 0.016, tilt: -0.3 },
  uncertain: { lift: 0.01, tilt: 0.32 },
  curious: { lift: 0.018, tilt: -0.16 },
  emphatic: { lift: -0.008, tilt: 0.3 },
};

function poseOf(g, age, talkAmp) {
  if (g === 'drawSword') {
    const strike = Math.min(1, age * 1.4);
    return { shoulderR: [0.4 + strike * 1.15, -0.35, -0.25], elbowR: [0.45, 0, 0] };
  }
  if (g === 'shrug') {
    const pop = Math.sin(Math.min(Math.max(age, 0) * 5, Math.PI));
    return { shoulderL: [0.15, 0, -0.45 * pop], shoulderR: [0.15, 0, 0.45 * pop], head: [0, 0, 0.12] };
  }
  if (g === 'nod') return { head: [Math.sin(age * 6) * 0.28, 0, 0] };
  if (g === 'shakeHead') return { head: [0, Math.sin(age * 8) * 0.4, 0] };
  if (g === 'listen') {
    const cycle = age % 4.4;
    const nod = cycle > 3.15 ? Math.sin(((cycle - 3.15) / 1.15) * Math.PI) * 0.22 : 0;
    return {
      head: [-0.08 - nod, 0.05, 0.14],
      chest: [0.05, 0, 0],
      shoulderL: [0.12, 0, 0.08],
      shoulderR: [0.12, 0, -0.08],
    };
  }
  if (g === 'talk') {
    const a = talkAmp || 0;
    return { shoulderR: [0.04 + a * 0.8, -0.04 - a * 0.1, -0.02 - a * 0.05], elbowR: [0.04 + a * 0.7, 0, 0] };
  }
  return POSES[g] || POSES.idle;
}

function wrap(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}
