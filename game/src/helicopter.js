// The police helicopter, Air 1: it comes in at three stars, circles over the player and sweeps a
// searchlight across the streets. While the beam is on the player the police always know where
// they are, so the only ways out are to outrun it, break its line of sight under buildings, or
// shoot it down. From four stars a marksman in the open door fires at whoever the beam holds.
import * as THREE from 'three';
import { mat, box } from './models.js';
import { lineOfSight } from './physics.js';
import { fireWeapon } from './combat.js';
import { explosion, burst, FX } from './effects.js';

const CRUISE_HEIGHT = 30;
const ORBIT_RADIUS = 20;
const SPOT_RADIUS = 5.5;
const HEALTH = 900;

/** The helicopter's body, built from boxes: cabin, glass nose, tail boom, fin, skids and rotors. */
function makeHeliMesh() {
  const root = new THREE.Group();
  const white = mat(0xf2f2f2, { metal: 0.4, rough: 0.35 });
  const navy = mat(0x13244f, { metal: 0.4, rough: 0.4 });
  const glass = mat(0x1a2a3a, { metal: 0.9, rough: 0.08 });
  const dark = mat(0x202020, { rough: 0.6 });
  const add = (geo, material, x, y, z, parent = root) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  add(box(1.9, 1.6, 3.4), white, 0, 0, 0);
  add(box(1.92, 0.42, 3.42), navy, 0, -0.35, 0);
  add(box(1.6, 1.1, 1.2), glass, 0, 0.1, 1.9);
  add(box(0.4, 0.4, 4.6), white, 0, 0.25, -3.9);
  add(box(0.14, 1.4, 0.9), navy, 0, 0.8, -6.0);
  add(box(1.6, 0.1, 0.5), navy, 0, 0.3, -5.7);
  for (const sx of [-1, 1]) {
    add(box(0.12, 0.12, 3.6), dark, sx * 0.95, -1.25, 0.1);
    add(box(0.08, 0.5, 0.08), dark, sx * 0.9, -1.0, 0.9);
    add(box(0.08, 0.5, 0.08), dark, sx * 0.9, -1.0, -0.8);
  }
  add(box(0.5, 0.35, 0.5), dark, 0, 0.95, 0);
  // The searchlight's housing under the nose; its lens glows while the beam is on.
  const lens = add(box(0.42, 0.42, 0.3), mat(0xfff6d8, { emissive: 0xfff0c0, glow: 3 }), 0, -0.95, 1.5);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.2, 0);
  root.add(rotor);
  add(box(10, 0.05, 0.32), dark, 0, 0, 0, rotor);
  add(box(0.32, 0.05, 10), dark, 0, 0, 0, rotor);
  const tail = new THREE.Group();
  tail.position.set(0.15, 0.8, -6.0);
  root.add(tail);
  add(box(0.05, 1.7, 0.18), dark, 0, 0, 0, tail);
  const red = add(box(0.18, 0.18, 0.18), mat(0xff2030, { emissive: 0xff0000, glow: 4 }), -1.0, 0.2, -0.3);
  const blue = add(box(0.18, 0.18, 0.18), mat(0x2050ff, { emissive: 0x0040ff, glow: 4 }), 1.0, 0.2, -0.3);
  return { root, rotor, tail, lens, red, blue };
}

/** A soft ring for the searchlight's spot on the ground: a bright edge round a clear middle, so whatever it lights stays readable. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,236,190,0.12)');
  grad.addColorStop(0.62, 'rgba(255,232,180,0.3)');
  grad.addColorStop(0.84, 'rgba(255,226,170,1)');
  grad.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Builds Air 1 once (hidden) with its beam, ground pool and spotlight, so no light is ever added mid-game. */
export function createHelicopter(scene) {
  const mesh = makeHeliMesh();
  mesh.root.visible = false;
  scene.add(mesh.root);
  const coneGeo = new THREE.ConeGeometry(1, 1, 28, 1, true);
  coneGeo.translate(0, -0.5, 0);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffd9a8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  const light = new THREE.SpotLight(0xfff2d0, 0, 140, 0.2, 0.55, 1.1);
  light.castShadow = false;
  cone.visible = pool.visible = false;
  cone.renderOrder = pool.renderOrder = 5;
  scene.add(cone, pool, light, light.target);
  return {
    mesh, cone, pool, light,
    active: false, leaving: false, down: false,
    x: 0, y: CRUISE_HEIGHT, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0,
    orbit: 0, spot: { x: 0, z: 0 }, spotting: false, losTimer: 0, los: false,
    fireTimer: 2, health: HEALTH, cooldown: 0,
  };
}

