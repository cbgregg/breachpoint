// Breachpoint account Worker: passwordless sign-in by email (Cloudflare Workers + Workers KV + Resend).
//
// How sign-in works
//   1. The game posts an email address to /start. The Worker emails a one-time sign-in link and a
//      6-digit code (for consoles/TVs, where the email is read on a phone). The response is the same
//      whether or not the address has an account, so it can't be used to find out who plays.
//   2. Opening the link (or typing the code into the game) calls /verify, which creates the account
//      on first use and returns a session token. Links and codes expire after 15 minutes, work once,
//      and a code allows 5 guesses. Only SHA-256 hashes of links, codes and sessions are stored.
//   3. For online matches the game asks /ticket for a short-lived signed pass naming the player and
//      the match code. Hosts check the signature with the public key from /pubkey, so nobody can join
//      under someone else's callsign or without an account.
//
// Setup (Cloudflare dashboard, Workers & Pages → Create → Worker, paste this file):
//   Bindings:   KV namespace bound as  ACCOUNTS
//   Secrets:    RESEND_API_KEY   API key from resend.com (domain breach-point.net verified there)
//   Variables:  MAIL_FROM        e.g.  Breachpoint <login@breach-point.net>
//               APP_URL          e.g.  https://breach-point.net   (where sign-in links point)
//               ALLOWED_ORIGINS  optional, comma-separated list of sites allowed to call this Worker;
//                                default breach-point.net, www.breach-point.net
// The ticket signing key is generated on first use and kept in KV.

const LOGIN_TTL = 15 * 60;              // sign-in links and codes
const SESSION_TTL = 60 * 24 * 3600;     // stay signed in for 60 days (renewed while you play)
const TICKET_TTL = 3 * 3600;            // match passes
const CODE_TRIES = 5;
const MAX_STARTS_PER_EMAIL = 4;         // per 15 minutes
const MAX_STARTS_PER_IP = 12;           // per hour
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
        case '/me': return await withUser(ctx, (u) => json({ user: pub(u) }, 200, cors));
        case '/name': return await withUser(ctx, (u, s) => setName(ctx, u, s));
        case '/ticket': return await withUser(ctx, (u) => ticket(ctx, u));
        case '/logout': return await logout(ctx);
        case '/delete': return await withUser(ctx, (u, s) => deleteAccount(ctx, u, s));
        default: return json({ error: 'not found' }, 404, cors);
      }
    } catch (err) {
      return json({ error: 'Server error. Try again in a moment.' }, 500, cors);
    }
  },
};

// ---------- sign-in ----------
async function start({ env, body, request, cors }) {
  const email = normEmail(body.email);
  if (!email) return json({ error: 'That doesn\'t look like an email address.' }, 400, cors);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const eh = await sha(email);
  if (!await allow(env, `rl:e:${eh}`, MAX_STARTS_PER_EMAIL, LOGIN_TTL)) return json({ error: 'Too many sign-in emails. Wait a few minutes and check your inbox (and spam folder).' }, 429, cors);
  if (!await allow(env, `rl:ip:${await sha(ip)}`, MAX_STARTS_PER_IP, 3600)) return json({ error: 'Too many sign-in attempts from this network. Try again later.' }, 429, cors);

  const token = rand(32), code = String(100000 + (randInt() % 900000)), rid = rand(16);
  const rec = { email, th: await sha(token), ch: await sha(`${rid}:${code}`), tries: 0, exp: now() + LOGIN_TTL };
  await env.ACCOUNTS.put(`req:${rid}`, JSON.stringify(rec), { expirationTtl: LOGIN_TTL });
  await env.ACCOUNTS.put(`tok:${rec.th}`, rid, { expirationTtl: LOGIN_TTL });

  const app = (env.APP_URL || 'https://breach-point.net').replace(/\/+$/, '');
  // the token goes in the URL fragment, which browsers never send to any server
  const link = `${app}/#login=${token}`;
  const sent = await sendMail(env, email, link, code);
  if (!sent.ok) return json({ error: sent.error }, 502, cors);
  return json({ ok: true, rid }, 200, cors);
}

