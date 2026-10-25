// Link Loop: three Link light rail stations, each a closed-off arena, joined by nothing but the trains. Two lines
// run the loop in opposite directions (one track each way), so every station is one ride from both others. A
// train dwells 15 s with its doors open, then runs 23 s through the dark tunnel to the next station: whoever got
// on with you, friend or enemy, is in that car until it stops.
//
// The three stations are built differently, after the real ones:
//   - Pioneer Square: a brick-vaulted hall under the plaza (side platforms, cast-iron columns between the
//     tracks), four stairwells straight down from the street. Two levels: the plaza and the platforms.
//   - Symphony: one big indoor hall (the old University Street station by Benaroya Hall). An island platform
//     between the tracks, side halls beyond them, and galleries along both walls joined by two footbridges over
//     the tracks. The galleries, bridges and the island are the fight; the side halls are where both teams come in.
//   - Chinatown-International District: open air at street level. The tracks run out of a tunnel portal at one
//     end of the market and into another at the other; side platforms under canopies, a footbridge at the north
//     end and a level crossing at the south, which the trains run straight over.
//
// How the ride works: the cars really move through the station and into the tunnel (their collision moves with
// them and carries everyone inside); 100 m down the tunnel, out of sight in the dark, the car and its passengers
// are moved to the same point in the next station's tunnel (and up or down to its platform height) and run on in.
// The timetable runs off the match clock every machine shares, so trains are in the same place for everyone online.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Box } from './physics.js';
import { FONT, lineBullet, canvasTex } from './station.js';

// ---------- the stations and the loop ----------
// ox: where the station stands (x); py: platform height; tx: the two tracks' centre lines (station-local x);
// doors: which side each track's doors open onto (-1 west, +1 east); mouth: the tunnel mouths (z)
const STATIONS = [
  { name: 'Pioneer Square', short: 'PIONEER SQUARE', ox: -95, py: -6.5, tx: [1.5, 6.5], doors: [-1, 1], mouth: [-40, 18], pit: [0, 8] },
  { name: 'Symphony', short: 'SYMPHONY', ox: 0, py: 0, tx: [-1.5, 9.5], doors: [1, -1], mouth: [-40, 18], pit: [-3, 11] },
  { name: 'Chinatown International District', short: 'CHINATOWN-ID', ox: 95, py: 0, tx: [1.5, 6.5], doors: [-1, 1], mouth: [-44, 22], pit: [0, 8] },
];
const HX = 140, HZ = 50;
const STATION_KEY = ['pioneer', 'symphony', 'chinatown'];   // (names of the announcement recordings)
const STOP_Z = -11;           // where a stopped car's middle is (the same in every station)
const GY = 5;                 // footbridges and galleries
const PIT_D = 0.9, TUN_H = 5.6;   // track bed under the platform, tunnel height over the bed
// direction 0 (west track, running toward -z) visits 0 -> 1 -> 2; direction 1 (east track, toward +z) 0 -> 2 -> 1
const NEXT = [[1, 2, 0], [2, 0, 1]];
const DIRZ = [-1, 1];
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
// the car is modelled with its floor at y = 0 and raised or lowered to each station's platforms
const YP = 0, RAIL = -PIT_D + 0.25;

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
    tail: new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 3 }),
    door: std({ color: 0xdfe2e0, roughness: 0.35, metalness: 0.2 }),
  };
  const dest = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb21e'; g.font = `bold 36px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(dirIdx ? '1 LINE  LOOP · EAST' : '1 LINE  LOOP · WEST', w / 2, h / 2);
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
  box(mats.body, -H, T_BOT, -L2, -H + 0.04, YP, L2); box(mats.body, H - 0.04, T_BOT, -L2, H, YP, L2);   // skirts
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
  // roof (Siemens S70): HVAC pods over each end, the traction equipment, the pantograph just ahead of the joint
  const rod = (mat, a, b, r) => { const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)); const g = new THREE.CylinderGeometry(r, r, d.length(), 6); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); add(mat, g); };
  for (const zc of [-L2 + 4.2, L2 - 4.2]) box(mats.grey, -0.85, T_TOP + 0.08, zc - 1.8, 0.85, T_TOP + 0.42, zc + 1.8);
  box(mats.grey, -0.7, T_TOP + 0.08, -6.5, 0.7, T_TOP + 0.3, -2.2);
  {
    const R = T_TOP + 0.08, Z = 2.2;
    box(mats.black, -0.45, R, Z - 0.6, 0.45, R + 0.12, Z + 0.6);                                   // base frame
    for (const sx of [-0.35, 0.35]) for (const sz of [-0.5, 0.5]) rod(mats.lamp, [sx, R + 0.12, Z + sz], [sx, R + 0.26, Z + sz], 0.035);   // insulators
    rod(mats.grey, [0, R + 0.28, Z - 0.4], [0, R + 0.95, Z + 0.55], 0.04);                         // lower arm
    rod(mats.grey, [0, R + 0.95, Z + 0.55], [0, R + 1.55, Z - 0.2], 0.03);                         // upper arm
    box(mats.black, -0.75, R + 1.55, Z - 0.28, 0.75, R + 1.6, Z - 0.12);                          // pan head (the contact strip)
    rod(mats.grey, [-0.3, R + 1.56, Z - 0.2], [0, R + 1.5, Z - 0.2], 0.012); rod(mats.grey, [0.3, R + 1.56, Z - 0.2], [0, R + 1.5, Z - 0.2], 0.012);
  }
  // the articulation: a short accordion bellows ring round the body at the middle of the car
  for (let i = -3; i <= 3; i++) {
    const z = i * 0.09;
    for (const sx of [-1, 1]) box(mats.black, sx > 0 ? H - 0.02 : -H - 0.03, YP - 0.3, z - 0.035, sx > 0 ? H + 0.03 : -H + 0.02, T_TOP + 0.02, z + 0.035);
    box(mats.black, -H, T_TOP + 0.02, z - 0.035, H, T_TOP + 0.07, z + 0.035);
  }
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
    // (set in from the sides: their faces in the same plane as the side panels flickered)
    box(mats.body, -H + 0.065, YP, ez - (end > 0 ? 0.3 : 0), H - 0.065, WIN0, ez + (end > 0 ? 0 : 0.3));
    box(mats.body, -H + 0.065, WIN1, ez - (end > 0 ? 0.3 : 0), H - 0.065, T_TOP, ez + (end > 0 ? 0 : 0.3));
    box(mats.black, -H + 0.065, WIN0, ez - (end > 0 ? 0.3 : 0), -H + 0.3, WIN1, ez + (end > 0 ? 0 : 0.3));
    box(mats.black, H - 0.3, WIN0, ez - (end > 0 ? 0.3 : 0), H - 0.065, WIN1, ez + (end > 0 ? 0 : 0.3));
    plane(mats.glass, TW - 0.6, WIN1 - WIN0, 0, (WIN0 + WIN1) / 2, ez + end * 0.01, end > 0 ? 0 : Math.PI);
    plane(mats.dest, 1.6, 0.22, 0, T_TOP - 0.35, ez + end * 0.02, end > 0 ? 0 : Math.PI);
    // the S70's nose: a raked windscreen over a rounded anticlimber, light clusters either side of it; white
    // headlights at the leading end (local +z is always the way it runs), red tail lights at the back
    const ws = new THREE.PlaneGeometry(TW - 0.5, WIN1 - WIN0 + 0.25); ws.rotateX(end * -0.22); if (end < 0) ws.rotateY(Math.PI); ws.translate(0, (WIN0 + WIN1) / 2 + 0.05, ez + end * 0.13); add(mats.glass, ws);
    box(mats.black, -H + 0.12, WIN0 - 0.08, ez + (end > 0 ? 0 : -0.26), H - 0.12, WIN0, ez + (end > 0 ? 0.26 : 0));
    box(mats.body, -H + 0.08, YP - 0.45, ez + (end > 0 ? 0 : -0.32), H - 0.08, WIN0 - 0.08, ez + (end > 0 ? 0.32 : 0));
    box(mats.grey, -0.95, YP - 0.55, ez + (end > 0 ? 0.2 : -0.42), 0.95, YP - 0.25, ez + (end > 0 ? 0.42 : -0.2));      // anticlimber / coupler cover
    box(mats.blue, -H + 0.08, YP - 0.25, ez + end * 0.32 - 0.004 * end, H - 0.08, YP + 0.1, ez + end * 0.325);
    for (const hx of [-0.85, 0.85]) {
      box(end > 0 ? mats.head : mats.tail, hx - 0.16, YP + 0.25, ez + end * 0.32, hx + 0.16, YP + 0.42, ez + end * 0.335);
      box(end > 0 ? mats.head : mats.tail, hx * 0.8 - 0.06, T_TOP - 0.18, ez + end * 0.01, hx * 0.8 + 0.06, T_TOP - 0.1, ez + end * 0.035);   // marker lights
    }
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

// ---------- street-level layouts (station-local) ----------
// tall blocks all round a plaza (x -28..36, z -44..22): no way out, nothing beyond to see. portal: [x0, x1], a gap
// in the north and south rows where the tracks come out of their tunnels at street level
function enclosure(tints, stone, portal) {
  const t = (i) => tints[i % tints.length];
  const out = [];
  // (the rows run corner to corner and the sides meet them: a gap at a corner left a pocket of bare ground)
  const ROW = portal ? [[-25, 20], [(-15 + portal[0]) / 2, portal[0] + 15], [(portal[1] + 21) / 2, 21 - portal[1]], [32, 22]] : [[-25, 20], [-6, 18], [12, 18], [32, 22]];
  ROW.forEach(([x, w], i) => out.push([x, -47.5, w, 7, 22 + (i % 2) * 6, 0, 'brick', { tint: t(i), stone: stone && i % 2 }]));
  ROW.forEach(([x, w], i) => out.push([x, 25.5, w, 7, 20 + ((i + 1) % 2) * 6, 0, 'brick', { tint: t(i + 1), stone: stone && !(i % 2) }]));
  [[-34, -27, 7, 34], [-34, 6, 7, 32]].forEach(([x, z, w, d], i) => out.push([x + 2.5, z, w, d, 24 + i * 4, 0, 'brick', { tint: t(i + 2) }]));
  [[42, -27, 7, 34], [42, 6, 7, 32]].forEach(([x, z, w, d], i) => out.push([x - 2.5, z, w, d, 26 - i * 4, 0, 'brick', { tint: t(i + 3) }]));
  // the outer walls; with a portal, the end walls leave the track's way through (a train carried its riders
  // into a 30 m wall there, and the wall threw them out on top of it)
  for (const z of [-51.5, 29.5]) {
    if (portal) out.push([(-36 + portal[0]) / 2, z, portal[0] + 36, 1, 30, 0, 'boundary'], [(portal[1] + 44) / 2, z, 44 - portal[1], 1, 30, 0, 'boundary']);
    else out.push([4, z, 80, 1, 30, 0, 'boundary']);
  }
  out.push([-35.5, -11, 1, 80, 30, 0, 'boundary'], [43.5, -11, 1, 80, 30, 0, 'boundary']);
  return out;
}

