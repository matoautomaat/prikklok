// Proves the routes are survivable: a breadth-first search over the real
// simulation, with one input at most every 0.15 s (no faster than swiping),
// that must get through without a single stumble.
const R = new URL('../../web/rush/', import.meta.url).href;
const { createWorld } = await import(R + 'world.js');
const { newPlayer, advance, steer } = await import(R + 'sim.js');
const { C, speedAt, SIZE } = await import(R + 'rules.js');
const { PATTERNS, TUTORIAL } = await import(R + 'patterns.js');

export const DECIDE = 0.15;
const SUB = Math.round(DECIDE / C.DT);
const ACTIONS = ['none', 'left', 'right', 'up', 'down'];
const clone = p => ({ ...p, fly: p.fly ? { ...p.fly } : null });
const key = p => [p.lane, Math.round(p.x * 10), Math.round(p.y * 20), Math.round(p.vy * 4), Math.round(p.slide * 20),
  p.ground ? 1 : 0, p.roll ? 1 : 0, p.wantJump > 0 ? 1 : 0, p.wantSlide > 0 ? 1 : 0].join(',');

// From each start state, can the waiter reach endD without touching anything?
export function solve(w, starts, endD, maxStates = 600) {
  let states = starts.map(clone), steps = 0;
  while (states.length) {
    if (states[0].d >= endD) return { ok: true, steps };
    const near = w.obs.filter(o => !o.gone && o.d1 > states[0].d - 40 && o.d0 < states[0].d + 60 || o.k === 'ca');
    const next = new Map();
    for (const s of states) {
      for (const a of ACTIONS) {
        const p = clone(s);
        if (a === 'left' && !steer(p, -1)) continue;
        if (a === 'right' && !steer(p, 1)) continue;
        if (a === 'up') p.wantJump = C.BUFFER;
        if (a === 'down') p.wantSlide = C.BUFFER;
        let dead = false;
        for (let i = 0; i < SUB && !dead; i++) if (advance(p, near, C.DT, null)) dead = true;
        if (!dead) { const k = key(p); if (!next.has(k)) next.set(k, p); }
      }
    }
    states = [...next.values()];
    if (states.length > maxStates) states = states.filter((_, i) => i % Math.ceil(states.length / maxStates) === 0);
    steps++;
    if (!states.length) return { ok: false, at: starts[0].d + steps * DECIDE * speedAt(starts[0].d), steps };
  }
  return { ok: false };
}

// Coins must never sit inside something solid.
export function coinsInside(w) {
  const bad = [];
  for (const c of w.coins) for (const o of w.obs) {
    if (o.gone || o.k === 'ramp' || o.k === 'ca' || o.k === 'cr') continue;
    if (c.d > o.d0 + 0.1 && c.d < o.d1 - 0.1 && c.x > o.x0 && c.x < o.x1 && c.y > o.y0 && c.y < (o.stand ? o.y1 : o.y1)) bad.push({ c, o });
  }
  return bad;
}

if (process.argv[2] === 'patterns') {
  let fails = 0, n = 0;
  const speeds = [[0, 'slow'], [1300, 'mid'], [8000, 'top']];
  for (const p of [...PATTERNS, ...TUTORIAL]) {
    for (const [D, name] of speeds) {
      for (const mirror of [false, true]) {
        const w = createWorld(1, { script: [{ p, mirror }], startAt: D });
        const end = w.spans[0][1];
        for (const lane of [0, 1, 2]) {
          const s = newPlayer(); s.d = D - 1; s.lane = s.from = lane; s.x = (lane - 1) * C.LANE_W;
          const r = solve(w, [s], end + 2);
          n++;
          if (!r.ok) { fails++; console.log(`FAIL ${p.id} ${name} (${speedAt(D).toFixed(1)} m/s) from lane ${lane}${mirror ? ' mirrored' : ''}: stuck at ${(r.at - D).toFixed(1)} m into the pattern`); }
        }
        const inside = coinsInside(w);
        if (inside.length) { fails++; console.log(`COINS INSIDE ${p.id} ${name}: ${inside.length} (${inside[0].o.k} at ${(inside[0].o.d0 - D).toFixed(1)})`); }
      }
    }
  }
  console.log(`${n} pattern starts checked, ${fails} problems`);
  process.exit(fails ? 1 : 0);
}

if (process.argv[2] === 'runs') {
  const seeds = Number(process.argv[3] || 5), dist = Number(process.argv[4] || 3000);
  let fails = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const w = createWorld(seed * 7919, {});
    w.ensure(dist);
    const t0 = Date.now();
    const starts = [0, 1, 2].map(l => { const s = newPlayer(); s.lane = s.from = l; s.x = (l - 1) * C.LANE_W; return s; });
    // the whole route at once: one search from the start
    let states = starts, d = 0;
    const r = solve(w, [starts[1]], dist);
    const inside = coinsInside(w);
    console.log(`seed ${seed}: ${r.ok ? 'survivable' : 'STUCK at ' + r.at.toFixed(0) + ' m'} to ${dist} m (${((Date.now() - t0) / 1000).toFixed(1)} s), coins inside obstacles: ${inside.length}`);
    if (!r.ok || inside.length) fails++;
  }
  process.exit(fails ? 1 : 0);
}
