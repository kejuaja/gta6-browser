// Cars: arcade driving physics with grip and handbrake drifts, crashes against buildings and each
// other, running people over, damage, smoke, fire and explosions. Who is at the wheel (the
// player, traffic, police) only changes the inputs handed to driveVehicle.
import { makeCarMesh, charCarMesh, disposeCarMesh } from './models.js';
import { CAR_MODELS, WORLD } from './config.js';
import { pushOutOfSolids, clampToLand } from './physics.js';
import { damageCharacter } from './characters.js';
import { burst, explosion, FX } from './effects.js';

let nextId = 1;
const normal = { x: 0, z: 0 };
const probe = { x: 0, z: 0 };
const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export function createVehicle(game, model, x, z, yaw, color = null) {
  const spec = CAR_MODELS[model];
  const paint = color ?? game.rng.pick(spec.colors);
  const mesh = makeCarMesh(model, paint);
  game.three.scene.add(mesh.root);
  const v = {
    id: nextId++,
    model,
    spec,
    mesh,
    color: paint,
    x,
    z,
    yaw,
    vx: 0,
    vz: 0,
    fwd: 0,
    lat: 0,
    steer: 0,
    health: spec.health ?? (spec.police ? 1300 : 1000),
    wrecked: false,
    burn: 0,
    driver: null,
    ai: null,
    siren: false,
    stuck: 0,
    smoke: 0,
    lastAttacker: null,
    radius: spec.wid * 0.55,
    throttle: 0,
    mission: null,
  };
  game.vehicles.push(v);
  syncVehicle(v, 0);
  return v;
}

export function removeVehicle(game, v) {
  game.three.scene.remove(v.mesh.root);
  disposeCarMesh(v.mesh);
  const i = game.vehicles.indexOf(v);
  if (i >= 0) game.vehicles.splice(i, 1);
}

export function forwardOf(v) {
  return { x: Math.sin(v.yaw), z: Math.cos(v.yaw) };
}

/** Where someone getting out stands: the driver's (left) side, or the right when that is blocked. */
export function exitPoint(game, v) {
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const lx = Math.cos(v.yaw);
  const lz = -Math.sin(v.yaw);
  for (const side of [1, -1]) {
    const off = side * (v.spec.wid / 2 + 0.75);
    const x = v.x + lx * off + fx * 0.3;
    const z = v.z + lz * off + fz * 0.3;
    const p = { x, z };
    if (!pushOutOfSolids(p, 0.35, game.city, normal) && game.city.isLand(x, z)) return p;
  }
  return { x: v.x + lx * (v.spec.wid / 2 + 0.75), z: v.z + lz * (v.spec.wid / 2 + 0.75) };
}

/** Whether (x, z) lies inside the car's footprint grown by `pad`. */
export function insideCar(v, x, z, pad = 0) {
  const dx = x - v.x;
  const dz = z - v.z;
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < v.spec.wid / 2 + pad && Math.abs(lz) < v.spec.len / 2 + pad;
}

/** Steps one car's physics with the given controls (throttle 0..1, brake 0..1, steer -1..1, handbrake). */
export function driveVehicle(game, v, ctl, dt) {
  const spec = v.spec;
  if (v.wrecked || v.burn > 0) ctl = IDLE;
  let fx = Math.sin(v.yaw);
  let fz = Math.cos(v.yaw);
  let rx = -Math.cos(v.yaw);
  let rz = Math.sin(v.yaw);
  let vF = v.vx * fx + v.vz * fz;
  let vL = v.vx * rx + v.vz * rz;
  const top = spec.top * (v.health < 300 ? 0.6 : 1);
  if (ctl.throttle > 0) {
    if (vF < -0.5) vF += 24 * dt * ctl.throttle;
    else vF += spec.accel * ctl.throttle * Math.max(0, 1 - (vF / top) ** 2) * dt;
  }
  if (ctl.brake > 0) {
    if (vF > 0.5) vF -= 26 * dt * ctl.brake;
    else vF = Math.max(-top * 0.32, vF - spec.accel * 0.7 * dt * ctl.brake);
  }
  if (ctl.throttle === 0 && ctl.brake === 0) {
    const roll = (0.9 + Math.abs(vF) * 0.06) * dt;
    vF = Math.abs(vF) <= roll ? 0 : vF - Math.sign(vF) * roll;
  }
  if (ctl.handbrake) vF *= 1 - Math.min(1, 1.4 * dt);
  const maxSteer = 0.62 / (1 + Math.abs(vF) / 13);
  v.steer += (ctl.steer * maxSteer - v.steer) * Math.min(1, dt * 7);
  let yawRate = (vF / (spec.len * 0.62)) * Math.tan(v.steer);
  if (ctl.handbrake) yawRate *= 1.45;
  v.yaw += yawRate * dt;
  const grip = ctl.handbrake ? 1.1 : spec.grip;
  vL *= Math.exp(-grip * dt);
  fx = Math.sin(v.yaw);
  fz = Math.cos(v.yaw);
  rx = -Math.cos(v.yaw);
  rz = Math.sin(v.yaw);
  v.vx = fx * vF + rx * vL;
  v.vz = fz * vF + rz * vL;
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  v.throttle = ctl.throttle;
  v.braking = ctl.brake > 0 && vF > 0.5;

  // Buildings: a circle at the front and one at the rear, each pushed out and bounced.
  for (const end of probes(spec)) {
    probe.x = v.x + fx * spec.len * end;
    probe.z = v.z + fz * spec.len * end;
    const ox = probe.x;
    const oz = probe.z;
    if (pushOutOfSolids(probe, v.radius, game.city, normal)) {
      v.x += probe.x - ox;
      v.z += probe.z - oz;
      const into = -(v.vx * normal.x + v.vz * normal.z);
      if (into > 0) {
        v.vx += normal.x * into * 1.35;
        v.vz += normal.z * into * 1.35;
        v.vx *= 0.9;
        v.vz *= 0.9;
        if (into > 4) crash(game, v, into, probe.x - normal.x * v.radius, probe.z - normal.z * v.radius);
      }
    }
  }
  const before = { x: v.x, z: v.z };
  if (clampToLand(v, game.city, WORLD)) {
    if (before.x !== v.x) v.vx *= -0.3;
    if (before.z !== v.z) v.vz *= -0.3;
  }
  v.fwd = v.vx * fx + v.vz * fz;
  v.lat = v.vx * rx + v.vz * rz;
  if (Math.abs(v.fwd) > 3) runOverPeople(game, v);
}

