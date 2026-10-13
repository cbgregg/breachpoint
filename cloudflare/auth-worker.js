// Breachpoint account Worker: passwordless sign-in by email link or code, Name Tags, friend codes, friends and
// presence (Cloudflare Workers + Workers KV + Resend).
//
// Sign-in
//   1. The game posts an email address to /start. The Worker emails a one-time sign-in link and a
//      6-digit code, and returns a request id to that browser. The response is the same whether or not
//      the address has an account, so it can't be used to find out who plays.
//   2. Opening the link, or typing the code (which only works with that browser's request id, 5 tries),
//      calls /verify, which creates the account on first use and returns a session. Both expire after
//      15 minutes and using either one cancels the other. "Remember me" keeps the session for 60 days;
//      without it the session lasts a day (and the game keeps it only until the browser closes). Only
//      SHA-256 hashes of links, codes and sessions are stored. The code is never put in the subject
//      line, so it doesn't show on a locked phone's notification.
//   3. For online matches the game asks /ticket for a short-lived signed pass naming the player and the
//      match code. Hosts check the signature with the public key from /pubkey.
//
// Players
//   Name Tag      shown to everyone in matches. Not unique. Can be changed once every 24 hours; friends
//                 can see previous Name Tags.
//   Display name  optional, only friends see it.
//   Friend code   unique code (XXXX-XXXX) you give to friends; entering it sends a friend request.
//   Email         never returned to anyone (your own shows masked in your profile).
//
// Setup (Cloudflare dashboard, Workers & Pages → Create → Worker, paste this file):
//   Bindings:   KV namespace bound as  ACCOUNTS
//   Secrets:    RESEND_API_KEY   API key from resend.com (domain breach-point.net verified there)
//   Variables:  MAIL_FROM        e.g.  Breachpoint <login@breach-point.net>
//               APP_URL          e.g.  https://breach-point.net   (where sign-in links point)
//               ALLOWED_ORIGINS  optional, comma-separated list of sites allowed to call this Worker;
//                                default breach-point.net, www.breach-point.net
//               FEEDBACK_TO      optional, address that receives the in-game feedback form (Secret, so it
//                                never appears in the repo). Every message is also kept in KV under fb:
//                                for a year, so nothing is lost if this isn't set.
// The ticket signing key is generated on first use and kept in KV.

const LOGIN_TTL = 15 * 60;              // sign-in links
const SESSION_LONG = 60 * 24 * 3600;    // "remember me": 60 days, renewed while you play
const SESSION_SHORT = 24 * 3600;        // otherwise a day
const TICKET_TTL = 3 * 3600;            // match passes
const TAG_EVERY = 24 * 3600;            // Name Tag changes
const HIST_KEEP = 10;                   // previous Name Tags kept for friends
// Presence is written only when it changes, plus a keepalive every 10 minutes, to stay well inside
// the Workers KV free plan (1,000 writes a day). Closing the game clears it straight away.
const PRESENCE_ONLINE = 11 * 60;        // seconds since the last update that still count as online
const PRESENCE_TTL = 15 * 60;           // KV expiry for presence records
const MAX_FRIENDS = 200, MAX_PENDING = 50, MAX_REQ_PER_DAY = 40;
const MAX_CODE_TRIES = 5;              // wrong codes before a sign-in request is cancelled
const MAX_STARTS_PER_EMAIL = 4;         // per 15 minutes
const MAX_STARTS_PER_IP = 12;           // per hour
const CODE_ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // friend codes: no 0/O, 1/I
const enc = new TextEncoder();

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://breach-point.net,https://www.breach-point.net').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (!env.ACCOUNTS) return json({ error: 'Accounts storage (KV binding ACCOUNTS) is not set up.' }, 500, cors);
    try {
      if (request.method === 'GET' && path === '/pubkey') return json({ jwk: (await signingKey(env)).pub }, 200, { ...cors, 'Cache-Control': 'public, max-age=3600' });
      if (request.method !== 'POST') return json({ error: 'not found' }, 404, cors);
      if (!okOrigin) return json({ error: 'origin not allowed' }, 403, cors);
      const body = await request.json().catch(() => ({}));
      const ctx = { env, body, request, cors };
      switch (path) {
        case '/start': return await start(ctx);
        case '/verify': return await verify(ctx);
        case '/me': return await withUser(ctx, async (u) => json({ user: await self(env, u) }, 200, cors));
        case '/name': return await withUser(ctx, (u) => setTag(ctx, u));
        case '/display': return await withUser(ctx, (u) => setDisplay(ctx, u));
        case '/ticket': return await withUser(ctx, (u) => ticket(ctx, u));
        case '/presence': return await withUser(ctx, (u) => presence(ctx, u));
        case '/friends': return await withUser(ctx, (u) => friends(ctx, u));
        case '/friends/add': return await withUser(ctx, (u) => friendAdd(ctx, u));
        case '/friends/accept': return await withUser(ctx, (u) => friendAccept(ctx, u));
        case '/friends/decline': return await withUser(ctx, (u) => friendDrop(ctx, u, 'decline'));
        case '/friends/cancel': return await withUser(ctx, (u) => friendDrop(ctx, u, 'cancel'));
        case '/friends/remove': return await withUser(ctx, (u) => friendDrop(ctx, u, 'remove'));
        case '/feedback': return await feedback(ctx);
        case '/logout': return await logout(ctx);
        case '/delete': return await withUser(ctx, (u, s) => deleteAccount(ctx, u, s));
        default: return json({ error: 'not found' }, 404, cors);
      }
    } catch (err) {
      return json({ error: 'Server error. Try again in a moment.' }, 500, cors);
    }
  },
};

