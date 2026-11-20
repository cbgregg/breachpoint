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
  scale: { v_grass: 4.5, v_ashlar: 2.2, v_cobble: 3, v_mud: 5, v_flag: 2.2, v_timber: 2, v_slate: 3, v_thatch: 2.5 },
  noShadow: /ward$|earth|lawn|meadow|hall floor|floorboards|carpet|water|flame|ember|banner|rope|ground wear|pennant/,
  smooth: /barrel|bucket|bench|crate|statue|shield|fire_pit|chandelier/i,
  lightmap: 1.6, fill: 0.25, fillKit: 0.4,
  tint: { greenery: 0xe4e8dc },   // (the photographed greenery in its own colours: the scene's tint was for the old drawn sheet)
  groundSurface: 'concrete',
  // a fine morning: sun and broken cloud, the forest round the meadow fading into a little haze
  look: { photo: { url: 'assets/sky/kloofendal_38d_partly_cloudy_puresky.jpg', u: 0.5991, gain: 1.0 }, sunElev: 42, fog: 0.0055, fogColor: 0x9ea6aa, sun: 3.2, sunColor: 0xfff0d8, hemi: 0.35, hemiSky: 0xcfdce8,
    ground: 0x6a7258, exposure: 0.9, env: 0.4, bloom: 0.2 },
});
