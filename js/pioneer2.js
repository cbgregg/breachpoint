// Pioneer Square, rebuilt (blockout stage). Laid out to the approved plan: 6:10 am, the morning after the city
// sealed off the square. Three lanes run west (1st Ave lot spawn) to east (James St garage spawn):
//   north, Yesler Way: the long lane, broken by a stalled bus and a food truck, covered by the café's and the
//     saloon's upstairs windows;
//   middle, Pioneer Place: the plaza, with the Pioneer Building in the middle (an arcade downstairs, offices
//     upstairs looking over the whole plaza, one outside stair per team), the pergola and the totem;
//   south, Occidental Alley: close quarters behind the hostel, the barber's, the bank and the loading dock;
// and the Seattle Underground beneath the south row: a flank from each spawn to a hall under the plaza.
// Every building is enterable and says what it is; the row buildings have doors on both lanes they face, so
// each row is crossed through them as well as through the alleys between them.
//
// js/world.js builds it from the same pieces as the other street maps. `blockout: true` draws it all in plain
// grey until the layout is signed off, then it gets dressed.
import { undergroundLayout } from './world.js';

const G = 3.4, UP = G + 0.25;        // ground storey height; the upper floor (the ground storey's roof slab top)
const UGD = 3.3;                     // the Underground's depth

// plain concrete steps (0.5 m rises) along x beside a wall; the top step sits under the upper door
const stairX = (topX, z, dir, depth = 2) => Array.from({ length: 7 }, (_, i) => {
  const k = i + 1;
  return [topX - dir * (7 - k) * 0.9, z, 0.9, depth, k * 0.5, 0, 'stairs', { plain: true }];
});

