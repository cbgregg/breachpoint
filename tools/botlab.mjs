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
    if (c.isBot) { brain(c).reset(); calm(); }
  }
  // the ground is quiet: no team intel, no recent deaths (a bot walks in aimed, sights up, for seconds after either)
  function calm() { for (const it of g.intel) it.time = -99; g.recentDeaths.length = 0; }
  // out of the way for good
  function park(c) { brain(c).update = () => {}; c.pos.set(500, 0, 500); c.alive = false; c.respawnT = Infinity; }
  // every bot but these parked: a scenario about one bot and its target, with nobody wandering into it
  function alone(...keep) { for (const c of g.characters) if (c.isBot && !keep.includes(c)) park(c); }
  function eye(p) { return v3.set(p.x, g.world.nav.levelY(p) + 1.62, p.z); }
  // two open cells |ab| within 0.5 m of dist, a clear walk between them and eye-to-eye line of sight; cover: true
  // also needs brain.coverPoint (the bot's own cover search) to find something from a (so the cover tests run on
  // the map's real walls); clear: m of open ground all round each end (room to strafe without meeting a wall)
  function pair(dist, { cover = false, br = null, clear = 0 } = {}) {
    const nav = g.world.nav, all = nav.openCells.slice().sort(() => Math.random() - 0.5);
    const openAt = (x, z) => { for (let dx = -clear; dx <= clear; dx += 0.5) for (let dz = -clear; dz <= clear; dz += 0.5) if (dx * dx + dz * dz <= clear * clear && !nav.isOpenAt(x + dx, z + dz)) return false; return true; };
    const cells = clear ? all.filter(k => openAt(nav.cx(k % nav.cols), nav.cz((k / nav.cols) | 0))) : all.slice(0, 3500);   // (the clearance of each cell, once)
    const xs = cells.map(k => nav.cx(k % nav.cols)), zs = cells.map(k => nav.cz((k / nav.cols) | 0));
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < cells.length; i++) {
      a.set(xs[i], 0, zs[i]);
      for (let j = 0; j < cells.length; j++) {
        if (Math.abs(Math.hypot(xs[j] - xs[i], zs[j] - zs[i]) - dist) > 0.5) continue;
        b.set(xs[j], 0, zs[j]);
        if (!nav.lineClear(a.x, a.z, b.x, b.z) || g.physics.blocked(eye(a).clone(), eye(b))) continue;
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
    park(t); br.target = null; br.visible = false; br.spot.clear(); br.lastKnownT = br.hurtT = -99; calm(); br.setGoal(far, 'roam'); br.goalT = 30;
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
        t.health = 1e6; b.weapon.mag = b.weapon.def.mag;   // (a bottomless mag: the reload and its trip to cover are another test's)
        const now = g.time;
        if (hitAt !== null && s.hitT === null && now - t0 >= hitAt) { s.hitT = now; dir0 = br.strafeDir; b.takeDamage(10, t, 'rifle', false, t.pos); return; }
        if (s.hitT !== null && s.flipT === null && br.strafeDir !== dir0) s.flipT = now;
        if (!br.visible && s.seen === null) return;
        if (s.seen === null) s.seen = now;
        s.frames++;
        const v = hs(b);
        s.speed += v;
        if (v < 0.5) { s.still++; if (s.still > s.longestStill) { s.longestStill = s.still; s.stillAt = now - t0; s.stillWhy = `${br.goalKind} on ${br.strafeOn} T ${br.strafeT.toFixed(2)} stop ${br.strafeStop.toFixed(2)} stillT ${br.stillT.toFixed(2)} un ${br.unstickT.toFixed(2)} wish ${br.wish.length().toFixed(2)} ads ${b.adsT.toFixed(2)} react ${br.reactT.toFixed(2)} slide ${b.slideT.toFixed(2)} stun ${b.stunT.toFixed(2)} mantle ${!!b.mantle} ground ${b.onGround} low ${br.lowCover} drop ${br.dropT.toFixed(2)}`; } } else s.still = 0;
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
    if (!check(s.longestStill / 60 <= 0.5, `never still past half a second in the open (longest ${(s.longestStill / 60).toFixed(2)} s)`)) note(`longest still at ${s.stillAt.toFixed(2)} s: ${s.stillWhy}`);
    check(s.airborne === 0, `no hopping in a gunfight (${s.airborne} airborne frames)`);
    check(s.maxProne === 0, `no going prone in the open (proneT ${s.maxProne.toFixed(2)})`);
    check(s.maxCrouch < 0.3, `no crouching with nothing to crouch behind (crouchT ${s.maxCrouch.toFixed(2)})`);
    const iv = s.flips.slice(1).map((x, i) => x - s.flips[i]);
    const mean = iv.reduce((a, x) => a + x, 0) / Math.max(1, iv.length), sd = Math.sqrt(iv.reduce((a, x) => a + (x - mean) * (x - mean), 0) / Math.max(1, iv.length));
    // (a leg that runs on because the bot is already on its way back to the fight spot can stretch a little past a second)
    // (and a wall or a hit can turn a leg round early once)
    check(iv.length >= 5 && iv.every(x => x <= 1.5) && iv.filter(x => x < 0.12).length <= 1, `strafe legs of 0.12-1.5 s (${iv.length} reversals: ${iv.map(x => x.toFixed(2)).join(' ')})`);
    check(sd > 0.05, `jittered, not a metronome (sd ${sd.toFixed(3)} s)`);
    check(s.hitT !== null && s.flipT !== null && s.flipT - s.hitT <= 0.15, `a hit reverses the strafe within 0.15 s (${s.flipT === null ? 'never' : (s.flipT - s.hitT).toFixed(3) + ' s'})`);
    check(s.speed >= 1.8 && s.speed <= 3.2, `mean speed ${s.speed.toFixed(2)} m/s (1.8-3.2: an aimed-in strafe)`);
    check(s.far < 6, `fights from where it stands (${s.far.toFixed(1)} m from A at most)`);
    // the strafe dice at 0: stood-still legs, but never past half a second
    br.diff.strafe = 0;
    s = run(6);
    if (!check(s.seen !== null && s.longestStill / 60 <= 0.5, `strafe = 0: still never past half a second (longest ${(s.longestStill / 60).toFixed(2)} s, mean speed ${s.speed.toFixed(2)})`)) note(`longest still at ${s.stillAt.toFixed(2)} s: ${s.stillWhy}`);
    check(s.airborne === 0 && s.maxProne === 0 && s.maxCrouch < 0.3, 'strafe = 0: still no hops, prone or crouch');
    br.diff.strafe = 1;
    // chest-high cover (a 0.7 m square, 1 m tall) 0.9 m in front at 12 m: crouch behind it and stop strafing
    const C = pointAlong(A, B, 0.9);
    const box = g.physics.addBox(new Box(C.x - 0.35, 0, C.z - 0.35, C.x + 0.35, 1.0, C.z + 0.35));
    place(b, A, yawTo(A, B)); place(t, pointAlong(A, B, 12), yawTo(B, A)); t.health = 1e6;
    let crouchAt = null, lateral = 0, seenAt = null;
    step(2, () => { t.health = 1e6; if (seenAt === null && br.visible) seenAt = g.time; if (crouchAt === null && b.crouchT > 0.5) crouchAt = g.time; if (g.time > seenAt + 1) lateral = Math.max(lateral, Math.abs(b.vel.x * perp.x + b.vel.z * perp.z)); });
    check(seenAt !== null && crouchAt !== null && crouchAt - seenAt <= 1, `chest-high cover in front: crouches behind it within a second (${crouchAt === null ? 'never' : (crouchAt - seenAt).toFixed(2) + ' s'}, lowCover ${br.lowCover})`);
    check(lateral < 0.5 && b.pos.distanceTo(A) < 1, `and holds there instead of strafing out of it (lateral ${lateral.toFixed(2)} m/s, ${b.pos.distanceTo(A).toFixed(2)} m off)`);
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

  // a dummy that "shoots": 4 damage every 10 frames (24 a second) while it can see the bot, announced like gunfire
  const shooter = (t, b) => (i) => { if (i % 10 === 0 && t.alive && b.alive && los(t, b)) { t.lastFireT = g.time; b.takeDamage(4, t, 'rifle', false, t.pos); } };
  const hidden = (t, b) => !los(t, b);

  // cover: hurt and under fire the bot breaks the line of sight within a second and a half, tucks in (crouched if
  // the spot asks for it) and stays hidden; with two rounds left and the enemy in view it gets behind cover (or on
  // the pistol) before it reloads; nobody reloads a mag with rounds in it standing in the open
  L.scenarios.cover = async () => {
    boot();
    let b = bot('rifle'), br = brain(b); const t = dummy(); alone(b, t);
    b.grenades = 0; b.tacticals = 0; br.diff.coverUse = 1;
    const [A, B] = pair(14, { cover: true, br });
    place(b, A, yawTo(A, B)); place(t, B, yawTo(B, A)); t.health = 1e6;
    until(() => br.visible, 2, () => { t.health = 1e6; });
    b.health = 35; b.takeDamage(4, t, 'rifle', false, t.pos);   // (the first hit lands on the mark the lane was picked for)
    const fire = shooter(t, b);
    let hideAt = null, hid = 0, n = 0, died = false;
    const t0 = g.time, tr = [];
    step(4, (i) => { t.health = 1e6; fire(i); if (!b.alive) died = true; n++; if (hidden(t, b)) { hid++; if (hideAt === null) hideAt = g.time - t0; } if (i % 9 === 0 && b.alive && i < 150) tr.push(`${(g.time - t0).toFixed(2)}:${br.goalKind}${br.coverGoal && br.goal ? '>' + Math.hypot(br.goal.x - b.pos.x, br.goal.z - b.pos.z).toFixed(1) + (br.atCover ? '@' : '') + (br.coverGoal.crouch ? 'c' : '') : ''} v${hs(b).toFixed(1)}${br.fleeing ? 'F' : ''}${b.sprinting ? 'S' : ''} cr${b.crouchT.toFixed(1)} hid${hidden(t, b) ? 1 : 0}/${br.coverHid ? 1 : 0} hp${Math.round(b.health)}`); });
    if (!check(hideAt !== null && hideAt <= 1.6, `at 35 hp under fire: out of sight within 1.6 s (${hideAt === null ? 'never' : hideAt.toFixed(2) + ' s'})`)) note(tr.join(' | '));
    if (!check(!died && b.alive, `and alive at the end (hp ${Math.round(b.health)})`)) note(tr.join(' | '));
    check(br.goalKind === 'cover' && br.atCover, `tucked into cover (goal ${br.goalKind}, there ${br.atCover})`);
    check(hid / n >= 0.6, `hidden ${(100 * hid / n).toFixed(0)}% of the four seconds`);
    check(!br.coverGoal || !br.coverGoal.crouch || b.crouchT > 0.5, `crouched if the spot is crouch-high (crouch ${!!(br.coverGoal && br.coverGoal.crouch)}, crouchT ${b.crouchT.toFixed(2)})`);
    // the reload: seen first, then two rounds left
    place(b, A, yawTo(A, B)); place(t, B, yawTo(B, A)); t.health = 1e6; b.grenades = 0; b.tacticals = 0;
    until(() => br.visible, 2, () => { t.health = 1e6; b.weapon.mag = 30; });
    b.weapon.mag = 2;
    let reloadAt = null, exposed = null, pistolAt = null, coverAt = null; const t1 = g.time, tr2 = [];
    step(5, (i) => { t.health = 1e6; if (i % 12 === 0) tr2.push(`${(g.time - t1).toFixed(1)}:${br.goalKind}${br.coverGoal ? '>' + Math.hypot(br.goal.x - b.pos.x, br.goal.z - b.pos.z).toFixed(1) + (br.atCover ? '@' : '') : ''} c${b.cur} ${b.weapon.mag}${b.weapon.reloading ? 'R' : ''} sw${b.switchT.toFixed(1)} v${br.visible ? 1 : 0} low${br.fightT.toFixed(1)}/${br.pauseT.toFixed(2)} cache${br.coverCache ? (br.coverCache.p ? 'y' : 'n') : '-'}`); if (coverAt === null && br.goalKind === 'cover') coverAt = g.time - t1; if (pistolAt === null && b.cur === 1) pistolAt = g.time - t1; if (reloadAt === null && b.weapons[0].reloading) { reloadAt = g.time - t1; exposed = !hidden(t, b); } });
    // (or they're out of sight already and the reload goes in there and then)
    if (!check((coverAt !== null && coverAt < 1.5) || (reloadAt !== null && reloadAt < 1.5 && !exposed), `two rounds left in their face: heads for cover or reloads out of their sight (cover ${coverAt === null ? 'never' : coverAt.toFixed(2) + ' s'}, reload ${reloadAt === null ? 'never' : reloadAt.toFixed(2) + ' s'})`)) note(tr2.slice(0, 14).join(' | '));
    if (!check(reloadAt !== null && reloadAt < 4.5, `and reloads the rifle (${reloadAt === null ? 'never' : reloadAt.toFixed(2) + ' s'}${pistolAt !== null ? ', pistol out at ' + pistolAt.toFixed(2) : ''})`)) note(`goal ${br.goalKind} at cover ${br.atCover} hid ${br.coverHid} cur ${b.cur} rifle ${b.weapons[0].mag}/${b.weapons[0].reserve} visible ${br.visible} expo ${(br.expo || 0).toFixed(2)} switches ${b.__sw || 0} | ${tr2.join(' | ')}`);
    check(reloadAt === null || !exposed, `the reload starts out of their sight (exposed ${exposed})`);
    // in the open with the mag half full: no reload while they're in view (that's for behind cover or after)
    boot(); b = bot('rifle'); br = brain(b); const t2 = dummy(); alone(b, t2); b.grenades = 0; b.tacticals = 0;
    const [C, D] = pair(15, { clear: 3 });
    place(b, C, yawTo(C, D)); place(t2, D, yawTo(D, C)); t2.health = 1e6;
    until(() => br.visible, 2, () => { t2.health = 1e6; });
    let reloaded = false; step(2, () => { t2.health = 1e6; b.weapon.mag = Math.max(b.weapon.mag, 15); if (b.weapon.reloading) reloaded = true; });
    check(!reloaded, 'half a mag and them in the open: no reload');
  };

  // grenades: a live frag at its feet is run from (the difficulty's reaction time, then the clearest way out);
  // a target that just slipped behind a wall gets a frag thrown after it, cooked on hard; never point blank
  L.scenarios.nade = async () => {
    boot();
    const b = bot('rifle'), br = brain(b), t = dummy(); alone(b, t);
    const [A, B] = pair(12, { clear: 3 });
    place(b, A, yawTo(A, B)); park(t); b.grenades = 0; b.tacticals = 0;
    step(0.5);
    const p0 = b.pos.clone();
    const spec = (await import('/js/config.js')).EQUIPMENT.frag;
    g.throwGrenade(t, b.pos.clone(), 0, 'frag');
    const gr = g.grenades[g.grenades.length - 1]; gr.pos.set(p0.x + 0.5, p0.y + 0.1, p0.z + 0.4); gr.vel.set(0, 0, 0); gr.fuse = 2.2; gr.owner = t;
    let far = 0, moveAt = null; const t0 = g.time;
    step(2.1, () => { const d = Math.hypot(b.pos.x - p0.x, b.pos.z - p0.z); if (moveAt === null && d > 0.5) moveAt = g.time - t0; far = Math.max(far, d); });
    check(gr && spec, 'a frag lands at its feet');
    check(moveAt !== null && moveAt <= br.diff.nadeDodge + 0.35, `moves off within the reaction time (${moveAt === null ? 'never' : moveAt.toFixed(2) + ' s'}, nadeDodge ${br.diff.nadeDodge})`);
    check(far >= 4, `${far.toFixed(1)} m away by the time it goes off (4+)`);
    check(b.alive && b.health > 60, `and lives (hp ${Math.round(b.health)})`);
    // the frag after a target that just ducked behind a wall at 14 m
    boot(); const b2 = bot('rifle'), br2 = brain(b2), t2 = dummy(); alone(b2, t2); b2.grenades = 1; b2.tacticals = 0; br2.diff.cook = 1;
    const [C, D] = pair(14, { clear: 2 });
    place(b2, C, yawTo(C, D)); place(t2, D, yawTo(D, C)); t2.health = 1e6;
    until(() => br2.visible, 2, () => { t2.health = 1e6; });
    step(0.6, () => { t2.health = 1e6; });
    const mid = pointAlong(D, C, 2); wall(mid.x - 0.6, mid.z - 1.5, mid.x + 0.6, mid.z + 1.5);   // (a slab in front of them: they're gone)
    br2.grenadeT = 0;
    let thrown = null; const n0 = g.grenades.length;
    // (the throw is a 55% roll every 1.5 s while the sighting is fresh: the roll is hurried here so the dice can't fail it)
    step(6, () => { t2.health = 1e6; if (thrown === null) br2.grenadeT = Math.min(br2.grenadeT, 0.05); if (thrown === null && g.grenades.length > n0) thrown = g.grenades[g.grenades.length - 1]; });
    check(!br2.visible, 'the wall takes them out of sight');
    check(thrown !== null && thrown.owner === b2, `a frag goes after them within 6 s (${thrown ? 'thrown' : 'never'})`);
    check(!thrown || thrown.fuse < spec.fuse - 0.3, `cooked (fuse ${thrown ? thrown.fuse.toFixed(2) : '-'} of ${spec.fuse})`);
    // never point blank: 4 m away in the open, a full minute of rolls would still be none; here 5 s
    boot(); const b3 = bot('rifle'), br3 = brain(b3), t3 = dummy(); alone(b3, t3); b3.grenades = 1; b3.tacticals = 0;
    const [E, F] = pair(4);
    place(b3, E, yawTo(E, F)); place(t3, F, yawTo(F, E)); t3.health = 1e6; br3.grenadeT = 0;
    const n1 = g.grenades.length; step(5, () => { t3.health = 1e6; br3.grenadeT = Math.min(br3.grenadeT, 0.1); });
    check(g.grenades.length === n1 && b3.grenades === 1, 'no frag at 4 m');
  };

  // a lost target: the bot holds on the corner they went behind for a moment, sighted, then approaches it off the
  // straight line, walked and aimed in; a wounded one is chased at a run
  L.scenarios.lost = async () => {
    boot();
    const b = bot('rifle'), br = brain(b), t = dummy(); alone(b, t);
    b.grenades = 0; b.tacticals = 0; br.diff.chase = 0;
    const [A, B] = pair(12, { clear: 4 });
    place(b, A, yawTo(A, B)); place(t, B, yawTo(B, A)); t.health = 1e6;
    until(() => br.visible, 2, () => { t.health = 1e6; });
    step(0.8, () => { t.health = 1e6; b.weapon.mag = 30; });
    // a slab stands 2 m in front of the spot beside them; they step sideways behind it (the dummy walks for a moment)
    const pl = Math.hypot(B.z - A.z, B.x - A.x), perp = new THREE.Vector3(-(B.z - A.z) / pl, 0, (B.x - A.x) / pl);
    const B2 = B.clone().addScaledVector(perp, 3), W = pointAlong(B2, A, 2);
    wall(W.x - 1.1, W.z - 1.1, W.x + 1.1, W.z + 1.1, 2.4);
    const wish = perp.clone();
    let lostAt = null, stillAt = null; const t0 = g.time, lk = new THREE.Vector3();
    const still = new THREE.Vector3();
    step(3, (i) => { t.health = 1e6; b.weapon.mag = 30; t.updateMovement(1 / 60, i < 68 ? wish : still, false, false);; if (lostAt === null && !br.visible) { lostAt = g.time - t0; lk.copy(br.lastKnown); } if (lostAt !== null && stillAt === null && br.goalKind === 'watch') stillAt = g.time - t0; });
    check(lostAt !== null && lostAt < 1, `they step out of sight (${lostAt === null ? 'never' : lostAt.toFixed(2) + ' s'})`);
    check(stillAt !== null && stillAt - lostAt < 0.3, `a hold on the corner starts at once (${stillAt === null ? 'never' : (stillAt - lostAt).toFixed(2) + ' s after'})`);
    const toLk = yawTo(b.pos, lk);
    check(Math.abs(angDiff(b.yaw, toLk)) < 0.4 && b.adsT > 0.8, `sighted on where they went (${Math.abs(angDiff(b.yaw, toLk)).toFixed(2)} rad off, adsT ${b.adsT.toFixed(2)})`);
    // then the approach: off the line, walked, aimed in
    let sprinted = false, adsLow = 0, n = 0, offLine = 0, reached = null, goalOff = null, repeek = false; const t1 = g.time, seq = [];
    const offOf = (p) => { const lx = lk.x - A.x, lz = lk.z - A.z, ll = Math.hypot(lx, lz) || 1; return Math.abs(((p.x - A.x) * -lz + (p.z - A.z) * lx) / ll); };
    step(6, () => { t.health = 1e6; b.weapon.mag = 30; t.updateMovement(1 / 60, still, false, false); n++; const k = br.goalKind + (b.sprinting ? '/S' : '') + (br.visible ? '/v' : ''); if (seq[seq.length - 1] !== k) seq.push(k); if (br.goalKind === 'hunt' && br.lostSelf) repeek = true; if (goalOff === null && br.goalKind === 'hunt' && br.goal && !br.lostSelf && !br.chaseUntil) goalOff = offOf(br.goal); if (b.sprinting) sprinted = true; if (b.adsT < 0.5 && hs(b) > 1) adsLow++; const d = Math.hypot(b.pos.x - lk.x, b.pos.z - lk.z); if (reached === null && d < 3) reached = g.time - t1; const dx = b.pos.x - A.x, dz = b.pos.z - A.z, along = (dx * (B.x - A.x) + dz * (B.z - A.z)) / pl; const off = Math.abs(dx * perp.x + dz * perp.z); if (along > 3 && along < pl - 3) offLine = Math.max(offLine, off); });
    // (the approach, or the target seen again on the way: a re-peek that finds them ends in a fight, then another hold)
    if (!check(reached !== null || seq.some(k => k.startsWith('hunt') || k.includes('/v')), `the hold ends and the approach starts (${seq.slice(0, 4).join(' > ')}, within 3 m ${reached === null ? 'never' : 'at ' + reached.toFixed(1) + ' s'})`)) note(`${seq.join(' > ')} | los ${los(b, t)} visible ${br.visible} spot ${(br.spot.get(t) || 0).toFixed(2)} lostT ${(g.time - br.lostT).toFixed(2)} ago, lastKnown ${(g.time - br.lastKnownT).toFixed(2)} ago, watchFor ${br.watchFor.toFixed(2)}, dist ${b.pos.distanceTo(t.pos).toFixed(1)}`);
    if (!check(!sprinted, 'never a sprint on the way in')) note(seq.join(' > '));
    check(adsLow / Math.max(1, n) < 0.2, `aimed in on the way (sights down while moving ${(100 * adsLow / Math.max(1, n)).toFixed(0)}% of the time)`);
    // (the walk itself is often cut short by seeing them again: the point it heads for is what's checked)
    // (a bot that strafed behind the cover itself steps back out to where the fight was: a re-peek, not an approach)
    if (!check(goalOff === null ? repeek || !seq.some(k => k.startsWith('hunt')) : goalOff > 1.5 || offLine > 1.5, `comes in off the straight line (heads for a point ${goalOff === null ? '-' : goalOff.toFixed(1)} m off it, walked ${offLine.toFixed(1)} m off${repeek ? ', re-peeked' : ''})`)) note(seq.join(' > '));
    // a wounded one: chased at a run to where it was
    boot(); const b2 = bot('rifle'), br2 = brain(b2), t2 = dummy(); alone(b2, t2); b2.grenades = 0; b2.tacticals = 0; br2.diff.chase = 1;
    const [C, D] = pair(12, { clear: 3 });
    place(b2, C, yawTo(C, D)); place(t2, D, yawTo(D, C)); t2.health = 1e6;
    until(() => br2.visible, 2, () => { t2.health = 1e6; });
    br2.onHit(t2, 70);
    const mid2 = pointAlong(D, C, 1.5); wall(mid2.x - 0.6, mid2.z - 1.2, mid2.x + 0.6, mid2.z + 1.2, 2.4);
    let ran = false, closest = 99, chased = false, gone = false, again = false; step(3, () => { t2.health = 1e6; if (br2.chaseUntil > g.time) chased = true; if (b2.sprinting) ran = true; if (!br2.visible) gone = true; else if (gone) again = true; closest = Math.min(closest, Math.hypot(b2.pos.x - D.x, b2.pos.z - D.z)); });
    check(chased && ran && (closest < 5 || again), `a wounded target is run down (chase ${chased}, ran ${ran}, got within ${closest.toFixed(1)} m${again ? ', caught sight of it again' : ''})`);
  };

  // travel: sprint across quiet ground, walk in aimed where it's dangerous (a teammate's callout close by), and
  // take a corner on the route pre-aimed at a walk
  L.scenarios.travel = async () => {
    boot();
    const b = bot('rifle'), br = brain(b); const t = dummy(); alone(b, t); park(t);
    b.grenades = 0; b.tacticals = 0;
    const [A, B] = pair(30);
    place(b, A, yawTo(A, B)); br.setGoal(B, 'roam'); br.goalT = 30; br.route = null;
    step(1.5);
    check(b.sprinting && b.adsT < 0.1, `quiet ground: a sprint (${hs(b).toFixed(1)} m/s, adsT ${b.adsT.toFixed(2)})`);
    // a callout 8 m ahead: the sprint ends, the sights come up
    const ahead = pointAlong(b.pos, B, 8);
    g.reportIntel(b.team, ahead);
    let stopAt = null, adsAt = null; const t0 = g.time;
    step(2, () => { if (stopAt === null && !b.sprinting) stopAt = g.time - t0; if (adsAt === null && b.adsT > 0.8) adsAt = g.time - t0; });
    check(stopAt !== null && stopAt < 0.3, `a callout close ahead: the sprint ends (${stopAt === null ? 'never' : stopAt.toFixed(2) + ' s'})`);
    check(adsAt !== null && adsAt < 0.8 && br.threat >= 0.5, `and the sights come up (${adsAt === null ? 'never' : adsAt.toFixed(2) + ' s'}, threat ${br.threat.toFixed(1)})`);
    check(hs(b) < 3.5 && hs(b) > 0.5, `walking it in (${hs(b).toFixed(1)} m/s)`);
    // a corner on the route: two cells 12-20 m apart with no straight walk, whose route turns 50+ degrees between
    // two legs of 2 m or more (the map's own corners)
    boot(); const b2 = bot('rifle'), br2 = brain(b2); const t2 = dummy(); alone(b2, t2); park(t2); b2.grenades = 0; b2.tacticals = 0; br2.diff.preAim = 1;
    const nav = g.world.nav, cells = nav.openCells.slice().sort(() => Math.random() - 0.5).slice(0, 400);
    let C = null, D = null;
    outer: for (const ka of cells) for (const kb of cells) {
      const a = new THREE.Vector3(nav.cx(ka % nav.cols), 0, nav.cz((ka / nav.cols) | 0)), q = new THREE.Vector3(nav.cx(kb % nav.cols), 0, nav.cz((kb / nav.cols) | 0)), dd = a.distanceTo(q);
      if (dd < 12 || dd > 20 || nav.lineClear(a.x, a.z, q.x, q.z)) continue;
      const path = nav.findPath(a, q); if (path.length < 2) continue;
      let len = 0, prev = a; for (const p of path) { len += p.distanceTo(prev); prev = p; }
      if (len > 30) continue;
      for (let i = 0; i + 1 < path.length; i++) {
        const p0 = i ? path[i - 1] : a, p1 = path[i], p2 = path[i + 1];
        if (p1.distanceTo(p0) < 2 || p2.distanceTo(p1) < 2) continue;
        if (Math.abs(angDiff(Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z)), Math.atan2(-(p2.x - p1.x), -(p2.z - p1.z)))) > 0.87) { C = a; D = q; break outer; }
      }
    }
    if (!C) throw new Error('no bendy route');
    place(b2, C, yawTo(C, D)); br2.setGoal(D, 'roam'); br2.goalT = 30; br2.route = null;
    let cornered = 0, sprintingAtCorner = 0, adsAtCorner = 0, reachedD = null; const t1 = g.time;
    step(10, () => { if (br2.cornering) { cornered++; if (b2.sprinting) sprintingAtCorner++; if (b2.adsT > 0.5) adsAtCorner++; } if (reachedD === null && Math.hypot(b2.pos.x - D.x, b2.pos.z - D.z) < 2.5) reachedD = g.time - t1; });
    check(reachedD !== null, `gets round the slab to the far end (${reachedD === null ? 'never' : reachedD.toFixed(1) + ' s'})`);
    check(cornered > 10, `the bend is taken as a corner (${(cornered / 60).toFixed(2)} s of it)`);
    check(cornered === 0 || sprintingAtCorner / cornered < 0.2, `not at a sprint (${cornered ? (100 * sprintingAtCorner / cornered).toFixed(0) : '-'}% sprinting)`);
    check(cornered === 0 || adsAtCorner / cornered > 0.5, `pre-aimed (sights up ${cornered ? (100 * adsAtCorner / cornered).toFixed(0) : '-'}% of the corner)`);
  };

  // after a kill: a beat before anything else (the difficulty's postKill), then a rotation to a new angle or a
  // hold on where they fell, sighted; never a chain-kill snap
  L.scenarios.postkill = async () => {
    boot();
    const kill = (rotateKill) => {
      const b = bot('rifle'), br = brain(b), t = dummy(); alone(b, t);
      b.grenades = 0; b.tacticals = 0; br.diff.rotateKill = rotateKill;
      const [A, B] = pair(12, { clear: 2 });
      place(b, A, yawTo(A, B)); place(t, B, yawTo(B, A)); t.health = 1;
      const killAt = until(() => !t.alive, 4);
      return { b, br, t, A, B, killAt };
    };
    let { b, br, t, A, B, killAt } = kill(0);
    check(killAt !== null, `the dummy is killed (${killAt === null ? 'never' : killAt.toFixed(2) + ' s'})`);
    check(br.reactT >= br.diff.postKill[0] - 1 / 60 && br.target === null, `a pause of at least ${br.diff.postKill[0]} s before the next target (reactT ${br.reactT.toFixed(2)})`);
    const p1 = b.pos.clone();
    step(1.5);
    const toV = yawTo(b.pos, B);
    check(br.idleT > 0 || br.goalKind === 'rotate', `rotateKill 0: a hold on the spot (idle ${br.idleT.toFixed(1)} s, goal ${br.goalKind})`);
    check(Math.hypot(b.pos.x - p1.x, b.pos.z - p1.z) < 1.5 && Math.abs(angDiff(b.yaw, toV)) < 0.5, `standing where it fired, sighted on where they fell (${Math.hypot(b.pos.x - p1.x, b.pos.z - p1.z).toFixed(1)} m moved, ${Math.abs(angDiff(b.yaw, toV)).toFixed(2)} rad off)`);
    boot(); ({ b, br, t, A, B, killAt } = kill(1));
    const p2 = b.pos.clone(); let rotated = false, farthest = 0;
    step(5, () => { if (br.goalKind === 'rotate') rotated = true; farthest = Math.max(farthest, Math.hypot(b.pos.x - p2.x, b.pos.z - p2.z)); });
    check(killAt !== null && (rotated ? farthest > 3 : br.idleT > 0 || farthest < 1.5), `rotateKill 1: a new angle, or the hold when none is to be had (${rotated ? 'rotated ' + farthest.toFixed(1) + ' m' : 'held'})`);
  };

  // the trade: a teammate dies close by, the nearest bot who isn't fighting goes for the killer, aimed in, with the
  // killer half-spotted and the death called in as intel
  L.scenarios.trade = async () => {
    boot({ teamSize: 3 });
    const b = bot('rifle', 1, 0), br = brain(b), m = bot('rifle', 1, 1), bm = brain(m), t = dummy(); alone(b, m, t);
    b.grenades = m.grenades = 0; b.tacticals = m.tacticals = 0;
    const [A, B] = pair(10);
    const side = pointAlong(A, B, -6); side.set(g.world.nav.isOpenAt(side.x, side.z) ? side.x : A.x, 0, g.world.nav.isOpenAt(side.x, side.z) ? side.z : A.z);
    place(b, A, yawTo(A, B)); place(m, side, yawTo(B, A)); place(t, B, yawTo(B, A)); t.health = 1e6;
    // (a wall 1.5 m in front of the mate, across the line to the killer: the mate can't already be in the fight)
    const wm = pointAlong(side, B, 1.5), wl = Math.hypot(B.z - side.z, B.x - side.x) || 1, wpx = -(B.z - side.z) / wl * 1.5, wpz = (B.x - side.x) / wl * 1.5;
    wall(Math.min(wm.x - wpx, wm.x + wpx) - 0.2, Math.min(wm.z - wpz, wm.z + wpz) - 0.2, Math.max(wm.x - wpx, wm.x + wpx) + 0.2, Math.max(wm.z - wpz, wm.z + wpz) + 0.2, 2.4);
    step(0.3, () => { t.health = 1e6; });
    bm.target = null; bm.visible = false; bm.spot.clear();
    const intel0 = g.intel[1].time;
    b.takeDamage(1000, t, 'rifle', false, t.pos);
    step(1 / 60, () => { t.health = 1e6; });
    check(!b.alive, 'the teammate goes down in sight of the killer');
    // (the game's dice send the nearest mate 70% of the time: the behaviour is checked on a direct call)
    if (bm.target !== t) bm.onMateDown(b, t);
    check(bm.target === t && bm.goalKind === 'hunt' && bm.tradeT > g.time && (bm.spot.get(t) || 0) >= 0.6, `the mate takes the trade (target ${bm.target === t}, goal ${bm.goalKind}, half-spotted ${(bm.spot.get(t) || 0).toFixed(1)})`);
    check(g.intel[1].time > intel0 && g.intel[1].pos.distanceTo(t.pos) < 1, 'the death is called in as intel');
    let sprinted = false, adsUp = null, closest = 99; const t0 = g.time;
    let seen = false;
    step(6, () => { t.health = 1e6; if (m.sprinting) sprinted = true; if (adsUp === null && m.adsT > 0.8) adsUp = g.time - t0; closest = Math.min(closest, m.pos.distanceTo(t.pos)); if (bm.visible) seen = true; });
    check(adsUp !== null && adsUp < 2.5, `comes in aimed (sights up at ${adsUp === null ? 'never' : adsUp.toFixed(2) + ' s'}, the first stretch run ${sprinted})`);
    check(closest < 9 || seen, `and gets to the fight (closest ${closest.toFixed(1)} m, in sight ${seen})`);
  };

  // the aim: lead on a runner (the sights sit ahead of them), a hit knocks the aim for a moment, and the one
  // shooting us becomes the target over the one we were looking at
  L.scenarios.aim = async () => {
    boot();
    const b = bot('rifle'), br = brain(b), t = dummy(); alone(b, t);
    b.grenades = 0; b.tacticals = 0; br.diff.aimError = 0.01; br.diff.reaction = 0.05;
    const [A, B] = pair(15, { clear: 4 });
    const pl = Math.hypot(B.z - A.z, B.x - A.x), perp = new THREE.Vector3(-(B.z - A.z) / pl, 0, (B.x - A.x) / pl);
    place(b, A, yawTo(A, B)); place(t, B.clone().addScaledVector(perp, -3), yawTo(B, A)); t.health = 1e6;
    until(() => br.visible, 2, () => { t.health = 1e6; });
    // the dummy runs across the lane: the aim is led so it sits on a steady runner (no trail); when the runner
    // turns round, the aim trails for a moment before it catches up
    const err = (dir) => { const to = yawTo(b.pos, t.pos), ahead = Math.sign(angDiff(to, yawTo(b.pos, t.pos.clone().add(dir)))); return angDiff(to, b.yaw) * ahead; };   // (+: ahead of them along dir, -: behind)
    let steady = 0, signed = 0, expo = 0, n = 0;
    // (only frames after the aim has had 0.4 s on them count: before that is the first look, checked below)
    step(1.2, (i) => { t.health = 1e6; t.updateMovement(1 / 60, perp, true, false); if (hs(t) > 5 && br.visible && br.seenT > 0.4) { const e = err(perp); steady += Math.abs(e); signed += e; expo += br.expo; n++; } });
    if (!check(n > 12 && steady / n < 0.05, `a steady runner is tracked with no trail (${n ? ((steady / n) * 57.3).toFixed(2) : '-'} degrees off on average over ${n} frames)`)) note(`signed ${(signed / n * 57.3).toFixed(2)} deg, exposure ${(expo / n).toFixed(2)}, dist ${b.pos.distanceTo(t.pos).toFixed(1)}, aimErr ${br.aimErr.length().toFixed(2)} m, seenT ${br.seenT.toFixed(2)}, lane ${A.x.toFixed(1)},${A.z.toFixed(1)}`);
    // one already running when first seen: the first look lands behind it and catches up
    place(b, A, yawTo(A, B)); place(t, B.clone().addScaledVector(perp, -3), yawTo(B, A)); t.health = 1e6; br.diff.aimError = 0.01; br.diff.reaction = 0.05;
    step(0.25, () => { t.health = 1e6; t.updateMovement(1 / 60, perp, true, false); br.spot.clear(); br.visible = false; br.target = null; });   // (up to speed before it's seen)
    let first = 0, m2 = 0;
    step(0.6, () => { t.health = 1e6; t.updateMovement(1 / 60, perp, true, false); if (br.visible && br.aimInit && m2 < 6) { first += err(perp); m2++; } });
    check(m2 >= 6 && first / m2 < -0.02, `the first look at a runner lands behind it (${m2 ? ((first / m2) * 57.3).toFixed(2) : '-'} degrees over the first ${m2} frames)`);
    // the flinch: a 30-damage hit knocks the aim, and it's gone in half a second
    boot(); const b2 = bot('rifle'), br2 = brain(b2), t2 = dummy(); alone(b2, t2); b2.grenades = 0; b2.tacticals = 0; br2.diff.flinch = 1;
    const [C, D] = pair(10, { clear: 2 });
    place(b2, C, yawTo(C, D)); place(t2, D, yawTo(D, C)); t2.health = 1e6;
    until(() => br2.visible, 2, () => { t2.health = 1e6; });
    step(1, () => { t2.health = 1e6; });
    b2.takeDamage(30, t2, 'rifle', false, t2.pos);
    check(br2.flinchT > 0.3 && br2.flinchV.length() > 0.05, `a hit knocks the aim (flinchT ${br2.flinchT.toFixed(2)}, ${br2.flinchV.length().toFixed(2)} m)`);
    step(0.6, () => { t2.health = 1e6; });
    check(br2.flinchT <= 0 && br2.flinchV.length() === 0, 'and the knock is gone in half a second');
    // priority: looking at one at 20 m, shot by another at 8 m off to the side: the shooter becomes the target
    boot({ teamSize: 3 }); const b3 = bot('rifle'), br3 = brain(b3), t3 = dummy(0, 0), t4 = dummy(0, 1); alone(b3, t3, t4); b3.grenades = 0; b3.tacticals = 0;
    const [E, F] = pair(20, { clear: 3 });
    const pl2 = Math.hypot(F.z - E.z, F.x - E.x), perp2 = new THREE.Vector3(-(F.z - E.z) / pl2, 0, (F.x - E.x) / pl2);
    place(b3, E, yawTo(E, F)); place(t3, F, yawTo(F, E)); t3.health = 1e6;
    const side = E.clone().addScaledVector(perp2, 6).add(new THREE.Vector3((F.x - E.x) / pl2 * 4, 0, (F.z - E.z) / pl2 * 4));
    place(t4, side, yawTo(side, E)); t4.health = 1e6; t4.pos.y = g.world.nav.levelY(side);
    until(() => br3.visible && br3.target === t3, 2, () => { t3.health = t4.health = 1e6; });
    check(br3.target === t3, 'the far one in front is the target first');
    b3.takeDamage(10, t4, 'rifle', false, t4.pos); t4.lastFireT = g.time;
    const sw = until(() => br3.target === t4, 1, () => { t3.health = t4.health = 1e6; });
    check(sw !== null && sw < 0.4, `shot from the side: the shooter is the target within 0.4 s (${sw === null ? 'never' : sw.toFixed(2) + ' s'})`);
  };

  // the slide: the last couple of metres into cover out of a sprint (the dice, or always when hurt); never twice
  // in three seconds
  L.scenarios.slide = async () => {
    boot();
    const b = bot('rifle'), br = brain(b), t = dummy(); alone(b, t); park(t);
    b.grenades = 0; b.tacticals = 0;
    const run = (slide, health) => {
      const [A, B] = pair(9, { clear: 2 });
      place(b, A, yawTo(A, B)); b.health = health; br.diff.slide = slide;
      br.takeCover({ p: B.clone(), crouch: false, peek: 0, straight: true }, 3);
      let slid = false, ran = false, tr = []; step(3, (i) => { b.health = Math.min(b.health, health); if (b.slideT > 0) slid = true; if (b.sprinting) ran = true; if (i % 6 === 0 && i < 90) tr.push(`${(i / 60).toFixed(1)}:${br.goalKind} ${Math.hypot(b.pos.x - B.x, b.pos.z - B.z).toFixed(1)}m v${hs(b).toFixed(1)}${b.sprinting ? 'S' : ''} cd${br.slideCd.toFixed(1)} hp${b.health}`); });
      return { slid, ran, there: Math.hypot(b.pos.x - B.x, b.pos.z - B.z), tr: tr.join(' | ') };
    };
    let r = run(1, 100);
    check(r.ran && r.slid, `slide 1: sprints and slides into cover (ran ${r.ran}, slid ${r.slid})`);
    check(r.there < 2.5, `and ends up there (${r.there.toFixed(1)} m off)`);
    r = run(0, 100);
    check(r.ran && !r.slid, `slide 0: runs in on its feet (slid ${r.slid})`);
    r = run(0, 40);
    if (!check(r.slid, 'hurt, everybody slides in')) note(r.tr);
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
