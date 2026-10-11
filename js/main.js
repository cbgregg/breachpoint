// Entry point: menus, settings persistence, game bootstrap
import { DEFAULT_SETTINGS, TEAMS } from './config.js';
import { Game } from './game.js';
import { esc } from './hud.js';

const $ = (id) => document.getElementById(id);
const KEY = 'breachpoint.settings.v1';

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

function bindForm() {
  $('opt-name').value = settings.name;
  $('opt-primary').value = settings.primary;
  $('opt-team').value = String(settings.teamSize);
  $('opt-diff').value = settings.difficulty;
  $('opt-score').value = String(settings.scoreLimit);
  $('opt-time').value = String(settings.timeLimit);
  $('opt-sens').value = settings.sensitivity;
  $('opt-fov').value = settings.fov;
  $('opt-vol').value = settings.volume;
  $('opt-invert').checked = settings.invertY;
  $('opt-ff').checked = settings.friendlyFire;
  $('opt-fps').checked = settings.showFps;
  refreshOutputs();
}

function refreshOutputs() {
  $('out-sens').textContent = Number($('opt-sens').value).toFixed(2);
  $('out-fov').textContent = $('opt-fov').value + '°';
  $('out-vol').textContent = Math.round($('opt-vol').value * 100) + '%';
}

function readForm() {
  settings.name = ($('opt-name').value || 'Player').trim().slice(0, 16) || 'Player';
  settings.primary = $('opt-primary').value;
  settings.teamSize = parseInt($('opt-team').value, 10);
  settings.difficulty = $('opt-diff').value;
  settings.scoreLimit = parseInt($('opt-score').value, 10);
  settings.timeLimit = parseInt($('opt-time').value, 10);
  settings.sensitivity = parseFloat($('opt-sens').value);
  settings.fov = parseInt($('opt-fov').value, 10);
  settings.volume = parseFloat($('opt-vol').value);
  settings.invertY = $('opt-invert').checked;
  settings.friendlyFire = $('opt-ff').checked;
  settings.showFps = $('opt-fps').checked;
  saveSettings(settings);
}

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
  document.body.classList.toggle('ingame', id === null);
}

let game;
try {
  game = new Game($('app'));
} catch (err) {
  console.error(err);
  $('loading').innerHTML = '<p style="max-width:420px;text-align:center">Could not start WebGL. Try a recent version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>';
  throw err;
}
window.__game = game; // handy for debugging in the console

bindForm();
['opt-sens', 'opt-fov', 'opt-vol'].forEach(id => $(id).addEventListener('input', refreshOutputs));
showScreen('menu');

function deploy() {
  readForm();
  showScreen(null);
  game.startMatch(settings);
}

$('play').addEventListener('click', deploy);
$('opt-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') deploy(); });

// pause menu
const syncPause = () => {
  $('opt-sens2').value = settings.sensitivity;
  $('opt-vol2').value = settings.volume;
  $('out-sens2').textContent = Number(settings.sensitivity).toFixed(2);
  $('out-vol2').textContent = Math.round(settings.volume * 100) + '%';
};
$('opt-sens2').addEventListener('input', (e) => {
  settings.sensitivity = parseFloat(e.target.value);
  game.settings.sensitivity = settings.sensitivity;
  $('out-sens2').textContent = settings.sensitivity.toFixed(2);
  $('opt-sens').value = settings.sensitivity;
  saveSettings(settings);
});
$('opt-vol2').addEventListener('input', (e) => {
  settings.volume = parseFloat(e.target.value);
  game.settings.volume = settings.volume;
  game.audio.setVolume(settings.volume);
  $('out-vol2').textContent = Math.round(settings.volume * 100) + '%';
  $('opt-vol').value = settings.volume;
  saveSettings(settings);
});

game.onPause = (paused) => {
  if (paused) { syncPause(); showScreen('pause'); }
  else showScreen(null);
};
$('resume').addEventListener('click', () => game.resume());
$('restart').addEventListener('click', () => { showScreen(null); game.startMatch(settings); });
$('quit').addEventListener('click', () => { game.quitToMenu(); bindForm(); showScreen('menu'); });

// end screen
game.onEnd = (r) => {
  const title = $('end-title');
  title.className = '';
  if (r.winner === -1) title.textContent = 'DRAW';
  else if (r.winner === r.playerTeam) { title.textContent = 'VICTORY'; title.classList.add('win'); }
  else { title.textContent = 'DEFEAT'; title.classList.add('lose'); }
  $('end-score').innerHTML = `<span style="color:${TEAMS[0].css}">${r.scores[0]}</span> — <span style="color:${TEAMS[1].css}">${r.scores[1]}</span>`;
  const mvp = r.mvp;
  $('end-mvp').textContent = `MVP: ${mvp.name} · ${mvp.score} pts · ${mvp.kills}/${mvp.deaths}`;
  game.hud.renderScoreboard($('end-board'));
  setTimeout(() => showScreen('end'), 600);
};
$('again').addEventListener('click', () => { showScreen(null); game.startMatch(settings); });
$('menu-btn').addEventListener('click', () => { game.quitToMenu(); bindForm(); showScreen('menu'); });

// click canvas to re-capture mouse if lock was lost without pausing
$('app').addEventListener('click', () => {
  if (game.state === 'playing' && !game.input.locked && !game.input.isTouch) game.input.lock();
});

void esc;
