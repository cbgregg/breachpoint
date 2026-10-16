// Online play over peer-to-peer WebRTC, joined with a 6-digit code.
//
// Security model (host-authoritative):
//  * The host's browser runs the only real simulation. Guests send nothing but inputs
//    (move axes, view angles, buttons); the host validates every field, enforces a real-time
//    budget so inputs can't be sped up, and resolves all movement, hits, damage and scoring.
//  * Guests only receive enemies they could plausibly see (line-of-sight culled snapshots),
//    so a modified client can't draw everyone through walls.
//  * The host approves every join (optional) and can kick/ban. Guests only accept game
//    messages from the host and ignore every other peer.
//  * Matchmaking signals are encrypted with a key derived from the code; game traffic is
//    WebRTC (DTLS) end to end and never touches a server.
import * as THREE from 'three';
import { Net, newCode } from './net.js';
import { Board } from './quickplay.js';
import { safeName, cleanChat } from './names.js';
import { PRIMARIES, PLAYER, MELEE, WEAPONS, GRENADE } from './config.js';
import { Character } from './character.js';
import { hitPower } from './motion.js';
import { parseLoadout, soloLoadout } from './attachments.js';
import { GUN_LADDER } from './modes.js';

export const MAX_HUMANS = 8;
const PROTO = 1;
const SNAP_HZ = 30;
const INTERP = 0.12;          // guests render others this far in the past (seconds)
const MAX_REWIND = 0.5;       // lag compensation window
const ACTIONS = ['reload', 'grenade', 'melee', 'swap', 'slot1', 'slot2'];

