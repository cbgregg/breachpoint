// Breachpoint — game configuration and tuning constants

export const TEAMS = [
  { id: 0, name: 'BLUE', label: 'Blue Team', color: 0x2f7bff, dark: 0x173a73, css: '#3d8bff' },
  { id: 1, name: 'RED', label: 'Red Team', color: 0xff3b3b, dark: 0x6e1a1a, css: '#ff4a4a' },
];

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  crouchHeight: 1.2,
  eye: 1.62,
  crouchEye: 1.05,
  walk: 5.4,
  sprint: 8.2,
  crouchSpeed: 2.8,
  adsSpeedMult: 0.6,
  jump: 7.4,
  gravity: 22,
  accelGround: 60,
  accelAir: 14,
  stepHeight: 0.55,
  maxHealth: 100,
  regenDelay: 5,
  regenRate: 14,
  respawnDelay: 3.5,
  spawnProtect: 2.5,
};

export const GRENADE = {
  start: 2,
  max: 3,
  fuse: 2.3,
  radius: 7,
  damage: 130,
  throwSpeed: 17,
  cooldown: 0.9,
};

export const SCORE = { kill: 100, headshot: 25, assist: 50 };

// spread values are cone half-angles in radians
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'AR-7 Rifle', short: 'AR-7', auto: true, rpm: 620, damage: 25, headMult: 2.0,
    mag: 30, reserve: 150, reload: 2.1, spread: 0.028, adsSpread: 0.006, moveSpread: 0.03,
    recoilPitch: 0.014, recoilYaw: 0.006, range: 150, falloffStart: 35, falloffEnd: 80, falloffMin: 0.65,
    pellets: 1, adsFov: 55, adsTime: 0.2, scope: false, botRange: [8, 40],
    model: { body: [0.07, 0.11, 0.55], barrel: 0.32, mag: [0.05, 0.16, 0.08], stock: true, sight: 'red', color: 0x4b545e },
  },
  smg: {
    id: 'smg', name: 'VX-9 SMG', short: 'VX-9', auto: true, rpm: 900, damage: 18, headMult: 1.6,
    mag: 35, reserve: 175, reload: 1.8, spread: 0.04, adsSpread: 0.015, moveSpread: 0.02,
    recoilPitch: 0.01, recoilYaw: 0.008, range: 100, falloffStart: 15, falloffEnd: 45, falloffMin: 0.55,
    pellets: 1, adsFov: 62, adsTime: 0.15, scope: false, botRange: [4, 22],
    model: { body: [0.07, 0.12, 0.38], barrel: 0.12, mag: [0.04, 0.22, 0.05], stock: false, sight: 'red', color: 0x5a584c },
  },
  shotgun: {
    id: 'shotgun', name: 'M12 Shotgun', short: 'M12', auto: false, rpm: 70, damage: 14, headMult: 1.4,
    mag: 7, reserve: 35, reload: 2.6, spread: 0.09, adsSpread: 0.07, moveSpread: 0.02,
    recoilPitch: 0.06, recoilYaw: 0.01, range: 45, falloffStart: 6, falloffEnd: 22, falloffMin: 0.25,
    pellets: 9, adsFov: 65, adsTime: 0.18, scope: false, botRange: [2, 12],
    model: { body: [0.08, 0.1, 0.5], barrel: 0.45, mag: null, stock: true, sight: 'bead', color: 0x6b4d33 },
  },
  sniper: {
    id: 'sniper', name: 'LR-50 Sniper', short: 'LR-50', auto: false, rpm: 42, damage: 95, headMult: 2.5,
    mag: 5, reserve: 25, reload: 2.8, spread: 0.09, adsSpread: 0.0005, moveSpread: 0.06,
    recoilPitch: 0.07, recoilYaw: 0.01, range: 300, falloffStart: 300, falloffEnd: 300, falloffMin: 1,
    pellets: 1, adsFov: 22, adsTime: 0.28, scope: true, botRange: [18, 80],
    model: { body: [0.07, 0.11, 0.7], barrel: 0.55, mag: [0.05, 0.1, 0.1], stock: true, sight: 'scope', color: 0x4a5a40 },
  },
  pistol: {
    id: 'pistol', name: 'P-45 Pistol', short: 'P-45', auto: false, rpm: 380, damage: 28, headMult: 2.0,
    mag: 12, reserve: 72, reload: 1.4, spread: 0.022, adsSpread: 0.008, moveSpread: 0.02,
    recoilPitch: 0.02, recoilYaw: 0.006, range: 100, falloffStart: 18, falloffEnd: 45, falloffMin: 0.6,
    pellets: 1, adsFov: 65, adsTime: 0.14, scope: false, botRange: [3, 25],
    model: { body: [0.05, 0.1, 0.2], barrel: 0.04, mag: null, stock: false, sight: 'iron', color: 0x41464d },
  },
};

export const PRIMARIES = ['rifle', 'smg', 'shotgun', 'sniper'];

// fov = half-angle (radians) of the bot's vision cone
export const DIFFICULTY = {
  easy: { reaction: 0.85, aimError: 0.12, aimFloor: 0.6, lag: 0.32, turnRate: 3.0, headChance: 0.05, burst: [0.12, 0.3], pause: [0.45, 0.9], semiDelay: 0.45, sight: 50, fov: 0.9 },
  normal: { reaction: 0.55, aimError: 0.08, aimFloor: 0.45, lag: 0.2, turnRate: 5.0, headChance: 0.15, burst: [0.18, 0.45], pause: [0.25, 0.55], semiDelay: 0.25, sight: 70, fov: 1.1 },
  hard: { reaction: 0.3, aimError: 0.045, aimFloor: 0.3, lag: 0.1, turnRate: 8, headChance: 0.3, burst: [0.25, 0.7], pause: [0.12, 0.3], semiDelay: 0.1, sight: 90, fov: 1.3 },
};

export const DEFAULT_SETTINGS = {
  name: 'Player',
  teamSize: 6,
  difficulty: 'normal',
  scoreLimit: 75,
  timeLimit: 10,
  primary: 'rifle',
  sensitivity: 1,
  fov: 80,
  volume: 0.7,
  showFps: false,
  friendlyFire: false,
  invertY: false,
};

export const BOT_NAMES = [
  'Viper', 'Ghost', 'Havoc', 'Rook', 'Maverick', 'Specter', 'Blaze', 'Nomad', 'Talon', 'Onyx',
  'Jinx', 'Reaper', 'Cipher', 'Atlas', 'Raven', 'Vortex', 'Bishop', 'Frost', 'Hex', 'Kestrel',
  'Striker', 'Wraith', 'Echo', 'Dozer', 'Sable', 'Mako', 'Flint', 'Ember', 'Quill', 'Rogue',
];
