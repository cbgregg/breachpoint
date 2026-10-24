// Link Loop: three Link light rail stations, each a closed-off arena (a street plaza, the ticket hall under it and
// the platforms under that), joined by nothing but the trains. Two lines run the loop in opposite directions (the
// west track one way, the east track the other), so every station is one ride from both others. A train dwells
// 15 s with its doors open, then runs 23 s through the dark tunnel to the next station: whoever got on with you,
// friend or enemy, is in that car until it stops.
//
// Map design: each station is three stacked arenas with three lanes on the plaza (a building on each flank, the
// open middle over the hall), two stairwells down and two stairs to the platforms; spawns sit on the plazas,
// away from the stairs. The middle station (Symphony) is neutral: both teams spawn there as well as at home
// (Pioneer Square for one team, Chinatown for the other), so there's always a fight within one ride.
//
// How the ride works: the cars really move through the station and into the tunnel (their collision moves with
// them and carries everyone inside); 100 m down the tunnel, out of sight in the dark, the car and its passengers
// are moved to the same point in the next station's tunnel and run on in. The timetable runs off the match
// clock every machine shares, so trains are in the same place for everyone online.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Box } from './physics.js';
import { buildStation, STATION_LIDS, STATION_LEVELS, YC, YP, PIT, RAIL, PL, STOP_Z, TRACKS, FONT, lineBullet, canvasTex } from './station.js';

// ---------- the stations and the loop ----------
const STATIONS = [
  { name: 'Pioneer Square', short: 'PIONEER SQUARE', ox: -95, theme: 'brick' },
  { name: 'Symphony', short: 'SYMPHONY', ox: 0, theme: 'civic' },
  { name: 'Chinatown International District', short: 'CHINATOWN-ID', ox: 95, theme: 'chinatown' },
];
const HX = 140, HZ = 50;
// direction 0 (west track, running toward -z) visits 0 -> 1 -> 2; direction 1 (east track, toward +z) 0 -> 2 -> 1
const NEXT = [[1, 2, 0], [2, 0, 1]];
const DIRZ = [TRACKS[0].dir, TRACKS[1].dir];          // -1, +1
const TX = [TRACKS[0].x, TRACKS[1].x];                // track centre lines (station-local x)
const DOOR_SIDE = [TRACKS[0].side, TRACKS[1].side];   // the platform each line's doors open onto
// timetable: dwell, then accelerate to 16 m/s, run, and brake into the next station: 200 m between stops, the
// hand-over to the next station's tunnel happening at the halfway point
const DWELL = 15, ACC = 1.5, VMAX = 16, HALF = 100;
const T_ACC = VMAX / ACC, D_ACC = VMAX * VMAX / (2 * ACC), T_CRU = (HALF - D_ACC) / VMAX;
const RUN = 2 * (T_ACC + T_CRU), LEG = DWELL + RUN;
const LINE_OFFSET = [0, LEG / 2];                     // the two lines alternate (a train every ~19 s at each station)
function runAt(u) {   // distance travelled and speed, u seconds after pulling out
  if (u <= 0) return [0, 0];
  if (u < T_ACC) return [ACC * u * u / 2, ACC * u];
  if (u < T_ACC + 2 * T_CRU) return [D_ACC + VMAX * (u - T_ACC), VMAX];
  const r = Math.max(0, RUN - u);
  return [2 * HALF - ACC * r * r / 2, ACC * r];
}

// ---------- the car (one Siemens S70, 28.6 m) ----------
const CAR = 28.6, L2 = CAR / 2, TW = 2.65, H = TW / 2, WT = 0.12;
const T_BOT = RAIL + 0.12, T_TOP = YP + 3.0, WIN0 = YP + 0.95, WIN1 = YP + 2.05;
const DOORS = [-10.2, -3.4, 3.4, 10.2], DW = 0.65;    // door centres along the car and half the opening
// collision, in car space (x across from the track centre, absolute y, z along from the car's middle):
// [x0, y0, z0, x1, y1, z1, flags]; flags: pass (stops people, not bullets), door (side)
function carBoxes() {
  const out = [];
  out.push([-H, T_BOT, -L2, H, YP, L2]);                                  // floor (level with the platforms)
  out.push([-H, T_TOP - 0.05, -L2, H, T_TOP + 0.3, L2]);                  // roof
  out.push([-H, YP, -L2, H, T_TOP, -L2 + 0.3], [-H, YP, L2 - 0.3, H, T_TOP, L2]);   // the cab ends
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? H - WT : -H, x1 = sx > 0 ? H : -H + WT;
    const edges = [-L2 + 0.3, ...DOORS.flatMap(d => [d - DW, d + DW]), L2 - 0.3];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      out.push([x0, YP, a, x1, WIN0, b]);                                  // panel under the windows
      out.push([x0, WIN0, a, x1, WIN1, b, { pass: true }]);                // the windows: bullets go through
    }
    out.push([x0, WIN1, -L2, x1, T_TOP, L2]);                              // over the windows and doors
    for (const d of DOORS) out.push([x0, YP, d - DW, x1, WIN1, d + DW, { door: sx }]);
    // bench seats along the walls between the doors (low: you shoot over them, they stop your feet)
    const si = sx > 0 ? H - WT - 0.48 : -H + WT;
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i] + 0.4, b = edges[i + 1] - 0.4;
      if (b - a > 1) out.push([si, YP, a, si + 0.48, YP + 0.46, b, { pass: true }]);
    }
  }
  return out;
}

