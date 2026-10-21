// King Street Station: a Link light rail stop under Pioneer Place (in place of the Seattle Underground).
// Three levels: the street; the concourse 4.2 m down (a ticket hall from a model, CC-BY "Subway station" by
// Pasha, reached from the two plaza stairwells through a tiled passage); and the platforms 7 m below that, down
// the hall's two long stairs. Two tracks run north-south between side platforms and on through tunnels past
// both ends of the map. 1 Line trains (two-car Siemens S70s in Sound Transit livery) run both ways on a fixed
// timetable off a clock every machine shares; one that hits you on the tracks kills you.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Box } from './physics.js';
import { PROPS } from './props.js';
import { CONCOURSE_BOXES } from './station_data.js';

export const YC = -4.2;            // concourse floor
export const YP = -11.2;           // platform tops
const PIT = YP - 0.9;              // track bed
const RAIL = PIT + 0.25;           // rail heads
const CEIL_P = YC - 0.3;           // platform-level ceiling (the underside of the concourse floor)
const TUN_TOP = PIT + 5.6;         // tunnel ceiling
// the concourse model in the world: model metres + offset (its hall floor sits at model y 3.2)
const DX = -15.6, DY = YC - 3.2, DZ = 11.24;
const HALL = [-6.0, -37.46, 13.9, 0];          // [x0, z0, x1, z1]
const PASSAGE = [0.5, 0, 12, 6.5];              // from the plaza stairwells to the hall's open south end
const PL = { x0: -6.2, x1: 14.2, z0: -36, z1: 24 };
const PIT_X = [0, 8];
const STOP_Z = (PL.z0 + PL.z1) / 2;             // where a train's middle stops
// the hall's two stairs down to the platforms (top at the concourse, bottom on a platform)
const STAIRS = [
  { x0: -6.2, x1: -2.4, top: -18.11, bot: -3.89, cx: -4.2 },   // to the west (northbound) platform
  { x0: 10.0, x1: 14.2, top: -17.6, bot: -3.71, cx: 11.8 },    // to the east (southbound) platform
];
export const TRACKS = [
  { x: 1.5, dir: -1, dest: 'NORTHGATE', side: -1, offset: 0 },     // northbound (toward -z), doors to the west
  { x: 6.5, dir: 1, dest: 'ANGLE LAKE', side: 1, offset: 45 },     // southbound, doors to the east
];
// ground over the station: cut out of the street's collision, a thin lid instead (the street stays walkable)
export const STATION_LIDS = [HALL, PASSAGE];
// bot navigation: the concourse joins the street by the plaza stairwells, the platforms join the concourse
export const STATION_LEVELS = [
  {
    y: YC, bounds: { minX: -7, maxX: 19, minZ: -38, maxZ: 7 },
    portals: [
      { rect: [-6, 2.3, 0.5, 4.7], climb: [[-7, 0, 3.5], [-5.6, 0, 3.5], [-2.75, YC / 2, 3.5], [0.2, YC, 3.5], [1.4, YC, 3.5]] },
      { rect: [12, 2.3, 18.5, 4.7], climb: [[19.6, 0, 3.5], [18.2, 0, 3.5], [15.25, YC / 2, 3.5], [12.3, YC, 3.5], [11.1, YC, 3.5]] },
    ],
  },
  {
    y: YP, bounds: { minX: -7, maxX: 15, minZ: -37, maxZ: 25 },
    portals: STAIRS.map(s => ({
      link: 1, rect: [s.x0, s.top - 0.2, s.x1, s.bot + 0.1],
      climb: [[s.cx, YC, s.top - 1.8], [s.cx, YC, s.top - 0.3], [s.cx, (YC + YP) / 2, (s.top + s.bot) / 2], [s.cx, YP, s.bot + 0.3], [s.cx, YP, s.bot + 1.8]],
    })),
  },
];

// ---------- timetable ----------
// each track: a train every PERIOD s, offset so the two directions alternate. Approach at 20 m/s, brake at
// 1.4 m/s² to a stop in the platform, dwell, pull out at 1.1 m/s² and run on into the far tunnel.
const V = 20, DEC = 1.4, ACC = 1.1, CRUISE = 6, DWELL = 16, PERIOD = 90;
const T_DEC = V / DEC, D_DEC = V * V / (2 * DEC), T_ACC = V / ACC, D_ACC = V * V / (2 * ACC);
const T_ARR = CRUISE + T_DEC, S0 = -(V * CRUISE + D_DEC);
// distance past the stop (negative: still to come) and speed at time t into the cycle
function run(t) {
  if (t < CRUISE) return [S0 + V * t, V];
  if (t < T_ARR) { const u = t - CRUISE; return [-D_DEC + V * u - DEC * u * u / 2, V - DEC * u]; }
  if (t < T_ARR + DWELL) return [0, 0];
  const u = t - T_ARR - DWELL;
  if (u < T_ACC) return [ACC * u * u / 2, ACC * u];
  return [D_ACC + V * (u - T_ACC), V];
}
const CAR = 28.6, GAP = 0.5, HALF = CAR + GAP / 2;   // two cars: the train is 2 * CAR + GAP long
const TW = 2.65, T_BOT = RAIL + 0.12, T_TOP = YP + 3.0;   // car width, bottom of the skirts, roof (the floor is level with the platforms)

