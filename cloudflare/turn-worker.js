// Breachpoint TURN credential Worker (Cloudflare Workers + Cloudflare Realtime TURN).
//
// The game asks this Worker for short-lived TURN credentials, so player traffic in public matches
// goes through Cloudflare's relays and nobody sees anyone else's IP address. The TURN key's API
// token stays here as a Worker secret and never reaches the browser.
//
// Secrets / variables (Worker → Settings → Variables and Secrets):
//   TURN_KEY_ID          (text)    the TURN key ID from Realtime → TURN Server
//   TURN_KEY_API_TOKEN   (secret)  that TURN key's API token
//   ALLOWED_ORIGINS      (text, optional) comma-separated origins allowed to call this Worker,
//                                  default "https://cbgregg.github.io"

const TTL = 4 * 3600;               // credentials last 4 hours (longer than any match)
const PER_IP_PER_MINUTE = 10;       // light abuse guard (per Worker instance)
const hits = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://cbgregg.github.io').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (!okOrigin) return json({ error: 'origin not allowed' }, 403, cors);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now - rec.t > 60000) hits.set(ip, { t: now, n: 1 });
    else if (++rec.n > PER_IP_PER_MINUTE) return json({ error: 'slow down' }, 429, cors);
    if (hits.size > 5000) hits.clear();

    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: 'TURN key not configured' }, 500, cors);
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!res.ok) return json({ error: `TURN API ${res.status}` }, 502, cors);
    const data = await res.json();
    // browsers block port 53, so drop those URLs to avoid waiting on them
    const iceServers = (data.iceServers || []).map(s => ({
      ...s,
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => !/:53(\?|$)/.test(u)),
    })).filter(s => s.urls.length);
    return json({ iceServers, ttl: TTL }, 200, cors);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
