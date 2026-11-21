// The city's meshes, built once from citymap.js's data: sky dome and its environment light, sun,
// sea, beach, road surface (one painted canvas texture), sidewalks and lawns, palms and street
// lamps as instanced meshes, the pier with its big wheel, the harbour cranes and a ship. The
// buildings come from buildings.js and the street furniture from streetprops.js.
import * as THREE from 'three';
import { GRID, WORLD, PALETTE } from './config.js';
import { canvasTexture, geometryBatch, mergeGeometries } from './batch.js';
import { buildBuildings } from './buildings.js';
import { buildStreetProps } from './streetprops.js';

const C = GRID.cell;
const HALF_ROAD = GRID.road / 2;
const CITY_END = GRID.blocks * C;
const TEX_X0 = -HALF_ROAD - 4;
const TEX_SIZE = CITY_END + GRID.road + 8;

// ---------------------------------------------------------------- textures

/** The whole road surface: asphalt, centre lines and crosswalks, painted once. */
function roadTexture(rng) {
  const px = 2048;
  const s = px / TEX_SIZE;
  return canvasTexture(px, px, (g) => {
    g.fillStyle = PALETTE.asphalt;
    g.fillRect(0, 0, px, px);
    for (let n = 0; n < 26000; n += 1) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect(rng.next() * px, rng.next() * px, 2, 2);
    }
    const X = (x) => (x - TEX_X0) * s;
    for (let k = 0; k <= GRID.blocks; k += 1) {
      const line = k * C;
      for (let l = 0; l < GRID.blocks; l += 1) {
        const a = l * C + 10;
        const b = (l + 1) * C - 10;
        g.fillStyle = '#f2c230';
        for (let t = a; t < b; t += 6) {
          g.fillRect(X(line) - 0.14 * s, X(t), 0.28 * s, 3 * s);
          g.fillRect(X(t), X(line) - 0.14 * s, 3 * s, 0.28 * s);
        }
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(X(line - HALF_ROAD + 0.5), X(a), 0.18 * s, (b - a) * s);
        g.fillRect(X(line + HALF_ROAD - 0.7), X(a), 0.18 * s, (b - a) * s);
        g.fillRect(X(a), X(line - HALF_ROAD + 0.5), (b - a) * s, 0.18 * s);
        g.fillRect(X(a), X(line + HALF_ROAD - 0.7), (b - a) * s, 0.18 * s);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k <= GRID.blocks; k += 1) {
      for (let l = 0; l <= GRID.blocks; l += 1) {
        const cx = k * C;
        const cz = l * C;
        for (let w = -HALF_ROAD + 1; w < HALF_ROAD - 1; w += 1.4) {
          for (const off of [-9.5, 7.5]) {
            g.fillRect(X(cx + w), X(cz + off), 0.7 * s, 2 * s);
            g.fillRect(X(cx + off), X(cz + w), 2 * s, 0.7 * s);
          }
        }
      }
    }
  }, false);
}

// ---------------------------------------------------------------- pieces

/** The sun hangs low over the ocean in the west: long shadows and a golden sky. */
const SUN_DIR = new THREE.Vector3(-0.92, 0.13, 0.22).normalize();

/** A soft round glow (white centre fading out), for pools of light on the ground. */
function glowTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      mid: { value: new THREE.Color(PALETTE.skyMid) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        // Sunset bands: yellow at the horizon, orange above it, rose-violet only high overhead.
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.22, 0.95, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.55, 0.2) * pow(s, 4.0) * 0.75 + vec3(1.0, 0.85, 0.45) * pow(s, 60.0) * 1.3 + vec3(1.0, 0.95, 0.75) * pow(s, 900.0) * 8.0;
        if (vDir.y < 0.0) c = mix(c, vec3(0.75, 0.38, 0.2), clamp(-vDir.y * 5.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function makeSky(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMaterial());
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

/**
 * The sky baked into a prefiltered environment map: every standard material then picks up its
 * reflections (glossy paint, the glass towers, the sea) and a soft fill from the whole sky.
 */
function makeEnvironment(scene, renderer) {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.02, 0.1, 100);
  pmrem.dispose();
  scene.environment = target.texture;
  scene.environmentIntensity = 0.55;
}

function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffb98a, 0x5c3f63, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -95;
  cam.right = 95;
  cam.top = 95;
  cam.bottom = -95;
  cam.near = 1;
  cam.far = 420;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun, offset: SUN_DIR.clone().multiplyScalar(220) };
}

