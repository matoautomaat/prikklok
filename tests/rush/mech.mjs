// The rules, one by one, on the real simulation.
const R = new URL('../../web/rush/', import.meta.url).href;
const { createRun, newPlayer } = await import(R + 'sim.js');
const { C, speedAt, powerTime, JUMP_T } = await import(R + 'rules.js');
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fails++; };
const DT = C.DT;
// a run on a scripted route
const runOn = (items, opt = {}) => {
  const r = createRun({ seed: 3, ...opt });
  const { createWorld } = globalThis.__w;
  r.w.obs.length = 0; r.w.coins.length = 0; r.w.items.length = 0;
  const w2 = createWorld(1, { script: [{ p: { id: 't', T: 6, items }, mirror: false }], startAt: 20 });
  r.w.obs.push(...w2.obs); r.w.coins.push(...w2.coins); r.w.items.push(...w2.items);
  r.w.ensure = () => {};
  return r;
};
globalThis.__w = await import(R + 'world.js');
const until = (r, cond, max = 20) => { for (let i = 0; i < max / DT && r.state === 'run' && !cond(); i++) r.step(DT); };
const atObstacle = (r, o, lead) => until(r, () => o.d0 - r.p.d < lead);

// lane change: one swipe, one lane, quick
{
  const r = runOn([]);
  r.input('left');
  let t = 0; while (Math.abs(r.p.x + C.LANE_W) > 1e-6) { r.step(DT); t += DT; }
  check('one swipe moves one lane', r.p.lane === 0);
  check('a lane change takes about 0.13 s', t > 0.1 && t < 0.16, t.toFixed(3) + ' s');
  r.input('left'); check('no lane beyond the left one', r.p.lane === 0 && r.ev.some(e => e.type === 'edge'));
}
// jump clears a low obstacle; running into it ends the run
{
  const r = runOn([['lo', 2, 1]]); const o = r.w.obs[0];
  atObstacle(r, o, speedAt(20) * 0.35); r.input('up'); until(r, () => r.p.d > o.d1 + 2);
  check('a jump clears a low crate', r.state === 'run' && r.counts.jumps === 1, `jumps ${r.counts.jumps}`);
  const r2 = runOn([['lo', 2, 1]]); until(r2, () => r2.p.d > r2.w.obs[0].d1 + 2);
  check('running into a crate ends the run', r2.state !== 'run');
  check('jump height and time are consistent', Math.abs(JUMP_T - 0.709) < 0.01);
}
// slide under an overhead barrier; jumping into it ends the run
{
  const r = runOn([['ov', 2, 1]]); const o = r.w.obs[0];
  atObstacle(r, o, speedAt(20) * 0.3); r.input('down'); until(r, () => r.p.d > o.d1 + 2);
  check('a slide passes under a service rack', r.state === 'run' && r.counts.slides === 1);
  const r2 = runOn([['ov', 2, 1]]); atObstacle(r2, r2.w.obs[0], speedAt(20) * 0.3); r2.input('up'); until(r2, () => r2.p.d > r2.w.obs[0].d1 + 2);
  check('jumping into the rack ends the run', r2.state !== 'run');
  const r3 = runOn([]); r3.input('down'); let t = 0; while (r3.p.slide > 0 || t === 0) { r3.step(DT); t += DT; }
  check('a slide ends by itself', Math.abs(t - C.SLIDE_T) < 0.02, t.toFixed(2) + ' s');
}
// combos: jump, change lane in the air, dive onto a safe lane
{
  const r = runOn([['lo', 2, 1], ['ta', 2.6, 1]]); const o = r.w.obs[0];
  atObstacle(r, o, speedAt(20) * 0.35); r.input('up');
  for (let i = 0; i < 0.3 / DT; i++) r.step(DT);
  const air = !r.p.ground; r.input('right'); r.input('down');
  until(r, () => r.p.d > r.w.obs[1].d1 + 2);
  check('jump, lane change in the air and dive', air && r.state === 'run' && r.p.lane === 2, `lane ${r.p.lane}`);
  const r2 = runOn([]); r2.input('up'); for (let i = 0; i < 0.15 / DT; i++) r2.step(DT); r2.input('down');
  let landed = 0; for (let i = 0; i < 1 / DT && !landed; i++) { r2.step(DT); if (r2.p.ground) landed = r2.p.t; }
  check('down in the air: quick descent, then a roll', landed > 0 && landed < 0.3 && r2.p.slide > 0, landed.toFixed(2) + ' s');
  const r3 = runOn([]); r3.input('down'); r3.step(DT); r3.input('up'); for (let i = 0; i < 2; i++) r3.step(DT);
  check('jumping out of a slide', !r3.p.ground && r3.p.slide === 0);
  const r4 = runOn([]); r4.input('down'); r4.step(DT); r4.input('left'); until(r4, () => r4.p.x === -C.LANE_W, 1);
  check('lane change while sliding', r4.p.slide > 0 && r4.p.lane === 0);
}
// a counter: up the ramp, along the top, and down at the end
{
  const r = runOn([['pl', 1.5, 1, 1.5, true], ['c', 1.8, 1, 5, 1.95]]); const o = r.w.obs.find(o => o.k === 'pl');
  until(r, () => r.p.d > o.d0 + 3); const onTop = r.p.y;
  until(r, () => r.p.d > o.d1 + 6);
  check('up the ramp onto the counter, coins on top', Math.abs(onTop - 1.05) < 0.01 && r.coins === 5, `y ${onTop.toFixed(2)}, coins ${r.coins}`);
  check('off the end: back to the floor', r.p.y === 0 && r.p.ground && r.state === 'run');
  const r2 = runOn([['pl', 2, 1, 1.5, false]]); until(r2, () => r2.p.d > r2.w.obs[0].d0 + 2);
  check('a counter front without ramp ends the run', r2.state !== 'run');
}
// stumbles: a sideways clip slows you and brings the chef; a second one ends the run
{
  const r = runOn([['ta', 2, 0], ['ta', 3.5, 0]]); const o = r.w.obs[0];
  until(r, () => r.p.d > o.d0 + 0.6); r.input('left'); for (let i = 0; i < 0.3 / DT; i++) r.step(DT);
  check('a sideways clip is a stumble, not the end', r.state === 'run' && r.counts.stumbles === 1 && r.p.lane === 1 && r.chef > 0);
  until(r, () => r.p.d > r.w.obs[1].d0 + 0.6); r.input('left'); for (let i = 0; i < 0.3 / DT; i++) r.step(DT);
  check('a second stumble while the chef is close ends the run', r.state !== 'run' && r.ev.some(e => e.type === 'caught'));
  const r2 = runOn([['ta', 2, 0], ['ta', 12, 0]]);
  until(r2, () => r2.p.d > r2.w.obs[0].d0 + 0.6); r2.input('left'); until(r2, () => r2.p.d > r2.w.obs[1].d0 + 0.6, 30); r2.input('left'); for (let i = 0; i < 0.3 / DT; i++) r2.step(DT);
  check('after recovering, a stumble is only a stumble again', r2.state === 'run' && r2.counts.stumbles === 2);
}
// the serving tray: one crash forgiven, hazards cleared, then the run goes on
{
  const r = runOn([['ta', 2, 1], ['ta', 2.4, 1]], { trays: 2 });
  r.input('tray'); check('a tray starts its 30 seconds', r.tray === C.TRAY_T && r.trays === 1);
  until(r, () => r.p.d > r.w.obs[0].d1 + 1);
  check('a crash on the tray: tray breaks, run goes on', r.state === 'run' && r.tray === 0 && r.ev.some(e => e.type === 'trayBreak'));
  check('nearby hazards are cleared', r.w.obs[1].gone === true);
  const r2 = runOn([], { trays: 1 }); r2.input('tray'); until(r2, () => r2.tray === 0, 40);
  check('without a crash the tray ends after its time', r2.ev.some(e => e.type === 'trayEnd') && r2.state === 'run');
  r2.input('tray'); check('no tray left: nothing happens', r2.tray === 0 && r2.ev.some(e => e.type === 'trayNo'));
}
// power-ups start at once, run out on time, a second pickup resets the timer
{
  const r = runOn([['pu', 1.2, 1], ['c', 2, 0, 3], ['c', 2, 2, 3]]);
  r.w.items[0].p = 'magnet';
  until(r, () => r.power.magnet > 0, 5);
  check('the Tip Magnet starts on pickup', r.power.magnet === powerTime('magnet'));
  until(r, () => r.coins >= 6, 5);
  check('it pulls in coins from the other lanes', r.coins === 6);
  until(r, () => r.power.magnet === 0, 15);
  check('it ends with a warning first', r.ev.some(e => e.type === 'powerWarn' && e.p === 'magnet') && r.ev.some(e => e.type === 'powerEnd' && e.p === 'magnet'));
  const r2 = runOn([['pu', 1.2, 1]], { levels: { double: 3 } }); r2.w.items[0].p = 'double';
  until(r2, () => r2.power.double > 0, 5);
  check('Double Tips doubles the score, not the coins', r2.mult() === 2 && r2.power.double === powerTime('double', 3));
  const s0 = r2.score, d0 = r2.p.d; r2.step(DT);
  check('score grows twice as fast', Math.abs((r2.score - s0) - 2 * (r2.p.d - d0)) < 1e-9);
  const r3 = runOn([['pu', 1.2, 1], ['lo', 2.2, 1]]); r3.w.items[0].p = 'spring';
  until(r3, () => r3.power.spring > 0, 5); r3.input('up'); r3.step(DT); r3.step(DT); let top = 0; until(r3, () => { top = Math.max(top, r3.p.y); return r3.p.ground; }, 3);
  check('Spring Sneakers jump about 3.4 m', top > 3.3 && top < 3.5, top.toFixed(2) + ' m');
}
// the Golden Dragon: above everything, then down on a clear strip
{
  const r = runOn([['pu', 1.2, 1], ['ta', 3, 0], ['ta', 3, 1], ['ta', 3, 2], ['lo', 4, 1]]); r.w.items[0].p = 'dragon';
  until(r, () => r.power.dragon > 0, 5);
  let high = 0; until(r, () => { high = Math.max(high, r.p.y); return !r.p.fly; }, 15);
  check('the dragon flies over a wall of tall obstacles', r.state === 'run' && high > 5, `top ${high.toFixed(1)} m`);
  const near = r.w.obs.filter(o => !o.gone && o.d0 > r.p.d - 3 && o.d0 < r.p.d + speedAt(r.p.d) * 1.5);
  check('the landing strip is free', near.length === 0, `${near.length} obstacles`);
  check('sky coins were laid out', r.w.coins.some(c => c.sky));
}
// frame rate: the same inputs give the same result at 30 and 144 fps
{
  // like the game loop: each swipe carries its time and is applied on the step it falls in
  const play = fps => {
    const r = createRun({ seed: 99 }); let sim = 0, clock = 0;
    const script = [[2.0, 'left'], [3.1, 'up'], [4.0, 'right'], [5.5, 'down']].map(([t, a]) => ({ t, a }));
    while (clock < 8) {
      clock += 1 / fps;
      while (sim + DT <= clock) {
        for (const s of script) if (!s.done && s.t <= sim) { r.input(s.a); s.done = true; }
        r.step(DT); sim += DT;
      }
    }
    return r.p.d.toFixed(3) + '/' + r.p.lane + '/' + r.coins + '/' + r.state;
  };
  const a = play(30), b = play(144), c = play(60);
  check('the same at 30, 60 and 144 frames a second', a.split('/').slice(1).join() === b.split('/').slice(1).join() && Math.abs(parseFloat(a) - parseFloat(b)) < 0.4, `${a} | ${c} | ${b}`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall rules hold');
process.exit(fails ? 1 : 0);
