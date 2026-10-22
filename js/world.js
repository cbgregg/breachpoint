// Maps (Tarsa Market, Shuran Yard): collision layout + dressed geometry (merged per material), spawns, pickups, nav grid
import * as THREE from 'three';
import { savedQuality } from './config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Box } from './physics.js';
import { NavGrid } from './nav.js';
import { makeTextureSets } from './textures.js';
import { MART } from './supermarket.js';
import { DRIVEIN } from './drivein.js';
import { PROPS, containerVariants, buildingVariants, propFit } from './props.js';
import { buildStation, STATION_LIDS, STATION_LEVELS, YC as STATION_YC, YP as STATION_YP } from './station.js';

// Playable area of the loaded map (set by buildWorld from the layout's bounds; the minimap and nav grid read it)
export const MAP = { minX: -42, maxX: 42, minZ: -30, maxZ: 30 };
const DEFAULT_BOUNDS = { hx: 42, hz: 30 };

// Collision layout. [cx, cz, w(x), d(z), h, y0, kind, extra]
// HALF items are mirrored through the center (x,z) -> (-x,-z) so both teams get the same map.
// 'house' = enterable one-storey building; extra = { n|s|e|w: [[ 'd'|'w', offset, width? ], ...], props, light }
//   (offsets run along +x on the n/s walls and +z on the e/w walls; mirrored copies are rotated for you)
// Lanes are broken up with staggered buildings and walls so there's no straight line across the map:
// fights happen around corners, through doorways and windows.
// Tarsa Market (116 x 80 m), a classic three-lane map. Spawns sit at the two short ends (x = +-54); three
// lanes run between them, each with its own job, split by two rows of buildings with connectors:
//   North / south lanes (14 m wide): on your side one is MARKET STREET (stalls, parked cars, the market
//     hall = bomb site B: medium range), the other is THE YARD (containers, pallets, the warehouse = bomb
//     site A: close quarters). The map is point-mirrored, so each lane is street at one end, yard at the other.
//   Mid lane: a narrower street into the central plaza, where the two-storey centre house (stairs up the
//     side, a roof with parapets) is the power position that has to be fought for.
// Every lane is broken by cover every 10-14 m, alternating sides, so nothing is watched end to end; no
// spot sees down more than one lane. Connectors between the lanes: a gap at the plaza (both teams the same
// distance), a walk-through house and two alleys per side, plus a back street behind each spawn for rotating.
// Everything solid is drawn: no invisible walls, and nothing you can see through blocks bullets.
const TARSA_CENTER = [
  // the centre house: doors on all four sides, a window pair facing each lane end, roof reached by the stairs
  [0, 0, 8, 8, 3.2, 0, 'house', { n: [['d', -2.2], ['w', 1.6, 1.2]], s: [['d', 2.2], ['w', -1.6, 1.2]], e: [['d', 1.6]], w: [['d', -1.6]], props: [['table', 0, 0], ['shelf', 1.5, 2.6, 0], ['shelf', -1.5, -2.6, 0]], light: 1 }],
  // one-off landmarks out of the way of play: each end of the market reads differently
  [-56.5, 38.5, 0.5, 0.5, 6, 0, 'palm'],
  [56.5, -38.5, 0.5, 0.5, 6, 0, 'palm'],
];
const TARSA_HALF = [
  // centre house roof: parapets, open on the stair side
  [0, 3.95, 8.2, 0.3, 0.6, 3.45, 'parapet'],
  [3.95, 1.6, 0.3, 4.8, 0.6, 3.45, 'parapet'],
  // ================= mid lane (z -11..11) =================
  // plaza edge: low walls that give the plaza cover without closing it
  [9, 7.5, 0.6, 5, 1.1, 0, 'wall', 0],
  [10, -6.5, 3, 0.8, 1.1, 0, 'sand'],
  // mid street: low market arcades on alternating sides, so the lane bends instead of running straight
  [27.5, 9.25, 7, 5.5, 3.2, 0, 'house', { s: [['d', -1.6], ['w', 1.6]], w: [['d', -1.2]], e: [['w', 1.3]], props: [['crates', 2, 0.8]] }],   // against the north divider
  [15.5, -9.25, 7, 5.5, 3.2, 0, 'house', { n: [['d', 1.6], ['w', -1.6]], e: [['d', 1.2]], w: [['w', -1.3]], props: [['shelf', -1.6, 0, 1]] }], // against the south divider
  [19, -2.5, 4.4, 2.0, 1.45, 0, 'car', 0],
  [26, 1.5, 2.6, 6, 2.6, 0, 'container', 0x4d6b54],   // cuts the long diagonals from the spawn corners across mid
  [37, 2.6, 1.6, 1.6, 1.6, 0, 'crate'], [37.2, 2.6, 1.4, 1.4, 1.4, 1.6, 'crate'],
  [33.5, 5, 4.4, 2.0, 1.45, 0, 'car', 1],
  // tall breakers: market kiosks and a container, so the mid street is never one long line
  [16, 4.9, 3, 3.4, 3, 0, 'kiosk'],
  [22, -5, 3, 3, 3, 0, 'kiosk'],
  [33.5, -0.5, 3, 6.2, 3, 0, 'kiosk'],
  [44, -6, 2.6, 5, 2.6, 0, 'container', 0x6b7a3a],
  [38.5, -7, 2, 2, 2.4, 0, 'pallet'], [30, -6, 2, 2, 2.4, 0, 'pallet'],
  // ================= north divider (z 12..23): walk-through house, alleys =================
  [7, 17.5, 8, 11, 9, 0, 'block'],                      // x 3..11; the gap x -3..3 is the plaza connector
  [18.5, 17.5, 11, 11, 3.4, 0, 'house', { s: [['d', -3]], n: [['d', 3]], w: [['w', 0]], e: [['w', 0]], props: [['shelf', 0, 0, 1], ['crates', 3.6, -2.4]] }], // x 13..24: dog-leg through the house
  [29, 17.5, 10, 11, 12, 0, 'block'],                   // x 24..34 (tall landmark)
  [41, 17.5, 8, 10, 7, 0, 'block'],                     // x 37..45; alley x 34..37, back street past x 45
  [35.5, 14, 1.6, 1.6, 1.6, 0, 'crate'],                // alley cover (breaks the straight look through)
  [36.2, 21, 1.35, 1.9, 1.25, 0, 'dumpster', { flip: true }],
  // lane edges: cover hard against the divider walls, so nobody can hug a wall and see down a whole lane
  [29.5, 23.8, 1.6, 1.6, 1.6, 0, 'crate'], [31.1, 23.8, 1.6, 1.6, 1.6, 0, 'crate'], [30.3, 23.8, 1.4, 1.4, 1.4, 1.6, 'crate'],
  [12, -23.8, 1.6, 1.6, 1.6, 0, 'crate'], [12.2, -23.8, 1.4, 1.4, 1.4, 1.6, 'crate'],
  // ================= south divider (z -23..-12) =================
  [6.5, -17.5, 7, 11, 3.4, 0, 'house', { n: [['d', 1.6]], s: [['d', -1.6]], e: [['w', 0]], props: [['table', -1.2, 0]] }], // x 3..10, walk-through
  [15.5, -17.5, 11, 11, 10, 0, 'block'],                // x 10..21
  [27.5, -17.5, 9, 11, 8, 0, 'block'],                  // x 23..32; alley x 21..23
  [40, -17.5, 10, 10, 11, 0, 'block'],                  // x 35..45; alley x 32..35
  [33.5, -21, 0.8, 3, 1.1, 0, 'sand'],
  [34.2, -15, 1.35, 1.9, 1.25, 0, 'dumpster', { dark: true }],
  // ================= north lane (z 24..39): market street, bomb site B in the market hall =================
  [22, 35, 12, 10, 4.2, 0, 'house', { s: [['d', -3], ['d', 3], ['w', 0, 2]], w: [['d', -1]], e: [['d', 1]], props: [['shelf', -3.5, 2.8, 0], ['crates', 4.2, 2.8], ['shelf', 3.5, -2.4, 0]], light: 1 }], // x 16..28, z 30..40
  [6, 27, 2.4, 0.9, 0.9, 0, 'stall', 1],
  [10, 35.5, 4.4, 2.0, 1.45, 0, 'car', 1],
  [36, 30, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [8, 24.3, 3, 2.6, 3, 0, 'kiosk'],                      // against the divider: breaks the wall-hugging line
  [41, 24.3, 3, 2.6, 3, 0, 'kiosk'],
  [12, 28.5, 2.5, 3.5, 3, 0, 'kiosk'],
  [24, 26.5, 3, 2, 3, 0, 'kiosk'],
  [8, 33, 2, 2, 2.4, 0, 'pallet'],
  [40, 35.5, 7, 2.6, 2.6, 0, 'container', 0x3e5d74],
  [14, 25.5, 3, 0.8, 1.1, 0, 'sand'],
  // ================= south lane (z -39..-24): the yard, bomb site A in the warehouse =================
  [20, -34.5, 12, 11, 4.2, 0, 'house', { n: [['d', -3.5], ['w', 1, 2]], w: [['d', 1.5]], e: [['d', -1.5], ['w', 2.5]], props: [['crates', -3.6, -2.6], ['shelf', 3, 0.5, 1], ['crates', -0.5, -3]], light: 1 }], // x 14..26, z -38..-28
  [6, -31, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [6, -31, 7, 2.6, 2.6, 2.6, 'container', 0x6e7f86],
  [5, -26, 2, 2, 2.4, 0, 'pallet'],
  [26, -24.3, 3, 2.6, 3, 0, 'kiosk'],
  [31, -28, 2.6, 5, 2.6, 0, 'container', 0x7a6a3a],
  [36, -35, 7, 2.6, 2.6, 0, 'container', 0x4d6b54],
  [41.5, -27, 2, 2, 1.2, 0, 'pallet'],
  [11, -36.5, 0.62, 0.62, 0.9, 0, 'barrel'], [11.8, -36.2, 0.62, 0.62, 0.9, 0, 'barrel', 1],
  // ================= spawn (x 46..57): lane exits shielded, a back street for rotating =================
  [48, 31, 1, 4, 3.5, 0, 'hesco'],
  [48.5, 0, 1, 5, 3.5, 0, 'hesco'],
  [48, -31, 1, 4, 3.5, 0, 'hesco'],
  [52.5, 17.5, 6, 1, 3.5, 0, 'hesco'],
  [52.5, -17.5, 6, 1, 3.5, 0, 'hesco'],
  [56.5, 8, 3, 1, 3.5, 0, 'hesco'], [56.5, -8, 3, 1, 3.5, 0, 'hesco'],
  [47.5, 9, 4, 1, 3.5, 0, 'hesco'], [47.5, -9, 4, 1, 3.5, 0, 'hesco'],
  [55, 25, 2, 2, 1.2, 0, 'ammo'],
  // lights: festoons over the mid street, lamps in the halls
  [24, 0, 0, 0, 0, 0, 'lights', [24, 6, 24, -6]],
  [36, 0, 0, 0, 0, 0, 'lights', [36, 6, 36, -6]],
  [22, 35, 0, 0, 0, 0, 'light', 3.8],
  [20, -34.5, 0, 0, 0, 0, 'light', 3.8],
  // perimeter (dressed by the facades around the map)
  [0, 40.5, 118, 1, 10, 0, 'boundary'],
  [58.5, 0, 1, 82, 10, 0, 'boundary'],
];
for (let k = 1; k <= 7; k++) TARSA_HALF.push([4 + (7.5 - k) * 0.9, -2.5, 0.9, 3, k * 0.5, 0, 'stairs', k]);

const TARSA_SPAWNS = [[54, -32], [54, -21], [54, -10], [54, 0], [54, 10], [54, 21], [54, 32], [51, -6], [51, 6], [51, 25]];

const TARSA_PICKUPS = [
  { type: 'health', pos: [0, 3.45, 0] },
  { type: 'health', pos: [19.25, 0, 17.5] },
  { type: 'health', pos: [-17.75, 0, -17.5] },
  { type: 'health', pos: [31, 0, -8.5] },
  { type: 'health', pos: [-31, 0, 8.5] },
  { type: 'ammo', pos: [6.5, 0, -17.5] },
  { type: 'ammo', pos: [-6.5, 0, 17.5] },
  { type: 'ammo', pos: [40, 0, 30] },
  { type: 'ammo', pos: [-40, 0, -30] },
  { type: 'ammo', pos: [20, 0, 8.5] },
  { type: 'ammo', pos: [-20, 0, -8.5] },
];

// Map "Shuran Yard": three lanes. North lane (market street), mid lane (yard), south lane (container
// stacks). Each lane has staggered cover so it can't be watched end to end; the dividers are rows of
// houses, blocks and containers you can cut through.
const SHURAN_CENTER = [
  [0, 0, 0, 0, 0, 0, 'light', 4],
  [0, 0, 1.6, 1.6, 1.6, 0, 'crate'],
  [0.15, 0.1, 1.4, 1.4, 1.4, 1.6, 'crate'],
];
const SHURAN_HALF = [
  // north divider (z 6..12)
  [0, 9, 6, 6, 3.2, 0, 'house', { n: [['d', -1]], s: [['d', 1]], e: [['w', 0]], w: [['w', 0]], props: [['shelf', 0, 0, 0]] }],
  [6, 9, 6, 6, 6, 0, 'block'],
  [14.5, 9, 7, 6, 3.2, 0, 'house', { n: [['d', 1.5]], s: [['d', -1.5]], e: [['w', 0]], w: [['w', 0]], props: [['crates', -2, 1.2], ['shelf', 0, 0, 0]] }],
  [21.5, 7.7, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [21.5, 10.3, 7, 2.6, 2.6, 0, 'container', 0x3e5d74],
  [21.5, 9, 7, 2.6, 2.6, 2.6, 'container', 0x6b7a3a],
  // south divider (z -12..-6)
  [6.5, -7.7, 7, 2.6, 2.6, 0, 'container', 0x3e5d74],
  [6.5, -10.3, 7, 2.6, 2.6, 0, 'container', 0x7a6a3a],
  [6.5, -9, 7, 2.6, 2.6, 2.6, 'container', 0x8a3d2c],
  [16, -9, 8, 6, 5, 0, 'block'],
  [24, -9, 6, 6, 3.2, 0, 'house', { n: [['d', -1]], s: [['d', 1]], e: [['w', 0]], w: [['w', 0]], props: [['shelf', 0, 0, 0], ['table', 1.2, -1.6]] }],
  // mid lane (z -6..6): a container + crates on one side, a small house on the other
  [5, -3, 0.62, 4, 1.07, 0, 'jersey'],
  [11, 2.5, 7, 2.6, 2.6, 0, 'container', 0x4d6b54],
  [9, 4.5, 1.5, 1.5, 2.2, 0, 'crate'],
  [12.5, 4.5, 1.5, 1.5, 2.2, 0, 'crate'],
  [27.5, 3.5, 1, 3, 3.5, 0, 'hesco'],
  [11, 0.2, 3, 0.8, 1.1, 0, 'sand'],
  [21, -3, 6, 6, 3.2, 0, 'house', { w: [['d', -1]], e: [['d', 1]], n: [['w', 0]], s: [], props: [['crates', 1.5, -1.5], ['shelf', 0, 0, 1]] }],
  [27.5, 0, 0.8, 3, 1.1, 0, 'sand'],   // continues the hesco's line, a peek gap between
  // north lane (z 12..30)
  [6, 18, 4.4, 2.0, 1.45, 0, 'car', 0],
  [3.5, 23.5, 4, 0.6, 1.2, 0, 'wall', 3],
  [12, 21, 7, 6, 3.2, 0, 'house', { w: [['d', -1]], e: [['d', 1]], n: [['w', 0]], s: [['w', -1.5]], props: [['shelf', 0, 0, 1]] }],
  [20, 15, 0.6, 6, 2.4, 0, 'wall', 1],
  [24, 25.5, 0.8, 3, 1.1, 0, 'sand'],
  [25, 15.2, 1.5, 1.5, 1.5, 0, 'crate'],
  [9.5, 28.4, 2.4, 0.9, 0.9, 0, 'stall', 0],
  [22, 27.6, 2.4, 0.9, 0.9, 0, 'stall', 1],
  [17.2, 28.7, 2, 2.6, 1.8, 0, 'crate'],
  [17.4, 25.6, 0.62, 0.62, 0.9, 0, 'barrel'],
  // south lane (z -30..-12): container yard
  [8, -20, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [8, -20, 7, 2.6, 2.6, 2.6, 'container', 0x3e5d74],
  [14.5, -15.5, 2.6, 7, 2.6, 0, 'container', 0x6e7f86],
  [20, -23.5, 2.6, 7, 2.6, 0, 'container', 0x7a6a3a],
  [26, -16.5, 1.6, 1.6, 1.6, 0, 'crate'],
  [27.8, -16.5, 1.6, 1.6, 1.6, 0, 'crate'],
  [12, -27, 2, 2, 2, 0, 'pallet'],
  [3, -24, 0.8, 3, 1.1, 0, 'sand'],
  [4, -29, 2, 2, 1.8, 0, 'crate'],
  // spawn
  [28.5, 9, 3, 1, 3.5, 0, 'hesco'],
  [29.5, -14, 2, 1, 3.5, 0, 'hesco'],
  [31.5, 19, 1, 4, 3.5, 0, 'hesco'],
  [31.5, 0, 1, 4, 3.5, 0, 'hesco'],
  [31.5, -19, 1, 4, 3.5, 0, 'hesco'],
  [37, 9, 2, 2, 1.2, 0, 'ammo'],
  [40, 27.4, 0.5, 0.5, 6, 0, 'palm'],
  [40, -27.4, 0.5, 0.5, 6, 0, 'palm'],
  // lights
  [9, 0, 0, 0, 0, 0, 'lights', [8.5, 5.9, 8.5, -5.9]],
  [17.5, 0, 0, 0, 0, 0, 'lights', [17.5, 5.9, 17.5, -5.9]],
  [15, 0, 0, 0, 0, 0, 'light', 3.6],
  // perimeter
  [0, 30.5, 86, 1, 8, 0, 'boundary'],
  [42.5, 0, 1, 62, 8, 0, 'boundary'],
];
const SHURAN_SPAWNS = [[38, -24], [38, -15], [38, -5], [38, 5], [38, 15], [38, 24], [35, -11], [35, 11]];
const SHURAN_PICKUPS = [
  { type: 'health', pos: [0, 0, 20] },
  { type: 'health', pos: [0, 0, -20] },
  { type: 'health', pos: [0, 0, 3.4] },
  { type: 'health', pos: [0, 0, -3.4] },
  { type: 'ammo', pos: [14.5, 0, 9.75] },
  { type: 'ammo', pos: [-14.5, 0, -8.25] },
  { type: 'ammo', pos: [11, 0, -9] },
  { type: 'ammo', pos: [-11, 0, 9] },
];

// Pioneer Square (108 x 80 m): Seattle's 1890s brick district. A cobbled plaza with the iron pergola, totem
// pole and plane trees in the middle, streetcar avenues either side, Romanesque brick blocks beyond. Bomb site
// A is down in King Street Station (the light rail stop under the plaza, reached by two stairwells; trains run
// through it); site B is inside the corner tavern.
// ---------- Pioneer Square, on the real street plan ----------
// Game axes: +x east, +z south. 1st Avenue runs north-south (x -22..-8 curb to curb), Yesler Way east-west
// (z 8..22). Pioneer Place is the triangle east of 1st Ave and north of Yesler; its east side is the old street
// in front of the Pioneer Building, which stands at the downtown grid's angle (32 degrees) on the NE corner of
// 1st & James. James St leaves the plaza's south-east corner at the same angle, uphill to the ENE, between the
// Pioneer Building and the "Sinking Ship" garage on the old Seattle Hotel's wedge. The pergola stands at the
// plaza's south end over one of the two stairwells down to King Street Station, the Link light rail stop under
// the plaza (js/station.js; bomb site A is on its northbound platform).
// Smith Tower rises up Yesler to the east.
const PS_A = 32 * Math.PI / 180;
const PS_D = [Math.cos(PS_A), -Math.sin(PS_A)];            // along James St (ENE)
const PS_U = [-Math.sin(PS_A), -Math.cos(PS_A)];           // along the Pioneer Building's plaza front (NNW)
const PS_V = [20, 4];                                       // plaza's south-east corner: James St's south curb meets Yesler's sidewalk
const psAt = (s, t, o = PS_V) => [o[0] + PS_U[0] * s + PS_D[0] * t, o[1] + PS_U[1] * s + PS_D[1] * t];
const PS_B0 = psAt(14, 2);                                  // Pioneer Building's plaza / James corner (3 m sidewalk, 2 m forecourt)
const PS_JAMES = psAt(5.5, 0);                              // James St centre line where it meets the plaza
const PS_XF = (o) => ({ x: o[0], z: o[1], a: PS_A });
// garage wedge: James St's south sidewalk line (3 m off the curb) down to Yesler's sidewalk, east to the map edge
const PS_SW = [PS_V[0] - PS_U[0] * 3, PS_V[1] - PS_U[1] * 3];
const psSouthWalk = (x) => PS_SW[1] - (x - PS_SW[0]) * Math.tan(PS_A);
const PS_GARAGE = [[PS_SW[0] + (PS_SW[1] - 4) / Math.tan(PS_A), 4], [42, 4], [42, psSouthWalk(42)]];
const psHyp = (z) => PS_V[0] + (z - PS_V[1]) * Math.tan(PS_A); // the plaza's east edge (x) at a given z
// street signs in the "Road Signs" pack: mesh node numbers
const ROAD_SIGNS = { noparking: 4, detour: 50, towaway: 56, roadwork: 58, pedestrian: 68, parking: 80 };
const PIONEER_CENTER = [
  // ---- Pioneer Place: granite paving (runs on under the building fronts), King Street Station beneath it
  [8.5, -16.5, 25, 41, 0, 0, 'paving'],
  [0, 0, 0, 0, 0, 0, 'station'],
  [-2.75, 3.5, 6.5, 2.4, -STATION_YC, 0, 'stairdown', { dir: 1 }],
  [15.25, 3.5, 6.5, 2.4, -STATION_YC, 0, 'stairdown', { dir: -1 }],
  [3.5, 3.5, 4.2, 3.4, 0, 0, 'prism'], [9.2, 3.5, 4.2, 3.4, 0, 0, 'prism'],
  [15.25, 3.5, 9, 4.4, 3.8, 0, 'pergola'],
  // the totem pole, plane trees, benches, lamps, a few planters and the information kiosk
  [1.5, -21, 1.0, 1.0, 15, 0, 'totem'], [1.5, -21, 3.2, 3.2, 0.9, 0, 'railing', { open: 's' }],
  [-1.5, -6, 0, 0, 9, 0, 'tree'], [6.5, -6.5, 0, 0, 9.5, 0, 'tree'], [-1.5, -14, 0, 0, 10, 0, 'tree'], [5, -14.5, 0, 0, 9, 0, 'tree'], [-1.8, -27, 0, 0, 9, 0, 'tree'],
  [2.2, -9.5, 1.8, 0.6, 0.95, 0, 'bench'], [-2.4, -19, 1.8, 0.6, 0.95, 0, 'bench'], [9.5, -1.8, 1.8, 0.6, 0.95, 0, 'bench'],
  [-3.2, -2.5, 0, 0, 0, 0, 'vlamp'], [11, -5, 0, 0, 0, 0, 'vlamp'], [-3.2, -23, 0, 0, 0, 0, 'vlamp'], [4.5, -0.6, 0, 0, 0, 0, 'vlamp'],
  [8.5, -10.5, 2.2, 1.6, 2.6, 0, 'infokiosk'],
  [1.5, -2, 1.3, 1.3, 0.75, 0, 'planter'], [-1, -31.5, 1.3, 1.3, 0.75, 0, 'planter'], [11.5, -0.5, 1.3, 1.3, 0.75, 0, 'planter'],
  // cover in the plaza: a coffee cart, crates by the kiosk
  [2.5, -15.5, 2.4, 0.9, 0.9, 0, 'stall', 0], [5.2, -2.6, 1.6, 1.6, 1.6, 0, 'crate'],
  // a food truck parked on the plaza and the First Thursday art-walk tents
  [14.5, -6.5, 6.5, 2.4, 3.1, 0, 'truck', { food: 1 }],
  [-4.5, -10, 2.4, 1.0, 0.95, 0, 'tent', 0], [9.5, -24.5, 2.4, 1.0, 0.95, 0, 'tent', 1], [4.5, -28.5, 2.4, 1.0, 0.95, 0, 'tent', 2],
  // bollards across the end of James St, where it meets the plaza
  ...[1.5, 3.4, 5.3, 7.2, 9.1].map(sp => { const [x, z] = psAt(sp, -0.5); return [x, z, 0, 0, 0, 0, 'bollard']; }),
  // ---- the Pioneer Building (rotated to the downtown grid) and James St beside it
  [15, -15.5, 30, 31, 24, 0, 'pioneerbldg', { xf: PS_XF(PS_B0) }],
  [23, 0, 46, 11, 0, 0, 'droad', { xf: PS_XF(PS_JAMES), cross: true }],
  // ---- the Sinking Ship garage on the wedge between James St and Yesler
  [0, 0, 0, 0, 12, 0, 'flatiron', { pts: PS_GARAGE, prow: 0 }],
  // ---- west of 1st Ave: the Mutual Life Building on the corner, more brick blocks, an alley, a café
  [-34.5, -4, 17, 16, 21, 0, 'brick', { tint: 0xe9c6a8, shop: { e: [['d', -3.5], ['w', 1], ['d', 4.5]], n: [['d', -4.5], ['w', 0.5], ['d', 5]], w: [['d', 2]], s: [['w', 3]], props: [['table', -3, -2], ['table', 3, 2.5], ['bar', -3.5, -5.2, 0], ['crates', 5.5, 5], ['shelf', 1, -5, 1]], light: 1 } }],   // Mutual Life Building: a café on the ground floor
  [-34.5, -29.5, 17, 21, 17, 0, 'brick', { stone: true, shop: { e: [['d', -6], ['w', 0], ['d', 6]], n: [['d', 0]], w: [['d', 4]], props: [['shelf', -3, -5, 0], ['shelf', 3, -1, 0], ['shelf', -3, 3, 0], ['crates', 4.5, 6.5], ['table', 2, -7]], light: 1 } }],   // a bookshop: rows of shelves
  [-31, -15, 9, 5, 3.6, 0, 'house', { s: [['d', 1.5]], n: [['d', -1.5]], e: [['d', 0]], w: [['w', 0]], props: [['table', 0, 0], ['shelf', 3, 1.5, 0]], light: 1 }],
  [-34.5, 33.5, 17, 13, 15, 0, 'brick', { shop: { s: [['d', -4.5], ['w', 0], ['d', 4.5]], e: [['d', 0]], w: [['d', -2]], props: [['table', -3, 1.5], ['table', 3, 2], ['bar', 0, 4.5, 0], ['crates', -6, -3.5]], light: 1 } }],   // a saloon
  // ---- south of Yesler: the corner block, the tavern (bomb site B), Occidental's pedestrian mall, one more block
  [3.5, 33, 15, 14, 18, 0, 'brick', { tint: 0xd8a890, shop: { s: [['d', -3.5], ['w', 1], ['d', 4.5]], w: [['d', -2.5], ['w', 2.5]], e: [['d', 2]], props: [['shelf', -2, 1, 0], ['table', 3, 3.5], ['crates', -5, 4.5], ['shelf', 4, -2, 1]], light: 1 } }],
  [18, 33.5, 10, 11, 3.8, 0, 'house', { n: [['d', -2], ['w', 2.2]], e: [['d', 1.5]], w: [['d', 0]], s: [['w', 0]], props: [['table', -2, 1.5], ['table', 2, 2.5], ['shelf', 3.4, -3.2, 0]], light: 1 }],
  [29, 33, 8, 14, 0, 0, 'paving', 'brick'], [29, 29.5, 0, 0, 8.5, 0, 'tree'], [29, 37, 0, 0, 9, 0, 'tree'],
  [38, 35.5, 10, 9, 13, 0, 'brick', { stone: true }],
  // ---- Yesler Way: parked cars, a streetcar at its stop, a work zone, sandbags
  [-44, 9.2, 4.4, 2.0, 1.45, 0, 'car', 0], [-42, 20.8, 4.4, 2.0, 1.45, 0, 'car', 1], [1.6, 20.8, 4.4, 2.0, 1.45, 0, 'car', 0],
  [31, 10.5, 10, 2.4, 3, 0, 'tram'], [31, 10.5, 10, 1.6, 0, 0, 'tracks'],
  [-1, 15, 3.2, 0.9, 1.1, 0, 'jersey'], [6, 16.5, 3.2, 0.9, 1.1, 0, 'jersey'], [2.5, 15.5, 1.6, 1.6, 1.6, 0, 'crate'],
  [18, 19.5, 0.8, 3, 1.1, 0, 'sand'], [-40, 16, 2, 2, 1.2, 0, 'pallet'], [40, 17, 2, 2.5, 1.8, 0, 'crate'],
  [-14.5, 26.5, 0.7, 0.5, 1, 0, 'aframe', 2], [-24.8, 2.5, 0.7, 0.5, 1, 0, 'aframe', 1],
  // traffic and a utility dig, staggered across the lanes so Yesler is never one long line from end to end:
  // a Metro bus at its stop, box trucks loading, a site container and barriers round the dig
  [10, 18.8, 12, 2.6, 3.2, 0, 'bus', { livery: 0 }],
  [-3, 10.6, 7, 2.4, 3.3, 0, 'truck', {}], [-36, 10.6, 7, 2.4, 3.3, 0, 'truck', { back: 1 }],
  [-30, 19, 7, 2.4, 3.3, 0, 'truck', { back: 1 }],
  [-30, 13.3, 6, 2.4, 2.6, 0, 'container', 0x3e5d74], [14, 15.8, 6, 2.4, 2.6, 0, 'container', 0x6b7a3a], [-14, 15.8, 6, 2.4, 2.6, 0, 'container', 0x8a3d2c],
  [-24.5, 12.6, 0.9, 3.2, 1.1, 0, 'jersey'], [-19.5, 13.4, 0.9, 3.2, 1.1, 0, 'jersey'], [-35.5, 16.4, 0.9, 3.2, 1.1, 0, 'jersey'], [19.5, 16.4, 0.9, 3.2, 1.1, 0, 'jersey'],
  // newsstands break up the sidewalks along Yesler
  [-30, 5.75, 2.6, 2.7, 2.8, 0, 'kiosk'], [26, 5.75, 2.6, 2.7, 2.8, 0, 'kiosk'], [-3, 24.1, 2.6, 3.4, 2.8, 0, 'kiosk'], [-38, 24.1, 2.6, 3.4, 2.8, 0, 'kiosk'], [32, 24.1, 2.6, 3.4, 2.8, 0, 'kiosk'],
  [24, 21.3, 7, 2.4, 3.3, 0, 'truck', {}], [-20, 21.3, 7, 2.4, 3.3, 0, 'truck', { food: 2 }],
  [12, 8.2, 7, 2.4, 3.3, 0, 'truck', { back: 1 }], [-18, 8.2, 7, 2.4, 3.3, 0, 'truck', {}],
  [-11, -0.6, 2.4, 7, 3.3, 0, 'truck', {}], [-10.2, 30, 2.6, 12, 3.2, 0, 'bus', { livery: 1, back: 1 }], [-10.3, -29, 2.4, 7, 3.3, 0, 'truck', { back: 1 }], [39.5, 9.4, 5.4, 2.4, 3.3, 0, 'truck', {}], [21.8, 2.8, 1.6, 1.6, 2.8, 0, 'kiosk'], [-6, -17, 2.6, 1.8, 2.8, 0, 'kiosk'], [23.5, -3.5, 2.6, 1.8, 2.8, 0, 'kiosk'],
  [2, 13.3, 7, 2.4, 3.3, 0, 'truck', { food: 0 }], [31, 13.6, 6, 2.4, 2.6, 0, 'container', 0x4d6b54],
  // ---- 1st Avenue: parked cars both curbs, a delivery truck's crates, a work zone up north
  [-21, -6, 2.0, 4.4, 1.45, 0, 'car', 0], [-9, -20, 2.0, 4.4, 1.45, 0, 'car', 1], [-21, -30, 2.0, 4.4, 1.45, 0, 'car', 0],
  [-21, 34, 2.0, 4.4, 1.45, 0, 'car', 1],
  [-15, -27, 0.9, 3.2, 1.1, 0, 'jersey'], [-13, -33, 1.6, 1.6, 1.6, 0, 'crate'], [-16.5, 29, 0.8, 3, 1.1, 0, 'sand'],
  [-25, -21, 1.6, 1.6, 1.6, 0, 'crate'], [-5.5, -36.5, 2, 2, 1.2, 0, 'pallet'],
  // ---- James St and the garage side
  [32, -9.5, 2.0, 2.5, 1.8, 0, 'crate'], [27.85, 6.2, 0.62, 0.62, 0.9, 0, 'barrel'], [37.5, -12, 0.8, 3, 1.1, 0, 'sand'],
  // ---- spawn lots at both ends (past the map's built edge): staggered HESCO
  [44, -28, 1, 4, 3.5, 0, 'hesco'], [43, 10, 1, 4, 3.5, 0, 'hesco'], [46, 18, 1, 4, 3.5, 0, 'hesco'], [46, -2, 1, 4, 3.5, 0, 'hesco'], [46, -22, 1, 4, 3.5, 0, 'hesco'], [48, 30, 3, 1, 3.5, 0, 'hesco'], [48, -34, 3, 1, 3.5, 0, 'hesco'], [51, 8, 2, 2, 1.2, 0, 'ammo'],
  [-44, 28, 1, 4, 3.5, 0, 'hesco'], [-43.6, -10, 1, 4, 3.5, 0, 'hesco'], [-43, 14, 1, 4, 3.5, 0, 'hesco'], [43, -14, 1, 4, 3.5, 0, 'hesco'], [-46, -18, 1, 4, 3.5, 0, 'hesco'], [-46, 2, 1, 4, 3.5, 0, 'hesco'], [-46, 22, 1, 4, 3.5, 0, 'hesco'], [-48, -30, 3, 1, 3.5, 0, 'hesco'], [-48, 34, 3, 1, 3.5, 0, 'hesco'], [-51, -8, 2, 2, 1.2, 0, 'ammo'],
  // ---- street signs on the sidewalks and dumpsters in the back corners
  [-6.8, 30, 0, 0, 0, 0, 'rsign', { n: 'noparking', ry: -Math.PI / 2 }],
  [-6.8, -12, 0, 0, 0, 0, 'rsign', { n: 'noparking', ry: -Math.PI / 2 }], [-23.2, -18, 0, 0, 0, 0, 'rsign', { n: 'towaway', ry: Math.PI / 2 }],
  [-34, 23.2, 0, 0, 0, 0, 'rsign', { n: 'roadwork', ry: -Math.PI / 2 }], [-40, 6.8, 0, 0, 0, 0, 'rsign', { n: 'detour', ry: -Math.PI / 2 }],
  [-6.8, 6.6, 0, 0, 0, 0, 'rsign', { n: 'pedestrian', ry: -Math.PI / 2 }], [32, 6.8, 0, 0, 0, 0, 'rsign', { n: 'parking' }],
  [-39, -15.5, 1.9, 1.35, 1.25, 0, 'dumpster', {}], [-24.2, 30.5, 1.35, 1.9, 1.25, 0, 'dumpster', { dark: true }],
  // ---- Smith Tower, up Yesler to the east
  [96, -14, 12, 12, 62, 0, 'tower'],
  // ---- perimeter
  [0, 40.5, 110, 1, 10, 0, 'boundary'], [0, -40.5, 110, 1, 10, 0, 'boundary'],
  [54.5, 0, 1, 82, 10, 0, 'boundary'], [-54.5, 0, 1, 82, 10, 0, 'boundary'],
];
const PIONEER_HALF = [];
const PIONEER_ROADS = [
  [-22, -40, -8, 40, 'z', { center: 'double', trees: [-1], brick: [-1] }],            // 1st Avenue
  [-54, 8, 54, 22, 'x', { center: 'double', trees: [1], brick: [1] }],               // Yesler Way
];
const PIONEER_SPAWNS = [[50, -34], [50, -26], [50, -16], [50, -6], [50, 2], [50, 12], [50, 20], [48, 27], [47, 35], [51, -1]];
const PIONEER_PICKUPS = [
  { type: 'health', pos: [1.5, 0, -11] },
  { type: 'health', pos: [6.25, STATION_YC, 5.4] },
  { type: 'ammo', pos: [11.2, STATION_YP, -28] },
  { type: 'health', pos: [-31, 0, -14] },
  { type: 'health', pos: [29, 0, 33] },
  { type: 'ammo', pos: [18, 0, 35] },
  { type: 'ammo', pos: [-15, 0, 0.5] },
  { type: 'ammo', pos: [33, 0, -2] },
  { type: 'ammo', pos: [-34, 0, 26.5] },
  { type: 'ammo', pos: [-2, 0, -33] },
];
// bomb sites (both teams): A on the station's northbound platform, B in the tavern on Yesler
const PIONEER_SITES = [[-3.2, -26, STATION_YP], [18, 34]];

export const MAPS = {
  tarsa: { id: 'tarsa', name: 'Tarsa Market', blurb: 'Three lanes: market street, the centre plaza with its rooftop, and the yard; connectors through houses and alleys', center: TARSA_CENTER, half: TARSA_HALF, spawns: TARSA_SPAWNS, pickups: TARSA_PICKUPS, bounds: { hx: 58, hz: 40 }, facadeFloors: 3, photos: ['assets/loading/tarsa-1.jpg', 'assets/loading/tarsa-2.jpg'] },
  shuran: { id: 'shuran', name: 'Shuran Yard', blurb: 'Three lanes: market street, yard, container stacks', center: SHURAN_CENTER, half: SHURAN_HALF, spawns: SHURAN_SPAWNS, pickups: SHURAN_PICKUPS, photos: ['assets/loading/shuran-1.jpg'] },
  pioneer: { id: 'pioneer', name: 'Pioneer Square', blurb: '1st & Yesler on the real street plan: Pioneer Place, the pergola, the Pioneer Building and James St; bomb site A is down in King Street Station, where Link trains run through', center: PIONEER_CENTER, half: PIONEER_HALF, spawns: PIONEER_SPAWNS, pickups: PIONEER_PICKUPS, sites: PIONEER_SITES, lower: STATION_LEVELS, bounds: { hx: 54, hz: 40 }, facadeFloors: 5, facadeStyle: 'brick', daylight: true, roads: PIONEER_ROADS,
    look: { turbidity: 2.2, rayleigh: 2.6, mie: 0.003, fog: 0.0017, fogColor: 0xc4d4e4, sun: 4.2, sunColor: 0xfff3e2, hemi: 1.15, hemiSky: 0xcfe0f8, ground: 0x9a958a, exposure: 1.12, env: 1.0, clouds: true, blueSky: true }, photos: ['assets/loading/pioneer-1.jpg', 'assets/loading/pioneer-2.jpg', 'assets/loading/pioneer-3.jpg'] },
  mart: MART,
  drivein: DRIVEIN,
};
export const MAP_IDS = Object.keys(MAPS);

// ---------- helpers ----------
// rectangles [x0, z0, x1, z1]: r minus every hole, as a list of rectangles
function rectsMinus(r, holes) {
  let out = [r];
  for (const h of holes) {
    const next = [];
    for (const a of out) {
      if (h[0] >= a[2] || h[2] <= a[0] || h[1] >= a[3] || h[3] <= a[1]) { next.push(a); continue; }
      if (a[1] < h[1]) next.push([a[0], a[1], a[2], h[1]]);
      if (h[3] < a[3]) next.push([a[0], h[3], a[2], a[3]]);
      const z0 = Math.max(a[1], h[1]), z1 = Math.min(a[3], h[3]);
      if (a[0] < h[0]) next.push([a[0], z0, h[0], z1]);
      if (h[2] < a[2]) next.push([h[2], z0, a[2], z1]);
    }
    out = next;
  }
  return out;
}
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

class Batcher {
  constructor() { this.lists = new Map(); }
  add(geo, mat, matrix, opts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(matrix);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    _c.set(opts.tint ?? 0xffffff);
    const grime = opts.grime ?? 0.4;
    const base = opts.base ?? 0;
    for (let i = 0; i < pos.count; i++) {
      const f = 1 - grime * (1 - smooth(0, 1.3, pos.getY(i) - base));
      col[i * 3] = _c.r * f; col[i * 3 + 1] = _c.g * f; col[i * 3 + 2] = _c.b * f;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    let cast = opts.cast !== false;
    if (cast && LOW_DETAIL) { g.computeBoundingSphere(); if (g.boundingSphere.radius < 0.3) cast = false; }
    const key = mat.uuid + (cast ? '|c' : '|n');
    if (!this.lists.has(key)) this.lists.set(key, { mat, cast, geos: [] });
    this.lists.get(key).geos.push(g);
  }
  build(parent) {
    for (const { mat, cast, geos } of this.lists.values()) {
      // split very large batches to keep frustum culling useful
      for (let i = 0; i < geos.length; i += 400) {
        const merged = mergeGeometries(geos.slice(i, i + 400), false);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
      }
      geos.forEach(g => g.dispose());
    }
    this.lists.clear();
  }
}

// Box with rounded edges and triplanar world-scale UVs (scale = metres per texture tile; 0 = one tile per face)
// low-detail world (Mobile): square-edged boxes (12 triangles instead of ~108), lighter sandbags, and small
// props stop casting sun shadows. Set before a map is built.
let LOW_DETAIL = !!savedQuality().lowPoly;
export function setWorldDetail(low) { LOW_DETAIL = !!low; }

// the treads of a staircase model: its upward faces of any size, by height ({y, x0, x1, z0, z1}, model units,
// lowest first)
function stairTreads(geo) {
  if (geo.userData.treads) return geo.userData.treads;
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3();
  const tops = new Map();
  for (let i = 0; i < p.count; i += 3) {
    A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1); C.fromBufferAttribute(p, i + 2);
    N.crossVectors(E.subVectors(B, A), new THREE.Vector3().subVectors(C, A));
    const area = N.length() / 2;
    if (N.normalize().y < 0.95) continue;
    const k = Math.round(A.y * 50);
    const t = tops.get(k) || { y: A.y, area: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    t.area += area;
    for (const v of [A, B, C]) { t.x0 = Math.min(t.x0, v.x); t.x1 = Math.max(t.x1, v.x); t.z0 = Math.min(t.z0, v.z); t.z1 = Math.max(t.z1, v.z); }
    tops.set(k, t);
  }
  const all = [...tops.values()], big = Math.max(...all.map(t => t.area));
  return (geo.userData.treads = all.filter(t => t.area > big * 0.5 && t.y > 0.05).sort((a, b) => a.y - b.y));
}
export const worldDetailLow = () => LOW_DETAIL;
function worldBox(w, h, d, scale, radius) {
  const r = LOW_DETAIL ? 0 : radius ?? (Math.min(w, h, d) < 0.12 ? 0 : Math.min(0.05, Math.min(w, h, d) * 0.14));
  const g = r > 0.002 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    let u, v, su, sv;
    if (ax >= ay && ax >= az) { u = z; v = y; su = d; sv = h; }
    else if (ay >= az) { u = x; v = z; su = w; sv = d; }
    else { u = x; v = y; su = w; sv = h; }
    if (scale) uv.setXY(i, u / scale, v / scale);
    else uv.setXY(i, u / su + 0.5, v / sv + 0.5);
  }
  return g;
}

const flatBox = (w, h, d, scale = 0) => worldBox(w, h, d, scale, 0);

export function buildWorld(scene, physics, mapId = 'tarsa') {
  const LAYOUT = MAPS[mapId] || MAPS.tarsa;
  const { hx: HX, hz: HZ } = LAYOUT.bounds || DEFAULT_BOUNDS;
  Object.assign(MAP, { minX: -HX, maxX: HX, minZ: -HZ, maxZ: HZ });
  const tex = makeTextureSets();
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const pbr = (set, extra = {}) => std({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, ...extra });
  const M = {
    plaster: pbr(tex.plaster), concrete: pbr(tex.concrete), brick: pbr(tex.brick),
    asphalt: pbr(tex.asphalt), dirt: pbr(tex.dirt), tile: pbr(tex.tile),
    metal: pbr(tex.metal, { metalness: 0.35 }), wood: pbr(tex.wood), sand: pbr(tex.sand), hesco: pbr(tex.hesco),
    dark: std({ color: 0x3a3c3f, roughness: 0.5, metalness: 0.65 }),
    woodOld: pbr(tex.woodold || tex.wood),
    glass: std({ color: 0x1c2229, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6 }),
    cloth: pbr(tex.cloth || tex.fabric, { side: THREE.DoubleSide }),
    rubber: tex.rubber ? pbr(tex.rubber, { color: 0x3a3a3a }) : std({ color: 0x161616, roughness: 0.92 }),
    paint: tex.paint ? pbr(tex.paint, { roughness: 0.85, metalness: 0.35 }) : std({ roughness: 0.42, metalness: 0.35 }),
    leaf: std({ color: 0x5b6a2e, roughness: 0.8, side: THREE.DoubleSide }),
    rust: tex.paint ? pbr(tex.paint, { color: 0x8a5a3a, metalness: 0.4 }) : std({ color: 0x5c3a26, roughness: 0.8, metalness: 0.4 }),
    line: std({ color: 0xd8d0b8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 10 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xffe8c0, emissive: 0xffc070, emissiveIntensity: 9 }),
    frame: tex.paint ? pbr(tex.paint, { roughness: 0.7, metalness: 0.1 }) : std({ roughness: 0.6 }),
    dim: std({ color: 0x0c0d0e, roughness: 0.95 }),
  };
  M.bag = pbr(tex.bag || tex.fabric);
  M.bulbHot = M.bulb.clone();
  M.cobble = tex.cobble ? pbr(tex.cobble, { roughness: 1 }) : M.tile;
  M.iron = std({ color: 0x1f2a26, roughness: 0.45, metalness: 0.7 });
  M.stone = pbr(tex.concrete, { color: 0xb8ad9a });
  // patterned cement floor tiles in the houses (centre house gets grey marble)
  if (tex.cement) M.houseFloor = pbr(tex.cement, { roughness: 1 });
  if (tex.marblegrey) M.centerFloor = pbr(tex.marblegrey, { roughness: 1 });
  M.bag.normalScale = new THREE.Vector2(1.5, 1.5);
  // metres per texture repeat; photo sets are real-world scale, so they tile tighter than the generated ones
  const photo = (k) => !!(tex[k] && tex[k].photo);
  const S = {
    cobble: 2.2, stone: 2.5,
    plaster: 3, concrete: photo('concrete') ? 2.5 : 3, brick: photo('brick') ? 2.2 : 2, asphalt: photo('asphalt') ? 4 : 7, dirt: photo('dirt') ? 5 : 9,
    tile: photo('tile') ? 2.6 : 2.2, metal: 2.4, wood: photo('wood') ? 1.6 : 1.2, woodOld: 1.6, sand: 1.2, hesco: 1.75, cloth: photo('cloth') ? 1.5 : 1, paint: 1.6, rust: 1.6, rubber: 1,
  };
  const scaleOf = (mat) => { for (const k in M) if (M[k] === mat) return S[k] || 0; return 0; };

  const batch = new Batcher();
  const group = new THREE.Group();
  scene.add(group);
  const rnd = seeded(1337);

  // XF: a rotated local frame { x, z, a } (origin and yaw). While set, everything put / solid places is authored in
  // that frame: pieces are turned and moved into place, and collision follows the turned footprint in thin strips.
  let XF = null;
  const xfPt = (x, z) => XF ? [XF.x + x * Math.cos(XF.a) + z * Math.sin(XF.a), XF.z - x * Math.sin(XF.a) + z * Math.cos(XF.a)] : [x, z];
  // Ground overlays (sidewalks, road paint, manholes, paving, floors) sit a few millimetres above the surface
  // under them. At a distance the depth buffer can't tell them apart and they flicker (z-fighting), so every flat
  // overlay gets a polygon offset by height: each distinct height is its own step, so a higher layer always draws
  // over a lower one at any range, and two overlays at the same height never pull against each other.
  const layered = new Map();
  const layerMat = (mat, y) => {
    if (mat.userData.groundLayer !== undefined) return mat;
    // just under the ground (the dirt that runs out to the horizon): pushed back, so it never shows through
    if (y < -1e-4 && y > -0.1) {
      const k = mat.uuid + ':under';
      let m = layered.get(k);
      if (!m) { m = mat.clone(); m.polygonOffset = true; m.polygonOffsetFactor = 4; m.polygonOffsetUnits = 8; m.userData.groundLayer = -1; layered.set(k, m); M[`_layer${layered.size}`] = m; }
      return m;
    }
    const f = y - Math.floor(y + 1e-4);                  // height above the floor level it lies on (0 for ground, 3.6 for a roof)
    if (f <= 0.0005 || f > 0.08) return mat;
    // one copy per material and height (0.1 mm); the offsets are handed out by rank once the map is built
    const h = Math.round(f * 10000), k = mat.uuid + ':' + h;
    let m = layered.get(k);
    if (!m) { m = mat.clone(); m.polygonOffset = true; m.userData.groundLayer = h; layered.set(k, m); M[`_layer${layered.size}`] = m; }
    return m;
  };
  const rankGroundLayers = () => {
    const hs = [...new Set([...layered.values()].map(m => m.userData.groundLayer).filter(h => h > 0))].sort((a, b) => a - b);
    for (const m of layered.values()) {
      const h = m.userData.groundLayer;
      if (!(h > 0)) continue;
      const i = hs.indexOf(h) + 1;
      // units: a fixed step in depth, which separates the layers at any range; the factor adds a little at grazing
      // angles, capped: a big one pulls an overlay through anything low standing on it (a door's threshold, a
      // pallet) when seen from across the room
      m.polygonOffsetFactor = -(1 + Math.min(i, 4) * 0.25); m.polygonOffsetUnits = -2 * i;
    }
    return hs.length;
  };
  // an open shape (a lampshade, a half-torus arch, a pyramid roof) drawn from inside too: a reversed copy of it
  // in the same geometry, so it batches like any other (no see-through from underneath)
  const bothSides = (geo) => {
    if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    const back = geo.clone();
    back.setIndex([...geo.index.array].reverse());
    const n = back.attributes.normal; for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
    const g = mergeGeometries([geo, back]); geo.dispose(); back.dispose();
    return g;
  };
  const FLAT = new Set(['PlaneGeometry', 'CircleGeometry', 'RingGeometry']);
  const put = (geo, mat, x, y, z, ry = 0, opts = {}) => {
    // a flat piece lying face-up just above a floor: a ground overlay
    if (opts.rx === -Math.PI / 2 && !opts.rz && FLAT.has(geo.type)) mat = layerMat(mat, y);
    if (XF) { [x, z] = xfPt(x, z); ry += XF.a; }
    _e.set(opts.rx || 0, ry, opts.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(opts.sx || 1, opts.sy || 1, opts.sz || 1);
    _m.compose(_p, _q, _s);
    batch.add(geo, mat, _m, opts);
    geo.dispose();
  };
  const B = (mat, w, h, d, x, y, z, ry = 0, opts = {}) => put(worldBox(w, h, d, scaleOf(mat)), mat, x, y + h / 2, z, ry, opts);
  const solidAA = (cx, cz, w, d, h, y0 = 0, surface = 'concrete') => { const b = physics.addBox(new Box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2)); b.surface = surface; return b; };
  // a convex footprint (world x,z points) as axis-aligned strips: slabs along the longer axis, each as wide as the
  // footprint within it. Returns a handle that sets a flag (navBlock, surface...) on every strip.
  const solidPoly = (pts, h, y0, surface) => {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), minz = Math.min(...zs), maxz = Math.max(...zs);
    const boxes = [];
    if (maxx - minx < 1.2 && maxz - minz < 1.2) boxes.push(solidAA((minx + maxx) / 2, (minz + maxz) / 2, maxx - minx, maxz - minz, h, y0, surface));
    else {
      // slab direction: the one whose walls step least across a slab (slanted walls make a staircase of strip
      // ends; keep every step under ~8 cm so no strip pokes visibly out of the wall)
      const slope = (ax) => { let m = 0; for (let k = 0; k < pts.length; k++) { const P = pts[k], Q = pts[(k + 1) % pts.length], da = Math.abs(Q[ax] - P[ax]), db = Math.abs(Q[1 - ax] - P[1 - ax]); if (da > 1e-3 && db > 1e-3) m = Math.max(m, db / da); } return m; };
      const sx = slope(0), sz = slope(1);
      const alongZ = Math.abs(sz - sx) < 1e-3 ? maxz - minz >= maxx - minx : sz < sx, A = alongZ ? 1 : 0, Bx = alongZ ? 0 : 1;
      const step = Math.max(0.05, Math.min(0.25, 0.08 / Math.max(1e-3, alongZ ? sz : sx)));
      const lo = alongZ ? minz : minx, hi = alongZ ? maxz : maxx, n = Math.max(1, Math.ceil((hi - lo) / step)), st = (hi - lo) / n;
      for (let i = 0; i < n; i++) {
        const a0 = lo + i * st, a1 = a0 + st;
        // clip the polygon to the slab a0..a1 and take its extent across
        let poly = pts;
        for (const [lim, sg] of [[a0, 1], [a1, -1]]) {
          const out = [];
          for (let k = 0; k < poly.length; k++) {
            const P = poly[k], Q = poly[(k + 1) % poly.length], pi = (P[A] - lim) * sg >= 0, qi = (Q[A] - lim) * sg >= 0;
            if (pi) out.push(P);
            if (pi !== qi) { const t = (lim - P[A]) / (Q[A] - P[A]); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
          }
          poly = out; if (!poly.length) break;
        }
        if (poly.length < 2) continue;
        // extent across where the slab is narrowest (both its edges), so a strip never juts out of a slanted
        // wall: no invisible lips. (At worst a sliver of wall has no collision, which nobody can notice.)
        const across = (am) => {
          const xs2 = [];
          for (let k = 0; k < pts.length; k++) {
            const P = pts[k], Q = pts[(k + 1) % pts.length];
            if ((P[A] - am) * (Q[A] - am) <= 0 && P[A] !== Q[A]) { const t = (am - P[A]) / (Q[A] - P[A]); xs2.push(P[Bx] + (Q[Bx] - P[Bx]) * t); }
          }
          return xs2.length >= 2 ? [Math.min(...xs2), Math.max(...xs2)] : null;
        };
        const e0 = across(a0 + st * 0.02), e1 = across(a1 - st * 0.02), em = across((a0 + a1) / 2);
        const ex = [e0, e1, em].filter(Boolean);
        const b0 = ex.length ? Math.max(...ex.map(e => e[0])) : Math.min(...poly.map(p => p[Bx])), b1 = ex.length ? Math.min(...ex.map(e => e[1])) : Math.max(...poly.map(p => p[Bx]));
        if (b1 - b0 < 0.01) continue;
        boxes.push(alongZ ? solidAA((b0 + b1) / 2, (a0 + a1) / 2, b1 - b0, st, h, y0, surface) : solidAA((a0 + a1) / 2, (b0 + b1) / 2, st, b1 - b0, h, y0, surface));
      }
    }
    return new Proxy(boxes[0] || {}, { set(_t, k, v) { boxes.forEach(b => { b[k] = v; }); return true; } });
  };
  const solid = (cx, cz, w, d, h, y0 = 0, surface = 'concrete') => {
    if (!XF) return solidAA(cx, cz, w, d, h, y0, surface);
    return solidPoly([[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]].map(([x, z]) => xfPt(x, z)), h, y0, surface);
  };
  const SURFACE = { dumpster: 'metal', infokiosk: 'wood', bus: 'metal', truck: 'metal', tent: 'wood', kiosk: 'brick', container: 'metal', car: 'metal', barrel: 'metal', crate: 'wood', pallet: 'wood', stall: 'wood', sand: 'concrete', hesco: 'concrete', palm: 'wood', ammo: 'metal', hutwall: 'brick' };
  const NO_SOLID = new Set(['station', 'house', 'lamp', 'lights', 'light', 'brick', 'tunnel', 'stairdown', 'paving', 'tracks', 'cable', 'tree', 'pergola', 'vlamp', 'tower', 'railing', 'aframe', 'pioneerbldg', 'flatiron', 'droad', 'bollard', 'prism']);

  // ---------- shared decals / glows ----------
  const radial = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const glowTex = radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,220,170,0.55)'], [1, 'rgba(255,200,140,0)']]);
  const poolMat = new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,214,150,0.9)'], [0.5, 'rgba(255,190,120,0.35)'], [1, 'rgba(255,180,100,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.8 });
  const streakTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = 6 + Math.random() * 52, w = 2 + Math.random() * 6, len = 50 + Math.random() * 78;
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, 'rgba(40,32,24,0.55)'); grd.addColorStop(1, 'rgba(40,32,24,0)');
      g.fillStyle = grd; g.fillRect(x, 0, w, len);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // a few market posters and spray tags (canvas textures, shared)
  const posterMat = [0, 1, 2, 3, 4, 5].map(i => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 128;
    const g = c.getContext('2d');
    const pal = [['#c9a24a', '#2a2622'], ['#7a2a24', '#e8dcc0'], ['#2f5a6a', '#f0e6cc'], ['#e2d6b8', '#3a2a22'], ['#3d5a3a', '#f2e8d0'], ['#1c1c1c', '#d8442e']][i];
    if (i === 5) { // spray tag
      g.strokeStyle = pal[1]; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); for (let k = 0; k < 6; k++) { const x = 10 + k * 15, y = 60 + Math.sin(k * 1.7) * 22; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    } else {
      g.fillStyle = pal[0]; g.fillRect(4, 4, 88, 120);
      g.fillStyle = pal[1]; g.fillRect(12, 14, 72, 16); g.fillRect(12, 98, 50, 8);
      g.globalAlpha = 0.6; for (let k = 0; k < 5; k++) g.fillRect(12, 40 + k * 10, 40 + ((k * 37 + i * 13) % 32), 4);
      g.globalAlpha = 0.25; g.fillStyle = '#000'; g.fillRect(4, 4, 88, 120 * 0.15); // sun-faded / torn top
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, transparent: i === 5, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: i !== 5 });
  });
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const driftMat = new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(176,150,112,0.75)'], [0.6, 'rgba(176,150,112,0.35)'], [1, 'rgba(176,150,112,0)']]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const glows = [], glowsHot = []; // [x, y, z, size]; glowsHot: lights that stay on in daylight (underground)
  // flat decals go through the batcher too (one draw call per decal material)
  const decal = (mat, w, h, x, y, z, ry, rx = 0) => put(new THREE.PlaneGeometry(w, h), mat, x, y, z, ry, { rx, grime: 0, cast: false });

  // ---------- ground ----------
  // lower levels (tunnels, the station): they and their stairwells cut holes in the ground, and the buildings
  // above them leave a nav-transparent "lid" over the tunnel so bots can path underneath
  const HOLES = [], LIDS = [];   // LIDS: tunnels under a walkable sidewalk (extra.lid): the ground is cut, a thin lid covers them
  if (LAYOUT.center && LAYOUT.half) {
    const scan = (cx, cz, w, d, kind, ex) => {
      if (kind === 'station') { LIDS.push(...STATION_LIDS); return; }
      if (kind !== 'tunnel' && kind !== 'stairdown') return;
      const r = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
      (kind === 'tunnel' && ex && ex.lid ? LIDS : HOLES).push(r);
    };
    for (const it of LAYOUT.center) scan(it[0], it[1], it[2], it[3], it[6], it[7]);
    for (const it of LAYOUT.half) { scan(it[0], it[1], it[2], it[3], it[6], it[7]); scan(-it[0], -it[1], it[2], it[3], it[6], it[7]); }
  }
  const SOLID_LIDS = HOLES; // building mass over these rects is nav-transparent (a level runs beneath)
  for (const [x0, z0, x1, z1] of rectsMinus([-200, -200, 200, 200], [...HOLES, ...LIDS])) physics.addBox(new Box(x0, -2, z0, x1, 0, z1)).surface = 'ground';
  for (const [x0, z0, x1, z1] of LIDS) physics.addBox(new Box(x0, -0.3, z0, x1, 0, z1)).surface = 'concrete';
  const plane = (mat, w, d, x, z, y, ry = 0, tint) => {
    if (HOLES.length && !ry) {
      const pieces = rectsMinus([x - w / 2, z - d / 2, x + w / 2, z + d / 2], HOLES);
      if (pieces.length !== 1) { for (const [a, b, c, e] of pieces) planePiece(mat, c - a, e - b, (a + c) / 2, (b + e) / 2, y, 0, tint); return; }
    }
    planePiece(mat, w, d, x, z, y, ry, tint);
  };
  const planePiece = (mat, w, d, x, z, y, ry = 0, tint) => {
    const g = new THREE.PlaneGeometry(w, d);
    const sc = scaleOf(mat);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / (sc || 3), uv.getY(i) * d / (sc || 3));
    put(g, mat, x, y, z, ry, { rx: -Math.PI / 2, grime: 0, cast: false, tint });
  };
  const street = !LAYOUT.build; // custom-built maps (the supermarket) lay their own ground
  // street grid: [x0, z0, x1, z1, axis ('x' | 'z' = direction of travel), opts]; roadsMirror adds the point-mirrored copy
  const ROADS = street && LAYOUT.roads ? (LAYOUT.roadsMirror
    ? [...LAYOUT.roads, ...LAYOUT.roads.map(([a, b, c, d, ax, o]) => [-c, -d, -a, -b, ax, o && { ...o, bike: o.bike && -o.bike, trees: o.trees && o.trees.map(t => -t), brick: o.brick && o.brick.map(t => -t) }])] : LAYOUT.roads) : null;
  if (ROADS) {
    // concrete sidewalk slabs: light, slightly mottled, scored every 1.5 m
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#8e8b85'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { const v = 125 + Math.random() * 35 | 0; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.18)`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6); }
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) { g.fillStyle = `rgba(${[120, 140, 110, 135][k * 2 + j]},${[118, 136, 108, 130][k * 2 + j]},${[112, 128, 104, 124][k * 2 + j]},0.10)`; g.fillRect(k * 256, j * 256, 256, 256); }
    g.strokeStyle = 'rgba(60,58,54,0.75)'; g.lineWidth = 3;
    for (const t of [1.5, 256, 510.5]) { g.beginPath(); g.moveTo(t, 0); g.lineTo(t, 512); g.stroke(); g.beginPath(); g.moveTo(0, t); g.lineTo(512, t); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    M.pave = std({ map: t, roughness: 0.92, normalMap: tex.concrete && tex.concrete.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
    S.pave = 3;
  }
  if (street) {
  plane(M.dirt, 300, 300, 0, 0, -0.01);
  // maps with a street grid (LAYOUT.roads): everything between the roads is concrete sidewalk; otherwise one big asphalt yard
  plane(ROADS ? M.pave : M.asphalt, 2 * (HX - 11), 2 * HZ, 0, 0, 0.0);
  if (!ROADS) plane(M.tile, 26, 18, 0, 0, 0.012);
  for (const sx of [-1, 1]) plane(M.dirt, 11, 2 * HZ, sx * (HX - 5.5), 0, 0.006); // forward bases on packed dirt
  for (const sz of [-1, 1]) plane(M.tile, 2 * HX + 2, 2.6, 0, sz * (HZ - 1.3), 0.016); // sidewalks
  // curbs
  for (const sz of [-1, 1]) B(M.concrete, 2 * (HX - 11), 0.12, 0.25, 0, 0, sz * (HZ - 2.7), 0, { grime: 0.2, cast: false });
  // lane markings
  if (!ROADS) for (const sz of [-1, 1]) for (let x = -(HX - 14); x <= HX - 14; x += 4) {
    if (Math.abs(x) < 6) continue;
    put(new THREE.PlaneGeometry(0.15, 2), M.line, x, 0.02, sz * HZ * 0.6, Math.PI / 2, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0xbab39c });
  }
  if (!ROADS) for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
    put(new THREE.PlaneGeometry(0.5, 3), M.line, sx * 13.5, 0.02, -4.5 + i * 1.5, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0xcfc7ae });
  }
  // oil stains / scorch marks are in the asphalt texture; add a few scorched patches
  const scorchMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1 + rnd() * 1.4, 20), scorchMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((rnd() - 0.5) * 50, 0.025, (rnd() - 0.5) * 40);
    group.add(m);
  }
  }

  // ---------- roads: asphalt, curbs, lane lines, crosswalks, manholes and working traffic lights ----------
  const signalMats = { x: [], z: [] };   // [red, amber, green] per direction of travel; cycled in world.update
  let placeSignals = null;                // after the layout is built, so poles avoid props
  const afterLayout = [];                 // street trees etc.: placed once the layout exists, around it
  if (ROADS) {
    const rect = (r) => ({ x0: r[0], z0: r[1], x1: r[2], z1: r[3] });
    const inters = [];
    for (let i = 0; i < ROADS.length; i++) for (let j = i + 1; j < ROADS.length; j++) {
      if (ROADS[i][4] === ROADS[j][4]) continue;
      // the junction box: the z-road's width by the x-road's width, where the two meet (crossing or T)
      const zr = rect(ROADS[i][4] === 'z' ? ROADS[i] : ROADS[j]), xr = rect(ROADS[i][4] === 'z' ? ROADS[j] : ROADS[i]);
      if (xr.x1 < zr.x0 - 0.1 || xr.x0 > zr.x1 + 0.1 || zr.z1 < xr.z0 - 0.1 || zr.z0 > xr.z1 + 0.1) continue;
      inters.push({ x0: zr.x0, x1: zr.x1, z0: xr.z0, z1: xr.z1 });
    }
    const cut = (segs, a, b) => segs.flatMap(([p, q]) => (b <= p || a >= q) ? [[p, q]] : [[p, Math.min(q, a)], [Math.max(p, b), q]].filter(([u, v]) => v - u > 0.05));
    const flat = (mat, w, d, x, z, y, tint) => put(new THREE.PlaneGeometry(w, d), mat, x, y, z, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint });
    const manholeMat = std({ color: 0x2a2a28, roughness: 0.55, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const r of ROADS) {
      const [x0, z0, x1, z1, ax] = r, o = r[5] || {};
      const alongX = ax === 'x';
      const L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1, W0 = alongX ? z0 : x0, W1 = alongX ? z1 : x1, Wd = W1 - W0, Wc = (W0 + W1) / 2;
      const P = (l, w) => alongX ? [l, w] : [w, l];      // (along, across) -> (x, z)
      const box = (l0, l1, w0, w1) => alongX ? [l0, w0, l1, w1] : [w0, l0, w1, l1];
      plane(M.asphalt, x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, 0.008);
      // spans of this road that are intersections (no curbs, no lines there)
      const my = inters.filter(I => alongX ? (I.z0 >= z0 - 0.1 && I.z1 <= z1 + 0.1 && I.x1 >= x0 - 0.1 && I.x0 <= x1 + 0.1)
        : (I.x0 >= x0 - 0.1 && I.x1 <= x1 + 0.1 && I.z1 >= z0 - 0.1 && I.z0 <= z1 + 0.1))
        .map(I => alongX ? [I.x0, I.x1] : [I.z0, I.z1]);
      // curbs along both edges, broken where another road crosses and where a stairwell opens
      for (const [w, sgn] of [[W0, -1], [W1, 1]]) {
        let segs = [[L0, L1]];
        for (const q of ROADS) if (q !== r) {
          const qa = alongX ? q[0] : q[1], qb = alongX ? q[2] : q[3], qw0 = alongX ? q[1] : q[0], qw1 = alongX ? q[3] : q[2];
          if (w + sgn * 0.4 > qw0 && w + sgn * 0.4 < qw1) segs = cut(segs, qa, qb);
        }
        for (const h of HOLES) {
          const ha = alongX ? h[0] : h[1], hb = alongX ? h[2] : h[3], hw0 = alongX ? h[1] : h[0], hw1 = alongX ? h[3] : h[2];
          if (w + sgn * 0.6 > hw0 - 0.1 && w - sgn * 0.1 < hw1 + 0.1) segs = cut(segs, ha - 0.1, hb + 0.1);
        }
        for (const [a, b] of segs) {
          const [cx, cz] = P((a + b) / 2, w + sgn * 0.15);
          B(M.concrete, alongX ? b - a : 0.3, 0.15, alongX ? 0.3 : b - a, cx, 0, cz, 0, { tint: 0xc9c4b8, grime: 0.35, cast: false });
          // painted curb: red approaching a junction, now and then a yellow loading zone
          const paint = (p0, p1, tint) => { const [px, pz] = P((p0 + p1) / 2, w + sgn * 0.15); put(flatBox(alongX ? p1 - p0 : 0.32, 0.03, alongX ? 0.32 : p1 - p0, 0), M.paint, px, 0.16, pz, 0, { tint, grime: 0.2, cast: false }); };
          if (b - a > 6) { if (a > L0 + 0.1) paint(a, a + 3, 0xa83a2c); if (b < L1 - 0.1) paint(b - 3, b, 0xa83a2c); if (b - a > 16 && rnd() < 0.5) { const m = a + 5 + rnd() * (b - a - 16); paint(m, m + 6, 0xd9b23a); } }
          // storm drain grates against the curb now and then
          for (let l = a + 4 + rnd() * 6; l < b - 2; l += 14 + rnd() * 10) { const [gx, gz] = P(l, w - sgn * 0.35); flat(manholeMat, alongX ? 0.9 : 0.45, alongX ? 0.45 : 0.9, gx, gz, 0.02); }
        }
      }
      // lane lines: solid edge lines, dashed centre (skipped through intersections and their crosswalks)
      let free = [[L0, L1]];
      for (const [a, b] of my) free = cut(free, a - 4.6, b + 4.6);
      // bike lane (o.bike = -1 low edge / +1 high edge): green, dashed white border, white flexposts
      const bk = o.bike || 0, bEdge = bk < 0 ? W0 : W1, bIn = bEdge - bk * 1.75;
      const Wt0 = bk < 0 ? bIn : W0, Wt1 = bk > 0 ? bIn : W1, Wct = (Wt0 + Wt1) / 2;   // the traffic lanes
      const line = (a, b, w, wd, tint, y = 0.02) => { const [lx, lz] = P((a + b) / 2, w); flat(M.line, alongX ? b - a : wd, alongX ? wd : b - a, lx, lz, y, tint); };
      for (const [a, b] of free) {
        for (const [e, sd] of [[W0 + 0.45, -1], [W1 - 0.45, 1]]) if (sd !== bk) line(a, b, e, 0.12, 0xd8d2c0);
        if (o.center === 'double') for (const d of [-0.11, 0.11]) line(a, b, Wct + d, 0.1, 0xd9b54a);
        else if (o.center !== false) for (let l = a + 1; l + 3 <= b; l += 6) line(l, l + 3, Wct, 0.14, 0xd9b54a);
        if (bk) {
          line(a, b, (bEdge + bIn) / 2 - bk * 0.05, 1.45, 0x4f9e5e, 0.019);
          for (let l = a + 0.5; l + 1.5 <= b; l += 3) line(l, l + 1.5, bIn, 0.15, 0xe6e0d0, 0.021);
          for (let l = a + 2; l < b - 1; l += 3) {
            const [fx, fz] = P(l, bIn + bk * 0.12);
            put(new THREE.CylinderGeometry(0.045, 0.06, 0.9, 8), M.paint, fx, 0.45, fz, 0, { tint: 0xefefea, grime: 0.15 });
            put(new THREE.CylinderGeometry(0.047, 0.047, 0.08, 8), M.paint, fx, 0.75, fz, 0, { tint: 0x9aa0a6, grime: 0 });
          }
        }
        for (let l = a + 3 + rnd() * 5; l < b - 2; l += 12 + rnd() * 8) { const [mx, mz] = P(l, Wc + (rnd() - 0.5) * Wd * 0.4); put(new THREE.CircleGeometry(0.38, 18), manholeMat, mx, 0.019, mz, rnd() * 6, { rx: -Math.PI / 2, grime: 0, cast: false }); }
      }
      // crosswalks and stop lines on both approaches to each intersection
      if (bk) for (const [a, b] of my) for (let l = a + 0.3; l + 1 <= b; l += 1.8) {
        line(l, l + 1, (bEdge + bIn) / 2 - bk * 0.05, 1.45, 0x4f9e5e, 0.019);
        line(l + 1, l + 1.35, (bEdge + bIn) / 2 - bk * 0.05, 1.45, 0xe6e0d0, 0.019);
      }
      for (const [a, b] of my) for (const [edge, dir] of [[a, -1], [b, 1]]) {
        if (edge + dir * 4 < L0 || edge + dir * 4 > L1) continue;
        // paired bars, like the Pioneer Square crossings
        for (let w = W0 + 0.45; w + 1.0 <= W1 - 0.2; w += 1.55) for (const d of [0, 0.6]) { const [sx, sz] = P(edge + dir * 1.9, w + d + 0.2); flat(M.line, alongX ? 2.8 : 0.4, alongX ? 0.4 : 2.8, sx, sz, 0.021, 0xe6e0d0); }
        const [tx, tz] = P(edge + dir * 3.9, Wc);
        flat(M.line, alongX ? 0.4 : Wd - 0.6, alongX ? Wd - 0.6 : 0.4, tx, tz, 0.021, 0xe6e0d0);
      }
    }
    // street trees along the sidewalks (o.trees = [-1, +1] sides), each in an iron tree grate; placed after the layout
    afterLayout.push(() => { for (const r of ROADS) {
      const [x0, z0, x1, z1, ax] = r, o = r[5] || {};
      if (!o.trees) continue;
      const alongX = ax === 'x', L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1;
      for (const sd of o.trees) {
        const w = (sd < 0 ? (alongX ? z0 : x0) : (alongX ? z1 : x1)) + sd * 1.6;
        for (let l = L0 + 4 + rnd() * 2; l < L1 - 3; l += 9 + rnd() * 3) {
          const x = alongX ? l : w, z = alongX ? w : l;
          if (ROADS.some(q => x > q[0] - 2.5 && x < q[2] + 2.5 && z > q[1] - 2.5 && z < q[3] + 2.5 && q !== r)) continue;
          if (HOLES.some(h => x > h[0] - 1.5 && x < h[2] + 1.5 && z > h[1] - 1.5 && z < h[3] + 1.5)) continue;
          if (physics.boxes.some(b => b.maxy > 0.2 && b.miny < 6 && x > b.minx - 1.6 && x < b.maxx + 1.6 && z > b.minz - 1.6 && z < b.maxz + 1.6)) continue;
          flat(manholeMat, 1.3, 1.3, x, z, 0.022);
          decorate(x, z, 0, 0, 8 + rnd() * 2.5, 0, 'tree');
        }
      }
    } });
    // brick sidewalks (o.brick = sides), clipped around crossing roads and stairwells
    for (const r of ROADS) {
      const [x0, z0, x1, z1, ax] = r, o = r[5] || {};
      if (!o.brick) continue;
      const alongX = ax === 'x';
      for (const sd of o.brick) {
        const e = sd < 0 ? (alongX ? z0 : x0) : (alongX ? z1 : x1), f = e + sd * 3.4;
        const strip = alongX ? [x0, Math.min(e, f), x1, Math.max(e, f)] : [Math.min(e, f), z0, Math.max(e, f), z1];
        const cutR = ROADS.map(q => [q[0], q[1], q[2], q[3]]);
        for (const [a, b, c, d] of rectsMinus(strip, [...cutR, ...HOLES])) planePiece(M.brick, c - a, d - b, (a + c) / 2, (b + d) / 2, 0.012, 0, 0xc89a80);
      }
    }
    // two-globe lamp posts along every sidewalk, with banners and hanging flower baskets
    afterLayout.push(() => { for (const r of ROADS) {
      const [x0, z0, x1, z1, ax] = r;
      const alongX = ax === 'x', L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1;
      for (const sd of [-1, 1]) {
        const w = (sd < 0 ? (alongX ? z0 : x0) : (alongX ? z1 : x1)) + sd * 0.65;
        for (let l = L0 + 7 + rnd() * 3; l < L1 - 3; l += 15 + rnd() * 3) {
          const x = alongX ? l : w, z = alongX ? w : l;
          if (Math.abs(x) > HX - 11 || Math.abs(z) > HZ - 1) continue;
          if (ROADS.some(q => x > q[0] - 3 && x < q[2] + 3 && z > q[1] - 3 && z < q[3] + 3 && q !== r)) continue;
          if (HOLES.some(h => x > h[0] - 1 && x < h[2] + 1 && z > h[1] - 1 && z < h[3] + 1)) continue;
          if (physics.boxes.some(b => b.maxy > 0.2 && b.miny < 5 && x > b.minx - 1.2 && x < b.maxx + 1.2 && z > b.minz - 1.2 && z < b.maxz + 1.2)) continue;
          solid(x, z, 0.26, 0.26, 4, 0, 'metal');
          put(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10), M.iron, x, 0.25, z, 0, { grime: 0.3 });
          put(new THREE.CylinderGeometry(0.07, 0.1, 4.0, 10), M.iron, x, 2.2, z, 0, { grime: 0.1 });
          const ax2 = alongX ? 1 : 0, az2 = alongX ? 0 : 1;
          put(flatBox(alongX ? 1.0 : 0.05, 0.05, alongX ? 0.05 : 1.0, 0), M.iron, x, 4.15, z, 0, { grime: 0 });
          for (const k of [-1, 1]) { const gx = x + ax2 * k * 0.45, gz = z + az2 * k * 0.45; put(new THREE.SphereGeometry(0.2, 12, 9), M.bulb, gx, 4.42, gz, 0, { grime: 0, cast: false }); glows.push([gx, 4.42, gz, 1.2]); }
          if (rnd() < 0.6) { // banner on the street side
            put(new THREE.PlaneGeometry(0.55, 1.1), M.cloth, x - (alongX ? 0 : sd * 0.32), 3.2, z - (alongX ? sd * 0.32 : 0), alongX ? 0 : Math.PI / 2, { tint: [0x7a2a24, 0x2f5a6a, 0x3d5a3a][(rnd() * 3) | 0], grime: 0, cast: false });
          }
          if (rnd() < 0.7) for (const k of [-1, 1]) { // hanging baskets
            const bx = x + ax2 * k * 0.45, bz = z + az2 * k * 0.45;
            put(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.iron, bx, 3.75, bz, 0, { grime: 0.1 });
            put(new THREE.IcosahedronGeometry(0.4, 1), M.leaf, bx, 3.78, bz, rnd() * 6, { grime: 0, tint: 0x6f8a3a, sy: 0.6 });
            for (let f = 0; f < 6; f++) put(new THREE.SphereGeometry(0.07, 6, 5), M.paint, bx + (rnd() - 0.5) * 0.6, 3.7 + rnd() * 0.3, bz + (rnd() - 0.5) * 0.6, 0, { grime: 0, tint: [0xd8342a, 0xc2448a, 0xf0ece0, 0x7a4ac8][(rnd() * 4) | 0] });
          }
        }
      }
    } });
    // signal lenses: one material per lamp colour and direction, so the lights can change
    const LENS = [0xff3a24, 0xffb020, 0x3cff7a];
    for (const d of ['x', 'z']) for (const col of LENS) signalMats[d].push(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 0.05, roughness: 0.3 }));
    const head = (x, y, z, ry, d) => {
      put(flatBox(0.36, 1.0, 0.28, 0), M.paint, x, y, z, ry, { tint: 0x2b3a2a, grime: 0.15 });
      const nx = Math.sin(ry), nz = Math.cos(ry);
      for (let k = 0; k < 3; k++) {
        const ly = y + 0.3 - k * 0.3;
        put(new THREE.CircleGeometry(0.11, 16), signalMats[d][k], x + nx * 0.145, ly, z + nz * 0.145, ry, { grime: 0, cast: false });
        put(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 12, 1, true, -Math.PI / 2, Math.PI), M.paint, x + nx * 0.2, ly + 0.02, z + nz * 0.2, ry, { rx: Math.PI / 2, tint: 0x2b3a2a, grime: 0 });
      }
      put(flatBox(0.56, 1.2, 0.03, 0), M.paint, x - nx * 0.15, y, z - nz * 0.15, ry, { tint: 0x1c1c1c, grime: 0 }); // backplate
    };
    const free = (x, z) => !physics.boxes.some(b => b.maxy > 0.2 && b.miny < 3 && x > b.minx - 0.3 && x < b.maxx + 0.3 && z > b.minz - 0.3 && z < b.maxz + 0.3)
      && !ROADS.some(q => x > q[0] && x < q[2] && z > q[1] && z < q[3]);
    placeSignals = () => { for (const I of inters) {
      const D = I.z1 - I.z0;
      // two diagonal corners; each pole carries a mast arm over one road and a head on the pole for the other
      for (const [cx, cz, sx, sz] of [[I.x1 + 0.7, I.z1 + 0.7, 1, 1], [I.x0 - 0.7, I.z0 - 0.7, -1, -1]]) {
        if (!free(cx, cz)) continue;
        solid(cx, cz, 0.3, 0.3, 4, 0, 'metal');
        put(new THREE.CylinderGeometry(0.11, 0.14, 6.2, 10), M.paint, cx, 3.1, cz, 0, { tint: 0x3a4a3a, grime: 0.3 });
        put(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), M.paint, cx, 0.25, cz, 0, { tint: 0x3a4a3a, grime: 0.5 });
        // mast arm across the x-direction road (spans z), signal faces the oncoming x-traffic
        const armL = D * 0.6;
        put(new THREE.CylinderGeometry(0.06, 0.08, armL, 8), M.paint, cx, 5.9, cz - sz * armL / 2, 0, { rx: Math.PI / 2, tint: 0x3a4a3a, grime: 0 });
        head(cx, 5.25, cz - sz * armL * 0.85, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 'x');
        // pole-mounted head for the z-direction road, facing its oncoming traffic
        head(cx - sx * 0.3, 3.4, cz, sz > 0 ? 0 : Math.PI, 'z');
        head(cx + sx * 0.05, 3.4, cz - sz * 0.3, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 'x');
        // street name sign and a walk button
        put(flatBox(1.3, 0.28, 0.03, 0), M.paint, cx, 4.6, cz - sz * 0.2, sx > 0 ? 0 : Math.PI, { tint: 0x2f6a3a, grime: 0 });
        put(flatBox(0.12, 0.18, 0.08, 0), M.paint, cx + sx * 0.14, 1.1, cz, 0, { tint: 0xd9b54a, grime: 0.1 });
      }
    } };
  }

  // A proper window on a solid facade: recessed dark glass, painted frame with mullions, stone sill and
  // lintel, and now and then curtains, open shutters or a grime streak below. (px,pz) on the wall face,
  // (nx,nz) outward normal, y = window centre.
  const windowDecor = (px, pz, nx, nz, y, ww = 1.15, wh = 1.45) => {
    const ry = Math.atan2(nx, nz), ax = -nz, az = nx;
    const at = (o, a = 0) => [px + nx * o + ax * a, pz + nz * o + az * a];
    let [x, z] = at(0.012);
    put(flatBox(ww, wh, 0.02, 0), M.dim, x, y, z, ry, { grime: 0 });
    [x, z] = at(0.045);
    const lit = rnd() < 0.12;
    put(flatBox(ww - 0.06, wh - 0.06, 0.012, 0), M.glass, x, y, z, ry, { grime: 0, tint: lit ? 0xd8c9a0 : 0xffffff });
    if (rnd() < 0.35) { [x, z] = at(0.03); put(flatBox(ww * 0.45, wh * 0.85, 0.01, 0), M.cloth, x + ax * ww * 0.25, y + 0.02, z + az * ww * 0.25, ry, { grime: 0, tint: [0xd9cfb8, 0x8a2f2a, 0x5a6b7a][Math.floor(rnd() * 3)] }); }
    const ft = 0.07, fd = 0.1, ftint = [0xe9e3d6, 0x5a4a3a, 0x3d4f5a][Math.floor(rnd() * 3)];
    [x, z] = at(0.05);
    for (const sx of [-1, 1]) put(flatBox(ft, wh + ft, fd, 0), M.frame, x + ax * sx * (ww / 2 + ft / 2 - 0.02), y, z + az * sx * (ww / 2 + ft / 2 - 0.02), ry, { grime: 0, tint: ftint });
    put(flatBox(ww + ft * 2, ft, fd + 0.01, 0), M.frame, x, y + wh / 2 + ft / 2 - 0.02, z, ry, { grime: 0, tint: ftint });   // (a hair deeper than the sides: their corners overlap)
    put(flatBox(0.04, wh, 0.05, 0), M.frame, x, y, z, ry, { grime: 0, tint: ftint });
    put(flatBox(ww, 0.04, 0.05, 0), M.frame, x, y + wh * 0.18, z, ry, { grime: 0, tint: ftint });
    [x, z] = at(0.08);
    put(flatBox(ww + 0.3, 0.07, 0.16, 3), M.concrete, x, y - wh / 2 - 0.05, z, ry, { grime: 0.1, tint: 0xe2dccf, base: y - 2 });
    put(flatBox(ww + 0.24, 0.16, 0.12, 3), M.concrete, x, y + wh / 2 + 0.11, z, ry, { grime: 0, tint: 0xe2dccf, base: y });
    if (rnd() < 0.28) for (const sx of [-1, 1]) {
      [x, z] = at(0.07);
      put(flatBox(ww / 2, wh, 0.04, 1.2), M.woodOld, x + ax * sx * (ww * 0.78), y, z + az * sx * (ww * 0.78), ry, { grime: 0, tint: [0x6f8a6a, 0x7a5a3a, 0x4d6b7a][Math.floor(rnd() * 3)] });
    }
    if (rnd() < 0.55) { [x, z] = at(0.02); decal(streakMat, ww * 0.9, 1.2, x, y - wh / 2 - 0.7, z, ry); }
  };

  // Enterable one-storey house: wall segments around door and window openings (each its own collision
  // box), framed openings, roof slab, tiled floor, a few props, a hanging lamp.
  const OPEN_W = { d: 1.9, w: 1.4 };
  const mirrorSpec = (sp) => {
    const neg = (l) => (l || []).map(([k, at, wd]) => [k, -at, wd]);
    return { n: neg(sp.s), s: neg(sp.n), e: neg(sp.w), w: neg(sp.e), props: (sp.props || []).map(([k, a, b, r]) => [k, -a, -b, r]), light: sp.light };
  };
  const buildHouse = (cx, cz, w, d, h, y0, spec, team) => {
    const T = 0.3;
    const brick = spec.stone ? true : rnd() < 0.5;
    const wallMat = spec.stone ? M.stone : brick ? M.brick : M.plaster;
    const tint = spec.stone ? 0xa79d8c : brick ? 0xf2e6dc : plasterTints[Math.floor(rnd() * plasterTints.length)];
    const inner = 0xece6da;
    const sides = [
      { k: 'n', ax: 1, az: 0, nx: 0, nz: 1, len: w, ox: cx, oz: cz + d / 2 - T / 2 },
      { k: 's', ax: 1, az: 0, nx: 0, nz: -1, len: w, ox: cx, oz: cz - d / 2 + T / 2 },
      { k: 'e', ax: 0, az: 1, nx: 1, nz: 0, len: d - 2 * T, ox: cx + w / 2 - T / 2, oz: cz },
      { k: 'w', ax: 0, az: 1, nx: -1, nz: 0, len: d - 2 * T, ox: cx - w / 2 + T / 2, oz: cz },
    ];
    for (const S of sides) {
      const ry = Math.atan2(S.nx, S.nz);
      const seg = (a, b, y1, y2) => {
        if (b - a < 0.02 || y2 - y1 < 0.02) return;
        const mid = (a + b) / 2, L = b - a;
        const x = S.ox + S.ax * mid, z = S.oz + S.az * mid;
        const bw = S.ax ? L : T, bd = S.az ? L : T;
        solid(x, z, bw, bd, y2 - y1, y0 + y1, brick ? 'brick' : 'concrete');
        put(flatBox(bw, y2 - y1, bd, scaleOf(wallMat), 0.012), wallMat, x, y0 + y1 + (y2 - y1) / 2, z, 0, { tint, grime: 0.45, base: y0 });
        if (spec.stone) put(flatBox(S.ax ? L : 0.02, y2 - y1, S.az ? L : 0.02, scaleOf(M.brick)), M.brick, x - S.nx * (T / 2 + 0.012), y0 + y1 + (y2 - y1) / 2, z - S.nz * (T / 2 + 0.012), 0, { tint: 0xe8a888, grime: 0.15, base: y0 });
        if (y1 === 0 && L > 0.3) {
          // a darker rendered plinth along the foot of the outside wall
          const ox = S.nx * (T / 2 + 0.03), oz = S.nz * (T / 2 + 0.03);
          put(flatBox(S.ax ? L : 0.06, 0.45, S.az ? L : 0.06, scaleOf(M.concrete), 0.005), M.concrete, x + ox, y0 + 0.225, z + oz, 0, { tint: 0xa89e8e, grime: 0.5, base: y0 });
          // now and then a poster or a spray tag on the outside
          if (L > 1.3 && rnd() < 0.3 && y2 > 2.2) decal(posterMat[Math.floor(rnd() * posterMat.length)], 0.7, 1.0, x + S.nx * (T / 2 + 0.02) + S.ax * (rnd() - 0.5) * (L - 1), y0 + 1.5, z + S.nz * (T / 2 + 0.02) + S.az * (rnd() - 0.5) * (L - 1), ry);
        }
      };
      const ops = (spec[S.k] || []).map(([k, at, wd]) => { const ww = wd || OPEN_W[k]; return { k, a: Math.max(-S.len / 2 + 0.25, at - ww / 2), b: Math.min(S.len / 2 - 0.25, at + ww / 2), at }; }).sort((p, q) => p.a - q.a);
      let cur = -S.len / 2;
      for (const o of ops) {
        seg(cur, o.a, 0, h);
        const ow = o.b - o.a, mid = (o.a + o.b) / 2;
        const fx = S.ox + S.ax * mid, fz = S.oz + S.az * mid;
        if (o.k === 'd') {
          seg(o.a, o.b, 2.3, h);
          // door frame + a battered door swung open against the inside wall
          for (const sx of [-1, 1]) put(flatBox(0.09, 2.3, T + 0.06, 0), M.frame, fx + S.ax * sx * (ow / 2 - 0.04), y0 + 1.15, fz + S.az * sx * (ow / 2 - 0.04), ry, { grime: 0.2, tint: 0x5a4632, base: y0 });
          put(flatBox(ow + 0.1, 0.12, T + 0.07, 0), M.frame, fx, y0 + 2.35, fz, ry, { grime: 0, tint: 0x5a4632 });   // its underside 1 cm below the wall's
          if (rnd() < 0.7) {
            const hx = fx + S.ax * (ow / 2 - 0.08) - S.nx * (T / 2 + 0.45), hz = fz + S.az * (ow / 2 - 0.08) - S.nz * (T / 2 + 0.45);
            put(flatBox(0.85, 2.15, 0.05, 1.2), M.woodOld, hx, y0 + 1.1, hz, ry + Math.PI / 2, { grime: 0.3, tint: [0x6f5a3a, 0x3d4f5a, 0x7a3a2a][Math.floor(rnd() * 3)], base: y0 });
            // solid (you can't walk through it); bots keep the doorway, they pass well clear of it
            const db = solid(hx, hz, S.ax ? 0.06 : 0.85, S.ax ? 0.85 : 0.06, 2.15, y0 + 0.03, 'wood'); db.navIgnore = true;
          }
          // threshold
          put(flatBox(ow, 0.07, T + 0.1, 0), M.concrete, fx, y0 + 0.035, fz, ry, { grime: 0.3, tint: 0xbab3a4 });   // (a sill on the floor, clear of the floor's tiles)
        } else {
          seg(o.a, o.b, 0, 1.0);
          seg(o.a, o.b, 2.1, h);
          // open window: frame, sill, a few glass shards left in the corners
          // (deeper than the wall plus a brick lining inside, 2.2 cm: flush with it, the two flicker)
          for (const sx of [-1, 1]) put(flatBox(0.07, 1.1, T + 0.07, 0), M.frame, fx + S.ax * sx * (ow / 2 - 0.035), y0 + 1.55, fz + S.az * sx * (ow / 2 - 0.035), ry, { grime: 0, tint: 0xe9e3d6 });
          put(flatBox(ow + 0.14, 0.07, T + 0.08, 0), M.frame, fx, y0 + 2.07, fz, ry, { grime: 0, tint: 0xe9e3d6 });
          put(flatBox(ow + 0.3, 0.07, T + 0.18, 3), M.concrete, fx, y0 + 0.98, fz, ry, { grime: 0.15, tint: 0xe2dccf });
          for (const sx of [-1, 1]) if (rnd() < 0.6) {
            const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.22 + rnd() * 0.2, 0, 0), new THREE.Vector3(0, 0.35 + rnd() * 0.3, 0)]);
            g.setIndex([0, 1, 2, 0, 2, 1]); g.computeVertexNormals();
            put(g, M.glass, fx + S.ax * sx * (ow / 2 - 0.08), y0 + (rnd() < 0.5 ? 1.02 : 1.7), fz + S.az * sx * (ow / 2 - 0.08), ry + (sx < 0 ? 0 : Math.PI), { grime: 0, cast: false });
          }
          decal(streakMat, ow * 0.9, 1.0, fx + S.nx * (T / 2 + 0.01), y0 + 0.42, fz + S.nz * (T / 2 + 0.01), ry);
        }
        cur = o.b;
      }
      seg(cur, S.len / 2, 0, h);
      // wall fittings: a drainpipe down one corner, an AC unit or a meter box above the openings
      const wx = (a, o = T / 2) => [S.ox + S.ax * a + S.nx * o, S.oz + S.az * a + S.nz * o];
      if (rnd() < 0.5) {
        const [px, pz] = wx((rnd() < 0.5 ? -1 : 1) * (S.len / 2 - 0.2), T / 2 + 0.07);
        put(new THREE.CylinderGeometry(0.045, 0.045, h, 8), M.metal, px, y0 + h / 2, pz, 0, { tint: 0x8a8f94, grime: 0.4, base: y0 });
      }
      if (rnd() < 0.45) {
        const [px, pz] = wx((rnd() - 0.5) * (S.len - 1.6), T / 2 + 0.2);
        put(worldBox(0.8, 0.5, 0.36, 0), M.paint, px, y0 + h - 0.62, pz, ry, { tint: 0xd8d6cf, grime: 0.25, base: y0 + h - 1 });
        put(flatBox(0.62, 0.36, 0.02, 0), M.dim, px + S.nx * 0.19, y0 + h - 0.62, pz + S.nz * 0.19, ry, { grime: 0 });
      } else if (rnd() < 0.4) {
        const [px, pz] = wx((rnd() - 0.5) * (S.len - 1.6), T / 2 + 0.08);
        put(worldBox(0.4, 0.5, 0.16, 0), M.paint, px, y0 + h - 0.75, pz, ry, { tint: 0x9aa39a, grime: 0.3, base: y0 + h - 1.2 });
      }
      // sand drifted against the outside of the wall
      if (rnd() < 0.6) decal(driftMat, S.len * 0.6, 1.2, S.ox + S.nx * (T / 2 + 0.45) + S.ax * (rnd() - 0.5) * S.len * 0.4, y0 + 0.035, S.oz + S.nz * (T / 2 + 0.45) + S.az * (rnd() - 0.5) * S.len * 0.4, ry, -Math.PI / 2);
    }
    // roof slab, cornice, rooftop clutter
    solid(cx, cz, w + 0.2, d + 0.2, 0.25, y0 + h, 'concrete');
    put(flatBox(w + 0.2, 0.25, d + 0.2, scaleOf(M.concrete), 0.02), M.concrete, cx, y0 + h + 0.125, cz, 0, { grime: 0.05, tint: 0xd6d0c4, base: y0 + h });
    put(flatBox(w + 0.34, 0.1, d + 0.34, 3, 0.02), M.concrete, cx, y0 + h - 0.08, cz, 0, { grime: 0, tint: 0xe6e0d4 });
    // a proper cornice: a deeper moulded band under the roof edge that casts a line of shadow
    put(flatBox(w + 0.5, 0.16, d + 0.5, 3, 0.02), M.concrete, cx, y0 + h - 0.26, cz, 0, { grime: 0.1, tint: 0xd0c9bc });
    if (rnd() < 0.6 && !spec.light) put(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 14), M.metal, cx + (rnd() - 0.5) * (w - 2), y0 + h + 0.75, cz + (rnd() - 0.5) * (d - 2), 0, { tint: 0x3d6b8a, grime: 0.2, base: y0 + h });
    // floor
    const fl = new THREE.PlaneGeometry(w - 2 * T, d - 2 * T);
    const center = cx === 0 && cz === 0 && M.centerFloor;
    const flMat = spec.stone ? M.wood : center ? M.centerFloor : M.houseFloor || M.tile, flS = spec.stone ? 1.4 : center ? 3.2 : M.houseFloor ? 2.2 : 1.6;
    const uv = fl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w - 2 * T) / flS, uv.getY(i) * (d - 2 * T) / flS);
    put(fl, flMat, cx, y0 + 0.03, cz, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: spec.stone ? 0xd2a070 : flMat === M.tile ? 0xd8cbb4 : 0xf2ece2 });
    // a corkboard of maps and notes on the back wall of the big halls (CC-BY 4.0, "Corkboard" by XIN)
    if (PROPS.corkboard && w >= 10) for (const pt of PROPS.corkboard.parts) put(pt.geo.clone(), pt.mat, cx, y0 + 1.65, cz + d / 2 - T - 0.07, Math.PI, { grime: 0, cast: false });   // clear of a brick-lined wall's veneer
    // props
    for (const [k, dx, dz, rot] of spec.props || []) {
      const px = cx + dx, pz = cz + dz;
      if (k === 'table') {
        solid(px, pz, 1.6, 0.9, 0.12, y0 + 0.7, 'wood');   // only the top: you can shoot (and crawl) under it
        put(flatBox(1.6, 0.06, 0.9, 1.2), M.wood, px, y0 + 0.77, pz, 0, { grime: 0, tint: 0x9a7a52 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(flatBox(0.06, 0.74, 0.06, 0), M.wood, px + sx * 0.72, y0 + 0.37, pz + sz * 0.38, 0, { grime: 0, tint: 0x6a5238 });
        put(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), M.paint, px + 0.3, y0 + 0.86, pz, 0, { grime: 0, tint: 0xd8d2c0 });
      } else if (k === 'shelf') {
        // tall metal shelving unit with boxes: blocks the view straight through the house
        const along = !rot;
        const sw = along ? 1.8 : 0.5, sd = along ? 0.5 : 1.8;
        solid(px, pz, sw, sd, 2.0, y0, 'metal');
        for (const yy of [0.05, 0.7, 1.35, 1.95]) put(flatBox(sw, 0.04, sd, 0), M.metal, px, y0 + yy, pz, 0, { grime: 0, tint: 0x7a8088 });
        // solid back and end panels: it blocks bullets, so you can't see through it either
        put(flatBox(along ? sw : 0.03, 1.96, along ? 0.03 : sd, 1.5), M.metal, px, y0 + 1.0, pz, 0, { grime: 0.1, tint: 0x5e646c });
        for (const s of [-1, 1]) put(flatBox(along ? 0.03 : sw, 1.96, along ? sd : 0.03, 1.5), M.metal, px + (along ? s * (sw / 2 - 0.015) : 0), y0 + 1.0, pz + (along ? 0 : s * (sd / 2 - 0.015)), 0, { grime: 0.1, tint: 0x5e646c });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(flatBox(0.04, 2.0, 0.04, 0), M.dark, px + sx * (sw / 2 - 0.02), y0 + 1.0, pz + sz * (sd / 2 - 0.02), 0, { grime: 0 });
        for (const yy of [0.07, 0.72, 1.37]) for (let i = 0; i < 3; i++) {
          const o = (i - 1) * (along ? 0.55 : 0) , q = (i - 1) * (along ? 0 : 0.55);
          put(flatBox(along ? 0.45 : 0.4, 0.42 + rnd() * 0.15, along ? 0.4 : 0.45, 0), M.paint, px + o, y0 + yy + 0.25, pz + q, 0, { grime: 0.1, tint: [0xb8a27a, 0x8a7458, 0x4d5536, 0xd8d0b8][Math.floor(rnd() * 4)] });
        }
      } else if (k === 'bar') {
        // a long wooden bar with a brass foot rail, bottles on the back shelf and stools
        const along = !rot, L = 4.2, bw2 = along ? L : 0.7, bd2 = along ? 0.7 : L;
        solid(px, pz, bw2, bd2, 1.1, y0, 'wood');
        put(flatBox(bw2, 1.05, bd2, 1.2), M.wood, px, y0 + 0.525, pz, 0, { grime: 0.1, tint: 0x6a4a30 });
        put(flatBox(bw2 + 0.1, 0.06, bd2 + 0.15, 1.2), M.wood, px, y0 + 1.08, pz, 0, { grime: 0, tint: 0x8a6440 });
        for (let i = 0; i < 9; i++) {
          const t = -L / 2 + 0.3 + i * (L - 0.6) / 8;
          put(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 8), M.glass, px + (along ? t : 0.12), y0 + 1.25, pz + (along ? 0.12 : t), 0, { grime: 0, tint: [0x5a8a4a, 0xa86a2a, 0xd8d2c0][i % 3] });
          if (i % 2 === 0) { const sx = px + (along ? t : -0.75), sz = pz + (along ? -0.75 : t); put(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), M.wood, sx, y0 + 0.75, sz, 0, { grime: 0, tint: 0x5a3a24 }); put(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), M.metal, sx, y0 + 0.36, sz, 0, { grime: 0 }); }
        }
      } else if (k === 'crates') {
        solid(px, pz, 1.2, 1.2, 1.2, y0, 'wood');
        put(flatBox(1.2, 1.2, 1.2, 1.2), M.wood, px, y0 + 0.6, pz, 0, { grime: 0.2, tint: 0xcfb08a, base: y0 });
        put(flatBox(0.8, 0.5, 0.6, 0), M.paint, px + 0.1, y0 + 1.45, pz, 0.3, { grime: 0.1, tint: 0x4d5536 });
      }
    }
    // hanging bulb (and a real light if asked)
    put(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), M.dark, cx, y0 + h - 0.3, cz, 0, { grime: 0, cast: false });
    put(new THREE.SphereGeometry(0.06, 10, 8), M.bulb, cx, y0 + h - 0.65, cz, 0, { grime: 0, cast: false });
    glows.push([cx, y0 + h - 0.65, cz, 0.45]);
    if (spec.light) { const L = new THREE.PointLight(0xffc68a, spec.stone ? 9 : 5, spec.stone ? 12 : 9, 1.6); L.position.set(cx, y0 + h - 0.8, cz); L.userData.mapLight = true; group.add(L); }
    if (spec.stone) for (const [fx2, fz2] of [[-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3]]) {
      // shop pendants: green enamel shades over warm bulbs
      const lx = cx + fx2 * w, lz = cz + fz2 * d;
      put(new THREE.CylinderGeometry(0.006, 0.006, 0.8, 4), M.dark, lx, y0 + h - 0.4, lz, 0, { grime: 0, cast: false });
      put(bothSides(new THREE.ConeGeometry(0.28, 0.22, 14, 1, true)), M.paint, lx, y0 + h - 0.85, lz, 0, { tint: 0x2f5a3a, grime: 0 });
      put(new THREE.SphereGeometry(0.07, 10, 8), M.bulb, lx, y0 + h - 0.95, lz, 0, { grime: 0, cast: false });
      glows.push([lx, y0 + h - 0.95, lz, 0.5]);
    }
  };

  // sandbag: a pillowy bag that pinches at the ends, so rows nest into each other
  const bagGeo = (() => {
    const g = LOW_DETAIL ? new THREE.BoxGeometry(0.6, 0.2, 0.36, 4, 1, 1) : new RoundedBoxGeometry(0.6, 0.2, 0.36, 2, 0.09);  // low: 36 triangles instead of 300
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const e = Math.min(1, Math.abs(x) / 0.3);
      p.setY(i, y * (1 - 0.35 * e * e) + (y > 0 ? 0.015 * (1 - e) : 0));
      p.setZ(i, z * (1 - 0.18 * e * e));
    }
    g.computeVertexNormals();
    return g;
  })();
  const bag = (x, y, z, ry, tint) => {
    const g = bagGeo.clone();
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * 0.36);
    put(g, M.bag, x, y, z, ry + (rnd() - 0.5) * 0.12, { rz: (rnd() - 0.5) * 0.06, rx: (rnd() - 0.5) * 0.05, sy: 0.92 + rnd() * 0.16, grime: 0.12, tint });
  };

  // ---------- dressing per collision kind ----------
  let station = null;   // King Street Station (Pioneer Square): its trains run in world.update
  const shutterTints = [0x9c9c94, 0x6e7f86, 0x8a7a62, 0x7d8a6a];
  const signTints = [0x2f5a6a, 0x8a2f2a, 0xb08a3a, 0x3d5a3a, 0xd9d2c0];
  const plasterTints = [0xe9e7e2, 0xc9cbc8, 0xb4c0c8, 0xd6d0c6, 0xa8b6a2, 0xc6a698, 0xdcd8cf, 0x9fa7ad];   // painted render: greys, off-whites, slate, sage, brick-red
  let kioskSign = null;
  const decorate = (cx, cz, w, d, h, y0, kind, extra, team) => {
    const x0 = cx - w / 2, z0 = cz - d / 2;
    switch (kind) {
      case 'building': {
        B(M.concrete, w, h, d, cx, y0, cz, 0, { grime: 0.45 });
        B(M.concrete, w + 0.3, 0.2, d + 0.3, cx, h - 0.17, cz, 0, { grime: 0, tint: 0xd8d4cc }); // sits 3 cm proud so its top never z-fights the roof
        // fake openings: dark recessed doorways and windows on all four faces
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ry = Math.atan2(nx, nz);
          const px = cx + nx * (w / 2 + 0.01), pz = cz + nz * (d / 2 + 0.01);
          const ax = -nz, az = nx;
          for (const s of [-2.2, 2.2]) {
            put(worldBox(1.3, 1.1, 0.06, 0), M.glass, px + ax * s, 1.6, pz + az * s, ry, { grime: 0 });
            put(worldBox(1.5, 0.14, 0.18, 3), M.concrete, px + ax * s, 1.0, pz + az * s, ry, { grime: 0.1 });
          }
          put(worldBox(1.2, 2.1, 0.05, 0), M.rubber, px, 1.05, pz, ry, { grime: 0 });
        }
        break;
      }
      case 'house':
        buildHouse(cx, cz, w, d, h, y0, extra || {}, team);
        break;
      case 'block': {
        // tall solid building with real windows on every floor and a roof cap that stands proud
        const tint = plasterTints[Math.floor(rnd() * plasterTints.length)];
        const mat = rnd() < 0.55 ? M.brick : M.plaster;
        B(mat, w, h, d, cx, y0, cz, 0, { grime: 0.5, tint: mat === M.brick ? 0xffffff : tint });
        B(M.concrete, w + 0.3, 0.3, d + 0.3, cx, h - 0.27, cz, 0, { grime: 0, tint: 0xd8d2c4 });
        B(M.concrete, w + 0.12, 0.35, d + 0.12, cx, 0, cz, 0, { grime: 0.5 });
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const L = nx ? d : w, ax = -nz, az = nx;
          const n = Math.max(1, Math.floor(L / 2.3));
          for (let f = 0; f * 3.2 + 3 < h; f++) for (let i = 0; i < n; i++) {
            const t = -L / 2 + (i + 0.5) * (L / n);
            const px = cx + nx * (w / 2) + ax * t, pz = cz + nz * (d / 2) + az * t;
            if (f === 0 && i === Math.floor(n / 2)) {
              // ground floor: a boarded-up doorway instead of a window
              put(flatBox(1.2, 2.2, 0.04, 0), M.dim, px + nx * 0.012, 1.1, pz + nz * 0.012, Math.atan2(nx, nz), { grime: 0 });
              for (let k = 0; k < 4; k++) put(flatBox(1.3, 0.16, 0.04, 1.2), M.woodOld, px + nx * 0.05, 0.4 + k * 0.5 + rnd() * 0.1, pz + nz * 0.05, Math.atan2(nx, nz), { rz: (rnd() - 0.5) * 0.25, grime: 0, tint: 0x8a7458 });
              continue;
            }
            windowDecor(px, pz, nx, nz, f * 3.2 + 1.6);
          }
        }
        if (rnd() < 0.7) put(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14), M.metal, cx + (rnd() - 0.5) * (w - 2), h + 0.68, cz + (rnd() - 0.5) * (d - 2), 0, { tint: 0x3d6b8a, grime: 0.2, base: h });
        // posters and tags pasted on the ground floor, between two windows (over one, they showed through it)
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (rnd() < 0.45) continue;
          const L = nx ? d : w, n = Math.max(1, Math.floor(L / 2.3));
          if (n < 2) continue;
          const t = -L / 2 + (1 + Math.floor(rnd() * (n - 1))) * (L / n);
          const px = cx + nx * (w / 2 + 0.015) + -nz * t, pz = cz + nz * (d / 2 + 0.015) + nx * t;
          decal(posterMat[Math.floor(rnd() * posterMat.length)], 0.7, 1.0, px, 1.45 + rnd() * 0.3, pz, Math.atan2(nx, nz));
        }
        break;
      }
      case 'lamp': break;
      case 'light': {
        const L = new THREE.PointLight(0xffc68a, 7, 11, 1.6);
        L.position.set(cx, extra || 3.5, cz);
        L.userData.mapLight = true;
        group.add(L);
        break;
      }
      case 'lights': {
        // festoon lights: a sagging cable between two anchors with warm bulbs along it
        const [x1, z1, x2, z2] = extra;
        const a = new THREE.Vector3(x1, 4.1, z1), b = new THREE.Vector3(x2, 4.1, z2);
        const m = a.clone().lerp(b, 0.5); m.y -= 0.9;
        const curve = new THREE.QuadraticBezierCurve3(a, m, b);
        put(new THREE.TubeGeometry(curve, 24, 0.01, 4), M.rubber, 0, 0, 0, 0, { grime: 0, cast: false });
        const n = Math.max(4, Math.round(a.distanceTo(b) / 0.8));
        for (let i = 1; i < n; i++) {
          const p = curve.getPoint(i / n);
          put(new THREE.SphereGeometry(0.05, 8, 6), M.bulb, p.x, p.y - 0.08, p.z, 0, { grime: 0, cast: false });
          glows.push([p.x, p.y - 0.08, p.z, 0.55]);
        }
        break;
      }
      case 'parapet': {
        B(M.concrete, w, h, d, cx, y0, cz, 0, { grime: 0.3, base: y0 });
        for (let i = 0; i < 4; i++) {
          const along = w > d;
          const t = (i + 0.5) / 4 - 0.5;
          put(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), M.rust, cx + (along ? t * w : 0), y0 + h + 0.25, cz + (along ? 0 : t * d), 0, { rz: (rnd() - 0.5) * 0.6, grime: 0 });
        }
        break;
      }
      case 'stairs':
        if (PROPS.stairs) {
          // wooden staircase model (CC-BY 4.0, "Wooden Stairs_5_MB" by Mehdi Shahsavan) over the step boxes:
          // one flight per stair run, placed on its first step
          if (extra === 1) {
            const st = PROPS.stairs.parts[0], dir = Math.sign(cx) || 1;
            // the model's treads (its height includes the handrail): scaled so the step after its top tread is
            // the roof, and the collision is those treads exactly, so you walk on what you see
            const tr = stairTreads(st.geo), rise = (tr[tr.length - 1].y - tr[0].y) / (tr.length - 1);
            const sx = 6.3 / 3.48, sy = (h * 7 - 0.05) / (tr[tr.length - 1].y + rise), sz = 3.0 / 1.62, ox = cx - dir * 2.7;
            put(st.geo.clone(), st.mat, ox, 0, cz, dir > 0 ? Math.PI : 0, { sx, sy, sz, grime: 0 });
            for (const t of tr) {
              const xa = ox - dir * t.x0 * sx, xb = ox - dir * t.x1 * sx, top = t.y * sy;
              solid((xa + xb) / 2, cz, Math.abs(xb - xa), (t.z1 - t.z0) * sz, Math.min(0.3, top), top - Math.min(0.3, top), 'wood');
            }
          }
          break;
        }
        B(M.concrete, w, h, d, cx, y0, cz, 0, { grime: 0.35 });
        if (extra % 2 === 0) put(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), M.dark, cx, h + 0.5, cz + Math.sign(cz) * (d / 2 - 0.05) * -1, 0, { grime: 0 });
        break;
      case 'wall': {
        const tint = plasterTints[(extra + (team ? 2 : 0)) % plasterTints.length];
        B(M.plaster, w, h, d, cx, y0, cz, 0, { tint, grime: 0.5 });
        B(M.concrete, w + 0.12, 0.16, d + 0.12, cx, h, cz, 0, { grime: 0, tint: 0xd8d2c4 });
        B(M.concrete, w + 0.08, 0.35, d + 0.08, cx, 0, cz, 0, { grime: 0.5 });
        // rubble at the base
        for (let i = 0; i < 6; i++) {
          const s = 0.15 + rnd() * 0.3;
          put(worldBox(s, s * 0.7, s, 3), M.concrete, x0 + rnd() * w, s * 0.3, cz + (rnd() < 0.5 ? -1 : 1) * (d / 2 + 0.3 + rnd() * 0.4), rnd() * 3, { rx: rnd(), grime: 0.3 });
        }
        break;
      }
      case 'kiosk': {
        // street kiosk (newsstand / coffee cart booth): painted steel with roller shutters on the long sides,
        // a flat canopy and a lit sign band; tall enough to break a sightline
        const KT = [0x2f4a3a, 0x24364a, 0x5a2a2a, 0x3a3c40, 0x2a4a52];
        const k = Math.abs(Math.round(cx * 3 + cz)) % KT.length;
        B(M.paint, w, h, d, cx, 0, cz, 0, { tint: KT[k], grime: 0.25 });
        B(M.concrete, w + 0.06, 0.2, d + 0.06, cx, 0, cz, 0, { grime: 0.5, tint: 0x8a8c8e });
        const along = w >= d, L = along ? w : d;
        B(M.metal, w + (along ? 0.3 : 1.3), 0.12, d + (along ? 1.3 : 0.3), cx, h, cz, 0, { grime: 0.1, tint: KT[k] });     // canopy
        for (const s2 of [-1, 1]) {
          const fx = cx + (along ? 0 : s2 * (w / 2 + 0.02)), fz = cz + (along ? s2 * (d / 2 + 0.02) : 0), ry = along ? (s2 > 0 ? 0 : Math.PI) : (s2 > 0 ? Math.PI / 2 : -Math.PI / 2);
          put(worldBox(L - 0.6, 1.6, 0.04, 1.6), M.metal, fx, 1.2, fz, ry, { tint: shutterTints[(Math.abs(Math.round(cx + cz)) + (s2 > 0 ? 1 : 0)) % 4], grime: 0.3 });
          put(worldBox(L - 0.2, 0.42, 0.05, 0), M.paint, fx, h - 0.35, fz, ry, { grime: 0, tint: signTints[(k + (s2 > 0 ? 1 : 0)) % signTints.length] });   // sign band
          if (rnd() < 0.6) decal(posterMat[Math.floor(rnd() * posterMat.length)], 0.5, 0.7, fx + (along ? (rnd() - 0.5) * (L - 1.2) : s2 * 0.03), 1.3, fz + (along ? s2 * 0.03 : (rnd() - 0.5) * (L - 1.2)), ry);
        }
        break;
      }
      case 'hutwall':
        B(M.brick, w, h, d, cx, y0, cz, 0, { grime: 0.45 });
        B(M.concrete, w + 0.1, 0.12, d + 0.1, cx, h - 0.09, cz, 0, { grime: 0 });
        break;
      case 'roof':
        B(M.concrete, w, h, d, cx, y0, cz, 0, { grime: 0, tint: 0xcfc9bd });
        put(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 14), M.metal, cx + 1.8, y0 + h + 0.55, cz - 1.8, 0, { grime: 0, tint: 0x8a8f94 });
        break;
      case 'crate': {
        B(M.wood, w, h, d, cx, y0, cz, 0, { grime: 0.25, base: y0, tint: 0xcfb08a });
        // frame battens
        const t = 0.08;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(M.wood, t, h, t, cx + sx * (w / 2 - t / 2 + 0.01), y0, cz + sz * (d / 2 - t / 2 + 0.01), 0, { grime: 0.2, base: y0, tint: 0x9a7a52 });
        B(M.dark, w + 0.04, 0.05, d + 0.04, cx, y0 + h * 0.5, cz, 0, { grime: 0, tint: 0x8a8a7a });   // 1 cm proud of the corner posts
        break;
      }
      case 'pallet': {
        B(M.woodOld, w, 0.14, d, cx, 0, cz, 0, { grime: 0.2, tint: 0xd8c4a4 });
        B(M.bag, w - 0.2, h - 0.16, d - 0.2, cx, 0.14, cz, 0, { grime: 0.1, tint: 0xbcb094 });   // the sacks behind the cartons: no see-through gaps (set back so the cartons' faces don't flicker against it)
        // shrink-wrapped cartons
        const rows = Math.round(h / 0.4);
        for (let r = 0; r < rows; r++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          put(worldBox(w / 2 - 0.06, 0.36, d / 2 - 0.06, 1), M.paint, cx + (i - 0.5) * w / 2, 0.34 + r * 0.38, cz + (j - 0.5) * d / 2, (r + i + j) % 2 ? 0 : 0.03, { grime: 0.15, tint: (r + i * 2 + j) % 3 ? 0xa88358 : 0xb8946a });
        }
        break;
      }
      case 'jersey': {
        const shape = new THREE.Shape();
        shape.moveTo(-0.31, 0); shape.lineTo(0.31, 0); shape.lineTo(0.31, 0.08); shape.lineTo(0.18, 0.3); shape.lineTo(0.1, 1.07);
        shape.lineTo(-0.1, 1.07); shape.lineTo(-0.18, 0.3); shape.lineTo(-0.31, 0.08); shape.closePath();
        // a run of 2 m sections along the barrier's long side (either axis)
        const along = d >= w, L = along ? d : w, n = Math.max(1, Math.round(L / 2)), sl = L / n;
        for (let i = 0; i < n; i++) {
          const g = new THREE.ExtrudeGeometry(shape, { depth: sl - 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3 });
          g.translate(0, 0, -(sl - 0.1) / 2);
          const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 3, uv.getY(k) / 3);
          const t = -L / 2 + (i + 0.5) * sl;
          put(g, M.concrete, cx + (along ? 0 : t), 0, cz + (along ? t : 0), (along ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.04, { grime: 0.35, tint: i % 2 ? 0xf0ece4 : 0xe0dbd0 });
        }
        break;
      }
      case 'sand': {
        // a short run of concrete jersey barriers with reflector strips (was a sandbag wall)
        const shape = new THREE.Shape();
        const hh = Math.min(h, 1.07), sc = hh / 1.07;
        shape.moveTo(-0.31, 0); shape.lineTo(0.31, 0); shape.lineTo(0.31, 0.08 * sc); shape.lineTo(0.18, 0.3 * sc); shape.lineTo(0.1, hh);
        shape.lineTo(-0.1, hh); shape.lineTo(-0.18, 0.3 * sc); shape.lineTo(-0.31, 0.08 * sc); shape.closePath();
        const along = d >= w, L = along ? d : w, n = Math.max(1, Math.round(L / 2)), sl = L / n;
        for (let i = 0; i < n; i++) {
          const g = new THREE.ExtrudeGeometry(shape, { depth: sl - 0.08, bevelEnabled: !LOW_DETAIL, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
          g.translate(0, 0, -(sl - 0.08) / 2);
          const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 3, uv.getY(k) / 3);
          const t = -L / 2 + (i + 0.5) * sl, bx = cx + (along ? 0 : t), bz = cz + (along ? t : 0), ry = (along ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.05;
          put(g, M.concrete, bx, y0, bz, ry, { grime: 0.35, tint: i % 2 ? 0xf0ece4 : 0xe0dbd0, base: y0 });
          for (const sd of [-1, 1]) put(new THREE.PlaneGeometry(0.12, 0.06), M.paint, bx + (along ? sd * 0.2 : 0), y0 + 0.5 * sc, bz + (along ? 0 : sd * 0.2), ry + (sd > 0 ? Math.PI / 2 : -Math.PI / 2) + (along ? 0 : Math.PI / 2), { grime: 0, tint: 0xf08a10, cast: false });
        }
        break;
      }
      case 'container': {
        const CV = containerVariants();
        if (CV) {
          // shipping container model (CC-BY 4.0, "Truck Container Pack Low-poly ASIA" by knitro_builds): pick a
          // livery from the tint, stretch to the collision box (long side along z in the model)
          const along = w > d, L = along ? w : d, W = along ? d : w;
          const v = CV[Math.abs(((extra | 0) >> 3) + Math.round(cx * 7 + cz * 3)) % CV.length];
          put(v.geo.clone(), v.mat, cx, y0, cz, along ? Math.PI / 2 : 0, { sx: W / v.size.x, sy: h / v.size.y, sz: L / v.size.z, grime: 0 });
          break;
        }
        const along = w > d;
        const L = along ? w : d, W = along ? d : w;
        const ry = along ? 0 : Math.PI / 2;
        const tint = extra;
        // corrugated walls: map the texture so ribs run vertically along the length
        const body = worldBox(L - 0.1, h - 0.1, W - 0.08, 2.4);
        put(body, M.metal, cx, y0 + h / 2, cz, ry, { tint, grime: y0 > 0 ? 0.1 : 0.35, base: y0 });
        const ax = along ? 1 : 0, az = along ? 0 : 1;
        // frame
        for (const s of [-1, 1]) for (const t of [-1, 1]) put(worldBox(0.16, h, 0.16, 0), M.dark, cx + ax * s * (L / 2 - 0.08) + az * t * (W / 2 - 0.08), y0 + h / 2, cz + az * s * (L / 2 - 0.08) + ax * t * (W / 2 - 0.08), ry, { tint, grime: 0.3, base: y0 });
        for (const yy of [0.08, h - 0.08]) for (const t of [-1, 1]) put(worldBox(L, 0.16, 0.12, 0), M.dark, cx + az * t * (W / 2 - 0.04), y0 + yy, cz + ax * t * (W / 2 - 0.04), ry, { tint, grime: 0.3, base: y0 });
        // door locking bars on one end
        for (let i = 0; i < 4; i++) {
          const t = -W / 2 + 0.35 + i * (W - 0.7) / 3;
          put(new THREE.CylinderGeometry(0.022, 0.022, h - 0.3, 6), M.dark, cx + ax * (L / 2 + 0.02) + az * t, y0 + h / 2, cz + az * (L / 2 + 0.02) + ax * t, 0, { grime: 0.2, base: y0 });
        }
        break;
      }
      case 'column':
        B(M.concrete, w, h, d, cx, 0, cz, 0, { grime: 0.45 });
        for (let i = 0; i < 4; i++) put(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), M.rust, cx + (i % 2 - 0.5) * 0.6, h + 0.4, cz + ((i >> 1) - 0.5) * 0.6, 0, { rx: (rnd() - 0.5) * 0.8, rz: (rnd() - 0.5) * 0.8, grime: 0 });
        // tattered poster
        put(new THREE.PlaneGeometry(0.8, 1.1), M.cloth, cx, 1.8, cz + Math.sign(cz) * -(d / 2 + 0.01), Math.sign(cz) > 0 ? Math.PI : 0, { grime: 0, tint: 0xb9a37a });
        break;
      case 'hesco': {
        // interlocking concrete yard blocks ("lego blocks") stacked in running bond, as walls round a works yard
        const along = d >= w, L = along ? d : w, T = along ? w : d;
        const courses = Math.max(1, Math.round(h / 0.8)), ch = h / courses;
        for (let r = 0; r < courses; r++) {
          const off = r % 2 ? 0.8 : 0;
          for (let t0 = -L / 2 - off; t0 < L / 2 - 0.05; t0 += 1.6) {
            const a0 = Math.max(-L / 2, t0), a1 = Math.min(L / 2, t0 + 1.6), bl = a1 - a0;
            if (bl < 0.1) continue;
            const t = (a0 + a1) / 2, sh = 0.94 + rnd() * 0.08;
            put(worldBox(along ? T - 0.02 : bl - 0.03, ch - 0.02, along ? bl - 0.03 : T - 0.02, 1.75), M.concrete, cx + (along ? 0 : t), y0 + r * ch + ch / 2, cz + (along ? t : 0), 0, { grime: 0.35, tint: new THREE.Color(0xd8d4cc).multiplyScalar(sh).getHex(), base: y0 });
            if (r === courses - 1 && !LOW_DETAIL) for (const k of bl > 1 ? [-0.4, 0.4] : [0]) put(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), M.concrete, cx + (along ? 0 : t + k), y0 + h + 0.04, cz + (along ? t + k : 0), 0, { grime: 0.2, tint: 0xc8c4bc, base: y0 });
          }
        }
        break;
      }
      case 'ammo':
        for (let i = 0; i < 8; i++) put(worldBox(0.9, 0.55, 0.5, 0), M.paint, cx + (i % 2 - 0.5) * 0.95, 0.28 + ((i >> 1) & 1) * 0.56, cz + ((i >> 2) - 0.5) * 0.52, 0, { grime: 0.2, tint: (i * 5) % 3 ? 0x4d5536 : 0x5a6040 });
        break;
      case 'car': buildCar(cx, cz, w > d ? 0 : Math.PI / 2, extra); break;
      case 'barrel':
        put(new THREE.CylinderGeometry(0.29, 0.29, 0.9, 16), M.metal, cx, 0.45, cz, rnd() * 6, { tint: extra ? 0x2f5577 : 0x6d3a24, grime: 0.3 });
        for (const yy of [0.3, 0.6]) put(new THREE.TorusGeometry(0.295, 0.015, 4, 16), M.dark, cx, yy, cz, 0, { rx: Math.PI / 2, grime: 0 });
        break;
      case 'stall': {
        const ry = 0;
        B(M.wood, w, 0.08, d, cx, 0.82, cz, ry, { grime: 0, tint: 0xa58a62 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(M.wood, 0.07, 0.82, 0.07, cx + sx * (w / 2 - 0.1), 0, cz + sz * (d / 2 - 0.1), 0, { grime: 0.2 });
        // boarded front, back and ends: it's solid cover, so it has to look solid
        for (const sz of [-1, 1]) B(M.woodOld, w - 0.04, 0.78, 0.03, cx, 0.04, cz + sz * (d / 2 - 0.03), 0, { grime: 0.25, tint: 0xa08060 });
        for (const sx of [-1, 1]) B(M.woodOld, 0.03, 0.78, d - 0.06, cx + sx * (w / 2 - 0.03), 0.04, cz, 0, { grime: 0.25, tint: 0x8a6c50 });
        // produce crates
        const fruit = [0xb34a22, 0xc89a2a, 0x6f8a2a, 0x9c2e2e];
        for (let i = 0; i < 4; i++) {
          B(M.wood, 0.5, 0.18, 0.4, cx - 0.85 + i * 0.57, 0.9, cz, 0, { grime: 0, tint: 0xc0a37a });
          for (let k = 0; k < 6; k++) put(new THREE.SphereGeometry(0.06, 6, 5), M.paint, cx - 1.0 + i * 0.57 + (k % 3) * 0.12, 1.1, cz - 0.08 + (k >> 1 & 1) * 0.14, 0, { grime: 0, tint: fruit[(i + extra) % 4] });
        }
        // pop-up market canopy: four legs, a peaked square top with a valance (farmers-market style)
        const cw = w + 0.6, cd = Math.max(d + 1.4, 2.4), czc = cz - 0.2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(new THREE.CylinderGeometry(0.022, 0.022, 2.35, 6), M.metal, cx + sx * cw / 2, 1.18, czc + sz * cd / 2, 0, { grime: 0, tint: 0xd8dade });
        const top = bothSides(new THREE.ConeGeometry(Math.hypot(cw, cd) / 2, 0.45, 4, 1, true)); top.rotateY(Math.PI / 4); top.scale(cw / Math.hypot(cw, cd) * Math.SQRT2, 1, cd / Math.hypot(cw, cd) * Math.SQRT2);
        const ctint = [0xf2f2ee, 0x2a4a7a, 0x2f6a3a, 0xc8322b][(extra + Math.abs(Math.round(cx))) % 4];
        put(top, M.cloth, cx, 2.58, czc, 0, { grime: 0, tint: ctint });
        for (const sz of [-1, 1]) put(new THREE.PlaneGeometry(cw, 0.22), M.cloth, cx, 2.25, czc + sz * cd / 2, sz > 0 ? 0 : Math.PI, { grime: 0, tint: ctint, cast: false });
        for (const sx of [-1, 1]) put(new THREE.PlaneGeometry(cd, 0.22), M.cloth, cx + sx * cw / 2, 2.25, czc, sx > 0 ? Math.PI / 2 : -Math.PI / 2, { grime: 0, tint: ctint, cast: false });
        break;
      }
      case 'palm': buildTree(cx, cz, rnd); break;
      case 'brick': {
        // Romanesque brick block (Pioneer Square): rusticated stone ground floor with shopfronts and awnings,
        // arched windows in brick pilaster bays, string courses, a heavy cornice; an optional corner tower.
        const o = extra || {};
        const fp = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
        const lids = SOLID_LIDS.filter(r => overlaps(r, fp));
        const G = 4.4;                                         // ground floor height
        if (o.shop) {
          // enterable ground floor: stone walls with doorways and open windows, a shop inside; solid floors above
          buildHouse(cx, cz, w, d, G, y0, { ...o.shop, stone: true }, team);
          solid(cx, cz, w, d, h - G - 0.25, y0 + G + 0.25, 'brick');
        } else
        for (const [a, b, c, e] of rectsMinus(fp, lids)) solid((a + c) / 2, (b + e) / 2, c - a, e - b, h, y0, 'brick');
        for (const r of lids) {
          const a = Math.max(r[0], fp[0]), b = Math.max(r[1], fp[1]), c = Math.min(r[2], fp[2]), e = Math.min(r[3], fp[3]);
          solid((a + c) / 2, (b + e) / 2, c - a, e - b, h, y0, 'brick').navIgnore = true;
        }
        const stoneBody = o.stone || rnd() < 0.25;
        const wallMat = stoneBody ? M.stone : M.brick;
        const tint = o.tint ?? (stoneBody ? 0xe0d6c4 : [0xffffff, 0xe9c6a8, 0xf2d9c0, 0xd8a890][Math.floor(rnd() * 4)]);
        if (!o.shop) B(M.stone, w + 0.12, G, d + 0.12, cx, y0, cz, 0, { tint: 0xa79d8c, grime: 0.55 });
        // the upper walls start 2 cm above the ground floor: a shop's ceiling is its roof slab's underside, and a
        // wall box flush with it z-fights there; the belt course stands 2 cm above the slab's top for the same reason
        B(wallMat, w, h - G - 0.02, d, cx, y0 + G + 0.02, cz, 0, { tint, grime: 0.5, base: y0 + G });
        B(M.stone, w + 0.5, 0.37, d + 0.5, cx, y0 + G - 0.1, cz, 0, { tint: 0xc9bfae, grime: 0.15, base: y0 + G });       // belt course
        B(M.stone, w + 0.9, 0.55, d + 0.9, cx, y0 + h - 0.55, cz, 0, { tint: 0xc9bfae, grime: 0.2, base: y0 + h - 1 });   // cornice
        B(M.stone, w + 0.6, 0.25, d + 0.6, cx, y0 + h - 0.85, cz, 0, { tint: 0xb9ae9c, grime: 0.2, base: y0 + h - 1 });
        B(wallMat, w + 0.2, 0.8, d + 0.2, cx, y0 + h, cz, 0, { tint, grime: 0.3, base: y0 + h });                       // parapet
        const floors = Math.max(1, Math.floor((h - G - 1.2) / 3.4));
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const L = nx ? d : w, ax = -nz, az = nx, ry = Math.atan2(nx, nz);
          const bays = Math.max(1, Math.floor(L / 3.2)), bw = L / bays;
          const fx = (t, off = 0) => cx + nx * (w / 2 + off) + ax * t, fz = (t, off = 0) => cz + nz * (d / 2 + off) + az * t;
          for (let i = 0; i < bays; i++) {
            const t = -L / 2 + (i + 0.5) * bw;
            // pilasters between bays
            if (i > 0) put(flatBox(0.42, h - G - 0.9, 0.16, scaleOf(wallMat)), wallMat, fx(t - bw / 2, 0.06), y0 + G + (h - G - 0.9) / 2, fz(t - bw / 2, 0.06), ry, { tint, grime: 0.35, base: y0 + G });
            // ground floor: shopfront glass or a stone-arched entrance, with a striped awning now and then
            if (o.shop) {
              if (rnd() < 0.5) put(new THREE.PlaneGeometry(bw - 0.6, 1.4, 4, 2), M.cloth, fx(t, 0.75), y0 + 3.4, fz(t, 0.75), ry, { rx: -Math.PI / 2 + 0.55, tint: [0x8a2f2a, 0x2f5a3a, 0x9c7a3a, 0x3d4f63][Math.floor(rnd() * 4)], grime: 0 });
            } else if (i === Math.floor(bays / 2) && L > 9) {
              put(flatBox(1.8, 3.0, 0.05, 0), M.dim, fx(t, 0.02), y0 + 1.5, fz(t, 0.02), ry, { grime: 0 });
              put(bothSides(new THREE.TorusGeometry(1.15, 0.22, 6, 18, Math.PI)), M.stone, fx(t, 0.1), y0 + 3.0, fz(t, 0.1), ry, { grime: 0.2, tint: 0xb9ae9c });
            } else {
              put(flatBox(bw - 0.9, 2.5, 0.05, 0), M.glass, fx(t, 0.03), y0 + 1.85, fz(t, 0.03), ry, { grime: 0, tint: rnd() < 0.3 ? 0xd8c9a0 : 0xffffff });
              put(flatBox(bw - 0.7, 0.14, 0.12, 0), M.frame, fx(t, 0.06), y0 + 3.15, fz(t, 0.06), ry, { grime: 0, tint: 0x2f3a33 });
              put(flatBox(bw - 0.7, 0.5, 0.14, 0), M.paint, fx(t, 0.07), y0 + 3.55, fz(t, 0.07), ry, { grime: 0.1, tint: signTints[Math.floor(rnd() * signTints.length)] });
              if (rnd() < 0.5) put(new THREE.PlaneGeometry(bw - 0.6, 1.4, 4, 2), M.cloth, fx(t, 0.75), y0 + 3.1, fz(t, 0.75), ry, { rx: -Math.PI / 2 + 0.55, tint: [0x8a2f2a, 0x2f5a3a, 0x9c7a3a, 0x3d4f63][Math.floor(rnd() * 4)], grime: 0 });
            }
            // upper floors: tall arched windows (top floor gets the big round arches)
            for (let f = 0; f < floors; f++) {
              const y = y0 + G + 0.6 + f * 3.4 + 1.25;
              const top = f === floors - 1, ww = Math.min(1.25, bw - 1.1), wh = top ? 1.7 : 1.95;
              windowDecor(fx(t), fz(t), nx, nz, y, ww, wh);
              put(bothSides(new THREE.TorusGeometry(ww / 2 + 0.12, 0.13, 5, 14, Math.PI)), wallMat, fx(t, 0.06), y + wh / 2 - 0.05, fz(t, 0.06), ry, { tint: 0xc9a080, grime: 0.2 });
              put(new THREE.CircleGeometry(ww / 2, 14, 0, Math.PI), M.dim, fx(t, 0.015), y + wh / 2 - 0.05, fz(t, 0.015), ry, { grime: 0 });
            }
            // string course every floor
          }
          for (let f = 1; f < floors; f++) put(flatBox(L + 0.3, 0.16, 0.18, 3), M.stone, fx(0, 0.09), y0 + G + f * 3.4 + 0.2, fz(0, 0.09), ry, { tint: 0xc9bfae, grime: 0.1 });
          // fire escape on one long side now and then
          if (rnd() < 0.3 && L > 10) {
            const t0 = (rnd() - 0.5) * (L - 6);
            for (let f = 0; f < floors; f++) {
              const y = y0 + G + 0.55 + f * 3.4;
              put(flatBox(3.2, 0.06, 1.0, 0), M.iron, fx(t0, 0.55), y, fz(t0, 0.55), ry, { grime: 0.3 });
              put(flatBox(3.2, 0.9, 0.04, 0), M.iron, fx(t0, 1.03), y + 0.45, fz(t0, 1.03), ry, { grime: 0.3 });
            }
          }
        }
        // roof: wooden water tank, chimneys
        if (rnd() < 0.6) {
          const tx = cx + (rnd() - 0.5) * (w - 4), tz = cz + (rnd() - 0.5) * (d - 4), ty = y0 + h + 0.8;
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), M.iron, tx + sx * 0.9, ty, tz + sz * 0.9, 0, { grime: 0.3 });
          put(new THREE.CylinderGeometry(1.3, 1.3, 2.6, 16, 1, true), M.woodOld, tx, ty + 2.1, tz, 0, { grime: 0.3, tint: 0x8a7458 });
          put(new THREE.ConeGeometry(1.4, 0.9, 16), M.iron, tx, ty + 3.85, tz, 0, { grime: 0.2 });
        }
        for (let i = 0; i < 2; i++) B(M.brick, 0.8, 1.8, 0.8, cx + (rnd() - 0.5) * (w - 2), y0 + h, cz + (rnd() - 0.5) * (d - 2), 0, { tint: 0xb06048, grime: 0.6, base: y0 + h });
        if (o.tower) {
          // corner turret with a pyramid roof, the Pioneer Building's crown
          const tx = cx + w / 2 - 2, tz = cz - d / 2 + 2;
          B(wallMat, 4, 7, 4, tx, y0 + h, tz, 0, { tint, grime: 0.3, base: y0 + h });
          for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) windowDecor(tx + nx * 2, tz + nz * 2, nx, nz, y0 + h + 3.5, 1.0, 1.8);
          put(new THREE.ConeGeometry(3.2, 6, 4), M.iron, tx, y0 + h + 10, tz, Math.PI / 4, { grime: 0.2, tint: 0x46564f });
        }
        break;
      }
      case 'tunnel': {
        // the Seattle Underground: old storefront level below the street. Brick walls, timber posts and beams,
        // plank ceiling (the sidewalk above), pipes, bare bulbs, junk. Floor at y = -h; walls block nav.
        const o = extra || {}, D = h, T = 0.4;
        const floorY = y0 - D;
        solid(cx, cz, w, d, 0.3, floorY - 0.3, 'concrete');
        put(new THREE.PlaneGeometry(w, d), M.concrete, cx, floorY + 0.005, cz, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0x8a8478 });
        // walls with gaps: gaps = [[side, offset, width]]
        const sides = [
          { k: 'n', ax: 1, az: 0, len: w, ox: cx, oz: cz + d / 2 - T / 2, nx: 0, nz: -1 },
          { k: 's', ax: 1, az: 0, len: w, ox: cx, oz: cz - d / 2 + T / 2, nx: 0, nz: 1 },
          { k: 'e', ax: 0, az: 1, len: d, ox: cx + w / 2 - T / 2, oz: cz, nx: -1, nz: 0 },
          { k: 'w', ax: 0, az: 1, len: d, ox: cx - w / 2 + T / 2, oz: cz, nx: 1, nz: 0 },
        ];
        for (const S of sides) {
          const gaps = (o.gaps || []).filter(g => g[0] === S.k).map(g => [g[1] - g[2] / 2, g[1] + g[2] / 2]).sort((a, b) => a[0] - b[0]);
          let cur = -S.len / 2;
          const seg = (a, b) => {
            if (b - a < 0.05) return;
            const m = (a + b) / 2, L = b - a, x = S.ox + S.ax * m, z = S.oz + S.az * m;
            solid(x, z, S.ax ? L : T, S.az ? L : T, D, floorY, 'brick').navBlock = true;
            // 2 cm short of the street: wall tops flush with the paving above z-fight with it
            put(flatBox(S.ax ? L : T, D - 0.02, S.az ? L : T, scaleOf(M.brick)), M.brick, x, floorY + (D - 0.02) / 2, z, 0, { tint: 0xc08a70, grime: 0.7, base: floorY });
          };
          for (const [a, b] of gaps) { seg(cur, a); put(bothSides(new THREE.TorusGeometry((b - a) / 2, 0.18, 5, 12, Math.PI)), M.brick, S.ox + S.ax * (a + b) / 2, floorY + 2.3, S.oz + S.az * (a + b) / 2, Math.atan2(S.nx, S.nz), { tint: 0xc08a70, grime: 0.4 }); cur = b; }
          seg(cur, S.len / 2);
        }
        // ceiling: planks on joists (the underside of the street), with glass prism lights here and there
        put(new THREE.PlaneGeometry(w, d), M.woodOld, cx, y0 - 0.05, cz, 0, { rx: Math.PI / 2, grime: 0, cast: false, tint: 0x6a5a48 });
        const along = w >= d, L = along ? w : d, W = along ? d : w;
        for (let i = -L / 2 + 0.75; i < L / 2; i += 1.5) put(flatBox(along ? 0.2 : W, 0.28, along ? W : 0.2, 1.2), M.woodOld, cx + (along ? i : 0), y0 - 0.2, cz + (along ? 0 : i), 0, { grime: 0, tint: 0x5a4a3a });
        for (const off of [-W / 2 + 0.6, -W / 2 + 0.9]) put(new THREE.CylinderGeometry(0.06, 0.06, L - 1, 8), M.metal, cx + (along ? 0 : off), y0 - 0.5, cz + (along ? off : 0), 0, { rx: along ? 0 : 0, rz: along ? Math.PI / 2 : 0, ...(along ? {} : { rx: Math.PI / 2 }), tint: 0x3a3a38, grime: 0.4 });
        // timber posts down the middle (cover), bulbs between them
        for (let i = -L / 2 + 2.5; i < L / 2 - 1.5; i += 3) {
          const px = cx + (along ? i : W * 0.12), pz = cz + (along ? W * 0.12 : i);
          solid(px, pz, 0.3, 0.3, D, floorY, 'wood').navBlock = true;
          put(flatBox(0.3, D, 0.3, 1.2), M.woodOld, px, floorY + D / 2, pz, 0, { tint: 0x7a6650, grime: 0.6, base: floorY });
          const bx = px + (along ? 1.5 : 0), bz = pz + (along ? 0 : 1.5);
          put(new THREE.SphereGeometry(0.07, 8, 6), M.bulbHot, bx, y0 - 0.45, bz, 0, { grime: 0, cast: false });
          glowsHot.push([bx, y0 - 0.45, bz, 0.9]);
          if (Math.round(i * 10) % 2 === 0) { const L2 = new THREE.PointLight(0xffd6a0, 6, 8, 1.6); L2.position.set(bx, y0 - 0.6, bz); L2.userData.mapLight = true; group.add(L2); }
        }
        // junk along one wall: broken planks, crates, an old painted sign
        for (let i = 0; i < Math.floor(L / 3); i++) {
          const t = -L / 2 + 1.5 + i * 3 + rnd(), side = (i % 2 ? 1 : -1) * (W / 2 - T - 0.45);
          const jx = cx + (along ? t : side), jz = cz + (along ? side : t);
          if (rnd() < 0.5) { solid(jx, jz, 0.9, 0.9, 0.9, floorY, 'wood').navBlock = true; B(M.wood, 0.9, 0.9, 0.9, jx, floorY, jz, rnd(), { grime: 0.4, base: floorY }); }
          else for (let k = 0; k < 4; k++) put(flatBox(0.12, 0.04, 1.6, 1.2), M.woodOld, jx + (rnd() - 0.5) * 0.4, floorY + 0.15 + k * 0.08, jz + (rnd() - 0.5) * 0.4, rnd() * 3, { rz: (rnd() - 0.5) * 0.6, grime: 0.3, tint: 0x8a7458 });
        }
        if (posterMat) decal(posterMat[1], 1.6, 1.1, cx + (along ? -L / 4 : W / 2 - T - 0.01), floorY + 1.7, cz + (along ? W / 2 - T - 0.01 : -L / 4), along ? Math.PI : -Math.PI / 2);
        break;
      }
      case 'stairdown': {
        // stairwell from the street down to a level below it: steps descend along x (dir +1: going +x), retaining
        // walls with an iron railing on both long sides
        const dir = (extra && extra.dir) || 1, D = h, n = Math.ceil(D / 0.36), run = w / n, T = 0.25;
        for (let k = 1; k <= n; k++) {
          const top = y0 - (k / n) * D;
          const sx = cx - dir * w / 2 + dir * (k - 0.5) * run;
          const len = k === n ? run : run;
          solid(sx, cz, len, d - 2 * T, top - (y0 - D - 0.3), y0 - D - 0.3, 'concrete');
          put(flatBox(len, 0.06, d - 2 * T, 0), M.concrete, sx, top - 0.03, cz, 0, { tint: 0x9a948a, grime: 0.4 });
          // the riser, on its downhill edge (the face you see going up), a hair behind the tread's nose
          put(flatBox(0.04, top - 0.06 - (y0 - D), d - 2 * T, 0), M.concrete, sx + dir * (len / 2 - 0.03), (top - 0.06 + y0 - D) / 2, cz, 0, { tint: 0x8a8478, grime: 0.5, base: y0 - D });
          // and above the first step, up to the street (an open slot under the street's edge otherwise)
          if (k === 1) put(flatBox(0.04, y0 - 0.003 - (top - 0.06), d - 2 * T, 0), M.concrete, sx - dir * (len / 2 - 0.02), (y0 - 0.003 + top - 0.06) / 2, cz, 0, { tint: 0x8a8478, grime: 0.5 });
        }
        for (const sz of [-1, 1]) {
          const z = cz + sz * (d / 2 - T / 2);
          solid(cx, z, w, T, D, y0 - D, 'concrete').navBlock = true;
          const rl = solid(cx, z, w, T, 0.95, y0, 'metal'); rl.navBlock = true; rl.pass = true;   // the railing on top
          put(flatBox(w, D, T, scaleOf(M.brick)), M.brick, cx, y0 - D / 2, z, 0, { tint: 0xc08a70, grime: 0.6, base: y0 - D });
          // railing at street level
          put(flatBox(w, 0.06, 0.06, 0), M.iron, cx, y0 + 0.95, z, 0, { grime: 0.2 });
          for (let i = 0; i <= Math.floor(w / 0.15); i++) put(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 5), M.iron, cx - w / 2 + i * 0.15, y0 + 0.475, z, 0, { grime: 0 });
        }
        break;
      }
      case 'paving': plane(extra === 'brick' ? M.brick : M.cobble, w, d, cx, cz, 0.018, 0, extra === 'brick' ? 0xc89a80 : 0x9c948a); break;
      case 'tracks': {
        // streetcar rails set into the street
        const along = d >= w, L = along ? d : w;
        for (const off of [-0.72, 0.72]) put(flatBox(along ? 0.08 : L, 0.03, along ? L : 0.08, 0), M.metal, cx + (along ? off : 0), 0.02, cz + (along ? 0 : off), 0, { grime: 0, tint: 0x8a8a88, cast: false });
        break;
      }
      case 'cable': {
        const [x1, z1, y1, x2, z2, y2] = extra;
        const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), m = a.clone().lerp(b, 0.5); m.y -= a.distanceTo(b) * 0.04;
        put(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 16, 0.014, 4), M.rubber, 0, 0, 0, 0, { grime: 0, cast: false });
        break;
      }
      case 'tree': {
        // London plane: pale mottled trunk, limbs reaching up and out, a broad crown of leaf cards (alpha-cut
        // leaf texture, normals bent outward from the crown so it shades like a mass of foliage, dappled shadows)
        solid(cx, cz, 0.42, 0.42, 3, 0, 'wood');
        const H = h || 9, R = H * 0.36;
        const trunkH = H * 0.42;
        put(new THREE.CylinderGeometry(0.2, 0.3, trunkH, 10), M.woodOld, cx, trunkH / 2, cz, 0, { tint: 0xb4aa92, grime: 0.15 });
        for (let k = 0; k < 6; k++) put(new THREE.CylinderGeometry(0.205, 0.215, 0.25 + rnd() * 0.5, 10, 1, true, rnd() * 6, 0.8 + rnd()), M.woodOld, cx, 0.6 + rnd() * (trunkH - 1), cz, 0, { tint: [0xd8d2bc, 0x8f8a6e, 0xc9c09a][k % 3], grime: 0 });
        const crownY = trunkH + R * 0.75;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26 + rnd() * 0.5, len = R * (0.8 + rnd() * 0.4), tilt = 0.45 + rnd() * 0.35;
          const ex = cx + Math.cos(a) * Math.sin(tilt) * len, ez = cz + Math.sin(a) * Math.sin(tilt) * len, ey = trunkH - 0.3 + Math.cos(tilt) * len;
          put(new THREE.CylinderGeometry(0.07, 0.15, len, 7), M.woodOld, (cx + ex) / 2, (trunkH - 0.3 + ey) / 2, (cz + ez) / 2, 0, { rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt, tint: 0xb4aa92, grime: 0.05 });
        }
        if (!M.leafCard) {
          const c = document.createElement('canvas'); c.width = c.height = 256;
          const g = c.getContext('2d');
          const greens = ['#6f9a3c', '#86ad4a', '#5d8a34', '#9cbf5e', '#7aa344', '#4f7a2e'];
          for (let n = 0; n < 150; n++) {
            const x = 18 + Math.random() * 220, y = 18 + Math.random() * 220, sz = 9 + Math.random() * 11, rot = Math.random() * 6.28;
            g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = greens[(Math.random() * greens.length) | 0];
            g.beginPath();   // five-lobed plane leaf
            for (let k = 0; k <= 10; k++) { const t = k / 10 * Math.PI * 2, r = sz * (k % 2 ? 0.55 : 1) * (0.85 + 0.15 * Math.cos(t * 2)); g.lineTo(Math.cos(t) * r, Math.sin(t) * r * 0.9); }
            g.fill(); g.strokeStyle = 'rgba(40,60,20,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(sz * 0.8, 0); g.stroke(); g.restore();
          }
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
          M.leafCard = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true });
        }
        const cards = [];
        const nC = Math.round(12 + R * 3);
        for (let i = 0; i < nC; i++) {
          // cluster centres spread through a flattened ellipsoid crown
          const u = rnd() * 6.283, v = Math.acos(1 - 2 * rnd()) , rr = R * Math.cbrt(0.35 + rnd() * 0.65);
          const kx = cx + Math.sin(v) * Math.cos(u) * rr, kz = cz + Math.sin(v) * Math.sin(u) * rr, ky = crownY + Math.cos(v) * rr * 0.6;
          for (let j = 0; j < 7; j++) {
            const g = new THREE.PlaneGeometry(1.5 + rnd() * 0.8, 1.5 + rnd() * 0.8);
            _e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28); _q.setFromEuler(_e);
            _p.set(kx + (rnd() - 0.5) * 1.1, ky + (rnd() - 0.5) * 0.8, kz + (rnd() - 0.5) * 1.1); _s.set(1, 1, 1);
            g.applyMatrix4(_m.compose(_p, _q, _s));
            const nx = _p.x - cx, ny = (_p.y - crownY) * 1.6 + R * 0.5, nz = _p.z - cz, nl = Math.hypot(nx, ny, nz) || 1;
            const nrm = g.attributes.normal; for (let q = 0; q < nrm.count; q++) nrm.setXYZ(q, nx / nl, ny / nl, nz / nl);
            cards.push(g);
          }
        }
        const merged = mergeGeometries(cards, false); cards.forEach(g => g.dispose());
        put(merged, M.leafCard, 0, 0, 0, 0, { grime: 0, tint: [0xffffff, 0xeef4dc, 0xdfe8c8][(rnd() * 3) | 0] });
        break;
      }
      case 'pergola': {
        // cast-iron pergola: columns with capitals, arched glass roof on ribs, cresting along the ridge, globe lamps
        const H = h || 3.8, n = Math.max(3, Math.round(w / 2.2));
        for (const sz of [-1, 1]) for (let i = 0; i <= n; i++) {
          const x = cx - w / 2 + i * (w / n), z = cz + sz * (d / 2 - 0.15);
          solid(x, z, 0.26, 0.26, H, 0, 'metal');
          put(new THREE.CylinderGeometry(0.09, 0.12, H, 10), M.iron, x, H / 2, z, 0, { grime: 0.1 });
          put(new THREE.CylinderGeometry(0.22, 0.1, 0.35, 10), M.iron, x, H - 0.1, z, 0, { grime: 0 });
          put(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 10), M.iron, x, 0.15, z, 0, { grime: 0.2 });
          if (i % 2 === 0) { put(new THREE.SphereGeometry(0.16, 10, 8), M.bulb, x, H - 0.55, z - sz * 0.35, 0, { grime: 0, cast: false }); glows.push([x, H - 0.55, z - sz * 0.35, 1.0]); }
        }
        const glassMat = M.pergolaGlass || (M.pergolaGlass = std({ color: 0x9fbab0, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
        const roof = new THREE.CylinderGeometry(d / 2, d / 2, w, 16, 1, true, -Math.PI / 2, Math.PI);
        put(roof, glassMat, cx, H + 0.1, cz, 0, { rz: Math.PI / 2, sx: 1, sy: 1, grime: 0, cast: false });
        for (let i = 0; i <= n; i++) put(bothSides(new THREE.TorusGeometry(d / 2, 0.05, 5, 16, Math.PI)), M.iron, cx - w / 2 + i * (w / n), H + 0.1, cz, Math.PI / 2, { grime: 0 });
        put(flatBox(w, 0.08, 0.08, 0), M.iron, cx, H + 0.1 + d / 2, cz, 0, { grime: 0 });
        for (let i = 0; i < Math.round(w / 0.4); i++) put(new THREE.ConeGeometry(0.05, 0.3, 4), M.iron, cx - w / 2 + 0.2 + i * 0.4, H + 0.3 + d / 2, cz, 0, { grime: 0 });
        for (const sz of [-1, 1]) put(flatBox(w, 0.25, 0.08, 0), M.iron, cx, H + 0.05, cz + sz * (d / 2 - 0.1), 0, { grime: 0 });
        break;
      }
      case 'totem': {
        // carved cedar pole: stacked figures in red, black and teal, wings near the top
        const H = h || 9;
        put(new THREE.CylinderGeometry(0.4, 0.46, H, 12), M.woodOld, cx, H / 2, cz, 0, { tint: 0x9a7a58, grime: 0.2 });
        for (let i = 0; i < 5; i++) {
          const y = 1 + i * (H - 2) / 5;
          put(new THREE.CylinderGeometry(0.47, 0.47, 0.35, 12, 1, true, -0.9, 1.8), M.paint, cx, y + 0.6, cz, 0, { tint: [0x8a2a22, 0x1c1c1c, 0x2f6a6a][i % 3], grime: 0 });
          for (const sx of [-1, 1]) put(new THREE.SphereGeometry(0.11, 8, 6), M.paint, cx + sx * 0.18, y + 0.95, cz + 0.4, 0, { tint: 0xe8e2d0, grime: 0 });
          put(flatBox(0.16, 0.2, 0.3, 0), M.paint, cx, y + 0.3, cz + 0.42, 0, { tint: 0x8a2a22, grime: 0 });
        }
        for (const sx of [-1, 1]) put(flatBox(1.6, 0.5, 0.08, 0), M.paint, cx + sx * 1.0, H - 1.2, cz, 0, { rz: sx * 0.25, tint: 0x1c1c1c, grime: 0 });
        break;
      }
      case 'vlamp': {
        // five-globe cast-iron street lamp
        solid(cx, cz, 0.3, 0.3, 3.8, 0, 'metal');
        put(new THREE.CylinderGeometry(0.28, 0.34, 0.6, 10), M.iron, cx, 0.3, cz, 0, { grime: 0.2 });
        put(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 10), M.iron, cx, 2.2, cz, 0, { grime: 0.1 });
        const ys = 4.05;
        put(new THREE.SphereGeometry(0.2, 12, 8), M.bulb, cx, ys + 0.35, cz, 0, { grime: 0, cast: false }); glows.push([cx, ys + 0.35, cz, 1.4]);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4, bx = cx + Math.cos(a) * 0.42, bz = cz + Math.sin(a) * 0.42;
          put(flatBox(0.42, 0.04, 0.04, 0), M.iron, (cx + bx) / 2, ys - 0.05, (cz + bz) / 2, -a, { grime: 0 });
          put(new THREE.SphereGeometry(0.17, 12, 8), M.bulb, bx, ys + 0.12, bz, 0, { grime: 0, cast: false });
          glows.push([bx, ys + 0.12, bz, 1.1]);
        }
        break;
      }
      case 'infokiosk': {
        // the green information kiosk by the pergola: panelled booth, roof with a deep overhang, signboards
        B(M.paint, w, h, d, cx, 0, cz, 0, { tint: 0x2f5a3c, grime: 0.35 });
        for (const [nx, nz, L] of [[1, 0, d], [-1, 0, d], [0, 1, w], [0, -1, w]]) {
          const ry = Math.atan2(nx, nz), n = Math.max(2, Math.round(L / 0.9));
          for (let i = 0; i < n; i++) { const t = -L / 2 + (i + 0.5) * L / n; put(flatBox(L / n - 0.12, h * 0.55, 0.03, 0), M.paint, cx + nx * (w / 2 + 0.015) - nz * t, h * 0.42, cz + nz * (d / 2 + 0.015) + nx * t, ry, { tint: 0x274d33, grime: 0.2 }); }
          if (!kioskSign) {
            const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
            g.fillStyle = '#20402b'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#efe9da'; g.font = 'bold 42px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('INFORMATION', 256, 48);
            const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace; kioskSign = new THREE.MeshStandardMaterial({ map: t2, roughness: 0.6 });
          }
          put(bothSides(new THREE.PlaneGeometry(Math.min(L - 0.2, 2.4), 0.3)), kioskSign, cx + nx * (w / 2 + 0.035), h * 0.85, cz + nz * (d / 2 + 0.035), ry, { grime: 0, cast: false });
        }
        B(M.paint, w + 0.9, 0.16, d + 0.9, cx, h, cz, 0, { tint: 0x22402c, grime: 0.1 });
        B(M.paint, w + 0.3, 0.3, d + 0.3, cx, h + 0.16, cz, 0, { tint: 0x2f5a3c, grime: 0.1 });
        for (const [bx, bz] of [[w / 2 + 0.9, 0], [-w / 2 - 0.9, 0.6]]) { put(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 10), M.iron, cx + bx, 0.45, cz + bz, 0, { grime: 0.2 }); solid(cx + bx, cz + bz, 0.24, 0.24, 0.9, 0, 'metal'); }
        break;
      }
      case 'planter': {
        // round concrete planter with flowers spilling over
        const r = w / 2;
        put(new THREE.CylinderGeometry(r, r * 0.85, h, 20), M.concrete, cx, h / 2, cz, 0, { tint: 0xc8c0b0, grime: 0.4 });
        put(new THREE.TorusGeometry(r - 0.04, 0.06, 6, 20), M.concrete, cx, h, cz, 0, { rx: Math.PI / 2, tint: 0xd2cabb, grime: 0.1 });
        put(new THREE.CircleGeometry(r - 0.08, 18), M.dirt, cx, h - 0.06, cz, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0x6a5238 });
        for (let i = 0; i < 9; i++) {
          const a = rnd() * 6.28, rr = rnd() * (r - 0.2), g = new THREE.IcosahedronGeometry(0.18 + rnd() * 0.12, 0);
          put(g, M.leaf, cx + Math.cos(a) * rr, h + 0.12 + rnd() * 0.15, cz + Math.sin(a) * rr, rnd() * 6, { grime: 0, tint: 0x6f8a3a });
          if (rnd() < 0.7) put(new THREE.SphereGeometry(0.07, 6, 5), M.paint, cx + Math.cos(a) * (rr + 0.12), h + 0.28 + rnd() * 0.12, cz + Math.sin(a) * (rr + 0.12), 0, { grime: 0, tint: [0xd8342a, 0xe8c23a, 0xc2448a, 0xf0ece0][(rnd() * 4) | 0] });
        }
        break;
      }
      case 'railing': {
        // low cast-iron fence around a bed (w x d), open on one side if extra.open = 'n'|'s'|'e'|'w'
        const H = h || 0.9, open = extra && extra.open;
        for (const [k, nx, nz, L] of [['e', 1, 0, d], ['w', -1, 0, d], ['n', 0, 1, w], ['s', 0, -1, w]]) {
          if (k === open) continue;
          const x = cx + nx * w / 2, z = cz + nz * d / 2, alongX = !nx;
          solid(x, z, alongX ? L : 0.08, alongX ? 0.08 : L, H, 0, 'metal').pass = true;   // iron railing: blocks you, not bullets
          for (const y of [0.12, H - 0.06]) put(flatBox(alongX ? L : 0.05, 0.05, alongX ? 0.05 : L, 0), M.iron, x, y, z, 0, { grime: 0.1 });
          const n = Math.round(L / 0.16);
          for (let i = 0; i <= n; i++) { const t = -L / 2 + i * L / n; put(new THREE.CylinderGeometry(0.014, 0.014, H, 4), M.iron, x + (alongX ? t : 0), H / 2, z + (alongX ? 0 : t), 0, { grime: 0 }); if (i % 4 === 0) put(new THREE.ConeGeometry(0.04, 0.12, 4), M.iron, x + (alongX ? t : 0), H + 0.06, z + (alongX ? 0 : t), 0, { grime: 0 }); }
        }
        break;
      }
      case 'aframe': {
        // café sandwich board on the sidewalk
        for (const s2 of [-1, 1]) put(flatBox(0.6, 0.95, 0.03, 0), M.wood, cx, 0.46, cz + s2 * 0.17, 0, { rx: s2 * 0.2, tint: 0x2b2b2b, grime: 0.1 });
        for (const s2 of [-1, 1]) put(new THREE.PlaneGeometry(0.48, 0.7), posterMat[(extra || 0) % 5], cx, 0.5, cz + s2 * 0.2, s2 > 0 ? 0 : Math.PI, { rx: s2 * 0.2, grime: 0, cast: false });
        solid(cx, cz, 0.6, 0.5, 0.95, 0, 'wood').pass = true;   // you don't walk through it (bullets do)
        break;
      }
      case 'garage': {
        // concrete parking garage (the "Sinking Ship"): open decks behind parapets, columns, cars on every level, stair tower
        const decks = Math.max(2, Math.floor(h / 2.9));
        B(M.dim, w - 0.6, h - 0.3, d - 0.6, cx, 0, cz, 0, { grime: 0 });
        for (let k = 0; k <= decks; k++) {
          const y = k * (h / decks);
          if (k > 0) B(M.concrete, w, 0.32, d, cx, y - 0.32, cz, 0, { tint: 0xcfc9bd, grime: 0.3, base: y - 1 });
          if (k < decks) B(M.concrete, w + 0.1, 1.0, d + 0.1, cx, y + (k ? 0 : 0), cz, 0, { tint: 0xd6d0c4, grime: 0.45, base: y });
          // cars parked against the parapet
          if (k < decks) for (let i = 0; i < Math.floor(w / 2.8); i++) for (const sz2 of [-1, 1]) if (rnd() < 0.65) {
            const px = cx - w / 2 + 1.6 + i * 2.8, pz = cz + sz2 * (d / 2 - 2.6);
            B(M.paint, 1.8, 0.7, 4.2, px, y + 0.25, pz, 0, { tint: [0x8a1c1c, 0x1c2a44, 0xcfcfcf, 0x2b2b2b, 0x5a6a72][(rnd() * 5) | 0], grime: 0.1 });
            B(M.glass, 1.6, 0.45, 2.2, px, y + 0.95, pz, 0, { grime: 0 });
          }
        }
        for (let i = 0; i <= Math.round(w / 4); i++) for (const sz2 of [-1, 1]) B(M.concrete, 0.45, h, 0.45, cx - w / 2 + i * (w / Math.round(w / 4)), 0, cz + sz2 * (d / 2 - 0.2), 0, { tint: 0xc9c3b6, grime: 0.4 });
        for (let i = 0; i <= Math.round(d / 4); i++) for (const sx2 of [-1, 1]) B(M.concrete, 0.45, h, 0.45, cx + sx2 * (w / 2 - 0.2), 0, cz - d / 2 + i * (d / Math.round(d / 4)), 0, { tint: 0xc9c3b6, grime: 0.4 });
        B(M.concrete, 3, h + 2.5, 3, cx + w / 2 - 1.5, 0, cz - d / 2 + 1.5, 0, { tint: 0xbdb6a8, grime: 0.4 });
        put(flatBox(0.9, 3.2, 0.12, 0), M.paint, cx + w / 2 + 0.07, h - 1.5, cz, Math.PI / 2, { tint: 0x2a62b8, grime: 0 });
        break;
      }
      case 'bench': {
        for (let i = 0; i < 4; i++) put(flatBox(w, 0.04, 0.09, 1.2), M.wood, cx, 0.45, cz - d / 2 + 0.06 + i * 0.12, 0, { grime: 0.2, tint: 0x8a6a48 });
        for (let i = 0; i < 3; i++) put(flatBox(w, 0.09, 0.04, 1.2), M.wood, cx, 0.65 + i * 0.12, cz + d / 2 - 0.03, 0, { grime: 0.2, tint: 0x8a6a48 });
        for (const sx of [-1, 1]) put(flatBox(0.06, 0.9, d, 0), M.iron, cx + sx * (w / 2 - 0.1), 0.45, cz, 0, { grime: 0.1 });
        break;
      }
      case 'bus': case 'truck': {
        // city traffic: a Metro bus at its stop (extra = livery) or a box truck / food truck ('truck', extra 'food')
        // long axis along whichever side of the box is longer; the cab / front at the +end unless extra.back
        const along = d >= w, L = along ? d : w, W = along ? w : d, fr = extra && extra.back ? -1 : 1;
        const P = (a, b) => [cx + (along ? b : a), cz + (along ? a : b)];            // a along the length, b across
        const box = (mat, a0, a1, b0, b1, y, hh, o) => { const [x, z] = P((a0 + a1) / 2 * fr, (b0 + b1) / 2); const la = Math.abs(a1 - a0), lb = Math.abs(b1 - b0); B(mat, along ? lb : la, hh, along ? la : lb, x, y0 + y, z, 0, o); };
        const wheel = (a, s2) => { const [x, z] = P(a * fr, s2 * (W / 2 - 0.12)); put(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), M.rubber, x, y0 + 0.5, z, 0, { rz: along ? Math.PI / 2 : 0, rx: along ? 0 : Math.PI / 2, grime: 0.2 }); };
        if (kind === 'bus') {
          // low-floor transit bus: two-tone body, a band of dark windows, roof pods, the destination sign
          const tint = [0x2f6a3a, 0x1f4e8a, 0xd8a028][(extra && extra.livery) || 0];
          box(M.paint, -L / 2, L / 2, -W / 2, W / 2, 0.35, h - 0.6, { tint: 0xe8e6e0, grime: 0.15 });
          box(M.paint, -L / 2 + 0.05, L / 2 - 0.05, -W / 2 - 0.01, W / 2 + 0.01, 0.35, 0.75, { tint, grime: 0.2 });
          for (const s2 of [-1, 1]) box(M.glass, -L / 2 + 0.6, L / 2 - 0.9, s2 * (W / 2 + 0.005) - 0.005, s2 * (W / 2 + 0.005) + 0.005, 1.2, 1.15, { grime: 0, tint: 0x6a7480 });
          box(M.glass, L / 2 - 0.02, L / 2 + 0.01, -W / 2 + 0.15, W / 2 - 0.15, 1.0, 1.5, { grime: 0, tint: 0x6a7480 });       // windscreen
          box(M.dark, L / 2 - 0.03, L / 2 + 0.02, -0.7, 0.7, h - 0.55, 0.25, { grime: 0 });                                    // destination sign
          box(M.paint, -L / 2 + 1.5, -L / 2 + 5, -W / 2 + 0.3, W / 2 - 0.3, h - 0.25, 0.3, { tint: 0xd8d8d4, grime: 0.2 }); // roof pods
          box(M.paint, 1.5, 3.5, -W / 2 + 0.4, W / 2 - 0.4, h - 0.25, 0.25, { tint: 0xd8d8d4, grime: 0.2 });
          for (const a of [L / 2 - 2.4, -L / 2 + 2.6]) for (const s2 of [-1, 1]) wheel(a, s2);
        } else {
          const food = extra && extra.food;
          const cab = 2.2, bodyT = food ? [0xd8382a, 0xf2c018, 0x2a8a8a][(extra.food | 0) % 3] : 0xeceae4;
          box(M.paint, -L / 2, L / 2 - cab, -W / 2, W / 2, 0.75, h - 0.75, { tint: bodyT, grime: 0.18 });                // box body
          box(M.paint, L / 2 - cab + 0.05, L / 2, -W / 2 + 0.05, W / 2 - 0.05, 0.6, 1.75, { tint: food ? 0xf0eee8 : 0x2a62b8, grime: 0.2 }); // cab
          box(M.glass, L / 2 - 0.02, L / 2 + 0.01, -W / 2 + 0.2, W / 2 - 0.2, 1.4, 0.8, { grime: 0, tint: 0x6a7480 });
          box(M.dark, -L / 2, L / 2, -W / 2 + 0.2, W / 2 - 0.2, 0.35, 0.4, { grime: 0.3 });                                  // chassis
          if (food) {
            // serving hatch with its awning propped open on the kerb side, a menu board
            box(M.dark, -L / 2 + 1, L / 2 - cab - 0.6, W / 2 - 0.01, W / 2 + 0.01, 1.35, 1.0, { grime: 0 });
            const [x, z] = P(fr * (-L / 2 + (L - cab) / 2 + 0.2), W / 2 + 0.45);
            // (top and underside: you see it from below)
            for (const flip of [0, Math.PI]) put(new THREE.PlaneGeometry(along ? 0.9 : L - cab - 1.4, along ? L - cab - 1.4 : 0.9).rotateY(flip), M.paint, x, y0 + 2.45, z, 0, { rx: -Math.PI / 2 + 0.35 * (along ? 0 : 1), rz: along ? -0.35 : 0, grime: 0, tint: 0xf2e8d0, cast: false });
          } else box(M.paint, -L / 2 - 0.01, -L / 2 + 0.01, -W / 2 + 0.1, W / 2 - 0.1, 0.8, h - 0.9, { tint: 0xc8c8c4, grime: 0.3 }); // roll-up door
          for (const a of [L / 2 - 1.2, -L / 2 + 1.3]) for (const s2 of [-1, 1]) wheel(a, s2);
        }
        break;
      }
      case 'tent': {
        // pop-up market tent (the First Thursday art walk): a table of wares under a peaked canopy on four legs
        B(M.wood, w - 0.2, 0.06, d - 0.2, cx, h - 0.06, cz, 0, { grime: 0.05, tint: 0xc8a878 });
        B(M.cloth, w - 0.25, h - 0.08, 0.02, cx, 0, cz + d / 2 - 0.12, 0, { grime: 0, tint: 0xe8e4dc });
        for (let i = 0; i < 5; i++) put(worldBox(0.3 + (i % 3) * 0.08, 0.2 + (i % 2) * 0.2, 0.25, 0), M.paint, cx - w / 2 + 0.4 + i * (w - 0.8) / 4, h + 0.12, cz + ((i * 7) % 3 - 1) * 0.15, (i * 0.7) % 1, { grime: 0, tint: [0xc8322b, 0x2f6db0, 0xe8b62a, 0x2f8a4a, 0x6a3a8a][(i + (extra | 0)) % 5] });
        const tw = w + 0.4, td = d + 1.6, tz = cz - 0.3, ct = [0xf2f2ee, 0x2a4a7a, 0x2f6a3a, 0xc8322b][(extra | 0) % 4];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(new THREE.CylinderGeometry(0.022, 0.022, 2.35, 6), M.metal, cx + sx * tw / 2, 1.18, tz + sz * td / 2, 0, { grime: 0, tint: 0xd8dade });
        const top = bothSides(new THREE.ConeGeometry(Math.hypot(tw, td) / 2, 0.45, 4, 1, true)); top.rotateY(Math.PI / 4); top.scale(tw / Math.hypot(tw, td) * Math.SQRT2, 1, td / Math.hypot(tw, td) * Math.SQRT2);
        put(top, M.cloth, cx, 2.58, tz, 0, { grime: 0, tint: ct });
        break;
      }
      case 'tram': {
        // a 1910s streetcar parked on its tracks: varnished body, clerestory roof, trolley pole
        const along = d >= w, L = along ? d : w, W = along ? w : d, ry = along ? 0 : Math.PI / 2;
        const P = (a, b) => [cx + (along ? a : b), cz + (along ? b : a)];
        B(M.paint, along ? W : L, 1.1, along ? L : W, cx, 0.35, cz, 0, { tint: 0x5a2a20, grime: 0.4 });
        B(M.paint, along ? W - 0.1 : L - 0.4, 1.3, along ? L - 0.4 : W - 0.1, cx, 1.45, cz, 0, { tint: 0x7a3a2a, grime: 0.2 });
        for (let i = -L / 2 + 0.9; i < L / 2 - 0.6; i += 0.95) for (const s of [-1, 1]) { const [x, z] = P(s * (W / 2 - 0.04), i); put(flatBox(along ? 0.04 : 0.7, 0.8, along ? 0.7 : 0.04, 0), M.glass, x, 2.0, z, 0, { grime: 0 }); }
        B(M.paint, along ? W + 0.2 : L, 0.18, along ? L : W + 0.2, cx, 2.75, cz, 0, { tint: 0x3a2a22, grime: 0.2 });
        B(M.paint, along ? W - 1 : L - 2, 0.35, along ? L - 2 : W - 1, cx, 2.93, cz, 0, { tint: 0x5a2a20, grime: 0.2 });
        put(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 6), M.iron, cx, 4.3, cz, 0, { rx: along ? 0.8 : 0, rz: along ? 0 : 0.8, grime: 0 });
        for (const s of [-1, 1]) for (const t of [-1, 1]) { const [x, z] = P(s * (W / 2 - 0.3), t * (L / 2 - 1.4)); put(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 14), M.iron, x, 0.33, z, 0, { rz: along ? Math.PI / 2 : 0, rx: along ? 0 : Math.PI / 2, grime: 0.3 }); }
        break;
      }
      case 'tower': {
        // Smith Tower: a wide 12-storey base, the slender white terracotta shaft with its tight grid of paired
        // windows, a setback crown and the steep pyramid roof with its glass lantern
        if (!M.terra) {
          const c = document.createElement('canvas'); c.width = c.height = 256;
          const g = c.getContext('2d');
          g.fillStyle = '#ece7dc'; g.fillRect(0, 0, 256, 256);
          const fl = 4, bays = 6, fh = 256 / fl, bw2 = 256 / bays;
          for (let r = 0; r < fl; r++) for (let k = 0; k < bays; k++) {
            const x = k * bw2, y = r * fh;
            g.fillStyle = '#d9d2c4'; g.fillRect(x, y + fh - 6, bw2, 6);                    // spandrel band
            for (const o of [0.16, 0.54]) { g.fillStyle = '#2a3440'; g.fillRect(x + bw2 * o, y + fh * 0.18, bw2 * 0.3, fh * 0.62); g.fillStyle = 'rgba(160,190,210,0.35)'; g.fillRect(x + bw2 * o, y + fh * 0.18, bw2 * 0.3, fh * 0.18); }
            g.fillStyle = '#f4f0e8'; g.fillRect(x, y, 3, fh);                              // piers
          }
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
          M.terra = std({ map: t, roughness: 0.75 }); S.terra = 12;
        }
        const baseH = 20;
        put(worldBox(w * 1.7, baseH, d * 1.5, 12), M.terra, cx, baseH / 2, cz, 0, { grime: 0.1, cast: false });
        put(worldBox(w, h, d, 12), M.terra, cx, h / 2, cz, 0, { grime: 0.05, cast: false });
        for (const [y2, k] of [[baseH, 1.72], [h, 1.04]]) put(flatBox(w * k + 0.4, 0.6, d * (k > 1.5 ? 1.52 : 1.04) + 0.4, 0), M.stone, cx, y2 - 0.3, cz, 0, { tint: 0xf2eee4, grime: 0, cast: false });
        put(worldBox(w * 0.78, 7, d * 0.78, 12), M.terra, cx, h + 3.5, cz, 0, { grime: 0.05, cast: false });
        put(new THREE.ConeGeometry(w * 0.6, 20, 4, 1), M.stone, cx, h + 7 + 10, cz, Math.PI / 4, { tint: 0xeeeae0, grime: 0, cast: false });
        for (let k = 0; k < 3; k++) for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const yy = h + 9 + k * 4.5, inset = w * 0.6 * (1 - (yy - h - 7) / 20) * 0.7;
          put(flatBox(0.8, 1.6, 0.4, 0), M.dim, cx + nx * inset, yy, cz + nz * inset, Math.atan2(nx, nz), { grime: 0, cast: false });
        }
        put(new THREE.CylinderGeometry(0.9, 1.1, 3, 8), M.glass, cx, h + 28, cz, 0, { grime: 0, cast: false });
        put(new THREE.ConeGeometry(1.0, 2.5, 8), M.stone, cx, h + 30.7, cz, 0, { tint: 0xeeeae0, grime: 0, cast: false });
        break;
      }
      case 'pioneerbldg': {
        // The Pioneer Building (1892): six storeys, grey sandstone ground floor with round-arched shopfronts and the
        // great arched entrance, red-orange brick above in a grid of piers and belt courses, paired windows with
        // round arches on the top floor, two banded stone piers rising past the roof either side of the entrance,
        // cast-iron bays (the rounded corner bay, one over the entrance, one on James St) and the pyramid-roofed
        // tower. Authored with its plaza front on -x and James St on +z (placed rotated with extra.xf).
        const G = 5.0, FH = 3.6, NF = 5, H = G + NF * FH;            // 23 m to the cornice line
        const BR = 0xd0784e, ST = 0xaea594, STL = 0xc9c0ae, IRON = 0x8a908c;
        solid(cx, cz, w, d, H + 1.2, y0, 'brick');
        B(M.stone, w + 0.1, G, d + 0.1, cx, y0, cz, 0, { tint: ST, grime: 0.5 });
        B(M.brick, w, H - G + 0.4, d, cx, y0 + G, cz, 0, { tint: BR, grime: 0.35, base: y0 + G });
        // cornice, frieze and parapet
        B(M.stone, w + 1.1, 0.55, d + 1.1, cx, y0 + H - 0.1, cz, 0, { tint: STL, grime: 0.2, base: y0 + H - 1 });
        B(M.stone, w + 0.7, 0.3, d + 0.7, cx, y0 + H - 0.45, cz, 0, { tint: 0xb3a995, grime: 0.2, base: y0 + H - 1 });
        B(M.brick, w + 0.2, 1.1, d + 0.2, cx, y0 + H + 0.45, cz, 0, { tint: BR, grime: 0.3, base: y0 + H });
        B(M.stone, w + 0.5, 0.2, d + 0.5, cx, y0 + H + 1.5, cz, 0, { tint: STL, grime: 0.2, base: y0 + H });
        // the four sides: [outward normal x, z], length, detail level
        const SIDES = [[-1, 0, d, 2], [0, 1, w, 2], [1, 0, d, 1], [0, -1, w, 0]];
        for (const [nx, nz, L, lvl] of SIDES) {
          const ax = -nz, az = nx, ry = Math.atan2(nx, nz);
          const half = nx ? w / 2 : d / 2;
          const fx = (t, off = 0) => cx + nx * (half + off) + ax * t, fz = (t, off = 0) => cz + nz * (half + off) + az * t;
          const bays = Math.max(3, Math.round(L / 3.45)), bw = L / bays, mid = Math.floor(bays / 2);
          if (lvl === 0) { // back wall (beyond the map): a few windows only
            for (let i = 0; i < bays; i += 2) for (let f = 0; f < NF; f++) windowDecor(fx(-L / 2 + (i + 0.5) * bw), fz(-L / 2 + (i + 0.5) * bw), nx, nz, y0 + G + 0.6 + f * FH + 1.1, 1.0, 1.7);
            continue;
          }
          // ground floor: rusticated stone joints, arched shopfronts, the main entrance in the middle bay (front)
          for (let k = 1; k < 7; k++) put(flatBox(L + 0.12, 0.05, 0.04, 0), M.dim, fx(0, 0.06), y0 + k * 0.7, fz(0, 0.06), ry, { grime: 0, tint: 0x5a564e });
          for (let i = 0; i < bays; i++) {
            const t = -L / 2 + (i + 0.5) * bw;
            const main = lvl === 2 && nx === -1 && i === mid;
            const ow = main ? bw * 0.95 : bw - 0.95, oh = main ? 3.9 : 3.0;
            // the stone skin's face is 5 cm out: the pane stands 2 cm proud of it (flush, the two z-fight)
            put(flatBox(ow, oh, 0.06, 0), main ? M.dim : M.glass, fx(t, 0.04), y0 + oh / 2 + 0.25, fz(t, 0.04), ry, { grime: 0, tint: main ? 0xffffff : (rnd() < 0.3 ? 0xd8c9a0 : 0xffffff) });
            put(new THREE.CircleGeometry(ow / 2, 16, 0, Math.PI), main ? M.dim : M.glass, fx(t, 0.071), y0 + oh + 0.25, fz(t, 0.071), ry, { grime: 0 });
            put(bothSides(new THREE.TorusGeometry(ow / 2 + 0.18, 0.2, 6, 18, Math.PI)), M.stone, fx(t, 0.12), y0 + oh + 0.25, fz(t, 0.12), ry, { tint: STL, grime: 0.25 });
            if (!main) {
              put(flatBox(0.08, oh, 0.12, 0), M.frame, fx(t, 0.08), y0 + oh / 2 + 0.25, fz(t, 0.08), ry, { grime: 0, tint: 0x24302a });
              put(flatBox(ow, 0.1, 0.12, 0), M.frame, fx(t, 0.08), y0 + 2.6, fz(t, 0.08), ry, { grime: 0, tint: 0x24302a });
              if (rnd() < 0.55) put(new THREE.PlaneGeometry(ow + 0.2, 1.3, 4, 2), M.cloth, fx(t, 0.7), y0 + 2.75, fz(t, 0.7), ry, { rx: -Math.PI / 2 + 0.55, tint: [0x2f5a3a, 0x7a2a24, 0x5a3a2a][(rnd() * 3) | 0], grime: 0 });
            } else {
              // the entrance: deep stone arch, steps, lamp either side
              put(bothSides(new THREE.TorusGeometry(ow / 2 + 0.45, 0.35, 6, 20, Math.PI)), M.stone, fx(t, 0.25), y0 + oh + 0.25, fz(t, 0.25), ry, { tint: 0xb9b09e, grime: 0.2 });
              for (const sd of [-1, 1]) {
                put(flatBox(0.7, oh + 0.3, 0.6, 3), M.stone, fx(t + sd * (ow / 2 + 0.3), 0.3), y0 + (oh + 0.3) / 2, fz(t + sd * (ow / 2 + 0.3), 0.3), ry, { tint: 0xb9b09e, grime: 0.3 });
                solid(fx(t + sd * (ow / 2 + 0.3), 0.3), fz(t + sd * (ow / 2 + 0.3), 0.3), nx ? 0.6 : 0.7, nx ? 0.7 : 0.6, oh + 0.3, y0, 'concrete');   // the piers stand out from the wall
                put(new THREE.SphereGeometry(0.2, 10, 8), M.bulb, fx(t + sd * (ow / 2 + 0.3), 0.75), y0 + 3.2, fz(t + sd * (ow / 2 + 0.3), 0.75), 0, { grime: 0, cast: false }); glows.push([fx(t + sd * (ow / 2 + 0.3), 0.75), y0 + 3.2, fz(t + sd * (ow / 2 + 0.3), 0.75), 1.1]);
              }
            }
            // upper floors: brick piers between bays, paired windows, arches on the top floor
            if (i > 0) put(flatBox(0.55, H - G, 0.3, scaleOf(M.brick)), M.brick, fx(-L / 2 + i * bw, 0.13), y0 + G + (H - G) / 2, fz(-L / 2 + i * bw, 0.13), ry, { tint: 0xc66e46, grime: 0.3, base: y0 + G });
            const oriel = (lvl === 2 && nx === -1 && i === mid) || (lvl === 2 && nz === 1 && i === mid);
            if (oriel) continue;
            for (let f = 0; f < NF; f++) {
              const y = y0 + G + 0.55 + f * FH + 1.15, top = f === NF - 1, wh = top ? 1.75 : 2.0, ww = Math.min(0.95, (bw - 1.0) / 2 - 0.08);
              for (const k of [-1, 1]) windowDecor(fx(t + k * (ww / 2 + 0.1)), fz(t + k * (ww / 2 + 0.1)), nx, nz, y, ww, wh);
              if (top) {
                put(bothSides(new THREE.TorusGeometry(ww + 0.32, 0.16, 5, 16, Math.PI)), M.brick, fx(t, 0.08), y + wh / 2 - 0.1, fz(t, 0.08), ry, { tint: 0xb85e3a, grime: 0.2 });
                put(new THREE.CircleGeometry(ww + 0.2, 16, 0, Math.PI), M.dim, fx(t, 0.02), y + wh / 2 - 0.1, fz(t, 0.02), ry, { grime: 0 });
              } else if (f === 2) put(bothSides(new THREE.TorusGeometry(ww / 2 + 0.15, 0.12, 5, 12, Math.PI)), M.stone, fx(t, 0.08), y + wh / 2, fz(t, 0.08), ry, { tint: STL, grime: 0.15 });
            }
          }
          // belt courses: a heavy one over the stone base, then one per floor
          put(flatBox(L + 0.5, 0.4, 0.4, 3), M.stone, fx(0, 0.18), y0 + G + 0.1, fz(0, 0.18), ry, { tint: STL, grime: 0.15 });
          for (let f = 1; f < NF; f++) put(flatBox(L + 0.25, 0.18, 0.26, 3), M.stone, fx(0, 0.12), y0 + G + f * FH + 0.2, fz(0, 0.12), ry, { tint: STL, grime: 0.12 });
          if (lvl < 2) continue;
          // cast-iron bay in the middle of the front and of James St: grey metal, glass on three sides, every floor
          const ot = -L / 2 + (mid + 0.5) * bw, OW = bw - 0.5, OD = 0.95, oy0 = y0 + G + 0.5, oy1 = y0 + H - FH + 0.3;
          put(flatBox(OW, oy1 - oy0, OD, 0), M.metal, fx(ot, OD / 2), (oy0 + oy1) / 2, fz(ot, OD / 2), ry, { tint: IRON, grime: 0.25 });
          for (let f = 0; f < NF - 1; f++) {
            const y = oy0 + 0.6 + f * FH + 1.0;
            put(flatBox(OW - 0.4, 1.9, 0.04, 0), M.glass, fx(ot, OD + 0.02), y, fz(ot, OD + 0.02), ry, { grime: 0 });
            for (const k of [-1, 1]) put(flatBox(0.05, 1.9, OD - 0.3, 0), M.glass, fx(ot + k * (OW / 2 + 0.02), OD / 2), y, fz(ot + k * (OW / 2 + 0.02), OD / 2), ry, { grime: 0 });
            put(flatBox(OW + 0.1, 0.25, OD + 0.1, 0), M.metal, fx(ot, OD / 2), y0 + G + 0.5 + (f + 1) * FH - 0.1, fz(ot, OD / 2), ry, { tint: 0x4a504e, grime: 0.2 });
            for (const k of [-0.25, 0.25]) put(flatBox(0.06, 1.9, 0.06, 0), M.metal, fx(ot + k * OW, OD + 0.04), y, fz(ot + k * OW, OD + 0.04), ry, { tint: 0x3e4442, grime: 0 });
          }
          put(new THREE.ConeGeometry(OW * 0.75, 0.6, 4), M.metal, fx(ot, OD / 2), oy0 - 0.25, fz(ot, OD / 2), ry + Math.PI / 4, { rx: Math.PI, tint: IRON, grime: 0.2, sz: 0.5 });
          // the front's two banded stone piers, rising past the cornice to the tower
          if (nx === -1) for (const k of [-1, 1]) {
            const pt = ot + k * (bw / 2 + 0.05);
            for (let y = y0; y < y0 + H + 7.5; y += 0.9) {
              put(flatBox(1.0, 0.45, 0.75, 3), M.stone, fx(pt, 0.3), y + 0.225, fz(pt, 0.3), ry, { tint: STL, grime: 0.2 });
              put(flatBox(0.9, 0.45, 0.68, 3), M.brick, fx(pt, 0.28), y + 0.675, fz(pt, 0.28), ry, { tint: 0xb35a38, grime: 0.25 });
            }
            put(new THREE.ConeGeometry(0.6, 1.6, 4), M.stone, fx(pt, 0.3), y0 + H + 8.5, fz(pt, 0.3), ry + Math.PI / 4, { tint: STL, grime: 0.1 });
          }
        }
        // the rounded cast-iron bay on the plaza / James corner (-x, +z)
        {
          const ox = cx - w / 2 + 0.6, oz = cz + d / 2 - 0.6, R = 1.9, y1 = y0 + G + 0.4, y2 = y0 + H - 0.2;
          put(new THREE.CylinderGeometry(R, R, y2 - y1, 20, 1, false), M.metal, ox, (y1 + y2) / 2, oz, 0, { tint: IRON, grime: 0.25 });
          for (let f = 0; f < NF; f++) {
            const y = y1 + 0.55 + f * FH + 0.9;
            // window panes round the bay (grey iron between them)
            for (let k = 0; k < 5; k++) { const a = -Math.PI + (k + 0.5) * Math.PI * 1.5 / 5; put(flatBox(0.62, 1.7, 0.04, 0), M.glass, ox + Math.sin(a) * (R + 0.02), y, oz + Math.cos(a) * (R + 0.02), a, { grime: 0 }); }
            put(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.25, 20), M.metal, ox, y1 + (f + 1) * FH - 0.25, oz, 0, { tint: 0x4a504e, grime: 0.2 });
            for (let k = 0; k < 6; k++) { const a = -Math.PI + k * Math.PI * 1.5 / 5; put(flatBox(0.07, 1.9, 0.07, 0), M.metal, ox + Math.sin(a) * (R + 0.05), y, oz + Math.cos(a) * (R + 0.05), 0, { tint: 0x3e4442, grime: 0 }); }
          }
          put(new THREE.ConeGeometry(R + 0.2, 1.6, 20), M.metal, ox, y2 + 0.8, oz, 0, { tint: 0x4f5654, grime: 0.15 });
          put(new THREE.ConeGeometry(R, 0.9, 20), M.metal, ox, y1 - 0.45, oz, 0, { rx: Math.PI, tint: IRON, grime: 0.2 });
          // the arched corner entrance beneath it
          put(bothSides(new THREE.TorusGeometry(1.3, 0.22, 6, 16, Math.PI)), M.stone, ox - 0.6, y0 + 3.4, oz + 0.6, -Math.PI / 4, { tint: STL, grime: 0.2 });
        }
        // the tower over the entrance: brick drum with arched openings, steep slate pyramid with dormers and a finial
        {
          const tx = cx - w / 2 + 3.6, tz = cz, TW = 6.2, TH = 6.5, ty = y0 + H + 1.6;
          B(M.brick, TW, TH, TW, tx, ty, tz, 0, { tint: BR, grime: 0.3, base: ty });
          for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const k of [-1, 1]) {
            const ax = -nz, az = nx, px = tx + nx * TW / 2 + ax * k * 1.3, pz = tz + nz * TW / 2 + az * k * 1.3, ry = Math.atan2(nx, nz);
            put(flatBox(1.0, 2.6, 0.05, 0), M.dim, px + nx * 0.02, ty + 3.2, pz + nz * 0.02, ry, { grime: 0 });
            put(bothSides(new THREE.TorusGeometry(0.62, 0.12, 5, 12, Math.PI)), M.stone, px + nx * 0.06, ty + 4.5, pz + nz * 0.06, ry, { tint: STL, grime: 0.15 });
          }
          B(M.stone, TW + 0.6, 0.4, TW + 0.6, tx, ty + TH, tz, 0, { tint: STL, grime: 0.15 });
          put(new THREE.ConeGeometry(TW * 0.74, 11, 4), M.iron, tx, ty + TH + 0.4 + 5.5, tz, Math.PI / 4, { tint: 0x55605c, grime: 0.15 });
          for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const px = tx + nx * 2.0, pz = tz + nz * 2.0, ry = Math.atan2(nx, nz);
            B(M.brick, 1.0, 1.5, 0.8, px, ty + TH + 2.2, pz, ry, { tint: BR, grime: 0.2 });
            put(new THREE.ConeGeometry(0.75, 1.0, 4), M.iron, px, ty + TH + 4.2, pz, ry + Math.PI / 4, { tint: 0x55605c, grime: 0 });
            put(flatBox(0.55, 0.9, 0.04, 0), M.dim, px + nx * 0.42, ty + TH + 2.95, pz + nz * 0.42, ry, { grime: 0 });
          }
          put(new THREE.CylinderGeometry(0.05, 0.08, 3, 6), M.iron, tx, ty + TH + 12.4, tz, 0, { grime: 0 });
          put(new THREE.SphereGeometry(0.2, 8, 6), M.iron, tx, ty + TH + 11.4, tz, 0, { grime: 0 });
        }
        // roof: chimneys and a skylight over the atrium
        for (const [ux, uz] of [[0.3, -0.35], [0.35, 0.3], [-0.1, -0.42]]) B(M.brick, 1.0, 2.2, 1.0, cx + ux * w, y0 + H + 1.5, cz + uz * d, 0, { tint: 0xa85438, grime: 0.6, base: y0 + H });
        B(M.glass, 8, 0.8, 5, cx + w * 0.1, y0 + H + 1.5, cz, 0, { grime: 0 });
        break;
      }
      case 'flatiron': {
        // the "Sinking Ship" garage on the old Seattle Hotel's wedge between James St and Yesler Way: concrete decks
        // following the triangular lot, open between the parapets, columns, cars, a blue P sign at the prow.
        // extra.pts = footprint (world x, z), convex
        const pts = extra.pts, decks = Math.max(2, Math.round(h / 3));
        const inset = (P, t) => {
          // offset a convex polygon inward by t (edges moved in, adjacent ones intersected)
          let area = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
          const sg = area > 0 ? -1 : 1, lines = P.map((a, i) => { const b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l * sg, nz = dx / l * sg; return [a[0] - nx * t, a[1] - nz * t, dx, dz]; });
          return lines.map((L1, i) => { const L0 = lines[(i + P.length - 1) % P.length], den = L0[2] * L1[3] - L0[3] * L1[2]; const u = ((L1[0] - L0[0]) * L1[3] - (L1[1] - L0[1]) * L1[2]) / den; return [L0[0] + L0[2] * u, L0[1] + L0[3] * u]; });
        };
        const shapeOf = (P, hole) => { const sh = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z))); if (hole) sh.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z)).reverse())); return sh; };
        const slab = (P, hole, y, t, mat, tint) => {
          const g = new THREE.ExtrudeGeometry(shapeOf(P, hole), { depth: t, bevelEnabled: false });
          g.rotateX(-Math.PI / 2);
          put(g, mat, 0, y, 0, 0, { tint, grime: 0.35, base: y });
        };
        const inner = inset(pts, 0.35), core = inset(pts, 1.2);
        // collision as drawn: the solid core all the way up, and the street-level parapet round the outside
        // (the decks above it are open: you can see and shoot into them)
        solidPoly(core, h, 0, 'concrete');
        solidPoly(pts, 1.05, 0, 'concrete');
        slab(core, null, 0, h - 0.3, M.dim, 0xffffff);
        for (let k = 0; k <= decks; k++) {
          const y = k * (h / decks);
          if (k > 0) slab(pts, null, y - 0.3, 0.3, M.concrete, 0xcfc9bd);
          if (k < decks) slab(pts, inner, y + (k ? 0 : 0), 1.05, M.concrete, 0xd8d2c6);
        }
        // columns along every edge (each edge's start: its end is the next edge's start)
        for (let i = 0; i < pts.length; i++) {
          const a = inner[i], b = inner[(i + 1) % inner.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 5));
          for (let j = 0; j < n; j++) { const t = j / n; B(M.concrete, 0.45, h, 0.45, a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t, 0, { tint: 0xc9c3b6, grime: 0.4 }); }
        }
        // cars along the decks
        const cxp = pts.reduce((q, p) => q + p[0], 0) / pts.length, czp = pts.reduce((q, p) => q + p[1], 0) / pts.length;
        for (let k = 0; k < decks; k++) {
          const parked = [];
          for (let i = 0; i < 6; i++) {
            const f = 0.25 + rnd() * 0.55, P = inner[i % inner.length], x = P[0] + (cxp - P[0]) * f, z = P[1] + (czp - P[1]) * f;
            const ry = rnd() * 3, tint = [0x8a1c1c, 0x1c2a44, 0xcfcfcf, 0x2b2b2b, 0x5a6a72][(rnd() * 5) | 0];
            if (parked.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4.6)) continue;   // no two cars in one another
            parked.push([x, z]);
            B(M.paint, 1.8, 0.7, 4.2, x, k * (h / decks) + 0.25, z, ry, { tint, grime: 0.1 });
          }
        }
        // the prow (sharpest corner) carries the blue P sign
        const prow = pts[extra.prow || 0];
        put(flatBox(1.2, 1.2, 0.12, 0), M.paint, prow[0] + 1.6, h - 1.4, prow[1] - 0.2, 0, { tint: 0x2a62b8, grime: 0 });
        break;
      }
      case 'droad': {
        // a street at an angle (authored along local +x, w long, d curb to curb; placed with extra.xf): asphalt,
        // curbs, double yellow centre line, edge lines, a crosswalk at the low end, manholes
        const o = extra || {};
        planePiece(M.asphalt, w, d, cx, cz, 0.024);
        for (const sd of [-1, 1]) B(M.concrete, w, 0.15, 0.3, cx, 0, cz + sd * (d / 2 + 0.15), 0, { tint: 0xc9c4b8, grime: 0.35, cast: false });
        const flatL = (mat, lw, ld, x, z, tint) => put(new THREE.PlaneGeometry(lw, ld), mat, x, 0.03, z, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint });
        const x0 = cx - w / 2 + (o.cross ? 4.5 : 0.5), x1 = cx + w / 2 - 0.5;
        for (const dz of [-0.11, 0.11]) flatL(M.line, x1 - x0, 0.1, (x0 + x1) / 2, cz + dz, 0xd9b54a);
        for (const sd of [-1, 1]) flatL(M.line, x1 - x0, 0.12, (x0 + x1) / 2, cz + sd * (d / 2 - 0.45), 0xd8d2c0);
        if (o.cross) for (let z = cz - d / 2 + 0.45; z + 1.0 <= cz + d / 2 - 0.2; z += 1.55) for (const dd of [0, 0.6]) flatL(M.line, 2.8, 0.4, cx - w / 2 + 1.9, z + dd + 0.2, 0xe6e0d0);
        for (let x = cx - w / 2 + 8; x < cx + w / 2 - 3; x += 13) put(new THREE.CircleGeometry(0.38, 18), M.dark, x, 0.031, cz + (rnd() - 0.5) * 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false });
        break;
      }
      case 'rsign': {
        // a street sign on a post, facing +z turned by extra.ry (CC-BY "Road Signs" by FrodoUndead), or a plain plate
        const pc = propFit('roadsigns', new RegExp(`^Object_${ROAD_SIGNS[extra.n]}$`), 'y', 2.9);
        if (pc) for (const { geo, mat } of pc.parts) put(geo.clone(), mat, cx, 0, cz, extra.ry || 0, { grime: 0 });
        else {
          put(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6), M.dark, cx, 1.25, cz, 0, { grime: 0.2 });
          put(flatBox(0.6, 0.6, 0.03, 0), M.paint, cx, 2.3, cz, extra.ry || 0, { tint: 0xd8d2c0, grime: 0.1 });
        }
        break;
      }
      case 'dumpster': {
        // a commercial dumpster, lid hinged at the back (CC-BY "dumpster" by YJ_: green 4-yard, or extra.dark the black 6-yard)
        const ry = (w > d ? 0 : -Math.PI / 2) + (extra.flip ? Math.PI : 0) + (extra.ry || 0);
        const pc = propFit('dumpster', extra.dark ? /^6Y/ : /^4Y/, 'x', Math.max(w, d));
        if (pc) for (const { geo, mat } of pc.parts) put(geo.clone(), mat, cx, y0, cz, ry, { grime: 0 });
        else {
          B(M.paint, w, h, d, cx, y0, cz, 0, { tint: extra.dark ? 0x30343a : 0x2f5a3a, grime: 0.4 });
          B(M.rubber, w + 0.1, 0.08, d + 0.1, cx, y0 + h, cz, 0, { grime: 0 });
        }
        break;
      }
      case 'station': station = buildStation({ put, flatBox, solid, physics, group, M }); break;
      case 'bollard': {
        solid(cx, cz, 0.3, 0.3, 1.0, 0, 'metal');
        put(new THREE.CylinderGeometry(0.13, 0.15, 0.95, 10), M.iron, cx, 0.475, cz, 0, { grime: 0.2 });
        put(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.iron, cx, 0.95, cz, 0, { grime: 0 });
        put(new THREE.TorusGeometry(0.15, 0.025, 4, 12), M.iron, cx, 0.8, cz, 0, { rx: Math.PI / 2, grime: 0 });
        break;
      }
      case 'prism': {
        // glass prism lights set in the sidewalk (Pioneer Square's old Underground skylights): rows of lavender glass studs in iron frames
        const pm = M.prism || (M.prism = std({ color: 0xb8a6d8, roughness: 0.2, metalness: 0.1, emissive: 0x2a2040, polygonOffset: true, polygonOffsetFactor: -3 }));
        for (let x = cx - w / 2 + 0.15; x < cx + w / 2; x += 0.3) for (let z = cz - d / 2 + 0.15; z < cz + d / 2; z += 0.3)
          put(new THREE.PlaneGeometry(0.16, 0.16), pm, x, 0.026, z, 0, { rx: -Math.PI / 2, grime: 0, cast: false });
        put(new THREE.PlaneGeometry(w + 0.1, d + 0.1), M.dark, cx, 0.024, cz, 0, { rx: -Math.PI / 2, grime: 0, cast: false });
        break;
      }
      case 'boundary': break; // dressed by perimeter buildings below
      default:
        B(M.concrete, w, h, d, cx, y0, cz);
    }
  };

  function buildCar(cx, cz, ry, variant) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    const P = (lx, ly, lz) => [cx + lx * c + lz * sn, ly, cz - lx * sn + lz * c];
    const burnt = variant === 1;
    const paintTint = burnt ? 0x5a4a3c : [0xb8b2a4, 0x8a2f2a, 0x3d4f63, 0xd8d2c0][Math.floor(rnd() * 4)];
    const bodyMat = burnt ? M.rust : M.paint;
    const W = 1.82;
    // side profile (x = length, front at +x), wheel arches cut out of the sill line
    const sh = new THREE.Shape();
    const arch = (x, r = 0.42) => { sh.lineTo(x + r, 0.28); sh.absarc(x, 0.28, r, 0, Math.PI, false); };
    sh.moveTo(-2.2, 0.3);
    sh.lineTo(-2.2, 0.72); sh.quadraticCurveTo(-2.18, 0.86, -2.0, 0.88);   // rear bumper + trunk
    sh.lineTo(-1.45, 0.9); sh.lineTo(-1.05, 1.33);                          // rear window
    sh.quadraticCurveTo(-0.9, 1.4, -0.6, 1.41); sh.lineTo(0.35, 1.4);       // roof
    sh.quadraticCurveTo(0.55, 1.38, 0.62, 1.32); sh.lineTo(1.15, 0.94);     // windscreen
    sh.lineTo(2.0, 0.84); sh.quadraticCurveTo(2.2, 0.8, 2.22, 0.62); sh.lineTo(2.22, 0.3); // hood + nose
    sh.lineTo(1.82, 0.3); sh.absarc(1.4, 0.28, 0.42, 0, Math.PI, false);      // front arch
    sh.lineTo(-0.98, 0.28); sh.absarc(-1.4, 0.28, 0.42, 0, Math.PI, false);  // rear arch
    sh.lineTo(-2.2, 0.3);
    void arch;
    const body = new THREE.ExtrudeGeometry(sh, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 10 });
    body.translate(0, 0, -(W - 0.12) / 2);
    { const uv = body.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6); }
    const [bx, , bz] = P(0, 0, 0);
    put(body, bodyMat, bx, 0.02 - (burnt ? 0.08 : 0), bz, ry, { tint: paintTint, grime: 0.35, rz: burnt ? 0.02 : 0 });
    // glass: side windows and screens, inset from the body sides
    const gl = new THREE.Shape();
    gl.moveTo(-1.38, 0.95); gl.lineTo(-1.02, 1.3); gl.lineTo(0.33, 1.32); gl.lineTo(0.56, 1.28); gl.lineTo(1.04, 0.97); gl.lineTo(-1.38, 0.95);
    const glass = new THREE.ExtrudeGeometry(gl, { depth: W + 0.02, bevelEnabled: false });
    glass.translate(0, 0, -(W + 0.02) / 2);
    put(glass, burnt ? M.dim : M.glass, bx, 0.02 - (burnt ? 0.08 : 0), bz, ry, { grime: 0, tint: 0xffffff, sz: 0.94 });
    // pillars between the windows
    for (const lx of [-0.35]) { const [x, , z] = P(lx, 0, 0); put(flatBox(0.08, 0.36, W - 0.02, 0), bodyMat, x, 1.13 - (burnt ? 0.08 : 0), z, ry, { tint: paintTint, grime: 0.2 }); }
    // bumpers, grille, lights, mirrors, plates
    const box = (w, h, d, lx, ly, lz, mat, t) => { const [x, y, z] = P(lx, ly, lz); put(flatBox(w, h, d, scaleOf(mat)), mat, x, y, z, ry, { tint: t, grime: 0.2 }); };
    box(0.14, 0.2, W + 0.06, 2.24, 0.4, 0, M.dark, 0x2a2a2a);
    box(0.14, 0.2, W + 0.06, -2.24, 0.42, 0, M.dark, 0x2a2a2a);
    box(0.04, 0.16, 0.9, 2.26, 0.62, 0, M.dark, 0x1a1a1a);   // grille: 1 cm proud of the nose (its bevel ends at 2.27)
    if (!burnt) {
      for (const lz of [-0.68, 0.68]) {
        box(0.05, 0.12, 0.32, 2.22, 0.66, lz, M.lamp, 0xffffff);
        box(0.05, 0.12, 0.3, -2.2, 0.76, lz, M.paint, 0xb02020);
      }
      for (const lz of [-1, 1]) box(0.14, 0.08, 0.14, 0.75, 1.0, lz * (W / 2 + 0.06), bodyMat, paintTint);
      box(0.02, 0.12, 0.4, 2.31, 0.42, 0, M.paint, 0xe8e2d0);
      box(0.02, 0.12, 0.4, -2.31, 0.5, 0, M.paint, 0xe8e2d0);                                  // rear plate
      // door shut lines, handles, rubbing strip and sill, fuel flap: both sides
      for (const s2 of [-1, 1]) {
        const sz2 = s2 * (W / 2 + 0.005);
        for (const lx of [0.95, -0.35, -1.0]) box(0.018, 0.56, 0.012, lx, 0.62, sz2, M.dark, 0x141414);
        box(1.95, 0.012, 0.012, -0.03, 0.93, sz2, M.dark, 0x141414);                         // window line
        for (const lx of [0.55, -0.75]) box(0.16, 0.035, 0.03, lx, 0.82, s2 * (W / 2 + 0.02), M.metal, 0xb8b8b8);  // handles
        box(2.6, 0.045, 0.02, -0.05, 0.56, s2 * (W / 2 - 0.005), M.dark, 0x202020);             // rubbing strip
        box(1.7, 0.06, 0.03, 0.0, 0.34, s2 * (W / 2 - 0.03), M.dark, 0x1c1c1c);                 // sill
        if (s2 < 0) box(0.14, 0.12, 0.02, -1.75, 0.74, s2 * (W / 2 + 0.01), bodyMat, paintTint); // fuel flap
        box(0.02, 0.28, 0.02, 0.75, 0.92, s2 * (W / 2 + 0.02), M.dark, 0x1a1a1a);              // mirror stalk
      }
      // through the glass: seats, headrests, dash, steering wheel, rear-view mirror
      for (const lz of [-0.42, 0.42]) { box(0.5, 0.12, 0.5, 0.05, 0.62, lz, M.dark, 0x2a2a2e); box(0.12, 0.55, 0.5, -0.2, 0.68, lz, M.dark, 0x2a2a2e); box(0.08, 0.16, 0.26, -0.24, 1.1, lz, M.dark, 0x2a2a2e); }
      box(0.5, 0.12, 1.5, -0.95, 0.62, 0, M.dark, 0x2a2a2e); box(0.12, 0.5, 1.5, -1.2, 0.68, 0, M.dark, 0x2a2a2e);
      box(0.4, 0.22, W - 0.2, 0.85, 0.82, 0, M.dark, 0x18181a);                                // dash
      { const [x, , z] = P(0.6, 0, 0.42); put(new THREE.TorusGeometry(0.17, 0.025, 6, 16), M.dark, x, 0.98, z, ry + Math.PI / 2, { rx: -0.45, grime: 0, tint: 0x111111 }); }
      box(0.04, 0.05, 0.18, 0.5, 1.3, 0, M.dark, 0x111111);
      // wipers, a roof antenna, the exhaust
      for (const lz of [-0.4, 0.3]) box(0.03, 0.02, 0.6, 1.12, 0.95, lz, M.dark, 0x0a0a0a);
      { const [x, , z] = P(-0.75, 0, -0.5); put(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 4), M.dark, x, 1.6, z, ry, { rz: -0.35, grime: 0 }); }
      { const [x, , z] = P(-2.24, 0, 0.55); put(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), M.metal, x, 0.26, z, ry, { rz: Math.PI / 2, grime: 0.2, tint: 0x8a8a8a }); }
    }
    // wheels: tyre + rim
    for (const lx of [-1.4, 1.4]) for (const lz of [-0.8, 0.8]) {
      const [x, y, z] = P(lx, 0.33, lz);
      if (burnt && rnd() < 0.5) { put(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), M.dark, x, 0.2, z, ry, { rx: Math.PI / 2, grime: 0 }); continue; }
      put(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18), M.rubber, x, y, z, ry, { rx: Math.PI / 2, grime: 0 });
      const [rx2, , rz2] = P(lx, 0, lz + Math.sign(lz) * 0.12);
      put(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), M.metal, rx2, y, rz2, ry, { rx: Math.PI / 2, grime: 0, tint: 0x9a9a9a });
      if (!burnt && !LOW_DETAIL) {   // spokes and the centre cap
        for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; const [sx2, , sz3] = P(lx + Math.cos(a) * 0.1, 0, lz + Math.sign(lz) * 0.135); put(new THREE.BoxGeometry(0.04, 0.17, 0.015), M.metal, sx2, y + Math.sin(a) * 0.1, sz3, ry, { rx: 0, rz: a + Math.PI / 2, grime: 0, tint: 0x6a6a6a }); }
        const [cx3, , cz3] = P(lx, 0, lz + Math.sign(lz) * 0.14); put(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), M.dark, cx3, y, cz3, ry, { rx: Math.PI / 2, grime: 0 });
      }
    }
  }

  // a street tree (London plane / maple): a straight trunk, a few branches, a rounded leafy crown
  function buildTree(cx, cz, r) {
    put(new THREE.CylinderGeometry(0.14, 0.2, 3.4, 8), M.wood, cx, 1.7, cz, 0, { grime: 0, tint: 0x7a6a58 });
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + r(), g = new THREE.CylinderGeometry(0.05, 0.08, 1.6, 6);
      put(g, M.wood, cx + Math.cos(a) * 0.35, 3.6, cz + Math.sin(a) * 0.35, -a, { rz: 0.6, grime: 0, tint: 0x6a5a48 });
    }
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + r() * 0.5, rr = i < 5 ? 1.1 : 0, s = 1.3 + r() * 0.5;
      put(new THREE.IcosahedronGeometry(s, LOW_DETAIL ? 0 : 1), M.leaf, cx + Math.cos(a) * rr, 4.4 + (i === 5 ? 0.9 : r() * 0.5), cz + Math.sin(a) * rr, r() * 3, { sy: 0.8, grime: 0, cast: true, tint: [0x8aa070, 0x7a9a5a, 0x9ab07a][i % 3] });
    }
  }
  function buildPalm(cx, cz, r) {
    let x = cx, y = 0, z = cz, lean = 0.08;
    for (let i = 0; i < 8; i++) {
      const g = new THREE.CylinderGeometry(0.17 - i * 0.008, 0.2 - i * 0.008, 0.8, 8);
      put(g, M.wood, x, y + 0.4, z, 0, { rz: lean * i * 0.4, grime: 0, tint: 0x8a7458 });
      x -= Math.sin(lean * i * 0.4) * 0.8 * 0.5; y += 0.78;
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3;
      const g = new THREE.PlaneGeometry(0.5, 2.6, 1, 4);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) { const t = (pos.getY(k) + 1.3) / 2.6; pos.setZ(k, -t * t * 1.0); pos.setX(k, pos.getX(k) * (1 - t * 0.7)); }
      g.computeVertexNormals();
      g.translate(0, 1.3, 0);
      put(g, M.leaf, x, y, z, a, { rx: 1.15, grime: 0, cast: true, tint: i % 2 ? 0xffffff : 0xd8e0c0 });
    }
  }

  // collision + dressing
  const add = (cx, cz, w, d, h, y0, kind, extra, team) => {
    const xf = extra && extra.xf;
    const g0 = glows.length, h0 = glowsHot.length;
    if (xf) XF = xf;
    const nb = physics.boxes.length;
    // collision that matches what's drawn (no invisible edges): some props are smaller than their layout box
    if (kind === 'ammo') solid(cx, cz, 1.85, 1.02, 1.12, 0, 'metal');
    else if (kind === 'palm') solid(cx, cz, 0.32, 0.32, h, y0, 'wood');
    else if (kind === 'sand') solid(cx, cz, w > d ? w - 0.55 : Math.min(w, 0.62), w > d ? Math.min(d, 0.62) : d - 0.55, h - 0.1, y0, 'concrete');
    else if (kind === 'car') {   // body, then the narrower, shorter cabin
      const al = w > d;
      solid(cx, cz, al ? w - 0.5 : w - 0.25, al ? d - 0.25 : d - 0.5, 0.85, y0, 'metal');
      solid(cx, cz, al ? w - 1.5 : w - 0.5, al ? d - 0.5 : d - 1.5, h - 0.85, y0 + 0.85, 'metal').pass = true;   // cabin: mostly glass, bullets go through
    } else if (kind === 'jersey') {   // wide foot, narrow top
      const al = w > d;
      solid(cx, cz, al ? w : 0.6, al ? 0.6 : d, 0.3, y0, 'concrete');
      solid(cx, cz, al ? w : 0.3, al ? 0.3 : d, h - 0.3, y0 + 0.3, 'concrete');
    } else if (kind === 'bench') solid(cx, cz, w, d, 0.95, y0, 'wood').pass = true;
    else if (kind === 'rsign') solid(cx, cz, 0.12, 0.12, 2.2, y0, 'metal').pass = true;   // the post: stops you, not bullets
    else if (kind === 'stairs' && PROPS.stairs) { /* the model's own treads (decorate) */ }
    else if (!NO_SOLID.has(kind)) solid(cx, cz, w, d, h, y0, SURFACE[kind] || 'concrete');
    decorate(cx, cz, w, d, h, y0, kind, extra ?? 0, team);
    for (let i = nb; i < physics.boxes.length; i++) if (!physics.boxes[i].src) physics.boxes[i].src = `${kind}@${+cx.toFixed(1)},${+cz.toFixed(1)}`; // for the collision audit
    if (xf) {
      for (const arr of [[glows, g0], [glowsHot, h0]]) for (let i = arr[1]; i < arr[0].length; i++) { const q = arr[0][i]; [q[0], q[2]] = xfPt(q[0], q[2]); }
      XF = null;
    }
  };
  if (street) for (const it of LAYOUT.center) add(...it.slice(0, 7), it[7], 0);
  if (street) for (const [cx, cz, w, d, h, y0, kind, extra] of LAYOUT.half) {
    add(cx, cz, w, d, h, y0, kind, extra, 1);
    const flipSide = { n: 's', s: 'n', e: 'w', w: 'e' };
    const mx = kind === 'house' ? mirrorSpec(extra) : kind === 'lights' ? [-extra[0], -extra[1], -extra[2], -extra[3]]
      : kind === 'cable' ? [-extra[0], -extra[1], extra[2], -extra[3], -extra[4], extra[5]]
      : kind === 'stairdown' ? { ...extra, dir: -((extra && extra.dir) || 1) }
      : kind === 'dumpster' || kind === 'rsign' ? { ...extra, ry: ((extra && extra.ry) || 0) + Math.PI }
      : kind === 'tunnel' ? { ...extra, gaps: (extra && extra.gaps || []).map(([k, at, wd]) => [flipSide[k], -at, wd]) }
      : extra;
    add(-cx, -cz, w, d, h, y0, kind, mx, 0);
  }

  if (placeSignals) placeSignals();
  for (const f of afterLayout) f();

  // ---------- street dressing: puddles, litter, posters (all batched, no extra draw calls) ----------
  if (street) {
    const blocked = (x, z, r) => HOLES.some(h => x > h[0] - r && x < h[2] + r && z > h[1] - r && z < h[3] + r) || physics.boxes.some(b => b.maxy > 0.2 && b.miny < 2 && x > b.minx - r && x < b.maxx + r && z > b.minz - r && z < b.maxz + r);
    const inside = (x, z) => Math.abs(x) < HX - 3 && Math.abs(z) < HZ - 3;
    // rain puddles: near-black water that mirrors the dusk sky, soft-edged, in the open streets
    const puddleMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.8,
      alphaMap: radial([[0, 'rgba(255,255,255,1)'], [0.62, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]), transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const nPud = Math.round(HX * HZ / 90);
    for (let i = 0, tries = 0; i < nPud && tries < nPud * 12; tries++) {
      const x = (rnd() - 0.5) * 2 * (HX - 12), z = (rnd() - 0.5) * 2 * (HZ - 4);
      const w = 1.2 + rnd() * 2.6, d = 0.8 + rnd() * 1.8;
      if (blocked(x, z, Math.max(w, d) * 0.6)) continue;
      put(new THREE.CircleGeometry(0.5, 24), puddleMat, x, 0.022, z, rnd() * Math.PI, { rx: -Math.PI / 2, sx: w, sy: d, grime: 0, cast: false });
      i++;
    }
    // steel street bins on the sidewalks, between the lamp posts (CC-BY 4.0, "Simple Bin - steel" by Sousinho)
    if (PROPS.bin) {
      const bb = PROPS.bin.box, bs = 0.95 / (bb.max.y - bb.min.y);
      for (const sz of [-1, 1]) for (let x = -(HX - 18) + 6; x <= HX - 14; x += 16) {
        const z = sz * (HZ - 1.4), xx = x + (rnd() - 0.5) * 2;
        if (blocked(xx, z, 0.5)) continue;
        for (const pt of PROPS.bin.parts) put(pt.geo.clone(), pt.mat, xx, -bb.min.y * bs, z, rnd() * 6, { sx: bs, sy: bs, sz: bs, grime: 0 });
        solid(xx, z, 0.5, 0.5, 0.95, 0, 'metal');
      }
    }
    // litter along the walls: bin bags, tyres, cardboard, newspaper. Each stops your feet (no wading through a
    // bag), not bullets; bots don't plan round it
    const litter = (x, z, s, h) => { const b = solid(x, z, s, s, h, 0, 'cloth'); b.pass = true; b.navIgnore = true; };
    const bagMat = std({ color: 0x1b1d20, roughness: 0.35, metalness: 0.05 });
    const paperMat = std({ color: 0xd9d2c0, roughness: 0.9, side: THREE.DoubleSide });
    const nLit = Math.round(HX * HZ / 40);
    for (let i = 0, tries = 0; i < nLit && tries < nLit * 20; tries++) {
      const x = (rnd() - 0.5) * 2 * (HX - 4), z = (rnd() - 0.5) * 2 * (HZ - 3);
      if (!inside(x, z) || blocked(x, z, 0.35) || !blocked(x, z, 1.1)) continue; // up against something, never in the way
      const k = rnd();
      if (k < 0.4) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let j = 0; j < n; j++) {
          const g = new THREE.SphereGeometry(0.3, 10, 8);
          const pp = g.attributes.position;
          for (let v = 0; v < pp.count; v++) { const y = pp.getY(v); pp.setY(v, y < 0 ? y * 0.55 : y * (0.9 + Math.sin(pp.getX(v) * 9) * 0.08)); }
          g.computeVertexNormals();
          const bx = x + (rnd() - 0.5) * 0.6, bz = z + (rnd() - 0.5) * 0.6;
          put(g, bagMat, bx, 0.17, bz, rnd() * 6, { sx: 1 + rnd() * 0.3, sz: 0.9 + rnd() * 0.3, grime: 0.2, tint: rnd() < 0.3 ? 0x2d3b2a : 0xffffff });
          litter(bx, bz, 0.55, 0.42);
        }
      } else if (k < 0.55) {
        put(new THREE.TorusGeometry(0.3, 0.11, 8, 16), M.rubber, x, 0.11, z, rnd() * 6, { rx: Math.PI / 2, grime: 0.3 });
        litter(x, z, 0.75, 0.22);
      } else if (k < 0.75) {
        const bw = 0.5 + rnd() * 0.3, bh = 0.3 + rnd() * 0.2;
        put(flatBox(bw, bh, 0.4, 0), M.paint, x, 0.2, z, rnd() * 6, { rz: (rnd() - 0.5) * 0.3, grime: 0.3, tint: 0xb59a6e });
        litter(x, z, 0.4, 0.2 + bh / 2);
      } else {
        for (let j = 0; j < 3; j++) put(new THREE.PlaneGeometry(0.3, 0.42), paperMat, x + (rnd() - 0.5) * 1.2, 0.012 + j * 0.002, z + (rnd() - 0.5) * 1.2, rnd() * 6, { rx: -Math.PI / 2, grime: 0, cast: false });
      }
      i++;
    }
  }

  // ---------- perimeter buildings ----------
  const facade = (ox, oz, ax, az, nx, nz, L, depth) => {
    // ox,oz: start corner on the facade line; (ax,az) along; (nx,nz) normal pointing into the map
    let s = 0;
    while (s < L - 0.5) {
      const bw = Math.min(L - s, 6 + Math.floor(rnd() * 5));
      const floors = (LAYOUT.facadeFloors || 2) + Math.floor(rnd() * 3);
      const H = floors * 3.2 + 0.6;
      const pio = LAYOUT.facadeStyle === 'brick';
      const brk = pio ? rnd() < 0.6 : rnd() < 0.2;
      const tint = pio ? (brk ? [0xffffff, 0xe9c6a8, 0xc08a70, 0xa8705c][Math.floor(rnd() * 4)] : [0xe8dcc4, 0xd8c8a8, 0xcfc2a6][Math.floor(rnd() * 3)]) : plasterTints[Math.floor(rnd() * plasterTints.length)];
      const mx = ox + ax * (s + bw / 2), mz = oz + az * (s + bw / 2);
      const ry = Math.atan2(nx, nz);
      const bx = mx - nx * depth / 2, bz = mz - nz * depth / 2;
      const mat = brk ? M.brick : pio ? M.stone : M.plaster;
      put(worldBox(bw, H, depth, scaleOf(mat)), mat, bx, H / 2, bz, ry, { tint: mat === M.brick && !pio ? 0xffffff : tint, grime: pio ? 0.35 : 0.55 });
      if (pio) {
        // Pioneer Square block: rusticated stone ground floor, string course, heavy cornice, arched top-floor windows
        put(worldBox(bw + 0.02, 4.2, 0.2, scaleOf(M.stone)), M.stone, mx + nx * 0.1, 2.1, mz + nz * 0.1, ry, { tint: 0xa79d8c, grime: 0.5 });
        put(worldBox(bw + 0.1, 0.3, 0.4, 3), M.stone, mx + nx * 0.2, 4.3, mz + nz * 0.2, ry, { tint: 0xc9bfae, grime: 0.1, base: 4 });
        put(worldBox(bw + 0.2, 0.6, 0.8, 3), M.stone, mx + nx * 0.4, H - 0.4, mz + nz * 0.4, ry, { tint: 0xc9bfae, grime: 0.15, base: H - 1 });
        put(worldBox(bw + 0.1, 0.25, 0.55, 3), M.stone, mx + nx * 0.27, H - 0.85, mz + nz * 0.27, ry, { tint: 0xb9ae9c, grime: 0.1, base: H - 1 });
      }
      // roof parapet + clutter
      put(worldBox(bw, 0.6, 0.3, 3), M.concrete, mx - nx * 0.09, H + 0.28, mz - nz * 0.09, ry, { tint: 0xd8d2c4, grime: 0.1, base: H });
      if (rnd() < 0.6) put(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14), M.metal, bx + ax * (rnd() - 0.5) * bw * 0.6, H + 0.65, bz, 0, { tint: 0x3d6b8a, grime: 0.2, base: H });
      if (rnd() < 0.5) put(new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), M.paint, mx - nx * 1.2 + ax * 1.5, H + 0.9, mz - nz * 1.2 + az * 1.5, ry, { rx: -1.1, tint: 0xe8e8e8, grime: 0 });
      // floor ledges
      for (let f = 1; f < floors; f++) put(worldBox(bw, 0.14, 0.16, 3), M.concrete, mx + nx * 0.07, f * 3.2, mz + nz * 0.07, ry, { tint: 0xe6e0d4, grime: 0.15, base: f * 3.2 });
      // ground floor shops
      const shops = Math.max(1, Math.floor(bw / 3.2));
      for (let i = 0; i < shops; i++) {
        const t = s + (i + 0.5) * (bw / shops);
        const px = ox + ax * t + nx * 0.03, pz = oz + az * t + nz * 0.03;
        if (pio) {
          put(worldBox(bw / shops - 0.8, 2.9, 0.06, 0), M.glass, px + nx * 0.2, 1.75, pz + nz * 0.2, ry, { grime: 0, tint: rnd() < 0.3 ? 0xd8c9a0 : 0xffffff });
          put(worldBox(bw / shops - 0.6, 0.12, 0.14, 0), M.frame, px + nx * 0.22, 3.25, pz + nz * 0.22, ry, { grime: 0, tint: 0x1f2622 });
          put(worldBox(0.1, 3.0, 0.14, 0), M.frame, px + nx * 0.22, 1.7, pz + nz * 0.22, ry, { grime: 0, tint: 0x1f2622 });
        } else if (rnd() < 0.7) {
          put(worldBox(2.4, 2.3, 0.06, 2.4), M.metal, px, 1.15, pz, ry, { tint: shutterTints[Math.floor(rnd() * 4)], grime: 0.4 });
        } else {
          put(worldBox(1.1, 2.2, 0.06, 0), M.rubber, px, 1.1, pz, ry, { grime: 0 });
          put(worldBox(1.3, 0.12, 0.1, 3), M.concrete, px, 2.25, pz, ry, { grime: 0 });
        }
        if (rnd() < 0.7) put(worldBox(2.6, 0.55, 0.08, 0), M.paint, px + nx * 0.03, 2.75, pz + nz * 0.03, ry, { tint: signTints[Math.floor(rnd() * signTints.length)], grime: 0.1, base: 2.4 });
        if (rnd() < 0.45) put(new THREE.PlaneGeometry(2.7, 1.3, 6, 2), M.cloth, px + nx * 0.6, 2.35, pz + nz * 0.6, ry, { rx: -Math.PI / 2 + 0.45, tint: signTints[Math.floor(rnd() * 4)], grime: 0 });
      }
      // upper floor windows, balconies, AC units
      for (let f = 1; f < floors; f++) {
        const wins = Math.max(1, Math.floor(bw / 2.6));
        for (let i = 0; i < wins; i++) {
          const t = s + (i + 0.5) * (bw / wins);
          const px = ox + ax * t, pz = oz + az * t, y = f * 3.2 + 1.5;
          if (pio) {
            const top = f === floors - 1, ww = 1.1, wh = top ? 1.6 : 1.9;
            windowDecor(px, pz, nx, nz, y, ww, wh);
            if (top || f % 2 === 0) put(bothSides(new THREE.TorusGeometry(ww / 2 + 0.12, 0.12, 5, 14, Math.PI)), mat, px + nx * 0.06, y + wh / 2 - 0.05, pz + nz * 0.06, ry, { tint: brk ? 0xc9a080 : 0xd8ccb4, grime: 0.15 });
            continue;
          }
          windowDecor(px, pz, nx, nz, y);
          if (rnd() < 0.3) put(worldBox(0.8, 0.5, 0.4, 0), M.paint, px + ax * 0.9 + nx * 0.25, y - 0.9, pz + az * 0.9 + nz * 0.25, ry, { tint: 0xd2d2cc, grime: 0.05, base: y - 2 });
          if (rnd() < 0.15) {
            put(worldBox(1.8, 0.12, 0.9, 3), M.concrete, px + nx * 0.45, y - 0.85, pz + nz * 0.45, ry, { grime: 0.1, base: y - 2 });
            put(worldBox(1.8, 0.05, 0.04, 0), M.dark, px + nx * 0.88, y - 0.05, pz + nz * 0.88, ry, { grime: 0 });
            for (let k = 0; k < 7; k++) put(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), M.dark, px + ax * (-0.85 + k * 0.28) + nx * 0.88, y - 0.45, pz + az * (-0.85 + k * 0.28) + nz * 0.88, 0, { grime: 0 });
          }
        }
      }
      // hanging cables between buildings
      if (rnd() < 0.5) {
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(mx + nx * 0.2, H - 1, mz + nz * 0.2),
          new THREE.Vector3(mx + nx * 5, H - 3.5, mz + nz * 5 + ax * 3),
          new THREE.Vector3(mx + nx * 0.2 + ax * bw * 0.9, H - 0.8, mz + nz * 0.2 + az * bw * 0.9));
        put(new THREE.TubeGeometry(curve, 16, 0.012, 4), M.rubber, 0, 0, 0, 0, { grime: 0, cast: false });
      }
      s += bw;
    }
  };
  if (street) {
    facade(-(HX + 1), HZ, 1, 0, 0, -1, 2 * HX + 2, 8);    // north row faces -z
    facade(HX + 1, -HZ, -1, 0, 0, 1, 2 * HX + 2, 8);      // south row faces +z
    facade(HX, HZ + 1, 0, -1, -1, 0, 2 * HZ + 2, 8);      // east row faces -x
    facade(-HX, -(HZ + 1), 0, 1, 1, 0, 2 * HZ + 2, 8);    // west row faces +x
  }
  // custom maps build themselves with the same helpers
  let custom = null;
  if (!street) custom = LAYOUT.build({ addKind: add, low: LOW_DETAIL, THREE, tex, pbr, M, S, B, put, solid, plane, decal, glows, group, rnd, scaleOf, worldBox, flatBox, buildCar, buildHouse, windowDecor, physics, poolMat, glowTex, bag, plasterTints });

  // street lamps and power poles inside the map edge
  if (street) for (const sz of [-1, 1]) for (let x = -(HX - 18); x <= HX - 18; x += 16) {
    const z = sz * (HZ - 1.8);
    put(new THREE.CylinderGeometry(0.06, 0.09, 6, 8), M.dark, x, 3, z, 0, { grime: 0.2 });
    put(worldBox(0.08, 0.08, 1.2, 0), M.dark, x, 5.9, z - sz * 0.6, 0, { grime: 0 });
    put(worldBox(0.34, 0.12, 0.55, 0), M.dark, x, 5.9, z - sz * 1.1, 0, { grime: 0 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.46), M.lamp);
    lamp.position.set(x, 5.82, z - sz * 1.1);
    group.add(lamp);
    glows.push([x, 5.75, z - sz * 1.1, 1.6]);
    decal(poolMat, 7, 7, x, 0.05, z - sz * 2.2, 0, -Math.PI / 2);
    // a real light under each lamp head (High / Ultra): lights walls, players and the street below
    const spot = new THREE.SpotLight(0xffc27a, 130, 18, 0.95, 0.65, 1.6);
    spot.position.set(x, 5.7, z - sz * 1.1);
    spot.target.position.set(x, 0, z - sz * 3.2);
    spot.userData.lampLight = true;
    group.add(spot, spot.target);
  }
  // overhead power lines: sagging cables pole to pole along each sidewalk, and drops from each pole
  // up to the building fronts behind it (the silhouette overhead that makes a street read as lived-in)
  if (street) {
    const cable = (a, b, sag) => {
      const m = a.clone().lerp(b, 0.5); m.y -= sag;
      put(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 20, 0.014, 4), M.rubber, 0, 0, 0, 0, { grime: 0, cast: false });
    };
    for (const sz of [-1, 1]) {
      const z = sz * (HZ - 1.8);
      const xs = []; for (let x = -(HX - 18); x <= HX - 18; x += 16) xs.push(x);
      for (let i = 0; i + 1 < xs.length; i++) for (const dy of [5.95, 5.55]) cable(new THREE.Vector3(xs[i], dy, z), new THREE.Vector3(xs[i + 1], dy, z), 0.9 + rnd() * 0.4);
      for (const x of xs) cable(new THREE.Vector3(x, 5.9, z), new THREE.Vector3(x + (rnd() - 0.5) * 6, 7.6 + rnd() * 2, sz * (HZ + 0.1)), 0.6);
    }
  }

  // glow sprites for every bulb (bloom does the rest)
  if (LAYOUT.daylight) { M.bulb.color.set(0xf2f0ea); M.bulb.emissive.set(0xfff2d8); M.bulb.emissiveIntensity = 0.35; M.bulb.roughness = 0.3; glows.length = 0; }
  glows.push(...glowsHot);
  if (glows.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(glows.flatMap(q => [q[0], q[1], q[2]]), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, size: 0.9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.25, 0.85) }));
    pts.renderOrder = 3;
    group.add(pts);
  }

  // base flags
  if (street) for (const team of [0, 1]) {
    const sx = team === 1 ? 1 : -1;
    put(new THREE.CylinderGeometry(0.05, 0.06, 7, 8), M.dark, sx * (HX - 1.5), 3.5, 0, 0, { grime: 0.2 });
    const g = new THREE.PlaneGeometry(1.8, 1.1, 10, 4);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 2.5) * 0.12);
    g.computeVertexNormals();
    put(g, M.cloth, sx * (HX - 1.5) - sx * 0.95, 6.2, 0, Math.PI / 2, { grime: 0, tint: team ? 0x5a2622 : 0x3d4f63 });
  }

  // distant city skyline beyond the perimeter (hazed by fog): real downtown buildings when the model set is
  // loaded (CC-BY 4.0, "Downtown Buildings Set - Low Poly model" by Daniel Zhabotinsky), boxes otherwise
  const BV = buildingVariants();
  if (LAYOUT.skyline === false) { /* the map dresses its own horizon */ }
  else if (BV && BV.length) {
    const R0 = Math.max(HX, HZ) + 26;
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + rnd() * 0.08;
      const v = BV[(i * 7 + Math.floor(rnd() * BV.length)) % BV.length];
      const r = R0 + Math.max(v.size.x, v.size.z) * 0.5 + rnd() * 50;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.85;
      const ry = Math.atan2(-x, -z) + (rnd() - 0.5) * 0.4;      // roughly facing the map
      for (const pt of v.parts) put(pt.geo.clone(), pt.mat, x, 0, z, ry, { grime: 0, cast: false });
    }
  } else for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const r = Math.max(HX, HZ) + 28 + rnd() * 70;
    const h = 8 + rnd() * 26;
    const w = 8 + rnd() * 14;
    put(worldBox(w, h, w, 3), M.plaster, Math.cos(a) * r, h / 2, Math.sin(a) * r * 0.85, rnd() * 3, { tint: plasterTints[i % plasterTints.length], grime: 0.3, cast: false });
  }

  rankGroundLayers();
  batch.build(group);
  if (LAYOUT.mountain !== false) group.add(buildMountain());

  for (const [k, m] of Object.entries(M)) if (m && m.isMaterial && !m.name) m.name = k;   // named, for the map audit's reports
  const world = { id: LAYOUT.id, name: LAYOUT.name, pickupSpots: LAYOUT.pickups, group, spawns: [[], []], materials: M, textures: tex };
  if (LAYOUT.spawns2) {
    // asymmetric maps list each team's spawns
    LAYOUT.spawns2.forEach((list, t) => { for (const [x, z] of list) world.spawns[t].push(new THREE.Vector3(x, 0, z)); });
  } else for (const [x, z] of LAYOUT.spawns) {
    world.spawns[1].push(new THREE.Vector3(x, 0, z));
    world.spawns[0].push(new THREE.Vector3(-x, 0, -z));
  }
  if (ROADS && signalMats.x.length) {
    // 22 s cycle: x-roads green 9 s, amber 2 s, all-red 0.5 s; then the z-roads
    let phase = -1;
    world.update = (dt, t) => {
      const c = t % 22, x = c < 9 ? 2 : c < 11 ? 1 : 0, z = c >= 11.5 && c < 20.5 ? 2 : c >= 20.5 ? 1 : 0;
      const k = x * 3 + z; if (k === phase) return; phase = k;
      signalMats.x.forEach((m, i) => { m.emissiveIntensity = i === x ? 6 : 0.05; });
      signalMats.z.forEach((m, i) => { m.emissiveIntensity = i === z ? 6 : 0.05; });
    };
    world.update(0, 0);
  }
  if (station) {
    // the trains run on `clock`, a time every machine in an online match agrees on (game.netClock)
    const signals = world.update;
    world.update = (dt, t, clock = t) => { if (signals) signals(dt, t); station.update(dt, clock); };
    world.trainHit = station.trainHit;
    world.sounds = station.sounds;
  }
  if (LAYOUT.sites) world.sites = [LAYOUT.sites, LAYOUT.sites];   // asymmetric maps: both teams use the same two sites
  if (LAYOUT.lower) world.upper = LAYOUT.lower;                    // a second nav level (here below ground)
  if (custom) Object.assign(world, custom); // update(), menuCam, sites, ambient music, ...
  world.spawnYaw = [-Math.PI / 2, Math.PI / 2];
  world.nav = new NavGrid(physics, MAP, 1, 0.45);
  // more levels bots can use (Freshway's offices, the station under Pioneer Square): each its own grid, joined
  // by stairs to the street or to another level (portal.link: 0 = the street, k = the k-th level)
  if (world.upper) {
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    world.nav.levels = [].concat(world.upper).map(u => ({
      grid: new NavGrid(physics, u.bounds, 0.5, 0.35, { floorY: u.y }), y: u.y,
      portals: u.portals.map(q => ({ link: q.link || 0, climb: q.climb.map(V), rect: q.rect })),
    }));
    world.upperPoint = () => {
      const { grid, y } = world.nav.levels[(Math.random() * world.nav.levels.length) | 0];
      const k = grid.openCells[(Math.random() * grid.openCells.length) | 0];
      return new THREE.Vector3(grid.cx(k % grid.cols), y, grid.cz((k / grid.cols) | 0));
    };
  }
  world.bounds = { hx: HX, hz: HZ };
  world.look = LAYOUT.look;
  return world;
}

