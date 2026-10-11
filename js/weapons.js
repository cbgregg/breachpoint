// Weapon state, detailed procedural gun models (real-world proportions, meters), spread helper
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS } from './config.js';

export class WeaponState {
  constructor(id) {
    this.id = id;
    this.def = WEAPONS[id];
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
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    poly: new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.62, metalness: 0.08 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x34373a, roughness: 0.36, metalness: 0.85 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x8c7d63, roughness: 0.66, metalness: 0.05 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4c5240, roughness: 0.62, metalness: 0.05 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.55, metalness: 0.02 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb58a3c, roughness: 0.3, metalness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc3d8, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.16, depthWrite: false }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0c1a24, roughness: 0.05, metalness: 1, envMapIntensity: 2 }),
    reticle: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.5, 0.35), toneMapped: false, side: THREE.DoubleSide }),
  };
  return MATS;
}
export function gunMaterials() { return mats(); }

// collects primitives per material then merges them into one mesh per material
class Parts {
  constructor() { this.by = new Map(); }
  add(mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return this;
  }
  box(mat, w, h, d, x, y, z, rx, ry, rz) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
  // cylinder aligned to z
  cylZ(mat, r1, r2, len, x, y, z, seg = 12) { return this.add(mat, new THREE.CylinderGeometry(r1, r2, len, seg), x, y, z, Math.PI / 2, 0, 0); }
  cylY(mat, r1, r2, len, x, y, z, seg = 10, rx = 0) { return this.add(mat, new THREE.CylinderGeometry(r1, r2, len, seg), x, y, z, rx, 0, 0); }
  rail(mat, z0, z1, y, w = 0.022) {
    const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
    this.box(mat, w, 0.008, len, 0, y, zc);
    for (let z = Math.min(z0, z1) + 0.005; z < Math.max(z0, z1); z += 0.01) this.box(mat, w + 0.004, 0.006, 0.005, 0, y + 0.006, z);
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

function holoSight(p, M, y, z) {
  p.box(M.poly, 0.04, 0.014, 0.085, 0, y + 0.007, z);
  for (const x of [-0.021, 0.021]) p.box(M.poly, 0.005, 0.05, 0.07, x, y + 0.039, z);
  p.box(M.poly, 0.047, 0.006, 0.07, 0, y + 0.066, z);
  p.box(M.poly, 0.03, 0.02, 0.03, 0.03, y + 0.02, z + 0.02);
  p.add(M.glass, new THREE.PlaneGeometry(0.038, 0.044), 0, y + 0.039, z - 0.03);
  return y + 0.039; // reticle height
}
function holoReticle(group, M, y, z) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.00045, 4, 28), M.reticle);
  ring.position.set(0, y, z);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0007, 8), M.reticle);
  dot.position.set(0, y, z);
  group.add(ring, dot);
}

