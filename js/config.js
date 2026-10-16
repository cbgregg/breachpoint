// Breachpoint — game configuration and tuning constants

// UI colors are relative to the local player (friendly = blue, enemy = red), like modern military shooters.
export const FRIENDLY_CSS = '#4fb3ff';
export const ENEMY_CSS = '#ff4d4d';

export const TEAMS = [
  {
    id: 0, name: 'VANGUARD', label: 'Vanguard',
    // coyote / ranger-green operator kit
    kit: { shirt: 0x6f6553, pants: 0x5f5848, vest: 0x4d4a3a, pouch: 0x5b5644, helmet: 0x5e5a48, glove: 0x2b2a26, boot: 0x3a3127, accent: 0x3d4f63 },
  },
  {
    id: 1, name: 'SPECTRE', label: 'Spectre',
    // black / olive militia kit
    kit: { shirt: 0x2f322b, pants: 0x2b2c27, vest: 0x1f211c, pouch: 0x2a2b25, helmet: 0x26261f, glove: 0x1b1b19, boot: 0x1e1a16, accent: 0x5a2622 },
  },
];

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  crouchHeight: 1.2,
  eye: 1.62,
  crouchEye: 1.05,
  walk: 4.5,
  sprint: 6.6,
  tacSprint: 8.1,   // tactical sprint (double-tap sprint): faster, gun up, limited
  tacTime: 3,       // seconds of tactical sprint on a full charge
  tacRecharge: 3.5, // seconds to fully recharge (starts 1 s after you stop)
  crouchSpeed: 2.4,
  adsSpeedMult: 0.6,
  jump: 7.0,
  gravity: 22,
  accelGround: 55,
  accelAir: 12,
  stepHeight: 0.55,
  maxHealth: 100,
  regenDelay: 4.5,
  regenRate: 18,
  respawnDelay: 5,
  respawnMin: 1.5, // earliest you can press to respawn
  spawnProtect: 2.5,
  slideSpeed: 9.0,
  slideTime: 0.75,
};

export const GRENADE = { start: 1, max: 2, fuse: 3.2, radius: 7, damage: 140, throwSpeed: 17, cooldown: 0.9 };
export const MELEE = { damage: 100, range: 2.3, cooldown: 0.75, time: 0.4 };
export const SCORE = { kill: 100, headshot: 25, assist: 50, melee: 25 };

