import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AUDIENCE_CAM, STAGE_Y } from '../stage/layout.js';
import { damp } from '../util/math.js';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.mode = 'audience';
    this.keys = new Set();
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, STAGE_Y + 1.15, 0.35);
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enabled = false;
    this.desiredPos = new THREE.Vector3(...AUDIENCE_CAM.pos);
    this.desiredLook = new THREE.Vector3(...AUDIENCE_CAM.look);
    this._look = new THREE.Vector3();
    this.snapToAudience();
  }

  snapToAudience() {
    this.camera.position.set(...AUDIENCE_CAM.pos);
    this.camera.lookAt(...AUDIENCE_CAM.look);
    this._look.set(...AUDIENCE_CAM.look);
  }

  setMode(mode) {
    const next = mode === 'cinematic' || mode === 'free' ? mode : 'audience';
    this.mode = next;
    this.controls.enabled = next === 'free';
    if (next === 'audience') {
      this.desiredPos.set(...AUDIENCE_CAM.pos);
      this.desiredLook.set(...AUDIENCE_CAM.look);
    } else if (next === 'free') {
      this.controls.target.copy(this._look);
    } else if (next === 'cinematic') {
      this.desiredPos.set(0, 3.35, -8.1);
      this.desiredLook.set(0, STAGE_Y + 1.2, 0.4);
    }
    return this.mode;
  }

  onBeat(index, speaker) {
    if (this.mode !== 'cinematic') return;
    const x = speaker?.x ?? 0;
    const z = speaker?.z ?? 0.4;
    const headY = STAGE_Y + 1.45;
    const kind = index % 3;
    if (kind === 0) {
      this.desiredPos.set(0, 3.25, -8.15);
      this.desiredLook.set(0, STAGE_Y + 1.15, 0.45);
    } else if (kind === 1) {
      this.desiredPos.set(x * 0.25 + 0.55, headY + 0.15, Math.min(z - 3.15, -1.35));
      this.desiredLook.set(x, headY, z);
    } else {
      this.desiredPos.set(x + 1.05, headY + 0.05, Math.min(z - 2.05, -1.15));
      this.desiredLook.set(x, headY - 0.05, z + 0.15);
    }
  }

  setKey(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  update(dt) {
    if (this.mode === 'free') {
      this.applyKeys(dt);
      this.controls.update();
      return;
    }
    const k = 2.1;
    this.camera.position.x = damp(this.camera.position.x, this.desiredPos.x, dt, k);
    this.camera.position.y = damp(this.camera.position.y, this.desiredPos.y, dt, k);
    this.camera.position.z = damp(this.camera.position.z, this.desiredPos.z, dt, k);
    this._look.x = damp(this._look.x, this.desiredLook.x, dt, k);
    this._look.y = damp(this._look.y, this.desiredLook.y, dt, k);
    this._look.z = damp(this._look.z, this.desiredLook.z, dt, k);
    this.camera.lookAt(this._look);
  }

  applyKeys(dt) {
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 6 : 3.2) * dt;
    if (!speed) return;
    this.camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) return;
    _forward.normalize();
    _right.crossVectors(_forward, _up).normalize();
    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyE') || this.keys.has('PageUp')) this.camera.position.y += speed;
    if (this.keys.has('KeyQ') || this.keys.has('PageDown')) this.camera.position.y -= speed;
    if (!mx && !mz) {
      this.controls.target.y = this.camera.position.y - 0.2;
      return;
    }
    this.camera.position.addScaledVector(_forward, mz * speed);
    this.camera.position.addScaledVector(_right, mx * speed);
    this.controls.target.addScaledVector(_forward, mz * speed);
    this.controls.target.addScaledVector(_right, mx * speed);
  }
}
