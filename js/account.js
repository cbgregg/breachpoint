// Online accounts: passwordless sign-in by email link through the account Worker in
// cloudflare/auth-worker.js, plus Name Tags, friend codes, friends, presence and signed match passes
// ("tickets") that hosts check before letting a player into an online match. With AUTH_ENDPOINT empty,
// accounts are off and online play works without signing in, as before.
//
// Where the session lives:
//   "Remember me" on  -> localStorage, kept for 60 days (renewed while you play).
//   "Remember me" off -> sessionStorage, gone when the browser closes (and the server ends it after a day).
// Other players never see your email; the server only ever returns it to you, masked.
import { AUTH_ENDPOINT } from './config.js';

const KEY = 'breachpoint.account.v1';
const PENDING = 'breachpoint.signin.v1';   // { remember, at } while a sign-in link is on its way
const PUBKEY = 'breachpoint.authkey.v1';
const enc = new TextEncoder();

const store = (s) => { try { return s(); } catch (_) { return null; } };
function load() {
  const raw = store(() => localStorage.getItem(KEY)) || store(() => sessionStorage.getItem(KEY));
  try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}
function save(v) {
  store(() => localStorage.removeItem(KEY));
  store(() => sessionStorage.removeItem(KEY));
  if (!v) return;
  const s = JSON.stringify(v);
  if (v.remember) store(() => localStorage.setItem(KEY, s));
  else store(() => sessionStorage.setItem(KEY, s));
}

export class Account {
  constructor() {
    this.endpoint = (AUTH_ENDPOINT || '').replace(/\/+$/, '');
    const s = load();
    this.session = s && s.session || null;
    this.user = s && s.user || null;
    this.remember = !!s && s.remember !== false; // sessions saved before this option were remembered
    if (this.user && this.user.name && !this.user.tag) this.user.tag = this.user.name;
    this.email = '';
    this.tickets = new Map();
    this.friends = { friends: [], incoming: [], outgoing: [] };
    this.friendIds = new Set();
    this.onChange = null;
    this.onFriends = null;
    // another tab signed in or out (e.g. the sign-in link opened in a new tab)
    window.addEventListener('storage', (e) => { if (e.key === KEY) this.adopt(load()); });
    // sessions that aren't remembered live in sessionStorage, which tabs don't share: pass them over
    this.bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('breachpoint-account') : null;
    if (this.bc) {
      this.bc.onmessage = (e) => {
        const m = e.data || {};
        if (m.t === 'in' && m.v && !this.session) { save(m.v); this.adopt(m.v); }
        else if (m.t === 'out' && this.session) { save(null); this.adopt(null); }
      };
    }
  }

  get enabled() { return !!this.endpoint; }
  get signedIn() { return !!(this.session && this.user); }
  get ready() { return !this.enabled || (this.signedIn && !!this.user.tag); }
  get tag() { return this.signedIn ? this.user.tag || '' : ''; }
  isFriend(uid) { return !!uid && this.friendIds.has(uid); }
  changed() { if (this.onChange) this.onChange(); }
  adopt(v) {
    this.session = v && v.session || null;
    this.user = v && v.user || null;
    this.remember = !!(v && v.remember);
    this.tickets.clear();
    if (!this.session) this.setFriends({ friends: [], incoming: [], outgoing: [] });
    this.changed();
  }
  persist() {
    const v = this.session ? { session: this.session, user: this.user, remember: this.remember } : null;
    save(v);
    this.changed();
  }

