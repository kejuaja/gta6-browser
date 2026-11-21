// Every building's mesh, built from its footprint (citymap.js's solid box) in one of several
// shapes per kind, so no two streets look alike: Downtown towers with setbacks, round glass
// drums, crowns and spires or ribbed fins; art-deco and terraced beach hotels; Strip shops with
// glass storefronts, awnings, neon, water tanks and billboards; houses with gable roofs and
// chimneys; warehouses with roll-up doors. All of it merges into a few meshes by material.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { canvasTexture, geometryBatch, prismGeometry } from './batch.js';

// ---------------------------------------------------------------- textures

/** One bay of a facade: wall, a window with a sill, tinted by vertex colour. */
function facadeTexture() {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = '#f4f1ec';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#3d5a78';
    g.fillRect(12, 14, 40, 34);
    g.fillStyle = '#7fa6c9';
    g.fillRect(12, 14, 40, 10);
    g.fillStyle = '#e3ddd3';
    g.fillRect(10, 48, 44, 4);
    g.fillStyle = '#d6d0c6';
    g.fillRect(30, 14, 3, 34);
  });
}

/**
 * What glows at dusk on each texture: the window panes lit warm, the walls dark. Same layout as the
 * matching colour texture, so the light sits exactly in the glass.
 */
function litWindows(draw) {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 64);
    draw(g);
  });
}
const facadeLit = () => litWindows((g) => {
  g.fillStyle = '#ffc77a';
  g.fillRect(13, 16, 16, 31);
  g.fillStyle = '#ffd9a0';
  g.fillRect(34, 16, 17, 31);
});
const ribbonLit = () => litWindows((g) => {
  g.fillStyle = '#ffcf85';
  g.fillRect(0, 20, 30, 23);
  g.fillStyle = '#ffe1aa';
  g.fillRect(34, 20, 30, 23);
});
const glassLit = () => litWindows((g) => {
  g.fillStyle = 'rgba(255, 205, 140, 0.75)';
  g.fillRect(4, 8, 57, 22);
  g.fillStyle = 'rgba(255, 220, 170, 0.45)';
  g.fillRect(4, 36, 57, 22);
});

/** Art-deco ribbon windows: one long band per floor with a pale spandrel. */
function ribbonTexture() {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = '#f7f3ea';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#2f5576';
    g.fillRect(0, 18, 64, 26);
    g.fillStyle = '#86b4d6';
    g.fillRect(0, 18, 64, 7);
    g.fillStyle = '#ece6d8';
    g.fillRect(31, 18, 2, 26);
    g.fillStyle = '#e2dccf';
    g.fillRect(0, 44, 64, 3);
  });
}

/** Curtain wall glass with thin mullions. */
function glassTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#d8ecff');
    grad.addColorStop(1, '#9fbad6');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#e8eef5';
    g.fillRect(0, 0, 64, 3);
    g.fillRect(0, 0, 3, 64);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(6, 6, 10, 52);
  });
}

/** Corrugated metal for warehouses and containers. */
function ribbedTexture() {
  return canvasTexture(64, 64, (g) => {
    for (let x = 0; x < 64; x += 8) {
      g.fillStyle = '#ffffff';
      g.fillRect(x, 0, 5, 64);
      g.fillStyle = '#c9c9c9';
      g.fillRect(x + 5, 0, 3, 64);
    }
  });
}

function signTexture(text, color) {
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = '#120a1c';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = hex;
    g.lineWidth = 8;
    g.strokeRect(8, 8, 496, 112);
    g.font = 'bold italic 64px "Trebuchet MS", "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = hex;
    g.shadowBlur = 24;
    g.fillStyle = '#ffffff';
    g.fillText(text, 256, 68, 470);
    g.fillStyle = hex;
    g.globalAlpha = 0.6;
    g.fillText(text, 256, 68, 470);
  }, false);
}

// ---------------------------------------------------------------- helpers

