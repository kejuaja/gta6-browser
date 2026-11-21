// The city as data, no graphics: the block grid, each block's district and buildings (the solid
// boxes everything collides with), palms, street lamps, the road graph and the named places the
// story uses. cityscape.js turns this into meshes; everything else asks it questions.
import { GRID, WORLD, PALETTE } from './config.js';
import { createRng } from './rng.js';

const C = GRID.cell;
const B = GRID.block;
const HALF_ROAD = GRID.road / 2;
const SW = GRID.sidewalk;
const BUCKET = 32;
const BUCKET_MIN_X = -200;
const BUCKET_MIN_Z = -60;
const BUCKET_COLS = 30;
const BUCKET_ROWS = 26;

const PARKS = new Set(['2,5', '5,3', '1,0']);
const SPECIAL = {
  '2,4': 'station',
  '3,1': 'hospital',
  '0,3': 'diner',
  '4,7': 'garage',
  '6,1': 'safehouse',
  '6,4': 'club',
  '1,3': 'gunshop',
};

export function blockRect(i, j) {
  const x0 = i * C + HALF_ROAD;
  const z0 = j * C + HALF_ROAD;
  return { x0, z0, x1: x0 + B, z1: z0 + B };
}

export function districtOfBlock(i, j) {
  if (i === 0) return 'beach';
  if (j === 7) return 'docks';
  if (i >= 5 && j <= 2) return 'heights';
  if (i >= 3 && i <= 4 && j >= 2 && j <= 4) return 'downtown';
  return 'strip';
}

export function nodePos(k, l) {
  return { x: k * C, z: l * C };
}

function solid(list, x0, z0, x1, z1, h, color, style, extra) {
  const box = { x0, z0, x1, z1, h, color, style, ...extra };
  list.push(box);
  return box;
}

function fillBeach(rng, r, out, special) {
  const ix0 = r.x0 + SW;
  const ix1 = r.x1 - SW;
  const iz0 = r.z0 + SW;
  const iz1 = r.z1 - SW;
  if (special === 'diner') {
    solid(out.solids, ix1 - 18, iz0 + 18, ix1, iz0 + 32, 5, 0xfbf3e4, 'diner', { sign: "LUCIA'S", signColor: 0xff3fa4 });
    solid(out.solids, ix0, iz0, ix0 + 22, iz0 + 16, 14, rng.pick(PALETTE.pastel), 'hotel');
    solid(out.solids, ix0, iz1 - 16, ix0 + 26, iz1, 11, rng.pick(PALETTE.pastel), 'hotel');
    return;
  }
  const d1 = rng.range(16, 22);
  const d2 = rng.range(16, 22);
  solid(out.solids, ix0 + rng.range(0, 6), iz0, ix1 - rng.range(4, 14), iz0 + d1, rng.range(12, 26), rng.pick(PALETTE.pastel), 'hotel', { sign: rng.pick(['HOTEL MIRAGE', 'THE FLAMINGO', 'CASA AZUL', 'SEA BREEZE', 'PALM COURT']), signColor: rng.pick(PALETTE.neon) });
  solid(out.solids, ix0 + rng.range(0, 10), iz1 - d2, ix1 - rng.range(0, 6), iz1, rng.range(10, 22), rng.pick(PALETTE.pastel), 'hotel');
  out.palms.push({ x: (ix0 + ix1) / 2 - 8, z: (iz0 + iz1) / 2 }, { x: (ix0 + ix1) / 2 + 8, z: (iz0 + iz1) / 2 + 2 });
}

function fillDowntown(rng, r, out) {
  const ix0 = r.x0 + SW;
  const iz0 = r.z0 + SW;
  const inner = B - SW * 2;
  if (rng.chance(0.35)) {
    const m = rng.range(4, 8);
    solid(out.solids, ix0 + m, iz0 + m, ix0 + inner - m, iz0 + inner - m, rng.range(70, 120), rng.pick(PALETTE.glass), 'tower');
    return;
  }
  const half = inner / 2;
  for (let a = 0; a < 2; a += 1) {
    for (let b = 0; b < 2; b += 1) {
      const m = rng.range(1.5, 4);
      solid(out.solids, ix0 + a * half + m, iz0 + b * half + m, ix0 + (a + 1) * half - m, iz0 + (b + 1) * half - m, rng.range(30, 85), rng.pick(PALETTE.glass), 'tower');
    }
  }
}