// spread values are cone half-angles in radians
// model.sight: holo | reflex | scope | iron
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'MK-4 Carbine', short: 'MK-4', mode: 'AUTO', auto: true, rpm: 750, damage: 24, headMult: 1.6,
    mag: 30, reserve: 150, reload: 2.2, spread: 0.03, adsSpread: 0.004, moveSpread: 0.03,
    recoilPitch: 0.011, recoilYaw: 0.006, range: 150, falloffStart: 35, falloffEnd: 80, falloffMin: 0.7,
    pellets: 1, adsFov: 50, adsTime: 0.22, botRange: [8, 40],
    model: { type: 'rifle', sight: 'holo' },
  },
  smg: {
    id: 'smg', name: 'VX-9 SMG', short: 'VX-9', mode: 'AUTO', auto: true, rpm: 880, damage: 19, headMult: 1.4,
    mag: 32, reserve: 160, reload: 1.9, spread: 0.04, adsSpread: 0.012, moveSpread: 0.015,
    recoilPitch: 0.009, recoilYaw: 0.008, range: 100, falloffStart: 14, falloffEnd: 40, falloffMin: 0.55,
    pellets: 1, adsFov: 55, adsTime: 0.16, botRange: [4, 22],
    model: { type: 'smg', sight: 'reflex' },
  },
  shotgun: {
    id: 'shotgun', name: 'M12 Pump', short: 'M12', mode: 'PUMP', auto: false, rpm: 70, damage: 16, headMult: 1.3,
    mag: 7, reserve: 35, reload: 2.8, spread: 0.085, adsSpread: 0.065, moveSpread: 0.02,
    recoilPitch: 0.055, recoilYaw: 0.01, range: 45, falloffStart: 7, falloffEnd: 22, falloffMin: 0.25,
    pellets: 9, adsFov: 58, adsTime: 0.2, botRange: [2, 12],
    model: { type: 'shotgun', sight: 'iron' },
  },
  sniper: {
    id: 'sniper', name: 'LR-50 Bolt', short: 'LR-50', mode: 'BOLT', auto: false, rpm: 45, damage: 95, headMult: 2.5,
    mag: 5, reserve: 25, reload: 3.0, spread: 0.09, adsSpread: 0.0004, moveSpread: 0.06,
    recoilPitch: 0.065, recoilYaw: 0.01, range: 300, falloffStart: 300, falloffEnd: 300, falloffMin: 1,
    pellets: 1, adsFov: 20, adsTime: 0.3, scope: true, botRange: [18, 80],
    model: { type: 'sniper', sight: 'scope' },
  },
  pistol: {
    id: 'pistol', name: 'P-45 Sidearm', short: 'P-45', mode: 'SEMI', auto: false, rpm: 400, damage: 30, headMult: 1.6,
    mag: 12, reserve: 60, reload: 1.5, spread: 0.022, adsSpread: 0.008, moveSpread: 0.015,
    recoilPitch: 0.018, recoilYaw: 0.006, range: 100, falloffStart: 18, falloffEnd: 45, falloffMin: 0.6,
    pellets: 1, adsFov: 58, adsTime: 0.14, botRange: [3, 25],
    model: { type: 'pistol', sight: 'iron' },
  },
  // ---- added weapons (procedural "alpha" models built on the base types, each with its own look) ----
  kv47: {
    id: 'kv47', name: 'KV-47', short: 'KV-47', mode: 'AUTO', auto: true, rpm: 600, damage: 30, headMult: 1.5,
    mag: 30, reserve: 150, reload: 2.4, spread: 0.035, adsSpread: 0.006, moveSpread: 0.035,
    recoilPitch: 0.015, recoilYaw: 0.009, range: 150, falloffStart: 30, falloffEnd: 75, falloffMin: 0.7,
    pellets: 1, adsFov: 52, adsTime: 0.24, botRange: [8, 40],
    model: { type: 'rifle', sight: 'iron', look: { wood: true, metal: 0x3a3a38, curved: true, gastube: true } },
  },
  br308: {
    id: 'br308', name: 'BR-308 Battle Rifle', short: 'BR-308', mode: 'AUTO', auto: true, rpm: 520, damage: 36, headMult: 1.6,
    mag: 20, reserve: 120, reload: 2.5, spread: 0.038, adsSpread: 0.004, moveSpread: 0.04,
    recoilPitch: 0.019, recoilYaw: 0.008, range: 180, falloffStart: 45, falloffEnd: 100, falloffMin: 0.75,
    pellets: 1, adsFov: 48, adsTime: 0.26, botRange: [10, 50],
    model: { type: 'rifle', sight: 'holo', look: { tan: true, long: 0.1, riser: true } },
  },
  hx60: {
    id: 'hx60', name: 'HX-60 LMG', short: 'HX-60', mode: 'AUTO', auto: true, rpm: 650, damage: 27, headMult: 1.4,
    mag: 100, reserve: 200, reload: 5.4, spread: 0.048, adsSpread: 0.008, moveSpread: 0.055,
    recoilPitch: 0.010, recoilYaw: 0.009, range: 160, falloffStart: 35, falloffEnd: 90, falloffMin: 0.7,
    pellets: 1, adsFov: 50, adsTime: 0.38, botRange: [8, 45],
    model: { type: 'rifle', sight: 'reflex', look: { olive: true, box: true, bipod: true, long: 0.06, shroud: true } },
  },
  krv45: {
    id: 'krv45', name: 'KRV-45', short: 'KRV-45', mode: 'AUTO', auto: true, rpm: 1100, damage: 17, headMult: 1.35,
    mag: 25, reserve: 150, reload: 1.7, spread: 0.042, adsSpread: 0.014, moveSpread: 0.012,
    recoilPitch: 0.008, recoilYaw: 0.01, range: 90, falloffStart: 10, falloffEnd: 30, falloffMin: 0.5,
    pellets: 1, adsFov: 56, adsTime: 0.15, botRange: [3, 18],
    model: { type: 'smg', sight: 'reflex', look: { furniture: 0x2f3a46 } },
  },
  mr14: {
    id: 'mr14', name: 'MR-14 DMR', short: 'MR-14', mode: 'SEMI', auto: false, rpm: 300, damage: 48, headMult: 2.0,
    mag: 15, reserve: 75, reload: 2.5, spread: 0.05, adsSpread: 0.0015, moveSpread: 0.05,
    recoilPitch: 0.03, recoilYaw: 0.008, range: 220, falloffStart: 60, falloffEnd: 150, falloffMin: 0.8,
    pellets: 1, adsFov: 32, adsTime: 0.28, botRange: [14, 70],
    model: { type: 'rifle', sight: 'acog', look: { wood: true, metal: 0x4a4d50, long: 0.14, riser: true } },
  },
  sa12: {
    id: 'sa12', name: 'SA-12 Auto Shotgun', short: 'SA-12', mode: 'AUTO', auto: true, rpm: 260, damage: 11, headMult: 1.25,
    mag: 10, reserve: 40, reload: 3.2, spread: 0.095, adsSpread: 0.075, moveSpread: 0.02,
    recoilPitch: 0.04, recoilYaw: 0.014, range: 40, falloffStart: 6, falloffEnd: 18, falloffMin: 0.2,
    pellets: 8, adsFov: 58, adsTime: 0.22, botRange: [2, 11],
    model: { type: 'shotgun', sight: 'iron', look: { furniture: 0x2b2d2a, drum: true } },
  },
  d50: {
    id: 'd50', name: 'D-50 Hand Cannon', short: 'D-50', mode: 'SEMI', auto: false, rpm: 220, damage: 55, headMult: 1.8,
    mag: 7, reserve: 35, reload: 1.9, spread: 0.03, adsSpread: 0.009, moveSpread: 0.02,
    recoilPitch: 0.05, recoilYaw: 0.012, range: 110, falloffStart: 20, falloffEnd: 50, falloffMin: 0.6,
    pellets: 1, adsFov: 56, adsTime: 0.17, botRange: [3, 28],
    model: { type: 'pistol', sight: 'iron', look: { metal: 0xb8b8b4, big: true } },
  },
  r357: {
    id: 'r357', name: 'R-357 Revolver', short: 'R-357', mode: 'SEMI', auto: false, rpm: 160, damage: 62, headMult: 1.7,
    mag: 6, reserve: 30, reload: 2.6, spread: 0.028, adsSpread: 0.008, moveSpread: 0.02,
    recoilPitch: 0.055, recoilYaw: 0.01, range: 110, falloffStart: 22, falloffEnd: 50, falloffMin: 0.6,
    pellets: 1, adsFov: 56, adsTime: 0.17, botRange: [3, 28],
    model: { type: 'pistol', sight: 'iron', look: { metal: 0x2b2b2e, grip: 0x6a3a1e, revolver: true } },
  },
  mp18: {
    id: 'mp18', name: 'MP-18 Machine Pistol', short: 'MP-18', mode: 'AUTO', auto: true, rpm: 1000, damage: 17, headMult: 1.35,
    mag: 20, reserve: 100, reload: 1.6, spread: 0.035, adsSpread: 0.016, moveSpread: 0.012,
    recoilPitch: 0.008, recoilYaw: 0.01, range: 70, falloffStart: 8, falloffEnd: 22, falloffMin: 0.5,
    pellets: 1, adsFov: 58, adsTime: 0.13, botRange: [2, 14],
    model: { type: 'pistol', sight: 'iron', look: { metal: 0x3d4a3a, extMag: true } },
  },
  monte: {
    // "The Monte": shoulder rocket launcher. Fires a real rocket that flies and explodes on impact.
    id: 'monte', name: 'The Monte', short: 'MONTE', mode: 'ROCKET', auto: false, rpm: 40, damage: 0, headMult: 1,
    mag: 1, reserve: 3, reload: 3.4, spread: 0.02, adsSpread: 0.003, moveSpread: 0.03,
    recoilPitch: 0.06, recoilYaw: 0.01, range: 200, falloffStart: 200, falloffEnd: 200, falloffMin: 1,
    pellets: 1, adsFov: 50, adsTime: 0.36, botRange: [10, 50],
    rocket: { speed: 48, radius: 6.5, damage: 165, direct: 60 },
    model: { type: 'launcher', sight: 'iron' },
  },
};

