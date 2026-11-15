// Maps authored as Blender scenes (tools/blender/<map>.py, helpers in tools/blender/mapkit.py). A scene exports
// what you see (assets/maps/<id>.glb) and what you collide with (js/maps/<id>.data.js: boxes, spawns, parked
// vehicles, the upper levels' stairs for bots). blendMap() turns that pair into a map the game can load.
//
// Materials are named '<texture set>:<what it is>' in the scene: the set is one of the game's own (plaster, wood...)
// or, starting with v_, one of the map's own in assets/textures/<id>/<set>/{color,normal,rough}.jpg; the scene's
// colour tints it and its UVs are in metres. 'card' is the map's tree cards (cards.png, alpha-tested), 'decal' its
// ground wear atlas (decals.png), 'cutout' its greenery atlas (cutouts.png, alpha-tested), 'flat' a plain colour.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PROPS, propFit } from './props.js';

const GAME_SCALE = { asphalt: 4, concrete: 2.5, plaster: 3, paint: 1.6, metal: 2.4, wood: 1.6, woodold: 1.6, cloth: 1.5, dirt: 5, tile: 2.6, whitetile: 1.2, brick: 2.2, cobble: 2.2 };   // metres per repeat
// which way each vehicle model's nose points in its file, as the turn that brings it to +x; and paints for the cars
const VEH_FRONT = { sedan: Math.PI, hatch: Math.PI / 2, boxtruck: Math.PI / 2, van: Math.PI / 2 };
const CAR_PAINT = [{ tint: 0x9a3b2f }, null, { tint: 0x3d5a78 }, { tint: 0xc9b98a }, { tint: 0x4f6b52 }, null, { tint: 0x2c2f33 }, { tint: 0xb9bcc0 }];
const scenes = new Map();   // the exported scenes, fetched once each
// fetch a map's scene ahead of building it (the match loading screen waits on this: assets.js loadMapVehicles)
export const preloadBlendScene = (id) => { if (!scenes.has(id)) scenes.set(id, new GLTFLoader().loadAsync(`assets/maps/${id}.glb`).then(g => g.scene)); return scenes.get(id).catch(() => null); };

