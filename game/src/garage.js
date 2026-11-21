// Dex's Garage at the Saltmarsh Docks: drive into the green bay out front and Dex tunes the car
// you are in. Engine (more speed and pick-up), armour (the body takes less damage) and tyres
// (more grip), each bought in levels with cash and each one you can see on the car: a bonnet
// scoop, twin exhausts and a big wing; a bull bar, side plates and a roof cage; gold rims and
// fat tyres. Dex also keeps the last car he worked on, parked outside, for the next session.
import * as THREE from 'three';
import { CAR_MODELS } from './config.js';
import { mat, box } from './models.js';
import { addBeacon } from './effects.js';
import { createVehicle } from './vehicles.js';

export const UPGRADES = [
  { id: 'engine', name: 'Engine', blurb: 'Turbo, intake and exhaust: more top speed and pick-up.', prices: [600, 1400, 2800], levels: ['Street tune', 'Turbo kit', 'Race engine'] },
  { id: 'armour', name: 'Armour', blurb: 'Steel under the paint: the car shrugs off crashes and bullets.', prices: [500, 1200, 2500], levels: ['Bull bar', 'Side plating', 'Full cage'] },
  { id: 'tyres', name: 'Tyres', blurb: 'Wider, stickier rubber: tighter corners, fewer spins.', prices: [400, 1000], levels: ['Sport tyres', 'Slick racing tyres'] },
  {
    id: 'kit',
    name: 'Body kit',
    only: ['suv', 'van'],
    blurb: 'SUV: roof rack, light bar, snorkel and a spare wheel. Van: roof rack, ladder, racing stripes and neon underglow.',
    prices: [700, 1600],
    levels: ['Roof rack and lights', 'Street pack'],
  },
];

const PIPE = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10).rotateX(Math.PI / 2);
const ENGINE_TOP = [1, 1.08, 1.16, 1.26];
const ENGINE_ACCEL = [1, 1.15, 1.3, 1.5];
const ARMOUR_DAMAGE = [1, 0.75, 0.55, 0.4];
const TYRE_GRIP = [1, 1.15, 1.32];

/** Where the bay is: on the road in front of the garage door, east of Dex's mission marker. */
export function garageBay(game) {
  const g = game.city.pois.garage;
  return { x: g.x + 16, z: g.z - 7 };
}

/** The car's stats from its model and upgrade levels (a copy: the shared model stays untouched). */
function tunedSpec(v) {
  const base = CAR_MODELS[v.model];
  const u = v.upgrades;
  return { ...base, top: base.top * ENGINE_TOP[u.engine], accel: base.accel * ENGINE_ACCEL[u.engine], grip: base.grip * TYRE_GRIP[u.tyres], health: base.health };
}

