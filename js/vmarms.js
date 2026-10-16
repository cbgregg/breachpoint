// First-person arms: gloved hands with jointed fingers and sleeved forearms, built for the viewmodel.
// Hands are placed in the gun's own frame (pistol grip, handguard, vertical grip, magazine) with a grip
// pose per job, so the fingers wrap what they hold instead of sticking out. Forearms and upper arms are
// solved with two-bone IK from shoulders below the camera to each wrist.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEAMS } from './config.js';
import { ASSETS } from './assets.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

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
const W = [1.62, 1.45, 0.85];
export const POSES = {
  trigger: { f: [[1.25, 1.7, 1.1], W, W, W], spread: [0.04, 0, -0.02, -0.05], t: [0.65, -0.5, 0.2, 0.25, 0.3], rt: [1.0, 1.1, 0.5, 0.5] },
  wrap: { f: [W, W, W, W], spread: [0.03, 0, -0.02, -0.05], t: [0.65, -0.55, 0.2, 0.3, 0.35], rt: [0.7, 0.95, 0.45, 0.45] },
  support: { f: [[0.95, 0.75, 0.4], [1.0, 0.75, 0.4], [1.0, 0.75, 0.4], [1.0, 0.8, 0.45]], spread: [0.06, 0, -0.04, -0.08], t: [0.4, -0.15, 0.1, 0.15, 0.2], rt: [0.1, 0.15, 0.15, 0.2] },
  cup: { f: [[0.75, 0.75, 0.45], [0.8, 0.8, 0.5], [0.85, 0.8, 0.5], [0.9, 0.85, 0.5]], spread: [0.05, 0, -0.04, -0.08], t: [0.6, -0.55, 0.2, 0.3, 0.3], rt: [0.35, 0.5, 0.35, 0.35] },
  fist: { f: [[1.55, 1.6, 1.1], [1.55, 1.6, 1.1], [1.55, 1.6, 1.1], [1.55, 1.6, 1.1]], spread: [0, 0, 0, 0], t: [0.25, -0.95, 0.3, 0.55, 0.5], rt: [0.6, 0.9, 0.6, 0.6] },
  open: { f: [[0.25, 0.3, 0.2], [0.25, 0.3, 0.2], [0.3, 0.35, 0.2], [0.35, 0.4, 0.25]], spread: [0.1, 0, -0.08, -0.16], t: [0.75, -0.2, 0.0, 0.1, 0.1], rt: [0.0, 0.1, 0.1, 0.1] },
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

export const clonePose = (p) => ({ f: p.f.map(a => a.slice()), spread: p.spread.slice(), t: p.t.slice(), rt: p.rt.slice() });
// blend a hand's current pose toward a target pose (k = 0..1)
export function blendPose(out, a, b, k) {
  for (let i = 0; i < 4; i++) { for (let j = 0; j < 3; j++) out.f[i][j] = a.f[i][j] + (b.f[i][j] - a.f[i][j]) * k; out.spread[i] = a.spread[i] + (b.spread[i] - a.spread[i]) * k; }
  for (let j = 0; j < 5; j++) out.t[j] = a.t[j] + (b.t[j] - a.t[j]) * k;
  for (let j = 0; j < 4; j++) out.rt[j] = a.rt[j] + (b.rt[j] - a.rt[j]) * k;
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
  const HA = ASSETS.hands;
  // tactical gloves over the hand model: the team's glove colour, the hand's own normal detail (knuckles,
  // creases) for shape, and a canvas weave with darker reinforced patches
  if (HA) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const base = glove.clone().multiplyScalar(0.55);
    g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) { const v = Math.random() * 30 - 15; g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); }
    for (let y = 0; y < 256; y += 3) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, 256, 1); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    M.skin = new THREE.MeshStandardMaterial({ map: t, normalMap: HA.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.78, metalness: 0.02 });
  }
  const mkArm = (side) => {
    const hand = buildHand(side, M);
    let rig = null;
    if (HA) { rig = makeRig(HA, M.skin, side === 'L'); root.add(rig.root); hand.group.visible = false; }
    const upper = limb(UPPER, [0.05, 0.052, 0.054, 0.05, 0.046], M.sleeve, false);
    const fore = limb(FORE, [0.044, 0.046, 0.05, 0.048, 0.043, 0.038, 0.035], M.sleeve, true);
    root.add(upper, fore, hand.group);
    return { hand, upper, fore, rig };
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
// ---------- skinned hand rig (assets/models/hands.glb) ----------
// The model is a right hand + wrist on a full arm skeleton. The left hand is the same rig under a
// mirrored root, driven with mirrored targets. Calibration maps our hand frame (palm centre, fingers -z,
// palm -y, thumb -x) onto the hand bone, so every grip pose and placement carries over.
const RIG_SCALE = 1.06;
// palm surface vs the bone line (our frame: +y toward the back of the hand, -z toward the fingers)
export const RIG_TUNE = { palmY: 0.035, palmZ: 0.0 };
const FINGER_BONES = ['index', 'middle', 'ring', 'pinky'];
function makeRig(asset, mat, mirror) {
  const root = new THREE.Group();
  const inner = skClone(asset.scene);
  inner.scale.setScalar(RIG_SCALE);
  root.add(inner);
  inner.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
  // the FBX export nests each bone under a same-named node; the outer one moves the whole chain
  const bone = (n) => { let b = null; inner.traverse(o => { if (!b && o.name === n) b = o; }); if (!b) throw new Error('hand rig: missing ' + n); return b; };
  root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3()), wq = (b) => b.getWorldQuaternion(new THREE.Quaternion());
  const hand = bone('handR'), fore = bone('forearmR');
  const H = wp(hand), F = wp(fore), Mid = wp(bone('finger_middle01R')), I = wp(bone('finger_index01R')), Pk = wp(bone('finger_pinky01R'));
  const zf = Mid.clone().sub(H).normalize().negate();
  const xf = Pk.clone().sub(I); xf.addScaledVector(zf, -xf.dot(zf)).normalize(); // away from the thumb = +x (right hand)
  const yf = new THREE.Vector3().crossVectors(zf, xf);
  const restQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xf, yf, zf));
  const handRestQ = wq(hand), foreRestQ = wq(fore);
  const invRest = restQ.clone().invert();
  // palm centre: a little over halfway from the wrist bone to the knuckles
  const palm = H.clone().lerp(Mid, 0.52);
  const R = {
    root, inner, mirror, hand, fore,
    off: invRest.clone().multiply(handRestQ),                         // hand bone = ourQ * off
    palmOff: palm.clone().sub(H).applyQuaternion(invRest).add(new THREE.Vector3(0, RIG_TUNE.palmY, RIG_TUNE.palmZ)), // palm centre from the wrist, our frame
    foreRel: handRestQ.clone().invert().multiply(foreRestQ),          // forearm in the hand's frame
    handInFore: H.clone().sub(F).applyQuaternion(foreRestQ.clone().invert()),
    foreAxis: H.clone().sub(F).applyQuaternion(foreRestQ.clone().invert()).normalize(),
    fScale: fore.getWorldScale(new THREE.Vector3()), hScale: hand.getWorldScale(new THREE.Vector3()),
    fingers: FINGER_BONES.map(f => [1, 2, 3].map(j => { const b = bone(`finger_${f}0${j}R`); return { b, rest: b.quaternion.clone() }; })),
    thumb: [1, 2, 3].map(j => { const b = bone(`thumb0${j}R`); return { b, rest: b.quaternion.clone() }; }),
    ends: FINGER_BONES.map(f => bone(`finger_${f}03R_end`)), thumbEnd: bone('thumb03R_end'),
  };
  if (mirror) root.scale.x = -1;
  return R;
}
const _rm = new THREE.Matrix4(), _rm2 = new THREE.Matrix4(), _rinv = new THREE.Matrix4(), _rs = new THREE.Vector3();
const _ax = new THREE.Vector3(1, 0, 0), _az = new THREE.Vector3(0, 0, 1), _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion();
// set a bone's transform given in rig-root space
function setRootSpace(R, b, p, q, sc) {
  _rinv.copy(R.root.matrixWorld).invert();
  _rm2.multiplyMatrices(_rinv, b.parent.matrixWorld).invert();      // root space -> parent local
  _rm.compose(p, q, sc);
  _rm.premultiply(_rm2);
  _rm.decompose(b.position, b.quaternion, b.scale);
  b.updateMatrixWorld(true);
}
const _rq0 = new THREE.Quaternion(), _rq1 = new THREE.Quaternion(), _rv = new THREE.Vector3(), _rv2 = new THREE.Vector3();
function driveRig(R, wrist, q, foreDir, pose) {
  R.root.updateMatrixWorld(true);
  // forearm: keep its natural twist relative to the hand, swung to lie along the solved forearm
  _rq0.copy(q).multiply(R.off);                                       // hand bone orientation
  _rq1.copy(_rq0).multiply(R.foreRel);
  _rv.copy(R.foreAxis).applyQuaternion(_rq1);
  _fq.setFromUnitVectors(_rv, _rv2.copy(foreDir).normalize());
  _rq1.premultiply(_fq);
  _rv.copy(R.handInFore).applyQuaternion(_rq1);
  setRootSpace(R, R.fore, _rv.negate().add(wrist), _rq1, R.fScale);
  setRootSpace(R, R.hand, wrist, _rq0, R.hScale);
  // fingers: curl about local x, spread about local z
  R.fingers.forEach((chain, i) => chain.forEach(({ b, rest }, j) => {
    b.quaternion.copy(rest);
    if (j === 0) b.quaternion.multiply(_fq.setFromAxisAngle(_az, pose.spread[i]));
    b.quaternion.multiply(_fq.setFromAxisAngle(_ax, pose.f[i][j]));
  }));
  const [t1, t2, t3] = R.thumb, rt = pose.rt;
  t1.b.quaternion.copy(t1.rest).multiply(_fq.setFromAxisAngle(_az, rt[0])).multiply(_fq2.setFromAxisAngle(_ax, rt[1]));
  t2.b.quaternion.copy(t2.rest).multiply(_fq.setFromAxisAngle(_ax, rt[2]));
  t3.b.quaternion.copy(t3.rest).multiply(_fq.setFromAxisAngle(_ax, rt[3]));
  R.hand.updateMatrixWorld(true);
}
const _mp = new THREE.Vector3(), _mq = new THREE.Quaternion(), _mw = new THREE.Vector3(), _me = new THREE.Vector3(), _md = new THREE.Vector3();
const mirrorQ = (q) => q.set(q.x, -q.y, -q.z, q.w);

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
  if (arm.rig) {
    const R = arm.rig, m = R.mirror;
    // work in the rig's right-hand space (mirrored for the left)
    _mp.copy(pos); _mq.copy(q); if (m) { _mp.x = -_mp.x; mirrorQ(_mq); }
    _mw.copy(R.palmOff).applyQuaternion(_mq).negate().add(_mp);      // wrist (hand bone), rig space
    _w.copy(_mw); if (m) _w.x = -_w.x;                                  // wrist, camera space
    solveElbow(shoulder, _w, UPPER, FORE, pole, _e);
    _me.copy(_e); if (m) _me.x = -_me.x;
    driveRig(R, _mw, _mq, _md.subVectors(_mw, _me), pose);
    // sleeve stops just short of the wrist so the wrist itself shows
    _hx.set(1, 0, 0).applyQuaternion(q);
    arm.fore.position.copy(_e);
    _d.subVectors(_w, _e); const L = _d.length(); _d.normalize();
    orient(arm.fore, _d, _hx);
    arm.fore.scale.y = Math.max(0.1, L - 0.004) / FORE;
    _hx.set(1, 0, 0).applyQuaternion(arm.fore.quaternion);
    arm.upper.position.copy(shoulder);
    orient(arm.upper, _d.subVectors(_e, shoulder).normalize(), _hx);
    arm.upper.scale.y = shoulder.distanceTo(_e) / UPPER;
    return;
  }
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