// o: { id, name, blurb, look, scale: { v_set: metres }, noShadow: RegExp over a material's 'what', soft: RegExp (those get a
// sheen), softTint, extra: build()'s return }
export function blendMap(DATA, o) {
  const [HX, HZ] = DATA.half, dir = `assets/textures/${o.id}/`, scale = { ...GAME_SCALE, ...(o.scale || {}) };
  function build(ctx) {
    const { solid, group, tex, put, B, M, vehMat } = ctx;
    for (const [x0, y0, z0, x1, y1, z1, surface, soft, nav] of DATA.boxes) { const b = solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, y0, surface); if (soft) b.pass = true; if (nav) b.navBlock = true; }   // (soft: stops you, not bullets; nav: only tells bots there's no floor here)
    // parked vehicles: the game's own models on the scene's footprints, collision fitted to what's drawn
    (DATA.vehicles || []).forEach((v, i) => {
      const along = Math.abs(Math.sin(v.yaw)) < 0.5, len = Math.max(v.w, v.d);
      const pc = PROPS['veh_' + v.slot] && propFit('veh_' + v.slot, null, 'x', len, VEH_FRONT[v.slot]);
      if (!pc) { solid(v.x, v.z, v.w, v.d, v.h, 0, 'metal'); B(M.paint, v.w, v.h, v.d, v.x, 0, v.z, 0, { tint: 0x8a8f94 }); return; }
      const paint = v.slot === 'sedan' ? CAR_PAINT[i % CAR_PAINT.length] : null;
      for (const { geo, mat } of pc.parts) put(geo.clone(), vehMat(mat, paint), v.x, 0, v.z, v.yaw, { grime: 0, cast: !mat.transparent });
      solid(v.x, v.z, along ? pc.size.x : pc.size.z, along ? pc.size.z : pc.size.x, pc.size.y * (v.slot === 'sedan' ? 0.96 : 1), 0, 'metal');
    });
    const ready = { done: false };   // set once the scene is in and its textures have loaded (tools wait on it)
    const mgr = new THREE.LoadingManager(); let texLeft = 0, inScene = false;
    const settle = () => { if (inScene && texLeft <= 0) ready.done = true; };
    const sets = new Map(), loader = new THREE.TextureLoader(mgr);
    const own = (file, srgb, k) => {   // one of the map's own textures (the scene's UVs are glTF's: not flipped)
      texLeft++; const t = loader.load(dir + file, () => { texLeft--; settle(); }, undefined, () => { texLeft--; settle(); }); t.flipY = false; t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (k) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(k, k); }
      return t;
    };
    const once = (key, make) => { if (!sets.has(key)) sets.set(key, make()); return sets.get(key); };
    const setFor = (name) => once(name, () => {
      const k = 1 / (scale[name] || 2);
      if (name.startsWith('v_')) { const n = name.slice(2); return { map: own(n + '/color.jpg', true, k), normalMap: own(n + '/normal.jpg', false, k), roughnessMap: own(n + '/rough.jpg', false, k) }; }
      const src = tex[name], cp = (t) => { if (!t) return null; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(k, k); c.needsUpdate = true; return c; };
      return src ? { map: cp(src.map), normalMap: cp(src.normalMap), roughnessMap: cp(src.roughnessMap) } : null;
    });
    preloadBlendScene(o.id); scenes.get(o.id).then((scene) => {
      const s = scene.clone(true);
      s.traverse(ob => {
        if (!ob.isMesh) return;
        let m = ob.material.clone();
        const named = (m.name || '').includes(':'), [setName, what = ''] = named ? m.name.split(':') : ['', ''];
        // soft things (cloud, a cotton-ball canopy): a velvety sheen, so their edges catch the light
        if (o.soft && o.soft.test(what)) {
          const pm = new THREE.MeshPhysicalMaterial({ color: m.color, vertexColors: m.vertexColors, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(o.softTint || 0xffffff) });
          pm.name = m.name; m = pm;
        }
        const set = named && setName !== 'flat' && setName !== 'card' && setName !== 'decal' && setName !== 'cutout' && setFor(setName);
        if (set) { m.map = set.map; m.normalMap = set.normalMap; m.roughnessMap = set.roughnessMap; m.roughness = 1; }
        if (setName === 'card') { m.map = once('card', () => own('cards.png', true)); m.alphaTest = 0.42; m.side = THREE.DoubleSide; m.roughness = 1; m.color.set(0xd8e0d0); }
        if (setName === 'cutout') { m.map = once('cutout', () => own('cutouts.png', true)); m.alphaTest = 0.5; m.side = THREE.DoubleSide; m.roughness = 1; }
        if (setName === 'decal') { m.map = once('decal', () => own('decals.png', true)); m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; m.roughness = 1; }
        if (what === 'water') { m.transparent = true; m.opacity = 0.62; m.depthWrite = false; }
        if (what === 'glass' || what === 'water') m.envMapIntensity = 1.6;
        m.needsUpdate = true; ob.material = m;
        ob.receiveShadow = true; ob.castShadow = !(setName === 'card' || setName === 'decal' || setName === 'cutout' || (o.noShadow && o.noShadow.test(what)));
      });
      group.add(s); inScene = true; settle();
    }).catch(e => console.warn(o.name + ': the map scene failed to load', e));
    return {
      upper: DATA.upper, ready,
      noGround: !!DATA.holes,   // (bots mind the edges)
      groundSurface: o.groundSurface || 'concrete',
      indoorAt: () => 0,
      menuCam(t, cam) { cam.position.set(Math.cos(t * 0.4) * HX * 0.9, 14 + Math.sin(t * 0.3) * 2, Math.sin(t * 0.4) * HZ); cam.lookAt(0, 1, 0); },
      ...(o.extra || {}),
    };
  }
  return { id: o.id, name: o.name, blurb: o.blurb, bounds: { hx: HX, hz: HZ }, skyline: false, look: o.look, spawns: DATA.spawns, photos: [1, 2, 3].map(n => `assets/loading/${o.id}-${n}.jpg`), holes: DATA.holes,   // (holes: where there's no ground at all)
    pickups: (DATA.pickups || []).map(([type, x, y, z]) => ({ type, pos: [x, y, z] })), build };
}
