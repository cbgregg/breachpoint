// Overgrowth: a decommissioned pumping station in the Cascade foothills, years after the last crew left. Moss
// has taken the gravel, ferns and alders push up through the pads, vines climb the tanks, and the rust has gone
// orange under the green. A small, fast arena: the two halves are point-mirrored, so both teams get the same map.
//
// The middle is the pump house: a close-quarters room with a doorway on every side and the old pump inside, and
// its flat roof (stairs up on two opposite sides, a low parapet to fight from) under the rusted water tower. It
// sees most of the yard, so whoever holds it is exposed from every lane; the room below, the stairs and the pipe
// racks are how you take it back. Around it, per half: a tall storage tank wrapped in vines, a low tank, a pipe
// rack you crouch behind and an overhead pipe bridge you run under, a container stack, and hedges that hide
// you without stopping a bullet.
import * as THREE from 'three';

const HX = 40, HZ = 28;
const ROOF = 3.4;              // the pump house roof (walkable)
const PH = 4.2;                // pump house half-size (8.4 m square)

const SPAWNS = [[35, -20], [35, -12], [36, -4], [36, 4], [35, 12], [35, 20], [33, 16], [33, -16], [37, 0], [34, 8]];

export const OVERGROWTH = {
  id: 'overgrowth',
  name: 'Overgrowth',
  blurb: 'A pumping station taken back by the forest: fight for the pump house roof under the old water tower, through moss, ferns, vine-wrapped tanks and pipe racks',
  bounds: { hx: HX, hz: HZ },
  skyline: false,
  // a soft overcast morning in the foothills: cool green-grey light, mist in the trees
  look: { photo: { url: 'assets/sky/lilienstein.jpg', u: 0.5942, gain: 1.2 }, sunElev: 29, turbidity: 3.5, rayleigh: 1.8, mie: 0.004, fog: 0.0038, fogColor: 0x7f8a74, sun: 2.8, sunColor: 0xfff0d8, hemi: 1.25, hemiSky: 0xc4d4cc,
    ground: 0x4c5a3a, exposure: 1.0, env: 0.85, clouds: true },
  spawns: SPAWNS,
  pickups: [
    { type: 'health', pos: [0, 0, 2.6] },
    { type: 'ammo', pos: [0, 0, -2.6] },
    { type: 'health', pos: [1.2, ROOF, -3.2] },
    { type: 'ammo', pos: [-1.2, ROOF, 3.2] },
    { type: 'health', pos: [20, 0, 0] },
    { type: 'health', pos: [-20, 0, 0] },
    { type: 'ammo', pos: [11, 0, 21] },
    { type: 'ammo', pos: [-11, 0, -21] },
    { type: 'ammo', pos: [27, 0, -21] },
    { type: 'ammo', pos: [-27, 0, 21] },
  ],
  photos: ['assets/loading/overgrowth-1.jpg', 'assets/loading/overgrowth-2.jpg', 'assets/loading/overgrowth-3.jpg'],
  build,
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// moss and short grass over damp ground, with darker clumps and a few dead patches
function mossTex() {
  return canvasTex(512, 512, (g, W) => {
    const r = rng(77);
    g.fillStyle = '#3f5128'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = r() * W, rad = 8 + r() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.6 ? '74,98,40' : r() < 0.8 ? '46,62,26' : '108,104,62';
      gr.addColorStop(0, `rgba(${c},0.55)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 22000; i++) {
      const v = r();
      g.fillStyle = v < 0.45 ? `rgba(104,132,56,${0.35 + r() * 0.4})` : v < 0.85 ? `rgba(34,48,20,${0.35 + r() * 0.4})` : `rgba(150,146,92,0.45)`;
      g.fillRect(r() * W, r() * W, 1 + r() * 1.5, 2 + r() * 4);
    }
  });
}
// gravel and mud on the old service tracks, moss creeping in at the edges
function gravelTex() {
  return canvasTex(512, 512, (g, W) => {
    const r = rng(91);
    g.fillStyle = '#6a6252'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 16000; i++) {
      const s = 1 + r() * 3, v = 70 + r() * 90;
      g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.82},${0.5 + r() * 0.4})`;
      g.beginPath(); g.ellipse(r() * W, r() * W, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 90; i++) {
      const x = r() * W, y = r() * W, rad = 10 + r() * 30, gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.5 ? '64,84,36' : '58,50,40';
      gr.addColorStop(0, `rgba(${c},0.5)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}
// a fern frond / ground-cover card with transparent edges
function fernTex() {
  return canvasTex(256, 256, (g, W) => {
    g.clearRect(0, 0, W, W);
    const r = rng(13);
    for (let f = 0; f < 7; f++) {
      const a = -Math.PI / 2 + (f - 3) * 0.32, len = W * (0.38 + r() * 0.1);
      g.strokeStyle = '#2f4a1c'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(W / 2, W); const ex = W / 2 + Math.cos(a) * len * 1.6, ey = W + Math.sin(a) * len * 2.2;
      g.quadraticCurveTo(W / 2 + Math.cos(a) * len * 0.5, W + Math.sin(a) * len * 1.6, ex, ey); g.stroke();
      for (let k = 1; k < 16; k++) {
        const t = k / 16, px = W / 2 + (ex - W / 2) * t, py = W + (ey - W) * t, l = (1 - t) * 26 + 6;
        for (const s of [-1, 1]) {
          g.fillStyle = `rgb(${60 + r() * 30},${100 + r() * 40},${36 + r() * 20})`;
          g.beginPath(); g.ellipse(px + Math.cos(a + s * 1.3) * l * 0.5, py + Math.sin(a + s * 1.3) * l * 0.5, l * 0.5, 3, a + s * 1.3, 0, 7); g.fill();
        }
      }
    }
  });
}
// ivy: wavy hanging strands of small leaves on a transparent card
function ivyTex() {
  return canvasTex(256, 512, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const r = rng(31);
    for (let k = 0; k < 9; k++) {
      let x = r() * W; const ph = r() * 6, len = H * (0.45 + r() * 0.55);
      for (let y = 0; y < len; y += 5) {
        x += Math.sin(y * 0.03 + ph) * 1.2;
        g.fillStyle = '#3b3020'; g.fillRect(x, y, 1.5, 5);
        if (r() < 0.75) {
          const s = 4 + r() * 6, a = r() * 6;
          g.fillStyle = `rgb(${50 + r() * 40},${84 + r() * 50},${30 + r() * 20})`;
          g.beginPath(); g.ellipse(x + (r() - 0.5) * 10, y, s, s * 0.7, a, 0, 7); g.fill();
        }
      }
    }
  });
}
// rust streaks and flaking paint for the tanks and the water tower
function rustTex(base) {
  return canvasTex(512, 512, (g, W) => {
    const r = rng(base);
    g.fillStyle = '#5f6d64'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 160; i++) {
      const x = r() * W, w = 2 + r() * 10, y = r() * W * 0.7, h = 40 + r() * 260;
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, `rgba(${130 + r() * 40},${64 + r() * 20},30,0.55)`); gr.addColorStop(1, 'rgba(120,60,24,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.7 ? `rgba(${110 + r() * 50},${50 + r() * 26},24,${0.15 + r() * 0.3})` : `rgba(150,160,150,${0.1 + r() * 0.2})`;
      g.beginPath(); g.ellipse(r() * W, r() * W, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 40; i++) {   // moss at the base
      const x = r() * W, rad = 20 + r() * 50, gr = g.createRadialGradient(x, W, 0, x, W, rad);
      gr.addColorStop(0, 'rgba(58,82,30,0.85)'); gr.addColorStop(1, 'rgba(58,82,30,0)');
      g.fillStyle = gr; g.fillRect(x - rad, W - rad, rad * 2, rad);
    }
  });
}

function build(ctx) {
  const { THREE: T, M, S, B, put, solid, plane, decal, addKind, glows, low } = ctx;
  const std = (o) => new T.MeshStandardMaterial({ vertexColors: true, ...o });
  Object.assign(M, {
    moss: std({ map: mossTex(), roughness: 1 }),
    gravel: std({ map: gravelTex(), roughness: 1 }),
    fern: std({ map: fernTex(), roughness: 0.9, alphaTest: 0.5, side: T.DoubleSide }),
    ivy: std({ map: ivyTex(), roughness: 0.9, alphaTest: 0.5, side: T.DoubleSide }),
    tankA: std({ map: rustTex(5), roughness: 0.85, metalness: 0.35 }),
    tankB: std({ map: rustTex(11), roughness: 0.85, metalness: 0.35 }),
    hedge: std({ color: 0xffffff, roughness: 1 }),
      });
  Object.assign(S, { ivy: 0, moss: 6, gravel: 5, tankA: 0, tankB: 0, hedge: 0, fern: 0 });
  const rnd = rng(2026);
  // both halves: f(s) with s = 1 for team 1's half (+x) and -1 for the point-mirrored copy
  const both = (f) => { f(1); f(-1); };

  // ---------- ground: moss everywhere, gravel service tracks, concrete pads under the plant ----------
  plane(M.moss, 2 * HX + 60, 2 * HZ + 60, 0, 0, 0);
  plane(M.gravel, 2 * HX, 5, 0, 0, 0.01);                       // the east-west track through the middle
  both((s) => {
    plane(M.gravel, 5, 2 * HZ - 6, s * 14, 0, 0.012);           // cross tracks
    plane(M.gravel, 14, 4, s * 27, s * 18, 0.013);
  });
  plane(M.concrete, 2 * PH + 3, 2 * PH + 3, 0, 0, 0.02, 0, 0x9a9a8c);   // the pump house apron

  // ---------- the pump house ----------
  const WT = 0.3, DOOR = 1.7, WH = ROOF - 0.25;   // walls stop under the roof slab (their tops would flicker against its surface)
  // four walls, a doorway in the middle of each
  for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const seg = PH - DOOR / 2;   // each wall piece's length either side of the door
    for (const side of [-1, 1]) {
      const c = side * (DOOR / 2 + seg / 2);
      const [x, z, w, d] = ax === 'x' ? [sgn * PH, c, WT, seg] : [c, sgn * PH, seg, WT];
      solid(x, z, w, d, WH, 0, 'concrete');
      B(M.concrete, w, WH, d, x, 0, z, 0, { tint: 0xb8b4a6, grime: 0.6 });
    }
    // the lintel over the doorway
    const [x, z, w, d] = ax === 'x' ? [sgn * PH, 0, WT, DOOR] : [0, sgn * PH, DOOR, WT];
    solid(x, z, w, d, WH - 2.4, 2.4, 'concrete');
    B(M.concrete, w, WH - 2.4, d, x, 2.4, z, 0, { tint: 0xb8b4a6, grime: 0.6 });
    // moss creeping up the wall
    for (const side of [-1, 1]) {
      const c = side * (DOOR / 2 + (PH - DOOR / 2) / 2);
      const ry = ax === 'x' ? (sgn > 0 ? Math.PI / 2 : -Math.PI / 2) : (sgn > 0 ? 0 : Math.PI);
      const [mx, mz] = ax === 'x' ? [sgn * (PH + WT / 2 + 0.01), c] : [c, sgn * (PH + WT / 2 + 0.01)];
      put(new T.PlaneGeometry(PH - DOOR / 2 - 0.2, 1.4), M.moss, mx, 0.7, mz, ry, { grime: 0, tint: 0xb8c8a0, cast: false });
    }
  }
  // the roof slab (walkable) and its parapet, open where the two stairs arrive
  solid(0, 0, 2 * PH + WT, 2 * PH + WT, 0.25, ROOF - 0.25, 'concrete');
  B(M.concrete, 2 * PH + WT + 0.2, 0.25, 2 * PH + WT + 0.2, 0, ROOF - 0.25, 0, 0, { tint: 0xa8a498, grime: 0.5 });
  const PAR = 0.95, E = PH + WT / 2 - 0.12;
  // north and south edges are open over the stair landing (north: x -0.2..2.2; south mirrored)
  both((s) => {
    const pieces = [[-E, -0.2], [2.2, E]];   // along x, on the z = s*E edge (in s-space)
    for (const [a, b] of pieces) {
      const cx = s * (a + b) / 2, w = b - a;
      solid(cx, s * E, w, 0.24, PAR, ROOF, 'concrete');
      B(M.concrete, w, PAR, 0.24, cx, ROOF, s * E, 0, { tint: 0xa8a498, grime: 0.5 });
    }
    // the east (west) edge: solid, with a firing slot
    for (const [a, b] of [[-E, -0.6], [0.6, E]]) {
      solid(s * E, s * (a + b) / 2, 0.24, b - a, PAR, ROOF, 'concrete');
      B(M.concrete, 0.24, PAR, b - a, s * E, ROOF, s * (a + b) / 2, 0, { tint: 0xa8a498, grime: 0.5 });
    }
    solid(s * E, 0, 0.24, 1.2, 0.45, ROOF, 'concrete');   // under the slot: chest-high gap to shoot through
    B(M.concrete, 0.24, 0.45, 1.2, s * E, ROOF, 0, 0, { tint: 0xa8a498, grime: 0.5 });
  });
  // the stairs: outside the north wall, foot at the east corner climbing west to a landing over the doorway; and
  // point-mirrored outside the south wall. (The landing is a slab: you walk out of the doorway under it.)
  const STEPS = 12, RISE = ROOF / STEPS, RUN = 0.29, SW = 1.3, X0 = 4.6, XT = X0 - RUN * STEPS;
  both((s) => {
    const z = s * (PH + WT / 2 + SW / 2 + 0.05);
    for (let i = 0; i < STEPS; i++) {
      const x = s * (X0 - RUN * (i + 0.5)), h = RISE * (i + 1);
      solid(x, z, RUN + 0.01, SW, h, 0, 'metal');
      B(M.metal, RUN + 0.02, 0.06, SW, x, h - 0.06, z, 0, { tint: 0x6a5a48, grime: 0.4 });
      B(M.concrete, RUN + 0.02, h - 0.06, SW - 0.04, x, 0, z, 0, { tint: 0x8e8a7e, grime: 0.6 });   // the stepped concrete under it
    }
    // the stringers and a rail on the open side
    const L = RUN * STEPS, mid = s * (X0 - L / 2), ang = Math.atan2(ROOF, L), len = Math.hypot(L, ROOF);
    for (const off of [-SW / 2, SW / 2]) put(new T.BoxGeometry(len, 0.25, 0.08), M.rust, mid, ROOF / 2 - 0.1, z + off, 0, { rz: -s * ang, grime: 0.3 });
    put(new T.BoxGeometry(len, 0.05, 0.05), M.rust, mid, ROOF / 2 + 0.95, z + s * SW / 2, 0, { rz: -s * ang, grime: 0 });
    // the landing at the top
    solid(s * (XT - 0.5), z, 1.0, SW, 0.25, ROOF - 0.25, 'metal');
    B(M.metal, 1.0, 0.09, SW - 0.02, s * (XT - 0.5), ROOF - 0.105, z + s * 0.03, 0, { tint: 0x6a5a48, grime: 0.4 });   // a hair under the roof slab's top, which it meets
    B(M.rust, 0.12, ROOF - 0.1, 0.12, s * (XT - 0.94), 0, z + s * (SW / 2 - 0.06), 0, { grime: 0.3 });
  });
  // the pump inside: a motor on a plinth, the volute and the pipes running out through the walls
  solid(0, 0, 2.6, 1.4, 1.25, 0, 'metal');
  B(M.concrete, 2.8, 0.25, 1.6, 0, 0, 0, 0, { tint: 0x9a968a, grime: 0.6 });
  put(new T.CylinderGeometry(0.55, 0.55, 1.4, 20), M.tankB, -0.5, 0.85, 0, 0, { rz: Math.PI / 2, grime: 0.3 });
  put(new T.CylinderGeometry(0.62, 0.62, 0.5, 20), M.rust, 0.65, 0.85, 0, 0, { rz: Math.PI / 2, grime: 0.3 });
  put(new T.CylinderGeometry(0.22, 0.22, 2 * PH, 12), M.rust, 0, 2.9, PH / 2 + 0.5, 0, { rx: Math.PI / 2, grime: 0.2 });
  // a strip light inside (it's dark in there)
  const tube = new T.MeshStandardMaterial({ color: 0xf2f8ff, emissive: 0xdfeeff, emissiveIntensity: 2.2 });
  for (const z of [-2, 2]) { put(new T.BoxGeometry(1.4, 0.06, 0.12), tube, 0, ROOF - 0.3, z, 0, { grime: 0, cast: false }); glows.push([0, ROOF - 0.4, z, 1.2]); }

  // the water tower on the roof: four lattice legs from the roof corners to a riveted tank, a ladder, a catwalk ring
  const LEG = 2.4, TB = 10, TH = 3.6, TR = 2.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    solid(sx * LEG, sz * LEG, 0.3, 0.3, TB - ROOF, ROOF, 'metal');
    put(new T.BoxGeometry(0.26, TB - ROOF, 0.26), M.rust, sx * LEG, (ROOF + TB) / 2, sz * LEG, 0, { grime: 0.2 });
  }
  for (const y of [ROOF + 2.2, ROOF + 4.4]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const [x0, z0] = [a[0] * LEG, a[1] * LEG], [x1, z1] = [b[0] * LEG, b[1] * LEG];
    put(new T.BoxGeometry(Math.hypot(x1 - x0, z1 - z0), 0.1, 0.1), M.rust, (x0 + x1) / 2, y, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0), { grime: 0 });
    // the X bracing on every face
    const L = Math.hypot(Math.hypot(x1 - x0, z1 - z0), 2.2);
    for (const k of [-1, 1]) put(new T.BoxGeometry(L, 0.05, 0.05), M.rust, (x0 + x1) / 2, y + 1.1, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0), { rz: k * Math.atan2(2.2, Math.hypot(x1 - x0, z1 - z0)), grime: 0 });
  }
  put(new T.CylinderGeometry(TR, TR, TH, 32), M.tankA, 0, TB + TH / 2, 0, 0, { grime: 0.2 });
  put(new T.ConeGeometry(TR + 0.15, 1.3, 32), M.rust, 0, TB + TH + 0.65, 0, 0, { grime: 0.2 });
  put(new T.CylinderGeometry(TR + 0.6, TR + 0.6, 0.08, 32), M.dark, 0, TB - 0.05, 0, 0, { grime: 0 });
  put(new T.TorusGeometry(TR + 0.6, 0.03, 4, 40), M.rust, 0, TB + 0.95, 0, 0, { rx: Math.PI / 2, grime: 0 });
  // vines hanging off the tank and down the legs
  for (let i = 0; i < 18; i++) {
    if (rnd() < 0.3) continue;
    const a = (i + 0.5) / 18 * Math.PI * 2, h = 1.2 + rnd() * 2.6;
    put(new T.PlaneGeometry(0.8, h), M.ivy, Math.cos(a) * (TR + 0.08), TB + TH - h / 2 - rnd() * 0.6, Math.sin(a) * (TR + 0.08), -a + Math.PI / 2, { grime: 0, cast: false });
  }

  // ---------- per half (point-mirrored) ----------
  both((s) => {
    const P = (x, z) => [s * x, s * z];
    const K = (x, z, w, d, h, y0, kind, extra) => { const [a, b] = P(x, z); addKind(a, b, w, d, h, y0, kind, extra, s > 0 ? 1 : 0); };

    // the tall storage tank, wrapped in vines; a low tank beside the cross track
    const tank = (x, z, r, h, mat) => {
      const [cx, cz] = P(x, z);
      // collision: a square inside the circle plus two slabs reaching its sides
      solid(cx, cz, r * 1.42, r * 1.42, h, 0, 'metal');
      solid(cx, cz, r * 1.96, r * 0.9, h, 0, 'metal');
      solid(cx, cz, r * 0.9, r * 1.96, h, 0, 'metal');
      put(new T.CylinderGeometry(r, r, h, 36), mat, cx, h / 2, cz, rnd() * 6, { grime: 0.3 });
      put(new T.CylinderGeometry(r * 1.02, r * 1.02, 0.3, 36), M.concrete, cx, 0.15, cz, 0, { tint: 0x8a887c, grime: 0.6 });
      put(new T.ConeGeometry(r, 0.7, 36), M.rust, cx, h + 0.35, cz, 0, { grime: 0.3 });
      for (const y of [h * 0.33, h * 0.66]) put(new T.TorusGeometry(r + 0.02, 0.04, 4, 40), M.rust, cx, y, cz, 0, { rx: Math.PI / 2, grime: 0 });
      // a caged ladder up the side (decoration)
      const la = rnd() * Math.PI * 2;
      for (const o of [-0.22, 0.22]) put(new T.BoxGeometry(0.05, h, 0.05), M.rust, cx + Math.cos(la) * (r + 0.15) - Math.sin(la) * o, h / 2, cz + Math.sin(la) * (r + 0.15) + Math.cos(la) * o, 0, { grime: 0 });
      // vines: leaf cards hugging the shell, thicker toward the ground
      // ivy: one strip per 0.85 m of the shell, evenly spaced so no two overlap (overlapping cards flicker)
      const nv = Math.floor(2 * Math.PI * r / 0.85);
      for (let i = 0; i < nv; i++) {
        if (rnd() < 0.3) continue;
        const a = (i + 0.5) / nv * Math.PI * 2, vh = 1.5 + rnd() * h * 0.8, top = rnd() < 0.6;
        put(new T.PlaneGeometry(0.8, vh), M.ivy, cx + Math.cos(a) * (r + 0.08), top ? h - vh / 2 : vh / 2, cz + Math.sin(a) * (r + 0.08), -a + Math.PI / 2, { grime: 0, tint: rnd() < 0.5 ? 0xc8d8b0 : 0xffffff, cast: false });
      }
    };
    tank(17, 13, 3.6, 7.5, M.tankA);
    tank(23, -12.5, 2.6, 3.4, M.tankB);

    // the low pipe rack: two pipes on trestles, waist-high, with a gap to cut through
    const pipeRun = (x, z0, z1, y, r) => {
      const [cx, cz] = P(x, (z0 + z1) / 2), L = Math.abs(z1 - z0);
      put(new T.CylinderGeometry(r, r, L, 14), M.rust, cx, y, cz, 0, { rx: Math.PI / 2, grime: 0.3 });
      for (let z = Math.min(z0, z1) + 0.6; z < Math.max(z0, z1); z += 3) { const [px, pz] = P(x, z); B(M.dark, 0.5, y - r, 0.18, px, 0, pz, 0, { grime: 0.3 }); }
    };
    for (const [z0, z1] of [[-22, -12], [-9, -3]]) {
      pipeRun(8.6, z0, z1, 0.7, 0.32); pipeRun(9.4, z0, z1, 0.55, 0.22);
      const [cx, cz] = P(9, (z0 + z1) / 2);
      solid(cx, cz, 1.6, Math.abs(z1 - z0), 1.05, 0, 'metal');
    }
    // the overhead pipe bridge: run under it, it breaks the sightline from the tower roof down the lane
    for (const [x, y, r] of [[9, 3.1, 0.38], [9.9, 3.0, 0.26]]) { const [cx, cz] = P(x, 14); put(new T.CylinderGeometry(r, r, 16, 14), M.rust, cx, y, cz, 0, { rx: Math.PI / 2, grime: 0.3 }); }
    for (const z of [7, 12, 17, 21]) { const [cx, cz] = P(9.4, z); solid(cx, cz, 0.3, 0.3, 3.4, 0, 'metal'); B(M.dark, 0.3, 3.4, 0.3, cx, 0, cz, 0, { grime: 0.3 }); B(M.dark, 2.2, 0.2, 0.3, cx, 3.3, cz, 0, { grime: 0.2 }); }
    { const [cx, cz] = P(9.4, 14); solid(cx, cz, 2.2, 15, 0.9, 2.6, 'metal'); }   // the pipes themselves stop bullets overhead

    // a short pipe rack near spawn, and a valve manifold
    pipeRun(26, 2, 9, 0.75, 0.3);
    { const [cx, cz] = P(26, 5.5); solid(cx, cz, 0.9, 7, 1.1, 0, 'metal'); }
    { const [cx, cz] = P(13, -3); solid(cx, cz, 1.6, 1.6, 1.2, 0, 'metal'); B(M.concrete, 1.6, 0.2, 1.6, cx, 0, cz, 0, { tint: 0x8a887c }); put(new T.CylinderGeometry(0.3, 0.3, 1.2, 12), M.tankB, cx, 0.8, cz, 0, { grime: 0.3 }); put(new T.TorusGeometry(0.35, 0.04, 6, 18), M.rust, cx, 1.45, cz, 0, { rx: Math.PI / 2, grime: 0 }); }

    // containers: a stack by the far fence (the climb is the crates), a single one mid-half
    K(29, 23, 7, 2.6, 2.6, 0, 'container', 0x4d6b54);
    K(29, 23, 7, 2.6, 2.6, 2.6, 'container', 0x8a3d2c);
    K(31.5, 19.3, 1.6, 1.6, 1.6, 0, 'crate');
    K(13, -19, 2.6, 7, 2.6, 0, 'container', 0x3e5d74);
    K(17.5, -22, 1.6, 1.6, 1.6, 0, 'crate'); K(17.6, -22.1, 1.3, 1.3, 1.3, 1.6, 'crate');
    K(20, 3.5, 2, 2, 1.2, 0, 'pallet');
    K(5.5, 9, 1.6, 1.6, 1.6, 0, 'crate');
    K(6, -9.5, 0.62, 0.62, 0.9, 0, 'barrel'); K(6.8, -10.1, 0.62, 0.62, 0.9, 0, 'barrel');
    K(21.5, 21, 0.62, 0.62, 0.9, 0, 'barrel');
    K(4, 16, 3.2, 0.9, 1.1, 0, 'jersey'); K(19, -4, 0.9, 3.2, 1.1, 0, 'jersey');
    // spawn: staggered HESCO and an ammo crate
    for (const [x, z, w, d] of [[31, -8, 1, 4], [31, 9, 1, 4], [33, -24, 3, 1], [33, 25.5, 3, 1], [30.5, 0, 1, 2.4]]) K(x, z, w, d, 2.2, 0, 'hesco');
    K(37.5, 9, 2, 2, 1.2, 0, 'ammo');

    // greenery: alders (London plane builder, tinted young), hedges that hide you without stopping a bullet, ferns
    for (const [x, z, h] of [[22, 6, 8.5], [6, 22, 9], [26, -23, 9.5], [34, 2, 7.5], [12, -9, 7], [36, -26, 8]]) K(x, z, 0, 0, h, 0, 'tree');
    const hedge = (x, z, w, d, h) => {
      const [cx, cz] = P(x, z);
      solid(cx, cz, w, d, h, 0, 'cloth').pass = true;
      const n = Math.max(2, Math.round(Math.max(w, d) / 0.9));
      const rr0 = Math.min(w, d) * 0.62, span = Math.max(0, Math.max(w, d) - 2 * rr0);
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) - 0.5 : 0, px = cx + (w > d ? t * span : 0), pz = cz + (w > d ? 0 : t * span);
        const rr = rr0 * (0.95 + rnd() * 0.1);
        put(new T.IcosahedronGeometry(rr, 1), M.hedge, px, h * 0.55, pz, rnd() * 6, { sy: h / Math.min(w, d) * 0.9, tint: 0x2e4420, grime: 0 });
        for (let k = 0; k < 7; k++) {
          const a = rnd() * Math.PI * 2, el = (rnd() - 0.3) * 1.1;
          put(new T.PlaneGeometry(rr * 0.9, rr * 0.9), M.leaf, px + Math.cos(a) * rr * 0.25, h * 0.55 + Math.sin(el) * rr * 0.4, pz + Math.sin(a) * rr * 0.25, -a + Math.PI / 2, { rx: el * 0.5, grime: 0, tint: rnd() < 0.5 ? 0x6a9448 : 0x7fa858, cast: false });
        }
      }
    };
    hedge(14.5, 5.5, 4, 1.1, 1.3); hedge(4.5, -16, 1.1, 5, 1.3); hedge(24, 15.5, 5, 1.1, 1.4); hedge(28, -4, 1.1, 4, 1.3);
    // ferns and ground cover, scattered off the tracks
    for (let i = 0; i < (low ? 40 : 110); i++) {
      const x = 2 + rnd() * (HX - 4), z = (rnd() * 2 - 1) * (HZ - 2);
      if (Math.abs(z) < 3 || Math.abs(x - 14) < 3 || (Math.abs(x) < PH + 2 && Math.abs(z) < PH + 2)) continue;
      const [cx, cz] = P(x, z), sc = 0.5 + rnd() * 0.6, ry = rnd() * Math.PI;
      for (const a of [0, Math.PI / 2]) put(new T.PlaneGeometry(1.4 * sc, 1.0 * sc), M.fern, cx, 0.5 * sc, cz, ry + a, { grime: 0, cast: false, tint: rnd() < 0.5 ? 0xa8c890 : 0xd0e0b0 });
    }

  });

  // perimeter wall (collision + a concrete wall with moss along its foot)
  for (const [x, z, w, d] of [[0, HZ + 0.4, 2 * HX + 1.6, 0.4], [0, -(HZ + 0.4), 2 * HX + 1.6, 0.4], [HX + 0.4, 0, 0.4, 2 * HZ], [-(HX + 0.4), 0, 0.4, 2 * HZ]]) {
    solid(x, z, w, d, 9, 0, 'concrete');
    B(M.concrete, w, 2.2, d, x, 0, z, 0, { tint: 0x9a9888, grime: 0.7 });
    B(M.dark, w > d ? w : 0.04, 1.6, w > d ? 0.04 : d, x, 2.2, z, 0, { grime: 0, cast: false });   // the chain-link (dark mesh band)
  }

  return {
    // the pump house roof, for bots: up either staircase
    upper: {
      y: ROOF, bounds: { minX: -PH, maxX: PH, minZ: -PH, maxZ: PH },
      portals: [1, -1].map(s => {
        const z = s * (PH + WT / 2 + SW / 2 + 0.05);
        return { rect: [Math.min(s * 4.7, s * 5.9), Math.min(z - 0.7, z + 0.7), Math.max(s * 4.7, s * 5.9), Math.max(z - 0.7, z + 0.7)],
          climb: [[s * 5.5, 0, z], [s * 4.5, 0.3, z], [s * (X0 - RUN * STEPS / 2), ROOF / 2, z], [s * (XT - 0.5), ROOF, z], [s * 0.9, ROOF, s * 3.2], [s * 0.9, ROOF, s * 1.6]] };
      }),
    },
    groundSurface: 'grass',
    indoorAt: (p) => (Math.abs(p.x) < PH && Math.abs(p.z) < PH && p.y < ROOF - 0.5 ? 1 : 0),
    menuCam(t, cam) {
      cam.position.set(Math.cos(t * 0.5) * 26, 8 + Math.sin(t * 0.4) * 2, Math.sin(t * 0.5) * 20);
      cam.lookAt(0, 6, 0);
    },
  };
}
