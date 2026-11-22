// The screenshot scenes behind ?shot=roadblock|gunfight|streetrace|tuned (and the older heat, race,
// garage, citychase, chase, shootout, pursuit, beach and title). Each one starts a real game,
// sets up a moment of it with the game's own systems (a mission step, a stolen car, the wanted
// level, police units) and plays the real simulation forward for a few seconds with a scripted
// hand on the controls, so every frame is the game's own code rendering its own state.
import { STEP } from './config.js';
import { startGame, startTitle, stepGame, frameGame } from './world.js';
import { createVehicle, syncVehicle, damageVehicle } from './vehicles.js';
import { enterVehicle } from './player.js';
import { giveWeapon, selectWeapon } from './player.js';
import { spawnPoliceUnit, setWanted } from './police.js';
import { startMission, jumpToStep } from './missions.js';
import { fireWeapon } from './combat.js';
import { damageCharacter } from './characters.js';
import { snapCamera } from './camera.js';
import { spawnTrafficCar } from './traffic.js';
import { placeRoadblock } from './roadblocks.js';
import { RACES, startRace } from './races.js';
import { applyUpgrades, garageBay } from './garage.js';
import { addRespect } from './respect.js';
import { spawnPed, panic } from './crowd.js';

/** A stand-in for the keyboard and mouse: which keys are held, and mouse buttons. */
function scriptedInput(keys = [], mouse = {}) {
  const held = new Set(keys);
  return {
    mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0, ...mouse },
    down: (code) => held.has(code),
    pressed: () => false,
    axes: () => ({ x: (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0), y: (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0) }),
    clearPresses() {},
    clearMotion() {},
  };
}

function run(game, seconds, input, still = { dx: 0, dy: 0 }) {
  const steps = Math.round(seconds / STEP);
  for (let n = 0; n < steps; n += 1) {
    stepGame(game, STEP, input);
    if (n % 4 === 0) frameGame(game, STEP * 4, still);
  }
}

function settleCamera(game, yaw, pitch, frames = 30) {
  snapCamera(game.rig, game, yaw, pitch);
  for (let n = 0; n < frames; n += 1) {
    game.rig.yaw = yaw;
    game.rig.pitch = pitch;
    game.rig.idle = 0;
    frameGame(game, 1 / 30, { dx: 0, dy: 0 });
  }
}

function policeBehind(game, x, z, yaw, speed) {
  const v = spawnPoliceUnit(game, x, z);
  if (!v) return null;
  v.x = x;
  v.z = z;
  v.yaw = yaw;
  v.vx = Math.sin(yaw) * speed;
  v.vz = Math.cos(yaw) * speed;
  return v;
}

/** Cover: a three-star chase down the beach road, cruisers on the bumper, the pier's wheel behind. */
function chase(game) {
  startGame(game);
  game.player.money = 12850;
  giveWeapon(game.player, 'pistol', 60);
  giveWeapon(game.player, 'smg', 120);
  selectWeapon(game.player, 'smg');
  game.story.index = 3;
  startMission(game, 3);
  jumpToStep(game, 4);
  game.hud.clearLines();
  const yaw = 0;
  const car = createVehicle(game, 'kestrel', -3.4, 330, yaw, 0xff3b30);
  car.vz = 24;
  enterVehicle(game, game.player, car);
  setWanted(game, 3);
  game.player.armor = 60;
  game.player.health = 82;
  policeBehind(game, -3.0, 318, yaw, 26.5);
  policeBehind(game, -5.2, 308, yaw, 27);
  policeBehind(game, -2.2, 296, yaw, 26.5);
  // A car the chase already went through, burning in the other lane.
  const wreck = spawnTrafficCar(game, [0, 5, 0, 4], 0.75, 'sorrel');
  wreck.health = 0;
  wreck.burn = 6;
  wreck.vx = wreck.vz = 0;
  run(game, 1.5, scriptedInput(['KeyW']));
  game.hud.clearMessages();
  game.hud.say('Val', 'The whole Strip heard that. Now lose them, Nico!');
  // Looking back past the car at the cruisers on its tail, the sea and the pier beyond.
  settleCamera(game, car.yaw + Math.PI + 0.42, 0.2);
}