function fillStrip(rng, r, out, special) {
  const ix0 = r.x0 + SW;
  const iz0 = r.z0 + SW;
  const inner = B - SW * 2;
  if (special === 'station') {
    solid(out.solids, ix0 + 4, iz0 + 6, ix0 + inner - 4, iz0 + 36, 12, 0xe9eef5, 'station', { sign: 'PALMERA BAY POLICE', signColor: 0x3f8cff });
    return;
  }
  if (special === 'hospital') {
    solid(out.solids, ix0 + 2, iz0 + 4, ix0 + inner - 2, iz0 + 34, 20, 0xf7f7f2, 'hospital', { sign: 'ST. MARGUERITE MEDICAL', signColor: 0xff4040 });
    return;
  }
  if (special === 'club') {
    solid(out.solids, ix0 + 6, iz0 + 6, ix0 + inner - 6, iz0 + inner - 6, 9, 0x2a1f3d, 'club', { sign: 'VELVET MOON', signColor: 0xb86bff });
    return;
  }
  if (special === 'gunshop') {
    // Bay Arms faces the east sidewalk, its door at pois.shop.
    solid(out.solids, ix0 + inner - 20, iz0 + 16, ix0 + inner, iz0 + 36, 8, 0x5b6b7a, 'gunshop', { sign: 'BAY ARMS', signColor: 0x3ff0ff });
    solid(out.solids, ix0, iz0, ix0 + inner - 26, iz0 + inner, rng.range(10, 20), rng.pick(PALETTE.strip), 'shop');
    return;
  }
  const split = rng.range(0.38, 0.62) * inner;
  const rows = [[0, split], [split, inner]];
  for (const [a0, a1] of rows) {
    const cuts = rng.chance(0.5) ? [0, inner] : [0, rng.range(0.4, 0.6) * inner, inner];
    for (let c = 0; c + 1 < cuts.length; c += 1) {
      const m = 1.2;
      solid(out.solids, ix0 + cuts[c] + m, iz0 + a0 + m, ix0 + cuts[c + 1] - m, iz0 + a1 - m, rng.range(7, 28), rng.pick(PALETTE.strip), 'shop', rng.chance(0.6) ? { sign: rng.pick(['CLUB AQUA', 'TACO LOCO', 'NEON NIGHTS', 'PAWN', 'LIQUOR', 'ARCADE', 'BAR 77', 'SUSHI', 'TATTOO', 'MOTEL']), signColor: rng.pick(PALETTE.neon) } : {});
    }
  }
}

function fillHeights(rng, r, out, special) {
  const ix0 = r.x0 + SW;
  const iz0 = r.z0 + SW;
  const inner = B - SW * 2;
  const cell = inner / 3;
  for (let a = 0; a < 3; a += 1) {
    for (let b = 0; b < 3; b += 1) {
      if (a === 1 && b === 1) {
        out.palms.push({ x: ix0 + cell * 1.5, z: iz0 + cell * 1.5 });
        continue;
      }
      const isSafe = special === 'safehouse' && a === 1 && b === 2;
      const w = isSafe ? 14 : rng.range(9, 12.5);
      const d = isSafe ? 12 : rng.range(9, 12.5);
      const cx = ix0 + cell * (a + 0.5);
      const cz = iz0 + cell * (b + 0.5);
      solid(out.solids, cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, isSafe ? 8 : rng.range(5, 8), isSafe ? 0x9fd8cf : rng.pick(PALETTE.pastel), 'house', { roof: rng.pick([0xc0603c, 0xa04a32, 0x6f8fa8, 0xd8d0c0]) });
      if (rng.chance(0.6)) out.palms.push({ x: cx + w / 2 + 1.5, z: cz + rng.range(-3, 3) });
    }
  }
}

function fillDocks(rng, r, out, special) {
  const ix0 = r.x0 + SW;
  const iz0 = r.z0 + SW;
  const inner = B - SW * 2;
  const wd = special === 'garage' ? 20 : rng.range(20, 26);
  solid(out.solids, ix0, iz0 + 2, ix0 + inner, iz0 + 2 + wd, special === 'garage' ? 9 : rng.range(10, 13), special === 'garage' ? 0x4a5b6e : rng.pick(PALETTE.docks), special === 'garage' ? 'garage' : 'warehouse', special === 'garage' ? { sign: "DEX'S BODY & PAINT", signColor: 0xffb020 } : {});
  const cz0 = iz0 + wd + 8;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (rng.chance(0.2)) continue;
      const x0 = ix0 + 2 + col * 17;
      const z0 = cz0 + row * 6;
      if (z0 + 2.6 > iz0 + inner) continue;
      const stack = rng.int(1, 3);
      solid(out.solids, x0, z0, x0 + 12, z0 + 2.6, stack * 2.6, rng.pick(PALETTE.container), 'container');
    }
  }
}

