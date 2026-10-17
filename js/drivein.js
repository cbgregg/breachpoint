// Drive-In: a 1950s drive-in theatre at dusk. Two screen towers face each other across the lot, one at each end;
// each team spawns in the small yard behind its screen (the old picnic lawn) and comes out through the doorway
// under the screen or the gates in the wing fences. The lot between is rows of parked 50s cars on their ramps,
// facing the screens, with speaker posts between them; panel vans, pickups with campers and ice-cream trucks
// are the tall cover. In the middle the snack bar: walk-in counter and fridges downstairs, stairs up to the roof
// and the projection booth that throws a beam onto both screens. Perimeter road along the fence with the
// restrooms, the projector-parts shed, the box office and the marquee at the entrance.
//
// The layout (where every car, van, fence and building goes) comes from tools/drivein_gen.py, a parametric
// generator searched against targets measured on Black Ops 2 maps; see that file and js/drivein_layout.js.
import * as THREE from 'three';
import { PROPS } from './props.js';
import { DRIVEIN_HALF, DRIVEIN_CENTER, DRIVEIN_SPAWNS, DRIVEIN_META } from './drivein_layout.js';

const { HX, HZ, xs: XS, Ws: WS } = DRIVEIN_META;
const ROOF = 3.6;                 // snack bar roof (walkable)

export const DRIVEIN = {
  id: 'drivein',
  name: 'Drive-In',
  blurb: '1950s drive-in at dusk: screen towers at both ends, rows of parked cars between them, the snack bar and its projection booth roof in the middle',
  bounds: { hx: HX, hz: HZ },
  skyline: false, mountain: false,
  // dusk: the sun just down behind the trees, a violet sky, the lot lit by lamps, neon and the screens
  look: { dome: [0x141a44, 0x4a3f78, 0xe0865a], fog: 0.0055, fogColor: 0x463e66, sun: 1.1, sunColor: 0xff9a66, sunElev: 14, sunAz: 205,
    hemi: 1.0, hemiSky: 0x7a7ab8, ground: 0x3a3028, exposure: 1.05, env: 0.55 },
  spawns: DRIVEIN_SPAWNS,
  pickups: [
    { type: 'health', pos: [0, 0, 3.3] },
    { type: 'health', pos: [-4.8, ROOF, 0] },
    { type: 'health', pos: [27.7, 0, -3.3] },
    { type: 'health', pos: [-27.7, 0, 3.3] },
    { type: 'ammo', pos: [0, 0, -3.3] },
    { type: 'ammo', pos: [4.8, ROOF, 0] },
    { type: 'ammo', pos: [16, 0, 27] },
    { type: 'ammo', pos: [-16, 0, -27] },
    { type: 'ammo', pos: [33, 0, -25] },
    { type: 'ammo', pos: [-33, 0, 25] },
  ],
  photos: ['assets/loading/drivein-1.jpg', 'assets/loading/drivein-2.jpg'],
  build,
};

// ---------- canvas textures ----------
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const RETRO = (px, w = 900) => `italic ${w} ${px}px "Arial Black", Impact, "Helvetica Neue", sans-serif`;

// the feature on both screens (an original B-movie frame): a flying saucer beaming up a car over desert mesas
function movieTex() {
  return canvasTex(1024, 428, (g, W, H) => {
    const r = rng(77);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a7ac8'); sky.addColorStop(0.5, '#7ab8e0'); sky.addColorStop(0.72, '#f4d49a'); sky.addColorStop(1, '#e09a5a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
        // ringed planet
    g.fillStyle = '#d8a050'; g.beginPath(); g.arc(860, 90, 46, 0, 7); g.fill();
    g.strokeStyle = 'rgba(240,210,150,0.8)'; g.lineWidth = 5; g.beginPath(); g.ellipse(860, 92, 84, 16, -0.25, 0, 7); g.stroke();
    // mesas
    g.fillStyle = '#b0603a';
    g.beginPath(); g.moveTo(0, H); g.lineTo(0, 300); g.lineTo(90, 296); g.lineTo(120, 250); g.lineTo(260, 246); g.lineTo(290, 310);
    g.lineTo(560, 318); g.lineTo(600, 270); g.lineTo(700, 268); g.lineTo(730, 320); g.lineTo(W, 312); g.lineTo(W, H); g.fill();
    g.fillStyle = '#d8a060'; g.fillRect(0, 318, W, H - 318);
    // tractor beam onto a little car on the road
    const beam = g.createLinearGradient(0, 170, 0, 370);
    beam.addColorStop(0, 'rgba(180,255,200,0.75)'); beam.addColorStop(1, 'rgba(180,255,200,0.12)');
    g.fillStyle = beam; g.beginPath(); g.moveTo(470, 175); g.lineTo(550, 175); g.lineTo(610, 372); g.lineTo(410, 372); g.fill();
    g.fillStyle = '#5a4a3a'; g.fillRect(0, 372, W, 14);
    g.fillStyle = '#9a2a2a'; g.beginPath(); g.moveTo(462, 352); g.lineTo(490, 336); g.lineTo(540, 336); g.lineTo(568, 352); g.lineTo(570, 364); g.lineTo(460, 364); g.fill();
    g.fillStyle = '#111'; for (const x of [480, 550]) { g.beginPath(); g.arc(x, 365, 8, 0, 7); g.fill(); }
    // the saucer
    const hull = g.createLinearGradient(0, 130, 0, 185);
    hull.addColorStop(0, '#f0f0f4'); hull.addColorStop(0.5, '#8a909a'); hull.addColorStop(1, '#3a3e46');
    g.fillStyle = 'rgba(170,230,255,0.85)'; g.beginPath(); g.ellipse(510, 138, 42, 30, 0, Math.PI, 0); g.fill();
    g.fillStyle = hull; g.beginPath(); g.ellipse(510, 158, 120, 26, 0, 0, 7); g.fill();
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#ffdc50' : '#ff5a3a'; g.beginPath(); g.arc(410 + i * 25, 162, 5, 0, 7); g.fill(); }
    // title card
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = RETRO(66); g.lineWidth = 12; g.strokeStyle = '#7a0e0e'; g.strokeText('TERROR FROM PLANET Z!', W / 2, 58);
    const tg = g.createLinearGradient(0, 30, 0, 90); tg.addColorStop(0, '#fff27a'); tg.addColorStop(1, '#ff9a1a');
    g.fillStyle = tg; g.fillText('TERROR FROM PLANET Z!', W / 2, 58);
    // film grain and a vignette from the projector lamp
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`; g.fillRect(r() * W, r() * H, 2, 2); }
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  });
}
// "coming attractions" board: two made-up features
function attractionsTex() {
  return canvasTex(768, 410, (g, W, H) => {
    g.fillStyle = '#f2e8cc'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#b8261e'; g.fillRect(0, 0, W, 70);
    g.fillStyle = '#fff6d8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = RETRO(46); g.fillText('COMING ATTRACTIONS', W / 2, 37);
    const poster = (x, bg, fg, l1, l2, draw) => {
      g.fillStyle = bg; g.fillRect(x, 86, 360, 310);
      draw(x);
      g.fillStyle = fg; g.font = RETRO(40); g.fillText(l1, x + 180, 318); g.font = RETRO(30); g.fillText(l2, x + 180, 362);
    };
    poster(14, '#1e2a4a', '#ffd84a', 'HOT ROD', 'SUMMER', (x) => {
      g.fillStyle = '#e8402a'; g.beginPath(); g.moveTo(x + 60, 240); g.lineTo(x + 110, 200); g.lineTo(x + 230, 196); g.lineTo(x + 300, 226); g.lineTo(x + 310, 252); g.lineTo(x + 56, 256); g.fill();
      g.fillStyle = '#111'; for (const dx of [110, 260]) { g.beginPath(); g.arc(x + dx, 256, 22, 0, 7); g.fill(); }
      g.strokeStyle = '#ffb02a'; g.lineWidth = 6; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + 40 - i * 8, 214 + i * 12); g.lineTo(x - 10 - i * 8, 214 + i * 12); g.stroke(); }
    });
    poster(394, '#2a4a2a', '#f4f0d8', 'THE GIANT ANTS', 'OF MESA CITY', (x) => {
      g.fillStyle = '#0e140e';
      g.beginPath(); g.ellipse(x + 180, 200, 40, 26, 0, 0, 7); g.ellipse(x + 250, 186, 26, 22, 0, 0, 7); g.ellipse(x + 110, 210, 50, 30, 0, 0, 7); g.fill();
      g.strokeStyle = '#0e140e'; g.lineWidth = 7;
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + 150 + i * 30, 205); g.lineTo(x + 130 + i * 40, 205 + s * 50); g.lineTo(x + 120 + i * 45, 270); g.stroke(); }
      g.beginPath(); g.moveTo(x + 266, 172); g.lineTo(x + 300, 120); g.moveTo(x + 258, 170); g.lineTo(x + 280, 116); g.stroke();
    });
  });
}
function marqueeTex() {
  return canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = '#f6f2e4'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16120e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const row = (t, y, px) => { g.font = `900 ${px}px "Arial Black", Impact, sans-serif`; g.fillText(t, W / 2, y); };
    row('TONITE', 70, 72);
    row('TERROR FROM PLANET Z', 190, 76);
    row('+ HOT ROD SUMMER', 300, 70);
    g.fillStyle = '#b8261e'; row('CARTOONS · GATES OPEN 7PM', 420, 54);
  });
}
function menuTex() {
  return canvasTex(512, 320, (g, W, H) => {
    g.fillStyle = '#1a1a18'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd84a'; g.font = RETRO(42); g.textAlign = 'center'; g.fillText('REFRESHMENTS', W / 2, 46);
    g.textAlign = 'left'; g.font = 'bold 30px Arial';
    const items = [['HOT DOG', '25¢'], ['CHEESEBURGER', '35¢'], ['POPCORN', '15¢'], ['FRENCH FRIES', '15¢'], ['MALTS & SHAKES', '25¢'], ['COLD SODA', '10¢']];
    items.forEach(([a, b], i) => { g.fillStyle = '#f4f0e0'; g.fillText(a, 34, 98 + i * 36); g.textAlign = 'right'; g.fillStyle = '#ff7a5a'; g.fillText(b, W - 34, 98 + i * 36); g.textAlign = 'left'; });
  });
}
function textTex(text, { bg = '#1c2a3a', fg = '#ffffff', w = 512, h = 128, font = 'bold 80px Arial' } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  });
}
function neonTex(text, color, { w = 1024, h = 220, font = RETRO(130) } = {}) {
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
function grassTex() {
  return canvasTex(256, 256, (g, W) => {
    const r = rng(5);
    g.fillStyle = '#3e4a26'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 9000; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(90,110,48,${0.4 + r() * 0.4})` : v < 0.85 ? `rgba(40,52,22,${0.4 + r() * 0.4})` : `rgba(120,118,70,${0.5})`;
      g.fillRect(r() * W, r() * W, 1 + r() * 2, 2 + r() * 4);
    }
  }, true);
}
function checkerTex() {
  return canvasTex(256, 256, (g, W) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#1a1a1a' : '#e8e2d2'; g.fillRect(i * 64, j * 64, 64, 64); }
  }, true);
}