/** "Hot Pursuit": on the courier's tail between Downtown's towers. */
function pursuit(game) {
  startGame(game);
  game.player.money = 5940;
  giveWeapon(game.player, 'pistol', 40);
  selectWeapon(game.player, 'pistol');
  game.story.index = 4;
  startMission(game, 4);
  game.hud.clearLines();
  const courier = game.story.active.cars.courier;
  courier.x = 299.4;
  courier.z = 461;
  courier.vz = -19;
  const car = createVehicle(game, 'tarpon', 299.4, 474, Math.PI, 0x2e7d32);
  car.vz = -24;
  enterVehicle(game, game.player, car);
  run(game, 1.3, scriptedInput(['KeyW']));
  game.hud.clearMessages();
  game.hud.say('Dex', 'That black Kestrel is your man. Do not let him reach the highway!');
  settleCamera(game, car.yaw + 0.1, 0.22);
}

/** On foot on the Saltmarsh quay, SMG raised, Voss's enforcers going down under the cranes. */
function shootout(game) {
  startGame(game);
  game.player.money = 7420;
  giveWeapon(game.player, 'smg', 150);
  selectWeapon(game.player, 'smg');
  game.story.index = 3;
  startMission(game, 3);
  jumpToStep(game, 1);
  game.hud.clearLines();
  const p = game.player;
  p.x = 220;
  p.z = 603;
  p.yaw = 0.9;
  p.armor = 45;
  p.health = 64;
  setWanted(game, 2);
  for (const c of game.chars) if (c.group === 'enforcers') c.state = 'attack';
  run(game, 1.2, scriptedInput([], { right: true }));
  const targets = game.chars.filter((c) => c.group === 'enforcers' && c.alive);
  damageCharacter(game, targets[0], 999, p, { x: targets[0].x, y: 1.4, z: targets[0].z });
  damageCharacter(game, targets[1], 999, p, { x: targets[1].x, y: 1.4, z: targets[1].z });
  run(game, 0.6, scriptedInput([], { right: true }));
  const aimAt = targets[2];
  const yaw = Math.atan2(aimAt.x - p.x, aimAt.z - p.z);
  // Turn the camera onto the target and let the player's own aiming turn the body with it.
  game.rig.yaw = yaw + 0.05;
  game.rig.pitch = 0.06;
  run(game, 0.3, scriptedInput([], { right: true }));
  setWanted(game, 2);
  // In plain sight of the shootout: the stars burn steady instead of blinking.
  game.wanted.seen = true;
  game.hud.clearMessages();
  game.hud.say('Nico', 'Five is a small number.');
  settleCamera(game, yaw + 0.05, 0.06, 40);
  for (let n = 0; n < 3; n += 1) fireWeapon(game, p, { x: aimAt.x, y: 1.3, z: aimAt.z }, 0.5);
  for (const c of game.chars) if (c.group === 'enforcers' && c.alive && c !== aimAt) fireWeapon(game, c, { x: p.x, y: 1.3, z: p.z }, 6);
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
  game.hud.update(game, 0);
}

/** Cruising the beach road at golden hour, Palm FM on, the big wheel turning over the pier. */
function beach(game) {
  startGame(game);
  game.player.money = 2300;
  const car = createVehicle(game, 'kestrel', -3.4, 214, 0, 0xff6b9d);
  car.vz = 15;
  enterVehicle(game, game.player, car);
  game.hud.showCar();
  run(game, 1.4, scriptedInput(['KeyW']));
  settleCamera(game, -0.62, 0.12);
  game.hud.clearMessages();
  game.hud.say('Nico', "Lucia's. Same pink sign. Some things in this town don't change.");
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
}

function title(game, menus) {
  startTitle(game);
  run(game, 3, scriptedInput());
  game.time = 26;
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
  menus.showTitle(true);
}

/** Puts Air 1 at (x, y, z) with its beam on the player (it has to be up: three stars or more). */
function heliAt(game, x, y, z) {
  const h = game.heli;
  const p = game.player;
  h.x = x;
  h.y = y;
  h.z = z;
  h.vx = h.vz = 0;
  h.yaw = Math.atan2(p.x - x, p.z - z);
  h.spot.x = p.x;
  h.spot.z = p.z;
  h.spotting = true;
}

