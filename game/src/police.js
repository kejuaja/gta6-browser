// The wanted level and the police: crimes add heat (witnessed or not), heat sets the stars, the
// stars set how many units are dispatched. Cruisers chase along the road grid and ram, crews get
// out and arrest (one star) or shoot (two and up), and staying out of sight long enough loses them.
import { fireWeapon } from './combat.js';
import { spawnTrafficCar } from './traffic.js';
import { GRID, WANTED_THRESHOLDS, POLICE_UNITS, CRIMES, DENSITY, COP_SIGHT, PATROLS, policeModelFor } from './config.js';
import { lanePoint, nodePos } from './citymap.js';
import { createVehicle, driveVehicle, exitPoint, removeVehicle } from './vehicles.js';
import { createCharacter, moveCharacter, removeCharacter } from './characters.js';
import { LOOKS } from './models.js';
import { lineOfSight, angleDiff } from './physics.js';

const N = GRID.blocks;

export function createWanted() {
  return { heat: 0, level: 0, unseen: 0, seen: false, losTimer: 0, gunfireCooldown: 0, dispatch: 0, bust: 0, lastX: 0, lastZ: 0, floor: 0 };
}

function levelFor(heat) {
  let level = 0;
  for (let n = 1; n < WANTED_THRESHOLDS.length; n += 1) if (heat >= WANTED_THRESHOLDS[n]) level = n;
  return level;
}

/** Whether a cop (on foot or at a wheel) within `range` of (x, z) has a clear line of sight to it. */
export function copSees(game, x, z, range = COP_SIGHT) {
  for (const c of game.chars) {
    if (c.kind !== 'cop' || !c.alive) continue;
    const cx = c.vehicle ? c.vehicle.x : c.x;
    const cz = c.vehicle ? c.vehicle.z : c.z;
    if (Math.abs(cx - x) > range || Math.abs(cz - z) > range || Math.hypot(cx - x, cz - z) > range) continue;
    if (lineOfSight({ x: cx, y: 1.5, z: cz }, { x, y: 1.2, z }, game.city)) return true;
  }
  return false;
}

/** Whether a bystander near (x, z) saw it and would call it in (for noisy crimes only). */
function bystanderSees(game, x, z) {
  for (const c of game.chars) {
    if (c.kind === 'ped' && c.alive && !c.vehicle && Math.hypot(c.x - x, c.z - z) < 22) return true;
  }
  return false;
}

/** A crime of `kind` (a CRIMES key) by the player at `at` ({x, z}). */
export function reportCrime(game, kind, at) {
  const w = game.wanted;
  if (game.mode === 'title' || game.noCrime) return;
  if (kind === 'gunfire') {
    if (w.gunfireCooldown > 0) return;
    w.gunfireCooldown = 2.5;
  }
  // Car theft is quiet: only a cop who sees it counts. Gunfire and fights are loud: anyone may call it in.
  const car = kind === 'carjack' || kind === 'theft';
  if (car && !copSees(game, at.x, at.z)) return;
  if (!car && (kind === 'gunfire' || kind === 'assault') && w.level === 0 && !copSees(game, at.x, at.z, 60) && !bystanderSees(game, at.x, at.z)) return;
  if (car && w.level === 0 && game.hud) game.hud.notify('A cop saw you take that car!');
  const before = w.level;
  w.heat = Math.min(WANTED_THRESHOLDS[5] + 5, w.heat + CRIMES[kind]);
  w.level = Math.max(w.floor, levelFor(w.heat));
  w.unseen = 0;
  w.lastX = game.player.x;
  w.lastZ = game.player.z;
  if (w.level > before && game.onWantedUp) game.onWantedUp(w.level);
}

export function setWanted(game, level) {
  const w = game.wanted;
  w.heat = Math.max(w.heat, WANTED_THRESHOLDS[level] + 0.01);
  w.level = Math.max(w.level, level);
  w.unseen = 0;
  w.lastX = game.player.x;
  w.lastZ = game.player.z;
}

export function clearWanted(game) {
  const w = game.wanted;
  w.heat = 0;
  w.level = 0;
  w.unseen = 0;
  w.floor = 0;
  w.bust = 0;
}

