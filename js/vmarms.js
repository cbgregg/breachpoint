// First-person arms: gloved hands with jointed fingers and sleeved forearms, built for the viewmodel.
// Hands are placed in the gun's own frame (pistol grip, handguard, vertical grip, magazine) with a grip
// pose per job, so the fingers wrap what they hold instead of sticking out. Forearms and upper arms are
// solved with two-bone IK from shoulders below the camera to each wrist.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEAMS } from './config.js';

// hand local frame: palm centre at the origin, fingers toward -z, palm facing -y, back of the hand +y.
// right hand: thumb on -x; left hand is mirrored (thumb on +x). FINGERS/THUMB x is given for the left hand.
const FINGERS = [
  { x: 0.0285, z: -0.044, len: [0.044, 0.027, 0.021], r: 0.0098 }, // index (thumb side)
  { x: 0.0095, z: -0.047, len: [0.048, 0.029, 0.022], r: 0.0102 }, // middle
  { x: -0.0095, z: -0.045, len: [0.045, 0.028, 0.021], r: 0.0098 }, // ring
  { x: -0.0275, z: -0.04, len: [0.036, 0.022, 0.018], r: 0.0088 }, // pinky
];
const THUMB = { x: 0.036, y: -0.006, z: 0.014, len: [0.04, 0.03, 0.025], r: 0.0112 };
const HAND_SCALE = 1.1; // a little bigger than life, as in every shooter, so they read at the edge of the frame
export const WRIST = new THREE.Vector3(0, 0.002, 0.058 * HAND_SCALE); // wrist point in the hand frame

// grip poses: per finger [proximal, middle, distal] curl (radians), spread, and the thumb
// (base yaw toward the fingers' side, pitch toward the palm, roll, then two curls)
const W = [1.5, 1.35, 0.75];
export const POSES = {
  trigger: { f: [[0.75, 1.45, 0.8], W, W, W], spread: [0.04, 0, -0.02, -0.05], t: [0.65, -0.5, 0.2, 0.25, 0.3] },
  wrap: { f: [W, W, W, W], spread: [0.03, 0, -0.02, -0.05], t: [0.65, -0.55, 0.2, 0.3, 0.35] },
  support: { f: [[0.95, 0.75, 0.4], [1.0, 0.75, 0.4], [1.0, 0.75, 0.4], [1.0, 0.8, 0.45]], spread: [0.06, 0, -0.04, -0.08], t: [0.4, -0.15, 0.1, 0.15, 0.2] },
  cup: { f: [[0.75, 0.75, 0.45], [0.8, 0.8, 0.5], [0.85, 0.8, 0.5], [0.9, 0.85, 0.5]], spread: [0.05, 0, -0.04, -0.08], t: [0.6, -0.55, 0.2, 0.3, 0.3] },
  fist: { f: [[1.55, 1.6, 1.1], [1.55, 1.6, 1.1], [1.55, 1.6, 1.1], [1.55, 1.6, 1.1]], spread: [0, 0, 0, 0], t: [0.25, -0.95, 0.3, 0.55, 0.5] },
  open: { f: [[0.25, 0.3, 0.2], [0.25, 0.3, 0.2], [0.3, 0.35, 0.2], [0.35, 0.4, 0.25]], spread: [0.1, 0, -0.08, -0.16], t: [0.75, -0.2, 0.0, 0.1, 0.1] },
};

