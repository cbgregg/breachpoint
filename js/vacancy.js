// Vacancy: a roadside motel. The first map authored as a Blender scene (tools/blender/vacancy.py) instead of in
// code: the scene exports what you see (assets/maps/vacancy.glb) and what you collide with (js/maps/vacancy.data.js).
// Two wings of rooms face each other across a pool courtyard (the middle lane); each wing's lot is an outer lane;
// a walk-through room at each end of a wing and a breezeway through it join the lanes; outside stairs climb to each
// wing's roof. Stage 1 is a blockout: grey shapes on a one-metre grid, cover in amber.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import DATA from './maps/vacancy.data.js';

const [HX, HZ] = DATA.half;
let scenePromise = null;   // the exported scene, fetched once

// a one-metre grid drawn over a blockout material in world space, so sizes read at a glance
function gridded(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vGridP;\nvarying vec3 vGridN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGridP = (modelMatrix * vec4(position, 1.0)).xyz;\n  vGridN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = 'varying vec3 vGridP;\nvarying vec3 vGridN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 w = fwidth(vGridP) * 1.2 + 0.012, d = abs(fract(vGridP + 0.5) - 0.5);
        vec3 on = (1.0 - smoothstep(vec3(0.0), w, d)) * (1.0 - step(0.9, abs(vGridN)));
        diffuseColor.rgb *= 1.0 - 0.22 * max(on.x, max(on.y, on.z));
      }`);
  };
  mat.customProgramCacheKey = () => 'blockout-grid';
  return mat;
}

function build(ctx) {
  const { solid, group } = ctx;
  for (const [x0, y0, z0, x1, y1, z1, surface] of DATA.boxes) solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, y0, surface);
  scenePromise = scenePromise || new GLTFLoader().loadAsync('assets/maps/vacancy.glb').then(g => g.scene);
  scenePromise.then((scene) => {
    const s = scene.clone(true);
    s.traverse(o => {
      if (!o.isMesh) return;
      o.material = gridded(o.material.clone());
      o.castShadow = o.receiveShadow = true;
      if (/^(ground|deck|line|pool|floor|westTeam|eastTeam)/.test(o.material.name)) o.castShadow = false;
    });
    group.add(s);
  }).catch(e => console.warn('Vacancy: the map scene failed to load', e));
  return {
    upper: DATA.upper,
    groundSurface: 'concrete',
    indoorAt: () => 0,
    menuCam(t, cam) { cam.position.set(Math.cos(t * 0.4) * 30, 16 + Math.sin(t * 0.3) * 2, Math.sin(t * 0.4) * 24); cam.lookAt(0, 1, 0); },
  };
}

export const VACANCY = {
  id: 'vacancy',
  name: 'Vacancy',
  blurb: 'A roadside motel (blockout): two wings of rooms across a pool courtyard, a lot on each side, walk-through rooms and breezeways between them, stairs to both roofs',
  bounds: { hx: HX, hz: HZ },
  skyline: false,
  look: { photo: { url: 'assets/sky/kloofendal_48d_partly_cloudy_puresky.jpg', u: 0.5923, gain: 1.2 }, sunElev: 44, fog: 0.0022, fogColor: 0xa7afbd, ground: 0x3a3a3c },
  spawns: DATA.spawns,
  pickups: DATA.pickups.map(([type, x, y, z]) => ({ type, pos: [x, y, z] })),
  build,
};
