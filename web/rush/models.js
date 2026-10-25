// Chen's Garden Rush: everything you see, built in code from simple shapes.
// A model is merged into one mesh with a colour per vertex (one draw call),
// lit with a three-step toon ramp for the cartoon look; glowing parts
// (lanterns, screens, flames) go in a second, unlit mesh.
import * as THREE from '../vendor/three-0.169.0/three.module.min.js';

export const PAL = {
  red: '#A51E26', deepRed: '#6E141A', lacquer: '#8E1B24', gold: '#E2B23C', paleGold: '#F3D68A', brass: '#C9952F',
  wood: '#6B4429', darkWood: '#3D2618', lightWood: '#A87A4F', cream: '#F4EDE1', paper: '#FBF6EA',
  steel: '#BAC3CA', darkSteel: '#6F7A83', white: '#F6F3EC', black: '#252126', ink: '#2E2326',
  green: '#3E8E5E', leaf: '#4FA35E', jade: '#3FA88A', sky: '#7FA9D9', sack: '#D9C49A', crate: '#B27E4A',
  hazard: '#F2B31B', amber: '#FFB02E', tile: '#E9EDEE', grout: '#C7CED2', concrete: '#9A958C',
};

// ---------------------------------------------------------------- materials

let RAMP;
function ramp() {
  if (RAMP) return RAMP;
  const d = new Uint8Array([105, 105, 105, 255, 175, 175, 175, 255, 232, 232, 232, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter;
  RAMP.needsUpdate = true;
  return RAMP;
}
export const MAT = {};
export function materials() {
  if (MAT.vc) return MAT;
  MAT.vc = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp() });
  MAT.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  MAT.glowAdd = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  // far scenery (mountains, monuments): beyond the fog, hazed in its colours instead
  MAT.far = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp(), fog: false });
  MAT.farGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
  return MAT;
}
export const toonMat = (opts) => new THREE.MeshToonMaterial({ gradientMap: ramp(), ...opts });

// --------------------------------------------------------------- the builder

const PRIM = {};
const prim = (key, make) => PRIM[key] || (PRIM[key] = make().toNonIndexed());
const P = {
  box: () => prim('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (seg, top) => prim(`cyl${seg}:${top}`, () => new THREE.CylinderGeometry(top, 1, 1, seg)),
  ball: seg => prim(`ball${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)))),
  cone: seg => prim(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
  ring: (t, seg, arc) => prim(`ring${t}:${seg}:${arc}`, () => new THREE.TorusGeometry(1, t, 6, seg, arc)),
  disc: seg => prim(`disc${seg}`, () => new THREE.CircleGeometry(1, seg)),
};
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _n3 = new THREE.Matrix3();

export class Build {
  constructor() { this.parts = { solid: [], glow: [], add: [] }; }
  put(g, color, x, y, z, sx, sy, sz, o = {}) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e);
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    if (o.m) m.premultiply(o.m);
    this.parts[o.glow === 'add' ? 'add' : o.glow ? 'glow' : 'solid'].push({ g, m, c: new THREE.Color(color) });
    return this;
  }
  box(w, h, d, x, y, z, c, o) { return this.put(P.box(), c, x, y, z, w, h, d, o); }
  cyl(r, h, x, y, z, c, o = {}) { return this.put(P.cyl(o.seg || 16, o.top ?? 1), c, x, y, z, r, h, r * (o.sz ?? 1), o); }
  ball(r, x, y, z, c, o = {}) { return this.put(P.ball(o.seg || 14), c, x, y, z, r * (o.sx ?? 1), r * (o.sy ?? 1), r * (o.sz ?? 1), o); }
  cone(r, h, x, y, z, c, o = {}) { return this.put(P.cone(o.seg || 14), c, x, y, z, r, h, r * (o.sz ?? 1), o); }
  ring(R, t, x, y, z, c, o = {}) { return this.put(P.ring(+(t / R).toFixed(3), o.seg || 20, o.arc ?? Math.PI * 2), c, x, y, z, R, R, R * (o.sz ?? 1), o); }
  disc(r, x, y, z, c, o = {}) { return this.put(P.disc(o.seg || 20), c, x, y, z, r, r, 1, o); }
  // another build, moved (for repeated pieces)
  with(m, fn) { const b = new Build(); fn(b); for (const k in b.parts) for (const p of b.parts[k]) { p.m.premultiply(m); this.parts[k].push(p); } return this; }
  geometries() {
    const out = {};
    for (const k in this.parts) if (this.parts[k].length) out[k] = merge(this.parts[k]);
    return out;
  }
}
function merge(list) {
  let n = 0;
  for (const p of list) n += p.g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, m, c } of list) {
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    _n3.getNormalMatrix(m);
    for (let i = 0; i < pa.length; i += 3) {
      _v.set(pa[i], pa[i + 1], pa[i + 2]).applyMatrix4(m); pos[o] = _v.x; pos[o + 1] = _v.y; pos[o + 2] = _v.z;
      _v.set(na[i], na[i + 1], na[i + 2]).applyMatrix3(_n3).normalize(); nor[o] = _v.x; nor[o + 1] = _v.y; nor[o + 2] = _v.z;
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      o += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// A model from a build function, its geometry made once and shared.
const GEO = new Map();
export function model(key, fn, { shadow = true, far = false } = {}) {
  materials();
  let g = GEO.get(key);
  if (!g) { const b = new Build(); fn(b); g = b.geometries(); GEO.set(key, g); }
  const grp = new THREE.Group();
  if (g.solid) { const m = new THREE.Mesh(g.solid, far ? MAT.far : MAT.vc); m.castShadow = shadow && !far; m.receiveShadow = !far; grp.add(m); }
  if (g.glow) grp.add(new THREE.Mesh(g.glow, far ? MAT.farGlow : MAT.glow));
  if (g.add) grp.add(new THREE.Mesh(g.add, MAT.glowAdd));
  return grp;
}
export const mRot = (rx, ry, rz, x = 0, y = 0, z = 0, s = 1) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(s, s, s));

// ------------------------------------------------------------------ textures

const TEX = new Map();
export function canvasTex(key, w, h, draw, { repeat = null, srgb = true } = {}) {
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}
const FONT = '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif';
// A sign: lettering on a board.
export function signTex(text, { bg = PAL.lacquer, fg = PAL.gold, w = 512, h = 128, border = PAL.gold, font = 64, neon = false } = {}) {
  return canvasTex(`sign:${text}:${bg}:${fg}:${w}:${h}:${neon}`, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40); }
    g.font = `700 ${font}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (neon) { g.shadowColor = fg; g.shadowBlur = 24; }
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 4, w - 60);
  });
}

