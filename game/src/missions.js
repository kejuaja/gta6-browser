// The story of Palmera Bay and the mission runner. Each mission is a list of steps (drive
// somewhere, steal a car, collect, kill, chase, lose the cops); the runner shows each step's
// objective and dialogue, marks its target on the map, checks it, pays out and fails it when
// the player dies, is busted or loses what the mission needed.
import { WEAPONS } from './config.js';
import { LOOKS } from './models.js';
import { addBeacon, removeBeacon, moveBeacon, burst, FX } from './effects.js';
import { createVehicle } from './vehicles.js';
import { removeCharacter } from './characters.js';
import { spawnPed } from './crowd.js';
import { spawnHostile } from './hostiles.js';
import { giveWeapon } from './player.js';
import { setWanted, clearWanted } from './police.js';

/** The cast, so the dialogue's names stay one spelling. */
const NICO = 'Nico';
const LUCIA = 'Mama Lucia';
const DEX = 'Dex';
const VAL = 'Val';
const NURSE = 'Nurse Okoro';
const BRANNIGAN = 'Sgt. Brannigan';

export const STORY = [
  {
    id: 'homecoming',
    title: 'Homecoming',
    start: 'spawn',
    auto: true,
    intro: [
      [NURSE, 'Three weeks in a coma and you walk out like nothing happened. Somebody up there likes you, Mr. Reyes.'],
      [NICO, 'Somebody down here put two bullets in me at the Saltmarsh Docks. I aim to thank him.'],
      [NURSE, 'Your aunt called every day. Go see her before you go thanking anybody.'],
    ],
    steps: [
      { type: 'getCar', text: 'Find a ride: walk up to any car and press F to get in.' },
      { type: 'goto', poi: 'diner', radius: 7, text: "Drive to Lucia's Diner on Sunset Beach.", say: [[NICO, "Lucia's. Same pink sign. Some things in this town don't change."]] },
      { type: 'goto', poi: 'diner', radius: 2.2, onFoot: true, text: 'Get out (F) and walk to the door.' },
    ],
    outro: [
      [LUCIA, 'Nico! Mijo, they told me you were dead. Sit, eat. You look like a ghost.'],
      [NICO, 'Who set me up, tia? Who was on the docks that night?'],
      [LUCIA, 'Harlan Voss is buying the whole bay, block by block. Whoever says no ends up in the water. Talk to Dex at the docks. He knows the night you mean.'],
      [LUCIA, 'And take this money. If you are going to the docks, stop at Bay Arms on the Strip first. Look for the blue $ on your map.'],
    ],
    reward: 300,
  },
  {
    id: 'wheels',
    title: 'Wheels for Dex',
    start: 'garage',
    intro: [
      [DEX, 'Nico Reyes, back from the dead. I heard the shots that night. I also heard whose crew it was.'],
      [DEX, "Information costs, brother. Voss's lawyer drives a red Tarpon. Parks it in Coral Heights like he owns the street. Bring it to me."],
    ],
    steps: [
      { type: 'spawnCar', id: 'tarpon', model: 'tarpon', color: 0xb3261e, x: 523, z: 100, yaw: Math.PI },
      { type: 'enter', car: 'tarpon', text: 'Steal the red Tarpon parked in Coral Heights.' },
      { type: 'wanted', level: 1, say: [[NICO, "Car alarm. Of course a lawyer's car has a car alarm."]] },
      { type: 'deliver', car: 'tarpon', poi: 'garage', radius: 7, text: "Bring the Tarpon to Dex's garage at the docks. Lose the cops first." },
    ],
    outro: [
      [DEX, 'Beautiful. Voss will cry into his salad. Here, take this. You will need it.'],
      [DEX, 'The night you got shot, the man giving orders wore a badge. Sergeant Brannigan. Val at the Velvet Moon can tell you more, she pays him too.'],
    ],
    reward: 800,
    weapons: [['pistol', 48]],
  },
  {
    id: 'collections',
    title: 'Collections',
    start: 'club',
    intro: [
      [VAL, 'So you are the dead man everyone is talking about. Brannigan takes a cut from every club on the Strip, mine too.'],
      [VAL, 'Before I trust you, run my collections. Three drops on the Neon Strip, and the clock is ticking.'],
    ],
    steps: [
      { type: 'collect', points: [[148, 340], [260, 444], [444, 400]], timer: 170, text: 'Pick up the three cash bags on the Neon Strip.' },
      { type: 'goto', poi: 'club', radius: 6, text: 'Bring the cash back to the Velvet Moon.' },
    ],
    outro: [
      [VAL, 'Every bag, every bill. Fine. Brannigan runs his money out of the docks with a crew of Voss enforcers. Go send them a message.'],
    ],
    reward: 1200,
  },
  {
    id: 'message',
    title: 'Loud Message',
    start: 'club',
    intro: [
      [VAL, 'Voss enforcers hang out by the cranes on the quay. Five of them, all armed.'],
      [NICO, 'Five is a small number.'],
      [VAL, 'Say that again when you are bleeding. Take this, and go.'],
    ],
    weaponsAtStart: [['smg', 90]],
    steps: [
      { type: 'goto', x: 236, z: 612, radius: 30, text: 'Go to the cranes on the Saltmarsh quay.' },
      { type: 'spawnGang', group: 'enforcers', at: [[226, 616], [232, 622], [244, 614], [250, 624], [238, 628]], weapon: 'smg' },
      { type: 'kill', group: 'enforcers', text: 'Take out the Voss enforcers.' },
      { type: 'wanted', level: 2, say: [[NICO, 'Sirens. Brannigan sends his friends fast.']] },
      { type: 'loseWanted', text: 'Lose the police.' },
    ],
    outro: [
      [VAL, 'The whole Strip heard that. Brannigan is scared, and scared men make mistakes. Dex has a lead on his courier.'],
    ],
    reward: 1500,
  },
  {
    id: 'courier',
    title: 'Hot Pursuit',
    start: 'garage',
    intro: [
      [DEX, "Brannigan's courier carries the ledger: every payment Voss ever made to a cop. He is leaving Downtown right now in a black Kestrel."],
      [DEX, 'Stop that car and the ledger is yours.'],
    ],
    steps: [
      { type: 'chase', id: 'courier', model: 'kestrel', color: 0x111111, x: 299.4, z: 470, yaw: Math.PI, text: 'Stop the black Kestrel: wreck it or take out the driver.' },
      { type: 'gotoCar', car: 'courier', radius: 3, onFoot: true, text: 'Grab the ledger from the courier car.' },
      { type: 'goto', poi: 'diner', radius: 6, text: "Take the ledger to Lucia's Diner.", say: [[NICO, 'Names, dates, amounts. Brannigan wrote everything down. Idiot.']] },
    ],
    outro: [
      [LUCIA, 'Mijo, this will burn Voss down to the ground. But Brannigan will come for you first.'],
      [NICO, 'Then I go to him. He is moving the last of the money tonight, at the quay.'],
    ],
    reward: 2000,
  },
  {
    id: 'lastcall',
    title: 'Last Call on the Quay',
    start: 'diner',
    intro: [
      [LUCIA, 'Promise me you come back.'],
      [NICO, 'I came back once already, tia.'],
    ],
    steps: [
      { type: 'goto', x: 470, z: 614, radius: 34, text: 'Go to the quay at the east end of the Saltmarsh Docks.' },
      { type: 'spawnGang', group: 'quay', at: [[452, 612], [462, 626], [478, 610], [490, 624], [500, 616]], weapon: 'pistol', boss: { x: 486, z: 618 } },
      { type: 'kill', group: 'quay', text: 'Take down Sergeant Brannigan and his crew.', say: [[BRANNIGAN, 'Reyes! I should have finished you on these docks!']] },
      { type: 'wanted', level: 3, say: [[NICO, 'Every cop in the bay is on the way. Time to disappear.']] },
      { type: 'loseWanted', text: 'Survive: lose the whole police force.' },
    ],
    outro: [
      [LUCIA, 'It is on every channel. Voss arrested, the ledger on the front page. You did it, Nico.'],
      [NICO, 'Palmera Bay is a little cleaner tonight. Not clean. Just cleaner.'],
    ],
    reward: 5000,
    finale: true,
  },
];

