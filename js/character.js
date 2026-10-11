// Shared character logic (player + bots): movement, health, weapons, model
import * as THREE from 'three';
import { PLAYER, GRENADE, TEAMS } from './config.js';
import { WeaponState, buildGun } from './weapons.js';

const lerp = (a, b, t) => a + (b - a) * t;
const _v = new THREE.Vector3();

const sharedMats = {
  skin: new THREE.MeshStandardMaterial({ color: 0xc99472, roughness: 0.8 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.9 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.2, metalness: 0.6 }),
  vest: new THREE.MeshStandardMaterial({ color: 0x3a3f36, roughness: 0.85 }),
};
const teamMats = TEAMS.map(t => ({
  shirt: new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.75 }),
  helmet: new THREE.MeshStandardMaterial({ color: t.dark, roughness: 0.6 }),
  band: new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 0.5 }),
}));

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function makeNameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px "Chakra Petch", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

export function buildHumanoid(team, weaponId, name) {
  const tm = teamMats[team];
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hips = new THREE.Group();
  hips.position.y = 0.86;
  root.add(hips);
  const mkLeg = (x) => {
    const leg = new THREE.Group();
    leg.position.x = x;
    leg.add(box(0.2, 0.86, 0.22, sharedMats.pants, 0, -0.43, 0));
    leg.add(box(0.22, 0.12, 0.3, sharedMats.boot, 0, -0.8, -0.04));
    hips.add(leg);
    return leg;
  };
  const legL = mkLeg(-0.12), legR = mkLeg(0.12);
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.5, 0.62, 0.28, tm.shirt, 0, 0.31, 0));
  torso.add(box(0.54, 0.38, 0.32, sharedMats.vest, 0, 0.36, 0));
  torso.add(box(0.545, 0.06, 0.325, tm.band, 0, 0.5, 0));
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  head.add(box(0.26, 0.28, 0.26, sharedMats.skin, 0, 0.13, 0));
  head.add(box(0.3, 0.13, 0.31, tm.helmet, 0, 0.26, 0.01));
  head.add(box(0.24, 0.07, 0.03, sharedMats.visor, 0, 0.16, -0.135));
  const arms = new THREE.Group();
  arms.position.y = 0.53;
  torso.add(arms);
  const armR = box(0.13, 0.13, 0.5, tm.shirt, 0.24, -0.06, -0.2);
  armR.rotation.y = 0.35;
  arms.add(armR);
  const armL = box(0.13, 0.13, 0.52, tm.shirt, -0.16, -0.04, -0.3);
  armL.rotation.y = -0.4;
  arms.add(armL);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.1, -0.02, -0.45);
  arms.add(gunHolder);
  const gun = buildGun(weaponId);
  gunHolder.add(gun.group);
  const nameTag = makeNameSprite(name, TEAMS[team].css);
  nameTag.position.y = 2.15;
  root.add(nameTag);
  return { root, hips, legL, legR, torso, head, arms, gunHolder, gun, nameTag };
}

export class Character {
  constructor(game, { name, team, isBot, primary }) {
    this.game = game;
    this.name = name;
    this.team = team;
    this.isBot = isBot;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.crouchT = 0; this.wantCrouch = false;
    this.onGround = false;
    this.health = PLAYER.maxHealth;
    this.alive = false;
    this.primaryId = primary;
    this.weapons = [new WeaponState(primary), new WeaponState('pistol')];
    this.cur = 0; this.prev = 1; this.switchT = 0;
    this.grenades = GRENADE.start; this.grenadeCd = 0;
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0; this.streak = 0;
    this.respawnT = 0; this.spawnProtect = 0;
    this.lastDamageT = -99; this.lastFireT = -99;
    this.damagers = new Map();
    this.bloom = 0; this.adsT = 0; this.sprinting = false;
    this.lastAttacker = null; this.lastAttackerT = -99;
    this.killer = null; this.deathT = 0;
    this.stepAccum = 0; this.animPhase = 0;
    this.model = null;
    if (isBot) {
      this.model = buildHumanoid(team, primary, name);
      game.scene.add(this.model.root);
      this.model.root.visible = false;
    }
  }