// ------------------------------------------------------------------- people

const SKIN = { s1: '#FBE3D0', s2: '#F4CDAE', s3: '#EBB892', s4: '#D49A6C', s5: '#B47A4B', s6: '#8A5632', s7: '#5C3920' };
const HAIRC = { black: '#1F1A17', dark: '#3A2A20', brown: '#5E4130', chestnut: '#7B4F32', light: '#A67C56', blonde: '#D8B56F',
  platinum: '#EEDDAE', auburn: '#8A3A20', ginger: '#C2632F', gray: '#A8A8AC', pink: '#E78FB2', blue: '#5A7ED8', lilac: '#B69BE2' };
const CLOTH = { white: '#F3F2EE', black: '#27282D', navy: '#27334F', maroon: '#6F302C', red: '#C8443A', pink: '#F2C3CE', lilac: '#C6B5E2',
  sky: '#B7D0EA', green: '#3F8E69', olive: '#6B7A4E', mustard: '#D6A340', beige: '#E6D8BE', gray: '#A6AAB1', cream: '#EEE5CE', ruby: '#8E1B24',
  brown: '#6A4630', grey: '#8D9096', blue: '#6E8CB3', light: '#BCCFE2', indigo: '#3B4A66' };
const SHOEC = { white: '#F5F4F1', black: '#2A2A2E', chestnut: '#A36A3E', beige: '#D8BC93', pink: '#F2C3CE', sky: '#B7D0EA', gray: '#9EA2A8' };

// The outfits in the shop. 'mine' wears the clothes of the player's own
// Prikklok avatar.
export const OUTFITS = {
  waiter: { shirt: PAL.white, sleeve: PAL.white, vest: '#2A2226', pants: '#2A2226', shoes: '#1E1A1C', tie: PAL.red, towel: true },
  mine: null,
  chef: { shirt: PAL.white, sleeve: PAL.white, pants: '#3C3C40', shoes: '#1E1A1C', buttons: PAL.red, hat: 'toque', scarf: PAL.red },
  delivery: { shirt: '#E9B21E', sleeve: '#E9B21E', stripe: PAL.red, pants: '#33373F', shoes: '#F3F3F3', hat: 'cap', capColor: PAL.red, pack: true },
  host: { shirt: PAL.red, sleeve: PAL.red, trim: PAL.gold, pants: '#1E1A1C', shoes: '#1E1A1C', frogs: true },
  panda: { shirt: '#F7F5F0', sleeve: '#232025', pants: '#232025', shoes: '#232025', hat: 'panda' },
  dragon: { shirt: '#C2242C', sleeve: '#C2242C', pants: '#C2242C', shoes: PAL.gold, trim: PAL.gold, hat: 'dragon', tail: true },
  gold: { shirt: PAL.gold, sleeve: PAL.gold, trim: PAL.red, pants: '#2A2226', shoes: PAL.gold, shades: true, vest: PAL.paleGold },
};

