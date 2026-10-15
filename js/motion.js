// Procedural motion layered on the three mocap clips (Idle / Walk / Run):
//  - one shared gait phase driven by ground speed, so Walk and Run blend without double-stepping
//    and stride length matches how fast the body actually travels (no skating)
//  - spring-driven body dynamics: lean into acceleration, bank into turns, weight shift on stops,
//    landing compression, airborne leg tuck
//  - hit reactions: a damped spring impulse through the spine and head in the direction of the shot
//  - verlet ragdoll on death, seeded with the body's velocity and the killing shot's impulse,
//    colliding with the ground and nearby world boxes
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// ---------- springs ----------
// critically-ish damped spring towards a target (semi-implicit Euler, stable at large dt)
export class Spring {
  constructor(freq = 9, damp = 0.65) { this.x = 0; this.v = 0; this.w = freq * Math.PI * 2; this.z = damp; }
  step(target, dt) {
    const w = this.w, z = this.z;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (w * w * (target - this.x) - 2 * z * w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(v) { this.v += v; }
}

// ---------- gait ----------
// Walk/Run clips are authored with the left foot planting at ~45% (walk) / ~50% (run) of the cycle
const RUN_OFFSET = 0.06;
const WALK_SPEED = 1.7, RUN_SPEED = 5.8; // ground speed each clip was authored at (one cycle)

export function createMotion(model) {
  const A = model.actions;
  for (const n of ['Walk', 'Run']) A[n].setEffectiveTimeScale(0); // time is driven by the shared phase
  return {
    phase: 0,
    lastPos: null, vel: new THREE.Vector3(), acc: new THREE.Vector3(), lastYaw: null, yawRate: 0,
    leanF: new Spring(2.6, 0.55), leanS: new Spring(2.6, 0.55), bob: new Spring(4, 0.45),
    fP: new Spring(3.2, 0.32), fR: new Spring(3.2, 0.32), fY: new Spring(3.2, 0.35), fH: new Spring(4, 0.3),
    air: 0, wasGround: true, rag: null,
  };
}

// advance the gait and write clip times; returns nothing — bones are posed by the mixer afterwards
export function driveGait(mo, model, hs, back, dt) {
  const A = model.actions, w = model.blend;
  const wr = (w.Walk + w.Run) > 1e-3 ? w.Run / (w.Walk + w.Run) : 0;
  const walkRate = Math.max(0.6, hs / WALK_SPEED) / A.Walk.getClip().duration;
  const runRate = Math.max(0.7, hs / RUN_SPEED) / A.Run.getClip().duration;
  const rate = walkRate + (runRate - walkRate) * wr;
  mo.phase = (mo.phase + rate * dt * (back ? -1 : 1) + 1) % 1;
  A.Walk.time = mo.phase * A.Walk.getClip().duration;
  A.Run.time = ((mo.phase + RUN_OFFSET) % 1) * A.Run.getClip().duration;
}

// measure body velocity / acceleration / turn rate from what's actually rendered
// (works the same for local bots, the host's view and interpolated remote players)
export function sense(mo, pos, yaw, dt) {
  if (dt <= 0) return;
  if (!mo.lastPos) { mo.lastPos = pos.clone(); mo.lastYaw = yaw; return; }
  _a.subVectors(pos, mo.lastPos).divideScalar(dt);
  if (_a.lengthSq() > 400) _a.set(0, 0, 0); // teleport / respawn
  const k = Math.min(1, dt * 14);
  _b.copy(_a).sub(mo.vel).divideScalar(Math.max(dt, 1 / 120));
  mo.acc.lerp(_b.clampLength(0, 40), Math.min(1, dt * 10));
  mo.vel.lerp(_a, k);
  let dy = yaw - mo.lastYaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  mo.yawRate += (clamp(dy / dt, -12, 12) - mo.yawRate) * Math.min(1, dt * 10);
  mo.lastPos.copy(pos); mo.lastYaw = yaw;
}

// impulse from a bullet / blast: dir is the shot direction (world), head = headshot
export function hitImpulse(mo, yaw, dir, power = 1, head = false) {
  if (!mo) return;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const f = -(dir.x * s + dir.z * c); // + = pushing the body backwards (shot from the front)
  const r = dir.x * c - dir.z * s;
  const p = clamp(power, 0.3, 3);
  mo.fP.kick(-f * 9 * p);
  mo.fR.kick(-r * 9 * p);
  mo.fY.kick((Math.random() - 0.5) * 8 * p);
  if (head) mo.fH.kick(-f * 26 * p - 6);
}

// apply the dynamic layer after the clip pose (and before arm IK so the gun follows the torso)
export function applyDynamics(mo, c, B, rotateBoneWorld, dt) {
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  const right = _c.set(co, 0, -s);
  const fwdV = _a.set(-s, 0, -co);
  const accF = mo.acc.dot(fwdV), accS = mo.acc.dot(right);
  const hs = Math.hypot(mo.vel.x, mo.vel.z);
  const vF = mo.vel.dot(fwdV);

  // lean: into acceleration and with speed (sprinters lean forward), bank into turns
  const leanF = mo.leanF.step(clamp(accF * 0.022 + (c.tacSprinting ? 0.17 : c.sprinting ? 0.14 : clamp(vF * 0.02, -0.05, 0.06)), -0.28, 0.32), dt);
  const leanS = mo.leanS.step(clamp(-accS * 0.018 - mo.yawRate * hs * 0.012, -0.26, 0.26), dt);
  // landing / airborne
  const ground = c.onGround !== false;
  if (!ground) mo.air += dt; else {
    if (!mo.wasGround && mo.air > 0.25) mo.bob.kick(-clamp(mo.air, 0.25, 1) * 28);
    mo.air = 0;
  }
  mo.wasGround = ground;
  const bob = mo.bob.step(0, dt);
  // hit reactions decay back to zero
  const fP = mo.fP.step(0, dt), fR = mo.fR.step(0, dt), fY = mo.fY.step(0, dt), fH = mo.fH.step(0, dt);

  const fwd = _b.set(-s, 0, -co);
  rotateBoneWorld(B.Spine, right, -leanF * 0.6 - fP * 0.35);
  rotateBoneWorld(B.Spine, fwd, leanS * 0.6 + fR * 0.3);
  rotateBoneWorld(B.Spine1, right, -leanF * 0.4 - fP * 0.4);
  rotateBoneWorld(B.Spine1, fwd, leanS * 0.4 + fR * 0.3);
  rotateBoneWorld(B.Spine2, UP, fY * 0.25);
  rotateBoneWorld(B.Head, right, -fH * 0.5 + fP * 0.2);
  rotateBoneWorld(B.Head, fwd, -leanS * 0.5);

  // knees soak up landings; legs tuck while airborne
  const tuck = !ground ? clamp(mo.air * 3, 0, 1) * 0.45 : 0;
  const comp = clamp(-bob, 0, 0.6);
  return { drop: comp * 0.18, knee: tuck + comp };
}

// ---------- ragdoll ----------
const J = ['Hips', 'Spine2', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const IX = Object.fromEntries(J.map((n, i) => [n, i]));
const LINKS = [
  ['Hips', 'Spine2'], ['Spine2', 'Head'], ['Spine2', 'LeftArm'], ['Spine2', 'RightArm'], ['LeftArm', 'RightArm'],
  ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
  ['Hips', 'LeftUpLeg'], ['Hips', 'RightUpLeg'], ['LeftUpLeg', 'RightUpLeg'],
  ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'],
  // torso box braces
  ['LeftArm', 'LeftUpLeg'], ['RightArm', 'RightUpLeg'], ['LeftArm', 'RightUpLeg'], ['RightArm', 'LeftUpLeg'],
  ['Head', 'LeftArm'], ['Head', 'RightArm'], ['Head', 'Hips'],
];
// soft limits so joints don't fold through themselves (min fraction of the rest distance)
const MINS = [['LeftArm', 'LeftHand', 0.45], ['RightArm', 'RightHand', 0.45], ['LeftUpLeg', 'LeftFoot', 0.55], ['RightUpLeg', 'RightFoot', 0.55],
  ['Head', 'LeftHand', 0.25], ['Head', 'RightHand', 0.25], ['LeftFoot', 'RightFoot', 0.15], ['LeftHand', 'Hips', 0.2], ['RightHand', 'Hips', 0.2]];
const RAD = 0.09;

function basis(out, up, rightRaw) {
  const u = _a.copy(up).normalize();
  const r = _b.copy(rightRaw).addScaledVector(u, -rightRaw.dot(u)).normalize();
  const f = _c.crossVectors(r, u);
  return out.makeBasis(r, u, f);
}

// start a ragdoll from the current pose. vel: body velocity (world); hit: { point, dir, power } | null
export function startRagdoll(model, physics, vel, hit) {
  const B = model.bones;
  model.root.updateMatrixWorld(true);
  const p = J.map(n => B[n].getWorldPosition(new THREE.Vector3()));
  const v = p.map(() => vel.clone().multiplyScalar(0.9));
  if (hit) {
    const power = clamp(hit.power ?? 1, 0.3, 4);
    const base = p[0].y - 0.95; // feet level
    for (let i = 0; i < p.length; i++) {
      const d2 = p[i].distanceToSquared(hit.point);
      const w = Math.exp(-d2 / 0.18);
      const hk = clamp((p[i].y - base) / 1.3, 0.1, 1); // feet stay planted, the torso takes the hit
      v[i].addScaledVector(_a.copy(hit.dir).setY(Math.min(hit.dir.y, 0.1)), (0.7 + 1.9 * w) * power * hk);
      if (hit.up) v[i].y += hit.up * (0.6 + 0.4 * w);
    }
  } else {
    for (const q of v) q.x += (Math.random() - 0.5) * 0.6;
  }
  // knees give out first: a little downward/forward sag at the hips
  v[IX.Hips].y -= 0.6; v[IX.Spine2].y -= 0.3;
  const dt0 = 1 / 60;
  const prev = p.map((q, i) => q.clone().addScaledVector(v[i], -dt0));
  const links = LINKS.map(([a, b]) => [IX[a], IX[b], p[IX[a]].distanceTo(p[IX[b]])]);
  const mins = MINS.map(([a, b, f]) => [IX[a], IX[b], p[IX[a]].distanceTo(p[IX[b]]) * f]);

  // world boxes near the body
  const cx = p[0].x, cz = p[0].z, cy = p[0].y;
  const boxes = physics.boxes.filter(b => b.maxx > cx - 3 && b.minx < cx + 3 && b.maxz > cz - 3 && b.minz < cz + 3 && b.miny < cy + 2.5 && b.maxy > cy - 3);
  const hitFloor = physics.raycast(_a.set(cx, cy + 0.2, cz), new THREE.Vector3(0, -1, 0), 6);
  const floor = Math.max(0, hitFloor ? hitFloor.point.y : 0);

  // rest frames for the hips and chest
  const hipF = basis(new THREE.Matrix4(), _a.subVectors(p[IX.Spine2], p[IX.Hips]), _b.subVectors(p[IX.RightUpLeg], p[IX.LeftUpLeg]).clone());
  const chestF = basis(new THREE.Matrix4(), _a.subVectors(p[IX.Spine2], p[IX.Hips]), _b.subVectors(p[IX.RightArm], p[IX.LeftArm]).clone());
  const hipQ0 = B.Hips.getWorldQuaternion(new THREE.Quaternion());
  const chestQ0 = B.Spine2.getWorldQuaternion(new THREE.Quaternion());
  const hipInv = new THREE.Quaternion().setFromRotationMatrix(hipF).invert();
  const chestInv = new THREE.Quaternion().setFromRotationMatrix(chestF).invert();

  // the dropped gun tumbles on its own
  const gh = model.gunHolder;
  const gunP = gh.getWorldPosition(new THREE.Vector3());
  const gunV = vel.clone().multiplyScalar(0.8).add(hit ? hit.dir.clone().multiplyScalar(1.2 * (hit.power ?? 1)) : new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.7, (Math.random() - 0.5) * 0.6));
  const gunQ = gh.getWorldQuaternion(new THREE.Quaternion());
  const gunSpin = new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 5);

  return { p, prev, links, mins, boxes, floor, hipInv, chestInv, hipQ0, chestQ0, t: 0, still: 0,
    gun: { p: gunP, v: gunV, q: gunQ, spin: gunSpin, rest: false } };
}

function collide(rag, q, prevQ) {
  // ground
  if (q.y < rag.floor + RAD) {
    q.y = rag.floor + RAD;
    // friction: drag the previous position along so horizontal motion bleeds off
    prevQ.x += (q.x - prevQ.x) * 0.35; prevQ.z += (q.z - prevQ.z) * 0.35;
  }
  for (const b of rag.boxes) {
    if (q.x < b.minx - RAD || q.x > b.maxx + RAD || q.y < b.miny - RAD || q.y > b.maxy + RAD || q.z < b.minz - RAD || q.z > b.maxz + RAD) continue;
    // push out along the smallest penetration
    const dx1 = q.x - (b.minx - RAD), dx2 = (b.maxx + RAD) - q.x;
    const dy1 = q.y - (b.miny - RAD), dy2 = (b.maxy + RAD) - q.y;
    const dz1 = q.z - (b.minz - RAD), dz2 = (b.maxz + RAD) - q.z;
    const m = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);
    if (m === dx1) q.x -= dx1; else if (m === dx2) q.x += dx2;
    else if (m === dy1) q.y -= dy1; else if (m === dy2) { q.y += dy2; prevQ.x += (q.x - prevQ.x) * 0.35; prevQ.z += (q.z - prevQ.z) * 0.35; }
    else if (m === dz1) q.z -= dz1; else q.z += dz2;
  }
}

