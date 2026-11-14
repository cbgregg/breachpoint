// Cannery: a salmon cannery on a spit between two Puget Sound inlets, built to the scale of a Black Ops 2 map
// (measured off Raid: a ~100 x 92 m fighting area with about two fifths of it built over; floors at ground,
// +1 m docks, a 3.45 m upper storey and roofs near 6.7 m, plus a taller landmark or two).
//
// The layout is point-mirrored, so both teams get the same map. The middle is the cannery hall, two storeys:
// the ground floor is the canning line (conveyor tables and shelving to fight between, doors and a roll-up on
// every side), the upper floor is the old packing loft, reached by an outside stair on each long side, with
// windows over the whole yard. Around it, per half: the net shed (bomb site A) and the processing shed (bomb
// site B), a two-storey harbour office with its own outside stair, a raised loading platform, the smokehouse,
// a long warehouse on the waterfront, the cold store and the ice tower, and container stacks between them.
//
// Built with the street-map pieces (houses, blocks, containers, docks, stairs), so it gets the same doors,
// windows, breakable boards and lighting as the other street maps; js/world.js places it.

// the hall: 26 x 18, ground storey 3.2 m (roof slab on top to 3.45), the loft 3.0 m on top of that
const HALL_W = 26, HALL_D = 18, G = 3.2, UP = G + 0.25;

// the external stairs up to an upper storey: 7 steps of 0.5 m along x beside a wall face, top step under the door.
// Plain concrete steps (no railed model): you step off the top sideways, through the door
const stairRun = (topX, z, dir) => Array.from({ length: 7 }, (_, i) => {
  const k = i + 1;
  return [topX - dir * (7 - k) * 0.9, z, 0.9, 3, k * 0.5, 0, 'stairs', { plain: true, k }];
});

const CENTER = [
  // the yard's edge (the sheds and warehouses beyond it are the backdrop)
  [0, 46.4, 102, 1, 10, 0, 'boundary'], [0, -46.4, 102, 1, 10, 0, 'boundary'], [50.4, 0, 1, 94, 10, 0, 'boundary'], [-50.4, 0, 1, 94, 10, 0, 'boundary'],
  // the cannery hall, ground floor: the canning line (doors on every side)
  [0, 0, HALL_W, HALL_D, G, 0, 'house', { light: 1,
    n: [['d', -7], ['d', 0], ['d', 10.5], ['w', -11], ['w', 4.5]],
    s: [['d', 7], ['d', 0], ['d', -10.5], ['w', 11], ['w', -4.5]],
    e: [['d', 0], ['w', -5], ['w', 5]],
    w: [['d', 0], ['w', 5], ['w', -5]],
    props: [['table', -8, 3], ['table', -4, 3], ['table', 4, -3], ['table', 8, -3], ['shelf', -9, -4, 0], ['shelf', 9, 4, 0], ['crates', -2, -5.5], ['crates', 2, 5.5], ['bar', 0, 0, 0]] }],
  // the packing loft on top: windows all round, a door at the head of each outside stair
  [0, 0, HALL_W, HALL_D, 3.0, UP, 'house', { light: 1,
    n: [['d', 2.6], ['w', -10], ['w', -5], ['w', 0], ['w', 7]],
    s: [['d', -2.6], ['w', 10], ['w', 5], ['w', 0], ['w', -7]],
    e: [['w', -5], ['w', 0], ['w', 5]],
    w: [['w', 5], ['w', 0], ['w', -5]],
    props: [['crates', -6, -4], ['crates', 6, 4], ['shelf', -1, 5.5, 0], ['shelf', 1, -5.5, 0], ['table', -9, 4], ['table', 9, -4]] }],
];

