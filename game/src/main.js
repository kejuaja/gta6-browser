// Boot and the one loop. The world advances in fixed 1/60 s steps (several in a slow frame,
// none in a fast one); the camera, HUD and sound follow once a frame; then the frame renders.
// The game moves between title, play, paused, dead/busted and credits.
//
// ?seed=N fixes the city's traffic and crowds. ?shot=chase|shootout|pursuit|beach|title stages that
// scene instead of the menus (see shots.js) and sets window.__shotReady once it is painted.
import { STEP } from './config.js';
import { createInput } from './input.js';
import { createGame, startGame, startTitle, stepGame, frameGame } from './world.js';
import { createMenus } from './menus.js';
import { loadSave, saveSettings } from './save.js';
import { stageShot } from './shots.js';
import { createPostFx } from './postfx.js';
import { SHOP_ITEMS, canBuy, buy } from './shop.js';
import { UPGRADES, canUpgrade, buyUpgrade } from './garage.js';
import { detectRenderer, createQualityGovernor } from './quality.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const status = document.getElementById('status');
const game = createGame(canvas, ui, seed);
const input = createInput(canvas);
game.input = input;

/** Hold (camera turns only while the right button is held, and follows you) or capture (mouse look). */
function applyCameraMode() {
  input.setMode(game.settings.camera);
  game.rig.autoFollow = game.settings.camera !== 'capture';
}
applyCameraMode();
// A handle for play-testing from the browser console.
window.__palmera = game;
const { renderer, scene, camera } = game.three;
const postfx = createPostFx(renderer);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  postfx.setSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// Graphics quality: start light when the browser is not using the graphics card, and step down
// on its own whenever the frame rate stays low.
const gpu = detectRenderer(renderer);
const quality = createQualityGovernor(gpu.software ? 2 : 0, (level) => {
  postfx.enabled = level.postfx && game.settings.effects !== false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level.pixelRatio));
  const sun = game.cs.lights.sun;
  sun.castShadow = level.shadows;
  if (sun.shadow.mapSize.x !== level.shadowSize) {
    sun.shadow.mapSize.set(level.shadowSize, level.shadowSize);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  resize();
}, (level, fps) => {
  game.hud.notify(`The game was running slowly (${Math.round(fps)} fps), so graphics were lowered to "${level.label}".`);
});
resize();

if (gpu.software) {
  const warn = document.createElement('div');
  warn.className = 'gpu-warning';
  warn.innerHTML = 'Your browser is drawing this game <b>without your graphics card</b>, so it will be slow.<br>In Chrome: Settings → System → turn on <b>"Use graphics acceleration when available"</b>, then restart Chrome.';
  warn.addEventListener('click', () => warn.remove());
  document.body.appendChild(warn);
}

function announce(text) {
  status.textContent = text;
}

let hadLock = false;

const menus = createMenus(ui, {
  settings: game.settings,
  onNewGame() {
    begin(null);
    announce('New game. Find a car and drive to the diner on Sunset Beach.');
  },
  onContinue() {
    begin(loadSave());
    announce('Game loaded at the safehouse.');
  },
  onResume() {
    resume();
  },
  onSave() {
    if (game.wanted.level === 0) game.saveGame();
    menus.showPause(game);
  },
  onQuit() {
    menus.hidePause();
    startTitle(game);
    menus.showTitle(Boolean(loadSave()));
    announce('Title screen.');
  },
  onSettings(settings) {
    saveSettings(settings);
    game.audio.setVolume(settings.volume, settings.music);
    game.rig.sensitivity = 0.0024 * settings.sensitivity;
    postfx.enabled = settings.effects !== false && quality.level.postfx;
    applyCameraMode();
  },
  shopItems: SHOP_ITEMS,
  canBuy,
  onBuy(item) {
    return buy(game, item);
  },
  onCloseShop() {
    closeShop();
  },
  garageItems: UPGRADES,
  canUpgrade,
  onUpgrade(item) {
    return buyUpgrade(game, item);
  },
  onCloseGarage() {
    closeGarage();
  },
  onCreditsDone() {
    menus.hideCredits();
    game.mode = 'play';
    input.lock();
  },
});
game.menus = menus;
game.onCredits = () => {
  game.mode = 'credits';
  input.unlock();
  menus.showCredits();
};

/** Leaves the title for play (a fresh story, or `save`); sound and the mouse are extras that may fail. */
function begin(save) {
  menus.hideTitle();
  try {
    startGame(game, save);
  } catch (err) {
    game.mode = 'play';
    showError(err);
  }
  try {
    game.audio.unlock();
  } catch (err) {
    console.warn('No sound:', err);
  }
  input.lock();
}

