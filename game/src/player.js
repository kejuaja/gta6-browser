// The player: walking, sprinting and jumping relative to the camera, aiming over the shoulder,
// shooting and punching, switching and reloading weapons, and getting into cars (pulling the
// driver out when there is one) and driving them.
import { createCharacter, moveCharacter, damageCharacter } from './characters.js';
import { LOOKS } from './models.js';
import { PLAYER, WEAPONS, WEAPON_ORDER } from './config.js';
import { driveVehicle, exitPoint, nearestVehicle } from './vehicles.js';
import { fireWeapon, punch, hitscan } from './combat.js';
import { aimRay } from './camera.js';

export function createPlayer(game, x, z, yaw) {
  const p = createCharacter(game, 'player', x, z, LOOKS.player, { health: PLAYER.health, yaw });
  p.radius = PLAYER.radius;
  p.money = 0;
  p.ammo = { fists: { mag: 0, reserve: 0 } };
  p.reload = 0;
  p.sprint = 1;
  return p;
}

export function giveWeapon(p, id, rounds) {
  const w = WEAPONS[id];
  if (!p.ammo[id]) p.ammo[id] = { mag: Math.min(w.mag, rounds), reserve: Math.max(0, rounds - w.mag) };
  else p.ammo[id].reserve += rounds;
}

export function selectWeapon(p, id) {
  if (!p.ammo[id]) return;
  p.weapon = id;
  p.reload = 0;
  p.mesh.gun.visible = id !== 'fists';
}

function cycleWeapon(p, dir) {
  const owned = WEAPON_ORDER.filter((id) => p.ammo[id]);
  const i = owned.indexOf(p.weapon);
  selectWeapon(p, owned[(i + dir + owned.length) % owned.length]);
}

/** Where the crosshair points in the world: the first thing the camera's centre ray meets. */
export function crosshairPoint(game) {
  const { o, d } = aimRay(game.rig);
  const hit = hitscan(game, o, d, 160, game.player);
  const t = Math.min(hit.t, 160);
  return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t, d };
}

function tryShoot(game, p, input, dt) {
  const w = WEAPONS[p.weapon];
  p.fireCooldown -= dt;
  if (p.reload > 0) {
    p.reload -= dt;
    if (p.reload <= 0) {
      const a = p.ammo[p.weapon];
      const take = Math.min(w.mag - a.mag, a.reserve);
      a.mag += take;
      a.reserve -= take;
    }
    return;
  }
  const trigger = w.auto ? input.mouse.left : input.mouse.leftPressed;
  if (!trigger || p.fireCooldown > 0) return;
  if (w.melee) {
    if (p.vehicle) return;
    punch(game, p);
    p.fireCooldown = w.rate;
    return;
  }
  const a = p.ammo[p.weapon];
  if (a.mag <= 0) {
    if (a.reserve > 0) p.reload = 1.1;
    else if (game.audio) game.audio.click();
    p.fireCooldown = 0.3;
    return;
  }
  const aim = crosshairPoint(game);
  p.yaw = Math.atan2(aim.d.x, aim.d.z);
  fireWeapon(game, p, aim, p.aiming ? 0.6 : 1);
  a.mag -= 1;
  p.fireCooldown = w.rate;
  p.shotTimer = 0.6;
  if (a.mag === 0 && a.reserve > 0) p.reload = 1.1;
}

function enterVehicle(game, p, v) {
  if (v.driver && v.driver !== p) {
    const d = v.driver;
    const spot = exitPoint(game, v);
    d.vehicle = null;
    d.x = spot.x;
    d.z = spot.z;
    d.mesh.root.visible = true;
    d.state = d.kind === 'cop' ? 'engage' : 'flee';
    // Runs from where the carjacker stands (a flee with no point to run from has no direction).
    d.fleeX = p.x;
    d.fleeZ = p.z;
    d.timer = 8;
    if (game.crime) game.crime('carjack', v);
    if (game.stats) game.stats.carsStolen += 1;
  } else if (!v.stolen && !v.mission) {
    // Breaking into a parked car: a crime only if a cop is watching (police.js decides).
    if (game.crime) game.crime('theft', v);
    if (game.stats) game.stats.carsStolen += 1;
  }
  v.stolen = true;
  v.driver = p;
  v.ai = null;
  v.siren = false;
  p.vehicle = v;
  p.aiming = false;
  p.mesh.root.visible = false;
  if (game.onEnterVehicle) game.onEnterVehicle(v);
}

