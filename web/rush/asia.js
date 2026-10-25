// Chen's Garden Rush: the journey through Asia, after the restaurant. Each
// country has its own sky, path, scenery along the route, a gate where it
// begins, a landmark on the horizon, and its own look for the obstacles
// (the same shapes as in the restaurant, so they ask for the same move).
import * as THREE from '../vendor/three-0.169.0/three.module.min.js';
import { PAL, model, canvasTex, toonMat } from './models.js';
import { C, SIZE } from './rules.js';
import { wallSign } from './scenery.js';

const PI = Math.PI;
const M4 = (x, y, z, sx, sy, sz) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
// a hipped roof, w wide and d deep at the eaves (y), h high
function roof(b, w, d, h, x, y, z, c, top = 0.18) {
  b.cyl(0.7071, 1, 0, 0.5, 0, c, { seg: 4, top, ry: PI / 4, m: M4(x, y, z, w, h, d) });
  // the corners turn up, as on temple roofs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cone(Math.min(w, d) * 0.06, h * 0.55, x + sx * w * 0.5, y + h * 0.1, z + sz * d * 0.5, c, { rz: -sx * 0.7, rx: sz * 0.7, seg: 5 });
}

// ------------------------------------------------------------------ looks
// sky top, middle, horizon (the fog), the light from above and below, the sun
export const ASIA_LOOK = {
  japan: { top: '#6FA3D9', mid: '#B9D7EE', fog: '#F1E4E6', sky: '#FFF4F0', ground: '#6E8A5A', light: '#FFF2E4', path: 'slabs', side: 'grass', petals: '#F4B6C8', grass: '#6E9E4E' },
  china: { top: '#5F8FC4', mid: '#A9C6DE', fog: '#E8E4D2', sky: '#FFF6E6', ground: '#7A7A55', light: '#FFF0D8', path: 'bricks', side: 'grass', petals: '#E8C54A', grass: '#7A9A50' },
  korea: { top: '#4E86C8', mid: '#9DC2E6', fog: '#E2ECF2', sky: '#F4F8FF', ground: '#6E8A60', light: '#FFF6EA', path: 'granite', side: 'grass', petals: '#F6F0E2', grass: '#6A9A58' },
  thailand: { top: '#3F8FD6', mid: '#8CC6EC', fog: '#F6E9C8', sky: '#FFF8E0', ground: '#6E8A40', light: '#FFF0CC', path: 'tiles', side: 'grass', petals: '#F2A93B', grass: '#5FA046' },
  vietnam: { top: '#5C9CC9', mid: '#A7D2E6', fog: '#DDEDE6', sky: '#F2FAF6', ground: '#4E7A70', light: '#FFF6E6', path: 'planks', side: 'water', petals: '#F2D24A', grass: '#5E9A62' },
  india: { top: '#5B95D0', mid: '#B5D3EA', fog: '#F4E3C3', sky: '#FFF4DE', ground: '#9A8050', light: '#FFE9C8', path: 'sandstone', side: 'sand', petals: '#F28C28', grass: '#8AA050' },
  nepal: { top: '#3270C0', mid: '#86B4E3', fog: '#E6EEF5', sky: '#F6FAFF', ground: '#708060', light: '#FFF8F0', path: 'dirt', side: 'grass', petals: '#E8E0F0', grass: '#7A9A5E' },
  indonesia: { top: '#4C93CF', mid: '#9ED0EA', fog: '#E6F0DA', sky: '#F6FFF0', ground: '#5E8A4A', light: '#FFF4DC', path: 'lava', side: 'paddy', petals: '#F2E24A', grass: '#5AA04A' },
};

// ------------------------------------------------------------------ ground
const PATHS = {
  slabs: (g, w, h) => { g.fillStyle = '#8F8A84'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) { g.fillStyle = ['#BDB6AC', '#B2AB9F', '#C6BFB4'][(x + y) % 3]; g.fillRect(x * w / 3 + 3 + (y % 2) * 14, y * h / 4 + 3, w / 3 - 6, h / 4 - 6); } },
  bricks: (g, w, h) => { g.fillStyle = '#6E6A66'; g.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = ['#9C968E', '#8E8880', '#A7A198'][(x * 3 + y) % 3]; g.fillRect(x * w / 4 + (y % 2) * w / 8 + 2, y * h / 8 + 2, w / 4 - 4, h / 8 - 4); } },
  granite: (g, w, h) => { g.fillStyle = '#C9C6C0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.fillStyle = i % 2 ? 'rgba(90,90,96,.18)' : 'rgba(255,255,255,.25)'; g.fillRect((i * 97) % w, (i * 53) % h, 3, 3); } g.strokeStyle = '#A9A59E'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); },
  tiles: (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#C26A3E' : '#D9844F'; g.fillRect(x * w / 4, y * h / 4, w / 4, h / 4); } g.strokeStyle = '#8E4A2A'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); } },
  planks: (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = ['#A57A4E', '#9A6F45', '#B08556', '#94683F'][i % 4]; g.fillRect(i * w / 8, 0, w / 8 - 2, h); g.fillStyle = '#5E3E22'; g.fillRect(i * w / 8, ((i * 3) % 8) * h / 8, w / 8, 2); } },
  sandstone: (g, w, h) => { g.fillStyle = '#B5684A'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) { g.fillStyle = ['#C97C5A', '#BF7050', '#D08A66'][(x + y) % 3]; g.fillRect(x * w / 2 + 3, y * h / 4 + 3, w / 2 - 6, h / 4 - 6); } g.strokeStyle = '#F2E6D6'; g.lineWidth = 4; g.strokeRect(w / 4, h / 4, w / 2, h / 2); },
  dirt: (g, w, h) => { g.fillStyle = '#9C8466'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = ['#8A735A', '#B09A7C', '#7E6A54'][i % 3]; g.beginPath(); g.arc((i * 131) % w, (i * 71) % h, 2 + (i % 4), 0, PI * 2); g.fill(); } },
  lava: (g, w, h) => { g.fillStyle = '#4A4744'; g.fillRect(0, 0, w, h); for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) { g.fillStyle = ['#615D58', '#57534F', '#6B6762'][(x + y) % 3]; g.fillRect(x * w / 3 + 3 + (y % 2) * 18, y * h / 5 + 3, w / 3 - 6, h / 5 - 6); } },
};
const SIDES = {
  grass: (L) => (g, w, h) => { g.fillStyle = L.grass; g.fillRect(0, 0, w, h); for (let i = 0; i < 700; i++) { g.fillStyle = i % 9 === 0 ? L.petals : i % 2 ? 'rgba(30,60,20,.18)' : 'rgba(255,255,200,.12)'; g.fillRect((i * 89) % w, (i * 37) % h, 3, i % 9 === 0 ? 3 : 5); } },
  water: () => (g, w, h) => { g.fillStyle = '#3E8C8A'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(220,255,250,.35)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { const x = (i * 71) % w, y = (i * 43) % h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 20, y); g.stroke(); } },
  sand: (L) => (g, w, h) => { g.fillStyle = '#D9C08E'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.fillStyle = i % 7 === 0 ? L.grass : 'rgba(120,90,40,.15)'; g.fillRect((i * 97) % w, (i * 41) % h, 3, 3); } },
  paddy: (L) => (g, w, h) => { g.fillStyle = '#5E9AA0'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 12) { g.fillStyle = L.grass; g.fillRect(x + 2, y + 2, 6, 9); } },
};
const groundMats = {};
function groundMat(k, part) {
  const key = `${k}:${part}`;
  if (groundMats[key]) return groundMats[key];
  const L = ASIA_LOOK[k];
  const t = part === 'path' ? canvasTex(`asia-path:${k}`, 256, 256, PATHS[L.path], { repeat: [2.5, 2] })
    : canvasTex(`asia-side:${k}`, 256, 256, SIDES[L.side](L), { repeat: [5, 1] });
  return (groundMats[key] = toonMat({ map: t }));
}
const pathGeo = new THREE.PlaneGeometry(10, 8).rotateX(-PI / 2);
const sideGeo = new THREE.PlaneGeometry(40, 8).rotateX(-PI / 2);
// 8 m of ground: the path over the lanes, and land (or water) to either side
export function groundTile(k) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(pathGeo, groundMat(k, 'path')); p.receiveShadow = true; g.add(p);
  const water = ASIA_LOOK[k].side === 'water' || ASIA_LOOK[k].side === 'paddy';
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(sideGeo, groundMat(k, 'side')); m.position.set(s * 25, water ? -0.35 : -0.01, 0); m.receiveShadow = true; g.add(m);
  }
  g.add(model(`asia-edge:${water ? 'water' : 'land'}`, b => {
    for (const s of [-1, 1]) {
      b.box(0.4, water ? 0.75 : 0.18, 8, s * 5.1, water ? -0.32 : 0.04, 0, water ? '#7A6E62' : '#8E8A80');
      if (water) for (let z = -3.6; z < 4; z += 1.6) b.cyl(0.12, 1.2, s * 5.3, -0.1, z, '#5E4A36', { seg: 6 });
    }
  }, { shadow: false }));
  return g;
}

