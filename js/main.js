// Entry point: menus (mouse, keyboard and controller navigable), settings persistence, game bootstrap
import { DEFAULT_SETTINGS, WEAPONS, PRIMARIES, FRIENDLY_CSS, ENEMY_CSS, PUBLIC_MATCH } from './config.js';
import { MAPS } from './world.js';
import { Game } from './game.js';
import { glyph } from './hud.js';
import { loadAssets } from './assets.js';
import { Lobby, MAX_HUMANS } from './online.js';
import { turnAvailable, turnServers, turnStatus } from './net.js';

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
{
  let op = 0, tx = 0;
  const show = () => { $('load-text').textContent = `Loading operators ${Math.round(op * 100)}% · textures ${Math.round(tx * 100)}%`; };
  await loadAssets((f) => { op = f; show(); }, (f) => { tx = f; show(); });
}
$('load-text').textContent = 'Building Tarsa Market…';
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
  ['opt-name', 'name', 'text'], ['opt-map', 'map', 'str'], ['opt-team', 'teamSize', 'int'], ['opt-diff', 'difficulty', 'str'],
  ['opt-score', 'scoreLimit', 'int'], ['opt-time', 'timeLimit', 'int'], ['opt-ff', 'friendlyFire', 'bool'],
  ['opt-quality', 'quality', 'str'], ['opt-fov', 'fov', 'int'], ['opt-fps', 'showFps', 'bool'],
  ['opt-sens', 'sensitivity', 'float'], ['opt-adsmode', 'adsMode', 'str'], ['opt-invert', 'invertY', 'bool'], ['opt-padsens', 'padSensitivity', 'float'],
  ['opt-deadzone', 'padDeadzone', 'float'], ['opt-aa', 'aimAssist', 'bool'], ['opt-vib', 'vibration', 'bool'],
  ['opt-vol', 'volume', 'float'], ['opt-music', 'musicVolume', 'float'], ['opt-relay', 'privateRelay', 'bool'], ['opt-touchads', 'touchAds', 'str'], ['opt-autofire', 'touchAutoFire', 'bool'],
];
const outputs = {
  'opt-fov': ['out-fov', v => `${v}°`], 'opt-sens': ['out-sens', v => Number(v).toFixed(2)], 'opt-padsens': ['out-padsens', v => Number(v).toFixed(2)],
  'opt-deadzone': ['out-deadzone', v => Number(v).toFixed(2)], 'opt-vol': ['out-vol', v => `${Math.round(v * 100)}%`], 'opt-music': ['out-music', v => `${Math.round(v * 100)}%`],
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
  $('opt-music2').value = settings.musicVolume; $('out-music2').textContent = `${Math.round(settings.musicVolume * 100)}%`;
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
pauseSlider('opt-music2', 'musicVolume', 'out-music2', v => `${Math.round(v * 100)}%`, () => game.music.setVolume(settings.musicVolume));

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
  if (paused) { syncPause(); showScreen('pause'); }
  else showScreen(null);
};
$('resume').addEventListener('click', () => game.resume());
$('restart').addEventListener('click', () => { showScreen(null); game.startMatch(settings); });
$('quit').addEventListener('click', () => { leaveOnline(); game.quitToMenu(); writeForm(); showScreen('menu'); });

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
      game.startMatch(publicSettings(), { mode: 'host', lobby });
      lobby.broadcastLobby();
      syncOnlineFlags();
      showScreen(null);
    }, 15000);
    game.hud.toast('NEXT PUBLIC MATCH IN 15 SECONDS');
  }
};
let nextMatchT = 0;
$('again').addEventListener('click', () => {
  if (lobby.active) { openLobby(); return; }
  showScreen(null); game.startMatch(settings);
});
$('menu-btn').addEventListener('click', () => { leaveOnline(); game.quitToMenu(); writeForm(); showScreen('menu'); });

