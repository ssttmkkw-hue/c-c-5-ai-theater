import * as THREE from 'three';
import { MARKS, STAGE_Y } from './layout.js';
import { live } from '../runtime/live.js';
import { damp } from '../util/math.js';

/**
 * A small proscenium house: wooden stage, arch, wings, a painted Elsinore flat,
 * raked seats, side boxes, footlights, and a curtain that can open.
 */

export function createTheater(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const wood = woodTexture();
  const floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.86, metalness: 0.02, color: '#c9a27a' });
  const stage = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.22, 8.2), floorMat);
  stage.position.set(0, STAGE_Y - 0.11, 0.55);
  stage.receiveShadow = true;
  stage.castShadow = false;
  root.add(stage);

  // Apron lip and two steps into the house.
  box(root, 10.2, 0.12, 0.7, '#4a301c', 0, STAGE_Y - 0.28, -3.55, { roughness: 0.8 });
  box(root, 8.4, 0.14, 0.45, '#3b2818', 0, 0.42, -4.05, { roughness: 0.85 });
  box(root, 7.2, 0.16, 0.4, '#2e2014', 0, 0.22, -4.4, { roughness: 0.88 });

  const house = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: '#1a1418', roughness: 0.95 }),
  );
  house.position.set(0, -0.1, -7.2);
  house.receiveShadow = true;
  root.add(house);

  // Aisle runner.
  box(root, 0.7, 0.02, 5.2, '#4a2030', 0, 0.02, -6.6, { roughness: 0.9, cast: false });

  buildSeats(root);
  buildArch(root);
  buildWings(root);
  buildProps(root);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(12.2, 5.1),
    new THREE.MeshStandardMaterial({ map: elsinoreTexture(), roughness: 0.92, metalness: 0 }),
  );
  backdrop.position.set(0, STAGE_Y + 2.35, 4.55);
  backdrop.receiveShadow = true;
  root.add(backdrop);

  const sign = makeSign('AI THEATER');
  sign.mesh.position.set(0, STAGE_Y + 4.72, -3.05);
  root.add(sign.mesh);

  const curtains = buildCurtains(root);
  const marks = buildMarks(root);
  const lights = buildLights(scene);

  let curtainOpen = false;
  let curtainT = 0;

  function setCurtain(open) {
    curtainOpen = Boolean(open);
  }

  function setTitle(text) {
    sign.redraw(text || 'AI THEATER');
  }

  function update(dt) {
    const useCurtain = live.experiments.curtains;
    const target = useCurtain ? (curtainOpen ? 1 : 0) : 1;
    curtainT = damp(curtainT, target, dt, useCurtain ? 1.35 : 6);
    const slide = curtainT;
    curtains.left.position.x = -2.15 - slide * 4.15;
    curtains.right.position.x = 2.15 + slide * 4.15;
    const show = useCurtain && curtainT < 0.995;
    curtains.left.visible = show;
    curtains.right.visible = show;
    marks.visible = live.experiments.marks;

    const head = live.speakerHead;
    const focus = live.experiments.spotlight && live.speakerId;
    const tx = focus ? head.x : 0;
    const ty = focus ? head.y : STAGE_Y + 1.35;
    const tz = focus ? head.z : 0.4;
    lights.target.position.x = damp(lights.target.position.x, tx, dt, 2.4);
    lights.target.position.y = damp(lights.target.position.y, ty, dt, 2.4);
    lights.target.position.z = damp(lights.target.position.z, tz, dt, 2.4);
    lights.spot.position.x = damp(lights.spot.position.x, tx * 0.25, dt, 1.6);
    lights.spot.position.z = damp(lights.spot.position.z, tz - 1.4, dt, 1.6);
    const want = focus ? 36 : 14;
    lights.spot.intensity = damp(lights.spot.intensity, want, dt, 2);
    const houseWant = live.playing ? 0.08 : 0.35;
    lights.house.intensity = damp(lights.house.intensity, houseWant, dt, 1.6);
    lights.spot.target.updateMatrixWorld();
  }

  return { root, setCurtain, setTitle, update, marks, curtainOpen: () => curtainOpen };
}

