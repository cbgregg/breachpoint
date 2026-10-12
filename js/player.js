// Local player: input -> movement/weapons, first-person camera, viewmodel (IK arms, reloads, recoil),
// gamepad look with response curve + aim assist.
import * as THREE from 'three';
import { TEAMS, MELEE, GRENADE, PLAYER } from './config.js';
import { buildGun } from './weapons.js';
import { createVmArms, poseArm, handFrame, POSES, blendPose, clonePose } from './vmarms.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (a, b, x) => smooth(a, a + (b - a) * 0.3, x) * (1 - smooth(b - (b - a) * 0.3, b, x));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _wish = new THREE.Vector3();
const _E = new THREE.Vector3(), _R = new THREE.Vector3(), _L = new THREE.Vector3(), _D = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

const SHOULDER_R = new THREE.Vector3(0.32, -0.5, 0.2), SHOULDER_L = new THREE.Vector3(-0.32, -0.38, 0.05);
const POLE_R = new THREE.Vector3(0.7, -1.4, 0.2), POLE_L = new THREE.Vector3(-1, -0.65, 0.05);
// where the hands go, in the gun's frame (origin = top of the pistol grip, barrel toward -z)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const RH_LONG = V3(0.031, -0.052, 0.018), RH_PISTOL = V3(0.031, -0.045, 0.012);
const GRIP_F = V3(0, -0.25, -0.97), PALM_L = V3(-1, 0, 0), PALM_R = V3(1, 0, 0), PALM_UP = V3(0, 1, 0);
const LH_PISTOL = V3(-0.033, -0.06, 0.004);
const VG_OFF = V3(-0.03, -0.015, 0.036), VG_F = V3(0, -0.12, -1);
const SUP_OFF = V3(-0.022, -0.012, 0.01), SUP_F = V3(0.45, -0.1, -0.9), PALM_SUP = V3(0.6, 0.8, 0);
const PORT_OFF = V3(0.034, -0.015, 0.01), PORT_F = V3(0, -0.2, -1);
const SPRINT_F = V3(0.15, -0.55, -0.8), SPRINT_P = V3(1, 0.2, 0);
const THROW_F = V3(0.1, 1, -0.3), THROW_P = V3(0.2, 0, -1);
const COOK_F = V3(0.25, 0.1, -1);
const _gq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _mq = new THREE.Quaternion(), _tp = new THREE.Vector3(), _v1 = new THREE.Vector3();
const _ld = new THREE.Vector3(), _gl = new THREE.Vector3(), _m0 = new THREE.Vector3(), _m1 = new THREE.Vector3(), _pp = new THREE.Vector3(), _fg = new THREE.Vector3();
const MAG_BOTTOM = { rifle: -0.21, smg: -0.17, pistol: -0.11, sniper: -0.09 };
const _lq = new THREE.Quaternion(), _lq2 = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qe = new THREE.Quaternion();
const EYE_RELIEF = -0.15;
const INSPECT = 3.0; // seconds
const SIGHT_SIZE = { normal: 1, large: 0.8, huge: 0.64 }; // viewmodel FOV multiplier at full ADS // close to the eye, like CoD: the optic frames the target
// The FOV setting works like Call of Duty's: degrees across a 4:3 frame (80 = MW default). three.js
// wants the vertical angle, which is what makes players and the gun look the right size.
export const vfov = (h) => 2 * Math.atan(Math.tan((h * Math.PI) / 360) * 0.75) * 180 / Math.PI;

