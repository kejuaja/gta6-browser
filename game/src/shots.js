// The screenshot scenes behind ?shot=chase|shootout|beach|title. Each one starts a real game,
// sets up a moment of it with the game's own systems (a mission step, a stolen car, the wanted
// level, police units) and plays the real simulation forward for a few seconds with a scripted
// hand on the controls, so every frame is the game's own code rendering its own state.
import { STEP } from './config.js';
import { startGame, startTitle, stepGame, frameGame } from './world.js';
import { createVehicle } from './vehicles.js';
import { enterVehicle } from './player.js';
import { giveWeapon, selectWeapon } from './player.js';
import { spawnPoliceUnit, setWanted } from './police.js';
import { startMission, jumpToStep } from './missions.js';
import { fireWeapon } from './combat.js';
import { damageCharacter } from './characters.js';
import { snapCamera } from './camera.js';
import { spawnTrafficCar } from './traffic.js';

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
  game.hud.showCar(car.spec.name, true);
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

const SCENES = { chase, shootout, beach, pursuit, title };

/** Stages the named scene (an unknown name is the title screen). Resolves once it is set. */
export async function stageShot(game, name, menus) {
  menus.hideTitle();
  (SCENES[name] ?? title)(game, menus);
  await new Promise((resolve) => setTimeout(resolve, 50));
}
