// Loads external 3D assets (the rigged soldier and the first-person hands). Everything degrades gracefully:
// if a model fails to load, the procedural operator is used instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { setGunModel } from './weapons.js';
import { setProp } from './props.js';

export const ASSETS = { soldier: null, photo: {}, hands: null };

// Photo-scanned PBR sets (CC0, from ambientCG and Poly Haven) in assets/textures/<name>/.
// Any set that fails to load falls back to the generated texture of the same name.
export const PHOTO_SETS = ['asphalt', 'concrete', 'plaster', 'brick', 'metal', 'paint', 'wood', 'woodold', 'dirt', 'tile', 'bag', 'cloth', 'hesco', 'rubber',
  // floor and wall tiles (supermarket, houses)
  'storefloor', 'terracotta', 'subway', 'hexblack', 'checker', 'marble', 'octagon', 'whitetile', 'cement', 'marblegrey', 'tactile'];
async function loadPhotoTextures(onProgress) {
  const loader = new THREE.TextureLoader();
  let done = 0;
  const total = PHOTO_SETS.length;
  await Promise.all(PHOTO_SETS.map(async (name) => {
    try {
      const [map, normalMap, roughnessMap] = await Promise.all(['color', 'normal', 'rough'].map(k => loader.loadAsync(`assets/textures/${name}/${k}.jpg`)));
      for (const t of [map, normalMap, roughnessMap]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.userData.keep = true; // shared across map changes
      }
      map.colorSpace = THREE.SRGBColorSpace;
      ASSETS.photo[name] = { map, normalMap, roughnessMap, photo: true };
    } catch (e) { console.warn('Texture set missing, using generated:', name); }
    if (onProgress) onProgress(++done / total);
  }));
}

// First-person hands: a skinned, textured hand (both viewmodel hands are this one, the left mirrored).
export async function loadHandsAsset() {
  if (ASSETS.hands) return ASSETS.hands;
  try {
    const tl = new THREE.TextureLoader();
    const glb = new GLTFLoader().loadAsync('assets/models/hands.glb').catch(async () => {
      // hosts that won't serve .glb get the model as a base64 module (like the soldier)
      const { HANDS_B64 } = await import('./hands-data.js');
      return new GLTFLoader().parseAsync(Uint8Array.from(atob(HANDS_B64), ch => ch.charCodeAt(0)).buffer, '');
    });
    const [gltf, map, normalMap, roughnessMap] = await Promise.all([
      glb,
      tl.loadAsync('assets/textures/hands/color.jpg'), tl.loadAsync('assets/textures/hands/normal.jpg'), tl.loadAsync('assets/textures/hands/rough.jpg'),
    ]);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normalMap, roughnessMap]) t.anisotropy = 8;
    ASSETS.hands = { scene: gltf.scene, map, normalMap, roughnessMap };
  } catch (e) { console.warn('Hand model unavailable, using procedural hands.', e); }
  return ASSETS.hands;
}

