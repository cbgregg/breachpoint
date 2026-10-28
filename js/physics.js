// Axis-aligned box collision, character movement and raycasting
import * as THREE from 'three';
import { PLAYER } from './config.js';

const STEP_DOWN = 0.36; // largest drop that counts as a stair step when walking down

export class Box {
  constructor(minx, miny, minz, maxx, maxy, maxz) {
    this.minx = minx; this.miny = miny; this.minz = minz;
    this.maxx = maxx; this.maxy = maxy; this.maxz = maxz;
  }
}

const _d = new THREE.Vector3();
let _axis = -1;
let _sign = 0;

// Ray vs AABB (slab method). Returns entry distance or Infinity. Sets _axis/_sign for the hit normal.
export function rayBox(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz, maxT) {
  let tmin = 0, tmax = maxT, ax = -1, sg = 0;
  if (Math.abs(dx) < 1e-9) { if (ox < minx || ox > maxx) return Infinity; }
  else {
    const inv = 1 / dx; let t1 = (minx - ox) * inv, t2 = (maxx - ox) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 0; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < miny || oy > maxy) return Infinity; }
  else {
    const inv = 1 / dy; let t1 = (miny - oy) * inv, t2 = (maxy - oy) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 1; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < minz || oz > maxz) return Infinity; }
  else {
    const inv = 1 / dz; let t1 = (minz - oz) * inv, t2 = (maxz - oz) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = 2; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  _axis = ax; _sign = sg;
  return tmin;
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
const boxHit = (b, x, y, z, r, h) => x - r < b.maxx && x + r > b.minx && y < b.maxy && y + h > b.miny && z - r < b.maxz && z + r > b.minz;
const _near = [];
let _rO = null, _rD = null, _rBest = 0, _rBox = null, _rAxis = -1, _rSign = 0, _bHit = false;
function rayVisit(b) {
  if (b.pass) return _rBest;   // see-through barriers (railings, benches, shop glass): they stop you, not bullets or sight
  const t = rayBox(_rO.x, _rO.y, _rO.z, _rD.x, _rD.y, _rD.z, b.minx, b.miny, b.minz, b.maxx, b.maxy, b.maxz, _rBest);
  if (t < _rBest) { _rBest = t; _rBox = b; _rAxis = _axis; _rSign = _sign; }
  return _rBest;
}
function blockVisit(b) {
  if (_bHit) return 0;
  if (!b.pass && rayBox(_rO.x, _rO.y, _rO.z, _rD.x, _rD.y, _rD.z, b.minx, b.miny, b.minz, b.maxx, b.maxy, b.maxz, _rBest) < _rBest) { _bHit = true; return 0; }
  return _rBest;
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

  // every box a ray from o along unit d might hit within maxT, nearest cells first: calls visit(box) once per
  // box; visit returns the distance to stop at (the best hit so far), so cells beyond it are skipped
  walk(o, d, maxT, visit) {
    const G = this.index(), st = ++_stamp;
    let best = maxT;
    for (const b of G.always) best = Math.min(best, visit(b));
    // 2D DDA over the cells the ray crosses (t in the ray's own 3D units)
    let i = Math.floor(o.x / CELL), k = Math.floor(o.z / CELL);
    const si = d.x > 0 ? 1 : -1, sk = d.z > 0 ? 1 : -1;
    const di = Math.abs(d.x) > 1e-9 ? CELL / Math.abs(d.x) : Infinity, dk = Math.abs(d.z) > 1e-9 ? CELL / Math.abs(d.z) : Infinity;
    let ti = Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? (i + 1) * CELL - o.x : o.x - i * CELL) / Math.abs(d.x)) : Infinity;
    let tk = Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? (k + 1) * CELL - o.z : o.z - k * CELL) / Math.abs(d.z)) : Infinity;
    let t0 = 0;
    for (let n = 0; n < 4096 && t0 <= best; n++) {
      const c = G.cells.get(ckey(i, k));
      if (c) for (const b of c) { if (b._q === st) continue; b._q = st; best = Math.min(best, visit(b)); }
      if (ti < tk) { t0 = ti; ti += di; i += si; } else { t0 = tk; tk += dk; k += sk; }
      if (t0 > maxT) break;
    }
    return best;
  }

  // Returns {t, point, normal, box} or null
  raycast(o, d, maxDist) {
    _rO = o; _rD = d; _rBest = maxDist; _rBox = null; _rAxis = -1; _rSign = 0;
    this.walk(o, d, maxDist, rayVisit);
    const best = _rBest, bestBox = _rBox, axis = _rAxis, sign = _rSign;
    if (!bestBox) return null;
    const normal = new THREE.Vector3();
    if (axis >= 0) normal.setComponent(axis, sign); else normal.copy(d).negate();
    return { t: best, box: bestBox, normal, point: o.clone().addScaledVector(d, best) };
  }

  // Cheap boolean "is anything between a and b"
  blocked(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    const max = len - 0.05;
    _d.set(dx / len, dy / len, dz / len);
    _rO = a; _rD = _d; _rBest = max; _bHit = false;
    this.walk(a, _d, max, blockVisit);
    return _bHit;
  }

  // Cylinder approximated by an AABB with feet at y
  overlap(x, y, z, r, h) {
    const G = this.index();
    for (const b of G.always) if (boxHit(b, x, y, z, r, h)) return b;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const c = G.cells.get(ckey(i, k));
      if (c) for (const b of c) if (boxHit(b, x, y, z, r, h)) return b;
    }
    return null;
  }

  // every box overlapping an x/z rectangle (once each), in a shared list: read it before the next query
  boxesIn(x0, z0, x1, z1) {
    const G = this.index(), st = ++_stamp;
    _near.length = 0;
    for (const b of G.always) _near.push(b);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
      const c = G.cells.get(ckey(i, k));
      if (c) for (const b of c) { if (b._q === st) continue; b._q = st; _near.push(b); }
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
