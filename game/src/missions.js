// Missions: a five-job story for Dario Venn — errands for Lena Marsh of Café Brisa and Sal Rook
// of the Port Azul freight depot — plus the repeatable work of the bay (SunCab fares, courier
// crates, the coast-gate race). A mission is a list of steps; this system resolves places to
// points, watches the player arrive, run gates, pick up passengers and shake the police, and
// pays out. The HUD reads G.objective and G.prompt, which this file keeps current.
import { placeById } from './world.js';

/** The story, in order. Steps name places; startPlace is where the giver waits. */
export const STORY = [
  {
    id: 'first-wheels', title: 'First Wheels', from: 'Lena Marsh — Café Brisa', startPlace: 'cafe', reward: 120,
    intro: [
      'Lena: You made it to Palm Bay, Dario. Wheels first — take any car you like.',
      'Lena: Then roll south to Port Azul. Sal runs the freight depot. Tell him I sent you.',
    ],
    steps: [
      { type: 'goto', place: 'docks', label: 'Drive to the Port Azul Freight Depot', needCar: true },
    ],
  },
  {
    id: 'hot-delivery', title: 'Hot Delivery', from: 'Sal Rook — Port Azul', startPlace: 'docks', reward: 260,
    intro: [
      "Sal: Lena's friend? Then you're my driver now. This crate goes to the Hotel Delmare.",
      "Sal: The bay police have been twitchy all week. Don't let them stop you.",
    ],
    steps: [
      { type: 'goto', place: 'docks', label: 'Pick up the crate at the depot', radius: 56 },
      { type: 'goto', place: 'hotel', label: 'Deliver the crate to Hotel Delmare', needCar: true, setWanted: 2 },
      { type: 'escape', label: 'Lose the police' },
    ],
  },
  {
    id: 'beach-run', title: 'Beach Run', from: 'Lena Marsh — Café Brisa', startPlace: 'cafe', reward: 300,
    intro: [
      'Lena: The coast road, five gates, one clock. Beat the bay at its own game, wheelman.',
    ],
    steps: [
      { type: 'race', label: 'Run the five coast gates', timeLimit: 85, points: [[3420, 1980], [3420, 1500], [3420, 1020], [3420, 540], [3420, 130]] },
    ],
  },
  {
    id: 'the-pickup', title: 'The Pickup', from: 'Sal Rook — Port Azul', startPlace: 'docks', reward: 420,
    intro: [
      "Sal: A friend of mine is done hiding at Diner Sol. Pick her up, take her to the marina.",
      'Sal: Half the bay will try to stop that car. Be the other half.',
    ],
    steps: [
      { type: 'pickup', place: 'diner', label: "Pick up Sal's friend at Diner Sol" },
      { type: 'goto', place: 'yacht', label: 'Take her to the Marina & Yacht Club', needCar: true, setWanted: 2 },
      { type: 'escape', label: 'Lose the police' },
    ],
  },
  {
    id: 'bay-finale', title: 'Bay Finale', from: 'Lena Marsh — Café Brisa', startPlace: 'cafe', reward: 900,
    intro: [
      "Lena: One last run, Dario. The Trust's courier bag — from the bank to my boat.",
      'Lena: Every badge in Palm Bay will light up. Earn it.',
    ],
    steps: [
      { type: 'goto', place: 'bank', label: 'Take the courier bag at Palm Bay Trust', radius: 56 },
      { type: 'goto', place: 'yacht', label: 'Deliver the bag to the Marina & Yacht Club', needCar: true, setWanted: 3 },
      { type: 'escape', label: 'Lose the police — then the bay is yours' },
    ],
  },
];

/** The repeatable work, offered at fixed spots whenever no mission is running. */
const ACTIVITIES = [
  { kind: 'taxi', place: 'cabdepot', label: 'Start a SunCab fare', needCar: true },
  { kind: 'courier', place: 'docks', label: 'Run a courier crate', needCar: false },
  { kind: 'race', place: 'yacht', label: 'Run the coast gates (time trial)', needCar: true },
];

/** Resolve a step definition into a runtime step with real coordinates. */
function resolveStep(G, def) {
  const step = { ...def };
  if (def.place) {
    const place = placeById(G.world, def.place);
    step.x = place.x;
    step.y = place.y;
  }
  step.radius = def.radius ?? 54;
  return step;
}

/** Begin a mission definition: queue its intro lines as banners and arm its first step. */
function startMission(G, def, isStory) {
  G.mission = {
    def, isStory, stepIndex: 0, step: resolveStep(G, def.steps[0]),
    race: null, passengerPed: null, escapeT: 0,
  };
  for (const line of def.intro) G.banners.push({ title: def.title, text: line, t: 3.4 });
  G.events.push({ type: 'missionstart', title: def.title });
  onStepStart(G);
}