// cloth: colour with a soft mottle, and a normal map with twill weave and a few loose folds
function fabricMaps(color) {
  const N = 256, col = new THREE.Color(color);
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const n = document.createElement('canvas'); n.width = n.height = N;
  const gn = n.getContext('2d'), nimg = gn.createImageData(N, N);
  const h = new Float32Array(N * N);
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blobs = Array.from({ length: 30 }, () => [rnd() * N, rnd() * N, 10 + rnd() * 30, rnd() - 0.5]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = ((x + y * 2) % 6 < 3 ? 1 : 0) * 0.35 + rnd() * 0.25;                         // twill
    v += Math.sin(y * 0.09 + Math.sin(x * 0.05) * 1.5) * 0.9;                             // loose folds round the sleeve
    h[y * N + x] = v;
    let m = 0; for (const [bx, by, br, bv] of blobs) { const d = Math.hypot(x - bx, y - by); if (d < br) m += bv * (1 - d / br); }
    const f = 1 + m * 0.12 + (rnd() - 0.5) * 0.05, i = (y * N + x) * 4;
    img.data[i] = Math.min(255, col.r * 255 * f); img.data[i + 1] = Math.min(255, col.g * 255 * f); img.data[i + 2] = Math.min(255, col.b * 255 * f); img.data[i + 3] = 255;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], hy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const nx = -hx * 0.6, ny = -hy * 0.6, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    nimg.data[i] = (nx / l * 0.5 + 0.5) * 255; nimg.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; nimg.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); gn.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(n);
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); t.anisotropy = 4; }
  return { map, normalMap };
}

function buildHand(side, M) {
  const s = side === 'R' ? -1 : 1; // placement: right thumb on -x, left on +x; rotations use -s
  const hand = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // palm: narrower and thicker toward the heel
  const palm = new RoundedBoxGeometry(0.08, 0.026, 0.09, 3, 0.011);
  const pp = palm.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const t = (pp.getZ(i) + 0.045) / 0.09; // 0 at the knuckles, 1 at the heel
    pp.setX(i, pp.getX(i) * (1 - 0.13 * t)); pp.setY(i, pp.getY(i) * (0.88 + 0.24 * t) - 0.002 * t);
  }
  palm.computeVertexNormals();
  add(hand, palm, M.glove, 0, 0, 0);
  // thumb pad (thenar) and the outer heel (hypothenar)
  const pad = (x, y, z, sx, sy, sz, ry) => { const m = add(hand, new THREE.SphereGeometry(1, 14, 10), M.glove, x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; };
  pad(s * 0.024, -0.006, 0.02, 0.018, 0.014, 0.032, s * 0.45);
  pad(-s * 0.026, -0.005, 0.026, 0.013, 0.012, 0.026, 0);
  // tactical glove: padded back panel, a knuckle protector over each knuckle, velcro strap at the wrist
  { const b = add(hand, new THREE.SphereGeometry(1, 18, 10), M.pad, 0, 0.0095, 0.006); b.scale.set(0.028, 0.0055, 0.03); }
  FINGERS.forEach(f => { const k = add(hand, new THREE.SphereGeometry(1, 10, 6), M.pad, s * f.x, 0.0085, f.z + 0.003); k.scale.set(0.0088, 0.0055, 0.0085); });
  // wrist: an oval gauntlet that matches the sleeve's section, closed by a strap
  const wr = (r0, r1, L, z, mat, sx, sy) => { const g = new THREE.CylinderGeometry(r0, r1, L, 18); g.rotateX(Math.PI / 2); const m = add(hand, g, mat, 0, 0.001, z); m.scale.set(sx, sy, 1); return m; };
  wr(0.03, 0.026, 0.05, 0.066, M.glove, 1.22, 0.62);
  wr(0.0305, 0.0305, 0.012, 0.074, M.strap, 1.24, 0.66);
  // fingers: tapered segments with rounded knuckles and fingertips; the last pad in the lighter palm material
  const seg = (parent, L, r0, r1, mat, tip) => {
    const g = new THREE.CylinderGeometry(r0, r1, L, 12, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, -L / 2);
    parent.add(new THREE.Mesh(g, mat));
    const k = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.04, 12, 8), mat); parent.add(k);
    const next = new THREE.Group(); next.position.z = -L; parent.add(next);
    if (tip) { const t = new THREE.Mesh(new THREE.SphereGeometry(r1, 12, 8), mat); t.scale.set(1, 0.85, 1.15); next.add(t); }
    return next;
  };
  const fingers = FINGERS.map(f => {
    const j0 = new THREE.Group(); j0.position.set(s * f.x, 0.0, f.z); hand.add(j0);
    const j1 = seg(j0, f.len[0], f.r, f.r * 0.92, M.glove), j2 = seg(j1, f.len[1], f.r * 0.92, f.r * 0.86, M.glove);
    seg(j2, f.len[2], f.r * 0.86, f.r * 0.8, M.tip, true);
    return [j0, j1, j2];
  });
  const tb = new THREE.Group(); tb.position.set(s * THUMB.x, THUMB.y, THUMB.z); hand.add(tb);
  const t1 = seg(tb, THUMB.len[0], THUMB.r * 1.1, THUMB.r, M.glove), t2 = seg(t1, THUMB.len[1], THUMB.r, THUMB.r * 0.92, M.glove);
  seg(t2, THUMB.len[2], THUMB.r * 0.92, THUMB.r * 0.84, M.tip, true);
  hand.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  hand.scale.setScalar(HAND_SCALE);
  return { group: hand, s: -s, fingers, thumb: [tb, t1, t2], pose: clonePose(POSES.wrap) };
}