// 50s paint: turquoise, coral, mint, pink, cream, red, black, yellow, powder blue
const PAINT = [0x4fa8a0, 0xd8604a, 0x8ec8a8, 0xe0909e, 0xe8dcb8, 0xa8241e, 0x1e1e20, 0xe0bc4a, 0x7aa0c8];
const ROOFS = [0xf0ead8, 0xf0ead8, 0x2a2a2a, 0xf0ead8, 0x8a2a24, 0xf0ead8, 0xe8dcb8, 0x1e1e20, 0xf0ead8];

function build(ctx) {
  const { M, B, put, solid, plane, decal, glows, group, physics, flatBox, worldBox, glowTex, poolMat } = ctx;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  Object.assign(M, {
    chrome: std({ color: 0xe8ecf0, roughness: 0.16, metalness: 1, envMapIntensity: 1.6 }),
    whitewall: std({ color: 0xf0eee6, roughness: 0.7 }),
    gloss: std({ color: 0xffffff, roughness: 0.32, metalness: 0.25 }),
    enamel: std({ color: 0xffffff, roughness: 0.5, metalness: 0.1 }),
    grass: std({ map: grassTex(), roughness: 1 }),
    checkerD: std({ map: checkerTex(), roughness: 0.5 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x400808, emissive: 0xff2a1a, emissiveIntensity: 1.6 }),
    head: new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0d0, emissiveIntensity: 0.6 }),
    tube: new THREE.MeshStandardMaterial({ color: 0xf0f6ff, emissive: 0xe8f0ff, emissiveIntensity: 3 }),
    popcorn: std({ color: 0xf2d68a, roughness: 0.8 }),
    pine: std({ color: 0xffffff, roughness: 0.95 }),
    chaseA: new THREE.MeshStandardMaterial({ color: 0xffe8b0, emissive: 0xffc860, emissiveIntensity: 8 }),
    chaseB: new THREE.MeshStandardMaterial({ color: 0xffe8b0, emissive: 0xffc860, emissiveIntensity: 0.3 }),
    // the projector beam: a soft additive volume that's bright at the lens and fades toward the screen, with dust
    // drifting through it and the faint flicker of the film running through the gate
    beam: new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(1.0, 0.94, 0.8) } },
      vertexShader: `attribute float along; varying float vAlong; varying vec3 vW; varying vec3 vN; varying vec3 vV;
        void main() { vAlong = along; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; uniform vec3 color; varying float vAlong; varying vec3 vW; varying vec3 vN; varying vec3 vV;
        float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main() {
          float fade = pow(1.0 - vAlong, 1.6) * 0.85 + 0.15;
          float face = 0.35 + 0.65 * abs(dot(normalize(vN), normalize(vV)));          // soft where the sheet turns edge-on
          float dust = 0.6 + 0.4 * n3(vW * 1.4 + vec3(time * 0.12, time * 0.05, -time * 0.09)) + 0.25 * n3(vW * 5.0 + vec3(0.0, time * 0.3, time * 0.2));
          float rays = 0.8 + 0.2 * sin(vW.y * 2.3 + vW.z * 1.7 + time * 0.6);       // the picture's brighter and darker areas
          float flick = 0.95 + 0.05 * sin(time * 150.8) * sin(time * 3.1);           // 24 fps shutter
          float k = fade * face * dust * rays * flick * 0.16;
          gl_FragColor = vec4(color * k, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  });
  Object.assign(ctx.S, { grass: 3, checkerD: 1.2, enamel: 0, gloss: 0, chrome: 0 });
  if (ctx.tex.checker && ctx.tex.checker.photo) { M.checkerD = ctx.pbr(ctx.tex.checker, { roughness: 1 }); ctx.S.checkerD = 3; }
  const P0 = (geo, mat, x, y, z, ry = 0, opts = {}) => put(geo, mat, x, y, z, ry, { grime: 0, ...opts });
  const SB = (mat, w, h, d, x, y, z, opts = {}, surf = 'concrete') => { const b = solid(x, z, w, d, h, y, surf); B(mat, w, h, d, x, y, z, 0, opts); return b; };
  const signs = [];
  const signMesh = (tex, w, h, x, y, z, ry, emissive = 0.9, opts = {}) => {
    const mat = opts.basic ? new THREE.MeshBasicMaterial({ map: tex, transparent: !!opts.transparent, side: opts.double ? THREE.DoubleSide : THREE.FrontSide, color: new THREE.Color(emissive, emissive, emissive) })
      : new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: emissive, roughness: 0.6, transparent: !!opts.transparent, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
    if (opts.transparent) mat.depthWrite = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    if (opts.noMinimap) m.userData.noMinimap = true;
    group.add(m); signs.push(m);
    return m;
  };
  // ry that turns a +z-facing plane to face along (dx, dz)
  const face = (dx, dz) => Math.atan2(dx, dz);
  const rnd = rng(1955);

  // a local frame for vehicles and buildings: lx forward (front of a vehicle), lz to its right
  const frame = (cx, cz, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    return {
      P,
      bx: (mat, w, h, d, lx, y, lz, opts = {}) => { const [x, z] = P(lx, lz); B(mat, w, h, d, x, y, z, ry, { grime: 0.15, ...opts }); },
      g: (geo, mat, lx, y, lz, opts = {}) => { const [x, z] = P(lx, lz); put(geo, mat, x, y, z, ry + (opts.dry || 0), { grime: 0.1, ...opts }); },
      solid: (lx, lz, len, wid, h, y0 = 0, surf = 'metal') => {
        const [x, z] = P(lx, lz), al = Math.abs(c) > 0.5;
        return solid(x, z, al ? len : wid, al ? wid : len, h, y0, surf);
      },
    };
  };
  // tyre with a whitewall and a chrome hubcap; lz is the wheel's outer side
  const wheel = (F, lx, lz, r = 0.36, white = true) => {
    const sgn = Math.sign(lz);
    F.g(new THREE.CylinderGeometry(r, r, 0.24, 20), M.rubber, lx, r, lz, { rx: Math.PI / 2, tint: 0x2a2a2a });
    if (white) F.g(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.02, 20), M.whitewall, lx, r, lz + sgn * 0.12, { rx: Math.PI / 2 });
    F.g(new THREE.CylinderGeometry(r * 0.5, r * 0.55, 0.05, 16), M.chrome, lx, r, lz + sgn * 0.135, { rx: Math.PI / 2 });
    F.solid(lx, lz, r * 1.7, 0.26, 0.34, 0, 'rubber');   // the tyre under the body's collision
  };

  // ---------- vehicles ----------
  // 1950s sedan: long hood, wraparound windscreen, two-tone roof, tail fins, chrome everywhere
  function car50(cx, cz, ry, v) {
    const F = frame(cx, cz, ry), W = 1.9, paint = PAINT[v % PAINT.length], roof = ROOFS[v % ROOFS.length];
    const sh = new THREE.Shape();
    sh.moveTo(-2.3, 0.3); sh.lineTo(-2.32, 0.82); sh.lineTo(-1.25, 0.9); sh.lineTo(-0.98, 1.36);
    sh.quadraticCurveTo(-0.85, 1.44, -0.55, 1.45); sh.lineTo(0.28, 1.45); sh.quadraticCurveTo(0.45, 1.43, 0.5, 1.36);
    sh.lineTo(0.78, 0.97); sh.lineTo(2.12, 0.9); sh.quadraticCurveTo(2.32, 0.86, 2.32, 0.66); sh.lineTo(2.3, 0.3);
    sh.lineTo(1.8, 0.3); sh.absarc(1.42, 0.3, 0.4, 0, Math.PI, false);
    sh.lineTo(-0.95, 0.3); sh.absarc(-1.35, 0.3, 0.4, 0, Math.PI, false); sh.lineTo(-2.3, 0.3);
    const body = new THREE.ExtrudeGeometry(sh, { depth: W - 0.14, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10 });
    body.translate(0, 0, -(W - 0.14) / 2);
    F.g(body, M.gloss, 0, 0.02, 0, { tint: paint, grime: 0.12 });
    // glass, with the roof cap over it in the second colour
    const gl = new THREE.Shape();
    gl.moveTo(-1.18, 0.93); gl.lineTo(-0.94, 1.32); gl.lineTo(0.27, 1.36); gl.lineTo(0.46, 1.31); gl.lineTo(0.72, 0.95); gl.lineTo(-1.18, 0.93);
    const glass = new THREE.ExtrudeGeometry(gl, { depth: W + 0.02, bevelEnabled: false });
    glass.translate(0, 0, -(W + 0.02) / 2);
    F.g(glass, M.glass, 0, 0.02, 0, { sz: 0.94, tint: 0xffffff });
    F.bx(M.gloss, 1.2, 0.05, W - 0.06, -0.15, 1.44, 0, { tint: roof, grime: 0 });
    F.bx(M.chrome, 0.06, 0.4, W - 0.1, -0.35, 0.98, 0, { grime: 0 });                 // B pillar
    // tail fins with a red light at the tip
    const fin = new THREE.Shape(); fin.moveTo(-2.34, 0.8); fin.lineTo(-2.3, 1.12); fin.lineTo(-1.15, 0.9); fin.lineTo(-2.34, 0.8);
    for (const s of [-1, 1]) {
      const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false }); fg.translate(0, 0, -0.04);
      F.g(fg, M.gloss, 0, 0.02, s * (W / 2 - 0.06), { tint: paint });
      F.bx(M.tail, 0.05, 0.1, 0.1, -2.38, 0.95, s * (W / 2 - 0.06));
      F.bx(M.chrome, 3.9, 0.04, 0.03, 0.0, 0.7, s * (W / 2 + 0.005), { grime: 0 });   // side spear
      F.bx(M.gloss, 2.4, 0.18, 0.02, -0.4, 0.5, s * (W / 2 + 0.005), { tint: roof, grime: 0 }); // two-tone flash
    }
    // bumpers, grille, headlights, hood ornament
    F.bx(M.chrome, 0.16, 0.18, W + 0.08, 2.36, 0.3, 0, { grime: 0 });
    F.bx(M.chrome, 0.16, 0.18, W + 0.08, -2.38, 0.3, 0, { grime: 0 });
    F.bx(M.chrome, 0.04, 0.22, 1.1, 2.4, 0.5, 0, { grime: 0, tint: 0x9a9a9a });
    for (const s of [-1, 1]) F.g(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14), M.head, 2.39, 0.72, s * 0.66, { rz: Math.PI / 2 });
    F.g(new THREE.ConeGeometry(0.03, 0.14, 6), M.chrome, 2.05, 0.95, 0, { rz: -Math.PI / 2 });
    for (const lx of [-1.35, 1.42]) for (const s of [-1, 1]) wheel(F, lx, s * 0.82);
    // collision: the body, then the cabin (mostly glass: bullets go through)
    F.solid(0, 0, 4.72, W, 0.62, 0.3, 'metal');                       // open underneath, like the car
    F.solid(-0.2, 0, 1.8, W - 0.4, 0.55, 0.92, 'metal').pass = true;
  }
  // a pickup with a camper shell on the bed
  function pickup(cx, cz, ry, v) {
    const F = frame(cx, cz, ry), W = 2.0, paint = PAINT[(v * 3 + 1) % PAINT.length];
    F.bx(M.gloss, 5.2, 0.62, W, 0, 0.42, 0, { tint: paint });                      // body sides to the waist
    F.bx(M.gloss, 1.2, 0.18, W - 0.2, 1.95, 1.04, 0, { tint: paint });             // hood
    F.bx(M.gloss, 0.12, 0.3, W - 0.1, 2.56, 0.62, 0, { tint: paint });             // nose
    F.bx(M.chrome, 0.08, 0.26, 1.3, 2.62, 0.62, 0, { grime: 0 });                  // grille
    F.bx(M.gloss, 1.3, 0.75, W - 0.1, 0.7, 1.04, 0, { tint: paint });               // cab
    F.bx(M.glass, 0.06, 0.48, W - 0.3, 1.36, 1.2, 0, { grime: 0 });                // windscreen
    for (const s of [-1, 1]) F.bx(M.glass, 0.8, 0.42, 0.04, 0.75, 1.24, s * (W / 2 - 0.03), { grime: 0 });
    // camper shell: aluminium with a cream band and little windows
    F.bx(M.enamel, 3.0, 1.45, W + 0.1, -1.18, 1.04, 0, { tint: 0xd8d4c8, grime: 0.2 });
    F.bx(M.enamel, 3.02, 0.22, W + 0.12, -1.18, 1.75, 0, { tint: paint, grime: 0 });
    for (const s of [-1, 1]) F.bx(M.glass, 0.9, 0.36, 0.04, -1.1, 1.62, s * (W / 2 + 0.06), { grime: 0 });
    F.bx(M.enamel, 2.8, 0.06, W - 0.1, -1.18, 2.49, 0, { tint: 0xc8c4b8 });
    F.bx(M.chrome, 0.12, 0.16, W + 0.08, 2.66, 0.3, 0, { grime: 0 });
    F.bx(M.chrome, 0.12, 0.16, W + 0.08, -2.66, 0.3, 0, { grime: 0 });
    for (const s of [-1, 1]) { F.g(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14), M.head, 2.64, 0.88, s * 0.7, { rz: Math.PI / 2 }); F.bx(M.tail, 0.04, 0.16, 0.12, -2.66, 0.62, s * 0.86); }
    for (const lx of [-1.7, 1.75]) for (const s of [-1, 1]) wheel(F, lx, s * 0.88, 0.4, false);
    F.solid(0, 0, 5.3, W, 0.74, 0.3, 'metal');
    F.solid(-1.18, 0, 3.0, W + 0.1, 1.48, 1.04, 'metal');
    F.solid(0.7, 0, 1.3, W - 0.1, 0.75, 1.04, 'metal');   // the cab: steel doors and roof, small windows
  }
  // panel van: rounded nose, split windscreen, two-tone
  function van(cx, cz, ry, v) {
    const F = frame(cx, cz, ry), W = 2.0, paint = PAINT[(v * 5 + 2) % PAINT.length];
    const sh = new THREE.Shape();
    sh.moveTo(-2.45, 0.32); sh.lineTo(-2.45, 2.2); sh.quadraticCurveTo(-2.45, 2.42, -2.2, 2.42); sh.lineTo(1.8, 2.42);
    sh.quadraticCurveTo(2.3, 2.4, 2.4, 1.6); sh.lineTo(2.48, 0.32);
    sh.lineTo(2.0, 0.32); sh.absarc(1.6, 0.32, 0.4, 0, Math.PI, false); sh.lineTo(-1.2, 0.32); sh.absarc(-1.6, 0.32, 0.4, 0, Math.PI, false); sh.lineTo(-2.45, 0.32);
    const body = new THREE.ExtrudeGeometry(sh, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 8 });
    body.translate(0, 0, -(W - 0.12) / 2);
    F.g(body, M.gloss, 0, 0.02, 0, { tint: paint, grime: 0.18 });
    F.bx(M.gloss, 4.6, 0.95, W + 0.02, -0.1, 1.45, 0, { tint: 0xf0ead8, grime: 0 });  // cream upper half
    for (const s of [-1, 1]) F.bx(M.glass, 0.06, 0.6, 0.8, 2.36, 1.55, s * 0.45, { rz: -0.3, grime: 0 });
    for (const s of [-1, 1]) F.bx(M.glass, 0.7, 0.5, 0.04, 1.6, 1.6, s * (W / 2 + 0.02), { grime: 0 });
    F.bx(M.chrome, 0.12, 0.16, W + 0.08, 2.52, 0.3, 0, { grime: 0 });
    F.bx(M.chrome, 0.12, 0.16, W + 0.08, -2.52, 0.3, 0, { grime: 0 });
    for (const s of [-1, 1]) { F.g(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14), M.head, 2.52, 0.9, s * 0.72, { rz: Math.PI / 2 }); F.bx(M.tail, 0.04, 0.14, 0.1, -2.54, 0.9, s * 0.86); }
    for (const lx of [-1.6, 1.6]) for (const s of [-1, 1]) wheel(F, lx, s * 0.86, 0.38);
    F.solid(0, 0, 4.9, W, 2.1, 0.32, 'metal');
  }
  // step van: an ice-cream truck (v 0/2) or a dairy / bakery delivery truck (v 1/3)
  function stepvan(cx, cz, ry, v) {
    const F = frame(cx, cz, ry), W = 2.2, L = 5.7;
    const ice = v % 2 === 0;
    const base = ice ? [0xf4ecf0, 0xe8f4ec][v >> 1 & 1] : [0xf0ead8, 0xd84a3a][v >> 1 & 1];
    const band = ice ? [0xe07090, 0x4fa8a0][v >> 1 & 1] : [0x2f5a9a, 0xf0ead8][v >> 1 & 1];
    F.bx(M.enamel, L - 0.4, 2.3, W, -0.2, 0.42, 0, { tint: base, grime: 0.2 });
    F.bx(M.enamel, 0.6, 1.4, W - 0.1, L / 2 - 0.35, 0.42, 0, { tint: base, grime: 0.2 });   // rounded nose (low)
    F.bx(M.glass, 0.06, 0.8, W - 0.3, L / 2 - 0.42, 1.85, 0, { rz: -0.15, grime: 0 });
    F.bx(M.enamel, L - 0.38, 0.3, W + 0.02, -0.2, 1.0, 0, { tint: band, grime: 0 });
    F.bx(M.enamel, L - 0.38, 0.12, W + 0.02, -0.2, 2.5, 0, { tint: band, grime: 0 });
    F.bx(M.chrome, 0.12, 0.16, W + 0.06, L / 2 - 0.02, 0.3, 0, { grime: 0 });
    F.bx(M.chrome, 0.12, 0.16, W + 0.06, -L / 2 + 0.02, 0.3, 0, { grime: 0 });
    if (ice) {
      // serving window with an awning on the kerb side, and a giant cone on the roof
      for (const s of [-1, 1]) {
        F.bx(M.dim, 1.6, 0.8, 0.04, -0.6, 1.35, s * (W / 2 + 0.02), { grime: 0 });
        F.bx(M.enamel, 1.8, 0.05, 0.5, -0.6, 2.18, s * (W / 2 + 0.25), { tint: band, grime: 0 });
      }
      F.g(new THREE.ConeGeometry(0.22, 0.5, 10), M.enamel, -1.2, 2.97, 0, { rx: Math.PI, tint: 0xd8a860 });
      F.g(new THREE.SphereGeometry(0.24, 12, 8), M.enamel, -1.2, 3.2, 0, { tint: 0xf4d0dc });
    } else {
      for (const s of [-1, 1]) F.bx(M.glass, 0.7, 0.5, 0.04, 1.8, 1.65, s * (W / 2 + 0.02), { grime: 0 });
    }
    for (const s of [-1, 1]) { F.g(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14), M.head, L / 2 + 0.01, 0.85, s * 0.78, { rz: Math.PI / 2 }); F.bx(M.tail, 0.04, 0.14, 0.12, -L / 2 - 0.02, 0.9, s * 0.9); }
    for (const lx of [-1.9, 1.8]) for (const s of [-1, 1]) wheel(F, lx, s * 0.95, 0.42, false);
    F.solid(-0.15, 0, L - 0.3, W, 2.3, 0.42, 'metal');
  }

  // ---------- ground ----------
  // the dirt beyond the lot sits under the asphalt; a polygon offset keeps it behind at any range (2 cm apart is
  // nothing for the depth buffer 60 m away, and the whole lot flickered)
  { const under = M.dirt.clone(); under.polygonOffset = true; under.polygonOffsetFactor = 4; under.polygonOffsetUnits = 8; M._dirtUnder = under;
    plane(under, 400, 400, 0, 0, -0.05, 0, 0x7a6a58); }
  plane(M.asphalt, 2 * XS, 2 * HZ, 0, 0, 0, 0, 0xb0aaa0);
  for (const sx of [-1, 1]) {
    plane(M.grass, HX - XS + 0.2, 2 * HZ, sx * (HX + XS) / 2, 0, 0.004);       // the lawns behind the screens
    plane(M.grass, 8.5, WS + 12, sx * (XS - 4.25), 0, 0.006);                  // playground lawn under the screen
  }
  // the ramps: a gravel bed under each row of cars, with the kerb stones the front wheels stop on
  {
    const rows = new Map();
    for (const it of DRIVEIN_HALF) {
      if (!['car50', 'pickup', 'van', 'icecream'].includes(it[6]) || it[2] < it[3]) continue;
      const k = it[0].toFixed(1); const r = rows.get(k) || [Infinity, -Infinity];
      rows.set(k, [Math.min(r[0], it[1] - it[3] / 2), Math.max(r[1], it[1] + it[3] / 2)]);
    }
    for (const [k, [z0, z1]] of rows) for (const s of [-1, 1]) {
      const x = +k, len = z1 - z0 + 3.4, zc = (z0 + z1) / 2;
      plane(M.dirt, 5.4, len, s * x, s * zc, 0.008, 0, 0x9a9488);
      for (let z = z0 - 1.2; z <= z1 + 1.2; z += 3.4) P0(flatBox(0.2, 0.1, 1.4), M.concrete, s * (x + 2.95), 0.05, s * z, 0, { cast: false, tint: 0xc8c0b0 });
    }
  }

  // ---------- fences ----------
  // wooden privacy fence: boards on rails between posts (drive-ins fenced the lot so nobody watched from the road)
  const fence = (cx, cz, w, d, h, tall = false) => {
    solid(cx, cz, w, d, h, 0, 'wood');
    const al = w > d, L = al ? w : d;
    B(M.woodOld, w, h, d, cx, 0, cz, 0, { tint: 0x8a7a62, grime: 0.45 });
    B(M.woodOld, al ? w : w + 0.08, 0.1, al ? d + 0.08 : d, cx, h, cz, 0, { tint: 0x6a5a48, grime: 0 });
    const n = Math.max(1, Math.round(L / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = -L / 2 + i * L / n;
      B(M.woodOld, 0.16, h + 0.15, 0.16, al ? cx + t : cx, 0, al ? cz : cz + t, 0, { tint: 0x5a4a3a, grime: 0.4 });
    }
    // battens every 0.6 m on both faces
    for (const s of [-1, 1]) for (let t = -L / 2 + 0.3; t < L / 2; t += 0.6) {
      const o = (al ? d : w) / 2 + 0.015;
      B(M.woodOld, al ? 0.08 : 0.03, h - 0.1, al ? 0.03 : 0.08, al ? cx + t : cx + s * o, 0.05, al ? cz + s * o : cz + t, 0, { tint: [0x7a6a54, 0x948066, 0x6e604c][(Math.abs(t * 10) | 0) % 3], grime: 0.5, cast: false });
    }
    if (tall) return;
  };
  const FH = 4.2;   // the perimeter fence: taller than anything players can climb near it
  fence(0, HZ + 0.15, 2 * HX + 0.6, 0.3, FH, true);
  fence(0, -HZ - 0.15, 2 * HX + 0.6, 0.3, FH, true);
  fence(HX + 0.15, 0, 0.3, 2 * HZ, FH, true);
  fence(-HX - 0.15, 0, 0.3, 2 * HZ, FH, true);

  // ---------- the screens ----------
  const movie = movieTex();
  const screenMat = new THREE.MeshBasicMaterial({ map: movie, color: new THREE.Color(0.95, 0.95, 0.95) });
  // the feature: the project owner's own painting of Terror from Planet Z! (the canvas frame shows until it loads)
  new THREE.TextureLoader().load('assets/textures/drivein/feature.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    screenMat.map = t; screenMat.needsUpdate = true; movie.dispose();
  });
  const towerTint = 0x4a5450;
  const screenTower = (cx, cz, w, d, h) => {
    const s = Math.sign(cx);
    solid(cx, cz, w, d, h, 0, 'wood');
    B(M.paint, w, h, d, cx, 0, cz, 0, { tint: towerTint, grime: 0.5 });
    B(M.concrete, w + 0.3, 0.5, d + 0.3, cx, 0, cz, 0, { grime: 0.5 });
    // back: board-and-batten with the steel bracing
    for (let t = -d / 2 + 0.3; t < d / 2; t += 1.2) B(M.paint, 0.05, h - 0.6, 0.12, cx + s * (w / 2 + 0.025), 0.5, cz + t, 0, { tint: 0x3a4240, grime: 0.4 });
    for (const y of [3, 7, 11]) B(M.metal, 0.06, 0.16, d - 0.2, cx + s * (w / 2 + 0.06), y, cz, 0, { tint: 0x5a5a5a, grime: 0.2 });
  };
  for (const s of [-1, 1]) {
    const x = s * XS;
    // the screen face: white board, the picture on it, a dark frame
    const fx = x - s * 1.21, W = WS - 0.6, H = 10.6, yc = 3.0 + H / 2;
    B(M.enamel, 0.03, H + 0.4, W + 0.4, fx, yc - H / 2 - 0.2, 0, 0, { tint: 0x1a1c1e, grime: 0 });   // 2.5 cm behind the picture: no flicker from across the lot
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), screenMat);
    scr.position.set(fx - s * 0.04, yc, 0); scr.rotation.y = face(-s, 0);
    group.add(scr); signs.push(scr);
    // the theatre's name painted on the back, for the road
    signMesh(textTex('STARLITE', { bg: null, fg: '#e8e0c8', w: 1024, h: 220, font: `900 170px "Arial Black", Impact, sans-serif` }), 18, 3.9, x + s * 1.24, 10.2, 0, face(s, 0), 0.25, { transparent: true });
    // doorway under the screen: lintel, frame, the passage floor
    B(M.concrete, 2.4, 0.3, 3.0, x, 2.6, 0, 0, { grime: 0.3 });
    for (const z of [-1.44, 1.44]) B(M.concrete, 2.4, 2.6, 0.12, x, 0, z, 0, { grime: 0.4 });
    plane(M.concrete, 2.4, 3, x, 0, 0.01, 0, 0x9a948a);
    // tower lights on the back corners
    for (const z of [-WS / 2 + 0.5, WS / 2 - 0.5]) { P0(new THREE.SphereGeometry(0.1, 8, 6), M.bulb, x + s * 1.35, 13.6, z); glows.push([x + s * 1.4, 13.6, z, 1.2]); }
    // red aircraft-warning light on top
    P0(new THREE.SphereGeometry(0.14, 8, 6), M.tail, x, 14.15, 0);
  }
  // the projection beam from the booth on the snack bar roof to each screen
  for (const s of [-1, 1]) {
    const x0 = s * 2.25, y0 = 5.05, x1 = s * (XS - 1.25), H = 10.6, W = WS - 0.6, y1 = 3 + H / 2;
    const p = [[x0, y0 + 0.12, -0.12], [x0, y0 + 0.12, 0.12], [x0, y0 - 0.12, 0.12], [x0, y0 - 0.12, -0.12],
      [x1, y1 + H / 2, -W / 2], [x1, y1 + H / 2, W / 2], [x1, y1 - H / 2, W / 2], [x1, y1 - H / 2, -W / 2]];
    const idx = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
    g0.setAttribute('along', new THREE.Float32BufferAttribute(p.map((_, i) => (i < 4 ? 0 : 1)), 1));   // 0 at the lens, 1 at the screen
    g0.setIndex(idx);
    const g = g0.toNonIndexed(); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.beam);
    m.userData.noMinimap = true; m.renderOrder = 4;
    group.add(m); signs.push(m);
  }

  // ---------- small things ----------
  const speaker = (cx, cz) => {
    solid(cx, cz, 0.14, 0.14, 1.25, 0, 'metal');
    P0(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 8), M.metal, cx, 0.6, cz, 0, { tint: 0x8a8a84 });
    B(M.metal, 0.16, 0.1, 0.16, cx, 1.18, cz, 0, { tint: 0x6a6a64, grime: 0.1 });
    // a speaker hangs on each side (one for each car), with its coiled cord
    for (const s of [-1, 1]) {
      B(M.enamel, 0.1, 0.24, 0.2, cx, 0.98, cz + s * 0.15, 0, { tint: 0x8a9a8a, grime: 0.2 });
      P0(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10), M.dim, cx + 0.052, 1.1, cz + s * 0.15, 0, { rz: Math.PI / 2 });
      P0(new THREE.TorusGeometry(0.06, 0.01, 4, 10), M.rubber, cx - 0.06, 0.8, cz + s * 0.15, 0);
    }
  };
  const billboard = (cx, cz, w, d, h, mat) => {
    const al = w > d, L = al ? w : d, by = 1.4;
    solid(cx, cz, w, d, h - by, by, 'wood');
    for (const t of [-L / 2 + 0.4, L / 2 - 0.4]) { const x = al ? cx + t : cx, z = al ? cz : cz + t; solid(x, z, 0.25, 0.25, by, 0, 'wood'); B(M.woodOld, 0.25, by + 0.1, 0.25, x, 0, z, 0, { tint: 0x5a4a3a }); }
    B(M.woodOld, w, h - by, d, cx, by, cz, 0, { tint: 0xd8d0c0, grime: 0.3 });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, h - by - 0.2), mat);
      m.position.set(al ? cx : cx + s * (w / 2 + 0.01), by + (h - by) / 2, al ? cz + s * (d / 2 + 0.01) : cz);
      m.rotation.y = al ? face(0, s) : face(s, 0);
      group.add(m); signs.push(m);
    }
    // gooseneck lamps over it
    for (const t of [-L / 4, L / 4]) for (const s of [-1, 1]) {
      const x = al ? cx + t : cx + s * (w / 2 + 0.5), z = al ? cz + s * (d / 2 + 0.5) : cz + t;
      P0(new THREE.SphereGeometry(0.1, 8, 6), M.bulb, x, h + 0.15, z); glows.push([x, h + 0.1, z, 1.0]);
    }
  };
  const attractTex = attractionsTex(), attractMat = new THREE.MeshStandardMaterial({ map: attractTex, emissiveMap: attractTex, roughness: 0.8, emissive: 0x6a6258 });
  const wagon = (cx, cz, w, d, h) => {   // popcorn wagon, long along z
    const al = w > d;
    solid(cx, cz, w - 0.3, d - 0.3, 2.3, 0, 'metal');
    solid(cx, cz, w, d, 0.2, 2.45, 'metal');
    B(M.gloss, w - 0.3, 1.2, d - 0.3, cx, 0.45, cz, 0, { tint: 0xb8261e });
    B(M.gloss, w - 0.32, 0.45, d - 0.32, cx, 0.0, cz, 0, { tint: 0x8a1a14 });
    B(M.glass, w - 0.4, 0.6, d - 0.4, cx, 1.65, cz, 0, { grime: 0 });
    B(M.popcorn, w - 0.6, 0.35, d - 0.6, cx, 1.66, cz, 0);
    B(M.chrome, w - 0.3, 0.05, d - 0.3, cx, 2.25, cz, 0);
    // striped canopy
    for (let i = 0; i < 8; i++) {
      const t = -(al ? w : d) / 2 + (i + 0.5) * (al ? w : d) / 8, W = (al ? w : d) / 8;
      B(M.cloth, al ? W : w, 0.2, al ? d : W, al ? cx + t : cx, 2.45, al ? cz : cz + t, 0, { tint: i % 2 ? 0xf0ead8 : 0xc8302a, grime: 0 });
    }
    for (const s of [-1, 1]) for (const t of [-1, 1]) P0(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), M.chrome, cx + s * (w / 2 - 0.2), 2.35, cz + t * (d / 2 - 0.2));
    // big spoked wheels at the sides
    for (const s of [-1, 1]) {
      const x = al ? cx : cx + s * (w / 2 - 0.1), z = al ? cz + s * (d / 2 - 0.1) : cz;
      P0(new THREE.TorusGeometry(0.42, 0.04, 6, 20), M.dark, x, 0.45, z, al ? 0 : Math.PI / 2);
      for (let k = 0; k < 6; k++) P0(flatBox(0.02, 0.8, 0.02), M.dark, x, 0.45, z, al ? 0 : Math.PI / 2, { rz: k * Math.PI / 6 });
    }
    signMesh(textTex('POPCORN', { bg: '#f2d040', fg: '#b8261e', font: RETRO(84) }), 1.6, 0.4, cx + (al ? 0 : Math.sign(-cx) * (w / 2 - 0.13)), 1.35, cz, face(-Math.sign(cx), 0), 0.5);
  };
  const jungle = (cx, cz, w, d, h) => {
    const cols = [0xc8302a, 0xe0b830, 0x2f6ab0];
    const xs = [-w / 2 + 0.1, -w / 6, w / 6, w / 2 - 0.1], zs = [-d / 2 + 0.1, 0, d / 2 - 0.1];
    for (const x of xs) for (const z of zs) {
      solid(cx + x, cz + z, 0.1, 0.1, h, 0, 'metal');
      P0(new THREE.CylinderGeometry(0.04, 0.04, h, 8), M.paint, cx + x, h / 2, cz + z, 0, { tint: cols[(xs.indexOf(x) + zs.indexOf(z)) % 3] });
    }
    // rungs: the top grid (monkey bars) and a middle ring; thin enough to shoot through
    for (const y of [h - 0.05]) {
      for (const z of zs) { solid(cx, cz + z, w - 0.2, 0.06, 0.06, y - 0.03, 'metal').pass = true; P0(new THREE.CylinderGeometry(0.03, 0.03, w - 0.2, 6), M.paint, cx, y, cz + z, 0, { rz: Math.PI / 2, tint: cols[1] }); }
      for (const x of xs) { solid(cx + x, cz, 0.06, d - 0.2, 0.06, y - 0.03, 'metal').pass = true; P0(new THREE.CylinderGeometry(0.03, 0.03, d - 0.2, 6), M.paint, cx + x, y, cz, 0, { rx: Math.PI / 2, tint: cols[2] }); }
    }
    // sand under it
    decal(new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), w + 1.5, d + 1.5, cx, 0.012, cz, 0, -Math.PI / 2);
  };
  const slide = (cx, cz, w, d, h) => {   // along z: ladder at the far end, chute down toward the jungle gym
    const s = -(Math.sign(cz) || 1), z0 = cz - s * (d / 2 - 0.2), zt = cz - s * (d / 2 - 0.9), z1 = cz + s * (d / 2 - 0.05);
    const top = 2.0;
    for (const x of [-0.35, 0.35]) {
      solid(cx + x, z0, 0.08, 0.08, top + 0.9, 0, 'metal');
      P0(new THREE.CylinderGeometry(0.03, 0.03, top + 0.9, 6), M.chrome, cx + x, (top + 0.9) / 2, z0);
      solid(cx + x, zt, 0.08, 0.08, top, 0, 'metal');
      P0(new THREE.CylinderGeometry(0.03, 0.03, top, 6), M.chrome, cx + x, top / 2, zt);
    }
    for (let y = 0.3; y < top; y += 0.3) P0(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), M.chrome, cx, y, z0, 0, { rz: Math.PI / 2 });
    solid(cx, (z0 + zt) / 2, 0.8, Math.abs(zt - z0) + 0.08, 0.06, top - 0.06, 'metal');
    B(M.metal, 0.8, 0.06, Math.abs(zt - z0) + 0.08, cx, top - 0.06, (z0 + zt) / 2, 0, { tint: 0xb0b0b0 });
    // the chute: a ramp you can run up, in steps under the polished sheet
    const n = 8, L = Math.abs(z1 - zt);
    for (let i = 0; i < n; i++) {
      const za = zt + s * (i * L / n), zb = zt + s * ((i + 1) * L / n), yt = top - (i + 1) * (top - 0.25) / n;
      solid(cx, (za + zb) / 2, 0.7, L / n, 0.12, Math.max(0, yt - 0.12), 'metal');
    }
    const ang = Math.atan2(top - 0.25, L), len = Math.hypot(L, top - 0.25);
    P0(flatBox(0.7, 0.04, len), M.chrome, cx, (top + 0.25) / 2 - 0.02, (zt + z1) / 2, 0, { rx: s * ang });
    for (const x of [-0.36, 0.36]) P0(flatBox(0.04, 0.2, len), M.chrome, cx + x, (top + 0.25) / 2 + 0.08, (zt + z1) / 2, 0, { rx: s * ang });
    P0(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), M.chrome, cx, 0.6, (zt + z1) / 2 + s * 0.4);
  };
  const restroom = (cx, cz, w, d, h) => {
    const s = -Math.sign(cz);   // doors face the lot
    SB(M.brick, w, h, d, cx, 0, cz, { tint: 0xd8c8b0, grime: 0.4 }, 'brick');
    B(M.concrete, w + 0.4, 0.2, d + 0.4, cx, h, cz, 0, { tint: 0xc8c0b0, grime: 0.2 });
    const fz = cz + s * (d / 2 + 0.01);
    for (const [dx, t, col] of [[-1.4, 'MEN', '#2f5a9a'], [1.4, 'WOMEN', '#c84a6a']]) {
      B(M.paint, 1.0, 2.1, 0.06, cx + dx, 0, fz, 0, { tint: 0x4a6a6a, grime: 0.2 });
      signMesh(textTex(t, { bg: '#f0ead8', fg: col, w: 256, h: 96, font: 'bold 64px Arial' }), 0.8, 0.3, cx + dx, 2.25, fz + s * 0.04, face(0, s), 0.4);
    }
    signMesh(textTex('REST ROOMS', { bg: '#1c2a3a', fg: '#f4f0d8', font: RETRO(70) }), 3.2, 0.6, cx, h - 0.45, fz + s * 0.05, face(0, s), 0.6);
    P0(new THREE.SphereGeometry(0.12, 8, 6), M.bulb, cx, 2.75, fz + s * 0.25); glows.push([cx, 2.75, fz + s * 0.3, 1.4]);
    decal(poolMat, 6, 6, cx, 0.04, fz + s * 2.2, 0, -Math.PI / 2);
  };
  const shed = (cx, cz, w, d, h) => {
    const s = -Math.sign(cz);
    SB(M.metal, w, h, d, cx, 0, cz, { tint: 0x8a9090, grime: 0.5 }, 'metal');
    for (let t = -w / 2 + 0.15; t < w / 2; t += 0.3) B(M.metal, 0.06, h - 0.1, 0.04, cx + t, 0, cz + s * (d / 2 + 0.02), 0, { tint: 0x7a8080, grime: 0.4, cast: false });
    B(M.paint, 1.8, 2.2, 0.06, cx, 0, cz + s * (d / 2 + 0.05), 0, { tint: 0x6a3a2a, grime: 0.5 });
    signMesh(textTex('PROJECTION SUPPLY · KEEP OUT', { bg: '#e8e0c8', fg: '#7a1a14', w: 1024, h: 96, font: 'bold 60px Arial' }), 3.2, 0.3, cx, 2.55, cz + s * (d / 2 + 0.1), face(0, s), 0.3);
  };
  const boxoffice = (cx, cz, w, d, h) => {
    SB(M.enamel, w, 1.0, d, cx, 0, cz, { tint: 0xf0ead8, grime: 0.3 });
    solid(cx, cz, w - 0.3, d - 0.3, h - 1.0, 1.0, 'concrete').pass = true;   // glass booth: see and shoot through
    B(M.glass, w - 0.3, h - 1.1, d - 0.3, cx, 1.0, cz, 0, { grime: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(M.enamel, 0.14, h - 1.0, 0.14, cx + sx * (w / 2 - 0.2), 1.0, cz + sz * (d / 2 - 0.2), 0, { tint: 0xb8261e });
    SB(M.enamel, w + 0.6, 0.25, d + 0.6, cx, h, cz, { tint: 0xb8261e, grime: 0 });
    signMesh(textTex('TICKETS', { bg: '#b8261e', fg: '#fff6d8', font: RETRO(76) }), 2.2, 0.5, cx - Math.sign(cx) * (w / 2 + 0.31), h + 0.12, cz, face(-Math.sign(cx), 0), 0.8);
    P0(new THREE.SphereGeometry(0.12, 8, 6), M.bulb, cx, h - 0.1, cz); glows.push([cx, h - 0.2, cz, 1.6]);
  };
  // the marquee at the entrance (in the fenced-off corner by the road; visible over the fence)
  const chase = [];
  const marquee = (cx, cz) => {
    const s = Math.sign(cx), bw = 7.2, by = 4.6, bh = 3.8;
    for (const dx of [-2.2, 2.2]) SB(M.metal, 0.35, by, 0.35, cx + dx, 0, cz, { tint: 0x5a5a5a }, 'metal');
    SB(M.enamel, bw, bh, 0.7, cx, by, cz, { tint: 0x2a2a30, grime: 0.2 }, 'metal');
    const mt = marqueeTex();
    for (const sz of [-1, 1]) {
      signMesh(mt, bw - 0.7, bh - 1.6, cx, by + (bh - 1.6) / 2 + 0.35, cz + sz * 0.37, face(0, sz), 1.0);
      const n = neonTex('STARLITE', '#ff3a5a'); signMesh(n, bw - 0.6, 1.3, cx, by + bh - 0.65, cz + sz * 0.38, face(0, sz), 2.6, { transparent: true, noMinimap: true });
      // chaser bulbs round the board
      let k = 0;
      for (let t = -bw / 2 + 0.2; t <= bw / 2 - 0.2; t += 0.3) for (const y of [by + 0.15, by + bh - 0.12]) P0(new THREE.SphereGeometry(0.06, 6, 4), (k++ % 2) ? M.chaseA : M.chaseB, cx + t, y, cz + sz * 0.37);
      for (let y = by + 0.45; y < by + bh - 0.3; y += 0.3) for (const t of [-bw / 2 + 0.15, bw / 2 - 0.15]) P0(new THREE.SphereGeometry(0.06, 6, 4), (k++ % 2) ? M.chaseA : M.chaseB, cx + t, y, cz + sz * 0.37);
    }
    // a tall arrow pointing in, with its own bulbs
    SB(M.enamel, 0.5, 3.6, 0.5, cx - s * (bw / 2 + 0.1), by + bh, cz, { tint: 0xe0b830, grime: 0 }, 'metal');
    for (let y = by + bh + 0.2; y < by + bh + 3.5; y += 0.3) for (const sz of [-1, 1]) P0(new THREE.SphereGeometry(0.06, 6, 4), M.chaseA, cx - s * (bw / 2 + 0.1), y, cz + sz * 0.26);
    glows.push([cx, by + bh + 0.6, cz, 3.0]);
    chase.push(1);
  };

  // ---------- the snack bar (centre): counter and fridges inside, stairs to the roof and the projection booth ----------
  const wallSeg = (x0, z0, x1, z1, y0, y1, t, mat, tint) => {   // axis-aligned wall piece from (x0,z0) to (x1,z1)
    const al = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = al ? x1 - x0 : z1 - z0;
    if (L <= 0.01 || y1 - y0 <= 0.01) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = al ? L : t, d = al ? t : L;
    solid(cx, cz, w, d, y1 - y0, y0, 'brick');
    B(mat, w, y1 - y0, d, cx, y0, cz, 0, { tint, grime: 0.3 });
  };
  // a wall along x (at z) or z (at x) from a to b with openings [[centre, width, bottom, top]]
  const wall = (axis, at, a, b, y0, y1, t, holes, mat, tint) => {
    const seg = (p, q, ya, yb) => axis === 'x' ? wallSeg(p, at, q, at, ya, yb, t, mat, tint) : wallSeg(at, p, at, q, ya, yb, t, mat, tint);
    const hs = [...holes].sort((h1, h2) => h1[0] - h2[0]);
    let p = a;
    for (const [c, w, hb, ht] of hs) {
      seg(p, c - w / 2, y0, y1);
      if (hb > y0) seg(c - w / 2, c + w / 2, y0, hb);
      if (ht < y1) seg(c - w / 2, c + w / 2, ht, y1);
      p = c + w / 2;
    }
    seg(p, b, y0, y1);
  };
  function snackbar(w, d) {
    const X = w / 2, Z = d / 2, t = 0.3, wallTop = ROOF - 0.3;
    const cream = 0xf0e6cc, red = 0xb8261e, aqua = 0x5ab0a8;
    plane(M.checkerD, w - 0.2, d - 0.2, 0, 0, 0.012);
    // walls: doors on every side, serving hatches on the long (lot) sides
    for (const s of [-1, 1]) {
      wall('z', s * (X - t / 2), -Z, Z, 0, wallTop, t, [[s * 3.9, 1.6, 0, 2.4], [-s * 2.1, 1.6, 0, 2.4], [0, 2.0, 1.05, 2.2]], M.plaster, cream);   // doors offset end to end: no line straight through
      wall('x', s * (Z - t / 2), -X + t, X - t, 0, wallTop, t, [[-s * 3.2, 1.6, 0, 2.4], [-s * 5.6, 1.4, 1.05, 2.2]], M.plaster, cream);
      // red band and an aqua kick strip round the outside (decoration only)
      B(M.enamel, 0.04, 0.5, d, s * (X + 0.02), 2.75, 0, 0, { tint: red, grime: 0, cast: false });
      B(M.enamel, w, 0.5, 0.04, 0, 2.75, s * (Z + 0.02), 0, { tint: red, grime: 0, cast: false });
      // hatch counters (outside ledge) and awnings
      SB(M.enamel, 0.4, 0.08, 2.2, s * (X + 0.2), 1.0, 0, { tint: 0xd8d0c0 });
      B(M.cloth, 1.0, 0.06, 2.6, s * (X + 0.5), 2.45, 0, 0, { tint: red, rz: s * 0.25, grime: 0 });
      // SNACK BAR neon over the hatch
      signMesh(neonTex('SNACK BAR', '#ff5a7a'), 4.6, 1.0, s * (X + 0.06), 3.05, 0, face(s, 0), 2.6, { transparent: true, noMinimap: true });
      signMesh(menuTex(), 1.6, 1.0, s * (X - t - 0.02), 2.78, 0, face(-s, 0), 0.5);
    }
    // roof slab and parapet (gaps where the stairs arrive)
    solid(0, 0, w, d, 0.3, ROOF - 0.3, 'concrete');
    B(M.concrete, w + 0.2, 0.3, d + 0.2, 0, ROOF - 0.3, 0, 0, { tint: 0xd8d0c0, grime: 0.2 });
    plane(M.concrete, w, d, 0, 0, ROOF + 0.02, 0, 0x9a948a);
    const PH = 0.95, pt = 0.25;
    for (const s of [-1, 1]) {
      // ends (x): full; sides (z): a gap at the stair head
      wallSeg(s * (X - pt / 2), -Z, s * (X - pt / 2), Z, ROOF, ROOF + PH, pt, M.plaster, cream);
      const g0 = s * 1.3, g1 = s * 3.6;   // stair head on +z for s=1 is at x 1.3..3.6 (mirrored on -z)
      const a = Math.min(g0, g1), b = Math.max(g0, g1);
      wallSeg(-X + pt, s * (Z - pt / 2), a, s * (Z - pt / 2), ROOF, ROOF + PH, pt, M.plaster, cream);
      wallSeg(b, s * (Z - pt / 2), X - pt, s * (Z - pt / 2), ROOF, ROOF + PH, pt, M.plaster, cream);
    }
    // outside stairs up the long walls: masonry, 12 risers of 0.3 m, landing at the top
    for (const s of [-1, 1]) {
      const z = s * (Z + 0.65), n = 12, tread = 0.34, xb = s * 6.6;
      for (let k = 1; k <= n; k++) {
        const xa = xb - s * k * tread, xc = xa + s * tread / 2;
        solid(xc, z, tread, 1.3, k * 0.3, 0, 'concrete');
        B(M.concrete, tread, k * 0.3, 1.3, xc, 0, z, 0, { tint: 0xc8c0b0, grime: 0.3 });
      }
      const xl = xb - s * n * tread;   // landing from here back to the gap's far end
      const lx0 = Math.min(xl, s * 1.3), lx1 = Math.max(xl, s * 1.3);
      SB(M.concrete, lx1 - lx0, ROOF, 1.3, (lx0 + lx1) / 2, 0, z, { tint: 0xc8c0b0, grime: 0.3 });
      // handrail on the outside edge (stops players, not bullets)
      const rz = z + s * 0.62;
      for (let k = 0; k <= 4; k++) P0(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), M.chrome, xb - s * k * (n * tread) / 4, k * n / 4 * 0.3 + 0.5, rz);
      const len = Math.hypot(n * tread, n * 0.3);
      P0(new THREE.CylinderGeometry(0.03, 0.03, len, 6), M.chrome, xb - s * n * tread / 2, n * 0.3 / 2 + 1.0, rz, 0, { rz: Math.atan2(s * tread, 0.3) });
      const rl = solid(xb - s * n * tread / 2, rz, n * tread, 0.06, 1.0 + ROOF, 0, 'metal'); rl.pass = true;
    }
    // inside: the island counter with a glass case and a popcorn machine, fridges along the end walls
    SB(M.enamel, 6, 1.0, 1.0, 0, 0, 0, { tint: aqua, grime: 0.2 });
    B(M.enamel, 6.1, 0.06, 1.1, 0, 1.0, 0, 0, { tint: 0xe8e2d2, grime: 0 });
    solid(-1.6, 0, 1.8, 0.7, 0.55, 1.06, 'concrete').pass = true;
    B(M.glass, 1.8, 0.55, 0.7, -1.6, 1.06, 0, 0, { grime: 0 });
    B(M.popcorn, 1.7, 0.2, 0.6, -1.6, 1.07, 0, 0);
    SB(M.gloss, 0.7, 0.8, 0.6, 1.8, 1.06, 0, { tint: 0xc8302a, grime: 0 });
    B(M.glass, 0.6, 0.5, 0.5, 1.8, 1.2, 0, 0, { grime: 0 });
    B(M.popcorn, 0.55, 0.2, 0.45, 1.8, 1.22, 0, 0);
    for (const s of [-1, 1]) {
      // fridges (glTF: Khronos "Commercial Refrigerator", CC-BY 4.0) or boxes
      const fx = s * (X - t - 0.5);
      for (const fz of [-s * 4.0, s * 2.2]) {
        if (PROPS.fridge) {
          const P = PROPS.fridge, bb = P.box, k = 2.0 / (bb.max.y - bb.min.y), c = bb.getCenter(new THREE.Vector3());
          const ry = face(-s, 0);
          const ox = -(c.x * Math.cos(ry) + c.z * Math.sin(ry)) * k, oz = -(-c.x * Math.sin(ry) + c.z * Math.cos(ry)) * k;
          for (const pt2 of P.parts) put(pt2.geo.clone(), pt2.mat, fx + ox, -bb.min.y * k, fz + oz, ry, { sx: k, sy: k, sz: k, grime: 0, cast: true });
        } else {
          B(M.enamel, 0.85, 2.0, 0.9, fx, 0, fz, 0, { tint: 0xd8d8d8 });
          B(M.glass, 0.04, 1.4, 0.75, fx - s * 0.44, 0.4, fz, 0, { grime: 0 });
        }
        solid(fx, fz, 0.85, 0.9, 2.0, 0, 'metal');
      }
    }
    // fluorescent tubes under the roof
    for (const x of [-4, 0, 4]) for (const z of [-2.5, 2.5]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.12), M.tube); m.position.set(x, ROOF - 0.33, z); group.add(m); glows.push([x, ROOF - 0.4, z, 0.8]); }
    const pl = new THREE.PointLight(0xfff4e0, 18, 12, 1.6); pl.position.set(0, 2.9, 0); pl.userData.mapLight = true; group.add(pl);
    // the projection booth on the roof: ports facing both screens, doors on the sides
    const bw = 4.5, bd = 3.2, bh = 2.5, bt = 0.2, by = ROOF;
    for (const s of [-1, 1]) {
      wall('z', s * (bw / 2 - bt / 2), -bd / 2, bd / 2, by, by + bh, bt, [[0, 0.7, 1.2 + by, 1.6 + by]], M.plaster, 0xe8dcc0);
      wall('x', s * (bd / 2 - bt / 2), -bw / 2 + bt, bw / 2 - bt, by, by + bh, bt, [[-s * 1.0, 0.9, by, by + 2.1]], M.plaster, 0xe8dcc0);
    }
    solid(0, 0, bw + 0.3, bd + 0.3, 0.2, by + bh, 'concrete');
    B(M.concrete, bw + 0.3, 0.2, bd + 0.3, 0, by + bh, 0, 0, { tint: 0x8a8478 });
    // the two projectors, back to back, with their reels
    for (const s of [-1, 1]) {
      SB(M.metal, 0.9, 1.05, 0.5, s * 1.3, by, 0, { tint: 0x3a4a3a }, 'metal');
      B(M.metal, 0.7, 0.3, 0.3, s * 1.75, by + 1.05, 0, 0, { tint: 0x2a3a2a });
      for (const dx of [-0.25, 0.3]) P0(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 20), M.metal, s * 1.3 + s * dx, by + 1.6, 0, 0, { rx: Math.PI / 2, tint: 0x9a9a9a });
      P0(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 10), M.dim, s * 2.15, by + 1.4, 0, 0, { rz: Math.PI / 2 });
      glows.push([s * 2.28, by + 1.4, 0, 1.4]);
    }
    const bl = new THREE.PointLight(0xffd8a0, 6, 6, 1.8); bl.position.set(0, by + 2.2, 0); bl.userData.mapLight = true; group.add(bl);
    // roof-top sign frame: a big lit "STARLITE" over the booth facing each side's lot
    SB(M.enamel, 0.08, 1.05, 4.5, 0, by + bh + 0.2, 0, { tint: 0x15171a, grime: 0 }, 'metal');
    for (const s of [-1, 1]) signMesh(neonTex('★ STARLITE ★', '#5ad0ff', { font: RETRO(110) }), 4.4, 0.95, s * 0.05, by + bh + 0.75, 0, face(s, 0), 2.4, { transparent: true, noMinimap: true, double: false });
  }

  // ---------- lamps (glTF: Khronos "Lantern", CC0) ----------
  const lamp = (x, z, ry, light = true) => {
    const s = 5.4;
    if (PROPS.lantern) {
      const P = PROPS.lantern, k = s / (P.box.max.y - P.box.min.y);
      for (const pt2 of P.parts) put(pt2.geo.clone(), pt2.mat, x, -P.box.min.y * k, z, ry, { sx: k, sy: k, sz: k, grime: 0 });
      const hx = x + Math.cos(ry) * 9.6 * k, hz = z - Math.sin(ry) * 9.6 * k, hy = 17.5 * k;
      glows.push([hx, hy, hz, 1.8]);
      decal(poolMat, 7, 7, hx, 0.05, hz, 0, -Math.PI / 2);
      if (light) {   // a real light under the lot lamps (High / Ultra); the yard lamps only glow
        const sp = new THREE.SpotLight(0xffc27a, 110, 16, 1.0, 0.65, 1.6);
        sp.position.set(hx, hy, hz); sp.target.position.set(hx, 0, hz); sp.userData.lampLight = true;
        group.add(sp, sp.target);
      }
    } else {
      P0(new THREE.CylinderGeometry(0.07, 0.1, s, 8), M.dark, x, s / 2, z);
      P0(new THREE.SphereGeometry(0.2, 8, 6), M.bulb, x, s, z); glows.push([x, s, z, 1.8]);
    }
    solid(x, z, 0.8, 0.8, 1.0, 0, 'metal');
    solid(x, z, 0.3, 0.3, s * 0.8 - 1.0, 1.0, 'metal');
  };

  // ---------- place the layout ----------
  const placeItem = (cx, cz, w, d, h, y0, kind, extra) => {
    const nb = physics.boxes.length;
    const along = w > d;
    const rySX = along ? (cx >= 0 ? 0 : Math.PI) : (cz >= 0 ? -Math.PI / 2 : Math.PI / 2);   // vehicles face the nearer screen
    switch (kind) {
      case 'screen': screenTower(cx, cz, w, d, h); break;
      case 'screenbeam':
        solid(cx, cz, w, d, h, y0, 'wood');
        B(M.paint, w, h, d, cx, y0, cz, 0, { tint: towerTint, grime: 0.3 });
        break;
      case 'fence': fence(cx, cz, w, d, h); break;
      case 'billboard': billboard(cx, cz, w, d, h, attractMat); break;
      case 'wagon': wagon(cx, cz, w, d, h); break;
      case 'restroom': restroom(cx, cz, w, d, h); break;
      case 'shed': shed(cx, cz, w, d, h); break;
      case 'boxoffice': boxoffice(cx, cz, w, d, h); break;
      case 'marquee': marquee(cx, cz); break;
      case 'jungle': jungle(cx, cz, w, d, h); break;
      case 'slide': slide(cx, cz, w, d, h); break;
      case 'speaker': speaker(cx, cz); break;
      case 'car50': car50(cx, cz, rySX, extra | 0); break;
      case 'pickup': pickup(cx, cz, rySX, extra | 0); break;
      case 'van': van(cx, cz, rySX, extra | 0); break;
      case 'icecream': stepvan(cx, cz, rySX, extra | 0); break;
      case 'snackbar': snackbar(w, d); break;
      default: SB(M.concrete, w, h, d, cx, y0, cz);
    }
    for (let i = nb; i < physics.boxes.length; i++) if (!physics.boxes[i].src) physics.boxes[i].src = `${kind}@${+cx.toFixed(1)},${+cz.toFixed(1)}`;
  };
  for (const it of DRIVEIN_CENTER) placeItem(...it);
  for (const it0 of DRIVEIN_HALF) {
    // speaker posts stand by one car's door rather than mid-gap, so the gap between two parked cars stays wide
    // enough to walk through (a post in the middle leaves two 0.68 m slots, just too narrow for a player)
    const it = it0[6] === 'speaker' ? [it0[0], it0[1] - 0.5, ...it0.slice(2)] : it0;
    placeItem(...it); placeItem(-it[0], -it[1], ...it.slice(2));
  }

  // lamps: along the perimeter road and the lawns, arms out over the lot
  for (const s of [-1, 1]) {
    for (const x of [-30, -6, 18]) lamp(s * x, s * (HZ - 0.9), s > 0 ? Math.PI / 2 : -Math.PI / 2);
    lamp(s * 34.5, s * -15.5, s > 0 ? 0 : Math.PI);
    lamp(s * 34.5, s * 15.5, s > 0 ? Math.PI : 0);
    lamp(s * (HX - 1), s * 12, s > 0 ? Math.PI : 0, false);
    lamp(s * (HX - 1), s * -12, s > 0 ? Math.PI : 0, false);
    lamp(s * (XS + 5), s * 20.4, s > 0 ? Math.PI / 2 : -Math.PI / 2, false);
    lamp(s * (XS + 5), s * -20.4, s > 0 ? -Math.PI / 2 : Math.PI / 2, false);
    // the picture lights the front rows
    const sl = new THREE.PointLight(0xc8d8ff, 60, 34, 1.4); sl.position.set(s * (XS - 5), 8, 0); sl.userData.mapLight = true; group.add(sl);
  }
  // traffic cones at the entrance lane (glTF: Khronos "Traffic Cone", CC-BY 4.0)
  if (PROPS.cone) {
    const P = PROPS.cone, k = 0.72 / (P.box.max.y - P.box.min.y), c = P.box.getCenter(new THREE.Vector3());
    for (const s of [-1, 1]) for (const [x, z] of [[40, -30], [39, -28], [38, -26]]) {
      for (const pt2 of P.parts) put(pt2.geo.clone(), pt2.mat, s * x - c.x * k, -P.box.min.y * k, s * z - c.z * k, 0, { sx: k, sy: k, sz: k, grime: 0 });
      solid(s * x, s * z, 0.4, 0.4, 0.7, 0, 'rubber').pass = true;
    }
  }
  // spawn yards: picnic tables (cover) and the team's flag on the screen tower
  for (const s of [-1, 1]) {
    for (const z of [-9.5, 9.5]) {
      const x = s * (HX - 4.5);
      solid(x, s * z, 1.8, 0.8, 0.08, 0.7, 'wood');
      for (const dx of [-0.75, 0.75]) solid(x + dx, s * z, 0.08, 1.6, 0.7, 0, 'wood');
      B(M.wood, 1.8, 0.06, 0.8, x, 0.72, s * z, 0, { tint: 0x9a7a5a });
      for (const dz of [-0.7, 0.7]) { solid(x, s * z + dz, 1.8, 0.3, 0.45, 0, 'wood').pass = true; B(M.wood, 1.8, 0.05, 0.3, x, 0.42, s * z + dz, 0, { tint: 0x8a6a4a }); }
      for (const dx of [-0.75, 0.75]) B(M.wood, 0.08, 0.72, 1.6, x + dx, 0, s * z, 0, { tint: 0x6a5a48 });
    }
  }
  // tree line beyond the fence
  {
    const r = rng(31);
    for (let i = 0; i < 150; i++) {
      const a = r() * Math.PI * 2, rx = HX + 4 + r() * 40, rz = HZ + 4 + r() * 40;
      const x = Math.cos(a) * rx * 1.0, z = Math.sin(a) * rz;
      if (Math.abs(x) < HX + 2 && Math.abs(z) < HZ + 2) continue;
      const h = 9 + r() * 10;
      P0(new THREE.CylinderGeometry(0.2, 0.3, h * 0.4, 6), M.woodOld, x, h * 0.2, z, 0, { tint: 0x4a3a2a, cast: false });
      for (let k = 0; k < 3; k++) P0(new THREE.ConeGeometry(h * (0.28 - k * 0.06), h * 0.45, 8), M.pine, x, h * (0.35 + k * 0.2), z, r() * 3, { tint: [0x24321e, 0x2a3a22, 0x1e2a1a][k], cast: false });
    }
  }

  // intermission clocks: brick pillars between the outer row and the lawn (they also break the long lane there)
  for (const s of [-1, 1]) {
    const x = s * 34.6, z = s * -3.4;
    SB(M.brick, 0.9, 2.6, 0.9, x, 0, z, { tint: 0xc8a890, grime: 0.4 }, 'brick');
    SB(M.enamel, 1.1, 0.9, 1.1, x, 2.6, z, { tint: 0x1c2a3a, grime: 0 }, 'metal');
    const ct = canvasTex(256, 256, (g) => {
      g.fillStyle = '#f4f0e0'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 8; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.beginPath(); g.moveTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke(); }
      g.lineWidth = 10; g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 50); g.moveTo(128, 128); g.lineTo(186, 150); g.stroke();
      g.fillStyle = '#b8261e'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('INTERMISSION', 128, 190);
    });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) signMesh(ct, 0.8, 0.8, x + dx * 0.56, 3.05, z + dz * 0.56, face(dx, dz), 0.8);
  }
  // stars over the dusk sky
  {
    const r = rng(9), pts = [];
    for (let i = 0; i < 700; i++) { const a = r() * Math.PI * 2, e = 0.18 + Math.pow(r(), 0.7) * 1.3; pts.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6e8, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
    st.renderOrder = -1; st.frustumCulled = false; st.userData.noMinimap = true; group.add(st);
  }

  // ---------- ambient life ----------
  let flick = 0;
  return {
    upper: {
      // the snack bar roof, for bots: the stairs on both long sides
      y: ROOF, bounds: { minX: -7, maxX: 7, minZ: -5.45, maxZ: 5.45 },
      portals: [1, -1].map(s => {
        const z = s * (5.45 + 0.65);
        return { rect: [Math.min(s * 1.2, s * 7.2), Math.min(z - 0.7, z + 0.7), Math.max(s * 1.2, s * 7.2), Math.max(z - 0.7, z + 0.7)],
          climb: [[s * 7.4, 0, z], [s * 6.4, 0.3, z], [s * 4.6, 1.8, z], [s * 2.6, ROOF, z], [s * 2.0, ROOF, z], [s * 2.0, ROOF, s * 4.4]] };
      }),
    },
    menuCam(t, cam) {
      cam.position.set(Math.cos(t * 0.6) * 30, 9 + Math.sin(t * 0.5) * 2, Math.sin(t * 0.6) * 22);
      cam.lookAt(XS, 7, 0);
    },
    update(dt, time) {
      // projector flicker, and the marquee's chaser lights
      flick += dt;
      if (flick > 0.07) {
        flick = 0;
        const f = 0.92 + Math.sin(time * 23) * 0.012;      // a faint projector shimmer (no sudden dips)
        screenMat.color.setScalar(f);
      }
      M.beam.uniforms.time.value = time;
      const on = Math.floor(time * 3) % 2 === 0;
      M.chaseA.emissiveIntensity = on ? 8 : 0.3;
      M.chaseB.emissiveIntensity = on ? 0.3 : 8;
    },
  };
}
