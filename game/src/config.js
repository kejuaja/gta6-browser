// Palmera Bay: every tuning number, name and colour in one place.
// World units are metres; +y is up. The city is a grid of 8 x 8 blocks with roads between them,
// a beach and the ocean to the west and the harbour to the south.

export const GAME_TITLE = 'Palmera Bay';
export const GAME_SUBTITLE = 'Sunset Heat';

/** The simulation's fixed step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const GRID = {
  blocks: 8,
  cell: 74,
  road: 14,
  block: 60,
  /** Sidewalk band inside each block's edge; buildings start past it. */
  sidewalk: 4,
  lane: 3.4,
};

/** Where anything may stand or drive: the land, plus the amusement pier. */
export const WORLD = {
  minX: -66,
  maxX: 596,
  minZ: -4,
  maxZ: 634,
  beachX: -70,
  harbourZ: 640,
  pier: { x0: -170, x1: -66, z0: 292, z1: 308 },
};

export const DISTRICTS = {
  beach: { name: 'Sunset Beach', tag: 'Pastel hotels and the boardwalk' },
  downtown: { name: 'Downtown Palmera', tag: 'Glass towers and old money' },
  strip: { name: 'Neon Strip', tag: 'Clubs, diners and loose change' },
  heights: { name: 'Coral Heights', tag: 'Quiet streets, loud secrets' },
  docks: { name: 'Saltmarsh Docks', tag: 'Containers, cranes and contraband' },
  pier: { name: 'Lucky Seven Pier', tag: 'Rides, cotton candy and the sea' },
};

export const PALETTE = {
  // Sunset: a yellow horizon burning to orange, a rose-violet zenith, warm haze.
  skyTop: 0x6a3a86,
  skyMid: 0xff7433,
  skyHorizon: 0xffc247,
  sun: 0xff9445,
  fog: 0xf0965a,
  asphalt: '#3b3d44',
  asphaltLight: '#45474f',
  sidewalk: 0xd9cfc0,
  grass: 0x6fae4f,
  sand: 0xf0d8a8,
  water: 0x0b6a92,
  pastel: [0xf6c5a5, 0xf4a6b8, 0x9fd8cf, 0xf7e3a1, 0xb7c9f0, 0xfbf3e4, 0xe8b4d8, 0xffd0a0],
  glass: [0x6e93b8, 0x88a9c9, 0x5a7fa6, 0x7fb3c8, 0x9aa6b8],
  strip: [0xff6f91, 0xffc75f, 0x845ec2, 0x00c9a7, 0xf9f871, 0xff9671, 0x4b9fe1],
  docks: [0x7b8794, 0x5c7d99, 0xa65d4b, 0x8f9a6b, 0x6d6a75],
  container: [0xc0392b, 0x2e86de, 0xf39c12, 0x27ae60, 0x8e44ad, 0xd35400],
  neon: [0xff3fa4, 0x3ff0ff, 0xffe53f, 0x7cff6b, 0xb86bff],
};

export const PLAYER = {
  walk: 2.4,
  run: 6.2,
  radius: 0.4,
  health: 100,
  armor: 100,
  jump: 5,
};

export const CAR_MODELS = {
  sorrel: { name: 'Sorrel', len: 4.2, wid: 1.9, hgt: 1.35, cabin: 0.5, top: 23, accel: 9, grip: 7.5, colors: [0xe8e3d8, 0x2c5e8a, 0x9b2335, 0x3d6b4f, 0xd4a017] },
  kestrel: { name: 'Kestrel GT', len: 4.5, wid: 2.0, hgt: 1.15, cabin: 0.4, top: 38, accel: 15, grip: 8.5, colors: [0xff3b30, 0xffcc00, 0x111111, 0x0a84ff, 0xff6b9d] },
  tarpon: { name: 'Tarpon', len: 4.9, wid: 2.0, hgt: 1.3, cabin: 0.45, top: 31, accel: 12, grip: 6.5, colors: [0xb3261e, 0x1c1c1e, 0x2e7d32, 0xf5f5f5] },
  duna: { name: 'Duna Pickup', len: 5.2, wid: 2.1, hgt: 1.6, cabin: 0.32, pickup: true, top: 24, accel: 8, grip: 6, colors: [0x8d6e63, 0x546e7a, 0xc62828, 0xeeeeee] },
  cab: { name: 'Bayline Cab', len: 4.6, wid: 1.95, hgt: 1.4, cabin: 0.5, top: 26, accel: 9, grip: 7, taxi: true, colors: [0xffc107] },
  cruiser: { name: 'PBPD Cruiser', len: 4.8, wid: 2.0, hgt: 1.4, cabin: 0.48, top: 35, accel: 13, grip: 8, police: true, colors: [0xf4f4f4] },
};

export const TRAFFIC_MODELS = ['sorrel', 'sorrel', 'tarpon', 'duna', 'cab', 'kestrel', 'sorrel', 'tarpon'];

export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', damage: 14, rate: 0.42, range: 1.7, melee: true },
  pistol: { id: 'pistol', name: 'Vesper 9', damage: 34, rate: 0.26, range: 110, spread: 0.012, mag: 12, pellets: 1 },
  smg: { id: 'smg', name: 'Hornet SMG', damage: 20, rate: 0.075, range: 90, spread: 0.035, mag: 30, pellets: 1, auto: true },
  shotgun: { id: 'shotgun', name: 'Breaker 12', damage: 15, rate: 0.85, range: 40, spread: 0.09, mag: 6, pellets: 8 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

/** Heat a crime adds; the wanted level is the highest threshold the heat has passed. */
export const CRIMES = {
  gunfire: 0.35,
  assault: 0.6,
  theft: 1.05,
  carjack: 1.1,
  runover: 1.2,
  murder: 1.6,
  copAssault: 2,
  copKill: 3.2,
  explosion: 1.5,
};
export const WANTED_THRESHOLDS = [0, 1, 3.2, 7, 13, 21];
export const POLICE_UNITS = [0, 1, 2, 4, 5, 7];
/** How close (with a clear view) a cop must be to see a car stolen. */
export const COP_SIGHT = 45;
/** Patrol cruisers kept driving the streets around the player while nobody is wanted. */
export const PATROLS = 3;

export const DENSITY = {
  traffic: 24,
  peds: 46,
  despawn: 210,
};

export const SAVE_KEY = 'palmera-bay.save.v1';
export const SETTINGS_KEY = 'palmera-bay.settings.v1';