function makeCar(dirIdx) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, envMapIntensity: 0.4, ...o });
  const mats = {
    body: std({ color: 0xeef0ec, roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide }),
    blue: std({ color: 0x1d4f91, roughness: 0.4 }), teal: std({ color: 0x00a3ad, roughness: 0.4 }),
    grey: std({ color: 0x5a5e62, roughness: 0.6, metalness: 0.4 }), black: std({ color: 0x15161a, roughness: 0.8 }),
    floor: std({ color: 0x3a4250, roughness: 0.9 }), seat: std({ color: 0x23508a, roughness: 0.85 }),
    pole: std({ color: 0xd8c020, roughness: 0.35, metalness: 0.5 }), wall: std({ color: 0xd8dcd8, roughness: 0.6, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8aa4b4, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 6 }),
    door: std({ color: 0xdfe2e0, roughness: 0.35, metalness: 0.2 }),
  };
  const dest = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb21e'; g.font = `bold 36px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(dirIdx ? 'LOOP · EAST TRACK' : 'LOOP · WEST TRACK', w / 2, h / 2);
  });
  mats.dest = new THREE.MeshStandardMaterial({ map: dest, emissiveMap: dest, emissive: 0xffffff, emissiveIntensity: 1.6 });
  const logo = canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1d4f91'; g.font = `bold 84px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('Link', 10, h / 2);
    g.fillStyle = '#00a3ad'; g.font = `bold 30px ${FONT}`; g.fillText('SOUND TRANSIT', 210, h / 2 + 4);
  });
  mats.logo = new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.4 });
  const parts = new Map();
  const add = (mat, geo) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo); };
  const box = (mat, x0, y0, z0, x1, y1, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); add(mat, g); };
  const plane = (mat, w, h, x, y, z, ry = 0, rx = 0) => { const g = new THREE.PlaneGeometry(w, h); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); add(mat, g); };
  // shell: drawn from both sides (you see it from the platform and from your seat)
  box(mats.body, -H, T_BOT, -L2, -H + 0.04, YP + 0.02, L2); box(mats.body, H - 0.04, T_BOT, -L2, H, YP + 0.02, L2);   // skirts
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? H - 0.06 : -H, x1 = sx > 0 ? H : -H + 0.06;
    const edges = [-L2, ...DOORS.flatMap(d => [d - DW, d + DW]), L2];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      box(mats.body, x0, YP, a, x1, WIN0, b);                                         // under the windows
      box(mats.body, x0, WIN0, a, x1, WIN1, a + 0.35); box(mats.body, x0, WIN0, b - 0.35, x1, WIN1, b);   // pillars
      plane(mats.glass, b - a - 0.7, WIN1 - WIN0, sx * (H - 0.03), (WIN0 + WIN1) / 2, (a + b) / 2, sx * Math.PI / 2);
    }
    box(mats.body, x0, WIN1, -L2, x1, T_TOP, L2);
    // livery: the blue skirt band and a teal stripe outside, the Link logo by each end
    box(mats.blue, sx > 0 ? H : -H - 0.01, YP - 0.45, -L2 + 0.4, sx > 0 ? H + 0.01 : -H, YP + 0.12, L2 - 0.4);
    box(mats.teal, sx > 0 ? H : -H - 0.01, YP + 0.2, -L2 + 0.4, sx > 0 ? H + 0.01 : -H, YP + 0.27, L2 - 0.4);
    for (const lz of [-7, 7]) plane(mats.logo, 2.6, 0.65, sx * (H + 0.015), YP + 0.55, lz, sx * Math.PI / 2);
    // seats: a blue bench along the wall between each pair of doors
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i] + 0.4, b = edges[i + 1] - 0.4;
      if (b - a < 1) continue;
      const s0 = sx > 0 ? H - WT - 0.48 : -H + WT, s1 = s0 + 0.48;
      box(mats.seat, s0, YP + 0.3, a, s1, YP + 0.46, b);
      box(mats.seat, sx > 0 ? s1 - 0.08 : s0, YP + 0.46, a, sx > 0 ? s1 : s0 + 0.08, YP + 1.0, b);   // backrest
      box(mats.grey, s0 + 0.05, YP, a + 0.1, s1 - 0.05, YP + 0.3, b - 0.1);
    }
  }
  box(mats.body, -H, T_TOP, -L2, H, T_TOP + 0.08, L2);                                // roof skin
  box(mats.grey, -0.8, T_TOP + 0.08, -L2 * 0.5, 0.8, T_TOP + 0.35, L2 * 0.5);         // roof equipment
  box(mats.floor, -H + 0.05, YP - 0.02, -L2 + 0.3, H - 0.05, YP + 0.005, L2 - 0.3);   // floor
  plane(mats.wall, TW - 0.1, L2 * 2 - 0.6, 0, T_TOP - 0.06, 0, 0, Math.PI / 2);       // ceiling
  for (const lz of [-9, -3, 3, 9]) box(mats.lamp, -0.25, T_TOP - 0.1, lz - 2.2, 0.25, T_TOP - 0.06, lz + 2.2);   // light panels
  // grab poles by every door and down the middle
  for (const d of DOORS) for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.02, 0.02, T_TOP - YP, 6); g.translate(sx * 0.55, (YP + T_TOP) / 2, d + 0.95); add(mats.pole, g);
  }
  // the cabs: wraparound windscreens, destination signs, headlights
  for (const end of [-1, 1]) {
    const ez = end * L2;
    box(mats.body, -H, YP, ez - (end > 0 ? 0.3 : 0), H, WIN0, ez + (end > 0 ? 0 : 0.3));
    box(mats.body, -H, WIN1, ez - (end > 0 ? 0.3 : 0), H, T_TOP, ez + (end > 0 ? 0 : 0.3));
    box(mats.black, -H, WIN0, ez - (end > 0 ? 0.3 : 0), -H + 0.3, WIN1, ez + (end > 0 ? 0 : 0.3));
    box(mats.black, H - 0.3, WIN0, ez - (end > 0 ? 0.3 : 0), H, WIN1, ez + (end > 0 ? 0 : 0.3));
    plane(mats.glass, TW - 0.6, WIN1 - WIN0, 0, (WIN0 + WIN1) / 2, ez + end * 0.01, end > 0 ? 0 : Math.PI);
    plane(mats.dest, 1.6, 0.22, 0, T_TOP - 0.35, ez + end * 0.02, end > 0 ? 0 : Math.PI);
    for (const hx of [-0.85, 0.85]) box(mats.head, hx - 0.14, YP + 0.3, ez + end * 0.01, hx + 0.14, YP + 0.43, ez + end * 0.04);
  }
  const group = new THREE.Group();
  for (const [mat, list] of parts) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = mat !== mats.glass && mat !== mats.lamp; m.receiveShadow = true; m.userData.noMinimap = true;
    if (mat === mats.glass) m.renderOrder = 2;
    group.add(m);
  }
  // sliding doors: two leaves per opening, on both sides; the platform side slides open at stations
  const doors = { [-1]: [], [1]: [] };
  for (const sx of [-1, 1]) for (const d of DOORS) for (const leaf of [-1, 1]) {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, WIN1 - YP - 0.06, DW), mats.door);
    panel.position.set(0, (YP + WIN1) / 2, 0); panel.castShadow = true; g.add(panel);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(DW - 0.2, 0.9), mats.glass); win.rotation.y = Math.PI / 2; win.position.set(sx * 0.025, WIN0 + 0.45, 0); g.add(win);
    g.position.set(sx * (H - 0.03), 0, d + leaf * DW / 2);
    g.userData = { d, leaf };
    doors[sx].push(g); group.add(g);
  }
  // its own light inside (a marker: the map's light pool lights whoever is riding)
  const light = new THREE.PointLight(0xeef4ff, 7, 14, 1.4); light.position.set(0, T_TOP - 0.4, 0); light.userData.mapLight = true; group.add(light);
  return { group, doors };
}

