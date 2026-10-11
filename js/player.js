// Local player: input -> movement/weapons, first-person camera and viewmodel
import * as THREE from 'three';
import { TEAMS } from './config.js';
import { buildGun } from './weapons.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VM_SCALE = 0.78;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _wish = new THREE.Vector3();

export class PlayerController {
  constructor(game, char) {
    this.game = game;
    this.c = char;
    this.camera = game.camera;
    this.vmRoot = new THREE.Group();
    game.vmScene.add(this.vmRoot);
    this.guns = [];
    this.triggerLatch = false;
    this.bobT = 0; this.kick = 0; this.swayX = 0; this.swayY = 0; this.sprintT = 0;
    this.flashT = 0; this.shake = 0; this.landDip = 0; this.wasGround = true;
    this.deathCamPos = new THREE.Vector3();
    this.lastFov = 0;

    const flashTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,220,1)'); grd.addColorStop(0.3, 'rgba(255,200,80,0.9)'); grd.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.visible = false;
    this.buildViewmodels();
  }

  buildViewmodels() {
    this.vmRoot.clear();
    this.guns = this.c.weapons.map(w => {
      const holder = new THREE.Group();
      const gun = buildGun(w.id);
      holder.add(gun.group);
      const skin = new THREE.MeshStandardMaterial({ color: 0xc99472, roughness: 0.8 });
      const sleeve = new THREE.MeshStandardMaterial({ color: TEAMS[this.c.team].dark, roughness: 0.9 });
      const glove = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.9 });
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.11), glove);
      hand.position.set(0.01, -0.07, 0.05);
      holder.add(hand);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.4), sleeve);
      arm.position.set(0.04, -0.12, 0.3);
      holder.add(arm);
      const lhand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.12), glove);
      lhand.position.set(-0.01, -0.03, w.id === 'pistol' ? 0.02 : -0.24);
      holder.add(lhand);
      const larm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), sleeve);
      larm.position.set(-0.1, -0.1, w.id === 'pistol' ? 0.22 : 0.0);
      larm.rotation.y = -0.45;
      holder.add(larm);
      void skin;
      holder.visible = false;
      this.vmRoot.add(holder);
      holder.scale.setScalar(VM_SCALE);
      const bh = w.def.model.body[1];
      const sightY = w.def.model.sight === 'red' ? bh / 2 + 0.03 : w.def.model.sight === 'scope' ? bh / 2 + 0.07 : bh / 2 + 0.05;
      // gun origin is 0.03 below body center; align sight with screen center
      return { holder, muzzle: gun.muzzle, adsY: -(sightY + 0.03) * VM_SCALE, id: w.id };
    });
    this.vmRoot.add(this.flash);
  }

  muzzleWorld(out) {
    const g = this.guns[this.c.cur];
    this.vmRoot.updateMatrixWorld(true);
    g.muzzle.getWorldPosition(out);
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

    // look
    const zoom = lerp(1, def.adsFov / s.fov, c.adsT);
    const sens = 0.0022 * s.sensitivity * zoom;
    const mdx = inp.mouseDX, mdy = inp.mouseDY;
    c.yaw -= mdx * sens;
    c.pitch -= mdy * sens * (s.invertY ? -1 : 1);
    c.pitch = clamp(c.pitch, -1.5, 1.5);

    // movement
    let f = 0, r = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) f += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) f -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) r += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) r -= 1;
    f += inp.moveY; r += inp.moveX;
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    _wish.set(-sy * f + cy * r, 0, -cy * f - sy * r);
    if (_wish.lengthSq() > 1) _wish.normalize();
    if (!canAct) _wish.set(0, 0, 0);
    const sprint = canAct && (inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.touchSprint) && f > 0.5 && !inp.ads && !inp.fire;
    c.wantCrouch = inp.down('KeyC') || inp.down('ControlLeft') || inp.crouchToggle;
    const jump = canAct && (inp.down('Space') || inp.consume('touchJump'));
    c.updateMovement(dt, _wish, sprint, jump);
    if (!this.wasGround && c.onGround) this.landDip = 1;
    this.wasGround = c.onGround;

    // weapons
    if (canAct) {
      if (inp.consume('Digit1')) c.switchTo(0);
      if (inp.consume('Digit2')) c.switchTo(1);
      if (inp.consume('KeyQ') || inp.consume('touchSwap') || inp.wheel !== 0) c.switchTo(c.prev);
      if (inp.consume('KeyR') || inp.consume('touchReload')) c.reload();
      if (inp.consume('KeyG') || inp.consume('touchGrenade')) c.throwGrenade();
    }
    const adsWant = canAct && inp.ads && !c.sprinting && c.switchT <= 0 && !c.weapon.reloading ? 1 : 0;
    c.adsT = clamp(c.adsT + Math.sign(adsWant - c.adsT) * dt / def.adsTime, 0, 1);

    if (canAct && inp.fire) {
      if (def.auto || !this.triggerLatch) {
        if (c.tryFire(c.eyePos(_a), c.forward(_b))) this.onFired(c.weapon.def);
      }
      this.triggerLatch = true;
    } else {
      this.triggerLatch = false;
    }

    this.updateCamera(dt);
    this.updateViewmodel(dt, mdx, mdy);
  }

  onFired(def) {
    const c = this.c;
    this.kick = 1;
    this.flashT = 0.05;
    const rm = (1 - 0.45 * c.adsT) * (c.crouchT > 0.5 ? 0.7 : 1);
    c.pitch += def.recoilPitch * rm;
    c.yaw += (Math.random() - 0.5) * 2 * def.recoilYaw * rm;
    this.shake = Math.min(1, this.shake + def.recoilPitch * 6);
  }

  addShake(v) { this.shake = Math.min(1.5, this.shake + v); }

  updateCamera(dt) {
    const c = this.c, cam = this.camera, s = this.game.settings;
    const hs = Math.hypot(c.vel.x, c.vel.z);
    if (c.onGround) this.bobT += hs * dt * 1.7;
    const bobAmt = Math.min(1, hs / 6) * (1 - 0.8 * c.adsT);
    this.landDip = Math.max(0, this.landDip - dt * 5);
    c.eyePos(cam.position);
    cam.position.y += Math.abs(Math.cos(this.bobT)) * 0.035 * bobAmt - Math.sin(this.landDip * Math.PI) * 0.08;
    this.shake = Math.max(0, this.shake - dt * 4);
    const sh = this.shake * this.shake * 0.02;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(c.pitch + (Math.random() - 0.5) * sh, c.yaw + (Math.random() - 0.5) * sh, Math.sin(this.bobT * 0.5) * 0.004 * bobAmt);
    const fov = lerp(s.fov, c.weapon.def.adsFov, c.adsT);
    if (Math.abs(fov - this.lastFov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.lastFov = fov;
    }
  }

  updateViewmodel(dt, mdx, mdy) {
    const c = this.c;
    this.guns.forEach((g, i) => { g.holder.visible = i === c.cur; });
    const g = this.guns[c.cur];
    const h = g.holder;
    const scoped = c.weapon.def.scope && c.adsT > 0.85;
    this.vmRoot.visible = !scoped;

    this.sprintT = clamp(this.sprintT + (c.sprinting ? dt : -dt) * 6, 0, 1);
    this.kick *= Math.exp(-dt * 16);
    this.swayX = lerp(this.swayX, clamp(-mdx * 0.0007, -0.04, 0.04), Math.min(1, dt * 10));
    this.swayY = lerp(this.swayY, clamp(mdy * 0.0007, -0.04, 0.04), Math.min(1, dt * 10));
    const hs = Math.hypot(c.vel.x, c.vel.z);
    const bobAmt = Math.min(1, hs / 6) * (1 - 0.85 * c.adsT) * (c.onGround ? 1 : 0.2);
    const a = c.adsT;
    const w = c.weapon;
    const rp = w.reloadProgress;
    const reloadDip = Math.sin(rp * Math.PI);
    const sw = c.switchT > 0 ? c.switchT / 0.35 : 0;
    const gren = c.grenadeCd > 0 ? Math.sin((c.grenadeCd / 0.9) * Math.PI) : 0;

    h.position.set(
      lerp(0.2, 0, a) + Math.sin(this.bobT) * 0.012 * bobAmt + this.swayX - this.sprintT * 0.06,
      lerp(-0.21, g.adsY, a) - Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt + this.swayY - reloadDip * 0.12 - sw * 0.3 - gren * 0.25 - this.sprintT * 0.05 - this.landDip * 0.03,
      lerp(-0.48, -0.3, a) + this.kick * (a > 0.5 ? 0.025 : 0.05),
    );
    h.rotation.set(
      this.kick * (a > 0.5 ? 0.03 : 0.09) - reloadDip * 0.7 - this.sprintT * 0.35 + this.swayY,
      this.sprintT * 0.75 + this.swayX * 2,
      reloadDip * 0.35 + this.sprintT * 0.25,
    );

    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    if (this.flash.visible) {
      h.updateMatrixWorld(true);
      g.muzzle.getWorldPosition(this.flash.position);
      this.flash.rotation.z = Math.random() * Math.PI;
      const sc = 0.7 + Math.random() * 0.6;
      this.flash.scale.set(sc, sc, sc);
    }
  }

  deathCam(dt) {
    const c = this.c, cam = this.camera;
    const k = c.killer && c.killer !== c && c.killer.alive ? c.killer : null;
    _a.set(c.pos.x, c.pos.y + 2.4, c.pos.z);
    if (k) {
      _b.subVectors(c.pos, k.pos).setY(0);
      if (_b.lengthSq() > 0.01) _b.normalize().multiplyScalar(2.5);
      _a.add(_b);
    }
    cam.position.lerp(_a, Math.min(1, dt * 3));
    if (k) k.eyePos(_b); else _b.copy(c.pos);
    cam.lookAt(_b);
    if (Math.abs(cam.fov - this.game.settings.fov) > 0.01) { cam.fov = this.game.settings.fov; cam.updateProjectionMatrix(); this.lastFov = cam.fov; }
  }
}
