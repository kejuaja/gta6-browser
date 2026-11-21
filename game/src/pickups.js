// Things lying around the city: hidden sun tokens to collect, weapons, health and armour that
// come back after a while, cash dropped by the fallen, the safehouse door that saves the game
// and Paint Shack, where a fresh coat of paint loses the police for $100.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { mat, box, repaintCar } from './models.js';
import { giveWeapon } from './player.js';
import { burst, addBeacon, FX } from './effects.js';
import { clearWanted } from './police.js';

// Every spot is on a road, the beach, the pier, the quay or in a park: never inside a building.
export const TOKEN_SPOTS = [
  [-52, 60], [-150, 300], [-35, 540], [79, 30], [193, 400], [262, 148], [296, 300],
  [370, 470], [410, 618], [520, 74], [592, 560], [150, 618], [455, 222], [112, 222],
];

const RESPAWNING = [
  { kind: 'weapon', weapon: 'pistol', x: 188, z: 418, amount: 36 },
  { kind: 'weapon', weapon: 'smg', x: 345, z: 610, amount: 90 },
  { kind: 'weapon', weapon: 'shotgun', x: 520, z: 38, amount: 18 },
  { kind: 'weapon', weapon: 'pistol', x: -40, z: 420, amount: 24 },
  { kind: 'health', x: 226, z: 120, amount: 50 },
  { kind: 'health', x: -30, z: 250, amount: 50 },
  { kind: 'health', x: 407, z: 296, amount: 50 },
  { kind: 'armor', x: 150, z: 296, amount: 50 },
  { kind: 'armor', x: 482, z: 150, amount: 50 },
];

function tokenMesh() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16), mat(0xffc93c, { emissive: 0xffa000, glow: 1.2, metal: 0.6, rough: 0.3 }));
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  for (let n = 0; n < 8; n += 1) {
    const ray = new THREE.Mesh(box(0.1, 0.25, 0.06), mat(0xffc93c, { emissive: 0xffa000, glow: 1.2 }));
    const a = (n / 8) * Math.PI * 2;
    ray.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  return g;
}

function pickupMesh(p) {
  if (p.kind === 'token') return tokenMesh();
  const g = new THREE.Group();
  if (p.kind === 'health') {
    const red = mat(0x2ee66b, { emissive: 0x10c040, glow: 1 });
    g.add(new THREE.Mesh(box(0.7, 0.22, 0.22), red), new THREE.Mesh(box(0.22, 0.7, 0.22), red));
  } else if (p.kind === 'armor') {
    g.add(new THREE.Mesh(box(0.6, 0.7, 0.25), mat(0x3f8cff, { emissive: 0x1050ff, glow: 0.9 })));
  } else if (p.kind === 'cash') {
    g.add(new THREE.Mesh(box(0.5, 0.2, 0.3), mat(0x5fd35f, { emissive: 0x20a020, glow: 0.8 })));
  } else {
    const dark = mat(0x222222, { metal: 0.6, rough: 0.3 });
    const len = p.weapon === 'pistol' ? 0.45 : 0.9;
    g.add(new THREE.Mesh(box(0.1, 0.18, len), dark));
    const grip = new THREE.Mesh(box(0.09, 0.25, 0.12), dark);
    grip.position.set(0, -0.18, -len * 0.25);
    g.add(grip);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 24), mat(0xff9f1c, { emissive: 0xff8000, glow: 1.4 }));
    g.add(halo);
  }
  return g;
}

function addPickup(game, p) {
  p.mesh = pickupMesh(p);
  p.mesh.position.set(p.x, 1, p.z);
  p.active = true;
  p.timer = 0;
  game.three.scene.add(p.mesh);
  game.pickups.push(p);
  return p;
}

export function createPickups(game) {
  game.pickups = [];
  TOKEN_SPOTS.forEach(([x, z], n) => {
    if (!game.progress.tokens.includes(n)) addPickup(game, { kind: 'token', id: n, x, z });
  });
  for (const r of RESPAWNING) addPickup(game, { ...r, respawn: 60 });
  const s = game.city.pois.safehouse;
  game.saveBeacon = addBeacon(game.fx, s.x, s.z, 0x4dff88, 1.4);
  const paint = game.city.pois.paint;
  game.paintBeacon = addBeacon(game.fx, paint.x, paint.z, 0xff5fd2, 3.5);
  game.saveCooldown = 0;
  game.paintCooldown = 0;
}