function playerTarget(game) {
  const p = game.player;
  if (p.vehicle) return { x: p.vehicle.x + p.vehicle.vx * 0.6, z: p.vehicle.z + p.vehicle.vz * 0.6 };
  return { x: p.x, z: p.z };
}

export function makeCop(game, x, z, yaw) {
  const c = createCharacter(game, 'cop', x, z, LOOKS.cop, { health: 90, weapon: 'pistol', yaw, state: 'engage' });
  c.fireCooldown = 1 + game.rng.next();
  return c;
}

/** A cruiser with a crew of two, sirens on, coming in on a road 90-160 m from the player. */
export function spawnPoliceUnit(game, x = null, z = null) {
  const rng = game.rng;
  const p = game.player;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let k;
    let l;
    if (x !== null) {
      k = Math.round(x / GRID.cell);
      l = Math.round(z / GRID.cell);
    } else {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(90, 160);
      k = Math.round((p.x + Math.cos(a) * d) / GRID.cell);
      l = Math.round((p.z + Math.sin(a) * d) / GRID.cell);
    }
    k = Math.max(0, Math.min(N, k));
    l = Math.max(0, Math.min(N, l));
    const dk = Math.sign(Math.round(p.x / GRID.cell) - k) || (k < N ? 1 : -1);
    const route = [k, l, Math.max(0, Math.min(N, k + dk)), l];
    if (route[2] === k) route[3] = l < N ? l + 1 : l - 1;
    const pt = lanePoint(route[0], route[1], route[2], route[3], 0.3);
    if (x === null && Math.hypot(pt.x - p.x, pt.z - p.z) < 70) continue;
    const model = policeModelFor(game.wanted.level, rng.next());
    const v = createVehicle(game, model, pt.x, pt.z, pt.yaw);
    v.ai = 'police';
    v.siren = true;
    v.vx = Math.sin(pt.yaw) * 12;
    v.vz = Math.cos(pt.yaw) * 12;
    v.crew = [];
    for (let n = 0; n < (model === 'ptruck' ? 4 : 2); n += 1) v.crew.push(makeCop(game, pt.x, pt.z, pt.yaw));
    for (const c of v.crew) {
      c.vehicle = v;
      c.mesh.root.visible = false;
    }
    v.driver = v.crew[0];
    v.reverse = 0;
    v.navNode = null;
    return v;
  }
  return null;
}

/**
 * A patrol: a cruiser with a crew of two driving the ordinary traffic lanes, sirens off. It is
 * what sees a car stolen, and the first unit to join a chase.
 */
function spawnPatrol(game) {
  const rng = game.rng;
  const p = game.player;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const k = Math.max(0, Math.min(N, Math.round((p.x + rng.range(-150, 150)) / GRID.cell)));
    const l = Math.max(0, Math.min(N, Math.round((p.z + rng.range(-150, 150)) / GRID.cell)));
    const dk = k < N ? 1 : -1;
    const route = rng.chance(0.5) ? [k, l, k + dk, l] : [k, l, k, l < N ? l + 1 : l - 1];
    const pt = lanePoint(route[0], route[1], route[2], route[3], 0.4);
    const d = Math.hypot(pt.x - p.x, pt.z - p.z);
    if (d < 70 || d > 190) continue;
    const v = spawnTrafficCar(game, route, 0.4, 'cruiser');
    removeCharacter(game, v.driver);
    v.crew = [makeCop(game, pt.x, pt.z, pt.yaw), makeCop(game, pt.x, pt.z, pt.yaw)];
    for (const c of v.crew) {
      c.vehicle = v;
      c.mesh.root.visible = false;
    }
    v.driver = v.crew[0];
    v.patrol = true;
    v.cruise = 9;
    v.reverse = 0;
    return v;
  }
  return null;
}

function deployCrew(game, v) {
  v.ai = 'parked';
  v.deployed = true;
  for (const c of v.crew) {
    if (!c.alive || c.vehicle !== v) continue;
    const spot = exitPoint(game, v);
    c.vehicle = null;
    c.x = spot.x + (Math.random() - 0.5);
    c.z = spot.z + (Math.random() - 0.5);
    c.mesh.root.visible = true;
    c.state = 'engage';
  }
  v.driver = null;
}

