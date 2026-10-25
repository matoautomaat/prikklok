// Chen's Garden Rush: one run, step by step, without any drawing. The view
// (view.js) and the screens (main.js) only read this state and its events.
import { C, SIZE, speedAt, laneX, powerTime } from './rules.js';
import { createWorld, cartAt, trolleyX } from './world.js';

export function newPlayer() {
  return {
    d: 0, t: 0, v: C.V0, lane: 1, from: 1, x: 0, y: 0, vy: 0, ground: true, slide: 0,
    wantJump: 0, wantSlide: 0, coyote: 0, roll: false, stumble: 0, invuln: 0, fly: null, spring: false,
  };
}
export const heightOf = p => (p.slide > 0 ? C.SLIDE_H : C.STAND_H);

// Where an obstacle is when the waiter is at pd (carts and trolleys move).
export function boxOf(o, pd) {
  if (o.k === 'ca') { const [a, b] = cartAt(o, pd); return [a, b, o.x0, o.x1]; }
  if (o.k === 'cr') { const x = trolleyX(o, pd); return [o.d0, o.d1, x - SIZE.cr.W, x + SIZE.cr.W]; }
  return [o.d0, o.d1, o.x0, o.x1];
}

// The surface under the waiter's feet: the floor, a counter, the top of a
// crate or a ramp. Only tops up to maxTop count (higher ones are in the way).
function surface(obs, p, maxTop) {
  let s = 0;
  for (const o of obs) {
    if (o.gone || !o.stand || o.d0 > p.d + 1 || o.d1 < p.d - 1) continue;
    if (Math.abs(p.x - (o.x0 + o.x1) / 2) > (o.x1 - o.x0) / 2 + 0.12) continue;
    let top;
    if (o.k === 'ramp') {
      if (p.d < o.d0 || p.d > o.d1) continue;
      top = o.y1 * (p.d - o.d0) / (o.d1 - o.d0);
    } else {
      if (p.d < o.d0 - C.HD * 0.6 || p.d > o.d1 + C.HD * 0.6) continue;
      top = o.y1;
    }
    if (top <= maxTop && top > s) s = top;
  }
  return s;
}

// What the waiter ran into this step, if anything: a crash (head-on) or a
// stumble (a sideways clip or a glancing corner). Collision boxes are a little
// smaller than the drawings; on things you can stand on only the part below
// the step height counts, so landing on top is never a hit.
const SHRINK = 0.08, GLANCE = 0.22;
function collide(p, prev, obs) {
  const h = heightOf(p);
  const px0 = p.x - C.HW, px1 = p.x + C.HW, pd0 = p.d - C.HD, pd1 = p.d + C.HD, py0 = p.y, py1 = p.y + h;
  const qx0 = prev.x - C.HW, qx1 = prev.x + C.HW, qd0 = prev.d - C.HD, qd1 = prev.d + C.HD;
  for (const o of obs) {
    if (o.gone || o.hit || o.k === 'ramp') continue;
    const [d0, d1, x0, x1] = boxOf(o, p.d);
    if (d0 > pd1 + 0.5 || d1 < pd0 - 0.5) continue;
    const top = o.stand ? o.y1 - C.STEP : o.y1 - 0.06, bottom = o.y0;
    const sd0 = d0 + SHRINK, sd1 = d1 - SHRINK, sx0 = x0 + SHRINK, sx1 = x1 - SHRINK;
    const lat = px1 > sx0 && px0 < sx1, dep = pd1 > sd0 && pd0 < sd1;
    if (!lat || !dep) continue;
    if (!(py1 > bottom && py0 < top)) {
      // over or under it: for the missions
      if (py0 >= top) o.over = true; else o.under = true;
      continue;
    }
    const [e0, e1, f0, f1] = boxOf(o, prev.d);
    const qlat = qx1 > f0 + SHRINK && qx0 < f1 - SHRINK, qdep = qd1 > e0 + SHRINK && qd0 < e1 - SHRINK;
    if (o.k === 'cr') return { o, kind: 'crash' };
    if (!qlat && qdep) return { o, kind: 'stumble', side: true };
    if (!qdep && Math.min(px1, sx1) - Math.max(px0, sx0) < GLANCE && o.k !== 'ca') return { o, kind: 'stumble', glance: true };
    return { o, kind: 'crash' };
  }
  return null;
}