/** Sends the helicopter away at once and hides it (a new game, the title screen). */
export function resetHelicopter(heli) {
  heli.active = false;
  heli.leaving = false;
  heli.down = false;
  heli.spotting = false;
  heli.mesh.root.visible = heli.cone.visible = heli.pool.visible = false;
  heli.light.intensity = 0;
}

function spawn(game, heli) {
  const p = game.player;
  const a = game.rng.range(0, Math.PI * 2);
  heli.x = p.x + Math.cos(a) * 200;
  heli.z = p.z + Math.sin(a) * 200;
  heli.y = 55;
  heli.vx = heli.vz = heli.vy = 0;
  heli.active = true;
  heli.leaving = false;
  heli.down = false;
  heli.health = HEALTH;
  heli.spot.x = p.x;
  heli.spot.z = p.z;
  heli.orbit = a;
  heli.mesh.root.visible = true;
  if (game.hud) game.hud.notify('Air 1 is up: a police helicopter is tracking you. Outrun its searchlight or shoot it down.');
}

/** Damage from a bullet; enough of it brings Air 1 down in a spiral of smoke. */
export function damageHelicopter(game, heli, amount, attacker) {
  if (!heli.active || heli.down) return;
  heli.health -= amount;
  burst(game.fx, FX.spark, heli.x, heli.y, heli.z, 4, 3);
  if (heli.health <= 0) {
    heli.down = true;
    heli.spotting = false;
    heli.cooldown = 45;
    if (attacker === game.player) {
      if (game.crime) game.crime('copKill', heli);
      if (game.onHeliDown) game.onHeliDown();
    }
  }
}

/** Whether the ray from `o` along unit `d` hits the helicopter within `range`; the distance or Infinity. */
export function rayHelicopter(heli, o, d, range) {
  if (!heli || !heli.active || heli.down) return Infinity;
  const ox = heli.x - o.x;
  const oy = heli.y - o.y;
  const oz = heli.z - o.z;
  const t = ox * d.x + oy * d.y + oz * d.z;
  if (t < 0 || t > range) return Infinity;
  const miss = ox * ox + oy * oy + oz * oz - t * t;
  return miss < 2.6 * 2.6 ? t : Infinity;
}