  async call(path, body, auth = false) {
    let res;
    try {
      res = await fetch(this.endpoint + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth && this.session ? { Authorization: `Bearer ${this.session}` } : {}) },
        body: JSON.stringify(body || {}),
      });
    } catch (_) {
      throw new Error('Can\'t reach the account server. Check your connection.');
    }
    const data = await res.json().catch(() => ({}));
    if (data.signedOut && auth) { this.session = null; this.user = null; this.persist(); this.setFriends({ friends: [], incoming: [], outgoing: [] }); }
    if (!res.ok) { const e = new Error(data.error || `Account server error (${res.status})`); Object.assign(e, data); throw e; }
    return data;
  }

  // ---------- sign-in by email link ----------
  async start(email, remember) {
    const r = await this.call('/start', { email });
    this.email = email;
    // the link may be opened in a new tab: it reads this to know whether to remember the session
    store(() => localStorage.setItem(PENDING, JSON.stringify({ remember: !!remember, at: Date.now() })));
    return r;
  }
  async verifyToken(token) {
    let p = null;
    try { p = JSON.parse(store(() => localStorage.getItem(PENDING)) || 'null'); } catch (_) { /* ignore */ }
    store(() => localStorage.removeItem(PENDING));
    const remember = !!(p && p.remember && Date.now() - p.at < 30 * 60 * 1000);
    const r = await this.call('/verify', { token, remember });
    this.session = r.session;
    this.user = r.user;
    this.remember = !!r.remember;
    this.tickets.clear();
    this.persist();
    if (this.bc && !this.remember) this.bc.postMessage({ t: 'in', v: { session: this.session, user: this.user, remember: false } });
    return r.user;
  }
  async refresh() {
    if (!this.enabled || !this.session) return;
    try { this.user = (await this.call('/me', {}, true)).user; this.persist(); } catch (_) { /* offline: keep the cached account */ }
  }
  async signOut() {
    const s = this.session;
    this.session = null; this.user = null; this.tickets.clear();
    this.persist();
    this.setFriends({ friends: [], incoming: [], outgoing: [] });
    if (this.bc) this.bc.postMessage({ t: 'out' });
    if (s) fetch(this.endpoint + '/logout', { method: 'POST', headers: { Authorization: `Bearer ${s}` } }).catch(() => {});
  }
  async deleteAccount() {
    await this.call('/delete', {}, true);
    this.session = null; this.user = null; this.tickets.clear();
    this.persist();
    this.setFriends({ friends: [], incoming: [], outgoing: [] });
    if (this.bc) this.bc.postMessage({ t: 'out' });
  }

  // ---------- Name Tag (public) and display name (friends only) ----------
  async setTag(name) {
    this.user = (await this.call('/name', { name }, true)).user;
    this.tickets.clear();
    this.persist();
    return this.user;
  }
  async setDisplay(name) {
    this.user = (await this.call('/display', { name }, true)).user;
    this.persist();
    return this.user;
  }

  // ---------- friends ----------
  setFriends(d) {
    const prevIn = new Set((this.friends.incoming || []).map(r => r.id));
    this.friends = d;
    this.friendIds = new Set(d.friends.map(f => f.id));
    const fresh = d.incoming.filter(r => !prevIn.has(r.id));
    if (this.onFriends) this.onFriends(d, this.loadedFriends ? fresh : []);
    this.loadedFriends = this.signedIn;
  }
  async loadFriends() {
    if (!this.enabled || !this.signedIn) return this.friends;
    this.setFriends(await this.call('/friends', {}, true));
    return this.friends;
  }
  async addFriend(code) { const r = await this.call('/friends/add', { code }, true); await this.loadFriends().catch(() => {}); return r; }
  async friendAction(kind, id) { await this.call(`/friends/${kind}`, { id }, true); await this.loadFriends().catch(() => {}); }

  // where you are, so friends can see you're online and join you
  async presence(p) {
    if (!this.enabled || !this.signedIn) return;
    try { await this.call('/presence', p, true); } catch (_) { /* next heartbeat */ }
  }
  presenceOff() {
    if (!this.enabled || !this.session) return;
    try {
      fetch(this.endpoint + '/presence', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.session}` },
        body: JSON.stringify({ off: 1 }),
      }).catch(() => {});
    } catch (_) { /* ignore */ }
  }

  // ---------- match passes ----------
  // a pass for one match code, cached until shortly before it expires
  async ticket(room) {
    if (!this.enabled) return null;
    const c = this.tickets.get(room);
    if (c && c.exp - Date.now() / 1000 > 300) return c.ticket;
    const r = await this.call('/ticket', { room }, true);
    this.tickets.set(room, r);
    return r.ticket;
  }

  async publicKey() {
    if (this.key) return this.key;
    let jwk = null;
    try { jwk = JSON.parse(localStorage.getItem(PUBKEY) || 'null'); } catch (_) { /* ignore */ }
    if (!jwk || jwk.at < Date.now() - 86400000) {
      try {
        const r = await fetch(this.endpoint + '/pubkey');
        if (r.ok) { jwk = { ...(await r.json()).jwk, at: Date.now() }; try { localStorage.setItem(PUBKEY, JSON.stringify(jwk)); } catch (_) { /* ignore */ } }
      } catch (_) { /* use the cached key */ }
    }
    if (!jwk) return null;
    this.key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return this.key;
  }

  // host side: who is this player really? returns { id, name } or null
  async checkTicket(ticket, room) {
    if (typeof ticket !== 'string' || ticket.length > 600) return null;
    const [payload, sig] = ticket.split('.');
    if (!payload || !sig) return null;
    try {
      const key = await this.publicKey();
      if (!key) return null;
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(sig), enc.encode(payload));
      if (!ok) return null;
      const p = JSON.parse(new TextDecoder().decode(unb64u(payload)));
      if (p.r !== room || !(p.e > Date.now() / 1000) || typeof p.n !== 'string' || typeof p.u !== 'string') return null;
      return { id: p.u, name: p.n };
    } catch (_) { return null; }
  }
}

function unb64u(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

// sign-in link: https://breach-point.net/#login=<token>. Read it and wipe it from the address bar
// right away so it never lands in history or a screenshot.
export function takeLoginToken() {
  const m = location.hash.match(/login=([A-Za-z0-9_-]{20,80})/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return m[1];
}
