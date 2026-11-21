// Bay Arms, the gun shop on the Neon Strip: what it sells, what each item does, whether the player
// can buy it, and the door that opens the shop when the player walks up to it on foot.
import { WEAPONS } from './config.js';
import { giveWeapon } from './player.js';
import { addBeacon } from './effects.js';

export const SHOP_ITEMS = [
  { id: 'pistol', name: 'Vesper 9', kind: 'weapon', weapon: 'pistol', rounds: 36, price: 250, blurb: 'Reliable 9 mm pistol, 36 rounds.' },
  { id: 'smg', name: 'Hornet SMG', kind: 'weapon', weapon: 'smg', rounds: 90, price: 900, blurb: 'Fully automatic, 90 rounds.' },
  { id: 'shotgun', name: 'Breaker 12', kind: 'weapon', weapon: 'shotgun', rounds: 16, price: 700, blurb: 'Pump shotgun, 16 shells. Devastating up close.' },
  { id: 'pistolAmmo', name: '9 mm rounds', kind: 'ammo', weapon: 'pistol', rounds: 36, price: 60, blurb: '36 rounds for the Vesper 9.' },
  { id: 'smgAmmo', name: 'SMG magazines', kind: 'ammo', weapon: 'smg', rounds: 90, price: 150, blurb: '90 rounds for the Hornet.' },
  { id: 'shotgunAmmo', name: 'Shells', kind: 'ammo', weapon: 'shotgun', rounds: 16, price: 90, blurb: '16 shells for the Breaker.' },
  { id: 'armor', name: 'Body armour', kind: 'armor', price: 200, blurb: 'Full armour. Soaks most of a bullet.' },
  { id: 'medkit', name: 'First aid kit', kind: 'medkit', price: 80, blurb: 'Back to full health.' },
];

/** Whether `item` can be bought now, and if not why: { ok, reason }. */
export function canBuy(game, item) {
  const p = game.player;
  if (item.kind === 'weapon' && p.ammo[item.weapon]) return { ok: false, reason: 'Owned' };
  if (item.kind === 'ammo' && !p.ammo[item.weapon]) return { ok: false, reason: `Needs the ${WEAPONS[item.weapon].name}` };
  if (item.kind === 'armor' && p.armor >= 100) return { ok: false, reason: 'Full' };
  if (item.kind === 'medkit' && p.health >= p.maxHealth) return { ok: false, reason: 'Full' };
  if (p.money < item.price) return { ok: false, reason: 'Not enough cash' };
  return { ok: true, reason: '' };
}

/** Buys `item` if it can; returns a line for the shop's status bar. */
export function buy(game, item) {
  const check = canBuy(game, item);
  if (!check.ok) return check.reason;
  const p = game.player;
  p.money -= item.price;
  if (item.kind === 'weapon' || item.kind === 'ammo') giveWeapon(p, item.weapon, item.rounds);
  if (item.kind === 'armor') p.armor = 100;
  if (item.kind === 'medkit') p.health = p.maxHealth;
  if (game.audio) game.audio.pickup(item.kind === 'weapon');
  return `Bought: ${item.name}  -$${item.price}`;
}

export function createShop(game) {
  const door = game.city.pois.shop;
  game.shopBeacon = addBeacon(game.fx, door.x, door.z, 0x3fd0ff, 1.3);
  game.shopInside = false;
}

/** Opens the shop (game.openShop) when the player walks up to the door; it re-arms once they step away. */
export function updateShop(game) {
  const p = game.player;
  const door = game.city.pois.shop;
  const d = Math.hypot(p.x - door.x, p.z - door.z);
  if (game.shopInside) {
    if (d > 3) game.shopInside = false;
    return;
  }
  if (!p.vehicle && p.alive && d < 1.5) {
    game.shopInside = true;
    if (game.wanted.level > 0) game.hud.notify('Bay Arms: "Not with the cops on your tail, friend."');
    else if (game.openShop) game.openShop();
  }
}
