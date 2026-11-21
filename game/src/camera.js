// The third-person camera: orbits the player with the mouse, swings in over the shoulder to aim,
// pulls back and settles behind a car when driving, never passes through a wall, and shakes on
// blasts. `camYaw` is the direction the camera looks along the ground.
import * as THREE from 'three';
import { raySolids, angleDiff } from './physics.js';

export function createCameraRig(camera) {
  return {
    camera,
    yaw: 0,
    pitch: 0.28,
    dist: 5.5,
    idle: 0,
    focus: new THREE.Vector3(),
    sensitivity: 0.0024,
  };
}

/** The ray the crosshair looks along: from the camera through the screen's centre. */
export function aimRay(rig) {
  const d = new THREE.Vector3();
  rig.camera.getWorldDirection(d);
  return { o: rig.camera.position.clone(), d };
}

export function updateCamera(rig, game, dt, mouse) {
  const p = game.player;
  const car = p.vehicle;
  const aiming = !car && p.aiming;
  if (mouse.dx !== 0 || mouse.dy !== 0) rig.idle = 0;
  else rig.idle += dt;
  rig.yaw -= mouse.dx * rig.sensitivity;
  rig.pitch = Math.max(-0.35, Math.min(1.15, rig.pitch + mouse.dy * rig.sensitivity));

  let target;
  let wantDist;
  let height;
  if (car) {
    target = new THREE.Vector3(car.x, 1.4, car.z);
    wantDist = 8.5 + Math.min(4, Math.abs(car.fwd) * 0.08);
    height = 1.2;
    // Behind the car once the mouse has rested: looking where the car goes (or back when reversing).
    if (rig.idle > 1.2 && Math.abs(car.fwd) > 2) {
      const behind = car.fwd > 0 ? car.yaw : car.yaw + Math.PI;
      rig.yaw += angleDiff(rig.yaw, behind) * Math.min(1, dt * 2.2);
      rig.pitch += (0.2 - rig.pitch) * Math.min(1, dt * 1.5);
    }
  } else {
    target = new THREE.Vector3(p.x, p.y + 1.55, p.z);
    wantDist = aiming ? 2.6 : 5.2;
    height = 0.3;
    // Follow mode: walking forward with the mouse at rest swings the camera in behind the player.
    if (rig.autoFollow && !aiming && rig.idle > 0.5 && p.walkingForward && p.moveSpeed > 1) {
      rig.yaw += angleDiff(rig.yaw, p.yaw) * Math.min(1, dt * 1.4);
    }
  }
  rig.dist += (wantDist - rig.dist) * Math.min(1, dt * (aiming ? 12 : 4));
  rig.focus.lerp(target, rig.focus.lengthSq() === 0 ? 1 : Math.min(1, dt * (car ? 9 : 14)));

  const cp = Math.cos(rig.pitch);
  const back = new THREE.Vector3(-Math.sin(rig.yaw) * cp, Math.sin(rig.pitch), -Math.cos(rig.yaw) * cp);
  const pivot = rig.focus.clone();
  pivot.y += height * 0.5;
  if (aiming) {
    // Over the right shoulder.
    pivot.x += -Math.cos(rig.yaw) * 0.75;
    pivot.z += Math.sin(rig.yaw) * 0.75;
  }
  let dist = rig.dist;
  const hit = raySolids({ x: pivot.x, y: pivot.y, z: pivot.z }, { x: back.x, y: back.y, z: back.z }, dist, game.city);
  if (hit < dist) dist = Math.max(1.2, hit - 0.4);
  const pos = pivot.clone().addScaledVector(back, dist);
  pos.y = Math.max(0.6, pos.y);
  if (game.fx.shake > 0) {
    const s = game.fx.shake * 0.35;
    pos.x += (Math.random() - 0.5) * s;
    pos.y += (Math.random() - 0.5) * s;
    pos.z += (Math.random() - 0.5) * s;
  }
  rig.camera.position.copy(pos);
  const look = pivot.clone();
  look.y += aiming ? 0.05 : 0.25;
  rig.camera.lookAt(look);
  const fov = car ? 62 + Math.min(14, Math.abs(car.fwd) * 0.4) : aiming ? 52 : 62;
  if (Math.abs(rig.camera.fov - fov) > 0.05) {
    rig.camera.fov += (fov - rig.camera.fov) * Math.min(1, dt * 5);
    rig.camera.updateProjectionMatrix();
  }
}

/** Puts the camera behind `yaw` at once (after a respawn or a staged shot). */
export function snapCamera(rig, game, yaw, pitch = 0.25) {
  rig.yaw = yaw;
  rig.pitch = pitch;
  rig.focus.set(0, 0, 0);
  updateCamera(rig, game, 1, { dx: 0, dy: 0 });
}