/** The visible parts of each upgrade, rebuilt on the car whenever its levels change. */
function buildMods(v) {
  const mesh = v.mesh;
  if (mesh.mods) mesh.root.remove(mesh.mods);
  const mods = new THREE.Group();
  mesh.mods = mods;
  mesh.root.add(mods);
  const s = v.spec;
  const b = mesh.geo.b;
  const L = s.len / 2;
  const u = v.upgrades;
  const chrome = mat(0xe0e0e0, { metal: 1, rough: 0.15 });
  const black = mat(0x111111, { rough: 0.5, metal: 0.3 });
  const steel = mat(0x55595f, { rough: 0.45, metal: 0.8 });
  const put = (geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    mods.add(m);
    return m;
  };
  if (u.engine >= 1) {
    put(box(0.6, 0.14, 0.7), black, 0, b.belt + 0.06, (b.cowl + L) / 2 + 0.1);
    put(box(0.5, 0.06, 0.05), chrome, 0, b.belt + 0.1, (b.cowl + L) / 2 + 0.46);
  }
  if (u.engine >= 2) {
    for (const sx of [-0.28, 0.28]) {
      const pipe = put(PIPE, chrome, sx, 0.34, -L - 0.1);
      pipe.castShadow = false;
    }
  }
  if (u.engine >= 3) {
    put(box(s.wid * 1.02, 0.05, 0.38), black, 0, b.belt + 0.42, -L + 0.28);
    for (const sx of [-1, 1]) put(box(0.06, 0.4, 0.1), black, sx * s.wid * 0.32, b.belt + 0.22, -L + 0.3);
    put(box(0.08, 0.02, 0.9), mat(0xff3b30, { emissive: 0xff2010, glow: 1.2 }), 0, b.belt + 0.02, (b.cowl + L) / 2);
  }
  if (u.armour >= 1) {
    put(box(s.wid * 0.9, 0.08, 0.08), steel, 0, 0.62, L + 0.22);
    put(box(s.wid * 0.9, 0.08, 0.08), steel, 0, 0.36, L + 0.22);
    for (const sx of [-0.35, 0.35]) put(box(0.08, 0.34, 0.08), steel, sx * s.wid, 0.49, L + 0.2);
  }
  if (u.armour >= 2) {
    for (const sx of [-1, 1]) put(box(0.05, 0.3, Math.abs(b.front - b.back) - 0.9), steel, sx * (s.wid / 2 + 0.06), 0.55, (b.front + b.back) / 2);
  }
  if (u.armour >= 3) {
    const roofY = mesh.geo.roofY;
    for (const sx of [-1, 1]) put(box(0.06, 0.06, 1.3), steel, sx * s.wid * 0.36, roofY + 0.1, (mesh.geo.frontTop + mesh.geo.rearTop) / 2);
    for (const z of [-0.45, 0, 0.45]) put(box(s.wid * 0.74, 0.05, 0.05), steel, 0, roofY + 0.12, (mesh.geo.frontTop + mesh.geo.rearTop) / 2 + z);
  }
  if (u.kit >= 1) bodyKit(v, put, u.kit);
  const rim = u.tyres >= 1 ? mat(0xffc93c, { metal: 1, rough: 0.2 }) : mat(0xd8d8d8, { metal: 0.95, rough: 0.22 });
  for (const w of mesh.wheels) {
    w.wheel.children[1].material = rim;
    w.wheel.scale.set(u.tyres >= 2 ? 1.45 : 1, u.tyres >= 2 ? 1.08 : 1, u.tyres >= 2 ? 1.08 : 1);
  }
}

/** The SUV's and the van's body kits: what each level bolts on. */
function bodyKit(v, put, level) {
  const s = v.spec;
  const geo = v.mesh.geo;
  const b = geo.b;
  const roofY = geo.roofY;
  const L = s.len / 2;
  const midZ = (geo.frontTop + geo.rearTop) / 2;
  const roofLen = Math.abs(geo.frontTop - geo.rearTop) * 0.8;
  const black = mat(0x1a1a1a, { rough: 0.5, metal: 0.4 });
  const lamp = mat(0xfff6d8, { emissive: 0xfff0c0, glow: 3 });
  // Level 1 on both: a roof rack.
  for (const sx of [-1, 1]) put(box(0.06, 0.06, roofLen), black, sx * s.wid * 0.36, roofY + 0.16, midZ);
  for (const z of [-0.4, 0, 0.4]) put(box(s.wid * 0.74, 0.05, 0.06), black, 0, roofY + 0.16, midZ + z * roofLen);
  if (v.model === 'suv') {
    put(box(s.wid * 0.7, 0.16, 0.14), black, 0, roofY + 0.26, midZ + roofLen / 2);
    for (const x of [-0.45, -0.15, 0.15, 0.45]) put(box(0.22, 0.13, 0.05), lamp, x * s.wid * 0.7 * 1.2, roofY + 0.26, midZ + roofLen / 2 + 0.08);
    if (level >= 2) {
      put(box(0.14, 0.9, 0.14), black, s.wid / 2 - 0.05, b.belt + 0.35, b.cowl - 0.15);
      put(geo.tire, black, 0, 0.95, -L - 0.2).rotation.y = Math.PI / 2;
      for (const sx of [-1, 1]) put(box(0.12, 0.1, Math.abs(b.front - b.back) - 1.0), mat(0x333333, { metal: 0.7, rough: 0.3 }), sx * (s.wid / 2 + 0.08), 0.42, (b.front + b.back) / 2);
    }
  } else {
    put(box(0.06, roofY - 0.4, 0.06), black, -s.wid * 0.3, (roofY + 0.4) / 2, -L - 0.06);
    put(box(0.06, roofY - 0.4, 0.06), black, -s.wid * 0.1, (roofY + 0.4) / 2, -L - 0.06);
    for (let y = 0.6; y < roofY; y += 0.3) put(box(s.wid * 0.2, 0.04, 0.04), black, -s.wid * 0.2, y, -L - 0.06);
    if (level >= 2) {
      const stripe = mat(0xff3fa4, { rough: 0.4 });
      for (const sx of [-1, 1]) put(box(0.02, 0.12, s.len * 0.8), stripe, sx * (s.wid / 2 + 0.02), b.belt - 0.35, 0);
      // Neon underglow: lit, so the street around the van glows pink.
      const glow = put(box(s.wid * 0.9, 0.04, s.len * 0.85), mat(0xff3fa4, { emissive: 0xff2a9a, glow: 4 }), 0, 0.12, 0);
      glow.castShadow = false;
    }
  }
}