// Pioneer Square: the plaza over the platform hall (x -6.5..14.5, z -40..18), four stairwells straight down to the
// platforms (two each side), a café and a bookshop on the flanks
const P_HALL = [-6.5, -40, 14.5, 18];
const P_STAIRS = [[-11.95, -26, 1], [-11.95, 6, 1], [19.95, -26, -1], [19.95, 6, -1]];   // [cx, z, dir]: 11.5 m flights, down toward +x * dir
const P_SW = 11.5;
const PIONEER_ITEMS = [
  ...enclosure([0xe9c6a8, 0xd8a890, 0xf2d9c0, 0xffffff], true),
  ...P_STAIRS.map(([x, z, dir]) => [x, z, P_SW, 2.4, 6.5, 0, 'stairdown', { dir }]),
  [-22.5, -12, 10, 14, 14, 0, 'brick', { tint: 0xe9c6a8, shop: { e: [['d', -4], ['w', 1], ['d', 4]], s: [['d', 0]], n: [['w', 0]], props: [['table', -2, -3], ['table', 2, 3], ['bar', -2.5, 4, 0], ['crates', 2.5, -4]], light: 1 } }],
  [30.5, -12, 10, 14, 12, 0, 'brick', { stone: true, shop: { w: [['d', -4], ['w', 0], ['d', 4]], n: [['d', 0]], props: [['shelf', -2, -4, 0], ['shelf', 2, 0, 0], ['shelf', -2, 4, 0], ['crates', 2.5, -5]], light: 1 } }],
  [4, -34, 1.0, 1.0, 13, 0, 'totem'], [4, -34, 3.2, 3.2, 0.9, 0, 'railing', { open: 's' }],
  [-4, -38, 0, 0, 9, 0, 'tree'], [12, -38, 0, 0, 9.5, 0, 'tree'], [-20, -36, 0, 0, 9, 0, 'tree'], [28, 14, 0, 0, 9, 0, 'tree'],
  [4, 13, 6.5, 2.4, 3.1, 0, 'truck', { food: 1 }], [4, -20, 2.6, 2.7, 2.8, 0, 'kiosk'],
  [4, -4, 2.4, 0.9, 0.9, 0, 'stall', 0], [-1, -12, 1.6, 1.6, 1.6, 0, 'crate'], [9.5, -26, 1.6, 1.6, 1.6, 0, 'crate'],
  [-2, -29, 1.8, 0.6, 0.95, 0, 'bench'], [10, 4, 1.8, 0.6, 0.95, 0, 'bench'],
  [-14, -36, 2.4, 1.0, 0.95, 0, 'tent', 0], [22, -36, 2.4, 1.0, 0.95, 0, 'tent', 1],
  [-26, -26, 1.9, 1.35, 1.25, 0, 'dumpster', {}], [34, 2, 1.35, 1.9, 1.25, 0, 'dumpster', { dark: true }],
  [-12, -1, 3.2, 0.9, 1.1, 0, 'jersey'], [20, -1, 3.2, 0.9, 1.1, 0, 'jersey'], [10, -12, 1.6, 1.6, 1.6, 0, 'crate'],
  // the old Underground's skylights, set in the plaza over the hall
  [-2, -16, 2.4, 2.4, 0, 0, 'prism'], [10, -6, 2.4, 2.4, 0, 0, 'prism'], [-2, 2, 2.4, 1.8, 0, 0, 'prism'], [10, -30, 2.4, 1.8, 0, 0, 'prism'],
  [-14, -29.5, 0, 0, 0, 0, 'vlamp'], [-14, 9.5, 0, 0, 0, 0, 'vlamp'], [22, -29.5, 0, 0, 0, 0, 'vlamp'], [22, 9.5, 0, 0, 0, 0, 'vlamp'],
];

// Chinatown-ID: the market plaza with the tracks through the middle at street level (x 0..8), out of a portal
// in the north row and into one in the south. Footbridge over the north end, level crossing at the south.
const C_BRIDGE = [-12, -40, 20, -37];                  // deck x0, z0, x1, z1
const C_CROSS = [13.5, 16.5];                          // level crossing (z)
const CHINATOWN_ITEMS = [
  ...enclosure([0xc04a40, 0xd8a890, 0x8a3d2c, 0xe9c6a8], false, [-1, 9]),
  [-17, -14, 16, 26, 0, 0, 'paving', 'brick'], [25, -14, 16, 26, 0, 0, 'paving', 'brick'],
  [-19, -30, 2.4, 1.0, 0.95, 0, 'tent', 0], [-19, -24.5, 2.4, 1.0, 0.95, 0, 'tent', 1], [-14.5, -30, 2.4, 0.9, 0.9, 0, 'stall', 0], [-14.5, -23.5, 2.4, 0.9, 0.9, 0, 'stall', 0],
  [27, -30, 2.4, 1.0, 0.95, 0, 'tent', 2], [27, -24.5, 2.4, 1.0, 0.95, 0, 'tent', 0], [22.5, -30, 2.4, 0.9, 0.9, 0, 'stall', 0], [22.5, -23.5, 2.4, 0.9, 0.9, 0, 'stall', 0],
  [-18, -6, 2.6, 2.7, 2.8, 0, 'kiosk'], [26, -6, 2.6, 2.7, 2.8, 0, 'kiosk'],
  [-24, 2, 2, 2, 1.2, 0, 'pallet'], [31, -14, 2, 2, 1.2, 0, 'pallet'], [-10, -3, 1.6, 1.6, 1.6, 0, 'crate'], [18, -13, 1.6, 1.6, 1.6, 0, 'crate'], [-9, 9, 1.6, 1.6, 1.6, 0, 'crate'],
  [-26, -40, 1.9, 1.35, 1.25, 0, 'dumpster', {}], [33, -40, 1.9, 1.35, 1.25, 0, 'dumpster', { dark: true }],
  [-16, 12, 4.4, 2.0, 1.45, 0, 'car', 1], [28, 1, 6.5, 2.4, 3.1, 0, 'truck', { back: 1 }],
  [-25, -32, 0, 0, 8, 0, 'tree'], [33, -32, 0, 0, 8, 0, 'tree'], [-25, 16, 0, 0, 8.5, 0, 'tree'],
  [-20, 6, 3.2, 0.9, 1.1, 0, 'jersey'], [22, 6, 3.2, 0.9, 1.1, 0, 'jersey'],
  [-14, -1, 0, 0, 0, 0, 'vlamp'], [22, -1, 0, 0, 0, 0, 'vlamp'], [-22, -38, 0, 0, 0, 0, 'vlamp'], [30, -38, 0, 0, 0, 0, 'vlamp'],
];

// Symphony: the hall (x -24..32, z -40..18, 12 m high). The east half mirrors the west about the hall's middle
// (x = 4), so neither side's way in is better than the other's.
const S_HALL = [-24, -40, 32, 18];
const S_BRIDGES = [[-34.75, -31.25], [9.25, 12.75]];   // z of the two footbridges (x -19..27)
const S_GAL = 19;                                       // galleries: x -24..-19 and 27..32
const mirrorX = (it) => { const o = it.slice(); o[0] = 8 - it[0]; return o; };
const SYM_WEST = [
  [-14, -37, 2.6, 2.7, 2.8, 0, 'kiosk'],
  [-12, -24, 3, 3, 0.75, 0, 'planter'], [-12, -24, 0, 0, 7, 0, 'tree'], [-12, 0, 3, 3, 0.75, 0, 'planter'], [-12, 0, 0, 0, 7, 0, 'tree'],
  [-7, -18, 1.8, 0.6, 0.95, 0, 'bench'], [-7, -4, 1.8, 0.6, 0.95, 0, 'bench'],
  [-16, -19, 2.2, 1.6, 2.6, 0, 'infokiosk'], [-6, -31, 1.6, 1.6, 1.6, 0, 'crate'], [-21.5, -5, 1.6, 1.6, 1.6, 0, 'crate'],
];
const SYMPHONY_ITEMS = [
  ...SYM_WEST, ...SYM_WEST.map(mirrorX),
  [4, -19.5, 1.8, 0.6, 0.95, 0, 'bench'], [4, -2.5, 1.8, 0.6, 0.95, 0, 'bench'],
];

// spawns: one team at Pioneer Square and the west side of Symphony, the other at Chinatown and Symphony's east
const SPAWN_P = [[-24, 17], [-21, 17], [-24, 13.5], [-21, 13.5], [-24, 10], [-21, 10], [-18, 17], [-18, 13.5]];
const SPAWN_C = [[32, 17], [29, 17], [32, 13.5], [29, 13.5], [32, 10], [29, 10], [26, 17], [26, 13.5]];
const SPAWN_SW = [[-22, 16], [-19.5, 16], [-22, 13], [-19.5, 13], [-22, 10], [-19.5, 10], [-16.5, 16], [-16.5, 13]];
const SPAWN_SE = SPAWN_SW.map(([x, z]) => [8 - x, z]);

// station name panel (Sound Transit style: white type on dark blue, the line bullet at the left)
function nameTex(name) {
  return canvasTex(1024, 192, (g, w, h) => {
    g.fillStyle = '#0f2346'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a6fb5'; g.fillRect(0, h - 14, w, 14);
    lineBullet(g, 96, h / 2 - 6, 58);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `bold ${name.length > 20 ? 58 : 88}px ${FONT}`;
    g.fillText(name, 186, h / 2 - 6);
  });
}