// ---------- sign-in (email link only) ----------
async function start({ env, body, request, cors }) {
  const email = normEmail(body.email);
  if (!email) return json({ error: 'That doesn\'t look like an email address.' }, 400, cors);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const eh = await sha(email);
  if (!await allow(env, `rl:e:${eh}`, MAX_STARTS_PER_EMAIL, LOGIN_TTL)) return json({ error: 'Too many sign-in emails. Wait a few minutes and check your inbox (and spam folder).' }, 429, cors);
  if (!await allow(env, `rl:ip:${await sha(ip)}`, MAX_STARTS_PER_IP, 3600)) return json({ error: 'Too many sign-in attempts from this network. Try again later.' }, 429, cors);

  // one sign-in request = a link token and a 6-digit code; either one works, once. The code only
  // works together with the request id this browser got back, so it can't be guessed for anyone else.
  const token = rand(32), rid = rand(18);
  const code = String(randInt() % 1000000).padStart(6, '0');
  const th = await sha(token), exp = now() + LOGIN_TTL;
  await env.ACCOUNTS.put(`tok:${th}`, JSON.stringify({ email, exp, rid }), { expirationTtl: LOGIN_TTL });
  await env.ACCOUNTS.put(`req:${rid}`, JSON.stringify({ email, exp, th, ch: await sha(`${rid}:${code}`), tries: 0 }), { expirationTtl: LOGIN_TTL });
  const app = (env.APP_URL || 'https://breach-point.net').replace(/\/+$/, '');
  // the token goes in the URL fragment, which browsers never send to any server
  const link = `${app}/#login=${token}`;
  const sent = await sendMail(env, email, link, code);
  if (!sent.ok) return json({ error: sent.error }, 502, cors);
  return json({ ok: true, rid }, 200, cors);
}

