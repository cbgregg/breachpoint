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
  noShadow: /ground$|outer forest floor|track|ground wear|water|puddle|limb|basin mud/,
  groundSurface: 'dirt',
  smooth: /rock|stump|trunk|root|tyre|barrel/i,
  waterOpacity: 0.9, waterEnv: 0.45,
  lightmap: 1.5, fill: 0.3, fillKit: 0.34,
  // an overcast morning in the foothills: a soft sun through broken cloud, cool grey haze in the trees
  look: { photo: { url: 'assets/sky/kloofendal_overcast_puresky.jpg', u: 0.5859, gain: 1.1 }, sunElev: 24, fog: 0.0075, fogColor: 0x8a9196, sun: 2.6, sunColor: 0xfff2dc, hemi: 0.3, hemiSky: 0xcfdcd4,
    ground: 0x4c5a3a, exposure: 0.88, env: 0.3, bloom: 0.16 },
});