// --------------------------------------------------------------- obstacles
// Same sizes as in the restaurant (rules.js SIZE): low ones to jump, ones
// that hang to slide under, tall ones to go around.
const OB = {
  // low: sake barrels, baskets with fruit, clay jars
  barrels: b => {
    for (const x of [-0.53, 0, 0.53]) {
      b.cyl(0.27, 0.78, x, 0.39, 0, '#EDE3C8', { seg: 14 });
      for (const y of [0.12, 0.66]) b.cyl(0.285, 0.06, x, y, 0, '#8A6A3E', { seg: 14 });
      b.box(0.26, 0.3, 0.02, x, 0.42, 0.27, x ? '#B8262E' : '#2A2226');
      b.cyl(0.24, 0.06, x, 0.81, 0, '#C9A86A', { seg: 14 });
    }
  },
  baskets: b => {
    const fruit = ['#F28C28', '#F2D24A', '#7BBF4A', '#D8343A'];
    for (let i = 0; i < 3; i++) {
      const x = -0.53 + i * 0.53;
      b.cyl(0.28, 0.52, x, 0.26, 0, '#B08550', { seg: 12, top: 1.18 });
      b.ring(0.31, 0.03, x, 0.52, 0, '#8A6234', { rx: PI / 2, seg: 14 });
      for (let k = 0; k < 5; k++) b.ball(0.11, x + Math.cos(k * 1.26) * 0.14, 0.62 + (k % 2) * 0.08, Math.sin(k * 1.26) * 0.14, fruit[(i + k) % 4]);
    }
  },
  jars: b => {
    for (const [x, s] of [[-0.5, 1], [0.05, 1.1], [0.55, 0.95]]) {
      b.ball(0.3 * s, x, 0.38 * s, 0, '#5E3A26', { sy: 1.25, seg: 14 });
      b.cyl(0.17 * s, 0.1, x, 0.76 * s, 0, '#4A2C1C', { seg: 12 });
      b.ball(0.18 * s, x, 0.82 * s, 0, '#6E4630', { sy: 0.35 });
    }
  },
  // hanging: a noren curtain, a festival banner, a marigold garland, prayer flags
  noren: b => {
    for (const x of [-0.95, 0.95]) b.box(0.07, 2.85, 0.07, x, 3.15, 0, '#3D2618');
    b.box(2.0, 0.16, 0.18, 0, 1.78, 0, '#3D2618');
    for (let i = 0; i < 3; i++) {
      const x = -0.64 + i * 0.64;
      b.box(0.6, 0.62, 0.03, x, 1.43, 0, '#2F3E66');
      b.disc(0.13, x, 1.5, 0.02, '#F6F3EC', { seg: 14 });
    }
    b.box(2.0, 0.04, 0.04, 0, 1.13, 0.02, '#F6F3EC');
  },
  banner: b => {
    for (const x of [-0.95, 0.95]) b.box(0.08, 3.4, 0.08, x, 2.85, 0, '#6E141A');
    b.box(2.0, 0.6, 0.06, 0, 1.43, 0, '#C8262E');
    b.box(2.0, 0.06, 0.07, 0, 1.15, 0, PAL.gold); b.box(2.0, 0.06, 0.07, 0, 1.71, 0, PAL.gold);
    for (let i = 0; i < 4; i++) b.box(0.22, 0.22, 0.07, -0.66 + i * 0.44, 1.43, 0.01, PAL.gold, { rz: PI / 4 });
    for (const x of [-0.55, 0.55]) { b.ball(0.24, x, 2.25, 0, '#E8463A', { sy: 0.85, glow: true }); b.cyl(0.13, 0.06, x, 2.47, 0, PAL.gold, { seg: 10 }); }
    b.box(2.0, 0.12, 0.12, 0, 2.6, 0, '#6E141A');
  },
  garland: b => {
    for (const x of [-0.95, 0.95]) b.box(0.08, 3.4, 0.08, x, 2.85, 0, '#8A5A30');
    b.box(2.0, 0.12, 0.12, 0, 1.95, 0, '#8A5A30');
    const cols = ['#F28C28', '#F2C230', '#E8463A'];
    for (let row = 0; row < 3; row++) for (let i = 0; i <= 16; i++) {
      const u = i / 16, x = -0.92 + u * 1.84, y = 1.85 - row * 0.22 - Math.sin(u * PI) * 0.18;
      b.ball(0.07, x, y, 0, cols[(i + row) % 3]);
    }
    for (let i = 0; i < 7; i++) b.cyl(0.03, 0.55, -0.84 + i * 0.28, 1.45, 0, '#F2C230', { seg: 5 });
    b.box(2.0, 0.05, 0.05, 0, 1.15, 0, '#F6F3EC');
  },
  flags: b => {
    for (const x of [-0.95, 0.95]) b.box(0.08, 3.4, 0.08, x, 2.85, 0, '#6B4429');
    b.box(2.0, 0.1, 0.1, 0, 1.92, 0, '#6B4429');
    const cols = ['#2E6FD8', '#F6F3EC', '#D8343A', '#3FA86A', '#F2C230'];
    for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) b.box(0.22, 0.3, 0.02, -0.82 + i * 0.235, 1.68 - row * 0.36, row * 0.03, cols[(i + row) % 5]);
    b.box(2.0, 0.03, 0.03, 0, 1.15, 0, '#6B4429');
  },
  // tall: a stone lantern, a market stall, a rack of jars, a tuk-tuk, a prayer-wheel shrine
  stonelantern: b => {
    const S = '#9C978E', D = '#7E7970';
    b.box(1.7, 0.3, 1.3, 0, 0.15, 0, D);
    b.box(1.2, 0.25, 0.9, 0, 0.42, 0, S);
    b.cyl(0.4, 0.8, 0, 0.95, 0, S, { seg: 8 });
    b.box(1.5, 0.2, 1.2, 0, 1.45, 0, D);
    b.box(1.2, 0.7, 1.0, 0, 1.9, 0, S);
    b.box(0.5, 0.36, 0.04, 0, 1.92, 0.51, '#FFD98A', { glow: true });
    b.box(0.04, 0.36, 0.5, 0.61, 1.92, 0, '#FFD98A', { glow: true }); b.box(0.04, 0.36, 0.5, -0.61, 1.92, 0, '#FFD98A', { glow: true });
    roof(b, 1.9, 1.6, 0.45, 0, 2.25, 0, D, 0.12);
    b.ball(0.16, 0, 2.66, 0, S);
  },
  stall: b => {
    for (const x of [-0.85, 0.85]) for (const z of [-0.65, 0.65]) b.box(0.07, 2.5, 0.07, x, 1.25, z, '#6B4429');
    b.box(1.8, 0.95, 1.3, 0, 0.47, 0, '#8A5A30');
    b.box(1.84, 0.06, 1.34, 0, 0.97, 0, '#A87A4F');
    const goods = ['#F28C28', '#7BBF4A', '#D8343A', '#F2D24A', '#E8E0C8'];
    for (let i = 0; i < 6; i++) b.ball(0.15, -0.65 + i * 0.26, 1.12, 0.3, goods[i % 5]);
    for (let i = 0; i < 5; i++) b.box(0.3, 0.8, 0.04, -0.68 + i * 0.34, 1.75, 0.6, ['#C8262E', '#2E6FD8', '#F2C230', '#3FA86A', '#E8463A'][i]);
    for (let i = 0; i < 3; i++) b.box(1.7, 0.7, 0.04, 0, 1.6, -0.6 + i * 0.6, ['#B08550', '#C9A86A', '#B08550'][i]);
    for (let i = 0; i < 6; i++) b.box(0.32, 0.06, 1.5, -0.8 + i * 0.32, 2.55 + (i % 2) * 0.04, 0, i % 2 ? '#F6F3EC' : '#C8262E', { rx: 0.08 });
    b.box(1.9, 0.12, 1.5, 0, 2.69, 0, '#6B4429');
  },
  onggi: b => {
    b.box(1.8, 0.1, 1.3, 0, 0.05, 0, '#7E7970');
    for (let t = 0; t < 3; t++) {
      const y = t * 0.9;
      b.box(1.8, 0.08, 1.3, 0, y + 0.06, 0, '#8A5A30');
      for (const x of [-0.85, 0.85]) for (const z of [-0.6, 0.6]) b.box(0.07, 0.9, 0.07, x, y + 0.45, z, '#6B4429');
      for (const x of [-0.5, 0.05, 0.55]) { b.ball(0.33, x, y + 0.44, 0.05, '#4E3020', { sy: 1.15, seg: 12 }); b.cyl(0.18, 0.1, x, y + 0.8, 0.05, '#3E2618', { seg: 10 }); }
    }
    b.box(1.85, 0.08, 1.35, 0, 2.72, 0, '#8A5A30');
  },
  tuktuk: b => {
    const body = '#2E8FD8', trim = '#F2C230';
    for (const [x, z] of [[-0.7, -0.45], [0.7, -0.45], [0, 0.6]]) b.cyl(0.25, 0.14, x, 0.25, z, '#2A2A2E', { rz: PI / 2, seg: 14 });
    b.box(1.6, 0.55, 1.0, 0, 0.6, -0.2, body);
    b.box(1.5, 0.5, 0.15, 0, 1.05, -0.65, body);
    b.box(1.5, 0.35, 0.95, 0, 0.98, -0.2, '#C8262E');
    b.box(0.9, 0.7, 0.5, 0, 0.75, 0.5, body);
    b.box(0.85, 0.5, 0.05, 0, 1.4, 0.72, '#BFE8FF');
    for (const x of [-0.75, 0.75]) for (const z of [-0.65, 0.65]) b.box(0.05, 0.85, 0.05, x, 1.55, z, '#3A3B40');
    b.box(1.7, 0.1, 1.45, 0, 2.0, 0, trim);
    b.box(1.7, 0.06, 1.45, 0, 2.06, 0, body);
    for (let i = 0; i < 4; i++) b.box(0.6, 0.32, 0.55, -0.45 + (i % 2) * 0.9, 2.25 + Math.floor(i / 2) * 0.33, (i % 2) * 0.1 - 0.05, ['#B08550', '#E8463A', '#6E8CB3', '#F2C230'][i]);
    b.box(1.3, 0.06, 1.0, 0, 2.72, 0, '#3A3B40');
    b.ball(0.12, -0.35, 0.7, 0.78, '#FFF6D0', { glow: true }); b.ball(0.12, 0.35, 0.7, 0.78, '#FFF6D0', { glow: true });
  },
  shrine: b => {
    b.box(1.8, 0.3, 1.4, 0, 0.15, 0, '#8E8A80');
    b.box(1.6, 1.4, 1.2, 0, 1.0, 0, '#F2EDE2');
    for (let i = 0; i < 5; i++) { b.cyl(0.13, 0.45, -0.6 + i * 0.3, 0.95, 0.62, PAL.gold, { seg: 10 }); b.cyl(0.04, 0.6, -0.6 + i * 0.3, 0.95, 0.62, '#8A6A3E', { seg: 4 }); }
    b.box(1.6, 0.12, 1.2, 0, 1.75, 0, '#8A1E24');
    roof(b, 1.95, 1.6, 0.4, 0, 1.8, 0, '#8A1E24', 0.45);
    b.box(1.1, 0.25, 0.9, 0, 2.3, 0, '#F2EDE2');
    roof(b, 1.3, 1.1, 0.3, 0, 2.42, 0, '#8A1E24', 0.2);
    b.cone(0.1, 0.25, 0, 2.62, 0, PAL.gold, { seg: 8 });
  },
};
export const hasObstacle = v => !!OB[v];
export function obstacleModel(variant) { return model(`asia-ob:${variant}`, OB[variant]); }

