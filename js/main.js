// Entry point: menus (mouse, keyboard and controller navigable), settings persistence, game bootstrap
import { DEFAULT_SETTINGS, WEAPONS, PRIMARIES, FRIENDLY_CSS, ENEMY_CSS, PUBLIC_MATCH } from './config.js';
import { MAPS } from './world.js';
import { Game } from './game.js';
import { glyph } from './hud.js';
import { loadAssets } from './assets.js';
import { Lobby, MAX_HUMANS } from './online.js';
import { turnAvailable, turnServers, turnStatus } from './net.js';
import { loadoutFromSettings, parseLoadout, GUNSMITH, SLOTS, SLOT_NAMES, ATTACHMENTS, cleanAtt, weaponDef, attSummary } from './attachments.js';
import { GunPreview } from './gunsmith.js';
import { Account, takeLoginToken } from './account.js';
import { MODES } from './modes.js';

const $ = (id) => document.getElementById(id);
const KEY = 'breachpoint.settings.v2';

function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (_) { /* storage unavailable */ }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
}
const settings = loadSettings();
const account = new Account();
const loginToken = takeLoginToken(); // sign-in link opened: read and wipe it before anything else runs
let playMode = 'offline';            // chosen on the Offline / Online screen
// online with accounts on, your Name Tag is your account's; offline it's the local one
const onlineName = () => playMode === 'online' && account.enabled && account.tag;
const myName = () => onlineName() || settings.name;
// social sidebar state (see the sidebar section below)
let sideOpen = false, sideFocusBack = null;
const SIDE_SCREENS = ['mode', 'menu', 'pause', 'lobby', 'end'];
const sideAllowed = () => SIDE_SCREENS.includes(screen) && !window.BREACHPOINT_OFFLINE;

const TIPS = [
  'Press sprint again while sprinting for a short tactical sprint.',
  'Hold the grenade button to cook a frag; release to throw it.',
  'Crouch while sprinting to slide. It carries you faster than a sprint for a moment.',
  'Headshots score bonus points and drop enemies faster.',
  'Choose Class from the pause menu: changes apply on your next spawn.',
  'Search & Destroy: hold reload on a bomb site to plant, or on the bomb to defuse.',
  'Gunfight: both teams get the same guns each round. Take the flag if time runs out.',
  'Stick sensitivity, deadzone and aim assist are in Options under Controller.',
  'Dynamic resolution keeps the frame rate smooth. Turn it off in Options for a sharper image.',
  'Health comes back on its own a few seconds after you stop taking damage.',
  'Upstairs at Freshway Market overlooks the aisles. Bots won\'t follow you up there.',
];

