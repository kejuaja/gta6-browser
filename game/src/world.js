// The game object and its fixed-step update: builds the city, the renderer's scene and every
// system once; wires the systems' hooks (crimes, panic, kills, cars entered); starts a new game
// or a saved one; steps everything in order; and handles dying, getting busted and respawning.
import * as THREE from 'three';
import { DENSITY } from './config.js';
import { createRng } from './rng.js';
import { buildCityMap } from './citymap.js';
import { buildCityscape, updateCityscape } from './cityscape.js';
import { createEffects, updateEffects, removeBeacon } from './effects.js';
import { createCameraRig, updateCamera, snapCamera } from './camera.js';
import { createPlayer, updatePlayer, giveWeapon, selectWeapon } from './player.js';
import { animateCharacter, separateCharacters, updateFooting, removeCharacter } from './characters.js';
import { updateVehicle, collideVehicles, removeVehicle } from './vehicles.js';
import { createCrowd, updateCrowd, populateCrowd, panic, pedHurt } from './crowd.js';
import { updateTraffic, populateTraffic, scareTraffic, parkCar } from './traffic.js';
import { createWanted, reportCrime, updatePolice, clearWanted } from './police.js';
import { createHelicopter, updateHelicopter, syncHelicopter, resetHelicopter } from './helicopter.js';
import { updateHostiles, hostileHurt } from './hostiles.js';
import { createStory, updateStory, failMission } from './missions.js';
import { createPickups, updatePickups, dropCash } from './pickups.js';
import { createShop, updateShop } from './shop.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame as storeSave, loadSettings } from './save.js';

const CITY_SEED = 2026;
const LOOK_SEED = 77;
/** On the sand, off every road: the title screen orbits the beach, the pier and the city behind. */
export const TITLE_FOCUS = { x: -30, z: 320 };

function freshStats() {
  return { kills: 0, copKills: 0, carsStolen: 0, maxWanted: 0, missions: 0, deaths: 0, busts: 0 };
}

export function createGame(canvas, uiRoot, seed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 2600);
  const city = buildCityMap(createRng(CITY_SEED));
  const cs = buildCityscape(scene, city, createRng(LOOK_SEED), renderer);
  const settings = loadSettings();
  const game = {
    three: { scene, camera, renderer },
    rng: createRng(seed),
    city,
    cs,
    fx: createEffects(scene),
    chars: [],
    vehicles: [],
    pickups: [],
    time: 0,
    clock: 17 * 60 + 20,
    mode: 'title',
    stats: freshStats(),
    progress: { tokens: [] },
    wanted: createWanted(),
    story: createStory(0),
    crowd: createCrowd(city),
    settings,
    deathTimer: 0,
    input: null,
    lastCar: null,
  };
  game.heli = createHelicopter(scene);
  game.rig = createCameraRig(camera);
  game.rig.sensitivity = 0.0024 * settings.sensitivity;
  game.hud = createHud(uiRoot, city);
  game.audio = createAudio(settings);
  game.player = createPlayer(game, TITLE_FOCUS.x, TITLE_FOCUS.z, 0);
  wireHooks(game);
  return game;
}

function wireHooks(game) {
  game.crime = (kind, at) => reportCrime(game, kind, at);
  game.panic = (x, z, radius, source) => {
    panic(game, x, z, radius, source);
    scareTraffic(game, x, z, radius);
  };
  game.onHurt = (c, attacker) => {
    if (c === game.player) {
      game.hud.root.classList.remove('hurt');
      void game.hud.root.offsetWidth;
      game.hud.root.classList.add('hurt');
      return;
    }
    if (c.kind === 'ped') pedHurt(game, c, attacker);
    else if (c.kind === 'gang' || c.kind === 'target') hostileHurt(game, c);
  };
  game.onKill = (c, attacker) => {
    if (c === game.player) return;
    if (attacker === game.player) {
      game.stats.kills += 1;
      if (c.kind === 'cop') game.stats.copKills += 1;
    }
    if (c.kind === 'gang' || c.kind === 'target') dropCash(game, c.x, c.z, 120);
    else if (c.kind === 'ped' && !c.vehicle && game.rng.chance(0.35)) dropCash(game, c.x, c.z, game.rng.int(10, 70));
  };
  game.onEnterVehicle = (v) => {
    game.lastCar = v;
    if (!game.radioChosen) game.audio.setRadio(true);
    game.hud.showCar(v.spec.name, game.audio.radioOn);
  };
  game.onWantedUp = (level) => {
    game.stats.maxWanted = Math.max(game.stats.maxWanted, level);
  };
  game.onWantedLost = () => game.hud.notify('You lost the cops.');
  game.onBusted = () => {
    if (game.mode === 'play' && game.player.alive) beginRespawn(game, 'busted');
  };
  game.onFinale = () => {
    game.finaleTimer = 9;
  };
  game.saveGame = (auto = false) => {
    if (storeSave(game)) game.hud.notify(auto ? 'Progress autosaved.' : 'Game saved at the safehouse.');
    else game.hud.notify('Could not save: this browser blocks storage.');
  };
}