// ---------- canvas textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const FONT = 'Helvetica, Arial, sans-serif';
// the 1 Line bullet: a green disc with a white "1"
function lineBullet(g, x, y, r) {
  g.fillStyle = '#28813f'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = `bold ${r * 1.4}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1', x, y + r * 0.06);
}
// station name panel (Sound Transit style: white type on dark blue, the line bullet at the left)
function nameTex() {
  return canvasTex(1024, 192, (g, w, h) => {
    g.fillStyle = '#0f2346'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a6fb5'; g.fillRect(0, h - 14, w, 14);
    lineBullet(g, 96, h / 2 - 6, 58);
    g.fillStyle = '#fff'; g.font = `bold 88px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('King Street Station', 186, h / 2 - 6);
  });
}
function wayTex(lines, arrow) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#121a26'; g.fillRect(0, 0, w, h);
    lineBullet(g, 110, h / 2, 70);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `bold 76px ${FONT}`; g.fillText(lines[0], 210, h / 2 - (lines[1] ? 38 : 0));
    if (lines[1]) { g.font = `52px ${FONT}`; g.fillStyle = '#c8d4e4'; g.fillText(lines[1], 210, h / 2 + 50); }
    if (arrow) { g.fillStyle = '#ffd23f'; g.font = `bold 150px ${FONT}`; g.textAlign = 'right'; g.fillText(arrow, w - 40, h / 2 + 8); }
  });
}
function plainTex(text, bg, fg, w = 512, h = 128, font = `bold 64px ${FONT}`) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
  });
}
// white subway tile with grey grout
function tileTex() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9aa0a4'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      const x = c * 64 + (r % 2) * 32, y = r * 32, v = 228 + ((r * 7 + c * 13) % 9);
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.fillRect(x + 2, y + 2, 60, 28); g.fillRect(x - 256 + 2, y + 2, 60, 28);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildStation(ctx) {
  const { put, flatBox, solid, physics, group, M } = ctx;
  // underground: the sky's image-based light mostly shut out (it read as blue sheen on every floor)
  const ENV = 0.25;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: ENV, ...o });
  const tile = std({ map: tileTex(), roughness: 0.35 });
  const concrete = M.concrete.clone(), dark = std({ color: 0x2a2d31, roughness: 0.9 });
  const steel = std({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 });
  const yellow = std({ color: 0xe8c020, roughness: 0.6 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xeaf2ff, emissiveIntensity: 3 });
  const marker = new THREE.MeshStandardMaterial({ color: 0x4a8cff, emissive: 0x4a8cff, emissiveIntensity: 4 });   // tunnel wall lights
  const unlit = new THREE.MeshBasicMaterial({ color: 0x0b0c0e });   // tunnel beyond the sun's shadow map: stays dark
  // box helpers: B(mat, w, h, d, x, y, z) has its base at y; tiles wrap every 1.2 m
  const B = (mat, w, h, d, x, y, z, opts = {}) => put(flatBox(w, h, d, mat === tile ? 0.8 : 2), mat, x, y + h / 2, z, 0, { grime: 0, ...opts });
  const wall = (mat, x0, z0, x1, z1, y0, y1, opts) => { B(mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, y0, (z0 + z1) / 2, opts); return solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, y0, 'concrete'); };
  const sign = (tex, w, h, x, y, z, ry, glow = 0.8) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.5 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.userData.noMinimap = true; group.add(m);
    return m;
  };
  const light = (x, y, z, i = 10, d = 16) => { const L = new THREE.PointLight(0xeef4ff, i, d, 1.4); L.position.set(x, y, z); L.userData.mapLight = true; group.add(L); };
  const strip = (x, y, z, len, along = 'z') => {
    // emissive only (bloom glows it): the map's glow sprites are drawn at their centre's depth, so one just
    // under a floor or the street shows through it at a glancing angle
    put(flatBox(along === 'z' ? 0.18 : len, 0.05, along === 'z' ? len : 0.18, 0), lamp, x, y, z, 0, { grime: 0, cast: false });
  };

  // ---------- the concourse: the hall model, its collision, the floor slab with the two stair wells ----------
  const holes = STAIRS.map(s => [s.x0, s.top, s.x1, s.bot]);
  const minus = (r, hs) => {   // rect minus rects, as rects (strips along z)
    let out = [r];
    for (const h of hs) out = out.flatMap(([a, b, c, d]) => (h[2] <= a || h[0] >= c || h[3] <= b || h[1] >= d) ? [[a, b, c, d]]
      : [[a, b, h[0], d], [h[2], b, c, d], [Math.max(a, h[0]), b, Math.min(c, h[2]), h[1]], [Math.max(a, h[0]), h[3], Math.min(c, h[2]), d]].filter(q => q[2] - q[0] > 0.01 && q[3] - q[1] > 0.01));
    return out;
  };
  // one slab for both: the concourse floor on top, the platform level's ceiling underneath
  for (const [a, b, c, d] of minus([PL.x0, HALL[1], PL.x1, PL.z1], holes)) {
    solid((a + c) / 2, (b + d) / 2, c - a, d - b, 0.3, CEIL_P, 'concrete');
    put(new THREE.PlaneGeometry(c - a, d - b), dark, (a + c) / 2, CEIL_P, (b + d) / 2, 0, { rx: Math.PI / 2, grime: 0, cast: false });
  }
  concrete.envMapIntensity = ENV;
  const model = PROPS.station;
  for (const [x0, z0, x1, z1, h] of CONCOURSE_BOXES) {
    const b = solid((x0 + x1) / 2 + DX, (z0 + z1) / 2 + DZ, x1 - x0, z1 - z0, h, YC, 'concrete');
    if (h < 1.3) b.pass = true;   // gates and railings: they stop you, not bullets
    if (!model && h > 1.3) B(tile, x1 - x0, h, z1 - z0, (x0 + x1) / 2 + DX, YC, (z0 + z1) / 2 + DZ);
  }
  if (model) {
    // its walls are one-sided (seen from the platforms, the stair enclosures were see-through): draw both sides
    for (const { mat } of model.parts) { mat.envMapIntensity = ENV; mat.roughness = Math.max(mat.roughness, 0.75); mat.metalness = 0; mat.side = THREE.DoubleSide; }
    const m = new THREE.Matrix4().makeTranslation(DX, DY, DZ);
    for (const { name, geo, mat } of model.parts) {
      if (name === 'BackSide_0') continue;    // its material is fully transparent: never meant to show
      if (name === 'FrontSide_3') {           // soft stains and contact shadows laid over the floor: blended, not cut out
        Object.assign(mat, { transparent: true, alphaTest: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      }
      const g = geo.clone(); g.applyMatrix4(m);
      put(g, mat, 0, 0, 0, 0, { grime: 0, cast: name !== 'FrontSide_3' });
    }
  } else {
    for (const [a, b, c, d] of minus(HALL, holes)) put(new THREE.PlaneGeometry(c - a, d - b), concrete, (a + c) / 2, YC + 0.01, (b + d) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0x9a968e });
    put(new THREE.PlaneGeometry(HALL[2] - HALL[0], HALL[1] - HALL[3]), dark, (HALL[0] + HALL[2]) / 2, -0.4, (HALL[1] + HALL[3]) / 2, 0, { rx: Math.PI / 2, grime: 0, cast: false });
  }
  // a ceiling over the whole hall just above the model's own (its entrance has none, and the street surface
  // is drawn from above only, so you'd see the sky through it)
  put(new THREE.PlaneGeometry(HALL[2] - HALL[0], HALL[3] - HALL[1]), dark, (HALL[0] + HALL[2]) / 2, -0.27, (HALL[1] + HALL[3]) / 2, 0, { rx: Math.PI / 2, grime: 0, cast: false });
  // the far stair (another line, not built): a shutter across it
  wall(dark, 1.6, -37.75, 6.6, -37.45, YC, -0.4);
  sign(plainTex('NO ENTRY · STAFF ONLY', '#8a1a1a', '#fff'), 2.6, 0.65, 4.1, YC + 2.4, -37.43, 0, 0.6);
  sign(nameTex(), 6, 1.12, 4.1, YC + 3.2, -37.42, 0, 0.9);
  // wayfinding over the two stairs down
  sign(wayTex(['Northgate', 'Northbound trains'], '↓'), 3.2, 0.8, STAIRS[0].cx, YC + 3.1, STAIRS[0].top - 0.4, Math.PI, 0.9);
  sign(wayTex(['Angle Lake', 'Southbound trains'], '↓'), 3.2, 0.8, STAIRS[1].cx, YC + 3.1, STAIRS[1].top - 0.4, Math.PI, 0.9);
  for (const z of [-28, -10]) light(4, YC + 2.3, z, 5, 20);   // mid-height and soft: up by the ceiling they blew out its white panels   // few real lights: each one costs every lit surface on the map

  // ---------- the passage from the plaza stairwells ----------
  {
    const [x0, z0, x1, z1] = PASSAGE, T = 0.3, H = -0.4;
    solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0.3, YC - 0.3, 'concrete');
    put(new THREE.PlaneGeometry(x1 - x0, z1 - z0), concrete, (x0 + x1) / 2, YC + 0.01, (z0 + z1) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0xc8c4bc });
    put(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std({ color: 0xd8dcdc, roughness: 0.8 }), (x0 + x1) / 2, H - 0.01, (z0 + z1) / 2, 0, { rx: Math.PI / 2, grime: 0, cast: false });
    wall(tile, x0, z1 - T, x1, z1, YC, H);                       // south wall
    wall(tile, 8, z0, x1, z0 + T, YC, H);                        // north wall east of the opening into the hall
    wall(tile, -6.2, z0, x0, z0 + T, YC, H);                     // and closing the hall's west corner
    for (const x of [x0, x1 - T]) { wall(tile, x, z0, x + T, 2.3, YC, H); wall(tile, x, 4.7, x + T, z1, YC, H); wall(tile, x, 2.3, x + T, 4.7, YC + 2.4, H); }
    strip((x0 + x1) / 2, H - 0.06, 1.6, x1 - x0 - 1, 'x'); strip((x0 + x1) / 2, H - 0.06, 5.0, x1 - x0 - 1, 'x');
    light(6.25, H - 1.2, 3.25, 5, 12);
    sign(nameTex(), 4.2, 0.79, 6.25, YC + 2.2, z1 - T - 0.02, Math.PI, 0.9);
    sign(wayTex(['To trains', 'Northgate · Angle Lake'], '↑'), 2.6, 0.65, 4.25, YC + 2.95, 0.32, 0, 0.9);   // read from the passage
    // fare readers (ORCA): a row of posts by the hall
    for (const x of [2.2, 3.4, 4.6, 5.8]) {
      B(dark, 0.18, 1.1, 0.12, x, YC, 0.9);
      put(flatBox(0.16, 0.2, 0.02, 0), std({ color: 0x1e7a3c, emissive: 0x1e7a3c, emissiveIntensity: 1.2 }), x, YC + 1.0, 0.97, 0, { grime: 0, cast: false });
      solid(x, 0.9, 0.2, 0.15, 1.1, YC, 'metal').pass = true;
    }
  }

  // ---------- the platform level ----------
  const plat = (x0, x1) => {
    solid((x0 + x1) / 2, (PL.z0 + PL.z1) / 2, x1 - x0, PL.z1 - PL.z0, YP - (PIT - 1), PIT - 1, 'concrete');
    put(new THREE.PlaneGeometry(x1 - x0, PL.z1 - PL.z0), concrete, (x0 + x1) / 2, YP + 0.005, (PL.z0 + PL.z1) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0xa8a49c });
    const edge = x0 < PIT_X[0] ? x1 : x0, s = x0 < PIT_X[0] ? -1 : 1;
    put(new THREE.PlaneGeometry(0.6, PL.z1 - PL.z0), yellow, edge + s * 0.35, YP + 0.012, (PL.z0 + PL.z1) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false });
    put(flatBox(0.02, YP - PIT, PL.z1 - PL.z0, 2), concrete, edge, PIT + (YP - PIT) / 2, (PL.z0 + PL.z1) / 2, 0, { grime: 0.3, tint: 0x8a8680 });
  };
  plat(PL.x0, PIT_X[0]); plat(PIT_X[1], PL.x1);
  // side walls, end walls round the tunnel mouths
  wall(tile, PL.x0 - 0.3, PL.z0, PL.x0, PL.z1, PIT, CEIL_P);
  wall(tile, PL.x1, PL.z0, PL.x1 + 0.3, PL.z1, PIT, CEIL_P);
  for (const [z0, z1] of [[PL.z0 - 0.3, PL.z0], [PL.z1, PL.z1 + 0.3]]) {
    wall(tile, PL.x0, z0, PIT_X[0], z1, PIT, CEIL_P); wall(tile, PIT_X[1], z0, PL.x1, z1, PIT, CEIL_P);
    wall(concrete, PIT_X[0], z0, PIT_X[1], z1, TUN_TOP, CEIL_P, { tint: 0x6a6660 });
  }
  // a blue band and the station name along both walls, facing the tracks
  for (const [x, ry] of [[PL.x0 + 0.01, Math.PI / 2], [PL.x1 - 0.01, -Math.PI / 2]]) {
    put(new THREE.PlaneGeometry(PL.z1 - PL.z0, 0.35), std({ color: 0x1d4f91, roughness: 0.5 }), x, YP + 2.6, (PL.z0 + PL.z1) / 2, ry, { grime: 0, cast: false });
    for (let z = PL.z0 + 6; z < PL.z1 - 3; z += 12) sign(nameTex(), 3.6, 0.68, x + Math.sign(ry) * 0.01, YP + 1.8, z, ry, 0.8);
  }
  // columns between the tracks, light strips over the platforms, a few real lights
  for (let z = PL.z0 + 4.5; z < PL.z1; z += 9) wall(tile, 3.75, z - 0.25, 4.25, z + 0.25, PIT, CEIL_P);
  for (const x of [-3.1, 11.1]) strip(x, CEIL_P - 0.05, (PL.z0 + PL.z1) / 2, PL.z1 - PL.z0 - 2);
  for (const z of [-20, 8]) light(4, CEIL_P - 1.5, z, 9, 26);
  // benches and bins on the platforms
  for (const [x, z] of [[-5.4, -28], [-5.4, 12], [13.4, -28], [13.4, 12]]) {
    B(M.wood, 0.5, 0.45, 1.8, x, YP, z, { tint: 0x8a6a4a });
    solid(x, z, 0.5, 1.8, 0.45, YP, 'wood').pass = true;
  }
  if (PROPS.bin) {
    const bb = PROPS.bin.box, k = 0.9 / (bb.max.y - bb.min.y);
    for (const [x, z] of [[-5.6, -20], [13.6, -20]]) {
      for (const pt of PROPS.bin.parts) put(pt.geo.clone(), pt.mat, x, YP - bb.min.y * k, z, 0, { sx: k, sy: k, sz: k, grime: 0 });
      solid(x, z, 0.5, 0.5, 0.9, YP, 'metal');
    }
  }
  // "next train" displays hanging over each platform (redrawn once a second in update)
  const boards = TRACKS.map((tr) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const x = tr.side < 0 ? -2.6 : 10.6;
    for (const z of [-24, 8]) {
      for (const s of [0, Math.PI]) sign(tex, 1.8, 0.45, x, YP + 3.2, z + (s ? -0.03 : 0.03), s, 1.0);
      put(new THREE.CylinderGeometry(0.02, 0.02, CEIL_P - YP - 3.45, 6), steel, x, (CEIL_P + YP + 3.45) / 2, z, 0, { grime: 0 });
    }
    return { c, tex, tr, last: '' };
  });

  // ---------- the stairs down from the concourse (collision steps; the model draws them) ----------
  for (const s of STAIRS) {
    const n = Math.round((YC - YP) / 0.333), rise = (YC - YP) / n, run = (s.bot - s.top) / n;
    for (let k = 1; k <= n; k++) {
      const top = YC - k * rise, za = s.top + (k - 1) * run;
      solid((s.x0 + s.x1) / 2, za + run / 2, s.x1 - s.x0, run, top - YP, YP, 'concrete');   // this tread, solid to the platform
      if (!model) put(flatBox(s.x1 - s.x0, 0.06, run, 0), concrete, (s.x0 + s.x1) / 2, top - 0.03, za + run / 2, 0, { grime: 0.3, tint: 0x9a948a });
    }
    // the mass under the stair, seen from the platform: tiled sides sloping down with the steps
    for (const x of [s.x0, s.x1]) {
      if (x <= PL.x0 + 0.01 || x >= PL.x1 - 0.01) continue;   // against the wall
      const g = new THREE.BufferGeometry(), L = s.bot - s.top, Hh = YC - YP;
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, L, 0, Hh, 0, 0, 0, 0, 0, Hh, 0, 0, 0, L], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, L / 1.2, 0, 0, Hh / 1.2, 0, 0, 0, Hh / 1.2, L / 1.2, 0], 2));
      g.computeVertexNormals();
      put(g, tile, x + (x === s.x0 ? -0.1 : 0.1), YP, s.top, 0, { grime: 0 });   // just outside the model's own stair walls (no flicker)
    }
    put(new THREE.PlaneGeometry(s.x1 - s.x0, YC - YP), tile, (s.x0 + s.x1) / 2, (YC + YP) / 2, s.top - 0.005, Math.PI, { grime: 0 });
  }

  // ---------- track bed, rails, tunnels ----------
  const far = 160;
  solid((PIT_X[0] + PIT_X[1]) / 2, 0, PIT_X[1] - PIT_X[0], 79, 1, PIT - 1, 'concrete');
  for (const [a, b, mat] of [[-40, 40, concrete], [-far, -40, unlit], [40, far, unlit]]) {
    put(new THREE.PlaneGeometry(PIT_X[1] - PIT_X[0], b - a), mat, (PIT_X[0] + PIT_X[1]) / 2, PIT + 0.005, (a + b) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0x5a5852 });
  }
  for (const tr of TRACKS) {
    for (const o of [-0.72, 0.72]) put(flatBox(0.08, RAIL - PIT, 2 * far, 0), steel, tr.x + o, PIT, 0, 0, { grime: 0, cast: false });
    for (let z = -60; z <= 60; z += 0.9) put(flatBox(2.4, 0.12, 0.22, 0), M.concrete, tr.x, PIT + 0.06, z, 0, { grime: 0.2, tint: 0x7a7670, cast: false });
    // the overhead wire
    put(flatBox(0.03, 0.03, 2 * far, 0), dark, tr.x, TUN_TOP - 0.4, 0, 0, { grime: 0, cast: false });
  }
  // tunnels past both ends: lit walls near the station, dark (unlit) beyond, little blue marker lights
  for (const [z0, z1] of [[-far, PL.z0 - 0.3], [PL.z1 + 0.3, far]]) {
    for (const [a, b] of [[z0, z1]].flatMap(([p, q]) => (p < -40 ? [[p, -40], [-40, q]] : [[p, 40], [40, q]]))) {
      if (b - a < 0.05) continue;
      const mat = Math.abs((a + b) / 2) > 40 ? unlit : concrete, zc = (a + b) / 2, L = b - a;
      for (const x of [PIT_X[0] - 0.15, PIT_X[1] + 0.15]) put(flatBox(0.3, TUN_TOP - PIT, L, 2), mat, x, (PIT + TUN_TOP) / 2, zc, 0, { grime: 0.4, tint: 0x6a6660 });
      put(flatBox(PIT_X[1] - PIT_X[0] + 0.6, 0.3, L, 2), mat, (PIT_X[0] + PIT_X[1]) / 2, TUN_TOP + 0.15, zc, 0, { grime: 0, tint: 0x5a5650 });
    }
    const c0 = Math.max(z0, -40.5), c1 = Math.min(z1, 40.5);   // nobody gets further than the end walls below
    for (const x of [PIT_X[0], PIT_X[1]]) solid(x + (x ? 0.15 : -0.15), (c0 + c1) / 2, 0.3, c1 - c0, TUN_TOP - PIT, PIT, 'concrete');
    for (let z = z0 + 5; z < z1; z += 10) for (const x of [PIT_X[0] + 0.03, PIT_X[1] - 0.03]) put(flatBox(0.04, 0.08, 0.08, 0), marker, x, PIT + 1.2, z, 0, { grime: 0, cast: false });
  }
  // the end of the line for anyone walking the tunnels (trains carry on through)
  for (const z of [-39.5, 39.5]) solid((PIT_X[0] + PIT_X[1]) / 2, z, PIT_X[1] - PIT_X[0], 0.4, TUN_TOP - PIT, PIT, 'concrete').pass = true;

  // ---------- the street: Link station signs at both stairwells ----------
  for (const [x, z, ry] of [[-6.6, 1.4, Math.PI], [19.3, 1.4, Math.PI]]) {
    put(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 10), dark, x, 1.7, z, 0, { grime: 0.1 });
    solid(x, z, 0.25, 0.25, 3.4, 0, 'metal');
    B(dark, 0.9, 1.3, 0.14, x, 2.6, z);
    for (const s of [0, Math.PI]) sign(canvasTex(256, 384, (g, w, h) => {
      g.fillStyle = '#0f2346'; g.fillRect(0, 0, w, h);
      lineBullet(g, w / 2, 90, 62);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold 50px ${FONT}`; g.fillText('Link', w / 2, 200);
      g.font = `30px ${FONT}`; g.fillText('light rail', w / 2, 238);
      g.font = `bold 32px ${FONT}`; g.fillText('King Street', w / 2, 300); g.fillText('Station', w / 2, 338);
    }), 0.84, 1.24, x, 3.25, z + (s ? -0.08 : 0.08), ry + s, 0.9);
  }

  // ---------- trains ----------
  const sounds = [];
  const trains = TRACKS.map(tr => makeTrain(tr, std));
  for (const t of trains) {
    group.add(t.group);
    // a collision box per car, moved along with the train (parked far away while it's out of sight)
    t.cars = [0, 1].map(() => physics.addBox(new Box(t.tr.x - TW / 2, T_BOT, 9000, t.tr.x + TW / 2, T_TOP, 9000 + CAR)));
    for (const c of t.cars) c.surface = 'metal';
  }
  const state = trains.map(() => ({ s: -1e9, v: 0, phase: -1 }));

  function update(dt, clock) {
    trains.forEach((t, i) => {
      const tr = t.tr, cyc = ((clock + tr.offset) % PERIOD + PERIOD) % PERIOD;
      const [s, v] = run(cyc), st = state[i];
      const zc = STOP_Z + tr.dir * s;
      const shown = Math.abs(zc) < 110;
      t.group.visible = shown;
      t.group.position.set(tr.x, 0, zc);
      t.cars.forEach((b, k) => {
        const c = shown ? zc + tr.dir * (k ? -1 : 1) * (CAR / 2 + GAP / 2) : 9000;   // car 0 leads
        b.minz = c - CAR / 2; b.maxz = c + CAR / 2;
      });
      // doors: open through most of the dwell
      const dwellT = cyc - T_ARR, open = dwellT > 1.5 && dwellT < DWELL - 2;
      if (open !== t.open) { t.open = open; t.setDoors(open); sounds.push(['trainchime', new THREE.Vector3(tr.x, YP + 1.5, zc)]); }
      // horn before it runs in, a bell as it reaches the platform and as it pulls out, rumble while it moves
      const pos = new THREE.Vector3(tr.x, YP + 1.5, zc + tr.dir * HALF);   // the cab
      const ph = s < -70 ? 0 : s < -35 ? 1 : s < 0 ? 2 : v === 0 ? 3 : 4;
      if (ph !== st.phase) {
        if (ph === 1) sounds.push(['trainhorn', pos]);
        if (ph === 2 || (ph === 4 && st.phase === 3)) sounds.push(['trainbell', pos]);
        st.phase = ph;
      }
      if (shown && v > 1) { st.rumble = (st.rumble || 0) - dt; if (st.rumble <= 0) { st.rumble = 0.45; sounds.push(['trainrumble', new THREE.Vector3(tr.x, YP + 1, zc), { speed: v }]); } }
      st.s = s; st.v = v; st.zc = zc;
    });
    // the arrival boards
    boards.forEach((bd) => {
      const tr = bd.tr, cyc = ((clock + tr.offset) % PERIOD + PERIOD) % PERIOD;
      const until = cyc < T_ARR ? T_ARR - cyc : PERIOD - cyc + T_ARR;
      const txt = cyc >= T_ARR && cyc < T_ARR + DWELL ? 'BOARDING' : until < 25 ? 'ARRIVING' : `${Math.ceil(until / 60)} min`;
      if (txt === bd.last) return;
      bd.last = txt;
      const g = bd.c.getContext('2d');
      g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 128);
      lineBullet(g, 52, 64, 34);
      g.fillStyle = '#ffb21e'; g.font = `bold 46px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(tr.dest, 100, 64);
      g.textAlign = 'right'; g.fillText(txt, 496, 64);
      bd.tex.needsUpdate = true;
    });
  }
  // a moving train on top of you: anywhere on its track, from the bed to its roof (the car's collision box
  // shoves anyone it runs into up onto the roof, and there's no riding it through the tunnel either)
  function trainHit(p) {
    for (let i = 0; i < trains.length; i++) {
      const st = state[i], tr = trains[i].tr;
      if (st.v < 0.3 || st.zc === undefined) continue;
      if (Math.abs(p.x - tr.x) > TW / 2 + 0.3 || p.y > T_TOP + 1.5 || p.y < PIT - 1) continue;
      if (Math.abs(p.z - st.zc) < HALF + 0.3) return true;
    }
    return false;
  }
  return { update, trainHit, sounds };
}

