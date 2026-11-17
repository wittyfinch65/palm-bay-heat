// People: the player on foot (walking, sprinting, punching, shooting, stealing cars), the
// crowds who stroll the sidewalks and the boardwalk and flee from trouble, bullets, and the
// cash that sometimes spills out of a bad day. Officers live in police.js; this is everyone
// else, plus the body the player wears between cars.
import { PLAYER, SPAWN, WORLD } from './config.js';
import { blockRect, collideCircle, isSand, isWater } from './world.js';
import { damageCar } from './vehicles.js';
import { reportCrime, spawnFootCop } from './police.js';

const SHIRTS = ['#f2e6c9', '#7fb3d5', '#e58e8e', '#98d8a8', '#f5c66b', '#b39ddb', '#eeeeee', '#5db9c4'];
const PANTS = ['#3a4a5c', '#6b4a2f', '#2e2e38', '#7a8288', '#274b63'];

/** The player body, freshly woken on the coast road. Health, car and cooldowns live here. */
export function createPlayer() {
  return {
    x: SPAWN.x, y: SPAWN.y, angle: SPAWN.angle, hp: PLAYER.maxHealth,
    inCar: null, shotCd: 0, punchCd: 0, bustMeter: 0, walkPhase: 0,
    lastHurtT: -99, radius: PLAYER.radius,
  };
}

/** Hurt the player; the main loop turns a dead player into the wasted screen. */
export function hurtPlayer(G, amount) {
  const player = G.player;
  if (G.screen !== 'play') return;
  player.hp -= amount;
  player.lastHurtT = G.time;
  G.events.push({ type: 'hurt', amount });
  if (player.hp <= 0) {
    player.hp = 0;
    G.events.push({ type: 'wasted' });
  }
}

/** One pedestrian: a loop of sidewalk waypoints, a shirt, and a sense of self-preservation. */
function createPed(G, rng) {
  let x;
  let y;
  if (rng.chance(0.22)) {
    x = WORLD.boardwalkX + rng.range(-12, 12);
    y = rng.range(80, WORLD.height - 80);
  } else {
    const rect = blockRect(rng.int(0, 6), rng.int(0, 4));
    x = rect.x + rng.range(10, rect.w - 10);
    y = rect.y + 12;
  }
  return {
    x, y, angle: rng.range(0, Math.PI * 2), speed: rng.range(52, 84), hp: 100,
    state: 'walk', tx: x, ty: y, waitT: 0, panicT: 0, fleeX: 0, fleeY: 0,
    shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), walkPhase: rng.range(0, 6), downT: 0,
  };
}

/** Keep the sidewalks populated. */
export function spawnPeds(G, count) {
  for (let i = 0; i < count; i += 1) G.peds.push(createPed(G, G.rng));
}

/** A fresh waypoint: another stretch of sidewalk, a block away at most, or the boardwalk. */
function pickPedTarget(G, ped) {
  const rng = G.rng;
  if (rng.chance(0.2)) {
    ped.tx = WORLD.boardwalkX + rng.range(-12, 12);
    ped.ty = Math.max(60, Math.min(WORLD.height - 60, ped.y + rng.range(-420, 420)));
    return;
  }
  const rect = blockRect(rng.int(0, 6), rng.int(0, 4));
  const side = rng.int(0, 3);
  const along = rng.range(0, 1);
  if (side === 0) { ped.tx = rect.x + along * rect.w; ped.ty = rect.y + 12; }
  else if (side === 1) { ped.tx = rect.x + along * rect.w; ped.ty = rect.y + rect.h - 12; }
  else if (side === 2) { ped.tx = rect.x + 12; ped.ty = rect.y + along * rect.h; }
  else { ped.tx = rect.x + rect.w - 12; ped.ty = rect.y + along * rect.h; }
}

/** Panic a pedestrian away from a point (a gunshot, a near miss, a fist). */
export function scarePed(G, ped, fromX, fromY) {
  ped.state = 'flee';
  ped.panicT = G.rng.range(1.6, 3.2);
  ped.fleeX = fromX;
  ped.fleeY = fromY;
}