// platforms 1.05 m high: a wooden deck and a stone wall to run along
const PLAT = {
  wooddeck: (b, len) => {
    for (let z = -len / 2 + 0.3; z <= len / 2 - 0.3; z += Math.max(1.2, (len - 0.6) / Math.max(1, Math.round((len - 0.6) / 1.6)))) for (const x of [-0.8, 0.8]) b.box(0.14, 0.95, 0.14, x, 0.47, z, '#6B4429');
    for (const x of [-0.85, 0.85]) b.box(0.16, 0.2, len, x, 0.85, 0, '#5E3E22');
    for (let z = -len / 2 + 0.15; z < len / 2; z += 0.3) b.box(1.92, 0.08, 0.27, 0, 1.0, z, (Math.round(z * 3.3) % 2) ? '#A57A4E' : '#B08556');
    b.box(1.9, 0.05, 0.05, 0, 1.06, len / 2, PAL.gold, { glow: true });
  },
  stonewall: (b, len) => {
    for (let z = -len / 2 + 0.3, i = 0; z < len / 2; z += 0.6, i++) for (let r = 0; r < 3; r++) b.box(0.94, 0.33, 0.58, (r % 2 ? 0.48 : -0.48) * (i % 2 ? 1 : -1), 0.17 + r * 0.33, z, ['#A8A296', '#9A9488', '#B4AEA2'][(i + r) % 3]);
    b.box(1.95, 0.08, len, 0, 1.01, 0, '#C6C0B4');
    b.box(1.9, 0.05, 0.05, 0, 1.06, len / 2, PAL.gold, { glow: true });
  },
};
export const hasPlatform = v => !!PLAT[v];
export function platformModel(variant, len) {
  const L = Math.round(len * 2) / 2;
  const g = model(`asia-pl:${variant}:${L}`, b => PLAT[variant](b, L));
  g.userData.sz = len / L;
  return g;
}