const now = () => performance.now() / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
export const cleanName = (n) => safeName(String(n || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || 'Operator');
const cleanLabel = (s) => String(s ?? '').replace(/[^A-Z0-9 +\-]/g, '').slice(0, 28);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _wish = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Lobby: owns the connection for the whole online session (across several matches).
// ---------------------------------------------------------------------------------------------
export class Lobby {
  constructor(game) {
    this.game = game;
    this.net = new Net();
    this.role = null;          // 'host' | 'guest'
    this.code = '';
    this.status = 'idle';
    this.players = new Map();  // host: peerId -> { peerId, name, primary, team, ping }
    this.pending = new Map();  // host: peerId -> { peerId, name, primary }
    this.banned = new Set();
    this.approval = true;
    this.hostId = null;        // guest: the peer we accepted as host
    this.roster = [];          // guest: lobby list from the host
    this.rate = new Map();
    this.onUpdate = null;      // UI refresh
    this.onStart = null;       // guest: host started a match
    this.onClosed = null;      // guest: session ended (reason)
    this.onToast = null;
    this.onQuickHost = null;   // quick match found nothing: we host a public match
    this.board = new Board();  // public lobby notices (quick match)
    this.quickMode = false;    // looking for / playing a quick match
    this.account = null;       // set by main.js: online accounts (js/account.js)
    this.checking = new Set(); // join requests whose match pass is being verified
    this.public = false;       // this session is a public quick match
    this.info = null;          // host: match settings shown to guests { m, map, n, b }; guest: received copy
    this.onChat = null;        // chat line for the UI: { n, tm, x, me, sys }
    this.chatRate = new Map(); // host: peerId -> recent message times
    this.blocked = new Set();  // account ids this player blocked (main.js keeps it): refused when we host
    this.kickVotes = new Map(); // host: target character id -> { yes: Set(voter key), until, name }
    this.onVote = null;        // vote-kick progress for the UI
    this.mapVote = null;       // public lobbies between matches: { o: [map ids], v: [counts], cd, rd, n, my }
    this.onMapVote = null;     // UI refresh
    this.onMapVoteDone = null; // host: (mapId) start the next match
    this.net.on('msg', (m, id) => this.receive(m, id));
    this.net.on('peerJoin', (id) => this.peerJoin(id));
    this.net.on('peerLeave', (id) => this.peerLeave(id));
    // one peer failing (often a strict NAT) shouldn't end the session; remember it for the timeout message
    this.net.on('error', (e) => { this.lastError = String(e); if (this.role === 'host') this.toast('A PLAYER COULDN\'T CONNECT'); });
  }

  get active() { return !!this.role; }
  get myUid() { return this.account && this.account.enabled && this.account.user ? this.account.user.id : ''; }
  get inMatch() { return this.game.mode === this.role && this.game.state !== 'menu'; }
  changed() { if (this.onUpdate) this.onUpdate(); }
  toast(s) { if (this.onToast) this.onToast(s); }

  // ---------- host ----------
  host(name, primary, relayOnly = this.wantRelay(false)) {
    this.reset();
    this.role = 'host';
    this.code = newCode();
    this.hostName = cleanName(name);
    this.hostPrimary = primary;
    this.hostTeam = 0;
    this.status = 'open';
    this.openNet(this.code, relayOnly);
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.pingAll(), 2000);
    this.changed();
  }

  // round-trip times for the lobby list and lag compensation; peers that stop answering are dropped
  async pingAll() {
    const t = now();
    await Promise.all([...this.players.values()].map(async (p) => {
      p.lastPong ??= t;
      const ms = await Promise.race([this.net.ping(p.peerId), new Promise(r => setTimeout(() => r(0), 3000))]);
      if (ms) { p.ping = Math.round(ms); p.lastPong = now(); }
      else if (now() - p.lastPong > (this.game && this.game.session && this.game.session.remotes && [...this.game.session.remotes.values()].some(r => r.peerId === p.peerId && !r.started) ? 60 : 20) && this.players.has(p.peerId)) { // generous: a guest may be busy loading a map (a minute while it hasn't started)
        this.dropPlayer(p.peerId);
        this.toast(`${p.name.toUpperCase()} LOST CONNECTION`);
      }
    }));
    this.changed();
  }

  teamCounts() {
    const n = [0, 0];
    n[this.hostTeam]++;
    for (const p of this.players.values()) n[p.team]++;
    return n;
  }

  // Friends go on their friend's team (taking a bot's place there); everyone else balances the teams.
  // p.w: the account the player came to join (from Join in the friends list); the host's own friends count too.
  pickTeam(p) {
    const n = this.teamCounts();
    const balanced = n[0] <= n[1] ? 0 : 1;
    let want = -1;
    if (p.w) {
      if (p.w === this.myUid) want = this.hostTeam;
      else for (const q of this.players.values()) if (q.uid && q.uid === p.w) { want = q.team; break; }
    }
    if (want < 0 && p.uid && this.account && this.account.isFriend(p.uid)) want = this.hostTeam;
    if (want < 0) return balanced;
    // keep it if that team still has room (a bot to replace, or fewer humans than the team size)
    const g = this.game, live = g.mode === 'host' && g.live;
    const size = (g.settings && (g.gm && g.gm.cfg.teamSize ? g.gm.cfg.teamSize : g.settings.teamSize)) || 6;
    const botThere = live && g.characters.some(c => c.isBot && c.team === want);
    return botThere || n[want] < size ? want : balanced;
  }

  accept(peerId) {
    const p = this.pending.get(peerId);
    if (!p) return;
    this.pending.delete(peerId);
    if (this.players.size + 1 >= MAX_HUMANS) { this.net.send({ t: 'lobby', st: 'full' }, peerId); this.changed(); return; }
    p.team = this.pickTeam(p);
    p.ping = 0;
    this.players.set(peerId, p);
    this.broadcastLobby();
    if (this.game.mode === 'host' && this.game.session && this.game.live) this.game.session.join(p);
    this.toast(`${p.name.toUpperCase()} JOINED`);
    this.changed();
  }

  deny(peerId) {
    if (!this.pending.has(peerId)) return;
    const p = this.pending.get(peerId);
    this.pending.delete(peerId);
    this.banned.add(peerId);
    if (p.uid) this.banned.add('u:' + p.uid); // a kicked or declined account can't rejoin from a new tab
    this.net.send({ t: 'lobby', st: 'denied' }, peerId);
    this.changed();
  }

  kick(peerId) {
    const p = this.players.get(peerId);
    if (!p) return;
    this.banned.add(peerId);
    if (p.uid) this.banned.add('u:' + p.uid);
    this.net.send({ t: 'lobby', st: 'kicked' }, peerId);
    this.dropPlayer(peerId);
    this.toast(`${p.name.toUpperCase()} WAS REMOVED`);
  }

  swapTeam(peerId) {
    if (this.inMatch) return;
    if (peerId === 'host') this.hostTeam = 1 - this.hostTeam;
    else { const p = this.players.get(peerId); if (p) p.team = 1 - p.team; }
    this.broadcastLobby();
    this.changed();
  }

  setApproval(on) { this.approval = !!on; this.changed(); }

  dropPlayer(peerId) {
    if (!this.players.has(peerId)) return;
    this.players.delete(peerId);
    if (this.game.mode === 'host' && this.game.session) this.game.session.leave(peerId);
    this.broadcastLobby();
    this.changed();
  }

  // u: account id (signed matches only), so players can add each other from Recent Players
  lobbyList() {
    const me = this.account && this.account.enabled && this.account.user ? this.account.user.id : '';
    const list = [{ n: this.hostName, tm: this.hostTeam, h: 1, u: me, x: this.myXp | 0 }];
    for (const p of this.players.values()) list.push({ n: p.name, tm: p.team, h: 0, u: p.uid || '', x: p.xp | 0 });
    return list;
  }

  broadcastLobby() {
    const msg = { t: 'lobby', st: 'accepted', ps: this.lobbyList(), ig: this.game.mode === 'host' && this.game.live ? 1 : 0, map: this.mapHint || '', info: this.info || null };
    for (const id of this.players.keys()) this.net.send(msg, id);
  }

  // ---------- chat (the host relays and filters every line) ----------
  sendChat(text) {
    const x = cleanChat(text);
    if (!x) return false;
    if (this.role === 'host') this.hostChat(null, x);
    else if (this.role === 'guest' && this.hostId) this.net.send({ t: 'chat', x }, this.hostId);
    else return false;
    return true;
  }
  hostChat(peerId, raw, sys = false) {
    if (typeof raw !== 'string') return;
    const x = cleanChat(raw);
    if (!x) return;
    if (sys) {
      const msg = { t: 'chat', n: 'MATCH', tm: 0, x, sys: 1 };
      for (const id of this.players.keys()) this.net.send(msg, id);
      if (this.onChat) this.onChat({ n: 'MATCH', tm: 0, x, sys: true });
      return;
    }
    // at most 5 lines per 8 seconds per player
    const now = Date.now(), key = peerId || 'host';
    const times = (this.chatRate.get(key) || []).filter(t => now - t < 8000);
    if (times.length >= 5) { if (peerId) this.net.send({ t: 'chat', n: 'SERVER', tm: 0, x: 'Slow down: too many messages.', sys: 1 }, peerId); return; }
    times.push(now); this.chatRate.set(key, times);
    const p = peerId ? this.players.get(peerId) : null;
    const n = p ? p.name : this.hostName, tm = p ? p.team : this.hostTeam, u = p ? p.uid || '' : this.myUid;
    const msg = { t: 'chat', n, tm, x, u };
    for (const id of this.players.keys()) this.net.send(msg, id);
    if (this.onChat) this.onChat({ n: cleanName(n), tm, x, u, me: !peerId });
  }

  // ---------- map vote between public matches ----------
  // Everyone gets a vote; the countdown starts once most players are back in the lobby (voted or
  // pressed Back to lobby), or after a minute regardless.
  startMapVote(options) {
    if (this.role !== 'host') return;
    clearInterval(this.mvTimer);
    const now = Date.now();
    this.mv = { o: options.slice(0, 4), votes: new Map(), ready: new Set(['host']), cdEnd: 0, hard: now + 60000 };
    this.mapVote = { o: this.mv.o, v: this.mv.o.map(() => 0), cd: -1, rd: 1, n: 1 + this.players.size, my: -1 };
    this.mvTimer = setInterval(() => this.mapVoteTick(), 500);
    this.mapVoteTick();
  }
  mapVoteIn(peerId, m) {
    if (!this.mv) return;
    this.mv.ready.add(peerId);
    if (Number.isInteger(m.p) && m.p >= 0 && m.p < this.mv.o.length) this.mv.votes.set(peerId, m.p);
    this.mapVoteTick();
  }
  voteMap(idx) {
    if (this.role === 'guest') { if (this.hostId) this.net.send({ t: 'mv', p: idx }, this.hostId); if (this.mapVote) { this.mapVote.my = idx; if (this.onMapVote) this.onMapVote(); } return; }
    if (!this.mv) return;
    this.mv.votes.set('host', idx);
    this.mapVote.my = idx;
    this.mapVoteTick();
  }
  mapReady() { if (this.role === 'guest' && this.hostId && this.mapVote) this.net.send({ t: 'mv', r: 1 }, this.hostId); }
  mapVoteTick() {
    const mv = this.mv;
    if (!mv || this.role !== 'host') return;
    const now = Date.now();
    for (const k of mv.ready) if (k !== 'host' && !this.players.has(k)) mv.ready.delete(k);
    for (const k of mv.votes.keys()) if (k !== 'host' && !this.players.has(k)) mv.votes.delete(k);
    const n = 1 + this.players.size, rd = mv.ready.size;
    if (!mv.cdEnd && (rd * 2 > n || now > mv.hard)) mv.cdEnd = now + 15000;
    const counts = mv.o.map((_, i) => [...mv.votes.values()].filter(v => v === i).length);
    const cd = mv.cdEnd ? Math.max(0, Math.ceil((mv.cdEnd - now) / 1000)) : -1;
    const done = mv.cdEnd && now >= mv.cdEnd;
    const msg = { t: 'mv', o: mv.o, v: counts, cd, rd, n, end: done ? 1 : 0 };
    for (const id of this.players.keys()) this.net.send(msg, id);
    this.mapVote = { o: mv.o, v: counts, cd, rd, n, my: this.mapVote ? this.mapVote.my : -1 };
    if (done) {
      clearInterval(this.mvTimer);
      const top = Math.max(...counts), best = mv.o.filter((_, i) => counts[i] === top);
      const pick = best[(Math.random() * best.length) | 0];
      this.mv = null; this.mapVote = null;
      if (this.onMapVote) this.onMapVote();
      if (this.onMapVoteDone) this.onMapVoteDone(pick);
      return;
    }
    if (this.onMapVote) this.onMapVote();
  }

  // ---------- vote to kick (60% of the other human players; the host can't be voted out) ----------
  // voter: null = the host itself, else the voter's peer id
  voteKick(targetId, voter = null) {
    if (this.role === 'guest') { if (this.hostId) this.net.send({ t: 'vk', id: targetId }, this.hostId); return; }
    if (this.role !== 'host') return;
    const g = this.game, target = g.charById && g.charById(targetId);
    if (!target || target.isBot || target === g.player || !g.session) return;
    const r = g.session.byChar.get(target);
    if (!r) return;
    if (voter && voter === r.peerId) return; // can't vote for yourself
    const now = Date.now();
    let v = this.kickVotes.get(targetId);
    if (!v || v.until < now) { v = { yes: new Set(), until: now + 45000, name: target.name }; this.kickVotes.set(targetId, v); }
    v.yes.add(voter || 'host');
    const humans = g.characters.filter(c => !c.isBot && c !== target).length; // everyone else who is a person
    const need = Math.max(1, Math.ceil(humans * 0.6));
    const done = v.yes.size >= need;
    const msg = { t: 'vks', id: targetId, n: target.name, yes: v.yes.size, need, left: Math.ceil((v.until - now) / 1000), done: done ? 1 : 0 };
    for (const pid of this.players.keys()) this.net.send(msg, pid);
    if (this.onVote) this.onVote({ id: targetId, name: target.name, yes: v.yes.size, need, left: msg.left, done: msg.done, mine: !voter });
    if (done) {
      this.kickVotes.delete(targetId);
      this.kick(r.peerId); // also bans the account from this lobby
      this.hostChat(null, `${target.name} was removed by vote.`, true);
    }
  }

  // ---------- guest ----------
  // ---------- quick match ----------
  // read public lobby notices for a few seconds, join the fullest open one, or host if there are none
  quick(name, primary, mode = 'tdm') {
    this.close();
    this.quickMode = true;
    this.quickGm = ['tdm', 'gunfight', 'snd'].includes(mode) ? mode : 'tdm';
    this.quickTried = new Set();
    this.quickName = name; this.quickPrimary = primary;
    this.status = 'matching';
    this.board.connect();
    clearTimeout(this.quickTimer);
    this.quickTimer = setTimeout(() => this.quickNext(), 4500);
    this.changed();
  }

  quickNext() {
    if (!this.quickMode) return;
    this.net.close();
    this.role = null;
    const c = this.board.candidates(PROTO, this.quickTried, this.quickGm)[0];
    if (c) { this.quickTried.add(c.code); this.join(c.code, this.quickName, this.quickPrimary, true); return; }
    this.hostPublic();
  }

  openNet(code, relayOnly) {
    this.net.open(code, { relayOnly }).then(() => {
      if (relayOnly && !this.net.relayed && this.net.room) this.toast('RELAY UNAVAILABLE — CONNECTING DIRECTLY');
      else if (this.net.relayed) this.toast('IP HIDDEN — CLOUDFLARE RELAY');
      this.changed();
    });
  }

  // public matches always relay when the TURN Worker is set up; private ones when the player opts in
  wantRelay(pub) { return pub || !!(this.game.settings || {}).privateRelay || !!this.privateRelay; }

  hostPublic() {
    this.host(this.quickName, this.quickPrimary, true);
    this.public = true;
    this.approval = false;
    clearInterval(this.adTimer);
    const advertise = () => {
      if (!this.public || this.role !== 'host') return;
      this.board.publish({ v: PROTO, code: this.code, n: this.players.size + 1, max: MAX_HUMANS, ig: this.inMatch ? 1 : 0, open: 1, m: this.quickGm || 'tdm' }).catch(() => {});
    };
    advertise();
    this.adTimer = setInterval(advertise, 4000);
    if (this.onQuickHost) this.onQuickHost();
    this.changed();
  }

  // a quick-match join attempt failed: try the next lobby instead of giving up
  fail(reason) {
    if (this.quickMode && !this.public) { this.quickNext(); return; }
    this.close(reason);
  }

  join(code, name, primary, quick = false, withUid = '') {
    this.reset();
    this.joinWith = withUid;
    this.role = 'guest';
    this.code = code;
    this.myName = cleanName(name);
    this.myPrimary = primary;
    this.status = 'searching';
    this.lastError = '';
    this.openNet(code, this.wantRelay(quick));
    clearTimeout(this.findTimer);
    this.findTimer = setTimeout(() => {
      if (this.role === 'guest' && !this.hostId) {
        this.fail(this.lastError
          ? 'Found the match but couldn\'t open a direct connection to the host (a strict firewall or mobile network can block this). Try another network, or let someone else host.'
          : 'No match found with that code. Check the number and that the host is still in the lobby.');
      }
    }, quick ? 15000 : 45000);
    this.changed();
  }

  // ---------- shared ----------
  async peerJoin(id) {
    if (this.role !== 'guest' || this.hostId) return;
    // signed-in players carry a pass for this match code, so the host knows who they are
    let tk = null;
    const code = this.code;
    if (this.account && this.account.enabled) {
      try { tk = await this.account.ticket(code); } catch (e) { this.lastError = e.message; }
      if (this.role !== 'guest' || this.code !== code || this.hostId) return;
    }
    this.net.send({ t: 'hello', v: PROTO, name: this.myName, primary: this.myPrimary, x: this.myXp | 0, tk, w: this.joinWith || '' }, id);
  }

  peerLeave(id) {
    if (this.role === 'host') {
      if (this.pending.delete(id)) this.changed();
      if (this.players.has(id)) {
        const p = this.players.get(id);
        this.dropPlayer(id);
        this.toast(`${p.name.toUpperCase()} LEFT`);
      }
    } else if (this.role === 'guest' && id === this.hostId) {
      this.close('The host closed the match.');
    }
  }

  // drop floods: anything beyond ~240 messages a second from one peer is ignored, way beyond gets them kicked
  limited(id) {
    const t = now();
    let r = this.rate.get(id);
    if (!r || t - r.t > 1) { r = { t, n: 0 }; this.rate.set(id, r); }
    r.n++;
    if (r.n > 900 && this.role === 'host' && this.players.has(id)) { this.kick(id); return true; }
    return r.n > 240;
  }

  receive(m, id) {
    if (this.limited(id)) return;
    if (this.role === 'host') this.hostReceive(m, id);
    else if (this.role === 'guest') this.guestReceive(m, id);
  }

  admit(id, p) {
    this.pending.set(id, p);
    // friends (by signed account, never by name) skip the approval step
    const friend = !!(p.uid && this.account && this.account.isFriend(p.uid));
    if (this.approval && !friend) {
      this.net.send({ t: 'lobby', st: 'pending' }, id);
      this.toast(`${p.name.toUpperCase()} WANTS TO JOIN`);
      this.changed();
    } else this.accept(id);
  }

  hostReceive(m, id) {
    if (m.t === 'chat') { if (this.players.has(id)) this.hostChat(id, m.x); return; }
    if (m.t === 'vk') { if (this.players.has(id) && Number.isInteger(m.id)) this.voteKick(m.id, id); return; }
    if (m.t === 'mv') { if (this.players.has(id)) this.mapVoteIn(id, m); return; }
    switch (m.t) {
      case 'hello': {
        if (this.banned.has(id)) { this.net.send({ t: 'lobby', st: 'denied' }, id); return; }
        if (this.players.has(id) || this.pending.has(id)) return;
        if (m.v !== PROTO) { this.net.send({ t: 'lobby', st: 'version' }, id); return; }
        if (this.players.size + 1 >= MAX_HUMANS) { this.net.send({ t: 'lobby', st: 'full' }, id); return; }
        const p = { peerId: id, name: cleanName(m.name), primary: parseLoadout(m.primary).str, xp: Math.max(0, Math.min(1e7, m.x | 0)), w: typeof m.w === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(m.w) ? m.w : '' };
        if (this.account && this.account.enabled) {
          // accounts are on: only players with a valid pass for this code get in, under their account Name Tag
          if (this.checking.has(id)) return;
          this.checking.add(id);
          const code = this.code;
          this.account.checkTicket(m.tk, code).then((who) => {
            this.checking.delete(id);
            if (this.role !== 'host' || this.code !== code || this.players.has(id) || this.pending.has(id)) return;
            if (!who) { this.net.send({ t: 'lobby', st: 'signin' }, id); return; }
            if (this.banned.has('u:' + who.id) || this.blocked.has(who.id)) { this.net.send({ t: 'lobby', st: 'denied' }, id); return; }
            const dupe = (this.account.user && who.id === this.account.user.id) || [...this.players.values(), ...this.pending.values()].some(q => q.uid === who.id);
            if (dupe) { this.net.send({ t: 'lobby', st: 'dupe' }, id); return; }
            this.admit(id, { ...p, name: cleanName(who.name), uid: who.id });
          });
          return;
        }
        this.admit(id, p);
        break;
      }
      case 'lobby':
        // another host is using this code; move to a fresh one
        if (!this.players.size && !this.inMatch) { this.host(this.hostName, this.hostPrimary, this.net.relayed || this.public); this.toast('CODE CHANGED'); }
        break;
      case 'in':
        if (this.players.has(id) && this.game.mode === 'host' && this.game.session) this.game.session.input(id, m);
        break;
      case 'rs': // a guest pressed respawn
        if (this.players.has(id) && this.game.mode === 'host' && this.game.session) this.game.session.respawnReq(id);
        break;
      case 'lo': // a guest changed loadout; it takes effect on their next spawn
        if (this.players.has(id) && typeof m.l === 'string') {
          const l = parseLoadout(m.l).str;
          this.players.get(id).primary = l;
          if (this.game.mode === 'host' && this.game.session && !this.game.gg) this.game.session.setLoadout(id, l);
        }
        break;
      case 'bye':
        if (this.players.has(id)) { const p = this.players.get(id); this.dropPlayer(id); this.toast(`${p.name.toUpperCase()} LEFT`); }
        break;
      default: break;
    }
  }

  guestReceive(m, id) {
    if (m.t === 'lobby' && !this.hostId) { this.hostId = id; clearTimeout(this.findTimer); }
    if (id !== this.hostId) return; // only the host speaks to us
    switch (m.t) {
      case 'lobby': {
        const st = m.st;
        if (st === 'pending') this.status = 'pending';
        else if (st === 'accepted') {
          this.status = this.game.mode === 'guest' && this.game.live ? 'ingame' : 'accepted';
          if (this.quickMode && !this.public) { this.public = true; this.board.close(); clearTimeout(this.quickTimer); }
          if (Array.isArray(m.ps)) this.roster = m.ps.slice(0, MAX_HUMANS).map(p => ({ n: cleanName(p && p.n), tm: p && p.tm === 1 ? 1 : 0, h: p && p.h ? 1 : 0, x: Math.max(0, Math.min(1e7, (p && p.x) | 0)), u: p && typeof p.u === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(p.u) ? p.u : '' }));
          const inf = m.info;
          this.info = inf && typeof inf === 'object' ? { m: String(inf.m || '').slice(0, 12), map: String(inf.map || '').slice(0, 12), n: Math.max(1, Math.min(8, inf.n | 0)), b: inf.b !== 0, ff: !!inf.ff } : null;
          this.hostInGame = !!m.ig;
          // load the host's map while waiting, so the match starts instantly
          if (typeof m.map === 'string' && this.game.state === 'menu' && this.onMapHint) this.onMapHint(m.map);
        } else if (st === 'pending' && this.quickMode && !this.public) return this.fail(); // public lobbies don't make you wait
        else if (st === 'denied') return this.fail('The host declined your request.');
        else if (st === 'kicked') return this.close('You were removed from the match by the host.');
        else if (st === 'full') return this.fail('That match is full.');
        else if (st === 'signin') return this.fail(this.account && this.account.enabled && !this.account.signedIn ? 'Sign in to play online.' : 'The host couldn\'t verify your account. Sign out and back in, then try again.');
        else if (st === 'dupe') return this.fail('Your account is already in that match.');
        else if (st === 'version') return this.fail('The host is running a different version of Breachpoint. Both of you should reload the page.');
        this.changed();
        break;
      }
      case 'mv': // map vote state from the host
        if (Array.isArray(m.o) && Array.isArray(m.v)) {
          const my = this.mapVote ? this.mapVote.my : -1;
          this.mapVote = { o: m.o.slice(0, 4).map(x => String(x).slice(0, 12)), v: m.v.slice(0, 4).map(x => x | 0), cd: m.cd | 0, rd: m.rd | 0, n: m.n | 0, my: m.end ? -1 : my, end: !!m.end };
          if (m.end) this.mapVote = null;
          if (this.onMapVote) this.onMapVote();
        }
        break;
      case 'vks': // vote-kick progress from the host
        if (this.onVote && Number.isInteger(m.id)) this.onVote({ id: m.id, name: cleanName(m.n), yes: m.yes | 0, need: m.need | 0, left: m.left | 0, done: m.done | 0 });
        break;
      case 'chat':
        if (typeof m.x === 'string' && this.onChat) this.onChat({ n: cleanName(m.n), tm: m.tm === 1 ? 1 : 0, x: cleanChat(m.x), sys: !!m.sys, u: typeof m.u === 'string' ? m.u.slice(0, 40) : '', me: !!m.u && m.u === this.myUid });
        break;
      case 'start':
        this.status = 'ingame';
        this.mapVote = null;
        if (this.onStart) this.onStart(m);
        break;
      default:
        if (this.game.mode === 'guest' && this.game.session) this.game.session.receive(m);
        break;
    }
  }

  close(reason) {
    const wasGuest = this.role === 'guest' || this.quickMode;
    const wasPublic = this.public;
    if (this.role === 'guest' && this.hostId) this.net.send({ t: 'bye' }, this.hostId);
    if (this.public && this.role === 'host') this.board.publish({ v: PROTO, code: this.code, n: 0, max: MAX_HUMANS, open: 0 }).catch(() => {});
    clearInterval(this.adTimer);
    clearTimeout(this.quickTimer);
    const board = this.board;
    setTimeout(() => { if (!this.quickMode) board.close(); }, 600); // let the closing notice go out
    this.quickMode = false;
    this.public = false;
    this.reset();
    if (wasGuest && reason && this.onClosed) this.onClosed(reason, wasPublic);
    this.changed();
  }

  reset() {
    clearInterval(this.pingTimer);
    clearTimeout(this.findTimer);
    this.net.close();
    this.role = null;
    this.code = '';
    this.status = 'idle';
    this.players.clear();
    this.pending.clear();
    this.hostId = null;
    this.roster = [];
    this.rate.clear();
    this.hostInGame = false;
    this.checking.clear();
    this.chatRate.clear();
    if (this.role !== 'host') this.info = null;
    clearInterval(this.mvTimer); this.mv = null; this.mapVote = null;
  }
}

