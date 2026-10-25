// Chen's Garden Rush: the numbers every part shares. Metres and seconds; d is
// the distance along the route, x sideways (lanes 0, 1, 2 at -W, 0, +W), y up.

export const C = {
  DT: 1 / 120,           // the run advances in fixed steps, the same at any frame rate
  LANE_W: 2.1,           // between lane centres
  HW: 0.3, HD: 0.3,      // the waiter's half width and half depth for collisions (drawn a bit wider)
  STAND_H: 1.65, SLIDE_H: 0.7,
  G: 22,
  JUMP_V: 7.8,           // about 1.38 m high and 0.71 s in the air
  SPRING_V: 12.3,        // Spring Sneakers: about 3.4 m, over tall obstacles
  FALL_V: 24,            // swipe down in the air
  LANE_T: 0.13,          // one lane change
  SLIDE_T: 0.62,
  STEP: 0.3,             // a surface this much above the feet is stepped onto
  V0: 11, VMAX: 25, VRAMP: 1100,   // about 19 m/s at 1 km, 24 at 3 km
  STUMBLE_T: 0.9, STUMBLE_SLOW: 0.72,
  CHEF_T: 4.5,           // after a stumble the chef stays close this long; a second stumble then ends the run
  INVULN_T: 1.8,
  TRAY_T: 30,
  CART_V: 5,             // carts rolling toward you
  CROSS_V: 3.2,          // trolleys crossing the route
  COYOTE: 0.09,          // a jump just after running off an edge still counts
  BUFFER: 0.14,          // a jump or slide swiped just before landing happens on landing
  DRAGON_Y: 5.4, DRAGON_UP: 0.5, DRAGON_DOWN: 0.8,
  COIN_GAP: 2.2,
  AHEAD: 150,            // the route is built this far ahead
};

// Speed rises with distance and levels off at a fast but playable maximum.
export const speedAt = d => C.V0 + (C.VMAX - C.V0) * (1 - Math.exp(-Math.max(0, d) / C.VRAMP));
export const JUMP_T = 2 * C.JUMP_V / C.G;
export const jumpY = t => C.JUMP_V * t - C.G * t * t / 2;
export const laneX = l => (l - 1) * C.LANE_W;

// Obstacle sizes: D deep, H high, W half width. Collisions use these, a little
// smaller than drawn, so a jump or slide that looks right is right.
export const SIZE = {
  lo: { D: 1.0, H: 0.85, W: 0.8 },
  ov: { D: 0.5, Y0: 1.05, H: 3.6, W: 1.0 },
  ta: { D: 1.5, H: 2.75, W: 0.9 },
  pl: { H: 1.05, W: 0.95 },
  ramp: { D: 3.2 },
  ca: { D: 1.4, H: 1.55, W: 0.8 },
  cr: { D: 1.0, H: 0.8, W: 0.75 },
};

// Power-ups: seconds at upgrade level 0, and what each level adds.
export const POWER = {
  magnet: { T: 10, up: 2 },
  spring: { T: 10, up: 2 },
  dragon: { T: 6, up: 1 },
  double: { T: 14, up: 2 },
};
export const powerTime = (k, level = 0) => POWER[k].T + POWER[k].up * Math.max(0, Math.min(5, level));

// The restaurant for the first ASIA_AT metres, then a journey through Asia,
// one country after the other, a new one every COUNTRY_LEN metres.
export const ZONES = ['dining', 'kitchen', 'storage', 'garden', 'takeaway'];
export const COUNTRIES = ['japan', 'china', 'korea', 'thailand', 'vietnam', 'india', 'nepal', 'indonesia'];
export const ASIA_AT = 4000, COUNTRY_LEN = 4000;
export const outdoors = k => COUNTRIES.includes(k);

// A small seeded random generator: the same seed builds the same route.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