async function verify({ env, body, cors }) {
  let rid, rec;
  if (typeof body.token === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(body.token)) {
    rid = await env.ACCOUNTS.get(`tok:${await sha(body.token)}`);
    rec = rid && await getJSON(env, `req:${rid}`);
    if (!rec || rec.th !== await sha(body.token)) return json({ error: 'This sign-in link has expired or was already used. Request a new one.' }, 400, cors);
  } else if (typeof body.rid === 'string' && /^[A-Za-z0-9_-]{10,40}$/.test(body.rid) && /^\d{6}$/.test(String(body.code || ''))) {
    rid = body.rid;
    rec = await getJSON(env, `req:${rid}`);
    if (!rec) return json({ error: 'That code has expired. Request a new one.' }, 400, cors);
    if (rec.ch !== await sha(`${rid}:${body.code}`)) {
      rec.tries++;
      if (rec.tries >= CODE_TRIES) { await burn(env, rid, rec); return json({ error: 'Too many wrong codes. Request a new one.', expired: true }, 400, cors); }
      await env.ACCOUNTS.put(`req:${rid}`, JSON.stringify(rec), { expirationTtl: Math.max(60, rec.exp - now()) });
      return json({ error: `Wrong code. ${CODE_TRIES - rec.tries} ${CODE_TRIES - rec.tries === 1 ? 'try' : 'tries'} left.` }, 400, cors);
    }
  } else return json({ error: 'Missing sign-in link or code.' }, 400, cors);
  if (rec.exp < now()) { await burn(env, rid, rec); return json({ error: 'That sign-in has expired. Request a new one.' }, 400, cors); }
  await burn(env, rid, rec); // one use only

  // find or create the account
  const eh = await sha(rec.email);
  let uid = await env.ACCOUNTS.get(`email:${eh}`);
  let user = uid && await getJSON(env, `user:${uid}`);
  if (!user) {
    uid = rand(12);
    user = { id: uid, email: rec.email, name: null, created: now() };
    await env.ACCOUNTS.put(`user:${uid}`, JSON.stringify(user));
    await env.ACCOUNTS.put(`email:${eh}`, uid);
  }
  const session = rand(32);
  await env.ACCOUNTS.put(`sess:${await sha(session)}`, JSON.stringify({ uid, at: now() }), { expirationTtl: SESSION_TTL });
  return json({ session, user: pub(user) }, 200, cors);
}

async function burn(env, rid, rec) {
  await env.ACCOUNTS.delete(`req:${rid}`);
  if (rec && rec.th) await env.ACCOUNTS.delete(`tok:${rec.th}`);
}

// ---------- signed-in requests ----------
async function withUser(ctx, fn) {
  const { env, request, cors } = ctx;
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{20,80})$/);
  if (!m) return json({ error: 'Not signed in.', signedOut: true }, 401, cors);
  const sk = `sess:${await sha(m[1])}`;
  const s = await getJSON(env, sk);
  const user = s && await getJSON(env, `user:${s.uid}`);
  if (!user) return json({ error: 'Your sign-in has expired. Sign in again.', signedOut: true }, 401, cors);
  // keep active players signed in (refresh at most daily to save writes)
  if (now() - (s.at || 0) > 86400) await env.ACCOUNTS.put(sk, JSON.stringify({ uid: s.uid, at: now() }), { expirationTtl: SESSION_TTL });
  return fn(user, sk);
}

