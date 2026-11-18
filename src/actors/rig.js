import * as THREE from 'three';

/**
 * Procedural chibi mannequin.
 * Joints: root, pelvis, spine, chest, neck, head, jaw,
 * shoulders, elbows, wrists, hips, knees, ankles.
 * The figure faces -Z (toward the house) when rotation.y is 0.
 * Arms and legs hang along -Y at rest, so a walk is just a swing.
 */

const GEO = {
  pelvis: new THREE.BoxGeometry(0.28, 0.14, 0.16),
  spine: new THREE.BoxGeometry(0.2, 0.16, 0.14),
  chest: new THREE.BoxGeometry(0.36, 0.22, 0.18),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.09, 8),
  head: new THREE.SphereGeometry(0.23, 16, 14),
  eye: new THREE.SphereGeometry(0.045, 8, 8),
  pupil: new THREE.SphereGeometry(0.026, 8, 8),
  lid: new THREE.BoxGeometry(0.09, 0.07, 0.02),
  brow: new THREE.BoxGeometry(0.11, 0.028, 0.03),
  mouth: new THREE.BoxGeometry(0.09, 0.025, 0.02),
  nose: new THREE.SphereGeometry(0.035, 8, 8),
  hand: new THREE.SphereGeometry(0.055, 8, 8),
  foot: new THREE.BoxGeometry(0.1, 0.06, 0.18),
  hair: new THREE.SphereGeometry(0.24, 14, 12),
  skirt: new THREE.ConeGeometry(0.34, 0.55, 10),
  robe: new THREE.ConeGeometry(0.42, 0.95, 10),
  cloak: new THREE.BoxGeometry(0.46, 0.7, 0.06),
  crownBand: new THREE.TorusGeometry(0.16, 0.025, 6, 14),
  spike: new THREE.ConeGeometry(0.04, 0.12, 5),
  flower: new THREE.SphereGeometry(0.045, 6, 6),
  sword: new THREE.BoxGeometry(0.03, 0.72, 0.04),
  hat: new THREE.CylinderGeometry(0.16, 0.18, 0.1, 10),
  belt: new THREE.BoxGeometry(0.3, 0.05, 0.18),
};

function limbGeo(length, radius) {
  const mid = Math.max(0.04, length - radius * 2);
  return new THREE.CapsuleGeometry(radius, mid, 3, 6);
}

function std(color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extras.roughness ?? 0.7,
    metalness: extras.metalness ?? 0.04,
    emissive: extras.emissive ?? 0x000000,
    emissiveIntensity: extras.emissiveIntensity ?? 0,
    transparent: extras.transparent ?? false,
    opacity: extras.opacity ?? 1,
  });
}

function mesh(geo, material, parent, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function joint(parent, name, x, y, z, joints) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  if (name.startsWith('shoulder')) g.rotation.order = 'ZXY';
  parent.add(g);
  joints[name] = g;
  return g;
}

