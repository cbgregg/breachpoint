// Weapon state, detailed procedural gun models (real-world proportions, meters), spread helper
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WEAPONS, typeOf, savedQuality } from './config.js';
import { weaponDef, cleanAtt } from './attachments.js';
import { reticleMesh } from './reticles.js';
import { BUILDS } from './gunbuilds.js';

export class WeaponState {
  constructor(id, att) {
    this.id = id;
    this.def = weaponDef(id, att);
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadTotal = this.def.reload;
    this.dryClicked = false;
  }

  refill() {
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.cooldown = 0;
  }

  startReload() {
    if (this.reloading || this.mag >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = true;
    this.emptyReload = this.mag === 0;   // empty: there's a charging handle / slide to work at the end
    // tactical reload (round chambered) is faster than an empty reload
    this.reloadTotal = this.def.reload * (this.mag > 0 ? 0.85 : 1);
    this.reloadT = this.reloadTotal;
    return true;
  }

  cancelReload() { this.reloading = false; }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(this.def.mag - this.mag, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
        this.dryClicked = false;
      }
    }
  }

  get reloadProgress() { return this.reloading ? 1 - this.reloadT / this.reloadTotal : 0; }
}

const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);

export function applySpread(dir, spread, out) {
  out.copy(dir);
  if (spread <= 0) return out;
  _u.crossVectors(dir, Math.abs(dir.y) > 0.95 ? _x : _up).normalize();
  _w.crossVectors(dir, _u).normalize();
  const r = Math.tan(spread) * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  out.addScaledVector(_u, Math.cos(a) * r).addScaledVector(_w, Math.sin(a) * r).normalize();
  return out;
}

