// Chen's Garden Rush: the restaurant around the route, and the obstacles in it.
// Obstacles stand on the floor at their centre, deep along z; the side the
// waiter sees is +z. Decoration always stays outside the lanes.
import * as THREE from '../vendor/three-0.169.0/three.module.min.js';
import { PAL, model, materials, canvasTex, signTex, toonMat, MAT } from './models.js';
import { C, SIZE } from './rules.js';

const STRIPE = (b, w, x, y, z, h = 0.12, d = 0.03) => {
  // yellow and black: something you have to deal with
  const n = Math.max(2, Math.round(w / 0.24));
  for (let i = 0; i < n; i++) b.box(w / n, h, d, x - w / 2 + (i + 0.5) * w / n, y, z, i % 2 ? '#2A2626' : PAL.hazard);
};

// ------------------------------------------------------------------ obstacles

const OB = {
  crate: b => {
    b.box(1.6, 0.8, 0.95, 0, 0.4, 0, PAL.crate);
    for (const y of [0.06, 0.74]) b.box(1.64, 0.1, 0.99, 0, y, 0, '#8A5A30');
    for (const x of [-0.78, 0, 0.78]) b.box(0.1, 0.8, 0.99, x, 0.4, 0, '#8A5A30');
    b.box(1.66, 0.04, 0.02, 0, 0.4, 0.5, '#8A5A30', { rz: 0.42 });
    for (let i = 0; i < 4; i++) b.ball(0.13, -0.5 + i * 0.33, 0.86, -0.1 + (i % 2) * 0.2, i % 2 ? PAL.leaf : '#6FBF5E', { sy: 0.7 });
  },
  sack: b => {
    const sack = (x, y, z, r = 0) => {
      b.box(0.78, 0.4, 0.92, x, y, z, PAL.sack, { rz: r });
      b.ball(0.36, x, y, z - 0.4, PAL.sack, { sz: 0.35 }); b.ball(0.36, x, y, z + 0.4, PAL.sack, { sz: 0.35 });
      b.box(0.8, 0.09, 0.5, x, y + 0.1, z + 0.02, PAL.red, { rz: r });
    };
    sack(-0.42, 0.2, 0); sack(0.42, 0.2, 0); sack(0, 0.6, 0.02, 0.05);
  },
  boxes: b => {
    const box = (x, y, z, rx, ry, rz) => {
      b.cyl(0.24, 0.34, x, y, z, PAL.paper, { seg: 4, top: 1.3, rx, ry: ry + Math.PI / 4, rz });
      b.box(0.62, 0.06, 0.62, x, y + 0.2 * Math.cos(rz), z, PAL.red, { rx, ry, rz });
    };
    box(-0.5, 0.18, 0.1, 0, 0.2, 0); box(0.08, 0.18, -0.15, 0, -0.3, 0); box(0.6, 0.2, 0.15, 0, 0.5, 0.4);
    box(-0.25, 0.55, 0, 0.3, 0.1, -0.3); box(0.35, 0.55, 0.05, -0.2, 0.7, 0.25);
    b.ring(0.1, 0.012, -0.25, 0.82, 0, '#8A8F96', { arc: Math.PI, seg: 8 });
  },
  trays: b => {
    for (const x of [-0.72, 0.72]) for (const z of [-0.38, 0.38]) b.box(0.05, 0.5, 0.05, x, 0.25, z, '#8A6A3E');
    for (let i = 0; i < 9; i++) b.cyl(0.78, 0.035, (i % 2) * 0.03, 0.53 + i * 0.037, 0, i % 3 ? '#C7CED4' : PAL.paleGold, { seg: 24, sz: 0.6 });
  },
  rack: b => {
    for (const x of [-0.95, 0.95]) b.box(0.06, 3.2, 0.06, x, 2.95, 0, PAL.darkSteel);
    b.box(1.95, 0.3, 0.42, 0, 1.22, 0, PAL.darkWood);
    STRIPE(b, 1.95, 0, 1.12, 0.215);
    b.box(1.95, 0.06, 0.42, 0, 1.9, 0, PAL.darkWood); b.box(1.95, 0.06, 0.42, 0, 2.6, 0, PAL.darkWood); b.box(1.95, 0.06, 0.42, 0, 3.3, 0, PAL.darkWood);
    for (let i = 0; i < 7; i++) { b.cyl(0.07, 0.16, -0.78 + i * 0.26, 1.45, 0, PAL.white, { seg: 10 }); b.cyl(0.08, 0.2, -0.78 + i * 0.26, 2.03, 0, i % 2 ? PAL.paleGold : PAL.white, { seg: 10 }); }
    for (let i = 0; i < 5; i++) b.box(0.3, 0.32, 0.3, -0.7 + i * 0.35, 2.8, 0, i % 2 ? PAL.red : PAL.paper);
    b.box(1.95, 0.08, 0.42, 0, 4.5, 0, PAL.darkSteel);
  },
  utensils: b => {
    for (const x of [-0.95, 0.95]) b.box(0.05, 3.0, 0.05, x, 3.05, 0, PAL.darkSteel);
    b.box(2.0, 0.16, 0.16, 0, 1.6, 0, PAL.steel);
    STRIPE(b, 2.0, 0, 1.6, 0.085, 0.1, 0.02);
    for (let i = 0; i < 6; i++) {
      const x = -0.8 + i * 0.32;
      b.cyl(0.015, 0.3, x, 1.38, 0, '#8A8F96', { seg: 6 });
      if (i % 3 === 0) b.ball(0.11, x, 1.18, 0, '#9AA3AB', { sy: 0.55 });
      else if (i % 3 === 1) b.box(0.16, 0.13, 0.02, x, 1.17, 0, '#9AA3AB');
      else b.ball(0.09, x, 1.2, 0, '#C9952F', { sy: 1.5 });
    }
    b.box(2.0, 1.4, 0.5, 0, 2.5, 0, '#8A939B');
    for (let i = 0; i < 4; i++) b.cyl(0.2, 0.18, -0.7 + i * 0.47, 3.35, 0, '#5C646B', { seg: 14 });
    b.box(2.0, 0.08, 0.5, 0, 4.5, 0, PAL.darkSteel);
  },
  shutter: b => {
    for (const x of [-0.98, 0.98]) b.box(0.12, 3.5, 0.2, x, 2.8, 0, '#5C646B');
    for (let i = 0; i < 14; i++) b.box(1.86, 0.17, 0.08, 0, 1.2 + i * 0.18, (i % 2) * 0.01, i % 2 ? '#A9B2B9' : '#BFC7CD');
    STRIPE(b, 1.86, 0, 1.12, 0.06, 0.14, 0.1);
    b.box(2.1, 0.45, 0.4, 0, 4.3, 0, PAL.red);
  },
  trolleys: b => {
    for (let t = 0; t < 3; t++) {
      const y = t * 0.9;
      b.box(1.7, 0.06, 1.3, 0, y + 0.18, 0, '#9AA3AB');
      for (const x of [-0.75, 0.75]) for (const z of [-0.55, 0.55]) { b.box(0.05, 0.85, 0.05, x, y + 0.6, z, '#7D868D'); b.ball(0.07, x, y + 0.07, z, '#2A2A2E'); }
      for (let i = 0; i < 2; i++) b.box(0.72, 0.5, 1.1, -0.38 + i * 0.76, y + 0.47, 0, (t + i) % 2 ? '#C8443A' : '#3A6EA8');
    }
    b.box(1.72, 0.04, 1.32, 0, 2.72, 0, '#9AA3AB');
  },
  fridge: b => {
    b.box(1.8, 2.72, 1.42, 0, 1.36, 0, '#C9D0D6');
    b.box(0.02, 2.4, 0.02, 0, 1.3, 0.72, '#7D868D');
    for (const x of [-0.12, 0.12]) b.box(0.05, 0.9, 0.06, x, 1.45, 0.74, '#5C646B');
    b.box(1.82, 0.22, 1.44, 0, 2.6, 0, '#8A939B');
    for (let i = 0; i < 6; i++) b.box(0.18, 0.04, 0.02, -0.6 + i * 0.24, 2.6, 0.73, '#4A5258');
    b.box(0.4, 0.14, 0.02, -0.55, 2.2, 0.72, '#7FE0FF', { glow: true });
    b.box(1.8, 0.1, 1.42, 0, 0.05, 0, '#4A5258');
  },
  shelf: b => {
    for (const x of [-0.88, 0.88]) for (const z of [-0.65, 0.65]) b.box(0.07, 2.75, 0.07, x, 1.375, z, '#E0A92E');
    b.box(1.76, 2.7, 0.04, 0, 1.35, -0.64, '#7D868D');
    for (let s = 0; s < 4; s++) {
      const y = 0.08 + s * 0.68;
      b.box(1.8, 0.05, 1.36, 0, y, 0, '#E0A92E');
      for (let i = 0; i < 3; i++) {
        const x = -0.55 + i * 0.55;
        if ((s + i) % 3 === 0) b.box(0.48, 0.5, 1.1, x, y + 0.28, 0, PAL.sack);
        else if ((s + i) % 3 === 1) b.box(0.5, 0.48, 1.0, x, y + 0.27, 0, PAL.crate);
        else for (let j = 0; j < 3; j++) b.cyl(0.13, 0.42, x, y + 0.24, -0.35 + j * 0.35, j % 2 ? PAL.red : '#E3C26A', { seg: 10 });
      }
    }
  },
  vending: b => {
    b.box(1.75, 2.72, 1.3, 0, 1.36, 0, PAL.red);
    b.box(1.35, 1.7, 0.04, -0.12, 1.45, 0.66, '#FFF3D6', { glow: true });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.box(0.3, 0.26, 0.03, -0.52 + c * 0.4, 0.82 + r * 0.42, 0.69, ['#E2B23C', '#C8443A', '#4FA35E', '#F2C3CE'][(r + c) % 4]);
    b.box(0.25, 0.8, 0.04, 0.68, 1.6, 0.66, '#3A2A20');
    b.box(0.16, 0.06, 0.05, 0.68, 1.75, 0.69, PAL.gold, { glow: true });
    b.box(1.75, 0.3, 1.3, 0, 2.55, 0, PAL.gold);
    b.box(1.2, 0.2, 0.04, -0.12, 0.3, 0.66, '#2A2226');
  },
  cart: b => {
    for (const x of [-0.7, 0.7]) for (const z of [-0.55, 0.55]) { b.box(0.05, 1.25, 0.05, x, 0.72, z, PAL.darkSteel); b.cyl(0.11, 0.08, x, 0.11, z, '#2A2A2E', { rz: Math.PI / 2, seg: 12 }); }
    for (const y of [0.32, 0.86, 1.3]) b.box(1.5, 0.05, 1.25, 0, y, 0, PAL.steel);
    b.box(1.3, 0.34, 1.0, 0, 0.53, 0, '#3A6EA8'); b.box(1.3, 0.3, 1.0, 0, 1.03, 0, PAL.red);
    for (let i = 0; i < 4; i++) b.cyl(0.12, 0.05, -0.45 + i * 0.3, 1.36 + (i % 2) * 0.03, 0, PAL.white, { seg: 12 });
    b.box(1.4, 0.05, 0.05, 0, 1.4, 0.62, PAL.darkSteel);
    b.cyl(0.13, 0.18, 0, 1.55, -0.2, PAL.amber, { seg: 12, glow: true });
    b.ball(0.2, 0, 1.55, -0.2, PAL.amber, { glow: 'add' });
    STRIPE(b, 1.5, 0, 0.2, 0.64, 0.1, 0.02);
  },
  trolley: b => {
    for (const x of [-0.65, 0.65]) for (const z of [-0.4, 0.4]) b.cyl(0.09, 0.07, x, 0.09, z, '#2A2A2E', { rz: Math.PI / 2, seg: 12 });
    b.box(1.45, 0.08, 0.95, 0, 0.22, 0, PAL.steel);
    STRIPE(b, 1.45, 0, 0.3, 0.48, 0.12, 0.02);
    b.box(1.3, 0.38, 0.8, 0, 0.47, 0, '#3A6EA8');
    for (let i = 0; i < 4; i++) b.cyl(0.13, 0.04, -0.45 + i * 0.3, 0.7, 0, PAL.white, { seg: 12 });
    b.cyl(0.08, 0.12, 0.6, 0.85, 0, PAL.amber, { seg: 10, glow: true });
    b.ball(0.16, 0.6, 0.85, 0, PAL.amber, { glow: 'add' });
  },
};
export function obstacleModel(variant) { return model(`ob:${variant}`, OB[variant]); }