/** Clears every person, car, pickup and mission marker, keeping the city. */
export function clearWorld(game) {
  if (game.story.active) failMission(game, '');
  removeBeacon(game.fx, game.story.beacon);
  game.story.beacon = null;
  for (const c of [...game.chars]) removeCharacter(game, c);
  for (const v of [...game.vehicles]) removeVehicle(game, v);
  for (const p of game.pickups) game.three.scene.remove(p.mesh);
  game.pickups = [];
  removeBeacon(game.fx, game.saveBeacon);
  removeBeacon(game.fx, game.paintBeacon);
  removeBeacon(game.fx, game.shopBeacon);
  clearWanted(game);
  resetHelicopter(game.heli);
  game.heli.cooldown = 0;
  game.hud.objective('');
  game.hud.clearLines();
}

function placePlayer(game, x, z, yaw) {
  const p = game.player;
  p.x = x;
  p.z = z;
  p.y = 0;
  p.vy = 0;
  p.yaw = yaw;
  p.vehicle = null;
  p.alive = true;
  p.health = p.maxHealth;
  p.knock = 0;
  p.mesh.root.visible = true;
  p.mesh.body.rotation.set(0, 0, 0);
  p.mesh.body.position.y = 0;
  snapCamera(game.rig, game, yaw);
}

/** Starts play: a fresh story, or the given save. */
export function startGame(game, save = null) {
  clearWorld(game);
  const p = game.player;
  game.story = createStory(save ? save.story : 0);
  game.stats = save ? { ...freshStats(), ...save.stats } : freshStats();
  game.progress = { tokens: save ? [...save.tokens] : [] };
  p.money = save ? save.money : 0;
  p.ammo = { fists: { mag: 0, reserve: 0 } };
  if (save) for (const [id, a] of Object.entries(save.ammo)) if (id !== 'fists') giveWeapon(p, id, a.mag + a.reserve);
  selectWeapon(p, save && p.ammo[save.weapon] ? save.weapon : 'fists');
  p.armor = save ? save.armor : 0;
  const at = save ? game.city.pois.safehouse : game.city.pois.spawn;
  placePlayer(game, at.x, at.z, at.yaw);
  if (save) p.health = save.health;
  createPickups(game);
  createShop(game);
  // Rides waiting at the kerb by the hospital and the safehouse.
  parkCar(game, 'sorrel', 226.2, 108, Math.PI, 0x2c5e8a);
  parkCar(game, 'kestrel', 226.2, 128, Math.PI, 0xff3b30);
  parkCar(game, 'tarpon', 470, 145.2, -Math.PI / 2, 0x1c1c1e);
  populateTraffic(game, DENSITY.traffic);
  populateCrowd(game, DENSITY.peds);
  game.mode = 'play';
  game.playStartedAt = game.time;
  game.deathTimer = 0;
  game.finaleTimer = 0;
  game.hud.setVisible(true);
  if (save) game.hud.notify('Welcome back to Palmera Bay.');
  else game.hud.notify('WASD to move, hold the right mouse button to look, F to get in a car. Esc pauses.');
}

/** Sets up the title screen's backdrop: traffic and people around the beach and the pier. */
export function startTitle(game) {
  clearWorld(game);
  game.mode = 'title';
  placePlayer(game, TITLE_FOCUS.x, TITLE_FOCUS.z, 0);
  // Nobody is playing yet: hidden, and not there for cars to stop for or people to bump.
  game.player.mesh.root.visible = false;
  game.player.alive = false;
  populateTraffic(game, DENSITY.traffic);
  populateCrowd(game, DENSITY.peds);
  game.hud.setVisible(false);
}

function beginRespawn(game, kind) {
  const p = game.player;
  game.mode = kind;
  game.deathTimer = 4;
  if (kind === 'dead') game.stats.deaths += 1;
  else game.stats.busts += 1;
  game.failedOnRespawn = Boolean(game.story.active);
  failMission(game, kind === 'dead' ? 'You were flatlined.' : 'You were busted.');
  // The fade says what happened; the mission's failure is shown once the player is back up.
  game.hud.clearMessages();
  game.audio.wasted();
  game.menus.fade(true, kind === 'dead' ? 'FLATLINED' : 'BUSTED', kind);
  if (kind === 'busted' && p.vehicle) {
    p.vehicle.driver = null;
    p.vehicle.ai = 'parked';
  }
}

