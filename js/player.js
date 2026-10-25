// Local player: input -> movement/weapons, first-person camera, viewmodel (IK arms, reloads, recoil),
// gamepad look with response curve + aim assist.
import * as THREE from 'three';
import { TEAMS, MELEE, GRENADE, PLAYER, EQUIPMENT } from './config.js';
import { buildGun } from './weapons.js';
import { glyph } from './hud.js';
import { createVmArms, poseArm, handFrame, POSES, blendPose, clonePose, surfaceCloud, fitGrip } from './vmarms.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sm5 = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }; // quintic: no jolt at either end
// tactical sprint (MW style): the gun held up by the right shoulder, muzzle high and turned in across the body,
// the grip hand in view. [position (camera space), rotation (pitch up, yaw in, roll)] per kind of gun; the pose
// is blended to as a whole (it used to be added on top of the normal sprint, which left every gun standing
// straight up in the middle of the screen with the hand out of sight)
const TAC_POSE = {
  long: { p: [0.17, -0.2, -0.32], r: [0.8, 0.35, -0.4] },
  pistol: { p: [0.13, -0.11, -0.3], r: [1.05, 0.15, -0.15] },
  launcher: { p: [0.26, -0.26, -0.12], r: [0.25, 0.35, -0.1] },   // tube on the shoulder, out of the way
};
const _tacP = new THREE.Vector3(), _tacQ = new THREE.Quaternion(), _tacE = new THREE.Euler();
const bump = (a, b, x) => smooth(a, a + (b - a) * 0.3, x) * (1 - smooth(b - (b - a) * 0.3, b, x));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _wish = new THREE.Vector3();
const _E = new THREE.Vector3(), _R = new THREE.Vector3(), _L = new THREE.Vector3(), _D = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

const SHOULDER_R = new THREE.Vector3(0.32, -0.5, 0.2), SHOULDER_L = new THREE.Vector3(-0.3, -0.5, 0.05);
const POLE_R = new THREE.Vector3(0.7, -1.4, 0.2), POLE_L = new THREE.Vector3(-0.4, -1, 0.2);
// where the hands go, in the gun's frame (origin = top of the pistol grip, barrel toward -z)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const RH_LONG = V3(0.031, -0.052, 0.018), RH_PISTOL = V3(0.03, -0.02, 0.016);
const GRIP_F = V3(0, -0.25, -0.97), PALM_L = V3(-1, 0, 0), PALM_R = V3(1, 0, 0), PALM_UP = V3(0, 1, 0);
// support hand: thumbs-forward two-hand grip, the left hand wrapping round the front of the grip over the right fingers
const LH_PISTOL = V3(-0.055, -0.03, 0.005), LH_PISTOL_F = V3(0.45, -0.25, -0.86), LH_PISTOL_P = V3(0.9, -0.1, 0.4);
const VG_OFF = V3(-0.03, -0.015, 0.036), VG_F = V3(0, -0.12, -1);
const SUP_OFF = V3(-0.03, -0.02, 0.012), SUP_OFF_PUMP = V3(-0.03, -0.02, 0.05), SUP_F = V3(0.45, -0.1, -0.9), PALM_SUP = V3(0.6, 0.8, 0);
const PORT_OFF = V3(0.034, -0.015, 0.01), PORT_F = V3(0, -0.2, -1);
const SPRINT_F = V3(0.15, -0.55, -0.8), SPRINT_P = V3(1, 0.2, 0);
const THROW_F = V3(0.1, 1, -0.3), THROW_P = V3(0.2, 0, -1);
const COOK_F = V3(0.25, 0.1, -1);
// gun pose at the height of a magazine change (offsets added to the hip pose)
export const RELOAD_POSES = {
  // kept low and right so the centre of the screen (your line of sight) stays clear; the roll turns the magwell toward you
  long: { x: 0.0, y: 0.0, z: -0.03, rx: 0.05, ry: 0.2, rz: -0.7 },
  pistol: { x: 0.0, y: -0.01, z: -0.01, rx: 0.15, ry: 0.15, rz: -0.45 },
  shotgun: { x: 0.0, y: 0.0, z: -0.02, rx: 0.06, ry: 0.15, rz: -0.45 },     // loading port turned toward you
  launcher: { x: 0.0, y: -0.07, z: 0.1, rx: 0.3, ry: 0.72, rz: -0.2 },  // muzzle up and in: you watch the rocket go into the tube
};
export const HANDS = { SHOULDER_R, SHOULDER_L, POLE_R, POLE_L, RH_LONG, RH_PISTOL, GRIP_F, PALM_L, PALM_R, PALM_UP, LH_PISTOL, LH_PISTOL_F, LH_PISTOL_P, VG_OFF, VG_F, SUP_OFF, SUP_F, PALM_SUP };
const _gq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _mq = new THREE.Quaternion(), _tp = new THREE.Vector3(), _v1 = new THREE.Vector3();
const _ld = new THREE.Vector3(), _gl = new THREE.Vector3(), _m0 = new THREE.Vector3(), _m1 = new THREE.Vector3(), _pp = new THREE.Vector3(), _fg = new THREE.Vector3();
const MAG_BOTTOM = { rifle: -0.21, smg: -0.17, pistol: -0.11, sniper: -0.09 };
const _lq = new THREE.Quaternion(), _lq2 = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qe = new THREE.Quaternion();
const _ch = new THREE.Vector3(), _cz = new THREE.Vector3(), _cq = new THREE.Quaternion();
// support hand on the charging handle / slide: palm down over the top, fingers across to the right
const CH_F = new THREE.Vector3(0.85, -0.35, -0.4), CH_P = new THREE.Vector3(0.1, -1, 0.15);
// palm on the bolt catch: flat against the left of the receiver, fingers forward and up
const BC_F = new THREE.Vector3(0, 0.35, -0.94), BC_P = new THREE.Vector3(1, 0, 0);
const EYE_RELIEF = -0.12; // sights sit close to the eye when aiming: a big, clear sight picture
const INSPECT = 3.0; // seconds
const SIGHT_SIZE = { normal: 1, large: 0.8, huge: 0.64 }; // viewmodel FOV multiplier at full ADS // close to the eye, like CoD: the optic frames the target
// The FOV setting works like Call of Duty's: degrees across a 4:3 frame (80 = MW default). three.js
// wants the vertical angle, which is what makes players and the gun look the right size.
export const vfov = (h) => 2 * Math.atan(Math.tan((h * Math.PI) / 360) * 0.75) * 180 / Math.PI;

// time-parametrised Hermite spline through keyframes KP at times KT (Catmull-Rom tangents, still at the ends)
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
function spline(KP, KT, n, t, out) {
  if (t >= KT[n - 1]) return out.copy(KP[n - 1]);
  if (t <= KT[0]) return out.copy(KP[0]);
  let i = 0; while (i < n - 2 && t >= KT[i + 1]) i++;
  const d = KT[i + 1] - KT[i], u = (t - KT[i]) / d, u2 = u * u, u3 = u2 * u;
  const tan = (j, o) => (j <= 0 || j >= n - 1) ? o.set(0, 0, 0) : o.subVectors(KP[j + 1], KP[j - 1]).divideScalar(KT[j + 1] - KT[j - 1]);
  tan(i, _s1); tan(i + 1, _s2);
  return out.copy(KP[i]).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(_s1, (u3 - 2 * u2 + u) * d)
    .addScaledVector(KP[i + 1], -2 * u3 + 3 * u2).addScaledVector(_s2, (u3 - u2) * d);
}
function solveElbow(S, H, a, b, pole, out) {
  const d = _c.subVectors(H, S);
  const len = clamp(d.length(), 0.05, a + b - 0.002);
  d.normalize();
  const cosA = clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
  const along = a * cosA, h = Math.sqrt(Math.max(0, a * a - along * along));
  const pd = _b.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  return out.copy(S).addScaledVector(d, along).addScaledVector(pd, h);
}

export const VM_TUNE = { yaw: 0.16, yawBy: { shotgun: 0.07 }, hip: { rifle: [0.115, -0.15, -0.25], smg: [0.11, -0.135, -0.28], sniper: [0.12, -0.162, -0.25], launcher: [0.13, -0.15, -0.2], shotgun: [0.105, -0.155, -0.12] } }; // hip: muzzle turned in so you see the gun's left side and the support hand
const FIT_CACHE = new Map(); // grip fits per gun build (same hands for every player)

