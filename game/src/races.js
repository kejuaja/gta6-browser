// Street races: chequered markers on the map start a race when the player drives into one with no
// stars and no mission. Three rival cars line up beside them, a 3-2-1 countdown, then everyone
// runs the same checkpoints along the city's roads. Rivals steer from checkpoint to checkpoint,
// brake for corners and back out of crashes. First across the line takes the cash prize.
import { createVehicle, driveVehicle } from './vehicles.js';
import { spawnPed } from './crowd.js';
import { removeCharacter } from './characters.js';
import { addBeacon, removeBeacon, moveBeacon } from './effects.js';
import { angleDiff } from './physics.js';
import { snapCamera } from './camera.js';
import { rankOf, RANKS } from './respect.js';

/** The routes: every checkpoint is a junction, so each leg is a straight run down one road. */
export const RACES = [
  {
    id: 'strip',
    name: 'Neon Strip Sprint',
    start: { x: 148, z: 160, yaw: 0 },
    checkpoints: [[148, 370], [296, 370], [296, 444], [444, 444], [444, 296], [518, 296], [518, 518]],
    prize: 1500,
    respect: 40,
    rivals: [['kestrel', 0xffcc00, 'Rico'], ['tarpon', 0x2e7d32, 'Mags'], ['kestrel', 0x0a84ff, 'Tito']],
  },
  {
    id: 'beach',
    name: 'Sunset Boulevard Run',
    start: { x: 0, z: 40, yaw: 0 },
    checkpoints: [[0, 222], [0, 444], [0, 518], [148, 518], [148, 592], [370, 592], [370, 518]],
    prize: 2500,
    respect: 60,
    minRank: 2,
    rivals: [['kestrel', 0xff6b9d, 'Rico'], ['kestrel', 0x111111, 'Juno'], ['tarpon', 0xf5f5f5, 'Mags']],
  },
];

const CP_RADIUS = 9;
const COUNTDOWN = 3.5;

/** Grid slots behind the start line: across the road (two lanes), then rows back. */
const GRID_SLOTS = [[-3.4, 0], [3.4, 0], [-3.4, -8], [3.4, -8]];

function slotPos(start, slot) {
  const fx = Math.sin(start.yaw);
  const fz = Math.cos(start.yaw);
  const [across, back] = GRID_SLOTS[slot];
  return { x: start.x + fz * across + fx * back, z: start.z - fx * across + fz * back };
}

/** Puts up the start markers (once per game); they hide while a race or mission runs. */
export function createRaces(game) {
  game.raceMarkers = RACES.map((def) => ({ def, beacon: null }));
  game.race = null;
  game.raceCooldown = 0;
}

export function clearRaces(game) {
  if (game.race) endRace(game, 'quit', true);
  for (const m of game.raceMarkers ?? []) {
    removeBeacon(game.fx, m.beacon);
    m.beacon = null;
  }
}

/** The start markers that can be used right now, for the maps. */
export function raceMarkers(game) {
  if (game.race || game.story.active || game.mode === 'title') return [];
  return (game.raceMarkers ?? []).map((m) => ({ x: m.def.start.x, z: m.def.start.z, name: m.def.name }));
}

/** Starts race `def` from its grid with the player's car; `opts.mission` hands the result to a mission. */
export function startRace(game, def, opts = {}) {
  const p = game.player;
  const car = p.vehicle;
  if (!car) return null;
  const at = slotPos(def.start, 0);
  car.x = at.x;
  car.z = at.z;
  car.yaw = def.start.yaw;
  car.vx = car.vz = 0;
  snapCamera(game.rig, game, def.start.yaw);
  const racers = [{ car, player: true, cp: 0, done: false, name: 'You' }];
  def.rivals.forEach(([model, color, name], n) => {
    const s = slotPos(def.start, n + 1);
    const v = createVehicle(game, model, s.x, s.z, def.start.yaw, color);
    const driver = spawnPed(game, s.x, s.z);
    driver.vehicle = v;
    driver.mesh.root.visible = false;
    v.driver = driver;
    v.ai = 'race';
    v.racer = true;
    v.reverse = 0;
    // Each rival has its own engine: the field is close but not identical.
    v.spec = { ...v.spec, top: v.spec.top * (0.93 + n * 0.035), accel: v.spec.accel * 1.05 };
    racers.push({ car: v, player: false, cp: 0, done: false, name });
  });
  const race = { def, racers, countdown: COUNTDOWN, time: 0, finished: 0, place: 0, result: null, mission: Boolean(opts.mission), beacon: null, away: 0, lastCount: 4 };
  game.race = race;
  for (const m of game.raceMarkers) {
    removeBeacon(game.fx, m.beacon);
    m.beacon = null;
  }
  game.hud.banner(def.name, 'mission', 'Get ready');
  return race;
}