// A counter or cart platform of length len (metres), 1.05 m high.
const PLAT = {
  counter: (b, len) => {
    b.box(1.9, 0.96, len, 0, 0.48, 0, PAL.lacquer);
    b.box(2.0, 0.1, len + 0.08, 0, 1.0, 0, PAL.darkWood);
    b.box(1.92, 0.05, len, 0, 0.88, 0, PAL.gold);
    for (let z = -len / 2 + 1; z < len / 2; z += 2) for (const x of [-0.96, 0.96]) b.box(0.03, 0.6, 0.6, x, 0.48, z, PAL.gold);
    b.box(1.9, 0.08, 0.02, 0, 0.2, len / 2 + 0.01, PAL.gold, { glow: true });
  },
  steel: (b, len) => {
    for (let z = -len / 2 + 0.4; z <= len / 2 - 0.4; z += Math.max(1.6, (len - 0.8) / Math.max(1, Math.round((len - 0.8) / 2)))) for (const x of [-0.85, 0.85]) b.box(0.07, 0.95, 0.07, x, 0.47, z, PAL.darkSteel);
    b.box(1.9, 0.12, len, 0, 0.99, 0, PAL.steel); b.box(1.8, 0.05, len - 0.3, 0, 0.3, 0, PAL.darkSteel);
    for (let z = -len / 2 + 0.8; z < len / 2; z += 1.4) b.cyl(0.18, 0.2, (z * 7 % 2) > 1 ? 0.45 : -0.45, 0.42, z, '#8A939B', { seg: 12 });
    b.box(1.92, 0.04, len + 0.02, 0, 1.06, 0, '#DDE3E8');
  },
  cartplat: (b, len) => {
    for (let z = -len / 2 + 0.6; z <= len / 2 - 0.6; z += 1.8) for (const x of [-0.75, 0.75]) b.cyl(0.18, 0.12, x, 0.18, z, '#2A2A2E', { rz: Math.PI / 2, seg: 14 });
    b.box(1.9, 0.7, len, 0, 0.62, 0, '#7D868D');
    b.box(1.95, 0.1, len + 0.05, 0, 1.0, 0, '#A9B2B9');
    STRIPE(b, 1.9, 0, 0.5, len / 2 + 0.01, 0.16, 0.02);
    for (let z = -len / 2 + 1; z < len / 2; z += 2.5) b.box(0.6, 0.3, 0.6, (Math.round(z) % 2) ? 0.62 : -0.62, 0.62, z, PAL.crate);
  },
};
export function platformModel(variant, len) {
  const L = Math.round(len * 2) / 2;
  const g = model(`pl:${variant}:${L}`, b => PLAT[variant](b, L));
  g.scale.z = len / L;
  return g;
}
export function rampModel(variant) {
  return model(`ramp:${variant}`, b => {
    // low end toward the waiter (+z), high end against the platform
    const D = SIZE.ramp.D, H = SIZE.pl.H, a = Math.atan2(H, D), len = Math.hypot(H, D);
    const c = variant === 'counter' ? PAL.darkWood : variant === 'steel' ? PAL.steel : '#A9B2B9';
    b.box(1.8, 0.08, len, 0, H / 2, 0, c, { rx: a });
    for (const x of [-0.86, 0.86]) b.box(0.08, 0.03, len, x, H / 2 + 0.05, 0, PAL.hazard, { rx: a });
    for (let z = -D / 2 + 0.3; z < D / 2; z += 0.55) b.box(1.6, 0.03, 0.08, 0, H * (0.5 - z / D) + 0.05, z, PAL.hazard, { rx: a });
    for (const x of [-0.85, 0.85]) b.box(0.06, H, 0.06, x, H / 2, -D / 2 + 0.05, '#5C646B');
  });
}