// The look of the waiter: face and hair from the avatar, clothes from the
// outfit. colors: the app's avatar colour tables (Avatar.COLORS), when there.
export function lookFrom(avatar = {}, outfit = 'mine', colors = null) {
  const a = avatar || {};
  const col = (key, v, local, fallback) => (colors && colors[key] && colors[key][v]) || local[v] || fallback;
  let o = OUTFITS[outfit] || OUTFITS.waiter;
  if (outfit === 'mine') {
    const top = col('topColor', a.topColor, CLOTH, PAL.red), bottom = col('bottomColor', a.bottomColor, CLOTH, '#3B4A66');
    const outer = col('outerColor', a.outerColor, CLOTH, '#27282D'), neck = col('neckColor', a.neckColor, CLOTH, PAL.red);
    o = { shirt: top, sleeve: a.top === 'tank' ? null : top, pants: bottom, shoes: col('shoeColor', a.shoeColor, SHOEC, '#2A2A2E'),
      skirt: a.bottom === 'skirt', shorts: a.bottom === 'shorts',
      hat: { chef: 'toque', cap: 'cap', crown: 'crown', beanie: 'beanie', clown: 'party', bucket: 'bucket', guapi: 'guapi', hijab: 'hijab', headband: 'band', bandana: 'band' }[a.hat] || null,
      capColor: col('hatColor', a.hatColor, CLOTH, PAL.red) };
    if (a.top === 'chef') Object.assign(o, { shirt: PAL.white, sleeve: PAL.white, buttons: PAL.red });
    if (a.top === 'garden' || a.top === 'tang') Object.assign(o, { shirt: PAL.red, sleeve: PAL.red, trim: PAL.gold, frogs: true });
    if (a.top === 'qipao') Object.assign(o, { shirt: PAL.red, sleeve: null, trim: PAL.gold, skirt: true, pants: PAL.red });
    if (a.top === 'clown') Object.assign(o, { shirt: '#F2C230', sleeve: '#4E8FD8', buttons: PAL.red });
    if (a.outer === 'apron') o.apron = true;
    else if (a.outer === 'puffer') o.vest = outer;
    else if (a.outer && a.outer !== 'none') Object.assign(o, { vest: outer, sleeve: outer });
    if (a.neck === 'scarf') o.scarf = neck;
    if (a.neck === 'bowtie') o.bow = neck;
    if (a.shoes === 'gold') o.shoes = PAL.gold;
    if (a.shoes === 'bunny') o.shoes = '#F2C3CE';
    if (a.shoes === 'monster') o.shoes = '#6FBF5E';
    if (a.shoes === 'dragon') o.shoes = '#C2242C';
    if (a.aura === 'gold') o.aura = true;
  }
  return {
    skin: col('skin', a.skin, SKIN, SKIN.s3), hair: a.hair || 'short', hairColor: col('hairColor', a.hairColor, HAIRC, HAIRC.dark),
    female: a.body === 'female', glasses: a.glasses && a.glasses !== 'none' ? a.glasses : null, beard: a.beard && a.beard !== 'none' ? a.beard : null,
    ...o,
  };
}
// A short key for a look, so its geometry is built once.
export function lookKey(L) {
  let h = 0;
  for (const ch of JSON.stringify(L)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return 'p' + h.toString(36);
}

const LONG = ['long', 'bangs', 'wavy', 'longcurly', 'lob'];
const TIED = { bun: 'bun', spacebuns: 'buns', manbun: 'bun', ponytail: 'tail', highpony: 'tail', pigtails: 'tails', braids: 'tails', sidebraid: 'tail' };
const BIG = ['afro', 'curly', 'curlytop'];

// A jointed person: the parts turn at their joints for the animations.
// Feet at y = 0, facing -z (away from the camera behind them).
export function makePerson(L, key) {
  materials();
  const part = (name, fn) => {
    const g = model(`${key}:${name}`, fn);
    g.name = name;
    return g;
  };
  const S = L.skin, legC = L.shorts ? S : L.pants;
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.78; root.add(hips);
  hips.add(part('pelvis', b => {
    b.box(0.34, 0.18, 0.22, 0, 0.02, 0, L.pants);
    if (L.skirt) b.cyl(0.3, 0.42, 0, -0.12, 0, L.pants, { top: 0.55, seg: 18 });
  }));
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso);
  torso.add(part('torso', b => {
    b.cyl(0.18, 0.44, 0, 0.22, 0, L.shirt, { top: 1.12, seg: 16, sz: 0.78 });
    if (L.vest) { b.cyl(0.187, 0.36, 0, 0.19, 0.005, L.vest, { top: 1.1, seg: 16, sz: 0.8 }); b.box(0.09, 0.3, 0.02, 0, 0.24, -0.15, L.shirt); }
    if (L.tie) { b.box(0.05, 0.05, 0.04, 0, 0.42, -0.15, L.tie); b.box(0.1, 0.06, 0.03, -0.045, 0.42, -0.15, L.tie, { rz: 0.4 }); b.box(0.1, 0.06, 0.03, 0.045, 0.42, -0.15, L.tie, { rz: -0.4 }); }
    if (L.buttons) for (let i = 0; i < 3; i++) { b.ball(0.022, -0.06, 0.32 - i * 0.09, -0.15, L.buttons); b.ball(0.022, 0.06, 0.32 - i * 0.09, -0.15, L.buttons); }
    if (L.trim) { b.box(0.05, 0.42, 0.02, 0, 0.22, -0.152, L.trim); b.cyl(0.12, 0.06, 0, 0.45, 0, L.trim, { seg: 14 }); }
    if (L.frogs) for (let i = 0; i < 3; i++) b.box(0.1, 0.02, 0.02, 0, 0.36 - i * 0.1, -0.16, PAL.gold);
    if (L.stripe) b.box(0.4, 0.05, 0.3, 0, 0.12, 0, L.stripe);
    if (L.scarf) b.cyl(0.11, 0.06, 0, 0.45, -0.02, L.scarf, { seg: 12 });
    if (L.bow) { b.box(0.09, 0.06, 0.03, -0.045, 0.43, -0.15, L.bow, { rz: 0.3 }); b.box(0.09, 0.06, 0.03, 0.045, 0.43, -0.15, L.bow, { rz: -0.3 }); }
    if (L.apron) b.box(0.3, 0.46, 0.02, 0, 0.08, -0.15, PAL.white);
    if (L.pack) { b.box(0.36, 0.36, 0.26, 0, 0.26, 0.27, PAL.red); b.box(0.37, 0.05, 0.27, 0, 0.36, 0.27, PAL.gold); }
    if (L.tail) for (let i = 0; i < 5; i++) b.ball(0.07 - i * 0.008, 0, 0.08 - i * 0.05, 0.2 + i * 0.09, i % 2 ? PAL.gold : '#C2242C');
    if (L.dragonSpine) for (let i = 0; i < 4; i++) b.cone(0.04, 0.08, 0, 0.4 - i * 0.1, 0.16, PAL.gold, { rx: -0.6 });
  }));
  const head = new THREE.Group(); head.position.y = 0.46; torso.add(head);
  head.add(part('head', b => {
    b.cyl(0.07, 0.1, 0, 0.0, 0, S, { seg: 10 });
    b.ball(0.235, 0, 0.19, 0, S, { seg: 20 });
    b.ball(0.05, -0.23, 0.18, 0, S); b.ball(0.05, 0.23, 0.18, 0, S);
    // face, toward -z
    b.ball(0.034, -0.085, 0.21, -0.205, PAL.ink, { sy: 1.35 }); b.ball(0.034, 0.085, 0.21, -0.205, PAL.ink, { sy: 1.35 });
    b.ball(0.011, -0.075, 0.225, -0.235, '#FFFFFF', { glow: true }); b.ball(0.011, 0.095, 0.225, -0.235, '#FFFFFF', { glow: true });
    b.box(0.07, 0.016, 0.02, -0.085, 0.275, -0.205, L.hairColor, { rz: 0.08 }); b.box(0.07, 0.016, 0.02, 0.085, 0.275, -0.205, L.hairColor, { rz: -0.08 });
    b.ring(0.055, 0.013, 0, 0.13, -0.205, '#7A2E2A', { arc: Math.PI, rz: Math.PI, seg: 10 });
    b.ball(0.025, 0, 0.17, -0.235, S);
    if (L.female) { b.ball(0.03, -0.14, 0.15, -0.18, '#F09A8A', { sz: 0.4 }); b.ball(0.03, 0.14, 0.15, -0.18, '#F09A8A', { sz: 0.4 }); }
    if (L.beard === 'mustache') b.box(0.12, 0.03, 0.03, 0, 0.155, -0.225, L.hairColor);
    if (L.beard === 'beard' || L.beard === 'stubble') b.ball(0.2, 0, 0.12, -0.03, L.hairColor, { sy: 0.6, sz: 0.95 });
    hair(b, L);
    if (L.glasses || L.shades) {
      const c = L.shades || L.glasses === 'sun' ? '#1A1A1E' : L.glasses === 'heart' ? '#E2577A' : '#2B2B30';
      if (L.shades || L.glasses === 'sun') { b.box(0.1, 0.06, 0.02, -0.085, 0.215, -0.235, c); b.box(0.1, 0.06, 0.02, 0.085, 0.215, -0.235, c); }
      else { b.ring(0.05, 0.01, -0.085, 0.21, -0.232, c); b.ring(0.05, 0.01, 0.085, 0.21, -0.232, c); }
      b.box(0.06, 0.012, 0.012, 0, 0.215, -0.235, c);
    }
    hat(b, L);
  }));
  const arm = side => {
    const sh = new THREE.Group(); sh.position.set(side * 0.215, 0.38, 0); torso.add(sh);
    sh.add(part(`arm${side}`, b => { b.ball(0.07, 0, 0, 0, L.sleeve || S); b.cyl(0.062, 0.28, 0, -0.14, 0, L.sleeve || S, { seg: 10 }); }));
    const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
    el.add(part(`fore${side}`, b => {
      b.cyl(0.055, 0.25, 0, -0.12, 0, L.sleeve || S, { seg: 10, top: 1.05 });
      b.ball(0.068, 0, -0.27, 0, S);
      if (L.towel && side < 0) b.box(0.13, 0.22, 0.04, 0, -0.1, -0.05, PAL.white);
    }));
    return [sh, el];
  };
  const [armL, foreL] = arm(-1), [armR, foreR] = arm(1);
  const leg = side => {
    const h = new THREE.Group(); h.position.set(side * 0.1, -0.02, 0); hips.add(h);
    h.add(part(`leg${side}`, b => { b.cyl(0.085, 0.38, 0, -0.19, 0, legC, { seg: 10, top: 1.1 }); if (L.shorts) b.cyl(0.095, 0.16, 0, -0.08, 0, L.pants, { seg: 10 }); }));
    const k = new THREE.Group(); k.position.y = -0.38; h.add(k);
    k.add(part(`shin${side}`, b => {
      b.cyl(0.072, 0.34, 0, -0.17, 0, L.skirt || L.shorts ? S : L.pants, { seg: 10 });
      b.box(0.14, 0.09, 0.27, 0, -0.355, -0.05, L.shoes);
      if (L.skirt) b.cyl(0.075, 0.06, 0, -0.3, 0, L.shoes, { seg: 10 });
    }));
    return [h, k];
  };
  const [legL, shinL] = leg(-1), [legR, shinR] = leg(1);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, j: { hips, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR } };
}