export class PlayerController {
  constructor(game, char) {
    this.game = game;
    this.c = char;
    this.camera = game.camera;
    this.vmRoot = new THREE.Group();
    game.vmScene.add(this.vmRoot);
    this.guns = [];
    this.triggerLatch = false;
    this.bobT = 0; this.kick = 0; this.kickRot = 0; this.swayX = 0; this.swayY = 0; this.sprintT = 0;
    this.flashT = 0; this.shake = 0; this.landDip = 0; this.wasGround = true;
    this.recoilDebt = 0; this.lastShotT = -9;
    this.breathT = 0; this.prevSwayYaw = 0; this.prevSwayPitch = 0;
    this.crouchToggle = false; this.padSprint = false; this.proneOn = false; this.crouchHeldT = 0;
    this.assist = { target: null, yaw: 0, pitch: 0, snapT: 0, wasAds: false };
    this.cycleT = 0; // bolt / pump cycle after a shot
    this.correction = new THREE.Vector3(); // smooths network position corrections (camera only)
    this.cmd = null;
    this.lastFov = 0; this.lastVmFov = 0;
    this.cookT = null; this.gLatch = false; this.cookBlend = 0; this.nextTick = 0; // frag cooking
    this.inspectT = 0; // weapon inspect animation (seconds left)
    this.prevDeadFire = true; this.wasDead = false;
    this.arms = createVmArms(char.team);
    this.vmRoot.add(this.arms.root);
    this.lPose = clonePose(POSES.support); this.rPose = clonePose(POSES.trigger);
    this.buildViewmodels();
  }

