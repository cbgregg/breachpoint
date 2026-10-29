#!/usr/bin/env node
// Bot lab: scripted scenarios that prove how the bots behave, run headless on the real game and the real map
// (the way tools/map_audit.mjs audits the maps). Each scenario boots a match with the renderer off, places a
// bot and a target on real open ground, steps the simulation itself at 60 Hz and checks ranges over what the
// bot did (never an exact trajectory: the dice are seeded, the knobs can be pinned per brain).
//
//   npx serve .                                    (or any static server on the repo; the default below)
//   node tools/botlab.mjs [scenario,...] [--url http://127.0.0.1:8124] [--diff normal] [--seed 1] [--list]
//
// Prints PASS / FAIL per check and exits non-zero on any failure or page error, so it can gate a commit.
// --diff runs every scenario's default boot on that difficulty (a scenario that names its own keeps it).
// Needs Playwright (npm i -D playwright, or a global install on NODE_PATH) with a Chromium.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');   // (require: an ES import ignores NODE_PATH)

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:8124').replace(/\/$/, '');
const defaults = { difficulty: arg('diff', 'normal'), seed: +arg('seed', 1) || 1 };
const picked = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))).join(',').split(',').filter(Boolean);

// ---------------------------------------------------------------------------------------------------------
// The lab, installed in the page as window.__lab: the helpers every scenario uses, then the scenarios.
// Runs inside the browser (Playwright ships the function's source), so it can only see the page's globals.
// ---------------------------------------------------------------------------------------------------------
async function lab(defaults) {
  const g = window.__game, THREE = await import('three'), { Box } = await import('/js/physics.js'), { DEFAULT_SETTINGS } = await import('/js/config.js');
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const yawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));          // Character.forward = (-sin yaw, 0, -cos yaw)
  const hs = c => Math.hypot(c.vel.x, c.vel.z);
  const los = (a, b) => !g.physics.blocked(a.eyePos(v1), b.chestPos(v2));
  // a seeded Math.random (mulberry32), so a scenario rolls the same dice every run
  const mulberry = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // page errors as the page sees them (the runner collects them too and fails the run on any)
  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message || e.error)));
  window.addEventListener('unhandledrejection', e => errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
  const walls = [];

  // a fresh match: seeded dice, the renderer's loop off (the lab steps the game), no countdown, the human parked
  // dead so the bots fight each other and the test's dummies only
  function boot({ map = 'tarsa', mode = 'tdm', teamSize = 2, difficulty = defaults.difficulty, seed = defaults.seed } = {}) {
    while (walls.length) unwall(walls[walls.length - 1]);   // (a scenario's leftover walls: the map stays loaded between boots)
    Math.random = mulberry(seed);
    g.renderer.renderer.setAnimationLoop(null);
    g.input.lastDevice = 'pad';                                   // startMatch skips input.lock() (pointer lock needs a click)
    g.recentDeaths = [];                                          // (an earlier boot's deaths would steer this match's spawns: the clock restarts)
    g.startMatch({ ...DEFAULT_SETTINGS, map, mode, teamSize, difficulty, timeLimit: 10, scoreLimit: 999, fillBots: true, name: 'Lab' });
    g.introHold = false; g.introLocal = true; g.countdownT = 0; g.intro = false;   // frozen === countdownT > 0
    const me = g.player;
    me.alive = false; me.respawnT = Infinity; me.deathT = g.time; me.killer = null;   // (the death cam reads deathT)
    for (const c of g.characters) c.spawnProtect = 0;
    if (g.gm) { g.gm.phase = 'live'; g.gm.liveT = g.time; }
    return g;
  }
  const brain = c => g.brains.get(c);
  // The bot under test stays where it is put unless the test gives it somewhere to go (br.setGoal(p, kind) and
  // a goalT): left to itself a bot picks a roam spot the moment nothing is in sight and turns away from the
  // target the test just placed in front of it. Fighting, hunting a lost target and the mode's objectives are
  // untouched; unpin() gives the bot its free roaming back.
  function pin(c) {
    const br = brain(c); if (br.__pinned) return;
    const cg = br.chooseGoal; br.__pinned = cg;
    br.chooseGoal = function (dt) {
      const before = this.goal; cg.call(this, dt);
      if (this.goal !== before && this.goal && ['roam', 'intel', 'health', 'ammo'].includes(this.goalKind)) { this.goal = null; this.goalKind = 'lab'; this.idleT = 0; }
    };
  }
  function unpin(c) { const br = brain(c); if (br.__pinned) { br.chooseGoal = br.__pinned; br.__pinned = null; } }
  // the bot under test: the n-th bot on a team (1 by default), given this gun, a pistol, a frag and two stuns, pinned
  function bot(weaponId = 'rifle', team = 1, n = 0) {
    const b = g.characters.filter(c => c.isBot && c.team === team)[n];
    if (!b) throw new Error('no bot ' + n + ' on team ' + team);
    b.setLoadout(`${weaponId}/pistol/frag.stun`); b.weapons.forEach(w => w.refill()); b.grenades = 1; b.tacticals = 2; b.switchT = 0;
    pin(b);
    return b;
  }
  // a human-shaped target: a bot with its brain switched off, moved only by the test (d.updateMovement(dt, wish, sprint, jump))
  function dummy(team = 0, n = 0) {
    const d = g.characters.filter(c => c.isBot && c.team === team)[n];
    if (!d) throw new Error('no bot ' + n + ' on team ' + team);
    brain(d).update = () => {}; d.setLoadout('rifle/pistol/frag.stun'); d.switchT = 0;
    return d;
  }
  // stand c at p facing yaw, fit and fresh (a bot's brain starts over)
  function place(c, p, yaw = 0) {
    c.pos.set(p.x, g.world.nav.levelY(p), p.z); c.vel.set(0, 0, 0); c.yaw = yaw; c.pitch = 0; c.onGround = true;
    c.alive = true; c.hidden = false; c.health = 100; c.switchT = 0; c.slideT = 0; c.adsT = 0; c.stunT = 0; c.mantle = null;
    c.crouchT = 0; c.wantCrouch = false; c.proneT = 0; c.wantProne = false; c.height = 1.8;
    if (c.isBot) brain(c).reset();
  }
  // out of the way for good
  function park(c) { brain(c).update = () => {}; c.pos.set(500, 0, 500); c.alive = false; c.respawnT = Infinity; }
  // every bot but these parked: a scenario about one bot and its target, with nobody wandering into it
  function alone(...keep) { for (const c of g.characters) if (c.isBot && !keep.includes(c)) park(c); }
  function eye(p) { return v3.set(p.x, g.world.nav.levelY(p) + 1.62, p.z); }
  // two open cells |ab| within 0.5 m of dist, a clear walk between them and eye-to-eye line of sight; cover: true
  // also needs brain.coverPoint (the bot's own cover search) to find something from a (so the cover tests run on
  // the map's real walls); clear: m of open ground all round each end (room to strafe without meeting a wall)
  function pair(dist, { cover = false, br = null, clear = 0 } = {}) {
    const nav = g.world.nav, cells = nav.openCells.slice().sort(() => Math.random() - 0.5).slice(0, 1500);
    const xs = cells.map(k => nav.cx(k % nav.cols)), zs = cells.map(k => nav.cz((k / nav.cols) | 0));
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const open = (x, z) => { for (let dx = -clear; dx <= clear; dx += 0.5) for (let dz = -clear; dz <= clear; dz += 0.5) if (dx * dx + dz * dz <= clear * clear && !nav.isOpenAt(x + dx, z + dz)) return false; return true; };
    for (let i = 0; i < cells.length; i++) {
      a.set(xs[i], 0, zs[i]);
      if (clear && !open(a.x, a.z)) continue;
      for (let j = 0; j < cells.length; j++) {
        if (Math.abs(Math.hypot(xs[j] - xs[i], zs[j] - zs[i]) - dist) > 0.5) continue;
        b.set(xs[j], 0, zs[j]);
        if (!nav.lineClear(a.x, a.z, b.x, b.z) || g.physics.blocked(eye(a).clone(), eye(b)) || (clear && !open(b.x, b.z))) continue;
        if (cover) { const save = br.bot.pos.clone(); br.bot.pos.copy(a); br.coverCache = null; const c = br.coverPoint(b, 6); br.bot.pos.copy(save); br.coverCache = null; if (!c) continue; }
        return [a.clone(), b.clone()];
      }
    }
    throw new Error('no pair at ' + dist);
  }
  const pointAlong = (a, b, m) => a.clone().lerp(b, m / a.distanceTo(b));
  // an open cell 1.5-5 m from p that can't be seen from eye height at `from`
  function hiddenNear(p, from) {
    const nav = g.world.nav, e = eye(from).clone();
    for (const k of nav.openCells) {
      const x = nav.cx(k % nav.cols), z = nav.cz((k / nav.cols) | 0), d = Math.hypot(x - p.x, z - p.z);
      if (d < 5 && d > 1.5 && g.physics.blocked(e, v2.set(x, 1.2, z))) return new THREE.Vector3(x, 0, z);
    }
    throw new Error('no hidden cell');
  }
  // step the game sec seconds (each(i) after every update), the way game.frame does minus the drawing
  function step(sec, each = null, dt = 1 / 60) {
    for (let i = 0, n = Math.round(sec / dt); i < n; i++) { g.update(dt); g.input.endFrame(); if (each) each(i); }
  }
  // step until cond() holds (at most maxSec s); returns the seconds it took, or null
  function until(cond, maxSec = 3, each = null, dt = 1 / 60) {
    const t0 = g.time;
    for (let i = 0, n = Math.round(maxSec / dt); i < n; i++) { g.update(dt); g.input.endFrame(); if (each) each(i); if (cond()) return g.time - t0; }
    return null;
  }
  // record every attempt to fire: c.__fires = [{ t, ok, adsT, sprinting, reloading, prone }] (a second call starts a
  // fresh list; the hook is only ever put on once)
  function spyFire(c) {
    c.__fires = [];
    if (c.__tryFire0) return;
    const of = c.__tryFire0 = c.tryFire.bind(c);
    c.tryFire = (o, d) => { const ok = of(o, d); c.__fires.push({ t: g.time, ok, adsT: c.adsT, sprinting: c.sprinting, reloading: c.weapon.reloading, prone: c.proneT, cur: c.cur }); return ok; };
  }
  // a solid wall (collision and nav), x0..x1 by z0..z1, h tall; unwall() takes it away again
  function wall(x0, z0, x1, z1, h = 2.2) {
    const nav = g.world.nav, b = g.physics.addBox(new Box(x0, 0, z0, x1, h, z1)), cells = [];
    for (let j = nav.cj(z0 - 0.45); j <= nav.cj(z1 + 0.45); j++) for (let i = nav.ci(x0 - 0.45); i <= nav.ci(x1 + 0.45); i++) {
      const k = j * nav.cols + i;
      if (!nav.blocked[k]) { nav.blocked[k] = 1; cells.push(k); }
    }
    nav.regions = null; nav.openCells = nav.openCells.filter(k => !nav.blocked[k]);
    const w = { b, cells }; walls.push(w);
    return w;
  }
  function unwall(w) {
    const nav = g.world.nav, i = g.physics.boxes.indexOf(w.b);
    if (i >= 0) g.physics.boxes.splice(i, 1);
    for (const k of w.cells) { nav.blocked[k] = 0; nav.openCells.push(k); }
    nav.regions = null;
    const j = walls.indexOf(w); if (j >= 0) walls.splice(j, 1);
  }
  // the checks: check() records and carries on, assert() records and stops the scenario, note() is information
  let results = [];
  const check = (c, m) => { results.push({ ok: !!c, msg: m }); return !!c; };
  const assert = (c, m) => { if (!check(c, m)) throw new Error('FAIL: ' + m); };
  const note = (m) => { results.push({ note: m }); };
  const yieldNow = () => new Promise(r => setTimeout(r, 0));

  const L = window.__lab = { g, THREE, Box, DEFAULT_SETTINGS, v1, v2, v3, clamp, angDiff, yawTo, hs, los, mulberry, errors, boot, brain, pin, unpin, bot, dummy, place, park, alone, eye, pair, pointAlong, hiddenNear, step, until, spyFire, wall, unwall, check, assert, note, yieldNow, defaults, scenarios: {} };
  // run one scenario: its checks, the error that stopped it (if one did) and how long it took
  L.run = async (name) => {
    results = []; const t0 = performance.now(); let error = null;
    try { const s = L.scenarios[name]; if (!s) throw new Error('no scenario ' + name); await s(); } catch (e) { error = String(e && e.message || e); }
    return { name, checks: results, error, ms: Math.round(performance.now() - t0) };
  };

  // ----- the scenarios (one per behaviour; a step of the plan adds its own) -----

  // the difficulty table: every knob in every row, ordered easy -> hard, nothing certain, and each brain's own copy
  L.scenarios.knobs = async () => {
    const { DIFFICULTY, BOT_DEFAULTS } = await import('/js/config.js');
    const rows = ['easy', 'normal', 'hard'], E = DIFFICULTY.easy, N = DIFFICULTY.normal, H = DIFFICULTY.hard;
    const keys = Object.keys(BOT_DEFAULTS);
    check(keys.length >= 18, `${keys.length} behaviour knobs in BOT_DEFAULTS`);
    check(keys.every(k => rows.every(r => k in DIFFICULTY[r])), 'every knob is in every difficulty row');
    for (const k of ['coverUse', 'peek', 'strafe', 'preAim', 'slide', 'dropShot', 'cook', 'lkp', 'chase', 'rotateKill', 'holdMax']) check(E[k] <= N[k] && N[k] <= H[k], `${k} non-decreasing easy -> hard (${E[k]}, ${N[k]}, ${H[k]})`);
    for (const k of ['adsNear', 'settle', 'flinch', 'latency', 'nadeDodge', 'sprintOut']) check(E[k] >= N[k] && N[k] >= H[k], `${k} non-increasing easy -> hard (${E[k]}, ${N[k]}, ${H[k]})`);
    check(E.postKill[0] > H.postKill[1], 'easy pauses longer after a kill than hard');
    const probs = ['coverUse', 'peek', 'strafe', 'preAim', 'slide', 'dropShot', 'cook', 'chase', 'rotateKill', 'headChance'];
    check(probs.every(k => H[k] <= 0.95), 'no probability above 0.95 on hard (nobody does it every time)');
    check(rows.every(r => probs.every(k => DIFFICULTY[r][k] >= 0 && DIFFICULTY[r][k] <= 1)), 'probabilities between 0 and 1 on every row');
    boot({ difficulty: 'bogus' });
    check(brain(bot()).diff.coverUse === BOT_DEFAULTS.coverUse && brain(bot()).diff.reaction === N.reaction, 'an unknown difficulty falls back to the defaults (Normal)');
    boot({ difficulty: 'hard' });
    check(brain(bot()).diff.coverUse === H.coverUse && brain(bot()).diff.aimError === H.aimError, 'a brain carries its row over the defaults');
    boot();
    const b1 = brain(bot()); b1.diff.coverUse = 1;
    check(DIFFICULTY.normal.coverUse === 0.5 && BOT_DEFAULTS.coverUse === 0.5 && brain(bot('rifle', 1, 1)).diff.coverUse === 0.5, 'diff is a per-brain copy: pinning one bot leaves the table and the others alone');
    // the fields the later steps read all start from reset()
    const fields = ['threat', 'cornering', 'cornerWp', 'cornerAim', 'sprintOutT', 'wasSprinting', 'fightT', 'strafeStop', 'strafeOn', 'stillT', 'dropT', 'dropRolled', 'lowCover', 'hurtT', 'dmgT', 'dmgRecent', 'decideT', 'retreatT', 'coverHold', 'coverGoal', 'atCover', 'coverCache', 'enemiesVisible', 'lostT', 'lostDist', 'watchFor', 'huntFor', 'chaseUntil', 'hitsOn', 'hitsDealt', 'hitsT', 'killT', 'killsHere', 'switchT', 'aimInit', 'flinchT', 'lastStun', 'peekPhase', 'peekT', 'nadeT', 'nadeSeen', 'nadeReactT', 'fleeing', 'slideCd', 'edgeBurst', 'lane', 'holdT', 'tradeT', 'state'];
    b1.reset();
    const missing = fields.filter(f => !(f in b1));
    check(missing.length === 0, 'reset() initialises every brain field' + (missing.length ? ' (missing ' + missing.join(', ') + ')' : ''));
    check(b1.state === 'idle' && b1.threat === 0 && b1.hurtT === -99 && b1.dmgDir.isVector3 && b1.aimSmooth.isVector3 && b1.flinchV.isVector3 && b1.huntGoal.isVector3, 'reset() values and the brain\'s scratch vectors');
    // reactT counts down with nobody in sight (the pause after a kill, step 4, relies on it)
    const br2 = brain(bot('rifle', 1, 1));
    br2.visible = false; br2.target = null; br2.perceiveT = 1; br2.reactT = 0.5; br2.update(1 / 60);   // (no perceive tick: nothing to re-arm it)
    check(br2.reactT < 0.5 && br2.reactT > 0.4, 'reactT ticks down with nobody visible');
  };

  // the harness itself: a 6v6 boots and runs with no page errors and all eleven bots alive
  L.scenarios.smoke = async () => {
    boot({ teamSize: 6 });
    const n0 = errors.length, t0 = performance.now();
    step(5);
    const ms = (performance.now() - t0) / 300;
    check(errors.length === n0, 'no page errors in 5 s of a 6v6');
    check(g.characters.filter(c => c.isBot && c.alive).length === 11, `11 live bots (${g.characters.filter(c => c.isBot && c.alive).length})`);
    check(!g.player.alive && g.state === 'playing', 'the human is parked dead and the match is on');
    check(g.characters.filter(c => c.isBot).every(c => brain(c) && brain(c).diff.coverUse !== undefined), 'every bot has a brain with its knobs');
    note(`${ms.toFixed(2)} ms per update with 11 bots (rendering off)`);
  };

  // the helpers the scenarios are built from, on the real map: a pair of cells with line of sight, a dummy that
  // stays put while the bot under test spots and shoots it, a hidden cell, and a wall that comes and goes
  L.scenarios.harness = async () => {
    boot();
    const nav = g.world.nav, boxes0 = g.physics.boxes.length, cells0 = nav.openCells.length;
    const b = bot('rifle'), br = brain(b), t = dummy();
    const [A, B] = pair(10);
    check(Math.abs(A.distanceTo(B) - 10) <= 0.5 && nav.lineClear(A.x, A.z, B.x, B.z), 'pair(10): two open cells 10 m apart with a clear walk between');
    place(b, A, yawTo(A, B)); place(t, B, yawTo(B, A)); t.health = 1e4;
    check(los(b, t) && los(t, b), 'pair(10): line of sight both ways once placed');
    check(Math.abs(angDiff(b.yaw, yawTo(b.pos, t.pos))) < 0.01 && b.forward(v1).dot(v2.subVectors(t.pos, b.pos).normalize()) > 0.99, 'yawTo: the bot faces the dummy');
    spyFire(b);
    const p0 = t.pos.clone();
    let sawAt = null;
    step(3, () => { if (sawAt === null && br.visible && br.target === t) sawAt = g.time; });
    check(t.pos.distanceTo(p0) < 0.01, 'dummy: stays where it is put (brain off)');
    check(sawAt !== null && b.pos.distanceTo(A) < 8, `bot: pinned, spots the dummy at 10 m (after ${sawAt === null ? '-' : sawAt.toFixed(2)} s) and fights from near where it stands (${b.pos.distanceTo(A).toFixed(1)} m off)`);
    const ok = b.__fires.filter(f => f.ok).length;
    check(ok > 0 && t.health < 1e4, `spyFire: ${ok} shots recorded, ${Math.round(1e4 - t.health)} damage done`);
    const h = hiddenNear(B, A);
    check(g.physics.blocked(eye(A).clone(), v2.set(h.x, 1.2, h.z)) && h.distanceTo(B) < 5 && nav.isOpenAt(h.x, h.z), 'hiddenNear: an open cell by the target, out of sight from the bot');
    // a 3 x 3 m block across the middle of the lane: no sight, no walk; then taken away again
    const mid = pointAlong(A, B, 5), seen = () => !g.physics.blocked(eye(A).clone(), v2.set(B.x, 1.2, B.z));
    const w = wall(mid.x - 1.5, mid.z - 1.5, mid.x + 1.5, mid.z + 1.5);
    check(!seen() && !nav.lineClear(A.x, A.z, B.x, B.z) && !nav.isOpenAt(mid.x, mid.z) && w.cells.length > 0, 'wall: blocks the sight and the walk');
    unwall(w);
    check(seen() && nav.lineClear(A.x, A.z, B.x, B.z) && nav.isOpenAt(mid.x, mid.z) && g.physics.boxes.length === boxes0 && nav.openCells.length === cells0, 'unwall: sight, walk, boxes and cells back as they were');
    // a goal the test sets is kept: the pinned bot goes where it is sent, and stops there
    const far = nav.randomOpenPoint(q => q.distanceTo(b.pos) > 20 && q.distanceTo(b.pos) < 40);
    park(t); br.target = null; br.visible = false; br.spot.clear(); br.setGoal(far, 'roam'); br.goalT = 30;
    let moved = 0; step(3, () => { moved = Math.max(moved, hs(b)); });
    check(moved > 4 && br.goal && br.goal.distanceTo(far) < 1, `pin: keeps the goal a test sets (top speed ${moved.toFixed(1)} m/s toward it)`);
    wall(mid.x - 1.5, mid.z - 1.5, mid.x + 1.5, mid.z + 1.5);
    boot();
    check(g.physics.boxes.length === boxes0 && g.world.nav.openCells.length === cells0 && walls.length === 0, 'boot: clears a scenario\'s leftover walls');
    const b2 = bot('rifle'); park(b2); step(0.5);
    check(!b2.alive && b2.pos.x === 500 && b2.respawnT === Infinity, 'park: out of the match for good');
  };

  // ADS discipline (step 2): sights by weapon and range, gated like the player's; the sprint-out delay before
  // the first shot; no sprinting through a reload; a reload dropped or swapped out of on contact up close
  L.scenarios.ads = async () => {
    boot();
    let b = bot('rifle'), br = brain(b);
    const t = dummy();
    alone(b, t);
    // the gunplay knobs pinned to Normal's whatever --diff says: the hip-fire ranges below are Normal's (the knob
    // itself is checked at the end), and easy's slow, sloppy first shot would land after the bot has given ground
    // out of hip range (that's the aim model's business, not the sights')
    br.diff.adsNear = 1; br.diff.reaction = 0.42; br.diff.aimError = 0.065;
    const [A, B] = pair(16, { clear: 3 });
    // a fresh fight: the bot (with this gun) at A facing a dummy `dist` m down the line, stepped `sec` s;
    // returns the shots that went off
    const fight = (weapon, dist, sec, setup = null) => {
      b = bot(weapon); br = brain(b); b.grenades = 0; b.tacticals = 0;
      place(b, A, yawTo(A, B)); place(t, pointAlong(A, B, dist), yawTo(B, A)); t.health = 1e6;
      if (setup) setup();
      spyFire(b); step(sec);
      return b.__fires.filter(f => f.ok);
    };
    const first = (fires) => fires[0];
    let f = fight('rifle', 10, 2);
    check(f.length > 0 && first(f).adsT >= 0.95, `rifle at 10 m: the first round goes down the sights (adsT ${f.length ? first(f).adsT.toFixed(2) : '-'}, ${f.length} shots)`);
    check(f.every(x => !x.sprinting), 'rifle at 10 m: never a shot while sprinting');
    f = fight('rifle', 3, 1.5);
    check(f.length > 0 && first(f).adsT < 0.2, `rifle at 3 m: hip-fire, and it still fires (adsT ${f.length ? first(f).adsT.toFixed(2) : '-'} at the first shot, ${f.length} shots)`);
    f = fight('shotgun', 10, 2);
    check(b.adsT === 0 && f.length > 0 && f.every(x => x.adsT === 0), `shotgun at 10 m: never aims down the sights (adsT ${b.adsT.toFixed(2)}, ${f.length} shots)`);
    f = fight('sniper', 8, 2.5);   // (a bolt gun on easy takes its time over the first shot)
    check(b.adsT >= 0.95 && f.length > 0 && first(f).adsT >= 0.95, `sniper at 8 m: scoped in even up close (adsT ${b.adsT.toFixed(2)}, first shot at ${f.length ? first(f).adsT.toFixed(2) : '-'})`);
    f = fight('smg', 5, 1.5);
    check(f.length > 0 && first(f).adsT < 0.2, `smg at 5 m: hip-fire (adsT ${f.length ? first(f).adsT.toFixed(2) : '-'})`);
    f = fight('smg', 12, 2);
    check(f.length > 0 && first(f).adsT >= 0.95, `smg at 12 m: sights up (adsT ${f.length ? first(f).adsT.toFixed(2) : '-'})`);
    // the gates: a reload drops the sights at once (at 15 m the reload is kept; up close it would be dropped instead)
    f = fight('rifle', 15, 1.2);
    check(b.adsT >= 0.95, `rifle at 15 m: aimed in before the reload test (adsT ${b.adsT.toFixed(2)})`);
    b.weapon.mag = 10; b.reload(); step(0.4);
    check(b.weapon.reloading && b.adsT < 0.1, `a reload drops the sights within 0.4 s (adsT ${b.adsT.toFixed(2)}, reloading ${b.weapon.reloading})`);
    // the sprint-out: sprinting down a lane, a dummy appears 9 m ahead; the first shot waits for the gun to come up
    b = bot('rifle'); br = brain(b); b.grenades = 0; b.tacticals = 0;
    br.diff.reaction = 0.001;
    const [C, D] = pair(30);
    place(b, C, yawTo(C, D)); park(t);
    br.setGoal(D, 'roam'); br.goalT = 30; br.route = null;
    step(1.5);
    check(b.sprinting && hs(b) > 6, `sprints down the lane with nobody in sight (${hs(b).toFixed(1)} m/s)`);
    place(t, pointAlong(b.pos, D, 9), yawTo(D, C)); t.health = 1e6;
    spyFire(b);
    let stopT = null, sawT = null;
    step(2, () => { if (sawT === null && br.visible) sawT = g.time; if (stopT === null && !b.sprinting) stopT = g.time; });
    f = b.__fires.filter(x => x.ok);
    const gap = f.length && stopT !== null ? f[0].t - stopT : null;
    check(sawT !== null && stopT !== null && sawT <= stopT + 1e-6, `the sprint ends the frame the dummy is seen (seen ${sawT === null ? '-' : sawT.toFixed(2)}, stopped ${stopT === null ? '-' : stopT.toFixed(2)})`);
    check(gap !== null && gap >= 0.08 && gap < 0.45, `sprint-out: the first shot ${gap === null ? 'never came' : gap.toFixed(3) + ' s after the sprint ended'} (0.08-0.45 s: the player's own sprint-out is 80-130 ms)`);
    // (the first round or two go off while the sights are still coming up: the ADS ramp is longer than the sprint-out)
    check(f.length > 1 && f.every(x => !x.sprinting) && f[f.length - 1].adsT >= 0.95, `every shot at 9 m out of the sprint, and the sights up by the last (${f.length} shots, adsT ${f.map(x => x.adsT.toFixed(2)).join(' ')})`);
    // no sprint-reloads: a reload on the run stops the run until it's done; a near-full top-up is dropped for the run instead
    const lane = () => { place(b, C, yawTo(C, D)); park(t); b.weapons.forEach(w => w.refill()); br.setGoal(D, 'roam'); br.goalT = 30; br.route = null; step(1.5); return b.sprinting; };
    check(lane(), 'sprinting again for the reload test');
    b.weapon.mag = 5; b.reload(); step(0.2);
    check(b.weapon.reloading && !b.sprinting, `a reload stops the sprint (reloading ${b.weapon.reloading}, sprinting ${b.sprinting})`);
    let walked = true; step(1.9, () => { if (b.weapon.reloading && b.sprinting) walked = false; });
    check(walked && !b.weapon.reloading && b.weapon.mag === 30 && b.sprinting, `the reload finishes at a walk, then the sprint resumes (mag ${b.weapon.mag}, sprinting ${b.sprinting}, walked ${walked})`);
    check(lane(), 'sprinting again for the top-up test');
    b.weapon.mag = 25; b.reload(); step(0.2);
    check(!b.weapon.reloading && b.sprinting && b.weapon.mag === 25, `a near-full top-up is dropped for the run (reloading ${b.weapon.reloading}, sprinting ${b.sprinting})`);
    // contact at 6 m in the middle of a reload: two rounds left -> the loaded pistol; ten left -> drop the reload and fire
    br.diff.reaction = 0.05;
    f = fight('rifle', 6, 1, () => { b.weapons[1].mag = 12; b.weapon.mag = 2; b.reload(); });
    check(b.cur === 1 && !b.weapons[0].reloading, `mid-reload contact at 6 m with 2 rounds: swaps to the pistol (cur ${b.cur}, primary reloading ${b.weapons[0].reloading})`);
    // (a hard bot may empty the ten and swap to the pistol inside the second: the primary is never reloaded in their face)
    f = fight('rifle', 6, 1, () => { b.weapon.mag = 10; b.reload(); });
    check(!b.weapons[0].reloading && f.length > 0 && f[0].cur === 0 && f.every(x => !x.reloading), `mid-reload contact at 6 m with 10 rounds: drops the reload and fires within 1 s (${f.length} shots, cur ${b.cur})`);
    // a reload with 0.3 s left is finished, not dropped
    f = fight('rifle', 6, 1, () => { b.weapon.mag = 10; b.reload(); b.weapon.reloadT = 0.25; });
    check(f.length > 0 && f[0].cur === 0 && b.weapons[0].mag + f.filter(x => x.cur === 0).length === 30, `a reload about to finish is finished, then the fight goes on (mag ${b.weapons[0].mag} + ${f.length} shots)`);
    // the adsNear knob: easy (1.3) hip-fires an SMG at 8 m where normal (1) has the sights up
    br.diff.reaction = 0.3; br.diff.adsNear = 1.3;
    f = fight('smg', 8, 1.5);
    check(f.length > 0 && first(f).adsT < 0.2, `adsNear 1.3 (easy): smg at 8 m hip-fires (adsT ${f.length ? first(f).adsT.toFixed(2) : '-'})`);
    br.diff.adsNear = 1;
    f = fight('smg', 8, 1.5);
    check(f.length > 0 && first(f).adsT >= 0.95, `adsNear 1 (normal): smg at 8 m sights up (adsT ${f.length ? first(f).adsT.toFixed(2) : '-'})`);
  };

  // the strafe (step 3): jittered A/D legs, a reversal on a hit, never still past half a second in the open,
  // no hops or prone in the open, crouch only behind chest-high cover, the drop-shot on hard
  L.scenarios.strafe = async () => {
    boot();
    let b = bot('rifle'), br = brain(b);
    const t = dummy();
    alone(b, t);
    b.grenades = 0; b.tacticals = 0;
    br.diff.strafe = 1;
    const [A, B] = pair(15, { clear: 4 });
    const pl = Math.hypot(B.z - A.z, B.x - A.x), perp = { x: -(B.z - A.z) / pl, z: (B.x - A.x) / pl };
    // a 15 m fight for `sec` s, sampled every frame once the bot has seen the dummy; hitAt: a 10-damage hit at that time
    const run = (sec, hitAt = null) => {
      place(b, A, yawTo(A, B)); place(t, B, yawTo(B, A));
      const s = { frames: 0, still: 0, longestStill: 0, airborne: 0, maxProne: 0, maxCrouch: 0, speed: 0, flips: [], hitT: null, flipT: null, seen: null, far: 0 };
      let sign = 0, dir0 = null;
      const t0 = g.time;
      step(sec, (i) => {
        t.health = 1e6;
        const now = g.time;
        if (hitAt !== null && s.hitT === null && now - t0 >= hitAt) { s.hitT = now; dir0 = br.strafeDir; b.takeDamage(10, t, 'rifle', false, t.pos); return; }
        if (s.hitT !== null && s.flipT === null && br.strafeDir !== dir0) s.flipT = now;
        if (!br.visible && s.seen === null) return;
        if (s.seen === null) s.seen = now;
        s.frames++;
        const v = hs(b);
        s.speed += v;
        if (v < 0.5) { s.still++; s.longestStill = Math.max(s.longestStill, s.still); } else s.still = 0;
        if (!b.onGround && b.vel.y > 1) s.airborne++;
        s.maxProne = Math.max(s.maxProne, b.proneT); s.maxCrouch = Math.max(s.maxCrouch, b.crouchT);
        s.far = Math.max(s.far, b.pos.distanceTo(A));
        const lat = b.vel.x * perp.x + b.vel.z * perp.z;
        if (Math.abs(lat) > 0.3) { const sg = Math.sign(lat); if (sign !== 0 && sg !== sign) s.flips.push(now); sign = sg; }
      });
      s.speed /= Math.max(1, s.frames);
      return s;
    };
    let s = run(6, 3);
    check(s.seen !== null && s.frames > 300, `sees the dummy at 15 m and fights for ${(s.frames / 60).toFixed(1)} s`);
    check(s.longestStill / 60 <= 0.5, `never still past half a second in the open (longest ${(s.longestStill / 60).toFixed(2)} s)`);
    check(s.airborne === 0, `no hopping in a gunfight (${s.airborne} airborne frames)`);
    check(s.maxProne === 0, `no going prone in the open (proneT ${s.maxProne.toFixed(2)})`);
    check(s.maxCrouch < 0.3, `no crouching with nothing to crouch behind (crouchT ${s.maxCrouch.toFixed(2)})`);
    const iv = s.flips.slice(1).map((x, i) => x - s.flips[i]);
    const mean = iv.reduce((a, x) => a + x, 0) / Math.max(1, iv.length), sd = Math.sqrt(iv.reduce((a, x) => a + (x - mean) * (x - mean), 0) / Math.max(1, iv.length));
    check(iv.length >= 5 && iv.every(x => x >= 0.12 && x <= 1.0), `strafe legs of 0.12-1.0 s (${iv.length} reversals: ${iv.map(x => x.toFixed(2)).join(' ')})`);
    check(sd > 0.05, `jittered, not a metronome (sd ${sd.toFixed(3)} s)`);
    check(s.hitT !== null && s.flipT !== null && s.flipT - s.hitT <= 0.15, `a hit reverses the strafe within 0.15 s (${s.flipT === null ? 'never' : (s.flipT - s.hitT).toFixed(3) + ' s'})`);
    check(s.speed >= 1.8 && s.speed <= 3.2, `mean speed ${s.speed.toFixed(2)} m/s (1.8-3.2: an aimed-in strafe)`);
    check(s.far < 6, `fights from where it stands (${s.far.toFixed(1)} m from A at most)`);
    // the strafe dice at 0: stood-still legs, but never past half a second
    br.diff.strafe = 0;
    s = run(6);
    check(s.seen !== null && s.longestStill / 60 <= 0.5, `strafe = 0: still never past half a second (longest ${(s.longestStill / 60).toFixed(2)} s, mean speed ${s.speed.toFixed(2)})`);
    check(s.airborne === 0 && s.maxProne === 0 && s.maxCrouch < 0.3, 'strafe = 0: still no hops, prone or crouch');
    br.diff.strafe = 1;
    // chest-high cover (a 0.7 m square, 1 m tall) 0.9 m in front at 12 m: crouch behind it and stop strafing
    const C = pointAlong(A, B, 0.9);
    const box = g.physics.addBox(new Box(C.x - 0.35, 0, C.z - 0.35, C.x + 0.35, 1.0, C.z + 0.35));
    place(b, A, yawTo(A, B)); place(t, pointAlong(A, B, 12), yawTo(B, A)); t.health = 1e6;
    let crouchAt = null, lateral = 0, seenAt = null;
    step(2, () => { t.health = 1e6; if (seenAt === null && br.visible) seenAt = g.time; if (crouchAt === null && b.crouchT > 0.5) crouchAt = g.time; if (g.time > seenAt + 1) lateral = Math.max(lateral, Math.abs(b.vel.x * perp.x + b.vel.z * perp.z)); });
    check(seenAt !== null && crouchAt !== null && crouchAt - seenAt <= 1, `chest-high cover in front: crouches behind it within a second (${crouchAt === null ? 'never' : (crouchAt - seenAt).toFixed(2) + ' s'}, lowCover ${br.lowCover})`);
    check(lateral < 0.5 && b.pos.distanceTo(A) < 0.5, `and holds there instead of strafing out of it (lateral ${lateral.toFixed(2)} m/s)`);
    g.physics.boxes.splice(g.physics.boxes.indexOf(box), 1);   // (the index rebuilds on the count)
    place(b, A, yawTo(A, B)); place(t, pointAlong(A, B, 12), yawTo(B, A)); step(1, () => { t.health = 1e6; });
    check(!br.lowCover && b.crouchT < 0.3, 'the box gone, the crouch goes with it');
    // the drop-shot (hard, dice pinned): shot first at 8 m, it drops prone, fires from there and is up again by 2.3 s
    boot({ difficulty: 'hard' });
    b = bot('rifle'); br = brain(b); const t2 = dummy(); alone(b, t2);
    b.grenades = 0; b.tacticals = 0; br.diff.dropShot = 1;
    const [E, F] = pair(8, { clear: 3 });
    place(b, E, yawTo(E, F)); place(t2, F, yawTo(F, E)); t2.health = 1e6; spyFire(b);
    let seen2 = until(() => br.visible, 2, () => { t2.health = 1e6; });
    check(seen2 !== null && b.__fires.length === 0, `drop-shot: the dummy is seen (${seen2 === null ? '-' : seen2.toFixed(2)} s) and the bot has not fired yet`);
    const hitT = g.time; b.takeDamage(25, t2, 'rifle', false, t2.pos);
    let proneAt = null, maxP = 0;
    step(0.6, () => { t2.health = 1e6; if (proneAt === null && b.proneT > 0.5) proneAt = g.time; });
    check(proneAt !== null && proneAt - hitT <= 0.6, `shot first at 8 m: drops within 0.6 s (${proneAt === null ? 'never' : (proneAt - hitT).toFixed(2) + ' s'})`);
    step(1.7, () => { t2.health = 1e6; maxP = Math.max(maxP, b.proneT); });
    check(b.__fires.some(x => x.ok && x.prone > 0.5), `fires from the ground (${b.__fires.filter(x => x.ok && x.prone > 0.5).length} prone shots)`);
    check(b.proneT < 0.1, `up again by 2.3 s (proneT ${b.proneT.toFixed(2)})`);
    // the dice at 0 (normal's default is 5%): no drop
    br.diff.dropShot = 0;
    place(b, E, yawTo(E, F)); place(t2, F, yawTo(F, E)); t2.health = 1e6;
    seen2 = until(() => br.visible, 2, () => { t2.health = 1e6; });
    b.takeDamage(25, t2, 'rifle', false, t2.pos); maxP = 0;
    step(1, () => { t2.health = 1e6; maxP = Math.max(maxP, b.proneT); });
    check(maxP === 0, `dropShot = 0: stays on its feet (proneT ${maxP.toFixed(2)})`);
  };

  // two minutes of a 6v6 on Tarsa with the renderer off: no page errors, and the match stays a match
  L.scenarios.match = async () => {
    boot({ teamSize: 6 });
    const n0 = errors.length, t0 = performance.now();
    let kills = 0, shots = 0, maxBots = 0;
    const os = g.shoot.bind(g); g.shoot = (...a) => { shots++; return os(...a); };
    for (let s = 0; s < 120; s++) { step(1); await yieldNow(); maxBots = Math.max(maxBots, g.characters.filter(c => c.isBot).length); }   // (a yield a second: the game's own timers run too)
    g.shoot = os;
    const ms = (performance.now() - t0) / 7200;
    for (const c of g.characters) if (c.isBot) kills += c.kills || 0;
    check(errors.length === n0, 'no page errors in 2 minutes of a 6v6');
    check(g.state === 'playing' && g.time > 119, `still playing at ${g.time.toFixed(0)} s`);
    check(g.characters.filter(c => c.isBot).length === 11 && maxBots === 11, 'eleven bots throughout');
    check(g.characters.filter(c => c.isBot && (c.alive || c.respawnT < Infinity)).length === 11, 'every bot alive or on its way back');
    check(kills > 10, `the bots fight: ${kills} kills, ${shots} shots, score ${g.scores.join('-')}`);
    note(`${ms.toFixed(2)} ms per update with 11 bots (rendering off)`);
  };

  return Object.keys(L.scenarios);
}

