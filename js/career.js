// Career: score earned across matches on this device, and the level it gives (shown in lobbies).
// Level 1-55; each level needs a little more score than the last.
const KEY = 'breachpoint.career.v1';
export const MAX_LEVEL = 55;

export function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { xp: Math.max(0, c.xp | 0), kills: c.kills | 0, deaths: c.deaths | 0, wins: c.wins | 0, matches: c.matches | 0 };
  } catch (_) { return { xp: 0, kills: 0, deaths: 0, wins: 0, matches: 0 }; }
}

// score needed to reach a level: 0, 400, 1000, 1800 ... (about 100k for 55)
export const xpFor = (lv) => 100 * (lv - 1) * (lv + 2) / 2 * 0.8 | 0;
export function levelOf(xp) {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= xpFor(lv + 1)) lv++;
  return lv;
}

export function addMatch({ score = 0, kills = 0, deaths = 0, won = false }) {
  const c = loadCareer();
  const before = levelOf(c.xp);
  c.xp += Math.max(0, Math.min(20000, score | 0));
  c.kills += kills | 0; c.deaths += deaths | 0; c.wins += won ? 1 : 0; c.matches++;
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) { /* private mode */ }
  return { ...c, level: levelOf(c.xp), levelUp: levelOf(c.xp) > before };
}

// rank insignia for a level (drawn, no images): chevrons, then bars, then stars in a wreath
export function emblemSVG(lv) {
  lv = Math.max(1, Math.min(MAX_LEVEL, lv | 0));
  const gold = lv >= 30 ? '#e8b04a' : lv >= 10 ? '#cfd6dc' : '#b48a5a';
  let body = '';
  if (lv < 10) {
    const n = 1 + Math.min(2, (lv - 1) / 3 | 0);
    for (let i = 0; i < n; i++) body += `<path d="M5 ${11 + i * 5}l7-5 7 5v3l-7-5-7 5z" fill="${gold}"/>`;
  } else if (lv < 30) {
    const n = 1 + Math.min(3, (lv - 10) / 5 | 0);
    body += `<path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" fill="#2a3138" stroke="${gold}" stroke-width="1.2"/>`;
    for (let i = 0; i < n; i++) body += `<rect x="7.5" y="${7 + i * 3.4}" width="9" height="2" fill="${gold}"/>`;
  } else {
    const n = lv >= MAX_LEVEL ? 3 : 1 + Math.min(2, (lv - 30) / 9 | 0);
    body += `<path d="M5 18c-3-4-2-10 2-13M19 18c3-4 2-10-2-13" fill="none" stroke="${gold}" stroke-width="1.6" stroke-dasharray="2 1.4"/>`;
    const star = (x, y, r) => { let d = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; d += `${k ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(2)} ${(y + Math.sin(a) * rr).toFixed(2)}`; } return `<path d="${d}Z" fill="${gold}"/>`; };
    if (n === 1) body += star(12, 12, 5.5);
    else if (n === 2) body += star(9, 12, 4) + star(15, 12, 4);
    else body += star(12, 8.5, 3.8) + star(8, 15, 3.8) + star(16, 15, 3.8);
  }
  return `<svg class="emb" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