// the posts an overhead obstacle hangs from, outside the lanes
export function outRail() {
  return model('asia-rail', b => {
    b.box(7.6, 0.16, 0.2, 0, 4.56, 0, '#6B4429');
    for (const s of [-1, 1]) { b.box(0.22, 4.6, 0.22, s * 3.7, 2.3, 0, '#6B4429'); b.box(0.4, 0.2, 0.4, s * 3.7, 0.1, 0, '#8E8A80'); }
  }, { shadow: false });
}

// --------------------------------------------------------------- scenery
const tree = {
  sakura: b => { b.cyl(0.18, 2.2, 0, 1.1, 0, '#5E3E2E', { seg: 7, rz: 0.1 }); for (let i = 0; i < 7; i++) b.ball(0.9, Math.cos(i * 0.9) * 1.0, 2.6 + (i % 3) * 0.4, Math.sin(i * 0.9) * 1.0, ['#F4B6C8', '#F8CAD8', '#EFA2BA'][i % 3], { sy: 0.7 }); },
  pine: b => { b.cyl(0.2, 3.4, 0, 1.7, 0, '#6B4A36', { seg: 7, rz: 0.12 }); for (let i = 0; i < 4; i++) b.ball(1.3 - i * 0.2, (i % 2 ? 0.6 : -0.5), 2.4 + i * 0.75, (i % 2) * 0.3, i % 2 ? '#3E6A42' : '#4A7A4A', { sy: 0.35 }); },
  palm: b => {
    let x = 0, y = 0;
    for (let i = 0; i < 6; i++) { b.cyl(0.18 - i * 0.012, 0.8, x, y + 0.4, 0, '#8A6A48', { seg: 7, rz: -0.12 }); x += 0.1; y += 0.78; }
    for (let i = 0; i < 7; i++) { const a = i * 0.9; b.box(2.2, 0.06, 0.45, x + Math.cos(a) * 1.0, y - 0.3, Math.sin(a) * 1.0, i % 2 ? '#3E8A3E' : '#4FA04A', { ry: -a, rz: -0.45 }); }
    b.ball(0.25, x, y - 0.1, 0, '#6E5A30');
  },
  bamboo: b => { for (let i = 0; i < 7; i++) { const h = 3 + (i * 7 % 5) * 0.5, x = (i % 3 - 1) * 0.35, z = (Math.floor(i / 3) - 1) * 0.35; b.cyl(0.07, h, x, h / 2, z, '#7FAF4E', { seg: 6 }); b.ball(0.45, x + 0.2, h, z, '#5FA046', { sy: 0.35 }); } },
  bush: (b, c = '#4E8A4A') => { for (let i = 0; i < 4; i++) b.ball(0.6, Math.cos(i * 1.6) * 0.5, 0.45, Math.sin(i * 1.6) * 0.5, i % 2 ? c : '#5E9A52', { sy: 0.7 }); },
};
const D = {
  sakura: tree.sakura, pine: tree.pine, palm: tree.palm, bamboo: tree.bamboo,
  toro: b => { b.box(0.7, 0.2, 0.7, 0, 0.1, 0, '#8E8A80'); b.cyl(0.16, 0.8, 0, 0.6, 0, '#9C978E', { seg: 8 }); b.box(0.6, 0.4, 0.6, 0, 1.2, 0, '#9C978E'); b.box(0.3, 0.2, 0.62, 0, 1.2, 0, '#FFD98A', { glow: true }); roof(b, 0.9, 0.9, 0.3, 0, 1.4, 0, '#7E7970', 0.1); },
  jhouse: (b, s) => {
    b.box(5, 0.4, 4, 0, 0.2, 0, '#7E7970');
    b.box(4.6, 2.6, 3.6, 0, 1.7, 0, '#F2EDE2');
    for (let i = 0; i < 6; i++) b.box(0.12, 2.6, 3.65, -2.2 + i * 0.88, 1.7, 0, '#3D2618');
    b.box(4.7, 0.14, 3.7, 0, 2.2, 0, '#3D2618');
    b.box(0.08, 1.8, 2.6, -s * 2.32, 1.3, 0, '#C9A86A');
    roof(b, 6.2, 5, 1.8, 0, 3.0, 0, '#3E4148', 0.15);
  },
  pavilion: (b, s) => {
    b.box(5, 0.5, 5, 0, 0.25, 0, '#B9B3A6');
    for (const x of [-1.9, 1.9]) for (const z of [-1.9, 1.9]) b.cyl(0.18, 3, x, 2, z, '#B8262E', { seg: 10 });
    b.box(4.6, 0.4, 4.6, 0, 3.6, 0, '#2E7A5A');
    roof(b, 6.4, 6.4, 1.6, 0, 3.8, 0, '#2F6A55', 0.12);
    b.cone(0.3, 0.8, 0, 5.6, 0, PAL.gold, { seg: 8 });
    b.ball(0.35, 1.9, 2.6, 1.9, '#E8463A', { glow: true });
  },
  redlanterns: b => { b.cyl(0.08, 3.2, 0, 1.6, 0, '#3D2618', { seg: 6 }); b.box(1.2, 0.08, 0.08, 0.5, 3.1, 0, '#3D2618'); for (const x of [0.2, 0.9]) { b.ball(0.3, x, 2.6, 0, '#E8463A', { sy: 0.85, glow: true }); b.cyl(0.16, 0.06, x, 2.88, 0, PAL.gold, { seg: 8 }); } },
  hanok: (b, s) => {
    b.box(6, 0.6, 4.4, 0, 0.3, 0, '#A8A296');
    b.box(5.4, 2.4, 3.8, 0, 1.8, 0, '#F2EDE2');
    for (let i = 0; i < 5; i++) b.box(0.18, 2.4, 3.85, -2.6 + i * 1.3, 1.8, 0, '#8A5A30');
    b.box(5.6, 0.2, 4.0, 0, 3.05, 0, '#3E8A70');
    roof(b, 7.6, 5.6, 1.6, 0, 3.1, 0, '#3A3D44', 0.18);
  },
  jarset: b => { b.box(2.6, 0.3, 1.6, 0, 0.15, 0, '#8E8A80'); for (let i = 0; i < 5; i++) b.ball(0.32 + (i % 2) * 0.08, -0.95 + i * 0.48, 0.65, (i % 2) * 0.3 - 0.15, '#4E3020', { sy: 1.15 }); },
  sala: (b, s) => {
    b.box(5, 0.6, 5, 0, 0.3, 0, '#F2EDE2');
    for (const x of [-1.9, 1.9]) for (const z of [-1.9, 1.9]) b.box(0.3, 2.8, 0.3, x, 2, z, '#F6F3EC');
    roof(b, 6, 6, 1.4, 0, 3.4, 0, '#C8402E', 0.35);
    roof(b, 4.2, 4.2, 1.4, 0, 4.4, 0, '#2E6A8A', 0.2);
    b.box(6.1, 0.14, 6.1, 0, 3.4, 0, PAL.gold);
    b.cone(0.18, 1.4, 0, 6.3, 0, PAL.gold, { seg: 8 });
  },
  chedi: (b, s, c = PAL.gold) => { b.box(2, 0.6, 2, 0, 0.3, 0, '#F2EDE2'); b.box(1.5, 0.4, 1.5, 0, 0.8, 0, '#F2EDE2'); b.ball(0.85, 0, 1.6, 0, c, { sy: 0.9 }); for (let i = 0; i < 5; i++) b.cyl(0.3 - i * 0.05, 0.35, 0, 2.5 + i * 0.35, 0, c, { seg: 10, top: 0.8 }); b.cone(0.08, 0.8, 0, 4.6, 0, c, { seg: 6 }); },
  hoilantern: b => { b.cyl(0.07, 3.4, 0, 1.7, 0, '#5E3E22', { seg: 6 }); b.box(1.6, 0.06, 0.06, 0, 3.2, 0, '#5E3E22'); ['#E8463A', '#F2C230', '#3FA86A', '#2E6FD8', '#E8463A'].forEach((c, i) => b.ball(0.18, -0.7 + i * 0.35, 2.85 - (i % 2) * 0.2, 0, c, { sy: 1.25, glow: true })); },
  boat: (b, s) => {
    b.box(1.6, 0.6, 5, 0, 0, 0, '#6B4429'); b.box(1.2, 0.3, 4.6, 0, 0.35, 0, '#8A5A30');
    b.cyl(0.08, 4.5, 0, 2.6, 0, '#3D2618', { seg: 6 });
    for (let i = 0; i < 5; i++) b.box(0.05, 0.75, 2.4, 0, 1.2 + i * 0.75, 0, i % 2 ? '#C84A2E' : '#D8643A');
  },
  karst: b => { b.cyl(2.2, 9, 0, 4.5, 0, '#5E7A5A', { seg: 9, top: 0.7 }); b.ball(1.6, 0, 9, 0, '#4E7A4A', { sy: 0.8 }); b.ball(1.2, 0.8, 5, 1.2, '#4E8A4A', { sy: 0.6 }); },
  colorhouse: (b, s, c = '#E8A23A') => {
    b.box(4, 3.4, 3.6, 0, 1.7, 0, c);
    b.box(4.1, 0.2, 3.7, 0, 3.45, 0, '#F2EDE2');
    for (let i = 0; i < 3; i++) b.box(0.6, 1.0, 0.05, -1.2 + i * 1.2, 2.0, -s * 1.82, '#3E8A9A');
    b.cyl(0.6, 0.6, 1.2, 3.85, 0, '#F2EDE2', { seg: 10 }); b.ball(0.6, 1.2, 4.2, 0, '#F2EDE2', { sy: 0.9 });
  },
  chhatri: b => { b.box(2, 0.5, 2, 0, 0.25, 0, '#C97C5A'); for (const x of [-0.75, 0.75]) for (const z of [-0.75, 0.75]) b.cyl(0.1, 1.8, x, 1.4, z, '#E8D8C4', { seg: 8 }); b.box(2.1, 0.2, 2.1, 0, 2.35, 0, '#C97C5A'); b.ball(0.95, 0, 2.6, 0, '#F2EDE2', { sy: 0.85 }); b.cone(0.08, 0.6, 0, 3.6, 0, PAL.gold, { seg: 6 }); },
  stonehouse: (b, s) => { b.box(4, 2.8, 3.4, 0, 1.4, 0, '#9C8E7C'); for (let i = 0; i < 4; i++) b.box(4.05, 0.08, 3.45, 0, 0.5 + i * 0.6, 0, '#7E7060'); b.box(0.8, 0.8, 0.05, -1, 1.8, -s * 1.72, '#6B2E24'); roof(b, 4.8, 4.2, 1.0, 0, 2.8, 0, '#4A4A50', 0.25); },
  flagpole: b => {
    b.cyl(0.07, 5, 0, 2.5, 0, '#6B4429', { seg: 6 });
    const cols = ['#2E6FD8', '#F6F3EC', '#D8343A', '#3FA86A', '#F2C230'];
    // a line of flags along the route, not across it
    for (let i = 0; i < 14; i++) { const z = -3.8 + i * 0.55; b.box(0.02, 0.32, 0.36, 0, 4.7 - Math.sin((i / 13) * PI) * 1.2 - (i / 13) * 1.5, z, cols[i % 5]); }
  },
  stupa: (b, s) => D.chedi(b, s, '#F2EDE2'),
  terrace: b => { for (let i = 0; i < 4; i++) { b.box(8 - i * 1.6, 0.5, 6, 0, 0.25 + i * 0.5, 0, i % 2 ? '#5AA04A' : '#6EB052'); b.box(8 - i * 1.6, 0.06, 6, 0, 0.53 + i * 0.5, 0, '#7FC0C8'); } },
  splitgate: (b, s) => { for (const x of [-1.4, 1.4]) for (let i = 0; i < 6; i++) b.box(2 - i * 0.28, 0.7, 1.2, x + Math.sign(x) * i * 0.14, 0.35 + i * 0.7, 0, i % 2 ? '#8A5A44' : '#A86A50'); },
  bush: b => tree.bush(b),
};
// near: small things close to the path; far: houses and temples further out
export const ASIA_DECOR = {
  japan: { near: [['sakura', 7], ['toro', 5.8], ['bamboo', 6.5], ['sakura', 7.5]], far: [['jhouse', 13], ['sakura', 11], ['jhouse', 17]] },
  china: { near: [['pine', 7], ['redlanterns', 5.8], ['bamboo', 6.5]], far: [['pavilion', 13], ['pine', 11], ['pavilion', 18]] },
  korea: { near: [['pine', 7], ['jarset', 6.2], ['bush', 6.4]], far: [['hanok', 13], ['pine', 11], ['hanok', 18]] },
  thailand: { near: [['palm', 7], ['chedi', 6.4], ['bush', 6.2]], far: [['sala', 13], ['palm', 11], ['chedi', 16]] },
  vietnam: { near: [['hoilantern', 6], ['boat', 9], ['hoilantern', 6]], far: [['karst', 18], ['boat', 13], ['karst', 24]] },
  india: { near: [['palm', 7], ['chhatri', 6.6], ['bush', 6.2]], far: [['colorhouse', 13], ['palm', 11], ['colorhouse', 17]] },
  nepal: { near: [['flagpole', 5.8], ['pine', 7], ['stupa', 7]], far: [['stonehouse', 13], ['pine', 11], ['stonehouse', 17]] },
  indonesia: { near: [['palm', 7], ['splitgate', 7.5], ['bush', 6.2]], far: [['terrace', 15], ['palm', 11], ['terrace', 20]] },
};
const HOUSE_COLORS = ['#E8A23A', '#3E9AB0', '#D85A6A', '#7A5AB0'];
export function decorModel(kind, side, k) {
  const colored = kind === 'colorhouse';
  return model(`asia-dec:${kind}:${side}:${colored ? k : ''}`, b => (colored ? D[kind](b, side, HOUSE_COLORS[(k.length + (side > 0 ? 1 : 0)) % 4]) : D[kind](b, side)), { shadow: false });
}
// things on the water stand lower
export const sunk = kind => (kind === 'boat' ? -0.15 : kind === 'karst' ? -0.6 : 0);

