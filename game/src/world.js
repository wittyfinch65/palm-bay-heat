// Palm Bay itself: the street grid, five districts of pastel deco blocks, named places (the
// police station, the hospital, Café Brisa, the Port Azul docks, the yacht club), the beach and
// the ocean. buildWorld grows it all from one seed; the helpers answer the questions every other
// system asks — where are the roads, what is solid, where can a car legally be.
import { CITY, PALETTE, WORLD } from './config.js';

/** Centre line x of vertical road i (0 is the westernmost avenue). */
export function roadCenterX(i) {
  return CITY.road / 2 + i * CITY.pitch;
}

/** Centre line y of horizontal road j (0 is the northernmost street). */
export function roadCenterY(j) {
  return CITY.road / 2 + j * CITY.pitch;
}

/** The city block between roads i and i+1, j and j+1, as a rectangle inside the sidewalks. */
export function blockRect(i, j) {
  return { x: CITY.road + i * CITY.pitch, y: CITY.road + j * CITY.pitch, w: CITY.block, h: CITY.block };
}

/** Which district a block belongs to; the names are Palm Bay's own and show on the minimap. */
export function districtOfBlock(i, j) {
  if (i === 6) return 'Coral Beach';
  if (j === 4 && i >= 4) return 'Port Azul';
  if (j === 0) return 'Palm Heights';
  if (i <= 1) return 'Old Deco Quarter';
  if (i >= 2 && i <= 4 && j >= 1 && j <= 3) return 'Downtown';
  return 'Midtown';
}

const FACADE_DECO = ['#f6c6a5', '#f9e2ae', '#bfe3dd', '#f7b1c8', '#cfe0f5', '#ffe9c9'];
const FACADE_TOWER = ['#cfd8e6', '#b9c9dd', '#e3d7c8', '#aebfd4', '#d9e4ee'];
const FACADE_HOTEL = ['#ffd9a0', '#ffc4d6', '#bfe8f5', '#fff0c4'];
const ROOFS = ['#7a4a3a', '#5d6b7a', '#8a5a44', '#4e5a66', '#96684e'];

/** One building: a footprint, a height in floors (the renderer extrudes it), a facade, a kind. */
function building(rng, x, y, w, h, floors, colors, kind, name) {
  return {
    x, y, w, h, floors,
    color: colors[Math.floor(rng.next() * colors.length)],
    roof: ROOFS[Math.floor(rng.next() * ROOFS.length)],
    kind, name: name ?? null,
    seed: Math.floor(rng.next() * 1e9),
  };
}

/** Fill a block with the 2x2 arrangement of mid-rise buildings most districts use. */
function fillBlockTowers(world, rng, rect, colors, minFloors, maxFloors, kind) {
  const gap = 26;
  const bw = (rect.w - gap * 3) / 2;
  const bh = (rect.h - gap * 3) / 2;
  for (let a = 0; a < 2; a += 1) {
    for (let b = 0; b < 2; b += 1) {
      if (rng.chance(0.08)) continue; // the odd empty lot keeps the grid from feeling stamped
      const x = rect.x + gap + a * (bw + gap) + rng.range(-6, 6);
      const y = rect.y + gap + b * (bh + gap) + rng.range(-6, 6);
      world.buildings.push(building(rng, x, y, bw + rng.range(-14, 10), bh + rng.range(-14, 10),
        rng.int(minFloors, maxFloors), colors, kind));
    }
  }
}

/** Fill a suburban block with nine small houses on grass. */
function fillBlockHouses(world, rng, rect) {
  const gap = 24;
  const bw = (rect.w - gap * 4) / 3;
  const bh = (rect.h - gap * 4) / 3;
  for (let a = 0; a < 3; a += 1) {
    for (let b = 0; b < 3; b += 1) {
      if (rng.chance(0.12)) continue;
      world.buildings.push(building(rng, rect.x + gap + a * (bw + gap), rect.y + gap + b * (bh + gap),
        bw, bh, 1, FACADE_DECO, 'house'));
      if (rng.chance(0.5)) world.props.push({ kind: 'palm', x: rect.x + gap + a * (bw + gap) - 8, y: rect.y + gap + b * (bh + gap) - 6, seed: rng.int(0, 1e9) });
    }
  }
}

/** Fill a dock block with two long warehouses and a yard. */
function fillBlockWarehouses(world, rng, rect, name) {
  world.buildings.push(building(rng, rect.x + 22, rect.y + 30, rect.w - 44, 120, 2, ['#b08968', '#9c7a5c'], 'warehouse', name ?? null));
  world.buildings.push(building(rng, rect.x + 22, rect.y + 200, rect.w - 120, 130, 2, ['#a3a380', '#8f9779'], 'warehouse'));
}

