// Maps (Tarsa Market, Shuran Yard): collision layout + dressed geometry (merged per material), spawns, pickups, nav grid
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Box } from './physics.js';
import { NavGrid } from './nav.js';
import { makeTextureSets } from './textures.js';

export const MAP = { minX: -42, maxX: 42, minZ: -30, maxZ: 30 };

// Collision layout. [cx, cz, w(x), d(z), h, y0, kind, extra]
// HALF items are mirrored through the center (x,z) -> (-x,-z) so both teams get the same map.
// 'house' = enterable one-storey building; extra = { n|s|e|w: [[ 'd'|'w', offset, width? ], ...], props, light }
//   (offsets run along +x on the n/s walls and +z on the e/w walls; mirrored copies are rotated for you)
// Lanes are broken up with staggered buildings and walls so there's no straight line across the map:
// fights happen around corners, through doorways and windows.
const TARSA_CENTER = [
  [0, 0, 8, 8, 3.2, 0, 'house', { n: [['d', -2.6], ['w', 0.9, 1.1]], s: [['d', 2.6], ['w', -0.9, 1.1]], e: [['d', 1.8]], w: [['d', -1.8]], props: [['table', 0, 0], ['shelf', 0, 1.7, 0], ['shelf', 0, -1.7, 0]], light: 1 }],
];
const TARSA_HALF = [
  // centre house roof: parapets, open on the stair side
  [0, 3.95, 8.2, 0.3, 0.6, 3.45, 'parapet'],
  [3.95, 1.6, 0.3, 4.8, 0.6, 3.45, 'parapet'],
  // north divider (z 6..12): house, tall block, alley, house, gap to spawn
  [7, 9, 7, 6, 3.2, 0, 'house', { n: [['d', 1.5]], s: [['d', -1.5], ['w', 1.6]], e: [['w', 0]], w: [['d', 0]], props: [['crates', -2, 1.4], ['shelf', 0.2, 0, 0]] }],
  [14, 9.5, 5, 5, 7, 0, 'block'],
  [23, 9, 8, 6, 3.2, 0, 'house', { n: [['d', -2]], s: [['d', -2.8]], e: [['w', 0]], w: [['w', 0]], props: [['table', 1.5, 0.5], ['shelf', -1, 0, 0]] }],
  // south divider (z -12..-6): tall block, house, container wall
  [5.5, -9.5, 6, 5, 7, 0, 'block'],
  [13, -9, 7, 6, 3.2, 0, 'house', { n: [['d', 1]], s: [['d', -1]], e: [['d', 0]], w: [['w', 0]], props: [['crates', 2, -1.5], ['shelf', 0, 0.3, 0]] }],
  [21.5, -7.4, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [21.5, -10, 7, 2.6, 2.6, 0, 'container', 0x3e5d74],
  [21.5, -8.7, 7, 2.6, 2.6, 2.6, 'container', 0x6b7a3a],
  // mid lane (z -6..6): stalls and crates, a container, then a small house: a chicane, not a corridor
  [8.6, 4.8, 2.4, 0.9, 0.9, 0, 'stall', 0],
  [11, 1.6, 1.6, 1.6, 1.6, 0, 'crate'],
  [11.2, 1.6, 1.4, 1.4, 1.4, 1.6, 'crate'],
  [16, -3.5, 7, 2.6, 2.6, 0, 'container', 0x4d6b54],
  [16, 4.3, 3, 0.8, 1.1, 0, 'sand'],
  [23.5, 3, 5, 6, 3.2, 0, 'house', { w: [['d', 0]], e: [['d', 0]], s: [['w', 0]], n: [], props: [['crates', 1.2, 1.5]] }],
  [28.5, -2.5, 0.62, 4, 1.07, 0, 'jersey'],
  [28.5, 3.8, 1, 3, 3.5, 0, 'hesco'],
  // north lane (z 12..30): house in the middle of the street, courtyard wall, burnt car, kiosk stack
  [12, 22.5, 7, 6, 3.2, 0, 'house', { s: [['d', -1.5]], n: [['d', 2]], e: [['w', 0]], w: [['w', 0]], props: [['table', -1.8, 1], ['shelf', 0.3, 0, 0]] }],
  [22, 16, 0.6, 8, 2.4, 0, 'wall', 0],
  [18.5, 26.3, 4.4, 2.0, 1.45, 0, 'car', 1],
  [4, 27.4, 2.4, 0.9, 0.9, 0, 'stall', 0],
  [27, 22, 0.8, 3, 1.1, 0, 'sand'],
  [26.5, 14.5, 1.5, 1.5, 1.5, 0, 'crate'],
  [3, 18, 2, 2, 1.2, 0, 'pallet'],
  [16, 28.75, 2, 2.5, 1.8, 0, 'crate'],
  [6.6, 14.2, 0.62, 0.62, 0.9, 0, 'barrel'],
  [7.4, 14.0, 0.62, 0.62, 0.9, 0, 'barrel', 1],
  // south lane (z -30..-12): container yard
  [8, -17, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [8, -17, 7, 2.6, 2.6, 2.6, 'container', 0x6e7f86],
  [14, -23.5, 2.6, 7, 2.6, 0, 'container', 0x3e5d74],
  [20, -16, 2.6, 7, 2.6, 0, 'container', 0x7a6a3a],
  [26, -22.5, 1.6, 1.6, 1.6, 0, 'crate'],
  [27.8, -22.5, 1.6, 1.6, 1.6, 0, 'crate'],
  [4, -24.5, 2, 2, 1.2, 0, 'pallet'],
  [29, -16, 0.8, 3, 1.1, 0, 'sand'],
  [10, -28.5, 2, 3, 1.8, 0, 'crate'],
  // forward base: staggered HESCO so the spawn front isn't one long lateral corridor
  [29, 9, 3, 1, 3.5, 0, 'hesco'],
  [29.5, -14, 2, 1, 3.5, 0, 'hesco'],
  [31.5, 18, 1, 4, 3.5, 0, 'hesco'],
  [31.5, 0, 1, 4, 3.5, 0, 'hesco'],
  [31.5, -18, 1, 4, 3.5, 0, 'hesco'],
  [37, 9, 2, 2, 1.2, 0, 'ammo'],
  [40, 27.4, 0.5, 0.5, 6, 0, 'palm'],
  // lights: street lamps on the sidewalks, festoon lights strung across the mid lane, lamps in the yard
  [10.3, 0, 0, 0, 0, 0, 'lights', [10.3, 5.9, 10.3, -6.9]],
  [19.5, 0, 0, 0, 0, 0, 'lights', [19.5, 5.9, 19.5, -6.0]],
  [12.5, 0, 0, 0, 0, 0, 'light', 3.6],
  // perimeter
  [0, 30.5, 86, 1, 8, 0, 'boundary'],
  [42.5, 0, 1, 62, 8, 0, 'boundary'],
];
for (let k = 1; k <= 7; k++) TARSA_HALF.push([4 + (7.5 - k) * 0.9, -2.5, 0.9, 3, k * 0.5, 0, 'stairs', k]);

const TARSA_SPAWNS = [[38, -24], [38, -14], [38, -6], [38, 6], [38, 14], [38, 24], [35, -10], [35, 10]];

const TARSA_PICKUPS = [
  { type: 'health', pos: [0, 3.45, 0] },
  { type: 'health', pos: [13, 0, -9] },
  { type: 'health', pos: [-13, 0, 9] },
  { type: 'ammo', pos: [10, 0, 17] },
  { type: 'ammo', pos: [-10, 0, -17] },
  { type: 'ammo', pos: [24, 0, -3] },
  { type: 'ammo', pos: [-24, 0, 3] },
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
  [27.5, 2.5, 0.8, 3, 1.1, 0, 'sand'],
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
  { type: 'ammo', pos: [14.5, 0, 9] },
  { type: 'ammo', pos: [-14.5, 0, -9] },
  { type: 'ammo', pos: [11, 0, -9] },
  { type: 'ammo', pos: [-11, 0, 9] },
];

export const MAPS = {
  tarsa: { id: 'tarsa', name: 'Tarsa Market', blurb: 'Tight market streets, enterable houses and a central rooftop', center: TARSA_CENTER, half: TARSA_HALF, spawns: TARSA_SPAWNS, pickups: TARSA_PICKUPS },
  shuran: { id: 'shuran', name: 'Shuran Yard', blurb: 'Three lanes: market street, yard, container stacks', center: SHURAN_CENTER, half: SHURAN_HALF, spawns: SHURAN_SPAWNS, pickups: SHURAN_PICKUPS },
};
export const MAP_IDS = Object.keys(MAPS);

// ---------- helpers ----------
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
    const cast = opts.cast !== false;
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
function worldBox(w, h, d, scale, radius) {
  const r = radius ?? (Math.min(w, h, d) < 0.12 ? 0 : Math.min(0.05, Math.min(w, h, d) * 0.14));
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
  M.bag.normalScale = new THREE.Vector2(1.5, 1.5);
  // metres per texture repeat; photo sets are real-world scale, so they tile tighter than the generated ones
  const photo = (k) => !!(tex[k] && tex[k].photo);
  const S = {
    plaster: 3, concrete: photo('concrete') ? 2.5 : 3, brick: photo('brick') ? 2.2 : 2, asphalt: photo('asphalt') ? 4 : 7, dirt: photo('dirt') ? 5 : 9,
    tile: photo('tile') ? 2.6 : 2.2, metal: 2.4, wood: photo('wood') ? 1.6 : 1.2, woodOld: 1.6, sand: 1.2, hesco: 1.75, cloth: photo('cloth') ? 1.5 : 1, paint: 1.6, rust: 1.6, rubber: 1,
  };
  const scaleOf = (mat) => { for (const k in M) if (M[k] === mat) return S[k] || 0; return 0; };

  const batch = new Batcher();
  const group = new THREE.Group();
  scene.add(group);
  const rnd = seeded(1337);

  const put = (geo, mat, x, y, z, ry = 0, opts = {}) => {
    _e.set(opts.rx || 0, ry, opts.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(opts.sx || 1, opts.sy || 1, opts.sz || 1);
    _m.compose(_p, _q, _s);
    batch.add(geo, mat, _m, opts);
    geo.dispose();
  };
  const B = (mat, w, h, d, x, y, z, ry = 0, opts = {}) => put(worldBox(w, h, d, scaleOf(mat)), mat, x, y + h / 2, z, ry, opts);
  const solid = (cx, cz, w, d, h, y0 = 0, surface = 'concrete') => { const b = physics.addBox(new Box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2)); b.surface = surface; return b; };
  const SURFACE = { container: 'metal', car: 'metal', barrel: 'metal', crate: 'wood', pallet: 'wood', stall: 'wood', sand: 'dirt', hesco: 'dirt', palm: 'wood', ammo: 'metal', hutwall: 'brick' };
  const NO_SOLID = new Set(['house', 'lamp', 'lights', 'light']);

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
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const driftMat = new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(176,150,112,0.75)'], [0.6, 'rgba(176,150,112,0.35)'], [1, 'rgba(176,150,112,0)']]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const glows = []; // [x, y, z, size]
  // flat decals go through the batcher too (one draw call per decal material)
  const decal = (mat, w, h, x, y, z, ry, rx = 0) => put(new THREE.PlaneGeometry(w, h), mat, x, y, z, ry, { rx, grime: 0, cast: false });

  // ---------- ground ----------
  physics.addBox(new Box(-200, -2, -200, 200, 0, 200)).surface = 'ground';
  const plane = (mat, w, d, x, z, y, ry = 0) => {
    const g = new THREE.PlaneGeometry(w, d);
    const sc = scaleOf(mat);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / sc, uv.getY(i) * d / sc);
    put(g, mat, x, y, z, ry, { rx: -Math.PI / 2, grime: 0, cast: false });
  };
  plane(M.dirt, 300, 300, 0, 0, -0.01);
  plane(M.asphalt, 62, 60, 0, 0, 0.0);
  plane(M.tile, 26, 18, 0, 0, 0.012);
  for (const sx of [-1, 1]) plane(M.dirt, 11, 60, sx * 36.5, 0, 0.006); // forward bases on packed dirt
  for (const sz of [-1, 1]) plane(M.tile, 86, 2.6, 0, sz * 28.7, 0.016); // sidewalks
  // curbs
  for (const sz of [-1, 1]) B(M.concrete, 62, 0.12, 0.25, 0, 0, sz * 27.3, 0, { grime: 0.2, cast: false });
  // lane markings
  for (const sz of [-1, 1]) for (let x = -28; x <= 28; x += 4) {
    if (Math.abs(x) < 6) continue;
    put(new THREE.PlaneGeometry(0.15, 2), M.line, x, 0.02, sz * 18, Math.PI / 2, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0xbab39c });
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
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
    put(flatBox(ww + ft * 2, ft, fd, 0), M.frame, x, y + wh / 2 + ft / 2 - 0.02, z, ry, { grime: 0, tint: ftint });
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
    const brick = rnd() < 0.3;
    const wallMat = brick ? M.brick : M.plaster;
    const tint = brick ? 0xf2e6dc : plasterTints[Math.floor(rnd() * plasterTints.length)];
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
          put(flatBox(ow + 0.1, 0.12, T + 0.06, 0), M.frame, fx, y0 + 2.36, fz, ry, { grime: 0, tint: 0x5a4632 });
          if (rnd() < 0.7) {
            const hx = fx + S.ax * (ow / 2 - 0.08) - S.nx * (T / 2 + 0.45), hz = fz + S.az * (ow / 2 - 0.08) - S.nz * (T / 2 + 0.45);
            put(flatBox(0.85, 2.15, 0.05, 1.2), M.woodOld, hx, y0 + 1.1, hz, ry + Math.PI / 2, { grime: 0.3, tint: [0x6f5a3a, 0x3d4f5a, 0x7a3a2a][Math.floor(rnd() * 3)], base: y0 });
          }
          // threshold
          put(flatBox(ow, 0.05, T + 0.1, 0), M.concrete, fx, y0, fz, ry, { grime: 0.3, tint: 0xbab3a4 });
        } else {
          seg(o.a, o.b, 0, 1.0);
          seg(o.a, o.b, 2.1, h);
          // open window: frame, sill, a few glass shards left in the corners
          for (const sx of [-1, 1]) put(flatBox(0.07, 1.1, T + 0.04, 0), M.frame, fx + S.ax * sx * (ow / 2 - 0.035), y0 + 1.55, fz + S.az * sx * (ow / 2 - 0.035), ry, { grime: 0, tint: 0xe9e3d6 });
          put(flatBox(ow + 0.14, 0.07, T + 0.04, 0), M.frame, fx, y0 + 2.07, fz, ry, { grime: 0, tint: 0xe9e3d6 });
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
      // sand drifted against the outside of the wall
      if (rnd() < 0.6) decal(driftMat, S.len * 0.6, 1.2, S.ox + S.nx * (T / 2 + 0.45) + S.ax * (rnd() - 0.5) * S.len * 0.4, y0 + 0.035, S.oz + S.nz * (T / 2 + 0.45) + S.az * (rnd() - 0.5) * S.len * 0.4, ry, -Math.PI / 2);
    }
    // roof slab, cornice, rooftop clutter
    solid(cx, cz, w + 0.2, d + 0.2, 0.25, y0 + h, 'concrete');
    put(flatBox(w + 0.2, 0.25, d + 0.2, scaleOf(M.concrete), 0.02), M.concrete, cx, y0 + h + 0.125, cz, 0, { grime: 0.05, tint: 0xd6d0c4, base: y0 + h });
    put(flatBox(w + 0.34, 0.1, d + 0.34, 3, 0.02), M.concrete, cx, y0 + h - 0.08, cz, 0, { grime: 0, tint: 0xe6e0d4 });
    if (rnd() < 0.6 && !spec.light) put(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 14), M.metal, cx + (rnd() - 0.5) * (w - 2), y0 + h + 0.75, cz + (rnd() - 0.5) * (d - 2), 0, { tint: 0x3d6b8a, grime: 0.2, base: y0 + h });
    // floor
    const fl = new THREE.PlaneGeometry(w - 2 * T, d - 2 * T);
    const uv = fl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w - 2 * T) / 1.6, uv.getY(i) * (d - 2 * T) / 1.6);
    put(fl, M.tile, cx, y0 + 0.03, cz, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0xd8cbb4 });
    // props
    for (const [k, dx, dz, rot] of spec.props || []) {
      const px = cx + dx, pz = cz + dz;
      if (k === 'table') {
        solid(px, pz, 1.6, 0.9, 0.8, y0, 'wood');
        put(flatBox(1.6, 0.06, 0.9, 1.2), M.wood, px, y0 + 0.77, pz, 0, { grime: 0, tint: 0x9a7a52 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(flatBox(0.06, 0.74, 0.06, 0), M.wood, px + sx * 0.72, y0 + 0.37, pz + sz * 0.38, 0, { grime: 0, tint: 0x6a5238 });
        put(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), M.paint, px + 0.3, y0 + 0.86, pz, 0, { grime: 0, tint: 0xd8d2c0 });
      } else if (k === 'shelf') {
        // tall metal shelving unit with boxes: blocks the view straight through the house
        const along = !rot;
        const sw = along ? 1.8 : 0.5, sd = along ? 0.5 : 1.8;
        solid(px, pz, sw, sd, 2.0, y0, 'metal');
        for (const yy of [0.05, 0.7, 1.35, 1.95]) put(flatBox(sw, 0.04, sd, 0), M.metal, px, y0 + yy, pz, 0, { grime: 0, tint: 0x7a8088 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(flatBox(0.04, 2.0, 0.04, 0), M.dark, px + sx * (sw / 2 - 0.02), y0 + 1.0, pz + sz * (sd / 2 - 0.02), 0, { grime: 0 });
        for (const yy of [0.07, 0.72, 1.37]) for (let i = 0; i < 3; i++) {
          const o = (i - 1) * (along ? 0.55 : 0) , q = (i - 1) * (along ? 0 : 0.55);
          put(flatBox(along ? 0.45 : 0.4, 0.42 + rnd() * 0.15, along ? 0.4 : 0.45, 0), M.paint, px + o, y0 + yy + 0.25, pz + q, 0, { grime: 0.1, tint: [0xb8a27a, 0x8a7458, 0x4d5536, 0xd8d0b8][Math.floor(rnd() * 4)] });
        }
      } else if (k === 'crates') {
        solid(px, pz, 1.2, 1.2, 1.2, y0, 'wood');
        put(flatBox(1.2, 1.2, 1.2, 1.2), M.wood, px, y0 + 0.6, pz, rnd() * 0.2, { grime: 0.2, tint: 0xcfb08a, base: y0 });
        put(flatBox(0.8, 0.5, 0.6, 0), M.paint, px + 0.1, y0 + 1.45, pz, 0.3, { grime: 0.1, tint: 0x4d5536 });
      }
    }
    // hanging bulb (and a real light if asked)
    put(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4), M.dark, cx, y0 + h - 0.3, cz, 0, { grime: 0, cast: false });
    put(new THREE.SphereGeometry(0.06, 10, 8), M.bulb, cx, y0 + h - 0.65, cz, 0, { grime: 0, cast: false });
    glows.push([cx, y0 + h - 0.65, cz, 0.45]);
    if (spec.light) { const L = new THREE.PointLight(0xffc68a, 5, 9, 1.6); L.position.set(cx, y0 + h - 0.8, cz); L.userData.mapLight = true; group.add(L); }
  };

  // sandbag: a pillowy bag that pinches at the ends, so rows nest into each other
  const bagGeo = (() => {
    const g = new RoundedBoxGeometry(0.6, 0.2, 0.36, 2, 0.09);
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
  const plasterTints = [0xf1e1c2, 0xe4cfac, 0xd8c09b, 0xece3d2, 0xdcbf94, 0xcfb894];
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
        const mat = rnd() < 0.35 ? M.brick : M.plaster;
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
      case 'hutwall':
        B(M.brick, w, h, d, cx, y0, cz, 0, { grime: 0.45 });
        B(M.concrete, w + 0.1, 0.12, d + 0.1, cx, h - 0.09, cz, 0, { grime: 0 });
        break;
      case 'roof':
        B(M.concrete, w, h, d, cx, y0, cz, 0, { grime: 0, tint: 0xcfc9bd });
        put(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 14), M.metal, cx + 1.8, y0 + h + 0.55, cz - 1.8, 0, { grime: 0, tint: 0x8a8f94 });
        break;
      case 'crate': {
        B(M.wood, w, h, d, cx, y0, cz, rnd() * 0.08 - 0.04, { grime: 0.25, base: y0, tint: 0xcfb08a });
        // frame battens
        const t = 0.08;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(M.wood, t, h, t, cx + sx * (w / 2 - t / 2 + 0.01), y0, cz + sz * (d / 2 - t / 2 + 0.01), 0, { grime: 0.2, base: y0, tint: 0x9a7a52 });
        B(M.dark, w + 0.02, 0.05, d + 0.02, cx, y0 + h * 0.5, cz, 0, { grime: 0, tint: 0x8a8a7a });
        break;
      }
      case 'pallet': {
        B(M.woodOld, w, 0.14, d, cx, 0, cz, 0, { grime: 0.2, tint: 0xd8c4a4 });
        // shrink-wrapped supply sacks
        const rows = Math.round(h / 0.4);
        for (let r = 0; r < rows; r++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          put(new THREE.CapsuleGeometry(0.22, w / 2 - 0.5, 3, 8), M.bag, cx + (i - 0.5) * w / 2, 0.36 + r * 0.38, cz + (j - 0.5) * d / 2 * 0.95, 0, { rz: Math.PI / 2, sx: 0.75, grime: 0.1, tint: r % 2 ? 0xd8cfb8 : 0xcabd9c });
        }
        break;
      }
      case 'jersey': {
        const shape = new THREE.Shape();
        shape.moveTo(-0.31, 0); shape.lineTo(0.31, 0); shape.lineTo(0.31, 0.08); shape.lineTo(0.18, 0.3); shape.lineTo(0.1, 1.07);
        shape.lineTo(-0.1, 1.07); shape.lineTo(-0.18, 0.3); shape.lineTo(-0.31, 0.08); shape.closePath();
        const n = Math.round(d / 2);
        for (let i = 0; i < n; i++) {
          const g = new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3 });
          g.translate(0, 0, -0.98);
          const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 3, uv.getY(k) / 3);
          put(g, M.concrete, cx, 0, z0 + (i + 0.5) * (d / n), (rnd() - 0.5) * 0.06, { grime: 0.35, tint: i % 2 ? 0xf0ece4 : 0xe0dbd0 });
        }
        break;
      }
      case 'sand': {
        const long = w > d ? w : d;
        const along = w > d;
        const pitch = 0.54, rows = Math.max(3, Math.round(h / 0.19));
        for (let r = 0; r < rows; r++) {
          const off = r % 2 ? pitch / 2 : 0;
          const n = Math.floor((long - off - 0.06) / pitch);
          const deep = r < rows - 1 ? [-0.17, 0.17] : [0]; // the top course sits on the middle
          for (let i = 0; i < n; i++) for (const side of deep) {
            const t = -long / 2 + off + 0.03 + (i + 0.5) * pitch;
            const bx = cx + (along ? t : side), bz = cz + (along ? side : t);
            bag(bx, 0.1 + r * 0.175, bz, along ? 0 : Math.PI / 2, (i + r) % 3 ? 0xd2c4a2 : 0xbfae88);
          }
        }
        break;
      }
      case 'container': {
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
        const n = Math.round(d / 1.0), along = d > w;
        for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) {
          const t = -d / 2 + (i + 0.5) * (d / n);
          put(worldBox(1.0, 1.72, 0.98, 1.75), M.hesco, cx, r * 1.75 + 0.86, cz + (along ? t : 0), 0, { grime: 0.3, tint: 0xe8dcc2 });
        }
        break;
      }
      case 'ammo':
        for (let i = 0; i < 4; i++) put(worldBox(0.9, 0.55, 0.45, 0), M.paint, cx + (i % 2 - 0.5) * 0.95, 0.28 + (i >> 1) * 0.56, cz + ((i * 7) % 3 - 1) * 0.3, 0, { grime: 0.2, tint: 0x4d5536 });
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
        // produce crates
        const fruit = [0xb34a22, 0xc89a2a, 0x6f8a2a, 0x9c2e2e];
        for (let i = 0; i < 4; i++) {
          B(M.wood, 0.5, 0.18, 0.4, cx - 0.85 + i * 0.57, 0.9, cz, 0, { grime: 0, tint: 0xc0a37a });
          for (let k = 0; k < 6; k++) put(new THREE.SphereGeometry(0.06, 6, 5), M.paint, cx - 1.0 + i * 0.57 + (k % 3) * 0.12, 1.1, cz - 0.08 + (k >> 1 & 1) * 0.14, 0, { grime: 0, tint: fruit[(i + extra) % 4] });
        }
        // awning on poles
        for (const sx of [-1, 1]) put(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), M.dark, cx + sx * (w / 2 + 0.1), 1.25, cz + 0.6, 0, { grime: 0 });
        put(new THREE.PlaneGeometry(w + 0.6, 1.9, 8, 4), M.cloth, cx, 2.35, cz - 0.15, 0, { rx: -Math.PI / 2 + 0.25, grime: 0, tint: extra ? 0x2f5a6a : 0x8a2f2a });
        break;
      }
      case 'palm': buildPalm(cx, cz, rnd); break;
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
    box(0.04, 0.16, 0.9, 2.25, 0.62, 0, M.dark, 0x1a1a1a);
    if (!burnt) {
      for (const lz of [-0.68, 0.68]) {
        box(0.05, 0.12, 0.32, 2.22, 0.66, lz, M.lamp, 0xffffff);
        box(0.05, 0.12, 0.3, -2.2, 0.76, lz, M.paint, 0xb02020);
      }
      for (const lz of [-1, 1]) box(0.14, 0.08, 0.14, 0.75, 1.0, lz * (W / 2 + 0.06), bodyMat, paintTint);
      box(0.02, 0.12, 0.4, 2.31, 0.42, 0, M.paint, 0xe8e2d0);
    }
    // wheels: tyre + rim
    for (const lx of [-1.4, 1.4]) for (const lz of [-0.8, 0.8]) {
      const [x, y, z] = P(lx, 0.33, lz);
      if (burnt && rnd() < 0.5) { put(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), M.dark, x, 0.2, z, ry, { rx: Math.PI / 2, grime: 0 }); continue; }
      put(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18), M.rubber, x, y, z, ry, { rx: Math.PI / 2, grime: 0 });
      const [rx2, , rz2] = P(lx, 0, lz + Math.sign(lz) * 0.12);
      put(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), M.metal, rx2, y, rz2, ry, { rx: Math.PI / 2, grime: 0, tint: 0x9a9a9a });
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
    if (!NO_SOLID.has(kind)) solid(cx, cz, w, d, h, y0, SURFACE[kind] || 'concrete');
    decorate(cx, cz, w, d, h, y0, kind, extra ?? 0, team);
  };
  for (const it of LAYOUT.center) add(...it.slice(0, 7), it[7], 0);
  for (const [cx, cz, w, d, h, y0, kind, extra] of LAYOUT.half) {
    add(cx, cz, w, d, h, y0, kind, extra, 1);
    const mx = kind === 'house' ? mirrorSpec(extra) : kind === 'lights' ? [-extra[0], -extra[1], -extra[2], -extra[3]] : extra;
    add(-cx, -cz, w, d, h, y0, kind, mx, 0);
  }

  // ---------- perimeter buildings ----------
  const shutterTints = [0x9c9c94, 0x6e7f86, 0x8a7a62, 0x7d8a6a];
  const signTints = [0x2f5a6a, 0x8a2f2a, 0xb08a3a, 0x3d5a3a, 0xd9d2c0];
  const facade = (ox, oz, ax, az, nx, nz, L, depth) => {
    // ox,oz: start corner on the facade line; (ax,az) along; (nx,nz) normal pointing into the map
    let s = 0;
    while (s < L - 0.5) {
      const bw = Math.min(L - s, 6 + Math.floor(rnd() * 5));
      const floors = 2 + Math.floor(rnd() * 3);
      const H = floors * 3.2 + 0.6;
      const tint = plasterTints[Math.floor(rnd() * plasterTints.length)];
      const mx = ox + ax * (s + bw / 2), mz = oz + az * (s + bw / 2);
      const ry = Math.atan2(nx, nz);
      const bx = mx - nx * depth / 2, bz = mz - nz * depth / 2;
      const mat = rnd() < 0.2 ? M.brick : M.plaster;
      put(worldBox(bw, H, depth, scaleOf(mat)), mat, bx, H / 2, bz, ry, { tint: mat === M.brick ? 0xffffff : tint, grime: 0.55 });
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
        if (rnd() < 0.7) {
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
  facade(-43, 30, 1, 0, 0, -1, 86, 8);    // north row faces -z
  facade(43, -30, -1, 0, 0, 1, 86, 8);    // south row faces +z
  facade(42, 31, 0, -1, -1, 0, 62, 8);    // east row faces -x
  facade(-42, -31, 0, 1, 1, 0, 62, 8);    // west row faces +x

  // street lamps and power poles inside the map edge
  for (const sz of [-1, 1]) for (let x = -24; x <= 24; x += 16) {
    const z = sz * 28.2;
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
  // glow sprites for every bulb (bloom does the rest)
  if (glows.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(glows.flatMap(q => [q[0], q[1], q[2]]), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, size: 0.9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.25, 0.85) }));
    pts.renderOrder = 3;
    group.add(pts);
  }

  // base flags
  for (const team of [0, 1]) {
    const sx = team === 1 ? 1 : -1;
    put(new THREE.CylinderGeometry(0.05, 0.06, 7, 8), M.dark, sx * 40.5, 3.5, 0, 0, { grime: 0.2 });
    const g = new THREE.PlaneGeometry(1.8, 1.1, 10, 4);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 2.5) * 0.12);
    g.computeVertexNormals();
    put(g, M.cloth, sx * 40.5 - sx * 0.95, 6.2, 0, Math.PI / 2, { grime: 0, tint: team ? 0x5a2622 : 0x3d4f63 });
  }

  // distant city skyline beyond the perimeter (hazed by fog)
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const r = 70 + rnd() * 70;
    const h = 8 + rnd() * 26;
    const w = 8 + rnd() * 14;
    put(worldBox(w, h, w, 3), M.plaster, Math.cos(a) * r, h / 2, Math.sin(a) * r * 0.85, rnd() * 3, { tint: plasterTints[i % plasterTints.length], grime: 0.3, cast: false });
  }

  batch.build(group);
  group.add(buildMountain());

  const world = { id: LAYOUT.id, name: LAYOUT.name, pickupSpots: LAYOUT.pickups, group, spawns: [[], []], materials: M, textures: tex };
  for (const [x, z] of LAYOUT.spawns) {
    world.spawns[1].push(new THREE.Vector3(x, 0, z));
    world.spawns[0].push(new THREE.Vector3(-x, 0, -z));
  }
  world.spawnYaw = [-Math.PI / 2, Math.PI / 2];
  world.nav = new NavGrid(physics, MAP, 1, 0.45);
  return world;
}

// Mount Rainier on the horizon: a broad stratovolcano with glaciers, rock ribs and forested foothills,
// far beyond the fog (it uses its own haze so it stays visible), lined up with the lanes to the east so
// it looms over the rooftops. The low sun behind the player lights it with alpenglow.
function buildMountain() {
  const rnd = seeded(4392);
  const R = 1500, H = 640, segR = 110, segA = 180;
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
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5, 0.46, 0.55), 0.22 + 0.6 * hz);`);
  };
  const m = new THREE.Mesh(g, mat);
  m.position.set(1750, -20, 160);
  m.frustumCulled = false;
  m.renderOrder = -2;
  return m;
}

// Top-down render of the map for the minimap (needs the renderer, so it runs after the scene is built)
export function renderMinimap(renderer, scene) {
  const W = 504, H = 360;
  const cam = new THREE.OrthographicCamera(MAP.minX, MAP.maxX, -MAP.minZ, -MAP.maxZ, 1, 200);
  cam.position.set(0, 100, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
  const fog = scene.fog;
  scene.fog = null;
  const prevShadow = renderer.shadowMap.enabled;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  scene.fog = fog;
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
