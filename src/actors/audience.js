import * as THREE from 'three';
import { USER_SEAT, STAGE_Y } from '../stage/layout.js';
import { live } from '../runtime/live.js';
import { clamp, damp } from '../util/math.js';

/**
 * Seated house: a handful of original mannequins plus the visitor.
 * The visitor stays even when the audience experiment is off.
 * The experiment adds the crowd's fidgeting, the lean-in, and the clap.
 */

export function createAudience(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const figures = [];

  const seats = [
    { x: -2.15, z: -5.12, color: '#6e4a32', skin: '#d2a888', hair: '#2c241c', user: false },
    { x: USER_SEAT.x, z: USER_SEAT.z, color: '#d4543c', skin: '#e7b89a', hair: '#3a2a22', user: true },
    { x: 1.7, z: -5.18, color: '#3f5e86', skin: '#e0b394', hair: '#1c1814', user: false },
    { x: -1.55, z: -6.35, color: '#7a3d52', skin: '#f0c6b0', hair: '#6b3a2a', user: false },
    { x: 0.95, z: -6.42, color: '#3f6a4a', skin: '#c99870', hair: '#4a3a2a', user: false },
    { x: -2.4, z: -6.48, color: '#5c4d7a', skin: '#e0b394', hair: '#241c16', user: false },
    { x: 2.35, z: -7.55, color: '#8a6230', skin: '#d7b094', hair: '#5c5854', user: false },
  ];

  for (const seat of seats) {
    figures.push(makeFigure(group, seat));
  }

  // A couple of figures in the side boxes, only visible up close / in wide shots.
  figures.push(makeFigure(group, {
    x: -5.15, z: -3.55, color: '#6a3038', skin: '#e0b394', hair: '#2c241c', user: false, box: true,
  }));
  figures.push(makeFigure(group, {
    x: 5.15, z: -3.55, color: '#2e4a44', skin: '#f0c6b0', hair: '#3a2a22', user: false, box: true,
  }));

  let wasClapping = false;
  const clapQueue = [];
  let audio;

  function update(dt) {
    const exp = live.experiments.audience;
    if (live.clapping && exp && !wasClapping) {
      clapQueue.push(0, 0.14, 0.28, 0.46, 0.62, 0.8, 1.05);
    }
    wasClapping = live.clapping && exp;
    if (clapQueue.length && exp) {
      for (let i = clapQueue.length - 1; i >= 0; i--) {
        clapQueue[i] -= dt;
        if (clapQueue[i] <= 0) {
          clapQueue.splice(i, 1);
          blip();
        }
      }
    } else if (!exp) {
      clapQueue.length = 0;
    }

    const target = live.speakerId ? live.speakerHead : { x: 0, y: STAGE_Y + 1.4, z: 0.4 };
    for (const fig of figures) {
      const crowd = fig.user || exp;
      fig.root.visible = crowd;
      if (!crowd) continue;
      fig.phase += dt;
      const fidget = exp ? Math.sin(fig.phase * 0.7 + fig.seed) * 0.03 : 0;
      fig.torso.rotation.z = fidget;
      const lean = exp && live.soliloquy ? 0.16 : 0.03;
      fig.torso.rotation.x = damp(fig.torso.rotation.x, lean + Math.sin(fig.phase * 0.5) * (exp ? 0.015 : 0), dt, 3);
      const dx = target.x - fig.root.position.x;
      const dy = target.y - (fig.root.position.y + 1.25);
      fig.head.rotation.y = damp(fig.head.rotation.y, clamp(-dx * 0.18, -0.45, 0.45), dt, 3);
      fig.head.rotation.x = damp(fig.head.rotation.x, clamp(-dy * 0.08, -0.2, 0.25), dt, 3);
      const clapping = exp && live.clapping;
      const wave = clapping ? Math.sin(fig.phase * 16 + fig.seed) : 0;
      const lift = clapping ? 1.15 + wave * 0.65 : 0.5;
      fig.shoulderL.rotation.x = lift;
      fig.shoulderR.rotation.x = lift;
      fig.elbowL.rotation.x = clapping ? 0.35 + Math.abs(wave) * 0.5 : 0.85;
      fig.elbowR.rotation.x = clapping ? 0.35 + Math.abs(wave) * 0.5 : 0.85;
      if (fig.tag) {
        const label = live.lang === 'zh' ? '你' : 'YOU';
        if (fig.tagLabel !== label) {
          fig.tagLabel = label;
          paintTag(fig.tagCtx, fig.tagTex, label);
        }
      }
    }
  }

  function blip() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume();
      const dur = 0.04;
      const buffer = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * dur)), audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * env * env;
      }
      const src = audio.createBufferSource();
      src.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      const gain = audio.createGain();
      gain.gain.value = 0.025;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      src.start();
    } catch {
      /* autoplay or missing audio — the clap animation still plays */
    }
  }

  return { group, update, figures };
}