function makeGround(scene, rng) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.12, metalness: 0.35 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.7;
  water.receiveShadow = true;
  scene.add(water);

  const flat = (w, d, x, z, y, color, rough = 0.95) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // Grass beyond the city to the north and east, sand along the west, concrete quay to the south.
  flat(1400, 700, 560, -340, -0.06, 0x7aa65a);
  flat(700, 1400, 950, 300, -0.06, 0x7aa65a);
  flat(66, 760, -38, 300, 0.0, PALETTE.sand);
  flat(14, 760, -74, 300, -0.35, 0xe8cf9b);
  flat(700, 42, 300, 619, 0.0, 0xb9b4aa);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(TEX_SIZE, TEX_SIZE),
    new THREE.MeshStandardMaterial({ map: roadTexture(rng), roughness: 0.9 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(TEX_X0 + TEX_SIZE / 2, 0.02, TEX_X0 + TEX_SIZE / 2);
  road.receiveShadow = true;
  scene.add(road);
  return water;
}

function makeBlocks(scene, city) {
  const walk = geometryBatch();
  const lawn = geometryBatch();
  for (const b of city.blocks) {
    walk.box(b.x0, 0, b.z0, b.x1, 0.2, b.z1, PALETTE.sidewalk, [2, 2]);
    // A darker kerb stone round every block.
    walk.box(b.x0 - 0.05, 0, b.z0 - 0.05, b.x1 + 0.05, 0.16, b.z0 + 0.3, 0x9d978c, [2, 2]);
    walk.box(b.x0 - 0.05, 0, b.z1 - 0.3, b.x1 + 0.05, 0.16, b.z1 + 0.05, 0x9d978c, [2, 2]);
    walk.box(b.x0 - 0.05, 0, b.z0, b.x0 + 0.3, 0.16, b.z1, 0x9d978c, [2, 2]);
    walk.box(b.x1 - 0.3, 0, b.z0, b.x1 + 0.05, 0.16, b.z1, 0x9d978c, [2, 2]);
    const green = b.park || b.district === 'heights' || b.district === 'beach';
    if (green) lawn.box(b.x0 + 3, 0.2, b.z0 + 3, b.x1 - 3, 0.26, b.z1 - 3, b.park ? 0x7cc05a : PALETTE.grass, [2, 2]);
  }
  const tiles = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#cfc8bd';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 64, 64);
  });
  const walkMesh = new THREE.Mesh(walk.build(), new THREE.MeshStandardMaterial({ map: tiles, vertexColors: true, roughness: 0.9 }));
  walkMesh.receiveShadow = true;
  scene.add(walkMesh);
  const lawnMesh = new THREE.Mesh(lawn.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  lawnMesh.receiveShadow = true;
  scene.add(lawnMesh);
}

function makePalms(scene, city, rng) {
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 7.5, 7);
  trunkGeo.translate(0, 3.75, 0);
  const leaves = [];
  for (let n = 0; n < 8; n += 1) {
    const leaf = new THREE.BoxGeometry(0.7, 0.06, 3.4);
    leaf.translate(0, 0, 1.7);
    leaf.rotateX(0.38);
    leaf.rotateY((n / 8) * Math.PI * 2);
    leaves.push(leaf);
  }
  const crownGeo = mergeGeometries(leaves);
  crownGeo.translate(0, 7.5, 0);
  const count = city.palms.length;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8b6a4a, roughness: 1 }), count);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.8, side: THREE.DoubleSide }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  city.palms.forEach((palm, n) => {
    const scale = rng.range(0.85, 1.3);
    e.set(rng.range(-0.08, 0.08), rng.range(0, Math.PI * 2), rng.range(-0.08, 0.08));
    q.setFromEuler(e);
    s.set(scale, scale, scale);
    p.set(palm.x, 0.2, palm.z);
    m.compose(p, q, s);
    trunks.setMatrixAt(n, m);
    crowns.setMatrixAt(n, m);
  });
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks, crowns);
}