/** One step: arrive, circle the player, sweep the beam, shoot, leave once the stars drop, or fall. */
export function updateHelicopter(game, dt) {
  const heli = game.heli;
  const w = game.wanted;
  const p = game.player;
  const want = game.mode !== 'title' && w.level >= 3;
  heli.cooldown -= dt;
  if (want && !heli.active && heli.cooldown <= 0) spawn(game, heli);
  if (!heli.active) return;
  if (!want && !heli.down) heli.leaving = true;
  const px = p.vehicle ? p.vehicle.x : p.x;
  const pz = p.vehicle ? p.vehicle.z : p.z;
  const pvx = p.vehicle ? p.vehicle.vx : 0;
  const pvz = p.vehicle ? p.vehicle.vz : 0;

  if (heli.down) {
    // Spinning down with smoke, then a fireball where it lands.
    heli.vy -= 9 * dt;
    heli.y += heli.vy * dt;
    heli.x += heli.vx * dt;
    heli.z += heli.vz * dt;
    heli.yaw += dt * 4;
    if (Math.random() < 0.5) burst(game.fx, FX.smoke, heli.x, heli.y, heli.z, 1, 0.6, 1);
    if (heli.y <= 1) {
      explosion(game.fx, heli.x, 1, heli.z);
      if (game.audio) game.audio.explosion(heli.x, heli.z);
      resetHelicopter(heli);
      return;
    }
  } else {
    let tx;
    let tz;
    let ty = CRUISE_HEIGHT + (w.level >= 5 ? -4 : 0);
    if (heli.leaving) {
      const dx = heli.x - px || 1;
      const dz = heli.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      tx = heli.x + (dx / d) * 60;
      tz = heli.z + (dz / d) * 60;
      ty = 70;
      if (d > 260) {
        resetHelicopter(heli);
        return;
      }
    } else {
      heli.orbit += dt * 0.3;
      tx = px + Math.cos(heli.orbit) * ORBIT_RADIUS + pvx * 1.2;
      tz = pz + Math.sin(heli.orbit) * ORBIT_RADIUS + pvz * 1.2;
    }
    const top = w.level >= 5 ? 31 : 26;
    let dvx = (tx - heli.x) * 0.9;
    let dvz = (tz - heli.z) * 0.9;
    const dl = Math.hypot(dvx, dvz);
    if (dl > top) {
      dvx *= top / dl;
      dvz *= top / dl;
    }
    const k = Math.min(1, dt * 1.4);
    heli.vx += (dvx - heli.vx) * k;
    heli.vz += (dvz - heli.vz) * k;
    heli.x += heli.vx * dt;
    heli.z += heli.vz * dt;
    heli.y += (ty - heli.y) * Math.min(1, dt * 0.8);
    const speed = Math.hypot(heli.vx, heli.vz);
    const face = speed > 4 ? Math.atan2(heli.vx, heli.vz) : Math.atan2(px - heli.x, pz - heli.z);
    let turn = face - heli.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    heli.yaw += turn * Math.min(1, dt * 2);
  }

  // The beam: locked on while it holds the player in view, otherwise sweeping where they were last seen.
  const hx = heli.x;
  const hz = heli.z;
  heli.losTimer -= dt;
  const horiz = Math.hypot(px - hx, pz - hz);
  if (heli.losTimer <= 0) {
    heli.los = !heli.down && !heli.leaving && horiz < 60 && lineOfSight({ x: hx, y: heli.y - 1.5, z: hz }, { x: px, y: 1.2, z: pz }, game.city);
    heli.losTimer = 0.2;
  }
  const onTarget = Math.hypot(heli.spot.x - px, heli.spot.z - pz) < SPOT_RADIUS + 2;
  let ax;
  let az;
  if (heli.los && (heli.spotting || onTarget)) {
    ax = px + pvx * 0.25;
    az = pz + pvz * 0.25;
  } else {
    const t = game.time;
    ax = w.lastX + Math.cos(t * 0.9) * 14;
    az = w.lastZ + Math.sin(t * 1.3) * 14;
  }
  const sweep = 24 * dt;
  const sdx = ax - heli.spot.x;
  const sdz = az - heli.spot.z;
  const sd = Math.hypot(sdx, sdz);
  if (sd > sweep) {
    heli.spot.x += (sdx / sd) * sweep;
    heli.spot.z += (sdz / sd) * sweep;
  } else {
    heli.spot.x = ax;
    heli.spot.z = az;
  }
  heli.spotting = heli.los && Math.hypot(heli.spot.x - px, heli.spot.z - pz) < SPOT_RADIUS;

  // The marksman: four stars and up, only at a target in the beam.
  heli.fireTimer -= dt;
  if (heli.spotting && w.level >= 4 && heli.fireTimer <= 0 && p.alive) {
    const shooter = { weapon: 'smg', kind: 'cop', x: hx, y: heli.y - 2.6, z: hz, yaw: heli.yaw, vehicle: null, alive: true };
    fireWeapon(game, shooter, { x: px, y: p.vehicle ? 1 : p.y + 1.2, z: pz }, 5);
    heli.fireTimer = w.level >= 5 ? 0.9 : 1.6;
  }
}

/** Per-frame looks: the body, the rotors, the beam's cone, its pool of light and the spotlight. */
export function syncHelicopter(game, dt) {
  const heli = game.heli;
  if (!heli.active) return;
  const m = heli.mesh;
  m.root.position.set(heli.x, heli.y, heli.z);
  const speed = Math.hypot(heli.vx, heli.vz);
  m.root.rotation.set(Math.min(0.28, speed * 0.011), heli.yaw, 0, 'YXZ');
  m.rotor.rotation.y += dt * 38;
  m.tail.rotation.x += dt * 45;
  const phase = Math.floor(game.time * 3) % 2 === 0;
  m.red.visible = phase;
  m.blue.visible = !phase;
  const beam = !heli.down;
  heli.cone.visible = heli.pool.visible = beam;
  heli.light.intensity = beam ? 90 : 0;
  if (!beam) return;
  const fx = Math.sin(heli.yaw);
  const fz = Math.cos(heli.yaw);
  const o = new THREE.Vector3(heli.x + fx * 1.5, heli.y - 1.0, heli.z + fz * 1.5);
  const ground = new THREE.Vector3(heli.spot.x, 0.05, heli.spot.z);
  const dir = ground.clone().sub(o);
  const len = dir.length();
  dir.normalize();
  heli.cone.position.copy(o);
  heli.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  heli.cone.scale.set(SPOT_RADIUS * 0.85, len, SPOT_RADIUS * 0.85);
  heli.cone.material.opacity = heli.spotting ? 0.07 : 0.05;
  heli.pool.position.set(heli.spot.x, 0.08, heli.spot.z);
  heli.pool.scale.setScalar(SPOT_RADIUS * 1.1);
  heli.light.position.copy(o);
  heli.light.target.position.copy(ground);
  heli.light.angle = Math.atan2(SPOT_RADIUS, len) * 1.15;
}