// Moves the waiter on by dt. Returns what he ran into (or null). ev, when
// given, collects what happened for sounds and effects.
export function advance(p, obs, dt, ev) {
  const prev = { d: p.d, x: p.x, y: p.y };
  p.t += dt;
  p.wantJump = Math.max(0, p.wantJump - dt);
  p.wantSlide = Math.max(0, p.wantSlide - dt);
  p.coyote = Math.max(0, p.coyote - dt);
  p.stumble = Math.max(0, p.stumble - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (p.slide > 0) p.slide = Math.max(0, p.slide - dt);

  if (!p.fly) {
    // a swipe waits briefly for the moment it can happen (landing, an edge)
    if (p.wantJump > 0 && (p.ground || p.coyote > 0)) {
      p.vy = p.spring ? C.SPRING_V : C.JUMP_V;
      p.ground = false; p.coyote = 0; p.slide = 0; p.wantJump = 0; p.roll = false;
      if (ev) ev.push({ type: 'jump', spring: p.spring });
    }
    if (p.wantSlide > 0) {
      if (p.ground) { p.slide = C.SLIDE_T; p.wantSlide = 0; if (ev) ev.push({ type: 'slide' }); }
      else if (!p.roll) { p.vy = Math.min(p.vy, -C.FALL_V); p.roll = true; p.wantSlide = 0; if (ev) ev.push({ type: 'dive' }); }
    }
  }

  p.v = speedAt(p.d) * (p.stumble > 0 ? C.STUMBLE_SLOW : 1);
  p.d += p.v * dt;
  const tx = laneX(p.lane), step = C.LANE_W / C.LANE_T * dt;
  p.x = Math.abs(tx - p.x) <= step ? tx : p.x + Math.sign(tx - p.x) * step;

  if (p.fly) {
    // the Golden Dragon: up, along, and down onto a cleared landing strip
    if (p.fly.phase === 'down') {
      p.y -= C.DRAGON_Y / C.DRAGON_DOWN * dt;
      const sup = surface(obs, p, 99);
      if (p.y <= sup) {
        p.y = sup; p.vy = 0; p.ground = true; p.fly = null; p.invuln = 1.0;
        if (ev) ev.push({ type: 'land', y: sup, dragon: true });
      }
    } else p.y += (C.DRAGON_Y - p.y) * Math.min(1, dt * 5);
    return null;
  }

  if (!p.ground) { p.vy -= C.G * dt; p.y += p.vy * dt; }
  const sup = surface(obs, p, (p.ground ? p.y : prev.y) + C.STEP);
  if (p.ground) {
    if (sup >= p.y - 0.06) p.y = sup;
    else { p.ground = false; p.vy = 0; p.coyote = C.COYOTE; }
  } else if (p.vy <= 0 && p.y <= sup) {
    p.y = sup; p.vy = 0; p.ground = true;
    if (ev) ev.push({ type: 'land', y: sup });
    if (p.roll || p.wantSlide > 0) {
      p.slide = C.SLIDE_T; p.roll = false; p.wantSlide = 0;
      if (ev) ev.push({ type: 'slide' });
    }
  }
  return p.invuln > 0 ? null : collide(p, prev, obs);
}

// Lane changes happen at once; one swipe, one lane.
export function steer(p, dir) {
  const to = Math.max(0, Math.min(2, p.lane + dir));
  if (to === p.lane) return false;
  p.from = p.lane; p.lane = to;
  return true;
}

// ---------------------------------------------------------------- a run

export function createRun(opt = {}) {
  const seed = opt.seed ?? ((Math.random() * 2 ** 31) | 0);
  const w = createWorld(seed, { tutorial: !!opt.tutorial });
  const p = newPlayer();
  const levels = opt.levels || {};
  const run = {
    seed, w, p, state: 'run', ev: [],
    score: 0, coins: 0, baseMult: opt.mult || 1,
    trays: opt.trays || 0, tray: 0, trayT: C.TRAY_T,
    power: { magnet: 0, spring: 0, dragon: 0, double: 0 },
    powerT: { magnet: 1, spring: 1, dragon: 1, double: 1 },
    chef: 0,          // seconds the chef stays close after a stumble
    chase: 0.85,      // how close the chef is drawn: 1 right behind, 0 far back
    caughtBy: null, caughtT: 0,
    tutorial: !!opt.tutorial,
    counts: { jumps: 0, slides: 0, dumpling: 0, cookie: 0, box: 0, powerups: 0, trays: 0, stumbles: 0 },
    zone: w.zoneAt(0),
  };
  const ev = run.ev;
  run.mult = () => run.baseMult * (run.power.double > 0 ? 2 : 1);
  run.inTutorial = () => run.tutorial && p.d < w.tutorialEnd;

  run.input = a => {
    if (run.state !== 'run') return;
    if (a === 'left' || a === 'right') {
      if (steer(p, a === 'left' ? -1 : 1)) ev.push({ type: 'lane', dir: a });
      else ev.push({ type: 'edge' });
    } else if (a === 'up') { if (!p.fly) p.wantJump = C.BUFFER; }
    else if (a === 'down') { if (!p.fly) p.wantSlide = C.BUFFER; }
    else if (a === 'tray') {
      if (run.tray > 0 || run.trays <= 0 || p.fly) { ev.push({ type: 'trayNo' }); return; }
      run.trays--; run.tray = run.trayT; run.counts.trays++;
      ev.push({ type: 'trayOn' });
    }
  };

  // The Golden Dragon carries the waiter over everything, with coins in the
  // air, and puts him down on a strip kept free of obstacles.
  function dragon(T) {
    p.fly = { phase: 'up', t: 0 }; p.slide = 0; p.vy = 0; p.ground = false;
    const v = speedAt(p.d), land = p.d + v * (T + C.DRAGON_DOWN) * 1.04;
    w.reserve(land - v * 1.2 - 10, land + v * 1.6 + 20);
    let lane = p.lane;
    for (let d = p.d + 14, i = 0; d < land - v * 0.9; d += C.COIN_GAP, i++) {
      if (i % 9 === 8) lane = Math.max(0, Math.min(2, lane + (lane === 0 ? 1 : lane === 2 ? -1 : (i % 2 ? 1 : -1))));
      w.coins.push({ id: 1e7 + Math.floor(d * 10), d, x: laneX(lane), y: C.DRAGON_Y + 0.6, taken: false, sky: true });
    }
    ev.push({ type: 'dragonUp' });
  }

  function take(it) {
    it.taken = true;
    if (it.k === 'power') {
      const T = powerTime(it.p, levels[it.p] || 0);
      run.power[it.p] = T; run.powerT[it.p] = T;
      run.counts.powerups++;
      ev.push({ type: 'power', p: it.p, again: false });
      if (it.p === 'dragon') { if (!p.fly) dragon(T); else p.fly.phase = 'fly'; }
    } else {
      run.counts[it.p]++;
      ev.push({ type: 'special', p: it.p, d: it.d });
    }
  }

  function hurt(hit) {
    const o = hit.o;
    o.hit = true;
    if (run.inTutorial()) {
      // the tutorial never ends a run: the obstacle steps aside
      o.gone = true; p.stumble = C.STUMBLE_T; p.invuln = 0.8;
      ev.push({ type: 'stumble', o, soft: true });
      return;
    }
    if (hit.kind === 'crash') {
      if (run.tray > 0) {
        run.tray = 0; p.invuln = C.INVULN_T;
        w.clear(p.d - 3, p.d + Math.max(40, p.v * 2.4));
        ev.push({ type: 'trayBreak', o });
        return;
      }
      run.state = 'caught'; run.caughtBy = o; run.caughtT = 0;
      ev.push({ type: 'crash', o });
      return;
    }
    // a stumble: bounce back out of the obstacle's way
    let ok = true;
    if (hit.side) { p.lane = p.from; }
    else {
      const away = (boxOf(o, p.d)[2] + boxOf(o, p.d)[3]) / 2 > p.x ? -1 : 1;
      ok = steer(p, away);
    }
    if (!ok && run.tray <= 0) { run.state = 'caught'; run.caughtBy = o; run.caughtT = 0; ev.push({ type: 'crash', o }); return; }
    if (run.tray > 0) { p.invuln = 0.4; ev.push({ type: 'bump', o }); return; }
    run.counts.stumbles++;
    if (run.chef > 0) {
      // a second stumble while the chef is still close: caught
      run.state = 'caught'; run.caughtBy = o; run.caughtT = 0;
      ev.push({ type: 'caught', o });
      return;
    }
    p.stumble = C.STUMBLE_T; p.invuln = 0.35; run.chef = C.CHEF_T;
    ev.push({ type: 'stumble', o });
  }

  run.step = dt => {
    if (run.state === 'caught') { run.caughtT += dt; run.chase = Math.min(1, run.chase + dt * 3); if (run.caughtT > 2.3) run.state = 'over'; return; }
    if (run.state !== 'run') return;
    w.ensure(p.d);
    p.spring = run.power.spring > 0;
    const d0 = p.d;
    const hit = advance(p, w.obs, dt, ev);
    if (hit) hurt(hit);
    if (run.state !== 'run') return;
    run.score += (p.d - d0) * run.mult();

    // power-ups and the tray run out; a warning two seconds before
    for (const k in run.power) {
      if (run.power[k] <= 0) continue;
      const before = run.power[k];
      run.power[k] = Math.max(0, before - dt);
      if (before > 2 && run.power[k] <= 2) ev.push({ type: 'powerWarn', p: k });
      if (run.power[k] === 0) {
        ev.push({ type: 'powerEnd', p: k });
        if (k === 'dragon' && p.fly) { p.fly.phase = 'down'; ev.push({ type: 'dragonDown' }); }
      }
    }
    if (p.fly && p.fly.phase === 'up' && (p.fly.t += dt) > C.DRAGON_UP) p.fly.phase = 'fly';
    if (run.tray > 0) {
      const before = run.tray;
      run.tray = Math.max(0, before - dt);
      if (before > 3 && run.tray <= 3) ev.push({ type: 'trayWarn' });
      if (run.tray === 0) ev.push({ type: 'trayEnd' });
    }
    run.chef = Math.max(0, run.chef - dt);
    run.chase += ((run.chef > 0 ? 0.95 : 0) - run.chase) * Math.min(1, dt * (run.chef > 0 ? 4 : 0.35));

    // coins: touched, or pulled in by the Tip Magnet
    const h = heightOf(p), magnet = run.power.magnet > 0;
    for (const c of w.coins) {
      if (c.taken || c.d < p.d - 2 || c.d > p.d + 16) continue;
      if (c.pull != null) {
        c.pull += dt;
        if (c.pull >= 0.2) { c.taken = true; run.coins++; ev.push({ type: 'coin', c }); }
        continue;
      }
      const dd = c.d - p.d;
      if (Math.abs(dd) < 0.9 && Math.abs(c.x - p.x) < 0.9 && c.y > p.y - 0.35 && c.y < p.y + h + 0.4) {
        c.taken = true; run.coins++; ev.push({ type: 'coin', c });
      } else if (magnet && dd > -0.5 && dd < 13 && !c.sky === !p.fly) { c.pull = 0; c.px = c.x; c.py = c.y; c.pd = c.d; }
    }
    for (const it of w.items) {
      if (it.taken || Math.abs(it.d - p.d) > 1.1) continue;
      if (Math.abs(it.x - p.x) < 1.0 && it.y > p.y - 0.4 && it.y < p.y + h + 0.6) take(it);
    }

    // obstacles passed: jumps and slides for the missions; warnings for carts
    for (const o of w.obs) {
      if (o.gone) continue;
      if (!o.counted && o.d1 < p.d - C.HD) {
        o.counted = true;
        if (o.over && !o.hit && (o.k === 'lo' || o.k === 'cr')) { run.counts.jumps++; ev.push({ type: 'cleared', how: 'jump' }); }
        if (o.under && !o.hit && o.k === 'ov') { run.counts.slides++; ev.push({ type: 'cleared', how: 'slide' }); }
      }
      if (o.k === 'ca' && !o.warned && cartAt(o, p.d)[0] - p.d < 75) { o.warned = true; ev.push({ type: 'cartWarn', o }); }
      if (o.k === 'cr' && !o.warned && o.d0 - p.d < 45) { o.warned = true; ev.push({ type: 'crossWarn', o }); }
    }
    const z = w.zoneAt(p.d);
    if (z !== run.zone) { run.zone = z; ev.push({ type: 'zone', z }); }
    if ((p.t * 2 | 0) % 10 === 0) w.prune(p.d);
  };

  // The next tutorial obstacle and the move it asks for.
  run.lesson = () => {
    if (!run.inTutorial()) return null;
    const o = w.obs.find(x => x.tut && !x.gone && x.d1 > p.d - C.HD);
    if (o) return { need: o.tut, o, dist: o.d0 - p.d };
    if (w.trayHint && p.d > w.trayHint - 5 && p.d < w.tutorialEnd) return { need: 'tray', dist: 0 };
    return null;
  };

  return run;
}
