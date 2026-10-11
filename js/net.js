// Peer-to-peer transport: WebRTC data channels, matchmaking by 6-digit code over public Nostr relays.
// Signaling payloads are encrypted with a key derived from the match code, and WebRTC itself is
// DTLS-encrypted end to end, so relays never see game traffic.
import { joinRoom, selfId } from '../lib/trystero.js';

const APP_ID = 'breachpoint-p2p-v1';
const MAX_MSG = 64 * 1024;

export function newCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, '0');
}

export class Net {
  constructor() {
    this.room = null;
    this.handlers = {};
    this.peers = new Set();
    this.selfId = selfId;
  }

  // ?relay=wss://a,wss://b overrides the default public relays (also used for local testing)
  relayUrls() {
    const p = new URLSearchParams(location.search).get('relay');
    return p ? p.split(',').filter(Boolean) : undefined;
  }

  open(code) {
    this.close();
    const cfg = { appId: APP_ID, password: `breachpoint:${code}:v1` };
    const urls = this.relayUrls();
    if (urls) cfg.relayConfig = { urls };
    // ?stun=0 skips public STUN servers (LAN / local testing)
    if (new URLSearchParams(location.search).get('stun') === '0') cfg.rtcConfig = { iceServers: [] };
    this.room = joinRoom(cfg, `match-${code}`, {
      onJoinError: (e) => this.emit('error', e && e.error ? e.error : 'Could not connect', e && e.peerId),
    });
    this.room.onPeerJoin = (id) => { this.peers.add(id); this.emit('peerJoin', id); };
    this.room.onPeerLeave = (id) => { this.peers.delete(id); this.emit('peerLeave', id); };
    const act = this.room.makeAction('m', { onMessage: (data, ctx) => this.receive(data, ctx.peerId) });
    this.action = act;
  }

  receive(data, peerId) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(data); } catch (_) { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return;
    this.emit('msg', m, peerId);
  }

  send(msg, target) {
    if (!this.room || !this.action) return;
    const s = JSON.stringify(msg);
    this.action.send(s, target ? { target } : undefined).catch(() => {});
  }

  async ping(id) {
    if (!this.room) return 0;
    try { return await this.room.ping(id); } catch (_) { return 0; }
  }

  close() {
    if (this.room) { this.room.leave().catch(() => {}); this.room = null; this.action = null; }
    this.peers.clear();
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach(f => f(...a)); }
}