function rivalDrive(game, r, race, dt) {
  const v = r.car;
  if (!v.driver || !v.driver.alive || v.driver.vehicle !== v || v.wrecked || v.burn > 0) {
    v.ai = 'parked';
    r.done = true;
    r.out = true;
    return;
  }
  if (race.countdown > 0 || r.done) {
    // Brake only while rolling forward: a held brake at a standstill would reverse.
    driveVehicle(game, v, { throttle: 0, brake: v.fwd > 0.5 ? 1 : 0, steer: 0, handbrake: false }, dt);
    return;
  }
  if (v.reverse > 0) {
    v.reverse -= dt;
    driveVehicle(game, v, { throttle: 0, brake: 1, steer: v.reverseSteer, handbrake: false }, dt);
    return;
  }
  const cps = race.def.checkpoints;
  const [tx, tz] = cps[r.cp];
  const dist = Math.hypot(tx - v.x, tz - v.z);
  const want = Math.atan2(tx - v.x, tz - v.z);
  const diff = angleDiff(v.yaw, want);
  // Slow for the corner at this checkpoint: how sharply the road turns there sets the entry speed.
  let corner = v.spec.top;
  const next = cps[r.cp + 1];
  if (next && dist < 40) {
    const turn = Math.abs(angleDiff(want, Math.atan2(next[0] - tx, next[1] - tz)));
    corner = turn > 0.6 ? 11 + (dist / 40) * 14 : v.spec.top;
  }
  // A little rubber band: a rival far ahead of the player eases off, one far behind pushes.
  const me = race.racers[0];
  const lead = r.cp - me.cp;
  const band = lead >= 2 ? 0.85 : lead <= -2 ? 1.12 : 1;
  const target = Math.min(corner, v.spec.top * band);
  const ctl = {
    throttle: v.fwd < target ? 1 : 0,
    brake: v.fwd > target + 2 ? 0.8 : 0,
    steer: Math.max(-1, Math.min(1, diff * 2.4)),
    handbrake: Math.abs(diff) > 1.0 && v.fwd > 12,
  };
  driveVehicle(game, v, ctl, dt);
  if (v.fwd < 1.5) v.stuck += dt;
  else v.stuck = 0;
  if (v.stuck > 1.2) {
    v.reverse = 1;
    v.reverseSteer = -ctl.steer;
    v.stuck = 0;
  }
}

/** Ranks the racers: more checkpoints first, then the one closer to their next checkpoint. */
function standings(race) {
  const cps = race.def.checkpoints;
  const score = (r) => {
    if (r.finishedAt) return 1e6 - r.finishedAt;
    const [x, z] = cps[Math.min(r.cp, cps.length - 1)];
    return r.cp * 1000 - Math.hypot(x - r.car.x, z - r.car.z);
  };
  return [...race.racers].sort((a, b) => score(b) - score(a));
}

function ordinal(n) {
  return ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
}

function endRace(game, result, silent = false) {
  const race = game.race;
  if (!race) return;
  removeBeacon(game.fx, race.beacon);
  for (const r of race.racers) {
    if (r.player) continue;
    r.car.ai = 'parked';
    r.car.racer = false;
    if (r.car.driver && r.car.driver !== game.player && silent) removeCharacter(game, r.car.driver);
  }
  race.result = result;
  game.race = null;
  game.lastRace = race;
  game.raceCooldown = 6;
  game.hud.objective('');
  if (silent) return;
  const def = race.def;
  if (result === 'won') {
    const prize = race.mission ? 0 : def.prize;
    game.player.money += prize;
    game.stats.racesWon = (game.stats.racesWon ?? 0) + 1;
    game.hud.banner('RACE WON', 'passed', prize ? `+$${prize.toLocaleString('en-US')}` : def.name);
    if (game.addRespect) game.addRespect(def.respect, 'Race won');
    if (game.audio) game.audio.jingle();
  } else if (result === 'placed') {
    const prize = race.mission ? 0 : Math.round(def.prize * (race.place === 2 ? 0.3 : 0));
    game.player.money += prize;
    game.hud.banner(`FINISHED ${ordinal(race.place).toUpperCase()}`, 'mission', prize ? `+$${prize}` : 'No prize');
    if (game.addRespect) game.addRespect(10, 'Race finished');
  } else game.hud.banner('RACE LOST', 'failed', result === 'wrecked' ? 'Your car is wrecked.' : 'You left the race.');
}