function fillPark(rng, r, out) {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  solid(out.solids, cx - 3, cz - 3, cx + 3, cz + 3, 1.1, 0xe7dcc8, 'fountain');
  for (let n = 0; n < 10; n += 1) {
    const ang = (n / 10) * Math.PI * 2;
    const rad = rng.range(12, 22);
    out.palms.push({ x: cx + Math.cos(ang) * rad, z: cz + Math.sin(ang) * rad });
  }
}

function addLamps(r, out) {
  const inset = 1.1;
  for (let x = r.x0 + 6; x < r.x1 - 3; x += 24) {
    out.lamps.push({ x, z: r.z0 + inset, ry: 0 });
    out.lamps.push({ x, z: r.z1 - inset, ry: Math.PI });
  }
  for (let z = r.z0 + 18; z < r.z1 - 3; z += 24) {
    out.lamps.push({ x: r.x0 + inset, z, ry: Math.PI / 2 });
    out.lamps.push({ x: r.x1 - inset, z, ry: -Math.PI / 2 });
  }
}

/**
 * Street furniture along a block's sidewalks, between the lamps: trees (solid, so people walk
 * round them), benches, bins, hydrants, newspaper boxes, planters, bus shelters and traffic lights
 * at two corners; lawns and parks get trees and bushes. Each prop faces the road it stands by.
 */
function addStreetFurniture(rng, block, out) {
  const r = block;
  const d = block.district;
  const inset = 1.25;
  const sides = [
    { side: 'n', ry: Math.PI, at: (t) => ({ x: r.x0 + t, z: r.z0 + inset }) },
    { side: 's', ry: 0, at: (t) => ({ x: r.x0 + t, z: r.z1 - inset }) },
    { side: 'w', ry: -Math.PI / 2, at: (t) => ({ x: r.x0 + inset, z: r.z0 + t }) },
    { side: 'e', ry: Math.PI / 2, at: (t) => ({ x: r.x1 - inset, z: r.z0 + t }) },
  ];
  const leafy = d === 'downtown' || d === 'strip' || block.park;
  for (const s of sides) {
    // Lamps stand at 6 + 24k (n/s) or 18 + 24k (w/e); props go in the gaps between them.
    const slots = s.side === 'n' || s.side === 's' ? [18, 42] : [30];
    for (const t of slots) {
      const p = s.at(t);
      if (leafy) {
        if (d === 'downtown' && rng.chance(0.35)) out.props.push({ type: 'planter', x: p.x, z: p.z, ry: s.ry });
        else {
          out.trees.push({ x: p.x, z: p.z, s: rng.range(0.85, 1.2), tint: rng.int(0, 2) });
          out.solids.push({ x0: p.x - 0.25, z0: p.z - 0.25, x1: p.x + 0.25, z1: p.z + 0.25, h: 4, color: 0, style: 'tree' });
        }
      } else if (d === 'docks' && rng.chance(0.5)) out.props.push({ type: 'bollard', x: p.x, z: p.z, ry: s.ry });
      const q = s.at(t + 4.5);
      if (rng.chance(d === 'docks' ? 0.2 : 0.55)) out.props.push({ type: 'bench', x: q.x, z: q.z, ry: s.ry });
      const b2 = s.at(t - 4);
      if (rng.chance(0.45)) out.props.push({ type: 'bin', x: b2.x, z: b2.z, ry: s.ry });
      else if (d === 'strip' && rng.chance(0.5)) out.props.push({ type: 'newsbox', x: b2.x, z: b2.z, ry: s.ry });
    }
    if (rng.chance(0.3)) {
      const h = s.at(s.side === 'n' || s.side === 's' ? 11 : 11);
      out.props.push({ type: 'hydrant', x: h.x, z: h.z, ry: s.ry });
    }
  }
  if ((d === 'strip' || d === 'downtown') && (block.i + block.j) % 3 === 0) {
    const p = sides[0].at(30);
    out.props.push({ type: 'busstop', x: p.x, z: p.z + 0.1, ry: Math.PI });
    out.solids.push({ x0: p.x - 2.1, z0: r.z0 + 0.5, x1: p.x + 2.1, z1: r.z0 + 1.8, h: 2.6, color: 0, style: 'prop' });
  }
  // Traffic lights at the north-west and south-east corners: every junction gets two.
  out.props.push({ type: 'signal', x: r.x0 + 0.9, z: r.z0 + 0.9, ry: Math.PI * 1.25 });
  out.props.push({ type: 'signal', x: r.x1 - 0.9, z: r.z1 - 0.9, ry: Math.PI * 0.25 });
  if (d === 'heights' || block.park) {
    const inside = (x, z) => out.solids.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1);
    for (let n = 0; n < 10; n += 1) {
      const x = rng.range(r.x0 + 3.6, r.x1 - 3.6);
      const z = rng.range(r.z0 + 3.6, r.z1 - 3.6);
      if (inside(x, z)) continue;
      out.props.push({ type: 'bush', x, z, ry: rng.range(0, 6), s: rng.range(0.7, 1.4) });
    }
  }
}

