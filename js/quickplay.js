// Quick match discovery. Public hosts post a small signed note on Nostr relays every few seconds
// ({ code, players, max, in match }); players looking for a game read those notes and join one with
// the normal 6-digit-code flow. Only the lobby you actually join ever opens a connection to you, so
// browsing for a match exposes nothing to anyone.
import { createEvent, subscribe, defaultRelayUrls } from '../lib/trystero.js';

const TOPIC = 'breachpoint-quickplay-v1';
const RELAYS = 5;
const STALE = 15000;

function relayList() {
  const p = new URLSearchParams(location.search).get('relay');
  if (p) return p.split(',').filter(Boolean);
  const list = [...defaultRelayUrls];
  for (let i = list.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, RELAYS);
}

export class Board {
  constructor() {
    this.sockets = [];
    this.ads = new Map(); // code -> ad
    this.onAd = null;
  }

  get open() { return this.sockets.length > 0; }

  connect() {
    if (this.open) return;
    const subId = Math.random().toString(36).slice(2, 12);
    for (const url of relayList()) {
      let ws;
      try { ws = new WebSocket(url); } catch (_) { continue; }
      ws.onopen = () => { try { ws.send(subscribe(subId, TOPIC)); } catch (_) { /* closed */ } if (this.pendingAd) this.sendTo(ws, this.pendingAd); };
      ws.onmessage = (e) => this.receive(e.data);
      ws.onerror = () => {};
      this.sockets.push(ws);
    }
  }

  receive(raw) {
    if (typeof raw !== 'string' || raw.length > 4000) return;
    let m;
    try { m = JSON.parse(raw); } catch (_) { return; }
    if (!Array.isArray(m) || m[0] !== 'EVENT' || !m[2] || typeof m[2].content !== 'string') return;
    const ev = m[2];
    if (!Array.isArray(ev.tags) || !ev.tags.some(t => t[0] === 'x' && t[1] === TOPIC)) return;
    let ad;
    try { ad = JSON.parse(ev.content); } catch (_) { return; }
    if (!ad || typeof ad.code !== 'string' || !/^\d{6}$/.test(ad.code)) return;
    const clean = {
      code: ad.code, v: ad.v | 0, n: Math.max(0, Math.min(16, ad.n | 0)), max: Math.max(1, Math.min(16, ad.max | 0)),
      ig: !!ad.ig, open: ad.open !== 0, m: ['tdm', 'ffa', 'gunfight', 'snd', 'gungame'].includes(ad.m) ? ad.m : 'tdm', seen: Date.now(),
      h: String(ad.h || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').slice(0, 16), map: /^[a-z]{2,12}$/.test(ad.map || '') ? ad.map : '',
    };
    this.ads.set(clean.code, clean);
    if (this.onAd) this.onAd(clean);
  }

  // open lobbies, fullest first so players end up together
  candidates(proto, exclude, modes = ['tdm']) {
    const t = Date.now(), want = Array.isArray(modes) ? modes : [modes];
    return [...this.ads.values()]
      .filter(a => a.v === proto && a.open && want.includes(a.m) && a.n < a.max && t - a.seen < STALE && !exclude.has(a.code))
      .sort((a, b) => b.n - a.n || Math.random() - 0.5);
  }

  async publish(ad) {
    const msg = await createEvent(TOPIC, JSON.stringify(ad));
    this.pendingAd = msg;
    for (const ws of this.sockets) this.sendTo(ws, msg);
  }

  // every live public match (the match browser)
  list(proto) {
    const t = Date.now();
    return [...this.ads.values()].filter(a => a.v === proto && a.open && t - a.seen < STALE).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  }

  sendTo(ws, msg) { if (ws.readyState === 1) { try { ws.send(msg); } catch (_) { /* closed */ } } }

  close() {
    for (const ws of this.sockets) { try { ws.close(); } catch (_) { /* ignore */ } }
    this.sockets = [];
    this.pendingAd = null;
    this.ads.clear();
  }
}
