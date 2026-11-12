// Axis-aligned box collision, character movement and raycasting
import * as THREE from 'three';
import { PLAYER } from './config.js';

const STEP_DOWN = 0.36; // largest drop that counts as a stair step when walking down

export class Box {
  constructor(minx, miny, minz, maxx, maxy, maxz) {
    this.minx = minx; this.miny = miny; this.minz = minz;
    this.maxx = maxx; this.maxy = maxy; this.maxz = maxz;
    // the optional tags maps and props add later, declared up front so every box has one shape: the collision
    // loops then read the bounds through fast, allocation-free loads instead of a generic lookup per box
    this.surface = undefined; this.pass = undefined; this.dynamic = undefined; this.navBlock = undefined;
    this.navIgnore = undefined; this.breakable = undefined; this._q = 0;
  }
}

const _d = new THREE.Vector3();
// scratch numbers live in typed arrays: a module-level `let` holding a double is re-boxed on every write,
// and these are written thousands of times a frame

// Ray vs AABB (slab method). Returns entry distance or Infinity. Used for one-off tests (bullets vs heads).
export function rayBox(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz, maxT) {
  _O[0] = ox; _O[1] = oy; _O[2] = oz; _O[3] = dx; _O[4] = dy; _O[5] = dz;
  _T.minx = minx; _T.miny = miny; _T.minz = minz; _T.maxx = maxx; _T.maxy = maxy; _T.maxz = maxz;
  _O[6] = maxT;
  return slab(_T) ? _S[2] : Infinity;
}

// The hot version. The ray sits in _O (origin xyz, direction xyz, max distance); it writes the entry distance to _S[2] and the
// hit normal's axis/sign to _S[0]/_S[1], and returns whether it hit within the max distance. Everything goes through typed
// arrays and the box object, never number arguments or a number return: V8 puts a double that crosses a
// call boundary in a fresh heap object, and this runs thousands of times a frame (that garbage was the hitching).
const _O = new Float64Array(7), _S = new Float64Array(3), _T = new Box(0, 0, 0, 0, 0, 0);
function slab(b) {
  let tmin = 0, tmax = _O[6], ax = -1, sg = 0;
  const ox = _O[0], oy = _O[1], oz = _O[2], dx = _O[3], dy = _O[4], dz = _O[5];
  if (Math.abs(dx) < 1e-9) { if (ox < b.minx || ox > b.maxx) return false; }
  else {
    const inv = 1 / dx; let t1 = (b.minx - ox) * inv, t2 = (b.maxx - ox) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 0; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < b.miny || oy > b.maxy) return false; }
  else {
    const inv = 1 / dy; let t1 = (b.miny - oy) * inv, t2 = (b.maxy - oy) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 1; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < b.minz || oz > b.maxz) return false; }
  else {
    const inv = 1 / dz; let t1 = (b.minz - oz) * inv, t2 = (b.maxz - oz) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 2; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  _S[0] = ax; _S[1] = sg; _S[2] = tmin;
  return true;
}

// Broad phase: a grid over x/z (4 m cells) listing the boxes in each cell, so a query only tests the boxes
// near it instead of every box on the map (Pioneer Square has ~1800). Huge boxes (the ground slabs) and moving
// ones (box.dynamic: the station's trains) sit on a short list every query checks. Doors only change a box's
// height, so the grid holds; it rebuilds itself whenever the box list changes.
const CELL = 4, BIG = 64;
const ckey = (i, k) => (i + 4096) * 8192 + (k + 4096);
let _stamp = 1;
// The queries below run many times a frame for every character, so they make no garbage: no closures or
// result arrays per call (the browser's garbage collector pausing to clear them is felt as a hitch).
const _near = [];
let _rBox = null, _bHit = false;
const _R = new Float64Array(3); // 0 best distance, 1 hit axis, 2 hit sign
// visitors for walk(): they shrink _R[0] (the distance to stop at) instead of returning it, for the same reason
function rayVisit(b) {
  if (b.pass) return;   // see-through barriers (railings, benches, shop glass): they stop you, not bullets or sight
  _O[6] = _R[0];
  if (slab(b) && _S[2] < _R[0]) { _R[0] = _S[2]; _rBox = b; _R[1] = _S[0]; _R[2] = _S[1]; }
}
function blockVisit(b) {
  if (_bHit || b.pass) return;
  _O[6] = _R[0];
  if (slab(b) && _S[2] < _R[0]) { _bHit = true; _R[0] = -1; }
}

export class Physics {
  constructor() {
    this.boxes = [];
    this.grid = null; this.gridN = -1; this.gridLast = null;
  }

  addBox(b) { this.boxes.push(b); return b; }

