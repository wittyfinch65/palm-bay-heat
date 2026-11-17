// Cars: the models Palm Bay drives, an arcade driving model (throttle, steering, lateral grip,
// handbrake slides), collisions, and the traffic AI that keeps the avenues moving on the
// right-hand side, turning at intersections and stopping for whatever blocks the lane.
import { CITY, WORLD } from './config.js';
import { collideCircle, isSand, randomIntersection, roadCenterX, roadCenterY } from './world.js';

/** Every driveable model in the game, all Palm Bay originals. Speeds are pixels per second. */
export const CAR_MODELS = [
  { id: 'solace', name: 'Solace Sedan', length: 44, width: 20, topSpeed: 305, accel: 250, cruise: 150, colors: ['#c0c6ce', '#7f8ea3', '#a33b3b', '#3b5ea3', '#4a4f57', '#d8d3c3'] },
  { id: 'ventura', name: 'Ventura Coupe', length: 43, width: 20, topSpeed: 345, accel: 300, cruise: 165, colors: ['#e8b13c', '#2e7d6b', '#74306b', '#22262e', '#b8452e'] },
  { id: 'marlin', name: 'Marlin GT', length: 46, width: 21, topSpeed: 395, accel: 360, cruise: 175, colors: ['#e2483d', '#f2f0eb', '#1f6fb2', '#ffb400', '#23272e'] },
  { id: 'caiman', name: 'Caiman SUV', length: 48, width: 23, topSpeed: 272, accel: 225, cruise: 140, colors: ['#5b6670', '#31435c', '#6b4a2f', '#20242a', '#7a8288'] },
  { id: 'boxer', name: 'Boxer Van', length: 50, width: 24, topSpeed: 238, accel: 195, cruise: 130, colors: ['#e8e6df', '#88a0b4', '#c7b299', '#546e7a'] },
  { id: 'suncab', name: 'SunCab Taxi', length: 44, width: 20, topSpeed: 300, accel: 255, cruise: 155, colors: ['#ffc61a'] },
  { id: 'cruiser', name: 'PBPD Cruiser', length: 46, width: 21, topSpeed: 362, accel: 320, cruise: 170, colors: ['#f0f2f5'] },
];

export function modelById(id) {
  return CAR_MODELS.find((model) => model.id === id);
}

/**
 * A car. kind is 'traffic', 'parked', 'police' or 'taxi'; driver is 'ai', 'player' or null.
 * Velocity is kept as vx/vy and split into forward/lateral parts by driveCar each step.
 */
export function createCar(model, x, y, angle, color, kind) {
  return {
    model, x, y, angle, color, kind,
    vx: 0, vy: 0, vf: 0, vr: 0,
    hp: 100, wrecked: false, driver: kind === 'traffic' || kind === 'police' || kind === 'taxi' ? 'ai' : null,
    steerVis: 0, lightPhase: Math.random() * 6,
    ai: { dirX: Math.cos(angle), dirY: Math.sin(angle), tx: x + Math.cos(angle) * 300, ty: y + Math.sin(angle) * 300, blockedT: 0, cruise: model.cruise },
    honkT: 0, smokeT: 0, skidT: 0, hitCooldown: 0,
  };
}

/** Spawn the parked, stealable cars on the world's parking spots. */
export function spawnParkedCars(G) {
  const rng = G.rng;
  for (const spot of G.world.parking) {
    if (!rng.chance(0.62)) continue;
    const model = rng.pick(CAR_MODELS.slice(0, 5));
    const car = createCar(model, spot.x, spot.y, spot.angle + rng.range(-0.06, 0.06), rng.pick(model.colors), 'parked');
    car.driver = null;
    G.cars.push(car);
  }
}

