// Loads external 3D assets (currently the rigged soldier). Everything degrades gracefully:
// if a model fails to load, the procedural operator is used instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const ASSETS = { soldier: null };

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync('assets/models/soldier.glb', (e) => {
      if (onProgress && e.total) onProgress(e.loaded / e.total);
    });
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
}

// team 0 keeps the original kit; team 1 gets a darker, desaturated kit so the sides read differently
const tintCache = new Map();
function teamMaterial(mat, team) {
  if (team === 0) return mat;
  const key = mat.uuid;
  if (!tintCache.has(key)) {
    const m = mat.clone();
    m.color = new THREE.Color(0.17, 0.17, 0.155);
    tintCache.set(key, m);
  }
  return tintCache.get(key);
}

export function cloneSoldier(team) {
  const src = ASSETS.soldier;
  if (!src) return null;
  const root = SkeletonUtils.clone(src.scene);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
    if (o.isMesh) o.material = teamMaterial(o.material, team);
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