export function createStory(index = 0) {
  return { index, active: null, beacon: null, queue: [] };
}

function poiPos(game, step) {
  if (step.poi) return game.city.pois[step.poi];
  return { x: step.x, z: step.z };
}

/** Puts dialogue lines on the subtitle queue. */
export function say(game, lines) {
  for (const [who, text] of lines) game.hud.say(who, text);
}

function setTarget(game, m, x, z, color = 0xffd23f, radius = 2.2) {
  if (m.beacon) moveBeacon(m.beacon, x, z);
  else m.beacon = addBeacon(game.fx, x, z, color, radius);
  m.target = { x, z, color };
}

function clearTarget(game, m) {
  removeBeacon(game.fx, m.beacon);
  m.beacon = null;
  m.target = null;
}

function startStep(game, m) {
  const step = m.def.steps[m.step];
  if (!step) {
    passMission(game);
    return;
  }
  m.state = {};
  if (step.say) say(game, step.say);
  if (step.text) game.hud.objective(step.text);
  const p = game.player;
  switch (step.type) {
    case 'spawnCar': {
      const v = createVehicle(game, step.model, step.x, step.z, step.yaw, step.color);
      v.ai = 'parked';
      v.mission = m;
      m.cars[step.id] = v;
      nextStep(game, m);
      return;
    }
    case 'chase': {
      const v = createVehicle(game, step.model, step.x, step.z, step.yaw, step.color);
      v.ai = 'flee';
      v.mission = m;
      v.health = 1400;
      const driver = spawnPed(game, step.x, step.z, LOOKS.gang);
      driver.kind = 'target';
      driver.vehicle = v;
      driver.mesh.root.visible = false;
      driver.mission = true;
      v.driver = driver;
      m.cars[step.id] = v;
      break;
    }
    case 'spawnGang': {
      m.groups[step.group] = [];
      for (const [x, z] of step.at) m.groups[step.group].push(spawnHostile(game, x, z, { weapon: step.weapon, group: step.group, yaw: Math.PI }));
      if (step.boss) {
        const boss = spawnHostile(game, step.boss.x, step.boss.z, { kind: 'target', look: LOOKS.boss, weapon: 'smg', health: 260, group: step.group });
        m.groups[step.group].push(boss);
      }
      nextStep(game, m);
      return;
    }
    case 'wanted':
      setWanted(game, step.level);
      nextStep(game, m);
      return;
    case 'collect':
      m.state.left = step.points.map(([x, z]) => ({ x, z, beacon: addBeacon(game.fx, x, z, 0x5fd35f, 1.6) }));
      m.timer = step.timer ?? 0;
      break;
    default:
      break;
  }
  void p;
}