/** Side effects when a step begins: scripted heat, race clocks. */
function onStepStart(G) {
  const mission = G.mission;
  const step = mission.step;
  if (step.setWanted) {
    G.wanted.stars = Math.max(G.wanted.stars, step.setWanted);
    G.wanted.unseenT = 0;
    G.wanted.coolT = 0;
    G.events.push({ type: 'wantedup', stars: G.wanted.stars });
  }
  if (step.type === 'race') {
    mission.race = { points: step.points, index: 0, timeLeft: step.timeLimit, total: step.timeLimit };
  }
  mission.escapeT = 0;
}

/** Advance to the next step, or finish the mission and pay. */
function nextStep(G) {
  const mission = G.mission;
  mission.stepIndex += 1;
  mission.passengerPed = null;
  mission.race = null;
  if (mission.stepIndex >= mission.def.steps.length) {
    completeMission(G);
    return;
  }
  mission.step = resolveStep(G, mission.def.steps[mission.stepIndex]);
  onStepStart(G);
}

/** Pay the reward, advance the story, remember everything. */
function completeMission(G) {
  const mission = G.mission;
  G.cash += mission.def.reward;
  G.stats.earned += mission.def.reward;
  G.stats.missions += 1;
  G.banners.push({ title: 'Mission complete', text: `${mission.def.title} — +$${mission.def.reward}`, t: 3.6 });
  G.events.push({ type: 'missioncomplete', reward: mission.def.reward });
  if (mission.isStory) {
    G.save.storyIndex += 1;
    if (G.save.storyIndex >= STORY.length && !G.save.storyDone) {
      G.save.storyDone = true;
      G.events.push({ type: 'storydone' });
    }
  }
  if (mission.def.kind === 'race' && mission.raceTime !== undefined) {
    if (G.save.bestRace === 0 || mission.raceTime < G.save.bestRace) G.save.bestRace = mission.raceTime;
  }
  G.mission = null;
  G.saveDirty = true;
}

/** Fail the running mission (the clock, or the law, won). It can always be started again. */
export function failMission(G, reason) {
  if (!G.mission) return;
  G.banners.push({ title: 'Mission failed', text: reason, t: 3.4 });
  G.events.push({ type: 'missionfail' });
  G.mission = null;
}

/** A generated SunCab fare: a stranger at a kerb, a destination across the bay. */
function taxiMission(G) {
  const spot = { x: 0, y: 0 };
  const road = G.world.places[G.rng.int(0, G.world.places.length - 1)];
  spot.x = road.x;
  spot.y = road.y;
  const dest = G.world.places[G.rng.int(0, G.world.places.length - 1)];
  return {
    id: 'taxi', kind: 'taxi', title: 'SunCab Fare', from: 'SunCab dispatch', reward: 0,
    intro: ['Dispatch: Fare waiting. Get them there quick — tips follow the clock.'],
    dynamicReward: { base: 45, perMeter: 0.055, tipWindow: 0 },
    steps: [
      { type: 'pickup', x: spot.x, y: spot.y, label: 'Pick up the fare', radius: 54 },
      { type: 'goto', x: dest.x, y: dest.y, label: `Take them to ${dest.name}`, needCar: true },
    ],
  };
}

/** A generated courier run: a crate at the docks, a door somewhere in the city, a clock. */
function courierMission(G) {
  const dest = G.world.places[G.rng.int(0, G.world.places.length - 1)];
  return {
    id: 'courier', kind: 'courier', title: 'Courier Run', from: 'Port Azul Freight', reward: 130,
    intro: ['Sal: Small crate, short clock. The bay provides.'],
    steps: [
      { type: 'goto', place: 'docks', label: 'Pick up the crate at the depot', radius: 56 },
      { type: 'goto', x: dest.x, y: dest.y, label: `Deliver to ${dest.name}`, timeLimit: 150 },
    ],
  };
}

/** The coast-gate time trial, repeatable against your own best. */
function raceMission(G) {
  return {
    id: 'race', kind: 'race', title: 'Coast Gates', from: 'Lena Marsh', reward: 200,
    intro: ['Lena: Five gates, coast road, no excuses. Beat your best.'],
    steps: [
      { type: 'race', label: 'Run the five coast gates', timeLimit: 85, points: [[3420, 1980], [3420, 1500], [3420, 1020], [3420, 540], [3420, 130]] },
    ],
  };
}

/** The player's current target for the HUD and minimap, or null in free roam. */
export function currentObjective(G) {
  const mission = G.mission;
  if (!mission) return null;
  const step = mission.step;
  if (step.type === 'race' && mission.race) {
    const [x, y] = mission.race.points[mission.race.index];
    return { x, y, label: `${step.label} — gate ${mission.race.index + 1}/${mission.race.points.length}` };
  }
  if (step.type === 'escape') return { x: null, y: null, label: step.label };
  return { x: step.x, y: step.y, label: step.label };
}

