// Weapon state, gun meshes, spread helpers
import * as THREE from 'three';
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
    this.reloadT = this.def.reload;
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

  get reloadProgress() { return this.reloading ? 1 - this.reloadT / this.def.reload : 0; }
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

const gunMatCache = new Map();
function mat(color, rough = 0.6, metal = 0.15) {
  const key = `${color}-${rough}-${metal}`;
  if (!gunMatCache.has(key)) gunMatCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return gunMatCache.get(key);
}

// Builds a gun pointing down -z with its grip at the origin. Returns {group, muzzle}
export function buildGun(id) {
  const m = WEAPONS[id].model;
  const g = new THREE.Group();
  const [bw, bh, bl] = m.body;
  const dark = mat(0x1d2024, 0.55, 0.2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bl), mat(m.color));
  body.position.set(0, 0.03, -bl / 2 + 0.08);
  g.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.8, 0.12, 0.05), dark);
  grip.position.set(0, -0.06, 0.03);
  grip.rotation.x = 0.25;
  g.add(grip);
  let muzzleZ = -bl + 0.08;
  if (m.barrel > 0.05) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, m.barrel, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, muzzleZ - m.barrel / 2);
    g.add(barrel);
    muzzleZ -= m.barrel;
  }
  if (m.mag) {
    const mg = new THREE.Mesh(new THREE.BoxGeometry(...m.mag), dark);
    mg.position.set(0, -m.mag[1] / 2, -bl * 0.35);
    mg.rotation.x = 0.12;
    g.add(mg);
  }
  if (m.stock) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, bh * 0.9, 0.2), mat(m.color, 0.75, 0.05));
    st.position.set(0, 0.0, 0.18);
    g.add(st);
  }
  const sg = new THREE.Group();
  sg.position.y = 0.03;
  g.add(sg);
  if (m.sight === 'scope') {
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.28, 12), dark);
    sc.rotation.x = Math.PI / 2;
    sc.position.set(0, bh / 2 + 0.07, -bl * 0.3);
    sg.add(sc);
  } else if (m.sight === 'red') {
    // open reflex sight frame so the target stays visible when aiming
    const y0 = bh / 2 + 0.03;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.01, 0.05), dark);
    base.position.set(0, bh / 2 + 0.005, -0.08);
    sg.add(base);
    for (const x of [-0.021, 0.021]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.01), dark);
      post.position.set(x, y0 + 0.005, -0.09);
      sg.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.005, 0.01), dark);
    top.position.set(0, y0 + 0.03, -0.09);
    sg.add(top);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.001), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    dot.position.set(0, y0, -0.09);
    sg.add(dot);
  } else {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.01), dark);
    post.position.set(0, bh / 2 + 0.04, muzzleZ + 0.04);
    sg.add(post);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, muzzleZ - 0.02);
  g.add(muzzle);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, muzzle };
}