/** Knock a pedestrian down or out; a body on the pavement is a serious crime scene. */
export function hurtPed(G, ped, amount, byPlayer) {
  ped.hp -= amount;
  if (ped.hp <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.downT = 0;
    if (byPlayer) {
      reportCrime(G, 'hitped', ped.x, ped.y);
      if (G.rng.chance(0.45)) {
        G.pickups.push({ kind: 'cash', x: ped.x, y: ped.y, amount: G.rng.int(5, 42), life: 25 });
      }
    }
  } else if (ped.state !== 'down') {
    scarePed(G, ped, G.player.x, G.player.y);
  }
}

/** All pedestrians, one step: stroll, wait, flee, get out of the road, fall where they fall. */
export function updatePeds(G, dt) {
  const player = G.player;
  for (let index = G.peds.length - 1; index >= 0; index -= 1) {
    const ped = G.peds[index];
    if (ped.state === 'down') {
      ped.downT += dt;
      if (ped.downT > 26) G.peds.splice(index, 1);
      continue;
    }
    // Cars are the weather here: a fast one close by clears the pavement.
    for (const car of G.cars) {
      const speed = Math.hypot(car.vx, car.vy);
      if (speed < 70) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > 52 * 52) continue;
      const dist = Math.sqrt(distSq) || 1;
      if (dist < car.model.width * 0.72 + 9) {
        // Struck.
        ped.hp -= speed * 0.55;
        ped.x += (dx / dist) * 12;
        ped.y += (dy / dist) * 12;
        G.events.push({ type: 'pedhit', x: ped.x, y: ped.y, mine: car.driver === 'player' });
        if (ped.hp <= 0) {
          ped.state = 'down';
          ped.downT = 0;
          if (car.driver === 'player') {
            reportCrime(G, 'hitped', ped.x, ped.y);
            G.shake = Math.min(6, speed * 0.012);
          }
        } else {
          scarePed(G, ped, car.x, car.y);
          if (car.driver === 'player') reportCrime(G, 'hitped', ped.x, ped.y);
        }
      } else if (ped.state === 'walk') {
        scarePed(G, ped, car.x, car.y);
      }
    }
    if (ped.state === 'flee') {
      ped.panicT -= dt;
      const dx = ped.x - ped.fleeX;
      const dy = ped.y - ped.fleeY;
      const dist = Math.hypot(dx, dy) || 1;
      ped.x += (dx / dist) * 196 * dt;
      ped.y += (dy / dist) * 196 * dt;
      ped.angle = Math.atan2(dy, dx);
      ped.walkPhase += dt * 12;
      if (ped.panicT <= 0) {
        ped.state = 'walk';
        pickPedTarget(G, ped);
      }
    } else {
      if (ped.waitT > 0) {
        ped.waitT -= dt;
      } else {
        const dx = ped.tx - ped.x;
        const dy = ped.ty - ped.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 9) {
          if (G.rng.chance(0.24)) ped.waitT = G.rng.range(0.5, 2.6);
          pickPedTarget(G, ped);
        } else {
          ped.x += (dx / dist) * ped.speed * dt;
          ped.y += (dy / dist) * ped.speed * dt;
          ped.angle = Math.atan2(dy, dx);
          ped.walkPhase += dt * 7;
        }
      }
    }
    collideCircle(G.world, ped, 9);
    if (ped.x > WORLD.waterX - 12) ped.x = WORLD.waterX - 12;
    void player;
  }
  // Keep the crowd topped up near the player.
  G.pedTimer -= dt;
  if (G.peds.length < 34 && G.pedTimer <= 0) {
    G.pedTimer = 1.2;
    const ped = createPed(G, G.rng);
    if (Math.hypot(ped.x - G.player.x, ped.y - G.player.y) > 500) G.peds.push(ped);
  }
}