function addCoast(rng, out) {
  for (let z = 4; z < 620; z += 13) {
    out.palms.push({ x: -22 + rng.range(-2, 2), z: z + rng.range(-2, 2) });
    if (rng.chance(0.55)) out.palms.push({ x: -46 + rng.range(-4, 4), z: z + 6 });
  }
  const p = WORLD.pier;
  // The big wheel's legs and the pier's ride booths.
  solid(out.solids, -134, p.z0, -126, p.z0 + 3, 20, 0xffffff, 'leg');
  solid(out.solids, -134, p.z1 - 3, -126, p.z1, 20, 0xffffff, 'leg');
  solid(out.solids, -100, p.z0, -92, p.z0 + 5, 4, 0xff6f91, 'booth', { sign: 'RIDES', signColor: 0xffe53f });
  solid(out.solids, -84, p.z1 - 5, -76, p.z1, 4, 0x4b9fe1, 'booth', { sign: 'SNACKS', signColor: 0x3ff0ff });
  // Harbour cranes along the docks quay.
  for (const x of [120, 300, 470]) {
    solid(out.solids, x - 8, 618, x - 6, 620, 26, 0xf0a030, 'crane');
    solid(out.solids, x + 6, 618, x + 8, 620, 26, 0xf0a030, 'crane');
    out.cranes.push({ x, z: 619 });
  }
}

function bucketKey(bx, bz) {
  return bz * BUCKET_COLS + bx;
}

function indexSolids(solids) {
  const buckets = new Array(BUCKET_COLS * BUCKET_ROWS);
  for (let n = 0; n < buckets.length; n += 1) buckets[n] = [];
  for (const box of solids) {
    const bx0 = Math.max(0, Math.floor((box.x0 - BUCKET_MIN_X) / BUCKET));
    const bx1 = Math.min(BUCKET_COLS - 1, Math.floor((box.x1 - BUCKET_MIN_X) / BUCKET));
    const bz0 = Math.max(0, Math.floor((box.z0 - BUCKET_MIN_Z) / BUCKET));
    const bz1 = Math.min(BUCKET_ROWS - 1, Math.floor((box.z1 - BUCKET_MIN_Z) / BUCKET));
    for (let bz = bz0; bz <= bz1; bz += 1) for (let bx = bx0; bx <= bx1; bx += 1) buckets[bucketKey(bx, bz)].push(box);
  }
  return buckets;
}

