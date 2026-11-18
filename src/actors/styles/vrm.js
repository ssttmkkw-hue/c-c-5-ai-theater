import * as THREE from 'three';
import { clamp } from '../../util/math.js';
import { attachBlockFace } from './face.js';

const URL = 'assets/actors/vrm/theater-cc0.vrm';
const VRM_CDN = 'https://esm.sh/@pixiv/three-vrm@2.1.0?external=three';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
let modulesPromise = null;
let filePromise = null;
const _look = new THREE.Vector3();

const EXPRESS = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'blink'];

function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import(VRM_CDN),
    ]);
  }
  return modulesPromise;
}

function loadFile() {
  if (!filePromise) {
    filePromise = fetch(URL).then((res) => {
      if (!res.ok) throw new Error(`vrm ${res.status}`);
      return res.arrayBuffer();
    }).catch((error) => {
      filePromise = null;
      throw error;
    });
  }
  return filePromise;
}

async function loadVrm() {
  const [{ GLTFLoader }, vrmMod] = await loadModules();
  const bytes = await loadFile();
  const loader = new GLTFLoader();
  loader.register((parser) => new vrmMod.VRMLoaderPlugin(parser, {
    autoUpdateHumanBones: true,
    metaPlugin: new vrmMod.VRMMetaLoaderPlugin(parser, {
      needThumbnailImage: false,
      acceptLicenseUrls: ['https://vrm.dev/licenses/1.0/', CC0],
    }),
  }));
  const gltf = await loader.parseAsync(bytes.slice(0), URL);
  if (!gltf.userData.vrm) throw new Error('VRM loader did not attach userData.vrm');
  return { vrm: gltf.userData.vrm, vrmMod };
}

function emotionWeights(emotion) {
  switch (emotion) {
    case 'joyful': return { happy: 0.85 };
    case 'angry': return { angry: 0.9 };
    case 'sad': return { sad: 0.85 };
    case 'fearful': return { surprised: 0.55, sad: 0.35 };
    case 'tender': return { relaxed: 0.55, happy: 0.3 };
    case 'proud': return { happy: 0.25 };
    case 'contemplative': return { relaxed: 0.5 };
    case 'haunted': return { sad: 0.4, surprised: 0.25 };
    case 'emphatic': return { angry: 0.35 };
    case 'curious': return { surprised: 0.45 };
    case 'uncertain': return { sad: 0.2, surprised: 0.2 };
    default: return {};
  }
}

function setBone(vrm, name, x, y, z) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  if (!node) return;
  node.rotation.set(x, y, z);
}

/**
 * Real @pixiv/three-vrm load of the CC0 mannequin. Lazy: this module is imported
 * only after the VRM style is selected. Gestures that have no pose become a relaxed idle.
 */