function makeLamps(scene, city) {
  const pole = new THREE.CylinderGeometry(0.07, 0.1, 6, 6);
  pole.translate(0, 3, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.6);
  arm.translate(0, 5.9, 0.8);
  const poleGeo = mergeGeometries([pole, arm]);
  const headGeo = new THREE.BoxGeometry(0.35, 0.12, 0.6);
  headGeo.translate(0, 5.82, 1.5);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.5 }), city.lamps.length);
  // Lamps are on for the evening: a bright head and a warm pool of light on the street below.
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd590, emissiveIntensity: 4 }), city.lamps.length);
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb35c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), city.lamps.length);
  const m = new THREE.Matrix4();
  const pool = new THREE.Matrix4();
  const scale = new THREE.Matrix4().makeScale(9, 1, 9);
  city.lamps.forEach((lamp, n) => {
    m.makeRotationY(lamp.ry);
    m.setPosition(lamp.x, 0.2, lamp.z);
    poles.setMatrixAt(n, m);
    heads.setMatrixAt(n, m);
    pool.makeRotationY(lamp.ry).multiply(scale);
    pool.setPosition(lamp.x + Math.sin(lamp.ry) * 2, 0.24, lamp.z + Math.cos(lamp.ry) * 2);
    pools.setMatrixAt(n, pool);
  });
  poles.castShadow = true;
  pools.renderOrder = 2;
  scene.add(poles, heads, pools);
}

function makeBeach(scene, rng) {
  const count = 44;
  const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5);
  pole.translate(0, 1.2, 0);
  const canopy = new THREE.ConeGeometry(1.5, 0.6, 8);
  canopy.translate(0, 2.5, 0);
  const poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0xeeeeee }), count);
  const tops = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), count);
  const towelGeo = new THREE.BoxGeometry(1, 0.03, 1.9);
  const towels = new THREE.InstancedMesh(towelGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }), count);
  const m = new THREE.Matrix4();
  const colors = [0xff5a5f, 0xffb400, 0x00a699, 0x3f88ff, 0xff7eb6, 0xffffff];
  const c = new THREE.Color();
  for (let n = 0; n < count; n += 1) {
    const x = rng.range(-64, -50);
    const z = rng.range(10, 600);
    m.makeTranslation(x, 0, z);
    poles.setMatrixAt(n, m);
    tops.setMatrixAt(n, m);
    tops.setColorAt(n, c.setHex(rng.pick(colors)));
    m.makeTranslation(x + 1.2, 0.02, z + 0.4);
    towels.setMatrixAt(n, m);
    towels.setColorAt(n, c.setHex(rng.pick(colors)));
  }
  tops.castShadow = true;
  scene.add(poles, tops, towels);

  // A lifeguard tower.
  const tower = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xf3f0e6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe53935 });
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), wood);
    leg.position.set(x, 1.5, z);
    tower.add(leg);
  }
  const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), wood);
  hut.position.y = 4;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 3.6), red);
  roof.position.y = 5.2;
  tower.add(hut, roof);
  tower.position.set(-56, 0, 180);
  tower.traverse((o) => {
    o.castShadow = true;
  });
  scene.add(tower);
}

function makePier(scene) {
  const p = WORLD.pier;
  const wood = new THREE.MeshStandardMaterial({ color: 0xa47b55, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(p.x1 - p.x0 + 8, 0.5, p.z1 - p.z0), wood);
  deck.position.set((p.x0 + p.x1 - 8) / 2, -0.05, (p.z0 + p.z1) / 2);
  deck.receiveShadow = true;
  scene.add(deck);
  const rail = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (const z of [p.z0 + 0.1, p.z1 - 0.1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(p.x1 - p.x0, 0.1, 0.1), rail);
    r.position.set((p.x0 + p.x1) / 2, 1.1, z);
    scene.add(r);
  }
  for (let x = p.x0; x < p.x1; x += 6) {
    for (const z of [p.z0 + 0.5, p.z1 - 0.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.4), wood);
      post.position.set(x, -0.6, z);
      scene.add(post);
    }
  }

  // The Lucky Seven wheel: axis along x, so it faces the beach.
  const wheel = new THREE.Group();
  wheel.position.set(-130, 21, 300);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 });
  // The rims are strung with bulbs: lit for the evening.
  const bulbs = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffc86a, emissiveIntensity: 3 });
  for (const off of [-1.4, 1.4]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 0.35, 6, 48), bulbs);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = off;
    wheel.add(ring);
  }
  const cabinColors = [0xff5a5f, 0xffb400, 0x00a699, 0x3f88ff, 0xff7eb6, 0x9b5de5];
  const cabins = [];
  for (let n = 0; n < 16; n += 1) {
    const a = (n / 16) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, 36, 0.15), white);
    spoke.rotation.x = a;
    wheel.add(spoke);
    const color = cabinColors[n % cabinColors.length];
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 1.8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
    cabin.position.set(0, Math.cos(a) * 18, Math.sin(a) * 18);
    wheel.add(cabin);
    cabins.push(cabin);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.4, 12), white);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  wheel.traverse((o) => {
    o.castShadow = true;
  });
  scene.add(wheel);
  const legGeo = new THREE.BoxGeometry(0.8, 24, 0.8);
  for (const z of [-1, 1]) {
    for (const x of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, white);
      leg.position.set(-130 + x * 3, 10.5, 300 + z * 6);
      leg.rotation.x = z * 0.32;
      leg.castShadow = true;
      scene.add(leg);
    }
  }
  return { wheel, cabins };
}