// ---------- game bootstrap ----------
let game;
// let the loading screen paint before the (synchronous) world build
{
  let op = 0, tx = 0;
  document.getElementById('loading').classList.add('boot');
  $('ld-tip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
  const show = () => {
    $('load-text').textContent = `Loading soldiers ${Math.round(op * 100)}% · textures ${Math.round(tx * 100)}%`;
    $('load-fill').style.width = `${Math.round(10 + (op + tx) * 40)}%`;
  };
  await loadAssets((f) => { op = f; show(); }, (f) => { tx = f; show(); });
}
$('load-text').textContent = 'Building the map…'; $('load-fill').style.width = '95%';
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
try {
  game = new Game($('app'));
} catch (err) {
  console.error(err);
  $('load-text').textContent = 'Could not start WebGL. Use a recent Chrome, Edge, Firefox or Safari with hardware acceleration on.';
  throw err;
}
window.__game = game;
game.applySettings(settings);

// ---------- form binding ----------
const bindings = [
  ['opt-name', 'name', 'text'], ['opt-mode', 'mode', 'str'], ['opt-map', 'map', 'str'], ['opt-team', 'teamSize', 'int'], ['opt-diff', 'difficulty', 'str'],
  ['opt-score', 'scoreLimit', 'int'], ['opt-time', 'timeLimit', 'int'], ['opt-ff', 'friendlyFire', 'bool'],
  ['opt-quality', 'quality', 'str'], ['opt-dynres', 'dynamicRes', 'bool'], ['opt-fov', 'fov', 'int'], ['opt-fps', 'showFps', 'bool'],
  ['opt-sens', 'sensitivity', 'float'], ['opt-adsmode', 'adsMode', 'str'], ['opt-adszoom', 'adsZoom', 'float'], ['opt-sightsize', 'sightSize', 'str'], ['opt-invert', 'invertY', 'bool'], ['opt-padsens', 'padSensitivity', 'float'],
  ['opt-deadzone', 'padDeadzone', 'float'], ['opt-aa', 'aimAssist', 'bool'], ['opt-vib', 'vibration', 'bool'],
  ['opt-vol', 'volume', 'float'], ['opt-music', 'musicVolume', 'float'], ['opt-relay', 'privateRelay', 'bool'], ['opt-touchsize', 'touchSize', 'str'], ['opt-touchads', 'touchAds', 'str'], ['opt-autofire', 'touchAutoFire', 'bool'],
];
const outputs = {
  'opt-fov': ['out-fov', v => `${v}°`], 'opt-adszoom': ['out-adszoom', v => `${Math.round(v * 100)}%`], 'opt-sens': ['out-sens', v => Number(v).toFixed(2)], 'opt-padsens': ['out-padsens', v => Number(v).toFixed(2)],
  'opt-deadzone': ['out-deadzone', v => Number(v).toFixed(2)], 'opt-vol': ['out-vol', v => `${Math.round(v * 100)}%`], 'opt-music': ['out-music', v => `${Math.round(v * 100)}%`],
};
function writeForm() {
  for (const [id, key, type] of bindings) {
    const el = $(id);
    if (type === 'bool') el.checked = !!settings[key];
    else el.value = String(settings[key]);
  }
  for (const id in outputs) $(outputs[id][0]).textContent = outputs[id][1]($(id).value);
  $('opt-name').value = myName();
  syncModeRows();
  renderWeapons();
}
function readField(id, key, type) {
  const el = $(id);
  let v = type === 'bool' ? el.checked : el.value;
  if (type === 'int') v = parseInt(v, 10);
  if (type === 'float') v = parseFloat(v);
  if (type === 'text') v = (v || 'Operator').trim().slice(0, 16) || 'Operator';
  if (key === 'name' && onlineName()) return; // edits go to the account instead (see below)
  settings[key] = v;
}
for (const [id, key, type] of bindings) {
  const el = $(id);
  const ev = el.type === 'range' || el.tagName === 'INPUT' && type === 'text' ? 'input' : 'change';
  el.addEventListener(ev, () => {
    readField(id, key, type);
    if (outputs[id]) $(outputs[id][0]).textContent = outputs[id][1](el.value);
    saveSettings(settings);
    game.applySettings(settings);
    if (game.settings) Object.assign(game.settings, { sensitivity: settings.sensitivity, padSensitivity: settings.padSensitivity, fov: settings.fov, invertY: settings.invertY, aimAssist: settings.aimAssist, showFps: settings.showFps, adsZoom: settings.adsZoom, sightSize: settings.sightSize });
  });
}

// match mode: show only the settings that apply
function syncModeRows() {
  const m = MODES[settings.mode] || MODES.tdm;
  document.body.dataset.gmode = m.id;
  document.querySelectorAll('.mode-pick .mp').forEach(b => { const on = b.dataset.mode === m.id; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('intel-mode').textContent = m.name.toUpperCase();
  $('play-title').textContent = typeof playMode !== 'undefined' && playMode === 'online' ? `ONLINE · ${m.name.toUpperCase()}` : m.name.toUpperCase();
  document.querySelector('#pane-play .pane-sub').textContent = m.blurb;
}
$('opt-mode').addEventListener('change', () => { syncModeRows(); if (lobby && lobby.role === 'host') lobby.broadcastLobby(); });
// big mode buttons on the Play tab drive the (hidden) mode select
document.querySelectorAll('.mode-pick .mp').forEach(b => b.addEventListener('click', () => {
  const sel = $('opt-mode');
  if (sel.value === b.dataset.mode) return;
  sel.value = b.dataset.mode;
  sel.dispatchEvent(new Event('change'));
  game.audio.play('ui', null, { ui: true });
}));

// ---------- loadout + gunsmith ----------
const preview = new GunPreview($('gs-view'));
if (!settings.attachments || typeof settings.attachments !== 'object') settings.attachments = {};
const inMatch = () => game.state === 'playing' || game.state === 'paused';
function statsOf(d) {
  const clamp01 = (v) => Math.max(0.04, Math.min(1, v));
  return [
    ['DAMAGE', clamp01((d.damage * d.pellets) / 110)],
    ['FIRE RATE', clamp01(d.rpm / 900)],
    ['RANGE', clamp01(d.falloffEnd / 120)],
    ['HIP ACCURACY', clamp01(1 - d.spread / 0.1)],
    ['CONTROL', clamp01(1 - (d.recoilPitch + d.recoilYaw * 0.6) / 0.075)],
    ['AIM SPEED', clamp01(1 - d.adsTime / 0.42)],
  ];
}
function attFor(id) { return cleanAtt(id, settings.attachments[id]); }
function loadoutChanged() {
  saveSettings(settings);
  if (inMatch() && game.player) game.requestLoadout(loadoutFromSettings(settings));
}
function slotRows(id, host, prefix) {
  const g = GUNSMITH[id], a = attFor(id);
  host.innerHTML = SLOTS.filter(sl => g[sl]).map(sl => {
    const cur = ATTACHMENTS[sl][a[sl]];
    return `<div class="row slot"><label for="${prefix}-${sl}">${SLOT_NAMES[sl]}<small>${cur.desc}</small></label>
      <select id="${prefix}-${sl}" data-slot="${sl}" data-nav>${g[sl].map(k => `<option value="${k}"${k === a[sl] ? ' selected' : ''}>${ATTACHMENTS[sl][k].name}</option>`).join('')}</select></div>`;
  }).join('');
  host.querySelectorAll('select').forEach(el => el.addEventListener('change', () => {
    settings.attachments[id] = { ...attFor(id), [el.dataset.slot]: el.value };
    el.closest('.row').querySelector('small').textContent = ATTACHMENTS[el.dataset.slot][el.value].desc;
    loadoutChanged();
    renderGunsmith(false);
  }));
}
function renderGunsmith(rebuildRows = true) {
  const id = settings.primary, d = weaponDef(id, attFor(id)), base = WEAPONS[id];
  $('gs-name').textContent = d.name.toUpperCase();
  if (rebuildRows) { slotRows(id, $('gs-slots'), 'gs'); slotRows('pistol', $('gs-pistol'), 'gp'); }
  const now = statsOf(d), was = statsOf(weaponDef(id, null));
  $('gs-stats').innerHTML = now.map(([k, v], i) => {
    const w = was[i][1], lo = Math.min(v, w), diff = v - w;
    return `<span class="stat">${k}<i><b style="width:${Math.round(lo * 100)}%"></b>${Math.abs(diff) > 0.005 ? `<em class="${diff > 0 ? 'up' : 'down'}" style="left:${Math.round(lo * 100)}%;width:${Math.round(Math.abs(diff) * 100)}%"></em>` : ''}</i></span>`;
  }).join('') + `<span class="gs-facts">${d.mag} RDS · ${d.reload.toFixed(1)}s RELOAD · ${d.mode}${d.quiet ? ' · SUPPRESSED' : ''}${d.mag !== base.mag ? '' : ''}</span>`;
  preview.show(id, attFor(id));
  // cards show the build summary
  $('weapon-list').querySelectorAll('.wcard').forEach(b => {
    const s2 = attSummary(b.dataset.weapon, attFor(b.dataset.weapon));
    b.querySelector('.wa').textContent = s2.length ? s2.join(' · ') : 'STOCK';
  });
}
function renderWeapons() {
  const list = $('weapon-list');
  list.innerHTML = PRIMARIES.map(id => {
    const d = WEAPONS[id];
    return `<button class="wcard ${settings.primary === id ? 'on' : ''}" data-weapon="${id}" data-nav>
      <span class="wn">${d.name.toUpperCase()}</span><span class="wt">${d.mode}</span><span class="wa"></span>
    </button>`;
  }).join('');
  list.querySelectorAll('.wcard').forEach(b => b.addEventListener('click', () => {
    settings.primary = b.dataset.weapon;
    list.querySelectorAll('.wcard').forEach(x => x.classList.toggle('on', x === b));
    loadoutChanged();
    renderGunsmith();
  }));
  renderGunsmith();
}

// ---------- tabs ----------
const TABS = ['play', 'loadout', 'options'];
let tab = 'play';
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('#menu .pane').forEach(p => p.classList.toggle('on', p.id === `pane-${t}`));
  game.audio.play('ui', null, { ui: true });
  if (t === 'loadout') renderGunsmith(false);
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

// ---------- screens ----------
let screen = 'menu';
function showScreen(id) {
  closeDropdown();
  if (id !== 'pause' && id !== 'lobby' && $('pane-loadout').closest('#pause')) restorePanes();
  if (id !== 'pause') clearInterval(pauseTimer);
  screen = id;
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
  document.body.classList.toggle('side-ok', sideAllowed());
  document.body.classList.toggle('in-menus', !!id && id !== 'loading');
  if (sideOpen && !sideAllowed()) closeSide();
  document.body.classList.toggle('ingame', id === null);
  if (id && game.input.lastDevice === 'pad') setTimeout(() => focusFirst(), 0);
}

// ---------- loading screen (between the menu and a match) ----------
function drawLoadingMap(id) {
  const c = $('ld-mapc'), wrap = c.parentElement;
  const have = id && game.world.id === id && game.minimap;
  wrap.classList.toggle('on', !!have);
  if (have) { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(game.minimap.canvas, 0, 0, c.width, c.height); }
}
function launch(cfg, online = null) {
  const gm = MODES[(online && online.start && online.start.cfg && online.start.cfg.mode) || cfg.mode] || MODES.tdm;
  const mapId = (online && online.start && online.start.cfg && online.start.cfg.map) || cfg.map;
  const map = MAPS[mapId];
  const ld = $('loading');
  ld.classList.remove('boot');
  $('ld-mode').textContent = `${gm.name.toUpperCase()}${online ? ' · MULTIPLAYER' : ' · COMBAT TRAINING'}`;
  $('ld-name').textContent = map ? map.name.toUpperCase() : 'RANDOM MAP';
  $('ld-desc').textContent = map ? (map.blurb || '') : 'Picking a map…';
  $('ld-tip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
  $('load-text').textContent = 'Building the map…';
  const fill = $('load-fill');
  fill.style.transition = 'none'; fill.style.width = '8%';
  drawLoadingMap(map ? mapId : null);
  showScreen('loading');
  return new Promise((resolve, reject) => requestAnimationFrame(() => {
    fill.style.transition = ''; fill.style.width = '62%';
    setTimeout(() => {
      try { game.startMatch(cfg, online); } catch (e) { showScreen('menu'); reject(e); return; }
      const w = MAPS[game.world.id];
      $('ld-name').textContent = (w ? w.name : game.world.name || '').toUpperCase();
      if (w) $('ld-desc').textContent = w.blurb || '';
      drawLoadingMap(game.world.id);
      fill.style.width = '100%';
      $('load-text').textContent = 'Ready';
      setTimeout(() => { if (screen === 'loading') showScreen(null); resolve(); }, online && online.mode === 'guest' ? 120 : 650);
    }, 90);
  }));
}
function deploy() {
  for (const [id, key, type] of bindings) readField(id, key, type);
  saveSettings(settings);
  launch(settings);
}
$('play').addEventListener('click', deploy);
$('opt-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (playMode === 'online') e.target.blur(); else deploy(); } });

// ---------- pause menu ----------
// Loadout and Options are the same panes as the main menu, moved into the pause panel while it's open.
let pauseSec = 'match', pauseTimer = 0;
const menuBody = document.querySelector('#menu .mw-body');
function restorePanes() {
  const aside = menuBody.querySelector('.intel');
  menuBody.insertBefore($('pane-options'), aside);
  menuBody.insertBefore($('pane-loadout'), $('pane-options'));
  document.querySelectorAll('#menu .pane').forEach(p => p.classList.toggle('on', p.id === `pane-${tab}`));
}
function setPauseSec(sec) {
  pauseSec = sec;
  document.querySelectorAll('.psec').forEach(b => b.classList.toggle('on', b.dataset.sec === sec));
  document.querySelectorAll('.psec-pane').forEach(p => p.classList.toggle('on', p.id === `psec-${sec}`));
  if (sec === 'loadout') { $('psec-loadout').appendChild($('pane-loadout')); $('pane-loadout').classList.add('on'); renderGunsmith(false); }
  if (sec === 'options') { $('psec-options').appendChild($('pane-options')); $('pane-options').classList.add('on'); writeForm(); }
  if (sec === 'match') renderPauseMatch();
}
const mmss = (t) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
function renderPauseMatch() {
  const g = game, p = g.player;
  if (!p) return;
  $('pause-meta').textContent = `${(MODES[g.settings.mode] || MODES.tdm).name.toUpperCase()} · ${(MAPS[g.world.id]?.name || '').toUpperCase()}${g.mode === 'local' ? ' · VS BOTS' : ' · ONLINE'}`;
  $('pm-f').textContent = g.scores[p.team];
  $('pm-e').textContent = g.scores[1 - p.team];
  $('pm-time').textContent = mmss(g.timeLeft);
  $('pm-limit').textContent = `FIRST TO ${g.settings.scoreLimit}`;
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
  const lo = parseLoadout(p.loadout);
  const build = [WEAPONS[lo.primary].name.toUpperCase(), ...attSummary(lo.primary, lo.att)].join(' · ');
  $('pm-me').innerHTML = [['SCORE', p.score], ['KILLS', p.kills], ['DEATHS', p.deaths], ['ASSISTS', p.assists], ['K/D', kd], ['STREAK', p.streak]]
    .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('') + `<p class="pm-build">${esc(build)}</p>`;
  g.hud.renderScoreboard($('pause-board'));
}
document.querySelectorAll('.psec').forEach(b => b.addEventListener('click', () => { setPauseSec(b.dataset.sec); game.audio.play('ui', null, { ui: true }); }));
// destructive buttons need a second press
function confirmBtn(el, fn) {
  let label = el.textContent;
  let armed = 0, t = 0;
  const disarm = () => { armed = 0; el.classList.remove('armed'); el.textContent = label; };
  el.addEventListener('click', () => {
    if (armed) { clearTimeout(t); disarm(); fn(); return; }
    label = el.textContent;
    armed = 1; el.classList.add('armed'); el.textContent = 'PRESS AGAIN TO CONFIRM';
    t = setTimeout(disarm, 3500);
  });
}

// menu music starts on the first click / key / tap (browsers block audio before that)
const startMenuMusic = () => {
  game.audio.init();
  if (game.state === 'menu') game.music.play('menu');
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, startMenuMusic, true);
};
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, startMenuMusic, true);

game.onPause = (paused) => {
  syncOnlineFlags();
  $('pause-conn').textContent = !lobby.active ? '' : lobby.net.relayed ? 'Connection: Cloudflare relay (your IP is hidden)' : `Connection: direct peer-to-peer${turnAvailable() && !turnStatus.ok ? ` (relay unavailable: ${turnStatus.detail})` : ''}`;
  clearInterval(pauseTimer);
  if (paused) {
    $('quit').textContent = lobby.active ? 'LEAVE GAME' : 'END GAME';
    // dead, or only just spawned: open straight onto Change Loadout
    const p = game.player;
    setPauseSec(p && (!p.alive || game.inSpawnWindow(p)) ? 'loadout' : 'match');
    showScreen('pause');
    pauseTimer = setInterval(() => { if (screen === 'pause' && pauseSec === 'match') renderPauseMatch(); }, 1000);
  } else { restorePanes(); showScreen(null); }
};
$('resume').addEventListener('click', () => game.resume());
$('death-respawn').addEventListener('click', () => game.requestRespawn());
$('death-loadout').addEventListener('click', () => { if (game.state === 'playing') game.pause(); });
confirmBtn($('restart'), () => { restorePanes(); launch(settings); });
confirmBtn($('quit'), () => { clearInterval(pauseTimer); restorePanes(); leaveOnline(); game.quitToMenu(); writeForm(); showScreen('menu'); });

// end of match
game.onEnd = (r) => {
  const title = $('end-title');
  title.className = '';
  if (r.winner === -1) title.textContent = 'DRAW';
  else if (r.winner === r.playerTeam) { title.textContent = 'VICTORY'; title.classList.add('win'); }
  else { title.textContent = 'DEFEAT'; title.classList.add('lose'); }
  const mine = r.playerTeam;
  $('end-score').innerHTML = `<span style="color:${FRIENDLY_CSS}">${r.scores[mine]}</span> <span style="color:var(--ink-faint)">—</span> <span style="color:${ENEMY_CSS}">${r.scores[1 - mine]}</span>`;
  const mvp = r.mvp;
  $('end-mvp').textContent = `MVP  ${mvp.name.toUpperCase()}  ·  ${mvp.score} PTS  ·  ${mvp.kills}/${mvp.deaths}`;
  game.hud.renderScoreboard($('end-board'));
  $('again').firstElementChild.textContent = r.mode === 'local' ? 'PLAY AGAIN' : 'BACK TO LOBBY';
  setTimeout(() => { if (game.state === 'ended') showScreen('end'); }, 900);
  if (lobby.public && lobby.role === 'host') {
    clearTimeout(nextMatchT);
    nextMatchT = setTimeout(() => {
      if (!lobby.public || lobby.role !== 'host' || game.state !== 'ended') return;
      launch(publicSettings(), { mode: 'host', lobby }).then(() => { lobby.broadcastLobby(); syncOnlineFlags(); });
    }, 15000);
    game.hud.toast('NEXT PUBLIC MATCH IN 15 SECONDS');
  }
};
let nextMatchT = 0;
$('again').addEventListener('click', () => {
  if (lobby.active) { openLobby(); return; }
  launch(settings);
});
$('menu-btn').addEventListener('click', () => { leaveOnline(); game.quitToMenu(); writeForm(); showScreen('menu'); });

// ---------- online (peer-to-peer, 6-digit codes) ----------
// sandboxed previews can't open WebRTC/WebSocket connections; builds there set this flag
if (window.BREACHPOINT_OFFLINE) {
  document.querySelector('.online-row').style.display = 'none';
  document.querySelector('#pane-play .pane-note').textContent = 'Online play (6-digit codes) works on the GitHub Pages version of the game.';
}
const lobby = new Lobby(game);
lobby.account = account;
window.__lobby = lobby;
let joinCode = '';
let joinError = '';
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;
const teamName = (t) => (t === 0 ? 'SQUAD A' : 'SQUAD B');
// only touch the DOM when a list really changed, so buttons aren't swapped out under the cursor
const setHTML = (id, html) => { const el = $(id); if (el.__html !== html) { el.__html = html; el.innerHTML = html; } };

function syncOnlineFlags() {
  document.body.classList.toggle('online', lobby.active && game.mode !== 'local' && game.state !== 'menu');
  document.body.classList.toggle('is-host', lobby.role === 'host');
}

function leaveOnline() {
  if (lobby.active) lobby.close();
  syncOnlineFlags();
}

let quickIntro = false;
$('relay-test').addEventListener('click', async () => {
  const out = $('relay-status');
  out.className = ''; out.textContent = 'Testing…';
  await turnServers(true);
  out.textContent = turnStatus.detail;
  out.className = turnStatus.ok ? 'ok' : 'bad';
});
document.body.classList.toggle('has-relay', turnAvailable());
if (turnAvailable()) {
  document.getElementById('quick-ipnote').innerHTML = 'Quick match puts you in a game with strangers. Your connection goes through <b>Cloudflare\'s relay, so other players can\'t see your IP address</b>. Whoever hosts runs the match.';
}
function openLobby() {
  readAll();
  joinError = '';
  showScreen('lobby');
  renderLobby();
}

function readAll() {
  for (const [id, key, type] of bindings) readField(id, key, type);
  saveSettings(settings);
  lobby.privateRelay = !!settings.privateRelay;
}

function playerRow(p, actions) {
  return `<div class="prow t${p.team}"><span class="pn">${esc(p.name)}${p.tag ? ` <span class="pt">${p.tag}</span>` : ''}</span>
    <span class="pt">${teamName(p.team)}</span>${p.ping !== undefined ? `<span class="pp">${p.ping ? p.ping + ' ms' : '—'}</span>` : ''}${actions || ''}</div>`;
}

function renderLobby() {
  syncOnlineFlags();
  if (screen !== 'lobby') return;
  const host = lobby.role === 'host';
  const inMatch = host && game.mode === 'host' && game.live;
  $('lobby-host').classList.toggle('on', host && !quickIntro);
  $('lobby-join').classList.toggle('on', !host && !quickIntro);
  $('lobby-quickintro').classList.toggle('on', quickIntro);
  $('lobby-title').textContent = quickIntro || lobby.quickMode || lobby.public ? 'QUICK MATCH' : host ? 'HOSTING' : 'JOIN MATCH';
  $('opt-approve').closest('.row').style.display = lobby.public ? 'none' : '';
  $('code-slots').style.display = lobby.quickMode && !lobby.code ? 'none' : '';
  const quickish = quickIntro || lobby.quickMode || lobby.public;
  $('join-label').textContent = quickish ? 'PUBLIC MATCH' : 'ENTER MATCH CODE';
  $('lobby-hints').style.visibility = quickish ? 'hidden' : '';
  const cn = $('conn-note');
  cn.textContent = !lobby.active || quickIntro ? '' : lobby.net.relayed ? '● Connected through Cloudflare relay: your IP address is hidden' : lobby.net.room ? 'Direct peer-to-peer connection' : '';
  cn.classList.toggle('hidden-ip', !!lobby.net.relayed);
  if (quickIntro) { $('lobby-leave').textContent = 'BACK'; return; }
  if (host) {
    $('host-code').textContent = fmtCode(lobby.code);
    $('opt-approve').checked = lobby.approval;
    const pend = [...lobby.pending.values()];
    $('pending-wrap').style.display = pend.length || lobby.approval ? '' : 'none';
    setHTML('pending-list', pend.length
      ? pend.map(p => `<div class="prow req"><span class="pn">${esc(p.name)}</span><span class="pt">${esc(WEAPONS[parseLoadout(p.primary).primary].short)}</span>
          <button class="ok" data-accept="${esc(p.peerId)}" data-nav>ACCEPT</button><button data-deny="${esc(p.peerId)}" data-nav>DENY</button></div>`).join('')
      : '<div class="empty">No one is waiting. Share the code above.</div>');
    const swap = (id) => (inMatch ? '' : `<button data-swap="${esc(id)}" data-nav title="Switch team">⇄</button>`);
    const rows = [playerRow({ name: myName() || 'Operator', team: lobby.hostTeam, tag: 'HOST (YOU)' }, swap('host'))];
    for (const p of lobby.players.values()) rows.push(playerRow(p, swap(p.peerId) + `<button class="warn" data-kick="${esc(p.peerId)}" data-nav>KICK</button>`));
    setHTML('host-players', rows.join(''));
    $('host-count').textContent = `${lobby.players.size + 1}/${MAX_HUMANS}`;
    $('lobby-start').style.display = inMatch ? 'none' : '';
    $('lobby-back').style.display = inMatch ? '' : 'none';
    $('host-note').textContent = inMatch
      ? 'Players you accept now drop straight into the match, taking a bot\'s place.'
      : `${(MODES[settings.mode] || MODES.tdm).name} · ${MAPS[settings.map] ? MAPS[settings.map].name : 'Random map'} · ${settings.mode === 'gunfight' ? '2v2' : `${settings.teamSize}v${settings.teamSize}`}${settings.mode === 'tdm' || !settings.mode ? ` · ${settings.scoreLimit} kills · ${settings.timeLimit} min` : ''}${settings.friendlyFire ? ' · friendly fire' : ''}. Change these on the Play tab; bots fill empty slots.`;
    $('lobby-leave').textContent = inMatch ? 'END SESSION' : 'CLOSE LOBBY';
  } else {
    const slots = $('code-slots').querySelectorAll('i');
    const shown = lobby.role === 'guest' ? lobby.code : joinCode;
    slots.forEach((el, i) => { el.textContent = shown[i] || ''; el.classList.toggle('cur', lobby.role !== 'guest' && i === joinCode.length); });
    const busy = lobby.role === 'guest' || lobby.quickMode;
    $('keypad').querySelectorAll('button').forEach(b => { b.disabled = busy || (b.dataset.key === 'go' && joinCode.length !== 6); });
    $('keypad').style.display = busy ? 'none' : '';
    const st = $('join-status');
    st.className = 'join-status';
    let html = '';
    if (joinError) { html = esc(joinError); st.classList.add('bad'); }
    else if (!busy) html = 'Ask the host for their 6-digit code.';
    else if (lobby.status === 'matching' || (lobby.quickMode && lobby.status === 'searching')) html = '<span class="spin"></span>Looking for an open public match…';
    else if (lobby.status === 'searching') html = '<span class="spin"></span>Looking for the match…';
    else if (lobby.status === 'pending') html = '<span class="spin"></span>Found it. Waiting for the host to let you in…';
    else if (lobby.status === 'accepted' || lobby.status === 'ingame') {
      st.classList.add('good');
      html = lobby.hostInGame ? '<span class="spin"></span>Joining the match in progress…' : '<span class="spin"></span>You\'re in. Waiting for the host to start…';
    }
    setHTML('join-status', html);
    const ro = lobby.roster || [];
    $('join-players-wrap').style.display = ro.length ? '' : 'none';
    setHTML('join-players', ro.map(p => playerRow({ name: p.n, team: p.tm, tag: p.h ? 'HOST' : '' })).join(''));
    $('lobby-leave').textContent = busy ? 'LEAVE' : 'BACK';
  }
  if (game.input.lastDevice === 'pad' && !document.querySelector('#lobby .pad-focus')) focusFirst();
}
lobby.onUpdate = () => renderLobby();
lobby.onToast = (s) => game.hud.toast(s);

$('host-btn').addEventListener('click', () => {
  readAll();
  game.audio.init();
  lobby.host(myName(), loadoutFromSettings(settings));
  setMapHint();
  openLobby();
});
// ---------- quick match ----------
const ACK = 'breachpoint.publicAck.v1';
const acked = () => { try { return localStorage.getItem(ACK) === '1'; } catch (_) { return false; } };
function startQuick() {
  readAll();
  game.audio.init();
  quickIntro = false;
  joinError = '';
  lobby.quick(myName(), loadoutFromSettings(settings), settings.mode);
  showScreen('lobby');
  renderLobby();
}
$('quick-btn').addEventListener('click', () => {
  if (acked()) { startQuick(); return; }
  quickIntro = true;
  showScreen('lobby');
  renderLobby();
});
$('quick-go').addEventListener('click', () => { try { localStorage.setItem(ACK, '1'); } catch (_) { /* ignore */ } startQuick(); });
// public matches use fixed rules, but in the game mode you picked (players are matched by mode)
const publicSettings = () => ({ ...settings, ...PUBLIC_MATCH, mode: lobby.quickGm || settings.mode || 'tdm' });
lobby.onQuickHost = () => {
  launch(publicSettings(), { mode: 'host', lobby }).then(() => {
    syncOnlineFlags();
    game.hud.toast('NO OPEN MATCHES — YOU\'RE HOSTING. PLAYERS WILL DROP IN');
  });
};

$('join-btn').addEventListener('click', () => {
  readAll();
  if (!lobby.active) joinCode = '';
  openLobby();
});
$('opt-approve').addEventListener('change', (e) => lobby.setApproval(e.target.checked));
$('copy-code').addEventListener('click', () => copyText(lobby.code, 'CODE COPIED'));
$('copy-link').addEventListener('click', () => copyText(`${location.origin}${location.pathname}?join=${lobby.code}`, 'INVITE LINK COPIED'));
function copyText(text, done) {
  const ok = () => game.hud.toast(done);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => game.hud.toast(text));
  else game.hud.toast(text);
}
$('lobby').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.accept) lobby.accept(b.dataset.accept);
  else if (b.dataset.deny) lobby.deny(b.dataset.deny);
  else if (b.dataset.kick) lobby.kick(b.dataset.kick);
  else if (b.dataset.swap) lobby.swapTeam(b.dataset.swap);
  else if (b.dataset.key) keypad(b.dataset.key);
});
function keypad(k) {
  if (lobby.role === 'guest') return;
  joinError = '';
  if (k === 'del') joinCode = joinCode.slice(0, -1);
  else if (k === 'go') { tryJoin(); return; }
  else if (/^\d$/.test(k) && joinCode.length < 6) joinCode += k;
  game.audio.play('ui', null, { ui: true, freq: 2600 });
  renderLobby();
  if (joinCode.length === 6 && game.input.lastDevice === 'pad') focusEl($('keypad').querySelector('.go'));
}
function tryJoin() {
  if (joinCode.length !== 6) return;
  readAll();
  game.audio.init();
  joinError = '';
  lobby.join(joinCode, myName(), loadoutFromSettings(settings));
}
lobby.onMapHint = (id) => { if (MAPS[id] && id !== game.world.id) game.loadMap(id); };
const setMapHint = () => { lobby.mapHint = lobby.public ? '' : (MAPS[settings.map] ? settings.map : ''); };
$('lobby-start').addEventListener('click', () => {
  readAll();
  clearTimeout(nextMatchT);
  launch(lobby.public ? publicSettings() : settings, { mode: 'host', lobby }).then(() => { lobby.broadcastLobby(); syncOnlineFlags(); });
});
$('lobby-back').addEventListener('click', () => showScreen('pause'));
$('lobby-leave').addEventListener('click', () => {
  if (quickIntro) { quickIntro = false; showScreen('menu'); return; }
  const wasPlaying = game.state !== 'menu';
  leaveOnline();
  if (wasPlaying) game.quitToMenu();
  writeForm();
  showScreen('menu');
});
$('pause-lobby').addEventListener('click', () => openLobby());
confirmBtn($('pause-end'), () => game.endMatch());

