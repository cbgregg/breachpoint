// Match orchestration: scene + renderer, combat resolution, spawning, scoring, pickups, grenades, melee
import * as THREE from 'three';
import { TEAMS, PLAYER, GRENADE, SCORE, MELEE, BOT_NAMES } from './config.js';
import { Physics, rayBox } from './physics.js';
import { buildWorld, renderMinimap, PICKUP_SPOTS } from './world.js';
import { Character, setCharacterDetail } from './character.js';
import { BotBrain } from './bot.js';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { applySpread } from './weapons.js';
import { Renderer, SUN_DIR } from './render.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _end = new THREE.Vector3(), _r = new THREE.Vector3();
const _q = new THREE.Quaternion();
const ZERO = new THREE.Vector3();
const GRAV = 20;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pickBotWeapon() {
  const r = Math.random();
  return r < 0.45 ? 'rifle' : r < 0.72 ? 'smg' : r < 0.88 ? 'sniper' : 'shotgun';
}

export class Game {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.04, 600);
    this.scene.add(this.camera);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.01, 10);
    this.renderer = new Renderer(container, this.scene, this.camera, this.vmScene, this.vmCamera);
    this.vmScene.environment = this.scene.environment;
    this.vmScene.add(new THREE.HemisphereLight(0xc8d4e4, 0x4a4034, 0.6));
    this.vmSun = new THREE.DirectionalLight(0xffe2bd, 2.6);
    this.vmScene.add(this.vmSun);

    this.physics = new Physics();
    this.world = buildWorld(this.scene, this.physics);
    setCharacterDetail(this.world.textures.fabric);
    this.minimap = renderMinimap(this.renderer.renderer, this.scene);
    this.effects = new Effects(this.scene, this.physics);
    this.audio = new GameAudio();
    this.effects.onCasing = (p) => this.audio.play('casing', p);
    this.input = new Input(this.renderer.renderer.domElement);
    this.hud = new HUD(this);

    this.settings = null;
    this.state = 'menu';
    this.characters = [];
    this.brains = new Map();
    this.grenades = [];
    this.time = 0;
    this.menuT = 0;
    this.scores = [0, 0];
    this.intel = [{ pos: new THREE.Vector3(), time: -99 }, { pos: new THREE.Vector3(), time: -99 }];
    this.pickups = [];
    this.aimTarget = null;
    this.damageFx = 0;
    this.onEnd = null;
    this.onPause = null;
    this.buildPickups();

    this.grenadeGeo = new THREE.SphereGeometry(0.06, 12, 10);
    this.grenadeGeo.scale(1, 1.25, 1);
    this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.55, metalness: 0.35 });

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.input.isTouch && !this.input.fallback && this.input.lastDevice !== 'pad') this.pause();
    };
    window.addEventListener('resize', () => this.renderer.setSize());
    this.last = performance.now();
    this.renderer.renderer.setAnimationLoop(() => this.frame());
  }

  get frozen() { return this.countdownT > 0; }

  applySettings(s) {
    if (s.quality !== this.appliedQuality) { this.appliedQuality = s.quality; this.renderer.applyQuality(s.quality); }
    this.audio.setVolume(s.volume);
    this.input.deadzone = s.padDeadzone;
    this.input.vibration = s.vibration;
  }

  // ---------- match lifecycle ----------
  startMatch(settings) {
    this.settings = { ...settings };
    this.applySettings(this.settings);
    for (const c of this.characters) c.dispose();
    if (this.playerCtl) this.vmScene.remove(this.playerCtl.vmRoot);
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    this.pickups = this.pickups.filter(p => { if (p.dynamic) this.scene.remove(p.mesh); return !p.dynamic; });
    for (const p of this.pickups) { p.active = true; p.mesh.visible = true; p.timer = 0; }
    this.effects.clear();
    this.brains.clear();

    const N = Math.max(1, Math.min(8, settings.teamSize | 0));
    this.player = new Character(this, { name: settings.name || 'Operator', team: 0, isBot: false, primary: settings.primary });
    const names = shuffle([...BOT_NAMES]);
    const bots = [];
    for (let t = 0; t < 2; t++) {
      const count = t === 0 ? N - 1 : N;
      for (let i = 0; i < count; i++) {
        const b = new Character(this, { name: names.pop(), team: t, isBot: true, primary: pickBotWeapon() });
        bots.push(b);
        this.brains.set(b, new BotBrain(b, this));
      }
    }
    this.characters = [this.player, ...bots];
    this.playerCtl = new PlayerController(this, this.player);

    this.scores = [0, 0];
    this.time = 0;
    this.timeLeft = settings.timeLimit * 60;
    this.intel.forEach(i => { i.time = -99; });
    this.multi = 0; this.lastKillT = -99;
    this.endT = 0;
    this.damageFx = 0;

    for (const t of [0, 1]) {
      const spots = shuffle([...this.world.spawns[t]]);
      this.characters.filter(c => c.team === t).forEach((c, i) => c.spawn(spots[i % spots.length], this.world.spawnYaw[t]));
    }
    for (const brain of this.brains.values()) brain.reset();

    this.countdownT = 3;
    this.lastBeep = 4;
    this.state = 'playing';
    this.hud.reset();
    this.hud.show(true);
    this.audio.init();
    this.audio.setVolume(settings.volume);
    this.input.reset();
    this.input.enabled = true;
    if (this.input.lastDevice !== 'pad') this.input.lock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this.input.enabled = false;
    this.input.unlock();
    if (this.onPause) this.onPause(true);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    if (this.input.lastDevice !== 'pad') this.input.lock();
    this.audio.init();
    if (this.onPause) this.onPause(false);
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.hud.show(false);
    for (const c of this.characters) c.dispose();
    this.characters = [];
    this.player = null;
    if (this.playerCtl) { this.vmScene.remove(this.playerCtl.vmRoot); this.playerCtl = null; }
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    this.renderer.grade.damage.value = 0;
  }

  endMatch() {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.input.enabled = false;
    this.input.reset();
    this.input.unlock();
    this.hud.show(false);
    this.renderer.grade.damage.value = 0;
    this.audio.play('horn', null, { ui: true });
    const winner = this.scores[0] > this.scores[1] ? 0 : this.scores[1] > this.scores[0] ? 1 : -1;
    const sorted = [...this.characters].sort((a, b) => b.score - a.score);
    if (this.onEnd) this.onEnd({ winner, scores: [...this.scores], players: sorted, mvp: sorted[0], playerTeam: this.player.team });
  }

  // ---------- frame ----------
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.input.poll(dt);
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu' || this.state === 'ended') this.menuCamera(dt);
    if (this.state !== 'paused') this.effects.update(dt);
    this.effects.setScale(this.camera, window.innerHeight * this.renderer.renderer.getPixelRatio());
    // keep the viewmodel lit from the sun's direction as the camera turns
    _q.copy(this.camera.quaternion).invert();
    this.vmSun.position.copy(SUN_DIR).applyQuaternion(_q).multiplyScalar(5);
    const showVm = (this.state === 'playing' || this.state === 'paused') && !!this.player && this.player.alive && this.playerCtl.vmRoot.visible;
    this.renderer.render(dt, showVm);
    this.input.endFrame();
  }

  menuCamera(dt) {
    this.menuT += dt * 0.035;
    const t = this.menuT;
    this.camera.position.set(Math.cos(t) * 22 + 6, 7 + Math.sin(t * 0.7) * 1.5, Math.sin(t) * 16);
    this.camera.lookAt(Math.cos(t + 0.9) * 6, 2.2, Math.sin(t + 0.9) * 6);
    if (this.camera.fov !== 62) { this.camera.fov = 62; this.camera.updateProjectionMatrix(); }
    for (const c of this.characters) c.updateModel(dt, false);
  }

  update(dt) {
    this.time += dt;
    const inp = this.input;
    if (inp.action('pause')) { this.pause(); return; }

    if (this.countdownT > 0) {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        if (n > 0) this.audio.play('beep', null, { ui: true, freq: 520 });
        else { this.audio.play('beep', null, { ui: true, freq: 1040 }); this.hud.medal('FIGHT'); }
      }
      this.hud.countdown(Math.max(0, n));
    } else {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); return; }
    }
    if (this.endT > 0) { this.endT -= dt; if (this.endT <= 0) { this.endMatch(); return; } }

    this.playerCtl.update(dt);
    for (const c of this.characters) {
      if (c.isBot && c.alive) {
        if (this.frozen) c.updateMovement(dt, ZERO, false, false);
        else this.brains.get(c).update(dt);
      }
      c.updateCommon(dt);
      if (!c.alive && this.state === 'playing') {
        c.respawnT -= dt;
        if (c.respawnT <= 0) this.respawn(c);
      }
    }

    this.updateAimTarget();
    for (const c of this.characters) {
      if (c.isBot) c.updateModel(dt, c.team === this.player.team || c === this.aimTarget);
    }
    this.updateGrenades(dt);
    this.updatePickups(dt);
    this.audio.setListener(this.camera.position, this.player.alive ? this.player.yaw : 0);

    // screen damage effect follows missing health
    const p = this.player;
    const target = p.alive ? Math.max(0, 1 - p.health / 70) : 0.6;
    this.damageFx += (target - this.damageFx) * Math.min(1, dt * 6);
    this.renderer.grade.damage.value = this.damageFx;
    this.hud.update(dt);
  }

  updateAimTarget() {
    this.aimTarget = null;
    const p = this.player;
    if (!p.alive) return;
    const o = p.eyePos(_a), d = p.forward(_d);
    const w = this.physics.raycast(o, d, 120);
    let best = w ? w.t : 120;
    for (const c of this.characters) {
      if (!c.alive || c === p) continue;
      const t = this.rayCharacter(o, d, c, best);
      if (t.t < best) { best = t.t; this.aimTarget = c.team !== p.team ? c : null; }
    }
  }

  rayCharacter(o, d, c, maxT) {
    const hx = c.pos.x, hy = c.pos.y + c.height - 0.16, hz = c.pos.z;
    let t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, hx - 0.16, hy - 0.16, hz - 0.16, hx + 0.16, hy + 0.16, hz + 0.16, maxT);
    let head = t < maxT;
    const tb = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, c.pos.x - 0.28, c.pos.y, c.pos.z - 0.28, c.pos.x + 0.28, c.pos.y + c.height - 0.32, c.pos.z + 0.28, Math.min(maxT, t));
    if (tb < Math.min(maxT, t)) { t = tb; head = false; }
    return { t, head };
  }

  // ---------- combat ----------
  shoot(shooter, def, origin, dir, spread) {
    const ff = this.settings.friendlyFire;
    const isPlayer = shooter === this.player;
    const muzzle = isPlayer ? this.playerCtl.muzzleWorld(_m) : shooter.muzzleWorld(_m);
    this.audio.play('shot', isPlayer ? null : shooter.pos, { weapon: def.id });
    this.effects.muzzle(muzzle, dir, def.id === 'shotgun' || def.id === 'sniper');
    // brass
    if (def.id !== 'shotgun' || true) {
      const ej = isPlayer ? this.playerCtl.ejectWorld(_a) : shooter.ejectWorld(_a);
      _r.set(Math.cos(shooter.yaw), 0, -Math.sin(shooter.yaw));
      if (def.id !== 'sniper' && def.id !== 'shotgun') this.effects.casing(ej, dir, _r);
    }
    this.reportIntel(1 - shooter.team, shooter.pos);
    const hits = new Map();
    let whizzed = false;
    for (let p = 0; p < def.pellets; p++) {
      applySpread(dir, spread, _d);
      let best = def.range, hitC = null, head = false;
      const w = this.physics.raycast(origin, _d, def.range);
      if (w) best = w.t;
      for (const c of this.characters) {
        if (!c.alive || c === shooter || (c.team === shooter.team && !ff)) continue;
        _a.set(c.pos.x - origin.x, c.pos.y + 1 - origin.y, c.pos.z - origin.z);
        const along = _a.dot(_d);
        if (along < 0 || along > best + 1.5) continue;
        if (_a.lengthSq() - along * along > 4) continue;
        const r = this.rayCharacter(origin, _d, c, best);
        if (r.t < best) { best = r.t; hitC = c; head = r.head; }
      }
      _end.copy(origin).addScaledVector(_d, best);
      if (!isPlayer || p % 3 === 0) {
        if (!isPlayer || this.time % 0.2 < 0.1 || def.pellets > 1 || !def.auto) this.effects.tracer(muzzle, _end);
      }
      // near-miss bullet whiz for the local player
      if (!isPlayer && !whizzed && hitC !== this.player && this.player.alive && shooter.team !== this.player.team) {
        this.player.headPos(_b).sub(origin);
        const al = _b.dot(_d);
        if (al > 2 && al < best && _b.lengthSq() - al * al < 2.2) { whizzed = true; this.audio.play('whiz', null, { ui: true }); }
      }
      if (hitC) {
        const fall = best <= def.falloffStart ? 1 : best >= def.falloffEnd ? def.falloffMin
          : 1 - (1 - def.falloffMin) * (best - def.falloffStart) / (def.falloffEnd - def.falloffStart);
        const dmg = def.damage * (head ? def.headMult : 1) * fall;
        const rec = hits.get(hitC) || { dmg: 0, head: false };
        rec.dmg += dmg; rec.head = rec.head || head;
        hits.set(hitC, rec);
        this.effects.impact(_end, _b.copy(_d).negate(), 'blood');
      } else if (w) {
        this.effects.impact(w.point, w.normal, w.box.surface);
        if (p === 0) this.audio.play('impact', w.point);
      }
    }
    for (const [c, rec] of hits) {
      if (c.spawnProtect > 0) continue;
      c.takeDamage(rec.dmg, shooter, def.id, rec.head, shooter.pos);
      if (isPlayer) {
        this.hud.hitmarker(!c.alive, rec.head);
        if (c.alive) this.audio.play(rec.head ? 'headshot' : 'hit', null, { ui: true });
      }
    }
  }

  melee(attacker) {
    const eye = attacker.eyePos(new THREE.Vector3());
    const fwd = attacker.forward(new THREE.Vector3());
    this.audio.play('melee', attacker === this.player ? null : attacker.pos);
    let best = null, bd = MELEE.range;
    for (const c of this.characters) {
      if (!c.alive || c === attacker || (c.team === attacker.team && !this.settings.friendlyFire)) continue;
      c.chestPos(_a).sub(eye);
      const d = _a.length();
      if (d > bd) continue;
      if (_a.normalize().dot(fwd) < 0.7) continue;
      if (this.physics.blocked(eye, c.chestPos(_b))) continue;
      best = c; bd = d;
    }
    if (!best) return;
    const lunge = _a.subVectors(best.pos, attacker.pos).setY(0).normalize();
    attacker.vel.x += lunge.x * 4; attacker.vel.z += lunge.z * 4;
    this.effects.impact(best.chestPos(_b), lunge.negate(), 'blood');
    this.audio.play('meleehit', best.pos);
    const wasAlive = best.alive;
    best.takeDamage(MELEE.damage, attacker, 'melee', false, attacker.pos);
    if (attacker === this.player) {
      this.hud.hitmarker(wasAlive && !best.alive, false);
      this.input.rumble(0.6, 0.4, 150);
      this.playerCtl.addShake(0.4);
    }
  }

  throwGrenade(c, target) {
    const origin = c.eyePos(new THREE.Vector3());
    const f = c.forward(_d);
    origin.addScaledVector(f, 0.5);
    let vel;
    if (target) {
      const dx = target.x - origin.x, dz = target.z - origin.z, dy = target.y + 0.3 - origin.y;
      const dist = Math.hypot(dx, dz);
      const T = Math.max(0.5, Math.min(1.4, dist / 14));
      vel = new THREE.Vector3(dx / T, (dy + 0.5 * GRAV * T * T) / T, dz / T);
    } else {
      vel = f.clone().multiplyScalar(GRENADE.throwSpeed).add(new THREE.Vector3(0, 3, 0)).addScaledVector(c.vel, 0.5);
    }
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({ pos: origin, vel, fuse: GRENADE.fuse, owner: c, mesh });
    this.audio.play('pin', c === this.player ? null : c.pos);
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      for (let s = 0; s < 2; s++) {
        const h = dt / 2;
        g.vel.y -= GRAV * h;
        if (this.physics.movePoint(g.pos, g.vel, h, 0.07)) this.audio.play('bounce', g.pos);
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.vel.length() * dt * 3;
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.explode(g);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  explode(g) {
    const pos = g.pos;
    this.effects.explosion(pos);
    this.audio.play('explosion', pos);
    const src = _a.copy(pos); src.y += 0.25;
    for (const c of this.characters) {
      if (!c.alive) continue;
      const cp = c.chestPos(new THREE.Vector3());
      const d = cp.distanceTo(pos);
      if (d > GRENADE.radius) continue;
      if (this.physics.blocked(src, cp) && this.physics.blocked(src, c.headPos(_b))) continue;
      const dmg = GRENADE.damage * Math.pow(1 - d / GRENADE.radius, 1.3) + 5;
      const wasAlive = c.alive;
      const before = c.health;
      c.takeDamage(dmg, g.owner, 'grenade', false, pos);
      if (g.owner === this.player && c !== this.player && c.health < before) this.hud.hitmarker(wasAlive && !c.alive, false);
    }
    if (this.player && this.player.alive) {
      const d = this.player.pos.distanceTo(pos);
      if (d < 20) {
        this.playerCtl.addShake((1 - d / 20) * 1.4);
        this.input.rumble(1 - d / 20, 0.8, 400);
      }
    }
  }

  onDamaged(victim, attacker, amount, headshot, fromPos) {
    if (victim === this.player) {
      if (attacker !== this.player && fromPos) this.hud.damageFrom(fromPos);
      this.audio.play('hurt', null, { ui: true });
      this.playerCtl.addShake(0.22);
      this.input.rumble(0.55, 0.3, 160);
    } else if (victim.isBot) {
      this.brains.get(victim)?.onDamaged(attacker);
    }
  }

  onKill(killer, victim, weaponId, headshot) {
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.respawnT = PLAYER.respawnDelay;
    victim.deathT = this.time;
    victim.deathDir = Math.random() < 0.5 ? 1 : -1;
    victim.killer = killer;
    victim.vel.set(0, 0, 0);
    victim.adsT = 0;
    victim.slideT = 0;

    const enemyKill = killer && killer !== victim && killer.team !== victim.team;
    if (enemyKill) {
      killer.kills++;
      killer.streak++;
      const bonus = (headshot ? SCORE.headshot : 0) + (weaponId === 'melee' ? SCORE.melee : 0);
      killer.score += SCORE.kill + bonus;
      this.scores[killer.team]++;
      if (killer === this.player) {
        this.audio.play('kill', null, { ui: true });
        this.input.rumble(0.3, 0.6, 120);
        this.hud.scoreEvent('KILL', SCORE.kill);
        if (headshot) this.hud.scoreEvent('HEADSHOT', SCORE.headshot);
        if (weaponId === 'melee') this.hud.scoreEvent('MELEE', SCORE.melee);
        if (victim === this.lastKiller) { this.hud.scoreEvent('PAYBACK', 0); this.lastKiller = null; }
        this.multi = this.time - this.lastKillT < 4 ? this.multi + 1 : 1;
        this.lastKillT = this.time;
        const mk = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'FURY KILL' }[this.multi] || (this.multi >= 5 ? 'FRENZY KILL' : null);
        if (mk) this.hud.medal(mk);
        const st = { 3: 'KILLSTREAK', 5: 'KILLING SPREE', 10: 'RAMPAGE', 15: 'UNSTOPPABLE', 20: 'LEGENDARY' }[killer.streak];
        if (st) this.hud.medal(st, `${killer.streak} KILLS`);
      }
    } else if (killer && killer !== victim && killer.team === victim.team) {
      killer.score = Math.max(0, killer.score - SCORE.kill);
    } else {
      victim.score = Math.max(0, victim.score - 50);
    }

    for (const [c, rec] of victim.damagers) {
      if (c === killer || c.team === victim.team || this.time - rec.t > 10 || rec.dmg < 20) continue;
      c.assists++;
      c.score += SCORE.assist;
      if (c === this.player) this.hud.scoreEvent('ASSIST', SCORE.assist);
    }
    victim.damagers.clear();
    this.hud.killfeed(killer, victim, weaponId, headshot);

    if (victim === this.player) {
      this.lastKiller = killer && killer !== victim ? killer : null;
      this.hud.showDeath(killer, weaponId);
      this.input.rumble(0.9, 0.5, 350);
    }
    if (Math.random() < 0.5) this.dropAmmo(victim.pos);
    if (enemyKill && this.scores[killer.team] >= this.settings.scoreLimit && this.endT <= 0) {
      this.endT = 1.4;
      this.hud.medal(killer.team === this.player.team ? 'VICTORY' : 'DEFEAT', 'SCORE LIMIT REACHED');
    }
  }

  respawn(c) {
    const p = this.chooseSpawn(c.team);
    c.spawn(p, this.world.spawnYaw[c.team]);
    if (c.isBot) this.brains.get(c).reset();
    if (c === this.player) {
      this.hud.hideDeath();
      this.audio.play('spawn', null, { ui: true });
      this.playerCtl.lastFov = 0;
      this.playerCtl.recoilDebt = 0;
      this.playerCtl.crouchToggle = false;
    }
  }

  chooseSpawn(team) {
    let best = null, bestScore = -Infinity;
    for (const s of this.world.spawns[team]) {
      let minEnemy = 60, crowd = false, seen = false;
      for (const c of this.characters) {
        if (!c.alive) continue;
        const d = Math.hypot(c.pos.x - s.x, c.pos.z - s.z);
        if (d < 1.5) crowd = true;
        if (c.team !== team) {
          minEnemy = Math.min(minEnemy, d);
          if (d < 40 && !seen && !this.physics.blocked(c.eyePos(_a), _b.set(s.x, 1.5, s.z))) seen = true;
        }
      }
      const score = minEnemy - (crowd ? 100 : 0) - (seen ? 25 : 0) + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  reportIntel(team, pos) {
    const i = this.intel[team];
    i.pos.copy(pos);
    i.time = this.time;
  }

  // ---------- pickups ----------
  makePickupMesh(type, small = false) {
    const g = new THREE.Group();
    const s = small ? 0.75 : 1;
    if (type === 'health') {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 0.26 * s, 0.3 * s), new THREE.MeshStandardMaterial({ color: 0x4f5a3c, roughness: 0.9 }));
      const patch = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 });
      const red = new THREE.MeshStandardMaterial({ color: 0xc02020, emissive: 0x801010, emissiveIntensity: 0.4 });
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.18 * s, 0.01), patch);
      p.position.z = 0.151 * s;
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.035 * s, 0.012), red);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.035 * s, 0.12 * s, 0.012), red);
      a.position.z = b.position.z = 0.157 * s;
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.03 * s, 0.32 * s), new THREE.MeshStandardMaterial({ color: 0x23251f }));
      g.add(bag, p, a, b, strap);
    } else {
      const can = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.24 * s, 0.18 * s), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.55, metalness: 0.4 }));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 0.03 * s, 0.2 * s), new THREE.MeshStandardMaterial({ color: 0x3a4029, roughness: 0.5, metalness: 0.5 }));
      lid.position.y = 0.13 * s;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.025 * s, 0.03 * s), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.4 }));
      handle.position.y = 0.16 * s;
      const stencil = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.04 * s, 0.002), new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.8 }));
      stencil.position.set(0, 0, 0.091 * s);
      g.add(can, lid, handle, stencil);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42 * s, 0.48 * s, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(type === 'health' ? 2.2 : 2.0, type === 'health' ? 2.2 : 1.6, type === 'health' ? 2.2 : 0.6), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const root = new THREE.Group();
    root.add(g);
    root.add(ring);
    root.userData.spin = g;
    root.userData.ring = ring;
    return root;
  }

  buildPickups() {
    for (const spot of PICKUP_SPOTS) {
      const mesh = this.makePickupMesh(spot.type);
      const pos = new THREE.Vector3(...spot.pos);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.pickups.push({ type: spot.type, pos, mesh, active: true, timer: 0, dynamic: false });
    }
  }

  dropAmmo(pos) {
    const mesh = this.makePickupMesh('ammo', true);
    const p = new THREE.Vector3(pos.x, pos.y, pos.z);
    mesh.position.copy(p);
    this.scene.add(mesh);
    this.pickups.push({ type: 'ammo', pos: p, mesh, active: true, timer: 0, dynamic: true, life: 15, small: true });
  }

  nearestPickup(type, pos, groundOnly) {
    let best = null, bd = Infinity;
    for (const p of this.pickups) {
      if (!p.active || p.type !== type || (groundOnly && p.pos.y > 0.5)) continue;
      const d = p.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.dynamic) {
        p.life -= dt;
        if (p.life <= 0 || !p.active) { this.scene.remove(p.mesh); this.pickups.splice(i, 1); continue; }
      }
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) { p.active = true; p.mesh.visible = true; }
        continue;
      }
      const spin = p.mesh.userData.spin;
      spin.rotation.y += dt * 1.2;
      spin.position.y = 0.4 + Math.sin(this.time * 2.2 + i) * 0.05;
      p.mesh.userData.ring.material.opacity = 0.35 + Math.sin(this.time * 3 + i) * 0.2;
      for (const c of this.characters) {
        if (!c.alive) continue;
        if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > 1.1 || Math.abs(c.pos.y - p.pos.y) > 1.2) continue;
        let used = false;
        if (p.type === 'health' && c.health < PLAYER.maxHealth) {
          c.health = Math.min(PLAYER.maxHealth, c.health + 50);
          used = true;
        } else if (p.type === 'ammo') {
          for (const w of c.weapons) {
            if (w.reserve < w.def.reserve) { w.reserve = Math.min(w.def.reserve, w.reserve + w.def.mag * (p.small ? 1 : 2)); used = true; }
          }
          if (c.grenades < GRENADE.max) { c.grenades++; used = true; }
        }
        if (used) {
          p.active = false;
          p.mesh.visible = false;
          p.timer = 20;
          if (c === this.player) {
            this.audio.play('pickup', null, { ui: true });
            this.hud.message(p.type === 'health' ? '+50 HEALTH' : 'AMMO RESUPPLIED');
          }
          break;
        }
      }
    }
  }
}

export { TEAMS };