function nextNodeToward(from, to) {
  const dk = to.k - from.k;
  const dl = to.l - from.l;
  if (dk === 0 && dl === 0) return null;
  if (Math.abs(dk) >= Math.abs(dl)) return { k: from.k + Math.sign(dk), l: from.l };
  return { k: from.k, l: from.l + Math.sign(dl) };
}

function drivePolice(game, v, dt) {
  const p = game.player;
  if (!v.driver || !v.driver.alive || v.driver.vehicle !== v) {
    v.ai = 'parked';
    return;
  }
  const target = playerTarget(game);
  const dist = Math.hypot(target.x - v.x, target.z - v.z);
  const playerSlow = !p.vehicle || Math.abs(p.vehicle.fwd) < 4;
  if (dist < 20 && playerSlow) {
    driveVehicle(game, v, { throttle: 0, brake: 1, steer: 0, handbrake: Math.abs(v.fwd) > 6 }, dt);
    if (Math.abs(v.fwd) < 2) deployCrew(game, v);
    return;
  }
  if (v.reverse > 0) {
    v.reverse -= dt;
    driveVehicle(game, v, { throttle: 0, brake: 1, steer: v.reverseSteer, handbrake: false }, dt);
    return;
  }
  // Along the road grid toward the player's junction; straight at them once near or on their road.
  let aim = target;
  const here = game.city.nearestNode(v.x, v.z);
  const there = game.city.nearestNode(target.x, target.z);
  const sameRoad = Math.abs(v.x - target.x) < 8 || Math.abs(v.z - target.z) < 8;
  if (dist > 34 && !sameRoad) {
    if (!v.navNode || Math.hypot(nodePos(v.navNode.k, v.navNode.l).x - v.x, nodePos(v.navNode.k, v.navNode.l).z - v.z) < 9) {
      const startNode = v.navNode ?? here;
      v.navNode = nextNodeToward(startNode, there) ?? there;
    }
    aim = nodePos(v.navNode.k, v.navNode.l);
  } else v.navNode = null;
  const want = Math.atan2(aim.x - v.x, aim.z - v.z);
  const diff = angleDiff(v.yaw, want);
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  const sharp = Math.abs(diff) > 0.9;
  const ctl = {
    throttle: sharp && v.fwd > 9 ? 0 : 1,
    brake: sharp && v.fwd > 12 ? 0.8 : 0,
    steer,
    handbrake: sharp && v.fwd > 10,
  };
  driveVehicle(game, v, ctl, dt);
  if (v.fwd < 1) v.stuck += dt;
  else v.stuck = 0;
  if (v.stuck > 1.3) {
    v.reverse = 1.1;
    v.reverseSteer = -steer;
    v.stuck = 0;
  }
}

function copOnFoot(game, c, dt) {
  const p = game.player;
  const w = game.wanted;
  c.fireCooldown -= dt;
  if (w.level === 0) {
    c.aiming = false;
    moveCharacter(game, c, 0, 0, 0, dt);
    return;
  }
  const tx = p.vehicle ? p.vehicle.x : p.x;
  const tz = p.vehicle ? p.vehicle.z : p.z;
  const dx = tx - c.x;
  const dz = tz - c.z;
  const d = Math.hypot(dx, dz) || 1;
  c.losTimer = (c.losTimer ?? 0) - dt;
  if (c.losTimer <= 0) {
    c.los = d < 75 && lineOfSight({ x: c.x, y: 1.6, z: c.z }, { x: tx, y: 1.3, z: tz }, game.city);
    c.losTimer = 0.35;
  }
  const arrest = w.level === 1 && p.alive;
  const face = Math.atan2(dx, dz);
  if (arrest) {
    c.aiming = false;
    if (d > 1.4) moveCharacter(game, c, dx / d, dz / d, 5.6, dt);
    else moveCharacter(game, c, 0, 0, 0, dt, face);
    const pinned = p.vehicle ? Math.abs(p.vehicle.fwd) < 1.5 && d < 3.2 : d < 1.8;
    if (pinned) w.bust += dt;
    return;
  }
  c.aiming = c.los && d < 60;
  // A roadblock's crew holds its post behind the cruisers until the player comes close.
  if (c.post && d > 28) {
    moveCharacter(game, c, 0, 0, 0, dt, face);
  } else if (!c.los || d > 22) moveCharacter(game, c, dx / d, dz / d, 5.4, dt, c.los && d < 40 ? face : null);
  else if (d < 7) moveCharacter(game, c, -dx / d, -dz / d, 2.2, dt, face);
  else {
    const strafe = Math.sin(game.time * 0.7 + c.id) > 0 ? 1 : -1;
    moveCharacter(game, c, (-dz / d) * strafe, (dx / d) * strafe, 1.6, dt, face);
  }
  if (c.los && d < 55 && c.fireCooldown <= 0) {
    const moving = p.vehicle ? Math.min(3, Math.abs(p.vehicle.fwd) / 8) : p.moveSpeed > 3 ? 1 : 0;
    const miss = 6 + d * 0.16 + moving * 3 - w.level * 0.4;
    fireWeapon(game, c, { x: tx, y: p.vehicle ? 1 : p.y + 1.3, z: tz }, Math.max(2, miss));
    c.fireCooldown = game.rng.range(0.8, 1.6) - w.level * 0.08;
  }
}

