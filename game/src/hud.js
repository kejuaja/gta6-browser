// The heads-up display, drawn in HTML over the 3D view: a rotating minimap with blips, health
// and armour bars, money, clock, weapon and ammo, wanted stars, the mission objective and timer,
// subtitles, banners (mission passed, busted), help toasts, district names and the car's name,
// speed and radio station. Also draws the full city map for the pause menu.
import { rankInfo } from './respect.js';
import { nextMissionMarker, STORY } from './missions.js';
import { dispatchRows, escapeTime } from './police.js';
import { WEAPONS, WEAPON_ORDER, DISTRICTS, WORLD, PALETTE, GRID } from './config.js';
import { raceMarkers, raceStatus } from './races.js';

const MAP_X0 = -180;
const MAP_Z0 = -60;
const MAP_W = 800;
const MAP_H = 740;
const DISTRICT_TINT = { beach: '#e9d7b4', downtown: '#9fb0c4', strip: '#d9a7c7', heights: '#a9d39a', docks: '#a8adb5' };

/** The dispatch panel's tags: what each colour means is the same in every scene. */
const TAG_CLASS = { RAMMING: 'red', FIRING: 'fire', SPOTLIGHT: 'blue', SEARCHING: 'slate', RETURNING: 'slate', 'CLOSING IN': 'teal', PURSUIT: 'indigo', ROADBLOCK: 'amber', 'ON FOOT': 'purple' };
const UNIT_ICON = { air: '✚', car: '▰', foot: '●' };
const DISPATCH_ROWS = 5;

/** The weapon bar: a short name and a side-on silhouette (a 40 x 20 SVG path) for each slot. */
const WEAPON_SLOT = {
  fists: { short: 'FISTS', icon: 'M11 6h17a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3zM7 9h5v6H7a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z' },
  pistol: { short: 'VESPER 9', icon: 'M6 5h27v5H17l-2 9H9l2-9H6zM33 6h2v3h-2z' },
  smg: { short: 'HORNET', icon: 'M2 6h34v5h-8l-1 3h-4l-1-3h-4l-2 8H9l2-8H2zM22 11h4v8h-4zM36 7h3v2h-3z' },
  shotgun: { short: 'BREAKER 12', icon: 'M1 7h38v3H17l-7 6H3l5-6H1zM20 10h12v2H20z' },
};

/** A mission's stages: the steps that show the player an objective, counted once per mission. */
const stageCache = new Map();
function stagesOf(def) {
  let list = stageCache.get(def);
  if (!list) {
    list = [];
    def.steps.forEach((step, n) => {
      if (step.text) list.push(n);
    });
    stageCache.set(def, list);
  }
  return list;
}