/** A named special building centred on its block (police, hospital, hotel, café...). */
function fillBlockSpecial(world, rng, rect, name, kind, floors, colors) {
  world.buildings.push(building(rng, rect.x + 46, rect.y + 60, rect.w - 92, rect.h - 150, floors, colors, kind, name));
}

/** The named places missions and respawns point at, with the street point you arrive at. */
function buildPlaces(world) {
  const at = (i, j) => {
    const r = blockRect(i, j);
    return { x: r.x + r.w / 2, y: r.y + r.h + 44 }; // the road just south of the block
  };
  const cafe = at(6, 1);
  const docks = at(5, 4);
  world.places = [
    { id: 'police', name: 'Palm Bay Police Department', kind: 'police', ...at(3, 2) },
    { id: 'hospital', name: 'St. Coral Hospital', kind: 'hospital', ...at(5, 0) },
    { id: 'cafe', name: 'Café Brisa', kind: 'cafe', ...cafe },
    { id: 'hotel', name: 'Hotel Delmare', kind: 'hotel', ...at(6, 3) },
    { id: 'docks', name: 'Port Azul Freight Depot', kind: 'docks', ...docks },
    { id: 'yacht', name: 'Marina & Yacht Club', kind: 'yacht', x: WORLD.boardwalkX, y: 2400 },
    { id: 'cabdepot', name: 'SunCab Depot', kind: 'cab', ...at(0, 4) },
    { id: 'garage', name: 'Azul Autos', kind: 'garage', ...at(2, 4) },
    { id: 'bank', name: 'Palm Bay Trust', kind: 'bank', ...at(3, 1) },
    { id: 'diner', name: 'Diner Sol', kind: 'diner', ...at(0, 2) },
  ];
}

/** Find a place by id. */
export function placeById(world, id) {
  return world.places.find((place) => place.id === id);
}

/** Palms along the coast and the boardwalk, lamps along every avenue. */
function plantProps(world, rng) {
  for (let y = 90; y < WORLD.height - 60; y += rng.range(95, 150)) {
    world.props.push({ kind: 'palm', x: WORLD.sandX - 14, y, seed: rng.int(0, 1e9) });
    if (rng.chance(0.7)) world.props.push({ kind: 'palm', x: rng.range(WORLD.sandX + 60, WORLD.waterX - 90), y: y + rng.range(-30, 30), seed: rng.int(0, 1e9) });
  }
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (let y = 170; y < WORLD.height; y += 300) {
      world.props.push({ kind: 'lamp', x: roadCenterX(i) - CITY.road / 2 + 8, y, seed: 0 });
      world.props.push({ kind: 'lamp', x: roadCenterX(i) + CITY.road / 2 - 8, y: y + 150, seed: 0 });
    }
  }
}

/** Parking spots along the coast road and downtown kerbs: where stealable cars wait. */
function buildParking(world, rng) {
  world.parking = [];
  for (let y = 200; y < WORLD.height - 120; y += rng.range(120, 210)) {
    world.parking.push({ x: roadCenterX(CITY.cols) - 38, y, angle: Math.PI });
    if (rng.chance(0.6)) world.parking.push({ x: roadCenterX(CITY.cols) + 38, y: y + 60, angle: 0 });
  }
  for (let i = 1; i < CITY.cols; i += 2) {
    for (let x = roadCenterX(i) + 90; x < roadCenterX(i) + 330; x += 74) {
      world.parking.push({ x, y: roadCenterY(2) - 38, angle: Math.PI / 2 });
    }
  }
}