/** Spawn one traffic car at a far intersection, already rolling along a lane. */
export function spawnTrafficCar(G, far) {
  const rng = G.rng;
  const player = G.player;
  const spot = randomIntersection(rng, far ? player.x : null, far ? player.y : null, far ? 620 : 0, far ? 1500 : 0);
  const vertical = rng.chance(0.5);
  const dir = rng.chance(0.5) ? 1 : -1;
  const isTaxi = rng.chance(0.14);
  const model = isTaxi ? modelById('suncab') : rng.pick(CAR_MODELS.slice(0, 5));
  const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  const [ox, oy] = laneOffset(angle, 28);
  const car = createCar(model, spot.x + ox, spot.y + oy, angle, rng.pick(model.colors), isTaxi ? 'taxi' : 'traffic');
  car.ai.dirX = Math.cos(angle);
  car.ai.dirY = Math.sin(angle);
  car.ai.cruise = model.cruise * rng.range(0.85, 1.1);
  G.cars.push(car);
  return car;
}

/**
 * The lane offset for a heading: `lane` px to the driver's right of the road centre line.
 * The right vector of a heading in screen space (y down) is (-sin a, cos a): facing east the
 * right side is south, facing south it is west — right-hand traffic, checked per heading.
 */
export function laneOffset(angle, lane) {
  return [-Math.sin(angle) * lane, Math.cos(angle) * lane];
}

/**
 * Advance one car by dt under a control input {throttle -1..1, steer -1..1, handbrake}.
 * Handles building and car collisions, damage, sparks and skid marks (through G.events and
 * G.skids). Returns nothing; read car.vf for the forward speed afterwards.
 */
export function driveCar(G, car, dt, ctrl) {
  const model = car.model;
  if (car.wrecked) ctrl = { throttle: 0, steer: 0, handbrake: true };
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let vf = car.vx * fx + car.vy * fy;
  let vr = car.vx * rx + car.vy * ry;

  // Steering bites harder the faster you go, up to a point, and reverses when you reverse.
  const steerAuthority = Math.max(-1, Math.min(1, vf / 130));
  car.angle += ctrl.steer * 2.25 * steerAuthority * (ctrl.handbrake ? 1.45 : 1) * dt;
  car.steerVis = ctrl.steer;

  if (ctrl.throttle > 0) {
    vf += model.accel * ctrl.throttle * dt * Math.max(0.15, 1 - vf / model.topSpeed);
  } else if (ctrl.throttle < 0) {
    if (vf > 12) vf += 430 * ctrl.throttle * dt; // brake
    else vf = Math.max(-115, vf + 150 * ctrl.throttle * dt); // reverse
  }
  vf -= vf * 0.22 * dt; // drag and rolling resistance
  if (!ctrl.handbrake) vf -= vf * 0.1 * dt;
  vf = Math.max(-120, Math.min(model.topSpeed, vf));
  // Lateral grip: the tyres scrub sideways speed away; a handbrake lets the tail hang out.
  vr *= ctrl.handbrake ? 0.94 : Math.pow(1e-6, dt); // ~0.79 per step at 60 fps when gripping
  if (ctrl.handbrake) vr *= 0.995;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  const nrx = -nfy;
  const nry = nfx;
  car.vx = nfx * vf + nrx * vr;
  car.vy = nfy * vf + nry * vr;
  car.vf = vf;
  car.vr = vr;

  const beforeX = car.x;
  const beforeY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Cars keep off the sand and out of the sea.
  if (car.x > WORLD.sandX + 30) {
    car.x = WORLD.sandX + 30;
    car.vx = Math.min(0, car.vx);
  }

  const radius = model.width * 0.78;
  const speedBefore = Math.hypot(car.vx, car.vy);
  if (collideCircle(G.world, car, radius)) {
    const impact = speedBefore - Math.hypot(car.vx, car.vy);
    car.vx *= -0.18;
    car.vy *= -0.18;
    if (speedBefore > 130) {
      damageCar(G, car, (speedBefore - 120) * 0.055, beforeX, beforeY);
      G.events.push({ type: 'crash', x: car.x, y: car.y, hard: speedBefore > 240, mine: car.driver === 'player' });
      if (car.driver === 'player') G.shake = Math.min(9, (speedBefore - 120) * 0.03);
    }
  }

  // Car-to-car: soft circles, a shove and a dent each.
  for (let index = 0; index < G.cars.length; index += 1) {
    const other = G.cars[index];
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const minDist = (model.width + other.model.width) * 0.72;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist || distSq === 0) continue;
    const dist = Math.sqrt(distSq);
    const push = (minDist - dist) / 2;
    const nx = dx / dist;
    const ny = dy / dist;
    car.x -= nx * push;
    car.y -= ny * push;
    other.x += nx * push;
    other.y += ny * push;
    const rel = Math.abs(car.vf - other.vf) + Math.hypot(car.vx - other.vx, car.vy - other.vy) * 0.4;
    if (rel > 90 && car.hitCooldown <= 0) {
      car.hitCooldown = 0.25;
      damageCar(G, car, rel * 0.03, car.x, car.y);
      damageCar(G, other, rel * 0.03, other.x, other.y);
      G.events.push({ type: 'crash', x: (car.x + other.x) / 2, y: (car.y + other.y) / 2, hard: rel > 200, mine: car.driver === 'player' || other.driver === 'player', other });
      // Only the player's own crashes are crimes; the city's fender-benders are not.
      if (car.driver === 'player' || other.driver === 'player') {
        const victim = car.driver === 'player' ? other : car;
        G.reportCrime(victim.kind === 'police' ? 'hitcop' : 'hitcar', car.x, car.y);
      }
    }
  }
  if (car.hitCooldown > 0) car.hitCooldown -= dt;

  // Skid marks when the tyres are sliding or spinning.
  car.skidT -= dt;
  const sliding = Math.abs(vr) > 55 || (ctrl.handbrake && Math.abs(vf) > 60) || (ctrl.throttle > 0.7 && Math.abs(vf) < 40 && car.driver === 'player');
  if (sliding && Math.hypot(car.vx, car.vy) > 40 && car.skidT <= 0) {
    car.skidT = 0.03;
    G.skids.push({ x: car.x - nfx * 12, y: car.y - nfy * 12, life: 7 });
    if (G.skids.length > 420) G.skids.shift();
  }
  // Smoke from a hurt engine.
  car.smokeT -= dt;
  if (car.hp < 45 && car.smokeT <= 0) {
    car.smokeT = car.hp < 18 ? 0.05 : 0.14;
    G.particles.push({ kind: 'smoke', x: car.x + nfx * 16, y: car.y + nfy * 16, vx: G.rng.range(-8, 8), vy: G.rng.range(-16, -6), life: G.rng.range(0.5, 1), size: G.rng.range(4, 8) });
  }
}