export const clonePose = (p) => ({ f: p.f.map(a => a.slice()), spread: p.spread.slice(), t: p.t.slice() });
// blend a hand's current pose toward a target pose (k = 0..1)
export function blendPose(out, a, b, k) {
  for (let i = 0; i < 4; i++) { for (let j = 0; j < 3; j++) out.f[i][j] = a.f[i][j] + (b.f[i][j] - a.f[i][j]) * k; out.spread[i] = a.spread[i] + (b.spread[i] - a.spread[i]) * k; }
  for (let j = 0; j < 5; j++) out.t[j] = a.t[j] + (b.t[j] - a.t[j]) * k;
  return out;
}
function applyPose(h, p) {
  const s = h.s;
  h.fingers.forEach(([j0, j1, j2], i) => {
    j0.rotation.set(-p.f[i][0], s * p.spread[i], 0);
    j1.rotation.x = -p.f[i][1]; j2.rotation.x = -p.f[i][2];
  });
  const [tb, t1, t2] = h.thumb;
  tb.rotation.set(p.t[1], -s * p.t[0], s * p.t[2], 'YXZ');
  t1.rotation.x = -p.t[3]; t2.rotation.x = -p.t[4];
}

// sleeve segment: a lathe from the joint toward -y with a rounded cap, a muscle swell, cloth bunching near the
// joints and a hem at the far end; oval in section (wider across x). Scaled to the solved length.
function limb(L, prof, mat, hem) {
  const pts = [new THREE.Vector2(0.0001, prof[0] * 0.9)];
  pts.push(new THREE.Vector2(prof[0] * 0.62, prof[0] * 0.66), new THREE.Vector2(prof[0] * 0.9, prof[0] * 0.36));
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = t * (prof.length - 2), a = Math.floor(k), f = k - a;
    let r = prof[1 + a] + ((prof[2 + a] ?? prof[1 + a]) - prof[1 + a]) * (f * f * (3 - 2 * f));
    r += 0.0016 * Math.sin(t * 41 + 1.3) * (t < 0.3 || t > 0.7 ? 1 : 0.35); // folds
    pts.push(new THREE.Vector2(r, -t * L));
  }
  if (hem) { const r = prof[prof.length - 1]; pts.push(new THREE.Vector2(r * 1.1, -L - 0.004), new THREE.Vector2(r * 1.1, -L - 0.016), new THREE.Vector2(r * 0.8, -L - 0.018)); }
  else pts.push(new THREE.Vector2(0.0001, -L - 0.001));
  const g = new THREE.LatheGeometry(pts.reverse(), 22);
  g.scale(1.12, 1, 0.88);
  g.computeVertexNormals();
  const grp = new THREE.Group();
  const m = new THREE.Mesh(g, mat); m.castShadow = false; grp.add(m);
  return grp;
}

