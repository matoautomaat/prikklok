// Chen's Garden Rush: the route ahead, built from patterns as the waiter runs,
// through five parts of the restaurant that follow each other without a break.
import { PATTERNS, TUTORIAL } from './patterns.js';
import { C, SIZE, ZONES, COUNTRIES, ASIA_AT, speedAt, JUMP_T, jumpY, laneX, rng } from './rules.js';

// What each kind of obstacle looks like in each part of the restaurant.
const VARIANTS = {
  dining: { lo: ['trays', 'boxes'], ov: ['rack'], ta: ['trolleys'], pl: 'counter' },
  kitchen: { lo: ['crate'], ov: ['utensils'], ta: ['fridge'], pl: 'steel' },
  storage: { lo: ['sack', 'crate'], ov: ['rack'], ta: ['shelf'], pl: 'cartplat' },
  garden: { lo: ['boxes', 'sack'], ov: ['rack'], ta: ['trolleys'], pl: 'cartplat' },
  takeaway: { lo: ['boxes'], ov: ['shutter'], ta: ['vending'], pl: 'counter' },
  // outside, from ASIA_AT on: the same shapes, dressed for each country
  japan: { lo: ['barrels'], ov: ['noren'], ta: ['stonelantern'], pl: 'wooddeck' },
  china: { lo: ['baskets', 'barrels'], ov: ['banner'], ta: ['stall'], pl: 'stonewall' },
  korea: { lo: ['jars'], ov: ['banner'], ta: ['onggi'], pl: 'wooddeck' },
  thailand: { lo: ['baskets'], ov: ['garland'], ta: ['tuktuk'], pl: 'wooddeck' },
  vietnam: { lo: ['baskets', 'sack'], ov: ['banner'], ta: ['stall'], pl: 'wooddeck' },
  india: { lo: ['jars'], ov: ['garland'], ta: ['tuktuk'], pl: 'stonewall' },
  nepal: { lo: ['sack', 'baskets'], ov: ['flags'], ta: ['shrine'], pl: 'stonewall' },
  indonesia: { lo: ['baskets'], ov: ['garland'], ta: ['stall'], pl: 'wooddeck' },
};
const POWERS = [['magnet', 30], ['double', 26], ['spring', 26], ['dragon', 14]];
const SPECIALS = [['dumpling', 40], ['cookie', 42], ['box', 18]];
const pick = (r, list) => {
  let n = r() * list.reduce((a, x) => a + x[1], 0);
  for (const [k, w] of list) if ((n -= w) < 0) return k;
  return list[0][0];
};

// Where moving obstacles are when the waiter is at pd: a cart rolls toward him
// at CART_V and is at its meeting point when he gets there; a trolley crosses
// the lanes and is in the middle lane when he gets there.
export function cartAt(o, pd) {
  const c = o.roll.meet + C.CART_V * (o.roll.meet - pd) / o.roll.v;
  return [c - SIZE.ca.D / 2, c + SIZE.ca.D / 2];
}
export function trolleyX(o, pd) {
  const x = o.cross.dir * C.CROSS_V * (pd - o.cross.meet) / o.cross.v, max = C.LANE_W * 1.7;
  return Math.max(-max, Math.min(max, x));
}

