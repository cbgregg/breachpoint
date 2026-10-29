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
    this.curExp = 0; this.lostSelf = false; this.coverSlowT = 0; this.coverHid = false; this.lookAt = null; this.preAimHold = 0; this.postKill = false; this.targetStillT = 0; this.nade = null; this.pushT = 0; this.lostShooting = false; this.quietT = 0;
    if (!this.curAim) this.curAim = new THREE.Vector3();
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
    // a hit starts a short think (the difficulty's latency), then the bot decides whether to stand and trade or fall back
    if (this.decideT > 0 && (this.decideT -= dt) <= 0) this.assess();
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
    let best = null, bestScore = -1, bestExp = 0, n = 0, curScore = 0, curExp = 0;
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
      // the biggest danger, not the nearest: the one facing us, the one shooting us, a wounded one to finish
      const score = this.scoreOf(e, dist);
      if (e === this.target) { curScore = score; curExp = exp; this.curAim.copy(this.aimPt); }
      if (score > bestScore) { bestScore = score; best = e; bestExp = exp; this.bestAim = this.bestAim || new THREE.Vector3(); this.bestAim.copy(this.aimPt); }
    }
    this.enemiesVisible = n;
    // stick with the current target unless the newcomer is clearly the bigger danger, and never two switches a second
    if (best && this.target && best !== this.target && this.visible && curScore > 0 && (bestScore < curScore * 1.5 || g.time - this.switchT < 1)) { best = this.target; bestExp = curExp; this.bestAim.copy(this.curAim); }
    if (best) {
      if (best !== this.target || !this.visible) {
        if (!this.visible && g.time - this.lastKnownT > 4) g.callout(this.bot, 'contact', 0.3);   // a fresh sighting: "contact!"
        // (a sprinter reacts 100 ms later: the gun is down; the pause after a kill is never cut short)
        const re = this.visible || g.time - this.lastKnownT < 1.5;
        this.reactT = Math.max(this.reactT, d.reaction * rand(0.7, 1.3) * (re ? 0.5 : 1) + (b.sprinting ? 0.1 : 0));
        if (best !== this.target) { this.switchT = g.time; this.seenT *= 0.5; this.aimInit = this.aimInit && !!this.target && best.pos.distanceTo(this.target.pos) < 3; }
        else this.seenT = 0;
        this.newAimError(best);
      }
      this.target = best;
      this.visible = true;
      this.expo = bestExp;
      this.aimLocal.copy(this.bestAim);
      this.lastKnown.copy(best.pos);
      this.lastKnownT = g.time;
      this.targetStillT = Math.hypot(best.vel.x, best.vel.z) < 0.5 ? this.targetStillT + step : 0;
      g.reportIntel(b.team, best.pos);
    } else {
      // the target just went out of sight: where, how far, and whether it was shooting (the hunt reads these)
      if (this.visible && this.target) {
        const t = this.target;
        this.lostT = g.time; this.lostDist = this.lastKnown.distanceTo(b.pos); this.lostShooting = g.time - t.lastFireT < 1; this.quietT = 0;
        // (they stood still and we walked behind something: we broke the line, not them)
        this.lostSelf = Math.hypot(t.vel.x, t.vel.z) < 1 && Math.hypot(b.vel.x, b.vel.z) > 1 && this.strafeRoll === t && this.fightPos.distanceTo(b.pos) < 6;
      }
      this.visible = false; this.aimInit = false;
      if (this.target && !this.target.alive) this.target = null;
    }
  }

  // how much of a danger an enemy is: close, the one we're on, facing us, the one hurting us, nearly dead
  scoreOf(e, dist = e.pos.distanceTo(this.bot.pos)) {
    const b = this.bot, g = this.game;
    const facingMe = Math.abs(angDiff(e.yaw, Math.atan2(-(b.pos.x - e.pos.x), -(b.pos.z - e.pos.z)))) < 0.17;
    const hurtMe = b.lastAttacker === e && g.time - b.lastAttackerT < 2;
    return (1 / Math.max(dist, 3)) * (e === this.target ? 1.3 : 1) * (facingMe ? 2 : 1) * (hurtMe ? 2 : 1) * (e.health < 40 ? 1.5 : 1);
  }

  // Hit. The strafe reverses on it and a drop-shot answers it (hurtT); the aim is knocked (flinch); the shooter
  // becomes the target if they're the bigger danger; and a short think starts, after which the bot decides
  // whether to stand and trade or fall back (assess)
  onDamaged(attacker, amount = 0, fromPos = null, headshot = false) {
    const g = this.game, d = this.diff, b = this.bot;
    if (g.time - this.dmgT > 1.5) this.dmgRecent = 0;
    this.dmgRecent += amount; this.dmgT = this.hurtT = g.time;
    if (fromPos) this.dmgDir.subVectors(fromPos, b.pos).setY(0).normalize();
    this.flinch(amount, headshot);
    if (!attacker || !g.foes(attacker, b)) return;
    const steal = !this.visible || !this.target || this.scoreOf(attacker) > 1.5 * this.scoreOf(this.target);
    if (steal && this.target !== attacker) { this.spot.set(attacker, Math.max(this.spot.get(attacker) || 0, 1)); this.target = attacker; this.visible = false; this.perceiveT = Math.min(this.perceiveT, 0.05); this.aimInit = false; }
    if (!this.visible && this.target === attacker) { this.lastKnown.copy(attacker.pos); this.lastKnownT = g.time; this.perceiveT = Math.min(this.perceiveT, 0.05); }
    if (this.decideT <= 0 && !b.infected) this.decideT = b.health < 40 ? d.latency * 0.5 : d.latency;   // (nearly dead: the think is quicker)
  }
  // a hit knocks the aim: about 0.7 degrees per 30 damage (half as much again for a headshot), gone in 0.4 s, and
  // some of the settle is lost
  flinch(amount, headshot) {
    const dist = this.target ? this.target.pos.distanceTo(this.bot.pos) : 10, k = Math.min(1.5, amount / 30) * this.diff.flinch * (headshot ? 1.5 : 1);
    if (k <= 0) return;
    this.flinchV.set(rand(-1, 1), rand(0.3, 1), rand(-1, 1)).normalize().multiplyScalar(0.012 * k * Math.max(3, dist));
    this.flinchT = 0.4; this.seenT = Math.max(0, this.seenT - 0.5 * this.diff.flinch);
  }
  // our own hits: how much we've put into whom (a wounded one gets chased)
  onHit(victim, dmg) {
    if (this.hitsOn !== victim || this.game.time - this.hitsT > 2) { this.hitsOn = victim; this.hitsDealt = 0; }
    this.hitsDealt += dmg; this.hitsT = this.game.time;
  }
  // a kill: a beat before the next target (nobody chains kills like an aimbot), and the spot is remembered so the
  // bot rotates off it rather than camping it
  onKill(victim) {
    const b = this.bot, g = this.game, d = this.diff;
    if (this.target === victim) { this.target = null; this.visible = false; this.lostT = g.time; }
    this.reactT = Math.max(this.reactT, rand(...d.postKill));
    this.killsHere = (this.killPos && this.killPos.distanceTo(b.pos) < 2) ? this.killsHere + 1 : 1;
    this.killT = g.time; (this.killPos = this.killPos || new THREE.Vector3()).copy(b.pos);
    (this.victimPos = this.victimPos || new THREE.Vector3()).copy(victim.pos);
    this.postKill = true;
  }
  // a teammate died close by: the nearest mate goes to trade, walking in aimed (the death is intel, and the killer
  // is half-spotted already)
  onMateDown(victim, killer) {
    const g = this.game, b = this.bot;
    if (/^(plant|defuse|bomb|flag)$/.test(this.goalKind) || b.useHeld || b.infected || killer.pos.distanceTo(b.pos) > 25) return;
    g.reportIntel(b.team, killer.pos);
    this.spot.set(killer, Math.max(this.spot.get(killer) || 0, 0.6));
    this.target = killer; this.visible = false; this.lastKnown.copy(killer.pos); this.lastKnownT = g.time; this.lostT = g.time; this.lostDist = 99; this.huntFor = -1; this.hurtT = g.time - 2.5;
    this.goal = null; this.setGoal(this.lastKnown, 'hunt'); this.tradeT = g.time + 4;
    this.chaseUntil = killer.pos.distanceTo(b.pos) > 12 ? g.time + 1.5 : 0;   // (a long way off: the first stretch is run)
  }

  // After a hit, once the think is over: losing (low, or hit hard and fast) or outgunned (shot from somewhere
  // unseen, two of them, or far out of range) means fall back to cover and come back with health; winning or
  // close enough that closing wins means stand and trade. Planters and defusers never leave the bomb.
  assess() {
    const b = this.bot, d = this.diff, g = this.game, t = this.target, seen = this.visible && t;
    if (this.goalKind === 'cover' || this.goalKind === 'plant' || this.goalKind === 'defuse' || b.useHeld || b.infected) return;
    const dist = t ? t.pos.distanceTo(b.pos) : 99;
    // hit hard and fast counts as losing only when we aren't giving as good back (a trade we're winning is stood)
    const trading = seen && this.hitsOn === t && g.time - this.hitsT < 1.5 && this.hitsDealt >= this.dmgRecent;
    const losing = b.health < 40 || (this.dmgRecent > 50 && !trading);
    const outgunned = !seen || this.enemiesVisible >= 2 || dist > 40;
    let retreat = losing || outgunned;
    if (seen && !losing && (b.health > 60 || dist <= 12)) retreat = false;
    if (retreat && !losing && Math.random() > d.coverUse) retreat = false;   // (losing, everybody breaks the line; merely outgunned is the dice)
    if (!retreat) return;
    const from = seen ? t.pos : _bv4.copy(b.pos).addScaledVector(this.dmgDir, 12);
    const c = this.coverPoint(from, 6, losing) || (losing ? this.coverPoint(from, 3, true) : null);   // (nearly dead: anything close will do)
    if (c) { this.takeCover(c, PLAYER.regenDelay + 1.5); g.callout(b, 'hit', 0.3); }
    else if (losing && this.unstickT <= 0) { this.fleeFrom(from); this.unstickT = 1.2; this.fleeing = true; this.holding = false; }   // (nothing to get behind: run for it)
  }
  // The nearest spot within r the threat can't see the chest of (a spot that hides a crouched body counts, with
  // crouch: true), with an open cell beside it to step out from. 12 candidates on two rings, 2-4 sight checks
  // each, cached a second per threat cell; asked on transitions only, never every frame.
  coverPoint(threat, r = 6, urgent = false) {
    const b = this.bot, g = this.game, ph = g.physics, nav = g.world.nav.gridAt(b.pos);
    // (cached a second per threat cell, bot cell, radius and urgency: a bot that has moved a couple of metres asks afresh)
    const key = `${Math.floor(threat.x / 3)},${Math.floor(threat.z / 3)},${Math.floor(b.pos.x / 2)},${Math.floor(b.pos.z / 2)},${Math.round(b.pos.y)},${r},${urgent ? 1 : 0}`;
    if (this.coverCache && this.coverCache.key === key && g.time - this.coverCache.t < (urgent ? 0.5 : 1)) return this.coverCache.p;
    const eye = _bv1.set(threat.x, threat.y + 1.55, threat.z), y = b.pos.y;
    const tx = threat.x - b.pos.x, tz = threat.z - b.pos.z, tl = Math.hypot(tx, tz) || 1;
    let best = null, bs = -1e9, paths = 0;
    // three rings, 16 directions each (the rings offset so the spokes don't line up)
    for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 16; k++) {
      const rr = r * (ring === 0 ? 0.4 : ring === 1 ? 0.7 : 1), an = (k + ring / 3) / 16 * Math.PI * 2;
      const x = b.pos.x + Math.cos(an) * rr, z = b.pos.z + Math.sin(an) * rr;
      if (!nav.isOpenAt(x, z)) continue;
      // the spot has to hide at least a crouched body (the cheap test first: most candidates fail it)
      const chestHid = ph.blocked(eye, _bv2.set(x, y + 1.2, z));
      const crouchHid = chestHid || ph.blocked(eye, _bv2.set(x, y + 0.9, z));
      if (!crouchHid) continue;
      // the way there: a straight walk the body can make (the grid misses thin walls and planters, and a spot on the
      // far side of one is the wall the bot would die pushing against); failing that, a short way round (the A*
      // path, at most a couple of them per search, no longer than 2.5 x the straight line and 10 m)
      let way = rr;
      const straight = nav.lineClear(b.pos.x, b.pos.z, x, z) && !ph.blocked(_bv3.set(b.pos.x, y + 0.6, b.pos.z), _bv4.set(x, y + 0.6, z)) && !ph.blocked(_bv3.set(b.pos.x, y + 1.3, b.pos.z), _bv4.set(x, y + 1.3, z));
      if (!straight) {
        if (paths >= (urgent ? 4 : 2)) continue;
        paths++;
        const path = nav.findPathFlat(b.pos, _bv4.set(x, y, z));
        if (!path.length) continue;
        let len = 0, px = b.pos.x, pz = b.pos.z;
        for (const q of path) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
        if (len > Math.min(10, rr * 2.5)) continue;
        way = len;
      }
      const headHid = chestHid && ph.blocked(eye, _bv2.set(x, y + 1.62, z));
      const sx = -(threat.z - z), sz = threat.x - x, sl = Math.hypot(sx, sz) || 1;
      let peek = 0;
      for (const sg of [1, -1]) { const qx = x + sx / sl * sg, qz = z + sz / sl * sg; if (nav.isOpenAt(qx, qz) && !ph.blocked(eye, _bv3.set(qx, y + 1.2, qz))) { peek = sg; break; } }
      const toward = (Math.cos(an) * tx + Math.sin(an) * tz) / tl;   // +1 straight at them, -1 straight back
      // (urgent: nearly dead, the nearest thing that hides us beats the better spot further on)
      const sc = urgent ? (chestHid ? 1 : 0) + (headHid ? 0.5 : 0) - way * 1.2 - Math.max(0, toward) * 2
        : (chestHid ? 3 : 1.5) + (headHid ? 2 : 0) + (peek ? 2 : 0) - way * 0.3 - (toward < -0.5 && rr > 4 ? 3 : 0) - Math.max(0, toward) * 1.5;
      if (sc > bs) { bs = sc; best = { p: new THREE.Vector3(x, y, z), crouch: !chestHid || !headHid, peek, straight }; }
    }
    this.coverCache = { key, t: g.time, p: best };
    return best;
  }
  takeCover(c, hold) { this.coverGoal = c; this.coverHold = hold; this.goalKind = 'cover'; this.goal = c.p.clone(); this.repathT = 0; this.route = null; this.retreatT = this.game.time; this.atCover = false; this.peekPhase = undefined; this.holding = false; }
  coverDone() {
    const b = this.bot, g = this.game;
    if (g.time - this.retreatT > 10) return true;   // (never stuck in cover: the way there may have failed)
    if (!this.atCover && g.time - this.retreatT > 3) return true;   // (the spot is within 6 m: not there in 3 s means the way is blocked)
    if (this.coverHold > 0) return false;
    if (this.target && !this.target.alive) return true;
    return b.health >= 70 || g.time - this.retreatT > 8;
  }
  // safe to reload here: behind cover, or nobody spotted within 20 m and the ground quiet
  reloadSafe() {
    const b = this.bot, g = this.game;
    if (this.atCover || this.holding) return true;
    if (this.threat >= 0.5) return false;
    for (const [e, m] of this.spot) if (m > 0.5 && e.alive && e.pos.distanceTo(b.pos) < 20) return false;
    return g.time - this.lostT > 1.5;
  }
  // after a kill: a new angle 6-14 m off, hidden from where the victim was (8 candidates, once per kill)
  startRotate() {
    const b = this.bot, g = this.game, nav = g.world.nav.gridAt(b.pos), vp = this.victimPos, eye = _bv1.set(vp.x, vp.y + 1.6, vp.z), a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const a = a0 + k * Math.PI / 4, r = rand(6, 14), x = b.pos.x + Math.cos(a) * r, z = b.pos.z + Math.sin(a) * r;
      if (nav.isOpenAt(x, z) && nav.lineClear(b.pos.x, b.pos.z, x, z) && g.physics.blocked(eye, _bv2.set(x, b.pos.y + 1.2, z))) {
        this.goal = null; this.setGoal(_e.set(x, b.pos.y, z), 'rotate'); this.goalT = rand(4, 8); this.lookAt = vp.clone(); this.killsHere = 0; return true;
      }
    }
    return false;
  }
  // a live grenade close by: the clearest direction away from it (and toward open ground)
  fleeFrom(p) {
    const b = this.bot, nav = this.game.world.nav.gridAt(b.pos);
    const ax = b.pos.x - p.x, az = b.pos.z - p.z, al = Math.hypot(ax, az) || 1;
    let best = null, bestS = -Infinity;
    const base = Math.random() * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = base + k * Math.PI / 6, x = Math.cos(a), z = Math.sin(a);
      if (this.blockedDir(x, z, 0.7)) continue;
      const sc = (x * ax + z * az) / al + (nav.isOpenAt(b.pos.x + x * 3, b.pos.z + z * 3) ? 0.5 : -1) + Math.random() * 0.3;
      if (sc > bestS) { bestS = sc; best = [x, z]; }
    }
    if (!best) best = [ax / al, az / al];
    this.unstickDir.set(best[0], 0, best[1]);
  }
  // would a throw at `aim` with flight time T clear the walls? three points along the arc
  arcClear(aim, T) {
    const b = this.bot, ph = this.game.physics, eye = b.eyePos(_bv1), f = b.forward(_bv2);
    const ox = eye.x + f.x * 0.5, oy = eye.y, oz = eye.z + f.z * 0.5;
    const vx = (aim.x - ox) / T, vz = (aim.z - oz) / T, vy = (aim.y + 0.3 - oy + 0.5 * 20 * T * T) / T;
    let px = ox, py = oy, pz = oz;
    for (const t of [0.2, 0.45, 0.7]) {
      const x = ox + vx * t, y = oy + vy * t - 10 * t * t, z = oz + vz * t;
      if (ph.blocked(_bv3.set(px, py, pz), _bv4.set(x, y, z))) return false;
      px = x; py = y; pz = z;
    }
    return true;
  }

  newAimError(t) {
    const dist = t.pos.distanceTo(this.bot.pos);
    const cover = 1 + (1 - clamp(this.expo ?? 1, 0, 1)) * 1.6; // harder to hit what you can barely see
    let mag = (this.diff.aimError * dist * rand(0.4, 1.2) * cover + 0.15) * (this.bot.stunT > 0 ? 3 : 1);   // stunned: wild aim
    const sp = Math.hypot(t.vel.x, t.vel.z); _bv4.subVectors(t.pos, this.bot.pos).setY(0).normalize();
    const cross = sp > 0.1 ? Math.abs(t.vel.x * _bv4.z - t.vel.z * _bv4.x) / Math.max(3, dist) : 0;
    mag *= 1 + cross / 1.5;   // (a runner crossing in front is harder than one coming straight on)
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
      this.route = (kind === 'health' || kind === 'ammo' || kind === 'hunt' || kind === 'cover' || kind === 'rotate') ? null : { seed: (Math.random() * ROUTE_SEEDS) | 0, w: 1.2 + Math.random() * 2.6 };
      if (kind !== 'rotate') this.lookAt = null;
    }
  }

  chooseGoal(dt) {
    const b = this.bot, g = this.game, d = this.diff, w = b.weapon;
    this.goalT -= dt;
    if (this.idleT > 0) this.idleT -= dt;
    // in cover: stay until done (a visible target doesn't pull the bot back out; combat() still shoots from here)
    if (this.goalKind === 'cover' && this.coverGoal) {
      if (!this.coverDone()) return;
      this.coverGoal = null; this.atCover = false; this.peekPhase = undefined; this.goalKind = 'hunt'; this.goal = null;
      if (this.target && this.target.alive) this.lastKnownT = Math.max(this.lastKnownT, g.time - 1);
    }
    if (this.visible && this.target) { this.goalKind = 'engage'; this.idleT = 0; return; }
    if (this.goalKind === 'engage') { this.goalKind = 'hunt'; this.goal = null; }
    // just made a kill, nobody else in sight: top up, then either rotate to a new angle (always after two kills from
    // one spot) or hold a beat on where they fell
    if (this.postKill && this.enemiesVisible === 0 && g.time - this.killT < 3 && !/^(plant|defuse|flag|bomb|cover)$/.test(this.goalKind) && !b.infected) {
      this.postKill = false;
      if (w.mag < w.def.mag * 0.6 && w.reserve > 0 && !w.reloading) b.reload();
      if ((this.killsHere >= 2 || Math.random() < d.rotateKill) && this.startRotate()) return;
      this.idleT = rand(2, 4); this.idleDone = true; this.lookAt = this.victimPos.clone(); this.pickLook(true); this.preAimHold = g.time + this.idleT;
    }
    // Infected: survivors hide, the infected go looking for them
    if (g.inf && this.infectedGoal(dt)) return;
    // round modes hand out objectives: plant, defuse, guard a site, take the flag
    const og = g.gm && g.gm.botGoal(this, b);
    if (og) {
      // chase a fresh sighting (or go to trade for a teammate) first, unless the objective is urgent
      const urgent = og.kind === 'plant' || og.kind === 'defuse' || og.kind === 'flag' || og.kind === 'bomb';
      if (!urgent && ((this.target && this.target.alive && g.time - this.lastKnownT < 4) || g.time < this.tradeT) && this.huntLost()) return;
      this.setGoal(og.pos, og.kind);
      return;
    }
    if (b.health < 45) {
      const p = g.nearestPickup('health', b.pos, true);
      if (p && p.pos.distanceTo(b.pos) < 35) { this.setGoal(p.pos, 'health'); return; }
    }
    const w0 = b.weapons[0];
    if (w0.mag + w0.reserve < w0.def.mag * 1.5) {
      const p = g.nearestPickup('ammo', b.pos, true);
      if (p) { this.setGoal(p.pos, 'ammo'); return; }
    }
    if (this.huntLost()) return;
    // got to the last sighting and found nobody: a look round, then forget it and move on
    if (this.goalKind === 'hunt' && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < 2.5 && Math.abs(this.goal.y - b.pos.y) < 1.6) { this.goal = null; this.lastKnownT = -99; this.idleT = 0.6; this.pickLook(true); }
    const reached = this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < 2 && Math.abs(this.goal.y - b.pos.y) < 1.6;
    // reaching a roam spot: sometimes stop and check the angles for a moment, like a player would
    if (reached && (this.goalKind === 'roam' || this.goalKind === 'intel') && this.idleT <= 0 && !this.idleDone && Math.random() < 0.45) {
      this.idleT = rand(0.8, 2.6); this.idleDone = true; this.pickLook(true);
    }
    if (this.idleT > 0) return;
    this.idleDone = false;
    if (!this.goal || reached || this.goalT <= 0 || this.goalKind === 'hunt' || this.goalKind === 'health' || this.goalKind === 'ammo' || this.goalKind === 'watch' || (this.goalKind === 'rotate' && this.goalT <= 0)) {
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

  // A target that just went out of sight. First a short hold on the corner it went behind, sighted (a player
  // waits for the re-peek); then an approach that comes in 3-5 m off the straight line, on the side away from
  // where they were heading, walked and aimed (the sprint rule in move()); a wounded one is chased down instead;
  // one that was winning the exchange is not pushed: fall back and re-peek. Returns true when it set the goal.
  huntLost() {
    const b = this.bot, g = this.game, d = this.diff, lk = this.lastKnown;
    const notThere = Math.hypot(lk.x - b.pos.x, lk.z - b.pos.z) > 2.5 || Math.abs(lk.y - b.pos.y) > 1.6;
    const ld = Math.hypot(lk.x - b.pos.x, lk.z - b.pos.z);
    // (worth going to for lkp seconds plus the walk there, up to 8 s more: the approach is walked, aimed in)
    if (!(this.target && this.target.alive && g.time - this.lastKnownT < d.lkp + Math.min(8, ld / 2.7) && notThere)) return false;
    if (this.huntFor !== this.lastKnownT) {   // a new vanish: roll the hold, the chase and the approach point once
      this.huntFor = this.lastKnownT; this.watchFor = rand(1.2, 2);
      const wounded = this.hitsOn === this.target && this.hitsDealt >= 60 && g.time - this.hitsT < 2 && Math.random() < d.chase;
      this.chaseUntil = wounded ? g.time + 2 : 0;
      _c.set(lk.x - b.pos.x, 0, lk.z - b.pos.z).normalize(); const perp = _e.set(_c.z, 0, -_c.x);
      const side = Math.sign(-(this.target.vel.x * perp.x + this.target.vel.z * perp.z)) || (Math.random() < 0.5 ? 1 : -1);
      this.huntGoal.copy(lk).addScaledVector(perp, side * rand(3, 5));
      if (!g.world.nav.gridAt(lk).isOpenAt(this.huntGoal.x, this.huntGoal.z)) this.huntGoal.copy(lk);
      // we strafed behind something ourselves: no wait on the corner, step back out to where the fight was
      if (this.lostSelf) { this.watchFor = 0; this.huntGoal.copy(this.fightPos); }
      if (this.lostShooting && g.time - this.hurtT < 2 && !this.coverGoal && !b.infected && Math.random() < d.coverUse) { const c = this.coverPoint(lk, 6); if (c) { this.takeCover(c, 2); return true; } }
    }
    // (the hold on the corner is for one that just slipped out of sight; a position called in by a teammate is walked to)
    if (!this.chaseUntil && ld < 15 && g.time - this.lostT < 1 && g.time - this.lastKnownT < this.watchFor && !b.infected && g.time >= this.tradeT) { this.goalKind = 'watch'; this.goal = null; return true; }
    this.setGoal(this.chaseUntil > g.time ? lk : this.huntGoal, 'hunt');
    return true;
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
    if (this.pathIdx >= this.path.length) { this.cornering = false; return null; }
    const wp = this.path[this.pathIdx], nx = this.path[this.pathIdx + 1];
    // a corner ahead (the route turns more than 50 degrees within 3 m): a player pre-aims it, at a walk (the
    // difficulty's preAim is how often); the yaw to hold is the next leg's
    this.cornering = false;
    if (nx) {
      const d0 = Math.hypot(wp.x - b.pos.x, wp.z - b.pos.z);
      if (d0 < 3) {
        const a1 = Math.atan2(-(wp.x - b.pos.x), -(wp.z - b.pos.z)), a2 = Math.atan2(-(nx.x - wp.x), -(nx.z - wp.z));
        if (Math.abs(angDiff(a1, a2)) > 0.87) { if (this.cornerWp !== wp) { this.cornerWp = wp; this.cornerAim = Math.random() < this.diff.preAim; } if (this.cornerAim) { this.cornering = true; this.cornerYaw = a2; } }
      }
    }
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
    // a live grenade close by (an enemy's, or our own cook gone wrong): after the difficulty's reaction time, run
    this.nadeT -= dt;
    if (this.nadeT <= 0) {
      this.nadeT = 0.2; this.nade = null;
      for (const gr of g.grenades) {
        const sp = gr.spec; if (gr.rocket || !sp || !(sp.damage > 0) || sp.knife) continue;
        if (gr.owner && gr.owner !== b && !g.foes(gr.owner, b) && !g.settings.friendlyFire) continue;
        const dd = gr.pos.distanceTo(b.pos), R = (sp.radius || 7) + 1;
        if (dd < R && gr.fuse > 0.25 && gr.fuse < (gr.owner === b ? 1.6 : 3.2)) { this.nade = gr; break; }
      }
      if (this.nade && this.nadeSeen !== this.nade) { this.nadeSeen = this.nade; this.nadeReactT = d.nadeDodge; g.callout(b, 'grenade', 0.5, false, true); }
    }
    if (this.nade) { this.nadeReactT -= dt; if (this.nadeReactT <= 0 && this.unstickT <= 0.05) { this.fleeFrom(this.nade.pos); this.unstickT = clamp(this.nade.fuse + 0.1, 0.5, 1.4); this.fleeing = true; this.holding = false; } }
    // how dangerous the ground here is: a fresh sighting close by, a callout, a teammate down nearby, a hit just
    // taken, the objective. Sprinting is for ground that isn't.
    {
      const dxz = p => Math.hypot(p.x - b.pos.x, p.z - b.pos.z);
      let th = 0;
      if (this.target && this.target.alive && g.time - this.lastKnownT < 8 && dxz(this.lastKnown) < 20) th = 1;
      const it = g.intel[b.team]; if (it && g.time - it.time < 6 && dxz(it.pos) < 15) th = Math.max(th, 0.8);
      const rd = g.recentDeaths; if (rd) for (let i = rd.length - 1; i >= 0 && g.time - rd[i].t < 10; i--) if (rd[i].team === b.team && Math.hypot(rd[i].x - b.pos.x, rd[i].z - b.pos.z) < 12) { th = Math.max(th, 0.7); break; }
      if (g.time - this.hurtT < 3) th = 1;
      if (this.goal && /^(plant|defuse|guard|push|flag)$/.test(this.goalKind) && dxz(this.goal) < 12) th = Math.max(th, 0.6);
      // the ground has been quiet for a while: the care wears off (sooner on the lower difficulties)
      this.quietT = th >= 0.5 && !this.visible ? this.quietT + dt : 0;
      if (th >= 0.5 && this.quietT > 6 + 10 * d.preAim) th = 0.4;
      this.threat = th;
    }
    // objective spots: stop there (and hold the button to plant / defuse); guard / push spots: settle into
    // a stance and check angles until the mode hands out the next spot; cover: tuck in; a lost target's corner: watch
    const hold = { plant: 0.8, defuse: 0.9, flag: 1.4, guard: 1.6, push: 2, hide: 1.2, cover: 0.9, rotate: 1.2 }[this.goalKind];
    const idle = this.idleT > 0 && this.goalKind !== 'engage';
    const watching = this.goalKind === 'watch';
    let arrived = hold && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < hold;
    if (this.goalKind === 'cover' && this.coverGoal && this.goal) {
      // cover is reached when the body is out of the threat's sight (crouched, if that's the kind of spot it is): on
      // the spot itself, or a little short of it (the body's radius can keep it off a cell centre beside a wall);
      // a crouch-high spot is precise, so the plain radius isn't enough for one
      const dg = Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z);
      const from = this.visible && this.target ? this.target.pos : this.lastKnownT > g.time - 8 && this.target ? this.lastKnown : null;
      const hid = from ? g.physics.blocked(_bv1.set(from.x, from.y + 1.55, from.z), _bv2.set(b.pos.x, b.pos.y + (this.coverGoal.crouch ? 0.9 : 1.2), b.pos.z)) : true;
      this.coverHid = hid;   // (the hold branch reloads on it)
      arrived = dg < 0.45 || (dg < 2.2 && hid) || (arrived && !this.coverGoal.crouch);
      // (held up a step short of it by a prop the grid doesn't know: tuck in here rather than stand there pushing)
      this.coverSlowT = Math.hypot(b.vel.x, b.vel.z) < 1 && g.time - this.retreatT > 0.4 ? this.coverSlowT + dt : 0;
      if (this.coverSlowT > 0.3 && dg < 2.5) arrived = true;
    } else this.coverSlowT = 0;
    if (!this.fleeing && (idle || watching || arrived)) {
      if (this.goalKind === 'plant' || this.goalKind === 'defuse') { b.useHeld = true; this.crouch = this.goalKind === 'defuse'; }
      else if (watching) { /* sighted on the corner (aim() looks there), feet still */ }
      else if (this.goalKind === 'cover' && this.coverGoal) {
        // tucked in: low if the spot needs it or we're hurt, a reload while nothing is in sight, the sights on where
        // they are (aim()); the hold runs down here, and chooseGoal lets us back out when it's done
        this.atCover = true; this.coverHold -= dt;
        this.crouch = this.coverGoal.crouch || b.health < 50;
        // top up behind the cover (our body out of their sight, even with their head in view over it): the primary
        // first, back from the pistol if need be
        const pr = b.weapons[0], hid = !this.visible || this.coverHid || this.expo < 0.7;
        if (hid && pr.reserve > 0 && !pr.reloading && pr.mag < pr.def.mag * 0.6) { if (b.cur !== 0) { if (b.switchT <= 0) b.switchTo(0); } else b.reload(); }
        else if (w.mag < w.def.mag * 0.6 && !w.reloading && w.reserve > 0 && (hid || w.mag === 0)) b.reload();
        if (!this.visible && !(this.target && g.time - this.lastKnownT < d.lkp)) { if (!this.holding) { this.holding = true; this.pickLook(true); } this.lookT -= dt; if (this.lookT <= 0) this.pickLook(false); }
      }
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
    if (this.goalKind !== 'cover') this.atCover = false;

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
        const back = !hitNow && Math.abs(off) > 2 && this.strafeDir === -Math.sign(off);   // (already on the way back: a short leg on, no plant)
        if (!hitNow && Math.abs(off) > 2) this.strafeDir = -Math.sign(off);
        // a leg is 0.2-0.75 s, never a metronome; a quarter of reversals start with a 100 ms plant (the plant is on
        // top of the leg, so a leg is never a twitch); whether this leg moves at all is the difficulty's strafe dice
        // (a hit always gets the feet going), and a stood-still leg is short
        this.strafeOn = hitNow || back || Math.random() < d.strafe;
        this.strafeStop = this.strafeOn && !hitNow && !back && Math.random() < 0.25 ? 0.1 : 0;
        this.strafeT = back ? rand(0.15, 0.3) : this.strafeOn ? rand(0.3, 0.6) + rand(-0.1, 0.15) + this.strafeStop : rand(0.2, 0.4);
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
        const dg = Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z), lk = this.lastKnown;
        // sprint across quiet ground; walk in aimed where it's dangerous, round a corner, and the last 15 m to
        // where a target went (unless chasing a wounded one); a retreat to cover is run, so is a rotation
        if (this.goalKind === 'cover') sprint = dg > 1.6;
        else if (this.goalKind === 'rotate') sprint = dg > 4;
        else sprint = (dg > 8 && this.threat < 0.5 && !this.cornering && !(this.goalKind === 'hunt' && Math.hypot(lk.x - b.pos.x, lk.z - b.pos.z) < 15)) || this.chaseUntil > g.time || (g.time < this.pushT + 2 && this.target && this.target.stunT > 0);
        this.noPathT = 0;
        // falling back under fire: never a straight backpedal (slow, and they walk you down): angle off
        if (this.goalKind === 'cover' && this.visible && this.target) {
          _c.subVectors(this.target.pos, b.pos).setY(0).normalize();
          if (wish.dot(_c) < -0.85) wish.addScaledVector(_e.set(_c.z, 0, -_c.x), this.strafeDir).normalize();
        }
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

    // unsticking: walk toward open space for a moment instead of pushing into the obstacle (running, from a grenade)
    if (this.unstickT > 0) {
      this.unstickT -= dt;
      wish.copy(this.unstickDir);
      sprint = this.fleeing;
      if (this.fleeing) { this.crouch = this.prone = false; b.useHeld = false; }
      if (this.unstickT <= 0 && this.fleeing) { this.fleeing = false; this.nade = null; }
    } else if (wish.lengthSq() > 0.04) this.steer(wish);

    // stuck detection: barely moved for most of a second while trying to. The clock only runs while the bot wants
    // to move (standing still on purpose, or having only just set off, isn't stuck), and the ground covered counts
    // as well as the net displacement (a strafe that turns round ends up where it started without being stuck)
    if (wish.lengthSq() <= 0.2 || this.atCover || this.strafeStop > 0 || watching || this.fleeing) this.stuckIdle();
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
    if (!run || this.threat >= 0.3 || this.goalKind === 'cover') this.tac = false;
    else if (!this.tac && b.tacFuel >= PLAYER.tacTime * 0.9 && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) > 18) this.tac = true;
    // something breakable across the way (boards over a doorway, a pane): kick it in and carry on
    // (on the way somewhere, never mid-fight: a strafe past a shop window is not a reason to kick it in)
    if (g.breakables && wish.lengthSq() > 0.04 && b.meleeCd <= 0 && !this.visible && this.goalKind !== 'engage' && (this.breachT = (this.breachT || 0) + dt) > 0.25) {
      this.breachT = 0;
      const eye = b.eyePos(_bv1), dir = _bv2.copy(wish).normalize(), hit = g.physics.raycast(eye, dir, 1.4);
      if (hit && hit.box.breakable !== undefined) { b.yaw = Math.atan2(-dir.x, -dir.z); b.melee(); }
    }
    // the slide: the last couple of metres into cover or a hold spot in a nook, out of a sprint (the difficulty's
    // slide dice; never twice in three seconds)
    let slideReq = false; this.slideCd = Math.max(0, this.slideCd - dt);
    if (run && b.sprinting && b.onGround && this.goal && this.slideCd <= 0 && Math.hypot(b.vel.x, b.vel.z) > PLAYER.walk && (this.goalKind === 'cover' || this.goalKind === 'rotate' || this.goalKind === 'guard' || this.goalKind === 'push')) {
      const dg = Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z);
      if (dg < 3.2 && dg > 1.6 && (Math.random() < d.slide || (this.goalKind === 'cover' && b.health < 50))) {   // (hurt, everybody slides in)
        let ring = 0; if (this.goalKind !== 'cover') { const gr = nav.gridAt(b.pos); for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; if (!gr.isOpenAt(this.goal.x + Math.cos(an) * 1.3, this.goal.z + Math.sin(an) * 1.3)) ring++; } }
        if (this.goalKind === 'cover' || ring >= 3) { slideReq = true; this.slideCd = 3; }
      }
    }
    b.updateMovement(dt, wish, run, jump, slideReq, run && this.tac);
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
    const b = this.bot, an = this.gmAnchor, la = this.lookAt;
    let base = b.yaw;
    if (la) base = Math.atan2(-(la.x - b.pos.x), -(la.z - b.pos.z));   // (where they fell, where they went)
    else if (an && Math.hypot(b.pos.x - an.x, b.pos.z - an.z) > 1.5) base = Math.atan2(-(b.pos.x - an.x), -(b.pos.z - an.z));
    else if (fresh) base = b.yaw;
    const r = Math.random();
    this.lookYaw = la ? base + rand(-0.3, 0.3) : r < 0.12 ? base + Math.PI + rand(-0.5, 0.5) : base + rand(-1.3, 1.3);
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
      // the error settles the longer they're in view (to the difficulty's floor); the aim is a first-order track
      // on where they'll be in one time constant: no lag on a steady runner, a trail of ~tau after a reversal,
      // and the first look lands behind a runner; a hit knocks it (flinch)
      const settle = d.aimFloor + (1 - d.aimFloor) * Math.exp(-this.seenT / d.settle);
      if (this.expo >= 0.7) (this.aimHead ? t.headPos(_b) : t.chestPos(_b));
      else _b.copy(t.pos).add(this.aimLocal);
      const tau = Math.max(0.05, d.lag);
      _bv3.copy(_b).addScaledVector(t.vel, tau);
      if (!this.aimInit) { this.aimSmooth.copy(_b).addScaledVector(t.vel, -tau * 1.5).addScaledVector(this.aimErr, 1.5); this.aimInit = true; }
      this.aimSmooth.lerp(_bv3, 1 - Math.exp(-dt / tau));
      if (this.flinchT > 0) { this.flinchT -= dt; this.flinchV.multiplyScalar(Math.exp(-dt / 0.18)); } else this.flinchV.set(0, 0, 0);
      _b.copy(this.aimSmooth).addScaledVector(this.aimErr, settle).add(this.flinchV);
      _c.subVectors(_b, eye);
      dy = Math.atan2(-_c.x, -_c.z);
      dp = Math.atan2(_c.y, Math.hypot(_c.x, _c.z));
      // angular error between current view and the target's center
      t.chestPos(_b).sub(eye).normalize();
      this.aimOff = Math.acos(clamp(b.forward(_c).dot(_b), -1, 1));
    } else if (this.target && this.target.alive && g.time - this.lastKnownT < d.lkp) {
      // the edge they went behind (a little ahead of it, the way they were going, for the first moment), at head height
      const lk = this.lastKnown, ld = Math.hypot(lk.x - b.pos.x, lk.z - b.pos.z);
      _c.set(lk.x, lk.y + 1.5, lk.z);
      if (g.time - this.lostT < 1.5 && ld < 15) _c.addScaledVector(this.target.vel, 0.3);
      _c.sub(eye);
      if (_c.x * _c.x + _c.z * _c.z > 1) { dy = Math.atan2(-_c.x, -_c.z); dp = clamp(Math.atan2(_c.y, Math.hypot(_c.x, _c.z)), -0.6, 0.6); }
    } else if (this.cornering) {
      dy = this.cornerYaw; dp = 0;   // the corner ahead, pre-aimed
    } else if ((this.holding || this.idleT > 0) && this.lookYaw !== null) {
      dy = this.lookYaw; dp = this.lookPitch;
    } else if (Math.hypot(b.vel.x, b.vel.z) > 1) {
      dy = Math.atan2(-b.vel.x, -b.vel.z);
    }
    const rate = d.turnRate * (this.visible ? 1 : 0.7) * (b.stunT > 0 ? 0.35 : 1) * dt;
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
    if (g.time < this.preAimHold) return 1;
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
    // a fresh stun costs a beat
    if (b.stunT > this.lastStun + 1) this.reactT = Math.max(this.reactT, 0.3);
    this.lastStun = b.stunT;

    if (!engaging) {
      // back to the primary once the fight's over; a top-up only where it's safe (or the mag's empty), never on the run
      const primary = b.weapons[0];
      if (b.cur === 1 && primary.mag + primary.reserve > 0 && g.time - this.lastKnownT > 1.5) b.switchTo(0);
      else if (w.mag < w.def.mag * 0.6 && w.reserve > 0 && !w.reloading && !b.sprinting && (w.mag === 0 || this.reloadSafe())) b.reload();
    }

    // Grenades, the way a player throws them: at a target that just broke line of sight (the classic frag), with
    // lead on a runner, cooked so it goes off on arrival, only when the arc is clear, never point blank, never
    // while being shot, mid-reload or mid-burst in the open. A stun for someone sitting still, or (hard) ahead of
    // a push onto a corner, followed by the push.
    this.grenadeT -= dt;
    if (this.grenadeT <= 0) {
      this.grenadeT = 1.5;
      const t = this.target, fresh = t && t.alive && g.time - this.lastKnownT < 3, spec = EQUIPMENT[b.lethal];
      const ducked = fresh && !engaging && g.time - this.lostT < 1.5;
      const safe = g.time - this.hurtT > 1.5 && !w.reloading && this.goalKind !== 'cover' && (!engaging || this.expo < 0.5 || this.pauseT > 0.25);
      if (b.grenades > 0 && b.grenadeCd <= 0 && fresh && safe && spec && !spec.knife && Math.random() < (ducked ? 0.55 : 0.2)) {
        const from = engaging ? t.pos : this.lastKnown, d0 = from.distanceTo(b.pos), T = clamp(d0 / 14, 0.5, 1.4);
        const aim = _bv4.copy(from); if (engaging) aim.addScaledVector(t.vel, T * 0.8);
        const ld = aim.distanceTo(b.pos);
        if (ld > 7 && ld < 28 && this.arcClear(aim, T)) {
          const cook = spec.cook && Math.random() < d.cook ? clamp(spec.fuse - T - 0.45, 0, 1.6) : 0;
          b.throwGrenade(aim.clone(), cook); this.grenadeT = rand(10, 20);
        }
      }
      if (this.grenadeT > 0 && b.tacticals > 0 && b.grenadeCd <= 0 && !w.reloading && safe) {
        const still = engaging && dist > 6 && dist < 20 && this.targetStillT > 2;
        const corner = !engaging && this.goalKind === 'hunt' && fresh && d.preAim >= 0.8 && this.lastKnown.distanceTo(b.pos) > 8 && this.lastKnown.distanceTo(b.pos) < 20;
        if ((still && Math.random() < 0.5) || (corner && Math.random() < 0.25)) {
          const p = engaging ? t.pos : this.lastKnown;
          if (this.arcClear(p, clamp(p.distanceTo(b.pos) / 14, 0.5, 1.4))) { b.throwTactical(p.clone()); this.pushT = g.time; this.grenadeT = Math.max(this.grenadeT, 6); }
        }
      }
    }

    // they just ducked behind the edge mid-burst: the burst runs on into it for a moment (a player over-shoots)
    if (!engaging && this.target && g.time - this.lostT < 0.25 && w.def.auto && this.pauseT <= 0 && this.burstT > 0 && w.mag > 0 && this.goalKind !== 'cover' && this.sprintOutT <= 0 && !b.sprinting) {
      b.tryFire(b.eyePos(_a), b.forward(_b)); this.burstT -= dt;
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
    // running dry in a fight: the swap beats the reload up close; otherwise get to cover (the reload starts now and
    // move() carries it there); nobody reloads a mag with rounds in it standing in the open
    const low = w.mag === 0 || (w.mag <= Math.max(2, w.def.mag * 0.25) && this.fightT > 0.5 && this.pauseT > 0);
    if (low) {
      // cover first (the pistol comes out on the way there, and the rifle is reloaded behind it)
      if (!this.coverGoal && g.time - this.retreatT > 4 && !b.infected) { const c = this.coverPoint(this.target.pos, 6); if (c && Math.random() < d.coverUse + 0.2) this.takeCover(c, Math.min(4, w.def.reload + 1.2)); }
      if (w.mag === 0 && b.cur === 0 && pistol.mag > 0 && dist < pistol.def.botRange[1]) { b.switchTo(1); return; }
      // on the way to cover the reload waits for it (a walk-and-reload in the open is the slow way to die); if the
      // cover hasn't been reached in a couple of seconds, reload anyway
      if (w.mag === 0 && !w.reloading) { if (this.goalKind !== 'cover' || this.atCover || g.time - this.retreatT > 2.5) b.reload(); return; }
      if (w.mag === 0) return;
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
