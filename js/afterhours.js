// Afterhours: an arcade that kept going after the building ran out, the kind you only find in a dream. Far too
// big and very quiet: a glowing cosmic carpet, cabinets playing to nobody, no ceiling, just open space and a
// nebula overhead, long neon tubes hanging under it. Nothing is scary, just slightly wrong: a cabinet row hangs upside down
// in mid-air, cabinets float, there's a lit doorway to nowhere and the PRIZES signs point both ways.
//
// It plays vertically, arena-shooter style. Point-mirrored. Three heights: a funhouse mirror maze under each
// team's deck (chrome panels and a checkerboard floor, 2.9 m walls under a 3.7 m deck), the arcade floor, and
// the upper level at 4 m: each team's deck over its maze, a long carpeted ramp up to it along the side wall, a
// bridge from the deck to the prize tower's top, and a second ramp from the floor straight up the tower's
// flank. The tower top is the power spot, reachable from both bridges and both ramps.
import * as THREE from 'three';

const HX = 36, HZ = 26;          // the hall's inside walls
const UP = 4;                    // deck / bridge / tower top
const CEIL = 12;
const DECK_X = 26;               // decks run from |x| = 26 to the end wall
const TW = 5;                    // tower half-size

const SPAWNS = [[33, -22], [33, -15], [33, -8], [31, -2], [33, 4], [33, 10], [31, 16], [33, 22], [30, -12], [30, 12]];

