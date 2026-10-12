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
  trigger: { f: [[0.32, 0.5, 0.32], W, W, W], spread: [0.04, 0, -0.02, -0.05], t: [0.5, -0.5, 0.2, 0.25, 0.3] },
  wrap: { f: [W, W, W, W], spread: [0.03, 0, -0.02, -0.05], t: [0.5, -0.55, 0.2, 0.3, 0.35] },
  support: { f: [[0.95, 0.75, 0.4], [1.0, 0.75, 0.4], [1.0, 0.75, 0.4], [1.0, 0.8, 0.45]], spread: [0.06, 0, -0.04, -0.08], t: [0.55, -0.15, 0.1, 0.1, 0.15] },
  cup: { f: [[0.75, 0.75, 0.45], [0.8, 0.8, 0.5], [0.85, 0.8, 0.5], [0.9, 0.85, 0.5]], spread: [0.05, 0, -0.04, -0.08], t: [0.6, -0.55, 0.2, 0.3, 0.3] },
  fist: { f: [[1.55, 1.6, 1.1], [1.55, 1.6, 1.1], [1.55, 1.6, 1.1], [1.55, 1.6, 1.1]], spread: [0, 0, 0, 0], t: [0.25, -0.95, 0.3, 0.55, 0.5] },
  open: { f: [[0.25, 0.3, 0.2], [0.25, 0.3, 0.2], [0.3, 0.35, 0.2], [0.35, 0.4, 0.25]], spread: [0.1, 0, -0.08, -0.16], t: [0.75, -0.2, 0.0, 0.1, 0.1] },
};

function fabricTex(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), col = new THREE.Color(color);
  g.fillStyle = `#${col.getHexString()}`; g.fillRect(0, 0, 128, 128);
  // twill weave + a few creases
  for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) {
    const v = ((x + y) % 8 < 4 ? 0.06 : -0.04) + (Math.random() - 0.5) * 0.08;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); const y = Math.random() * 128; g.moveTo(0, y); g.bezierCurveTo(40, y + 10, 80, y - 10, 128, y + (Math.random() - 0.5) * 20); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3);
  return t;
}

function buildHand(side, M) {
  const s = side === 'R' ? -1 : 1; // placement: right thumb on -x, left on +x; rotations use -s
  const hand = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  add(hand, new RoundedBoxGeometry(0.084, 0.03, 0.094, 3, 0.012), M.glove, 0, 0, 0);
  add(hand, new RoundedBoxGeometry(0.064, 0.008, 0.056, 2, 0.003), M.pad, 0, 0.016, 0.004);        // back-of-hand panel
  add(hand, new RoundedBoxGeometry(0.076, 0.012, 0.018, 2, 0.005), M.pad, 0, 0.012, -0.04);         // knuckle guard
  // gauntlet cuff over the wrist
  const cuff = add(hand, new THREE.CapsuleGeometry(0.033, 0.03, 4, 14), M.glove, 0, 0.002, 0.07);
  cuff.rotation.x = Math.PI / 2; cuff.scale.set(1.12, 1, 0.82);
  { const st = add(hand, new THREE.CylinderGeometry(0.036, 0.036, 0.012, 14), M.strap, 0, 0.002, 0.072); st.rotation.x = Math.PI / 2; st.scale.set(1.12, 1, 0.8); }
  const seg = (parent, L, r) => {
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, L - r), 3, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, -L / 2);
    parent.add(new THREE.Mesh(g, M.glove));
    const next = new THREE.Group(); next.position.z = -L; parent.add(next);
    return next;
  };
  const fingers = FINGERS.map(f => {
    const j0 = new THREE.Group(); j0.position.set(s * f.x, 0.001, f.z); hand.add(j0);
    const j1 = seg(j0, f.len[0], f.r), j2 = seg(j1, f.len[1], f.r * 0.95); seg(j2, f.len[2], f.r * 0.9);
    return [j0, j1, j2];
  });
  const tb = new THREE.Group(); tb.position.set(s * THUMB.x, THUMB.y, THUMB.z); hand.add(tb);
  const t1 = seg(tb, THUMB.len[0], THUMB.r), t2 = seg(t1, THUMB.len[1], THUMB.r * 0.95); seg(t2, THUMB.len[2], THUMB.r * 0.9);
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
  tb.rotation.set(p.t[1], s * p.t[0], s * p.t[2], 'YXZ');
  t1.rotation.x = -p.t[3]; t2.rotation.x = -p.t[4];
}

// limb segment: tapered sleeve from the joint toward -y, scaled to the solved length
function limb(r0, r1, L, mat, cuffMat) {
  const grp = new THREE.Group();
  const g = new THREE.CylinderGeometry(r0, r1, L, 16, 1, true); g.translate(0, -L / 2, 0);
  const m = new THREE.Mesh(g, mat); grp.add(m);
  if (cuffMat) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1 * 1.12, r1 * 1.12, 0.035, 16), cuffMat); c.position.y = -L + 0.03; grp.add(c); }
  const e = new THREE.Mesh(new THREE.SphereGeometry(r0, 14, 10), mat); grp.add(e); // elbow / shoulder cap
  grp.userData.L = L;
  return grp;
}

export function createVmArms(team) {
  const k = TEAMS[team].kit;
  // a touch lighter than the third-person kit so the arms read against dark scenes
  const shirt = new THREE.Color(k.shirt).offsetHSL(0, 0, 0.08);
  const sleeve = new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(shirt), roughness: 0.95 });
  const M = {
    glove: new THREE.MeshStandardMaterial({ color: new THREE.Color(k.glove).offsetHSL(0, 0, 0.04), roughness: 0.7, metalness: 0.05 }),
    pad: new THREE.MeshStandardMaterial({ color: new THREE.Color(k.glove).offsetHSL(0, 0, 0.14), roughness: 0.55 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }),
    sleeve,
    cuff: new THREE.MeshStandardMaterial({ color: 0xffffff, map: sleeve.map, roughness: 0.95 }),
  };
  M.cuff.color.setScalar(0.8);
  const root = new THREE.Group();
  const mkArm = (side) => {
    const hand = buildHand(side, M);
    const upper = limb(0.047, 0.042, UPPER, M.sleeve), fore = limb(0.042, 0.034, FORE, M.sleeve, M.cuff);
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
export function poseArm(arm, shoulder, pos, q, pose, pole) {
  const h = arm.hand;
  h.group.position.copy(pos); h.group.quaternion.copy(q);
  applyPose(h, pose);
  h.pose = pose;
  _w.copy(WRIST).applyQuaternion(q).add(pos);
  solveElbow(shoulder, _w, UPPER, FORE, pole, _e);
  arm.upper.position.copy(shoulder);
  arm.upper.quaternion.setFromUnitVectors(DOWN, _d.subVectors(_e, shoulder).normalize());
  arm.upper.scale.y = shoulder.distanceTo(_e) / UPPER;
  arm.fore.position.copy(_e);
  arm.fore.quaternion.setFromUnitVectors(DOWN, _d.subVectors(_w, _e).normalize());
  arm.fore.scale.y = _e.distanceTo(_w) / FORE;
}