// ---------------------------------------------------------------------------------------------
// Host: applies guests' inputs to their characters and streams back culled snapshots.
// ---------------------------------------------------------------------------------------------
export class HostSession {
  constructor(game, lobby) {
    this.game = game;
    this.lobby = lobby;
    this.net = lobby.net;
    this.remotes = new Map(); // peerId -> remote
    this.byChar = new Map();  // character -> remote
    this.hist = [];
    this.snapT = 0;
    this.sbT = 0;
    this.rosterAdd = [];
    this.rosterRm = [];
  }

  // called by game.startMatch for each accepted player
  createRemote(p) {
    const c = new Character(this.game, { name: p.name, team: p.team, isBot: false, primary: p.primary, remote: true });
    c.uid = p.uid || '';
    this.bind(p.peerId, c);
    return c;
  }

  bind(peerId, c) {
    const r = { peerId, c, queue: [], budget: 0.1, ack: 0, lastSeq: 0, latch: false, seen: new Map(), ev: [], pv: [], ping: 0, started: false };
    this.remotes.set(peerId, r);
    this.byChar.set(c, r);
    return r;
  }

  // a player accepted mid-match takes a bot's place on their team
  join(p) {
    const g = this.game;
    const bot = g.characters.find(c => c.isBot && c.team === p.team);
    if (bot) this.rosterRm.push(bot.id), g.removeCharacter(bot);
    const c = this.createRemote(p);
    g.characters.push(c);
    if (g.gg) { c.ggLevel = 0; c.setLoadout(soloLoadout(GUN_LADDER[0])); }
    c.spawn(g.chooseSpawn(c.team), g.spawnYawOut);
    if (g.gm) g.gm.onJoin(c);
    this.rosterAdd.push(c);
    this.sendStart(this.remotes.get(p.peerId));
  }

