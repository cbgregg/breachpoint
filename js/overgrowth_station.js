// Overgrowth: a pumping station the forest has taken back, authored as a Blender scene (tools/blender/overgrowth.py;
// see js/blendmap.js). The brick pump house in the middle (a stair up each long wall to its roof), a gravel track
// to it from each end under a pipe bridge; the big tank, a tank on saddles, the pipe rack and containers on one
// side of each half, the settling basin, the control hut, a water tower and a fallen tree on the other. The
// earlier Overgrowth is still in the list as 'Overgrowth (classic)'.
import { blendMap } from './blendmap.js';
import DATA from './maps/overgrowth.data.js';

export const OVERGROWTH_STATION = blendMap(DATA, {
  id: 'overgrowth',
  name: 'Overgrowth',
  blurb: 'A pumping station taken back by the forest: the brick pump house and its roof in the middle, a pipe bridge over the track, tanks, a settling basin, the control hut and a water tower in ferns, ivy and firs',
  // the map's own texture sets (assets/textures/overgrowth, CC0 from Poly Haven): metres per repeat
  scale: { v_forest: 4, v_gravel: 3, v_pad: 3, v_brick: 2.2, v_rust: 3, v_corr: 2.4, v_paint: 2, v_bark: 1.6, v_plaster: 3, v_conc: 3 },
  noShadow: /ground$|outer forest floor|track|ground wear|water|puddle|limb/,
  groundSurface: 'dirt',
  smooth: /rock|stump|trunk|root|tyre|barrel/i,
  clear: /^water$/,
  lightmap: 1.5, fill: 0.3, fillKit: 0.34,
  // a misty morning in the foothills: a soft sun through thin cloud, cool grey-green haze in the trees
  look: { photo: { url: 'assets/sky/kloofendal_misty_morning_puresky.jpg', u: 0.6204, gain: 1.0 }, sunElev: 38, fog: 0.011, fogColor: 0xa9b3ab, sun: 2.6, sunColor: 0xfff2dc, hemi: 0.3, hemiSky: 0xcfdcd4,
    ground: 0x4c5a3a, exposure: 0.88, env: 0.3, bloom: 0.16 },
});
