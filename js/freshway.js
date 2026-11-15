// Freshway: a neighbourhood supermarket, authored as a Blender scene (tools/blender/mart.py; see js/blendmap.js).
// The store stands between two car parks with a sliding entrance on each; inside, the grocery aisles run down the
// middle, with produce, the dairy wall and the checkouts along one side of each end and the deli counter and a
// stockroom (dock door, staff door) along the other. The earlier Freshway is still in the list as 'Freshway (classic)'.
import { blendMap } from './blendmap.js';
import DATA from './maps/mart.data.js';

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
  scale: { v_hedge: 1.3, plaster: 3, brick: 1.6, paint: 2, storefloor: 2.4, concrete: 3, asphalt: 6, cement: 3, metal: 2, wood: 1.5, marble: 2, whitetile: 1.2, rubber: 1, woodold: 1.4, dirt: 2 },
  noShadow: /car park|shop floor|back floor|pavement|paint line|ground wear|lamp|glow|neon|glass|truss|roof deck|floor light|lot light|^steel$/,
  groundSurface: 'concrete',
  lightmap: 2.6,
  // under the roof the light is the sky's fill and the sun through the skylights: more fill, a little less exposure
  look: { photo: { url: 'assets/sky/suburban_parking_area.jpg', u: 0.6001, gain: 1.2 }, sunElev: 58, fog: 0.004, fogColor: 0x9a9c8c, sun: 4.0, hemi: 0.22, hemiSky: 0xe8eef8, ground: 0xb0aca4, exposure: 0.95, env: 0.22 },
  extra: {
    ambient: { music: 'muzak', inside },
    doors: [...DOORS, ...DOORS.map(d => ({ ...d, x: -d.x, z: -d.z }))],
    indoorAt: (p) => (inside(p.x, p.z) && p.y < 5.6 ? 1 : 0),
    menuCam(t, cam) { cam.position.set(Math.cos(t * 0.4) * 44, 13 + Math.sin(t * 0.3) * 2, Math.sin(t * 0.4) * 34); cam.lookAt(0, 1.5, 0); },
  },
});
