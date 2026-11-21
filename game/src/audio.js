// Every sound is synthesised with Web Audio, no files: gunshots, blasts, crashes, punches,
// horns, screams, pickups, the mission jingle, the engine note of the car you drive, the police
// siren, the city's hum and the waves, and Palm FM, a little synthwave station in every car.

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];

export function createAudio(settings) {
  let ctx = null;
  let master;
  let sfx;
  let musicBus;
  let noise;
  let engine;
  let siren;
  let ambient;
  let radio = { on: false, next: 0, step: 0 };
  const listener = { x: 0, z: 0 };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = settings.music * 0.5;
    musicBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let n = 0; n < data.length; n += 1) data[n] = Math.random() * 2 - 1;

    // The engine: two detuned oscillators through a low-pass, silent until you drive.
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(eg);
    eg.connect(sfx);
    o1.start();
    o2.start();
    engine = { gain: eg, o1, o2, lp };

    const sg = ctx.createGain();
    sg.gain.value = 0;
    const so = ctx.createOscillator();
    so.type = 'triangle';
    so.connect(sg);
    sg.connect(sfx);
    so.start();
    siren = { gain: sg, osc: so };

    const hum = loopNoise(300, 'lowpass', 0.025);
    const waves = loopNoise(900, 'bandpass', 0);
    ambient = { hum, waves };
    return true;
  }

  function loopNoise(freq, type, vol) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(sfx);
    src.start();
    return g;
  }

  function near(x, z, range = 140) {
    const d = Math.hypot(x - listener.x, z - listener.z);
    if (d > range) return 0;
    return 1 / (1 + d / 14);
  }

  function burstNoise(vol, dur, freq, type = 'bandpass', q = 1, when = 0, bus = sfx) {
    if (!ctx || vol <= 0.001) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, vol, type = 'sine', slide = null, when = 0, bus = sfx) {
    if (!ctx || vol <= 0.001) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** One sixteenth of Palm FM: kick, snare, hats, bass, pad and arpeggio over a four-chord loop. */
  function radioStep(step, t) {
    const when = t - ctx.currentTime;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = CHORDS[bar];
    if (s % 4 === 0) tone(110, 0.25, 0.5, 'sine', 40, when, musicBus);
    if (s === 4 || s === 12) burstNoise(0.25, 0.18, 1800, 'bandpass', 0.7, when, musicBus);
    if (s % 2 === 1) burstNoise(0.08, 0.05, 8000, 'highpass', 1, when, musicBus);
    if (s % 4 === 0 || s % 4 === 3) tone(NOTE(chord[0] - 24), 0.22, 0.22, 'sawtooth', null, when, musicBus);
    if (s === 0) for (const n of chord) tone(NOTE(n), 2.1, 0.05, 'triangle', null, when, musicBus);
    if (s % 2 === 0) tone(NOTE(chord[(s / 2) % 3] + 12 + (s >= 8 ? 12 : 0)), 0.18, 0.06, 'square', null, when, musicBus);
  }

  return {
    unlock: ensure,
    get ready() {
      return Boolean(ctx);
    },
    setVolume(v, m) {
      settings.volume = v;
      settings.music = m;
      if (master) master.gain.value = v;
      if (musicBus) musicBus.gain.value = m * 0.5;
    },
    setListener(x, z) {
      listener.x = x;
      listener.z = z;
    },
    gunshot(id, x, z, own) {
      const v = own ? 0.7 : near(x, z) * 0.9;
      const deep = id === 'shotgun' ? 600 : id === 'smg' ? 1700 : 1200;
      burstNoise(v, id === 'shotgun' ? 0.35 : 0.16, deep, 'bandpass', 0.8);
      tone(id === 'shotgun' ? 90 : 140, 0.12, v * 0.6, 'sine', 40);
    },
    explosion(x, z) {
      const v = Math.max(0.15, near(x, z, 300));
      burstNoise(v * 1.4, 1.6, 300, 'lowpass', 0.7);
      tone(70, 0.9, v, 'sine', 25);
    },
    crash(x, z, impact) {
      const v = near(x, z) * Math.min(1, impact / 12);
      burstNoise(v, 0.35, 900, 'bandpass', 0.6);
      tone(60, 0.2, v * 0.6, 'square', 30);
    },
    punch(x, z, hit) {
      burstNoise(near(x, z) * (hit ? 0.6 : 0.2), 0.1, hit ? 400 : 1500, 'lowpass', 1);
    },
    horn(x, z) {
      const v = near(x, z) * 0.35;
      tone(392, 0.45, v, 'square');
      tone(494, 0.45, v * 0.8, 'square');
    },
    scream(x, z) {
      const v = near(x, z) * 0.18;
      const f = 700 + Math.random() * 400;
      tone(f, 0.5, v, 'sawtooth', f * 1.3);
    },
    pickup(big) {
      tone(880, 0.12, 0.25, 'triangle');
      tone(1320, 0.2, 0.25, 'triangle', null, 0.08);
      if (big) tone(1760, 0.3, 0.2, 'triangle', null, 0.16);
    },
    click() {
      tone(2000, 0.03, 0.15, 'square');
    },
    jingle() {
      [0, 4, 7, 12, 16].forEach((n, i) => tone(NOTE(64 + n), 0.5, 0.18, 'triangle', null, i * 0.11));
      tone(NOTE(52), 1.2, 0.2, 'sawtooth', null, 0.44);
    },
    wasted() {
      tone(220, 1.6, 0.25, 'sawtooth', 55);
    },
    toggleRadio() {
      radio.on = !radio.on;
      return radio.on;
    },
    get radioOn() {
      return radio.on;
    },
    setRadio(on) {
      radio.on = on;
    },
    /** Per-frame upkeep: engine note, siren level, ambience and the radio's schedule. */
    update(game) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const car = game.player.vehicle;
      if (car && !car.wrecked && game.mode === 'play') {
        const speed = Math.abs(car.fwd);
        const gear = Math.min(4, Math.floor(speed / 9));
        const rev = (speed - gear * 9) / 9;
        const f = 38 + gear * 7 + rev * 60 + car.throttle * 12;
        engine.o1.frequency.setTargetAtTime(f, t, 0.05);
        engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
        engine.lp.frequency.setTargetAtTime(400 + car.throttle * 900 + speed * 15, t, 0.08);
        engine.gain.gain.setTargetAtTime(0.05 + car.throttle * 0.05, t, 0.1);
      } else engine.gain.gain.setTargetAtTime(0, t, 0.1);

      let sirenNear = 0;
      for (const v of game.vehicles) if (v.siren && !v.wrecked) sirenNear = Math.max(sirenNear, near(v.x, v.z, 180));
      siren.gain.gain.setTargetAtTime(game.mode === 'play' ? sirenNear * 0.12 : 0, t, 0.1);
      siren.osc.frequency.setTargetAtTime(800 + Math.sin(t * Math.PI * 1.4) * 280, t, 0.02);

      const beach = Math.max(0, 1 - Math.max(0, listener.x + 20) / 90);
      ambient.waves.gain.setTargetAtTime(beach * 0.06 * (0.7 + Math.sin(t * 0.5) * 0.3), t, 0.3);

      const playing = radio.on && car && game.mode === 'play';
      if (playing) {
        if (radio.next < t) radio.next = t + 0.05;
        const sixteenth = 60 / 104 / 4;
        while (radio.next < t + 0.15) {
          radioStep(radio.step, radio.next);
          radio.step += 1;
          radio.next += sixteenth;
        }
      }
    },
  };
}
