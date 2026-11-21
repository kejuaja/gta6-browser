// Meshes for people and cars, built in code: no model files to load. Cars are side profiles
// extruded across their width with rounded edges (wheel arches cut in, a raked glasshouse, roof,
// pillars, lights, bumpers, mirrors, rims); people are capsules and spheres on jointed limbs.
// Geometry is built once per model and shared; materials are shared by colour.
import * as THREE from 'three';
import { CAR_MODELS } from './config.js';

const materials = new Map();
const boxes = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.metal ?? ''}|${opts.rough ?? ''}|${opts.transparent ?? ''}|${opts.glow ?? ''}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.75,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissive ? (opts.glow ?? 1.6) : 0,
      transparent: Boolean(opts.transparent),
      opacity: opts.transparent ?? 1,
    });
    materials.set(key, m);
  }
  return m;
}

/** A box geometry kept per size, so repeated parts share one. */
export function box(w, h, d) {
  const key = `${w.toFixed(3)}x${h.toFixed(3)}x${d.toFixed(3)}`;
  let g = boxes.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxes.set(key, g);
  }
  return g;
}

function part(geo, material, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

/** Joins geometries (each already placed) into one, keeping position, normal and uv. */
function merge(list) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (const g of list) {
    const base = pos.length / 3;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const t = g.attributes.uv ? g.attributes.uv.array : null;
    for (let i = 0; i < p.length; i += 1) {
      pos.push(p[i]);
      nor.push(n[i]);
    }
    for (let i = 0; i < p.length / 3; i += 1) uv.push(t ? t[i * 2] : 0, t ? t[i * 2 + 1] : 0);
    const index = g.index ? g.index.array : [...Array(p.length / 3).keys()];
    for (let i = 0; i < index.length; i += 1) idx.push(index[i] + base);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return geo.clone().applyMatrix4(m);
}

// ---------------------------------------------------------------- people

const SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5c3a21, 0xffdbac];
const HAIR = [0x1b1b1b, 0x3b2314, 0x6b4423, 0xd6b370, 0x8c8c8c];

let personGeo = null;

/** The body's shapes, made once: proportions of a 1.8 m adult standing on y 0. */
function buildPersonGeometry() {
  const cap = (r, len, sx = 1, sz = 1) => new THREE.CapsuleGeometry(r, len, 4, 12).scale(sx, 1, sz);
  const torso = cap(0.2, 0.3, 1.25, 0.72);
  const chest = placed(new THREE.SphereGeometry(0.2, 14, 10), 0, 0.14, 0.0, 0, 0, 0, 1.12, 0.62, 0.7);
  const pelvis = cap(0.16, 0.1, 1.22, 0.78);
  const head = merge([
    placed(new THREE.SphereGeometry(0.125, 18, 14), 0, 0, 0, 0, 0, 0, 0.92, 1.1, 1),
    placed(new THREE.CylinderGeometry(0.055, 0.065, 0.14, 10), 0, -0.16, -0.01),
    placed(new THREE.SphereGeometry(0.022, 8, 6), 0, -0.01, 0.125, 0, 0, 0, 1, 1.3, 1),
    placed(new THREE.SphereGeometry(0.03, 8, 6), -0.112, 0, 0),
    placed(new THREE.SphereGeometry(0.03, 8, 6), 0.112, 0, 0),
  ]);
  const eyes = merge([
    placed(new THREE.SphereGeometry(0.018, 8, 6), -0.045, 0.025, 0.112),
    placed(new THREE.SphereGeometry(0.018, 8, 6), 0.045, 0.025, 0.112),
    placed(new THREE.BoxGeometry(0.05, 0.012, 0.01), -0.046, 0.058, 0.116),
    placed(new THREE.BoxGeometry(0.05, 0.012, 0.01), 0.046, 0.058, 0.116),
  ]);
  const hairShort = placed(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), 0, 0.02, -0.012, -0.25, 0, 0, 0.96, 1.08, 1.04);
  const hairLong = merge([hairShort, placed(new THREE.CapsuleGeometry(0.1, 0.12, 4, 10), 0, -0.1, -0.06, 0, 0, 0, 1.25, 1, 0.6)]);
  const capGeo = merge([
    placed(new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.04, 0, 0, 0, 0, 0.98, 0.85, 1.02),
    placed(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), 0, 0.045, 0.1, 0, 0, 0, 1, 1, 1.1),
  ]);
  const leg = merge([cap(0.085, 0.34).translate(0, -0.22, 0), cap(0.068, 0.36).translate(0, -0.63, 0)]);
  const shoe = cap(0.06, 0.15).rotateX(Math.PI / 2).scale(1.25, 0.9, 1).translate(0, -0.865, 0.045);
  const sleeve = cap(0.07, 0.2).translate(0, -0.13, 0);
  const forearm = merge([cap(0.055, 0.22).translate(0, -0.43, 0), placed(new THREE.SphereGeometry(0.055, 10, 8), 0, -0.6, 0.01, 0, 0, 0, 0.9, 1.15, 0.75)]);
  const gun = merge([placed(new THREE.BoxGeometry(0.06, 0.1, 0.32), 0, 0, 0.12), placed(new THREE.BoxGeometry(0.05, 0.14, 0.07), 0, -0.08, 0.02)]);
  return { torso, chest, pelvis, head, eyes, hairShort, hairLong, capGeo, leg, shoe, sleeve, forearm, gun };
}

