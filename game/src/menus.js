// The menus: the title screen over a live view of the city, the pause menu (map, stats, controls,
// settings, save, quit), the wasted/busted fade and the end credits.
import { GAME_TITLE, GAME_SUBTITLE } from './config.js';
import { drawFullMap } from './hud.js';
import { STORY } from './missions.js';
import { TOKEN_SPOTS } from './pickups.js';

const CONTROLS = [
  ['W A S D', 'Walk / drive'],
  ['Hold right mouse', 'Look around (and aim)'],
  ['C', 'Camera: hold-to-look or full mouse look'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / handbrake'],
  ['F or Enter', 'Get in / out of a car (steal it)'],
  ['Left mouse', 'Shoot / punch'],
  ['Walk into a $ marker', 'Shop at Bay Arms'],
  ['1 2 3 4 / wheel', 'Switch weapon'],
  ['R', 'Reload'],
  ['H', 'Horn'],
  ['Q', 'Radio on / off'],
  ['M or Tab', 'City map'],
  ['Esc or P', 'Pause'],
];

function el(tag, cls, parent, text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function button(parent, text, onClick, cls = 'btn') {
  const b = el('button', cls, parent, text);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function controlsTable(parent) {
  const t = el('div', 'controls', parent);
  for (const [key, what] of CONTROLS) {
    const row = el('div', 'row', t);
    el('span', 'key', row, key);
    el('span', 'what', row, what);
  }
  return t;
}

export function createMenus(root, handlers) {
  // ---------------- title
  const title = el('div', 'menu title-screen', root);
  const logo = el('div', 'logo', title);
  el('div', 'logo-main', logo, GAME_TITLE.toUpperCase());
  el('div', 'logo-sub', logo, GAME_SUBTITLE);
  el('div', 'tagline', title, 'A city in the sun. A score to settle.');
  const list = el('div', 'menu-list', title);
  const cont = button(list, 'Continue', () => handlers.onContinue());
  button(list, 'New Game', () => handlers.onNewGame());
  const titleControls = el('div', 'menu-panel hidden', title);
  controlsTable(titleControls);
  button(list, 'Controls', () => titleControls.classList.toggle('hidden'));
  el('div', 'footer', title, 'Keyboard and mouse. Hold the right mouse button to look around (C switches to full mouse look), Esc to pause.');

  // ---------------- pause
  const pause = el('div', 'menu pause-screen hidden', root);
  const panel = el('div', 'pause-panel', pause);
  el('div', 'pause-title', panel, 'PAUSED');
  const tabs = el('div', 'tabs', panel);
  const pages = el('div', 'pages', panel);
  const mapPage = el('div', 'page', pages);
  const mapCanvas = el('canvas', 'full-map', mapPage);
  mapCanvas.width = 620;
  mapCanvas.height = 560;
  const legend = el('div', 'legend', mapPage);
  for (const [c, t] of [['#ffd23f', 'Mission'], ['#4dff88', 'Safehouse (save)'], ['#3fd0ff', 'Bay Arms (guns, armour)'], ['#ff5fd2', 'Paint Shack (lose cops, $100)'], ['#ff3030', 'Police']]) {
    const row = el('div', 'item', legend);
    el('span', 'dot', row).style.background = c;
    el('span', '', row, t);
  }
  const statsPage = el('div', 'page hidden', pages);
  const controlsPage = el('div', 'page hidden', pages);
  controlsTable(controlsPage);
  const settingsPage = el('div', 'page hidden', pages);
  const pageList = [['Map', mapPage], ['Stats', statsPage], ['Controls', controlsPage], ['Settings', settingsPage]];
  const tabButtons = pageList.map(([name, page]) => button(tabs, name, () => showPage(page), 'tab'));
  function showPage(page) {
    pageList.forEach(([, p], n) => {
      p.classList.toggle('hidden', p !== page);
      tabButtons[n].classList.toggle('active', p === page);
    });
  }
  showPage(mapPage);

  const settings = handlers.settings;
  function slider(label, key, min, max, step) {
    const row = el('label', 'slider', settingsPage);
    el('span', '', row, label);
    const input = el('input', '', row);
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = settings[key];
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      handlers.onSettings(settings);
    });
  }
  slider('Volume', 'volume', 0, 1, 0.05);
  slider('Radio', 'music', 0, 1, 0.05);
  slider('Mouse sensitivity', 'sensitivity', 0.3, 2.5, 0.05);
  const fxRow = el('label', 'slider', settingsPage);
  el('span', '', fxRow, 'Glow and colour grading');
  const fxBox = el('input', '', fxRow);
  fxBox.type = 'checkbox';
  fxBox.checked = settings.effects !== false;
  fxBox.addEventListener('change', () => {
    settings.effects = fxBox.checked;
    handlers.onSettings(settings);
  });
  el('span', 'hint', settingsPage, 'Turn the glow off if the game runs slowly on this computer.');
  const camRow = el('label', 'slider', settingsPage);
  el('span', '', camRow, 'Camera always follows the mouse');
  const camBox = el('input', '', camRow);
  camBox.type = 'checkbox';
  camBox.checked = settings.camera === 'capture';
  camBox.addEventListener('change', () => {
    settings.camera = camBox.checked ? 'capture' : 'hold';
    handlers.onSettings(settings);
  });
  el('span', 'hint', settingsPage, 'Off: hold the right mouse button to look around (the camera follows you as you walk). On: the mouse is captured and always turns the camera.');

  const actions = el('div', 'pause-actions', panel);
  button(actions, 'Resume', () => handlers.onResume());
  const saveBtn = button(actions, 'Save game', () => handlers.onSave());
  button(actions, 'Quit to title', () => handlers.onQuit());

  // ---------------- shop
  const shop = el('div', 'menu shop-screen hidden', root);
  const shopPanel = el('div', 'shop-panel', shop);
  const shopHead = el('div', 'shop-head', shopPanel);
  el('div', 'shop-title', shopHead, 'BAY ARMS');
  const shopCash = el('div', 'shop-cash', shopHead);
  el('div', 'shop-tag', shopPanel, '"No questions, no refunds." Click an item to buy it.');
  const shopList = el('div', 'shop-list', shopPanel);
  const shopStatus = el('div', 'shop-status', shopPanel);
  button(shopPanel, 'Leave the shop (Esc)', () => handlers.onCloseShop());
  let shopGame = null;
  function renderShop() {
    const game = shopGame;
    shopCash.textContent = `$${Math.floor(game.player.money).toLocaleString('en-US')}`;
    shopList.innerHTML = '';
    for (const item of handlers.shopItems) {
      const check = handlers.canBuy(game, item);
      const row = el('button', `shop-item${check.ok ? '' : ' off'}`, shopList);
      row.type = 'button';
      const left = el('div', 'info', row);
      el('div', 'name', left, item.name);
      el('div', 'blurb', left, item.blurb);
      el('div', 'price', row, check.ok ? `$${item.price}` : check.reason);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        shopStatus.textContent = handlers.onBuy(item);
        renderShop();
      });
    }
  }

  // ---------------- fade, credits
  const fade = el('div', 'fade', root);
  const credits = el('div', 'menu credits hidden', root);
  const roll = el('div', 'roll', credits);
  for (const line of [GAME_TITLE.toUpperCase(), GAME_SUBTITLE, '', 'Nico Reyes came home.', 'Harlan Voss went to prison.', 'Sergeant Brannigan went into the harbour.', '', 'The bay is yours: keep exploring, find every sun token,', 'and see how long you last at five stars.', '', 'Made for the make.fun "Make GTA 6" bounty', 'Every model, sound and line of story in this game is original.', '', 'Click to keep playing']) el('div', 'line', roll, line);
  credits.addEventListener('click', () => handlers.onCreditsDone());

  return {
    showTitle(hasSave) {
      title.classList.remove('hidden');
      cont.style.display = hasSave ? '' : 'none';
    },
    hideTitle() {
      title.classList.add('hidden');
      titleControls.classList.add('hidden');
    },
    showPause(game) {
      pause.classList.remove('hidden');
      saveBtn.disabled = game.wanted.level > 0;
      saveBtn.textContent = game.wanted.level > 0 ? 'Save (lose the cops first)' : 'Save game';
      drawFullMap(mapCanvas, game.hud.base, game);
      statsPage.innerHTML = '';
      const s = game.stats;
      const rows = [
        ['Story', `${game.story.index} of ${STORY.length} missions`],
        ['Next mission', STORY[game.story.index] ? STORY[game.story.index].title : 'Story complete'],
        ['Money', `$${Math.floor(game.player.money).toLocaleString('en-US')}`],
        ['Sun tokens', `${game.progress.tokens.length} of ${TOKEN_SPOTS.length}`],
        ['Cars stolen', s.carsStolen],
        ['People taken out', s.kills],
        ['Cops taken out', s.copKills],
        ['Highest wanted level', '★'.repeat(s.maxWanted) || 'none'],
        ['Time on the streets', `${Math.floor(game.time / 60)} min`],
      ];
      for (const [k, v] of rows) {
        const row = el('div', 'stat', statsPage);
        el('span', 'k', row, k);
        el('span', 'v', row, String(v));
      }
      showPage(mapPage);
    },
    showMap(game) {
      this.showPause(game);
      showPage(mapPage);
    },
    hidePause() {
      pause.classList.add('hidden');
    },
    fade(on, text = '', kind = '') {
      fade.className = `fade ${on ? 'on' : ''} ${kind}`;
      fade.textContent = text;
    },
    showShop(game) {
      shopGame = game;
      shopStatus.textContent = '';
      renderShop();
      shop.classList.remove('hidden');
    },
    hideShop() {
      shop.classList.add('hidden');
    },
    showCredits() {
      credits.classList.remove('hidden');
    },
    hideCredits() {
      credits.classList.add('hidden');
    },
  };
}