function hair(b, L) {
  const c = L.hairColor, h = L.hair;
  if (h === 'none' || L.hat === 'panda' || L.hat === 'dragon' || L.hat === 'hijab') return;
  if (BIG.includes(h)) { b.ball(0.3, 0, 0.27, 0.05, c, { seg: 14, sy: 0.9 }); return; }
  // a cap of hair over the top and back, leaving the face free
  b.ball(0.248, 0, 0.23, 0.025, c, { seg: 18, sy: h === 'buzz' ? 0.9 : 0.97 });
  b.box(0.36, 0.08, 0.06, 0, 0.36, -0.17, c, { rx: 0.5 });
  if (h === 'bangs' || h === 'bob') b.box(0.36, 0.09, 0.06, 0, 0.33, -0.2, c, { rx: 0.25 });
  if (h === 'quiff' || h === 'spiky') b.ball(0.12, 0, 0.42, -0.08, c, { sy: 0.7 });
  if (h === 'mohawk') b.box(0.06, 0.16, 0.42, 0, 0.44, 0.02, c);
  if (LONG.includes(h)) b.box(0.42, h === 'lob' ? 0.32 : 0.48, 0.16, 0, h === 'lob' ? 0.07 : -0.02, 0.13, c);
  if (h === 'bob') b.box(0.46, 0.22, 0.2, 0, 0.12, 0.08, c);
  const t = TIED[h];
  if (t === 'bun') b.ball(0.11, 0, 0.42, 0.14, c);
  if (t === 'buns') { b.ball(0.09, -0.15, 0.4, 0.06, c); b.ball(0.09, 0.15, 0.4, 0.06, c); }
  if (t === 'tail') b.ball(0.09, 0, 0.18, 0.3, c, { sy: 2.2 });
  if (t === 'tails') { b.ball(0.07, -0.2, 0.08, 0.12, c, { sy: 2.4 }); b.ball(0.07, 0.2, 0.08, 0.12, c, { sy: 2.4 }); }
}