export const PRIMARIES = ['rifle', 'kv47', 'br308', 'hx60', 'smg', 'krv45', 'shotgun', 'sa12', 'mr14', 'sniper'];
export const SECONDARIES = ['pistol', 'd50', 'r357', 'mp18', 'monte'];
export const typeOf = (id) => (WEAPONS[id] && WEAPONS[id].model.type) || 'rifle';

// fov = half-angle (radians) of the bot's vision cone
export const DIFFICULTY = {
  easy: { spot: 1.3, reaction: 0.85, aimError: 0.12, aimFloor: 0.6, lag: 0.32, turnRate: 3.0, headChance: 0.05, burst: [0.12, 0.3], pause: [0.45, 0.9], semiDelay: 0.45, sight: 50, fov: 0.9 },
  normal: { spot: 2.0, reaction: 0.55, aimError: 0.08, aimFloor: 0.45, lag: 0.2, turnRate: 5.0, headChance: 0.15, burst: [0.18, 0.45], pause: [0.25, 0.55], semiDelay: 0.25, sight: 70, fov: 1.1 },
  hard: { spot: 3.0, reaction: 0.3, aimError: 0.045, aimFloor: 0.3, lag: 0.1, turnRate: 8, headChance: 0.3, burst: [0.25, 0.7], pause: [0.12, 0.3], semiDelay: 0.1, sight: 90, fov: 1.3 },
};

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, shadows: 1024, softShadows: false, shadowEvery: 2, ao: false, bloom: true, aa: false, lights: false, motes: 0, aniso: 4 },
  medium: { label: 'Medium', pixelRatio: 1, shadows: 2048, softShadows: true, shadowEvery: 2, ao: false, bloom: true, aa: true, lights: true, motes: 140, aniso: 8 },
  high: { label: 'High', pixelRatio: 1.25, shadows: 4096, softShadows: true, shadowEvery: 2, ao: true, bloom: true, aa: true, lights: true, motes: 220, aniso: 8 },
  ultra: { label: 'Ultra', pixelRatio: 2, shadows: 4096, softShadows: true, shadowEvery: 1, ao: true, bloom: true, aa: true, lights: true, motes: 300, aniso: 16 },
};
// Custom graphics: each preset written out as the individual settings (render resolution is % of the
// screen's native pixels, so it means the same thing on every display), and the reverse for 'custom'.
const dprNow = () => (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
const isTouch = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
export function presetGfx(name) {
  const q = QUALITY[name] || QUALITY.high, dpr = dprNow();
  const pr = Math.min(dpr, isTouch() ? Math.max(1.25, q.pixelRatio) : q.pixelRatio);
  return {
    gfxRes: Math.round(pr / dpr * 20) * 5, gfxShadows: String(q.shadows), gfxSoftShadows: q.softShadows !== false,
    gfxShadowRate: q.shadowEvery === 1 ? 'full' : 'half', gfxAO: q.ao, gfxBloom: q.bloom, gfxAA: q.aa, gfxLights: q.lights,
    gfxDust: String(q.motes), gfxAniso: String(q.aniso),
  };
}
export function qualityFrom(s) {
  if (s.quality !== 'custom') { const q = QUALITY[s.quality] || QUALITY.high, dpr = dprNow(); return { ...q, pr: Math.min(dpr, isTouch() ? Math.max(1.25, q.pixelRatio) : q.pixelRatio) }; }
  const d = presetGfx('high'), v = (k) => s[k] ?? d[k];
  return {
    label: 'Custom', pr: Math.max(0.25, dprNow() * Math.min(200, Math.max(50, +v('gfxRes'))) / 100),
    shadows: +v('gfxShadows') || 0, softShadows: !!v('gfxSoftShadows'), shadowEvery: v('gfxShadowRate') === 'full' ? 1 : 2,
    ao: !!v('gfxAO'), bloom: !!v('gfxBloom'), aa: !!v('gfxAA'), lights: !!v('gfxLights'), motes: +v('gfxDust') || 0, aniso: +v('gfxAniso') || 1,
  };
}

const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

// TURN relay (hides players' IP addresses). URL of the Cloudflare Worker in cloudflare/turn-worker.js,
// e.g. 'https://breachpoint-turn.<you>.workers.dev'. Empty = direct peer-to-peer only.
export const TURN_ENDPOINT = 'https://breachpoint-turn.broad-mouse-d2f9.workers.dev';

// Online accounts (passwordless email sign-in). URL of the Cloudflare Worker in cloudflare/auth-worker.js,
// e.g. 'https://breachpoint-auth.<you>.workers.dev'. Empty = accounts off: online play needs no sign-in.
export const AUTH_ENDPOINT = 'https://breachpoint-auth.broad-mouse-d2f9.workers.dev';

// Quick match (public) rules: the same for every public lobby
export const PUBLIC_MATCH = { fillBots: true, mode: 'tdm', teamSize: 6, difficulty: 'normal', scoreLimit: 75, timeLimit: 10, friendlyFire: false, map: 'random' };

// Optional: your own music files (paths in the repo, e.g. 'assets/music/menu.mp3'). null = the built-in score.
export const MUSIC_FILES = { menu: null, action: null };

export const DEFAULT_SETTINGS = {
  fpsCap: 0,           // 0 = unlimited (the display's refresh rate)
  fullscreen: true,    // desktop matches go fullscreen with the keyboard locked (so Ctrl+W crouches instead of closing the tab)
  fillBots: true, chat: true,
  musicVolume: 0.5,
  adsZoom: 1,          // multiplies each optic's magnification (0.5–1.5)
  sightSize: 'large',  // how much of the screen the sight fills when aiming: normal | large | huge
  privateRelay: false,
  touchSize: 'small',   // touch screens: size of the on-screen buttons (small leaves more room to look around)
  touchAds: 'toggle',   // touch screens: tap ADS once to aim, again to stop
  touchAutoFire: true,  // touch screens: fire automatically while the crosshair is on an enemy // route private matches through the TURN relay too (hides your IP)
  name: 'Operator',
  mode: 'tdm',       // tdm | gunfight | snd
  teamSize: 6,
  difficulty: 'normal',
  map: 'tarsa',
  scoreLimit: 75,
  timeLimit: 10,
  primary: 'rifle',
  sensitivity: 1,
  adsMode: 'hold', // 'hold' or 'toggle'
  fov: 80,
  volume: 0.7,
  showFps: false,
  friendlyFire: false,
  invertY: false,
  quality: coarse ? 'low' : 'high',
  dynamicRes: true,
  padSensitivity: 1,
  padDeadzone: 0.12,
  aimAssist: true,
  vibration: true,
};

export const BOT_NAMES = [
  'Viper', 'Ghost', 'Havoc', 'Rook', 'Maverick', 'Specter', 'Blaze', 'Nomad', 'Talon', 'Onyx',
  'Jinx', 'Reaper', 'Cipher', 'Atlas', 'Raven', 'Vortex', 'Bishop', 'Frost', 'Hex', 'Kestrel',
  'Striker', 'Wraith', 'Echo', 'Dozer', 'Sable', 'Mako', 'Flint', 'Ember', 'Quill', 'Rogue',
];

export const MAP_NAME = 'Tarsa Market';