/**
 * A person: hips pivot, torso, head, and arms and legs on shoulder and hip pivots so walking can
 * swing them. `look` picks the colours: shirt, pants, skin, hair, and an optional cap.
 */
export function makePersonMesh(look) {
  if (!personGeo) personGeo = buildPersonGeometry();
  const G = personGeo;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shirt = mat(look.shirt, { rough: 0.85 });
  const pants = mat(look.pants, { rough: 0.9 });
  const skin = mat(look.skin ?? SKIN[0], { rough: 0.6 });
  const hair = mat(look.hair ?? HAIR[0], { rough: 0.95 });
  const torso = part(G.torso, shirt, 0, 1.28, 0, body);
  part(G.chest, shirt, 0, 1.28, 0.02, body);
  part(G.pelvis, pants, 0, 0.97, 0, body);
  const head = part(G.head, skin, 0, 1.79, 0.01, body);
  part(G.eyes, mat(0x1a1410, { rough: 0.3 }), 0, 1.79, 0.01, body, false);
  if (look.cap) part(G.capGeo, mat(look.cap, { rough: 0.8 }), 0, 1.81, 0.0, body);
  else if (look.hairStyle !== 'bald') part(look.hairStyle === 'long' ? G.hairLong : G.hairShort, hair, 0, 1.8, 0.0, body);
  if (look.badge) part(box(0.07, 0.08, 0.02), mat(0xffd54a, { metal: 0.8, rough: 0.3 }), -0.12, 1.42, 0.17, body, false);
  const limbs = {};
  const shoeMat = mat(look.shoes ?? 0x222222, { rough: 0.6 });
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0.93, 0);
    body.add(hip);
    part(G.leg, pants, 0, 0, 0, hip);
    part(G.shoe, shoeMat, 0, 0, 0, hip);
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 1.53, 0);
    shoulder.rotation.z = side * 0.06;
    body.add(shoulder);
    part(G.sleeve, shirt, 0, 0, 0, shoulder);
    part(G.forearm, skin, 0, 0, 0, shoulder);
    limbs[side < 0 ? 'legL' : 'legR'] = hip;
    limbs[side < 0 ? 'armL' : 'armR'] = shoulder;
  }
  const gun = new THREE.Group();
  part(G.gun, mat(0x1a1a1a, { metal: 0.6, rough: 0.4 }), 0, 0, 0, gun);
  gun.position.set(0, -0.6, 0.05);
  gun.visible = false;
  limbs.armR.add(gun);
  return { root, body, torso, head, gun, ...limbs };
}