function solveElbow(S, H, a, b, pole, out) {
  const d = _c.subVectors(H, S);
  const len = clamp(d.length(), 0.05, a + b - 0.002);
  d.normalize();
  const cosA = clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
  const along = a * cosA, h = Math.sqrt(Math.max(0, a * a - along * along));
  const pd = _b.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  return out.copy(S).addScaledVector(d, along).addScaledVector(pd, h);
}

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
    this.crouchToggle = false; this.padSprint = false;
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
      const pistol = w.id === 'pistol';
      const touch = this.game.input.isTouch;
      // where the left hand holds the magazine (gun frame): pistols palm it from below, the rest wrap it
      const type = w.def.model.type;
      let magHold = null;
      if (type !== 'shotgun') {
        holder.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gun.mag).applyMatrix4(gun.group.matrixWorld.clone().invert());
        magHold = type === 'pistol'
          ? { pos: V3((box.min.x + box.max.x) / 2 - 0.004, box.min.y - 0.016, (box.min.z + box.max.z) / 2 + 0.006), f: V3(0.55, 0, -0.85), p: PALM_UP, pose: POSES.cup }
          : { pos: V3(box.min.x - 0.016, box.max.y + (box.min.y - box.max.y) * 0.6, Math.max(box.min.z + 0.046, (box.min.z + box.max.z) / 2)), f: V3(0, -0.1, -1), p: PALM_R, pose: POSES.wrap };
      }
      return {
        id: w.id, holder, gun, type, magHold,
        // phones: gun sits a little lower so it doesn't fill the small screen (the viewmodel FOV is wider too)
        hip: touch ? (pistol ? new THREE.Vector3(0.11, -0.13, -0.3) : new THREE.Vector3(0.12, -0.155, -0.18))
          : pistol ? new THREE.Vector3(0.1, -0.12, -0.3) : new THREE.Vector3(0.11, -0.145, -0.21),
        ads: new THREE.Vector3(0, -gun.sightY, (gun.eyeRelief ?? EYE_RELIEF) - gun.sightZ),
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
    const sens = 0.0022 * s.sensitivity * zoom;
    const inv = s.invertY ? -1 : 1;
    c.yaw -= inp.mouseDX * sens;
    c.pitch -= inp.mouseDY * sens * inv;
    if (inp.lookX || inp.lookY) {
      let rate = 3.6 * s.padSensitivity * Math.pow(zoom, 0.8);
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
    const sprintWant = canAct && (shift || this.padSprint || inp.touchSprint) && f > 0.4 && !inp.ads && !inp.fire && !autoOn;
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
    else if (crouchPress) this.crouchToggle = !this.crouchToggle;
    if (sprint && !c.sprinting) this.crouchToggle = false;
    c.wantCrouch = this.crouchToggle || inp.down('ControlLeft');
    const jump = canAct && (inp.down('Space') || inp.action('jump'));
    if (jump) this.crouchToggle = false;
    c.updateMovement(dt, _wish, sprint, jump, slideReq && canAct, tac);
    // the exact command that produced this frame's movement (sent to the host when playing online)
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));
    this.cmd = { dt, mx: canAct ? clamp1(r) : 0, my: canAct ? clamp1(f) : 0, y: c.yaw, p: c.pitch, sp: sprint ? 1 : 0, tac: tac ? 1 : 0, cr: c.wantCrouch ? 1 : 0, j: jump ? 1 : 0, sl: slideReq && canAct ? 1 : 0, f: 0, ads: 0, a: null };
    if (!this.wasGround && c.onGround) this.landDip = 1;
    this.wasGround = c.onGround;

    // ---- weapons ----
    if (canAct) {
      if (inp.action('slot1')) c.switchTo(0);
      if (inp.action('slot2')) c.switchTo(1);
      if (inp.action('swap') || inp.wheel !== 0) c.switchTo(c.prev);
      // in a plant / defuse zone the reload button is the use button
      if (inp.action('reload') && !(g.gm && (g.gm.authority ? g.gm.useZone(c) : g.gm.guestZone(c)))) { c.reload(); this.padSprint = false; }
      if (inp.action('melee')) c.melee();
    }
    // frag: hold to pull the pin and cook, release to throw. Hold past the fuse and it goes off in your hand.
    let thrownCook = null;
    const gHeld = inp.grenadeHeld;
    if (this.cookT === null) {
      if (canAct && gHeld && !this.gLatch && c.canThrow()) {
        this.cookT = 0; this.nextTick = 1; this.inspectT = 0;
        c.weapon.cancelReload();
        g.audio.play('pin', null);
      }
    } else {
      this.cookT += dt;
      if (this.cookT >= this.nextTick && this.cookT < GRENADE.fuse) { g.audio.play('ui', null, { ui: true, freq: 1500 + this.nextTick * 250 }); this.nextTick += this.cookT > GRENADE.fuse - 1.2 ? 0.25 : 1; }
      if ((!gHeld || this.cookT >= GRENADE.fuse) && canAct) {
        thrownCook = this.cookT;
        this.cookT = null;
        this.gLatch = gHeld;
        c.throwGrenade(undefined, thrownCook);
      } else if (!canAct) this.cookT = null;
    }
    if (!gHeld) this.gLatch = false;
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
    if (!s.aimAssist || this.game.input.lastDevice !== 'pad') { A.target = null; return 1; }
    const c = this.c, g = this.game;
    const eye = c.eyePos(_a);
    const fwd = c.forward(_b);
    let best = null, bestAng = 0.16;
    for (const e of g.characters) {
      if (!e.alive || e.hidden || e.team === c.team) continue;
      const dist = e.pos.distanceTo(c.pos);
      if (dist > 70) continue;
      e.chestPos(_c).sub(eye);
      const ang = Math.acos(clamp(_c.normalize().dot(fwd), -1, 1));
      const lim = Math.atan2(1.4, dist) + 0.03;
      if (ang < lim && ang < bestAng && !g.physics.blocked(eye, e.chestPos(_E))) { best = e; bestAng = ang; }
    }
    if (!best) { A.target = null; return 1; }
    best.chestPos(_c).sub(eye);
    const ty = Math.atan2(-_c.x, -_c.z), tp = Math.atan2(_c.y, Math.hypot(_c.x, _c.z));
    if (A.target === best) {
      // rotational assist: follow a share of the target's angular motion
      const strength = 0.4 + 0.25 * c.adsT;
      c.yaw += angDiff(A.yaw, ty) * strength;
      c.pitch += (tp - A.pitch) * strength * 0.6;
    }
    A.target = best; A.yaw = ty; A.pitch = tp;
    const dist = best.pos.distanceTo(c.pos);
    const onTarget = bestAng < Math.atan2(0.5, dist) + 0.01;
    return onTarget ? 0.5 : 0.75;
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
      const k = Math.min(1, dt * 9) * 0.6;
      c.yaw += angDiff(c.yaw, ty) * k;
      c.pitch += (tp - c.pitch) * k;
    }
  }

  updateBreathing(dt) {
    const c = this.c;
    this.breathT += dt;
    const scoped = c.weapon.def.scope;
    const holdBreath = scoped && (this.game.input.down('ShiftLeft') || this.game.input.padHeld('sprint'));
    const amp = c.adsT * (scoped ? (holdBreath ? 0.0006 : 0.0045) : 0.0012);
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
    const rm = (1 - 0.35 * c.adsT) * (c.crouchT > 0.5 ? 0.75 : 1);
    const climb = def.recoilPitch * rm * (0.85 + Math.random() * 0.3);
    c.pitch += climb;
    this.recoilDebt = Math.min(0.25, this.recoilDebt + climb * 0.65);
    c.yaw += (Math.random() - 0.45) * 2 * def.recoilYaw * rm;
    this.shake = Math.min(1, this.shake + def.recoilPitch * 5);
    if (def.id === 'sniper' || def.id === 'shotgun') this.cycleT = 60 / def.rpm * 0.9;
    this.game.input.rumble(def.id === 'sniper' || def.id === 'shotgun' ? 0.7 : 0.25, 0.5, def.auto ? 60 : 120);
  }

  addShake(v) { this.shake = Math.min(1.5, this.shake + v); }

  updateCamera(dt) {
    const c = this.c, cam = this.camera, s = this.game.settings;
    const hs = Math.hypot(c.vel.x, c.vel.z);
    if (c.onGround && c.slideT <= 0) this.bobT += hs * dt * 1.55;
    const bobAmt = Math.min(1, hs / 6) * (1 - 0.85 * c.adsT);
    this.landDip = Math.max(0, this.landDip - dt * 4);
    c.eyePos(cam.position);
    if (this.correction) { cam.position.add(this.correction); this.correction.multiplyScalar(Math.max(0, 1 - dt * 12)); }
    cam.position.y += Math.abs(Math.cos(this.bobT)) * 0.03 * bobAmt - Math.sin(this.landDip * Math.PI) * 0.07;
    this.shake = Math.max(0, this.shake - dt * 4);
    const sh = this.shake * this.shake * 0.018;
    const slideRoll = c.slideT > 0 ? 0.06 : 0;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(c.pitch + (Math.random() - 0.5) * sh, c.yaw + (Math.random() - 0.5) * sh, Math.sin(this.bobT * 0.5) * 0.005 * bobAmt + slideRoll);
    this.tacK = lerp(this.tacK || 0, c.tacSprinting ? 1 : 0, Math.min(1, dt * 8));
    const fov = lerp(vfov(s.fov), this.adsFov(c.weapon.def), c.adsT) * (c.sprinting ? 1.06 + 0.05 * this.tacK : 1);
    if (Math.abs(fov - this.lastFov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.lastFov = fov;
    }
    // the sight fills more of the screen when aiming (viewmodel FOV narrows, like MW)
    const vmc = this.game.vmCamera;
    const vmBase = this.game.input.isTouch ? 72 : 66;
    const a = c.adsT, ae = a * a * (3 - 2 * a);
    const vf = vmBase * lerp(1, SIGHT_SIZE[s.sightSize] ?? SIGHT_SIZE.large, ae);
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
    this.guns.forEach((g, i) => { g.holder.visible = i === c.cur; });
    const G = this.guns[c.cur];
    const h = G.holder, gun = G.gun;
    const w = c.weapon;
    const scoped = !!w.def.scope && c.adsT > 0.85;
    this.vmRoot.visible = !scoped;

    this.sprintT = clamp(this.sprintT + (c.sprinting ? dt : -dt) * 6, 0, 1);
    this.kick *= Math.exp(-dt * 18);
    this.kickRot *= Math.exp(-dt * 11);
    this.swayX = lerp(this.swayX, clamp(-mdx * 0.0006, -0.035, 0.035), Math.min(1, dt * 9));
    this.swayY = lerp(this.swayY, clamp(mdy * 0.0006, -0.035, 0.035), Math.min(1, dt * 9));
    const hs = Math.hypot(c.vel.x, c.vel.z);
    const a = c.adsT;
    const ae = a * a * (3 - 2 * a);
    const bobAmt = Math.min(1, hs / 6) * (1 - 0.9 * a) * (c.onGround ? 1 : 0.2) * (c.slideT > 0 ? 0 : 1);
    const rp = w.reloadProgress;
    const sw = c.switchT > 0 ? c.switchT / 0.4 : 0;
    const gren0 = c.grenadeCd > 0 ? Math.sin(clamp(c.grenadeCd / 0.9, 0, 1) * Math.PI) : 0;
    this.cookBlend = lerp(this.cookBlend, this.cookT !== null ? 1 : 0, Math.min(1, dt * 12));
    const gren = Math.max(gren0, this.cookBlend * 0.75);
    // inspect: turn the gun to show its left side, then roll it over to the ejection side and check the mag
    const ip = this.inspectT > 0 ? clamp(1 - this.inspectT / (INSPECT - 0.25), 0, 1) : 0;
    const s1 = this.inspectT > 0 ? smooth(0.04, 0.25, ip) * (1 - smooth(0.42, 0.56, ip)) : 0;
    const s2 = this.inspectT > 0 ? smooth(0.42, 0.56, ip) * (1 - smooth(0.82, 0.98, ip)) : 0;
    const mel = c.meleeT > 0 ? Math.sin((1 - c.meleeT / MELEE.time) * Math.PI) : 0;
    const idle = Math.sin(this.breathT * 1.6) * 0.002 * (1 - a);
    const tilt = w.reloading ? bump(0.0, 1.0, rp) : 0;
    const slide = c.slideT > 0 ? 1 : 0;
    const bx = Math.sin(this.bobT) * 0.01 * bobAmt, by = -Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;

    h.position.set(
      // reload: the gun comes up and in, canted so you see the hands work the magazine (CoD style)
      lerp(G.hip.x, G.ads.x, ae) + bx + this.swayX * (1 - a * 0.7) - tilt * 0.07 - this.sprintT * 0.06 - mel * 0.08 + slide * -0.04,
      lerp(G.hip.y, G.ads.y, ae) + by + this.swayY * (1 - a * 0.7) + idle + tilt * 0.075 - sw * 0.25 - gren * 0.22 - this.sprintT * 0.02 - this.landDip * 0.025 + slide * -0.02,
      lerp(G.hip.z, G.ads.z, ae) + this.kick * (a > 0.5 ? 0.018 : 0.035) + tilt * 0.02 - mel * 0.12,
    );
    h.rotation.set(
      this.kickRot * (a > 0.5 ? 0.025 : 0.07) + tilt * 0.06 - this.sprintT * 0.25 + this.swayY * 0.8 + mel * 0.2,
      this.sprintT * 0.55 - tilt * 0.04 + this.swayX * 1.6 + mel * 0.3 + (1 - a) * 0.035,
      -tilt * 0.55 + this.sprintT * 0.55 - mel * 0.7 + slide * 0.25 + this.swayX * 0.6,
    );
    // tactical sprint: gun swung up beside the face, muzzle high (MW style)
    const tk = this.tacK || 0;
    if (tk > 0.01) {
      // undo most of the normal sprint pose, then swing the muzzle up, held off to the right
      h.position.x += (0.07 + this.sprintT * 0.06) * tk;
      h.position.y += (-0.07 + this.sprintT * 0.02) * tk + by * 0.8;
      h.position.z += -0.12 * tk;
      h.rotation.x += (0.85 + this.sprintT * 0.25) * tk;
      h.rotation.y += (-0.35 - this.sprintT * 0.55) * tk;
      h.rotation.z += (0.15 - this.sprintT * 0.55) * tk + bx * 4;
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
    mag.visible = true;
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
    handFrame(_R, _rq, gun.group, _gq, type === 'pistol' ? RH_PISTOL : RH_LONG, GRIP_F, PALM_L);
    // left hand where it rests on the gun: support hand on a pistol, vertical grip, or palm up under the handguard / pump
    let lPose;
    if (type === 'pistol') { handFrame(_L, _lq, gun.group, _gq, LH_PISTOL, GRIP_F, PALM_R); lPose = POSES.wrap; }
    else if (A.under === 'vgrip') { handFrame(_L, _lq, gun.group, _gq, _v1.copy(gun.foregrip.position).add(VG_OFF), VG_F, PALM_R); lPose = POSES.wrap; }
    else { handFrame(_L, _lq, gun.group, _gq, _v1.copy(gun.pump ? gun.pump.position : gun.foregrip.position).add(SUP_OFF), SUP_F, PALM_SUP); lPose = POSES.support; }
    let tPose = lPose, lk = 0, leftFree = false;
    const toward = (pos, q, pose, k) => { _L.lerp(pos, k); _lq.slerp(q, k); tPose = pose; lk = k; };
    const MH = G.magHold;
    if (s2 > 0.05 && MH) {
      // inspect: left hand drops to the magazine
      handFrame(_tp, _tq, gun.group, _gq, MH.pos, MH.f, MH.p);
      toward(_tp, _tq, MH.pose, smooth(0.3, 0.9, s2));
    }
    if (w.reloading && MH) {
      // magazine change: grab the mag, pull it, take it down out of view, bring a fresh one up, seat it,
      // slap it home, back to the gun. The mag rides in the hand the whole time.
      handFrame(_m0, _mq, gun.group, _gq, MH.pos, MH.f, MH.p);                 // M0: holding the seated mag
      _m1.copy(_m0).add(_a.set(0.01, -0.15, 0.05));                           // M1: pulled clear
      _pp.copy(_m0).add(_a.set(-0.06, -0.42, 0.06));                          // P: down, out of view
      const seg = (a, b) => smooth(a, b, rp);
      _gl.copy(_L); _lq2.copy(_lq);                                            // the resting grip
      let attach = true, k = 1;
      if (rp < 0.1) { k = seg(0, 0.1); _L.lerpVectors(_gl, _m0, k); attach = false; }
      else if (rp < 0.24) _L.lerpVectors(_m0, _m1, seg(0.1, 0.24));
      else if (rp < 0.4) _L.lerpVectors(_m1, _pp, seg(0.24, 0.4));
      else if (rp < 0.56) _L.lerpVectors(_pp, _m1, seg(0.4, 0.56));
      else if (rp < 0.7) _L.lerpVectors(_m1, _m0, seg(0.56, 0.7));
      else if (rp < 0.78) { _L.copy(_m0); _L.y += 0.025 * bump(0.7, 0.78, rp); attach = rp < 0.72; }
      else { k = 1 - seg(0.78, 0.92); _L.lerpVectors(_gl, _m0, k); attach = false; }
      _lq.copy(_lq2).slerp(_mq, k);
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
    if (c.grenadeCd > 0.4) {
      handFrame(_tp, _tq, null, null, _a.set(-0.1, -0.05 - gren0 * 0.1, -0.45 + gren0 * 0.1), THROW_F, THROW_P);
      toward(_tp, _tq, POSES.open, 1);
    }
    // cooking: the frag sits in the left hand, held up beside the lowered gun
    if (!this.vmNade) {
      this.vmNade = new THREE.Mesh(this.game.grenadeGeo, this.game.grenadeMat);
      this.vmNade.scale.setScalar(0.55);
      this.vmRoot.add(this.vmNade);
    }
    this.vmNade.visible = this.cookBlend > 0.3;
    if (this.vmNade.visible) {
      const shake = this.cookT !== null && this.cookT > GRENADE.fuse - 1.2 ? (Math.random() - 0.5) * 0.006 : 0;
      handFrame(_tp, _tq, null, null, _a.set(-0.17 + shake, -0.17 - (1 - this.cookBlend) * 0.2, -0.36), COOK_F, PALM_UP);
      toward(_tp, _tq, POSES.cup, smooth(0.3, 0.8, this.cookBlend));
      this.vmNade.position.copy(_tp).add(_a.set(0, 0.045, -0.012));
      this.vmNade.rotation.set(0.4, 0.3, 0);
    }
    blendPose(this.lPose, lPose, tPose, lk);
    poseArm(this.arms.R, SHOULDER_R, _R, _rq, this.rPose, POLE_R);
    poseArm(this.arms.L, SHOULDER_L, _L, _lq, this.lPose, leftFree ? _a.set(-0.4, -1, 0.1) : POLE_L);
  }

  // Round modes: over-the-shoulder view of a living teammate. Returns false when there's nobody to watch.
  specCam(dt, next) {
    const c = this.c, g = this.game, cam = this.camera;
    if (g.time - c.deathT < 2.5) return false;
    const mates = g.characters.filter(m => m !== c && m.team === c.team && m.alive && !m.hidden);
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
