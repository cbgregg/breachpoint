// Castle: a medieval castle's wards, authored as a Blender scene (tools/blender/castle.py; see js/blendmap.js).
// The keep and its great hall stand in the middle; cross-walls with archways divide the grounds into each team's
// ward (stables, a smithy, a statue) and a small ward north and south of the keep (the well, a hay cart); the north
// and south curtain walls carry a wall-walk behind battlements, two stone stairs up to each.
import { blendMap } from './blendmap.js';
import DATA from './maps/castle.data.js';

export const CASTLE = blendMap(DATA, {
  id: 'castle',
  name: 'Castle',
  blurb: 'A medieval castle: the keep\'s great hall in the middle, archways through the cross-walls between the wards, stables and a smithy, and the battlements along both long walls',
  // the map's own texture sets (assets/textures/castle, CC0 from Poly Haven): metres per repeat
  scale: { v_wall: 3.2, v_ashlar: 2.2, v_cobble: 3, v_mud: 5, v_flag: 2.2, v_timber: 2, v_slate: 3, v_thatch: 2.5 },
  noShadow: /ward$|earth|hall floor|water|flame|ember|banner|rope/,
  groundSurface: 'concrete',
  // a soft overcast morning: cool grey light, mist beyond the walls
  look: { photo: { url: 'assets/sky/lilienstein.jpg', u: 0.5942, gain: 1.2 }, sunElev: 32, turbidity: 3.5, rayleigh: 1.8, mie: 0.004, fog: 0.0034, fogColor: 0x8a9088, sun: 3.0, sunColor: 0xfff0d8, hemi: 1.25, hemiSky: 0xc8d2d0,
    ground: 0x6a6258, exposure: 1.02, env: 0.9, clouds: true },
});