async function verify({ env, body, cors }) {
  let rec;
  if (typeof body.code === 'string') {
    // 6-digit code from the email, typed into the browser that asked for it
    const rid = String(body.rid || ''), code = body.code.replace(/\D/g, '');
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(rid) || code.length !== 6) return json({ error: 'Enter the 6-digit code from the email.' }, 400, cors);
    const rk = `req:${rid}`;
    const req = await getJSON(env, rk);
    if (!req || req.exp < now() || req.tries >= MAX_CODE_TRIES) {
      if (req) { await env.ACCOUNTS.delete(rk); await env.ACCOUNTS.delete(`tok:${req.th}`); }
      return json({ error: 'This code has expired or was used up. Send a new email.', expired: true }, 400, cors);
    }
    if (await sha(`${rid}:${code}`) !== req.ch) {
      req.tries = (req.tries || 0) + 1;
      const left = MAX_CODE_TRIES - req.tries;
      if (left <= 0) { await env.ACCOUNTS.delete(rk); await env.ACCOUNTS.delete(`tok:${req.th}`); return json({ error: 'Too many wrong codes. Send a new email.', expired: true }, 400, cors); }
      await env.ACCOUNTS.put(rk, JSON.stringify(req), { expirationTtl: Math.max(60, req.exp - now()) });
      return json({ error: `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` }, 400, cors);
    }
    await env.ACCOUNTS.delete(rk); await env.ACCOUNTS.delete(`tok:${req.th}`); // one use: the link stops working too
    rec = req;
  } else {
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(body.token)) return json({ error: 'Missing sign-in link.' }, 400, cors);
    const tk = `tok:${await sha(body.token)}`;
    rec = await getJSON(env, tk);
    await env.ACCOUNTS.delete(tk); // one use only
    if (rec && rec.rid) await env.ACCOUNTS.delete(`req:${rec.rid}`); // and the code stops working
    if (!rec || rec.exp < now()) return json({ error: 'This sign-in link has expired or was already used. Request a new one.' }, 400, cors);
  }

  // find or create the account
  const eh = await sha(rec.email);
  let uid = await env.ACCOUNTS.get(`email:${eh}`);
  let user = uid && await getJSON(env, `user:${uid}`);
  if (!user) {
    uid = rand(12);
    user = { id: uid, email: rec.email, tag: null, created: now() };
    await env.ACCOUNTS.put(`email:${eh}`, uid);
  }
  await ensureCode(env, user);
  await env.ACCOUNTS.put(`user:${uid}`, JSON.stringify(user));
  const session = rand(32), ttl = body.remember ? SESSION_LONG : SESSION_SHORT;
  await env.ACCOUNTS.put(`sess:${await sha(session)}`, JSON.stringify({ uid, at: now(), ttl }), { expirationTtl: ttl });
  return json({ session, remember: !!body.remember, user: await self(env, user) }, 200, cors);
}

// ---------- signed-in requests ----------
async function withUser(ctx, fn) {
  const { env, request, cors } = ctx;
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{20,80})$/);
  if (!m) return json({ error: 'Not signed in.', signedOut: true }, 401, cors);
  const sk = `sess:${await sha(m[1])}`;
  const s = await getJSON(env, sk);
  const user = s && await getUser(env, s.uid);
  if (!user) return json({ error: 'Your sign-in has expired. Sign in again.', signedOut: true }, 401, cors);
  // keep active players signed in (refresh at most every few hours to save writes)
  const ttl = s.ttl || SESSION_LONG;
  if (now() - (s.at || 0) > Math.min(86400, ttl / 4)) await env.ACCOUNTS.put(sk, JSON.stringify({ uid: s.uid, at: now(), ttl }), { expirationTtl: ttl });
  return fn(user, sk);
}

async function getUser(env, uid) {
  const u = await getJSON(env, `user:${uid}`);
  if (u && u.name !== undefined && u.tag === undefined) { u.tag = u.name; delete u.name; } // older records
  return u;
}
const saveUser = (env, u) => env.ACCOUNTS.put(`user:${u.id}`, JSON.stringify(u));

// what you see about yourself (your email only masked)
async function self(env, u) {
  if (await ensureCode(env, u)) await saveUser(env, u);
  return {
    id: u.id, tag: u.tag || null, disp: u.disp || '', code: fmtCode(u.code), email: maskEmail(u.email),
    hist: (u.hist || []).map(h => h.t), nextTagAt: u.tag && u.tagAt ? u.tagAt + TAG_EVERY : 0,
  };
}

async function ensureCode(env, u) {
  if (u.code) return false;
  for (let i = 0; i < 8; i++) {
    let c = '';
    for (let k = 0; k < 8; k++) c += CODE_ABC[randInt() % CODE_ABC.length];
    if (await env.ACCOUNTS.get(`fcode:${c}`)) continue;
    await env.ACCOUNTS.put(`fcode:${c}`, u.id);
    u.code = c;
    return true;
  }
  throw new Error('code space');
}