const CENTER = [
  // ================= north row (Yesler Way to the south of it... the plaza to its north) =================
  // z -18.25..-9.25: the 's' wall faces Yesler, the 'n' wall faces Pioneer Place
  // Merchants Café: counter and tables downstairs, the flat upstairs looks down Yesler
  [-31.5, -13.75, 17, 9, G, 0, 'house', { light: 1,
    s: [['d', -5], ['w', 1, 2.4], ['w', 5, 2.4]], n: [['d', -6], ['w', -2, 2], ['w', 5, 2]], e: [['d', -1]], w: [['d', 1], ['w', -2.5, 1.6]],
    props: [['bar', -2, -2.5, 0], ['table', 3, 1], ['table', -5, 1.5], ['table', 6, -2], ['shelf', -7.4, 3, 1]] }],
  [-31.5, -13.75, 17, 9, 3.0, UP, 'house', { light: 1,
    s: [['w', -5], ['w', 0], ['w', 5]], n: [['d', 1.5], ['w', -5]], e: [['w', 0]], w: [['w', 0]],
    props: [['table', -4, 1], ['shelf', 6, 3, 0], ['crates', 5, -2]] }],
  ...stairX(-30, -8.25, 1),
  // the bookshop: tall shelf rows break it into short sightlines
  [-12, -13.75, 14, 9, 3.8, 0, 'house', { light: 1,
    s: [['d', -3], ['w', 3, 2.4]], n: [['d', 4], ['w', -3, 2]], e: [['d', 0]], w: [['d', 2]],
    props: [['shelf', -4, -1.5, 1], ['shelf', -1, -1.5, 1], ['shelf', 2, -1.5, 1], ['shelf', -4, 2.2, 1], ['shelf', 2, 2.2, 1], ['table', 5, 2]] }],
  // the saloon: a long bar, booths, a gallery upstairs over Yesler
  [13, -13.75, 16, 9, G, 0, 'house', { light: 1,
    s: [['d', 3], ['w', -3, 2.4]], n: [['d', 6], ['w', -4, 2]], w: [['d', 0]], e: [['d', 1]],
    props: [['bar', 1, 2.5, 0], ['table', -4, -1.5], ['table', 4, -2], ['table', -6, 2]] }],
  [13, -13.75, 16, 9, 3.0, UP, 'house', { light: 1,
    s: [['w', -5], ['w', 0], ['w', 5]], n: [['d', -4], ['w', 4]], w: [['w', 0]], e: [['w', 0]],
    props: [['table', 3, 1], ['crates', -6, 2.5]] }],
  ...stairX(9, -8.25, -1),
  // the corner shop
  [33, -13.75, 16, 9, 3.6, 0, 'house', { light: 1,
    s: [['d', -2], ['w', 3, 2.4]], n: [['d', 3], ['w', -4, 2]], w: [['d', 0]], e: [['d', 0]],
    props: [['shelf', -4, 0, 1], ['shelf', -1, 0, 1], ['bar', 4, 2.5, 0], ['crates', 5.5, -2.5]] }],

  // ================= Pioneer Place =================
  // the Pioneer Building: an arcade downstairs, the offices upstairs over the whole plaza; one outside stair per
  // team (west for the west team, east for the east), so the offices are contested, not owned
  [0, 0, 12, 10, G, 0, 'house', { light: 1,
    n: [['d', -3], ['d', 3], ['w', 0, 1.6]], s: [['d', -3], ['d', 3], ['w', 0, 1.6]], e: [['d', -2.5]], w: [['d', 2.5]],
    props: [['crates', -3.5, 0], ['crates', 3.5, 0.5], ['table', 0, 0]] }],
  [0, 0, 12, 10, 3.0, UP, 'house', { light: 1,
    n: [['w', -4], ['w', 0], ['w', 4]], s: [['w', -4], ['w', 0], ['w', 4]], e: [['d', 2.5], ['w', -2.5]], w: [['d', -2.5], ['w', 2.5]],
    props: [['table', -3, 2], ['table', 3, -2], ['shelf', -3.5, -3.6, 0], ['shelf', 3.5, 3.6, 0]] }],
  ...Array.from({ length: 7 }, (_, i) => { const k = i + 1; return [-6.45 - (7 - k) * 0.9, -2.5, 0.9, 3, k * 0.5, 0, 'stairs', { plain: true }]; }),
  ...Array.from({ length: 7 }, (_, i) => { const k = i + 1; return [6.45 + (7 - k) * 0.9, 2.5, 0.9, 3, k * 0.5, 0, 'stairs', { plain: true }]; }),
  // the pergola over the Underground stairwell, the totem
  [-12.25, 6, 9, 4.4, 3.8, 0, 'pergola'],
  [16, -3.5, 1.0, 1.0, 15, 0, 'totem'], [16, -3.5, 3.2, 3.2, 0.9, 0, 'railing', { open: 'w' }],
  [-18, -2, 3.2, 0.9, 1.1, 0, 'jersey'], [22, 4, 0.9, 3.2, 1.1, 0, 'jersey'],

  // ================= south row (Pioneer Place to its south... Occidental Alley beyond) =================
  // z 9.25..19.25: the 's' wall faces the plaza, the 'n' wall faces the alley
  // the hostel: a lobby desk downstairs, rooms upstairs, a fire escape down to the alley
  [-32, 14.25, 16, 10, G, 0, 'house', { light: 1,
    s: [['d', -4], ['w', 2, 2.4]], n: [['d', -5], ['w', 4, 2]], e: [['d', 0]], w: [['d', 0]],
    props: [['bar', 3, -2.5, 0], ['table', -3, 1], ['shelf', -6.4, 3, 1]] }],
  [-32, 14.25, 16, 10, 3.0, UP, 'house', { light: 1,
    s: [['w', -5], ['w', 0], ['w', 5]], n: [['d', 2], ['w', -4], ['w', 6]], e: [['w', 0]], w: [['w', 0]],
    props: [['table', -4, -2], ['table', 4, -2], ['crates', -5, 2.5]] }],
  ...stairX(-30, 20.25, 1),
  // the barber's
  [-15.5, 14.25, 13, 10, G, 0, 'house', { light: 1,
    s: [['d', 2], ['w', -3, 2]], n: [['d', -2], ['w', 3, 2]], e: [['d', 0]],
    props: [['shelf', -4, -3.6, 0], ['shelf', 0, -3.6, 0], ['table', 2, 2]] }],
  // the bank: teller counter, the vault at the back
  [16.5, 14.25, 13, 10, 3.8, 0, 'house', { light: 1,
    s: [['d', -2], ['w', 3, 2]], n: [['d', 2], ['w', -3, 2]], w: [['d', 0]],
    props: [['bar', 0, -1, 0], ['shelf', -4, 3.6, 0], ['shelf', 4, 3.6, 0]] }],
  // the loading dock: a stock room, its raised dock out in the alley
  [33.5, 14.25, 15, 10, 4.0, 0, 'house', { light: 1,
    s: [['d', 0], ['w', -4, 2]], n: [['d', -4], ['w', 4, 2.4]], e: [['d', 0]],
    props: [['crates', -4, 1], ['crates', 3, -2], ['shelf', 5, 3.6, 0]] }],
  [36, 21, 9, 3, 1.1, 0, 'dock', { steps: 'n' }], [34, 21.2, 1.4, 1.4, 1.4, 1.1, 'crate'],

  // ================= Yesler Way (north lane) =================
  [0, -24, 12, 2.6, 3.2, 0, 'bus', { livery: 0 }],
  [17, -26.5, 7, 2.4, 3.3, 0, 'truck', { food: 2 }],
  [-18, -27.5, 4.4, 2.0, 1.45, 0, 'car', 0], [32, -21, 4.4, 2.0, 1.45, 0, 'car', 1], [-36, -21, 4.4, 2.0, 1.45, 0, 'car', 1],
  [-27, -24.5, 3.2, 0.9, 1.1, 0, 'jersey'], [27, -27, 3.2, 0.9, 1.1, 0, 'jersey'],
  [-8, -20.5, 2.6, 2.7, 2.8, 0, 'kiosk'], [8, -29.5, 2.6, 2.7, 2.8, 0, 'kiosk'],

  // ================= Occidental Alley (south lane) =================
  [-20, 21, 1.9, 1.35, 1.25, 0, 'dumpster', {}], [6, 21, 1.9, 1.35, 1.25, 0, 'dumpster', { dark: true }],
  [-2, 27, 7, 2.4, 3.3, 0, 'truck', { back: 1 }],
  [-36, 27, 2, 2, 1.2, 0, 'pallet'], [20, 27.5, 1.6, 1.6, 1.6, 0, 'crate'], [20.1, 27.5, 1.3, 1.3, 1.3, 1.6, 'crate'],
  [-12, 26.5, 0.8, 3, 1.1, 0, 'sand'], [27, 28.5, 3, 0.8, 1.1, 0, 'sand'],

  // ================= spawn lots: three ways out of each =================
  [-44, -14, 1, 4, 2.2, 0, 'hesco'], [-44, 4, 1, 4, 2.2, 0, 'hesco'], [-44, 24, 1, 4, 2.2, 0, 'hesco'],
  [44, -14, 1, 4, 2.2, 0, 'hesco'], [44, 4, 1, 4, 2.2, 0, 'hesco'], [44, 24, 1, 4, 2.2, 0, 'hesco'],
  [-51, -2, 2, 2, 1.2, 0, 'ammo'], [51, 2, 2, 2, 1.2, 0, 'ammo'],

  // the edge of the play area
  [0, 33.5, 110, 1, 10, 0, 'boundary'], [0, -33.5, 110, 1, 10, 0, 'boundary'], [54.5, 0, 1, 68, 10, 0, 'boundary'], [-54.5, 0, 1, 68, 10, 0, 'boundary'],
];