// ---------- plaza layouts (station-local: the station's hall is under x -6..14, z -37..0; its two stairwells
// open at z 3.5, x -6..0.5 and 12..18.5) ----------
const PLAZA = { x0: -28, x1: 36, z0: -44, z1: 22 };
const SPAWN_W = [[-24, 17], [-21, 17], [-24, 13.5], [-21, 13.5], [-24, 10], [-21, 10], [-18, 17], [-18, 13.5]];
const SPAWN_E = [[32, 17], [29, 17], [32, 13.5], [29, 13.5], [32, 10], [29, 10], [26, 17], [26, 13.5]];
function enclosure(tints, stone) {
  // tall blocks all round the plaza: no way out, nothing beyond to see
  const t = (i) => tints[i % tints.length];
  const out = [];
  // (the rows run corner to corner and the sides meet them: a gap at a corner left a pocket of bare ground)
  const ROW = [[-25, 20], [-6, 18], [12, 18], [32, 22]];
  ROW.forEach(([x, w], i) => out.push([x, -47.5, w, 7, 22 + (i % 2) * 6, 0, 'brick', { tint: t(i), stone: stone && i % 2 }]));
  ROW.forEach(([x, w], i) => out.push([x, 25.5, w, 7, 20 + ((i + 1) % 2) * 6, 0, 'brick', { tint: t(i + 1), stone: stone && !(i % 2) }]));
  [[-34, -27, 7, 34], [-34, 6, 7, 32]].forEach(([x, z, w, d], i) => out.push([x + 2.5, z, w, d, 24 + i * 4, 0, 'brick', { tint: t(i + 2) }]));
  [[42, -27, 7, 34], [42, 6, 7, 32]].forEach(([x, z, w, d], i) => out.push([x - 2.5, z, w, d, 26 - i * 4, 0, 'brick', { tint: t(i + 3) }]));
  out.push([4, PLAZA.z0 - 7.5, 80, 1, 30, 0, 'boundary'], [4, PLAZA.z1 + 7.5, 80, 1, 30, 0, 'boundary'], [PLAZA.x0 - 7.5, -11, 1, 80, 30, 0, 'boundary'], [PLAZA.x1 + 7.5, -11, 1, 80, 30, 0, 'boundary']);
  return out;
}
const COMMON = [
  [-2.75, 3.5, 6.5, 2.4, -YC, 0, 'stairdown', { dir: 1 }],
  [15.25, 3.5, 6.5, 2.4, -YC, 0, 'stairdown', { dir: -1 }],
  [-14, -2, 0, 0, 0, 0, 'vlamp'], [22, -2, 0, 0, 0, 0, 'vlamp'], [-14, -32, 0, 0, 0, 0, 'vlamp'], [22, -32, 0, 0, 0, 0, 'vlamp'],
];
const THEMES = {
  // Pioneer Square: brick, a café and a bookshop on the flanks, a totem pole, a food truck
  brick: [
    ...enclosure([0xe9c6a8, 0xd8a890, 0xf2d9c0, 0xffffff], true),
    [-4, -16.5, 22, 28, 0, 0, 'paving'],
    [-19, -22, 14, 16, 14, 0, 'brick', { tint: 0xe9c6a8, shop: { e: [['d', -4], ['w', 1], ['d', 5]], s: [['d', 0]], n: [['w', 0]], props: [['table', -3, -3], ['table', 3, 3], ['bar', -3.5, 5, 0], ['crates', 4, -5]], light: 1 } }],
    [28, -8, 12, 16, 12, 0, 'brick', { stone: true, shop: { w: [['d', -5], ['w', 0], ['d', 5]], n: [['d', 0]], props: [['shelf', -2, -4, 0], ['shelf', 2, 0, 0], ['shelf', -2, 4, 0], ['crates', 3, -6]], light: 1 } }],
    [4, -24, 1.0, 1.0, 13, 0, 'totem'], [4, -24, 3.2, 3.2, 0.9, 0, 'railing', { open: 's' }],
    [-6, -30, 0, 0, 9, 0, 'tree'], [14, -30, 0, 0, 9.5, 0, 'tree'], [-8, -8, 0, 0, 9, 0, 'tree'], [16, -10, 0, 0, 9, 0, 'tree'],
    [27, -32, 6.5, 2.4, 3.1, 0, 'truck', { food: 1 }], [-20, -38, 2.6, 1.8, 2.8, 0, 'kiosk'],
    [4, -12, 2.4, 0.9, 0.9, 0, 'stall', 0], [-2, -18, 1.6, 1.6, 1.6, 0, 'crate'], [11, -36, 1.6, 1.6, 1.6, 0, 'crate'],
    [-10, -26, 1.8, 0.6, 0.95, 0, 'bench'], [18, -22, 1.8, 0.6, 0.95, 0, 'bench'],
    [-6, 12, 1.3, 1.3, 0.75, 0, 'planter'], [16, 13, 1.3, 1.3, 0.75, 0, 'planter'], [5, 9, 4.4, 2.0, 1.45, 0, 'car', 0],
    [-16, 2, 2.4, 1.0, 0.95, 0, 'tent', 0], [24, 3, 2.4, 1.0, 0.95, 0, 'tent', 1],
    [-24, -6, 1.9, 1.35, 1.25, 0, 'dumpster', {}], [33, -36, 1.35, 1.9, 1.25, 0, 'dumpster', { dark: true }],
    [6, -5, 2.6, 2.7, 2.8, 0, 'kiosk'], [-10, -12, 1.6, 1.6, 1.6, 0, 'crate'],
  ],
  // Symphony: Benaroya Hall's lobby on the north side, a garden of planters and trees, a bus at the curb
  civic: [
    ...enclosure([0xd8d4cc, 0xc8c4bc, 0xe0dcd4], true),
    [4, -38, 30, 10, 16, 0, 'brick', { stone: true, tint: 0xe2ded6, shop: { s: [['d', -9], ['w', -3], ['w', 3], ['d', 9]], props: [['table', -8, 0], ['table', 8, 0], ['bar', 0, -2, 0], ['shelf', -12, -2, 1], ['shelf', 12, -2, 1]], light: 1 } }],
    [-20, -14, 12, 12, 12, 0, 'brick', { tint: 0xc8c4bc, stone: true, shop: { e: [['d', -3], ['d', 3]], s: [['w', 0]], props: [['shelf', -2, 0, 0], ['table', 2, 2], ['crates', -3, -4]], light: 1 } }],
    [-4, -20, 6, 6, 0.75, 0, 'planter'], [12, -20, 6, 6, 0.75, 0, 'planter'], [4, -12, 3, 3, 0.75, 0, 'planter'],
    [-4, -20, 0, 0, 8, 0, 'tree'], [12, -20, 0, 0, 8.5, 0, 'tree'], [26, -24, 0, 0, 9, 0, 'tree'], [-12, -2, 0, 0, 9, 0, 'tree'],
    [4, -28, 1.8, 0.6, 0.95, 0, 'bench'], [4, -4, 1.8, 0.6, 0.95, 0, 'bench'], [22, -14, 1.8, 0.6, 0.95, 0, 'bench'],
    [27, -6, 12, 2.6, 3.2, 0, 'bus', { livery: 0 }], [34, 1, 2.4, 7, 3.3, 0, 'truck', {}],
    [-14, -30, 2.2, 1.6, 2.6, 0, 'infokiosk'], [25, -36, 2.6, 2.7, 2.8, 0, 'kiosk'],
    [-20, 4, 3.2, 0.9, 1.1, 0, 'jersey'], [4, 12, 3.2, 0.9, 1.1, 0, 'jersey'], [-8, 14, 0.9, 3.2, 1.1, 0, 'jersey'],
    [18, -34, 1.6, 1.6, 1.6, 0, 'crate'], [-2, 9, 2, 2, 1.2, 0, 'pallet'],
    // the middle of the plaza: a newsstand over the entrance passage, barriers and food tents (no clear line from
    // the spawns to the stairwells)
    [6, -5, 2.6, 2.7, 2.8, 0, 'kiosk'], [-10, -12, 3.2, 0.9, 1.1, 0, 'jersey'], [14, 4, 1.6, 1.6, 1.6, 0, 'crate'],
    [-10, -28, 2.4, 1.0, 0.95, 0, 'tent', 2], [20, -28, 2.4, 1.0, 0.95, 0, 'tent', 1],
  ],
  // Chinatown: the gate, red and green shopfronts, a street market of stalls and stacked crates
  chinatown: [
    ...enclosure([0xc04a40, 0xd8a890, 0x8a3d2c, 0xe9c6a8]),
    [4, -16, 20, 30, 0, 0, 'paving', 'brick'],
    [-19, -20, 14, 16, 10, 0, 'brick', { tint: 0xb84a40, shop: { e: [['d', -5], ['w', 0], ['d', 5]], n: [['d', 0]], props: [['shelf', -3, -4, 0], ['shelf', -3, 2, 0], ['table', 3, 0], ['crates', 4, 5]], light: 1 } }],
    [28, -24, 12, 14, 12, 0, 'brick', { tint: 0x5a7a5a, shop: { w: [['d', -4], ['d', 4]], s: [['w', 0]], props: [['table', -2, -3], ['table', 2, 3], ['bar', 3, -4, 1]], light: 1 } }],
    [-6, -10, 2.4, 1.0, 0.95, 0, 'tent', 0], [0, -10, 2.4, 1.0, 0.95, 0, 'tent', 1], [8, -10, 2.4, 1.0, 0.95, 0, 'tent', 2], [14, -10, 2.4, 1.0, 0.95, 0, 'tent', 0],
    [-6, -24, 2.4, 0.9, 0.9, 0, 'stall', 0], [4, -26, 2.4, 0.9, 0.9, 0, 'stall', 0], [14, -24, 2.4, 0.9, 0.9, 0, 'stall', 0],
    [-1, -17, 1.6, 1.6, 1.6, 0, 'crate'], [9, -18, 2, 2, 1.2, 0, 'pallet'], [20, -2, 1.6, 1.6, 1.6, 0, 'crate'], [-12, 6, 2, 2, 1.2, 0, 'pallet'],
    [27, -6, 6.5, 2.4, 3.1, 0, 'truck', { back: 1 }], [-20, -36, 2.6, 2.7, 2.8, 0, 'kiosk'], [12, 10, 4.4, 2.0, 1.45, 0, 'car', 1],
    [-8, -34, 0, 0, 8, 0, 'tree'], [18, -34, 0, 0, 8, 0, 'tree'],
    [-24, -6, 1.9, 1.35, 1.25, 0, 'dumpster', {}], [6, -3, 2.6, 2.7, 2.8, 0, 'kiosk'],
  ],
};

