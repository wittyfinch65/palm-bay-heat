// Palm Bay Heat — boot and the one loop. Builds the city from the seed, wires every system
// together, advances the world in fixed 1/60 s steps, and moves between the screens: title,
// play, pause, busted, wasted and the story's ending. Everything the systems need from each
// other travels on one state object, G.
//
// ?seed=N fixes the city. ?shot=cover|chase|mission|title (with &seed=N) stages that scene,
// plays it forward on scripted inputs, paints it twice and sets window.__shotReady.
import { CAMERA, DAY_SECONDS, DAY_START, SPAWN, STEP, WANTED, WORLD } from './config.js';
import { createRandom } from './random.js';
import { buildWorld, placeById } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { drawHud, drawScreenPanel, drawTitle } from './hud.js';
import { loadSave, storeSave } from './save.js';
import { createPlayer, enterExitCar, nearestEnterableCar, spawnPeds, updateBullets, updatePeds, updatePickups, updatePlayerOnFoot } from './people.js';
import { driveCar, spawnParkedCars, spawnTrafficCar, updateTraffic } from './vehicles.js';
import { reportCrime, updatePolice } from './police.js';
import { failMission, startMarkers, updateMissions } from './missions.js';
import { createShotInput, stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rng = createRandom(seed);
const save = loadSave();

const G = {
  world: buildWorld(rng),
  rng,
  time: 0,
  dayTime: DAY_START,
  screen: 'title',
  player: createPlayer(),
  cars: [], peds: [], cops: [], bullets: [], particles: [], skids: [], pickups: [],
  events: [], banners: [], toast: null, prompt: '', promptAction: null, objective: null,
  mission: null,
  wanted: { stars: 0, unseenT: 0, coolT: 0, evading: false, lastSeenX: 0, lastSeenY: 0, sirenDist: Infinity },
  cash: save.cash,
  stats: { earned: 0, jacked: 0, missions: 0 },
  save,
  saveDirty: false,
  saveTimer: 0,
  camera: { x: SPAWN.x, y: SPAWN.y },
  shake: 0,
  trafficTimer: 0, pedTimer: 0, policeTimer: 0,
  mouseWorld: { x: SPAWN.x + 100, y: SPAWN.y },
  mouseScreen: { x: 0, y: 0 },
  pressed: new Set(),
  startMarkersCache: [],
  lastFine: 0,
};
G.reportCrime = (kind, x, y) => reportCrime(G, kind, x, y);

spawnParkedCars(G);
for (let i = 0; i < 16; i += 1) spawnTrafficCar(G, false);
spawnPeds(G, 34);

const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas);

function announce(message) {
  status.textContent = message;
}

/** Persist the save when it changed, at most every couple of seconds. */
function persistSave(dt) {
  G.saveTimer -= dt;
  if (!G.saveDirty || G.saveTimer > 0) return;
  G.saveTimer = 2;
  G.saveDirty = false;
  G.save.cash = Math.floor(G.cash);
  G.save.totalEarned += G.stats.earned;
  G.stats.earned = 0;
  G.save.missionsDone += G.stats.missions;
  G.stats.missions = 0;
  storeSave(G.save);
}

/** The law caught up: fines, impound, a walk out of the station. */
function doBusted() {
  const fine = Math.min(Math.floor(G.cash), 120 + G.wanted.stars * 60);
  G.cash -= fine;
  G.lastFine = fine;
  if (G.mission) failMission(G, 'The police ended the job.');
  if (G.player.inCar) {
    const at = G.cars.indexOf(G.player.inCar);
    if (at !== -1) G.cars.splice(at, 1); // impounded
    G.player.inCar = null;
  }
  const station = placeById(G.world, 'police');
  G.player.x = station.x;
  G.player.y = station.y + 10;
  G.player.hp = Math.max(G.player.hp, 55);
  G.player.bustMeter = 0;
  G.wanted.stars = 0;
  G.wanted.unseenT = 0;
  G.screen = 'busted';
  G.saveDirty = true;
  audio.fail();
  announce(`Busted. Fines took ${fine} dollars.`);
}

