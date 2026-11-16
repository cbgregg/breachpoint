// Freshway: a neighbourhood supermarket, authored as a Blender scene (tools/blender/mart.py; see js/blendmap.js).
// The store stands between two car parks with a sliding entrance on each; inside, the grocery aisles run down the
// middle, with produce, the dairy wall and the checkouts along one side of each end and the deli counter and a
// stockroom (dock door, staff door) along the other. The earlier Freshway is still in the list as 'Freshway (classic)'.
import { blendMap } from './blendmap.js';
import DATA from './maps/mart.data.js';
import { makeSmoker } from './supermarket.js';

const inside = (x, z) => Math.abs(x) < 24 && Math.abs(z) < 16;
// doors (js/doors.js): x, z = middle of the doorway; axis = the wall's direction. Each is listed for one end of the
// store; its twin is the same door turned half a turn about the middle.
const DOORS = [
  { kind: 'slide', x: -23.8, z: 9, axis: 'z', w: 4, h: 2.7, glass: true },           // the entrance
  { kind: 'traffic', x: -15, z: -7.9, axis: 'x', w: 2, h: 2.5 },                     // shop floor | stockroom
  { kind: 'swing', x: -23.8, z: -12, axis: 'z', w: 1.6, h: 2.3, tint: 0x5a6a5a },    // staff door onto the car park
  { kind: 'swing', x: -8, z: 15.8, axis: 'x', w: 1.6, h: 2.3, tint: 0x8a2a24 },      // fire exit
  { kind: 'swing', x: -11.1, z: -12, axis: 'z', w: 1.6, h: 2.3, tint: 0x6a7a8a },    // stockroom | deli
];

export const FRESHWAY = blendMap(DATA, {
  id: 'mart',
  name: 'Freshway',
  blurb: 'A supermarket between two car parks: grocery aisles down the middle, produce and dairy by the checkouts, the deli and a stockroom behind, doors that open and close, a delivery yard at each end',
  scale: { v_hedge: 1.3, v_grass: 4.5, plaster: 3, brick: 1.6, paint: 2, storefloor: 2.4, concrete: 3, asphalt: 6, cement: 3, metal: 2, wood: 1.5, marble: 2, whitetile: 1.2, rubber: 1, woodold: 1.4, dirt: 2 },
  noShadow: /car park|shop floor|back floor|pavement|paint line|ground wear|lamp|glow|neon|glass|truss|roof deck|floor light|lot light|^steel$|verge|road|far building/,
  smooth: /apple|lemon|lime|pomegranate|avocado|onion|potato|pear|croissant|bun|food/i,
  groundSurface: 'concrete',
  nolm: /stripe/,   // (thin trim: too small on the light map to bake cleanly)
  lightmap: 1.5, fill: 0.2, fillKit: 0.55, glow: 0.45,
  tint: { 'shop floor': 0xbdb7ab, 'partition': 0xd2d2cc, 'store wall': 0xd9d4c8, 'case': 0xdcdcd8, 'gondola': 0xc6c6c2 },
  // under the roof the light is the sky's fill and the sun through the skylights: more fill, a little less exposure
  look: { photo: { url: 'assets/sky/kloofendal_48d_partly_cloudy_puresky.jpg', u: 0.5923, gain: 1.2 }, sunElev: 52, fog: 0.0065, fogColor: 0xb6c0cc, bloom: 0.12, sun: 3.0, hemi: 0.2, hemiSky: 0xe8eef8, ground: 0x8a9478, exposure: 0.8, env: 0.18 },
  extra: (group) => { const smoker = makeSmoker(group, -24.9, -10.3, Math.PI / 2 + 0.3); return {   // (the smoker: on his break by the staff door, looking out over the car park)
    update(dt, time) { if (smoker) smoker.update(dt, time); },
    ambient: { music: 'muzak', inside },
    doors: [...DOORS, ...DOORS.map(d => ({ ...d, x: -d.x, z: -d.z }))],
    indoorAt: (p) => (inside(p.x, p.z) && p.y < 5.6 ? 1 : 0),
    menuCam(t, cam) { cam.position.set(Math.cos(t * 0.4) * 44, 13 + Math.sin(t * 0.3) * 2, Math.sin(t * 0.4) * 34); cam.lookAt(0, 1.5, 0); },
  }; },
});
