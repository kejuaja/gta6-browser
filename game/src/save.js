// Saving and loading in this browser's localStorage: the story's progress, money, weapons,
// health and armour, tokens found, stats and where the player stood. Settings are kept apart.
import { SAVE_KEY, SETTINGS_KEY } from './config.js';

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage can be off (a private window): the game then lasts this visit only.
    return false;
  }
}

export function snapshot(game) {
  const p = game.player;
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    story: game.story.index,
    money: p.money,
    health: Math.max(30, Math.round(p.health)),
    armor: Math.round(p.armor),
    ammo: p.ammo,
    weapon: p.weapon,
    tokens: game.progress.tokens,
    stats: game.stats,
    garageCar: game.garageCar ?? null,
    at: game.city.pois.safehouse,
  };
}

export function saveGame(game) {
  return write(SAVE_KEY, snapshot(game));
}

export function loadSave() {
  const s = read(SAVE_KEY);
  return s && s.version === 1 ? s : null;
}

export function loadSettings() {
  return { volume: 0.7, music: 0.5, sensitivity: 1, effects: true, camera: 'hold', ...(read(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}
