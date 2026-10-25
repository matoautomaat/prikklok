// Chen's Garden Rush: the obstacle patterns the route is built from.
//
// Times are in seconds of running at the speed where the pattern is placed,
// so the time to react stays the same as the run speeds up. Lanes are 0, 1, 2
// (left, middle, right); the generator mirrors a pattern at random. Nothing
// stands before t = 0.9 (a calm lead-in) and every pattern can be finished
// from any lane: tests/rush/solver.mjs checks each one at slow, middle and top
// speed with inputs no faster than a person can swipe.
//
//   ['lo', t, lane]          low: crates, rice sacks, takeaway boxes, trays (jump)
//   ['ov', t, lane]          overhead: rack, shutter, utensil bar (slide)
//   ['ta', t, lane]          tall: fridge, storage rack, trolleys, vending machine
//   ['pl', t, lane, T, ramp] a counter or cart platform T seconds long; ramp = walk up
//   ['ca', t, lane]          a service cart rolling toward you; t = where you meet it
//   ['cr', t, dir]           a trolley crossing the route (jump it); dir 1 = to the right
//   ['c', t, lane, n, y]     a line of n coins (y: height, default chest height)
//   ['arc', t, lane]         coins over the jump that clears something at t
//   ['cs', t, from, to, n]   coins leading from one lane to another
//   ['pu', t, lane]          a power-up (the generator picks which, or none)
//   ['sp', t, lane]          a dumpling, fortune cookie or takeaway box (or none)
//
// min: from which difficulty (0 at the start, 1 from about 1.8 km); calm: a
// breather between demanding stretches.

const TOP = 1.95; // coin height on a counter