function clockText(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/** A segmented progress bar: `total` segments, the first `done` lit, the one after it current. */
function setSegments(box, total, done) {
  while (box.children.length < total) el('i', '', box);
  for (let n = 0; n < box.children.length; n += 1) setClass(box.children[n], n >= total ? 'off' : n < done ? 'done' : n === done ? 'now' : '');
}

/** Sets an element's text only when it changed, so a steady HUD costs no layout work. */
function setText(e, text) {
  if (e.textContent !== text) e.textContent = text;
}

function setClass(e, cls) {
  if (e.className !== cls) e.className = cls;
}

function el(tag, cls, parent, text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** The city drawn once, 1 px a metre: sea, sand, grass, roads and blocks by district. */
function drawBaseMap(city) {
  const c = document.createElement('canvas');
  c.width = MAP_W;
  c.height = MAP_H;
  const g = c.getContext('2d');
  const X = (x) => x - MAP_X0;
  const Z = (z) => z - MAP_Z0;
  g.fillStyle = '#3c8fb5';
  g.fillRect(0, 0, MAP_W, MAP_H);
  g.fillStyle = '#7fae5e';
  g.fillRect(X(WORLD.beachX + 4), 0, MAP_W, Z(WORLD.harbourZ));
  g.fillStyle = '#f0d9a8';
  g.fillRect(X(WORLD.beachX), 0, 64, Z(WORLD.harbourZ));
  g.fillStyle = '#b7b2a8';
  g.fillRect(X(-7), Z(599), 620, 41);
  const p = WORLD.pier;
  g.fillStyle = '#b98f66';
  g.fillRect(X(p.x0), Z(p.z0), p.x1 - p.x0, p.z1 - p.z0);
  g.fillStyle = '#55585f';
  const end = GRID.blocks * GRID.cell;
  g.fillRect(X(-7), Z(-7), end + 14, end + 14);
  for (const b of city.blocks) {
    g.fillStyle = b.park ? '#7cc05a' : DISTRICT_TINT[b.district];
    g.fillRect(X(b.x0), Z(b.z0), b.x1 - b.x0, b.z1 - b.z0);
  }
  g.fillStyle = 'rgba(40,40,60,0.28)';
  for (const s of city.solids) g.fillRect(X(s.x0), Z(s.z0), s.x1 - s.x0, s.z1 - s.z0);
  return c;
}

export function createHud(root, city) {
  const hud = el('div', 'hud', root);
  const top = el('div', 'hud-top', hud);
  const clock = el('div', 'hud-clock', top);
  const money = el('div', 'hud-money', top);
  const rank = el('div', 'hud-rank', top);
  const rankName = el('span', 'name', rank);
  const rankBar = el('div', 'rank-bar', rank);
  const rankFill = el('div', 'fill', rankBar);
  const rankPop = el('div', 'hud-rank-pop', top);
  // The weapon bar: every slot numbered as the keys pick it, the one in hand lit, the rest LOCKED until bought.
  const weapons = el('div', 'hud-weapons', top);
  const slots = WEAPON_ORDER.map((id, n) => {
    const slot = el('div', 'slot', weapons);
    el('span', 'key', slot, String(n + 1));
    slot.insertAdjacentHTML('beforeend', `<svg class="icon" viewBox="0 0 40 20"><path d="${WEAPON_SLOT[id].icon}"/></svg>`);
    el('span', 'wname', slot, WEAPON_SLOT[id].short);
    return { id, slot, ammo: el('span', 'ammo', slot) };
  });
  const ammo = el('div', 'hud-ammo', top);
  const stars = el('div', 'hud-stars', top);
  const starEls = [];
  for (let n = 0; n < 5; n += 1) starEls.push(el('span', 'star', stars, '★'));
  const seen = el('div', 'hud-seen', top);
  const seenTag = el('span', 'tag', seen);
  const seenWhy = el('span', 'why', seen);

  // The left column: panels stack from the top and close up when one has nothing to say.
  const left = el('div', 'hud-left', hud);
  // The mission card: which job of the story, whose, the objective, its stage and what comes next.
  const mission = el('div', 'hud-panel hud-mission', left);
  const missionHead = el('div', 'head', mission);
  const missionNo = el('span', 'badge', missionHead);
  const missionTitle = el('span', 'title', missionHead);
  const missionGiver = el('span', 'giver', missionHead);
  const missionTimer = el('span', 'timer', missionHead);
  const missionObjective = el('div', 'objective', mission);
  const missionStage = el('div', 'stage', mission);
  const missionStageNo = el('span', 'label', missionStage);
  const missionSegs = el('span', 'segs', missionStage);
  const missionPay = el('span', 'pay', missionStage);
  const missionNext = el('div', 'next', mission);
  el('span', 'k', missionNext, 'NEXT');
  const missionNextText = el('span', 'v', missionNext);
  // The race card: the street race's name, position, checkpoints, prize and every racer's place.
  const raceCard = el('div', 'hud-panel hud-racecard', left);
  const raceHead = el('div', 'head', raceCard);
  el('span', 'badge', raceHead, 'RACE');
  const raceTitle = el('span', 'title', raceHead);
  const raceTime = el('span', 'timer', raceHead);
  const raceObjective = el('div', 'objective', raceCard);
  const raceStage = el('div', 'stage', raceCard);
  const racePos = el('span', 'pos', raceStage);
  const raceCp = el('span', 'label', raceStage);
  const raceSegs = el('span', 'segs', raceStage);
  const racePrize = el('span', 'pay', raceStage);
  const raceRows = [];
  for (let n = 0; n < 4; n += 1) {
    const row = el('div', 'row', raceCard);
    raceRows.push({ row, place: el('span', 'place', row), name: el('span', 'name', row), car: el('span', 'car', row), gap: el('span', 'gap', row) });
  }
  const dispatchBox = el('div', 'hud-panel hud-dispatch', left);
  const dispatchHead = el('div', 'head', dispatchBox);
  el('span', 'title', dispatchHead, 'PBPD DISPATCH');
  const dispatchCount = el('span', 'count', dispatchHead);
  const dispatchEls = [];
  for (let n = 0; n < DISPATCH_ROWS; n += 1) {
    const row = el('div', 'row', dispatchBox);
    dispatchEls.push({ row, icon: el('span', 'icon', row), name: el('span', 'name', row), dist: el('span', 'dist', row), tag: el('span', 'tag', row) });
  }
  const dispatchFoot = el('div', 'foot', dispatchBox);

  const mapBox = el('div', 'hud-map', hud);
  const mapCanvas = el('canvas', 'hud-minimap', mapBox);
  mapCanvas.width = 230;
  mapCanvas.height = 230;
  const bars = el('div', 'hud-bars', mapBox);
  const healthBar = el('div', 'bar health', bars);
  const healthFill = el('div', 'fill', healthBar);
  const armorBar = el('div', 'bar armor', bars);
  const armorFill = el('div', 'fill', armorBar);

  const subtitle = el('div', 'hud-subtitle', hud);
  const banner = el('div', 'hud-banner', hud);
  const bannerTitle = el('div', 'title', banner);
  const bannerSub = el('div', 'sub', banner);
  const toast = el('div', 'hud-toast', hud);
  const district = el('div', 'hud-district', hud);
  const districtName = el('div', 'name', district);
  const districtTag = el('div', 'tag', district);
  const car = el('div', 'hud-car', hud);
  const carName = el('div', 'name', car);
  const carSpeed = el('div', 'speed', car);
  const carRadio = el('div', 'radio', car);
  const crosshair = el('div', 'hud-crosshair', hud);
  const mouseHint = el('div', 'hud-mousehint', hud, 'Click the game to capture the mouse, or drag with the mouse to look around');

  const base = drawBaseMap(city);
  const state = {
    lines: [],
    lineTime: 0,
    toastTime: 0,
    toasts: [],
    bannerTime: 0,
    districtTime: 0,
    lastDistrict: null,
    carTime: 0,
    objectiveText: '',
  };

  function showLine() {
    const line = state.lines[0];
    if (!line) {
      subtitle.classList.remove('show');
      return;
    }
    subtitle.innerHTML = '';
    el('span', 'who', subtitle, `${line.who}: `);
    el('span', 'what', subtitle, line.text);
    subtitle.classList.add('show');
    state.lineTime = Math.max(3, line.text.length * 0.06);
  }

  const api = {
    root: hud,
    base,
    say(who, text) {
      state.lines.push({ who, text });
      if (state.lines.length === 1) showLine();
    },
    clearLines() {
      state.lines.length = 0;
      showLine();
    },
    notify(text) {
      state.toasts.push(text);
      if (state.toasts.length === 1) {
        toast.textContent = text;
        toast.classList.add('show');
        state.toastTime = 5;
      }
    },
    objective(text) {
      state.objectiveText = text;
    },
    banner(title, kind, sub = '') {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.className = `hud-banner show ${kind}`;
      state.bannerTime = kind === 'countdown' ? 0.9 : kind === 'mission' ? 3 : 4.5;
    },
    /** Drops any banner and help toast at once (a scene change, a staged shot). */
    clearMessages() {
      state.bannerTime = 0;
      banner.classList.remove('show');
      state.toasts.length = 0;
      toast.classList.remove('show');
    },
    showCar(name, radio) {
      carName.textContent = name;
      carRadio.textContent = radio ? '♫ Palm FM 88.4' : 'Radio off';
      state.carTime = 4;
    },
    setVisible(on) {
      hud.classList.toggle('hidden', !on);
    },
    update(game, dt) {
      const p = game.player;
      const w = game.wanted;
      const minutes = Math.floor(game.clock) % (24 * 60);
      clock.textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      money.textContent = `$${Math.floor(p.money).toLocaleString('en-US')}`;
      const ri = rankInfo(game);
      rankName.textContent = `${ri.name.toUpperCase()} · ${ri.respect} RESPECT`;
      rankFill.style.width = `${Math.round(ri.progress * 100)}%`;
      const pop = game.respectPop;
      rankPop.classList.toggle('show', Boolean(pop && pop.time > 0));
      if (pop && pop.time > 0) rankPop.textContent = `+${pop.amount} RESPECT  ${pop.reason}`;
      for (const s of slots) {
        const owned = p.ammo[s.id];
        setClass(s.slot, s.id === p.weapon ? 'slot on' : owned ? 'slot' : 'slot locked');
        setText(s.ammo, !owned ? 'LOCKED' : WEAPONS[s.id].melee ? '∞' : String(owned.mag + owned.reserve));
      }
      const wdef = WEAPONS[p.weapon];
      const a = p.ammo[p.weapon];
      setText(ammo, wdef.melee ? `${wdef.name.toUpperCase()} · MELEE` : p.reload > 0 ? `${wdef.name.toUpperCase()} · RELOADING…` : `${wdef.name.toUpperCase()} · ${a.mag} / ${a.reserve}`);
      const flash = w.level > 0 && !w.seen && Math.floor(game.time * 3) % 2 === 0;
      starEls.forEach((s, n) => {
        s.classList.toggle('on', n < w.level);
        s.classList.toggle('dim', n < w.level && flash);
      });
      updateWantedPanels(game);
      healthFill.style.width = `${Math.max(0, (p.health / p.maxHealth) * 100)}%`;
      healthBar.classList.toggle('low', p.health < 30);
      armorFill.style.width = `${Math.max(0, p.armor)}%`;
      armorBar.style.visibility = p.armor > 0 ? 'visible' : 'hidden';

      updateJobCards(game);

      if (state.lines.length) {
        state.lineTime -= dt;
        if (state.lineTime <= 0) {
          state.lines.shift();
          showLine();
        }
      }
      if (state.toasts.length) {
        state.toastTime -= dt;
        if (state.toastTime <= 0) {
          state.toasts.shift();
          if (state.toasts.length) {
            toast.textContent = state.toasts[0];
            state.toastTime = 5;
          } else toast.classList.remove('show');
        }
      }
      if (state.bannerTime > 0) {
        state.bannerTime -= dt;
        if (state.bannerTime <= 0) banner.classList.remove('show');
      }
      const dName = game.city.districtAt(p.x, p.z);
      if (dName !== state.lastDistrict) {
        state.lastDistrict = dName;
        districtName.textContent = DISTRICTS[dName].name;
        districtTag.textContent = DISTRICTS[dName].tag;
        district.classList.add('show');
        state.districtTime = 4;
      }
      if (state.districtTime > 0) {
        state.districtTime -= dt;
        if (state.districtTime <= 0) district.classList.remove('show');
      }
      if (p.vehicle) {
        car.classList.add('show');
        carSpeed.textContent = `${Math.round(Math.abs(p.vehicle.fwd) * 3.6)} km/h`;
        carName.style.opacity = state.carTime > 0 ? 1 : 0.55;
        state.carTime -= dt;
      } else car.classList.remove('show');
      crosshair.classList.toggle('show', Boolean(p.aiming && !p.vehicle) || (p.vehicle && p.weapon !== 'fists' && game.input && game.input.mouse.right));
      const input = game.input;
      if (input && game.mode === 'play' && input.mode === 'capture' && !input.locked) {
        mouseHint.textContent = 'Click the game to capture the mouse, or drag to look around  ·  C: camera mode';
        mouseHint.classList.add('show');
      } else if (input && game.mode === 'play' && input.mode === 'hold' && game.time - (game.playStartedAt ?? 0) < 20) {
        mouseHint.textContent = 'Hold the right mouse button to look around  ·  C: camera mode';
        mouseHint.classList.add('show');
      } else mouseHint.classList.remove('show');
      drawMinimap(mapCanvas, base, game);
    },
  };

  /** The mission card, and the race card while a street race runs. */
  function updateJobCards(game) {
    const m = game.story.active;
    mission.classList.toggle('show', Boolean(m));
    if (m) {
      const def = m.def;
      const stages = stagesOf(def);
      let stage = 0;
      while (stage < stages.length && stages[stage] <= m.step) stage += 1;
      const next = stages.find((n) => n > m.step);
      setText(missionNo, `MISSION ${m.index + 1}/${STORY.length}`);
      setText(missionTitle, def.title.toUpperCase());
      setText(missionGiver, def.intro ? `· ${def.intro[0][0]}` : '');
      setText(missionTimer, m.timer > 0 ? `⏱ ${clockText(m.timer)}` : '');
      setText(missionObjective, state.objectiveText || def.steps[stages[Math.max(0, stage - 1)]]?.text || '');
      setText(missionStageNo, `STAGE ${Math.max(1, stage)}/${stages.length}`);
      setSegments(missionSegs, stages.length, Math.max(1, stage) - 1);
      setText(missionPay, `PAYS $${def.reward.toLocaleString('en-US')}`);
      missionNext.classList.toggle('off', next === undefined);
      setText(missionNextText, next === undefined ? '' : def.steps[next].text);
    }
    const rs = raceStatus(game);
    raceCard.classList.toggle('show', Boolean(rs));
    if (!rs) return;
    setText(raceTitle, rs.name.toUpperCase());
    setText(raceTime, `⏱ ${rs.time}`);
    raceObjective.classList.toggle('off', Boolean(m));
    const goal = state.objectiveText.replace(`${rs.name}: `, '');
    setText(raceObjective, m ? '' : goal.charAt(0).toUpperCase() + goal.slice(1));
    setText(racePos, `${rs.position}/${rs.of}`);
    setText(raceCp, `CHECKPOINT ${rs.cp}/${rs.cps}`);
    setSegments(raceSegs, rs.cps, rs.cp - 1);
    setText(racePrize, rs.prize ? `PRIZE $${rs.prize.toLocaleString('en-US')}` : 'FOR THE JOB');
    const me = rs.order.findIndex((r) => r.player);
    const mine = rs.order[me].car;
    for (let n = 0; n < raceRows.length; n += 1) {
      const r = rs.order[n];
      const e = raceRows[n];
      setClass(e.row, !r ? 'row off' : r.player ? 'row me' : 'row');
      if (!r) continue;
      setText(e.place, String(n + 1));
      setText(e.name, r.player ? 'YOU' : r.name.toUpperCase());
      setText(e.car, r.car.spec.name);
      const gap = Math.round(Math.hypot(r.car.x - mine.x, r.car.z - mine.z));
      setText(e.gap, r.player ? '' : r.out ? 'OUT' : r.done ? 'FINISHED' : `${gap} m ${n < me ? 'AHEAD' : 'BEHIND'}`);
    }
  }

  /** IN SIGHT / HIDDEN by the stars, and the dispatch board of every unit on the call. */
  function updateWantedPanels(game) {
    const w = game.wanted;
    seen.classList.toggle('show', w.level > 0);
    dispatchBox.classList.toggle('show', w.level > 0);
    if (w.level === 0) return;
    const heli = game.heli;
    const escape = escapeTime(game);
    setText(seenTag, w.seen ? 'IN SIGHT' : 'HIDDEN');
    setClass(seenTag, w.seen ? 'tag red' : 'tag blue');
    setText(seenWhy, heli && heli.spotting ? 'Air 1 has you in the light' : w.seen ? 'Cops have eyes on you' : escape !== null ? `Lost in ${Math.ceil(escape)}s if they stay blind` : 'The job keeps the heat on');
    const d = dispatchRows(game);
    setText(dispatchCount, `${d.units ? `${d.units} UNIT${d.units === 1 ? '' : 'S'}` : 'UNITS EN ROUTE'} · ${w.level}★`);
    for (let n = 0; n < DISPATCH_ROWS; n += 1) {
      const r = d.rows[n];
      const e = dispatchEls[n];
      setClass(e.row, r ? `row ${r.kind}` : 'row off');
      if (!r) continue;
      setText(e.icon, UNIT_ICON[r.kind]);
      setText(e.name, r.name);
      setText(e.dist, `${Math.round(r.dist)} m`);
      setText(e.tag, r.tag);
      setClass(e.tag, `tag ${TAG_CLASS[r.tag]}`);
    }
    const more = d.units - DISPATCH_ROWS;
    const p = game.player;
    const suspect = p.vehicle ? `suspect in a ${p.vehicle.spec.name}` : 'suspect on foot';
    setText(dispatchFoot, `${more > 0 ? `+${more} more · ` : ''}${d.roadblocks ? 'roadblock set · ' : ''}${suspect}`);
  }
  return api;
}

function blipShape(g, x, y, color, shape, size = 6) {
  g.fillStyle = color;
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.beginPath();
  if (shape === 'spot') {
    g.fillStyle = 'rgba(255,240,160,0.45)';
    g.arc(x, y, size, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (shape === 'heli') {
    g.arc(x, y, size, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = '#fff';
    g.beginPath();
    g.moveTo(x - size - 4, y - size - 4);
    g.lineTo(x + size + 4, y + size + 4);
    g.moveTo(x + size + 4, y - size - 4);
    g.lineTo(x - size - 4, y + size + 4);
    g.stroke();
    return;
  }
  if (shape === 'square') g.rect(x - size, y - size, size * 2, size * 2);
  else if (shape === 'diamond') {
    g.moveTo(x, y - size - 2);
    g.lineTo(x + size + 2, y);
    g.lineTo(x, y + size + 2);
    g.lineTo(x - size - 2, y);
    g.closePath();
  } else g.arc(x, y, size, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

/** Every blip the maps show, in world coordinates. */
export function mapBlips(game) {
  const out = [];
  const m = game.story.active;
  const next = nextMissionMarker(game);
  if (next) out.push({ x: next.x, z: next.z, color: '#ffd23f', shape: 'diamond', label: 'M', edge: true });
  if (m && m.target) out.push({ x: m.target.x, z: m.target.z, color: `#${m.target.color.toString(16).padStart(6, '0')}`, shape: 'diamond', edge: true });
  if (m && m.extraBlips) for (const b of m.extraBlips) out.push({ x: b.x, z: b.z, color: `#${b.color.toString(16).padStart(6, '0')}`, shape: 'circle', size: b.small ? 4 : 6, edge: !b.small });
  for (const r of raceMarkers(game)) out.push({ x: r.x, z: r.z, color: '#ff8c1a', shape: 'square', label: 'R', size: 6 });
  const rs = raceStatus(game);
  if (rs) {
    out.push({ x: rs.next[0], z: rs.next[1], color: '#ff8c1a', shape: 'diamond', edge: true });
    if (rs.after) out.push({ x: rs.after[0], z: rs.after[1], color: '#ffc47a', shape: 'circle', size: 4 });
    for (const r of game.race.racers) if (!r.player && !r.done) out.push({ x: r.car.x, z: r.car.z, color: '#ffffff', shape: 'circle', size: 4 });
  }
  const s = game.city.pois.safehouse;
  out.push({ x: s.x, z: s.z, color: '#4dff88', shape: 'square', label: 'S', size: 5 });
  const paint = game.city.pois.paint;
  out.push({ x: paint.x, z: paint.z, color: '#ff5fd2', shape: 'square', label: 'P', size: 5 });
  if (game.garageBeacon) out.push({ x: game.garageBeacon.x, z: game.garageBeacon.z, color: '#b4ff3f', shape: 'square', label: 'G', size: 5 });
  const shop = game.city.pois.shop;
  out.push({ x: shop.x, z: shop.z, color: '#3fd0ff', shape: 'square', label: '$', size: 5 });
  const flash = Math.floor(game.time * 4) % 2 === 0;
  const heli = game.heli;
  if (heli && heli.active && !heli.down) {
    out.push({ x: heli.spot.x, z: heli.spot.z, shape: 'spot', size: 8 });
    out.push({ x: heli.x, z: heli.z, color: flash ? '#ff3030' : '#3060ff', shape: 'heli', size: 5, edge: true });
  }
  for (const rb of game.roadblocks ?? []) out.push({ x: rb.x, z: rb.z, color: '#ff9f1a', shape: 'square', label: '!', size: 6, edge: true });
  for (const v of game.vehicles) if (v.spec.police && v.siren) out.push({ x: v.x, z: v.z, color: flash ? '#ff3030' : '#3060ff', shape: 'square', size: 4 });
  for (const c of game.chars) if (c.kind === 'cop' && c.alive && !c.vehicle && game.wanted.level > 0) out.push({ x: c.x, z: c.z, color: flash ? '#ff3030' : '#3060ff', shape: 'circle', size: 3 });
  return out;
}

function drawMinimap(canvas, base, game) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const R = W / 2;
  const p = game.player;
  const px = p.vehicle ? p.vehicle.x : p.x;
  const pz = p.vehicle ? p.vehicle.z : p.z;
  const speed = p.vehicle ? Math.abs(p.vehicle.fwd) : 0;
  const scale = 1.55 - Math.min(0.6, speed / 40);
  const rot = game.rig.yaw - Math.PI;
  g.clearRect(0, 0, W, W);
  g.save();
  g.beginPath();
  g.arc(R, R, R - 3, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#3c8fb5';
  g.fillRect(0, 0, W, W);
  g.translate(R, R);
  g.rotate(rot);
  g.scale(scale, scale);
  g.drawImage(base, MAP_X0 - px, MAP_Z0 - pz);
  g.restore();

  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const toMap = (x, z) => {
    const dx = (x - px) * scale;
    const dz = (z - pz) * scale;
    return { x: R + dx * cos - dz * sin, y: R + dx * sin + dz * cos };
  };
  for (const b of mapBlips(game)) {
    let q = toMap(b.x, b.z);
    const ox = q.x - R;
    const oy = q.y - R;
    const d = Math.hypot(ox, oy);
    if (d > R - 12) {
      if (!b.edge) continue;
      q = { x: R + (ox / d) * (R - 12), y: R + (oy / d) * (R - 12) };
    }
    blipShape(g, q.x, q.y, b.color, b.shape, b.size ?? 6);
    if (b.label) {
      g.fillStyle = '#111';
      g.font = 'bold 9px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.label, q.x, q.y + 0.5);
    }
  }
  // North marker on the rim.
  const nx = -sin;
  const ny = -cos;
  g.fillStyle = '#fff';
  g.strokeStyle = '#111';
  g.lineWidth = 3;
  g.font = 'bold 13px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeText('N', R + nx * (R - 12), R + ny * (R - 12));
  g.fillText('N', R + nx * (R - 12), R + ny * (R - 12));
  // The player's arrow, turned to where they face.
  const yaw = p.vehicle ? p.vehicle.yaw : p.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const ax = fx * cos - fz * sin;
  const ay = fx * sin + fz * cos;
  g.save();
  g.translate(R, R);
  g.rotate(Math.atan2(ay, ax) + Math.PI / 2);
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(7, 7);
  g.lineTo(0, 3);
  g.lineTo(-7, 7);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.fill();
  g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(R, R, R - 3, 0, Math.PI * 2);
  g.stroke();
  void PALETTE;
}

/** The whole city with every blip, fitted into `canvas` (the pause menu's map). */
export function drawFullMap(canvas, base, game) {
  const g = canvas.getContext('2d');
  const s = Math.min(canvas.width / MAP_W, canvas.height / MAP_H);
  g.fillStyle = '#3c8fb5';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const ox = (canvas.width - MAP_W * s) / 2;
  const oy = (canvas.height - MAP_H * s) / 2;
  g.drawImage(base, ox, oy, MAP_W * s, MAP_H * s);
  const toMap = (x, z) => ({ x: ox + (x - MAP_X0) * s, y: oy + (z - MAP_Z0) * s });
  g.font = 'bold 15px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  const labels = [['SUNSET BEACH', -38, 120], ['NEON STRIP', 120, 150], ['DOWNTOWN', 296, 260], ['CORAL HEIGHTS', 480, 70], ['SALTMARSH DOCKS', 300, 560], ['LUCKY SEVEN PIER', -96, 322], ['NEON STRIP', 470, 420]];
  for (const [text, x, z] of labels) {
    const q = toMap(x, z);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.strokeText(text, q.x, q.y);
    g.fillStyle = '#fff';
    g.fillText(text, q.x, q.y);
  }
  for (const b of mapBlips(game)) {
    const q = toMap(b.x, b.z);
    blipShape(g, q.x, q.y, b.color, b.shape, (b.size ?? 6) * 1.2);
    if (b.label) {
      g.fillStyle = '#111';
      g.font = 'bold 10px sans-serif';
      g.textBaseline = 'middle';
      g.fillText(b.label, q.x, q.y + 0.5);
    }
  }
  const p = game.player;
  const q = toMap(p.vehicle ? p.vehicle.x : p.x, p.vehicle ? p.vehicle.z : p.z);
  g.save();
  g.translate(q.x, q.y);
  const yaw = p.vehicle ? p.vehicle.yaw : p.yaw;
  g.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2);
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(8, 8);
  g.lineTo(0, 4);
  g.lineTo(-8, 8);
  g.closePath();
  g.fillStyle = '#fff';
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  g.fill();
  g.stroke();
  g.restore();
}