function crash(game, v, impact, x, z) {
  damageVehicle(game, v, impact * impact * 1.6, null);
  burst(game.fx, FX.spark, x, 0.7, z, Math.min(20, Math.round(impact * 2)), 4, 1);
  if (game.audio) game.audio.crash(x, z, impact);
  if (v.driver === game.player) game.fx.shake = Math.max(game.fx.shake, Math.min(0.8, impact / 18));
}

function hitPerson(game, v, c) {
  const speed = Math.hypot(v.vx, v.vz);
  const dx = c.x - v.x;
  const dz = c.z - v.z;
  const d = Math.hypot(dx, dz) || 1;
  c.x += (dx / d) * 1.2;
  c.z += (dz / d) * 1.2;
  c.vy = Math.min(6, speed * 0.35);
  c.y = 0.01;
  c.knock = 1;
  const killed = damageCharacter(game, c, speed * 7, v.driver, { x: c.x, y: 1, z: c.z });
  if (v.driver === game.player && game.crime) game.crime(killed ? 'murder' : 'runover', c);
  v.vx *= 0.92;
  v.vz *= 0.92;
}

function runOverPeople(game, v) {
  const p = game.player;
  if (p.alive && !p.vehicle && v.driver !== p && insideCar(v, p.x, p.z, 0.35)) hitPerson(game, v, p);
  for (const c of game.chars) {
    if (!c.alive || c.vehicle) continue;
    if (Math.abs(c.x - v.x) > 4 || Math.abs(c.z - v.z) > 4) continue;
    if (insideCar(v, c.x, c.z, 0.35)) hitPerson(game, v, c);
  }
}

/** Where along its length a body is tested for hits: two circles, four for a bus or a truck. */
function probes(spec) {
  return spec.len > 6 ? [0.4, 0.14, -0.14, -0.4] : [0.28, -0.28];
}

/** Pushes overlapping cars apart and trades their momentum along the hit. */
export function collideVehicles(game) {
  const list = game.vehicles;
  for (let a = 0; a < list.length; a += 1) {
    const p = list[a];
    for (let b = a + 1; b < list.length; b += 1) {
      const q = list[b];
      const dx0 = q.x - p.x;
      const dz0 = q.z - p.z;
      const reach = (p.spec.len + q.spec.len) / 2 + 2;
      if (dx0 * dx0 + dz0 * dz0 > Math.max(49, reach * reach)) continue;
      for (const ea of probes(p.spec)) {
        for (const eb of probes(q.spec)) {
          const ax = p.x + Math.sin(p.yaw) * p.spec.len * ea;
          const az = p.z + Math.cos(p.yaw) * p.spec.len * ea;
          const bx = q.x + Math.sin(q.yaw) * q.spec.len * eb;
          const bz = q.z + Math.cos(q.yaw) * q.spec.len * eb;
          const dx = bx - ax;
          const dz = bz - az;
          const r = p.radius + q.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          const overlap = (r - d) / 2;
          p.x -= nx * overlap;
          p.z -= nz * overlap;
          q.x += nx * overlap;
          q.z += nz * overlap;
          const rel = (p.vx - q.vx) * nx + (p.vz - q.vz) * nz;
          if (rel <= 0) continue;
          const j = rel * 0.65;
          p.vx -= nx * j;
          p.vz -= nz * j;
          q.vx += nx * j;
          q.vz += nz * j;
          if (rel > 3) {
            const who = p.driver === game.player || q.driver === game.player ? game.player : null;
            damageVehicle(game, p, rel * rel * 1.3, who);
            damageVehicle(game, q, rel * rel * 1.3, who);
            burst(game.fx, FX.spark, (ax + bx) / 2, 0.8, (az + bz) / 2, Math.min(16, Math.round(rel * 2)), 4, 1);
            if (game.audio) game.audio.crash((ax + bx) / 2, (az + bz) / 2, rel);
            if (who && game.onCarBump) game.onCarBump(p.driver === game.player ? q : p, rel);
          }
        }
      }
    }
  }
}