// Builds a gun with its pistol grip at the origin, barrel toward -z.
// Returns { group, muzzle, eject, foregrip, mag, magHome, sightY, sightZ, pump, bolt }
export function buildGun(id, { forViewmodel = false } = {}) {
  const M = mats();
  const type = WEAPONS[id].model.type;
  const g = new THREE.Group();
  const p = new Parts();
  const out = { group: g };
  const mag = new THREE.Group();
  const mp = new Parts();
  const muzzle = new THREE.Object3D(), eject = new THREE.Object3D(), foregrip = new THREE.Object3D();
  let sightY = 0.09, sightZ = -0.05;

  if (type === 'rifle') {
    p.box(M.poly, 0.03, 0.11, 0.045, 0, -0.055, 0.012, 0.3);
    p.box(M.metal, 0.032, 0.055, 0.21, 0, 0.0, -0.06);
    p.box(M.metal, 0.012, 0.012, 0.07, 0, -0.035, -0.03);
    p.box(M.metal, 0.036, 0.056, 0.25, 0, 0.055, -0.07);
    p.box(M.metal, 0.012, 0.012, 0.04, 0.02, 0.06, -0.04);
    p.rail(M.metal, 0.05, -0.19, 0.087);
    p.box(M.tan, 0.054, 0.058, 0.32, 0, 0.052, -0.355);
    for (const x of [-0.028, 0.028]) for (let i = 0; i < 4; i++) p.box(M.poly, 0.002, 0.012, 0.03, x, 0.05, -0.25 - i * 0.065);
    p.rail(M.metal, -0.2, -0.51, 0.087);
    p.cylZ(M.metal, 0.009, 0.009, 0.17, 0, 0.052, -0.6);
    p.cylZ(M.metal, 0.015, 0.015, 0.065, 0, 0.052, -0.715, 10);
    for (let i = 0; i < 3; i++) p.box(M.poly, 0.032, 0.004, 0.006, 0, 0.066, -0.7 - i * 0.012);
    p.cylZ(M.metal, 0.016, 0.016, 0.18, 0, 0.042, 0.13);
    p.box(M.tan, 0.042, 0.085, 0.15, 0, 0.022, 0.255, 0.05);
    p.box(M.poly, 0.044, 0.1, 0.02, 0, 0.012, 0.335, 0.05);
    p.cylY(M.poly, 0.015, 0.016, 0.085, 0, -0.012, -0.37);
    p.box(M.metal, 0.014, 0.014, 0.02, 0, 0.088, 0.055);
    sightY = holoSight(p, M, 0.094, -0.07);
    sightZ = -0.1;
    holoReticle(g, M, sightY, sightZ);
    mp.box(M.poly, 0.026, 0.12, 0.062, 0, -0.06, 0, -0.12);
    mp.box(M.poly, 0.026, 0.06, 0.06, 0, -0.14, 0.012, -0.32);
    mp.box(M.brass, 0.01, 0.006, 0.04, 0, 0.003, -0.003);
    out.magHome = new THREE.Vector3(0, -0.02, -0.11);
    muzzle.position.set(0, 0.052, -0.75);
    eject.position.set(0.02, 0.06, -0.05);
    foregrip.position.set(0, -0.045, -0.37);
  } else if (type === 'smg') {
    p.box(M.poly, 0.03, 0.1, 0.045, 0, -0.05, 0.012, 0.3);
    p.box(M.metal, 0.04, 0.058, 0.3, 0, 0.042, -0.11);
    p.box(M.metal, 0.034, 0.03, 0.26, 0, 0.0, -0.09);
    p.box(M.poly, 0.05, 0.052, 0.14, 0, 0.035, -0.32);
    p.cylZ(M.metal, 0.01, 0.01, 0.06, 0, 0.042, -0.42);
    p.cylZ(M.metal, 0.016, 0.016, 0.03, 0, 0.042, -0.46, 10);
    p.rail(M.metal, 0.02, -0.17, 0.073);
    for (const x of [-0.018, 0.018]) p.cylZ(M.metal, 0.004, 0.004, 0.22, x, 0.03, 0.14, 6);
    p.box(M.poly, 0.05, 0.09, 0.016, 0, 0.02, 0.25);
    // reflex sight
    p.box(M.poly, 0.032, 0.012, 0.05, 0, 0.085, -0.06);
    for (const x of [-0.017, 0.017]) p.box(M.poly, 0.004, 0.034, 0.012, x, 0.104, -0.078);
    p.box(M.poly, 0.038, 0.004, 0.012, 0, 0.122, -0.078);
    p.add(M.glass, new THREE.PlaneGeometry(0.03, 0.03), 0, 0.104, -0.08, -0.15);
    sightY = 0.104; sightZ = -0.082;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 10), M.reticle);
    dot.position.set(0, sightY, sightZ);
    g.add(dot);
    mp.box(M.metal, 0.02, 0.1, 0.034, 0, -0.05, 0, -0.15);
    mp.box(M.metal, 0.02, 0.07, 0.034, 0, -0.125, 0.016, -0.42);
    out.magHome = new THREE.Vector3(0, -0.005, -0.12);
    muzzle.position.set(0, 0.042, -0.48);
    eject.position.set(0.022, 0.05, -0.08);
    foregrip.position.set(0, 0.0, -0.32);
  } else if (type === 'shotgun') {
    p.box(M.metal, 0.042, 0.072, 0.22, 0, 0.035, -0.06);
    p.cylZ(M.metal, 0.011, 0.011, 0.52, 0, 0.068, -0.43);
    p.cylZ(M.metal, 0.012, 0.012, 0.44, 0, 0.035, -0.39);
    p.box(M.wood, 0.038, 0.1, 0.07, 0, -0.04, 0.03, 0.35);
    p.box(M.wood, 0.04, 0.085, 0.28, 0, 0.0, 0.2, 0.1);
    p.box(M.poly, 0.042, 0.1, 0.02, 0, -0.012, 0.345, 0.1);
    p.box(M.metal, 0.008, 0.012, 0.01, 0, 0.083, -0.67);
    p.box(M.metal, 0.024, 0.014, 0.012, 0, 0.081, -0.02);
    sightY = 0.087; sightZ = -0.02;
    const pump = new THREE.Group();
    const pp = new Parts();
    pp.box(M.wood, 0.052, 0.046, 0.17, 0, 0.032, 0);
    for (let i = 0; i < 6; i++) pp.box(M.poly, 0.054, 0.004, 0.006, 0, 0.032, -0.07 + i * 0.028);
    pp.build(pump, !forViewmodel);
    pump.position.set(0, 0, -0.33);
    g.add(pump);
    out.pump = pump;
    mp.cylZ(M.poly, 0.009, 0.009, 0.05, 0, 0, 0, 8);
    out.magHome = new THREE.Vector3(0, 0.0, -0.12);
    muzzle.position.set(0, 0.068, -0.7);
    eject.position.set(0.024, 0.05, -0.06);
    foregrip.position.set(0, 0.0, -0.33);
  } else if (type === 'sniper') {
    p.box(M.poly, 0.03, 0.1, 0.045, 0, -0.05, 0.012, 0.3);
    p.box(M.olive, 0.05, 0.06, 0.5, 0, 0.02, -0.14);
    p.box(M.olive, 0.046, 0.11, 0.24, 0, 0.0, 0.23);
    p.box(M.olive, 0.04, 0.03, 0.14, 0, 0.065, 0.2);
    p.box(M.poly, 0.048, 0.12, 0.02, 0, 0.0, 0.355);
    p.cylZ(M.metal, 0.018, 0.018, 0.24, 0, 0.058, -0.05);
    p.cylZ(M.metal, 0.012, 0.014, 0.5, 0, 0.058, -0.42, 10);
    p.cylZ(M.metal, 0.02, 0.02, 0.08, 0, 0.058, -0.71, 12);
    for (let i = 0; i < 4; i++) p.box(M.poly, 0.042, 0.004, 0.008, 0, 0.075, -0.69 - i * 0.015);
    for (const x of [-0.012, 0.012]) p.cylZ(M.metal, 0.004, 0.004, 0.2, x, -0.012, -0.35, 6);
    // scope
    p.cylZ(M.poly, 0.016, 0.016, 0.3, 0, 0.108, -0.06);
    p.cylZ(M.poly, 0.027, 0.017, 0.07, 0, 0.108, -0.24);
    p.cylZ(M.poly, 0.019, 0.023, 0.05, 0, 0.108, 0.11);
    p.cylY(M.poly, 0.009, 0.009, 0.024, 0, 0.13, -0.06);
    p.add(M.poly, new THREE.CylinderGeometry(0.009, 0.009, 0.024, 10), 0.025, 0.108, -0.06, 0, 0, Math.PI / 2);
    for (const z of [-0.14, 0.02]) p.box(M.metal, 0.03, 0.04, 0.018, 0, 0.083, z);
    p.add(M.lens, new THREE.CircleGeometry(0.024, 18), 0, 0.108, -0.276, 0, Math.PI, 0);
    p.add(M.lens, new THREE.CircleGeometry(0.02, 18), 0, 0.108, 0.136);
    sightY = 0.108; sightZ = 0.12;
    const bolt = new THREE.Group();
    const bp = new Parts();
    bp.cylZ(M.metal, 0.006, 0.006, 0.03, 0, 0, 0, 6);
    bp.add(M.metal, new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), 0.025, -0.005, 0, 0, 0, Math.PI / 2 - 0.4);
    bp.add(M.metal, new THREE.SphereGeometry(0.009, 8, 6), 0.05, -0.016, 0);
    bp.build(bolt, !forViewmodel);
    bolt.position.set(0.01, 0.058, 0.04);
    g.add(bolt);
    out.bolt = bolt;
    mp.box(M.metal, 0.03, 0.06, 0.08, 0, -0.03, 0);
    out.magHome = new THREE.Vector3(0, -0.01, -0.09);
    muzzle.position.set(0, 0.058, -0.76);
    eject.position.set(0.022, 0.06, -0.04);
    foregrip.position.set(0, -0.012, -0.3);
  } else { // pistol
    p.box(M.metal, 0.028, 0.034, 0.19, 0, 0.046, -0.075);
    for (let i = 0; i < 6; i++) p.box(M.poly, 0.03, 0.026, 0.003, 0, 0.046, 0.0 - i * 0.008);
    p.box(M.poly, 0.026, 0.024, 0.16, 0, 0.018, -0.07);
    p.box(M.poly, 0.03, 0.11, 0.05, 0, -0.045, 0.008, 0.25);
    p.box(M.poly, 0.01, 0.01, 0.05, 0, -0.01, -0.05);
    p.box(M.metal, 0.008, 0.008, 0.006, -0.008, 0.067, 0.012);
    p.box(M.metal, 0.008, 0.008, 0.006, 0.008, 0.067, 0.012);
    p.box(M.metal, 0.005, 0.009, 0.006, 0, 0.067, -0.16);
    sightY = 0.068; sightZ = 0.012;
    mp.box(M.poly, 0.026, 0.02, 0.05, 0, 0, 0, 0.25);
    out.magHome = new THREE.Vector3(0, -0.1, 0.03);
    muzzle.position.set(0, 0.046, -0.175);
    eject.position.set(0.016, 0.06, -0.05);
    foregrip.position.set(-0.004, -0.06, 0.012);
  }

  p.build(g, !forViewmodel);
  mp.build(mag, !forViewmodel);
  mag.position.copy(out.magHome);
  g.add(mag);
  g.add(muzzle, eject, foregrip);
  Object.assign(out, { muzzle, eject, foregrip, mag, sightY, sightZ });
  return out;
}
