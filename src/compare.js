import * as THREE from 'three';
import { Actor } from './actors/actor.js';
import { ACTOR_STYLES } from './actors/styles/api.js';
import { live } from './runtime/live.js';

const STYLES = ACTOR_STYLES;
const GESTURES = ['point', 'talk', 'handsOnChest', 'bow', 'raiseArm', 'give'];
const EMOTIONS = ['angry', 'joyful', 'tender', 'sad', 'proud', 'emphatic'];

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#141018');
scene.add(new THREE.HemisphereLight('#ffe6c4', '#2a2433', 0.9));
const key = new THREE.DirectionalLight('#fff4e4', 1.35);
key.position.set(-2, 6, -4);
scene.add(key);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 6),
  new THREE.MeshStandardMaterial({ color: '#3a2a28', roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.85;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(38, 1, 0.08, 40);
camera.position.set(0, 2.15, -7.4);
camera.lookAt(0, 1.7, 0);

const labels = document.getElementById('labels');
const actors = [];
const errors = [];
window.__compare = { ready: false, styles: STYLES.slice(), errors };

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

live.actorStyle = 'procedural';
live.experiments.lips = true;
live.experiments.idle = true;
live.experiments.lookAt = true;

const span = 1.55;
for (let i = 0; i < STYLES.length; i++) {
  const id = STYLES[i];
  const actor = new Actor({
    id: `cmp-${id}`,
    name: id,
    color: ['#3b5b8c', '#6a3d86', '#c5d0dc', '#8d2f36', '#d98a2b', '#24523a'][i],
    costume: 'prince',
    skin: '#e7b898',
    hair: '#241810',
    voice: { lang: 'en-GB', pitch: 1, rate: 1 },
  }, { defer: true, style: STYLES[i] === 'gltf' || STYLES[i] === 'vrm' ? 'procedural' : STYLES[i] });
  // Negate X: the camera looks toward +Z, so world +X is on the left of the screen.
  const x = ((STYLES.length - 1) / 2 - i) * span;
  actor.snap(x, 0.15);
  actor.yaw = 0;
  actor.setVisible(true);
  actor.setEmotion(EMOTIONS[i]);
  actor.setGesture(GESTURES[i]);
  actor.gestureBlend = 1;
  actor.setTalking(true);
  actor.look.x = x;
  actor.look.y = 1.5;
  actor.look.z = -4;
  scene.add(actor.root);
  actors.push(actor);
  const label = document.createElement('span');
  label.textContent = id;
  labels.appendChild(label);
}

Promise.all(actors.map(async (actor, i) => {
  const id = STYLES[i];
  if (id === 'gltf' || id === 'vrm' || actor.styleId !== id) {
    await actor.applyStyle(id);
    actor.snap(((STYLES.length - 1) / 2 - i) * span, 0.15);
    actor.setVisible(true);
    actor.setGesture(GESTURES[i]);
    actor.gestureBlend = 1;
    actor.setTalking(true);
  }
})).then(() => {
  window.__compare.ready = actors.every((actor, i) => actor.styleId === STYLES[i]);
  window.__compare.stylesLive = actors.map((actor) => actor.styleId);
}).catch((error) => {
  errors.push(String(error?.message || error));
  window.__compare.ready = false;
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const actor of actors) {
    if (!actor.visible) continue;
    actor.update(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
