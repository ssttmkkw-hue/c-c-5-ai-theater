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
  sheet(pelvis, 0.48, 0.42, torsoMat, 0, -0.02, -0.01);
  const spine = joint(pelvis, 'spine', 0, 0.12, 0, joints);
  const chest = joint(spine, 'chest', 0, 0.16, 0, joints);
  sheet(chest, 0.52, 0.5, torsoMat, 0, 0.1, -0.02);
  const neck = joint(chest, 'neck', 0, 0.2, 0, joints);
  const head = joint(neck, 'head', 0, 0.06, 0, joints);
  // A flat card turns edge-on in a bow and disappears. A thick block stays a head.
  const skull = new THREE.Mesh(
    ownedGeo(new THREE.BoxGeometry(0.4, 0.46, 0.1)),
    new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 }),
  );
  skull.position.set(0, 0.16, -0.01);
  head.add(skull);
  sheet(head, 0.5, 0.54, headMat, 0, 0.16, -0.07);

  const eyeL = new THREE.Mesh(ownedGeo(new THREE.SphereGeometry(0.035, 8, 8)), skinMat);
  eyeL.position.set(-0.08, 0.2, -0.09);
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

  const browL = joint(head, 'browL', -0.08, 0.28, -0.1, joints);
  const browR = joint(head, 'browR', 0.08, 0.28, -0.1, joints);
  const browMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.8 });
  const browGeo = ownedGeo(new THREE.BoxGeometry(0.1, 0.02, 0.01));
  const bL = new THREE.Mesh(browGeo, browMat);
  browL.add(bL);
  browR.add(new THREE.Mesh(browGeo, browMat));

  const jaw = joint(head, 'jaw', 0, 0.06, -0.06, joints);
  const mouth = new THREE.Mesh(ownedGeo(new THREE.PlaneGeometry(0.12, 0.035)), mouthMat);
  mouth.position.set(0, 0, -0.04);
  mouth.rotation.y = Math.PI;
  jaw.add(mouth);

  const lidMat = new THREE.MeshStandardMaterial({ color: character.skin || '#e0b394', roughness: 0.7 });
  const lidGeo = ownedGeo(new THREE.PlaneGeometry(0.09, 0.05));
  const lidL = new THREE.Mesh(lidGeo, lidMat);
  lidL.position.set(-0.08, 0.22, -0.1);
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

  addPaperCostume(character.costume, color, head, chest, pelvis);

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

function addPaperCostume(costume, color, head, chest, pelvis) {
  const kind = costume || 'courtier';
  const crowned = kind === 'prince' || kind === 'king' || kind === 'queen' || kind === 'ghost';
  const cloaked = kind === 'prince' || kind === 'king' || kind === 'traveler' || kind === 'ghost' || kind === 'courtier';
  const skirted = kind === 'maiden' || kind === 'queen';
  if (crowned) {
    const crown = paint(160, 80, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = kind === 'ghost' ? '#e7f4f8' : '#e2b657';
      g.beginPath();
      g.moveTo(8, h - 8);
      g.lineTo(8, 36);
      g.lineTo(36, 8);
      g.lineTo(64, 40);
      g.lineTo(80, 6);
      g.lineTo(96, 40);
      g.lineTo(124, 8);
      g.lineTo(152, 36);
      g.lineTo(152, h - 8);
      g.closePath();
      g.fill();
      g.strokeStyle = '#241c18';
      g.lineWidth = 5;
      g.stroke();
    });
    sheet(head, 0.4, 0.18, crown, 0, 0.46, -0.08);
  }
  if (cloaked) {
    const cloakColor = kind === 'traveler' ? '#24523a' : kind === 'king' ? '#6e2430' : kind === 'ghost' ? '#d5e6ee' : kind === 'prince' ? '#243656' : shade(color, 0.55);
    const cloak = paint(128, 220, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = cloakColor;
      g.beginPath();
      g.moveTo(20, 8);
      g.lineTo(w - 20, 8);
      g.lineTo(w - 4, h - 6);
      g.lineTo(4, h - 6);
      g.closePath();
      g.fill();
      g.strokeStyle = '#241c18';
      g.lineWidth = 6;
      g.stroke();
    });
    sheet(chest, 0.72, 0.9, cloak, 0, -0.08, 0.06);
  }
  if (skirted) {
    const skirtColor = kind === 'queen' ? '#8d3d62' : '#f0d5c4';
    const skirt = paint(160, 200, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = skirtColor;
      g.beginPath();
      g.moveTo(46, 8);
      g.lineTo(w - 46, 8);
      g.lineTo(w - 6, h - 6);
      g.lineTo(6, h - 6);
      g.closePath();
      g.fill();
      g.strokeStyle = '#241c18';
      g.lineWidth = 6;
      g.stroke();
    });
    sheet(pelvis, 0.78, 0.62, skirt, 0, -0.36, -0.02);
  }
  if (kind === 'traveler' || kind === 'visitor' || kind === 'courtier') {
    const hat = paint(128, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = kind === 'visitor' ? '#2c3a55' : '#4a3424';
      g.fillRect(28, 8, 72, 28);
      g.fillRect(8, 34, w - 16, 16);
      g.strokeStyle = '#241c18';
      g.lineWidth = 4;
      g.strokeRect(28, 8, 72, 28);
      g.strokeRect(8, 34, w - 16, 16);
    });
    sheet(head, 0.42, 0.16, hat, 0, 0.44, -0.06);
  }
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(amount);
  return `#${c.getHexString()}`;
}