/** The nearest car the player could get into, or null. */
export function nearestEnterableCar(G, maxDist) {
  const player = G.player;
  let best = null;
  let bestDist = maxDist;
  for (const car of G.cars) {
    if (car.driver === 'player') continue;
    const dist = Math.hypot(car.x - player.x, car.y - player.y) - car.model.length * 0.3;
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

/**
 * The E key: climb into the nearest car (pulling its driver out onto the street if it has
 * one — a crime with witnesses), or climb out of the current one onto the kerb.
 */
export function enterExitCar(G) {
  const player = G.player;
  if (player.inCar) {
    const car = player.inCar;
    car.driver = null;
    player.inCar = null;
    const side = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * (car.model.width + 8);
    player.y = car.y + Math.sin(side) * (car.model.width + 8);
    collideCircle(G.world, player, player.radius);
    G.events.push({ type: 'exitcar' });
    return;
  }
  const car = nearestEnterableCar(G, 52);
  if (car === null) return;
  if (car.wrecked) {
    G.toast = { text: 'That car is wrecked. Find another.', t: 2.2 };
    return;
  }
  if (car.driver === 'ai') {
    if (car.kind === 'police') {
      reportCrime(G, 'jackcop', car.x, car.y);
      spawnFootCop(G, car.x + 14, car.y + 10);
    } else {
      reportCrime(G, 'jack', car.x, car.y);
      const driver = createPed(G, G.rng);
      driver.x = car.x - 14;
      driver.y = car.y + 10;
      scarePed(G, driver, car.x, car.y);
      G.peds.push(driver);
    }
  } else {
    reportCrime(G, 'jack', car.x, car.y);
  }
  car.driver = 'player';
  car.copsOut = false;
  player.inCar = car;
  player.bustMeter = 0;
  G.stats.jacked += 1;
  G.events.push({ type: 'entercar', car });
}

/** One punch: whatever is in front of the fist — a face, an officer, or a fender. */
function throwPunch(G) {
  const player = G.player;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  const hx = player.x + fx * PLAYER.punchRange;
  const hy = player.y + fy * PLAYER.punchRange;
  G.events.push({ type: 'punch', x: hx, y: hy });
  for (const ped of G.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - hx, ped.y - hy) < 20) {
      hurtPed(G, ped, PLAYER.punchDamage, true);
      reportCrime(G, 'punch', ped.x, ped.y);
      return;
    }
  }
  for (const cop of G.cops) {
    if (cop.state !== 'down' && Math.hypot(cop.x - hx, cop.y - hy) < 20) {
      cop.hp -= PLAYER.punchDamage;
      reportCrime(G, 'hitcop', cop.x, cop.y);
      if (cop.hp <= 0) {
        cop.state = 'down';
        cop.downT = 0;
        reportCrime(G, 'kill', cop.x, cop.y);
      }
      return;
    }
  }
  for (const car of G.cars) {
    if (Math.hypot(car.x - hx, car.y - hy) < car.model.length * 0.55) {
      damageCar(G, car, 3, hx, hy);
      reportCrime(G, 'hitcar', car.x, car.y);
      return;
    }
  }
}