lobby.onStart = (m) => {
  launch(settings, { mode: 'guest', lobby, start: m }).then(() => syncOnlineFlags(), (err) => {
    console.error(err);
    lobby.close('The host sent a match this version can\'t load.');
  });
};
lobby.onClosed = (reason, wasPublic) => {
  if (game.mode === 'guest' && game.state !== 'menu') game.quitToMenu();
  // a public host went away: find another match automatically
  if (wasPublic && /host closed|Lost connection/.test(reason)) {
    lobby.quick(myName(), loadoutFromSettings(settings), settings.mode);
    game.hud.toast('HOST LEFT — FINDING ANOTHER MATCH');
    showScreen('lobby');
    renderLobby();
    return;
  }
  syncOnlineFlags();
  joinError = reason;
  showScreen('lobby');
  renderLobby();
};

// digits typed on the join screen
window.addEventListener('keydown', (e) => {
  if (screen !== 'lobby' || lobby.role === 'host' || game.input.enabled || sideOpen) return;
  if (/^\d$/.test(e.key)) keypad(e.key);
  else if (e.key === 'Backspace') keypad('del');
  else if (e.key === 'Enter') { e.preventDefault(); tryJoin(); }
});
window.addEventListener('paste', (e) => {
  if (screen !== 'lobby' || lobby.role || sideOpen) return;
  const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
  if (digits) { joinCode = digits; joinError = ''; renderLobby(); }
});
for (const ev of ['beforeunload', 'pagehide']) window.addEventListener(ev, () => { if (lobby.active) lobby.close(); });