export const PATTERNS = [
  // ---- breathers
  { id: 'coins-line', min: 0, w: 3, calm: true, T: 2.4, items: [['c', 0.5, 1, 9], ['sp', 1.9, 0]] },
  { id: 'coins-switch', min: 0, w: 3, calm: true, T: 2.6, items: [['cs', 0.5, 0, 2, 11], ['sp', 2.1, 1]] },
  { id: 'power-pocket', min: 0.04, w: 2, calm: true, T: 2.4, items: [['pu', 1.2, 1], ['c', 0.5, 0, 6], ['c', 0.5, 2, 6]] },
  { id: 'calm-tall', min: 0, w: 2, calm: true, T: 2.2, items: [['ta', 1.1, 0], ['c', 0.6, 1, 8], ['sp', 1.6, 2]] },

  // ---- easy
  { id: 'tall-mid', min: 0, w: 3, T: 2.0, items: [['ta', 1.0, 1], ['c', 0.5, 0, 7]] },
  { id: 'low-one', min: 0, w: 3, T: 2.0, items: [['lo', 1.0, 1], ['arc', 1.0, 1], ['c', 0.5, 2, 4]] },
  { id: 'over-one', min: 0, w: 3, T: 2.0, items: [['ov', 1.0, 1], ['c', 0.7, 1, 5, 0.45]] },
  { id: 'tall-pair', min: 0, w: 3, T: 2.0, items: [['ta', 1.0, 0], ['ta', 1.0, 1], ['c', 0.5, 2, 7]] },
  { id: 'low-row', min: 0.05, w: 2, T: 2.2, items: [['lo', 1.1, 0], ['lo', 1.1, 1], ['lo', 1.1, 2], ['arc', 1.1, 1]] },
  { id: 'over-row', min: 0.08, w: 2, T: 2.2, items: [['ov', 1.1, 0], ['ov', 1.1, 1], ['ov', 1.1, 2], ['c', 0.8, 1, 5, 0.45]] },
  { id: 'tall-zig', min: 0.1, w: 3, T: 3.2, items: [['ta', 1.0, 1], ['ta', 2.2, 0], ['ta', 2.2, 2], ['cs', 0.5, 1, 0, 5], ['cs', 1.4, 0, 1, 6]] },
  { id: 'mixed-row', min: 0.12, w: 3, T: 2.2, items: [['ta', 1.1, 0], ['lo', 1.1, 1], ['ov', 1.1, 2], ['arc', 1.1, 1]] },
  { id: 'counter-easy', min: 0.1, w: 2, T: 3.2, items: [['pl', 1.0, 1, 1.6, true], ['c', 1.3, 1, 8, TOP], ['ta', 1.6, 0], ['sp', 2.3, 1]] },

  // ---- medium
  { id: 'jump-slide', min: 0.25, w: 2, T: 3.2, items: [['lo', 1.0, 0], ['lo', 1.0, 1], ['lo', 1.0, 2], ['ov', 2.2, 0], ['ov', 2.2, 1], ['ov', 2.2, 2], ['arc', 1.0, 1]] },
  { id: 'slide-jump', min: 0.28, w: 2, T: 3.2, items: [['ov', 1.0, 0], ['ov', 1.0, 1], ['ov', 1.0, 2], ['lo', 2.1, 0], ['lo', 2.1, 1], ['lo', 2.1, 2], ['arc', 2.1, 1]] },
  { id: 'corridor', min: 0.25, w: 2, T: 3.6, items: [['ta', 0.9, 0], ['ta', 0.9, 2], ['ta', 1.9, 0], ['ta', 1.9, 2], ['ta', 2.9, 0], ['ta', 2.9, 2], ['lo', 1.9, 1], ['arc', 1.9, 1], ['c', 2.4, 1, 4]] },
  { id: 'counter-ramp', min: 0.2, w: 3, T: 3.4, items: [['pl', 1.0, 1, 1.8, true], ['ta', 1.6, 0], ['ta', 2.4, 2], ['c', 1.3, 1, 10, TOP]] },
  { id: 'counter-side', min: 0.3, w: 2, T: 3.2, items: [['pl', 1.0, 0, 1.6, true], ['ov', 1.7, 1], ['ov', 1.7, 2], ['c', 1.3, 0, 8, TOP], ['pu', 2.0, 0]] },
  { id: 'two-counters', min: 0.35, w: 2, T: 3.8, items: [['pl', 1.0, 0, 1.4, true], ['pl', 2.0, 2, 1.4, false], ['ta', 1.8, 1], ['c', 1.3, 0, 6, TOP], ['c', 2.3, 2, 6, TOP]] },
  { id: 'cart-mid', min: 0.3, w: 2, T: 3.2, items: [['ca', 2.4, 1], ['c', 0.6, 1, 6], ['c', 1.6, 0, 5]] },
  { id: 'over-zig', min: 0.3, w: 2, T: 3.2, items: [['ov', 1.0, 0], ['ov', 1.0, 1], ['ta', 2.0, 1], ['ta', 2.0, 2], ['c', 0.8, 1, 4, 0.45], ['cs', 1.4, 1, 0, 5]] },
  { id: 'low-stairs', min: 0.32, w: 2, T: 3.4, items: [['lo', 1.0, 0], ['lo', 1.6, 1], ['lo', 2.2, 2], ['arc', 1.0, 0], ['arc', 1.6, 1], ['arc', 2.2, 2]] },
  { id: 'risky-coins', min: 0.35, w: 2, T: 3.4, items: [['lo', 1.0, 1], ['ov', 1.9, 1], ['ta', 1.4, 0], ['arc', 1.0, 1], ['c', 1.5, 1, 3], ['c', 2.1, 1, 4, 0.45]] },
  { id: 'power-counter', min: 0.2, w: 1, T: 3.0, items: [['pl', 1.0, 2, 1.4, true], ['pu', 2.0, 2], ['c', 1.2, 2, 5, TOP], ['ta', 1.5, 1]] },

  // ---- hard
  { id: 'carts-two', min: 0.55, w: 2, T: 3.6, items: [['ca', 2.0, 0], ['ca', 2.8, 2], ['c', 1.0, 1, 9]] },
  { id: 'cross', min: 0.5, w: 2, T: 3.0, items: [['cr', 1.8, 1], ['arc', 1.8, 1], ['c', 0.6, 0, 4]] },
  { id: 'cart-counter', min: 0.55, w: 2, T: 3.8, items: [['pl', 1.0, 1, 2.0, true], ['ca', 2.4, 0], ['ca', 3.0, 2], ['c', 1.3, 1, 11, TOP]] },
  { id: 'chicane', min: 0.6, w: 2, T: 3.6, items: [['ta', 0.9, 1], ['ov', 1.6, 0], ['lo', 1.6, 2], ['ta', 2.4, 1], ['ta', 2.4, 0], ['arc', 1.6, 2]] },
  { id: 'air-switch', min: 0.6, w: 2, T: 3.0, items: [['lo', 1.0, 0], ['lo', 1.0, 1], ['ta', 1.0, 2], ['ta', 1.7, 0], ['ta', 1.7, 1], ['arc', 1.0, 1]] },
  { id: 'dense-mix', min: 0.7, w: 2, T: 4.2, items: [['ta', 0.9, 0], ['lo', 0.9, 1], ['ta', 1.7, 1], ['ov', 1.7, 2], ['lo', 2.5, 0], ['ta', 2.5, 2], ['ov', 3.3, 1], ['ta', 3.3, 0], ['arc', 0.9, 1], ['c', 1.4, 2, 3, 0.45]] },
  { id: 'counter-gap', min: 0.6, w: 2, T: 3.8, items: [['pl', 1.0, 1, 1.0, true], ['pl', 2.35, 1, 1.0, false], ['ta', 1.3, 0], ['ta', 2.5, 0], ['ta', 1.3, 2], ['ta', 2.5, 2], ['c', 1.2, 1, 5, TOP], ['arc', 2.17, 1]] },
  { id: 'cross-cart', min: 0.75, w: 1, T: 3.6, items: [['cr', 1.4, -1], ['ca', 3.0, 1], ['arc', 1.4, 0], ['c', 2.0, 2, 5]] },

  // ---- expert: quick decisions one after the other, for long runs
  { id: 'zigzag', min: 0.8, w: 2, T: 3.0, items: [['ta', 0.9, 0], ['ta', 0.9, 1], ['ta', 1.6, 1], ['ta', 1.6, 2], ['ta', 2.3, 0], ['ta', 2.3, 1], ['c', 0.5, 2, 3], ['cs', 1.1, 2, 0, 5]] },
  { id: 'jump-then-slide', min: 0.85, w: 2, T: 3.0, items: [['lo', 1.0, 0], ['lo', 1.0, 1], ['lo', 1.0, 2], ['ov', 1.9, 0], ['ov', 1.9, 1], ['ta', 1.9, 2], ['arc', 1.0, 1]] },
  { id: 'cart-alley', min: 0.85, w: 2, T: 3.4, items: [['ca', 2.0, 0], ['ca', 2.0, 2], ['lo', 1.6, 1], ['ov', 2.6, 1], ['arc', 1.6, 1], ['c', 2.4, 1, 3, 0.45]] },
  { id: 'double-cross', min: 0.9, w: 1, T: 3.4, items: [['cr', 1.2, 1], ['cr', 2.3, -1], ['arc', 1.2, 1], ['arc', 2.3, 1]] },
  { id: 'pillar-maze', min: 0.9, w: 2, T: 3.6, items: [['ta', 0.9, 0], ['ov', 0.9, 1], ['ta', 0.9, 2], ['lo', 1.7, 1], ['ta', 1.7, 0], ['ov', 1.7, 2], ['ta', 2.5, 1], ['lo', 2.5, 0], ['lo', 2.5, 2], ['arc', 1.7, 1]] },
  { id: 'stair-run', min: 0.95, w: 1, T: 3.6, items: [['lo', 0.9, 0], ['ov', 1.4, 1], ['lo', 1.9, 2], ['ta', 1.4, 0], ['ta', 1.9, 1], ['ov', 2.5, 2], ['ta', 2.5, 1], ['arc', 0.9, 0], ['arc', 1.9, 2]] },
];

// The first run teaches the controls; it slows down until the right swipe.
export const TUTORIAL = [
  { id: 'tut-lane', T: 3.2, items: [['ta', 1.6, 1, 'lane'], ['c', 0.6, 0, 6], ['c', 0.6, 2, 6]] },
  { id: 'tut-jump', T: 3.0, items: [['lo', 1.6, 0, 'jump'], ['lo', 1.6, 1, 'jump'], ['lo', 1.6, 2, 'jump'], ['arc', 1.6, 1]] },
  { id: 'tut-slide', T: 3.0, items: [['ov', 1.6, 0, 'slide'], ['ov', 1.6, 1, 'slide'], ['ov', 1.6, 2, 'slide'], ['c', 1.2, 1, 5, 0.45]] },
  { id: 'tut-counter', T: 3.6, items: [['pl', 1.2, 1, 1.6, true], ['c', 1.4, 1, 8, TOP], ['ta', 1.6, 0], ['ta', 1.6, 2]] },
  { id: 'tut-tray', T: 2.6, items: [['c', 0.6, 1, 8]], tray: true },
];