  buildViewmodels() {
    this.guns.forEach(g => this.vmRoot.remove(g.holder));
    this.guns = this.c.weapons.map(w => {
      const holder = new THREE.Group();
      const gun = buildGun(w.id, { forViewmodel: true, att: w.def.att });
      holder.add(gun.group);
      holder.visible = false;
      this.vmRoot.add(holder);
      const pistol = w.def.model.type === 'pistol';
      const touch = this.game.input.isTouch;
      // where the left hand holds the magazine (gun frame): pistols palm it from below, the rest wrap it
      const type = w.def.model.type;
      let magHold = null;
      if (type !== 'shotgun') {
        holder.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gun.mag).applyMatrix4(gun.group.matrixWorld.clone().invert());
        if (box.isEmpty() || box.max.y - box.min.y < 0.03) box.set(V3(-0.015, -0.17, -0.02), V3(0.015, -0.05, 0.02)); // mag modelled into the grip
        magHold = type === 'pistol'
          ? { pos: V3((box.min.x + box.max.x) / 2 - 0.004, box.min.y - 0.016, (box.min.z + box.max.z) / 2 + 0.006), f: V3(0.55, 0, -0.85), p: PALM_UP, pose: POSES.cup }
          : { pos: V3(box.min.x - 0.016, box.max.y + (box.min.y - box.max.y) * 0.6, Math.max(box.min.z + 0.046, (box.min.z + box.max.z) / 2)), f: V3(0, -0.1, -1), p: PALM_R, pose: POSES.wrap };
      }
      // launcher: the left hand holds the warhead from the left side, fingers forward
      if (type === 'launcher') magHold = { pos: V3(-0.072, 0.07, -0.57), f: V3(0, -0.15, -1), p: PALM_R, pose: POSES.wrap };
      // fit the hands to this gun: fingers close round the grip, handguard / foregrip and magazine until they touch
      const fit = this.fitHands(gun, type, magHold);
      return {
        id: w.id, holder, gun, type, magHold, fit,
        // phones: gun sits a little lower so it doesn't fill the small screen (the viewmodel FOV is wider too)
        hip: touch ? (pistol ? new THREE.Vector3(0.11, -0.13, -0.3) : new THREE.Vector3(0.12, -0.155, -0.18))
          : VM_TUNE.hip[type] ? new THREE.Vector3(...VM_TUNE.hip[type]) : pistol ? new THREE.Vector3(0.06, -0.094, -0.25) : new THREE.Vector3(0.11, -0.145, -0.21),
        ads: new THREE.Vector3(-(gun.sightX || 0), -gun.sightY, (gun.eyeRelief ?? EYE_RELIEF) - gun.sightZ),
        // the pistol at the hip: up in front, muzzle tipped up and turned in, both hands on it (CoD style)
        hipRot: pistol && !touch ? [0.08, 0.18, -0.05] : null,
      };
    });
    if (!this.flash) {
      const tex = this.game.effects.starTex;
      this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(3, 2.4, 1.6), toneMapped: false }));
      this.flash.visible = false;
      this.vmFlashLight = new THREE.PointLight(0xffb060, 0, 2, 2);
    }
    this.vmRoot.add(this.flash, this.vmFlashLight);
  }

  fitHands(gun, type, MH) {
    const A = gun.att || {};
    const key = type + ':' + JSON.stringify(A) + ':' + (this.game.input.isTouch ? 1 : 0);
    const hit = FIT_CACHE.get(key);
    if (hit) { if (MH && hit.M) { MH.pos.add(hit.M.push); MH.pose = hit.M.pose; } return hit; }
    let cloud = null;
    try { cloud = surfaceCloud(gun.group); } catch (e) { console.warn('grip fit', e); }
    gun.group.updateMatrixWorld(true);
    gun.group.getWorldQuaternion(_gq);
    const one = (arm, pos, f, p, pose, sh, pole, opts) => {
      handFrame(_tp, _tq, gun.group, _gq, pos, f, p);
      const r = fitGrip(arm, gun.group, cloud, pos, _tq, pose, sh, pole, opts);
      return r;
    };
    const R = one(this.arms.R, type === 'pistol' ? RH_PISTOL : (gun.rh || RH_LONG), GRIP_F, PALM_L, POSES.trigger, SHOULDER_R, POLE_R, { keep: [0] });
    let L;
    if (type === 'pistol') L = one(this.arms.L, LH_PISTOL, LH_PISTOL_F, LH_PISTOL_P, POSES.wrap, SHOULDER_L, POLE_L);
    else if (A.under === 'vgrip') L = one(this.arms.L, _v1.copy(gun.foregrip.position).add(VG_OFF), VG_F, PALM_R, POSES.wrap, SHOULDER_L, POLE_L);
    else L = one(this.arms.L, _v1.copy(gun.pump ? gun.pump.position : gun.foregrip.position).add(gun.pump ? SUP_OFF_PUMP : SUP_OFF), SUP_F, PALM_SUP, POSES.support, SHOULDER_L, POLE_L);
    let M = null;
    if (MH) { M = one(this.arms.L, MH.pos, MH.f, MH.p, MH.pose, SHOULDER_L, POLE_L); MH.pos.add(M.push); MH.pose = M.pose; }
    const res = { R, L, M };
    FIT_CACHE.set(key, res);
    return res;
  }

  muzzleWorld(out) {
    const g = this.guns[this.c.cur];
    g.holder.updateMatrixWorld(true);
    g.gun.muzzle.getWorldPosition(out);
    return this.camera.localToWorld(out);
  }
  // laser emitter of the current gun in world space (null if it has none)
  laserWorld(out, dirOut) {
    const g = this.guns[this.c.cur];
    if (!g || !g.gun.laser || !this.vmRoot.visible) return null;
    g.gun.laser.getWorldPosition(out);
    this.camera.localToWorld(out);
    g.gun.group.getWorldQuaternion(_lq);
    dirOut.set(0, 0, -1).applyQuaternion(_lq).applyQuaternion(this.camera.quaternion);
    return out;
  }
  ejectWorld(out) {
    const g = this.guns[this.c.cur];
    g.gun.eject.getWorldPosition(out);
    return this.camera.localToWorld(out);
  }

  update(dt) {
    const c = this.c, g = this.game, inp = g.input, s = g.settings;
    if (!c.alive) {
      this.vmRoot.visible = false;
      this.cookT = null; this.inspectT = 0;
      if (!this.wasDead) { this.wasDead = true; this.prevDeadFire = true; this.dcDeathT = -1; }
      // respawn early: X / R, A / Space, a fresh click — after a short moment so you see who got you
      const fireEdge = inp.fire && !this.prevDeadFire;
      this.prevDeadFire = inp.fire;
      if (g.gm) {
        // round modes: no respawn. After the kill cam, watch a living teammate (jump / fire / X: next one)
        const next = g.time - c.deathT > 2.5 && (inp.action('reload') || inp.action('jump') || fireEdge);
        if (this.specCam(dt, next)) return;
      } else if (g.time - c.deathT > PLAYER.respawnMin && (inp.action('reload') || inp.action('jump') || fireEdge)) g.requestRespawn();
      this.deathCam(dt);
      return;
    }
    this.specTarget = null;
    if (this.wasDead) { this.wasDead = false; this.lastFov = 0; }
    this.vmRoot.visible = true;
    const canAct = !g.frozen && !c.busy; // planting / defusing roots you in place
    const def = c.weapon.def;

    // ---- look ----
    const baseFov = vfov(s.fov);
    const zoom = lerp(1, this.adsFov(def) / baseFov, c.adsT);
    const stunK = c.stunT > 0 ? 1 - 0.65 * Math.min(1, c.stunT / 1.5) : 1;   // stunned: aim drags
    const adsK = lerp(1, clamp(Number(s.adsSens) || 1, 0.2, 2), c.adsT);   // aim sensitivity
    const sens = 0.0022 * s.sensitivity * zoom * stunK * adsK;
    const inv = s.invertY ? -1 : 1;
    c.yaw -= inp.mouseDX * sens;
    c.pitch -= inp.mouseDY * sens * inv;
    if (inp.lookX || inp.lookY) {
      let rate = 3.6 * s.padSensitivity * Math.pow(zoom, 0.8) * stunK * adsK;
      const aa = this.aimAssist(dt, s);
      rate *= aa;
      c.yaw -= inp.lookX * rate * dt;
      c.pitch -= inp.lookY * rate * dt * 0.75 * inv;
    } else if (inp.lastDevice === 'pad') {
      this.aimAssist(dt, s);
    }
    this.applyAdsSnap(dt);
    c.pitch = clamp(c.pitch, -1.5, 1.5);

    // ---- movement ----
    let f = inp.moveY, r = inp.moveX;
    if (inp.down('KeyW') || inp.down('ArrowUp')) f += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) f -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) r += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) r -= 1;
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    _wish.set(-sy * f + cy * r, 0, -cy * f - sy * r);
    if (_wish.lengthSq() > 1) _wish.normalize();
    if (!canAct) _wish.set(0, 0, 0);

    // L3 starts sprinting (it doesn't toggle off); letting go of forward, aiming or firing ends it.
    // Sprinting cancels a reload, as in Call of Duty.
    const shift = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const sprintPress = inp.action('sprint') || (shift && !this.prevShift);
    this.prevShift = shift;
    if (sprintPress) this.padSprint = true;
    if (f < 0.35 || inp.ads || inp.fire) this.padSprint = false;
    // touch auto-fire target (decided before movement so it can break a sprint, like pulling the trigger)
    const at = g.aimTarget;
    const autoOn = canAct && inp.isTouch && s.touchAutoFire !== false && !inp.fire && !!at && at.alive && !at.hidden
      && at.pos.distanceTo(c.pos) < def.range * 0.9;
    const autoSprint = s.autoSprint && !inp.isTouch && f > 0.9 && Math.abs(r) < 0.6 && !this.proneOn && !this.crouchToggle && !inp.down('ControlLeft');
    const sprintWant = canAct && (shift || this.padSprint || inp.touchSprint || autoSprint) && f > 0.4 && !inp.ads && !inp.fire && !autoOn;
    if (sprintWant && sprintPress && c.weapon.reloading) c.weapon.cancelReload();
    const sprint = sprintWant && !c.weapon.reloading;
    // tactical sprint: double-tap Shift, click L3 again while sprinting, or push the touch stick to
    // sprint twice in quick succession. Lasts until you stop sprinting or the charge runs out.
    const touchEdge = inp.touchSprint && !this.prevTouchSprint;
    this.prevTouchSprint = inp.touchSprint;
    const shiftEdge = shift && !this.prevShiftTac;
    const now = g.time;
    if (!shift && this.prevShiftTac) this.lastShiftUpT = now; // quick release + press again = double tap
    this.prevShiftTac = shift;
    if ((shiftEdge && now - (this.lastShiftUpT ?? -9) < 0.3) || (inp.lastDevice === 'pad' && sprintPress && c.sprinting && !shiftEdge) || (touchEdge && now - (this.lastTouchSprintT ?? -9) < 0.45)) {
      if (c.tacFuel > 0.3) this.tacOn = true;
    }
    if (inp.touchSprint === false && this.prevTouchUp !== false) this.lastTouchSprintT = now;
    this.prevTouchUp = inp.touchSprint;
    if (!sprint || c.tacFuel <= 0.05) this.tacOn = false;
    const tac = sprint && !!this.tacOn;

    let slideReq = false;
    const crouchPress = inp.action('crouch'), slidePress = inp.action('slide');
    if ((crouchPress || slidePress) && c.sprinting && c.onGround) slideReq = true;
    else if (crouchPress) {
      if (this.proneOn) { this.proneOn = false; this.crouchToggle = true; }   // prone -> crouch
      else this.crouchToggle = !this.crouchToggle;
    }
    // prone: hold crouch (C / B on a controller) for a moment, or press Z
    const crouchHeld = inp.down('KeyC') || inp.padHeld('crouch') || !!inp.touchCrouch;
    this.crouchHeldT = crouchHeld && !c.sprinting && c.slideT <= 0 ? this.crouchHeldT + dt : 0;
    if (this.crouchHeldT > 0.32 && !this.proneOn && this.crouchHeldT - dt <= 0.32) { this.proneOn = true; this.crouchToggle = false; }
    if (inp.action('prone')) { this.proneOn = !this.proneOn; if (!this.proneOn) this.crouchToggle = true; else this.crouchToggle = false; }
    if (sprint && !c.sprinting) { this.crouchToggle = false; if (this.proneOn && f > 0.4) this.proneOn = false; }   // sprint gets you up
    c.wantCrouch = this.crouchToggle || inp.down('ControlLeft');
    c.wantProne = this.proneOn && c.alive;
    let jump = canAct && (inp.down('Space') || inp.action('jump'));
    if (jump && this.proneOn) { this.proneOn = false; this.crouchToggle = true; c.wantProne = false; c.wantCrouch = true; jump = false; }
    if (jump) this.crouchToggle = false;
    c.updateMovement(dt, _wish, sprint, jump, slideReq && canAct, tac);
    // the exact command that produced this frame's movement (sent to the host when playing online)
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));
    this.cmd = { dt, mx: canAct ? clamp1(r) : 0, my: canAct ? clamp1(f) : 0, y: c.yaw, p: c.pitch, sp: sprint ? 1 : 0, tac: tac ? 1 : 0, cr: c.wantCrouch ? 1 : 0, pr: c.wantProne ? 1 : 0, j: jump ? 1 : 0, sl: slideReq && canAct ? 1 : 0, f: 0, ads: 0, a: null };
    if (!this.wasGround && c.onGround) this.landDip = 1;
    this.wasGround = c.onGround;

    // ---- weapons ----
    if (!canAct) g.hud.doorPrompt = '';
    if (canAct) {
      if (inp.action('slot1')) c.switchTo(0);
      if (inp.action('slot2')) c.switchTo(1);
      if (inp.action('swap') || inp.wheel !== 0) c.switchTo(c.prev);
      // in a plant / defuse zone the reload button is the use button
      // the reload button also opens / closes the door you're at (the host decides for guests)
      const atDoor = g.doors && g.doors.near(c);
      g.hud.doorPrompt = atDoor ? `${glyph('reload', g.hud.device)} ${atDoor.target ? 'CLOSE' : 'OPEN'} DOOR` : '';
      if (inp.action('reload') && !(g.gm && (g.gm.authority ? g.gm.useZone(c) : g.gm.guestZone(c)))) {
        if (atDoor) { if (g.mode !== 'guest') g.doors.use(c); }
        else { c.reload(); this.padSprint = false; }
      }
      if (inp.action('melee')) c.melee();
    }
    // frag: hold to pull the pin and cook, release to throw. Hold past the fuse and it goes off in your hand.
    let thrownCook = null;
    const gHeld = inp.grenadeHeld;
    const lspec = EQUIPMENT[c.lethal] || EQUIPMENT.frag;
    if (this.cookT === null) {
      if (canAct && gHeld && !this.gLatch && c.canThrow()) {
        this.cookT = 0; this.nextTick = 1; this.inspectT = 0;
        c.weapon.cancelReload();
        if (lspec.cook) g.audio.play('pin', null);
      }
    } else {
      this.cookT += dt;
      // only the frag cooks (ticks, and goes off in your hand if held too long); the rest throw on release
      if (lspec.cook && this.cookT >= this.nextTick && this.cookT < lspec.fuse) { g.audio.play('ui', null, { ui: true, freq: 1500 + this.nextTick * 250 }); this.nextTick += this.cookT > lspec.fuse - 1.2 ? 0.25 : 1; }
      if ((!gHeld || (lspec.cook && this.cookT >= lspec.fuse)) && canAct) {
        thrownCook = this.cookT;
        this.cookT = null;
        this.gLatch = gHeld;
        c.throwGrenade(undefined, thrownCook);
      } else if (!canAct) this.cookT = null;
    }
    if (!gHeld) this.gLatch = false;
    // tactical (RB / E): thrown straight away
    let threwTac = false;
    if (canAct && this.cookT === null && inp.action('tactical') && c.canTactical()) { c.throwTactical(); threwTac = true; this.inspectT = 0; }
    // inspect (I / D-pad down): works during the start countdown too
    if (inp.action('inspect') && !c.weapon.reloading && c.switchT <= 0 && this.cookT === null) { this.inspectT = INSPECT; this.inspectCur = c.cur; }
    if (this.inspectT > 0) {
      if (this.inspectCur === undefined) this.inspectCur = c.cur;
      this.inspectT -= dt;
      if (inp.fire || inp.ads || c.sprinting || c.weapon.reloading || this.inspectCur !== c.cur || c.meleeT > 0) this.inspectT = 0;
    }
    // toggle ADS drops out on reload, weapon swap, sprint, melee and throws, like hold ADS would
    if (c.weapon.reloading || c.switchT > 0 || c.sprinting || c.meleeT > 0 || c.grenadeCd > 0.6) inp.clearAds();
    const cooking = this.cookT !== null;
    if (cooking) inp.clearAds();
    const adsWant = canAct && inp.ads && !cooking && !c.sprinting && c.switchT <= 0 && !c.weapon.reloading && c.meleeT <= 0 ? 1 : 0;
    this.cmd.ads = adsWant;
    this.cmd.f = canAct && inp.fire && !cooking ? 1 : 0;
    this.cmd.u = g.gm && inp.useHeld && !g.frozen ? 1 : 0;
    const acts = inp.used.filter(a => a === 'reload' || a === 'melee' || a === 'swap' || a === 'slot1' || a === 'slot2');
    if (thrownCook !== null) { acts.push('grenade'); this.cmd.gk = thrownCook; }
    if (threwTac) acts.push('tactical');
    if (acts.length) this.cmd.a = acts;
    c.adsT = clamp(c.adsT + Math.sign(adsWant - c.adsT) * dt / def.adsTime, 0, 1);

    // touch auto-fire: shoot while the crosshair is on an enemy in range (Call of Duty Mobile "simple mode")
    const auto = autoOn && !c.sprinting;
    let fired = false;
    if (canAct && !cooking && (inp.fire || auto) && this.cycleT <= 0) {
      if (def.auto || !this.triggerLatch || auto) {
        if (c.tryFire(c.eyePos(_a), c.forward(_b))) { this.onFired(c.weapon.def); fired = true; }
      }
      this.triggerLatch = true;
    } else if (!inp.fire) {
      this.triggerLatch = false;
    }
    // semi-auto weapons on auto-fire: send the trigger as a pulse so the host's trigger latch resets
    if (auto) this.cmd.f = def.auto || fired ? 1 : 0;

    // recoil recovery (pulls most of the climb back down after you stop firing)
    if (g.time - this.lastShotT > 0.09 && this.recoilDebt > 0) {
      const rec = Math.min(this.recoilDebt, this.recoilDebt * dt * 7 + dt * 0.02);
      c.pitch -= rec;
      this.recoilDebt -= rec;
    }

    this.updateBreathing(dt);
    this.updateCamera(dt);
    this.updateViewmodel(dt, inp.mouseDX + inp.lookX * 18, inp.mouseDY + inp.lookY * 18);
  }

  // returns look-rate multiplier; also tracks the target for rotational assist
  aimAssist(dt, s) {
    const A = this.assist;
    if (!s.aimAssist || this.game.input.lastDevice !== 'pad') { A.target = null; A.mul = 1; return 1; }
    const c = this.c, g = this.game;
    const eye = c.eyePos(_a);
    const fwd = c.forward(_b);
    let best = null, bestAng = 0.16;
    for (const e of g.characters) {
      if (!e.alive || e.hidden || !g.foes(e, c)) continue;
      const dist = e.pos.distanceTo(c.pos);
      if (dist > 70) continue;
      e.chestPos(_c).sub(eye);
      const ang = Math.acos(clamp(_c.normalize().dot(fwd), -1, 1));
      const lim = Math.atan2(1.4, dist) + 0.03;
      if (ang < lim && ang < bestAng && !g.physics.blocked(eye, e.chestPos(_E))) { best = e; bestAng = ang; }
    }
    // the stick's slowdown eases in and out (a sudden change in turn speed reads as a stutter)
    const ease = (to) => (A.mul = (A.mul ?? 1) + (to - (A.mul ?? 1)) * Math.min(1, dt * 9));
    if (!best) { A.target = null; return ease(1); }
    best.chestPos(_c).sub(eye);
    const ty = Math.atan2(-_c.x, -_c.z), tp = Math.atan2(_c.y, Math.hypot(_c.x, _c.z));
    const inp = g.input, steering = Math.abs(inp.lookX || 0) + Math.abs(inp.lookY || 0) > 0.05 || Math.abs(inp.moveX || 0) + Math.abs(inp.moveY || 0) > 0.1;
    if (A.target === best && steering) {
      // rotational assist: follow part of the target's angular motion, only while you're aiming or moving
      // (never on its own), capped so it can't swing the view
      const strength = 0.15 + 0.12 * c.adsT, cap = 0.8 * dt;
      const dy = angDiff(A.yaw, ty), dp = tp - A.pitch;
      if (Math.abs(dy) < 0.12 && Math.abs(dp) < 0.12) {
        c.yaw += clamp(dy * strength, -cap, cap);
        c.pitch += clamp(dp * strength * 0.6, -cap, cap);
      }
    }
    A.target = best; A.yaw = ty; A.pitch = tp;
    const dist = best.pos.distanceTo(c.pos);
    const onTarget = bestAng < Math.atan2(0.5, dist) + 0.01;
    return ease(onTarget ? 0.7 : 0.85);
  }

  applyAdsSnap(dt) {
    const A = this.assist, c = this.c;
    const adsNow = c.adsT > 0.5;
    if (adsNow && !A.wasAds && A.target && this.game.settings.aimAssist && this.game.input.lastDevice === 'pad') A.snapT = 0.16;
    A.wasAds = adsNow;
    if (A.snapT > 0 && A.target && A.target.alive) {
      A.snapT -= dt;
      const eye = c.eyePos(_a);
      A.target.chestPos(_c).sub(eye);
      const ty = Math.atan2(-_c.x, -_c.z), tp = Math.atan2(_c.y, Math.hypot(_c.x, _c.z));
      // a gentle pull when you aim down sights near a target (only if they're already close to the crosshair)
      const ey = angDiff(c.yaw, ty), ep = tp - c.pitch;
      if (Math.abs(ey) > 0.1 || Math.abs(ep) > 0.1) { A.snapT = 0; return; }
      const k = Math.min(1, dt * 9) * 0.35;
      c.yaw += ey * k;
      c.pitch += ep * k;
    }
  }

  updateBreathing(dt) {
    const c = this.c;
    this.breathT += dt;
    const scoped = c.weapon.def.scope;
    const holdBreath = scoped && (this.game.input.down('ShiftLeft') || this.game.input.padHeld('sprint'));
    // scope sway eases in over the first second scoped, so a quick-scope is steady
    this.scopedT = c.adsT >= 0.99 ? (this.scopedT || 0) + dt : 0;
    const settle = scoped ? Math.min(1, Math.max(0, (this.scopedT - 0.35) / 0.9)) : 1;
    const amp = c.adsT * (scoped ? (holdBreath ? 0.0004 : 0.0032 * settle) : 0.0006);
    const sy = Math.sin(this.breathT * 0.9) * amp;
    const sp = Math.sin(this.breathT * 1.8) * amp * 0.6;
    c.yaw += sy - this.prevSwayYaw;
    c.pitch += sp - this.prevSwayPitch;
    this.prevSwayYaw = sy; this.prevSwayPitch = sp;
  }

  onFired(def) {
    const c = this.c;
    this.kick = 1;
    this.kickRot = 1;
    this.flashT = 0.045;
    this.lastShotT = this.game.time;
    const rm = (1 - 0.35 * c.adsT) * (c.proneT > 0.6 ? 0.6 : c.crouchT > 0.5 ? 0.75 : 1);
    const climb = def.recoilPitch * rm * (0.85 + Math.random() * 0.3);
    c.pitch += climb;
    this.recoilDebt = Math.min(0.25, this.recoilDebt + climb * 0.65);
    c.yaw += (Math.random() - 0.45) * 2 * def.recoilYaw * rm;
    this.shake = Math.min(1, this.shake + def.recoilPitch * 5);
    if (def.mode === 'BOLT' || def.mode === 'PUMP') this.cycleT = 60 / def.rpm * 0.9;
    this.game.input.rumble(def.mode === 'BOLT' || def.mode === 'PUMP' || def.rocket ? 0.7 : 0.25, 0.5, def.auto ? 60 : 120);
  }

  addShake(v) { this.shake = Math.min(1.5, this.shake + v); }

  updateCamera(dt) {
    const c = this.c, cam = this.camera, s = this.game.settings;
    const hs = Math.hypot(c.vel.x, c.vel.z);
    if (c.onGround && c.slideT <= 0) this.bobT += hs * dt * 1.55;
    const bobAmt = Math.min(1, hs / 6) * (1 - 0.85 * c.adsT);
    this.landDip = Math.max(0, this.landDip - dt * 4);
    c.eyePos(cam.position);
    if (c.stepOff) cam.position.y += c.stepOff; // stairs: ease the eye over each step
    if (this.correction) { cam.position.add(this.correction); this.correction.multiplyScalar(Math.max(0, 1 - dt * 12)); }
    cam.position.y += Math.abs(Math.cos(this.bobT)) * 0.03 * bobAmt - Math.sin(this.landDip * Math.PI) * 0.07;
    this.shake = Math.max(0, this.shake - dt * 4);
    const sh = this.shake * this.shake * 0.018 * (1 - 0.8 * c.adsT);   // aimed: the view barely jitters, so the reticle stays on the target
    const slideRoll = c.slideT > 0 ? 0.06 : 0;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(c.pitch + (Math.random() - 0.5) * sh, c.yaw + (Math.random() - 0.5) * sh, Math.sin(this.bobT * 0.5) * 0.005 * bobAmt + slideRoll);
    this.tacK = lerp(this.tacK || 0, c.tacSprinting ? 1 : 0, Math.min(1, dt * 8));
    // sprint widens the view a little, eased in and out over about half a second (never a snap)
    const sprintGoal = c.sprinting ? 1 : 0;
    this.sprintK = (this.sprintK || 0) + (sprintGoal - (this.sprintK || 0)) * Math.min(1, dt * (sprintGoal ? 3.2 : 4.5));
    const sk = this.sprintK * this.sprintK * (3 - 2 * this.sprintK);
    const fov = lerp(vfov(s.fov), this.adsFov(c.weapon.def), c.adsT) * (1 + sk * (0.035 + 0.025 * this.tacK));
    if (Math.abs(fov - this.lastFov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.lastFov = fov;
    }
    // the sight fills more of the screen when aiming (viewmodel FOV narrows, like MW)
    const vmc = this.game.vmCamera;
    // hip: the player's weapon FOV (wider = smaller gun); aimed: the sight-size setting as before
    const vmHip = this.game.input.isTouch ? 76 : clamp(Number(s.vmFov) || 74, 55, 90);
    const a = c.adsT, ae = a * a * (3 - 2 * a);
    const vf = lerp(vmHip, (this.game.input.isTouch ? 68 : 60) * (SIGHT_SIZE[s.sightSize] ?? SIGHT_SIZE.large), ae);
    if (Math.abs(vf - this.lastVmFov) > 0.01) { vmc.fov = vf; vmc.updateProjectionMatrix(); this.lastVmFov = vf; }
  }

  // aim-down-sights field of view after the player's zoom preference (scales each optic's magnification)
  adsFov(def) {
    const s = this.game.settings, base = vfov(s.fov);
    const mag = base / def.adsFov;
    const z = clamp(Number(s.adsZoom) || 1, 0.5, 1.6);
    return base / Math.max(1, 1 + (mag - 1) * z);
  }

  updateViewmodel(dt, mdx, mdy) {
    const c = this.c;
    this.guns.forEach((g, i) => { g.holder.visible = i === c.cur; g.gun.group.visible = !c.infected; });   // infected: hands only
    const G = this.guns[c.cur];
    const h = G.holder, gun = G.gun;
    const w = c.weapon;
    const scoped = !!w.def.scope && c.adsT > 0.85;
    this.vmRoot.visible = !scoped;
    // prism scope: the housing closes in round the eyepiece as the sight comes up to the eye
    if (G.shroud === undefined) G.shroud = gun.group.getObjectByName('acogShroud') || null;
    if (G.shroud) {
      const k = clamp((c.adsT - 0.55) / 0.35, 0, 1), o = k * k * (3 - 2 * k);
      G.shroud.visible = o > 0.01;
      G.shroud.material.opacity = o;
    }
    if (G.ocular === undefined) G.ocular = gun.group.getObjectByName('acogOcular') || null;
    if (G.ocular) {
      const k = clamp((c.adsT - 0.35) / 0.4, 0, 1), o = 1 - k * k * (3 - 2 * k);
      G.ocular.visible = o > 0.01;
      G.ocular.material.opacity = o;
      G.ocular.material.depthWrite = o > 0.99;
    }

    this.sprintT = clamp(this.sprintT + (c.sprinting ? dt : -dt) * 6, 0, 1);
    const spr = sm5(this.sprintT);   // eased, so going in and out of a sprint never snaps
    this.slideK = lerp(this.slideK || 0, c.slideT > 0 ? 1 : 0, Math.min(1, dt * 10));
    // spring on the gun: reload beats (mag out, mag seated, slap) and landings give it a little jolt that settles
    const J = this.jolt || (this.jolt = { y: 0, vy: 0, r: 0, vr: 0, z: 0, vz: 0, prevRp: 0, prevRel: false });
    for (const [k, v] of [['y', 'vy'], ['r', 'vr'], ['z', 'vz']]) { J[v] += (-260 * J[k] - 22 * J[v]) * dt; J[k] += J[v] * dt; }
    this.kick *= Math.exp(-dt * 18);
    this.kickRot *= Math.exp(-dt * 11);
    this.swayX = lerp(this.swayX, clamp(-mdx * 0.0006, -0.035, 0.035), Math.min(1, dt * 9));
    this.swayY = lerp(this.swayY, clamp(mdy * 0.0006, -0.035, 0.035), Math.min(1, dt * 9));
    const hs = Math.hypot(c.vel.x, c.vel.z);
    const a = c.adsT;
    const ae = a * a * (3 - 2 * a);
    const bobAmt = Math.min(1, hs / 6) * (1 - 0.9 * a) * (c.onGround ? 1 : 0.2) * (c.slideT > 0 ? 0 : 1);
    const rp = w.reloadProgress;
    const sw = c.switchT > 0 ? sm5(c.switchT / 0.4) : 0;
    const gren0 = c.grenadeCd > 0 ? Math.sin(clamp(c.grenadeCd / (c.throwDur || 0.9), 0, 1) * Math.PI) : 0;   // (a knife's throw is quicker: the swing used to start halfway, a jump)
    this.cookBlend = lerp(this.cookBlend, this.cookT !== null ? 1 : 0, Math.min(1, dt * 12));
    const gren = Math.max(gren0, this.cookBlend * 0.75);
    // inspect: turn the gun to show its left side, then roll it over to the ejection side and check the mag
    const ip = this.inspectT > 0 ? clamp(1 - this.inspectT / (INSPECT - 0.25), 0, 1) : 0;
    const s1 = this.inspectT > 0 ? smooth(0.04, 0.25, ip) * (1 - smooth(0.42, 0.56, ip)) : 0;
    const s2 = this.inspectT > 0 ? smooth(0.42, 0.56, ip) * (1 - smooth(0.82, 0.98, ip)) : 0;
    // melee (CoD style rifle butt / pistol whip): a quick wind-up back and right, the strike forward and left
    // with the gun turned so the stock / grip leads, a short hold on impact, then an eased recovery to the hip
    const mp = c.meleeT > 0 ? clamp(1 - c.meleeT / MELEE.time, 0, 1) : 1;
    const mWind = c.meleeT > 0 ? smooth(0, 0.2, mp) * (1 - smooth(0.2, 0.34, mp)) : 0;
    const mHit = c.meleeT > 0 ? smooth(0.2, 0.34, mp) * (1 - sm5((mp - 0.5) / 0.5)) : 0;
    const mk = G.type === 'pistol' ? 0.7 : 1;
    if (c.meleeT > 0 && mp >= 0.3 && !this.meleeHitFx) { this.meleeHitFx = true; this.addShake(0.35); J.vy -= 0.1; J.vr += 0.8; }
    if (c.meleeT <= 0) this.meleeHitFx = false;
    const mel = 0;
    const idle = Math.sin(this.breathT * 1.6) * 0.002 * (1 - a);
    const RP_ = RELOAD_POSES[G.type] || RELOAD_POSES.long;
    const tilt = w.reloading ? sm5(rp / 0.22) * (1 - sm5((rp - 0.8) / 0.2)) : 0;
    const slide = this.slideK;
    if (w.reloading && G.magHold && G.type === 'launcher') {
      const hit = (t) => J.prevRp < t && rp >= t;
      if (hit(0.3)) { J.vy -= 0.08; J.vr += 0.4; }                     // weight shifts as the hand drops to the pack
      if (hit(0.8)) { J.vz += 0.32; J.vy += 0.16; J.vr -= 1.3; }        // rocket rammed home
    } else if (w.reloading && G.magHold) {
      const hit = (t) => J.prevRp < t && rp >= t;
      const e = !!w.emptyReload && G.type !== 'shotgun' && G.type !== 'sniper';
      if (hit(e ? 0.12 : 0.16)) { J.vy -= 0.18; J.vr += 0.9; }          // mag pulled free
      if (hit(e ? 0.58 : 0.68)) { J.vy += 0.28; J.vr -= 1.4; }          // fresh mag seated
      if (hit(e ? 0.64 : 0.76)) { J.vy += 0.22; J.vz -= 0.12; J.vr -= 1.0; } // palm slap
      if (e && hit(0.84)) { J.vz += 0.28; J.vr += 1.2; J.vy -= 0.08; }  // charging handle / slide released
    }
    J.prevRp = w.reloading ? rp : 0;
    const bx = Math.sin(this.bobT) * 0.01 * bobAmt, by = -Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;

    h.position.set(
      // reload: the gun comes up and in, canted so you see the hands work the magazine (CoD style)
      lerp(G.hip.x, G.ads.x, ae) + bx + this.swayX * (1 - ae * 0.92) + tilt * RP_.x - spr * 0.06 - mel * 0.08 + slide * -0.04,
      lerp(G.hip.y, G.ads.y, ae) + by + this.swayY * (1 - ae * 0.92) + idle + tilt * RP_.y - sw * (G.type === 'pistol' ? 0.16 : 0.2) - gren * 0.22 - spr * 0.02 - this.landDip * 0.025 + slide * -0.02 + J.y,
      lerp(G.hip.z, G.ads.z, ae) + this.kick * (a > 0.5 ? 0.018 : 0.035) * (G.type === 'launcher' ? 2.8 : 1) + tilt * RP_.z - mel * 0.12 + J.z,
    );
    h.rotation.set(
      this.kickRot * (a > 0.5 ? 0.025 : 0.07) * (G.type === 'launcher' ? 2.4 : 1) + tilt * RP_.rx - spr * 0.25 + this.swayY * 0.8 * (1 - ae * 0.9) + mel * 0.2 + J.r,
      spr * 0.55 + tilt * RP_.ry + this.swayX * 1.6 * (1 - ae * 0.9) + mel * 0.3 + (1 - a) * (G.type === 'pistol' ? 0.035 : VM_TUNE.yawBy[G.type] ?? VM_TUNE.yaw),
      tilt * RP_.rz + spr * 0.55 - mel * 0.7 + slide * 0.25 + this.swayX * 0.6 * (1 - ae * 0.9),
    );
    // weapon raise after a switch: comes up from low right, muzzle down and rolled, and settles into the hip pose
    if (mWind + mHit > 0) {
      h.position.x += (0.03 * mWind - 0.08 * mHit) * mk;
      h.position.y += (-0.015 * mWind + 0.01 * mHit) * mk;
      h.position.z += (0.02 * mWind - 0.15 * mHit) * mk;
      h.rotation.x += (-0.08 * mWind + 0.15 * mHit) * mk;
      h.rotation.y += (-0.15 * mWind + 0.3 * mHit) * mk;
      h.rotation.z += (0.2 * mWind - 0.75 * mHit) * mk;
    }
    if (sw > 0) {
      const pis = G.type === 'pistol';
      h.position.x += sw * 0.04;
      h.rotation.x -= sw * (pis ? 0.95 : 0.7);
      h.rotation.y += sw * (pis ? 0.25 : 0.3);
      h.rotation.z += sw * (pis ? 0.55 : 0.4);
    }
    // mantling: the gun dips and rolls away while the free hand pulls you up
    if (c.mantle) { const k = Math.sin(c.mantle.t * Math.PI); h.position.y -= 0.1 * k; h.position.x += 0.03 * k; h.rotation.x -= 0.4 * k; h.rotation.z -= 0.3 * k; }
    if (this.prevMantle && !c.mantle) { J.vy -= 0.2; J.vr += 0.8; }
    this.prevMantle = !!c.mantle;
    if (this.prevSw > 0.02 && sw <= 0.02) { J.vy += 0.12; J.vr -= 0.7; }  // settle as it arrives
    this.prevSw = sw;
    // per-gun hip pose (the pistol is held up and turned in, both hands on it, like CoD)
    if (G.hipRot) { const k = 1 - ae; h.rotation.x += G.hipRot[0] * k; h.rotation.y += G.hipRot[1] * k; h.rotation.z += G.hipRot[2] * k; }
    // tactical sprint: gun swung up beside the face, muzzle high (MW style)
    const tk = this.tacK || 0;
    if (tk > 0.01) {
      const T = TAC_POSE[G.type] || TAC_POSE.long, k = sm5(tk);
      h.position.lerp(_tacP.set(T.p[0] + bx * 0.8, T.p[1] + by * 0.9, T.p[2]), k);
      h.quaternion.slerp(_tacQ.setFromEuler(_tacE.set(T.r[0] + by * 1.5, T.r[1], T.r[2] + bx * 3)), k);
    }
    if (s1 + s2 > 0) {
      const w2 = Math.sin(ip * Math.PI * 3) * 0.04; // a little life in the hands
      h.position.x += -0.05 * s1 - 0.035 * s2;
      h.position.y += 0.02 * s1 + 0.03 * s2;
      h.position.z += -0.04 * (s1 + s2);
      h.rotation.x += 0.1 * s1 + 0.28 * s2 + w2;
      h.rotation.y += 0.75 * s1 - 0.3 * s2;
      h.rotation.z += 0.4 * s1 - 0.85 * s2 + w2;
    }

    // magazine + hand choreography during reload: the left hand grips the mag, pulls it, takes it down
    // out of view, comes back with a fresh one, seats it, slaps it home and returns to the foregrip.
    // The mag stays in the hand the whole time.
    const mag = gun.mag;
    mag.position.copy(gun.magHome);
    mag.visible = !((G.type === 'launcher' || w.def.sling) && w.mag === 0);   // the warhead (the slingshot's knife) leaves with the shot
    // bolt / pump cycling after a shot
    if (this.cycleT > 0) {
      this.cycleT -= dt;
      const total = 60 / w.def.rpm * 0.9;
      const p = 1 - this.cycleT / total;
      if (gun.bolt) {
        gun.bolt.rotation.z = -bump(0.1, 0.9, p) * 1.1;
        gun.bolt.position.z = gun.boltHome + bump(0.25, 0.75, p) * 0.08;
      }
      if (gun.pump) gun.pump.position.z = gun.pumpHome + bump(0.1, 0.8, p) * 0.09;
    } else {
      if (gun.bolt) { gun.bolt.rotation.z = 0; gun.bolt.position.z = gun.boltHome; }
      if (gun.pump) gun.pump.position.z = gun.pumpHome;
    }

    // muzzle flash
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0 && !w.def.quiet;
    h.updateMatrixWorld(true);
    if (this.flash.visible) {
      gun.muzzle.getWorldPosition(this.flash.position);
      this.flash.rotation.z = Math.random() * Math.PI;
      const sc = 0.7 + Math.random() * 0.7;
      this.flash.scale.set(sc, sc, sc);
      this.vmFlashLight.position.copy(this.flash.position);
      this.vmFlashLight.intensity = 3;
    } else this.vmFlashLight.intensity = 0;

    // ---------- hands + arms (camera space) ----------
    const type = G.type, A = gun.att || {};
    gun.group.getWorldQuaternion(_gq);
    // right hand on the pistol grip, trigger finger in the guard
    const FIT = G.fit;
    handFrame(_R, _rq, gun.group, _gq, _v1.copy(type === 'pistol' ? RH_PISTOL : (gun.rh || RH_LONG)).add(FIT.R.push), GRIP_F, PALM_L);
    // left hand where it rests on the gun: support hand on a pistol, vertical grip, or palm up under the handguard / pump
    let lPose;
    if (w.def.sling) handFrame(_L, _lq, gun.group, _gq, _v1.copy(gun.foregrip.position), VG_F, PALM_R);   // slingshot: pinching the pouch, drawn back
    else if (type === 'pistol') handFrame(_L, _lq, gun.group, _gq, _v1.copy(LH_PISTOL).add(FIT.L.push), LH_PISTOL_F, LH_PISTOL_P);
    else if (A.under === 'vgrip') handFrame(_L, _lq, gun.group, _gq, _v1.copy(gun.foregrip.position).add(VG_OFF).add(FIT.L.push), VG_F, PALM_R);
    else handFrame(_L, _lq, gun.group, _gq, _v1.copy(gun.pump ? gun.pump.position : gun.foregrip.position).add(gun.pump ? SUP_OFF_PUMP : SUP_OFF).add(FIT.L.push), SUP_F, PALM_SUP);
    lPose = w.def.sling ? POSES.fist : FIT.L.pose;
    let tPose = lPose, lk = 0, leftFree = false;
    const toward = (pos, q, pose, k) => { _L.lerp(pos, k); _lq.slerp(q, k); tPose = pose; lk = k; };
    const MH = G.magHold;
    if (s2 > 0.05 && MH) {
      // inspect: left hand drops to the magazine
      handFrame(_tp, _tq, gun.group, _gq, MH.pos, MH.f, MH.p);
      toward(_tp, _tq, MH.pose, smooth(0.3, 0.9, s2));
    }
    if (w.reloading && MH && type === 'launcher') {
      // The Monte: the hand drops to the pack, brings a rocket up in front of the muzzle, lines it up with
      // the tube and slides it home, then goes back to the front grip
      handFrame(_m0, _mq, gun.group, _gq, MH.pos, MH.f, MH.p);                                  // on the seated rocket
      handFrame(_m1, _tq, gun.group, _gq, _a.copy(MH.pos).add(_cz.set(0, 0.004, -0.22)), MH.f, MH.p); // lined up ahead of the muzzle
      _gl.copy(_L); _lq2.copy(_lq);
      _pp.copy(_gl).add(_a.set(-0.12, -0.38, 0.12));
      const KP = this.rktKeys || (this.rktKeys = Array.from({ length: 5 }, () => new THREE.Vector3()));
      KP[0].copy(_gl); KP[1].copy(_pp); KP[2].copy(_m1); KP[3].copy(_m0); KP[4].copy(_gl);
      spline(KP, [0, 0.3, 0.6, 0.8, 0.95], 5, rp, _L);
      const k = sm5(rp / 0.15) * (1 - sm5((rp - 0.8) / 0.15));
      _lq.copy(_lq2).slerp(_mq, k);
      tPose = MH.pose; lk = k;
      if (rp < 0.27) mag.visible = false;
      else if (rp < 0.8) { mag.visible = true; gun.group.worldToLocal(_a.copy(_L)); mag.position.copy(gun.magHome).add(_a.sub(MH.pos)); }
      else mag.visible = true;
      leftFree = rp > 0.08 && rp < 0.9;
    } else if (w.reloading && MH) {
      // magazine change: grab the mag, pull it, take it down out of view, bring a fresh one up, seat it,
      // slap it home, back to the gun. The mag rides in the hand the whole time.
      handFrame(_m0, _mq, gun.group, _gq, MH.pos, MH.f, MH.p);                 // M0: holding the seated mag
      _m1.copy(_m0).add(_a.set(0.01, -0.11, 0.04));                           // M1: pulled clear
      _pp.copy(_m0).add(_a.set(-0.07, -0.32, 0.08));                          // P: down to the pouch
      // one continuous, time-parametrised spline through the beats (no stop-start between them):
      // grip -> mag -> pulled -> down to the pouch -> back up -> seated -> slap -> grip. From empty there's
      // one more beat: the hand goes to the charging handle (or over the slide), racks it and returns.
      _gl.copy(_L); _lq2.copy(_lq);                                            // the resting grip
      const empty = !!w.emptyReload && type !== 'shotgun' && type !== 'sniper';
      const KP = this.reloadKeys || (this.reloadKeys = Array.from({ length: 10 }, () => new THREE.Vector3()));
      KP[0].copy(_gl); KP[1].copy(_m0); KP[2].copy(_m1); KP[3].copy(_pp);
      KP[4].copy(_m1).add(_a.set(-0.015, -0.02, 0.01)); KP[5].copy(_m0); KP[6].copy(_m0).add(_a.set(0, 0.022, 0));
      let KT, n;
      if (empty) {
        // the charge point: AR / SMG charging handle at the back of the upper, the pistol's slide serrations
        // pistol: grab the front serrations over the top and rack the slide back; rifle / SMG: palm-slap the
        // bolt catch on the left of the receiver (keeps the arm low, out of your face)
        const pis = type === 'pistol';
        handFrame(_ch, _cq, gun.group, _gq, pis ? _a.set(-0.008, 0.07, -0.085) : _a.set(-0.045, 0.006, -0.055), pis ? CH_F : BC_F, pis ? CH_P : BC_P);
        KP[7].copy(_ch); KP[8].copy(_ch).addScaledVector(_cz.set(pis ? 0 : 1, 0, pis ? 1 : 0).applyQuaternion(_gq), pis ? 0.045 : 0.022); KP[9].copy(_gl);
        KT = [0, 0.08, 0.18, 0.33, 0.47, 0.58, 0.64, 0.76, 0.83, 0.95]; n = 10;
      } else { KP[7].copy(_gl); KT = [0, 0.1, 0.22, 0.4, 0.56, 0.68, 0.76, 0.9]; n = 8; }
      if (rp >= KT[n - 1]) _L.copy(KP[n - 1]);
      else {
        let i = 0; while (i < n - 2 && rp >= KT[i + 1]) i++;
        const t0 = KT[i], t1 = KT[i + 1], d = t1 - t0, u = (rp - t0) / d;
        const tan = (j, out) => (j <= 0 || j >= n - 1 || (empty && j === 8)) ? out.set(0, 0, 0) : out.subVectors(KP[j + 1], KP[j - 1]).divideScalar(KT[j + 1] - KT[j - 1]);
        const u2 = u * u, u3 = u2 * u;
        tan(i, _v1); tan(i + 1, _tp);
        _L.copy(KP[i]).multiplyScalar(2 * u3 - 3 * u2 + 1)
          .addScaledVector(_v1, (u3 - 2 * u2 + u) * d)
          .addScaledVector(KP[i + 1], -2 * u3 + 3 * u2)
          .addScaledVector(_tp, (u3 - u2) * d);
      }
      // the hand turns from its grip to the mag hold (and on to the charging handle) and back, eased with no jolt
      let k;
      if (empty) {
        k = sm5(rp / 0.08) * (1 - sm5((rp - 0.84) / 0.11));
        if (rp < 0.66) _lq.copy(_lq2).slerp(_mq, sm5(rp / 0.08));
        else if (rp < 0.84) _lq.copy(_mq).slerp(_cq, sm5((rp - 0.66) / 0.1));
        else _lq.copy(_cq).slerp(_lq2, sm5((rp - 0.84) / 0.11));
      } else {
        k = sm5(rp / 0.1) * (1 - sm5((rp - 0.78) / 0.12));
        _lq.copy(_lq2).slerp(_mq, k);
      }
      const attach = rp > KT[1] && rp < KT[5];
      tPose = MH.pose; lk = k;
      if (attach) {
        gun.group.worldToLocal(_a.copy(_L));
        mag.position.copy(gun.magHome).add(_a.sub(MH.pos));
      }
      leftFree = rp > 0.12 && rp < 0.84;
    } else if (w.reloading) {
      // shotgun: shells from the belt into the loading port, one at a time
      const k = smooth(-0.4, 0.4, Math.sin(rp * Math.PI * 10)) * smooth(0, 0.08, rp) * (1 - smooth(0.9, 1, rp));
      handFrame(_tp, _tq, gun.group, _gq, _v1.copy(gun.eject.position).add(PORT_OFF), PORT_F, PALM_L);
      _m1.copy(_tp).add(_a.set(-0.08, -0.38, 0.08));
      _tp.lerp(_m1, 1 - k);
      toward(_tp, _tq, POSES.cup, smooth(0, 0.08, rp) * (1 - smooth(0.9, 1, rp)));
      leftFree = true;
    }
    // tactical sprint: the left hand lets go and pumps below the frame like a running arm
    const tkL = this.tacK || 0;
    if (tkL > 0.35 && !w.reloading) {
      const swg = Math.sin(this.bobT), k = smooth(0.35, 0.8, tkL);
      handFrame(_tp, _tq, null, null, _a.set(-0.2, -0.62 + 0.05 * Math.abs(swg), -0.2 + 0.1 * swg), SPRINT_F, SPRINT_P);
      toward(_tp, _tq, POSES.fist, k);
      leftFree = k > 0.3;
    }
    if (c.grenadeCd > (c.throwDur || 0.9) * 0.45) {
      handFrame(_tp, _tq, null, null, _a.set(-0.1, -0.05 - gren0 * 0.1, -0.45 + gren0 * 0.1), THROW_F, THROW_P);
      toward(_tp, _tq, POSES.open, 1);
    }
    // holding the lethal button: what you're about to throw sits in the left hand, beside the lowered gun (the
    // frag cooks there; a knife is held by the handle, blade forward). It used to be a frag whatever you carried.
    const kind = EQUIPMENT[c.lethal] ? c.lethal : 'frag';
    if (!this.vmItems) this.vmItems = {};
    if (!this.vmItems[kind]) {
      const m = kind === 'frag' ? new THREE.Mesh(this.game.grenadeGeo, this.game.grenadeMat) : this.game.equipMesh(kind);
      m.scale.setScalar(kind === 'frag' ? 0.55 : kind === 'knife' ? 0.9 : 0.6);
      m.traverse(o => { if (o.isMesh) o.castShadow = false; });
      this.vmRoot.add(m);
      this.vmItems[kind] = m;
    }
    for (const k in this.vmItems) this.vmItems[k].visible = k === kind && this.cookBlend > 0.3;
    const item = this.vmItems[kind];
    if (item.visible) {
      const shake = this.cookT !== null && EQUIPMENT[kind].cook && this.cookT > EQUIPMENT[kind].fuse - 1.2 ? (Math.random() - 0.5) * 0.006 : 0;
      handFrame(_tp, _tq, null, null, _a.set(-0.17 + shake, -0.17 - (1 - this.cookBlend) * 0.2, -0.36), COOK_F, PALM_UP);
      toward(_tp, _tq, kind === 'knife' ? POSES.fist : POSES.cup, smooth(0.3, 0.8, this.cookBlend));
      if (kind === 'knife') { item.position.copy(_tp).add(_a.set(0.005, 0.055, -0.02)); item.rotation.set(1.15, 0.2, 0.1); }   // handle in the fist, blade standing up out of it
      else { item.position.copy(_tp).add(_a.set(0, 0.045, -0.012)); item.rotation.set(0.4, 0.3, 0); }
    }
    blendPose(this.lPose, lPose, tPose, lk);
    poseArm(this.arms.R, SHOULDER_R, _R, _rq, FIT.R.pose, POLE_R);
    poseArm(this.arms.L, SHOULDER_L, _L, _lq, this.lPose, leftFree ? _a.set(-0.4, -1, 0.1) : POLE_L);
  }

  // Round modes: over-the-shoulder view of a living teammate. Returns false when there's nobody to watch.
  specCam(dt, next) {
    const c = this.c, g = this.game, cam = this.camera;
    if (g.time - c.deathT < 2.5) return false;
    const mates = g.characters.filter(m => m !== c && !g.foes(m, c) && m.alive && !m.hidden);
    if (!mates.length) { this.specTarget = null; return false; }
    if (!mates.includes(this.specTarget) || next) {
      const i = mates.indexOf(this.specTarget);
      this.specTarget = mates[(i + 1) % mates.length];
      this.specSnap = true;
      if (next) g.audio.play('ui', null, { ui: true });
    }
    const m = this.specTarget;
    const eye = m.eyePos(_a), fwd = m.forward(_b);
    const right = _c.set(-fwd.z, 0, fwd.x).normalize();
    _E.copy(eye).addScaledVector(fwd, -2.2).addScaledVector(right, 0.55);
    _E.y += 0.35;
    // pull in if a wall is in the way
    const hit = g.physics.raycast(eye, _D.subVectors(_E, eye).normalize(), eye.distanceTo(_E));
    if (hit) _E.copy(eye).addScaledVector(_D, Math.max(0.3, hit.t - 0.25));
    if (this.specSnap) { cam.position.copy(_E); this.specSnap = false; }
    else cam.position.lerp(_E, Math.min(1, dt * 12));
    cam.lookAt(_D.copy(eye).addScaledVector(fwd, 12));
    const base = vfov(g.settings.fov);
    if (Math.abs(cam.fov - base) > 0.01) { cam.fov = base; cam.updateProjectionMatrix(); this.lastFov = base; }
    return true;
  }

  // Death: drop back from where you were standing, swing round to the killer and zoom in on them
  deathCam(dt) {
    const c = this.c, cam = this.camera, g = this.game;
    const t = g.time - c.deathT;
    if (this.dcDeathT !== c.deathT) {
      this.dcDeathT = c.deathT;
      this.dcCheck = -9; this.dcPos = null;
      this.dcFrom = (this.dcFrom || new THREE.Vector3()).copy(cam.position);
      this.dcQ = (this.dcQ || new THREE.Quaternion()).copy(cam.quaternion);
      this.dcLook = (this.dcLook || new THREE.Vector3()).copy(c.pos).add(_a.set(0, 1, 0));
    }
    const k = c.killer && c.killer !== c && !c.killer.hidden ? c.killer : null;
    if (k) {
      // track the killer's chest (keeps following them as they move on)
      k.chestPos(_b);
      this.dcLook.lerp(_b, Math.min(1, dt * (t < 0.8 ? 4 : 8)));
    }
    // camera: from the death spot, backed away from the killer; climbs higher if cover blocks the view
    if (k && (!this.dcPos || g.time - (this.dcCheck || 0) > 0.5)) {
      this.dcCheck = g.time;
      _c.subVectors(c.pos, k.pos).setY(0);
      if (_c.lengthSq() < 0.01) _c.set(1, 0, 0);
      _c.normalize();
      this.dcPos = this.dcPos || new THREE.Vector3();
      for (const [up, back] of [[1.05, 0.45], [1.9, 1.2], [3, 2.2], [4.5, 3.5]]) {
        this.dcPos.set(c.pos.x, c.pos.y + up, c.pos.z).addScaledVector(_c, back);
        if (!g.physics.blocked(this.dcPos, k.chestPos(_E)) && !g.physics.overlap(this.dcPos.x, this.dcPos.y - 0.1, this.dcPos.z, 0.15, 0.2)) break;
      }
    }
    if (k && this.dcPos) {
      this.dcCur = this.dcCur && this.dcCurT === c.deathT ? this.dcCur.lerp(this.dcPos, Math.min(1, dt * 5)) : (this.dcCur || new THREE.Vector3()).copy(this.dcPos);
      this.dcCurT = c.deathT;
      _a.copy(this.dcCur);
    }
    else _a.set(c.pos.x, c.pos.y + 1.05, c.pos.z);
    const mv = smooth(0, 0.7, t);
    cam.position.lerpVectors(this.dcFrom, _a, mv);
    // aim: blend from the last view to looking at the killer
    _qd.copy(cam.quaternion);
    cam.lookAt(this.dcLook);
    _qe.copy(cam.quaternion);
    cam.quaternion.copy(this.dcQ).slerp(_qe, smooth(0.1, 0.8, t));
    // zoom: frame the killer at ~40% of the screen height
    const base = vfov(g.settings.fov);
    let fov = base;
    if (k) {
      const dist = Math.max(1, cam.position.distanceTo(this.dcLook));
      const want = clamp(2 * Math.atan(1.25 / dist) * 180 / Math.PI / 0.4, 7, base);
      fov = lerp(base, want, smooth(0.7, 1.6, t));
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); this.lastFov = fov; }
  }

}
