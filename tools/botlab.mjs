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
  function eye(p) { return v3.set(p.x, g.world.nav.levelY(p) + 1.62, p.z); }
  // two open cells |ab| within 0.5 m of dist, a clear walk between them and eye-to-eye line of sight; cover: true
  // also needs brain.coverPoint (the bot's own cover search) to find something from a (so the cover tests run on
  // the map's real walls)
  function pair(dist, { cover = false, br = null } = {}) {
    const nav = g.world.nav, cells = nav.openCells.slice().sort(() => Math.random() - 0.5).slice(0, 1500);
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
  // record every attempt to fire: c.__fires = [{ t, ok, adsT, sprinting, reloading, prone }]
  function spyFire(c) {
    c.__fires = [];
    const of = c.tryFire.bind(c);
    c.tryFire = (o, d) => { const ok = of(o, d); c.__fires.push({ t: g.time, ok, adsT: c.adsT, sprinting: c.sprinting, reloading: c.weapon.reloading, prone: c.proneT }); return ok; };
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

  const L = window.__lab = { g, THREE, Box, DEFAULT_SETTINGS, v1, v2, v3, clamp, angDiff, yawTo, hs, los, mulberry, errors, boot, brain, pin, unpin, bot, dummy, place, park, eye, pair, pointAlong, hiddenNear, step, spyFire, wall, unwall, check, assert, note, yieldNow, defaults, scenarios: {} };
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