function box(parent, w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.03,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  parent.add(m);
  return m;
}

function buildSeats(root) {
  const rows = [
    { z: -5.15, y: 0.0, n: 7 },
    { z: -6.4, y: 0.18, n: 8 },
    { z: -7.6, y: 0.36, n: 9 },
  ];
  const seatMat = new THREE.MeshStandardMaterial({ color: '#6a1e2e', roughness: 0.72 });
  const backMat = new THREE.MeshStandardMaterial({ color: '#4c1522', roughness: 0.75 });
  for (const row of rows) {
    const gap = 0.78;
    for (let i = 0; i < row.n; i++) {
      const x = (i - (row.n - 1) / 2) * gap;
      if (Math.abs(x) < 0.34) continue;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.5), seatMat);
      seat.position.set(x, 0.42 + row.y, row.z);
      seat.castShadow = true;
      seat.receiveShadow = true;
      root.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.08), backMat);
      back.position.set(x, 0.66 + row.y, row.z + 0.24);
      back.castShadow = true;
      root.add(back);
    }
  }
  // Side boxes.
  for (const side of [-1, 1]) {
    box(root, 1.5, 0.12, 1.1, '#3a2a22', side * 5.15, 1.35, -3.5, { roughness: 0.8 });
    box(root, 1.55, 0.08, 0.08, '#d4b06a', side * 5.15, 1.7, -3.05, { metalness: 0.4, roughness: 0.4 });
  }
  // A shallow balcony rail behind the last row, glimpsed in the wide shot.
  box(root, 8.5, 0.08, 0.12, '#d4b06a', 0, 1.15, -8.35, { metalness: 0.35, roughness: 0.45 });
}

function buildArch(root) {
  const wood = '#3a2416';
  const gold = '#c6a15b';
  const y0 = STAGE_Y;
  // Columns.
  box(root, 0.7, 4.6, 0.85, wood, -4.55, y0 + 2.1, -3.15);
  box(root, 0.7, 4.6, 0.85, wood, 4.55, y0 + 2.1, -3.15);
  // Header.
  box(root, 10.2, 0.7, 0.9, wood, 0, y0 + 4.55, -3.15);
  // Inner gilt.
  box(root, 0.08, 4.15, 0.08, gold, -4.05, y0 + 2.05, -2.78, { metalness: 0.45, roughness: 0.35 });
  box(root, 0.08, 4.15, 0.08, gold, 4.05, y0 + 2.05, -2.78, { metalness: 0.45, roughness: 0.35 });
  box(root, 8.2, 0.08, 0.08, gold, 0, y0 + 4.15, -2.78, { metalness: 0.45, roughness: 0.35 });
  // Outer returns.
  box(root, 1.4, 5.4, 0.4, '#24160f', -6.5, y0 + 2.4, -3.3, { roughness: 0.9 });
  box(root, 1.4, 5.4, 0.4, '#24160f', 6.5, y0 + 2.4, -3.3, { roughness: 0.9 });
}

function buildWings(root) {
  const matColor = '#120c10';
  box(root, 0.4, 4.8, 4.2, matColor, -6.7, STAGE_Y + 2.3, 1.3, { roughness: 0.95 });
  box(root, 0.4, 4.8, 4.2, matColor, 6.7, STAGE_Y + 2.3, 1.3, { roughness: 0.95 });
  // Back wall cheeks beside the backdrop.
  box(root, 1.3, 4.8, 0.3, '#1a1014', -5.6, STAGE_Y + 2.3, 4.45, { roughness: 0.9 });
  box(root, 1.3, 4.8, 0.3, '#1a1014', 5.6, STAGE_Y + 2.3, 4.45, { roughness: 0.9 });
}

