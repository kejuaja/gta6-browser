// Street furniture and greenery as instanced meshes (one draw per part, however many there are):
// leafy street trees, bushes, benches, bins, hydrants, newspaper boxes, planters, bollards, bus
// shelters and traffic lights. Where they stand comes from citymap.js.
import * as THREE from 'three';
import { mergeGeometries } from './batch.js';

function at(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return geo.clone().applyMatrix4(m);
}

const box = (w, h, d, x, y, z, ry = 0) => at(new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry);
const cyl = (r, h, x, y, z, seg = 10) => at(new THREE.CylinderGeometry(r, r, h, seg), x, y, z);

/** Each prop type: its parts, each a geometry (front faces +z) and a material. */
function propParts() {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2d3238, roughness: 0.45, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 0.8 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc8c2b8, roughness: 0.95 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 0.85, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc6dc, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45 });
  return {
    bench: [
      [mergeGeometries([box(1.8, 0.06, 0.45, 0, 0.45, 0), box(1.8, 0.4, 0.06, 0, 0.72, -0.2)]), wood],
      [mergeGeometries([box(0.06, 0.45, 0.45, -0.8, 0.22, 0), box(0.06, 0.45, 0.45, 0.8, 0.22, 0), box(0.06, 0.5, 0.06, -0.8, 0.7, -0.22), box(0.06, 0.5, 0.06, 0.8, 0.7, -0.22)]), metal],
    ],
    bin: [
      [mergeGeometries([cyl(0.28, 0.85, 0, 0.43, 0, 12), cyl(0.31, 0.06, 0, 0.88, 0, 12)]), new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.6, metalness: 0.3 })],
    ],
    hydrant: [
      [mergeGeometries([cyl(0.13, 0.6, 0, 0.3, 0), at(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.6, 0), at(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), 0, 0.42, 0, 0, 0, Math.PI / 2)]), new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.5 })],
    ],
    newsbox: [
      [box(0.5, 1.0, 0.45, 0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x1d6fd6, roughness: 0.5 })],
      [box(0.4, 0.3, 0.02, 0, 0.75, 0.23), glassMat],
    ],
    planter: [
      [box(1.4, 0.55, 1.4, 0, 0.28, 0), concrete],
      [at(new THREE.IcosahedronGeometry(0.75, 1), 0, 0.85, 0, 0, 0, 0, 1, 0.75, 1), leaf],
    ],
    bollard: [
      [mergeGeometries([cyl(0.18, 0.7, 0, 0.35, 0), cyl(0.24, 0.12, 0, 0.72, 0)]), new THREE.MeshStandardMaterial({ color: 0xf0a030, roughness: 0.6 })],
    ],
    bush: [
      [at(new THREE.IcosahedronGeometry(0.8, 1), 0, 0.55, 0, 0, 0, 0, 1.2, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0x3f7f35, roughness: 0.9, flatShading: true })],
    ],
    busstop: [
      [mergeGeometries([box(4.2, 0.08, 1.6, 0, 2.6, -0.1), box(0.08, 2.6, 0.08, -2.05, 1.3, -0.8), box(0.08, 2.6, 0.08, 2.05, 1.3, -0.8), box(0.08, 2.6, 0.08, -2.05, 1.3, 0.55), box(0.08, 2.6, 0.08, 2.05, 1.3, 0.55), box(3, 0.06, 0.4, 0, 0.5, -0.55)]), metal],
      [mergeGeometries([box(4.0, 2.2, 0.04, 0, 1.4, -0.82), box(0.04, 2.0, 1.2, -2.05, 1.4, -0.15)]), glassMat],
      [box(1.1, 1.9, 0.1, 2.0, 1.25, 0.55, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff7eb6, emissiveIntensity: 0.9 })],
    ],
    signal: [
      [mergeGeometries([cyl(0.08, 4.6, 0, 2.3, 0, 8), box(0.34, 1.0, 0.3, 0, 4.0, 0.2)]), metal],
      [mergeGeometries([at(new THREE.SphereGeometry(0.1, 8, 6), 0, 4.32, 0.36)]), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 2.5 })],
      [mergeGeometries([at(new THREE.SphereGeometry(0.1, 8, 6), 0, 3.72, 0.36)]), new THREE.MeshStandardMaterial({ color: 0x30ff70, emissive: 0x20ff60, emissiveIntensity: 2.5 })],
    ],
  };
}

function instanced(scene, geo, material, items, shadow = true) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  items.forEach((it, n) => {
    e.set(0, it.ry ?? 0, 0);
    q.setFromEuler(e);
    s.setScalar(it.s ?? 1);
    p.set(it.x, it.y ?? 0.2, it.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function makeTrees(scene, city) {
  const trunk = mergeGeometries([at(new THREE.CylinderGeometry(0.14, 0.22, 3.2, 7), 0, 1.6, 0), at(new THREE.CylinderGeometry(0.06, 0.1, 1.4, 5), 0.35, 3.1, 0, 0, 0, -0.6)]);
  const crown = mergeGeometries([
    at(new THREE.IcosahedronGeometry(1.7, 1), 0, 4.2, 0),
    at(new THREE.IcosahedronGeometry(1.2, 1), 0.9, 3.8, 0.4),
    at(new THREE.IcosahedronGeometry(1.15, 1), -0.8, 3.9, -0.5),
    at(new THREE.IcosahedronGeometry(1.0, 1), 0.1, 5.2, 0.2),
  ]);
  const items = city.trees.map((t, n) => ({ x: t.x, z: t.z, s: t.s, ry: n * 1.7 }));
  instanced(scene, trunk, new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1 }), items);
  const crowns = instanced(scene, crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), items);
  if (crowns) {
    const tints = [0x4f8f3a, 0x5fa040, 0x3f7a35];
    const c = new THREE.Color();
    city.trees.forEach((t, n) => crowns.setColorAt(n, c.setHex(tints[t.tint])));
    crowns.instanceColor.needsUpdate = true;
  }
  // A small square of soil round each trunk.
  instanced(scene, new THREE.BoxGeometry(1.3, 0.04, 1.3), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), items.map((i) => ({ ...i, s: 1, ry: 0, y: 0.2 })), false);
}

export function buildStreetProps(scene, city) {
  makeTrees(scene, city);
  const parts = propParts();
  const byType = new Map();
  for (const p of city.props) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type).push(p);
  }
  for (const [type, items] of byType) {
    for (const [geo, material] of parts[type] ?? []) instanced(scene, geo, material, items, type !== 'signal' || material.emissive.getHex() === 0);
  }
}