// ---------- grip fitting: close each finger until it touches the gun ----------
// The gun's surface is sampled into a point cloud (gun frame). Each finger then closes joint by joint
// (knuckle, middle, tip), the way a hand closes round an object, and stops at first contact, so fingers
// wrap the grip, handguard or magazine they hold instead of passing through it or hanging in the air.
// The palm is pushed back off the surface first if it starts inside. Runs once per gun when it's built.
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _tm = new THREE.Matrix4();
export function surfaceCloud(root, step = 0.0035) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const cell = 0.012, grid = new Map(), pts = [];
  const push = (v) => {
    const k = `${Math.floor(v.x / cell)},${Math.floor(v.y / cell)},${Math.floor(v.z / cell)}`;
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(v.x, v.y, v.z); pts.push(1);
  };
  const area2 = step * step;
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every(m => m.transparent || m.blending === THREE.AdditiveBlending)) return;
    _tm.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    if (n > 600000) return;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      _ta.fromBufferAttribute(pos, ia).applyMatrix4(_tm); _tb.fromBufferAttribute(pos, ib).applyMatrix4(_tm); _tc.fromBufferAttribute(pos, ic).applyMatrix4(_tm);
      const ab = _tb.clone().sub(_ta), ac = _tc.clone().sub(_ta);
      const area = ab.clone().cross(ac).length() / 2;
      const k = Math.min(400, Math.ceil(area / area2));
      push(_ta.clone());
      for (let j = 0; j < k; j++) {
        let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
        push(_ta.clone().addScaledVector(ab, u).addScaledVector(ac, v));
      }
    }
  });
  return { grid, cell, n: pts.length };
}
function hits(cloud, p, r) {
  const c = cloud.cell, x0 = Math.floor((p.x - r) / c), x1 = Math.floor((p.x + r) / c), y0 = Math.floor((p.y - r) / c), y1 = Math.floor((p.y + r) / c), z0 = Math.floor((p.z - r) / c), z1 = Math.floor((p.z + r) / c);
  const r2 = r * r;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const a = cloud.grid.get(`${x},${y},${z}`); if (!a) continue;
    for (let i = 0; i < a.length; i += 3) { const dx = a[i] - p.x, dy = a[i + 1] - p.y, dz = a[i + 2] - p.z; if (dx * dx + dy * dy + dz * dz < r2) return true; }
  }
  return false;
}
const _fw = new THREE.Vector3(), _fl = new THREE.Vector3(), _fp = new THREE.Vector3(), _fn = new THREE.Vector3(), _fq3 = new THREE.Quaternion();
// arm: from createVmArms; frame: the gun group; pos: palm centre (gun frame); q: hand orientation (world);
// pose: the starting grip. opts.keep: finger indices left as posed (0 = index, e.g. on the trigger).
// Returns { pose, push } with push the palm offset (gun frame) to apply to pos.
export function fitGrip(arm, frame, cloud, pos, q, pose, shoulder, pole, opts = {}) {
  const out = clonePose(pose), push = new THREE.Vector3();
  const R = arm.rig;
  if (!R || !cloud) return { pose: out, push };
  frame.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const local = (o) => o.getWorldPosition(_fw).applyMatrix4(inv);
  // palm: pull it back off the surface (toward the back of the hand) until it rests on it
  _fn.set(0, 1, 0).applyQuaternion(q).transformDirection(inv);           // back of the hand, gun frame
  const palmPts = [[0, 0], [0.026, -0.026], [-0.026, -0.026], [0.026, 0.02], [-0.026, 0.02], [0, -0.035]];
  const palmHit = () => palmPts.some(([x, z]) => {
    _fp.set(x, -0.004, z).applyQuaternion(q);                             // hand frame -> world offset
    frame.localToWorld(_fl.copy(pos).add(push)).add(_fp).applyMatrix4(inv);
    return hits(cloud, _fl, 0.006);
  });
  for (let i = 0; i < 14 && palmHit(); i++) push.addScaledVector(_fn, 0.002);
  frame.localToWorld(_fl.copy(pos).add(push));
  poseArm(arm, shoulder, _fl, q, out, pole);
  const setF = (i, a, sp) => {
    R.fingers[i].forEach(({ b, rest }, j) => {
      b.quaternion.copy(rest);
      if (j === 0) b.quaternion.multiply(_fq3.setFromAxisAngle(_az, sp));
      b.quaternion.multiply(_fq3.setFromAxisAngle(_ax, a[j]));
    });
    R.fingers[i][0].b.updateMatrixWorld(true);
  };
  const touches = (chain, end, rad) => {
    let prev = null;
    for (const o of [...chain, end]) {
      const p = local(o).clone();
      if (hits(cloud, p, rad)) return true;
      if (prev && hits(cloud, _tc.copy(prev).lerp(p, 0.5), rad)) return true;
      prev = p;
    }
    return false;
  };
  const keep = opts.keep || [];
  const MAX = [1.75, 1.8, 1.35];
  for (let i = 0; i < 4; i++) {
    if (keep.includes(i)) continue;
    const chain = R.fingers[i].map(x => x.b), end = R.ends[i], rad = 0.0078;
    const a = [0.12, 0.12, 0.08];
    setF(i, a, out.spread[i]);
    if (touches(chain, end, rad)) continue;                                // starts inside: leave the authored pose
    // knuckle, then middle joint, then fingertip: each closes until the finger meets the gun
    for (let j = 0; j < 3; j++) {
      while (a[j] < MAX[j]) {
        a[j] += 0.04; if (j === 1) a[2] = Math.max(a[2], a[1] * 0.45);
        setF(i, a, out.spread[i]);
        if (touches(chain, end, rad)) { a[j] -= 0.04; if (j === 1) a[2] = Math.max(0.08, a[2] - 0.02); break; }
      }
    }
    setF(i, a, out.spread[i]);
    out.f[i] = a.slice();
  }
  // thumb: swing it in toward the gun from its base pose until it touches
  if (!opts.keepThumb) {
    const T = R.thumb, rt = out.rt.slice(), chain = T.map(x => x.b);
    const setT = (k) => {
      T[0].b.quaternion.copy(T[0].rest).multiply(_fq3.setFromAxisAngle(_az, rt[0])).multiply(_fq.setFromAxisAngle(_ax, rt[1] * k));
      T[1].b.quaternion.copy(T[1].rest).multiply(_fq3.setFromAxisAngle(_ax, rt[2] * k));
      T[2].b.quaternion.copy(T[2].rest).multiply(_fq3.setFromAxisAngle(_ax, rt[3] * k));
      T[0].b.updateMatrixWorld(true);
    };
    let k = 0.2; setT(k);
    if (!touches(chain, R.thumbEnd, 0.0085)) {
      while (k < 1.6) { k += 0.05; setT(k); if (touches(chain, R.thumbEnd, 0.0085)) { k -= 0.05; break; } }
      out.rt[1] = rt[1] * k; out.rt[2] = rt[2] * k; out.rt[3] = rt[3] * k;
    }
  }
  return { pose: out, push };
}
