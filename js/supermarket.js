// Freshway: an indoor map, laid out from the concept art. A big neighbourhood supermarket under one roof:
// checkouts and customer service along the front, upstairs offices and a break room on a mezzanine over the
// front corner, the bakery & deli counter along the service-alley side with the kitchen, cold storage and dry
// storage behind it (their roof is a catwalk from the offices to a stair at the far end), grocery aisles in
// the middle, produce on the street side, and a stock room plus receiving, storage and racking rooms along
// the back wall with roll-up doors onto the loading yard. Skylights in the roof.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cloneSoldier } from './assets.js';
import { armIK } from './character.js';
import { propFit } from './props.js';

// store shell: x -22..22 (front at -x), z -24..24, 6 m to the roof
const X0 = -22, X1 = 22, Z0 = -24, Z1 = 24, H = 6, T = 0.4;

export const MART = {
  id: 'mart',
  name: 'Freshway',
  // indoors under fluorescent tubes: a touch less exposure than the street maps, so the floor doesn't glare
  // a heavy haze outside, and no city skyline: the store sits in a ring of trees on the edge of town
  look: { exposure: 0.8, env: 0.45, hemi: 0.55, fog: 0.013, fogColor: 0xbcc6cc },
  skyline: false,
  mountain: false,
  blurb: 'Indoor supermarket: tall aisles, frozen foods, produce, deli, bakery, upstairs offices, doors that open and close; parking lot and loading yard',
  photos: ['assets/loading/mart-1.jpg', 'assets/loading/mart-2.jpg', 'assets/loading/mart-3.jpg'],
  bounds: { hx: 42, hz: 34 },   // wider side lanes: the parking strip (+z) and the service alley (-z)
  spawns2: [
    // tight two-by-four blocks, like a real FPS spawn: A by the street at the far end of the lot, B in the loading yard by the stockroom roll-up
    [[-40.6, -3.3], [-40.6, -1.1], [-40.6, 1.1], [-40.6, 3.3], [-38.6, -3.3], [-38.6, -1.1], [-38.6, 1.1], [-38.6, 3.3]],
    [[38.5, 14.6], [38.5, 16.8], [38.5, 19.0], [38.5, 21.2], [36.5, 14.6], [36.5, 16.8], [36.5, 19.0], [36.5, 21.2]],
  ],
  pickups: [
    { type: 'health', pos: [-2.5, 0, 3] },
    { type: 'health', pos: [13.5, 0, -6.8] },
    { type: 'health', pos: [-14, 0, 23] },
    { type: 'ammo', pos: [-13, 0, -4] },
    { type: 'ammo', pos: [9, 0, 6.5] },
    { type: 'ammo', pos: [-2.5, 0, -21] },
    { type: 'ammo', pos: [0, 0, 22.2] },
    { type: 'ammo', pos: [-14.6, 3.2, -18.3] },   // upstairs break room
  ],
  build,
};

