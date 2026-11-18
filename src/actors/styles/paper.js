import * as THREE from 'three';

/**
 * Layered paper puppet. All art is drawn here on canvas — nothing vendored.
 * Joint names match the procedural rig so the same pose table drives it.
 */

function ownedGeo(geo) {
  geo.userData.owned = true;
  return geo;
}

function paint(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  draw(g, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.owned = true;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.06,
  });
  return mat;
}

function sheet(parent, w, h, mat, x, y, z) {
  const mesh = new THREE.Mesh(ownedGeo(new THREE.PlaneGeometry(w, h)), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.PI;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
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

function card(color) {
  return paint(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f4efe4';
    round(g, 8, 8, w - 16, h - 16, 18);
    g.fill();
    g.strokeStyle = '#241c18';
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = color;
    round(g, 18, 18, w - 36, h - 36, 12);
    g.fill();
    g.strokeStyle = 'rgba(36,28,24,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(24, 40);
    g.lineTo(w - 24, 48);
    g.stroke();
  });
}

function headCard(hair) {
  return paint(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(w / 2, 78, 92, 70, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#f3d2b8';
    g.beginPath();
    g.ellipse(w / 2, 132, 86, 96, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#241c18';
    g.lineWidth = 7;
    g.stroke();
    g.fillStyle = '#fffaf4';
    g.beginPath();
    g.ellipse(92, 128, 22, 16, 0, 0, Math.PI * 2);
    g.ellipse(164, 128, 22, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#241c18';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#e7a090';
    g.beginPath();
    g.ellipse(70, 160, 14, 8, 0, 0, Math.PI * 2);
    g.ellipse(186, 160, 14, 8, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function createPaperRig(character) {
  const joints = {};
  const color = character.color || '#7a5a3a';
  const hair = character.hair || '#2c241c';
  const root = new THREE.Group();
  root.name = `paper-${character.id || 'x'}`;

  const torsoMat = card(color);
  const limbMat = card(shade(color, 0.72));
  const legMat = card(shade(color, 0.55));
  const headMat = headCard(hair);
  const skinMat = new THREE.MeshStandardMaterial({ color: character.skin || '#e0b394', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 0.4 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: '#7a3b42', roughness: 0.5 });

  const pelvis = joint(root, 'pelvis', 0, 0.9, 0, joints);
  sheet(pelvis, 0.46, 0.28, torsoMat, 0, 0.02, 0);
  const spine = joint(pelvis, 'spine', 0, 0.12, 0, joints);
  const chest = joint(spine, 'chest', 0, 0.16, 0, joints);
  sheet(chest, 0.52, 0.46, torsoMat, 0, 0.12, -0.01);
  const neck = joint(chest, 'neck', 0, 0.28, 0, joints);
  const head = joint(neck, 'head', 0, 0.08, 0, joints);
  sheet(head, 0.52, 0.56, headMat, 0, 0.22, -0.02);

  const eyeL = new THREE.Mesh(ownedGeo(new THREE.SphereGeometry(0.035, 8, 8)), skinMat);
  eyeL.position.set(-0.08, 0.26, -0.03);
  eyeL.scale.z = 0.4;
  head.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08;
  head.add(eyeR);
  const pupilL = new THREE.Mesh(ownedGeo(new THREE.SphereGeometry(0.018, 8, 8)), dark);
  pupilL.position.set(0, 0, -0.03);
  eyeL.add(pupilL);
  const pupilR = pupilL.clone();
  eyeR.add(pupilR);

  const browL = joint(head, 'browL', -0.08, 0.34, -0.04, joints);
  const browR = joint(head, 'browR', 0.08, 0.34, -0.04, joints);
  const browMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.8 });
  const browGeo = ownedGeo(new THREE.BoxGeometry(0.1, 0.02, 0.01));
  const bL = new THREE.Mesh(browGeo, browMat);
  browL.add(bL);
  browR.add(new THREE.Mesh(browGeo, browMat));

  const jaw = joint(head, 'jaw', 0, 0.08, -0.02, joints);
  const mouth = new THREE.Mesh(ownedGeo(new THREE.PlaneGeometry(0.12, 0.035)), mouthMat);
  mouth.position.set(0, 0, -0.04);
  mouth.rotation.y = Math.PI;
  jaw.add(mouth);

  const lidMat = new THREE.MeshStandardMaterial({ color: character.skin || '#e0b394', roughness: 0.7 });
  const lidGeo = ownedGeo(new THREE.PlaneGeometry(0.09, 0.05));
  const lidL = new THREE.Mesh(lidGeo, lidMat);
  lidL.position.set(-0.08, 0.3, -0.045);
  lidL.rotation.y = Math.PI;
  lidL.scale.y = 0.12;
  head.add(lidL);
  const lidR = lidL.clone();
  lidR.position.x = 0.08;
  head.add(lidR);

  const arm = (side) => {
    const s = side === 'L' ? -1 : 1;
    const shoulder = joint(chest, `shoulder${side}`, s * 0.28, 0.22, 0, joints);
    sheet(shoulder, 0.16, 0.42, limbMat, 0, -0.2, 0);
    const elbow = joint(shoulder, `elbow${side}`, 0, -0.4, 0, joints);
    sheet(elbow, 0.14, 0.36, limbMat, 0, -0.16, 0.01);
    const wrist = joint(elbow, `wrist${side}`, 0, -0.34, 0, joints);
    sheet(wrist, 0.12, 0.12, paint(64, 64, (g, w, h) => {
      g.fillStyle = '#f3d2b8';
      g.beginPath();
      g.arc(w / 2, h / 2, 26, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#241c18';
      g.lineWidth = 6;
      g.stroke();
    }), 0, -0.04, 0.02);
    return wrist;
  };
  arm('L');
  const wristR = arm('R');

  const leg = (side) => {
    const s = side === 'L' ? -1 : 1;
    const hip = joint(pelvis, `hip${side}`, s * 0.12, -0.08, 0, joints);
    sheet(hip, 0.18, 0.46, legMat, 0, -0.22, 0);
    const knee = joint(hip, `knee${side}`, 0, -0.44, 0, joints);
    sheet(knee, 0.16, 0.42, legMat, 0, -0.2, 0.01);
    const ankle = joint(knee, `ankle${side}`, 0, -0.4, 0, joints);
    sheet(ankle, 0.16, 0.08, paint(64, 32, (g, w, h) => {
      g.fillStyle = '#241c18';
      g.fillRect(2, 4, w - 4, h - 8);
    }), 0, -0.02, -0.02);
  };
  leg('L');
  leg('R');

  const sword = new THREE.Mesh(
    ownedGeo(new THREE.BoxGeometry(0.03, 0.7, 0.01)),
    new THREE.MeshStandardMaterial({ color: '#d5dbe3', metalness: 0.4, roughness: 0.3 }),
  );
  sword.position.set(0, -0.4, 0);
  sword.visible = false;
  wristR.add(sword);

  return {
    root,
    joints,
    sword,
    lidL,
    lidR,
    mouth,
    pupilL,
    pupilR,
    styleId: 'paper',
    ik: false,
    clip: null,
  };
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(amount);
  return `#${c.getHexString()}`;
}
