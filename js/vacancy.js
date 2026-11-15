// Vacancy: a roadside motel, authored as a Blender scene (tools/blender/vacancy.py; see js/blendmap.js).
// Two wings of rooms face each other across a pool courtyard (the middle lane); each wing's lot is an outer lane;
// a walk-through room at each end of a wing and a breezeway through it join the lanes; outside stairs climb to each
// wing's roof. The motel's sign stands over the north-east corner of the lot (and its twin over the south-west).
import { blendMap } from './blendmap.js';
import DATA from './maps/vacancy.data.js';

export const VACANCY = blendMap(DATA, {
  id: 'vacancy',
  name: 'Vacancy',
  blurb: 'A roadside motel: two wings of rooms across a pool courtyard, a lot on each side, walk-through rooms and breezeways between them, stairs to both roofs, and the sign over it all',
  // the map's own texture sets (assets/textures/vacancy, CC0 from Poly Haven): metres per repeat
  scale: { v_asphalt: 9, v_paving: 3, v_stucco: 3.2, v_gravel: 2.2, v_grass: 4.5 },
  noShadow: /door mat|pool floor|towel|lot|verge|pool deck|walkway|paint line|water|carpet|lobby floor|roof$|festoon|wire|neon|lamp|bulb|screen|far building/,
  look: { photo: { url: 'assets/sky/kloofendal_48d_partly_cloudy_puresky.jpg', u: 0.5923, gain: 1.2 }, sunElev: 44, fog: 0.0022, fogColor: 0xa7afbd, ground: 0x9a948a },
});