/** The player on foot, one step: move, aim at the mouse, punch with F, shoot with the mouse. */
export function updatePlayerOnFoot(G, input, dt) {
  const player = G.player;
  player.shotCd -= dt;
  player.punchCd -= dt;

  const ax = input.axisX();
  const ay = input.axisY();
  const sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
  let speed = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (isSand(player.x)) speed *= 0.78;
  if (ax !== 0 || ay !== 0) {
    const len = Math.hypot(ax, ay);
    player.x += (ax / len) * speed * dt;
    player.y += (ay / len) * speed * dt;
    player.angle = Math.atan2(ay, ax);
    player.walkPhase += dt * (sprinting ? 11 : 8);
  }
  collideCircle(G.world, player, player.radius);
  if (player.x > WORLD.waterX - 10) player.x = WORLD.waterX - 10;
  if (isWater(player.x)) player.x = WORLD.waterX - 10;

  // Aim: while the mouse is down the player faces the cursor, not the walk direction.
  if (input.mouse.down) {
    player.angle = Math.atan2(G.mouseWorld.y - player.y, G.mouseWorld.x - player.x);
  }

  const pressed = G.pressed;
  if (pressed.has('KeyF') && player.punchCd <= 0) {
    player.punchCd = 0.34;
    throwPunch(G);
  }
  if (input.mouse.down && player.shotCd <= 0) {
    player.shotCd = PLAYER.shotCooldown;
    const angle = Math.atan2(G.mouseWorld.y - player.y, G.mouseWorld.x - player.x);
    G.bullets.push({
      x: player.x + Math.cos(angle) * 14, y: player.y + Math.sin(angle) * 14,
      vx: Math.cos(angle) * PLAYER.bulletSpeed, vy: Math.sin(angle) * PLAYER.bulletSpeed,
      life: PLAYER.bulletRange / PLAYER.bulletSpeed, from: 'player', hit: true,
    });
    G.particles.push({ kind: 'muzzle', x: player.x + Math.cos(angle) * 16, y: player.y + Math.sin(angle) * 16, vx: 0, vy: 0, life: 0.05, size: 5 });
    reportCrime(G, 'shoot', player.x, player.y);
    for (const ped of G.peds) {
      if (Math.hypot(ped.x - player.x, ped.y - player.y) < 190 && ped.state === 'walk') scarePed(G, ped, player.x, player.y);
    }
    G.events.push({ type: 'shot', x: player.x, y: player.y });
  }

  // Slow recovery when nobody has hurt you lately.
  if (G.time - player.lastHurtT > 6 && player.hp > 0 && player.hp < PLAYER.maxHealth) {
    player.hp = Math.min(PLAYER.maxHealth, player.hp + 1.5 * dt);
  }
}

/** Bullets, one step: fly, strike buildings, cars, people — and the player, when a cop fires. */
export function updateBullets(G, dt) {
  for (let index = G.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = G.bullets[index];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let dead = bullet.life <= 0;
    if (!dead) {
      for (const b of G.world.buildings) {
        if (bullet.x > b.x && bullet.x < b.x + b.w && bullet.y > b.y && bullet.y < b.y + b.h) {
          G.particles.push({ kind: 'spark', x: bullet.x, y: bullet.y, vx: 0, vy: 0, life: 0.15, size: 2 });
          dead = true;
          break;
        }
      }
    }
    if (!dead && bullet.from === 'player') {
      for (const car of G.cars) {
        if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < car.model.width * 0.85) {
          damageCar(G, car, 7, bullet.x, bullet.y);
          if (car.kind === 'police') reportCrime(G, 'hitcop', car.x, car.y);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const cop of G.cops) {
          if (cop.state !== 'down' && Math.hypot(cop.x - bullet.x, cop.y - bullet.y) < 11) {
            cop.hp -= PLAYER.bulletDamage;
            if (cop.hp <= 0) {
              cop.state = 'down';
              cop.downT = 0;
              reportCrime(G, 'kill', cop.x, cop.y);
            } else reportCrime(G, 'hitcop', cop.x, cop.y);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of G.peds) {
          if (ped.state !== 'down' && Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 10) {
            hurtPed(G, ped, PLAYER.bulletDamage, true);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && bullet.from === 'cop' && !G.player.inCar) {
      if (Math.hypot(G.player.x - bullet.x, G.player.y - bullet.y) < 11) {
        if (bullet.hit) hurtPlayer(G, G.rng.range(5, 9));
        dead = true;
      }
    }
    if (dead) G.bullets.splice(index, 1);
  }
}

/** Cash pickups drift toward the player and land in the wallet. */
export function updatePickups(G, dt) {
  const player = G.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  for (let index = G.pickups.length - 1; index >= 0; index -= 1) {
    const pickup = G.pickups[index];
    pickup.life -= dt;
    const dist = Math.hypot(px - pickup.x, py - pickup.y);
    if (dist < 90) {
      pickup.x += ((px - pickup.x) / (dist || 1)) * 130 * dt;
      pickup.y += ((py - pickup.y) / (dist || 1)) * 130 * dt;
    }
    if (dist < 24) {
      G.cash += pickup.amount;
      G.stats.earned += pickup.amount;
      G.events.push({ type: 'pickup', amount: pickup.amount, x: pickup.x, y: pickup.y });
      G.pickups.splice(index, 1);
    } else if (pickup.life <= 0) {
      G.pickups.splice(index, 1);
    }
  }
}