export function createVmArms(team) {
  const k = TEAMS[team].kit;
  // a touch lighter than the third-person kit so the arms read against dark scenes
  const shirt = new THREE.Color(k.shirt).offsetHSL(0, 0, 0.07);
  const fab = fabricMaps(shirt);
  const glove = new THREE.Color(k.glove).offsetHSL(0, 0, 0.04);
  const M = {
    glove: new THREE.MeshStandardMaterial({ color: glove, roughness: 0.68, metalness: 0.05 }),
    tip: new THREE.MeshStandardMaterial({ color: glove.clone().offsetHSL(0, 0, 0.025), roughness: 0.85 }),
    pad: new THREE.MeshStandardMaterial({ color: glove.clone().offsetHSL(0, -0.03, 0.035), roughness: 0.45, metalness: 0.08 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 }),
    sleeve: new THREE.MeshStandardMaterial({ map: fab.map, normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92 }),
  };
  const root = new THREE.Group();
  const mkArm = (side) => {
    const hand = buildHand(side, M);
    const upper = limb(UPPER, [0.05, 0.052, 0.054, 0.05, 0.046], M.sleeve, false);
    const fore = limb(FORE, [0.044, 0.046, 0.05, 0.048, 0.043, 0.038, 0.035], M.sleeve, true);
    root.add(upper, fore, hand.group);
    return { hand, upper, fore };
  };
  return { root, R: mkArm('R'), L: mkArm('L'), M };
}
const UPPER = 0.36, FORE = 0.4;

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
// hand transform from a palm position and directions given in the gun's frame (or camera space if frame = null)
export function handFrame(outPos, outQ, frame, frameQ, pos, fingersDir, palmDir) {
  _z.copy(fingersDir).normalize().negate();
  _y.copy(palmDir).negate();
  _y.addScaledVector(_z, -_y.dot(_z)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  outQ.setFromRotationMatrix(_m);
  if (frame) { outQ.premultiply(frameQ); frame.localToWorld(outPos.copy(pos)); } else outPos.copy(pos);
}

const DOWN = new THREE.Vector3(0, -1, 0), _w = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
function solveElbow(S, H, a, b, pole, out) {
  const d = _c.subVectors(H, S);
  const len = Math.min(Math.max(d.length(), 0.05), a + b - 0.002);
  d.normalize();
  const cosA = Math.max(-1, Math.min(1, (a * a + len * len - b * b) / (2 * a * len)));
  const along = a * cosA, h = Math.sqrt(Math.max(0, a * a - along * along));
  const pd = _p.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  return out.copy(S).addScaledVector(d, along).addScaledVector(pd, h);
}
// place one arm: hand at (pos, q) with pose, elbow solved toward pole, shoulder fixed (camera space)
// point a limb (extends along its local -y) along dir, rolled so its wide (x) side lines up with xHint
const _ox = new THREE.Vector3(), _oy = new THREE.Vector3(), _oz = new THREE.Vector3(), _om = new THREE.Matrix4(), _hx = new THREE.Vector3();
function orient(obj, dir, xHint) {
  _oy.copy(dir).negate();
  _ox.copy(xHint).addScaledVector(_oy, -xHint.dot(_oy));
  if (_ox.lengthSq() < 1e-6) _ox.set(1, 0, 0).addScaledVector(_oy, -_oy.x);
  _ox.normalize();
  _oz.crossVectors(_ox, _oy);
  _om.makeBasis(_ox, _oy, _oz);
  obj.quaternion.setFromRotationMatrix(_om);
}
export function poseArm(arm, shoulder, pos, q, pose, pole) {
  const h = arm.hand;
  h.group.position.copy(pos); h.group.quaternion.copy(q);
  applyPose(h, pose);
  h.pose = pose;
  _w.copy(WRIST).applyQuaternion(q).add(pos);
  solveElbow(shoulder, _w, UPPER, FORE, pole, _e);
  // forearm rolls with the wrist (flat side of the arm = back of the hand), upper arm follows the forearm
  _hx.set(1, 0, 0).applyQuaternion(q);
  arm.fore.position.copy(_e);
  orient(arm.fore, _d.subVectors(_w, _e).normalize(), _hx);
  arm.fore.scale.y = _e.distanceTo(_w) / FORE;
  _hx.set(1, 0, 0).applyQuaternion(arm.fore.quaternion);
  arm.upper.position.copy(shoulder);
  orient(arm.upper, _d.subVectors(_e, shoulder).normalize(), _hx);
  arm.upper.scale.y = shoulder.distanceTo(_e) / UPPER;
}