// Real gun models (CC-BY, credited in Options > About). xf maps each model into the gun frame used by
// weapons.js; if a model fails to load, that weapon keeps its procedural build.
const GUN_FILES = {
  // red dot optic: modelled in millimetres; base of the mount at y = 0, centred on z = 0
  reddot: { file: 'assets/models/reddot.glb', xf: { s: 0.0006, x: 0, y: 0.016, z: -0.0057 } },
  ar15: { file: 'assets/models/ar15.glb', xf: { s: 0.0515, x: 0, y: 0.0056, z: -0.0573 } },
  // TPM SMG: modelled along -x; turned to face -z
  tpm: { file: 'assets/models/tpm.glb', xf: { s: 0.17, ry: -Math.PI / 2, x: 0, y: 0.0238, z: 0.0204 } },
  // Remington 870: lies at an angle in its file; turned so the barrel points down -z
  r870: { file: 'assets/models/r870.glb', xf: { s: 0.5, ry: 2.93, x: 0.004, y: 0, z: -0.22 } },
  sniper: { file: 'assets/models/sniper.glb', xf: { s: 0.036, x: 0, y: -0.032, z: -0.227 } },
  // G19: the file is a display (pistol, spare magazine and a suppressor laid out); keep only the pistol
  g19: { file: 'assets/models/g19.glb', xf: { s: 0.95, ry: Math.PI, x: 0, y: 0, z: -0.043,
    keep: (x, y, z, k) => !k.includes('mm1') && z > -0.12 && z < 0.108 && y > -0.08 && y < 0.09 && !(z > 0.088 && y < -0.04) } },
};
const PROP_FILES = { containers: 'assets/models/trucks.glb', mags: 'assets/models/mags.glb', corkboard: 'assets/models/corkboard.glb', stairs: 'assets/models/stairs.glb', downtown: 'assets/models/downtown.glb', bin: 'assets/models/bin.glb' };
async function loadProps() {
  await Promise.all(Object.entries(PROP_FILES).map(async ([name, file]) => {
    try { setProp(name, (await new GLTFLoader().loadAsync(file)).scene); }
    catch (e) { console.warn('Prop model unavailable, using procedural:', name, e); }
  }));
}
async function loadGunModels() {
  await Promise.all(Object.entries(GUN_FILES).map(async ([name, { file, xf }]) => {
    try { const gltf = await new GLTFLoader().loadAsync(file); setGunModel(name, gltf.scene, xf); }
    catch (e) { console.warn('Gun model unavailable, using procedural:', name, e); }
  }));
}

export async function loadAssets(onProgress, onTexProgress) {
  const textures = loadPhotoTextures(onTexProgress);
  const hands = loadHandsAsset();
  const guns = loadGunModels();
  const props = loadProps();
  const loader = new GLTFLoader();
  try {
    let gltf;
    try {
      gltf = await loader.loadAsync('assets/models/soldier.glb', (e) => {
        if (onProgress && e.total) onProgress(e.loaded / e.total);
      });
    } catch (e) {
      // hosts that won't serve .glb can ship the model as a base64 JS module instead
      const { SOLDIER_B64 } = await import('./soldier-data.js');
      const bin = Uint8Array.from(atob(SOLDIER_B64), ch => ch.charCodeAt(0));
      gltf = await loader.parseAsync(bin.buffer, '');
    }
    const clips = {};
    for (const c of gltf.animations) clips[c.name] = c;
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // skinned bounds don't follow animation
        if (o.material.map) o.material.map.anisotropy = 8;
        o.material.roughness = 0.82;
        o.material.metalness = 0.05;
      }
    });
    ASSETS.soldier = { scene: gltf.scene, clips };
  } catch (err) {
    console.warn('Soldier model unavailable, using procedural operators.', err);
  }
  await Promise.all([textures, hands, guns, props]);
}

// Readability (Black Ops 2 style): both kits stay bright, and every soldier gets a soft rim light
// so silhouettes separate from walls and shadows. Team 1 wears a cool slate kit.
const tintCache = new Map();
function addRim(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: new THREE.Color(0.95, 0.92, 0.85).multiplyScalar(0.9) };
    sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
      totalEmissiveRadiance += rimColor * rimF * 0.55;`);
  };
  m.customProgramCacheKey = () => 'soldier-rim';
}
function teamMaterial(mat, team, rim = true) {
  const key = mat.uuid + ':' + team + ':' + rim;
  if (!tintCache.has(key)) {
    const m = mat.clone();
    if (team === 1) m.color = new THREE.Color(0.46, 0.5, 0.58); // cool slate: stands out from the warm desert and from team 0
    m.roughness = 0.72;
    m.envMapIntensity = 1.25;
    if (rim) addRim(m);
    tintCache.set(key, m);
  }
  return tintCache.get(key);
}

export function cloneSoldier(team, { rim = true } = {}) {
  const src = ASSETS.soldier;
  if (!src) return null;
  const root = SkeletonUtils.clone(src.scene);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
    if (o.isMesh) o.material = teamMaterial(o.material, team, rim);
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const name of ['Idle', 'Walk', 'Run']) {
    const a = mixer.clipAction(src.clips[name]);
    a.play();
    a.setEffectiveWeight(name === 'Idle' ? 1 : 0);
    actions[name] = a;
  }
  return { root, bones, mixer, actions };
}
