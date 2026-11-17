// Palm Bay Heat — shared tuning: the fixed step, the city's measurements, the day cycle and the
// palette every system paints with. One place for the numbers so the world, the traffic and the
// police all agree on how big Palm Bay is and how fast everything moves.

/** The fixed simulation step, in seconds: the world always advances in 1/60 s slices. */
export const STEP = 1 / 60;

/** World size in pixels. The city grid fills most of it; sand and ocean take the east edge. */
export const WORLD = {
  width: 4200,
  height: 2520,
  sandX: 3480, // sand starts here, east of the coast road
  waterX: 3790, // open water starts here; nobody drives or wades past it
  boardwalkX: 3560, // the pedestrian promenade between the coast road and the sand
};

/** The street grid: square blocks of BLOCK px separated by roads of ROAD px. */
export const CITY = {
  block: 360,
  road: 120,
  pitch: 480, // block + road
  cols: 7, // blocks across (west to east), so cols + 1 vertical roads
  rows: 5, // blocks down (north to south), so rows + 1 horizontal roads
};

/** Where the player wakes up: on the coast road by Café Brisa, facing the ocean. */
export const SPAWN = { x: 3330, y: 1560, angle: Math.PI / 2 };

/** A full day lasts this many real seconds; the game opens in the golden late afternoon. */
export const DAY_SECONDS = 480;
export const DAY_START = 0.68;

/** Player numbers, on foot and in trouble. */
export const PLAYER = {
  radius: 10,
  walkSpeed: 152,
  sprintSpeed: 238,
  maxHealth: 100,
  punchRange: 30,
  punchDamage: 34,
  shotCooldown: 0.22,
  bulletSpeed: 760,
  bulletRange: 420,
  bulletDamage: 26,
};

/** Wanted tuning: how fast heat fades when the police lose sight of the player. */
export const WANTED = {
  maxStars: 5,
  evadeSeconds: 11, // unseen this long, the search starts to cool
  coolSeconds: 9, // each star then takes this long to drop
  bustSeconds: 1.5, // stood over by a cop this long at low speed and you are busted
  sightRange: 560, // a police unit this close keeps the heat on
};

/** Camera: how far ahead of the player it looks, scaled by speed, and its follow stiffness. */
export const CAMERA = { lookAhead: 0.32, stiffness: 5.5 };

/** localStorage key for the save (cash, story progress, records). */
export const SAVE_KEY = 'palm-bay-heat-save-v1';

/** The sun-soaked palette: pastel deco facades, teal water, hot asphalt, gold light. */
export const PALETTE = {
  asphalt: '#3d4149',
  asphaltDark: '#343842',
  lanePaint: '#e8e4d2',
  sidewalk: '#9aa0a3',
  sidewalkEdge: '#7e858a',
  blockGround: '#8f979c',
  grass: '#69a860',
  sand: '#ecd28f',
  sandDark: '#dfc078',
  water: '#1d7f96',
  waterDeep: '#146a86',
  waterFoam: '#bfeef2',
  palmTrunk: '#8a6b46',
  palmLeaf: '#3e9e57',
  playerShirt: '#ff7847',
  copBlue: '#274b9f',
  taxiYellow: '#ffc61a',
  cashGreen: '#37d67a',
  dangerRed: '#ff5252',
  gold: '#ffd34d',
  ink: '#10131c',
};
