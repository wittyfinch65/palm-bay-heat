// The HUD and the screens: cash, health, wanted stars, the clock and the district, the mission
// objective with its distance and clock, banners and toasts, the context prompt, a speedometer,
// the minimap with its blips, and the panels for title, pause, busted, wasted and the ending.
// Everything here is screen space; the world itself is render.js's business.
import { CITY, PALETTE, WANTED, WORLD } from './config.js';
import { districtOfBlock, roadCenterX, roadCenterY } from './world.js';
import { STORY } from './missions.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(10,14,22,${alpha})`;
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
}

function star(ctx, cx, cy, r, filled, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function formatClock(dayTime) {
  const minutes = Math.floor(dayTime * 24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function districtAt(G) {
  const px = G.player.inCar ? G.player.inCar.x : G.player.x;
  const py = G.player.inCar ? G.player.inCar.y : G.player.y;
  if (px >= WORLD.sandX) return 'Coral Beach';
  const i = Math.max(0, Math.min(CITY.cols - 1, Math.floor((px - CITY.road) / CITY.pitch)));
  const j = Math.max(0, Math.min(CITY.rows - 1, Math.floor((py - CITY.road) / CITY.pitch)));
  return districtOfBlock(i, j);
}

/** The minimap: the whole bay in a pocket — roads, water, blips for police, work and you. */
function drawMinimap(ctx, G, x, y, w, h) {
  panel(ctx, x - 6, y - 6, w + 12, h + 12, 0.78);
  const sx = w / WORLD.width;
  const sy = h / WORLD.height;
  ctx.save();
  rr(ctx, x, y, w, h, 7);
  ctx.clip();
  ctx.fillStyle = '#565e63';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(x + WORLD.waterX * sx, y, (WORLD.width - WORLD.waterX) * sx, h);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x + WORLD.sandX * sx, y, (WORLD.waterX - WORLD.sandX) * sx, h);
  ctx.fillStyle = '#79828a';
  for (let i = 0; i < G.world.ground.length; i += 1) {
    const g = G.world.ground[i];
    ctx.fillStyle = g.grass ? '#4d7a48' : '#79828a';
    ctx.fillRect(x + g.x * sx, y + g.y * sy, g.w * sx, g.h * sy);
  }
  ctx.fillStyle = '#2f333b';
  for (let i = 0; i <= CITY.cols; i += 1) ctx.fillRect(x + (roadCenterX(i) - CITY.road / 2) * sx, y, CITY.road * sx, h);
  for (let j = 0; j <= CITY.rows; j += 1) ctx.fillRect(x, y + (roadCenterY(j) - CITY.road / 2) * sy, w, CITY.road * sy);
  // Start markers: the story in white, activities in gold.
  for (const marker of G.startMarkersCache ?? []) {
    ctx.fillStyle = marker.kind === 'story' ? '#ffffff' : PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x + marker.x * sx, y + marker.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips, flashing.
  const flash = Math.floor(G.time * 3) % 2 === 0;
  for (const car of G.cars) {
    if (car.kind !== 'police' || car.driver !== 'ai') continue;
    ctx.fillStyle = flash ? '#ff3b30' : '#35c4ff';
    ctx.fillRect(x + car.x * sx - 2, y + car.y * sy - 2, 4, 4);
  }
  // The objective, pulsing gold.
  const objective = G.objective;
  if (objective && objective.x !== null && objective.x !== undefined) {
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x + objective.x * sx, y + objective.y * sy, 3.6 + Math.sin(G.time * 5) * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // You.
  const target = G.player.inCar ?? G.player;
  const angle = G.player.inCar ? G.player.inCar.angle : G.player.angle;
  ctx.save();
  ctx.translate(x + target.x * sx, y + target.y * sy);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -3.8);
  ctx.lineTo(-4.4, 3.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 10px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('PALM BAY', x + w, y - 10);
}

/** Everything over the world while playing: the frame of the crime life. */
export function drawHud(ctx, G, view) {
  const w = view.w;
  const h = view.h;
  ctx.textBaseline = 'alphabetic';

  // Cash and health, top left.
  panel(ctx, 14, 14, 208, 64);
  ctx.fillStyle = PALETTE.cashGreen;
  ctx.font = `800 25px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`$${Math.floor(G.cash).toLocaleString('en-US')}`, 26, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText(G.player.inCar ? G.player.inCar.model.name : 'On foot', 26, 62);
  const hpRatio = (G.player.inCar ? G.player.inCar.hp : G.player.hp) / 100;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rr(ctx, 128, 52, 80, 9, 4);
  ctx.fill();
  ctx.fillStyle = hpRatio > 0.35 ? PALETTE.cashGreen : PALETTE.dangerRed;
  rr(ctx, 128, 52, Math.max(0, 80 * hpRatio), 9, 4);
  ctx.fill();

  // Wanted stars, clock and district, top right.
  const starW = 30;
  const starsX = w - 14 - starW * WANTED.maxStars - 8;
  panel(ctx, starsX - 10, 14, starW * WANTED.maxStars + 28, 64);
  for (let i = 0; i < WANTED.maxStars; i += 1) {
    const filled = i < G.wanted.stars;
    const blink = G.wanted.evading && Math.floor(G.time * 3) % 2 === 0;
    star(ctx, starsX + 12 + i * starW + 11, 38, 12, filled, filled ? (blink ? '#ffb3ab' : PALETTE.dangerRed) : 'rgba(255,255,255,0.4)');
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${formatClock(G.dayTime)} · ${districtAt(G)}${G.wanted.evading ? ' · EVADING' : ''}`, w - 24, 68);

  // The objective, top centre.
  if (G.mission) {
    const objective = G.objective;
    const title = G.mission.def.title;
    ctx.font = `800 15px ${FONT}`;
    const titleW = ctx.measureText(title).width;
    ctx.font = `600 14px ${FONT}`;
    let sub = objective ? objective.label : '';
    if (objective && objective.x !== null && objective.x !== undefined) {
      const target = G.player.inCar ?? G.player;
      const dist = Math.hypot(objective.x - target.x, objective.y - target.y);
      sub += ` — ${Math.round(dist / 10)} m`;
    }
    const step = G.mission.step;
    if (step && step.type === 'race' && G.mission.race) sub += ` — ${Math.max(0, G.mission.race.timeLeft).toFixed(1)} s`;
    else if (step && step.timeLimit && step.timeLeft !== undefined) sub += ` — ${Math.max(0, step.timeLeft).toFixed(0)} s`;
    const subW = ctx.measureText(sub).width;
    const boxW = Math.max(titleW, subW) + 34;
    panel(ctx, (w - boxW) / 2, 14, boxW, 56, 0.66);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 37);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(sub, w / 2, 59);
  }

  // Banners (mission intros and results) under the objective.
  const banner = G.banners[0];
  if (banner) {
    ctx.font = `600 15px ${FONT}`;
    const textW = Math.min(w - 80, Math.max(ctx.measureText(banner.text).width + 40, 280));
    panel(ctx, (w - textW) / 2, 84, textW, 58, 0.8);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(banner.title.toUpperCase(), w / 2, 104);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(banner.text, w / 2, 128, textW - 24);
  }

  // Toast, bottom centre.
  if (G.toast && G.toast.t > 0) {
    ctx.font = `600 15px ${FONT}`;
    const textW = ctx.measureText(G.toast.text).width + 36;
    panel(ctx, (w - textW) / 2, h - 118, textW, 34, 0.8);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(G.toast.text, w / 2, h - 96);
  }

  // Context prompt, bottom left.
  if (G.prompt) {
    ctx.font = `700 15px ${FONT}`;
    const textW = ctx.measureText(G.prompt).width + 30;
    panel(ctx, 14, h - 52, textW, 36, 0.8);
    ctx.fillStyle = PALETTE.gold;
    ctx.textAlign = 'left';
    ctx.fillText(G.prompt, 29, h - 28);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(G.player.inCar
      ? 'W A S D drive · SPACE handbrake · E get out · M mute'
      : 'W A S D move · SHIFT sprint · E enter car · F punch · MOUSE aim & shoot · M mute', 16, h - 22);
  }

  // Speedometer, bottom right above the minimap.
  if (G.player.inCar) {
    const kmh = Math.round(Math.abs(G.player.inCar.vf) * 0.32);
    panel(ctx, w - 118, h - 226, 104, 50);
    ctx.fillStyle = '#fff';
    ctx.font = `800 25px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(kmh), w - 66, h - 194);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText('KM/H', w - 66, h - 182);
  }

  drawMinimap(ctx, G, w - 212, h - 158, 196, 142);

  // The bust meter, centre screen: the law's hand closing.
  if (G.player.bustMeter > 0.12) {
    const ratio = Math.min(1, G.player.bustMeter / 1.5);
    panel(ctx, (w - 260) / 2, h * 0.3, 260, 44, 0.8);
    ctx.fillStyle = PALETTE.dangerRed;
    ctx.font = `800 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', w / 2, h * 0.3 + 19);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    rr(ctx, (w - 220) / 2, h * 0.3 + 26, 220, 8, 4);
    ctx.fill();
    ctx.fillStyle = PALETTE.dangerRed;
    rr(ctx, (w - 220) / 2, h * 0.3 + 26, 220 * ratio, 8, 4);
    ctx.fill();
  }

  // A red edge when freshly hurt.
  if (G.time - G.player.lastHurtT < 0.3) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(200,30,30,0)');
    grad.addColorStop(1, 'rgba(200,30,30,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Crosshair at the mouse while on foot.
  if (!G.player.inCar) {
    const m = G.mouseScreen;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
    ctx.moveTo(m.x - 14, m.y);
    ctx.lineTo(m.x - 5, m.y);
    ctx.moveTo(m.x + 5, m.y);
    ctx.lineTo(m.x + 14, m.y);
    ctx.moveTo(m.x, m.y - 14);
    ctx.lineTo(m.x, m.y - 5);
    ctx.moveTo(m.x, m.y + 5);
    ctx.lineTo(m.x, m.y + 14);
    ctx.stroke();
  }
}

/** A full-screen panel with a title, lines and a prompt — the shape of every menu. */
function drawPanelScreen(ctx, view, title, titleColor, lines, prompt) {
  const w = view.w;
  const h = view.h;
  ctx.fillStyle = 'rgba(6,9,16,0.55)';
  ctx.fillRect(0, 0, w, h);
  const boxW = Math.min(680, w - 60);
  const boxH = 150 + lines.length * 27 + 60;
  const x = (w - boxW) / 2;
  const y = (h - boxH) / 2;
  panel(ctx, x, y, boxW, boxH, 0.88);
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = `900 44px ${FONT}`;
  ctx.fillText(title, w / 2, y + 66);
  ctx.font = `600 16px ${FONT}`;
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? '#ffffff' : 'rgba(255,255,255,0.72)';
    ctx.fillText(line, w / 2, y + 108 + index * 27);
  });
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `800 17px ${FONT}`;
  ctx.fillText(prompt, w / 2, y + boxH - 26);
}

/** The title screen: the game's name over the living city. */
export function drawTitle(ctx, G, view) {
  const w = view.w;
  const h = view.h;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(8,10,24,0.30)');
  grad.addColorStop(0.55, 'rgba(8,10,24,0.08)');
  grad.addColorStop(1, 'rgba(8,10,24,0.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = `900 ${Math.min(92, w * 0.085)}px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.fillText('PALM BAY HEAT', w / 2, h * 0.30);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 19px ${FONT}`;
  ctx.fillText('An open-world crime story in a sun-soaked bay city', w / 2, h * 0.30 + 40);
  ctx.font = `600 15px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const lines = [
    'You are Dario Venn, a wheelman new in town. Take cars, run jobs for Lena and Sal,',
    'mind the Palm Bay PD — and try to leave with the bay in your pocket.',
    '',
    'W A S D — move / drive      SHIFT — sprint      SPACE — handbrake',
    'E — enter car / take work      F — punch      MOUSE — aim & shoot',
    'P or ESC — pause      M — mute',
  ];
  lines.forEach((line, index) => ctx.fillText(line, w / 2, h * 0.52 + index * 24));
  const hasSave = G.save.storyIndex > 0 || G.save.cash !== 250;
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `800 21px ${FONT}`;
  const blink = Math.floor(G.time * 1.6) % 2 === 0;
  if (blink) {
    ctx.fillText(hasSave
      ? `Press ENTER — continue: $${Math.floor(G.save.cash).toLocaleString('en-US')} · story ${Math.min(G.save.storyIndex, STORY.length)}/${STORY.length}`
      : 'Press ENTER — start a new life in Palm Bay', w / 2, h * 0.80);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText('An original game: every name, street and story in Palm Bay is its own.', w / 2, h - 22);
}

/** Pause, bust, wasted and ending panels. */
export function drawScreenPanel(ctx, G, view) {
  if (G.screen === 'pause') {
    drawPanelScreen(ctx, view, 'PAUSED', '#ffffff', [
      `Cash $${Math.floor(G.cash).toLocaleString('en-US')} · Missions done ${G.stats.missions} · Cars taken ${G.stats.jacked}`,
      `Story: ${Math.min(G.save.storyIndex, STORY.length)}/${STORY.length}${G.save.bestRace ? ` · Best coast run ${G.save.bestRace.toFixed(1)} s` : ''}`,
      'The bay waits for no one — but it will wait for you.',
    ], 'Press P or ESC to keep driving');
  } else if (G.screen === 'busted') {
    drawPanelScreen(ctx, view, 'BUSTED', PALETTE.dangerRed, [
      'The Palm Bay PD finally got hands on you.',
      `Bail and fines took $${G.lastFine ?? 0}. Your car was impounded.`,
      'You walk out of the station with your name a little heavier.',
    ], 'Press ENTER to walk out');
  } else if (G.screen === 'wasted') {
    drawPanelScreen(ctx, view, 'WASTED', '#c9ced6', [
      'You woke up at St. Coral Hospital, smelling of antiseptic and salt air.',
      `The bill came to $${G.lastFine ?? 0}. The bay keeps what it catches.`,
    ], 'Press ENTER to leave the hospital');
  } else if (G.screen === 'ending') {
    drawPanelScreen(ctx, view, 'THE BAY IS YOURS', PALETTE.gold, [
      "Lena's boat cleared the harbour before dawn. Sal sends his regards.",
      `You finish the story with $${Math.floor(G.cash).toLocaleString('en-US')} and the whole bay to roam.`,
      'Fares, crates and the coast gates still pay. Palm Bay is open.',
    ], 'Press ENTER — free roam');
  }
}