/** The marker a free player can walk into to start work: the story giver or an activity. */
export function startMarkers(G) {
  if (G.mission) return [];
  const markers = [];
  if (G.save.storyIndex < STORY.length) {
    const def = STORY[G.save.storyIndex];
    const place = placeById(G.world, def.startPlace);
    markers.push({ x: place.x, y: place.y, kind: 'story', label: `${def.title} — talk to start`, def });
  }
  for (const activity of ACTIVITIES) {
    const place = placeById(G.world, activity.place);
    markers.push({ x: place.x, y: place.y, kind: 'activity', label: activity.label, activity });
  }
  return markers;
}

/**
 * Missions, one step: watch the current step's condition, run passenger pickups and race
 * clocks, and keep G.objective / G.prompt fresh for the HUD. Starting work happens here too:
 * standing at a start marker with E begins the story or an activity.
 */
export function updateMissions(G, dt) {
  const player = G.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  G.objective = currentObjective(G);
  G.prompt = '';

  if (!G.mission) {
    for (const marker of startMarkers(G)) {
      const dist = Math.hypot(px - marker.x, py - marker.y);
      if (dist > 58) continue;
      const needsCar = marker.kind === 'activity' && marker.activity.needCar;
      if (needsCar && !player.inCar) {
        G.prompt = `${marker.label} — you need a car`;
        continue;
      }
      G.prompt = `E — ${marker.label}`;
      G.promptAction = () => {
        if (marker.kind === 'story') startMission(G, marker.def, true);
        else if (marker.activity.kind === 'taxi') startMission(G, taxiMission(G), false);
        else if (marker.activity.kind === 'courier') startMission(G, courierMission(G), false);
        else startMission(G, raceMission(G), false);
      };
      return;
    }
    G.promptAction = null;
    return;
  }

  const mission = G.mission;
  const step = mission.step;

  if (step.type === 'goto' || step.type === 'pickup') {
    const dist = Math.hypot(px - step.x, py - step.y);
    if (step.needCar && !player.inCar && dist < step.radius + 30) {
      G.objective = { ...G.objective, label: `${step.label} (you need a car)` };
    }
    if (step.timeLimit) {
      step.timeLeft = (step.timeLeft ?? step.timeLimit) - dt;
      if (step.timeLeft <= 0) {
        failMission(G, 'Out of time.');
        return;
      }
    }
    if (step.type === 'goto') {
      if (dist < step.radius && (!step.needCar || player.inCar)) nextStep(G);
      return;
    }
    // Pickup: a passenger walks out and gets in.
    if (mission.passengerPed === null && dist < step.radius + 130) {
      const ped = {
        x: step.x + 14, y: step.y - 10, angle: 0, speed: 120, hp: 100, state: 'walk',
        tx: step.x, ty: step.y, waitT: 0, panicT: 0, fleeX: 0, fleeY: 0,
        shirt: '#f5c66b', pants: '#3a4a5c', walkPhase: 0, downT: 0, passenger: true,
      };
      mission.passengerPed = ped;
      G.peds.push(ped);
    }
    const ped = mission.passengerPed;
    if (ped) {
      if (player.inCar) {
        const d = Math.hypot(player.inCar.x - ped.x, player.inCar.y - ped.y);
        if (d < 30) {
          const at = G.peds.indexOf(ped);
          if (at !== -1) G.peds.splice(at, 1);
          mission.passengerPed = null;
          G.events.push({ type: 'passengerin' });
          // A fare's pay is measured from the pickup: distance and a tip for speed.
          if (mission.def.dynamicReward) {
            const next = mission.def.steps[mission.stepIndex + 1];
            const resolved = resolveStep(G, next);
            mission.def.reward = Math.round(mission.def.dynamicReward.base
              + Math.hypot(resolved.x - step.x, resolved.y - step.y) * mission.def.dynamicReward.perMeter);
            mission.fareStartT = G.time;
          }
          nextStep(G);
          return;
        }
        ped.tx = player.inCar.x;
        ped.ty = player.inCar.y;
        const dx = ped.tx - ped.x;
        const dy = ped.ty - ped.y;
        const dd = Math.hypot(dx, dy) || 1;
        ped.x += (dx / dd) * ped.speed * dt;
        ped.y += (dy / dd) * ped.speed * dt;
        ped.angle = Math.atan2(dy, dx);
        ped.walkPhase += dt * 9;
      }
    }
    return;
  }

  if (step.type === 'race' && mission.race) {
    const race = mission.race;
    race.timeLeft -= dt;
    mission.raceTime = race.total - race.timeLeft;
    if (race.timeLeft <= 0) {
      failMission(G, 'The clock beat you. Run it again.');
      return;
    }
    const [gx, gy] = race.points[race.index];
    if (Math.hypot(px - gx, py - gy) < 64) {
      race.index += 1;
      G.events.push({ type: 'gate', index: race.index, total: race.points.length });
      if (race.index >= race.points.length) {
        // The fare-style tip: a time bonus folded into the reward.
        nextStep(G);
      }
    }
    return;
  }

  if (step.type === 'escape') {
    if (G.wanted.stars === 0) {
      mission.escapeT += dt;
      if (mission.escapeT > 0.8) nextStep(G);
    } else {
      mission.escapeT = 0;
    }
  }
}
