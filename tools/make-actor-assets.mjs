/**
 * Writes the original CC0 skinned figure (glTF) and the CC0 VRM mannequin.
 * No third-party meshes. Run: node tools/make-actor-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLOAT = 5126;
const USHORT = 5123;
const UBYTE = 5121;
const ARRAY = 34962;
const ELEMENT = 34963;

class Bin {
  constructor() {
    this.chunks = [];
    this.length = 0;
    this.bufferViews = [];
    this.accessors = [];
  }

  align(n) {
    const pad = (n - (this.length % n)) % n;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.length += pad;
    }
  }

  view(typed, target) {
    this.align(4);
    const offset = this.length;
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    this.chunks.push(Buffer.from(buf));
    this.length += buf.length;
    const index = this.bufferViews.length;
    const entry = { buffer: 0, byteOffset: offset, byteLength: buf.length };
    if (target) entry.target = target;
    this.bufferViews.push(entry);
    return index;
  }

  accessor(typed, { type, componentType, count, min, max, target }) {
    const bufferView = this.view(typed, target);
    const acc = { bufferView, byteOffset: 0, componentType, count, type };
    if (min) acc.min = min;
    if (max) acc.max = max;
    const index = this.accessors.length;
    this.accessors.push(acc);
    return index;
  }

  concat() {
    return Buffer.concat(this.chunks);
  }
}

function quat(x, y, z) {
  const c1 = Math.cos(x / 2);
  const s1 = Math.sin(x / 2);
  const c2 = Math.cos(y / 2);
  const s2 = Math.sin(y / 2);
  const c3 = Math.cos(z / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function pushFace(dst, cx, cy, cz, hx, hy, hz, nx, ny, nz, joint) {
  const base = dst.pos.length / 3;
  let corners;
  if (nx !== 0) {
    const x = cx + nx * hx;
    corners = [[x, cy - hy, cz - hz], [x, cy - hy, cz + hz], [x, cy + hy, cz + hz], [x, cy + hy, cz - hz]];
    if (nx < 0) corners.reverse();
  } else if (ny !== 0) {
    const y = cy + ny * hy;
    corners = [[cx - hx, y, cz - hz], [cx + hx, y, cz - hz], [cx + hx, y, cz + hz], [cx - hx, y, cz + hz]];
    if (ny < 0) corners.reverse();
  } else {
    const z = cz + nz * hz;
    corners = [[cx - hx, cy - hy, z], [cx + hx, cy - hy, z], [cx + hx, cy + hy, z], [cx - hx, cy + hy, z]];
    if (nz > 0) corners.reverse();
  }
  for (const p of corners) {
    dst.pos.push(p[0], p[1], p[2]);
    dst.nrm.push(nx, ny, nz);
    if (dst.joints) {
      dst.joints.push(joint, 0, 0, 0);
      dst.weights.push(1, 0, 0, 0);
    }
  }
  dst.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addBox(dst, cx, cy, cz, sx, sy, sz, joint) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  pushFace(dst, cx, cy, cz, hx, hy, hz, 1, 0, 0, joint);
  pushFace(dst, cx, cy, cz, hx, hy, hz, -1, 0, 0, joint);
  pushFace(dst, cx, cy, cz, hx, hy, hz, 0, 1, 0, joint);
  pushFace(dst, cx, cy, cz, hx, hy, hz, 0, -1, 0, joint);
  pushFace(dst, cx, cy, cz, hx, hy, hz, 0, 0, 1, joint);
  pushFace(dst, cx, cy, cz, hx, hy, hz, 0, 0, -1, joint);
}

function worldOf(bones) {
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  const memo = {};
  const walk = (name) => {
    if (memo[name]) return memo[name];
    const b = byName[name];
    if (!b.parent) return (memo[name] = [b.x, b.y, b.z]);
    const p = walk(b.parent);
    return (memo[name] = [p[0] + b.x, p[1] + b.y, p[2] + b.z]);
  };
  const out = {};
  for (const b of bones) out[b.name] = walk(b.name);
  return out;
}

function emptyPart(skinned) {
  return { pos: [], nrm: [], idx: [], joints: skinned ? [] : null, weights: skinned ? [] : null };
}

function accessorVec3(bin, arr, target) {
  const typed = Float32Array.from(arr);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < typed.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], typed[i + k]);
      max[k] = Math.max(max[k], typed[i + k]);
    }
  }
  return bin.accessor(typed, {
    type: 'VEC3', componentType: FLOAT, count: typed.length / 3, min, max, target,
  });
}

function gltfBones(armsDown) {
  const armL = armsDown ? [0, -0.28, 0] : [-0.28, 0, 0];
  const armR = armsDown ? [0, -0.28, 0] : [0.28, 0, 0];
  const handL = armsDown ? [0, -0.24, 0] : [-0.22, 0, 0];
  const handR = armsDown ? [0, -0.24, 0] : [0.22, 0, 0];
  return [
    { name: 'hips', parent: null, x: 0, y: 0.92, z: 0 },
    { name: 'spine', parent: 'hips', x: 0, y: 0.14, z: 0 },
    { name: 'chest', parent: 'spine', x: 0, y: 0.18, z: 0 },
    { name: 'neck', parent: 'chest', x: 0, y: 0.2, z: 0 },
    { name: 'head', parent: 'neck', x: 0, y: 0.08, z: 0 },
    { name: 'upperArmL', parent: 'chest', x: -0.22, y: 0.16, z: 0 },
    { name: 'lowerArmL', parent: 'upperArmL', x: armL[0], y: armL[1], z: armL[2] },
    { name: 'handL', parent: 'lowerArmL', x: handL[0], y: handL[1], z: handL[2] },
    { name: 'upperArmR', parent: 'chest', x: 0.22, y: 0.16, z: 0 },
    { name: 'lowerArmR', parent: 'upperArmR', x: armR[0], y: armR[1], z: armR[2] },
    { name: 'handR', parent: 'lowerArmR', x: handR[0], y: handR[1], z: handR[2] },
    { name: 'upperLegL', parent: 'hips', x: -0.1, y: -0.06, z: 0 },
    { name: 'lowerLegL', parent: 'upperLegL', x: 0, y: -0.4, z: 0 },
    { name: 'footL', parent: 'lowerLegL', x: 0, y: -0.38, z: 0 },
    { name: 'upperLegR', parent: 'hips', x: 0.1, y: -0.06, z: 0 },
    { name: 'lowerLegR', parent: 'upperLegR', x: 0, y: -0.4, z: 0 },
    { name: 'footR', parent: 'lowerLegR', x: 0, y: -0.38, z: 0 },
  ];
}

function vrmBones() {
  return [
    { name: 'hips', parent: null, x: 0, y: 0.92, z: 0 },
    { name: 'spine', parent: 'hips', x: 0, y: 0.14, z: 0 },
    { name: 'chest', parent: 'spine', x: 0, y: 0.18, z: 0 },
    { name: 'neck', parent: 'chest', x: 0, y: 0.18, z: 0 },
    { name: 'head', parent: 'neck', x: 0, y: 0.1, z: 0 },
    { name: 'leftEye', parent: 'head', x: -0.06, y: 0.12, z: -0.1 },
    { name: 'rightEye', parent: 'head', x: 0.06, y: 0.12, z: -0.1 },
    { name: 'leftUpperArm', parent: 'chest', x: -0.2, y: 0.14, z: 0 },
    { name: 'leftLowerArm', parent: 'leftUpperArm', x: -0.26, y: 0, z: 0 },
    { name: 'leftHand', parent: 'leftLowerArm', x: -0.22, y: 0, z: 0 },
    { name: 'rightUpperArm', parent: 'chest', x: 0.2, y: 0.14, z: 0 },
    { name: 'rightLowerArm', parent: 'rightUpperArm', x: 0.26, y: 0, z: 0 },
    { name: 'rightHand', parent: 'rightLowerArm', x: 0.22, y: 0, z: 0 },
    { name: 'leftUpperLeg', parent: 'hips', x: -0.1, y: -0.06, z: 0 },
    { name: 'leftLowerLeg', parent: 'leftUpperLeg', x: 0, y: -0.4, z: 0 },
    { name: 'leftFoot', parent: 'leftLowerLeg', x: 0, y: -0.38, z: 0 },
    { name: 'rightUpperLeg', parent: 'hips', x: 0.1, y: -0.06, z: 0 },
    { name: 'rightLowerLeg', parent: 'rightUpperLeg', x: 0, y: -0.4, z: 0 },
    { name: 'rightFoot', parent: 'rightLowerLeg', x: 0, y: -0.38, z: 0 },
  ];
}

function nodesFrom(bones) {
  const index = {};
  const nodes = bones.map((b, i) => {
    index[b.name] = i;
    return { name: b.name, translation: [round(b.x), round(b.y), round(b.z)] };
  });
  bones.forEach((b, i) => {
    if (!b.parent) return;
    const parent = nodes[index[b.parent]];
    parent.children = parent.children || [];
    parent.children.push(i);
  });
  return { nodes, index };
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

function partPrimitive(bin, part, material) {
  const position = accessorVec3(bin, part.pos, ARRAY);
  const normal = accessorVec3(bin, part.nrm, ARRAY);
  const indices = Uint16Array.from(part.idx);
  const index = bin.accessor(indices, {
    type: 'SCALAR', componentType: USHORT, count: indices.length, target: ELEMENT,
  });
  const prim = {
    attributes: { POSITION: position, NORMAL: normal },
    indices: index,
    material,
  };
  if (part.joints) {
    prim.attributes.JOINTS_0 = bin.accessor(Uint8Array.from(part.joints), {
      type: 'VEC4', componentType: UBYTE, count: part.joints.length / 4, target: ARRAY,
    });
    prim.attributes.WEIGHTS_0 = bin.accessor(Float32Array.from(part.weights), {
      type: 'VEC4', componentType: FLOAT, count: part.weights.length / 4, target: ARRAY,
    });
  }
  return prim;
}

function inverseBinds(bin, bones, worlds) {
  const mats = new Float32Array(bones.length * 16);
  bones.forEach((b, i) => {
    const [x, y, z] = worlds[b.name];
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1];
    mats.set(m, i * 16);
  });
  return bin.accessor(mats, { type: 'MAT4', componentType: FLOAT, count: bones.length });
}

function clipChannels(bin, bones, index, keys) {
  const samplers = [];
  const channels = [];
  for (const [name, frames] of Object.entries(keys)) {
    if (index[name] == null) continue;
    const times = Float32Array.from(frames.map((f) => f[0]));
    const values = new Float32Array(frames.length * 4);
    frames.forEach((f, i) => {
      const q = quat(f[1], f[2], f[3]);
      values.set(q, i * 4);
    });
    const input = bin.accessor(times, {
      type: 'SCALAR', componentType: FLOAT, count: times.length,
      min: [times[0]], max: [times[times.length - 1]],
    });
    const output = bin.accessor(values, {
      type: 'VEC4', componentType: FLOAT, count: frames.length,
    });
    const sampler = samplers.length;
    samplers.push({ input, output, interpolation: 'LINEAR' });
    channels.push({ sampler, target: { node: index[name], path: 'rotation' } });
  }
  return { samplers, channels };
}

const CLIPS = {
  idle: {
    duration: 2,
    spine: [[0, 0, 0, 0], [1, 0.05, 0, 0], [2, 0, 0, 0]],
    chest: [[0, 0, 0, 0], [1, 0.03, 0, 0], [2, 0, 0, 0]],
  },
  walk: {
    duration: 1,
    upperLegL: [[0, 0.5, 0, 0], [0.5, -0.5, 0, 0], [1, 0.5, 0, 0]],
    upperLegR: [[0, -0.5, 0, 0], [0.5, 0.5, 0, 0], [1, -0.5, 0, 0]],
    lowerLegL: [[0, 0.15, 0, 0], [0.5, 0.85, 0, 0], [1, 0.15, 0, 0]],
    lowerLegR: [[0, 0.85, 0, 0], [0.5, 0.15, 0, 0], [1, 0.85, 0, 0]],
    upperArmL: [[0, 0.4, 0, 0], [0.5, -0.4, 0, 0], [1, 0.4, 0, 0]],
    upperArmR: [[0, -0.4, 0, 0], [0.5, 0.4, 0, 0], [1, -0.4, 0, 0]],
  },
  talk: {
    duration: 0.8,
    upperArmR: [[0, -0.35, -0.1, 0], [0.4, -0.7, -0.15, 0], [0.8, -0.35, -0.1, 0]],
    lowerArmR: [[0, 0.2, 0, 0], [0.4, 0.55, 0, 0], [0.8, 0.2, 0, 0]],
  },
  point: {
    duration: 0.6,
    upperArmR: [[0, 0, 0, 0], [0.6, -0.7, -0.15, 0.15]],
    lowerArmR: [[0, 0, 0, 0], [0.6, 0.15, 0, 0]],
  },
  handsOnChest: {
    duration: 0.5,
    upperArmL: [[0, 0, 0, 0], [0.5, -0.9, 0.2, 0.4]],
    upperArmR: [[0, 0, 0, 0], [0.5, -0.9, -0.2, -0.4]],
    lowerArmL: [[0, 0, 0, 0], [0.5, 1.2, 0, 0]],
    lowerArmR: [[0, 0, 0, 0], [0.5, 1.2, 0, 0]],
  },
  raiseArm: {
    duration: 0.5,
    upperArmR: [[0, 0, 0, 0], [0.5, -2.4, -0.1, -0.15]],
  },
  kneel: {
    duration: 0.6,
    upperLegL: [[0, 0, 0, 0], [0.6, -1.2, 0, 0]],
    upperLegR: [[0, 0, 0, 0], [0.6, -1.2, 0, 0]],
    lowerLegL: [[0, 0, 0, 0], [0.6, 1.5, 0, 0]],
    lowerLegR: [[0, 0, 0, 0], [0.6, 1.5, 0, 0]],
    chest: [[0, 0, 0, 0], [0.6, 0.25, 0, 0]],
  },
  bow: {
    duration: 0.7,
    spine: [[0, 0, 0, 0], [0.7, 0.7, 0, 0]],
    chest: [[0, 0, 0, 0], [0.7, 0.35, 0, 0]],
    head: [[0, 0, 0, 0], [0.7, 0.25, 0, 0]],
  },
  give: {
    duration: 0.45,
    upperArmR: [[0, 0, 0, 0], [0.45, -1.0, -0.35, 0]],
    lowerArmR: [[0, 0, 0, 0], [0.45, 0.35, 0, 0]],
  },
  weep: {
    duration: 0.5,
    upperArmL: [[0, 0, 0, 0], [0.5, -1.1, 0, 0.25]],
    upperArmR: [[0, 0, 0, 0], [0.5, -1.1, 0, -0.25]],
    lowerArmL: [[0, 0, 0, 0], [0.5, 1.3, 0, 0]],
    lowerArmR: [[0, 0, 0, 0], [0.5, 1.3, 0, 0]],
    head: [[0, 0, 0, 0], [0.5, 0.35, 0, 0]],
  },
};

function buildFigure() {
  const bones = gltfBones(true);
  const { nodes, index } = nodesFrom(bones);
  const worlds = worldOf(bones);
  const cloth = emptyPart(true);
  const skin = emptyPart(true);
  const boxes = [
    ['hips', cloth, 0.34, 0.16, 0.18, 0, 0, 0],
    ['spine', cloth, 0.24, 0.16, 0.16, 0, 0.08, 0],
    ['chest', cloth, 0.46, 0.26, 0.22, 0, 0.08, 0],
    ['neck', skin, 0.1, 0.1, 0.1, 0, 0.05, 0],
    ['head', skin, 0.32, 0.34, 0.3, 0, 0.16, 0],
    ['upperArmL', cloth, 0.1, 0.26, 0.1, 0, -0.13, 0],
    ['lowerArmL', skin, 0.08, 0.22, 0.08, 0, -0.11, 0],
    ['handL', skin, 0.08, 0.08, 0.08, 0, -0.02, 0],
    ['upperArmR', cloth, 0.1, 0.26, 0.1, 0, -0.13, 0],
    ['lowerArmR', skin, 0.08, 0.22, 0.08, 0, -0.11, 0],
    ['handR', skin, 0.08, 0.08, 0.08, 0, -0.02, 0],
    ['upperLegL', cloth, 0.12, 0.38, 0.12, 0, -0.19, 0],
    ['lowerLegL', cloth, 0.1, 0.36, 0.1, 0, -0.18, 0],
    ['footL', cloth, 0.1, 0.08, 0.18, 0, -0.02, -0.02],
    ['upperLegR', cloth, 0.12, 0.38, 0.12, 0, -0.19, 0],
    ['lowerLegR', cloth, 0.1, 0.36, 0.1, 0, -0.18, 0],
    ['footR', cloth, 0.1, 0.08, 0.18, 0, -0.02, -0.02],
  ];
  for (const [bone, part, sx, sy, sz, lx, ly, lz] of boxes) {
    const w = worlds[bone];
    const ji = index[bone];
    addBox(part, w[0] + lx, w[1] + ly, w[2] + lz, sx, sy, sz, ji);
  }
  const bin = new Bin();
  const prims = [
    partPrimitive(bin, cloth, 0),
    partPrimitive(bin, skin, 1),
  ];
  const ibm = inverseBinds(bin, bones, worlds);
  const animations = [];
  for (const [name, spec] of Object.entries(CLIPS)) {
    const { samplers, channels } = clipChannels(bin, bones, index, spec);
    animations.push({ name, samplers, channels });
  }
  const meshNode = nodes.length;
  nodes.push({ name: 'Figure', mesh: 0, skin: 0 });
  const json = {
    asset: { version: '2.0', generator: 'ai-theater-make-actor-assets' },
    scene: 0,
    scenes: [{ nodes: [index.hips, meshNode] }],
    nodes,
    meshes: [{ name: 'Figure', primitives: prims }],
    skins: [{ name: 'Figure', inverseBindMatrices: ibm, joints: bones.map((_, i) => i), skeleton: index.hips }],
    materials: [
      { name: 'cloth', pbrMetallicRoughness: { baseColorFactor: [0.42, 0.3, 0.52, 1], metallicFactor: 0.02, roughnessFactor: 0.82 } },
      { name: 'skin', pbrMetallicRoughness: { baseColorFactor: [0.86, 0.67, 0.54, 1], metallicFactor: 0, roughnessFactor: 0.68 } },
    ],
    animations,
    accessors: bin.accessors,
    bufferViews: bin.bufferViews,
    buffers: [{ uri: 'theater-figure.bin', byteLength: bin.length }],
  };
  return { json, bin: bin.concat() };
}

function buildVrm() {
  const bones = vrmBones();
  const { nodes, index } = nodesFrom(bones);
  const worlds = worldOf(bones);
  const body = emptyPart(true);
  const parts = [
    ['hips', 0.32, 0.14, 0.16, 0, 0, 0],
    ['spine', 0.2, 0.16, 0.14, 0, 0.08, 0],
    ['chest', 0.4, 0.22, 0.18, 0, 0.06, 0],
    ['neck', 0.09, 0.1, 0.09, 0, 0.04, 0],
    ['leftUpperArm', 0.24, 0.09, 0.09, -0.12, 0, 0],
    ['leftLowerArm', 0.2, 0.07, 0.07, -0.1, 0, 0],
    ['leftHand', 0.08, 0.08, 0.06, -0.02, 0, 0],
    ['rightUpperArm', 0.24, 0.09, 0.09, 0.12, 0, 0],
    ['rightLowerArm', 0.2, 0.07, 0.07, 0.1, 0, 0],
    ['rightHand', 0.08, 0.08, 0.06, 0.02, 0, 0],
    ['leftUpperLeg', 0.12, 0.38, 0.12, 0, -0.18, 0],
    ['leftLowerLeg', 0.1, 0.36, 0.1, 0, -0.18, 0],
    ['leftFoot', 0.1, 0.07, 0.16, 0, -0.02, -0.02],
    ['rightUpperLeg', 0.12, 0.38, 0.12, 0, -0.18, 0],
    ['rightLowerLeg', 0.1, 0.36, 0.1, 0, -0.18, 0],
    ['rightFoot', 0.1, 0.07, 0.16, 0, -0.02, -0.02],
  ];
  for (const [bone, sx, sy, sz, lx, ly, lz] of parts) {
    const w = worlds[bone];
    addBox(body, w[0] + lx, w[1] + ly, w[2] + lz, sx, sy, sz, index[bone]);
  }
  const head = emptyPart(false);
  addBox(head, 0, 0.16, 0, 0.3, 0.32, 0.28, 0);
  const morphs = [
    morph(head.pos, (x, y, z) => y > 0.26 && z < -0.04, 0, 0.03, -0.01),
    morph(head.pos, (x, y, z) => y < 0.08 && z < -0.04, 0, -0.035, -0.02),
    morph(head.pos, (x, y, z) => y > 0.24 && z < -0.02, 0, -0.03, 0),
    morph(head.pos, (x, y, z) => y > 0.22 && Math.abs(x) > 0.04, 0, 0.02, 0.01),
    morph(head.pos, (x, y, z) => y > 0.18 && y < 0.28 && z < -0.06, 0, -0.04, 0),
    morph(head.pos, (x, y, z) => y > 0.2 && z < 0, 0, 0.025, -0.015),
    morph(head.pos, (x, y, z) => y > 0.22, 0, -0.01, 0.01),
  ];
  const eye = emptyPart(false);
  addBox(eye, 0, 0, -0.02, 0.05, 0.05, 0.04, 0);

  const bin = new Bin();
  const bodyPrim = partPrimitive(bin, body, 0);
  const headPrim = partPrimitive(bin, head, 1);
  headPrim.targets = morphs.map((delta) => ({
    POSITION: bin.accessor(delta, { type: 'VEC3', componentType: FLOAT, count: delta.length / 3 }),
  }));
  const eyePrim = partPrimitive(bin, eye, 2);
  const ibm = inverseBinds(bin, bones, worlds);

  const headMeshNode = nodes.length;
  nodes.push({ name: 'HeadMesh', mesh: 1 });
  nodes[index.head].children = nodes[index.head].children || [];
  nodes[index.head].children.push(headMeshNode);
  const leftEyeMesh = nodes.length;
  nodes.push({ name: 'LeftEyeMesh', mesh: 2 });
  nodes[index.leftEye].children = nodes[index.leftEye].children || [];
  nodes[index.leftEye].children.push(leftEyeMesh);
  const rightEyeMesh = nodes.length;
  nodes.push({ name: 'RightEyeMesh', mesh: 2 });
  nodes[index.rightEye].children = nodes[index.rightEye].children || [];
  nodes[index.rightEye].children.push(rightEyeMesh);

  const bodyNode = nodes.length;
  nodes.push({ name: 'Body', mesh: 0, skin: 0 });

  const human = (name) => ({ node: index[name] });
  const bind = (i) => ({ node: headMeshNode, index: i, weight: 1 });
  const json = {
    asset: { version: '2.0', generator: 'ai-theater-make-actor-assets' },
    extensionsUsed: ['VRMC_vrm'],
    extensions: {
      VRMC_vrm: {
        specVersion: '1.0',
        meta: {
          name: 'Theater CC0 Mannequin',
          version: '1.0',
          authors: ['AI Theater'],
          copyrightInformation: 'CC0. Original geometry for this repository.',
          licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
          avatarPermission: 'everyone',
          commercialUsage: 'personalProfit',
          creditNotation: 'unnecessary',
          modification: 'allowModificationRedistribution',
          allowExcessivelyViolentUsage: true,
          allowExcessivelySexualUsage: true,
          allowPoliticalOrReligiousUsage: true,
          allowAntisocialOrHateUsage: false,
          allowRedistribution: true,
        },
        humanoid: {
          humanBones: {
            hips: human('hips'),
            spine: human('spine'),
            chest: human('chest'),
            neck: human('neck'),
            head: human('head'),
            leftEye: human('leftEye'),
            rightEye: human('rightEye'),
            leftUpperArm: human('leftUpperArm'),
            leftLowerArm: human('leftLowerArm'),
            leftHand: human('leftHand'),
            rightUpperArm: human('rightUpperArm'),
            rightLowerArm: human('rightLowerArm'),
            rightHand: human('rightHand'),
            leftUpperLeg: human('leftUpperLeg'),
            leftLowerLeg: human('leftLowerLeg'),
            leftFoot: human('leftFoot'),
            rightUpperLeg: human('rightUpperLeg'),
            rightLowerLeg: human('rightLowerLeg'),
            rightFoot: human('rightFoot'),
          },
        },
        expressions: {
          preset: {
            happy: { morphTargetBinds: [bind(0)] },
            aa: { morphTargetBinds: [bind(1)] },
            angry: { morphTargetBinds: [bind(2)] },
            sad: { morphTargetBinds: [bind(3)] },
            blink: { morphTargetBinds: [bind(4)] },
            surprised: { morphTargetBinds: [bind(5)] },
            relaxed: { morphTargetBinds: [bind(6)] },
          },
        },
        lookAt: {
          type: 'bone',
          offsetFromHeadBone: [0, 0.08, 0],
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [index.hips, bodyNode] }],
    nodes,
    meshes: [
      { name: 'Body', primitives: [bodyPrim] },
      { name: 'Head', primitives: [headPrim] },
      { name: 'Eye', primitives: [eyePrim] },
    ],
    skins: [{ inverseBindMatrices: ibm, joints: bones.map((_, i) => i), skeleton: index.hips }],
    materials: [
      { name: 'cloth', pbrMetallicRoughness: { baseColorFactor: [0.75, 0.78, 0.86, 1], roughnessFactor: 0.55, metallicFactor: 0.08 } },
      { name: 'skin', pbrMetallicRoughness: { baseColorFactor: [0.93, 0.78, 0.68, 1], roughnessFactor: 0.6, metallicFactor: 0 } },
      { name: 'eye', pbrMetallicRoughness: { baseColorFactor: [0.12, 0.16, 0.22, 1], roughnessFactor: 0.3, metallicFactor: 0.1 } },
    ],
    accessors: bin.accessors,
    bufferViews: bin.bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  return { json, bin: bin.concat() };
}

function morph(positions, pred, dx, dy, dz) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    if (pred(positions[i], positions[i + 1], positions[i + 2])) {
      out[i] = dx;
      out[i + 1] = dy;
      out[i + 2] = dz;
    }
  }
  return out;
}

function toGlb(json, bin) {
  json.buffers[0].byteLength = bin.length;
  let jsonBuf = Buffer.from(JSON.stringify(json));
  const jpad = (4 - (jsonBuf.length % 4)) % 4;
  if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  const bpad = (4 - (bin.length % 4)) % 4;
  const binChunk = bpad ? Buffer.concat([bin, Buffer.alloc(bpad)]) : bin;
  const total = 12 + 8 + jsonBuf.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binChunk.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBuf, bh, binChunk]);
}

const figure = buildFigure();
const figDir = join(root, 'assets/actors/gltf');
mkdirSync(figDir, { recursive: true });
writeFileSync(join(figDir, 'theater-figure.gltf'), JSON.stringify(figure.json));
writeFileSync(join(figDir, 'theater-figure.bin'), figure.bin);

const vrm = buildVrm();
const vrmDir = join(root, 'assets/actors/vrm');
mkdirSync(vrmDir, { recursive: true });
writeFileSync(join(vrmDir, 'theater-cc0.vrm'), toGlb(vrm.json, vrm.bin));

console.log('gltf', figure.bin.length, 'vrm', vrm.bin.length);