/** Dent a car; at zero it is a wreck: engine dead, doors your only way out. */
export function damageCar(G, car, amount, x, y) {
  if (car.wrecked) return;
  car.hp -= amount;
  for (let i = 0; i < 3; i += 1) {
    G.particles.push({ kind: 'spark', x, y, vx: G.rng.range(-90, 90), vy: G.rng.range(-90, 90), life: G.rng.range(0.15, 0.4), size: 2 });
  }
  if (car.hp <= 0) {
    car.hp = 0;
    car.wrecked = true;
    G.events.push({ type: 'wreck', x: car.x, y: car.y });
  }
}

/** The next intersection centre ahead of a point along a heading, or null past the map edge. */
function nextIntersection(x, y, dirX, dirY) {
  if (dirX > 0.5) {
    for (let i = 0; i <= CITY.cols; i += 1) if (roadCenterX(i) > x + 24) return { x: roadCenterX(i), y };
  } else if (dirX < -0.5) {
    for (let i = CITY.cols; i >= 0; i -= 1) if (roadCenterX(i) < x - 24) return { x: roadCenterX(i), y };
  } else if (dirY > 0.5) {
    for (let j = 0; j <= CITY.rows; j += 1) if (roadCenterY(j) > y + 24) return { x, y: roadCenterY(j) };
  } else {
    for (let j = CITY.rows; j >= 0; j -= 1) if (roadCenterY(j) < y - 24) return { x, y: roadCenterY(j) };
  }
  return null;
}