function nextStep(game, m) {
  clearTarget(game, m);
  m.step += 1;
  startStep(game, m);
}

/** Whether the current step is done; also keeps its map target where it should be. */
function checkStep(game, m, dt) {
  const step = m.def.steps[m.step];
  const p = game.player;
  const px = p.vehicle ? p.vehicle.x : p.x;
  const pz = p.vehicle ? p.vehicle.z : p.z;
  switch (step.type) {
    case 'getCar':
      return Boolean(p.vehicle);
    case 'goto': {
      const t = poiPos(game, step);
      setTarget(game, m, t.x, t.z, 0xffd23f, step.radius > 8 ? 6 : 2.2);
      if (step.onFoot && p.vehicle) return false;
      return Math.hypot(px - t.x, pz - t.z) < step.radius;
    }
    case 'enter': {
      const v = m.cars[step.car];
      if (!v || v.wrecked) return fail(game, 'The car was destroyed.');
      setTarget(game, m, v.x, v.z, 0x5fb3ff, 2.6);
      return p.vehicle === v;
    }
    case 'deliver': {
      const v = m.cars[step.car];
      if (!v || v.wrecked) return fail(game, 'The car was destroyed.');
      if (p.vehicle !== v) {
        setTarget(game, m, v.x, v.z, 0x5fb3ff, 2.6);
        game.hud.objective('Get back in the Tarpon.');
        return false;
      }
      const t = poiPos(game, step);
      setTarget(game, m, t.x, t.z, 0xffd23f, 5);
      if (game.wanted.level > 0) {
        game.hud.objective('Lose the cops before you go to the garage. Paint Shack in the Docks helps ($100).');
        return false;
      }
      game.hud.objective(step.text);
      return Math.hypot(v.x - t.x, v.z - t.z) < step.radius && Math.abs(v.fwd) < 4;
    }
    case 'collect': {
      m.timer -= dt;
      if (m.timer <= 0) return fail(game, 'Out of time.');
      const left = m.state.left;
      for (let n = left.length - 1; n >= 0; n -= 1) {
        if (Math.hypot(px - left[n].x, pz - left[n].z) < 3) {
          removeBeacon(game.fx, left[n].beacon);
          burst(game.fx, FX.cash, left[n].x, 1, left[n].z, 16, 2.5, 2);
          if (game.audio) game.audio.pickup(false);
          left.splice(n, 1);
          game.hud.notify(`Cash bag picked up (${3 - left.length}/3)`);
        }
      }
      m.target = left[0] ? { x: left[0].x, z: left[0].z, color: 0x5fd35f } : null;
      m.extraBlips = left.map((b) => ({ x: b.x, z: b.z, color: 0x5fd35f }));
      if (left.length === 0) {
        m.timer = 0;
        m.extraBlips = null;
        return true;
      }
      return false;
    }
    case 'kill': {
      const group = m.groups[step.group];
      const alive = group.filter((c) => c.alive);
      m.extraBlips = alive.map((c) => ({ x: c.x, z: c.z, color: 0xff3b3b, small: true }));
      m.target = null;
      game.hud.objective(`${step.text} (${group.length - alive.length}/${group.length})`);
      if (alive.length === 0) {
        m.extraBlips = null;
        return true;
      }
      return false;
    }
    case 'chase': {
      const v = m.cars[step.id];
      m.target = { x: v.x, z: v.z, color: 0xff3b3b };
      if (v.wrecked || v.burn > 0 || !v.driver || !v.driver.alive) {
        if (v.driver && v.driver.alive && v.driver.vehicle === v) v.ai = 'parked';
        v.ai = 'parked';
        return true;
      }
      if (Math.hypot(px - v.x, pz - v.z) > 260) return fail(game, 'The courier got away.');
      return false;
    }
    case 'gotoCar': {
      const v = m.cars[step.car];
      setTarget(game, m, v.x, v.z, 0xffd23f, 2.2);
      if (p.vehicle) return false;
      return Math.hypot(p.x - v.x, p.z - v.z) < step.radius + v.spec.len / 2;
    }
    case 'loseWanted':
      m.target = null;
      return game.wanted.level === 0;
    default:
      return true;
  }
}