/** Puts levels `u` on car `v`: its stats, its armour and the parts that show them. */
export function applyUpgrades(v, u) {
  v.upgrades = { engine: 0, armour: 0, tyres: 0, kit: 0, ...u };
  v.spec = tunedSpec(v);
  v.armourMul = ARMOUR_DAMAGE[v.upgrades.armour];
  buildMods(v);
}

export function upgradeLevel(v, id) {
  return v && v.upgrades ? v.upgrades[id] : 0;
}

/** Whether the next level of `item` can be bought for the car the player sits in: { ok, reason, price }. */
export function canUpgrade(game, item) {
  const v = game.player.vehicle;
  if (!v) return { ok: false, reason: 'No car', price: 0 };
  if (v.spec.police) return { ok: false, reason: 'Dex won\'t touch a cop car', price: 0 };
  if (v.spec.noGarage) return { ok: false, reason: 'Too big for the bay', price: 0 };
  if (item.only && !item.only.includes(v.model)) return { ok: false, reason: 'SUV and van only', price: 0 };
  const level = upgradeLevel(v, item.id);
  if (level >= item.prices.length) return { ok: false, reason: 'Maxed', price: 0 };
  const price = item.prices[level];
  if (game.player.money < price) return { ok: false, reason: 'Not enough cash', price };
  return { ok: true, reason: '', price };
}

/** Buys the next level of `item`; returns a line for the garage's status bar. */
export function buyUpgrade(game, item) {
  const check = canUpgrade(game, item);
  if (!check.ok) return check.reason;
  const v = game.player.vehicle;
  const level = upgradeLevel(v, item.id) + 1;
  game.player.money -= check.price;
  applyUpgrades(v, { ...v.upgrades, [item.id]: level });
  game.stats.upgrades = (game.stats.upgrades ?? 0) + 1;
  game.garageCar = { model: v.model, color: v.color, upgrades: { ...v.upgrades } };
  if (game.addRespect) game.addRespect(5 * level, `${item.name} upgrade`);
  if (game.audio) game.audio.pickup(true);
  return `${item.levels[level - 1]} fitted  -$${check.price.toLocaleString('en-US')}`;
}

/** Sets up the bay's marker, and parks the car Dex kept from the save, upgrades and all. */
export function createGarage(game, kept = null) {
  const bay = garageBay(game);
  game.garageBeacon = addBeacon(game.fx, bay.x, bay.z, 0xb4ff3f, 3.2);
  game.garageInside = false;
  game.garageCar = kept;
  if (kept && CAR_MODELS[kept.model]) {
    const v = createVehicle(game, kept.model, bay.x + 9, bay.z + 3, -Math.PI / 2, kept.color);
    v.ai = 'parked';
    v.stolen = true;
    applyUpgrades(v, kept.upgrades);
    game.lastCar = v;
  }
}

/** Opens the garage (game.openGarage) when the player stops a car in the bay; re-arms once they leave. */
export function updateGarage(game) {
  const p = game.player;
  const bay = garageBay(game);
  const v = p.vehicle;
  const d = Math.hypot((v ? v.x : p.x) - bay.x, (v ? v.z : p.z) - bay.z);
  // The marker steps aside while a car sits in the bay, so the car can be seen being tuned.
  if (game.garageBeacon) game.garageBeacon.mesh.visible = game.garageBeacon.arrow.visible = !game.garageInside;
  if (game.garageInside) {
    if (d > 6) game.garageInside = false;
    return;
  }
  if (!v || d > 3.6 || Math.abs(v.fwd) > 4 || game.race) return;
  game.garageInside = true;
  if (game.wanted.level > 0) {
    game.hud.notify('Dex: "Not with the cops on your tail. Lose them first."');
    return;
  }
  // Dex knocks the dents out for free while you browse.
  v.health = Math.max(v.health, 1000);
  if (game.openGarage) game.openGarage();
}