// re-capture the mouse if lock was lost without pausing
$('app').addEventListener('click', () => {
  if (game.state === 'playing' && !game.input.locked && !game.input.isTouch && game.input.lastDevice !== 'pad') game.input.lock();
});

// ---------- controller / keyboard menu navigation ----------
// controller / keyboard dropdown for <select> (mouse and touch get the browser's own list)
let dd = null;
function openDropdown(sel) {
  closeDropdown();
  const r = sel.getBoundingClientRect();
  dd = document.createElement('div');
  dd.className = 'dd';
  dd.sel = sel;
  dd.innerHTML = [...sel.options].map((o, i) => `<button data-i="${i}" class="${i === sel.selectedIndex ? 'on' : ''}">${esc(o.textContent)}</button>`).join('');
  document.body.appendChild(dd);
  const h = dd.offsetHeight;
  dd.style.left = `${Math.max(8, Math.min(r.left, innerWidth - dd.offsetWidth - 8))}px`;
  dd.style.minWidth = `${r.width}px`;
  dd.style.top = `${r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)}px`;
  dd.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pickDropdown(+b.dataset.i); });
  focusEl(dd.children[sel.selectedIndex] || dd.children[0]);
}
function pickDropdown(i) {
  const sel = dd.sel;
  closeDropdown();
  if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change')); }
  focusEl(sel);
}
function closeDropdown() { if (dd) { dd.remove(); dd = null; } }
document.addEventListener('pointerdown', (e) => { if (dd && !dd.contains(e.target)) closeDropdown(); });

function navItems() {
  const scr = sideOpen ? $('side') : screen ? $(screen) : null;
  if (!scr) return [];
  return [...scr.querySelectorAll('[data-nav]')].filter(el => el.offsetParent !== null && !el.closest('.tabs'));
}
function focusEl(el) {
  document.querySelectorAll('.pad-focus').forEach(e => e.classList.remove('pad-focus'));
  document.querySelectorAll('.pad-row').forEach(e => e.classList.remove('pad-row'));
  if (!el) return;
  el.classList.add('pad-focus');
  el.closest('.row')?.classList.add('pad-row');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}