  get weapon() { return this.weapons[this.cur]; }
  get eyeHeight() { return lerp(PLAYER.eye, PLAYER.crouchEye, this.crouchT); }
  eyePos(out) { return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }
  chestPos(out) { return out.set(this.pos.x, this.pos.y + this.height * 0.68, this.pos.z); }
  headPos(out) { return out.set(this.pos.x, this.pos.y + this.height - 0.16, this.pos.z); }
  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  spawn(p, yaw) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = PLAYER.maxHealth;
    this.alive = true;
    this.crouchT = 0; this.wantCrouch = false; this.height = PLAYER.height;
    this.weapons.forEach(w => w.refill());
    if (this.cur !== 0) { this.cur = 0; this.setGunModel(this.weapon.id); }
    this.prev = 1; this.switchT = 0.3;
    this.grenades = GRENADE.start;
    this.spawnProtect = PLAYER.spawnProtect;
    this.damagers.clear();
    this.streak = 0;
    this.bloom = 0; this.adsT = 0;
    this.lastAttacker = null;
    if (this.model) {
      const r = this.model.root;
      r.visible = true;
      r.rotation.set(0, yaw, 0);
      r.position.copy(p);
    }
  }

  switchTo(i) {
    if (i === this.cur || !this.alive) return;
    this.weapon.cancelReload();
    this.prev = this.cur;
    this.cur = i;
    this.switchT = 0.35;
    this.setGunModel(this.weapon.id);
    this.game.audio.play('switch', this.pos);
  }

  reload() {
    if (this.weapon.startReload()) this.game.audio.play('reload', this.pos, { duration: this.weapon.def.reload });
  }

  currentSpread() {
    const d = this.weapon.def;
    let s = lerp(d.spread, d.adsSpread, this.adsT);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    s += d.moveSpread * Math.min(1, hs / PLAYER.walk) * (1 - 0.6 * this.adsT);
    if (!this.onGround) s += 0.05;
    if (this.crouchT > 0.5) s *= 0.75;
    return s + this.bloom;
  }

  tryFire(origin, dir) {
    const w = this.weapon;
    if (!this.alive || this.switchT > 0 || w.reloading || w.cooldown > 0) return false;
    if (w.mag <= 0) {
      if (!w.dryClicked) { this.game.audio.play('dry', this.pos); w.dryClicked = true; }
      if (w.reserve > 0) this.reload();
      return false;
    }
    w.mag--;
    w.cooldown = 60 / w.def.rpm;
    this.lastFireT = this.game.time;
    this.spawnProtect = 0;
    this.game.shoot(this, w.def, origin, dir, this.currentSpread());
    this.bloom = Math.min(0.06, this.bloom + w.def.recoilPitch * 0.35);
    if (w.mag === 0 && w.reserve > 0) setTimeout(() => this.alive && this.reload(), 180);
    return true;
  }

  throwGrenade(target) {
    if (!this.alive || this.grenades <= 0 || this.grenadeCd > 0) return false;
    this.grenades--;
    this.grenadeCd = GRENADE.cooldown;
    this.weapon.cancelReload();
    this.game.throwGrenade(this, target);
    return true;
  }

  takeDamage(amount, attacker, weaponId, headshot, fromPos) {
    if (!this.alive || this.spawnProtect > 0 || this.game.state !== 'playing') return;
    if (attacker && attacker !== this && attacker.team === this.team && !this.game.settings.friendlyFire) return;
    this.health -= amount;
    this.lastDamageT = this.game.time;
    if (attacker && attacker !== this) {
      const rec = this.damagers.get(attacker) || { dmg: 0, t: 0 };
      rec.dmg += amount; rec.t = this.game.time;
      this.damagers.set(attacker, rec);
      this.lastAttacker = attacker; this.lastAttackerT = this.game.time;
    }
    this.game.onDamaged(this, attacker, amount, headshot, fromPos);
    if (this.health <= 0) {
      this.health = 0;
      this.game.onKill(attacker, this, weaponId, headshot);
    }
  }

  updateCommon(dt) {
    for (const w of this.weapons) w.update(dt);
    if (this.switchT > 0) this.switchT -= dt;
    if (this.grenadeCd > 0) this.grenadeCd -= dt;
    if (this.spawnProtect > 0) this.spawnProtect -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    if (this.alive && this.health < PLAYER.maxHealth && this.game.time - this.lastDamageT > PLAYER.regenDelay) {
      this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.regenRate * dt);
    }
  }

  updateMovement(dt, wish, sprint, jump) {
    const phys = this.game.physics;
    let target = this.wantCrouch ? 1 : 0;
    if (target === 0 && this.crouchT > 0 && phys.overlap(this.pos.x, this.pos.y + 0.05, this.pos.z, this.radius * 0.95, PLAYER.height - 0.05)) target = 1;
    this.crouchT += Math.sign(target - this.crouchT) * Math.min(Math.abs(target - this.crouchT), dt * 7);
    this.height = lerp(PLAYER.height, PLAYER.crouchHeight, this.crouchT);

    this.sprinting = sprint && this.crouchT < 0.3;
    let speed = this.crouchT > 0.5 ? PLAYER.crouchSpeed : this.sprinting ? PLAYER.sprint : PLAYER.walk;
    speed *= lerp(1, PLAYER.adsSpeedMult, this.adsT);
    const accel = this.onGround ? PLAYER.accelGround : PLAYER.accelAir;
    const tx = wish.x * speed, tz = wish.z * speed;
    let dx = tx - this.vel.x, dz = tz - this.vel.z;
    const dl = Math.hypot(dx, dz), maxC = accel * dt;
    if (dl > maxC) { dx *= maxC / dl; dz *= maxC / dl; }
    this.vel.x += dx; this.vel.z += dz;

    if (jump && this.onGround && this.crouchT < 0.5) {
      this.vel.y = PLAYER.jump;
      this.onGround = false;
      this.game.audio.play('jump', this.pos);
    }
    const wasGround = this.onGround;
    const fallSpeed = this.vel.y;
    this.vel.y -= PLAYER.gravity * dt;
    phys.moveEntity(this, dt);
    if (!wasGround && this.onGround && fallSpeed < -8) this.game.audio.play('land', this.pos);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1.5) {
      this.stepAccum += hs * dt;
      const stride = this.sprinting ? 2.6 : 2.0;
      if (this.stepAccum > stride) {
        this.stepAccum = 0;
        if (this.crouchT < 0.5) this.game.audio.play('step', this.pos, { self: !this.isBot });
      }
    }
    if (this.pos.y < -15) this.takeDamage(999, null, 'fall', false, this.pos);
  }

  updateModel(dt, showName) {
    if (!this.model) return;
    const m = this.model;
    const r = m.root;
    if (!this.alive) {
      const t = this.game.time - this.deathT;
      r.rotation.x = -Math.min(1, t / 0.45) * Math.PI / 2;
      r.position.y = this.pos.y + 0.12 * Math.min(1, t / 0.45);
      m.nameTag.visible = false;
      if (t > 4) r.visible = false;
      return;
    }
    r.visible = this.spawnProtect > 0 ? Math.floor(this.game.time * 12) % 2 === 0 : true;
    r.position.copy(this.pos);
    r.rotation.set(0, this.yaw, 0);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.animPhase += hs * dt * 2.1;
    const amt = Math.min(1, hs / 5) * (this.onGround ? 1 : 0.3);
    m.hips.position.y = lerp(0.86, 0.55, this.crouchT);
    const legScale = lerp(1, 0.64, this.crouchT);
    m.legL.scale.y = m.legR.scale.y = legScale;
    m.legL.rotation.x = Math.sin(this.animPhase) * 0.65 * amt;
    m.legR.rotation.x = -Math.sin(this.animPhase) * 0.65 * amt;
    m.torso.rotation.x = -0.08 * amt;
    m.arms.rotation.x = this.pitch;
    m.head.rotation.x = this.pitch * 0.6;
    m.nameTag.visible = showName;
    m.nameTag.position.y = this.height + 0.35;
  }

  setGunModel(id) {
    if (!this.model) return;
    const holder = this.model.gunHolder;
    holder.clear();
    this.model.gun = buildGun(id);
    holder.add(this.model.gun.group);
  }

  muzzleWorld(out) {
    if (this.model) {
      this.model.gun.muzzle.getWorldPosition(out);
      return out;
    }
    this.eyePos(out);
    const f = this.forward(_v);
    return out.addScaledVector(f, 0.6).add({ x: Math.cos(this.yaw) * 0.18, y: -0.18, z: -Math.sin(this.yaw) * 0.18 });
  }

  dispose() {
    if (this.model) this.game.scene.remove(this.model.root);
  }
}