export function stepRagdoll(rag, dt) {
  if (rag.still > 1.2) return false; // asleep
  const n = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 60))));
  const h = Math.min(dt, 0.1) / n;
  let motion = 0;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < rag.p.length; i++) {
      const q = rag.p[i], pq = rag.prev[i];
      const vx = (q.x - pq.x) * 0.985, vy = (q.y - pq.y) * 0.985, vz = (q.z - pq.z) * 0.985;
      pq.copy(q);
      q.x += vx; q.y += vy - 9.8 * h * h; q.z += vz;
      motion += vx * vx + vy * vy + vz * vz;
    }
    for (let it = 0; it < 6; it++) {
      for (const [a, b, len] of rag.links) {
        const A = rag.p[a], Bp = rag.p[b];
        _a.subVectors(Bp, A);
        const d = _a.length() || 1e-6;
        const k = (d - len) / d * 0.5;
        A.addScaledVector(_a, k); Bp.addScaledVector(_a, -k);
      }
      for (const [a, b, min] of rag.mins) {
        const A = rag.p[a], Bp = rag.p[b];
        _a.subVectors(Bp, A);
        const d = _a.length() || 1e-6;
        if (d >= min) continue;
        const k = (d - min) / d * 0.5;
        A.addScaledVector(_a, k); Bp.addScaledVector(_a, -k);
      }
      for (let i = 0; i < rag.p.length; i++) collide(rag, rag.p[i], rag.prev[i]);
    }
  }
  rag.t += dt;
  rag.still = motion / n < 1e-6 && rag.t > 0.6 ? rag.still + dt : 0;

  // gun
  const g = rag.gun;
  if (!g.rest) {
    g.v.y -= 9.8 * dt;
    g.p.addScaledVector(g.v, dt);
    _q.setFromEuler(new THREE.Euler(g.spin.x * dt, g.spin.y * dt, g.spin.z * dt));
    g.q.multiply(_q);
    if (g.p.y < rag.floor + 0.04) {
      g.p.y = rag.floor + 0.04;
      g.v.multiplyScalar(0.3); g.v.y = Math.abs(g.v.y) * 0.25;
      g.spin.multiplyScalar(0.3);
      if (g.v.lengthSq() < 0.05) {
        g.rest = true;
        // settle on its side
        const e = new THREE.Euler().setFromQuaternion(g.q, 'YXZ');
        g.q.setFromEuler(new THREE.Euler(0, e.y, Math.PI / 2, 'YXZ'));
      }
    }
  }
  return true;
}

