// Local player: input -> movement/weapons, first-person camera, viewmodel (IK arms, reloads, recoil),
// gamepad look with response curve + aim assist.
import * as THREE from 'three';
import { TEAMS, MELEE } from './config.js';
import { buildGun } from './weapons.js';
import { Seg, teamMat, createFpBody, poseFpBody } from './character.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (a, b, x) => smooth(a, a + (b - a) * 0.3, x) * (1 - smooth(b - (b - a) * 0.3, b, x));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _wish = new THREE.Vector3();
const _E = new THREE.Vector3(), _R = new THREE.Vector3(), _L = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

const SHOULDER_R = new THREE.Vector3(0.24, -0.4, 0.15), SHOULDER_L = new THREE.Vector3(-0.24, -0.42, 0.05);
const POLE_R = new THREE.Vector3(1, -0.8, 0.2), POLE_L = new THREE.Vector3(-1, -0.9, 0);
const EYE_RELIEF = -0.25;

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
    this.lastFov = 0;
    this.buildArms();
    this.fp = createFpBody(char.team);
    if (this.fp) {
      this.vmRoot.add(this.fp.root);
      for (const a of [this.armR, this.armL]) a.upper.visible = a.fore.visible = a.hand.visible = false;
    }
    this.buildViewmodels();
  }

  buildArms() {
    const k = TEAMS[this.c.team].kit;
    const mat = teamMat(this.c.team);
    const mk = () => {
      const upper = new THREE.Group(), fore = new THREE.Group(), hand = new THREE.Group();
      new Seg().cap(k.shirt, 0.052, 0.24, 0, -0.17, 0).build(upper, mat);
      new Seg().cap(k.shirt, 0.045, 0.26, 0, -0.16, 0).box(0x22201c, 0.1, 0.06, 0.1, 0, -0.3, 0).build(fore, mat);
      new Seg().box(k.glove, 0.085, 0.1, 0.035, 0, -0.04, 0)
        .box(k.glove, 0.08, 0.045, 0.055, 0, -0.1, -0.02, 0.6)
        .box(k.glove, 0.03, 0.06, 0.03, 0.04, -0.06, -0.03, 0.3, 0, -0.5)
        .build(hand, mat);
      this.vmRoot.add(upper, fore, hand);
      return { upper, fore, hand };
    };
    this.armR = mk();
    this.armL = mk();
  }

  buildViewmodels() {
    this.guns.forEach(g => this.vmRoot.remove(g.holder));
    this.guns = this.c.weapons.map(w => {
      const holder = new THREE.Group();
      const gun = buildGun(w.id, { forViewmodel: true });
      holder.add(gun.group);
      holder.visible = false;
      this.vmRoot.add(holder);
      const pistol = w.id === 'pistol';
      const touch = this.game.input.isTouch;
      return {
        id: w.id, holder, gun,
        // phones: gun sits a little lower so it doesn't fill the small screen (the viewmodel FOV is wider too)
        hip: touch ? (pistol ? new THREE.Vector3(0.12, -0.14, -0.34) : new THREE.Vector3(0.14, -0.17, -0.22))
          : pistol ? new THREE.Vector3(0.11, -0.12, -0.34) : new THREE.Vector3(0.13, -0.15, -0.22),
        ads: new THREE.Vector3(0, -gun.sightY, EYE_RELIEF - gun.sightZ),
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
  ejectWorld(out) {
    const g = this.guns[this.c.cur];
    g.gun.eject.getWorldPosition(out);
    return this.camera.localToWorld(out);
  }

  update(dt) {
    const c = this.c, g = this.game, inp = g.input, s = g.settings;
    if (!c.alive) {
      this.vmRoot.visible = false;
      this.deathCam(dt);
      return;
    }
    this.vmRoot.visible = true;
    const canAct = !g.frozen;
    const def = c.weapon.def;

    // ---- look ----
    const zoom = lerp(1, def.adsFov / s.fov, c.adsT);
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

    let slideReq = false;
    const crouchPress = inp.action('crouch'), slidePress = inp.action('slide');
    if ((crouchPress || slidePress) && c.sprinting && c.onGround) slideReq = true;
    else if (crouchPress) this.crouchToggle = !this.crouchToggle;
    if (sprint && !c.sprinting) this.crouchToggle = false;
    c.wantCrouch = this.crouchToggle || inp.down('ControlLeft');
    const jump = canAct && (inp.down('Space') || inp.action('jump'));
    if (jump) this.crouchToggle = false;
    c.updateMovement(dt, _wish, sprint, jump, slideReq && canAct);
    // the exact command that produced this frame's movement (sent to the host when playing online)
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));
    this.cmd = { dt, mx: canAct ? clamp1(r) : 0, my: canAct ? clamp1(f) : 0, y: c.yaw, p: c.pitch, sp: sprint ? 1 : 0, cr: c.wantCrouch ? 1 : 0, j: jump ? 1 : 0, sl: slideReq && canAct ? 1 : 0, f: 0, ads: 0, a: null };
    if (!this.wasGround && c.onGround) this.landDip = 1;
    this.wasGround = c.onGround;

    // ---- weapons ----
    if (canAct) {
      if (inp.action('slot1')) c.switchTo(0);
      if (inp.action('slot2')) c.switchTo(1);
      if (inp.action('swap') || inp.wheel !== 0) c.switchTo(c.prev);
      if (inp.action('reload')) { c.reload(); this.padSprint = false; }
      if (inp.action('grenade')) c.throwGrenade();
      if (inp.action('melee')) c.melee();
    }
    // toggle ADS drops out on reload, weapon swap, sprint, melee and throws, like hold ADS would
    if (c.weapon.reloading || c.switchT > 0 || c.sprinting || c.meleeT > 0 || c.grenadeCd > 0.6) inp.clearAds();
    const adsWant = canAct && inp.ads && !c.sprinting && c.switchT <= 0 && !c.weapon.reloading && c.meleeT <= 0 ? 1 : 0;
    this.cmd.ads = adsWant;
    this.cmd.f = canAct && inp.fire ? 1 : 0;
    const acts = inp.used.filter(a => a === 'reload' || a === 'grenade' || a === 'melee' || a === 'swap' || a === 'slot1' || a === 'slot2');
    if (acts.length) this.cmd.a = acts;
    c.adsT = clamp(c.adsT + Math.sign(adsWant - c.adsT) * dt / def.adsTime, 0, 1);

    // touch auto-fire: shoot while the crosshair is on an enemy in range (Call of Duty Mobile "simple mode")
    const auto = autoOn && !c.sprinting;
    let fired = false;
    if (canAct && (inp.fire || auto) && this.cycleT <= 0) {
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
    const fov = lerp(s.fov, c.weapon.def.adsFov, c.adsT) * (c.sprinting ? 1.06 : 1);
    if (Math.abs(fov - this.lastFov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.lastFov = fov;
    }
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
    const gren = c.grenadeCd > 0 ? Math.sin(clamp(c.grenadeCd / 0.9, 0, 1) * Math.PI) : 0;
    const mel = c.meleeT > 0 ? Math.sin((1 - c.meleeT / MELEE.time) * Math.PI) : 0;
    const idle = Math.sin(this.breathT * 1.6) * 0.002 * (1 - a);
    const tilt = w.reloading ? bump(0.0, 1.0, rp) : 0;
    const slide = c.slideT > 0 ? 1 : 0;
    const bx = Math.sin(this.bobT) * 0.01 * bobAmt, by = -Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt;

    h.position.set(
      lerp(G.hip.x, G.ads.x, ae) + bx + this.swayX * (1 - a * 0.7) - this.sprintT * 0.03 - mel * 0.08 + slide * -0.04,
      lerp(G.hip.y, G.ads.y, ae) + by + this.swayY * (1 - a * 0.7) + idle - tilt * 0.04 - sw * 0.25 - gren * 0.22 - this.sprintT * 0.05 - this.landDip * 0.025 + slide * -0.02,
      lerp(G.hip.z, G.ads.z, ae) + this.kick * (a > 0.5 ? 0.018 : 0.035) - mel * 0.12,
    );
    h.rotation.set(
      this.kickRot * (a > 0.5 ? 0.025 : 0.07) + tilt * 0.1 - this.sprintT * 0.3 + this.swayY * 0.8 + mel * 0.2,
      this.sprintT * 0.75 + this.swayX * 1.6 + mel * 0.3 + (1 - a) * 0.035,
      tilt * 0.32 + this.sprintT * 0.45 - mel * 0.7 + slide * 0.25 + this.swayX * 0.6,
    );

    // magazine + hand choreography during reload
    const mag = gun.mag;
    mag.position.copy(gun.magHome);
    mag.visible = true;
    let leftMode = 'grip';
    if (w.reloading && w.id !== 'shotgun') {
      const out = smooth(0.12, 0.32, rp), back = 1 - smooth(0.5, 0.72, rp);
      const off = rp < 0.42 ? out : rp < 0.5 ? 1 : back;
      mag.position.y -= off * 0.3;
      mag.position.z += off * 0.06;
      mag.visible = !(rp > 0.34 && rp < 0.5);
      leftMode = rp < 0.08 || rp > 0.82 ? 'grip' : rp > 0.34 && rp < 0.5 ? 'pouch' : 'mag';
    } else if (w.reloading && w.id === 'shotgun') {
      leftMode = Math.sin(rp * Math.PI * 10) > 0 ? 'pouch' : 'port';
    }
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
    this.flash.visible = this.flashT > 0;
    h.updateMatrixWorld(true);
    if (this.flash.visible) {
      gun.muzzle.getWorldPosition(this.flash.position);
      this.flash.rotation.z = Math.random() * Math.PI;
      const sc = 0.7 + Math.random() * 0.7;
      this.flash.scale.set(sc, sc, sc);
      this.vmFlashLight.position.copy(this.flash.position);
      this.vmFlashLight.intensity = 3;
    } else this.vmFlashLight.intensity = 0;

    // arms (IK in camera space)
    gun.group.localToWorld(_R.set(0, -0.04, 0.03));
    if (leftMode === 'grip') {
      (gun.pump || gun.foregrip).getWorldPosition(_L);
      if (gun.pump) _L.y -= 0.0;
    } else if (leftMode === 'mag') {
      mag.getWorldPosition(_L);
      _L.y -= 0.06;
    } else if (leftMode === 'port') {
      gun.eject.getWorldPosition(_L);
      _L.y -= 0.05;
    } else {
      _L.set(-0.12, -0.42, -0.15);
    }
    if (c.grenadeCd > 0.4) _L.set(-0.1, -0.05 - gren * 0.1, -0.45 + gren * 0.1);
    if (this.fp) {
      // wrist sits slightly behind/below the grip point
      _R.add(_a.set(0.004, -0.004, 0.045).applyQuaternion(h.quaternion));
      _L.add(_a.set(-0.02, -0.025, 0.045).applyQuaternion(h.quaternion));
      poseFpBody(this.fp, dt, _R, _L, this.sprintT * 0.05, h.quaternion);
    } else {
      this.poseArm(this.armR, SHOULDER_R, _R, POLE_R, h);
      this.poseArm(this.armL, SHOULDER_L, _L, POLE_L, h);
    }
  }

  poseArm(arm, S, H, pole, holder) {
    solveElbow(S, H, 0.34, 0.36, pole, _E);
    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(DOWN, _a.subVectors(_E, S).normalize());
    arm.fore.position.copy(_E);
    arm.fore.quaternion.setFromUnitVectors(DOWN, _a.subVectors(H, _E).normalize());
    arm.hand.position.copy(H);
    arm.hand.quaternion.copy(holder.quaternion);
  }

  deathCam(dt) {
    const c = this.c, cam = this.camera;
    const k = c.killer && c.killer !== c && c.killer.alive ? c.killer : null;
    _a.set(c.pos.x, c.pos.y + 2.2, c.pos.z);
    if (k) {
      _b.subVectors(c.pos, k.pos).setY(0);
      if (_b.lengthSq() > 0.01) _b.normalize().multiplyScalar(2.2);
      _a.add(_b);
    }
    cam.position.lerp(_a, Math.min(1, dt * 3));
    if (k) k.eyePos(_b); else _b.copy(c.pos);
    cam.lookAt(_b);
    if (Math.abs(cam.fov - this.game.settings.fov) > 0.01) { cam.fov = this.game.settings.fov; cam.updateProjectionMatrix(); this.lastFov = cam.fov; }
  }
}