function makeFigure(parent, seat) {
  const root = new THREE.Group();
  root.position.set(seat.x, seat.box ? 1.55 : 0, seat.z);
  root.rotation.y = Math.PI;
  parent.add(root);

  const skin = new THREE.MeshStandardMaterial({ color: seat.skin, roughness: 0.65 });
  const cloth = new THREE.MeshStandardMaterial({ color: seat.color, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: shade(seat.color), roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: seat.hair, roughness: 0.85 });

  const torso = new THREE.Group();
  torso.position.y = 0.52;
  root.add(torso);
  add(torso, new THREE.BoxGeometry(0.32, 0.34, 0.16), cloth, 0, 0.22, 0);
  if (seat.user) add(torso, new THREE.BoxGeometry(0.34, 0.16, 0.18), cloth, 0, 0.28, -0.02);

  const neck = new THREE.Group();
  neck.position.y = 0.4;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.16;
  neck.add(head);
  add(head, new THREE.SphereGeometry(0.16, 12, 10), skin, 0, 0.08, 0);
  add(head, new THREE.SphereGeometry(0.165, 10, 8), hairMat, 0, 0.16, 0.02).scale.set(1, 0.65, 1);
  const eye = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.4 });
  const pupil = new THREE.MeshStandardMaterial({ color: '#1a120c' });
  add(head, new THREE.SphereGeometry(0.03, 6, 6), eye, -0.055, 0.1, -0.13);
  add(head, new THREE.SphereGeometry(0.03, 6, 6), eye, 0.055, 0.1, -0.13);
  add(head, new THREE.SphereGeometry(0.015, 6, 6), pupil, -0.055, 0.1, -0.155);
  add(head, new THREE.SphereGeometry(0.015, 6, 6), pupil, 0.055, 0.1, -0.155);

  const arm = (side) => {
    const s = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.2, 0.3, 0);
    torso.add(shoulder);
    add(shoulder, new THREE.CapsuleGeometry(0.045, 0.12, 2, 6), cloth, 0, -0.12, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.22;
    shoulder.add(elbow);
    add(elbow, new THREE.CapsuleGeometry(0.04, 0.1, 2, 6), skin, 0, -0.1, 0);
    shoulder.rotation.x = 0.5;
    elbow.rotation.x = 0.85;
    return { shoulder, elbow };
  };
  const left = arm('L');
  const right = arm('R');

  // Folded legs, built facing -Z so the root's PI turn faces the stage.
  const hipL = new THREE.Group();
  hipL.position.set(-0.08, 0.5, 0);
  hipL.rotation.x = 1.25;
  root.add(hipL);
  add(hipL, new THREE.CapsuleGeometry(0.06, 0.16, 2, 6), dark, 0, -0.14, 0);
  const kneeL = new THREE.Group();
  kneeL.position.y = -0.26;
  kneeL.rotation.x = 1.15;
  hipL.add(kneeL);
  add(kneeL, new THREE.CapsuleGeometry(0.05, 0.14, 2, 6), dark, 0, -0.12, 0);

  const hipR = hipL.clone();
  hipR.position.x = 0.08;
  root.add(hipR);

  let tag = null;
  let tagCtx = null;
  let tagTex = null;
  if (seat.user) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    tagCtx = canvas.getContext('2d');
    tagTex = new THREE.CanvasTexture(canvas);
    tagTex.colorSpace = THREE.SRGBColorSpace;
    paintTag(tagCtx, tagTex, '你');
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false }));
    sprite.position.set(0, 1.15, 0);
    sprite.scale.set(0.42, 0.21, 1);
    root.add(sprite);
    tag = sprite;
  }

  return {
    root,
    torso,
    head,
    shoulderL: left.shoulder,
    shoulderR: right.shoulder,
    elbowL: left.elbow,
    elbowR: right.elbow,
    user: seat.user,
    seed: seat.x * 3 + seat.z,
    phase: Math.abs(seat.x),
    tag,
    tagCtx,
    tagTex,
    tagLabel: seat.user ? '你' : '',
  };
}

function add(parent, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function paintTag(ctx, tex, label) {
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = 'rgba(20, 12, 10, 0.88)';
  roundRect(ctx, 4, 8, 120, 48, 10);
  ctx.fill();
  ctx.fillStyle = '#f3d48a';
  ctx.font = 'bold 28px Palatino, "Songti SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 34);
  tex.needsUpdate = true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(0.55);
  return `#${c.getHexString()}`;
}
