// Zenith: floating islands over a sea of cloud, authored as a Blender scene (tools/blender/zenith.py; see
// js/blendmap.js). There is no ground: step off an island and you fall. A home island for each team, the temple
// island in the middle on its podium, a grove island north and south; a wide stone bridge from each home island to
// the temple, narrow rope bridges round by a small isle to the groves, and a bridge from each grove to the temple.
import { blendMap } from './blendmap.js';
import DATA from './maps/zenith.data.js';

export const ZENITH = blendMap(DATA, {
  id: 'zenith',
  name: 'Zenith',
  blurb: 'Floating islands over a sea of cloud: a temple in the middle, groves of golden trees, glowing crystals, and bridges between them. Mind the edge',
  scale: { v_rock: 4, v_grass: 4.5, marble: 2.4, wood: 1.6, concrete: 3.5 },
  noShadow: /island grass|cloud|water|rope|glow|crystal/,
  groundSurface: 'grass',
  // high, clear and bright: light comes up off the cloud as well as down from the sun
  look: { photo: { url: 'assets/sky/kloofendal_48d_partly_cloudy_puresky.jpg', u: 0.5923, gain: 1.25 }, sunElev: 50, fog: 0.0042, fogColor: 0xdfeaf6, sun: 4.4, sunColor: 0xfff6e4, hemi: 1.35, hemiSky: 0xd6e6ff,
    ground: 0xe6eef6, exposure: 1.05, env: 1.0 },
});