/** One step of the race in progress, or of the start markers waiting for the player. */
export function updateRaces(game, dt) {
  const p = game.player;
  game.raceCooldown -= dt;
  const race = game.race;
  if (!race) {
    const open = !game.story.active && game.wanted.level === 0;
    for (const m of game.raceMarkers ?? []) {
      const s = m.def.start;
      if (open && !m.beacon) m.beacon = addBeacon(game.fx, s.x, s.z, 0xff8c1a, 4);
      if (!open && m.beacon) {
        removeBeacon(game.fx, m.beacon);
        m.beacon = null;
      }
      if (!open || !p.vehicle || game.raceCooldown > 0 || p.vehicle.wrecked) continue;
      if (Math.hypot(p.vehicle.x - s.x, p.vehicle.z - s.z) >= 5) continue;
      if (m.def.minRank && rankOf(game.respect ?? 0) < m.def.minRank) {
        game.hud.notify(`${m.def.name}: the crew only races a ${RANKS[m.def.minRank].name} or better. Earn respect first.`);
        game.raceCooldown = 6;
      } else startRace(game, m.def);
    }
    return;
  }
  const me = race.racers[0];
  const cps = race.def.checkpoints;
  if (race.countdown > 0) {
    race.countdown -= dt;
    const n = Math.ceil(race.countdown);
    if (n !== race.lastCount && n <= 3) {
      race.lastCount = n;
      game.hud.banner(n > 0 ? String(n) : 'GO!', 'countdown');
      if (game.audio) game.audio.click();
    }
    // Held on the line until GO.
    const at = slotPos(race.def.start, 0);
    if (me.car === p.vehicle) {
      me.car.x = at.x;
      me.car.z = at.z;
      me.car.yaw = race.def.start.yaw;
      me.car.vx = me.car.vz = 0;
    }
  } else race.time += dt;
  for (const r of race.racers) {
    if (!r.player) rivalDrive(game, r, race, dt);
    if (r.done || race.countdown > 0) continue;
    const [x, z] = cps[r.cp];
    if (Math.hypot(r.car.x - x, r.car.z - z) < CP_RADIUS) {
      r.cp += 1;
      if (r.player && game.audio) game.audio.pickup(false);
      if (r.cp >= cps.length) {
        r.done = true;
        race.finished += 1;
        r.finishedAt = race.finished;
        if (r.player) {
          race.place = race.finished;
          endRace(game, race.place === 1 ? 'won' : 'placed');
          return;
        }
      }
    }
  }
  if (me.car.wrecked || me.car.burn > 0) {
    endRace(game, 'wrecked');
    return;
  }
  race.away = p.vehicle === me.car ? 0 : race.away + dt;
  const [nx, nz] = cps[me.cp];
  if (race.away > 8 || Math.hypot(me.car.x - nx, me.car.z - nz) > 260) {
    endRace(game, 'quit');
    return;
  }
  if (race.beacon) moveBeacon(race.beacon, nx, nz);
  else race.beacon = addBeacon(game.fx, nx, nz, 0xff8c1a, 5);
  const ranks = standings(race);
  race.position = ranks.indexOf(me) + 1;
  game.hud.objective(race.countdown > 0 ? `${race.def.name}: wait for the green light` : p.vehicle === me.car ? `${race.def.name}: drive through the orange checkpoints` : 'Get back in your car!');
}

/** The race's line on the HUD: position, checkpoint and time. Null when no race runs. */
export function raceStatus(game) {
  const race = game.race;
  if (!race) return null;
  const t = race.time;
  return {
    position: race.position ?? 1,
    of: race.racers.length,
    cp: Math.min(race.racers[0].cp + 1, race.def.checkpoints.length),
    cps: race.def.checkpoints.length,
    time: `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`,
    next: race.def.checkpoints[race.racers[0].cp],
    after: race.def.checkpoints[race.racers[0].cp + 1] ?? null,
  };
}