export function randomLook(rng) {
  const shirts = [0xffffff, 0xff8a65, 0x4fc3f7, 0xf06292, 0xaed581, 0xfff176, 0x9575cd, 0x4db6ac, 0xe57373, 0x90a4ae, 0xffb74d];
  const pants = [0x37474f, 0x283593, 0x5d4037, 0xd7ccc8, 0x1b1b1b, 0x6d8b74, 0x3e2723];
  return {
    shirt: rng.pick(shirts),
    pants: rng.pick(pants),
    skin: rng.pick(SKIN),
    hair: rng.pick(HAIR),
    hairStyle: rng.pick(['short', 'short', 'long', 'bald']),
    cap: rng.chance(0.15) ? rng.pick(shirts) : null,
    shoes: rng.pick([0x222222, 0xffffff, 0x8d6e63]),
  };
}

export const LOOKS = {
  player: { shirt: 0xff7043, pants: 0x263238, skin: 0xc68642, hair: 0x1b1b1b, hairStyle: 'short', shoes: 0xffffff },
  cop: { shirt: 0x1f3c88, pants: 0x14213d, skin: 0xe0ac69, hair: 0x3b2314, cap: 0x14213d, badge: true },
  gang: { shirt: 0x7b1fa2, pants: 0x111111, skin: 0x8d5524, hair: 0x111111, cap: 0x111111 },
  boss: { shirt: 0xf5f5f5, pants: 0x1a237e, skin: 0xf1c27d, hair: 0x8c8c8c, hairStyle: 'short', shoes: 0x3e2723 },
};

// ---------------------------------------------------------------- cars

/**
 * Each model's body, as heights and lengths in metres: belt (top of the doors), cowl and deck
 * (where the glass starts at the front and ends at the back, from the car's centre), the run of
 * the windscreen and rear glass, wheel radius and axle positions.
 */
const BODIES = {
  sorrel: { belt: 0.86, cowl: 0.7, deck: -1.25, ws: 0.72, rear: 0.5, wheel: 0.34, front: 1.3, back: -1.3, nose: 0.2 },
  kestrel: { belt: 0.72, cowl: 0.55, deck: -1.35, ws: 0.95, rear: 0.95, wheel: 0.35, front: 1.45, back: -1.4, nose: 0.28, spoiler: true },
  tarpon: { belt: 0.88, cowl: 0.85, deck: -1.35, ws: 0.75, rear: 0.55, wheel: 0.36, front: 1.55, back: -1.5, nose: 0.2 },
  duna: { belt: 1.02, cowl: 1.05, deck: -0.3, ws: 0.5, rear: 0.06, wheel: 0.42, front: 1.7, back: -1.65, nose: 0.12, bed: true },
  cab: { belt: 0.88, cowl: 0.8, deck: -1.3, ws: 0.72, rear: 0.5, wheel: 0.35, front: 1.45, back: -1.45, nose: 0.2 },
  cruiser: { belt: 0.88, cowl: 0.85, deck: -1.35, ws: 0.75, rear: 0.55, wheel: 0.36, front: 1.5, back: -1.5, nose: 0.2 },
};

/** The body's side profile: bumpers, wheel arches, the bonnet's slope, the boot. */
function bodyShape(spec, b) {
  const L = spec.len / 2;
  const c = 0.28;
  const top = b.belt;
  const R = b.wheel + 0.06;
  const s = new THREE.Shape();
  s.moveTo(-L + 0.18, c);
  s.lineTo(b.back - R, c);
  s.absarc(b.back, b.wheel, R, Math.PI, 0, true);
  s.lineTo(b.front - R, c);
  s.absarc(b.front, b.wheel, R, Math.PI, 0, true);
  s.lineTo(L - 0.22, c);
  s.quadraticCurveTo(L, c, L, c + 0.2);
  s.lineTo(L, top - b.nose - 0.08);
  s.quadraticCurveTo(L - 0.02, top - b.nose + 0.04, L - 0.3, top - b.nose * 0.55);
  s.quadraticCurveTo(b.cowl + 0.4, top - 0.02, b.cowl, top);
  s.lineTo(b.deck, top + 0.01);
  s.quadraticCurveTo(-L + 0.15, top, -L + 0.06, top - 0.12);
  s.lineTo(-L, c + 0.2);
  s.quadraticCurveTo(-L, c, -L + 0.18, c);
  return s;
}

