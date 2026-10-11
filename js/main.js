// Entry point: menus (mouse, keyboard and controller navigable), settings persistence, game bootstrap
import { DEFAULT_SETTINGS, WEAPONS, PRIMARIES, FRIENDLY_CSS, ENEMY_CSS, MAP_NAME } from './config.js';
import { Game } from './game.js';
import { glyph } from './hud.js';

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

// ---------- game bootstrap ----------
let game;
// let the loading screen paint before the (synchronous) world build
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
  ['opt-name', 'name', 'text'], ['opt-team', 'teamSize', 'int'], ['opt-diff', 'difficulty', 'str'],
  ['opt-score', 'scoreLimit', 'int'], ['opt-time', 'timeLimit', 'int'], ['opt-ff', 'friendlyFire', 'bool'],
  ['opt-quality', 'quality', 'str'], ['opt-fov', 'fov', 'int'], ['opt-fps', 'showFps', 'bool'],
  ['opt-sens', 'sensitivity', 'float'], ['opt-invert', 'invertY', 'bool'], ['opt-padsens', 'padSensitivity', 'float'],
  ['opt-deadzone', 'padDeadzone', 'float'], ['opt-aa', 'aimAssist', 'bool'], ['opt-vib', 'vibration', 'bool'],
  ['opt-vol', 'volume', 'float'],
];
const outputs = {
  'opt-fov': ['out-fov', v => `${v}°`], 'opt-sens': ['out-sens', v => Number(v).toFixed(2)], 'opt-padsens': ['out-padsens', v => Number(v).toFixed(2)],
  'opt-deadzone': ['out-deadzone', v => Number(v).toFixed(2)], 'opt-vol': ['out-vol', v => `${Math.round(v * 100)}%`],
};
function writeForm() {
  for (const [id, key, type] of bindings) {
    const el = $(id);
    if (type === 'bool') el.checked = !!settings[key];
    else el.value = String(settings[key]);
  }
  for (const id in outputs) $(outputs[id][0]).textContent = outputs[id][1]($(id).value);
  renderWeapons();
}
function readField(id, key, type) {
  const el = $(id);
  let v = type === 'bool' ? el.checked : el.value;
  if (type === 'int') v = parseInt(v, 10);
  if (type === 'float') v = parseFloat(v);
  if (type === 'text') v = (v || 'Operator').trim().slice(0, 16) || 'Operator';
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
    if (game.settings) Object.assign(game.settings, { sensitivity: settings.sensitivity, padSensitivity: settings.padSensitivity, fov: settings.fov, invertY: settings.invertY, aimAssist: settings.aimAssist, showFps: settings.showFps });
  });
}

// weapon cards with stat bars
function stat(def) {
  return {
    DAMAGE: Math.min(1, (def.damage * def.pellets) / 110),
    'FIRE RATE': Math.min(1, def.rpm / 900),
    RANGE: Math.min(1, def.falloffEnd / 120),
    MOBILITY: Math.max(0.1, 1 - def.adsTime / 0.34),
  };
}
function renderWeapons() {
  const list = $('weapon-list');
  list.innerHTML = PRIMARIES.map(id => {
    const d = WEAPONS[id];
    const st = stat(d);
    return `<button class="wcard ${settings.primary === id ? 'on' : ''}" data-weapon="${id}" data-nav>
      <span class="wn">${d.name.toUpperCase()}</span><span class="wt">${d.mode} · ${d.mag} RDS</span>
      <span class="stats">${Object.entries(st).map(([k, v]) => `<span class="stat">${k}<i><b style="width:${Math.round(v * 100)}%"></b></i></span>`).join('')}</span>
    </button>`;
  }).join('') + `<div class="row"><label>Secondary</label><span class="wn" style="font-family:var(--display);font-weight:600;letter-spacing:.08em">${WEAPONS.pistol.name.toUpperCase()}</span></div>`;
  list.querySelectorAll('.wcard').forEach(b => b.addEventListener('click', () => {
    settings.primary = b.dataset.weapon;
    saveSettings(settings);
    list.querySelectorAll('.wcard').forEach(x => x.classList.toggle('on', x === b));
  }));
}

// ---------- tabs ----------
const TABS = ['play', 'loadout', 'options'];
let tab = 'play';
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === `pane-${t}`));
  game.audio.play('ui', null, { ui: true });
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

// ---------- screens ----------
let screen = 'menu';
function showScreen(id) {
  screen = id;
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
  document.body.classList.toggle('ingame', id === null);
  if (id && game.input.lastDevice === 'pad') setTimeout(() => focusFirst(), 0);
}

function deploy() {
  for (const [id, key, type] of bindings) readField(id, key, type);
  saveSettings(settings);
  showScreen(null);
  game.startMatch(settings);
}
$('play').addEventListener('click', deploy);
$('opt-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') deploy(); });

// pause
const syncPause = () => {
  $('opt-sens2').value = settings.sensitivity; $('out-sens2').textContent = Number(settings.sensitivity).toFixed(2);
  $('opt-padsens2').value = settings.padSensitivity; $('out-padsens2').textContent = Number(settings.padSensitivity).toFixed(2);
  $('opt-vol2').value = settings.volume; $('out-vol2').textContent = `${Math.round(settings.volume * 100)}%`;
};
const pauseSlider = (id, key, out, fmt, after) => $(id).addEventListener('input', (e) => {
  settings[key] = parseFloat(e.target.value);
  if (game.settings) game.settings[key] = settings[key];
  $(out).textContent = fmt(settings[key]);
  if (after) after();
  saveSettings(settings);
  writeForm();
});
pauseSlider('opt-sens2', 'sensitivity', 'out-sens2', v => v.toFixed(2));
pauseSlider('opt-padsens2', 'padSensitivity', 'out-padsens2', v => v.toFixed(2));
pauseSlider('opt-vol2', 'volume', 'out-vol2', v => `${Math.round(v * 100)}%`, () => game.audio.setVolume(settings.volume));