// ------------------------------------------------------- floors, walls, sky

export const ZONE_LOOK = {
  dining: { fog: '#3B1F1A', sky: '#E8B97A', ground: '#3B2416', light: '#FFD9A0' },
  kitchen: { fog: '#C9D2D4', sky: '#F4F7F8', ground: '#8A939B', light: '#FFF4E0' },
  storage: { fog: '#4A4540', sky: '#E6CDA0', ground: '#3E3A35', light: '#FFE2B0' },
  garden: { fog: '#5D6FA0', sky: '#F0B98C', ground: '#2F4A33', light: '#FFE6C0' },
  takeaway: { fog: '#6E2A24', sky: '#FFE3B8', ground: '#4A2A22', light: '#FFE8C8' },
};

const FLOOR = {
  dining: (g, w, h) => {
    g.fillStyle = '#7A4E2E'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ['#7A4E2E', '#86573A', '#6E4528', '#80532F'][i % 4]; g.fillRect(i * w / 8, 0, w / 8 - 2, h);
      g.fillStyle = '#4A2C18'; g.fillRect(i * w / 8, ((i * 37) % 8) * h / 8, w / 8, 3);
    }
  },
  kitchen: (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#D8DEE1' : '#F2F4F5'; g.fillRect(x * w / 4, y * h / 4, w / 4, h / 4); } g.strokeStyle = '#B8C0C5'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); } },
  storage: (g, w, h) => { g.fillStyle = '#8C877E'; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${i % 2 ? 60 : 200},${i % 2 ? 55 : 195},${i % 2 ? 50 : 185},0.12)`; g.fillRect((i * 97) % w, (i * 57) % h, 3, 3); } g.strokeStyle = '#6E6A62'; g.lineWidth = 4; g.strokeRect(0, 0, w, h); },
  garden: (g, w, h) => { g.fillStyle = '#4C5A4A'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) { g.fillStyle = ['#B9AE98', '#A89D86', '#C3B8A2'][(x + y) % 3]; g.fillRect(x * w / 3 + 4 + (y % 2) * 20, y * h / 4 + 4, w / 3 - 8, h / 4 - 8); } },
  takeaway: (g, w, h) => { g.fillStyle = '#E9DFD0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = ['#C8443A', '#E2B23C', '#5C646B', '#A87A4F'][i % 4]; g.globalAlpha = 0.5; g.fillRect((i * 131) % w, (i * 71) % h, 4 + (i % 3) * 2, 3 + (i % 2) * 2); } g.globalAlpha = 1; },
};
const floorMats = {};
export function floorMat(zone) {
  if (floorMats[zone]) return floorMats[zone];
  const t = canvasTex(`floor:${zone}`, 256, 256, FLOOR[zone], { repeat: [3, 2] });
  return (floorMats[zone] = toonMat({ map: t }));
}
const floorGeo = new THREE.PlaneGeometry(13, 8).rotateX(-Math.PI / 2);
export function floorTile(zone) {
  const m = new THREE.Mesh(floorGeo, floorMat(zone)); m.receiveShadow = true;
  return m;
}
// Thin gold lines between the lanes, so the three lanes read at a glance.
export function laneLines() {
  return model('lanelines', b => {
    for (const x of [-C.LANE_W / 2, C.LANE_W / 2]) b.box(0.05, 0.012, 8, x, 0.006, 0, '#D9A93A');
    for (const x of [-C.LANE_W * 1.5 - 0.15, C.LANE_W * 1.5 + 0.15]) b.box(0.12, 0.014, 8, x, 0.007, 0, '#5A3A24');
  }, { shadow: false });
}

// Walls for 8 m of a zone (both sides). The halls are high (the Golden
// Dragon flies at 5.4 m), so nothing crosses the route between 4.6 and 8.6 m.
const H_TOP = 9;
const WALL = {
  dining: b => {
    for (const s of [-1, 1]) {
      b.box(0.3, 1.2, 8, s * 6.4, 0.6, 0, PAL.darkWood); b.box(0.3, 3.4, 8, s * 6.45, 2.9, 0, PAL.deepRed);
      b.box(0.34, 0.08, 8, s * 6.38, 1.24, 0, PAL.gold); b.box(0.34, 0.08, 8, s * 6.38, 4.6, 0, PAL.gold);
      b.box(0.3, H_TOP - 4.6, 8, s * 6.5, (H_TOP + 4.6) / 2, 0, '#4A1A16');
      b.box(0.5, H_TOP, 0.5, s * 6.2, H_TOP / 2, -3.75, PAL.darkWood); b.box(0.56, 0.12, 0.56, s * 6.2, 4.6, -3.75, PAL.gold);
      for (let z = -2.5; z < 3; z += 2.5) b.box(0.06, 1.7, 1.2, s * 6.28, 2.9, z, PAL.gold), b.box(0.07, 1.5, 1.0, s * 6.27, 2.9, z, PAL.lacquer);
    }
    b.box(13, 0.4, 0.4, 0, H_TOP - 0.5, -3.75, PAL.darkWood);
    b.box(13, 0.1, 8, 0, H_TOP, 0, '#2A1610');
  },
  kitchen: b => {
    for (const s of [-1, 1]) {
      b.box(0.3, H_TOP, 8, s * 6.45, H_TOP / 2, 0, '#E4EAEC');
      for (let y = 0.4; y < 4.4; y += 0.4) b.box(0.32, 0.02, 8, s * 6.43, y, 0, '#C3CBD0');
      b.box(0.34, 0.3, 8, s * 6.4, 0.15, 0, '#8A939B'); b.box(0.34, 0.12, 8, s * 6.4, 4.5, 0, '#8A939B');
      b.cyl(0.2, 8, s * 5.6, 7.2, 0, '#AEB7BE', { rx: Math.PI / 2, seg: 12 });
    }
    b.box(13, 0.1, 8, 0, H_TOP, 0, '#C9D0D4');
    for (const x of [-3.2, 0, 3.2]) b.box(0.4, 0.06, 6, x, H_TOP - 0.06, 0, '#FFFBEA', { glow: true });
  },
  storage: b => {
    for (const s of [-1, 1]) {
      b.box(0.3, H_TOP, 8, s * 6.45, H_TOP / 2, 0, '#7E786E');
      for (let y = 0.3; y < 4.6; y += 0.6) b.box(0.32, 0.03, 8, s * 6.43, y, 0, '#6E685F');
      b.box(0.34, 0.16, 8, s * 6.4, 1.0, 0, PAL.hazard);
      b.cyl(0.13, 8, s * 5.9, 6.4, 0, s > 0 ? '#B85C38' : '#7D868D', { rx: Math.PI / 2, seg: 10 });
      b.cyl(0.09, 8, s * 5.6, 6.8, 0, '#5C646B', { rx: Math.PI / 2, seg: 10 });
    }
    b.box(13, 0.3, 0.3, 0, H_TOP - 0.4, -2, '#5C574F'); b.box(13, 0.3, 0.3, 0, H_TOP - 0.4, 2, '#5C574F');
    b.box(13, 0.1, 8, 0, H_TOP, 0, '#34302B');
    for (const z of [-2, 2]) b.ball(0.3, 0, H_TOP - 0.7, z, '#FFE2B0', { glow: true, sy: 0.4 });
  },
  garden: b => {
    for (const s of [-1, 1]) {
      b.box(0.9, 0.8, 8, s * 6.3, 0.4, 0, '#3F6B3E');
      for (let z = -3.5; z < 4; z += 1) b.ball(0.5, s * 6.3, 0.85, z, z % 2 ? '#4E8A4A' : '#5C9A52', { sy: 0.7 });
      b.box(0.12, 4.0, 0.12, s * 5.6, 2.0, -3.9, PAL.darkWood);
      // string lights along the sides, never across the route
      for (let i = 0; i < 6; i++) b.ball(0.07, s * 5.6, 3.8 - Math.sin((i + 0.5) / 6 * Math.PI) * 0.45, -3.9 + (i + 0.5) * 8 / 6, i % 2 ? '#FFE2A0' : '#FFC77A', { glow: true });
    }
  },
  takeaway: b => {
    for (const s of [-1, 1]) {
      b.box(0.3, H_TOP, 8, s * 6.45, H_TOP / 2, 0, '#D9C3A3');
      b.box(0.34, 0.5, 8, s * 6.4, 3.4, 0, PAL.red); b.box(0.34, 0.05, 8, s * 6.38, 3.1, 0, PAL.gold);
      b.box(0.34, 0.9, 8, s * 6.4, 0.45, 0, '#4A2A22');
      b.box(0.34, 2.6, 8, s * 6.42, 6.6, 0, '#C9AF8C');
    }
    b.box(13, 0.1, 8, 0, H_TOP, 0, '#7A5A44');
    for (const x of [-3, 0, 3]) for (const z of [-2, 2]) b.cyl(0.3, 0.05, x, H_TOP - 0.05, z, '#FFF6DA', { glow: true, seg: 14 });
  },
};
export function wallsModel(zone) { return model(`walls:${zone}`, WALL[zone], { shadow: false }); }

// The rail an overhead obstacle hangs from, across the whole hall.
export function overRail() {
  return model('ovrail', b => {
    b.box(12.8, 0.12, 0.2, 0, 4.56, 0, PAL.darkSteel);
    for (const s of [-1, 1]) b.box(0.3, 0.3, 0.3, s * 6.25, 4.56, 0, PAL.darkSteel);
  }, { shadow: false });
}

// --------------------------------------------------------------- decoration

const lantern = (b, x, y, z, s = 1) => {
  b.ball(0.32 * s, x, y, z, '#E8463A', { sy: 0.85, glow: true });
  b.ball(0.42 * s, x, y, z, '#FF8A50', { sy: 0.8, glow: 'add' });
  b.cyl(0.18 * s, 0.07 * s, x, y + 0.28 * s, z, PAL.gold, { seg: 10 }); b.cyl(0.18 * s, 0.07 * s, x, y - 0.28 * s, z, PAL.gold, { seg: 10 });
  b.cyl(0.02, 0.3 * s, x, y - 0.45 * s, z, PAL.gold, { seg: 4 });
  b.cyl(0.012, H_TOP - y - 0.3, x, (H_TOP + y + 0.3) / 2, z, '#2A2226', { seg: 4 });
};
const DECOR = {
  table: (b, s) => {
    b.cyl(0.75, 0.06, 0, 0.78, 0, PAL.white, { seg: 18 }); b.cyl(0.78, 0.3, 0, 0.62, 0, PAL.white, { seg: 18, top: 0.96 });
    b.cyl(0.08, 0.7, 0, 0.35, 0, PAL.darkWood, { seg: 8 });
    for (const a of [0.6, 2.2, 3.8, 5.3]) { const x = Math.cos(a) * 1.0, z = Math.sin(a) * 1.0; b.box(0.42, 0.06, 0.42, x, 0.46, z, PAL.red); b.box(0.42, 0.55, 0.06, x + Math.cos(a) * 0.2, 0.75, z + Math.sin(a) * 0.2, PAL.darkWood, { ry: -a + Math.PI / 2 }); for (const dx of [-0.17, 0.17]) b.box(0.04, 0.45, 0.04, x + dx, 0.22, z, PAL.darkWood); }
    b.cyl(0.1, 0.08, 0.2, 0.86, 0.1, PAL.white, { seg: 10 }); b.cyl(0.05, 0.14, -0.25, 0.88, -0.1, PAL.jade, { seg: 8 });
  },
  booth: (b, s) => {
    b.box(1.2, 0.5, 2.6, 0, 0.25, 0, PAL.darkWood); b.box(0.9, 0.14, 2.5, -s * 0.1, 0.55, 0, PAL.red);
    b.box(0.3, 1.0, 2.6, s * 0.45, 0.95, 0, PAL.red); b.box(0.36, 0.08, 2.64, s * 0.45, 1.48, 0, PAL.darkWood);
    b.box(0.8, 0.05, 1.2, -s * 1.1, 0.78, 0, PAL.darkWood); b.cyl(0.06, 0.75, -s * 1.1, 0.38, 0, PAL.darkWood, { seg: 8 });
    b.cyl(0.13, 0.25, -s * 1.1, 0.95, 0.2, PAL.paleGold, { seg: 10, top: 0.6, glow: true });
  },
  screen: (b, s) => {
    for (let i = 0; i < 4; i++) {
      const z = -1.2 + i * 0.8;
      b.box(0.06, 2.2, 0.78, 0, 1.1, z, PAL.darkWood);
      for (let y = 0.4; y < 2.1; y += 0.3) b.box(0.08, 0.03, 0.7, 0, y, z, PAL.gold);
      for (let k = -0.3; k <= 0.3; k += 0.2) b.box(0.08, 1.8, 0.03, 0, 1.15, z + k, PAL.gold);
    }
  },
  plant: (b) => { b.cyl(0.32, 0.6, 0, 0.3, 0, '#C95A3A', { seg: 12, top: 1.15 }); for (let i = 0; i < 6; i++) b.ball(0.28, Math.cos(i) * 0.22, 0.95 + (i % 3) * 0.22, Math.sin(i) * 0.22, i % 2 ? PAL.leaf : PAL.green); },
  stove: (b, s) => {
    b.box(1.2, 0.9, 2.6, 0, 0.45, 0, PAL.steel); b.box(1.25, 0.05, 2.65, 0, 0.92, 0, '#DDE3E8');
    for (const z of [-0.65, 0.65]) { b.ring(0.3, 0.04, 0, 0.98, z, '#3A3B40', { rx: Math.PI / 2, seg: 16 }); b.ball(0.34, 0, 1.12, z, '#2E3034', { sy: 0.4 }); b.cone(0.18, 0.3, 0, 0.98, z, '#FF8A30', { glow: true, seg: 10 }); b.ball(0.3, 0, 1.0, z, '#FFB060', { sy: 0.4, glow: 'add' }); }
    b.box(1.4, 0.7, 2.8, s * 0.2, 3.6, 0, '#C9D0D6', { rz: s * 0.15 }); b.box(0.3, 1.4, 0.3, s * 0.45, 4.2, 0, '#C9D0D6');
  },
  prep: (b) => {
    b.box(1.1, 0.06, 2.2, 0, 0.92, 0, PAL.steel); for (const x of [-0.45, 0.45]) for (const z of [-0.95, 0.95]) b.box(0.05, 0.9, 0.05, x, 0.45, z, PAL.darkSteel);
    b.box(1.0, 0.04, 2.0, 0, 0.3, 0, PAL.darkSteel);
    for (let i = 0; i < 3; i++) b.ball(0.13, -0.2 + i * 0.2, 1.05, -0.5, ['#E8463A', '#F2B31B', PAL.leaf][i]);
    b.cyl(0.25, 0.28, 0.1, 1.1, 0.5, '#C9D0D6', { seg: 14 });
  },
  potrack: (b) => { b.box(0.9, 0.05, 2.4, 0, 1.6, 0, PAL.darkSteel); b.box(0.9, 0.05, 2.4, 0, 0.9, 0, PAL.darkSteel); for (const z of [-1.1, 1.1]) b.box(0.05, 1.7, 0.05, 0, 0.85, z, PAL.darkSteel); for (let i = 0; i < 4; i++) { b.cyl(0.2, 0.25, 0, 1.78, -0.9 + i * 0.6, '#8A939B', { seg: 12 }); b.cyl(0.22, 0.2, 0, 1.03, -0.9 + i * 0.6, '#B87333', { seg: 12 }); } },
  shelves: (b) => {
    for (const z of [-1.3, 1.3]) for (const x of [-0.4, 0.4]) b.box(0.06, 3.2, 0.06, x, 1.6, z, '#E0A92E');
    for (let s = 0; s < 4; s++) { const y = 0.1 + s * 0.8; b.box(0.9, 0.05, 2.7, 0, y, 0, '#E0A92E'); for (let i = 0; i < 4; i++) b.box(0.7, 0.5, 0.55, 0, y + 0.28, -1.0 + i * 0.66, (s + i) % 3 ? PAL.crate : PAL.sack); }
  },
  pallet: (b) => { b.box(1.2, 0.14, 1.2, 0, 0.07, 0, '#B08A5A'); for (let i = 0; i < 4; i++) b.box(0.56, 0.4, 0.56, (i % 2) * 0.58 - 0.29, 0.34 + (i > 1 ? 0.4 : 0), (i % 2) * 0.1, i % 3 ? PAL.sack : PAL.crate); },
  bulbs: (b) => { for (const x of [-3.5, 3.5]) { b.cyl(0.01, 4.6, x, 6.7, 0, '#2A2226', { seg: 4 }); b.cone(0.3, 0.25, x, 4.4, 0, '#3E3A35', { seg: 12 }); b.ball(0.12, x, 4.25, 0, '#FFE6A8', { glow: true }); b.ball(0.3, x, 4.2, 0, '#FFD080', { glow: 'add' }); } },
  bamboo: (b) => { b.box(0.9, 0.5, 2.6, 0, 0.25, 0, PAL.wood); for (let i = 0; i < 9; i++) { const z = -1.1 + i * 0.27, h = 2.2 + (i * 7 % 5) * 0.3; b.cyl(0.05, h, (i % 3 - 1) * 0.2, 0.5 + h / 2, z, '#7FAF4E', { seg: 6 }); b.ball(0.22, (i % 3 - 1) * 0.2 + 0.15, 0.5 + h, z, PAL.leaf, { sy: 0.4 }); } },
  parasol: (b) => {
    b.cyl(0.5, 0.05, 0, 0.75, 0, PAL.white, { seg: 14 }); b.cyl(0.05, 0.75, 0, 0.37, 0, PAL.darkWood, { seg: 8 });
    b.cyl(0.03, 2.3, 0, 1.6, 0, PAL.darkWood, { seg: 6 }); b.cone(1.3, 0.45, 0, 2.7, 0, PAL.red, { seg: 8 }); b.cyl(1.3, 0.08, 0, 2.47, 0, PAL.gold, { seg: 8, top: 1.02 });
    for (const a of [0.8, 2.4, 4.0]) b.box(0.4, 0.05, 0.4, Math.cos(a) * 0.85, 0.45, Math.sin(a) * 0.85, PAL.lightWood);
  },
  tree: (b) => { b.cyl(0.4, 0.55, 0, 0.27, 0, '#7D868D', { seg: 10 }); b.cyl(0.08, 1.6, 0, 1.3, 0, '#6B4429', { seg: 8, rz: 0.15 }); for (let i = 0; i < 5; i++) b.ball(0.45, Math.cos(i * 1.3) * 0.45, 2.1 + (i % 2) * 0.3, Math.sin(i * 1.3) * 0.45, i % 2 ? '#3E7A42' : '#4E8E4A', { sy: 0.6 }); },
  counterTA: (b, s) => {
    b.box(1.1, 1.0, 2.8, 0, 0.5, 0, PAL.red); b.box(1.2, 0.08, 2.9, 0, 1.04, 0, PAL.darkWood); b.box(1.12, 0.06, 2.8, 0, 0.85, 0, PAL.gold);
    for (let i = 0; i < 4; i++) { const z = -1.0 + i * 0.66; b.cyl(0.15, 0.2, 0, 1.18, z, PAL.paper, { seg: 4, top: 1.3, ry: Math.PI / 4 }); b.box(0.32, 0.04, 0.32, 0, 1.3, z, PAL.red); if (i % 2) { b.cyl(0.15, 0.2, 0, 1.38, z, PAL.paper, { seg: 4, top: 1.3, ry: Math.PI / 4 }); b.box(0.32, 0.04, 0.32, 0, 1.5, z, PAL.red); } }
    b.box(0.3, 0.4, 0.25, 0, 1.28, 1.2, '#C8A26B');
  },
  vendDecor: (b, s) => {
    b.box(0.9, 2.2, 1.4, 0, 1.1, 0, PAL.red); b.box(0.04, 1.4, 1.1, -s * 0.46, 1.2, 0, '#FFF3D6', { glow: true });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b.box(0.05, 0.25, 0.25, -s * 0.48, 0.8 + r * 0.4, -0.35 + c * 0.35, ['#E2B23C', '#C8443A', '#4FA35E'][(r + c) % 3]);
    b.box(0.92, 0.28, 1.42, 0, 2.1, 0, PAL.gold);
  },
  bench: (b) => { b.box(0.6, 0.08, 2.2, 0, 0.45, 0, PAL.lightWood); for (const z of [-0.9, 0.9]) b.box(0.5, 0.45, 0.08, 0, 0.22, z, PAL.darkWood); b.box(0.08, 0.5, 2.2, 0.27, 0.75, 0, PAL.lightWood); },
};
export function decorModel(kind, side) { return model(`dec:${kind}:${side}`, b => DECOR[kind](b, side), { shadow: false }); }

// Which decoration each zone sets along its walls (x is the distance from the middle).
export const ZONE_DECOR = {
  dining: [['table', 4.6], ['booth', 5.6], ['screen', 6.1], ['plant', 5.7], ['table', 4.6]],
  kitchen: [['stove', 5.6], ['prep', 4.8], ['potrack', 5.8], ['stove', 5.6]],
  storage: [['shelves', 5.7], ['pallet', 4.7], ['shelves', 5.7], ['pallet', 4.9]],
  garden: [['bamboo', 5.5], ['parasol', 4.9], ['tree', 5.0], ['parasol', 4.9]],
  takeaway: [['counterTA', 5.4], ['vendDecor', 5.8], ['bench', 5.6], ['counterTA', 5.4]],
};

// Lanterns over the route in the dining room and the takeaway (high above any obstacle).
export function lanternRow() { return model('lanterns', b => { lantern(b, -3.45, 4.1, 0); lantern(b, 3.45, 4.1, 0); lantern(b, -4.6, 5.2, -4, 0.8); lantern(b, 4.6, 5.2, -4, 0.8); }, { shadow: false }); }
export function bulbRow() { return model('bulbrow', b => DECOR.bulbs(b), { shadow: false }); }

// Wall signs: the brand, 福 and the name of the zone in the player's language.
export function wallSign(text, side, opts = {}) {
  const tex = signTex(text, opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(opts.pw || 2.6, opts.ph || 0.65), mat);
  m.rotation.y = side * -Math.PI / 2;
  return m;
}
export function fuSign() {
  const tex = canvasTex('fu', 128, 128, (g, w) => {
    g.fillStyle = PAL.red; g.save(); g.translate(w / 2, w / 2); g.rotate(Math.PI / 4); g.fillRect(-42, -42, 84, 84); g.restore();
    g.fillStyle = PAL.gold; g.font = `700 60px "Noto Serif SC", "Songti SC", "SimSun", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('福', w / 2, w / 2 + 4);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
}