// Mount Rainier on the horizon: a broad stratovolcano with glaciers, rock ribs and forested foothills,
// far beyond the fog (it uses its own haze so it stays visible), lined up with the lanes to the east so
// it looms over the rooftops. The low sun behind the player lights it with alpenglow.
function buildMountain() {
  const rnd = seeded(4392);
  const R = 1500, H = 640, segR = LOW_DETAIL ? 50 : 110, segA = LOW_DETAIL ? 90 : 180;
  const pos = [], col = [], idx = [];
  // value noise for ridges
  const N = 64, tab = Array.from({ length: N * N }, () => rnd());
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const g = (i, j) => tab[((i % N + N) % N) + ((j % N + N) % N) * N];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (g(xi, yi) * (1 - sx) + g(xi + 1, yi) * sx) * (1 - sy) + (g(xi, yi + 1) * (1 - sx) + g(xi + 1, yi + 1) * sx) * sy;
  };
  const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.27 + vn(x * 4.3, y * 4.3) * 0.15 + vn(x * 9, y * 9) * 0.08;
  const snow = new THREE.Color(0.86, 0.87, 0.93), rock = new THREE.Color(0.34, 0.31, 0.32), forest = new THREE.Color(0.1, 0.14, 0.11), c = new THREE.Color();
  for (let i = 0; i <= segR; i++) {
    const t = i / segR;                         // 0 at the summit, 1 at the base
    // concave flanks under a broad rounded summit dome, with a shoulder (Little Tahoma) on one side
    const dome = t < 0.1 ? 0.012 * Math.cos(t / 0.1 * Math.PI / 2) : 0;
    const prof = Math.pow(1 - t, 2.1) * 0.74 + (1 - t) * 0.26 + dome;
    for (let j = 0; j <= segA; j++) {
      const a = (j / segA) * Math.PI * 2;
      const r = t * R * (0.86 + 0.28 * vn(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + 9));
      const ridge = fbm(Math.cos(a) * 6 + t * 2, Math.sin(a) * 6 + t * 2);
      // summit plateau with twin crater rims (Columbia Crest and Liberty Cap)
      const crest = t < 0.05 ? -0.01 * (1 - t / 0.05) : 0;
      const shoulder = 0.05 * Math.exp(-Math.pow((t - 0.3) / 0.08, 2)) * Math.max(0, Math.cos(a - 3.6)) ** 4;
      const h = H * (prof + crest + shoulder) + (ridge - 0.5) * H * 0.16 * Math.min(1, t * 3) * (1 - t * 0.6);
      pos.push(Math.cos(a) * r, Math.max(0, h), Math.sin(a) * r);
      // glaciers down to ~40% of the height, broken by rock ribs; forest on the foothills
      const hn = h / H;
      const rib = fbm(Math.cos(a) * 14 + 3, Math.sin(a) * 14 + t * 6);
      const snowLine = 0.36 + (rib - 0.5) * 0.35;
      if (hn > snowLine) c.copy(snow).lerp(rock, rib > 0.72 && hn < 0.85 ? 0.75 : 0.04);
      else if (hn > 0.16) c.copy(rock).lerp(snow, Math.max(0, (hn - snowLine + 0.06) / 0.06));
      else c.copy(forest).lerp(rock, hn / 0.16 * 0.6);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segR; i++) for (let j = 0; j < segA; j++) {
    const a = i * (segA + 1) + j, b = a + segA + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, fog: false });
  // distance haze of its own: the base melts into the dusk sky, the summit stays crisp
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vMy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMy = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMy;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float hz = 1.0 - smoothstep(0.0, ${(H * 0.75).toFixed(1)}, vMy);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.66, 0.72, 0.8), 0.25 + 0.6 * hz);`);
  };
  const m = new THREE.Mesh(g, mat);
  m.position.set(1750, -20, 160);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

// Top-down render of the map for the minimap (needs the renderer, so it runs after the scene is built)
export function renderMinimap(renderer, scene) {
  const W = 504, H = Math.round(W * (MAP.maxZ - MAP.minZ) / (MAP.maxX - MAP.minX));
  const cam = new THREE.OrthographicCamera(MAP.minX, MAP.maxX, -MAP.minZ, -MAP.maxZ, 1, 200);
  cam.position.set(0, 100, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const fog = scene.fog;
  scene.fog = null;
  // roofs (indoor maps) come off for the top-down view
  const hidden = [];
  scene.traverse(o => { if (o.userData.noMinimap && o.visible) { o.visible = false; hidden.push(o); } });
  const prevShadow = renderer.shadowMap.enabled;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  scene.fog = fog;
  for (const o of hidden) o.visible = true;
  renderer.shadowMap.enabled = prevShadow;
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = ((H - 1 - y) * W + x) * 4, di = (y * W + x) * 4;
      const l = (px[si] * 0.3 + px[si + 1] * 0.59 + px[si + 2] * 0.11);
      // desaturate and tint toward a tactical slate
      img.data[di] = l * 0.62 + 18; img.data[di + 1] = l * 0.68 + 22; img.data[di + 2] = l * 0.7 + 26; img.data[di + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, scale: W / (MAP.maxX - MAP.minX) };
}