/** Cover: "Sunset Heat" at four stars, Voss's cash truck heading into a roadblock under Air 1's beam. */
function heat(game) {
  startGame(game);
  game.player.money = 18450;
  game.respect = 1180;
  giveWeapon(game.player, 'smg', 150);
  selectWeapon(game.player, 'smg');
  game.story.index = 7;
  startMission(game, 7);
  game.hud.clearLines();
  const truck = game.story.active.cars.truck;
  truck.x = 366.6;
  truck.z = 40;
  truck.yaw = 0;
  truck.vz = 22;
  enterVehicle(game, game.player, truck);
  run(game, 0.2, scriptedInput(['KeyW']));
  game.roadblockTimer = 99;
  policeBehind(game, 366.0, 30, 0, 24);
  policeBehind(game, 370.6, 20, 0, 24.5);
  game.player.armor = 70;
  game.player.health = 74;
  run(game, 1.0, scriptedInput(['KeyW']));
  placeRoadblock(game, { x: 370, z: truck.z + 24, alongX: false, dir: 1 });
  run(game, 0.15, scriptedInput(['KeyW']));
  game.story.active.timer = 41;
  heliAt(game, truck.x + 8, 25, truck.z + 64);
  game.wanted.seen = true;
  game.hud.clearMessages();
  game.hud.notify('ROADBLOCK AHEAD! Ram the gap between the cruisers or take another street.');
  addRespect(game, 12, '4-star heat');
  game.hud.say('Val', 'Air 1 has you in the light. Smash through that roadblock!');
  settleCamera(game, truck.yaw - 0.22, 0.17);
  heliAt(game, truck.x + 8, 25, truck.z + 64);
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
}

/** The Sunset Boulevard Run: four cars side by side on the beach road, the pier and its wheel ahead. */
function race(game) {
  startGame(game);
  game.player.money = 9300;
  game.respect = 420;
  game.story.index = 7;
  const def = RACES.find((r) => r.id === 'beach');
  const car = createVehicle(game, 'kestrel', def.start.x, def.start.z, 0, 0xff3b30);
  applyUpgrades(car, { engine: 3, armour: 0, tyres: 2 });
  enterVehicle(game, game.player, car);
  const r = startRace(game, def);
  r.countdown = 0;
  r.time = 21.4;
  const lanes = [[-3.4, 150, 30], [3.4, 155, 29], [-3.4, 164, 28.5], [3.6, 171, 28]];
  r.racers.forEach((racer, n) => {
    const [x, z, speed] = lanes[n];
    racer.car.x = x;
    racer.car.z = z;
    racer.car.yaw = 0;
    racer.car.vz = speed;
    racer.car.vx = 0;
  });
  run(game, 1.1, scriptedInput(['KeyW']));
  game.hud.clearMessages();
  game.hud.say('Rico', 'You drive like a tourist, Reyes! See you at the docks!');
  settleCamera(game, car.yaw + 0.5, 0.16);
}

/** Dex's Garage: a pink Kestrel in the bay with its scoop, wing, bull bar and gold rims, the menu open. */
function garage(game, menus) {
  startGame(game);
  game.player.money = 14250;
  game.respect = 610;
  game.story.index = 7;
  const bay = garageBay(game);
  const car = createVehicle(game, 'kestrel', bay.x, bay.z, -Math.PI / 2 + 0.25, 0xff6b9d);
  applyUpgrades(car, { engine: 3, armour: 2, tyres: 2 });
  enterVehicle(game, game.player, car);
  run(game, 0.5, scriptedInput());
  game.hud.clearMessages();
  addRespect(game, 15, 'Engine upgrade');
  game.hud.say('Dex', 'Race engine, slick tyres, plates on the doors. Rico is going to cry.');
  settleCamera(game, car.yaw + 2.2, 0.22);
  game.garageInside = true;
  game.garageBeacon.mesh.visible = game.garageBeacon.arrow.visible = false;
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
  game.mode = 'garage';
  menus.showGarage(game);
}

