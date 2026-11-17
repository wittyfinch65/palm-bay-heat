// Sound, synthesized live with WebAudio — no audio files. A two-stroke engine whose pitch
// follows the car, a two-tone siren that swells as a cruiser closes in, and one-shot effects
// for shots, punches, crashes, horns and good news. Everything is guarded: no AudioContext,
// no sound, and the game never notices.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;

  /** Build the context on the first user gesture (browsers refuse it sooner). */
  function unlock() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 760;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
  }

  /** A short tone with an optional slide — the brick every effect is built from. */
  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (ctx === null || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A burst of filtered noise — gunfire, impacts, spray. */
  function noise(dur, vol, freq) {
    if (ctx === null || muted) return;
    const t0 = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(filter).connect(gain).connect(master);
    source.start(t0);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shot() {
      noise(0.11, 0.5, 2600);
      tone(190, 0.07, 'square', 0.16, 60);
    },
    copShot() {
      noise(0.09, 0.3, 2200);
    },
    punch() {
      tone(150, 0.09, 'sine', 0.4, 55);
      noise(0.05, 0.2, 700);
    },
    crash(hard) {
      noise(hard ? 0.3 : 0.16, hard ? 0.55 : 0.3, hard ? 500 : 800);
      tone(90, 0.2, 'sine', 0.3, 40);
    },
    horn() {
      tone(349, 0.22, 'square', 0.12);
      tone(440, 0.22, 'square', 0.1);
    },
    pickup() {
      tone(920, 0.07, 'sine', 0.25);
      tone(1380, 0.1, 'sine', 0.22, undefined, 0.06);
    },
    gate() {
      tone(660, 0.08, 'sine', 0.22);
      tone(990, 0.12, 'sine', 0.2, undefined, 0.07);
    },
    success() {
      tone(523, 0.12, 'triangle', 0.3);
      tone(659, 0.12, 'triangle', 0.3, undefined, 0.1);
      tone(784, 0.22, 'triangle', 0.32, undefined, 0.2);
    },
    fail() {
      tone(392, 0.16, 'triangle', 0.26);
      tone(311, 0.16, 'triangle', 0.26, undefined, 0.14);
      tone(233, 0.3, 'triangle', 0.26, undefined, 0.28);
    },
    wantedUp() {
      tone(196, 0.14, 'square', 0.14);
      tone(196, 0.14, 'square', 0.14, undefined, 0.18);
    },
    door() {
      tone(240, 0.06, 'sine', 0.2, 120);
    },
    /** Per-frame: the engine follows the player's car; the siren follows the nearest cruiser. */
    update(G) {
      if (ctx === null) return;
      const t = ctx.currentTime;
      const car = G.player.inCar;
      if (car && G.screen === 'play') {
        const speedRatio = Math.min(1, Math.abs(car.vf) / car.model.topSpeed);
        engineGain.gain.setTargetAtTime(0.045 + speedRatio * 0.05, t, 0.08);
        engineOsc.frequency.setTargetAtTime(52 + speedRatio * 165 + Math.abs(car.vr) * 0.2, t, 0.06);
        engineFilter.frequency.setTargetAtTime(320 + speedRatio * 900, t, 0.1);
      } else {
        engineGain.gain.setTargetAtTime(0, t, 0.09);
      }
      const dist = G.wanted.sirenDist;
      if (G.wanted.stars > 0 && dist < 760 && G.screen === 'play') {
        const near = 1 - dist / 760;
        sirenGain.gain.setTargetAtTime(0.012 + near * 0.035, t, 0.1);
        sirenOsc.frequency.setTargetAtTime(Math.floor(G.time * 2.4) % 2 === 0 ? 715 : 955, t, 0.03);
      } else {
        sirenGain.gain.setTargetAtTime(0, t, 0.12);
      }
    },
  };
}
