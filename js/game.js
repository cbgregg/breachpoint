// Match orchestration: scene + renderer, combat resolution, spawning, scoring, pickups, grenades, melee
import * as THREE from 'three';
import { TEAMS, PLAYER, GRENADE, SCORE, MELEE, BOT_NAMES, WEAPONS, qualityFrom, EQUIPMENT } from './config.js';
const WEAPON_IDS = Object.keys(WEAPONS);
const _rayHit = { t: 0, head: false };
const _la = new THREE.Vector3(), _lb = new THREE.Vector3(), _lq = new THREE.Quaternion();
import { Physics, rayBox } from './physics.js';
import { Doors } from './doors.js';
import { Breakables } from './breach.js';
import { buildWorld, renderMinimap, MAPS, MAP_IDS, setWorldDetail, worldDetailLow } from './world.js';
import { Character, setCharacterDetail, prewarmGun } from './character.js';
import { hitPower } from './motion.js';
import { loadoutFromSettings, randomLoadout, parseLoadout, weaponDef, soloLoadout } from './attachments.js';
const INF_LOADOUT = soloLoadout('blade');   // Infected: a combat knife in both slots (fire slashes)
import { BotBrain } from './bot.js';
// the five announcers and the twelve operator voices (recorded by tools/gen_voice.py: the same keys there)
export const ANNOUNCERS = ['control', 'sable', 'ghost', 'warden', 'echo'];
export const VOICES = ['sarah', 'harry', 'laura', 'liam', 'allison', 'charlie', 'piper', 'callum', 'hope', 'aiden', 'samantha', 'chris',
  'brian', 'roger', 'eric', 'daniel', 'mark', 'harrison'];
const ANNOUNCE_QUIET = new Set(['double_kill', 'killstreak', 'new_weapon']);
const RADIO_KINDS = new Set(['contact', 'man_down', 'last_alive', 'planting', 'defusing', 'banter']);   // what your squad radios in from afar
const nameHash = (n) => { let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
import { PROPS } from './props.js';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { applySpread, setGunDetail } from './weapons.js';
import { Renderer, SUN_DIR } from './render.js';
import { HostSession, GuestSession } from './online.js';
import { Music } from './music.js';
import { createMode, MODES, GUN_LADDER } from './modes.js';
import { compileGently } from './warm.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _end = new THREE.Vector3(), _r = new THREE.Vector3();
const _gf = new THREE.Vector3(), _gs = new THREE.Vector3(), _gt = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1.3);
const _cullV = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const GRAV = 20;
const AUDIT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('audit');   // map audit on every map load (js/audit.js)

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Bots pick from a small pool of loadouts per weapon (built once, during loading) instead of a brand-new
// random kit every respawn: new kits meant building gun models mid-match, which hitched the frame.
const BOT_POOL = {};
function botLoadout(primary) {
  const pool = BOT_POOL[primary] || (BOT_POOL[primary] = []);
  if (pool.length < 3) {
    const lo = randomLoadout(primary);
    pool.push(lo);
    try { const p = parseLoadout(lo); prewarmGun(weaponDef(p.primary, p.att)); } catch (_) { /* built on first use instead */ }
    return lo;
  }
  return pool[(Math.random() * pool.length) | 0];
}
export function prewarmBotGuns() { for (const id of ['rifle', 'smg', 'shotgun', 'sniper']) for (let i = 0; i < 3; i++) botLoadout(id); }

function pickBotWeapon() {
  const r = Math.random();
  return r < 0.45 ? 'rifle' : r < 0.72 ? 'smg' : r < 0.88 ? 'sniper' : 'shotgun';
}

const INTRO_SECS = 10.6; // 10 on screen once the loading screen fades

// sniper glint: a soft white core with four thin tapering rays on a fully transparent background
let _glint = null;
function glintTex() {
  if (_glint) return _glint;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), h = N / 2;
  const core = g.createRadialGradient(h, h, 0, h, h, h * 0.42);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.18, 'rgba(255,255,255,0.95)'); core.addColorStop(0.45, 'rgba(225,238,255,0.35)'); core.addColorStop(1, 'rgba(200,225,255,0)');
  g.fillStyle = core; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighter';
  for (const [a, len, w] of [[0, 1, 0.055], [Math.PI / 2, 1, 0.055], [Math.PI / 4, 0.42, 0.03], [-Math.PI / 4, 0.42, 0.03]]) {
    g.save(); g.translate(h, h); g.rotate(a);
    const gr = g.createLinearGradient(-h * len, 0, h * len, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-h * len, 0); g.lineTo(0, -h * w); g.lineTo(h * len, 0); g.lineTo(0, h * w); g.closePath(); g.fill();
    g.restore();
  }
  _glint = new THREE.CanvasTexture(c);
  _glint.colorSpace = THREE.SRGBColorSpace;
  _glint.premultiplyAlpha = true;
  return _glint;
}