/** A three-star chase through Downtown's towers: the courier ahead, cruisers behind, Air 1 overhead. */
function citychase(game) {
  startGame(game);
  game.player.money = 6120;
  game.respect = 330;
  giveWeapon(game.player, 'pistol', 40);
  selectWeapon(game.player, 'pistol');
  game.story.index = 4;
  startMission(game, 4);
  game.hud.clearLines();
  const courier = game.story.active.cars.courier;
  courier.x = 299.4;
  courier.z = 446;
  courier.vz = -21;
  const car = createVehicle(game, 'tarpon', 299.4, 466, Math.PI, 0x2e7d32);
  applyUpgrades(car, { engine: 1, armour: 1, tyres: 1 });
  car.vz = -24;
  enterVehicle(game, game.player, car);
  setWanted(game, 3);
  run(game, 0.2, scriptedInput(['KeyW']));
  policeBehind(game, 296.2, 478, Math.PI, 25);
  policeBehind(game, 300.6, 488, Math.PI, 25);
  run(game, 1.1, scriptedInput(['KeyW']));
  heliAt(game, car.x + 8, 24, car.z + 40);
  game.wanted.seen = true;
  game.hud.clearMessages();
  game.hud.say('Dex', 'Cops and a chopper on you and the courier is getting away. Stay on him!');
  // Looking back past the car at the cruisers on its bumper and Air 1 above them.
  settleCamera(game, car.yaw + Math.PI - 0.35, 0.02);
  heliAt(game, car.x + 8, 24, car.z + 40);
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
}

/** A police unit of a set model (cruiser, psuv or ptruck), picked the way the wanted level picks it. */
function policeUnit(game, model, x, z, yaw, speed) {
  const roll = { ptruck: 0.1, psuv: 0.5, cruiser: 0.95 }[model];
  const next = game.rng.next;
  game.rng.next = () => roll;
  try {
    return policeBehind(game, x, z, yaw, speed);
  } finally {
    game.rng.next = next;
  }
}

/** Turns the settled camera to look at (x, y, z): the same viewpoint, framed lower or wider. */
function aimCamera(game, x, y, z) {
  game.three.camera.lookAt(x, y, z);
}

/** Puts the camera at `from` looking at `to` (each [x, y, z]) at field of view `fov`, after the last frame. */
function placeCamera(game, from, to, fov = 62) {
  const cam = game.three.camera;
  cam.position.set(...from);
  cam.fov = fov;
  cam.updateProjectionMatrix();
  cam.lookAt(...to);
}

/**
 * Cover: "Sunset Heat" at four stars on the beach road. Voss's cash truck runs south at a
 * roadblock (a cruiser and a Riot Truck, cones, barriers, cops with guns out), Interceptor SUVs
 * alongside, Air 1 overhead with its beam on the road; the pier and its wheel off to the left.
 */
function roadblock(game) {
  startGame(game);
  game.player.money = 24850;
  game.respect = 1310;
  giveWeapon(game.player, 'smg', 150);
  selectWeapon(game.player, 'smg');
  game.story.index = 7;
  startMission(game, 7);
  game.hud.clearLines();
  const truck = game.story.active.cars.truck;
  truck.x = -1.8;
  truck.z = 396;
  truck.yaw = Math.PI;
  truck.vx = 0;
  truck.vz = -20;
  enterVehicle(game, game.player, truck);
  run(game, 0.2, scriptedInput(['KeyW']));
  game.roadblockTimer = 99;
  const rb = placeRoadblock(game, { x: 0, z: truck.z - 37, alongX: false, dir: -1 });
  // Nico's SMG set the roadblock's cruiser alight as he came round the bend: it burns as the truck closes in.
  const cruiser = rb.cars.find((v) => v.model === 'cruiser');
  damageVehicle(game, cruiser, 9999, game.player);
  run(game, 1.0, scriptedInput(['KeyW']));
  game.player.armor = 72;
  game.player.health = 81;
  // The truck has been through the chase from Coral Heights: dented, not yet smoking.
  truck.health = 610;
  const flank = [policeUnit(game, 'psuv', truck.x + 4.4, truck.z + 2, Math.PI, 20), policeUnit(game, 'psuv', truck.x - 4.4, truck.z - 2, Math.PI, 20)];
  run(game, 0.3, scriptedInput(['KeyW']));
  // The Interceptors boxing the truck in, one on each side.
  const offsets = [[4.7, 0], [-4.5, -1.5]];
  flank.forEach((v, n) => {
    if (!v) return;
    v.x = truck.x + offsets[n][0];
    v.z = truck.z + offsets[n][1];
    v.yaw = Math.PI + (n ? 0.06 : -0.05);
    v.vx = truck.vx;
    v.vz = truck.vz;
    syncVehicle(v, 0, game.time);
  });
  game.story.active.timer = 41;
  heliAt(game, truck.x + 13, 17.5, truck.z - 42);
  game.heli.spot.x = truck.x + 0.5;
  game.heli.spot.z = truck.z - 15;
  game.wanted.seen = true;
  game.hud.clearMessages();
  game.hud.notify('ROADBLOCK AHEAD! Ram the gap between the cruisers or take another street.');
  addRespect(game, 12, '4-star heat');
  game.hud.say('Val', 'Air 1 has you in the light. Smash through that roadblock!');
  settleCamera(game, truck.yaw + 0.3, 0.14);
  // Air 1's beam on the truck itself.
  heliAt(game, truck.x + 13, 17.5, truck.z - 42);
  game.heli.spot.z = truck.z - 1.5;
  // The roadblock's crew still standing opens up on the truck.
  for (const c of rb.cops) if (c.alive) for (let n = 0; n < 2; n += 1) fireWeapon(game, c, { x: truck.x, y: 1.4, z: truck.z }, 1.5);
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
  // A little higher than the chase camera, to see the roadblock over the truck's cab.
  game.three.camera.position.y += 1.3;
  aimCamera(game, truck.x - 2, 2.2, truck.z - 16);
}

