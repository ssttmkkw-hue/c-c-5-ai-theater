import * as THREE from 'three';

function owned(geo) {
  geo.userData.owned = true;
  return geo;
}

/**
 * Eye and mouth cards for a block head that has no face texture.
 * The figure faces -Z. Offsets match the generated glTF and VRM head box.
 */
export function attachBlockFace(head, skin = '#e0b394') {
  if (!head) return { lidL: null, lidR: null, mouth: null };
  const eyeGeo = owned(new THREE.PlaneGeometry(0.07, 0.038));
  const lidGeo = owned(new THREE.PlaneGeometry(0.078, 0.042));
  const mouthGeo = owned(new THREE.PlaneGeometry(0.09, 0.028));
  const white = new THREE.MeshBasicMaterial({ color: '#f6f1ea' });
  const dark = new THREE.MeshBasicMaterial({ color: '#1c140f' });
  const lidMat = new THREE.MeshBasicMaterial({ color: skin });
  const mouthMat = new THREE.MeshBasicMaterial({ color: '#7a3b42' });

  const eye = (x) => {
    const group = new THREE.Group();
    group.position.set(x, 0.22, -0.175);
    const whiteMesh = new THREE.Mesh(eyeGeo, white);
    whiteMesh.rotation.y = Math.PI;
    group.add(whiteMesh);
    const pupil = new THREE.Mesh(owned(new THREE.PlaneGeometry(0.026, 0.03)), dark);
    pupil.position.z = -0.004;
    pupil.rotation.y = Math.PI;
    group.add(pupil);
    head.add(group);
  };
  eye(-0.065);
  eye(0.065);

  const lid = (x) => {
    const mesh = new THREE.Mesh(lidGeo, lidMat);
    mesh.position.set(x, 0.232, -0.182);
    mesh.rotation.y = Math.PI;
    mesh.scale.y = 0.12;
    head.add(mesh);
    return mesh;
  };
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, 0.09, -0.175);
  mouth.rotation.y = Math.PI;
  head.add(mouth);
  return { lidL: lid(-0.065), lidR: lid(0.065), mouth };
}