// A doorway into a zone, with its sign high above the route.
export function doorway(zone, label) {
  const g = new THREE.Group();
  g.add(model(`door:${zone}`, b => {
    if (zone === 'garden') {
      b.ring(7, 0.4, 0, 2, 0, PAL.red, { seg: 56 });
      b.ring(7, 0.14, 0, 2, 0.25, PAL.gold, { seg: 56 });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.ball(0.6, s * (5.4 + i * 0.5), 0.6 + i * 0.3, -0.6, i % 2 ? PAL.leaf : PAL.green, { sy: 0.8 });
    } else {
      const c = { dining: PAL.darkWood, kitchen: '#AEB7BE', storage: PAL.hazard, takeaway: PAL.red }[zone];
      const wall = { dining: PAL.deepRed, kitchen: '#E4EAEC', storage: '#7E786E', takeaway: '#EFE5D3' }[zone];
      for (const s of [-1, 1]) { b.box(0.6, H_TOP, 0.7, s * 3.9, H_TOP / 2, 0, c); b.box(2.4, H_TOP, 0.4, s * 5.4, H_TOP / 2, 0, wall); b.box(0.66, 0.14, 0.76, s * 3.9, 4.6, 0, PAL.gold); }
      b.box(8.4, 1.0, 0.7, 0, H_TOP - 0.6, 0, c);
      b.box(8.4, 0.1, 0.74, 0, H_TOP - 1.15, 0, PAL.gold);
    }
  }, { shadow: false }));
  const sign = wallSign(label, 0, { w: 512, h: 128, font: 60, pw: 4.2, ph: 1.05, bg: zone === 'takeaway' ? '#2A1416' : PAL.lacquer, fg: zone === 'takeaway' ? '#FFB86B' : PAL.gold, neon: zone === 'takeaway' });
  sign.rotation.y = 0; sign.position.set(0, zone === 'garden' ? 7.6 : H_TOP - 1.9, 0.4);
  g.add(sign);
  return g;
}

// The evening sky over the garden terrace.
export function skyDome() {
  const geo = new THREE.SphereGeometry(400, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const col = [], top = new THREE.Color('#2E3B6E'), mid = new THREE.Color('#9B6B9E'), low = new THREE.Color('#F2A66B');
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 400, c = h > 0.35 ? mid.clone().lerp(top, (h - 0.35) / 0.65) : low.clone().lerp(mid, h / 0.35);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  return m;
}
export { MAT, materials };
