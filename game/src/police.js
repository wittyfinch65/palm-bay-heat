// The Palm Bay Police Department: the wanted star system (who saw what, how fast the heat
// cools), cruiser pursuit driving, officers on foot who chase, shoot and bust, and the rules
// that decide when a crime counts. Crimes are reported by the other systems; this one judges.
import { WANTED } from './config.js';
import { createCar, driveCar, modelById } from './vehicles.js';
import { nearestRoadPoint, randomIntersection } from './world.js';
import { hurtPlayer } from './people.js';

/** Crime table: the stars it earns and how close a witness must be for it to count. */
const CRIMES = {
  jack: { stars: 1, copR: 520, pedR: 130 },
  hitcar: { stars: 1, copR: 520, pedR: 150 },
  punch: { stars: 1, copR: 520, pedR: 120 },
  shoot: { stars: 1, copR: 720, pedR: 280 }, // gunfire carries
  hitped: { stars: 2, copR: 620, pedR: 220 },
  hitcop: { stars: 2, copR: 900, pedR: 200 },
  jackcop: { stars: 3, copR: 900, pedR: 200 },
  kill: { stars: 3, copR: 900, pedR: 260 },
};

/** Is any police unit within `range` of the point? */
function copNear(G, x, y, range) {
  for (const car of G.cars) {
    if (car.kind === 'police' && car.driver === 'ai' && Math.hypot(car.x - x, car.y - y) < range) return true;
  }
  for (const cop of G.cops) {
    if (cop.state !== 'down' && Math.hypot(cop.x - x, cop.y - y) < range) return true;
  }
  return false;
}

/** Is any civilian within `range` of the point, close enough to see and phone it in? */
function pedNear(G, x, y, range) {
  for (const ped of G.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - x, ped.y - y) < range) return true;
  }
  return false;
}

/**
 * Report a crime at a place. Unwitnessed minor crime is free; a witnessed one sets the wanted
 * level to at least the crime's stars, and a grave crime committed while already wanted adds
 * another. Either way the clock restarts: the police now know where to look.
 */
export function reportCrime(G, kind, x, y) {
  const crime = CRIMES[kind];
  if (!crime) return;
  if (G.screen !== 'play') return;
  const witnessed = copNear(G, x, y, crime.copR) || pedNear(G, x, y, crime.pedR) || G.wanted.stars > 0;
  if (!witnessed) return;
  const before = G.wanted.stars;
  G.wanted.stars = Math.max(G.wanted.stars, crime.stars);
  if (before >= crime.stars && (kind === 'kill' || kind === 'hitped')) {
    G.wanted.stars = Math.min(WANTED.maxStars, G.wanted.stars + 1);
  }
  G.wanted.unseenT = 0;
  G.wanted.coolT = 0;
  G.wanted.lastSeenX = G.player.x;
  G.wanted.lastSeenY = G.player.y;
  if (G.wanted.stars > before) G.events.push({ type: 'wantedup', stars: G.wanted.stars });
}

/** Spawn a cruiser at a far junction and send it hunting. */
function spawnCruiser(G) {
  const spot = randomIntersection(G.rng, G.player.x, G.player.y, 640, 980);
  const model = modelById('cruiser');
  const car = createCar(model, spot.x, spot.y, G.rng.range(0, Math.PI * 2), '#f0f2f5', 'police');
  car.driver = 'ai';
  car.copsOut = false;
  G.cars.push(car);
  return car;
}

/** Put an officer on the ground at a point (out of a cruiser, or fresh at the station). */
export function spawnFootCop(G, x, y) {
  const cop = {
    x, y, angle: 0, hp: 60, state: 'chase', shotCd: G.rng.range(0.4, 1.2),
    speed: G.rng.range(158, 176), downT: 0, walkPhase: G.rng.range(0, 6),
  };
  G.cops.push(cop);
  return cop;
}

/** Cruiser control: road-run to the player's street, then a direct, ramming pursuit. */
function cruiserControl(G, car, dt) {
  const player = G.player;
  const target = player.inCar ?? player;
  const dist = Math.hypot(target.x - car.x, target.y - car.y);
  let tx = target.x;
  let ty = target.y;
  if (dist > 300) {
    const road = nearestRoadPoint(target.x, target.y);
    tx = road.x;
    ty = road.y;
  }
  // If a building blocks the straight line, aim for the road point instead of the wall.
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  let targetSpeed = car.model.topSpeed * 0.94;
  if (Math.abs(diff) > 0.9) targetSpeed = 120;
  if (dist < 120) targetSpeed = Math.max(target.vf + 60, 130); // close in and nudge
  if (!player.inCar && dist < 95) targetSpeed = 0; // officers get out instead of running you down
  const throttle = Math.max(-1, Math.min(1, (targetSpeed - car.vf) / 80));
  return { throttle, steer, handbrake: Math.abs(diff) > 2.2 };
}

