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
const TARSA_CENTER = [
  [0, 0, 8, 8, 3, 0, 'building'],
];
const TARSA_HALF = [
  [3.75, 2, 0.5, 4, 1.0, 3, 'parapet'],
  [0, 3.75, 8, 0.5, 1.0, 3, 'parapet'],
  [14, 12, 12, 1, 3.2, 0, 'wall', 0],
  [14, -12, 12, 1, 3.2, 0, 'wall', 1],
  [8, 8, 1.6, 1.6, 1.6, 0, 'crate'],
  [9.8, 8, 1.6, 1.6, 1.6, 0, 'crate'],
  [8.9, 8, 1.4, 1.4, 1.4, 1.6, 'crate'],
  [6, -10, 2, 2, 1.2, 0, 'pallet'],
  [12, -4, 1.5, 1.5, 1.5, 0, 'crate'],
  [26, 6, 1.5, 1.5, 1.5, 0, 'crate'],
  [12, 22, 2, 2, 2, 0, 'pallet'],
  [20, 0, 0.62, 6, 1.07, 0, 'jersey'],
  [14, 4, 3, 0.8, 1.1, 0, 'sand'],
  [24, -5, 0.8, 3, 1.1, 0, 'sand'],
  [22, 22, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [8, -22, 7, 2.6, 2.6, 0, 'container', 0x3e5d74],
  [4, 16, 1, 1, 4, 0, 'column'],
  [4, -16, 1, 1, 4, 0, 'column'],
  // hut
  [18, -26.8, 6, 0.4, 3, 0, 'hutwall'],
  [15.2, -24, 0.4, 6, 3, 0, 'hutwall'],
  [20.8, -24, 0.4, 6, 3, 0, 'hutwall'],
  [16, -21.2, 2, 0.4, 3, 0, 'hutwall'],
  [20, -21.2, 2, 0.4, 3, 0, 'hutwall'],
  [18, -24, 6.4, 6.4, 0.3, 3, 'roof'],
  // forward base (red side; mirrored for blue)
  [30, 7, 1, 8, 3.5, 0, 'hesco'],
  [30, -7, 1, 8, 3.5, 0, 'hesco'],
  [36, 0, 2, 2, 1.2, 0, 'ammo'],
  // vehicles, barrels, market stalls, palms
  [26, 16, 2.0, 4.4, 1.45, 0, 'car', 0],
  [0, 22, 4.4, 2.0, 1.45, 0, 'car', 1],
  [19.4, 19.5, 0.62, 0.62, 0.9, 0, 'barrel'],
  [20.2, 19.3, 0.62, 0.62, 0.9, 0, 'barrel'],
  [2, 27.6, 2.4, 0.9, 0.9, 0, 'stall', 0],
  [26, 27.6, 2.4, 0.9, 0.9, 0, 'stall', 1],
  [40, 27.4, 0.5, 0.5, 6, 0, 'palm'],
  // perimeter
  [0, 30.5, 86, 1, 8, 0, 'boundary'],
  [42.5, 0, 1, 62, 8, 0, 'boundary'],
];
for (let k = 1; k <= 6; k++) TARSA_HALF.push([4 + (6.5 - k) * 0.9, -2.5, 0.9, 3, k * 0.5, 0, 'stairs', k]);

const TARSA_SPAWNS = [[38, -24], [38, -16], [38, -8], [38, 8], [38, 16], [38, 22], [34, -14], [34, 14]];

const TARSA_PICKUPS = [
  { type: 'health', pos: [0, 3, 0] },
  { type: 'health', pos: [18, 0, -24] },
  { type: 'health', pos: [-18, 0, 24] },
  { type: 'ammo', pos: [10, 0, 18] },
  { type: 'ammo', pos: [-10, 0, -18] },
  { type: 'ammo', pos: [24, 0, 0] },
  { type: 'ammo', pos: [-24, 0, 0] },
];


// Map "Shuran Yard": classic three-lane layout. North lane (market street), mid lane (open yard with a
// container in the middle), south lane (container stacks and long sightlines). Lanes are separated by
// building blocks and container walls with one connector gap per divider half.
const SHURAN_CENTER = [
  [0, 9, 6, 6, 6, 0, 'building'],
  [0, -9, 6, 6, 6, 0, 'building'],
  [0, 0, 1.6, 1.6, 1.6, 0, 'crate'],
  [0.15, 0.1, 1.4, 1.4, 1.4, 1.6, 'crate'],
];
const SHURAN_HALF = [
  // north divider (z 6..12): block, connector gap at x 12..16, container wall
  [7.5, 9, 9, 6, 6, 0, 'building'],
  [19.5, 7.7, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [19.5, 10.3, 7, 2.6, 2.6, 0, 'container', 0x3e5d74],
  [19.5, 9, 7, 2.6, 2.6, 2.6, 'container', 0x6b7a3a],
  [26.5, 7.7, 7, 2.6, 2.6, 0, 'container', 0x6e7f86],
  [26.5, 10.3, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  // south divider (z -12..-6): container wall, connector gap at x 10..14, block
  [6.5, -7.7, 7, 2.6, 2.6, 0, 'container', 0x3e5d74],
  [6.5, -10.3, 7, 2.6, 2.6, 0, 'container', 0x7a6a3a],
  [6.5, -9, 7, 2.6, 2.6, 2.6, 'container', 0x8a3d2c],
  [19, -9, 10, 6, 5, 0, 'building'],
  [26.5, -9, 0.8, 5, 1.1, 0, 'sand'],
  // mid lane (z -6..6)
  [6, 3.6, 2, 2, 1.2, 0, 'pallet'],
  [9.5, -2.2, 0.62, 4, 1.07, 0, 'jersey'],
  [14, 2.4, 3, 0.8, 1.1, 0, 'sand'],
  [17.5, -3.3, 7, 2.6, 2.6, 0, 'container', 0x4d6b54],
  [23, 2.6, 1.5, 1.5, 1.5, 0, 'crate'],
  [28, -0.5, 0.8, 3, 1.1, 0, 'sand'],
  // north lane (z 12..27): market street
  [6, 18, 4.4, 2.0, 1.45, 0, 'car', 0],
  [3.5, 23.5, 4, 0.6, 1.2, 0, 'wall', 3],
  [12, 22.5, 1, 1, 4, 0, 'column'],
  [15, 15.4, 3, 0.8, 1.1, 0, 'sand'],
  [20, 21, 2, 2, 1.2, 0, 'pallet'],
  [25, 15.2, 1.5, 1.5, 1.5, 0, 'crate'],
  [9.5, 27.4, 2.4, 0.9, 0.9, 0, 'stall', 0],
  [22, 27.4, 2.4, 0.9, 0.9, 0, 'stall', 1],
  [17.4, 25.6, 0.62, 0.62, 0.9, 0, 'barrel'],
  [18.2, 25.3, 0.62, 0.62, 0.9, 0, 'barrel', 1],
  // south lane (z -27..-12): container yard
  [8, -20, 7, 2.6, 2.6, 0, 'container', 0x8a3d2c],
  [8, -20, 7, 2.6, 2.6, 2.6, 'container', 0x3e5d74],
  [17, -15.6, 0.62, 4, 1.07, 0, 'jersey'],
  [21, -23, 7, 2.6, 2.6, 0, 'container', 0x6e7f86],
  [26, -16.5, 1.6, 1.6, 1.6, 0, 'crate'],
  [27.8, -16.5, 1.6, 1.6, 1.6, 0, 'crate'],
  [13, -26, 2, 2, 2, 0, 'pallet'],
  [3, -24, 0.8, 3, 1.1, 0, 'sand'],
  // spawn (x 31..41)
  [31.5, 19, 1, 4, 3.5, 0, 'hesco'],
  [31.5, 0, 1, 4, 3.5, 0, 'hesco'],
  [31.5, -19, 1, 4, 3.5, 0, 'hesco'],
  [37, 9, 2, 2, 1.2, 0, 'ammo'],
  [40, 27.4, 0.5, 0.5, 6, 0, 'palm'],
  [40, -27.4, 0.5, 0.5, 6, 0, 'palm'],
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
  { type: 'ammo', pos: [14, 0, 9] },
  { type: 'ammo', pos: [-14, 0, -9] },
  { type: 'ammo', pos: [12, 0, -9] },
  { type: 'ammo', pos: [-12, 0, 9] },
];

export const MAPS = {
  tarsa: { id: 'tarsa', name: 'Tarsa Market', blurb: 'Open district with a central building and rooftop', center: TARSA_CENTER, half: TARSA_HALF, spawns: TARSA_SPAWNS, pickups: TARSA_PICKUPS },
  shuran: { id: 'shuran', name: 'Shuran Yard', blurb: 'Three lanes: market street, open yard, container stacks', center: SHURAN_CENTER, half: SHURAN_HALF, spawns: SHURAN_SPAWNS, pickups: SHURAN_PICKUPS },
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
  const r = radius ?? Math.min(0.05, Math.min(w, h, d) * 0.14);
  const small = Math.max(w, h, d) < 0.4;
  const g = r > 0.002 ? new RoundedBoxGeometry(w, h, d, small ? 1 : 2, r) : new THREE.BoxGeometry(w, h, d);
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
    glass: std({ color: 0x1c2229, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6 }),
    cloth: pbr(tex.fabric, { side: THREE.DoubleSide }),
    rubber: std({ color: 0x161616, roughness: 0.92 }),
    paint: std({ roughness: 0.42, metalness: 0.35 }),
    leaf: std({ color: 0x5b6a2e, roughness: 0.8, side: THREE.DoubleSide }),
    rust: std({ color: 0x5c3a26, roughness: 0.8, metalness: 0.4 }),
    line: std({ color: 0xd8d0b8, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 2 }),
  };
  M.bag = pbr(tex.fabric);
  M.bag.normalScale = new THREE.Vector2(1.5, 1.5);
  const S = { plaster: 3, concrete: 3, brick: 2, asphalt: 7, dirt: 9, tile: 2.2, metal: 2.4, wood: 1.2, sand: 1.2, hesco: 1.75, cloth: 1 };
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

  // ---------- dressing per collision kind ----------
  const plasterTints = [0xf1e1c2, 0xe4cfac, 0xd8c09b, 0xece3d2, 0xdcbf94, 0xcfb894];
  const decorate = (cx, cz, w, d, h, y0, kind, extra, team) => {
    const x0 = cx - w / 2, z0 = cz - d / 2;
    switch (kind) {
      case 'building': {
        B(M.concrete, w, h, d, cx, y0, cz, 0, { grime: 0.45 });
        B(M.concrete, w + 0.3, 0.2, d + 0.3, cx, h - 0.2, cz, 0, { grime: 0, tint: 0xd8d4cc });
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
        B(M.concrete, w + 0.1, 0.12, d + 0.1, cx, h - 0.12, cz, 0, { grime: 0 });
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
        B(M.wood, w, 0.14, d, cx, 0, cz, 0, { grime: 0.2, tint: 0xb59a74 });
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
        const bagL = 0.58, rows = 4;
        for (let r = 0; r < rows; r++) {
          const off = r % 2 ? bagL / 2 : 0;
          const n = Math.floor((long - off) / bagL);
          for (let i = 0; i < n; i++) for (const side of [-0.18, 0.18]) {
            const t = -long / 2 + off + (i + 0.5) * bagL;
            const bx = cx + (along ? t : side), bz = cz + (along ? side : t);
            put(new THREE.CapsuleGeometry(0.15, 0.3, 3, 8), M.bag, bx, 0.14 + r * 0.26, bz, along ? Math.PI / 2 : 0, { rx: Math.PI / 2, sz: 0.62, sy: 1.1, grime: 0.15, tint: (i + r) % 3 ? 0xd2c4a2 : 0xbfae88 });
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
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (lx, ly, lz) => [cx + lx * c + lz * s, ly, cz - lx * s + lz * c];
    const tint = variant ? 0x6f6a5c : 0x8f8b80;
    const burnt = variant === 1;
    const bodyMat = burnt ? M.rust : M.paint;
    const box = (w, h, d, lx, ly, lz, mat = bodyMat, t = tint, rx = 0) => { const [x, y, z] = P(lx, ly, lz); put(worldBox(w, h, d, scaleOf(mat)), mat, x, y, z, ry, { tint: t, grime: 0.25, rx }); };
    // car is modeled along local x (length 4.4)
    box(4.3, 0.62, 1.86, 0, 0.58, 0);
    box(1.0, 0.18, 1.8, 1.65, 0.96, 0, bodyMat, tint, 0);
    box(2.1, 0.55, 1.66, -0.2, 1.17, 0);
    box(0.06, 0.48, 1.5, 0.9, 1.15, 0, M.glass, 0xffffff);
    box(0.06, 0.44, 1.5, -1.3, 1.15, 0, M.glass, 0xffffff);
    box(1.8, 0.4, 0.04, -0.2, 1.17, 0.84, M.glass, 0xffffff);
    box(1.8, 0.4, 0.04, -0.2, 1.17, -0.84, M.glass, 0xffffff);
    box(0.12, 0.22, 1.9, 2.18, 0.42, 0, M.dark, 0x555555);
    box(0.12, 0.22, 1.9, -2.18, 0.42, 0, M.dark, 0x555555);
    for (const lx of [-1.35, 1.35]) for (const lz of [-0.86, 0.86]) {
      const [x, y, z] = P(lx, 0.33, lz);
      put(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14), M.rubber, x, y, z, ry, { rx: Math.PI / 2, grime: 0 });
    }
    for (const lz of [-0.6, 0.6]) box(0.04, 0.12, 0.3, 2.16, 0.7, lz, M.glass, 0xbfbfbf);
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
    solid(cx, cz, w, d, h, y0, SURFACE[kind] || 'concrete');
    decorate(cx, cz, w, d, h, y0, kind, extra ?? 0, team);
  };
  for (const it of LAYOUT.center) add(...it.slice(0, 7), it[7], 0);
  for (const [cx, cz, w, d, h, y0, kind, extra] of LAYOUT.half) {
    add(cx, cz, w, d, h, y0, kind, extra, 1);
    add(-cx, -cz, w, d, h, y0, kind, extra, 0);
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
      put(worldBox(bw, 0.6, 0.25, 3), M.concrete, mx - nx * 0.12, H + 0.3, mz - nz * 0.12, ry, { tint: 0xd8d2c4, grime: 0.1, base: H });
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
          put(worldBox(1.3, 1.6, 0.1, 3), M.concrete, px + nx * 0.05, y, pz + nz * 0.05, ry, { tint: 0xe9e3d6, grime: 0.05, base: y });
          const shut = rnd();
          if (shut < 0.25) put(worldBox(1.1, 1.4, 0.06, 1.2), M.wood, px + nx * 0.09, y, pz + nz * 0.09, ry, { tint: 0x7a6a50, grime: 0, base: y });
          else put(worldBox(1.1, 1.4, 0.06, 0), M.glass, px + nx * 0.08, y, pz + nz * 0.08, ry, { grime: 0, tint: shut < 0.35 ? 0x050505 : 0xffffff });
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
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.45), M.lamp);
    lamp.position.set(x, 5.82, z - sz * 1.1);
    group.add(lamp);
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

  const world = { id: LAYOUT.id, name: LAYOUT.name, pickupSpots: LAYOUT.pickups, group, spawns: [[], []], materials: M, textures: tex };
  for (const [x, z] of LAYOUT.spawns) {
    world.spawns[1].push(new THREE.Vector3(x, 0, z));
    world.spawns[0].push(new THREE.Vector3(-x, 0, -z));
  }
  world.spawnYaw = [-Math.PI / 2, Math.PI / 2];
  world.nav = new NavGrid(physics, MAP, 1, 0.45);
  return world;
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