/** The side of a building facing the street: the face nearest its block's edge. */
export function streetFace(b, city) {
  const block = city.blockAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  if (!block) return { axis: 'x', side: -1 };
  const gaps = [
    { axis: 'z', side: -1, d: b.z0 - block.z0 },
    { axis: 'z', side: 1, d: block.z1 - b.z1 },
    { axis: 'x', side: -1, d: b.x0 - block.x0 },
    { axis: 'x', side: 1, d: block.x1 - b.x1 },
  ];
  gaps.sort((p, q) => p.d - q.d);
  return gaps[0];
}

/**
 * A box stuck onto a building's street face: `along0..along1` along the face (0..1 of its width),
 * `out` metres proud of it (negative sinks into it), from y0 to y1.
 */
function onFace(batch, b, face, along0, along1, out, y0, y1, hex, uv) {
  if (face.axis === 'z') {
    const x0 = b.x0 + (b.x1 - b.x0) * along0;
    const x1 = b.x0 + (b.x1 - b.x0) * along1;
    const z = face.side < 0 ? b.z0 : b.z1;
    const za = face.side < 0 ? z - Math.max(0, out) : z + Math.min(0, out);
    const zb = face.side < 0 ? z - Math.min(0, out) : z + Math.max(0, out);
    batch.box(x0, y0, Math.min(za, zb), x1, y1, Math.max(za, zb), hex, uv);
  } else {
    const z0 = b.z0 + (b.z1 - b.z0) * along0;
    const z1 = b.z0 + (b.z1 - b.z0) * along1;
    const x = face.side < 0 ? b.x0 : b.x1;
    const xa = face.side < 0 ? x - Math.max(0, out) : x + Math.min(0, out);
    const xb = face.side < 0 ? x - Math.min(0, out) : x + Math.max(0, out);
    batch.box(Math.min(xa, xb), y0, z0, Math.max(xa, xb), y1, z1, hex, uv);
  }
}

function lighten(hex, f) {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), f).getHex();
}

function darken(hex, f) {
  return new THREE.Color(hex).multiplyScalar(1 - f).getHex();
}

const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
const unitDisc = new THREE.CylinderGeometry(1, 1, 1, 28, 1, false);
const unitCone = new THREE.ConeGeometry(1, 1, 16);

function rooftopUnits(B, b, rng, top) {
  const n = rng.int(1, 3);
  for (let k = 0; k < n; k += 1) {
    const s = rng.range(1.6, 3.2);
    const x = rng.range(b.x0 + 2, b.x1 - 2 - s);
    const z = rng.range(b.z0 + 2, b.z1 - 2 - s);
    B.plain.box(x, top, z, x + s, top + rng.range(1, 2), z + s, 0xb6bcc2);
  }
}

function helipad(B, cx, cz, top, r) {
  B.plain.geometry(unitDisc, cx, top + 0.1, cz, 0x3b3f45, { sx: r, sy: 0.2, sz: r });
  B.plain.box(cx - 1.6, top + 0.2, cz - 2, cx - 1.0, top + 0.24, cz + 2, 0xffffff);
  B.plain.box(cx + 1.0, top + 0.2, cz - 2, cx + 1.6, top + 0.24, cz + 2, 0xffffff);
  B.plain.box(cx - 1.0, top + 0.2, cz - 0.3, cx + 1.0, top + 0.24, cz + 0.3, 0xffffff);
}

// ---------------------------------------------------------------- building kinds

