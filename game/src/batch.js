// Geometry batching for the static city: many boxes, prisms and cylinders merged into one mesh
// per material (one draw call), with per-vertex colour for tint and uvs in metres so a tiling
// facade texture lands one window per bay whatever the building's size.
import * as THREE from 'three';

export function canvasTexture(w, h, draw, repeat = true) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Joins geometries (each already placed) into one, keeping position, normal and uv. */
export function mergeGeometries(list) {
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

/** A gable roof's solid: a triangle (span w, height h) run `len` along +z, centred on the origin. */
export function prismGeometry(w, h, len) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  return g;
}

/** Collects boxes and arbitrary geometry into one mesh with vertex colours; uvs in metres. */
export function geometryBatch() {
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const color = new THREE.Color();
  function face(p, u, v, n, rgb, uvScale, flatUv) {
    const base = pos.length / 3;
    const ul = Math.hypot(u[0], u[1], u[2]);
    const vl = Math.hypot(v[0], v[1], v[2]);
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(p[0] + u[0] * a + v[0] * b, p[1] + u[1] * a + v[1] * b, p[2] + u[2] * a + v[2] * b);
      nor.push(n[0], n[1], n[2]);
      if (flatUv) uv.push(0.06, 0.06);
      else uv.push((a * ul) / uvScale[0], (b * vl) / uvScale[1]);
      col.push(rgb.r, rgb.g, rgb.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v3 = new THREE.Vector3();
  return {
    /** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1): four walls and a top (`roofHex` tints the top). */
    box(x0, y0, z0, x1, y1, z1, hex, uvScale = [4, 3.5], roofHex = null) {
      color.setHex(hex);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dz = z1 - z0;
      face([x1, y0, z1], [0, 0, -dz], [0, dy, 0], [1, 0, 0], color, uvScale);
      face([x0, y0, z0], [0, 0, dz], [0, dy, 0], [-1, 0, 0], color, uvScale);
      face([x0, y0, z1], [dx, 0, 0], [0, dy, 0], [0, 0, 1], color, uvScale);
      face([x1, y0, z0], [-dx, 0, 0], [0, dy, 0], [0, 0, -1], color, uvScale);
      if (roofHex !== null) color.setHex(roofHex);
      face([x0, y1, z0], [0, 0, dz], [dx, 0, 0], [0, 1, 0], color, uvScale, true);
    },
    /**
     * Any geometry, moved by position/rotation-y/scale; `uvScale` [su, sv] stretches its own uvs
     * (a cylinder's wrap and height) so the facade tiles, or null for one flat colour.
     */
    geometry(geo, x, y, z, hex, opts = {}) {
      color.setHex(hex);
      m.compose(v3.set(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0)), new THREE.Vector3(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1));
      nm.getNormalMatrix(m);
      const p = geo.attributes.position;
      const n = geo.attributes.normal;
      const t = geo.attributes.uv;
      const base = pos.length / 3;
      for (let i = 0; i < p.count; i += 1) {
        v3.fromBufferAttribute(p, i).applyMatrix4(m);
        pos.push(v3.x, v3.y, v3.z);
        v3.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        nor.push(v3.x, v3.y, v3.z);
        if (opts.uvScale && t) uv.push(t.getX(i) * opts.uvScale[0], t.getY(i) * opts.uvScale[1]);
        else uv.push(0.06, 0.06);
        col.push(color.r, color.g, color.b);
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i += 1) idx.push(geo.index.getX(i) + base);
      else for (let i = 0; i < p.count; i += 1) idx.push(base + i);
    },
    get empty() {
      return pos.length === 0;
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
  };
}
