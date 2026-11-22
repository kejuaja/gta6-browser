// The HUD, HTML read from the game's state each frame: money, clock, stars with IN SIGHT / HIDDEN,
// police dispatch board, mission and race cards, rank, weapon bar, car block (speed, condition,
// radio), health, armour, subtitles with portraits, banners, toasts. citymap.js draws the minimap.
import { rankInfo, RANKS } from './respect.js';
import { STORY } from './missions.js';
import { dispatchRows, escapeTime } from './police.js';
import { WEAPONS, WEAPON_ORDER, DISTRICTS } from './config.js';
import { raceStatus } from './races.js';
import { drawBaseMap, drawMinimap } from './citymap.js';


/** Dispatch tags and their colours, the same in every scene. */
const TAG_CLASS = { RAMMING: 'red', FIRING: 'fire', SPOTLIGHT: 'blue', SEARCHING: 'slate', RETURNING: 'slate', 'CLOSING IN': 'teal', PURSUIT: 'indigo', ROADBLOCK: 'amber', 'ON FOOT': 'purple' };
const UNIT_ICON = { air: '✚', car: '▰', foot: '●' };
const DISPATCH_ROWS = 5;

/** The weapon bar's side-on silhouettes (40 x 20 SVG paths). */
const WEAPON_ICON = {
  fists: 'M11 6h17a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3zM7 9h5v6H7a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z',
  pistol: 'M6 5h27v5H17l-2 9H9l2-9H6zM33 6h2v3h-2z',
  smg: 'M2 6h34v5h-8l-1 3h-4l-1-3h-4l-2 8H9l2-8H2zM22 11h4v8h-4zM36 7h3v2h-3z',
  shotgun: 'M1 7h38v3H17l-7 6H3l5-6H1zM20 10h12v2H20z',
};

/** The subtitle box's cast: [name, role, CSS portrait colours (backdrop skin hair shirt), long hair]. */
const CAST = {
  Nico: ['Nico Reyes', 'YOU · BACK FROM THE DEAD', '#2a6f97 #c68863 #1b1b1b #ff8a3d'],
  'Mama Lucia': ['Mama Lucia', "NICO'S AUNT · LUCIA'S DINER", '#ff6fa5 #b97a57 #8a8a8a #fff', 1],
  Dex: ['Dex', "MECHANIC · DEX'S GARAGE", '#5f8f1f #6b4329 #ff9f1a #3d5a80'],
  Val: ['Val', 'OWNER · THE VELVET MOON', '#7b2cbf #e0b18e #b0172f #151515', 1],
  'Nurse Okoro': ['Nurse Okoro', 'HOSPITAL NURSE', '#3fb6dc #5a3825 #111 #9fe3c6'],
  'Sgt. Brannigan': ['Sgt. Brannigan', "DIRTY COP · VOSS'S MAN IN PBPD", '#1d3557 #f1c7a6 #10182a #22304a'],
  Rico: ['Rico Vance', "VOSS'S NEPHEW · STRIP RACER", '#ffb000 #d9a074 #3b2314 #e63946'],
};
CAST['Rico Vance'] = CAST.Rico;

/** A mission's stages: the steps with an objective, listed once per mission. */
const stageCache = new Map();
function stagesOf(def) {
  if (!stageCache.has(def)) stageCache.set(def, def.steps.flatMap((step, n) => (step.text ? [n] : [])));
  return stageCache.get(def);
}