function fail(game, reason) {
  failMission(game, reason);
  return false;
}

function cleanup(game, m) {
  clearTarget(game, m);
  if (m.state && m.state.left) for (const b of m.state.left) removeBeacon(game.fx, b.beacon);
  for (const id of Object.keys(m.cars)) {
    const v = m.cars[id];
    v.mission = null;
    if (v.driver && v.driver !== game.player && v.driver.kind === 'target') {
      v.driver.kind = 'ped';
    }
  }
  for (const group of Object.values(m.groups)) for (const c of group) c.mission = false;
}

/** Moves the active mission straight to step `n` (the screenshot scenes start mid-mission). */
export function jumpToStep(game, n) {
  const m = game.story.active;
  if (!m) return;
  clearTarget(game, m);
  m.step = n;
  startStep(game, m);
}

export function startMission(game, index) {
  const story = game.story;
  const def = STORY[index];
  removeBeacon(game.fx, story.beacon);
  story.beacon = null;
  const m = { def, index, step: 0, state: {}, cars: {}, groups: {}, beacon: null, target: null, timer: 0 };
  story.active = m;
  game.hud.banner(def.title, 'mission');
  if (def.intro) say(game, def.intro);
  if (def.weaponsAtStart) for (const [id, n] of def.weaponsAtStart) giveWeapon(game.player, id, n);
  if (def.weaponsAtStart) game.hud.notify(`Got the ${def.weaponsAtStart.map(([id]) => WEAPONS[id].name).join(', ')}.`);
  startStep(game, m);
}