/** One officer on foot: chase, keep a firing distance at high heat, or move in for the bust. */
function updateFootCop(G, cop, dt) {
  if (cop.state === 'down') {
    cop.downT += dt;
    return;
  }
  const player = G.player;
  const target = player.inCar ?? player;
  const dx = target.x - cop.x;
  const dy = target.y - cop.y;
  const dist = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  cop.shotCd -= dt;

  const wantsBust = !player.inCar || Math.abs(target.vf ?? 0) < 26;
  const firingRange = G.wanted.stars >= 3 && dist < 320 && dist > 60;
  if (firingRange && !player.inCar) {
    // Hold position and shoot.
    if (cop.shotCd <= 0) {
      cop.shotCd = G.rng.range(1.05, 1.6);
      const hitChance = Math.max(0.12, 0.55 - dist / 700);
      G.bullets.push({
        x: cop.x, y: cop.y, vx: Math.cos(cop.angle) * 700, vy: Math.sin(cop.angle) * 700,
        life: 0.5, from: 'cop', hit: G.rng.next() < hitChance,
      });
      G.events.push({ type: 'copshot', x: cop.x, y: cop.y });
    }
    return;
  }
  if (dist > 30) {
    const step = Math.min(dist, cop.speed * dt);
    cop.x += (dx / dist) * step;
    cop.y += (dy / dist) * step;
    cop.walkPhase += dt * 9;
  }
  // Close enough with a slow target: the bust meter climbs.
  if (wantsBust && dist < 40) {
    player.bustMeter += dt;
    cop.state = 'bust';
  } else {
    cop.state = 'chase';
  }
}

/**
 * The whole wanted machine, one step: track whether the player is seen, cool the heat when
 * hidden, keep the cruiser count matched to the stars, drive the pursuit, run the officers.
 */
export function updatePolice(G, dt) {
  const player = G.player;
  const wanted = G.wanted;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;

  // Seen?
  let seen = false;
  for (const car of G.cars) {
    if (car.kind === 'police' && car.driver === 'ai' && Math.hypot(car.x - px, car.y - py) < WANTED.sightRange) seen = true;
  }
  for (const cop of G.cops) {
    if (cop.state !== 'down' && Math.hypot(cop.x - px, cop.y - py) < 300) seen = true;
  }
  if (seen) {
    wanted.unseenT = 0;
    wanted.coolT = 0;
    wanted.lastSeenX = px;
    wanted.lastSeenY = py;
  } else if (wanted.stars > 0) {
    wanted.unseenT += dt;
    if (wanted.unseenT > WANTED.evadeSeconds) {
      wanted.coolT += dt;
      if (wanted.coolT >= WANTED.coolSeconds) {
        wanted.coolT = 0;
        wanted.stars -= 1;
        G.events.push({ type: 'wanteddown', stars: wanted.stars });
        if (wanted.stars === 0) G.toast = { text: 'You lost the police.', t: 2.4 };
      }
    }
  }
  wanted.evading = wanted.stars > 0 && wanted.unseenT > 2.5;

  // Cruiser strength follows the stars.
  const desired = wanted.stars === 0 ? 0 : Math.min(2 + wanted.stars, 6);
  let active = 0;
  for (const car of G.cars) if (car.kind === 'police' && car.driver === 'ai') active += 1;
  G.policeTimer -= dt;
  if (active < desired && G.policeTimer <= 0) {
    G.policeTimer = 1.6;
    spawnCruiser(G);
  }

  // Drive the cruisers; park up and bail out when the player is on foot and close.
  for (let index = G.cars.length - 1; index >= 0; index -= 1) {
    const car = G.cars[index];
    if (car.kind !== 'police' || car.driver !== 'ai') continue;
    const dist = Math.hypot(px - car.x, py - car.y);
    if (wanted.stars === 0 && dist > 1050) {
      G.cars.splice(index, 1); // called off: the cruiser leaves the world
      continue;
    }
    if (!player.inCar && dist < 92 && !car.copsOut && wanted.stars > 0) {
      car.copsOut = true;
      car.driver = null;
      spawnFootCop(G, car.x + 16, car.y);
      if (wanted.stars >= 2) spawnFootCop(G, car.x - 16, car.y + 8);
      continue;
    }
    if (!car.copsOut) driveCar(G, car, dt, cruiserControl(G, car, dt));
  }

  // Officers on foot.
  for (let index = G.cops.length - 1; index >= 0; index -= 1) {
    const cop = G.cops[index];
    updateFootCop(G, cop, dt);
    const dist = Math.hypot(px - cop.x, py - cop.y);
    if ((cop.state === 'down' && cop.downT > 20) || (wanted.stars === 0 && dist > 800) || dist > 1600) {
      G.cops.splice(index, 1);
    }
  }

  // A cruiser sitting on a stopped player also busts.
  if (!player.inCar || Math.abs(player.inCar.vf) < 24) {
    for (const car of G.cars) {
      if (car.kind === 'police' && Math.hypot(car.x - px, car.y - py) < 52 && Math.hypot(car.vx, car.vy) < 40) {
        player.bustMeter += dt * 0.8;
      }
    }
  }
  if (player.bustMeter > 0 && !copNear(G, px, py, 60)) {
    player.bustMeter = Math.max(0, player.bustMeter - dt * 1.3);
  }

  // Sirens for the audio system: nearest active unit.
  wanted.sirenDist = Infinity;
  for (const car of G.cars) {
    if (car.kind === 'police' && car.driver === 'ai') {
      wanted.sirenDist = Math.min(wanted.sirenDist, Math.hypot(car.x - px, car.y - py));
    }
  }
}

export { hurtPlayer };
