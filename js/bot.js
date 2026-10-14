// Bot AI: perception, goal selection, pathing, aiming, shooting, grenades
import * as THREE from 'three';
import { DIFFICULTY, PLAYER } from './config.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BotBrain {
  constructor(bot, game) {
    this.bot = bot;
    this.game = game;
    this.diff = DIFFICULTY[game.settings.difficulty] || DIFFICULTY.normal;
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
    this.stuckT = 1; this.lastPos.copy(this.bot.pos);
    this.unstickT = 0; this.stuckN = 0; if (!this.unstickDir) this.unstickDir = new THREE.Vector3();
    this.grenadeT = rand(4, 10);
    this.crouch = false;
    if (this.spot) this.spot.clear();
  }

  update(dt) {
    const b = this.bot;
    if (!b.alive) return;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.12; this.perceive(); }
    if (this.visible) { this.seenT += dt; this.reactT -= dt; }
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
    let best = null, bestScore = Infinity, bestExp = 0;
    for (const e of g.characters) {
      if (!e.alive || e.team === b.team) { this.spot.delete(e); continue; }
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
      m = Math.min(1.6, m + rate * step);
      this.spot.set(e, m);
      if (m < 1) continue;
      const score = dist - (e === this.target ? 8 : 0);
      if (score < bestScore) { bestScore = score; best = e; bestExp = exp; this.bestAim = this.bestAim || new THREE.Vector3(); this.bestAim.copy(this.aimPt); }
    }
    if (best) {
      if (best !== this.target || !this.visible) {
        this.reactT = d.reaction * rand(0.7, 1.3) * (this.visible || g.time - this.lastKnownT < 1.5 ? 0.5 : 1);
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
    if (!attacker || attacker.team === this.bot.team) return;
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
    const mag = this.diff.aimError * dist * rand(0.4, 1.2) * cover + 0.15;
    this.aimErr.set(rand(-1, 1), rand(-0.6, 0.6), rand(-1, 1)).normalize().multiplyScalar(mag);
    this.aimHead = Math.random() < this.diff.headChance;
    this.aimErrT = rand(0.25, 0.55);
  }

  setGoal(p, kind) {
    if (!this.goal || this.goal.distanceToSquared(p) > 4 || kind !== this.goalKind) {
      this.goal = p.clone();
      this.goal.y = 0;
      this.goalKind = kind;
      this.repathT = 0;
      this.goalT = kind === 'roam' || kind === 'intel' ? rand(10, 18) : 12;
    }
  }

  chooseGoal(dt) {
    const b = this.bot, g = this.game;
    this.goalT -= dt;
    if (this.visible && this.target) { this.goalKind = 'engage'; return; }
    if (this.goalKind === 'engage') { this.goalKind = 'hunt'; this.goal = null; }
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
      && Math.hypot(this.lastKnown.x - b.pos.x, this.lastKnown.z - b.pos.z) > 2.5) { this.setGoal(this.lastKnown, 'hunt'); return; }
    // got to the last sighting and found nobody: forget it and move on
    if (this.goalKind === 'hunt' && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < 2.5) { this.goal = null; this.lastKnownT = -99; }
    const reached = this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < 2;
    if (!this.goal || reached || this.goalT <= 0 || this.goalKind === 'hunt' || this.goalKind === 'health' || this.goalKind === 'ammo') {
      const intel = g.intel[b.team];
      if (g.time - intel.time < 8 && Math.random() < 0.6) {
        _e.copy(intel.pos).add(_a.set(rand(-4, 4), 0, rand(-4, 4)));
        this.goal = null;
        this.setGoal(_e, 'intel');
      } else {
        const side = b.team === 0 ? 1 : -1; // blue pushes +x, red pushes -x
        const p = g.world.nav.randomOpenPoint(q => q.x * side > -18 && Math.abs(q.x) < 38);
        this.goal = null;
        this.setGoal(p, 'roam');
      }
    }
  }

  followPath(target, dt) {
    const b = this.bot, nav = this.game.world.nav;
    this.repathT -= dt;
    if (this.repathT <= 0 || this.pathIdx >= this.path.length) {
      this.path = nav.findPath(b.pos, target);
      this.pathIdx = 0;
      this.repathT = rand(0.8, 1.5);
    }
    while (this.pathIdx < this.path.length && Math.hypot(this.path[this.pathIdx].x - b.pos.x, this.path[this.pathIdx].z - b.pos.z) < 0.7) this.pathIdx++;
    if (this.pathIdx >= this.path.length) return null;
    const wp = this.path[this.pathIdx];
    return _d.set(wp.x - b.pos.x, 0, wp.z - b.pos.z).normalize();
  }

  move(dt) {
    const b = this.bot, g = this.game, nav = g.world.nav;
    const wish = this.wish.set(0, 0, 0);
    let sprint = false, jump = false;
    this.crouch = false;
    b.useHeld = false;
    // objective spots: stop there (and hold the button to plant / defuse)
    const hold = { plant: 0.8, defuse: 0.9, flag: 1.4, guard: 1.6 }[this.goalKind];
    if (hold && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) < hold) {
      if (this.goalKind === 'plant' || this.goalKind === 'defuse') b.useHeld = true;
      this.goalT = 30;
      b.wantCrouch = this.goalKind === 'guard' && Math.random() < 0.002 ? !b.wantCrouch : b.wantCrouch;
      b.updateMovement(dt, wish, false, false, false, false);
      return;
    }

    if (this.goalKind === 'engage' && this.target) {
      const t = this.target;
      const dist = b.pos.distanceTo(t.pos);
      const [mn, mx] = b.weapon.def.botRange;
      _c.subVectors(t.pos, b.pos); _c.y = 0; _c.normalize();
      const perp = _e.set(_c.z, 0, -_c.x);
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeDir = Math.random() < 0.7 ? -this.strafeDir : this.strafeDir;
        this.strafeT = rand(0.35, 1.3);
        if (Math.random() < (this.game.settings.difficulty === 'hard' ? 0.15 : 0.06)) jump = true;
        this.crouchEngage = Math.random() < 0.2 && dist > 14;
      }
      this.crouch = !!this.crouchEngage;
      wish.addScaledVector(perp, this.strafeDir * (this.crouch ? 0.4 : 1));
      if (dist > mx) {
        const dir = this.followPath(t.pos, dt);
        if (dir) wish.addScaledVector(dir, 1.2);
      } else if (dist < mn) {
        wish.addScaledVector(_c, -1);
      }
      if (!nav.isOpenAt(b.pos.x + wish.x * 1.2, b.pos.z + wish.z * 1.2)) {
        this.strafeDir *= -1;
        wish.addScaledVector(perp, this.strafeDir * 2);
      }
    } else if (this.goal) {
      const dir = this.followPath(this.goal, dt);
      if (dir) {
        wish.copy(dir);
        sprint = Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) > 8;
      } else if (this.goalKind === 'roam' || this.goalKind === 'intel') {
        this.goalT = 0;
      }
    }
    if (wish.lengthSq() > 1) wish.normalize();

    // unsticking: walk toward open space for a moment instead of pushing into the obstacle
    if (this.unstickT > 0) {
      this.unstickT -= dt;
      wish.copy(this.unstickDir);
      sprint = false;
    } else if (wish.lengthSq() > 0.04) this.steer(wish);

    // stuck detection: barely moved for a second while trying to
    this.stuckT -= dt;
    if (this.stuckT <= 0) {
      const moved = Math.hypot(b.pos.x - this.lastPos.x, b.pos.z - this.lastPos.z);
      if (wish.lengthSq() > 0.2 && moved < 0.35) {
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
    b.wantCrouch = this.crouch;
    // long runs with nobody in sight: tactical sprint while the charge is high
    const run = sprint && !this.visible;
    if (!run) this.tac = false;
    else if (!this.tac && b.tacFuel >= PLAYER.tacTime * 0.9 && this.goal && Math.hypot(this.goal.x - b.pos.x, this.goal.z - b.pos.z) > 18) this.tac = true;
    b.updateMovement(dt, wish, run, jump, false, run && this.tac);
  }

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
    const b = this.bot, nav = this.game.world.nav;
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

  combat(dt) {
    const b = this.bot, g = this.game, d = this.diff;
    const w = b.weapon;
    const engaging = this.visible && this.target;
    const dist = engaging ? this.target.pos.distanceTo(b.pos) : 0;
    const adsTarget = engaging && dist > 12 ? 1 : 0;
    b.adsT += clamp(adsTarget - b.adsT, -dt / w.def.adsTime, dt / w.def.adsTime);

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
    }

    if (!engaging || this.reactT > 0) return;
    if (dist < 1.7 && b.meleeCd <= 0 && Math.random() < 0.5) { b.melee(); return; }
    // pick the right tool for the range
    const primary = b.weapons[0], pistol = b.weapons[1];
    const pr = primary.def.botRange;
    if (b.cur === 0 && pistol.mag + pistol.reserve > 0 && ((primary.id === 'shotgun' && dist > 16) || (primary.id === 'sniper' && dist < 6))) { b.switchTo(1); return; }
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
        this.semiT = d.semiDelay * rand(0.6, 1.4) + (w.id === 'sniper' ? 0.4 : 0);
      }
    }
  }
}
