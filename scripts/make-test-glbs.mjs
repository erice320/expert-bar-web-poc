// Generates throwaway GLBs (skinned+walk clip, static prop) to exercise the v0.3 loader
// without Higgsfield assets. NOT shipped: writes to ./test-models (gitignored) by default.
// Usage: node scripts/make-test-glbs.mjs [outDir]   then copy into dist/models/... to try them.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const out = process.argv[2] || 'test-models';
fs.mkdirSync(path.join(out, 'characters'), { recursive: true });
fs.mkdirSync(path.join(out, 'props'), { recursive: true });

function exportGlb(scene, animations, file) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(scene, (buf) => {
      fs.writeFileSync(file, Buffer.from(buf));
      console.log('wrote', file, buf.byteLength, 'bytes');
      resolve();
    }, reject, { binary: true, animations });
  });
}

function skinnedPerson(color) {
  const geo = new THREE.CylinderGeometry(0.25, 0.25, 2, 8, 8);
  geo.translate(0, 1, 0);
  const pos = geo.attributes.position;
  const idx = [], wts = [];
  for (let i = 0; i < pos.count; i++) {
    const w = THREE.MathUtils.clamp(pos.getY(i) / 2, 0, 1);
    idx.push(0, 1, 0, 0);
    wts.push(1 - w, w, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  const hips = new THREE.Bone(); hips.name = 'Hips';
  const chest = new THREE.Bone(); chest.name = 'Chest'; chest.position.y = 1;
  hips.add(chest);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.6 }));
  mesh.add(hips);
  mesh.bind(new THREE.Skeleton([hips, chest]));
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  nose.position.set(0, 1.8, 0.3);
  hips.add(nose);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const q = (a) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)).toArray();
  const walk = new THREE.AnimationClip('Casual_Walk', 1, [
    new THREE.QuaternionKeyframeTrack('Chest.quaternion', [0, 0.5, 1], [...q(-0.3), ...q(0.3), ...q(-0.3)]),
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 0, 0, 5]),
  ]);
  return { scene, animations: [walk] };
}

const colors = { 'av-a': 0x2c8fbf, 'av-b': 0x1a3756, 'av-c': 0x556b2f, 'av-d': 0x7ba3c9 };
for (const [name, color] of Object.entries(colors)) {
  const { scene, animations } = skinnedPerson(color);
  await exportGlb(scene, animations, path.join(out, 'characters', `${name}.glb`));
}

const chair = new THREE.Scene();
const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x999999 }));
seat.position.y = 0.45;
const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.08), new THREE.MeshStandardMaterial({ color: 0x999999 }));
back.position.set(0, 0.7, -0.26);
chair.add(seat, back);
await exportGlb(chair, [], path.join(out, 'props', 'lounge-chair.glb'));

const planter = new THREE.Scene();
planter.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 1.3, 12), new THREE.MeshStandardMaterial({ color: 0x2e8b57 })));
planter.children[0].position.y = 0.65;
await exportGlb(planter, [], path.join(out, 'props', 'planter.glb'));