async function setTag({ env, body, cors }, user) {
  const tag = String(body.name || '').replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}\p{N} _\-.]{3,16}$/u.test(tag)) return json({ error: 'Name Tags are 3–16 letters, numbers, spaces, - _ or .' }, 400, cors);
  if (/^operator(-\d+)?$/i.test(tag) || /^bot\b/i.test(tag)) return json({ error: 'That Name Tag is reserved.' }, 400, cors);
  if (isOffensive(tag)) return json({ error: 'Pick a different Name Tag.' }, 400, cors);
  if (user.tag === tag) return json({ user: await self(env, user) }, 200, cors);
  if (user.tag && user.tagAt && now() - user.tagAt < TAG_EVERY) {
    return json({ error: 'You can change your Name Tag once a day.', nextTagAt: user.tagAt + TAG_EVERY }, 429, cors);
  }
  if (user.tag) user.hist = [{ t: user.tag, until: now() }, ...(user.hist || [])].slice(0, HIST_KEEP);
  user.tag = tag;
  user.tagAt = now();
  await saveUser(env, user);
  return json({ user: await self(env, user) }, 200, cors);
}

async function setDisplay({ env, body, cors }, user) {
  const d = String(body.name || '').replace(/\s+/g, ' ').trim();
  if (d && !/^[\p{L}\p{N} _\-.'’]{1,24}$/u.test(d)) return json({ error: 'Display names are up to 24 letters, numbers, spaces and - _ . \'' }, 400, cors);
  if (d && isOffensive(d)) return json({ error: 'Pick a different display name.' }, 400, cors);
  user.disp = d;
  await saveUser(env, user);
  return json({ user: await self(env, user) }, 200, cors);
}