function makeHarbour(scene, city) {
  const orange = new THREE.MeshStandardMaterial({ color: 0xf0a030, roughness: 0.6 });
  for (const crane of city.cranes) {
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 60), orange);
    boom.position.set(crane.x, 27, crane.z + 18);
    const top = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 4), orange);
    top.position.set(crane.x, 25, crane.z);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    cab.position.set(crane.x, 24.5, crane.z + 4);
    for (const o of [boom, top, cab]) {
      o.castShadow = true;
      scene.add(o);
    }
  }
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(150, 12, 24), new THREE.MeshStandardMaterial({ color: 0x1f3a5f, roughness: 0.6 }));
  hull.position.y = 3;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(150.2, 1.2, 24.2), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
  stripe.position.y = -1.8;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 20), new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }));
  bridge.position.set(60, 15, 0);
  ship.add(hull, stripe, bridge);
  const rng = [0xc0392b, 0x2e86de, 0xf39c12, 0x27ae60, 0x8e44ad];
  for (let n = 0; n < 18; n += 1) {
    const cont = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 6), new THREE.MeshStandardMaterial({ color: rng[n % rng.length] }));
    cont.position.set(-60 + (n % 9) * 13, 10.3 + Math.floor(n / 9) * 2.6, (n % 3) * 6.5 - 6.5);
    ship.add(cont);
  }
  ship.position.set(300, 0, 668);
  ship.traverse((o) => {
    o.castShadow = true;
  });
  scene.add(ship);
}

function makeHills(scene, rng) {
  const material = new THREE.MeshStandardMaterial({ color: 0x6d8f4e, roughness: 1, flatShading: true });
  const spots = [];
  for (let n = 0; n < 9; n += 1) spots.push([rng.range(-100, 700), rng.range(-420, -220)]);
  for (let n = 0; n < 7; n += 1) spots.push([rng.range(780, 1000), rng.range(-200, 600)]);
  for (const [x, z] of spots) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rng.range(90, 170), rng.range(40, 110), 7), material);
    hill.position.set(x, 0, z);
    scene.add(hill);
  }
}

/** Builds every static mesh of the city into `scene`; returns the parts that move. */
export function buildCityscape(scene, city, rng, renderer) {
  scene.fog = new THREE.Fog(PALETTE.fog, 160, 720);
  const sky = makeSky(scene);
  makeEnvironment(scene, renderer);
  const lights = makeLights(scene);
  const water = makeGround(scene, rng);
  makeBlocks(scene, city);
  buildBuildings(scene, city, rng);
  buildStreetProps(scene, city, rng);
  makePalms(scene, city, rng);
  makeLamps(scene, city);
  makeBeach(scene, rng);
  const pier = makePier(scene);
  makeHarbour(scene, city);
  makeHills(scene, rng);
  return { sky, lights, water, pier, time: 0 };
}

/** Moves what moves on its own: the wheel turning, the sea's shimmer, the sun's shadow box following `focus`. */
export function updateCityscape(cs, dt, focus, camera) {
  cs.time += dt;
  cs.pier.wheel.rotation.x += dt * 0.08;
  for (const cabin of cs.pier.cabins) cabin.rotation.x = -cs.pier.wheel.rotation.x;
  cs.water.material.color.setHSL(0.55, 0.85, 0.2 + Math.sin(cs.time * 0.6) * 0.008);
  cs.sky.position.copy(camera.position);
  const sun = cs.lights.sun;
  sun.target.position.set(focus.x, 0, focus.z);
  sun.position.set(focus.x + cs.lights.offset.x, cs.lights.offset.y, focus.z + cs.lights.offset.z);
}