// team 1's half (+x); js/world.js adds the point-mirrored copy
const HALF = [
  // outside stair up the hall's north face to the loft door
  ...stairRun(2.6, HALL_D / 2 + 1.5, -1),
  // the net shed (bomb site A): a big open shed of hanging nets and gear
  [30, 21, 20, 13, 4.0, 0, 'house', { light: 1, s: [['d', -6], ['d', 2], ['w', 6]], w: [['d', 1]], e: [['d', -2]], n: [['w', -5], ['w', 5]],
    props: [['shelf', -6, 4, 0], ['shelf', 6, 4, 0], ['crates', -2, 0], ['crates', 5, -2], ['table', 0, 3.5]] }],
  // a raised loading platform in front of it (+1.1 m): the lane between the hall and the net shed gets a high side
  [30, 9.5, 14, 3.5, 1.1, 0, 'dock', { steps: 's', at: -3 }],
  [27, 9.8, 1.6, 1.6, 1.6, 1.1, 'crate'], [33.5, 9.4, 2, 2, 1.2, 1.1, 'pallet'],
  // the processing shed (bomb site B): gutting tables, the slime line
  [24, -22, 18, 12, 3.6, 0, 'house', { light: 1, n: [['d', -5], ['d', 4], ['w', 0]], e: [['d', 0]], w: [['d', -2]], s: [['w', -4], ['w', 4]],
    props: [['table', -4, 0], ['table', 0, 0], ['table', 4, 0], ['shelf', -7, -4, 1], ['crates', 6.5, 3.5]] }],
  // the harbour office: two storeys, an outside stair up its north face
  [37, -8, 9, 8, G, 0, 'house', { light: 1, w: [['d', 0], ['w', 2.5]], s: [['d', 2], ['w', -2]], e: [['w', 0]], n: [['w', -3]],
    props: [['table', -1.5, 1.5], ['shelf', 3, -2.6, 0]] }],
  [37, -8, 9, 8, 3.0, UP, 'house', { light: 1, n: [['d', -3.2], ['w', 2]], w: [['w', 0]], s: [['w', 0]], e: [['w', -1.5], ['w', 1.5]],
    props: [['table', 0, -1.5], ['crates', -2.8, 2.5]] }],
  ...stairRun(33.8, -8 + 4 + 1.5, -1),
  // the smokehouse
  [10, 22.5, 8, 7, 3.4, 0, 'house', { light: 1, e: [['d', 0]], w: [['d', 1]], s: [['w', 0]], props: [['shelf', 0, 2.5, 0], ['crates', -2, -1.5]] }],
  // the long warehouse on the waterfront
  [8, -36, 22, 10, 4.0, 0, 'house', { light: 1, n: [['d', -6], ['d', 3], ['w', 8]], e: [['d', 0]], w: [['d', 1]], s: [['w', -5], ['w', 5]],
    props: [['shelf', -7, -3, 0], ['shelf', -3, -3, 0], ['shelf', 1, -3, 0], ['crates', 6, 2], ['crates', -8, 2.5]] }],
  // the cold store, the gear store and the ice tower: solid, tall, the skyline over the yard
  [12.5, 37.5, 18, 8, 6.5, 0, 'block'],
  [28, 34, 10, 7, 5, 0, 'block'],
  [44, 38, 7, 6, 11, 0, 'block'],
  // container stacks and yard cover between the buildings
  [21, 1.5, 6, 2.6, 2.6, 0, 'container', 0x3e5d74], [21, 1.5, 6, 2.6, 2.6, 2.6, 'container', 0x8a3d2c],
  [16.5, -11, 2.6, 6, 2.6, 0, 'container', 0x4d6b54],
  [44, 19, 2.6, 6, 2.6, 0, 'container', 0x6e7f86],
  [30, -36, 6, 2.6, 2.6, 0, 'container', 0x7a6a3a], [30, -36, 6, 2.6, 2.6, 2.6, 'container', 0x3e5d74],
  [17, 13, 2, 2, 1.2, 0, 'pallet'], [33, 1.5, 1.6, 1.6, 1.6, 0, 'crate'], [33.1, 1.5, 1.3, 1.3, 1.3, 1.6, 'crate'],
  [16, 29, 0.62, 0.62, 0.9, 0, 'barrel'], [16.8, 29.6, 0.62, 0.62, 0.9, 0, 'barrel'], [40, -24, 0.62, 0.62, 0.9, 0, 'barrel'],
  [26, -6, 3.2, 0.9, 1.1, 0, 'jersey'], [6, 14, 0.9, 3.2, 1.1, 0, 'jersey'], [36, -29, 3, 0.8, 1.1, 0, 'sand'],
  [22.5, 41, 1.9, 1.35, 1.25, 0, 'dumpster', {}], [42, -36, 1.9, 1.35, 1.25, 0, 'dumpster', { dark: true }],
  // the spawn yard: staggered HESCO
  [43.5, -15, 1, 4, 2.2, 0, 'hesco'], [43.5, 9, 1, 4, 2.2, 0, 'hesco'], [42.5, -1, 1, 2.4, 2.2, 0, 'hesco'], [45, 27, 3, 1, 2.2, 0, 'hesco'], [45, -28, 3, 1, 2.2, 0, 'hesco'],
  [48, 4, 2, 2, 1.2, 0, 'ammo'],
];

