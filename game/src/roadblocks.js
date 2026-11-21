// Roadblocks: from four stars the police close the road ahead of a fleeing player. Two cruisers
// are parked nose to nose across both lanes, lights flashing, with striped barriers and cones,
// and their crews wait on foot behind them, guns out. Ram through the gap, turn off, or fight.
import * as THREE from 'three';
import { GRID } from './config.js';
import { mat, box } from './models.js';
import { createVehicle, removeVehicle } from './vehicles.js';
import { makeCop } from './police.js';
import { removeCharacter } from './characters.js';

const C = GRID.cell;
const N = GRID.blocks;
const AHEAD_MIN = 55;
const AHEAD_MAX = 150;

function barrier(scene, x, z, yaw) {
  const g = new THREE.Group();
  const red = mat(0xe8322a, { rough: 0.6 });
  const white = mat(0xf4f4f4, { rough: 0.6 });
  const legs = mat(0x333333, { rough: 0.8 });
  for (let n = 0; n < 4; n += 1) {
    const m = new THREE.Mesh(box(0.6, 0.28, 0.12), n % 2 ? red : white);
    m.position.set(-0.9 + n * 0.6, 0.95, 0);
    m.castShadow = true;
    g.add(m);
  }
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(box(0.08, 0.9, 0.5), legs);
    leg.position.set(sx * 1, 0.45, 0);
    g.add(leg);
  }
  const lamp = new THREE.Mesh(box(0.16, 0.16, 0.16), mat(0xffa020, { emissive: 0xff8a00, glow: 3 }));
  lamp.position.set(0, 1.2, 0);
  g.add(lamp);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  return g;
}

let coneGeo = null;
function cone(scene, x, z) {
  coneGeo = coneGeo ?? new THREE.ConeGeometry(0.22, 0.7, 10);
  const m = new THREE.Mesh(coneGeo, mat(0xff6a00, { rough: 0.5 }));
  m.position.set(x, 0.35, z);
  m.castShadow = true;
  scene.add(m);
  return m;
}

/**
 * Where the road ahead of the player can be closed: the middle of the first road segment
 * AHEAD_MIN-AHEAD_MAX metres along their heading, on the road they are driving. Null if none.
 */
export function roadAhead(game) {
  const p = game.player;
  const v = p.vehicle;
  if (!v || Math.abs(v.fwd) < 7) return null;
  const alongX = Math.abs(v.vx) > Math.abs(v.vz);
  const dir = Math.sign(alongX ? v.vx : v.vz);
  const across = alongX ? v.z : v.x;
  const line = Math.round(across / C) * C;
  if (Math.abs(across - line) > GRID.road / 2 + 1 || line < 0 || line > N * C) return null;
  const pos = alongX ? v.x : v.z;
  for (let seg = 0; seg < N; seg += 1) {
    const mid = (seg + 0.5) * C;
    const ahead = (mid - pos) * dir;
    if (ahead < AHEAD_MIN || ahead > AHEAD_MAX) continue;
    return alongX ? { x: mid, z: line, alongX, dir } : { x: line, z: mid, alongX, dir };
  }
  return null;
}

/** Closes the road at `at` (from roadAhead): two cruisers, barriers, cones and four cops. */
export function placeRoadblock(game, at) {
  const scene = game.three.scene;
  // Travel direction (unit) and the direction across the road.
  const tx = at.alongX ? at.dir : 0;
  const tz = at.alongX ? 0 : at.dir;
  const cx = -tz;
  const cz = tx;
  const across = Math.atan2(cx, cz);
  const rb = { x: at.x, z: at.z, cars: [], cops: [], props: [], warned: false };
  for (const side of [-1, 1]) {
    const x = at.x + cx * side * 3.1;
    const z = at.z + cz * side * 3.1;
    const model = side > 0 && game.wanted.level >= 4 ? 'ptruck' : side > 0 && game.wanted.level >= 3 ? 'psuv' : 'cruiser';
    const v = createVehicle(game, model, x, z, across + side * 0.32);
    v.ai = 'parked';
    v.siren = true;
    v.deployed = true;
    v.roadblock = rb;
    v.crew = [];
    for (let n = 0; n < 2; n += 1) {
      const off = side * (1.6 + n * 2.4);
      const c = makeCop(game, at.x + cx * off + tx * 3.2, at.z + cz * off + tz * 3.2, Math.atan2(-tx, -tz));
      c.weapon = n === 0 ? 'shotgun' : 'pistol';
      c.post = true;
      v.crew.push(c);
      rb.cops.push(c);
    }
    rb.cars.push(v);
  }
  for (const side of [-1, 1]) {
    rb.props.push(barrier(scene, at.x + cx * side * 6.4 - tx * 1.5, at.z + cz * side * 6.4 - tz * 1.5, across + Math.PI / 2));
    rb.props.push(cone(scene, at.x + cx * side * 1.2 - tx * 3, at.z + cz * side * 1.2 - tz * 3));
    rb.props.push(cone(scene, at.x + cx * side * 4.6 - tx * 3.4, at.z + cz * side * 4.6 - tz * 3.4));
  }
  game.roadblocks.push(rb);
  return rb;
}

function clearRoadblock(game, rb, all) {
  for (const p of rb.props) game.three.scene.remove(p);
  rb.props.length = 0;
  if (!all) return;
  for (const c of rb.cops) removeCharacter(game, c);
  for (const v of rb.cars) if (v !== game.player.vehicle && game.vehicles.includes(v)) removeVehicle(game, v);
}

/** Removes every roadblock (a new game, a respawn). */
export function clearRoadblocks(game) {
  for (const rb of game.roadblocks ?? []) clearRoadblock(game, rb, true);
  game.roadblocks = [];
  game.roadblockTimer = 6;
}

/** One step: set up a roadblock ahead every so often at four stars and up; clear the old ones. */
export function updateRoadblocks(game, dt) {
  const w = game.wanted;
  const p = game.player;
  game.roadblocks = game.roadblocks ?? [];
  for (let n = game.roadblocks.length - 1; n >= 0; n -= 1) {
    const rb = game.roadblocks[n];
    const d = Math.hypot(rb.x - p.x, rb.z - p.z);
    const gone = rb.cars.every((v) => !game.vehicles.includes(v));
    if (gone || d > 230 || (w.level === 0 && d > 90)) {
      clearRoadblock(game, rb, d > 90);
      game.roadblocks.splice(n, 1);
    } else if (!rb.warned && d < 110) {
      rb.warned = true;
      if (game.hud) game.hud.notify('ROADBLOCK AHEAD! Ram the gap between the cruisers or take another street.');
    }
  }
  game.roadblockTimer = (game.roadblockTimer ?? 6) - dt;
  if (w.level < 4 || game.roadblockTimer > 0 || game.roadblocks.length > 0 || game.mode !== 'play') return;
  const at = roadAhead(game);
  game.roadblockTimer = at ? (w.level >= 5 ? 12 : 18) : 1;
  if (at) placeRoadblock(game, at);
}