/** Seconds out of every cop's sight that lose the police at `level` stars. */
function escapeAfter(level) {
  return 9 + level * 3.5;
}

/** Seconds left until the police give up on a hidden player; null while seen or a mission holds the heat. */
export function escapeTime(game) {
  const w = game.wanted;
  if (w.level === 0 || w.seen || w.level <= w.floor) return null;
  return Math.max(0, escapeAfter(w.level) - w.unseen);
}

const UNIT_NAMES = { cruiser: 'CRUISER', psuv: 'INTERCEPTOR', ptruck: 'RIOT TRUCK' };
const dispatch = { units: 0, roadblocks: 0, rows: [] };
const rowPool = [];
const nearestFirst = (a, b) => a.dist - b.dist;

/** A unit's call sign on the radio: its model and a number fixed by the vehicle's id. */
function callSign(v) {
  if (!v.callSign) v.callSign = `${UNIT_NAMES[v.model] ?? 'UNIT'} ${10 + ((v.id * 37) % 90)}`;
  return v.callSign;
}

/**
 * The police dispatch board: every unit on the call (Air 1, cruisers chasing, crews out on foot,
 * roadblocks), nearest first, each with its distance from the player and what it is doing right
 * now. The object and its rows are reused from call to call: read them, do not keep them.
 */
export function dispatchRows(game) {
  const p = game.player;
  const px = p.vehicle ? p.vehicle.x : p.x;
  const pz = p.vehicle ? p.vehicle.z : p.z;
  let n = 0;
  const add = (kind, name, dist, tag) => {
    const r = rowPool[n] ?? (rowPool[n] = { kind: '', name: '', dist: 0, tag: '' });
    r.kind = kind;
    r.name = name;
    r.dist = dist;
    r.tag = tag;
    n += 1;
  };
  const heli = game.heli;
  if (heli && heli.active && !heli.down) add('air', 'AIR 1', Math.hypot(heli.x - px, heli.z - pz), heli.spotting ? 'SPOTLIGHT' : heli.leaving ? 'RETURNING' : 'SEARCHING');
  for (const v of game.vehicles) {
    if (!v.spec.police || !v.crew || v.ai === 'traffic') continue;
    let alive = 0;
    let fired = false;
    let near = Infinity;
    for (const c of v.crew) {
      if (!c.alive) continue;
      alive += 1;
      if (game.time - (c.firedAt ?? -9) < 1) fired = true;
      near = Math.min(near, c.vehicle ? Math.hypot(v.x - px, v.z - pz) : Math.hypot(c.x - px, c.z - pz));
    }
    if (!alive) continue;
    if (v.roadblock) add('car', callSign(v), near, fired ? 'FIRING' : 'ROADBLOCK');
    else if (v.deployed) add('foot', callSign(v), near, fired ? 'FIRING' : 'ON FOOT');
    else if (v.ai === 'police') add('car', callSign(v), near, near < 12 ? 'RAMMING' : near < 45 ? 'CLOSING IN' : 'PURSUIT');
  }
  dispatch.rows.length = 0;
  for (let k = 0; k < n; k += 1) dispatch.rows.push(rowPool[k]);
  dispatch.rows.sort(nearestFirst);
  dispatch.units = n;
  dispatch.roadblocks = (game.roadblocks ?? []).length;
  return dispatch;
}