/**
 * On foot at four stars: Nico, SMG up, trading fire with a roadblock's crew on a city street,
 * one cop down, bystanders running, Air 1 hanging over the cruisers.
 */
function gunfight(game) {
  startGame(game);
  const p = game.player;
  game.player.money = 21300;
  game.respect = 1180;
  giveWeapon(p, 'pistol', 60);
  giveWeapon(p, 'smg', 180);
  selectWeapon(p, 'smg');
  game.story.index = 3;
  startMission(game, 3);
  jumpToStep(game, 4);
  game.hud.clearLines();
  p.x = 242;
  p.z = 445.5;
  p.yaw = Math.PI / 2;
  setWanted(game, 4);
  game.roadblockTimer = 99;
  game.heli.cooldown = 0;
  const rb = placeRoadblock(game, { x: 266, z: 444, alongX: true, dir: 1 });
  // A cruiser coming up the street behind Nico: it pulls up and its crew gets out (off camera).
  policeUnit(game, 'cruiser', 212, 442.6, Math.PI / 2, 13);
  for (const [dx, dz] of [[7, -9.5], [11, 9.8], [16, -10.2], [4, 10.4], [20, 9.6]]) spawnPed(game, p.x + dx, p.z + dz);
  panic(game, p.x + 12, p.z, 40);
  game.rig.yaw = Math.PI / 2;
  game.rig.pitch = 0.05;
  run(game, 1.4, scriptedInput([], { right: true }));
  damageCharacter(game, rb.cops[0], 999, p, { x: rb.cops[0].x, y: 1.4, z: rb.cops[0].z });
  run(game, 0.3, scriptedInput([], { right: true }));
  p.armor = 58;
  p.health = 71;
  setWanted(game, 4);
  game.wanted.seen = true;
  const aimAt = rb.cops.find((c) => c.alive) ?? rb.cops[1];
  const yaw = Math.atan2(aimAt.x - p.x, aimAt.z - p.z);
  game.rig.yaw = yaw + 0.06;
  run(game, 0.2, scriptedInput([], { right: true }));
  heliAt(game, p.x + 62, 15, p.z + 5);
  game.hud.clearMessages();
  game.hud.clearLines();
  addRespect(game, 10, 'Cop down');
  game.hud.say('Nico', 'Tell Brannigan he can come get his money himself.');
  settleCamera(game, yaw + 0.06, 0.07, 40);
  heliAt(game, p.x + 62, 15, p.z + 5);
  for (let n = 0; n < 3; n += 1) fireWeapon(game, p, { x: aimAt.x, y: 1.3, z: aimAt.z }, 0.5);
  for (const c of rb.cops) if (c.alive && c !== aimAt) fireWeapon(game, c, { x: p.x, y: 1.3, z: p.z }, 6);
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
  game.hud.update(game, 0);
  // Pulled back over Nico's right shoulder: all of him, SMG up, and the roadblock he is firing at.
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  placeCamera(game, [p.x - fx * 3.0 - fz * 1.15, 2.0, p.z - fz * 3.0 + fx * 1.15], [aimAt.x, 1.9, aimAt.z], 58);
}

