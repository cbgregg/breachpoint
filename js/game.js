// Match orchestration: scene + renderer, combat resolution, spawning, scoring, pickups, grenades, melee
import * as THREE from 'three';
import { TEAMS, PLAYER, GRENADE, SCORE, MELEE, BOT_NAMES, WEAPONS } from './config.js';
const WEAPON_IDS = Object.keys(WEAPONS);
import { Physics, rayBox } from './physics.js';
import { buildWorld, renderMinimap, MAPS, MAP_IDS } from './world.js';
import { Character, setCharacterDetail } from './character.js';
import { BotBrain } from './bot.js';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { applySpread } from './weapons.js';
import { Renderer, SUN_DIR } from './render.js';
import { HostSession, GuestSession } from './online.js';
import { Music } from './music.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _end = new THREE.Vector3(), _r = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1.3);
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
    // a wider viewmodel FOV on phones makes the gun and optic take up less of the small screen
    this.vmCamera = new THREE.PerspectiveCamera(window.matchMedia('(pointer: coarse)').matches ? 72 : 66, window.innerWidth / window.innerHeight, 0.01, 10);
    this.renderer = new Renderer(container, this.scene, this.camera, this.vmScene, this.vmCamera);
    this.vmScene.environment = this.scene.environment;
    this.vmScene.add(new THREE.HemisphereLight(0xc8d4e4, 0x4a4034, 0.6));
    this.vmSun = new THREE.DirectionalLight(0xffe2bd, 2.6);
    this.vmScene.add(this.vmSun);

    this.physics = new Physics();
    this.world = buildWorld(this.scene, this.physics, 'tarsa');
    setCharacterDetail(this.world.textures.fabric);
    this.minimap = renderMinimap(this.renderer.renderer, this.scene);
    this.effects = new Effects(this.scene, this.physics);
    this.audio = new GameAudio();
    this.music = new Music(this.audio);
    this.audio.onVolume = () => this.music.apply();
    this.effects.onCasing = (p) => this.audio.play('casing', p);
    this.input = new Input(this.renderer.renderer.domElement);
    this.hud = new HUD(this);

    this.settings = null;
    this.state = 'menu';
    this.mode = 'local';   // 'local' (bots) | 'host' | 'guest'
    this.session = null;
    this.lobby = null;
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
    // browsers stop animation frames in background tabs; a host must keep simulating for everyone
    setInterval(() => {
      if (this.mode === 'host' && this.live && performance.now() - this.last > 120) this.frame(true);
    }, 50);
  }

  get frozen() { return this.countdownT > 0; }
  // the match keeps running under the pause menu when playing online
  get live() { return this.state === 'playing' || (this.state === 'paused' && this.mode !== 'local'); }

  applySettings(s) {
    if (s.quality !== this.appliedQuality) { this.appliedQuality = s.quality; this.renderer.applyQuality(s.quality); }
    this.audio.setVolume(s.volume);
    this.music.setVolume(s.musicVolume ?? 0.5);
    this.input.deadzone = s.padDeadzone;
    const adsMode = this.input.isTouch ? (s.touchAds || 'toggle') : (s.adsMode || 'hold');
    if (this.input.adsMode !== adsMode) { this.input.adsMode = adsMode; this.input.clearAds(); }
    this.input.vibration = s.vibration;
  }

  // ---------- match lifecycle ----------
  // online: { mode: 'host', lobby } or { mode: 'guest', lobby, start }
  startMatch(settings, online = null) {
    this.settings = { ...settings };
    if (online && online.mode === 'guest') {
      const cfg = online.start.cfg || {};
      this.settings.timeLimit = +cfg.timeLimit || 10;
      this.settings.scoreLimit = +cfg.scoreLimit || 75;
      this.settings.friendlyFire = !!cfg.friendlyFire;
      this.settings.map = MAPS[cfg.map] ? cfg.map : 'tarsa';
    }
    // 'random' (or an unknown id) picks one of the maps
    if (!MAPS[this.settings.map]) this.settings.map = MAP_IDS[(Math.random() * MAP_IDS.length) | 0];
    this.applySettings(this.settings);
    if (this.session) this.session.dispose();
    this.session = null;
    this.mode = online ? online.mode : 'local';
    this.lobby = online ? online.lobby : null;
    for (const c of this.characters) c.dispose();
    if (this.playerCtl) this.vmScene.remove(this.playerCtl.vmRoot);
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    this.loadMap(this.settings.map);
    this.pickups = this.pickups.filter(p => { if (p.dynamic) this.scene.remove(p.mesh); return !p.dynamic; });
    for (const p of this.pickups) { p.active = true; p.mesh.visible = true; p.timer = 0; }
    this.effects.clear();
    this.brains.clear();
    this.grenadeSeq = 0;
    this.pickupSeq = 1000;

    if (this.mode === 'guest') return this.startGuest(online.start);

    const N = Math.max(1, Math.min(8, settings.teamSize | 0));
    const myTeam = this.mode === 'host' ? online.lobby.hostTeam : 0;
    this.player = new Character(this, { name: settings.name || 'Operator', team: myTeam, isBot: false, primary: settings.primary });
    this.characters = [this.player];
    if (this.mode === 'host') {
      this.session = new HostSession(this, online.lobby);
      for (const p of online.lobby.players.values()) this.characters.push(this.session.createRemote(p));
    }
    this.botNames = shuffle([...BOT_NAMES]);
    for (let t = 0; t < 2; t++) {
      const humans = this.characters.filter(c => c.team === t).length;
      for (let i = humans; i < N; i++) this.addBot(t);
    }
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
    if (this.session) this.session.startAll();
    this.startMusic();
  }

  startMusic() {
    this.music.setDuck(false);
    this.music.setIntensity(0.35);
    this.music.intensity = 0.35;
    this.music.play('action');
  }

  startGuest(start) {
    this.session = new GuestSession(this, this.lobby);
    this.characters = [];
    for (const e of Array.isArray(start.ro) ? start.ro : []) {
      if (e[0] === start.you) {
        const [id, name, team, primary] = e;
        this.player = new Character(this, { id, name: String(name).slice(0, 16), team: team === 1 ? 1 : 0, isBot: false, primary: WEAPON_IDS.includes(primary) ? primary : 'rifle' });
        this.characters.push(this.player);
      } else this.session.addPuppet(e);
    }
    if (!this.player) throw new Error('bad start message');
    this.playerCtl = new PlayerController(this, this.player);
    const sp = Array.isArray(start.sp) && start.sp.length === 4 && start.sp.every(Number.isFinite) ? start.sp : [0, 0, 0, 0];
    this.player.spawn(new THREE.Vector3(sp[0], sp[1], sp[2]), sp[3]);
    this.scores = Array.isArray(start.sc) ? [start.sc[0] | 0, start.sc[1] | 0] : [0, 0];
    this.time = Number.isFinite(start.tm) ? start.tm : 0;
    this.timeLeft = Number.isFinite(start.tl) ? start.tl : this.settings.timeLimit * 60;
    this.countdownT = Number.isFinite(start.cd) ? start.cd : 0;
    this.lastBeep = Math.ceil(this.countdownT) || 4;
    this.intel.forEach(i => { i.time = -99; });
    this.endT = 0;
    this.damageFx = 0;
    this.state = 'playing';
    this.hud.reset();
    this.hud.show(true);
    this.audio.init();
    this.audio.setVolume(this.settings.volume);
    this.input.reset();
    this.input.enabled = true;
    // the host started the match, so there may be no click to grant pointer lock with
    if (this.input.lastDevice !== 'pad' && !this.input.isTouch) {
      if (navigator.userActivation && navigator.userActivation.isActive) this.input.lock();
      else this.hud.message('CLICK TO JOIN THE FIGHT');
    }
    this.startMusic();
  }

  addBot(team) {
    if (!this.botNames || !this.botNames.length) this.botNames = shuffle([...BOT_NAMES]);
    const b = new Character(this, { name: this.botNames.pop(), team, isBot: true, primary: pickBotWeapon() });
    this.characters.push(b);
    const brain = new BotBrain(b, this);
    this.brains.set(b, brain);
    if (this.state === 'playing' || this.state === 'paused') {
      b.spawn(this.chooseSpawn(team), this.world.spawnYaw[team]);
      brain.reset();
    }
    return b;
  }

  removeCharacter(c) {
    c.dispose();
    this.brains.delete(c);
    this.characters = this.characters.filter(x => x !== c);
    for (const x of this.characters) { if (x.killer === c) x.killer = null; if (x.lastKiller === c) x.lastKiller = null; x.damagers.delete(c); }
    for (const g of this.grenades) if (g.owner === c) g.owner = null;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.clearAds();
    this.music.setDuck(true);
    if (this.playerCtl) this.playerCtl.triggerLatch = false;
    this.input.reset();
    this.input.enabled = false;
    this.input.unlock();
    if (this.onPause) this.onPause(true);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.music.setDuck(false);
    this.input.reset();
    this.input.enabled = true;
    if (this.input.lastDevice !== 'pad') this.input.lock();
    this.audio.init();
    if (this.onPause) this.onPause(false);
  }

  quitToMenu() {
    if (this.session) { if (this.session.leave) this.session.leave(); this.session.dispose(); }
    this.session = null;
    this.mode = 'local';
    this.state = 'menu';
    this.music.setDuck(false);
    this.music.play('menu');
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
    if (!this.live) return;
    this.state = 'ended';
    this.input.enabled = false;
    this.input.reset();
    this.input.unlock();
    this.hud.show(false);
    this.renderer.grade.damage.value = 0;
    this.audio.play('horn', null, { ui: true });
    const winner = this.scores[0] > this.scores[1] ? 0 : this.scores[1] > this.scores[0] ? 1 : -1;
    const sorted = [...this.characters].sort((a, b) => b.score - a.score);
    this.music.setDuck(false);
    this.music.sting(winner === this.player.team);
    const result = { winner, scores: [...this.scores], players: sorted, mvp: sorted[0], playerTeam: this.player.team, mode: this.mode };
    if (this.mode === 'host' && this.session) this.session.sendEnd(result);
    if (this.onEnd) this.onEnd(result);
  }

  // ---------- frame ----------
  frame(background = false) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (background) { this.update(dt); this.input.endFrame(); return; }
    this.input.poll(dt);
    if (this.live) this.update(dt);
    else if (this.state === 'menu' || this.state === 'ended') this.menuCamera(dt);
    if (this.state !== 'paused' || this.mode !== 'local') this.effects.update(dt);
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
    const guest = this.mode === 'guest';
    if (this.state === 'playing' && inp.action('pause')) { this.pause(); if (this.mode === 'local') return; }

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
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0 && !guest) { this.endMatch(); return; }
    }
    if (this.endT > 0 && !guest) { this.endT -= dt; if (this.endT <= 0) { this.endMatch(); return; } }

    this.playerCtl.update(dt);
    if (guest) {
      // the host simulates everyone; we predict ourselves and interpolate the rest
      this.player.updateCommon(dt);
      this.session.update(dt);
      if (this.state === 'ended' || !this.player) return;
    } else {
      if (this.session) this.session.processInputs(dt);
      for (const c of this.characters) {
        if (c.isBot && c.alive) {
          if (this.frozen) c.updateMovement(dt, ZERO, false, false);
          else this.brains.get(c).update(dt);
        }
        c.updateCommon(dt);
        if (!c.alive && this.live) {
          c.respawnT -= dt;
          if (c.respawnT <= 0) this.respawn(c);
        }
      }
      if (this.session) this.session.update(dt);
    }

    this.updateAimTarget();
    this.camera.updateMatrixWorld();
    _pm.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    for (const c of this.characters) {
      if (c === this.player) continue;
      if (c.hidden) { if (c.model) c.model.root.visible = false; continue; }
      _sph.center.set(c.pos.x, c.pos.y + 0.9, c.pos.z);
      const dist = _sph.center.distanceTo(this.camera.position);
      const lod = !_frustum.intersectsSphere(_sph) && dist > 3 ? 0 : dist > 32 ? 2 : 1;
      c.updateModel(dt, c.team === this.player.team || c === this.aimTarget, lod);
    }
    this.updateGrenades(dt);
    this.updatePickups(dt);
    // score intensity: recent fighting, the last minute, or a close finish
    {
      const p = this.player, t = this.time;
      const fight = p.alive && (t - p.lastFireT < 4 || t - p.lastDamageT < 5) ? 0.4 : 0;
      const lim = this.settings.scoreLimit || 75;
      const finale = this.timeLeft < 60 || Math.max(...this.scores) >= lim - 5 ? 0.5 : 0;
      this.music.setIntensity(0.35 + fight + finale);
    }
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
      if (!c.alive || c === p || c.hidden) continue;
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

  // ---------- networking hooks ----------
  // Everything that should reach a specific player goes through notify(); in host mode the
  // session forwards it to remote players. emit() broadcasts world events to every guest.
  notify(c, type, ...args) {
    if (!c) return;
    if (c === this.player) this.localNotify(type, ...args);
    else if (c.remote && this.session) this.session.personal(c, [type, ...args]);
  }
  emit(ev) { if (this.session && this.session.broadcast) this.session.broadcast(ev); }

  localNotify(type, ...a) {
    const hud = this.hud, inp = this.input, ctl = this.playerCtl;
    switch (type) {
      case 'hit': hud.hitmarker(a[0], a[1]); if (!a[0]) this.audio.play(a[1] ? 'headshot' : 'hit', null, { ui: true }); if (a[2]) { inp.rumble(0.6, 0.4, 150); ctl && ctl.addShake(0.4); } break;
      case 'dmg': if (a[0] !== null) hud.damageFrom({ x: a[0], z: a[1] }); this.audio.play('hurt', null, { ui: true }); ctl && ctl.addShake(0.22); inp.rumble(0.55, 0.3, 160); break;
      case 'kill': this.audio.play('kill', null, { ui: true }); inp.rumble(0.3, 0.6, 120); break;
      case 'score': hud.scoreEvent(a[0], a[1]); break;
      case 'medal': hud.medal(a[0], a[1]); break;
      case 'death': {
        inp.clearAds();
        const killer = this.charById ? this.charById(a[0]) : null;
        if (this.player) this.player.killer = killer;
        hud.showDeath(killer, a[1]); inp.rumble(0.9, 0.5, 350); break;
      }
      case 'spawn': inp.clearAds(); hud.hideDeath(); this.audio.play('spawn', null, { ui: true }); if (ctl) { ctl.lastFov = 0; ctl.recoilDebt = 0; ctl.crouchToggle = false; } break;
      case 'pickup': this.audio.play('pickup', null, { ui: true }); hud.message(a[0] === 'health' ? '+50 HEALTH' : 'AMMO RESUPPLIED'); break;
      case 'msg': hud.message(a[0]); break;
      default: break;
    }
  }

  charById(id) { return this.characters.find(c => c.id === id) || null; }

  // ---------- combat ----------
  shoot(shooter, def, origin, dir, spread) {
    const ff = this.settings.friendlyFire;
    const isPlayer = shooter === this.player;
    const muzzle = isPlayer ? this.playerCtl.muzzleWorld(_m) : shooter.muzzleWorld(_m);
    this.audio.play('shot', isPlayer ? null : shooter.pos, { weapon: def.id });
    this.effects.muzzle(muzzle, dir, def.id === 'shotgun' || def.id === 'sniper');
    const ej = isPlayer ? this.playerCtl.ejectWorld(_a) : shooter.ejectWorld(_a);
    _r.set(Math.cos(shooter.yaw), 0, -Math.sin(shooter.yaw));
    if (def.id !== 'sniper' && def.id !== 'shotgun') this.effects.casing(ej, dir, _r);
    const cosmetic = this.mode === 'guest'; // guests draw their own shot instantly; the host decides what it hit
    if (!cosmetic) this.reportIntel(1 - shooter.team, shooter.pos);
    const rewound = this.session && shooter.remote ? this.session.rewind(shooter) : null;
    const hits = new Map();
    const ends = [];
    let whizzed = false;
    for (let p = 0; p < def.pellets; p++) {
      applySpread(dir, spread, _d);
      let best = def.range, hitC = null, head = false;
      const w = this.physics.raycast(origin, _d, def.range);
      if (w) best = w.t;
      for (const c of this.characters) {
        if (!c.alive || c === shooter || c.hidden || (c.team === shooter.team && !ff)) continue;
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
      if (!isPlayer && !cosmetic && !whizzed && hitC !== this.player && this.player.alive && shooter.team !== this.player.team) {
        this.player.headPos(_b).sub(origin);
        const al = _b.dot(_d);
        if (al > 2 && al < best && _b.lengthSq() - al * al < 2.2) { whizzed = true; this.audio.play('whiz', null, { ui: true }); }
      }
      let kind;
      if (hitC && cosmetic) {
        kind = 0; // wait for the host's hitmarker
      } else if (hitC) {
        const fall = best <= def.falloffStart ? 1 : best >= def.falloffEnd ? def.falloffMin
          : 1 - (1 - def.falloffMin) * (best - def.falloffStart) / (def.falloffEnd - def.falloffStart);
        const dmg = def.damage * (head ? def.headMult : 1) * fall;
        const rec = hits.get(hitC) || { dmg: 0, head: false };
        rec.dmg += dmg; rec.head = rec.head || head;
        hits.set(hitC, rec);
        this.effects.impact(_end, _b.copy(_d).negate(), 'blood');
        kind = 'b';
      } else if (w) {
        this.effects.impact(w.point, w.normal, w.box.surface);
        if (p === 0) this.audio.play('impact', w.point);
        kind = [w.box.surface || 'concrete', +w.normal.x.toFixed(2), +w.normal.y.toFixed(2), +w.normal.z.toFixed(2)];
      } else kind = 0;
      if (this.session && !cosmetic) ends.push([+_end.x.toFixed(2), +_end.y.toFixed(2), +_end.z.toFixed(2), kind]);
    }
    if (rewound) this.session.restore(rewound);
    if (cosmetic) return;
    this.emit(['shot', shooter.id, def.id, +dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3), ends, +origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2)]);
    for (const [c, rec] of hits) {
      if (c.spawnProtect > 0) continue;
      c.takeDamage(rec.dmg, shooter, def.id, rec.head, shooter.pos);
      this.notify(shooter, 'hit', !c.alive, rec.head);
    }
  }

  melee(attacker) {
    const eye = attacker.eyePos(new THREE.Vector3());
    const fwd = attacker.forward(new THREE.Vector3());
    this.audio.play('melee', attacker === this.player ? null : attacker.pos);
    if (this.mode === 'guest') return;
    this.emit(['melee', attacker.id]);
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
    this.notify(attacker, 'hit', wasAlive && !best.alive, false, true);
  }

  throwGrenade(c, target) {
    if (this.mode === 'guest') return; // the host spawns it and tells us
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
    const id = (this.grenadeSeq = (this.grenadeSeq || 0) + 1);
    this.spawnGrenade(id, origin, vel, c);
    this.emit(['gren', id, +origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2), +vel.x.toFixed(2), +vel.y.toFixed(2), +vel.z.toFixed(2), c.id]);
  }

  spawnGrenade(id, origin, vel, owner) {
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({ id, pos: origin, vel, fuse: GRENADE.fuse, owner, mesh });
    this.audio.play('pin', owner === this.player ? null : owner ? owner.pos : origin);
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
      // guests wait for the host's explosion event (with a safety timeout)
      if (g.fuse <= (this.mode === 'guest' ? -1.5 : 0)) {
        if (this.mode !== 'guest') this.explode(g);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  removeGrenade(id) {
    const i = this.grenades.findIndex(g => g.id === id);
    if (i >= 0) { this.scene.remove(this.grenades[i].mesh); this.grenades.splice(i, 1); }
  }

  explosionFx(pos) {
    this.effects.explosion(pos);
    this.audio.play('explosion', pos);
    if (this.player && this.player.alive) {
      const d = this.player.pos.distanceTo(pos);
      if (d < 20) {
        this.playerCtl.addShake((1 - d / 20) * 1.4);
        this.input.rumble(1 - d / 20, 0.8, 400);
      }
    }
  }

  explode(g) {
    const pos = g.pos;
    this.explosionFx(pos);
    this.emit(['boom', g.id, +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)]);
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
      if (g.owner && c !== g.owner && c.health < before) this.notify(g.owner, 'hit', wasAlive && !c.alive, false);
    }
  }

  onDamaged(victim, attacker, amount, headshot, fromPos) {
    if (victim.isBot) this.brains.get(victim)?.onDamaged(attacker);
    else this.notify(victim, 'dmg', attacker !== victim && fromPos ? +fromPos.x.toFixed(1) : null, fromPos ? +fromPos.z.toFixed(1) : 0);
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
      if (!killer.isBot) {
        this.notify(killer, 'kill');
        this.notify(killer, 'score', 'KILL', SCORE.kill);
        if (headshot) this.notify(killer, 'score', 'HEADSHOT', SCORE.headshot);
        if (weaponId === 'melee') this.notify(killer, 'score', 'MELEE', SCORE.melee);
        if (victim === killer.lastKiller) { this.notify(killer, 'score', 'PAYBACK', 0); killer.lastKiller = null; }
        killer.multi = this.time - (killer.lastKillT ?? -99) < 4 ? (killer.multi || 0) + 1 : 1;
        killer.lastKillT = this.time;
        const mk = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'FURY KILL' }[killer.multi] || (killer.multi >= 5 ? 'FRENZY KILL' : null);
        if (mk) this.notify(killer, 'medal', mk, '');
        const st = { 3: 'KILLSTREAK', 5: 'KILLING SPREE', 10: 'RAMPAGE', 15: 'UNSTOPPABLE', 20: 'LEGENDARY' }[killer.streak];
        if (st) this.notify(killer, 'medal', st, `${killer.streak} KILLS`);
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
      this.notify(c, 'score', 'ASSIST', SCORE.assist);
    }
    victim.damagers.clear();
    this.hud.killfeed(killer, victim, weaponId, headshot);
    this.emit(['kill', killer ? killer.id : -1, victim.id, weaponId, headshot ? 1 : 0]);

    if (!victim.isBot) {
      victim.lastKiller = killer && killer !== victim ? killer : null;
      this.notify(victim, 'death', killer ? killer.id : -1, weaponId);
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
    if (!c.isBot) this.notify(c, 'spawn', +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +c.yaw.toFixed(3));
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

  // swap the map: drop the old geometry, collision and nav grid, then build the new one
  loadMap(id) {
    if (!MAPS[id] || (this.world && this.world.id === id)) return;
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const m of Object.values(this.world.materials)) m.dispose();
      for (const set of Object.values(this.world.textures)) for (const t of Object.values(set)) if (t && t.isTexture && !t.userData.keep) t.dispose();
    }
    this.physics.boxes.length = 0;
    this.world = buildWorld(this.scene, this.physics, id);
    setCharacterDetail(this.world.textures.fabric);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    this.buildPickups();
    this.minimap = renderMinimap(this.renderer.renderer, this.scene);
    this.effects.clear();
    if (this.onMapChange) this.onMapChange(this.world);
  }

  buildPickups() {
    for (const spot of this.world.pickupSpots) {
      const mesh = this.makePickupMesh(spot.type);
      const pos = new THREE.Vector3(...spot.pos);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.pickups.push({ type: spot.type, pos, mesh, active: true, timer: 0, dynamic: false });
    }
  }

  dropAmmo(pos, pid) {
    const mesh = this.makePickupMesh('ammo', true);
    const p = new THREE.Vector3(pos.x, pos.y, pos.z);
    mesh.position.copy(p);
    this.scene.add(mesh);
    if (pid === undefined) pid = ++this.pickupSeq;
    this.pickups.push({ pid, type: 'ammo', pos: p, mesh, active: true, timer: 0, dynamic: true, life: 15, small: true });
    this.emit(['drop', pid, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
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
      if (this.mode === 'guest') continue; // the host decides who picked what up
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
          if (p.dynamic) this.emit(['take', p.pid]);
          if (!c.isBot) this.notify(c, 'pickup', p.type);
          break;
        }
      }
    }
  }
}

export { TEAMS };