export function damageVehicle(game, v, amount, attacker) {
  if (v.wrecked) return;
  if (attacker) v.lastAttacker = attacker;
  // Garage armour (garage.js) soaks part of every hit.
  v.health -= amount * (v.armourMul ?? 1);
  if (v.health <= 0 && v.burn === 0) {
    v.health = 0;
    v.burn = 4.5;
  }
}

function explode(game, v) {
  v.wrecked = true;
  v.burn = 0;
  v.vx *= 0.3;
  v.vz *= 0.3;
  charCarMesh(v.mesh);
  if (v.mesh.sirens) v.mesh.sirens.red.visible = v.mesh.sirens.blue.visible = false;
  explosion(game.fx, v.x, 0.5, v.z);
  if (game.audio) game.audio.explosion(v.x, v.z);
  const blame = v.lastAttacker;
  const hurt = (c) => {
    const d = Math.hypot(c.x - v.x, c.z - v.z);
    if (d < 7) {
      if (damageCharacter(game, c, 160 * (1 - d / 7), blame) && blame === game.player && game.crime) game.crime(c.kind === 'cop' ? 'copKill' : 'murder', c);
      c.vy = 5;
      c.y = 0.01;
    }
  };
  if (v.driver && v.driver !== game.player) damageCharacter(game, v.driver, 999, blame);
  if (game.player.vehicle === v) damageCharacter(game, game.player, 999, null);
  else hurt(game.player);
  for (const c of game.chars) if (c.alive && !c.vehicle) hurt(c);
  for (const o of game.vehicles) {
    if (o === v || o.wrecked) continue;
    const d = Math.hypot(o.x - v.x, o.z - v.z);
    if (d < 6.5) {
      damageVehicle(game, o, 700 * (1 - d / 6.5), blame);
      o.vx += ((o.x - v.x) / (d || 1)) * 6;
      o.vz += ((o.z - v.z) / (d || 1)) * 6;
    }
  }
  if (blame === game.player && game.crime) game.crime('explosion', v);
  if (game.onCarWrecked) game.onCarWrecked(v);
}

/** Per-frame upkeep and looks: burning down to the blast, smoke from a damaged engine, wheels, sirens. */
export function updateVehicle(game, v, dt) {
  if (v.burn > 0) {
    v.burn -= dt;
    v.smoke -= dt;
    if (v.smoke <= 0) {
      v.smoke = 0.06;
      burst(game.fx, FX.fire, v.x + Math.sin(v.yaw) * v.spec.len * 0.3, 1.2, v.z + Math.cos(v.yaw) * v.spec.len * 0.3, 2, 0.6, 1.5);
      burst(game.fx, FX.smoke, v.x, 1.6, v.z, 1, 0.6, 2);
    }
    if (v.burn <= 0) explode(game, v);
  } else if (v.wrecked || v.health < 420) {
    v.smoke -= dt;
    if (v.smoke <= 0) {
      v.smoke = v.wrecked ? 0.35 : 0.12;
      burst(game.fx, v.wrecked || v.health < 200 ? FX.smoke : FX.whiteSmoke, v.x + Math.sin(v.yaw) * v.spec.len * 0.32, 1.2, v.z + Math.cos(v.yaw) * v.spec.len * 0.32, 1, 0.5, 1.2);
    }
  }
  syncVehicle(v, dt, game.time);
}

export function syncVehicle(v, dt, time = 0) {
  const m = v.mesh;
  m.root.position.set(v.x, 0, v.z);
  m.root.rotation.set(0, v.yaw, 0);
  m.root.rotation.z = Math.max(-0.08, Math.min(0.08, v.lat * 0.02));
  m.root.rotation.x = v.braking ? 0.025 : v.throttle > 0 && v.fwd < 10 ? -0.015 : 0;
  for (const w of m.wheels) {
    w.wheel.rotation.x += (v.fwd * dt) / 0.36;
    if (w.front) w.pivot.rotation.y = v.steer;
  }
  if (m.sirens) {
    const on = v.siren && !v.wrecked;
    const phase = Math.floor(time * 6) % 2 === 0;
    m.sirens.red.visible = !on || phase;
    m.sirens.blue.visible = !on || !phase;
  }
}

export function nearestVehicle(game, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const v of game.vehicles) {
    if (v.wrecked) continue;
    const d = Math.hypot(v.x - x, v.z - z) - v.spec.len * 0.3;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}