function build(ctx) {
  const { addKind, put, solid, plane, M, group, physics, glows } = ctx;
  const sounds = [];
  // ---------- the stations ----------
  const boardsFor = (si) => (track, clock) => {
    const d = track, next = STATIONS[NEXT[d][si]].short;
    const p = ((clock + LINE_OFFSET[d]) % LEG + LEG) % LEG;
    const txt = p < DWELL - 3 ? 'BOARDING' : p < DWELL ? 'CLOSING' : LEG - p < 10 ? 'ARRIVING' : `${Math.ceil(LEG - p)} s`;
    return [`TO ${next}`, txt];
  };
  STATIONS.forEach((st, si) => buildStation(ctx, { ox: st.ox, name: st.name, trains: false, board: boardsFor(si) }));
  // ---------- the plazas ----------
  const red = new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.5 }), gold = new THREE.MeshStandardMaterial({ color: 0xd8a830, roughness: 0.4, metalness: 0.4 });
  STATIONS.forEach((st, si) => {
    const ox = st.ox;
    plane(M.concrete, PLAZA.x1 - PLAZA.x0, PLAZA.z1 - PLAZA.z0, ox + (PLAZA.x0 + PLAZA.x1) / 2, (PLAZA.z0 + PLAZA.z1) / 2, 0.004, 0, 0xb0aaa0);
    for (const it of [...COMMON, ...THEMES[st.theme]]) addKind(it[0] + ox, it[1], it[2], it[3], it[4], it[5], it[6], it[7], si === 2 ? 1 : 0);
    // the station's name in big letters over the hall's stairs (it tells you where the train just brought you)
    const sign = canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = '#0f2346'; g.fillRect(0, 0, w, h);
      lineBullet(g, 84, h / 2, 54);
      g.fillStyle = '#fff'; g.font = `bold ${st.name.length > 20 ? 52 : 80}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(st.name, 160, h / 2 + 2);
    });
    const sm = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0.7 });
    for (const [x, ry] of [[ox + 6.25, 0]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), sm); m.position.set(x, 7.5, -44 + 0.05); m.rotation.y = ry; m.userData.noMinimap = true; group.add(m); }
    if (st.theme === 'chinatown') {
      // the Chinatown gate across the north of the market: two red columns, a lintel and a green tiled roof
      for (const x of [-4, 16]) { put(new THREE.BoxGeometry(0.9, 7, 0.9), red, ox + x, 3.5, -40, 0, { grime: 0 }); solid(ox + x, -40, 0.9, 0.9, 7, 0, 'wood'); }
      put(new THREE.BoxGeometry(22, 0.7, 1.1), red, ox + 6, 6.6, -40, 0, { grime: 0 });
      put(new THREE.BoxGeometry(24, 0.35, 2.4), new THREE.MeshStandardMaterial({ color: 0x2f6a4a, roughness: 0.6 }), ox + 6, 7.3, -40, 0, { grime: 0 });
      put(new THREE.BoxGeometry(4, 1.0, 0.12), gold, ox + 6, 5.6, -39.4, 0, { grime: 0 });
      // red lanterns strung over the market
      const lantern = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0xff3020, emissiveIntensity: 1.8 });
      for (let x = -10; x <= 20; x += 5) for (const z of [-14, -20, -28]) { put(new THREE.SphereGeometry(0.28, 10, 8), lantern, ox + x, 5.2 + Math.sin(x) * 0.2, z, 0, { grime: 0, cast: false }); glows.push([ox + x, 5.2, z, 0.9]); }
    }
  });

  // ---------- the trains: three per line, one at each station, moving in lockstep ----------
  const LOCAL = carBoxes();
  const trains = [];
  for (let d = 0; d < 2; d++) for (let k = 0; k < 3; k++) {
    const car = makeCar(d);
    group.add(car.group);
    const boxes = LOCAL.map(([x0, y0, z0, x1, y1, z1, f]) => {
      const b = physics.addBox(new Box(9000, y0, 9000, 9001, y1, 9001));
      b.dynamic = true; b.surface = 'metal'; if (f && f.pass) b.pass = true;
      return { b, x0, x1, z0, z1, door: f && f.door };
    });
    trains.push({ d, k, car, boxes, x: null, z: null, open: 0, v: 0, at: -1, phase: '' });
  }
  // the tunnel mouths at both ends of each platform: closed to people on foot, opened for a train going through
  const gates = [];
  STATIONS.forEach((st) => {
    for (const d of [0, 1]) for (const z of [PL.z0 - 2, PL.z1 + 2]) {
      const x0 = st.ox + TX[d] - 2.3, x1 = st.ox + TX[d] + 2.3;
      const b = physics.addBox(new Box(x0, PIT, z - 0.2, x1, PIT + 5.5, z + 0.2));
      b.dynamic = true; b.pass = true; b.hidden = true;
      gates.push({ b, st, d, z, x0, x1 });
    }
  });

  // where a train is at a time: station, position along its track, speed, doors
  function stateOf(tr, clock) {
    const lt = clock + LINE_OFFSET[tr.d] + tr.k * LEG;
    const L = Math.floor(lt / LEG), tau = lt - L * LEG;
    const order = [0, NEXT[tr.d][0], NEXT[tr.d][NEXT[tr.d][0]]];
    const si = order[((L % 3) + 3) % 3], next = NEXT[tr.d][si];
    const dz = DIRZ[tr.d];
    if (tau < DWELL) return { st: si, z: STOP_Z, v: 0, open: tau > 1.5 && tau < DWELL - 2, dwell: tau, next };
    const [s, v] = runAt(tau - DWELL);
    if (s < HALF) return { st: si, z: STOP_Z + dz * s, v, open: false, next };
    return { st: next, z: STOP_Z + dz * (s - 2 * HALF), v, open: false, next: NEXT[tr.d][next], arriving: true };
  }
  const inside = (tr, p, x = tr.x, z = tr.z) => x !== null && Math.abs(p.x - x) < H - 0.05 && Math.abs(p.z - z) < L2 - 0.25 && p.y > YP - 0.4 && p.y < T_TOP;
  let game = null;
  const world = {};
  function update(dt, t, clock) {
    game = (this && this.game) || game;   // (called as the world's method: the game sets world.game)
    for (const tr of trains) {
      const s = stateOf(tr, clock);
      const st = STATIONS[s.st], X = st.ox + TX[tr.d], Z = s.z;
      // carry everyone aboard by however far the car moved (or was handed over to the next tunnel)
      if (tr.x !== null && game && (X !== tr.x || Z !== tr.z)) {
        const dx = X - tr.x, dzz = Z - tr.z;
        // (not other players on a guest's screen: their positions come from the host, already carried)
        for (const c of game.characters) if (c.alive && !c.puppet && inside(tr, c.pos)) { c.pos.x += dx; c.pos.z += dzz; if (c.prevPos) { c.prevPos.x += dx; c.prevPos.z += dzz; } }
      }
      tr.x = X; tr.z = Z; tr.v = s.v; tr.at = s.v === 0 ? s.st : -1; tr.st = s;
      tr.car.group.position.set(X, 0, Z);
      tr.car.group.rotation.y = DIRZ[tr.d] > 0 ? 0 : Math.PI;
      // doors: slide open over half a second
      const want = s.open ? 1 : 0;
      tr.open += Math.sign(want - tr.open) * Math.min(Math.abs(want - tr.open), dt * 2.2);
      const side = DOOR_SIDE[tr.d] * (DIRZ[tr.d] > 0 ? 1 : -1);   // the platform side, in the car's own (turned) frame
      for (const g of tr.car.doors[side]) g.position.z = g.userData.d + g.userData.leaf * DW / 2 * (1 + 2 * tr.open * 0.95);
      for (const bx of tr.boxes) {
        const gone = bx.door === DOOR_SIDE[tr.d] && tr.open > 0.6;   // an open doorway: walk through
        bx.b.minx = gone ? 9000 : X + bx.x0; bx.b.maxx = gone ? 9001 : X + bx.x1;
        bx.b.minz = Z + bx.z0; bx.b.maxz = Z + bx.z1;
      }
      // sounds: the chime as the doors move, the horn pulling out, a bell running in, the rumble under way
      const ph = s.v === 0 ? (s.open ? 'open' : 'shut') : s.arriving ? 'in' : 'out';
      if (ph !== tr.phase) {
        const pos = new THREE.Vector3(X, YP + 1.5, Z);
        if ((ph === 'open' || (ph === 'shut' && tr.phase === 'open'))) sounds.push(['trainchime', pos]);
        if (ph === 'out' && tr.phase === 'shut') sounds.push(['trainhorn', pos]);
        if (ph === 'in') sounds.push(['trainbell', pos]);
        tr.phase = ph;
      }
      if (s.v > 1) { tr.rumble = (tr.rumble || 0) - dt; if (tr.rumble <= 0) { tr.rumble = 0.45; sounds.push(['trainrumble', new THREE.Vector3(X, YP + 1, Z), { speed: s.v }]); } }
    }
    // tunnel mouths open while a train is near them
    for (const gt of gates) {
      const near = trains.some(tr => tr.d === gt.d && tr.x !== null && Math.abs(tr.x - (gt.x0 + gt.x1) / 2) < 3 && Math.abs(tr.z - gt.z) < L2 + 12);
      gt.b.minx = near ? 9000 : gt.x0; gt.b.maxx = near ? 9001 : gt.x1;
    }
  }
  // a moving train hits anyone in its path (not the people riding in it)
  function trainHit(p) {
    for (const tr of trains) {
      if (tr.v < 0.3 || tr.x === null) continue;
      if (Math.abs(p.x - tr.x) > H + 0.3 || Math.abs(p.z - tr.z) > L2 + 0.4 || p.y > T_TOP + 1.5 || p.y < PIT - 1) continue;
      if (!inside(tr, p)) return true;
    }
    return false;
  }
  // how far a train has carried a point between two clock times (guests see others a little in the past, and
  // replay their own inputs: both need the ride's movement added back)
  function trainShift(p, from, to, out) {
    out.set(0, 0, 0);
    for (const tr of trains) {
      const a = stateOf(tr, from), sa = STATIONS[a.st];
      const ax = sa.ox + TX[tr.d], az = a.z;
      if (!inside(tr, p, ax, az)) continue;
      const b = stateOf(tr, to), sb = STATIONS[b.st];
      out.set(sb.ox + TX[tr.d] - ax, 0, b.z - az);
      return out;
    }
    return out;
  }

  // ---------- bots: riding the train to another station ----------
  const stationOf = (p) => { for (let i = 0; i < 3; i++) if (Math.abs(p.x - STATIONS[i].ox) < 47) return i; return -1; };
  const aboard = (p) => trains.find(tr => inside(tr, p));
  const _w = new THREE.Vector3(), _t = new THREE.Vector3();
  function botTravel(br, dt) {
    const b = br.bot, goal = br.goal;
    const ride = aboard(b.pos);
    const toward = (x, z, k = 1) => _w.set(x - b.pos.x, 0, z - b.pos.z).normalize().multiplyScalar(k);
    if (ride) {
      const s = ride.st, gs = goal ? stationOf(goal) : -1;
      br.ride = br.ride || { from: s.st, door: DOORS[(Math.random() * 4) | 0] };
      const dz = DIRZ[ride.d], side = DOOR_SIDE[ride.d];
      if (s.v === 0 && ride.open > 0.6 && (gs === s.st || gs < 0 || (s.st !== br.ride.from && NEXT[ride.d][s.st] !== gs))) {
        // this is the stop: out through the nearest door
        let best = DOORS[0], bd = 1e9;
        for (const d of DOORS) { const dd = Math.abs(ride.z + d * dz - b.pos.z); if (dd < bd) { bd = dd; best = d; } }
        const dzw = ride.z + best * dz;
        if (Math.abs(b.pos.z - dzw) > 0.4) return { wish: toward(ride.x + side * 0.2, dzw) };
        return { wish: toward(ride.x + side * 3, dzw), sprint: true };
      }
      // riding: stand clear of the doors, near the middle of the car
      const sz = ride.z + br.ride.door * dz + 1.3;
      if (Math.hypot(b.pos.x - ride.x, b.pos.z - sz) > 0.8) return { wish: toward(ride.x, sz, 0.6) };
      return { wish: _w.set(0, 0, 0), crouch: true };
    }
    if (br.goalKind === 'engage' || !goal) { br.ride = null; return null; }
    const here = stationOf(b.pos), gs = stationOf(goal);
    if (here < 0 || gs < 0 || gs === here) { br.ride = null; return null; }
    // the line that reaches the goal's station next
    const d = NEXT[0][here] === gs ? 0 : 1, st = STATIONS[here], side = DOOR_SIDE[d];
    if (!br.ride || br.ride.d !== d || br.ride.st !== here) br.ride = { d, st: here, door: DOORS[(Math.random() * 4) | 0], from: here };
    const tx = st.ox + TX[d], doorZ = STOP_Z + br.ride.door * DIRZ[d];
    const waitX = tx + side * (H + 1.4);
    const train = trains.find(tr => tr.d === d && tr.at === here);
    const onPlatform = Math.abs(b.pos.y - YP) < 0.6 && Math.abs(b.pos.x - waitX) < 3.5 && Math.abs(b.pos.z - doorZ) < 6;
    if (onPlatform && train && train.open > 0.6 && train.st.dwell < DWELL - 2.5) {
      // board: through the door and into the car
      if (Math.abs(b.pos.x - tx) > H + 0.2) return { wish: toward(tx, doorZ), sprint: true };
      return { wish: toward(tx, doorZ + 1.3 * DIRZ[d], 0.6) };
    }
    // otherwise go and wait on the right platform, by a door
    _t.set(waitX, YP, doorZ);
    if (br.rideKey !== `${d}${here}`) { br.rideKey = `${d}${here}`; br.repathT = 0; br.path = []; }
    if (onPlatform && Math.hypot(b.pos.x - waitX, b.pos.z - doorZ) < 1.2) return { wish: _w.set(0, 0, 0) };
    const dir = br.followPath(_t, dt);
    return { wish: dir ? _w.copy(dir) : toward(waitX, doorZ), sprint: true };
  }

  // ---------- the bots' levels: every station's hall and platforms ----------
  const levels = STATION_LEVELS.map((lv) => {
    const portals = [];
    for (const st of STATIONS) for (const q of lv.portals) portals.push({ link: q.link, rect: [q.rect[0] + st.ox, q.rect[1], q.rect[2] + st.ox, q.rect[3]], climb: q.climb.map(([x, y, z]) => [x + st.ox, y, z]) });
    return { y: lv.y, bounds: { minX: lv.bounds.minX + STATIONS[0].ox, maxX: lv.bounds.maxX + STATIONS[2].ox, minZ: lv.bounds.minZ, maxZ: lv.bounds.maxZ }, portals };
  });

  Object.assign(world, {
    update, trainHit, trainShift, sounds, botTravel, upper: levels, trains, stationOf,
    sameArea: (a, b) => stationOf(a) === stationOf(b),
    // the menu's live view: on Symphony's west platform as the trains come and go
    menuCam(t, cam) { cam.position.set(STATIONS[1].ox - 4, YP + 2.4, -24 + Math.sin(t * 0.3) * 6); cam.lookAt(STATIONS[1].ox + 2, YP + 1.2, 10); },
    // spawns face into their plaza (the west clusters east, the east clusters west)
    spawnYaw: [-Math.PI / 2, Math.PI / 2],
  });
  return world;
}

const holes = [], lids = [];
for (const st of STATIONS) {
  for (const r of STATION_LIDS) lids.push([r[0] + st.ox, r[1], r[2] + st.ox, r[3]]);
  for (const [x, w] of [[-2.75, 6.5], [15.25, 6.5]]) holes.push([x - w / 2 + st.ox, 3.5 - 1.2, x + w / 2 + st.ox, 3.5 + 1.2]);
}
const at = (list, ox) => list.map(([x, z]) => [x + ox, z]);
export const LINKLOOP = {
  id: 'link',
  name: 'Link Loop',
  blurb: 'Three light rail stations joined only by the trains: ride the loop to reach the others, and hope nobody on the other side got on with you',
  bounds: { hx: HX, hz: HZ },
  skyline: false, mountain: false,
  look: { turbidity: 2.6, rayleigh: 2.2, mie: 0.004, fog: 0.004, fogColor: 0xb4c0cc, sun: 3.2, sunColor: 0xfff0dc, hemi: 1.0, hemiSky: 0xc8d8ec, ground: 0x8a8478, exposure: 1.0, env: 0.8, blueSky: true },
  holes, lids,
  // home stations: Pioneer Square (one team), Chinatown (the other); both spawn at Symphony too, on their own side
  spawns2: [[...at(SPAWN_W, STATIONS[0].ox), ...at(SPAWN_W, STATIONS[1].ox)], [...at(SPAWN_E, STATIONS[2].ox), ...at(SPAWN_E, STATIONS[1].ox)]],
  pickups: STATIONS.flatMap(st => [
    { type: 'health', pos: [st.ox + 4, YC, -24] }, { type: 'ammo', pos: [st.ox - 4.5, YP, -30] }, { type: 'ammo', pos: [st.ox + 12.5, YP, 16] },
    { type: 'health', pos: [st.ox + 4, 0, -6] },
  ]),
  // search & destroy: both sites at Symphony, one in its ticket hall, one on its plaza
  sites: [[STATIONS[1].ox + 4, -24, YC], [STATIONS[1].ox + 4, -32, 0]],
  photos: ['assets/loading/pioneer-1.jpg', 'assets/loading/pioneer-2.jpg'],
  build,
};
