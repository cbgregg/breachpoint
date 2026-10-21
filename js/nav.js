// Grid navigation + A* pathfinding for bots
import * as THREE from 'three';

class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  clear() { this.items.length = 0; this.keys.length = 0; }
  push(item, key) {
    const a = this.items, k = this.keys;
    a.push(item); k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastI = a.pop(), lastK = k.pop();
    if (a.length) {
      a[0] = lastI; k[0] = lastK;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export class NavGrid {
  // opts.floorY: build an upper-level grid (an office floor): a cell is open only where something solid
  // tops out at floorY under it and nothing blocks head height above it
  constructor(physics, bounds, cell = 1, agentR = 0.45, opts = {}) {
    this.minX = bounds.minX; this.minZ = bounds.minZ;
    this.cell = cell;
    this.cols = Math.round((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.round((bounds.maxZ - bounds.minZ) / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.curStamp = 0;
    this.heap = new MinHeap();

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const cx = this.minX + (i + 0.5) * cell, cz = this.minZ + (j + 0.5) * cell;
        if (opts.floorY !== undefined) {
          const F = opts.floorY;
          let floor = false, block = false;
          for (const b of physics.boxes) {
            if (b.maxy > F - 0.3 && b.maxy < F + 0.3 && cx > b.minx + 0.05 && cx < b.maxx - 0.05 && cz > b.minz + 0.05 && cz < b.maxz - 0.05) floor = true;
            if (b.maxy > F + 0.35 && b.miny < F + 1.7 && cx > b.minx - agentR && cx < b.maxx + agentR && cz > b.minz - agentR && cz < b.maxz + agentR) { block = true; break; }
          }
          if (!floor || block) this.blocked[j * this.cols + i] = 1;
          continue;
        }
        for (const b of physics.boxes) {
          // navIgnore: solid mass over a walkable level below (a building over a tunnel);
          // navBlock: walls of a lower level (tunnels, stairwells) that sit below street height
          if (b.navIgnore) continue;
          if ((b.navBlock || (b.maxy > 0.35 && b.miny < 1.7)) &&
            cx > b.minx - agentR && cx < b.maxx + agentR && cz > b.minz - agentR && cz < b.maxz + agentR) {
            this.blocked[j * this.cols + i] = 1;
            break;
          }
        }
      }
    }
    this.openCells = [];
    for (let k = 0; k < n; k++) if (!this.blocked[k]) this.openCells.push(k);
  }

  ci(x) { return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell))); }
  cj(z) { return Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell))); }
  cx(i) { return this.minX + (i + 0.5) * this.cell; }
  cz(j) { return this.minZ + (j + 0.5) * this.cell; }

  isOpen(i, j) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows && !this.blocked[j * this.cols + i]; }
  isOpenAt(x, z) { return this.isOpen(this.ci(x), this.cj(z)); }

  nearestOpen(i, j) {
    if (this.isOpen(i, j)) return [i, j];
    for (let r = 1; r < 10; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          if (this.isOpen(i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return null;
  }

  randomOpenPoint(filter) {
    for (let tries = 0; tries < 40; tries++) {
      const k = this.openCells[(Math.random() * this.openCells.length) | 0];
      const i = k % this.cols, j = (k / this.cols) | 0;
      const p = new THREE.Vector3(this.cx(i), 0, this.cz(j));
      if (!filter || filter(p)) return p;
    }
    const k = this.openCells[(Math.random() * this.openCells.length) | 0];
    return new THREE.Vector3(this.cx(k % this.cols), 0, this.cz((k / this.cols) | 0));
  }

  // straight walk from a to b stays on open cells, with some width so shortcuts don't clip corners
  lineClear(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    const steps = Math.ceil(len / 0.25);
    const px = -dz / len * 0.35, pz = dx / len * 0.35;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, x = ax + dx * t, z = az + dz * t;
      if (!this.isOpenAt(x, z) || !this.isOpenAt(x + px, z + pz) || !this.isOpenAt(x - px, z - pz)) return false;
    }
    return true;
  }

  // route variety: a smooth per-seed cost field (value noise on a ~7 m lattice) makes each bot prefer
  // different streets and doorways to the same goal; costs only grow, so A* stays correct
  routeNoise(i, j, seed) {
    const S = 7, x = i / S, y = j / S, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const hsh = (a, b) => { let h = (a * 374761393 + b * 668265263 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (hsh(xi, yi) * (1 - sx) + hsh(xi + 1, yi) * sx) * (1 - sy) + (hsh(xi, yi + 1) * (1 - sx) + hsh(xi + 1, yi + 1) * sx) * sy;
  }
  // multi-level maps: this (ground) grid can carry more levels, levels = [{ grid, y, portals: [{ link, climb, rect }] }].
  // Level 0 is this grid and level k is levels[k - 1]; a portal is a stair from level `link` to its own level,
  // its climb waypoints listed in that order. Levels can chain (the street, a concourse, the platforms below
  // it): a path between levels walks to a stair, climbs it waypoint by waypoint, and carries on.
  levelOf(p) {
    let best = 0, bd = Math.abs(p.y);
    this.levels.forEach((L, i) => { const d = Math.abs(p.y - L.y); if (d < bd) { bd = d; best = i + 1; } });
    return best;
  }
  // the grid for the level p is on (this one on the street)
  gridAt(p) { const k = this.levels ? this.levelOf(p) : 0; return k ? this.levels[k - 1].grid : this; }
  levelY(p) { return this.levels ? (this.levelOf(p) ? this.levels[this.levelOf(p) - 1].y : 0) : 0; }

  findPath(from, to, route = null) {
    const L = this.levels;
    if (!L || !L.length) return this.findPathFlat(from, to, route);
    const Y = (k) => (k ? L[k - 1].y : 0);
    const flat = (k, a, b) => (k ? L[k - 1].grid.findPathFlat(a, b) : this.findPathFlat(a, b, route));
    // the stairs as edges between levels
    const edges = [];
    L.forEach((lv, i) => lv.portals.forEach(q => edges.push({ q, a: q.link, b: i + 1 })));
    const levelRoute = (a, b) => {   // breadth-first over the levels
      const prev = new Map([[a, -1]]), queue = [a];
      while (queue.length) {
        const k = queue.shift();
        if (k === b) break;
        for (const e of edges) for (const [u, v] of [[e.a, e.b], [e.b, e.a]]) if (u === k && !prev.has(v)) { prev.set(v, k); queue.push(v); }
      }
      if (!prev.has(b)) return null;
      const out = [];
      for (let k = b; k !== -1; k = prev.get(k)) out.unshift(k);
      return out;
    };
    const tl = this.levelOf(to);
    let cur = from, lv = this.levelOf(from);
    const out = [];
    // standing on a stair (between its two levels): carry on from the nearest step toward where we're going
    const on = edges.find(e => from.x > e.q.rect[0] && from.x < e.q.rect[2] && from.z > e.q.rect[1] && from.z < e.q.rect[3] &&
      Math.abs(from.y - Y(e.a)) > 0.5 && Math.abs(from.y - Y(e.b)) > 0.5);
    if (on) {
      const r = levelRoute(on.b, tl);
      const up = !!r && !r.includes(on.a);   // the destination lies past the stair's own end
      const climb = up ? on.q.climb : [...on.q.climb].reverse();
      let ni = 0, nd = Infinity;
      climb.forEach((p, i) => { const d = Math.hypot(p.x - from.x, p.z - from.z) + Math.abs(p.y - from.y); if (d < nd) { nd = d; ni = i; } });
      for (const p of climb.slice(ni + 1)) out.push(p.clone());
      cur = climb[climb.length - 1]; lv = up ? on.b : on.a;
    }
    const levels = levelRoute(lv, tl);
    if (!levels) return [];
    for (let i = 1; i < levels.length; i++) {
      const next = levels[i];
      // the stair between these two levels with the shortest straight-line detour
      let best = null, bd = Infinity;
      for (const e of edges) {
        if (!((e.a === lv && e.b === next) || (e.b === lv && e.a === next))) continue;
        const c = e.a === lv ? e.q.climb : [...e.q.climb].reverse();
        const d = Math.hypot(c[0].x - cur.x, c[0].z - cur.z) + Math.hypot(c[c.length - 1].x - to.x, c[c.length - 1].z - to.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) return [];
      const leg = flat(lv, cur, best[0]);
      if (!leg.length && Math.hypot(cur.x - best[0].x, cur.z - best[0].z) > 1.2) return [];
      out.push(...leg, ...best.map(p => p.clone()));
      cur = best[best.length - 1]; lv = next;
    }
    out.push(...flat(lv, cur, to));
    return out;
  }

  findPathFlat(from, to, route = null) {
    let s = this.nearestOpen(this.ci(from.x), this.cj(from.z));
    let e = this.nearestOpen(this.ci(to.x), this.cj(to.z));
    if (!s || !e) return [];
    const cols = this.cols;
    const start = s[1] * cols + s[0], goal = e[1] * cols + e[0];
    const st = ++this.curStamp;
    const heap = this.heap; heap.clear();
    const ex = e[0], ez = e[1];
    const h = (i, j) => { const dx = Math.abs(i - ex), dz = Math.abs(j - ez); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    this.g[start] = 0; this.stamp[start] = st; this.parent[start] = -1;
    heap.push(start, h(s[0], s[1]));
    let found = false, iterations = 0;
    while (heap.size && iterations++ < 30000) {
      const cur = heap.pop();
      if (this.closed[cur] === st) continue;
      this.closed[cur] = st;
      if (cur === goal) { found = true; break; }
      const ci = cur % cols, cj = (cur / cols) | 0;
      for (const [di, dj, cost] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (!this.isOpen(ni, nj)) continue;
        if (di && dj && (!this.isOpen(ci + di, cj) || !this.isOpen(ci, cj + dj))) continue;
        const nk = nj * cols + ni;
        if (this.closed[nk] === st) continue;
        const ng = this.g[cur] + (route ? cost * (1 + route.w * this.routeNoise(ni, nj, route.seed)) : cost);
        if (this.stamp[nk] !== st || ng < this.g[nk]) {
          this.stamp[nk] = st; this.g[nk] = ng; this.parent[nk] = cur;
          heap.push(nk, ng + h(ni, nj));
        }
      }
    }
    if (!found) return [];
    const raw = [];
    for (let k = goal; k !== -1; k = this.parent[k]) raw.push([this.cx(k % cols), this.cz((k / cols) | 0)]);
    raw.reverse();
    raw[raw.length - 1] = this.isOpenAt(to.x, to.z) ? [to.x, to.z] : raw[raw.length - 1];
    // greedy string-pull smoothing: extend each segment while the straight line stays walkable
    const out = [];
    let ax = from.x, az = from.z, idx = 0;
    while (idx < raw.length) {
      let far = idx;
      while (far + 1 < raw.length && far - idx < 24 && this.lineClear(ax, az, raw[far + 1][0], raw[far + 1][1])) far++;
      out.push(new THREE.Vector3(raw[far][0], 0, raw[far][1]));
      ax = raw[far][0]; az = raw[far][1];
      idx = far + 1;
    }
    return out;
  }
}
