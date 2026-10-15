// Freshway: an indoor map. A big neighbourhood supermarket under one roof: neon-lit checkout lanes
// and customer service along the front windows, grocery aisles 1-6 through the middle with a promo display,
// the deli and a large bakery with its ovens in the back, the stockroom with the loading bay and receiving
// doors, an employees-only kitchen and cold storage, and upstairs offices and a break room reached by a
// staircase inside the store and a metal fire stair outside. Skylights in the roof.
// Outside: the parking lot out front (team A spawn), the right lane parking strip with planters, the
// left lane service alley with transformers and HVAC units, and the back loading yard (team B spawn) with
// a semi at the dock, a forklift, dumpsters and the staff smoking area, where a soldier on his break
// smokes a cigarette and minds his own business whatever happens. Ceiling speakers play the store's music.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cloneSoldier } from './assets.js';
import { armIK } from './character.js';

// store shell: x -22..22 (front at -x), z -24..24, 6 m to the roof
const X0 = -22, X1 = 22, Z0 = -24, Z1 = 24, H = 6, T = 0.4;

export const MART = {
  id: 'mart',
  name: 'Freshway',
  // indoors under fluorescent tubes: a touch less exposure than the street maps, so the floor doesn't glare
  look: { exposure: 0.8, env: 0.45, hemi: 0.55 },
  blurb: 'Indoor supermarket: aisles, deli, bakery, upstairs offices; parking lot and loading yard, broken up by walls and vehicles',
  photos: ['assets/loading/mart-1.jpg', 'assets/loading/mart-2.jpg'],
  spawns2: [
    [[-38, -20], [-38, -12], [-38, -4], [-38, 4], [-38, 12], [-38, 20], [-40, -8], [-40, 8]],
    [[37, -20], [37, -12], [36, -3.5], [37, 5], [37, 12], [38, 20], [39, -11.5], [39, 9]],
  ],
  pickups: [
    { type: 'health', pos: [-2.5, 0, 3] },
    { type: 'health', pos: [13.5, 0, -6.8] },
    { type: 'health', pos: [-14, 0, 23] },
    { type: 'ammo', pos: [-13, 0, -4] },
    { type: 'ammo', pos: [9, 0, 6.5] },
    { type: 'ammo', pos: [-2.5, 0, -21] },
    { type: 'ammo', pos: [0, 0, 22.2] },
    { type: 'ammo', pos: [14.6, 3.2, 12.6] },   // upstairs office
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
  const { M, B, put, solid, plane, decal, glows, group, buildCar, physics } = ctx;
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
  });
  ctx.S.accent = 1.2;
  ctx.S.vinyl = 1.2; // metres per floor texture (4 x 4 tiles of 30 cm)
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
  plane(M.asphalt, 20.4, 61, -32.2, 0, 0.0);                 // parking lot
  plane(M.concrete, 20, 61, 32.4, 0, 0.004);                  // delivery yard
  for (const sz of [-1, 1]) plane(M.concrete, 44.8, 6.6, 0, sz * 27.4, 0.003); // side alleys
  plane(M.storeFloor, 44, 48, 0, 0, 0.01, 0, 0x9c978e);        // sales floor (toned down: it read as blinding white)
  plane(M.bakeryFloor, 11.2, 18, 16.4, -15, 0.014);            // bakery: terracotta diamonds
  if (M.marble) { plane(M.marble, 3.6, 7.2, -20.2, -19, 0.016); plane(M.marble, 3.6, 7.2, -20.2, 18.6, 0.016); } // entrance halls
  if (M.hexblack) plane(M.hexblack, 4.3, 10, 12.85, 0, 0.015);  // behind the deli counter
  if (M.hexblack) plane(M.hexblack, 5, 16, 14.5, 16, 0.02);     // kitchen
  if (M.whitetile) plane(M.whitetile, 5, 7, 19.5, 11.5, 0.02);  // cold storage
  if (M.octagon) plane(M.octagon, 5, 9, 19.5, 19.5, 0.02);      // locker corridor
  // coloured accent tiles: two bands down the cross aisle and a square under the promo display
  for (const z of [-4.6, 4.6]) plane(M.accent, 24, 1.2, -3.4, z, 0.017);
  plane(M.accent, 3.6, 3.6, -1.5, -0.8, 0.017);
  // front sidewalk + curb
  plane(M.tile, 3, 61, -23.9, 0, 0.02);
  B(M.concrete, 0.25, 0.14, 61, -25.5, 0, 0, 0, { grime: 0.2, cast: false });
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
      solid(x, z, w, d, y1 - y0, y0 + base, s);
      B(m, w, y1 - y0, d, x, y0 + base, z, 0, { tint: tn, grime: base ? 0.1 : 0.25, base });
    };
    let cur = 0;
    for (const [a, b, top, bottom = 0, glass = false] of [...opens].sort((p, q) => p[0] - q[0])) {
      piece(cur, a, 0, h);
      piece(a, b, top, h);
      if (bottom > 0) piece(a, b, 0, bottom);
      if (glass) {
        piece(a, b, bottom, top, M.clearGlass, 'glass', 0xffffff);
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
  // back: stockroom roll-up door, bakery back door, staff door to the smoking area
  wallLine(X1 + T / 2, Z0 - T, X1 + T / 2, Z1 + T, H, T, [[5.0, 6.6, 2.3], [21.4, 25.6, 3.6], [32.8, 34.6, 5.4, 3.2], [41.4, 43, 2.3]], M.concrete, shellTint);
  // sides: a fire exit each
  wallLine(X0, Z1 + T / 2, X1, Z1 + T / 2, H, T, [[18.4, 20, 2.3]], M.concrete, shellTint);
  wallLine(X0, Z0 - T / 2, X1, Z0 - T / 2, H, T, [[24.4, 26, 2.3]], M.concrete, shellTint);
  // brick wainscot outside, metal coping at the top
  for (const [x, z, w, d] of [[X0 - T - 0.03, 0, 0.06, 48.8], [X1 + T + 0.03, 0, 0.06, 48.8], [0, Z1 + T + 0.03, 44.8, 0.06], [0, Z0 - T - 0.03, 44.8, 0.06]]) {
    B(M.metal, w + 0.06, 0.25, d + 0.06, x, H - 0.25, z, 0, { tint: 0x5a5e62, grime: 0 });
  }
  for (const sz of [-1, 1]) B(M.brick, 44.8, 1.1, 0.06, 0, 0, sz * (Z1 + T + 0.03), 0, { grime: 0.3 });
  B(M.brick, 0.06, 1.1, 2.6, X1 + T + 0.03, 0, -22.7, 0, { grime: 0.3 });
  // roof: its own meshes (cast shadows, hidden on the minimap)
  const roofGeo = [], ceilGeo = [];
  const rb = new THREE.BoxGeometry(44.8, 0.35, 48.8); rb.translate(0, H + 0.175, 0); roofGeo.push(rb);
  solid(0, 0, 44.8, 48.8, 0.35, H, 'concrete');
  // exposed ceiling: steel trusses, ducts and light fixtures
  for (let x = -18; x <= 18; x += 6) { const g = new THREE.BoxGeometry(0.25, 0.5, 48); g.translate(x, H - 0.25, 0); ceilGeo.push(g); }
  for (const z of [-12, 12]) { const g = new THREE.CylinderGeometry(0.35, 0.35, 32, 12); g.rotateZ(Math.PI / 2); g.translate(-5, H - 0.9, z); ceilGeo.push(g); }
  const fixGeo = [];
  for (let x = -19; x <= 7; x += 4.3) for (let z = -21; z <= 21; z += 5.4) { const g = new THREE.BoxGeometry(2.4, 0.06, 0.32); g.translate(x, H - 1.25, z); fixGeo.push(g); }
  for (const [x, z] of [[11, -20], [11, -13], [16, -20], [16, -13], [11, 0], [17, 0], [14.5, 12], [19.5, 11.5], [14.5, 20], [19.5, 20]]) { const g = new THREE.BoxGeometry(1.2, 0.06, 0.6); g.translate(x, x > 12 && z > 6 ? 2.98 : H - 1.25, z); fixGeo.push(g); }
  for (const [x, z] of [[14.5, 10.5], [14.5, 14.5], [14.5, 21], [19.5, 12], [19.5, 20]]) { const g = new THREE.BoxGeometry(1.2, 0.06, 0.6); g.translate(x, H - 0.62, z); fixGeo.push(g); } // upstairs
  const roofMesh = new THREE.Mesh(mergeGeometries(roofGeo), std({ color: 0x4a4c50, roughness: 0.9 }));
  const ceilMesh = new THREE.Mesh(mergeGeometries(ceilGeo), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.7 }));
  const fixMesh = new THREE.Mesh(mergeGeometries(fixGeo), M.coolLight);
  roofMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(roofMesh.geometry.attributes.position.count * 3).fill(1), 3));
  for (const m of [roofMesh, ceilMesh, fixMesh]) { m.userData.noMinimap = true; m.castShadow = m !== fixMesh; m.receiveShadow = true; group.add(m); }
  M.roofMat = roofMesh.material; M.ceilMat = ceilMesh.material;
  // store lights (off on Low, like the other maps' lamps)
  for (const [x, z, y = H - 1.5, col = 0xf2f6ff, I = 22, R = 20] of [[-14, -11], [-14, 11], [-1, -12], [-1, 12], [15, -15], [16, 15, H - 1.0, 0xfff4e4, 16, 12], [14.5, 16, 2.6, 0xf4f6ff, 10, 10], [19.5, 11.5, 2.6, 0xcfe6ff, 7, 8]]) {
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
      P(new RoundedBoxGeometry(0.9, 0.5, 0.55, 1, 0.03), M.steelK, cx, 0.75, z, 0, { sx: 1 - i * 0.01 });
      P(new THREE.BoxGeometry(0.06, 0.04, 0.6), M.paint, cx - 0.5, 1.05, z, 0, { tint: 0xc8322b });
    }
    solid(x + n * 0.19, z, n * 0.38 + 0.7, 0.7, 1.05, 0, 'metal');
  };
  carts(-21.2, 22.6, 5); carts(-21.2, -22.6, 4);
  // neon over the front end: CHECKOUTS above the lanes (both faces), CUSTOMER SERVICE over the desk
  for (const [x, ry] of [[-16.0, Math.PI / 2], [-16.12, -Math.PI / 2]]) neon('CHECKOUTS', '#2ef2d0', 6.4, 1.2, x, 4.25, 0, ry, false);
  B(M.dark, 0.06, 0.9, 6.0, -16.06, 3.8, 0, 0, { grime: 0 });
  for (const z of [-2.6, 2.6]) P(new THREE.CylinderGeometry(0.008, 0.008, 1.3, 4), M.dark, -16.06, 5.35, z);
  neon('CUSTOMER SERVICE', '#2ef2d0', 3.6, 0.55, -21.75, 2.7, -14.4, Math.PI / 2, true, 'bold 110px Arial');
  // shopping-cart pyramid of a display near the front: water packs
  SB(M.cardboard, 1.6, 0.9, 1.2, -13.2, 0, -17, { grime: 0.05 }, 'wood');
  SB(M.goodsBottle, 1.2, 0.6, 0.9, -13.2, 0.9, -17, { grime: 0 }, 'wood');

  // ---------- aisles ----------
  const gondola = (x0, x1, z, goods) => {
    const L = x1 - x0, cx = (x0 + x1) / 2;
    solid(cx, z, L, 1.15, 2.05, 0, 'metal');
    B(M.shelf, L, 0.14, 1.1, cx, 0, z, 0, { grime: 0.1 });
    B(M.shelf, L, 2.0, 0.06, cx, 0.14, z, 0, { grime: 0 });
    let k = 0;
    for (const y of [0.16, 0.58, 1.0, 1.42]) {
      for (const s of [-1, 1]) {
        B(M.shelf, L, 0.03, 0.5, cx, y, z + s * 0.29, 0, { grime: 0 });
        face(goods[(k + (s > 0 ? 0 : 1)) % goods.length], L - 0.04, 0.38, cx, y + 0.22, z + s * 0.5, s > 0 ? 0 : Math.PI, 1);
        B(M.paint, L, 0.035, 0.012, cx, y, z + s * 0.555, 0, { tint: 0xf2e8c0, grime: 0 }); // price strip
      }
      k++;
    }
    // top stock on both sides
    for (const s of [-1, 1]) B(M.cardboard, L - 0.2, 0.3, 0.45, cx, 2.14, z + s * 0.27, 0, { grime: 0.05 });
    // end caps with a promo stack
    for (const e of [x0, x1]) {
      const ex = e + Math.sign(e - cx) * 0.3;
      SB(M.shelf, 0.6, 1.5, 1.1, ex, 0, z, { grime: 0 }, 'metal');
      for (const y of [0.3, 0.8]) face(GOODS[(k++) % 4], 1.0, 0.36, ex + Math.sign(e - cx) * 0.31, y + 0.22, z, Math.sign(e - cx) > 0 ? Math.PI / 2 : -Math.PI / 2, 1);
    }
  };
  const rows = [-18.5, -13, -7.5, 7.5, 13];
  rows.forEach((z, i) => {
    const goods = [GOODS[i % 4], GOODS[(i + 1) % 4], GOODS[(i + 2) % 4]];
    gondola(-11, -3.9, z, goods);
    gondola(-1.1, 6.6, z, goods);
  });
  // aisle signs hanging from the ceiling
  const aisleNames = [['1', 'FROZEN · ICE CREAM'], ['2', 'CEREAL · BREAKFAST'], ['3', 'CANNED · SOUP'], ['4', 'SNACKS · SODA'], ['5', 'BAKING · SPICES'], ['6', 'WEEKLY DEALS']];
  [-21.2, -15.75, -10.25, 10.25, 15.75, 3.3].forEach((z, i) => {
    const tex = signTex([`AISLE ${aisleNames[i][0]}`, aisleNames[i][1]], { bg: i === 5 ? '#c8322b' : '#1f4e8a', fg: '#ffffff', font: 'bold 44px Arial', w: 512, h: 160 });
    for (const s of [0, Math.PI]) signMesh(tex, 2.2, 0.69, 1.5 + (s ? -0.01 : 0.01), 3.9, z, s + Math.PI / 2, 0.6, { noMinimap: true });
    P(new THREE.CylinderGeometry(0.01, 0.01, 1.6, 4), M.dark, 1.5, 5.0, z);
  });
  // wall freezers along the south wall
  for (let x = -11; x < 7; x += 3) {
    if (x === 1) continue; // fire exit
    SB(M.shelf, 3, 2.25, 0.95, x + 1.5, 0, -23.45, { tint: 0x2a2c30, grime: 0 }, 'metal');
    face(GOODS[(x + 11) / 3 % 4 | 0], 2.8, 1.7, x + 1.5, 1.1, -23.0, 0, 1);
    face(M.clearGlass, 2.9, 1.9, x + 1.5, 1.15, -22.94, 0, 3);
    for (const dx of [0, 1, 2, 3]) B(M.steelK, 0.05, 1.95, 0.05, x + dx, 0.2, -22.93, 0, { grime: 0 });
    P(new THREE.BoxGeometry(2.8, 0.04, 0.04), M.coolLight, x + 1.5, 2.08, -22.95);
  }
  // produce: angled bins on the north side, a misted wall case behind
  for (const x of [-10, -6, -2, 2, 6]) for (const z of [17.3, 20.5]) {
    SB(M.woodOld, 2.6, 0.85, 1.6, x, 0, z, { tint: 0x8a6a4a, grime: 0.1 }, 'wood');
    const g = new THREE.PlaneGeometry(2.5, 1.5); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 1.5);
    P(g, M.produce, x, 0.98, z, 0, { rx: -Math.PI / 2 + 0.25, cast: false });
  }
  for (let x = -11; x < 7; x += 3) {
    if (x === -5) continue; // fire exit
    SB(M.shelf, 3, 2.0, 0.9, x + 1.5, 0, 23.5, { tint: 0x2a3a2a, grime: 0 }, 'metal');
    face(M.produce, 2.9, 1.4, x + 1.5, 1.0, 23.04, Math.PI, 1.5);
    P(new THREE.BoxGeometry(2.8, 0.04, 0.04), M.coolLight, x + 1.5, 1.85, 23.0);
  }
  const prodSign = signTex('FRESH PRODUCE', { bg: '#2f6a2a', font: 'bold 64px Arial' });
  signMesh(prodSign, 4, 1, -2, 3.6, 23.9, Math.PI, 0.6, { noMinimap: true });
  // middle of the floor: staggered displays so the centre aisle isn't a straight shot
  SB(M.cardboard, 2.2, 1.9, 2.2, -8, 0, 0.6, { grime: 0.05 }, 'wood');
  for (const s of [-1, 1]) face(M.goodsCan, 2.1, 0.5, -8, 0.95, 0.6 + s * 1.11, s > 0 ? 0 : Math.PI, 1);
  SB(M.shelf, 4, 2.0, 1.7, -1.5, 0, -0.8, { tint: 0x2a2c30, grime: 0 }, 'metal'); // cooler island
  for (const s of [-1, 1]) { face(M.goodsBottle, 3.8, 1.5, -1.5, 1.0, -0.8 + s * 0.8, s > 0 ? 0 : Math.PI, 1); face(M.clearGlass, 3.9, 1.7, -1.5, 1.0, -0.8 + s * 0.86, s > 0 ? 0 : Math.PI, 4); }
  SB(M.cardboard, 1.8, 1.9, 1.8, 4.5, 0, 1.6, { grime: 0.05 }, 'wood');
  face(M.goodsBox, 1.7, 0.6, 4.5, 0.6, 2.51, 0, 1);
  SB(M.cardboard, 1.4, 1.5, 1.4, -13, 0, 2.5, {}, 'wood');
  SB(M.cardboard, 1.4, 1.5, 1.4, -13, 0, 17, {}, 'wood');

  // ---------- bakery (back left) ----------
  // display counter with bread and pastries under glass, a gap at the end into the kitchen
  for (const [z0, z1] of [[-22.5, -11]]) {
    const L = z1 - z0, cz = (z0 + z1) / 2;
    SB(M.woodOld, 1.0, 1.0, L, 10.2, 0, cz, { tint: 0x9a7a5a }, 'wood');
    B(M.steelK, 1.05, 0.04, L, 10.2, 1.0, cz, 0, { grime: 0 });
    face(M.clearGlass, L, 0.45, 9.69, 1.25, cz, -Math.PI / 2, 3);
    solid(10.2, cz, 1.0, L, 1.48, 0, 'glass');
    for (let z = z0 + 0.4; z < z1 - 0.3; z += 0.42) {
      P(new RoundedBoxGeometry(0.3, 0.12, 0.16, 2, 0.05), M.bread, 10.15, 1.1, z, 0.3);
      if ((z * 10 | 0) % 3 === 0) P(new THREE.SphereGeometry(0.07, 10, 6), M.crust, 10.4, 1.09, z + 0.1);
    }
  }
  neon('BAKERY', '#ff4fa8', 4.4, 0.95, 9.6, 3.7, -17, -Math.PI / 2, true, 'italic bold 140px Georgia');
  for (const z of [-20.6, -13.4]) P(new THREE.CylinderGeometry(0.008, 0.008, 1.9, 4), M.dark, 9.6, 5.1, z);
  // rack ovens and a deck oven along the back wall, glowing through their windows
  const rackOven = (x, z) => {
    SB(M.steelK, 1.5, 2.6, 1.5, x, 0, z, { grime: 0 }, 'metal');
    P(new THREE.BoxGeometry(0.02, 1.4, 0.7), M.ovenGlow, x - 0.76, 1.3, z);
    P(new THREE.BoxGeometry(0.06, 0.4, 0.3), M.dark, x - 0.77, 2.25, z + 0.4);
    B(M.steelK, 1.8, 0.5, 1.8, x, 2.95, z, 0, { grime: 0.2 });
  };
  rackOven(20.8, -22.6); rackOven(20.8, -20.8);
  // deck oven: three glowing decks
  SB(M.steelK, 1.3, 2.0, 3.0, 21.1, 0, -14.6, { grime: 0 }, 'metal');
  for (const y of [0.6, 1.1, 1.6]) P(new THREE.BoxGeometry(0.02, 0.18, 2.4), M.ovenGlow, 20.44, y, -14.6);
  B(M.steelK, 1.5, 0.6, 3.2, 21.1, 2.0, -14.6, 0, { grime: 0.2 });
  rackOven(20.8, -10.4);
  signMesh(signTex('CAUTION · HOT OVENS', { bg: '#e8c020', fg: '#1a1a1a', font: 'bold 50px Arial' }), 1.4, 0.35, 22.0 - 0.03, 3.1, -14.6, -Math.PI / 2, 0.3, { noMinimap: true });
  // work tables with dough and loaves, a mixer, bread carts, flour
  const worktable = (x, z, w, d) => {
    SB(M.steelK, w, 0.9, d, x, 0, z, { grime: 0 }, 'metal');
    for (let i = 0; i < 6; i++) P(new RoundedBoxGeometry(0.26, 0.1, 0.16, 2, 0.05), M.bread, x + (i % 3 - 1) * 0.5, 0.95, z + ((i / 3) | 0) * 0.35 - 0.17, i * 0.4, { tint: i % 2 ? 0xf0dcc0 : 0xffffff });
  };
  worktable(15, -20.5, 3, 1.2); worktable(15, -14.5, 3, 1.2);
  SB(M.steelK, 0.9, 1.3, 0.9, 13, 0, -9, { grime: 0 }, 'metal');
  P(new THREE.CylinderGeometry(0.35, 0.3, 0.45, 16), M.steelK, 13, 1.5, -9);
  const breadCart = (x, z) => {
    solid(x, z, 0.7, 0.9, 1.8, 0, 'metal');
    for (const dx of [-0.33, 0.33]) for (const dz of [-0.43, 0.43]) P(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 5), M.steelK, x + dx, 0.9, z + dz);
    for (let y = 0.25; y < 1.8; y += 0.3) { B(M.steelK, 0.66, 0.02, 0.86, x, y, z, 0, { grime: 0 }); for (let i = 0; i < 3; i++) P(new RoundedBoxGeometry(0.22, 0.1, 0.14, 2, 0.045), M.bread, x, y + 0.07, z - 0.28 + i * 0.28, 0.1, { tint: 0xffe8c8 }); }
  };
  breadCart(17.6, -9); breadCart(12.4, -17.3); breadCart(18.6, -9);
  for (let i = 0; i < 6; i++) ctx.bag(18.3 + (i % 3) * 0.62, 0.12 + ((i / 3) | 0) * 0.2, -23.1, 0, 0xe8e0d0);
  solid(18.9, -23.1, 2, 0.5, 0.5, 0, 'dirt');
  // tiled walls behind the ovens (herringbone) and behind the deli (white grid), up to 2.4 m
  const wallTiles = (mat, x, z0, z1, gaps = []) => {
    if (!mat) return;
    let cur = z0;
    for (const [a, b] of [...gaps, [z1, z1]]) {
      if (a - cur > 0.05) { const g = new THREE.PlaneGeometry(a - cur, 2.4); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (a - cur) / ctx.S[mat === M.subway ? 'subway' : 'whitetile'], uv.getY(i) * 2.4 / ctx.S[mat === M.subway ? 'subway' : 'whitetile']); P(g, mat, x, 1.2, (a + cur) / 2, -Math.PI / 2, { cast: false }); }
      cur = b;
    }
  };
  wallTiles(M.subway, 21.98, -24, -6, [[-19.4, -17.8]]);
  wallTiles(M.whitetile, 14.86, -6, 6, [[-1, 1]]);
  // the bakery back door has a scuffed kick plate; dumpsters wait outside

  // ---------- deli ----------
  for (const [z0, z1] of [[-5, -1.7], [1.7, 5]]) {
    const L = z1 - z0, cz = (z0 + z1) / 2;
    SB(M.paint, 1.0, 1.0, L, 10.2, 0, cz, { tint: 0xe8e4dc }, 'metal');
    face(M.clearGlass, L, 0.5, 9.69, 1.25, cz, -Math.PI / 2, 3);
    face(M.goodsCan, L - 0.1, 0.3, 9.72, 0.75, cz, -Math.PI / 2, 1);
    solid(10.2, cz, 1.0, L, 1.5, 0, 'glass');
  }
  SB(M.steelK, 1.0, 0.9, 2.4, 12.6, 0, -3.4, { grime: 0 }, 'metal');
  SB(M.steelK, 1.0, 0.9, 2.4, 12.6, 0, 3.4, { grime: 0 }, 'metal');
  P(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 18), M.steelK, 12.6, 1.05, -3.6, 0, { rz: 1.2 });
  neon('DELI', '#3ae0ff', 3.0, 0.8, 9.6, 3.7, 0, -Math.PI / 2, true, 'bold 150px Georgia');
  for (const z of [-1.3, 1.3]) P(new THREE.CylinderGeometry(0.008, 0.008, 1.9, 4), M.dark, 9.6, 5.1, z);

  // ---------- stockroom (x 15..22, z -6..6) ----------
  const inner = 0xe0dcd2;
  wallLine(15, -6, 15, 6, H, 0.25, [[5, 7, 2.6]], M.plaster, inner);                // double swing doors into the store
  wallLine(15, -6, 22, -6, H, 0.25, [[3, 4.6, 2.3]], M.plaster, inner);             // to the bakery kitchen
  wallLine(15, 6, 22, 6, H, 0.25, [[4, 5.6, 2.3]], M.plaster, inner);               // to the office corridor
  for (const s of [-1, 1]) {
    // swing doors propped open
    P(new THREE.BoxGeometry(0.06, 2.4, 0.95), M.steelK, 15.5, 1.25, s * 1.4, s * 0.9);
  }
  const rack = (x0, x1, z) => {
    const L = x1 - x0, cx = (x0 + x1) / 2;
    solid(cx, z, L, 1.0, 3.6, 0, 'metal');
    for (let x = x0; x <= x1 + 0.01; x += L / 2) for (const dz of [-0.45, 0.45]) B(M.paint, 0.08, 3.6, 0.08, x, 0, z + dz, 0, { tint: 0x2e5a9a, grime: 0.1 });
    for (const y of [0.15, 1.35, 2.55]) {
      for (const dz of [-0.45, 0.45]) B(M.paint, L, 0.1, 0.06, cx, y, z + dz, 0, { tint: 0xe07020, grime: 0.1 });
      B(M.wood, L - 0.1, 0.12, 0.95, cx, y + 0.1, z, 0, { tint: 0xc8a878, grime: 0.2 });
      for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.62) { const hh = 0.5 + ((x * 7) % 0.4); B(M.cardboard, 0.55, hh, 0.8, x, y + 0.22, z, 0, { grime: 0.1 }); }
    }
  };
  rack(16, 21.5, -5.2); rack(16, 21.5, 5.2);
  // pallets of stock in the middle break the line from the dock door into the store
  const palletStack = (x, z, h, sh = 'wood') => {
    SB(M.wood, 1.2, 0.15, 1.0, x, 0, z, { tint: 0xb89a6a }, sh);
    SB(M.cardboard, 1.15, h, 0.95, x, 0.15, z, { grime: 0.05 }, 'wood');
  };
  palletStack(18.6, -0.6, 1.6); palletStack(18.6, 0.8, 1.1); palletStack(20.5, 2.8, 1.4);
  signMesh(signTex(['EMPLOYEES', 'ONLY'], { bg: '#d8d4cc', fg: '#8a1a1a', font: 'bold 54px Arial', w: 256, h: 160 }), 0.8, 0.5, 14.84, 2.9, -2.2, -Math.PI / 2, 0.3, { noMinimap: true });

  // ---------- employees only: kitchen + cold storage (x 12..22, z 8..24) under a slab at 3 m ----------
  const OH = 3.0, UP = 3.2, UH = H - UP;
  wallLine(12, 8, 12, 24, OH, 0.2, [[1.4, 3, 2.3], [11, 12.6, 2.3]], M.plaster, inner);   // into the store: by the stairs, by produce
  wallLine(12, 8, 22, 8, OH, 0.2, [[2, 3.6, 2.3], [7, 8.5, 2.3]], M.plaster, inner);      // from the stockroom corridor
  wallLine(17, 8, 17, 24, OH, 0.2, [[11.5, 13, 2.3]], M.plaster, inner);                  // kitchen | cold room + back corridor
  wallLine(17, 15, 22, 15, OH, 0.25, [[2, 3.6, 2.3]], M.coldPanel, 0xffffff, 'metal');   // walk-in cooler door
  const ceil = new THREE.BoxGeometry(10, 0.2, 16); ceil.translate(17, OH + 0.1, 16);
  const ceilM = new THREE.Mesh(ceil, new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.9 }));
  ceilM.userData.noMinimap = true; ceilM.castShadow = true; ceilM.receiveShadow = true; group.add(ceilM); M.officeCeil = ceilM.material;
  solid(17, 16, 10, 16, 0.2, OH, 'concrete');
  // kitchen (x 12..17): range under a hood, fryer, prep island, sinks, dish shelving
  SB(M.steelK, 3.0, 0.9, 0.85, 14.6, 0, 23.35, { grime: 0 }, 'metal');
  for (let i = 0; i < 4; i++) P(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 14), M.dark, 13.6 + (i % 2) * 0.7 + ((i / 2) | 0) * 1.4, 0.92, 23.35);
  P(new THREE.BoxGeometry(2.8, 0.25, 0.02), M.dark, 14.6, 0.5, 22.91);
  SB(M.steelK, 3.3, 0.6, 1.1, 14.6, 2.1, 23.3, { grime: 0.15 }, 'metal');                 // hood
  B(M.steelK, 0.5, 0.4, 0.4, 14.6, 2.7, 23.5, 0, { grime: 0.1 });
  SB(M.steelK, 0.8, 1.0, 0.85, 12.6, 0, 23.35, { grime: 0 }, 'metal');                    // fryer
  P(new THREE.BoxGeometry(0.6, 0.02, 0.6), M.ovenGlow, 12.6, 1.01, 23.35, 0);
  SB(M.steelK, 1.0, 0.9, 4.0, 14.6, 0, 15.6, { grime: 0 }, 'metal');                      // prep island
  for (let i = 0; i < 5; i++) P(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 14), M.wood, 14.5, 0.91, 14.1 + i * 0.7, 0, { tint: 0xd8b888 });
  P(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 18), M.steelK, 14.7, 1.05, 17.1, 0, { rz: 1.2 });
  SB(M.steelK, 0.7, 0.9, 2.2, 16.55, 0, 10.2, { grime: 0 }, 'metal');                     // sinks
  for (const z of [9.6, 10.8]) P(new THREE.BoxGeometry(0.45, 0.02, 0.5), M.dark, 16.5, 0.91, z);
  for (const z of [9.6, 10.8]) P(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), M.steelK, 16.8, 1.08, z);
  SB(M.steelK, 0.5, 1.9, 2.0, 16.65, 0, 16.6, { grime: 0 }, 'metal');                     // dish shelving
  for (const y of [0.4, 0.9, 1.4]) for (let i = 0; i < 6; i++) P(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12), M.paint, 16.6, y + 0.05, 15.8 + i * 0.32, 0, { tint: 0xf4f2ec });
  signMesh(signTex(['EMPLOYEES ONLY', 'KITCHEN'], { bg: '#d8d4cc', fg: '#8a1a1a', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, 11.88, 2.6, 10.2, -Math.PI / 2, 0.3, { noMinimap: true });
  signMesh(signTex(['EMPLOYEES', 'ONLY'], { bg: '#d8d4cc', fg: '#8a1a1a', font: 'bold 54px Arial', w: 256, h: 160 }), 0.8, 0.5, 11.88, 2.6, 19.8, -Math.PI / 2, 0.3, { noMinimap: true });
  // cold storage (x 17..22, z 8..15): insulated walls, wire shelving with crates, frosty light
  for (const [x0, z0, w, d] of [[17.1, 8.1, 0.06, 6.8], [21.9, 8.1, 0.06, 6.8]]) B(M.coldPanel, w, 2.95, d, x0 + w / 2, 0, z0 + d / 2, 0, { grime: 0 });
  const wireShelf = (x, z, len) => {
    SB(M.steelK, 0.6, 2.0, len, x, 0, z, { grime: 0 }, 'metal');
    for (const y of [0.1, 0.65, 1.2, 1.75]) {
      B(M.steelK, 0.62, 0.03, len, x, y, z, 0, { grime: 0 });
      face(M.produce, len - 0.1, 0.3, x + Math.sign(19.5 - x) * 0.31, y + 0.2, z, Math.sign(19.5 - x) > 0 ? Math.PI / 2 : -Math.PI / 2, 1.2);
    }
  };
  wireShelf(17.5, 11.5, 4.6); wireShelf(21.5, 12.6, 4.2);
  for (const x of [17.6, 21.4]) P(new THREE.BoxGeometry(0.04, 0.04, 4), M.frost, x + (x < 19 ? 0.35 : -0.35), 2.8, 11.5);
  for (let i = 0; i < 6; i++) P(new THREE.BoxGeometry(0.22, 2.2, 0.01), M.clearGlass, 19.15 + i * 0.25, 1.15, 14.85, 0, { cast: false, tint: 0xd8eef8 }); // strip curtain
  signMesh(signTex(['COLD STORAGE', '2°C'], { bg: '#2a6aa8', fg: '#ffffff', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, 19.75, 2.55, 7.88, Math.PI, 0.35, { noMinimap: true });
  // back corridor (x 17..22, z 15..24): lockers, a time clock, the staff door to the smoking area
  for (let i = 0; i < 6; i++) SB(M.paint, 0.5, 1.9, 0.5, 21.5, 0, 22.9 - i * 0.52, { tint: 0x4a6a8a }, 'metal');
  P(new THREE.BoxGeometry(0.3, 0.4, 0.12), M.dark, 17.18, 1.4, 17.8, Math.PI / 2);
  SB(M.wood, 0.4, 0.45, 2.0, 18.0, 0, 22.4, { tint: 0x9a7a5a }, 'wood');

  // ---------- upstairs: offices + break room (floor at 3.2 m) ----------
  // walls: windows over the sales floor and the deli, a door onto the interior stair landing
  wallLine(12, 8, 12, 24, UH, 0.2, [[0.6, 6.4, 2.1, 0.95], [7.9, 9.5, 2.2], [12.4, 14.6, 2.1, 0.95]], M.plaster, inner, 'concrete', null, UP);
  wallLine(12, 8, 22, 8, UH, 0.2, [[0.6, 2.8, 2.1, 0.95]], M.plaster, inner, 'concrete', null, UP);
  wallLine(17, 8, 17, 24, UH, 0.15, [[2.5, 4.1, 2.2], [11, 12.6, 2.2]], M.plaster, 0xd8e0d8, 'concrete', null, UP);
  wallLine(12, 18, 17, 18, UH, 0.15, [[1.8, 3.4, 2.2]], M.plaster, inner, 'concrete', null, UP);
  wallLine(17, 16, 22, 16, UH, 0.15, [[2, 3.6, 2.2]], M.plaster, 0xd8e0d8, 'concrete', null, UP);
  // window sills
  for (const [x, z, w, d] of [[11.95, 11.5, 0.32, 5.8], [11.95, 21.5, 0.32, 2.2], [13.7, 7.95, 2.2, 0.32]]) UB(M.wood, w, 0.04, d, x, UP + 0.95, z, 0xc8a878);
  UF(M.wood, 5, 10, 14.5, UP + 0.006, 13, ctx.scaleOf(M.wood) || 2);
  UF(M.wood, 5, 6, 14.5, UP + 0.006, 21, ctx.scaleOf(M.wood) || 2);
  UF(M.checker || M.tile, 5, 8, 19.5, UP + 0.006, 12, M.checker ? 3.0 : (ctx.scaleOf(M.tile) || 1));
  UF(M.octagon || M.tile, 5, 8, 19.5, UP + 0.006, 20, M.octagon ? 1.8 : (ctx.scaleOf(M.tile) || 1));
  const SU = (mat, w, h, d, x, y, z, tint, surf = 'wood') => { solid(x, z, w, d, h, y, surf); UB(mat, w, h, d, x, y, z, tint); };
  const desk = (x, z, y = UP) => {
    SU(M.wood, 1.6, 0.06, 0.8, x, y + 0.72, z, 0xc8a878);
    for (const dx of [-0.75, 0.75]) UB(M.dark, 0.05, 0.72, 0.75, x + dx, y, z);
    U(new THREE.BoxGeometry(0.55, 0.34, 0.03), M.screen, x, y + 1.02, z - 0.2);
    U(new THREE.BoxGeometry(0.06, 0.2, 0.06), M.dark, x, y + 0.85, z - 0.22);
    U(new THREE.BoxGeometry(0.42, 0.02, 0.14), M.dark, x, y + 0.79, z + 0.1);
    SU(M.fabric, 0.5, 0.5, 0.5, x + 0.1, y, z + 0.7, 0xffffff, 'cloth');
    U(new THREE.BoxGeometry(0.5, 0.55, 0.08), M.fabric, x + 0.1, y + 0.8, z + 0.95);
  };
  // open office (x 12..17, z 8..18): two desks behind a partition, copier, water cooler
  desk(14.8, 9.4); desk(14.8, 12.9);
  SU(M.fabric, 2.8, 1.3, 0.06, 14.4, UP, 11.2, 0x6a7078, 'cloth');
  SU(M.fabric, 0.06, 1.3, 2.4, 13.0, UP, 13.4, 0x6a7078, 'cloth');
  SU(M.paint, 0.7, 1.1, 0.6, 16.5, UP, 15.4, 0xd8d8d4, 'metal');
  SU(M.paint, 0.35, 1.2, 0.35, 16.7, UP, 17.4, 0x3a6ab0, 'metal');
  // manager's office (x 12..17, z 18..24): desk, filing cabinets, whiteboard
  desk(14.6, 21.4);
  for (let i = 0; i < 3; i++) SU(M.paint, 0.5, 1.3, 0.6, 16.5, UP, 23.4 - i * 0.55, 0x8a8e92, 'metal');
  U(new THREE.PlaneGeometry(1.8, 1.0), M.paint, 14.5, UP + 1.6, 23.88, Math.PI, 0xf4f4f0);
  // break room (x 17..22, z 8..16): table and chairs, vending machine, fridge, counter with a microwave
  SU(M.wood, 1.8, 0.75, 1.0, 19.4, UP, 12.4, 0xd8c8a8);
  for (const [dx, dz] of [[-0.6, -0.8], [0.6, -0.8], [-0.6, 0.8], [0.6, 0.8]]) SU(M.fabric, 0.45, 0.45, 0.45, 19.4 + dx, UP, 12.4 + dz, 0x8a3a3a, 'cloth');
  SU(M.paint, 0.9, 1.9, 0.8, 21.4, UP, 14.9, 0x8a1a1a, 'metal');
  U(new THREE.BoxGeometry(0.02, 1.4, 0.6), M.coolLight, 20.94, UP + 1.1, 14.9);
  SU(M.paint, 0.8, 1.8, 0.7, 21.45, UP, 11.6, 0xe8e8e4, 'metal');
  SU(M.woodOld, 1.9, 0.9, 0.6, 18.3, UP, 8.45, 0x8a7a6a);
  U(new THREE.BoxGeometry(0.45, 0.3, 0.35), M.dark, 18.0, UP + 1.05, 8.45);
  signMesh(signTex(['BREAK ROOM'], { bg: '#d8d4cc', fg: '#1a1a1a', font: 'bold 50px Arial', w: 256, h: 128 }), 0.7, 0.35, 17.09, UP + 2.35, 11.3, Math.PI / 2, 0.3, { noMinimap: true });
  // staff room (x 17..22, z 16..24): lockers and a bench
  for (let i = 0; i < 8; i++) SU(M.paint, 0.5, 1.9, 0.5, 21.5, UP, 23.5 - i * 0.52, 0x4a6a8a, 'metal');
  SU(M.wood, 0.4, 0.45, 2.4, 19.6, UP, 20.6, 0x9a7a5a);

  // ---------- stairs ----------
  // inside: a concrete flight along the kitchen wall from the deli up to a landing at the office door
  flight(11.25, 11.6, 'z', 10, 0.32, 0.42, 1.5, false);
  SB(M.concrete, 1.5, UP, 1.8, 11.25, 0, 16.7, { tint: 0xc8c4bc, grime: 0.15 });
  for (const [x, z, w, d] of [[10.52, 16.7, 0.05, 1.8], [11.25, 17.58, 1.5, 0.05]]) { solid(x, z, w, d, 1.0, UP, 'metal'); UB(M.steelK, w, 0.05, d, x, UP + 0.95, z, 0x9aa0a6); }
  for (const [x, z] of [[10.52, 15.85], [10.52, 17.58], [11.9, 17.58]]) U(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 6), M.steelK, x, UP + 0.47, z, 0, 0x9aa0a6);
  signMesh(signTex(['OFFICES', 'STAFF ONLY ↑'], { bg: '#1f4e8a', fg: '#ffffff', font: 'bold 44px Arial', w: 256, h: 160 }), 0.8, 0.5, 11.25, 1.9, 11.55, Math.PI, 0.4, { noMinimap: true });
  // outside: a galvanised fire stair up the back wall to the break room door
  flight(23.1, 3.9, 'z', 10, 0.32, 0.44, 1.3, true);
  solid(23.15, 9.3, 1.5, 2.0, 0.1, UP - 0.1, 'metal');
  UB(M.steelK, 1.5, 0.08, 2.0, 23.15, UP - 0.08, 9.3, 0x6a6e72);
  for (const [x, z, w, d] of [[23.88, 9.3, 0.05, 2.0], [23.15, 10.28, 1.5, 0.05]]) { solid(x, z, w, d, 1.0, UP, 'metal'); UB(M.steelK, w, 0.05, d, x, UP + 0.95, z, 0x9aa0a6); }
  for (const [x, z] of [[23.85, 8.35], [23.85, 10.25], [22.5, 10.25]]) {
    U(new THREE.CylinderGeometry(0.05, 0.05, UP, 8), M.paint, x, UP / 2, z, 0, 0x5a5e62);
    U(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 6), M.steelK, x, UP + 0.47, z, 0, 0x9aa0a6);
  }

  // ---------- outside: parking lot ----------
  const parked = [[-30.2, -22.8], [-30.2, -17.2], [-30.2, -8.8], [-30.2, 2.4], [-30.2, 10.8], [-30.2, 19.2], [-34.8, -20], [-34.8, -6], [-34.8, 5.2], [-34.8, 16.4], [-34.8, 24.8], [-30.2, 25]];
  for (const [x, z] of parked) {
    buildCar(x, z, x > -32 ? Math.PI : 0, 0);
    solid(x, z, 4.4, 2.0, 1.45, 0, 'metal');
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
    solid(-32.5, z, 2.6, 1.2, 1.0, 0, 'metal');
    for (const s of [-1, 1]) B(M.steelK, 2.6, 0.05, 0.05, -32.5, 0.95, z + s * 0.55, 0, { grime: 0 });
    P(new RoundedBoxGeometry(0.9, 0.5, 0.55, 1, 0.03), M.steelK, -32.9, 0.75, z, Math.PI / 2);
  }
  for (const z of [-21, -13, -9, 9, 13, 21]) { P(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), M.paint, -24.8, 0.45, z, 0, { tint: 0xe8c020 }); solid(-24.8, z, 0.25, 0.25, 0.9, 0, 'metal'); }
  // store sign
  const logo = signTex('FRESHWAY', { bg: null, fg: '#e8402a', font: 'bold 92px Arial', w: 1024, h: 160 });
  signMesh(logo, 12, 1.9, X0 - T - 0.08, 4.65, 0, -Math.PI / 2, 2.2, { transparent: true });
  for (const z of [-19, 19]) signMesh(signTex('ENTRANCE', { bg: '#2f5a3a', font: 'bold 64px Arial', w: 512, h: 128 }), 1.6, 0.4, X0 - T - 0.06, 3.5, z, -Math.PI / 2, 0.8);
  // street beyond the lot, low wall + hedge at the map edge
  plane(M.asphalt, 30, 80, -57, 0, -0.005);
  SB(M.concrete, 0.4, 0.8, 61, -42.2, 0, 0, { tint: 0xc8c0b0 });
  for (let z = -29; z <= 29; z += 1.6) P(new THREE.SphereGeometry(0.75, 8, 6), M.leaf, -42.6, 1.0, z, z, { sy: 0.8, cast: true, tint: 0xb8c8a0 });

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
  dockDoor(-13.4, -10.6, false); dockDoor(-9.8, -7.0, false); dockDoor(-3.0, 1.2, true);
  signMesh(signTex('LOADING BAY & RECEIVING', { bg: '#1a1c20', fg: '#f2c63a', font: 'bold 52px Arial', w: 1024, h: 128 }), 5.6, 0.7, X1 + T + 0.04, 4.6, -5.9, Math.PI / 2, 0.6);
  for (const [z, n] of [[-12, '1'], [-8.4, '2'], [-0.9, '3']]) signMesh(signTex(n, { bg: '#f2c63a', fg: '#1a1a1a', font: 'bold 100px Arial', w: 128, h: 128 }), 0.5, 0.5, X1 + T + 0.04, 3.95, z, Math.PI / 2, 0.4);
  // semi: a long box trailer backed up to door 2, the tractor almost at the back fence
  const semi = (zc) => {
    const tx0 = 22.7, tL = 11.4, tx = tx0 + tL / 2;
    SB(M.paint, tL, 2.75, 2.5, tx, 1.2, zc, { tint: 0xeae8e2, grime: 0.12 }, 'metal');
    solid(tx, zc, tL, 2.5, 1.2, 0, 'metal');
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
    solid(cx0 + 3.9, zc, 5.6, 2.45, 1.1, 0, 'metal');
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
  // dumpsters by the bakery door
  const dumpster = (x, z, tint) => {
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
  for (const [x, z] of [[26.6, 13.2], [26.6, 21.2]]) P(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), M.dark, x, 1.4, z);
  B(M.metal, 4.6, 0.08, 8.6, 24.6, 2.8, 17.2, 0, { tint: 0x7a8088, grime: 0.2 });
  SB(M.wood, 0.5, 0.45, 2.2, 22.85, 0, 14.6, { tint: 0x9a7a5a }, 'wood');
  B(M.wood, 0.08, 0.5, 2.2, 22.66, 0.45, 14.6, 0, { tint: 0x9a7a5a });
  SB(M.metal, 0.38, 0.95, 0.38, 24.6, 0, 20.3, { tint: 0x3a3c40 }, 'metal');
  P(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), M.dirt, 24.6, 0.97, 20.3);
  signMesh(signTex(['DESIGNATED', 'SMOKING AREA'], { bg: '#e8e4dc', fg: '#2a2a2a', font: 'bold 46px Arial', w: 512, h: 200, border: '#c8322b' }), 1.0, 0.4, X1 + T + 0.03, 2.3, 20.2, Math.PI / 2, 0.3);
  const butts = new THREE.MeshBasicMaterial({ color: 0xe8e0c8 });
  for (let i = 0; i < 18; i++) P(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 4), butts, 23.2 + Math.random() * 2.4, 0.01, 16 + Math.random() * 5, Math.random() * 3, { rz: Math.PI / 2 });
  // wall packs over the back doors
  for (const [z, tz] of [[-18.2, -18.2], [-0.5, -0.5], [17.8, 17.8]]) {
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
  fence(41.6, -30, 41.6, 30);
  fence(-24, 30, 41.6, 30); fence(-24, -30, 41.6, -30);
  for (let z = -28; z <= 28; z += 3.3) P(new THREE.SphereGeometry(1.6, 8, 6), M.leaf, 45 + Math.sin(z) * 1.2, 2.4, z, z, { sy: 1.3, cast: true, tint: 0x9ab080 });
  // ---------- right lane (+z): the parking strip, cars along the fence between hedge planters ----------
  plane(M.asphalt, 46, 6.2, -1, 27.3, 0.006);
  P(new THREE.PlaneGeometry(44, 0.14), M.line, -1, 0.02, 27.15, 0, { rx: -Math.PI / 2, cast: false, tint: 0xd8c050 });
  for (const x of [-20, -9.6, -6.4, 4, 7.2, 18.4]) P(new THREE.PlaneGeometry(0.12, 2.6), M.line, x, 0.02, 28.6, 0, { rx: -Math.PI / 2, cast: false, tint: 0xe8e4d8 });
  for (const [x, ry] of [[-14.8, 0], [-1.2, Math.PI], [12.8, 0]]) { buildCar(x, 28.6, ry, 0); solid(x, 28.6, 4.4, 2.0, 1.45, 0, 'metal'); }
  const planter = (x, z, w, d) => {
    SB(M.concrete, w, 0.6, d, x, 0, z, { tint: 0xc8c0b0, grime: 0.3 });
    plane(M.dirt, w - 0.2, d - 0.2, x, z, 0.61);
    for (let t = -w / 2 + 0.5; t <= w / 2 - 0.4; t += 0.75) P(new THREE.SphereGeometry(0.5, 8, 6), M.leaf, x + t, 0.95, z, t * 3, { sy: 0.8, cast: true, tint: 0xa8c090 });
    solid(x, z, w - 0.1, d - 0.1, 1.35, 0, 'dirt');
  };
  planter(-8, 28.9, 2.6, 1.1); planter(5.6, 28.9, 2.6, 1.1); planter(19.8, 28.9, 2.6, 1.1);
  planter(-15, 25.1, 3.6, 0.9); planter(9, 25.1, 3.6, 0.9);
  // a delivery van at the back end of the strip
  SB(M.paint, 5.0, 2.2, 2.0, 32.5, 0.35, 28.2, { tint: 0xe8e8e4, grime: 0.15 }, 'metal');
  solid(32.5, 28.2, 5.0, 2.0, 0.35, 0, 'metal');
  P(new THREE.BoxGeometry(0.04, 0.7, 1.8), M.glass, 35.02, 1.9, 28.2, 0, { tint: 0xffffff });
  for (const s of [-1, 1]) {
    face(M.paint, 3.2, 0.45, 31.8, 1.4, 28.2 + s * 1.005, s > 0 ? 0 : Math.PI, 3.2);
    for (const dx of [-1.6, 1.7]) P(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14), M.rubber, 32.5 + dx, 0.36, 28.2 + s * 0.9, 0, { rx: Math.PI / 2 });
  }

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
  for (const [x, w, h] of [[-21, 0.9, 1.3], [-19.8, 0.6, 0.9], [-8.2, 0.9, 1.3], [-7.0, 0.5, 0.7]]) {
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
  // graffiti on the outside walls and the compactor (made-up tags)
  const graf = (word, seed, w, x, y, z, ry) => { const m = signMesh(graffitiTex(word, seed), w, w * 0.375, x, y, z, ry, 0.06, { transparent: true }); m.material.depthWrite = false; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; };
  graf('KRWZ', 11, 5, -15, 2.4, Z0 - T - 0.05, Math.PI);
  graf('SNAX', 23, 4, 16, 2.0, Z0 - T - 0.05, Math.PI);
  graf('DUSK', 31, 4.4, 2.6, 2.6, Z1 + T + 0.05, 0);
  graf('FRSH', 47, 3.6, X1 + T + 0.05, 2.2, -21.6, Math.PI / 2);
  graf('BP43', 59, 2.6, 33.5, 1.3, -20.88, 0);
  // hedges beyond the side fences
  for (let x = -22; x <= 40; x += 2.2) for (const s of [-1, 1]) P(new THREE.SphereGeometry(1.0, 8, 6), M.leaf, x, 0.9, s * 31.3, x, { sy: 0.9, cast: true, tint: 0x9ab080 });
  // map edge (invisible walls)
  solid(-42.8, 0, 1, 64, 10, 0, 'concrete');
  solid(42.3, 0, 1, 64, 10, 0, 'concrete');
  solid(0, 30.6, 86, 1, 10, 0, 'concrete');
  solid(0, -30.6, 86, 1, 10, 0, 'concrete');
  // distant town for the horizon
  const r = rng(91);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, d = 75 + r() * 60, h = 6 + r() * 16, w = 10 + r() * 14;
    B(M.plaster, w, h, w, Math.cos(a) * d, 0, Math.sin(a) * d * 0.85, r() * 3, { tint: ctx.plasterTints[i % ctx.plasterTints.length], grime: 0.3, cast: false });
  }

  // ---------- flow: break up the long lines outside (alleys, lot lanes, yard) and inside (front corridor) ----------
  const wallSeg = (x, z, w, d, h = 2.6, tint = 0xffffff) => { SB(M.brick, w, h, d, x, 0, z, { tint, grime: 0.45 }, 'brick'); B(M.concrete, w + 0.12, 0.12, d + 0.12, x, h, z, 0, { tint: 0xc8c0b0, grime: 0.1 }); };
  // side alleys: staggered brick screen walls make a chicane instead of an 80 m corridor
  wallSeg(-6, 26.4, 0.4, 3.6); wallSeg(16, 28.8, 0.4, 3.6, 2.6, 0xe0c0a8);
  wallSeg(-2, -26.4, 0.4, 3.6, 2.6, 0xe0c0a8); wallSeg(14, -28.8, 0.4, 3.6);
  wallSeg(30, 26.0, 0.4, 2.8); wallSeg(28, -27.6, 0.4, 3.0);
  // lot lanes: cart corral shelters, a box van and an ice / propane merchandiser in the driving lanes
  const shelter = (x, z) => {
    SB(M.paint, 2.4, 1.2, 0.08, x, 0, z - 1.6, { tint: 0x2f5a3a, grime: 0.2 }, 'metal');
    SB(M.paint, 0.08, 1.2, 3.2, x - 1.2, 0, z, { tint: 0x2f5a3a, grime: 0.2 }, 'metal');
    for (const [dx, dz] of [[-1.15, -1.55], [1.15, -1.55], [-1.15, 1.55], [1.15, 1.55]]) P(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), M.dark, x + dx, 1.2, z + dz);
    B(M.metal, 2.6, 0.08, 3.4, x, 2.4, z, 0, { tint: 0x2f5a3a, grime: 0.15 });
    for (let i = 0; i < 4; i++) P(new RoundedBoxGeometry(0.9, 0.5, 0.55, 1, 0.03), M.steelK, x + 0.2, 0.75, z - 1.0 + i * 0.4, Math.PI / 2);
    solid(x + 0.2, z, 1.0, 2.4, 1.05, 0, 'metal');
  };
  shelter(-26.2, -4); shelter(-39.6, 8);
  const boxVan = (x, z, tint) => {
    SB(M.paint, 2.2, 2.6, 5.4, x, 0.45, z, { tint, grime: 0.15 }, 'metal');
    solid(x, z, 2.2, 5.4, 0.45, 0, 'metal');
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
  // inside: tall seasonal racks along the front corridor, so the checkout side isn't one long lane
  for (const z of [-8.5, 9.5]) {
    SB(M.shelf, 1.2, 2.1, 1.2, -13, 0, z, { tint: 0x8a2f2a, grime: 0 }, 'metal');
    for (const [dx, dz, ry] of [[0.61, 0, Math.PI / 2], [-0.61, 0, -Math.PI / 2], [0, 0.61, 0], [0, -0.61, Math.PI]]) for (const y of [0.5, 1.15]) face(GOODS[(y * 10 | 0) % 4], 1.1, 0.5, -13 + dx, y, z + dz, ry, 1);
  }

  // ---------- the smoker ----------
  const smoker = makeSmoker(group, 23.25, 19.2, -Math.PI / 2 + 0.3); // facing out into the yard

  flushOver();
  const inside = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
  return {
    // S&D: sites each team defends ([x, z]); placed near the middle so both teams get there at about the same time
    sites: [[[-5.5, -16], [-6, 15.5]], [[5, -16], [8.6, 10.6]]],
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
    menuCam(t, cam) {
      cam.position.set(Math.cos(t) * 44 - 4, 13 + Math.sin(t * 0.7) * 2, Math.sin(t) * 38);
      cam.lookAt(0, 1.5, 0);
    },
    update(dt, time) { if (smoker) smoker.update(dt, time); },
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