function clockText(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/** A segmented bar: `total` segments, the first `done` lit, the next one current. */
function setSegments(box, total, done) {
  while (box.children.length < total) el('i', '', box);
  for (let n = 0; n < box.children.length; n += 1) setClass(box.children[n], n >= total ? 'off' : n < done ? 'done' : n === done ? 'now' : '');
}

/** 12,345: money, respect and prizes. */
const num = (n) => n.toLocaleString('en-US');

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

/** Several children at once, listed as tag.class.class; returns them in order. */
function kids(parent, spec) {
  return spec.split(' ').map((k) => {
    const [tag, ...cls] = k.split('.');
    return el(tag, cls.join(' '), parent);
  });
}

export function createHud(root, city) {
  const hud = el('div', 'hud', root);
  const top = el('div', 'hud-top', hud);
  const clock = el('div', 'hud-clock', top);
  const money = el('div', 'hud-money', top);
  // The rank block: number, name, respect toward the next rank.
  const rank = el('div', 'hud-rankblock', top);
  const [rankNo, rankText] = kids(rank, 'div.no div.text');
  const [rankHead, rankBar, rankFoot] = kids(rankText, 'div.line div.rank-bar div.line.small');
  const [rankName, rankOf] = kids(rankHead, 'span.name span.of');
  const rankFill = el('div', 'fill', rankBar);
  const [rankPoints, rankNext] = kids(rankFoot, 'span.points span.next');
  const rankPop = el('div', 'hud-rank-pop', top);
  // The weapon bar: slots numbered as the keys pick them, the one in hand lit, unbought ones LOCKED.
  const weapons = el('div', 'hud-weapons', top);
  const slots = WEAPON_ORDER.map((id, n) => {
    const slot = el('div', 'slot', weapons);
    el('span', 'key', slot, String(n + 1));
    slot.insertAdjacentHTML('beforeend', `<svg class="icon" viewBox="0 0 40 20"><path d="${WEAPON_ICON[id]}"/></svg>`);
    el('span', 'wname', slot, WEAPONS[id].name.replace(' SMG', '').toUpperCase());
    return { id, slot, ammo: el('span', 'ammo', slot) };
  });
  const ammo = el('div', 'hud-ammo', top);
  const stars = el('div', 'hud-stars', top);
  const starEls = [];
  for (let n = 0; n < 5; n += 1) starEls.push(el('span', 'star', stars, '★'));
  const seen = el('div', 'hud-seen', top);
  const [seenTag, seenWhy] = kids(seen, 'span.tag span.why');

  // The left column: panels stack and close up when one has nothing to say.
  const left = el('div', 'hud-left', hud);
  // The mission card: which job, whose, the objective, its stage and what comes next.
  const mission = el('div', 'hud-panel hud-mission', left);
  const [missionHead, missionObjective, missionStage, missionNext] = kids(mission, 'div.head div.objective div.stage div.next');
  const [missionNo, missionTitle, missionGiver, missionTimer] = kids(missionHead, 'span.badge span.title span.giver span.timer');
  const [missionStageNo, missionSegs, missionPay] = kids(missionStage, 'span.label span.segs span.pay');
  el('span', 'k', missionNext, 'NEXT');
  const missionNextText = el('span', 'v', missionNext);
  // The race card: name, position, checkpoints, prize and every racer's place.
  const raceCard = el('div', 'hud-panel hud-racecard', left);
  const [raceHead, raceObjective, raceStage] = kids(raceCard, 'div.head div.objective div.stage');
  el('span', 'badge', raceHead, 'RACE');
  const [raceTitle, raceTime] = kids(raceHead, 'span.title span.timer');
  const [racePos, raceCp, raceSegs, racePrize] = kids(raceStage, 'span.pos span.label span.segs span.pay');
  const raceRows = [0, 1, 2, 3].map(() => {
    const row = el('div', 'row', raceCard);
    const [place, name, car, gap] = kids(row, 'span.place span.name span.car span.gap');
    return { row, place, name, car, gap };
  });
  const dispatchBox = el('div', 'hud-panel hud-dispatch', left);
  const dispatchHead = el('div', 'head', dispatchBox);
  el('span', 'title', dispatchHead, 'PBPD DISPATCH');
  const dispatchCount = el('span', 'count', dispatchHead);
  const dispatchEls = Array.from({ length: DISPATCH_ROWS }, () => {
    const row = el('div', 'row', dispatchBox);
    const [icon, name, dist, tag] = kids(row, 'span.icon span.name span.dist span.tag');
    return { row, icon, name, dist, tag };
  });
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
  const [portrait, lineBox] = kids(subtitle, 'div.portrait div.body');
  const portraitInitials = kids(portrait, 'div.shirt div.initials div.hair-back div.head div.hair')[1];
  const [lineWho, lineText] = kids(lineBox, 'div.who div.what');
  const [lineName, lineRole] = kids(lineWho, 'span.name span.role');
  const banner = el('div', 'hud-banner', hud);
  const bannerTitle = el('div', 'title', banner);
  const bannerSub = el('div', 'sub', banner);
  const toast = el('div', 'hud-toast', hud);
  const district = el('div', 'hud-district', hud);
  const districtName = el('div', 'name', district);
  const districtTag = el('div', 'tag', district);
  // The car block: name, speed, CONDITION from its health, the radio.
  const car = el('div', 'hud-car', hud);
  const [carName, carSpeedBox, carCond, carBar, carState, carRadio] = kids(car, 'div.name div.speed div.cond div.cbar span.tag.state div.radio');
  const carSpeed = el('span', 'n', carSpeedBox);
  el('span', 'u', carSpeedBox, 'KM/H');
  el('span', 'k', carCond, 'CONDITION');
  const carPct = el('span', 'pct', carCond);
  const carFill = el('div', 'fill', carBar);
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
    const who = CAST[line.who];
    setText(lineName, who ? who[0] : line.who);
    setText(lineRole, who ? who[1] : '');
    setText(lineText, line.text);
    setText(portraitInitials, who ? '' : line.who.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase());
    const [bg, skin, hair, shirt] = (who ? who[2] : '#555a66 #0000 #0000 #0000').split(' ');
    portrait.style.cssText = `--bg:${bg};--skin:${skin};--hair:${hair};--shirt:${shirt}`;
    portrait.classList.toggle('long', Boolean(who && who[3]));
    portrait.classList.toggle('face', Boolean(who));
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
    /** Lights the radio line for a moment (getting in, Q). */
    showCar() {
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
      setText(rankNo, String(ri.rank + 1));
      setText(rankName, ri.name.toUpperCase());
      setText(rankOf, `RANK ${ri.rank + 1}/${RANKS.length}`);
      setText(rankPoints, `${num(ri.respect)}${ri.next ? ` / ${num(RANKS[ri.rank + 1].at)}` : ''} RESPECT`);
      setText(rankNext, ri.next ? `▸ ${ri.next.toUpperCase()}` : 'TOP RANK');
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
      setText(ammo, `${wdef.name.toUpperCase()} · ${wdef.melee ? 'MELEE' : p.reload > 0 ? 'RELOADING…' : `${a.mag} / ${a.reserve}`}`);
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
      const v = p.vehicle;
      if (v) {
        // The word follows vehicles.js: smoke under 420 health, fire at 0.
        const pct = Math.max(0, Math.min(100, Math.round((v.health / v.maxHealth) * 100)));
        setText(carName, v.spec.name.toUpperCase());
        setText(carSpeed, String(Math.round(Math.abs(v.fwd) * 3.6)));
        setText(carPct, `${pct}%`);
        setText(carState, v.burn > 0 ? 'ON FIRE' : v.wrecked ? 'WRECKED' : v.health < 420 ? 'SMOKING' : pct >= 90 ? 'MINT' : pct >= 65 ? 'SCRATCHED' : 'DENTED');
        setClass(car, `hud-car show ${v.burn > 0 || pct < 35 ? 'red' : pct < 65 ? 'amber' : 'green'}`);
        carFill.style.width = `${pct}%`;
        setText(carRadio, game.audio?.radioOn ? '♫ PALM FM 88.4 · SYNTHWAVE · 104 BPM' : '♫ RADIO OFF · Q TO TUNE IN');
        setClass(carRadio, state.carTime > 0 ? 'radio new' : 'radio');
        state.carTime -= dt;
      } else setClass(car, 'hud-car');
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
      setText(missionPay, `PAYS $${num(def.reward)}`);
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
    setText(racePrize, rs.prize ? `PRIZE $${num(rs.prize)}` : 'FOR THE JOB');
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
