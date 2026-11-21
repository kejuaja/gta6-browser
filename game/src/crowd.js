// Pedestrians: they stroll loops around the sidewalks, the beach and the pier, stop to idle,
// panic at gunfire (running or cowering), sometimes swing back when punched, and are spawned
// around the player and cleared away behind them to keep the streets busy.
import { createCharacter, moveCharacter, removeCharacter } from './characters.js';
import { randomLook } from './models.js';
import { DENSITY } from './config.js';
import { punch } from './combat.js';

function makeLoop(x0, z0, x1, z1, weight = 1) {
  const w = x1 - x0;
  const h = z1 - z0;
  return { x0, z0, x1, z1, w, h, p: 2 * (w + h), weight };
}

export function createCrowd(city) {
  const loops = city.blocks.map((b) => makeLoop(b.x0 + 2.3, b.z0 + 2.3, b.x1 - 2.3, b.z1 - 2.3));
  loops.push(makeLoop(-60, 20, -14, 590, 3));
  loops.push(makeLoop(-160, 296, -76, 304, 2));
  return { loops, spawnTimer: 0 };
}

function loopPoint(L, s) {
  let t = ((s % L.p) + L.p) % L.p;
  if (t < L.w) return { x: L.x0 + t, z: L.z0 };
  t -= L.w;
  if (t < L.h) return { x: L.x1, z: L.z0 + t };
  t -= L.h;
  if (t < L.w) return { x: L.x1 - t, z: L.z1 };
  t -= L.w;
  return { x: L.x0, z: L.z1 - t };
}

function loopParam(L, x, z) {
  const cx = Math.max(L.x0, Math.min(L.x1, x));
  const cz = Math.max(L.z0, Math.min(L.z1, z));
  const edges = [
    { d: Math.abs(z - L.z0) + Math.abs(x - cx), s: cx - L.x0 },
    { d: Math.abs(x - L.x1) + Math.abs(z - cz), s: L.w + (cz - L.z0) },
    { d: Math.abs(z - L.z1) + Math.abs(x - cx), s: L.w + L.h + (L.x1 - cx) },
    { d: Math.abs(x - L.x0) + Math.abs(z - cz), s: 2 * L.w + L.h + (L.z1 - cz) },
  ];
  edges.sort((a, b) => a.d - b.d);
  return edges[0].s;
}

function nearestLoop(crowd, x, z) {
  let best = crowd.loops[0];
  let bestD = Infinity;
  for (const L of crowd.loops) {
    const cx = Math.max(L.x0, Math.min(L.x1, x));
    const cz = Math.max(L.z0, Math.min(L.z1, z));
    const d = Math.hypot(cx - x, cz - z);
    if (d < bestD) {
      bestD = d;
      best = L;
    }
  }
  return best;
}

/** Puts a pedestrian at (x, z) walking the nearest loop; `state` may start it fleeing. */
export function spawnPed(game, x, z, look = null, state = 'walk') {
  const rng = game.rng;
  const c = createCharacter(game, 'ped', x, z, look ?? randomLook(rng), { health: 60, state });
  c.loop = nearestLoop(game.crowd, x, z);
  c.s = loopParam(c.loop, x, z);
  c.dir = rng.chance(0.5) ? 1 : -1;
  c.walkSpeed = rng.range(1.1, 1.7);
  c.brave = rng.chance(0.18);
  c.timer = rng.range(4, 20);
  return c;
}

function spawnAround(game) {
  const p = game.player;
  const rng = game.rng;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(35, 120);
    const x = p.x + Math.cos(a) * d;
    const z = p.z + Math.sin(a) * d;
    const L = nearestLoop(game.crowd, x, z);
    const s = loopParam(L, x, z) + rng.range(-10, 10);
    const pt = loopPoint(L, s);
    if (Math.hypot(pt.x - p.x, pt.z - p.z) < 30) continue;
    spawnPed(game, pt.x, pt.z);
    return;
  }
}

/** Sends everyone within `radius` of (x, z) running (or cowering), except `source`. */
export function panic(game, x, z, radius, source) {
  for (const c of game.chars) {
    if (c.kind !== 'ped' || !c.alive || c.vehicle || c === source) continue;
    if (Math.abs(c.x - x) > radius || Math.abs(c.z - z) > radius) continue;
    if (c.state === 'fight') continue;
    c.state = game.rng.chance(0.25) ? 'cower' : 'flee';
    c.fleeX = x;
    c.fleeZ = z;
    c.timer = game.rng.range(5, 10);
    if (game.audio && game.rng.chance(0.15)) game.audio.scream(c.x, c.z);
  }
}