/** One step of the whole police force and the wanted level's upkeep. */
export function updatePolice(game, dt) {
  const w = game.wanted;
  const p = game.player;
  w.gunfireCooldown -= dt;
  w.dispatch -= dt;
  let units = 0;
  let cruisers = 0;
  let patrols = 0;
  let seen = false;
  for (let n = game.vehicles.length - 1; n >= 0; n -= 1) {
    const v = game.vehicles[n];
    if (!v.spec.police || !v.crew) continue;
    cruisers += 1;
    const far = Math.hypot(v.x - p.x, v.z - p.z);
    const crewAlive = v.crew.some((c) => c.alive);
    const abandoned = !v.patrol && v.ai !== 'traffic' && w.level === 0 && far > 110;
    if ((far > DENSITY.despawn || abandoned) && v !== p.vehicle) {
      for (const c of v.crew) removeCharacter(game, c);
      removeVehicle(game, v);
      continue;
    }
    if (crewAlive) units += 1;
    if (v.ai === 'traffic' && v.patrol) {
      patrols += 1;
      // A patrol that is near when the stars go up joins the chase.
      if (w.level > 0 && far < 170 && v.driver && v.driver.alive && v.driver.vehicle === v) {
        v.ai = 'police';
        v.patrol = false;
        v.siren = true;
        v.navNode = null;
      }
    } else if (v.ai === 'police') {
      if (w.level === 0) {
        // Lost you: lights off, back to patrolling the lanes from the nearest junction.
        v.siren = false;
        v.ai = 'traffic';
        v.patrol = true;
        const node = game.city.nearestNode(v.x, v.z);
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        const step = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];
        const k1 = Math.max(0, Math.min(N, node.k + step[0]));
        const l1 = Math.max(0, Math.min(N, node.l + step[1]));
        v.route = k1 === node.k && l1 === node.l ? [node.k, node.l, node.k === 0 ? 1 : node.k - 1, node.l] : [node.k, node.l, k1, l1];
        v.next = [v.route[2], v.route[3], v.route[0], v.route[1]];
        v.cruise = 9;
        v.honk = 0;
      } else drivePolice(game, v, dt);
      if (far < 50 && w.level > 0) seen = true;
    }
  }
  game.patrolTimer = (game.patrolTimer ?? 0) - dt;
  if (w.level === 0 && patrols < PATROLS && game.patrolTimer <= 0 && game.mode === 'play') {
    spawnPatrol(game);
    game.patrolTimer = 2;
  }
  for (let n = game.chars.length - 1; n >= 0; n -= 1) {
    const c = game.chars[n];
    if (c.kind !== 'cop' || c.vehicle) continue;
    const far = Math.hypot(c.x - p.x, c.z - p.z);
    if (!c.alive) {
      if (far > 120 || c.deadTime > 40) removeCharacter(game, c);
      continue;
    }
    if (w.level === 0 && far > 100) {
      removeCharacter(game, c);
      continue;
    }
    copOnFoot(game, c, dt);
    if (c.los && w.level > 0) seen = true;
  }
  // Air 1's searchlight on the player is as good as a cop's eyes.
  if (game.heli && game.heli.spotting) seen = true;
  if (w.level > 0) {
    w.seen = seen;
    if (seen) {
      w.unseen = 0;
      w.lastX = p.x;
      w.lastZ = p.z;
    } else {
      w.unseen += dt;
      if (w.unseen > escapeAfter(w.level) && w.level > w.floor) {
        clearWanted(game);
        if (game.onWantedLost) game.onWantedLost();
      }
    }
    if (units < POLICE_UNITS[w.level] && cruisers < 9 && w.dispatch <= 0) {
      spawnPoliceUnit(game);
      w.dispatch = 3.5 - w.level * 0.4;
    }
    if (w.level !== 1) w.bust = Math.max(0, w.bust - dt);
    else w.bust = Math.max(0, w.bust - dt * 0.3);
    if (w.bust > 1.6 && game.onBusted) game.onBusted();
  }
}