async function ticket({ env, body, cors }, user) {
  if (!user.tag) return json({ error: 'Choose a Name Tag first.' }, 400, cors);
  const room = String(body.room || '');
  if (!/^[A-Za-z0-9:_-]{1,40}$/.test(room)) return json({ error: 'bad match code' }, 400, cors);
  const key = await signingKey(env);
  const payload = b64u(enc.encode(JSON.stringify({ u: user.id, n: user.tag, r: room, e: now() + TICKET_TTL })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, enc.encode(payload));
  return json({ ticket: `${payload}.${b64u(new Uint8Array(sig))}`, exp: now() + TICKET_TTL }, 200, cors);
}

// ---------- presence: friends see where you are and can join your match ----------
async function presence({ env, body, cors }, user) {
  const st = ['menu', 'lobby', 'match'].includes(body.state) ? body.state : 'menu';
  const p = { s: st, at: now() };
  if (typeof body.mode === 'string' && /^[a-z]{2,10}$/.test(body.mode)) p.m = body.mode;
  if (typeof body.map === 'string' && /^[a-z]{2,12}$/.test(body.map)) p.map = body.map;
  if (typeof body.join === 'string' && /^\d{6}$/.test(body.join)) p.j = body.join;
  if (body.pub) p.pub = 1;
  if (body.off) await env.ACCOUNTS.delete(`pres:${user.id}`);
  else await env.ACCOUNTS.put(`pres:${user.id}`, JSON.stringify(p), { expirationTtl: PRESENCE_TTL });
  return json({ ok: true }, 200, cors);
}

// ---------- friends ----------
const frKey = (id) => `fr:${id}`;
async function frGet(env, id) { const d = await getJSON(env, frKey(id)); return { f: {}, i: {}, o: {}, ...(d || {}) }; }
const frPut = (env, id, d) => env.ACCOUNTS.put(frKey(id), JSON.stringify(d));

async function friends({ env, cors }, user) {
  const d = await frGet(env, user.id);
  const ids = [...new Set([...Object.keys(d.f), ...Object.keys(d.i), ...Object.keys(d.o)])].slice(0, MAX_FRIENDS + 2 * MAX_PENDING);
  const users = new Map();
  await Promise.all(ids.map(async (id) => { const u = await getUser(env, id); if (u) users.set(id, u); }));
  const pres = new Map();
  await Promise.all(Object.keys(d.f).map(async (id) => { const p = await getJSON(env, `pres:${id}`); if (p && now() - p.at < PRESENCE_ONLINE) pres.set(id, p); }));
  const friendsList = Object.entries(d.f).filter(([id]) => users.has(id)).map(([id, since]) => {
    const u = users.get(id), p = pres.get(id);
    return {
      id, tag: u.tag || 'Operator', disp: u.disp || '', hist: (u.hist || []).map(h => h.t).slice(0, 5), since,
      online: !!p, state: p ? p.s : 'offline', mode: p && p.m || '', map: p && p.map || '', join: p && p.j || '', pub: !!(p && p.pub),
    };
  }).sort((a, b) => (b.online - a.online) || a.tag.localeCompare(b.tag));
  const pend = (box) => Object.entries(box).filter(([id]) => users.has(id)).map(([id, at]) => ({ id, tag: users.get(id).tag || 'New player', at }));
  return json({ friends: friendsList, incoming: pend(d.i), outgoing: pend(d.o) }, 200, cors);
}

async function friendAdd({ env, body, cors }, user) {
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{8}$/.test(code)) return json({ error: 'Friend codes look like ABCD-2345.' }, 400, cors);
  if (!await allow(env, `rl:fr:${user.id}`, MAX_REQ_PER_DAY, 86400)) return json({ error: 'Too many friend requests today. Try again tomorrow.' }, 429, cors);
  const them = await env.ACCOUNTS.get(`fcode:${code}`);
  if (!them) return json({ error: 'No player has that friend code.' }, 404, cors);
  if (them === user.id) return json({ error: 'That\'s your own friend code.' }, 400, cors);
  const me = await frGet(env, user.id), other = await frGet(env, them);
  if (me.f[them]) return json({ error: 'You\'re already friends.' }, 400, cors);
  if (me.i[them]) return friendAccept({ env, body: { id: them }, cors }, user); // they asked first: accept
  if (me.o[them]) return json({ ok: true, pending: true }, 200, cors);
  if (Object.keys(me.f).length >= MAX_FRIENDS) return json({ error: 'Your friends list is full.' }, 400, cors);
  if (Object.keys(me.o).length >= MAX_PENDING || Object.keys(other.i).length >= MAX_PENDING) return json({ error: 'Too many pending requests. Try again later.' }, 400, cors);
  me.o[them] = now(); other.i[user.id] = now();
  await frPut(env, user.id, me); await frPut(env, them, other);
  return json({ ok: true, pending: true }, 200, cors);
}

async function friendAccept({ env, body, cors }, user) {
  const them = String(body.id || '');
  const me = await frGet(env, user.id);
  if (!me.i[them]) return json({ error: 'That request is gone.' }, 404, cors);
  const other = await frGet(env, them);
  if (Object.keys(me.f).length >= MAX_FRIENDS || Object.keys(other.f).length >= MAX_FRIENDS) return json({ error: 'A friends list is full.' }, 400, cors);
  delete me.i[them]; delete me.o[them]; delete other.o[user.id]; delete other.i[user.id];
  me.f[them] = now(); other.f[user.id] = now();
  await frPut(env, user.id, me); await frPut(env, them, other);
  return json({ ok: true, friends: true }, 200, cors);
}

async function friendDrop({ env, body, cors }, user, kind) {
  const them = String(body.id || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(them)) return json({ error: 'bad id' }, 400, cors);
  const me = await frGet(env, user.id), other = await frGet(env, them);
  if (kind === 'decline') { delete me.i[them]; delete other.o[user.id]; }
  else if (kind === 'cancel') { delete me.o[them]; delete other.i[user.id]; }
  else { delete me.f[them]; delete other.f[user.id]; }
  await frPut(env, user.id, me); await frPut(env, them, other);
  return json({ ok: true }, 200, cors);
}