// ------------------------------------------------------------------- gates
// Where a country begins: its gate, with the name. Nothing crosses the route
// below 8.6 m (the Golden Dragon flies at 5.4 m).
const GATES = {
  japan: b => {
    for (const s of [-1, 1]) { b.cyl(0.45, 9.6, s * 4.4, 4.8, 0, '#C8262E', { seg: 14 }); b.cyl(0.6, 0.6, s * 4.4, 0.3, 0, '#2A2226', { seg: 14 }); }
    b.box(10.6, 0.5, 0.6, 0, 8.9, 0, '#C8262E');
    b.box(12.4, 0.55, 0.9, 0, 9.75, 0, '#2A2226');
    for (const s of [-1, 1]) b.box(0.9, 0.5, 0.9, s * 6.2, 10.0, 0, '#2A2226', { rz: -s * 0.35 });
  },
  china: b => {
    for (const x of [-6.4, -4.2, 4.2, 6.4]) { b.box(0.6, 9.4, 0.6, x, 4.7, 0, '#B8262E'); b.box(1, 0.6, 1, x, 0.3, 0, '#9C978E'); }
    b.box(13.6, 0.8, 0.7, 0, 9.2, 0, '#2E6A8A');
    b.box(13.6, 0.12, 0.74, 0, 8.84, 0, PAL.gold);
    roof(b, 15, 2.6, 1.4, 0, 9.6, 0, '#2F6A55', 0.15);
  },
  korea: b => {
    for (const x of [-4.4, 4.4]) { b.cyl(0.4, 9.2, x, 4.6, 0, '#9A2A24', { seg: 12 }); b.box(1.1, 0.5, 1.1, x, 0.25, 0, '#A8A296'); }
    b.box(10.2, 0.9, 0.8, 0, 9.1, 0, '#3E8A70');
    for (let i = 0; i < 8; i++) b.box(1.0, 0.25, 0.84, -4.4 + i * 1.26, 9.1, 0.01, i % 2 ? '#E8463A' : '#F2C230');
    roof(b, 12, 3, 1.5, 0, 9.5, 0, '#3A3D44', 0.18);
  },
  thailand: b => {
    for (const x of [-4.6, 4.6]) { b.box(0.9, 9.4, 0.9, x, 4.7, 0, '#F6F3EC'); b.box(1.1, 0.4, 1.1, x, 9.0, 0, PAL.gold); b.cone(0.5, 2.2, x, 10.3, 0, PAL.gold, { seg: 8 }); }
    b.box(10.2, 0.6, 0.6, 0, 9.4, 0, PAL.gold);
    roof(b, 8, 2, 2.2, 0, 9.7, 0, '#C8402E', 0.1);
    b.cone(0.3, 2.4, 0, 12.6, 0, PAL.gold, { seg: 8 });
  },
  vietnam: b => {
    for (const x of [-4.4, 4.4]) { b.cyl(0.25, 9.4, x, 4.7, 0, '#C9A86A', { seg: 8 }); for (let i = 0; i < 6; i++) b.ball(0.38, x, 2.2 + i * 1.1, 0.45, ['#E8463A', '#F2C230', '#3FA86A'][i % 3], { sy: 1.25, glow: true }); }
    b.cyl(0.25, 9.8, 0, 9.2, 0, '#C9A86A', { seg: 8, rz: PI / 2 });
    b.box(9.4, 0.4, 0.3, 0, 9.65, 0, '#B8262E');
  },
  india: b => {
    for (const s of [-1, 1]) { b.box(2.4, 10.4, 1.4, s * 5.6, 5.2, 0, '#C97C5A'); b.box(1.2, 7.4, 0.2, s * 5.6, 4.6, 0.72, '#E8D8C4'); b.ball(0.9, s * 5.6, 10.9, 0, '#F2EDE2', { sy: 0.9 }); }
    b.ring(4.4, 0.55, 0, 8.7, 0, '#C97C5A', { arc: PI, seg: 24 });
    b.box(13.6, 1.2, 1.4, 0, 13.2, 0, '#C97C5A');
    b.box(13.6, 0.2, 1.45, 0, 12.5, 0, '#F2EDE2');
  },
  nepal: b => {
    for (const x of [-4.4, 4.4]) { b.box(0.7, 9.6, 0.7, x, 4.8, 0, '#6B4429'); }
    b.box(10, 0.7, 0.8, 0, 9.0, 0, '#6B4429');
    roof(b, 11.5, 2.6, 1.0, 0, 9.4, 0, '#8A1E24', 0.4);
    roof(b, 7, 2, 0.9, 0, 10.4, 0, '#8A1E24', 0.2);
    b.cone(0.3, 1.2, 0, 11.8, 0, PAL.gold, { seg: 8 });
    const cols = ['#2E6FD8', '#F6F3EC', '#D8343A', '#3FA86A', '#F2C230'];
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) b.box(0.4, 0.4, 0.02, s * (4.9 + i * 0.6), 8.6 - i * 0.75, 0.3, cols[i % 5]);
  },
  indonesia: b => {
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) b.box(2.6 - i * 0.22, 1.1, 1.6, s * (5.1 + i * 0.11), 0.55 + i * 1.1, 0, i % 2 ? '#8A5A44' : '#A86A50');
    for (const s of [-1, 1]) { b.cyl(0.1, 12, s * 3.9, 6, 0.8, '#C9A86A', { seg: 6, rz: s * 0.08 }); }
    b.box(8.4, 0.25, 0.25, 0, 11.6, 0.8, '#C9A86A');
  },
};
export function gate(k, label) {
  const g = new THREE.Group();
  g.add(model(`asia-gate:${k}`, GATES[k], { shadow: false }));
  const sign = wallSign(label, 0, { w: 512, h: 128, font: 62, pw: 3.6, ph: 0.9, bg: '#2A1416', fg: PAL.gold });
  sign.rotation.y = 0;
  sign.position.set(0, { japan: 9.3, china: 9.2, korea: 9.1, thailand: 8.9, vietnam: 8.9, india: 13.2, nepal: 9.0, indonesia: 11.0 }[k], 0.75);
  g.add(sign);
  return g;
}

