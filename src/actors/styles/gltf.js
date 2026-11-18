import * as THREE from 'three';
import { clamp } from '../../util/math.js';
import { retargetClip } from './retarget.js';
import { attachBlockFace } from './face.js';

const URL = 'assets/actors/gltf/theater-figure.gltf';
let pending = null;

function loadTemplate() {
  if (!pending) {
    pending = import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      return loader.loadAsync(URL);
    });
  }
  return pending;
}

function tint(model, character) {
  const cloth = new THREE.Color(character.color || '#6a4a86');
  const skin = new THREE.Color(character.skin || '#e0b394');
  model.traverse((obj) => {
    if (obj.isSkinnedMesh) obj.frustumCulled = false;
    if (!obj.isMesh) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      const copy = mat.clone();
      const name = (mat.name || '').toLowerCase();
      if (name.includes('skin')) copy.color.copy(skin);
      else copy.color.copy(cloth);
      copy.side = THREE.DoubleSide;
      return copy;
    });
    obj.material = next.length === 1 ? next[0] : next;
  });
}

/** Apply a one-frame euler offset without stacking onto bones the clip does not key. */
function nudge(driver, node, dx, dy) {
  const data = node.userData;
  if (!data.preNudge) data.preNudge = new THREE.Quaternion();
  data.preNudge.copy(node.quaternion);
  data.nudged = true;
  driver._nudged.push(node);
  if (dx) node.rotateX(dx);
  if (dy) node.rotateY(dy);
}

/**
 * Skinned glTF with a clip mixer. Unknown gestures fall back to talk or idle.
 */
export async function createGltfBody(character) {
  const { clone } = await import('three/addons/utils/SkeletonUtils.js');
  const gltf = await loadTemplate();
  const model = clone(gltf.scene);
  model.name = `gltf-${character.id || 'x'}`;
  tint(model, character);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const src of gltf.animations) {
    const clip = retargetClip(src.clone(), model);
    const action = mixer.clipAction(clip);
    const looping = src.name === 'idle' || src.name === 'walk' || src.name === 'talk';
    action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
    action.clampWhenFinished = !looping;
    action.play();
    action.setEffectiveWeight(src.name === 'idle' ? 1 : 0);
    actions[src.name] = action;
  }
  const headBone = model.getObjectByName('head');
  const face = attachBlockFace(headBone, character.skin || '#e0b394');
  const driver = {
    head: headBone,
    current: 'idle',
    _nudged: [],
    update(actor, dt) {
      for (const node of driver._nudged) {
        if (node?.userData.nudged) node.quaternion.copy(node.userData.preNudge);
        if (node) node.userData.nudged = false;
      }
      driver._nudged.length = 0;
      const wanted = actor.walking && actions.walk
        ? 'walk'
        : (actions[actor.gesture] ? actor.gesture : (actor.talking && actions.talk ? 'talk' : 'idle'));
      if (wanted !== driver.current && actions[wanted]) {
        const next = actions[wanted];
        const prev = actions[driver.current];
        next.reset().fadeIn(0.25).play();
        if (prev && prev !== next) prev.fadeOut(0.25);
        driver.current = wanted;
      }
      mixer.update(dt);
      const head = driver.head;
      if (head) {
        nudge(driver, head, clamp(-(actor.lookPitch || 0) * 0.6, -0.4, 0.4), clamp((actor.lookRel || 0) + (actor.glanceV || 0), -0.8, 0.8));
      }
      const chest = model.getObjectByName('chest');
      const lean = actor.emotion === 'sad' ? 0.18 : actor.emotion === 'angry' ? 0.12 : actor.emotion === 'proud' ? -0.1 : 0;
      if (chest && lean) nudge(driver, chest, lean, 0);
    },
    dispose() {
      mixer.stopAllAction();
    },
  };
  return {
    root: model,
    joints: {},
    sword: null,
    lidL: face.lidL,
    lidR: face.lidR,
    mouth: face.mouth,
    pupilL: null,
    pupilR: null,
    styleId: 'gltf',
    ik: false,
    clip: driver,
  };
}
