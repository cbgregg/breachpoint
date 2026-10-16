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

export class Physics {
  constructor() {
    this.boxes = [];
  }

  addBox(b) { this.boxes.push(b); return b; }

  // Returns {t, point, normal, box} or null
  raycast(o, d, maxDist) {
    let best = maxDist, bestBox = null, axis = -1, sign = 0;
    for (const b of this.boxes) {
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.minx, b.miny, b.minz, b.maxx, b.maxy, b.maxz, best);
      if (t < best) { best = t; bestBox = b; axis = _axis; sign = _sign; }
    }
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
    const ix = dx / len, iy = dy / len, iz = dz / len;
    const max = len - 0.05;
    for (const bx of this.boxes) {
      if (rayBox(a.x, a.y, a.z, ix, iy, iz, bx.minx, bx.miny, bx.minz, bx.maxx, bx.maxy, bx.maxz, max) < max) return true;
    }
    return false;
  }

  // Cylinder approximated by an AABB with feet at y
  overlap(x, y, z, r, h) {
    for (const b of this.boxes) {
      if (x - r < b.maxx && x + r > b.minx && y < b.maxy && y + h > b.miny && z - r < b.maxz && z + r > b.minz) return b;
    }
    return null;
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
      for (const b of this.boxes) {
        if (b.maxy > p.y + 1e-3 || b.maxy < lim || b.maxy <= top) continue;
        if (p.x - rr < b.maxx && p.x + rr > b.minx && p.z - rr < b.maxz && p.z + rr > b.minz) top = b.maxy;
      }
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
