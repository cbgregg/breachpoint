// Weapon state, detailed procedural gun models (real-world proportions, meters), spread helper
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WEAPONS } from './config.js';
import { weaponDef, cleanAtt } from './attachments.js';

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
function microRough(base, amp) {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = Math.max(0, Math.min(255, (base + (Math.random() - 0.5) * amp) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}
function mats() {
  if (MATS) return MATS;
  const metalR = microRough(0.42, 0.25), polyR = microRough(0.72, 0.2);
  MATS = {
    metal: new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 1, roughnessMap: metalR, metalness: 0.78 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x3e4044, roughness: 0.32, metalness: 0.9 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 1, roughnessMap: polyR, metalness: 0.05 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x9a896b, roughness: 1, roughnessMap: polyR, metalness: 0.03 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 1, roughnessMap: polyR, metalness: 0.03 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4527, roughness: 0.5, metalness: 0.02 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161617, roughness: 0.95 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb58a3c, roughness: 0.3, metalness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc3d8, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.14, depthWrite: false }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.04, metalness: 1, envMapIntensity: 2.2 }),
    reticle: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.5, 0.35), toneMapped: false, side: THREE.DoubleSide }),
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
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 5 });
    g.rotateY(Math.PI / 2); // shape x (forward) -> -z, extrusion -> +x
    g.translate(x - depth / 2, 0, 0);
    return this.add(mat, g);
  }
  // front-facing outline (x, y) extruded along the barrel axis from f0 to f1
  frontal(mat, pts, f0, f1, holes = [], r = 0.004, bevel = 0.0015) {
    const shape = roundedShape(pts, r);
    for (const h of holes) shape.holes.push(roundedPath(h, r));
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, f1 - f0 - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(f1 - bevel));
    return this.add(mat, g);
  }
  // surface of revolution along the barrel axis: pts = [[radius, f], ...]
  lathe(mat, pts, y = 0, x = 0, seg = 20) {
    const g = new THREE.LatheGeometry(pts.map(([r, f]) => new THREE.Vector2(r, f)), seg);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, 0);
    return this.add(mat, g);
  }
  rbox(mat, w, h, d, x, y, z, r = 0.003, rx = 0, ry = 0, rz = 0) {
    return this.add(mat, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), x, y, z, rx, ry, rz);
  }
  rail(mat, f0, f1, y, w = 0.021) {
    this.rbox(mat, w, 0.007, f1 - f0, 0, y + 0.0035, -(f0 + f1) / 2, 0.0015);
    for (let f = f0 + 0.004; f < f1 - 0.003; f += 0.01) this.rbox(mat, w + 0.003, 0.005, 0.0055, 0, y + 0.008, -f, 0.001);
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
  p.profile(M.poly, [[c - 0.06, b], [c + 0.06, b], [c + 0.06, b + 0.016], [c - 0.06, b + 0.016]], 0.036, { r: 0.005 });
  const hy = b + 0.042;
  p.frontal(M.poly, [[-0.024, hy - 0.028], [0.024, hy - 0.028], [0.024, hy + 0.024], [-0.024, hy + 0.024]], c - 0.02, c + 0.045,
    [[[-0.0175, hy - 0.019], [0.0175, hy - 0.019], [0.0175, hy + 0.017], [-0.0175, hy + 0.017]]], 0.007);
  p.rbox(M.poly, 0.012, 0.02, 0.03, 0.029, b + 0.026, -(c - 0.035), 0.004);
  p.add(M.glass, new THREE.PlaneGeometry(0.036, 0.036), 0, hy, -(c + 0.015));
  const z = -(c + 0.02);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.00045, 4, 32), M.reticle);
  ring.position.set(0, hy, z);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0007, 8), M.reticle);
  dot.position.set(0, hy, z);
  g.add(ring, dot);
  return { sightY: hy, sightZ: z };
}
function opticReflex(p, g, M, b, c, k = 1) {
  p.profile(M.poly, [[c - 0.0325 * k, b], [c + 0.0325 * k, b], [c + 0.0325 * k, b + 0.01], [c - 0.0325 * k, b + 0.01]], 0.03 * k, { r: 0.004 });
  const ry = b + 0.026 * k, w = 0.017 * k, i = 0.013 * k;
  p.frontal(M.poly, [[-w, ry - 0.016 * k], [w, ry - 0.016 * k], [w, ry + 0.017 * k], [-w, ry + 0.017 * k]], c + 0.0075 * k, c + 0.0225 * k,
    [[[-i, ry - 0.012 * k], [i, ry - 0.012 * k], [i, ry + 0.013 * k], [-i, ry + 0.013 * k]]], 0.008 * k);
  p.add(M.glass, new THREE.PlaneGeometry(0.026 * k, 0.026 * k), 0, ry, -(c + 0.0155 * k), -0.12);
  const z = -(c - 0.0075 * k);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 12), M.reticle);
  dot.position.set(0, ry, z);
  g.add(dot);
  return { sightY: ry, sightZ: z };
}
// 4x prism scope. The body is single-sided, so looking down the tube its inner walls vanish and the
// eyepiece rim frames a clear magnified view (the camera zooms); the chevron floats at the front.
function opticAcog(p, g, M, b, c, vm = false) {
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
  // red chevron + stadia post
  const sh = new THREE.Shape();
  sh.moveTo(-0.0026, -0.0018); sh.lineTo(0, 0.0004); sh.lineTo(0.0026, -0.0018); sh.lineTo(0.0026, -0.0011); sh.lineTo(0, 0.0012); sh.lineTo(-0.0026, -0.0011);
  const chev = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.reticle);
  const z = -(r1 - 0.02);
  chev.position.set(0, ay, z);
  const post = new THREE.Mesh(new THREE.PlaneGeometry(0.0004, 0.006), M.reticle);
  post.position.set(0, ay - 0.0046, z);
  g.add(chev, post);
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
  }
  return { sightY: ay, sightZ: -r0, eyeRelief: -0.05 };
}
function opticScope(p, M, b, c) {
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
  return { sightY: sy, sightZ: -rearF };
}
function addOptic(kind, p, g, M, vm, b, c) {
  if (kind === 'reflex') return opticReflex(p, g, M, b, c + 0.012);
  if (kind === 'acog') return opticAcog(p, g, M, b, c, vm);
  if (kind === 'scope') return opticScope(p, M, b, c);
  return opticHolo(p, g, M, b, c);
}
// returns the f where the muzzle ends
function muzzleDevice(p, M, kind, y, f0, br, supLen = 0.18) {
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

// Builds a gun with the top of its pistol grip at the origin, barrel toward -z.
// Returns { group, muzzle, eject, foregrip, mag, magHome, sightY, sightZ, pump, bolt }
export function buildGun(id, { forViewmodel = false, att = null } = {}) {
  const M = mats();
  const type = WEAPONS[id].model.type;
  const A = cleanAtt(id, att);
  let laser = null, eyeRelief, muzF;
  const sight = (o) => { sightY = o.sightY; sightZ = o.sightZ; eyeRelief = o.eyeRelief; };
  const g = new THREE.Group();
  const p = new Parts();
  const out = { group: g };
  const mag = new THREE.Group();
  const mp = new Parts();
  const muzzle = new THREE.Object3D(), eject = new THREE.Object3D(), foregrip = new THREE.Object3D();
  let sightY = 0.09, sightZ = -0.05;

  if (type === 'rifle') {
    // lower receiver with magwell
    p.profile(M.metal, [[-0.06, 0.0], [0.175, 0.0], [0.175, -0.014], [0.158, -0.022], [0.156, -0.056], [0.084, -0.056], [0.08, -0.016], [0.03, -0.012], [-0.03, -0.018], [-0.062, -0.004]], 0.027, { r: 0.006 });
    p.profile(M.poly, GRIP, 0.03, { bevel: 0.005, r: 0.01 });
    triggerGroup(p, M, -0.005);
    // upper receiver, forward assist, port door, charging handle
    p.profile(M.metal, [[-0.055, 0.0], [0.185, 0.0], [0.185, 0.058], [-0.055, 0.058]], 0.03, { r: 0.005 });
    p.lathe(M.metal, [[0, -0.005], [0.007, -0.005], [0.007, 0.02], [0, 0.02]], 0.044, 0.02, 12);
    p.rbox(M.steel, 0.002, 0.018, 0.06, 0.0158, 0.03, -0.06, 0.001);
    p.rbox(M.metal, 0.034, 0.008, 0.03, 0, 0.062, 0.05, 0.002);
    p.rail(M.metal, -0.05, 0.18, 0.058);
    // free-float octagonal handguard
    const hg = new THREE.CylinderGeometry(0.0235, 0.0235, 0.31, 8, 1);
    hg.rotateX(Math.PI / 2); hg.rotateZ(Math.PI / 8);
    p.add(M.tan, hg, 0, 0.043, -0.335);
    for (const xs of [-1, 1]) for (let i = 0; i < 4; i++) p.rbox(M.poly, 0.004, 0.009, 0.034, xs * 0.0215, 0.043, -0.22 - i * 0.068, 0.0025);
    p.rail(M.metal, 0.19, 0.485, 0.0645);
    p.lathe(M.tan, [[0, 0.183], [0.026, 0.185], [0.026, 0.19], [0, 0.19]], 0.043, 0, 8);
    // barrel, gas block, muzzle device
    p.lathe(M.steel, [[0, 0.485], [0.0085, 0.485], [0.0085, 0.6], [0.011, 0.605], [0.011, 0.612], [0.0085, 0.615], [0.0085, 0.62], [0, 0.62]], 0.045);
    muzF = muzzleDevice(p, M, A.muzzle, 0.045, 0.62, 0.0085);
    // underbarrel
    if (A.under === 'vgrip') {
      p.lathe(M.poly, [[0, 0], [0.0125, 0], [0.014, 0.012], [0.0145, 0.06], [0.012, 0.075], [0, 0.077]], 0, 0, 14);
      const vfg = p.by.get(M.poly).pop();
      vfg.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2 + 0.15));
      vfg.translate(0, 0.02, -0.38);
      p.by.get(M.poly).push(vfg);
      foregrip.position.set(0, -0.02, -0.385);
    } else if (A.under === 'agrip') {
      p.profile(M.poly, [[0.27, 0.022], [0.375, 0.022], [0.36, 0.008, 0.006], [0.315, -0.008, 0.008], [0.29, -0.006, 0.006]], 0.03, { r: 0.006, bevel: 0.003 });
      foregrip.position.set(0, -0.004, -0.33);
    } else foregrip.position.set(0, 0.004, -0.36);
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.033, 0.043, 0.43);
    // buffer tube + adjustable stock
    p.lathe(M.metal, [[0, -0.05], [0.0155, -0.05], [0.0155, -0.255], [0.012, -0.262], [0, -0.262]].map(([r, f]) => [r, -f]).reverse().map(([r, f]) => [r, -f]), 0.034);
    p.profile(M.tan, [[-0.165, 0.058, 0.01], [-0.302, 0.056, 0.012], [-0.312, -0.055, 0.008], [-0.292, -0.066, 0.012], [-0.215, -0.012, 0.02], [-0.165, 0.012, 0.008]], 0.042, { bevel: 0.005, r: 0.01 });
    p.profile(M.rubber, [[-0.304, 0.058], [-0.318, 0.058], [-0.328, -0.058], [-0.312, -0.068]], 0.044, { bevel: 0.004, r: 0.006 });
    // optic
    sight(A.optic === 'iron' ? ironSights(p, M, -0.03, 0.0685, 0.465, 0.075, 0.018) : addOptic(A.optic, p, g, M, forViewmodel, 0.064, 0.055));
    // curved 30-round magazine
    mp.profile(M.poly, [[0.152, -0.04], [0.157, -0.11, 0.03], [0.168, -0.18, 0.04], [0.185, -0.212, 0.006], [0.122, -0.232, 0.006], [0.106, -0.2, 0.04], [0.095, -0.12, 0.03], [0.09, -0.04]], 0.024, { r: 0.006, bevel: 0.002 });
    for (let i = 0; i < 4; i++) mp.rbox(M.metal, 0.0255, 0.004, 0.06, 0, -0.07 - i * 0.03, -0.12 - i * 0.012, 0.0015, 0.12 + i * 0.1);
    out.magHome = new THREE.Vector3();
    muzzle.position.set(0, 0.045, -muzF);
    eject.position.set(0.02, 0.035, -0.06);
  } else if (type === 'smg') {
    p.profile(M.metal, [[-0.045, 0.0], [0.27, 0.0], [0.27, 0.07, 0.016], [-0.045, 0.07, 0.016]], 0.036, { r: 0.008, bevel: 0.003 });
    p.lathe(M.metal, [[0, 0.16], [0.0095, 0.16], [0.0095, 0.36], [0, 0.36]], 0.072, -0.006, 14);
    p.profile(M.poly, [[0.24, 0.064], [0.392, 0.058, 0.02], [0.408, 0.03, 0.02], [0.398, -0.012, 0.018], [0.27, -0.016, 0.012], [0.24, 0.0]], 0.048, { bevel: 0.006, r: 0.012 });
    for (let i = 0; i < 4; i++) p.rbox(M.rubber, 0.05, 0.003, 0.012, 0, 0.0, -0.285 - i * 0.03, 0.0015);
    p.lathe(M.steel, [[0, 0.405], [0.0095, 0.405], [0.0095, 0.465], [0.012, 0.47], [0.012, 0.48], [0, 0.48]], 0.036);
    muzF = Math.max(0.485, muzzleDevice(p, M, A.muzzle, 0.036, 0.48, 0.0095, 0.16));
    p.lathe(M.metal, [[0.016, 0.425], [0.017, 0.43], [0.017, 0.45], [0.016, 0.455]], 0.092, 0, 14);
    if (A.under === 'vgrip') {
      p.lathe(M.poly, [[0, 0], [0.0125, 0], [0.014, 0.012], [0.0145, 0.06], [0.012, 0.075], [0, 0.077]], 0, 0, 14);
      const vfg = p.by.get(M.poly).pop();
      vfg.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2 + 0.15));
      vfg.translate(0, -0.012, -0.34);
      p.by.get(M.poly).push(vfg);
      foregrip.position.set(0, -0.052, -0.345);
    } else if (A.under === 'agrip') {
      p.profile(M.poly, [[0.285, -0.012], [0.375, -0.012], [0.36, -0.026, 0.006], [0.32, -0.04, 0.008], [0.3, -0.036, 0.006]], 0.03, { r: 0.006, bevel: 0.003 });
      foregrip.position.set(0, -0.026, -0.335);
    } else foregrip.position.set(0, 0.005, -0.32);
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.032, 0.03, 0.34);
    p.profile(M.poly, [[-0.035, 0.0], [0.1, 0.0], [0.1, -0.018], [0.06, -0.02], [0.03, -0.014], [-0.035, -0.014]], 0.03, { r: 0.006 });
    p.profile(M.poly, GRIP, 0.032, { bevel: 0.005, r: 0.01 });
    triggerGroup(p, M, -0.002, 0.012);
    p.rail(M.metal, 0.0, 0.16, 0.07, 0.02);
    // fixed stock with thumbhole
    p.profile(M.poly, [[-0.04, 0.062], [-0.3, 0.056, 0.015], [-0.312, -0.06, 0.01], [-0.27, -0.068, 0.015], [-0.06, 0.0, 0.01]], 0.04,
      { bevel: 0.004, r: 0.01, holes: [[[-0.1, 0.038], [-0.255, 0.034], [-0.258, -0.03], [-0.13, 0.004]]] });
    p.profile(M.rubber, [[-0.306, 0.058], [-0.32, 0.058], [-0.324, -0.064], [-0.31, -0.064]], 0.042, { bevel: 0.004, r: 0.005 });
    sight(A.optic === 'iron' ? ironSights(p, M, 0.01, 0.0805, 0.39, 0.06, 0.016) : addOptic(A.optic, p, g, M, forViewmodel, 0.07, 0.055));
    mp.profile(M.metal, [[0.145, 0.0], [0.158, -0.07, 0.03], [0.18, -0.14, 0.04], [0.205, -0.182, 0.006], [0.18, -0.198, 0.006], [0.158, -0.16, 0.04], [0.136, -0.085, 0.03], [0.125, 0.0]], 0.021, { r: 0.004, bevel: 0.0015 });
    out.magHome = new THREE.Vector3();
    muzzle.position.set(0, 0.036, -muzF);
    eject.position.set(0.02, 0.05, -0.1);
  } else if (type === 'shotgun') {
    p.profile(M.metal, [[-0.035, -0.008], [0.205, -0.008], [0.205, 0.078], [0.02, 0.08, 0.02], [-0.035, 0.06]], 0.037, { r: 0.008, bevel: 0.003 });
    p.rbox(M.steel, 0.002, 0.022, 0.07, 0.0187, 0.045, -0.08, 0.002);
    p.lathe(M.steel, [[0, 0.2], [0.0105, 0.2], [0.0105, 0.705], [0.0085, 0.71], [0, 0.71]], 0.064);
    const tEnd = A.mag === 'ext' ? 0.69 : 0.6;
    p.lathe(M.metal, [[0, 0.2], [0.012, 0.2], [0.012, tEnd], [0.0125, tEnd], [0.0125, tEnd + 0.025], [0.009, tEnd + 0.03], [0, tEnd + 0.03]], 0.028);
    if (A.mag === 'ext') p.frontal(M.metal, [[-0.014, 0.022], [0.014, 0.022], [0.014, 0.07], [-0.014, 0.07]], 0.66, 0.675, [[[-0.0125, 0.0155], [0.0125, 0.0155], [0.0125, 0.04], [-0.0125, 0.04]]], 0.006);
    muzF = Math.max(0.71, muzzleDevice(p, M, A.muzzle, 0.064, 0.71, 0.0105, 0.2));
    if (A.optic === 'iron') {
      p.lathe(M.steel, [[0, 0.692], [0.002, 0.692], [0.002, 0.7], [0, 0.7]], 0.077, 0, 8);
      p.rbox(M.metal, 0.012, 0.012, 0.012, 0, 0.084, -0.02, 0.002);
    } else {
      p.rail(M.metal, -0.03, 0.16, 0.077, 0.02);
      sight(addOptic(A.optic, p, g, M, forViewmodel, 0.086, 0.06));
    }
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0.02, 0.064, 0.655, 0.012);
    // walnut stock with integrated pistol grip
    p.profile(M.wood, [[-0.03, 0.056], [-0.395, 0.036, 0.01], [-0.41, -0.098, 0.01], [-0.378, -0.106, 0.02], [-0.11, -0.038, 0.02], [-0.06, -0.12, 0.01], [-0.022, -0.118, 0.012], [-0.005, -0.012]], 0.04, { bevel: 0.006, r: 0.012 });
    p.profile(M.rubber, [[-0.398, 0.036], [-0.414, 0.034], [-0.428, -0.1], [-0.412, -0.104]], 0.042, { bevel: 0.004, r: 0.006 });
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
  } else { // pistol
    p.profile(M.metal, [[-0.022, 0.03], [0.172, 0.03], [0.178, 0.04, 0.004], [0.172, 0.062, 0.006], [-0.022, 0.062, 0.006]], 0.028, { r: 0.004, bevel: 0.003 });
    for (let i = 0; i < 7; i++) p.rbox(M.poly, 0.0285, 0.026, 0.002, 0, 0.046, 0.013 - i * 0.006, 0.0008);
    p.rbox(M.steel, 0.0015, 0.012, 0.04, 0.0143, 0.05, -0.07, 0.0007);
    p.profile(M.poly, [[-0.018, 0.031], [0.155, 0.031], [0.158, 0.014], [0.07, 0.012], [0.05, 0.0], [0.002, 0.0]], 0.027, { r: 0.005 });
    p.profile(M.poly, [[-0.004, 0.02], [0.034, 0.014], [0.03, -0.004, 0.008], [0.014, -0.098, 0.01], [-0.022, -0.104, 0.008], [-0.03, -0.088, 0.008], [-0.024, 0.0, 0.01]], 0.03, { bevel: 0.005, r: 0.01 });
    p.profile(M.poly, [[0.002, 0.004], [0.07, 0.004], [0.07, -0.03], [0.008, -0.034]], 0.012, { r: 0.008, holes: [[[0.01, -0.002], [0.062, -0.002], [0.062, -0.024], [0.012, -0.027]]] });
    p.profile(M.metal, [[0.028, 0.0], [0.038, 0.0], [0.034, -0.022], [0.028, -0.02]], 0.006, { r: 0.003, bevel: 0.001 });
    for (const x of [-0.0075, 0.0075]) p.rbox(M.metal, 0.007, 0.008, 0.006, x, 0.066, 0.012, 0.0015);
    p.rbox(M.metal, 0.0045, 0.008, 0.006, 0, 0.066, -0.162, 0.0015);
    sightY = 0.067; sightZ = 0.012;
    if (A.optic === 'reflex') sight(opticReflex(p, g, M, 0.062, 0.035, 0.8));
    muzF = Math.max(0.18, muzzleDevice(p, M, A.muzzle, 0.047, 0.178, 0.0075, 0.13));
    if (A.laser === 'laser') laser = laserModule(p, g, M, 0, -0.002, 0.13, 0.02);
    mp.rbox(M.poly, 0.026, 0.014, 0.048, 0, -0.11, 0.004, 0.004, 0.24);
    out.magHome = new THREE.Vector3();
    muzzle.position.set(0, 0.047, -muzF);
    eject.position.set(0.016, 0.062, -0.05);
    foregrip.position.set(-0.004, -0.06, 0.012);
  }

  p.build(g, !forViewmodel);
  mp.build(mag, !forViewmodel);
  if (type !== 'shotgun') {
    if (A.mag === 'fast') {
      // orange pull tab on the floorplate
      const box = new THREE.Box3().setFromObject(mag);
      tabMat = tabMat || new THREE.MeshStandardMaterial({ color: 0xc8641e, roughness: 0.8 });
      const tab = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.022, 0.016, 2, 0.003), tabMat);
      tab.position.set(0, box.min.y - 0.008, (box.min.z + box.max.z) / 2 + 0.01);
      mag.add(tab);
    } else if (A.mag === 'ext') mag.scale.y = type === 'sniper' ? 1.25 : 1.2;
  }
  mag.position.copy(out.magHome);
  g.add(mag);
  g.add(muzzle, eject, foregrip);
  Object.assign(out, { muzzle, eject, foregrip, mag, sightY, sightZ, eyeRelief, laser, att: A });
  return out;
}
