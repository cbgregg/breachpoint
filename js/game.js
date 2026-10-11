// Match orchestration: rendering, combat resolution, spawning, scoring, pickups, grenades
import * as THREE from 'three';
import { TEAMS, PLAYER, GRENADE, SCORE, WEAPONS, BOT_NAMES } from './config.js';
import { Physics, rayBox } from './physics.js';
import { buildWorld, PICKUP_SPOTS } from './world.js';
import { Character } from './character.js';
import { BotBrain } from './bot.js';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { applySpread } from './weapons.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _end = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const GRAV = 20;
const rand = (a, b) => a + Math.random() * (b - a);

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
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 600);
    this.scene.add(this.camera);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xdde8ff, 0x50483a, 2.2));
    const vmSun = new THREE.DirectionalLight(0xffffff, 2.2);
    vmSun.position.set(1, 2, 1);
    const vmFill = new THREE.DirectionalLight(0xbfd4ff, 0.8);
    vmFill.position.set(-1, 0.5, 2);
    this.vmScene.add(vmFill);
    this.vmScene.add(vmSun);

    this.physics = new Physics();
    this.world = buildWorld(this.scene, this.physics);
    this.effects = new Effects(this.scene);
    this.audio = new GameAudio();
    this.input = new Input(renderer.domElement);
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
    this.onEnd = null;
    this.onPause = null;
    this.buildPickups();

    this.grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
    this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.6, metalness: 0.3 });

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.input.isTouch && !this.input.fallback) this.pause();
    };
    window.addEventListener('resize', () => this.resize());
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
  }

  get frozen() { return this.countdownT > 0; }

  // ---------- match lifecycle ----------
  startMatch(settings) {
    this.settings = { ...settings };
    for (const c of this.characters) c.dispose();
    if (this.playerCtl) this.vmScene.remove(this.playerCtl.vmRoot);
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    this.pickups = this.pickups.filter(p => { if (p.dynamic) this.scene.remove(p.mesh); return !p.dynamic; });
    for (const p of this.pickups) { p.active = true; p.mesh.visible = true; p.timer = 0; }
    this.effects.clear();
    this.brains.clear();

    const N = Math.max(1, Math.min(8, settings.teamSize | 0));
    this.player = new Character(this, { name: settings.name || 'Player', team: 0, isBot: false, primary: settings.primary });
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

    for (const t of [0, 1]) {
      const spots = shuffle([...this.world.spawns[t]]);
      this.characters.filter(c => c.team === t).forEach((c, i) => c.spawn(spots[i % spots.length], this.world.spawnYaw[t]));
    }
    for (const [b, brain] of this.brains) brain.reset();

    this.countdownT = 3;
    this.lastBeep = 4;
    this.state = 'playing';
    this.hud.reset();
    this.hud.show(true);
    this.audio.init();
    this.audio.setVolume(settings.volume);
    this.input.reset();
    this.input.enabled = true;
    this.input.lock();
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
    this.input.lock();
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
  }

  endMatch() {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.input.enabled = false;
    this.input.reset();
    this.input.unlock();
    this.hud.show(false);
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
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu' || this.state === 'ended') this.menuCamera(dt);
    if (this.state !== 'paused') this.effects.update(dt);
    this.render();
    this.input.endFrame();
  }

  menuCamera(dt) {
    this.menuT += dt * 0.06;
    const r = 36;
    this.camera.position.set(Math.cos(this.menuT) * r, 26, Math.sin(this.menuT) * r * 0.75);
    this.camera.lookAt(0, 0, 0);
    if (this.camera.fov !== 70) { this.camera.fov = 70; this.camera.updateProjectionMatrix(); }
    for (const c of this.characters) c.updateModel(dt, false);
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'paused') && this.player && this.player.alive && this.playerCtl.vmRoot.visible) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }

  update(dt) {
    this.time += dt;
    const inp = this.input;
    if (inp.consume('Escape') || inp.consume('KeyP')) { this.pause(); return; }

    if (this.countdownT > 0) {
      this.countdownT -= dt;
      const n = Math.ceil(this.countdownT);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        if (n > 0) this.audio.play('beep', null, { ui: true, freq: 520 });
        else { this.audio.play('beep', null, { ui: true, freq: 1040 }); this.hud.message('FIGHT!', 'big'); }
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

  // ray vs a character's head/body boxes; returns {t, head}
  rayCharacter(o, d, c, maxT) {
    const hx = c.pos.x, hy = c.pos.y + c.height - 0.16, hz = c.pos.z;
    let t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, hx - 0.17, hy - 0.17, hz - 0.17, hx + 0.17, hy + 0.17, hz + 0.17, maxT);
    let head = t < maxT;
    const tb = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, c.pos.x - 0.3, c.pos.y, c.pos.z - 0.3, c.pos.x + 0.3, c.pos.y + c.height - 0.32, c.pos.z + 0.3, Math.min(maxT, t));
    if (tb < Math.min(maxT, t)) { t = tb; head = false; }
    return { t, head };
  }

  // ---------- combat ----------
  shoot(shooter, def, origin, dir, spread) {
    const ff = this.settings.friendlyFire;
    const muzzle = shooter === this.player ? this.playerCtl.muzzleWorld(_m) : shooter.muzzleWorld(_m);
    this.audio.play('shot', shooter === this.player ? null : shooter.pos, { weapon: def.id });
    this.effects.muzzle(muzzle, dir);
    this.reportIntel(1 - shooter.team, shooter.pos);
    const hits = new Map();
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
      if (p === 0 || p % 3 === 0) this.effects.tracer(muzzle, _end);
      if (hitC) {
        const fall = best <= def.falloffStart ? 1 : best >= def.falloffEnd ? def.falloffMin
          : 1 - (1 - def.falloffMin) * (best - def.falloffStart) / (def.falloffEnd - def.falloffStart);
        const dmg = def.damage * (head ? def.headMult : 1) * fall;
        const rec = hits.get(hitC) || { dmg: 0, head: false };
        rec.dmg += dmg; rec.head = rec.head || head;
        hits.set(hitC, rec);
        this.effects.impact(_end, _b.copy(_d).negate(), 'blood');
      } else if (w) {
        this.effects.impact(w.point, w.normal, 'world');
        if (p === 0) this.audio.play('impact', w.point);
      }
    }
    for (const [c, rec] of hits) {
      if (c.spawnProtect > 0) continue;
      c.takeDamage(rec.dmg, shooter, def.id, rec.head, shooter.pos);
      if (shooter === this.player) {
        this.hud.hitmarker(!c.alive, rec.head);
        this.audio.play(rec.head ? 'headshot' : 'hit', null, { ui: true });
      }
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
    this.audio.play('pin', c.pos);
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      for (let s = 0; s < 2; s++) {
        const h = dt / 2;
        g.vel.y -= GRAV * h;
        if (this.physics.movePoint(g.pos, g.vel, h, 0.09)) this.audio.play('bounce', g.pos);
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.vel.length() * dt * 2;
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
      if (d < 18) this.playerCtl.addShake((1 - d / 18) * 1.2);
    }
  }

  onDamaged(victim, attacker, amount, headshot, fromPos) {
    if (victim === this.player) {
      if (attacker !== this.player && fromPos) this.hud.damageFrom(fromPos);
      this.audio.play('hurt', null, { ui: true });
      this.playerCtl.addShake(0.25);
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
    victim.killer = killer;
    victim.vel.set(0, 0, 0);
    victim.adsT = 0;

    const enemyKill = killer && killer !== victim && killer.team !== victim.team;
    if (enemyKill) {
      killer.kills++;
      killer.streak++;
      const pts = SCORE.kill + (headshot ? SCORE.headshot : 0);
      killer.score += pts;
      this.scores[killer.team]++;
      if (killer === this.player) {
        this.audio.play('kill', null, { ui: true });
        this.hud.message(`+${pts}  ${headshot ? 'HEADSHOT' : 'ELIMINATED'} ${victim.name}`, headshot ? 'gold' : '');
        this.multi = this.time - this.lastKillT < 3.5 ? this.multi + 1 : 1;
        this.lastKillT = this.time;
        const mk = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL' }[this.multi] || (this.multi >= 5 ? 'UNSTOPPABLE' : null);
        if (mk) this.hud.message(mk, 'big');
        const st = { 5: 'KILLING SPREE', 10: 'RAMPAGE', 15: 'GODLIKE', 20: 'LEGENDARY' }[killer.streak];
        if (st) this.hud.message(`${st}  ×${killer.streak}`, 'big');
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
      if (c === this.player) this.hud.message(`+${SCORE.assist}  ASSIST`, 'dim');
    }
    victim.damagers.clear();
    this.hud.killfeed(killer, victim, weaponId, headshot);

    if (victim === this.player) {
      this.hud.showDeath(killer, weaponId);
    }
    if (Math.random() < 0.5) this.dropAmmo(victim.pos);
    if (enemyKill && this.scores[killer.team] >= this.settings.scoreLimit && this.endT <= 0) {
      this.endT = 1.2;
      this.hud.message(`${TEAMS[killer.team].label.toUpperCase()} WINS`, 'big');
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
    const s = small ? 0.7 : 1;
    if (type === 'health') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.35 * s, 0.5 * s), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
      g.add(base);
      const red = new THREE.MeshStandardMaterial({ color: 0xe02424, emissive: 0xe02424, emissiveIntensity: 0.6 });
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.1 * s, 0.52 * s), red);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.36 * s, 0.52 * s), red);
      g.add(a, b);
    } else {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.32 * s, 0.38 * s), new THREE.MeshStandardMaterial({ color: 0x4a5a33, roughness: 0.7 }));
      g.add(base);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.07 * s, 0.4 * s), new THREE.MeshStandardMaterial({ color: 0xf0c020, emissive: 0xf0c020, emissiveIntensity: 0.5 }));
      g.add(stripe);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45 * s, 0.6 * s, 24),
      new THREE.MeshBasicMaterial({ color: type === 'health' ? 0xff5050 : 0xf0c020, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
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
      spin.rotation.y += dt * 1.8;
      spin.position.y = 0.45 + Math.sin(this.time * 2.5 + i) * 0.08;
      p.mesh.userData.ring.material.opacity = 0.35 + Math.sin(this.time * 4 + i) * 0.2;
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
            this.hud.message(p.type === 'health' ? '+50 HEALTH' : '+AMMO', 'dim');
          }
          break;
        }
      }
    }
  }
}