// ---------- a two-car Link train (Siemens S70, Sound Transit livery) ----------
function makeTrain(tr, std) {
  const group = new THREE.Group();
  const mats = {
    body: std({ color: 0xf2f3f0, roughness: 0.3, metalness: 0.15 }),
    glass: std({ color: 0x14181d, roughness: 0.08, metalness: 0.5 }),
    blue: std({ color: 0x1d4f91, roughness: 0.4 }),
    teal: std({ color: 0x00a3ad, roughness: 0.4 }),
    grey: std({ color: 0x5a5e62, roughness: 0.6, metalness: 0.4 }),
    black: std({ color: 0x15161a, roughness: 0.8 }),
    door: std({ color: 0xdfe2e0, roughness: 0.35, metalness: 0.2 }),
    inside: std({ color: 0x2a3038, roughness: 0.9 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 6 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 4 }),
  };
  const dest = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb21e'; g.font = `bold 40px ${FONT}`; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText('1', 14, h / 2); g.textAlign = 'center'; g.fillText(tr.dest, w / 2 + 20, h / 2);
  });
  mats.dest = new THREE.MeshStandardMaterial({ map: dest, emissiveMap: dest, emissive: 0xffffff, emissiveIntensity: 1.6 });
  const logo = canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1d4f91'; g.font = `bold 84px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('Link', 10, h / 2);
    g.fillStyle = '#00a3ad'; g.font = `bold 30px ${FONT}`; g.fillText('SOUND TRANSIT', 210, h / 2 + 4);
  });
  mats.logo = new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.4 });
  const parts = new Map();
  const add = (mat, geo, x, y, z, ry = 0) => { geo.rotateY(ry); geo.translate(x, y, z); if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo); };
  const box = (mat, w, h, d, x, y, z) => add(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z);
  const doorsShut = [], doorsOpen = [];
  const H = T_TOP - T_BOT;
  // both cars: car 0 leads (toward +z in the group; the group turns to face the way it runs)
  for (const k of [0, 1]) {
    const cz = (k ? -1 : 1) * (CAR / 2 + GAP / 2);
    add(mats.body, new RoundedBoxGeometry(TW, H - 0.25, CAR, 3, 0.22), 0, T_BOT + 0.25 + (H - 0.25) / 2, cz);
    box(mats.blue, TW + 0.02, 0.32, CAR - 0.6, 0, T_BOT + 0.25, cz);
    box(mats.teal, TW + 0.02, 0.07, CAR - 0.6, 0, T_BOT + 0.62, cz);
    box(mats.black, TW - 0.3, 0.3, CAR - 1, 0, T_BOT - 0.05, cz);                 // underframe
    for (const bz of [-CAR / 2 + 3, 0, CAR / 2 - 3]) box(mats.grey, 2.0, 0.5, 2.4, 0, RAIL - 0.12, cz + bz);   // bogies
    box(mats.grey, 1.6, 0.35, CAR * 0.5, 0, T_TOP, cz);                          // roof equipment
    // windows and doors along both sides
    const doorAt = [-10.2, -3.4, 3.4, 10.2];
    for (const sx of [-1, 1]) {
      const x = sx * (TW / 2 + 0.006);
      let prev = -CAR / 2 + 1.2;
      for (const d of [...doorAt, CAR / 2 - 1.2 + 0.7]) {
        const a = prev, b = d - 0.7;
        if (b - a > 0.3) add(mats.glass, new THREE.PlaneGeometry(b - a, 1.05), x, YP + 1.55, cz + (a + b) / 2, sx * Math.PI / 2);
        prev = d + 0.7;
      }
      for (const d of doorAt) {
        const geoS = [new THREE.PlaneGeometry(1.36, 2.0), new THREE.PlaneGeometry(0.5, 1.0)], z = cz + d;
        geoS[0].rotateY(sx * Math.PI / 2); geoS[0].translate(x + sx * 0.002, YP + 1.0, z);
        geoS[1].rotateY(sx * Math.PI / 2); geoS[1].translate(x + sx * 0.004, YP + 1.45, z);
        const open = new THREE.PlaneGeometry(1.3, 1.95); open.rotateY(sx * Math.PI / 2); open.translate(x + sx * 0.003, YP + 0.98, z);
        if (sx === tr.side) { doorsShut.push([mats.door, geoS[0]], [mats.glass, geoS[1]]); doorsOpen.push([mats.inside, open]); }
        else { add(mats.door, geoS[0], 0, 0, 0); add(mats.glass, geoS[1], 0, 0, 0); }
      }
      add(mats.logo, new THREE.PlaneGeometry(2.6, 0.65), x + sx * 0.004, YP + 0.45, cz + (k ? 6.8 : -6.8), sx * Math.PI / 2);
    }
    // the cab at the outer end of each car: wrap-around windscreen, lights, destination sign
    const end = k ? -1 : 1, ez = cz + end * (CAR / 2 + 0.005);
    add(mats.glass, new THREE.PlaneGeometry(TW - 0.4, 1.3), 0, YP + 1.6, ez, end > 0 ? 0 : Math.PI);
    add(mats.dest, new THREE.PlaneGeometry(1.5, 0.22), 0, YP + 2.45, ez + end * 0.003, end > 0 ? 0 : Math.PI);
    for (const sx of [-0.85, 0.85]) {
      add(k ? mats.tail : mats.head, new THREE.BoxGeometry(0.28, 0.13, 0.04), sx, YP + 0.35, ez);
      add(k ? mats.head : mats.tail, new THREE.BoxGeometry(0.12, 0.08, 0.03), sx * 1.05, YP + 0.12, ez);
    }
  }
  // the articulation between the cars
  box(mats.black, TW - 0.4, H - 0.5, GAP + 0.2, 0, T_BOT + 0.3, 0);
  // the pantograph on the lead car
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.05, 1.25, 0.05); g.rotateX(s * 0.55); add(mats.grey, g, 0, T_TOP + 0.85, CAR / 2 + 0.2 + s * 0.3); }
  box(mats.grey, 1.5, 0.05, 0.12, 0, T_TOP + 1.4, CAR / 2 + 0.2);
  const merged = (list) => {
    const out = new Map();
    for (const [mat, g] of list) { if (!out.has(mat)) out.set(mat, []); out.get(mat).push(g); }
    return out;
  };
  const meshes = (map, parent) => {
    for (const [mat, list] of map) {
      const g = mergeAll(list);
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.userData.noMinimap = true; parent.add(m);
    }
  };
  meshes(parts, group);
  const shut = new THREE.Group(), opened = new THREE.Group();
  meshes(merged(doorsShut), shut); meshes(merged(doorsOpen), opened);
  opened.visible = false;
  group.add(shut, opened);
  // headlight on the road ahead (dynamic lights are off on the lower quality settings)
  const L = new THREE.PointLight(0xfff2dc, 14, 30, 1.5); L.position.set(0, YP + 0.6, CAR + GAP / 2 + 2); L.userData.mapLight = true; group.add(L);
  group.rotation.y = tr.dir > 0 ? 0 : Math.PI;
  group.visible = false;
  return { group, tr, open: false, setDoors: (o) => { shut.visible = !o; opened.visible = o; } };
}

// merge plain BufferGeometries (position, normal, uv) into one
function mergeAll(list) {
  const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
  let o = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
