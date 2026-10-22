// Prop models (CC-BY, credited in Options > About). assets.js loads them before any map is built;
// world.js and game.js use them when present and fall back to their procedural versions otherwise.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const PROPS = {};

// Bake a loaded scene into a list of { geo, mat } parts in its own world space (node transforms applied),
// and record its bounds.
export function setProp(name, scene) {
  scene.updateMatrixWorld(true);
  const parts = [];
  const box = new THREE.Box3();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox();
    box.union(geo.boundingBox);
    if (o.material.map) o.material.map.anisotropy = 8;
    // the maps batch with only the first uv set: drop any map that reads another one
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'specularIntensityMap', 'specularColorMap']) {
      if (o.material[k] && o.material[k].channel) {
        o.material[k] = null; o.material.needsUpdate = true;
        if (k === 'emissiveMap') o.material.emissive.setRGB(0, 0, 0);   // the factor alone would light it up white
      }
    }
    parts.push({ name: o.name, geo: LIFT.has(name) ? liftCoplanar(geo) : geo, mat: o.material });
  });
  PROPS[name] = { parts, box };
}

// models with pieces lying flat on a bigger surface in the same plane (notes pinned flush on a board): they
// flicker against it, so liftCoplanar raises them a few millimetres off it
const LIFT = new Set(['corkboard']);
function liftCoplanar(geo, lift = 0.004) {
  const g = mergeVertices(geo, 1e-4), pos = g.attributes.position, idx = g.index.array;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3();
  // islands: triangles joined by shared vertices
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); parent[find(idx[t + 1])] = a; parent[find(idx[t + 2])] = a; }
  // per plane (normal and offset), each island's area there
  const planes = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    A.fromBufferAttribute(pos, idx[t]); B.fromBufferAttribute(pos, idx[t + 1]); C.fromBufferAttribute(pos, idx[t + 2]);
    N.crossVectors(E.subVectors(B, A), new THREE.Vector3().subVectors(C, A));
    const area = N.length() / 2;
    if (area < 1e-9) continue;
    N.normalize();
    const key = `${N.x.toFixed(2)},${N.y.toFixed(2)},${N.z.toFixed(2)},${(N.dot(A) * 500).toFixed(0)}`;
    const pl = planes.get(key) || { n: N.clone(), islands: new Map() };
    const isl = find(idx[t]);
    pl.islands.set(isl, (pl.islands.get(isl) || 0) + area);
    planes.set(key, pl);
  }
  // every island but the biggest in a shared plane moves out along the plane's normal, smaller ones further
  // (notes overlapping each other)
  const moved = new Set();
  for (const pl of planes.values()) {
    if (pl.islands.size < 2) continue;
    const rank = new Map([...pl.islands].sort((a, b) => b[1] - a[1]).map(([isl], k) => [isl, k]));
    for (let v = 0; v < pos.count; v++) {
      const k = rank.get(find(v));
      if (!k || moved.has(v)) continue;
      moved.add(v);
      const d = lift + (k - 1) * 0.0015;
      pos.setXYZ(v, pos.getX(v) + pl.n.x * d, pos.getY(v) + pl.n.y * d, pos.getZ(v) + pl.n.z * d);
    }
  }
  g.computeBoundingBox();
  return g;
}

// Shipping containers: the pack holds four 20 ft boxes side by side; split them into variants, each
// centred on x/z with its base at y = 0 and its long side along z.
export function containerVariants() {
  const P = PROPS.containers;
  if (!P) return null;
  if (P.variants) return P.variants;
  P.variants = P.parts.map(({ geo, mat }) => {
    const g = geo.clone();
    const b = g.boundingBox, c = b.getCenter(new THREE.Vector3());
    g.translate(-c.x, -b.min.y, -c.z);
    const size = b.getSize(new THREE.Vector3());
    return { geo: g, mat, size };
  });
  return P.variants;
}

// Downtown buildings set: split into individual buildings by name, each centred on x/z with its base at y = 0
export function buildingVariants() {
  const P = PROPS.downtown;
  if (!P) return null;
  if (P.variants) return P.variants;
  const groups = new Map();
  for (const pt of P.parts) {
    const m = pt.name.match(/^(Downtown_[A-Za-z]+_\d+(?:_B)?)/);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push(pt);
  }
  P.variants = [...groups.values()].map(list => {
    const box = new THREE.Box3();
    for (const { geo } of list) { geo.computeBoundingBox(); box.union(geo.boundingBox); }
    const c = box.getCenter(new THREE.Vector3());
    const parts = list.map(({ geo, mat }) => { const g = geo.clone(); g.translate(-c.x, -box.min.y, -c.z); return { geo: g, mat }; });
    return { parts, size: box.getSize(new THREE.Vector3()) };
  });
  return P.variants;
}

// One piece of a prop pack: the parts whose names match `match` (a RegExp, or null for all of them),
// rotated by `ry` about y, scaled by `k`, centred on x/z with its base at y = 0. Cached per arguments.
// Returns { parts: [{ geo, mat }], size } or null when the pack didn't load.
export function propPiece(name, match = null, k = 1, ry = 0) {
  const P = PROPS[name];
  if (!P) return null;
  const key = `${match}|${k}|${ry}`;
  P.pieces = P.pieces || new Map();
  if (P.pieces.has(key)) return P.pieces.get(key);
  const list = P.parts.filter(pt => !match || match.test(pt.name));
  let piece = null;
  if (list.length) {
    const geos = list.map(({ geo }) => { const g = geo.clone(); if (ry) g.rotateY(ry); g.scale(k, k, k); return g; });
    const box = new THREE.Box3();
    for (const g of geos) { g.computeBoundingBox(); box.union(g.boundingBox); }
    const c = box.getCenter(new THREE.Vector3());
    for (const g of geos) { g.translate(-c.x, -box.min.y, -c.z); g.computeBoundingBox(); }
    piece = { parts: geos.map((geo, i) => ({ geo, mat: list[i].mat })), size: box.getSize(new THREE.Vector3()) };
  }
  P.pieces.set(key, piece);
  return piece;
}

// The same, scaled so its size along `axis` ('x', 'y' or 'z', after the turn) is `len` metres
export function propFit(name, match, axis, len, ry = 0) {
  const p = propPiece(name, match, 1, ry);
  return p && propPiece(name, match, len / p.size[axis], ry);
}
