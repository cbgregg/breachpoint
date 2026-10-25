// Game modes. Team Deathmatch is the base game; Gunfight and Search & Destroy are round-based:
// no respawns, a short freeze at the start of each round, first team to N rounds wins.
//
// Gunfight: 2v2, everyone gets the same random loadout (new one every two rounds). 40 s rounds; then a
// capture flag appears in the middle for 10 s of overtime. If nobody takes it, the team with more
// health left wins the round.
// Search & Destroy: one team attacks with a bomb, the other defends two sites (A and B). Plant takes
// 5 s, the bomb goes off 45 s later, defusing takes 7.5 s. Sides switch at halftime.
//
// The host (or the local game vs bots) runs the rules; guests get the state in every snapshot and
// banner events through the event stream, and only draw.
import * as THREE from 'three';
import { PRIMARIES } from './config.js';
import { randomLoadout } from './attachments.js';
import { glyph } from './hud.js';

export const MODES = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', blurb: 'Two squads, respawns on. First team to the score limit wins.' },
  ffa: { id: 'ffa', name: 'Free-for-All', short: 'FFA', ffa: true, killLimit: 30, blurb: 'Every player for themselves, respawns on. First to 30 kills wins; the top three are the winners.' },
  gunfight: {
    id: 'gunfight', name: 'Gunfight', short: 'GUNFIGHT', blurb: '2v2, one life, same loadout for everyone. Overtime flag at 40 s. First to 6 rounds.',
    rounds: true, teamSize: 2, winRounds: 6, maxRounds: 15, roundTime: 40, overtime: 10, freeze: 4, capTime: 3, capRadius: 3, fixedLoadout: true,
  },
  snd: {
    id: 'snd', name: 'Search & Destroy', short: 'S&D', blurb: 'One life. Attackers plant the bomb at A or B, defenders stop them. First to 4 rounds.',
    rounds: true, winRounds: 4, maxRounds: 7, halftime: 3, roundTime: 120, freeze: 5, bombTime: 45, plantTime: 5, defuseTime: 7.5, siteRadius: 2.4, defuseRadius: 1.8,
  },
  // Infected: everyone starts a survivor but one. Whoever the infected kill comes back infected (a knife and a
  // throwing knife, a step faster). Survivors win if anyone's still alive when the time runs out.
  infected: {
    id: 'infected', name: 'Infected', short: 'INFECTED', infected: true, timeLimit: 5,
    blurb: 'One player starts infected. Anyone they kill joins them. Survive 5 minutes, or be the last one standing.',
  },
  gungame: {
    id: 'gungame', name: 'Gun Game', short: 'GUN GAME', ladder: true, ffa: true,
    blurb: 'Free-for-all. Every kill moves you up to the next gun; a knife kill sends the victim back one. The last one is the knife slingshot: one clean hit with it wins.',
  },
};
// Gun Game ladder: rifles down to handguns (free-for-all: each player climbs it on their own).
export const GUN_LADDER = ['rifle', 'kv47', 'br308', 'smg', 'krv45', 'hx60', 'shotgun', 'sa12', 'mr14', 'sniper', 'monte', 'mp18', 'd50', 'r357', 'pistol', 'sling'];   // the knife slingshot last: a kill with it wins
export const MODE_IDS = Object.keys(MODES);

// bomb sites on team 1's side (+x); team 0's are point-mirrored, like the maps themselves
// (about 30 m from the defenders' spawn and 45 m from the attackers': both teams reach them at nearly the same time)
const SITES = { tarsa: [[20, -34.5], [22, 35]], shuran: [[9, -16], [9, 17]], pioneer: [[27, 22], [28, -6]], drivein: [[22, 29.5], [26, -29]] }; // Tarsa: inside the two market halls
const BOMB = { carried: 0, dropped: 1, planted: 2, defused: 3, exploded: 4 };
const PHASE = ['pre', 'live', 'post'];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function createMode(id, game) {
  const cfg = MODES[id];
  return cfg && cfg.rounds ? new RoundMode(game, cfg) : null;
}