function tower(B, b, rng) {
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const h = b.h;
  const variant = rng.int(0, 3);
  B.facade.box(b.x0 - 0.4, 0, b.z0 - 0.4, b.x1 + 0.4, 6, b.z1 + 0.4, 0xd8d2c8, [4, 6]);
  B.plain.box(b.x0 - 0.6, 6, b.z0 - 0.6, b.x1 + 0.6, 6.6, b.z1 + 0.6, 0xeeeae2);
  if (variant === 0) {
    // Setbacks: three tiers stepping in, a ledge at each step.
    const m = Math.min(w, d);
    let y = 6.6;
    [[0, 0.58], [0.13, 0.82], [0.26, 1]].forEach(([inset, top], n) => {
      const k = inset * m;
      const yt = h * top;
      B.glass.box(b.x0 + k, y, b.z0 + k, b.x1 - k, yt, b.z1 - k, n === 2 ? lighten(b.color, 0.15) : b.color, [3, 3.6]);
      B.plain.box(b.x0 + k - 0.3, yt, b.z0 + k - 0.3, b.x1 - k + 0.3, yt + 0.6, b.z1 - k + 0.3, 0xe6e9ee);
      y = yt + 0.6;
    });
    if (rng.chance(0.5)) helipad(B, cx, cz, y, Math.min(w, d) * 0.22);
    else rooftopUnits(B, { x0: b.x0 + 0.26 * m, x1: b.x1 - 0.26 * m, z0: b.z0 + 0.26 * m, z1: b.z1 - 0.26 * m }, rng, y);
  } else if (variant === 1) {
    // A round glass drum with a crown ring.
    const r = Math.min(w, d) / 2 - 0.6;
    B.glass.geometry(unitCylinder, cx, 6.6 + (h - 6.6) / 2, cz, b.color, { sx: r, sy: h - 6.6, sz: r, uvScale: [(2 * Math.PI * r) / 3, (h - 6.6) / 3.6] });
    B.plain.geometry(unitDisc, cx, h + 0.4, cz, 0xe6e9ee, { sx: r + 0.5, sy: 0.8, sz: r + 0.5 });
    B.plain.geometry(unitDisc, cx, h + 2.2, cz, 0xd0d6dd, { sx: r * 0.55, sy: 2.8, sz: r * 0.55 });
    B.plain.geometry(unitDisc, cx, h + 8, cz, 0xf4f4f4, { sx: 0.3, sy: 9, sz: 0.3 });
  } else if (variant === 2) {
    // Crown and spire.
    B.glass.box(b.x0, 6.6, b.z0, b.x1, h * 0.88, b.z1, b.color, [3, 3.6]);
    B.plain.box(b.x0 - 0.3, h * 0.88, b.z0 - 0.3, b.x1 + 0.3, h * 0.88 + 0.8, b.z1 + 0.3, 0xe6e9ee);
    const k = Math.min(w, d) * 0.15;
    B.glass.box(b.x0 + k, h * 0.88 + 0.8, b.z0 + k, b.x1 - k, h, b.z1 - k, lighten(b.color, 0.25), [3, 3.6]);
    B.plain.geometry(unitCone, cx, h + 4, cz, 0xe9edf2, { sx: Math.min(w, d) * 0.3, sy: 8, sz: Math.min(w, d) * 0.3 });
    B.plain.geometry(unitDisc, cx, h + 14, cz, 0xf4f4f4, { sx: 0.25, sy: 14, sz: 0.25 });
  } else {
    // Ribbed: vertical fins down two faces.
    B.glass.box(b.x0, 6.6, b.z0, b.x1, h, b.z1, b.color, [3, 3.6]);
    for (let x = b.x0 + 1.5; x < b.x1 - 1; x += 3) {
      B.plain.box(x - 0.15, 6.6, b.z0 - 0.6, x + 0.15, h, b.z0, 0xeef0f3);
      B.plain.box(x - 0.15, 6.6, b.z1, x + 0.15, h, b.z1 + 0.6, 0xeef0f3);
    }
    B.plain.box(b.x0 - 0.3, h, b.z0 - 0.6, b.x1 + 0.3, h + 1.2, b.z1 + 0.6, 0xeef0f3);
    rooftopUnits(B, b, rng, h + 1.2);
  }
}