// ---------- feedback form (no sign-in needed) ----------
const FB_KINDS = { feature: 'Feature request', bug: 'Bug report', feedback: 'Feedback' };
async function feedback({ env, body, request, cors }) {
  const kind = FB_KINDS[body.kind] ? body.kind : 'feedback';
  const text = String(body.text || '').replace(/\r/g, '').trim();
  if (text.length < 10) return json({ error: 'Write a little more (at least 10 characters).' }, 400, cors);
  if (text.length > 2000) return json({ error: 'Keep it under 2000 characters.' }, 400, cors);
  const contact = String(body.contact || '').trim().slice(0, 120);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (!await allow(env, `rl:fb:${await sha(ip)}`, 6, 3600)) return json({ error: 'Thanks! You\'ve sent a lot already. Try again in an hour.' }, 429, cors);
  // signed in? attach the Name Tag (never the email)
  let who = '';
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{20,80})$/);
  if (m) { const se = await getJSON(env, `sess:${await sha(m[1])}`); const u = se && await getUser(env, se.uid); if (u) who = `${u.tag || 'no Name Tag'} (${u.id})`; }
  const meta = {};
  for (const k of ['device', 'mode', 'map', 'screen', 'ua']) if (typeof body[k] === 'string') meta[k] = body[k].slice(0, k === 'ua' ? 200 : 40);
  const rec = { kind, text, contact, who, meta, at: new Date().toISOString(), country: (request.cf && request.cf.country) || '' };
  await env.ACCOUNTS.put(`fb:${rec.at}:${rand(4)}`, JSON.stringify(rec), { expirationTtl: 365 * 86400 });
  if (env.FEEDBACK_TO && env.RESEND_API_KEY && env.MAIL_FROM) {
    const lines = [`${FB_KINDS[kind]}`, '', text, '', `Contact: ${contact || '(none)'}`, `Player: ${who || '(not signed in)'}`, `Where: ${Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' · ')}`, `Country: ${rec.country}`, `Time: ${rec.at}`];
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [env.FEEDBACK_TO], subject: `[Breachpoint] ${FB_KINDS[kind]}: ${text.slice(0, 60).replace(/\s+/g, ' ')}`, text: lines.join('\n'), ...(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(contact) ? { reply_to: contact } : {}) }),
    }).catch(() => {});
  }
  return json({ ok: true }, 200, cors);
}

async function logout({ env, request, cors }) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{20,80})$/);
  if (m) await env.ACCOUNTS.delete(`sess:${await sha(m[1])}`);
  return json({ ok: true }, 200, cors);
}

async function deleteAccount({ env, cors }, user, sk) {
  const d = await frGet(env, user.id);
  for (const id of new Set([...Object.keys(d.f), ...Object.keys(d.i), ...Object.keys(d.o)])) {
    const o = await frGet(env, id);
    delete o.f[user.id]; delete o.i[user.id]; delete o.o[user.id];
    await frPut(env, id, o);
  }
  await env.ACCOUNTS.delete(frKey(user.id));
  await env.ACCOUNTS.delete(`pres:${user.id}`);
  if (user.code) await env.ACCOUNTS.delete(`fcode:${user.code}`);
  await env.ACCOUNTS.delete(`email:${await sha(user.email)}`);
  await env.ACCOUNTS.delete(`user:${user.id}`);
  await env.ACCOUNTS.delete(sk); // other devices' sessions stop working because the user record is gone
  return json({ ok: true }, 200, cors);
}