export const AFTERHOURS = {
  id: 'afterhours',
  name: 'Afterhours',
  blurb: 'A dreamlike arcade that goes on too long: mirror mazes under each team\'s deck, open to space overhead, ramps and bridges up to the prize tower',
  bounds: { hx: HX + 1, hz: HZ + 1 },
  skyline: false,
  look: { photo: { url: 'assets/sky/afterhours_space.jpg', u: 0.5, gain: 1.15 }, exposure: 1.12, env: 1.0, hemi: 1.6, hemiSky: 0xd8c8ff, ground: 0x3a2a58, fog: 0.004, fogColor: 0x1a1030, sun: 0.0, sunColor: 0xfff4d0 },
  spawns: SPAWNS,
  pickups: [
    { type: 'health', pos: [0, UP, 2.5] }, { type: 'ammo', pos: [0, UP, -2.5] },
    { type: 'health', pos: [18, 0, -2] }, { type: 'health', pos: [-18, 0, 2] },
    { type: 'ammo', pos: [13, 0, -18] }, { type: 'ammo', pos: [-13, 0, 18] },
    { type: 'ammo', pos: [31, UP, -18] }, { type: 'ammo', pos: [-31, UP, 18] },
    { type: 'health', pos: [30, 0, 0] }, { type: 'health', pos: [-30, 0, 0] },
  ],
  photos: ['assets/loading/afterhours-1.jpg', 'assets/loading/afterhours-2.jpg', 'assets/loading/afterhours-3.jpg'],
  build,
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function canvasTex(w, h, draw, rep = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// the walls: deep indigo with a faint 80s pattern of triangles and dashes
const wallTex = () => canvasTex(256, 256, (g, W) => {
  const r = rng(3);
  g.fillStyle = '#1c1238'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = r() * W, c = ['rgba(255,63,208,0.22)', 'rgba(41,240,255,0.2)', 'rgba(162,107,255,0.25)'][i % 3];
    g.strokeStyle = c; g.lineWidth = 3;
    if (i % 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y + 4); g.lineTo(x + 6, y + 18); g.closePath(); g.stroke(); }
    else { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24, y - 10); g.stroke(); }
  }
});
// the mirror maze's floor: a glossy black-and-white checkerboard
const checkerTex = () => canvasTex(256, 256, (g, W) => {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#f2f0f6' : '#121018'; g.fillRect(i * 64, j * 64, 64, 64); }
});
// the arcade carpet: deep navy with neon squiggles, zig-zags, rings and triangles
const arcadeCarpetTex = () => canvasTex(512, 512, (g, W) => {
  const r = rng(77), col = ['#ff3fd0', '#29f0ff', '#fff04a', '#7cff4f', '#a26bff', '#ff8a2a'];
  g.fillStyle = '#120a2e'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * W, c = col[(r() * col.length) | 0], k = r();
    g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 3 + r() * 3;
    if (k < 0.3) { g.beginPath(); g.moveTo(x, y); for (let j = 1; j < 5; j++) g.lineTo(x + j * 14, y + (j % 2 ? -12 : 12)); g.stroke(); }
    else if (k < 0.55) { g.beginPath(); g.arc(x, y, 8 + r() * 14, 0, 7); g.stroke(); }
    else if (k < 0.75) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y + 6); g.lineTo(x + 4, y + 20); g.closePath(); g.fill(); }
    else { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 20, y - 25, x + 35, y + 25, x + 55, y); g.stroke(); }
  }
});
// a cabinet's screen: an original made-up game (blocky ships, stars, a score, INSERT COIN)
const screenTex = (seed) => canvasTex(128, 160, (g, W, H) => {
  const r = rng(seed), hue = (r() * 360) | 0;
  g.fillStyle = `hsl(${hue},60%,8%)`; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { g.fillStyle = '#fff'; g.fillRect(r() * W, r() * H, 1, 1); }
  for (let i = 0; i < 6; i++) {
    const x = 10 + r() * (W - 30), y = 20 + r() * (H - 70), c = `hsl(${(hue + 120 + r() * 120) | 0},90%,60%)`;
    g.fillStyle = c; for (let k = 0; k < 9; k++) if (r() < 0.6) g.fillRect(x + (k % 3) * 5, y + ((k / 3) | 0) * 5, 5, 5);
  }
  g.fillStyle = `hsl(${(hue + 180) % 360},90%,60%)`; g.fillRect(W / 2 - 6, H - 30, 12, 8); g.fillRect(W / 2 - 2, H - 36, 4, 6);
  g.font = 'bold 12px monospace'; g.fillStyle = '#fff'; g.fillText('HI ' + String((r() * 99999) | 0).padStart(5, '0'), 6, 14);
  g.fillStyle = '#ffe040'; g.fillText(r() < 0.5 ? 'INSERT COIN' : 'PRESS START', 18, H - 6);
}, false);
const signTex = (text, color, w = 512, h = 128) => canvasTex(w, h, (g) => {
  g.clearRect(0, 0, w, h);
  g.font = `900 ${h * 0.6}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2);
}, false);

function build(ctx) {
  const { M, S, B, put, solid, plane, glows } = ctx;
  const T = THREE;
  const std = (o) => new T.MeshStandardMaterial({ vertexColors: true, ...o });
  Object.assign(M, {
    wall: std({ map: wallTex(), roughness: 0.6 }),
    checker: std({ map: checkerTex(), roughness: 0.15, metalness: 0.1 }),
    mirror: std({ color: 0xffffff, roughness: 0.04, metalness: 1, envMapIntensity: 1.8 }),
    arcadeCarpet: std({ map: arcadeCarpetTex(), roughness: 1, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }),
    cabinet: std({ color: 0xffffff, roughness: 0.5, metalness: 0.1 }),
    glassCase: new T.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }),
    tube: new T.MeshStandardMaterial({ color: 0xf4e8ff, emissive: 0xe8d8ff, emissiveIntensity: 2.6 }),
    neonPink: new T.MeshStandardMaterial({ color: 0xff3fd0, emissive: 0xff3fd0, emissiveIntensity: 3 }),
    neonCyan: new T.MeshStandardMaterial({ color: 0x29f0ff, emissive: 0x29f0ff, emissiveIntensity: 3 }),
    neonYellow: new T.MeshStandardMaterial({ color: 0xfff04a, emissive: 0xfff04a, emissiveIntensity: 2.5 }),
  });
  M.arcadeCarpet.emissiveMap = M.arcadeCarpet.map; M.arcadeCarpet.emissiveIntensity = 0.35;   // the UV glow
  Object.assign(S, { wall: 3, checker: 2.4, arcadeCarpet: 6, mirror: 0, cabinet: 0 });
  const rnd = rng(2077);
  const both = (f) => { f(1); f(-1); };
  const SB = (mat, w, h, d, x, y, z, opts = {}, surf = 'concrete') => { const b = solid(x, z, w, d, h, y, surf); B(mat, w, h, d, x, y, z, 0, { grime: 0, ...opts }); return b; };
  const screens = Array.from({ length: 8 }, (_, i) => new T.MeshStandardMaterial({ map: screenTex(i * 7 + 1), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 1.3, roughness: 0.3 }));
  screens.forEach(m => { m.emissiveMap = m.map; });
  const sign = (text, color, w, h, x, y, z, ry) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: signTex(text, color), transparent: true, depthWrite: false, side: T.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; ctx.group.add(m);
  };
  // an arcade cabinet facing +fz (fx, fz: unit facing), solid
  const cabinet = (x, z, fx, fz, tint, k, y = 0, solidIt = true, upside = false) => {
    const ry = Math.atan2(fx, fz), sgn = upside ? -1 : 1, base = upside ? y - 2.0 : y;
    if (solidIt) solid(x, z, Math.abs(fx) > 0.5 ? 0.8 : 0.9, Math.abs(fx) > 0.5 ? 0.9 : 0.8, 2.0, base, 'metal');
    put(new T.BoxGeometry(0.9, 2.0, 0.8), M.cabinet, x, base + 1.0, z, ry, { tint, grime: 0.05 });
    put(new T.PlaneGeometry(0.66, 0.82), screens[k % screens.length], x + fx * 0.41, y + sgn * 1.42, z + fz * 0.41, ry, { grime: 0, cast: false, rz: upside ? Math.PI : 0 });
    put(new T.BoxGeometry(0.92, 0.16, 0.54), M.neonPink, x + fx * 0.15, y + sgn * 1.95, z + fz * 0.15, ry, { grime: 0, cast: false });   // (proud of the cabinet's face: no flicker)
    put(new T.BoxGeometry(0.86, 0.08, 0.32), M.dark, x + fx * 0.5, y + sgn * 0.98, z + fz * 0.5, ry, { grime: 0 });   // the control panel
  };
  const CAB_TINTS = [0x2a2a6a, 0x6a1a3a, 0x1a4a3a, 0x3a2a5a, 0x5a3a12, 0x123a5a];

  // ---------- the hall: floor, walls, ceiling, lights ----------
  plane(M.arcadeCarpet, 2 * DECK_X, 2 * HZ, 0, 0, 0.005);
  both((s) => plane(M.checker, HX - DECK_X, 2 * HZ, s * (DECK_X + HX) / 2, 0, 0.006));
  for (const [x, z, w, d] of [[0, HZ + 0.5, 2 * HX + 2, 1], [0, -(HZ + 0.5), 2 * HX + 2, 1], [HX + 0.5, 0, 1, 2 * HZ], [-(HX + 0.5), 0, 1, 2 * HZ]]) {
    solid(x, z, w, d, CEIL + 2, 0, 'concrete');
    B(M.wall, w, CEIL, d, x, 0, z, 0, { grime: 0 });
    for (const [y, mat] of [[0.4, M.neonCyan], [3.2, M.neonPink], [7.5, M.neonCyan]]) B(mat, w > d ? w : 0.06, 0.08, w > d ? 0.06 : d, x - (w > d ? 0 : Math.sign(x) * 0.5), y, z - (w > d ? Math.sign(z) * 0.5 : 0), 0, { grime: 0, cast: false });   // neon bands
  }
  // no ceiling: the hall is open to space (the sky is a 360-degree nebula, look.photo), with long neon tubes
  // hanging over it. (An invisible lid at the wall tops keeps grenades in.)
  solid(0, 0, 2 * HX + 2, 2 * HZ + 2, 1, CEIL, 'concrete');
  let ti = 0;
  for (let z = -HZ + 4; z < HZ; z += 6.5, ti++) {
    const tube = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 2 * HX - 6, 8), ti % 2 ? M.neonPink : M.tube);
    tube.rotation.z = Math.PI / 2; tube.position.set(0, CEIL - 2.2, z); tube.userData.noMinimap = true; ctx.group.add(tube);
    for (let x = -HX + 6; x < HX - 4; x += 12) glows.push([x, CEIL - 2.6, z, 2.0]);
  }
  // ---------- the prize tower: a deck at 4 m on pillars, glass prize counters round its foot ----------
  SB(M.cabinet, 2 * TW, 0.3, 2 * TW, 0, UP - 0.3, 0, { tint: 0x2a1a4a });
  B(M.neonCyan, 2 * TW + 0.1, 0.06, 2 * TW + 0.1, 0, UP - 0.34, 0, 0, { grime: 0, cast: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) SB(M.cabinet, 0.8, UP - 0.3, 0.8, sx * (TW - 0.5), 0, sz * (TW - 0.5), { tint: 0x3a2a5a });
  // low walls round the top (cover), open where the bridges and ramps arrive
  both((s) => {
    // +x edge: the bridge comes in at z 1.5..4.5 (s-space), the ramp at z -4.5..-1.5
    SB(M.cabinet, 0.3, 1.0, 2.6, s * (TW - 0.15), UP, s * -0.0, { tint: 0x5a1a4a });
    for (const [a, b] of [[-TW, -0.6], [0.6, TW]]) SB(M.cabinet, b - a, 1.0, 0.3, s * (a + b) / 2, UP, s * (TW - 0.15), { tint: 0x5a1a4a });
    // the prize counters below: glass cases along two sides of the tower foot
    for (const x of [-3, 3]) {   // (on the z faces: the ramps climb the x faces)
      SB(M.cabinet, 2.2, 1.0, 0.7, s * x, 0, s * (TW + 0.6), { tint: 0x2a1a3a });
      put(new T.BoxGeometry(2.2, 0.4, 0.7), M.glassCase, s * x, 1.2, s * (TW + 0.6), 0, { grime: 0, cast: false });
    }
    sign('PRIZES', '#fff04a', 4, 1, 0, UP - 1.0, s * (TW + 0.03), s > 0 ? 0 : Math.PI);
  });
  // a giant token hangs over the tower, turning (decoration, well above head height)
  const token = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 0.35, 40), M.neonYellow);
  token.position.set(0, 9, 0); token.rotation.x = Math.PI / 2; ctx.group.add(token);

  // ---------- each team's half ----------
  const ramp = (x0, x1, z0, z1, y0, y1) => {
    // along x from (x0, y0) to (x1, y1): 0.1 m steps for collision, a smooth carpeted slope over them
    const n = Math.round(Math.abs(y1 - y0) / 0.1), dir = Math.sign(x1 - x0), run = Math.abs(x1 - x0) / n, w = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
    for (let i = 0; i < n; i++) {
      const h = y0 + (y1 - y0) * (i + 1) / n, x = x0 + dir * run * (i + 0.5);
      solid(x, zc, run + 0.01, w, h, 0, 'cloth');
      if (h > 0.3) B(M.cabinet, run + 0.01, h - 0.28, w - 0.02, x, 0, zc, 0, { grime: 0, tint: 0x2a1a4a });   // the solid underneath, seen from the side (kept under the slope)
    }
    const L = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, Math.abs(x1 - x0));
    put(new T.BoxGeometry(L, 0.12, w), M.arcadeCarpet, (x0 + x1) / 2, (y0 + y1) / 2 + 0.03, zc, 0, { rz: dir * ang, grime: 0 });   // (half a step up: on the step tops you stand on)
    for (const zz of [z0, z1]) {   // neon along both edges
      put(new T.BoxGeometry(L, 0.06, 0.06), M.neonPink, (x0 + x1) / 2, (y0 + y1) / 2 + 0.06, zz, 0, { rz: dir * ang, grime: 0, cast: false });
    }
  };
  both((s) => {
    const P = (x, z) => [s * x, s * z];
    // the deck over the mirror maze (y 3.7..4), its rail along the hall side, its pillars
    SB(M.cabinet, HX - DECK_X, 0.3, 2 * HZ, s * (DECK_X + HX) / 2, UP - 0.3, 0, { tint: 0x3a2a1a });
    plane(M.arcadeCarpet, HX - DECK_X, 2 * HZ, s * (DECK_X + HX) / 2, 0, UP + 0.005);
    B(M.neonCyan, 0.08, 0.06, 2 * HZ, s * DECK_X, UP - 0.34, 0, 0, { grime: 0, cast: false });
    // the rail: open where the ramp (z 21.5..25.5) and the bridge (z 1.5..4.5) arrive (s-space)
    for (const [a, b] of [[-HZ, 1.5], [4.5, 21.5]]) { const [x, z] = P(DECK_X + 0.15, (a + b) / 2); SB(M.cabinet, 0.3, 1.0, b - a, x, UP, z, { tint: 0x5a1a4a }); }
    for (let z = -HZ + 4; z < HZ; z += 8) { const [x, zz] = P(DECK_X + 0.4, z); SB(M.mirror, 0.6, UP - 0.3, 0.6, x, 0, zz); }
    // the funhouse mirror maze under the deck: chrome panels 2.9 m tall (the deck is 3.7 m up) on a checkerboard,
    // neon along their tops, doorways between
    const mz = [[29, -22, 0.25, 6], [29, -10, 0.25, 6], [29, 7, 0.25, 7], [32.5, -16, 5, 0.25], [32.5, -3, 5, 0.25], [32.5, 13, 5, 0.25], [34, 19, 3.5, 0.25], [30.5, 22.5, 0.25, 4], [33, 0, 0.25, 4]];
    for (const [x, z, w, d] of mz) { const [cx, cz] = P(x, z); SB(M.mirror, w, 2.9, d, cx, 0, cz, { tint: 0xe8e0ff }, 'glass'); B(M.neonPink, w + 0.02, 0.06, d + 0.02, cx, 2.9, cz, 0, { grime: 0, cast: false }); }
    // neon panels under the deck
    for (let z = -HZ + 4; z < HZ; z += 7) { const [x, zz] = P(31.5, z); put(new T.BoxGeometry(1.6, 0.05, 0.8), M.neonCyan, x, UP - 0.33, zz, 0, { grime: 0, cast: false }); glows.push([x, UP - 0.6, zz, 1.4]); }
    { const [x, z] = P(29.5, 0); sign('MIRROR MAZE', '#29f0ff', 2.6, 0.6, x, 3.2, z, s > 0 ? -Math.PI / 2 : Math.PI / 2); }

    // the long ramp up to the deck along the side wall, and the bridge from the deck to the tower
    ramp(s * 16, s * DECK_X, s * 21.5, s * 25.5, 0, UP);
    { const [x, z] = P((DECK_X + TW) / 2, 3); SB(M.cabinet, DECK_X - TW, 0.3, 3, x, UP - 0.3, z, { tint: 0x2a1a4a }); plane(M.arcadeCarpet, DECK_X - TW, 3, x, z, UP + 0.004);
      for (const off of [-1.45, 1.45]) { put(new T.BoxGeometry(DECK_X - TW, 0.06, 0.06), M.neonCyan, x, UP + 0.95, z + off, 0, { grime: 0, cast: false }); B(M.cabinet, DECK_X - TW, 0.9, 0.1, x, UP, z + off, 0, { grime: 0, tint: 0x3a1a5a }); solid(x, z + off, DECK_X - TW, 0.1, 0.9, UP, 'metal'); } }
    // the ramp from the arcade floor straight up the tower's flank
    ramp(s * 15, s * TW, s * -4.5, s * -1.5, 0, UP);

    // ---------- the arcade floor ----------
    // cabinet rows (back to back, so they're cover from both sides)
    const row = (x, z, n, alongX, k0) => {
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 0.95, [cx, cz] = P(x + (alongX ? o : 0), z + (alongX ? 0 : o));
        for (const f of [-1, 1]) {
          const [fx, fz] = alongX ? [0, f * s] : [f * s, 0];
          cabinet(cx + fx * 0.42, cz + fz * 0.42, fx, fz, CAB_TINTS[(i + k0 + (f > 0 ? 3 : 0)) % CAB_TINTS.length], i + k0 + (f > 0 ? 4 : 0));
        }
      }
    };
    row(13, 13, 5, true, 0); row(21, -4, 4, false, 2); row(9, 19, 4, true, 5); row(20, -16, 5, true, 1);
    // claw machines (a glass box over a pile of plushies)
    for (const x of [22, 23.4]) {
      const [cx, cz] = P(x, 9);
      SB(M.cabinet, 1.2, 0.9, 1.2, cx, 0, cz, { tint: 0xd03a8a });
      put(new T.BoxGeometry(1.2, 1.2, 1.2), M.glassCase, cx, 1.5, cz, 0, { grime: 0, cast: false }); solid(cx, cz, 1.2, 1.2, 1.2, 0.9, 'glass');
      for (let i = 0; i < 6; i++) put(new T.SphereGeometry(0.16, 8, 6), M.cabinet, cx + (rnd() - 0.5) * 0.8, 1.05, cz + (rnd() - 0.5) * 0.8, 0, { tint: [0xff8ad0, 0x8ad0ff, 0xfff08a][i % 3], grime: 0, cast: false });
      B(M.neonYellow, 1.22, 0.1, 1.22, cx, 2.1, cz, 0, { grime: 0, cast: false });
    }
    // air hockey tables (waist cover you shoot over)
    for (const [x, z] of [[8, 8], [17, -10]]) { const [cx, cz] = P(x, z); SB(M.cabinet, 2.4, 0.9, 1.3, cx, 0, cz, { tint: 0x1a3a6a }); B(M.neonCyan, 2.2, 0.02, 1.1, cx, 0.9, cz, 0, { grime: 0, cast: false }); }
    // the ball pit: a low padded wall round a sea of balls (jump in, crouch in it)
    { const [cx, cz] = P(10, -22); SB(M.cabinet, 6, 0.7, 4, cx, 0, cz, { tint: 0x2a6aca });
      for (let i = 0; i < (ctx.low ? 60 : 160); i++) put(new T.SphereGeometry(0.12, 7, 5), M.cabinet, cx + (rnd() - 0.5) * 5.6, 0.75, cz + (rnd() - 0.5) * 3.6, 0, { tint: [0xff3a3a, 0x3a8aff, 0xffe03a, 0x3aff7a][i % 4], grime: 0, cast: false }); }
    // skee-ball lanes: a long sloped table
    { const [cx, cz] = P(24, -22); SB(M.cabinet, 2.6, 1.1, 3.2, cx, 0, cz, { tint: 0x6a3a1a }); B(M.neonPink, 2.6, 0.05, 0.1, cx, 1.1, cz - s * 1.6, 0, { grime: 0, cast: false }); }
    // the dance machine: a lit platform and its screen
    { const [cx, cz] = P(21, 16); solid(cx, cz, 2, 2, 0.3, 0, 'metal'); B(M.neonCyan, 2, 0.3, 2, cx, 0, cz, 0, { grime: 0 });
      const [sx, sz] = P(21, 17.6); SB(M.cabinet, 2, 2.6, 0.6, sx, 0, sz, { tint: 0x6a1a6a }); }
    // the doorway to nowhere: a lit neon frame standing in the middle of the carpet
    { const [cx, cz] = P(6, -12); for (const o of [-0.7, 0.7]) SB(M.neonCyan, 0.3, 2.4, 0.3, cx + o, 0, cz); SB(M.neonCyan, 1.7, 0.4, 0.3, cx, 2.4, cz);
      for (const ry of [0, Math.PI]) put(new T.PlaneGeometry(1.1, 2.4), M.tube, cx, 1.2, cz, ry, { grime: 0, cast: false }); }
    // prize signs that disagree with each other
    { const [x, z] = P(14, 25.9); sign('PRIZES ←', '#fff04a', 2, 0.5, x, 3.2, z, s > 0 ? Math.PI : 0); }
    { const [x, z] = P(14, -25.9); sign('→ PRIZES', '#fff04a', 2, 0.5, x, 3.2, z, s > 0 ? 0 : Math.PI); }
    // up in the air: a cabinet row hanging upside down in mid-air, and two cabinets drifting
    for (let i = 0; i < 6; i++) { const [cx, cz] = P(10 + i * 1.0, -6); cabinet(cx, cz, 0, s, CAB_TINTS[i % 6], i + 2, CEIL, false, true); }
    for (const [x, y, z] of [[18, 7.5, 6], [12, 8.8, -14]]) { const [cx, cz] = P(x, z); cabinet(cx, cz, s * 0.7, s * 0.7, CAB_TINTS[(x | 0) % 6], (y * 3) | 0, y, false); }
    // neon on the end wall over the deck
    sign('AFTERHOURS', s > 0 ? '#ff3fd0' : '#29f0ff', 9, 2.2, s * (HX - 0.05), 8, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    sign('INSERT COIN', '#fff04a', 6, 1.4, s * 8, 7, s * (HZ - 0.05), s > 0 ? Math.PI : 0);
  });

  // ---------- for bots: the upper level (decks, bridges, tower top) and the four ramps up to it ----------
  const rampPortal = (x0, x1, zc) => ({
    rect: [Math.min(x0 - Math.sign(x1 - x0) * 1.5, x0), zc - 1.5, Math.max(x0 - Math.sign(x1 - x0) * 1.5, x0), zc + 1.5],
    climb: [[x0 - Math.sign(x1 - x0) * 1.0, 0, zc], [x0 + Math.sign(x1 - x0) * 0.5, 0.2, zc], [(x0 + x1) / 2, UP / 2, zc], [x1 - Math.sign(x1 - x0) * 0.3, UP - 0.2, zc], [x1 + Math.sign(x1 - x0) * 1.2, UP, zc]],
  });
  const portals = [rampPortal(16, DECK_X, 23.5), rampPortal(-16, -DECK_X, -23.5), rampPortal(15, TW, -3), rampPortal(-15, -TW, 3)];
  // the tower ramps arrive at the tower's edge: step on toward its middle
  portals[2].climb[4] = [TW - 1.5, UP, -3]; portals[3].climb[4] = [-(TW - 1.5), UP, 3];
  // the deck ramps arrive at the deck's edge: on into the deck
  portals[0].climb[4] = [DECK_X + 1.5, UP, 23.5]; portals[1].climb[4] = [-(DECK_X + 1.5), UP, -23.5];

  return {
    upper: { y: UP, bounds: { minX: -HX, maxX: HX, minZ: -HZ, maxZ: HZ }, portals },
    groundSurface: 'cloth',
    indoorAt: () => 1,
    menuCam(t, cam) { cam.position.set(Math.cos(t * 0.4) * 22, 6 + Math.sin(t * 0.5) * 1.5, Math.sin(t * 0.4) * 16); cam.lookAt(0, 4, 0); },
    update(dt, time) { token.rotation.z = time * 0.8; M.neonPink.emissiveIntensity = 2.6 + Math.sin(time * 3) * 0.5; },
  };
}