function build(ctx) {
  const { addKind, put, solid, plane, M, S, group, physics, glows, flatBox } = ctx;
  const sounds = [];
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const dark = std({ color: 0x2a2d31, roughness: 0.9 }), steel = std({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 });
  const yellow = std({ color: 0xe8c020, roughness: 0.6 }), iron = M.iron;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xeaf2ff, emissiveIntensity: 3 });
  const globe = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffe0b0, emissiveIntensity: 4 });
  const marker = new THREE.MeshStandardMaterial({ color: 0x4a8cff, emissive: 0x4a8cff, emissiveIntensity: 4 });
  const unlit = new THREE.MeshBasicMaterial({ color: 0x0b0c0e });
  // Symphony's finishes: cream plaster walls and ceiling, terrazzo floors (speckled stone chips in 1.2 m squares)
  M.cream = std({ color: 0xece5d8, roughness: 0.85 });
  const tz = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#cfc8ba'; g.fillRect(0, 0, w, h);
    const chips = ['#b8ad98', '#e8e2d6', '#9a8f80', '#d6c9b0', '#8a8478', '#f2eee6'];
    for (let i = 0; i < 9000; i++) { g.fillStyle = chips[i % chips.length]; const r = 1 + Math.random() * 2.5; g.fillRect(Math.random() * w, Math.random() * h, r, r); }
    g.strokeStyle = 'rgba(90,84,74,0.55)'; g.lineWidth = 3;
    for (const t of [1.5, 256, 510.5]) { g.beginPath(); g.moveTo(t, 0); g.lineTo(t, h); g.stroke(); g.beginPath(); g.moveTo(0, t); g.lineTo(w, t); g.stroke(); }
  });
  tz.wrapS = tz.wrapT = THREE.RepeatWrapping;
  M.terrazzo = std({ map: tz, roughness: 0.4 }); S.terrazzo = 2.4;
  const glass = std({ color: 0x9fbab0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  // a box drawn from corner to corner, and the same with collision
  const box = (mat, x0, y0, z0, x1, y1, z1, o = {}) => put(flatBox(x1 - x0, y1 - y0, z1 - z0, o.uv ?? 2), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, { grime: o.grime ?? 0, cast: o.cast ?? true, tint: o.tint });
  const wall = (mat, x0, y0, z0, x1, y1, z1, o = {}) => {
    box(mat, x0, y0, z0, x1, y1, z1, o);
    const b = solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, y0, o.surf || 'concrete');
    if (o.pass) b.pass = true; if (o.navBlock) b.navBlock = true;
    return b;
  };
  const sign = (tex, w, h, x, y, z, ry, glow = 0.8) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.5 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.userData.noMinimap = true; group.add(m);
    put(new THREE.PlaneGeometry(w, h), dark, x - Math.sin(ry) * 0.006, y, z - Math.cos(ry) * 0.006, ry + Math.PI, { grime: 0, cast: false });   // a back
    return m;
  };
  const light = (x, y, z, i = 9, d = 20, c = 0xeef4ff) => { const L = new THREE.PointLight(c, i, d, 1.4); L.position.set(x, y, z); L.userData.mapLight = true; group.add(L); };
  const lamp = (x, y, z, r = 0.22, drop = 0) => {   // a globe pendant, hung `drop` m on a rod
    put(new THREE.SphereGeometry(r, 12, 8), globe, x, y, z, 0, { grime: 0, cast: false });
    if (drop > 0) put(new THREE.CylinderGeometry(0.015, 0.015, drop, 5), iron, x, y + r + drop / 2, z, 0, { grime: 0, cast: false });
    glows.push([x, y, z, r * 4]);
  };
  // a flight of steps from (lo, yLo) up to (hi, yHi) along x or z, across c0..c1 (solid all the way down)
  const flight = (axis, lo, hi, c0, c1, yLo, yHi, mat, tint) => {
    const n = Math.ceil((yHi - yLo) / 0.34), run = (hi - lo) / n;
    for (let k = 0; k < n; k++) {
      const a = lo + k * run, b = a + run, top = yLo + (k + 1) * (yHi - yLo) / n, s0 = Math.min(a, b), s1 = Math.max(a, b);
      if (axis === 'x') wall(mat, s0, yLo, c0, s1, top, c1, { tint });
      else wall(mat, c0, yLo, s0, c1, top, s1, { tint });
    }
    // handrails along both sides
    const L = Math.hypot(hi - lo, yHi - yLo), ang = Math.atan2(yHi - yLo, Math.abs(hi - lo)) * Math.sign(hi - lo);
    for (const c of [c0 + 0.05, c1 - 0.05]) {
      const g = new THREE.CylinderGeometry(0.025, 0.025, L, 6); g.rotateZ(Math.PI / 2);
      if (axis === 'x') put(g, steel, (lo + hi) / 2, (yLo + yHi) / 2 + 0.95, c, 0, { grime: 0, rz: ang, cast: false });
      else put(g, steel, c, (yLo + yHi) / 2 + 0.95, (lo + hi) / 2, -Math.PI / 2, { grime: 0, rz: ang, cast: false });
    }
  };
  // the bots' way up or down a flight: [approach, foot, middle, top, off the top] and its footprint
  const flightPortal = (axis, lo, hi, c0, c1, yLo, yHi, link = 0) => {
    const u = Math.sign(hi - lo), c = (c0 + c1) / 2;
    const P = (s, y) => axis === 'x' ? [s, y, c] : [c, y, s];
    const climb = [P(lo - u * 1.3, yLo), P(lo - u * 0.2, yLo), P((lo + hi) / 2, (yLo + yHi) / 2), P(hi - u * 0.3, yHi), P(hi + u * 1.3, yHi)];
    const a = Math.min(lo, hi) - 0.3, b = Math.max(lo, hi) + 0.3;
    return { link, rect: axis === 'x' ? [a, c0, b, c1] : [c0, a, c1, b], climb, low: yLo };
  };
  // a railing (stops people, not bullets), drawn as a steel top rail over glass panels
  const railing = (x0, z0, x1, z1, y) => {
    const b = solid((x0 + x1) / 2, (z0 + z1) / 2, Math.max(0.1, x1 - x0), Math.max(0.1, z1 - z0), 1.05, y, 'metal'); b.pass = true;
    box(steel, x0, y + 1.0, z0, x1, y + 1.06, z1, { cast: false });
    box(glass, x0 + 0.02, y + 0.08, z0 + 0.02, x1 - 0.02, y + 0.98, z1 - 0.02, { cast: false });
    return b;
  };
  // railings with openings: along x (z fixed) or z (x fixed), skipping the [a, b] gaps
  const railingRun = (axis, fixed, from, to, y, gaps = []) => {
    let cur = from;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) { if (a - cur > 0.2) seg(cur, a); cur = Math.max(cur, b); }
    if (to - cur > 0.2) seg(cur, to);
    function seg(a, b) { if (axis === 'x') railing(a, fixed - 0.06, b, fixed + 0.06, y); else railing(fixed - 0.06, a, fixed + 0.06, b, y); }
  };
  // arrival boards: [canvas, texture, station, line]; redrawn when their text changes
  const boards = [];
  const board = (si, d, x, y, z, ry, both = true) => {
    let bd = boards.find(q => q.si === si && q.d === d);
    if (!bd) { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; bd = { c, tex, si, d, last: '' }; boards.push(bd); }
    if (both) box(dark, x - 0.9, y - 0.225, z - 0.025, x + 0.9, y + 0.225, z + 0.025, { cast: false });   // the case between the two faces
    for (const s of both ? [0, Math.PI] : [0]) sign(bd.tex, 1.8, 0.45, x + Math.sin(ry + s) * 0.03, y, z + Math.cos(ry + s) * 0.03, ry + s, 1.0);
  };

  // ---------- tracks, track bed and tunnels (every station) ----------
  const beds = (st) => st.ox === STATIONS[1].ox ? [[-3, 0], [8, 11]] : [[0, 8]];
  function trackwork(st) {
    const { ox, py } = st, PIT = py - PIT_D, TOP = PIT + TUN_H, [p0, p1] = st.pit, [m0, m1] = st.mouth;
    // the bed between the mouths (at street level a hole in the ground: bots keep out of it)
    for (const [b0, b1] of beds(st)) {
      // (the bed runs on 3 m into each tunnel, to the gates: past the mouth there was nothing under your feet)
      const spans = st.crossing ? [[m0, st.crossing[0]], [st.crossing[1], m1]] : [[m0, m1]];
      for (const [z0, z1] of spans.map(([a, c]) => [a === m0 ? a - 3 : a, c === m1 ? c + 3 : c])) { const b = solid(ox + (b0 + b1) / 2, (z0 + z1) / 2, b1 - b0, z1 - z0, 1, PIT - 1, 'concrete'); if (py === 0) b.navBlock = true; }
      put(new THREE.PlaneGeometry(b1 - b0, m1 - m0), M.concrete, ox + (b0 + b1) / 2, PIT + 0.005, (m0 + m1) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0x5a5852 });
      if (py === 0) for (const [z0, z1] of spans) for (const [x, s] of [[b0, 1], [b1, -1]]) {
        // the pit's sides (the ground is cut away over it) and the yellow line along the edge
        box(M.concrete, ox + x - (s > 0 ? 0.04 : 0), PIT, z0, ox + x + (s > 0 ? 0 : 0.04), -0.002, z1, { tint: 0x8a8680, cast: false });
        put(new THREE.PlaneGeometry(0.5, z1 - z0), yellow, ox + x - s * 0.3, 0.012, (z0 + z1) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false });
      }
    }
    // rails and sleepers, and the overhead wire
    for (const tx of st.tx) {
      for (const o of [-0.72, 0.72]) put(flatBox(0.08, RAIL + PIT_D, 280, 0), steel, ox + tx + o, PIT + (RAIL + PIT_D) / 2, STOP_Z, 0, { grime: 0, cast: false });
      for (let z = m0 - 50; z <= m1 + 50; z += 0.9) put(flatBox(2.4, 0.12, 0.22, 0), M.concrete, ox + tx, PIT + 0.06, z, 0, { grime: 0.2, tint: 0x7a7670, cast: false });
      put(flatBox(0.03, 0.03, 280, 0), dark, ox + tx, TOP - 0.08, STOP_Z, 0, { grime: 0, cast: false });   // contact wire, at the pantograph's height
      put(flatBox(0.012, 0.012, 280, 0), dark, ox + tx, TOP - 0.02, STOP_Z, 0, { grime: 0, cast: false });  // the messenger above it
    }
    // the tunnels past both mouths: lit near the station, dark (unlit) beyond, little blue marker lights
    const x0 = ox + p0 - 0.3, x1 = ox + p1 + 0.3;
    for (const [za, zb] of [[m0 - 150, m0], [m1, m1 + 150]]) {
      const near = za === m0 - 150 ? [m0 - 40, m0] : [m1, m1 + 40], far = za === m0 - 150 ? [za, m0 - 40] : [m1 + 40, zb];
      for (const [a, b, mat] of [[near[0], near[1], M.concrete], [far[0], far[1], unlit]]) {
        const zc = (a + b) / 2, L = b - a;
        box(mat, x0, PIT, a, x0 + 0.3, TOP, b, { tint: 0x6a6660, grime: 0.4 }); box(mat, x1 - 0.3, PIT, a, x1, TOP, b, { tint: 0x6a6660, grime: 0.4 });
        if (mat !== unlit) for (const x of [x0, x1 - 0.3]) solid(x + 0.15, zc, 0.3, L, TOP - PIT, PIT, 'concrete');
        box(mat, x0, TOP, a, x1, TOP + 0.3, b, { tint: 0x5a5650 });
        put(new THREE.PlaneGeometry(x1 - x0, L), mat, (x0 + x1) / 2, PIT + 0.004, zc, 0, { rx: -Math.PI / 2, grime: 0, cast: false, tint: 0x4a4842 });
      }
      for (let z = za + 5; z < zb; z += 10) for (const x of [x0 + 0.33, x1 - 0.33]) box(marker, x - 0.02, PIT + 1.15, z - 0.04, x + 0.02, PIT + 1.25, z + 0.04, { cast: false });
    }
  }
  // the tunnel mouths: closed to people on foot, opened for a train going through
  const gates = [];
  for (const st of STATIONS) for (let d = 0; d < 2; d++) for (const z of [st.mouth[0] - 2, st.mouth[1] + 2]) {
    const x0 = st.ox + st.tx[d] - 2.3, x1 = st.ox + st.tx[d] + 2.3, PIT = st.py - PIT_D;
    const b = physics.addBox(new Box(x0, PIT, z - 0.2, x1, PIT + 5.5, z + 0.2));
    b.dynamic = true; b.pass = true; b.hidden = true;
    gates.push({ b, st, d, z, x0, x1 });
  }

  const levels = [];
  // ---------- Pioneer Square: the brick vault under the plaza ----------
  function pioneer(st, si) {
    const { ox, py } = st, X = (x) => ox + x, PIT = py - PIT_D, TOP = PIT + TUN_H, [m0, m1] = st.mouth;
    plane(M.cobble, 64, 66, X(4), -11, 0.004, 0, 0xb0a698);
    for (const it of PIONEER_ITEMS) addKind(it[0] + ox, it[1], it[2], it[3], it[4], it[5], it[6], it[7], 0);
    const brick = M.brick, BT = 0xc08a70;
    // the platforms: solid down to the bed, granite-grey tops, the yellow line along the edge
    for (const [x0, x1, edge, s] of [[-6.2, 0, 0, -1], [8, 14.2, 8, 1]]) {
      wall(M.concrete, X(x0), PIT - 1, m0, X(x1), py, m1, { tint: 0x9a968e });
      put(new THREE.PlaneGeometry(0.6, m1 - m0), yellow, X(edge) + s * 0.35, py + 0.012, (m0 + m1) / 2, 0, { rx: -Math.PI / 2, grime: 0, cast: false });
    }
    // side walls (gaps where the stairwells come in), end walls round the tunnel mouth
    for (const [wx0, wx1, sx] of [[-6.5, -6.2, 1], [14.2, 14.5, -1]]) {
      const zs = P_STAIRS.filter(q => q[2] === sx).map(q => q[1]).sort((a, b) => a - b);
      let cur = m0;
      // (as wide as the stairwell: its side walls close the opening's jambs; any narrower, their ends and this wall's face shared a plane)
      for (const z of zs) { wall(brick, X(wx0), PIT, cur, X(wx1), -0.02, z - 1.2, { tint: BT, grime: 0.5 }); cur = z + 1.2; }
      wall(brick, X(wx0), PIT, cur, X(wx1), -0.02, m1, { tint: BT, grime: 0.5 });
    }
    for (const [z0, z1] of [[m0 - 0.4, m0], [m1, m1 + 0.4]]) {
      wall(brick, X(-6.5), PIT - 1, z0, X(0), -0.02, z1, { tint: BT, grime: 0.5 }); wall(brick, X(8), PIT - 1, z0, X(14.5), -0.02, z1, { tint: BT, grime: 0.5 });
      wall(brick, X(0), TOP, z0, X(8), -0.02, z1, { tint: BT, grime: 0.5 });
      box(M.stone, X(-0.6), TOP - 0.1, z0 - 0.15, X(8.6), TOP + 0.5, z1 + 0.15, { grime: 0.3 });                   // stone lintel over the mouth
      for (const x of [-0.6, 8]) box(M.stone, X(x), PIT, z0 - 0.15, X(x + 0.6), TOP - 0.1, z1 + 0.15, { grime: 0.3 });   // and its jambs
    }
    // the barrel vault (and a dark ceiling just over it, under the street)
    {
      const xa = -6.2, xb = 14.2, ys = py + 4.3, yc = -0.45, half = (xb - xa) / 2, sag = yc - ys, R = (half * half + sag * sag) / (2 * sag), cy = yc - R;
      const N = 18, a0 = Math.asin(half / R), pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = -a0 + 2 * a0 * i / N, x = 4 + R * Math.sin(a), y = cy + R * Math.cos(a), u = R * a / 1.5;
        pos.push(x, y, m0, x, y, m1); uv.push(u, 0, u, (m1 - m0) / 1.5);
        if (i) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const vault = M.vault || (M.vault = brick.clone()); vault.side = THREE.DoubleSide; vault.name = 'vault';
      put(g, vault, ox, 0, 0, 0, { grime: 0.3, tint: 0xa87a62 });
      put(new THREE.PlaneGeometry(20.4, m1 - m0), dark, X(4), -0.28, (m0 + m1) / 2, 0, { rx: Math.PI / 2, grime: 0, cast: false });
      for (let z = m0 + 4; z < m1; z += 8) box(iron, X(-6.2), ys - 0.1, z - 0.12, X(14.2), ys + 0.08, z + 0.12, { cast: false });   // iron tie rods across
    }
    // cast-iron columns between the tracks
    for (let z = m0 + 5; z < m1 - 2; z += 9) {
      put(new THREE.CylinderGeometry(0.2, 0.26, py + 4.2 - PIT, 12), iron, X(4), (PIT + py + 4.2) / 2, z, 0, { grime: 0.3 });
      box(iron, X(3.6), py + 4.0, z - 0.4, X(4.4), py + 4.3, z + 0.4);
      const c = solid(X(4), z, 0.44, 0.44, py + 4.2 - PIT, PIT, 'metal'); c.navIgnore = true;
    }
    // light: globe pendants down both platforms, a few real lights
    for (let z = m0 + 4; z < m1; z += 8) for (const x of [-3.2, 11.2]) lamp(X(x), py + 3.5, z, 0.22, 0.6);
    for (const z of [-30, -11, 8]) light(X(4), py + 3.4, z, 9, 22, 0xffe6c4);
    // names on the walls, wayfinding at the foot of each stair, arrival boards over the platforms
    for (const [x, ry] of [[-6.18, Math.PI / 2], [14.18, -Math.PI / 2]]) for (const z of [-34, -16, -4, 12]) sign(nameTex(st.name), 3.6, 0.68, X(x), py + 2.3, z, ry, 0.8);
    for (const [x, z, dir] of P_STAIRS) sign(nameTex('To street · Pioneer Place'), 2.4, 0.45, X(x + dir * (P_SW / 2 - 0.4)), py + 2.9, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0.8);
    for (const z of [-24, 2]) { board(si, 0, X(-3.2), py + 3.0, z, 0); board(si, 1, X(11.2), py + 3.0, z, 0); }
    // on the platforms: an old brick lift shaft each side (cover), benches and crates
    wall(brick, X(-6.2), py, -12.5, X(-4.4), -0.02, -9.5, { tint: BT, grime: 0.6 }); wall(brick, X(12.4), py, -12.5, X(14.2), -0.02, -9.5, { tint: BT, grime: 0.6 });
    for (const [x, z] of [[-5.6, -30], [-5.6, 4], [13.6, -30], [13.6, 4]]) { box(M.wood, X(x - 0.25), py, z - 0.9, X(x + 0.25), py + 0.45, z + 0.9, { tint: 0x8a6a4a }); solid(X(x), z, 0.5, 1.8, 0.45, py, 'wood').pass = true; }
    for (const [x, z] of [[-5.2, -21], [13.2, 14], [-5.2, 14], [13.2, -36]]) addKind(X(x), z, 1.4, 1.2, 1.2, py, 'crate', 0, 0);
    // the bots' level: the platforms, reached by the four stairwells
    const portals = P_STAIRS.map(([cx, z, dir]) => {
      const x = cx + dir * P_SW / 2, top = cx - dir * P_SW / 2;
      return { link: 0, rect: [X(Math.min(top, x)), z - 1.2, X(Math.max(top, x)), z + 1.2],
        climb: [[X(top - dir * 1.3), 0, z], [X(top + dir * 0.3), 0, z], [X(cx), py / 2, z], [X(x - dir * 0.3), py, z], [X(x + dir * 1.3), py, z]] };
    });
    levels.push({ y: py, bounds: { minX: X(-7), maxX: X(15), minZ: m0 - 1, maxZ: m1 + 1 }, portals });
  }

  // ---------- Symphony: the grand hall ----------
  function symphony(st, si) {
    const { ox, py } = st, X = (x) => ox + x, PIT = py - PIT_D, TOP = PIT + TUN_H, [m0, m1] = st.mouth;
    const [hx0, hz0, hx1, hz1] = S_HALL, HH = 12;
    const stone = M.cream, deck = M.terrazzo, ST = 0xffffff, CREAM = 0xf6f2ea;
    plane(deck, hx1 - hx0, hz1 - hz0, X((hx0 + hx1) / 2), (hz0 + hz1) / 2, 0.004, 0, 0xc8c0b0);
    for (const it of SYMPHONY_ITEMS) addKind(it[0] + ox, it[1], it[2], it[3], it[4], it[5], it[6], it[7], 0);
    // the hall's walls, its two tunnel mouths in each end wall, the roof
    wall(stone, X(hx0 - 0.5), PIT, hz0 - 0.5, X(hx0), HH, hz1 + 0.5, { tint: ST }); wall(stone, X(hx1), PIT, hz0 - 0.5, X(hx1 + 0.5), HH, hz1 + 0.5, { tint: ST });
    for (const [z0, z1] of [[hz0 - 0.5, hz0], [hz1, hz1 + 0.5]]) {
      wall(stone, X(hx0), PIT, z0, X(-3), HH, z1, { tint: ST }); wall(stone, X(0), PIT, z0, X(8), HH, z1, { tint: ST }); wall(stone, X(11), PIT, z0, X(hx1), HH, z1, { tint: ST });
      for (const [a, b] of [[-3, 0], [8, 11]]) wall(stone, X(a), TOP, z0, X(b), HH, z1, { tint: ST });
      box(stone, X(-3.6), TOP - 0.2, z0 - 0.2, X(11.6), TOP + 0.6, z1 + 0.2, { tint: 0xe4dccc });   // a moulded band over the mouths
    }
    box(dark, X(hx0 - 0.5), HH, hz0 - 0.5, X(hx1 + 0.5), HH + 0.5, hz1 + 0.5);                        // the roof (shuts out the sun)
    put(new THREE.PlaneGeometry(hx1 - hx0, hz1 - hz0), stone, X((hx0 + hx1) / 2), HH - 0.01, (hz0 + hz1) / 2, 0, { rx: Math.PI / 2, grime: 0, cast: false, tint: CREAM });
    for (let x = hx0 + 4; x < hx1; x += 8) box(stone, X(x - 0.25), HH - 0.7, hz0, X(x + 0.25), HH, hz1, { tint: ST, cast: false });   // coffered ceiling
    for (let z = hz0 + 4; z < hz1; z += 8) box(stone, X(hx0), HH - 0.7, z - 0.25, X(hx1), HH, z + 0.25, { tint: ST, cast: false });
    // galleries along both long walls, on stone columns; the two footbridges between them over the tracks
    const gal = [[hx0, -S_GAL], [S_GAL + 8, hx1]];
    for (const [a, b] of gal) wall(deck, X(a), GY - 0.4, hz0, X(b), GY, hz1, { uv: 2.4 });
    for (const [z0, z1] of S_BRIDGES) wall(deck, X(-S_GAL), GY - 0.4, z0, X(S_GAL + 8), GY, z1, { uv: 2.4 });
    for (const [gx, s] of [[-S_GAL, 1], [S_GAL + 8, -1]]) {
      for (const z of [-36, -27, -18, -4, 4]) {
        wall(stone, X(gx - 0.35) - s * 0.15, 0, z - 0.35, X(gx + 0.35) - s * 0.15, GY - 0.4, z + 0.35, { tint: ST });
        box(stone, X(gx - 0.5) - s * 0.15, GY - 0.8, z - 0.5, X(gx + 0.5) - s * 0.15, GY - 0.4, z + 0.5, { tint: 0xd8ccb8 });
      }
    }
    // stairs: from the island up to each bridge, from each side hall up to its gallery
    const fl = [
      ['z', -22.2, S_BRIDGES[0][1], 2.7, 5.3], ['z', 0.2, S_BRIDGES[1][0], 2.7, 5.3],
      ['x', -9, -S_GAL, -13.3, -10.7], ['x', 17, S_GAL + 8, -13.3, -10.7],
    ];
    const portals = [];
    for (const [ax, lo, hi, c0, c1] of fl) {
      const L = ax === 'x' ? [X(lo), X(hi), c0, c1] : [lo, hi, X(c0), X(c1)];
      flight(ax, L[0], L[1], L[2], L[3], 0, GY, deck, ST);
      portals.push(flightPortal(ax, L[0], L[1], L[2], L[3], 0, GY));
    }
    // railings: the galleries' open edges and both sides of each bridge, open where stairs and bridges join
    for (const [gx] of [[-S_GAL], [S_GAL + 8]]) railingRun('z', X(gx), hz0, hz1, GY, [...S_BRIDGES, [-13.3, -10.7]]);
    railingRun('x', S_BRIDGES[0][0], X(-S_GAL), X(S_GAL + 8), GY); railingRun('x', S_BRIDGES[0][1], X(-S_GAL), X(S_GAL + 8), GY, [[X(2.7), X(5.3)]]);
    railingRun('x', S_BRIDGES[1][0], X(-S_GAL), X(S_GAL + 8), GY, [[X(2.7), X(5.3)]]); railingRun('x', S_BRIDGES[1][1], X(-S_GAL), X(S_GAL + 8), GY);
    // a ticket office in each side hall (cover by the spawns): low walls with glass over them
    for (const [x0, x1] of [[-13, -8], [16, 21]]) {
      for (const [a, b, c, d] of [[x0, 5, x1, 5.3], [x0, 12.7, x1, 13], [x0, 5, x0 + 0.3, 13], [x1 - 0.3, 5, x1, 13]]) wall(stone, X(a), 0, b, X(c), 1.1, d, { tint: ST });
      box(glass, X(x0), 1.1, 5, X(x1), 2.6, 13, { cast: false }); solid(X((x0 + x1) / 2), 9, x1 - x0, 8, 1.5, 1.1, 'metal').pass = true;
      box(stone, X(x0 - 0.1), 2.6, 4.9, X(x1 + 0.1), 3.0, 13.1, { tint: ST });
    }
    // an information booth in the middle of the island (cover for the train doors either side)
    wall(stone, X(2.8), 0, -16.4, X(5.2), 1.1, -13.6, { tint: 0xe4dccc });
    box(glass, X(2.8), 1.1, -16.4, X(5.2), 2.3, -13.6, { cast: false }); solid(X(4), -15, 2.4, 2.8, 1.2, 1.1, 'metal').pass = true;
    box(M.dark, X(2.7), 2.3, -16.5, X(5.3), 2.55, -13.5);
    sign(nameTex('Information'), 2.2, 0.41, X(4), 2.1, -16.43, Math.PI, 0.7); sign(nameTex('Information'), 2.2, 0.41, X(4), 2.1, -13.57, 0, 0.7);
    // ticket machines along the side halls
    for (const [x, z] of [[-4.6, -26], [-4.6, -24.6], [-4.6, 3], [12.6, -26], [12.6, -24.6], [12.6, 3]]) {
      wall(M.dark, X(x - 0.35), 0, z - 0.5, X(x + 0.35), 1.85, z + 0.5, { surf: 'metal' });
      put(new THREE.PlaneGeometry(0.6, 0.4), lampMat, X(x) + (x < 4 ? 0.36 : -0.36), 1.35, z, x < 4 ? Math.PI / 2 : -Math.PI / 2, { grime: 0, cast: false });
    }
    // overhead line hung from the ceiling over each track
    for (let z = hz0 + 3; z < hz1; z += 10) for (const tx of st.tx) box(steel, X(tx) - 0.02, TOP - 0.08, z - 0.02, X(tx) + 0.02, HH - 0.7, z + 0.02, { cast: false });
    // light: rows of big globes hung from the ceiling, a few real lights
    for (let z = hz0 + 6; z < hz1; z += 12) for (const x of [-12, 4, 20]) lamp(X(x), 8.6, z, 0.45, HH - 0.7 - 8.6 - 0.45);
    for (const [x, y, z] of [[4, 7.5, -24], [4, 7.5, 4], [-12, 7, -11], [20, 7, -11]]) light(X(x), y, z, 10, 26, 0xfff0dc);
    // signs: the name over both mouths, on the galleries' fronts; arrival boards on the bridges facing the island
    for (const [z, ry] of [[hz0 + 0.02, 0], [hz1 - 0.02, Math.PI]]) sign(nameTex(st.name), 9, 1.7, X(4), 8.4, z, ry, 0.9);
    for (const z of [-24, 2]) { sign(nameTex(st.name), 3.4, 0.64, X(-S_GAL) + 0.03, GY - 1.1, z, Math.PI / 2, 0.8); sign(nameTex(st.name), 3.4, 0.64, X(S_GAL + 8) - 0.03, GY - 1.1, z, -Math.PI / 2, 0.8); }
    for (const [z, ry] of [[S_BRIDGES[0][1] + 0.05, 0], [S_BRIDGES[1][0] - 0.05, Math.PI]]) { board(si, 0, X(1.0), GY - 0.75, z, ry, false); board(si, 1, X(7.0), GY - 0.75, z, ry, false); }
    // concert posters along the side walls
    const poster = canvasTex(256, 384, (g, w, h) => {
      g.fillStyle = '#1b1530'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8b25a'; g.fillRect(14, 14, w - 28, 4); g.fillRect(14, h - 18, w - 28, 4);
      g.fillStyle = '#f2e6c8'; g.font = `bold 30px ${FONT}`; g.textAlign = 'center'; g.fillText('SEATTLE', w / 2, 70); g.fillText('SYMPHONY', w / 2, 106);
      g.font = `22px ${FONT}`; g.fillText('BENAROYA HALL', w / 2, 150); g.fillStyle = '#d8b25a'; g.font = `bold 46px ${FONT}`; g.fillText('MAHLER 5', w / 2, 250);
      g.fillStyle = '#f2e6c8'; g.font = `20px ${FONT}`; g.fillText('TONIGHT · 7:30 PM', w / 2, 300);
    });
    for (const z of [-30, -6, 10]) { sign(poster, 1.4, 2.1, X(hx0) + 0.03, 1.8, z, Math.PI / 2, 0.5); sign(poster, 1.4, 2.1, X(hx1) - 0.03, 1.8, z, -Math.PI / 2, 0.5); }
    levels.push({ y: GY, bounds: { minX: X(hx0 - 0.5), maxX: X(hx1 + 0.5), minZ: hz0 - 0.5, maxZ: hz1 + 0.5 }, portals });
  }

  // ---------- Chinatown-ID: open air ----------
  const crossLamps = [];
  function chinatown(st, si) {
    const { ox, py } = st, X = (x) => ox + x, PIT = py - PIT_D, TOP = PIT + TUN_H, [m0, m1] = st.mouth;
    plane(M.concrete, 64, 66, X(4), -11, 0.004, 0, 0xb0aaa0);
    for (const it of CHINATOWN_ITEMS) addKind(it[0] + ox, it[1], it[2], it[3], it[4], it[5], it[6], it[7], 1);
    // the portals: a concrete headwall over each mouth, set into the row of buildings
    for (const [z0, z1, face] of [[-51, -44, -44], [22, 29, 22]]) {
      box(M.concrete, X(-1), TOP + 0.3, z0, X(9), 24, z1, { tint: 0x9a968e, grime: 0.5 });   // (on top of the tunnel's roof slab)
      const f = face === -44 ? -1 : 1;
      for (const x of [-1.5, 8.3]) wall(M.concrete, X(x), PIT, face - (f < 0 ? 0 : 0.5), X(x + 1.2), TOP + 0.9, face + (f < 0 ? 0.5 : 0), { tint: 0x8a8680, grime: 0.4 });
      box(M.concrete, X(-1.5), TOP, face - (f < 0 ? 0 : 0.5), X(9.5), TOP + 0.9, face + (f < 0 ? 0.5 : 0), { tint: 0x8a8680, grime: 0.4 });
      sign(nameTex(st.name), 6, 1.12, X(4), TOP + 2.0, face - f * 0.02, f < 0 ? 0 : Math.PI, 0.6);
    }
    // overhead line: a pole between the tracks every 12 m with a cantilever out to each contact wire
    for (let z = m0 + 4; z < m1 - 2; z += 12) {
      if (z > C_CROSS[0] - 2 && z < C_CROSS[1] + 2) continue;
      wall(M.dark, X(3.85), PIT, z - 0.15, X(4.15), TOP + 0.9, z + 0.15, { surf: 'metal' }).navIgnore = true;
      for (const tx of st.tx) {
        box(steel, Math.min(X(4), X(tx)), TOP + 0.6, z - 0.03, Math.max(X(4), X(tx)), TOP + 0.66, z + 0.03, { cast: false });
        box(steel, X(tx) - 0.015, TOP - 0.08, z - 0.015, X(tx) + 0.015, TOP + 0.62, z + 0.015, { cast: false });
      }
    }
    // the level crossing: rubber panels between the rails, signals both sides that flash while a train is near
    put(new THREE.PlaneGeometry(8, C_CROSS[1] - C_CROSS[0]), M.rubber, X(4), 0.008, (C_CROSS[0] + C_CROSS[1]) / 2, 0, { rx: -Math.PI / 2, grime: 0.3, cast: false });
    for (const tx of st.tx) for (const o of [-0.72, 0.72]) box(steel, X(tx + o - 0.04), 0, C_CROSS[0], X(tx + o + 0.04), 0.012, C_CROSS[1], { cast: false });
    for (const [x, z, ry] of [[-0.8, C_CROSS[0] - 0.8, 0], [8.8, C_CROSS[1] + 0.8, Math.PI]]) {
      put(new THREE.CylinderGeometry(0.07, 0.08, 3.2, 8), M.dark, X(x), 1.6, z, 0, { grime: 0.2 });
      solid(X(x), z, 0.2, 0.2, 3.2, 0, 'metal').pass = true;
      // a white crossbuck and two red lamps on a black backboard
      for (const r of [0.6, -0.6]) put(flatBox(1.3, 0.18, 0.03, 0), std({ color: 0xf2f2ee, roughness: 0.6 }), X(x), 2.9, z, ry, { rz: r, grime: 0 });
      box(M.dark, X(x - 0.55), 1.95, z - 0.04, X(x + 0.55), 2.35, z + 0.04, { cast: false });
      for (const s of [-1, 1]) {
        const m = new THREE.MeshStandardMaterial({ color: 0x400808, emissive: 0xff2010, emissiveIntensity: 0 });
        const L = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14), m); L.rotation.x = Math.PI / 2; L.position.set(X(x + s * 0.32), 2.15, z + (ry ? -0.06 : 0.06)); group.add(L);
        crossLamps.push({ m, s });
      }
    }
    // canopies over both platforms (z -32..8): steel posts on the outer edge, a glass-and-steel roof
    for (const [px, r0, r1] of [[-5.7, -6.6, 0.4], [13.7, 7.6, 14.6]]) {
      for (let z = -30; z <= 6; z += 9) { wall(M.dark, X(px - 0.12), 0, z - 0.12, X(px + 0.12), 4.0, z + 0.12, { surf: 'metal', pass: true }); }
      box(M.dark, X(r0), 4.0, -32, X(r1), 4.15, 8, { cast: true });
      box(steel, X(r0), 3.85, -32, X(r0 + 0.12), 4.0, 8, { cast: false }); box(steel, X(r1 - 0.12), 3.85, -32, X(r1), 4.0, 8, { cast: false });
      for (let z = -28; z <= 6; z += 6) lamp(X((r0 + r1) / 2), 3.7, z, 0.16, 0);
      for (const z of [-22, 0]) board(si, px < 4 ? 0 : 1, X((r0 + r1) / 2 + (px < 4 ? 0.6 : -0.6)), 3.3, z, 0);
      for (const z of [-26, -6, 6]) sign(nameTex(st.name), 2.6, 0.49, X(px) + (px < 4 ? 0.14 : -0.14), 2.4, z, px < 4 ? Math.PI / 2 : -Math.PI / 2, 0.7);
      // benches and ticket machines on the platforms
      for (const z of [-24, -2]) { const bx = px < 4 ? px + 0.6 : px - 0.6; box(M.wood, X(bx - 0.25), 0, z - 0.9, X(bx + 0.25), 0.45, z + 0.9, { tint: 0x8a6a4a }); solid(X(bx), z, 0.5, 1.8, 0.45, 0, 'wood').pass = true; }
      wall(M.dark, X(px - 0.35) + (px < 4 ? 0.5 : -0.5), 0, -13.5, X(px + 0.35) + (px < 4 ? 0.5 : -0.5), 1.85, -12.5, { surf: 'metal' });
    }
    // the footbridge over the north end: deck on two piers, glass sides, stairs down to both sides of the market
    const [bx0, bz0, bx1, bz1] = C_BRIDGE;
    wall(M.concrete, X(bx0), GY - 0.4, bz0, X(bx1), GY, bz1, { tint: 0xb0aca4 });
    for (const x of [-4, 12]) wall(M.concrete, X(x - 0.3), 0, bz0 + 0.9, X(x + 0.3), GY - 0.4, bz1 - 0.9, { tint: 0xa8a49c });
    const portals = [];
    for (const [c0, c1] of [[-11.3, -8.7], [16.7, 19.3]]) {
      flight('z', -27.5, bz1, X(c0), X(c1), 0, GY, M.concrete, 0xb0aca4);
      portals.push(flightPortal('z', -27.5, bz1, X(c0), X(c1), 0, GY));
    }
    railingRun('x', bz0, X(bx0), X(bx1), GY); railingRun('x', bz1, X(bx0), X(bx1), GY, [[X(-11.3), X(-8.7)], [X(16.7), X(19.3)]]);
    railingRun('z', X(bx0), bz0, bz1, GY); railingRun('z', X(bx1), bz0, bz1, GY);
    // the Chinatown gate over the west market: two red columns, a lintel, a green tiled roof
    const red = std({ color: 0xb02020, roughness: 0.5 }), gold = std({ color: 0xd8a830, roughness: 0.4, metalness: 0.4 });
    for (const x of [-24, -14]) { put(new THREE.BoxGeometry(0.9, 7, 0.9), red, X(x), 3.5, -16, 0, { grime: 0 }); solid(X(x), -16, 0.9, 0.9, 7, 0, 'wood'); }
    put(new THREE.BoxGeometry(12, 0.7, 1.1), red, X(-19), 6.6, -16, 0, { grime: 0 });
    put(new THREE.BoxGeometry(14, 0.35, 2.4), std({ color: 0x2f6a4a, roughness: 0.6 }), X(-19), 7.3, -16, 0, { grime: 0 });
    put(new THREE.BoxGeometry(3.6, 1.0, 0.12), gold, X(-19), 5.6, -15.4, 0, { grime: 0 });
    // red lanterns strung over both halves of the market
    const lantern = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0xff3020, emissiveIntensity: 1.8 });
    for (const [xa, xb] of [[-26, -8], [16, 34]]) for (let x = xa; x <= xb; x += 4.5) for (const z of [-28, -20, -6]) {
      put(new THREE.SphereGeometry(0.28, 10, 8), lantern, X(x), 5.2 + Math.sin(x) * 0.2, z, 0, { grime: 0, cast: false }); glows.push([X(x), 5.2, z, 0.9]);
    }
    levels.push({ y: GY, bounds: { minX: X(bx0 - 0.5), maxX: X(bx1 + 0.5), minZ: bz0 - 0.5, maxZ: bz1 + 0.5 }, portals });
  }

  STATIONS.forEach((st, si) => { trackwork(st); [pioneer, symphony, chinatown][si](st, si); });

  // ---------- the trains: three per line, one at each station, moving in lockstep ----------
  const LOCAL = carBoxes();
  const trains = [];
  for (let d = 0; d < 2; d++) for (let k = 0; k < 3; k++) {
    const car = makeCar(d);
    group.add(car.group);
    const boxes = LOCAL.map(([x0, y0, z0, x1, y1, z1, f]) => {
      const b = physics.addBox(new Box(9000, y0, 9000, 9001, y1, 9001));
      b.dynamic = true; b.surface = 'metal'; if (f && f.pass) b.pass = true;
      return { b, x0, x1, y0, y1, z0, z1, door: f && f.door };
    });
    trains.push({ d, k, car, boxes, x: null, y: 0, z: null, open: 0, v: 0, at: -1, phase: '' });
  }

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
  const inside = (tr, p, x = tr.x, z = tr.z, y = tr.y) => x !== null && Math.abs(p.x - x) < H - 0.05 && Math.abs(p.z - z) < L2 - 0.25 && p.y > y - 0.4 && p.y < y + T_TOP;
  let game = null, flash = 0;
  const world = {};
  function update(dt, t, clock) {
    game = (this && this.game) || game;   // (called as the world's method: the game sets world.game)
    for (const tr of trains) {
      const s = stateOf(tr, clock);
      const st = STATIONS[s.st], X = st.ox + st.tx[tr.d], Y = st.py, Z = s.z;
      // carry everyone aboard by however far the car moved (or was handed over to the next tunnel)
      if (tr.x !== null && game && (X !== tr.x || Z !== tr.z || Y !== tr.y)) {
        const dx = X - tr.x, dy = Y - tr.y, dzz = Z - tr.z;
        // (not other players on a guest's screen: their positions come from the host, already carried)
        for (const c of game.characters) if (c.alive && !c.puppet && inside(tr, c.pos)) { c.pos.x += dx; c.pos.y += dy; c.pos.z += dzz; if (c.prevPos) { c.prevPos.x += dx; c.prevPos.y += dy; c.prevPos.z += dzz; } }
      }
      tr.x = X; tr.y = Y; tr.z = Z; tr.v = s.v; tr.at = s.v === 0 ? s.st : -1; tr.st = s;
      tr.car.group.position.set(X, Y, Z);
      tr.car.group.rotation.y = DIRZ[tr.d] > 0 ? 0 : Math.PI;
      // doors: slide open over half a second, on the platform's side
      const want = s.open ? 1 : 0, ds = st.doors[tr.d];
      tr.open += Math.sign(want - tr.open) * Math.min(Math.abs(want - tr.open), dt * 2.2);
      const side = ds * (DIRZ[tr.d] > 0 ? 1 : -1);   // in the car's own (turned) frame
      for (const sx of [-1, 1]) for (const g of tr.car.doors[sx]) g.position.z = g.userData.d + g.userData.leaf * DW / 2 * (1 + (sx === side ? 2 * tr.open * 0.95 : 0));
      for (const bx of tr.boxes) {
        const gone = bx.door === ds && tr.open > 0.6;   // an open doorway: walk through
        bx.b.minx = gone ? 9000 : X + bx.x0; bx.b.maxx = gone ? 9001 : X + bx.x1;
        bx.b.miny = Y + bx.y0; bx.b.maxy = Y + bx.y1;
        bx.b.minz = Z + bx.z0; bx.b.maxz = Z + bx.z1;
      }
      // sounds: door motors and the chime, the horn pulling out, the bell running in, brakes at the stop; under
      // way the traction motors' whine (rising as it speeds up, falling as it slows) and the clack of the rail
      // joints; and the announcements (recordings: see docs/voice-lines.md), on board and on the platform
      const ph = s.v === 0 ? (s.open ? 'open' : 'shut') : s.arriving ? 'in' : 'out';
      if (ph !== tr.phase) {
        const pos = new THREE.Vector3(X, Y + 1.5, Z), here = STATION_KEY[s.st], nxt = STATION_KEY[s.next];
        const plat = new THREE.Vector3(X + ds * 3, Y + 1.6, Z);   // the platform beside the doors
        // as Link does it: pulling out, "please hold on", then the next stop with its transfers and which side its
        // doors open on (facing the way the car runs: facing +z, your right is -x); the station's name on arrival;
        // "please stand clear" as the doors close; the platform PA as a train runs in
        const side2 = STATIONS[s.next].doors[tr.d] === (DIRZ[tr.d] > 0 ? -1 : 1) ? 'right' : 'left';
        if (ph === 'open') sounds.push(['traindoor', pos], ['trainchime', pos], ['vo', pos, { id: `vo/link/this_is_${here}` }]);
        if (ph === 'shut' && tr.phase === 'open') sounds.push(['trainchime', pos], ['traindoor', pos, { close: true }], ['vo', pos, { id: 'vo/link/doors_closing' }], ['vo', plat, { id: 'vo/link/doors_closing' }]);
        if (ph === 'shut' && tr.phase === 'in') sounds.push(['trainbrake', pos]);
        if (ph === 'out' && tr.phase === 'shut') sounds.push(['trainhorn', pos], ['vo', pos, { id: 'vo/link/hold_on', delay: 0.6 }], ['vo', pos, { id: `vo/link/next_${nxt}_${side2}`, delay: 3.5 }]);
        if (ph === 'in') sounds.push(['trainbell', pos], ['vo', plat, { id: `vo/link/pa_arriving_${STATION_KEY[s.next]}` }]);
        tr.phase = ph;
      }
      if (s.v > 0.5) {
        tr.rumble = (tr.rumble || 0) - dt;
        if (tr.rumble <= 0) { tr.rumble = 0.38; sounds.push(['trainmotor', new THREE.Vector3(X, Y + 0.4, Z), { speed: s.v, acc: s.arriving ? -1 : s.v < VMAX - 0.2 ? 1 : 0 }]); }
        tr.clack = (tr.clack || 0) + s.v * dt;
        if (tr.clack > 18 && s.v > 4) { tr.clack = 0; for (const e of [-1, 1]) sounds.push(['trainclack', new THREE.Vector3(X, Y, Z + e * (L2 - 3))]); }
      }
    }
    // tunnel mouths open while a train is near them
    for (const gt of gates) {
      const near = trains.some(tr => tr.d === gt.d && tr.x !== null && Math.abs(tr.x - (gt.x0 + gt.x1) / 2) < 3 && Math.abs(tr.z - gt.z) < L2 + 12);
      gt.b.minx = near ? 9000 : gt.x0; gt.b.maxx = near ? 9001 : gt.x1;
    }
    // Chinatown's crossing: the lamps flash in turn while a train is within 40 m of it (or across it)
    const cz = (C_CROSS[0] + C_CROSS[1]) / 2;
    const ringing = trains.some(tr => tr.st && tr.st.st === 2 && Math.abs(tr.z - cz) < L2 + 40 && (tr.v > 0 || Math.abs(tr.z - cz) < L2 + 2));
    flash += dt;
    const on = ringing ? (Math.floor(flash * 2.4) % 2) : -1;
    for (const l of crossLamps) l.m.emissiveIntensity = on < 0 ? 0 : ((l.s > 0) === (on === 1) ? 5 : 0.1);
    // the arrival boards: where the next train on each line goes, and when
    for (const bd of boards) {
      const next = STATIONS[NEXT[bd.d][bd.si]].short;
      const p = ((clock + LINE_OFFSET[bd.d]) % LEG + LEG) % LEG;
      const txt = p < DWELL - 3 ? 'BOARDING' : p < DWELL ? 'CLOSING' : LEG - p < 10 ? 'ARRIVING' : `${Math.ceil(LEG - p)} s`;
      const dest = `TO ${next}`;
      if (txt + dest === bd.last) continue;
      bd.last = txt + dest;
      const g = bd.c.getContext('2d');
      g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 128);
      lineBullet(g, 52, 64, 34);
      g.fillStyle = '#ffb21e'; g.font = `bold ${dest.length > 14 ? 28 : 38}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(dest, 100, 64);
      g.textAlign = 'right'; g.font = `bold 38px ${FONT}`; g.fillText(txt, 496, 64);
      bd.tex.needsUpdate = true;
    }
  }
  // a moving train hits anyone in its path (not the people riding in it)
  function trainHit(p) {
    for (const tr of trains) {
      if (tr.v < 0.3 || tr.x === null) continue;
      if (Math.abs(p.x - tr.x) > H + 0.3 || Math.abs(p.z - tr.z) > L2 + 0.4 || p.y > tr.y + T_TOP + 1.5 || p.y < tr.y - PIT_D - 1) continue;
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
      const ax = sa.ox + sa.tx[tr.d], az = a.z;
      if (!inside(tr, p, ax, az, sa.py)) continue;
      const b = stateOf(tr, to), sb = STATIONS[b.st];
      out.set(sb.ox + sb.tx[tr.d] - ax, sb.py - sa.py, b.z - az);
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
    // down in a track bed (knocked in, or a boarding cut short): out onto the nearest platform before anything else
    if (!ride) {
      const si = stationOf(b.pos), st = STATIONS[si];
      if (st && b.pos.y < st.py - 0.45 && b.pos.y > st.py - PIT_D - 0.6) {
        const lx = b.pos.x - st.ox, bed = beds(st).find(([a, c]) => lx > a - 0.2 && lx < c + 0.2);
        if (bed) {
          const edge = lx - bed[0] < bed[1] - lx ? bed[0] : bed[1], out = edge === bed[0] ? -1 : 1;
          const dist = Math.abs(lx - edge);
          br.ride = null;
          return { wish: _w.set(out, 0, 0), sprint: false, jump: dist < 0.9 };
        }
      }
    }
    const toward = (x, z, k = 1) => _w.set(x - b.pos.x, 0, z - b.pos.z).normalize().multiplyScalar(k);
    if (ride) {
      const s = ride.st, gs = goal ? stationOf(goal) : -1;
      br.ride = br.ride || { from: s.st, door: DOORS[(Math.random() * 4) | 0] };
      const dz = DIRZ[ride.d], side = STATIONS[s.st].doors[ride.d];
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
    const d = NEXT[0][here] === gs ? 0 : 1, st = STATIONS[here], side = st.doors[d];
    if (!br.ride || br.ride.d !== d || br.ride.st !== here) br.ride = { d, st: here, door: DOORS[(Math.random() * 4) | 0], from: here };
    const tx = st.ox + st.tx[d], doorZ = STOP_Z + br.ride.door * DIRZ[d];
    const waitX = tx + side * (H + 1.4);
    const train = trains.find(tr => tr.d === d && tr.at === here);
    const onPlatform = Math.abs(b.pos.y - st.py) < 0.6 && Math.abs(b.pos.x - waitX) < 3.5 && Math.abs(b.pos.z - doorZ) < 6;
    if (onPlatform && train && train.open > 0.6 && train.st.dwell < DWELL - 2.5) {
      // board: through the door and into the car
      if (Math.abs(b.pos.x - tx) > H + 0.2) return { wish: toward(tx, doorZ), sprint: true };
      return { wish: toward(tx, doorZ + 1.3 * DIRZ[d], 0.6) };
    }
    // otherwise go and wait on the right platform, by a door
    _t.set(waitX, st.py, doorZ);
    if (br.rideKey !== `${d}${here}`) { br.rideKey = `${d}${here}`; br.repathT = 0; br.path = []; }
    if (onPlatform && Math.hypot(b.pos.x - waitX, b.pos.z - doorZ) < 1.2) return { wish: _w.set(0, 0, 0) };
    // only along a path: straight at the wait spot was straight across the tracks when it was on the far platform
    const dir = br.followPath(_t, dt);
    if (dir) return { wish: _w.copy(dir), sprint: true };
    return Math.hypot(b.pos.x - waitX, b.pos.z - doorZ) < 2.5 && Math.abs(b.pos.y - st.py) < 0.6 ? { wish: toward(waitX, doorZ, 0.5) } : null;
  }

  // how well a train's sound reaches you (0..1; the rest is muffled): not at all from another station; riding,
  // the car is sealed, so its own motors and rails are a hum through the floor (its announcements stay clear) and
  // anything outside is faint; a train in the tunnel only near the mouth, or with you in the tunnel; not from
  // up on Pioneer Square's plaza when it's in the hall below (a little at the top of a stairwell); and it fades
  // out across the station instead of carrying everywhere
  const audible = (pos, ear, name) => {
    const a = stationOf(pos), b = stationOf(ear);
    if (a < 0 || a !== b) return 0;
    const st = STATIONS[a], quiet = name === 'trainmotor' || name === 'trainclack' || name === 'trainbrake';
    const ride = trains.find(tr => inside(tr, ear));
    if (ride) return Math.abs(pos.x - ride.x) < H + 0.6 && Math.abs(pos.z - ride.z) < L2 + 1 ? (quiet ? 0.22 : 1) : 0.12;
    let k = 1;
    const tunnel = (p) => p.z < st.mouth[0] - 2 || p.z > st.mouth[1] + 2;
    if (tunnel(pos) && !tunnel(ear)) k *= 0.5 * Math.max(0, 1 - Math.min(Math.abs(pos.z - st.mouth[0]), Math.abs(pos.z - st.mouth[1])) / 25);
    if (a === 0 && (pos.y < -2) !== (ear.y < -2.5)) k *= P_STAIRS.some(([x, z]) => Math.hypot(ear.x - (st.ox + x), ear.z - z) < 7) ? 0.25 : 0;
    const d = pos.distanceTo(ear);
    return k * (d < 20 ? 1 : Math.max(0, 1 - (d - 20) / 40));
  };
  // rooms for the reverb: Symphony's hall, Pioneer's vault, any tunnel
  const indoorAt = (p) => {
    const si = stationOf(p), st = STATIONS[si];
    if (!st) return 0;
    if (p.z < st.mouth[0] || p.z > st.mouth[1]) return 1;
    return si === 1 || (si === 0 && p.y < -1.5) ? 1 : 0;
  };
  // ---------- how each place sounds ----------
  // the space you're in, for its echo: a car, a tunnel, Pioneer's brick vault (its plaza is street), Symphony's
  // hall, Chinatown's open-air platforms
  const tunnelDepth = (p, st) => Math.max(st.mouth[0] - p.z, p.z - st.mouth[1], 0);
  const spaceAt = (p) => {
    const si = stationOf(p), st = STATIONS[si];
    if (!st) return 'street';
    if (trains.some(tr => inside(tr, p))) return 'car';
    if (tunnelDepth(p, st) > 1) return 'tunnel';
    return si === 0 ? (p.y < -1.5 ? 'vault' : 'street') : si === 1 ? 'hall' : 'open';
  };
  // how much of a station you hear from where you are (0..1): all of the one you're in; riding down a tunnel the
  // station behind fades away, and past the hand-over the next one fades up as the train runs in. (Whatever's
  // within 20 m, your own car and whoever's in it, stays at full.)
  const presence = (ear, si) => stationOf(ear) !== si ? 0 : Math.max(0, 1 - tunnelDepth(ear, STATIONS[si]) / 75);
  const areaGain = (pos, ear) => {
    const si = stationOf(pos);
    if (si < 0 || pos.distanceTo(ear) < 20) return 1;
    return presence(ear, si);
  };
  // each place's background: traffic over Chinatown and Pioneer's plaza, the city rumbling through Pioneer's vault,
  // Symphony's air handling, the tunnel's rumble; quieter from inside a car (it's sealed)
  const ambience = (ear) => {
    const si = stationOf(ear), st = STATIONS[si];
    if (!st) return {};
    const k = presence(ear, si), sealed = trains.some(tr => inside(tr, ear)) ? 0.35 : 1, out = {};
    out[si === 0 ? (ear.y < -1.5 ? 'vault' : 'city') : si === 1 ? 'hall' : 'city'] = k * sealed;
    out.tunnel = Math.min(1, tunnelDepth(ear, st) / 25) * sealed;
    return out;
  };
  Object.assign(world, {
    update, trainHit, trainShift, sounds, botTravel, upper: levels, trains, stationOf, audible, indoorAt, spaceAt, areaGain, ambience,
    sameArea: (a, b) => stationOf(a) === stationOf(b),
    // the menu's live view: Symphony's hall from the north gallery, over the island as the trains come and go
    menuCam(t, cam) { cam.position.set(STATIONS[1].ox - 21 + Math.sin(t * 0.2) * 1.5, GY + 1.7, -30 + Math.sin(t * 0.13) * 4); cam.lookAt(STATIONS[1].ox + 4, 1.2, -6); },
    // spawns face into their station (the west clusters east, the east clusters west)
    spawnYaw: [-Math.PI / 2, Math.PI / 2],
    // anyone spawns anywhere, at the start too: any level of any station, never on the tracks or in a tunnel,
    // facing into the station
    randomSpawns: true,
    spawnOk: (p) => {
      const si = stationOf(p), st = STATIONS[si];
      if (!st || p.z < st.mouth[0] + 3 || p.z > st.mouth[1] - 3) return false;
      return !(Math.abs(p.y - st.py) < 1.5 && st.tx.some(x => Math.abs(p.x - (st.ox + x)) < 2.8));
    },
    spawnYawAt: (p) => { const st = STATIONS[stationOf(p)] || STATIONS[1]; return Math.atan2(p.x - (st.ox + 4), p.z - STOP_Z); },
  });
  return world;
}

// openings in the ground (Pioneer's stairwells, the track beds at street level) and lids (Pioneer's hall roof)
const holes = [], lids = [];
{
  const P = STATIONS[0], S = STATIONS[1], C = STATIONS[2];
  for (const [x, z] of P_STAIRS) holes.push([P.ox + x - P_SW / 2, z - 1.2, P.ox + x + P_SW / 2, z + 1.2]);
  lids.push([P.ox + P_HALL[0], P_HALL[1], P.ox + P_HALL[2], P_HALL[3]]);
  for (const [a, b] of [[-3, 0], [8, 11]]) holes.push([S.ox + a, S.mouth[0] - 3, S.ox + b, S.mouth[1] + 3]);
  holes.push([C.ox, C.mouth[0] - 3, C.ox + 8, C_CROSS[0]], [C.ox, C_CROSS[1], C.ox + 8, C.mouth[1] + 3]);
}
STATIONS[2].crossing = C_CROSS;
const at = (list, ox) => list.map(([x, z]) => [x + ox, z]);
export const LINKLOOP = {
  id: 'link',
  name: 'Link Loop',
  blurb: 'Three light rail stations joined only by the trains: a brick vault under Pioneer Square, Symphony\'s grand hall and the open-air Chinatown platforms. Ride the loop, and hope nobody on the other side got on with you',
  bounds: { hx: HX, hz: HZ },
  skyline: false, mountain: false,
  look: { turbidity: 2.6, rayleigh: 2.2, mie: 0.004, fog: 0.004, fogColor: 0xb4c0cc, sun: 3.2, sunColor: 0xfff0dc, hemi: 1.0, hemiSky: 0xc8d8ec, ground: 0x8a8478, exposure: 1.0, env: 0.8, blueSky: true },
  holes, lids,
  spawns2: [[...at(SPAWN_P, STATIONS[0].ox), ...at(SPAWN_SW, STATIONS[1].ox)], [...at(SPAWN_C, STATIONS[2].ox), ...at(SPAWN_SE, STATIONS[1].ox)]],
  pickups: [
    { type: 'health', pos: [STATIONS[0].ox - 3, STATIONS[0].py, -30] }, { type: 'ammo', pos: [STATIONS[0].ox + 11, STATIONS[0].py, 10] },
    { type: 'health', pos: [STATIONS[0].ox + 4, 0, -27] }, { type: 'ammo', pos: [STATIONS[0].ox - 10, 0, -14] },
    { type: 'health', pos: [STATIONS[1].ox + 4, 0, -10.5] }, { type: 'ammo', pos: [STATIONS[1].ox - 21.5, GY, -24] }, { type: 'ammo', pos: [STATIONS[1].ox + 29.5, GY, -24] },
    { type: 'health', pos: [STATIONS[1].ox - 10, 0, -10] }, { type: 'health', pos: [STATIONS[1].ox + 18, 0, -10] },
    { type: 'ammo', pos: [STATIONS[2].ox - 3, 0, -30] }, { type: 'ammo', pos: [STATIONS[2].ox + 11, 0, 0] },
    { type: 'health', pos: [STATIONS[2].ox + 4, GY, -38.5] }, { type: 'health', pos: [STATIONS[2].ox + 24, 0, -16] },
  ],
  // search & destroy: both sites at Symphony, one on the island platform, one on the north footbridge
  sites: [[STATIONS[1].ox + 4, -6, 0], [STATIONS[1].ox + 4, -33, GY]],
  photos: ['assets/loading/link-1.jpg', 'assets/loading/link-2.jpg', 'assets/loading/link-3.jpg', 'assets/loading/link-4.jpg'],
  build,
};