async function setName({ env, body, cors }, user) {
  const name = String(body.name || '').replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}\p{N} _\-.]{3,16}$/u.test(name)) return json({ error: 'Callsigns are 3–16 letters, numbers, spaces, - _ or .' }, 400, cors);
  if (/^operator(-\d+)?$/i.test(name) || /^bot\b/i.test(name)) return json({ error: 'That callsign is reserved.' }, 400, cors);
  if (isOffensive(name)) return json({ error: 'Pick a different callsign.' }, 400, cors);
  const key = `name:${name.toLowerCase()}`;
  const owner = await env.ACCOUNTS.get(key);
  if (owner && owner !== user.id) return json({ error: 'That callsign is taken.', taken: true }, 409, cors);
  if (user.name && user.name.toLowerCase() !== name.toLowerCase()) await env.ACCOUNTS.delete(`name:${user.name.toLowerCase()}`);
  await env.ACCOUNTS.put(key, user.id);
  user.name = name;
  await env.ACCOUNTS.put(`user:${user.id}`, JSON.stringify(user));
  return json({ user: pub(user) }, 200, cors);
}

async function ticket({ env, body, cors }, user) {
  if (!user.name) return json({ error: 'Choose a callsign first.' }, 400, cors);
  const room = String(body.room || '');
  if (!/^[A-Za-z0-9:_-]{1,40}$/.test(room)) return json({ error: 'bad match code' }, 400, cors);
  const key = await signingKey(env);
  const payload = b64u(enc.encode(JSON.stringify({ u: user.id, n: user.name, r: room, e: now() + TICKET_TTL })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, enc.encode(payload));
  return json({ ticket: `${payload}.${b64u(new Uint8Array(sig))}`, exp: now() + TICKET_TTL }, 200, cors);
}

async function logout({ env, request, cors }) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{20,80})$/);
  if (m) await env.ACCOUNTS.delete(`sess:${await sha(m[1])}`);
  return json({ ok: true }, 200, cors);
}

async function deleteAccount({ env, cors }, user, sk) {
  if (user.name) await env.ACCOUNTS.delete(`name:${user.name.toLowerCase()}`);
  await env.ACCOUNTS.delete(`email:${await sha(user.email)}`);
  await env.ACCOUNTS.delete(`user:${user.id}`);
  await env.ACCOUNTS.delete(sk); // other devices' sessions stop working because the user record is gone
  return json({ ok: true }, 200, cors);
}

// ---------- email ----------
async function sendMail(env, to, link, code) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { ok: false, error: 'Sign-in email isn\'t set up on the server yet.' };
  const text = `Your Breachpoint sign-in code is ${code}\n\nOr open this link to sign in:\n${link}\n\nThe link and code expire in 15 minutes and work once. If you didn't ask to sign in, ignore this email: nobody can sign in without it. Never share this code.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#0b0d0e;color:#ece9e1;padding:32px">
  <div style="max-width:440px;margin:0 auto">
    <div style="font-weight:700;letter-spacing:6px;font-size:22px;margin-bottom:24px"><span style="display:inline-block;width:10px;height:10px;background:#ff4d4d;margin-right:10px"></span>BREACHPOINT</div>
    <p style="color:#a7a49b;margin:0 0 8px">Your sign-in code</p>
    <div style="font-size:38px;font-weight:700;letter-spacing:10px;margin:0 0 24px">${code.slice(0, 3)} ${code.slice(3)}</div>
    <a href="${link}" style="display:inline-block;background:#ece9e1;color:#121313;text-decoration:none;font-weight:700;letter-spacing:3px;padding:14px 22px">SIGN IN ON THIS DEVICE</a>
    <p style="color:#a7a49b;font-size:13px;line-height:1.5;margin:28px 0 0">The link and code expire in 15 minutes and work once. If you didn't ask to sign in, ignore this email: nobody can sign in without it. Never share this code.</p>
  </div></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: `Breachpoint sign-in code: ${code}`, text, html }),
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

const pub = (u) => ({ id: u.id, name: u.name, email: u.email });
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

// ---------- callsign filter (same rules as js/names.js in the game) ----------
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
