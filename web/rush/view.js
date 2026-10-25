// Chen's Garden Rush: the run in 3D. The view only reads the run (sim.js) and
// draws it; it never changes it. Everything is placed relative to the waiter,
// who stays at z = 0 and runs toward -z, so numbers stay small on long runs.
import * as THREE from '../vendor/three-0.169.0/three.module.min.js';
import { C, SIZE, laneX, outdoors } from './rules.js';
import { cartAt, trolleyX } from './world.js';
import { PAL, makePerson, makeChef, makeDragon, makeTray, makePower, makeSpecial, coinTex, POWER_COLORS, model, toonMat, lookKey } from './models.js';
import * as SC from './scenery.js';
import * as A from './asia.js';

const AHEAD = 125, BEHIND = 16, TILE = 8, COINS = 320;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const hash = (a, b = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function createView(canvas, { labels = {}, brand = "Chen's Garden", lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const maxRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2);
  let ratio = maxRatio;
  renderer.setPixelRatio(ratio);

  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(SC.ZONE_LOOK.dining.fog);
  scene.background = fogCol.clone();
  scene.fog = new THREE.Fog(fogCol.clone(), 38, AHEAD);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
  camera.position.set(0, 3, 6);

  const hemi = new THREE.HemisphereLight('#FFE9C8', '#5A3A28', 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF1D8', 2.1);
  sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 16, bottom: -16, near: 1, far: 50 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sky = SC.skyDome(); sky.visible = false; scene.add(sky);

  // ---------------------------------------------------------------- pools
  const free = new Map();
  const take = (key, make) => {
    const list = free.get(key);
    const o = (list && list.pop()) || make();
    o.userData.pk = key; o.visible = true; o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0);
    scene.add(o);
    return o;
  };
  const give = o => {
    scene.remove(o);
    const k = o.userData.pk;
    if (!free.has(k)) free.set(k, []);
    free.get(k).push(o);
  };

  // ---------------------------------------------------------------- state
  let run = null, w = null, mode = 'menu', time = 0, look = null, trayDesign = 'steel';
  const tiles = new Map(), ents = new Map(), itemEnts = new Map();
  const cam = { x: 0, y: 3, z: 6, lx: 0, ly: 1, lz: -6, shake: 0 };
  let zoneLook = 'dining';

  // ---------------------------------------------------------------- people
  let waiter = null, chef = null, dragon = null, tray = null, magnetRing = null, springGlow = null, stars = null;
  const pose = { flip: 0, wave: 0, dragonOff: 1, dragonLeave: 0, trayBlink: 0, lastLaneX: 0 };
  function setLook(L, design = trayDesign) {
    look = L; trayDesign = design;
    if (waiter) scene.remove(waiter.root);
    waiter = makePerson(L, lookKey(L));
    scene.add(waiter.root);
    if (L.aura) {
      // the avatar's gold glow: a halo ring round the waist and light on the floor
      const a = model('aura', b => {
        b.disc(0.62, 0, 0.03, 0, '#FFD970', { rx: -Math.PI / 2, glow: 'add', seg: 24 });
        b.ring(0.42, 0.025, 0, 0.95, 0, '#FFE9A8', { rx: Math.PI / 2, glow: true, seg: 28 });
        b.ring(0.46, 0.07, 0, 0.95, 0, '#FFD970', { rx: Math.PI / 2, glow: 'add', seg: 28 });
      }, { shadow: false });
      waiter.root.add(a);
    }
    if (tray) scene.remove(tray);
    tray = makeTray(design); tray.visible = false; scene.add(tray);
  }
  chef = makeChef(); scene.add(chef.root);
  dragon = makeDragon(); dragon.root.visible = false; scene.add(dragon.root);
  magnetRing = model('magnetRing', b => { b.ring(0.75, 0.04, 0, 0, 0, POWER_COLORS.magnet, { rx: Math.PI / 2, seg: 32, glow: true }); b.ring(0.8, 0.12, 0, 0, 0, POWER_COLORS.magnet, { rx: Math.PI / 2, seg: 32, glow: 'add' }); }, { shadow: false });
  magnetRing.visible = false; scene.add(magnetRing);
  springGlow = model('springGlow', b => { b.disc(0.45, 0, 0.02, 0, POWER_COLORS.spring, { rx: -Math.PI / 2, seg: 24, glow: 'add' }); b.ring(0.4, 0.03, 0, 0.03, 0, '#BFE8FF', { rx: Math.PI / 2, seg: 24, glow: true }); }, { shadow: false });
  springGlow.visible = false; scene.add(springGlow);
  stars = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = model('star', b => { for (let k = 0; k < 5; k++) b.cone(0.05, 0.14, Math.cos(k * 1.2566) * 0.07, Math.sin(k * 1.2566) * 0.07, 0, PAL.gold, { rz: k * 1.2566 - Math.PI / 2, seg: 4, glow: true }); }, { shadow: false });
    stars.add(s);
  }
  stars.visible = false; scene.add(stars);

  // ---------------------------------------------------------------- coins
  const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 22, 1);
  coinGeo.rotateX(Math.PI / 2);
  const coinSide = toonMat({ color: PAL.gold });
  const coinFace = new THREE.MeshBasicMaterial({ map: coinTex() });
  const coins = new THREE.InstancedMesh(coinGeo, [coinSide, coinFace, coinFace], COINS);
  coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coins.frustumCulled = false; coins.castShadow = true; coins.count = 0;
  scene.add(coins);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

  // ------------------------------------------------------------ particles
  const PN = 500;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('pcolor', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('psize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('palpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 400 } },
    vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float scale;
      varying vec3 vC; varying float vA;
      void main() { vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = psize * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, r)); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(pgeo, pmat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  const _c = new THREE.Color();
  function burst(n, { x = 0, y = 1, d = 0, color = '#FFFFFF', spread = 2, up = 2, size = 0.18, life = 0.6, grav = -6, follow = false, vd = 0 }) {
    _c.set(color);
    for (let i = 0; i < n && parts.length < PN; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      parts.push({ x, y, d, vx: Math.cos(a) * r, vy: up * (0.4 + Math.random() * 0.8), vd: Math.sin(a) * r + vd, t: 0, life: life * (0.6 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.7), r: _c.r, g: _c.g, b: _c.b, grav, follow });
    }
  }

  // ------------------------------------------------------------- the route
  function tileZone(k) { return w.zoneAt(k * TILE + TILE / 2); }
  function buildTile(k) {
    const z = tileZone(k), zone = z.k, list = [];
    const add = (key, make, x = 0, y = 0, dz = 0, ry = 0) => {
      const o = take(key, make);
      o.position.set(x, y, 0); o.rotation.y = ry;
      list.push([o, dz]);
    };
    if (outdoors(zone)) return buildOutdoorTile(k, z);
    add(`floor:${zone}`, () => SC.floorTile(zone));
    add('lanes', () => SC.laneLines());
    add(`walls:${zone}`, () => SC.wallsModel(zone));
    const door = z.d0 === k * TILE && z.i > 0;
    if (door) add(`door:${zone}`, () => SC.doorway(zone, labels[zone] || zone), 0, 0, TILE / 2);
    else for (const s of [-1, 1]) {
      if (hash(k, s) > 0.72) continue;
      const opts = SC.ZONE_DECOR[zone], [kind, x] = opts[Math.floor(hash(k, s + 5) * opts.length)];
      add(`dec:${kind}:${s}`, () => SC.decorModel(kind, s), s * x, 0, (hash(k, s + 9) - 0.5) * 2.5);
    }
    if ((zone === 'dining' || zone === 'takeaway') && k % 2 === 0) add('lanterns', () => SC.lanternRow());
    if (zone === 'storage' && k % 2 === 0) add('bulbs', () => SC.bulbRow());
    if (zone !== 'garden' && !door && k % 6 === 3) {
      add('sign:brand', () => SC.wallSign(brand, -1, { pw: 3.2, ph: 0.8 }), -6.27, 3.0, 0);
      add('sign:fu', () => { const m = SC.fuSign(); m.rotation.y = 0; const g = new THREE.Group(); m.rotation.set(0, -Math.PI / 2, 0); g.add(m); return g; }, 6.27, 3.0, 0);
    }
    return { list, zone };
  }
  // outside, in Asia: the path, land or water, scenery near and far, the gate
  function buildOutdoorTile(k, z) {
    const zone = z.k, list = [];
    const add = (key, make, x = 0, y = 0, dz = 0, ry = 0) => {
      const o = take(key, make);
      o.position.set(x, y, 0); o.rotation.y = ry;
      list.push([o, dz]);
    };
    add(`ground:${zone}`, () => A.groundTile(zone));
    add('lanes', () => SC.laneLines());
    const door = z.d0 === k * TILE;
    if (door) add(`gate:${zone}`, () => A.gate(zone, labels[zone] || zone), 0, 0, TILE / 2);
    const dec = A.ASIA_DECOR[zone];
    for (const s of [-1, 1]) {
      if (!door && hash(k, s) < 0.8) {
        const [kind, x] = dec.near[Math.floor(hash(k, s + 5) * dec.near.length)];
        add(`adec:${zone}:${kind}:${s}`, () => A.decorModel(kind, s, zone), s * (x + hash(k, s + 7) * 0.8), A.sunk(kind), (hash(k, s + 9) - 0.5) * 3);
      }
      if (hash(k, s + 20) < 0.6) {
        const [kind, x] = dec.far[Math.floor(hash(k, s + 25) * dec.far.length)];
        add(`adec:${zone}:${kind}:${s}`, () => A.decorModel(kind, s, zone), s * (x + hash(k, s + 27) * 4), A.sunk(kind), (hash(k, s + 29) - 0.5) * 4);
      }
    }
    return { list, zone };
  }
  function updateTiles(pd, back = BEHIND) {
    const k0 = Math.floor((pd - back) / TILE), k1 = Math.floor((pd + AHEAD) / TILE);
    for (const [k, t] of tiles) if (k < k0 || k > k1) { for (const [o] of t.list) give(o); tiles.delete(k); }
    for (let k = k0; k <= k1; k++) {
      if (!tiles.has(k)) tiles.set(k, buildTile(k));
      const zc = -(k * TILE + TILE / 2 - pd);
      for (const [o, dz] of tiles.get(k).list) o.position.z = zc + dz;
    }
  }

  // obstacles: a model per variant (platforms per length), placed each frame
  function obstacleObj(o) {
    if (o.k === 'pl') {
      const L = Math.round((o.d1 - o.d0) * 2) / 2;
      const ob = take(`pl:${o.v}:${L}`, () => (A.hasPlatform(o.v) ? A.platformModel(o.v, o.d1 - o.d0) : SC.platformModel(o.v, o.d1 - o.d0)));
      ob.scale.z = (o.d1 - o.d0) / L;
      return ob;
    }
    if (o.k === 'ramp') return take(`ramp:${o.v}`, () => SC.rampModel(o.v));
    if (o.k === 'ca') return take('ob:cart', () => SC.obstacleModel('cart'));
    if (o.k === 'cr') return take('ob:trolley', () => SC.obstacleModel('trolley'));
    const shape = v => (A.hasObstacle(v) ? A.obstacleModel(v) : SC.obstacleModel(v));
    if (o.k === 'ov') {
      // hanging from a rail across the hall, or outside from a frame of posts
      const out = outdoors(w.zoneAt(o.d0).k);
      return take(`ov:${o.v}:${o.lane}:${out}`, () => {
        const g = new THREE.Group(), r = out ? A.outRail() : SC.overRail();
        g.add(shape(o.v)); r.position.x = -laneX(o.lane); g.add(r);
        return g;
      });
    }
    return take(`ob:${o.v}`, () => shape(o.v));
  }
  function updateObstacles(pd, dt) {
    const seen = new Set();
    for (const o of w.obs) {
      if (o.d1 < pd - BEHIND || o.d0 > pd + AHEAD) continue;
      let e = ents.get(o.id);
      if (o.gone && (!e || e.goneT > 0.35)) continue;
      seen.add(o.id);
      if (!e) {
        e = { obj: obstacleObj(o), goneT: 0, hitT: o.hit ? 1 : 0 };
        ents.set(o.id, e);
      }
      const ob = e.obj;
      let dc = (o.d0 + o.d1) / 2, x = laneX(o.lane);
      if (o.k === 'ca') { const [a, b] = cartAt(o, pd); dc = (a + b) / 2; ob.rotation.z = Math.sin(time * 16 + o.id) * 0.015; }
      if (o.k === 'cr') { x = trolleyX(o, pd); ob.rotation.y = Math.sin(time * 9 + o.id) * 0.03; }
      if (o.k === 'ov') x = laneX(o.lane);
      ob.position.set(x, 0, -(dc - pd));
      if (o.hit && e.hitT < 1) { e.hitT = Math.min(1, e.hitT + dt * 1.6); ob.rotation.z = Math.sin(e.hitT * 30) * 0.08 * (1 - e.hitT); }
      if (o.gone) {
        if (e.goneT === 0) burst(14, { x, y: 0.8, d: dc, color: '#FFF4DA', spread: 3, up: 3, size: 0.35, life: 0.6 });
        e.goneT += dt;
        const s = Math.max(0.001, 1 - e.goneT / 0.35);
        ob.scale.set(s, s, s); ob.position.y = (1 - s) * 1.2;
      }
    }
    for (const [id, e] of ents) if (!seen.has(id)) { give(e.obj); ents.delete(id); }
  }

  function updateCoins(pd, p) {
    let n = 0;
    const spin = time * 4;
    for (const c of w.coins) {
      if (c.taken || c.d < pd - 6 || c.d > pd + AHEAD - 10) continue;
      if (n >= COINS) break;
      let x = c.x, y = c.y + Math.sin(time * 3 + c.d) * 0.05, d = c.d;
      if (c.pull != null) {
        const f = ease(c.pull / 0.2);
        x = c.px + (p.x - c.px) * f; y = c.py + (p.y + 1.0 - c.py) * f; d = c.pd + (p.d - c.pd) * f;
      }
      _q.setFromEuler(_e.set(0, spin + c.d * 0.35, 0));
      _m.compose(_p.set(x, y, -(d - pd)), _q, _s);
      coins.setMatrixAt(n++, _m);
    }
    coins.count = n;
    coins.instanceMatrix.needsUpdate = true;
  }

  function updateItems(pd) {
    const seen = new Set();
    for (const it of w.items) {
      if (it.taken || it.d < pd - 6 || it.d > pd + AHEAD - 10) continue;
      seen.add(it.id);
      let e = itemEnts.get(it.id);
      if (!e) {
        const key = it.k === 'power' ? `pw:${it.p}` : `sp:${it.p}`;
        e = take(key, () => {
          const g = new THREE.Group();
          g.add(it.k === 'power' ? makePower(it.p) : makeSpecial(it.p));
          g.add(model(`halo:${it.k === 'power' ? it.p : 'sp'}`, b => b.ball(0.62, 0, 0, 0, it.k === 'power' ? POWER_COLORS[it.p] : '#FFE7A8', { glow: 'add', seg: 16 }), { shadow: false }));
          return g;
        });
        itemEnts.set(it.id, e);
      }
      e.position.set(it.x, it.y + Math.sin(time * 3 + it.id) * 0.1, -(it.d - pd));
      e.children[0].rotation.y = time * 2.2;
      const s = 0.85 + Math.sin(time * 5 + it.id) * 0.08; e.children[1].scale.setScalar(s);
    }
    for (const [id, e] of itemEnts) if (!seen.has(id)) { give(e); itemEnts.delete(id); }
  }

  function updateParticles(dt, pd, p) {
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.t += dt;
      if (q.t >= q.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.d += q.vd * dt;
      if (q.y < 0.02) { q.y = 0.02; q.vy *= -0.3; }
    }
    for (const q of parts) {
      const base = q.follow ? p : null;
      pPos[n * 3] = q.x + (base ? base.x : 0);
      pPos[n * 3 + 1] = q.y + (base ? base.y : 0);
      pPos[n * 3 + 2] = -(q.d + (base ? base.d : 0) - pd);
      pCol[n * 3] = q.r; pCol[n * 3 + 1] = q.g; pCol[n * 3 + 2] = q.b;
      pSize[n] = q.size;
      pAlpha[n] = 1 - q.t / q.life;
      n++;
    }
    pgeo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'psize', 'palpha']) pgeo.attributes[k].needsUpdate = true;
  }

  // ---------------------------------------------------------- the lighting
  const target = { fog: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), light: new THREE.Color() };
  let skyFor = null;
  function updateZoneLight(zone, dt, instant = false) {
    const L = SC.ZONE_LOOK[zone] || A.ASIA_LOOK[zone];
    target.fog.set(L.fog); target.sky.set(L.sky); target.ground.set(L.ground); target.light.set(L.light);
    const f = instant ? 1 : 1 - Math.exp(-dt * 1.5);
    scene.fog.color.lerp(target.fog, f); scene.background.lerp(target.fog, f);
    hemi.color.lerp(target.sky, f); hemi.groundColor.lerp(target.ground, f); sun.color.lerp(target.light, f);
    sky.visible = zone === 'garden' || outdoors(zone);
    if (sky.visible && skyFor !== zone) {
      skyFor = zone;
      if (zone === 'garden') sky.userData.setColors(); else sky.userData.setColors(L.top, L.mid, L.fog);
    }
    zoneLook = zone;
  }

  // the country's landmark on the horizon: seen from its gate on, drawing a
  // little closer while you run through the country
  const lands = {};
  let landOn = null;
  function updateBackdrop(pd) {
    const here = w.zoneAt(pd), ahead = w.zoneAt(pd + 90);
    const z = outdoors(ahead.k) && ahead !== here ? ahead : outdoors(here.k) ? here : null;
    const k = z ? z.k : null;
    if (landOn !== k) {
      if (landOn) lands[landOn].visible = false;
      if (k) { if (!lands[k]) { lands[k] = A.landmark(k); scene.add(lands[k]); } lands[k].visible = true; }
      landOn = k;
    }
    if (k) lands[k].position.set(0, 0, -340 + clamp((pd - z.d0) / (z.d1 - z.d0), 0, 1) * 60);
  }

  function hideBackdrop() { if (landOn) { lands[landOn].visible = false; landOn = null; } }

  // ------------------------------------------------------------ animation
  // Joint angles for each pose; the body eases from one pose to the next.
  const J = ['hipsY', 'hipsRx', 'torsoRx', 'torsoRy', 'torsoRz', 'headRx', 'headRy', 'armLx', 'armLz', 'armRx', 'armRz', 'foreL', 'foreR', 'foreRz',
    'legLx', 'legLz', 'legRx', 'legRz', 'shinL', 'shinR', 'rootRy', 'rootY'];
  const rest = () => ({ hipsY: 0.78, hipsRx: 0, torsoRx: 0, torsoRy: 0, torsoRz: 0, headRx: 0, headRy: 0, armLx: 0, armLz: -0.1, armRx: 0, armRz: 0.1,
    foreL: 0.15, foreR: 0.15, foreRz: 0, legLx: 0, legLz: 0, legRx: 0, legRz: 0, shinL: 0, shinR: 0, rootRy: 0, rootY: 0 });
  const cur = new WeakMap();
  function apply(P, T, dt, rate = 16) {
    let c = cur.get(P);
    if (!c) { c = { ...T }; cur.set(P, c); }
    for (const k of J) c[k] = rate === Infinity ? T[k] : damp(c[k], T[k], rate, dt);
    const j = P.j;
    j.hips.position.y = c.hipsY; j.hips.rotation.x = c.hipsRx;
    j.torso.rotation.set(c.torsoRx, c.torsoRy, c.torsoRz);
    j.head.rotation.set(c.headRx, c.headRy, 0);
    j.armL.rotation.set(c.armLx, 0, c.armLz); j.armR.rotation.set(c.armRx, 0, c.armRz);
    j.foreL.rotation.x = c.foreL; j.foreR.rotation.set(c.foreR, 0, c.foreRz);
    j.legL.rotation.set(c.legLx, 0, c.legLz); j.legR.rotation.set(c.legRx, 0, c.legRz);
    j.shinL.rotation.x = c.shinL; j.shinR.rotation.x = c.shinR;
    P.root.rotation.y = c.rootRy;
  }
  function running(T, ph, big = 1) {
    const s = Math.sin(ph), c = Math.cos(ph);
    T.legLx = s * 0.85 * big; T.legRx = -s * 0.85 * big;
    T.shinL = -(0.2 + Math.max(0, c) * 1.3); T.shinR = -(0.2 + Math.max(0, -c) * 1.3);
    T.armLx = -s * 0.8; T.armRx = s * 0.8; T.foreL = T.foreR = 1.25;
    T.armLz = -0.12; T.armRz = 0.12;
    T.hipsY = 0.75 + Math.abs(c) * 0.06; T.torsoRx = -0.2; T.torsoRy = s * 0.12; T.headRx = 0.1;
    return T;
  }

  function waiterPose(p, dt) {
    const T = rest(), st = run.state;
    const ph = p.d / 1.85 * Math.PI;
    let rate = 18;
    waiter.root.position.set(p.x, p.y, 0);
    waiter.j.hips.rotation.z = 0;
    const lean = (laneX(p.lane) - p.x) / C.LANE_W;
    if (st !== 'run') return caughtPose(p, dt);
    if (p.fly) {
      // riding the Golden Dragon
      Object.assign(T, { hipsY: 0.5, legLx: 1.2, legRx: 1.2, legLz: -0.55, legRz: 0.55, shinL: -1.3, shinR: -1.3, torsoRx: -0.25, armLx: 1.1, armRx: 1.1, foreL: 0.5, foreR: 0.5, headRx: 0.15 });
      if (Math.sin(time * 1.3) > 0.6) { T.armRx = 2.9; T.armRz = 0.4; T.foreR = 0.2; }
      T.torsoRz = lean * 0.3;
    } else if (run.tray > 0 && p.ground && p.slide <= 0) {
      // surfing on the serving tray
      Object.assign(T, { rootRy: -1.1, hipsY: 0.64, legLx: 0.55, legRx: 0.55, legLz: -0.14, legRz: 0.14, shinL: -0.95, shinR: -0.95, torsoRx: -0.2,
        armLz: -1.2, armRz: 1.2, foreL: 0.3, foreR: 0.3, headRy: 1.0 });
      T.torsoRz = lean * 0.35 + Math.sin(time * 3) * 0.04;
      waiter.root.position.y = p.y + 0.12 + Math.sin(time * 6) * 0.025;
    } else if (p.slide > 0) {
      Object.assign(T, { hipsY: 0.3, legLx: 1.45, legRx: 1.35, shinL: -0.1, shinR: -0.25, torsoRx: 1.0, armLx: -0.6, armLz: -0.6, armRx: 1.0, armRz: 0.3, foreL: 0.2, foreR: 0.6, headRx: -0.7 });
      rate = 26;
    } else if (!p.ground) {
      if (p.roll) {
        Object.assign(T, { legLx: 1.6, legRx: 1.6, shinL: -2.2, shinR: -2.2, torsoRx: -0.6, armLx: 1.2, armRx: 1.2, foreL: 1.6, foreR: 1.6, hipsY: 0.65 });
        pose.flip -= dt * 14;
      } else {
        const up = p.vy > 0;
        Object.assign(T, { legLx: up ? 1.0 : 0.6, shinL: up ? -1.5 : -0.8, legRx: up ? -0.25 : 0.2, shinR: up ? -0.7 : -0.4, armLx: 2.3, armRx: 1.4, armLz: -0.5, armRz: 0.6, foreL: 0.4, foreR: 0.9, torsoRx: -0.1, hipsY: 0.76 });
        if (p.spring) pose.flip = Math.min(0, pose.flip) - dt * 7.2;
      }
      rate = 14;
    } else {
      running(T, ph);
      if (p.stumble > 0) {
        T.torsoRz = Math.sin(time * 22) * 0.25; T.armLz = -1.3 + Math.sin(time * 18) * 0.5; T.armRz = 1.3 - Math.sin(time * 18) * 0.5; T.headRy = 0.7;
      }
      T.torsoRz += lean * 0.25;
    }
    if (p.ground && !p.fly) pose.flip = 0;
    waiter.j.hips.rotation.x = pose.flip;
    apply(waiter, T, dt, rate);
    waiter.j.hips.rotation.x = pose.flip + 0;
  }

  // Caught: a bump, a moment sitting dazed, then the chef lifts the waiter
  // by the collar while his legs keep running in the air.
  function caughtPose(p, dt) {
    const t = run.caughtT, T = rest();
    const crash = run.caughtBy && t < 0.5;
    if (t < 0.45) {
      Object.assign(T, { torsoRx: 0.5, armLx: 2.4, armRx: 2.4, armLz: -0.8, armRz: 0.8, legLx: -0.3, legRx: 0.4, headRx: 0.3, hipsY: 0.74 });
      waiter.root.position.set(p.x, p.y, ease(t / 0.45) * (crash ? 0.8 : 0.3));
    } else if (t < 1.0) {
      Object.assign(T, { hipsY: 0.22, legLx: 1.4, legRx: 1.5, legLz: -0.25, legRz: 0.25, shinL: -0.2, shinR: -0.4, torsoRx: 0.35, armLx: -0.4, armRx: -0.4, armLz: -0.6, armRz: 0.6, headRy: Math.sin(time * 7) * 0.3 });
      waiter.root.position.set(p.x, p.y, 0.8);
    } else {
      const k = ease((t - 1.0) / 0.35);
      running(T, time * 26, 1.2);
      Object.assign(T, { armLx: 1.6, armRx: 1.6, armLz: -0.9, armRz: 0.9, foreL: 1.4, foreR: 1.4, torsoRx: 0.1, headRx: -0.2 });
      waiter.root.position.set(p.x, p.y + k * 0.55 + Math.sin(time * 9) * 0.04, 0.8);
      T.headRx = 0.15; T.headRy = Math.sin(time * 3) * 0.2;
    }
    stars.visible = t > 0.2 && t < 1.6;
    pose.flip = 0; waiter.j.hips.rotation.x = 0;
    apply(waiter, T, dt, 14);
  }

  function chefPose(p, dt, st) {
    const T = rest(); T.hipsY = 0.86;
    if (st === 'caught' || st === 'over') {
      const t = run.caughtT;
      if (t < 1.0) {
        running(T, time * 14, 1.1); T.hipsY = 0.86; T.armRx = 2.6 + Math.sin(time * 16) * 0.3; T.foreR = 0.6;
        chef.root.position.set(damp(chef.root.position.x, p.x + 0.4, 5, dt), p.y, damp(chef.root.position.z, 1.75, 4, dt));
      } else {
        // holding the waiter up by the collar, wagging a finger
        Object.assign(T, { armRx: 2.7, armRz: -0.25, foreR: 0.35, armLx: 1.3, armLz: -0.3, foreL: 1.9, foreRz: 0, headRx: 0.15, torsoRx: 0.1 });
        T.foreL = 1.6 + Math.sin(time * 14) * 0.35;
        chef.root.position.set(damp(chef.root.position.x, p.x + 0.15, 6, dt), p.y, damp(chef.root.position.z, 1.45, 6, dt));
      }
      chef.root.rotation.y = 0;
      chef.root.visible = true;
      apply(chef, T, dt, 14);
      return;
    }
    // close behind after a stumble; falling back, he drops out at the side
    const k = run.chase;
    chef.root.visible = k > 0.25;
    if (!chef.root.visible) return;
    running(T, p.d / 2.1 * Math.PI, 1.1); T.hipsY = 0.86 + (T.hipsY - 0.78);
    T.armRx = 2.5 + Math.sin(time * 15) * 0.35; T.foreR = 0.5;
    // close behind the waiter, a little to the side toward the middle
    const cz = 1.35 + (1 - k) * 2.6, side = p.x > 0.5 ? -1 : 1;
    chef.root.position.set(damp(chef.root.position.x, p.x + side * (1.05 + (1 - k) * 4.5), 4, dt), 0, cz);
    apply(chef, T, dt, 16);
  }

  function dragonPose(p, dt) {
    const fly = run && run.p.fly;
    if (fly) { pose.dragonLeave = 0; pose.dragonOff = damp(pose.dragonOff, 0, 4, dt); }
    else if (dragon.root.visible) pose.dragonLeave += dt;
    if (!fly && pose.dragonLeave > 1.3) { dragon.root.visible = false; pose.dragonOff = 1; return; }
    if (!fly && !dragon.root.visible) return;
    dragon.root.visible = true;
    const lx = p.x, ly = (fly ? p.y : C.DRAGON_Y * 0.4) - 0.5 - pose.dragonOff * 4 + pose.dragonLeave * pose.dragonLeave * 4;
    const lz = -pose.dragonLeave * pose.dragonLeave * 18;
    let px = lx, py = ly, pz = lz - 1.25;
    for (let i = 0; i < dragon.segs.length; i++) {
      const s = dragon.segs[i];
      const x = lx + Math.sin(time * 4 - i * 0.6) * 0.22 * (i / 10), y = ly + Math.sin(time * 3 - i * 0.55) * 0.18, z = lz - 1.25 + i * 0.5;
      s.position.set(x, y, z);
      if (i > 0) s.lookAt(px, py, pz), s.rotateY(Math.PI);
      else s.rotation.set(Math.sin(time * 2) * 0.1, 0, 0);
      px = x; py = y; pz = z;
    }
  }

  // ---------------------------------------------------------------- camera
  let fovFor = 70;
  function resize() {
    const wd = canvas.clientWidth || window.innerWidth, ht = canvas.clientHeight || window.innerHeight;
    renderer.setSize(wd, ht, false);
    const a = wd / ht;
    // portrait: show the waiter's lane and most of the next one near him,
    // all three a little further ahead; landscape: a comfortable view
    const tanH = 2.75 / 6.0, tanV = clamp(tanH / a, Math.tan(THREE.MathUtils.degToRad(29)), Math.tan(THREE.MathUtils.degToRad(35)));
    fovFor = THREE.MathUtils.radToDeg(Math.atan(tanV)) * 2;
    camera.fov = fovFor; camera.aspect = a; camera.updateProjectionMatrix();
    pmat.uniforms.scale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  function runCamera(p, dt) {
    const st = run.state;
    let tx, ty, tz, lx, ly, lz, rate = 7;
    if (st === 'caught' || st === 'over') {
      const k = ease((run.caughtT - 0.5) / 0.8);
      tx = p.x + 3.4 * k; ty = p.y + 3.0 - 0.9 * k; tz = 5.6 - 8.6 * k;
      lx = p.x; ly = p.y + 1.1; lz = 0.8 * k - 4 * (1 - k);
      rate = 3.2;
    } else {
      const fly = p.fly ? 1 : 0;
      tx = p.x * 0.72; ty = 3.35 + Math.max(0, p.y) * (fly ? 0.9 : 0.55) - (p.slide > 0 ? 0.25 : 0); tz = 5.6 + fly * 1.2;
      lx = p.x * 0.85; ly = 0.35 + p.y * 0.75; lz = -5;
    }
    cam.x = damp(cam.x, tx, rate * 1.6, dt); cam.y = damp(cam.y, ty, rate * 0.9, dt); cam.z = damp(cam.z, tz, rate, dt);
    cam.lx = damp(cam.lx, lx, rate * 1.8, dt); cam.ly = damp(cam.ly, ly, rate, dt); cam.lz = damp(cam.lz, lz, rate, dt);
    let sx = 0, sy = 0;
    if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt); const a = cam.shake * 0.25 * shakeAmount; sx = Math.sin(time * 71) * a; sy = Math.cos(time * 57) * a; }
    camera.position.set(cam.x + sx, cam.y + sy, cam.z);
    camera.lookAt(cam.lx, cam.ly, cam.lz);
  }
  let shakeAmount = 1;

  function followLights(px) {
    sun.position.set(px + 5, 13, -6);
    sun.target.position.set(px, 0, -8);
  }

  // ----------------------------------------------------------- the frame
  function frameRun(dt) {
    const p = run.p, pd = p.d;
    const zone = w.zoneAt(pd).k;
    updateZoneLight(zone, dt);
    updateTiles(pd);
    updateBackdrop(pd);
    updateObstacles(pd, dt);
    updateCoins(pd, p);
    updateItems(pd);
    waiterPose(p, dt);
    chefPose(p, dt, run.state);
    dragonPose(p, dt);
    // tray, power-up glows, dizzy stars
    const onTray = run.tray > 0 && !p.fly;
    tray.visible = onTray && (run.tray > 3 || Math.sin(time * 26) > -0.2);
    if (onTray) {
      tray.scale.setScalar(1);
      tray.position.set(p.x, p.y + 0.09 + Math.sin(time * 6) * 0.025, 0);
      tray.rotation.set(0, 0, (laneX(p.lane) - p.x) / C.LANE_W * 0.3);
    }
    magnetRing.visible = run.power.magnet > 0 && (run.power.magnet > 2 || Math.sin(time * 20) > 0);
    if (magnetRing.visible) { magnetRing.position.set(p.x, p.y + 0.9, 0); magnetRing.rotation.set(0.3, time * 3, 0); magnetRing.scale.setScalar(1 + Math.sin(time * 8) * 0.06); }
    springGlow.visible = run.power.spring > 0 && !p.fly && (run.power.spring > 2 || Math.sin(time * 20) > 0);
    if (springGlow.visible) springGlow.position.set(p.x, p.y, 0);
    if (run.state === 'run') stars.visible = p.stumble > 0;
    if (stars.visible) {
      const hz = waiter.root.position.z, hy = waiter.root.position.y + (run.state === 'run' ? 1.95 : 1.15);
      stars.children.forEach((s, i) => { const a = time * 5 + i * Math.PI / 2; s.position.set(waiter.root.position.x + Math.cos(a) * 0.38, hy + Math.sin(time * 9 + i) * 0.05, hz + Math.sin(a) * 0.38); s.rotation.y = time * 4; });
    }
    if (run.state === 'run' && p.slide > 0 && Math.random() < dt * 30) burst(1, { x: p.x + (Math.random() - 0.5) * 0.5, y: 0.1, d: pd + 0.2, color: '#E9DCC6', spread: 0.6, up: 1, size: 0.3, life: 0.45, grav: -1, vd: -p.v * 0.6 });
    if (onTray && Math.random() < dt * 40) burst(1, { x: p.x + (Math.random() - 0.5) * 0.7, y: p.y + 0.05, d: pd + 0.5, color: '#FFE9A8', spread: 0.3, up: 0.5, size: 0.14, life: 0.35, grav: 0, vd: -p.v * 0.8 });
    if (p.fly && Math.random() < dt * 30) burst(1, { x: p.x + (Math.random() - 0.5), y: p.y - 0.6, d: pd + 1.5, color: '#FFD45E', spread: 0.4, up: 0.2, size: 0.25, life: 0.6, grav: 0, vd: -p.v * 0.7 });
    updateParticles(dt, pd, p);
    runCamera(p, dt);
    followLights(p.x);
  }

  // The menu: the waiter at the entrance of the dining room, idle.
  function frameMenu(dt) {
    const p = { x: 0, y: 0, d: 0 };
    if (w) { updateZoneLight('dining', dt, true); updateTiles(0, 60); hideBackdrop(); }
    for (const [id, e] of ents) { give(e.obj); ents.delete(id); }
    for (const [id, e] of itemEnts) { give(e); itemEnts.delete(id); }
    coins.count = 0;
    const T = rest();
    T.hipsY = 0.78 + Math.sin(time * 2) * 0.008;
    T.headRy = Math.sin(time * 0.6) * 0.35; T.headRx = Math.sin(time * 0.9) * 0.06;
    const cyc = time % 7;
    if (cyc > 4.6 && cyc < 6.4) { T.armRx = 0.1; T.armRz = 2.7; T.foreR = 0.2; T.foreRz = Math.sin(time * 11) * 0.45; T.headRy = 0.1; }
    T.armLz = -0.12; T.foreL = 0.25;
    waiter.root.position.set(0, 0, 0);
    waiter.root.rotation.y = 0;
    waiter.j.hips.rotation.x = 0;
    apply(waiter, T, dt, 8);
    // the tray leaning against the waiter's leg, to show the chosen design
    tray.visible = true;
    tray.position.set(1.2, 0.36, 0.45); tray.rotation.set(Math.PI / 2 - 0.3, -0.6, 0.15); tray.scale.setScalar(0.5);
    chef.root.visible = false; dragon.root.visible = false; magnetRing.visible = false; springGlow.visible = false; stars.visible = false;
    const a = Math.sin(time * 0.25) * 0.18;
    camera.position.set(Math.sin(a) * 3.9 - 0.4, 1.3, -Math.cos(a) * 3.9);
    camera.lookAt(0.1, 1.0, 0);
    updateParticles(dt, 0, p);
    followLights(0);
  }

  // The intro: the waiter carries a stack of takeaway boxes, trips, the boxes
  // land on the chef, and the chase begins. t from 0 to INTRO.
  const INTRO = 4.2;
  const boxes = [];
  function frameIntro(dt, t) {
    updateZoneLight('dining', dt, true); updateTiles(0, 60); hideBackdrop();
    for (const [id, e] of ents) { give(e.obj); ents.delete(id); }
    coins.count = 0;
    if (!boxes.length) for (let i = 0; i < 4; i++) { const b = model('introBox', bb => { bb.cyl(0.2, 0.26, 0, 0, 0, PAL.paper, { seg: 4, top: 1.3, ry: Math.PI / 4 }); bb.box(0.38, 0.05, 0.38, 0, 0.15, 0, PAL.red); }); scene.add(b); boxes.push(b); }
    const W = rest(), H = rest(); H.hipsY = 0.86;
    tray.visible = false; dragon.root.visible = false; magnetRing.visible = false; springGlow.visible = false;
    chef.root.visible = true;
    // chef at a prep table behind, facing away; the waiter walks in from ahead
    let wz, wx = 0.3;
    if (t < 1.1) {
      wz = -3.2 + t * 1.6;
      running(W, t * 9, 0.45); Object.assign(W, { armLx: 1.3, armRx: 1.3, foreL: 0.4, foreR: 0.4, armLz: 0.15, armRz: -0.15, torsoRx: 0.08, hipsY: 0.77 });
      W.rootRy = Math.PI;
    } else if (t < 1.7) {
      const k = (t - 1.1) / 0.6;
      wz = -3.2 + 1.1 * 1.6 + k * 0.5;
      Object.assign(W, { torsoRx: -0.5 * Math.sin(k * Math.PI), armLx: 2.6, armRx: 2.6, armLz: -0.6, armRz: 0.6, legLx: 0.7, shinL: -0.4, legRx: -0.4, rootRy: Math.PI });
    } else if (t < 2.6) {
      wz = -1.04 + 0.5;
      Object.assign(W, { armLx: 0.4, armRx: 0.4, armLz: -0.9, armRz: 0.9, foreL: 1.2, foreR: 1.2, headRy: Math.sin(t * 6) * 0.3, rootRy: Math.PI, hipsY: 0.76 });
    } else {
      const k = ease((t - 2.6) / 0.5);
      wz = -0.54 - (t - 2.6) * (t - 2.6) * 4;
      running(W, t * 16);
      W.rootRy = Math.PI * (1 - k);
    }
    waiter.root.position.set(wx, 0, wz); waiter.root.rotation.y = 0;
    waiter.j.hips.rotation.x = 0;
    apply(waiter, W, dt, t < 0.05 ? Infinity : 14);
    // the boxes: in his arms, then flying in arcs onto the chef
    boxes.forEach((b, i) => {
      b.visible = true;
      if (t < 1.25) { b.position.set(wx, 1.15 + i * 0.27, wz - 0.35); b.rotation.set(0, i * 0.3, 0); }
      else {
        const k = clamp((t - 1.25) / (0.75 + i * 0.12), 0, 1);
        const sx = wx, sy = 1.15 + i * 0.27, sz = wz - 0.35, ex = -0.1 + (i - 1.5) * 0.45, ey = i === 3 ? 2.4 : 0.13, ez = 2.25 + (i % 2) * 0.4;
        b.position.set(sx + (ex - sx) * k, sy + (ey - sy) * k + Math.sin(k * Math.PI) * (1.6 + i * 0.3), sz + (ez - sz) * k);
        b.rotation.set(k * (3 + i), k * 2, k * (i - 1.5));
        if (k >= 1 && i === 3) { b.position.set(chef.root.position.x, 2.35 + Math.abs(Math.sin(t * 9)) * 0.03, chef.root.position.z); b.rotation.set(0, 0.4, 0.2); }
      }
    });
    if (t >= 2.0 && t - dt < 2.0) burst(18, { x: 0, y: 2.2, d: -2.2, color: '#FFF4DA', spread: 2.5, up: 2, size: 0.3 });
    // the chef: turns round when the boxes land, then gives chase
    if (t < 2.0) {
      Object.assign(H, { armLx: 0.9, armRx: 0.9, foreL: 1.2, foreR: 1.2, headRx: 0.25, torsoRx: -0.1, rootRy: Math.PI });
      H.foreR = 1.2 + Math.sin(t * 14) * 0.3;
      chef.root.position.set(0, 0, 2.3);
    } else if (t < 2.9) {
      const k = ease((t - 2.0) / 0.35);
      Object.assign(H, { rootRy: Math.PI * (1 - k), armRx: 2.6 + Math.sin(t * 18) * 0.3, foreR: 0.5, armLx: 0.3, armLz: -1.0, foreL: 1.4, torsoRz: Math.sin(t * 20) * 0.08 });
      chef.root.position.set(0, 0, 2.3);
    } else {
      running(H, t * 14, 1.1); H.hipsY = 0.86; H.armRx = 2.5 + Math.sin(t * 15) * 0.35;
      chef.root.position.set(0.5, 0, 2.3 - (t - 2.9) * 2.2);
    }
    chef.root.rotation.y = 0;
    apply(chef, H, dt, t < 0.05 ? Infinity : 12);
    // camera: in front of the waiter, then round behind him
    const k = ease((t - 2.7) / 1.4);
    const fx = 2.2, fy = 1.7, fz = -5.2, bx = 0, by = 3.35, bz = 5.6;
    camera.position.set(fx + (bx - fx) * k, fy + (by - fy) * k, fz + (bz - fz) * k);
    const lk = ease((t - 2.9) / 1.2);
    camera.lookAt(0.2 * (1 - lk), 1.2 + (0.35 - 1.2) * lk, 0.4 * (1 - lk) - 5 * lk);
    cam.x = camera.position.x; cam.y = camera.position.y; cam.z = camera.position.z; cam.lx = 0; cam.ly = 0.35; cam.lz = -5;
    updateParticles(dt, 0, { x: 0, y: 0, d: 0 });
    followLights(0);
  }
  function endIntro() { for (const b of boxes) b.visible = false; }

  // ------------------------------------------------------------ the public part
  let fpsT = 0, fpsN = 0;
  const view = {
    INTRO,
    setLook,
    get mode() { return mode; },
    // a fresh run (or null for the menu)
    attach(r) {
      for (const [, t] of tiles) for (const [o] of t.list) give(o);
      tiles.clear();
      for (const [id, e] of ents) { give(e.obj); ents.delete(id); }
      for (const [id, e] of itemEnts) { give(e); itemEnts.delete(id); }
      parts.length = 0; pose.flip = 0; pose.dragonOff = 1; pose.dragonLeave = 0; dragon.root.visible = false;
      run = r; w = r ? r.w : w;
      cam.x = 0; cam.y = 3.35; cam.z = 5.6; cam.lx = 0; cam.ly = 0.35; cam.lz = -5;
      chef.root.position.set(1.05, 0, 1.35);
      if (w) updateZoneLight(w.zoneAt(r ? r.p.d : 0).k, 0, true);
    },
    // a world to stand in on the menu (before any run)
    setWorld(world) { w = world; },
    setMode(m) { if (mode === 'intro' && m !== 'intro') endIntro(); mode = m; },
    setShake(on) { shakeAmount = on ? 1 : 0; },
    // effects for what happened in the run this frame
    events(list) {
      if (!run) return;
      const p = run.p;
      for (const e of list) {
        if (e.type === 'coin') burst(4, { x: e.c.x, y: e.c.y, d: e.c.d, color: '#FFD45E', spread: 1.2, up: 1.6, size: 0.14, life: 0.35, grav: -2 });
        else if (e.type === 'special') burst(16, { x: p.x, y: p.y + 1.2, d: p.d, color: '#FFF0B8', spread: 2, up: 2.5, size: 0.2, life: 0.6, grav: -3 });
        else if (e.type === 'power') burst(26, { x: p.x, y: p.y + 1, d: p.d, color: POWER_COLORS[e.p], spread: 3, up: 3, size: 0.24, life: 0.7, grav: -2 });
        else if (e.type === 'land' && !e.dragon && run.tray <= 0) burst(6, { x: p.x, y: p.y + 0.05, d: p.d, color: '#E9DCC6', spread: 1.4, up: 0.8, size: 0.28, life: 0.4, grav: -1 });
        else if (e.type === 'land' && e.dragon) burst(20, { x: p.x, y: p.y + 0.1, d: p.d, color: '#FFD45E', spread: 3, up: 1.5, size: 0.3, life: 0.6, grav: -1 });
        else if (e.type === 'stumble' || e.type === 'bump') { burst(10, { x: p.x, y: 1, d: p.d - 0.4, color: '#FFFFFF', spread: 2, up: 2, size: 0.3, life: 0.45 }); cam.shake = 0.18; }
        else if (e.type === 'crash' || e.type === 'caught') { burst(18, { x: p.x, y: 1.2, d: p.d - 0.4, color: '#FFFFFF', spread: 3, up: 3, size: 0.35, life: 0.6 }); cam.shake = 0.3; }
        else if (e.type === 'trayOn') burst(22, { x: p.x, y: p.y + 0.3, d: p.d, color: '#FFE9A8', spread: 2.5, up: 2.5, size: 0.22, life: 0.6, grav: -3 });
        else if (e.type === 'trayBreak') { burst(30, { x: p.x, y: p.y + 0.3, d: p.d, color: '#D9E1E7', spread: 4, up: 4, size: 0.2, life: 0.8, grav: -9 }); cam.shake = 0.25; }
        else if (e.type === 'dragonUp') burst(30, { x: p.x, y: 0.5, d: p.d, color: '#FFD45E', spread: 3.5, up: 4, size: 0.3, life: 0.8, grav: -3 });
        else if (e.type === 'jump' && e.spring) burst(10, { x: p.x, y: 0.1, d: p.d, color: '#8FD3FF', spread: 2, up: 1, size: 0.25, life: 0.4, grav: -1 });
      }
    },
    // draws one frame; t is the intro time in intro mode
    frame(dt, t = 0) {
      time += dt;
      if (!waiter) return;
      if (mode === 'run' && run) frameRun(dt);
      else if (mode === 'intro') frameIntro(dt, t);
      else frameMenu(dt);
      renderer.render(scene, camera);
      // a lighter picture when the device struggles
      fpsT += dt; fpsN++;
      if (fpsT > 2.5) {
        const avg = fpsT / fpsN;
        if (avg > 1 / 42 && ratio > 1) { ratio = Math.max(1, ratio - 0.25); renderer.setPixelRatio(ratio); resize(); }
        else if (avg > 1 / 36 && ratio <= 1 && sun.castShadow) { sun.castShadow = false; renderer.shadowMap.enabled = false; }
        else if (avg < 1 / 58 && ratio < maxRatio) { ratio = Math.min(maxRatio, ratio + 0.25); renderer.setPixelRatio(ratio); resize(); }
        fpsT = 0; fpsN = 0;
      }
    },
    resize,
    info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio, shadows: sun.castShadow }; },
    dispose() { renderer.dispose(); renderer.forceContextLoss?.(); },
  };
  resize();
  return view;
}