/** Grow the whole city from the seed. Deterministic: same seed, same Palm Bay. */
export function buildWorld(rng) {
  const world = { buildings: [], props: [], places: [], parking: [], ground: [] };
  for (let i = 0; i < CITY.cols; i += 1) {
    for (let j = 0; j < CITY.rows; j += 1) {
      const rect = blockRect(i, j);
      const district = districtOfBlock(i, j);
      world.ground.push({ ...rect, grass: district === 'Palm Heights' });
      if (i === 3 && j === 2) fillBlockSpecial(world, rng, rect, 'Palm Bay Police Department', 'police', 4, FACADE_TOWER);
      else if (i === 5 && j === 0) fillBlockSpecial(world, rng, rect, 'St. Coral Hospital', 'hospital', 5, ['#eef3f6', '#dcebf2']);
      else if (i === 6 && j === 1) fillBlockSpecial(world, rng, rect, 'Café Brisa', 'cafe', 2, FACADE_HOTEL);
      else if (i === 6 && j === 3) fillBlockSpecial(world, rng, rect, 'Hotel Delmare', 'hotel', 9, FACADE_HOTEL);
      else if (i === 3 && j === 1) fillBlockSpecial(world, rng, rect, 'Palm Bay Trust', 'bank', 8, FACADE_TOWER);
      else if (i === 0 && j === 4) fillBlockSpecial(world, rng, rect, 'SunCab Depot', 'cab', 2, ['#ffe08a', '#ffd34d']);
      else if (i === 2 && j === 4) fillBlockSpecial(world, rng, rect, 'Azul Autos', 'garage', 2, ['#a8d8ea', '#8fc7dd']);
      else if (i === 0 && j === 2) fillBlockSpecial(world, rng, rect, 'Diner Sol', 'diner', 1, FACADE_DECO);
      else if (i === 6 && j === 4) fillBlockSpecial(world, rng, rect, 'Marina & Yacht Club', 'yacht', 3, FACADE_HOTEL);
      else if (district === 'Port Azul') fillBlockWarehouses(world, rng, rect, i === 5 ? 'Port Azul Freight' : null);
      else if (district === 'Palm Heights') fillBlockHouses(world, rng, rect);
      else if (district === 'Downtown') fillBlockTowers(world, rng, rect, FACADE_TOWER, 6, 14, 'tower');
      else if (district === 'Coral Beach') fillBlockTowers(world, rng, rect, FACADE_HOTEL, 4, 10, 'hotel');
      else fillBlockTowers(world, rng, rect, FACADE_DECO, 3, 7, 'deco');
    }
  }
  buildPlaces(world);
  plantProps(world, rng);
  buildParking(world, rng);
  return world;
}

/** True when the point is open water. */
export function isWater(x) {
  return x >= WORLD.waterX;
}

/** True when the point is on the sand (walkable, but cars bog down and keep out). */
export function isSand(x) {
  return x >= WORLD.sandX && x < WORLD.waterX;
}

/**
 * Push a circle (a body at body.x/body.y with this radius) out of every building and back
 * inside the world. Mutates the body; returns true when it touched anything.
 */
export function collideCircle(world, body, radius) {
  let hit = false;
  if (body.x < radius) { body.x = radius; hit = true; }
  if (body.y < radius) { body.y = radius; hit = true; }
  if (body.x > WORLD.width - radius) { body.x = WORLD.width - radius; hit = true; }
  if (body.y > WORLD.height - radius) { body.y = WORLD.height - radius; hit = true; }
  for (let index = 0; index < world.buildings.length; index += 1) {
    const b = world.buildings[index];
    if (body.x + radius < b.x || body.x - radius > b.x + b.w || body.y + radius < b.y || body.y - radius > b.y + b.h) continue;
    const nearX = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const nearY = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nearX;
    const dy = body.y - nearY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      body.x = nearX + (dx / dist) * radius;
      body.y = nearY + (dy / dist) * radius;
    } else {
      // Centre inside the footprint: leave by the shallowest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) body.x = b.x - radius;
      else if (min === right) body.x = b.x + b.w + radius;
      else if (min === top) body.y = b.y - radius;
      else body.y = b.y + b.h + radius;
    }
  }
  return hit;
}

/** The nearest point that lies on a road centre line — where lost drivers aim to rejoin traffic. */
export function nearestRoadPoint(x, y) {
  let bestV = roadCenterX(0);
  let bestH = roadCenterY(0);
  for (let i = 1; i <= CITY.cols; i += 1) if (Math.abs(roadCenterX(i) - x) < Math.abs(bestV - x)) bestV = roadCenterX(i);
  for (let j = 1; j <= CITY.rows; j += 1) if (Math.abs(roadCenterY(j) - y) < Math.abs(bestH - y)) bestH = roadCenterY(j);
  const dv = Math.abs(bestV - x);
  const dh = Math.abs(bestH - y);
  return dv < dh ? { x: bestV, y } : { x, y: bestH };
}

/** A random intersection, optionally kept within a distance band of a centre point. */
export function randomIntersection(rng, cx, cy, minD, maxD) {
  for (let tries = 0; tries < 12; tries += 1) {
    const x = roadCenterX(rng.int(0, CITY.cols));
    const y = roadCenterY(rng.int(0, CITY.rows));
    const d = Math.hypot(x - cx, y - cy);
    if (cx === null || (d >= minD && d <= maxD)) return { x, y };
  }
  return { x: roadCenterX(rng.int(0, CITY.cols)), y: roadCenterY(rng.int(0, CITY.rows)) };
}

/** Is this point on asphalt? (Either road band, or the docks yard roads between blocks.) */
export function isOnRoad(x, y) {
  const mx = ((x % CITY.pitch) + CITY.pitch) % CITY.pitch;
  const my = ((y % CITY.pitch) + CITY.pitch) % CITY.pitch;
  return mx < CITY.road || my < CITY.road;
}

export { PALETTE };
