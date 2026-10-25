// Chen's Garden Rush: every sound and the music, made on the spot with
// WebAudio (no sound files). Sound effects and music switch on and off apart.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];
// a degree of D major pentatonic from D4 (62); 5 is D5
const deg = d => 62 + PENTA[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);

export function createAudio() {
  let ctx = null, master, sfxBus, musicBus, ambBus, noiseBuf = null;
  const on = { sfx: true, music: true };
  let musicMode = null, timer = null, nextT = 0, step = 0, amb = null, ambZone = null, crickets = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = on.sfx ? 0.75 : 0; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = on.music ? 0.36 : 0; musicBus.connect(master);
      ambBus = ctx.createGain(); ambBus.gain.value = on.sfx ? 1 : 0; ambBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // ------------------------------------------------------------ instruments
  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  function osc(type, f, t, dur, vol, dest, { f2 = null, a = 0.005, slide = dur, detune = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + slide);
    env(g, t, a, vol, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  function noise(t, dur, vol, dest, { type = 'bandpass', f = 1500, f2 = null, q = 1, a = 0.005 } = {}) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, a, vol, dur);
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
  }
  function pluck(n, t, dur, vol, dest = musicBus) {
    const f = NOTE(n), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'triangle'; o1.frequency.value = f; o2.frequency.value = f * 2; o2.detune.value = 4;
    fl.type = 'lowpass'; fl.Q.value = 3;
    fl.frequency.setValueAtTime(5200, t); fl.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    env(g, t, 0.004, vol, dur);
    o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function erhu(n, t, dur, vol) {
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(NOTE(n) * 0.985, t); o.frequency.exponentialRampToValueAtTime(NOTE(n), t + 0.08);
    lfo.frequency.value = 5.6; lg.gain.value = NOTE(n) * 0.012;
    lfo.connect(lg); lg.connect(o.frequency);
    fl.type = 'bandpass'; fl.frequency.value = 1400; fl.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.07);
    g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(musicBus);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  const kick = t => osc('sine', 150, t, 0.16, 0.9, musicBus, { f2: 42, slide: 0.12, a: 0.002 });
  const snare = t => { noise(t, 0.13, 0.35, musicBus, { f: 2200, q: 0.8 }); osc('triangle', 200, t, 0.08, 0.22, musicBus, { f2: 150 }); };
  const hat = (t, v = 0.12) => noise(t, 0.035, v, musicBus, { type: 'highpass', f: 8000 });
  const block = (t, hi) => osc('sine', hi ? 1500 : 1050, t, 0.06, 0.25, musicBus, { a: 0.001 });
  const bass = (n, t, dur) => {
    const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = NOTE(n);
    fl.type = 'lowpass'; fl.frequency.value = 600; fl.Q.value = 2;
    env(g, t, 0.006, 0.32, dur);
    o.connect(fl); fl.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  };
  function gong(t, vol = 0.3, dest = musicBus) {
    for (const [f, v] of [[98, 1], [147.5, 0.6], [196.7, 0.4], [263, 0.25]]) osc('sine', f, t, 2.6, vol * v, dest, { a: 0.02, f2: f * 0.985, slide: 2.6 });
    noise(t, 0.9, vol * 0.25, dest, { f: 600, q: 0.5, a: 0.05 });
  }
  function bell(t, n, vol = 0.25, dest = sfxBus) {
    for (const [m, v] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) osc('sine', NOTE(n) * m, t, 0.7 / m + 0.15, vol * v, dest, { a: 0.002 });
  }

  // ------------------------------------------------------------------ music
  // 8 bars at 128 bpm in D pentatonic: I vi IV V, a plucked riff, and in the
  // second half an erhu-like line over it. Menu music is the same tune, calm.
  const ROOT = [50, 47, 43, 45, 50, 47, 43, 45]; // D2 B1 G1 A1
  const LEAD = [
    [[0, 5], [2, 4], [4, 3], [6, 4], [8, 5], [11, 7], [12, 6], [14, 5]],
    [[0, 4], [3, 3], [6, 2], [8, 3], [10, 4], [12, 3], [14, 1]],
    [[0, 2], [2, 3], [4, 4], [6, 5], [8, 4], [10, 3], [12, 2], [14, 3]],
    [[0, 4], [2, 3], [4, 4], [6, 6], [8, 5], [12, 4], [14, 3]],
    [[0, 5], [2, 7], [4, 6], [6, 5], [8, 7], [10, 8], [12, 7], [14, 5]],
    [[0, 6], [2, 5], [4, 4], [6, 3], [8, 4], [10, 5], [12, 4], [14, 2]],
    [[0, 3], [2, 4], [4, 5], [7, 5], [8, 6], [10, 5], [12, 3], [14, 4]],
    [[0, 5], [3, 4], [6, 3], [8, 4], [10, 3], [12, 1], [13, 2], [14, 0]],
  ];
  const ERHU = [null, null, null, null, [[0, 10, 6], [6, 9, 2], [8, 8, 8]], [[0, 9, 4], [4, 8, 4], [8, 7, 8]], [[0, 8, 8], [8, 9, 8]], [[0, 10, 12], [12, 8, 4]]];
  const BPM = 128, SD = 60 / BPM / 4;
  function playStep(s, t) {
    const bar = Math.floor(s / 16) % 8, i = s % 16, calm = musicMode === 'menu';
    if (i === 0 && bar === 0 && Math.floor(s / 128) % 2 === 0) gong(t, calm ? 0.16 : 0.22);
    // drums
    if (!calm) {
      if (i % 4 === 0) kick(t);
      if (i === 4 || i === 12) snare(t);
      if (i % 2 === 0) hat(t, i % 4 === 2 ? 0.14 : 0.08);
      if (i === 14 || (i === 7 && bar % 2)) block(t, i === 14);
    } else if (i === 0 || i === 8) block(t, i === 8);
    // bass on eighths, octave bounce
    if (i % 2 === 0 && (!calm || i % 4 === 0)) bass(ROOT[bar] + (i % 4 === 2 ? 12 : 0), t, SD * 1.6);
    for (const [k, d] of LEAD[bar]) if (k === i) pluck(deg(d), t, calm ? 0.5 : 0.3, calm ? 0.1 : 0.13);
    const e = ERHU[bar];
    if (e && !calm) for (const [k, d, len] of e) if (k === i) erhu(deg(d), t, len * SD, 0.09);
    // chord stabs on the off-beats
    if (!calm && (i === 2 || i === 10)) for (const off of [12, 16, 19]) pluck(ROOT[bar] + 12 + off - (bar % 4 === 1 ? 1 : 0) * (off === 16 ? 1 : 0), t, 0.12, 0.035);
  }
  function tick() {
    if (!ctx || !musicMode) return;
    while (nextT < ctx.currentTime + 0.25) { playStep(step, nextT); nextT += musicMode === 'menu' ? SD * 1.25 : SD; step++; }
  }
  // the music starts once the player has touched the screen (browsers ask that)
  let wanted = null;
  function music(mode) {
    wanted = mode;
    if (mode === musicMode || !ctx) return;
    musicMode = mode;
    clearInterval(timer); timer = null;
    if (!mode) return;
    nextT = ctx.currentTime + 0.08; step = 0;
    timer = setInterval(tick, 50);
    tick();
  }
  function unlock() {
    if (!ensure()) return;
    if (wanted !== musicMode) music(wanted);
  }

  // -------------------------------------------------------------- ambience
  // a soft bed of sound per part of the restaurant
  const AMB = {
    dining: { f: 380, q: 0.7, v: 0.05 }, kitchen: { f: 3200, q: 0.6, v: 0.035 }, storage: { f: 140, q: 1.2, v: 0.06 },
    garden: { f: 900, q: 0.4, v: 0.02 }, takeaway: { f: 600, q: 0.8, v: 0.04 },
  };
  function ambience(zone) {
    if (!ctx) return;
    if (!amb) {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; fl.type = 'bandpass'; g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(ambBus); s.start();
      amb = { s, fl, g };
    }
    ambZone = zone;
    const a = AMB[zone] || AMB.dining, t = ctx.currentTime;
    amb.fl.frequency.setTargetAtTime(a.f, t, 0.4); amb.fl.Q.setTargetAtTime(a.q, t, 0.4);
    amb.g.gain.setTargetAtTime(zone ? a.v : 0, t, 0.5);
  }
  function ambTick(dt) {
    if (!ctx || ambZone !== 'garden' || !on.sfx) return;
    crickets -= dt;
    if (crickets <= 0) {
      crickets = 0.6 + Math.random() * 1.4;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) osc('sine', 4300 + Math.random() * 300, t + i * 0.07, 0.04, 0.025, ambBus, { a: 0.003 });
    }
  }

  // --------------------------------------------------------- sound effects
  const SFX = {
    coin: (t, e) => { const up = (e && e.n) || 0; osc('square', NOTE(83 + up), t, 0.05, 0.07, sfxBus); osc('square', NOTE(88 + up), t + 0.05, 0.12, 0.07, sfxBus); },
    jump: t => osc('triangle', 300, t, 0.2, 0.25, sfxBus, { f2: 720, slide: 0.16 }),
    spring: t => { osc('sine', 220, t, 0.42, 0.35, sfxBus, { f2: 880, slide: 0.32 }); osc('triangle', 440, t + 0.03, 0.3, 0.12, sfxBus, { f2: 1320, slide: 0.3 }); },
    slide: t => noise(t, 0.32, 0.22, sfxBus, { f: 2500, f2: 500, q: 1.2 }),
    dive: t => osc('triangle', 800, t, 0.18, 0.22, sfxBus, { f2: 180, slide: 0.16 }),
    land: t => { osc('sine', 130, t, 0.1, 0.35, sfxBus, { f2: 55, slide: 0.08 }); noise(t, 0.08, 0.1, sfxBus, { f: 400 }); },
    lane: t => noise(t, 0.09, 0.12, sfxBus, { type: 'highpass', f: 2500, f2: 5000, q: 0.5 }),
    edge: t => osc('square', 140, t, 0.08, 0.12, sfxBus, { f2: 90 }),
    power: t => { [0, 4, 7, 12, 16].forEach((n, i) => osc('square', NOTE(72 + n), t + i * 0.055, 0.12, 0.08, sfxBus)); bell(t + 0.28, 96, 0.12); },
    special: t => { bell(t, 88, 0.2); bell(t + 0.08, 95, 0.15); },
    powerWarn: t => { osc('sine', 990, t, 0.06, 0.12, sfxBus); osc('sine', 990, t + 0.14, 0.06, 0.12, sfxBus); },
    powerEnd: t => [12, 7, 0].forEach((n, i) => osc('triangle', NOTE(72 + n), t + i * 0.07, 0.1, 0.12, sfxBus)),
    dragonUp: t => { gong(t, 0.35, sfxBus); osc('sawtooth', 110, t, 0.7, 0.12, sfxBus, { f2: 330, slide: 0.6 }); },
    dragonDown: t => osc('sawtooth', 330, t, 0.6, 0.08, sfxBus, { f2: 110, slide: 0.5 }),
    trayOn: t => { for (let i = 0; i < 5; i++) osc('sine', NOTE(84 + i * 3), t + i * 0.04, 0.4, 0.06, sfxBus); noise(t, 0.4, 0.06, sfxBus, { type: 'highpass', f: 6000 }); },
    trayNo: t => osc('square', 120, t, 0.14, 0.1, sfxBus, { f2: 100 }),
    trayWarn: t => { osc('sine', 1320, t, 0.05, 0.1, sfxBus); osc('sine', 1320, t + 0.12, 0.05, 0.1, sfxBus); osc('sine', 1320, t + 0.24, 0.05, 0.1, sfxBus); },
    trayEnd: t => osc('triangle', 880, t, 0.25, 0.12, sfxBus, { f2: 440 }),
    trayBreak: t => { for (const f of [523, 1187, 1840, 2650]) osc('sine', f, t, 0.5, 0.09, sfxBus, { a: 0.001 }); noise(t, 0.35, 0.35, sfxBus, { f: 3500, q: 0.6 }); },
    bump: t => osc('sine', 300, t, 0.1, 0.2, sfxBus, { f2: 200 }),
    stumble: t => { osc('square', 220, t, 0.1, 0.12, sfxBus, { f2: 110 }); noise(t, 0.15, 0.18, sfxBus, { f: 800 }); },
    crash: t => { noise(t, 0.45, 0.45, sfxBus, { f: 900, f2: 200, q: 0.5 }); osc('sine', 110, t, 0.3, 0.4, sfxBus, { f2: 40 }); },
    caught: t => { osc('sine', 1400, t, 0.9, 0.16, sfxBus, { f2: 300, slide: 0.85 }); bell(t + 0.95, 62, 0.14); },
    cartWarn: t => { bell(t, 93, 0.13); bell(t + 0.16, 93, 0.13); },
    crossWarn: t => { bell(t, 90, 0.13); bell(t + 0.12, 86, 0.13); },
    zone: t => bell(t, 81, 0.1),
    click: t => osc('sine', 900, t, 0.03, 0.08, sfxBus, { a: 0.001 }),
    buy: t => [0, 7, 12].forEach((n, i) => osc('triangle', NOTE(79 + n), t + i * 0.06, 0.15, 0.12, sfxBus)),
    mission: t => { [0, 4, 7, 12].forEach((n, i) => pluck(74 + n, t + i * 0.08, 0.4, 0.14, sfxBus)); bell(t + 0.35, 98, 0.12); },
    record: t => { [0, 4, 7, 12, 16, 19].forEach((n, i) => pluck(67 + n, t + i * 0.07, 0.5, 0.14, sfxBus)); gong(t + 0.45, 0.2, sfxBus); },
    tutorial: t => bell(t, 86, 0.12),
  };
  let lastCoin = 0, coinRun = 0;
  function play(type, e) {
    if (!on.sfx || !SFX[type] || !ctx) return;
    const t = ctx.currentTime + 0.005;
    if (type === 'coin') {
      // a run of coins climbs a little in pitch
      coinRun = t - lastCoin < 0.35 ? Math.min(coinRun + 1, 7) : 0; lastCoin = t;
      return SFX.coin(t, { n: [0, 2, 4, 7, 9, 12, 14, 16][coinRun] });
    }
    SFX[type](t, e);
  }

  return {
    unlock,
    play,
    music,
    ambience,
    tick: ambTick,
    set(k, v) {
      on[k] = !!v;
      if (!ctx) return;
      const t = ctx.currentTime;
      if (k === 'sfx') { sfxBus.gain.setTargetAtTime(v ? 0.75 : 0, t, 0.05); ambBus.gain.setTargetAtTime(v ? 1 : 0, t, 0.05); }
      if (k === 'music') musicBus.gain.setTargetAtTime(v ? 0.36 : 0, t, 0.05);
    },
    get: k => on[k],
    pause(p) { if (!ctx) return; if (p) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); },
    get started() { return !!ctx; },
    close() { clearInterval(timer); musicMode = null; if (ctx) ctx.close().catch(() => {}); ctx = null; amb = null; },
  };
}