function finishRespawn(game) {
  const kind = game.mode;
  const p = game.player;
  const at = kind === 'dead' ? game.city.pois.hospital : game.city.pois.police;
  const fee = Math.min(p.money, kind === 'dead' ? 250 : 400);
  p.money -= fee;
  for (const v of [...game.vehicles]) {
    if (v.spec.police) {
      for (const c of v.crew ?? []) removeCharacter(game, c);
      removeVehicle(game, v);
    }
  }
  for (const c of [...game.chars]) if (c.kind === 'cop' || c.kind === 'gang' || c.kind === 'target') removeCharacter(game, c);
  clearWanted(game);
  placePlayer(game, at.x, at.z, at.yaw);
  p.armor = 0;
  game.mode = 'play';
  game.menus.fade(false);
  if (game.failedOnRespawn) game.hud.banner('MISSION FAILED', 'failed', kind === 'dead' ? 'You were flatlined.' : 'You were busted.');
  game.hud.notify(kind === 'dead' ? `St. Marguerite patched you up. Bill: $${fee}.` : `Released on bail: $${fee}.`);
}

/**
 * Runs one system's step; an error in it is reported (once a second at most) and the rest of the
 * world still steps, so a fault in, say, the crowd never leaves the player's car or body frozen.
 */
function guarded(game, fn, dt) {
  try {
    fn(game, dt);
  } catch (err) {
    if (game.onError && game.time - (game.lastErrorAt ?? -9) > 1) {
      game.lastErrorAt = game.time;
      game.onError(err);
    }
  }
}

/** One fixed step of the whole world. */
export function stepGame(game, dt, input) {
  const p = game.player;
  const playing = game.mode === 'play';
  if (playing) guarded(game, (g, s) => updatePlayer(g, s, input), dt);
  guarded(game, updateTraffic, dt);
  if (game.mode !== 'title') {
    guarded(game, updateHelicopter, dt);
    guarded(game, updatePolice, dt);
    guarded(game, updateHostiles, dt);
  }
  guarded(game, updateCrowd, dt);
  for (const v of game.vehicles) updateVehicle(game, v, dt);
  collideVehicles(game);
  separateCharacters(game.chars.concat(p.vehicle ? [] : [p]));
  for (const c of game.chars) {
    if (c.vehicle) continue;
    updateFooting(game, c);
    animateCharacter(c, dt);
  }
  if (!p.vehicle) {
    updateFooting(game, p);
    animateCharacter(p, dt);
  }
  if (playing) {
    guarded(game, updateStory, dt);
    guarded(game, updatePickups, dt);
    guarded(game, updateShop, dt);
    if (!p.alive) beginRespawn(game, 'dead');
  }
  if (game.mode === 'dead' || game.mode === 'busted') {
    game.deathTimer -= dt;
    if (game.deathTimer <= 0) finishRespawn(game);
  }
  if (game.finaleTimer > 0) {
    game.finaleTimer -= dt;
    if (game.finaleTimer <= 0 && game.onCredits) game.onCredits();
  }
  updateEffects(game.fx, dt);
  game.time += dt;
  game.clock += dt;
}

/** Per-frame work after the steps: camera, the city's moving parts, HUD and sound. */
export function frameGame(game, dt, mouse) {
  const p = game.player;
  if (game.mode === 'title') {
    const t = game.time * 0.035;
    const cam = game.three.camera;
    cam.position.set(TITLE_FOCUS.x + 60 + Math.cos(t) * 150, 58 + Math.sin(t * 0.7) * 8, TITLE_FOCUS.z + Math.sin(t) * 150);
    cam.lookAt(TITLE_FOCUS.x + 40, 8, TITLE_FOCUS.z);
  } else updateCamera(game.rig, game, dt, game.mode === 'play' ? mouse : { dx: 0, dy: 0 });
  const focus = game.mode === 'title' ? { x: TITLE_FOCUS.x + 60, z: TITLE_FOCUS.z } : { x: p.x, z: p.z };
  updateCityscape(game.cs, dt, focus, game.three.camera);
  syncHelicopter(game, dt);
  if (game.mode !== 'title') game.hud.update(game, dt);
  game.audio.setListener(focus.x, focus.z);
  game.audio.update(game);
}
