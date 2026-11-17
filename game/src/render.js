// Drawing the world: asphalt and crosswalks, pastel deco blocks with shadows that lean as the
// sun moves, the boardwalk, the sand and the animated sea, palms and lamps, cars with flashing
// lightbars, people, mission beacons, and the day's light laid over everything. The HUD lives
// in hud.js; this file paints only what a camera over Palm Bay would see.
import { CITY, DAY_SECONDS, PALETTE, WORLD } from './config.js';
import { blockRect, districtOfBlock, roadCenterX, roadCenterY } from './world.js';

/** How dark the world is at a dayTime (0 at noon, up to 0.85 in the small hours). */
export function darknessAt(dayTime) {
  const sun = Math.sin((dayTime - 0.25) * Math.PI * 2); // -1 at midnight, +1 at noon
  return Math.max(0, Math.min(0.85, 0.55 - sun * 0.62));
}

/** Golden warmth: strongest near sunrise and sunset. */
export function warmthAt(dayTime) {
  const sun = Math.sin((dayTime - 0.25) * Math.PI * 2);
  const low = 1 - Math.abs(sun);
  return Math.max(0, low * low - 0.18);
}

function shade(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}

/** A deterministic 0..1 hash of two integers, for speckles and lit windows that never flicker. */
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720, dpr: 1 };

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  /** The camera's visible world rectangle this frame. */
  function visibleRect(G) {
    return {
      x: G.camera.x - view.w / 2 - 90,
      y: G.camera.y - view.h / 2 - 90,
      w: view.w + 180,
      h: view.h + 180,
    };
  }

  function drawGround(G, vis) {
    ctx.fillStyle = PALETTE.blockGround;
    ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
    // Block grounds: grass in the Heights, concrete elsewhere, a sidewalk rim around each.
    for (const ground of G.world.ground) {
      if (ground.x + ground.w < vis.x || ground.x > vis.x + vis.w || ground.y + ground.h < vis.y || ground.y > vis.y + vis.h) continue;
      ctx.fillStyle = ground.grass ? PALETTE.grass : '#969ea3';
      ctx.fillRect(ground.x - 8, ground.y - 8, ground.w + 16, ground.h + 16);
      ctx.fillStyle = ground.grass ? shade(PALETTE.grass, 0.92) : '#8b9297';
      ctx.fillRect(ground.x + 8, ground.y + 8, ground.w - 16, ground.h - 16);
    }
    // Roads: full-length asphalt strips both ways.
    ctx.fillStyle = PALETTE.asphalt;
    for (let i = 0; i <= CITY.cols; i += 1) {
      const x = roadCenterX(i) - CITY.road / 2;
      if (x + CITY.road < vis.x || x > vis.x + vis.w) continue;
      ctx.fillRect(x, vis.y, CITY.road, vis.h);
    }
    for (let j = 0; j <= CITY.rows; j += 1) {
      const y = roadCenterY(j) - CITY.road / 2;
      if (y + CITY.road < vis.y || y > vis.y + vis.h) continue;
      ctx.fillRect(vis.x, y, vis.w, CITY.road);
    }
    // Lane dashes and crosswalks.
    ctx.fillStyle = PALETTE.lanePaint;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i <= CITY.cols; i += 1) {
      const cx = roadCenterX(i);
      if (cx < vis.x || cx > vis.x + vis.w) continue;
      for (let y = Math.floor(vis.y / 44) * 44; y < vis.y + vis.h; y += 44) {
        const my = ((y % CITY.pitch) + CITY.pitch) % CITY.pitch;
        if (my < CITY.road - 8) continue; // no dashes through junctions
        ctx.fillRect(cx - 2, y, 4, 24);
      }
    }
    for (let j = 0; j <= CITY.rows; j += 1) {
      const cy = roadCenterY(j);
      if (cy < vis.y || cy > vis.y + vis.h) continue;
      for (let x = Math.floor(vis.x / 44) * 44; x < vis.x + vis.w; x += 44) {
        const mx = ((x % CITY.pitch) + CITY.pitch) % CITY.pitch;
        if (mx < CITY.road - 8) continue;
        ctx.fillRect(x, cy - 2, 24, 4);
      }
    }
    ctx.globalAlpha = 0.5;
    for (let i = 0; i <= CITY.cols; i += 1) {
      for (let j = 0; j <= CITY.rows; j += 1) {
        const cx = roadCenterX(i);
        const cy = roadCenterY(j);
        if (cx + 70 < vis.x || cx - 70 > vis.x + vis.w || cy + 70 < vis.y || cy - 70 > vis.y + vis.h) continue;
        for (let s = -48; s <= 48; s += 16) {
          ctx.fillRect(cx + s - 5, cy - CITY.road / 2 + 6, 10, 5);
          ctx.fillRect(cx + s - 5, cy + CITY.road / 2 - 11, 10, 5);
          ctx.fillRect(cx - CITY.road / 2 + 6, cy + s - 5, 5, 10);
          ctx.fillRect(cx + CITY.road / 2 - 11, cy + s - 5, 5, 10);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Parking ticks on the coast road and downtown kerbs.
    ctx.strokeStyle = 'rgba(232,228,210,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const spot of G.world.parking) {
      if (spot.x < vis.x || spot.x > vis.x + vis.w || spot.y < vis.y || spot.y > vis.y + vis.h) continue;
      ctx.moveTo(spot.x - 14, spot.y - 20);
      ctx.lineTo(spot.x - 14, spot.y + 20);
    }
    ctx.stroke();
  }

  function drawBeach(G, vis) {
    // Sand, then the sea with a breathing foam line.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(WORLD.sandX, vis.y, WORLD.waterX - WORLD.sandX, vis.h);
    ctx.fillStyle = PALETTE.sandDark;
    for (let gx = Math.floor(vis.x / 52) * 52; gx < vis.x + vis.w; gx += 52) {
      for (let gy = Math.floor(vis.y / 52) * 52; gy < vis.y + vis.h; gy += 52) {
        if (gx < WORLD.sandX || gx > WORLD.waterX) continue;
        if (hash2(gx, gy) > 0.6) ctx.fillRect(gx + hash2(gy, gx) * 30, gy + hash2(gx, gy * 3) * 30, 5, 3);
      }
    }
    // The boardwalk: a pale promenade strip.
    ctx.fillStyle = '#d9c9a8';
    ctx.fillRect(WORLD.boardwalkX - 16, vis.y, 32, vis.h);
    const grad = ctx.createLinearGradient(WORLD.waterX, 0, WORLD.width, 0);
    grad.addColorStop(0, PALETTE.water);
    grad.addColorStop(1, PALETTE.waterDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(WORLD.waterX, vis.y, WORLD.width - WORLD.waterX, vis.h);
    ctx.strokeStyle = PALETTE.waterFoam;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = vis.y; y < vis.y + vis.h; y += 14) {
      const x = WORLD.waterX + Math.sin(y * 0.02 + G.time * 1.4) * 7;
      if (y === vis.y) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(191,238,242,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = vis.y; y < vis.y + vis.h; y += 90) {
      const x = WORLD.waterX + 40 + hash2(3, Math.floor(y / 90)) * 200;
      ctx.moveTo(x, y + Math.sin(G.time + y) * 3);
      ctx.lineTo(x + 34, y + Math.sin(G.time + y) * 3);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawBuildings(G, vis, darkness) {
    for (const b of G.world.buildings) {
      if (b.x + b.w < vis.x || b.x > vis.x + vis.w || b.y + b.h < vis.y || b.y > vis.y + vis.h) continue;
      const lift = Math.min(26, 4 + b.floors * 1.7);
      // Shadow, leaning south-east, longer for taller blocks.
      ctx.fillStyle = 'rgba(16,20,28,0.30)';
      ctx.fillRect(b.x + lift * 0.55, b.y + lift * 0.7, b.w, b.h);
      // Facade and its shaded south face.
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = shade(b.color, 0.78);
      ctx.fillRect(b.x, b.y + b.h - lift, b.w, lift);
      // Windows on the south face: small panes in a row, lit after dark.
      const cols = Math.max(2, Math.floor(b.w / 19));
      for (let c = 0; c < cols; c += 1) {
        const wx = b.x + 8 + c * ((b.w - 16) / cols);
        const lit = darkness > 0.32 && hash2(b.seed, c) > 0.45;
        ctx.fillStyle = lit ? 'rgba(255,205,110,0.95)' : 'rgba(30,42,58,0.45)';
        ctx.fillRect(wx, b.y + b.h - lift + 3, 6, Math.max(3, lift - 7));
      }
      // The roof keeps the facade's pastel family: a parapet in the roof colour, a lighter
      // panel inside it, and a few plant boxes — so the blocks read as deco, not slabs.
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8 - lift * 0.35);
      ctx.fillStyle = shade(b.color, 1.07);
      ctx.fillRect(b.x + 11, b.y + 11, b.w - 22, b.h - 22 - lift * 0.35);
      if (b.kind === 'warehouse') {
        // Corrugated roofing: seams across the panel so the port blocks read as sheds.
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        for (let sx = b.x + 23; sx < b.x + b.w - 24; sx += 16) {
          ctx.fillRect(sx, b.y + 11, 2, b.h - 22 - lift * 0.35);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      const boxes = 1 + (b.seed % 3);
      for (let k = 0; k < boxes; k += 1) {
        const bx = b.x + 16 + hash2(b.seed, k * 7) * Math.max(4, b.w - 56);
        const by = b.y + 14 + hash2(b.seed, k * 13) * Math.max(4, b.h - 52);
        ctx.fillRect(bx, by, 15, 10);
      }
      // A named place gets its sign painted on the roof, readable from the sky.
      if (b.name) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 - lift * 0.2);
      }
    }
  }

  function drawProps(G, vis, darkness) {
    for (const prop of G.world.props) {
      if (prop.x < vis.x || prop.x > vis.x + vis.w || prop.y < vis.y || prop.y > vis.y + vis.h) continue;
      if (prop.kind === 'palm') {
        const sway = Math.sin(G.time * 0.9 + prop.seed) * 1.6;
        ctx.strokeStyle = PALETTE.palmTrunk;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(prop.x, prop.y);
        ctx.lineTo(prop.x + sway, prop.y - 9);
        ctx.stroke();
        ctx.strokeStyle = PALETTE.palmLeaf;
        ctx.lineWidth = 2.4;
        for (let f = 0; f < 6; f += 1) {
          const a = (f / 6) * Math.PI * 2 + prop.seed;
          ctx.beginPath();
          ctx.moveTo(prop.x + sway, prop.y - 9);
          ctx.quadraticCurveTo(
            prop.x + sway + Math.cos(a) * 9, prop.y - 13 + Math.sin(a) * 3,
            prop.x + sway + Math.cos(a) * 15, prop.y - 7 + Math.sin(a) * 6,
          );
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#5a6167';
        ctx.fillRect(prop.x - 1.5, prop.y - 7, 3, 9);
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y - 8, 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (darkness > 0.3) {
          const glow = ctx.createRadialGradient(prop.x, prop.y - 8, 2, prop.x, prop.y - 8, 30);
          glow.addColorStop(0, `rgba(255,205,110,${0.20 * darkness})`);
          glow.addColorStop(1, 'rgba(255,205,110,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(prop.x - 30, prop.y - 38, 60, 60);
        }
      }
    }
  }

  function drawSkids(G, vis) {
    ctx.fillStyle = 'rgba(12,12,14,0.5)';
    for (const skid of G.skids) {
      if (skid.x < vis.x || skid.x > vis.x + vis.w || skid.y < vis.y || skid.y > vis.y + vis.h) continue;
      ctx.globalAlpha = Math.min(0.5, skid.life / 7 * 0.5);
      ctx.fillRect(skid.x - 3, skid.y - 2, 7, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawBeacon(x, y, color, label, G) {
    const pulse = 1 + Math.sin(G.time * 4) * 0.12;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    const grad = ctx.createLinearGradient(x, y - 190, x, y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.30;
    ctx.fillRect(x - 9, y - 190, 18, 190);
    ctx.globalAlpha = 1;
    const bobY = y - 52 + Math.sin(G.time * 3) * 5;
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(x, bobY);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
    if (label) {
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,14,20,0.65)';
      const w = ctx.measureText(label).width + 14;
      ctx.fillRect(x - w / 2, bobY - 34, w, 19);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x, bobY - 20);
    }
  }

  function drawMarkers(G) {
    // Start markers first (story in gold-white, activities in their colours), then the target.
    for (const marker of G.startMarkersCache ?? []) {
      drawBeacon(marker.x, marker.y, marker.kind === 'story' ? '#ffffff' : '#ffd34d', null, G);
    }
    const objective = G.objective;
    if (objective && objective.x !== null && objective.x !== undefined) {
      drawBeacon(objective.x, objective.y, '#ffd34d', null, G);
    }
    // The current race gate gets posts and a line.
    if (G.mission && G.mission.race) {
      const [gx, gy] = G.mission.race.points[G.mission.race.index];
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(gx - 44, gy - 4, 10, 8);
      ctx.fillRect(gx + 34, gy - 4, 10, 8);
      ctx.strokeStyle = 'rgba(255,82,82,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(gx - 39, gy);
      ctx.lineTo(gx + 39, gy);
      ctx.stroke();
    }
  }

  function drawPickups(G) {
    for (const pickup of G.pickups) {
      const bob = Math.sin(G.time * 5 + pickup.x) * 3;
      ctx.fillStyle = PALETTE.cashGreen;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c2e1a';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', pickup.x, pickup.y + bob + 0.5);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(G, car, darkness) {
    const model = car.model;
    ctx.save();
    ctx.translate(car.x, car.y);
    // Headlight cones after dark.
    if (darkness > 0.25 && !car.wrecked) {
      ctx.rotate(car.angle);
      const cone = ctx.createLinearGradient(model.length / 2, 0, model.length / 2 + 95, 0);
      cone.addColorStop(0, `rgba(255,240,190,${0.20 * darkness})`);
      cone.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(model.length / 2, -7);
      ctx.lineTo(model.length / 2 + 95, -24);
      ctx.lineTo(model.length / 2 + 95, 24);
      ctx.lineTo(model.length / 2, 7);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-car.angle);
    }
    // Shadow.
    ctx.fillStyle = 'rgba(10,12,16,0.35)';
    ctx.beginPath();
    ctx.ellipse(4, 6, model.length * 0.55, model.width * 0.62, car.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(car.angle);
    const L = model.length;
    const W = model.width;
    // Wheels (the front pair turns with the steering).
    ctx.fillStyle = '#15171c';
    const wheel = (wx, wy, steer) => {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(steer);
      ctx.fillRect(-5, -2.6, 10, 5.2);
      ctx.restore();
    };
    wheel(L * 0.31, -W / 2 + 1, car.steerVis * 0.42);
    wheel(L * 0.31, W / 2 - 1, car.steerVis * 0.42);
    wheel(-L * 0.31, -W / 2 + 1, 0);
    wheel(-L * 0.31, W / 2 - 1, 0);
    // Body.
    ctx.fillStyle = car.wrecked ? shade('#777777', 0.8) : car.color;
    roundRect(-L / 2, -W / 2, L, W, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,12,16,0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (car.kind === 'police') {
      ctx.fillStyle = PALETTE.copBlue;
      ctx.fillRect(-L * 0.08, -W / 2 + 1.5, L * 0.3, W - 3);
      // Lightbar: red and blue trading flashes.
      const phase = Math.floor(G.time * 3.4 + car.lightPhase) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#5a1f1f';
      roundRect(-6, -W / 2 + 3, 9, 6, 2);
      ctx.fill();
      ctx.fillStyle = phase ? '#274b9f' : '#35c4ff';
      roundRect(-6, W / 2 - 9, 9, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 8.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('POLICE', 2, 0);
    } else if (car.kind === 'taxi') {
      ctx.fillStyle = '#10131c';
      ctx.fillRect(-L / 2 + 3, -3, L - 6, 6);
      ctx.fillStyle = PALETTE.taxiYellow;
      roundRect(-7, -6, 14, 12, 2);
      ctx.fill();
      ctx.fillStyle = '#10131c';
      ctx.font = '900 7.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', 0, 0.5);
    }
    // Cabin: windshield, roof, rear glass.
    ctx.fillStyle = 'rgba(18,28,40,0.88)';
    roundRect(-L * 0.02, -W / 2 + 3.4, L * 0.13, W - 6.8, 3);
    ctx.fill();
    ctx.fillStyle = shade(car.wrecked ? '#777777' : car.color, 0.88);
    roundRect(-L * 0.30, -W / 2 + 3, L * 0.26, W - 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(18,28,40,0.7)';
    roundRect(-L * 0.44, -W / 2 + 3.4, L * 0.1, W - 6.8, 3);
    ctx.fill();
    // Damage: a crumpled nose when the car has suffered.
    if (car.hp < 55) {
      ctx.fillStyle = 'rgba(20,20,22,0.45)';
      ctx.beginPath();
      ctx.arc(L / 2 - 3, 0, 6 + (55 - car.hp) * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, opts, G) {
    ctx.fillStyle = 'rgba(10,12,16,0.30)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (opts.down) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = shirt;
      roundRect(-13, -6, 26, 12, 6);
      ctx.fill();
      ctx.fillStyle = opts.skin;
      ctx.beginPath();
      ctx.arc(15, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(opts.walkPhase ?? 0) * 1.4;
    ctx.fillStyle = opts.pants;
    ctx.beginPath();
    ctx.arc(x, y, 7.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(x, y + bob * 0.3, 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = opts.skin;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 2.4, y + Math.sin(angle) * 2.4 + bob * 0.3, 4.4, 0, Math.PI * 2);
    ctx.fill();
    if (opts.cap) {
      ctx.fillStyle = opts.cap;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * 2.4, y + Math.sin(angle) * 2.4 + bob * 0.3, 4.6, angle - 1.9, angle + 1.9);
      ctx.fill();
    }
    if (opts.marker) {
      ctx.fillStyle = '#ffd34d';
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, y - 16 + Math.sin(G.time * 5) * 2);
    }
  }

  function drawPeople(G, vis) {
    for (const ped of G.peds) {
      if (ped.x < vis.x || ped.x > vis.x + vis.w || ped.y < vis.y || ped.y > vis.y + vis.h) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, {
        pants: ped.pants, skin: '#d9a066', walkPhase: ped.walkPhase, down: ped.state === 'down',
        marker: ped.passenger === true,
      }, G);
    }
    for (const cop of G.cops) {
      if (cop.x < vis.x || cop.x > vis.x + vis.w || cop.y < vis.y || cop.y > vis.y + vis.h) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#274b9f', {
        pants: '#1c2f52', skin: '#c98d5e', walkPhase: cop.walkPhase, down: cop.state === 'down', cap: '#16283f',
      }, G);
    }
  }

  function drawPlayer(G) {
    const player = G.player;
    if (player.inCar) return;
    drawPerson(player.x, player.y, player.angle, PALETTE.playerShirt, {
      pants: '#22303e', skin: '#b97a4e', walkPhase: player.walkPhase, down: false,
    }, G);
    // A soft ring so the player reads at a glance in a crowd.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 13 + Math.sin(G.time * 4) * 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPlayerChevron(G) {
    const target = G.player.inCar ?? G.player;
    const y = target.y - 44 + Math.sin(G.time * 5) * 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(target.x - 7, y);
    ctx.lineTo(target.x + 7, y);
    ctx.lineTo(target.x, y + 9);
    ctx.closePath();
    ctx.fill();
  }

  function drawBullets(G) {
    ctx.strokeStyle = 'rgba(255,230,150,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const bullet of G.bullets) {
      ctx.moveTo(bullet.x - bullet.vx * 0.012, bullet.y - bullet.vy * 0.012);
      ctx.lineTo(bullet.x, bullet.y);
    }
    ctx.stroke();
  }

  function drawParticles(G) {
    for (const p of G.particles) {
      if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(70,70,76,${Math.min(0.4, p.life * 0.4)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - p.life) * 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(255,190,60,${Math.min(1, p.life * 3)})`;
        ctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
      } else if (p.kind === 'muzzle') {
        ctx.fillStyle = 'rgba(255,220,120,0.95)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLighting(G, vis) {
    const darkness = darknessAt(G.dayTime);
    const warmth = warmthAt(G.dayTime);
    if (warmth > 0.02) {
      ctx.fillStyle = `rgba(255,138,54,${warmth * 0.16})`;
      ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
    }
    if (darkness > 0.02) {
      ctx.fillStyle = `rgba(10,16,44,${darkness * 0.52})`;
      ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
    }
    return darkness;
  }

  /** Paint the whole world for this frame. The HUD is drawn separately, in screen space. */
  function draw(G) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, view.w, view.h);
    const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    ctx.save();
    ctx.translate(view.w / 2 - G.camera.x + shakeX, view.h / 2 - G.camera.y + shakeY);
    const vis = visibleRect(G);
    const darkness = darknessAt(G.dayTime);
    drawGround(G, vis);
    drawBeach(G, vis);
    drawSkids(G, vis);
    drawMarkers(G);
    drawPickups(G);
    drawBuildings(G, vis, darkness);
    drawProps(G, vis, darkness);
    // Cars sorted by y so southern cars overlap northern ones.
    const sorted = [...G.cars].sort((a, b) => a.y - b.y);
    for (const car of sorted) {
      if (car.x + 70 < vis.x || car.x - 70 > vis.x + vis.w || car.y + 70 < vis.y || car.y - 70 > vis.y + vis.h) continue;
      drawCar(G, car, darkness);
    }
    drawPeople(G, vis);
    drawPlayer(G);
    drawBullets(G);
    drawParticles(G);
    drawPlayerChevron(G);
    drawLighting(G, vis);
    ctx.restore();
    return view;
  }

  return { draw, view };
}

export { DAY_SECONDS, blockRect, districtOfBlock };
