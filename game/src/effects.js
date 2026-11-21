// Short-lived visual effects: particles (sparks, smoke, fire, blood, debris) in one instanced
// mesh, bullet tracers, a pooled flash light for muzzle flashes and explosions, and the glowing
// beacons that mark mission targets.
import * as THREE from 'three';

const MAX_PARTICLES = 500;
const MAX_TRACERS = 24;

export const FX = {
  spark: { color: 0xffd27a, size: 0.12, life: 0.35, gravity: -14, drag: 1, grow: 0, glow: true },
  smoke: { color: 0x555555, size: 0.9, life: 2.2, gravity: 2.2, drag: 1.2, grow: 1.6 },
  whiteSmoke: { color: 0xdddddd, size: 0.7, life: 1.4, gravity: 1.2, drag: 1.5, grow: 1.4 },
  fire: { color: 0xff7a1a, size: 0.8, life: 0.6, gravity: 4, drag: 1, grow: -0.6, glow: true },
  blood: { color: 0x8a0f0f, size: 0.12, life: 0.6, gravity: -12, drag: 0.5, grow: 0 },
  debris: { color: 0x2a2a2a, size: 0.22, life: 1.4, gravity: -16, drag: 0.3, grow: 0 },
  dust: { color: 0xcfc3ad, size: 0.16, life: 0.5, gravity: 0.5, drag: 2, grow: 0.8 },
  cash: { color: 0x5fd35f, size: 0.2, life: 1, gravity: -6, drag: 0.6, grow: 0, glow: true },
};

export function createEffects(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, material, MAX_PARTICLES);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  // Made now, not on the first burst, so the shader is compiled with per-instance colour from the start.
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.count = 0;
  scene.add(mesh);
  const particles = [];
  for (let n = 0; n < MAX_PARTICLES; n += 1) particles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, kind: FX.spark, size: 1, spin: 0 });

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.85 });
  const tracers = [];
  for (let n = 0; n < MAX_TRACERS; n += 1) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const line = new THREE.Line(g, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  const flash = new THREE.PointLight(0xffb060, 0, 14, 2);
  scene.add(flash);

  const beaconGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  const arrowGeo = new THREE.ConeGeometry(0.6, 1.2, 4);
  const beacons = [];

  return { scene, mesh, particles, next: 0, tracers, nextTracer: 0, flash, flashLife: 0, beaconGeo, arrowGeo, beacons, shake: 0, dummy: new THREE.Object3D(), color: new THREE.Color() };
}

/** Throws `count` particles of `kind` from (x, y, z), spread by `speed`. */
export function burst(fx, kind, x, y, z, count, speed = 3, up = 0) {
  for (let n = 0; n < count; n += 1) {
    const p = fx.particles[fx.next];
    fx.next = (fx.next + 1) % fx.particles.length;
    p.alive = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = (Math.random() - 0.5) * 2 * speed;
    p.vy = (Math.random() - 0.2) * speed + up;
    p.vz = (Math.random() - 0.5) * 2 * speed;
    p.max = kind.life * (0.6 + Math.random() * 0.6);
    p.life = p.max;
    p.size = kind.size * (0.7 + Math.random() * 0.6);
    p.spin = Math.random() * 6;
  }
}

export function tracer(fx, a, b) {
  const t = fx.tracers[fx.nextTracer];
  fx.nextTracer = (fx.nextTracer + 1) % fx.tracers.length;
  const arr = t.line.geometry.attributes.position.array;
  arr[0] = a.x;
  arr[1] = a.y;
  arr[2] = a.z;
  arr[3] = b.x;
  arr[4] = b.y;
  arr[5] = b.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.visible = true;
  t.life = 0.05;
}

export function flashAt(fx, x, y, z, intensity, color = 0xffb060, life = 0.06) {
  fx.flash.position.set(x, y, z);
  fx.flash.color.setHex(color);
  fx.flash.intensity = intensity;
  fx.flash.distance = intensity > 60 ? 40 : 14;
  fx.flashLife = life;
}