function hotel(B, b, rng, face) {
  const h = b.h;
  const accent = lighten(b.color, 0.55);
  if (rng.chance(0.5)) {
    // Art deco: ribbon windows, a stepped central tower on the street face, floor bands.
    B.deco.box(b.x0, 0, b.z0, b.x1, h, b.z1, b.color, [4, 3.5], darken(b.color, 0.15));
    onFace(B.plain, b, face, 0.4, 0.6, 0.8, 0, h + 5, accent);
    onFace(B.plain, b, face, 0.44, 0.56, 1.0, h + 5, h + 8, accent);
    onFace(B.plain, b, face, 0.47, 0.53, 1.1, h + 8, h + 11, b.color);
    for (let y = 3.5; y < h; y += 3.5) {
      onFace(B.plain, b, face, 0, 0.4, 0.25, y - 0.12, y + 0.08, 0xffffff);
      onFace(B.plain, b, face, 0.6, 1, 0.25, y - 0.12, y + 0.08, 0xffffff);
    }
  } else {
    // Terraced: a top storey set back, balcony slabs on every floor.
    B.deco.box(b.x0, 0, b.z0, b.x1, h * 0.7, b.z1, b.color, [4, 3.5], darken(b.color, 0.15));
    const k = 3.5;
    const inner = {
      x0: b.x0 + (face.axis === 'x' && face.side < 0 ? k : 0),
      x1: b.x1 - (face.axis === 'x' && face.side > 0 ? k : 0),
      z0: b.z0 + (face.axis === 'z' && face.side < 0 ? k : 0),
      z1: b.z1 - (face.axis === 'z' && face.side > 0 ? k : 0),
    };
    B.deco.box(inner.x0, h * 0.7, inner.z0, inner.x1, h, inner.z1, lighten(b.color, 0.1), [4, 3.5], darken(b.color, 0.15));
    for (let y = 3.5; y < h * 0.7; y += 3.5) {
      onFace(B.plain, b, face, 0.05, 0.95, 1.1, y - 0.15, y, 0xffffff);
      onFace(B.plain, b, face, 0.05, 0.95, 1.1, y + 0.85, y + 0.95, 0xffffff);
    }
  }
  B.plain.box(b.x0, h, b.z0, b.x1, h + 0.8, b.z0 + 0.4, 0xffffff);
  B.plain.box(b.x0, h, b.z1 - 0.4, b.x1, h + 0.8, b.z1, 0xffffff);
}

function storefront(B, b, rng, face, opts = {}) {
  const h = b.h;
  const ground = 3.6;
  B.glass.box(b.x0 + 0.4, 0, b.z0 + 0.4, b.x1 - 0.4, ground, b.z1 - 0.4, 0x445f78, [2.4, 3.6]);
  B.facade.box(b.x0, ground, b.z0, b.x1, h, b.z1, b.color, [4, 3.5], darken(b.color, 0.12));
  B.plain.box(b.x0 - 0.15, ground - 0.2, b.z0 - 0.15, b.x1 + 0.15, ground + 0.25, b.z1 + 0.15, opts.band ?? 0xf2eee6);
  B.plain.box(b.x0 - 0.2, h, b.z0 - 0.2, b.x1 + 0.2, h + 0.7, b.z1 + 0.2, lighten(b.color, 0.35));
  if (opts.awning !== false) onFace(B.plain, b, face, 0.08, 0.92, 1.6, 2.9, 3.3, opts.awningColor ?? rng.pick([0xe63946, 0x2a9d8f, 0xf4a261, 0x264653, 0xffffff, 0x9b5de5]));
  if (opts.neon) onFace(B.neon, b, face, 0.05, 0.95, 0.2, ground + 0.4, ground + 0.55, opts.neon);
  const roofItem = rng.next();
  if (opts.roof === false) return;
  if (roofItem < 0.35) {
    // A water tank on legs.
    const x = rng.range(b.x0 + 3, b.x1 - 3);
    const z = rng.range(b.z0 + 3, b.z1 - 3);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.plain.box(x + dx * 1.1 - 0.1, h + 0.7, z + dz * 1.1 - 0.1, x + dx * 1.1 + 0.1, h + 3, z + dz * 1.1 + 0.1, 0x5a4a3c);
    B.plain.geometry(unitDisc, x, h + 4.2, z, 0x8a6a4a, { sx: 1.6, sy: 2.4, sz: 1.6 });
    B.plain.geometry(unitCone, x, h + 5.9, z, 0x5a4a3c, { sx: 1.7, sy: 1, sz: 1.7 });
  } else if (roofItem < 0.55) {
    // A billboard facing the street.
    const panel = rng.pick([0xff6f91, 0x3ff0ff, 0xffc75f, 0x845ec2, 0x00c9a7]);
    onFace(B.plain, b, face, 0.25, 0.3, -1.2, h + 0.7, h + 4, 0x444444);
    onFace(B.plain, b, face, 0.7, 0.75, -1.2, h + 0.7, h + 4, 0x444444);
    onFace(B.neon, b, face, 0.15, 0.85, -1.0, h + 4, h + 8, panel);
  } else rooftopUnits(B, b, rng, h + 0.7);
}