  leave(peerId) {
    const r = this.remotes.get(peerId);
    if (!r) return;
    this.remotes.delete(peerId);
    this.byChar.delete(r.c);
    const g = this.game;
    const team = r.c.team;
    this.rosterRm.push(r.c.id);
    g.removeCharacter(r.c);
    if (g.settings && g.settings.fillBots === false) return; // humans-only match: the slot stays empty
    const b = g.addBot(team);
    if (b) this.rosterAdd.push(b);
  }

  setLoadout(peerId, l) {
    const r = this.remotes.get(peerId);
    if (r && r.c) this.game.applyLoadout(r.c, l);
  }
  respawnReq(peerId) {
    const r = this.remotes.get(peerId), g = this.game;
    if (r && r.c && !r.c.alive && g.time - r.c.deathT >= PLAYER.respawnMin) r.c.respawnT = Math.min(r.c.respawnT, 0);
  }

  rosterEntry(c) { return [c.id, c.name, c.team, c.loadout, c.isBot ? 1 : 0, c.remote ? 1 : 0, c.uid || '']; }

  sendStart(r) {
    const g = this.game, s = g.settings, c = r.c;
    r.started = true;
    this.net.send({
      t: 'start', v: PROTO, you: c.id,
      cfg: { timeLimit: s.timeLimit, scoreLimit: s.scoreLimit, friendlyFire: !!s.friendlyFire, teamSize: s.teamSize, map: g.world.id, mode: s.mode || 'tdm' },
      ro: g.characters.map(x => this.rosterEntry(x)),
      sp: [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r3(c.yaw)],
      tm: r3(g.time), tl: r2(g.timeLeft), cd: r2(g.countdownT), sc: [...g.scores],
    }, r.peerId);
  }

