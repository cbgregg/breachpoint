// Map audit: finds what looks or plays wrong in a built map, the way a player would run into it.
//   - see-through: from every place a player can stand (each nav level, standing and crouched eye height),
//     rays in every direction; one whose first hit is the back of a one-sided surface means you'd see
//     straight through it (the renderer doesn't draw back faces)
//   - sky leak: below street level, a ray that hits nothing at all (a hole out of the underground)
//   - z-fight: two different surfaces at the same depth where a ray lands (they flicker)
//   - invisible wall: a collision box face with nothing drawn on it
//   - walk-through: a solid-looking surface at body height with no collision behind it
//   - clipping: a prop pushed into another object's collision
//   - floating: a prop with nothing under it
//   - bad spot: a spawn, pickup or bomb site inside something, or with no floor under it
//   - floor: the floor you stand on drawn above or below your feet, or not drawn at all
// Run it in the game with ?audit in the URL (markers on the map, the report in the console), or headless for
// every map with tools/map_audit.mjs. Rays run against the rendered geometry with three-mesh-bvh (loaded on
// demand, only here).
import * as THREE from 'three';

const BVH_URL = 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.6/build/index.module.js';
// layout kinds that are props standing on something (clipping / floating checks)
const PROPS = new Set(['car', 'crate', 'barrel', 'pallet', 'kiosk', 'stall', 'tent', 'truck', 'bus', 'container', 'dumpster', 'rsign', 'bench', 'sand', 'jersey', 'hesco', 'ammo', 'aframe', 'planter', 'infokiosk', 'bollard', 'tram']);
const COLORS = { floor: 0xff8080, 'see-through': 0xff2020, 'sky-leak': 0xff00ff, 'z-fight': 0xffa000, 'invisible-wall': 0xb040ff, 'walk-through': 0x20d0ff, clipping: 0xffff20, floating: 0x40ff60, 'bad-spot': 0xffffff };