export function createRig(character) {
  const costume = character.costume || 'courtier';
  const ghost = costume === 'ghost';
  const joints = {};
  const materials = [];
  const track = (m) => {
    materials.push(m);
    return m;
  };

  const skin = track(std(character.skin || '#e0b394', { roughness: 0.62 }));
  const cloth = track(std(character.color || '#7a5a3a', { roughness: 0.78 }));
  const clothDark = track(std(shade(character.color || '#7a5a3a', 0.62), { roughness: 0.8 }));
  const hairMat = track(std(character.hair || '#2c241c', { roughness: 0.85 }));
  const gold = track(std('#e2b657', { roughness: 0.35, metalness: 0.55 }));
  const shoe = track(std('#2a211c', { roughness: 0.6 }));
  const white = track(std('#f4f1ea', { roughness: 0.4 }));
  const pupil = track(std('#1a120c', { roughness: 0.4 }));
  const mouthMat = track(std('#7a3b42', { roughness: 0.5 }));

  const root = new THREE.Group();
  root.name = `actor-${character.id || 'x'}`;

  const pelvis = joint(root, 'pelvis', 0, 0.9, 0, joints);
  mesh(GEO.pelvis, clothDark, pelvis, 0, 0, 0);

  const spine = joint(pelvis, 'spine', 0, 0.12, 0, joints);
  mesh(GEO.spine, cloth, spine, 0, 0.08, 0);

  const chest = joint(spine, 'chest', 0, 0.16, 0, joints);
  mesh(GEO.chest, cloth, chest, 0, 0.08, 0);
  mesh(GEO.belt, gold, chest, 0, -0.08, 0.01);

  const neck = joint(chest, 'neck', 0, 0.2, 0, joints);
  mesh(GEO.neck, skin, neck, 0, 0.04, 0);

  const head = joint(neck, 'head', 0, 0.1, 0, joints);
  mesh(GEO.head, skin, head, 0, 0.2, 0);
  mesh(GEO.nose, skin, head, 0, 0.18, -0.2);

  const eyeL = mesh(GEO.eye, white, head, -0.08, 0.24, -0.17);
  const eyeR = mesh(GEO.eye, white, head, 0.08, 0.24, -0.17);
  const pupilL = mesh(GEO.pupil, pupil, eyeL, 0, 0, -0.03);
  const pupilR = mesh(GEO.pupil, pupil, eyeR, 0, 0, -0.03);
  const lidL = mesh(GEO.lid, skin, head, -0.08, 0.25, -0.2);
  const lidR = mesh(GEO.lid, skin, head, 0.08, 0.25, -0.2);
  const browL = joint(head, 'browL', -0.08, 0.31, -0.2, joints);
  const browR = joint(head, 'browR', 0.08, 0.31, -0.2, joints);
  mesh(GEO.brow, hairMat, browL, 0, 0, 0);
  mesh(GEO.brow, hairMat, browR, 0, 0, 0);
  lidL.scale.y = 0.12;
  lidR.scale.y = 0.12;

  const jaw = joint(head, 'jaw', 0, 0.1, -0.12, joints);
  const mouth = mesh(GEO.mouth, mouthMat, jaw, 0, 0, -0.08);

  const hair = mesh(GEO.hair, hairMat, head, 0, 0.3, 0.02);
  hair.scale.set(1, 0.72, 1);

  const arm = (side) => {
    const s = side === 'L' ? -1 : 1;
    const shoulder = joint(chest, `shoulder${side}`, s * 0.2, 0.14, 0, joints);
    mesh(limbGeo(0.24, 0.05), cloth, shoulder, 0, -0.12, 0);
    const elbow = joint(shoulder, `elbow${side}`, 0, -0.24, 0, joints);
    mesh(limbGeo(0.22, 0.042), skin, elbow, 0, -0.11, 0);
    const wrist = joint(elbow, `wrist${side}`, 0, -0.22, 0, joints);
    mesh(GEO.hand, skin, wrist, 0, -0.04, 0);
    return wrist;
  };
  const wristL = arm('L');
  const wristR = arm('R');

  const leg = (side) => {
    const s = side === 'L' ? -1 : 1;
    const hip = joint(pelvis, `hip${side}`, s * 0.1, -0.04, 0, joints);
    mesh(limbGeo(0.4, 0.07), clothDark, hip, 0, -0.2, 0);
    const knee = joint(hip, `knee${side}`, 0, -0.4, 0, joints);
    mesh(limbGeo(0.38, 0.055), clothDark, knee, 0, -0.19, 0);
    const ankle = joint(knee, `ankle${side}`, 0, -0.38, 0, joints);
    mesh(GEO.foot, shoe, ankle, 0, -0.04, -0.02);
  };
  leg('L');
  leg('R');

  const sword = mesh(GEO.sword, track(std('#cfd6de', { metalness: 0.7, roughness: 0.28 })), wristR, 0, -0.42, 0);
  sword.visible = false;

  dress(costume, {
    chest, head, pelvis, cloth, clothDark, hairMat, gold, white, skin, track, mesh, hair, ghost,
  });

  if (ghost) {
    root.scale.set(1.02, 1.1, 1.02);
    for (const m of materials) {
      m.transparent = true;
      m.opacity = Math.min(m.opacity ?? 1, 0.8);
      m.emissive = new THREE.Color('#9fd4e4');
      m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.28);
      m.depthWrite = true;
    }
    pupil.emissive = new THREE.Color('#e8fbff');
    pupil.emissiveIntensity = 0.8;
    const glow = new THREE.PointLight('#b7e4f2', 0.55, 3.2, 2);
    glow.position.set(0, 1.3, -0.1);
    root.add(glow);
  }

  return { root, joints, materials, sword, lidL, lidR, mouth, eyeL, eyeR, pupilL, pupilR, browL, browR, ghost };
}