// the Underground: in from a stair in each spawn, along under the south row, to a hall under the plaza (two
// stairwells up into it, one under the pergola)
// (built on first use: this module loads while js/world.js is still loading, before the helper's constants exist)
let UG = null;
const ug = () => UG || (UG = undergroundLayout(
  { W: [-46, 11, -36, 16], S1: [-36, 11, -9, 15], P: [-9, 3, 10, 15], S2: [10, 11, 36, 15], E: [36, 11, 46, 16] },
  [['W', 'S1', 13, 2.4], ['S1', 'P', 13, 2.4], ['P', 'S2', 13, 2.4], ['S2', 'E', 13, 2.4]],
  [['W', -46, 13.5, 1], ['P', -9, 6, 1], ['P', 10, 6, -1], ['E', 46, 13.5, -1]],
  UGD));

// the Pioneer Building's offices, for bots: up either outside stair
const offices = {
  y: UP, bounds: { minX: -5.7, maxX: 5.7, minZ: -4.7, maxZ: 4.7 },
  portals: [-1, 1].map(s => ({
    rect: [Math.min(s * 12.5, s * 14), s * 2.5 - 1.5, Math.max(s * 12.5, s * 14), s * 2.5 + 1.5],
    climb: [[s * 13.3, 0, s * 2.5], [s * 12.3, 0.5, s * 2.5], [s * 9.6, 2, s * 2.5], [s * 6.45, 3.5, s * 2.5], [s * 5, UP, s * 2.5], [s * 3, UP, s * 2.5]],
  })),
};

const WEST = [[-48, -27], [-48, -21], [-49, -14], [-49, -6], [-48, 1], [-49, 7], [-48, 20], [-48, 27]];

export const PIONEER2 = {
  id: 'pioneer2',
  name: 'Pioneer Square (blockout)',
  blurb: 'The rebuilt Pioneer Square in plain grey: Yesler Way, Pioneer Place and Occidental Alley, the Pioneer Building\'s offices, the Underground',
  blockout: true,
  get center() { return [...CENTER, ...ug().items]; }, half: [],
  spawns2: [WEST, WEST.map(([x, z]) => [-x, z])],
  spawns: WEST,
  pickups: [
    { type: 'health', pos: [0, UP, 0] }, { type: 'ammo', pos: [-31.5, UP, -13.75] }, { type: 'ammo', pos: [13, UP, -13.75] },
    { type: 'health', pos: [0, -UGD, 9] }, { type: 'ammo', pos: [-15.5, 0, 14] }, { type: 'ammo', pos: [16.5, 0, 12] },
    { type: 'health', pos: [-12, 0, -11.5] }, { type: 'health', pos: [33, 0, -11.5] }, { type: 'ammo', pos: [0, 0, 30] }, { type: 'ammo', pos: [0, 0, -29.5] },
  ],
  sites: [[0, 0], [0, 9, -UGD]],
  get lower() { return [ug().level, offices]; },
  bounds: { hx: 54, hz: 33 },
  facadeFloors: 5, facadeStyle: 'brick',
  look: { photo: { url: 'assets/sky/portland_landing_pad.jpg', u: 0.5991, gain: 1.2 }, sunElev: 44, fog: 0.0017, fogColor: 0xc4d4e4, sun: 4.2, sunColor: 0xfff3e2, hemi: 1.15, hemiSky: 0xcfe0f8, ground: 0x9a958a, exposure: 1.12, env: 1.0 },
  photos: ['assets/loading/pioneer-1.jpg', 'assets/loading/pioneer-2.jpg', 'assets/loading/pioneer-3.jpg'],
};