/** The bay caught up: a hospital bill and a second chance. */
function doWasted() {
  const fine = Math.min(Math.floor(G.cash), 180);
  G.cash -= fine;
  G.lastFine = fine;
  if (G.mission) failMission(G, 'The job died with you in a hospital bed.');
  if (G.player.inCar) {
    G.player.inCar.driver = null;
    G.player.inCar = null;
  }
  const hospital = placeById(G.world, 'hospital');
  G.player.x = hospital.x;
  G.player.y = hospital.y + 10;
  G.player.hp = 65;
  G.player.bustMeter = 0;
  G.wanted.stars = 0;
  G.wanted.unseenT = 0;
  G.screen = 'wasted';
  G.saveDirty = true;
  audio.fail();
  announce(`Wasted. The hospital bill was ${fine} dollars.`);
}

/** Turn the step's events into sound and the occasional screen change. */
function processEvents() {
  for (const event of G.events) {
    if (event.type === 'shot') audio.shot();
    else if (event.type === 'copshot') audio.copShot();
    else if (event.type === 'punch') audio.punch();
    else if (event.type === 'crash') audio.crash(event.hard);
    else if (event.type === 'horn') audio.horn();
    else if (event.type === 'pickup') {
      audio.pickup();
      G.saveDirty = true;
    } else if (event.type === 'gate') audio.gate();
    else if (event.type === 'missioncomplete') audio.success();
    else if (event.type === 'missionfail') audio.fail();
    else if (event.type === 'wantedup') audio.wantedUp();
    else if (event.type === 'entercar' || event.type === 'exitcar') audio.door();
    else if (event.type === 'storydone' && G.screen === 'play') {
      G.screen = 'ending';
      announce('Story complete. The bay is yours.');
    }
  }
  G.events.length = 0;
}

/** Particles and skid marks age whether or not anyone is watching. */
function ageEffects(dt) {
  for (let i = G.particles.length - 1; i >= 0; i -= 1) {
    const p = G.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'smoke') p.y -= 12 * dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.skids.length - 1; i >= 0; i -= 1) {
    G.skids[i].life -= dt;
    if (G.skids[i].life <= 0) G.skids.splice(i, 1);
  }
  for (let i = G.banners.length - 1; i >= 0; i -= 1) {
    G.banners[i].t -= dt;
    if (G.banners[i].t <= 0) G.banners.splice(i, 1);
  }
  if (G.toast) {
    G.toast.t -= dt;
    if (G.toast.t <= 0) G.toast = null;
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 16);
}

/** The camera: glued to the player with a speed-scaled look-ahead, clamped to the bay. */
function updateCamera(dt) {
  if (G.screen === 'title') {
    G.camera.x = 2980 + Math.sin(G.time * 0.06) * 640;
    G.camera.y = 1330 + Math.cos(G.time * 0.045) * 360;
    return;
  }
  const target = G.player.inCar ?? G.player;
  const vx = G.player.inCar ? G.player.inCar.vx : 0;
  const vy = G.player.inCar ? G.player.inCar.vy : 0;
  const tx = target.x + vx * CAMERA.lookAhead;
  const ty = target.y + vy * CAMERA.lookAhead;
  const k = Math.min(1, dt * CAMERA.stiffness);
  G.camera.x += (tx - G.camera.x) * k;
  G.camera.y += (ty - G.camera.y) * k;
  const hw = renderer.view.w / 2;
  const hh = renderer.view.h / 2;
  G.camera.x = WORLD.width <= renderer.view.w ? WORLD.width / 2 : Math.max(hw - 60, Math.min(WORLD.width - hw + 60, G.camera.x));
  G.camera.y = WORLD.height <= renderer.view.h ? WORLD.height / 2 : Math.max(hh - 60, Math.min(WORLD.height - hh + 60, G.camera.y));
}