/**
 * The Neon Strip Sprint, second leg: Nico's Kestrel chasing all three rivals east toward the
 * orange checkpoint, a Palm Transit bus at the junction, the race panel up.
 */
function streetrace(game) {
  startGame(game);
  game.player.money = 9800;
  game.respect = 470;
  giveWeapon(game.player, 'pistol', 48);
  selectWeapon(game.player, 'pistol');
  game.story.index = 6;
  const def = RACES.find((r) => r.id === 'strip');
  const car = createVehicle(game, 'kestrel', def.start.x, def.start.z, 0, 0xff3b30);
  applyUpgrades(car, { engine: 2, armour: 0, tyres: 2 });
  car.health = 840; // scraped a wall on the first leg
  enterVehicle(game, game.player, car);
  const r = startRace(game, def);
  r.countdown = 0;
  r.time = 38.6;
  const yaw = Math.PI / 2;
  const grid = [[236, 371.6, 28], [243, 366.8, 28.5], [249, 373.2, 29], [256, 368.6, 29]];
  r.racers.forEach((racer, n) => {
    const [x, z, speed] = grid[n];
    racer.cp = 1;
    racer.car.x = x;
    racer.car.z = z;
    racer.car.yaw = yaw;
    racer.car.vx = speed;
    racer.car.vz = 0;
  });
  spawnTrafficCar(game, [4, 4, 4, 5], 0.8, 'bus');
  spawnTrafficCar(game, [4, 6, 4, 5], 0.55, 'suv');
  for (const [x, z] of [[256, 379.5], [266, 380.2], [270, 360.4], [261, 359.8], [281, 380]]) spawnPed(game, x, z);
  run(game, 0.9, scriptedInput(['KeyW']));
  game.hud.clearMessages();
  game.hud.say('Rico', 'Eat my dust, Reyes! The Strip is mine!');
  settleCamera(game, car.yaw - 0.12, 0.17);
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
  // Low behind the Kestrel's left shoulder, the pack and the checkpoint junction ahead.
  placeCamera(game, [car.x - 6.5, 2.6, car.z - 1.8], [car.x + 26, 1.2, car.z - 0.5], 64);
}

/**
 * Dex's Garage: a Marlin SUV with the full body kit (light bar, roof rack, snorkel, spare wheel,
 * side steps), race engine and gold rims in the bay, a tuned Kestrel beside it, and the rank up
 * the job paid for.
 */
function tuned(game) {
  startGame(game);
  game.player.money = 16400;
  game.respect = 1385;
  game.story.index = 7;
  const bay = garageBay(game);
  // Out of the menu: the car is in the bay and the work is done.
  game.garageInside = true;
  const suv = createVehicle(game, 'suv', bay.x, bay.z, -1.35, 0xf2f2f2);
  applyUpgrades(suv, { engine: 3, armour: 1, tyres: 2, kit: 2 });
  enterVehicle(game, game.player, suv);
  const kestrel = createVehicle(game, 'kestrel', bay.x - 1.5, bay.z + 5.6, -1.75, 0xffcc00);
  applyUpgrades(kestrel, { engine: 3, armour: 0, tyres: 2 });
  kestrel.ai = 'parked';
  run(game, 0.5, scriptedInput());
  game.hud.clearMessages();
  game.garageBeacon.mesh.visible = game.garageBeacon.arrow.visible = false;
  addRespect(game, 25, 'Body kit upgrade');
  game.hud.say('Dex', 'Light bar, snorkel, gold rims. Now that is a Bay Legend ride.');
  settleCamera(game, 1.1, 0.2);
  frameGame(game, 1 / 60, { dx: 0, dy: 0 });
  // In front of the bay, low: the SUV's nose and kit, the Kestrel by the door, the garage behind.
  placeCamera(game, [suv.x - 7.2, 3.3, suv.z - 2.9], [suv.x + 1, 2.3, suv.z + 1.9], 58);
}

const SCENES = { roadblock, gunfight, streetrace, tuned, heat, race, garage, citychase, chase, shootout, beach, pursuit, title };

/** Stages the named scene (an unknown name is the title screen). Resolves once it is set. */
export async function stageShot(game, name, menus) {
  menus.hideTitle();
  (SCENES[name] ?? title)(game, menus);
  await new Promise((resolve) => setTimeout(resolve, 50));
}