/** A punched or shot pedestrian: brave ones fight back against the player's fists, the rest run. */
export function pedHurt(game, c, attacker) {
  if (!attacker) return;
  if (c.brave && attacker === game.player && game.player.weapon === 'fists' && !game.player.vehicle) {
    c.state = 'fight';
    c.timer = 12;
    return;
  }
  c.state = 'flee';
  c.fleeX = attacker.x;
  c.fleeZ = attacker.z;
  c.timer = 9;
}

function walk(game, c, dt) {
  c.timer -= dt;
  if (c.timer <= 0) {
    if (c.state === 'idle') {
      c.state = 'walk';
      c.timer = game.rng.range(8, 25);
      if (game.rng.chance(0.3)) c.dir = -c.dir;
    } else {
      c.state = 'idle';
      c.timer = game.rng.range(1.5, 5);
    }
  }
  if (c.state === 'idle') {
    moveCharacter(game, c, 0, 0, 0, dt);
    return;
  }
  c.s += c.dir * c.walkSpeed * dt;
  const t = loopPoint(c.loop, c.s + c.dir * 1.6);
  let dx = t.x - c.x;
  let dz = t.z - c.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  moveCharacter(game, c, dx, dz, c.walkSpeed * (d > 3 ? 1.6 : 1), dt);
}

function flee(game, c, dt) {
  c.timer -= dt;
  if (!Number.isFinite(c.fleeX) || !Number.isFinite(c.fleeZ)) {
    c.fleeX = game.player.x;
    c.fleeZ = game.player.z;
  }
  let dx = c.x - c.fleeX;
  let dz = c.z - c.fleeZ;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  // Swerve a little so a crowd scatters instead of moving as one block.
  const wob = Math.sin(game.time * 1.3 + c.id) * 0.5;
  moveCharacter(game, c, dx - dz * wob, dz + dx * wob, 5.4, dt);
  if (c.timer <= 0) {
    c.state = 'walk';
    c.loop = nearestLoop(game.crowd, c.x, c.z);
    c.s = loopParam(c.loop, c.x, c.z);
    c.timer = game.rng.range(6, 18);
  }
}

function fight(game, c, dt) {
  const p = game.player;
  c.timer -= dt;
  c.fireCooldown -= dt;
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const d = Math.hypot(dx, dz) || 1;
  if (c.timer <= 0 || !p.alive || p.vehicle || d > 25) {
    c.state = 'walk';
    c.loop = nearestLoop(game.crowd, c.x, c.z);
    c.s = loopParam(c.loop, c.x, c.z);
    return;
  }
  if (d > 1.1) moveCharacter(game, c, dx / d, dz / d, 4.6, dt);
  else {
    moveCharacter(game, c, 0, 0, 0, dt, Math.atan2(dx, dz));
    if (c.fireCooldown <= 0) {
      punch(game, c);
      c.fireCooldown = 0.9;
    }
  }
}

export function updateCrowd(game, dt) {
  const p = game.player;
  const crowd = game.crowd;
  let living = 0;
  for (let n = game.chars.length - 1; n >= 0; n -= 1) {
    const c = game.chars[n];
    if (c.kind !== 'ped' || c.vehicle) continue;
    const far = Math.abs(c.x - p.x) > DENSITY.despawn || Math.abs(c.z - p.z) > DENSITY.despawn;
    if (!c.alive) {
      if (far || (c.deadTime > 30 && Math.hypot(c.x - p.x, c.z - p.z) > 50)) removeCharacter(game, c);
      continue;
    }
    if (far && !c.mission) {
      removeCharacter(game, c);
      continue;
    }
    living += 1;
    if (c.state === 'flee') flee(game, c, dt);
    else if (c.state === 'cower') {
      c.timer -= dt;
      moveCharacter(game, c, 0, 0, 0, dt);
      if (c.timer <= 0) {
        c.state = 'flee';
        c.timer = 4;
      }
    } else if (c.state === 'fight') fight(game, c, dt);
    else walk(game, c, dt);
  }
  crowd.spawnTimer -= dt;
  if (living < DENSITY.peds && crowd.spawnTimer <= 0) {
    spawnAround(game);
    crowd.spawnTimer = 0.08;
  }
}

/** Fills the streets around the player at once (a new game, a respawn, a staged shot). */
export function populateCrowd(game, count) {
  for (let n = 0; n < count; n += 1) {
    const L = nearestLoop(game.crowd, game.player.x + game.rng.range(-90, 90), game.player.z + game.rng.range(-90, 90));
    const pt = loopPoint(L, game.rng.range(0, L.p));
    if (Math.hypot(pt.x - game.player.x, pt.z - game.player.z) < 4) continue;
    spawnPed(game, pt.x, pt.z);
  }
}