function house(B, b, rng, face) {
  const h = b.h;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  B.facade.box(b.x0, 0, b.z0, b.x1, h, b.z1, b.color, [4.5, 3.2]);
  const alongX = w >= d;
  const span = (alongX ? d : w) + 1.2;
  const len = (alongX ? w : d) + 1.2;
  B.plain.geometry(prismGeometry(span, Math.min(3.2, span * 0.38), len), (b.x0 + b.x1) / 2, h, (b.z0 + b.z1) / 2, b.roof, { ry: alongX ? Math.PI / 2 : 0 });
  if (rng.chance(0.6)) {
    const x = rng.range(b.x0 + 1.5, b.x1 - 2.5);
    const z = rng.range(b.z0 + 1.5, b.z1 - 2.5);
    B.plain.box(x, h, z, x + 0.9, h + 3.4, z + 0.9, 0x9c5a3c);
  }
  onFace(B.plain, b, face, 0.42, 0.58, 0.06, 0, 2.3, darken(b.color, 0.55));
  onFace(B.plain, b, face, 0.35, 0.65, 1.4, 2.6, 2.8, 0xffffff);
  if (rng.chance(0.5)) onFace(B.plain, b, face, 0.05, 0.32, 0.05, 0, 2.6, 0xf2f2f2);
}

function warehouse(B, b, rng, face) {
  const h = b.h;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  B.ribbed.box(b.x0, 0, b.z0, b.x1, h, b.z1, b.color, [3, 12], darken(b.color, 0.2));
  const alongX = w >= d;
  B.ribbed.geometry(prismGeometry((alongX ? d : w) + 0.6, 2.4, (alongX ? w : d) + 0.6), (b.x0 + b.x1) / 2, h, (b.z0 + b.z1) / 2, darken(b.color, 0.25), { ry: alongX ? Math.PI / 2 : 0 });
  const doors = Math.max(1, Math.floor((face.axis === 'z' ? w : d) / 14));
  for (let n = 0; n < doors; n += 1) {
    const a = (n + 0.5) / doors;
    onFace(B.ribbed, b, face, a - 0.07, a + 0.07, 0.08, 0, 4.8, 0x8c939b, [1, 0.6]);
    onFace(B.plain, b, face, a - 0.09, a + 0.09, 0.12, 4.8, 5.2, 0xf0a030);
  }
}

// ---------------------------------------------------------------- all of them

