// Tarsa Market: an old market town's square and streets, authored as a Blender scene (tools/blender/tarsa.py; see
// js/blendmap.js). The covered market hall stands in the square; Market Street runs in from each team's end between
// a cafe block (a walk-through cafe, a roof terrace up an alley stair) and an arcaded block (a colonnade, a passage
// through to the back); a back lane runs behind each row, joined to the square by alleys either side of a row of
// open-fronted shops. The earlier Tarsa is still in the list as 'Tarsa Market (classic)'.
import { blendMap } from './blendmap.js';
import DATA from './maps/tarsa.data.js';

export const TARSA = blendMap(DATA, {
  id: 'tarsa',
  name: 'Tarsa Market',
  blurb: 'A market town: the covered hall in the square, Market Street in from each end past the cafe and the arcade, back lanes and alleys round the shops, and a roof terrace over each end of the street',
  scale: { cloth: 0.45, plaster: 2.5, v_cobble: 3, v_stucco: 3.4, v_paving: 3, v_rooftile: 2.2, v_timber: 2 },
  noShadow: /street$|square$|ground wear|water|lamp|bulb|glass|paint/,
  look: { photo: { url: 'assets/sky/kloofendal_48d_partly_cloudy_puresky.jpg', u: 0.5923, gain: 1.2 }, sunElev: 42, fog: 0.0024, fogColor: 0xb4bcc8, sun: 4.4, sunColor: 0xfff0d8, hemi: 0.85, hemiSky: 0xcfe0f8,
    ground: 0xa89a88, exposure: 1.0, env: 0.7, shadowNormalBias: 0.06 },
});