// --------------------------------------------------------------- landmarks
// On the horizon, far beyond the fog: their colours are hazed toward the
// country's horizon instead, so they sit in the distance.
let HAZE = null;
const hz = (c, f = HAZE ? HAZE.f : 0) => (HAZE ? '#' + new THREE.Color(c).lerp(HAZE.c, f).getHexString() : c);
function hills(b, n, z0, z1, h0, h1, colA, colB, spread = 340, seed = 1) {
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = -spread + u * spread * 2 + Math.sin(i * 7.1 + seed) * 20, z = z0 + (z1 - z0) * ((i * 37 + seed) % 7) / 6;
    const h = h0 + (h1 - h0) * ((Math.sin(i * 3.3 + seed) + 1) / 2);
    b.ball(h * 1.8, x, -h * 0.15, z, hz(i % 2 ? colA : colB), { sy: h / (h * 1.8), seg: 14 });
  }
}
const LAND = {
  // Mount Fuji, a five-storey pagoda and cherry trees
  japan: b => {
    hills(b, 9, -40, 10, 14, 26, '#7FA06A', '#8AAA74', 340, 2);
    b.cone(190, 96, -30, 48, -150, hz('#4A6AA8', 0.25), { seg: 32 });
    b.cone(86, 43.5, -30, 96 - 21.5, -150, hz('#FFFFFF', 0.05), { seg: 32 });
    const px = 90, pz = 120;
    b.box(14, 3, 14, px, 1.5, pz, hz('#8E8A80'));
    for (let t = 0; t < 5; t++) {
      const y = 3 + t * 6.2, w = 11 - t * 1.4;
      b.box(w, 4.2, w, px, y + 2.1, pz, hz('#E8DCC8'));
      b.box(w + 0.2, 0.8, w + 0.2, px, y + 3.9, pz, hz('#8A2A24'));
      roof(b, w + 6, w + 6, 2.2, px, y + 4.2, pz, hz('#3E4148'), 0.25);
    }
    for (let i = 0; i < 9; i++) b.cyl(1.2 - i * 0.08, 0.6, px, 35 + i * 0.9, pz, hz(PAL.gold), { seg: 10 });
    for (let i = 0; i < 10; i++) b.ball(6, px - 30 + (i % 5) * 14, 7, pz + 14 + Math.floor(i / 5) * 12, hz(i % 2 ? '#F4B6C8' : '#EFA2BA', 0.15), { sy: 0.7 });
  },
  // the Great Wall along the ridges, with its watchtowers
  china: b => {
    const ridge = x => 34 + 16 * Math.sin(x / 48) + 9 * Math.sin(x / 19 + 1);
    const zr = x => -40 + 30 * Math.sin(x / 90);
    for (let x = -330; x <= 330; x += 22) b.ball(48, x, ridge(x) - 46, zr(x) - 8, hz(Math.round(x / 22) % 2 ? '#6E8A58' : '#7A9660', 0.25), { sy: 0.95, seg: 12 });
    hills(b, 7, -160, -120, 50, 80, '#7E92A8', '#8A9CB0', 360, 5);
    let px = -320, py = ridge(-320), pz = zr(-320);
    for (let x = -308, i = 0; x <= 320; x += 12, i++) {
      const y = ridge(x), z = zr(x), dx = x - px, dy = y - py, dz = z - pz, h = Math.hypot(dx, dz);
      const mx = (x + px) / 2, my = (y + py) / 2, mz = (z + pz) / 2;
      b.box(Math.hypot(h, dy) + 0.6, 4.2, 3.6, mx, my + 1.6, mz, hz('#C2B08C', 0.2), { ry: Math.atan2(-dz, dx), rz: Math.atan2(dy, h) });
      if (i % 6 === 3) { b.box(7, 9, 7, x, y + 3.5, z, hz('#B8A27A', 0.2)); b.box(7.6, 1, 7.6, x, y + 8.4, z, hz('#8A7656', 0.2)); }
      px = x; py = y; pz = z;
    }
  },
  // a palace hall in front of the mountains, and the tower on its hill
  korea: b => {
    hills(b, 8, -170, -120, 60, 95, '#7A8C80', '#8898A0', 340, 3);
    hills(b, 9, -40, 0, 12, 20, '#6E9060', '#7A9C6A', 340, 4);
    const z = 80;
    b.box(84, 3, 52, 0, 1.5, z, hz('#B9B3A6')); b.box(66, 3, 42, 0, 4.5, z, hz('#C6C0B4'));
    b.box(54, 14, 28, 0, 13, z, hz('#E8DCC8'));
    for (let i = 0; i < 9; i++) b.box(1.6, 14, 1.6, -24 + i * 6, 13, z + 14.2, hz('#9A2A24'));
    b.box(56, 2, 30, 0, 20.5, z, hz('#3E8A70'));
    roof(b, 70, 42, 7, 0, 21, z, hz('#3A3D44'), 0.3);
    b.box(40, 6, 20, 0, 30, z, hz('#E8DCC8'));
    b.box(42, 1.6, 22, 0, 33, z, hz('#3E8A70'));
    roof(b, 54, 32, 8, 0, 33.5, z, hz('#3A3D44'), 0.25);
    b.ball(60, 150, -20, -60, hz('#6E9060', 0.3), { sy: 0.7 });
    b.cyl(2.4, 62, 150, 52, -60, hz('#F2EDE2', 0.25), { seg: 12 });
    b.cyl(8, 7, 150, 84, -60, hz('#E8E0D0', 0.25), { seg: 16 });
    b.cyl(0.8, 18, 150, 97, -60, hz('#D8D8DC', 0.25), { seg: 8 });
  },
  // Wat Arun by the river: a tall prang with four small ones
  thailand: b => {
    hills(b, 9, -120, -60, 14, 24, '#5E8A50', '#6E9A58', 360, 6);
    b.box(700, 0.4, 70, 0, 0.2, 150, hz('#4E8AA8', 0.15));
    const prang = (x, z, s) => {
      b.box(30 * s, 5 * s, 30 * s, x, 2.5 * s, z, hz('#F2EDE2'));
      b.box(22 * s, 5 * s, 22 * s, x, 7.5 * s, z, hz('#E8DCC8'));
      for (let i = 0; i < 12; i++) {
        const r = (10 - i * 0.75) * s, y = (10 + i * 5.2) * s;
        b.cyl(r, 5.2 * s, x, y + 2.6 * s, z, hz(i % 3 === 2 ? '#E8B84A' : i % 2 ? '#F2EDE2' : '#D8C8B0'), { seg: 12, top: 0.9 });
      }
      b.cone(1.2 * s, 10 * s, x, 75 * s, z, hz(PAL.gold), { seg: 10 });
    };
    prang(0, 40, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) prang(sx * 42, 40 + sz * 30, 0.45);
    for (let i = 0; i < 12; i++) { const x = -160 + i * 28 + (i % 2) * 6, z = 110; b.cyl(0.9, 18, x, 9, z, hz('#8A6A48')); for (let k = 0; k < 6; k++) b.box(11, 0.8, 2.6, x + Math.cos(k) * 5, 18, z + Math.sin(k) * 5, hz('#3E8A3E'), { ry: -k, rz: -0.4 }); }
  },
  // Ha Long Bay: limestone towers rising from the water, a junk with red sails
  vietnam: b => {
    b.box(800, 0.4, 500, 0, -0.3, -50, hz('#3E8C8A', 0.2));
    for (let i = 0; i < 22; i++) {
      const x = -300 + (i * 131 % 600), z = -200 + (i * 71 % 260), h = 25 + (i * 17 % 50), r = 9 + (i % 4) * 4;
      b.cyl(r, h, x, h / 2, z, hz(i % 2 ? '#5E7A5A' : '#6A8462', 0.15 + (200 + z) / 900), { seg: 9, top: 0.72 });
      b.ball(r * 0.78, x, h, z, hz('#4E7A4A', 0.15 + (200 + z) / 900), { sy: 0.7, seg: 10 });
    }
    const jx = 70, jz = 120;
    b.box(10, 3, 30, jx, 1.5, jz, hz('#6B4429')); b.box(8, 2, 8, jx, 4, jz + 10, hz('#8A5A30'));
    for (const [dz, h] of [[-8, 18], [3, 22], [12, 14]]) { b.cyl(0.4, h, jx, h / 2 + 3, jz + dz, hz('#3D2618'), { seg: 6 }); for (let k = 0; k < 6; k++) b.box(0.3, h / 7, h * 0.55, jx, 5 + k * (h / 7.2), jz + dz, hz(k % 2 ? '#C84A2E' : '#D8643A')); }
  },
  // the Taj Mahal over its long pool, with cypresses
  india: b => {
    hills(b, 7, -160, -120, 10, 18, '#B8A27A', '#C2AE88', 360, 8);
    const z = 0, W = '#F6F1E8', I = '#D8CFC0';
    b.box(110, 6, 110, 0, 3, z, hz('#E8DCC8'));
    b.cyl(30, 26, 0, 19, z, hz(W), { seg: 8, ry: PI / 8 });
    for (let k = 0; k < 4; k++) { const a = k * PI / 2; b.box(14, 18, 1, Math.sin(a) * 28.5, 17, z + Math.cos(a) * 28.5, hz(I), { ry: a }); b.ring(6.6, 0.8, Math.sin(a) * 28.8, 26, z + Math.cos(a) * 28.8, hz(I), { arc: PI, ry: a, seg: 14 }); }
    b.cyl(15, 8, 0, 36, z, hz(W), { seg: 20 });
    b.ball(17.5, 0, 48, z, hz(W), { sy: 1.25, seg: 22 });
    b.cone(1.2, 12, 0, 74, z, hz(PAL.gold), { seg: 8 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.ball(5, sx * 18, 36, z + sz * 18, hz(W), { sy: 1.1 }); b.cyl(4, 4, sx * 18, 33, z + sz * 18, hz(W), { seg: 8 });
      const mx = sx * 46, mz = z + sz * 46;
      b.cyl(2.6, 44, mx, 28, mz, hz(W), { seg: 10, top: 0.85 });
      for (const y of [18, 32, 46]) b.cyl(3.4, 1.2, mx, y, mz, hz(I), { seg: 10 });
      b.ball(3, mx, 52, mz, hz(W), { sy: 1.1 });
    }
    b.box(10, 0.6, 180, 0, 0.3, z + 150, hz('#5E9AC8', 0.1));
    for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) b.cone(2.4, 12, sx * 11, 6, z + 72 + i * 18, hz('#2E5A3A', 0.1), { seg: 8 });
  },
  // the Himalaya behind the white dome of the Boudhanath stupa, with its eyes
  nepal: b => {
    const peak = (x, z, r, h) => { b.cone(r, h, x, h / 2, z, hz('#6E7A94', 0.35), { seg: 9 }); b.cone(r * 0.42, h * 0.42, x, h - h * 0.21, z, hz('#F6F8FF', 0.2), { seg: 9 }); };
    peak(-200, -230, 120, 150); peak(-60, -260, 150, 190); peak(90, -240, 120, 160); peak(230, -220, 110, 130); peak(0, -200, 90, 110);
    hills(b, 8, -60, -20, 16, 30, '#7A9A5E', '#869E66', 360, 9);
    const z = 70, Wt = '#F6F3EC';
    for (let i = 0; i < 3; i++) b.box(70 - i * 12, 3, 70 - i * 12, 0, 1.5 + i * 3, z, hz(Wt));
    b.ball(24, 0, 9, z, hz(Wt), { sy: 0.62, seg: 20 });
    b.box(11, 7, 11, 0, 27, z, hz(PAL.gold));
    for (let k = 0; k < 4; k++) { const a = k * PI / 2, ex = Math.sin(a) * 5.6, ez = Math.cos(a) * 5.6; for (const s of [-1, 1]) b.box(2.4, 0.9, 0.3, ex + Math.cos(a) * s * 2, 28, z + ez - Math.sin(a) * s * 2, hz('#1E2A4A'), { ry: a }); }
    for (let i = 0; i < 13; i++) b.cyl(4.6 - i * 0.3, 1.4, 0, 31 + i * 1.4, z, hz(PAL.gold), { seg: 12, top: 0.92 });
    b.cone(3, 3, 0, 51, z, hz(PAL.gold), { seg: 12 });
    const cols = ['#2E6FD8', '#F6F3EC', '#D8343A', '#3FA86A', '#F2C230'];
    for (let line = 0; line < 8; line++) {
      const a = line * PI / 4, ex = Math.sin(a) * 34, ez = Math.cos(a) * 34;
      for (let i = 1; i < 14; i++) { const u = i / 14; b.box(1.6, 1.6, 0.2, ex * u, 50 - 47 * u - Math.sin(u * PI) * 4, z + ez * u, hz(cols[i % 5], 0.1), { ry: a }); }
    }
  },
  // Borobudur, terrace on terrace with its bell stupas, and a smoking volcano
  indonesia: b => {
    b.cone(170, 115, -120, 57, -190, hz('#5E6A58', 0.35), { seg: 24 });
    b.cone(40, 18, -120, 106, -190, hz('#4A4A48', 0.3), { seg: 24 });
    // smoke drifting off with the wind
    for (let i = 0; i < 9; i++) b.ball(10 + i * 2.2, -120 + i * 11 + (i % 2) * 6, 118 + i * 6 + (i % 3) * 3, -190 + (i % 2) * 8, hz(i % 2 ? '#E8E8E8' : '#D8D8D8', 0.3), { sy: 0.55, sz: 0.8 });
    hills(b, 9, -60, -10, 12, 24, '#5AA04A', '#6EB052', 360, 11);
    const z = 60, S = '#8E8A80';
    for (let i = 0; i < 6; i++) b.box(76 - i * 9, 4, 76 - i * 9, 20, 2 + i * 4, z, hz(i % 2 ? S : '#9C978E'));
    for (let ring = 0; ring < 3; ring++) {
      const r = 18 - ring * 5, y = 26 + ring * 3.5, n = 16 - ring * 4;
      b.cyl(r + 3, 3.5, 20, y - 1.5, z, hz('#A8A296'), { seg: 24 });
      for (let i = 0; i < n; i++) { const a = i / n * PI * 2; b.ball(2, 20 + Math.cos(a) * r, y + 1.8, z + Math.sin(a) * r, hz(S), { sy: 1.1 }); b.cone(0.5, 2, 20 + Math.cos(a) * r, y + 4, z + Math.sin(a) * r, hz(S), { seg: 6 }); }
    }
    b.ball(6, 20, 38, z, hz('#9C978E'), { sy: 1.1 }); b.cone(1, 7, 20, 46, z, hz(S), { seg: 8 });
  },
};
export function landmark(k) {
  HAZE = { c: new THREE.Color(ASIA_LOOK[k].fog), f: 0.3 };
  const g = model(`asia-land:${k}`, b => {
    LAND[k](b);
    // the land under the horizon, almost the colour of the haze (and below
    // the water at the route's sides), so the hills stand on something
    const L = ASIA_LOOK[k];
    b.box(1800, 0.4, 900, 0, -0.9, -250, hz(L.side === 'water' ? '#3E8C8A' : L.grass, 0.75));
  }, { shadow: false, far: true });
  HAZE = null;
  return g;
}
