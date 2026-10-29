// Bot AI: perception, goal selection, pathing, aiming, shooting, grenades
import * as THREE from 'three';
import { ROUTE_SEEDS } from './nav.js';
import { DIFFICULTY, PLAYER, BOT_DEFAULTS, EQUIPMENT } from './config.js';
const MELEE_REACH = 2.1;   // Infected bots strike from here (the knife reaches 2.3 m to the chest)

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _bv1 = new THREE.Vector3(), _bv2 = new THREE.Vector3(), _bv3 = new THREE.Vector3(), _bv4 = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BotBrain {
  constructor(bot, game) {
    this.bot = bot;
    this.game = game;
    // its own copy of the difficulty row (over the defaults), so one bot's knobs can be pinned (the bot lab does)
    // without touching the table or the other bots
    this.diff = { ...BOT_DEFAULTS, ...(DIFFICULTY[game.settings.difficulty] || DIFFICULTY.normal) };
    this.wish = new THREE.Vector3();
    this.lastKnown = new THREE.Vector3();
    this.aimErr = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.aimPt = new THREE.Vector3(); this.aimLocal = new THREE.Vector3(0, 1.2, 0);
    this.spot = new Map(); this.expo = 1;
    this.reset();
  }

  reset() {
    this.path = []; this.pathIdx = 0; this.repathT = 0;
    this.goal = null; this.goalKind = 'roam'; this.goalT = 0;
    this.target = null; this.visible = false; this.seenT = 0; this.reactT = 0;
    this.lastKnownT = -99;
    this.perceiveT = Math.random() * 0.15;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
    this.aimErrT = 0; this.aimHead = false; this.aimOff = 1;
    this.burstT = rand(...this.diff.burst); this.pauseT = 0; this.semiT = 0;
    this.stuckT = 1; this.lastPos.copy(this.bot.pos); this.movedAcc = 0;
    this.unstickT = 0; this.stuckN = 0; if (!this.unstickDir) this.unstickDir = new THREE.Vector3();
    this.grenadeT = rand(4, 10);
    this.crouch = false; this.prone = false;
    this.holding = false; this.holdStance = 0; this.lookYaw = null; this.lookT = 0; this.lookPitch = 0;
    this.idleT = 0; this.noPathT = 0;
    this.walkSlow = false;
    // the CoD-style behaviours (each owned by the part of the brain that reads it): how dangerous the ground ahead
    // is and the posture it asks for; the sprint-out delay; the strafe legs; the drop-shot; what hit it and when;
    // cover and the retreat; a lost target; hits dealt and kills made from here; the aim filter and flinch; the
    // peek cycle; a live grenade; the slide; the lane being held; the trade; and the state tag the audit reads
    this.threat = 0; this.cornering = false; this.cornerWp = null; this.cornerAim = false;
    this.sprintOutT = 0; this.wasSprinting = false; this.wasTac = false; this.fightT = 0;
    this.strafeStop = 0; this.strafeOn = true; this.stillT = 0; this.dropT = 0; this.dropRolled = null; this.lowCover = false;
    this.strafeHitT = -99; this.strafeRoll = null;   // (the hit the strafe last reversed on; the target the strafe dice were rolled for)
    this.hurtT = -99; this.dmgT = -99; this.dmgRecent = 0; this.decideT = 0; this.retreatT = -99;
    this.coverHold = 0; this.coverGoal = null; this.atCover = false; this.coverCache = null; this.enemiesVisible = 0;
    this.lostT = -99; this.lostDist = 0; this.watchFor = 0; this.huntFor = -1; this.chaseUntil = 0;
    this.hitsOn = null; this.hitsDealt = 0; this.hitsT = -99; this.killT = -99; this.killsHere = 0; this.switchT = -99;
    this.aimInit = false; this.flinchT = 0; this.lastStun = 0;
    this.peekPhase = undefined; this.peekT = 0;
    this.nadeT = 0; this.nadeSeen = null; this.nadeReactT = 0; this.fleeing = false;
    this.slideCd = 0; this.edgeBurst = 0; this.lane = null; this.holdT = 0; this.tradeT = 0;
    this.state = 'idle';
    if (!this.dmgDir) { this.dmgDir = new THREE.Vector3(); this.aimSmooth = new THREE.Vector3(); this.flinchV = new THREE.Vector3(); this.huntGoal = new THREE.Vector3(); this.fightPos = new THREE.Vector3(); }
    if (this.spot) this.spot.clear();
  }

  update(dt) {
    const b = this.bot;
    if (!b.alive) return;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.12; this.perceive(); }
    if (this.visible) this.seenT += dt;
    if (this.reactT > 0) this.reactT -= dt;   // (runs with nobody in sight too: the pause after a kill counts down)
    this.chooseGoal(dt);
    this.move(dt);
    this.aim(dt);
    this.combat(dt);
  }

  // How much of an enemy this bot can actually see (0..1), and the best visible point to aim at.
  exposure(eye, e) {
    const ph = this.game.physics;
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
    const h = e.height;
    const pts = [
      [e.pos.x, e.pos.y + h - 0.16, e.pos.z, 0.2],                       // head
      [e.pos.x, e.pos.y + h * 0.68, e.pos.z, 0.3],                       // chest
      [e.pos.x, e.pos.y + h * 0.45, e.pos.z, 0.2],                       // hips
      [e.pos.x + cy * 0.28, e.pos.y + h * 0.7, e.pos.z - sy * 0.28, 0.15], // shoulders
      [e.pos.x - cy * 0.28, e.pos.y + h * 0.7, e.pos.z + sy * 0.28, 0.15],
    ];
    let vis = 0, best = -1, bestW = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, y, z, w] = pts[i];
      if (!ph.blocked(eye, _e.set(x, y, z))) { vis += w; if (w > bestW || (w === bestW && i === 1)) { bestW = w; best = i; } }
    }
    if (best >= 0) this.aimPt.set(pts[best][0] - e.pos.x, pts[best][1] - e.pos.y, pts[best][2] - e.pos.z);
    return vis;
  }

  // Spotting is gradual: a meter per enemy fills with exposure, distance, view angle, movement and noise,
  // and drains when they're out of sight. Bots only engage once it's full, so a quick peek isn't an
  // instant death sentence, and they can't snap onto a sliver of head behind cover.
  perceive() {
    const b = this.bot, g = this.game, d = this.diff, step = 0.12;
    const eye = b.eyePos(_a);
    const fwd = _b.set(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
    let best = null, bestScore = Infinity, bestExp = 0, n = 0;
    for (const e of g.characters) {
      if (!e.alive || !g.foes(e, b)) { this.spot.delete(e); continue; }
      let m = this.spot.get(e) || 0;
      const dist = e.pos.distanceTo(b.pos);
      _c.subVectors(e.pos, b.pos); _c.y = 0;
      const len = _c.length() || 1;
      _c.divideScalar(len);
      const ang = Math.acos(clamp(_c.dot(fwd), -1, 1));
      const loud = g.time - e.lastFireT < 0.6 && dist < (e.weapon.def.quiet ? 10 : 30);
      const hurt = b.lastAttacker === e && g.time - b.lastAttackerT < 2.5;
      const aware = dist <= d.sight && (ang < d.fov || dist < 4 || e === this.target || hurt || loud);
      const exp = aware ? this.exposure(eye, e) : 0;
      if (exp <= 0) {
        m = Math.max(0, m - step * (e === this.target ? 0.35 : 0.8));
        this.spot.set(e, m);
        continue;
      }
      const center = ang < d.fov * 0.45 ? 1 : 0.5;
      const near = clamp(1.35 - dist / 40, 0.3, 1.25);
      const moving = Math.hypot(e.vel.x, e.vel.z) > 3 ? 1.25 : e.crouchT > 0.5 ? 0.7 : 1;
      const rate = d.spot * Math.pow(exp, 1.5) * center * near * moving * (loud ? 1.6 : 1) * (hurt ? 2 : 1) * (dist < 4 ? 3 : 1);
      if (dist < 6 && exp >= 0.3 && ang < d.fov) m = Math.max(m, 1);   // (someone right there in front of you: no slow dawning)
      m = Math.min(1.6, m + rate * step);
      this.spot.set(e, m);
      if (m < 1) continue;
      n++;
      const score = dist - (e === this.target ? 8 : 0);
      if (score < bestScore) { bestScore = score; best = e; bestExp = exp; this.bestAim = this.bestAim || new THREE.Vector3(); this.bestAim.copy(this.aimPt); }
    }
    this.enemiesVisible = n;
    if (best) {
      if (best !== this.target || !this.visible) {
        if (!this.visible && g.time - this.lastKnownT > 4) g.callout(this.bot, 'contact', 0.3);   // a fresh sighting: "contact!"
        // (a sprinter reacts 100 ms later: the gun is down)
        this.reactT = d.reaction * rand(0.7, 1.3) * (this.visible || g.time - this.lastKnownT < 1.5 ? 0.5 : 1) + (b.sprinting ? 0.1 : 0);
        this.seenT = 0;
        this.newAimError(best);
      }
      this.target = best;
      this.visible = true;
      this.expo = bestExp;
      this.aimLocal.copy(this.bestAim);
      this.lastKnown.copy(best.pos);
      this.lastKnownT = g.time;
      g.reportIntel(b.team, best.pos);
    } else {
      this.visible = false;
      if (this.target && !this.target.alive) this.target = null;
    }
  }

  onDamaged(attacker) {
    this.hurtT = this.game.time;   // (the strafe reverses on it; a drop-shot is a reply to being shot first)
    if (!attacker || !this.game.foes(attacker, this.bot)) return;
    // being shot by someone who isn't the target: they are now (they're the danger), and they're found at once
    if (this.target !== attacker) { this.spot.set(attacker, Math.max(this.spot.get(attacker) || 0, 1)); this.target = attacker; this.visible = false; this.perceiveT = Math.min(this.perceiveT, 0.05); }
    if (!this.visible) {
      this.lastKnown.copy(attacker.pos);
      this.lastKnownT = this.game.time;
      this.target = attacker;
      this.perceiveT = Math.min(this.perceiveT, 0.05);
    }
  }

  newAimError(t) {
    const dist = t.pos.distanceTo(this.bot.pos);
    const cover = 1 + (1 - clamp(this.expo ?? 1, 0, 1)) * 1.6; // harder to hit what you can barely see
    const mag = (this.diff.aimError * dist * rand(0.4, 1.2) * cover + 0.15) * (this.bot.stunT > 0 ? 3 : 1);   // stunned: wild aim
    this.aimErr.set(rand(-1, 1), rand(-0.6, 0.6), rand(-1, 1)).normalize().multiplyScalar(mag);
    this.aimHead = Math.random() < this.diff.headChance;
    this.aimErrT = rand(0.25, 0.55);
  }

  setGoal(p, kind) {
    if (!this.goal || this.goal.distanceToSquared(p) > 4 || kind !== this.goalKind) {
      this.goal = p.clone();
      this.goal.y = this.game.world.nav.levelY(p);   // keep the level on multi-level maps (upstairs, the station)
      this.goalKind = kind;
      this.repathT = 0;
      this.goalT = kind === 'roam' || kind === 'intel' ? rand(10, 18) : 12;
      // a fresh route preference per goal: bots spread over different streets and doorways instead of all
      // taking the one shortest lane (pickups and hunting stay on the direct way)
      this.walkSlow = kind === 'intel' && Math.random() < 0.3;
      this.route = (kind === 'health' || kind === 'ammo' || kind === 'hunt') ? null : { seed: (Math.random() * ROUTE_SEEDS) | 0, w: 1.2 + Math.random() * 2.6 };
    }
  }

  chooseGoal(dt) {
    const b = this.bot, g = this.game;
    this.goalT -= dt;
    if (this.idleT > 0) this.idleT -= dt;
    if (this.visible && this.target) { this.goalKind = 'engage'; this.idleT = 0; return; }
    if (this.goalKind === 'engage') { this.goalKind = 'hunt'; this.goal = null; }
    // Infected: survivors hide, the infected go looking for them
    if (g.inf && this.infectedGoal(dt)) return;
    // round modes hand out objectives: plant, defuse, guard a site, take the flag
    const og = g.gm && g.gm.botGoal(this, b);
    if (og) {
      // chase a fresh sighting first unless the objective is urgent
      const urgent = og.kind === 'plant' || og.kind === 'defuse' || og.kind === 'flag' || og.kind === 'bomb';
      if (!urgent && this.target && this.target.alive && g.time - this.lastKnownT < 4) { this.setGoal(this.lastKnown, 'hunt'); return; }
      this.setGoal(og.pos, og.kind);
      return;
    }
    if (b.health < 45) {
      const p = g.nearestPickup('health', b.pos, true);
      if (p && p.pos.distanceTo(b.pos) < 35) { this.setGoal(p.pos, 'health'); return; }
    }
    const w = b.weapons[0];
    if (w.mag + w.reserve < w.def.mag * 1.5) {
      const p = g.nearestPickup('ammo', b.pos, true);
      if (p) { this.setGoal(p.pos, 'ammo'); return; }
    }
    if (this.target && this.target.alive && g.time - this.lastKnownT < 6
      && (Math.hypot(this.lastKnown.x - b.pos.x, this.lastKnown.z - b.pos.z) > 2.5 || Math.abs(this.lastKnown.y - b.pos.y) > 1.6)) { this.setGoal(this.lastKnown, 'hunt'); return; }
    // got to the last sighting and found nobody: forget it and move on
    if (this.goalKind === 'hunt' && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < 2.5 && Math.abs(this.goal.y - b.pos.y) < 1.6) { this.goal = null; this.lastKnownT = -99; }
    const reached = this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < 2 && Math.abs(this.goal.y - b.pos.y) < 1.6;
    // reaching a roam spot: sometimes stop and check the angles for a moment, like a player would
    if (reached && (this.goalKind === 'roam' || this.goalKind === 'intel') && this.idleT <= 0 && !this.idleDone && Math.random() < 0.45) {
      this.idleT = rand(0.8, 2.6); this.idleDone = true; this.pickLook(true);
    }
    if (this.idleT > 0) return;
    this.idleDone = false;
    if (!this.goal || reached || this.goalT <= 0 || this.goalKind === 'hunt' || this.goalKind === 'health' || this.goalKind === 'ammo') {
      const intel = g.intel[b.team];
      // don't all pile onto the same spot: only some answer a callout, and they come at it from different angles
      if (g.time - intel.time < 8 && Math.random() < 0.4 && this.matesHeading(intel.pos, 8) < 2) {
        const a = Math.random() * Math.PI * 2, r = rand(4, 9);
        _e.copy(intel.pos).add(_a.set(Math.cos(a) * r, 0, Math.sin(a) * r));
        if (!g.world.nav.isOpenAt(_e.x, _e.z)) _e.copy(intel.pos);
        this.goal = null;
        this.setGoal(_e, 'intel');
      } else {
        const side = g.ffa ? (Math.random() < 0.5 ? 1 : -1) : b.team === 0 ? 1 : -1; // blue pushes +x, red pushes -x (FFA: anywhere)
        // a few candidates; keep the one furthest from where teammates are already going
        let p = null, best = -1;
        // maps made of separate areas (Link Loop's stations): mostly somewhere in the area the bot is in; a trip
        // to another one now and then (the push-to-the-enemy's-side rule doesn't fit them)
        const area = g.world.sameArea, local = area && Math.random() < 0.6;
        for (let k = 0; k < 4; k++) {
          const HX = g.world.bounds ? g.world.bounds.hx : 42;
          const q = g.world.nav.randomOpenPoint(area ? (q => !local || area(q, b.pos)) : (q => q.x * side > -HX * 0.43 && Math.abs(q.x) < HX - 4));
          const d = this.mateGoalDist(q);
          if (d > best) { best = d; p = q; }
        }
        // two-storey maps: now and then go and clear the upstairs
        if (g.world.upperPoint && Math.random() < 0.18) p = g.world.upperPoint();
        this.goal = null;
        this.setGoal(p, 'roam');
      }
    }
  }

  // Infected. A survivor finds a hiding spot (a corner or a wall at its back, away from the infected, apart from
  // the other survivors) and holds it, crouched, watching; it moves on when an infected comes within 14 m or after
  // a while. An infected heads for where the nearest survivor roughly is. Returns true when it set the goal.
  infectedGoal(dt) {
    const b = this.bot, g = this.game, nav = g.world.nav;
    const infected = g.characters.filter(c => c.alive && c.team === 1), survivors = g.characters.filter(c => c.alive && c.team === 0 && c !== b);
    if (b.team === 1) {
      if (this.goalKind === 'intel' && this.goal && this.goalT > 0 && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) > 3) return true;
      let best = null, bd = 1e9;
      for (const c of [...survivors, ...(b === g.player ? [] : [g.player])]) if (c && c.alive && c.team === 0) { const d = c.pos.distanceTo(b.pos); if (d < bd) { bd = d; best = c; } }
      if (!best) return false;
      const a = Math.random() * Math.PI * 2, r = Math.min(8, bd * 0.25);
      _e.copy(best.pos).add(_a.set(Math.cos(a) * r, 0, Math.sin(a) * r));
      if (!nav.isOpenAt(_e.x, _e.z)) _e.copy(best.pos);
      this.goal = null; this.setGoal(_e, 'intel'); this.goalT = rand(5, 9);
      return true;
    }
    if (b.health < 45) return false;   // (the usual: go for a health pickup)
    const near = infected.reduce((m, c) => Math.min(m, c.pos.distanceTo(b.pos)), 1e9);
    const at = this.goalKind === 'hide' && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < 1.5;
    if (this.goalKind === 'hide' && this.goal && near > 14 && this.goalT > 0) {
      if (at) this.goalT -= dt * 0.5;   // (time at the spot counts slower: they sit tight)
      return true;
    }
    // a new spot: the best of a dozen candidates
    let best = null, bs = -1e9;
    for (let k = 0; k < 14; k++) {
      const q = k < 2 && g.world.upperPoint ? g.world.upperPoint() : nav.randomOpenPoint(g.world.sameArea ? (p => g.world.sameArea(p, b.pos)) : null);
      if (!q) continue;
      let cover = 0;
      const gr = nav.gridAt(q);   // (an upstairs spot: that floor's grid)
      for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; if (!gr.isOpenAt(q.x + Math.cos(an) * 1.3, q.z + Math.sin(an) * 1.3)) cover++; }
      const dInf = infected.reduce((m, c) => Math.min(m, c.pos.distanceTo(q)), 60);
      const dMate = survivors.reduce((m, c) => { const br = g.brains.get(c), p = br && br.goal ? br.goal : c.pos; return Math.min(m, Math.hypot(p.x - q.x, p.z - q.z)); }, 12);
      const sc = Math.min(cover, 7) * 3 + Math.min(dInf, 40) * 0.8 + Math.min(dMate, 8) * 0.3 - q.distanceTo(b.pos) * 0.12;
      if (sc > bs) { bs = sc; best = q; }
    }
    if (!best) return false;
    this.goal = null; this.setGoal(best, 'hide'); this.goalT = rand(30, 55);
    return true;
  }

  // teammates (bots) whose goal is within r of p
  matesHeading(p, r) {
    let n = 0;
    for (const [c, br] of this.game.brains) if (br !== this && !this.game.ffa && c.team === this.bot.team && c.alive && br.goal && Math.hypot(br.goal.x - p.x, br.goal.z - p.z) < r) n++;
    return n;
  }
  // distance from p to the nearest teammate's goal (or teammate)
  mateGoalDist(p) {
    let d = 1e9;
    for (const c of this.game.characters) {
      if (c === this.bot || this.game.foes(c, this.bot) || !c.alive) continue;
      const br = this.game.brains.get(c), q = br && br.goal ? br.goal : c.pos;
      d = Math.min(d, Math.hypot(q.x - p.x, q.z - p.z));
    }
    return d;
  }

  followPath(target, dt) {
    const b = this.bot, nav = this.game.world.nav;
    this.repathT -= dt;
    if (this.repathT <= 0 || this.pathIdx >= this.path.length) {
      // at most three path searches per game step across all bots: a bot that still has a path to follow
      // waits a moment for its new one, so a squad spotting you at once doesn't plan in the same frame
      const t = this.game.time;
      if (nav.searchT !== t) { nav.searchT = t; nav.searches = 0; }
      if (nav.searches >= 3 && this.pathIdx < this.path.length) this.repathT = rand(0.03, 0.12);
      else {
        nav.searches++;
        this.path = nav.findPath(b.pos, target, this.route && Math.hypot(target.x - b.pos.x, target.z - b.pos.z) > 10 ? this.route : null);
        this.pathIdx = 0;
        this.repathT = rand(0.8, 1.5);
      }
    }
    while (this.pathIdx < this.path.length && Math.hypot(this.path[this.pathIdx].x - b.pos.x, this.path[this.pathIdx].z - b.pos.z) < 0.7) this.pathIdx++;
    if (this.pathIdx >= this.path.length) return null;
    const wp = this.path[this.pathIdx];
    return _d.set(wp.x - b.pos.x, 0, wp.z - b.pos.z).normalize();
  }

  move(dt) {
    const b = this.bot, g = this.game, nav = g.world.nav, d = this.diff, w = b.weapon;
    const wish = this.wish.set(0, 0, 0);
    let sprint = false, jump = false;
    this.crouch = false; this.prone = false;
    b.useHeld = false;
    // maps where getting somewhere takes more than walking (Link Loop's trains) steer the bot themselves
    const tv = g.world.botTravel && g.world.botTravel(this, dt);
    if (tv) {
      if (tv.wish.lengthSq() > 0.04) this.steer(tv.wish);
      b.wantCrouch = !!tv.crouch; b.wantProne = false;
      b.updateMovement(dt, tv.wish, !!tv.sprint && !this.visible, !!tv.jump, false, false);
      this.stuckIdle();
      return;
    }
    // objective spots: stop there (and hold the button to plant / defuse); guard / push spots: settle into
    // a stance and check angles until the mode hands out the next spot
    const hold = { plant: 0.8, defuse: 0.9, flag: 1.4, guard: 1.6, push: 2, hide: 1.2 }[this.goalKind];
    const idle = this.idleT > 0 && this.goalKind !== 'engage';
    if (idle || (hold && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < hold)) {
      if (this.goalKind === 'plant' || this.goalKind === 'defuse') { b.useHeld = true; this.crouch = this.goalKind === 'defuse'; }
      else {
        if (!this.holding) {   // just arrived: pick how to sit on this angle
          const r = Math.random();
          this.holdStance = r < 0.45 ? 0 : r < 0.8 ? 1 : 2;   // stand / crouch / prone
          if (idle) this.holdStance = Math.min(this.holdStance, 1);
          if (this.goalKind === 'hide') this.holdStance = Math.random() < 0.75 ? 1 : 0;   // hiding: mostly crouched
          this.pickLook(true);
        }
        this.holding = true;
        this.lookT -= dt;
        if (this.lookT <= 0) this.pickLook(false);
        this.crouch = this.holdStance === 1; this.prone = this.holdStance === 2;
        // shuffle a step now and then so nobody is a statue
        if (this.holdStance === 0 && Math.random() < 0.004) { this.strafeDir *= -1; this.shuffleT = rand(0.25, 0.6); }
        if (this.shuffleT > 0) { this.shuffleT -= dt; const a = b.yaw; wish.set(Math.cos(a) * this.strafeDir, 0, -Math.sin(a) * this.strafeDir).multiplyScalar(0.5); }
      }
      b.wantCrouch = this.crouch; b.wantProne = this.prone;
      b.updateMovement(dt, wish, false, false, false, false);
      this.stuckIdle();
      return;
    }
    if (this.holding) { this.holding = false; this.lookYaw = null; }

    if (this.goalKind === 'engage' && this.target && b.infected) {
      // infected: no gun, so straight at them (along the path round corners), sprinting until they're close
      const t = this.target, dist = b.pos.distanceTo(t.pos);
      this.game.callout(b, 'growl', 0.01);
      const dir = dist > 3 ? this.followPath(t.pos, dt) : null;
      if (dir) wish.copy(dir); else wish.set(t.pos.x - b.pos.x, 0, t.pos.z - b.pos.z).normalize();
      b.wantCrouch = false; b.wantProne = false;
      b.updateMovement(dt, wish, dist > 2.5, Math.random() < 0.01, false, false);
      return;
    }
    if (this.goalKind !== 'engage') this.dropT = 0;   // (a drop-shot ends with the fight)
    if (this.goalKind === 'engage' && this.target) {
      // The gunfight, the way a player moves in one: an A/D strafe in jittered legs with the odd plant, reversed
      // the moment a hit lands, mirroring a runner crossing in front half the time; never a statue in the open
      // past half a second; crouched only to shrink behind something chest high; prone only for a drop-shot;
      // no hopping about (the stuck-jump below is the only jump left)
      const t = this.target;
      const dist = b.pos.distanceTo(t.pos);
      const [mn, mx] = w.def.botRange;
      _c.subVectors(t.pos, b.pos); _c.y = 0; _c.normalize();
      const perp = _e.set(_c.z, 0, -_c.x);
      this.fightT += dt; this.strafeT -= dt; if (this.strafeStop > 0) this.strafeStop -= dt;
      const hitNow = g.time - this.hurtT < 0.1 && this.hurtT !== this.strafeHitT;
      if (this.strafeRoll !== t) { this.strafeRoll = t; this.strafeOn = Math.random() < d.strafe; this.fightT = 0; this.stillT = 0; this.dropRolled = null; this.fightPos.copy(b.pos); }
      if (this.strafeT <= 0 || hitNow) {
        this.strafeHitT = this.hurtT;
        const lat = t.vel.x * perp.x + t.vel.z * perp.z;
        if (hitNow || Math.abs(lat) < 2 || Math.random() < 0.5) this.strafeDir = -this.strafeDir; else this.strafeDir = Math.sign(lat);
        // drifted 2 m along the line from where the fight started: this leg comes back (a player strafes around
        // a spot, not off down the street into the next wall)
        const off = (b.pos.x - this.fightPos.x) * perp.x + (b.pos.z - this.fightPos.z) * perp.z;
        if (!hitNow && Math.abs(off) > 2) this.strafeDir = -Math.sign(off);
        // a leg is 0.15-0.75 s, never a metronome; a quarter of reversals start with a 100 ms plant (the plant is on
        // top of the leg, so a leg is never a twitch); whether this leg moves at all is the difficulty's strafe dice
        // (a hit always gets the feet going), and a stood-still leg is short
        this.strafeOn = hitNow || Math.random() < d.strafe;
        this.strafeStop = this.strafeOn && !hitNow && Math.random() < 0.25 ? 0.1 : 0;
        this.strafeT = this.strafeOn ? rand(0.3, 0.6) + rand(-0.15, 0.15) + this.strafeStop : rand(0.2, 0.4);
      }
      // crouch only to shrink behind something chest high between us and them (a 0.7-1.3 m box, nothing above it)
      const cx = b.pos.x + _c.x * 0.9, cz = b.pos.z + _c.z * 0.9, ph = g.physics;
      this.lowCover = dist > 8 && !!ph.overlap(cx, b.pos.y + 0.75, cz, 0.3, 0.5) && !ph.overlap(cx, b.pos.y + 1.35, cz, 0.3, 0.4);
      this.crouch = this.lowCover;
      // drop-shot: shot first at <= 10 m by the one enemy in view, one roll per fight (hard mostly)
      if (this.dropT <= 0 && dist <= 10 && this.enemiesVisible < 2 && g.time - this.hurtT < 0.15 && b.lastFireT < this.hurtT - 0.5 && this.dropRolled !== t) { this.dropRolled = t; if (Math.random() < d.dropShot) this.dropT = 1.2; }
      if (this.dropT > 0) this.dropT = Math.max(0, this.dropT - dt);
      this.prone = this.dropT > 0;
      this.stillT = Math.hypot(b.vel.x, b.vel.z) < 0.5 ? this.stillT + dt : 0;
      if (!this.strafeOn && !this.lowCover && this.stillT > 0.4) { this.strafeOn = true; this.strafeStop = 0; }   // nobody stands still in the open past half a second
      const strafeK = this.strafeOn && this.strafeStop <= 0 && !this.lowCover && !this.prone ? 1 : 0;
      wish.addScaledVector(perp, this.strafeDir * strafeK);
      if (!this.prone) {
        if (dist > mx) { const dir = this.followPath(t.pos, dt); if (dir) wish.addScaledVector(dir, 1.2); }
        else if (dist < mn) wish.addScaledVector(_c, -0.7);   // give ground on the diagonal, never a straight backpedal
      }
      // no strafing off a platform edge or into a wall: the leg turns round
      if (!nav.gridAt(b.pos).isOpenAt(b.pos.x + wish.x * 1.2, b.pos.z + wish.z * 1.2) || (wish.lengthSq() > 0.04 && this.blockedDir(wish.x, wish.z, 0.6))) {
        this.strafeDir *= -1; this.strafeT = rand(0.3, 0.6);
        wish.addScaledVector(perp, this.strafeDir * 2);
      }
    } else if (this.goal) {
      const dir = this.followPath(this.goal, dt);
      if (dir) {
        wish.copy(dir);
        sprint = Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) > 8;
        this.noPathT = 0;
        // clearing a route after a callout: walk it carefully now and then
        if (this.goalKind === 'intel' && !sprint && this.walkSlow) this.crouch = true;
      } else if (this.goalKind === 'roam' || this.goalKind === 'intel') {
        this.goalT = 0;
      } else if ((this.noPathT += dt) > 1.2) {
        // no route to the mode's spot (or already standing on it): ask for a different one
        this.noPathT = 0; this.gmPatT = 0; this.gmOff = null; this.goal = null;
        if (this.goalKind === 'push' || this.goalKind === 'guard') this.idleT = rand(0.4, 1.2);
      }
    }
    // personal space: ease away from teammates closer than ~2.2 m so squads don't move as one blob
    if (this.goalKind !== 'engage' && wish.lengthSq() > 0.01) {
      for (const c of g.characters) {
        if (c === b || g.foes(c, b) || !c.alive) continue;
        const dx = b.pos.x - c.pos.x, dz = b.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 3) wish.addScaledVector(_a.set(dx / d, 0, dz / d), (3 - d) * 0.5);
      }
    }
    if (wish.lengthSq() > 1) wish.normalize();

    // unsticking: walk toward open space for a moment instead of pushing into the obstacle
    if (this.unstickT > 0) {
      this.unstickT -= dt;
      wish.copy(this.unstickDir);
      sprint = false;
    } else if (wish.lengthSq() > 0.04) this.steer(wish);

    // stuck detection: barely moved for most of a second while trying to. The clock only runs while the bot wants
    // to move (standing still on purpose, or having only just set off, isn't stuck), and the ground covered counts
    // as well as the net displacement (a strafe that turns round ends up where it started without being stuck)
    if (wish.lengthSq() <= 0.2) this.stuckIdle();
    this.stuckT -= dt; this.movedAcc += Math.hypot(b.vel.x, b.vel.z) * dt;
    if (this.stuckT <= 0) {
      const moved = Math.max(this.movedAcc, Math.hypot(b.pos.x - this.lastPos.x, b.pos.z - this.lastPos.z));
      this.movedAcc = 0;
      if (moved < 0.35) {
        this.stuckN = (this.stuckN || 0) + 1;
        jump = this.stuckN % 2 === 1;
        this.repathT = 0;
        this.strafeDir *= -1;
        this.startUnstick();
        if (this.goalKind !== 'engage' && this.stuckN >= 2) { this.goalT = 0; this.goal = null; } // pick somewhere else
      } else if (moved > 1) this.stuckN = 0;
      this.lastPos.copy(b.pos);
      this.stuckT = 0.8;
    }
    b.wantCrouch = this.crouch; b.wantProne = this.prone;
    // no sprinting through a reload (the player can't either): a near-full top-up is dropped for the run, any
    // other reload is finished at a walk. Long runs with nobody in sight: tactical sprint while the charge is high
    if (sprint && w.reloading && w.mag >= w.def.mag * 0.6) w.cancelReload();
    const run = sprint && (!this.visible || this.goalKind === 'cover' || this.fleeing || this.chaseUntil > g.time) && !w.reloading;
    if (!run) this.tac = false;
    else if (!this.tac && b.tacFuel >= PLAYER.tacTime * 0.9 && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) > 18) this.tac = true;
    // something breakable across the way (boards over a doorway, a pane): kick it in and carry on
    if (g.breakables && wish.lengthSq() > 0.04 && b.meleeCd <= 0 && (this.breachT = (this.breachT || 0) + dt) > 0.25) {
      this.breachT = 0;
      const eye = b.eyePos(_bv1), dir = _bv2.copy(wish).normalize(), hit = g.physics.raycast(eye, dir, 1.4);
      if (hit && hit.box.breakable !== undefined) { b.yaw = Math.atan2(-dir.x, -dir.z); b.melee(); }
    }
    b.updateMovement(dt, wish, run, jump, false, run && this.tac);
  }

  // not trying to move: the stuck clock waits, and the next sample measures from here
  stuckIdle() { this.stuckT = Math.max(this.stuckT, 0.8); this.lastPos.copy(this.bot.pos); this.movedAcc = 0; }

  // is the body blocked a little way along this direction? (ignores low steps)
  blockedDir(x, z, dist = 0.55) {
    const b = this.bot, ph = this.game.physics;
    return !!ph.overlap(b.pos.x + x * dist, b.pos.y + PLAYER.stepHeight + 0.02, b.pos.z + z * dist, b.radius * 0.95, Math.max(0.4, b.height - PLAYER.stepHeight - 0.05));
  }

  // bend the wanted direction around corners and props the grid doesn't see
  steer(wish) {
    const len = Math.hypot(wish.x, wish.z);
    if (len < 1e-4) return;
    const x = wish.x / len, z = wish.z / len;
    if (!this.blockedDir(x, z)) return;
    const pref = this.strafeDir || 1;
    for (const a of [0.45, 0.9, 1.35, 1.8]) {
      for (const sgn of [pref, -pref]) {
        const c = Math.cos(a * sgn), sn = Math.sin(a * sgn);
        const nx = x * c - z * sn, nz = x * sn + z * c;
        if (!this.blockedDir(nx, nz)) { wish.set(nx * len, 0, nz * len); return; }
      }
    }
  }

  // head for the nearest clear direction (or the centre of the nearest open nav cell) for a moment
  startUnstick() {
    const b = this.bot, nav = this.game.world.nav.gridAt(this.bot.pos);   // the level it's on (out of a track pit, say)
    const cell = nav.nearestOpen(nav.ci(b.pos.x), nav.cj(b.pos.z));
    let best = null, bestS = -Infinity;
    const base = Math.random() * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = base + k * Math.PI / 6, x = Math.cos(a), z = Math.sin(a);
      if (this.blockedDir(x, z, 0.7)) continue;
      let sc = Math.random() * 0.3;
      if (cell) { const tx = nav.cx(cell[0]) - b.pos.x, tz = nav.cz(cell[1]) - b.pos.z, tl = Math.hypot(tx, tz); if (tl > 0.2) sc += (x * tx + z * tz) / tl; }
      if (sc > bestS) { bestS = sc; best = [x, z]; }
    }
    if (!best) { const a = base; best = [Math.cos(a), Math.sin(a)]; }
    this.unstickDir.set(best[0], 0, best[1]);
    this.unstickT = rand(0.5, 0.9);
  }

  // somewhere to look while holding: mostly out, away from the spot being held (where enemies come from),
  // swept across a wide arc with occasional glances behind
  pickLook(fresh) {
    const b = this.bot, an = this.gmAnchor;
    let base = b.yaw;
    if (an && Math.hypot(b.pos.x - an.x, b.pos.z - an.z) > 1.5) base = Math.atan2(-(b.pos.x - an.x), -(b.pos.z - an.z));
    else if (fresh) base = b.yaw;
    const r = Math.random();
    this.lookYaw = r < 0.12 ? base + Math.PI + rand(-0.5, 0.5) : base + rand(-1.3, 1.3);
    this.lookPitch = rand(-0.08, 0.04);
    this.lookT = rand(1.2, 3.5);
  }

  aim(dt) {
    const b = this.bot, g = this.game, d = this.diff;
    const eye = b.eyePos(_a);
    let dy = null, dp = 0;
    this.aimOff = 1;
    if (this.visible && this.target) {
      const t = this.target;
      this.aimErrT -= dt;
      if (this.aimErrT <= 0) this.newAimError(t);
      const shrink = Math.max(d.aimFloor, 1 - this.seenT * 0.3);
      // aim slightly behind moving targets to simulate tracking lag
      // aim at the part of them that's actually visible (head if only the head is), with tracking lag
      if (this.expo >= 0.7) (this.aimHead ? t.headPos(_b) : t.chestPos(_b));
      else _b.copy(t.pos).add(this.aimLocal);
      _b.addScaledVector(this.aimErr, shrink).addScaledVector(t.vel, -d.lag);
      _c.subVectors(_b, eye);
      dy = Math.atan2(-_c.x, -_c.z);
      dp = Math.atan2(_c.y, Math.hypot(_c.x, _c.z));
      // angular error between current view and the target's center
      t.chestPos(_b).sub(eye).normalize();
      this.aimOff = Math.acos(clamp(b.forward(_c).dot(_b), -1, 1));
    } else if (this.target && g.time - this.lastKnownT < 4) {
      _c.subVectors(this.lastKnown, b.pos);
      if (_c.lengthSq() > 1) dy = Math.atan2(-_c.x, -_c.z);
    } else if ((this.holding || this.idleT > 0) && this.lookYaw !== null) {
      dy = this.lookYaw; dp = this.lookPitch;
    } else if (Math.hypot(b.vel.x, b.vel.z) > 1) {
      dy = Math.atan2(-b.vel.x, -b.vel.z);
    }
    const rate = d.turnRate * (this.visible ? 1 : 0.7) * dt;
    if (dy !== null) {
      const diff = angDiff(b.yaw, dy);
      b.yaw += clamp(diff, -rate, rate) * (Math.abs(diff) < 0.15 ? 0.6 : 1);
    }
    const pd = dp - b.pitch;
    b.pitch += clamp(pd, -rate, rate);
  }

  // Sights up (1) or down (0), by weapon and range. dist = 0 when nothing is visible. Shotguns never; a scope or
  // an ACOG always; a rifle beyond 5 m, an SMG or pistol beyond 7 m (scaled by the difficulty's adsNear); once up
  // they stay up; sighted on where a lost enemy went, into a danger zone, at cover, and (hard) on a held angle.
  adsWant(dist) {
    const b = this.bot, w = b.weapon, d = this.diff, g = this.game, def = w.def, t = def.model.type;
    if (def.melee || def.sling || b.infected || def.pellets > 1) return 0;
    const scoped = !!def.scope || def.model.sight === 'acog';
    const near = ({ pistol: 7, smg: 7, rifle: 5, launcher: 8 })[t] ?? 5;
    if (this.visible && this.target) { if (scoped) return 1; if (b.adsT > 0.8 && dist >= 3) return 1; return dist >= near * d.adsNear ? 1 : 0; }
    if (this.target && this.target.alive && g.time - this.lastKnownT < (scoped ? 4 : 2) && this.lastKnown.distanceTo(b.pos) < 25) return 1;
    if (this.threat >= 0.5 || this.cornering || this.goalKind === 'watch') return 1;
    if (this.atCover && this.coverGoal) return 1;
    if (this.holding && d.preAim >= 0.8) return 1;
    return 0;
  }

  combat(dt) {
    const b = this.bot, g = this.game, d = this.diff;
    const w = b.weapon;
    const engaging = this.visible && this.target;
    const dist = engaging ? this.target.pos.distanceTo(b.pos) : 0;
    // the sights, ramped at the gun's ADS time and gated the way the player's are: not while sprinting, switching,
    // reloading, swinging, throwing, sliding or climbing
    const want = this.adsWant(engaging ? dist : 0);
    const can = !b.sprinting && b.switchT <= 0 && !w.reloading && b.meleeT <= 0 && b.grenadeCd <= 0.6 && b.slideT <= 0 && !b.mantle && !b.infected;
    b.adsT = clamp(b.adsT + Math.sign((can ? want : 0) - b.adsT) * dt / w.def.adsTime, 0, 1);
    // the sprint-out: the gun takes 80-130 ms to come up after a sprint ends (a little more after a tactical
    // sprint), like the player's; b.sprinting is this frame's (move() ran first)
    if (this.sprintOutT > 0) this.sprintOutT -= dt;
    if (this.wasSprinting && !b.sprinting) { const st = w.def.model.type; this.sprintOutT = ((st === 'pistol' || st === 'smg') ? 0.08 : st === 'rifle' ? 0.115 : 0.13) * d.sprintOut + (this.wasTac ? 0.05 : 0); }
    this.wasSprinting = b.sprinting; this.wasTac = b.tacSprinting;

    if (!engaging) {
      if (b.cur === 1 && b.weapons[0].mag + b.weapons[0].reserve > 0) b.switchTo(0);
      else if (w.mag < w.def.mag * 0.5 && w.reserve > 0 && !w.reloading) b.reload();
    }

    // grenades
    this.grenadeT -= dt;
    if (this.grenadeT <= 0) {
      this.grenadeT = 1.5;
      if (b.grenades > 0) {
        let tgt = null;
        if (engaging && dist > 9 && dist < 24 && Math.random() < 0.35) tgt = this.target.pos;
        else if (!engaging && this.target && this.target.alive && g.time - this.lastKnownT < 3) {
          const ld = this.lastKnown.distanceTo(b.pos);
          if (ld > 8 && ld < 25) tgt = this.lastKnown;
        }
        if (tgt) {
          b.throwGrenade(tgt.clone());
          this.grenadeT = rand(10, 20);
        }
      }
      // tactical: stun someone they're fighting at mid range, now and then
      if (this.grenadeT > 0 && engaging && b.tacticals > 0 && dist > 6 && dist < 20 && Math.random() < 0.12) { b.throwTactical(this.target.pos.clone()); this.grenadeT = Math.max(this.grenadeT, 6); }
    }

    if (!engaging || this.reactT > 0) return;
    if (b.infected) {
      // the knife up close; the throwing knife at a runner now and then
      if (dist < MELEE_REACH && b.meleeCd <= 0 && this.aimOff < 0.5) b.melee();
      else if (dist > 6 && dist < 18 && b.grenades > 0 && b.grenadeCd <= 0 && Math.random() < 0.02) b.throwGrenade(this.target.pos.clone(), 0);
      return;
    }
    // the gun has to come up first; no shots through the throw swing or a slide
    if (this.sprintOutT > 0 || b.sprinting || b.grenadeCd > 0.45 || b.slideT > 0.3) return;
    const primary = b.weapons[0], pistol = b.weapons[1];
    // contact up close in the middle of a reload: with a few rounds left, drop the reload and use them; otherwise
    // the loaded pistol, or the knife if they're on top of us (a reload about to finish is finished)
    if (w.reloading && dist < 10 && w.reloadT > 0.3) {
      if (w.mag >= 3) w.cancelReload();
      else if (b.cur === 0 && pistol.mag > 0) { b.switchTo(1); return; }   // (the switch drops the reload)
      else if (dist < 2.2 && b.meleeCd <= 0) { b.melee(); return; }
    }
    if (dist < 1.7 && b.meleeCd <= 0 && Math.random() < 0.5) { b.melee(); return; }
    // pick the right tool for the range
    const pr = primary.def.botRange;
    if (b.cur === 0 && pistol.mag + pistol.reserve > 0 && ((primary.def.model.type === 'shotgun' && dist > 16) || (primary.def.model.type === 'sniper' && dist < 6))) { b.switchTo(1); return; }
    if (b.cur === 1 && primary.mag > 0 && dist >= pr[0] && dist <= pr[1] + 2) { b.switchTo(0); return; }
    if (w.mag === 0) {
      if (b.cur === 0 && dist < 15 && b.weapons[1].mag > 0) b.switchTo(1);
      else b.reload();
      return;
    }
    const tol = Math.atan2(0.9, dist) + 0.03;
    if (this.aimOff > tol) return;
    const eye = b.eyePos(_a), fwd = b.forward(_b);
    if (w.def.auto) {
      if (this.pauseT > 0) { this.pauseT -= dt; return; }
      b.tryFire(eye, fwd);
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.pauseT = rand(...d.pause);
        this.burstT = rand(...d.burst);
      }
    } else {
      this.semiT -= dt;
      if (this.semiT <= 0 && w.cooldown <= 0) {
        b.tryFire(eye, fwd);
        this.semiT = d.semiDelay * rand(0.6, 1.4) + (w.def.mode === 'BOLT' ? 0.4 : 0);
      }
    }
  }
}