function hat(b, L) {
  const h = L.hat;
  if (h === 'toque') { b.cyl(0.2, 0.22, 0, 0.47, 0.01, PAL.white, { seg: 16 }); b.ball(0.24, 0, 0.6, 0.01, PAL.white, { sy: 0.7 }); }
  if (h === 'cap') { b.ball(0.25, 0, 0.27, 0.01, L.capColor || PAL.red, { sy: 0.65 }); b.box(0.26, 0.03, 0.18, 0, 0.3, -0.22, L.capColor || PAL.red); }
  if (h === 'crown') { b.cyl(0.18, 0.1, 0, 0.45, 0, PAL.gold, { seg: 10 }); for (let i = 0; i < 5; i++) b.cone(0.04, 0.09, Math.cos(i * 1.256) * 0.16, 0.54, Math.sin(i * 1.256) * 0.16, PAL.gold); }
  if (h === 'beanie') b.ball(0.255, 0, 0.29, 0.01, L.capColor || PAL.red, { sy: 0.8 });
  if (h === 'guapi') { b.ball(0.252, 0, 0.27, 0.01, '#2A2226', { sy: 0.7 }); b.ball(0.035, 0, 0.45, 0.01, PAL.red); }
  if (h === 'bucket') { b.ball(0.25, 0, 0.29, 0.01, L.capColor || PAL.red, { sy: 0.7 }); b.cyl(0.33, 0.04, 0, 0.3, 0.01, L.capColor || PAL.red, { seg: 18, top: 0.8 }); }
  if (h === 'band') b.cyl(0.245, 0.06, 0, 0.32, 0.01, L.capColor || PAL.red, { seg: 18 });
  if (h === 'hijab') { b.ball(0.262, 0, 0.2, 0.03, L.capColor || PAL.red, { seg: 18 }); b.cyl(0.2, 0.2, 0, 0.0, 0.02, L.capColor || PAL.red, { seg: 14, top: 0.8 }); }
  if (h === 'party') b.cone(0.12, 0.3, 0, 0.55, 0, '#E2577A', { seg: 12 });
  if (h === 'panda') {
    b.ball(0.262, 0, 0.21, 0.02, '#F7F5F0', { seg: 18 }); b.ball(0.08, -0.17, 0.4, 0.02, '#232025'); b.ball(0.08, 0.17, 0.4, 0.02, '#232025');
    b.box(0.34, 0.02, 0.02, 0, 0.065, -0.22, '#232025');
  }
  if (h === 'dragon') {
    b.ball(0.265, 0, 0.22, 0.02, '#C2242C', { seg: 18 }); b.cone(0.04, 0.16, -0.12, 0.47, 0.03, PAL.gold, { rz: 0.3 }); b.cone(0.04, 0.16, 0.12, 0.47, 0.03, PAL.gold, { rz: -0.3 });
    b.box(0.3, 0.04, 0.08, 0, 0.36, -0.22, PAL.gold); b.ball(0.035, -0.08, 0.4, -0.2, '#FFFFFF', { glow: true }); b.ball(0.035, 0.08, 0.4, -0.2, '#FFFFFF', { glow: true });
  }
}

