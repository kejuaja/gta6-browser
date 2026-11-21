// The heads-up display, drawn in HTML over the 3D view: a rotating minimap with blips, health
// and armour bars, money, clock, weapon and ammo, wanted stars, the mission objective and timer,
// subtitles, banners (mission passed, busted), help toasts, district names and the car's name,
// speed and radio station. Also draws the full city map for the pause menu.
import { WEAPONS, DISTRICTS, WORLD, PALETTE, GRID } from './config.js';
import { nextMissionMarker } from './missions.js';

const MAP_X0 = -180;
const MAP_Z0 = -60;
const MAP_W = 800;
const MAP_H = 740;
const DISTRICT_TINT = { beach: '#e9d7b4', downtown: '#9fb0c4', strip: '#d9a7c7', heights: '#a9d39a', docks: '#a8adb5' };

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
  const weapon = el('div', 'hud-weapon', top);
  const weaponName = el('div', 'hud-weapon-name', weapon);
  const ammo = el('div', 'hud-ammo', weapon);
  const stars = el('div', 'hud-stars', top);
  const starEls = [];
  for (let n = 0; n < 5; n += 1) starEls.push(el('span', 'star', stars, '★'));

  const mapBox = el('div', 'hud-map', hud);
  const mapCanvas = el('canvas', 'hud-minimap', mapBox);
  mapCanvas.width = 230;
  mapCanvas.height = 230;
  const bars = el('div', 'hud-bars', mapBox);
  const healthBar = el('div', 'bar health', bars);
  const healthFill = el('div', 'fill', healthBar);
  const armorBar = el('div', 'bar armor', bars);
  const armorFill = el('div', 'fill', armorBar);

  const objective = el('div', 'hud-objective', hud);
  const timer = el('div', 'hud-timer', hud);
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
      objective.textContent = text;
      objective.classList.toggle('show', Boolean(text));
    },
    banner(title, kind, sub = '') {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.className = `hud-banner show ${kind}`;
      state.bannerTime = kind === 'mission' ? 3 : 4.5;
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
      const wdef = WEAPONS[p.weapon];
      weaponName.textContent = wdef.name;
      const a = p.ammo[p.weapon];
      ammo.textContent = wdef.melee ? '' : p.reload > 0 ? 'Reloading...' : `${a.mag} / ${a.reserve}`;
      const flash = w.level > 0 && !w.seen && Math.floor(game.time * 3) % 2 === 0;
      starEls.forEach((s, n) => {
        s.classList.toggle('on', n < w.level);
        s.classList.toggle('dim', n < w.level && flash);
      });
      healthFill.style.width = `${Math.max(0, (p.health / p.maxHealth) * 100)}%`;
      healthBar.classList.toggle('low', p.health < 30);
      armorFill.style.width = `${Math.max(0, p.armor)}%`;
      armorBar.style.visibility = p.armor > 0 ? 'visible' : 'hidden';

      const m = game.story.active;
      if (m && m.timer > 0) {
        timer.textContent = `${Math.floor(m.timer / 60)}:${String(Math.floor(m.timer % 60)).padStart(2, '0')}`;
        timer.classList.add('show');
      } else timer.classList.remove('show');

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
  return api;
}

function blipShape(g, x, y, color, shape, size = 6) {
  g.fillStyle = color;
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.beginPath();
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
  const s = game.city.pois.safehouse;
  out.push({ x: s.x, z: s.z, color: '#4dff88', shape: 'square', label: 'S', size: 5 });
  const paint = game.city.pois.paint;
  out.push({ x: paint.x, z: paint.z, color: '#ff5fd2', shape: 'square', label: 'P', size: 5 });
  const shop = game.city.pois.shop;
  out.push({ x: shop.x, z: shop.z, color: '#3fd0ff', shape: 'square', label: '$', size: 5 });
  const flash = Math.floor(game.time * 4) % 2 === 0;
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
