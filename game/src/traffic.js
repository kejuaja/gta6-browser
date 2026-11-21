// Traffic: cars with drivers follow the right-hand lane along the road grid, pick a new road at
// each junction, keep their distance from what is ahead (honking at a player in the way), speed
// off from gunfire, back out when stuck, and are spawned and cleared in a ring around the player.
import { GRID, DENSITY, TRAFFIC_MODELS } from './config.js';
import { lanePoint, nodePos } from './citymap.js';
import { createVehicle, driveVehicle, removeVehicle } from './vehicles.js';
import { removeCharacter } from './characters.js';
import { spawnPed } from './crowd.js';
import { angleDiff } from './physics.js';

const N = GRID.blocks;

function neighbours(k, l) {
  const out = [];
  if (k > 0) out.push([k - 1, l]);
  if (k < N) out.push([k + 1, l]);
  if (l > 0) out.push([k, l - 1]);
  if (l < N) out.push([k, l + 1]);
  return out;
}

function pickNext(rng, route) {
  const options = neighbours(route[2], route[3]).filter(([k, l]) => !(k === route[0] && l === route[1]));
  const [k, l] = rng.pick(options);
  return [route[2], route[3], k, l];
}

function progress(route, x, z) {
  const a = nodePos(route[0], route[1]);
  const b = nodePos(route[2], route[3]);
  return b.x !== a.x ? (x - a.x) / (b.x - a.x) : (z - a.z) / (b.z - a.z);
}

/** Puts a driven car in the lane between two nodes, `t` along it, rolling at cruising speed. */
export function spawnTrafficCar(game, route, t, model = null) {
  const rng = game.rng;
  const pt = lanePoint(route[0], route[1], route[2], route[3], t);
  const v = createVehicle(game, model ?? rng.pick(TRAFFIC_MODELS), pt.x, pt.z, pt.yaw);
  v.ai = 'traffic';
  v.route = route;
  v.next = pickNext(rng, route);
  v.cruise = rng.range(9, 13);
  v.vx = Math.sin(pt.yaw) * v.cruise;
  v.vz = Math.cos(pt.yaw) * v.cruise;
  v.honk = 0;
  v.reverse = 0;
  const driver = spawnPed(game, pt.x, pt.z);
  driver.vehicle = v;
  driver.mesh.root.visible = false;
  v.driver = driver;
  return v;
}

function randomRoute(rng, k, l) {
  const [k1, l1] = rng.pick(neighbours(k, l));
  return [k, l, k1, l1];
}

function clearAt(game, x, z, r) {
  for (const v of game.vehicles) if (Math.abs(v.x - x) < r && Math.abs(v.z - z) < r) return false;
  return true;
}

function spawnAround(game, minD, maxD) {
  const rng = game.rng;
  const p = game.player;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const k = Math.round((p.x + rng.range(-maxD, maxD)) / GRID.cell);
    const l = Math.round((p.z + rng.range(-maxD, maxD)) / GRID.cell);
    if (k < 0 || l < 0 || k > N || l > N) continue;
    const route = randomRoute(rng, k, l);
    const t = rng.range(0.2, 0.75);
    const pt = lanePoint(route[0], route[1], route[2], route[3], t);
    const d = Math.hypot(pt.x - p.x, pt.z - p.z);
    if (d < minD || d > maxD || !clearAt(game, pt.x, pt.z, 12)) continue;
    return spawnTrafficCar(game, route, t);
  }
  return null;
}

export function populateTraffic(game, count) {
  for (let n = 0; n < count; n += 1) spawnAround(game, 18, 170);
}

/** Parked cars at the kerb near `spot`, waiting to be taken. */
export function parkCar(game, model, x, z, yaw, color = null) {
  const v = createVehicle(game, model, x, z, yaw, color);
  v.ai = 'parked';
  return v;
}

/** How far ahead (along the car's heading) the nearest obstacle is, within `range`; Infinity if clear. */
function obstacleAhead(game, v, range) {
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  let best = Infinity;
  const test = (x, z, width) => {
    const dx = x - v.x;
    const dz = z - v.z;
    const ahead = dx * fx + dz * fz;
    if (ahead <= 0 || ahead > range) return;
    const side = Math.abs(dx * fz - dz * fx);
    if (side < width) best = Math.min(best, ahead);
  };
  for (const o of game.vehicles) if (o !== v) test(o.x, o.z, 2.3);
  const p = game.player;
  if (!p.vehicle && p.alive) test(p.x, p.z, 1.6);
  for (const c of game.chars) if (c.alive && !c.vehicle && Math.abs(c.x - v.x) < range && Math.abs(c.z - v.z) < range) test(c.x, c.z, 1.4);
  return best;
}