// ---------- materials (shared) ----------
// Procedural surface detail: tileable value noise -> roughness and normal maps, so polymer reads as
// stippled, anodized aluminium has a faint sprayed grain and wood has grain. Extruded parts get UVs in
// metres, so these tile per centimetre or so on the real-scale gun.
let MATS = null;
function noiseField(N, octaves, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = new Float32Array(N * N);
  let amp = 1, total = 0;
  for (const cells of octaves) {
    const g = Array.from({ length: cells * cells }, rnd);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * cells, fy = y / N * cells;
      const xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
      const v = (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
      out[y * N + x] += v * amp;
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
function texFrom(N, fill, repeat, srgb = false) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const [r, gg, b] = fill(i); img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function normalFrom(h, N, strength, repeat) {
  const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  return texFrom(N, (i) => {
    const x = i % N, y = (i / N) | 0;
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  }, repeat);
}
function roughFrom(h, N, base, amp, repeat) {
  return texFrom(N, (i) => { const v = Math.max(0, Math.min(1, base + (h[i] - 0.5) * amp)) * 255; return [v, v, v]; }, repeat);
}
// worn edges: where the surface turns sharply (bevels, corners) the finish is rubbed through, lighter
// and smoother. Screen-space normal derivatives find the edges; it fades out with distance so
// third-person guns don't turn grey.
function wear(mat, color, amount, rough = 0.55) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float edge = clamp(length(fwidth(vNormal)) * 2.2 - 0.12, 0.0, 1.0);
        edge *= smoothstep(2.5, 0.6, -vViewPosition.z) * ${amount.toFixed(3)};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${color.map(v => v.toFixed(3)).join(',')}), edge);
        roughnessFactor = mix(roughnessFactor, ${rough.toFixed(2)}, edge);
      }`);
  };
  mat.customProgramCacheKey = () => 'wear' + amount + color.join();
  return mat;
}
function mats() {
  if (MATS) return MATS;
  const N = 256;
  const stipple = noiseField(N, [64, 128], 7);         // polymer grip texture
  const grain = noiseField(N, [16, 48, 96], 11);       // sprayed / anodized finish
  const blotch = noiseField(N, [4, 8, 16], 23);         // handling marks, uneven sheen
  const polyN = normalFrom(stipple, N, 1.6, 25), polyR = roughFrom(blotch, N, 0.74, 0.25, 12);
  const metalN = normalFrom(grain, N, 0.35, 30), metalR = roughFrom(blotch, N, 0.46, 0.35, 10);
  const steelR = roughFrom(grain, N, 0.3, 0.25, 20);
  // walnut: stretched noise for grain, darker latewood lines
  const wf = noiseField(N, [3, 8], 31), fine = noiseField(N, [32, 128], 37);
  const woodMap = texFrom(N, (i) => {
    const x = i % N, y = (i / N) | 0;
    // long grain lines along the stock (texture x), gently warped, with fine pores
    const v = Math.pow(Math.sin((y / N * 40 + wf[i] * 0.9 + fine[(x >> 3) * N + (y >> 2)] * 0.25) * Math.PI) * 0.5 + 0.5, 4);
    const k = 0.78 - v * 0.32 + (fine[i] - 0.5) * 0.12 + (wf[(x * 7 % N) * N + y] - 0.5) * 0.1;
    return [92 * k + 8, 56 * k + 5, 33 * k + 3];
  }, 6, true);
  const woodN = normalFrom(fine, N, 0.25, 6);
  const stdN = (m, n, sc) => { m.normalMap = n; m.normalScale = new THREE.Vector2(sc, sc); return m; };
  MATS = {
    // hard-anodized aluminium receivers: near-black, satin, wears to bare grey aluminium
    metal: wear(stdN(new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 1, roughnessMap: metalR, metalness: 0.62, envMapIntensity: 1.5 }), metalN, 0.25), [0.42, 0.42, 0.43], 0.9, 0.3),
    // blued / nitrided steel: barrels, bolts, pins
    steel: wear(new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 1, roughnessMap: steelR, metalness: 0.92, envMapIntensity: 1.6 }), [0.55, 0.55, 0.56], 0.7, 0.22),
    poly: wear(stdN(new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 1, roughnessMap: polyR, metalness: 0.0 }), polyN, 0.35), [0.16, 0.16, 0.16], 0.6, 0.6),
    // flat dark earth polymer
    tan: wear(stdN(new THREE.MeshStandardMaterial({ color: 0x6a5a43, roughness: 1, roughnessMap: polyR, metalness: 0.0 }), polyN, 0.3), [0.55, 0.49, 0.4], 0.5, 0.65),
    olive: wear(stdN(new THREE.MeshStandardMaterial({ color: 0x3f4536, roughness: 1, roughnessMap: polyR, metalness: 0.0 }), polyN, 0.3), [0.4, 0.42, 0.36], 0.5, 0.65),
    wood: stdN(new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.48, metalness: 0.0 }), woodN, 0.3),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.95 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.9 }), // slots, ports: read as holes
    brass: new THREE.MeshStandardMaterial({ color: 0xb58a3c, roughness: 0.3, metalness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xa8dcd4, roughness: 0.03, metalness: 0.4, envMapIntensity: 0.9, transparent: true, opacity: 0.06, depthWrite: false }), // coated lens: a faint teal tint and sky reflections, like a real red dot
    halo: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.12, 0.08), toneMapped: false, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.04, metalness: 1, envMapIntensity: 2.2 }),
    reticle: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.1, 0.06), toneMapped: false, side: THREE.DoubleSide }), // deep red, just over bloom threshold
  };
  return MATS;
}
export function gunMaterials() { return mats(); }

// rounded polygon: pts = [[x, y, r?], ...]
function roundedShape(pts, rDefault = 0.004, shape = new THREE.Shape()) {
  const n = pts.length;
  const P = pts.map(p => new THREE.Vector2(p[0], p[1]));
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], p = P[i], c = P[(i + 1) % n];
    const r = Math.min(pts[i][2] ?? rDefault, a.distanceTo(p) * 0.45, c.distanceTo(p) * 0.45);
    const p1 = p.clone().add(a.clone().sub(p).normalize().multiplyScalar(r));
    const p2 = p.clone().add(c.clone().sub(p).normalize().multiplyScalar(r));
    if (i === 0) shape.moveTo(p1.x, p1.y); else shape.lineTo(p1.x, p1.y);
    shape.quadraticCurveTo(p.x, p.y, p2.x, p2.y);
  }
  shape.closePath();
  return shape;
}
function roundedPath(pts, r) { return roundedShape(pts, r, new THREE.Path()); }

// geometric detail while a gun is being built: 2 = first person / menu previews, 1 = third person,
// 0 = third person on the Mobile preset (flat-edged boxes, fewer curve segments)
let DETAIL = 2, GUN_DETAIL = savedQuality().lowPoly ? 0 : 1;
export function setGunDetail(d) { GUN_DETAIL = d; }
const curveSegs = () => DETAIL >= 2 ? 5 : DETAIL === 1 ? 3 : 2;
const latheSegs = (n) => DETAIL >= 2 ? n : Math.max(6, Math.round(n * (DETAIL === 1 ? 0.6 : 0.45)));
class Parts {
  constructor() { this.by = new Map(); }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return this;
  }
  // side profile in (forward f, up y) extruded across the gun's width, with rounded edges
  profile(mat, pts, width, { x = 0, bevel = 0.0025, r = 0.004, holes = [] } = {}) {
    const shape = roundedShape(pts, r);
    for (const h of holes) shape.holes.push(roundedPath(h, r));
    const depth = Math.max(0.001, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: DETAIL >= 2 ? 2 : 1, curveSegments: curveSegs() });
    g.rotateY(Math.PI / 2); // shape x (forward) -> -z, extrusion -> +x
    g.translate(x - depth / 2, 0, 0);
    return this.add(mat, g);
  }
  // front-facing outline (x, y) extruded along the barrel axis from f0 to f1
  frontal(mat, pts, f0, f1, holes = [], r = 0.004, bevel = 0.0015) {
    const shape = roundedShape(pts, r);
    for (const h of holes) shape.holes.push(roundedPath(h, r));
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, f1 - f0 - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: DETAIL >= 2 ? 2 : 1, curveSegments: curveSegs() + 1 });
    g.translate(0, 0, -(f1 - bevel));
    return this.add(mat, g);
  }
  // surface of revolution along the barrel axis: pts = [[radius, f], ...]
  lathe(mat, pts, y = 0, x = 0, seg = 20) {
    const g = new THREE.LatheGeometry(pts.map(([r, f]) => new THREE.Vector2(r, f)), latheSegs(seg));
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, 0);
    return this.add(mat, g);
  }
  rbox(mat, w, h, d, x, y, z, r = 0.003, rx = 0, ry = 0, rz = 0) {
    const geo = DETAIL === 0 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, DETAIL >= 2 ? 2 : 1, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
    return this.add(mat, geo, x, y, z, rx, ry, rz);
  }
  rail(mat, f0, f1, y, w = 0.021) {
    // picatinny: a narrow spine with the wide ridges on top (5 mm slots on a 10 mm pitch)
    this.rbox(mat, w * 0.7, 0.0055, f1 - f0, 0, y + 0.00275, -(f0 + f1) / 2, 0.001);
    this.rbox(mat, w, 0.0022, f1 - f0, 0, y + 0.0062, -(f0 + f1) / 2, 0.0008);
    for (let f = f0 + 0.0045; f < f1 - 0.003; f += 0.01) this.rbox(mat, w, 0.003, 0.0048, 0, y + 0.0085, -f, 0.0007);
    return this;
  }
  build(group, cast = true) {
    for (const [mat, geos] of this.by) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(mesh);
      geos.forEach(g => g.dispose());
    }
    return group;
  }
}

const GRIP = [[-0.004, -0.008], [0.033, -0.012], [0.03, -0.03, 0.01], [0.012, -0.118, 0.012], [-0.022, -0.124, 0.01], [-0.03, -0.104, 0.008], [-0.018, -0.03, 0.008]];
function triggerGroup(p, M, f0 = 0.0, width = 0.012) {
  p.profile(M.poly, [[f0, -0.01], [f0 + 0.085, -0.01], [f0 + 0.085, -0.05], [f0 + 0.005, -0.052]], width,
    { r: 0.008, holes: [[[f0 + 0.009, -0.016], [f0 + 0.077, -0.016], [f0 + 0.077, -0.043], [f0 + 0.011, -0.045]]] });
  p.profile(M.metal, [[f0 + 0.03, -0.012], [f0 + 0.042, -0.012], [f0 + 0.036, -0.038], [f0 + 0.03, -0.036]], 0.006, { r: 0.004, bevel: 0.001 });
}


// ---------- attachments ----------
// f = distance forward along the barrel (z = -f); b = mount height; c = mount centre
function opticHolo(p, g, M, b, c) {
  M = mats();
  p.profile(M.poly, [[c - 0.06, b], [c + 0.06, b], [c + 0.06, b + 0.016], [c - 0.06, b + 0.016]], 0.036, { r: 0.005 });
  const hy = b + 0.042;
  p.frontal(M.poly, [[-0.024, hy - 0.028], [0.024, hy - 0.028], [0.024, hy + 0.024], [-0.024, hy + 0.024]], c - 0.02, c + 0.045,
    [[[-0.0175, hy - 0.019], [0.0175, hy - 0.019], [0.0175, hy + 0.017], [-0.0175, hy + 0.017]]], 0.007);
  p.rbox(M.poly, 0.012, 0.02, 0.03, 0.029, b + 0.026, -(c - 0.035), 0.004);
  p.add(M.glass, new THREE.PlaneGeometry(0.036, 0.036), 0, hy, -(c + 0.015));
  const z = -(c + 0.02);
  const ret = reticleMesh('holo');   // customizable reticle (glow baked into the texture)
  ret.position.set(0, hy, z);
  g.add(ret);
  return { sightY: hy, sightZ: z };
}
function opticReflex(p, g, M, b, c, k = 1) {
  M = mats();
  if (GUN_MODELS.reddot) {
    // red dot model (CC-BY 4.0, "FPS Red Dot Sight (Game Model)" by Michael Makivic on Sketchfab)
    const grp = new THREE.Group();
    addModelParts('reddot', grp, () => true, true);
    grp.traverse(o => { if (o.isMesh && o.name.includes('08')) { o.material = M.glass; o.renderOrder = 2; } });
    grp.position.set(0, b - 0.0035 * k, -c);   // the model's base sits 3.5 mm above its origin: seat it on the rail
    grp.scale.setScalar(k);
    g.add(grp);
    const ry = b + (0.0426 - 0.0035) * k, z = -c - 0.0357 * k + 0.002;
    const ret = reticleMesh('reflex');
    ret.position.set(0, ry, z);
    g.add(ret);
    return { sightY: ry, sightZ: z };
  }
  p.profile(M.poly, [[c - 0.0325 * k, b], [c + 0.0325 * k, b], [c + 0.0325 * k, b + 0.01], [c - 0.0325 * k, b + 0.01]], 0.03 * k, { r: 0.004 });
  const ry = b + 0.026 * k, w = 0.017 * k, i = 0.013 * k;
  p.frontal(M.poly, [[-w, ry - 0.016 * k], [w, ry - 0.016 * k], [w, ry + 0.017 * k], [-w, ry + 0.017 * k]], c + 0.0075 * k, c + 0.0225 * k,
    [[[-i, ry - 0.012 * k], [i, ry - 0.012 * k], [i, ry + 0.013 * k], [-i, ry + 0.013 * k]]], 0.008 * k);
  p.add(M.glass, new THREE.PlaneGeometry(0.026 * k, 0.026 * k), 0, ry, -(c + 0.0155 * k), -0.12);
  const z = -(c - 0.0075 * k);
  const ret = reticleMesh('reflex');
  ret.position.set(0, ry, z);
  g.add(ret);
  return { sightY: ry, sightZ: z };
}
// 4x prism scope. The body is single-sided, so looking down the tube its inner walls vanish and the
// eyepiece rim frames a clear magnified view (the camera zooms); the chevron floats at the front.
function opticAcog(p, g, M, b, c, vm = false) {
  M = mats();
  p.profile(M.metal, [[c - 0.045, b], [c + 0.045, b], [c + 0.045, b + 0.012], [c - 0.045, b + 0.012]], 0.03, { r: 0.003 });
  p.rbox(M.metal, 0.012, 0.012, 0.03, 0.018, b + 0.008, -c, 0.002);
  const ay = b + 0.034, r0 = c - 0.06, r1 = c + 0.062;
  const body = new THREE.LatheGeometry([[0.0185, r1], [0.0215, r1], [0.0215, r1 - 0.03], [0.0195, r1 - 0.044], [0.0195, r0]].reverse().map(([r, f]) => new THREE.Vector2(r, f)), 28);
  body.rotateX(-Math.PI / 2);
  p.add(M.poly, body, 0, ay, 0);
  p.rbox(M.poly, 0.026, 0.012, 0.05, 0, ay + 0.0255, -(c - 0.005), 0.004); // prism housing (clear of the optical path)
  p.add(M.poly, new THREE.CylinderGeometry(0.007, 0.007, 0.01, 14), 0, ay + 0.035, -(c + 0.012));
  p.add(M.poly, new THREE.CylinderGeometry(0.008, 0.008, 0.012, 14), 0.027, ay, -(c + 0.008), 0, 0, Math.PI / 2);
  // rubber eyecup: the ring that frames the view when aiming
  p.add(M.rubber, new THREE.RingGeometry(0.0168, 0.0235, 32, 1), 0, ay, -r0 + 0.008);
  p.lathe(M.rubber, [[0.0235, r0 - 0.008], [0.0235, r0 + 0.004], [0.0195, r0 + 0.01]], ay, 0, 32);
  // customizable reticle (default: red chevron + stadia post)
  const z = -(r1 - 0.02);
  if (!vm) {
    // seen from outside (other players, Create a Class): coated glass closes both ends of the tube
    p.add(M.lens, new THREE.CircleGeometry(0.0212, 28).rotateY(Math.PI), 0, ay, -(r1 - 0.002));   // objective, facing forward
    p.add(M.lens, new THREE.CircleGeometry(0.0172, 28), 0, ay, -(r0 + 0.004));                      // ocular, facing the eye
  }
  const ret = reticleMesh('acog');
  ret.position.set(0, ay, z);
  g.add(ret);
  if (vm) {
    // first person: an invisible depth mask fills the tube, so the gun behind the glass never shows
    // through and the (magnified) world fills the eyepiece
    mask = mask || new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const L = r1 - r0;
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.0192, 0.0192, L, 28, 1, true), mask);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(0, ay, -(r0 + L / 2));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0212, 28), mask);
    lens.position.set(0, ay, -r1);
    liner.renderOrder = lens.renderOrder = -1;
    g.add(liner, lens);
    // looking into the eyepiece, the scope's housing fills everything round it: a dark shroud behind the
    // eyecup (faded in by the viewmodel as you aim), so the magnified world only shows through the glass
    const shroud = new THREE.Mesh(new THREE.RingGeometry(0.0232, 0.32, 48, 1), shroudMat());
    shroud.name = 'acogShroud';
    shroud.position.set(0, ay, -r0 + 0.0085);
    shroud.renderOrder = 2;
    shroud.visible = false;
    g.add(shroud);
    // the eyepiece glass: dark coated lens at the hip, so you don't see the world through the scope; it
    // clears as the sight comes up to the eye (the viewmodel fades it opposite the shroud)
    const ocular = new THREE.Mesh(new THREE.CircleGeometry(0.0172, 28), ocularMat());
    ocular.name = 'acogOcular';
    ocular.position.set(0, ay, -r0 + 0.004);
    ocular.renderOrder = 1;
    g.add(ocular);
  }
  return { sightY: ay, sightZ: -r0, eyeRelief: -0.05 };
}
function opticScope(p, M, b, c) {
  M = mats();
  const sy = b + 0.046;
  p.lathe(M.poly, [[0, -0.19], [0.02, -0.19], [0.0215, -0.175], [0.0215, -0.13], [0.0165, -0.1], [0.0155, -0.09], [0.0155, 0.07], [0.019, 0.1], [0.0265, 0.14], [0.027, 0.2], [0, 0.2]].map(([r, f]) => [r, f + c]), sy, 0, 28);
  p.add(M.poly, new THREE.CylinderGeometry(0.011, 0.011, 0.028, 16), 0, sy + 0.025, -c);
  p.add(M.poly, new THREE.CylinderGeometry(0.011, 0.011, 0.028, 16), 0.025, sy, -c, 0, 0, Math.PI / 2);
  for (const f of [-0.06, 0.06]) p.frontal(M.metal, [[-0.019, b], [0.019, b], [0.019, sy], [-0.019, sy]], c + f - 0.009, c + f + 0.009, [], 0.004);
  p.add(M.lens, new THREE.CircleGeometry(0.0245, 24), 0, sy, -(c + 0.199));
  const lensB = new THREE.CircleGeometry(0.019, 24); lensB.rotateY(Math.PI);
  p.add(M.lens, lensB, 0, sy, -(c - 0.19));
  return { sightY: sy, sightZ: -(c - 0.19) };
}
// flip-up rear aperture on the rail + front post
function ironSights(p, M, rearF, railY, frontF, frontY, h) {
  const sy = railY + h;
  p.profile(M.metal, [[rearF - 0.012, railY], [rearF + 0.012, railY], [rearF + 0.008, railY + 0.008], [rearF - 0.008, railY + 0.008]], 0.022, { r: 0.002, bevel: 0.001 });
  p.frontal(M.metal, [[-0.012, railY + 0.004], [0.012, railY + 0.004], [0.012, sy + 0.01], [-0.012, sy + 0.01]], rearF - 0.0025, rearF + 0.0025,
    [[[-0.0055, sy - 0.0055], [0.0055, sy - 0.0055], [0.0055, sy + 0.0055], [-0.0055, sy + 0.0055]]], 0.004, 0.0008);
  p.profile(M.metal, [[frontF - 0.01, frontY], [frontF + 0.01, frontY], [frontF + 0.006, frontY + 0.008], [frontF - 0.006, frontY + 0.008]], 0.022, { r: 0.002, bevel: 0.001 });
  p.rbox(M.metal, 0.0024, sy - frontY, 0.003, 0, (sy + frontY) / 2, -frontF, 0.0006);
  for (const xs of [-1, 1]) p.rbox(M.metal, 0.0022, sy - frontY + 0.004, 0.007, xs * 0.0075, (sy + frontY) / 2 + 0.002, -frontF, 0.0008);
  return { sightY: sy, sightZ: -rearF, frontZ: -frontF + 0.0016, postTop: sy };
}
function addOptic(kind, p, g, M, vm, b, c) {
  if (kind === 'reflex') return opticReflex(p, g, M, b, c + 0.012);
  if (kind === 'acog') return opticAcog(p, g, M, b, c, vm);
  if (kind === 'scope') return opticScope(p, M, b, c);
  return opticHolo(p, g, M, b, c);
}
// returns the f where the muzzle ends
function muzzleDevice(p, M, kind, y, f0, br, supLen = 0.18) {
  M = mats();
  if (kind === 'brake') {
    p.lathe(M.metal, [[0, f0], [br + 0.004, f0], [br + 0.005, f0 + 0.01], [br + 0.005, f0 + 0.056], [br + 0.0025, f0 + 0.062], [br - 0.0025, f0 + 0.062], [0, f0 + 0.062]], y, 0, 16);
    for (let i = 0; i < 3; i++) p.rbox(M.rubber, (br + 0.005) * 2.2, 0.003, 0.006, 0, y + br + 0.004, -(f0 + 0.02 + i * 0.013), 0.001);
    return f0 + 0.07;
  }
  if (kind === 'comp') {
    p.lathe(M.metal, [[0, f0], [br + 0.003, f0], [br + 0.0045, f0 + 0.006], [br + 0.0045, f0 + 0.046], [br + 0.0015, f0 + 0.051], [0, f0 + 0.051]], y, 0, 16);
    for (let i = 0; i < 4; i++) p.rbox(M.rubber, 0.006, 0.003, 0.005, 0, y + br + 0.004, -(f0 + 0.012 + i * 0.009), 0.001);
    for (const xs of [-1, 1]) for (let i = 0; i < 2; i++) p.rbox(M.rubber, 0.003, 0.004, 0.008, xs * (br + 0.0042), y, -(f0 + 0.016 + i * 0.016), 0.001);
    return f0 + 0.055;
  }
  if (kind === 'sup') {
    const r = br + 0.009, L = supLen;
    p.lathe(M.metal, [[0, f0], [br + 0.002, f0], [r, f0 + 0.012], [r, f0 + L - 0.01], [r - 0.004, f0 + L], [0.004, f0 + L], [0, f0 + L]], y, 0, 22);
    for (const k of [0.03, L - 0.03]) p.lathe(M.rubber, [[r + 0.0006, f0 + k], [r + 0.0006, f0 + k + 0.006]], y, 0, 22);
    return f0 + L + 0.005;
  }
  if (kind === 'choke') {
    p.lathe(M.steel, [[0, f0], [br + 0.0012, f0], [br + 0.002, f0 + 0.036], [br + 0.0005, f0 + 0.04], [0, f0 + 0.04]], y, 0, 16);
    for (let i = 0; i < 5; i++) p.lathe(M.metal, [[br + 0.0025, f0 + 0.004 + i * 0.005], [br + 0.0025, f0 + 0.0065 + i * 0.005]], y, 0, 16);
    return f0 + 0.042;
  }
  return f0;
}
function laserModule(p, g, M, x, y, f, w = 0.016) {
  M = mats();
  p.rbox(M.poly, w, 0.022, 0.05, x, y, -f, 0.003);
  p.rbox(M.poly, w * 0.6, 0.006, 0.012, x, y + 0.013, -(f - 0.012), 0.002);
  const lens = new THREE.CircleGeometry(0.0042, 14); lens.rotateY(Math.PI);
  p.add(M.lens, lens, x, y + 0.004, -(f + 0.0252));
  const emit = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), M.reticle);
  emit.rotation.y = Math.PI;
  emit.position.set(x, y + 0.004, -(f + 0.0262));
  g.add(emit);
  return emit;
}
let tabMat = null, mask = null;
// the housing seen round a scope's eyepiece: near-black at the rim, a faint lit edge on the inside of the
// eyecup, then the dark body falling away into a soft vignette
let ocularM = null;
function ocularMat() {
  return ocularM || (ocularM = new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.05, metalness: 1, envMapIntensity: 2.2, transparent: true, opacity: 1 }));
}
let shroudM = null;
function shroudMat() {
  if (shroudM) return shroudM;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), R = 128, k = 0.0232 / 0.32;
  const gr = x.createRadialGradient(R, R, R * k, R, R, R);
  gr.addColorStop(0, '#2a2e33'); gr.addColorStop(0.035, '#08090b'); gr.addColorStop(0.12, '#121417');
  gr.addColorStop(0.3, '#191b1f'); gr.addColorStop(0.65, '#0d0e10'); gr.addColorStop(1, '#050506');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  shroudM = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: true, toneMapped: false });
  shroudM.userData.keep = true;
  return shroudM;
}

// Real 3D gun models (loaded by assets.js). Each model is baked once into this file's gun frame (top of the
// pistol grip at the origin, barrel toward -z, metres): xf = { s: scale, ry: yaw, x, y, z: offset,
// keep?(x, y, z, partName): keep a triangle (cuts a gun out of a display scene) }.
const GUN_MODELS = {};
export function setGunModel(name, scene, xf) {
  const parts = new Map();
  scene.updateMatrixWorld(true);
  const bake = new THREE.Matrix4().compose(new THREE.Vector3(xf.x || 0, xf.y || 0, xf.z || 0),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), xf.ry || 0), new THREE.Vector3(xf.s, xf.s, xf.s));
  scene.traverse(o => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);       // the model's own node transforms
    const key = o.name.replace(/_low.*$/i, '').replace(/_LowPoly.*$/i, '').replace(/^LP/, '').toLowerCase();
    if (xf.keep && geo.index) {
      const P = geo.attributes.position, I = geo.index.array, kept = [];
      for (let t = 0; t < I.length; t += 3) {
        const cx = (P.getX(I[t]) + P.getX(I[t + 1]) + P.getX(I[t + 2])) / 3, cy = (P.getY(I[t]) + P.getY(I[t + 1]) + P.getY(I[t + 2])) / 3, cz = (P.getZ(I[t]) + P.getZ(I[t + 1]) + P.getZ(I[t + 2])) / 3;
        if (xf.keep(cx, cy, cz, key)) kept.push(I[t], I[t + 1], I[t + 2]);
      }
      if (!kept.length) return;
      geo.setIndex(kept);
    }
    geo.applyMatrix4(bake);
    geo.computeBoundingSphere();
    if (o.material.map) o.material.map.anisotropy = 8;
    parts.set(parts.has(key) ? key + parts.size : key, { geo, mat: o.material });
  });
  GUN_MODELS[name] = { parts };
}
export function hasGunModel(name) { return !!GUN_MODELS[name]; }
function addModelParts(name, target, filter, cast) {
  for (const [k, { geo, mat }] of GUN_MODELS[name].parts) {
    if (!filter(k)) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    mesh.name = k;
    target.add(mesh);
  }
}

// Builds a gun with the top of its pistol grip at the origin, barrel toward -z.
// Each added gun gets its own look on top of its type's procedural model: tinted furniture and metal, and
// parts that change the silhouette (curved or box magazines, a drum, a bipod, a longer barrel, a revolver's
// cylinder). Built at the gun's origin before it's placed anywhere.
const tintCache = new Map();
const tinted = (mat, hex) => {
  const k = mat.uuid + ':' + hex;
  if (!tintCache.has(k)) { const m = mat.clone(); m.color = new THREE.Color(hex); tintCache.set(k, m); }
  return tintCache.get(k);
};
function dressLook(look, type, g, mag, muzzle, M) {
  const box = new THREE.Box3().setFromObject(mag);
  const extra = new Parts(), mx = new Parts();
  const furn = look.furniture ? tinted(M.poly, look.furniture) : M.poly;
  if (!box.isEmpty()) {
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    if (look.curved) mx.rbox(furn, sz.x * 0.95, 0.07, sz.z * 0.95, c.x, box.min.y - 0.03, c.z - 0.02, 0.006, -0.35);   // AK banana curve
    if (look.box) { mx.rbox(M.metal, 0.09, 0.1, 0.12, c.x - 0.02, box.min.y + 0.02, c.z, 0.008); mx.rbox(furn, 0.092, 0.02, 0.122, c.x - 0.02, box.min.y - 0.035, c.z, 0.004); }
    if (look.drum) mx.lathe(M.metal, [[0, -0.03], [0.072, -0.03], [0.075, 0.0], [0.072, 0.03], [0, 0.03]], box.min.y - 0.05, c.x, 22).add(M.poly, new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10), c.x, box.min.y - 0.05, c.z, 0, 0, Math.PI / 2);
    if (look.extMag) mx.rbox(furn, sz.x * 0.95, 0.06, sz.z * 0.9, c.x, box.min.y - 0.025, c.z - 0.004, 0.004, 0.24);
  }
  if (look.bipod) for (const s of [-1, 1]) extra.rbox(M.metal, 0.008, 0.008, 0.22, s * 0.018, 0.02, muzzle.position.z + 0.28, 0.003, 0.06, 0, s * 0.12);
  if (look.long) {
    extra.lathe(M.steel, [[0, 0], [0.0085, 0], [0.0085, look.long], [0, look.long]], muzzle.position.y, 0, 14);
    extra.by.forEach(arr => arr.forEach(geo => geo.translate(0, 0, muzzle.position.z)));
    muzzle.position.z -= look.long;
  }
  if (look.revolver) { extra.lathe(M.metal, [[0, 0.0], [0.023, 0.0], [0.024, 0.042], [0, 0.042]], 0.045, 0, 14); extra.by.forEach(arr => arr.forEach(geo => geo.translate(0, 0, 0.02))); }
  if (look.big) extra.rbox(M.steel, 0.033, 0.03, 0.2, 0, 0.046, -0.08, 0.004);
  // AK-style gas tube over the barrel / heavy barrel shroud: changes the silhouette, not just the colour
  if (look.gastube) extra.rbox(M.poly, 0.026, 0.024, 0.2, 0, 0.078, -0.36, 0.008);
  if (look.shroud) extra.rbox(M.metal, 0.05, 0.05, 0.22, 0, 0.045, -0.42, 0.01);
  if (look.riser) extra.rbox(M.poly, 0.03, 0.035, 0.12, 0, 0.085, 0.25, 0.008);
  extra.build(g, true); mx.build(mag, true);
}
// Body materials for a gun with a look; optics, lasers and muzzle devices keep the stock materials (they use mats())
function lookMats(base, look) {
  if (!look) return base;
  const M = { ...base };
  if (look.wood) M.poly = base.wood;
  else if (look.tan) M.poly = base.tan;
  else if (look.olive) M.poly = base.olive;
  else if (look.furniture) M.poly = tinted(base.poly, look.furniture);
  if (look.grip) M.poly = tinted(base.poly, look.grip);
  if (look.metal) { M.metal = tinted(base.metal, look.metal); M.steel = tinted(base.steel, look.metal); }
  return M;
}

// Returns { group, muzzle, eject, foregrip, mag, magHome, sightY, sightZ, pump, bolt }
export function buildGun(id, { forViewmodel = false, att = null, detail = null } = {}) {
  DETAIL = detail ?? (forViewmodel ? 2 : GUN_DETAIL);
  const look = WEAPONS[id].model.look;
  const M = lookMats(mats(), look);
  const type = WEAPONS[id].model.type;
  const A = cleanAtt(id, att);
  let laser = null, eyeRelief, muzF;
  let frontZ = null, postTop = null;
  const sight = (o) => { sightY = o.sightY; sightZ = o.sightZ; eyeRelief = o.eyeRelief; if (o.frontZ !== undefined) { frontZ = o.frontZ; postTop = o.postTop; } };
  const g = new THREE.Group();
  const p = new Parts();
  const out = { group: g };
  const mag = new THREE.Group();
  const mp = new Parts();
  const muzzle = new THREE.Object3D(), eject = new THREE.Object3D(), foregrip = new THREE.Object3D();
  let sightY = 0.09, sightZ = -0.05;

  let sightX = 0;
  if (BUILDS[id]) {
    // the added guns: each has its own dedicated model (js/gunbuilds.js)
    const k = { p, mp, g, B: mats(), A, vm: forViewmodel, tinted, GRIP, Parts, addOptic, ironSights, muzzleDevice, laserModule, triggerGroup, opticReflex, opticHolo, eject, foregrip };
    const r = BUILDS[id](k);
    muzF = r.muzF; laser = r.laser;
    sight(r.sight); sightX = r.sight.sightX || 0;
    muzzle.position.set(0, r.BY, -muzF);
    out.magHome = new THREE.Vector3();
  } else if (id === 'rifle' && GUN_MODELS.ar15) {
    // ---- the AR-15 model (CC-BY 4.0, "AR-15 (game ready)" by IVA on Sketchfab) ----
    addModelParts('ar15', g, k => k !== 'mag' && k !== 'suppressor', !forViewmodel);
    addModelParts('ar15', mag, k => k === 'mag', !forViewmodel);
    out.magHome = new THREE.Vector3();
    // muzzle devices go on the model's barrel; its own suppressor only shows with the suppressor attachment
    const tip = 0.501;
    if (A.muzzle === 'sup') addModelParts('ar15', g, k => k === 'suppressor', !forViewmodel);
    muzF = A.muzzle === 'sup' ? 0.69 : muzzleDevice(p, M, A.muzzle, 0.045, tip, 0.0085);
    if (A.under === 'vgrip') {
      p.lathe(M.poly, [[0, 0], [0.0125, 0], [0.014, 0.012], [0.0145, 0.06], [0.012, 0.075], [0, 0.077]], 0, 0, 16);
      const vfg = p.by.get(M.poly).pop();
      vfg.applyMatrix4(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 + 0.12)) /* lathe runs along -z: swing it to hang down, bottom raked back */);
      vfg.translate(0, 0.012, -0.36);
      p.by.get(M.poly).push(vfg);
      foregrip.position.set(0, -0.024, -0.365);
    } else if (A.under === 'agrip') {
      p.profile(M.poly, [[0.26, 0.012], [0.365, 0.012], [0.35, -0.002, 0.006], [0.305, -0.018, 0.008], [0.28, -0.016, 0.006]], 0.028, { r: 0.006, bevel: 0.003 });
      foregrip.position.set(0, -0.008, -0.32);
    } else foregrip.position.set(0, 0.0, -0.34);
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.034, 0.035, 0.42);
    // sights ride the model's flat-top rail (top at y = 0.082)
    sight(A.optic === 'iron' ? ironSights(p, M, -0.02, 0.0865, 0.455, 0.0885, 0.018) : addOptic(A.optic, p, g, M, forViewmodel, 0.0858, 0.06));
    muzzle.position.set(0, 0.045, -muzF);
    eject.position.set(0.02, 0.04, -0.06);
  } else if (id === 'smg' && GUN_MODELS.tpm) {
    // ---- TPM SMG model (CC-BY 4.0, "TPM SMG" by TORI106 on Sketchfab): magazine in the grip, vertical foregrip ----
    addModelParts('tpm', g, () => true, !forViewmodel);
    A.under = 'vgrip';                       // the model has its own vertical foregrip: the support hand wraps it
    foregrip.position.set(0, -0.03, -0.158);
    out.magHome = new THREE.Vector3();
    muzF = Math.max(0.235, muzzleDevice(p, M, A.muzzle, 0.0595, 0.233, 0.009, 0.16));
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.03, 0.035, 0.2);
    sight(A.optic === 'iron' ? { sightY: 0.122, sightZ: 0.02 } : addOptic(A.optic, p, g, M, forViewmodel, 0.104, 0.04));
    muzzle.position.set(0, 0.0595, -muzF);
    eject.position.set(0.02, 0.06, -0.06);
  } else if (id === 'shotgun' && GUN_MODELS.r870) {
    // ---- Remington 870 model (CC-BY 4.0, "Remington 870 Shotgun" by Urpo on Sketchfab) ----
    // no pistol grip: the right hand wraps the wrist of the stock, just behind the trigger guard
    addModelParts('r870', g, () => true, !forViewmodel);
    out.rh = new THREE.Vector3(0.03, -0.03, 0.05);
    out.magHome = new THREE.Vector3(0, 0.03, -0.1);
    muzF = Math.max(0.72, muzzleDevice(p, M, A.muzzle, 0.062, 0.72, 0.0105, 0.2));
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.03, 0.035, 0.3);
    if (A.optic === 'iron') {
      // tactical ghost-ring sights: the receiver's hump rises above the barrel, so the sight line has to
      // run over it — an aperture on the back of the receiver and a protected post on a ramp at the muzzle
      sight({ ...ironSights(p, M, 0.13, 0.0835, 0.698, 0.058, 0.0165), eyeRelief: -0.12 });
    } else sight(addOptic(A.optic, p, g, M, forViewmodel, 0.085, 0.1));
    muzzle.position.set(0, 0.062, -muzF);
    eject.position.set(0.024, 0.07, -0.1);
    foregrip.position.set(0, -0.012, -0.48);
  } else if (id === 'sniper' && GUN_MODELS.sniper) {
    // ---- sniper rifle model (CC-BY 4.0, "Sniper rifle GameReady Free" by pashtetuser on Sketchfab) ----
    const scopeParts = (k) => k.startsWith('aim');
    addModelParts('sniper', g, k => k !== 'magazine' && k !== 'gate' && (A.optic === 'scope' || !scopeParts(k)) && !(A.muzzle === 'sup' && (k === 'muzzlebrake' || k === 'nutmuzzle')), !forViewmodel);
    addModelParts('sniper', mag, k => k === 'magazine', !forViewmodel);
    out.magHome = new THREE.Vector3();
    const bolt = new THREE.Group();
    addModelParts('sniper', bolt, k => k === 'gate', !forViewmodel);
    g.add(bolt);
    out.bolt = bolt; out.boltHome = 0;
    if (A.muzzle === 'sup') muzF = muzzleDevice(p, M, 'sup', 0.055, 0.73, 0.0115, 0.22);
    else muzF = 0.813;
    if (A.optic === 'scope') {
      // the model's own scope: look straight down its tube (the magnified view comes from the camera zoom)
      sight({ sightY: 0.128, sightZ: 0.057 });
    } else sight(A.optic === 'iron' ? ironSights(p, M, -0.02, 0.093, 0.22, 0.095, 0.016) : addOptic(A.optic, p, g, M, forViewmodel, 0.0925, 0.12));
    muzzle.position.set(0, 0.055, -muzF);
    eject.position.set(0.022, 0.06, -0.04);
    foregrip.position.set(0, -0.03, -0.3);
  } else if (id === 'pistol' && GUN_MODELS.g19) {
    // ---- Glock 19 model (CC-BY 4.0, "G19 Pistol, Game Ready, Free version" by Rotuma on Sketchfab) ----
    addModelParts('g19', g, () => true, !forViewmodel);
    out.magHome = new THREE.Vector3();
    muzF = Math.max(0.142, muzzleDevice(p, M, A.muzzle, 0.047, 0.141, 0.0075, 0.13));
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.012, 0.02, 0.1);
    // aimed at arm's length (not up against the eye like a rifle optic), so both hands show under the sights
    if (A.optic === 'reflex') sight({ ...opticReflex(p, g, M, 0.0755, 0.035, 0.8), eyeRelief: -0.3 });
    else sight({ sightY: 0.07, sightZ: 0.02, eyeRelief: -0.26 });   // front post on the crosshair
    muzzle.position.set(0, 0.047, -muzF);
    eject.position.set(0.016, 0.062, -0.05);
  } else if (type === 'launcher') {
    // ---- "The Monte": a shoulder rocket launcher. Tube with a flared venturi, heat shield, pistol grip and
    // forward grip, flip-up iron sights; the rocket's warhead sticks out of the front (it's the "magazine")
    const AX = 0.075;                                                     // tube axis height
    p.lathe(M.poly, [[0, -0.46], [0.047, -0.46], [0.047, 0.52], [0, 0.52]], AX, 0, 20);                     // tube
    p.lathe(M.metal, [[0.047, -0.46], [0.075, -0.6], [0.07, -0.62], [0.044, -0.48]], AX, 0, 20);            // venturi flare
    p.lathe(M.metal, [[0.05, 0.5], [0.053, 0.5], [0.053, 0.56], [0.05, 0.56]], AX, 0, 20);                  // muzzle ring
    for (const f of [-0.3, 0.05, 0.32]) p.lathe(M.metal, [[0.0475, f], [0.051, f], [0.051, f + 0.03], [0.0475, f + 0.03]], AX, 0, 18); // bands
    p.rbox(M.poly, 0.085, 0.012, 0.42, 0, AX - 0.05, -0.06, 0.004);                                          // heat shield / rail under the tube
    p.profile(M.poly, [[-0.005, AX - 0.05], [0.04, AX - 0.05], [0.035, 0.0, 0.006], [0.03, -0.05, 0.008], [0.026, -0.1, 0.01], [-0.02, -0.1, 0.01], [-0.022, -0.04, 0.012], [-0.02, AX - 0.05]], 0.032, { r: 0.008, bevel: 0.004 }); // pistol grip
    p.profile(M.metal, [[0.04, 0.0], [0.09, 0.0], [0.088, -0.024, 0.004], [0.044, -0.026, 0.004]], 0.008, { r: 0.004, holes: [[[0.048, -0.004], [0.084, -0.004], [0.082, -0.02], [0.05, -0.021]]] }); // trigger guard
    p.profile(M.poly, [[0.24, AX - 0.05], [0.29, AX - 0.05], [0.29, -0.06, 0.01], [0.25, -0.06, 0.01]], 0.034, { r: 0.01, bevel: 0.004 }); // forward grip
    p.rbox(M.poly, 0.02, 0.035, 0.08, -0.06, AX + 0.01, 0.18, 0.004);                                        // optic mount block (left side)
    // flip-up sights: rear aperture and a front post on a tall leaf, on top of the tube
    const SY = AX + 0.047;
    p.rbox(M.metal, 0.03, 0.03, 0.006, 0, SY + 0.012, 0.05, 0.002);
    p.rbox(M.recess, 0.008, 0.008, 0.008, 0, SY + 0.02, 0.05, 0.001);
    p.rbox(M.metal, 0.004, 0.034, 0.006, 0, SY + 0.016, -0.36, 0.001);
    p.rbox(M.metal, 0.02, 0.006, 0.01, 0, SY + 0.002, -0.36, 0.001);
    sight({ sightY: SY + 0.02, sightZ: 0.05, eyeRelief: -0.16 });
    // the rocket: warhead nose, fins hidden in the tube
    mp.lathe(M.olive, [[0, 0.52], [0.042, 0.52], [0.06, 0.6], [0.064, 0.66], [0.05, 0.76], [0.02, 0.84], [0, 0.86]], AX, 0, 20);
    mp.lathe(M.metal, [[0.039, 0.5], [0.044, 0.5], [0.044, 0.53], [0.039, 0.53]], AX, 0, 16);
    out.magHome = new THREE.Vector3();
    muzF = 0.86;
    muzzle.position.set(0, AX, -muzF);
    eject.position.set(0, AX, 0.6);
    foregrip.position.set(0, -0.03, -0.27);
  } else if (type === 'rifle') {
    // ---- lower receiver (forged aluminium): magwell, trigger guard, pins, controls ----
    p.profile(M.metal, [[-0.06, 0.0], [0.175, 0.0], [0.175, -0.014], [0.16, -0.02], [0.158, -0.056, 0.003], [0.084, -0.056, 0.003], [0.08, -0.016], [0.03, -0.012], [-0.03, -0.018], [-0.062, -0.004]], 0.027, { r: 0.004, bevel: 0.0015 });
    p.profile(M.metal, [[0.081, -0.044], [0.159, -0.044], [0.161, -0.058, 0.002], [0.079, -0.058, 0.002]], 0.031, { r: 0.002, bevel: 0.0012 }); // flared magwell lip
    p.profile(M.metal, [[0.1, -0.012], [0.15, -0.012], [0.15, -0.042], [0.1, -0.042]], 0.0285, { r: 0.006, bevel: 0.0008 }); // magwell side panel
    for (const [f, y] of [[0.166, -0.008], [-0.044, -0.008]]) p.add(M.steel, new THREE.CylinderGeometry(0.003, 0.003, 0.0295, 12), 0, y, -f, 0, 0, Math.PI / 2); // takedown / pivot pins
    p.add(M.metal, new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 16), 0.0145, -0.021, -0.072, 0, 0, Math.PI / 2); // mag release
    p.add(M.metal, new THREE.CylinderGeometry(0.0072, 0.0072, 0.002, 16), 0.0137, -0.021, -0.072, 0, 0, Math.PI / 2);
    p.profile(M.metal, [[0.05, -0.006], [0.072, -0.004], [0.072, -0.018], [0.058, -0.02]], 0.0315, { r: 0.002, bevel: 0.0008 }); // bolt catch paddle
    p.add(M.metal, new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 16), -0.0148, -0.004, 0.0, 0, 0, Math.PI / 2); // selector
    p.rbox(M.metal, 0.003, 0.004, 0.022, -0.017, -0.004, 0.006, 0.001, 0.25);
    p.profile(M.tan, GRIP, 0.03, { bevel: 0.005, r: 0.01 });
    p.profile(M.tan, [[-0.032, -0.096], [-0.026, -0.124], [0.012, -0.122], [0.016, -0.108]], 0.031, { bevel: 0.004, r: 0.006 }); // grip base flare
    triggerGroup(p, M, -0.005);
    // ---- upper receiver: ejection port + dust cover, forward assist, brass deflector, charging handle ----
    p.profile(M.metal, [[-0.055, 0.0], [0.185, 0.0], [0.185, 0.052, 0.003], [0.18, 0.058, 0.003], [-0.05, 0.058, 0.003], [-0.055, 0.052, 0.003]], 0.03, { r: 0.004, bevel: 0.0015 });
    p.rbox(M.recess, 0.002, 0.016, 0.058, 0.015, 0.03, -0.068, 0.002);           // ejection port
    p.rbox(M.steel, 0.001, 0.012, 0.05, 0.0153, 0.03, -0.068, 0.0006);           // bolt carrier visible through it
    p.rbox(M.metal, 0.0012, 0.006, 0.062, 0.0158, 0.016, -0.068, 0.0006);         // dust cover (open, hinged below)
    p.add(M.steel, new THREE.CylinderGeometry(0.0012, 0.0012, 0.064, 8), 0.0158, 0.012, -0.068, Math.PI / 2, 0, 0);
    p.profile(M.metal, [[-0.012, 0.03], [0.012, 0.03], [0.006, 0.05], [-0.01, 0.05]], 0.034, { r: 0.004, bevel: 0.001 }); // brass deflector
    p.lathe(M.metal, [[0, -0.03], [0.0095, -0.03], [0.0095, 0.004], [0, 0.012]], 0.038, 0.017, 14);  // forward assist housing
    p.lathe(M.steel, [[0, -0.044], [0.0075, -0.044], [0.0075, -0.03], [0, -0.03]], 0.038, 0.017, 14);
    p.rbox(M.metal, 0.034, 0.008, 0.028, 0, 0.061, 0.052, 0.002);                // charging handle
    p.rbox(M.metal, 0.05, 0.006, 0.012, 0, 0.061, 0.064, 0.002);
    p.rail(M.metal, -0.05, 0.18, 0.058);
    // ---- free-float M-LOK handguard ----
    const H0 = 0.017, H1 = 0.0645, hw = 0.0255, ch = 0.011;
    const hgPts = [[-hw + ch, H0], [hw - ch, H0], [hw, H0 + ch], [hw, H1 - 0.004], [-hw, H1 - 0.004], [-hw, H0 + ch]];
    const bore = Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2; return [Math.cos(a) * 0.0125, 0.045 + Math.sin(a) * 0.0125]; });
    p.frontal(M.tan, hgPts, 0.188, 0.49, [bore], 0.003, 0.0012);
    p.frontal(M.metal, [[-0.02, 0.022], [0.02, 0.022], [0.02, 0.06], [-0.02, 0.06]], 0.185, 0.192, [], 0.012); // barrel nut collar
    for (let i = 0; i < 5; i++) {
      const f = 0.225 + i * 0.054;
      for (const xs of [-1, 1]) {
        p.rbox(M.recess, 0.002, 0.008, 0.032, xs * (hw + 0.0002), 0.041, -f, 0.002);                       // side slots
        const cx = xs * (hw - ch / 2 + 0.0004), cy = H0 + ch / 2 - 0.0004;
        p.rbox(M.recess, 0.002, 0.007, 0.026, cx, cy, -f, 0.002, 0, 0, xs * Math.PI / 4);                  // 45-degree slots
      }
      p.rbox(M.recess, 0.008, 0.002, 0.032, 0, H0 - 0.0002, -f, 0.002);                                     // bottom slots
    }
    p.rail(M.metal, 0.19, 0.488, 0.0605);
    // ---- barrel, gas block (under the handguard), A2-style flash hider ----
    p.lathe(M.steel, [[0, 0.48], [0.0085, 0.48], [0.0085, 0.6], [0.0095, 0.603], [0.0095, 0.61], [0.0085, 0.613], [0.0085, 0.62], [0, 0.62]], 0.045, 0, 18);
    muzF = muzzleDevice(p, M, A.muzzle, 0.045, 0.62, 0.0085);
    // ---- underbarrel ----
    if (A.under === 'vgrip') {
      p.lathe(M.poly, [[0, 0], [0.0125, 0], [0.014, 0.012], [0.0145, 0.06], [0.012, 0.075], [0, 0.077]], 0, 0, 16);
      const vfg = p.by.get(M.poly).pop();
      vfg.applyMatrix4(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 + 0.12)) /* lathe runs along -z: swing it to hang down, bottom raked back */);
      vfg.translate(0, 0.016, -0.38);
      p.by.get(M.poly).push(vfg);
      p.rbox(M.poly, 0.018, 0.006, 0.04, 0, 0.0145, -0.38, 0.002);
      foregrip.position.set(0, -0.02, -0.385);
    } else if (A.under === 'agrip') {
      p.profile(M.poly, [[0.27, 0.018], [0.375, 0.018], [0.36, 0.004, 0.006], [0.315, -0.012, 0.008], [0.29, -0.01, 0.006]], 0.028, { r: 0.006, bevel: 0.003 });
      foregrip.position.set(0, -0.004, -0.33);
    } else foregrip.position.set(0, 0.004, -0.36);
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.034, 0.041, 0.43);
    // ---- receiver extension (buffer tube), castle nut, end plate, CTR-style stock ----
    p.lathe(M.metal, [[0, 0.05], [0.0155, 0.05], [0.0155, 0.262], [0.012, 0.268], [0, 0.268]].map(([r, f]) => [r, -f]).reverse(), 0.034, 0, 20);
    p.lathe(M.metal, [[0, -0.062], [0.0195, -0.062], [0.0195, -0.05], [0, -0.05]], 0.034, 0, 10); // castle nut (notched look from 10 sides)
    p.frontal(M.steel, [[-0.0145, 0.004], [0.0145, 0.004], [0.0145, 0.05], [-0.0145, 0.05]], -0.066, -0.062, [], 0.008); // end plate
    const stock = [[-0.168, 0.0545, 0.006], [-0.3, 0.0545, 0.008], [-0.312, 0.046, 0.006], [-0.318, -0.06, 0.006], [-0.306, -0.07, 0.008], [-0.286, -0.066, 0.01],
      [-0.232, -0.026, 0.02], [-0.2, 0.004, 0.012], [-0.168, 0.011, 0.006]];
    p.profile(M.tan, stock, 0.036, { bevel: 0.0045, r: 0.008 });
    p.profile(M.tan, [[-0.19, 0.03], [-0.298, 0.03], [-0.302, 0.054, 0.008], [-0.196, 0.054, 0.008]], 0.041, { bevel: 0.004, r: 0.008 }); // cheek weld
    p.profile(M.poly, [[-0.172, 0.0], [-0.21, -0.004], [-0.206, -0.012], [-0.176, -0.01]], 0.014, { r: 0.003, bevel: 0.0015 });        // adjustment lever
    p.profile(M.rubber, [[-0.31, 0.056], [-0.322, 0.056], [-0.33, -0.064], [-0.318, -0.072]], 0.04, { bevel: 0.004, r: 0.006 });
    for (let i = 0; i < 6; i++) p.rbox(M.recess, 0.041, 0.0015, 0.004, 0, 0.04 - i * 0.019, 0.325 + i * 0.0012, 0.0006); // buttpad ribs
    // ---- optic ----
    sight(A.optic === 'iron' ? ironSights(p, M, -0.03, 0.0685, 0.465, 0.071, 0.018) : addOptic(A.optic, p, g, M, forViewmodel, 0.064, 0.055));
    // ---- polymer 30-round magazine: slight curve, ribbed lower body, flared baseplate ----
    const magPts = [[0.152, -0.04], [0.156, -0.11, 0.03], [0.166, -0.18, 0.04], [0.181, -0.207, 0.006], [0.124, -0.226, 0.006], [0.106, -0.2, 0.04], [0.096, -0.12, 0.03], [0.091, -0.04]];
    mp.profile(M.tan, magPts, 0.0235, { r: 0.006, bevel: 0.0018 });
    mp.profile(M.tan, [[0.118, -0.222], [0.186, -0.204], [0.19, -0.214, 0.003], [0.124, -0.236, 0.004], [0.114, -0.232, 0.003]], 0.028, { r: 0.003, bevel: 0.002 }); // baseplate
    for (let i = 0; i < 5; i++) {
      const t = i / 4, f0 = 0.11 + t * 0.012, f1 = 0.168 + t * 0.012, y = -0.155 - i * 0.011;
      mp.rbox(M.tan, 0.025, 0.0028, f1 - f0, 0, y, -(f0 + f1) / 2 - 0.004, 0.0012, -0.2);                   // grip ribs
    }
    mp.rbox(M.recess, 0.024, 0.016, 0.016, 0, -0.047, -0.12, 0.002);                                       // feed lips / top round
    mp.add(M.brass, new THREE.CylinderGeometry(0.0048, 0.0048, 0.03, 10), 0, -0.038, -0.124, Math.PI / 2 + 0.05, 0, 0);
    out.magHome = new THREE.Vector3();
    muzzle.position.set(0, 0.045, -muzF);
    eject.position.set(0.02, 0.035, -0.06);
  } else if (type === 'smg') {
    // roller-delayed 9 mm SMG: stamped steel receiver with its cocking tube, slim handguard, hooded front
    // sight, drum rear sight, curved steel magazine, retractable stock
    p.profile(M.metal, [[-0.045, 0.0], [0.27, 0.0], [0.27, 0.058, 0.01], [0.255, 0.07, 0.012], [-0.03, 0.07, 0.012], [-0.045, 0.058, 0.01]], 0.034, { r: 0.006, bevel: 0.0025 });
    for (const xs of [-1, 1]) {
      p.rbox(M.recess, 0.0012, 0.003, 0.25, xs * 0.0172, 0.016, -0.115, 0.0006);  // stamped side ribs
      p.rbox(M.recess, 0.0012, 0.003, 0.25, xs * 0.0172, 0.052, -0.115, 0.0006);
    }
    p.rbox(M.recess, 0.0015, 0.016, 0.05, 0.0172, 0.034, -0.1, 0.002);              // ejection port
    p.lathe(M.metal, [[0, 0.14], [0.0095, 0.14], [0.0095, 0.452], [0.007, 0.457], [0, 0.457]], 0.071, 0, 16); // cocking tube
    p.rbox(M.metal, 0.005, 0.012, 0.03, -0.0105, 0.074, -0.165, 0.002, 0, 0, 0.3); // cocking handle (folded forward)
    p.add(M.poly, new THREE.SphereGeometry(0.0055, 10, 8), -0.017, 0.081, -0.152);
    // front sight hood on the cocking tube
    p.frontal(M.metal, [[-0.009, 0.074], [0.009, 0.074], [0.009, 0.082], [-0.009, 0.082]], 0.425, 0.455, [], 0.002);
    p.lathe(M.metal, [[0.0145, 0.425], [0.0165, 0.428], [0.0165, 0.452], [0.0145, 0.455]], 0.096, 0, 20);
    p.lathe(M.metal, [[0.0145, 0.455], [0.0145, 0.425]], 0.096, 0, 20);
    p.rbox(M.metal, 0.002, 0.012, 0.004, 0, 0.09, -0.44, 0.0008);
    // rear drum sight: the drum sits low and carries a ring aperture centred on the sight line, so
    // aiming looks through the ring at the front post (nothing solid crosses the line of sight)
    // (folded away when an optic is mounted, so it never rings the optic's view)
    if (A.optic === 'iron') {
      p.add(M.metal, new THREE.CylinderGeometry(0.0085, 0.0085, 0.022, 16), 0, 0.0805, 0.005, 0, 0, Math.PI / 2);
      p.rbox(M.metal, 0.02, 0.01, 0.012, 0, 0.076, 0.005, 0.002);
      p.lathe(M.metal, [[0.0068, -0.009], [0.0086, -0.009], [0.0086, -0.001], [0.0068, -0.001], [0.0068, -0.009]], 0.096, 0, 24); // thin ghost ring
      for (const xs of [-1, 1]) p.rbox(M.metal, 0.003, 0.01, 0.008, xs * 0.0078, 0.0855, 0.005, 0.001); // ring posts
    } else p.rbox(M.metal, 0.02, 0.006, 0.012, 0, 0.074, 0.005, 0.002); // folded rear sight
    // slim polymer handguard
    p.profile(M.poly, [[0.24, 0.06], [0.39, 0.056, 0.014], [0.404, 0.032, 0.014], [0.396, -0.006, 0.014], [0.27, -0.01, 0.01], [0.24, 0.004]], 0.044, { bevel: 0.006, r: 0.012 });
    for (let i = 0; i < 5; i++) p.rbox(M.recess, 0.046, 0.0025, 0.006, 0, 0.002, -0.27 - i * 0.026, 0.001);
    p.lathe(M.steel, [[0, 0.405], [0.0095, 0.405], [0.0095, 0.465], [0.012, 0.47], [0.012, 0.48], [0, 0.48]], 0.036, 0, 16);
    muzF = Math.max(0.485, muzzleDevice(p, M, A.muzzle, 0.036, 0.48, 0.0095, 0.16));
    if (A.under === 'vgrip') {
      p.lathe(M.poly, [[0, 0], [0.0125, 0], [0.014, 0.012], [0.0145, 0.06], [0.012, 0.075], [0, 0.077]], 0, 0, 16);
      const vfg = p.by.get(M.poly).pop();
      vfg.applyMatrix4(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 + 0.12)) /* lathe runs along -z: swing it to hang down, bottom raked back */);
      vfg.translate(0, -0.012, -0.34);
      p.by.get(M.poly).push(vfg);
      foregrip.position.set(0, -0.052, -0.345);
    } else if (A.under === 'agrip') {
      p.profile(M.poly, [[0.285, -0.008], [0.375, -0.008], [0.36, -0.022, 0.006], [0.32, -0.036, 0.008], [0.3, -0.032, 0.006]], 0.03, { r: 0.006, bevel: 0.003 });
      foregrip.position.set(0, -0.024, -0.335);
    } else foregrip.position.set(0, -0.012, -0.31); // low on the handguard so the fingers stay out of the sight picture
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.032, 0.03, 0.34);
    // magwell + trigger housing
    p.profile(M.metal, [[0.122, 0.0], [0.162, 0.0], [0.162, -0.03, 0.004], [0.122, -0.03, 0.004]], 0.03, { r: 0.004, bevel: 0.0015 });
    p.profile(M.metal, [[0.166, -0.012], [0.176, -0.012], [0.176, -0.022], [0.166, -0.022]], 0.034, { r: 0.002, bevel: 0.001 }); // paddle release
    p.profile(M.poly, [[-0.035, 0.0], [0.1, 0.0], [0.1, -0.018], [0.06, -0.02], [0.03, -0.014], [-0.035, -0.014]], 0.03, { r: 0.006 });
    p.profile(M.poly, GRIP, 0.032, { bevel: 0.005, r: 0.01 });
    triggerGroup(p, M, -0.002, 0.012);
    p.add(M.steel, new THREE.CylinderGeometry(0.0025, 0.0025, 0.0315, 10), 0, -0.007, 0.03, 0, 0, Math.PI / 2);
    p.add(M.metal, new THREE.CylinderGeometry(0.006, 0.006, 0.003, 14), -0.016, -0.006, -0.005, 0, 0, Math.PI / 2); // selector
    p.rail(M.metal, 0.03, 0.15, 0.07, 0.02);
    // retractable stock: twin rails and a curved butt plate
    for (const [y, x] of [[0.052, 0.012], [0.052, -0.012], [0.016, 0.012], [0.016, -0.012]]) p.lathe(M.steel, [[0, 0.035], [0.0035, 0.035], [0.0035, 0.29], [0, 0.29]].map(([r, f]) => [r, -f]).reverse(), y, x, 10);
    p.profile(M.metal, [[-0.035, 0.062], [-0.06, 0.062], [-0.06, 0.006], [-0.035, 0.006]], 0.038, { r: 0.008, bevel: 0.003 }); // stock housing block
    p.profile(M.metal, [[-0.285, 0.066], [-0.305, 0.07, 0.01], [-0.31, -0.03, 0.02], [-0.296, -0.06, 0.01], [-0.284, -0.05], [-0.288, 0.0]], 0.04, { r: 0.006, bevel: 0.003 });
    p.profile(M.rubber, [[-0.304, 0.07], [-0.314, 0.07], [-0.32, -0.03, 0.02], [-0.306, -0.064, 0.01], [-0.298, -0.06]], 0.042, { r: 0.004, bevel: 0.003 });
    sight(A.optic === 'iron' ? { sightY: 0.096, sightZ: -0.005 } : addOptic(A.optic, p, g, M, forViewmodel, 0.07, 0.09));
    // curved steel 30-round magazine with stiffening ribs
    const smgMag = [[0.145, 0.0], [0.158, -0.07, 0.03], [0.178, -0.14, 0.04], [0.2, -0.178, 0.006], [0.172, -0.194, 0.006], [0.152, -0.155, 0.04], [0.134, -0.085, 0.03], [0.124, 0.0]];
    mp.profile(M.steel, smgMag, 0.022, { r: 0.004, bevel: 0.0015 });
    for (const xs of [-1, 1]) mp.profile(M.steel, [[0.14, -0.035], [0.15, -0.09, 0.03], [0.166, -0.14, 0.03], [0.17, -0.138], [0.155, -0.088, 0.03], [0.145, -0.035]], 0.003, { x: xs * 0.0105, r: 0.002, bevel: 0.0006 });
    mp.profile(M.steel, [[0.17, -0.19], [0.204, -0.174], [0.206, -0.181, 0.002], [0.174, -0.198, 0.003]], 0.025, { r: 0.002, bevel: 0.0012 }); // floorplate
    out.magHome = new THREE.Vector3();
    muzzle.position.set(0, 0.036, -muzF);
    eject.position.set(0.02, 0.04, -0.1);
  } else if (type === 'shotgun') {
    p.profile(M.metal, [[-0.035, -0.008], [0.205, -0.008], [0.205, 0.078], [0.02, 0.08, 0.02], [-0.035, 0.06]], 0.037, { r: 0.008, bevel: 0.003 });
    p.rbox(M.steel, 0.002, 0.022, 0.07, 0.0187, 0.045, -0.08, 0.002);
    p.lathe(M.steel, [[0, 0.2], [0.0105, 0.2], [0.0105, 0.705], [0.0085, 0.71], [0, 0.71]], 0.064);
    const tEnd = A.mag === 'ext' ? 0.69 : 0.6;
    p.lathe(M.metal, [[0, 0.2], [0.012, 0.2], [0.012, tEnd], [0.0125, tEnd], [0.0125, tEnd + 0.025], [0.009, tEnd + 0.03], [0, tEnd + 0.03]], 0.028);
    if (A.mag === 'ext') p.frontal(M.metal, [[-0.014, 0.022], [0.014, 0.022], [0.014, 0.07], [-0.014, 0.07]], 0.66, 0.675, [[[-0.0125, 0.0155], [0.0125, 0.0155], [0.0125, 0.04], [-0.0125, 0.04]]], 0.006);
    muzF = Math.max(0.71, muzzleDevice(p, M, A.muzzle, 0.064, 0.71, 0.0105, 0.2));
    if (A.optic === 'iron') {
      p.add(M.brass, new THREE.SphereGeometry(0.0022, 10, 8), 0, 0.077, -0.698);
      p.rbox(M.metal, 0.012, 0.012, 0.012, 0, 0.084, -0.02, 0.002);
    } else {
      p.rail(M.metal, -0.03, 0.16, 0.077, 0.02);
      sight(addOptic(A.optic, p, g, M, forViewmodel, 0.086, 0.06));
    }
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.02, 0.064, 0.655, 0.012);
    // walnut stock: straight comb, gentle grip swell, recoil pad; receiver with ejection + loading ports
    p.profile(M.wood, [[-0.03, 0.054], [-0.15, 0.044, 0.02], [-0.392, 0.032, 0.01], [-0.405, -0.1, 0.008], [-0.378, -0.106, 0.012], [-0.15, -0.046, 0.03], [-0.085, -0.07, 0.02], [-0.045, -0.06, 0.015], [-0.02, -0.016, 0.01], [-0.012, -0.004]], 0.04, { bevel: 0.006, r: 0.012 });
    p.profile(M.rubber, [[-0.392, 0.034], [-0.412, 0.032], [-0.425, -0.102], [-0.405, -0.108]], 0.044, { bevel: 0.004, r: 0.006 });
    p.rbox(M.recess, 0.002, 0.024, 0.06, 0.0187, 0.05, -0.085, 0.003);              // ejection port
    p.rbox(M.steel, 0.001, 0.018, 0.05, 0.0188, 0.05, -0.085, 0.002);               // bolt face behind it
    p.rbox(M.recess, 0.02, 0.002, 0.07, 0, -0.008, -0.11, 0.002);                   // loading port
    p.add(M.steel, new THREE.CylinderGeometry(0.003, 0.003, 0.0375, 10), 0, 0.01, -0.02, 0, 0, Math.PI / 2);
    p.add(M.steel, new THREE.CylinderGeometry(0.003, 0.003, 0.0375, 10), 0, 0.01, -0.17, 0, 0, Math.PI / 2);
    p.rbox(M.metal, 0.012, 0.006, 0.012, 0, -0.013, -0.005, 0.002);                  // safety
    p.add(M.metal, new THREE.TorusGeometry(0.0125, 0.0018, 6, 18), 0, 0.028, -0.63);  // barrel band on the mag tube
    triggerGroup(p, M, 0.0, 0.013);
    const pump = new THREE.Group();
    const pp = new Parts();
    pp.profile(M.wood, [[-0.095, 0.002], [0.095, 0.002], [0.095, 0.056], [-0.095, 0.056]], 0.05, { bevel: 0.007, r: 0.014 });
    for (let i = 0; i < 7; i++) pp.rbox(M.rubber, 0.054, 0.003, 0.004, 0, 0.012, -0.072 + i * 0.024, 0.001);
    pp.build(pump, !forViewmodel);
    pump.position.set(0, 0.0, -0.39);
    g.add(pump);
    out.pump = pump;
    out.pumpHome = -0.39;
    mp.lathe(M.brass, [[0, 0], [0.009, 0], [0.009, 0.012], [0, 0.012]], 0, 0, 10);
    mp.lathe(M.rubber, [[0, 0.012], [0.0088, 0.012], [0.0088, 0.065], [0, 0.065]], 0, 0, 10);
    out.magHome = new THREE.Vector3(0, 0.03, -0.1);
    if (A.optic === 'iron') { sightY = 0.08; sightZ = -0.02; }
    muzzle.position.set(0, 0.064, -muzF);
    eject.position.set(0.022, 0.045, -0.08);
    foregrip.position.set(0, 0.0, -0.39);
  } else if (type === 'sniper') {
    // chassis with thumbhole stock
    p.profile(M.olive, [[-0.09, 0.034], [0.37, 0.034, 0.012], [0.385, 0.004, 0.01], [0.37, -0.026, 0.01], [0.055, -0.026], [0.045, -0.06, 0.01], [-0.02, -0.13, 0.012], [-0.06, -0.128, 0.012], [-0.115, -0.045, 0.02], [-0.37, -0.062, 0.02], [-0.415, -0.08, 0.01], [-0.43, 0.07, 0.01], [-0.16, 0.074, 0.02]], 0.05,
      { bevel: 0.005, r: 0.01, holes: [[[-0.07, -0.012], [-0.115, -0.012], [-0.128, -0.04], [-0.058, -0.095]]] });
    p.profile(M.olive, [[-0.19, 0.074], [-0.38, 0.074], [-0.38, 0.096, 0.01], [-0.2, 0.096, 0.01]], 0.04, { bevel: 0.004, r: 0.008 });
    p.profile(M.rubber, [[-0.428, 0.07], [-0.445, 0.07], [-0.448, -0.082], [-0.432, -0.082]], 0.052, { bevel: 0.004, r: 0.006 });
    p.lathe(M.metal, [[0, -0.1], [0.0175, -0.1], [0.019, -0.09], [0.019, 0.13], [0.0175, 0.14], [0, 0.14]].map(([r, f]) => [r, f]), 0.055, 0, 20);
    p.lathe(M.steel, [[0, 0.14], [0.014, 0.14], [0.014, 0.21], [0.0115, 0.27], [0.0105, 0.63], [0, 0.63]], 0.055, 0, 16);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.rbox(M.metal, 0.003, 0.003, 0.3, Math.cos(a) * 0.0108, 0.055 + Math.sin(a) * 0.0108, -0.43, 0.001); }
    if (A.muzzle === 'sup') muzF = muzzleDevice(p, M, 'sup', 0.055, 0.63, 0.0115, 0.22);
    else {
      p.lathe(M.metal, [[0, 0.63], [0.017, 0.63], [0.018, 0.64], [0.018, 0.71], [0.012, 0.715], [0, 0.715]], 0.055, 0, 18);
      for (let i = 0; i < 4; i++) p.rbox(M.rubber, 0.038, 0.004, 0.006, 0, 0.072, -0.655 - i * 0.014, 0.001);
      muzF = 0.72;
    }
    for (const x of [-0.012, 0.012]) p.lathe(M.metal, [[0, 0.12], [0.004, 0.12], [0.004, 0.33], [0, 0.33]], -0.03, x, 8);
    p.rbox(M.metal, 0.034, 0.06, 0.085, 0, -0.045, -0.09, 0.005);
    p.lathe(M.metal, [[0, 0.115], [0.0185, 0.115], [0.016, 0.1], [0.012, 0.085], [0, 0.085]].map(([r, f]) => [r, -f]).reverse(), 0.055, 0, 18); // bolt shroud
    p.rbox(M.recess, 0.002, 0.016, 0.06, 0.0195, 0.058, -0.03, 0.002);            // ejection port
    triggerGroup(p, M, -0.01, 0.014);
    p.add(M.steel, new THREE.CylinderGeometry(0.004, 0.004, 0.012, 10), 0, -0.032, -0.35);  // bipod stud
    for (let i = 0; i < 6; i++) p.rbox(M.recess, 0.051, 0.002, 0.006, 0, -0.02, -0.17 - i * 0.025, 0.001); // fore-end vents
    // optic: scope on rings, or a short rail for the others
    if (A.optic === 'scope') sight(opticScope(p, M, 0.066, 0));
    else {
      p.rail(M.metal, -0.09, 0.13, 0.072, 0.022);
      sight(A.optic === 'iron' ? ironSights(p, M, -0.07, 0.0825, 0.6, 0.065, 0.016) : addOptic(A.optic, p, g, M, forViewmodel, 0.08, 0.02));
    }
    const bolt = new THREE.Group();
    const bp = new Parts();
    bp.lathe(M.steel, [[0, -0.02], [0.007, -0.02], [0.007, 0.02], [0, 0.02]], 0, 0, 10);
    bp.add(M.steel, new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 8), 0.025, -0.008, 0, 0, 0, Math.PI / 2 - 0.45);
    bp.add(M.poly, new THREE.SphereGeometry(0.0095, 12, 8), 0.048, -0.019, 0);
    bp.build(bolt, !forViewmodel);
    bolt.position.set(0.012, 0.055, 0.06);
    g.add(bolt);
    out.bolt = bolt;
    out.boltHome = 0.06;
    mp.rbox(M.metal, 0.03, 0.06, 0.08, 0, -0.035, -0.09, 0.004);
    out.magHome = new THREE.Vector3();
    muzzle.position.set(0, 0.055, -muzF);
    eject.position.set(0.022, 0.06, -0.04);
    foregrip.position.set(0, -0.03, -0.3);
  } else { // pistol: striker-fired polymer frame, steel slide
    // slide: chamfered top edges and nose, front + rear serrations, ejection port with the barrel hood
    p.profile(M.metal, [[-0.022, 0.03], [0.172, 0.03], [0.178, 0.036, 0.003], [0.178, 0.056, 0.004], [0.17, 0.0635, 0.004], [-0.018, 0.0635, 0.003], [-0.022, 0.058, 0.002]], 0.0255, { r: 0.003, bevel: 0.0022 });
    for (let i = 0; i < 8; i++) for (const xs of [-1, 1]) p.rbox(M.recess, 0.0012, 0.022, 0.0016, xs * 0.0128, 0.046, 0.016 - i * 0.0052, 0.0005);
    for (let i = 0; i < 5; i++) for (const xs of [-1, 1]) p.rbox(M.recess, 0.0012, 0.02, 0.0016, xs * 0.0128, 0.046, -0.14 - i * 0.0052, 0.0005);
    p.rbox(M.recess, 0.014, 0.003, 0.05, 0.003, 0.063, -0.07, 0.001);             // ejection port
    p.rbox(M.steel, 0.012, 0.002, 0.044, 0.003, 0.0625, -0.068, 0.0008);          // barrel hood
    p.lathe(M.steel, [[0, 0.17], [0.0075, 0.17], [0.0075, 0.18], [0.0045, 0.18], [0, 0.18]], 0.047, 0, 14);
    p.add(M.recess, new THREE.CircleGeometry(0.0045, 12), 0, 0.047, -0.1805);
    p.rbox(M.recess, 0.0014, 0.012, 0.03, 0.0128, 0.04, -0.06, 0.0006);           // slide / frame gap line
    // sights: notch rear, post front with dots
    for (const x of [-0.0072, 0.0072]) p.rbox(M.steel, 0.0068, 0.0075, 0.007, x, 0.0665, 0.012, 0.0014);
    p.rbox(M.steel, 0.022, 0.003, 0.007, 0, 0.0645, 0.012, 0.001);
    p.rbox(M.steel, 0.0038, 0.007, 0.005, 0, 0.0665, -0.162, 0.0012);
    // frame: dust cover with accessory rail, trigger guard, grip with stipple, beavertail and finger grooves
    p.profile(M.poly, [[-0.018, 0.0305], [0.155, 0.0305], [0.158, 0.014, 0.003], [0.07, 0.012], [0.05, 0.0], [0.002, 0.0]], 0.0265, { r: 0.004, bevel: 0.0015 });
    for (let i = 0; i < 3; i++) p.rbox(M.recess, 0.02, 0.003, 0.004, 0, 0.0135, -(0.1 + i * 0.016), 0.0008);
    p.profile(M.poly, [[-0.004, 0.02], [0.034, 0.014], [0.031, -0.006, 0.008], [0.026, -0.026, 0.006], [0.029, -0.04, 0.006], [0.021, -0.054, 0.006], [0.024, -0.068, 0.006], [0.015, -0.098, 0.01],
      [-0.022, -0.104, 0.008], [-0.03, -0.088, 0.008], [-0.026, -0.03, 0.02], [-0.034, 0.014, 0.008], [-0.024, 0.026, 0.006]], 0.03, { bevel: 0.005, r: 0.01 });
    p.profile(M.poly, [[0.002, 0.004], [0.07, 0.004], [0.072, -0.03, 0.006], [0.008, -0.034]], 0.012, { r: 0.006, holes: [[[0.01, -0.002], [0.063, -0.002], [0.064, -0.024], [0.012, -0.027]]] });
    p.profile(M.metal, [[0.028, 0.0], [0.038, 0.0], [0.034, -0.022], [0.028, -0.02]], 0.006, { r: 0.003, bevel: 0.001 });
    p.rbox(M.metal, 0.0315, 0.004, 0.006, 0, 0.022, -0.075, 0.0015);              // slide stop / takedown lever
    p.rbox(M.metal, 0.004, 0.004, 0.012, -0.0155, 0.032, -0.045, 0.0012);
    p.rbox(M.poly, 0.006, 0.008, 0.01, 0.0158, 0.003, -0.032, 0.002);              // mag release
    sightY = 0.0695; sightZ = 0.012; eyeRelief = -0.26;   // handguns: 26 cm out (at 32-42 cm the sights were a speck over two big hands)
    if (A.optic === 'reflex') sight({ ...opticReflex(p, g, M, 0.0625, 0.035, 0.8), eyeRelief: -0.3 });
    muzF = Math.max(0.18, muzzleDevice(p, M, A.muzzle, 0.047, 0.178, 0.0075, 0.13));
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0, -0.002, 0.13, 0.02);
    mp.rbox(M.poly, 0.026, 0.014, 0.048, 0, -0.11, 0.004, 0.004, 0.24);
    mp.rbox(M.steel, 0.022, 0.02, 0.03, 0, -0.096, 0.0, 0.003, 0.24);
    out.magHome = new THREE.Vector3();
    muzzle.position.set(0, 0.047, -muzF);
    eject.position.set(0.016, 0.062, -0.05);
    foregrip.position.set(-0.004, -0.06, 0.012);
  }

  p.build(g, false);
  mp.build(mag, false);
  DETAIL = 2;
  if (type !== 'shotgun') {
    if (A.mag === 'fast') {
      // orange pull tab on the floorplate
      const box = new THREE.Box3().setFromObject(mag);
      if (box.isEmpty()) box.setFromObject(g);   // magazine is part of the model (TPM): tab under the gun's lowest point
      tabMat = tabMat || new THREE.MeshStandardMaterial({ color: 0xc8641e, roughness: 0.8 });
      const tab = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.022, 0.016, 2, 0.003), tabMat);
      tab.position.set(0, box.min.y - 0.008, (box.min.z + box.max.z) / 2 + 0.01);
      mag.add(tab);
    } else if (A.mag === 'ext') mag.scale.y = type === 'sniper' ? 1.25 : 1.2;
  }
  if (look && !BUILDS[id]) dressLook(look, type, g, mag, muzzle, M);
  mag.position.copy(out.magHome);
  g.add(mag);
  g.add(muzzle, eject, foregrip);
  if (A.optic === 'iron' && (frontZ !== null || (typeOf(id) === 'pistol' && !BUILDS[id]))) {
    // tritium insert (customizable; hidden when the plain post is chosen): on the front post when we know
    // where it is, otherwise on the sight line just ahead of the rear sight
    const ins = reticleMesh('iron');
    if (frontZ !== null) ins.position.set(0, postTop - 0.0011, frontZ);
    else ins.position.set(0, sightY - 0.0004, sightZ - 0.06);
    g.add(ins);
  }
  Object.assign(out, { muzzle, eject, foregrip, mag, sightY, sightZ, sightX, eyeRelief, laser, att: A });
  return out;
}