/** Traffic control for one car: follow the lane, choose turns, mind the car in front. */
function trafficControl(G, car, dt) {
  const ai = car.ai;
  const fx = ai.dirX;
  const fy = ai.dirY;
  // Target: a point on our lane, ahead; when close to the next junction, decide the way on.
  const junction = nextIntersection(car.x, car.y, fx, fy);
  let tx = car.x + fx * 260;
  let ty = car.y + fy * 260;
  if (junction !== null) {
    const distJ = Math.hypot(junction.x - car.x, junction.y - car.y);
    if (distJ < 130) {
      // At the junction: mostly straight on, sometimes a turn (never a U-turn).
      if (ai.decided !== junction.x * 1000 + junction.y) {
        ai.decided = junction.x * 1000 + junction.y;
        const roll = G.rng.next();
        if (roll > 0.62) {
          const turn = roll > 0.81 ? 1 : -1;
          const ndx = turn > 0 ? -fy : fy;
          const ndy = turn > 0 ? fx : -fx;
          // Keep inside the city: no turning off the map.
          const probe = nextIntersection(junction.x, junction.y, ndx, ndy);
          if (probe !== null) {
            ai.dirX = ndx;
            ai.dirY = ndy;
          }
        }
      }
    }
    tx = junction.x + ai.dirX * 200;
    ty = junction.y + ai.dirY * 200;
  }
  // Snap the target onto the lane for the current heading: a horizontal run rides the nearest
  // horizontal road's lane line, a vertical run the nearest vertical road's.
  const [ox, oy] = laneOffset(Math.atan2(ai.dirY, ai.dirX), 28);
  if (Math.abs(ai.dirX) > 0.5) ty = nearestCenterY(car.y) + oy;
  else tx = nearestCenterX(car.x) + ox;
  ai.tx = tx;
  ai.ty = ty;

  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));

  // The car in front sets our speed; a wall of brake lights means stop.
  let target = ai.cruise;
  if (Math.abs(diff) > 0.45) target = Math.min(target, 85);
  for (let index = 0; index < G.cars.length; index += 1) {
    const other = G.cars[index];
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
    if (ahead > 0 && ahead < 62 && Math.abs(side) < 17) {
      target = ahead < 34 ? 0 : Math.min(target, Math.max(0, other.vf));
      if (other.driver === 'player' && ahead < 40) {
        ai.blockedT += dt;
        if (ai.blockedT > 2.2 && car.honkT <= 0) {
          car.honkT = G.rng.range(2, 4);
          G.events.push({ type: 'horn', x: car.x, y: car.y });
        }
      }
    }
  }
  // A pedestrian in the road is worth braking for, most days.
  for (let index = 0; index < G.peds.length; index += 1) {
    const ped = G.peds[index];
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
    if (ahead > 0 && ahead < 44 && Math.abs(side) < 14) target = 0;
  }
  if (car.honkT > 0) car.honkT -= dt;
  const throttle = Math.max(-1, Math.min(1, (target - car.vf) / 70));
  return { throttle, steer, handbrake: false };
}

function nearestCenterX(x) {
  let best = roadCenterX(0);
  for (let i = 1; i <= CITY.cols; i += 1) if (Math.abs(roadCenterX(i) - x) < Math.abs(best - x)) best = roadCenterX(i);
  return best;
}

function nearestCenterY(y) {
  let best = roadCenterY(0);
  for (let j = 1; j <= CITY.rows; j += 1) if (Math.abs(roadCenterY(j) - y) < Math.abs(best - y)) best = roadCenterY(j);
  return best;
}

/** Keep the traffic population topped up and moving; far-away cars quietly rejoin nearer. */
export function updateTraffic(G, dt) {
  const TARGET = 22;
  let count = 0;
  for (const car of G.cars) if (car.driver === 'ai' && car.kind !== 'police') count += 1;
  G.trafficTimer -= dt;
  if (count < TARGET && G.trafficTimer <= 0) {
    G.trafficTimer = 0.8;
    spawnTrafficCar(G, true);
  }
  for (const car of G.cars) {
    if (car.driver !== 'ai' || car.kind === 'police') continue;
    const dist = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (dist > 1750) {
      // Recycle: teleport the far car to a nearer junction, out of sight.
      const spot = randomIntersection(G.rng, G.player.x, G.player.y, 700, 1300);
      car.x = spot.x;
      car.y = spot.y;
      car.vx = 0;
      car.vy = 0;
      car.hp = 100;
      car.wrecked = false;
    }
    driveCar(G, car, dt, trafficControl(G, car, dt));
  }
}

export { isSand };
