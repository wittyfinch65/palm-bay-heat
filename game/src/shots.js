// The screenshot scenes behind ?shot=cover|chase|mission|title. Each one arranges a real,
// deterministic moment of Palm Bay — a golden-hour cruise down the coast road, a three-star
// chase downtown, a courier pickup at the docks, the title over the living city — and the main
// loop then plays it forward with scripted inputs, so the frame is the game itself, never a
// composite. The same seed always stages the same frame.
import { placeById } from './world.js';
import { createCar, modelById, spawnTrafficCar } from './vehicles.js';
import { STORY } from './missions.js';

/** Put the player in a fresh car of the given model at a place, already rolling. */
function putPlayerInCar(G, modelId, x, y, angle, speed) {
  const model = modelById(modelId);
  const car = createCar(model, x, y, angle, model.colors[0], 'parked');
  car.driver = 'player';
  car.vx = Math.cos(angle) * speed;
  car.vy = Math.sin(angle) * speed;
  G.cars.push(car);
  G.player.inCar = car;
  G.player.x = x;
  G.player.y = y;
  return car;
}

/** A cruiser already on the player's tail. */
function addCruiser(G, x, y, angle) {
  const model = modelById('cruiser');
  const car = createCar(model, x, y, angle, '#f0f2f5', 'police');
  car.driver = 'ai';
  car.vx = Math.cos(angle) * 200;
  car.vy = Math.sin(angle) * 200;
  G.cars.push(car);
  return car;
}

/**
 * Arrange the named scene on G and return how many seconds to play it forward.
 * Any name but chase/mission/title is the cover scene.
 */
export function stageShot(name, G) {
  G.banners.length = 0;
  if (name === 'title') {
    G.screen = 'title';
    G.dayTime = 0.67;
    G.camera.x = 2980;
    G.camera.y = 1330;
    return 2.5;
  }
  G.screen = 'play';
  if (name === 'chase') {
    G.dayTime = 0.52;
    putPlayerInCar(G, 'ventura', 1470, 1528, 0, 210);
    G.wanted.stars = 3;
    G.wanted.unseenT = 0;
    addCruiser(G, 1290, 1492, 0);
    addCruiser(G, 1150, 1560, 0);
    addCruiser(G, 1330, 1620, 0.3);
    for (let i = 0; i < 4; i += 1) spawnTrafficCar(G, false);
    const hotel = placeById(G.world, 'hotel');
    G.mission = {
      def: STORY[1], isStory: true, stepIndex: 1, race: null, passengerPed: null, escapeT: 0,
      step: { type: 'goto', x: hotel.x, y: hotel.y, label: 'Deliver the crate to Hotel Delmare', needCar: true, radius: 54 },
    };
    return 2.4;
  }
  if (name === 'mission') {
    G.dayTime = 0.34;
    const docks = placeById(G.world, 'docks');
    G.player.x = docks.x - 300;
    G.player.y = docks.y - 30;
    G.player.angle = 0.4;
    const van = createCar(modelById('boxer'), docks.x + 30, docks.y - 6, Math.PI, '#88a0b4', 'parked');
    van.driver = null;
    G.cars.push(van);
    G.mission = {
      def: STORY[1], isStory: true, stepIndex: 0, race: null, passengerPed: null, escapeT: 0,
      step: { type: 'goto', x: docks.x, y: docks.y, label: 'Pick up the crate at the depot', radius: 56 },
    };
    G.banners.push({ title: 'Hot Delivery', text: "Sal: This crate goes to the Hotel Delmare. Don't let them stop you.", t: 99 });
    return 1.7;
  }
  // Cover: golden hour, a Marlin GT on the coast road, the sea on the right, work ahead.
  G.dayTime = 0.66;
  putPlayerInCar(G, 'marlin', 3420, 1710, -Math.PI / 2, 150);
  for (let i = 0; i < 5; i += 1) spawnTrafficCar(G, false);
  const docks = placeById(G.world, 'docks');
  G.mission = {
    def: STORY[0], isStory: true, stepIndex: 0, race: null, passengerPed: null, escapeT: 0,
    step: { type: 'goto', x: docks.x, y: docks.y, label: 'Drive to the Port Azul Freight Depot', needCar: true, radius: 54 },
  };
  return 2.2;
}

/**
 * Scripted inputs for a scene: a fake input object whose keys change with the scene clock.
 * The cover and the chase hold the throttle down; the mission scene strolls toward the van.
 */
export function createShotInput(name) {
  function makeInput(keys, mouseDown) {
    const held = new Set(keys);
    return {
      held,
      mouse: { x: 900, y: 300, down: mouseDown, clicked: false },
      down(code) { return held.has(code); },
      takePressed() { return new Set(); },
      takeClick() { return false; },
      takeActions() { return 0; },
      axisX() { return (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0); },
      axisY() { return (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0); },
    };
  }
  return {
    at(t) {
      if (name === 'chase') return makeInput(t < 2.4 ? ['KeyW'] : [], false);
      if (name === 'mission') return makeInput(t < 1.6 ? ['KeyD'] : [], false);
      if (name === 'title') return makeInput([], false);
      return makeInput(['KeyW'], false); // cover: cruise north up the coast road
    },
  };
}