function buildProps(root) {
  const y = STAGE_Y;
  // Pillars.
  for (const x of [-3.7, 3.7]) {
    const geo = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 10);
    const mat = new THREE.MeshStandardMaterial({ color: '#d9d1c3', roughness: 0.62 });
    const p = new THREE.Mesh(geo, mat);
    p.position.set(x, y + 1.3, 2.55);
    p.castShadow = true;
    p.receiveShadow = true;
    root.add(p);
    box(root, 0.5, 0.1, 0.5, '#c6a15b', x, y + 2.65, 2.55, { metalness: 0.3, roughness: 0.4 });
  }
  // Bench, stage right.
  box(root, 1.3, 0.08, 0.38, '#6b4226', 3.05, y + 0.42, -0.15);
  box(root, 0.08, 0.42, 0.34, '#4a2e18', 2.5, y + 0.21, -0.15);
  box(root, 0.08, 0.42, 0.34, '#4a2e18', 3.6, y + 0.21, -0.15);
  // A stool, stage left, with a small pale "skull" made of primitives — an original prop, not a scan.
  box(root, 0.36, 0.08, 0.36, '#5a3a24', -3.15, y + 0.4, 0.2);
  box(root, 0.08, 0.4, 0.08, '#4a2e18', -3.15, y + 0.2, 0.2);
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#e6dcc8', roughness: 0.55 }),
  );
  skull.position.set(-3.15, y + 0.56, 0.2);
  skull.castShadow = true;
  root.add(skull);
  const socket = new THREE.MeshStandardMaterial({ color: '#2a2118' });
  for (const sx of [-0.03, 0.03]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), socket);
    eye.position.set(-3.15 + sx, y + 0.58, 0.12);
    root.add(eye);
  }
}

function buildCurtains(root) {
  const mat = new THREE.MeshStandardMaterial({ color: '#7c1c2b', roughness: 0.78, side: THREE.DoubleSide });
  const make = (dir) => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const pleat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 4.25, 0.08), mat);
      pleat.position.set(dir * i * 0.95, 0, i % 2 === 0 ? 0 : 0.08);
      pleat.castShadow = true;
      g.add(pleat);
    }
    const hem = new THREE.Mesh(
      new THREE.BoxGeometry(3.9, 0.08, 0.1),
      new THREE.MeshStandardMaterial({ color: '#e2b657', roughness: 0.4, metalness: 0.35 }),
    );
    hem.position.y = -2.05;
    g.add(hem);
    g.position.set(dir * 2.15, STAGE_Y + 2.15, -2.82);
    root.add(g);
    return g;
  };
  return { left: make(-1), right: make(1) };
}

function buildMarks(root) {
  const group = new THREE.Group();
  root.add(group);
  const colors = {
    cs: '#e2b657',
    dl: '#8fb4e8',
    dr: '#e7a0b4',
    ul: '#8fb4e8',
    ur: '#e7a0b4',
    sl: '#b7d7a8',
    sr: '#b7d7a8',
  };
  for (const [id, pos] of Object.entries(MARKS)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.26, 24),
      new THREE.MeshStandardMaterial({ color: colors[id] || '#e2b657', roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos[0], STAGE_Y + 0.025, pos[2]);
    ring.receiveShadow = true;
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#f4e5c0';
    ctx.font = 'bold 28px Palatino, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(id.toUpperCase(), 64, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    label.position.set(pos[0], STAGE_Y + 0.18, pos[2]);
    label.scale.set(0.38, 0.19, 1);
    group.add(label);
  }
  return group;
}