export class Game {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.16, 2600); // near 0.16: depth precision for distant ground layers (the viewmodel has its own camera)
    this.scene.add(this.camera);
    this.vmScene = new THREE.Scene();
    // a wider viewmodel FOV on phones makes the gun and optic take up less of the small screen
    this.vmCamera = new THREE.PerspectiveCamera(window.matchMedia('(pointer: coarse)').matches ? 72 : 66, window.innerWidth / window.innerHeight, 0.01, 10);
    this.renderer = new Renderer(container, this.scene, this.camera, this.vmScene, this.vmCamera);
    this.vmScene.environment = this.scene.environment;
    this.vmScene.add(new THREE.HemisphereLight(0xb8cff0, 0x6a5a48, 0.95));
    this.vmSun = new THREE.DirectionalLight(0xffe8c8, 2.2);
    this.vmScene.add(this.vmSun);

    this.physics = new Physics();
    this.world = buildWorld(this.scene, this.physics, 'tarsa');
    this.world.game = this;
    setCharacterDetail(this.world.textures.fabric);
    this.fitShadows();
    this.renderer.setLook(this.world.look);
    this.minimap = null;
    this.warmMap();
    this.effects = new Effects(this.scene, this.physics);
    this.audio = new GameAudio();
    this.music = new Music(this.audio);
    this.audio.onVolume = () => this.music.apply();
    this.effects.onCasing = (p) => this.audio.play('casing', p);
    this.input = new Input(this.renderer.renderer.domElement);
    this.hud = new HUD(this);
    this.hud.onAnnounce = (t) => this.announce(t);   // medals and banners get the announcer

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
      if (!locked && this.state === 'playing' && !this.input.isTouch && !this.input.fallback && this.input.lastDevice !== 'pad') {
        // a fullscreen switch can drop pointer lock for a moment: take it back instead of pausing
        if (performance.now() - (this.input.fsT || 0) < 1500) { setTimeout(() => { if (this.state === 'playing' && !this.input.locked) this.input.lock(); }, 50); return; }
        this.pause();
      }
    };
    // The graphics driver can reset (a GPU crash, a driver update, too many tabs using WebGL): three.js rebuilds
    // its state when the browser restores the context. A local match pauses meanwhile; main.js tells the player.
    const cv = this.renderer.renderer.domElement;
    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();   // ask the browser to restore it
      this.contextLost = true;
      if (this.state === 'playing' && this.mode === 'local') this.pause();
      if (this.onContext) this.onContext(false);
    });
    cv.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.renderer.setSize();
      if (this.onContext) this.onContext(true);
    });
    window.addEventListener('resize', () => this.renderer.setSize());
    this.last = performance.now();
    this.renderer.renderer.setAnimationLoop((t) => this.frame(false, t));
    // browsers stop animation frames in background tabs; a host must keep simulating for everyone
    setInterval(() => {
      if (this.mode === 'host' && this.live && performance.now() - this.last > 120) this.frame(true);
    }, 50);
  }

  get frozen() { return this.countdownT > 0; }
  // the match keeps running under the pause menu when playing online
  get live() { return this.state === 'playing' || (this.state === 'paused' && this.mode !== 'local'); }

  applySettings(s) {
    // the announcer: one of the five, or a different one every match; whichever is next loads ahead of time
    this.announcerSetting = s.announcer || 'random';
    this.musicMode = ['finale', 'off', 'always'].includes(s.matchMusic) ? s.matchMusic : 'finale';
    this.operatorVoice = VOICES.includes(s.voice) ? s.voice : null;
    this.explicit = !!s.explicit;
    if (!this.announcerPack || (this.announcerSetting !== 'random' && this.announcerPack !== this.announcerSetting)) this.pickAnnouncer();
    this.renderer.timing = !!s.showFps;   // GPU timing only while the performance readout is shown
    const q = qualityFrom(s), qk = JSON.stringify(q);
    if (qk !== this.appliedQuality) {
      this.appliedQuality = qk; this.renderer.applyQuality(q); this.effects?.setQuality(q);
      setGunDetail(q.lowPoly ? 0 : 1);
      // world detail is baked into the map's geometry: rebuild it now from the menu, otherwise on the next map
      if (!!q.lowPoly !== worldDetailLow()) { setWorldDetail(q.lowPoly); if (this.world && this.state === 'menu') this.loadMap(this.world.id, true); }
    }
    this.animLod = q.fast ? 'mobile' : 'normal';
    this.fpsCap = +s.fpsCap || 0;
    const dyn = s.dynamicRes !== false;
    if (this.renderer.dynamic !== dyn) { this.renderer.dynamic = dyn; if (!dyn) { this.renderer.drs.scale = 1; this.renderer.applyPR(); this.renderer.setSize(); } }
    document.documentElement.style.setProperty('--tb-zoom', String({ small: 0.7, medium: 0.85, large: 1 }[s.touchSize] || 0.7));
    this.audio.setVolume(s.volume);
    this.music.setVolume(s.musicVolume ?? 0.5);
    this.input.deadzone = s.padDeadzone;
    const adsMode = this.input.isTouch ? (s.touchAds || 'toggle') : (s.adsMode || 'hold');
    if (this.input.adsMode !== adsMode) { this.input.adsMode = adsMode; this.input.clearAds(); }
    this.input.vibration = s.vibration;
    this.input.touchAccel = { off: 0, low: 0.3, medium: 0.6, high: 1 }[s.touchAccel] ?? 0.6;
    this.input.haptics = s.touchHaptics !== false;
    this.input.setGyro(['ads', 'always'].includes(s.gyro) ? s.gyro : 'off');
    this.input.fullscreen = s.fullscreen !== false;
    if (!!s.showCollision !== !!this.collisionView) this.setCollisionView(!!s.showCollision);
  }

  // ---------- match lifecycle ----------
  // online: { mode: 'host', lobby } or { mode: 'guest', lobby, start }
  startMatch(settings, online = null) {
    this.renderer.resetDRS();
    this.settings = { ...settings };
    if (online && online.mode === 'guest') {
      const cfg = online.start.cfg || {};
      this.settings.timeLimit = +cfg.timeLimit || 10;
      this.settings.scoreLimit = +cfg.scoreLimit || 75;
      this.settings.friendlyFire = !!cfg.friendlyFire;
      this.settings.map = MAPS[cfg.map] ? cfg.map : 'tarsa';
      this.settings.mode = MODES[cfg.mode] ? cfg.mode : 'tdm';
    }
    if (!MODES[this.settings.mode]) this.settings.mode = 'tdm';
    const modeCfg = MODES[this.settings.mode];
    if (modeCfg.rounds) this.settings.scoreLimit = modeCfg.winRounds;
    this.gg = !!modeCfg.ladder;   // Gun Game: every kill is the next gun; first to finish the ladder wins
    this.ffa = !!modeCfg.ffa;     // Free-for-All and Gun Game: everyone for themselves
    this.inf = !!modeCfg.infected;  // Infected: survivors (team 0) against the infected (team 1), who grow with every kill
    if (this.inf) this.settings.timeLimit = modeCfg.timeLimit;
    if (this.ffa && !this.gg) this.settings.scoreLimit = modeCfg.killLimit || 30;
    if (this.gg) {
      this.settings.scoreLimit = GUN_LADDER.length;
      for (const id of GUN_LADDER) { try { prewarmGun(weaponDef(id, {})); } catch (_) { /* built on first use */ } }
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
    if (this.gm) this.gm.dispose();
    this.gm = createMode(this.settings.mode, this);
    // round modes: no health or ammo pickups
    if (this.gm) for (const p of this.pickups) { p.active = false; p.mesh.visible = false; p.timer = Infinity; }
    this.effects.clear();
    this.brains.clear();
    this.grenadeSeq = 0;
    this.pickupSeq = 1000;

    if (this.mode === 'guest') return this.startGuest(online.start);

    const N = this.gm && this.gm.cfg.teamSize ? this.gm.cfg.teamSize : Math.max(1, Math.min(8, settings.teamSize | 0));
    // Free-for-All: everyone is on team 1, so everyone wears the enemy colours and every check goes through foes()
    const myTeam = this.ffa ? 1 : this.inf ? 0 : this.mode === 'host' ? online.lobby.hostTeam : 0;
    this.player = new Character(this, { name: settings.name || 'Operator', team: myTeam, isBot: false, primary: loadoutFromSettings(settings) });
    this.player.uid = online && online.lobby ? online.lobby.myUid : '';
    this.characters = [this.player];
    if (this.mode === 'host') {
      this.session = new HostSession(this, online.lobby);
      for (const p of online.lobby.players.values()) this.characters.push(this.session.createRemote(p));
    }
    this.botNames = shuffle([...BOT_NAMES]);
    // private online matches can be humans only (host's "Fill empty slots with bots" switch)
    const fill = !(this.mode === 'host' && settings.fillBots === false);
    if (this.ffa) { for (let i = this.characters.length; fill && i < 2 * N; i++) this.addBot(1); }
    else if (this.inf) {
      // everyone a survivor, then one picked at random to start infected
      for (const c of this.characters) c.setTeam(0);
      for (let i = this.characters.length; fill && i < 2 * N; i++) this.addBot(0);
      const zero = this.characters[(Math.random() * this.characters.length) | 0];
      zero.setTeam(1);
      for (const c of this.characters) c.infectNext = false;
      this.settings.scoreLimit = this.characters.length;
    } else for (let t = 0; t < 2; t++) {
      const humans = this.characters.filter(c => c.team === t).length;
      for (let i = humans; fill && i < N; i++) this.addBot(t);
    }
    if (this.gg) for (const c of this.characters) { c.ggLevel = 0; c.setLoadout(soloLoadout(GUN_LADDER[0])); }
    this.playerCtl = new PlayerController(this, this.player);

    this.scores = [0, 0];
    this.time = 0;
    this.timeLeft = this.settings.timeLimit * 60;   // (the mode can set its own: Infected runs 5 minutes)
    this.intel.forEach(i => { i.time = -99; });
    this.multi = 0; this.lastKillT = -99;
    this.endT = 0;
    this.damageFx = 0;

    // free-for-all, and maps that spawn anyone anywhere (Link Loop: all three stations, every level, from the
    // first second): one at a time, each away from the enemies already placed
    if (this.anywhere()) {
      this.buildFfaSpawns();
      for (const c of shuffle([...this.characters])) { this.infectedKit(c); c.spawn(this.chooseSpawn(c.team), this.spawnYawOut); this.infectedKit(c, true); }
    } else for (const t of [0, 1]) {
      const spots = shuffle([...this.world.spawns[t]]);
      this.characters.filter(c => c.team === t).forEach((c, i) => { this.infectedKit(c); c.spawn(spots[i % spots.length], this.world.spawnYaw[t]); this.infectedKit(c, true); });
    }
    if (this.inf) this.infTally();
    for (const brain of this.brains.values()) brain.reset();
    // (Mobile: the map's shadows, drawn once now everyone's placed, without the characters, who move)
    this.renderer.refreshShadows(this.characters.map(c => c.model && (c.model.root || c.model.group || c.model)).filter(r => r && r.traverse));

    this.countdownT = 3;
    this.lastBeep = 4;
    this.state = 'playing';
    this.characters.forEach(c => { c.spawnT = this.time; });
    if (this.playerCtl) this.playerCtl.inspectT = 3.4; // check your weapon while the countdown runs
    if (this.gm) this.gm.start(); // round modes place everyone and run their own freeze time
    // the match opens on a 10-second countdown with a drum build-up (round modes: the first round's freeze)
    this.intro = true;
    this.countdownT = INTRO_SECS;
    this.lastBeep = Math.ceil(INTRO_SECS) + 1;
    this.setIntroLabel();
    // the announcer names the mode; a couple of your squad have something to say while the countdown runs
    this.leadTeam = -1;
    this.matchAnnouncer = this.announcerPack;
    if (this.announcerSetting === 'random') this.pickAnnouncer();   // (the next match's, loading now)
    this.assignVoices();
    // the countdown, the announcer naming the mode and the squad's banter all wait for everyone to be in (tryIntro)
    this.matchToken = (this.matchToken || 0) + 1;
    this.introHold = true; this.introHoldT = 0; this.introLocal = false;
    this.calloutT = undefined; this.walkBySaid = undefined; this.leadSaidT = undefined;
    this.music.warm(this.inf ? 'infected' : 'action');   // (the match's music, fetched while it loads and counts down)
    this.hud.reset();
    this.hud.show(true);
    this.audio.init();
    this.audio.setVolume(settings.volume);
    this.input.reset();
    this.input.enabled = true;
    if (this.input.lastDevice !== 'pad') this.input.lock();
    if (this.session) this.session.startAll();
  }

  setIntroLabel() {
    const m = MODES[this.settings.mode] || MODES.tdm, w = MAPS[this.world.id];
    const el = document.getElementById('count-sub');
    if (el) el.textContent = `${m.name} · ${w ? w.name : this.world.name || ''}`.toUpperCase();
  }

  // in a match, like Black Ops 2: no music while you play, only for the closing moments (the setting can turn it off
  // or have it all match)
  startMusic() {
    this.music.setDuck(false);
    this.finaleOn = false;
    if (this.musicMode !== 'always') { this.music.stop(); return; }
    this.music.setIntensity(0.35);
    this.music.intensity = 0.35;
    this.music.play(this.inf ? 'infected' : 'action');
  }

  startGuest(start) {
    this.session = new GuestSession(this, this.lobby);
    this.characters = [];
    for (const e of Array.isArray(start.ro) ? start.ro : []) {
      if (e[0] === start.you) {
        const [id, name, team, primary] = e;
        this.player = new Character(this, { id, name: String(name).slice(0, 16), team: team === 1 ? 1 : 0, isBot: false, primary: typeof primary === 'string' ? primary : 'rifle' });
        this.player.uid = this.lobby ? this.lobby.myUid : '';
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
    this.player.spawnT = this.time;
    if (this.countdownT > 0.5 && this.playerCtl) this.playerCtl.inspectT = 3.4;
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
    this.intro = this.countdownT > 3.5;
    this.setIntroLabel();
    if (this.intro) this.music.hype(this.countdownT); else this.startMusic();
  }

  // enemies? (Free-for-All: everyone but yourself)
  foes(a, b) { return !!a && !!b && a !== b && (this.ffa || a.team !== b.team); }

  // Free-for-All spawns: spread over the whole map (the team spawns plus open ground everywhere players can
  // walk to), at least 7 m apart
  anywhere() { return this.ffa || (!!this.world.randomSpawns && !this.gm); }
  buildFfaSpawns() {
    const nav = this.world.nav, V = (x, z) => new THREE.Vector3(x, 0, z), ok = this.world.spawnOk || (() => true);
    const many = this.world.randomSpawns ? 110 : 70, apart = (p, pts) => pts.every(o => o.distanceTo(p) > 7);
    const base = [...this.world.spawns[0], ...this.world.spawns[1]];
    const pts = [...base];
    if (nav && nav.openCells && base.length) {
      // only cells joined to the spawns (not sealed corners or the insides of solid blocks)
      const seen = new Uint8Array(nav.cols * nav.rows), q = [];
      for (const b of base) { const i = Math.floor((b.x - nav.minX) / nav.cell), j = Math.floor((b.z - nav.minZ) / nav.cell); const k = j * nav.cols + i; if (nav.isOpen(i, j) && !seen[k]) { seen[k] = 1; q.push(k); } }
      while (q.length) { const k = q.pop(), i = k % nav.cols, j = (k / nav.cols) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj, kk = jj * nav.cols + ii; if (ii >= 0 && jj >= 0 && ii < nav.cols && jj < nav.rows && !seen[kk] && nav.isOpen(ii, jj)) { seen[kk] = 1; q.push(kk); } } }
      const cells = nav.openCells.filter(k => seen[k] && nav.isOpen((k % nav.cols) + 1, (k / nav.cols) | 0) && nav.isOpen((k % nav.cols) - 1, (k / nav.cols) | 0) && nav.isOpen(k % nav.cols, ((k / nav.cols) | 0) + 1) && nav.isOpen(k % nav.cols, ((k / nav.cols) | 0) - 1));
      for (let t = 0; t < 900 && pts.length < many; t++) {
        const k = cells[(Math.random() * cells.length) | 0]; if (k === undefined) break;
        const p = V(nav.cx(k % nav.cols), nav.cz((k / nav.cols) | 0));
        if (ok(p) && apart(p, pts)) pts.push(p);
      }
      // the other levels too where the map asks for it (Link Loop's platforms under Pioneer Square, the galleries
      // and footbridges): cells with open floor all round
      if (this.world.randomSpawns) for (const L of nav.levels || []) {
        const gd = L.grid, open = (i, j) => gd.isOpen(i, j);
        if (!gd || !gd.openCells) continue;
        const lc = gd.openCells.filter(k => { const i = k % gd.cols, j = (k / gd.cols) | 0; return open(i + 1, j) && open(i - 1, j) && open(i, j + 1) && open(i, j - 1); });
        for (let t = 0; t < 300 && lc.length; t++) {
          const k = lc[(Math.random() * lc.length) | 0], p = V(gd.cx(k % gd.cols), gd.cz((k / gd.cols) | 0));
          p.y = L.y;
          if (ok(p) && apart(p, pts)) pts.push(p);
        }
      }
    }
    this.ffaSpawns = pts.filter(ok);
    if (!this.ffaSpawns.length) this.ffaSpawns = pts;   // (never none)
  }

  addBot(team) {
    if (!this.botNames || !this.botNames.length) this.botNames = shuffle([...BOT_NAMES]);
    const b = new Character(this, { name: this.botNames.pop(), team, isBot: true, primary: botLoadout(pickBotWeapon()) });
    this.characters.push(b);
    const brain = new BotBrain(b, this);
    this.brains.set(b, brain);
    if (this.state === 'playing' || this.state === 'paused') {
      b.spawn(this.chooseSpawn(team), this.spawnYawOut);
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
    this.music.cancelHype();
    this.intro = false;
    if (this.session) { if (this.session.leave) this.session.leave(); this.session.dispose(); }
    this.session = null;
    if (this.gm) { this.gm.dispose(); this.gm = null; }
    this.mode = 'local';
    this.state = 'menu';
    this.music.setDuck(false);
    this.music.play('menu');
    this.input.enabled = false;
    this.input.unlock();
    this.input.releaseKeys();          // back in the menus: browser shortcuts work again
    this.hud.show(false);
    for (const c of this.characters) c.dispose();
    this.characters = [];
    this.player = null;
    if (this.playerCtl) { this.vmScene.remove(this.playerCtl.vmRoot); this.playerCtl = null; }
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    this.renderer.grade.damage.value = 0;
  }

  ffaStandings() {
    const lv = (c) => (this.gg ? (c.ggLevel || 0) : c.kills);
    return [...this.characters].sort((a, b) => lv(b) - lv(a) || b.kills - a.kills || b.score - a.score);
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
    let winner = this.scores[0] > this.scores[1] ? 0 : this.scores[1] > this.scores[0] ? 1 : -1;
    if (this.inf) winner = this.characters.some(c => c.team === 0 && !c.infectNext) ? 0 : 1;   // anyone left alive: the survivors won
    let sorted = [...this.characters].sort((a, b) => b.score - a.score);
    let ffaPlace = 0, winnerId = -1;
    if (this.ffa) {
      // Free-for-All: placings by kills (Gun Game: the furthest up the ladder), then score
      sorted = this.ffaStandings();
      winnerId = this.ffaWinnerId ?? sorted[0]?.id ?? -1;
      if (this.ffaWinnerId != null) sorted.sort((a, b) => (b.id === winnerId) - (a.id === winnerId));
      ffaPlace = sorted.indexOf(this.player) + 1;
      winner = winnerId === this.player.id ? this.player.team : -2;
      this.ffaWinnerId = null;
    }
    this.music.setDuck(false);
    this.music.sting(winner === this.player.team);
    const result = { winner, scores: [...this.scores], players: sorted, mvp: sorted[0], playerTeam: this.inf && this.player.infectNext ? 1 : this.player.team, mode: this.mode, ffa: this.ffa, place: ffaPlace, winnerId, count: this.characters.length };
    if (this.mode === 'host' && this.session) this.session.sendEnd(result);
    if (this.onEnd) this.onEnd(result);
  }

  // ---------- frame ----------
  // stamp: the display's own time for this frame (requestAnimationFrame's), steadier than reading the clock
  frame(background = false, stamp) {
    const now = performance.now();
    // frame-rate cap: skip display refreshes until the next frame is due (keeps the average at the cap)
    // the menu's live background doesn't need more than 30 fps on the Mobile path (battery, heat), and behind
    // pictures (nothing drawn) the loop only ticks along
    const cap = this.state === 'menu' && this.menuStill ? 15
      : this.state === 'paused' && this.mode === 'local' ? Math.min(this.fpsCap || 30, 30)   // a frozen scene behind the pause menu
      : this.state === 'menu' && this.renderer.quality && this.renderer.quality.fast ? Math.min(this.fpsCap || 30, 30) : this.fpsCap;
    if (!background && cap > 0) {
      const iv = 1000 / cap;
      if (now < (this.nextFrameT || 0) - 1) {
        // between capped frames in the menus, the controller is still read every display refresh (menu
        // navigation at the capped rate felt sluggish). In a match, input waits for the next frame as before.
        if (!this.live) { this.input.poll(Math.min(0.05, (now - (this.lastPoll || now)) / 1000)); this.lastPoll = now; }
        return;
      }
      this.nextFrameT = Math.max((this.nextFrameT || 0) + iv, now - iv);
    }
    if (background) {
      // a hidden host tab gets timers about once a second: catch the match up in 50 ms steps (up to 2 s), or
      // everyone else's game would crawl and time out
      let left = Math.min(2, (now - this.last) / 1000);
      this.last = now;
      while (left > 0.0001 && this.live) { const st = Math.min(0.05, left); this.update(st); this.input.endFrame(); left -= st; }
      return;
    }
    const gap = now - this.last;
    this.last = now;
    // Smooth motion: step the game by the display's frame interval, not by when this callback happened to run.
    // Frames land on the refresh, but the time we read wobbles by a millisecond or two either way, and that
    // wobble was in every moving thing (the view, the gun, every player): a faint, constant shimmer. The
    // display's timestamp, snapped to its steady interval when it's close to it, takes that out.
    const ts = stamp > 0 ? stamp : now, raw = ts - (this.lastStamp ?? ts - 16.7);
    this.lastStamp = ts;
    const iv = this.frameIv || raw, near = Math.abs(raw - iv) < iv * 0.12;
    // the usual interval: eased toward steady frames; a one-off late frame doesn't move it, but several in a row
    // at a new rate (a cap changed, the window moved to another display) switch to that rate
    if (near) { this.frameIv = iv + (raw - iv) * 0.04; this.frameMiss = 0; }
    else if (raw > 2 && raw < 50 && ++this.frameMiss >= 6) { this.frameIv = raw; this.frameMiss = 0; }
    else if (!this.frameIv) this.frameIv = raw;
    let use = near ? iv : raw;
    // whatever the snapping held back (or got ahead), fed back in slowly: game time never drifts from real time
    this.frameDebt = (this.frameDebt || 0) + raw - use;
    const fix = Math.max(-0.4, Math.min(0.4, this.frameDebt * 0.1));
    use += fix; this.frameDebt -= fix;
    const dt = Math.min(0.05, Math.max(0, use) / 1000);
    this.frameCount = (this.frameCount || 0) + 1;
    // performance readout (Options > Show FPS): the longest frame in each half second, and the main thread's own time
    const pf = this.perf || (this.perf = { worst: 0, cpu: 0, n: 0 });
    pf.worst = Math.max(pf.worst, Math.min(gap, 2000));
    this.input.poll(this.live ? dt : Math.min(0.05, (now - (this.lastPoll || now)) / 1000));
    this.lastPoll = now;
    if (this.live) this.update(dt);
    else if (this.state === 'menu' || this.state === 'ended') this.menuCamera(dt);
    if (this.world.update) this.world.update(dt, performance.now() / 1000, this.netClock());
    this.cullSmall();
    if (this.state !== 'playing' && this.state !== 'paused') this.audio.setAmbience(null);   // (a place's background: only in a match)
    // the world's own sounds (the station's trains), only in a match
    if (this.world.sounds && this.world.sounds.length) {
      // (a world can say how well a sound carries to where you are: a train under the street, in another station)
      const ear = this.camera.position, aud = this.world.audible;
      // (not while the loading screen is still up: the station's PA under it sounded like a second announcer)
      if (this.state === 'playing' && !this.introHold) for (const [name, pos, opts] of this.world.sounds) {
        const k = aud && pos ? aud(pos, ear, name, opts) : 1;
        if (k > 0.02) this.audio.play(name, pos, k < 1 ? { ...opts, occl: Math.sqrt(k), muffle: 1 - k } : opts);
      }
      this.world.sounds.length = 0;
    }
    // in-world music (the supermarket's speakers): only during a match, loud inside, faint outside
    const amb = this.world.ambient && (this.state === 'playing' || this.state === 'paused') ? this.world.ambient : null;
    this.music.ambient(amb ? amb.music : null);
    if (amb) this.music.ambientLevel(amb.inside(this.camera.position.x, this.camera.position.z) ? 0.85 : 0.18);
    if (this.state !== 'paused' || this.mode !== 'local') this.effects.update(dt);
    this.effects.setScale(this.camera, window.innerHeight * this.renderer.renderPR());
    // keep the viewmodel lit from the sun's direction as the camera turns
    _q.copy(this.camera.quaternion).invert();
    this.vmSun.position.copy(SUN_DIR).applyQuaternion(_q).multiplyScalar(5);
    const showVm = (this.state === 'playing' || this.state === 'paused') && !!this.player && this.player.alive && this.playerCtl.vmRoot.visible;
    if (this.player && this.state !== 'menu') this.updateGlare(dt);
    // nothing drawn while a new map's shaders compile, or behind menus showing pictures (see main.js)
    if (!this.warming && !(this.menuStill && this.state === 'menu')) this.renderer.render(dt, showVm);
    this.input.endFrame();
    pf.cpu += performance.now() - now; pf.n++;
  }

  // A new map's shaders compile without freezing the page (see warm.js), and nothing 3D is drawn until they're
  // done: drawing first made the page wait on every compile at once. Then the minimap's snapshot.
  async warmMap() {
    const token = (this.warmToken = (this.warmToken || 0) + 1), r = this.renderer.renderer;
    this.warming = true;
    this.warmPromise = (async () => {
      try {
        await compileGently(r, this.scene, this.camera);
        await compileGently(r, this.vmScene, this.vmCamera);
      } catch (_) { /* older browsers: compile on first draw, as before */ }
      if (token !== this.warmToken) return;   // the map changed again meanwhile: that warm-up takes over
      this.warming = false;
      const mm = await renderMinimap(r, this.scene);
      if (token !== this.warmToken) return;
      this.minimap = mm;
      if (this.onMinimap) this.onMinimap(this.minimap);
    })();
    return this.warmPromise;
  }

  // a clock every machine in an online match agrees on (the host's match time): the station's trains run on it
  netClock() {
    if (this.session && this.session.hostNow) return this.session.hostNow();
    return this.live ? this.time : performance.now() / 1000;
  }

  menuCamera(dt) {
    this.menuT += dt * 0.035;
    const t = this.menuT;
    if (this.world.menuCam) {
      this.world.menuCam(t, this.camera);
      if (this.camera.fov !== 62) { this.camera.fov = 62; this.camera.updateProjectionMatrix(); }
      for (const c of this.characters) c.updateModel(dt, false);
      return;
    }
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
    // H / D-pad right: straight to Change Class (applies on the next spawn)
    if (this.state === 'playing' && inp.action('loadout')) { this.wantLoadout = true; this.pause(); if (this.mode === 'local') return; }

    if (this.introHold) { this.introHoldT += dt; this.tryIntro(); }
    else this.walkByBanter(dt);
    if (this.countdownT > 0) {
      if (!this.introHold) this.countdownT -= dt;
      const n = Math.ceil(this.countdownT);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        // the intro's drums carry the count; short beeps only for the last three and for round freezes
        if (n > 0) { if (!this.intro || n <= 3) this.audio.play('beep', null, { ui: true, freq: 520 }); }
        else {
          this.audio.play('beep', null, { ui: true, freq: 1040 });
          this.hud.medal('FIGHT');
          if (this.intro) { this.intro = false; this.startMusic(); }
        }
      }
      this.hud.countdown(Math.max(0, n), this.intro);
    } else {
      if (this.timeLeft > 60 && this.timeLeft - dt <= 60 && !this.gm) this.announce('one_minute');
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0 && !guest && !this.gm) {
        if (this.inf) this.hud.medal(this.player.team === 0 && !this.player.infectNext ? 'VICTORY' : 'DEFEAT', 'THE SURVIVORS HELD OUT');
        this.endMatch(); return;
      }
      if (this.inf && !guest) { this.infT = (this.infT || 0) - dt; if (this.infT <= 0) { this.infT = 0.5; this.infTally(); } }
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
        // a train on the tracks (a station piece or Link Loop): the host or an offline match decides, like any kill;
        // before moving, or the train's collision box would first shove them up onto its roof
        if (c.alive && this.world.trainHit && this.world.trainHit(c.pos)) c.takeDamage(999, null, 'train', false, c.pos);
        c.updateCommon(dt);
        if (!c.alive && this.live && !this.gm) {
          c.respawnT -= dt;
          if (c.respawnT <= 0) this.respawn(c);
        }
      }
      if (this.gm) { this.gm.update(dt); if (this.state === 'ended') return; }
      if (this.session) this.session.update(dt);
    }
    if (this.gm) this.gm.frame(dt);
    if (this.doors) this.doors.update(dt, !guest);

    this.updateAimTarget();
    this.camera.updateMatrixWorld();
    _pm.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    for (const c of this.characters) {
      if (c === this.player) continue;
      if (c.hidden) { if (c.model) c.model.root.visible = false; continue; }
      _sph.center.set(c.pos.x, c.pos.y + 0.9, c.pos.z);
      const dist = _sph.center.distanceTo(this.camera.position);
      // off screen: root only; distant: the skeleton updates at 30 Hz (Mobile: 30 Hz from 14 m, 15 Hz from 32 m)
      const mob = this.animLod === 'mobile';
      const lod = !_frustum.intersectsSphere(_sph) && dist > 3 ? 0 : dist > (mob ? 32 : 60) ? 3 : dist > (mob ? 14 : 22) ? 2 : 1;
      c.updateModel(dt, !this.foes(c, this.player) || c === this.aimTarget, lod);
    }
    this.updateLasers();
    this.updateGrenades(dt);
    this.updatePickups(dt);
    // score intensity: recent fighting, the last minute, or a close finish
    {
      const p = this.player, t = this.time;
      const fight = p.alive && (t - p.lastFireT < 4 || t - p.lastDamageT < 5) ? 0.4 : 0;
      const lim = this.settings.scoreLimit || 75;
      // (round modes: match point)
      const close = this.gm && this.gm.cfg && this.gm.cfg.winRounds ? Math.max(...this.scores) >= this.gm.cfg.winRounds - 1 : this.timeLeft < 60 || Math.max(...this.scores) >= lim - 5;
      this.music.setIntensity(0.35 + fight + (close ? 0.5 : 0));
      if (close && this.musicMode === 'finale' && !this.finaleOn && !this.frozen && this.endT <= 0) { this.finaleOn = true; this.music.play('finale'); }
    }
    this.audio.setListener(this.camera.position, this.player.alive ? this.player.yaw : 0);
    // rooms and tunnels sound like rooms and tunnels: the echo of the space you're in, the place's background, and
    // (Link Loop) a station you're riding away from fading out as the next fades in
    const ear = this.camera.position, w = this.world;
    if (w.spaceAt) this.audio.setSpace(w.spaceAt(ear));
    else this.audio.setIndoor(w.indoorAt ? w.indoorAt(ear) : 0);
    this.audio.setAmbience(w.ambience ? w.ambience(ear) : null);
    this.audio.areaGain = w.areaGain ? (pos) => w.areaGain(pos, ear) : null;
    // badly hurt: your heartbeat, and your breath
    if (this.player.alive && this.player.health < 35) {
      this.heartT = (this.heartT || 0) - dt;
      if (this.heartT <= 0) { const k = 1 - this.player.health / 35; this.heartT = 1.05 - 0.35 * k; this.audio.play('heartbeat', null, { ui: true, k: 0.5 + 0.5 * k }); if (Math.random() < 0.4) this.audio.play('breath', null, { ui: true, k }); }
    }

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
      if (t.t < best) { best = t.t; this.aimTarget = this.foes(c, p) ? c : null; }
    }
  }

  // Sniper glare: a scoped enemy looking your way flashes a lens glint (core + horizontal streak), brighter
  // the more directly they're aimed at you. Walls hide it; it fades in as they scope in.
  updateGlare(dt) {
    const cam = this.camera, me = this.player;
    if (!this.glares) this.glares = new Map();
    for (const gl of this.glares.values()) gl.live = false;
    for (const c of this.characters) {
      if (c === me || !c.alive || c.hidden || !c.weapon || !c.weapon.def.scope || c.adsT < 0.25 || !this.foes(c, me)) continue;
      const fwd = c.forward(_gf), scope = c.eyePos(_gs).addScaledVector(fwd, 0.3);
      const to = _gt.copy(cam.position).sub(scope), d = to.length();
      if (d < 0.5) continue;
      to.divideScalar(d);
      const dot = fwd.dot(to);
      let gl = this.glares.get(c);
      if (dot < 0.94 && !gl) continue;
      if (!gl) {
        // one sprite with its own material (opacity is per glint), sharing a clean star texture
        const mat = new THREE.SpriteMaterial({ map: glintTex(), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false });
        gl = { core: new THREE.Sprite(mat), k: 0, vis: false, t: 0 };
        gl.streak = gl.core;
        gl.core.renderOrder = 5;
        this.scene.add(gl.core);
        this.glares.set(c, gl);
      }
      gl.live = true;
      let k = Math.max(0, Math.min(1, (dot - 0.94) / 0.055)); k = k * k * (3 - 2 * k);
      k *= Math.min(1, (c.adsT - 0.25) / 0.5) * Math.min(1, d / 8);   // fades in while scoping; none point-blank
      if ((gl.t -= dt) <= 0) { gl.t = 0.12; gl.vis = k > 0 && !this.physics.blocked(scope, cam.position); }
      if (!gl.vis) k = 0;
      gl.k += (k - gl.k) * Math.min(1, dt * 14);
      // a white four-point star: constant size on screen (grows with distance), twinkling and turning slowly
      const fl = gl.k * (0.85 + 0.15 * Math.sin(this.time * 19 + c.id * 1.7)), s = Math.max(0.35, d * 0.05) * (0.55 + 0.45 * fl);
      gl.core.position.copy(scope);
      gl.core.scale.set(s, s, 1);
      gl.core.material.rotation = Math.sin(this.time * 1.3 + c.id) * 0.12;
      gl.core.material.opacity = Math.min(1, fl * 1.15);
      gl.core.visible = gl.k > 0.02;
    }
    for (const [c, gl] of this.glares) {
      if (gl.live && this.characters.includes(c)) continue;
      gl.k = 0; gl.core.visible = false;
      if (!this.characters.includes(c)) { this.scene.remove(gl.core); gl.core.material.dispose(); this.glares.delete(c); }
    }
  }

  rayCharacter(o, d, c, maxT) {
    // lying down the head is out in front and the body runs back along the ground
    const pr = c.proneT || 0, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const hx = c.pos.x + fx * 0.55 * pr, hy = c.pos.y + c.height - 0.16, hz = c.pos.z + fz * 0.55 * pr;
    let t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, hx - 0.16, hy - 0.16, hz - 0.16, hx + 0.16, hy + 0.16, hz + 0.16, maxT);
    let head = t < maxT;
    let tb;
    if (pr > 0.5) {
      const ax = c.pos.x + fx * 0.35, az = c.pos.z + fz * 0.35, bx = c.pos.x - fx * 1.15, bz = c.pos.z - fz * 1.15;
      tb = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, Math.min(ax, bx) - 0.22, c.pos.y, Math.min(az, bz) - 0.22, Math.max(ax, bx) + 0.22, c.pos.y + 0.4, Math.max(az, bz) + 0.22, Math.min(maxT, t));
    } else tb = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, c.pos.x - 0.28, c.pos.y, c.pos.z - 0.28, c.pos.x + 0.28, c.pos.y + c.height - 0.32, c.pos.z + 0.28, Math.min(maxT, t));
    if (tb < Math.min(maxT, t)) { t = tb; head = false; }
    _rayHit.t = t; _rayHit.head = head;   // one shared result (read straight away by every caller): no garbage per test
    return _rayHit;
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
      case 'hit': hud.hitmarker(a[0], a[1]); if (!a[0]) inp.buzz(a[1] ? 14 : 8); if (a[1]) this.audio.play('headshot', null, { ui: true }); else if (!a[0]) this.audio.play('hit', null, { ui: true }); if (a[2]) { inp.rumble(0.6, 0.4, 150); ctl && ctl.addShake(0.4); } break;
      case 'dmg': if (a[0] !== null) hud.damageFrom({ x: a[0], z: a[1] }); this.audio.play('hurt', null, { ui: true }); if (ctl) { ctl.addShake(0.12); ctl.flinch(); } inp.rumble(0.55, 0.3, 160); break;
      case 'kill': this.audio.play('kill', null, { ui: true }); inp.rumble(0.3, 0.6, 120); inp.buzz(30); break;
      case 'score': hud.scoreEvent(a[0], a[1]); break;
      case 'medal': hud.medal(a[0], a[1]); break;
      case 'kpick': if (this.mode === 'guest' && this.player) this.player.grenades++; hud.toast('+1 THROWING KNIFE'); this.audio.play('pickup', null, { ui: true }); break;
      case 'death': {
        inp.clearAds();
        const killer = this.charById ? this.charById(a[0]) : null;
        if (this.player) this.player.killer = killer;
        hud.showDeath(killer, a[1]); inp.rumble(0.9, 0.5, 350); break;
      }
      case 'spawn': inp.clearAds(); hud.hideDeath(); this.audio.play('spawn', null, { ui: true }); if (ctl) { ctl.lastFov = 0; ctl.recoilDebt = 0; ctl.crouchToggle = false; } break;
      case 'pickup': this.audio.play('pickup', null, { ui: true }); hud.message(a[0] === 'health' ? '+50 HEALTH' : 'AMMO RESUPPLIED'); break;
      case 'msg': hud.message(a[0]); break;
      case 'stun': if (this.player) this.player.stun(+a[0] || 1); hud.stunned && hud.stunned(+a[0] || 1); inp.rumble(0.5, 0.5, 300); break;
      default: break;
    }
  }

  // tactical lasers: everyone's beam is visible (the trade-off for tighter hip fire)
  updateLasers() {
    const fx = this.effects;
    fx.beginLasers();
    const p = this.player;
    if (p && p.alive && p.weapon.def.laser && this.playerCtl.laserWorld(_la, _lb)) fx.laser(_la.addScaledVector(_lb, 0.35), _lb, this.physics, true);
    for (const c of this.characters) {
      if (c === p || !c.alive || c.hidden || !c.model || !c.model.root.visible || !c.weapon.def.laser) continue;
      const gun = c.model.gun;
      if (!gun || !gun.laser || c.sprinting) continue;
      gun.laser.getWorldPosition(_la);
      gun.group.getWorldQuaternion(_lq);
      fx.laser(_la, _lb.set(0, 0, -1).applyQuaternion(_lq), this.physics, false);
    }
    fx.endLasers();
  }

  // change class: right away if you only just spawned and haven't fired (like CoD), otherwise at
  // the next spawn. Guests ask the host, which applies the same rule.
  requestLoadout(l) {
    if (!this.player || this.gg || (this.gm && this.gm.fixedLoadout)) return;
    if (this.mode === 'guest') { this.session?.sendLoadout(l); return; }
    this.applyLoadout(this.player, l);
  }
  applyLoadout(c, l) {
    if (c.alive && this.time - (c.spawnT ?? -99) < 5 && c.lastFireT < (c.spawnT ?? 0)) {
      c.pendingLoadout = null;
      if (l !== c.loadout) { c.setLoadout(l); this.emit(['lo', c.id, c.loadout]); }
    } else c.pendingLoadout = l;
  }
  inSpawnWindow(c = this.player) { return !!c && c.alive && this.time - (c.spawnT ?? -99) < 5 && c.lastFireT < (c.spawnT ?? 0); }

  // respawn now (after a short minimum) instead of waiting out the timer
  requestRespawn() {
    const p = this.player;
    if (!p || p.alive || !this.live || this.gm || this.time - p.deathT < PLAYER.respawnMin) return;
    if (this.mode === 'guest') { this.session?.sendRespawn(); return; }
    p.respawnT = Math.min(p.respawnT, 0);
  }

  charById(id) { return this.characters.find(c => c.id === id) || null; }

  // ---------- combat ----------
  shoot(shooter, def, origin, dir, spread) {
    if (def.sling) return this.slingShot(shooter, def, origin, dir);
    const ff = this.settings.friendlyFire;
    const isPlayer = shooter === this.player;
    const muzzle = isPlayer ? this.playerCtl.muzzleWorld(_m) : shooter.muzzleWorld(_m);
    this.audio.play('shot', isPlayer ? null : shooter.pos, { weapon: def.id, quiet: def.quiet });
    this.effects.muzzle(muzzle, dir, ['shotgun', 'sniper', 'launcher'].includes(def.model.type), def.quiet);
    const ej = isPlayer ? this.playerCtl.ejectWorld(_a) : shooter.ejectWorld(_a);
    _r.set(Math.cos(shooter.yaw), 0, -Math.sin(shooter.yaw));
    if (def.mode !== 'BOLT' && def.mode !== 'PUMP' && !def.rocket) this.effects.casing(ej, dir, _r);
    const cosmetic = this.mode === 'guest'; // guests draw their own shot instantly; the host decides what it hit
    if (def.rocket) {
      this.effects.backblast(ej, dir);
      if (isPlayer) this.playerCtl.addShake(0.45);
      // The Monte: a real rocket from the muzzle along the aim (the host flies it; guests get it as an event)
      if (cosmetic) return;
      applySpread(dir, spread, _d);
      // aim from the muzzle at whatever the crosshair is on, so it lands where you point (the tube sits off the eye line)
      const wt = this.physics.raycast(origin, _d, 150), aimT = wt ? wt.t : 150;
      const start = muzzle.clone().addScaledVector(_d, 0.2);
      const tgt = _a.copy(origin).addScaledVector(_d, aimT);
      const fly = aimT > 2 ? tgt.sub(start).normalize() : _d.clone();
      const vel = fly.clone().multiplyScalar(def.rocket.speed);
      const id = (this.grenadeSeq = (this.grenadeSeq || 0) + 1);
      this.spawnRocket(id, start, vel, shooter, def.rocket);
      this.emit(['rkt', id, +start.x.toFixed(2), +start.y.toFixed(2), +start.z.toFixed(2), +vel.x.toFixed(2), +vel.y.toFixed(2), +vel.z.toFixed(2), shooter.id]);
      if (!def.quiet) this.reportIntel(this.ffa ? 1 : 1 - shooter.team, shooter.pos);
      return;
    }
    if (!cosmetic && !def.quiet) this.reportIntel(this.ffa ? 1 : 1 - shooter.team, shooter.pos);
    const rewound = this.session && shooter.remote ? this.session.rewind(shooter) : null;
    const hits = new Map();
    const ends = [];
    let whizzed = false;
    for (let p = 0; p < def.pellets; p++) {
      applySpread(dir, spread, _d);
      let best = def.range, hitC = null, head = false;
      let w = this.physics.raycast(origin, _d, def.range);
      // a pane of glass: this round shatters it and carries on (a little past it); boards take the round
      for (let guard = 0; w && w.box.breakable !== undefined && this.breakables && guard < 4; guard++) {
        const bk = this.breakables.list[w.box.breakable];
        const broke = !cosmetic && this.breakables.hit(w.box.breakable, def.damage * (def.pellets > 1 ? 0.5 : 1), w.point, w.normal, shooter);
        if (!broke && !(cosmetic && bk && bk.kind === 'glass')) break;
        const past = w.t + 0.08;
        w = this.physics.raycast(_b.copy(origin).addScaledVector(_d, past), _d, def.range - past);
        if (w) w.t += past;
      }
      if (w) best = w.t;
      for (const c of this.characters) {
        if (!c.alive || c === shooter || c.hidden || (!this.foes(c, shooter) && !ff)) continue;
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
      if (!isPlayer && !cosmetic && !whizzed && hitC !== this.player && this.player.alive && this.foes(shooter, this.player)) {
        this.player.headPos(_b).sub(origin);
        const al = _b.dot(_d);
        if (al > 2 && al < best && _b.lengthSq() - al * al < 2.2) { whizzed = true; this.audio.play('whiz', null, { ui: true }); }
      }
      let kind;
      if (hitC) hitC.hitReact(_end, _d, hitPower(def), head);
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
        if (p === 0) this.audio.play('impact', w.point, { surface: w.box.surface });
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
      if (!c.alive || c === attacker || (!this.foes(c, attacker) && !this.settings.friendlyFire)) continue;
      c.chestPos(_a).sub(eye);
      const d = _a.length();
      if (d > bd) continue;
      if (_a.normalize().dot(fwd) < 0.7) continue;
      if (this.physics.blocked(eye, c.chestPos(_b))) continue;
      best = c; bd = d;
    }
    if (!best) {
      // nothing to hit: a breach instead. Boards or glass right in front: a kick breaks them. A shut door: kicked
      // in hard, and anyone just behind it is thrown back and stunned for a moment
      const bk = this.breakables && this.breakables.near(attacker);
      if (bk) { this.breakables.hit(bk.b.idx, 60, bk.point, bk.normal, attacker); return; }
      if (this.doors) {
        const d = this.doors.near(attacker);
        if (d && d.kind === 'swing' && Math.abs(d.t) < 0.12) this.doors.kick(d, attacker);
      }
      return;
    }
    const lunge = _a.subVectors(best.pos, attacker.pos).setY(0).normalize();
    attacker.vel.x += lunge.x * 4; attacker.vel.z += lunge.z * 4;
    best.hitReact(best.chestPos(_b), lunge, 2.2, false);
    this.effects.impact(best.chestPos(_b), lunge.negate(), 'blood');
    this.audio.play('meleehit', best.pos);
    const wasAlive = best.alive;
    best.takeDamage(MELEE.damage, attacker, 'melee', false, attacker.pos);
    this.notify(attacker, 'hit', wasAlive && !best.alive, false, true);
  }

  throwGrenade(c, target, cook = 0, type = 'frag') {
    if (this.mode === 'guest') return; // the host spawns it and tells us
    const spec = EQUIPMENT[type] || EQUIPMENT.frag;
    const origin = c.eyePos(new THREE.Vector3());
    const f = c.forward(_d);
    const fuse = spec.knife ? 8 : Math.max(0, spec.fuse - cook);
    // it leaves the hand half a metre out: not past a wall you're up against (it started inside it, and flew on
    // through)
    const out = fuse <= 0 ? 0.2 : 0.5, wallHit = this.physics.raycast(origin, f, out + 0.15);
    origin.addScaledVector(f, wallHit ? Math.max(0, wallHit.t - 0.15) : out);
    let vel;
    if (spec.knife) {
      // a knife flies almost flat: aim straight at the target (bots lead a touch for the drop)
      if (target) { vel = _a.copy(target).add(new THREE.Vector3(0, 1.2, 0)).sub(origin).normalize().multiplyScalar(spec.speed); vel = vel.clone(); }
      else vel = f.clone().multiplyScalar(spec.speed).add(new THREE.Vector3(0, 0.6, 0));
    } else if (target) {
      const dx = target.x - origin.x, dz = target.z - origin.z, dy = target.y + 0.3 - origin.y;
      const dist = Math.hypot(dx, dz);
      const T = Math.max(0.5, Math.min(1.4, dist / 14));
      vel = new THREE.Vector3(dx / T, (dy + 0.5 * GRAV * T * T) / T, dz / T);
    } else {
      vel = f.clone().multiplyScalar(spec.speed || GRENADE.throwSpeed).add(new THREE.Vector3(0, 3, 0)).addScaledVector(c.vel, 0.5);
    }
    const id = (this.grenadeSeq = (this.grenadeSeq || 0) + 1);
    if (fuse <= 0) vel.set(0, 0, 0); // cooked too long: it goes off in your hand
    this.spawnGrenade(id, origin, vel, c, fuse, type);
    this.emit(['gren', id, +origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2), +vel.x.toFixed(2), +vel.y.toFixed(2), +vel.z.toFixed(2), c.id, +fuse.toFixed(2), type]);
  }

  // the knife slingshot: a throwing knife straight down the aim line from the eye, no spread, a little drop
  slingShot(shooter, def, origin, dir) {
    this.audio.play('melee', shooter === this.player ? null : shooter.pos);   // the band's snap
    if (shooter === this.player) this.playerCtl.addShake(0.08);
    if (this.mode === 'guest') return;   // the host flies it and tells everyone
    const S = def.sling, d = dir.clone().normalize();
    const hit = this.physics.raycast(origin, d, 0.55);
    const start = origin.clone().addScaledVector(d, hit ? Math.max(0, hit.t - 0.15) : 0.4);
    const vel = d.multiplyScalar(S.speed);
    const id = (this.grenadeSeq = (this.grenadeSeq || 0) + 1);
    this.spawnGrenade(id, start, vel, shooter, 8, 'knife');
    Object.assign(this.grenades[this.grenades.length - 1], { wid: 'sling', grav: S.drop, dmg: S.damage, noPick: true });
    this.emit(['gren', id, +start.x.toFixed(2), +start.y.toFixed(2), +start.z.toFixed(2), +vel.x.toFixed(2), +vel.y.toFixed(2), +vel.z.toFixed(2), shooter.id, 8, 'knife']);
    if (!def.quiet) this.reportIntel(this.ffa ? 1 : 1 - shooter.team, shooter.pos);
  }

  // one shared mesh per kind of thrown equipment
  equipMesh(type) {
    if (type === 'frag' || !EQUIPMENT[type]) return new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    this.equipGeo = this.equipGeo || {};
    if (!this.equipGeo[type]) {
      const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4, ...o });
      if (type === 'semtex') this.equipGeo[type] = [[new THREE.BoxGeometry(0.1, 0.05, 0.07), M({ color: 0x8a7a52 })], [new THREE.SphereGeometry(0.012, 8, 6).translate(0, 0.028, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1), toneMapped: false })]];
      else if (type === 'knife') {
        const blade = new THREE.Shape(); blade.moveTo(0, -0.012); blade.lineTo(0.16, -0.004); blade.lineTo(0.19, 0.0); blade.lineTo(0.16, 0.012); blade.lineTo(0, 0.012);
        const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.003, bevelEnabled: false }); bg.rotateY(Math.PI / 2); bg.translate(-0.0015, 0, 0);
        this.equipGeo[type] = [[bg, M({ color: 0xb8bcc0, roughness: 0.25, metalness: 1 })], [new THREE.BoxGeometry(0.012, 0.022, 0.1).translate(0, 0, 0.05), M({ color: 0x1b1c1e, roughness: 0.9, metalness: 0 })]];
      } else if (type === 'shock') this.equipGeo[type] = [[new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10).rotateX(Math.PI / 2), M({ color: 0x2a2d33 })], [new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 3.2), toneMapped: false })]];
      else if (type === 'stun') this.equipGeo[type] = [[new THREE.CylinderGeometry(0.03, 0.03, 0.11, 12), M({ color: 0x4b5a3a })], [new THREE.CylinderGeometry(0.031, 0.031, 0.02, 12), M({ color: 0xa8a8a0, metalness: 0.9 })]];
    }
    const g = new THREE.Group();
    for (const [geo, mat] of this.equipGeo[type]) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); }
    return g;
  }

  spawnGrenade(id, origin, vel, owner, fuse = GRENADE.fuse, type = 'frag') {
    const spec = EQUIPMENT[type] || EQUIPMENT.frag;
    const mesh = this.equipMesh(type);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({ id, pos: origin, vel, fuse, owner, mesh, type, spec, prev: origin.clone() });
    if (spec.knife) this.audio.play('melee', owner ? owner.pos : origin);
    else if (owner !== this.player) this.audio.play('pin', owner ? owner.pos : origin); // our own pin was pulled when cooking began
  }

  spawnRocket(id, origin, vel, owner, spec) {
    if (!this.rocketGeo) {
      const body = new THREE.CylinderGeometry(0.045, 0.045, 0.5, 12); body.rotateX(Math.PI / 2);
      const nose = new THREE.ConeGeometry(0.06, 0.28, 12); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -0.38);
      this.rocketGeo = [body, nose];
      this.rocketMats = [new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.6, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0x3a3f2a, roughness: 0.5, metalness: 0.2 })];
      this.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.8), transparent: true, opacity: 0.9, toneMapped: false });
    }
    const mesh = new THREE.Group();
    this.rocketGeo.forEach((geo, k) => mesh.add(new THREE.Mesh(geo, this.rocketMats[k])));
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), this.flameMat); flame.position.z = 0.3; flame.scale.set(1, 1, 2.2); mesh.add(flame);
    mesh.position.copy(origin);
    mesh.lookAt(_a.copy(origin).sub(vel));          // nose (-z) along the flight
    this.scene.add(mesh);
    this.grenades.push({ id, pos: origin, vel, fuse: 6, owner, mesh, rocket: spec });
    if (this.mode === 'guest' && owner !== this.player) this.audio.play('shot', owner && owner.pos, { weapon: 'monte' }); // the host / shooter already played it
  }

  updateRocket(g, dt) {
    // fly in a straight line (a touch of drop), hitting the first wall or player along the way
    const step = g.vel.length() * dt;
    _d.copy(g.vel).normalize();
    let best = step, hit = false, direct = null;
    const w = this.physics.raycast(g.pos, _d, step + 0.1);
    if (w) { best = w.t; hit = true; }
    for (const c of this.characters) {
      if (!c.alive || c.hidden || (c === g.owner && g.fuse > 5.8)) continue;
      if (c.pos.distanceToSquared(g.pos) > (step + 3) * (step + 3)) continue;
      const r = this.rayCharacter(g.pos, _d, c, best);
      if (r.t < best) { best = r.t; hit = true; direct = c; }
    }
    g.pos.addScaledVector(_d, Math.max(0, best - 0.05));
    g.vel.y -= 1.2 * dt;
    g.mesh.position.copy(g.pos);
    g.mesh.lookAt(_a.copy(g.pos).sub(g.vel));
    if (Math.random() < 0.9) this.effects.smoke.spawn(_a.copy(g.pos).addScaledVector(_d, -0.4), _b.set((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4), 0xb8b2a6, 0.18, 1.4, { grow: 2.2, alpha: 0.4, drag: 1.5, gravity: -0.15 });
    return hit ? (direct || true) : null;
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      if (g.rocket) {
        g.fuse -= dt;
        const hit = g.stopped ? null : this.updateRocket(g, dt);
        if (hit && this.mode === 'guest') g.stopped = true;   // wait for the host's explosion
        if ((hit && this.mode !== 'guest') || g.fuse <= (this.mode === 'guest' ? -1.5 : 0)) {
          if (this.mode !== 'guest') { g.direct = hit && hit !== true ? hit : null; this.explode(g); }
          this.scene.remove(g.mesh);
          this.grenades.splice(i, 1);
        }
        continue;
      }
      const spec = g.spec || EQUIPMENT.frag;
      // a frag or semtex about to go off next to a bot: "grenade! move!"
      if (this.mode !== 'guest' && !g.warned && (g.type === 'frag' || g.type === 'semtex') && g.fuse < 2) {
        g.warned = true;
        const near = this.characters.find(c => c.isBot && c.alive && c !== g.owner && c.pos.distanceTo(g.pos) < 7);
        if (near) this.callout(near, 'grenade', 0.8, false, true);
      }
      if (spec.knife || spec.sticky) { if (this.updateStickyOrKnife(g, spec, dt)) { this.scene.remove(g.mesh); this.grenades.splice(i, 1); } continue; }
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

  // knives and sticky charges: swept along their path so they can't tunnel through a wall or a player.
  // Returns true when it's finished (exploded, done shocking, or a knife that has lain there long enough).
  updateStickyOrKnife(g, spec, dt) {
    const host = this.mode !== 'guest';
    if (!g.stuck && !g.attach) {
      g.prev.copy(g.pos);
      g.vel.y -= GRAV * (g.grav ?? (spec.knife ? 0.3 : 1)) * dt;
      const step = g.vel.length() * dt;
      if (step > 1e-5) {
        _d.copy(g.vel).normalize();
        const wall = this.physics.raycast(g.prev, _d, step + 0.05);
        let best = wall ? wall.t : step, who = null;
        for (const c of this.characters) {
          if (!c.alive || c === g.owner || c.hidden) continue;
          if (spec.knife && g.owner && !this.foes(g.owner, c) && !this.settings.friendlyFire) continue;   // a knife flies past your own side
          if (c.pos.distanceToSquared(g.prev) > (step + 3) * (step + 3)) continue;
          const r = this.rayCharacter(g.prev, _d, c, best);
          if (r.t < best) { best = r.t; who = c; g.head = r.head; }
        }
        g.pos.copy(g.prev).addScaledVector(_d, Math.max(0, best - 0.02));
        if (who) {
          if (spec.knife) {
            if (host && (this.foes(g.owner || who, who) || this.settings.friendlyFire)) {
              const wasAlive = who.alive;
              who.hitReact(g.pos, _d, 1.6, !!g.head);
              who.takeDamage(g.dmg ?? spec.damage, g.owner, g.wid || 'knife', !!g.head, g.owner ? g.owner.pos : g.pos);
              if (g.owner) this.notify(g.owner, 'hit', wasAlive && !who.alive, !!g.head);
              this.audio.play('meleehit', who.pos);
              this.emit(['boom', g.id, +g.pos.x.toFixed(2), +g.pos.y.toFixed(2), +g.pos.z.toFixed(2), 'knife']);
            }
            return true;
          }
          g.attach = who; g.off = g.pos.clone().sub(who.pos);   // stuck to a player
          this.audio.play('bounce', g.pos);
        } else if (wall) {
          g.stuck = true;
          this.audio.play(spec.knife ? 'impact' : 'bounce', g.pos);
          if (spec.knife) {
            // point first and a few centimetres in, where it can be picked up again for a while
            g.fuse = 20;
            g.mesh.lookAt(_a.copy(g.pos).sub(g.vel));
            g.pos.addScaledVector(_d, 0.06);
          }
        }
      }
      // in flight a knife turns end over end (about three turns a second), a grenade tumbles
      if (spec.knife && !g.stuck) { g.mesh.lookAt(_a.copy(g.pos).sub(g.vel)); g.spin = (g.spin || 0) + dt * 19; g.mesh.rotateX(g.spin); }
      else if (!spec.knife) g.mesh.rotation.x += 12 * dt;
    }
    if (g.attach) {
      if (g.attach.alive) g.pos.copy(g.attach.pos).add(g.off);
      else g.attach = null, g.stuck = true;
    }
    g.mesh.position.copy(g.pos);
    g.fuse -= dt;
    if (spec.knife && g.stuck && host && !g.noPick) {
      // walk over a knife in a wall or the floor to take it back (anyone carrying throwing knives, up to the max)
      for (const c of this.characters) {
        if (!c.alive || c.lethal !== 'knife' || c.grenades >= spec.max) continue;
        const dx = c.pos.x - g.pos.x, dz = c.pos.z - g.pos.z, dy = g.pos.y - c.pos.y;
        if (dx * dx + dz * dz > 1.4 * 1.4 || dy < -0.6 || dy > 2.0) continue;
        c.grenades++;
        this.notify(c, 'kpick');
        this.emit(['boom', g.id, +g.pos.x.toFixed(2), +g.pos.y.toFixed(2), +g.pos.z.toFixed(2), 'kpick']);
        return true;
      }
    }
    if (spec.knife) return g.fuse <= 0;
    // semtex light blinks faster as it's about to go
    if (g.mesh.children[1]) g.mesh.children[1].visible = Math.sin(this.time * (g.fuse < 0.8 ? 40 : 14)) > 0;
    if (spec.shock) {
      if (g.fuse > 0) return false;
      g.pulseT = (g.pulseT ?? 0) - dt;
      if (g.pulseT <= 0) {
        g.pulses = (g.pulses ?? spec.pulses);
        if (g.pulses <= 0) return true;
        g.pulses--; g.pulseT = 0.42;
        if (host) this.shockPulse(g, spec);
      }
      return false;
    }
    if (g.fuse <= (host ? 0 : -1.5)) { if (host) this.explode(g); return true; }
    return false;
  }

  shockPulse(g, spec) {
    const pos = g.pos;
    this.equipFx('shock', pos);
    this.emit(['boom', g.id, +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2), 'shock']);
    const src = _a.copy(pos); src.y += 0.2;
    for (const c of this.characters) {
      if (!c.alive) continue;
      const cp = c.chestPos(new THREE.Vector3()), d = cp.distanceTo(pos);
      if (d > spec.radius && c !== g.attach) continue;
      if (c !== g.attach && this.physics.blocked(src, cp)) continue;
      c.stun(spec.stun); this.notify(c, 'stun', spec.stun);
      const before = c.health, wasAlive = c.alive;
      c.takeDamage(spec.damage * (c === g.attach ? 1.5 : 1), g.owner, 'shock', false, pos);
      if (g.owner && c !== g.owner && c.health < before) this.notify(g.owner, 'hit', wasAlive && !c.alive, false);
    }
  }

  // effects for the equipment that isn't a plain explosion (also run on guests from the host's 'boom' event)
  equipFx(type, pos) {
    if (type === 'shock') {
      this.effects.flashLight(pos, 30, 0.12, 0x6ab8ff);
      for (let k = 0; k < 10; k++) this.effects.debrisChip(pos, new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8), 0x9fd8ff, 0.025);
      this.audio.play('impact', pos); this.audio.play('ui', pos, { freq: 5200 });
      if (this.player && this.player.alive && this.player.pos.distanceTo(pos) < 6) this.playerCtl.addShake(0.3);
    } else if (type === 'stun') {
      this.effects.flashLight(pos, 70, 0.18, 0xdfe8ff);
      this.effects.flashes.spawn(pos, new THREE.Vector3(), 0xe8f0ff, 2.6, 0.12, { alpha: 1 });
      this.effects.smoke.spawn(pos, new THREE.Vector3(0, 0.6, 0), 0xd8d8d0, 0.6, 1.4, { grow: 1.4, alpha: 0.25, drag: 2 });
      this.audio.play('explosion', pos);
    } else if (type === 'knife') {
      this.audio.play('meleehit', pos);
    } else this.explosionFx(pos);
  }

  removeGrenade(id) {
    const i = this.grenades.findIndex(g => g.id === id);
    if (i >= 0) { this.scene.remove(this.grenades[i].mesh); this.grenades.splice(i, 1); }
  }

  explosionFx(pos) {
    this.effects.explosion(pos);
    this.audio.play('explosion', pos);
    if (this.player && this.player.alive && this.player.pos.distanceTo(pos) < 8) this.audio.play('tinnitus', null, { ui: true, k: 1 - this.player.pos.distanceTo(pos) / 10 });   // ears ringing
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
    if (g.spec && g.spec.slot === 'tactical') { this.stunBurst(g); return; }
    this.explosionFx(pos);
    this.emit(['boom', g.id, +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)]);
    const src = _a.copy(pos); src.y += 0.25;
    if (g.rocket) src.addScaledVector(_d.copy(g.vel).normalize(), -0.3);   // just in front of the wall it hit
    const R = g.rocket ? g.rocket.radius : (g.spec ? g.spec.radius : GRENADE.radius), DMG = g.rocket ? g.rocket.damage : (g.spec ? g.spec.damage : GRENADE.damage), wid = g.rocket ? 'monte' : g.type === 'semtex' ? 'semtex' : 'grenade';
    if (this.breakables) this.breakables.blast(pos, R * 0.8, g.owner);
    for (const c of this.characters) {
      if (!c.alive) continue;
      const cp = c.chestPos(new THREE.Vector3());
      const d = cp.distanceTo(pos);
      if (d > R && c !== g.direct) continue;
      if (c !== g.direct && this.physics.blocked(src, cp) && this.physics.blocked(src, c.headPos(_b))) continue;
      const dmg = DMG * Math.pow(Math.max(0, 1 - d / R), 1.3) + 5 + (c === g.direct ? g.rocket.direct : 0);
      c.hitReact(cp, _b.subVectors(cp, pos).setY(Math.max(0.2, cp.y - pos.y)), 1.5 + 2.5 * Math.max(0, 1 - d / R), false, 3 * Math.max(0, 1 - d / R));
      const wasAlive = c.alive;
      const before = c.health;
      c.takeDamage(dmg, g.owner, wid, false, pos);
      if (g.owner && c !== g.owner && c.health < before) this.notify(g.owner, 'hit', wasAlive && !c.alive, false);
    }
  }

  // stun grenade: no damage; everyone in the blast with a line to it is slowed (closer = longer)
  stunBurst(g) {
    const pos = g.pos, spec = g.spec;
    this.equipFx('stun', pos);
    this.emit(['boom', g.id, +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2), 'stun']);
    const src = _a.copy(pos); src.y += 0.25;
    for (const c of this.characters) {
      if (!c.alive) continue;
      const hp = c.headPos(new THREE.Vector3()), d = hp.distanceTo(pos);
      if (d > spec.radius || this.physics.blocked(src, hp)) continue;
      if (c !== g.owner && g.owner && !this.foes(g.owner, c) && !this.settings.friendlyFire) continue;
      const sec = spec.stun * (0.35 + 0.65 * (1 - d / spec.radius)) * (c === g.owner ? 0.5 : 1);
      c.stun(sec); this.notify(c, 'stun', +sec.toFixed(2));
      if (g.owner && c !== g.owner) this.notify(g.owner, 'hit', false, false);
    }
  }

  // ---------- voice: the announcer and the characters' callouts (recordings, docs/voice-lines.md) ----------
  // announcer lines are named after the banner or medal they go with: 'DOUBLE KILL' -> vo/announcer/double_kill
  announce(what) {
    const id = String(what).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    // the small stuff (a double, a three-kill streak, every gun in Gun Game) is a medal on screen, no voice: the
    // announcer is kept for moments that matter, and the lead changing hands is said at most once a minute
    if (!id || ANNOUNCE_QUIET.has(id)) return;
    if (id === 'lead_taken' || id === 'lead_lost') { if (this.time - (this.leadSaidT ?? -99) < 60) return; this.leadSaidT = this.time; }
    const pack = `vo/announcer/${this.matchAnnouncer || this.announcerPack}/`, play = () => this.audio.play('vo', null, { id: pack + id, ui: true, announcer: true });
    // (an announcer still loading, a match started straight after the last: wait a moment for it rather than skip the line)
    if (!this.audio.manifest || this.audio.samples.has(pack + id)) play();
    else { const t0 = performance.now(); this.audio.want(pack).then(() => { if (performance.now() - t0 < 3000) play(); }); }
  }
  pickAnnouncer() {
    const s = this.announcerSetting, others = ANNOUNCERS.filter(a => a !== this.announcerPack);
    this.announcerPack = ANNOUNCERS.includes(s) ? s : others[(Math.random() * others.length) | 0];
    this.audio.want(`vo/announcer/${this.announcerPack}/`);
  }
  // every character keeps one voice for the match, nobody sharing one while there are voices to go round; handed
  // out by name, so every machine online gives the bots the same voices (yours is your choice in Options)
  assignVoices() {
    const used = new Set(), list = [...this.characters].sort((a, b) => (b === this.player) - (a === this.player) || String(a.name).localeCompare(String(b.name)));
    for (const c of list) {
      let i = nameHash(c.name) % VOICES.length;
      for (let k = 0; k < VOICES.length && used.has(VOICES[i]); k++) i = (i + 1) % VOICES.length;
      c.voice = c === this.player && this.operatorVoice ? this.operatorVoice : VOICES[i];
      used.add(c.voice);
      this.audio.want(`vo/chatter/${c.voice}/`);
    }
  }
  // a character's callout (reloading, frag out, contact...), kept the way Black Ops does it: rare, short and worth
  // hearing. Your squad comes over the radio (in person when they're beside you), the other side only when they're
  // close enough to give themselves away, you yourself only throwing something, and one line at a time: after one,
  // nobody else chimes in for a while unless it's urgent (a grenade at someone's feet, a plant, the last one alive).
  // Returns about how long the line runs (0 if nothing was said), so banter can wait for it.
  callout(c, kind, chance = 1, remote = false, urgent = false) {
    if (!c || !c.alive || Math.random() > chance) return 0;
    const t = this.time, me = c === this.player, p = this.player;
    if (me && !kind.endsWith('_out') && kind !== 'reloading') return 0;
    if (!remote && t - (c.calloutT ?? -99) < (urgent ? 1.2 : 8)) return 0;
    if (!remote) c.calloutT = t;
    if (!remote && this.mode === 'host') this.emit(['co', c.id, kind]);   // (everyone online decides for themselves what reaches them)
    // what reaches you, and how
    const mate = !me && p && !this.ffa && !c.infected && c.team === p.team, dist = p ? c.pos.distanceTo(p.pos) : 0;
    const radio = mate && dist > 6;
    if (!me && !c.infected && dist > 15 && !(radio && RADIO_KINDS.has(kind))) return 0;   // (a throw or a reload across the map is no use to you)
    if (!urgent && t - (this.calloutT ?? -99) < 7) return 0;
    this.calloutT = t;
    if (!c.voice) { c.voice = VOICES[nameHash(c.name) % VOICES.length]; this.audio.want(`vo/chatter/${c.voice}/`); }   // joined mid-match
    // explicit language on: about half the time, the version with the swearing (where that line has one)
    const base = `vo/chatter/${c.voice}/`, x = this.explicit && Math.random() < 0.65 && this.audio.samples.has(`${base}x_${kind}`);
    const id = c.infected ? `vo/infected/${kind}` : base + (x ? 'x_' : '') + kind, ui = me || radio;
    const say = () => (c.alive ? this.audio.play('vo', ui ? null : c.pos, { id, ui, radio, vol: me ? 0.5 : radio ? 0.42 : 0.85 }) || 0 : 0);
    // (their voice still loading, the first seconds of a match: say it as soon as it's in, if that's soon)
    if (c.infected || !this.audio.manifest || this.audio.samples.has(id)) return say() || 2.5;
    const t0 = performance.now(); this.audio.want(`vo/chatter/${c.voice}/`).then(() => { if (performance.now() - t0 < 1500) say(); });
    return 3;
  }

  // ---------- the match intro: held until everyone's in, then the countdown, the announcer and the squad ----------
  // The countdown waits for this machine's loading screen and, hosting online, for every player to report they've
  // loaded (20 s at most: someone stuck doesn't hold everyone).
  introReady() { this.introLocal = true; this.tryIntro(); }
  tryIntro() {
    if (!this.introHold || (!this.introLocal && this.introHoldT < 12)) return;   // (12 s: a loading screen that never reported back)
    const waiting = this.session && this.session.remotes ? [...this.session.remotes.values()].some(r => !r.ready) : false;
    if (waiting && this.introHoldT < 20) return;
    this.introHold = false;
    this.music.hype(this.countdownT);
    this.announce(`mode_${this.settings.mode}`);
    // then a few of your squad, one after another (each waits for the last to finish), while the countdown runs
    const squad = shuffle(this.characters.filter(c => c.isBot && c.alive && (this.ffa || c.team === this.player.team))), token = this.matchToken;
    let i = 0;
    const next = (gap) => setTimeout(() => {
      if (this.matchToken !== token || !this.live || i >= Math.min(3, squad.length)) return;
      // not over the announcer (the mode line can run 4 s), and not into FIGHT: a line needs 4.5 s of countdown left
      const a = this.audio, left = a.ctx ? a.voUntil - a.ctx.currentTime : 0;
      if (left > 0.05) { next(left + 0.5); return; }
      if (this.countdownT < 4.5) return;
      const c = squad[i++]; c.calloutT = -9; this.calloutT = -9;
      next(this.callout(c, 'banter') + 0.7 + Math.random() * 0.6);
    }, gap * 1000);
    next(1.2);   // (the announcer names the mode first; the first line waits for it to finish)
  }
  // walking past a teammate who isn't fighting: now and then, by chance, they've got something to say
  walkByBanter(dt) {
    this.walkByT = (this.walkByT || 0) - dt;
    const p = this.player;
    if (this.walkByT > 0 || !p || !p.alive || this.frozen || this.ffa || this.mode === 'guest') return;
    this.walkByT = 0.5;
    if (this.walkBySaid !== undefined || this.time - p.lastFireT < 6) return;   // (once a match at most: a surprise, not a habit)
    for (const c of this.characters) {
      if (!c.isBot || !c.alive || c.team !== p.team || c.pos.distanceTo(p.pos) > 4.5 || this.time - c.lastFireT < 6 || this.time - (c.walkByT ?? -99) < 60) continue;
      c.walkByT = this.time;   // (each teammate gets one roll a minute, so standing next to one isn't a jukebox)
      if (Math.random() < 0.15 && this.callout(c, 'banter')) this.walkBySaid = this.time;
      return;
    }
  }

  onDamaged(victim, attacker, amount, headshot, fromPos) {
    if (victim.isBot) this.brains.get(victim)?.onDamaged(attacker, amount, fromPos, headshot);
    else this.notify(victim, 'dmg', attacker !== victim && fromPos ? +fromPos.x.toFixed(1) : null, fromPos ? +fromPos.z.toFixed(1) : 0);
    if (attacker && attacker !== victim && attacker.isBot) this.brains.get(attacker)?.onHit(victim, amount);   // (the shooter keeps count: a wounded one gets chased)
  }

  onKill(killer, victim, weaponId, headshot) {
    victim.alive = false;
    (this.recentDeaths || (this.recentDeaths = [])).push({ x: victim.pos.x, z: victim.pos.z, t: this.time, team: victim.team }); // spawns avoid fresh fights; bots walk in aimed
    victim.deaths++;
    victim.streak = 0;
    victim.respawnT = PLAYER.respawnDelay;
    victim.deathT = this.time;
    victim.deathDir = Math.random() < 0.5 ? 1 : -1;
    victim.killer = killer;
    victim.vel.set(0, 0, 0);
    victim.adsT = 0;
    victim.slideT = 0;

    const enemyKill = this.foes(killer, victim);
    if (enemyKill) {
      killer.kills++;
      killer.streak++;
      const bonus = (headshot ? SCORE.headshot : 0) + (weaponId === 'melee' ? SCORE.melee : 0);
      killer.score += SCORE.kill + bonus;
      if (this.gg) this.ggPromote(killer, weaponId, victim);
      else if (!this.gm && !this.ffa && !this.inf) this.scores[killer.team]++; // round modes score rounds, not kills; FFA scores players; Infected counts heads
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
    } else if (killer && killer !== victim && !this.foes(killer, victim)) {
      killer.score = Math.max(0, killer.score - SCORE.kill);
    } else {
      victim.score = Math.max(0, victim.score - 50);
    }

    for (const [c, rec] of victim.damagers) {
      if (c === killer || !this.foes(c, victim) || this.time - rec.t > 10 || rec.dmg < 20) continue;
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
    if (this.inf) this.infectedKill(killer, victim);
    // chatter: the killer calls it, a teammate of the fallen nearby calls that
    if (enemyKill && killer && killer.isBot) { this.callout(killer, 'enemy_down', 0.15); this.brains.get(killer)?.onKill(victim); }
    if (!this.ffa) {
      // round modes: the last one left on a team says so; otherwise a teammate nearby calls the loss
      const left = this.gm ? this.characters.filter(c => c.alive && c !== victim && c.team === victim.team) : [];
      if (left.length === 1 && left[0].isBot) this.callout(left[0], 'last_alive', 0.9, false, true);
      else { const mate = this.characters.find(c => c.isBot && c.alive && c !== victim && c.team === victim.team && c.pos.distanceTo(victim.pos) < 25); if (mate) this.callout(mate, 'man_down', 0.4); }
      // the trade: the nearest bot teammate who isn't already fighting goes for the killer (most of the time)
      if (enemyKill && killer && killer.alive) {
        let best = null, bd = 20;
        for (const [c, br] of this.brains) { if (!c.alive || c === victim || c.team !== victim.team || br.visible || br.goalKind === 'cover') continue; const dd = c.pos.distanceTo(victim.pos); if (dd < bd) { bd = dd; best = br; } }
        if (best && Math.random() < 0.7) best.onMateDown(victim, killer);
      }
    }
    // Team Deathmatch: the lead changing hands
    if (!this.gm && !this.ffa && !this.inf && enemyKill && this.player) {
      const lead = this.scores[0] > this.scores[1] ? 0 : this.scores[1] > this.scores[0] ? 1 : -1;
      if (lead !== this.leadTeam && lead >= 0) this.announce(lead === this.player.team ? 'lead_taken' : 'lead_lost');
      this.leadTeam = lead;
    }
    if (this.gm) this.gm.onKill(killer, victim);
    else if (Math.random() < 0.5 && !(this.inf && victim.team === 1)) this.dropAmmo(victim.pos);
    const reached = this.ffa ? (this.gg ? killer && killer.ggLevel : killer && killer.kills) >= this.settings.scoreLimit : killer && this.scores[killer.team] >= this.settings.scoreLimit;
    if (!this.gm && !this.inf && enemyKill && reached && this.endT <= 0) {
      this.endT = 1.4;
      this.hud.medal((this.ffa ? killer === this.player : killer.team === this.player.team) ? 'VICTORY' : 'DEFEAT', this.gg ? `${killer.name.toUpperCase()} FINISHED THE LADDER` : 'SCORE LIMIT REACHED');
    }
  }

  // Gun Game: a kill moves the killer up a gun (now, mid-life); a knife kill also sends the victim down one
  ggPromote(killer, weaponId, v) {
    killer.ggLevel = Math.min(GUN_LADDER.length, (killer.ggLevel || 0) + 1);
    if (!this.ffa) this.scores[killer.team] = Math.max(this.scores[killer.team], killer.ggLevel);
    if (killer.ggLevel < GUN_LADDER.length) {
      const l = soloLoadout(GUN_LADDER[killer.ggLevel]);
      killer.pendingLoadout = null;
      killer.setLoadout(l);
      killer.weapons.forEach(w => w.refill());
      killer.switchT = 0.4;
      this.emit(['lo', killer.id, killer.loadout]);
      if (!killer.isBot) this.notify(killer, 'medal', killer.ggLevel === GUN_LADDER.length - 1 ? 'FINAL WEAPON' : 'NEW WEAPON', WEAPONS[GUN_LADDER[killer.ggLevel]].name.toUpperCase());
    }
    if (weaponId === 'melee') {
      if (v.ggLevel > 0) {
        v.ggLevel--; v.pendingLoadout = soloLoadout(GUN_LADDER[v.ggLevel]);
        if (!v.isBot) this.notify(v, 'medal', 'HUMILIATED', 'DOWN ONE WEAPON');
      }
    }
  }

  // ---------- Infected ----------
  // a survivor killed comes back infected; tally who's left, end the match when nobody survives
  infectedKill(killer, victim) {
    if (victim.team === 0 && !victim.infectNext) {
      victim.infectNext = true;
      if (!victim.isBot) this.notify(victim, 'medal', 'INFECTED', 'YOU COME BACK AS ONE OF THEM');
      if (killer && killer !== victim && killer.team === 1 && !killer.isBot) { this.notify(killer, 'medal', 'INFECTED', victim.name.toUpperCase()); this.notify(killer, 'score', 'INFECTED', 50); killer.score += 50; }
    }
    this.infTally();
  }
  infTally() {
    if (!this.inf || this.mode === 'guest') return;
    const surv = this.characters.filter(c => c.team === 0 && !c.infectNext);
    // nobody infected (patient zero left the match): a survivor turns, there and then
    if (surv.length > 1 && !this.characters.some(c => c.team === 1 || c.infectNext)) {
      const z = surv.splice((Math.random() * surv.length) | 0, 1)[0];
      z.setTeam(1); this.emit(['team', z.id, 1]);
      this.infectedKit(z); if (z.pendingLoadout) { z.setLoadout(z.pendingLoadout); z.pendingLoadout = null; this.emit(['lo', z.id, z.loadout]); }
      this.infectedKit(z, true);
      if (!z.isBot) this.notify(z, 'medal', 'YOU ARE INFECTED', 'KILL THE SURVIVORS');
    }
    this.scores = [surv.length, this.characters.length - surv.length];
    this.settings.scoreLimit = this.characters.length;
    if (surv.length === 1 && !surv[0].lastSurvivor) {
      surv[0].lastSurvivor = true;
      if (!surv[0].isBot) this.notify(surv[0], 'medal', 'LAST SURVIVOR', 'HOLD ON');
      surv[0].score += 100;
    }
    if (!surv.length && this.live && this.endT <= 0) {
      this.endT = 1.4;
      this.hud.medal('VICTORY', 'NO SURVIVORS LEFT');   // by now everyone (you too) is infected
    }
  }
  // the infected's kit: a knife (fire strikes, no gun), a throwing knife, no tactical. before: set the loadout
  // to apply at the spawn; after (true): the equipment, once the spawn has refilled everything
  infectedKit(c, after = false) {
    if (!this.inf || c.team !== 1) return;
    if (!after) { if (c.loadout !== INF_LOADOUT) c.pendingLoadout = INF_LOADOUT; return; }
    c.lethal = 'knife'; c.grenades = 1; c.tactical = c.tactical || 'stun'; c.tacticals = 0;
  }

  respawn(c) {
    if (this.inf && c.infectNext) { c.infectNext = false; c.setTeam(1); this.emit(['team', c.id, 1]); }
    this.infectedKit(c);
    const p = this.chooseSpawn(c.team);
    if (this.gg) c.pendingLoadout = soloLoadout(GUN_LADDER[Math.min(c.ggLevel || 0, GUN_LADDER.length - 1)]);
    else if (c.isBot && Math.random() < 0.3) c.pendingLoadout = botLoadout(c.primaryId);
    const before = c.loadout;
    c.spawn(p, this.spawnYawOut);
    this.infectedKit(c, true);
    if (c.loadout !== before) this.emit(['lo', c.id, c.loadout]);
    if (c.isBot) this.brains.get(c).reset();
    if (!c.isBot) this.notify(c, 'spawn', +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +c.yaw.toFixed(3));
  }

  // Respawn point, Call of Duty style: any spawn on the map can be used (in Team Deathmatch), so the
  // spawns "flip" when one side pushes into the other's. Points are scored by how far the nearest enemy
  // is, whether an enemy can see the point (much worse if they're looking that way), recent deaths
  // there, and how close friendlies are. The yaw to face comes back in this.spawnYawOut.
  chooseSpawn(team) {
    const flip = !this.gm;
    const sets = this.anywhere() ? ['ffa'] : flip ? [team, 1 - team] : [this.gm.sideOf ? this.gm.sideOf(team) : team];
    let best = null, bestScore = -Infinity, bestYaw = this.world.spawnYaw[team];
    this.recentDeaths = (this.recentDeaths || []).filter(d => this.time - d.t < 8);
    for (const set of sets) {
      for (const s of set === 'ffa' ? (this.ffaSpawns || [...this.world.spawns[0], ...this.world.spawns[1]]) : this.world.spawns[set]) {
        let minEnemy = 80, crowd = false, threat = 0, friends = 0;
        for (const c of this.characters) {
          if (!c.alive) continue;
          const dx = s.x - c.pos.x, dz = s.z - c.pos.z, d = Math.hypot(dx, dz);
          if (d < 1.5) crowd = true;
          if (!this.ffa && c.team === team) { if (d < 22) friends++; continue; }
          minEnemy = Math.min(minEnemy, d);
          if (d < 55 && !this.physics.blocked(c.eyePos(_a), _b.set(s.x, 1.5, s.z))) {
            // facing: 1 when the enemy looks straight at the point
            const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
            const facing = d > 0.01 ? (fx * dx + fz * dz) / d : 1;
            threat += facing > 0.5 ? 70 : facing > 0 ? 40 : 20;
          }
        }
        // maps that spawn anyone anywhere: any spot 25 m clear of enemies (and out of their sight) is as good as
        // any other, so it's a real random pick across the map, teams mixed; otherwise as far as it can, near the team
        let score = (this.world.randomSpawns ? Math.min(minEnemy, 25) * 2 + Math.random() * 40 : Math.min(minEnemy, 45) + Math.random() * 5) - threat - (crowd ? 200 : 0);
        if (minEnemy < 12) score -= 60;                                  // never right next to an enemy
        if (minEnemy > 18 && !this.world.randomSpawns) score += Math.min(friends, 3) * 5;   // near the team, away from the fight
        for (const dth of this.recentDeaths) if (Math.hypot(dth.x - s.x, dth.z - s.z) < 10) score -= 15;
        if (set !== team && set !== 'ffa') score -= 8;                   // home spawns win ties
        if (minEnemy >= 80 && !this.world.randomSpawns) score += Math.random() * 30;   // nobody around yet: spread out
        if (score > bestScore) { bestScore = score; best = s; bestYaw = set === 'ffa' ? (this.world.spawnYawAt ? this.world.spawnYawAt(s) : Math.atan2(s.x, s.z)) : this.world.spawnYaw[set]; }
      }
    }
    this.spawnYawOut = bestYaw;
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
    } else if (PROPS.mags) {
      // three rifle magazines lying on their sides (CC-BY 4.0, "Low-Poly AR-15 magazines" by notcplkerry)
      const mags = new THREE.Group();
      for (const pt of PROPS.mags.parts) {
        pt.geo.computeBoundingBox();
        const c = pt.geo.boundingBox.getCenter(new THREE.Vector3());
        if (Math.abs(c.x) < 0.05 && c.z > -0.12 && c.z < 0.27) mags.add(new THREE.Mesh(pt.geo, pt.mat));
      }
      const b = new THREE.Box3().setFromObject(mags), c = b.getCenter(new THREE.Vector3());
      mags.children.forEach(m => m.position.sub(c));
      mags.rotation.z = Math.PI / 2;
      mags.scale.setScalar(1.6 * s);
      mags.position.y = 0.05 * s;
      g.add(mags);
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

  // Warm everything the match will draw, during the loading screen: hidden things (dead / not-yet-seen
  // soldiers, effects, pickups) are made visible for one frame, every soldier is stood in front of the
  // camera, all programs (including the shadow and skinning variants) compile and every texture uploads.
  // Without this the first time you see a bot or a group of bots the game hitches while the GPU catches up.
  // Async: the programs compile gently (see warm.js) while the loading screen keeps animating.
  async prewarm() {
    if (this.warmPromise) await this.warmPromise;
    const r = this.renderer.renderer, hidden = [], moved = [], texs = new Set();
    this.warming = true;
    for (const sc of [this.scene, this.vmScene]) sc.traverse(o => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.characters.forEach((c, i) => {
      const m = c.model && c.model.root; if (!m || c === this.player) return;
      moved.push([m, m.position.clone()]);
      m.position.copy(this.camera.position).addScaledVector(fwd, 5 + (i % 5) * 1.5).add(new THREE.Vector3(((i % 3) - 1) * 1.4, -1.6, 0));
      m.updateMatrixWorld(true);
    });
    for (const sc of [this.scene, this.vmScene]) sc.traverse(o => {
      for (const m of (o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []))
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) if (m[k] && m[k].isTexture) texs.add(m[k]);
    });
    // thrown equipment too, so the first knife or semtex of the match doesn't compile mid-throw
    const eq = [];
    for (const t of ['frag', 'semtex', 'knife', 'shock', 'stun']) { const m = this.equipMesh(t); m.position.copy(this.camera.position).addScaledVector(fwd, 3); this.scene.add(m); eq.push(m); }
    try { await compileGently(r, this.scene, this.camera); await compileGently(r, this.vmScene, this.vmCamera); } catch (_) { /* best effort */ }
    for (const m of eq) this.scene.remove(m);
    for (const t of texs) { try { r.initTexture(t); } catch (_) { /* best effort */ } }
    try { this.renderer.render(1 / 60, true); } catch (_) { /* best effort */ }
    for (const [m, p] of moved) { m.position.copy(p); m.updateMatrixWorld(true); }
    for (const o of hidden) o.visible = false;
    this.warming = false;
  }

  // swap the map: drop the old geometry, collision and nav grid, then build the new one
  // sun shadows cover the whole playable area (bigger maps get a wider shadow frustum)
  fitShadows() {
    const sb = (this.world && this.world.bounds) || { hx: 42, hz: 30 }, ext = Math.max(52, Math.hypot(sb.hx, sb.hz) * 0.95);
    const sun = this.renderer.sun, sc = sun.shadow.camera;
    if (sc.right === ext) return;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.far = Math.max(200, ext * 3.2);
    sc.updateProjectionMatrix();
    sun.position.copy(SUN_DIR).multiplyScalar(Math.max(80, ext * 1.6));
  }

  // Mobile: small props (under 3 m across) aren't drawn beyond quality.cullSmall metres, a few pixels on a phone
  // screen but each one a draw call. Checked a few times a second; only what this hid is shown again.
  buildCullList() {
    for (const o of this.culled || []) o.visible = true;
    this.culled = new Set(); this.cullList = [];
    if (!this.world) return;
    this.world.group.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere, sc = o.getWorldScale(new THREE.Vector3());
      if (bs.radius * Math.max(sc.x, sc.y, sc.z) < 1.5) this.cullList.push(o);
    });
  }
  cullSmall() {
    const far = this.renderer.quality && this.renderer.quality.cullSmall;
    if (!far) { if (this.culled && this.culled.size) { for (const o of this.culled) o.visible = true; this.culled.clear(); } return; }
    this.cullT = (this.cullT || 0) + 1;
    if (this.cullT % 15 || !this.cullList) return;   // (every 15 frames)
    const cam = this.camera.position, f2 = far * far;
    for (const o of this.cullList) {
      _cullV.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const out = _cullV.distanceToSquared(cam) > f2;
      if (out && o.visible) { o.visible = false; this.culled.add(o); }
      else if (!out && this.culled.has(o)) { o.visible = true; this.culled.delete(o); }
    }
  }

  // Options > Show collision: outline every solid box in the world (finds the "invisible walls")
  setCollisionView(on, rebuild = false) {
    if (this.colLines && (!on || rebuild)) { this.scene.remove(this.colLines); this.colLines.geometry.dispose(); this.colLines = null; }
    this.collisionView = on;
    if (!on || this.colLines) return;
    const v = [];
    const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const b of this.physics.boxes) {
      if (b.surface === 'ground' || b.maxy < 0.05 || b.maxy - b.miny > 60) continue;
      const C = [];
      for (const y of [b.miny, b.maxy]) for (const z of [b.minz, b.maxz]) for (const x of [b.minx, b.maxx]) C.push([x, y, z]);
      for (const [a, c] of E) v.push(...C[a], ...C[c]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    this.colLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.colLines.renderOrder = 5;
    this.scene.add(this.colLines);
  }

  loadMap(id, force = false) {
    if (!MAPS[id] || (this.world && this.world.id === id && !force)) return;
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const m of Object.values(this.world.materials)) m.dispose();
      for (const set of Object.values(this.world.textures)) for (const t of Object.values(set)) if (t && t.isTexture && !t.userData.keep) t.dispose();
    }
    if (this.doors) { this.doors.dispose(); this.doors = null; }
    if (this.breakables) { this.breakables.dispose(); this.breakables = null; }
    this.physics.boxes.length = 0;
    this.world = buildWorld(this.scene, this.physics, id);
    this.world.game = this;   // (maps with moving parts carry the characters on them)
    // doors come after the nav grid, so bots path through doorways (and open them on the way)
    if (this.world.doors) this.doors = new Doors(this, this.world.doors);
    this.breakables = this.world.breakables && this.world.breakables.length ? new Breakables(this, this.world.breakables) : null;
    setCharacterDetail(this.world.textures.fabric);
    this.renderer.scanLights();   // the new map's lamps feed the light pool (render.js)
    this.renderer.applyAniso();
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    this.buildPickups();
    // sun shadows cover the whole playable area (bigger maps get a wider shadow frustum)
    const sb = this.world.bounds || { hx: 42, hz: 30 }, ext = Math.max(52, Math.hypot(sb.hx, sb.hz) * 0.95);
    const sc = this.renderer.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.far = Math.max(200, ext * 3.2); sc.updateProjectionMatrix(); this.renderer.sun.position.copy(SUN_DIR).multiplyScalar(Math.max(80, ext * 1.6)); }
    this.fitShadows();
    this.renderer.refreshShadows();
    this.buildCullList();
    if (this.collisionView) this.setCollisionView(true, true);
    this.renderer.setLook(this.world.look);
    this.minimap = null;
    this.warmMap();
    this.effects.clear();
    if (this.onMapChange) this.onMapChange(this.world);
    if (AUDIT) this.audit();
  }

  // ?audit in the URL: check the map (see js/audit.js), mark what's wrong on it, print the report
  async audit() {
    const { auditMap, showAudit } = await import('./audit.js');
    const r = await auditMap(this);
    showAudit(this, r);
    console.log(`[audit] ${r.map}:`, r.counts, r.stats);
    console.table(r.issues.slice(0, 200));
    return r;
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
        const px = c.pos.x - p.pos.x, pz = c.pos.z - p.pos.z;
        if (px * px + pz * pz > 1.21 || Math.abs(c.pos.y - p.pos.y) > 1.2) continue;
        let used = false;
        if (p.type === 'health' && c.health < PLAYER.maxHealth) {
          c.health = Math.min(PLAYER.maxHealth, c.health + 50);
          used = true;
        } else if (p.type === 'ammo') {
          for (const w of c.weapons) {
            if (w.reserve < w.def.reserve) { w.reserve = Math.min(w.def.reserve, w.reserve + w.def.mag * (p.small ? 1 : 2)); used = true; }
          }
          if (!this.gg && c.grenades < GRENADE.max) { c.grenades++; used = true; }
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
