// Weapons: hitscan shots against people, cars and walls (with spread, pellets, headshots and
// tracers), punches, and who gets blamed. Both the player and NPCs fire through fireWeapon.
import { WEAPONS } from './config.js';
import { raySolids, rayCapsule, rayCar } from './physics.js';
import { damageCharacter } from './characters.js';
import { damageVehicle } from './vehicles.js';
import { burst, tracer, flashAt, FX } from './effects.js';
import { rayHelicopter, damageHelicopter } from './helicopter.js';

/** What a ray meets first within `range`: { t, char, vehicle } (both null for a wall or nothing). */
export function hitscan(game, o, d, range, ignore) {
  let best = { t: raySolids(o, d, range, game.city), char: null, vehicle: null };
  const consider = (c) => {
    if (c === ignore || !c.alive || c.vehicle) return;
    if (Math.abs(c.x - o.x) > range + 2 || Math.abs(c.z - o.z) > range + 2) return;
    const t = rayCapsule(o, d, c.x, c.z, c.y, c.y + 1.95, 0.36);
    if (t < best.t) best = { t, char: c, vehicle: null };
  };
  consider(game.player);
  for (const c of game.chars) consider(c);
  for (const v of game.vehicles) {
    if (ignore && ignore.vehicle === v) continue;
    if (Math.abs(v.x - o.x) > range + 4 || Math.abs(v.z - o.z) > range + 4) continue;
    const t = rayCar(o, d, v.x, v.z, v.yaw, v.spec.wid / 2, v.spec.hgt, v.spec.len / 2);
    if (t < best.t) best = { t, char: null, vehicle: v };
  }
  // Only the player's bullets can reach Air 1.
  const th = ignore === game.player ? rayHelicopter(game.heli, o, d, range) : Infinity;
  if (th < best.t) best = { t: th, char: null, vehicle: null, heli: true };
  return best;
}

/** The muzzle of `c`'s weapon: right hand, chest high, a little forward. */
export function muzzleOf(c) {
  const fx = Math.sin(c.yaw);
  const fz = Math.cos(c.yaw);
  if (c.vehicle) return { x: c.vehicle.x - fz * 0.2, y: 1.5, z: c.vehicle.z + fx * 0.2 };
  return { x: c.x + fx * 0.55 - fz * 0.3, y: c.y + 1.45, z: c.z + fz * 0.55 + fx * 0.3 };
}

function blameCrime(game, shooter, victim, killed) {
  if (shooter !== game.player || !game.crime) return;
  if (victim.kind === 'cop') game.crime(killed ? 'copKill' : 'copAssault', victim);
  else if (victim.kind !== 'gang' && victim.kind !== 'target') game.crime(killed ? 'murder' : 'assault', victim);
  else if (killed) game.crime('gunfire', victim);
}

/**
 * Fires `shooter`'s current weapon toward the point `aim` ({x, y, z}). `accuracy` scales the spread
 * (1 normal, larger misses more). Returns whether a shot went off.
 */
export function fireWeapon(game, shooter, aim, accuracy = 1) {
  const w = WEAPONS[shooter.weapon];
  if (!w || w.melee) return false;
  const o = muzzleOf(shooter);
  let dx = aim.x - o.x;
  let dy = aim.y - o.y;
  let dz = aim.z - o.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  for (let n = 0; n < w.pellets; n += 1) {
    const s = w.spread * accuracy;
    const d = { x: dx + (Math.random() - 0.5) * 2 * s, y: dy + (Math.random() - 0.5) * 2 * s, z: dz + (Math.random() - 0.5) * 2 * s };
    const l = Math.hypot(d.x, d.y, d.z);
    d.x /= l;
    d.y /= l;
    d.z /= l;
    const hit = hitscan(game, o, d, w.range, shooter);
    const t = Math.min(hit.t, w.range);
    const end = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    if (n < 3) tracer(game.fx, o, end);
    if (hit.heli) {
      damageHelicopter(game, game.heli, w.damage, shooter);
    } else if (hit.char) {
      const head = end.y - hit.char.y > 1.6;
      // NPC fire is softened against the player: gunfights are meant to be won, not survived by luck.
      const scale = hit.char === game.player && shooter !== game.player ? 0.42 : head ? 2.5 : 1;
      const killed = damageCharacter(game, hit.char, w.damage * scale, shooter, end);
      blameCrime(game, shooter, hit.char, killed);
    } else if (hit.vehicle) {
      damageVehicle(game, hit.vehicle, w.damage * 1.6, shooter);
      burst(game.fx, FX.spark, end.x, end.y, end.z, 4, 3);
      if (shooter === game.player && hit.vehicle.spec.police && game.crime) game.crime('copAssault', hit.vehicle);
    } else if (hit.t !== Infinity) {
      burst(game.fx, FX.dust, end.x, end.y, end.z, 3, 1.5);
      burst(game.fx, FX.spark, end.x, end.y, end.z, 2, 2);
    }
  }
  flashAt(game.fx, o.x, o.y, o.z, 30);
  burst(game.fx, FX.spark, o.x, o.y, o.z, 2, 1.5);
  if (game.audio) game.audio.gunshot(w.id, o.x, o.z, shooter === game.player);
  if (game.panic) game.panic(o.x, o.z, 38, shooter);
  if (shooter === game.player && game.crime) game.crime('gunfire', shooter);
  return true;
}

/** A punch at whoever stands just in front of `attacker`. */
export function punch(game, attacker) {
  attacker.punch = 0.3;
  const w = WEAPONS.fists;
  const fx = Math.sin(attacker.yaw);
  const fz = Math.cos(attacker.yaw);
  const targets = [game.player, ...game.chars];
  let best = null;
  let bestD = w.range;
  for (const c of targets) {
    if (c === attacker || !c.alive || c.vehicle) continue;
    const dx = c.x - attacker.x;
    const dz = c.z - attacker.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.01) continue;
    if ((dx * fx + dz * fz) / d < 0.5) continue;
    best = c;
    bestD = d;
  }
  if (game.audio) game.audio.punch(attacker.x, attacker.z, Boolean(best));
  if (!best) return false;
  best.x += fx * 0.5;
  best.z += fz * 0.5;
  const killed = damageCharacter(game, best, w.damage, attacker, { x: best.x, y: 1.5, z: best.z });
  blameCrime(game, attacker, best, killed);
  return true;
}