// ---------- email ----------
async function sendMail(env, to, link, code) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { ok: false, error: 'Sign-in email isn\'t set up on the server yet.' };
  const text = `Your Breachpoint sign-in code: ${code}\n\nType it into the game, or open this link on the same device:\n${link}\n\nThe code and link expire in 15 minutes and work once. If you didn't ask to sign in, ignore this email: nobody can sign in without it. Never share the code or link.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#070a0d;color:#eef2f4;padding:32px">
  <div style="max-width:440px;margin:0 auto">
    <div style="font-weight:700;letter-spacing:6px;font-size:22px;margin-bottom:24px"><span style="display:inline-block;width:10px;height:10px;background:#f7941d;margin-right:10px"></span>BREACHPOINT</div>
    <p style="color:#9fabb4;margin:0 0 10px">Your sign-in code:</p>
    <div style="font-family:'Courier New',monospace;font-weight:700;font-size:36px;letter-spacing:10px;color:#ffffff;background:#11161b;border:1px solid #2a323a;padding:14px 18px;display:inline-block;margin-bottom:22px">${code}</div>
    <p style="color:#9fabb4;margin:0 0 18px">Type it into the game, or tap the button on the same device. Both work once, for 15 minutes.</p>
    <a href="${link}" style="display:inline-block;background:#f7941d;color:#0e1114;text-decoration:none;font-weight:700;letter-spacing:3px;padding:14px 22px">SIGN IN TO BREACHPOINT</a>
    <p style="color:#9fabb4;font-size:13px;line-height:1.5;margin:28px 0 0">If you didn't ask to sign in, ignore this email: nobody can sign in without it. Never share the code or forward this email.</p>
  </div></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: 'Your Breachpoint sign-in code', text, html }),
  });
  if (!res.ok) return { ok: false, error: 'Couldn\'t send the email. Try again in a moment.' };
  return { ok: true };
}

// ---------- helpers ----------
async function signingKey(env) {
  if (globalThis.__bpKey) return globalThis.__bpKey;
  let stored = await getJSON(env, 'key:signing');
  if (!stored) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    stored = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: await crypto.subtle.exportKey('jwk', kp.publicKey) };
    await env.ACCOUNTS.put('key:signing', JSON.stringify(stored));
    stored = await getJSON(env, 'key:signing') || stored; // another instance may have won the race
  }
  const pubJwk = { kty: stored.pub.kty, crv: stored.pub.crv, x: stored.pub.x, y: stored.pub.y };
  globalThis.__bpKey = { pub: pubJwk, priv: await crypto.subtle.importKey('jwk', stored.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return globalThis.__bpKey;
}

async function allow(env, key, max, ttl) {
  const n = parseInt(await env.ACCOUNTS.get(key) || '0', 10);
  if (n >= max) return false;
  await env.ACCOUNTS.put(key, String(n + 1), { expirationTtl: ttl });
  return true;
}

const fmtCode = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : '');
function maskEmail(e) {
  const [u, d] = String(e || '').split('@');
  if (!d) return '';
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
}
const now = () => Math.floor(Date.now() / 1000);
const getJSON = async (env, k) => { const v = await env.ACCOUNTS.get(k); try { return v ? JSON.parse(v) : null; } catch (_) { return null; } };
function normEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  return s.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(s) ? s : null;
}
function rand(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b64u(b); }
function randInt() { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0]; }
async function sha(s) { return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))); }
function b64u(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Cache-Control': 'no-store', ...headers, 'Content-Type': 'application/json' } });
}

// ---------- name filter (same rules as js/names.js in the game) ----------
const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' };
const STRONG = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'pussy', 'porn', 'rapist', 'nigg', 'fagg', 'faggot', 'tranny', 'retard',
  'wetback', 'beaner', 'raghead', 'towelhead', 'hitler', 'nazi', 'kkk', 'jizz', 'molest', 'pedophile', 'kike',
];
const WORDS = [
  'dick', 'cock', 'cum', 'rape', 'fag', 'spic', 'chink', 'gook', 'coon', 'paki', 'heil', 'penis', 'vagina', 'negro', 'dyke', 'pedo',
  'ass', 'arse', 'tit', 'tits', 'hoe', 'hoes', 'piss', 'twat', 'wank', 'anal', 'sex', 'nude', 'nudes', 'fuk', 'fck', 'fvck', 'niga', 'nigga',
];
const squash = (s) => s.toLowerCase().split('').map(ch => LEET[ch] ?? ch).join('').normalize('NFKD').replace(/[̀-ͯ]/g, '');
function isOffensive(name) {
  const base = squash(String(name || ''));
  const letters = base.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const lettersRaw = base.replace(/[^a-z]/g, '');
  if (STRONG.some(w => { const c = w.replace(/(.)\1+/g, '$1'); return lettersRaw.includes(w) || (c.length >= 4 && letters.includes(c)); })) return true;
  const tokens = squash(String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2')).split(/[^a-z]+/).filter(Boolean);
  return tokens.some(t => WORDS.includes(t) || WORDS.includes(t.replace(/(.)\1+/g, '$1')));
}