export async function createVrmBody(character) {
  const { vrm, vrmMod } = await loadVrm();
  const model = vrm.scene;
  model.name = `vrm-${character.id || 'x'}`;
  const cloth = new THREE.Color(character.color || '#c5cad6');
  model.traverse((obj) => {
    if (obj.geometry) obj.geometry.userData.owned = true;
    if (obj.isMesh || obj.isSkinnedMesh) obj.frustumCulled = false;
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = list.map((mat) => {
      if (!mat) return mat;
      const copy = mat.clone();
      copy.side = THREE.DoubleSide;
      const n = (mat.name || '').toLowerCase();
      if (copy.color && !n.includes('skin') && !n.includes('eye')) copy.color.lerp(cloth, 0.72);
      return copy;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
  const look = new THREE.Object3D();
  look.name = 'vrm-look';
  const root = new THREE.Group();
  root.name = model.name;
  root.add(model);
  root.add(look);
  if (vrm.lookAt) vrm.lookAt.target = look;

  const headBone = vrm.humanoid?.getNormalizedBoneNode('head') || model.getObjectByName('head');
  const face = attachBlockFace(headBone, character.skin || '#e0b394');
  const pose = {};
  const driver = {
    head: headBone,
    update(actor, dt) {
      const g = actor.gesture;
      const b = actor.gestureBlend ?? 1;
      const armDownL = 0.55;
      const armDownR = -0.55;
      const goal = {
        leftUpperArm: [0, 0, armDownL],
        rightUpperArm: [0, 0, armDownR],
        leftLowerArm: [0.15, 0, 0],
        rightLowerArm: [0.15, 0, 0],
        spine: [Math.sin(actor.t * 1.4) * 0.04, 0, 0],
        chest: [0, 0, 0],
        leftUpperLeg: [0, 0, 0],
        rightUpperLeg: [0, 0, 0],
        leftLowerLeg: [0, 0, 0],
        rightLowerLeg: [0, 0, 0],
      };
      if (g === 'point' || g === 'give' || g === 'take') {
        goal.rightUpperArm = [-0.4 * b, 0, armDownR * (1 - b) + -0.2 * b];
        goal.rightLowerArm = [0.35 * b, 0, 0];
      } else if (g === 'raiseArm') {
        goal.rightUpperArm = [0, 0, -0.15 * b];
      } else if (g === 'handsOnChest' || g === 'weep') {
        goal.leftUpperArm = [-0.6 * b, 0, 0.4 * b];
        goal.rightUpperArm = [-0.6 * b, 0, -0.4 * b];
        goal.leftLowerArm = [1.1 * b, 0, 0];
        goal.rightLowerArm = [1.1 * b, 0, 0];
      } else if (g === 'bow') {
        goal.spine = [0.45 * b, 0, 0];
        goal.chest = [0.25 * b, 0, 0];
      } else if (g === 'listen') {
        goal.spine = [0.08 * b, 0, 0];
      } else if (g === 'kneel') {
        goal.leftUpperLeg = [-1.1 * b, 0, 0];
        goal.rightUpperLeg = [-1.1 * b, 0, 0];
        goal.leftLowerLeg = [1.3 * b, 0, 0];
        goal.rightLowerLeg = [1.3 * b, 0, 0];
      } else if ((g === 'talk' || g === 'idle') && actor.talking) {
        const amp = actor.talkAmp || 0.3;
        goal.rightUpperArm = [-0.45 * amp, 0, armDownR * 0.45];
        goal.rightLowerArm = [0.4 * amp, 0, 0];
      }
      if (actor.walking) {
        const s = Math.sin(actor.walkPhase || 0);
        goal.leftUpperLeg = [s * 0.6, 0, 0];
        goal.rightUpperLeg = [-s * 0.6, 0, 0];
        goal.leftLowerLeg = [Math.max(0, -s) * 0.8, 0, 0];
        goal.rightLowerLeg = [Math.max(0, s) * 0.8, 0, 0];
        goal.spine = [0, 0, 0];
      }
      let headX = clamp(-(actor.lookPitch || 0) * 0.5, -0.35, 0.3);
      const headY = clamp((actor.lookRel || 0) * 0.8 + (actor.glanceV || 0) * 0.4, -0.7, 0.7);
      if (g === 'listen') {
        const cycle = (actor.gestureAge || 0) % 4.4;
        if (cycle > 3.15) headX -= Math.sin(((cycle - 3.15) / 1.15) * Math.PI) * 0.2;
      }
      goal.head = [headX, headY, 0];
      const k = 1 - Math.exp(-Math.max(0.001, dt) * 8);
      for (const [name, euler] of Object.entries(goal)) {
        const cur = pose[name] || (pose[name] = euler.slice());
        cur[0] += (euler[0] - cur[0]) * k;
        cur[1] += (euler[1] - cur[1]) * k;
        cur[2] += (euler[2] - cur[2]) * k;
        setBone(vrm, name, cur[0], cur[1], cur[2]);
      }
      const mgr = vrm.expressionManager;
      if (mgr) {
        for (const name of EXPRESS) mgr.setValue(name, 0);
        const weights = emotionWeights(actor.emotion);
        for (const [name, value] of Object.entries(weights)) mgr.setValue(name, value);
        if (actor.talking) {
          const open = Math.abs(Math.sin(actor.syllable || actor.t * 8));
          mgr.setValue('aa', 0.25 + open * 0.75);
        }
        const shut = actor.blinkWave > 0 ? Math.sin(actor.blinkWave) : 0;
        if (shut > 0.05) mgr.setValue('blink', shut);
      }
      actor.root.updateMatrixWorld(true);
      _look.set(actor.look?.x || 0, actor.look?.y || 1.4, actor.look?.z || -5);
      actor.root.worldToLocal(_look);
      look.position.copy(_look);
      vrm.update(dt);
    },
    dispose() {
      try {
        vrmMod.VRMUtils?.deepDispose?.(vrm.scene);
      } catch {
        /* geometry may already be released */
      }
    },
  };

  return {
    root,
    joints: {},
    sword: null,
    lidL: face.lidL,
    lidR: face.lidR,
    mouth: face.mouth,
    pupilL: null,
    pupilR: null,
    styleId: 'vrm',
    ik: false,
    clip: driver,
    vrm,
  };
}