/** The shop is a menu: the world waits while you browse. */
game.openShop = () => {
  if (game.mode !== 'play') return;
  game.mode = 'shop';
  input.unlock();
  menus.showShop(game);
  announce('Bay Arms. Choose an item to buy, or Esc to leave.');
};
/** Dex's garage works like the shop: the world waits while you pick upgrades. */
game.openGarage = () => {
  if (game.mode !== 'play') return;
  game.mode = 'garage';
  input.unlock();
  menus.showGarage(game);
  announce("Dex's Garage. Choose an upgrade, or Esc to drive out.");
};
function closeGarage() {
  menus.hideGarage();
  game.mode = 'play';
  input.lock();
}
function closeShop() {
  menus.hideShop();
  game.mode = 'play';
  input.lock();
}

function pause() {
  if (game.mode !== 'play') return;
  game.mode = 'paused';
  input.unlock();
  menus.showPause(game);
  announce('Paused.');
}

function resume() {
  menus.hidePause();
  game.mode = 'play';
  input.lock();
  announce('Playing.');
}

let lockedSince = 0;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  // Esc releases the mouse and pauses; a lock the browser drops at once (a refused or flaky lock)
  // does not, or the game would pause itself the moment it starts.
  if (!locked && hadLock && game.mode === 'play' && performance.now() - lockedSince > 600) pause();
  if (locked) lockedSince = performance.now();
  hadLock = locked;
});

/** Any error shows on screen (and the game keeps running) rather than freezing the picture silently. */
let errorBox = null;
function showError(err) {
  const text = err && err.message ? `${err.message}\n${(err.stack || '').split('\n').slice(1, 4).join('\n')}` : String(err);
  console.error(err);
  if (!errorBox) {
    errorBox = document.createElement('div');
    errorBox.className = 'error-box';
    errorBox.title = 'Click to hide';
    errorBox.addEventListener('click', () => errorBox.remove());
    document.body.appendChild(errorBox);
  }
  if (!document.body.contains(errorBox)) document.body.appendChild(errorBox);
  errorBox.textContent = `Palmera Bay hit an error (the game keeps running):\n${text}`;
}
game.onError = showError;
window.addEventListener('error', (e) => showError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));
canvas.addEventListener('click', () => {
  if (game.mode === 'play') input.lock();
  game.audio.unlock();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function handleKeys() {
  if (game.mode === 'play') {
    if (input.pressed('Escape') || input.pressed('KeyP')) pause();
    else if (input.pressed('KeyM') || input.pressed('Tab')) pause();
    else if (input.pressed('KeyC')) {
      game.settings.camera = game.settings.camera === 'capture' ? 'hold' : 'capture';
      saveSettings(game.settings);
      applyCameraMode();
      if (game.settings.camera === 'capture') input.lock();
      game.hud.notify(game.settings.camera === 'capture' ? 'Camera: mouse look (the camera follows the mouse; Esc frees it).' : 'Camera: hold the right mouse button to look around; it follows you when you walk.');
    } else if (input.pressed('KeyQ')) {
      game.radioChosen = true;
      const on = game.audio.toggleRadio();
      if (game.player.vehicle) game.hud.showCar(game.player.vehicle.spec.name, on);
    }
  } else if (game.mode === 'paused' && (input.pressed('Escape') || input.pressed('KeyP'))) resume();
  else if (game.mode === 'shop' && input.pressed('Escape')) closeShop();
  else if (game.mode === 'garage' && input.pressed('Escape')) closeGarage();
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleKeys();
  const running = game.mode === 'play' || game.mode === 'title' || game.mode === 'dead' || game.mode === 'busted';
  if (running && !document.hidden) quality.sample(dt);
  // Each stage guarded on its own: one failing system must not stop the others or the picture.
  try {
    if (running) {
      accumulator += dt;
      let stepped = false;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        stepGame(game, STEP, input);
        if (!stepped) input.clearPresses();
        stepped = true;
      }
    } else {
      accumulator = 0;
      input.clearPresses();
    }
  } catch (err) {
    accumulator = 0;
    input.clearPresses();
    showError(err);
  }
  try {
    frameGame(game, running ? dt : 0, input.mouse);
  } catch (err) {
    showError(err);
  }
  input.clearMotion();
  postfx.render(scene, camera);
}

if (shot) {
  // A staged scene has no live mouse: no capture hint over the picture.
  game.input = null;
  stageShot(game, shot, menus).then(() => {
    postfx.render(scene, camera);
    requestAnimationFrame(() => {
      postfx.render(scene, camera);
      window.__shotReady = true;
    });
  });
} else {
  startTitle(game);
  menus.showTitle(Boolean(loadSave()));
  announce('Palmera Bay. Choose New Game to start.');
  requestAnimationFrame(frame);
}