export async function auditMap(game, opts = {}) {
  const t0 = performance.now();
  const { computeBoundsTree, acceleratedRaycast } = await import(/* @vite-ignore */ opts.bvhUrl || BVH_URL);
  const world = game.world, physics = game.physics, nav = world.nav;
  // ---------- what's drawn: every static mesh of the map (and its doors, shut) with a ray-tracing tree ----------
  const meshes = [], glass = [];
  const drawn = [world.group, game.doors && game.doors.group].filter(Boolean);
  for (const grp of drawn) grp.updateMatrixWorld(true);
  for (const grp of drawn) grp.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;   // hidden (trains away, closed variants)
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every(m => m.colorWrite === false) || o.isInstancedMesh) return;   // (instanced: small produce, in crates)
    if (!o.geometry.boundsTree) o.geometry.boundsTree = computeBoundsTree.call(o.geometry);
    o.raycast = acceleratedRaycast;
    // glass, decals, glows: see-through, but there (a glass wall isn't an invisible one)
    (mats.every(m => m.transparent || m.depthWrite === false) ? glass : meshes).push(o);
  });
  // rays have to see back faces too (that's what a see-through surface is): trace every material two-sided,
  // remembering which really are (put back at the end)
  const side0 = new Map();
  for (const o of meshes.concat(glass)) for (const m of [].concat(o.material)) if (!side0.has(m)) { side0.set(m, m.side); m.side = THREE.DoubleSide; }
  try {
    const rc = new THREE.Raycaster();
    rc.firstHitOnly = false;
    const _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
    // all hits along a ray, nearest first, each with its world normal, whether it's the back of the face and
    // whether that back is drawn
    const trace = (o, d, far, list = meshes) => {
      rc.set(o, d); rc.far = far;
      const hits = rc.intersectObjects(list, false);
      for (const h of hits) {
        const m = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material;
        _nm.getNormalMatrix(h.object.matrixWorld);
        h.n = _n.copy(h.face.normal).applyMatrix3(_nm).normalize().clone();
        h.back = h.n.dot(d) > 0;
        h.mat = m;
        h.drawnBack = side0.get(m) !== THREE.FrontSide;
        h.cutout = m.alphaTest > 0 || m.transparent;
      }
      return hits;
    };
    // how far a hit lies inside its triangle (metres to the nearest edge): a hit on the seam between two faces
    // of one flat surface lands on both at the same depth, which isn't a z-fight
    const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _cp = new THREE.Vector3(), _ln = new THREE.Line3();
    const edgeDist = (h) => {
      const g = h.object.geometry, pos = g.attributes.position, f = h.face;
      _ta.fromBufferAttribute(pos, f.a).applyMatrix4(h.object.matrixWorld);
      _tb.fromBufferAttribute(pos, f.b).applyMatrix4(h.object.matrixWorld);
      _tc.fromBufferAttribute(pos, f.c).applyMatrix4(h.object.matrixWorld);
      let m = Infinity;
      for (const [p, q] of [[_ta, _tb], [_tb, _tc], [_tc, _ta]]) { _ln.set(p, q).closestPointToPoint(h.point, true, _cp); m = Math.min(m, _cp.distanceTo(h.point)); }
      return m;
    };
    // how far toward the camera a polygon offset pulls a surface there, in metres: the factor times the depth change
  // across a pixel (steeper at grazing angles; 1080p, the game's 80 degree field of view) plus the units term
  const PIX = (80 * Math.PI / 180) / 1080;
  const pulled = (x, d) => {
    const c = Math.max(0.1, Math.abs(x.n.dot(d))), tan = Math.sqrt(1 - c * c) / c;
    return -x.mat.polygonOffsetFactor * x.distance * PIX * tan - x.mat.polygonOffsetUnits * x.distance * x.distance / (0.16 * 16777216);
  };
  const triArea = (h) => {
      const pos = h.object.geometry.attributes.position, f = h.face, mw = h.object.matrixWorld;
      _ta.fromBufferAttribute(pos, f.a).applyMatrix4(mw); _tb.fromBufferAttribute(pos, f.b).applyMatrix4(mw); _tc.fromBufferAttribute(pos, f.c).applyMatrix4(mw);
      return _tb.sub(_ta).cross(_tc.sub(_ta)).length() / 2;
    };
    // what collision says along the same ray (every solid box, see-through barriers included)
    const box3 = new THREE.Box3(), _hp = new THREE.Vector3(), ray = new THREE.Ray();
    const physHit = (o, d, far) => {
      ray.set(o, d);
      let best = far, src = null;
      physics.near(Math.min(o.x, o.x + d.x * far), Math.min(o.z, o.z + d.z * far), Math.max(o.x, o.x + d.x * far), Math.max(o.z, o.z + d.z * far), (b) => {
        if (b.surface === 'ground' && b.maxy <= 0) return;
        box3.min.set(b.minx, b.miny, b.minz); box3.max.set(b.maxx, b.maxy, b.maxz);
        if (ray.intersectBox(box3, _hp)) { const t = _hp.distanceTo(o); if (t < best) { best = t; src = b.src || null; } }
      });
      return { t: best, src };
    };
    // the layout item nearest a point (from the collision boxes' labels), to say what an issue is on
    const whatIsAt = (p) => {
      let best = null, bd = 2.5;
      physics.near(p.x - 2.5, p.z - 2.5, p.x + 2.5, p.z + 2.5, (b) => {
        if (!b.src || b.surface === 'ground') return;
        const dx = Math.max(b.minx - p.x, 0, p.x - b.maxx), dy = Math.max(b.miny - p.y, 0, p.y - b.maxy), dz = Math.max(b.minz - p.z, 0, p.z - b.maxz);
        const dd = Math.hypot(dx, dy, dz);
        if (dd < bd) { bd = dd; best = b.src; }
      });
      return best || 'unlabelled';
    };

    // a surface that carries on around a hit: parallel rays 30 cm out to each side, above and below all land on
    // something drawn within 30 cm of the same depth, with no collision behind it either
    const _side = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _ro = new THREE.Vector3();
    const broad = (o, d, h) => {
      _side.crossVectors(d, _up).normalize();
      for (const [a, b] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
        _ro.copy(o).addScaledVector(_side, a); _ro.y += b;
        const hh = trace(_ro, d, h.distance + 1).find(x => !x.back);
        if (!hh || Math.abs(hh.distance - h.distance) > 0.3) return false;
        if (physHit(_ro, d, hh.distance + 0.6).t <= hh.distance + 0.5) return false;   // (and no collision there either: not a window's frame)
      }
      return true;
    };

    const issues = [];
    const seen = new Set();
    const report = (type, p, info = {}) => {
      const key = `${type}|${Math.round(p.x)}|${Math.round(p.y)}|${Math.round(p.z)}`;   // one per metre cell
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ type, at: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], what: info.what || whatIsAt(p), ...info });
    };

    // ---------- viewpoints: walkable cells on every level, standing and crouched ----------
    // only the cells a player can get to: flooded from the spawns, and onto other levels by their stairs (a sealed
    // pocket with a floor isn't somewhere anyone stands)
    const levels = [{ grid: nav, y: 0 }, ...(nav.levels || [])];
    const seeds = levels.map(() => []);
    world.spawns.forEach(list => list.forEach(p => seeds[0].push(p)));
    (nav.levels || []).forEach((L, k) => L.portals.forEach(q => { seeds[q.link].push(q.climb[0]); seeds[k + 1].push(q.climb[q.climb.length - 1]); }));
    const reach = levels.map((L, k) => {
      const g = L.grid, seen = new Uint8Array(g.cols * g.rows), queue = [];
      for (const p of seeds[k]) {
        // the nearest open cell to a seed (stairs end right at a wall)
        let best = -1, bd = 4;
        for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const i = g.ci(p.x) + di, j = g.cj(p.z) + dj, dd = Math.hypot(di, dj); if (g.isOpen(i, j) && dd < bd) { bd = dd; best = j * g.cols + i; } }
        if (best >= 0 && !seen[best]) { seen[best] = 1; queue.push(best); }
      }
      while (queue.length) {
        const c = queue.pop(), i = c % g.cols, j = (c / g.cols) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (j + dj) * g.cols + i + di; if (g.isOpen(i + di, j + dj) && !seen[n]) { seen[n] = 1; queue.push(n); } }
      }
      return seen;
    });
    const views = [];
    const step = opts.step || 3;
    levels.forEach((L, k) => {
      const g = L.grid, every = Math.max(1, Math.round(step / g.cell));
      for (let j = 0; j < g.rows; j += every) for (let i = 0; i < g.cols; i += every) {
        if (!reach[k][j * g.cols + i]) continue;
        for (const eye of [1.6, 0.8]) { const v = new THREE.Vector3(g.cx(i), L.y + eye, g.cz(j)); v.floor = L.y; views.push(v); }
      }
    });
    // and on the stairs between levels (no nav cells there): every 75 cm along each climb path, standing on the
    // step under it, looking round more closely (the steps, the stairwell's walls and what's over it)
    const stairViews = new Set(), _so = new THREE.Vector3(), _dn = new THREE.Vector3(0, -1, 0);
    for (const L of nav.levels || []) for (const q of L.portals) {
      for (let k = 1; k < q.climb.length; k++) {
        const a = q.climb[k - 1], b = q.climb[k], n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.75));
        for (let i = 0; i < n; i++) {
          const p = a.clone().lerp(b, i / n);
          // (from just over the climb line: from higher up, a stairwell's lintel would read as the floor)
          const ph = physics.raycast(_so.set(p.x, p.y + 1.2, p.z), _dn, 4);
          if (!ph) continue;
          const fy = p.y + 1.2 - ph.t;
          if (physics.overlap(p.x, fy + 0.05, p.z, 0.25, 1.6)) continue;
          for (const eye of [1.6, 0.8]) { const v = new THREE.Vector3(p.x, fy + eye, p.z); v.floor = fy; views.push(v); stairViews.add(v); }
        }
      }
    }
    // directions: a Fibonacci sphere, biased toward the horizon where players look
    const sphere = (ND) => {
      const out = [];
      for (let k = 0; k < ND; k++) {
        const y = 1 - 2 * (k + 0.5) / ND, r = Math.sqrt(1 - y * y), a = k * Math.PI * (3 - Math.sqrt(5));
        out.push(new THREE.Vector3(Math.cos(a) * r, y * 0.8, Math.sin(a) * r).normalize());
      }
      return out;
    };
    const dirs = sphere(opts.dirs || 72), stairDirs = sphere(240);
    const FAR = 70, near = game.camera ? game.camera.near : 0.16;
    let rays = 0;
    // floor: what you stand on is drawn where your feet are (not floating over it, not sunk into it, not missing)
    const _down = new THREE.Vector3(0, -1, 0), _q = new THREE.Vector3(), _q2 = new THREE.Vector3();
    // a floor under a whole player there (the top of a 20 cm wall isn't one)
    const _f = new THREE.Vector3();
    const footing = (q, fy) => [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].every(([dx, dz]) => { const r = physics.raycast(_f.set(q.x + dx, fy + 0.3, q.z + dz), _down, 0.6); return r && Math.abs(fy + 0.3 - r.t - fy) < 0.3; });
    for (const v of views) {
      if (v.y - v.floor < 1 || physics.overlap(v.x, v.floor + 0.05, v.z, 0.3, 1.6)) continue;   // once per spot, if you can stand there
      const ph = physics.raycast(v, _down, 3);
      if (!ph) continue;
      const fy = v.y - ph.t, hit = trace(v, _down, 3).find(x => !x.back);
      const gap = hit ? hit.point.y - fy : null;
      // (low trim you walk over, a curb or a wheel stop, has no collision on purpose: up to 16 cm is fine)
      if (gap === null || gap < -0.06 || gap > 0.16) report('floor', new THREE.Vector3(v.x, fy, v.z), { problem: gap === null ? 'nothing drawn under your feet' : gap > 0 ? `feet sunk ${(gap * 100).toFixed(0)} cm into it` : `floating ${(-gap * 100).toFixed(0)} cm over it`, material: hit ? hit.mat.name || hit.mat.type : null });
    }
    for (const v of views) {
      const under = v.y < -1;
      for (const d of stairViews.has(v) ? stairDirs : dirs) {
        rays++;
        const hits = trace(v, d, FAR);
        if (!hits.length) {
          // (straight up a stairwell to the street is open sky)
          if (under && d.y < 0.35) report('sky-leak', v.clone().addScaledVector(d, 6), { from: v.toArray().map(x => +x.toFixed(1)), dir: d.toArray().map(x => +x.toFixed(2)) });
          continue;
        }
        const h = hits[0];
        // (a back face with a front one in the same place, a panel drawn both ways round, is fine; so is a sliver,
        // a rounded box's bevel, too small to see anything through)
        if (h.back && !h.drawnBack && !h.cutout && !hits.some(x => !x.back && x.distance - h.distance < 0.002) && triArea(h) > 0.02) report('see-through', h.point, { from: v.toArray().map(x => +x.toFixed(1)), dist: +h.distance.toFixed(2), material: h.mat.name || h.mat.type });
        // z-fight: the next surface at (almost) the same depth, facing the same way, not a seam between two faces
        // (closer than the depth buffer can tell apart there: ~d^2 / (near * 2^24), with a margin)
        const eps = Math.max(0.0004, 4 * h.distance * h.distance / (near * 16777216));
        const h2 = hits.find(x => x !== h && x.distance - h.distance < eps && (x.object !== h.object || x.faceIndex !== h.faceIndex));
        if (h2 && !h.back && !h2.back && Math.abs(h.n.dot(d)) > 0.2 && h.n.dot(h2.n) > 0.995 && !h.mat.polygonOffset && !h2.mat.polygonOffset && edgeDist(h) > 0.02 && edgeDist(h2) > 0.02) {
          report('z-fight', h.point, { from: v.toArray().map(x => +x.toFixed(1)), dist: +h.distance.toFixed(2), normal: h.n.toArray().map(x => +x.toFixed(2)), materials: [h.mat.name || h.mat.type, h2.mat.name || h2.mat.type] });
        }
        // an overlay drawn with a depth offset toward the camera (ground decals) just under another surface: the
        // offset pulls it through that surface along its seams and at grazing angles
        const ov = !h.back && !h.mat.polygonOffset && hits.find(x => x !== h && x.mat.polygonOffset && x.mat.polygonOffsetFactor < 0 && !x.back && x.n.dot(h.n) > 0.9 && x.distance - h.distance < pulled(x, d));
        if (ov) report('z-fight', h.point, { from: v.toArray().map(x => +x.toFixed(1)), dist: +h.distance.toFixed(2), materials: [h.mat.name || h.mat.type, ov.mat.name || ov.mat.type], problem: 'an offset overlay under it shows through' });
        // walk-through: a solid-looking upright surface at body height you could walk or shoot through. Only a
        // real wall counts: one that goes on around the hit (rays 30 cm to each side, above and below land on it
        // too), not the edge of a frame, a shutter, a sign or an awning, which are drawn without collision on purpose
        if (!h.back && Math.abs(h.n.y) < 0.4 && Math.abs(d.y) < 0.25 && -h.n.dot(d) > 0.35 && h.distance < 25 && h.object.castShadow && h.point.y > v.floor + 0.3 && h.point.y < v.floor + 1.8) {   // (head on, not grazing a door jamb)
          const p = physHit(v, d, h.distance + 0.6);
          // (and a player could be there: a bumper under a van's body, a fin over a car's, isn't somewhere you can walk)
          // (standing on whatever floor is under the surface: a bulkhead high over a lower flight of stairs isn't)
          const q = _q.copy(h.point).addScaledVector(d, 0.15), fq = physics.raycast(_q2.set(q.x, h.point.y + 0.05, q.z), _down, 15), qf = fq ? h.point.y + 0.05 - fq.t : -Infinity;
          if (p.t > h.distance + 0.5 && h.point.y - qf < 1.9 && footing(q, qf) && !physics.overlap(q.x, qf + 0.02, q.z, 0.1, 1.7) && broad(v, d, h)) report('walk-through', h.point, { from: v.toArray().map(x => +x.toFixed(1)), dist: +h.distance.toFixed(2), material: h.mat.name || h.mat.type });
        }
      }
    }

    // ---------- collision boxes: invisible walls, clipping, floating ----------
    const solidAndGlass = meshes.concat(glass);
    // is any drawn triangle inside a world-space box
    const slab = new THREE.Box3(), _wb = new THREE.Box3();
    const meshBoxes = solidAndGlass.map(o => { o.geometry.computeBoundingBox(); return { o, box: o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld), inv: o.matrixWorld.clone().invert() }; });
    const drawnIn = (box) => meshBoxes.some(({ o, box: wb, inv }) => wb.intersectsBox(box) && o.geometry.boundsTree.intersectsBox(_wb.copy(box), inv));
    // somewhere a player gets close to: within 1.5 m of a reachable cell of a level whose height it's at
    const standable = (p) => levels.some((L, k) => {
      if (p.y < L.y - 0.02 || p.y > L.y + 2.4) return false;   // (not under its floor: you can't see under the floor you stand on)
      const g = L.grid, ci = g.ci(p.x), cj = g.cj(p.z), n = Math.ceil(1.5 / g.cell);
      if (p.x < g.minX - 1.5 || p.z < g.minZ - 1.5 || p.x > g.minX + g.cols * g.cell + 1.5 || p.z > g.minZ + g.rows * g.cell + 1.5) return false;
      for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < g.cols && j < g.rows && reach[k][j * g.cols + i]) return true;
      }
      return false;
    });
    const boxes = physics.boxes.filter(b => b.surface !== 'ground' && !b.dynamic && b.maxy - b.miny < 40 && b.maxy > -40);
    const _o = new THREE.Vector3(), _d = new THREE.Vector3();
    const insideAny = (p, skip) => { let r = false; physics.near(p.x - 0.01, p.z - 0.01, p.x + 0.01, p.z + 0.01, (b) => { if (b !== skip && p.x > b.minx && p.x < b.maxx && p.y > b.miny && p.y < b.maxy && p.z > b.minz && p.z < b.maxz) r = true; }); return r; };
    let faces = 0;
    for (const b of boxes) {
      if (b.pass && b.maxy - b.miny < 1.3) continue;   // low see-through barriers (railings, gates): drawn thin on purpose
      if (b.hidden || (b.src && b.src.startsWith('boundary'))) continue;   // invisible on purpose (the map's edge, a tunnel's end)
      const h = b.maxy - b.miny;
      if (h < 0.25) continue;
      const sides = [
        [b.minx, (b.minz + b.maxz) / 2, -1, 0, b.maxz - b.minz], [b.maxx, (b.minz + b.maxz) / 2, 1, 0, b.maxz - b.minz],
        [(b.minx + b.maxx) / 2, b.minz, 0, -1, b.maxx - b.minx], [(b.minx + b.maxx) / 2, b.maxz, 0, 1, b.maxx - b.minx],
      ];
      // where a player would see or touch it from: a few points 60 cm out from the face
      const ys = [b.miny + Math.min(h / 2, 0.35), b.miny + Math.min(h * 0.75, 1.1)];
      for (const [fx, fz, nx, nz, len] of sides) {
        if (len < 0.3) continue;
        faces++;
        let near = 0;
        for (const y of ys) for (const f of [-0.3, 0, 0.3]) {
          _o.set(fx + nx * 0.6 + Math.abs(nz) * f * len, y, fz + nz * 0.6 + Math.abs(nx) * f * len);
          const flush = insideAny(_q2.set(fx + nx * 0.05 + Math.abs(nz) * f * len, y, fz + nz * 0.05 + Math.abs(nx) * f * len), null);
          if (!flush && !insideAny(_o, null) && standable(_o)) near++;   // not pressed against something else, and somewhere anyone gets to
        }
        if (!near) continue;
        // anything drawn in a slab hugging the face (a little outside it, up to tol inside: models are often inset):
        // bars of a railing, a stack of boxes with gaps, a sloped barrier all count; only a face with nothing at
        // all there is an invisible wall
        const tol = Math.max(0.3, 0.12 * len), m = Math.min(0.1, len * 0.2);
        const y0 = b.miny + Math.min(0.1, h * 0.2), y1 = Math.min(b.maxy - 0.02, b.miny + 2.2);
        if (nx) slab.set(_o.set(nx < 0 ? fx - 0.15 : fx - tol, y0, b.minz + m), _d.set(nx < 0 ? fx + tol : fx + 0.15, y1, b.maxz - m));
        else slab.set(_o.set(b.minx + m, y0, nz < 0 ? fz - 0.15 : fz - tol), _d.set(b.maxx - m, y1, nz < 0 ? fz + tol : fz + 0.15));
        if (!drawnIn(slab)) report('invisible-wall', new THREE.Vector3(fx, b.miny + Math.min(h / 2, 1.1), fz), { what: b.src || 'unlabelled', box: [b.minx, b.miny, b.minz, b.maxx, b.maxy, b.maxz].map(v => +v.toFixed(2)) });
      }
    }
    // clipping: one prop's collision pushed well into another's
    const propOf = (b) => b.src && PROPS.has(b.src.split('@')[0]);
    for (const a of boxes) {
      if (!propOf(a) || a.pass) continue;
      physics.near(a.minx, a.minz, a.maxx, a.maxz, (b) => {
        if (b === a || b.src === a.src || b.pass || b.surface === 'ground' || b.dynamic) return;
        if (propOf(b) && b.src < a.src) return;   // each pair once
        const ox = Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx), oy = Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny), oz = Math.min(a.maxz, b.maxz) - Math.max(a.minz, b.minz);
        if (ox > 0.12 && oy > 0.12 && oz > 0.12) report('clipping', new THREE.Vector3((Math.max(a.minx, b.minx) + Math.min(a.maxx, b.maxx)) / 2, Math.max(a.miny, b.miny) + oy / 2, (Math.max(a.minz, b.minz) + Math.min(a.maxz, b.maxz)) / 2), { what: a.src, into: b.src || 'unlabelled', depth: +Math.min(ox, oz).toFixed(2) });
      });
    }
    // floating: a prop's lowest box with no support under its footprint (the ground, a floor, another box)
    const lowest = new Map();
    for (const b of boxes) if (propOf(b)) { const l = lowest.get(b.src); if (!l || b.miny < l.miny) lowest.set(b.src, b); }
    for (const b of lowest.values()) {
      if (b.miny < 0.03 && b.miny > -0.03) continue;    // on the street
      let supported = false;
      physics.near(b.minx, b.minz, b.maxx, b.maxz, (s) => { if (s !== b && Math.abs(s.maxy - b.miny) < 0.06 && s.maxx > b.minx && s.minx < b.maxx && s.maxz > b.minz && s.minz < b.maxz) supported = true; });
      if (!supported) report('floating', new THREE.Vector3((b.minx + b.maxx) / 2, b.miny, (b.minz + b.maxz) / 2), { what: b.src, gap: +b.miny.toFixed(2) });
    }
    // spawns, pickups, bomb sites: clear to stand in, with a floor under them
    const spots = [];
    world.spawns.forEach((list, t) => list.forEach(p => spots.push(['spawn' + t, p.clone()])));
    for (const s of world.pickupSpots || []) spots.push(['pickup ' + s.type, new THREE.Vector3(...s.pos)]);
    for (const s of (world.sites && world.sites[0]) || []) spots.push(['site', new THREE.Vector3(s[0], s[2] || 0, s[1])]);
    for (const [name, p] of spots) {
      const body = physics.overlap(p.x, p.y + 0.05, p.z, 0.3, 1.7);
      let floor = false;
      physics.near(p.x - 0.1, p.z - 0.1, p.x + 0.1, p.z + 0.1, (s) => { if (s.maxy <= p.y + 0.05 && s.maxy > p.y - 0.4 && p.x > s.minx && p.x < s.maxx && p.z > s.minz && p.z < s.maxz) floor = true; });
      if (body || !floor) report('bad-spot', p, { what: name, problem: body ? 'inside ' + (body.src || 'a box') : 'no floor under it' });
    }

    const counts = {};
    for (const i of issues) counts[i.type] = (counts[i.type] || 0) + 1;
    return { map: world.id, counts, issues, stats: { views: views.length, rays, faces, meshes: meshes.length, boxes: boxes.length, seconds: +((performance.now() - t0) / 1000).toFixed(1) } };
  } finally {
    for (const [m, sd] of side0) m.side = sd;
  }
}

// markers on the map: a coloured dot per issue (and a line from the viewpoint for see-through and leaks)
export function showAudit(game, result) {
  if (game.auditMarks) { game.scene.remove(game.auditMarks); game.auditMarks = null; }
  const grp = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.12, 10, 8);
  const mats = {};
  const lines = [];
  for (const i of result.issues) {
    const c = COLORS[i.type] || 0xffffff;
    const m = mats[i.type] || (mats[i.type] = new THREE.MeshBasicMaterial({ color: c, depthTest: false, toneMapped: false }));
    const s = new THREE.Mesh(geo, m); s.position.set(...i.at); s.renderOrder = 10; grp.add(s);
    if (i.from) lines.push(...i.from, ...i.at);
  }
  if (lines.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff6060, transparent: true, opacity: 0.35, depthTest: false, toneMapped: false }));
    l.renderOrder = 10; grp.add(l);
  }
  game.scene.add(grp);
  game.auditMarks = grp;
}