// ---------- canvas textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
// clipped privet/boxwood: a dense mat of small leaves in mixed greens with darker gaps
function hedgeTex() {
  const r = rng(77);
  return canvasTex(256, 256, (g, W, Hh) => {
    g.fillStyle = '#1f3315'; g.fillRect(0, 0, W, Hh);
    const cols = ['#2f4f1f', '#3b5f26', '#4a7030', '#55803a', '#3f6a2a', '#6a8f45', '#2a4419'];
    for (let i = 0; i < 2600; i++) {
      const x = r() * W, y = r() * Hh, a = r() * Math.PI, l = 3 + r() * 5;
      g.fillStyle = cols[(r() * cols.length) | 0];
      for (const dx of [-W, 0, W]) for (const dy of [-Hh, 0, Hh]) { g.beginPath(); g.ellipse(x + dx, y + dy, l, l * 0.45, a, 0, Math.PI * 2); g.fill(); }
    }
  });
}
// frosted glass: a soft milky gradient with faint streaks
function frostTex() {
  const r = rng(5);
  return canvasTex(256, 256, (g, W, Hh) => {
    const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, '#eef3f6'); gr.addColorStop(1, '#d4dde2');
    g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`; g.fillRect(r() * W, r() * Hh, 1 + r() * 3, 1 + r() * 3); }
  });
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PACK = ['#c8322b', '#e8b62a', '#2f6db0', '#2f8a4a', '#e8e2d2', '#f07a1e', '#6a3a8a', '#1c1c1c', '#3aa0c8', '#b8a07a', '#d84a7a', '#8ab83a'];
// one shelf's worth of packaged goods, tiled every metre: cereal boxes, cans, jars, bottles
function goodsTex(kind, seed) {
  const r = rng(seed);
  return canvasTex(512, 160, (g, W, Hh) => {
    g.fillStyle = '#16120e'; g.fillRect(0, 0, W, Hh); // shadowed back of the shelf
    let x = 2;
    while (x < W - 8) {
      const col = PACK[(r() * PACK.length) | 0], col2 = PACK[(r() * PACK.length) | 0];
      if (kind === 'box') {
        const w = 34 + r() * 30, h = Hh * (0.62 + r() * 0.34);
        const n = Math.max(1, Math.round(r() * 2));
        for (let k = 0; k < n && x + w < W; k++) {
          g.fillStyle = col; g.fillRect(x, Hh - h, w - 2, h);
          g.fillStyle = col2; g.fillRect(x, Hh - h + h * 0.12, w - 2, h * 0.16);
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(x + w / 2, Hh - h * 0.42, w * 0.28, h * 0.16, 0, 0, 7); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w - 6, Hh - h, 4, h);
          x += w;
        }
      } else if (kind === 'can') {
        const w = 20 + r() * 8, h = Hh * (0.42 + r() * 0.2);
        for (let k = 0; k < 4 && x + w < W; k++) {
          const grd = g.createLinearGradient(x, 0, x + w, 0);
          grd.addColorStop(0, '#222'); grd.addColorStop(0.3, col); grd.addColorStop(0.55, '#f4f0e8'); grd.addColorStop(0.7, col); grd.addColorStop(1, '#111');
          g.fillStyle = grd; g.fillRect(x, Hh - h, w - 1.5, h);
          g.fillStyle = col2; g.fillRect(x, Hh - h * 0.62, w - 1.5, h * 0.22);
          g.fillStyle = '#b8b8b0'; g.fillRect(x, Hh - h - 2, w - 1.5, 3);
          // a second can stacked on top
          g.fillStyle = grd; g.fillRect(x, Hh - 2 * h - 3, w - 1.5, h);
          g.fillStyle = col2; g.fillRect(x, Hh - h * 1.62 - 3, w - 1.5, h * 0.22);
          x += w;
        }
      } else { // bottles
        const w = 22 + r() * 10, h = Hh * (0.7 + r() * 0.26);
        for (let k = 0; k < 3 && x + w < W; k++) {
          const neck = w * 0.32;
          g.fillStyle = col; g.fillRect(x + 2, Hh - h * 0.72, w - 4, h * 0.72);
          g.fillRect(x + (w - neck) / 2, Hh - h, neck, h * 0.3);
          g.fillStyle = '#eee9dc'; g.fillRect(x + 2, Hh - h * 0.5, w - 4, h * 0.2);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 5, Hh - h * 0.7, 3, h * 0.6);
          x += w;
        }
      }
      x += 2 + r() * 6;
    }
    // shelf-edge shadow at the top
    const grd = g.createLinearGradient(0, 0, 0, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.7)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, 30);
  });
}
function produceTex() {
  const r = rng(77);
  const fruit = [['#c8322b', 16], ['#e8b62a', 15], ['#5a9a2a', 15], ['#f07a1e', 16], ['#6a2a5a', 12], ['#2f7a2a', 22], ['#e8d24a', 13], ['#9a1a1a', 11]];
  return canvasTex(256, 256, (g, W, Hh) => {
    g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, W, Hh);
    // four crates of different fruit per tile
    for (let q = 0; q < 4; q++) {
      const [col, rad] = fruit[(q * 3 + 1) % fruit.length];
      const ox = (q % 2) * 128, oy = ((q / 2) | 0) * 128;
      for (let i = 0; i < 70; i++) {
        const x = ox + 6 + r() * 116, y = oy + 6 + r() * 116, rr = rad * (0.75 + r() * 0.3) * 0.6;
        const grd = g.createRadialGradient(x - rr * 0.35, y - rr * 0.35, rr * 0.1, x, y, rr);
        grd.addColorStop(0, '#fff8e8'); grd.addColorStop(0.25, col); grd.addColorStop(1, 'rgba(0,0,0,0.6)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      }
      g.strokeStyle = '#2a1c10'; g.lineWidth = 5; g.strokeRect(ox + 2, oy + 2, 124, 124);
    }
  });
}
// store floor: 30 cm vinyl composition tiles, cream with the odd grey one, scuffed
function floorTex() {
  const r = rng(13);
  return canvasTex(256, 256, (g, W) => {
    const n = 4, s = W / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = r() < 0.12 ? 196 : 232 + (r() - 0.5) * 10;
      g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(120,110,95,${r() * 0.12})`; g.fillRect(i * s + r() * s, j * s + r() * s, 1 + r() * 3, 1 + r() * 2); }
    }
    g.strokeStyle = 'rgba(110,100,90,0.6)'; g.lineWidth = 1.5;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, W); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(W, i * s); g.stroke(); }
  });
}
function chainTex() {
  return canvasTex(64, 64, (g, W) => {
    g.clearRect(0, 0, W, W);
    g.strokeStyle = 'rgba(190,195,200,1)'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(W, W); g.moveTo(W, 0); g.lineTo(0, W);
    g.moveTo(-W / 2, W / 2); g.lineTo(W / 2, -W / 2); g.moveTo(W / 2, W * 1.5); g.lineTo(W * 1.5, W / 2);
    g.stroke();
  });
}
function signTex(lines, { bg = '#1f4e8a', fg = '#ffffff', w = 512, h = 128, font = 'bold 72px Arial', border = null } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    else g.clearRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const L = Array.isArray(lines) ? lines : [lines];
    g.font = font;
    L.forEach((t, i) => g.fillText(t, w / 2, h * (i + 1) / (L.length + 1) + 2));
  });
}
// neon tube lettering on a transparent background: a coloured halo, the tube, a hot white core
function neonTex(text, color, { w = 1024, h = 220, font = 'bold 130px Arial' } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font; g.lineJoin = 'round';
    g.shadowColor = color;
    for (const [lw, blur, col] of [[14, 40, color], [9, 18, color], [3, 4, '#ffffff']]) {
      g.shadowBlur = blur; g.lineWidth = lw; g.strokeStyle = col;
      g.strokeText(text, w / 2, h / 2 + 4);
    }
  });
}
// spray-painted tag: fat outlined letters, a fill colour, highlights and drips (made-up crew names)
function graffitiTex(word, seed) {
  const r = rng(seed);
  const fills = ['#e83a7a', '#2ab8d8', '#f0c020', '#7ad83a', '#f06a1a', '#9a5ae8'];
  const fill = fills[(r() * fills.length) | 0], fill2 = fills[(r() * fills.length) | 0];
  return canvasTex(1024, 384, (g, W, Hh) => {
    g.clearRect(0, 0, W, Hh);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const size = Math.min(230, 1700 / word.length);
    g.font = `italic 900 ${size}px "Arial Black", Impact, sans-serif`;
    g.save(); g.translate(W / 2, Hh / 2); g.rotate((r() - 0.5) * 0.12);
    // overspray halo
    g.shadowColor = fill; g.shadowBlur = 30; g.lineWidth = 34; g.strokeStyle = 'rgba(20,20,24,0.9)'; g.strokeText(word, 0, 0);
    g.shadowBlur = 0; g.lineWidth = 16; g.strokeStyle = '#f4f4f0'; g.strokeText(word, 0, 0);
    const grd = g.createLinearGradient(0, -size / 2, 0, size / 2); grd.addColorStop(0, fill); grd.addColorStop(1, fill2);
    g.fillStyle = grd; g.fillText(word, 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-W * 0.3, -size * 0.2, W * 0.6, size * 0.05);
    g.restore();
    // drips
    for (let i = 0; i < 14; i++) {
      const x = W * (0.15 + r() * 0.7), y = Hh * (0.6 + r() * 0.1), l = 20 + r() * 90;
      g.fillStyle = fill; g.fillRect(x, y, 4 + r() * 3, l); g.beginPath(); g.arc(x + 3, y + l, 4, 0, 7); g.fill();
    }
    // a few stars / bubbles around it
    for (let i = 0; i < 6; i++) { g.strokeStyle = '#f4f4f0'; g.lineWidth = 5; g.beginPath(); g.arc(r() * W, r() * Hh, 8 + r() * 14, 0, 7); g.stroke(); }
  });
}
// coloured accent tiles for the main cross aisle: a band of teal, orange and yellow squares
function accentTex() {
  const r = rng(5);
  return canvasTex(256, 256, (g, W) => {
    const n = 4, s = W / n, cols = ['#1aa59a', '#f08a2a', '#f2c63a', '#e8e2d2', '#1aa59a', '#e8e2d2'];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = cols[(i + j * 2 + ((r() * 2) | 0)) % cols.length]; g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(60,50,40,${r() * 0.12})`; g.fillRect(i * s + r() * s, j * s + r() * s, 2, 2); }
    }
    g.strokeStyle = 'rgba(90,80,70,0.6)'; g.lineWidth = 1.5;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, W); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(W, i * s); g.stroke(); }
  });
}

// ---------- the build ----------
function build(ctx) {
  const { M, B, put, solid, plane, decal, glows, group, buildCar, physics, addKind } = ctx;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  // materials for this map (added to M so they're disposed with the map)
  Object.assign(M, {
    vinyl: std({ map: floorTex(), roughness: 0.7, metalness: 0.0, color: 0xb4afa6 }),
    shelf: std({ color: 0xdedcd6, roughness: 0.45, metalness: 0.55 }),
    steelK: std({ color: 0xa9aeb3, roughness: 0.3, metalness: 0.85 }),
    cardboard: std({ color: 0xa88358, roughness: 0.92 }),
    bread: std({ color: 0xb87a3e, roughness: 0.75 }),
    crust: std({ color: 0x8a4f22, roughness: 0.6 }),
    ovenGlow: new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff7a2a, emissiveIntensity: 3.5 }),
    coolLight: new THREE.MeshStandardMaterial({ color: 0xe8f2ff, emissive: 0xe8f2ff, emissiveIntensity: 2.4 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x5a9ad8, emissiveIntensity: 1.6 }),
    fabric: std({ color: 0x5a6068, roughness: 0.95 }),
    clearGlass: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xd8e8f0, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.2, depthWrite: false, envMapIntensity: 2 }),
    fence: new THREE.MeshStandardMaterial({ vertexColors: true, map: chainTex(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.45 }),
    produce: std({ map: produceTex(), roughness: 0.6 }),
    goodsBox: std({ map: goodsTex('box', 3), roughness: 0.55 }), goodsBox2: std({ map: goodsTex('box', 9), roughness: 0.55 }),
    goodsCan: std({ map: goodsTex('can', 5), roughness: 0.4, metalness: 0.2 }),
    goodsBottle: std({ map: goodsTex('bottle', 7), roughness: 0.25 }),
    accent: std({ map: accentTex(), roughness: 0.3 }),
    skyGlow: new THREE.MeshStandardMaterial({ color: 0x8aa0c0, emissive: 0x8aa4cc, emissiveIntensity: 1.25, roughness: 0.2 }),
    roofGlass: new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.08, metalness: 0.6, envMapIntensity: 2 }),
    coldPanel: std({ color: 0xe4ecef, roughness: 0.4, metalness: 0.15 }),
    frost: new THREE.MeshStandardMaterial({ color: 0xd8f0ff, emissive: 0x9ad0ff, emissiveIntensity: 2.2 }),
    hedge: std({ map: hedgeTex(), roughness: 0.95 }),
    // shop windows: frosted, lit a little from inside, armoured (bullets stop)
    frostGlass: new THREE.MeshStandardMaterial({ vertexColors: true, map: frostTex(), color: 0xe4ecf0, transparent: true, opacity: 0.86, roughness: 0.6, metalness: 0.05, emissive: 0x8a9aa4, emissiveIntensity: 0.25 }),
  });
  ctx.S.accent = 1.2;
  ctx.S.vinyl = 1.2; ctx.S.hedge = 1.4; ctx.S.frostGlass = 3.0; // metres per floor texture (4 x 4 tiles of 30 cm)
  // photo tile sets (uploaded) where available, procedural otherwise
  const T_ = ctx.tex, tile = (k, o = {}) => (T_[k] && T_[k].photo ? ctx.pbr(T_[k], { roughness: 1, ...o }) : null);
  M.storeFloor = tile('storefloor', { roughness: 1, color: 0xc4bfb6 }) || M.vinyl;
  M.bakeryFloor = tile('terracotta') || M.tile;
  M.subway = tile('subway');
  M.hexblack = tile('hexblack');
  M.checker = tile('checker');
  M.marble = tile('marble');
  M.octagon = tile('octagon');
  M.whitetile = tile('whitetile');
  Object.assign(ctx.S, { storeFloor: 3.6, bakeryFloor: 3.0, subway: 1.4, hexblack: 1.0, checker: 3.0, marble: 3.6, octagon: 1.8, whitetile: 1.6 });
  const GOODS = [M.goodsBox, M.goodsCan, M.goodsBox2, M.goodsBottle];
  // solid + dressed box (bottom at y)
  const SB = (mat, w, h, d, x, y, z, opts = {}, surf = 'concrete') => { solid(x, z, w, d, h, y, surf); B(mat, w, h, d, x, y, z, 0, opts); };
  const P = (geo, mat, x, y, z, ry = 0, opts = {}) => put(geo, mat, x, y, z, ry, { grime: 0, ...opts });
  // a clipped hedge from (x0,z0) to (x1,z1): soft-edged box with a leaf texture and a slightly uneven top
  const hedge = (x0, z0, x1, z1, h = 1.1, t = 0.8, col = true, y0 = 0) => {   // col: solid (you can't walk into a hedge)
    const L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, seg = L / n + 0.05, hh = h * (0.96 + ((i * 37) % 7) * 0.012);
      const g = new RoundedBoxGeometry(seg, hh, t, 2, Math.min(0.14, t * 0.2));
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * seg / 1.4, uv.getY(k) * hh / 1.4);
      P(g, M.hedge, x0 + (x1 - x0) * f, y0 + hh / 2, z0 + (z1 - z0) * f, ry, { cast: true, tint: [0xffffff, 0xeef4e8, 0xf4f8ee][i % 3] });
    }
    if (col) solid(cx, cz, Math.abs(x1 - x0) || t, Math.abs(z1 - z0) || t, h, y0, 'cloth').pass = false;
  };
  // vertical textured plane facing +z (ry rotates it), uv tiled every `tile` metres
  const face = (mat, w, h, x, y, z, ry, tile = 1) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i));
    P(g, mat, x, y, z, ry, { cast: false });
  };
  const signs = []; // unbatched: [mesh]
  const signMesh = (tex, w, h, x, y, z, ry, emissive = 0.9, opts = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: emissive, roughness: 0.6, transparent: !!opts.transparent, side: opts.double ? THREE.DoubleSide : THREE.FrontSide }));
    m.position.set(x, y, z); m.rotation.y = ry;
    if (opts.noMinimap) m.userData.noMinimap = true;
    group.add(m); signs.push(m);
    return m;
  };
  // neon sign with an optional dark backing board (ry faces the reader)
  const neon = (text, color, w, h, x, y, z, ry, board = true, font) => {
    const m = signMesh(neonTex(text, color, font ? { font } : {}), w, h, x, y, z, ry, 2.6, { transparent: true, noMinimap: true });
    m.material.depthWrite = false;
    if (board) {
      const g = new THREE.BoxGeometry(w * 0.96, h * 0.8, 0.05);
      const bm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.3 }));
      bm.position.set(x - Math.sin(ry) * 0.04, y, z - Math.cos(ry) * 0.04); bm.rotation.y = ry;
      bm.userData.noMinimap = true; group.add(bm); signs.push(bm);
    }
    return m;
  };
  // things above head height and the upstairs floor: merged per material into their own meshes so the
  // minimap (which looks down through the roof) shows the ground floor
  const over = new Map();
  const U = (geo, mat, x, y, z, ry = 0, tint = 0xffffff) => {
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    const c = new THREE.Color(tint), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (!over.has(mat)) over.set(mat, []);
    over.get(mat).push(geo);
  };
  // box (bottom at y) with world-scale UVs
  const UB = (mat, w, h, d, x, y, z, tint = 0xffffff) => U(ctx.worldBox(w, h, d, ctx.scaleOf(mat) || 1), mat, x, y + h / 2, z, 0, tint);
  const UF = (mat, w, d, x, y, z, sc) => { // floor plane, uv every sc metres
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / sc, uv.getY(i) * d / sc);
    U(g, mat, x, y, z);
  };
  // a piece of a CC-BY prop pack (props.js), base at y, turned by ry: batched with the ground floor, or (up)
  // merged with the upstairs so the minimap doesn't show it
  const model = (pc, x, y, z, ry = 0, up = false) => {
    for (const { geo, mat } of pc.parts) up ? U(geo.clone(), mat, x, y, z, ry) : P(geo.clone(), mat, x, y, z, ry, { cast: true });
  };
  // street signs on posts (sign front faces +z before the turn): the pole stops you, bullets pass it
  const signPost = (n, x, z, ry) => {
    const pc = propFit('signs', new RegExp(`^(Box|Cylinder)0*${n}_`), 'y', 2.6);
    if (!pc) return;
    model(pc, x, 0, z, ry);
    solid(x, z, 0.12, 0.12, 2.0, 0, 'metal').pass = true;
  };
  const flushOver = () => {
    for (const [mat, list] of over) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.userData.noMinimap = true; m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
  };
  // a straight flight of stairs climbing along +z or +x from (x, z) at the bottom edge.
  // concrete flights are solid underneath; metal ones are open treads you can (mostly) walk under.
  const flight = (x, z, axis, n, rise, run, w, metal) => {
    const L = n * run, ang = Math.atan2(rise, run), slope = Math.hypot(L, n * rise);
    for (let k = 1; k <= n; k++) {
      const along = (k - 0.5) * run;
      const cx = axis === 'z' ? x : x + along, cz = axis === 'z' ? z + along : z;
      const sw = axis === 'z' ? w : run, sd = axis === 'z' ? run : w, top = k * rise;
      if (metal) {
        solid(cx, cz, sw, sd, 0.08, top - 0.08, 'metal');
        U(new THREE.BoxGeometry(sw, 0.05, sd), M.steelK, cx, top - 0.025, cz, 0, 0x6a6e72);
        U(new THREE.BoxGeometry(axis === 'z' ? sw : 0.03, 0.04, axis === 'z' ? 0.03 : sd), M.paint, axis === 'z' ? cx : cx + run / 2 - 0.02, top - 0.02, axis === 'z' ? cz + run / 2 - 0.02 : cz, 0, 0xe8c020); // nosing
      } else {
        solid(cx, cz, sw, sd, top, 0, 'concrete');
        B(M.concrete, sw, top, sd, cx, 0, cz, 0, { tint: 0xc8c4bc, grime: 0.15 });
        B(M.paint, axis === 'z' ? sw : 0.05, 0.012, axis === 'z' ? 0.05 : sd, axis === 'z' ? cx : cx + run / 2 - 0.03, top, axis === 'z' ? cz + run / 2 - 0.03 : cz, 0, { tint: 0xe8c020, grime: 0 });
      }
    }
    // stringers (metal) and handrails both sides
    const mid = (s) => axis === 'z' ? [x + s * w / 2, z + L / 2] : [x + L / 2, z + s * w / 2];
    for (const s of [-1, 1]) {
      const [mx, mz] = mid(s);
      const rail = (len, th, y, mat, tint) => {
        const g = new THREE.BoxGeometry(axis === 'z' ? th : len, th, axis === 'z' ? len : th);
        if (axis === 'z') g.rotateX(-ang); else g.rotateZ(ang);
        U(g, mat, mx, y, mz, 0, tint);
      };
      if (metal) rail(slope, 0.06, n * rise / 2 - 0.1, M.paint, 0x3a4048);
      rail(slope, 0.045, n * rise / 2 + 0.95, M.steelK, 0x9aa0a6);
      for (let k = 0; k <= n; k += Math.max(2, n >> 2)) {
        const t = (k + 0.5) * run, px = axis === 'z' ? mx : x + t, pz = axis === 'z' ? z + t : mz;
        U(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 6), M.steelK, px, (k + 0.5) * rise + 0.47, pz, 0, 0x9aa0a6);
      }
    }
  };

  // ---------- ground ----------
  plane(M.dirt, 300, 300, 0, 0, -0.01);
  plane(M.asphalt, 20.4, 69, -32.2, 0, 0.0);                 // parking lot
  plane(M.concrete, 20, 69, 32.4, 0, 0.004);                  // delivery yard
  for (const sz of [-1, 1]) plane(M.concrete, 44.8, 10, 0, sz * 29.2, 0.003);  // side lanes
  plane(M.storeFloor, 44, 48, 0, 0, 0.01, 0, 0x9c978e);        // sales floor (toned down: it read as blinding white)
  if (M.marble) { plane(M.marble, 3.6, 7.2, -20.2, -19, 0.016); plane(M.marble, 3.6, 7.2, -20.2, 18.6, 0.016); } // entrance halls
  // coloured accent tiles: two bands down the cross aisle and a square under the promo display
  plane(M.accent, 1.2, 31, -2.6, -6.6, 0.017);
  // front sidewalk + curb
  plane(M.tile, 3, 69, -23.9, 0, 0.02);
  B(M.concrete, 0.25, 0.14, 49, -25.5, 0, 0, 0, { grime: 0.2, cast: false });
  // parking stall lines: two rows, cars nose-in
  for (let z = -27; z <= 27; z += 2.8) for (const x of [-30.2, -34.8]) P(new THREE.PlaneGeometry(4.6, 0.12), M.line, x, 0.02, z, 0, { rx: -Math.PI / 2, cast: false, tint: 0xe8e4d8 });
  for (const x of [-27.4, -37.6]) P(new THREE.PlaneGeometry(0.15, 58), M.line, x, 0.02, 0, 0, { rx: -Math.PI / 2, cast: false, tint: 0xd8c050 });
  for (const z of [-24, -8, 8, 24]) P(new THREE.PlaneGeometry(1.4, 2.2), M.line, -26.2, 0.02, z, Math.PI / 2, { rx: -Math.PI / 2, cast: false, tint: 0xe8e4d8 }); // arrows (blocks)

  // ---------- walls ----------
  // wall along x (z const) or z (x const); opens: [a, b, top, bottom, glass] in metres along the wall from (x0,z0)
  const wallLine = (x0, z0, x1, z1, h, t, opens, mat, tint, surf = 'concrete', outer = null, base = 0) => {
    const alongX = z0 === z1, L = Math.abs(alongX ? x1 - x0 : z1 - z0), sgn = Math.sign(alongX ? x1 - x0 : z1 - z0);
    const piece = (a, b, y0, y1, m = mat, s = surf, tn = tint) => {
      if (b - a < 0.02 || y1 - y0 < 0.02) return;
      const mid = (a + b) / 2;
      const x = alongX ? x0 + sgn * mid : x0, z = alongX ? z0 : z0 + sgn * mid;
      const w = alongX ? b - a : t, d = alongX ? t : b - a;
      const sb = solid(x, z, w, d, y1 - y0, y0 + base, s);
      // shop windows are frosted armoured glass: they stop bullets and sight
      B(m, w, y1 - y0, d, x, y0 + base, z, 0, { tint: tn, grime: base ? 0.1 : 0.25, base });
    };
    let cur = 0;
    for (const [a, b, top, bottom = 0, glass = false] of [...opens].sort((p, q) => p[0] - q[0])) {
      piece(cur, a, 0, h);
      piece(a, b, top, h);
      if (bottom > 0) piece(a, b, 0, bottom);
      if (glass) {
        piece(a, b, bottom, top, M.frostGlass, 'glass', 0xffffff);
        // mullions every ~1.5 m
        const n = Math.max(1, Math.round((b - a) / 1.5));
        for (let i = 0; i <= n; i++) {
          const m = a + (b - a) * i / n, x = alongX ? x0 + sgn * m : x0, z = alongX ? z0 : z0 + sgn * m;
          B(M.dark, alongX ? 0.08 : t + 0.04, top - bottom, alongX ? t + 0.04 : 0.08, x, bottom + base, z, 0, { grime: 0 });
        }
      } else if (bottom === 0) {
        // door frame
        for (const e of [a, b]) { const x = alongX ? x0 + sgn * e : x0, z = alongX ? z0 : z0 + sgn * e; B(M.dark, alongX ? 0.08 : t + 0.06, top, alongX ? t + 0.06 : 0.08, x, base, z, 0, { grime: 0 }); }
      }
      cur = b;
    }
    piece(cur, L, 0, h);
    if (outer) outer(alongX, L, sgn);
  };
  const shellTint = 0xd8cfbf;
  // front: two entrances at the corners, a band of shop windows between them
  wallLine(X0 - T / 2, Z0 - T, X0 - T / 2, Z1 + T, H, T, [
    [3.4, 7.4, 3.2], [9.5, 14.5, 3.4, 0.7, true], [15.5, 23.9, 3.4, 0.7, true], [24.9, 33.9, 3.4, 0.7, true], [34.9, 38.9, 3.4, 0.7, true], [41, 45, 3.2],
  ], M.concrete, shellTint);
  // back: the kitchen's staff door, the receiving dock roll-up, the stockroom roll-up onto the yard
  wallLine(X1 + T / 2, Z0 - T, X1 + T / 2, Z1 + T, H, T, [[5.0, 6.6, 2.3], [21.4, 25.6, 3.6], [41.4, 45.4, 3.2]], M.concrete, shellTint);
  // sides: a fire exit each
  wallLine(X0, Z1 + T / 2, X1, Z1 + T / 2, H, T, [[18.4, 20, 2.3]], M.concrete, shellTint);
  wallLine(X0, Z0 - T / 2, X1, Z0 - T / 2, H, T, [[8.2, 9.8, 5.4, 3.2], [18, 19.6, 2.3]], M.concrete, shellTint);   // the break room's door to the outside stair, the kitchen's alley door
  // brick wainscot outside, metal coping at the top
  for (const [x, z, w, d] of [[X0 - T - 0.03, 0, 0.06, 48.8], [X1 + T + 0.03, 0, 0.06, 48.8], [0, Z1 + T + 0.03, 44.8, 0.06], [0, Z0 - T - 0.03, 44.8, 0.06]]) {
    B(M.metal, w + 0.06, 0.25, d + 0.06, x, H - 0.25, z, 0, { tint: 0x5a5e62, grime: 0 });
  }
  // ---------- the outside of the building ----------
  // brick base (stopping at every door), brick piers, a stone cap, a dark fascia band with a green stripe
  // and a raised parapet out front, wall lights, downspouts
  const OUT = 0.03;
  const outerRun = (side, a0, a1, gaps, fn) => {   // side: 'F' front (-x), 'K' back (+x), 'R' +z, 'L' -z; a = coordinate along the wall
    let cur = a0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[a1, a1]])) { if (g0 - cur > 0.05) fn(cur, g0); cur = Math.max(cur, g1); }
  };
  const along = (side, a0, a1, h, y, mat, opts, depth = 0.06) => {
    const L = a1 - a0, c = (a0 + a1) / 2;
    if (side === 'F') B(mat, depth, h, L, X0 - T - depth / 2 + 0.005, y, c, 0, opts);
    else if (side === 'K') B(mat, depth, h, L, X1 + T + depth / 2 - 0.005, y, c, 0, opts);
    else B(mat, L, h, depth, c, y, (side === 'R' ? Z1 + T + depth / 2 - 0.005 : Z0 - T - depth / 2 + 0.005), 0, opts);
  };
  const doorsOn = {
    F: [[-21, -17], [16.6, 20.6]],
    K: [[-19.4, -17.8], [-2.6, 1.6], [17, 21]],
    R: [[-3.6, -2]],
    L: [[-4, -2.4]],
  };
  const upperDoors = { L: [[-13.8, -12.2]] };
  const spanOf = { F: [-24.4, 24.4], K: [-24.4, 24.4], R: [-22.4, 22.4], L: [-22.4, 22.4] };
  for (const side of ['F', 'K', 'R', 'L']) {
    const [a0, a1] = spanOf[side], wh = side === 'F' ? 0.7 : 1.1;
    outerRun(side, a0, a1, doorsOn[side], (p, q) => {
      if (side === 'R') along(side, p, q, H - 1.1, 0, M.brick, { grime: 0.25 }, 0.07);   // the street side is all brick, like the concept
      along(side, p, q, wh, 0, M.brick, { grime: 0.3 }, 0.08);
      along(side, p, q, 0.08, wh, M.concrete, { tint: 0xd8d2c4, grime: 0.15 }, 0.14);   // stone cap
    });
    // fascia band and stripe up top
    outerRun(side, a0, a1, upperDoors[side] || [], (p, q) => {
      along(side, p, q, 0.9, H - 0.95, M.paint, { tint: 0x30363c, grime: 0.05 }, 0.1);
      along(side, p, q, 0.12, H - 1.1, M.paint, { tint: 0x2f8a4a, grime: 0 }, 0.12);
    });
    // brick piers every ~6 m (skipping openings)
    for (let a = a0 + 0.3; a <= a1 - 0.2; a += (a1 - a0 - 0.6) / 8) {
      if (doorsOn[side].concat(upperDoors[side] || []).some(([g0, g1]) => a > g0 - 0.5 && a < g1 + 0.5)) continue;
      if (side === 'F' && Math.abs(a) < 15.3 && Math.abs(a) > 0) continue;   // not across the shop windows
      along(side, a - 0.3, a + 0.3, H - 1.1, 0, M.brick, { grime: 0.25 }, 0.2);
    }
  }
  // front parapet: raised 1 m over the entrances with the store name on it
  for (const z of [-19, 18.6]) {
    B(M.paint, 0.3, 1.1, 6.2, X0 - T - 0.15, H - 0.1, z, 0, { tint: 0x30363c, grime: 0.05 });
    B(M.metal, 0.4, 0.1, 6.3, X0 - T - 0.15, H + 1.0, z, 0, { tint: 0x5a5e62, grime: 0 });
    // steel canopy over the doors, hung on tie rods
    const cw = 6.0, cd = 2.2, cy = 4.0;
    solid(X0 - T - cd / 2, z, cd, cw, 0.18, cy, 'metal');
    B(M.paint, cd, 0.18, cw, X0 - T - cd / 2, cy, z, 0, { tint: 0x30363c, grime: 0.1 });
    B(M.paint, 0.05, 0.08, cw, X0 - T - cd + 0.03, cy + 0.18, z, 0, { tint: 0x2f8a4a, grime: 0 });
    for (const dz of [-2.4, 0, 2.4]) {
      P(new THREE.BoxGeometry(0.3, 0.02, 0.3), M.lamp, X0 - T - cd / 2, cy - 0.01, z + dz);
      glows.push([X0 - T - cd / 2, cy - 0.05, z + dz, 0.5]);
    }
    for (const dz of [-2.6, 2.6]) {
      const g = new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(cd, 1.9), 5); g.rotateZ(Math.atan2(cd, 1.9));
      P(g, M.steelK, X0 - T - cd / 2, cy + 1.0, z + dz);
    }
  }
  // wall packs on the sides and back, downspouts at the corners
  for (const a of [-16, -6, 6, 16]) for (const side of ['R', 'L']) {
    const z = side === 'R' ? Z1 + T + 0.15 : Z0 - T - 0.15;
    P(new THREE.BoxGeometry(0.4, 0.3, 0.25), M.dark, a, 4.1, z);
    P(new THREE.BoxGeometry(0.32, 0.03, 0.18), M.lamp, a, 3.94, z);
    glows.push([a, 3.9, z, 0.6]);
  }
  for (const z of [-12, 8, 22]) { P(new THREE.BoxGeometry(0.25, 0.3, 0.4), M.dark, X1 + T + 0.15, 4.4, z); glows.push([X1 + T + 0.2, 4.25, z, 0.6]); }
  for (const [x, z] of [[X0 - T - 0.1, Z0 - T - 0.1], [X0 - T - 0.1, Z1 + T + 0.1], [X1 + T + 0.1, Z0 - T - 0.1], [X1 + T + 0.1, Z1 + T + 0.1]]) {
    P(new THREE.BoxGeometry(0.12, H, 0.12), M.paint, x, H / 2, z, 0, { tint: 0x5a5e62 });
    P(new THREE.BoxGeometry(0.3, 0.1, 0.12), M.paint, x + Math.sign(-x) * 0.12, 0.05, z, 0, { tint: 0x5a5e62 });
  }
  // roof: its own meshes (cast shadows, hidden on the minimap)
  const roofGeo = [], ceilGeo = [];
  const rb = new THREE.BoxGeometry(44.8, 0.35, 48.8); rb.translate(0, H + 0.175, 0); roofGeo.push(rb);
  solid(0, 0, 44.8, 48.8, 0.35, H, 'concrete');
  // exposed ceiling: steel trusses, ducts and light fixtures
  for (let x = -18; x <= 18; x += 6) { const g = new THREE.BoxGeometry(0.25, 0.5, 48); g.translate(x, H - 0.25, 0); ceilGeo.push(g); }
  for (const z of [-12, 12]) { const g = new THREE.CylinderGeometry(0.35, 0.35, 32, 12); g.rotateZ(Math.PI / 2); g.translate(-5, H - 0.9, z); ceilGeo.push(g); }
  const fixGeo = [];
  for (let x = -19; x <= 7; x += 4.3) for (let z = -21; z <= 21; z += 5.4) { if (z < -16 && x < 10.5) continue; const g = new THREE.BoxGeometry(2.4, 0.06, 0.32); g.translate(x, H - 1.25, z); fixGeo.push(g); }
  for (const [x, z] of [[-9, -21.7], [-4, -21.7], [2, -21.7], [7.5, -21.7], [12.5, -14], [18.5, -16], [18.5, -1], [18.5, 10], [18.5, 19], [11, 4], [11, 16]]) { const g = new THREE.BoxGeometry(1.2, 0.06, 0.6); g.translate(x, z < -19.6 && x < 10 ? 2.98 : H - 1.25, z); fixGeo.push(g); }
  for (const [x, z] of [[-19.5, -21.5], [-19.5, -18.5], [-14.5, -21.5], [-14.5, -18.5]]) { const g = new THREE.BoxGeometry(1.2, 0.06, 0.6); g.translate(x, H - 0.62, z); fixGeo.push(g); } // upstairs
  const roofMesh = new THREE.Mesh(mergeGeometries(roofGeo), std({ color: 0x4a4c50, roughness: 0.9 }));
  const ceilMesh = new THREE.Mesh(mergeGeometries(ceilGeo), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.7 }));
  const fixMesh = new THREE.Mesh(mergeGeometries(fixGeo), M.coolLight);
  roofMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(roofMesh.geometry.attributes.position.count * 3).fill(1), 3));
  for (const m of [roofMesh, ceilMesh, fixMesh]) { m.userData.noMinimap = true; m.castShadow = m !== fixMesh; m.receiveShadow = true; group.add(m); }
  M.roofMat = roofMesh.material; M.ceilMat = ceilMesh.material;
  // store lights (off on Low, like the other maps' lamps)
  for (const [x, z, y = H - 1.5, col = 0xf2f6ff, I = 22, R = 20] of [[-14, -11], [-14, 11], [-1, -12], [-1, 12], [0, -16.5, H - 1.0, 0xfff4e4, 16, 14], [18.5, 8, H - 1.5, 0xf2f6ff, 14, 16], [18.5, -16, H - 1.5, 0xf4f6ff, 10, 12], [2, -21.7, 2.6, 0xcfe6ff, 7, 8]]) {
    const L = new THREE.PointLight(col, I, R, 1.3);
    L.position.set(x, y, z);
    L.userData.mapLight = true;
    group.add(L);
  }

  // skylights: a shallow well through the roof with the dusk sky glowing in it; a glazed curb on top
  for (const [x, z] of [[-9, -18], [-9, -6], [-9, 6], [-9, 18], [3, -18], [3, -6], [3, 6], [3, 18], [15, -17], [-15, 0]]) {
    const S = 2.6;
    const g = new THREE.PlaneGeometry(S - 0.1, S - 0.1); g.rotateX(Math.PI / 2); U(g, M.skyGlow, x, H - 0.02, z);
    for (const [dx, dz, w, d] of [[0, -S / 2, S, 0.08], [0, S / 2, S, 0.08], [-S / 2, 0, 0.08, S], [S / 2, 0, 0.08, S]]) {
      U(new THREE.BoxGeometry(w, 0.32, d), M.paint, x + dx, H - 0.16, z + dz, 0, 0xd8d8d4);
      U(new THREE.BoxGeometry(w + 0.1, 0.3, d + 0.1), M.metal, x + dx, H + 0.5, z + dz, 0, 0x8a9096);
    }
    U(new THREE.BoxGeometry(S - 0.06, 0.04, 0.05), M.dark, x, H - 0.03, z); // mullions
    U(new THREE.BoxGeometry(0.05, 0.04, S - 0.06), M.dark, x, H - 0.03, z);
    const gl = new THREE.BoxGeometry(S, 0.05, S); gl.rotateX(0.06); U(gl, M.roofGlass, x, H + 0.68, z);
  }

  // ---------- checkout lanes (front) ----------
  const checkout = (x, z) => {
    SB(M.paint, 3.2, 0.95, 0.9, x, 0, z, { tint: 0x2f5a3a, grime: 0.1 });
    B(M.rubber, 2.2, 0.03, 0.55, x + 0.4, 0.95, z, 0, { grime: 0 });
    B(M.steelK, 0.7, 0.04, 0.8, x - 1.2, 0.95, z, 0, { grime: 0 });
    // register + screen + card reader
    SB(M.dark, 0.45, 0.32, 0.4, x - 1.1, 0.99, z + 0.2, { grime: 0 }, 'metal');
    const scr = new THREE.BoxGeometry(0.36, 0.26, 0.03); P(scr, M.screen, x - 1.1, 1.48, z + 0.12, 0.3);
    P(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), M.dark, x - 1.5, 1.13, z - 0.3);
    P(new THREE.BoxGeometry(0.1, 0.16, 0.08), M.dark, x - 1.5, 1.35, z - 0.3);
    // impulse rack with sweets, lane light
    SB(M.shelf, 0.5, 1.45, 0.35, x + 1.2, 0, z + 0.62, { grime: 0 }, 'metal');
    for (const y of [0.35, 0.75, 1.15]) for (const s of [1, -1]) face(M.goodsBox2, 0.46, 0.3, x + 1.2, y + 0.15, z + 0.62 + s * 0.181, s > 0 ? 0 : Math.PI, 0.5);
    P(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), M.dark, x - 1.55, 1.65, z + 0.4);
    const lamp = new THREE.BoxGeometry(0.22, 0.22, 0.22); P(lamp, M.lamp, x - 1.55, 2.45, z + 0.4);
    glows.push([x - 1.55, 2.45, z + 0.4, 0.4]);
  };
  for (const z of [-11, -6.6, -2.2, 2.2, 6.6, 11]) checkout(-17.4, z);
  // customer service desk and a cart corral by each entrance
  SB(M.paint, 1.2, 1.05, 4, -20, 0, -14.4, { tint: 0x8a2f2a }, 'wood');
  B(M.wood, 1.3, 0.05, 4.1, -20, 1.05, -14.4, 0, { grime: 0 });
  const carts = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const cx = x + i * 0.38;
      P(new RoundedBoxGeometry(0.9, 0.5, 0.55, 1, 0.03), M.steelK, cx, 0.75, z, 0, { sx: 1 - i * 0.02, sy: 1 - i * 0.02, sz: 1 - i * 0.02 });   // nested: each a touch smaller (no shared faces)
      P(new THREE.BoxGeometry(0.06, 0.04, 0.6), M.paint, cx - 0.5, 1.05, z, 0, { tint: 0xc8322b });
    }
    solid(x + (n - 1) * 0.19, z, (n - 1) * 0.38 + 0.9, 0.7, 0.55, 0.5, 'metal');   // the baskets, first to last: open underneath
  };
  carts(-21.2, 22.6, 5); carts(-21.2, -22.6, 4);
  // neon over the front end: CHECKOUTS above the lanes (both faces), CUSTOMER SERVICE over the desk
  for (const [x, ry] of [[-16.0, Math.PI / 2], [-16.12, -Math.PI / 2]]) neon('CHECKOUTS', '#2ef2d0', 6.4, 1.2, x, 4.25, 0, ry, false);
  B(M.dark, 0.06, 0.9, 6.0, -16.06, 3.8, 0, 0, { grime: 0 });
  for (const z of [-2.6, 2.6]) P(new THREE.CylinderGeometry(0.008, 0.008, 1.3, 4), M.dark, -16.06, 5.35, z);
  neon('CUSTOMER SERVICE', '#2ef2d0', 3.6, 0.55, -21.75, 2.7, -14.4, Math.PI / 2, true, 'bold 110px Arial');
  // shopping-cart pyramid of a display near the front: water packs
  SB(M.cardboard, 1.6, 0.9, 1.2, -14.0, 0, -17, { grime: 0.05 }, 'wood');
  SB(M.goodsBottle, 1.2, 0.6, 0.9, -14.0, 0.9, -17, { grime: 0 }, 'wood');

  // ---------- center store: tall gondola runs front to back, a cross aisle through the middle ----------
  // like a real supermarket: 4 ft sections, six shelves of stock under a row of overstock cases, endcaps
  // at both ends. Rows at 3.3 m centres leave 2.15 m aisles.
  const SH = 2.42, TOP = 2.98;   // shelving height, top of the overstock
  const gondola = (x0, x1, z, goods) => {
    const L = x1 - x0, cx = (x0 + x1) / 2;
    solid(cx, z, L, 1.15, TOP, 0, 'metal');
    B(M.shelf, L, 0.14, 1.1, cx, 0, z, 0, { grime: 0.1, tint: 0x3a3e44 });            // kick base
    B(M.shelf, L, SH - 0.14, 0.06, cx, 0.14, z, 0, { grime: 0 });                      // back panel
    let k = 0;
    for (const y of [0.16, 0.58, 1.0, 1.42, 1.84]) {
      for (const s of [-1, 1]) {
        B(M.shelf, L, 0.03, 0.5, cx, y, z + s * 0.29, 0, { grime: 0 });
        face(goods[(k + (s > 0 ? 0 : 1)) % goods.length], L - 0.04, 0.38, cx, y + 0.22, z + s * 0.5, s > 0 ? 0 : Math.PI, 1);
        B(M.paint, L, 0.035, 0.012, cx, y, z + s * 0.555, 0, { tint: 0xf2e8c0, grime: 0 }); // price strip
      }
      k++;
    }
    // top shelf: bulk packs; then cases of overstock up to the top
    for (const s of [-1, 1]) {
      B(M.shelf, L, 0.03, 0.45, cx, 2.26, z + s * 0.31, 0, { grime: 0 });
      face(goods[(k + 1) % goods.length], L - 0.04, 0.16, cx, 2.36, z + s * 0.5, s > 0 ? 0 : Math.PI, 1);
      for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.66) B(M.cardboard, 0.6, 0.38 + ((x * 13) % 0.18), 0.48, x, SH, z + s * 0.27, 0, { grime: 0.05, tint: (x * 7 | 0) % 2 ? 0xffffff : 0xd8ccb8 });
    }
    // upright at every 4 ft section
    for (let x = x0; x <= x1 + 0.01; x += L / Math.max(1, Math.round(L / 1.22))) B(M.shelf, 0.04, SH, 1.14, x, 0, z, 0, { grime: 0, tint: 0xb8bcc2 });
    // endcaps: a promo stack with a header card
    for (const e of [x0, x1]) {
      const sg = Math.sign(e - cx), ex = e + sg * 0.3;
      SB(M.shelf, 0.6, 1.95, 1.1, ex, 0, z, { grime: 0 }, 'metal');
      for (const y of [0.3, 0.8, 1.3]) face(GOODS[(k++) % 4], 1.0, 0.36, ex + sg * 0.31, y + 0.22, z, sg > 0 ? Math.PI / 2 : -Math.PI / 2, 1);
      B(M.paint, 0.04, 0.32, 1.05, ex + sg * 0.27, 1.98, z, 0, { tint: (k % 3) ? 0xc8322b : 0xe8b62a, grime: 0 });
    }
  };
  // reach-in freezers back to back: glass doors with lit mullions, frost-blue light inside
  const freezerRun = (x0, x1, z) => {
    const L = x1 - x0, cx = (x0 + x1) / 2;
    solid(cx, z, L, 1.6, 2.35, 0, 'metal');
    B(M.shelf, L, 2.35, 1.48, cx, 0, z, 0, { tint: 0x2a2c30, grime: 0 });
    for (const s of [-1, 1]) {
      const fz = z + s * 0.81;
      face(GOODS[Math.abs(x0 * 3 + s + 9 | 0) % 4], L - 0.1, 1.55, cx, 1.1, fz - s * 0.04, s > 0 ? 0 : Math.PI, 1);
      face(M.clearGlass, L - 0.06, 1.85, cx, 1.12, fz + s * 0.005, s > 0 ? 0 : Math.PI, 3);
      for (let x = x0; x <= x1 + 0.01; x += L / Math.round(L / 0.76)) {
        B(M.steelK, 0.05, 1.9, 0.03, x, 0.18, fz, 0, { grime: 0 });
        if (x < x1 - 0.1) B(M.steelK, 0.03, 0.5, 0.04, x + 0.1, 0.95, fz + s * 0.03, 0, { grime: 0 });   // door handle
      }
      P(new THREE.BoxGeometry(L - 0.1, 0.05, 0.04), M.frost, cx, 2.12, fz - s * 0.03);
      B(M.paint, L, 0.3, 0.03, cx, 2.08, fz + s * 0.01, 0, { tint: 0x1f4e8a, grime: 0 });
    }
  };
  const ROWS = [-13.0, -9.7, -6.4, -3.1, 0.2, 3.5, 6.8];   // the alley side is the bakery & deli now
  const LX = [-11.2, -4.4], RX = [-0.8, 6.2];
  ROWS.forEach((z, i) => {
    if (i === 0 || i === 1) { freezerRun(LX[0] - 0.45, LX[1] + 0.45, z); freezerRun(RX[0] - 0.45, RX[1] + 0.45, z); return; }
    const goods = [GOODS[i % 4], GOODS[(i + 1) % 4], GOODS[(i + 2) % 4]];
    gondola(LX[0], LX[1], z, goods);
    gondola(RX[0], RX[1], z, goods);
  });
  // aisle markers: double-sided signs hanging over the cross aisle
  const aisleNames = ['FROZEN · DAIRY', 'CANNED · SOUP', 'PASTA · RICE', 'SNACKS · SODA', 'BAKING · SPICES', 'BREAD · CEREAL', 'HOUSEHOLD'];
  [-11.35, -8.05, -4.75, -1.45, 1.85, 5.15, 8.0].forEach((z, i) => {
    const tex = signTex([`${i + 1}`, aisleNames[i]], { bg: i === 0 ? '#2a6aa8' : '#1f4e8a', fg: '#ffffff', font: 'bold 44px Arial', w: 512, h: 160 });
    for (const s of [0, Math.PI]) signMesh(tex, 2.0, 0.62, -2.6 + (s ? -0.01 : 0.01), 3.85, z, s + Math.PI / 2, 0.6, { noMinimap: true, double: true });   // hanging: seen edge-on and from behind
    P(new THREE.CylinderGeometry(0.01, 0.01, 1.7, 4), M.dark, -2.6, 5.0, z);
  });

  // ---------- produce: islands of loose fruit and veg, a misted wet rack along the wall ----------
  const fruit = makeProduce(group, M, ctx.low);
  // angled display table: wooden bins tipped toward the shopper, each section a different fruit
  const produceTable = (x, z, ry, kinds, w = 2.4, d = 1.3) => {
    SB(M.woodOld, w, 0.72, d, x, 0, z, { tint: 0x7a5a3a, grime: 0.1 }, 'wood');
    solid(x, z, w, d, 1.0, 0, 'wood');
    const n = kinds.length, sw = w / n;
    for (let i = 0; i < n; i++) {
      const sx = x - w / 2 + sw * (i + 0.5);
      fruit.bed(kinds[i], sx, 0.74, z, sw - 0.06, d - 0.08, 0.18);
      if (i) B(M.woodOld, 0.03, 0.18, d, x - w / 2 + sw * i, 0.72, z, 0, { tint: 0x5a3e28, grime: 0 });
    }
    for (const s of [-1, 1]) B(M.woodOld, w, 0.16, 0.04, x, 0.72 + (s > 0 ? 0.12 : 0), z + s * d / 2, 0, { tint: 0x5a3e28, grime: 0 });
    for (const s of [-1, 1]) B(M.paint, 0.35, 0.18, 0.01, x - w / 2 + 0.3 + (s > 0 ? w - 0.6 : 0), 0.62, z - d / 2 - 0.005, 0, { tint: 0xf4f0e0, grime: 0 });  // price cards
  };
  produceTable(-10.6, 11.4, 0, ['apple', 'apple2', 'pear']);
  produceTable(-10.6, 15.2, 0, ['orange', 'lemon', 'lime']);
  produceTable(-6.6, 11.4, 0, ['tomato', 'pepper', 'pepper2']);
  produceTable(-6.6, 15.2, 0, ['avocado', 'onion', 'potato']);
  produceTable(1.4, 11.4, 0, ['peach', 'apple', 'grapefruit']);
  produceTable(1.4, 15.2, 0, ['potato', 'onion', 'orange']);
  produceTable(5.6, 11.4, 0, ['pepper2', 'tomato', 'lemon']);
  produceTable(5.6, 15.2, 0, ['apple2', 'pear', 'peach']);
  // banana tree stand and watermelon / pineapple bins on the cross aisle
  SB(M.woodOld, 1.6, 0.5, 1.0, -2.6, 0, 18.6, { tint: 0x7a5a3a }, 'wood');
  SB(M.woodOld, 1.2, 0.45, 0.7, -2.6, 0.5, 18.75, { tint: 0x6a4a2e }, 'wood');
  fruit.bed('banana', -2.6, 0.52, 18.3, 1.5, 0.35, 0.3);
  fruit.bed('banana', -2.6, 0.97, 18.75, 1.1, 0.6, 0.15);
  for (const [x, z, k] of [[-2.6, 11.6, 'melon'], [-2.6, 14.6, 'pineapple']]) {
    SB(M.cardboard, 1.1, 0.75, 1.1, x, 0, z, { tint: 0x9a7a52, grime: 0.05 }, 'wood');
    B(M.paint, 1.12, 0.22, 1.12, x, 0.3, z, 0, { tint: 0x2f8a4a, grime: 0 });
    fruit.bed(k, x, 0.75, z, 1.0, 1.0, 0);
  }
  // wet rack against the north wall: tiered, misted, leafy greens under a lit canopy
  const greens = [['lettuce', 'broccoli', 'carrot'], ['carrot', 'lettuce', 'pepper'], ['broccoli', 'lettuce', 'tomato'], ['lettuce', 'carrot', 'broccoli'], ['pepper2', 'broccoli', 'lettuce'], ['lettuce', 'carrot', 'broccoli']];
  let gi = 0;
  for (let x = -11; x < 7; x += 3) {
    if (x === -5) continue; // fire exit
    SB(M.shelf, 3, 0.75, 1.0, x + 1.5, 0, 23.5, { tint: 0x2a3a2a, grime: 0 }, 'metal');
    B(M.shelf, 3, 2.2, 0.12, x + 1.5, 0, 23.95, 0, { tint: 0x2a3a2a, grime: 0 });
    const rk = greens[gi++ % greens.length];
    rk.forEach((k, j) => fruit.bed(k, x + 1.5, 0.76 + j * 0.36, 23.35 + j * 0.2, 2.9, 0.38, 0.32));
    for (const j of [1, 2]) B(M.shelf, 3, 0.03, 0.42, x + 1.5, 0.74 + j * 0.36, 23.35 + j * 0.2, 0, { tint: 0x2a3a2a, grime: 0 });
    P(new THREE.BoxGeometry(2.8, 0.04, 0.04), M.coolLight, x + 1.5, 2.05, 23.6);
    B(M.paint, 3, 0.25, 0.5, x + 1.5, 2.1, 23.7, 0, { tint: 0x2f6a2a, grime: 0 });
  }
  const prodSign = signTex('FRESH PRODUCE', { bg: '#2f6a2a', font: 'bold 64px Arial' });
  signMesh(prodSign, 4, 1, -2.6, 3.6, 23.9, Math.PI, 0.6, { noMinimap: true, double: true });
  for (const s of [0, Math.PI]) signMesh(signTex('PRODUCE', { bg: '#2f6a2a', font: 'bold 70px Arial', w: 512, h: 128 }), 2.2, 0.55, -2.6, 3.9, 13.1 + (s ? -0.01 : 0.01), s, 0.6, { noMinimap: true, double: true });
  fruit.flush();
  // front "action alley": a few promo pallets, staggered so the front isn't one long lane
  SB(M.cardboard, 1.4, 1.5, 1.4, -14.2, 0, 2.5, {}, 'wood');
  SB(M.cardboard, 1.2, 1.2, 1.2, -14.0, 0, 17.6, {}, 'wood');
  SB(M.cardboard, 1.4, 1.3, 1.2, -13.9, 0, -8.5, {}, 'wood');
  face(M.goodsBox, 1.3, 0.6, -13.9, 0.7, -7.89, 0, 1);

  const inner = 0xe0dcd2;
  const rack = (x0, x1, z) => {
    const L = x1 - x0, cx = (x0 + x1) / 2;
    solid(cx, z, L, 1.0, 3.6, 0, 'metal').pass = true;   // open racking with cardboard: you can see and shoot through the gaps
    for (let x = x0; x <= x1 + 0.01; x += L / 2) for (const dz of [-0.45, 0.45]) B(M.paint, 0.08, 3.6, 0.08, x, 0, z + dz, 0, { tint: 0x2e5a9a, grime: 0.1 });
    for (const y of [0.15, 1.35, 2.55]) {
      for (const dz of [-0.45, 0.45]) B(M.paint, L, 0.1, 0.06, cx, y, z + dz, 0, { tint: 0xe07020, grime: 0.1 });
      B(M.wood, L - 0.1, 0.12, 0.95, cx, y + 0.1, z, 0, { tint: 0xc8a878, grime: 0.2 });
      for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.62) { const hh = 0.5 + ((x * 7) % 0.4); B(M.cardboard, 0.55, hh, 0.8, x, y + 0.22, z, 0, { grime: 0.1 }); }
    }
  };
  // a wooden pallet: three stringers under seven top boards and three bottom boards
  const pallet = (x, y, z, ry = 0, tint = 0xb89a6a) => {
    const c = Math.cos(ry), sn = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    for (const lz of [-0.44, 0, 0.44]) { const [px, pz] = at(0, lz); B(M.wood, 1.2, 0.09, 0.1, px, y + 0.03, pz, ry, { tint: 0x9a7c52, grime: 0.3 }); }
    for (const lx of [-0.55, 0, 0.55]) { const [px, pz] = at(lx, 0); B(M.wood, 0.1, 0.03, 1.0, px, y, pz, ry, { tint: 0x8a6e48, grime: 0.35 }); }   // (3 cm: clear of the floor's markings)
    for (let i = 0; i < 7; i++) { const [px, pz] = at(-0.54 + i * 0.18, 0); B(M.wood, 0.13, 0.025, 1.0, px, y + 0.12, pz, ry, { tint, grime: 0.25 }); }
  };
  // a shipped pallet: cases stacked in layers (with gaps and a ragged top), stretch wrap, corner boards,
  // a shipping label; some tied with a strap. Collision is the whole block.
  let palN = 0;
  const palletStack = (x, z, h, sh = 'wood') => {
    const k = palN++, rnd2 = (i) => ((Math.sin((k * 13 + i) * 91.7) * 43758.5) % 1 + 1) % 1;
    solid(x, z, 1.2, 1.0, 0.15, 0, sh);
    solid(x, z, 1.15, 0.95, h, 0.15, 'wood');
    pallet(x, 0, z);
    const kind = k % 4, caseMat = kind === 1 ? M.goodsBox : kind === 2 ? M.goodsBox2 : M.cardboard;
    const layer = kind === 3 ? 0.42 : 0.3, nl = Math.max(1, Math.round(h / layer)), lh = h / nl;
    for (let l = 0; l < nl; l++) {
      const y = 0.15 + l * lh, top = l === nl - 1;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        if (top && rnd2(l * 6 + i * 2 + j) < 0.22) continue;                 // a few cases already taken off the top
        const bx = x - 0.385 + i * 0.385 + (rnd2(i + l) - 0.5) * 0.03, bz = z - 0.237 + j * 0.474;
        B(caseMat, 0.37, lh - 0.012, 0.46, bx, y, bz, (rnd2(l + i * 3 + j) - 0.5) * 0.04, { tint: caseMat === M.cardboard ? [0xffffff, 0xe8dcc8, 0xd8c8b0][(i + j + l) % 3] : 0xffffff, grime: 0.08 });
      }
    }
    // stretch wrap over everything but the top layer, corner boards, label
    const wh = h - lh * 0.6;
    if (kind !== 1) for (const [w, d, dx, dz] of [[1.17, 0.005, 0, 0.48], [1.17, 0.005, 0, -0.48], [0.005, 0.96, 0.585, 0], [0.005, 0.96, -0.585, 0]]) B(M.clearGlass, w, wh, d, x + dx, 0.15, z + dz, 0, { cast: false, tint: 0xe8f0f4 });
    for (const [dx, dz] of [[0.58, 0.475], [-0.58, 0.475], [0.58, -0.475], [-0.58, -0.475]]) B(M.cardboard, 0.05, wh, 0.05, x + dx, 0.15, z + dz, 0, { tint: 0xc8b08a, grime: 0.1 });
    if (kind === 2 || kind === 0) for (const dx of [-0.3, 0.3]) B(M.dark, 0.035, 0.012, 0.99, x + dx, 0.15 + h, z, 0, { tint: 0x2a5aa8, grime: 0 });
    B(M.paint, 0.2, 0.14, 0.008, x + 0.25, 0.15 + Math.min(h - 0.2, 0.9), z + 0.487, 0, { tint: 0xf4f4f0, grime: 0 });
  };
  // ---------- the back strip (x 15..22, z -8..24): receiving, storage and racking along the back wall ----------
  // receiving takes the dock roll-up; the racking room at the parking-strip end has its own roll-up onto the
  // loading yard. Doors into the store by aisle 7 and by the wine aisle.
  plane(M.concrete, 7, 32, 18.5, 8, 0.016, 0, 0xb8b4ac);
  wallLine(15, -8, 15, 24, H, 0.25, [[7, 9, 2.6], [24.6, 26.2, 2.3]], M.plaster, inner);
  wallLine(15, 6, 22, 6, H, 0.25, [[3, 4.6, 2.3]], M.plaster, inner);       // receiving | storage
  wallLine(15, 14, 22, 14, H, 0.25, [[4.2, 5.8, 2.3]], M.plaster, inner);   // storage | racking
  // receiving (z -8..6): racking either side of the doors, pallets in off the dock
  rack(15.6, 18.2, -7.2); rack(15.6, 17.6, 5.2); rack(20.4, 21.8, 5.2);
  palletStack(18.6, -0.6, 1.6); palletStack(18.6, 0.8, 1.1); palletStack(20.5, 2.8, 1.4);
  signMesh(signTex(['RECEIVING'], { bg: '#d8d4cc', fg: '#1a1a1a', font: 'bold 50px Arial', w: 256, h: 128 }), 0.8, 0.4, 14.84, 2.9, -2.2, -Math.PI / 2, 0.3, { noMinimap: true });
  // storage (z 6..14): crates, drums, a pallet
  addKind(21.2, 7.4, 1.4, 1.4, 1.4, 0, 'crate'); addKind(21.2, 7.4, 1.2, 1.2, 1.2, 1.4, 'crate'); addKind(21.3, 9.1, 1.4, 1.4, 1.4, 0, 'crate');
  palletStack(21.2, 11.2, 1.3);
  for (const [x, z] of [[15.9, 12.9], [16.55, 13.2], [16.0, 7.0], [16.6, 6.9]]) addKind(x, z, 0.62, 0.62, 0.9, 0, 'barrel', 1);
  // racking (z 14..24): the end wall rack, a free-standing run, pallets in from the yard
  rack(15.6, 21.4, 23.3); rack(16.2, 19.2, 20.4);
  palletStack(16.4, 22.0, 1.5); palletStack(17.0, 15.2, 1.0);
  signMesh(signTex(['STOCKROOM', 'STAFF ONLY'], { bg: '#d8d4cc', fg: '#8a1a1a', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, 14.84, 2.9, 15.8, -Math.PI / 2, 0.3, { noMinimap: true });
  // a pallet jack in receiving
  SB(M.paint, 0.55, 0.35, 0.5, 20.6, 0, -4.4, { tint: 0xc8322b, grime: 0.3 }, 'metal');
  for (const dz of [-0.17, 0.17]) B(M.steelK, 1.1, 0.08, 0.16, 19.7, 0, -4.4 + dz, 0, { grime: 0.3 });
  P(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), M.dark, 20.9, 0.8, -4.4, 0, { rz: -0.35 });

  // ---------- back-of-house along the service-alley wall (x -12..10, z -24..-19.5) under a slab at 3 m ----------
  // kitchen & prep, cold storage, dry storage in a row; their roof is a catwalk from the upstairs offices to a
  // stair down at the far end. In front: the bakery & deli counter facing the aisles.
  const OH = 3.0, UP = 3.2, UH = H - UP;
  const BZ = -19.5;                                   // front wall of the rooms
  wallLine(-12, BZ, 10, BZ, OH, 0.2, [[4.7, 6.3, 2.3], [13.2, 14.8, 2.3], [18.7, 20.3, 2.3]], M.plaster, inner);   // doors: kitchen, cold room, dry storage
  wallLine(-12, -24, -12, BZ, OH, 0.2, [], M.plaster, inner);
  wallLine(-1, -24, -1, BZ, OH, 0.2, [[1.5, 3.1, 2.3]], M.plaster, inner);              // kitchen | cold room
  wallLine(5, -24, 5, BZ, OH, 0.25, [[1.5, 3.1, 2.3]], M.coldPanel, 0xffffff, 'metal'); // cold room | dry storage
  wallLine(10, -24, 10, BZ, OH, 0.2, [], M.plaster, inner);
  {
    const cg = new THREE.BoxGeometry(22.2, 0.2, 4.5); cg.translate(-0.9, OH + 0.1, -21.75);
    const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.9 }));
    cm.userData.noMinimap = true; cm.castShadow = true; cm.receiveShadow = true; group.add(cm); M.officeCeil = cm.material;
  }
  solid(-0.9, -21.75, 22.2, 4.5, 0.2, OH, 'metal');
  // the catwalk on top: steel grating, a rail along the store side and round the stair head
  UB(M.steelK, 22.2, 0.02, 4.5, -0.9, UP, -21.75, 0x5a5e62);
  for (let x = -11.5; x < 10; x += 0.6) U(new THREE.BoxGeometry(0.02, 0.025, 4.4), M.dark, x, UP + 0.02, -21.75, 0, 0x2a2c30);
  for (const [x, z, w, d] of [[-0.9, BZ + 0.05, 22.2, 0.05], [10.15, -20.7, 0.05, 2.4]]) {
    solid(x, z, w, d, 1.05, UP, 'metal').pass = true;   // rails stop you, not bullets
    UB(M.paint, w, 0.05, d, x, UP + 1.0, z, 0xe8c020); UB(M.paint, w, 0.04, d, x, UP + 0.5, z, 0xe8c020); UB(M.paint, w, 0.12, d, x, UP, z, 0x3a4048);
  }
  for (let x = -11.9; x <= 10.2; x += 1.6) U(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), M.paint, x, UP + 0.5, BZ + 0.05, 0, 0x3a4048);
  if (M.hexblack) plane(M.hexblack, 11, 4.5, -6.5, -21.75, 0.02);    // kitchen
  if (M.whitetile) plane(M.whitetile, 6, 4.5, 2, -21.75, 0.02);       // cold storage
  plane(M.concrete, 5, 4.5, 7.5, -21.75, 0.02, 0, 0xb8b4ac);          // dry storage
  // kitchen & prep (x -12..-1): range under a hood along the alley wall, fryer, prep island, sinks, dish rack
  SB(M.steelK, 3.0, 0.9, 0.85, -6.5, 0, -23.35, { grime: 0 }, 'metal');
  for (let i = 0; i < 4; i++) P(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 14), M.dark, -7.5 + (i % 2) * 0.7 + ((i / 2) | 0) * 1.4, 0.92, -23.35);
  P(new THREE.BoxGeometry(2.8, 0.25, 0.02), M.dark, -6.5, 0.5, -22.91);
  SB(M.steelK, 3.3, 0.6, 1.1, -6.5, 2.1, -23.3, { grime: 0.15 }, 'metal');                 // hood
  SB(M.steelK, 0.8, 1.0, 0.85, -9.0, 0, -23.35, { grime: 0 }, 'metal');                    // fryer
  P(new THREE.BoxGeometry(0.6, 0.02, 0.6), M.ovenGlow, -9.0, 1.01, -23.35, 0);
  SB(M.steelK, 3.6, 0.9, 1.0, -9.4, 0, -21.0, { grime: 0 }, 'metal');                      // prep island
  // cookware (CC-BY "Kitchen tools Pack"): a stock pot and a pan on the range; a board and knife, bowls and
  // plates on the island
  const kit = (re, len, axis = 'x') => propFit('kitchen', re, axis, len);
  const pot = kit(/^(Cylinder00[2-6]|Vert|Cube002)_kitchen/, 0.42), pan = kit(/^(Cylinder|Cylinder001|Plane)_kitchen/, 0.5);
  const board = kit(/^Cube006_kitchen/, 0.42), knife = kit(/^Cube(00[1345])?_kitchen/, 0.28);
  const bowl = kit(/^Cylinder009_kitchen/, 0.2), plate = kit(/^Cylinder010_kitchen/, 0.24), mug = kit(/^(Cylinder01[12]|Vert001)_kitchen/, 0.1);
  if (pot && board) {
    model(pot, -7.5, 0.93, -23.35); model(pan, -6.0, 0.93, -23.3, 0.4);
    model(board, -10.5, 0.9, -21.0, 0.2); model(knife, -10.45, 0.92, -20.95, 0.6);
    for (const [x, z] of [[-9.5, -21.2], [-9.2, -20.8]]) model(bowl, x, 0.9, z);
    for (let i = 0; i < 4; i++) model(plate, -8.3, 0.9 + i * 0.02, -21.05);
  } else for (let i = 0; i < 5; i++) P(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 14), M.wood, -10.8 + i * 0.7, 0.91, -21.0, 0, { tint: 0xd8b888 });
  SB(M.steelK, 2.2, 0.9, 0.7, -3.4, 0, -20.0, { grime: 0 }, 'metal');                     // sinks against the front wall
  for (const x of [-4.0, -2.8]) { P(new THREE.BoxGeometry(0.5, 0.02, 0.45), M.dark, x, 0.91, -20.05); P(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), M.steelK, x, 1.08, -19.75); }
  SB(M.steelK, 1.6, 1.9, 0.5, -11.0, 0, -23.65, { grime: 0 }, 'metal');         // dish shelving
  for (const y of [0.4, 0.9, 1.4]) for (let i = 0; i < 6; i++) P(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12), M.paint, -11.6 + i * 0.24, y + 0.05, -23.6, 0, { tint: 0xf4f2ec });
  signMesh(signTex(['EMPLOYEES ONLY', 'KITCHEN'], { bg: '#d8d4cc', fg: '#8a1a1a', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, -6.5, 2.65, BZ + 0.12, 0, 0.3, { noMinimap: true });
  // cold storage (x -1..5): insulated walls, wire shelving with produce crates, frosty light, strip curtain
  for (const [x, w] of [[-0.85, 0.06], [4.85, 0.06]]) B(M.coldPanel, w, 2.95, 4.4, x, 0, -21.75, 0, { grime: 0 });
  B(M.coldPanel, 5.8, 2.95, 0.06, 2, 0, -23.92, 0, { grime: 0 });
  const wireShelf = (x, z, len) => {   // along x, facing +z
    SB(M.steelK, len, 2.0, 0.6, x, 0, z, { grime: 0 }, 'metal');
    for (const y of [0.1, 0.65, 1.2, 1.75]) { B(M.steelK, len, 0.03, 0.62, x, y, z, 0, { grime: 0 }); face(M.produce, len - 0.1, 0.3, x, y + 0.2, z + 0.31, 0, 1.2); }
  };
  wireShelf(2, -23.45, 5.0);
  P(new THREE.BoxGeometry(4.6, 0.04, 0.04), M.frost, 2, 2.8, -22.6);
  for (let i = 0; i < 6; i++) P(new THREE.BoxGeometry(0.25, 2.2, 0.01), M.clearGlass, 1.35 + i * 0.26, 1.15, BZ - 0.12, 0, { cast: false, tint: 0xd8eef8 }); // strip curtain
  signMesh(signTex(['COLD STORAGE', '2°C'], { bg: '#2a6aa8', fg: '#ffffff', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, 2.0, 2.6, BZ + 0.12, 0, 0.35, { noMinimap: true });
  // dry storage (x 5..10): crates, sacks, a rack
  rack(5.6, 9.6, -23.4);
  addKind(9.3, -21.6, 1.2, 1.2, 1.2, 0, 'crate'); addKind(9.3, -21.6, 1.0, 1.0, 1.0, 1.2, 'crate');
  for (let i = 0; i < 4; i++) ctx.bag(8.95 + (i % 2) * 0.62, 0.12 + ((i / 2) | 0) * 0.2, -20.2, 0, 0xe8e0d0);
  solid(9.3, -20.2, 1.3, 0.5, 0.5, 0, 'dirt');
  { const L = new THREE.PointLight(0xf4f6ff, 10, 12, 1.3); L.position.set(-6.5, 2.6, -21.7); L.userData.mapLight = true; group.add(L); }

  // ---------- bakery & deli: one long glass counter along the aisle, ovens and slicers behind ----------
  plane(M.bakeryFloor, 22, 2.8, -1, -18.1, 0.014);
  const CZ = -16.2;   // counter centre line
  // deli (x -11..-0.6): a refrigerated case of meats and cheese
  {
    const x0 = -11, x1 = -0.6, L = x1 - x0, cx = (x0 + x1) / 2;
    SB(M.paint, L, 1.0, 1.0, cx, 0, CZ, { tint: 0xe8e4dc }, 'metal');
    face(M.clearGlass, L, 0.5, cx, 1.25, CZ + 0.51, 0, 3);
    face(M.goodsCan, L - 0.1, 0.3, cx, 0.75, CZ + 0.505, 0, 1);
    solid(cx, CZ, L, 1.0, 1.5, 0, 'glass').pass = true;
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.55) P(new RoundedBoxGeometry(0.4, 0.1, 0.25, 2, 0.04), M.paint, x, 1.06, CZ - 0.1, 0, { tint: [0xc8705a, 0xe8c8a0, 0xa04a3a, 0xf0d890][(x * 3 | 0) & 3] });
  }
  // bakery (x 0.6..9): bread and pastries under glass
  {
    const x0 = 0.6, x1 = 9, L = x1 - x0, cx = (x0 + x1) / 2;
    SB(M.woodOld, L, 1.0, 1.0, cx, 0, CZ, { tint: 0x9a7a5a }, 'wood');
    B(M.steelK, L, 0.04, 1.05, cx, 1.0, CZ, 0, { grime: 0 });
    face(M.clearGlass, L, 0.45, cx, 1.25, CZ + 0.51, 0, 3);
    solid(cx, CZ, L, 1.0, 1.48, 0, 'glass').pass = true;
    for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.42) {
      P(new RoundedBoxGeometry(0.3, 0.12, 0.16, 2, 0.05), M.bread, x, 1.1, CZ - 0.05, 0.3);
      if ((x * 10 | 0) % 3 === 0) P(new THREE.SphereGeometry(0.07, 10, 6), M.crust, x + 0.1, 1.09, CZ + 0.2);
    }
  }
  // behind the counter, against the room wall: rack ovens and a deck oven (bakery), slicer benches (deli)
  const rackOven = (x, z) => {   // facing +z
    SB(M.steelK, 1.5, 2.6, 1.4, x, 0, z, { grime: 0 }, 'metal');
    P(new THREE.BoxGeometry(0.7, 1.4, 0.02), M.ovenGlow, x, 1.3, z + 0.71);
    P(new THREE.BoxGeometry(0.3, 0.4, 0.06), M.dark, x + 0.4, 2.25, z + 0.72);
  };
  rackOven(3.7, BZ + 0.82); rackOven(5.3, BZ + 0.82);
  SB(M.steelK, 1.4, 2.0, 1.1, 9.2, 0, BZ + 0.67, { grime: 0 }, 'metal');            // deck oven
  for (const y of [0.6, 1.1, 1.6]) P(new THREE.BoxGeometry(1.0, 0.18, 0.02), M.ovenGlow, 9.2, y, BZ + 1.23);
  SB(M.steelK, 2.4, 0.9, 0.8, -3.4, 0, BZ + 0.52, { grime: 0 }, 'metal');           // slicer benches
  SB(M.steelK, 2.0, 0.9, 0.8, -9.6, 0, BZ + 0.52, { grime: 0 }, 'metal');
  for (const x of [-3.8, -9.4]) P(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 18), M.steelK, x, 1.05, BZ + 0.5, 0, { rx: 1.2 });
  signMesh(signTex('CAUTION · HOT OVENS', { bg: '#e8c020', fg: '#1a1a1a', font: 'bold 50px Arial' }), 1.4, 0.35, 4.5, 2.75, BZ + 0.12, 0, 0.3, { noMinimap: true });
  // tiles on the wall behind the counter (herringbone), round the room doors
  if (M.subway) {
    let cur = -12;
    for (const [a, b] of [[-7.3, -5.7], [1.2, 2.8], [6.7, 8.3], [10, 10]]) {
      if (a - cur > 0.05) { const g = new THREE.PlaneGeometry(a - cur, 2.4); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (a - cur) / ctx.S.subway, uv.getY(i) * 2.4 / ctx.S.subway); P(g, M.subway, (a + cur) / 2, 1.2, BZ + 0.11, 0, { cast: false }); }
      cur = b;
    }
  }
  // the signs: neon along the catwalk fascia over the counter, like the concept art
  B(M.paint, 21.6, 0.7, 0.08, -0.9, OH - 0.65, BZ + 0.15, 0, { tint: 0x30363c, grime: 0 });
  neon('BAKERY & DELI', '#ff4fa8', 6.2, 0.9, -5.6, 2.7, BZ + 0.22, 0, false, 'bold 120px Arial');
  neon('FRESH BREAD', '#ffb03a', 4.4, 0.7, 5.0, 2.7, BZ + 0.22, 0, false, 'italic bold 120px Georgia');

  // ---------- the stock room in the back corner (x 15..22, z -24..-8) and the floor in front of it ----------
  plane(M.concrete, 7, 16, 18.5, -16, 0.016, 0, 0xb8b4ac);
  wallLine(15, -24, 15, -8, H, 0.25, [[6, 7.6, 2.3]], M.plaster, inner);      // door from the store
  wallLine(15, -8, 22, -8, H, 0.25, [[4, 5.5, 2.3]], M.plaster, inner);       // door to receiving
  rack(15.6, 21.6, -23.3); rack(18.0, 21.9, -14.0);
  palletStack(20.8, -20.6, 1.4); palletStack(16.4, -10.2, 1.2); palletStack(21.2, -9.6, 1.6);
  for (const [x, z] of [[21.3, -11.6], [20.7, -11.9], [21.3, -12.3]]) addKind(x, z, 0.62, 0.62, 0.9, 0, 'barrel', 1);
  // staff lockers (CC-BY "Locker", doors facing into the room) or painted boxes
  const locker = propFit('locker', null, 'y', 1.9);
  for (let i = 0; i < 4; i++) {
    if (locker) { model(locker, 15.45, 0, -12.8 + i * 0.52); solid(15.45, -12.8 + i * 0.52, 0.5, 0.5, 1.9, 0, 'metal'); }
    else SB(M.paint, 0.5, 1.9, 0.5, 15.45, 0, -12.8 + i * 0.52, { tint: 0x4a6a8a }, 'metal');
  }
  P(new THREE.BoxGeometry(0.12, 0.4, 0.3), M.dark, 15.2, 1.4, -15.4);                                                  // time clock
  signMesh(signTex(['STOCK ROOM', 'STAFF ONLY'], { bg: '#d8d4cc', fg: '#8a1a1a', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, 14.84, 2.9, -14.0, -Math.PI / 2, 0.3, { noMinimap: true });
  // the open corner by the catwalk stair: overstock pallets
  palletStack(12.6, -10.4, 1.3); palletStack(13.4, -14.6, 1.0);

  // ---------- the open floor between the aisles and the back strip: seasonal pallets, beer & wine ----------
  palletStack(11.6, -5.4, 1.2); palletStack(12.9, 4.6, 1.4); palletStack(11.0, 8.2, 0.9);
  SB(M.cardboard, 1.2, 1.4, 1.2, 12.6, 0, -1.2, { grime: 0.05 }, 'wood'); face(M.goodsBox, 1.1, 0.6, 12.6, 0.8, -0.59, 0, 1);
  gondola(8.8, 12.6, 14.0, [M.goodsBottle, M.goodsBottle, M.goodsCan]);
  gondola(8.8, 12.6, 18.4, [M.goodsBottle, M.goodsCan, M.goodsBottle]);
  for (const s of [0, Math.PI]) signMesh(signTex('BEER & WINE', { bg: '#6a1a2a', font: 'bold 64px Arial', w: 512, h: 128 }), 2.2, 0.55, 10.7, 3.6, 16.2 + (s ? -0.01 : 0.01), s, 0.6, { noMinimap: true, double: true });

  // ---------- upstairs: offices + break room on a mezzanine over the front corner (floor at 3.2 m) ----------
  // under it: the entrance, customer service and the carts. Inside stair from the dairy end, outside stair
  // up the service-alley wall.
  {
    const mz = new THREE.BoxGeometry(10, 0.2, 8); mz.translate(-17, OH + 0.1, -20);
    const mm = new THREE.Mesh(mz, M.officeCeil); mm.userData.noMinimap = true; mm.castShadow = true; mm.receiveShadow = true; group.add(mm);
  }
  solid(-17, -20, 10, 8, 0.2, OH, 'concrete');
  B(M.paint, 10, 0.4, 0.3, -17, OH - 0.4, -16.15, 0, { tint: 0x30363c, grime: 0 });        // edge beam
  B(M.paint, 0.3, 0.4, 8, -12.15, OH - 0.4, -20, 0, { tint: 0x30363c, grime: 0 });
  for (const [x, z] of [[-12.3, -16.2], [-17, -16.2]]) SB(M.paint, 0.35, OH - 0.4, 0.35, x, 0, z, { tint: 0x30363c, grime: 0.1 }, 'metal');
  wallLine(-12, -24, -12, -16, UH, 0.2, [[0.6, 2.2, 2.15], [3.2, 7.4, 2.1, 0.95]], M.plaster, inner, 'concrete', null, UP);   // stair door, window over the store
  wallLine(-22, -16, -12, -16, UH, 0.2, [[1.0, 4.4, 2.1, 0.95], [6.0, 9.2, 2.1, 0.95]], M.plaster, inner, 'concrete', null, UP); // windows over the checkouts
  wallLine(-17, -24, -17, -16, UH, 0.15, [[3.2, 4.8, 2.15]], M.plaster, 0xd8e0d8, 'concrete', null, UP);                     // office | break room
  for (const [x, z, w, d] of [[-11.95, -18.7, 0.32, 4.2], [-19.3, -15.95, 3.4, 0.32], [-14.4, -15.95, 3.2, 0.32]]) UB(M.wood, w, 0.04, d, x, UP + 0.95, z, 0xc8a878);
  UF(M.wood, 5, 8, -19.5, UP + 0.006, -20, ctx.scaleOf(M.wood) || 2);
  UF(M.checker || M.tile, 5, 8, -14.5, UP + 0.006, -20, M.checker ? 3.0 : (ctx.scaleOf(M.tile) || 1));
  const SU = (mat, w, h, d, x, y, z, tint, surf = 'wood') => { solid(x, z, w, d, h, y, surf); UB(mat, w, h, d, x, y, z, tint); };
  // office furniture (CC-BY "Low Poly Office Cubicle Assets"; its fronts face +x) where loaded, boxes otherwise
  const off = (re, axis, len, ry = 0) => propFit('office', re, axis, len, ry);
  const monitor = off(/^Computer_Monitor/, 'y', 0.42, -Math.PI / 2), tower = off(/^PC_Tower/, 'y', 0.42, -Math.PI / 2);
  const chair = off(/^Chair/, 'y', 1.05, Math.PI / 2);
  const desk = (x, z, y = UP, i = 0) => {   // i: the second desk gets a coffee mug
    SU(M.wood, 1.6, 0.06, 0.8, x, y + 0.72, z, 0xc8a878);
    for (const dx of [-0.75, 0.75]) UB(M.dark, 0.05, 0.72, 0.75, x + dx, y, z);
    U(new THREE.BoxGeometry(0.42, 0.02, 0.14), M.dark, x, y + 0.79, z + 0.1);
    if (monitor) {
      solid(x + 0.1, z + 0.7, 0.5, 0.5, 0.5, y, 'cloth');
      model(monitor, x, y + 0.78, z - 0.15, 0, true);
      model(tower, x - 0.5, y, z - 0.1, 0, true);
      model(chair, x + 0.1, y, z + 0.75, 0, true);
      if (mug && i) model(mug, x + 0.5, y + 0.78, z - 0.05, 2, true);
      return;
    }
    SU(M.fabric, 0.5, 0.5, 0.5, x + 0.1, y, z + 0.7, 0xffffff, 'cloth');
    U(new THREE.BoxGeometry(0.55, 0.34, 0.03), M.screen, x, y + 1.02, z - 0.2);
    U(new THREE.BoxGeometry(0.06, 0.2, 0.06), M.dark, x, y + 0.85, z - 0.22);
    U(new THREE.BoxGeometry(0.5, 0.55, 0.08), M.fabric, x + 0.1, y + 0.8, z + 0.95);
  };
  // office (x -22..-17): two desks, filing cabinets, a whiteboard
  desk(-19.6, -22.9); desk(-19.6, -19.3, UP, 1);
  const cabinet = off(/^4_Drawer/, 'y', 1.3);
  for (let i = 0; i < 3; i++) {
    if (cabinet) { solid(-21.6, -17.0 - i * 0.62, 0.5, 0.6, 1.3, UP, 'metal'); model(cabinet, -21.6, UP, -17.0 - i * 0.62, 0, true); }
    else SU(M.paint, 0.5, 1.3, 0.6, -21.6, UP, -17.0 - i * 0.62, 0x8a8e92, 'metal');
  }
  if (cabinet) {
    model(off(/^Potted_Plant/, 'y', 0.5), -21.6, UP + 1.3, -17.0, 0, true);
    model(off(/^(Printer|Tray)/, 'y', 0.42), -21.6, UP + 1.3, -18.24, 0, true);
    model(off(/^(Corkboard|Pin_|Sticky|Pinned)/, 'y', 0.75), -21.86, UP + 1.25, -21.1, 0, true);
    model(off(/^Trash/, 'y', 0.4), -18.4, UP, -23.6, 0, true);
  }
  U(new THREE.PlaneGeometry(1.4, 0.9), M.paint, -17.09, UP + 1.6, -22.6, -Math.PI / 2, 0xf4f4f0);
  // break room (x -17..-12): table and chairs, vending machine, fridge, counter with a microwave
  SU(M.wood, 1.0, 0.75, 1.8, -14.0, UP, -20.6, 0xd8c8a8);
  for (const [dx, dz] of [[-0.8, -0.6], [-0.8, 0.6], [0.8, -0.6], [0.8, 0.6]]) SU(M.fabric, 0.45, 0.45, 0.45, -14.0 + dx, UP, -20.6 + dz, 0x8a3a3a, 'cloth');
  SU(M.paint, 0.9, 1.9, 0.8, -15.8, UP, -23.5, 0x8a1a1a, 'metal');
  U(new THREE.BoxGeometry(0.6, 1.4, 0.02), M.coolLight, -15.8, UP + 1.1, -23.09);
  SU(M.paint, 0.8, 1.8, 0.7, -16.45, UP, -17.0, 0xe8e8e4, 'metal');
  SU(M.woodOld, 2.4, 0.9, 0.6, -13.6, UP, -16.45, 0x8a7a6a);
  U(new THREE.BoxGeometry(0.45, 0.3, 0.35), M.dark, -13.0, UP + 1.05, -16.45);
  const cooler = off(/^Water/, 'y', 1.35);
  if (cooler) { model(cooler, -16.65, UP, -22.4, 0, true); solid(-16.65, -22.4, 0.4, 0.4, 1.35, UP, 'metal'); }
  if (mug) for (const [x, y, z, r] of [[-14.2, 0.9, -16.4, 0.3], [-14.5, 0.9, -16.55, 2], [-13.8, 0.75, -20.3, 1]]) model(mug, x, UP + y, z, r, true);   // two on the counter, one on the table
  signMesh(signTex(['BREAK ROOM'], { bg: '#d8d4cc', fg: '#1a1a1a', font: 'bold 50px Arial', w: 256, h: 128 }), 0.7, 0.35, -16.91, UP + 2.35, -18.0, Math.PI / 2, 0.3, { noMinimap: true });
  signMesh(signTex(['OFFICE'], { bg: '#d8d4cc', fg: '#1a1a1a', font: 'bold 56px Arial', w: 256, h: 128 }), 0.7, 0.35, -17.09, UP + 2.35, -18.0, -Math.PI / 2, 0.3, { noMinimap: true });
  { const L = new THREE.PointLight(0xfff4e4, 9, 10, 1.3); L.position.set(-17, UP + 2.2, -20); L.userData.mapLight = true; group.add(L); }

  // ---------- stairs ----------
  // a flight climbing toward -x from (x, z) at its foot: concrete (solid under) or galvanised open treads
  const flightNX = (x, z, n, rise, run, w, metal) => {
    const L = n * run, ang = Math.atan2(rise, run), slope = Math.hypot(L, n * rise);
    for (let k = 1; k <= n; k++) {
      const cx = x - (k - 0.5) * run, top = k * rise;
      if (metal) {
        solid(cx, z, run, w, 0.08, top - 0.08, 'metal');
        U(new THREE.BoxGeometry(run, 0.05, w), M.steelK, cx, top - 0.025, z, 0, 0x6a6e72);
        U(new THREE.BoxGeometry(0.03, 0.04, w), M.paint, cx - run / 2 + 0.02, top - 0.02, z, 0, 0xe8c020);
      } else {
        solid(cx, z, run, w, top, 0, 'concrete');
        B(M.concrete, run, top, w, cx, 0, z, 0, { tint: 0xc8c4bc, grime: 0.15 });
        B(M.paint, 0.05, 0.012, w, cx - run / 2 + 0.03, top, z, 0, { tint: 0xe8c020, grime: 0 });
      }
    }
    for (const s of [-1, 1]) {
      const rail = (th, y, mat, tint) => { const g = new THREE.BoxGeometry(slope, th, th); g.rotateZ(-ang); U(g, mat, x - L / 2, y, z + s * w / 2, 0, tint); };
      if (metal) rail(0.06, n * rise / 2 - 0.1, M.paint, 0x3a4048);
      rail(0.045, n * rise / 2 + 0.95, M.steelK, 0x9aa0a6);
      for (let k = 0; k <= n; k += Math.max(2, n >> 2)) U(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 6), M.steelK, x - (k + 0.5) * run, (k + 0.5) * rise + 0.47, z + s * w / 2, 0, 0x9aa0a6);
    }
  };
  // inside: a galvanised stair from the catwalk's far end down to the floor by the stock room
  flightNX(14.4, -22.6, 10, 0.32, 0.42, 1.3, true);
  signMesh(signTex(['CATWALK', 'OFFICES ↑'], { bg: '#1f4e8a', fg: '#ffffff', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, 14.95, 2.4, -20.6, -Math.PI / 2, 0.4, { noMinimap: true });
  // outside: a galvanised stair up the service-alley wall to a landing at the break room's side door
  flightNX(-6.0, -25.05, 10, 0.32, 0.42, 1.3, true);
  solid(-12.1, -25.3, 3.8, 1.8, 0.1, UP - 0.1, 'metal');
  UB(M.steelK, 3.8, 0.08, 1.8, -12.1, UP - 0.08, -25.3, 0x6a6e72);
  for (const [x, z, w, d] of [[-12.1, -26.18, 3.8, 0.05], [-13.98, -25.3, 0.05, 1.8]]) { solid(x, z, w, d, 1.0, UP, 'metal'); UB(M.steelK, w, 0.05, d, x, UP + 0.95, z, 0x9aa0a6); UB(M.steelK, w, 0.04, d, x, UP + 0.5, z, 0x9aa0a6); }
  for (const [x, z] of [[-13.95, -26.15], [-10.25, -26.15], [-13.95, -24.5], [-8.1, -25.7]]) {
    const hh = x > -9 ? UP * 0.5 : UP;
    U(new THREE.CylinderGeometry(0.05, 0.05, hh, 8), M.paint, x, hh / 2, z, 0, 0x5a5e62);
    if (x < -9) U(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 6), M.steelK, x, UP + 0.47, z, 0, 0x9aa0a6);
  }
  signMesh(signTex(['STAFF ONLY'], { bg: '#d8d4cc', fg: '#8a1a1a', font: 'bold 50px Arial', w: 256, h: 128 }), 0.7, 0.35, -15.0, UP + 1.6, Z0 - T - 0.04, Math.PI, 0.3);

  // ---------- outside: parking lot ----------
  const parked = [[-30.2, -22.8], [-30.2, -17.2], [-30.2, -8.8], [-30.2, 2.4], [-30.2, 10.8], [-30.2, 19.2], [-34.8, -20], [-34.8, -6], [-34.8, 5.2], [-34.8, 16.4], [-34.8, 24.8], [-30.2, 25]];
  // car collision: the body, then the narrower, shorter cabin (no invisible corners)
  const carSolid = (x, z) => { solid(x, z, 3.9, 1.75, 0.85, 0, 'metal'); solid(x, z, 2.9, 1.5, 0.6, 0.85, 'metal').pass = true; };   // the cabin is mostly glass
  for (const [x, z] of parked) {
    buildCar(x, z, x > -32 ? Math.PI : 0, 0);
    carSolid(x, z);
  }
  // light poles (real lights on High / Ultra)
  for (const z of [-14, 0, 14]) {
    const x = -32.5;
    SB(M.concrete, 0.6, 0.6, 0.6, x, 0, z, { grime: 0.2 });
    P(new THREE.CylinderGeometry(0.08, 0.11, 8, 8), M.dark, x, 4.6, z);
    for (const s of [-1, 1]) {
      P(new THREE.BoxGeometry(0.5, 0.14, 0.5), M.dark, x + s * 0.6, 8.55, z);
      P(new THREE.BoxGeometry(0.42, 0.04, 0.42), M.lamp, x + s * 0.6, 8.47, z);
      glows.push([x + s * 0.6, 8.4, z, 1.6]);
    }
    const spot = new THREE.SpotLight(0xffd9a8, 220, 24, 1.0, 0.6, 1.5);
    spot.position.set(x, 8.4, z); spot.target.position.set(x + 2, 0, z);
    spot.userData.lampLight = true;
    group.add(spot, spot.target);
  }
  // cart corrals, bollards, planter islands
  for (const z of [-11, 11]) {
    solid(-32.5, z, 2.6, 1.2, 1.0, 0, 'metal').pass = true;   // rails: stop you, not bullets
    for (const s of [-1, 1]) B(M.steelK, 2.6, 0.05, 0.05, -32.5, 0.95, z + s * 0.55, 0, { grime: 0 });
    P(new RoundedBoxGeometry(0.9, 0.5, 0.55, 1, 0.03), M.steelK, -32.9, 0.75, z, Math.PI / 2);
  }
  for (const z of [-21, -13, -9, 9, 13, 21]) { P(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), M.paint, -24.8, 0.45, z, 0, { tint: 0xe8c020 }); solid(-24.8, z, 0.25, 0.25, 0.9, 0, 'metal'); }
  // signs on posts (CC-BY "Sign package"): accessible parking and no parking by the entrances
  signPost(7, -25.0, -16.6, -Math.PI / 2); signPost(6, -25.0, 16.6, -Math.PI / 2);
  // store sign
  const logo = signTex('FRESHWAY', { bg: null, fg: '#e8402a', font: 'bold 92px Arial', w: 1024, h: 160 });
  signMesh(logo, 12, 1.9, X0 - T - 0.14, 4.3, 0, -Math.PI / 2, 2.2, { transparent: true });
  // the big name on the brick street side, lit, over a dark sign band
  B(M.paint, 16, 1.7, 0.1, -2, 3.15, Z1 + T + 0.12, 0, { tint: 0x30363c, grime: 0.05 });
  signMesh(signTex('FRESHWAY', { bg: null, fg: '#3ad07a', font: 'bold 92px Arial', w: 1024, h: 160 }), 14, 2.2, -2, 4.0, Z1 + T + 0.2, 0, 2.2, { transparent: true });
  signMesh(signTex('MARKET · BAKERY · DELI', { bg: null, fg: '#f2efe6', font: 'bold 60px Arial', w: 1024, h: 100 }), 9, 0.9, -2, 2.6, Z1 + T + 0.2, 0, 1.0, { transparent: true });
  for (const z of [-19, 19]) signMesh(signTex('ENTRANCE', { bg: '#2f5a3a', font: 'bold 64px Arial', w: 512, h: 128 }), 1.6, 0.4, X0 - T - 0.06, 3.5, z, -Math.PI / 2, 0.8);
  // street beyond the lot, low wall + hedge at the map edge
  plane(M.asphalt, 30, 80, -57, 0, -0.005);
  SB(M.concrete, 0.4, 0.8, 69, -42.2, 0, 0, { tint: 0xc8c0b0 });
  hedge(-42.7, -33.6, -42.7, 33.6, 1.5, 0.9);

  // ---------- outside: delivery yard and smoking area ----------
  // ---------- loading bay & receiving ----------
  // three dock doors: the open roll-up into the stockroom, two closed ones (a semi backed up to one)
  const dockDoor = (z0, z1, open) => {
    const zc = (z0 + z1) / 2, w = z1 - z0;
    if (!open) {
      B(M.metal, 0.06, 3.5, w, X1 + T + 0.03, 0, zc, 0, { tint: 0x9aa0a6, grime: 0.35 });
      for (let y = 0.25; y < 3.5; y += 0.25) B(M.dark, 0.02, 0.03, w, X1 + T + 0.07, y, zc, 0, { grime: 0 });
    }
    for (const s of [-1, 1]) {
      SB(M.rubber, 0.3, 0.6, 0.25, X1 + T + 0.15, 0.6, zc + s * (w / 2 + 0.2), { grime: 0 }, 'cloth');            // dock bumpers
      SB(M.paint, 0.3, 1.2, 0.3, X1 + T + 1.0, 0, zc + s * (w / 2 + 0.55), { tint: 0xe8c020, grime: 0.3 }, 'metal'); // bollards
    }
    B(M.paint, 0.02, 3.7, 0.12, X1 + T + 0.04, 0, z0 - 0.06, 0, { tint: 0xe8c020, grime: 0.2 });
    B(M.paint, 0.02, 3.7, 0.12, X1 + T + 0.04, 0, z1 + 0.06, 0, { tint: 0xe8c020, grime: 0.2 });
  };
  dockDoor(-13.4, -10.6, false); dockDoor(-9.8, -7.0, false); dockDoor(-3.0, 1.2, true); dockDoor(17, 21, true);
  signMesh(signTex('LOADING BAY & RECEIVING', { bg: '#1a1c20', fg: '#f2c63a', font: 'bold 52px Arial', w: 1024, h: 128 }), 5.6, 0.7, X1 + T + 0.04, 4.6, -5.9, Math.PI / 2, 0.6);
  for (const [z, n] of [[-12, '1'], [-8.4, '2'], [-0.9, '3']]) signMesh(signTex(n, { bg: '#f2c63a', fg: '#1a1a1a', font: 'bold 100px Arial', w: 128, h: 128 }), 0.5, 0.5, X1 + T + 0.04, 3.95, z, Math.PI / 2, 0.4);
  // semi: a long box trailer backed up to door 2, the tractor almost at the back fence
  const semi = (zc) => {
    const tx0 = 22.7, tL = 11.4, tx = tx0 + tL / 2;
    SB(M.paint, tL, 2.75, 2.5, tx, 1.2, zc, { tint: 0xeae8e2, grime: 0.12 }, 'metal');
    for (const dx of [3.6, 4.85]) for (const s of [-1, 1]) solid(tx0 + dx, zc + s * 1.0, 1.0, 0.4, 1.0, 0, 'metal');   // wheels; open under the trailer (crawl under it)
    for (const s of [-1, 1]) solid(tx0 + tL - 2.2, zc + s * 0.9, 0.14, 0.14, 1.0, 0, 'metal');   // landing gear legs
    B(M.dark, tL - 0.4, 0.25, 2.2, tx, 0.95, zc, 0, { grime: 0 });
    for (const s of [-1, 1]) {
      const sm = signMesh(signTex(['FRESHWAY', 'fresh every day'], { bg: '#eae8e2', fg: '#2f8a4a', font: 'bold 64px Arial', w: 1024, h: 256 }), 7, 1.75, tx + 0.6, 2.55, zc + s * 1.262, s > 0 ? 0 : Math.PI, 0.05);
      sm.material.roughness = 0.5;
      for (const dx of [3.6, 4.85]) P(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 18), M.rubber, tx0 + dx, 0.5, zc + s * 1.0, 0, { rx: Math.PI / 2 });
      P(new THREE.BoxGeometry(0.12, 1.0, 0.12), M.dark, tx0 + tL - 2.2, 0.5, zc + s * 0.9);   // landing gear
    }
    B(M.paint, 0.04, 0.08, 2.5, tx0 + 0.02, 1.2, zc, 0, { tint: 0xc8322b, grime: 0 });
    // tractor
    const cx0 = tx0 + tL - 1.4;
    B(M.dark, 6.2, 0.35, 1.0, cx0 + 3.1, 0.75, zc, 0, { grime: 0.2 });
    SB(M.paint, 1.3, 2.5, 2.4, cx0 + 2.35, 1.1, zc, { tint: 0x2a4a7a, grime: 0.1 }, 'metal');     // sleeper
    SB(M.paint, 1.9, 2.0, 2.45, cx0 + 3.95, 1.1, zc, { tint: 0x2a4a7a, grime: 0.1 }, 'metal');    // cab
    SB(M.paint, 1.4, 1.25, 2.1, cx0 + 5.55, 0.95, zc, { tint: 0x2a4a7a, grime: 0.15 }, 'metal');  // hood
    solid(cx0 + 3.73, zc, 5.26, 2.45, 0.5, 0.6, 'metal');                             // frame and tanks (to the grille)
    for (const dx of [1.2, 2.5, 5.4]) for (const s of [-1, 1]) solid(cx0 + dx, zc + s * 1.0, 1.0, 0.4, 1.04, 0, 'metal'); // wheels
    P(new THREE.BoxGeometry(0.04, 0.85, 2.1), M.glass, cx0 + 4.91, 2.55, zc, 0, { tint: 0xffffff });
    B(M.steelK, 0.12, 0.6, 2.2, cx0 + 6.3, 0.95, zc, 0, { grime: 0 }); // grille
    for (const s of [-1, 1]) {
      P(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10), M.steelK, cx0 + 3.0, 2.4, zc + s * 1.3);   // stacks
      for (const dx of [1.2, 2.5, 5.4]) P(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 18), M.rubber, cx0 + dx, 0.52, zc + s * 1.0, 0, { rx: Math.PI / 2 });
      P(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 14), M.steelK, cx0 + 3.9, 0.75, zc + s * 1.05, 0, { rz: Math.PI / 2 }); // tanks
    }
  };
  semi(-8.4);
  // forklift with a pallet on the forks, parked outside the open door
  const forklift = (x, z) => {
    SB(M.paint, 1.6, 1.15, 1.15, x + 0.4, 0.15, z, { tint: 0xe8b020, grime: 0.25 }, 'metal');
    solid(x + 0.4, z, 1.6, 1.15, 0.15, 0, 'metal');
    B(M.dark, 0.5, 0.45, 1.1, x + 1.05, 1.3, z, 0, { grime: 0.1 });                                 // counterweight
    SB(M.fabric, 0.45, 0.5, 0.5, x + 0.45, 1.3, z, { tint: 0x2a2a2a, grime: 0 }, 'cloth');           // seat
    for (const [dx, dz] of [[-0.25, -0.5], [-0.25, 0.5], [1.15, -0.5], [1.15, 0.5]]) P(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), M.dark, x + dx, 1.85, z + dz);
    B(M.dark, 1.5, 0.05, 1.1, x + 0.45, 2.4, z, 0, { grime: 0 });                                    // overhead guard
    for (const s of [-1, 1]) {
      B(M.dark, 0.1, 2.5, 0.1, x - 0.5, 0, z + s * 0.35, 0, { grime: 0.1 });                          // mast
      B(M.steelK, 1.1, 0.05, 0.1, x - 1.05, 0.35, z + s * 0.3, 0, { grime: 0.2 });                   // forks
      for (const dx of [-0.15, 0.95]) P(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14), M.rubber, x + dx, 0.28, z + s * 0.55, 0, { rx: Math.PI / 2 });
    }
    SB(M.wood, 1.2, 0.15, 1.0, x - 1.1, 0.4, z, { tint: 0xb89a6a }, 'wood');
    SB(M.cardboard, 1.1, 0.9, 0.95, x - 1.1, 0.55, z, { grime: 0.05 }, 'wood');
    solid(x - 1.05, z, 1.2, 1.0, 0.4, 0, 'wood');
  };
  forklift(28.6, 3.0);
  decal(new THREE.MeshBasicMaterial({ color: 0xd8c050, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 4.2, 6, 26, 0.02, -1, 0, -Math.PI / 2);
  // roll-up door half open over the stockroom opening
  B(M.metal, 0.08, 2.2, 4.2, X1 + T + 0.02, 3.6, -0.5, 0, { tint: 0x8a9096, grime: 0.3 });
  // dumpsters by the bakery door (CC-BY "dumpster": the green 4-yard, or the black 6-yard for the blue ones,
  // both scaled to the same 1.9 m footprint)
  const dumpModels = { green: propFit('dumpster', /^4Y/, 'x', 1.9), dark: propFit('dumpster', /^6Y/, 'x', 1.9) };
  const dumpster = (x, z, tint) => {
    const pc = dumpModels[tint === 0x2f5a3a ? 'green' : 'dark'];
    if (pc) { model(pc, x, 0, z); solid(x, z, 1.9, Math.min(1.3, pc.size.z), pc.size.y, 0, 'metal'); return; }
    SB(M.paint, 1.9, 1.25, 1.2, x, 0, z, { tint, grime: 0.4 }, 'metal');
    B(M.rubber, 2.0, 0.08, 1.3, x, 1.25, z, 0, { grime: 0 });
  };
  dumpster(24, -20.6, 0x2f5a3a); dumpster(24.2, -23.1, 0x2f5a3a); dumpster(24, 22.6, 0x3d4f63);
  // cover in the yard: pallets, crates, a compactor
  palletStack(30.5, 11, 1.4); palletStack(31.8, 11.2, 0.9); palletStack(30.8, -16, 1.6); palletStack(32, 3.4, 1.2);
  SB(M.paint, 3, 2.2, 2.2, 33.5, 0, -22, { tint: 0x5a6a7a, grime: 0.4 }, 'metal');
  SB(M.woodOld, 1.4, 1.4, 1.4, 34, 0, 18, { tint: 0x9a8a6a }, 'wood');
  SB(M.woodOld, 1.4, 1.4, 1.4, 34.2, 1.4, 18.2, { tint: 0x8a7a5a }, 'wood');
  // smoking area: canopy, bench, ash urn, sign; a soldier on his break
  for (const [x, z] of [[26.6, -22.4], [26.6, -14.4]]) P(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), M.dark, x, 1.4, z);
  B(M.metal, 4.6, 0.08, 8.6, 24.6, 2.8, -18.4, 0, { tint: 0x7a8088, grime: 0.2 });
  SB(M.wood, 0.5, 0.45, 2.2, 22.85, 0, -21.4, { tint: 0x9a7a5a }, 'wood');
  B(M.wood, 0.08, 0.5, 2.2, 22.66, 0.45, -21.4, 0, { tint: 0x9a7a5a });
  SB(M.metal, 0.38, 0.95, 0.38, 24.6, 0, -15.4, { tint: 0x3a3c40 }, 'metal');
  P(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), M.dirt, 24.6, 0.97, -15.4);
  signMesh(signTex(['DESIGNATED', 'SMOKING AREA'], { bg: '#e8e4dc', fg: '#2a2a2a', font: 'bold 46px Arial', w: 512, h: 200, border: '#c8322b' }), 1.0, 0.4, X1 + T + 0.03, 2.3, -16.2, Math.PI / 2, 0.3);
  const butts = new THREE.MeshBasicMaterial({ color: 0xe8e0c8 });
  for (let i = 0; i < 18; i++) P(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 4), butts, 23.2 + Math.random() * 2.4, 0.01, -21 + Math.random() * 5, Math.random() * 3, { rz: Math.PI / 2 });
  // wall packs over the back doors
  for (const [z, tz] of [[-18.2, -18.2], [-0.5, -0.5], [19, 19]]) {
    P(new THREE.BoxGeometry(0.3, 0.25, 0.35), M.dark, X1 + T + 0.15, 3.4, z);
    P(new THREE.BoxGeometry(0.02, 0.15, 0.25), M.lamp, X1 + T + 0.31, 3.35, z);
    glows.push([X1 + T + 0.34, 3.35, z, 0.9]);
    const spot = new THREE.SpotLight(0xfff0d8, 120, 16, 1.0, 0.7, 1.6);
    spot.position.set(X1 + T + 0.4, 3.3, z); spot.target.position.set(X1 + 5, 0, tz);
    spot.userData.lampLight = true;
    group.add(spot, spot.target);
  }
  // chain-link fence along the back and the alleys, with trees beyond
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(z0 - z1, x1 - x0);
    const g = new THREE.PlaneGeometry(L, 2.4); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.12, uv.getY(i) * 2.4 / 0.12);
    P(g, M.fence, (x0 + x1) / 2, 1.2, (z0 + z1) / 2, ry, { cast: false, tint: 0xffffff });
    for (let t = 0; t <= L + 0.01; t += 3) P(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 6), M.steelK, x0 + (x1 - x0) * t / L, 1.25, z0 + (z1 - z0) * t / L);
  };
  fence(41.6, -34, 41.6, 34);
  fence(-24, 34, 41.6, 34); fence(-24, -34, 41.6, -34);
  // ...and round the front lot too, so the edge of the map is always something you can see
  fence(-42.2, -34, -42.2, 34); fence(-42.2, 34, -24, 34); fence(-42.2, -34, -24, -34);
  hedge(43.2, -34, 43.2, 34, 2.4, 1.2);
  for (let z = -30; z <= 30; z += 7.5) addKind(46 + Math.sin(z) * 1.2, z, 0, 0, 9, 0, 'tree');
  // the horizon: two staggered rows of trees all the way round, fading into the haze
  {
    let k = 0; const j = () => (Math.sin(k++ * 12.9898) * 43758.5453 % 1 + 1) % 1;
    for (const r of [0, 1]) {
      const ox = 50 + r * 7, oz = 41 + r * 7;
      for (let z = -oz; z <= oz; z += 5.5) for (const sx of [-1, 1]) addKind(sx * (ox + j() * 2.5), z + j() * 2, 0, 0, 10 + j() * 5, 0, 'tree');
      for (let x = -ox + 4; x <= ox - 4; x += 5.5) for (const sz of [-1, 1]) addKind(x + j() * 2, sz * (oz + j() * 2.5), 0, 0, 10 + j() * 5, 0, 'tree');
    }
  }
  // ---------- right lane (+z): the parking strip ----------
  // along the store wall a run of raised garden beds (hedges and lush planting, crouch-high cover), a sidewalk
  // with lamps and a bench, cars parallel-parked at the kerb, then the drive lane with a delivery van
  const bed = (x0, x1, z, d = 2.0) => {
    const w = x1 - x0, x = (x0 + x1) / 2;
    SB(M.concrete, w, 0.55, d, x, 0, z, { tint: 0xc8c0b0, grime: 0.3 });
    plane(M.dirt, w - 0.2, d - 0.2, x, z, 0.56);
    solid(x, z, w - 0.1, d - 0.1, 1.2, 0, 'dirt');
    hedge(x0 + 0.35, z - d / 2 + 0.5, x1 - 0.35, z - d / 2 + 0.5, 0.75, 0.6, true, 0.55);   // low box hedge along the back, ferns and grasses in front
    hedge(x0 + 0.5, z + 0.35, x1 - 0.5, z + 0.35, 0.4, 0.5, true, 0.55);   // a lower, lighter row in front
    for (let t = -w / 2 + 0.7; t <= w / 2 - 0.6; t += 0.9) for (let k = 0; k < 3; k++) P(new THREE.BoxGeometry(0.06, 0.06, 0.06), M.paint, x + t + k * 0.13, 1.0 + (k % 2) * 0.03, z + 0.2 + k * 0.1, k, { tint: [0xe8d040, 0xf0f0e8, 0xd8508a][(k + Math.round(t * 3)) % 3] });   // flowers
  };
  for (const [x0, x1] of [[-21.5, -15], [-13.5, -6.5], [-0.5, 6.5], [8, 14.5], [16, 21.5]]) bed(x0, x1, 25.6);
  plane(M.tile, 46, 1.8, -1, 27.5, 0.018);                                         // sidewalk
  B(M.concrete, 46, 0.14, 0.25, -1, 0, 28.45, 0, { grime: 0.2, cast: false });     // kerb
  plane(M.asphalt, 66.6, 5.6, 8.3, 31.2, 0.008);                                   // the street
  for (let x = -22; x < 40; x += 3) P(new THREE.PlaneGeometry(1.6, 0.12), M.line, x, 0.022, 31.4, 0, { rx: -Math.PI / 2, cast: false, tint: 0xe8e4d8 });
  for (const [x, ry] of [[-19.5, 0], [-9.5, Math.PI], [0.5, 0], [17.5, Math.PI]]) { buildCar(x, 29.6, ry, 0); carSolid(x, 29.6); }
  addKind(10, 29.7, 6.2, 2.3, 2.9, 0, 'truck', { back: 1 });                       // a box van at the kerb
  addKind(-4, 32.7, 7, 2.4, 3.3, 0, 'truck', {});                                   // delivery truck in the drive lane
  addKind(26, 31.8, 6.5, 2.4, 3.1, 0, 'truck', { food: 2 });                        // a food truck at the yard end
  addKind(-12.5, 27.5, 0, 0, 0, 0, 'vlamp'); addKind(5.5, 27.5, 0, 0, 0, 0, 'vlamp');
  addKind(-1.5, 27.6, 1.8, 0.6, 0.95, 0, 'bench');
  addKind(14.8, 27.4, 2.4, 1.4, 2.6, 0, 'kiosk');                                   // newsstand
  for (const [x, z, h] of [[-23.4, 25.4, 1.0], [-23.2, 26.6, 0.6], [7.25, 27.2, 0.8]]) SB(M.paint, 0.9, h, 0.9, x, 0, z, { tint: 0x2a62b8, grime: 0.2 }, 'metal');   // blue bulk crates
  for (const x of [-30, -6, 20, 36]) addKind(x, 36.5, 0, 0, 9, 0, 'tree');           // street trees past the fence

  // ---------- left lane (-z): service alley with the transformers and HVAC ----------
  const transformer = (x, z) => {
    SB(M.concrete, 2.2, 0.15, 2.0, x, 0, z, { tint: 0xb8b4ac, grime: 0.3 });
    SB(M.paint, 1.8, 1.45, 1.6, x, 0.15, z, { tint: 0x3d5a3a, grime: 0.35 }, 'metal');
    for (let i = 0; i < 6; i++) B(M.paint, 0.06, 1.1, 0.04, x - 0.6 + i * 0.24, 0.3, z + 0.82, 0, { tint: 0x2f4a2f, grime: 0.2 }); // cooling fins
    signMesh(signTex(['DANGER', 'HIGH VOLTAGE'], { bg: '#f2c63a', fg: '#1a1a1a', font: 'bold 50px Arial', w: 512, h: 220, border: '#1a1a1a' }), 0.6, 0.26, x, 1.2, z + 0.86, 0, 0.25);
  };
  transformer(-16, -27.4); transformer(-11.5, -27.4);
  for (const x of [-18.2, -13.75, -9.3]) { P(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 10), M.paint, x, 0.5, -25.9, 0, { tint: 0xe8c020 }); solid(x, -25.9, 0.25, 0.25, 1.0, 0, 'metal'); }
  const hvac = (x, z) => {
    SB(M.paint, 2.0, 1.4, 1.6, x, 0, z, { tint: 0x8a9096, grime: 0.3 }, 'metal');
    P(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 20), M.dark, x, 1.42, z);
    for (let i = 0; i < 4; i++) P(new THREE.BoxGeometry(1.2, 0.02, 0.08), M.steelK, x, 1.45, z, i * Math.PI / 4);
    P(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 8), M.steelK, x - 0.6, 2.3 + 1.4, -24.55); // line set up the wall
  };
  hvac(-4.8, -27.2); hvac(7.6, -27.2); hvac(11.2, -27.2);
  // meters and electrical panels on the wall, conduit to the roof
  for (const [x, w, h] of [[6.4, 0.9, 1.3], [7.6, 0.6, 0.9], [10.2, 0.9, 1.3], [11.4, 0.5, 0.7]]) {
    P(new THREE.BoxGeometry(w, h, 0.25), M.paint, x, 1.3 + h / 2, -24.53, 0, { tint: 0x8a9096 });
    P(new THREE.CylinderGeometry(0.04, 0.04, H - 1.3 - h, 6), M.steelK, x, (H + 1.3 + h) / 2, -24.5);
  }
  palletStack(16.5, -27.8, 0.8); palletStack(17.9, -27.6, 1.2);
  SB(M.paint, 1.2, 1.2, 1.0, 20.0, 0, -26.0, { tint: 0x5a3a2a, grime: 0.4 }, 'metal'); // grease bin
  // rooftop units (seen from outside)
  for (const [x, z] of [[-14, 12], [-3, -12], [9, 12], [9, -9]]) {
    U(ctx.worldBox(2.6, 1.4, 1.8, 1), M.paint, x, H + 0.35 + 0.7, z, 0, 0x9aa0a6);
    U(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 18), M.dark, x + 0.5, H + 1.8, z);
  }
  // hedges beyond the side fences
  for (const s of [-1, 1]) hedge(-40, s * 35.3, 41, s * 35.3, 2.2, 1.2);
  // map edge: right behind the fences
  solid(-42.8, 0, 1, 72, 10, 0, 'concrete');
  solid(42.3, 0, 1, 72, 10, 0, 'concrete');
  solid(0, 34.6, 86, 1, 10, 0, 'concrete');
  solid(0, -34.6, 86, 1, 10, 0, 'concrete');

  // ---------- flow: break up the long lines outside (alleys, lot lanes, yard) and inside (front corridor) ----------
  const wallSeg = (x, z, w, d, h = 2.6, tint = 0xffffff) => { SB(M.brick, w, h, d, x, 0, z, { tint, grime: 0.45 }, 'brick'); B(M.concrete, w + 0.12, 0.12, d + 0.12, x, h, z, 0, { tint: 0xc8c0b0, grime: 0.1 }); };
  // side alleys: staggered brick screen walls make a chicane instead of an 80 m corridor
    wallSeg(0.8, -26.4, 0.4, 3.6, 2.6, 0xe0c0a8); wallSeg(14, -28.8, 0.4, 3.6);
  wallSeg(28, -27.6, 0.4, 3.0);
  // lot lanes: cart corral shelters, a box van and an ice / propane merchandiser in the driving lanes
  const shelter = (x, z) => {
    SB(M.paint, 2.4, 1.2, 0.08, x, 0, z - 1.6, { tint: 0x2f5a3a, grime: 0.2 }, 'metal');
    SB(M.paint, 0.08, 1.2, 3.2, x - 1.2, 0, z, { tint: 0x2f5a3a, grime: 0.2 }, 'metal');
    for (const [dx, dz] of [[-1.15, -1.55], [1.15, -1.55], [-1.15, 1.55], [1.15, 1.55]]) P(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), M.dark, x + dx, 1.2, z + dz);
    B(M.metal, 2.6, 0.08, 3.4, x, 2.4, z, 0, { tint: 0x2f5a3a, grime: 0.15 });
    for (let i = 0; i < 4; i++) P(new RoundedBoxGeometry(0.9, 0.5, 0.55, 1, 0.03), M.steelK, x + 0.2, 0.75, z - 1.0 + i * 0.4, Math.PI / 2, { sx: 1 - i * 0.02, sy: 1 - i * 0.02, sz: 1 - i * 0.02 });
    solid(x + 0.2, z - 0.4, 0.6, 2.1, 0.55, 0.5, 'metal');   // just the carts' baskets
  };
  shelter(-26.2, -4); shelter(-39.6, 8);
  const boxVan = (x, z, tint) => {
    SB(M.paint, 2.2, 2.6, 5.4, x, 0.45, z, { tint, grime: 0.15 }, 'metal');
    solid(x, z - 0.9, 2.2, 7.2, 0.45, 0, 'metal');   // the chassis, under the cab too
    B(M.dark, 2.0, 0.42, 7.1, x, 0.03, z - 0.9, 0, { grime: 0 });   // (drawn: it's what you bump into)
    SB(M.paint, 2.1, 1.6, 1.8, x, 0.45, z - 3.5, { tint: 0xe8e8e4, grime: 0.15 }, 'metal');
    P(new THREE.BoxGeometry(1.9, 0.7, 0.04), M.glass, x, 1.75, z - 4.42, 0, { tint: 0xffffff });
    for (const s2 of [-1, 1]) for (const dz of [-3.4, 1.6]) P(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 14), M.rubber, x + s2 * 1.0, 0.4, z + dz, 0, { rz: Math.PI / 2 });
  };
  boxVan(-26.4, 17, 0x2a62b8); boxVan(37.6, -21.5, 0xe8e8e4);
  for (const z of [-6.5, 7.5]) {
    SB(M.paint, 1.6, 1.9, 0.8, -23.5, 0, z, { tint: 0xe8eef2, grime: 0.15 }, 'metal');
    signMesh(signTex('ICE', { bg: '#2f6db0', font: 'bold 96px Arial', w: 256, h: 128 }), 1.0, 0.45, -23.5 - 0.41, 1.55, z, -Math.PI / 2, 0.3);
  }
  // planter islands with trees at the ends of the parking rows
  for (const z of [-28.2, 28.2]) {
    SB(M.concrete, 10, 0.25, 1.8, -32.5, 0, z, { tint: 0xc8c0b0, grime: 0.3 });
    for (const x of [-35.5, -29.5]) { P(new THREE.CylinderGeometry(0.15, 0.2, 2.6, 8), M.woodOld, x, 1.3, z, 0, { tint: 0x8a7a5a }); P(new THREE.IcosahedronGeometry(1.6, 1), M.leaf, x, 3.4, z, x, { tint: 0x8aa070 }); solid(x, z, 0.4, 0.4, 2.6, 0, 'wood'); }
  }
  // yard: a shipping container along the back fence and a short block wall by the docks
  SB(M.paint, 2.5, 2.6, 6.1, 38.6, 0, 8.5, { tint: 0x8a3d2c, grime: 0.35 }, 'metal');
  for (let i = 0; i < 12; i++) B(M.paint, 0.04, 2.4, 0.08, 37.32, 0.1, 5.8 + i * 0.5, 0, { tint: 0x6a2d1c, grime: 0.2 });
  wallSeg(30.5, -2.8, 3.2, 0.4, 2.4, 0xd8d0c4);
  // ---------- the concept-art pass: a busier lot, a working service alley, a cluttered loading yard ----------
  // front: merchandise out on the sidewalk under the windows, cart corrals by both entrances, delivery pallets
  // among the cars, an extra row of cars and pallets on the widened lot ends
  SB(M.steelK, 1.0, 1.7, 2.2, -23.0, 0, -12.4, { tint: 0x9aa4ac, grime: 0.1 }, 'metal');            // propane exchange cage
  for (const dz of [-0.6, 0, 0.6]) P(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 10), M.paint, -23.0, 0.35, -12.4 + dz, 0, { tint: 0xe8e8e4 });
  signMesh(signTex(['PROPANE', 'EXCHANGE'], { bg: '#1f4e8a', font: 'bold 44px Arial', w: 256, h: 128 }), 0.9, 0.45, -23.52, 1.95, -12.4, -Math.PI / 2, 0.5);
  for (const z of [-3.2, 3.6]) { SB(M.cardboard, 1.1, 0.15, 1.1, -23.7, 0, z, { tint: 0xb89a6a }, 'wood'); SB(M.goodsBottle, 1.05, 1.25, 1.05, -23.7, 0.15, z, { grime: 0 }, 'wood'); }   // water pallets
  SB(M.paint, 1.1, 1.0, 1.6, -23.7, 0, 12.4, { tint: 0x5a3e28, grime: 0.2 }, 'wood');                // bagged mulch
  const corral = (x, z) => {
    solid(x, z, 2.6, 1.2, 1.0, 0, 'metal').pass = true;
    for (const s2 of [-1, 1]) B(M.steelK, 2.6, 0.05, 0.05, x, 0.95, z + s2 * 0.55, 0, { grime: 0 });
    for (let i = 0; i < 3; i++) P(new RoundedBoxGeometry(0.9, 0.5, 0.55, 1, 0.03), M.steelK, x - 0.8 + i * 0.4, 0.75, z, 0, { sx: 1 - i * 0.02, sy: 1 - i * 0.02, sz: 1 - i * 0.02 });
  };
  corral(-26.8, -20); corral(-26.8, 21.2);
  palletStack(-39.6, -15.5, 1.3); palletStack(-39.6, 15.8, 1.0); palletStack(-27, -9.4, 1.4); palletStack(-27, 9, 1.1);
  for (const sz of [-1, 1]) {
    for (const x of [-37.5, -28.5]) { buildCar(x, sz * 31.6, sz > 0 ? 0 : Math.PI, 0); carSolid(x, sz * 31.6); }
    palletStack(-33, sz * 31.8, 1.4); palletStack(-33, sz * 30.5, 0.9);
  }
  // long planters down the outer edge of the lot and along the right-side wall, so nobody gets a clean lane end to end
  const planter = (x, z, w, d) => {
    SB(M.concrete, w, 0.75, d, x, 0, z, { grime: 0.3 });
    solid(x, z, w * 0.9, d * 0.8, 1.2, 0.75, 'wood').pass = false;
    hedge(w > d ? x - w / 2 + 0.2 : x, w > d ? z : z - d / 2 + 0.2, w > d ? x + w / 2 - 0.2 : x, w > d ? z : z + d / 2 - 0.2, 1.55, Math.min(w, d) - 0.3);
  };
  for (const z of [-27, 27]) planter(-39.8, z, 4.4, 1.2);

  // delivery clutter breaking up the lot lengthwise
  palletStack(-29, -25, 1.6); palletStack(-24.6, -27.5, 1.3); palletStack(-35.6, -25, 1.0); palletStack(-26.4, 26.4, 1.5); addKind(-32.5, 26.6, 1.3, 1.3, 1.3, 0, 'crate');
  palletStack(-28, 0, 1.5); palletStack(-36, -8, 1.2); palletStack(-36, 8, 1.4);
  // tall stuff in the parking rows (cars alone are below eye height): a delivery van and head-high pallet runs
  addKind(-30.2, 6.6, 4.6, 2.2, 2.6, 0, 'truck', {});
  for (const sz of [-1, 1]) { palletStack(-37, sz * 13, 1.8); palletStack(-35, sz * 13, 1.6); palletStack(-33.4, sz * 12.9, 1.7); }
  palletStack(-25, -2, 1.8); palletStack(40.6, -9, 1.8); palletStack(-24.6, 24.9, 1.8); palletStack(26.4, 24.9, 1.8); palletStack(7.25, 25.1, 1.8); planter(-5.6, 25.0, 1.2, 0.9);
  // the storefront: neon over the windows like the sign inside, brick cladding on the corners
  for (let z = -30; z <= 30; z += 7.5) addKind(-44.6, z, 0, 0, 9 + (z % 2), 0, 'tree');                  // trees along the street out front
  // inside the doors: a promo pallet just past each entrance, so the lot can't see straight down an aisle
  for (const z of [-18.8, 18.6]) { SB(M.cardboard, 1.2, 1.5, 1.2, -18.6, 0, z, { grime: 0.05 }, 'wood'); face(M.goodsBox2, 1.1, 0.7, -19.21, 0.9, z, -Math.PI / 2, 1); }
  // service alley (-z): green dumpsters, a box truck at the kerb, pallets and crates on the widened outer side
  dumpster(-20, -31.6, 0x2f5a3a); dumpster(-17.6, -31.8, 0x2f5a3a); dumpster(19, -31.8, 0x3d4f63);
  addKind(4, -31.9, 7, 2.4, 3.3, 0, 'truck', { back: 1 });
  palletStack(-8, -31.6, 1.3); palletStack(-6.6, -31.9, 0.9); palletStack(11, -32, 1.5);
  addKind(-12.5, -32.2, 1.6, 1.6, 1.6, 0, 'crate'); addKind(-12.3, -32.2, 1.4, 1.4, 1.4, 1.6, 'crate'); addKind(26, -32.4, 1.6, 1.6, 1.6, 0, 'crate');
  for (const x of [-32, -10, 14, 34]) addKind(x, -36.6, 0, 0, 9, 0, 'tree');
  // loading yard: blue drums, crate stacks, a second forklift, and a fenced pallet compound on the +z end
  for (const [x, z] of [[29.5, -13.5], [30.2, -13.1], [29.8, -12.4], [33.6, 15.4], [34.2, 15.9], [24.8, -27.6], [25.5, -28]]) addKind(x, z, 0.62, 0.62, 0.9, 0, 'barrel', 1);
  signPost(9, 28.7, -14.3, Math.PI / 2);   // DANGER: CHEMICAL STORAGE by the drums
  signPost(8, 22.95, -13.6, Math.PI / 2);  // the smoker's sign by the staff door
  addKind(28.6, 20.6, 1.6, 1.6, 1.6, 0, 'crate'); addKind(28.8, 20.6, 1.4, 1.4, 1.4, 1.6, 'crate'); addKind(30.3, 20.9, 1.6, 1.6, 1.6, 0, 'crate');
  forklift(31.5, -28.5);
  palletStack(36.5, -29.5, 1.6); palletStack(36.5, -31.2, 1.1); palletStack(27.5, -31.5, 1.2);
  {
    // the compound: chain-link panels (you can see and shoot through), a gap to walk in, pallets stacked inside
    const cx0 = 31, cx1 = 37.5, cz0 = 25.5, cz1 = 32;
    for (const [x0, z0, x1, z1] of [[cx0, cz0, cx1, cz0], [cx0, cz1, cx1, cz1], [cx1, cz0, cx1, cz1], [cx0, cz0, cx0, cz0 + 2.5], [cx0, cz0 + 4.5, cx0, cz1]]) {
      fence(x0, z0, x1, z1);
      solid((x0 + x1) / 2, (z0 + z1) / 2, Math.max(0.08, x1 - x0), Math.max(0.08, z1 - z0), 2.4, 0, 'metal').pass = true;
    }
    palletStack(33, 27.5, 1.5); palletStack(34.3, 27.6, 1.0); palletStack(35.8, 30.2, 1.6); palletStack(33.2, 30.4, 1.2);
    hedge(cx0 + 0.3, cz1 + 0.45, cx1 - 0.3, cz1 + 0.45, 1.6, 0.6);   // a hedge along the back fence
  }

  // ---------- the smoker ----------
  const smoker = makeSmoker(group, 23.3, -16.4, -Math.PI / 2 - 0.3); // by the kitchen's staff door, facing out into the yard

  flushOver();
  const inside = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
  return {
    // S&D: sites each team defends ([x, z]); placed near the middle so both teams get there at about the same time
    sites: [[[-2.6, -14.8], [-4.3, 13.3]], [[10.6, -3.0], [8.6, 10.6]]],
    flagPos: [-2.5, 4.2],
    // upstairs offices for the bots: the floor at 3.2 m, the inside stair (deli side) and the outside fire stair
    upper: {
      y: 3.2, bounds: { minX: 10, maxX: 24.5, minZ: 7.5, maxZ: 24.5 },
      portals: [
        { rect: [10.4, 11.4, 12.1, 16.0], climb: [[11.25, 0, 10.6], [11.25, 0.6, 12.4], [11.25, 1.9, 14.2], [11.25, 3.2, 16.2], [11.25, 3.2, 16.8], [12.6, 3.2, 16.7]] },
        { rect: [22.4, 3.7, 23.8, 8.3], climb: [[23.1, 0, 2.9], [23.1, 0.6, 4.8], [23.1, 1.9, 6.6], [23.1, 3.2, 8.6], [23.1, 3.2, 9.3], [21.6, 3.2, 9.3]] },
      ],
    },
    ambient: { music: 'muzak', inside },
    // doors (js/doors.js): x, z = middle of the doorway; axis = the wall's direction
    doors: [
      { kind: 'slide', x: X0 - T / 2, z: -19, axis: 'z', w: 4, h: 2.6, glass: true },          // front entrances
      { kind: 'slide', x: X0 - T / 2, z: 18.6, axis: 'z', w: 4, h: 2.6, glass: true },
      { kind: 'traffic', x: 15, z: 0, axis: 'z', w: 2, h: 2.5 },                                 // sales floor <-> receiving
      { kind: 'traffic', x: 15, z: 17.4, axis: 'z', w: 1.6, h: 2.25 },                           // sales floor <-> racking
      { kind: 'swing', x: 18.8, z: 6, axis: 'x', w: 1.6, h: 2.25, tint: 0x6a7a8a },              // receiving | storage
      { kind: 'swing', x: 20.0, z: 14, axis: 'x', w: 1.6, h: 2.25, tint: 0x6a7a8a },             // storage | racking
      { kind: 'swing', x: -6.5, z: -19.5, axis: 'x', w: 1.6, h: 2.25, tint: 0x6a7a8a },           // behind the counter -> kitchen
      { kind: 'swing', x: 7.5, z: -19.5, axis: 'x', w: 1.6, h: 2.25, tint: 0x6a7a8a },            // -> dry storage
      { kind: 'swing', x: -1, z: -21.7, axis: 'z', w: 1.6, h: 2.25, tint: 0x6a7a8a },             // kitchen | cold room
      { kind: 'swing', x: 5, z: -21.7, axis: 'z', w: 1.6, h: 2.25, tint: 0xd8dcdc },              // cold room | dry storage
      { kind: 'traffic', x: 15, z: -17.2, axis: 'z', w: 1.6, h: 2.25 },                          // floor -> stock room
      { kind: 'swing', x: 19.75, z: -8, axis: 'x', w: 1.5, h: 2.25, tint: 0x6a7a8a },            // stock room -> receiving
      { kind: 'swing', x: X1 + T / 2, z: -18.6, axis: 'z', w: 1.6, h: 2.25, tint: 0x5a6a5a },   // staff door to the smoking area
      { kind: 'swing', x: -2.8, z: Z1 + T / 2, axis: 'x', w: 1.6, h: 2.25, tint: 0x8a2a24 },    // fire exit
      { kind: 'swing', x: -3.2, z: Z0 - T / 2, axis: 'x', w: 1.6, h: 2.25, tint: 0x5a6a5a },   // kitchen door to the alley
      { kind: 'swing', x: -12, z: -22.6, y: UP, axis: 'z', w: 1.6, h: 2.15, tint: 0x8a6a4a },   // upstairs: break room onto the catwalk
      { kind: 'swing', x: -17, z: -20.0, y: UP, axis: 'z', w: 1.6, h: 2.15, tint: 0x8a6a4a },   // break room | office
      { kind: 'swing', x: -13.0, z: Z0 - T / 2, y: UP, axis: 'x', w: 1.6, h: 2.15, tint: 0x5a6a5a }, // out to the alley stair
    ],
    menuCam(t, cam) {
      cam.position.set(Math.cos(t) * 44 - 4, 13 + Math.sin(t * 0.7) * 2, Math.sin(t) * 38);
      cam.lookAt(0, 1.5, 0);
    },
    update(dt, time) { if (smoker) smoker.update(dt, time); },
  };
}

// ---------- produce: loose fruit and vegetables ----------
// Each kind is one small low-poly shape drawn as an InstancedMesh, with a per-piece colour and size spread,
// stacked as a heap on a sloped bed (a coloured mound underneath fills the gaps). On Low detail only a
// sparse top layer is drawn.
function makeProduce(group, M, low) {
  const col = (geo, c) => {
    const n = geo.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
  const merge = (parts) => { const g = mergeGeometries(parts.map(([geo, c]) => col(clean(geo), c))); g.computeBoundingSphere(); return g; };
  const seg = low ? [6, 4] : [9, 6];
  // a round fruit, squashed / stretched, with a dimple at the stem end
  const round = (r, sy = 1, sx = 1, dimple = 0.25, c = 0xffffff, stem = 0x4a3a1a) => {
    const g = new THREE.SphereGeometry(r, seg[0], seg[1]);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / r, d = Math.max(0, y - 0.7) / 0.3;
      p.setXYZ(i, p.getX(i) * sx, (p.getY(i) - d * d * dimple * r) * sy, p.getZ(i));
    }
    g.computeVertexNormals();
    const parts = [[g, c]];
    if (stem !== null && !low) parts.push([new THREE.CylinderGeometry(r * 0.06, r * 0.05, r * 0.4, 4).translate(0, r * sy * (1 - dimple * 0.8) + r * 0.1, 0), stem]);
    return merge(parts);
  };
  const lemon = (r, c) => {
    const g = new THREE.SphereGeometry(r, seg[0], seg[1]);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / r; const tip = Math.pow(Math.abs(x), 6) * 0.25; p.setX(i, p.getX(i) * (1.35 + tip)); }
    g.computeVertexNormals();
    return merge([[g, c]]);
  };
  const banana = () => {
    const parts = [];
    for (let k = 0; k < (low ? 3 : 5); k++) {
      const off = (k - 2) * 0.026;
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(off, 0.02, -0.02), new THREE.Vector3(off * 1.4, 0.06, 0.08), new THREE.Vector3(off * 1.8, 0.02, 0.18));
      const tube = new THREE.TubeGeometry(curve, low ? 4 : 7, 0.017, low ? 4 : 6, false);
      parts.push([tube, 0xffffff]);
      parts.push([new THREE.SphereGeometry(0.008, 4, 3).translate(off * 1.8, 0.02, 0.185), 0x3a2a12]);
    }
    parts.push([new THREE.CylinderGeometry(0.02, 0.024, 0.05, 6).rotateX(Math.PI / 2).translate(0, 0.02, -0.04), 0x6a7a3a]);
    return merge(parts);
  };
  const pineapple = () => {
    const body = new THREE.SphereGeometry(0.065, seg[0], seg[1]).scale(1, 1.6, 1).translate(0, 0.1, 0);
    const parts = [[body, 0xc89a3a]];
    for (let k = 0; k < (low ? 4 : 8); k++) parts.push([new THREE.ConeGeometry(0.018, 0.16, 3).rotateZ((k % 2 ? 0.35 : 0.15)).rotateY(k * 0.8).translate(0, 0.26, 0), 0x3a6a2a]);
    return merge(parts);
  };
  const broccoli = () => {
    const parts = [[new THREE.CylinderGeometry(0.018, 0.025, 0.12, 6).translate(0, 0.05, 0), 0x7aa05a]];
    for (let k = 0; k < (low ? 3 : 6); k++) { const a = k * 1.2; parts.push([new THREE.IcosahedronGeometry(0.04, 0).translate(Math.cos(a) * 0.035, 0.12 + (k % 2) * 0.02, Math.sin(a) * 0.035), 0x2f5a24]); }
    return merge(parts);
  };
  const lettuce = () => {
    const g = new THREE.IcosahedronGeometry(0.085, low ? 0 : 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const n = Math.sin(p.getX(i) * 90) * Math.cos(p.getZ(i) * 80) * 0.012; p.setXYZ(i, p.getX(i) + n, p.getY(i) * 0.75 + n, p.getZ(i) - n); }
    g.computeVertexNormals();
    return merge([[g, 0xffffff]]);
  };
  const carrot = () => {
    const parts = [];
    for (let k = 0; k < (low ? 3 : 5); k++) {
      const a = (k - 2) * 0.08;
      parts.push([new THREE.ConeGeometry(0.014, 0.17, 5).rotateX(Math.PI / 2).rotateY(a).translate(k * 0.012 - 0.024, 0.015, 0.05), 0xffffff]);
      parts.push([new THREE.ConeGeometry(0.02, 0.12, 4).rotateX(-Math.PI / 2 - 0.4).rotateY(a).translate(k * 0.012 - 0.024, 0.04, -0.07), 0x3a7a2a]);
    }
    return merge(parts);
  };
  const melonTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#2d5a24'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#4f8a3a'; for (let i = 0; i < 8; i++) { x.beginPath(); for (let y = 0; y <= 64; y += 4) x.lineTo(i * 8 + Math.sin(y * 0.3 + i) * 1.5 + 2, y); for (let y = 64; y >= 0; y -= 4) x.lineTo(i * 8 + Math.sin(y * 0.3 + i) * 1.5 - 1.5, y); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const melonGeo = col(new THREE.SphereGeometry(0.14, seg[0] + 2, seg[1] + 1).scale(1, 0.85, 1.25), 0xffffff);
  // kind: geometry, colour spread [hex...], size jitter, spacing (m), roughness, mound colour, layers
  const KINDS = {
    apple: { geo: round(0.04, 0.92, 1, 0.3), cols: [0xb81c1c, 0xc8281e, 0x9a1414, 0xd0402a], rough: 0.38, gap: 0.082, bed: 0x6a1410 },
    apple2: { geo: round(0.04, 0.92, 1, 0.3), cols: [0x8ab83a, 0x9ac848, 0x7aa832], rough: 0.4, gap: 0.082, bed: 0x4a6a1a },
    pear: { geo: round(0.038, 1.35, 1, 0.1, 0xffffff), cols: [0xc8b83a, 0xb8a832, 0xa8a83a], rough: 0.5, gap: 0.08, bed: 0x6a6a1a },
    peach: { geo: round(0.038, 0.95, 1, 0.2, 0xffffff, null), cols: [0xf0905a, 0xe87048, 0xf0a868], rough: 0.8, gap: 0.08, bed: 0x8a4a2a },
    orange: { geo: round(0.042, 0.96, 1, 0.08, 0xffffff, null), cols: [0xf08a1a, 0xe87a12, 0xf89a28], rough: 0.72, gap: 0.086, bed: 0x8a4a0a },
    grapefruit: { geo: round(0.052, 0.95, 1, 0.08, 0xffffff, null), cols: [0xf0c050, 0xf0a860, 0xe8c868], rough: 0.7, gap: 0.104, bed: 0x8a6a2a },
    lemon: { geo: lemon(0.03, 0xffffff), cols: [0xf2d82a, 0xe8cc20, 0xf8e040], rough: 0.6, gap: 0.085, bed: 0x8a7a10 },
    lime: { geo: round(0.029, 0.95, 1, 0.05, 0xffffff, null), cols: [0x4a9a2a, 0x5aa830, 0x3a8a22], rough: 0.5, gap: 0.06, bed: 0x2a5a14 },
    tomato: { geo: round(0.036, 0.82, 1, 0.15, 0xffffff, 0x2a6a1a), cols: [0xd8281a, 0xc81e14, 0xe83a22], rough: 0.25, gap: 0.074, bed: 0x7a1410 },
    pepper: { geo: round(0.04, 1.05, 1, 0.35, 0xffffff, 0x2a6a1a), cols: [0xd81e14, 0xc81810], rough: 0.2, gap: 0.085, bed: 0x6a1010 },
    pepper2: { geo: round(0.04, 1.05, 1, 0.35, 0xffffff, 0x2a6a1a), cols: [0xf2c018, 0xf08a10, 0x3a8a22], rough: 0.2, gap: 0.085, bed: 0x6a5a10 },
    avocado: { geo: round(0.034, 1.4, 1, 0, 0xffffff, null), cols: [0x2a3a1a, 0x34401e, 0x22301a], rough: 0.85, gap: 0.075, bed: 0x1a2410 },
    onion: { geo: round(0.04, 0.9, 1, -0.3, 0xffffff, 0x8a6a3a), cols: [0xb88a4a, 0xa87a3a, 0xc89a5a], rough: 0.6, gap: 0.084, bed: 0x6a4a22 },
    potato: { geo: round(0.036, 0.75, 1.4, 0, 0xffffff, null), cols: [0x9a7a52, 0x8a6a48, 0xa88a5a], rough: 0.95, gap: 0.09, bed: 0x5a4430 },
    banana: { geo: banana(), cols: [0xf2d02a, 0xe8c820, 0xd8c838], rough: 0.55, gap: 0.2, gapZ: 0.16, bed: 0x6a5a1a, layers: 1, flat: true },
    melon: { geo: melonGeo, map: melonTex, cols: [0xffffff, 0xe8f0e0, 0xd8e8d0], rough: 0.4, gap: 0.3, gapZ: 0.36, bed: 0x2a4a1a, layers: 2 },
    pineapple: { geo: pineapple(), cols: [0xffffff, 0xf0e0c8], rough: 0.85, gap: 0.16, bed: 0x5a4a1a, layers: 1, flat: true },
    lettuce: { geo: lettuce(), cols: [0x8ac848, 0x7ab83a, 0x9ad058], rough: 0.7, gap: 0.16, bed: 0x3a6a1a, layers: 1, flat: true },
    broccoli: { geo: broccoli(), cols: [0xffffff, 0xe8f0e0], rough: 0.85, gap: 0.12, bed: 0x2a4a1a, layers: 1, flat: true },
    carrot: { geo: carrot(), cols: [0xf07818, 0xe86a12], rough: 0.7, gap: 0.13, gapZ: 0.3, bed: 0x6a3a0a, layers: 1, flat: true },
  };
  const inst = {}, mounds = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return {
    // a heap of `kind` on a w x d bed centred at (x, z), top surface at y, rising by `tilt` per metre toward +z
    bed(kind, x, y, z, w, d, tilt = 0) {
      const K = KINDS[kind]; if (!K) return;
      // the mound: a sloped coloured block that fills the gaps between pieces
      const mh = 0.05, mg = new THREE.BoxGeometry(w, mh, d);
      const p = mg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + (p.getZ(i) + d / 2) * tilt);
      mg.translate(x, y + mh / 2 - 0.02, z);
      if (!mounds.has(K.bed)) mounds.set(K.bed, []);
      mounds.get(K.bed).push(mg);
      const list = inst[kind] || (inst[kind] = []);
      const gx = K.gap, gz = K.gapZ || K.gap;
      const nx = Math.max(1, Math.floor(w / gx)), nz = Math.max(1, Math.floor(d / gz));
      const layers = low ? 1 : K.layers || 1;
      for (let L = 0; L < layers; L++) {
        const shrink = L * gx * 0.9;   // upper layer sits inset, a heap rather than a slab
        for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
          const u = -w / 2 + (i + 0.5 + (L ? 0.5 : 0)) * (w / nx), t = -d / 2 + (k + 0.5 + (L ? 0.5 : 0)) * (d / nz);
          if (L && (Math.abs(u) > w / 2 - shrink || Math.abs(t) > d / 2 - shrink)) continue;
          if (low && (i + k) % 2) continue;
          const jx = (rnd() - 0.5) * gx * 0.25, jz = (rnd() - 0.5) * gz * 0.25;
          const px = x + u + jx, pz = z + t + jz;
          const py = y + (t + d / 2) * tilt + L * gx * 0.62 + mh * 0.4;
          const s = 0.88 + rnd() * 0.24;
          e.set(K.flat ? (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * 1.4, rnd() * Math.PI * 2, K.flat ? (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * 1.4);
          if (K.flat) e.x += -Math.atan(tilt);
          q.setFromEuler(e); sc.set(s, s, s); v.set(px, py, pz);
          list.push([m4.compose(v, q, sc).clone(), K.cols[(rnd() * K.cols.length) | 0], 0.92 + rnd() * 0.12]);
        }
      }
    },
    flush() {
      for (const [kind, list] of Object.entries(inst)) {
        const K = KINDS[kind];
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: K.rough, metalness: 0, map: K.map || null });
        M['fruit_' + kind] = mat;
        const im = new THREE.InstancedMesh(K.geo, mat, list.length);
        const c = new THREE.Color();
        list.forEach(([m, hex, b], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(hex).multiplyScalar(b)); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = false; im.receiveShadow = true; im.userData.noMinimap = true;
        group.add(im);
      }
      for (const [hex, list] of mounds) {
        const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9 });
        M['mound_' + hex] = mat;
        const m = new THREE.Mesh(mergeGeometries(list), mat);
        m.receiveShadow = true; m.userData.noMinimap = true;
        group.add(m);
      }
    },
  };
}

// ---------- the soldier on his smoke break ----------
// Plays the idle animation, raises the cigarette to his mouth every few seconds and breathes out a
// puff. He has no collision and no hitbox: nothing in the match touches him.
let SMOKE_FWD = 0.26, SMOKE_UP = -0.02;
export function setSmokeTune(f, u) { SMOKE_FWD = f; SMOKE_UP = u; }
function makeSmoker(group, x, z, yaw) {
  const sol = cloneSoldier(0, { rim: false });
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  // cigarette + ember on a hand anchor
  const cig = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.075, 6), new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.8 }));
  stick.rotation.z = Math.PI / 2;
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff5a1a, emissiveIntensity: 4 }));
  ember.position.x = 0.04;
  cig.add(stick, ember);
  // smoke: soft puffs that rise, drift and fade
  const N = 40;
  const smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(230,230,230,0.55)'); grd.addColorStop(1, 'rgba(230,230,230,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const pos = new Float32Array(N * 3), parts = Array.from({ length: N }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), p: new THREE.Vector3(), s: 0 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sizes = new Float32Array(N), alphas = new Float32Array(N);
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: smokeTex } },
    vertexShader: 'attribute float size; attribute float alpha; varying float vA; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying float vA; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb, c.a * vA); }',
    transparent: true, depthWrite: false,
  });
  const smoke = new THREE.Points(geo, mat);
  smoke.frustumCulled = false;
  group.add(smoke);
  let next = 0;
  const emit = (p, v, s, life) => {
    const q = parts[next++ % N];
    q.p.copy(p); q.v.copy(v); q.s = s; q.life = q.max = life;
  };
  const _t = new THREE.Vector3(), _m = new THREE.Vector3(), _f = new THREE.Vector3(), _pole = new THREE.Vector3(), _h = new THREE.Vector3();
  let cycle = 3, exhaleAt = -1, trickle = 0;
  // without the rigged model (offline fallback) there's just the smoke from where he'd stand
  if (sol) { root.add(sol.root); sol.actions.Idle.setEffectiveWeight(1); sol.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
  const hand = sol && (sol.bones.RightHand || null);
  if (hand) hand.add(cig); else root.add(cig);
  if (hand) { cig.position.set(0.02, 0.09, 0.03); cig.rotation.set(0, 0.4, 0.3); cig.scale.setScalar(1 / (hand.getWorldScale(_h).x || 1)); }
  return {
    update(dt, time) {
      const B = sol && sol.bones;
      if (sol) sol.mixer.update(dt);
      root.updateMatrixWorld(true);
      // puff cycle (~8 s): lift the hand to the mouth, hold, lower, breathe out
      cycle = (time % 8);
      const up = cycle < 1.0 ? cycle / 1.0 : cycle < 2.0 ? 1 : cycle < 2.8 ? 1 - (cycle - 2.0) / 0.8 : 0;
      const k = up * up * (3 - 2 * up);
      if (B && B.Head && B.RightHand && B.RightArm) {
        B.Head.getWorldPosition(_m);
        _f.set(-Math.sin(yaw), 0, -Math.cos(yaw)); // the rig faces -z
        // the wrist stops in front of the chin (the cigarette between the fingers reaches the lips),
        // so the hand never goes into the helmet
        const right0 = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
        const mouth = _t.copy(_m).addScaledVector(_f, SMOKE_FWD).addScaledVector(right0, -0.02).add(new THREE.Vector3(0, SMOKE_UP, 0));
        // rest: hand at the hip, a bit forward
        B.RightArm.getWorldPosition(_h);
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const rest = new THREE.Vector3().copy(_h).addScaledVector(right, 0.02).addScaledVector(_f, 0.18).add(new THREE.Vector3(0, -0.45, 0));
        const target = rest.lerp(mouth, k);
        _pole.copy(right).multiplyScalar(0.6).add(new THREE.Vector3(0, -1.2, 0)).addScaledVector(_f, -0.2);
        armIK(B, 'Right', target, _pole);
        B.RightHand.updateWorldMatrix(true, true);
      }
      if (cycle > 2.6 && exhaleAt < 0) exhaleAt = time;
      if (cycle < 2.6) exhaleAt = -1;
      // ember brightens on the draw
      ember.material.emissiveIntensity = 3 + (cycle > 1.0 && cycle < 2.0 ? 5 : Math.sin(time * 9) * 0.6);
      // a thin trickle from the tip, a cloud on the exhale
      cig.updateMatrixWorld(true);
      ember.getWorldPosition(_h);
      trickle -= dt;
      if (trickle <= 0) { trickle = 0.12; emit(_h, new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.22, (Math.random() - 0.5) * 0.04), 0.05, 2.2); }
      if (exhaleAt > 0 && time - exhaleAt < 1.2 && B && B.Head) {
        B.Head.getWorldPosition(_m).addScaledVector(_f.set(-Math.sin(yaw), 0, -Math.cos(yaw)), 0.15); _m.y += 0.05;
        if (Math.random() < 0.6) emit(_m, new THREE.Vector3(-Math.sin(yaw) * 0.5 + (Math.random() - 0.5) * 0.15, 0.12 + Math.random() * 0.1, -Math.cos(yaw) * 0.5 + (Math.random() - 0.5) * 0.15), 0.12, 2.6);
      }
      for (let i = 0; i < N; i++) {
        const q = parts[i];
        if (q.life > 0) {
          q.life -= dt;
          q.p.addScaledVector(q.v, dt);
          q.v.multiplyScalar(1 - dt * 0.6); q.v.y += dt * 0.05; q.v.x += dt * 0.04;
          q.s += dt * 0.12;
        }
        const a = q.life > 0 ? Math.min(1, q.life / q.max * 1.5) * 0.5 : 0;
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        sizes[i] = q.s; alphas[i] = a;
      }
      geo.attributes.position.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.alpha.needsUpdate = true;
    },
  };
}