/** One fixed step of the living city while playing. */
function stepPlay(dt, inp) {
  G.time += dt;
  G.dayTime = (G.dayTime + dt / DAY_SECONDS) % 1;
  const player = G.player;

  // The interact key: mission work first, then car doors.
  if (G.pressed.has('KeyE')) {
    if (G.promptAction) {
      const action = G.promptAction;
      G.promptAction = null;
      action();
    } else {
      enterExitCar(G);
    }
  }
  if (G.pressed.has('KeyM')) {
    const muted = audio.toggleMute();
    G.toast = { text: muted ? 'Sound off.' : 'Sound on.', t: 1.6 };
  }

  if (player.inCar) {
    const car = player.inCar;
    const ctrl = {
      throttle: (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) + (inp.down('KeyS') || inp.down('ArrowDown') ? -1 : 0),
      steer: inp.axisX(),
      handbrake: inp.down('Space'),
    };
    driveCar(G, car, dt, ctrl);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (car.wrecked && Math.abs(car.vf) < 5) {
      G.prompt = 'This car is wrecked — E to get out';
    }
  } else {
    updatePlayerOnFoot(G, inp, dt);
  }

  updateTraffic(G, dt);
  updatePolice(G, dt);
  updatePeds(G, dt);
  updateBullets(G, dt);
  updatePickups(G, dt);
  G.startMarkersCache = startMarkers(G);
  updateMissions(G, dt);
  if (!player.inCar && !G.mission) {
    const car = nearestEnterableCar(G, 52);
    if (car && !G.prompt) G.prompt = car.wrecked ? 'That car is wrecked' : `E — Take the ${car.model.name}`;
  }

  ageEffects(dt);
  updateCamera(dt);
  persistSave(dt);
  processEvents();
  audio.update(G);

  if (player.bustMeter >= WANTED.bustSeconds && G.screen === 'play') doBusted();
  else if (player.hp <= 0 && G.screen === 'play') doWasted();
}

/** One fixed step on the title screen: the city idles behind the name. */
function stepAmbient(dt) {
  G.time += dt;
  G.dayTime = (G.dayTime + dt / (DAY_SECONDS * 2)) % 1;
  updateTraffic(G, dt);
  updatePeds(G, dt);
  ageEffects(dt);
  updateCamera(dt);
  processEvents();
}

/** Draw one frame: the world, then the HUD or the screen's panel. */
function draw() {
  const view = renderer.draw(G);
  const ctx = canvas.getContext('2d');
  if (G.screen === 'title') {
    drawTitle(ctx, G, view);
    return;
  }
  drawHud(ctx, G, view);
  if (G.screen !== 'play') drawScreenPanel(ctx, G, view);
}

/** Refresh the mouse's world position from the camera before each batch of steps. */
function refreshMouse() {
  G.mouseScreen.x = input.mouse.x;
  G.mouseScreen.y = input.mouse.y;
  G.mouseWorld.x = G.camera.x + (input.mouse.x - renderer.view.w / 2);
  G.mouseWorld.y = G.camera.y + (input.mouse.y - renderer.view.h / 2);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (G.screen === 'title') {
        G.screen = 'play';
        announce('Palm Bay Heat. Find work at the gold markers.');
      } else if (G.screen === 'busted' || G.screen === 'wasted' || G.screen === 'ending') {
        G.screen = 'play';
      }
    }
    if (actions & ACTION_PAUSE) {
      if (G.screen === 'play') {
        G.screen = 'pause';
        announce('Paused.');
      } else if (G.screen === 'pause') {
        G.screen = 'play';
        announce('Playing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    refreshMouse();
    if (G.screen === 'play') {
      G.pressed = input.takePressed();
      let first = true;
      while (accumulator >= STEP && G.screen === 'play') {
        if (!first) G.pressed = new Set();
        stepPlay(STEP, input);
        first = false;
        accumulator -= STEP;
      }
      if (first) accumulator = 0;
    } else if (G.screen === 'title') {
      while (accumulator >= STEP) {
        stepAmbient(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      input.takePressed();
    }
    draw();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'play') G.screen = 'pause';
  });
  canvas.addEventListener('mousedown', () => audio.unlock());

  announce('Palm Bay Heat. Press Enter to start.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  const duration = stageShot(name, G);
  const script = createShotInput(name);
  // Settle the camera on the scene before the first staged step.
  updateCamera(1);
  let t = 0;
  while (t < duration) {
    const inp = script.at(t);
    G.mouseWorld.x = G.player.x + 160;
    G.mouseWorld.y = G.player.y - 60;
    if (G.screen === 'play') stepPlay(STEP, inp);
    else stepAmbient(STEP);
    t += STEP;
  }
  // One last exact camera settle, then paint the staged frame twice.
  const target = G.player.inCar ?? G.player;
  if (G.screen === 'play') {
    G.camera.x = target.x;
    G.camera.y = target.y;
  }
  let painted = 0;
  function paint() {
    draw();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else runGame();