// The head chef: big, round and annoyed (but never more than that).
export function makeChef() {
  materials();
  const W = PAL.white, part = (name, fn) => model(`chef:${name}`, fn);
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips);
  hips.add(part('pelvis', b => b.box(0.44, 0.2, 0.3, 0, 0, 0, '#3A3B40')));
  const torso = new THREE.Group(); torso.position.y = 0.06; hips.add(torso);
  torso.add(part('torso', b => {
    b.ball(0.36, 0, 0.27, 0, W, { sy: 0.95, seg: 18 });
    for (let i = 0; i < 3; i++) { b.ball(0.028, -0.09, 0.36 - i * 0.1, -0.33, PAL.red); b.ball(0.028, 0.09, 0.36 - i * 0.1, -0.33, PAL.red); }
    b.cyl(0.15, 0.07, 0, 0.6, 0, PAL.red, { seg: 12 });
    b.box(0.5, 0.36, 0.04, 0, 0.12, -0.34, '#EDEDE8');
  }));
  const head = new THREE.Group(); head.position.y = 0.64; torso.add(head);
  head.add(part('head', b => {
    const S = '#E9B48A';
    b.ball(0.27, 0, 0.2, 0, S, { seg: 18 });
    b.ball(0.07, 0, 0.17, -0.27, '#D88E6A');
    b.ball(0.035, -0.1, 0.27, -0.235, PAL.ink); b.ball(0.035, 0.1, 0.27, -0.235, PAL.ink);
    b.box(0.13, 0.035, 0.03, -0.1, 0.34, -0.235, '#3A2A20', { rz: -0.35 }); b.box(0.13, 0.035, 0.03, 0.1, 0.34, -0.235, '#3A2A20', { rz: 0.35 });
    b.ball(0.09, -0.08, 0.1, -0.25, '#3A2A20', { sy: 0.45, rz: 0.4 }); b.ball(0.09, 0.08, 0.1, -0.25, '#3A2A20', { sy: 0.45, rz: -0.4 });
    b.ring(0.05, 0.012, 0, 0.03, -0.24, '#7A2E2A', { arc: Math.PI, seg: 10 });
    b.ball(0.06, -0.27, 0.2, 0, S); b.ball(0.06, 0.27, 0.2, 0, S);
    b.cyl(0.24, 0.32, 0, 0.55, 0.02, W, { seg: 16 }); b.ball(0.29, 0, 0.74, 0.02, W, { sy: 0.65 }); b.cyl(0.25, 0.06, 0, 0.42, 0.02, '#E7E3D9', { seg: 16 });
  }));
  const arm = side => {
    const sh = new THREE.Group(); sh.position.set(side * 0.36, 0.48, 0); torso.add(sh);
    sh.add(part(`arm${side}`, b => { b.ball(0.1, 0, 0, 0, W); b.cyl(0.09, 0.32, 0, -0.16, 0, W, { seg: 10 }); }));
    const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
    el.add(part(`fore${side}`, b => {
      b.cyl(0.08, 0.28, 0, -0.14, 0, W, { seg: 10 }); b.ball(0.085, 0, -0.31, 0, '#E9B48A');
      if (side > 0) { b.cyl(0.02, 0.5, 0, -0.32, -0.18, '#8A8F96', { rx: 1.3 }); b.ball(0.09, 0, -0.38, -0.44, '#8A8F96', { sy: 0.5 }); }
    }));
    return [sh, el];
  };
  const [armL, foreL] = arm(-1), [armR, foreR] = arm(1);
  const leg = side => {
    const h = new THREE.Group(); h.position.set(side * 0.14, -0.04, 0); hips.add(h);
    h.add(part(`leg${side}`, b => b.cyl(0.11, 0.42, 0, -0.21, 0, '#3A3B40', { seg: 10 })));
    const k = new THREE.Group(); k.position.y = -0.42; h.add(k);
    k.add(part(`shin${side}`, b => { b.cyl(0.095, 0.36, 0, -0.18, 0, '#3A3B40', { seg: 10 }); b.box(0.17, 0.1, 0.3, 0, -0.37, -0.05, '#1E1A1C'); }));
    return [h, k];
  };
  const [legL, shinL] = leg(-1), [legR, shinR] = leg(1);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, j: { hips, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR } };
}