// ---------------------------------------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message + ' ' + String(e.stack || '').split('\n')[1]));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
// offline: nothing but the test server (no relay, accounts or message of the day)
await page.route(/^https?:\/\//, r => (r.request().url().startsWith(url + '/') ? r.continue() : r.abort()));
// low graphics: the lab reads the simulation, not pixels
await page.addInitScript(() => { try { localStorage.setItem('breachpoint.settings.v2', JSON.stringify({ quality: 'low', gfxPath: 'fast', gfxRes: 50 })); } catch (_) { /* private mode */ } });
await page.goto(url + '/index.html');
await page.waitForFunction('window.__game && window.__game.world && !window.__game.warming', null, { timeout: 300000 });
const all = await page.evaluate(lab, defaults);
if (argv.includes('--list')) { console.log(all.join('\n')); await browser.close(); process.exit(0); }
const names = picked.length && !picked.includes('all') ? picked : all;

let failed = 0;
for (const name of names) {
  const before = errors.length;
  const r = await page.evaluate((n) => window.__lab.run(n), name);
  const pageErrs = errors.slice(before);
  console.log(`${name} (${r.ms} ms)`);
  for (const c of r.checks) { if (c.note) console.log(`  note ${c.note}`); else { console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.msg}`); if (!c.ok) failed++; } }
  if (r.error) { console.log(`  ERROR ${r.error}`); failed++; }
  for (const e of pageErrs) { console.log(`  PAGE ERROR ${e}`); failed++; }
}
console.log(failed ? `${failed} failure(s)` : 'all passed');
await browser.close();
process.exit(failed ? 1 : 0);