function focusFirst() {
  const items = navItems();
  const pref = sideOpen ? (account.signedIn ? ($('sd-req').querySelector('[data-nav]') || $('sd-friends').querySelector('[data-nav]') || $('sd-add-in')) : $('sd-email'))
    : screen === 'mode' ? $(playMode === 'online' ? 'mode-online' : 'mode-offline')
    : screen === 'signin' ? document.querySelector('#signin .si-step.on input')
    : screen === 'feedback' ? document.querySelector('[data-fb].on')
    : screen === 'menu' ? (tab === 'play' ? $(playMode === 'online' ? 'quick-btn' : 'play') : document.querySelector(`#pane-${tab} [data-nav]`))
    : screen === 'pause' ? (pauseSec === 'match' ? $('resume') : document.querySelector(`#psec-${pauseSec} [data-nav]`))
    : screen === 'lobby' ? (lobby.role === 'host' ? ($('lobby-start').offsetParent ? $('lobby-start') : $('lobby-back')) : lobby.role === 'guest' ? $('lobby-leave') : $('keypad').querySelector('[data-key="1"]'))
    : $('again');
  focusEl(items.includes(pref) && pref.offsetParent ? pref : items[0]);
}
function cycleSelect(el, d) {
  const n = el.options.length;
  el.selectedIndex = Math.max(0, Math.min(n - 1, el.selectedIndex + d));
  el.dispatchEvent(new Event('change'));
}
function stepRange(el, d) {
  if (d > 0) el.stepUp(); else el.stepDown();
  el.dispatchEvent(new Event('input'));
}
// spatial navigation: the nearest item in the pressed direction (BO2 style lists and grids)
function spatial(el, items, dir, strict = true) {
  if (!el) return null;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const it of items) {
    if (it === el) continue;
    const q = it.getBoundingClientRect();
    if (!q.width && !q.height) continue;
    const qx = q.left + q.width / 2, qy = q.top + q.height / 2;
    let along, across;
    if (dir === 'up') { along = r.top - q.bottom + 1; across = Math.max(0, Math.max(q.left - r.right, r.left - q.right)); if (q.bottom > r.top + r.height * 0.5 || qy >= cy - 2) continue; }
    else if (dir === 'down') { along = q.top - r.bottom + 1; across = Math.max(0, Math.max(q.left - r.right, r.left - q.right)); if (q.top < r.bottom - r.height * 0.5 || qy <= cy + 2) continue; }
    else if (dir === 'left') { along = r.left - q.right + 1; across = Math.max(0, Math.max(q.top - r.bottom, r.top - q.bottom)); if (q.right > r.left + Math.min(r.width * 0.5, 40) || qx >= cx - 2) continue; }
    else { along = q.left - r.right + 1; across = Math.max(0, Math.max(q.top - r.bottom, r.top - q.bottom)); if (q.left < r.right - Math.min(r.width * 0.5, 40) || qx <= cx + 2) continue; }
    if (strict && (dir === 'left' || dir === 'right') && across > 0) continue;   // same row first
    const score = Math.max(0, along) + across * 3 + (dir === 'up' || dir === 'down' ? Math.abs(qx - cx) * 0.05 : Math.abs(qy - cy) * 0.3);
    if (score < bestScore) { bestScore = score; best = it; }
  }
  if (!best && strict && (dir === 'left' || dir === 'right') && r.width < window.innerWidth * 0.3) return spatial(el, items, dir, false);
  return best;
}
const PAUSE_SECS = ['match', 'loadout', 'options'];
game.input.onNav = (dir) => {
  if (!screen) return;
  if (screen === 'title') { if (dir === 'accept' || dir === 'start') titleGo(); return; }
  if (screen === 'loading') return;
  if (dd) {
    const items = [...dd.children], cur = items.indexOf(document.querySelector('.dd .pad-focus'));
    if (dir === 'up' || dir === 'down') { const n = items[Math.max(0, Math.min(items.length - 1, cur + (dir === 'down' ? 1 : -1)))]; if (n) { focusEl(n); game.audio.play('ui', null, { ui: true, freq: 2600 }); } }
    else if (dir === 'accept') { pickDropdown(Math.max(0, cur)); game.audio.play('ui', null, { ui: true }); }
    else if (dir === 'back' || dir === 'left' || dir === 'right') { const sel = dd.sel; closeDropdown(); focusEl(sel); }
    return;
  }
  if (dir === 'alt') { toggleSide(); return; }
  if (sideOpen && dir === 'back') { closeSide(); return; }
  if (sideOpen && (dir === 'start' || dir === 'prevTab' || dir === 'nextTab')) return;
  const items = navItems();
  const el = document.activeElement && items.includes(document.activeElement) ? document.activeElement : (document.querySelector('.pad-focus') && items.includes(document.querySelector('.pad-focus')) ? document.querySelector('.pad-focus') : null);
  const tick = () => game.audio.play('ui', null, { ui: true, freq: 2600 });
  const go = (d) => {
    if (!el) { focusFirst(); return; }
    let to = spatial(el, items, d);
    if (!to && (d === 'up' || d === 'down')) { const i = items.indexOf(el); to = items[i + (d === 'down' ? 1 : -1)] || null; }
    if (to) { focusEl(to); tick(); }
  };
  switch (dir) {
    case 'up': case 'down': go(dir); break;
    case 'left': case 'right': {
      const d = dir === 'left' ? -1 : 1;
      // value controls change with left/right; everything else moves to its neighbour. Tabs are LB / RB only.
      if (el && el.tagName === 'SELECT') { cycleSelect(el, d); tick(); }
      else if (el && el.type === 'range') { stepRange(el, d); tick(); }
      else if (el && el.type === 'checkbox') { if (el.checked !== d > 0) { el.checked = d > 0; el.dispatchEvent(new Event('change')); tick(); } }
      else go(dir);
      break;
    }
    case 'accept':
      if (!el) { focusFirst(); break; }
      if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
      else if (el.tagName === 'SELECT') openDropdown(el);
      else if ((el.tagName === 'INPUT' && el.type !== 'range') || el.tagName === 'TEXTAREA') { el.focus(); break; }
      else if (el.tagName === 'INPUT') break;
      else el.click();
      game.audio.play('ui', null, { ui: true });
      break;
    case 'back':
      if (screen === 'pause' && pauseSec !== 'match') { setPauseSec('match'); focusEl(document.querySelector('.psec[data-sec="match"]')); }
      else if (screen === 'pause') game.resume();
      else if (screen === 'menu' && tab !== 'play') { setTab('play'); focusFirst(); }
      else if (screen === 'menu') openMode();
      else if (screen === 'mode') { showScreen('title'); }
      else if (screen === 'signin') $('si-back').click();
      else if (screen === 'feedback') closeFeedback();
      else if (screen === 'end') $('menu-btn').click();
      else if (screen === 'lobby') {
        if (game.mode === 'host' && game.live) showScreen('pause');
        else if (lobby.role !== 'guest' && joinCode.length) keypad('del');
        else $('lobby-leave').click();
      }
      break;
    case 'start':
      if (screen === 'pause') game.resume();
      else if (screen === 'menu') { if (playMode === 'online') $('quick-btn').click(); else deploy(); }
      else if (screen === 'end') $('again').click();
      else if (screen === 'lobby' && lobby.role === 'host' && $('lobby-start').offsetParent) $('lobby-start').click();
      else if (screen === 'lobby' && !lobby.role) tryJoin();
      break;
    case 'prevTab': case 'nextTab': {
      const step = dir === 'nextTab' ? 1 : -1;
      if (screen === 'menu') {
        const i = TABS.indexOf(tab);
        setTab(TABS[(i + step + TABS.length) % TABS.length]);
        focusFirst();
      } else if (screen === 'pause') {
        const i = PAUSE_SECS.indexOf(pauseSec);
        setPauseSec(PAUSE_SECS[(i + step + PAUSE_SECS.length) % PAUSE_SECS.length]);
        game.audio.play('ui', null, { ui: true });
        focusFirst();
      }
      break;
    }
    default: break;
  }
};
window.addEventListener('keydown', (e) => {
  if (!screen || game.input.enabled) return;
  const ae = document.activeElement;
  const typing = ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type !== 'range' && ae.type !== 'checkbox'));
  if (e.key === 'Escape') { e.preventDefault(); game.input.onNav('back'); }
  else if (!typing && (e.key === 'f' || e.key === 'F') && !e.repeat && !e.ctrlKey && !e.metaKey && screen !== 'title') { e.preventDefault(); toggleSide(); }
  else if (!typing && screen !== 'title' && ARROWS[e.key]) { e.preventDefault(); if (!document.querySelector('.pad-focus') && document.activeElement && document.activeElement.matches('[data-nav]')) focusEl(document.activeElement); game.input.onNav(ARROWS[e.key]); }
  else if (!typing && (screen === 'menu' || screen === 'pause') && (e.key === 'q' || e.key === 'Q')) game.input.onNav('prevTab');
  else if (!typing && (screen === 'menu' || screen === 'pause') && (e.key === 'e' || e.key === 'E')) game.input.onNav('nextTab');
});

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

// ---------- title screen ----------
function titleGo() {
  if (screen !== 'title') return;
  game.audio.init();
  game.audio.play('ui', null, { ui: true });
  openMode();
}
$('title').addEventListener('click', titleGo);
window.addEventListener('keydown', (e) => {
  if (screen !== 'title' || e.repeat || ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  titleGo();
});

// ---------- offline / online ----------
function openMode() {
  if (lobby.active) leaveOnline();
  syncAccount();
  showScreen('mode');
}
function setPlayMode(m) {
  playMode = m;
  document.body.classList.toggle('mode-online', m === 'online');
  document.body.classList.toggle('mode-offline', m !== 'online');
  const nm = myName() || 'Operator';
  $('mode-chip').innerHTML = `<span class="pc-emb">${esc(nm.slice(0, 1).toUpperCase())}</span><span class="pc-txt"><b>${esc(nm.toUpperCase())}</b><small><i></i>${m === 'online' ? 'ONLINE · MULTIPLAYER' : 'OFFLINE · COMBAT TRAINING'}</small></span>`;
  $('menu-title').textContent = m === 'online' ? 'MULTIPLAYER' : 'COMBAT TRAINING';
  $('menu-subtitle').textContent = m === 'online' ? (onlineName() ? `ONLINE · SIGNED IN AS ${onlineName().toUpperCase()}` : 'ONLINE · PEER-TO-PEER') : 'OFFLINE · VERSUS BOTS';
  const mn = (MODES[settings.mode] || MODES.tdm).name.toUpperCase();
  $('play-title').textContent = m === 'online' ? `ONLINE · ${mn}` : mn;
  $('opt-name').value = myName();
  renderHints(game.input.lastDevice);
}
function enterMenu(m) {
  setPlayMode(m);
  writeForm();
  setTab('play');
  showScreen('menu');
}
$('mode-offline').addEventListener('click', () => enterMenu('offline'));
$('mode-online').addEventListener('click', () => {
  if (window.BREACHPOINT_OFFLINE) { game.hud.toast('ONLINE PLAY WORKS ON BREACH-POINT.NET'); return; }
  if (!account.ready) { setPlayMode('online'); openSignin(); return; }
  enterMenu('online');
});
$('mode-chip').addEventListener('click', () => openMode());

// account state shown around the menus
function syncAccount() {
  const u = account.signedIn ? account.user : null;
  document.body.classList.toggle('has-account', !!u);
  $('acct-email').textContent = u ? u.email : '';
  $('title-acct').textContent = u && u.tag ? `Signed in as ${u.tag}` : '';
  $('mode-online-d').textContent = window.BREACHPOINT_OFFLINE ? 'Online play works on the full game at breach-point.net.' : !account.enabled
    ? 'Quick match with anyone, or a private 6-digit code for friends.'
    : u && u.tag ? `Quick match with anyone, or a private 6-digit code for friends. Playing as ${u.tag}.`
      : 'Quick match with anyone, or a private 6-digit code for friends. Sign in with your email, no password.';
  $('mode-acct').innerHTML = u ? `<span>Signed in as <b>${esc(u.tag || 'new player')}</b></span><button id="mode-out" class="menu-btn small" data-nav>SIGN OUT</button>` : '';
  if (u) $('mode-out').addEventListener('click', () => { account.signOut(); });
  if (screen === 'menu' || screen === 'pause') setPlayMode(playMode);
  syncNameNote();
  renderSide();
}
account.onChange = () => {
  syncAccount();
  // signed out while in the online menu: back to the mode screen
  if (!account.ready && playMode === 'online' && account.enabled && screen === 'menu') openMode();
  // the email link was opened in another tab while this one waits
  if (screen === 'signin' && account.signedIn && siCur === 'sent') signedIn();
  heartbeat();
};
$('acct-out').addEventListener('click', () => account.signOut());
confirmBtn($('acct-del'), async () => {
  try { await account.deleteAccount(); game.hud.toast('ACCOUNT DELETED'); } catch (e) { game.hud.toast(e.message.toUpperCase()); }
});

// online Name Tag changes go to the account server (once a day)
const untilText = (t) => {
  const mins = Math.max(1, Math.ceil((t - Date.now() / 1000) / 60)), h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};
function syncNameNote() {
  const u = account.signedIn ? account.user : null;
  const wait = u && u.nextTagAt && u.nextTagAt > Date.now() / 1000;
  $('opt-name-note').textContent = playMode === 'online' && account.enabled && u ? (wait ? `You can change it again in ${untilText(u.nextTagAt)}` : 'Everyone sees this. Changes once a day.') : '';
}
async function changeTag(want, el) {
  want = want.trim();
  if (!want || want === account.tag) { if (el) el.value = account.tag; return false; }
  try {
    await account.setTag(want);
    game.hud.toast(`NAME TAG IS NOW ${account.tag.toUpperCase()}`);
    return true;
  } catch (e) {
    game.hud.toast((e.nextTagAt ? `NAME TAG CAN CHANGE AGAIN IN ${untilText(e.nextTagAt)}` : e.message).toUpperCase());
    if (el) el.value = account.tag;
    return false;
  } finally { syncNameNote(); }
}
$('opt-name').addEventListener('change', async () => {
  if (!onlineName()) return;
  const el = $('opt-name');
  await changeTag(el.value, el);
  el.value = myName();
  setPlayMode(playMode);
});

// ---------- sign in (email link only) ----------
let siCur = 'email', afterSignin = null;
function siStep(st) {
  siCur = st;
  document.querySelectorAll('.si-step').forEach(el => el.classList.toggle('on', el.id === `si-${st}`));
  $('si-title').textContent = st === 'name' ? 'YOUR NAME TAG' : st === 'sent' ? 'CHECK YOUR EMAIL' : 'SIGN IN';
  $('si-back').textContent = st === 'name' ? 'SIGN OUT' : 'BACK';
  siStatus('');
  const inp = document.querySelector(`#si-${st} input`);
  if (st === 'name') inp.value = account.tag || (settings.name !== 'Operator' ? settings.name : '');
  if (inp && game.input.lastDevice !== 'touch' && game.input.lastDevice !== 'pad') setTimeout(() => inp.focus({ preventScroll: true }), 30);
  if (game.input.lastDevice === 'pad') setTimeout(() => focusFirst(), 0);
}
function siStatus(html, cls) { const el = $('si-status'); el.className = 'join-status' + (cls ? ' ' + cls : ''); el.innerHTML = html; }
let siBusyNow = false;
function siBusy(b) { siBusyNow = b; document.querySelectorAll('#signin .cta, #signin input, #signin .menu-btn.small').forEach(x => { x.disabled = b; }); }
function openSignin() {
  if (sideOpen) closeSide();
  showScreen('signin');
  siStep(account.signedIn && !account.tag ? 'name' : 'email');
}
function signedIn() {
  if (!account.tag) { if (screen !== 'signin') showScreen('signin'); siStep('name'); return; }
  game.hud.toast(`SIGNED IN AS ${account.tag.toUpperCase()}`);
  const next = afterSignin;
  afterSignin = null;
  enterMenu('online');
  if (next) next();
}
// shared by the sign-in screen and the sidebar
async function sendLink(email, remember, status) {
  email = email.trim();
  if (!email) { status('Enter your email address.', 'bad'); return false; }
  status('<span class="spin"></span>Sending…');
  try {
    const r = await account.start(email, remember);
    if (r.devToken) console.info('[dev] sign-in link', `${location.origin}${location.pathname}#login=${r.devToken}`);
    return true;
  } catch (e) { status(esc(e.message), 'bad'); return false; }
}
async function siSend() {
  if (siBusyNow) return;
  siBusy(true);
  const email = $('si-email-in').value;
  const ok = await sendLink(email, $('si-remember').checked, siStatus);
  siBusy(false);
  if (ok) { siStep('sent'); $('si-to').textContent = email.trim(); }
}
async function siName() {
  if (siBusyNow) return;
  const name = $('si-name-in').value.trim();
  siBusy(true);
  siStatus('<span class="spin"></span>Saving…');
  try { await account.setTag(name); siBusy(false); signedIn(); }
  catch (e) { siBusy(false); siStatus(esc(e.message), 'bad'); }
}
$('si-send').addEventListener('click', siSend);
$('si-name-save').addEventListener('click', siName);
$('si-resend').addEventListener('click', () => { $('si-email-in').value = account.email; siSend(); });
$('si-other').addEventListener('click', () => siStep('email'));
$('si-back').addEventListener('click', () => {
  if (siCur === 'name') account.signOut();
  afterSignin = null;
  openMode();
});
for (const [inp, fn] of [['si-email-in', siSend], ['si-name-in', siName]]) {
  $(inp).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
}
// the safety warning shows while "Remember me" is ticked
for (const [cb, warn] of [['si-remember', 'si-warn'], ['sd-remember', 'sd-warn']]) {
  const sync = () => $(warn).classList.toggle('on', $(cb).checked);
  $(cb).addEventListener('change', sync);
  sync();
}

// ---------- social sidebar (Y on a controller, F on a keyboard): account, Name Tag, friends ----------
function openSide() {
  if (sideOpen || !sideAllowed()) return;
  sideOpen = true;
  sideFocusBack = document.querySelector('.pad-focus');
  document.body.classList.add('side-open');
  $('side').setAttribute('aria-hidden', 'false');
  game.audio.play('ui', null, { ui: true });
  renderSide();
  if (account.signedIn) account.loadFriends().catch(() => {});
  if (game.input.lastDevice === 'pad') focusFirst();
}
function closeSide() {
  if (!sideOpen) return;
  sideOpen = false;
  document.body.classList.remove('side-open');
  $('side').setAttribute('aria-hidden', 'true');
  if (document.activeElement && $('side').contains(document.activeElement)) document.activeElement.blur();
  if (game.input.lastDevice === 'pad') { if (sideFocusBack && sideFocusBack.offsetParent) focusEl(sideFocusBack); else focusFirst(); }
  else focusEl(null);
}
const toggleSide = () => (sideOpen ? closeSide() : openSide());
$('side-btn').addEventListener('click', openSide);
// about / support
const openLink = (url) => { try { window.open(url, '_blank', 'noopener'); } catch (_) { location.href = url; } };
$('feedback-btn').addEventListener('click', () => openFeedback());

// ---------- feedback form ----------
let fbFrom = 'menu', fbKind = 'feature', fbBusy = false;
function fbStatus(html, cls) { const el = $('fb-status'); el.className = 'join-status' + (cls ? ' ' + cls : ''); el.innerHTML = html; }
function setFbKind(k) {
  fbKind = k;
  document.querySelectorAll('[data-fb]').forEach(b => { const on = b.dataset.fb === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
}
function openFeedback(kind) {
  if (sideOpen) closeSide();
  fbFrom = screen || 'menu';
  if (kind) setFbKind(kind);
  fbStatus('');
  $('fb-send').disabled = false;
  showScreen('feedback');
  if (game.input.lastDevice !== 'touch' && game.input.lastDevice !== 'pad') setTimeout(() => $('fb-text').focus({ preventScroll: true }), 30);
}
function closeFeedback() {
  const to = fbFrom === 'feedback' ? 'menu' : fbFrom;
  showScreen(to);
  if (to === 'pause') setPauseSec('options');      // the options panel was put back while the form was open
  else if (to === 'menu') setTab('options');
}
document.querySelectorAll('[data-fb]').forEach(b => b.addEventListener('click', () => { setFbKind(b.dataset.fb); game.audio.play('ui', null, { ui: true }); }));
$('fb-text').addEventListener('input', () => { $('fb-count').textContent = `${$('fb-text').value.length} / 2000`; });
$('fb-back').addEventListener('click', closeFeedback);
$('fb-send').addEventListener('click', async () => {
  if (fbBusy) return;
  const text = $('fb-text').value.trim();
  if (text.length < 10) { fbStatus('Write a little more (at least 10 characters).', 'bad'); return; }
  fbBusy = true; $('fb-send').disabled = true;
  fbStatus('<span class="spin"></span>Sending…');
  try {
    await account.sendFeedback({
      kind: fbKind, text, contact: $('fb-contact').value.trim(),
      device: game.input.lastDevice || '', mode: (game.settings && game.state !== 'menu' ? game.settings.mode : settings.mode) || '',
      map: game.world ? game.world.id : '', screen: fbFrom, ua: navigator.userAgent,
    });
    $('fb-text').value = ''; $('fb-contact').value = ''; $('fb-count').textContent = '0 / 2000';
    fbStatus('Thanks! Your message was sent.', 'good');
    game.hud.toast('FEEDBACK SENT · THANK YOU');
    setTimeout(() => { if (screen === 'feedback') closeFeedback(); }, 1600);
  } catch (e) { fbStatus(esc(e.message), 'bad'); $('fb-send').disabled = false; }
  fbBusy = false;
});
$('coffee-btn').addEventListener('click', () => openLink('https://buymeacoffee.com/breachpoint'));
$('side-scrim').addEventListener('click', closeSide);
$('sd-close').addEventListener('click', closeSide);

const MODE_SHORT = { tdm: 'TDM', gunfight: 'Gunfight', snd: 'Search & Destroy' };
function friendStatus(f) {
  if (!f.online) return 'Offline';
  const where = [MODE_SHORT[f.mode] || '', MAPS[f.map] ? MAPS[f.map].name : ''].filter(Boolean).join(' · ');
  if (f.state === 'match') return `In a ${f.pub ? 'public' : 'private'} match${where ? ' · ' + where : ''}`;
  if (f.state === 'lobby') return `In a ${f.pub ? 'public' : 'private'} lobby${where ? ' · ' + where : ''}`;
  return 'Online · in the menus';
}
function renderSide() {
  const on = account.enabled && !window.BREACHPOINT_OFFLINE;
  const u = account.signedIn ? account.user : null;
  $('sd-off').style.display = on ? 'none' : '';
  $('sd-in').style.display = on && !u ? '' : 'none';
  $('sd-me').style.display = on && u ? '' : 'none';
  const d = account.friends;
  const online = d.friends.filter(f => f.online).length;
  $('sb-on').textContent = u && d.friends.length ? `${online} ONLINE` : u ? '' : on ? 'SIGN IN' : '';
  $('sb-req').textContent = d.incoming.length ? String(d.incoming.length) : '';
  $('sd-sub').textContent = u ? `${online} OF ${d.friends.length} FRIENDS ONLINE` : 'FRIENDS · ACCOUNT';
  if (!u) return;
  $('sd-emb').textContent = (u.tag || '?').slice(0, 1).toUpperCase();
  $('sd-tag').textContent = (u.tag || 'Choose a Name Tag').toUpperCase();
  $('sd-acct').textContent = `${u.email} · ${account.remember ? 'remembered on this device' : 'signed in until you close the browser'}`;
  if (document.activeElement !== $('sd-tag-in')) $('sd-tag-in').value = u.tag || '';
  if (document.activeElement !== $('sd-disp-in')) $('sd-disp-in').value = u.disp || '';
  const wait = u.tag && u.nextTagAt && u.nextTagAt > Date.now() / 1000;
  $('sd-tag-note').textContent = (wait ? `You can change it again in ${untilText(u.nextTagAt)}.` : 'You can change it once a day.')
    + (u.hist && u.hist.length ? ` Friends can see your previous Name Tags: ${u.hist.slice(0, 3).join(', ')}.` : ' Friends can see your previous Name Tags.');
  $('sd-tag-save').textContent = u.tag ? 'CHANGE' : 'SAVE';
  $('sd-code').textContent = u.code || '––––-––––';
  // requests
  const req = d.incoming.map(r => `<div class="sd-row req"><span class="sd-dot"></span><span class="sd-n"><b>${esc(r.tag)}</b><small>wants to be friends</small></span>
      <button class="menu-btn small ok" data-fr="accept" data-id="${esc(r.id)}" data-nav>ACCEPT</button><button class="menu-btn small" data-fr="decline" data-id="${esc(r.id)}" data-nav>DECLINE</button></div>`)
    .concat(d.outgoing.map(r => `<div class="sd-row out"><span class="sd-dot"></span><span class="sd-n"><b>${esc(r.tag)}</b><small>request sent</small></span>
      <button class="menu-btn small" data-fr="cancel" data-id="${esc(r.id)}" data-nav>CANCEL</button></div>`));
  $('sd-req-wrap').style.display = req.length ? '' : 'none';
  setHTML('sd-req', req.join(''));
  // friends
  $('sd-fcount').textContent = d.friends.length ? `${online}/${d.friends.length} online` : '';
  const myJoin = lobby.active ? lobby.code : '';
  setHTML('sd-friends', d.friends.length ? d.friends.map(f => {
    const canJoin = f.online && f.join && f.join !== myJoin && (f.state === 'lobby' || f.state === 'match');
    return `<div class="sd-row ${f.online ? 'on' : 'off'}"><span class="sd-dot"></span>
      <span class="sd-n"><b>${esc(f.tag)}</b>${f.disp ? `<i>${esc(f.disp)}</i>` : ''}<small>${esc(friendStatus(f))}</small>${f.hist.length ? `<small class="sd-hist">Previously ${esc(f.hist.join(', '))}</small>` : ''}</span>
      ${canJoin ? `<button class="menu-btn small ok" data-join="${esc(f.join)}" data-nav>JOIN</button>` : ''}
      <button class="menu-btn small warn" data-fr="remove" data-id="${esc(f.id)}" data-nav title="Remove friend">✕</button></div>`;
  }).join('') : '<div class="sd-empty">No friends yet. Share your friend code, or enter a friend\'s code above.</div>');
}
account.onFriends = (d, fresh) => {
  renderSide();
  for (const r of fresh) game.hud.toast(`FRIEND REQUEST FROM ${String(r.tag).toUpperCase()}`);
};

// signed out: send the link from the sidebar
let sdBusy = false;
function sdStatus(html, cls) { const el = $('sd-in-status'); el.className = 'join-status' + (cls ? ' ' + cls : ''); el.innerHTML = html; }
async function sdSend() {
  if (sdBusy) return;
  sdBusy = true;
  const email = $('sd-email').value;
  if (await sendLink(email, $('sd-remember').checked, sdStatus)) sdStatus(`Sign-in link sent to <b>${esc(email.trim())}</b>. Open it on this device. It works once, for 15 minutes.`, 'good');
  sdBusy = false;
}
$('sd-send').addEventListener('click', sdSend);
$('sd-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sdSend(); } });

// signed in
$('sd-tag-save').addEventListener('click', async () => {
  if (!account.tag) { try { await account.setTag($('sd-tag-in').value.trim()); game.hud.toast(`NAME TAG IS NOW ${account.tag.toUpperCase()}`); } catch (e) { game.hud.toast(e.message.toUpperCase()); } return; }
  if (await changeTag($('sd-tag-in').value, $('sd-tag-in'))) setPlayMode(playMode);
});
$('sd-disp-save').addEventListener('click', async () => {
  try { await account.setDisplay($('sd-disp-in').value.trim()); game.hud.toast(account.user.disp ? 'DISPLAY NAME SAVED · ONLY FRIENDS SEE IT' : 'DISPLAY NAME REMOVED'); }
  catch (e) { game.hud.toast(e.message.toUpperCase()); }
});
$('sd-code-copy').addEventListener('click', () => account.user && copyText(account.user.code, 'FRIEND CODE COPIED'));
function addStatus(html, cls) { const el = $('sd-add-status'); el.className = 'join-status' + (cls ? ' ' + cls : ''); el.innerHTML = html; }
$('sd-add-in').addEventListener('input', (e) => {
  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  e.target.value = v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v;
});
async function sdAdd() {
  const code = $('sd-add-in').value;
  if (code.replace(/[^A-Z0-9]/gi, '').length !== 8) { addStatus('Friend codes have 8 letters and numbers, like ABCD-2345.', 'bad'); return; }
  addStatus('<span class="spin"></span>Sending…');
  try {
    const r = await account.addFriend(code);
    $('sd-add-in').value = '';
    addStatus(r.friends ? 'You\'re now friends.' : 'Friend request sent.', 'good');
  } catch (e) { addStatus(esc(e.message), 'bad'); }
}
$('sd-add').addEventListener('click', sdAdd);
$('sd-add-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sdAdd(); } });
for (const id of ['sd-tag-in', 'sd-disp-in']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $(id.replace('-in', '-save')).click(); } });
$('sd-out').addEventListener('click', () => { account.signOut(); game.hud.toast('SIGNED OUT'); });
$('side').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.join) { joinFriend(b.dataset.join); return; }
  if (!b.dataset.fr) return;
  if (b.dataset.fr === 'remove' && !b.classList.contains('confirm')) {
    // remove asks twice
    b.classList.add('confirm'); b.textContent = 'REMOVE?';
    setTimeout(() => { if (b.isConnected) { b.classList.remove('confirm'); b.textContent = '✕'; } }, 2500);
    return;
  }
  const focusIdx = [...$('side').querySelectorAll('[data-nav]')].indexOf(b);
  try { await account.friendAction(b.dataset.fr, b.dataset.id); }
  catch (err) { game.hud.toast(err.message.toUpperCase()); }
  if (game.input.lastDevice === 'pad' && sideOpen) {
    const items = navItems();
    focusEl(items[Math.min(focusIdx, items.length - 1)] || items[0]);
  }
});

// join a friend's match by its code (friends skip the host's approval)
function joinFriend(code) {
  if (!/^\d{6}$/.test(code)) return;
  closeSide();
  if (lobby.active && lobby.code === code) { openLobby(); return; }
  if (game.state !== 'menu') game.quitToMenu();
  leaveOnline();
  setPlayMode('online');
  writeForm();
  joinCode = code;
  readAll();
  game.audio.init();
  joinError = '';
  openLobby();
  tryJoin();
}

// presence: friends see you online and which match to join; a heartbeat every 45 s
let hbTimer = 0, hbLast = '';
function presenceNow() {
  const inMatch = game.state !== 'menu' && lobby.active;
  const st = inMatch ? 'match' : lobby.active && lobby.code ? 'lobby' : 'menu';
  const p = { state: st };
  if (st !== 'menu') {
    p.join = lobby.code;
    if (lobby.public) p.pub = 1;
    const cfg = lobby.public ? publicSettings() : settings;
    p.mode = (game.state !== 'menu' && game.settings && game.settings.mode) || cfg.mode;
    const mid = game.state !== 'menu' ? game.world.id : cfg.map;
    if (MAPS[mid]) p.map = mid;
  }
  return p;
}
function heartbeat(force = false) {
  clearTimeout(hbTimer);
  if (!account.enabled || !account.signedIn || window.BREACHPOINT_OFFLINE) return;
  hbTimer = setTimeout(() => heartbeat(true), 45000);
  if (document.hidden) return;
  const p = presenceNow(), k = JSON.stringify(p);
  if (!force && k === hbLast) return;
  hbLast = k;
  account.presence(p);
  // friends list: keep the online count and requests fresh (more often while the sidebar is open)
  account.loadFriends().catch(() => {});
}
setInterval(() => {
  if (!account.signedIn) return;
  if (sideOpen) account.loadFriends().catch(() => {});
  const k = JSON.stringify(presenceNow());
  if (k !== hbLast) heartbeat(true); // joined or left a lobby or match: tell friends right away
}, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(true); });
window.addEventListener('pagehide', () => account.presenceOff());