  startAll() { for (const r of this.remotes.values()) this.sendStart(r); }

  // ---------- game hooks ----------
  broadcast(ev) { for (const r of this.remotes.values()) if (r.ev.length < 400) r.ev.push(ev); }
  personal(c, ev) { const r = this.byChar.get(c); if (r && r.pv.length < 200) r.pv.push(ev); }

  // ---------- inputs ----------
  // compact command: [seq, dt, moveX, moveY, yaw, pitch, bits, actions|0, viewTime]
  input(peerId, m) {
    const r = this.remotes.get(peerId);
    if (!r || !Array.isArray(m.c)) return;
    for (const raw of m.c.slice(0, 12)) {
      const cmd = sanitize(raw);
      if (!cmd || cmd.s <= r.lastSeq) continue;
      r.lastSeq = cmd.s;
      r.queue.push(cmd);
    }
    if (r.queue.length > 60) r.queue.splice(0, r.queue.length - 60);
  }

  // run guests' commands, but never faster than real time (speed-hack guard)
  processInputs(dt) {
    const t = now();
    for (const r of this.remotes.values()) {
      // real elapsed time, not the capped frame dt, so a slow host frame doesn't build a backlog
      r.budget = Math.min(0.25, r.budget + Math.min(0.25, t - (r.lastT ?? t - dt)));
      r.lastT = t;
      while (r.queue.length && r.queue[0].dt <= r.budget + 1e-4) {
        const cmd = r.queue.shift();
        r.budget -= cmd.dt;
        this.apply(r, cmd);
        r.ack = cmd.s;
      }
    }
  }

  // mirrors PlayerController.update so the guest's prediction lines up with the result
  apply(r, cmd) {
    const c = r.c, g = this.game;
    if (!c.alive) { r.latch = false; c.useHeld = false; return; }
    c.useHeld = !!cmd.u && !g.frozen;
    const canAct = !g.frozen && !c.busy; // planting or defusing: rooted in place, gun down
    c.yaw = cmd.y;
    c.pitch = cmd.p;
    const f = canAct ? cmd.my : 0, rr = canAct ? cmd.mx : 0;
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    _wish.set(-sy * f + cy * rr, 0, -cy * f - sy * rr);
    if (_wish.lengthSq() > 1) _wish.normalize();
    // a fresh sprint press cancels a reload (mirrors PlayerController)
    const spEdge = cmd.sp && !r.prevSp;
    r.prevSp = cmd.sp;
    if (canAct && spEdge && f > 0.4 && !cmd.ads && !cmd.f && c.weapon.reloading) c.weapon.cancelReload();
    const sprint = canAct && cmd.sp && f > 0.4 && !cmd.ads && !cmd.f && !c.weapon.reloading;
    c.wantCrouch = cmd.cr;
    c.updateMovement(cmd.dt, _wish, sprint, canAct && cmd.j, canAct && cmd.sl, sprint && cmd.tac);
    if (!c.alive) return;
    if (canAct && cmd.a) {
      for (const a of cmd.a) {
        if (a === 'slot1') c.switchTo(0);
        else if (a === 'slot2') c.switchTo(1);
        else if (a === 'swap') c.switchTo(c.prev);
        else if (a === 'reload') { if (!(g.gm && g.gm.useZone(c))) c.reload(); }
        else if (a === 'grenade') c.throwGrenade(undefined, cmd.gk || 0);
        else if (a === 'melee') c.melee();
      }
    }
    const def = c.weapon.def;
    const adsWant = canAct && cmd.ads && !c.sprinting && c.switchT <= 0 && !c.weapon.reloading && c.meleeT <= 0 ? 1 : 0;
    c.adsT = clamp(c.adsT + Math.sign(adsWant - c.adsT) * cmd.dt / def.adsTime, 0, 1);
    if (canAct && cmd.f) {
      if (def.auto || !r.latch) {
        r.viewTime = cmd.v;
        c.tryFire(c.eyePos(_v1), c.forward(_v2));
        r.viewTime = null;
      }
      r.latch = true;
    } else r.latch = false;
  }

  // ---------- lag compensation ----------
  record() {
    const g = this.game;
    const frame = { t: g.time, p: new Map() };
    for (const c of g.characters) if (c.alive) frame.p.set(c, [c.pos.x, c.pos.y, c.pos.z, c.height]);
    this.hist.push(frame);
    while (this.hist.length && g.time - this.hist[0].t > MAX_REWIND + 0.1) this.hist.shift();
  }

  // move everyone back to where the shooter saw them when they pulled the trigger
  rewind(shooter) {
    const r = this.byChar.get(shooter);
    if (!r || !this.hist.length) return null;
    const g = this.game;
    let target = fin(r.viewTime) ? r.viewTime : g.time - (r.ping / 1000 + INTERP);
    target = clamp(target, g.time - MAX_REWIND, g.time);
    let a = null, b = null;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      if (this.hist[i].t <= target) { a = this.hist[i]; b = this.hist[i + 1] || a; break; }
    }
    if (!a) a = b = this.hist[0];
    const k = b.t > a.t ? clamp((target - a.t) / (b.t - a.t), 0, 1) : 0;
    const saved = [];
    for (const c of g.characters) {
      if (c === shooter || !c.alive) continue;
      const pa = a.p.get(c), pb = b.p.get(c) || pa;
      if (!pa) continue;
      saved.push([c, c.pos.x, c.pos.y, c.pos.z, c.height]);
      c.pos.set(lerp(pa[0], pb[0], k), lerp(pa[1], pb[1], k), lerp(pa[2], pb[2], k));
      c.height = lerp(pa[3], pb[3], k);
    }
    return saved;
  }

  restore(saved) {
    for (const [c, x, y, z, h] of saved) { c.pos.set(x, y, z); c.height = h; }
  }

  // ---------- snapshots ----------
  update(dt) {
    this.record();
    for (const r of this.remotes.values()) r.ping = this.lobby.players.get(r.peerId)?.ping || r.ping;
    if (this.rosterAdd.length || this.rosterRm.length) {
      const msg = { t: 'ro', add: this.rosterAdd.map(c => this.rosterEntry(c)), rm: this.rosterRm };
      for (const r of this.remotes.values()) if (r.started) this.net.send(msg, r.peerId);
      this.rosterAdd = []; this.rosterRm = [];
    }
    this.snapT -= dt;
    if (this.snapT > 0) return;
    this.snapT += 1 / SNAP_HZ;
    if (this.snapT < 0) this.snapT = 0;
    this.sbT -= 1 / SNAP_HZ;
    const sb = this.sbT <= 0 ? this.scoreboard() : null;
    if (sb) this.sbT = 1;
    const pk = this.pickupBits();
    for (const r of this.remotes.values()) this.net.send(this.snapshot(r, sb, pk), r.peerId);
  }

  scoreboard() {
    return this.game.characters.map(c => [c.id, c.kills, c.deaths, c.assists, c.score, this.byChar.get(c)?.ping || 0]);
  }

  pickupBits() {
    let s = '';
    for (const p of this.game.pickups) if (!p.dynamic) s += p.active ? '1' : '0';
    return s;
  }

  visible(r, o) {
    const g = this.game, me = r.c, t = g.time;
    if (o.team === me.team) return true;
    if (!o.alive) return t - o.deathT < 6;
    if (!me.alive && o === me.killer) return true;
    const eye = me.alive ? me.eyePos(_v1) : _v1.set(me.pos.x, me.pos.y + 2.2, me.pos.z);
    const d = eye.distanceTo(o.pos);
    if (d < 8) return true;
    if (d > 140) return false;
    const ph = g.physics;
    // head, chest, knees, and a short lead along their velocity so they don't pop in at corners
    const pts = [o.headPos(_v2), o.chestPos(_v3)];
    const chk = (p) => !ph.blocked(eye, p);
    let seen = chk(pts[0]) || chk(pts[1]) || chk(_v3.set(o.pos.x, o.pos.y + 0.4, o.pos.z));
    if (!seen) seen = chk(_v3.set(o.pos.x + o.vel.x * 0.2, o.pos.y + 1.2, o.pos.z + o.vel.z * 0.2));
    if (seen) { r.seen.set(o, t); return true; }
    return t - (r.seen.get(o) ?? -9) < 0.35;
  }

  snapshot(r, sb, pk) {
    const g = this.game, c = r.c;
    const w0 = c.weapons[0], w1 = c.weapons[1];
    const me = [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.vel.x), r2(c.vel.y), r2(c.vel.z),
      (c.onGround ? 1 : 0) | (c.sprinting ? 2 : 0) | (c.alive ? 4 : 0) | (c.spawnProtect > 0 ? 8 : 0) | (c.tacSprinting ? 16 : 0),
      r3(c.crouchT), r3(c.slideT), Math.round(c.health), c.cur, w0.mag, w0.reserve, w1.mag, w1.reserve, c.grenades, r3(c.slideDir.x), r3(c.slideDir.z)];
    const ch = [];
    for (const o of g.characters) {
      if (o === c || !this.visible(r, o)) continue;
      const w = o.weapon;
      const fl = (o.alive ? 1 : 0) | (o.sprinting ? 2 : 0) | (o.onGround ? 4 : 0) | (o.slideT > 0 ? 8 : 0) | (o.tacSprinting ? 16 : 0);
      ch.push([o.id, r2(o.pos.x), r2(o.pos.y), r2(o.pos.z), r3(o.yaw), r3(o.pitch), r2(o.vel.x), r2(o.vel.y), r2(o.vel.z), fl,
        r2(o.crouchT), o.cur, w.reloading ? r2(w.reloadProgress) : 0, Math.round(o.health)]);
    }
    const msg = { t: 's', tm: r3(g.time), ack: r.ack, sc: [...g.scores], tl: r2(g.timeLeft), cd: r2(Math.max(0, g.countdownT)), me, ch, pk };
    if (g.gm) msg.gm = g.gm.netState();
    if (r.ev.length) { msg.ev = r.ev; r.ev = []; }
    if (r.pv.length) { msg.pv = r.pv; r.pv = []; }
    if (sb) msg.sb = sb;
    return msg;
  }

  sendEnd(result) {
    this.lobby.broadcastLobby(); // tells guests the host is back in the lobby
    const msg = { t: 'end', w: result.winner, sc: result.scores, sb: this.scoreboard() };
    for (const r of this.remotes.values()) {
      // flush whatever events were still queued (the final kill) before the result
      if (r.ev.length || r.pv.length) this.net.send(this.snapshot(r, null, this.pickupBits()), r.peerId);
      this.net.send(msg, r.peerId);
    }
  }

  dispose() { this.remotes.clear(); this.byChar.clear(); this.hist = []; }
}