game.onPause = (paused) => {
  if (paused) { syncPause(); showScreen('pause'); }
  else showScreen(null);
};
$('resume').addEventListener('click', () => game.resume());
$('restart').addEventListener('click', () => { showScreen(null); game.startMatch(settings); });
$('quit').addEventListener('click', () => { game.quitToMenu(); writeForm(); showScreen('menu'); });

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
  setTimeout(() => showScreen('end'), 900);
};
$('again').addEventListener('click', () => { showScreen(null); game.startMatch(settings); });
$('menu-btn').addEventListener('click', () => { game.quitToMenu(); writeForm(); showScreen('menu'); });

// re-capture the mouse if lock was lost without pausing
$('app').addEventListener('click', () => {
  if (game.state === 'playing' && !game.input.locked && !game.input.isTouch && game.input.lastDevice !== 'pad') game.input.lock();
});

// ---------- controller / keyboard menu navigation ----------
function navItems() {
  const scr = screen ? $(screen) : null;
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
  const pref = screen === 'menu' ? $('play') : screen === 'pause' ? $('resume') : $('again');
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
game.input.onNav = (dir) => {
  if (!screen) return;
  const items = navItems();
  const el = document.activeElement && items.includes(document.activeElement) ? document.activeElement : null;
  const move = (d) => {
    const i = el ? items.indexOf(el) : -1;
    focusEl(items[Math.max(0, Math.min(items.length - 1, i + d))]);
    game.audio.play('ui', null, { ui: true, freq: 2600 });
  };
  switch (dir) {
    case 'up': move(-1); break;
    case 'down': move(1); break;
    case 'left': case 'right': {
      const d = dir === 'left' ? -1 : 1;
      if (el && el.tagName === 'SELECT') cycleSelect(el, d);
      else if (el && el.type === 'range') stepRange(el, d);
      else if (el && el.type === 'checkbox') { el.checked = d > 0; el.dispatchEvent(new Event('change')); }
      else if (el && el.classList.contains('wcard')) move(d);
      else if (screen === 'menu') game.input.onNav(d > 0 ? 'nextTab' : 'prevTab');
      else move(d);
      break;
    }
    case 'accept':
      if (!el) { focusFirst(); break; }
      if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
      else if (el.tagName === 'SELECT') cycleSelect(el, el.selectedIndex === el.options.length - 1 ? -el.selectedIndex : 1);
      else if (el.tagName === 'INPUT') break;
      else el.click();
      break;
    case 'back':
      if (screen === 'pause') game.resume();
      else if (screen === 'menu' && tab !== 'play') { setTab('play'); focusFirst(); }
      break;
    case 'start':
      if (screen === 'pause') game.resume();
      else if (screen === 'menu') deploy();
      else if (screen === 'end') $('again').click();
      break;
    case 'prevTab': case 'nextTab':
      if (screen === 'menu') {
        const i = TABS.indexOf(tab);
        setTab(TABS[(i + (dir === 'nextTab' ? 1 : TABS.length - 1)) % TABS.length]);
        focusFirst();
      }
      break;
    default: break;
  }
};
window.addEventListener('keydown', (e) => {
  if (!screen || game.input.enabled) return;
  const typing = document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
  if (e.key === 'Escape') { e.preventDefault(); game.input.onNav('back'); }
  else if (!typing && screen === 'menu' && (e.key === 'q' || e.key === 'Q')) game.input.onNav('prevTab');
  else if (!typing && screen === 'menu' && (e.key === 'e' || e.key === 'E')) game.input.onNav('nextTab');
});

// ---------- device-aware hints ----------
function renderHints(device) {
  const hint = (act, text) => (device === 'touch' ? '' : `<span>${glyph(act, device)} ${text}</span>`);
  $('menu-hints').innerHTML = device === 'pad'
    ? [hint('accept', 'Select'), hint('back', 'Back'), `<span>${glyph('prevTab', device)}${glyph('nextTab', device)} Tabs</span>`, hint('pause', 'Deploy')].join('')
    : device === 'touch' ? '' : [hint('accept', 'Deploy'), `<span><kbd>Q</kbd><kbd>E</kbd> Tabs</span>`, hint('back', 'Back')].join('');
  $('pause-hints').innerHTML = device === 'pad' ? [hint('accept', 'Select'), hint('back', 'Resume')].join('') : device === 'touch' ? '' : hint('back', 'Resume');
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
(() => {
  const c = $('intel-map'), g = c.getContext('2d');
  g.drawImage(game.minimap.canvas, 0, 0, c.width, c.height);
  g.fillStyle = 'rgba(79,179,255,0.25)'; g.fillRect(0, 0, c.width * 0.13, c.height);
  g.fillStyle = 'rgba(255,77,77,0.25)'; g.fillRect(c.width * 0.87, 0, c.width * 0.13, c.height);
  $('intel-mapname').textContent = MAP_NAME.toUpperCase();
})();

writeForm();
renderHints(game.input.lastDevice);
showScreen('menu');