// script (for tests): only these patterns, from startAt, then nothing more.
export function createWorld(seed, { tutorial = false, script = null, startAt = 26 } = {}) {
  const r = rng(seed);
  let id = 1, genD = startAt, streak = 0, tut = tutorial ? 0 : -1, lastPower = -999;
  const w = { obs: [], coins: [], items: [], zones: [], reserved: [], tutorialEnd: tutorial ? Infinity : 0 };

  // ---- zones: the restaurant first (dining, then a different room each
  // time, 230 to 320 m each); from ASIA_AT the countries of Asia, each once
  // in a shuffled order before any comes back, 480 to 640 m each
  let tour = [];
  const addZone = () => {
    const last = w.zones[w.zones.length - 1];
    const d0 = last ? last.d1 : -80;
    let k = 'dining', len = 300;
    if (d0 >= ASIA_AT) {
      if (!tour.length) {
        tour = [...COUNTRIES];
        for (let i = tour.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [tour[i], tour[j]] = [tour[j], tour[i]]; }
        if (tour[0] === last.k) tour.push(tour.shift());
      }
      k = tour.shift(); len = 480 + Math.floor(r() * 160);
    } else if (last) {
      do { k = ZONES[Math.floor(r() * ZONES.length)]; } while (k === last.k);
      len = 230 + Math.floor(r() * 90);
    }
    // whole floor tiles of 8 m, so a doorway sits where the floor changes
    w.zones.push({ k, d0, d1: d0 + 8 * Math.round(len / 8), i: w.zones.length });
  };
  addZone();
  w.zoneAt = d => {
    while (w.zones[w.zones.length - 1].d1 < d + C.AHEAD + 60) addZone();
    for (let i = w.zones.length - 1; i >= 0; i--) if (w.zones[i].d0 <= d) return w.zones[i];
    return w.zones[0];
  };
  const nextBoundary = d => { w.zoneAt(d); return (w.zones.find(z => z.d1 > d) || {}).d1 ?? Infinity; };

  const reservedAt = (d0, d1) => w.reserved.some(([a, b]) => d1 > a && d0 < b);
  // The dragon's landing strip and a broken tray's escape: no obstacles there.
  w.reserve = (d0, d1) => { w.reserved.push([d0, d1]); w.clear(d0, d1); };
  w.clear = (d0, d1) => { for (const o of w.obs) if (!o.gone && o.d1 > d0 && o.d0 < d1) o.gone = true; };

  const variant = (k, d) => {
    const vs = VARIANTS[w.zoneAt(d).k];
    if (k === 'pl') return vs.pl;
    if (k === 'ca' || k === 'cr') return k === 'ca' ? 'cart' : 'trolley';
    const list = vs[k];
    return list[Math.floor(r() * list.length)];
  };
  const coin = (d, x, y = 0.95) => w.coins.push({ id: id++, d, x, y, taken: false });

  // Puts one pattern at genD; returns its length.
  function place(p, mirror) {
    const start = genD, v = speedAt(start), lane = l => (mirror ? 2 - l : l), at = t => start + t * v;
    for (const it of p.items) {
      const [k, t] = it;
      if (k === 'lo' || k === 'ov' || k === 'ta') {
        const s = SIZE[k], d0 = at(t) - s.D / 2, l = lane(it[2]);
        w.obs.push({ id: id++, k, v: variant(k, d0), lane: l, d0, d1: d0 + s.D, x0: laneX(l) - s.W, x1: laneX(l) + s.W,
          y0: k === 'ov' ? s.Y0 : 0, y1: s.H, stand: k !== 'ov', tut: it[3] || null });
      } else if (k === 'pl') {
        const s = SIZE.pl, l = lane(it[2]), d0 = at(t), d1 = d0 + it[3] * v;
        w.obs.push({ id: id++, k: 'pl', v: variant('pl', d0), lane: l, d0, d1, x0: laneX(l) - s.W, x1: laneX(l) + s.W, y0: 0, y1: s.H, stand: true });
        if (it[4]) w.obs.push({ id: id++, k: 'ramp', v: variant('pl', d0), lane: l, d0: d0 - SIZE.ramp.D, d1: d0, x0: laneX(l) - s.W, x1: laneX(l) + s.W, y0: 0, y1: s.H, stand: true });
      } else if (k === 'ca') {
        // a cart rolls toward the waiter and meets him at t (see cartAt)
        const s = SIZE.ca, l = lane(it[2]), meet = at(t);
        w.obs.push({ id: id++, k: 'ca', v: 'cart', lane: l, d0: meet - s.D / 2, d1: meet + s.D / 2, x0: laneX(l) - s.W, x1: laneX(l) + s.W,
          y0: 0, y1: s.H, stand: false, roll: { meet, v }, warned: false });
      } else if (k === 'cr') {
        const s = SIZE.cr, meet = at(t), d0 = meet - s.D / 2, dir = mirror ? -it[2] : it[2];
        w.obs.push({ id: id++, k: 'cr', v: 'trolley', lane: 1, d0, d1: d0 + s.D, x0: -s.W, x1: s.W, y0: 0, y1: s.H, stand: false,
          cross: { meet, dir, v }, warned: false });
      } else if (k === 'c') {
        for (let i = 0; i < it[3]; i++) coin(at(t) + i * C.COIN_GAP, laneX(lane(it[2])), it[4] ?? 0.95);
      } else if (k === 'arc') {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const tau = (i + 0.5) / n * JUMP_T;
          coin(at(t) + (tau - JUMP_T / 2) * v, laneX(lane(it[2])), jumpY(tau) + 0.95);
        }
      } else if (k === 'cs') {
        const [, , from, to, n] = it, third = Math.max(1, Math.round(n / 3));
        for (let i = 0; i < n; i++) {
          const f = i < third ? 0 : i >= n - third ? 1 : (i - third + 1) / (n - 2 * third + 1);
          coin(at(t) + i * C.COIN_GAP, laneX(lane(from)) + (laneX(lane(to)) - laneX(lane(from))) * f);
        }
      } else if (k === 'pu') {
        // about one power-up every 250 m, never two close together
        if (start - lastPower > 180 && r() < 0.75) {
          lastPower = start;
          w.items.push({ id: id++, k: 'power', p: pick(r, POWERS), d: at(t), x: laneX(lane(it[2])), y: onTop(at(t), lane(it[2])) + 1, taken: false });
        }
      } else if (k === 'sp') {
        if (r() < 0.45) w.items.push({ id: id++, k: 'special', p: pick(r, SPECIALS), d: at(t), x: laneX(lane(it[2])), y: onTop(at(t), lane(it[2])) + 0.9, taken: false });
      }
    }
    if (p.tray) w.trayHint = start;
    return p.T * v;
  }
  // The height of a counter at d in a lane (0 on the floor), for items placed on top.
  function onTop(d, l) {
    const o = w.obs.find(o => o.k === 'pl' && o.lane === l && o.d0 <= d && o.d1 >= d);
    return o ? o.y1 : 0;
  }

  function choose(start) {
    // diff: which patterns may come (all of them from about 1.8 km);
    // late: after that it keeps getting harder, up to about 10 km
    const diff = Math.min(1, start / 1800), late = Math.max(0, Math.min(1, (start - 1800) / 8200));
    const room = nextBoundary(start) - start;
    // a breather after a demanding stretch: longer stretches as the run goes on
    const calm = start < 60 || streak >= 3 + Math.floor(diff * 2) + Math.floor(late * 5);
    const list = PATTERNS.filter(p => p.min <= diff && (!!p.calm === calm || (calm && p.min === 0 && p.calm))
      && (!p.items.some(i => i[0] === 'pl') || room > p.T * speedAt(start) + 12));
    const pool = list.length ? list : PATTERNS.filter(p => p.calm);
    // newer patterns more often, so the challenge keeps changing; later on
    // mostly the hard ones
    const weight = p => p.w * (p.min >= diff - 0.3 ? 1.6 : 1) * (p.min >= 0.5 ? 1 + late * 3 : p.calm ? 1 : 1 - late * 0.7);
    let n = r() * pool.reduce((a, p) => a + weight(p), 0);
    for (const p of pool) if ((n -= weight(p)) < 0) { streak = p.calm ? 0 : streak + 1; return p; }
    streak = 0;
    return pool[0];
  }

  // Builds the route up to d + AHEAD.
  w.ensure = d => {
    w.zoneAt(d);
    while (genD < d + C.AHEAD) {
      let len;
      if (tut >= 0 && tut < TUTORIAL.length) {
        len = place(TUTORIAL[tut++], false);
        if (tut === TUTORIAL.length) { w.tutorialEnd = genD + len; tut = -1; }
      } else {
        const p = choose(genD), v = speedAt(genD);
        if (reservedAt(genD, genD + p.T * v)) {
          // over the dragon's landing strip: only coins
          len = place(PATTERNS.find(x => x.id === 'coins-line'), r() < 0.5);
        } else len = place(p, r() < 0.5);
      }
      genD += len;
    }
  };

  // Drops what lies behind the waiter.
  w.prune = d => {
    const keep = x => (x.d1 ?? x.d) > d - 30;
    if (w.obs.length > 200) w.obs = w.obs.filter(keep);
    if (w.coins.length > 400) w.coins = w.coins.filter(keep);
    if (w.items.length > 40) w.items = w.items.filter(keep);
    w.reserved = w.reserved.filter(([, b]) => b > d - 30);
  };

  w.genD = () => genD;
  if (script) {
    w.spans = [];
    for (const { p, mirror } of script) { const a = genD; genD += place(p, mirror); w.spans.push([a, genD, p.id]); }
    genD = Infinity;
  }
  w.ensure(0);
  return w;
}