export function buildBuildings(scene, city, rng) {
  const B = {
    facade: geometryBatch(),
    deco: geometryBatch(),
    glass: geometryBatch(),
    ribbed: geometryBatch(),
    plain: geometryBatch(),
    neon: geometryBatch(),
  };
  for (const b of city.solids) {
    if (b.style === 'tree' || b.style === 'prop') continue;
    const face = streetFace(b, city);
    switch (b.style) {
      case 'tower':
        tower(B, b, rng);
        break;
      case 'hotel':
        hotel(B, b, rng, face);
        break;
      case 'shop':
        storefront(B, b, rng, face, { neon: rng.chance(0.45) ? rng.pick(PALETTE.neon) : null });
        break;
      case 'club':
        storefront(B, b, rng, face, { neon: 0xb86bff, awningColor: 0x2a1f3d, roof: false });
        B.neon.box(b.x0 - 0.1, b.h + 0.6, b.z0 - 0.1, b.x1 + 0.1, b.h + 0.8, b.z1 + 0.1, 0xff3fa4);
        break;
      case 'diner':
        storefront(B, b, rng, face, { awning: false, neon: 0xff3fa4, roof: false });
        break;
      case 'gunshop':
        storefront(B, b, rng, face, { awningColor: 0x1f2a36, neon: 0x3ff0ff });
        break;
      case 'station':
        storefront(B, b, rng, face, { awningColor: 0x1d3f8f, band: 0x1d3f8f, roof: false });
        B.plain.box(b.x1 - 4, b.h, b.z0 + 3, b.x1 - 3.6, b.h + 14, b.z0 + 3.4, 0xd0d4da);
        rooftopUnits(B, b, rng, b.h + 0.7);
        break;
      case 'hospital':
        storefront(B, b, rng, face, { awningColor: 0xffffff, band: 0xd93a3a, roof: false });
        helipad(B, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.h + 0.7, 6);
        break;
      case 'house':
        house(B, b, rng, face);
        break;
      case 'warehouse':
      case 'garage':
        warehouse(B, b, rng, face);
        break;
      case 'container':
        B.ribbed.box(b.x0, 0, b.z0, b.x1, b.h, b.z1, b.color, [1.2, 2.6], darken(b.color, 0.2));
        break;
      case 'fountain': {
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        B.plain.geometry(unitDisc, cx, 0.55, cz, b.color, { sx: 3, sy: 1.1, sz: 3 });
        B.plain.geometry(unitDisc, cx, 1.12, cz, 0x3aa7d8, { sx: 2.6, sy: 0.06, sz: 2.6 });
        B.plain.geometry(unitDisc, cx, 1.8, cz, b.color, { sx: 0.35, sy: 2.4, sz: 0.35 });
        B.plain.geometry(unitDisc, cx, 3, cz, b.color, { sx: 1.1, sy: 0.25, sz: 1.1 });
        break;
      }
      default:
        B.plain.box(b.x0, 0, b.z0, b.x1, b.h, b.z1, b.color);
    }
  }
  const add = (batch, material) => {
    if (batch.empty) return;
    const mesh = new THREE.Mesh(batch.build(), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // Evening: every window is lit from inside (emissive maps that match the window layouts).
  add(B.facade, new THREE.MeshStandardMaterial({ map: facadeTexture(), vertexColors: true, roughness: 0.8, emissive: 0xffffff, emissiveMap: facadeLit(), emissiveIntensity: 1.1 }));
  add(B.deco, new THREE.MeshStandardMaterial({ map: ribbonTexture(), vertexColors: true, roughness: 0.6, emissive: 0xffffff, emissiveMap: ribbonLit(), emissiveIntensity: 1.1 }));
  add(B.glass, new THREE.MeshStandardMaterial({ map: glassTexture(), vertexColors: true, roughness: 0.12, metalness: 0.6, emissive: 0xffffff, emissiveMap: glassLit(), emissiveIntensity: 0.9 }));
  add(B.ribbed, new THREE.MeshStandardMaterial({ map: ribbedTexture(), vertexColors: true, roughness: 0.6, metalness: 0.2 }));
  add(B.plain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  const neon = new THREE.MeshBasicMaterial({ vertexColors: true });
  neon.color.setScalar(1.8);
  add(B.neon, neon);
  addSigns(scene, city);
}

function addSigns(scene, city) {
  for (const b of city.solids) {
    if (!b.sign) continue;
    const face = streetFace(b, city);
    const width = Math.min(12, (face.axis === 'z' ? b.x1 - b.x0 : b.z1 - b.z0) * 0.8);
    // Brighter than white, so the bloom pass makes the neon glow.
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(b.sign, b.signColor) });
    signMat.color.setScalar(1.9);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), signMat);
    const y = b.style === 'diner' ? 4.2 : Math.min(b.h - 1.6, 7);
    const out = b.style === 'hotel' || b.style === 'tower' ? 0.3 : 0.2;
    if (face.axis === 'z') {
      sign.position.set((b.x0 + b.x1) / 2 + (b.style === 'hotel' ? (b.x1 - b.x0) * 0.25 : 0), y, face.side < 0 ? b.z0 - out : b.z1 + out);
      sign.rotation.y = face.side < 0 ? Math.PI : 0;
    } else {
      sign.position.set(face.side < 0 ? b.x0 - out : b.x1 + out, y, (b.z0 + b.z1) / 2 + (b.style === 'hotel' ? (b.z1 - b.z0) * 0.25 : 0));
      sign.rotation.y = face.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    scene.add(sign);
  }
}