export function explosion(fx, x, y, z) {
  burst(fx, FX.fire, x, y + 0.8, z, 40, 6, 3);
  burst(fx, FX.smoke, x, y + 1, z, 30, 3, 3);
  burst(fx, FX.debris, x, y + 1, z, 24, 9, 6);
  burst(fx, FX.spark, x, y + 1, z, 30, 10, 4);
  flashAt(fx, x, y + 2, z, 400, 0xff8a30, 0.35);
  fx.shake = Math.max(fx.shake, 1);
}

/** A tall glowing ring at (x, z) that marks a place to go. Returns it so the caller can move or drop it. */
export function addBeacon(fx, x, z, color = 0xffd23f, radius = 2.2) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(fx.beaconGeo, material);
  mesh.scale.set(radius, 4, radius);
  mesh.position.set(x, 2, z);
  const arrow = new THREE.Mesh(fx.arrowGeo, new THREE.MeshBasicMaterial({ color }));
  arrow.rotation.x = Math.PI;
  arrow.position.set(x, 6, z);
  fx.scene.add(mesh, arrow);
  const beacon = { mesh, arrow, x, z, t: Math.random() * 6 };
  fx.beacons.push(beacon);
  return beacon;
}

export function removeBeacon(fx, beacon) {
  if (!beacon) return;
  fx.scene.remove(beacon.mesh, beacon.arrow);
  beacon.mesh.material.dispose();
  beacon.arrow.material.dispose();
  const i = fx.beacons.indexOf(beacon);
  if (i >= 0) fx.beacons.splice(i, 1);
}

export function moveBeacon(beacon, x, z) {
  beacon.x = x;
  beacon.z = z;
  beacon.mesh.position.x = beacon.arrow.position.x = x;
  beacon.mesh.position.z = beacon.arrow.position.z = z;
}

export function updateEffects(fx, dt) {
  let count = 0;
  const d = fx.dummy;
  for (const p of fx.particles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      continue;
    }
    const k = p.kind;
    p.vy += k.gravity * dt;
    const drag = Math.exp(-k.drag * dt);
    p.vx *= drag;
    p.vz *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.05) {
      p.y = 0.05;
      p.vy *= -0.3;
      p.vx *= 0.6;
      p.vz *= 0.6;
    }
    const age = 1 - p.life / p.max;
    const size = Math.max(0.02, p.size * (1 + k.grow * age));
    d.position.set(p.x, p.y, p.z);
    d.rotation.set(p.spin * age, p.spin, 0);
    d.scale.setScalar(size);
    d.updateMatrix();
    fx.mesh.setMatrixAt(count, d.matrix);
    fx.color.setHex(k.color);
    if (k === FX.fire) fx.color.lerp(new THREE.Color(0x401000), age);
    if (!k.glow) fx.color.multiplyScalar(1 - age * 0.3);
    fx.mesh.setColorAt(count, fx.color);
    count += 1;
  }
  fx.mesh.count = count;
  fx.mesh.instanceMatrix.needsUpdate = true;
  if (fx.mesh.instanceColor) fx.mesh.instanceColor.needsUpdate = true;
  for (const t of fx.tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) t.line.visible = false;
  }
  if (fx.flashLife > 0) {
    fx.flashLife -= dt;
    if (fx.flashLife <= 0) fx.flash.intensity = 0;
    else fx.flash.intensity *= 0.85;
  }
  for (const b of fx.beacons) {
    b.t += dt;
    b.arrow.position.y = 6 + Math.sin(b.t * 3) * 0.4;
    b.arrow.rotation.y += dt * 2;
    b.mesh.material.opacity = 0.28 + Math.sin(b.t * 4) * 0.08;
  }
  fx.shake = Math.max(0, fx.shake - dt * 2.5);
}