function buildLights(scene) {
  const hemi = new THREE.HemisphereLight('#ffe0c2', '#2a1c22', 0.55);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight('#ffd8b0', 0.28);
  scene.add(ambient);

  const key = new THREE.DirectionalLight('#fff1d6', 2.4);
  key.position.set(-4.5, 8.5, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 28;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.0004;
  scene.add(key);
  scene.add(key.target);
  key.target.position.set(0, STAGE_Y + 1, 0.4);

  const fill = new THREE.DirectionalLight('#c9d4ea', 0.55);
  fill.position.set(4, 3.5, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight('#9eb4d8', 0.7);
  rim.position.set(0, 4, 6);
  scene.add(rim);

  const target = new THREE.Object3D();
  target.position.set(0, STAGE_Y + 1.4, 0.4);
  scene.add(target);
  const spot = new THREE.SpotLight('#ffd2a0', 14, 20, 0.55, 0.6, 1.2);
  spot.position.set(0, STAGE_Y + 6.2, -1.2);
  spot.target = target;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 18;
  spot.shadow.bias = -0.0008;
  scene.add(spot);

  // Practicals: a bar of footlights and two hanging lamps (meshes only; the spot does the aiming).
  for (let i = -4; i <= 4; i++) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: '#ffd8a8', emissive: '#ffb15a', emissiveIntensity: 0.9, roughness: 0.4 }),
    );
    bulb.position.set(i * 0.85, STAGE_Y + 0.12, -2.55);
    scene.add(bulb);
  }
  const foot = new THREE.PointLight('#ffc58a', 0.6, 6, 2);
  foot.position.set(0, STAGE_Y + 0.3, -2.3);
  scene.add(foot);

  for (const x of [-2.4, 2.4]) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: '#1c1612', roughness: 0.5, metalness: 0.4 }),
    );
    can.position.set(x, STAGE_Y + 5.5, 0.2);
    scene.add(can);
  }

  const houseLamp = new THREE.PointLight('#ffb080', 0.35, 8, 2);
  houseLamp.position.set(0, 2.4, -6.2);
  scene.add(houseLamp);

  return { spot, target, key, house: houseLamp };
}

function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = '#8a5a32';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++) {
    const y = i * 64;
    const shade = 110 + ((i * 37) % 40);
    g.fillStyle = `rgb(${shade + 40}, ${shade - 10}, ${shade - 45})`;
    g.fillRect(0, y, 512, 60);
    g.strokeStyle = '#3a2414';
    g.strokeRect(0, y, 512, 64);
    g.strokeStyle = 'rgba(255,220,180,0.08)';
    for (let k = 0; k < 6; k++) {
      const yy = y + 8 + ((i * 13 + k * 9) % 48);
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(512, yy + ((k % 2) ? 2 : -2));
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function elsinoreTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#1c2744');
  sky.addColorStop(0.55, '#3c4d6e');
  sky.addColorStop(1, '#6a5348');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  // Moon.
  g.fillStyle = '#f3e6c4';
  g.beginPath();
  g.arc(180, 110, 36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(28, 39, 68, 0.55)';
  g.beginPath();
  g.arc(196, 102, 30, 0, Math.PI * 2);
  g.fill();
  // Castle masses — original blocks, not a copied painting.
  g.fillStyle = '#23202c';
  g.fillRect(80, 250, 860, 280);
  g.fillStyle = '#2c3148';
  g.fillRect(120, 180, 90, 340);
  g.fillRect(250, 210, 160, 310);
  g.fillRect(470, 150, 70, 370);
  g.fillRect(560, 200, 200, 320);
  g.fillRect(800, 170, 110, 350);
  g.fillStyle = '#1a1c28';
  // Battlements.
  for (let x = 250; x < 410; x += 22) g.fillRect(x, 196, 12, 18);
  for (let x = 560; x < 760; x += 22) g.fillRect(x, 186, 12, 18);
  // Tower caps.
  g.beginPath();
  g.moveTo(470, 150);
  g.lineTo(505, 80);
  g.lineTo(540, 150);
  g.fill();
  g.beginPath();
  g.moveTo(800, 170);
  g.lineTo(855, 90);
  g.lineTo(910, 170);
  g.fill();
  // A few windows.
  g.fillStyle = '#e7c27a';
  const windows = [
    [150, 230], [150, 280], [300, 250], [340, 250], [600, 240], [650, 240], [700, 260], [830, 230],
  ];
  for (const [x, y] of windows) g.fillRect(x, y, 10, 16);
  // Sea line.
  g.fillStyle = '#1d3344';
  g.fillRect(0, 430, 1024, 82);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSign(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.58), mat);
  function redraw(label) {
    ctx.fillStyle = '#1a120c';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.strokeStyle = '#e2b657';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 1008, 112);
    ctx.fillStyle = '#f0d48a';
    ctx.font = '64px Palatino, "Songti SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shown = String(label || '').slice(0, 42);
    ctx.fillText(shown, 512, 68);
    tex.needsUpdate = true;
  }
  redraw(text);
  return { mesh, redraw };
}