class RoundMode {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
    this.id = cfg.id;
    this.round = 0;
    this.phase = 'pre';
    this.postT = 0;
    this.attack = Math.random() < 0.5 ? 0 : 1; // S&D: team attacking in the first half
    this.firstAttack = this.attack;
    this.bomb = { state: BOMB.carried, carrier: null, pos: new THREE.Vector3(), site: -1, planter: null };
    this.act = null;          // plant / defuse / capture in progress: { c, kind, t }
    this.progress = 0; this.progressId = -1; this.progressKind = '';
    this.overtime = false;
    this.flag = { pos: new THREE.Vector3(), team: -1, t: 0 };
    this.loadout = null;
    this.beepT = 0;
    this.buildSpots();
    this.buildVisuals();
    this.buildUI();
  }

  get authority() { return this.g.mode !== 'guest'; }
  get noRespawn() { return true; }
  get fixedLoadout() { return !!this.cfg.fixedLoadout; }
  get defend() { return 1 - this.attack; }
  // Search & Destroy: teams physically swap ends of the map at halftime (like Call of Duty), so the
  // attacking end and the defended sites stay put while the teams change places.
  sideOf(t) { return this.id === 'snd' && this.round > this.cfg.halftime ? 1 - t : t; }
  get defSites() { return this.sites[this.sideOf(this.defend)]; }

  // ---------- setup ----------
  buildSpots() {
    const w = this.g.world, nav = w.nav;
    const near = (x, z) => {
      const ij = nav.nearestOpen(nav.ci(x), nav.cj(z));
      return ij ? new THREE.Vector3(nav.cx(ij[0]), 0, nav.cz(ij[1])) : new THREE.Vector3(x, 0, z);
    };
    // sites[t] = the sites team t defends. Maps can list their own; mirrored maps use SITES.
    // a site can sit on a lower level (the Underground): [x, z, y]
    if (w.sites) this.sites = w.sites.map(list => list.map(([x, z, y]) => { const v = near(x, z); if (y) v.y = y; return v; }));
    else {
      const base = SITES[w.id] || [[9, -16], [9, 16]];
      this.sites = [base.map(([x, z]) => near(-x, -z)), base.map(([x, z]) => near(x, z))];
    }
    // overtime flag: the open-sky spot nearest the middle (not inside a building)
    const ph = this.g.physics, up = new THREE.Vector3(0, 1, 0);
    let best = null, bd = Infinity;
    for (const k of nav.openCells) {
      const x = nav.cx(k % nav.cols), z = nav.cz((k / nav.cols) | 0);
      const d = x * x + z * z;
      if (d >= bd || d > 400) continue;
      if (ph.raycast(_v.set(x, 0.5, z), up, 30)) continue;
      // room to stand around it
      if (!nav.isOpenAt(x + 1.5, z) || !nav.isOpenAt(x - 1.5, z) || !nav.isOpenAt(x, z + 1.5) || !nav.isOpenAt(x, z - 1.5)) continue;
      best = [x, z]; bd = d;
    }
    this.flag.pos.copy(w.flagPos ? near(w.flagPos[0], w.flagPos[1]) : best ? new THREE.Vector3(best[0], 0, best[1]) : near(0, 0));
  }

  buildVisuals() {
    const g = this.g;
    this.group = new THREE.Group();
    const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    this.siteMeshes = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(this.cfg.siteRadius ? this.cfg.siteRadius - 0.12 : 2.3, this.cfg.siteRadius || 2.4, 48), ringMat(new THREE.Color(2.2, 1.5, 0.5)));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.04;
      m.visible = false;
      this.group.add(m);
      this.siteMeshes.push(m);
    }
    // the bomb: a small case with a blinking light
    const bomb = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x2b2f26, roughness: 0.6, metalness: 0.3 }));
    box.position.y = 0.08;
    box.castShadow = true;
    this.bombLed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2) }));
    this.bombLed.position.set(0.12, 0.17, 0.06);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.1), new THREE.MeshStandardMaterial({ color: 0x0f1210, emissive: 0x204020, emissiveIntensity: 0.6 }));
    pad.position.set(-0.08, 0.165, 0);
    bomb.add(box, this.bombLed, pad);
    bomb.visible = false;
    this.bombMesh = bomb;
    this.group.add(bomb);
    // overtime flag
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x8a8a84, metalness: 0.7, roughness: 0.4 }));
    pole.position.y = 1.3;
    this.flagCloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: 0xe8e4da, side: THREE.DoubleSide, roughness: 0.9 }));
    this.flagCloth.position.set(0.47, 2.3, 0);
    this.flagRing = new THREE.Mesh(new THREE.RingGeometry(this.cfg.capRadius - 0.12 || 2.9, this.cfg.capRadius || 3, 48), ringMat(new THREE.Color(2, 2, 2)));
    this.flagRing.rotation.x = -Math.PI / 2;
    this.flagRing.position.y = 0.04;
    flag.add(pole, this.flagCloth, this.flagRing);
    flag.position.copy(this.flag.pos);
    flag.visible = false;
    this.flagMesh = flag;
    this.group.add(flag);
    g.scene.add(this.group);
  }

  buildUI() {
    const hud = document.getElementById('hud');
    const el = document.createElement('div');
    el.id = 'gm';
    el.innerHTML = `<div class="gm-top"><div class="gm-round" id="gm-round"></div><div class="gm-pips"><span class="f" id="gm-pf"></span><span class="e" id="gm-pe"></span></div><div class="gm-sub" id="gm-sub"></div></div>
      <div class="gm-bar" id="gm-bar"><span id="gm-bar-l"></span><i><b id="gm-bar-f"></b></i></div>
      <div class="gm-banner" id="gm-banner"><b id="gm-bt"></b><span id="gm-bs"></span></div>
      <div class="gm-marks" id="gm-marks"></div>`;
    hud.appendChild(el);
    this.ui = el;
    this.marks = new Map();
    document.body.classList.add('rounds');
    document.body.classList.toggle('fixed-loadout', this.fixedLoadout);
  }

  dispose() {
    this.g.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (this.ui) this.ui.remove();
    document.body.classList.remove('rounds', 'fixed-loadout');
    for (const c of this.g.characters) c.busy = false;
  }

  // ---------- rounds (authority) ----------
  start() {
    this.round = 0;
    this.g.scores = [0, 0];
    this.nextRound();
  }

  nextRound() {
    const g = this.g, cfg = this.cfg;
    this.round++;
    this.phase = 'pre';
    this.overtime = false;
    this.act = null; this.progress = 0; this.progressId = -1;
    this.flag.team = -1; this.flag.t = 0;
    if (this.id === 'snd') {
      const swapped = this.round > cfg.halftime;
      this.attack = swapped ? 1 - this.firstAttack : this.firstAttack;
      if (this.round === cfg.halftime + 1) this.announce('half');
    }
    // gunfight: a fresh shared loadout every two rounds
    if (this.fixedLoadout && (this.round - 1) % 2 === 0) this.loadout = randomLoadout(PRIMARIES[(Math.random() * PRIMARIES.length) | 0]);
    for (const t of [0, 1]) {
      const side = this.sideOf(t);
      const spots = [...g.world.spawns[side]].sort(() => Math.random() - 0.5);
      g.characters.filter(c => c.team === t).forEach((c, i) => {
        c.pendingLoadout = this.fixedLoadout ? null : c.pendingLoadout;
        if (this.fixedLoadout && c.loadout !== this.loadout) { c.setLoadout(this.loadout); g.emit(['lo', c.id, c.loadout]); }
        c.spawn(spots[i % spots.length], g.world.spawnYaw[side]);
        c.spawnProtect = 0;
        c.respawnT = Infinity;
        c.busy = false; c.useHeld = false;
        if (c.isBot) g.brains.get(c)?.reset();
        else g.notify(c, 'spawn', +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +c.yaw.toFixed(3));
      });
    }
    for (const gr of g.grenades) g.scene.remove(gr.mesh);
    g.grenades = [];
    if (this.id === 'snd') {
      const atk = g.characters.filter(c => c.team === this.attack);
      // a human attacker gets the bomb more often than not, so you get to plant it
      const humans = atk.filter(c => !c.isBot);
      const pool = humans.length && Math.random() < 0.6 ? humans : atk;
      this.bomb.state = BOMB.carried;
      this.bomb.carrier = pool[(Math.random() * pool.length) | 0] || null;
      this.bomb.site = -1; this.bomb.planter = null;
      this.botSite = Math.random() < 0.5 ? 0 : 1;
    }
    g.countdownT = cfg.freeze;
    g.lastBeep = Math.ceil(cfg.freeze) + 1;
    g.timeLeft = cfg.roundTime;
    g.intel.forEach(i => { i.time = -99; });
    this.announce('round', this.round, this.id === 'snd' ? this.attack : -1);
  }

  alive(t) { return this.g.characters.filter(c => c.team === t && c.alive).length; }

  endRound(winner, reason) {
    if (this.phase === 'post') return;
    const g = this.g;
    this.phase = 'post';
    this.postT = 4.5;
    this.act = null; this.progress = 0; this.progressId = -1;
    for (const c of g.characters) c.busy = false;
    if (winner === 0 || winner === 1) g.scores[winner]++;
    const over = g.scores[0] >= this.cfg.winRounds || g.scores[1] >= this.cfg.winRounds || this.round >= this.cfg.maxRounds;
    this.matchOver = over;
    this.announce('end', winner, reason, over ? 1 : 0);
  }

  update(dt) {
    const g = this.g, cfg = this.cfg;
    if (this.phase === 'pre') {
      if (g.countdownT <= 0) { this.phase = 'live'; this.liveT = g.time; }
      return;
    }
    if (this.phase === 'post') {
      this.postT -= dt;
      if (this.postT <= 0) { if (this.matchOver) g.endMatch(); else this.nextRound(); }
      return;
    }
    const a0 = this.alive(0), a1 = this.alive(1);
    if (this.id === 'gunfight') {
      if (!a0 || !a1) return this.endRound(!a0 && !a1 ? -1 : a0 ? 0 : 1, 'elim');
      if (!this.overtime && g.timeLeft <= 0) {
        this.overtime = true;
        g.timeLeft = cfg.overtime;
        this.announce('ot');
      }
      if (this.overtime) {
        this.updateFlag(dt);
        if (this.phase === 'post') return;
        if (g.timeLeft <= 0) {
          const hp = [0, 1].map(t => g.characters.filter(c => c.team === t && c.alive).reduce((s, c) => s + Math.max(0, c.health), 0));
          this.endRound(Math.abs(hp[0] - hp[1]) < 1 ? -1 : hp[0] > hp[1] ? 0 : 1, 'health');
        }
      }
      return;
    }
    // ---- search & destroy ----
    const A = this.attack, D = this.defend, b = this.bomb;
    const planted = b.state === BOMB.planted;
    if (!planted) {
      if (!this.alive(A)) return this.endRound(D, 'elim');
      if (!this.alive(D)) return this.endRound(A, 'elim');
      if (g.timeLeft <= 0) return this.endRound(D, 'time');
    } else {
      if (!this.alive(D)) return this.endRound(A, 'elim');
      if (g.timeLeft <= 0) return this.detonate();
    }
    // the bomb: carried, dropped (anyone on the attack can grab it), planted
    if (b.state === BOMB.carried && (!b.carrier || !b.carrier.alive || !g.characters.includes(b.carrier))) this.dropBomb(b.carrier ? b.carrier.pos : null);
    if (b.state === BOMB.dropped) {
      for (const c of g.characters) {
        if (!c.alive || c.team !== A) continue;
        if (Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < 1.5 && Math.abs(c.pos.y - b.pos.y) < 1.5) {
          b.state = BOMB.carried; b.carrier = c;
          this.announce('pickup', c.id);
          break;
        }
      }
    }
    // plant / defuse: hold the button in the zone, standing still
    let who = null, kind = '';
    for (const c of g.characters) {
      if (!c.alive || !c.useHeld) continue;
      const z = this.useZone(c);
      if (!z) continue;
      if (this.act && this.act.c === c) { who = c; kind = z; break; }
      if (!who) { who = c; kind = z; }
    }
    if (!this.act || this.act.c !== who || this.act.kind !== kind) {
      if (this.act) this.act.c.busy = false;
      this.act = who ? { c: who, kind, t: 0 } : null;
    }
    if (this.act) {
      const ac = this.act;
      ac.c.busy = true;
      ac.t += dt;
      const need = ac.kind === 'plant' ? cfg.plantTime : cfg.defuseTime;
      this.progress = Math.min(1, ac.t / need);
      this.progressId = ac.c.id; this.progressKind = ac.kind;
      if (ac.t >= need) {
        ac.c.busy = false;
        this.act = null; this.progress = 0; this.progressId = -1;
        if (ac.kind === 'plant') this.plant(ac.c);
        else this.defuse(ac.c);
      }
    } else { this.progress = 0; this.progressId = -1; }
  }

  updateFlag(dt) {
    const g = this.g, f = this.flag, r = this.cfg.capRadius;
    const inside = [0, 0];
    for (const c of g.characters) if (c.alive && Math.hypot(c.pos.x - f.pos.x, c.pos.z - f.pos.z) < r && Math.abs(c.pos.y - f.pos.y) < 2) inside[c.team]++;
    const team = inside[0] && !inside[1] ? 0 : inside[1] && !inside[0] ? 1 : -1;
    if (team >= 0) {
      if (f.team !== team) { f.team = team; f.t = 0; }
      f.t += dt;
      this.progress = Math.min(1, f.t / this.cfg.capTime);
      this.progressKind = 'capture';
      this.progressId = team === 0 ? -10 : -11;
      if (f.t >= this.cfg.capTime) this.endRound(team, 'flag');
    } else if (inside[0] && inside[1]) {
      this.progressKind = 'contested'; // hold progress while contested
    } else { f.team = -1; f.t = 0; this.progress = 0; this.progressId = -1; }
  }

  // where this character can use the action button right now: 'plant' | 'defuse' | null
  useZone(c) {
    if (this.id !== 'snd' || this.phase !== 'live' || !c || !c.alive) return null;
    const b = this.bomb;
    if (b.state === BOMB.carried && b.carrier === c) {
      for (const s of this.defSites) if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < this.cfg.siteRadius && Math.abs(c.pos.y - s.y) < 1.5) return 'plant';
    }
    if (b.state === BOMB.planted && c.team === this.defend && Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < this.cfg.defuseRadius) return 'defuse';
    return null;
  }

  dropBomb(pos) {
    const b = this.bomb, g = this.g;
    b.state = BOMB.dropped;
    b.carrier = null;
    b.pos.copy(pos || this.defSites[0]);
    b.pos.y = b.pos.y < -1 ? b.pos.y : Math.max(0, b.pos.y);   // below ground = the Underground: stays down there
    // don't leave it out of reach on a ledge or tucked against a wall: drop to the nearest open floor
    // cell when it's high up or where nobody can stand (bots path to open cells only)
    if (b.pos.y > 2.5 || (b.pos.y > -1 && !g.world.nav.isOpenAt(b.pos.x, b.pos.z))) {
      const nav = g.world.nav, ij = nav.nearestOpen(nav.ci(b.pos.x), nav.cj(b.pos.z));
      if (ij) b.pos.set(nav.cx(ij[0]), 0, nav.cz(ij[1]));
    }
    this.announce('drop');
  }

  plant(c) {
    const b = this.bomb, g = this.g;
    b.state = BOMB.planted;
    b.carrier = null;
    b.planter = c;
    b.pos.set(c.pos.x, c.pos.y, c.pos.z);
    const sites = this.defSites;
    b.site = sites[0].distanceTo(_v.set(c.pos.x, 0, c.pos.z)) < sites[1].distanceTo(_v) ? 0 : 1;
    g.timeLeft = this.cfg.bombTime;
    c.score += 100;
    if (!c.isBot) g.notify(c, 'score', 'PLANT', 100);
    this.announce('planted', b.site);
  }

  defuse(c) {
    const g = this.g;
    this.bomb.state = BOMB.defused;
    c.score += 100;
    if (!c.isBot) g.notify(c, 'score', 'DEFUSE', 100);
    this.endRound(this.defend, 'defused');
  }

  detonate() {
    const g = this.g, b = this.bomb;
    b.state = BOMB.exploded;
    const p = _w.copy(b.pos);
    g.explosionFx(p);
    g.emit(['boom', -1, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
    for (const c of g.characters) {
      if (!c.alive) continue;
      const d = c.pos.distanceTo(p);
      if (d < 11) { c.spawnProtect = 0; c.takeDamage(d < 7 ? 500 : 140 * (1 - (d - 7) / 4) + 20, b.planter && b.planter.team !== c.team ? b.planter : null, 'bomb', false, p); }
    }
    if (b.planter) { b.planter.score += 100; if (!b.planter.isBot) g.notify(b.planter, 'score', 'DETONATE', 100); }
    this.endRound(this.attack, 'bomb');
  }

  onKill(killer, victim) {
    if (this.id === 'snd' && this.bomb.state === BOMB.carried && this.bomb.carrier === victim) this.dropBomb(victim.pos);
    victim.respawnT = Infinity;
    victim.busy = false;
  }

  // a player who joins mid-round sits out until the next one
  onJoin(c) {
    if (this.phase === 'pre') { c.spawnProtect = 0; c.respawnT = Infinity; return; }
    c.alive = false;
    c.health = 0;
    c.deathT = this.g.time;
    c.respawnT = Infinity;
    if (c.model) c.model.root.visible = false;
  }

  // ---------- bots ----------
  botGoal(brain, b) {
    const g = this.g;
    if (this.phase !== 'live') return null;
    if (this.id === 'gunfight') {
      if (this.overtime) return { pos: this.flag.pos, kind: 'flag' };
      // small map, one life: go find them
      brain.gmT = (brain.gmT || 0) - 0.016;
      if (!brain.gmGoal || brain.gmT <= 0) {
        const foes = g.characters.filter(c => c.alive && c.team !== b.team);
        const f = foes[(Math.random() * foes.length) | 0];
        if (!f) return null;
        brain.gmGoal = new THREE.Vector3(f.pos.x + (Math.random() - 0.5) * 10, 0, f.pos.z + (Math.random() - 0.5) * 10);
        brain.gmT = 5 + Math.random() * 3;
      }
      return { pos: brain.gmGoal, kind: 'push' };
    }
    const bm = this.bomb, A = this.attack;
    const sites = this.defSites;
    if (b.team === A) {
      if (bm.state === BOMB.carried && bm.carrier === b) return { pos: sites[this.botSite], kind: 'plant' };
      if (bm.state === BOMB.dropped) {
        // the nearest attacker fetches it, the others push the site
        let near = null, nd = Infinity;
        for (const c of g.characters) if (c.alive && c.team === A && c.isBot) { const d = c.pos.distanceTo(bm.pos); if (d < nd) { nd = d; near = c; } }
        if (near === b) return { pos: bm.pos, kind: 'bomb' };
      }
      if (bm.state === BOMB.planted) return { pos: this.patrol(brain, bm.pos, 4, 12), kind: 'guard' };
      // don't all rush in one pack: each attacker waits a moment, and some take the other site / a wider route
      if (brain.gmRound !== this.round) {
        brain.gmRound = this.round;
        brain.gmDelay = Math.random() * 6;
        brain.gmSite = Math.random() < 0.65 ? this.botSite : 1 - this.botSite;
      }
      if (g.time - (this.liveT ?? 0) < brain.gmDelay) return null;   // a beat in spawn: normal roaming/look-around
      // push the site; once there (no bomb on us) sweep around it and the approaches instead of parking on a tile
      const site = sites[brain.gmSite];
      if (Math.hypot(b.pos.x - site.x, b.pos.z - site.z) < 12 || brain.gmSwept === this.round) {
        brain.gmSwept = this.round;
        if (Math.random() < 0.0004) brain.gmSite = 1 - brain.gmSite, brain.gmSwept = -1;   // now and then rotate to the other site
        return { pos: this.patrol(brain, site, 6, 18), kind: 'push' };
      }
      return { pos: this.offset(brain, site, 9), kind: 'push' };
    }
    // defenders
    if (bm.state === BOMB.planted) {
      let near = null, nd = Infinity;
      for (const c of g.characters) if (c.alive && c.team === b.team && c.isBot) { const d = c.pos.distanceTo(bm.pos); if (d < nd) { nd = d; near = c; } }
      if (near === b) return { pos: bm.pos, kind: 'defuse' };
      return { pos: this.patrol(brain, bm.pos, 4, 11), kind: 'guard' };
    }
    const mates = g.characters.filter(c => c.team === b.team && c.isBot);
    const idx = mates.indexOf(b);
    // defenders: hold their site, but shift between angles every few seconds; one in three plays a
    // forward/roaming role, and anyone may rotate across once in a while
    if (brain.gmDefRound !== this.round) {
      brain.gmDefRound = this.round;
      brain.gmDefSite = idx % 2;
      brain.gmLurk = Math.random() < 0.33;
    }
    if (Math.random() < 0.0003) brain.gmDefSite = 1 - brain.gmDefSite;
    if (brain.gmLurk) return { pos: this.patrol(brain, sites[brain.gmDefSite], 10, 24, 8, 14), kind: 'push' };
    return { pos: this.patrol(brain, sites[brain.gmDefSite], 3, 10), kind: 'guard' };
  }

  // a spot near p (between rMin and rMax away) that changes every few seconds: bots holding an area
  // move between angles, crouch, look around, instead of standing on one tile all round
  patrol(brain, p, rMin, rMax, tMin = 5, tMax = 11) {
    const g = this.g, nav = g.world.nav;
    if (!brain.gmPatPt) brain.gmPatPt = new THREE.Vector3();
    const moved = brain.gmPatFor && Math.hypot(brain.gmPatFor.x - p.x, brain.gmPatFor.z - p.z) > 3;
    if (!brain.gmPatFor || moved || g.time > (brain.gmPatT || 0)) {
      brain.gmPatFor = (brain.gmPatFor || new THREE.Vector3()).copy(p);
      brain.gmPatT = g.time + tMin + Math.random() * (tMax - tMin);
      let ok = false;
      for (let i = 0; i < 14 && !ok; i++) {
        const a = Math.random() * Math.PI * 2, d = rMin + Math.random() * (rMax - rMin);
        const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        // keep spots a little apart from teammates' spots
        if (!nav.isOpenAt(x, z)) continue;
        let crowd = false;
        for (const [, br] of g.brains) if (br !== brain && br.gmPatPt && br.gmPatFor && Math.hypot(br.gmPatPt.x - x, br.gmPatPt.z - z) < 3) crowd = true;
        if (crowd && i < 10) continue;
        brain.gmPatPt.set(x, p.y || 0, z); ok = true;
      }
      if (!ok) brain.gmPatPt.set(p.x, p.y || 0, p.z);
    }
    brain.gmAnchor = p;
    return brain.gmPatPt;
  }

  // a stable spread around a point per bot, so a team doesn't stack on one tile
  offset(brain, p, r) {
    if (!brain.gmOff || brain.gmOffFor !== this.round) {
      brain.gmOffFor = this.round;
      const nav = this.g.world.nav;
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, d = r * (0.4 + Math.random() * 0.6);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (nav.isOpenAt(p.x + x, p.z + z)) { brain.gmOff = [x, z]; break; }
      }
      brain.gmOff = brain.gmOff || [0, 0];
    }
    brain.gmPt = brain.gmPt || new THREE.Vector3();
    return brain.gmPt.set(p.x + brain.gmOff[0], 0, p.z + brain.gmOff[1]);
  }

  // ---------- network ----------
  netState() {
    const b = this.bomb;
    return [PHASE.indexOf(this.phase), this.round, this.attack, b.state, b.carrier ? b.carrier.id : -1, +b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2), b.site,
      +this.progress.toFixed(3), this.progressId, this.overtime ? 1 : 0, this.flag.team, ['plant', 'defuse', 'capture', 'contested'].indexOf(this.progressKind)];
  }

  applyNet(a) {
    if (!Array.isArray(a) || a.length < 14 || !a.every(Number.isFinite)) return;
    const g = this.g, b = this.bomb;
    this.phase = PHASE[a[0]] || 'live';
    if (a[1] !== this.round) this.round = a[1] | 0;
    this.attack = a[2] === 1 ? 1 : 0;
    b.state = a[3] | 0;
    b.carrier = a[4] >= 0 ? g.charById(a[4]) : null;
    b.pos.set(a[5], a[6], a[7]);
    b.site = a[8] | 0;
    this.progress = Math.max(0, Math.min(1, a[9]));
    this.progressId = a[10] | 0;
    this.overtime = !!a[11];
    this.flag.team = a[12] | 0;
    this.progressKind = ['plant', 'defuse', 'capture', 'contested'][a[13]] || '';
    if (g.player) g.player.busy = this.progress > 0 && this.progressId === g.player.id;
  }

  // banners and sounds: run locally, and sent to guests
  announce(type, ...args) {
    this.onEvent(type, ...args);
    this.g.emit(['gm', type, ...args]);
  }

  onEvent(type, a, b, c) {
    const g = this.g, me = g.player;
    if (!me) return;
    const mine = me.team;
    const ui = (t, s, cls) => this.banner(t, s, cls);
    switch (type) {
      case 'round': {
        if (Number.isFinite(a)) this.round = a | 0;
        if (b === 0 || b === 1) this.attack = b;
        const last = g.scores[0] === this.cfg.winRounds - 1 && g.scores[1] === this.cfg.winRounds - 1;
        const mp = !last && (g.scores[mine] === this.cfg.winRounds - 1 || g.scores[1 - mine] === this.cfg.winRounds - 1);
        const sub = this.id === 'snd' ? (this.attack === mine ? 'ATTACK · PLANT THE BOMB AT A OR B' : 'DEFEND · PROTECT SITES A AND B')
          : 'SAME LOADOUT FOR EVERYONE · ONE LIFE';
        ui(last ? 'FINAL ROUND' : `ROUND ${this.round}`, mp ? `MATCH POINT · ${sub}` : sub, '');
        break;
      }
      case 'half': g.hud.medal('SWITCHING SIDES', 'HALFTIME'); break;
      case 'ot': ui('OVERTIME', 'CAPTURE THE FLAG TO WIN THE ROUND', 'warn'); g.audio.play('beep', null, { ui: true, freq: 880 }); break;
      case 'end': {
        const why = { elim: 'TEAM ELIMINATED', time: 'TIME EXPIRED', bomb: 'TARGET DESTROYED', defused: 'BOMB DEFUSED', flag: 'FLAG CAPTURED', health: 'MORE HEALTH REMAINING' }[b] || '';
        const t = a === mine ? 'ROUND WON' : a === 0 || a === 1 ? 'ROUND LOST' : 'ROUND DRAW';
        ui(t, b === 'health' && a !== 0 && a !== 1 ? 'EQUAL HEALTH' : why, a === mine ? 'win' : a === 0 || a === 1 ? 'lose' : '');
        g.audio.play('horn', null, { ui: true });
        break;
      }
      case 'planted': g.audio.play('beep', null, { ui: true, freq: 660 }); ui('BOMB PLANTED', `SITE ${a === 1 ? 'B' : 'A'} · ${this.attack === mine ? 'DEFEND THE BOMB' : 'DEFUSE IT'}`, 'warn'); break;
      case 'drop': if (this.attack === mine) g.hud.message('BOMB DROPPED'); break;
      case 'pickup': if (this.attack === mine) g.hud.message(a === me.id ? 'YOU HAVE THE BOMB' : 'BOMB PICKED UP'); break;
      default: break;
    }
  }

  banner(title, sub, cls) {
    const el = this.ui.querySelector('#gm-banner');
    el.querySelector('#gm-bt').textContent = title;
    el.querySelector('#gm-bs').textContent = sub || '';
    el.className = `gm-banner on ${cls || ''}`;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => el.classList.remove('on'), 3200);
  }

  // ---------- per frame (everyone): visuals, prompts, markers ----------
  frame(dt) {
    const g = this.g, me = g.player, b = this.bomb;
    if (!me) return;
    const snd = this.id === 'snd';
    if (!me.isBot) me.useHeld = me.alive && !g.frozen && g.input.useHeld;
    // site rings on the defending side
    const sites = snd ? this.defSites : [];
    this.siteMeshes.forEach((m, i) => { m.visible = snd && !!sites[i]; if (sites[i]) m.position.set(sites[i].x, sites[i].y + 0.04, sites[i].z); });
    // bomb on the ground or planted
    const showBomb = snd && (b.state === BOMB.planted || (b.state === BOMB.dropped && me.team === this.attack));
    this.bombMesh.visible = showBomb || (snd && b.state === BOMB.defused);
    if (this.bombMesh.visible) this.bombMesh.position.copy(b.pos);
    if (b.state === BOMB.planted && snd && this.phase === 'live') {
      // beeps speed up as it gets close
      const left = g.timeLeft;
      this.beepT -= dt;
      const rate = left > 20 ? 1 : left > 10 ? 0.5 : left > 5 ? 0.25 : 0.12;
      if (this.beepT <= 0) { this.beepT = rate; g.audio.play('beep', b.pos, { freq: 1400 }); this.ledOn = 0.08; }
    }
    this.ledOn = Math.max(0, (this.ledOn || 0) - dt);
    this.bombLed.visible = b.state === BOMB.planted ? this.ledOn > 0 : b.state !== BOMB.defused;
    // flag
    this.flagMesh.visible = this.id === 'gunfight' && this.overtime && this.phase === 'live';
    if (this.flagMesh.visible) {
      const col = this.flag.team === me.team ? [0.31, 0.7, 1] : this.flag.team >= 0 ? [1, 0.3, 0.3] : [0.93, 0.91, 0.86];
      this.flagCloth.material.color.setRGB(...col);
      this.flagRing.material.color.setRGB(col[0] * 2.2, col[1] * 2.2, col[2] * 2.2);
      this.flagCloth.rotation.y = Math.sin(g.time * 2.2) * 0.25;
    }
    this.updateUI();
  }

  updateUI() {
    const g = this.g, me = g.player, b = this.bomb, snd = this.id === 'snd';
    const $ = (id) => this.ui.querySelector('#' + id);
    const mine = me.team;
    const aw = (t) => g.characters.filter(c => c.team === t);
    const pips = (t) => aw(t).map(c => `<i class="${c.alive ? '' : 'x'}${snd && b.carrier === c && t === mine ? ' bomb' : ''}"></i>`).join('');
    set($('gm-pf'), pips(mine));
    set($('gm-pe'), pips(1 - mine));
    const side = snd ? (this.attack === mine ? 'ATTACKING' : 'DEFENDING') : this.overtime ? 'OVERTIME' : '';
    set($('gm-round'), `ROUND ${this.round}${side ? ` · ${side}` : ''}`);
    let sub = '';
    if (snd && b.state === BOMB.planted) sub = `BOMB PLANTED · SITE ${b.site === 1 ? 'B' : 'A'}`;
    else if (snd && b.carrier === me && me.alive) sub = 'YOU HAVE THE BOMB';
    else if (!me.alive && this.phase === 'live') {
      const spec = g.playerCtl && g.playerCtl.specTarget;
      sub = spec ? `SPECTATING ${spec.name.toUpperCase()}` : 'ELIMINATED · WAITING FOR NEXT ROUND';
    }
    set($('gm-sub'), sub);
    // progress bar: your own plant/defuse, or the flag
    const bar = $('gm-bar');
    const mineAct = this.progress > 0 && (this.progressId === me.id || (this.progressKind === 'capture') || (this.progressKind === 'contested'));
    bar.classList.toggle('on', mineAct || (snd && this.progress > 0 && this.progressKind === 'defuse' && me.team === this.defend));
    if (bar.classList.contains('on')) {
      const label = this.progressKind === 'plant' ? 'PLANTING' : this.progressKind === 'defuse' ? (this.progressId === me.id ? 'DEFUSING' : 'TEAMMATE DEFUSING')
        : this.progressKind === 'contested' ? 'CONTESTED' : this.flag.team === mine ? 'CAPTURING' : 'ENEMY CAPTURING';
      set($('gm-bar-l'), label);
      $('gm-bar-f').style.width = `${(this.progress * 100).toFixed(1)}%`;
      bar.classList.toggle('enemy', this.progressKind === 'capture' && this.flag.team !== mine);
    }
    // use prompt
    const zone = this.authority ? this.useZone(me) : this.guestZone(me);
    const dev = g.hud.device;
    g.hud.objPrompt = zone && !me.busy ? `HOLD ${glyph('reload', dev)}${dev === 'kbm' ? ' / <kbd>F</kbd>' : ''} TO ${zone === 'plant' ? 'PLANT' : 'DEFUSE'}` : '';
    // world markers
    const want = [];
    if (snd) {
      const sites = this.defSites;
      sites.forEach((s, i) => {
        if (b.state === BOMB.planted && b.site !== i) return;
        want.push([`s${i}`, s, i === 0 ? 'A' : 'B', b.state === BOMB.planted ? 'hot' : this.attack === mine ? 'atk' : 'def']);
      });
      if (b.state === BOMB.dropped && this.attack === mine) want.push(['bomb', b.pos, 'BOMB', 'bomb']);
    } else if (this.overtime && this.phase === 'live') {
      want.push(['flag', this.flag.pos, '⚑', this.flag.team === mine ? 'mine' : this.flag.team >= 0 ? 'hot' : '']);
    }
    this.drawMarks(want);
  }

  // guests work out the prompt from the replicated state
  guestZone(c) {
    if (this.id !== 'snd' || this.phase !== 'live' || !c.alive) return null;
    const b = this.bomb;
    if (b.state === BOMB.carried && b.carrier === c) {
      for (const s of this.defSites) if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < this.cfg.siteRadius && Math.abs(c.pos.y - s.y) < 1.5) return 'plant';
    }
    if (b.state === BOMB.planted && c.team === this.defend && Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < this.cfg.defuseRadius) return 'defuse';
    return null;
  }

  drawMarks(want) {
    const g = this.g, cam = g.camera, host = this.ui.querySelector('#gm-marks');
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set();
    for (const [key, p, label, cls] of want) {
      seen.add(key);
      let el = this.marks.get(key);
      if (!el) { el = document.createElement('div'); el.className = 'gm-mark'; host.appendChild(el); this.marks.set(key, el); }
      _v.set(p.x, p.y + 1.6, p.z).project(cam);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      // behind you or off screen: pin to the left / right edge at mid height
      if (behind) { x = _v.x > 0 ? 30 : W - 30; y = H * 0.45; }
      x = Math.max(30, Math.min(W - 30, x)); y = Math.max(70, Math.min(H * 0.7, y));
      const dist = Math.round(Math.hypot(p.x - cam.position.x, p.z - cam.position.z));
      el.style.visibility = dist < 3 ? 'hidden' : '';
      const html = `<b>${label}</b><small>${dist}m</small>`;
      if (el.__h !== html) { el.__h = html; el.innerHTML = html; }
      const c2 = `gm-mark ${cls}`;
      if (el.className !== c2) el.className = c2;
      el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%)`;
    }
    for (const [k, el] of this.marks) if (!seen.has(k)) { el.remove(); this.marks.delete(k); }
  }
}

function set(el, html) { if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } }
