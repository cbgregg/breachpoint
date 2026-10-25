// Entry point: menus (mouse, keyboard and controller navigable), settings persistence, game bootstrap
import { DEFAULT_SETTINGS, WEAPONS, PRIMARIES, SECONDARIES, FRIENDLY_CSS, ENEMY_CSS, PUBLIC_MATCH, presetGfx, GRENADE, coarse, gpuTier, probeGpu, QUALITY, wantsMsaa, EQUIPMENT, LETHALS, TACTICALS } from './config.js';
import { setupPadCal } from './padcal.js';
import { loadPadMaps } from './input.js';
import { MAPS } from './world.js';
import { Game, prewarmBotGuns } from './game.js';
import { glyph } from './hud.js';
import { loadAssets } from './assets.js';
import { Lobby, MAX_HUMANS, cleanName, PROTO, QUICK_MODES, QUICK_COUNTDOWN } from './online.js';
import { turnAvailable, turnServers, turnStatus } from './net.js';
import { loadoutFromSettings, parseLoadout, GUNSMITH, SLOTS, SLOT_NAMES, ATTACHMENTS, cleanAtt, weaponDef, attSummary } from './attachments.js';
import { GunPreview, gunThumb, thumbReady } from './gunsmith.js';
import { applyReticles, cleanReticles, reticlePreview, shapesFor, RET_COLORS, RET_OPTICS } from './reticles.js';
import { Account, takeLoginToken } from './account.js';
import { MODES } from './modes.js';
import { levelOf, emblemSVG } from './career.js';

const $ = (id) => document.getElementById(id);
const KEY = 'breachpoint.settings.v2';

let startCd = null; // private-match start countdown (see Start Match)
// Saved settings are checked on the way in: a value of the wrong type, out of range or from an old version
// (a NaN sensitivity spins the camera; a bad volume used to stop the game starting) falls back to its default.
const RANGES = { sensitivity: [0.05, 10], adsSens: [0.1, 3], padSensitivity: [0.1, 5], padDeadzone: [0, 0.5], adsZoom: [0.5, 1.6],
  fov: [60, 120], vmFov: [50, 100], volume: [0, 1], musicVolume: [0, 1], fsrSharp: [0, 100], fpsCap: [0, 1000], gfxRes: [25, 200],
  teamSize: [1, 12], scoreLimit: [1, 10000], timeLimit: [1, 120] };
function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  for (const [k, v] of Object.entries(raw)) {
    const d = DEFAULT_SETTINGS[k];
    if (d === undefined) { s[k] = v; continue; }       // extra keys (custom graphics, flags) are checked where they're used
    if (typeof d === 'number') {
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (!Number.isFinite(n)) continue;
      const r = RANGES[k]; s[k] = r ? Math.min(r[1], Math.max(r[0], n)) : n;
    } else if (typeof d === 'boolean') { if (typeof v === 'boolean') s[k] = v; }
    else if (typeof d === 'string') { if (typeof v === 'string' && v) s[k] = v; }
    else if (Array.isArray(d)) { if (Array.isArray(v) && v.length) s[k] = v; }
    else s[k] = v;
  }
  if (s.quality !== 'custom' && !QUALITY[s.quality]) s.quality = DEFAULT_SETTINGS.quality;
  return s;
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return cleanSettings(JSON.parse(raw));
  } catch (_) { /* storage unavailable, or the saved settings aren't readable */ }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
}
const settings = loadSettings();
// Safe mode: if the game didn't finish starting the last two times (or the page was opened with ?safe), start on
// the lightest graphics with the picture menu, and say so. Cleared once the menu is up.
const BOOTS = 'breachpoint.boots';
let safeMode = new URLSearchParams(location.search).has('safe');
try {
  const n = +localStorage.getItem(BOOTS) || 0;
  if (n >= 2) safeMode = true;
  localStorage.setItem(BOOTS, String(n + 1));
} catch (_) { /* private mode */ }
if (safeMode) {
  Object.assign(settings, { quality: coarse || probeGpu().soft ? 'mobile' : 'low', fsr: 'off', menuBg: 'picture', dynamicRes: true, fpsCap: 0 });
  saveSettings(settings);   // read again by the renderer before it starts
}
const bootDone = () => { try { localStorage.removeItem(BOOTS); } catch (_) { /* private mode */ } };
// phones and tablets move to the Mobile preset once (it didn't exist before; Low was the touch default)
if (coarse && !settings.mobileOffered) { settings.mobileOffered = 1; if (settings.quality === 'low' || !settings.quality) settings.quality = 'mobile'; saveSettings(settings); }
const applyTheme = () => { document.body.dataset.theme = settings.theme || 'amber'; };
applyTheme();
const account = new Account();
const loginToken = takeLoginToken(); // sign-in link opened: read and wipe it before anything else runs
let playMode = 'offline';            // chosen on the Offline / Online screen
// online with accounts on, your Name Tag is your account's; offline it's the local one
const onlineName = () => account.enabled && account.tag; // signed in: your Name Tag, online and offline
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
  'Upstairs at Freshway overlooks the aisles. Two stairs lead up: the one by the deli and the fire stair out back.',
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
if (new URLSearchParams(location.search).has('audit')) game.audit();   // the first map is built before any loadMap
game.applySettings(settings);

// ---------- form binding ----------
const bindings = [
  ['opt-name', 'name', 'text'], ['opt-theme', 'theme', 'str'], ['opt-mode', 'mode', 'str'], ['opt-map', 'map', 'str'], ['opt-team', 'teamSize', 'int'], ['opt-diff', 'difficulty', 'str'],
  ['opt-score', 'scoreLimit', 'int'], ['opt-time', 'timeLimit', 'int'], ['opt-ff', 'friendlyFire', 'bool'],
  ['opt-quality', 'quality', 'str'], ['opt-gfxres', 'gfxRes', 'int'], ['opt-gfxshadows', 'gfxShadows', 'str'], ['opt-gfxsoft', 'gfxSoftShadows', 'bool'], ['opt-gfxrate', 'gfxShadowRate', 'str'],
  ['opt-gfxao', 'gfxAO', 'bool'], ['opt-gfxbloom', 'gfxBloom', 'bool'], ['opt-gfxaa', 'gfxAA', 'bool'], ['opt-gfxlights', 'gfxLights', 'bool'], ['opt-gfxaniso', 'gfxAniso', 'str'], ['opt-gfxdust', 'gfxDust', 'str'], ['opt-gfxpath', 'gfxPath', 'str'], ['opt-gfxmsaa', 'gfxMsaa', 'str'], ['opt-fsr', 'fsr', 'str'], ['opt-fsrsharp', 'fsrSharp', 'int'], ['opt-gfxdetail', 'gfxDetail', 'str'], ['opt-fpscap', 'fpsCap', 'int'], ['opt-menubg', 'menuBg', 'str'],
  ['opt-dynres', 'dynamicRes', 'bool'], ['opt-fullscreen', 'fullscreen', 'bool'], ['opt-collision', 'showCollision', 'bool'], ['opt-fov', 'fov', 'int'], ['opt-vmfov', 'vmFov', 'int'], ['opt-fps', 'showFps', 'bool'],
  ['opt-sens', 'sensitivity', 'float'], ['opt-adsmode', 'adsMode', 'str'], ['opt-adssens', 'adsSens', 'float'], ['opt-autosprint', 'autoSprint', 'bool'], ['opt-adszoom', 'adsZoom', 'float'], ['opt-sightsize', 'sightSize', 'str'], ['opt-invert', 'invertY', 'bool'], ['opt-padsens', 'padSensitivity', 'float'],
  ['opt-deadzone', 'padDeadzone', 'float'], ['opt-aa', 'aimAssist', 'bool'], ['opt-vib', 'vibration', 'bool'],
  ['opt-vol', 'volume', 'float'], ['opt-music', 'musicVolume', 'float'], ['opt-matchmusic', 'matchMusic', 'str'], ['opt-announcer', 'announcer', 'str'], ['opt-voice', 'voice', 'str'], ['opt-relay', 'privateRelay', 'bool'], ['opt-fillbots', 'fillBots', 'bool'], ['opt-chat', 'chat', 'bool'], ['opt-touchsize', 'touchSize', 'str'], ['opt-touchads', 'touchAds', 'str'], ['opt-autofire', 'touchAutoFire', 'bool'],
];
const outputs = {
  'opt-gfxres': ['out-gfxres', v => `${v}%`], 'opt-fsrsharp': ['out-fsrsharp', v => `${v}%`],
  'opt-fov': ['out-fov', v => `${v}°`], 'opt-vmfov': ['out-vmfov', v => `${v}°`], 'opt-adszoom': ['out-adszoom', v => `${Math.round(v * 100)}%`], 'opt-sens': ['out-sens', v => Number(v).toFixed(2)], 'opt-adssens': ['out-adssens', v => `${Math.round(v * 100)}%`], 'opt-padsens': ['out-padsens', v => Number(v).toFixed(2)],
  'opt-deadzone': ['out-deadzone', v => Number(v).toFixed(2)], 'opt-vol': ['out-vol', v => `${Math.round(v * 100)}%`], 'opt-music': ['out-music', v => `${Math.round(v * 100)}%`],
};
// the map dropdown is built from the map list, so every map shows up in the menu
const MAP_TAGS = { shuran: '3 lanes', mart: 'indoor', pioneer: 'Underground site', drivein: 'night' };
{
  const sel = $('opt-map');
  sel.innerHTML = Object.values(MAPS).map(m => `<option value="${m.id}">${m.name}${MAP_TAGS[m.id] ? ` · ${MAP_TAGS[m.id]}` : ''}</option>`).join('') + '<option value="random">Random</option>';
}
// loading-screen / menu photos of each map (rendered in-engine); one is picked at random per load
const mapPhoto = (id) => { const l = MAPS[id] && MAPS[id].photos; return l && l.length ? l[(Math.random() * l.length) | 0] : null; };
const photoCache = {};
const loadPhoto = (src) => photoCache[src] || (photoCache[src] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }));
// the detail rows always show what's in effect: the preset's values, or the player's custom ones
if (settings.quality !== 'custom') Object.assign(settings, presetGfx(settings.quality));
else Object.assign(settings, { ...presetGfx('high'), ...Object.fromEntries(Object.entries(settings).filter(([k, v]) => k.startsWith('gfx') && v !== undefined)) });
// a saved value that isn't one of its dropdown's choices (an older version, a hand-edited save) would show as a
// blank box and still be used: put it back to the default
for (const [id, key] of bindings) {
  const el = $(id);
  if (el.tagName !== 'SELECT' || settings[key] === undefined) continue;
  if (![...el.options].some(o => o.value === String(settings[key]))) settings[key] = DEFAULT_SETTINGS[key] ?? el.options[0]?.value;
}
function writeGfx() {
  for (const [id, key, type] of bindings) {
    if (!key.startsWith('gfx')) continue;
    const el = $(id);
    if (type === 'bool') el.checked = !!settings[key]; else el.value = String(settings[key]);
    if (outputs[id]) $(outputs[id][0]).textContent = outputs[id][1](el.value);
  }
}
function writeForm() {
  for (const [id, key, type] of bindings) {
    const el = $(id);
    if (type === 'bool') el.checked = !!settings[key];
    else el.value = String(settings[key]);
  }
  for (const id in outputs) $(outputs[id][0]).textContent = outputs[id][1]($(id).value);
  $('opt-name').value = myName();
  syncModeRows();
  if (editKey) renderEditor(); else renderClasses();
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
// ---------- staged options: changes wait for Apply (X); leaving with unsaved changes asks first ----------
const OPT_KEYS = bindings.filter(([id]) => $(id).closest('#pane-options')).map(([, key]) => key).concat(['quality']);
const optState = () => JSON.stringify(Object.fromEntries([...new Set(OPT_KEYS)].map(k => [k, settings[k]])));
let optBase = optState();
const optDirty = () => optState() !== optBase;
function syncApplyBar() { $('opt-apply').hidden = !optDirty(); }
// options that take effect mid-match (the match keeps its own copy of the settings)
const LIVE_KEYS = ['vmFov', 'sensitivity', 'padSensitivity', 'fov', 'invertY', 'aimAssist', 'showFps', 'adsZoom', 'sightSize', 'adsSens', 'autoSprint', 'adsMode', 'padDeadzone', 'vibration'];
function syncLive() { if (game.settings) for (const k of LIVE_KEYS) if (settings[k] !== undefined) game.settings[k] = settings[k]; }
// Reset tab to defaults: puts this tab's options back to their defaults, staged like any change (Apply / X)
$('opt-reset').addEventListener('click', () => {
  const keys = bindings.filter(([id]) => { const r = $(id).closest('.row'); return r && r.dataset.osub === optSub && $(id).closest('#pane-options'); }).map(([, key]) => key);
  if (!keys.length) return;
  for (const k of keys) if (k !== 'name' && DEFAULT_SETTINGS[k] !== undefined) settings[k] = DEFAULT_SETTINGS[k];
  if (keys.includes('quality')) { settings.quality = GPU.best; Object.assign(settings, presetGfx(settings.quality)); }   // graphics: the preset recommended for this device
  writeForm();
  syncApplyBar();
  game.audio.play('ui', null, { ui: true });
  game.hud.toast(optDirty() ? 'DEFAULTS SET: PRESS APPLY TO KEEP THEM' : 'ALREADY ON THE DEFAULTS');
});
function applyOptions() {
  if (!optDirty()) return;
  saveSettings(settings);
  applyTheme();
  game.applySettings(settings);
  syncLive();
  syncMenuBg();
  const gfx = JSON.parse(optBase);
  const gfxChanged = Object.keys(gfx).some(k => (k === 'quality' || k.startsWith('gfx')) && gfx[k] !== settings[k]);
  optBase = optState();
  syncApplyBar();
  if (gfxChanged) checkMsaa();
  game.hud.toast('SETTINGS APPLIED');
  game.audio.play('ui', null, { ui: true });
}
function discardOptions() {
  Object.assign(settings, JSON.parse(optBase));
  writeForm();
  syncApplyBar();
}
let applyThen = null;
// run `go` now, or after asking to apply / discard if there are unsaved option changes
function guardOptions(go) {
  if (!optDirty()) { go(); return; }
  applyThen = go;
  $('apply-dlg').hidden = false;
  game.audio.play('ui', null, { ui: true });
  setTimeout(() => focusEl($('ad-apply')), 0);
}
const closeApplyDlg = () => { $('apply-dlg').hidden = true; const f = applyThen; applyThen = null; return f; };
$('ad-apply').addEventListener('click', () => { const f = closeApplyDlg(); applyOptions(); if (f) f(); });
$('ad-discard').addEventListener('click', () => { const f = closeApplyDlg(); discardOptions(); if (f) f(); });
$('ad-cancel').addEventListener('click', () => { closeApplyDlg(); if (game.input.lastDevice === 'pad') setTimeout(() => focusEl($('opt-apply-btn').offsetParent ? $('opt-apply-btn') : null) || focusFirst(), 0); });
$('opt-apply-btn').addEventListener('click', applyOptions);
$('opt-discard-btn').addEventListener('click', () => { discardOptions(); game.audio.play('ui', null, { ui: true }); });
// picking an announcer or a voice plays one of their lines
const voicePreview = (prefix, lines) => { game.audio.init(); game.audio.want(prefix).then(() => game.audio.play('vo', null, { id: prefix + lines[(Math.random() * lines.length) | 0], ui: true })); };
$('opt-announcer').addEventListener('change', (e) => { if (e.target.value !== 'random') voicePreview(`vo/announcer/${e.target.value}/`, ['mode_tdm', 'double_kill', 'victory', 'killing_spree']); });
$('opt-voice').addEventListener('change', (e) => { if (e.target.value !== 'auto') voicePreview(`vo/chatter/${e.target.value}/`, ['banter', 'reloading', 'frag_out', 'contact']); });
const optionsOpen = () => (screen === 'menu' && tab === 'options') || (screen === 'pause' && pauseSec === 'options');

for (const [id, key, type] of bindings) {
  const el = $(id);
  const ev = el.type === 'range' || el.tagName === 'INPUT' && type === 'text' ? 'input' : 'change';
  el.addEventListener(ev, () => {
    readField(id, key, type);
    if (OPT_KEYS.includes(key)) {
      // an option: show it in the form, apply it later
      if (key === 'quality' && settings.quality !== 'custom') { Object.assign(settings, presetGfx(settings.quality)); writeGfx(); }
      else if (key.startsWith('gfx') && settings.quality !== 'custom') { settings.quality = 'custom'; $('opt-quality').value = 'custom'; }
      if (outputs[id]) $(outputs[id][0]).textContent = outputs[id][1](el.value);
      syncApplyBar();
      return;
    }
    // graphics: a preset fills in every detail setting; changing any detail makes the preset Custom (like CoD)
    if (key === 'quality' && settings.quality !== 'custom') { Object.assign(settings, presetGfx(settings.quality)); writeGfx(); }
    else if (key.startsWith('gfx') && settings.quality !== 'custom') { settings.quality = 'custom'; $('opt-quality').value = 'custom'; }
    if (outputs[id]) $(outputs[id][0]).textContent = outputs[id][1](el.value);
    saveSettings(settings);
    if (key === 'theme') applyTheme();
    game.applySettings(settings);
    if (key === 'quality' || key.startsWith('gfx')) checkMsaa();
    syncLive();
    syncMenuBg();
  });
}

// the fast path's MSAA belongs to the WebGL context: switching to or from it restarts the game from the menu
// (in a match it applies the next time the game starts)
function checkMsaa() {
  const need = wantsMsaa();
  if (need === game.renderer.msaa) return;
  if (game.state === 'menu' && !lobby.active) { game.hud.toast('RESTARTING TO APPLY ANTI-ALIASING'); setTimeout(() => location.reload(), 700); }
  else game.hud.toast('ANTI-ALIASING CHANGES THE NEXT TIME THE GAME STARTS');
}
// ---------- graphics hardware: what the GPU can handle, and a warning when there isn't one ----------
// The renderer string tells software rendering (no hardware acceleration) from phone, integrated and discrete
// GPUs. Presets above what the device is likely to run smoothly are marked "not recommended".
const GPU = (() => {
  let name = '';
  try {
    const gl = game.renderer.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  } catch (_) { /* unknown */ }
  return gpuTier(name);
})();
const PRESET_RANK = { mobile: 0, low: 1, medium: 2, high: 3, ultra: 4 };
// A PC with an NVIDIA or AMD graphics card often runs the browser on the processor's built-in graphics anyway
// (Windows picks the power-saving chip for browsers), which can run the game at a fraction of the speed.
const onBuiltIn = () => GPU.tier === 2 && /Windows/.test(navigator.userAgent) && /intel|radeon\(tm\) graphics|amd radeon graphics|vega|uhd|iris/i.test(GPU.name);
const IGPU_FIX = 'if this PC also has an NVIDIA or AMD graphics card, the browser isn\'t using it. In Windows: Settings → System → Display → Graphics, choose your browser, set it to High performance, then restart the browser.';
function markPresets() {
  const max = PRESET_RANK[GPU.best] + (GPU.tier === 1 ? 1 : 0);   // phones: Mobile or Low
  for (const o of $('opt-quality').options) {
    const r = PRESET_RANK[o.value];
    const nr = r !== undefined && r > max;
    o.textContent = o.textContent.replace(/ \(not recommended\)$/, '') + (nr ? ' (not recommended)' : '');
    o.classList.toggle('nr', nr);
  }
  $('gpu-name').textContent = GPU.name;
  const label = { mobile: 'Mobile', medium: 'Medium', ultra: 'High or Ultra' }[GPU.best];
  $('gpu-note').innerHTML = GPU.soft ? 'Hardware acceleration is off: the game is running on the CPU. Turn it on in your browser settings.'
    : onBuiltIn() ? `Recommended for this device: <b>${label}</b>. This is your computer's <b>built-in</b> graphics: ${IGPU_FIX}`
    : `Recommended for this device: <b>${label}</b>`;
  $('gpu-note').closest('.row').classList.toggle('bad', GPU.soft);
}
markPresets();
if (GPU.soft) {
  const ua = navigator.userAgent;
  const how = /Firefox/.test(ua) ? 'In Firefox: Settings → General → Performance → turn on "Use hardware acceleration when available", then restart Firefox.'
    : /Edg\//.test(ua) ? 'In Edge: Settings → System and performance → turn on "Use graphics acceleration when available", then restart Edge.'
    : /Safari/.test(ua) && !/Chrome/.test(ua) ? 'In Safari, hardware acceleration is always on: update macOS / iOS, or try another browser.'
    : 'In Chrome: Settings → System → turn on "Use graphics acceleration when available", then relaunch Chrome (or open chrome://settings/system).';
  $('gpu-warn-text').textContent = `Breachpoint is being drawn by your CPU instead of your graphics card, so it will stutter on every setting. ${how}`;
  let seen = false; try { seen = localStorage.getItem('breachpoint.gpuwarn') === GPU.name; } catch (_) { /* private mode */ }
  $('gpu-warn').hidden = seen;
  $('gpu-warn-x').addEventListener('click', () => { $('gpu-warn').hidden = true; try { localStorage.setItem('breachpoint.gpuwarn', GPU.name); } catch (_) { /* private mode */ } });
}
// A suggestion with a one-click fix (SWITCH / KEEP), e.g. a lighter preset after a slow match.
let offerYes = null;
function offer(head, text, yes, yesLabel = 'SWITCH', noLabel = 'KEEP') {
  $('offer-head').textContent = head; $('offer-text').textContent = text;
  $('offer-yes').textContent = yesLabel; $('offer-no').textContent = noLabel;
  $('offer-yes').hidden = !yes;
  offerYes = yes; $('offer').hidden = false;
}
$('offer-yes').addEventListener('click', () => { $('offer').hidden = true; if (offerYes) offerYes(); offerYes = null; });
$('offer-no').addEventListener('click', () => { $('offer').hidden = true; offerYes = null; });
// the browser refused to capture the mouse (Esc to resume, or too soon after leaving it): one click fixes it
game.input.onLockRefused = () => { if (game.state === 'playing' && !game.input.isTouch && game.input.lastDevice !== 'pad') $('click-resume').hidden = false; };
$('click-resume').addEventListener('click', () => { $('click-resume').hidden = true; if (game.state === 'playing') game.input.lock(); });
setInterval(() => { if (!$('click-resume').hidden && (game.input.locked || game.state !== 'playing' || game.input.lastDevice === 'pad')) $('click-resume').hidden = true; }, 250);
// graphics driver reset: say what's happening; if the browser doesn't give the context back, offer a reload
let ctxTimer = 0;
game.onContext = (ok) => {
  clearTimeout(ctxTimer);
  if (!ok) {
    offer('GRAPHICS RESET', 'Your graphics driver restarted. Getting the picture back…', null, '', 'OK');
    ctxTimer = setTimeout(() => offer('GRAPHICS STOPPED', 'The browser didn\'t give the graphics back. Reloading the page fixes it; closing other tabs with games or video helps it not happen again.', () => location.reload(), 'RELOAD', 'WAIT'), 6000);
  } else {
    const lighter = Object.keys(PRESET_RANK).find(k => PRESET_RANK[k] === PRESET_RANK[settings.quality] - 1);
    if (lighter && settings.quality !== 'custom') offer('GRAPHICS RECOVERED', `The graphics driver restarted. If it happens again, a lighter preset (${QUALITY[lighter].label}) puts less load on it.`, () => usePreset(lighter), `USE ${QUALITY[lighter].label.toUpperCase()}`);
    else $('offer').hidden = true;
  }
};
function usePreset(q) {
  settings.quality = q; saveSettings(settings); game.applySettings(settings); writeForm(); optBase = optState(); syncApplyBar();
  game.hud.toast(`GRAPHICS: ${QUALITY[q].label.toUpperCase()}`);
}
// in a match: if the frame rate stays low for a while, say so (once) and offer the next lighter preset back in
// the menu, where it's one click
// (measured only while playing: the clock restarts each time a match is (re)entered, the first seconds of loading
// in are skipped, a frame cap you've set counts as smooth, and it takes two slow stretches in a row)
let perfNoteT = 0, perfFrames = 0, perfTime = 0, perfShown = false, perfOffer = null, perfLow = 0, perfWarm = 0;
setInterval(() => {
  if (perfShown || game.state !== 'playing' || document.hidden) {
    perfFrames = perfTime = 0; perfNoteT = 0; perfLow = 0; perfWarm = 0;
    if (perfOffer && game.state === 'menu' && $('offer').hidden) {
      const { fps: f, better: b } = perfOffer; perfOffer = null;
      offer('LOW FRAME RATE', `Your last match ran at about ${f} FPS. The ${QUALITY[b].label} preset should run smoother.`, () => usePreset(b), `USE ${QUALITY[b].label.toUpperCase()}`);
    }
    return;
  }
  const now = performance.now();
  if (perfWarm < 3) { perfWarm++; perfNoteT = { t: now, f: game.frameCount }; return; }   // the first 6 s: shaders, loading
  if (perfNoteT) { perfFrames += game.frameCount - (perfNoteT.f || 0); perfTime += (now - perfNoteT.t) / 1000; }
  perfNoteT = { t: now, f: game.frameCount };
  if (perfTime < 20) return;
  const fps = perfFrames / perfTime; perfFrames = perfTime = 0;
  const cap = +settings.fpsCap || 0, floor = cap > 0 ? Math.min(40, cap * 0.8) : 40;
  perfLow = fps < floor ? perfLow + 1 : 0;
  if (perfLow >= 2) {
    perfShown = true;
    const cur = settings.quality, better = PRESET_RANK[cur] > PRESET_RANK[GPU.best] ? GPU.best : PRESET_RANK[cur] > 0 ? Object.keys(PRESET_RANK)[PRESET_RANK[cur] - 1] : null;
    game.hud.toast(GPU.soft ? 'LOW FRAME RATE: TURN ON HARDWARE ACCELERATION IN YOUR BROWSER' : better ? `LOW FRAME RATE (${Math.round(fps)} FPS): TRY THE ${better.toUpperCase()} PRESET OR FSR IN OPTIONS` : `LOW FRAME RATE (${Math.round(fps)} FPS): TRY FSR PERFORMANCE IN OPTIONS`);
    if (better && !GPU.soft && settings.quality !== 'custom') perfOffer = { fps: Math.round(fps), better };
  }

}, 2000);
// match mode: show only the settings that apply
function syncModeRows() {
  const m = MODES[settings.mode] || MODES.tdm;
  document.body.dataset.gmode = m.id;
  // match size reads as a player count in the free-for-all modes
  const solo = m.ffa || m.infected;   // (Infected: teams are made during the match)
  $('opt-team').closest('.row').querySelector('label').firstChild.textContent = solo ? 'Players' : 'Match size';
  for (const o of $('opt-team').options) o.textContent = solo ? `${o.value * 2} players` : `${o.value}v${o.value}`;
  document.querySelectorAll('.mode-pick .mp').forEach(b => { const on = b.dataset.mode === m.id; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('intel-mode').textContent = m.name.toUpperCase();
  $('play-title').textContent = m.name.toUpperCase();
  document.querySelector('#pv-setup .pane-sub').textContent = m.blurb;
  try { if (screen === 'menu' && playView === 'root') renderTiles(); } catch (_) { /* still initialising */ }
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
settings.reticles = applyReticles(settings.reticles);
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
// ---------- classes (CoD style: default classes you equip, custom classes you build) ----------
// A class is { name, primary, atts: { rifle: {...}, smg: {...}, ..., pistol: {...} } }. The equipped class is
// mirrored into settings.primary / settings.attachments, which is what the match and the network read.
const DEFAULT_CLASSES = [
  { name: 'ASSAULT', primary: 'rifle', secondary: 'pistol', lethal: 'frag', tactical: 'stun', atts: { rifle: { optic: 'holo', muzzle: 'brake', under: 'vgrip', mag: 'std', laser: 'none' } } },
  { name: 'RUSHER', primary: 'krv45', secondary: 'mp18', lethal: 'semtex', tactical: 'stun', atts: { krv45: { optic: 'reflex', muzzle: 'none', under: 'agrip', mag: 'fast', laser: 'laser' } } },
  { name: 'CLOSE QUARTERS', primary: 'sa12', secondary: 'r357', lethal: 'shock', tactical: 'stun', atts: { sa12: { optic: 'iron', muzzle: 'choke', mag: 'std', laser: 'laser' } } },
  { name: 'MARKSMAN', primary: 'mr14', secondary: 'd50', lethal: 'knife', tactical: 'stun', atts: { mr14: { optic: 'acog', muzzle: 'comp', mag: 'std', laser: 'none' } } },
  { name: 'SNIPER', primary: 'sniper', secondary: 'pistol', lethal: 'knife', tactical: 'stun', atts: { sniper: { optic: 'scope', muzzle: 'brake', mag: 'std' }, pistol: { optic: 'iron', muzzle: 'sup', mag: 'std', laser: 'none' } } },
  { name: 'DEMOLITION', primary: 'hx60', secondary: 'monte', lethal: 'semtex', tactical: 'stun', atts: { hx60: { optic: 'reflex', muzzle: 'none', mag: 'std', laser: 'none' } } },
  { name: 'GUERRILLA', primary: 'kv47', secondary: 'd50', lethal: 'frag', tactical: 'stun', atts: { kv47: { optic: 'iron', muzzle: 'comp', under: 'none', mag: 'ext', laser: 'none' } } },
];
const CUSTOM_N = 5;
const clsCopy = (c, name) => ({ name, primary: PRIMARIES.includes(c.primary) ? c.primary : 'rifle', secondary: SECONDARIES.includes(c.secondary) ? c.secondary : 'pistol', lethal: LETHALS.includes(c.lethal) ? c.lethal : 'frag', tactical: TACTICALS.includes(c.tactical) ? c.tactical : 'stun', atts: JSON.parse(JSON.stringify(c.atts || {})) });
(function migrateClasses() {
  let list = Array.isArray(settings.classes) ? settings.classes.filter(c => c && typeof c === 'object') : [];
  if (!list.length) {
    // first run: custom class 1 keeps the build the player already had; the rest start as copies of the defaults
    list.push({ name: 'CUSTOM CLASS 1', primary: PRIMARIES.includes(settings.primary) ? settings.primary : 'rifle', atts: JSON.parse(JSON.stringify(settings.attachments || {})) });
    if (!settings.cls) settings.cls = 'c0';
  }
  for (let i = list.length; i < CUSTOM_N; i++) list.push(clsCopy(DEFAULT_CLASSES[i % DEFAULT_CLASSES.length], `CUSTOM CLASS ${i + 1}`));
  settings.classes = list.slice(0, CUSTOM_N).map((c, i) => ({ ...clsCopy(c, typeof c.name === 'string' && c.name.trim() ? c.name.slice(0, 18) : `CUSTOM CLASS ${i + 1}`) }));
  if (!/^[dc]\d$/.test(settings.cls || '')) settings.cls = 'c0';
})();
const clsGet = (key) => key[0] === 'd' ? DEFAULT_CLASSES[+key.slice(1)] : settings.classes[+key.slice(1)];
const clsAtt = (c, id) => cleanAtt(id, c.atts[id]);
let clsSel = settings.cls, editKey = null;   // highlighted class in the list; class open in the editor
function applyEquipped() {
  const c = clsGet(settings.cls) || DEFAULT_CLASSES[0];
  settings.primary = c.primary;
  settings.secondary = c.secondary || 'pistol';
  settings.attachments = { [c.primary]: clsAtt(c, c.primary), [settings.secondary]: clsAtt(c, settings.secondary) };
  settings.lethal = LETHALS.includes(c.lethal) ? c.lethal : 'frag';
  settings.tactical = TACTICALS.includes(c.tactical) ? c.tactical : 'stun';
}
applyEquipped();
function attFor(id) { return clsAtt(clsGet(editKey || clsSel), id); }
function loadoutChanged() {
  if (editKey && editKey === settings.cls) applyEquipped();
  saveSettings(settings);
  if (inMatch() && game.player) game.requestLoadout(loadoutFromSettings(settings));
}
// ---- Create a Class UI (BO2 Pick-10 overview + MW2019 cards/gunsmith) ----
const escHtml = (t) => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const WCAT = { rifle: 'ASSAULT RIFLES', kv47: 'ASSAULT RIFLES', br308: 'ASSAULT RIFLES', hx60: 'LIGHT MACHINE GUNS', smg: 'SUBMACHINE GUNS', krv45: 'SUBMACHINE GUNS',
  shotgun: 'SHOTGUNS', sa12: 'SHOTGUNS', mr14: 'MARKSMAN RIFLES', sniper: 'SNIPER RIFLES', pistol: 'PISTOLS', d50: 'PISTOLS', r357: 'PISTOLS', mp18: 'MACHINE PISTOLS', monte: 'LAUNCHERS' };
// line-art icons for every attachment (stroke = currentColor)
const ICO = {
  'optic.iron': '<path d="M6 30h52M14 30v-8h4v8M44 30v-12h6v12M47 18v-5"/>',
  'optic.reflex': '<path d="M10 34h44M18 34V18h26l6 16"/><circle cx="32" cy="25" r="2" fill="currentColor"/>',
  'optic.holo': '<path d="M8 36h48M12 36V16h40v20"/><circle cx="32" cy="26" r="7"/><circle cx="32" cy="26" r="1.5" fill="currentColor"/>',
  'optic.acog': '<path d="M8 38h48M16 38v-6M48 38v-6"/><rect x="10" y="16" width="44" height="16" rx="4"/><path d="M28 27l4-5 4 5"/>',
  'optic.scope': '<path d="M4 38h56M20 38v-6M44 38v-6"/><path d="M4 18h12l4 4h24l4-4h12v12H48l-4-4H20l-4 4H4z"/>',
  'muzzle.none': '<path d="M6 26h40v8H6M46 24v12"/>',
  'muzzle.brake': '<path d="M4 26h28v8H4"/><rect x="32" y="22" width="24" height="16"/><path d="M38 22v6M44 22v6M50 22v6M38 32v6M44 32v6M50 32v6"/>',
  'muzzle.comp': '<path d="M4 26h28v8H4"/><path d="M32 22h24v16H32z"/><path d="M38 22l4 6M46 22l4 6"/>',
  'muzzle.sup': '<path d="M4 27h14v6H4"/><rect x="18" y="20" width="42" height="20" rx="4"/><path d="M26 20v20M52 20v20"/>',
  'muzzle.choke': '<path d="M4 26h30v8H4"/><path d="M34 24l22-4v20l-22-4z"/>',
  'under.none': '<path d="M6 20h52" /><path d="M22 28h20v18H22z" stroke-dasharray="3 3"/>',
  'under.vgrip': '<path d="M6 18h52v6H6z"/><path d="M26 24h12v24l-2 4h-8l-2-4z"/><path d="M28 32h8M28 38h8M28 44h8"/>',
  'under.agrip': '<path d="M6 18h52v6H6z"/><path d="M20 24h28l-12 22h-10z"/>',
  'mag.std': '<path d="M24 10h16v18l4 22H30l-6-22z"/>',
  'mag.ext': '<path d="M24 4h16v18l6 34H30l-6-34z"/><path d="M28 50h14"/>',
  'mag.fast': '<path d="M14 10h12v14l3 22H19l-5-22zM38 10h12v14l3 22H43l-5-22z"/><path d="M12 26h44M12 32h44"/>',
  'laser.none': '<rect x="10" y="22" width="22" height="16" rx="2" stroke-dasharray="3 3"/>',
  'laser.laser': '<rect x="6" y="22" width="22" height="16" rx="2"/><circle cx="24" cy="30" r="3"/><path d="M28 30h32" stroke-width="2.5"/>',
};
const icon = (sl, k) => `<svg viewBox="0 0 64 56" class="ico" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${ICO[sl + '.' + k] || ''}</svg>`;
const FRAG_ICO = '<svg viewBox="0 0 64 56" class="ico" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="30" cy="34" rx="14" ry="16"/><path d="M22 18h16v-6H22zM38 14c8 0 12 4 12 10M18 28h24M18 40h24M30 18v32"/></svg>';
const KNIFE_ICO = '<svg viewBox="0 0 64 56" class="ico" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 30h18v6H4zM22 26h4v14h-4M26 30h22l12-6-6 12H26z"/></svg>';
const isCustom = (k) => !!k && k[0] === 'c';
const modCount = (id, att) => SLOTS.filter(s => GUNSMITH[id][s] && att[s] !== GUNSMITH[id][s][0]).length;
const slotCount = (id) => SLOTS.filter(s => GUNSMITH[id][s]).length;
const pips = (id, att) => `<span class="pips">${SLOTS.filter(s => GUNSMITH[id][s]).map(s => `<i class="${att[s] !== GUNSMITH[id][s][0] ? 'on' : ''}"></i>`).join('')}</span>`;
// Weapon card thumbnails: each one is a render read back to an image, so they're made one per frame, in the
// background (all at once froze the page for seconds on a slow GPU); until then the card shows the gun's name.
const thumbQueue = new Map();   // slot number -> [id, att]
let thumbSlot = 0, thumbBusy = false;
const thumb = (id, att) => {
  const u = thumbReady(id, att);
  if (u !== undefined) return u ? `<img class="gthumb" src="${u}" alt="">` : `<span class="gthumb none">${WEAPONS[id].short}</span>`;
  const n = ++thumbSlot;
  thumbQueue.set(n, [id, att]);
  if (!thumbBusy) { thumbBusy = true; requestAnimationFrame(makeThumbs); }
  return `<span class="gthumb none" data-gt="${n}">${WEAPONS[id].short}</span>`;
};
async function makeThumbs() {
  const next = thumbQueue.entries().next();
  if (next.done) { thumbBusy = false; return; }
  const [n, [id, att]] = next.value;
  if (document.querySelector(`[data-gt="${n}"]`)) await gunThumb(id, att);   // (only if it's still on the page)
  else thumbQueue.delete(n);
  // fill every card whose picture is ready (the same gun can be on the page more than once)
  for (const [m, [id2, att2]] of [...thumbQueue]) {
    const u = thumbReady(id2, att2);
    if (u === undefined) continue;
    thumbQueue.delete(m);
    const el = document.querySelector(`[data-gt="${m}"]`);
    if (!el) continue;
    if (!u) { el.removeAttribute('data-gt'); continue; }
    const img = new Image(); img.className = 'gthumb'; img.alt = ''; img.src = u; el.replaceWith(img);
  }
  requestAnimationFrame(makeThumbs);
}

// segmented stat bars (BO2): `now` vs `base` shows the change in green / red
function statBars(now, base) {
  const a = statsOf(now), b = statsOf(base || now);
  return a.map(([k, v], i) => {
    const w = b[i][1], lo = Math.min(v, w), diff = v - w;
    return `<span class="stat">${k}<i><b style="width:${(lo * 100).toFixed(1)}%"></b>${Math.abs(diff) > 0.005 ? `<em class="${diff > 0 ? 'up' : 'down'}" style="left:${(lo * 100).toFixed(1)}%;width:${(Math.abs(diff) * 100).toFixed(1)}%"></em>` : ''}</i></span>`;
  }).join('');
}
const facts = (d) => `<span class="gs-facts">${WCAT[d.id] || ''} · ${d.mag} RDS · ${d.reload.toFixed(1)}s RELOAD · ${d.mode}${d.quiet ? ' · SUPPRESSED' : ''}</span>`;
function equippedRow(id, att, hiSlot) {
  return `<div class="eq-k">EQUIPPED <b>${modCount(id, att)}/${slotCount(id)}</b></div><div class="eq-icons">${SLOTS.filter(s => GUNSMITH[id][s]).map(s =>
    `<span class="${s === hiSlot ? 'hi' : ''}${att[s] !== GUNSMITH[id][s][0] ? ' mod' : ''}" title="${ATTACHMENTS[s][att[s]].name}">${icon(s, att[s])}</span>`).join('')}</div>`;
}
// right-hand detail panel: live 3D preview + name, description, stats, equipped attachments
function showDetail(id, att, { base = null, title = null, sub = 'GUNSMITH', desc = '', hiSlot = null } = {}) {
  const d = weaponDef(id, att);
  $('gs-name').textContent = (title || d.name).toUpperCase();
  $('gs-sub').textContent = sub;
  $('gs-desc').textContent = desc;
  $('gs-stats').innerHTML = statBars(d, base) + facts(d);
  $('gs-eq').innerHTML = equippedRow(id, att, hiSlot);
  preview.show(id, att);
}
const EQ_ICO = {
  frag: FRAG_ICO,
  semtex: '<svg viewBox="0 0 64 56" class="ico" fill="none" stroke="currentColor" stroke-width="2"><rect x="14" y="20" width="36" height="22" rx="3"/><path d="M14 28h36M22 20v-6h20v6"/><circle cx="40" cy="14" r="2" fill="currentColor"/></svg>',
  knife: '<svg viewBox="0 0 64 56" class="ico" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 40l30-26 14-6-6 14-26 30z"/><path d="M14 46l-6 6M20 40l6 6"/></svg>',
  shock: '<svg viewBox="0 0 64 56" class="ico" fill="none" stroke="currentColor" stroke-width="2"><rect x="22" y="10" width="14" height="36" rx="5"/><path d="M44 14l-6 10h8l-8 12M14 18l6 6M12 34l8-2"/></svg>',
  stun: '<svg viewBox="0 0 64 56" class="ico" fill="none" stroke="currentColor" stroke-width="2"><rect x="22" y="14" width="18" height="34" rx="3"/><path d="M22 22h18M26 8h10v6H26zM46 12l6-4M48 22h8M46 32l6 4"/></svg>',
};
const eqCard = (slot, id, act, small = '') => { const e = EQUIPMENT[id]; return `<button class="lcard small"${act ? ` data-nav data-act="${act}"` : ' tabindex="-1"'}><span class="lc-k">${slot}</span>${EQ_ICO[id] || ''}<span class="lc-n">${e.name.toUpperCase()}</span><span class="lc-a"><small>${small || `×${e.count}`}</small></span></button>`; };
function loadoutCards(c, editable) {
  const p = c.primary, s = c.secondary || 'pistol', pa = clsAtt(c, p), sa = clsAtt(c, s);
  const card = (k, id, att, cls, act) => `<button class="lcard ${cls}"${editable ? ` data-nav data-act="${act}"` : ' tabindex="-1"'}>
      <span class="lc-k">${k}</span>${thumb(id, att)}<span class="lc-n">${WEAPONS[id].name.toUpperCase()}</span>
      <span class="lc-a">${pips(id, att)}<small>${escHtml(attSummary(id, att).join(' · ') || 'STOCK')}</small></span></button>`;
  return card('PRIMARY', p, pa, 'big', 'w:p') + card('SECONDARY', s, sa, '', 'w:s')
    + eqCard('LETHAL', c.lethal || 'frag', editable ? 'e:l' : '') + eqCard('TACTICAL', c.tactical || 'stun', editable ? 'e:t' : '');
}

// ---- class list (MW2019 "Edit Loadouts") ----
function renderClasses() {
  const had = document.querySelector('#cls-list .pad-focus'), keep = had && had.dataset.cls;
  const row = (key, c) => `<button class="cls-row${key === clsSel ? ' sel' : ''}${key === settings.cls ? ' eq' : ''}" data-cls="${key}" data-nav>
      <span class="cr-n">${escHtml(c.name)}</span><span class="cr-w">${WEAPONS[c.primary].short} · ${WEAPONS[c.secondary || 'pistol'].short}</span>${key === settings.cls ? '<span class="cr-eq">EQUIPPED</span>' : ''}</button>`;
  $('cls-list').innerHTML = `<div class="group">CUSTOM CLASSES</div>${settings.classes.map((c, i) => row('c' + i, c)).join('')}
    <div class="group">DEFAULT CLASSES</div>${DEFAULT_CLASSES.map((c, i) => row('d' + i, c)).join('')}`;
  $('cls-list').querySelectorAll('.cls-row').forEach(b => {
    b.addEventListener('click', () => { if (clsSel === b.dataset.cls) { equipClass(); return; } clsSel = b.dataset.cls; renderClasses(); });
    b.addEventListener('dblclick', () => { clsSel = b.dataset.cls; equipClass(); });
    b.addEventListener('focus', () => { if (clsSel !== b.dataset.cls && game.input.lastDevice === 'pad') { clsSel = b.dataset.cls; renderClasses(); } });
  });
  const c = clsGet(clsSel), custom = isCustom(clsSel), on = clsSel === settings.cls;
  $('cls-name').textContent = c.name;
  $('cls-kind').textContent = custom ? 'CUSTOM CLASS' : 'DEFAULT CLASS';
  $('cls-cards').innerHTML = loadoutCards(c, custom);
  $('cls-cards').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => openEditor(clsSel, b.dataset.act)));
  $('cls-equip').querySelector('span').textContent = on ? 'EQUIPPED ✓' : 'EQUIP';
  $('cls-equip').classList.toggle('done', on);
  $('cls-edit').textContent = custom ? 'EDIT CLASS' : 'COPY TO A CUSTOM CLASS';
  $('cls-note').textContent = custom ? 'Select a weapon card or Edit Class to open the gunsmith. Changes save automatically.' : 'Default classes can\'t be changed. Copy one into a custom slot to tweak it.';
  if (!editKey) { $('cls-viewslot').appendChild($('gs-viewbox')); preview.show(c.primary, clsAtt(c, c.primary)); }
  if (keep) focusEl($('cls-list').querySelector(`[data-cls="${keep}"]`));
}
function equipClass() {
  settings.cls = clsSel;
  applyEquipped();
  saveSettings(settings);
  if (inMatch() && game.player) game.requestLoadout(loadoutFromSettings(settings));
  else syncLobbyLoadout();
  game.audio.play('ui', null, { ui: true });
  renderClasses();
}

// ---- editor: overview (Pick 10) → weapon picker / attachment picker ----
let ceView = 'over', ceFrom = null, retOptic = 'holo';   // 'over' | 'w:p' | 'w:s' | 'a:p:<slot>' | 'a:s:<slot>'
const ceGun = (c, which) => which === 'p' ? c.primary : (c.secondary || 'pistol');
function renderEditor(focusAct) {
  if (!editKey) return;
  const c = clsGet(editKey), main = $('ce-main');
  const parts = [c.name];
  $('ce-rn').style.display = ceView === 'over' ? '' : 'none';
  $('cls-back').textContent = ceView === 'over' ? '‹ ALL CLASSES' : '‹ BACK';
  if (ceView === 'over') {
    const slotTiles = (which) => { const id = ceGun(c, which), att = clsAtt(c, id);
      return SLOTS.filter(s => GUNSMITH[id][s]).map(s => `<button class="atile${att[s] !== GUNSMITH[id][s][0] ? ' mod' : ''}" data-nav data-act="a:${which}:${s}">
        <span class="at-k">${SLOT_NAMES[s]}</span>${icon(s, att[s])}<span class="at-n">${ATTACHMENTS[s][att[s]].name}</span></button>`).join('')
        + (id === 'monte' ? '' : `<button class="atile rtile" data-nav data-act="r:${which}"><span class="at-k">Reticle</span><img class="rprev" src="${reticlePreview(att.optic, settings.reticles[att.optic].shape, settings.reticles[att.optic].color, 96)}" alt=""><span class="at-n">${shapesFor(att.optic)[settings.reticles[att.optic].shape]}</span></button>`); };
    const wbox = (which, k) => { const id = ceGun(c, which), att = clsAtt(c, id);
      return `<button class="wbox" data-nav data-act="w:${which}"><span class="lc-k">${k}</span>${thumb(id, att)}<span class="lc-n">${WEAPONS[id].name.toUpperCase()}</span><span class="lc-c">${WCAT[id]}</span></button>`; };
    main.innerHTML = `<div class="p10">
      <div class="p10-row">${wbox('p', 'PRIMARY')}<div class="p10-atts"><div class="p10-k">PRIMARY ATTACHMENTS ${pips(c.primary, clsAtt(c, c.primary))}</div><div class="atiles">${slotTiles('p')}</div></div></div>
      <div class="p10-row">${wbox('s', 'SECONDARY')}<div class="p10-atts"><div class="p10-k">SECONDARY ATTACHMENTS ${pips(ceGun(c, 's'), clsAtt(c, ceGun(c, 's')))}</div><div class="atiles">${slotTiles('s') || '<span class="at-none">NO ATTACHMENTS FOR THIS WEAPON</span>'}</div></div></div>
      <div class="p10-row eqp">${eqCard('LETHAL', c.lethal || 'frag', 'e:l')}${eqCard('TACTICAL', c.tactical || 'stun', 'e:t')}<div class="lcard small"><span class="lc-k">MELEE</span>${KNIFE_ICO}<span class="lc-n">COMBAT KNIFE</span><span class="lc-a"><small>ONE HIT</small></span></div></div>
    </div>`;
    main.querySelectorAll('[data-act]').forEach(b => {
      const a = b.dataset.act, which = a.split(':')[1], id = ceGun(c, which), att = clsAtt(c, id);
      if (a[0] === 'e') { b.addEventListener('click', () => { ceFrom = a; ceView = a; renderEditor(); }); return; }
      const hover = () => a[0] === 'r' ? showDetail(id, att, { sub: 'RETICLE', desc: `${RET_OPTICS[att.optic]}: ${shapesFor(att.optic)[settings.reticles[att.optic].shape]}, ${RET_COLORS[settings.reticles[att.optic].color][0]}. Reticles apply to that sight on every weapon.` })
        : a[0] === 'w' ? showDetail(id, att, { sub: which === 'p' ? 'PRIMARY' : 'SECONDARY', desc: 'Choose a different weapon.' })
        : showDetail(id, att, { sub: SLOT_NAMES[a.split(':')[2]].toUpperCase(), desc: ATTACHMENTS[a.split(':')[2]][att[a.split(':')[2]]].desc, hiSlot: a.split(':')[2] });
      b.addEventListener('focus', hover); b.addEventListener('mouseenter', hover);
      b.addEventListener('click', () => { ceFrom = a; ceView = a; if (a[0] === 'r') retOptic = att.optic; renderEditor(); });
    });
    showDetail(c.primary, clsAtt(c, c.primary), { sub: 'PRIMARY' });
  } else if (ceView[0] === 'w') {
    const which = ceView[2], list = which === 'p' ? PRIMARIES : SECONDARIES, cur = ceGun(c, which);
    parts.push(which === 'p' ? 'PRIMARY' : 'SECONDARY');
    const cats = [...new Set(list.map(id => WCAT[id]))];
    main.innerHTML = `<div class="wpick">${cats.map(cat => `<div class="wp-cat"><div class="group">${cat}</div><div class="wp-row">${list.filter(id => WCAT[id] === cat).map(id =>
      `<button class="wpc${id === cur ? ' on' : ''}" data-nav data-w="${id}">${thumb(id, clsAtt(c, id))}<span class="lc-n">${WEAPONS[id].name.toUpperCase()}</span><span class="lc-c">${WEAPONS[id].mode}${id === cur ? ' · EQUIPPED' : ''}</span></button>`).join('')}</div></div>`).join('')}</div>`;
    main.querySelectorAll('.wpc').forEach(b => {
      const id = b.dataset.w, hover = () => showDetail(id, clsAtt(c, id), { sub: WCAT[id], desc: `${WEAPONS[id].mode} · ${WEAPONS[id].rpm} RPM · ${WEAPONS[id].damage}${WEAPONS[id].pellets > 1 ? '×' + WEAPONS[id].pellets : ''} DMG` });
      b.addEventListener('focus', hover); b.addEventListener('mouseenter', hover);
      b.addEventListener('click', () => { if (which === 'p') c.primary = id; else c.secondary = id; loadoutChanged(); game.audio.play('ui', null, { ui: true }); ceView = 'over'; renderEditor(ceFrom); });
    });
    showDetail(cur, clsAtt(c, cur), { sub: WCAT[cur] });
    focusAct = focusAct || null;
  } else if (ceView[0] === 'e') {
    const slot = ceView[2] === 'l' ? 'lethal' : 'tactical', list = slot === 'lethal' ? LETHALS : TACTICALS, cur = c[slot] || list[0];
    parts.push(slot.toUpperCase());
    main.innerHTML = `<div class="apick"><div class="ap-grid">${list.map(k => `<button class="aptile${k === cur ? ' on' : ''}" data-nav data-eq="${k}">${EQ_ICO[k]}<span class="at-n">${EQUIPMENT[k].name}</span>${k === cur ? '<span class="at-eq">EQUIPPED</span>' : ''}</button>`).join('')}</div>
      <p class="pane-note" id="eq-desc">${escHtml(EQUIPMENT[cur].desc)}</p></div>`;
    main.querySelectorAll('.aptile').forEach(b => {
      const k = b.dataset.eq, hover = () => { $('eq-desc').textContent = EQUIPMENT[k].desc; };
      b.addEventListener('focus', hover); b.addEventListener('mouseenter', hover);
      b.addEventListener('click', () => { c[slot] = k; loadoutChanged(); game.audio.play('ui', null, { ui: true }); ceView = 'over'; renderEditor(ceFrom); });
    });
    showDetail(c.primary, clsAtt(c, c.primary), { sub: slot.toUpperCase(), desc: EQUIPMENT[cur].desc });
  } else if (ceView[0] === 'r') {
    const which = ceView[2], id = ceGun(c, which), att = clsAtt(c, id), r = settings.reticles[retOptic];
    parts.push(WEAPONS[id].name.toUpperCase(), 'RETICLE');
    const shapes = shapesFor(retOptic);
    main.innerHTML = `<div class="rpick"><div class="ap-tabs">${Object.keys(RET_OPTICS).map(o => `<span class="${o === retOptic ? 'on' : ''}">${RET_OPTICS[o]}${o === att.optic ? ' ●' : ''}</span>`).join('')}</div>
      <div class="rp-top"><div class="rp-view${retOptic === 'scope' ? ' scope' : retOptic === 'iron' ? ' iron' : ''}"><img src="${reticlePreview(retOptic, r.shape, r.color, 256)}" alt=""></div>
        <div class="rp-info"><b>${shapes[r.shape]}</b><span>${RET_OPTICS[retOptic]} · ${RET_COLORS[r.color][0]}</span><small>Applies to the ${RET_OPTICS[retOptic]} on every weapon and class. ${glyph('prevSub', game.input.lastDevice)} ${glyph('nextSub', game.input.lastDevice)} switch sight.</small></div></div>
      <div class="p10-k">RETICLE</div>
      <div class="rp-grid">${Object.keys(shapes).map(k => `<button class="rptile${k === r.shape ? ' on' : ''}" data-nav data-rs="${k}"><img src="${reticlePreview(retOptic, k, r.color, 96)}" alt=""><span class="at-n">${shapes[k]}</span></button>`).join('')}</div>
      <div class="p10-k">COLOUR</div>
      <div class="rp-cols">${Object.keys(RET_COLORS).map(k => `<button class="rpcol${k === r.color ? ' on' : ''}" data-nav data-rc="${k}" title="${RET_COLORS[k][0]}"><i style="background:${RET_COLORS[k][1]};box-shadow:0 0 10px ${RET_COLORS[k][1]}"></i><span>${RET_COLORS[k][0]}</span></button>`).join('')}</div></div>`;
    const set = (patch, el) => {
      settings.reticles = applyReticles({ ...settings.reticles, [retOptic]: { ...settings.reticles[retOptic], ...patch } });
      saveSettings(settings); game.audio.play('ui', null, { ui: true });
      const key = el.dataset.rs ? `[data-rs="${el.dataset.rs}"]` : `[data-rc="${el.dataset.rc}"]`;
      renderEditor(); setTimeout(() => { const f = main.querySelector(key); if (f) focusEl(f); }, 0);
    };
    main.querySelectorAll('.rptile').forEach(b => b.addEventListener('click', () => set({ shape: b.dataset.rs }, b)));
    main.querySelectorAll('.rpcol').forEach(b => b.addEventListener('click', () => set({ color: b.dataset.rc }, b)));
    showDetail(id, att, { sub: 'RETICLE', desc: `Equipped sight: ${RET_OPTICS[att.optic]}` });
    crumbs('ce-crumbs', parts);
    return;
  } else {
    const [, which, sl] = ceView.split(':'), id = ceGun(c, which), att = clsAtt(c, id), base = weaponDef(id, att);
    parts.push(WEAPONS[id].name.toUpperCase(), SLOT_NAMES[sl].toUpperCase());
    main.innerHTML = `<div class="apick"><div class="ap-tabs">${SLOTS.filter(s => GUNSMITH[id][s]).map(s => `<span class="${s === sl ? 'on' : ''}">${SLOT_NAMES[s]}</span>`).join('')}</div>
      <div class="ap-grid">${GUNSMITH[id][sl].map(k => `<button class="aptile${k === att[sl] ? ' on' : ''}" data-nav data-k="${k}">${icon(sl, k)}<span class="at-n">${ATTACHMENTS[sl][k].name}</span>${k === att[sl] ? '<span class="at-eq">EQUIPPED</span>' : ''}</button>`).join('')}</div>
      <p class="pane-note">${glyph('prevSub', game.input.lastDevice)} ${glyph('nextSub', game.input.lastDevice)} switch slot</p></div>`;
    main.querySelectorAll('.aptile').forEach(b => {
      const k = b.dataset.k, cand = { ...att, [sl]: k };
      const hover = () => showDetail(id, cand, { base, title: ATTACHMENTS[sl][k].name, sub: SLOT_NAMES[sl].toUpperCase(), desc: ATTACHMENTS[sl][k].desc, hiSlot: sl });
      b.addEventListener('focus', hover); b.addEventListener('mouseenter', hover);
      b.addEventListener('mouseleave', () => showDetail(id, att, { sub: SLOT_NAMES[sl].toUpperCase(), desc: ATTACHMENTS[sl][att[sl]].desc, hiSlot: sl }));
      b.addEventListener('click', () => { c.atts[id] = cand; loadoutChanged(); game.audio.play('ui', null, { ui: true }); ceView = 'over'; renderEditor(ceFrom); });
    });
    showDetail(id, att, { sub: SLOT_NAMES[sl].toUpperCase(), desc: ATTACHMENTS[sl][att[sl]].desc, hiSlot: sl });
  }
  crumbs('ce-crumbs', parts);
  if (game.input.lastDevice === 'pad' || focusAct) setTimeout(() => {
    const el = (focusAct && main.querySelector(`[data-act="${focusAct}"]`)) || main.querySelector('.wpc.on, .aptile.on') || main.querySelector('[data-nav]');
    if (el && game.input.lastDevice === 'pad') focusEl(el);
  }, 0);
}
// LT/RT in the attachment picker steps through the gun's slots
function ceStepSlot(dir) {
  if (editKey && ceView[0] === 'r') {
    const o = Object.keys(RET_OPTICS); retOptic = o[(o.indexOf(retOptic) + dir + o.length) % o.length]; renderEditor();
    if (game.input.lastDevice === 'pad') setTimeout(() => focusEl($('ce-main').querySelector('.rptile.on')), 0);
    return true;
  }
  if (!editKey || ceView[0] !== 'a') return false;
  const [, which, sl] = ceView.split(':'), c = clsGet(editKey), id = ceGun(c, which), list = SLOTS.filter(s => GUNSMITH[id][s]);
  const nx = list[(list.indexOf(sl) + dir + list.length) % list.length];
  ceView = ceFrom = `a:${which}:${nx}`; renderEditor();
  return true;
}
function renderGunsmith() { renderEditor(); }
function openEditor(key, act = null) {
  editKey = key; ceView = act || 'over'; ceFrom = act;
  $('cls-pick').classList.remove('on'); $('cls-editor').classList.add('on');
  $('cls-rename').value = clsGet(key).name;
  $('gunsmith').insertBefore($('gs-viewbox'), $('gs-desc'));
  renderEditor();
}
function closeEditor() {
  if (!editKey) return false;
  if (ceView !== 'over') { ceView = 'over'; renderEditor(ceFrom); return true; }
  clsSel = editKey; editKey = null;
  $('cls-editor').classList.remove('on'); $('cls-pick').classList.add('on');
  renderClasses();
  if (game.input.lastDevice === 'pad') setTimeout(() => focusEl($('cls-list').querySelector('.cls-row.sel')), 0);
  return true;
}
$('cls-equip').addEventListener('click', equipClass);
$('cls-edit').addEventListener('click', () => {
  if (isCustom(clsSel)) { openEditor(clsSel); return; }
  // copy a default into the equipped custom slot if one is equipped, else the first custom slot
  const i = isCustom(settings.cls) ? +settings.cls.slice(1) : 0;
  const src = clsGet(clsSel);
  settings.classes[i] = clsCopy(src, `${src.name} (C${i + 1})`.slice(0, 18));
  saveSettings(settings);
  openEditor('c' + i);
});
$('cls-back').addEventListener('click', closeEditor);
$('cls-rename').addEventListener('input', () => {
  const c = clsGet(editKey); if (!c || editKey[0] !== 'c') return;
  c.name = $('cls-rename').value.replace(/[<>]/g, '').slice(0, 18) || `CUSTOM CLASS ${+editKey.slice(1) + 1}`;
  saveSettings(settings);
});
$('cls-rename').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } });

// ---------- tabs ----------
const TABS = ['play', 'loadout', 'options'];
let tab = 'play';
function setTab(t) {
  if (tab === 'options' && t !== 'options' && optDirty()) { guardOptions(() => setTab(t)); return; }
  tab = t;
  if (t === 'options') { optBase = optState(); syncApplyBar(); }
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('#menu .pane').forEach(p => p.classList.toggle('on', p.id === `pane-${t}`));
  game.audio.play('ui', null, { ui: true });
  document.getElementById('menu').dataset.tab = t;
  if (t === 'loadout') { if (editKey) renderGunsmith(false); else renderClasses(); }
  if (t === 'options') { setOptSub(optSub); syncPadName(); }
  renderHints(game.input.lastDevice);
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

// ---------- PLAY as a menu tree (MW2019 style) ----------
// Level 1 is a column of playlist tiles; each opens its own page (Back returns). Offline the tiles are the
// game modes and open the match setup; online they're Quick Play, Private Match, Friends and Combat Training.
let playView = 'root', tileSel = null;
const TILE_ART = { modes: 'shuran-2', tdm: 'tarsa-2', gunfight: 'shuran-3', snd: 'pioneer-3', gungame: 'mart-2', ffa: 'drivein-2', infected: 'link-2', browser: 'tarsa-3', quick: 'drivein-1', private: 'pioneer-2', friends: 'link-1', training: 'mart-3', online: 'link-4' };
function playTiles() {
  if (playMode === 'online') return [
    { id: 'quick', k: `PUBLIC · ${quickModesLabel() === 'ALL' ? 'ALL MODES' : quickModesLabel()}`, t: 'QUICK MATCH', d: 'Drop into a public match in your modes. If none is open within 10 seconds, a lobby starts and counts down with a map vote while players drop in.' },
    { id: 'modes', k: 'QUICK MATCH PLAYLIST', t: 'EDIT MODES', d: 'Choose which game modes Quick Match looks for: any or all of Team Deathmatch, Free-for-All, Gunfight, Search & Destroy and Gun Game.' },
    { id: 'browser', k: 'EVERY PUBLIC MATCH', t: 'MATCH BROWSER', d: 'See the public matches being played right now, with their mode, map and players, and join one.' },
    { id: 'private', k: 'FRIENDS · 6-DIGIT CODE', t: 'PRIVATE MATCH', d: 'Host a match and share the code, or join a friend\'s. You choose the map, mode and rules; bots fill empty slots.' },
    { id: 'friends', k: 'PARTY · INVITES', t: 'FRIENDS', d: 'Your friends list, friend requests and your friend code.' },
    { id: 'training', k: 'OFFLINE · VERSUS BOTS', t: 'COMBAT TRAINING', d: 'Switch to offline matches against bots. No account needed.' },
  ];
  return [...['tdm', 'ffa', 'gunfight', 'snd', 'gungame', 'infected'].map(id => ({ id, k: 'VERSUS BOTS', t: MODES[id].name.toUpperCase(), d: MODES[id].blurb })),
    { id: 'online', k: 'ONLINE · PLAYERS', t: 'MULTIPLAYER', d: 'Quick play with anyone, or a private match with friends. Sign in with your email, no password.' }];
}
function tilePreview(t) {
  if (!t) return;
  $('it-k').textContent = t.k; $('it-t').textContent = t.t; $('it-d').textContent = t.d;
  $('tile-desc').textContent = t.d;
}
function renderTiles() {
  const list = playTiles();
  const cur = playMode === 'online' ? null : settings.mode;
  $('play-tiles').innerHTML = list.map(t => `<button class="tile${t.id === cur ? ' cur' : ''}" data-tile="${t.id}" data-nav role="listitem"><i class="art" style="background-image:url('assets/loading/${TILE_ART[t.id] || 'tarsa-1'}.jpg')"></i><small>${escHtml(t.k)}</small><b>${escHtml(t.t)}</b><span>${escHtml(t.d)}</span></button>`).join('');
  tilePreview(list.find(t => t.id === tileSel) || list.find(t => t.id === cur) || list[0]);
}
function crumbs(id, parts) { $(id).innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<b>${escHtml(p)}</b>` : `<span>${escHtml(p)}</span>`).join('<i>›</i>'); }
function openPlayView(v) {
  playView = v;
  document.querySelectorAll('#pane-play .pv').forEach(p => p.classList.toggle('on', p.id === `pv-${v}`));
  $('menu').dataset.pv = v;
  if (v === 'browser') openBrowser(); else closeBrowser();
  const name = v === 'browser' ? 'MATCH BROWSER' : v === 'quick' ? 'EDIT MODES' : v === 'setup' ? (playMode === 'online' ? 'PRIVATE MATCH' : (MODES[settings.mode] || MODES.tdm).name.toUpperCase()) : null;
  crumbs('play-crumbs', name ? ['PLAY', name] : ['PLAY']);
  $('pv-back').style.display = v === 'root' ? 'none' : '';
  const pc = $('play-crumbs').querySelector('span'); if (pc) { pc.classList.add('link'); pc.onclick = () => openPlayView('root'); }
  if (v === 'setup' && playMode === 'online') $('play-title').textContent = 'PRIVATE MATCH';
  if (v === 'root') renderTiles();
  if (v === 'quick') renderQuickModes();
  renderHints(game.input.lastDevice);
  if (game.input.lastDevice === 'pad') setTimeout(() => focusFirst(), 0);
}
$('pv-back').addEventListener('click', () => { game.audio.play('ui', null, { ui: true }); openPlayView('root'); });
$('play-tiles').addEventListener('click', (e) => {
  const b = e.target.closest('.tile'); if (!b) return;
  const id = tileSel = b.dataset.tile;
  game.audio.play('ui', null, { ui: true });
  if (MODES[id]) { const sel = $('opt-mode'); if (sel.value !== id) { sel.value = id; sel.dispatchEvent(new Event('change')); } openPlayView('setup'); }
  else if (id === 'quick') $('quick-btn').click();
  else if (id === 'modes') openPlayView('quick');
  else if (id === 'browser') openPlayView('browser');
  else if (id === 'private') openPlayView('setup');
  else if (id === 'friends') openSide();
  else if (id === 'training') { enterMenu('offline'); }
  else if (id === 'online') $('mode-online').click();
});
const tileHover = (e) => { const b = e.target.closest('.tile'); if (b) { tileSel = b.dataset.tile; tilePreview(playTiles().find(t => t.id === tileSel)); } };
$('play-tiles').addEventListener('mouseover', tileHover);
$('play-tiles').addEventListener('focusin', tileHover);

// ---------- welcome / message of the day (motd.json in the site root: edit it and push to change it) ----------
// kind: the small label over the heading (PRE-ALPHA now; MESSAGE OF THE DAY when there's no kind)
let motdData = null, motdShown = false;
fetch('motd.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(m => {
  if (!m || !m.body) return;
  motdData = m;
  for (const id of ['motd-menu', 'motd-lobby']) {
    const el = $(id);
    el.querySelector('.motd-t').textContent = String(m.title || '').slice(0, 80);
    el.querySelector('.motd-b').textContent = String(m.body).slice(0, 600);
    el.querySelector('.motd-date').textContent = m.date ? `· ${String(m.date).slice(0, 10)}` : '';
    el.querySelector('.motd-kind').textContent = String(m.kind || 'MESSAGE OF THE DAY').slice(0, 40).toUpperCase();
    el.hidden = false;
  }
}).catch(() => { /* offline: no message */ });

// ---------- match browser: every public match on the board, filtered by mode ----------
let mbTimer = 0, mbModes = new Set(QUICK_MODES);
function renderBrowser() {
  setHTML('mb-filters', QUICK_MODES.map(id => `<button class="mb-chip${mbModes.has(id) ? ' on' : ''}" data-mbm="${id}" data-nav>${escHtml(MODES[id].short)}</button>`).join(''));
  const all = lobby.board.list(PROTO), list = all.filter(a => mbModes.has(a.m));
  const focusCode = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.mb;
  setHTML('mb-list', list.map(a => `<button class="mb-row${a.n >= a.max ? ' full' : ''}" data-mb="${a.code}" data-nav ${a.n >= a.max ? 'disabled' : ''}>
    <span class="mb-h">${escHtml(a.h || 'Public lobby')}</span><span>${escHtml(MODES[a.m] ? MODES[a.m].name : a.m)}</span><span>${a.map && MAPS[a.map] ? escHtml(MAPS[a.map].name) : '<i>Voting</i>'}</span>
    <span>${a.n}/${a.max}</span><span class="mb-st ${a.ig ? 'ig' : 'lb'}">${a.n >= a.max ? 'FULL' : a.ig ? 'IN MATCH' : 'IN LOBBY'}</span></button>`).join(''));
  if (focusCode) { const b = $('mb-list').querySelector(`[data-mb="${focusCode}"]`); if (b) focusEl(b); }
  $('mb-note').textContent = !lobby.board.open ? 'Connecting…' : list.length ? `${list.length} match${list.length === 1 ? '' : 'es'} · updates every few seconds` : all.length ? 'No matches in the modes you picked right now.' : 'No public matches right now. Start one with Public Match, and it shows up here for everyone.';
}
function openBrowser() {
  lobby.board.connect();
  clearInterval(mbTimer);
  mbTimer = setInterval(() => { if (screen === 'menu' && playView === 'browser') renderBrowser(); }, 1000);
  renderBrowser();
}
function closeBrowser() {
  if (!mbTimer) return;
  clearInterval(mbTimer); mbTimer = 0;
  if (!lobby.active && !lobby.quickMode) lobby.board.close();
}
$('mb-filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mbm]'); if (!b) return;
  const id = b.dataset.mbm;
  if (mbModes.has(id) && mbModes.size > 1) mbModes.delete(id); else mbModes.add(id);
  game.audio.play('ui', null, { ui: true });
  renderBrowser(); focusEl($('mb-filters').querySelector(`[data-mbm="${id}"]`));
});
$('mb-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mb]'); if (!b || b.disabled) return;
  game.input.goFullscreen();
  readAll(); game.audio.init(); game.audio.play('ui', null, { ui: true });
  joinError = '';
  closeBrowser();
  // join it as public matchmaking: if that lobby is gone or full, the search carries on in your modes
  lobby.close();
  Object.assign(lobby, { quickMode: true, quickModes: settings.quickModes, quickGm: null, quickTried: new Set([b.dataset.mb]), quickName: myName(), quickPrimary: loadoutFromSettings(settings), quickDeadline: Date.now() + 10000 });
  lobby.board.connect();
  lobby.join(b.dataset.mb, myName(), loadoutFromSettings(settings), true);
  showScreen('lobby');
  renderLobby();
});

// ---------- OPTIONS: sub-tabs and a description panel (MW2019 style) ----------
const OPT_SUBS = ['general', 'graphics', 'controls', 'audio', 'account', 'about'];
const SUB_NAMES = { general: 'GENERAL', graphics: 'GRAPHICS', controls: 'CONTROLS', audio: 'AUDIO', account: 'ACCOUNT', about: 'ABOUT' };
const GROUP_SUB = { PROFILE: 'general', GRAPHICS: 'graphics', AIMING: 'controls', 'MOUSE & KEYBOARD': 'controls', CONTROLLER: 'controls', ONLINE: 'general', ACCOUNT: 'account', AUDIO: 'audio', ABOUT: 'about' };
{
  let cur = 'general';
  for (const el of document.querySelector('#pane-options .rows.two').children) {
    if (el.classList.contains('group')) cur = GROUP_SUB[el.textContent.trim().toUpperCase()] || cur;
    el.dataset.osub = cur;
  }
  document.querySelector('#pane-options .controls-ref').dataset.osub = 'controls';
}
const OPT_DESC = {
  'opt-theme': 'The accent colour of the menus, highlights, buttons and HUD details. It only changes how the game looks to you.',
  'opt-name': 'The name other players see. Signed in, this is your Name Tag: it can change once a day and friends can see your previous ones.',
  'opt-quality': 'Sets every graphics option in this list at once. Changing any one of them switches the preset to Custom. Mobile is built for phones and tablets: fast render path with MSAA, a pixel budget for high-DPI screens, low geometry, hard shadows.',
  'opt-fsr': 'AMD FidelityFX Super Resolution 1.0. The game draws the scene at the percentage shown and FSR upscales it to your screen with edge-aware filtering and sharpening: more frames for a small loss in detail. Works on every GPU, on top of any preset; dynamic resolution moves the render scale further when frames run long.',
  'opt-fsrsharp': 'How strongly FSR sharpens the upscaled image (RCAS).',
  'opt-gfxmsaa': 'Multisample anti-aliasing smooths the edges of geometry itself (thin gun parts, wires, railings) before SMAA cleans up the rest. 4× is the sweet spot; 8× costs more for a small gain.',
  'opt-gfxpath': 'Full: the post-processing chain (SMAA, bloom, ambient occlusion, colour grade). Fast: draws straight to the screen with hardware MSAA; much lighter on phones. Switching restarts the game from the menu.',
  'opt-gfxdetail': 'Low: the world uses square-edged boxes and lighter sandbags, small props stop casting shadows, and other players\' guns use simpler geometry. Rebuilds the map.',
  'opt-gfxres': 'Renders the 3D view at this share of your screen\'s pixels. Lower runs faster; over 100% supersamples for sharper edges.',
  'opt-gfxshadows': 'Resolution of the sun\'s shadows. Higher is crisper and costs more GPU time. Off is fastest.',
  'opt-fps': 'Shows performance in the corner: frames per second, the slowest frame (stutters show up here), the time your CPU spends on each frame, the GPU\'s time where the browser can measure it, and draw calls. Your ping too when you join someone\'s online match. If the game feels slow, a screenshot of this tells us why.',
  'opt-fpscap': 'Caps the frame rate to save power and heat. Unlimited follows your display.',
  'opt-menubg': 'Pictures: screenshots of the maps behind the menus, nothing drawn in 3D until you play (smooth menus on any machine). Live 3D: the map itself, slowly flying round (uses the graphics card the whole time you are in the menus).',
  'opt-fov': 'How wide your view is. Higher shows more around you; lower makes distant targets bigger.',
  'opt-vmfov': 'How large your weapon looks in first person. It doesn\'t change what you can see.',
  'opt-adsmode': 'Hold: aim while the button is held. Toggle: press once to aim, press again to stop.',
  'opt-adszoom': 'How far the view zooms when you aim down sights. Aiming sensitivity scales with it.',
  'opt-sightsize': 'Draws red dots, holographic sights and scopes larger while aiming.',
  'opt-sens': 'How fast the view turns with the mouse.',
  'opt-invert': 'Moving the mouse or stick up looks down.',
  'opt-adssens': 'How fast the view turns while aiming down sights, compared with the hip (mouse and stick). Lower it for steadier long-range aim.',
  'opt-autosprint': 'Sprint automatically whenever you push fully forward. Aiming, firing or crouching stops it; tactical sprint still works.',
  'opt-padsens': 'How fast the view turns with the right stick.',
  'opt-deadzone': 'Ignores small stick movements so the view doesn\'t drift. Raise it if your controller drifts.',
  'opt-aa': 'With a controller, your aim slows over enemies and follows them slightly. Mouse aim is never assisted.',
  'opt-vib': 'Controller rumble on shots, hits and explosions.',
  'opt-vol': 'Volume of everything: weapons, footsteps, voices and music.',
  'opt-announcer': 'Who calls the match: the mode, medals, rounds, the bomb. Each has their own voice and wording, and a few ways of saying each thing. Picking one plays a line.',
  'opt-voice': 'The voice your operator calls out reloads, grenades and so on in. Any: whichever voice the match hands you. Picking one plays a line.',
  'opt-music': 'Volume of the menu and match music only.',
  'opt-matchmusic': 'Closing moments only: quiet during play (you hear the fight), music for the last minute or a close finish. The whole match: music all the way through, building with the fighting.',
  'opt-touchsize': 'Size of the on-screen buttons on phones and tablets.',
  'opt-touchads': 'Tap: tap ADS to aim and tap again to stop. Hold: aim while your finger is on the button.',
  'opt-autofire': 'Fires automatically while your crosshair is on an enemy (touch only).',
};
let optSub = 'general';
const subsAvail = () => OPT_SUBS.filter(x => x !== 'account' || document.body.classList.contains('has-account'));
function optDescFor(row) {
  if (!row) return;
  const label = row.querySelector('label'); if (!label) return;
  const c = label.cloneNode(true); c.querySelectorAll('small, output').forEach(x => x.remove());
  const ctl = row.querySelector('input, select, button');
  const small = label.querySelector('small');
  $('od-title').textContent = c.textContent.replace(/\s+/g, ' ').trim();
  $('od-text').textContent = (ctl && OPT_DESC[ctl.id]) || (small ? small.textContent.trim() : '');
}
function setOptSub(sub) {
  if (!subsAvail().includes(sub)) sub = 'general';
  optSub = sub;
  document.querySelectorAll('#opt-subtabs .subtab').forEach(b => b.classList.toggle('on', b.dataset.sub === sub));
  document.querySelectorAll('#pane-options [data-osub]').forEach(el => el.classList.toggle('osub-off', el.dataset.osub !== sub));
  $('pane-options').dataset.sub = sub;
  crumbs('opt-crumbs', ['OPTIONS', SUB_NAMES[sub]]);
  $('od-k').textContent = SUB_NAMES[sub];
  optDescFor(document.querySelector(`#pane-options .row[data-osub="${sub}"]:not(.osub-off) label`)?.closest('.row'));
  document.querySelector('#pane-options .opt-body')?.scrollTo?.({ top: 0 });
}
function stepOptSub(d) { const l = subsAvail(), i = Math.max(0, l.indexOf(optSub)); setOptSub(l[(i + d + l.length) % l.length]); game.audio.play('ui', null, { ui: true }); }
document.querySelectorAll('#opt-subtabs .subtab').forEach(b => b.addEventListener('click', () => { setOptSub(b.dataset.sub); game.audio.play('ui', null, { ui: true }); }));
const optHover = (e) => { const r = e.target.closest('#pane-options .row'); if (r) optDescFor(r); };
$('pane-options').addEventListener('mouseover', optHover);
$('pane-options').addEventListener('focusin', optHover);
setOptSub('general');

// ---------- screens ----------
let screen = 'menu';
function showScreen(id) {
  closeDropdown();
  try { if (id !== 'lobby' && clSetup) closeLobbySetup(); if (id !== 'lobby' && clModes) { clModes = false; saveSettings(settings); } } catch (_) { /* before init */ }
  if (id !== 'pause' && id !== 'lobby' && $('pane-loadout').closest('#pause, #cl')) { clEditing = false; restorePanes(); }
  if (id !== 'pause') clearInterval(pauseTimer);
  screen = id;
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
  document.body.classList.toggle('side-ok', sideAllowed());
  document.body.classList.toggle('in-menus', !!id && id !== 'loading');
  if (window.__chatReady) { if (chatOpen) closeChat(); syncChat(); }
  if (sideOpen && !sideAllowed()) closeSide();
  document.body.classList.toggle('ingame', id === null);
  syncMenuBg();
  if (id && game.input.lastDevice === 'pad') setTimeout(() => focusFirst(), 0);
}

// ---------- menu background: map screenshots, or the live 3D map (Options > Graphics) ----------
// Drawing the 3D map behind the menus kept the graphics card busy the whole time: on a slow machine the menus
// themselves went sluggish. By default the menus show pictures and nothing 3D is drawn until a match.
const MENU_PHOTOS = [...new Set(Object.values(MAPS).flatMap(m => m.photos || []))];
let mbgTimer = 0, mbgIdx = (Math.random() * MENU_PHOTOS.length) | 0, mbgLayer = 0;
function menuPhoto() {
  if (!MENU_PHOTOS.length) return;
  const src = MENU_PHOTOS[mbgIdx++ % MENU_PHOTOS.length], layers = $('menu-bg').children;
  loadPhoto(src).then(im => {
    if (!im || !document.body.classList.contains('still-menu')) return;
    const next = layers[mbgLayer ^= 1], prev = layers[mbgLayer ^ 1];
    next.style.backgroundImage = `url("${src}")`;
    next.classList.remove('on'); void next.offsetWidth; next.classList.add('on');
    prev.classList.remove('on');
  });
}
function syncMenuBg() {
  const still = settings.menuBg !== 'live' && game.state === 'menu' && screen !== 'loading';
  // nothing 3D is drawn behind the pictures, or behind the loading screen before a match (it covers the page)
  game.menuStill = still || (game.state === 'menu' && screen === 'loading');
  if (still === document.body.classList.contains('still-menu')) return;
  document.body.classList.toggle('still-menu', still);
  clearInterval(mbgTimer);
  if (still) { menuPhoto(); mbgTimer = setInterval(menuPhoto, 12000); }
}
setInterval(() => { if (typeof screen !== 'undefined') syncMenuBg(); }, 500);   // (the match state can change after the screen does)

// ---------- loading screen (between the menu and a match) ----------
function setLoadingPhoto(id) {
  const bg = $('ld-bg'), src = id ? mapPhoto(id) : null;
  bg.classList.remove('on'); $('loading').classList.remove('has-photo');
  if (!src) return;
  loadPhoto(src).then(im => { if (!im) return; $('loading').classList.add('has-photo'); bg.style.backgroundImage = `url("${src}")`; bg.classList.remove('kb'); void bg.offsetWidth; bg.classList.add('on', 'kb'); });
}
function drawLoadingMap(id) {
  const c = $('ld-mapc'), wrap = c.parentElement;
  const have = id && game.world.id === id && game.minimap;
  wrap.classList.toggle('on', !!have);
  if (have) { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(game.minimap.canvas, 0, 0, c.width, c.height); }
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let launching = false;   // one match start at a time (a double click or Enter + click used to start two)
function launch(cfg, online = null) {
  if (launching) return Promise.resolve();
  launching = true;
  return launchMatch(cfg, online).finally(() => { launching = false; });
}
function launchMatch(cfg, online) {
  const guestCfg = online && online.start && online.start.cfg;
  // online, your Name Tag always comes from your account (the host's own character used to fall back to "Operator")
  if (online) { cfg = { ...cfg, name: myName() || 'Operator' }; if (online.lobby && online.lobby.role === 'host') online.lobby.hostName = cleanName(myName() || 'Operator'); }
  // "Random" is decided here, before the loading screen, so it can name the map
  if (!guestCfg && !MAPS[cfg.map]) { const ids = Object.keys(MAPS); cfg = { ...cfg, map: ids[(Math.random() * ids.length) | 0] }; }
  const gm = MODES[(guestCfg && guestCfg.mode) || cfg.mode] || MODES.tdm;
  const mapId = (guestCfg && guestCfg.map) || cfg.map;
  const map = MAPS[mapId];
  const ld = $('loading');
  ld.classList.remove('boot');
  $('ld-mode').textContent = `${gm.name.toUpperCase()}${online ? ' · MULTIPLAYER' : ' · COMBAT TRAINING'}`;
  $('ld-name').textContent = map ? map.name.toUpperCase() : 'LOADING';
  $('ld-desc').textContent = map ? (map.blurb || '') : '';
  $('ld-tip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
  const fill = $('load-fill');
  const step = (pct, text) => { fill.style.width = `${pct}%`; $('load-text').textContent = `${text} · ${pct}%`; };
  fill.style.transition = 'none'; step(0, 'Loading');
  setLoadingPhoto(map ? mapId : null);
  drawLoadingMap(map ? mapId : null);
  showScreen('loading');
  const t0 = performance.now();
  return (async () => {
    await nextFrame();
    fill.style.transition = '';
    step(15, 'Loading textures');
    await wait(160); await nextFrame();
    step(35, 'Building the map');
    await wait(220); await nextFrame();   // let the bar paint before the (blocking) build
    try { game.startMatch(cfg, online); } catch (e) {
      console.error(e);
      try { game.quitToMenu(); } catch (_) { /* best effort */ }
      showScreen('menu');
      offer('THE MATCH COULDN\'T START', `Something went wrong building ${map ? map.name : 'the map'}. Try again or pick another map; if it keeps happening, the Low preset or a page reload usually fixes it.`, () => location.reload(), 'RELOAD PAGE', 'OK');
      return;
    }
    const w = MAPS[game.world.id];
    $('ld-name').textContent = (w ? w.name : game.world.name || '').toUpperCase();
    if (w) $('ld-desc').textContent = w.blurb || '';
    drawLoadingMap(game.world.id);
    step(80, 'Deploying squads');
    await wait(200); await nextFrame();
    // build the bots' guns now, not mid-match; then warm up shaders so the first seconds don't stutter
    try { prewarmBotGuns(); } catch (_) { /* optional */ }
    try { await game.prewarm(); } catch (_) { /* optional */ }
    drawLoadingMap(game.world.id);   // (the minimap is ready once the shaders are)
    step(100, 'Ready');
    await wait(Math.max(online && online.mode === 'guest' ? 150 : 450, 1300 - (performance.now() - t0)));
    if (screen === 'loading') showScreen(null);
    // loaded: hosting or offline, the intro countdown can start (online, once every guest says the same); a guest
    // tells the host
    if (online && online.mode === 'guest') { if (lobby.hostId) lobby.net.send({ t: 'rdy' }, lobby.hostId); }
    else game.introReady();
  })();
}
function deploy() {
  game.input.goFullscreen();   // in the click itself: the browser only allows fullscreen (and Ctrl+W capture) inside a user gesture
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
  if (pauseSec === 'options' && sec !== 'options' && optDirty()) { guardOptions(() => setPauseSec(sec)); return; }
  pauseSec = sec;
  document.querySelectorAll('.psec').forEach(b => b.classList.toggle('on', b.dataset.sec === sec));
  document.querySelectorAll('.psec-pane').forEach(p => p.classList.toggle('on', p.id === `psec-${sec}`));
  if (sec === 'loadout') { $('psec-loadout').appendChild($('pane-loadout')); $('pane-loadout').classList.add('on'); if (editKey) renderGunsmith(false); else renderClasses(); }
  if (sec === 'options') { $('psec-options').appendChild($('pane-options')); $('pane-options').classList.add('on'); writeForm(); optBase = optState(); syncApplyBar(); }
  if (sec === 'match') renderPauseMatch();
  renderHints(game.input.lastDevice);
}
const ordinal = (n) => `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const mmss = (t) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
function renderPauseMatch() {
  const g = game, p = g.player;
  if (!p) return;
  $('pause-meta').textContent = `${(MODES[g.settings.mode] || MODES.tdm).name.toUpperCase()} · ${(MAPS[g.world.id]?.name || '').toUpperCase()}${g.mode === 'local' ? ' · VS BOTS' : ' · ONLINE'}`;
  if (g.ffa) {
    const st = g.ffaStandings(), lv = (c) => (g.gg ? (c.ggLevel || 0) : c.kills), top = st.find(c => c !== p);
    $('pm-fl').textContent = `YOU · ${ordinal(st.indexOf(p) + 1)}`; $('pm-el').textContent = 'LEADER';
    $('pm-f').textContent = lv(p); $('pm-e').textContent = top ? lv(top) : 0;
  } else {
    $('pm-fl').textContent = 'FRIENDLY'; $('pm-el').textContent = 'ENEMY';
    $('pm-f').textContent = g.scores[p.team];
    $('pm-e').textContent = g.scores[1 - p.team];
  }
  $('pm-time').textContent = mmss(g.timeLeft);
  $('pm-limit').textContent = `FIRST TO ${g.settings.scoreLimit}`;
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
  const lo = parseLoadout(p.loadout);
  const build = [WEAPONS[lo.primary].name.toUpperCase(), ...attSummary(lo.primary, lo.att), '+ ' + WEAPONS[lo.secondary || 'pistol'].name.toUpperCase()].join(' · ');
  $('pm-me').innerHTML = [['SCORE', p.score], ['KILLS', p.kills], ['DEATHS', p.deaths], ['ASSISTS', p.assists], ['K/D', kd], ['STREAK', p.streak]]
    .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('') + `<p class="pm-build">${esc(build)}</p>`;
  g.hud.renderScoreboard($('pause-board'));
  renderPausePlayers();
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
    setPauseSec(game.wantLoadout || (p && (!p.alive || game.inSpawnWindow(p))) ? 'loadout' : 'match');
    game.wantLoadout = false;
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
  const mine = r.playerTeam;
  if (r.ffa) {
    // Free-for-All: your placing; the top three count as a win
    title.textContent = r.place === 1 ? 'VICTORY' : `${ordinal(r.place).toUpperCase()} PLACE`;
    title.classList.add(r.place && r.place <= 3 ? 'win' : 'lose');
    $('end-score').innerHTML = `<span style="color:${FRIENDLY_CSS}">${ordinal(r.place).toUpperCase()}</span> <span style="color:var(--ink-faint)">OF ${r.count}</span>`;
  } else {
    if (r.winner === -1) title.textContent = 'DRAW';
    else if (r.winner === r.playerTeam) { title.textContent = 'VICTORY'; title.classList.add('win'); }
    else { title.textContent = 'DEFEAT'; title.classList.add('lose'); }
    $('end-score').innerHTML = `<span style="color:${FRIENDLY_CSS}">${r.scores[mine]}</span> <span style="color:var(--ink-faint)">—</span> <span style="color:${ENEMY_CSS}">${r.scores[1 - mine]}</span>`;
  }
  const mvp = r.mvp;
  $('end-mvp').textContent = `MVP  ${mvp.name.toUpperCase()}  ·  ${mvp.score} PTS  ·  ${mvp.kills}/${mvp.deaths}`;
  game.hud.renderScoreboard($('end-board'));
  reportMatch(r);
  $('again').firstElementChild.textContent = r.mode === 'local' ? 'PLAY AGAIN' : 'BACK TO LOBBY';
  setTimeout(() => { if (game.state === 'ended') showScreen('end'); }, 900);
  // 10 seconds on the scoreboard, then back to the lobby (online: the next-map vote is there) or the menu
  clearInterval(endTimer);
  let left = 10.9;
  const tickEnd = () => {
    if (game.state !== 'ended') { clearInterval(endTimer); $('end-next').textContent = ''; return; }
    left -= 0.25;
    const n = Math.max(0, Math.ceil(left));
    $('end-next').innerHTML = `${lobby.active ? 'BACK TO THE LOBBY' : 'BACK TO THE MENU'} IN <b>${n}</b>`;
    if (left <= 0) {
      clearInterval(endTimer);
      if (lobby.active) $('again').click();
      else { game.quitToMenu(); writeForm(); showScreen('menu'); setTab('play'); openPlayView(playMode === 'online' ? 'root' : 'setup'); }
    }
  };
  endTimer = setInterval(tickEnd, 250);
  tickEnd();
  if (lobby.public && lobby.role === 'host') {
    // public lobbies vote on the next map; the countdown starts once most players are back
    clearTimeout(nextMatchT);
    lobby.startMapVote(shuffleArr(Object.keys(MAPS)).slice(0, 3));
  }
};
const shuffleArr = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
let nextMatchT = 0, endTimer = 0;
$('again').addEventListener('click', () => {
  clearInterval(endTimer);
  game.input.goFullscreen();
  if (lobby.active) { lobby.mapReady(); openLobby(); return; }
  launch(settings);
});
$('menu-btn').addEventListener('click', () => { clearInterval(endTimer); leaveOnline(); game.quitToMenu(); writeForm(); showScreen('menu'); });

// ---------- online (peer-to-peer, 6-digit codes) ----------
// sandboxed previews can't open WebRTC/WebSocket connections; builds there set this flag
if (window.BREACHPOINT_OFFLINE) {
  document.querySelectorAll('#pane-play .mo-on').forEach(el => { el.style.display = 'none'; });
  document.querySelector('#pane-play .pane-sub').textContent = 'Online play (6-digit codes) works on the GitHub Pages version of the game.';
}
const lobby = new Lobby(game);
lobby.account = account;
lobby.myXp = 0;   // from the account server (refreshed when you open multiplayer and after each match)
window.__lobby = lobby;
// a match only starts on its own for a player who is in the lobby (or on the scoreboard of the last match);
// anyone who has wandered back to the menus is taken out of the lobby instead
const awayFromLobby = () => game.state === 'menu' && screen !== 'lobby' && screen !== 'loading';
lobby.onMapVoteDone = (mapId) => {
  if (!lobby.public || lobby.role !== 'host') return;
  if (awayFromLobby()) { leaveOnline(); return; }
  lobby.nextMap = mapId;
  clearTimeout(nextMatchT);
  launch(publicSettings(), { mode: 'host', lobby }).then(() => { lobby.broadcastLobby(); syncOnlineFlags(); });
};
function renderMapVote() {
  const mv = lobby.mapVote;
  const html = !mv ? '' : `<div class="mv-head"><b>VOTE FOR THE NEXT MAP</b><span>${mv.cd >= 0 ? `NEXT MATCH IN <i>${mv.cd}</i>` : `WAITING FOR PLAYERS · ${mv.rd}/${mv.n} IN THE LOBBY`}</span></div>
    <div class="mv-opts">${mv.o.map((id, i) => `<button class="mv-opt ${mv.my === i ? 'on' : ''}" data-mv="${i}" data-nav><b>${esc(MAPS[id] ? MAPS[id].name : id)}</b><small>${esc(MAPS[id] && MAPS[id].blurb || '')}</small><span>${mv.v[i] || 0} ${mv.v[i] === 1 ? 'VOTE' : 'VOTES'}</span></button>`).join('')}</div>`;
  for (const id of ['mv-end', 'mv-join', 'mv-host']) setHTML(id, html);
}
lobby.onMapVote = () => { renderMapVote(); if (screen === 'lobby') renderClassic(); };
for (const id of ['mv-end', 'mv-join', 'mv-host']) $(id).addEventListener('click', (e) => { const b = e.target.closest('[data-mv]'); if (b) { lobby.voteMap(+b.dataset.mv); game.audio.play('ui', null, { ui: true }); } });
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
  // (still searching the lobby list, Quick Match has no role yet, but its search must stop too: left running,
  // it opened a lobby a few seconds later and started a match while the player sat in the menu)
  if (lobby.active || lobby.quickMode) lobby.close();
  syncOnlineFlags();
  clearChat();
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
  $('fillbots-row').style.display = lobby.public ? 'none' : '';
  $('opt-fillbots').checked = settings.fillBots !== false;
  const inf = lobby.role === 'guest' ? lobby.info : null;
  $('join-info').textContent = inf ? [(MODES[inf.m] || MODES.tdm).name, MAPS[inf.map] ? MAPS[inf.map].name : 'Random map', `${inf.n}v${inf.n}`, inf.b ? 'bots fill empty slots' : 'no bots, players only', inf.ff ? 'friendly fire' : ''].filter(Boolean).join(' · ') : '';
  $('code-slots').style.display = lobby.quickMode && !lobby.code ? 'none' : '';
  const quickish = quickIntro || lobby.quickMode || lobby.public;
  $('join-label').textContent = quickish ? 'QUICK MATCH' : 'ENTER MATCH CODE';
  $('lobby-hints').style.visibility = '';
  if (quickish) { const d = game.input.lastDevice; $('lobby-hints').innerHTML = d === 'touch' ? '' : `<span>${glyph('back', d)} Cancel matchmaking</span>`; } else if ($('lobby-hints').dataset.q) renderHints(game.input.lastDevice);
  $('lobby-hints').dataset.q = quickish ? '1' : '';
  const cn = $('conn-note');
  cn.textContent = !lobby.active || quickIntro ? '' : lobby.net.relayed ? '● Connected through Cloudflare relay: your IP address is hidden' : lobby.net.room ? 'Direct peer-to-peer connection' : '';
  cn.classList.toggle('hidden-ip', !!lobby.net.relayed);
  if (quickIntro) { $('lobby-leave').textContent = 'BACK'; $('lobby-leave').classList.remove('cancel'); renderClassic(); return; }
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
    $('lobby-start').style.display = inMatch || lobby.public || lobby.quickMode ? 'none' : '';
    $('lobby-back').style.display = inMatch ? '' : 'none';
    $('host-note').textContent = inMatch
      ? 'Players you accept now drop straight into the match, taking a bot\'s place.'
      : `${(MODES[settings.mode] || MODES.tdm).name} · ${MAPS[settings.map] ? MAPS[settings.map].name : 'Random map'} · ${settings.mode === 'gunfight' ? '2v2' : ((MODES[settings.mode] || {}).ffa || settings.mode === 'infected') ? `${settings.teamSize * 2} players` : `${settings.teamSize}v${settings.teamSize}`}${settings.mode === 'tdm' || !settings.mode ? ` · ${settings.scoreLimit} kills · ${settings.timeLimit} min` : settings.mode === 'ffa' ? ` · 30 kills · ${settings.timeLimit} min` : settings.mode === 'infected' ? ' · 5 min' : ''}${settings.friendlyFire ? ' · friendly fire' : ''}. Change them with Game Mode, Map and Game Setup; ${settings.fillBots === false ? 'no bots: only real players.' : 'bots fill empty slots.'}`;
    $('lobby-leave').textContent = inMatch ? 'END SESSION' : lobby.public ? 'CANCEL MATCHMAKING' : 'CLOSE LOBBY';
    $('lobby-leave').classList.toggle('cancel', !inMatch && !!lobby.public);
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
    else if (lobby.status === 'searching') {
      // a wrong code waits out the whole search: after a few seconds, say what usually causes it
      const secs = Math.round((Date.now() - (lobby.searchAt || Date.now())) / 1000);
      html = secs < 8 ? '<span class="spin"></span>Looking for the match…'
        : `<span class="spin"></span>Still looking (${secs}s)… Check the code matches the one on the host's lobby screen, and that they're still in it.`;
    }
    else if (lobby.status === 'pending') html = '<span class="spin"></span>Found it. Waiting for the host to let you in…';
    else if (lobby.status === 'accepted' || lobby.status === 'ingame') {
      st.classList.add('good');
      html = lobby.hostInGame ? '<span class="spin"></span>Joining the match in progress…' : '<span class="spin"></span>You\'re in. Waiting for the host to start…';
    }
    setHTML('join-status', html);
    const ro = lobby.roster || [];
    $('join-players-wrap').style.display = ro.length ? '' : 'none';
    setHTML('join-players', ro.map(p => playerRow({ name: p.n, team: p.tm, tag: p.h ? 'HOST' : '' })).join(''));
    const searching = busy && !(lobby.status === 'accepted' || lobby.status === 'ingame');
    $('lobby-leave').textContent = !busy ? 'BACK' : searching ? (lobby.quickMode ? 'CANCEL MATCHMAKING' : 'CANCEL') : 'LEAVE LOBBY';
    $('lobby-leave').classList.toggle('cancel', searching);
    if (lobby.quickMode && !inf) $('join-info').textContent = `Searching: ${(MODES[settings.mode] || MODES.tdm).name} · map voted in the lobby`;
  }
  renderClassic();
  if (game.input.lastDevice === 'pad' && !document.querySelector('#lobby .pad-focus')) focusFirst();
}
lobby.onUpdate = () => { renderLobby(); noteRecent(lobbyPeople()); syncChat(); };
// ---------- classic lobby (menu + map on the left, players on the right) ----------
let clDescText = '', clEditing = false, clSetup = false, clModes = false;
const classicOn = () => !quickIntro && (lobby.role === 'host' || lobby.role === 'guest' || !!lobby.quickMode);
const mapCard = (id, modeName, extra = '') => {
  const m = MAPS[id], ph = m && `assets/loading/thumbs/${id}.jpg`;   // the map's thumbnail (its first photo, small)
  return m
    ? `<div class="cl-map" style="${ph ? `background-image:url('${ph}')` : ''}">${extra}<span class="cl-mn"><b>${esc(m.name.toUpperCase())}</b><small>${esc(modeName)}</small></span></div>`
    : `<div class="cl-map classified">${extra}<span class="cl-mn"><b>MAP CLASSIFIED</b><small>${esc(modeName)}</small></span></div>`;
};
function clPeople() {
  if (lobby.role === 'host') {
    const list = [{ n: myName() || 'Operator', tm: lobby.hostTeam, h: 1, x: lobby.myXp | 0, me: 1, id: 'host' }];
    for (const p of lobby.players.values()) list.push({ n: p.name, tm: p.team, h: 0, x: p.xp | 0, ping: p.ping, id: p.peerId });
    return list;
  }
  const mine = myName();
  let found = false;
  const ro = (lobby.roster || []).map(p => { const me = !found && !p.h && p.n === mine; if (me) found = true; return { n: p.n, tm: p.tm, h: p.h, x: p.x | 0, me }; });
  if (!ro.length) ro.push({ n: mine || 'Operator', tm: 0, h: 0, x: lobby.myXp | 0, me: 1 });
  return ro;
}
function renderClassic() {
  const on = classicOn();
  $('lobby').classList.toggle('classic', on);
  $('lobby').classList.toggle('cl-editing', on && (clEditing || clSetup || clModes));
  $('lobby').classList.toggle('cl-modes-on', on && clModes);
  if (!on) { if (clEditing) closeClassEditor(); return; }
  const host = lobby.role === 'host', inMatch = host && game.mode === 'host' && game.live;
  const pub = !!(lobby.public || lobby.quickMode);
  const inf = lobby.info || {};
  const mode = MODES[inf.m] || MODES[settings.mode] || MODES.tdm;
  const searching = lobby.quickMode && lobby.role !== 'host' && !(lobby.info && lobby.info.m);
  $('cl-title').textContent = searching ? `QUICK MATCH / ${quickModesLabel() === 'ALL' ? 'ALL MODES' : quickModesLabel()}` : `${pub ? 'PUBLIC MATCH' : 'PRIVATE MATCH'} / ${mode.name.toUpperCase()}`;
  setHTML('cl-code', !pub && lobby.code ? `MATCH CODE <b>${fmtCode(lobby.code)}</b>` : '');
  // menu
  const items = [];
  if (host && !inMatch && !pub) items.push(['start', startCd ? `CANCEL START · ${startCd.shown}` : 'START MATCH', settings.fillBots === false && !pub ? 'Start with the players in the lobby. No bots: each team needs at least one player.' : 'Start the match. Bots fill any empty slots.']);
  if (inMatch) items.push(['back', 'BACK TO MATCH', 'Return to the match in progress.']);
  const filterable = pub && (lobby.quickMode || lobby.role === 'host') && !inMatch;
  if (filterable) items.push(['modes', `GAME MODES: ${quickModesLabel()}`, 'Pick the modes you want to play. Matchmaking joins any of them.']);
  items.push(['class', 'CREATE A CLASS', 'Pick your class and build your guns. The class you equip is the one you spawn with.']);
  if (host && !pub && !inMatch) {
    // private match: the host sets the match up right here (press to step through, or ← → on a controller)
    const mapName = MAPS[settings.map] ? MAPS[settings.map].name.toUpperCase() : 'RANDOM';
    items.push(['mode', `GAME MODE: ${mode.name.toUpperCase()}`, `${mode.blurb} Press to change the mode (← → steps through them).`]);
    items.push(['map', `MAP: ${mapName}`, 'Press to change the map (← → steps through them). Random picks one when the match starts.']);
    items.push(['setup', 'GAME SETUP', 'Mode, map, match size, score and time limits, bot difficulty and friendly fire.']);
  }
  if (host && !pub) {
    items.push(['invite', 'COPY INVITE LINK', 'Copy a link your friends can open to join this lobby.']);
    items.push(['approve', `JOIN APPROVAL: ${lobby.approval ? 'ON' : 'OFF'}`, 'On: you accept each player before they get in. Friends always get straight in.']);
    items.push(['bots', `FILL WITH BOTS: ${settings.fillBots === false ? 'OFF' : 'ON'}`, 'Off: only real players, and each team needs at least one.']);
  }
  const leave = $('lobby-leave').textContent;
  items.push(['leave', leave, 'Leave this lobby and go back to the menu.']);
  setHTML('cl-menu', items.map(([a, l, d], i) => `<button class="cl-item${a === 'start' ? ' hot' : ''}${i === items.length - 1 ? ' last' : ''}" data-cl="${a}" data-desc="${esc(d)}" data-nav>${esc(l)}</button>`).join(''));
  if (!clDescText || !items.some(it => it[2] === clDescText)) clDescText = items[0][2];
  $('cl-desc').textContent = clDescText;
  // status line + map cards
  const mv = lobby.mapVote, people = clPeople();
  let status;
  const scd = host ? (startCd ? startCd.shown : -1) : (inf && inf.cd >= 0 ? inf.cd : -1);
  if (mv) status = mv.cd >= 0 ? `The match is about to begin... <i>${mv.cd}</i>` : `Vote for the next map · ${mv.rd}/${mv.n} ready`;
  else if (scd >= 0 && !inMatch) status = `The match is about to begin... <i>${scd}</i>`;
  else if (inMatch) status = 'Match in progress. Players you let in drop straight into it.';
  else if (host) status = settings.fillBots === false && !pub && new Set(people.map(p => p.tm)).size < 2 ? 'Need more players to balance teams...' : 'Waiting for you to start the match...';
  else if (lobby.status === 'pending') status = 'Waiting for the host to let you in...';
  else if (lobby.status === 'accepted' || lobby.status === 'ingame') status = lobby.hostInGame ? 'Joining the match in progress...' : 'The match is about to begin...';
  else status = lobby.quickMode ? `Searching for a match... <i>${Math.max(0, Math.ceil(((lobby.quickDeadline || 0) - Date.now()) / 1000))}</i>` : 'Looking for the match...';
  setHTML('cl-status', status);
  const mname = mode.name.toUpperCase();
  setHTML('cl-maps', mv
    ? mv.o.map((id, i) => `<button class="cl-mvb${mv.my === i ? ' on' : ''}" data-mv="${i}" data-nav>${mapCard(id, mname, `<span class="cl-vote"><b>${mv.v[i] || 0}</b>${mv.my === i ? 'YOUR VOTE' : 'VOTE'}</span>`)}</button>`).join('')
    : mapCard(host ? (lobby.public ? '' : settings.map) : inf.map, mname));
  // players
  const n = inf.n || settings.teamSize || 4;
  const max = pub ? MAX_HUMANS : Math.min(MAX_HUMANS, 2 * n);
  $('cl-count').textContent = `${people.length} Player${people.length === 1 ? '' : 's'} (${max} Max)`;
  const myTeam = (people.find(p => p.me) || people[0]).tm;
  const rows = [];
  if (host) for (const p of lobby.pending.values()) rows.push(`<div class="cl-row pend"><span class="cl-lv"></span><span class="cl-emb"></span><span class="cl-nm">${esc(p.name)}<small>WANTS TO JOIN</small></span><span class="cl-act"><button class="ok" data-accept="${esc(p.peerId)}" data-nav>ACCEPT</button><button data-deny="${esc(p.peerId)}" data-nav>DENY</button></span></div>`);
  const sorted = [...people].sort((a, b) => (a.tm === myTeam ? 0 : 1) - (b.tm === myTeam ? 0 : 1) || b.h - a.h);
  let lastTm = -1;
  for (const p of sorted) {
    if (p.tm !== lastTm) { rows.push(`<div class="cl-sep t${p.tm}">${teamName(p.tm)}${p.tm === myTeam ? ' · YOUR TEAM' : ''}</div>`); lastTm = p.tm; }
    const lv = levelOf(p.x | 0);
    const bars = p.ping === undefined ? '' : `<span class="cl-ping q${p.ping < 80 ? 3 : p.ping < 160 ? 2 : 1}" title="${p.ping} ms"><i></i><i></i><i></i></span>`;
    const acts = host && !p.me ? `<span class="cl-act">${inMatch ? '' : `<button data-swap="${esc(p.id)}" data-nav title="Switch team">⇄</button>`}<button class="warn" data-kick="${esc(p.id)}" data-nav>KICK</button></span>`
      : host && p.me && !inMatch ? `<span class="cl-act"><button data-swap="host" data-nav title="Switch team">⇄</button></span>` : '';
    rows.push(`<div class="cl-row t${p.tm}${p.me ? ' me' : p.tm === myTeam ? ' fr' : ' en'}">${bars}<span class="cl-lv">${lv}</span><span class="cl-emb">${emblemSVG(lv)}</span><span class="cl-nm">${esc(p.n)}</span><span class="cl-sc">${(p.x | 0).toLocaleString('en-US')}</span><span class="cl-star">${p.h ? '★' : ''}</span>${acts}</div>`);
  }
  const open = Math.min(3, max - people.length);
  for (let i = 0; i < open; i++) rows.push(`<div class="cl-row empty"><span class="cl-nm">${pub ? 'Searching for player' : 'Waiting for player'}<i class="dots"></i></span><span class="cl-spin"></span></div>`);
  setHTML('cl-list', rows.join(''));
  $('cl-note').textContent = [host && !inMatch && !pub ? $('host-note').textContent : '', $('conn-note').textContent].filter(Boolean).join('  ·  ');
  const d = game.input.lastDevice;
  setHTML('cl-foot', d === 'touch' ? '' : [`<span>${glyph('accept', d)} Select</span>`, `<span>${glyph('back', d)} Back</span>`, filterable ? `<span>${glyph('x', d)} Choose game modes</span>` : '', `<span>${glyph('alt', d)} Friends</span>`].join(''));
}
function openClassEditor() {
  clEditing = true;
  $('cl-editor').appendChild($('pane-loadout'));
  $('pane-loadout').classList.add('on');
  if (editKey) renderGunsmith(false); else renderClasses();
  renderClassic();
  if (game.input.lastDevice === 'pad') focusFirst();
}
function closeClassEditor() {
  if (!clEditing) return;
  clEditing = false;
  if (editKey) closeEditor();
  restorePanes();
  $('lobby').classList.remove('cl-editing');
  syncLobbyLoadout();
  renderClassic();
  if (game.input.lastDevice === 'pad') focusEl($('cl-menu').querySelector('[data-cl="class"]'));
}
// the class you equip in the lobby is the one you spawn with (guests tell the host)
function syncLobbyLoadout() {
  if (!lobby.active || inMatch()) return;
  const l = loadoutFromSettings(settings);
  lobby.myPrimary = l;
  if (lobby.role === 'host') lobby.hostPrimary = l;
  else if (lobby.role === 'guest' && lobby.hostId) lobby.net.send({ t: 'lo', l }, lobby.hostId);
}
$('cl-done').addEventListener('click', () => { if (clModes) closeModeFilter(); else if (clSetup) closeLobbySetup(); else closeClassEditor(); });
// Edit Modes (Play > Edit modes): the same playlist as the lobby's filter, ticked on its own page
function renderQuickModes() {
  const sel = new Set(settings.quickModes || []);
  setHTML('qm-list', QUICK_MODES.map(id => `<button class="cl-mf${sel.has(id) ? ' on' : ''}" data-qm="${id}" data-nav role="checkbox" aria-checked="${sel.has(id)}"><i></i><b>${esc(MODES[id].name.toUpperCase())}</b><small>${esc(MODES[id].blurb)}</small></button>`).join(''));
  $('quick-sub').textContent = quickModesLabel() === 'ALL' ? 'ALL MODES' : quickModesLabel();
}
$('qm-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-qm]'); if (!b) return;
  const set = new Set(settings.quickModes || []), id = b.dataset.qm;
  if (set.has(id)) { if (set.size > 1) set.delete(id); else { game.hud.toast('KEEP AT LEAST ONE MODE'); return; } } else set.add(id);
  settings.quickModes = QUICK_MODES.filter(m => set.has(m));
  saveSettings(settings);
  game.audio.play('ui', null, { ui: true });
  renderQuickModes();
  focusEl($('qm-list').querySelector(`[data-qm="${id}"]`));
});
// public match playlists: tick the modes you want; matchmaking uses any of them (X in the lobby)
function quickModesLabel() { const l = (settings.quickModes || []).filter(m => MODES[m]); return l.length === QUICK_MODES.length ? 'ALL' : l.map(m => MODES[m].short).join(' · '); }
function renderModeFilter() {
  const sel = new Set(settings.quickModes || []);
  setHTML('cl-modes', `<div class="cl-setup-h on">CHOOSE GAME MODES</div><p class="cl-mf-note">Matchmaking looks for a lobby in any mode you tick. If none is open after 10 seconds, a lobby starts in one of them at random.</p>`
    + QUICK_MODES.map(id => `<button class="cl-mf${sel.has(id) ? ' on' : ''}" data-qm="${id}" data-nav><i></i><b>${esc(MODES[id].name.toUpperCase())}</b><small>${esc(MODES[id].blurb)}</small></button>`).join(''));
}
function openModeFilter() {
  clModes = true; renderModeFilter(); renderClassic();
  if (game.input.lastDevice === 'pad') focusFirst();
}
function closeModeFilter() {
  if (!clModes) return;
  clModes = false;
  saveSettings(settings);
  lobby.setQuickModes(settings.quickModes);
  renderClassic();
  if (game.input.lastDevice === 'pad') focusEl($('cl-menu').querySelector('[data-cl="modes"]') || $('cl-menu').querySelector('[data-nav]'));
}
$('cl-modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-qm]'); if (!b) return;
  const set = new Set(settings.quickModes || []), id = b.dataset.qm;
  if (set.has(id)) { if (set.size > 1) set.delete(id); else { game.hud.toast('KEEP AT LEAST ONE MODE'); return; } } else set.add(id);
  settings.quickModes = QUICK_MODES.filter(m => set.has(m));
  game.audio.play('ui', null, { ui: true });
  renderModeFilter();
  focusEl($('cl-modes').querySelector(`[data-qm="${id}"]`));
});
// private lobby: step the mode / map, and the full match setup (the Play tab's settings rows, moved in here)
function stepLobbySel(which, d) {
  const sel = $(which === 'mode' ? 'opt-mode' : 'opt-map'), n = sel.options.length;
  sel.selectedIndex = (sel.selectedIndex + d + n) % n;
  sel.dispatchEvent(new Event('change'));
  renderClassic();
  const b = $('cl-menu').querySelector(`[data-cl="${which}"]`);
  if (b) { clDescText = b.dataset.desc; $('cl-desc').textContent = clDescText; if (game.input.lastDevice === 'pad') focusEl(b); }
}
let setupHome = null;
function openLobbySetup() {
  const rows = $('play-rows');
  setupHome = { parent: rows.parentNode, next: rows.nextSibling };
  clSetup = true;
  $('cl-editor').insertBefore(rows, $('cl-done'));
  rows.classList.add('cl-setup');
  renderClassic();
  if (game.input.lastDevice === 'pad') focusFirst();
}
function closeLobbySetup() {
  if (!clSetup) return;
  clSetup = false;
  const rows = $('play-rows');
  rows.classList.remove('cl-setup');
  if (setupHome) setupHome.parent.insertBefore(rows, setupHome.next);
  readAll(); saveSettings(settings);
  if (lobby.role === 'host') { setMapHint(); lobby.broadcastLobby(); }
  renderClassic();
  if (game.input.lastDevice === 'pad') focusEl($('cl-menu').querySelector('[data-cl="setup"]'));
}
$('cl-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cl]');
  if (!b) return;
  game.audio.play('ui', null, { ui: true });
  const a = b.dataset.cl;
  if (a === 'start') $('lobby-start').click();
  else if (a === 'back') $('lobby-back').click();
  else if (a === 'leave') $('lobby-leave').click();
  else if (a === 'invite') $('copy-link').click();
  else if (a === 'class') openClassEditor();
  else if (a === 'mode' || a === 'map') { stepLobbySel(a, 1); }
  else if (a === 'setup') openLobbySetup();
  else if (a === 'modes') openModeFilter();
  else if (a === 'approve') { const c = $('opt-approve'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); renderClassic(); }
  else if (a === 'bots') { const c = $('opt-fillbots'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); renderClassic(); }
});
const clHover = (e) => { const b = e.target.closest('[data-desc]'); if (b && b.dataset.desc !== clDescText) { clDescText = b.dataset.desc; $('cl-desc').textContent = clDescText; } };
$('cl-menu').addEventListener('mouseover', clHover);
$('cl-menu').addEventListener('focusin', clHover);
$('cl-maps').addEventListener('click', (e) => { const b = e.target.closest('[data-mv]'); if (b) { lobby.voteMap(+b.dataset.mv); game.audio.play('ui', null, { ui: true }); } });
setInterval(() => { if (screen === 'lobby' && classicOn()) renderClassic(); }, 1000); // pings, countdowns

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
  lobby.quick(myName(), loadoutFromSettings(settings), settings.quickModes);
  showScreen('lobby');
  renderLobby();
}
$('quick-btn').addEventListener('click', () => {
  game.input.goFullscreen();
  if (acked()) { startQuick(); return; }
  quickIntro = true;
  showScreen('lobby');
  renderLobby();
});
$('quick-go').addEventListener('click', () => { try { localStorage.setItem(ACK, '1'); } catch (_) { /* ignore */ } startQuick(); });
// public matches use fixed rules, but in the game mode you picked (players are matched by mode)
const publicSettings = () => ({ ...settings, ...PUBLIC_MATCH, mode: lobby.quickGm || (settings.quickModes || []).find(m => MODES[m]) || 'tdm', map: lobby.nextMap && MAPS[lobby.nextMap] ? lobby.nextMap : PUBLIC_MATCH.map });
// nobody's lobby to join: this one opens, and its countdown (with the map vote) starts right away; anyone
// searching in the meantime drops in, and bots fill the rest when it hits zero
lobby.onQuickHost = () => {
  setMapHint();
  lobby.startMapVote(shuffleArr(Object.keys(MAPS)).slice(0, 3), QUICK_COUNTDOWN);
  lobby.broadcastLobby();
  game.hud.toast('NO OPEN LOBBIES FOUND — STARTING ONE. PLAYERS CAN DROP IN');
  if (screen === 'lobby') renderLobby();
};
lobby.onQuickModes = () => { setMapHint(); lobby.broadcastLobby(); if (screen === 'lobby') renderClassic(); };

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
function tryJoin(withUid = '') {
  if (joinCode.length !== 6) return;
  readAll();
  game.audio.init();
  joinError = '';
  lobby.join(joinCode, myName(), loadoutFromSettings(settings), false, typeof withUid === 'string' ? withUid : '');
}
lobby.onMapHint = (id) => { if (MAPS[id] && id !== game.world.id) game.loadMap(id); };
const setMapHint = () => {
  lobby.mapHint = lobby.public ? '' : (MAPS[settings.map] ? settings.map : '');
  // what guests see about the match they're waiting for
  const cfg = lobby.public ? publicSettings() : settings;
  lobby.info = { m: cfg.mode || 'tdm', map: MAPS[cfg.map] ? cfg.map : 'random', n: cfg.mode === 'gunfight' ? 2 : cfg.teamSize, b: cfg.fillBots === false ? 0 : 1, ff: !!cfg.friendlyFire };
};
for (const id of ['opt-fillbots', 'opt-team', 'opt-ff', 'opt-map', 'opt-score', 'opt-time', 'opt-diff']) $(id).addEventListener('change', () => { if (lobby.role === 'host') { setMapHint(); lobby.broadcastLobby(); renderLobby(); } });
$('opt-mode').addEventListener('change', () => { if (lobby.role === 'host') { setMapHint(); lobby.broadcastLobby(); } });
// private match: Start Match runs a 5-second countdown everyone in the lobby sees (press again to cancel)
function cancelStartCd(quiet) {
  if (!startCd) return;
  clearInterval(startCd.t); startCd = null;
  if (lobby.info) { lobby.info.cd = -1; if (lobby.role === 'host') lobby.broadcastLobby(); }
  $('lobby-start').querySelector('span').textContent = 'START MATCH';
  if (!quiet) game.hud.toast('MATCH START CANCELLED');
  if (screen === 'lobby') renderLobby();
}
function startCdTick() {
  if (!startCd) return;
  if (lobby.role !== 'host' || screen !== 'lobby') { cancelStartCd(true); return; }
  const left = Math.max(0, Math.ceil((startCd.end - performance.now()) / 1000));
  if (left !== startCd.shown) {
    startCd.shown = left;
    if (lobby.info) { lobby.info.cd = left; lobby.broadcastLobby(); }
    $('lobby-start').querySelector('span').textContent = left ? `CANCEL · ${left}` : 'STARTING';
    game.audio.play('ui', null, { ui: true, freq: left ? 900 : 1500 });
    renderLobby();
  }
  if (left === 0) { clearInterval(startCd.t); startCd = null; doStartMatch(); }
}
$('lobby-start').addEventListener('click', () => {
  // public matches start themselves when the map vote's countdown ends (in the voted map and the lobby's mode)
  if (lobby.public || lobby.quickMode) return;
  game.input.goFullscreen();
  readAll();
  if (!lobby.public && settings.fillBots === false && !(MODES[settings.mode] || {}).ffa) {
    const teams = [lobby.hostTeam, ...[...lobby.players.values()].map(p => p.team)];
    if (!teams.includes(0) || !teams.includes(1)) { game.hud.toast('BOTS ARE OFF: PUT AT LEAST ONE PLAYER ON EACH TEAM (⇄)'); return; }
  }
  if (lobby.public || game.state !== 'menu') { doStartMatch(); return; }
  if (startCd) { cancelStartCd(); return; }
  startCd = { end: performance.now() + 5000, shown: -1, t: setInterval(startCdTick, 100) };
  startCdTick();
});
function doStartMatch() {
  readAll();
  if (lobby.info) lobby.info.cd = -1;
  $('lobby-start').querySelector('span').textContent = 'START MATCH';
  clearTimeout(nextMatchT);
  launch(lobby.public ? publicSettings() : settings, { mode: 'host', lobby }).then(() => { lobby.broadcastLobby(); syncOnlineFlags(); });
}
$('lobby-back').addEventListener('click', () => showScreen('pause'));
setInterval(() => { if (screen === 'lobby' && lobby.role === 'guest' && lobby.status === 'searching' && !lobby.quickMode) lobby.changed(); }, 1000);
let leaveArmed = 0;
$('lobby-leave').addEventListener('click', () => {
  if (quickIntro) { quickIntro = false; showScreen('menu'); return; }
  // a host closing the lobby or ending the session drops everyone in it: ask for a second press
  const el = $('lobby-leave');
  if (lobby.role === 'host' && (game.live || lobby.players.size > 0) && !leaveArmed) {
    const label = el.textContent;
    el.classList.add('armed'); el.textContent = `PRESS AGAIN: ${game.live ? 'END IT' : 'CLOSE IT'} FOR EVERYONE`;
    leaveArmed = setTimeout(() => { leaveArmed = 0; el.classList.remove('armed'); if (el.textContent.startsWith('PRESS AGAIN')) el.textContent = label; }, 3500);
    return;
  }
  clearTimeout(leaveArmed); leaveArmed = 0; el.classList.remove('armed');
  const wasPlaying = game.state !== 'menu';
  leaveOnline();
  if (wasPlaying) game.quitToMenu();
  writeForm();
  showScreen('menu');
});
$('pause-lobby').addEventListener('click', () => openLobby());
confirmBtn($('pause-end'), () => game.endMatch());

lobby.onStart = (m) => {
  if (awayFromLobby()) { leaveOnline(); return; }
  launch(settings, { mode: 'guest', lobby, start: m }).then(() => syncOnlineFlags(), (err) => {
    console.error(err);
    lobby.close('The host sent a match this version can\'t load.');
  });
};
lobby.onClosed = (reason, wasPublic) => {
  if (game.mode === 'guest' && game.state !== 'menu') game.quitToMenu();
  // a public host went away: find another match automatically
  if (wasPublic && /host closed|Lost connection/.test(reason)) {
    lobby.quick(myName(), loadoutFromSettings(settings), settings.quickModes);
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
window.addEventListener('pagehide', () => { if (lobby.active || lobby.quickMode) lobby.close(); });
// during a match, a stray Ctrl+W (or a mis-click on the tab's X) asks before closing instead of ending the match
window.addEventListener('beforeunload', (e) => {
  if (game.state === 'playing' || game.state === 'paused') { e.preventDefault(); e.returnValue = ''; return ''; }
  if (lobby.active) lobby.close();
});
// leaving fullscreen (holding Esc) also gives the keyboard back to the browser
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) game.input.releaseKeys(); });

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
  document.querySelectorAll('.pad-adjust').forEach(e => { if (e !== el) e.classList.remove('pad-adjust'); });
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
    : screen === 'signin' ? document.querySelector('#signin .si-step.on .terms, #signin .si-step.on input')
    : screen === 'feedback' ? document.querySelector('[data-fb].on')
    : screen === 'menu' && tab === 'play' ? (playView === 'root' ? ($('play-tiles').querySelector(`[data-tile="${tileSel}"]`) || $('play-tiles').querySelector('.tile.cur') || $('play-tiles').querySelector('.tile'))
      : playView === 'quick' ? $('quick-btn') : playView === 'browser' ? ($('mb-list').querySelector('[data-nav]') || $('mb-filters').querySelector('[data-nav]')) : playMode === 'online' ? $('host-btn') : $('play'))
    : screen === 'menu' && tab === 'options' ? document.querySelector('#pane-options .row:not(.osub-off) [data-nav]')
    : screen === 'menu' ? document.querySelector(`#pane-${tab} [data-nav]`)
    : screen === 'pause' ? (pauseSec === 'match' ? $('resume') : pauseSec === 'options' ? document.querySelector('#pane-options .row:not(.osub-off) [data-nav]') : document.querySelector(`#psec-${pauseSec} [data-nav]`))
    : screen === 'lobby' && clModes ? $('cl-modes').querySelector('[data-nav]')
    : screen === 'lobby' && (clEditing || clSetup) ? document.querySelector('#cl-editor [data-nav]')
    : screen === 'lobby' && $('lobby').classList.contains('classic') ? $('cl-menu').querySelector('[data-nav]')
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
  if (!$('apply-dlg').hidden) {
    const items = [...$('apply-dlg').querySelectorAll('[data-nav]')], cur = items.indexOf(document.querySelector('#apply-dlg .pad-focus'));
    if (dir === 'left' || dir === 'right' || dir === 'up' || dir === 'down') { const n = items[Math.max(0, Math.min(items.length - 1, cur + (dir === 'right' || dir === 'down' ? 1 : -1)))]; if (n) focusEl(n); }
    else if (dir === 'accept') (items[cur] || items[0]).click();
    else if (dir === 'back') $('ad-cancel').click();
    return;
  }
  if (dir === 'x' && optionsOpen()) { applyOptions(); return; }
  if (dir === 'alt') { toggleSide(); return; }
  if (sideOpen && dir === 'back') { closeSide(); return; }
  if (sideOpen && (dir === 'prevTab' || dir === 'nextTab') && account.signedIn) {
    const tabs = ['friends', 'add', 'profile'], on = document.querySelector('#side .sd-tab.on');
    const i = Math.max(0, tabs.indexOf(on ? on.dataset.sdt : 'friends'));
    sideTab(tabs[(i + (dir === 'nextTab' ? 1 : tabs.length - 1)) % tabs.length]); return;
  }
  if (sideOpen && (dir === 'start' || dir === 'prevTab' || dir === 'nextTab')) return;
  const items = navItems();
  const el = document.activeElement && items.includes(document.activeElement) ? document.activeElement : (document.querySelector('.pad-focus') && items.includes(document.querySelector('.pad-focus')) ? document.querySelector('.pad-focus') : null);
  const tick = () => game.audio.play('ui', null, { ui: true, freq: 2600 });
  const go = (d) => {
    if (!el) { focusFirst(); return; }
    // long text boxes scroll with up / down before focus moves on
    if (el.classList.contains('terms') && (d === 'up' || d === 'down')) {
      const atEnd = d === 'down' ? el.scrollTop + el.clientHeight >= el.scrollHeight - 4 : el.scrollTop <= 0;
      if (!atEnd) { el.scrollBy({ top: d === 'down' ? 140 : -140 }); return; }
    }
    let to = spatial(el, items, d);
    if (!to && (d === 'up' || d === 'down')) { const i = items.indexOf(el); to = items[i + (d === 'down' ? 1 : -1)] || null; }
    if (to) { focusEl(to); tick(); }
  };
  switch (dir) {
    case 'up': case 'down': go(dir); break;
    case 'left': case 'right': {
      const d = dir === 'left' ? -1 : 1;
      // left / right always move to the neighbouring control. Dropdowns open, checkboxes toggle and sliders
      // start adjusting (then left / right step them, A or B finishes) with A only. Tabs are LB / RB.
      if (el && el.type === 'range' && el.classList.contains('pad-adjust')) { stepRange(el, d); tick(); }
      else if (el && (el.dataset.cl === 'map' || el.dataset.cl === 'mode')) { stepLobbySel(el.dataset.cl, d); tick(); }
      else { el?.classList.remove('pad-adjust'); go(dir); }
      break;
    }
    case 'accept':
      if (!el) { focusFirst(); break; }
      if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
      else if (el.tagName === 'SELECT') openDropdown(el);
      else if ((el.tagName === 'INPUT' && el.type !== 'range') || el.tagName === 'TEXTAREA') { el.focus(); break; }
      else if (el.type === 'range') { el.classList.toggle('pad-adjust'); }
      else el.click();
      game.audio.play('ui', null, { ui: true });
      break;
    case 'back':
      if (el && el.classList.contains('pad-adjust')) { el.classList.remove('pad-adjust'); break; }
      if (((screen === 'menu' && tab === 'loadout') || (screen === 'pause' && pauseSec === 'loadout')) && closeEditor()) break;
      if (screen === 'pause' && pauseSec !== 'match') { setPauseSec('match'); focusEl(document.querySelector('.psec[data-sec="match"]')); }
      else if (screen === 'pause') game.resume();
      else if (screen === 'menu' && tab === 'play' && playView !== 'root') openPlayView('root');
      else if (screen === 'menu' && tab !== 'play') { setTab('play'); focusFirst(); }
      else if (screen === 'menu') openMode();
      else if (screen === 'mode') { showScreen('title'); }
      else if (screen === 'signin') $('si-back').click();
      else if (screen === 'feedback') closeFeedback();
      else if (screen === 'report') closeReport();
      else if (screen === 'notice') $('nt-ok').click();
      else if (screen === 'end') $('menu-btn').click();
      else if (screen === 'lobby' && clModes) closeModeFilter();
      else if (screen === 'lobby' && clSetup) closeLobbySetup();
      else if (screen === 'lobby' && clEditing) { if (!closeEditor()) closeClassEditor(); }
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
    case 'x':
      if (screen === 'lobby' && classicOn() && (lobby.public || lobby.quickMode) && !(lobby.role === 'host' && game.live)) { if (clModes) closeModeFilter(); else if (!clEditing && !clSetup) openModeFilter(); game.audio.play('ui', null, { ui: true }); }
      break;
    case 'prevSub': case 'nextSub':
      if ((screen === 'menu' && tab === 'options') || (screen === 'pause' && pauseSec === 'options')) { stepOptSub(dir === 'nextSub' ? 1 : -1); focusFirst(); }
      else ceStepSlot(dir === 'nextSub' ? 1 : -1);
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
  else if (!typing && screen === 'lobby' && (e.key === 'x' || e.key === 'X') && !e.repeat) game.input.onNav('x');
  else if (!typing && optionsOpen() && (e.key === 'x' || e.key === 'X') && !e.repeat) applyOptions();
  else if (!typing && (screen === 'menu' || screen === 'pause') && (e.key === 'z' || e.key === 'Z')) game.input.onNav('prevSub');
  else if (!typing && (screen === 'menu' || screen === 'pause') && (e.key === 'c' || e.key === 'C')) game.input.onNav('nextSub');
});

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

// ---------- title screen ----------
function titleGo() {
  if (screen !== 'title') return;
  game.audio.init();
  game.audio.play('ui', null, { ui: true });
  // the message of the day pops up once per visit, right after the title screen
  if (motdData && !motdShown) {
    motdShown = true;
    const head = String(motdData.title || 'MESSAGE OF THE DAY').slice(0, 80).toUpperCase();
    const kind = String(motdData.kind || 'MESSAGE OF THE DAY').slice(0, 40).toUpperCase();
    $('nt-title').textContent = head;
    // the small line under the heading: what this is, and when (never the heading twice)
    $('nt-sub').textContent = [head === kind ? 'BREACHPOINT' : kind, motdData.date ? String(motdData.date).slice(0, 10) : ''].filter(Boolean).join(' · ');
    $('nt-fb').hidden = false;
    $('nt-text').textContent = String(motdData.body).slice(0, 600);
    $('notice').classList.remove('bad');
    $('notice').classList.add('motd-pop');
    noticeDone = () => { $('notice').classList.remove('motd-pop'); $('nt-fb').hidden = true; openMode(); };
    showScreen('notice');
    if (game.input.lastDevice === 'pad') setTimeout(() => focusEl($('nt-ok')), 0);
    return;
  }
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
  if (lobby.active || lobby.quickMode) leaveOnline();
  syncAccount();
  const qm = MODES[settings.mode] || MODES.tdm;
  $('mode-quick-d').textContent = `${qm.name} · ${MAPS[settings.map] ? MAPS[settings.map].name : 'Random map'} · ${settings.difficulty} bots`.toUpperCase();
  showScreen('mode');
}
function setPlayMode(m) {
  playMode = m;
  document.body.classList.toggle('mode-online', m === 'online');
  document.body.classList.toggle('mode-offline', m !== 'online');
  const nm = myName() || 'Operator';
  $('mode-chip').innerHTML = `<span class="pc-emb">${esc(([...nm][0] || '?').toUpperCase())}</span><span class="pc-txt"><b>${esc(nm.toUpperCase())}</b><small><i></i>${m === 'online' ? 'ONLINE · MULTIPLAYER' : 'OFFLINE · COMBAT TRAINING'}</small></span>`;
  $('menu-title').textContent = m === 'online' ? 'MULTIPLAYER' : 'COMBAT TRAINING';
  $('menu-subtitle').textContent = m === 'online' ? (onlineName() ? `ONLINE · SIGNED IN AS ${onlineName().toUpperCase()}` : 'ONLINE · PEER-TO-PEER') : 'OFFLINE · VERSUS BOTS';
  const mn = (MODES[settings.mode] || MODES.tdm).name.toUpperCase();
  $('play-title').textContent = mn;
  $('opt-name').value = myName();
  renderHints(game.input.lastDevice);
}
function enterMenu(m) {
  setPlayMode(m);
  writeForm();
  setTab('play');
  tileSel = null;
  openPlayView('root');
  showScreen('menu');
}
$('mode-offline').addEventListener('click', () => enterMenu('offline'));
$('mode-quick').addEventListener('click', () => { enterMenu('offline'); deploy(); });
$('mode-online').addEventListener('click', async () => {
  if (window.BREACHPOINT_OFFLINE) { game.hud.toast('ONLINE PLAY WORKS ON BREACH-POINT.NET'); return; }
  if (!account.ready) { setPlayMode('online'); openSignin(); return; }
  const note = await checkProgress();
  if (note) showNotice(note, () => enterMenu('online'));
  else enterMenu('online');
});

// ---------- progression checkpoint: XP comes from the account server ----------
// Opening multiplayer asks the server for your XP and any notice about your account (under review, or put
// back to its last checkpoint after a match result that couldn't be real).
const NOTICES = {
  review: ['ACCOUNT UNDER REVIEW', 'Some of your recent match results look unusual, so your account is being reviewed. You can keep playing. XP you earn is held until the review is done, then added if everything checks out.'],
  reset: ['PROGRESS RESTORED TO CHECKPOINT', 'A match result on your account couldn\'t have happened in a real match, so your XP was put back to your last checkpoint and your account is under review.'],
  cleared: ['REVIEW COMPLETE', 'Your account checked out. Any XP that was on hold has been added. Thanks for your patience.'],
};
async function checkProgress() {
  if (!account.enabled || !account.signedIn) return null;
  try {
    const p = await account.progress();
    lobby.myXp = p.xp | 0;
    lobby.underReview = !!p.rev;
    if (p.note && NOTICES[p.note]) return p.note;
    let seen = false; try { seen = !!sessionStorage.getItem('bp.revSeen'); sessionStorage.setItem('bp.revSeen', '1'); } catch (_) { /* ignore */ }
    if (p.rev && !seen) return 'review';
  } catch (_) { /* offline: keep the last value */ }
  return null;
}
let noticeDone = null;
function showNotice(kind, then) {
  const [t, x] = NOTICES[kind];
  $('nt-title').textContent = t; $('nt-text').textContent = x; $('nt-sub').textContent = 'ACCOUNT';
  $('notice').classList.toggle('bad', kind !== 'cleared');
  noticeDone = then;
  showScreen('notice');
}
$('nt-ok').addEventListener('click', () => { const f = noticeDone; noticeDone = null; if (f) f(); else showScreen('mode'); });
// after a match the host reports everyone's result (each guest backed by the pass they joined with);
// everyone then reads their new XP back from the server
function reportMatch(r) {
  if (game.mode === 'local' || !account.enabled || !account.signedIn || !lobby.code) return;
  const before = lobby.myXp | 0;
  if (game.mode === 'host') {
    const byUid = new Map([...lobby.players.values()].filter(p => p.uid).map(p => [p.uid, p]));
    const players = game.characters.filter(c => !c.isBot).map(c => {
      const row = { s: c.score | 0, k: c.kills | 0, d: c.deaths | 0, w: (r.ffa ? r.players.indexOf(c) < 3 : c.team === r.winner) ? 1 : 0 };
      if (c === game.player) return { ...row, me: 1 };
      const p = byUid.get(c.uid);
      return p && p.tk ? { ...row, tk: p.tk } : null;
    }).filter(Boolean);
    account.reportMatch({ room: lobby.code, secs: Math.round(game.time), mode: game.settings.mode || 'tdm', players }).catch(() => {});
  }
  setTimeout(async () => {
    await checkProgress();
    const lv = levelOf(lobby.myXp), was = levelOf(before);
    if (lobby.myXp > before) game.hud.toast(lv > was ? `LEVEL UP · LEVEL ${lv}` : `+${(lobby.myXp - before).toLocaleString('en-US')} XP`);
    if (screen === 'lobby') renderClassic();
  }, game.mode === 'host' ? 2500 : 6000);
}
$('mode-chip').addEventListener('click', () => openMode());
// settings straight from the first menu (not only from inside a match)
$('mode-options').addEventListener('click', () => { enterMenu(playMode === 'online' && account.ready ? 'online' : 'offline'); setTab('options'); });
$('mode-friends').addEventListener('click', () => openSide());
// sidebar tabs: Friends (requests, friends, recent) · Add friend · Profile
function sideTab(t) {
  document.querySelectorAll('#side .sd-tab').forEach(b => b.classList.toggle('on', b.dataset.sdt === t));
  document.querySelectorAll('#side .sd-pane').forEach(p => p.classList.toggle('on', p.dataset.sdp === t));
  if (game.input.lastDevice === 'pad') { const f = document.querySelector(`#side .sd-pane.on [data-nav]`); if (f) focusEl(f); }
}
document.querySelectorAll('#side .sd-tab').forEach(b => b.addEventListener('click', () => sideTab(b.dataset.sdt)));

// account state shown around the menus
function syncAccount() {
  const u = account.signedIn ? account.user : null;
  // one name everywhere: once you have a Name Tag, offline matches use it too
  if (u && u.tag && settings.name !== u.tag) { settings.name = u.tag; saveSettings(settings); }
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
  if (!account.signedIn) hbLast = '';
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
  $('opt-name-note').textContent = account.enabled && u ? (wait ? `You can change it again in ${untilText(u.nextTagAt)}` : 'Everyone sees this. Changes once a day.') : '';
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
  $('si-title').textContent = st === 'name' ? 'YOUR NAME TAG' : st === 'sent' ? 'CHECK YOUR EMAIL' : st === 'terms' ? 'TERMS OF USE' : 'SIGN IN';
  $('si-back').textContent = st === 'name' ? 'SIGN OUT' : st === 'terms' ? 'DECLINE AND SIGN OUT' : 'BACK';
  if (st === 'terms') { $('terms-box').scrollTop = 0; termsRead = false; syncTerms(); }
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
  siStep(account.signedIn && !account.termsOk ? 'terms' : account.signedIn && !account.tag ? 'name' : 'email');
}
function signedIn() {
  if (!account.termsOk) { if (screen !== 'signin') showScreen('signin'); siStep('terms'); return; }
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
// 6-digit code from the email (works on any device: the email can be on your phone)
async function codeSignIn(inp, status, done) {
  const code = inp.value.replace(/\D/g, '');
  if (code.length !== 6) { status('The code is 6 digits.', 'bad'); return; }
  status('<span class="spin"></span>Checking…');
  inp.disabled = true;
  try { await account.verifyCode(code); inp.value = ''; status(''); done(); }
  catch (e) { status(esc(e.message), 'bad'); inp.value = ''; if (e.expired) done(true); }
  inp.disabled = false;
  if (!account.signedIn && game.input.lastDevice !== 'touch') inp.focus({ preventScroll: true });
}
const siVerify = () => codeSignIn($('si-code-in'), siStatus, (expired) => { if (expired) setTimeout(() => siStep('email'), 1800); else if (screen === 'signin' && siCur !== 'name') signedIn(); });
const sdVerify = () => codeSignIn($('sd-code-in'), sdStatus, (expired) => {
  if (expired) { $('sd-codebox').classList.remove('on'); return; }
  if (!account.termsOk || !account.tag) { setPlayMode('online'); openSignin(); return; }
  game.hud.toast(account.tag ? `SIGNED IN AS ${account.tag.toUpperCase()}` : 'SIGNED IN · CHOOSE A NAME TAG');
});
for (const [inp, fn] of [['si-code-in', siVerify], ['sd-code-in', sdVerify]]) {
  $(inp).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6) fn(); });
  $(inp).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
}
$('si-verify').addEventListener('click', siVerify);
$('sd-verify').addEventListener('click', sdVerify);
$('si-send').addEventListener('click', siSend);
// terms: the box must be scrolled to the end before the checkbox and the button unlock
let termsRead = false;
function syncTerms() {
  const box = $('terms-box');
  if (box.scrollTop + box.clientHeight >= box.scrollHeight - 8) termsRead = true;
  $('terms-ok').disabled = !termsRead;
  if (!termsRead) $('terms-ok').checked = false;
  $('terms-accept').disabled = !(termsRead && $('terms-ok').checked);
  $('terms-hint').textContent = !termsRead ? 'Scroll to the bottom of the terms to continue.' : !$('terms-ok').checked ? 'Tick the box to agree.' : '';
}
$('terms-box').addEventListener('scroll', syncTerms, { passive: true });
$('terms-ok').addEventListener('change', syncTerms);
$('terms-accept').addEventListener('click', async () => {
  if ($('terms-accept').disabled || siBusyNow) return;
  siBusy(true);
  siStatus('<span class="spin"></span>Saving…');
  try { await account.acceptTerms(); siBusy(false); signedIn(); }
  catch (e) { siBusy(false); syncTerms(); siStatus(esc(e.message), 'bad'); }
});
$('si-name-save').addEventListener('click', siName);
$('si-resend').addEventListener('click', () => { $('si-email-in').value = account.email; siSend(); });
$('si-other').addEventListener('click', () => siStep('email'));
$('si-back').addEventListener('click', () => {
  if (siCur === 'name' || siCur === 'terms') account.signOut();
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
  if (account.signedIn && !account.termsOk) { setPlayMode('online'); openSignin(); return; }
  sideOpen = true;
  sideFocusBack = document.querySelector('.pad-focus');
  document.body.classList.add('side-open');
  $('side').setAttribute('aria-hidden', 'false');
  game.audio.play('ui', null, { ui: true });
  renderSide();
  if (account.signedIn) { friendsAt = Date.now(); account.loadFriends().catch(() => {}); }
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
// the welcome message's own Send Feedback buttons (the pop-up after the title screen, the menu and lobby cards)
$('nt-fb').addEventListener('click', () => openFeedback());
document.querySelectorAll('.motd-fb').forEach(b => b.addEventListener('click', () => openFeedback()));

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
  if ($('sd-tab-req')) $('sd-tab-req').textContent = d.incoming.length ? String(d.incoming.length) : '';
  $('sd-sub').textContent = u ? `${online} OF ${d.friends.length} FRIENDS ONLINE` : 'FRIENDS · ACCOUNT';
  if (!u) return;
  $('sd-codebox').classList.remove('on');
  $('sd-emb').textContent = ([...(u.tag || '?')][0]).toUpperCase();
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
      ${canJoin ? `<button class="menu-btn small ok" data-join="${esc(f.join)}" data-with="${esc(f.id)}" data-nav>JOIN</button>` : ''}
      <button class="menu-btn small warn" data-fr="remove" data-id="${esc(f.id)}" data-nav title="Remove friend">✕</button></div>`;
  }).join('') : '<div class="sd-empty">No friends yet. Open Add Friend to share your code or enter a friend\'s.</div>');
  renderRecent(d);
}
account.onFriends = (d, fresh) => {
  renderSide();
  for (const r of fresh) game.hud.toast(`FRIEND REQUEST FROM ${String(r.tag).toUpperCase()}`);
};

// ---------- recent players (people you were in an online lobby or match with) ----------
const RECENT_KEY = 'breachpoint.recent.v1';
let recent = (() => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(r => r && r.u); } catch (_) { return []; } })();
let recentDirty = false;
function noteRecent(list) {
  if (!account.signedIn) return;
  const me = account.user.id, now = Date.now();
  const where = { m: (lobby.info && lobby.info.m) || settings.mode, map: game.state !== 'menu' ? game.world.id : (lobby.info && lobby.info.map) || '' };
  for (const p of list) {
    if (!p.u || p.u === me) continue;
    const old = recent.find(r => r.u === p.u);
    if (old) { if (old.n !== p.n || now - old.at > 60000) { old.n = p.n; old.at = now; Object.assign(old, where); recentDirty = true; } }
    else { recent.unshift({ u: p.u, n: p.n, at: now, ...where }); recentDirty = true; }
  }
  if (!recentDirty) return;
  recent.sort((a, b) => b.at - a.at);
  recent = recent.slice(0, 30);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (_) { /* ignore */ }
  recentDirty = false;
  if (sideOpen) renderSide();
}
function lobbyPeople() {
  if (lobby.role === 'host') return [...lobby.players.values()].map(p => ({ u: p.uid || '', n: p.name }));
  if (lobby.role === 'guest') return (lobby.roster || []).map(p => ({ u: p.u, n: p.n }));
  return [];
}
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function renderRecent(d) {
  const fr = new Set(d.friends.map(f => f.id)), out = new Set(d.outgoing.map(f => f.id)), inc = new Set(d.incoming.map(f => f.id));
  setHTML('sd-recent', recent.length ? recent.map(r => {
    const state = fr.has(r.u) ? '<span class="sd-tagline">FRIEND</span>' : out.has(r.u) ? '<span class="sd-tagline">REQUESTED</span>'
      : inc.has(r.u) ? `<button class="menu-btn small ok" data-fr="accept" data-id="${esc(r.u)}" data-nav>ACCEPT</button>`
        : `<button class="menu-btn small" data-addid="${esc(r.u)}" data-nav>ADD</button>`;
    const where = [MODE_SHORT[r.m] || '', MAPS[r.map] ? MAPS[r.map].name : ''].filter(Boolean).join(' · ');
    return `<div class="sd-row off"><span class="sd-dot"></span><span class="sd-n"><b>${esc(r.n)}</b><small>${esc([where, ago(r.at)].filter(Boolean).join(' · '))}</small></span>${state}</div>`;
  }).join('') : '<div class="sd-empty">Players you meet in online matches show up here, so you can add them.</div>');
}

// ---------- mute / block / report / vote to kick ----------
const BLOCK_KEY = 'breachpoint.blocked.v1';
let blocked = (() => { try { return JSON.parse(localStorage.getItem(BLOCK_KEY) || '[]').filter(b => b && b.u); } catch (_) { return []; } })();
const muted = new Set(); // this session only: account ids, or "n:<name>" for players without one
const saveBlocked = () => { try { localStorage.setItem(BLOCK_KEY, JSON.stringify(blocked.slice(0, 200))); } catch (_) { /* ignore */ } lobby.blocked = new Set(blocked.map(b => b.u)); };
lobby.blocked = new Set(blocked.map(b => b.u));
const isBlocked = (u) => !!u && blocked.some(b => b.u === u);
const muteKey = (u, n) => (u ? u : `n:${n}`);
const isMuted = (u, n) => muted.has(muteKey(u, n)) || isBlocked(u);
const votes = new Map(); // character id -> { yes, need, until, voted }
lobby.onVote = (v) => {
  const old = votes.get(v.id) || {};
  votes.set(v.id, { yes: v.yes, need: v.need, until: Date.now() + v.left * 1000, voted: old.voted || !!v.mine });
  if (v.done) { votes.delete(v.id); game.hud.toast(`${v.name.toUpperCase()} WAS VOTED OUT`); }
  else addChat({ sys: true, x: `Vote to kick ${v.name}: ${v.yes}/${v.need}. Pause → Players to vote.` });
  if (screen === 'pause') renderPausePlayers();
};
function renderPausePlayers() {
  const wrap = $('pm-players-wrap');
  const g = game, online = lobby.active && g.mode !== 'local';
  wrap.style.display = online ? '' : 'none';
  if (!online) return;
  const host = lobby.role === 'host';
  const people = g.characters.filter(c => !c.isBot && c !== g.player);
  const now = Date.now();
  setHTML('pm-players', people.length ? people.map(c => {
    const v = votes.get(c.id), live = v && v.until > now;
    const mutedNow = isMuted(c.uid, c.name), bl = isBlocked(c.uid);
    const kick = host ? `<button class="warn" data-mkick="${c.id}" data-nav>KICK</button>`
      : `<button class="warn" data-vk="${c.id}" data-nav ${live && v.voted ? 'disabled' : ''}>${live ? `VOTE KICK ${v.yes}/${v.need}` : 'VOTE KICK'}</button>`;
    return `<div class="prow t${c.team === g.player.team ? 0 : 1}"><span class="pn">${esc(c.name)}${account.isFriend(c.uid) ? ' <span class="pt">FRIEND</span>' : ''}</span>
      <button data-mute="${c.id}" data-nav>${mutedNow && !bl ? 'UNMUTE' : 'MUTE'}</button>
      ${c.uid ? `<button data-block="${c.id}" data-nav>${bl ? 'UNBLOCK' : 'BLOCK'}</button>` : ''}
      <button data-report="${c.id}" data-nav>REPORT</button>${kick}</div>`;
  }).join('') : '<div class="empty">No other players right now.</div>');
}
$('pm-players').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const id = +(b.dataset.mute || b.dataset.block || b.dataset.report || b.dataset.vk || b.dataset.mkick);
  const c = game.charById ? game.charById(id) : null;
  if (!c) return;
  if (b.dataset.mute) {
    const k = muteKey(c.uid, c.name);
    if (muted.has(k)) muted.delete(k); else muted.add(k);
    game.hud.toast(muted.has(k) ? `${c.name.toUpperCase()} MUTED` : `${c.name.toUpperCase()} UNMUTED`);
  } else if (b.dataset.block) {
    if (isBlocked(c.uid)) { blocked = blocked.filter(x => x.u !== c.uid); game.hud.toast(`${c.name.toUpperCase()} UNBLOCKED`); }
    else { blocked.unshift({ u: c.uid, n: c.name, at: Date.now() }); game.hud.toast(`${c.name.toUpperCase()} BLOCKED · MUTED AND CAN'T JOIN YOUR LOBBIES`); }
    saveBlocked();
  } else if (b.dataset.report) openReport(c);
  else if (b.dataset.vk) {
    const v = votes.get(c.id) || { yes: 0, need: 0, until: 0 };
    v.voted = true; votes.set(c.id, v);
    lobby.voteKick(c.id);
    game.hud.toast(`VOTE TO KICK ${c.name.toUpperCase()} SENT`);
  } else if (b.dataset.mkick) {
    const r = game.session && game.session.byChar ? game.session.byChar.get(c) : null;
    if (r) lobby.kick(r.peerId);
  }
  renderPausePlayers();
});
// report screen
let rpFrom = 'pause', rpTarget = null, rpReason = 'cheating', rpBusy = false;
function openReport(c) {
  rpFrom = screen || 'pause';
  rpTarget = { id: c.uid || '', name: c.name };
  $('rp-who').textContent = `PLAYER · ${c.name.toUpperCase()}`;
  $('rp-text').value = '';
  $('rp-status').innerHTML = ''; $('rp-status').className = 'join-status';
  $('rp-send').disabled = false;
  document.querySelectorAll('[data-rp]').forEach(x => x.classList.toggle('on', x.dataset.rp === 'cheating'));
  rpReason = 'cheating';
  showScreen('report');
}
function closeReport() { showScreen(rpFrom === 'report' ? 'pause' : rpFrom); if (screen === 'pause') setPauseSec('match'); }
document.querySelectorAll('[data-rp]').forEach(x => x.addEventListener('click', () => { rpReason = x.dataset.rp; document.querySelectorAll('[data-rp]').forEach(y => y.classList.toggle('on', y === x)); }));
$('rp-back').addEventListener('click', closeReport);
$('rp-send').addEventListener('click', async () => {
  if (rpBusy || !rpTarget) return;
  rpBusy = true; $('rp-send').disabled = true;
  const st = $('rp-status');
  st.className = 'join-status'; st.innerHTML = '<span class="spin"></span>Sending…';
  try {
    await account.report({ id: rpTarget.id, name: rpTarget.name, reason: rpReason, details: $('rp-text').value.trim(), mode: game.settings ? game.settings.mode : '', map: game.world ? game.world.id : '', code: lobby.public ? 'public' : 'private' });
    st.className = 'join-status good'; st.textContent = 'Thanks. Your report was sent.';
    game.hud.toast('REPORT SENT · THANK YOU');
    setTimeout(() => { if (screen === 'report') closeReport(); }, 1400);
  } catch (e) { st.className = 'join-status bad'; st.textContent = e.message; $('rp-send').disabled = false; }
  rpBusy = false;
});

// ---------- text chat (online lobbies and matches; the host filters and relays every line) ----------
const chatLines = [];
let chatOpen = false;
const chatOn = () => lobby.active && settings.chat !== false;
function clearChat() { chatLines.length = 0; $('chat-log').innerHTML = ''; closeChat(); syncChat(); }
function syncChat() {
  const on = chatOn();
  const menuChat = on && (screen === 'lobby' || screen === 'pause' || screen === 'end');
  document.body.classList.toggle('chat-on', on);
  document.body.classList.toggle('chat-menu', menuChat);
  document.body.classList.toggle('chat-open', on && (chatOpen || menuChat));
  // in the lobby and pause menus the chat sits inside the panel; in a match it floats over the HUD
  const chat = $('chat');
  const dock = !menuChat ? document.body : screen === 'lobby' ? document.querySelector($('lobby').classList.contains('classic') ? '#cl .cl-right' : '#lobby .mw') : screen === 'pause' ? document.querySelector('#pause .pause-panel') : document.querySelector('#end .mw') || document.body;
  if (dock && chat.parentElement !== dock) {
    if (dock === document.body) document.body.insertBefore(chat, $('chat-btn'));
    else dock.appendChild(chat);
  }
  chat.classList.toggle('docked', !!dock && dock !== document.body);
}
function addChat(line) {
  if (settings.chat === false) return;
  if (!line.sys && !line.me && isMuted(line.u, line.n)) return; // muted or blocked
  const my = game.state !== 'menu' && game.player ? game.player.team : (lobby.role === 'host' ? lobby.hostTeam : null);
  const cls = line.sys ? 'sys' : my == null ? `t${line.tm}` : line.tm === my ? 'f' : 'e';
  const el = document.createElement('div');
  el.className = `cl ${cls}`;
  el.innerHTML = line.sys ? `<i>${esc(line.x)}</i>` : `<b>${esc(line.n)}:</b> ${esc(line.x)}`;
  el.dataset.t = Date.now();
  const log = $('chat-log');
  log.appendChild(el);
  chatLines.push(el);
  while (chatLines.length > 40) chatLines.shift().remove();
  log.scrollTop = log.scrollHeight;
  if (!line.me && !line.sys && !chatOpen && screen === null) game.audio.play('ui', null, { ui: true, freq: 1800 });
}
lobby.onChat = addChat;
// in a match, old lines fade out unless the chat box is open
setInterval(() => { const now = Date.now(); for (const el of chatLines) el.classList.toggle('old', now - el.dataset.t > 9000); }, 1000);
function openChat() {
  if (!chatOn()) return;
  chatOpen = true;
  game.input.chatting = true;
  game.input.keys.clear();
  syncChat();
  $('chat-in').focus({ preventScroll: true });
}
function closeChat() {
  chatOpen = false;
  game.input.chatting = false;
  syncChat();
  if (document.activeElement === $('chat-in')) $('chat-in').blur();
}
$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('chat-in').value;
  if (v.trim() && !lobby.sendChat(v)) game.hud.toast('NOT CONNECTED');
  $('chat-in').value = '';
  if (screen === null) { closeChat(); if (game.state === 'playing' && !game.input.locked && !game.input.isTouch && game.input.lastDevice !== 'pad') game.input.lock(); }
});
$('chat-in').addEventListener('keydown', (e) => {
  e.stopPropagation(); // typing never reaches the game or the menus
  if (e.key === 'Escape') { e.preventDefault(); $('chat-in').value = ''; if (screen === null) closeChat(); else $('chat-in').blur(); }
});
$('chat-in').addEventListener('focus', () => { if (screen === null) { chatOpen = true; game.input.chatting = true; game.input.keys.clear(); syncChat(); } });
$('chat-btn').addEventListener('click', () => (chatOpen ? closeChat() : openChat()));
window.addEventListener('keydown', (e) => {
  if (screen !== null || game.state !== 'playing' || chatOpen || !chatOn() || e.repeat) return;
  if (e.code === 'KeyT' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); openChat(); }
});
$('opt-chat').addEventListener('change', () => { if (settings.chat === false) $('chat-log').innerHTML = ''; syncChat(); });
window.__chatReady = true;

// signed out: send the link from the sidebar
let sdBusy = false;
function sdStatus(html, cls) { const el = $('sd-in-status'); el.className = 'join-status' + (cls ? ' ' + cls : ''); el.innerHTML = html; }
async function sdSend() {
  if (sdBusy) return;
  sdBusy = true;
  const email = $('sd-email').value;
  if (await sendLink(email, $('sd-remember').checked, sdStatus)) {
    sdStatus(`Sent to <b>${esc(email.trim())}</b>. Type the 6-digit code below, or open the link on this device. Both work once, for 15 minutes.`, 'good');
    $('sd-codebox').classList.add('on');
    if (game.input.lastDevice === 'pad') focusEl($('sd-code-in')); else if (game.input.lastDevice !== 'touch') $('sd-code-in').focus({ preventScroll: true });
  }
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
  if (b.dataset.join) { joinFriend(b.dataset.join, b.dataset.with || ''); return; }
  if (b.dataset.addid) {
    b.disabled = true;
    try { const r = await account.addFriendById(b.dataset.addid); game.hud.toast(r.friends ? 'YOU\'RE NOW FRIENDS' : 'FRIEND REQUEST SENT'); }
    catch (err) { game.hud.toast(err.message.toUpperCase()); b.disabled = false; }
    return;
  }
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
function joinFriend(code, withUid = '') {
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
  tryJoin(withUid);
}

// presence: friends see you online and which match to join
let hbLast = '';
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
// Presence is sent only when it changes (menus / lobby / match) plus a keepalive every 10 minutes,
// which keeps account-server writes low enough for Cloudflare's free plan.
const KEEPALIVE_MS = 10 * 60 * 1000;
let hbSentAt = 0;
function heartbeat(force = false) {
  if (!account.enabled || !account.signedIn || window.BREACHPOINT_OFFLINE || document.hidden) return;
  const p = presenceNow(), k = JSON.stringify(p);
  if (!force && k === hbLast && Date.now() - hbSentAt < KEEPALIVE_MS) return;
  hbLast = k;
  hbSentAt = Date.now();
  account.presence(p);
}
// friends list: every 20 s while the sidebar is open, every 2 minutes otherwise (reads are cheap but not free)
let friendsAt = 0;
setInterval(() => {
  if (!account.signedIn || document.hidden) return;
  heartbeat(); // sends only on a change or when the keepalive is due
  if (Date.now() - friendsAt > (sideOpen ? 20000 : 120000)) { friendsAt = Date.now(); account.loadFriends().catch(() => {}); }
}, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) heartbeat(); });
// Switching away mid-match (alt-tab, a notification, turning a phone): a local match pauses so you don't come back
// dead. (Mouse players already pause when the pointer is released; this covers controllers and touch.)
const awayPause = () => { if (game.state === 'playing' && game.mode === 'local') game.pause(); };
window.addEventListener('blur', () => { if (game.input.lastDevice !== 'kbm' || game.input.isTouch) awayPause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) awayPause();
  else if (game.audio.ctx) game.audio.init();   // iOS leaves audio "interrupted" after a call or another app
});
// ...and sound that a phone call or another tab interrupted comes back with the next touch or key
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { const c = game.audio.ctx; if (c && c.state !== 'running') game.audio.init(); }, { capture: true, passive: true });
window.addEventListener('pagehide', () => { account.presenceOff(); hbLast = ''; });

// ---------- device-aware hints ----------
function renderHints(device) {
  const hint = (act, text) => (device === 'touch' ? '' : `<span>${glyph(act, device)} ${text}</span>`);
  const kb = (keys, text) => `<span>${keys.map(k => `<kbd>${k}</kbd>`).join('')} ${text}</span>`;
  const bumpers = (text) => `<span>${glyph('prevTab', device)}${glyph('nextTab', device)} ${text}</span>`;
  const subs = (text) => `<span>${glyph('prevSub', device)}${glyph('nextSub', device)} ${text}</span>`;
  let ps = 'match'; try { ps = pauseSec; } catch (_) { /* before init */ }
  const inOpt = tab === 'options', pOpt = ps === 'options', deep = tab === 'play' && playView !== 'root';
  $('menu-hints').innerHTML = device === 'pad'
    ? [hint('accept', 'Select'), hint('back', 'Back'), bumpers('Tabs'), inOpt ? subs('Categories') : '', inOpt ? hint('x', 'Apply') : '', playMode !== 'online' && deep ? hint('pause', 'Start match') : ''].join('')
    : device === 'touch' ? '' : [kb(['↑', '↓'], 'Navigate'), kb(['Enter'], 'Select'), kb(['Q', 'E'], 'Tabs'), inOpt ? kb(['Z', 'C'], 'Categories') : '', inOpt ? kb(['X'], 'Apply') : '', kb(['Esc'], 'Back')].join('');
  $('pause-hints').innerHTML = device === 'pad' ? [hint('accept', 'Select'), hint('back', ps === 'match' ? 'Resume' : 'Back'), bumpers('Sections'), pOpt ? subs('Categories') : '', pOpt ? hint('x', 'Apply') : ''].join('') : device === 'touch' ? '' : [kb(['Enter'], 'Select'), kb(['Q', 'E'], 'Sections'), pOpt ? kb(['Z', 'C'], 'Categories') : '', pOpt ? kb(['X'], 'Apply') : '', kb(['Esc'], ps === 'match' ? 'Resume' : 'Back')].join('');
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
const padCal = setupPadCal({ input: game.input, toast: (t) => game.hud.toast(t), sound: () => game.audio.play('ui', null, { ui: true }), onClose: () => { syncPadName(); if (game.input.lastDevice === 'pad') focusEl($('pad-test')); } });
function syncPadName() {
  const p = game.input.rawPad;
  $('pad-name').textContent = p ? (p.id.replace(/\s*\(.*$/, '').slice(0, 40) || 'Controller') : 'none detected';
}
$('pad-test').addEventListener('click', () => padCal.show());
game.input.onPadChange = (connected, id) => {
  const name = /xbox|xinput/i.test(id) ? 'XBOX CONTROLLER' : /dualsense|dualshock|054c|playstation/i.test(id) ? 'PLAYSTATION CONTROLLER' : 'CONTROLLER';
  game.hud.toast(connected ? `${name} CONNECTED` : 'CONTROLLER DISCONNECTED');
  syncPadName();
  const raw = game.input.rawPad;
  if (connected && raw && raw.mapping !== 'standard' && !/xbox|xinput|x-box|045e|microsoft/i.test(raw.id) && !loadPadMaps()[raw.id])
    setTimeout(() => game.hud.toast('BUTTONS WRONG? CALIBRATE IT: OPTIONS › CONTROLS › CONTROLLER'), 2200);
  if (!connected && game.state === 'playing') game.pause();
};
document.addEventListener('mousemove', () => { if (screen && game.input.lastDevice !== 'pad') focusEl(null); }, { passive: true });

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
  const ph = want !== 'random' && MAPS[want] && MAPS[want].photos && MAPS[want].photos[0];
  if (ph) {
    loadPhoto(ph).then(im => {
      if (!im || (game.state === 'menu' ? settings.map : game.world.id) !== want) return;
      const s = Math.max(c.width / im.width, c.height / im.height), w = im.width * s, h = im.height * s;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(im, (c.width - w) / 2, (c.height - h) / 2, w, h);
    });
    $('intel-mapname').textContent = MAPS[want].name.toUpperCase();
    return;
  }
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
game.onMinimap = () => drawIntel();
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
// models, textures and fonts stay on the device between visits (sw.js); not inside the desktop/offline build
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.BREACHPOINT_OFFLINE) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* private mode or blocked: downloads as before */ });
}
// the game started: forget the start-up count (a few seconds on, so a crash drawing the first menu frames counts)
setTimeout(() => {
  bootDone();
  if (safeMode) {
    offer('SAFE MODE', `The game didn't finish starting last time, so it's on the ${QUALITY[settings.quality].label} preset with the lightest menu. You can raise graphics in Options > Graphics once it runs well.`, null, '', 'OK');
  } else if (onBuiltIn() && (() => { try { return localStorage.getItem('breachpoint.igpuAsked') !== GPU.name; } catch (_) { return false; } })()) {
    try { localStorage.setItem('breachpoint.igpuAsked', GPU.name); } catch (_) { /* private mode */ }
    offer('RUNNING ON BUILT-IN GRAPHICS', `The browser is drawing the game with ${GPU.name}. If this PC also has an NVIDIA or AMD graphics card, the browser isn't using it. In Windows: Settings → System → Display → Graphics, choose your browser, set it to High performance, then restart the browser.`, null, '', 'OK');
  } else {
    // saved on a preset well above what this graphics hardware usually manages (e.g. Ultra on a laptop's integrated graphics)
    const cur = PRESET_RANK[settings.quality], best = PRESET_RANK[GPU.best];
    let asked = ''; try { asked = localStorage.getItem('breachpoint.presetAsked') || ''; } catch (_) { /* private mode */ }
    if (settings.quality !== 'custom' && cur > best && !GPU.soft && asked !== settings.quality + GPU.name) {
      try { localStorage.setItem('breachpoint.presetAsked', settings.quality + GPU.name); } catch (_) { /* private mode */ }
      offer('GRAPHICS', `${QUALITY[settings.quality].label} is heavy for ${GPU.name}. ${QUALITY[GPU.best].label} should run smoother.`, () => usePreset(GPU.best), `USE ${QUALITY[GPU.best].label.toUpperCase()}`);
    }
  }
}, 4000);