// The Golden Dragon: a chain of segments that wave as it flies.
export function makeDragon() {
  const root = new THREE.Group(), segs = [];
  for (let i = 0; i < 11; i++) {
    const s = model(`dragon:seg${i}`, b => {
      if (i === 0) {
        b.ball(0.48, 0, 0, 0, PAL.gold, { sz: 1.3 }); b.box(0.5, 0.18, 0.55, 0, -0.18, -0.48, PAL.gold);
        b.ball(0.1, -0.22, 0.2, -0.32, '#FFFFFF', { glow: true }); b.ball(0.1, 0.22, 0.2, -0.32, '#FFFFFF', { glow: true });
        b.ball(0.05, -0.22, 0.2, -0.41, '#1A1A1E'); b.ball(0.05, 0.22, 0.2, -0.41, '#1A1A1E');
        b.cone(0.07, 0.55, -0.2, 0.5, 0.15, PAL.red, { rx: -0.6, rz: 0.3 }); b.cone(0.07, 0.55, 0.2, 0.5, 0.15, PAL.red, { rx: -0.6, rz: -0.3 });
        b.cyl(0.02, 0.8, -0.35, -0.1, -0.6, PAL.red, { rz: 1.2, rx: 0.3 }); b.cyl(0.02, 0.8, 0.35, -0.1, -0.6, PAL.red, { rz: -1.2, rx: 0.3 });
        b.box(0.3, 0.06, 0.12, 0, -0.28, -0.72, '#FFFFFF');
      } else if (i === 10) {
        b.ball(0.2, 0, 0, 0, PAL.gold); b.cone(0.28, 0.5, 0, 0, 0.3, PAL.red, { rx: Math.PI / 2 });
      } else {
        const r = 0.42 - i * 0.022;
        b.ball(r, 0, 0, 0, i % 2 ? PAL.red : PAL.gold, { sz: 1.15 });
        b.cone(0.07, 0.24, 0, r + 0.06, 0, PAL.gold);
        b.ball(r * 0.55, 0, -r * 0.5, 0, PAL.paleGold, { sy: 0.6, sz: 0.8 });
      }
    }, { shadow: true });
    root.add(s); segs.push(s);
  }
  return { root, segs };
}

// The serving tray the waiter rides like a board.
export const TRAYS = {
  steel: { top: '#C7CED4', rim: '#8E979F', mark: '#E2B23C' },
  bamboo: { top: '#D8B36A', rim: '#9A7438', mark: '#5D7E3A' },
  lacquer: { top: '#8E1B24', rim: '#E2B23C', mark: '#E2B23C' },
  jade: { top: '#4FA88A', rim: '#E8E1C8', mark: '#E8E1C8' },
  gold: { top: '#E7BB45', rim: '#FFF1B8', mark: '#A51E26' },
};
export function makeTray(design = 'steel') {
  const t = TRAYS[design] || TRAYS.steel;
  return model(`tray:${design}`, b => {
    b.cyl(0.62, 0.05, 0, 0, 0, t.top, { seg: 28, sz: 1.35 });
    b.ring(0.6, 0.035, 0, 0.03, 0, t.rim, { rx: Math.PI / 2, sz: 1.35, seg: 28 });
    b.ring(0.28, 0.025, 0, 0.03, 0, t.mark, { rx: Math.PI / 2, seg: 18 });
    b.ball(0.06, 0, 0.04, 0, t.mark, { sy: 0.3 });
    b.ring(0.62, 0.05, 0, -0.04, 0, '#FFE9A8', { rx: Math.PI / 2, sz: 1.35, seg: 28, glow: 'add' });
  });
}