function sanitize(a) {
  if (!Array.isArray(a) || a.length < 8) return null;
  const [s, dt, mx, my, y, p, bits, acts, v, gk] = a;
  if (!Number.isInteger(s) || s <= 0 || !fin(dt) || !fin(mx) || !fin(my) || !fin(y) || !fin(p) || !Number.isInteger(bits)) return null;
  const cmd = {
    s, dt: clamp(dt, 0.001, 0.05), mx: clamp(mx, -1, 1), my: clamp(my, -1, 1),
    y: ((y % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI, p: clamp(p, -1.5, 1.5),
    sp: !!(bits & 1), cr: !!(bits & 2), j: !!(bits & 4), sl: !!(bits & 8), f: !!(bits & 16), ads: !!(bits & 32), tac: !!(bits & 64), u: !!(bits & 128),
    a: null, v: fin(v) ? v : null, gk: fin(gk) ? clamp(gk, 0, GRENADE.fuse) : 0,
  };
  if (Array.isArray(acts)) cmd.a = acts.slice(0, 4).filter(x => ACTIONS.includes(x));
  return cmd;
}

// ---------------------------------------------------------------------------------------------
// Guest: predicts our own movement, reconciles against the host, interpolates everyone else.
// ---------------------------------------------------------------------------------------------
export class GuestSession {
  constructor(game, lobby) {
    this.game = game;
    this.lobby = lobby;
    this.net = lobby.net;
    this.seq = 0;
    this.pending = [];
    this.outbox = [];
    this.sendT = 0;
    this.offset = null;
    this.buf = new Map();
    this.lastSnap = now();
  }

  get hostId() { return this.lobby.hostId; }
  sendLoadout(l) { if (this.hostId) this.net.send({ t: 'lo', l }, this.hostId); }
  sendRespawn() { if (this.hostId) this.net.send({ t: 'rs' }, this.hostId); }


  get hostId() { return this.lobby.hostId; }
  hostNow() { return now() + (this.offset ?? 0); }
  viewTime() { return this.hostNow() - INTERP; }

  // ---------- outgoing ----------
  update(dt) {
    const g = this.game, ctl = g.playerCtl, c = g.player;
    const cmd = ctl.cmd;
    ctl.cmd = null;
    if (cmd && c.alive) {
      cmd.s = ++this.seq;
      this.pending.push({ cmd, adsT: c.adsT });
      if (this.pending.length > 120) this.pending.shift();
      const bits = (cmd.sp ? 1 : 0) | (cmd.cr ? 2 : 0) | (cmd.j ? 4 : 0) | (cmd.sl ? 8 : 0) | (cmd.f ? 16 : 0) | (cmd.ads ? 32 : 0) | (cmd.tac ? 64 : 0) | (cmd.u ? 128 : 0);
      this.outbox.push([cmd.s, r3(cmd.dt), r3(cmd.mx), r3(cmd.my), r3(cmd.y), r3(cmd.p), bits, cmd.a || 0, r3(this.viewTime()), cmd.gk ? r2(cmd.gk) : 0]);
    }
    this.sendT -= dt;
    if (this.outbox.length && (this.sendT <= 0 || this.outbox.length >= 8)) {
      this.net.send({ t: 'in', c: this.outbox }, this.hostId);
      this.outbox = [];
      this.sendT = 1 / 60;
    }
    this.interpolate(dt);
    // the clock starts with our first frame in the match, not when the host said "go": loading a big map on a
    // slow machine used to take longer than the timeout and drop us straight back to the menu
    if (!this.begun) { this.begun = true; this.lastSnap = Math.max(this.lastSnap, now()); }
    if (now() - this.lastSnap > 20) { this.lobby.close('Lost connection to the host.'); return; }
    if (now() - this.lastSnap > 4 && now() - (this.warnT || 0) > 4) { this.warnT = now(); g.hud.message('CONNECTION TO HOST INTERRUPTED…'); }
  }

  // ---------- incoming ----------
  receive(m) {
    const g = this.game;
    switch (m.t) {
      case 's': this.snapshot(m); break;
      case 'ro': this.roster(m); break;
      case 'end':
        if (Array.isArray(m.sb)) this.applyScoreboard(m.sb);
        if (Array.isArray(m.sc)) g.scores = [m.sc[0] | 0, m.sc[1] | 0];
        g.endMatch();
        break;
      default: break;
    }
  }

  roster(m) {
    const g = this.game;
    if (Array.isArray(m.rm)) for (const id of m.rm) { const c = g.charById(id); if (c && c !== g.player) { g.removeCharacter(c); this.buf.delete(id); } }
    if (Array.isArray(m.add)) for (const e of m.add) this.addPuppet(e);
  }

  addPuppet(e) {
    const g = this.game;
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || g.charById(e[0])) return null;
    const [id, name, team, primary, bot] = e;
    const c = new Character(g, { id, name: cleanName(name), team: team === 1 ? 1 : 0, isBot: !!bot, primary: typeof primary === 'string' ? primary : 'rifle', puppet: true });
    c.uid = typeof e[6] === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(e[6]) ? e[6] : '';
    c.hidden = true;
    c.alive = false;
    c.netSeen = -9;
    g.characters.push(c);
    return c;
  }

  snapshot(m) {
    const g = this.game, c = g.player;
    if (!fin(m.tm)) return;
    const t = now();
    this.lastSnap = t;
    const sample = m.tm - t;
    if (this.offset === null || Math.abs(sample - this.offset) > 1) this.offset = sample;
    else this.offset += (sample - this.offset) * (sample > this.offset ? 0.25 : 0.03);

    if (Array.isArray(m.sc)) g.scores = [m.sc[0] | 0, m.sc[1] | 0];
    if (fin(m.tl)) g.timeLeft = m.tl;
    if (fin(m.cd)) g.countdownT = m.cd;
    if (m.gm && g.gm) g.gm.applyNet(m.gm);
    this.curTm = m.tm;
    if (Array.isArray(m.ev)) for (const ev of m.ev) if (Array.isArray(ev)) this.event(ev);
    if (Array.isArray(m.pv)) for (const ev of m.pv) if (Array.isArray(ev)) this.personal(ev);
    if (Array.isArray(m.me) && m.me.length >= 18 && m.me.every(fin)) this.reconcile(m.me, m.ack | 0);
    if (Array.isArray(m.ch)) {
      for (const e of m.ch) {
        if (!Array.isArray(e) || e.length < 14 || !e.every(fin)) continue;
        const p = g.charById(e[0]);
        if (!p || p === c) continue;
        let b = this.buf.get(p.id);
        if (!b) this.buf.set(p.id, b = []);
        if (b.length && b[b.length - 1].tm >= m.tm) continue;
        b.push({ tm: m.tm, x: e[1], y: e[2], z: e[3], yaw: e[4], pitch: e[5], vx: e[6], vy: e[7], vz: e[8], fl: e[9], cr: e[10], cur: e[11] ? 1 : 0, rp: e[12], hp: e[13] });
        if (b.length > 30) b.shift();
        p.netSeen = t;
      }
    }
    if (typeof m.pk === 'string') {
      let i = 0;
      for (const p of g.pickups) {
        if (p.dynamic) continue;
        const on = m.pk[i++] === '1';
        if (on !== p.active) { p.active = on; p.mesh.visible = on; }
      }
    }
    if (Array.isArray(m.sb)) this.applyScoreboard(m.sb);
  }

  applyScoreboard(sb) {
    for (const e of sb) {
      if (!Array.isArray(e) || !e.every(fin)) continue;
      const c = this.game.charById(e[0]);
      if (!c) continue;
      c.kills = e[1] | 0; c.deaths = e[2] | 0; c.assists = e[3] | 0; c.score = e[4] | 0; c.ping = e[5] | 0;
    }
  }

  reconcile(me, ack) {
    const g = this.game, c = g.player, ctl = g.playerCtl;
    const [x, y, z, vx, vy, vz, fl, cr, sl, hp, cur, m0, r0, m1, r1, gr, sdx, sdz] = me;
    const alive = !!(fl & 4);
    while (this.pending.length && this.pending[0].cmd.s <= ack) this.pending.shift();
    c.health = clamp(hp, 0, PLAYER.maxHealth);
    c.grenades = gr | 0;
    c.spawnProtect = fl & 8 ? Math.max(c.spawnProtect, 0.1) : 0;
    const ws = [[m0, r0], [m1, r1]];
    c.weapons.forEach((w, i) => {
      w.reserve = ws[i][1] | 0;
      if (!w.reloading && g.time - c.lastFireT > 0.5) w.mag = clamp(ws[i][0] | 0, 0, w.def.mag);
    });
    const switching = this.pending.some(p => p.cmd.a && p.cmd.a.some(a => a === 'swap' || a === 'slot1' || a === 'slot2'));
    if ((cur === 0 || cur === 1) && cur !== c.cur && !switching && c.switchT <= 0) c.switchTo(cur);
    if (!alive) { if (c.alive) this.kill(c, null); return; }
    if (!c.alive) { c.spawn(_v1.set(x, y, z), c.yaw); g.localNotify('spawn'); }

    // rewind to the host's state, then re-apply the inputs it hasn't seen yet
    const oldX = c.pos.x, oldY = c.pos.y, oldZ = c.pos.z;
    const keepAds = c.adsT, keepCrouch = c.wantCrouch, keepSprint = c.sprinting;
    const keepFuel = c.tacFuel, keepIdle = c.tacIdle, keepTac = c.tacSprinting; // our own charge is predicted locally
    const keepStep = c.stepOff || 0; // the replay mustn't stack stair-camera easing
    c.pos.set(x, y, z);
    c.vel.set(vx, vy, vz);
    c.onGround = !!(fl & 1);
    c.sprinting = !!(fl & 2);
    c.crouchT = cr;
    c.height = lerp(PLAYER.height, PLAYER.crouchHeight, cr);
    c.slideT = sl;
    if (sl > 0) c.slideDir.set(sdx, 0, sdz);
    g.audio.muted = true;
    for (const p of this.pending) {
      const cmd = p.cmd;
      const sy = Math.sin(cmd.y), cy = Math.cos(cmd.y);
      _wish.set(-sy * cmd.my + cy * cmd.mx, 0, -cy * cmd.my - sy * cmd.mx);
      if (_wish.lengthSq() > 1) _wish.normalize();
      c.wantCrouch = cmd.cr;
      c.adsT = p.adsT;
      c.updateMovement(cmd.dt, _wish, !!cmd.sp, !!cmd.j, !!cmd.sl, !!cmd.tac);
    }
    c.tacFuel = keepFuel; c.tacIdle = keepIdle; c.tacSprinting = keepTac; c.stepOff = keepStep;
    g.audio.muted = false;
    c.adsT = keepAds; c.wantCrouch = keepCrouch;
    if (!this.pending.length) c.sprinting = keepSprint && c.sprinting;
    const dx = oldX - c.pos.x, dy = oldY - c.pos.y, dz = oldZ - c.pos.z;
    if (dx * dx + dy * dy + dz * dz < 9) ctl.correction.add(_v1.set(dx, dy, dz));
    else ctl.correction.set(0, 0, 0);
  }

  kill(victim, killer) {
    const g = this.game;
    victim.alive = false;
    victim.deathT = g.time;
    victim.deathDir = Math.random() < 0.5 ? 1 : -1;
    victim.killer = killer;
    victim.vel.set(0, 0, 0);
    victim.adsT = 0;
    victim.slideT = 0;
    victim.deathTm = this.curTm ?? this.hostNow(); // ignore older 'alive' snapshots still in the buffer
    if (victim === g.player) { this.pending = []; this.outbox = []; }
  }

  event(ev) {
    const g = this.game;
    const [type] = ev;
    switch (type) {
      case 'shot': {
        const [, id, wid, dx, dy, dz, ends, ox, oy, oz] = ev;
        const c = g.charById(id);
        if (!c || c === g.player || !WEAPONS[wid] || ![dx, dy, dz, ox, oy, oz].every(fin)) return;
        if (c.hidden) c.pos.set(ox, oy - c.eyeHeight, oz); // gunfire gives away position, as on the compass
        c.lastFireT = g.time;
        if (c.model) c.model.kick = 1;
        const dir = _v2.set(dx, dy, dz).normalize();
        const muzzle = c.hidden ? _v1.set(ox, oy, oz) : c.muzzleWorld(_v1);
        const wdef = (c.weapons.find(w => w.id === wid) || {}).def || WEAPONS[wid];
        g.audio.play('shot', c.pos, { weapon: wid, quiet: wdef.quiet });
        g.effects.muzzle(muzzle, dir, ['shotgun', 'sniper', 'launcher'].includes(wdef.model.type), wdef.quiet);
        if (!c.hidden && wid !== 'sniper' && wid !== 'shotgun') g.effects.casing(c.ejectWorld(_v3), dir, new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)));
        if (!Array.isArray(ends)) return;
        let whiz = false, first = true;
        for (const e of ends.slice(0, 16)) {
          if (!Array.isArray(e) || ![e[0], e[1], e[2]].every(fin)) continue;
          const end = new THREE.Vector3(e[0], e[1], e[2]);
          g.effects.tracer(muzzle, end);
          const k = e[3];
          if (k === 'b') {
            g.effects.impact(end, dir.clone().negate(), 'blood');
            // body reaction: whoever is standing where the blood is
            let hit = null, bd = 1.44;
            for (const o of g.characters) {
              if (o === c || !o.alive || o === g.player) continue;
              const d2 = Math.min(o.chestPos(_v3).distanceToSquared(end), o.headPos(_v3).distanceToSquared(end));
              if (d2 < bd) { bd = d2; hit = o; }
            }
            if (hit) hit.hitReact(end, dir, hitPower(WEAPONS[wid]), hit.headPos(_v3).distanceToSquared(end) < 0.05);
          }
          else if (Array.isArray(k) && [k[1], k[2], k[3]].every(fin)) {
            g.effects.impact(end, new THREE.Vector3(k[1], k[2], k[3]), String(k[0]).slice(0, 12));
            if (first) g.audio.play('impact', end);
          }
          first = false;
          const p = g.player;
          if (!whiz && p.alive && c.team !== p.team) {
            p.headPos(_v3).sub(muzzle);
            const al = _v3.dot(dir), len = end.distanceTo(muzzle);
            if (al > 2 && al < len && _v3.lengthSq() - al * al < 2.2) { whiz = true; g.audio.play('whiz', null, { ui: true }); }
          }
        }
        break;
      }
      case 'kill': {
        const [, kid, vid, wid, hs] = ev;
        const killer = g.charById(kid), victim = g.charById(vid);
        if (!victim) return;
        g.hud.killfeed(killer, victim, typeof wid === 'string' ? wid : '', !!hs);
        if (victim.alive || victim === g.player) this.kill(victim, killer);
        break;
      }
      case 'gren': {
        const [, id, ox, oy, oz, vx, vy, vz, owner, fz] = ev;
        if (![id, ox, oy, oz, vx, vy, vz].every(fin) || g.grenades.length > 40) return;
        g.spawnGrenade(id, new THREE.Vector3(ox, oy, oz), new THREE.Vector3(vx, vy, vz), g.charById(owner), fin(fz) ? clamp(fz, 0, GRENADE.fuse) : GRENADE.fuse);
        break;
      }
      case 'rkt': {
        // The Monte's rocket: the host flies it and sends the explosion; we draw it in flight
        const [, id, ox, oy, oz, vx, vy, vz, owner] = ev;
        if (![id, ox, oy, oz, vx, vy, vz].every(fin) || g.grenades.length > 40) return;
        g.spawnRocket(id, new THREE.Vector3(ox, oy, oz), new THREE.Vector3(vx, vy, vz), g.charById(owner), WEAPONS.monte.rocket);
        break;
      }
      case 'lo': {
        const [, id, l] = ev;
        const c = g.charById(id);
        if (c && typeof l === 'string') c.setLoadout(l);
        break;
      }
      case 'boom': {
        const [, id, x, y, z] = ev;
        if (![x, y, z].every(fin)) return;
        g.removeGrenade(id);
        g.explosionFx(new THREE.Vector3(x, y, z));
        break;
      }
      case 'melee': {
        const c = g.charById(ev[1]);
        if (!c || c === g.player) return;
        c.meleeT = MELEE.time;
        g.audio.play('melee', c.pos);
        break;
      }
      case 'drop': {
        const [, pid, x, y, z] = ev;
        if ([pid, x, y, z].every(fin)) g.dropAmmo(new THREE.Vector3(x, y, z), pid);
        break;
      }
      case 'take': {
        const p = g.pickups.find(q => q.dynamic && q.pid === ev[1]);
        if (p) p.active = false;
        break;
      }
      case 'gm': {
        // mode banners: only known types, plain values
        const [, type, a, b, c] = ev;
        if (!g.gm || !['round', 'half', 'ot', 'end', 'planted', 'drop', 'pickup'].includes(type)) return;
        const ok = (v) => v === undefined || fin(v) || (typeof v === 'string' && v.length < 12);
        if (ok(a) && ok(b) && ok(c)) g.gm.onEvent(type, a, b, c);
        break;
      }
      default: break;
    }
  }

  personal(ev) {
    const g = this.game, [type, a, b, c] = ev;
    switch (type) {
      case 'hit': g.localNotify('hit', !!a, !!b, !!c); break;
      case 'dmg': g.localNotify('dmg', fin(a) ? a : null, fin(b) ? b : 0); break;
      case 'kill': g.localNotify('kill'); break;
      case 'score': g.localNotify('score', cleanLabel(a), fin(b) ? b | 0 : 0); break;
      case 'medal': g.localNotify('medal', cleanLabel(a), cleanLabel(b)); break;
      case 'death': g.localNotify('death', fin(a) ? a : -1, typeof b === 'string' ? b.slice(0, 12) : ''); break;
      case 'spawn': {
        const [, x, y, z, yaw] = ev;
        if (![x, y, z, yaw].every(fin)) return;
        g.player.spawn(new THREE.Vector3(x, y, z), yaw);
        this.pending = [];
        g.playerCtl.correction.set(0, 0, 0);
        g.localNotify('spawn');
        break;
      }
      case 'pickup': g.localNotify('pickup', a === 'health' ? 'health' : 'ammo'); break;
      default: break;
    }
  }

  // ---------- puppets ----------
  interpolate(dt) {
    const g = this.game, rt = this.viewTime(), t = now();
    for (const c of g.characters) {
      if (c === g.player || !c.puppet) continue;
      if (c.meleeT > 0) c.meleeT -= dt;
      const b = this.buf.get(c.id);
      const stale = t - c.netSeen > 0.3;
      if (stale) {
        if (!c.hidden) { c.hidden = true; if (c.model) c.model.root.visible = false; }
        if (b) b.length = 0;
        continue;
      }
      if (!b || !b.length) continue;
      while (b.length > 2 && b[1].tm <= rt) b.shift();
      let A = b[0], B = b[1] || b[0];
      let k = B.tm > A.tm ? clamp((rt - A.tm) / (B.tm - A.tm), 0, 1) : 0;
      if (rt >= B.tm) { A = B; k = 0; }
      const alive = !!(A.fl & 1);
      let x = lerp(A.x, B.x, k), y = lerp(A.y, B.y, k), z = lerp(A.z, B.z, k);
      // the next snapshot is late: keep coasting on the last velocity for a moment instead of freezing
      if (rt > B.tm && (B.fl & 1)) { const over = Math.min(rt - B.tm, 0.12); x += B.vx * over; z += B.vz * over; }
      if (alive && !c.alive) {
        if (A.tm <= (c.deathTm ?? -1)) continue; // still showing the moments before their death
        c.spawn(_v1.set(x, y, z), A.yaw); // (re)spawned
      } else if (!alive && c.alive) this.kill(c, null);
      if (c.hidden && alive) c.hidden = false;
      if (!alive) { if (c.hidden && t - c.netSeen < 0.3 && g.time - c.deathT < 5) c.hidden = false; continue; }
      c.pos.set(x, y, z);
      c.vel.set(lerp(A.vx, B.vx, k), lerp(A.vy, B.vy, k), lerp(A.vz, B.vz, k));
      c.yaw = angLerp(A.yaw, B.yaw, k);
      c.pitch = lerp(A.pitch, B.pitch, k);
      c.crouchT = lerp(A.cr, B.cr, k);
      c.height = lerp(PLAYER.height, PLAYER.crouchHeight, c.crouchT);
      c.sprinting = !!(A.fl & 2);
      c.tacSprinting = !!(A.fl & 16);
      c.onGround = !!(A.fl & 4);
      c.slideT = A.fl & 8 ? 0.1 : 0;
      c.health = A.hp;
      if (A.cur !== c.cur) c.switchTo(A.cur);
      const w = c.weapon;
      w.reloading = A.rp > 0;
      if (w.reloading) { w.reloadTotal = 1; w.reloadT = 1 - A.rp; }
      // footsteps for players we can see
      const hs = Math.hypot(c.vel.x, c.vel.z);
      if (c.onGround && hs > 1.5 && c.slideT <= 0) {
        c.stepAccum += hs * dt;
        if (c.stepAccum > (c.sprinting ? 2.5 : 1.9)) { c.stepAccum = 0; if (c.crouchT < 0.5) g.audio.play('step', c.pos, { run: c.sprinting }); }
      }
    }
  }

  leave() {
    if (this.hostId) this.net.send({ t: 'bye' }, this.hostId);
  }

  dispose() { this.buf.clear(); this.pending = []; }
}