function passMission(game) {
  const story = game.story;
  const m = story.active;
  cleanup(game, m);
  story.active = null;
  story.index = Math.max(story.index, m.index + 1);
  game.player.money += m.def.reward;
  if (m.def.weapons) for (const [id, n] of m.def.weapons) giveWeapon(game.player, id, n);
  game.stats.missions = story.index;
  game.hud.objective('');
  game.hud.banner('MISSION PASSED', 'passed', `+$${m.def.reward.toLocaleString('en-US')}`);
  if (game.audio) game.audio.jingle();
  if (m.def.outro) say(game, m.def.outro);
  if (m.def.weapons) game.hud.notify(`Got the ${m.def.weapons.map(([id]) => WEAPONS[id].name).join(', ')}.`);
  if (m.def.finale && game.onFinale) game.onFinale();
  if (game.saveGame) game.saveGame(true);
}

export function failMission(game, reason) {
  const story = game.story;
  const m = story.active;
  if (!m) return;
  cleanup(game, m);
  for (const group of Object.values(m.groups)) for (const c of group) if (c.alive) removeCharacter(game, c);
  story.active = null;
  game.wanted.floor = 0;
  game.hud.objective('');
  game.hud.banner('MISSION FAILED', 'failed', reason);
}

/** One step of the story: the active mission's checks, or waiting at the next mission's marker. */
export function updateStory(game, dt) {
  const story = game.story;
  const p = game.player;
  if (story.active) {
    const m = story.active;
    if (checkStep(game, m, dt) && story.active === m) nextStep(game, m);
    return;
  }
  const def = STORY[story.index];
  if (!def || game.race) return;
  const at = game.city.pois[def.start];
  if (def.auto) {
    startMission(game, story.index);
    return;
  }
  if (!story.beacon) story.beacon = addBeacon(game.fx, at.x, at.z, 0xffd23f, 1.8);
  const px = p.vehicle ? p.vehicle.x : p.x;
  const pz = p.vehicle ? p.vehicle.z : p.z;
  if (Math.hypot(px - at.x, pz - at.z) < 3.2 && p.alive) {
    if (game.wanted.level > 0) {
      if (!story.warned) game.hud.notify('Lose the cops before starting a mission.');
      story.warned = true;
      return;
    }
    story.warned = false;
    startMission(game, story.index);
  }
}

/** The next mission's start, for the map: where and whose. */
export function nextMissionMarker(game) {
  const def = STORY[game.story.index];
  if (!def || game.story.active) return null;
  const at = game.city.pois[def.start];
  return { x: at.x, z: at.z, title: def.title };
}

export function resetStoryEntities(game) {
  if (game.story.active) failMission(game, '');
  removeBeacon(game.fx, game.story.beacon);
  game.story.beacon = null;
  void clearWanted;
}