// ------------------------------------------------------------- collectables

export function coinTex() {
  return canvasTex('coin', 128, 128, (g, w, h) => {
    const r = w / 2;
    g.fillStyle = PAL.gold; g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.lacquer; g.beginPath(); g.arc(r, r, r * 0.66, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PAL.paleGold; g.lineWidth = 5; g.beginPath(); g.arc(r, r, r * 0.82, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PAL.paleGold; g.font = `700 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CG', r, r + 3);
  });
}

export const POWER_COLORS = { magnet: '#E2577A', spring: '#3FA8D8', dragon: '#E2B23C', double: '#4FB36A' };
export function makePower(k) {
  return model(`power:${k}`, b => {
    const c = POWER_COLORS[k];
    b.ring(0.48, 0.05, 0, 0, 0, c, { seg: 24 });
    b.disc(0.46, 0, 0, 0.01, '#FFF8E6', { seg: 24, glow: true }); b.disc(0.46, 0, 0, -0.01, '#FFF8E6', { seg: 24, glow: true, ry: Math.PI });
    if (k === 'magnet') {
      b.ring(0.2, 0.07, 0, 0.04, 0, c, { arc: Math.PI, rz: Math.PI, seg: 14 }); b.box(0.14, 0.12, 0.14, -0.2, 0.06, 0, '#DDE3E8'); b.box(0.14, 0.12, 0.14, 0.2, 0.06, 0, '#DDE3E8');
      b.ball(0.06, 0, 0.26, 0, PAL.gold);
    } else if (k === 'spring') {
      b.box(0.3, 0.12, 0.16, 0, 0.1, 0, c); b.box(0.12, 0.08, 0.16, 0.12, 0.02, 0, '#FFFFFF');
      for (let i = 0; i < 3; i++) b.ring(0.08, 0.018, 0, -0.06 - i * 0.07, 0, '#B9C2C9', { rx: Math.PI / 2, seg: 10 });
    } else if (k === 'dragon') {
      b.ball(0.2, 0, 0, 0, PAL.gold, { sz: 1.2 }); b.cone(0.05, 0.22, -0.1, 0.22, 0, PAL.red, { rz: 0.4 }); b.cone(0.05, 0.22, 0.1, 0.22, 0, PAL.red, { rz: -0.4 });
      b.ball(0.05, -0.08, 0.06, -0.18, '#1A1A1E'); b.ball(0.05, 0.08, 0.06, -0.18, '#1A1A1E');
    } else {
      for (let i = 0; i < 3; i++) b.cyl(0.17, 0.05, (i - 1) * 0.06, -0.12 + i * 0.07, 0, PAL.gold, { seg: 16, rx: Math.PI / 2 });
      b.box(0.2, 0.04, 0.02, 0.17, 0.2, 0, c, { rz: 0.78 }); b.box(0.2, 0.04, 0.02, 0.17, 0.2, 0, c, { rz: -0.78 });
    }
  }, { shadow: false });
}

export function makeSpecial(k) {
  return model(`special:${k}`, b => {
    if (k === 'dumpling') {
      b.ball(0.26, 0, 0, 0, '#F7F1E3', { sy: 0.7, sz: 0.85 });
      for (let i = -2; i <= 2; i++) b.ball(0.05, i * 0.07, 0.15, 0, '#EDE3CD', { sy: 0.8 });
    } else if (k === 'cookie') {
      b.ball(0.26, -0.06, 0, 0, '#E3B25B', { sy: 0.55, rz: 0.4 }); b.ball(0.26, 0.06, 0, 0, '#D9A548', { sy: 0.55, rz: -0.4 });
      b.box(0.16, 0.04, 0.005, 0.18, -0.05, -0.1, '#FFFFFF');
    } else {
      b.cyl(0.24, 0.3, 0, 0, 0, '#FBF6EA', { seg: 4, top: 1.35, ry: Math.PI / 4 }); b.box(0.46, 0.05, 0.46, 0, 0.17, 0, PAL.red);
      b.ring(0.12, 0.012, 0, 0.26, 0, '#8A8F96', { arc: Math.PI, seg: 10 });
    }
  }, { shadow: false });
}