function leaveVehicle(game, p) {
  const v = p.vehicle;
  const spot = exitPoint(game, v);
  v.driver = null;
  v.ai = 'parked';
  p.vehicle = null;
  p.x = spot.x;
  p.z = spot.z;
  p.yaw = v.yaw;
  p.mesh.root.visible = true;
  if (game.onExitVehicle) game.onExitVehicle(v);
}

/** One fixed step of the player's own control. */
export function updatePlayer(game, dt, input) {
  const p = game.player;
  if (!p.alive) return;
  if (input.pressed('Digit1')) selectWeapon(p, 'fists');
  if (input.pressed('Digit2')) selectWeapon(p, 'pistol');
  if (input.pressed('Digit3')) selectWeapon(p, 'smg');
  if (input.pressed('Digit4')) selectWeapon(p, 'shotgun');
  if (input.mouse.wheel !== 0) cycleWeapon(p, input.mouse.wheel > 0 ? 1 : -1);
  if (input.pressed('KeyR') && p.weapon !== 'fists') {
    const a = p.ammo[p.weapon];
    if (a.mag < WEAPONS[p.weapon].mag && a.reserve > 0) p.reload = 1.1;
  }
  const enter = input.pressed('KeyF') || input.pressed('Enter');

  if (p.vehicle) {
    const v = p.vehicle;
    const ctl = {
      throttle: input.down('KeyW') || input.down('ArrowUp') ? 1 : 0,
      brake: input.down('KeyS') || input.down('ArrowDown') ? 1 : 0,
      steer: (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) - (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0),
      handbrake: input.down('Space'),
    };
    driveVehicle(game, v, ctl, dt);
    p.x = v.x;
    p.z = v.z;
    if (input.pressed('KeyH') && game.audio) game.audio.horn(v.x, v.z);
    if (p.weapon !== 'fists') tryShoot(game, p, input, dt);
    // F always gets you out: above ~36 km/h you tumble out and it hurts; the empty car rolls on.
    if (enter) {
      const speed = Math.abs(v.fwd);
      leaveVehicle(game, p);
      if (speed > 10) {
        p.knock = 0.9;
        damageCharacter(game, p, (speed - 10) * 1.5, null);
      }
    }
    return;
  }

  const ax = input.axes();
  p.walkingForward = ax.y > 0;
  const yaw = game.rig.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let dx = fx * ax.y - fz * ax.x;
  let dz = fz * ax.y + fx * ax.x;
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }
  p.aiming = input.mouse.right && p.weapon !== 'fists';
  const sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
  let speed = p.aiming ? PLAYER.walk : sprinting ? PLAYER.run : 4.2;
  if (p.knock > 0) speed = 0;
  if (input.pressed('Space') && p.y === 0) p.vy = PLAYER.jump;
  p.shotTimer = Math.max(0, (p.shotTimer ?? 0) - dt);
  const face = p.aiming || p.shotTimer > 0 ? yaw : null;
  if (p.aiming) {
    const d = aimRay(game.rig).d;
    p.aimPitch = -Math.asin(Math.max(-1, Math.min(1, d.y)));
  } else p.aimPitch = 0;
  moveCharacter(game, p, dx, dz, len > 0 ? speed : 0, dt, face);
  if (p.shotTimer > 0 && !p.aiming) p.aiming = p.weapon !== 'fists';
  tryShoot(game, p, input, dt);

  if (enter) {
    const v = nearestVehicle(game, p.x, p.z, 2.6);
    if (v && !(v.driver && v.driver.kind === 'target' && v.mission && v.mission.locked)) enterVehicle(game, p, v);
  }
}

export { enterVehicle, leaveVehicle };
