// Respect and rank: what the streets think of Nico. Missions, races and garage work pay respect
// directly; crimes pay a little (a stolen car, a fight won, a cop down, a star gained, a chase
// shaken off), counted from the stats as they change so no system has to remember to call in.
// Every rank up pays a bonus, and some doors (the Sunset Boulevard Run) open only at a rank.

export const RANKS = [
  { at: 0, name: 'Nobody' },
  { at: 50, name: 'Street Rat' },
  { at: 150, name: 'Hustler' },
  { at: 300, name: 'Wheelman' },
  { at: 550, name: 'Enforcer' },
  { at: 900, name: 'Shot Caller' },
  { at: 1400, name: 'Bay Legend' },
  { at: 2200, name: 'King of Palmera' },
];

/** Index into RANKS for `respect` points. */
export function rankOf(respect) {
  let r = 0;
  for (let n = 0; n < RANKS.length; n += 1) if (respect >= RANKS[n].at) r = n;
  return r;
}

/** Rank, name and progress (0..1) toward the next rank, for the HUD and the stats page. */
export function rankInfo(game) {
  const respect = game.respect ?? 0;
  const r = rankOf(respect);
  const next = RANKS[r + 1];
  const progress = next ? (respect - RANKS[r].at) / (next.at - RANKS[r].at) : 1;
  return { rank: r, name: RANKS[r].name, next: next ? next.name : null, toNext: next ? next.at - respect : 0, progress, respect };
}

/** Adds `amount` respect for `reason`; a new rank shows a banner and pays a cash bonus. */
export function addRespect(game, amount, reason = '') {
  if (!amount || game.mode === 'title') return;
  const before = rankOf(game.respect ?? 0);
  game.respect = (game.respect ?? 0) + amount;
  game.respectPop = { amount: (game.respectPop && game.respectPop.time > 0 ? game.respectPop.amount : 0) + amount, reason, time: 2.5 };
  const after = rankOf(game.respect);
  if (after > before) {
    const bonus = after * 250;
    game.player.money += bonus;
    game.hud.banner('RANK UP', 'passed', `${RANKS[after].name}  +$${bonus.toLocaleString('en-US')}`);
    if (game.audio) game.audio.jingle();
  }
}

/** Watches the stats and the wanted level for crimes worth a little respect. */
export function updateRespect(game, dt) {
  const s = game.stats;
  const seen = game.respectSeen ?? (game.respectSeen = { cars: s.carsStolen, kills: s.kills, cops: s.copKills, level: 0, peak: 0 });
  if (s.carsStolen > seen.cars) addRespect(game, 2 * (s.carsStolen - seen.cars), 'Car stolen');
  if (s.copKills > seen.cops) addRespect(game, 5 * (s.copKills - seen.cops), 'Cop down');
  else if (s.kills > seen.kills) addRespect(game, s.kills - seen.kills, 'Fight won');
  seen.cars = s.carsStolen;
  seen.kills = s.kills;
  seen.cops = s.copKills;
  const level = game.wanted.level;
  if (level > seen.level) addRespect(game, 3 * level, `${level}-star heat`);
  seen.peak = level > 0 ? Math.max(seen.peak, level) : seen.peak;
  if (level === 0 && seen.level > 0 && game.player.alive && game.mode === 'play') {
    addRespect(game, seen.peak * 10, `Escaped ${seen.peak}-star chase`);
    seen.peak = 0;
  }
  seen.level = level;
  if (game.respectPop) game.respectPop.time -= dt;
}

/** Starts the tally from the current stats (a new game, a load) so nothing old pays twice. */
export function resetRespectWatch(game) {
  game.respectSeen = null;
  game.respectPop = null;
}