/** The glasshouse: raked windscreen, roof line, rear glass. */
function glassShape(b, roofY) {
  const s = new THREE.Shape();
  const frontTop = b.cowl - b.ws;
  const rearTop = b.deck + b.rear;
  s.moveTo(b.deck, b.belt - 0.02);
  s.lineTo(b.cowl, b.belt - 0.02);
  s.lineTo(frontTop + 0.06, roofY - 0.03);
  s.quadraticCurveTo(frontTop, roofY, frontTop - 0.1, roofY);
  s.lineTo(rearTop + 0.1, roofY);
  s.quadraticCurveTo(rearTop, roofY, rearTop - 0.04, roofY - 0.04);
  s.lineTo(b.deck, b.belt - 0.02);
  return s;
}

function extrudeAcross(shape, width, bevel) {
  const depth = Math.max(0.05, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  // rotateY(+90°) turns the profile's +x (the nose) to -z; flip so the nose faces +z.
  g.rotateY(Math.PI);
  g.computeVertexNormals();
  return g;
}

const carGeo = new Map();

function buildCarGeometry(modelId) {
  const spec = CAR_MODELS[modelId];
  const b = BODIES[modelId];
  const roofY = spec.hgt;
  const frontTop = b.cowl - b.ws;
  const rearTop = b.deck + b.rear;
  const body = extrudeAcross(bodyShape(spec, b), spec.wid, 0.12);
  const glass = extrudeAcross(glassShape(b, roofY), spec.wid * 0.84, 0.06);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(rearTop - 0.02, roofY - 0.05);
  roofShape.lineTo(frontTop - 0.06, roofY - 0.05);
  roofShape.lineTo(frontTop - 0.1, roofY + 0.025);
  roofShape.lineTo(rearTop + 0.04, roofY + 0.025);
  const roof = extrudeAcross(roofShape, spec.wid * 0.86, 0.04);
  const midZ = (frontTop + rearTop) / 2;
  const pillars = merge([
    placed(new THREE.BoxGeometry(spec.wid * 0.85, roofY - b.belt, 0.11), 0, (roofY + b.belt) / 2, midZ),
    placed(new THREE.BoxGeometry(spec.wid * 0.85, 0.05, Math.abs(b.cowl - b.deck) * 0.98), 0, b.belt + 0.005, (b.cowl + b.deck) / 2),
  ]);
  const L = spec.len / 2;
  const trim = merge([
    placed(new THREE.BoxGeometry(spec.wid + 0.04, 0.16, 0.22), 0, 0.42, L - 0.06),
    placed(new THREE.BoxGeometry(spec.wid + 0.04, 0.16, 0.22), 0, 0.42, -L + 0.06),
    placed(new THREE.BoxGeometry(spec.wid * 0.46, 0.13, 0.04), 0, b.belt - b.nose - 0.17, L + 0.01),
    placed(new THREE.BoxGeometry(spec.wid + 0.02, 0.07, Math.abs(b.front - b.back) - 1.0), 0, 0.33, (b.front + b.back) / 2),
    placed(new THREE.BoxGeometry(0.1, 0.1, 0.16), spec.wid / 2 + 0.05, b.belt + 0.1, b.cowl - 0.12),
    placed(new THREE.BoxGeometry(0.1, 0.1, 0.16), -spec.wid / 2 - 0.05, b.belt + 0.1, b.cowl - 0.12),
    placed(new THREE.BoxGeometry(0.42, 0.1, 0.02), 0, 0.62, -L - 0.01),
  ]);
  const seams = merge([
    placed(new THREE.BoxGeometry(spec.wid + 0.012, b.belt - 0.42, 0.012), 0, (b.belt + 0.42) / 2, b.cowl - 0.08),
    placed(new THREE.BoxGeometry(spec.wid + 0.012, b.belt - 0.42, 0.012), 0, (b.belt + 0.42) / 2, midZ),
    placed(new THREE.BoxGeometry(spec.wid + 0.012, 0.02, 0.09), 0, b.belt - 0.12, b.cowl - 0.3),
    placed(new THREE.BoxGeometry(spec.wid + 0.012, 0.02, 0.09), 0, b.belt - 0.12, midZ - 0.3),
  ]);
  const lampY = b.belt - b.nose - 0.02;
  const heads = merge([-1, 1].map((sx) => placed(new THREE.CapsuleGeometry(0.06, 0.24, 3, 8), sx * spec.wid * 0.33, lampY, L - 0.02, 0, 0, Math.PI / 2)));
  const tails = merge([-1, 1].map((sx) => placed(new THREE.BoxGeometry(0.42, 0.11, 0.05), sx * spec.wid * 0.31, b.belt - 0.14, -L - 0.005)));
  let bed = null;
  if (b.bed) bed = placed(new THREE.BoxGeometry(spec.wid - 0.3, 0.05, Math.abs(b.deck - -L) - 0.35), 0, b.belt - 0.02, (b.deck + -L) / 2 - 0.05);
  let spoiler = null;
  if (b.spoiler) {
    spoiler = merge([
      placed(new THREE.BoxGeometry(spec.wid * 0.9, 0.04, 0.28), 0, b.belt + 0.2, -L + 0.2),
      placed(new THREE.BoxGeometry(0.05, 0.18, 0.08), spec.wid * 0.3, b.belt + 0.1, -L + 0.22),
      placed(new THREE.BoxGeometry(0.05, 0.18, 0.08), -spec.wid * 0.3, b.belt + 0.1, -L + 0.22),
    ]);
  }
  const tire = new THREE.CylinderGeometry(b.wheel, b.wheel, 0.26, 22).rotateZ(Math.PI / 2);
  const rim = merge([
    new THREE.CylinderGeometry(b.wheel * 0.62, b.wheel * 0.62, 0.275, 18).rotateZ(Math.PI / 2),
    ...[0, 1, 2, 3, 4].map((n) => placed(new THREE.BoxGeometry(0.29, b.wheel * 1.15, 0.05), 0, 0, 0, (n / 5) * Math.PI, 0, 0)),
  ]);
  return { body, glass, roof, pillars, trim, seams, heads, tails, bed, spoiler, tire, rim, b, frontTop, rearTop, roofY };
}

function decalTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg;
  g.font = 'bold italic 40px "Arial Black", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34, 240);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const decals = new Map();
function decalMaterial(text, bg, fg) {
  const key = `${text}|${bg}|${fg}`;
  if (!decals.has(key)) decals.set(key, new THREE.MeshStandardMaterial({ map: decalTexture(text, bg, fg), roughness: 0.4, metalness: 0.2 }));
  return decals.get(key);
}

/**
 * A car of one of CAR_MODELS, facing +z: the body, glass, roof and pillars, trim, lights, wheels
 * on pivots (the front pair steer), and the police bar or taxi sign. Returns the parts the game
 * animates and the shared paint material (repaintCar swaps it).
 */
export function makeCarMesh(modelId, color) {
  const spec = CAR_MODELS[modelId];
  if (!carGeo.has(modelId)) carGeo.set(modelId, buildCarGeometry(modelId));
  const G = carGeo.get(modelId);
  const b = G.b;
  const root = new THREE.Group();
  const paint = mat(color, { metal: 0.55, rough: 0.28 });
  const glass = mat(0x14202c, { metal: 0.9, rough: 0.06 });
  const black = mat(0x161616, { rough: 0.55, metal: 0.2 });
  const body = part(G.body, paint, 0, 0, 0, root);
  body.receiveShadow = true;
  part(G.glass, glass, 0, 0, 0, root);
  part(G.roof, paint, 0, 0, 0, root);
  part(G.pillars, spec.police ? black : paint, 0, 0, 0, root);
  part(G.trim, black, 0, 0, 0, root);
  part(G.seams, mat(0x0d0d0d, { rough: 0.8 }), 0, 0, 0, root, false);
  part(G.heads, mat(0xfff8e0, { emissive: 0xfff0c8, glow: 2.4 }), 0, 0, 0, root, false);
  part(G.tails, mat(0xff2020, { emissive: 0xff1010, glow: 2.2 }), 0, 0, 0, root, false);
  if (G.bed) part(G.bed, black, 0, 0, 0, root, false);
  if (G.spoiler) part(G.spoiler, black, 0, 0, 0, root);
  const tireMat = mat(0x121212, { rough: 0.92 });
  const rimMat = mat(0xd8d8d8, { metal: 0.95, rough: 0.22 });
  const wheels = [];
  for (const [sx, axle] of [[-1, b.front], [1, b.front], [-1, b.back], [1, b.back]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (spec.wid / 2 - 0.12), b.wheel, axle);
    root.add(pivot);
    const wheel = new THREE.Group();
    pivot.add(wheel);
    part(G.tire, tireMat, 0, 0, 0, wheel);
    part(G.rim, rimMat, sx * 0.01, 0, 0, wheel, false);
    wheels.push({ pivot, wheel, front: axle > 0 });
  }
  let sirens = null;
  const roofY = G.roofY;
  const midZ = (G.frontTop + G.rearTop) / 2;
  if (spec.police) {
    const side = decalMaterial('POLICE', '#0d1b3e', '#ffffff');
    for (const sx of [-1, 1]) {
      const d = part(new THREE.PlaneGeometry(1.7, 0.36), side, sx * (spec.wid / 2 + 0.005), b.belt - 0.26, midZ + 0.1, root, false);
      d.rotation.y = sx * Math.PI / 2;
    }
    part(box(spec.wid * 0.7, 0.08, 0.32), black, 0, roofY + 0.06, midZ, root);
    const red = part(box(0.48, 0.12, 0.26), mat(0xff2030, { emissive: 0xff0000, glow: 4 }), -0.27, roofY + 0.15, midZ, root, false);
    const blue = part(box(0.48, 0.12, 0.26), mat(0x2050ff, { emissive: 0x0040ff, glow: 4 }), 0.27, roofY + 0.15, midZ, root, false);
    part(box(spec.wid * 0.7, 0.24, 0.12), black, 0, 0.5, spec.len / 2 + 0.12, root);
    sirens = { red, blue };
  }
  if (spec.taxi) {
    part(box(0.72, 0.2, 0.3), mat(0xffffff, { emissive: 0xfff3a0, glow: 1.2 }), 0, roofY + 0.12, midZ, root);
    const side = decalMaterial('BAYLINE CAB', '#111111', '#ffc107');
    for (const sx of [-1, 1]) {
      const d = part(new THREE.PlaneGeometry(1.5, 0.28), side, sx * (spec.wid / 2 + 0.005), b.belt - 0.24, midZ, root, false);
      d.rotation.y = sx * Math.PI / 2;
    }
  }
  return { root, body, wheels, sirens, paint, spec, geo: G };
}

/** Gives one car its own paint of `color` (the shared material stays as it was for every other car). */
export function repaintCar(mesh, color) {
  const old = mesh.paint;
  const fresh = old.clone();
  fresh.color.setHex(color);
  mesh.root.traverse((o) => {
    if (o.isMesh && o.material === old) o.material = fresh;
  });
  mesh.paint = fresh;
}

/** Darkens a wrecked car: every material swapped for a burnt one. */
export function charCarMesh(mesh) {
  const burnt = mat(0x1e1b19, { rough: 1 });
  mesh.root.traverse((o) => {
    if (o.isMesh) o.material = burnt;
  });
}