  index() {
    const B = this.boxes;
    if (this.grid && this.gridN === B.length && this.gridLast === B[B.length - 1]) return this.grid;
    const cells = new Map(), always = [];
    for (const b of B) {
      const i0 = Math.floor(b.minx / CELL), i1 = Math.floor(b.maxx / CELL), k0 = Math.floor(b.minz / CELL), k1 = Math.floor(b.maxz / CELL);
      if (b.dynamic || (i1 - i0 + 1) * (k1 - k0 + 1) > BIG) { always.push(b); continue; }
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        const key = ckey(i, k);
        let c = cells.get(key); if (!c) cells.set(key, c = []);
        c.push(b);
      }
    }
    this.grid = { cells, always };
    this.gridN = B.length; this.gridLast = B[B.length - 1];
    return this.grid;
  }

  // every box a ray from o along unit d might hit within _R[0] (set by the caller), nearest cells first: calls
  // visit(box) once per box; visit lowers _R[0] to the best hit so far, so cells beyond it are skipped
  walk(o, d, visit) {
    const G = this.index(), st = ++_stamp, maxT = _R[0];
    const A = G.always;
    for (let j = 0; j < A.length; j++) visit(A[j]);
    // 2D DDA over the cells the ray crosses (t in the ray's own 3D units)
    let i = Math.floor(o.x / CELL), k = Math.floor(o.z / CELL);
    const si = d.x > 0 ? 1 : -1, sk = d.z > 0 ? 1 : -1;
    const di = Math.abs(d.x) > 1e-9 ? CELL / Math.abs(d.x) : Infinity, dk = Math.abs(d.z) > 1e-9 ? CELL / Math.abs(d.z) : Infinity;
    let ti = Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? (i + 1) * CELL - o.x : o.x - i * CELL) / Math.abs(d.x)) : Infinity;
    let tk = Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? (k + 1) * CELL - o.z : o.z - k * CELL) / Math.abs(d.z)) : Infinity;
    let t0 = 0;
    for (let n = 0; n < 4096 && t0 <= _R[0]; n++) {
      const c = G.cells.get(ckey(i, k));
      if (c) for (let j = 0; j < c.length; j++) { const b = c[j]; if (b._q === st) continue; b._q = st; visit(b); }
      if (ti < tk) { t0 = ti; ti += di; i += si; } else { t0 = tk; tk += dk; k += sk; }
      if (t0 > maxT) break;
    }
  }

  // Returns {t, point, normal, box} or null
  raycast(o, d, maxDist) {
    _O[0] = o.x; _O[1] = o.y; _O[2] = o.z; _O[3] = d.x; _O[4] = d.y; _O[5] = d.z; _R[0] = maxDist; _rBox = null; _R[1] = -1; _R[2] = 0;
    this.walk(o, d, rayVisit);
    const best = _R[0], bestBox = _rBox, axis = _R[1], sign = _R[2];
    if (!bestBox) return null;
    const normal = new THREE.Vector3();
    if (axis >= 0) normal.setComponent(axis, sign); else normal.copy(d).negate();
    return { t: best, box: bestBox, normal, point: o.clone().addScaledVector(d, best) };
  }

  // Cheap boolean "is anything between a and b"
  blocked(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return false;
    const max = len - 0.05;
    _d.set(dx / len, dy / len, dz / len);
    _O[0] = a.x; _O[1] = a.y; _O[2] = a.z; _O[3] = _d.x; _O[4] = _d.y; _O[5] = _d.z; _R[0] = max; _bHit = false;
    this.walk(a, _d, blockVisit);
    return _bHit;
  }

  // Cylinder approximated by an AABB with feet at y
  overlap(x, y, z, r, h) {
    const G = this.index();
    const A = G.always;
    for (let j = 0; j < A.length; j++) { const b = A[j]; if (x - r < b.maxx && x + r > b.minx && y < b.maxy && y + h > b.miny && z - r < b.maxz && z + r > b.minz) return b; }
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const c = G.cells.get(ckey(i, k));
      if (c) for (let j = 0; j < c.length; j++) { const b = c[j]; if (x - r < b.maxx && x + r > b.minx && y < b.maxy && y + h > b.miny && z - r < b.maxz && z + r > b.minz) return b; }
    }
    return null;
  }

  // every box overlapping an x/z rectangle (once each), in a shared list: read it before the next query
  boxesIn(x0, z0, x1, z1) {
    const G = this.index(), st = ++_stamp;
    _near.length = 0;
    for (let j = 0; j < G.always.length; j++) _near.push(G.always[j]);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
      const c = G.cells.get(ckey(i, k));
      if (c) for (let j = 0; j < c.length; j++) { const b = c[j]; if (b._q === st) continue; b._q = st; _near.push(b); }
    }
    return _near;
  }

  // every box overlapping an x/z rectangle (once each)
  near(x0, z0, x1, z1, fn) {
    const G = this.index(), st = ++_stamp;
    for (const b of G.always) fn(b);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
      const c = G.cells.get(ckey(i, k));
      if (c) for (const b of c) { if (b._q === st) continue; b._q = st; fn(b); }
    }
  }

  moveEntity(e, dt) {
    // e.stepOff: how far the eye lags behind the feet after a step (decays to 0); e.noSnap: skip stair snapping (jumps)
    const p = e.pos, r = e.radius, h = e.height;
    const wasGround = e.onGround;

    // horizontal axes resolved separately so we slide along walls
    for (let axis = 0; axis < 2; axis++) {
      const key = axis === 0 ? 'x' : 'z';
      const delta = e.vel[key] * dt;
      if (delta === 0) continue;
      const before = p[key], startIn = !!this.overlap(p.x, p.y, p.z, r, h);
      p[key] += delta;
      let iter = 0;
      for (; iter < 4; iter++) {
        const b = this.overlap(p.x, p.y, p.z, r, h);
        if (!b) break;
        const step = b.maxy - p.y;
        if (wasGround && step > 0 && step <= PLAYER.stepHeight && !this.overlap(p.x, b.maxy + 0.001, p.z, r, h)) {
          e.stepOff = (e.stepOff || 0) - step; // the camera eases up the step instead of snapping
          p.y = b.maxy;
          continue;
        }
        if (axis === 0) p.x = delta > 0 ? b.minx - r - 1e-4 : b.maxx + r + 1e-4;
        else p.z = delta > 0 ? b.minz - r - 1e-4 : b.maxz + r + 1e-4;
        e.vel[key] = 0;
      }
      // a gap narrower than we are: pushing out of one side lands us in the other. Stay where we were instead of
      // being shoved back and forth (that read as the view rubber-banding in tight spots)
      if (!startIn && this.overlap(p.x, p.y, p.z, r, h)) { p[key] = before; e.vel[key] = 0; }
    }

    // vertical
    const prevY = p.y;
    p.y += e.vel.y * dt;
    e.onGround = false;
    for (let iter = 0; iter < 4; iter++) {
      const b = this.overlap(p.x, p.y, p.z, r, h);
      if (!b) break;
      if (prevY >= b.maxy - 0.02 || e.vel.y <= 0) {
        p.y = b.maxy;
        if (e.vel.y < 0) e.vel.y = 0;
        e.onGround = true;
      } else {
        p.y = b.miny - h - 1e-4;
        if (e.vel.y > 0) e.vel.y = 0;
      }
    }
    // ground probe so we stay grounded while standing still
    if (!e.onGround && e.vel.y <= 0 && this.overlap(p.x, p.y - 0.03, p.z, r * 0.95, 0.03)) e.onGround = true;
    // walking down stairs: stick to the next step down instead of falling onto it (no hopping)
    if (!e.onGround && wasGround && e.vel.y <= 0 && !e.noSnap) {
      let top = -Infinity;
      const rr = r * 0.95, lim = p.y - STEP_DOWN;
      this.near(p.x - rr, p.z - rr, p.x + rr, p.z + rr, (b) => {
        if (b.maxy > p.y + 1e-3 || b.maxy < lim || b.maxy <= top) return;
        if (p.x - rr < b.maxx && p.x + rr > b.minx && p.z - rr < b.maxz && p.z + rr > b.minz) top = b.maxy;
      });
      if (top > -Infinity && !this.overlap(p.x, top + 0.001, p.z, r, h)) {
        e.stepOff = (e.stepOff || 0) + (p.y - top);
        p.y = top;
        e.vel.y = 0;
        e.onGround = true;
      }
    }
    if (e.stepOff) e.stepOff = Math.abs(e.stepOff) < 0.002 ? 0 : Math.max(-1, Math.min(1, e.stepOff * Math.exp(-dt * 7.5)));
  }

  // Small sphere (as cube) with bounce; returns true when it bounced this step
  movePoint(p, v, dt, r) {
    let bounced = false;
    for (let axis = 0; axis < 3; axis++) {
      const key = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
      const delta = v[key] * dt;
      if (delta === 0) continue;
      p[key] += delta;
      if (this.overlap(p.x, p.y - r, p.z, r, 2 * r)) {
        p[key] -= delta;
        v[key] *= -0.38;
        if (axis === 1) { v.x *= 0.72; v.z *= 0.72; }
        if (Math.abs(v[key]) > 1.5) bounced = true;
      }
    }
    return bounced;
  }
}
