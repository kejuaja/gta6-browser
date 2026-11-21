// People: the player, pedestrians, police on foot and gang members share one body. This file
// moves them (with collisions), animates their limbs, takes damage and lays out the dead.
// What each kind decides to do lives in player.js, crowd.js, police.js and missions.js.
import { makePersonMesh } from './models.js';
import { pushOutOfSolids, clampToLand, angleDiff } from './physics.js';
import { WORLD } from './config.js';
import { burst, FX } from './effects.js';

const normal = { x: 0, z: 0 };
let nextId = 1;

export function createCharacter(game, kind, x, z, look, opts = {}) {
  const mesh = makePersonMesh(look);
  game.three.scene.add(mesh.root);
  const c = {
    id: nextId++,
    kind,
    look,
    mesh,
    x,
    z,
    y: 0,
    vy: 0,
    yaw: opts.yaw ?? 0,
    moveSpeed: 0,
    phase: Math.random() * 6,
    health: opts.health ?? 100,
    maxHealth: opts.health ?? 100,
    armor: 0,
    alive: true,
    deadTime: 0,
    state: opts.state ?? 'walk',
    timer: 0,
    weapon: opts.weapon ?? 'fists',
    aiming: false,
    fireCooldown: 0,
    vehicle: null,
    radius: 0.38,
    group: opts.group ?? null,
    hostile: opts.hostile ?? false,
    knock: 0,
    punch: 0,
  };
  mesh.gun.visible = c.weapon !== 'fists';
  if (kind !== 'player') game.chars.push(c);
  syncCharacter(c);
  return c;
}

export function removeCharacter(game, c) {
  game.three.scene.remove(c.mesh.root);
  const i = game.chars.indexOf(c);
  if (i >= 0) game.chars.splice(i, 1);
}

/**
 * Walks `c` toward the unit direction (dx, dz) at `speed` m/s for dt seconds, turning to face it,
 * sliding along walls and staying on land. Zero direction stands still.
 */
export function moveCharacter(game, c, dx, dz, speed, dt, faceYaw = null) {
  // A bad direction (NaN) from any AI must never move anyone off the map's numbers.
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || !Number.isFinite(speed)) {
    dx = 0;
    dz = 0;
    speed = 0;
  }
  const moving = speed > 0.01 && (dx !== 0 || dz !== 0);
  if (moving) {
    c.x += dx * speed * dt;
    c.z += dz * speed * dt;
  }
  if (c.knock > 0) {
    c.knock -= dt;
  }
  const want = faceYaw ?? (moving ? Math.atan2(dx, dz) : c.yaw);
  c.yaw += angleDiff(c.yaw, want) * Math.min(1, dt * 12);
  c.moveSpeed += ((moving ? speed : 0) - c.moveSpeed) * Math.min(1, dt * 10);
  const pos = c;
  pushOutOfSolids(pos, c.radius, game.city, normal);
  clampToLand(pos, game.city, WORLD);
  if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) {
    c.x = c.lastX ?? game.city.pois.spawn.x;
    c.z = c.lastZ ?? game.city.pois.spawn.z;
  }
  c.lastX = c.x;
  c.lastZ = c.z;
  // Jumps and falls: the ground is y 0, the sidewalk a step up that people simply walk onto.
  if (c.y > 0 || c.vy > 0) {
    c.vy -= 18 * dt;
    c.y += c.vy * dt;
    if (c.y <= 0) {
      c.y = 0;
      c.vy = 0;
    }
  }
}

/** Separates people standing inside each other. */
export function separateCharacters(list) {
  for (let a = 0; a < list.length; a += 1) {
    const p = list[a];
    if (!p.alive || p.vehicle) continue;
    for (let b = a + 1; b < list.length; b += 1) {
      const q = list[b];
      if (!q.alive || q.vehicle) continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.6 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.78 - d) * 0.5;
      if (push <= 0) continue;
      p.x -= (dx / d) * push;
      p.z -= (dz / d) * push;
      q.x += (dx / d) * push;
      q.z += (dz / d) * push;
    }
  }
}

/** Poses the mesh: walk cycle from speed, an aimed arm, a punch, or lying dead. */
export function animateCharacter(c, dt) {
  const m = c.mesh;
  if (!c.alive) {
    c.deadTime += dt;
    const fall = Math.min(1, c.deadTime * 3);
    m.body.rotation.x = -fall * Math.PI / 2;
    m.body.position.y = fall * 0.25;
    m.legL.rotation.x = m.legR.rotation.x = 0;
    m.armL.rotation.z = 0.4 * fall;
    m.armR.rotation.z = -0.4 * fall;
    syncCharacter(c);
    return;
  }
  const s = c.moveSpeed;
  c.phase += dt * (2 + s * 1.9);
  const swing = Math.min(1, s / 4) * 0.75;
  m.legL.rotation.x = Math.sin(c.phase) * swing;
  m.legR.rotation.x = -Math.sin(c.phase) * swing;
  m.armL.rotation.x = -Math.sin(c.phase) * swing * 0.8;
  m.armR.rotation.x = Math.sin(c.phase) * swing * 0.8;
  m.armL.rotation.z = 0;
  m.armR.rotation.z = 0;
  m.body.position.y = Math.abs(Math.sin(c.phase)) * swing * 0.06;
  m.body.rotation.x = 0;
  if (c.aiming && c.weapon !== 'fists') {
    m.armR.rotation.x = -Math.PI / 2 + (c.aimPitch ?? 0);
    if (c.weapon !== 'pistol') {
      m.armL.rotation.x = -Math.PI / 2.4;
      m.armL.rotation.z = -0.5;
    }
  }
  if (c.punch > 0) {
    c.punch -= dt;
    m.armR.rotation.x = -Math.PI / 2 * Math.sin((1 - c.punch / 0.3) * Math.PI);
  }
  if (c.state === 'cower') {
    m.armL.rotation.x = m.armR.rotation.x = -2.6;
    m.body.position.y = -0.25;
  }
  syncCharacter(c);
}

export function syncCharacter(c) {
  const r = c.mesh.root;
  r.position.set(c.x, c.y + (c.onSidewalk ? 0.2 : 0), c.z);
  r.rotation.y = c.yaw;
}

/**
 * Takes `amount` from c (armour first for the player); returns true when it kills. `attacker` is
 * the character (or null) behind it; game.onHurt hears every hit and game.onKill every death.
 */
export function damageCharacter(game, c, amount, attacker, hit = null) {
  if (!c.alive) return false;
  if (c.armor > 0) {
    const soak = Math.min(c.armor, amount * 0.7);
    c.armor -= soak;
    amount -= soak;
  }
  c.health -= amount;
  if (hit) burst(game.fx, FX.blood, hit.x, hit.y, hit.z, 6, 2);
  if (game.onHurt) game.onHurt(c, attacker);
  if (c.health <= 0) {
    c.health = 0;
    c.alive = false;
    c.deadTime = 0;
    c.aiming = false;
    c.mesh.gun.visible = false;
    if (game.onKill) game.onKill(c, attacker);
    return true;
  }
  return false;
}

/** The two-point "is on a sidewalk" test that lifts feet onto the kerb. */
export function updateFooting(game, c) {
  c.onSidewalk = Boolean(game.city.blockAt(c.x, c.z));
}
