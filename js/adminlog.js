// Owner's admin log: Ctrl+Shift+L (or F10). Locked behind the account server's ADMIN_KEY secret: the first time on a
// device it asks for the key and checks it with the server; nobody without it can open it.
// From page load it records this session: console output, uncaught errors, failed requests, peer-to-peer
// events and game events (kept in memory only, never sent anywhere). The panel shows live connection and
// match info, that session log, and the server's own log, stats, reports, feedback and flagged accounts
// (GET /admin/log). Copy or download everything as text.
import { AUTH_ENDPOINT } from './config.js';
import { turnStatus, turnAvailable, Net } from './net.js';

const MAX = 3000;
let panel = null, tab = 'overview', server = null, serverErr = '', filter = '', level = 'all', renderT = 0;   // first: alog() reads them
const lines = [];
const t0 = performance.now();
const KEY = 'breachpoint.adminKey';
const stamp = () => { const d = new Date(); return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`; };
const fmt = (a) => a.map(v => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? '\n' + v.stack.split('\n').slice(1, 4).join('\n') : ''}`;
  try { return JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x)).slice(0, 600); } catch (_) { return String(v); }
}).join(' ');
export function alog(level, cat, ...msg) {
  // scrub anything that looks like a secret before it is stored
  const text = fmt(msg).replace(/(session|token|key|tk|Bearer)(["':= ]+)[A-Za-z0-9_\-.]{12,}/gi, '$1$2…');
  lines.push({ t: stamp(), s: ((performance.now() - t0) / 1000).toFixed(1), level, cat, text });
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
  if (panel && !panel.hidden && tab === 'client') renderSoon();
}

// ---------- capture ----------
for (const lv of ['log', 'info', 'warn', 'error', 'debug']) {
  const orig = console[lv].bind(console);
  console[lv] = (...a) => { alog(lv === 'log' || lv === 'debug' ? 'info' : lv, 'console', ...a); orig(...a); };
}
addEventListener('error', (e) => alog('error', 'page', e.message, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : '', e.error && e.error.stack ? e.error.stack.split('\n').slice(1, 4).join(' | ') : ''));
addEventListener('unhandledrejection', (e) => alog('error', 'promise', e.reason));
const ofetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input && input.url || input);
  const short = url.replace(/^https?:\/\/[^/]*\.workers\.dev/, (m) => m.includes('auth') ? '[auth]' : m.includes('turn') ? '[turn]' : m).split('?')[0];
  const t = performance.now();
  try {
    const r = await ofetch(input, init);
    const ms = Math.round(performance.now() - t);
    if (!r.ok) alog('warn', 'net', `${(init && init.method) || 'GET'} ${short} → HTTP ${r.status} (${ms} ms)`);
    else if (/\[auth\]|\[turn\]/.test(short)) alog('info', 'net', `${(init && init.method) || 'GET'} ${short} → ${r.status} (${ms} ms)`);
    return r;
  } catch (e) {
    alog('error', 'net', `${(init && init.method) || 'GET'} ${short} failed: ${e.message}`);
    throw e;
  }
};
const oemit = Net.prototype.emit;
Net.prototype.emit = function (ev, ...a) {
  if (ev === 'peerJoin') alog('info', 'p2p', `peer joined ${String(a[0]).slice(0, 8)}`);
  else if (ev === 'peerLeave') alog('warn', 'p2p', `peer left ${String(a[0]).slice(0, 8)}`);
  else if (ev === 'error') alog('error', 'p2p', 'connection error:', a[0]);
  else if (ev === 'msg' && a[0] && /^(hello|welcome|start|end|kick|deny|full|bye|lobby)$/.test(a[0].t)) alog('info', 'p2p', `msg "${a[0].t}" from ${String(a[1]).slice(0, 8)}`);
  return oemit.call(this, ev, ...a);
};
const oopen = Net.prototype.open;
Net.prototype.open = function (code, o) { alog('info', 'p2p', `opening room (relay-only ${!!(o && o.relayOnly)})`); return oopen.call(this, code, o); };
addEventListener('online', () => alog('info', 'net', 'browser back online'));
addEventListener('offline', () => alog('warn', 'net', 'browser went offline'));
document.addEventListener('visibilitychange', () => alog('info', 'page', `tab ${document.hidden ? 'hidden' : 'visible'}`));
alog('info', 'page', `loaded ${location.href.split('#')[0]} · ${navigator.userAgent}`);

// game state changes, polled (no hooks needed in the game code)
let lastSig = '';
setInterval(() => {
  const g = window.__game, L = window.__lobby;
  if (!g) return;
  const sig = [g.state, g.mode, g.world && g.world.id, g.settings && g.settings.mode, L && L.role, L && L.status, L && L.public ? 'pub' : '', L && L.players ? L.players.size : 0].join('|');
  if (sig !== lastSig) { lastSig = sig; alog('info', 'game', `state=${g.state} mode=${g.mode} map=${g.world && g.world.id} gamemode=${g.settings && g.settings.mode} lobby=${L ? `${L.role || '-'}/${L.status || '-'}${L.public ? ' public' : ''} players=${L.players ? L.players.size : 0}` : '-'}`); }
}, 500);
// frame rate, sampled every 10 s while a match runs
let frames = 0;
const countFrame = () => { frames++; requestAnimationFrame(countFrame); };
requestAnimationFrame(countFrame);
let fpsNow = 0;
setInterval(() => { fpsNow = frames / 10; frames = 0; const g = window.__game; if (g && g.live) alog('info', 'perf', `${fpsNow.toFixed(0)} fps · render ${g.renderer && g.renderer.renderPR ? (g.renderer.renderPR() * 100).toFixed(0) + '%' : '?'}${performance.memory ? ` · heap ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''}`); }, 10000);

// ---------- panel ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } };
const setKey = (k) => { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch (_) { /* private mode */ } };
const endpoint = () => (AUTH_ENDPOINT || '').replace(/\/+$/, '');

async function fetchServer(key = getKey()) {
  if (!endpoint()) { serverErr = 'No account server configured (AUTH_ENDPOINT).'; return false; }
  try {
    const r = await ofetch(`${endpoint()}/admin/log`, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { serverErr = d.error || `HTTP ${r.status}`; return r.status; }
    server = d; serverErr = ''; return true;
  } catch (e) { serverErr = `Could not reach the account server: ${e.message}`; return false; }
}

function overviewText() {
  const g = window.__game, L = window.__lobby, out = [];
  const add = (k, v) => out.push([k, v]);
  add('Time', new Date().toString());
  add('Page', location.href.split('#')[0]);
  add('Browser', navigator.userAgent);
  add('Screen', `${screen.width}×${screen.height} @${devicePixelRatio}x · window ${innerWidth}×${innerHeight}`);
  add('Online', navigator.onLine ? 'yes' : 'NO');
  if (navigator.connection) add('Network', `${navigator.connection.effectiveType || '?'} · ${navigator.connection.downlink || '?'} Mbps · rtt ${navigator.connection.rtt ?? '?'} ms`);
  try {
    const gl = g.renderer.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    add('GPU', String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
  } catch (_) { /* no context */ }
  if (g) {
    add('Frame rate', `${fpsNow.toFixed(0)} fps (10 s average)`);
    if (g.renderer) add('Graphics', `${(g.settings && g.settings.quality) || '?'} · render scale ${g.renderer.renderPR ? (g.renderer.renderPR() * 100).toFixed(0) + '%' : '?'} · MSAA ${g.renderer.msaa ? 'on' : 'off'}`);
    if (performance.memory) add('JS heap', `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} / ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB`);
    add('Game', `state ${g.state} · ${g.mode} · map ${g.world ? g.world.id : '?'} · mode ${g.settings ? g.settings.mode : '?'}`);
    if (g.characters) add('Players', `${g.characters.filter(c => !c.isBot).length} humans, ${g.characters.filter(c => c.isBot).length} bots · score ${g.scores ? g.scores.join(' – ') : '?'}`);
  }
  add('Account server', `${endpoint() || 'off'}${L && L.account ? ` · ${L.account.signedIn ? `signed in as ${L.account.tag || '(no Name Tag)'}` : 'not signed in'}` : ''}`);
  add('TURN relay', turnAvailable() ? `${turnStatus.ok ? 'OK' : 'not working'} · ${turnStatus.detail}` : 'not configured');
  if (L) {
    add('Lobby', `${L.role || 'none'} · ${L.status || '-'} · ${L.public ? 'public' : 'private'}${L.code ? ` · code ${L.code}` : ''}${L.net && L.net.relayed ? ' · relayed (IP hidden)' : ''}`);
    if (L.quickMode) add('Matchmaking', `modes ${(L.quickModes || []).join(', ')} · lobby mode ${L.quickGm || '-'}`);
    if (L.players && L.players.size) for (const p of L.players.values()) add(`  ${p.name || p.peerId}`, `team ${p.team ?? '?'} · ping ${p.ping || '?'} ms`);
    if (L.net && L.net.peers) add('P2P peers', `${L.net.peers.size}`);
    const b = L.board;
    if (b && b.sockets) add('Nostr relays', b.sockets.length ? b.sockets.map(ws => `${ws.url.replace('wss://', '')} ${['connecting', 'open', 'closing', 'closed'][ws.readyState]}`).join(' · ') : 'not connected');
    if (b && b.ads) add('Public lobbies seen', `${b.ads.size}`);
  }
  const errs = lines.filter(l => l.level === 'error').length, warns = lines.filter(l => l.level === 'warn').length;
  add('This session', `${lines.length} log lines · ${errs} errors · ${warns} warnings · up ${((performance.now() - t0) / 60000).toFixed(1)} min`);
  return out;
}

function serverText() {
  if (!server) return serverErr ? `SERVER: ${serverErr}` : 'SERVER: loading…';
  const s = server, o = [];
  o.push('SERVER', ...Object.entries(s.server).map(([k, v]) => `  ${k}: ${v}`));
  o.push('COUNTS', ...Object.entries(s.counts).map(([k, v]) => `  ${k}: ${v}`));
  o.push(`FLAGGED ACCOUNTS (${s.flagged.length})`, ...s.flagged.map(f => `  ${f.tag} (${f.id})${f.banned ? ' BANNED' : ''}${f.review ? ' UNDER REVIEW' : ''} · xp ${f.xp} · held ${f.held}${f.flags.length ? '\n    ' + f.flags.join('\n    ') : ''}`));
  o.push(`REPORTS (latest ${s.reports.length})`, ...s.reports.map(r => `  ${r.at} · ${r.reason} · ${r.targetTag || r.target} ← ${r.byTag || r.by} · ${Object.entries(r.meta || {}).map(([k, v]) => `${k}=${v}`).join(' ')}${r.details ? '\n    ' + r.details.replace(/\n/g, '\n    ') : ''}`));
  o.push(`FEEDBACK (latest ${s.feedback.length})`, ...s.feedback.map(f => `  ${f.at} · ${f.kind} · ${f.who || 'anonymous'}${f.contact ? ' · ' + f.contact : ''} · ${f.country || ''}\n    ${f.text.replace(/\n/g, '\n    ')}`));
  o.push(`SERVER LOG (latest ${s.log.length})`, ...s.log.map(l => `  ${l.at} [${l.kind}] ${l.msg}`));
  return o.join('\n');
}

function allText() {
  return ['BREACHPOINT ADMIN LOG', ...overviewText().map(([k, v]) => `${k}: ${v}`), '', serverText(), '', 'CLIENT LOG',
    ...lines.map(l => `${l.t} +${l.s}s ${l.level.toUpperCase().padEnd(5)} [${l.cat}] ${l.text}`)].join('\n');
}

function renderSoon() { if (!renderT) renderT = setTimeout(() => { renderT = 0; render(); }, 250); }
function render() {
  if (!panel || panel.hidden) return;
  const body = panel.querySelector('.al-body');
  panel.querySelectorAll('[data-al-tab]').forEach(b => b.classList.toggle('on', b.dataset.alTab === tab));
  panel.querySelector('.al-tools').hidden = tab !== 'client';
  if (tab === 'overview') body.innerHTML = `<table>${overviewText().map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  else if (tab === 'server') body.innerHTML = `<pre>${esc(serverText())}</pre>`;
  else {
    const f = filter.toLowerCase();
    const rows = lines.filter(l => (level === 'all' || l.level === level) && (!f || `${l.cat} ${l.text}`.toLowerCase().includes(f)));
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
    body.innerHTML = `<pre>${rows.map(l => `<span class="al-${l.level}">${esc(`${l.t} +${l.s}s ${l.level.toUpperCase().padEnd(5)} [${l.cat}] ${l.text}`)}</span>`).join('\n') || 'Nothing logged yet.'}</pre>`;
    if (atBottom) body.scrollTop = body.scrollHeight;
  }
}

function build() {
  panel = document.createElement('div');
  panel.id = 'admin-log';
  panel.hidden = true;
  panel.innerHTML = `<div class="al-head"><b>ADMIN LOG</b>
    <button data-al-tab="overview">OVERVIEW</button><button data-al-tab="client">CLIENT LOG</button><button data-al-tab="server">SERVER</button>
    <span class="al-sp"></span><button data-al="refresh">REFRESH</button><button data-al="copy">COPY ALL</button><button data-al="save">DOWNLOAD</button><button data-al="lock" title="Forget the key on this device">LOCK</button><button data-al="close">✕</button></div>
    <div class="al-tools" hidden><input class="al-q" placeholder="Filter…"><select class="al-lv"><option value="all">All</option><option value="error">Errors</option><option value="warn">Warnings</option><option value="info">Info</option></select></div>
    <div class="al-body"></div>
    <form class="al-gate" hidden><b>Admin key</b><span>The ADMIN_KEY secret set on the account server.</span><input type="password" autocomplete="off" class="al-key"><button type="submit">UNLOCK</button><i class="al-err"></i></form>`;
  document.body.appendChild(panel);
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.alTab) { tab = b.dataset.alTab; if (tab === 'server' && !server) fetchServer().then(render); render(); return; }
    const a = b.dataset.al;
    if (a === 'close') close();
    else if (a === 'refresh') { server = null; render(); await fetchServer(); render(); }
    else if (a === 'copy') { try { await navigator.clipboard.writeText(allText()); b.textContent = 'COPIED'; } catch (_) { b.textContent = 'COPY FAILED'; } setTimeout(() => { b.textContent = 'COPY ALL'; }, 1500); }
    else if (a === 'save') { const u = URL.createObjectURL(new Blob([allText()], { type: 'text/plain' })); const l = document.createElement('a'); l.href = u; l.download = `breachpoint-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
    else if (a === 'lock') { setKey(''); server = null; close(); }
  });
  panel.querySelector('.al-q').addEventListener('input', (e) => { filter = e.target.value; render(); });
  panel.querySelector('.al-lv').addEventListener('change', (e) => { level = e.target.value; render(); });
  panel.querySelector('.al-gate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const k = panel.querySelector('.al-key').value.trim(), err = panel.querySelector('.al-err');
    err.textContent = 'Checking…';
    const ok = await fetchServer(k);
    if (ok === true) { setKey(k); panel.querySelector('.al-key').value = ''; showUnlocked(); }
    else err.textContent = serverErr || 'Wrong key.';
  });
}
function showUnlocked() {
  panel.classList.remove('locked');
  panel.querySelector('.al-gate').hidden = true;
  render();
}
function open() {
  if (!panel) build();
  if (document.pointerLockElement) document.exitPointerLock();
  panel.hidden = false;
  if (getKey()) { showUnlocked(); fetchServer().then((ok) => { if (ok === 401) { setKey(''); close(); } else render(); }); }
  else { panel.classList.add('locked'); panel.querySelector('.al-gate').hidden = false; panel.querySelector('.al-err').textContent = ''; setTimeout(() => panel.querySelector('.al-key').focus(), 0); }
}
function close() { if (panel) panel.hidden = true; }
setInterval(() => { if (panel && !panel.hidden && !panel.classList.contains('locked') && tab === 'overview') render(); }, 1000);
addEventListener('keydown', (e) => {
  if ((e.ctrlKey && e.shiftKey && e.code === 'KeyL') || e.code === 'F10') { e.preventDefault(); e.stopPropagation(); if (panel && !panel.hidden) close(); else open(); }
  else if (e.code === 'Escape' && panel && !panel.hidden) { e.stopPropagation(); close(); }
}, true);