/** Builds the whole city's layout from a seed. */
export function buildCityMap(rng) {
  const out = { blocks: [], solids: [], palms: [], lamps: [], cranes: [], trees: [], props: [] };
  // Furniture draws from its own stream, so adding it never reshuffles the buildings.
  const furnitureRng = createRng(9001);
  for (let j = 0; j < GRID.blocks; j += 1) {
    for (let i = 0; i < GRID.blocks; i += 1) {
      const r = blockRect(i, j);
      const key = `${i},${j}`;
      const district = districtOfBlock(i, j);
      const park = PARKS.has(key);
      const special = SPECIAL[key] ?? null;
      out.blocks.push({ i, j, ...r, district, park, special });
      addLamps(r, out);
      if (park) fillPark(rng, r, out);
      else if (district === 'beach') fillBeach(rng, r, out, special);
      else if (district === 'downtown') fillDowntown(rng, r, out);
      else if (district === 'heights') fillHeights(rng, r, out, special);
      else if (district === 'docks') fillDocks(rng, r, out, special);
      else fillStrip(rng, r, out, special);
      addStreetFurniture(furnitureRng, out.blocks[out.blocks.length - 1], out);
    }
  }
  addCoast(rng, out);
  const buckets = indexSolids(out.solids);
  const scratch = [];

  const city = {
    ...out,
    /** The solid boxes whose bucket is within one of (x, z): the only ones a small thing there can touch. */
    solidsNear(x, z) {
      scratch.length = 0;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return scratch;
      const bx = Math.floor((x - BUCKET_MIN_X) / BUCKET);
      const bz = Math.floor((z - BUCKET_MIN_Z) / BUCKET);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = bx + dx;
          const cz = bz + dz;
          if (cx < 0 || cz < 0 || cx >= BUCKET_COLS || cz >= BUCKET_ROWS) continue;
          const list = buckets[bucketKey(cx, cz)];
          for (let n = 0; n < list.length; n += 1) if (!scratch.includes(list[n])) scratch.push(list[n]);
        }
      }
      return scratch;
    },
    isLand(x, z) {
      const p = WORLD.pier;
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 + 0.5 && z <= p.z1 - 0.5) return true;
      return x >= WORLD.minX && x <= WORLD.maxX && z >= WORLD.minZ && z <= WORLD.maxZ;
    },
    districtAt(x, z) {
      const p = WORLD.pier;
      if (x < WORLD.minX + 2 && z >= p.z0 && z <= p.z1) return 'pier';
      if (x < HALF_ROAD) return 'beach';
      if (z > GRID.blocks * C - HALF_ROAD) return 'docks';
      const i = Math.min(GRID.blocks - 1, Math.max(0, Math.floor(x / C)));
      const j = Math.min(GRID.blocks - 1, Math.max(0, Math.floor(z / C)));
      return districtOfBlock(i, j);
    },
    blockAt(x, z) {
      const i = Math.floor(x / C);
      const j = Math.floor(z / C);
      if (i < 0 || j < 0 || i >= GRID.blocks || j >= GRID.blocks) return null;
      const b = out.blocks[j * GRID.blocks + i];
      return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 ? b : null;
    },
    block(i, j) {
      return out.blocks[j * GRID.blocks + i];
    },
    nearestNode(x, z) {
      return {
        k: Math.min(GRID.blocks, Math.max(0, Math.round(x / C))),
        l: Math.min(GRID.blocks, Math.max(0, Math.round(z / C))),
      };
    },
    isRoad(x, z) {
      if (x < -HALF_ROAD || z < -HALF_ROAD || x > GRID.blocks * C + HALF_ROAD || z > GRID.blocks * C + HALF_ROAD) return false;
      const dx = Math.abs(x - Math.round(x / C) * C);
      const dz = Math.abs(z - Math.round(z / C) * C);
      return dx < HALF_ROAD || dz < HALF_ROAD;
    },
  };
  city.pois = buildPois(city);
  return city;
}

/** A spot on the sidewalk beside block (i, j): side n/s/e/w, `t` 0..1 along it. */
export function sidewalkSpot(i, j, side, t = 0.5) {
  const r = blockRect(i, j);
  const inset = 2.2;
  if (side === 'n') return { x: r.x0 + (r.x1 - r.x0) * t, z: r.z0 + inset };
  if (side === 's') return { x: r.x0 + (r.x1 - r.x0) * t, z: r.z1 - inset };
  if (side === 'w') return { x: r.x0 + inset, z: r.z0 + (r.z1 - r.z0) * t };
  return { x: r.x1 - inset, z: r.z0 + (r.z1 - r.z0) * t };
}

/** A point in the right-hand lane of the road between two neighbouring nodes, `t` 0..1 along it. */
export function lanePoint(k0, l0, k1, l1, t) {
  const a = nodePos(k0, l0);
  const b = nodePos(k1, l1);
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  return { x: a.x + (b.x - a.x) * t - dz * GRID.lane, z: a.z + (b.z - a.z) * t + dx * GRID.lane, yaw: Math.atan2(dx, dz) };
}

function buildPois() {
  return {
    spawn: { ...sidewalkSpot(3, 1, 'w', 0.6), yaw: -Math.PI / 2, label: 'St. Marguerite Medical' },
    hospital: { ...sidewalkSpot(3, 1, 'w', 0.6), yaw: -Math.PI / 2 },
    police: { ...sidewalkSpot(2, 4, 'n', 0.5), yaw: Math.PI },
    diner: { ...sidewalkSpot(0, 3, 'e', 0.45), yaw: Math.PI / 2 },
    garage: { ...sidewalkSpot(4, 7, 'n', 0.5), yaw: Math.PI },
    club: { ...sidewalkSpot(6, 4, 'w', 0.5), yaw: -Math.PI / 2 },
    shop: { ...sidewalkSpot(1, 3, 'e', 0.43), yaw: Math.PI / 2 },
    safehouse: { ...sidewalkSpot(6, 1, 's', 0.5), yaw: 0 },
    paint: { x: 5 * C + 37, z: 6 * C, yaw: 0 },
    pier: { x: -110, z: 300, yaw: -Math.PI / 2 },
    quay: { x: 420, z: 626, yaw: Math.PI / 2 },
  };
}
