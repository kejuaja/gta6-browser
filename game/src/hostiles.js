// Mission enemies: gang members who guard a spot until the player comes close (or a shot lands
// near them), then take cover-ish positions and shoot; and the courier car that flees through
// the road grid away from the player.
import { createCharacter, moveCharacter } from './characters.js';
import { LOOKS } from './models.js';
import { fireWeapon } from './combat.js';
import { lineOfSight, angleDiff } from './physics.js';
import { driveVehicle } from './vehicles.js';
import { GRID } from './config.js';
import { nodePos } from './citymap.js';

export function spawnHostile(game, x, z, opts = {}) {
  const look = opts.look ?? LOOKS.gang;
  const c = createCharacter(game, opts.kind ?? 'gang', x, z, look, { health: opts.health ?? 80, weapon: opts.weapon ?? 'pistol', state: 'guard', yaw: opts.yaw ?? 0, group: opts.group ?? null });
  c.home = { x, z };
  c.fireCooldown = 1 + game.rng.next() * 1.5;
  c.mission = true;
  return c;
}

/** Wakes a whole group once any of them is hurt or the player gets close. */
function alertGroup(game, group) {
  for (const c of game.chars) if (c.group === group && c.alive) c.state = 'attack';
}

export function hostileHurt(game, c) {
  if (c.group) alertGroup(game, c.group);
  else c.state = 'attack';
}

function updateHostile(game, c, dt) {
  const p = game.player;
  const tx = p.vehicle ? p.vehicle.x : p.x;
  const tz = p.vehicle ? p.vehicle.z : p.z;
  const dx = tx - c.x;
  const dz = tz - c.z;
  const d = Math.hypot(dx, dz) || 1;
  c.fireCooldown -= dt;
  c.losTimer = (c.losTimer ?? 0) - dt;
  if (c.losTimer <= 0) {
    c.los = d < 70 && lineOfSight({ x: c.x, y: 1.6, z: c.z }, { x: tx, y: 1.3, z: tz }, game.city);
    c.losTimer = 0.3;
  }
  if (c.state === 'guard') {
    c.aiming = false;
    // Pacing about their post.
    const t = game.time * 0.4 + c.id;
    const gx = c.home.x + Math.cos(t) * 2 - c.x;
    const gz = c.home.z + Math.sin(t) * 2 - c.z;
    const gd = Math.hypot(gx, gz);
    moveCharacter(game, c, gd > 0.3 ? gx / gd : 0, gd > 0.3 ? gz / gd : 0, 1.1, dt);
    if ((d < 26 && c.los) || d < 10) {
      if (c.group) alertGroup(game, c.group);
      else c.state = 'attack';
      if (game.onHostilesAlerted) game.onHostilesAlerted(c);
    }
    return;
  }
  if (!p.alive) {
    c.aiming = false;
    moveCharacter(game, c, 0, 0, 0, dt);
    return;
  }
  const face = Math.atan2(dx, dz);
  c.aiming = c.los;
  if (!c.los || d > 28) moveCharacter(game, c, dx / d, dz / d, 4.8, dt, c.los ? face : null);
  else if (d < 6) moveCharacter(game, c, -dx / d, -dz / d, 2.5, dt, face);
  else {
    const side = Math.sin(game.time * 0.9 + c.id * 2) > 0 ? 1 : -1;
    moveCharacter(game, c, (-dz / d) * side, (dx / d) * side, 1.8, dt, face);
  }
  if (c.los && d < 50 && c.fireCooldown <= 0) {
    const moving = p.vehicle ? Math.min(3, Math.abs(p.vehicle.fwd) / 8) : p.moveSpeed > 3 ? 1 : 0;
    fireWeapon(game, c, { x: tx, y: p.vehicle ? 1 : p.y + 1.3, z: tz }, 3.5 + d * 0.1 + moving * 3);
    c.fireCooldown = c.weapon === 'smg' ? game.rng.range(0.15, 0.4) : game.rng.range(0.7, 1.4);
    if (c.weapon === 'smg' && game.rng.chance(0.15)) c.fireCooldown = 1.4;
  }
}

/**
 * A fleeing car: at each junction it takes the road that leads farthest from the player,
 * flat out, and swerves round what is in front.
 */
function driveFleeing(game, v, dt) {
  const p = game.player;
  if (!v.driver || !v.driver.alive || v.wrecked) {
    driveVehicle(game, v, { throttle: 0, brake: 0.4, steer: 0, handbrake: false }, dt);
    return;
  }
  if (!v.navNode || Math.hypot(nodePos(v.navNode.k, v.navNode.l).x - v.x, nodePos(v.navNode.k, v.navNode.l).z - v.z) < 10) {
    const here = v.navNode ?? game.city.nearestNode(v.x, v.z);
    const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([a, b]) => ({ k: here.k + a, l: here.l + b }))
      .filter((n) => n.k >= 0 && n.l >= 0 && n.k <= GRID.blocks && n.l <= GRID.blocks)
      .filter((n) => !v.prevNode || n.k !== v.prevNode.k || n.l !== v.prevNode.l);
    let best = options[0];
    let bestScore = -Infinity;
    for (const n of options) {
      const pos = nodePos(n.k, n.l);
      const score = Math.hypot(pos.x - p.x, pos.z - p.z) + game.rng.range(0, 40);
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    v.prevNode = here;
    v.navNode = best;
  }
  const aim = nodePos(v.navNode.k, v.navNode.l);
  const diff = angleDiff(v.yaw, Math.atan2(aim.x - v.x, aim.z - v.z));
  const sharp = Math.abs(diff) > 0.8;
  driveVehicle(game, v, {
    throttle: sharp && v.fwd > 11 ? 0.2 : 1,
    brake: sharp && v.fwd > 15 ? 0.7 : 0,
    steer: Math.max(-1, Math.min(1, diff * 2.5)),
    handbrake: sharp && v.fwd > 12,
  }, dt);
  if (v.fwd < 1) v.stuck += dt;
  else v.stuck = 0;
  if (v.stuck > 1.5) {
    v.navNode = null;
    v.vx = -Math.sin(v.yaw) * 4;
    v.vz = -Math.cos(v.yaw) * 4;
    v.stuck = 0;
  }
}

export function updateHostiles(game, dt) {
  for (const c of game.chars) {
    if ((c.kind === 'gang' || c.kind === 'target') && c.alive && !c.vehicle) updateHostile(game, c, dt);
  }
  for (const v of game.vehicles) if (v.ai === 'flee') driveFleeing(game, v, dt);
}