function driveTraffic(game, v, dt) {
  if (v.reverse > 0) {
    v.reverse -= dt;
    driveVehicle(game, v, { throttle: 0, brake: 1, steer: v.reverseSteer, handbrake: false }, dt);
    return;
  }
  let t = progress(v.route, v.x, v.z);
  if (t >= 0.97) {
    v.route = v.next;
    v.next = pickNext(game.rng, v.route);
    t = progress(v.route, v.x, v.z);
  }
  const look = 9 / GRID.cell;
  const ahead = t + look;
  const target = ahead > 1 ? lanePoint(v.next[0], v.next[1], v.next[2], v.next[3], ahead - 1) : lanePoint(v.route[0], v.route[1], v.route[2], v.route[3], ahead);
  const desiredYaw = Math.atan2(target.x - v.x, target.z - v.z);
  const diff = angleDiff(v.yaw, desiredYaw);
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  const turning = ahead > 1 && (v.next[2] - v.next[0]) * (v.route[2] - v.route[0]) + (v.next[3] - v.next[1]) * (v.route[3] - v.route[1]) <= 0;
  let want = v.panic > 0 ? 19 : v.cruise;
  if (turning || Math.abs(diff) > 0.35) want = Math.min(want, 6.5);
  const block = obstacleAhead(game, v, 14);
  if (block < 5.5) want = 0;
  else if (block < 14) want = Math.min(want, (block - 5.5) * 1.2);
  if (v.panic > 0) v.panic -= dt;
  const ctl = { throttle: 0, brake: 0, steer, handbrake: false };
  if (v.fwd < want - 0.4) ctl.throttle = Math.min(1, (want - v.fwd) * 0.4 + 0.25);
  else if (v.fwd > want + 0.8) ctl.brake = Math.min(1, (v.fwd - want) * 0.25 + 0.2);
  driveVehicle(game, v, ctl, dt);

  const p = game.player;
  if (want === 0 && block < 8) {
    v.honk += dt;
    if (v.honk > 2.2 && Math.hypot(p.x - v.x, p.z - v.z) < 14) {
      if (game.audio) game.audio.horn(v.x, v.z);
      v.honk = -2.5;
    }
  } else v.honk = Math.max(0, v.honk - dt);
  if (want > 2 && v.fwd < 0.4) v.stuck += dt;
  else v.stuck = Math.max(0, v.stuck - dt);
  if (v.stuck > 2.5 && block === Infinity) {
    v.reverse = 1.4;
    v.reverseSteer = -steer;
    v.stuck = 0;
  }
}

export function updateTraffic(game, dt) {
  const p = game.player;
  let active = 0;
  for (let n = game.vehicles.length - 1; n >= 0; n -= 1) {
    const v = game.vehicles[n];
    const far = Math.abs(v.x - p.x) > DENSITY.despawn || Math.abs(v.z - p.z) > DENSITY.despawn;
    if (v.ai === 'traffic') {
      if (far || (v.wrecked && Math.hypot(v.x - p.x, v.z - p.z) > 90)) {
        if (v.driver && v.driver !== p) removeCharacter(game, v.driver);
        for (const c of v.crew ?? []) removeCharacter(game, c);
        removeVehicle(game, v);
        continue;
      }
      if (!v.driver || !v.driver.alive || v.driver.vehicle !== v) {
        v.ai = 'parked';
        continue;
      }
      active += 1;
      driveTraffic(game, v, dt);
    } else if (v.ai === 'parked' || (v.ai === null && v.driver !== p)) {
      if (far && !v.mission && v !== game.lastCar) {
        removeVehicle(game, v);
        continue;
      }
      driveVehicle(game, v, { throttle: 0, brake: Math.abs(v.fwd) > 0.2 ? 0.3 : 0, steer: 0, handbrake: false }, dt);
    }
  }
  game.trafficTimer = (game.trafficTimer ?? 0) - dt;
  if (active < DENSITY.traffic && game.trafficTimer <= 0) {
    spawnAround(game, 90, 190);
    game.trafficTimer = 0.3;
  }
}

/** Gunfire nearby: traffic floors it. */
export function scareTraffic(game, x, z, radius) {
  for (const v of game.vehicles) {
    if (v.ai !== 'traffic') continue;
    if (Math.abs(v.x - x) < radius && Math.abs(v.z - z) < radius) v.panic = 6;
  }
}
