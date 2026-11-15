// Vacancy: a roadside motel. The first map authored as a Blender scene (tools/blender/vacancy.py) instead of in
// code: the scene exports what you see (assets/maps/vacancy.glb) and what you collide with (js/maps/vacancy.data.js).
// Two wings of rooms face each other across a pool courtyard (the middle lane); each wing's lot is an outer lane;
// a walk-through room at each end of a wing and a breezeway through it join the lanes; outside stairs climb to each
// wing's roof. The motel's sign stands over the north-east corner of the lot (and its twin over the south-west).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS, propFit } from './props.js';
import DATA from './maps/vacancy.data.js';

const [HX, HZ] = DATA.half;
let scenePromise = null;   // the exported scene, fetched once

// metres per repeat of each of the game's texture sets (the scene's UVs are in metres)
const TEX_SCALE = { asphalt: 4, concrete: 2.5, plaster: 3, paint: 1.6, metal: 2.4, wood: 1.6, cloth: 1.5, dirt: 5, tile: 2.6, whitetile: 1.2,
  // the map's own sets (assets/textures/vacancy, CC0 from Poly Haven)
  v_asphalt: 9, v_paving: 3, v_stucco: 3.2, v_gravel: 2.2, v_grass: 4.5 };
const NO_SHADOW = /ground wear|fir|door mat|pool floor|towel|lot|verge|pool deck|walkway|paint line|water|carpet|lobby floor|roof$|festoon|wire|neon|lamp|bulb|screen|far building|pine|trunk/;
// which way each vehicle model's nose points in its file, as the turn that brings it to +x; and paints for the cars
const VEH_FRONT = { sedan: Math.PI, boxtruck: Math.PI / 2, van: Math.PI / 2 };
const CAR_PAINT = [{ tint: 0x9a3b2f }, null, { tint: 0x3d5a78 }, { tint: 0xc9b98a }, { tint: 0x4f6b52 }, null, { tint: 0x2c2f33 }, { tint: 0xb9bcc0 }];

function build(ctx) {
  const { solid, group, tex, put, B, M, vehMat } = ctx;
  for (const [x0, y0, z0, x1, y1, z1, surface, soft] of DATA.boxes) { const b = solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, y0, surface); if (soft) b.pass = true; }   // (soft: stops you, not bullets)
  // parked vehicles: the game's own models on the scene's footprints, collision fitted to what's drawn
  DATA.vehicles.forEach((v, i) => {
    const along = Math.abs(Math.sin(v.yaw)) < 0.5, len = Math.max(v.w, v.d);
    const pc = PROPS['veh_' + v.slot] && propFit('veh_' + v.slot, null, 'x', len, VEH_FRONT[v.slot]);
    if (!pc) { solid(v.x, v.z, v.w, v.d, v.h, 0, 'metal'); B(M.paint, v.w, v.h, v.d, v.x, 0, v.z, 0, { tint: 0x8a8f94 }); return; }
    const paint = v.slot === 'sedan' ? CAR_PAINT[i % CAR_PAINT.length] : null;
    for (const { geo, mat } of pc.parts) put(geo.clone(), vehMat(mat, paint), v.x, 0, v.z, v.yaw, { grime: 0, cast: !mat.transparent });
    solid(v.x, v.z, along ? pc.size.x : pc.size.z, along ? pc.size.z : pc.size.x, pc.size.y * (v.slot === 'sedan' ? 0.96 : 1), 0, 'metal');
  });
  // the scene: each material takes the game's texture set named before the colon, tinted with its own colour
  const sets = new Map(), loader = new THREE.TextureLoader();
  const own = (file, srgb, k) => {   // one of the map's own textures (the scene's UVs are glTF's: not flipped)
    const t = loader.load('assets/textures/vacancy/' + file); t.flipY = false; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (k) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(k, k); }
    return t;
  };
  const setFor = (name) => {
    if (!sets.has(name) && name.startsWith('v_')) {
      const n = name.slice(2), k = 1 / (TEX_SCALE[name] || 2);
      sets.set(name, { map: own(n + '/color.jpg', true, k), normalMap: own(n + '/normal.jpg', false, k), roughnessMap: own(n + '/rough.jpg', false, k) });
    }
    if (!sets.has(name)) {
      const src = tex[name], k = 1 / (TEX_SCALE[name] || 2);
      const cp = (t) => { if (!t) return null; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(k, k); c.needsUpdate = true; return c; };
      sets.set(name, src ? { map: cp(src.map), normalMap: cp(src.normalMap), roughnessMap: cp(src.roughnessMap) } : null);
    }
    return sets.get(name);
  };
  scenePromise = scenePromise || new GLTFLoader().loadAsync('assets/maps/vacancy.glb').then(g => g.scene);
  scenePromise.then((scene) => {
    const s = scene.clone(true);
    s.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material.clone(), [setName, what = ''] = (m.name || 'flat:').split(':'), special = setName === 'flat' || setName === 'card' || setName === 'decal' || !m.name.includes(':');
      const set = !special && setFor(setName);
      if (set) { m.map = set.map; m.normalMap = set.normalMap; m.roughnessMap = set.roughnessMap; m.roughness = 1; }
      if (setName === 'card') { m.map = (sets.get('card') || sets.set('card', own('firs.png', true)).get('card')); m.alphaTest = 0.42; m.side = THREE.DoubleSide; m.roughness = 1; m.color.set(0xd8e0d0); }
      if (setName === 'decal') { m.map = (sets.get('decal') || sets.set('decal', own('decals.png', true)).get('decal')); m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; m.roughness = 1; }
      if (what === 'water') { m.transparent = true; m.opacity = 0.62; m.depthWrite = false; }
      if (what === 'glass' || what === 'water') m.envMapIntensity = 1.6;
      m.needsUpdate = true; o.material = m;
      o.receiveShadow = true; o.castShadow = !NO_SHADOW.test(what);
    });
    group.add(s);
  }).catch(e => console.warn('Vacancy: the map scene failed to load', e));
  return {
    upper: DATA.upper,
    groundSurface: 'concrete',
    indoorAt: () => 0,
    menuCam(t, cam) { cam.position.set(Math.cos(t * 0.4) * 30, 14 + Math.sin(t * 0.3) * 2, Math.sin(t * 0.4) * 24); cam.lookAt(0, 1, 0); },
  };
}

export const VACANCY = {
  id: 'vacancy',
  name: 'Vacancy',
  blurb: 'A roadside motel: two wings of rooms across a pool courtyard, a lot on each side, walk-through rooms and breezeways between them, stairs to both roofs, and the sign over it all',
  bounds: { hx: HX, hz: HZ },
  skyline: false,
  look: { photo: { url: 'assets/sky/kloofendal_48d_partly_cloudy_puresky.jpg', u: 0.5923, gain: 1.2 }, sunElev: 44, fog: 0.0022, fogColor: 0xa7afbd, ground: 0x9a948a },
  spawns: DATA.spawns,
  pickups: DATA.pickups.map(([type, x, y, z]) => ({ type, pos: [x, y, z] })),
  build,
};