export function dropCash(game, x, z, amount) {
  addPickup(game, { kind: 'cash', x: x + 0.4, z, amount, once: true });
}

function collect(game, p) {
  const pl = game.player;
  if (p.kind === 'token') {
    game.progress.tokens.push(p.id);
    pl.money += 250;
    game.hud.notify(`Sun token ${game.progress.tokens.length} of ${TOKEN_SPOTS.length} found  +$250`);
  } else if (p.kind === 'health') {
    if (pl.health >= pl.maxHealth) return false;
    pl.health = Math.min(pl.maxHealth, pl.health + p.amount);
  } else if (p.kind === 'armor') {
    if (pl.armor >= 100) return false;
    pl.armor = Math.min(100, pl.armor + p.amount);
  } else if (p.kind === 'cash') {
    pl.money += p.amount;
  } else if (p.kind === 'weapon') {
    const first = !pl.ammo[p.weapon];
    giveWeapon(pl, p.weapon, p.amount);
    if (first) game.hud.notify(`Picked up the ${WEAPONS[p.weapon].name}. Mouse wheel or 1-4 to switch.`);
  }
  burst(game.fx, p.kind === 'token' ? FX.spark : FX.cash, p.x, 1, p.z, 14, 2.5, 2);
  if (game.audio) game.audio.pickup(p.kind === 'token');
  return true;
}

export function updatePickups(game, dt) {
  const pl = game.player;
  const reach = pl.vehicle ? 2.6 : 1.3;
  for (let n = game.pickups.length - 1; n >= 0; n -= 1) {
    const p = game.pickups[n];
    if (!p.active) {
      p.timer -= dt;
      if (p.timer <= 0) {
        p.active = true;
        p.mesh.visible = true;
      }
      continue;
    }
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = 1 + Math.sin(game.time * 2.5 + n) * 0.15;
    if (!pl.alive || Math.abs(pl.x - p.x) > reach || Math.abs(pl.z - p.z) > reach) continue;
    if (p.kind !== 'token' && p.kind !== 'cash' && pl.vehicle) continue;
    if (!collect(game, p)) continue;
    if (p.respawn) {
      p.active = false;
      p.mesh.visible = false;
      p.timer = p.respawn;
    } else {
      game.three.scene.remove(p.mesh);
      game.pickups.splice(n, 1);
    }
  }

  game.saveCooldown -= dt;
  const s = game.city.pois.safehouse;
  if (!pl.vehicle && game.saveCooldown <= 0 && Math.hypot(pl.x - s.x, pl.z - s.z) < 1.6) {
    game.saveCooldown = 8;
    if (game.wanted.level > 0) game.hud.notify('Lose the cops before you can save.');
    else if (game.saveGame) game.saveGame();
  }
  game.paintCooldown -= dt;
  const paint = game.city.pois.paint;
  if (pl.vehicle && game.paintCooldown <= 0 && Math.hypot(pl.x - paint.x, pl.z - paint.z) < 4.5) {
    game.paintCooldown = 6;
    if (game.wanted.level === 0) game.hud.notify('Paint Shack: come back when the cops are on you.');
    else if (game.wanted.floor > 0) game.hud.notify('Paint Shack: too hot right now. They know this car.');
    else if (pl.money < 100) game.hud.notify('Paint Shack: a new coat is $100.');
    else {
      pl.money -= 100;
      clearWanted(game);
      const v = pl.vehicle;
      const fresh = game.rng.pick(v.spec.colors.concat([0x00b894, 0x6c5ce7, 0xfd79a8, 0xfdcb6e]));
      repaintCar(v.mesh, fresh);
      v.health = Math.max(v.health, 700);
      burst(game.fx, FX.whiteSmoke, v.x, 1, v.z, 30, 3, 1);
      game.hud.notify('Paint Shack: fresh paint, new plates. The cops lost you.  -$100');
      if (game.audio) game.audio.pickup(true);
    }
  }
}