// ---------- device-aware hints ----------
function renderHints(device) {
  const hint = (act, text) => (device === 'touch' ? '' : `<span>${glyph(act, device)} ${text}</span>`);
  const kb = (keys, text) => `<span>${keys.map(k => `<kbd>${k}</kbd>`).join('')} ${text}</span>`;
  const bumpers = (text) => `<span>${glyph('prevTab', device)}${glyph('nextTab', device)} ${text}</span>`;
  $('menu-hints').innerHTML = device === 'pad'
    ? [hint('accept', 'Select'), hint('back', 'Back'), bumpers('Tabs'), hint('pause', playMode === 'online' ? 'Quick match' : 'Start match')].join('')
    : device === 'touch' ? '' : [kb(['↑', '↓'], 'Navigate'), kb(['Enter'], 'Select'), kb(['Q', 'E'], 'Tabs'), kb(['Esc'], 'Back')].join('');
  $('pause-hints').innerHTML = device === 'pad' ? [hint('accept', 'Select'), hint('back', 'Resume'), bumpers('Sections')].join('') : device === 'touch' ? '' : [kb(['Enter'], 'Select'), kb(['Q', 'E'], 'Sections'), kb(['Esc'], 'Resume')].join('');
  $('lobby-hints').innerHTML = device === 'pad' ? [hint('accept', 'Select'), hint('back', 'Back')].join('') : device === 'touch' ? '' : '<span><kbd>0</kbd>–<kbd>9</kbd> Code</span><span><kbd>Enter</kbd> Join</span>' + hint('back', 'Back');
  $('title-press').innerHTML = device === 'pad' ? `PRESS ${glyph('accept', 'pad')} TO START` : device === 'touch' ? 'TAP TO START' : 'PRESS <kbd>ENTER</kbd> TO START';
  $('mode-hints').innerHTML = device === 'pad' ? [hint('accept', 'Select'), hint('back', 'Back')].join('') : device === 'touch' ? '' : hint('back', 'Back');
  $('intel-input').textContent = device === 'pad' ? 'CONTROLLER' : device === 'touch' ? 'TOUCH' : 'KEYBOARD & MOUSE';
  game.hud.setDevice(device);
}
game.input.onDeviceChange = (d) => {
  renderHints(d);
  if (d === 'pad' && screen && !document.querySelector('.pad-focus')) focusFirst();
  if (d !== 'pad') focusEl(null);
};
game.input.onPadChange = (connected, id) => {
  const name = /xbox|xinput/i.test(id) ? 'XBOX CONTROLLER' : 'CONTROLLER';
  game.hud.toast(connected ? `${name} CONNECTED` : 'CONTROLLER DISCONNECTED');
  if (!connected && game.state === 'playing') game.pause();
};
document.addEventListener('mousemove', () => { if (screen) focusEl(null); }, { passive: true });

// ---------- menu intel map ----------
// Picking a map doesn't build it (that waits for the match); the preview shows the map's overhead
// view once it has been loaded at least once this session.
const mapShots = {};
function drawIntel() {
  const c = $('intel-map'), g = c.getContext('2d');
  if (game.world && game.minimap) {
    const k = document.createElement('canvas'); k.width = c.width; k.height = c.height;
    k.getContext('2d').drawImage(game.minimap.canvas, 0, 0, c.width, c.height);
    mapShots[game.world.id] = k;
  }
  const want = game.state === 'menu' ? settings.map : game.world.id;
  const shot = mapShots[want];
  g.clearRect(0, 0, c.width, c.height);
  if (shot) {
    g.drawImage(shot, 0, 0);
    g.fillStyle = 'rgba(79,179,255,0.25)'; g.fillRect(0, 0, c.width * 0.13, c.height);
    g.fillStyle = 'rgba(255,77,77,0.25)'; g.fillRect(c.width * 0.87, 0, c.width * 0.13, c.height);
  } else {
    g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(236,233,225,0.45)'; g.font = '600 18px Barlow Condensed, Arial Narrow, sans-serif'; g.textAlign = 'center';
    g.fillText(want === 'random' ? '? RANDOM MAP ?' : 'PREVIEW AFTER FIRST MATCH', c.width / 2, c.height / 2 + 6);
  }
  $('intel-mapname').textContent = (want === 'random' ? 'RANDOM' : MAPS[want] ? MAPS[want].name : game.world.name).toUpperCase();
}
game.onMapChange = () => drawIntel();
$('opt-map').addEventListener('change', () => {
  if (lobby.role === 'host') { setMapHint(); lobby.broadcastLobby(); }
  drawIntel();
});
if (MAPS[settings.map] && settings.map !== game.world.id) game.loadMap(settings.map);
drawIntel();

writeForm();
renderHints(game.input.lastDevice);
syncAccount();
{
  const inv = new URLSearchParams(location.search).get('join');
  if (loginToken && account.enabled) {
    // arrived from the sign-in email
    setPlayMode('online');
    openSignin();
    siBusy(true);
    siStatus('<span class="spin"></span>Signing you in…');
    account.verifyToken(loginToken).then(() => { siBusy(false); signedIn(); }, (e) => { siBusy(false); siStep('email'); siStatus(esc(e.message), 'bad'); });
  } else if (inv && /^\d{6}$/.test(inv)) {
    joinCode = inv;
    setPlayMode('online');
    if (account.ready) openLobby();
    else { afterSignin = () => openLobby(); openSignin(); }
  } else showScreen('title');
  account.refresh().then(() => heartbeat(true));
}