function dress(costume, kit) {
  const { chest, head, pelvis, gold, white, hairMat, track, hair } = kit;
  if (costume === 'prince') {
    mesh(GEO.cloak, track(std('#243656', { roughness: 0.85 })), chest, 0, -0.05, 0.12);
    mesh(GEO.crownBand, gold, head, 0, 0.4, 0);
    mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12), white, chest, 0, 0.16, -0.08);
  } else if (costume === 'maiden') {
    const skirt = mesh(GEO.skirt, track(std('#f0d5c4', { roughness: 0.86 })), pelvis, 0, -0.28, 0);
    skirt.castShadow = true;
    hair.scale.set(1.05, 0.8, 1.15);
    mesh(new THREE.CapsuleGeometry(0.06, 0.28, 3, 6), hairMat, head, 0, 0.05, 0.16);
    mesh(GEO.flower, track(std('#d4546a')), head, 0.16, 0.34, -0.02);
    mesh(GEO.flower, track(std('#f2f0ea')), head, 0.2, 0.3, 0.02);
  } else if (costume === 'king') {
    const robe = mesh(GEO.robe, track(std('#6e2430', { roughness: 0.8 })), pelvis, 0, -0.42, 0);
    robe.castShadow = true;
    mesh(GEO.crownBand, gold, head, 0, 0.42, 0);
    for (let i = 0; i < 5; i++) {
      const spike = mesh(GEO.spike, gold, head, 0, 0.5, 0);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.sin(a) * 0.13, 0.5, Math.cos(a) * 0.13);
    }
    mesh(new THREE.ConeGeometry(0.07, 0.16, 6), hairMat, head, 0, 0.12, -0.16);
    hair.scale.set(0.2, 0.2, 0.2);
  } else if (costume === 'queen') {
    const gown = mesh(new THREE.ConeGeometry(0.46, 1.05, 12), track(std('#8d3d62', { roughness: 0.75 })), pelvis, 0, -0.4, 0);
    gown.castShadow = true;
    mesh(GEO.crownBand, gold, head, 0, 0.42, 0);
    mesh(GEO.spike, gold, head, 0, 0.52, 0);
    hair.scale.set(1.05, 0.9, 1.05);
    hair.position.y = 0.32;
  } else if (costume === 'ghost') {
    const cloak = mesh(new THREE.ConeGeometry(0.5, 1.25, 8), track(std('#d5e6ee', {
      transparent: true, opacity: 0.72, emissive: '#8ec7d6', emissiveIntensity: 0.4, roughness: 0.45,
    })), pelvis, 0, -0.35, 0);
    cloak.castShadow = false;
    mesh(GEO.crownBand, track(std('#e7f4f8', { emissive: '#b7e0ec', emissiveIntensity: 0.5, transparent: true, opacity: 0.85 })), head, 0, 0.4, 0);
    hair.visible = false;
  } else if (costume === 'traveler') {
    mesh(GEO.cloak, track(std('#24523a', { roughness: 0.88 })), chest, 0, -0.15, 0.12);
    mesh(GEO.hat, track(std('#3a2a1c')), head, 0, 0.42, 0);
    hair.scale.set(0.7, 0.45, 0.7);
  } else if (costume === 'visitor') {
    mesh(new THREE.BoxGeometry(0.4, 0.28, 0.2), track(std('#d4543c', { roughness: 0.65 })), chest, 0, 0.06, -0.02);
    mesh(GEO.hat, track(std('#2c3a55')), head, 0, 0.4, 0.02);
    hair.scale.set(0.85, 0.55, 0.9);
  } else {
    mesh(GEO.hat, track(std('#4a3424')), head, 0, 0.4, 0);
    mesh(new THREE.BoxGeometry(0.18, 0.22, 0.04), track(std('#efe6d4')), chest, 0, 0.08, -0.1);
  }
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(amount);
  return `#${c.getHexString()}`;
}