// write the simulated joints back onto the skeleton
export function poseRagdoll(rag, model, swingBone) {
  const B = model.bones, P = rag.p;
  const setWorld = (bone, pos, quat) => {
    bone.parent.updateMatrixWorld(true);
    _m.copy(bone.parent.matrixWorld).invert();
    if (pos) bone.position.copy(_c.copy(pos).applyMatrix4(_m));
    if (quat) {
      bone.parent.getWorldQuaternion(_q2).invert();
      bone.quaternion.copy(_q2.multiply(quat));
    }
    bone.updateMatrixWorld(true);
  };
  const frame = (up, rightRaw, inv, q0) => {
    basis(_m2, up, rightRaw);
    return _q.setFromRotationMatrix(_m2).multiply(inv).multiply(q0);
  };
  const up = new THREE.Vector3().subVectors(P[IX.Spine2], P[IX.Hips]);
  setWorld(B.Hips, P[IX.Hips], frame(up, new THREE.Vector3().subVectors(P[IX.RightUpLeg], P[IX.LeftUpLeg]), rag.hipInv, rag.hipQ0).clone());
  setWorld(B.Spine2, null, frame(up, new THREE.Vector3().subVectors(P[IX.RightArm], P[IX.LeftArm]), rag.chestInv, rag.chestQ0).clone());
  const aim = (bone, child, target) => {
    const from = bone.getWorldPosition(new THREE.Vector3());
    swingBone(bone, child, target.clone().sub(from).normalize());
  };
  aim(B.Neck, B.Head, P[IX.Head]);
  for (const side of ['Left', 'Right']) {
    aim(B[side + 'Arm'], B[side + 'ForeArm'], P[IX[side + 'ForeArm']]);
    aim(B[side + 'ForeArm'], B[side + 'Hand'], P[IX[side + 'Hand']]);
    aim(B[side + 'UpLeg'], B[side + 'Leg'], P[IX[side + 'Leg']]);
    aim(B[side + 'Leg'], B[side + 'Foot'], P[IX[side + 'Foot']]);
  }
  // gun
  const gh = model.gunHolder, g = rag.gun;
  gh.position.copy(g.p); gh.parent.worldToLocal(gh.position);
  gh.parent.getWorldQuaternion(_q2).invert();
  gh.quaternion.copy(_q2.multiply(g.q));
  gh.updateMatrixWorld(true);
}

// how hard a hit shoves the body (per pellet, so shotguns add up without going silly)
export function hitPower(def) {
  return Math.min(1.8, Math.max(0.45, def.damage / 32)) / (def.pellets > 1 ? Math.sqrt(def.pellets) : 1);
}