// ---------- online (peer-to-peer, 6-digit codes) ----------
// sandboxed previews can't open WebRTC/WebSocket connections; builds there set this flag
if (window.BREACHPOINT_OFFLINE) {
  document.querySelector('.online-row').style.display = 'none';
  document.querySelector('#pane-play .pane-note').textContent = 'Online play (6-digit codes) works on the GitHub Pages version of the game.';
}
const lobby = new Lobby(game);
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
      ? pend.map(p => `<div class="prow req"><span class="pn">${esc(p.name)}</span><span class="pt">${esc((p.primary || '').toUpperCase())}</span>
          <button class="ok" data-accept="${esc(p.peerId)}" data-nav>ACCEPT</button><button data-deny="${esc(p.peerId)}" data-nav>DENY</button></div>`).join('')
      : '<div class="empty">No one is waiting. Share the code above.</div>');
    const swap = (id) => (inMatch ? '' : `<button data-swap="${esc(id)}" data-nav title="Switch team">⇄</button>`);
    const rows = [playerRow({ name: settings.name || 'Operator', team: lobby.hostTeam, tag: 'HOST (YOU)' }, swap('host'))];
    for (const p of lobby.players.values()) rows.push(playerRow(p, swap(p.peerId) + `<button class="warn" data-kick="${esc(p.peerId)}" data-nav>KICK</button>`));
    setHTML('host-players', rows.join(''));
    $('host-count').textContent = `${lobby.players.size + 1}/${MAX_HUMANS}`;
    $('lobby-start').style.display = inMatch ? 'none' : '';
    $('lobby-back').style.display = inMatch ? '' : 'none';
    $('host-note').textContent = inMatch
      ? 'Players you accept now drop straight into the match, taking a bot\'s place.'
      : `${MAPS[settings.map] ? MAPS[settings.map].name : 'Random map'} · ${settings.teamSize}v${settings.teamSize} · ${settings.scoreLimit} kills · ${settings.timeLimit} min${settings.friendlyFire ? ' · friendly fire' : ''}. Change these on the Play tab; bots fill empty slots.`;
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
  lobby.host(settings.name, settings.primary);
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
  lobby.quick(settings.name, settings.primary);
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
const publicSettings = () => ({ ...settings, ...PUBLIC_MATCH });
lobby.onQuickHost = () => {
  game.startMatch(publicSettings(), { mode: 'host', lobby });
  syncOnlineFlags();
  showScreen(null);
  game.hud.toast('NO OPEN MATCHES — YOU\'RE HOSTING. PLAYERS WILL DROP IN');
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
  lobby.join(joinCode, settings.name, settings.primary);
}
lobby.onMapHint = (id) => { if (MAPS[id] && id !== game.world.id) game.loadMap(id); };
const setMapHint = () => { lobby.mapHint = lobby.public ? '' : (MAPS[settings.map] ? settings.map : ''); };
$('lobby-start').addEventListener('click', () => {
  readAll();
  showScreen(null);
  clearTimeout(nextMatchT);
  game.startMatch(lobby.public ? publicSettings() : settings, { mode: 'host', lobby });
  lobby.broadcastLobby();
  syncOnlineFlags();
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
$('pause-end').addEventListener('click', () => game.endMatch());

lobby.onStart = (m) => {
  try {
    game.startMatch(settings, { mode: 'guest', lobby, start: m });
    syncOnlineFlags();
    showScreen(null);
  } catch (err) {
    console.error(err);
    lobby.close('The host sent a match this version can\'t load.');
  }
};
lobby.onClosed = (reason, wasPublic) => {
  if (game.mode === 'guest' && game.state !== 'menu') game.quitToMenu();
  // a public host went away: find another match automatically
  if (wasPublic && /host closed|Lost connection/.test(reason)) {
    lobby.quick(settings.name, settings.primary);
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
  if (screen !== 'lobby' || lobby.role === 'host' || game.input.enabled) return;
  if (/^\d$/.test(e.key)) keypad(e.key);
  else if (e.key === 'Backspace') keypad('del');
  else if (e.key === 'Enter') { e.preventDefault(); tryJoin(); }
});
window.addEventListener('paste', (e) => {
  if (screen !== 'lobby' || lobby.role) return;
  const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
  if (digits) { joinCode = digits; joinError = ''; renderLobby(); }
});
for (const ev of ['beforeunload', 'pagehide']) window.addEventListener(ev, () => { if (lobby.active) lobby.close(); });

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
  const pref = screen === 'menu' ? $('play') : screen === 'pause' ? $('resume')
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
      else if (screen === 'lobby') {
        if (game.mode === 'host' && game.live) showScreen('pause');
        else if (lobby.role !== 'guest' && joinCode.length) keypad('del');
        else $('lobby-leave').click();
      }
      break;
    case 'start':
      if (screen === 'pause') game.resume();
      else if (screen === 'menu') deploy();
      else if (screen === 'end') $('again').click();
      else if (screen === 'lobby' && lobby.role === 'host' && $('lobby-start').offsetParent) $('lobby-start').click();
      else if (screen === 'lobby' && !lobby.role) tryJoin();
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
  $('lobby-hints').innerHTML = device === 'pad' ? [hint('accept', 'Select'), hint('back', 'Back')].join('') : device === 'touch' ? '' : '<span><kbd>0</kbd>–<kbd>9</kbd> Code</span><span><kbd>Enter</kbd> Join</span>' + hint('back', 'Back');
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
function drawIntel() {
  const c = $('intel-map'), g = c.getContext('2d');
  g.drawImage(game.minimap.canvas, 0, 0, c.width, c.height);
  g.fillStyle = 'rgba(79,179,255,0.25)'; g.fillRect(0, 0, c.width * 0.13, c.height);
  g.fillStyle = 'rgba(255,77,77,0.25)'; g.fillRect(c.width * 0.87, 0, c.width * 0.13, c.height);
  $('intel-mapname').textContent = (settings.map === 'random' && game.state === 'menu' ? 'RANDOM' : game.world.name).toUpperCase();
}
game.onMapChange = () => drawIntel();
// picking a map in the menu loads it behind the menu, so you can see it before deploying
$('opt-map').addEventListener('change', () => {
  if (MAPS[settings.map] && game.state === 'menu') game.loadMap(settings.map);
  if (lobby.role === 'host') { setMapHint(); lobby.broadcastLobby(); }
  drawIntel();
});
if (MAPS[settings.map] && settings.map !== game.world.id) game.loadMap(settings.map);
drawIntel();

writeForm();
renderHints(game.input.lastDevice);
showScreen('menu');
{
  const inv = new URLSearchParams(location.search).get('join');
  if (inv && /^\d{6}$/.test(inv)) { joinCode = inv; openLobby(); }
}
