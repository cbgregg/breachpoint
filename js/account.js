// Online accounts: passwordless sign-in by email (link or 6-digit code) through the account Worker
// in cloudflare/auth-worker.js, plus signed match passes ("tickets") that hosts check before letting
// a player into an online match. With AUTH_ENDPOINT empty, accounts are off and online play works
// without signing in, as before.
import { AUTH_ENDPOINT } from './config.js';

const KEY = 'breachpoint.account.v1';
const PUBKEY = 'breachpoint.authkey.v1';
const enc = new TextEncoder();

function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } }
function save(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (_) { /* ignore */ } }

export class Account {
  constructor() {
    this.endpoint = (AUTH_ENDPOINT || '').replace(/\/+$/, '');
    const s = load();
    this.session = s && s.session || null;
    this.user = s && s.user || null;
    this.rid = null;          // pending sign-in request (for the code)
    this.email = '';
    this.tickets = new Map();
    this.onChange = null;
    // another tab signed in or out (e.g. the sign-in link opened in a new tab)
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      const v = load();
      this.session = v && v.session || null;
      this.user = v && v.user || null;
      this.changed();
    });
  }

  get enabled() { return !!this.endpoint; }
  get signedIn() { return !!(this.session && this.user); }
  get ready() { return !this.enabled || (this.signedIn && !!this.user.name); }
  changed() { if (this.onChange) this.onChange(); }
  store() { save(this.session ? { session: this.session, user: this.user } : null); this.changed(); }

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
    if (data.signedOut) { this.session = null; this.user = null; this.store(); }
    if (!res.ok) { const e = new Error(data.error || `Account server error (${res.status})`); Object.assign(e, data); throw e; }
    return data;
  }

  async start(email) {
    const r = await this.call('/start', { email });
    this.rid = r.rid;
    this.email = email;
    return r;
  }
  async verifyCode(code) { return this.finish(await this.call('/verify', { rid: this.rid, code })); }
  async verifyToken(token) { return this.finish(await this.call('/verify', { token })); }
  finish(r) {
    this.session = r.session;
    this.user = r.user;
    this.rid = null;
    this.tickets.clear();
    this.store();
    return r.user;
  }
  async refresh() {
    if (!this.enabled || !this.session) return;
    try { this.user = (await this.call('/me', {}, true)).user; this.store(); } catch (_) { /* offline: keep the cached account */ }
  }
  async setName(name) {
    this.user = (await this.call('/name', { name }, true)).user;
    this.tickets.clear();
    this.store();
    return this.user;
  }
  async signOut() {
    const s = this.session;
    this.session = null; this.user = null; this.tickets.clear();
    this.store();
    if (s) fetch(this.endpoint + '/logout', { method: 'POST', headers: { Authorization: `Bearer ${s}` } }).catch(() => {});
  }
  async deleteAccount() {
    await this.call('/delete', {}, true);
    this.session = null; this.user = null; this.tickets.clear();
    this.store();
  }

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
