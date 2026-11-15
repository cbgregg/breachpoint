// Zenith: floating islands over a sea of cloud, authored as a Blender scene (tools/blender/zenith.py; see
// js/blendmap.js). There is no ground: step off an island and you fall. A home island for each team, the temple
// island in the middle on its podium, a grove island north and south; a wide stone bridge from each home island to
// the temple, narrow rope bridges round by a small isle to the groves, and a bridge from each grove to the temple.
import { blendMap } from './blendmap.js';
import DATA from './maps/zenith.data.js';

export const ZENITH = blendMap(DATA, {
  id: 'zenith',
  name: 'Zenith',
  blurb: 'Islands resting on cloud: a temple under a rainbow in the middle, groves of cotton-ball trees, star posts, and walkways of cloud between them. Mind the edge',
  scale: { v_rock: 4, v_grass: 4.5, marble: 2.4, wood: 1.6, concrete: 3.5 },
  noShadow: /island grass|water|rope|glow|crystal|star|rb |balloon|islet/,
  soft: /cloud|^(pink|butter|mint|sky blue|lavender)$/, softTint: 0xfff4ea,
  groundSurface: 'grass',
  // a low warm sun for long soft shadows, cool lavender light coming up off the cloud: form, not flat white
  look: { photo: { url: 'assets/sky/kloofendal_48d_partly_cloudy_puresky.jpg', u: 0.5923, gain: 1.15 }, sunElev: 36, fog: 0.0042, fogColor: 0xe6d8ee, sun: 5.2, sunColor: 0xffe6c4, hemi: 0.7, hemiSky: 0xcfe0ff,
    ground: 0x8e98cc, exposure: 0.96, env: 0.55, shadowNormalBias: 0.09, shadowBias: -0.0005 },
});