const SPAWNS = [[47, -24], [47, -18], [47, -10], [47, -4], [47, 2], [47, 8], [47, 14], [46, 22], [48, -14], [48, 11]];

// upper storeys for bots: the hall loft and each office's upper floor, each up its outside stair
const level = (cx, cz, w, d, topX, sz, dir) => ({
  y: UP, bounds: { minX: cx - w / 2 + 0.3, maxX: cx + w / 2 - 0.3, minZ: cz - d / 2 + 0.3, maxZ: cz + d / 2 - 0.3 },
  portals: [{
    rect: [Math.min(topX - dir * 7.4, topX - dir * 6.0), sz - 1.4, Math.max(topX - dir * 7.4, topX - dir * 6.0), sz + 1.4],
    climb: [[topX - dir * 6.8, 0, sz], [topX - dir * 5.4, 0.5, sz], [topX - dir * 2.7, 2, sz], [topX, 3.5, sz], [topX, UP, sz - Math.sign(sz - cz) * 1.6], [topX, UP, cz + Math.sign(sz - cz) * (d / 2 - 1.6)]],
  }],
});
const hallUp = level(0, 0, HALL_W, HALL_D, 2.6, HALL_D / 2 + 1.5, -1);
hallUp.portals.push({   // the mirrored stair on the south face
  rect: [-hallUp.portals[0].rect[2], -hallUp.portals[0].rect[3], -hallUp.portals[0].rect[0], -hallUp.portals[0].rect[1]],
  climb: hallUp.portals[0].climb.map(([x, y, z]) => [-x, y, -z]),
});
const officeUp = level(37, -8, 9, 8, 33.8, -8 + 4 + 1.5, -1);
const officeUpM = { y: UP, bounds: { minX: -officeUp.bounds.maxX, maxX: -officeUp.bounds.minX, minZ: -officeUp.bounds.maxZ, maxZ: -officeUp.bounds.minZ },
  portals: officeUp.portals.map(p => ({ rect: [-p.rect[2], -p.rect[3], -p.rect[0], -p.rect[1]], climb: p.climb.map(([x, y, z]) => [-x, y, -z]) })) };

export const CANNERY = {
  id: 'cannery',
  name: 'Cannery',
  blurb: 'A salmon cannery on a Puget Sound spit, built to Black Ops scale: a two-storey cannery hall in the middle, net and processing sheds, a harbour office, docks and container stacks',
  center: CENTER, half: HALF, spawns: SPAWNS,
  pickups: [
    { type: 'health', pos: [-3, 0, 0] }, { type: 'ammo', pos: [3, 0, 0] },
    { type: 'health', pos: [-4, UP, -2] }, { type: 'ammo', pos: [4, UP, 2] },
    { type: 'health', pos: [24, 0, 4.5] }, { type: 'health', pos: [-24, 0, -4.5] },
    { type: 'ammo', pos: [38, UP, -8] }, { type: 'ammo', pos: [-38, UP, 8] },
    { type: 'ammo', pos: [20, 0, -31] }, { type: 'ammo', pos: [-20, 0, 31] },
  ],
  lower: [hallUp, officeUp, officeUpM],
  bounds: { hx: 50, hz: 46 },
  facadeFloors: 2,
  look: { photo: { url: 'assets/sky/abandoned_slipway.jpg', u: 0.3042, gain: 1.2 }, sunElev: 26, fog: 0.0042, fogColor: 0x8a8e8c, sun: 2.8, sunColor: 0xfff0e0, hemi: 1.0, exposure: 0.98 },
  photos: ['assets/loading/cannery-1.jpg', 'assets/loading/cannery-2.jpg', 'assets/loading/cannery-3.jpg'],
};
